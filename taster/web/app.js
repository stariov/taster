"use strict";
// Taster user interface.

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};

// ------------------------------------------------------------------ state
const S = {
  devices: [], dev: null, kb: null, def: null, defSource: null,
  protocol: 0, layers: 4, rows: 0, cols: 0, keymap: null, encoders: null, encoderIds: [],
  kc: null, layout: null, optionLabels: [], options: [], layer: 0,
  sel: null, undo: [], pickerCat: "basic", macros: null, macroInfo: {count: 0, size: 0},
  menus: [], tab: "keymap", firmware: null, connecting: false,
};

// ------------------------------------------------------------------ small UI helpers
let toastTimer;
function toast(msg, error = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (error ? " error" : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), error ? 6000 : 2200);
}
function modal(body, buttons) {
  return new Promise((resolve) => {
    $("#modal-body").replaceChildren(...(Array.isArray(body) ? body : [body]));
    const acts = $("#modal-actions");
    acts.replaceChildren(...buttons.map(([label, value, cls]) =>
      el("button", {class: cls || "", onclick: () => { $("#modal").hidden = true; resolve(value); }}, label)));
    $("#modal").hidden = false;
    acts.lastChild.focus();
  });
}
const confirmBox = (title, text, ok = "Continue", cls = "primary") =>
  modal([el("h2", {}, title), el("p", {}, text)], [["Cancel", false, "ghost"], [ok, true, cls]]);
