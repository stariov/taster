"use strict";
// Keycodes: what each 16-bit value stored in the keyboard means, for each VIA protocol version.
// protocol <= 10 uses the old QMK numbering, 11 and 12+ the new one (they differ in a few ranges).

const KEYCODES = (() => {
  // [name, label, title, code]   code 0x00..0xFF, identical in all versions (except mouse keys in v10)
  const BASIC = [
    ["KC_NO", "", "Nothing (key does nothing)", 0x00],
    ["KC_TRNS", "▽", "Transparent: use the key from the layer below", 0x01],
    ...[..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((c, i) => ["KC_" + c, c, null, 0x04 + i]),
    ...[..."1234567890"].map((c, i) => ["KC_" + c, c, null, 0x1e + i]),
    ["KC_ENT", "Enter", null, 0x28], ["KC_ESC", "Esc", "Escape", 0x29], ["KC_BSPC", "Bksp", "Backspace", 0x2a],
    ["KC_TAB", "Tab", null, 0x2b], ["KC_SPC", "Space", null, 0x2c], ["KC_MINS", "-", "Minus", 0x2d],
    ["KC_EQL", "=", "Equals", 0x2e], ["KC_LBRC", "[", null, 0x2f], ["KC_RBRC", "]", null, 0x30],
    ["KC_BSLS", "\\", "Backslash", 0x31], ["KC_NUHS", "ISO #", "Non-US # (ISO key next to Enter)", 0x32],
    ["KC_SCLN", ";", null, 0x33], ["KC_QUOT", "'", null, 0x34], ["KC_GRV", "`", "Grave / tilde", 0x35],
    ["KC_COMM", ",", null, 0x36], ["KC_DOT", ".", null, 0x37], ["KC_SLSH", "/", null, 0x38],
    ["KC_CAPS", "Caps", "Caps Lock", 0x39],
    ...Array.from({length: 12}, (_, i) => ["KC_F" + (i + 1), "F" + (i + 1), null, 0x3a + i]),
    ["KC_PSCR", "PrtSc", "Print Screen", 0x46], ["KC_SLCK", "ScrLk", "Scroll Lock", 0x47],
    ["KC_PAUS", "Pause", null, 0x48], ["KC_INS", "Ins", "Insert", 0x49], ["KC_HOME", "Home", null, 0x4a],
    ["KC_PGUP", "PgUp", "Page Up", 0x4b], ["KC_DEL", "Del", "Delete", 0x4c], ["KC_END", "End", null, 0x4d],
    ["KC_PGDN", "PgDn", "Page Down", 0x4e], ["KC_RGHT", "→", "Right", 0x4f], ["KC_LEFT", "←", "Left", 0x50],
    ["KC_DOWN", "↓", "Down", 0x51], ["KC_UP", "↑", "Up", 0x52], ["KC_NLCK", "NumLk", "Num Lock", 0x53],
    ["KC_PSLS", "N /", "Numpad /", 0x54], ["KC_PAST", "N *", "Numpad *", 0x55], ["KC_PMNS", "N -", "Numpad -", 0x56],
    ["KC_PPLS", "N +", "Numpad +", 0x57], ["KC_PENT", "N Ent", "Numpad Enter", 0x58],
    ...[..."1234567890"].map((c, i) => ["KC_P" + c, "N " + c, "Numpad " + c, 0x59 + i]),
    ["KC_PDOT", "N .", "Numpad .", 0x63], ["KC_NUBS", "ISO \\", "Non-US \\ (ISO key next to left Shift)", 0x64],
    ["KC_APP", "Menu", "Application / context menu", 0x65], ["KC_POWER", "Power2", "Power (keyboard page)", 0x66],
    ["KC_PEQL", "N =", "Numpad =", 0x67],
    ...Array.from({length: 12}, (_, i) => ["KC_F" + (i + 13), "F" + (i + 13), null, 0x68 + i]),
    ["KC_EXECUTE", "Exec", "Execute", 0x74], ["KC_HELP", "Help", null, 0x75], ["KC_MENU", "Menu2", "Menu (keyboard page)", 0x76],
    ["KC_SELECT", "Select", null, 0x77], ["KC_STOP", "Stop", null, 0x78], ["KC_AGAIN", "Again", null, 0x79],
    ["KC_UNDO", "Undo", null, 0x7a], ["KC_CUT", "Cut", null, 0x7b], ["KC_COPY", "Copy", null, 0x7c],
    ["KC_PASTE", "Paste", null, 0x7d], ["KC_FIND", "Find", null, 0x7e],
    ["KC_LCAP", "LCaps", "Locking Caps Lock", 0x82], ["KC_LNUM", "LNum", "Locking Num Lock", 0x83],
    ["KC_LSCR", "LScr", "Locking Scroll Lock", 0x84], ["KC_PCMM", "N ,", "Numpad comma", 0x85],
    ["KC_RO", "JP \\", "International 1 (Ro)", 0x87], ["KC_KANA", "Kana", "International 2", 0x88],
    ["KC_JYEN", "¥", "International 3 (Yen)", 0x89], ["KC_HENK", "Henk", "International 4 (Henkan)", 0x8a],
    ["KC_MHEN", "MHen", "International 5 (Muhenkan)", 0x8b], ["KC_HAEN", "한/영", "Lang 1 (Hangul/English)", 0x90],
    ["KC_HANJ", "Hanja", "Lang 2", 0x91],
    ["KC_PWR", "Power", "System Power", 0xa5], ["KC_SLEP", "Sleep", "System Sleep", 0xa6], ["KC_WAKE", "Wake", "System Wake", 0xa7],
    ["KC_MUTE", "Mute", null, 0xa8], ["KC_VOLU", "Vol+", "Volume up", 0xa9], ["KC_VOLD", "Vol-", "Volume down", 0xaa],
    ["KC_MNXT", "Next", "Next track", 0xab], ["KC_MPRV", "Prev", "Previous track", 0xac], ["KC_MSTP", "MStop", "Media stop", 0xad],
    ["KC_MPLY", "Play", "Play / pause", 0xae], ["KC_MSEL", "Media", "Media select", 0xaf], ["KC_EJCT", "Eject", null, 0xb0],
    ["KC_MAIL", "Mail", null, 0xb1], ["KC_CALC", "Calc", "Calculator", 0xb2], ["KC_MYCM", "Files", "My Computer / file manager", 0xb3],
    ["KC_WWW_SEARCH", "Search", "Browser search", 0xb4], ["KC_WWW_HOME", "WHome", "Browser home", 0xb5],
    ["KC_WWW_BACK", "Back", "Browser back", 0xb6], ["KC_WWW_FORWARD", "Fwd", "Browser forward", 0xb7],
    ["KC_WWW_STOP", "WStop", "Browser stop", 0xb8], ["KC_WWW_REFRESH", "Reload", "Browser refresh", 0xb9],
    ["KC_WWW_FAVORITES", "Fav", "Browser favorites", 0xba], ["KC_MFFD", "FFwd", "Fast forward", 0xbb],
    ["KC_MRWD", "Rew", "Rewind", 0xbc], ["KC_BRIU", "Bri+", "Screen brightness up", 0xbd],
    ["KC_BRID", "Bri-", "Screen brightness down", 0xbe],
    ["KC_LCTL", "Ctrl", "Left Control", 0xe0], ["KC_LSFT", "Shift", "Left Shift", 0xe1], ["KC_LALT", "Alt", "Left Alt", 0xe2],
    ["KC_LGUI", "Super", "Left Super / Win / Cmd", 0xe3], ["KC_RCTL", "RCtrl", "Right Control", 0xe4],
    ["KC_RSFT", "RShift", "Right Shift", 0xe5], ["KC_RALT", "AltGr", "Right Alt / AltGr", 0xe6],
    ["KC_RGUI", "RSuper", "Right Super / Win / Cmd", 0xe7],
  ];
  const MOUSE = [
    ["KC_MS_UP", "Ms ↑", "Mouse up"], ["KC_MS_DOWN", "Ms ↓", "Mouse down"], ["KC_MS_LEFT", "Ms ←", "Mouse left"],
    ["KC_MS_RIGHT", "Ms →", "Mouse right"], ["KC_MS_BTN1", "Btn1", "Mouse button 1 (left)"],
    ["KC_MS_BTN2", "Btn2", "Mouse button 2 (right)"], ["KC_MS_BTN3", "Btn3", "Mouse button 3 (middle)"],
    ["KC_MS_BTN4", "Btn4", "Mouse button 4"], ["KC_MS_BTN5", "Btn5", "Mouse button 5"],
    ["KC_MS_WH_UP", "Wh ↑", "Scroll up"], ["KC_MS_WH_DOWN", "Wh ↓", "Scroll down"],
    ["KC_MS_WH_LEFT", "Wh ←", "Scroll left"], ["KC_MS_WH_RIGHT", "Wh →", "Scroll right"],
    ["KC_MS_ACCEL0", "Acc0", "Mouse speed slow"], ["KC_MS_ACCEL1", "Acc1", "Mouse speed medium"],
    ["KC_MS_ACCEL2", "Acc2", "Mouse speed fast"],
  ];
  const MOUSE_CODES = {
    new: [0xcd, 0xce, 0xcf, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd9, 0xda, 0xdb, 0xdc, 0xdd, 0xde, 0xdf],
    old: [0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xfb, 0xfc, 0xfd, 0xfe, 0xff],
  };
  const MAC_NEW = [["KC_MCTL", "MCtrl", "Mission Control (macOS)", 0xc1], ["KC_LPAD", "LPad", "Launchpad (macOS)", 0xc2]];

  // Special QMK keycodes: [name, label, title, code v10, code v11/v12]
  const SPECIAL = [
    ["RESET", "Boot", "Bootloader: reboot into firmware-update mode", 0x5c00, 0x7c00],
    ["QK_CLEAR_EEPROM", "ClrEE", "Clear EEPROM: reset all settings stored on the keyboard", null, 0x7c03],
    ["DEBUG", "Debug", "Toggle debug mode", 0x5c01, 0x7c02],
    ["MAGIC_TOGGLE_NKRO", "NKRO", "Toggle N-key rollover", 0x5c14, 0x7013],
    ["KC_GESC", "Esc `", "Grave Escape: Esc, but ` with Shift or Super", 0x5c16, 0x7c16],
    ["KC_LSPO", "LS (", "Left Shift; tap for (", 0x5cd7, 0x7c1a],
    ["KC_RSPC", "RS )", "Right Shift; tap for )", 0x5cd8, 0x7c1b],
    ["KC_LCPO", "LC (", "Left Ctrl; tap for (", 0x5cf3, 0x7c18],
    ["KC_RCPC", "RC )", "Right Ctrl; tap for )", 0x5cf4, 0x7c19],
    ["KC_LAPO", "LA (", "Left Alt; tap for (", 0x5cf5, 0x7c1c],
    ["KC_RAPC", "RA )", "Right Alt; tap for )", 0x5cf6, 0x7c1d],
    ["KC_SFTENT", "RS Ent", "Right Shift; tap for Enter", 0x5cd9, 0x7c1e],
    ["MAGIC_SWAP_LALT_LGUI", "Swap LAlt Super", "Swap left Alt and left Super", null, 0x7005],
    ["MAGIC_UNSWAP_LALT_LGUI", "Unswap LAlt Super", "Undo the swap of left Alt and left Super", null, 0x7006],
    ["MAGIC_SWAP_RALT_RGUI", "Swap RAlt Super", "Swap right Alt and right Super", null, 0x7007],
    ["MAGIC_UNSWAP_RALT_RGUI", "Unswap RAlt Super", "Undo the swap of right Alt and right Super", null, 0x7008],
    ["MAGIC_GUI_ON", "Super On", "Enable the Super keys", null, 0x7009],
    ["MAGIC_GUI_OFF", "Super Off", "Disable the Super keys (gaming)", null, 0x700a],
    ["MAGIC_TOGGLE_GUI", "Super Tog", "Toggle the Super keys on/off", null, 0x700b],
    ["MAGIC_SWAP_CTL_GUI", "Swap Ctrl Super", "Swap Ctrl and Super on both sides", null, 0x701b],
    ["MAGIC_UNSWAP_CTL_GUI", "Unswap Ctrl Super", "Undo the swap of Ctrl and Super", null, 0x701c],
    ["MAGIC_TOGGLE_CTL_GUI", "Tog Ctrl Super", "Toggle swapping Ctrl and Super", null, 0x701d],
    ["KC_ASTG", "AS Tog", "Auto Shift: toggle", null, 0x7c15],
    ["KC_ASON", "AS On", "Auto Shift: on", null, 0x7c13],
    ["KC_ASOFF", "AS Off", "Auto Shift: off", null, 0x7c14],
    ["KC_ASUP", "AS Up", "Auto Shift: longer timeout", null, 0x7c11],
    ["KC_ASDN", "AS Dn", "Auto Shift: shorter timeout", null, 0x7c10],
    ["KC_ASRP", "AS Rpt", "Auto Shift: report timeout", null, 0x7c12],
    ["CMB_TOG", "Combo Tog", "Combos: toggle", null, 0x7c52],
    ["CMB_ON", "Combo On", "Combos: on", null, 0x7c50],
    ["CMB_OFF", "Combo Off", "Combos: off", null, 0x7c51],
    ["DYN_REC_START1", "Rec 1", "Dynamic macro 1: start recording", null, 0x7c53],
    ["DYN_REC_START2", "Rec 2", "Dynamic macro 2: start recording", null, 0x7c54],
    ["DYN_REC_STOP", "Rec Stop", "Dynamic macro: stop recording", null, 0x7c55],
    ["DYN_MACRO_PLAY1", "Play 1", "Dynamic macro 1: play", null, 0x7c56],
    ["DYN_MACRO_PLAY2", "Play 2", "Dynamic macro 2: play", null, 0x7c57],
  ];
  // FN_MO13 / FN_MO23 differ between v11 and v12
  const FN_MO = {10: [0x5f10, 0x5f11], 11: [0x7700, 0x7701], 12: [0x7c77, 0x7c78]};

  const LIGHTING = [
    ["BL_TOGG", "BL Tog", "Backlight toggle", 0x5cbf, 0x7802], ["BL_STEP", "BL Step", "Backlight: next level", 0x5cc0, 0x7805],
    ["BL_BRTG", "BL Breath", "Backlight breathing toggle", 0x5cc1, 0x7806], ["BL_ON", "BL On", "Backlight on", 0x5cbb, 0x7800],
    ["BL_OFF", "BL Off", "Backlight off", 0x5cbc, 0x7801], ["BL_INC", "BL +", "Backlight brighter", 0x5cbe, 0x7804],
    ["BL_DEC", "BL -", "Backlight dimmer", 0x5cbd, 0x7803],
    ["RGB_TOG", "RGB Tog", "RGB lighting on/off", 0x5cc2, 0x7820], ["RGB_MOD", "RGB Mode+", "Next RGB effect", 0x5cc3, 0x7821],
    ["RGB_RMOD", "RGB Mode-", "Previous RGB effect", 0x5cc4, 0x7822], ["RGB_HUI", "Hue+", "RGB hue up", 0x5cc5, 0x7823],
    ["RGB_HUD", "Hue-", "RGB hue down", 0x5cc6, 0x7824], ["RGB_SAI", "Sat+", "RGB saturation up", 0x5cc7, 0x7825],
    ["RGB_SAD", "Sat-", "RGB saturation down", 0x5cc8, 0x7826], ["RGB_VAI", "Bright+", "RGB brightness up", 0x5cc9, 0x7827],
    ["RGB_VAD", "Bright-", "RGB brightness down", 0x5cca, 0x7828], ["RGB_SPI", "Speed+", "RGB effect speed up", 0x5ccb, 0x7829],
    ["RGB_SPD", "Speed-", "RGB effect speed down", 0x5ccc, 0x782a],
    ["RGB_M_P", "Plain", "RGB mode: static", 0x5ccd, 0x782b], ["RGB_M_B", "Breathe", "RGB mode: breathing", 0x5cce, 0x782c],
    ["RGB_M_R", "Rainbow", "RGB mode: rainbow", 0x5ccf, 0x782d], ["RGB_M_SW", "Swirl", "RGB mode: swirl", 0x5cd0, 0x782e],
    ["RGB_M_SN", "Snake", "RGB mode: snake", 0x5cd1, 0x782f], ["RGB_M_K", "Knight", "RGB mode: knight rider", 0x5cd2, 0x7830],
    ["RGB_M_X", "Xmas", "RGB mode: christmas", 0x5cd3, 0x7831], ["RGB_M_G", "Gradient", "RGB mode: gradient", 0x5cd4, 0x7832],
  ];
  // RGB Matrix keycodes of QMK 0.27 and newer (older firmware controls the matrix with the RGB_* keys)
  const LIGHTING_NEW = [
    ["RM_TOGG", "RM Tog", "RGB matrix on/off (new firmware)", 0x7842], ["RM_NEXT", "RM Mode+", "RGB matrix next effect (new firmware)", 0x7843],
    ["RM_PREV", "RM Mode-", "RGB matrix previous effect (new firmware)", 0x7844], ["RM_HUEU", "RM Hue+", "RGB matrix hue up (new firmware)", 0x7845],
    ["RM_HUED", "RM Hue-", "RGB matrix hue down (new firmware)", 0x7846], ["RM_SATU", "RM Sat+", "RGB matrix saturation up (new firmware)", 0x7847],
    ["RM_SATD", "RM Sat-", "RGB matrix saturation down (new firmware)", 0x7848], ["RM_VALU", "RM Bri+", "RGB matrix brightness up (new firmware)", 0x7849],
    ["RM_VALD", "RM Bri-", "RGB matrix brightness down (new firmware)", 0x784a], ["RM_SPDU", "RM Spd+", "RGB matrix speed up (new firmware)", 0x784b],
    ["RM_SPDD", "RM Spd-", "RGB matrix speed down (new firmware)", 0x784c],
  ];

  const RANGES = {
    10: {MODS: 0x0100, MODS_MAX: 0x1fff, MOD_TAP: 0x6000, MOD_TAP_MAX: 0x7fff, LAYER_TAP: 0x4000, LAYER_TAP_MAX: 0x4fff,
         LAYER_MOD: 0x5900, LAYER_MOD_MAX: 0x59ff, LAYER_MOD_MASK: 0x0f, TO: 0x5000, TO_MAX: 0x501f,
         MO: 0x5100, MO_MAX: 0x511f, DF: 0x5200, DF_MAX: 0x521f, TG: 0x5300, TG_MAX: 0x531f,
         OSL: 0x5400, OSL_MAX: 0x541f, OSM: 0x5500, OSM_MAX: 0x55ff, TT: 0x5800, TT_MAX: 0x581f,
         MACRO: 0x5f12, MACRO_MAX: 0x5f21, KB: 0x5f80, KB_MAX: 0x5f8f},
    11: {MODS: 0x0100, MODS_MAX: 0x1fff, MOD_TAP: 0x2000, MOD_TAP_MAX: 0x3fff, LAYER_TAP: 0x4000, LAYER_TAP_MAX: 0x4fff,
         LAYER_MOD: 0x5000, LAYER_MOD_MAX: 0x51ff, LAYER_MOD_MASK: 0x1f, TO: 0x5200, TO_MAX: 0x521f,
         MO: 0x5220, MO_MAX: 0x523f, DF: 0x5240, DF_MAX: 0x525f, TG: 0x5260, TG_MAX: 0x527f,
         OSL: 0x5280, OSL_MAX: 0x529f, OSM: 0x52a0, OSM_MAX: 0x52bf, TT: 0x52c0, TT_MAX: 0x52df,
         MACRO: 0x7702, MACRO_MAX: 0x7711, KB: 0x7f00, KB_MAX: 0x7fff},
  };
  RANGES[12] = {...RANGES[11], MACRO: 0x7700, MACRO_MAX: 0x777f, KB: 0x7e00, KB_MAX: 0x7eff};

  const MODS = [["LCTL", 0x01, "Ctrl"], ["LSFT", 0x02, "Shift"], ["LALT", 0x04, "Alt"], ["LGUI", 0x08, "Super"]];
  const SHIFTED = {  // US labels of Shift+key
    KC_1: "!", KC_2: "@", KC_3: "#", KC_4: "$", KC_5: "%", KC_6: "^", KC_7: "&", KC_8: "*", KC_9: "(", KC_0: ")",
    KC_MINS: "_", KC_EQL: "+", KC_LBRC: "{", KC_RBRC: "}", KC_BSLS: "|", KC_SCLN: ":", KC_QUOT: "\"",
    KC_GRV: "~", KC_COMM: "<", KC_DOT: ">", KC_SLSH: "?",
  };
  const ALIASES = {  // other common QMK names, accepted when typing a keycode
    QK_BOOT: "RESET", QK_BOOTLOADER: "RESET", QK_RBT: "RESET", KC_SCRL: "KC_SLCK", KC_SCROLL_LOCK: "KC_SLCK",
    KC_NUM: "KC_NLCK", KC_NUM_LOCK: "KC_NLCK", KC_ENTER: "KC_ENT", KC_ESCAPE: "KC_ESC", KC_BACKSPACE: "KC_BSPC",
    KC_SPACE: "KC_SPC", KC_DELETE: "KC_DEL", KC_INSERT: "KC_INS", KC_RIGHT: "KC_RGHT", KC_TRANSPARENT: "KC_TRNS",
    _______: "KC_TRNS", XXXXXXX: "KC_NO", KC_RETURN: "KC_ENT", QK_GESC: "KC_GESC", NK_TOGG: "MAGIC_TOGGLE_NKRO",
    KC_PRINT_SCREEN: "KC_PSCR", KC_CAPS_LOCK: "KC_CAPS", KC_APPLICATION: "KC_APP", KC_LCMD: "KC_LGUI",
    KC_RCMD: "KC_RGUI", KC_LWIN: "KC_LGUI", KC_RWIN: "KC_RGUI", KC_LOPT: "KC_LALT", KC_ROPT: "KC_RALT",
    KC_ALGR: "KC_RALT", KC_PGUP: "KC_PGUP", KC_PAGE_UP: "KC_PGUP", KC_PAGE_DOWN: "KC_PGDN",
    KC_AUDIO_MUTE: "KC_MUTE", KC_AUDIO_VOL_UP: "KC_VOLU", KC_AUDIO_VOL_DOWN: "KC_VOLD", KC_MPLY: "KC_MPLY",
    EE_CLR: "QK_CLEAR_EEPROM", DB_TOGG: "DEBUG", UG_TOGG: "RGB_TOG", UG_NEXT: "RGB_MOD", UG_PREV: "RGB_RMOD",
    KC_MS_U: "KC_MS_UP", KC_MS_D: "KC_MS_DOWN", KC_MS_L: "KC_MS_LEFT", KC_MS_R: "KC_MS_RIGHT",
    KC_BTN1: "KC_MS_BTN1", KC_BTN2: "KC_MS_BTN2", KC_BTN3: "KC_MS_BTN3", KC_BTN4: "KC_MS_BTN4", KC_BTN5: "KC_MS_BTN5",
    KC_WH_U: "KC_MS_WH_UP", KC_WH_D: "KC_MS_WH_DOWN", KC_WH_L: "KC_MS_WH_LEFT", KC_WH_R: "KC_MS_WH_RIGHT",
  };

  const hex = (n) => "0x" + n.toString(16).padStart(4, "0");

  // Build the keycode set for one keyboard
  function forKeyboard({protocol, layers = 4, macros = 0, customKeycodes = [], lighting = true}) {
    const v = protocol >= 12 ? 12 : protocol === 11 ? 11 : 10;
    const R = RANGES[v];
    const byName = {}, byCode = {};
    const add = (name, label, title, code, cat) => {
      if (code == null) return;
      const e = {name, label, title: title || label, code, cat};
      byName[name] = e;
      if (!(code in byCode)) byCode[code] = e;
    };
    for (const [n, l, t, c] of BASIC) add(n, l, t, c, "basic");
    MOUSE.forEach(([n, l, t], i) => add(n, l, t, MOUSE_CODES[v === 10 ? "old" : "new"][i], "media"));
    if (v !== 10) for (const [n, l, t, c] of MAC_NEW) add(n, l, t, c, "media");
    for (const [n, l, t, c10, c] of SPECIAL) add(n, l, t, v === 10 ? c10 : c, "special");
    add("FN_MO13", "Fn1-3", "Fn 1 (layer 1, or layer 3 together with Fn 2)", FN_MO[v][0], "special");
    add("FN_MO23", "Fn2-3", "Fn 2 (layer 2, or layer 3 together with Fn 1)", FN_MO[v][1], "special");
    for (const [n, l, t, c10, c] of LIGHTING) add(n, l, t, v === 10 ? c10 : c, "lighting");
    if (v === 12) for (const [n, l, t, c] of LIGHTING_NEW) add(n, l, t, c, "lighting");

    const modsToNames = (m) => {
      const right = m & 0x10, names = [];
      for (const [n, bit, l] of MODS) if (m & bit) names.push({n: right ? "R" + n.slice(1) : n, l: right ? "R" + l : l});
      return names;
    };
    const modMaskString = (m) => modsToNames(m).map((x) => "MOD_" + x.n).join("|") || "0";
    const basicName = (c) => (byCode[c] && byCode[c].code < 0x100 ? byCode[c].name : hex(c));
    const basicLabel = (c) => (byCode[c] && byCode[c].code < 0x100 ? byCode[c].label || "∅" : hex(c));
    const macroCount = Math.min(macros, R.MACRO_MAX - R.MACRO + 1);

    // code -> {name, label, sub, title}
    function describe(code) {
      const e = byCode[code];
      if (e) return {name: e.name, label: e.label, title: e.title};
      if (code >= R.MODS && code <= R.MODS_MAX) {
        const m = (code >> 8) & 0x1f, base = code & 0xff;
        const mods = modsToNames(m);
        let name = basicName(base);
        for (const x of [...mods].reverse()) name = `${x.n}(${name})`;
        if (m === 0x02 && SHIFTED[basicName(base)]) {
          const s = SHIFTED[basicName(base)];
          return {name, label: s, title: `Shift + ${basicLabel(base)} (${s})`};
        }
        const lbl = mods.map((x) => x.l).join("+") + "+" + basicLabel(base);
        return {name, label: lbl, title: lbl};
      }
      if (code >= R.MOD_TAP && code <= R.MOD_TAP_MAX) {
        const m = (code >> 8) & 0x1f, base = code & 0xff;
        const ml = modsToNames(m).map((x) => x.l).join("+");
        return {name: `MT(${modMaskString(m)},${basicName(base)})`, label: basicLabel(base), sub: ml + " hold",
                title: `Tap: ${basicLabel(base)}, hold: ${ml}`};
      }
      if (code >= R.LAYER_TAP && code <= R.LAYER_TAP_MAX) {
        const layer = (code >> 8) & 0xf, base = code & 0xff;
        return {name: `LT(${layer},${basicName(base)})`, label: basicLabel(base), sub: `L${layer} hold`,
                title: `Tap: ${basicLabel(base)}, hold: layer ${layer}`};
      }
      if (code >= R.LAYER_MOD && code <= R.LAYER_MOD_MAX) {
        const shift = Math.log2(R.LAYER_MOD_MASK + 1);
        const rem = code - R.LAYER_MOD, layer = rem >> shift, m = rem & R.LAYER_MOD_MASK;
        const ml = modsToNames(m).map((x) => x.l).join("+");
        return {name: `LM(${layer},${modMaskString(m)})`, label: `LM${layer}`, sub: ml,
                title: `Hold: layer ${layer} with ${ml}`};
      }
      const layerFns = [["MO", "Hold: layer %"], ["TG", "Toggle layer %"], ["TO", "Switch to layer %"],
        ["DF", "Set base layer to %"], ["OSL", "One-shot layer % (next key only)"], ["TT", "Hold: layer %, tap 5×: toggle it"]];
      for (const [fn, t] of layerFns) {
        if (code >= R[fn] && code <= R[fn + "_MAX"]) {
          const n = code - R[fn];
          return {name: `${fn}(${n})`, label: `${fn}(${n})`, title: t.replace("%", n)};
        }
      }
      if (code >= R.OSM && code <= R.OSM_MAX) {
        const m = code - R.OSM, ml = modsToNames(m & 0x1f).map((x) => x.l).join("+");
        return {name: `OSM(${modMaskString(m & 0x1f)})`, label: "OSM", sub: ml, title: `One-shot ${ml} (next key only)`};
      }
      if (code >= R.MACRO && code <= R.MACRO_MAX) {
        const n = code - R.MACRO;
        return {name: `M${n}`, label: `M${n}`, title: `Macro ${n}`};
      }
      if (code >= R.KB && code <= R.KB_MAX) {
        const n = code - R.KB, ck = customKeycodes[n];
        if (ck) return {name: `CUSTOM(${n})`, label: ck.shortName || ck.name, title: ck.title || ck.name};
        return {name: `CUSTOM(${n})`, label: `Kb${n}`, title: `Keyboard-specific keycode ${n}`};
      }
      return {name: hex(code), label: hex(code), title: `Unknown keycode ${hex(code)}`};
    }

    // text -> code (throws Error with a readable message)
    function parse(text) {
      let s = text.trim().toUpperCase().replace(/\s+/g, "");
      if (!s) throw new Error("Type a keycode.");
      if (/^0X[0-9A-F]{1,4}$/.test(s)) return parseInt(s, 16);
      const named = (n) => {
        n = ALIASES[n] || n;
        if (byName[n]) return byName[n].code;
        if (byName["KC_" + n]) return byName["KC_" + n].code;
        if (ALIASES["KC_" + n] && byName[ALIASES["KC_" + n]]) return byName[ALIASES["KC_" + n]].code;
        const m = /^(?:M|MACRO)(\d+)$/.exec(n);
        if (m && +m[1] < (R.MACRO_MAX - R.MACRO + 1)) return R.MACRO + +m[1];
        const u = /^(?:USER|CUSTOM|QK_KB_)(\d+)$/.exec(n);
        if (u) return R.KB + +u[1];
        if (/^0X[0-9A-F]{1,4}$/.test(n)) return parseInt(n, 16);
        return null;
      };
      const basic = (n) => {
        const c = named(n);
        if (c == null || c > 0xff) throw new Error(`"${n}" is not a basic key (letters, digits, F-keys, etc.).`);
        return c;
      };
      const modMask = (str) => {
        let m = 0;
        for (const part of str.split("|")) {
          const p = part.replace(/^MOD_/, "");
          const table = {LCTL: 1, LSFT: 2, LALT: 4, LGUI: 8, RCTL: 0x11, RSFT: 0x12, RALT: 0x14, RGUI: 0x18,
                         HYPR: 0xf, MEH: 0x7, CTL: 1, SFT: 2, ALT: 4, GUI: 8};
          if (!(p in table)) throw new Error(`Unknown modifier "${part}". Use MOD_LCTL, MOD_LSFT, MOD_LALT, MOD_LGUI, MOD_RCTL …`);
          m |= table[p];
        }
        return m;
      };
      const plain = named(s);
      if (plain != null) return plain;
      const fn = /^([A-Z_0-9]+)\((.*)\)$/.exec(s);
      if (!fn) throw new Error(`Unknown keycode "${text.trim()}".`);
      const [, f, argStr] = fn;
      const args = splitArgs(argStr);
      const layerArg = (a) => {
        const n = parseInt(a, 10);
        if (!(n >= 0 && n < 16)) throw new Error("Layer must be a number from 0 to 15.");
        return n;
      };
      const modFns = {LCTL: 0x01, C: 0x01, LSFT: 0x02, S: 0x02, LALT: 0x04, A: 0x04, LOPT: 0x04, LGUI: 0x08, G: 0x08,
        LCMD: 0x08, LWIN: 0x08, RCTL: 0x11, RSFT: 0x12, RALT: 0x14, ALGR: 0x14, ROPT: 0x14, RGUI: 0x18,
        RCMD: 0x18, RWIN: 0x18, HYPR: 0x0f, MEH: 0x07, LCAG: 0x0d, LSG: 0x0a, SGUI: 0x0a, LAG: 0x0c, LCA: 0x05,
        LSA: 0x06, RSA: 0x16, RCS: 0x13, SAGR: 0x16, C_S: 0x03};
      if (f in modFns && args.length === 1) {
        const inner = parse(args[0]);
        if (inner > R.MODS_MAX) throw new Error("Modifiers can only wrap a basic key or another modifier.");
        const m = modFns[f], innerMods = (inner >> 8) & 0x1f;
        if (innerMods && ((innerMods ^ m) & 0x10)) throw new Error("Left and right modifiers cannot be mixed in one keycode.");
        return ((m | innerMods) << 8) | (inner & 0xff);
      }
      const tapFns = {LCTL_T: 1, CTL_T: 1, LSFT_T: 2, SFT_T: 2, LALT_T: 4, ALT_T: 4, LOPT_T: 4, LGUI_T: 8, GUI_T: 8,
        LCMD_T: 8, LWIN_T: 8, RCTL_T: 0x11, RSFT_T: 0x12, RALT_T: 0x14, ROPT_T: 0x14, ALGR_T: 0x14, RGUI_T: 0x18,
        RCMD_T: 0x18, RWIN_T: 0x18, HYPR_T: 0xf, ALL_T: 0xf, MEH_T: 0x7, C_S_T: 0x3, LCAG_T: 0xd, SGUI_T: 0xa};
      if (f in tapFns && args.length === 1) return R.MOD_TAP | (tapFns[f] << 8) | basic(args[0]);
      if (f === "MT" && args.length === 2) return R.MOD_TAP | (modMask(args[0]) << 8) | basic(args[1]);
      if (f === "LT" && args.length === 2) return R.LAYER_TAP | (layerArg(args[0]) << 8) | basic(args[1]);
      if (f === "LM" && args.length === 2) {
        const shift = Math.log2(R.LAYER_MOD_MASK + 1);
        const m = modMask(args[1]);
        if (m > R.LAYER_MOD_MASK) throw new Error("This firmware does not support right-hand modifiers in LM().");
        return R.LAYER_MOD | (layerArg(args[0]) << shift) | m;
      }
      if (["MO", "TG", "TO", "DF", "OSL", "TT"].includes(f) && args.length === 1) {
        const n = layerArg(args[0]);
        if (R[f] + n > R[f + "_MAX"]) throw new Error("Layer number too high.");
        return R[f] + n;
      }
      if (f === "OSM" && args.length === 1) return R.OSM | modMask(args[0]);
      if ((f === "MACRO" || f === "M") && args.length === 1) return named("M" + parseInt(args[0], 10)) ?? (() => { throw new Error("Macro number too high."); })();
      if ((f === "CUSTOM" || f === "USER") && args.length === 1) return R.KB + parseInt(args[0], 10);
      throw new Error(`Unknown function "${f}(…)".`);
    }

    function splitArgs(s) {
      const out = [];
      let depth = 0, cur = "";
      for (const ch of s) {
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
      }
      out.push(cur);
      return out.filter((x) => x !== "");
    }

    // Groups for the key picker
    function groups(layerCount) {
      const pick = (names) => names.map((n) => byName[n]).filter(Boolean);
      const range = (from, to) => BASIC.filter(([, , , c]) => c >= from && c <= to).map(([n]) => n);
      const layerItems = [];
      for (const fn of ["MO", "TG", "TO", "OSL", "TT", "DF"]) {
        for (let i = 0; i < layerCount; i++) {
          const code = R[fn] + i;
          layerItems.push({code, ...describe(code)});
        }
      }
      const shifted = Object.keys(SHIFTED).map((n) => {
        const code = 0x0200 | byName[n].code;
        return {code, ...describe(code)};
      });
      const out = [
        {id: "basic", name: "Basic", sections: [
          {name: "Special", items: pick(["KC_NO", "KC_TRNS"])},
          {name: "Letters", items: pick(range(0x04, 0x1d))},
          {name: "Numbers & symbols", items: pick([...range(0x1e, 0x27), ...range(0x2d, 0x38).filter((n) => n !== "KC_NUHS")])},
          {name: "Shifted symbols", items: shifted},
          {name: "Editing & navigation", items: pick(["KC_ESC", "KC_TAB", "KC_ENT", "KC_SPC", "KC_BSPC", "KC_DEL", "KC_INS",
            "KC_HOME", "KC_END", "KC_PGUP", "KC_PGDN", "KC_LEFT", "KC_UP", "KC_DOWN", "KC_RGHT", "KC_CAPS", "KC_PSCR",
            "KC_SLCK", "KC_PAUS", "KC_APP"])},
          {name: "Modifiers", items: pick(range(0xe0, 0xe7))},
          {name: "Function keys", items: pick([...range(0x3a, 0x45), ...range(0x68, 0x73)])},
          {name: "Numpad", items: pick([...range(0x53, 0x63), "KC_PEQL", "KC_PCMM"])},
          {name: "International (ISO / JIS / Korean)", items: pick(["KC_NUBS", "KC_NUHS", "KC_RO", "KC_KANA", "KC_JYEN",
            "KC_HENK", "KC_MHEN", "KC_HAEN", "KC_HANJ"])},
          {name: "Rarely used", items: pick([...range(0x74, 0x7e), "KC_LCAP", "KC_LNUM", "KC_LSCR", "KC_POWER"])},
        ]},
        {id: "media", name: "Media & mouse", sections: [
          {name: "Media", items: pick(["KC_MUTE", "KC_VOLD", "KC_VOLU", "KC_MPRV", "KC_MPLY", "KC_MNXT", "KC_MSTP",
            "KC_MRWD", "KC_MFFD", "KC_EJCT", "KC_MSEL"])},
          {name: "Screen & system", items: pick(["KC_BRID", "KC_BRIU", "KC_PWR", "KC_SLEP", "KC_WAKE", "KC_MCTL", "KC_LPAD"])},
          {name: "Apps & browser", items: pick(["KC_CALC", "KC_MAIL", "KC_MYCM", "KC_WWW_SEARCH", "KC_WWW_HOME",
            "KC_WWW_BACK", "KC_WWW_FORWARD", "KC_WWW_REFRESH", "KC_WWW_STOP", "KC_WWW_FAVORITES"])},
          {name: "Mouse keys", items: pick(MOUSE.map(([n]) => n))},
        ]},
        {id: "layers", name: "Layers", sections: [
          {name: "MO = hold for layer, TG = toggle, TO = switch to, OSL = next key only, TT = hold or tap 5× to toggle, DF = base layer",
           items: layerItems},
          {name: "Fn combos", items: pick(["FN_MO13", "FN_MO23"])},
        ]},
      ];
      if (lighting) {
        out.push({id: "lighting", name: "Lighting", sections: [
          {name: "RGB", items: pick(LIGHTING.filter(([n]) => n.startsWith("RGB")).map(([n]) => n))},
          ...(v === 12 ? [{name: "RGB matrix (only firmware from QMK 0.27 on, late 2024)", items: pick(LIGHTING_NEW.map(([n]) => n))}] : []),
          {name: "Single-color backlight", items: pick(LIGHTING.filter(([n]) => n.startsWith("BL")).map(([n]) => n))},
        ]});
      }
      if (macroCount > 0) {
        out.push({id: "macros", name: "Macros", sections: [
          {name: "Edit what they type in the Macros tab", items: Array.from({length: macroCount}, (_, i) => ({code: R.MACRO + i, ...describe(R.MACRO + i)}))},
        ]});
      }
      out.push({id: "special", name: "Special", sections: [
        {name: "Firmware", items: pick(["RESET", "QK_CLEAR_EEPROM", "DEBUG", "MAGIC_TOGGLE_NKRO"])},
        {name: "Dual-role keys", items: pick(["KC_GESC", "KC_LSPO", "KC_RSPC", "KC_LCPO", "KC_RCPC", "KC_LAPO", "KC_RAPC", "KC_SFTENT"])},
        {name: "Modifier swaps", items: pick(SPECIAL.filter(([n]) => n.startsWith("MAGIC_") && n !== "MAGIC_TOGGLE_NKRO").map(([n]) => n))},
        {name: "Auto Shift & combos", items: pick(["KC_ASTG", "KC_ASON", "KC_ASOFF", "KC_ASUP", "KC_ASDN", "KC_ASRP", "CMB_TOG", "CMB_ON", "CMB_OFF"])},
        {name: "Recorded macros", items: pick(["DYN_REC_START1", "DYN_REC_START2", "DYN_REC_STOP", "DYN_MACRO_PLAY1", "DYN_MACRO_PLAY2"])},
      ]});
      if (customKeycodes.length) {
        out.push({id: "custom", name: "Keyboard", sections: [
          {name: "Keys this keyboard adds", items: customKeycodes.map((_, i) => ({code: R.KB + i, ...describe(R.KB + i)}))},
        ]});
      }
      return out.map((g) => ({...g, sections: g.sections.filter((s) => s.items.length)}));
    }

    const basicKeys = BASIC.filter(([, , , c]) => c > 1).map(([n, l, t, c]) => ({name: n, label: l, title: t || l, code: c}));
    return {version: v, R, describe, parse, groups, basicKeys, macroCount, hex, modsToNames};
  }

  return {forKeyboard};
})();
