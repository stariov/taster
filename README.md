# Taster

A keyboard configurator for keyboards with VIA-compatible firmware (QMK), such as the Keychron Q3.
It works like the VIA web app, but runs locally and needs nothing besides Python 3.

What you can do with it:

- **Keymap:** change what every key does, on every layer. That includes the knob (press, turn
  left, turn right), shortcuts like Ctrl+C, keys that tap one thing and hold another,
  layer keys, media keys and mouse keys. Undo is Ctrl+Z.
- **Lighting:** presets, brightness, effect, speed and color. Changes are a live preview until you click Save.
- **Macros:** keys that type text or press key sequences.
- **Key tester:** shows every switch that works, read straight from the keyboard.
- **Settings:** save or load a backup file, reset the keymap to the factory default, and see
  keyboard info.

All changes are stored on the keyboard itself, so they keep working on any computer and with
Taster closed.

## Install

Run this on the computer the keyboard is plugged into (not inside a container), from this folder:

```sh
./install.sh
```

Then install the permission rule, once (this is the only step that needs sudo; run it in this folder):

```sh
sudo sh -c 'install -m 644 70-taster.rules /etc/udev/rules.d/ && udevadm control --reload-rules && udevadm trigger --subsystem-match=hidraw --action=change'
```

Then start **Taster** from
the app menu, or run `taster` in a terminal. It opens in a Chromium, Chrome or Brave app window
if one of those browsers is installed, and otherwise in your default browser. Taster stops by
itself shortly after you close the window.

If the keyboard was plugged in when you ran the sudo command and Taster cannot reach it, unplug it and plug it back in once.

## Uninstall

```sh
taster --uninstall        # or ./uninstall.sh in this folder
```

and remove the permission rule (the only step that needs sudo):

```sh
sudo sh -c 'rm -f /etc/udev/rules.d/70-taster.rules && udevadm control --reload-rules'
```

Together they remove everything the installer and the rule command created, plus anything Taster created while running:

| What | Where |
|---|---|
| Program | `~/.local/share/taster/` (this also holds the install record) |
| Command | `~/.local/bin/taster` |
| PATH lines (only if `~/.local/bin` was not on PATH) | a marked 3-line block in `~/.bashrc` (or `~/.zshrc`) |
| App-menu entry | `~/.local/share/applications/taster.desktop` |
| Permission rule (root, via the sudo command) | `/etc/udev/rules.d/70-taster.rules` |
| Layout files you loaded | `~/.config/taster/` (only exists if you loaded one) |
| Folders that did not exist before | removed again if they are empty |

Backup files you saved yourself are not touched. The keyboard keeps its settings. Access that
was already granted to the keyboard ends at the next replug or reboot.

## Notes

- **Permission rule:** it matches only the VIA configuration interface (HID usage page 0xFF60,
  usage 0x61), and only for the logged-in user. The keyboard's typing interfaces are not opened up.
- **Layout files:** Taster has the Keychron Q3 ANSI Knob layout built in (`definitions/`). For
  another keyboard, load its VIA definition (.json, or the .zip from Keychron's site) when Taster
  asks for it.
- **Macros:** typed text uses the US layout and plain ASCII. Macro steps can use basic keys and
  modifiers, but not layer keys or other special keys.
- **Security:** the local server listens only on 127.0.0.1. It needs a random per-session key and
  rejects requests from other web pages.

## Development

Try it without a keyboard, using a simulated Q3:

```sh
TASTER_FAKE=tests/fake_device.py python3 -B taster/taster.py
```

Layout: `taster/taster.py` is the server and the hidraw access (Python standard library only).
`taster/web/` holds the interface: `via.js` (protocol), `keycodes.js` (keycode tables per VIA
protocol version), `kle.js` (layout parser), `app.js` (UI). Keycode numbers and the lighting menus
come from the VIA project (the-via/app, the-via/reader).

Status: tested on a real Keychron Q3 ANSI Knob (firmware v1.7, VIA protocol 11) with every tab,
and against the simulated keyboard with headless Chromium. Other keyboards should work with their
VIA definition, but have not been tested.

## How it was made

Most of the code was written by Claude (Anthropic's AI model) through Claude Code. I decided what it
should do and how it should look, and tested it on my own keyboard.

## License

GPL-3.0, see `LICENSE`. Taster uses keycode tables and lighting menus from the VIA project
(the-via/app, the-via/reader), which are GPL-3.0. The bundled Keychron Q3 layout
(`taster/definitions/3434_0121.json`) is the keyboard's VIA definition, as published in
the-via/keyboards (GPL-3.0).

Taster is not affiliated with Keychron or the VIA project.
