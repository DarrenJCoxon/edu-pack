#!/bin/bash
# Double-click to install the edu-pack skills into DeepSeek Harness.
# Everything happens in this window; restart the app afterwards.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  /usr/bin/osascript -e 'display alert "Node.js not found" message "edu-pack needs Node.js (20 or newer). Install it, or use the harness runtime, then run this again." as critical buttons {"OK"} default button "OK"' >/dev/null 2>&1
  exit 1
fi

node "${HERE}/install.mjs" "$@"
status=$?

if [ "$status" -eq 0 ]; then
  /usr/bin/osascript -e 'display notification "Restart DeepSeek Harness to finish" with title "edu-pack installed"' >/dev/null 2>&1
fi

echo
echo "You can close this window."
exit "$status"