function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = $("#file-input");
    inp.accept = accept;
    inp.value = "";
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}
function download(name, text) {
  const a = el("a", {href: URL.createObjectURL(new Blob([text], {type: "application/json"})), download: name});
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function handleError(e) {
  console.error(e);
  if (e.kind === "gone" || e.kind === "timeout" || e.kind === "permission") {
    toast(e.message, true);
    disconnect();
  } else if (e.kind === "server") {
    showServerGone();
  } else toast(e.message || String(e), true);
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { handleError(e); } };

// ------------------------------------------------------------------ connection
async function scan() {
  if (S.connecting) return;
  let data;
  try { data = await API.call("GET", "devices"); } catch (e) { return handleError(e); }
  S.devices = data.devices;
  if (S.dev) {  // still plugged in?
    if (!S.devices.some((d) => d.path === S.dev.path && d.access)) disconnect();
    return;
  }
  const usable = S.devices.filter((d) => d.access);
  const sel = $("#device-select");
  if (!S.devices.length) {
    showStatus("Looking for your keyboard…", [
      el("p", {}, "Plug in your keyboard. Taster finds it automatically."),
      el("p", {class: "muted"}, "Taster works with keyboards whose firmware supports VIA (for example the Keychron Q and V series)."),
    ]);
  } else if (!usable.length) {
    const d = S.devices[0];
    showStatus(`${d.name} found, but Taster may not talk to it`, [
      el("p", {}, "Linux only lets programs access keyboards like this with a permission rule. Install it once with this command, run in Taster’s folder (see README.md):"),
      el("pre", {}, "sudo sh -c 'install -m 644 70-taster.rules /etc/udev/rules.d/ && udevadm control --reload-rules && udevadm trigger --subsystem-match=hidraw --action=change'"),
      el("p", {}, "Then unplug the keyboard and plug it back in once."),
      el("p", {class: "muted"}, `Device: ${d.path}`),
    ]);
  } else if (usable.length === 1) {
    connect(usable[0]);
  } else {
    sel.replaceChildren(...usable.map((d, i) => el("option", {value: i}, d.name)));
    sel.hidden = false;
    sel.onchange = () => connect(usable[+sel.value]);
    connect(usable[0]);
  }
}

function showStatus(title, body) {
  $("#status-title").textContent = title;
  $("#status-body").replaceChildren(...body);
  for (const v of document.querySelectorAll(".view")) v.hidden = v.id !== "view-status";
  $("#tabs").hidden = true;
  $("#page-head").hidden = true;
  $("#device-name").textContent = "";
}

function disconnect() {
  stopTester();
  L.values = null;
  S.dev = null;
  S.kb = null;
  $("#device-select").hidden = true;
  showStatus("Looking for your keyboard…", [el("p", {}, "The keyboard was disconnected. Plug it in again.")]);
}

function showServerGone() {
  stopTester();
  S.dev = null;
  clearInterval(scanTimer);
  showStatus("Taster was closed", [el("p", {}, "Start Taster again from your app menu, or run “taster” in a terminal. You can close this window.")]);
}

async function connect(dev) {
  S.connecting = true;
  try {
    const kb = new Keyboard(dev);
    const protocol = await kb.protocol();
    if (!protocol) throw new Error("This keyboard does not answer VIA commands.");
    S.dev = dev; S.kb = kb; S.protocol = protocol;
    $("#device-name").textContent = dev.name;
    let defData = null;
    try { defData = await API.call("GET", `definition?vid=${dev.vid}&pid=${dev.pid}`); } catch (e) { if (e.kind !== "nodef") throw e; }
    if (!defData) return showNoDefinition();
    await loadKeyboard(defData);
  } catch (e) {
    S.dev = null; S.kb = null;
    handleError(e);
  } finally {
    S.connecting = false;
  }
}

function showNoDefinition() {
  const d = S.dev;
  const id = `${KEYCODES.forKeyboard({protocol: 12}).hex(d.vid)}:${KEYCODES.forKeyboard({protocol: 12}).hex(d.pid)}`;
  showStatus(`${d.name}: layout file needed`, [
    el("p", {}, "To show your keyboard, Taster needs its layout file (a “VIA definition”, a .json file). Keyboard makers publish them; for Keychron keyboards it is on the Keychron website next to the firmware for your model, usually as a .json or .zip file."),
    el("p", {}, el("button", {class: "primary", onclick: guard(importDefinition)}, "Load layout file (.json or .zip)…")),
    el("p", {class: "muted"}, `Keyboard ID: ${id}. The file must have the same vendorId and productId.`),
  ]);
  $("#device-name").textContent = d.name;
}

async function importDefinition() {
  const f = await pickFile(".json,.zip,application/json,application/zip");
  if (!f) return;
  const res = await API.call("POST", "definition", await f.arrayBuffer(), true);
  if (S.dev && (res.vid !== S.dev.vid || res.pid !== S.dev.pid)) {
    await API.call("DELETE", `definition?vid=${res.vid}&pid=${res.pid}`);
    throw new Error(`That file is for a different keyboard (${res.definition.name || "unknown"}).`);
  }
  toast("Layout file loaded.");
  if (S.dev) await loadKeyboard(res);
}

async function loadKeyboard({definition: def, source}) {
  const kb = S.kb;
  S.def = def; S.defSource = source;
  S.rows = def.matrix.rows; S.cols = def.matrix.cols;
  S.layers = await kb.layerCount();
  S.layout = KLE.parse(def.layouts.keymap);
  S.optionLabels = def.layouts.labels || [];
  S.options = KLE.unpackOptions(await kb.layoutOptions(), S.optionLabels);
  S.macroInfo = await kb.macroInfo();
  S.firmware = await kb.firmwareVersion();
  const lighting = (def.keycodes || []).includes("qmk_lighting") || (def.lighting && def.lighting !== "none");
  S.kc = KEYCODES.forKeyboard({protocol: S.protocol, layers: S.layers, macros: S.macroInfo.count,
                               customKeycodes: def.customKeycodes || [], lighting: !!lighting});
  S.keymap = await kb.readKeymap(S.layers, S.rows, S.cols);
  S.encoderIds = [...new Set(S.layout.keys.filter((k) => k.encoder != null).map((k) => k.encoder))];
  S.encoders = null;
  if (S.encoderIds.length && (await kb.getEncoder(0, S.encoderIds[0], false)) != null) {
    S.encoders = [];
    for (let l = 0; l < S.layers; l++) {
      S.encoders[l] = {};
      for (const id of S.encoderIds) S.encoders[l][id] = [await kb.getEncoder(l, id, false), await kb.getEncoder(l, id, true)];
    }
  }
  S.menus = resolveMenus(def);
  L.values = null;
  S.layer = Math.min(S.layer, S.layers - 1);
  S.sel = null; S.undo = [];
  S.macros = null;
  $("#tabs").hidden = false;
  showTab(S.tab);
}

// ------------------------------------------------------------------ tabs
const PAGES = {
  keymap: ["Keymap", "Click a key, then choose what it should do. Each change is stored on the keyboard right away."],
  lighting: ["Lighting", "Pick a preset or fine-tune the effect. You see it live on the keyboard; nothing is kept until you save."],
  macros: ["Macros", "Text and key sequences your keyboard types for you."],
  tester: ["Key tester", "Press every key. Keys light up while pressed and turn green once they worked. This reads the switches directly, so keys that do nothing on the computer show up too."],
  settings: ["Settings", "Backups, keyboard details and resets."],
};
function showTab(tab) {
  S.tab = tab;
  $("#page-head").hidden = false;
  $("#page-title").textContent = PAGES[tab][0];
  $("#page-sub").textContent = PAGES[tab][1];
  for (const b of document.querySelectorAll("#tabs button")) b.classList.toggle("active", b.dataset.tab === tab);
  for (const v of document.querySelectorAll(".view")) v.hidden = v.id !== "view-" + tab;
  if (tab !== "tester") stopTester();
  if (tab === "keymap") renderKeymap();
  if (tab === "lighting") guard(renderLighting)();
  if (tab === "macros") guard(renderMacros)();
  if (tab === "tester") renderTester();
  if (tab === "settings") renderSettings();
}
$("#tabs").addEventListener("click", guard(async (e) => {
  const tab = e.target.closest("button")?.dataset.tab;
  if (!tab) return;
  if (S.tab === "lighting" && tab !== "lighting" && lightingDirty()) {
    const what = await modal([el("h2", {}, "Lighting not saved"),
      el("p", {}, "The keyboard shows a preview. Save it to the keyboard, or go back to the saved lighting?")],
      [["Keep editing", null, "ghost"], ["Discard", "discard"], ["Save", "save", "primary"]]);
    if (!what) return;
    if (what === "save") await lightingSave(); else await lightingDiscard();
  }
  showTab(tab);
}));

// ------------------------------------------------------------------ keyboard drawing
function visibleKeys() {
  return S.layout.keys.filter((k) => k.group < 0 || S.options[k.group] === k.option);
}
function unitSize(wrap) {
  const avail = Math.max(300, (wrap.clientWidth || window.innerWidth - 40) - 100);  // minus paddings of wrap and case
  return Math.max(28, Math.min(60, Math.floor(avail / S.layout.width)));
}

function drawBoard(board, {legend, onClick, isSelected, extraClass}) {
  const U = unitSize(board.parentElement);
  const inner = el("div", {class: "inner", style: `width:${S.layout.width * U}px;height:${S.layout.height * U}px`});
  const gap = Math.max(2, Math.round(U * 0.06));
  for (const k of visibleKeys()) {
    const isKnob = k.encoder != null;
    const node = el("div", {class: `key ${k.kind}${isKnob ? " knob" : ""} ${extraClass ? extraClass(k) : ""}`});
    node.style.left = k.x * U + "px";
    node.style.top = k.y * U + "px";
    node.style.width = k.w * U + "px";
    node.style.height = k.h * U + "px";
    if (k.r) {
      node.style.transformOrigin = `${(k.rx - k.x) * U}px ${(k.ry - k.y) * U}px`;
      node.style.transform = `rotate(${k.r}deg)`;
    }
    const cap = el("div", {class: "cap"});
    Object.assign(cap.style, {left: gap / 2 + "px", top: gap / 2 + "px", width: k.w * U - gap + "px", height: k.h * U - gap + "px"});
    if (k.x2 || k.y2 || k.w2 !== k.w || k.h2 !== k.h) {  // ISO enter and similar: second rectangle
      const cap2 = el("div", {class: "cap2"});
      Object.assign(cap2.style, {left: k.x2 * U + gap / 2 + "px", top: k.y2 * U + gap / 2 + "px",
                                 width: k.w2 * U - gap + "px", height: k.h2 * U - gap + "px"});
      node.append(cap2);
    }
    const lg = legend(k);
    if (lg) cap.append(lg);
    node.append(cap);
    if (isSelected && isSelected(k)) node.classList.add("selected");
    if (onClick) node.addEventListener("click", () => onClick(k));
    node._key = k;
    inner.append(node);
  }
  board.replaceChildren(inner);
  return inner;
}

function legendFor(code, extra) {
  const d = S.kc.describe(code);
  const lg = el("div", {class: "legend"});
  if (code === 1) lg.classList.add("trns");
  const text = d.label;
  if (text.length > 6 || (d.sub && text.length > 4)) lg.classList.add("small");
  lg.append(text);
  if (d.sub) lg.append(el("span", {class: "sub"}, d.sub));
  if (extra) lg.append(el("span", {class: "sub"}, extra));
  lg.title = `${d.title}\n${d.name}`;
  return lg;
}

// ------------------------------------------------------------------ keymap tab
function keyCode(k) { return S.keymap[S.layer][k.row]?.[k.col] ?? 0; }

function renderKeymap() {
  const lb = $("#layer-buttons");
  lb.replaceChildren(el("span", {class: "label"}, "Layer"),
    ...Array.from({length: S.layers}, (_, i) => el("button", {class: i === S.layer ? "active" : "",
      title: i === 0 ? "Layer 0: the normal layer" : `Layer ${i}`, onclick: () => { S.layer = i; renderKeymap(); }}, String(i))));
  drawBoard($("#board"), {
    legend: (k) => {
      if (k.encoder != null && S.encoders) {
        const [ccw, cw] = S.encoders[S.layer][k.encoder];
        const lg = legendFor(keyCode(k));
        lg.append(el("span", {class: "sub"}, `↺ ${S.kc.describe(ccw).label}  ↻ ${S.kc.describe(cw).label}`));
        return lg;
      }
      return k.row >= 0 ? legendFor(keyCode(k)) : null;
    },
    onClick: (k) => {
      S.sel = k.encoder != null && k.row < 0 ? {key: k, slot: "ccw"} : {key: k, slot: "press"};
      renderKeymap();
    },
    isSelected: (k) => S.sel && S.sel.key === k,
  });
  renderSelectionBar();
  renderLayoutOptions();
  renderPicker();
  $("#undo").disabled = !S.undo.length;
}

function selectedCode() {
  if (!S.sel) return null;
  const k = S.sel.key;
  if (S.sel.slot === "press") return keyCode(k);
  return S.encoders ? S.encoders[S.layer][k.encoder][S.sel.slot === "cw" ? 1 : 0] : null;
}

function renderSelectionBar() {
  const bar = $("#selection-bar");
  if (!S.sel) {
    bar.replaceChildren(el("span", {class: "what"}, "Click a key on the keyboard above, then pick what it should do below."));
    return;
  }
  const k = S.sel.key;
  const parts = [];
  const slotBtn = (slot, label, code) => el("span", {class: "slot"},
    el("button", {class: S.sel.slot === slot ? "active" : "", onclick: () => { S.sel.slot = slot; renderKeymap(); }},
      `${label}: ${S.kc.describe(code).label || "nothing"}`));
  if (k.encoder != null) {
    parts.push(el("span", {class: "what"}, `Knob, layer ${S.layer}:`));
    if (k.row >= 0) parts.push(slotBtn("press", "Press", keyCode(k)));
    if (S.encoders) {
      parts.push(slotBtn("ccw", "↺ Turn left", S.encoders[S.layer][k.encoder][0]));
      parts.push(slotBtn("cw", "↻ Turn right", S.encoders[S.layer][k.encoder][1]));
    } else parts.push(el("span", {class: "muted"}, "(this firmware does not allow changing the knob’s turn actions)"));
  } else {
    const d = S.kc.describe(keyCode(k));
    parts.push(el("span", {class: "what"}, `Selected key (layer ${S.layer}):`), el("b", {}, d.title), el("code", {}, d.name));
  }
  parts.push(el("button", {class: "ghost", title: "Make this key do nothing", onclick: guard(() => assign(0))}, "Clear"),
             el("button", {class: "ghost", title: "Use the key from the layer below", onclick: guard(() => assign(1))}, "Transparent"));
  bar.replaceChildren(...parts);
}

function renderLayoutOptions() {
  const box = $("#layout-options");
  if (!S.optionLabels.length) { box.hidden = true; return; }
  box.hidden = false;
  box.replaceChildren(...S.optionLabels.map((l, i) => {
    if (typeof l === "string") {
      const cb = el("input", {type: "checkbox", checked: S.options[i] === 1, onchange: guard(async () => {
        S.options[i] = cb.checked ? 1 : 0; await saveOptions(); })});
      return el("label", {}, cb, l);
    }
    const sel = el("select", {onchange: guard(async () => { S.options[i] = +sel.value; await saveOptions(); })},
      ...l.slice(1).map((o, j) => el("option", {value: j, selected: S.options[i] === j}, o)));
    return el("label", {}, l[0] + ":", sel);
  }));
}
async function saveOptions() {
  await S.kb.setLayoutOptions(KLE.packOptions(S.options, S.optionLabels));
  S.sel = null;
  renderKeymap();
}

async function assign(code) {
  if (!S.sel) { toast("First click a key on the keyboard."); return; }
  const k = S.sel.key, layer = S.layer, slot = S.sel.slot;
  const old = selectedCode();
  if (old === code) return advance();
  await writeSlot(layer, k, slot, code);
  S.undo.push({layer, k, slot, old});
  advance();
}
async function writeSlot(layer, k, slot, code) {
  if (slot === "press") {
    await S.kb.setKey(layer, k.row, k.col, code);
    S.keymap[layer][k.row][k.col] = code;
  } else {
    await S.kb.setEncoder(layer, k.encoder, slot === "cw", code);
    S.encoders[layer][k.encoder][slot === "cw" ? 1 : 0] = code;
  }
}
function advance() {
  // move on to the next key, like typing
  if (S.sel && S.sel.slot === "press" && S.sel.key.encoder == null) {
    const keys = visibleKeys().filter((k) => k.row >= 0).sort((a, b) => Math.round(a.y * 4) - Math.round(b.y * 4) || a.x - b.x);
    const i = keys.indexOf(S.sel.key);
    S.sel = i >= 0 && i < keys.length - 1 ? {key: keys[i + 1], slot: "press"} : null;
  }
  renderKeymap();
}
$("#undo").addEventListener("click", guard(undo));
async function undo() {
  const u = S.undo.pop();
  if (!u) return;
  await writeSlot(u.layer, u.k, u.slot, u.old);
  S.layer = u.layer;
  S.sel = {key: u.k, slot: u.slot};
  renderKeymap();
}
document.addEventListener("keydown", (e) => {
  if (S.tab === "keymap" && (e.ctrlKey || e.metaKey) && e.key === "z" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    e.preventDefault();
    guard(undo)();
  }
  if (e.key === "Escape" && !$("#modal").hidden) $("#modal-actions").firstChild.click();
});
window.addEventListener("resize", () => {
  if (!S.layout) return;
  if (S.tab === "keymap") renderKeymap();
  if (S.tab === "tester") renderTester();
});

// ------------------------------------------------------------------ key picker
function kcButton(item) {
  const cur = selectedCode();
  const b = el("button", {class: "kc" + (cur === item.code ? " current" : ""), title: `${item.title}\n${item.name}`,
    onclick: guard(() => assign(item.code))}, item.label || "∅");
  if (item.sub) b.append(el("span", {class: "sub"}, item.sub));
  return b;
}
function renderPicker() {
  const groups = S.kc.groups(S.layers);
  const cats = [...groups.map((g) => [g.id, g.name]), ["advanced", "Advanced"]];
  if (!cats.some(([id]) => id === S.pickerCat)) S.pickerCat = "basic";
  $("#picker-cats").replaceChildren(...cats.map(([id, name]) => el("button", {class: id === S.pickerCat ? "active" : "",
    onclick: () => { S.pickerCat = id; $("#picker-search").value = ""; renderPicker(); }}, name)));
  const body = $("#picker-body");
  const q = $("#picker-search").value.trim().toLowerCase();
  if (q) {
    const seen = new Set();
    const items = groups.flatMap((g) => g.sections.flatMap((s) => s.items))
      .filter((i) => !seen.has(i.code) && seen.add(i.code))
      .filter((i) => [i.label, i.name, i.title].some((t) => (t || "").toLowerCase().includes(q)));
    body.replaceChildren(items.length ? el("div", {class: "kc-grid"}, items.map(kcButton)) : el("p", {class: "muted"}, "Nothing found. Try the Advanced tab to type any keycode."));
    return;
  }
  if (S.pickerCat === "advanced") return renderAdvanced(body);
  const g = groups.find((x) => x.id === S.pickerCat);
  body.replaceChildren(...g.sections.flatMap((s) => [el("h4", {}, s.name), el("div", {class: "kc-grid"}, s.items.map(kcButton))]));
}
$("#picker-search").addEventListener("input", () => renderPicker());

function renderAdvanced(body) {
  const kc = S.kc;
  const st = renderAdvanced.st ||= {kind: "combo", mods: {1: false, 2: false, 4: false, 8: false}, right: false, layer: 1, key: 0x04};
  const modBits = () => Object.entries(st.mods).reduce((a, [b, on]) => a | (on ? +b : 0), 0) | (st.right ? 0x10 : 0);
  const compute = () => {
    const m = modBits(), R = kc.R;
    if (["combo", "mt", "osm", "lm"].includes(st.kind) && !(m & 0xf)) throw new Error("Choose at least one modifier.");
    switch (st.kind) {
      case "combo": return (m << 8) | st.key;
      case "mt": return R.MOD_TAP | (m << 8) | st.key;
      case "lt": return R.LAYER_TAP | (st.layer << 8) | st.key;
      case "osm": return R.OSM | m;
      case "lm":
        if (m > R.LAYER_MOD_MASK) throw new Error("This firmware does not support right-hand modifiers here.");
        return R.LAYER_MOD | (st.layer << Math.log2(R.LAYER_MOD_MASK + 1)) | m;
    }
  };
  const kinds = [["combo", "Shortcut (modifiers + key)"], ["mt", "Tap for a key, hold for modifiers"],
    ["lt", "Tap for a key, hold for a layer"], ["osm", "One-shot modifier (applies to the next key)"],
    ["lm", "Hold for a layer with modifiers"]];
  const needsMods = st.kind !== "lt", needsKey = ["combo", "mt", "lt"].includes(st.kind), needsLayer = ["lt", "lm"].includes(st.kind);
  const preview = el("div", {class: "preview"});
  const err = el("div", {class: "err"});
  const update = () => {
    let code;
    try { code = compute(); err.textContent = ""; } catch (e) { err.textContent = e.message; preview.replaceChildren(); return; }
    const d = kc.describe(code);
    preview.replaceChildren(kcButton({code, ...d}), el("span", {}, d.title), el("code", {}, d.name));
  };
  const builder = el("div", {},
    el("h4", {}, "Build a key"),
    el("div", {class: "row"}, el("select", {onchange: (e) => { st.kind = e.target.value; renderAdvanced(body); }},
      ...kinds.map(([v, l]) => el("option", {value: v, selected: st.kind === v}, l)))),
    needsMods && el("div", {class: "row"},
      ...[[1, "Ctrl"], [2, "Shift"], [4, "Alt"], [8, "Super"]].map(([b, l]) => {
        const cb = el("input", {type: "checkbox", checked: st.mods[b], onchange: () => { st.mods[b] = cb.checked; update(); }});
        return el("label", {class: "chk"}, cb, l);
      }),
      (() => { const cb = el("input", {type: "checkbox", checked: st.right, onchange: () => { st.right = cb.checked; update(); }});
               return el("label", {class: "chk", title: "Use the right-hand modifiers (e.g. AltGr instead of Alt)"}, cb, "right-hand"); })()),
    needsLayer && el("div", {class: "row"}, "Layer", el("select", {onchange: (e) => { st.layer = +e.target.value; update(); }},
      ...Array.from({length: Math.min(16, S.layers)}, (_, i) => el("option", {value: i, selected: st.layer === i}, String(i))))),
    needsKey && el("div", {class: "row"}, "Key", el("select", {onchange: (e) => { st.key = +e.target.value; update(); }},
      ...kc.basicKeys.map((k) => el("option", {value: k.code, selected: st.key === k.code}, `${k.label || k.name}  —  ${k.title}`)))),
    preview, err,
    el("button", {class: "primary", onclick: guard(async () => { await assign(compute()); })}, "Put on selected key"),
  );
  const input = el("input", {type: "text", placeholder: "e.g. LCTL(KC_C)  LT(1,KC_SPC)  MT(MOD_LSFT,KC_A)  0x7c00", style: "width:100%"});
  const err2 = el("div", {class: "err"});
  const prev2 = el("div", {class: "preview"});
  const cur = selectedCode();
  if (cur != null) input.value = kc.describe(cur).name;
  const check = () => {
    try { const code = kc.parse(input.value); const d = kc.describe(code); err2.textContent = ""; prev2.replaceChildren(kcButton({code, ...d}), el("span", {}, d.title)); return code; }
    catch (e) { err2.textContent = input.value.trim() ? e.message : ""; prev2.replaceChildren(); return null; }
  };
  input.addEventListener("input", check);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { const c = check(); if (c != null) guard(assign)(c); } });
  const typer = el("div", {},
    el("h4", {}, "Or type any keycode (QMK names)"),
    input, prev2, err2,
    el("button", {onclick: guard(async () => { const c = check(); if (c != null) await assign(c); })}, "Put on selected key"),
    el("p", {class: "muted"}, "Accepted: key names like KC_A or A, modifier wrappers LCTL() LSFT() LALT() LGUI() RALT() …, MT(), LT(), LM(), MO(), TG(), TO(), TT(), OSL(), OSM(), M0…, or a raw hex value."),
  );
  body.replaceChildren(el("div", {class: "advanced"}, builder, typer));
  update();
  check();
}

