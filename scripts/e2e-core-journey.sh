#!/usr/bin/env bash
set -euo pipefail

unset ALL_PROXY all_proxy HTTP_PROXY http_proxy HTTPS_PROXY https_proxy
export NO_PROXY=localhost,127.0.0.1
export BASE_URL="${BASE_URL:-http://localhost:3000}"
CDP_URL="${CDP_URL:-http://127.0.0.1:9225}"
PROFILE_DIR="${E2E_CHROME_PROFILE:-/tmp/symy-e2e-chrome}"
PYTHON_BIN="${E2E_PYTHON:-$(command -v python3 || true)}"

cdp_alive() {
  curl --silent --show-error --max-time 2 "$CDP_URL/json/version" >/dev/null 2>&1
}

if cdp_alive; then
  echo "[e2e] reusing Chrome on $CDP_URL"
else
  echo "[e2e] starting Chrome on $CDP_URL"
  if command -v google-chrome >/dev/null 2>&1; then
    CHROME_BIN=google-chrome
  elif command -v chromium >/dev/null 2>&1; then
    CHROME_BIN=chromium
  elif command -v chromium-browser >/dev/null 2>&1; then
    CHROME_BIN=chromium-browser
  else
    echo "Chrome/Chromium executable not found" >&2
    exit 1
  fi
  "$CHROME_BIN" --headless=new --remote-debugging-port=9225 --user-data-dir="$PROFILE_DIR" --no-first-run --no-default-browser-check about:blank >/tmp/symy-e2e-chrome.log 2>&1 &
  CHROME_PID=$!
  trap 'kill "$CHROME_PID" 2>/dev/null || true' EXIT
  for _ in {1..30}; do
    cdp_alive && break
    sleep 0.5
  done
  cdp_alive || { echo "Chrome failed to start; see /tmp/symy-e2e-chrome.log" >&2; exit 1; }
fi

[[ -n "$PYTHON_BIN" && -x "$PYTHON_BIN" ]] || { echo "python3 executable not found" >&2; exit 1; }

"$PYTHON_BIN" "$(dirname "$0")/e2e-core-journey.py" --base-url "$BASE_URL" --cdp-url "$CDP_URL" "$@"
