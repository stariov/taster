#!/usr/bin/env bash
# Removes Taster completely: program, launcher, app-menu entry, PATH lines,
# imported layout files, and any folder the installer had to create.
# It never uses sudo; if the permission rule is still installed, it prints the one command that removes it.
# Backups you saved yourself (in Downloads or elsewhere) are yours and are not touched.
set -uo pipefail

DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
APP="$DATA/taster"
MANIFEST="$APP/install-manifest"
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/taster"
RUNTIME="${XDG_RUNTIME_DIR:-}/taster.json"

say() { printf '%s\n' "$*"; }

if [ "$(id -u)" -eq 0 ]; then
  say "Run this as your normal user, not with sudo." >&2
  exit 1
fi
if [ ! -f "$MANIFEST" ]; then
  say "Taster is not installed (no $MANIFEST)."
  exit 0
fi

if [ "${1:-}" != "-y" ]; then
  read -r -p "Remove Taster from this computer? [y/N] " answer
  case "$answer" in y|Y|yes|Yes) ;; *) say "Nothing removed."; exit 0;; esac
fi

# stop a running Taster
if [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -f "$RUNTIME" ]; then
  pid="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["pid"])' "$RUNTIME" 2>/dev/null || true)"
  if [ -n "$pid" ] && tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q taster.py; then
    kill "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
  fi
  rm -f "$RUNTIME"
fi

rule_left=0
files=(); dirs=(); rcs=(); rcs_created=()
while read -r kind path; do
  case "$kind" in
    file) files+=("$path");;
    dir) dirs+=("$path");;
    rc) rcs+=("$path");;
    rc-created) rcs_created+=("$path");;
  esac
done < "$MANIFEST"

for f in "${files[@]}"; do rm -f "$f" && say "removed $f"; done

# the PATH lines the installer added to the shell rc file, between its markers
for rc in "${rcs[@]}"; do
  [ -f "$rc" ] || continue
  python3 - "$rc" <<'EOF'
import re, sys
p = sys.argv[1]
s = open(p).read()
s = re.sub(r"\n?# >>> taster >>>[^\n]*\n.*?# <<< taster <<<\n?", "", s, flags=re.S)
open(p, "w").write(s)
EOF
  say "removed Taster's PATH lines from $rc"
done
for rc in "${rcs_created[@]}"; do
  if [ -f "$rc" ] && [ -z "$(tr -d '[:space:]' < "$rc")" ]; then rm -f "$rc" && say "removed $rc (it was created by the installer)"; fi
done

if [ -e /etc/udev/rules.d/70-taster.rules ]; then
  rule_left=1
fi

if [ -e "$CONFIG" ]; then
  created=()
  if [ -f "$CONFIG/created-folders" ]; then mapfile -t created < "$CONFIG/created-folders"; fi
  rm -rf "$CONFIG" && say "removed $CONFIG (layout files you loaded)"
  for d in "${created[@]}"; do [ -d "$d" ] && rmdir "$d" 2>/dev/null && say "removed empty folder $d"; done
fi
rm -rf "$APP" && say "removed $APP"

# folders the installer created: remove them if nothing else is in them now (deepest first)
for ((i=${#dirs[@]}-1; i>=0; i--)); do
  [ -d "${dirs[$i]}" ] && rmdir "${dirs[$i]}" 2>/dev/null && say "removed empty folder ${dirs[$i]}"
done

say ""
say "Taster is removed. Your keyboard keeps its current settings (they are stored on the keyboard)."
if [ "$rule_left" = 1 ]; then
  say ""
  say "Last step: remove the permission rule with:"
  say "  sudo sh -c 'rm -f /etc/udev/rules.d/70-taster.rules && udevadm control --reload-rules'"
fi
