#!/bin/bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
if pgrep -f '^/Applications/Discord.app/Contents/MacOS/Discord' >/dev/null; then
  osascript -e 'tell application "Discord" to quit'
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    pgrep -f '^/Applications/Discord.app/Contents/MacOS/Discord' >/dev/null || break
    sleep 1
  done
fi
launchctl remove wirecove.discord.launch 2>/dev/null || true
"$here/stop-proxy.sh"
/usr/bin/open -a Discord
echo 'Discord doğrudan açıldı.'
