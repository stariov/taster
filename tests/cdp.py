#!/usr/bin/env python3
"""Drive the Taster UI in headless Chromium (minimal CDP client, stdlib only).
usage: reap.py 90 python3 -u cdp.py SCRIPT.py
SCRIPT runs with `ev(js)`, `shot(name)`, `call(method, **params)`, `sleep(s)`, `url`, `log` in its globals.
Env: TASTER_FAKE_PROTOCOL, TASTER_FAKE_EFFECT_MAX (see fake_device.py), NOFAKE=1 (real devices only),
TASTER_SHOTS=dir (keep screenshots)."""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request

import shutil, tempfile
TESTS = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(os.path.dirname(TESTS), "taster", "taster.py")
FAKE = os.path.join(TESTS, "fake_device.py")
HERE = tempfile.mkdtemp(prefix="taster-test-")   # runtime dir, config, browser profile; removed at the end
SHOTS = os.environ.get("TASTER_SHOTS") or os.path.join(HERE, "shots")
RUN = os.path.join(HERE, "run")
for d in (RUN, os.path.join(HERE, "cfg"), os.path.join(HERE, "chrome"), SHOTS):
    os.makedirs(d, exist_ok=True)

env = dict(os.environ, TASTER_FAKE=FAKE, TASTER_NO_BROWSER="1", XDG_RUNTIME_DIR=RUN,
           XDG_CONFIG_HOME=os.path.join(HERE, "cfg"), PYTHONDONTWRITEBYTECODE="1")
if os.environ.get("NOFAKE"):
    env.pop("TASTER_FAKE")
srv = subprocess.Popen([sys.executable, APP], env=env, stdout=subprocess.PIPE, text=True)
line = srv.stdout.readline()
url = line.strip().split(" at ", 1)[1]
print("server:", url)

prof = os.path.join(HERE, "chrome")
chrome = subprocess.Popen(["chromium", "--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run",
                           f"--user-data-dir={prof}", "--remote-debugging-port=0", "--window-size=1400,1000",
                           "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
port_file = os.path.join(prof, "DevToolsActivePort")
for _ in range(100):
    if os.path.exists(port_file) and open(port_file).read().strip():
        break
    time.sleep(0.1)
port = int(open(port_file).read().split()[0])
os.remove(port_file)
targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json"))
page = [t for t in targets if t["type"] == "page"][0]
wsurl = page["webSocketDebuggerUrl"]

host, path = wsurl[5:].split("/", 1)
h, p = host.split(":")
sock = socket.create_connection((h, int(p)))
key = base64.b64encode(os.urandom(16)).decode()
sock.send(f"GET /{path} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
          f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode())
buf = b""
while b"\r\n\r\n" not in buf:
    buf += sock.recv(4096)
buf = buf.split(b"\r\n\r\n", 1)[1]


def send(obj):
    data = json.dumps(obj).encode()
    hdr = bytearray([0x81])
    n = len(data)
    if n < 126:
        hdr.append(0x80 | n)
    elif n < 65536:
        hdr += bytes([0x80 | 126]) + struct.pack(">H", n)
    else:
        hdr += bytes([0x80 | 127]) + struct.pack(">Q", n)
    mask = os.urandom(4)
    sock.send(bytes(hdr) + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))


def recv_exact(n):
    global buf
    while len(buf) < n:
        buf += sock.recv(65536)
    out, buf = buf[:n], buf[n:]
    return out


def recv():
    msg = b""
    while True:
        b0, b1 = recv_exact(2)
        n = b1 & 0x7F
        if n == 126:
            n = struct.unpack(">H", recv_exact(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", recv_exact(8))[0]
        msg += recv_exact(n)
        if b0 & 0x80:
            return json.loads(msg)


log = []
_id = [0]


def call(method, **params):
    _id[0] += 1
    send({"id": _id[0], "method": method, "params": params})
    while True:
        m = recv()
        if m.get("method") == "Runtime.consoleAPICalled":
            log.append("console: " + " ".join(str(a.get("value", a.get("description"))) for a in m["params"]["args"]))
        elif m.get("method") == "Runtime.exceptionThrown":
            log.append("EXCEPTION: " + json.dumps(m["params"]["exceptionDetails"])[:600])
        if m.get("id") == _id[0]:
            if "error" in m:
                raise RuntimeError(m["error"])
            return m.get("result")


def ev(js):
    r = call("Runtime.evaluate", expression=js, awaitPromise=True, returnByValue=True)
    if r.get("exceptionDetails"):
        raise RuntimeError(json.dumps(r["exceptionDetails"])[:800])
    return r["result"].get("value")


def shot(name):
    r = call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
    path = os.path.join(SHOTS, name + ".png")
    open(path, "wb").write(base64.b64decode(r["data"]))
    return path


def sleep(s):
    time.sleep(s)


try:
    call("Runtime.enable")
    call("Page.enable")
    call("Page.navigate", url=url)
    time.sleep(1.5)
    exec(open(sys.argv[1]).read(), globals())
finally:
    for l in log:
        print(l)
    try:
        sock.close()
    except Exception:
        pass
    chrome.terminate()
    srv.terminate()
    chrome.wait(5)
    srv.wait(5)
    if not os.environ.get("TASTER_SHOTS"):
        print("screenshots (deleted now; set TASTER_SHOTS=dir to keep them):", os.listdir(SHOTS))
    shutil.rmtree(HERE, ignore_errors=True)
