#!/bin/bash
set -euo pipefail

host=/Applications/WirecoveMacHost.app/Contents/MacOS/WirecoveMacHost
probe=/tmp/wirecove-live-probe

if [[ ! -x "$host" || ! -x "$probe" ]]; then
  echo 'Build the host and LiveProbe before running this test.' >&2
  exit 1
fi
if ! /usr/sbin/lsof -nP -iTCP:18089 -sTCP:LISTEN | /usr/bin/grep -q spoofdpi; then
  echo 'SpoofDPI is not listening on 127.0.0.1:18089.' >&2
  exit 1
fi

echo 'Direct baseline:'
"$probe" https://example.com/

cleanup() { "$host" disconnect || true; }
trap cleanup EXIT

"$host" connect example.com
for _ in 1 2 3 4 5 6 7 8 9 10; do
  state=$("$host" status)
  echo "$state"
  [[ "$state" == 'Proxy status: connected' ]] && break
  /bin/sleep 1
done
if [[ "$state" != 'Proxy status: connected' ]]; then
  echo 'Proxy did not reach connected state.' >&2
  exit 1
fi

echo 'Selected-domain request:'
/bin/sleep 1
started=$(/bin/date '+%Y-%m-%d %H:%M:%S')
http_code=$(/usr/bin/curl --noproxy '*' --http1.1 -sS -o /dev/null \
  -w '%{http_code}' --max-time 15 "https://example.com/?wirecove_tcp=$(/bin/date +%s)")
echo "HTTP $http_code"
[[ "$http_code" == '200' ]] || exit 1
echo 'Unselected-domain request:'
unselected_code=$(/usr/bin/curl --noproxy '*' --http1.1 -sS -o /dev/null \
  -w '%{http_code}' --max-time 15 "https://www.iana.org/?wirecove_direct=$(/bin/date +%s)")
echo "HTTP $unselected_code"
[[ "$unselected_code" == '200' ]] || exit 1
echo 'Proxy logs:'
events=$(/usr/bin/log show --start "$started" --style compact \
  --predicate 'subsystem == "org.wirecove"' 2>/dev/null)
echo "$events" | /usr/bin/tail -30
echo "$events" | /usr/bin/grep -q 'Selected TCP flow claimed'
echo "$events" | /usr/bin/grep -q 'Local CONNECT established'