// ------------------------------------------------------------------ lighting tab
function resolveMenus(def) {
  let menus = [];
  if (Array.isArray(def.menus)) {
    for (const m of def.menus) {
      if (typeof m === "string") menus.push(...(COMMON_MENUS[m] || []));
      else menus.push(m);
    }
  } else if (typeof def.lighting === "string" && COMMON_MENUS[def.lighting]) {
    menus = COMMON_MENUS[def.lighting];
  } else if (def.lighting && typeof def.lighting === "object" && COMMON_MENUS[def.lighting.extends]) {
    menus = COMMON_MENUS[def.lighting.extends];
  }
  return menus;
}
function menuItems(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => menuItems(n, out));
  else if (node && node.type && Array.isArray(node.content) && typeof node.content[0] === "string") out.push(node);
  else if (node && node.content) menuItems(node.content, out);
  return out;
}
function itemLen(item) {
  if (item.type === "color") return 2;
  if (item.type === "keycode") return 2;
  if (item.type === "range" && item.options && item.options[1] > 255) return 2;
  return 1;
}
const toNum = (bytes) => bytes.reduce((a, b) => a * 256 + b, 0);
const fromNum = (n, len) => (len === 2 ? [(n >> 8) & 255, n & 255] : [n & 255]);

function evalShowIf(expr, values) {
  if (!expr) return true;
  const s = expr.replace(/\{(\w+)\}/g, (_, id) => {
    const v = values[id];
    return v == null ? "0" : String(Array.isArray(v) ? v[0] : v);
  });
  // tiny expression evaluator: numbers, ( ), !, == != < > <= >=, && ||   (no eval: the page forbids it)
  const toks = s.match(/\d+|==|!=|<=|>=|&&|\|\||[()<>!=]/g) || [];
  if (toks.join("") !== s.replace(/\s+/g, "")) return true;
  let i = 0;
  const peek = () => toks[i], take = () => toks[i++];
  const primary = () => {
    const t = take();
    if (t === "(") { const v = or(); take(); return v; }
    if (t === "!") return primary() ? 0 : 1;
    return +t;
  };
  const cmp = () => {
    let a = primary();
    while (["==", "=", "!=", "<", ">", "<=", ">="].includes(peek())) {
      const op = take(), b = primary();
      a = {"==": a === b, "=": a === b, "!=": a !== b, "<": a < b, ">": a > b, "<=": a <= b, ">=": a >= b}[op] ? 1 : 0;
    }
    return a;
  };
  const and = () => { let a = cmp(); while (peek() === "&&") { take(); const b = cmp(); a = a && b ? 1 : 0; } return a; };
  const or = () => { let a = and(); while (peek() === "||") { take(); const b = and(); a = a || b ? 1 : 0; } return a; };
  try { return !!or(); } catch { return true; }
}

