#!/usr/bin/env python3
"""Taster: a keyboard configurator for QMK/VIA keyboards (e.g. Keychron Q-series).

Runs a small web server on 127.0.0.1 and opens the editor in your browser.
The server talks to the keyboard through Linux hidraw. Python standard library only.
"""
import io
import json
import os
import secrets
import select
import shutil
import signal
import subprocess
import sys
import threading
import time
import zipfile
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

VERSION = "1.0.0"
APP_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(APP_DIR, "web")
BUNDLED_DEFS = os.path.join(APP_DIR, "definitions")
CONFIG_DIR = os.path.join(os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config"), "taster")
USER_DEFS = os.path.join(CONFIG_DIR, "definitions")
RUNTIME_DIR = os.environ.get("XDG_RUNTIME_DIR")
RUNTIME_FILE = os.path.join(RUNTIME_DIR, "taster.json") if RUNTIME_DIR else None

REPORT_SIZE = 32
# Usage Page 0xFF60, Usage 0x61: the raw HID interface VIA-enabled QMK firmware exposes.
VIA_SIGNATURE = bytes([0x06, 0x60, 0xFF, 0x09, 0x61])

MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json"}


# ---------------------------------------------------------------- devices

def _read(path, mode="r"):
    try:
        with open(path, mode) as f:
            return f.read()
    except OSError:
        return None


def list_devices():
    """All hidraw nodes that speak the VIA protocol."""
    devices = []
    base = "/sys/class/hidraw"
    try:
        names = sorted(os.listdir(base), key=lambda n: int(n[6:]) if n[6:].isdigit() else 0)
    except OSError:
        names = []
    for name in names:
        desc = _read(f"{base}/{name}/device/report_descriptor", "rb")
        if not desc or VIA_SIGNATURE not in desc:
            continue
        uevent = _read(f"{base}/{name}/device/uevent") or ""
        info = dict(line.split("=", 1) for line in uevent.splitlines() if "=" in line)
        try:
            _bus, vid, pid = info.get("HID_ID", "0:0:0").split(":")
            vid, pid = int(vid, 16), int(pid, 16)
        except ValueError:
            continue
        node = f"/dev/{name}"
        label = info.get("HID_NAME", "Unknown keyboard").strip()
        words = label.split()
        if len(words) > 1 and words[0] == words[1]:  # "Keychron Keychron Q3" -> "Keychron Q3"
            label = " ".join(words[1:])
        devices.append({
            "path": node,
            "vid": vid,
            "pid": pid,
            "name": label,
            "exists": os.path.exists(node),
            "access": os.access(node, os.R_OK | os.W_OK),
        })
    if FAKE:
        devices.append(FAKE.info())
    return devices


class HidError(Exception):
    def __init__(self, kind, msg):
        super().__init__(msg)
        self.kind = kind


class Hid:
    """One open hidraw node. Commands are 32-byte reports; the firmware answers each one."""
    _lock = threading.Lock()
    _open = {}

    @classmethod
    def transact(cls, path, packets):
        with cls._lock:
            if FAKE and path == FAKE.PATH:
                return [list(FAKE.transact(bytes(_pad(p)))) for p in packets]
            if not path.startswith("/dev/hidraw") or not any(d["path"] == path for d in list_devices()):
                raise HidError("gone", "Keyboard not found. Is it plugged in?")
            for attempt in (1, 2):  # a replugged keyboard can reuse the node name: reopen once
                fd = cls._open.get(path)
                if fd is None:
                    try:
                        fd = os.open(path, os.O_RDWR | os.O_NONBLOCK)
                    except PermissionError:
                        raise HidError("permission", "No permission to talk to the keyboard.")
                    except OSError as e:
                        raise HidError("gone", f"Cannot open keyboard: {e.strerror}")
                    cls._open[path] = fd
                try:
                    return [cls._one(fd, _pad(p)) for p in packets]
                except OSError as e:
                    cls._close(path)
                    if attempt == 2:
                        raise HidError("gone", f"Keyboard connection lost: {e.strerror}")

    @staticmethod
    def _one(fd, packet):
        while True:  # drop stale input
            try:
                if not os.read(fd, 64):
                    break
            except BlockingIOError:
                break
        os.write(fd, bytes([0]) + bytes(packet))  # report ID 0 + 32 bytes
        deadline = time.monotonic() + 1.0
        while True:
            left = deadline - time.monotonic()
            if left <= 0:
                raise HidError("timeout", "The keyboard did not answer.")
            r, _, _ = select.select([fd], [], [], left)
            if not r:
                continue
            try:
                data = os.read(fd, 64)
            except BlockingIOError:
                continue
            if data and data[0] in (packet[0], 0xFF):
                return list(data[:REPORT_SIZE]) + [0] * (REPORT_SIZE - len(data))

    @classmethod
    def _close(cls, path):
        fd = cls._open.pop(path, None)
        if fd is not None:
            try:
                os.close(fd)
            except OSError:
                pass


def _pad(p):
    p = [int(b) & 0xFF for b in p][:REPORT_SIZE]
    return p + [0] * (REPORT_SIZE - len(p))


# ---------------------------------------------------------------- definitions

def _def_name(vid, pid):
    return f"{vid:04x}_{pid:04x}.json"


def load_definition(vid, pid):
    for folder, source in ((USER_DEFS, "user"), (BUNDLED_DEFS, "bundled")):
        text = _read(os.path.join(folder, _def_name(vid, pid)))
        if text:
            try:
                return {"source": source, "definition": json.loads(text)}
            except ValueError:
                continue
    return None


def parse_definition_upload(raw):
    """Accept a VIA definition as .json or as a .zip that contains one."""
    if raw[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".json")
                     and "__MACOSX" not in n and not os.path.basename(n).startswith(".")]
            if not names:
                raise ValueError("The zip file contains no .json definition.")
            raw = z.read(names[0])
    d = json.loads(raw.decode("utf-8-sig"))
    if not isinstance(d, dict) or "layouts" not in d or "matrix" not in d:
        raise ValueError("This is not a VIA keyboard definition (no 'layouts' or 'matrix').")
    vid = int(str(d.get("vendorId")), 16)
    pid = int(str(d.get("productId")), 16)
    return vid, pid, d


