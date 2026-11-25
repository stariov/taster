"use strict";
// Reads the keyboard-layout-editor (KLE) data in a VIA definition: key positions, sizes,
// matrix positions ("row,col"), layout options ("group,option") and knobs ("e0").

const KLE = (() => {
  // where each "\n"-separated legend lands, per KLE alignment value (from ijprest/kle-serial)
  const ALIGN = [
    [0, 6, 2, 8, 9, 11, 3, 5, 1, 4, 7, 10], [1, 7, -1, -1, 9, 11, 4, -1, -1, -1, -1, 10],
    [3, -1, 5, -1, 9, 11, -1, -1, 4, -1, -1, 10], [4, -1, -1, -1, 9, 11, -1, -1, -1, -1, -1, 10],
    [0, 6, 2, 8, 10, -1, 3, 5, 1, 4, 7, -1], [1, 7, -1, -1, 10, -1, 4, -1, -1, -1, -1, -1],
    [3, -1, 5, -1, 10, -1, -1, -1, 4, -1, -1, -1], [4, -1, -1, -1, 10, -1, -1, -1, -1, -1, -1, -1],
  ];
  const pair = (s) => {
    const p = (s || "").split(/[，,]/).map((v) => parseInt(v, 10));
    return p.length === 2 && !p.some(Number.isNaN) ? p : null;
  };

  function parse(rows) {
    const raw = [];
    const colorCount = {};
    let cy = 0;
    let carry = {c: "#cccccc", t: "#000000", r: 0, rx: 0, ry: 0, a: 0};
    for (const row of rows.filter(Array.isArray)) {
      let st = {...carry, h: 1, w: 1, d: false, x2: 0, y2: 0, w2: undefined, h2: undefined};
      let cx = 0;
      for (const n of row) {
        if (typeof n === "object") {
          for (const p of ["y2", "x2", "w2", "h2", "r", "rx", "ry", "h", "w"]) if (typeof n[p] === "number") st[p] = n[p];
          if (typeof n.d === "boolean") st.d = n.d;
          if (typeof n.rx === "number" || typeof n.ry === "number") cy = st.ry;
          if (typeof n.y === "number") cy += n.y;
          if (typeof n.x === "number") cx += n.x;
          if (typeof n.a === "number") st.a = n.a;
          if (typeof n.c === "string") st.c = n.c;
          if (typeof n.t === "string") st.t = n.t;
          continue;
        }
        const labels = [];
        n.split("\n").forEach((l, i) => { const pos = (ALIGN[st.a] || ALIGN[0])[i]; if (pos >= 0) labels[pos] = l.trim(); });
        const key = {
          x: cx + st.rx, y: cy, w: st.w, h: st.h, x2: st.x2, y2: st.y2, w2: st.w2 ?? st.w, h2: st.h2 ?? st.h,
          r: st.r, rx: st.rx, ry: st.ry, c: st.c, t: st.t, decal: st.d, row: -1, col: -1, group: -1, option: 0,
        };
        if (labels[4] && /^[eE]\d+\s*$/.test(labels[4])) key.encoder = +labels[4].slice(1);
        const rc = pair(labels[0]);
        if (!st.d && rc) [key.row, key.col] = rc;
        const go = pair(labels[8]);
        if (go) [key.group, key.option] = go;
        if (!key.decal) {
          const ck = `${st.c}:${st.t}`;
          colorCount[ck] = (colorCount[ck] || 0) + 1;
          raw.push(key);
        }
        cx += st.w;
        st = {...st, h: 1, w: 1, d: false, x2: 0, y2: 0, w2: undefined, h2: undefined};
      }
      carry = {c: st.c, t: st.t, r: st.r, rx: st.rx, ry: st.ry, a: st.a};
      cy += 1;
    }
    // the most common key color = letters, second = modifiers, third = accents
    const order = Object.keys(colorCount).sort((a, b) => colorCount[b] - colorCount[a]);
    for (const k of raw) k.kind = ["alpha", "mod", "accent"][order.indexOf(`${k.c}:${k.t}`)] || "alpha";

    // option keys are moved to where option 0 of their group sits
    const groups = {};
    for (const k of raw) if (k.group >= 0) ((groups[k.group] ||= {})[k.option] ||= []).push(k);
    const pivot = (ks) => [...ks].sort((a, b) => a.y - b.y || a.x - b.x)[0];
    const pivotPoint = (k) => (k.y2 < 0 || (k.y2 === 0 && k.x2 < 0)) ? {x: k.x + k.x2, y: k.y + k.y2} : {x: k.x, y: k.y};
    for (const opts of Object.values(groups)) {
      if (!opts[0]) continue;
      const p0 = pivotPoint(pivot(opts[0]));
      for (const [o, ks] of Object.entries(opts)) {
        if (+o === 0) continue;
        const p = pivotPoint(pivot(ks));
        for (const k of ks) { k.x -= p.x - p0.x; k.y -= p.y - p0.y; k.rx -= p.x - p0.x; k.ry -= p.y - p0.y; }
      }
    }
    const visible0 = raw.filter((k) => k.option === 0 || k.group < 0);
    const boxes = visible0.map(bbox);
    const minX = Math.min(...boxes.map((b) => b.x1)), minY = Math.min(...boxes.map((b) => b.y1));
    for (const k of raw) { k.x -= minX; k.y -= minY; k.rx -= minX; k.ry -= minY; }
    const all = raw.map(bbox);
    return {
      keys: raw,
      width: Math.max(...all.map((b) => b.x2)),
      height: Math.max(...all.map((b) => b.y2)),
      groups: Object.fromEntries(Object.entries(groups).map(([g, o]) => [g, Object.keys(o).length])),
    };
  }

  function bbox(k) {
    const xs = [Math.min(k.x, k.x + k.x2), Math.max(k.x + k.w, k.x + k.x2 + k.w2)];
    const ys = [Math.min(k.y, k.y + k.y2), Math.max(k.y + k.h, k.y + k.y2 + k.h2)];
    const rad = (k.r * Math.PI) / 180;
    const pts = [[xs[0], ys[0]], [xs[1], ys[0]], [xs[0], ys[1]], [xs[1], ys[1]]].map(([x, y]) => {
      const nx = x - k.rx, ny = y - k.ry;
      return [k.rx + nx * Math.cos(rad) - ny * Math.sin(rad), k.ry + nx * Math.sin(rad) + ny * Math.cos(rad)];
    });
    return {x1: Math.min(...pts.map((p) => p[0])), x2: Math.max(...pts.map((p) => p[0])),
            y1: Math.min(...pts.map((p) => p[1])), y2: Math.max(...pts.map((p) => p[1]))};
  }

  // VIA packs the chosen layout options into one 32-bit number, last group in the lowest bits.
  // `labels` is definition.layouts.labels: a string (on/off option) or [name, choice0, choice1, ...].
  function optionBits(labels) {
    return (labels || []).map((l) => (typeof l === "string" ? 1 : Math.ceil(Math.log2(Math.max(2, l.length - 1)))));
  }
  function unpackOptions(value, labels) {
    const bits = optionBits(labels);
    const out = new Array(bits.length).fill(0);
    let shift = 0;
    for (let i = bits.length - 1; i >= 0; i--) {
      out[i] = (value >>> shift) & ((1 << bits[i]) - 1);
      shift += bits[i];
    }
    return out;
  }
  function packOptions(values, labels) {
    const bits = optionBits(labels);
    let v = 0, shift = 0;
    for (let i = bits.length - 1; i >= 0; i--) { v |= (values[i] & ((1 << bits[i]) - 1)) << shift; shift += bits[i]; }
    return v >>> 0;
  }

  return {parse, unpackOptions, packOptions};
})();
