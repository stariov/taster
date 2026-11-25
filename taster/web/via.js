"use strict";
// Talks the VIA protocol with the keyboard, through the local Taster server.

const API = {
  token: location.hash.slice(1),
  async call(method, path, body, raw = false) {
    const opts = {method, headers: {"X-Taster-Token": API.token}};
    if (body !== undefined) opts.body = raw ? body : JSON.stringify(body);
    let res;
    try {
      res = await fetch("/api/" + path, opts);
    } catch (e) {
      throw Object.assign(new Error("Taster is not running any more. Start it again from your app menu."), {kind: "server"});
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || `Error ${res.status}`), {kind: data.error || "http"});
    return data;
  },
};

const CMD = {
  PROTOCOL: 0x01, GET_VALUE: 0x02, SET_VALUE: 0x03, GET_KEY: 0x04, SET_KEY: 0x05, RESET_KEYMAP: 0x06,
  CUSTOM_SET: 0x07, CUSTOM_GET: 0x08, CUSTOM_SAVE: 0x09, EEPROM_RESET: 0x0a, BOOTLOADER: 0x0b,
  MACRO_COUNT: 0x0c, MACRO_SIZE: 0x0d, MACRO_GET: 0x0e, MACRO_SET: 0x0f, MACRO_RESET: 0x10,
  LAYER_COUNT: 0x11, KEYMAP_GET: 0x12, KEYMAP_SET: 0x13, ENCODER_GET: 0x14, ENCODER_SET: 0x15,
};
const VALUE = {UPTIME: 0x01, LAYOUT_OPTIONS: 0x02, MATRIX_STATE: 0x03, FIRMWARE: 0x04};

class Keyboard {
  constructor(dev) {
    this.dev = dev;
    this.queue = Promise.resolve();
  }

  // send packets in one batch; serialised so commands never interleave
  send(packets) {
    const run = () => API.call("POST", "hid", {path: this.dev.path, packets}).then((r) => r.responses);
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
  async cmd(...bytes) {
    return (await this.send([bytes]))[0];
  }
  static u16(hi, lo) { return (hi << 8) | lo; }

  async protocol() {
    const r = await this.cmd(CMD.PROTOCOL);
    this.proto = r[0] === 0xff ? 0 : Keyboard.u16(r[1], r[2]);
    this.channels = this.proto >= 12;
    if (this.proto === 11) {
      // QMK reported 11 for both lighting formats (old ids until 2022-11-09, channels after). Ask for the four
      // RGB matrix values in the channel format: channel firmware fills in real values, old firmware echoes
      // zeros. (Neither answers "unhandled" to the other format: Keychron's Q3 v1.7 echoes zeros to old ids.)
      const probe = await this.send([1, 2, 3, 4].map((id) => [CMD.CUSTOM_GET, 3, id]));
      const legacy = await this.send([0x80, 0x81, 0x82, 0x83].map((id) => [CMD.CUSTOM_GET, id]));
      const data = (rs, off) => rs.some((r) => r[0] !== 0xff && r.slice(off, off + 2).some((b) => b !== 0));
      this.channels = data(probe, 3) || !data(legacy, 2);
    }
    return this.proto;
  }
  async layerCount() {
    const r = await this.cmd(CMD.LAYER_COUNT);
    return r[0] === 0xff ? 4 : r[1];
  }
  async getValue(id, len = 4) {
    const r = await this.cmd(CMD.GET_VALUE, id);
    return r[0] === 0xff ? null : r.slice(2, 2 + len);
  }
  async layoutOptions() {
    const r = await this.getValue(VALUE.LAYOUT_OPTIONS);
    return r ? ((r[0] << 24) | (r[1] << 16) | (r[2] << 8) | r[3]) >>> 0 : 0;
  }
  async setLayoutOptions(v) {
    await this.cmd(CMD.SET_VALUE, VALUE.LAYOUT_OPTIONS, (v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255);
  }
  async firmwareVersion() {
    const r = await this.getValue(VALUE.FIRMWARE);
    return r ? ((r[0] << 24) | (r[1] << 16) | (r[2] << 8) | r[3]) >>> 0 : null;
  }
  async matrixState(rows, cols) {
    const r = await this.getValue(VALUE.MATRIX_STATE, 28);
    if (!r) return null;
    const bpr = Math.ceil(cols / 8);
    const out = [];
    for (let row = 0; row < rows; row++) {
      let v = 0;
      for (let b = 0; b < bpr; b++) v = v * 256 + r[row * bpr + b];
      out.push(v);
    }
    return out;
  }

  // whole keymap: layers × rows × cols of 16-bit keycodes
  async readKeymap(layers, rows, cols) {
    const total = layers * rows * cols * 2;
    const packets = [];
    for (let off = 0; off < total; off += 28) {
      const n = Math.min(28, total - off);
      packets.push([CMD.KEYMAP_GET, off >> 8, off & 255, n]);
    }
    const res = await this.send(packets);
    const bytes = res.flatMap((r, i) => r.slice(4, 4 + packets[i][3]));
    const map = [];
    for (let l = 0; l < layers; l++) {
      const layer = [];
      for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
          const i = ((l * rows + r) * cols + c) * 2;
          row.push(Keyboard.u16(bytes[i], bytes[i + 1]));
        }
        layer.push(row);
      }
      map.push(layer);
    }
    return map;
  }
  async writeKeymap(map) {
    const bytes = map.flat(2).flatMap((kc) => [kc >> 8, kc & 255]);
    const packets = [];
    for (let off = 0; off < bytes.length; off += 28) {
      const chunk = bytes.slice(off, off + 28);
      packets.push([CMD.KEYMAP_SET, off >> 8, off & 255, chunk.length, ...chunk]);
    }
    await this.send(packets);
  }
  async setKey(layer, row, col, kc) {
    await this.cmd(CMD.SET_KEY, layer, row, col, kc >> 8, kc & 255);
  }
  async getEncoder(layer, id, cw) {
    const r = await this.cmd(CMD.ENCODER_GET, layer, id, cw ? 1 : 0);
    return r[0] === 0xff ? null : Keyboard.u16(r[4], r[5]);
  }
  async setEncoder(layer, id, cw, kc) {
    await this.cmd(CMD.ENCODER_SET, layer, id, cw ? 1 : 0, kc >> 8, kc & 255);
  }

