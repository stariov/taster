"""A simulated VIA keyboard (Keychron Q3 ANSI knob) for development and tests.
Used when TASTER_FAKE points to this file. Not installed."""
import os
import random
import time

PATH = "/fake/q3"
VID, PID = 0x3434, 0x0121
ROWS, COLS, LAYERS = 6, 16, 4
PROTOCOL = int(os.environ.get("TASTER_FAKE_PROTOCOL", "12"))
# lighting command format: "legacy" (no channel byte) or "channels". Protocol 11 firmware exists with both.
CHANNELS = os.environ.get("TASTER_FAKE_LIGHTING", "channels" if PROTOCOL >= 11 else "legacy") == "channels"
LEGACY = {0x80: 1, 0x81: 2, 0x82: 3, 0x83: 4}
EFFECT_MAX = int(os.environ.get("TASTER_FAKE_EFFECT_MAX", "22"))  # last effect the firmware has


def _store(vid, data):
    if vid == 2 and data:  # like QMK: unknown effects fall back to the last one
        data = [min(data[0], EFFECT_MAX)]
    S.rgb[vid] = list(data)
MACRO_COUNT, MACRO_SIZE = 16, 1024


def _kc():
    k = {"NO": 0, "TRNS": 1}
    for i, c in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ"):
        k[c] = 4 + i
    for i, c in enumerate("1234567890"):
        k[c] = 0x1E + i
    names = ["ENT", "ESC", "BSPC", "TAB", "SPC", "MINS", "EQL", "LBRC", "RBRC", "BSLS", "NUHS",
             "SCLN", "QUOT", "GRV", "COMM", "DOT", "SLSH", "CAPS"]
    for i, n in enumerate(names):
        k[n] = 0x28 + i
    for i in range(12):
        k[f"F{i+1}"] = 0x3A + i
    for i, n in enumerate(["PSCR", "SCRL", "PAUS", "INS", "HOME", "PGUP", "DEL", "END", "PGDN",
                           "RGHT", "LEFT", "DOWN", "UP"]):
        k[n] = 0x46 + i
    k.update(APP=0x65, MUTE=0xA8, VOLU=0xA9, VOLD=0xAA, MPLY=0xAE, MNXT=0xAB, MPRV=0xAC,
             BRIU=0xBD, BRID=0xBE, LCTL=0xE0, LSFT=0xE1, LALT=0xE2, LGUI=0xE3, RCTL=0xE4,
             RSFT=0xE5, RALT=0xE6, RGUI=0xE7, MO1=0x5221, RGB_TOG=0x7820, RGB_MOD=0x7821,
             RGB_VAI=0x7827, RGB_VAD=0x7828, RGB_HUI=0x7823, RGB_SPI=0x7829)
    return k


K = _kc()
LAYER0 = {
    (0, 0): "ESC", **{(0, i): f"F{i}" for i in range(1, 13)}, (0, 13): "MUTE", (0, 14): "PSCR",
    (0, 15): "SCRL", (3, 14): "PAUS",
    (1, 0): "GRV", **{(1, i): "1234567890"[i - 1] for i in range(1, 11)}, (1, 11): "MINS",
    (1, 12): "EQL", (1, 13): "BSPC", (1, 14): "INS", (1, 15): "HOME", (3, 15): "PGUP",
    (2, 0): "TAB", **{(2, i): "QWERTYUIOP"[i - 1] for i in range(1, 11)}, (2, 11): "LBRC",
    (2, 12): "RBRC", (2, 13): "BSLS", (2, 14): "DEL", (2, 15): "END", (3, 12): "PGDN",
    (3, 0): "CAPS", **{(3, i): "ASDFGHJKL"[i - 1] for i in range(1, 10)}, (3, 10): "SCLN",
    (3, 11): "QUOT", (3, 13): "ENT",
    (4, 0): "LSFT", **{(4, i): "ZXCVBNM"[i - 2] for i in range(2, 9)}, (4, 9): "COMM",
    (4, 10): "DOT", (4, 11): "SLSH", (4, 13): "RSFT", (4, 15): "UP",
    (5, 0): "LCTL", (5, 1): "LGUI", (5, 2): "LALT", (5, 6): "SPC", (5, 10): "RALT",
    (5, 11): "MO1", (5, 12): "APP", (5, 13): "RCTL", (5, 14): "LEFT", (5, 15): "DOWN",
    (4, 14): "RGHT",
}
LAYER1 = {(0, 1): "BRID", (0, 2): "BRIU", (0, 13): "RGB_TOG", (2, 1): "RGB_TOG", (2, 2): "RGB_MOD",
          (2, 3): "RGB_VAI", (2, 4): "RGB_HUI", (3, 2): "RGB_VAD"}