def save_definition(vid, pid, d):
    # remember parent folders we had to create, so the uninstaller can remove them again
    missing, p = [], os.path.dirname(CONFIG_DIR)
    while not os.path.isdir(p):
        missing.append(p)
        p = os.path.dirname(p)
    os.makedirs(USER_DEFS, exist_ok=True)
    if missing:
        with open(os.path.join(CONFIG_DIR, "created-folders"), "a") as f:
            f.writelines(m + "\n" for m in missing)
    tmp = os.path.join(USER_DEFS, ".tmp")
    with open(tmp, "w") as f:
        json.dump(d, f, indent=1)
    os.replace(tmp, os.path.join(USER_DEFS, _def_name(vid, pid)))


def delete_definition(vid, pid):
    try:
        os.remove(os.path.join(USER_DEFS, _def_name(vid, pid)))
    except FileNotFoundError:
        pass
    # leave nothing behind: drop our config folders (and parents we created) when they are empty
    try:
        os.rmdir(USER_DEFS)
    except OSError:
        return
    created = _read(os.path.join(CONFIG_DIR, "created-folders")) or ""
    try:
        os.remove(os.path.join(CONFIG_DIR, "created-folders"))
    except FileNotFoundError:
        pass
    for folder in [CONFIG_DIR] + created.split():
        try:
            os.rmdir(folder)
        except OSError:
            break


# ---------------------------------------------------------------- web server

class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, token):
        super().__init__(("127.0.0.1", 0), Handler)
        self.token = token
        self.port = self.server_address[1]
        self.clients = 0
        self.last_client = time.monotonic()
        self.stopping = threading.Event()