  // Lighting values. `prefix` is [channel, value id] from the layout file. Firmware with channels (protocol
  // 12+, and newer 11, see protocol()) takes exactly that. Older firmware has no channels and uses fixed
  // value ids instead; it silently ignores the new format, so the command has to match the firmware.
  legacyId([channel, id]) {
    if (channel === 1) return {1: 0x09, 2: 0x0a}[id];                         // backlight
    if (channel === 2 || channel === 3) return {1: 0x80, 2: 0x81, 3: 0x82, 4: 0x83}[id];  // rgblight / rgb matrix
    return undefined;
  }
  async getCustom(prefix, len) {
    let r, off;
    if (this.channels) {
      r = await this.cmd(CMD.CUSTOM_GET, ...prefix);
      off = 1 + prefix.length;
    } else {
      const id = this.legacyId(prefix);
      if (id === undefined) return null;
      r = await this.cmd(CMD.CUSTOM_GET, id);
      off = 2;
    }
    return r[0] === 0xff ? null : r.slice(off, off + len);
  }
  customSetPacket(prefix, bytes) {
    if (this.channels) return [CMD.CUSTOM_SET, ...prefix, ...bytes];
    const id = this.legacyId(prefix);
    return id === undefined ? null : [CMD.CUSTOM_SET, id, ...bytes];
  }
  async setCustom(prefix, bytes) {
    const p = this.customSetPacket(prefix, bytes);
    if (p) await this.cmd(...p);
  }
  async saveCustom(channel) {
    await (this.channels ? this.cmd(CMD.CUSTOM_SAVE, channel) : this.cmd(CMD.CUSTOM_SAVE));
  }

  // macros
  async macroInfo() {
    const [c, s] = await this.send([[CMD.MACRO_COUNT], [CMD.MACRO_SIZE]]);
    return {count: c[0] === 0xff ? 0 : c[1], size: s[0] === 0xff ? 0 : Keyboard.u16(s[1], s[2])};
  }
  async readMacroBytes(size) {
    const packets = [];
    for (let off = 0; off < size; off += 28) packets.push([CMD.MACRO_GET, off >> 8, off & 255, Math.min(28, size - off)]);
    const res = await this.send(packets);
    return res.flatMap((r, i) => r.slice(4, 4 + packets[i][3]));
  }
  async writeMacroBytes(data, size) {
    if (data.length > size) throw new Error(`Macros are too long: ${data.length} of ${size} bytes.`);
    const last = size - 1;
    // same order as VIA: mark the buffer as "being written" with 0xFF at the end, write, clear the mark
    const packets = [[CMD.MACRO_RESET], [CMD.MACRO_SET, last >> 8, last & 255, 1, 0xff]];
    for (let off = 0; off < data.length; off += 28) {
      const chunk = data.slice(off, off + 28);
      packets.push([CMD.MACRO_SET, off >> 8, off & 255, chunk.length, ...chunk]);
    }
    packets.push([CMD.MACRO_SET, last >> 8, last & 255, 1, 0x00]);
    await this.send(packets);
  }

  async resetKeymap() { await this.cmd(CMD.RESET_KEYMAP); }
  async bootloader() { await this.cmd(CMD.BOOTLOADER).catch(() => {}); }
}
