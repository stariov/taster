#!/usr/bin/env bash
# Installs Taster for the current user. Remove it again with:  taster --uninstall
#
# What it puts on your computer (and nothing else):
#   ~/.local/share/taster/                    the program (Python + web page), plus a list of what was installed
#   ~/.local/bin/taster                       command to start it
#   ~/.local/share/applications/taster.desktop   entry in your app menu
#   3 marked lines in ~/.bashrc (or ~/.zshrc)  only if ~/.local/bin is not on your PATH yet
# It never uses sudo. The permission rule (70-taster.rules) is installed with one sudo command, see README.md.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/taster"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
APP="$DATA/taster"
BIN_DIR="$HOME/.local/bin"
BIN="$BIN_DIR/taster"
DESKTOP_DIR="$DATA/applications"
DESKTOP="$DESKTOP_DIR/taster.desktop"
RULE="/etc/udev/rules.d/70-taster.rules"
HERE="$(dirname "$SRC")"
MANIFEST="$APP/install-manifest"
MARK_BEGIN="# >>> taster >>> (added by Taster's install.sh, removed by: taster --uninstall)"
MARK_END="# <<< taster <<<"

say() { printf '%s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "run this as your normal user, not with sudo."
[ -f "$SRC/taster.py" ] || die "taster/taster.py not found next to install.sh."
command -v python3 >/dev/null || die "python3 is missing. Install it with:  sudo apt install python3"
python3 -c 'import sys; sys.exit(sys.version_info < (3, 8))' || die "Python 3.8 or newer is needed."

# directories and files this installer creates are recorded, so the uninstaller can remove exactly those again
created_dirs=()
old_rc=()
if [ -f "$MANIFEST" ]; then            # reinstall/update: keep the record of the earlier install
  while read -r kind path; do
    case "$kind" in dir) created_dirs+=("$path");; rc|rc-created) old_rc+=("$kind $path");; esac
  done < "$MANIFEST"
fi
mkdir_tracked() {
  local d="$1" missing=()
  while [ ! -d "$d" ]; do missing=("$d" "${missing[@]}"); d="$(dirname "$d")"; done
  for d in "${missing[@]}"; do mkdir "$d"; created_dirs+=("$d"); done
}

if [ -x "$BIN" ]; then "$BIN" --stop >/dev/null 2>&1 || true; fi

say "Installing Taster…"
mkdir_tracked "$DATA"
rm -rf "$APP"
mkdir "$APP"
cp -r "$SRC/." "$APP/"
find "$APP" -name '__pycache__' -prune -exec rm -rf {} +
cp "$(dirname "$SRC")/uninstall.sh" "$APP/uninstall.sh"
chmod 755 "$APP/taster.py" "$APP/uninstall.sh"

mkdir_tracked "$BIN_DIR"
cat > "$BIN" <<EOF
#!/bin/sh
# Taster launcher (installed by install.sh; remove with: taster --uninstall)
export PYTHONDONTWRITEBYTECODE=1
exec python3 -B "$APP/taster.py" "\$@"
EOF
chmod 755 "$BIN"

# Make "taster" work in new terminals. Ubuntu's ~/.profile only adds ~/.local/bin to PATH at login,
# and only if the folder existed then; a marked block in the shell's rc file covers the time until then.
rc_entries=("${old_rc[@]}")
case "$(basename "${SHELL:-bash}")" in
  zsh) RC="$HOME/.zshrc" ;;
  *)   RC="$HOME/.bashrc" ;;
esac
if ! grep -qxF "$MARK_BEGIN" "$RC" 2>/dev/null; then
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;                                   # already on PATH: nothing to add
    *)
      [ -e "$RC" ] || rc_entries+=("rc-created $RC")     # we create the file: uninstall deletes it if empty
      printf '\n%s\n%s\n%s\n' "$MARK_BEGIN" \
        'case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH";; esac' \
        "$MARK_END" >> "$RC"
      rc_entries+=("rc $RC")
      ;;
  esac
fi

mkdir_tracked "$DESKTOP_DIR"
cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Taster
GenericName=Keyboard configurator
Comment=Change what your keyboard's keys, knob, lighting and macros do
Exec="$BIN"
Icon=$APP/web/icon.svg
Terminal=false
Categories=Settings;HardwareSettings;
Keywords=keyboard;keymap;VIA;QMK;Keychron;macro;remap;
StartupNotify=false
EOF

{
  echo "file $BIN"
  echo "file $DESKTOP"
  for d in "${created_dirs[@]}"; do echo "dir $d"; done
  for e in "${rc_entries[@]}"; do echo "$e"; done
} | sort -u -k1,1 -k2 > "$MANIFEST.body"
{ echo "# Taster install record, used by uninstall.sh"; cat "$MANIFEST.body"; } > "$MANIFEST"
rm -f "$MANIFEST.body"

say ""
say "Done. Start Taster from your app menu, or open a new terminal and run:  taster"
if [ "$(grep -v '^#' "$RULE" 2>/dev/null)" != "$(grep -v '^#' "$HERE/70-taster.rules")" ]; then
  say ""
  say "One more step: install the permission rule (once), with this command from $HERE :"
  say "  sudo sh -c 'install -m 644 70-taster.rules /etc/udev/rules.d/ && udevadm control --reload-rules && udevadm trigger --subsystem-match=hidraw --action=change'"
fi
say "To remove everything again:  taster --uninstall   (or ./uninstall.sh here)"
