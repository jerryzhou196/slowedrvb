#!/bin/sh
# Builds slowedrvb-extension.zip for the Chrome Web Store from extension/, minus the
# open-latency debugging tools (trace.js, debug.html, debug.js). The unpacked
# extension/ folder keeps them for local debugging.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT

cp -R "$root/extension/." "$build/"
rm -f "$build/trace.js" "$build/debug.html" "$build/debug.js"
# popup.js falls back to a no-op tracer when trace.js isn't loaded
grep -v '<script src="trace.js"></script>' "$root/extension/popup.html" > "$build/popup.html"
if grep -rq 'trace.js\|debug.html\|debug.js' "$build/popup.html" "$build/manifest.json"; then
  echo "zip-extension: a debug file is still referenced" >&2
  exit 1
fi

rm -f "$root/slowedrvb-extension.zip"
(cd "$build" && zip -q -r -X "$root/slowedrvb-extension.zip" . -x '.*')
echo "built slowedrvb-extension.zip"