// Changes are a preview: they show on the keyboard at once, but only "Save" stores them on it.
// "Discard", leaving the tab, or closing Taster puts the saved values back.
const L = {values: null, saved: null, items: []};

// Effects, checked against the QMK source of the Q3 firmware: what each one shows, and which settings
// it reads (h = color hue, s = color saturation, p = speed; brightness is used by all).
// Kept effects get a clear name; the others are hidden (redundant or noisy) unless currently active.
// Matched by name with numbers, case and punctuation ignored, so it also fits VIA's standard names.
const EFFECTS = [
  {k: ["none", "alloff", "off"], name: "Off", keep: true, uses: "", hint: "Lighting off."},
  {k: ["solidcolor"], name: "Solid color", keep: true, uses: "hs", hint: "One steady color on every key."},
  {k: ["breathing"], name: "Breathing", keep: true, uses: "hsp", hint: "All keys fade in and out together in your color. Speed sets the pace."},
  {k: ["bandspiralval", "spiralval"], name: "Spiral glow", keep: true, uses: "hsp", hint: "A bright spiral in your color turns around the board."},
  {k: ["cycleall"], keep: false, uses: "sp", hint: "The whole board slowly changes color."},
  {k: ["cycleleftright"], name: "Rainbow wave", keep: true, uses: "sp", hint: "A rainbow scrolls from left to right. Lower saturation makes it pastel."},
  {k: ["cycleupdown"], keep: false, uses: "sp", hint: "A rainbow scrolls from top to bottom."},
  {k: ["rainbowmovingchevron"], name: "Rainbow chevron", keep: true, uses: "sp", hint: "A V-shaped rainbow scrolls across the board."},
  {k: ["cycleoutin"], keep: false, uses: "sp", hint: "Rainbow rings move from the edges to the middle."},
  {k: ["cycleoutindual"], keep: false, uses: "sp", hint: "Two sets of rainbow rings move to the middle."},
  {k: ["cyclepinwheel"], name: "Rainbow pinwheel", keep: true, uses: "sp", hint: "A rainbow turns around the middle of the board."},
  {k: ["cyclespiral", "cyckespiral"], name: "Rainbow spiral", keep: true, uses: "sp", hint: "A rainbow spiral turns around the middle of the board."},
  {k: ["dualbeacon"], keep: false, uses: "hsp", hint: "Two color beams rotate around the middle."},
  {k: ["rainbowbeacon"], keep: false, uses: "hsp", hint: "A rainbow beam rotates around the middle."},
  {k: ["jellybeanraindrops"], name: "Jellybeans", keep: true, uses: "p", hint: "Random keys keep switching to random colors."},
  {k: ["pixelrain"], keep: false, uses: "p", hint: "Random keys flash random colors or switch off."},
  {k: ["typingheatmap"], name: "Typing heatmap", keep: true, uses: "s", hint: "Dark until you type. Keys you use glow from blue to red the more you press them, and cool down within about a second."},
  {k: ["digitalrain"], name: "Digital rain", keep: true, uses: "", hint: "Green drops fall down the board; always green. The drops follow the keyboard's internal wiring, so in the right-hand key block they jump around."},
  {k: ["reactivesimple", "solidreactivesimple"], name: "Glow on press", keep: true, uses: "sp", hint: "Dark until you type. Each key you press lights up and fades; the color shifts by itself. Lower speed = longer glow."},
  {k: ["reactivemultiwide", "solidreactivemultiwide"], keep: false, uses: "sp", hint: "Dark until you type. A glow spreads around each key you press."},
  {k: ["reactivemultinexus", "solidreactivemultinexus"], name: "Ripples on press", keep: true, uses: "hsp", hint: "Dark until you type. Lines in your color shoot out from each key you press."},
  {k: ["splash"], name: "Rainbow splash on press", keep: true, uses: "sp", hint: "Dark until you type. Rainbow rings spread out from the key you press."},
  {k: ["solidsplash"], name: "Color splash on press", keep: true, uses: "hsp", hint: "Dark until you type. Rings in your color spread out from the key you press."},
];
const normEffect = (label) => String(label).replace(/^\s*\d+\.\s*/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
function effectInfo(label) {
  const n = normEffect(label);
  const plain = String(label).replace(/^\s*\d+\.\s*/, "").replace(/_/g, " ").toLowerCase();
  const fallback = plain.charAt(0).toUpperCase() + plain.slice(1);
  const e = EFFECTS.find((x) => x.k.includes(n));
  if (e) return {nice: e.name || fallback, keep: e.keep, uses: e.uses, hint: e.hint};
  return {nice: fallback, keep: true, uses: "hsp", hint: ""};
}

// Presets. Each sets all four values (hue in degrees, the rest 0–255), so nothing is left over
// from the previous preset: almost every effect reads the saturation, even the rainbow ones.
const PRESETS = [
  {name: "Ember", desc: "Slow orange breathing", effect: ["breathing"], hue: 15, sat: 255, speed: 70, bri: 200},
  {name: "Deep ocean", desc: "A blue spiral slowly turning", effect: ["bandspiralval", "spiralval"], hue: 200, sat: 255, speed: 50, bri: 230},
  {name: "Paper", desc: "Calm warm white", effect: ["solidcolor"], hue: 35, sat: 40, speed: 128, bri: 150},
  {name: "Forest", desc: "Soft green", effect: ["solidcolor"], hue: 135, sat: 200, speed: 128, bri: 130},
  {name: "Calm rainbow", desc: "Slow full-color rainbow wave", effect: ["cycleleftright"], hue: 0, sat: 255, speed: 30, bri: 170, swatch: "rainbow"},
  {name: "Party", desc: "Fast rainbow pinwheel", effect: ["cyclepinwheel"], hue: 0, sat: 255, speed: 170, bri: 255, swatch: "pinwheel"},
  {name: "Confetti", desc: "Keys flip to random colors", effect: ["jellybeanraindrops"], hue: 0, sat: 255, speed: 60, bri: 200, swatch: "confetti"},
  {name: "Heatmap", desc: "Dark; keys glow blue to red as you type", effect: ["typingheatmap"], hue: 0, sat: 255, speed: 128, bri: 255, swatch: "heat"},
  {name: "Afterglow", desc: "Dark; pressed keys glow and slowly fade", effect: ["reactivesimple", "solidreactivesimple"], hue: 0, sat: 255, speed: 35, bri: 255, swatch: "glow"},
  {name: "Neon ripples", desc: "Dark; cyan lines shoot out from each key", effect: ["reactivemultinexus", "solidreactivemultinexus"], hue: 185, sat: 255, speed: 110, bri: 255, swatch: "ring"},
  {name: "Sakura", desc: "Dark; pink rings spread as you type", effect: ["solidsplash"], hue: 330, sat: 190, speed: 90, bri: 255, swatch: "ring"},
  {name: "Matrix", desc: "Green code rain (green only)", effect: ["digitalrain"], hue: 120, sat: 255, speed: 128, bri: 255, swatch: "rain"},
];
function presetSwatch(p) {
  const c = (l = 55) => `hsl(${p.hue} ${Math.round((p.sat / 255) * 90)}% ${l + (1 - p.sat / 255) * 25}%)`;
  const dark = "#22252d";
  switch (p.swatch) {
    case "pinwheel": return "conic-gradient(from 20deg,#f55,#fb3,#5d5,#3cf,#a6f,#f5a,#f55)";
    case "rainbow": return "linear-gradient(90deg,#f44,#fb3,#5d5,#3cf,#a6f)";
    case "heat": return `radial-gradient(circle at 30% 45%,#f43 0 7px,transparent 15px),radial-gradient(circle at 55% 60%,#fb3 0 5px,transparent 13px),radial-gradient(circle at 78% 40%,#38f 0 4px,transparent 12px),${dark}`;
    case "glow": return `radial-gradient(circle at 28% 50%,#ff7a59 0 5px,transparent 16px),radial-gradient(circle at 62% 38%,#c77dff 0 4px,transparent 13px),radial-gradient(circle at 80% 66%,#5ad 0 3px,transparent 10px),${dark}`;
    case "ring": return `radial-gradient(circle at 50% 55%,transparent 0 11px,${c(62)} 12px 15px,transparent 17px 22px,${c(45)} 23px 24px,transparent 26px),${dark}`;
    case "confetti": return `radial-gradient(circle at 18% 30%,#f55 0 6px,transparent 7px),radial-gradient(circle at 42% 68%,#5cf 0 6px,transparent 7px),radial-gradient(circle at 66% 32%,#fd3 0 6px,transparent 7px),radial-gradient(circle at 86% 70%,#7d5 0 6px,transparent 7px),radial-gradient(circle at 92% 22%,#c7f 0 5px,transparent 6px),#f3f1ec`;
    case "rain": return "linear-gradient(180deg,transparent 5%,#3f8 45%,transparent 46%) 22% 0/4px 100% no-repeat,linear-gradient(180deg,transparent 30%,#3f8 78%,transparent 79%) 52% 0/4px 100% no-repeat,linear-gradient(180deg,transparent 0,#3f8 28%,transparent 29%) 80% 0/4px 100% no-repeat,#0f1a12";
    default: return `linear-gradient(135deg,${c(62)},${c(46)})`;
  }
}

const lightId = (it) => it.content[0];
const lightBytes = (it, v) => (it.type === "color" ? v : fromNum(v, itemLen(it)));
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lightingDirty = () => !!L.values && L.items.some((it) => !sameValue(L.values[lightId(it)], L.saved[lightId(it)]));

// writes go out one at a time; while one is on its way, newer values of the same control replace older ones
const lightPending = new Map();
let lightWorker = null;
function lightWrite(it, value) {
  L.values[lightId(it)] = value;
  lightPending.set(it, lightBytes(it, value));
  if (!lightWorker) {
    lightWorker = (async () => {
      try {
        while (lightPending.size) {
          const [item, bytes] = lightPending.entries().next().value;
          lightPending.delete(item);
          await S.kb.setCustom(item.content.slice(1), bytes);
        }
      } catch (e) { lightPending.clear(); handleError(e); } finally { lightWorker = null; }
    })();
  }
  updateLightBar();
}
const lightIdle = () => lightWorker || Promise.resolve();



async function lightingSave() {
  await lightIdle();
  const channels = [...new Set(L.items.map((it) => it.content[1]))];
  for (const ch of S.kb.channels ? channels : channels.slice(0, 1)) await S.kb.saveCustom(ch);
  L.saved = structuredClone(L.values);
  updateLightBar();
  toast("Lighting saved on the keyboard.");
}
async function lightingDiscard() {
  for (const it of L.items) if (!sameValue(L.values[lightId(it)], L.saved[lightId(it)])) lightWrite(it, L.saved[lightId(it)]);
  await lightIdle();
  Object.assign(L.values, structuredClone(L.saved));
}
// closing the window with an unsaved preview: put the saved values back (the request survives the page)
window.addEventListener("pagehide", () => {
  if (!lightingDirty() || !S.kb) return;
  const packets = L.items.filter((it) => !sameValue(L.values[lightId(it)], L.saved[lightId(it)]))
    .map((it) => S.kb.customSetPacket(it.content.slice(1), lightBytes(it, L.saved[lightId(it)]))).filter(Boolean);
  navigator.sendBeacon(`/api/hid?token=${encodeURIComponent(API.token)}`,
    new Blob([JSON.stringify({path: S.dev.path, packets})], {type: "text/plain"}));
});

function updateLightBar() {
  const bar = $("#light-bar");
  if (!bar) return;
  const dirty = lightingDirty();
  bar.querySelector(".state").textContent = dirty
    ? "Preview — shown on the keyboard, not saved yet"
    : "Saved on the keyboard";
  bar.querySelector(".state").classList.toggle("dirty", dirty);
  for (const b of bar.querySelectorAll("button")) b.disabled = !dirty;
  for (const p of document.querySelectorAll(".preset")) p.classList.toggle("active", presetMatches(p._preset));
}

function presetTargets() {
  const find = (test) => L.items.find((it) => test(lightId(it)) && L.values[lightId(it)] != null);
  return {
    effect: find((id) => /_effect$/.test(id)), speed: find((id) => /_effect_speed$/.test(id)),
    bri: find((id) => /_brightness$/.test(id)), color: find((id) => /_color$/.test(id)),
  };
}
function presetEffectValue(p, effectItem) {
  const opts = (effectItem.options || []).map((o, i) => (Array.isArray(o) ? o : [o, i]));
  const hit = opts.find(([label]) => p.effect.includes(normEffect(label)));
  return hit ? hit[1] : null;
}
function presetValues(p) {
  const t = presetTargets(), out = [];
  if (!t.effect) return null;
  const ev = presetEffectValue(p, t.effect);
  if (ev == null) return null;
  out.push([t.effect, ev]);
  if (t.color && p.hue != null) out.push([t.color, [Math.round((p.hue / 360) * 255) & 255, p.sat]]);
  if (t.speed && p.speed != null) out.push([t.speed, p.speed]);
  if (t.bri && p.bri != null) out.push([t.bri, Math.round((p.bri / 255) * ((t.bri.options || [0, 255])[1]))]);
  return out;
}
const presetMatches = (p) => { const v = p && presetValues(p); return !!v && v.every(([it, val]) => sameValue(L.values[lightId(it)], val)); };

async function renderLighting() {
  const body = $("#lighting-body");
  if (!S.menus.length) {
    body.replaceChildren(el("div", {class: "card"}, el("h2", {}, "Lighting"),
      el("p", {class: "muted"}, "This keyboard’s layout file has no lighting settings. You can still control the lighting with the lighting keys (Keymap → Lighting).")));
    return;
  }
  if (!L.values) {
    body.replaceChildren(el("p", {class: "muted"}, "Reading settings…"));
    L.items = menuItems(S.menus);
    const values = {};
    for (const it of L.items) {
      const v = await S.kb.getCustom(it.content.slice(1), itemLen(it));
      values[lightId(it)] = v === null ? null : (it.type === "color" ? v : toNum(v));
    }
    L.values = values;
    L.saved = structuredClone(values);
  }

  const control = (it) => {
    const id = lightId(it), v = L.values[id];
    if (v == null) return el("span", {class: "muted"}, "not supported");
    switch (it.type) {
      case "range": {
        const [min, max] = it.options || [0, 255];
        const out = el("span", {class: "val"}, String(v));
        const r = el("input", {type: "range", min, max, value: v, oninput: () => { out.textContent = r.value; lightWrite(it, +r.value); }});
        return [r, out];
      }
      case "dropdown": {
        let opts = (it.options || []).map((o, i) => (Array.isArray(o) ? o : [o, i]));
        if (/effect$/.test(id)) {
          opts = opts.map(([l, val]) => [effectInfo(l), val]).filter(([info, val]) => info.keep || val === v).map(([info, val]) => [info.nice, val]);
        }
        const s = el("select", {onchange: () => { lightWrite(it, +s.value); rerender(); }},
          ...opts.map(([l, val]) => el("option", {value: val, selected: val === v}, l)));
        return s;
      }
      case "toggle": {
        const [off, on] = it.options || [0, 1];
        const cb = el("input", {type: "checkbox", checked: v === on, onchange: () => { lightWrite(it, cb.checked ? on : off); rerender(); }});
        return el("label", {class: "switch"}, cb, el("span"));
      }
      case "color": {
        const c = el("input", {type: "color", value: hsToHex(v[0], v[1]), oninput: () => lightWrite(it, hexToHs(c.value))});
        return c;
      }
      case "keycode":
        return el("code", {}, S.kc.describe(v).name);
      default:
        return el("span", {class: "muted"}, `(${it.type})`);
    }
  };
  // what the current effect does and which settings it reads
  const effectNow = () => {
    const it = presetTargets().effect;
    if (!it) return null;
    const opt = (it.options || []).map((o, i) => (Array.isArray(o) ? o : [o, i])).find(([, v]) => v === L.values[lightId(it)]);
    return opt ? effectInfo(opt[0]) : null;
  };
  const unusedNote = (id) => {
    const e = effectNow();
    if (!e) return null;
    if (/_effect_speed$/.test(id) && !e.uses.includes("p")) return "not used by this effect";
    if (/_color$/.test(id)) {
      if (!e.uses.includes("h") && !e.uses.includes("s")) return "not used by this effect";
      if (!e.uses.includes("h")) return "only how vivid it is matters here";
    }
    return null;
  };
  const renderNode = (node) => {
    if (Array.isArray(node)) return node.flatMap(renderNode);
    if (!evalShowIf(node.showIf, L.values)) return [];
    if (node.type) {
      if (node.type === "button") return [];  // buttons act at once; they do not fit a preview
      const c = control(node);
      const note = unusedNote(lightId(node));
      const row = el("div", {class: "menu-item" + (note === "not used by this effect" ? " unused" : "")},
        el("div", {}, node.label, note ? el("small", {}, note) : null), ...(Array.isArray(c) ? c : [c, el("span")]));
      const out = [row];
      if (/_effect$/.test(lightId(node))) {
        const e = effectNow();
        if (e && e.hint) out.push(el("div", {class: "effect-hint"}, e.hint));
      }
      return out;
    }
    if (node.content) return [el("h3", {}, node.label || ""), ...renderNode(node.content)];
    return [];
  };
  const presetCard = () => {
    const usable = PRESETS.filter((p) => presetValues(p));
    if (!usable.length) return null;
    return el("div", {class: "card"}, el("h2", {}, "Presets"),
      el("div", {class: "presets"}, ...usable.map((p) => {
        const sw = presetSwatch(p);
        const b = el("button", {class: "preset", onclick: () => {
          for (const [it, val] of presetValues(p)) lightWrite(it, val);
          rerender();
        }}, el("span", {class: "swatch", style: `background:${sw}`}), el("span", {class: "pname"}, p.name), el("span", {class: "pdesc"}, p.desc));
        b._preset = p;
        return b;
      })));
  };
  const rerender = () => {
    body.replaceChildren(
      presetCard() || "",
      ...S.menus.map((top) => el("div", {class: "card"}, el("h2", {}, !top.label || top.label === "Lighting" ? "Fine-tune" : top.label), ...renderNode(top.content || []))),
      el("div", {class: "light-bar", id: "light-bar"},
        el("span", {class: "state"}),
        el("div", {class: "spacer"}),
        el("button", {class: "ghost", onclick: guard(async () => { await lightingDiscard(); rerender(); })}, "Discard"),
        el("button", {class: "primary", onclick: guard(lightingSave)}, "Save to keyboard")),
      el("p", {class: "muted"}, "Changes show on the keyboard right away as a preview. Only “Save to keyboard” keeps them; otherwise the saved lighting comes back when you discard, leave this tab, or close Taster."),
    );
    updateLightBar();
  };
  rerender();
}
function hsToHex(h, s) {
  const H = (h / 255) * 6, S_ = s / 255, i = Math.floor(H) % 6, f = H - Math.floor(H);
  const p = 1 - S_, q = 1 - S_ * f, t = 1 - S_ * (1 - f);
  const [r, g, b] = [[1, t, p], [q, 1, p], [p, 1, t], [p, q, 1], [t, p, 1], [1, p, q]][i];
  return "#" + [r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}
function hexToHs(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [Math.round((h / 360) * 255) & 255, max ? Math.round((d / max) * 255) : 0];
}

// ------------------------------------------------------------------ macros tab
const MACRO = {
  decode(bytes, count) {
    const out = [];
    let cur = [], i = 0;
    const name = (c) => S.kc.describe(c).name;
    while (i < bytes.length && out.length < count) {
      const b = bytes[i];
      if (b === 0) { out.push(cur); cur = []; i++; continue; }
      if (b === 1 && bytes[i + 1] >= 1 && bytes[i + 1] <= 3) {
        cur.push([["", "tap", "down", "up"][bytes[i + 1]], name(bytes[i + 2])]);
        i += 3; continue;
      }
      if (b === 1 && bytes[i + 1] === 4) {
        let j = i + 2, s = "";
        while (j < bytes.length && bytes[j] !== 124) s += String.fromCharCode(bytes[j++]);
        cur.push(["delay", parseInt(s, 10) || 0]);
        i = j + 1; continue;
      }
      cur.push(["char", String.fromCharCode(b)]);
      i++;
    }
    while (out.length < count) { out.push(cur); cur = []; }
    return out.map((seq) => MACRO.toText(seq));
  },
  toText(seq) {
    let s = "";
    for (let i = 0; i < seq.length; i++) {
      const [t, v] = seq[i];
      if (t === "char") { s += v === "{" ? "\\{" : v; continue; }
      if (t === "delay") { s += `{${v}}`; continue; }
      if (t === "tap") { s += `{${v}}`; continue; }
      if (t === "down") {  // downs followed by matching ups in reverse order = a chord
        let j = i;
        while (j < seq.length && seq[j][0] === "down") j++;
        const downs = seq.slice(i, j).map((x) => x[1]);
        const ups = seq.slice(j, j + downs.length);
        if (ups.length === downs.length && ups.every((u, n) => u[0] === "up" && u[1] === downs[downs.length - 1 - n])) {
          s += `{${downs.join(",")}}`;
          i = j + downs.length - 1;
          continue;
        }
        s += `{+${v}}`; continue;
      }
      if (t === "up") s += `{-${v}}`;
    }
    return s;
  },
  encode(text) {  // text -> bytes (without terminator); throws on errors
    const bytes = [];
    let i = 0;
    const basic = (n) => {
      let c;
      try { c = S.kc.parse(n); } catch (e) { throw new Error(`Unknown key “${n}”.`); }
      if (c < 2 || c > 0xff) throw new Error(`“${n}” cannot be used in a macro (only normal keys and modifiers).`);
      return c;
    };
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\\" && text[i + 1] === "{") { bytes.push(123); i += 2; continue; }
      if (ch === "{") {
        const end = text.indexOf("}", i);
        if (end < 0) throw new Error("A { has no closing }.");
        const inner = text.slice(i + 1, end).replace(/\s+/g, "");
        i = end + 1;
        if (!inner) throw new Error("Empty {} — write \\{} to type braces.");
        if (/^\d+$/.test(inner)) {
          if (inner.length > 4) throw new Error("Delays can be at most 9999 ms.");
          bytes.push(1, 4, ...[...String(+inner)].map((c) => c.charCodeAt(0)), 124);
        } else if (inner[0] === "+" || inner[0] === "-") {
          bytes.push(1, inner[0] === "+" ? 2 : 3, basic(inner.slice(1)));
        } else {
          const keys = inner.split(",").filter(Boolean).map(basic);
          if (keys.length === 1) bytes.push(1, 1, keys[0]);
          else {
            for (const k of keys) bytes.push(1, 2, k);
            for (const k of [...keys].reverse()) bytes.push(1, 3, k);
          }
        }
        continue;
      }
      const code = ch.charCodeAt(0);
      if (ch === "\r") { i++; continue; }
      if (!(code === 9 || code === 10 || (code >= 32 && code < 127))) throw new Error(`“${ch}” cannot be typed by a macro (plain ASCII characters only).`);
      bytes.push(code);
      i++;
    }
    return bytes;
  },
};

async function renderMacros() {
  const list = $("#macro-list");
  const {count, size} = S.macroInfo;
  if (!count) {
    list.replaceChildren(el("p", {}, "This keyboard’s firmware has no macro support."));
    $("#macro-save").disabled = true;
    return;
  }
  if (!S.macros) {
    list.replaceChildren(el("p", {class: "muted"}, "Reading macros…"));
    S.macros = MACRO.decode(await S.kb.readMacroBytes(size), count);
  }
  const shown = Math.min(count, S.kc.macroCount || count);
  const areas = [];
  const usage = () => {
    let total = 0, ok = true;
    for (const a of areas) {
      try { total += MACRO.encode(a.value).length + 1; a.classList.remove("bad"); a._err.textContent = ""; }
      catch (e) { ok = false; a.classList.add("bad"); a._err.textContent = e.message; }
    }
    total += count - areas.length;
    $("#macro-usage").textContent = `${total} of ${size} bytes used`;
    $("#macro-save").disabled = !ok || total > size;
    if (total > size) $("#macro-usage").textContent += " — too long, please shorten";
  };
  list.replaceChildren(...Array.from({length: shown}, (_, i) => {
    const ta = el("textarea", {spellcheck: "false", placeholder: "empty", oninput: usage});
    ta.value = S.macros[i] || "";
    ta._err = el("div", {class: "merr"});
    areas.push(ta);
    return el("div", {class: "macro"}, el("div", {class: "mname"}, `M${i}`), ta, ta._err);
  }));
  usage();
  $("#macro-save").onclick = guard(async () => {
    const all = areas.map((a) => MACRO.encode(a.value));
    const data = all.flatMap((b) => [...b, 0]);
    for (let i = shown; i < count; i++) data.push(0);
    await S.kb.writeMacroBytes(data, size);
    S.macros = areas.map((a) => a.value);
    toast("Macros saved to the keyboard.");
  });
  $("#macro-revert").onclick = guard(async () => { S.macros = null; await renderMacros(); });
}

// ------------------------------------------------------------------ key tester
let testerTimer = null;
const tested = new Set();
function renderTester() {
  const keys = drawBoard($("#tester-board"), {
    legend: (k) => (k.row >= 0 ? legendFor(S.keymap[0][k.row][k.col]) : null),
    extraClass: (k) => (tested.has(`${k.row},${k.col}`) ? "done" : ""),
  });
  const nodes = [...keys.children];
  $("#tester-note").textContent = "";
  stopTester();
  let failures = 0;
  const poll = async () => {
    if (S.tab !== "tester" || !S.kb) return;
    try {
      const state = await S.kb.matrixState(S.rows, S.cols);
      if (!state) { $("#tester-note").textContent = "This keyboard’s firmware does not support the key tester."; return; }
      for (const n of nodes) {
        const k = n._key;
        if (k.row < 0) continue;
        const down = !!(Math.floor(state[k.row] / 2 ** k.col) % 2);
        n.classList.toggle("down", down);
        if (down) { tested.add(`${k.row},${k.col}`); n.classList.add("done"); }
      }
      failures = 0;
    } catch (e) {
      if (++failures > 3) return handleError(e);
    }
    testerTimer = setTimeout(poll, 40);
  };
  poll();
}
function stopTester() { clearTimeout(testerTimer); testerTimer = null; }
$("#tester-clear").addEventListener("click", () => { tested.clear(); renderTester(); });

// ------------------------------------------------------------------ settings tab
function renderSettings() {
  const d = S.dev, def = S.def, hx = S.kc.hex;
  const fw = S.firmware;
  const info = [
    ["Keyboard", def.name || d.name], ["USB ID", `${hx(d.vid)}:${hx(d.pid)}`], ["VIA protocol", String(S.protocol)],
    ["Firmware value", fw == null ? "not reported" : `0x${fw.toString(16).padStart(8, "0")}`],
    ["Layers", String(S.layers)], ["Macros", `${S.macroInfo.count} (${S.macroInfo.size} bytes)`],
    ["Layout file", S.defSource === "bundled" ? "built into Taster" : "loaded by you"],
    ["Device", d.path],
  ];
  $("#settings-body").replaceChildren(
    el("div", {class: "card"}, el("h2", {}, "Backup"),
      el("p", {class: "muted"}, "Save all layers, knob actions, macros and lighting settings to a file, or load such a file back onto the keyboard."),
      el("div", {class: "actions"},
        el("button", {class: "primary", onclick: guard(saveBackup)}, "Save backup to file…"),
        el("button", {onclick: guard(loadBackup)}, "Load backup from file…"))),
    el("div", {class: "card"}, el("h2", {}, "Keyboard"),
      el("div", {class: "info"}, ...info.flatMap(([a, b]) => [el("div", {}, a), el("div", {}, b)])),
      el("div", {class: "actions"},
        el("button", {onclick: guard(importDefinition)}, "Load a different layout file…"),
        S.defSource === "user" && el("button", {onclick: guard(removeDefinition)}, "Remove the layout file you loaded"))),
    el("div", {class: "card"}, el("h2", {}, "Reset"),
      el("p", {class: "muted"}, "Puts the keymap back to how it came from the factory. Macros and lighting are not changed. Save a backup first if you want to keep your current layout."),
      el("div", {class: "actions"},
        el("button", {class: "danger", onclick: guard(resetKeymap)}, "Reset keymap to factory default…"),
        el("button", {class: "danger", onclick: guard(bootloader)}, "Restart into firmware-update mode…"))),
    el("div", {class: "card"}, el("h2", {}, "Taster"),
      el("p", {class: "muted"}, "Taster stops by itself when you close this window. To remove it from your computer, run “taster --uninstall” in a terminal."),
      el("div", {class: "actions"}, el("button", {onclick: guard(quit)}, "Quit Taster"))),
  );
}

async function collectBackup() {
  const lighting = {};
  for (const it of menuItems(S.menus)) {
    const [, ...prefix] = it.content;
    const v = await S.kb.getCustom(prefix, itemLen(it));
    if (v !== null) lighting[prefix.join(",")] = v;
  }
  const macroBytes = S.macroInfo.count ? await S.kb.readMacroBytes(S.macroInfo.size) : [];
  let end = macroBytes.length;
  while (end > 0 && macroBytes[end - 1] === 0) end--;
  return {
    app: "taster", format: 1, saved: new Date().toISOString(),
    keyboard: {name: S.def.name || S.dev.name, vid: S.dev.vid, pid: S.dev.pid},
    protocol: S.protocol, layers: S.layers, matrix: {rows: S.rows, cols: S.cols},
    layoutOptions: KLE.packOptions(S.options, S.optionLabels),
    keymap: await S.kb.readKeymap(S.layers, S.rows, S.cols),
    encoders: S.encoders, macros: macroBytes.slice(0, end), lighting,
  };
}
async function saveBackup() {
  const b = await collectBackup();
  const name = (S.def.name || "keyboard").replace(/[^\w-]+/g, "-").toLowerCase();
  download(`${name}-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b, null, 1));
  toast("Backup saved to your Downloads folder.");
}
async function loadBackup() {
  const f = await pickFile(".json,application/json");
  if (!f) return;
  let b;
  try { b = JSON.parse(await f.text()); } catch { throw new Error("That file is not a Taster backup."); }
  if (b.app !== "taster" || !Array.isArray(b.keymap)) throw new Error("That file is not a Taster backup.");
  if (b.keyboard.vid !== S.dev.vid || b.keyboard.pid !== S.dev.pid) {
    if (!await confirmBox("Different keyboard", `This backup is from “${b.keyboard.name}”. Load it anyway? Keys may end up in the wrong places.`, "Load anyway", "danger")) return;
  }
  if (b.protocol !== S.protocol && (b.protocol >= 11) !== (S.protocol >= 11)) {
    throw new Error("This backup was made with much older/newer firmware. Its key numbers do not match this firmware.");
  }
  if (!await confirmBox("Load backup?", "This replaces the keymap, knob actions, macros and lighting on the keyboard with the backup.", "Load backup")) return;
  const map = Array.from({length: S.layers}, (_, l) => Array.from({length: S.rows}, (_, r) =>
    Array.from({length: S.cols}, (_, c) => b.keymap[l]?.[r]?.[c] ?? (l === 0 ? 0 : 1))));
  await S.kb.writeKeymap(map);
  if (b.encoders && S.encoders) {
    for (let l = 0; l < S.layers; l++) for (const id of S.encoderIds) {
      const e = b.encoders[l]?.[id];
      if (e) { await S.kb.setEncoder(l, +id, false, e[0]); await S.kb.setEncoder(l, +id, true, e[1]); }
    }
  }
  if (S.macroInfo.count && Array.isArray(b.macros) && b.macros.length <= S.macroInfo.size) await S.kb.writeMacroBytes(b.macros, S.macroInfo.size);
  const channels = new Set();
  for (const [prefix, bytes] of Object.entries(b.lighting || {})) {
    const p = prefix.split(",").map(Number);
    await S.kb.setCustom(p, bytes);
    channels.add(p[0]);
  }
  for (const ch of channels) await S.kb.saveCustom(ch);
  if (b.layoutOptions != null && S.optionLabels.length) await S.kb.setLayoutOptions(b.layoutOptions);
  toast("Backup loaded onto the keyboard.");
  await loadKeyboard({definition: S.def, source: S.defSource});
}
async function removeDefinition() {
  await API.call("DELETE", `definition?vid=${S.dev.vid}&pid=${S.dev.pid}`);
  toast("Layout file removed.");
  const dev = S.dev;
  S.dev = null;
  await connect(dev);
}
async function resetKeymap() {
  if (!await confirmBox("Reset keymap?", "All layers and knob actions go back to the factory default. This cannot be undone (unless you saved a backup).", "Reset keymap", "danger")) return;
  await S.kb.resetKeymap();
  toast("Keymap reset.");
  await loadKeyboard({definition: S.def, source: S.defSource});
}
async function bootloader() {
  if (!await confirmBox("Firmware-update mode?", "The keyboard stops working as a keyboard until you flash firmware or unplug it and plug it back in. Only do this if you are about to update the firmware.", "Restart into update mode", "danger")) return;
  await S.kb.bootloader();
  disconnect();
}
async function quit() {
  await API.call("POST", "quit").catch(() => {});
  showServerGone();
  window.close();
}

// ------------------------------------------------------------------ start
let scanTimer = null;
function start() {
  if (!API.token) {
    showStatus("Start Taster from your app menu", [el("p", {}, "This page only works when opened by Taster.")]);
    return;
  }
  const ev = new EventSource(`/api/events?token=${encodeURIComponent(API.token)}`);
  ev.addEventListener("quit", () => { ev.close(); showServerGone(); });
  scan();
  scanTimer = setInterval(scan, 2000);
}
start();