class Handler(BaseHTTPRequestHandler):
    server: Server
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        if os.environ.get("TASTER_DEBUG"):
            super().log_message(*args)

    # --- helpers
    def _send(self, status, body=b"", ctype="application/json", extra=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, obj, status=200):
        self._send(status, json.dumps(obj).encode())

    def _error(self, kind, msg, status=400):
        self._json({"error": kind, "message": msg}, status)

    def _host_ok(self):
        # blocks DNS-rebinding: only our own address may be used to reach us
        return self.headers.get("Host") in (f"127.0.0.1:{self.server.port}", f"localhost:{self.server.port}")

    def _api_ok(self, query):
        token = self.headers.get("X-Taster-Token") or query.get("token", [""])[0]
        return secrets.compare_digest(token, self.server.token)

    def _body(self, limit=4 * 1024 * 1024):
        n = int(self.headers.get("Content-Length") or 0)
        if n > limit:
            raise ValueError("Request too large.")
        return self.rfile.read(n)

    # --- routing
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def do_DELETE(self):
        self._route("DELETE")

    def _route(self, method):
        if not self._host_ok():
            return self._send(HTTPStatus.FORBIDDEN, b"forbidden", "text/plain")
        url = urlparse(self.path)
        q = parse_qs(url.query)
        if not url.path.startswith("/api/"):
            if method in ("GET",):
                return self._static(url.path)
            return self._send(HTTPStatus.METHOD_NOT_ALLOWED)
        if not self._api_ok(q):
            return self._error("token", "Invalid session. Start Taster again.", 403)
        try:
            handler = getattr(self, "api_" + method.lower() + "_" + url.path[5:].replace("/", "_"), None)
            if handler is None:
                return self._error("notfound", "Unknown API call.", 404)
            handler(q)
        except HidError as e:
            self._error(e.kind, str(e), 409)
        except (ValueError, KeyError, TypeError) as e:
            self._error("bad", str(e) or "Bad request.")
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _static(self, path):
        if path == "/":
            path = "/index.html"
        full = os.path.realpath(os.path.join(WEB_DIR, path.lstrip("/")))
        if not full.startswith(os.path.realpath(WEB_DIR) + os.sep) or not os.path.isfile(full):
            return self._send(HTTPStatus.NOT_FOUND, b"not found", "text/plain")
        with open(full, "rb") as f:
            body = f.read()
        csp = ("default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
               "object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self._send(200, body, MIME.get(os.path.splitext(full)[1], "application/octet-stream"),
                   {"Content-Security-Policy": csp})

    # --- API
    def api_get_devices(self, q):
        self._json({"version": VERSION, "devices": list_devices()})

    def api_post_hid(self, q):
        req = json.loads(self._body())
        packets = req["packets"]
        if not isinstance(packets, list) or len(packets) > 2048:
            raise ValueError("Bad packet list.")
        self._json({"responses": Hid.transact(str(req["path"]), packets)})

    def api_get_definition(self, q):
        vid, pid = int(q["vid"][0]), int(q["pid"][0])
        d = load_definition(vid, pid)
        if d is None:
            return self._error("nodef", "No definition for this keyboard.", 404)
        self._json(d)

    def api_post_definition(self, q):
        try:
            vid, pid, d = parse_definition_upload(self._body())
        except zipfile.BadZipFile:
            raise ValueError("The zip file is damaged.")
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError("That file is not valid JSON.")
        save_definition(vid, pid, d)
        self._json({"source": "user", "definition": d, "vid": vid, "pid": pid})

    def api_delete_definition(self, q):
        delete_definition(int(q["vid"][0]), int(q["pid"][0]))
        self._json({"ok": True})

    def api_post_quit(self, q):
        self._json({"ok": True})
        self.server.stopping.set()

    def api_get_events(self, q):
        """Long-lived stream; while at least one page holds one open, the server keeps running."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        srv = self.server
        srv.clients += 1
        try:
            self.wfile.write(b"retry: 2000\n\n")
            self.wfile.flush()
            while not srv.stopping.wait(10):
                self.wfile.write(b": keepalive\n\n")
                self.wfile.flush()
            self.wfile.write(b"event: quit\ndata: {}\n\n")
            self.wfile.flush()
        except OSError:
            pass
        finally:
            srv.clients -= 1
            srv.last_client = time.monotonic()
            self.close_connection = True


# ---------------------------------------------------------------- launcher

def find_running():
    """URL of an instance that is already running for this user, if any."""
    if not RUNTIME_FILE:
        return None
    try:
        with open(RUNTIME_FILE) as f:
            info = json.load(f)
        os.kill(int(info["pid"]), 0)
        cmd = _read(f"/proc/{int(info['pid'])}/cmdline") or ""
        return info["url"] if "taster" in cmd else None
    except (OSError, ValueError, KeyError):
        return None


def open_browser(url):
    print(f"Taster is running at {url}", flush=True)
    if os.environ.get("TASTER_NO_BROWSER"):
        return
    # an app window looks like a normal program; any browser works as a fallback
    for b in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable",
              "brave-browser", "microsoft-edge"):
        exe = shutil.which(b)
        if exe:
            cmd = [exe, f"--app={url}"]
            break
    else:
        cmd = ["xdg-open", url]
    try:
        p = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True)
        threading.Thread(target=p.wait, daemon=True).start()  # reap it when it exits
    except OSError:
        pass


def serve():
    running = find_running()
    if running:
        open_browser(running)
        return
    token = secrets.token_urlsafe(24)
    srv = Server(token)
    url = f"http://127.0.0.1:{srv.port}/#{token}"
    if RUNTIME_FILE:
        fd = os.open(RUNTIME_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump({"pid": os.getpid(), "url": url}, f)
    signal.signal(signal.SIGTERM, lambda *a: srv.stopping.set())
    signal.signal(signal.SIGINT, lambda *a: srv.stopping.set())
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    open_browser(url)
    started = time.monotonic()
    try:
        while not srv.stopping.wait(1):
            idle = time.monotonic() - srv.last_client
            if srv.clients == 0 and idle > 15 and time.monotonic() - started > 60:
                break  # every window closed (15 s grace for reloads)
    finally:
        srv.stopping.set()
        time.sleep(0.3)
        srv.shutdown()
        if RUNTIME_FILE and find_running() == url:
            os.remove(RUNTIME_FILE)
        for path in list(Hid._open):
            Hid._close(path)


FAKE = None


def main():
    global FAKE
    args = sys.argv[1:]
    if args and args[0] in ("-h", "--help"):
        print("usage: taster              open the keyboard editor\n"
              "       taster --stop       stop a running Taster\n"
              "       taster --uninstall  remove Taster completely\n"
              "       taster --version")
        return
    if args and args[0] == "--version":
        print(VERSION)
        return
    if args and args[0] == "--stop":
        if find_running():
            with open(RUNTIME_FILE) as f:
                os.kill(int(json.load(f)["pid"]), signal.SIGTERM)
        return
    if args and args[0] == "--uninstall":
        os.execv("/bin/bash", ["bash", os.path.join(APP_DIR, "uninstall.sh")])
    if os.environ.get("TASTER_FAKE"):  # development only: simulated keyboard
        import importlib.util
        spec = importlib.util.spec_from_file_location("fake_device", os.environ["TASTER_FAKE"])
        FAKE = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(FAKE)
    serve()


if __name__ == "__main__":
    main()
