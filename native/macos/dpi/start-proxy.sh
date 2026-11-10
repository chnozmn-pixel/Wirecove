#!/bin/bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
runtime_dir="${TMPDIR:-/tmp}/wirecove-dpi"
mkdir -p "$runtime_dir"
launchctl remove wirecove.dpi.proxy 2>/dev/null || true
launchctl submit -l wirecove.dpi.proxy \
  -o "$runtime_dir/spoofdpi.stdout.log" \
  -e "$runtime_dir/spoofdpi.stderr.log" -- \
  "$here/spoofdpi" --clean --no-tui --app-mode http \
  --listen-addr 127.0.0.1:18089 \
  --dns-mode https --dns-https-url https://1.1.1.1/dns-query \
  --https-split-mode chunk --https-chunk-size 1 --log-level info
for attempt in 1 2 3 4 5; do
  if /usr/sbin/lsof -nP -iTCP:18089 -sTCP:LISTEN 2>/dev/null | grep -q spoofdpi; then
    echo 'DPI motoru hazır.'
    exit 0
  fi
  sleep 1
done
launchctl remove wirecove.dpi.proxy 2>/dev/null || true
echo 'DPI motoru başlatılamadı.' >&2
exit 1
