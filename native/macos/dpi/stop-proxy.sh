#!/bin/bash
set -euo pipefail
launchctl remove wirecove.dpi.proxy 2>/dev/null || true
echo 'DPI motoru durduruldu.'