class State:
    def __init__(self):
        self.reset()
        self.macros = bytearray(MACRO_SIZE)
        self.layout_options = 0
        self.rgb = {1: [200], 2: [4], 3: [128], 4: [170, 255]}
        self.start = time.time()

    def reset(self):
        self.keymap = [[[0] * COLS for _ in range(ROWS)] for _ in range(LAYERS)]
        for (r, c), n in LAYER0.items():
            self.keymap[0][r][c] = K[n]
        for layer in range(1, LAYERS):
            for r in range(ROWS):
                for c in range(COLS):
                    self.keymap[layer][r][c] = K["TRNS"] if (r, c) in LAYER0 else 0
        for (r, c), n in LAYER1.items():
            self.keymap[1][r][c] = K[n]
        self.encoders = [[[K["VOLD"], K["VOLU"]]] for _ in range(LAYERS)]
        self.encoders[1][0] = [K["RGB_VAD"], K["RGB_VAI"]]

    def flat(self):
        out = bytearray()
        for layer in self.keymap:
            for row in layer:
                for kc in row:
                    out += kc.to_bytes(2, "big")
        return out

    def set_flat(self, offset, data):
        buf = self.flat()
        buf[offset:offset + len(data)] = data
        for i in range(0, len(buf), 2):
            n = i // 2
            layer, rest = divmod(n, ROWS * COLS)
            r, c = divmod(rest, COLS)
            self.keymap[layer][r][c] = int.from_bytes(buf[i:i + 2], "big")


S = State()


def info():
    return {"path": PATH, "vid": VID, "pid": PID, "name": "Keychron Q3 (simulated)",
            "exists": True, "access": True}


def transact(p):
    p = bytearray(p)
    r = bytearray(p)
    cmd = p[0]
    if cmd == 0x01:
        r[1:3] = PROTOCOL.to_bytes(2, "big")
    elif cmd == 0x02:
        vid = p[1]
        if vid == 0x01:
            r[2:6] = int((time.time() - S.start) * 1000).to_bytes(4, "big")
        elif vid == 0x02:
            r[2:6] = S.layout_options.to_bytes(4, "big")
        elif vid == 0x03:
            # simulate a pressed key now and then so the key tester has something to show
            for row in range(ROWS):
                val = 0
                if random.random() < 0.15:
                    val = 1 << random.randrange(COLS)
                r[2 + row * 2:4 + row * 2] = val.to_bytes(2, "big")
        elif vid == 0x04:
            r[2:6] = (0x00010007).to_bytes(4, "big")
        else:
            r[0] = 0xFF
    elif cmd == 0x03:
        if p[1] == 0x02:
            S.layout_options = int.from_bytes(p[2:6], "big")
    elif cmd == 0x04:
        r[4:6] = S.keymap[p[1]][p[2]][p[3]].to_bytes(2, "big")
    elif cmd == 0x05:
        S.keymap[p[1]][p[2]][p[3]] = int.from_bytes(p[4:6], "big")
    elif cmd == 0x06:
        S.reset()
    elif cmd == 0x07 and not CHANNELS:  # old firmware: [cmd, value id, data]; anything else is echoed and ignored
        if p[1] in LEGACY:
            v = S.rgb[LEGACY[p[1]]]
            _store(LEGACY[p[1]], list(p[2:2 + len(v)]))
    elif cmd == 0x08 and not CHANNELS:
        if p[1] in LEGACY:
            v = S.rgb[LEGACY[p[1]]]
            r[2:2 + len(v)] = bytes(v)
    elif cmd == 0x07:
        if p[1] == 3 and p[2] in S.rgb:
            _store(p[2], list(p[3:3 + len(S.rgb[p[2]])]))
        else:
            r[0] = 0xFF
    elif cmd == 0x08:
        if p[1] == 3 and p[2] in S.rgb:
            v = S.rgb[p[2]]
            r[3:3 + len(v)] = bytes(v)
        elif p[1] not in LEGACY:  # like a Q3 on v1.7: old-format ids are echoed back with zeros
            r[0] = 0xFF
    elif cmd == 0x09:
        pass
    elif cmd == 0x0A:
        S.__init__()
    elif cmd == 0x0B:
        pass
    elif cmd == 0x0C:
        r[1] = MACRO_COUNT
    elif cmd == 0x0D:
        r[1:3] = MACRO_SIZE.to_bytes(2, "big")
    elif cmd == 0x0E:
        off, n = int.from_bytes(p[1:3], "big"), p[3]
        chunk = S.macros[off:off + n]
        r[4:4 + len(chunk)] = chunk
    elif cmd == 0x0F:
        off, n = int.from_bytes(p[1:3], "big"), p[3]
        S.macros[off:off + n] = p[4:4 + n]
    elif cmd == 0x10:
        S.macros = bytearray(MACRO_SIZE)
    elif cmd == 0x11:
        r[1] = LAYERS
    elif cmd == 0x12:
        off, n = int.from_bytes(p[1:3], "big"), p[3]
        chunk = S.flat()[off:off + n]
        r[4:4 + len(chunk)] = chunk
    elif cmd == 0x13:
        off, n = int.from_bytes(p[1:3], "big"), p[3]
        S.set_flat(off, p[4:4 + n])
    elif cmd == 0x14:
        r[4:6] = S.encoders[p[1]][p[2]][p[3]].to_bytes(2, "big")
    elif cmd == 0x15:
        S.encoders[p[1]][p[2]][p[3]] = int.from_bytes(p[4:6], "big")
    else:
        r[0] = 0xFF
    return bytes(r)
