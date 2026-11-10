#!/bin/bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
proxy_url='http://127.0.0.1:18089'
runtime_dir="${TMPDIR:-/tmp}/wirecove-dpi"
mkdir -p "$runtime_dir"

cleanup() {
  launchctl remove wirecove.discord.launch 2>/dev/null || true
  "$here/stop-proxy.sh" >/dev/null 2>&1 || true
  /usr/bin/open -a Discord 2>/dev/null || true
}
success=0
on_exit() { if [ "$success" -ne 1 ]; then cleanup; fi; }
trap on_exit EXIT

"$here/start-proxy.sh"
if ! /usr/bin/curl --silent --show-error --fail --proxy "$proxy_url" \
  --connect-timeout 4 --max-time 10 https://discord.com/api/v10/gateway \
  --output /dev/null; then
  echo 'Discord API DPI yolu üzerinden doğrulanamadı.' >&2
  exit 1
fi

if pgrep -f '^/Applications/Discord.app/Contents/MacOS/Discord' >/dev/null; then
  osascript -e 'tell application "Discord" to quit'
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    pgrep -f '^/Applications/Discord.app/Contents/MacOS/Discord' >/dev/null || break
    sleep 1
  done
fi
if pgrep -f '^/Applications/Discord.app/Contents/MacOS/Discord' >/dev/null; then
  echo 'Discord kapanmadı; DPI yolu başlatılamadı.' >&2
  exit 1
fi

launchctl remove wirecove.discord.launch 2>/dev/null || true
launchctl submit -l wirecove.discord.launch \
  -o "$runtime_dir/discord.stdout.log" \
  -e "$runtime_dir/discord.stderr.log" -- \
  /usr/bin/env "HTTPS_PROXY=$proxy_url" "HTTP_PROXY=$proxy_url" \
  "ALL_PROXY=$proxy_url" \
  /Applications/Discord.app/Contents/MacOS/Discord \
  "--proxy-server=$proxy_url"

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if /usr/bin/pgrep -fl '^/Applications/Discord.app/Contents/MacOS/Discord' | /usr/bin/grep -F -- '--proxy-server=http://127.0.0.1:18089' >/dev/null; then
    success=1
    echo 'Discord DPI yolu etkin.'
    exit 0
  fi
  sleep 1
done
echo 'Discord proxy ile başlatılamadı.' >&2
exit 1
