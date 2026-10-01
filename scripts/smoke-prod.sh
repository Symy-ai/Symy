#!/usr/bin/env bash

set -u

DEFAULT_BASE_URL='https://symy-git-main-spark-huang-s-projects.vercel.app'
BASE_URL="${BASE_URL:-$DEFAULT_BASE_URL}"
case "$BASE_URL" in
  http://*|https://*) ;;
  *)
    printf 'FAIL BASE_URL — must start with http:// or https://\n' >&2
    exit 2
    ;;
esac
while [[ "$BASE_URL" != "${BASE_URL%/}" ]]; do
  BASE_URL="${BASE_URL%/}"
done
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-30}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

TOTAL=0
FAILED=0

pass() {
  TOTAL=$((TOTAL + 1))
  printf 'PASS %s — %s\n' "$1" "$2"
}

fail() {
  TOTAL=$((TOTAL + 1))
  FAILED=$((FAILED + 1))
  printf 'FAIL %s — %s\n' "$1" "$2"
}

request() {
  local method="$1"
  local path="$2"
  local body="${3-}"
  local content_type="${4-}"

  : > "$WORKDIR/headers"
  : > "$WORKDIR/body"

  if [[ -n "$body" ]]; then
    STATUS="$(curl --silent --show-error --max-time "$TIMEOUT_SECONDS" \
      --request "$method" \
      --header "Content-Type: $content_type" \
      --data "$body" \
      --dump-header "$WORKDIR/headers" \
      --output "$WORKDIR/body" \
      --write-out '%{http_code}' \
      "$BASE_URL$path")"
  else
    STATUS="$(curl --silent --show-error --max-time "$TIMEOUT_SECONDS" \
      --request "$method" \
      --dump-header "$WORKDIR/headers" \
      --output "$WORKDIR/body" \
      --write-out '%{http_code}' \
      "$BASE_URL$path")"
  fi

  CURL_EXIT=$?
  LOCATION="$(grep -i '^location:' "$WORKDIR/headers" | head -n 1 || true)"
  LOCATION="${LOCATION#*[Ll]ocation: }"
  LOCATION="${LOCATION%$'\r'}"
  BODY="$(cat "$WORKDIR/body")"
}

health() {
  local actual="curl exit $CURL_EXIT"
  [[ "$CURL_EXIT" -eq 0 ]] && actual="status $STATUS"
  if [[ "$CURL_EXIT" -eq 0 && "$STATUS" == "200" ]] &&
    grep -q '"status":"ok"' <<<"$BODY" &&
    grep -q '"supabase":"ok"' <<<"$BODY" &&
    grep -Eq '"letta":"(ok|skip)"' <<<"$BODY"; then
    pass 'GET /api/health' "$actual; status=ok, supabase=ok, letta=ok|skip"
  else
    fail 'GET /api/health' "expected status 200, status=ok, supabase=ok, letta=ok|skip; actual $actual; body=${BODY:0:160}"
  fi
}

root_redirect() {
  local actual="curl exit $CURL_EXIT"
  [[ "$CURL_EXIT" -eq 0 ]] && actual="status $STATUS, location=$LOCATION"
  if [[ "$CURL_EXIT" -eq 0 && "$STATUS" == "307" && "$LOCATION" == *"/en" ]]; then
    pass 'GET /' "$actual"
  else
    fail 'GET /' "expected status 307, location ending /en; actual $actual"
  fi
}

zh_page() {
  local actual="curl exit $CURL_EXIT"
  [[ "$CURL_EXIT" -eq 0 ]] && actual="status $STATUS"
  if [[ "$CURL_EXIT" -eq 0 && "$STATUS" == "200" ]] &&
    grep -Eq '/_next/static/(immutable/chunks|css)/[^"'"'"' ]+\.css' <<<"$BODY"; then
    pass 'GET /zh' "$actual; CSS chunk present"
  else
    fail 'GET /zh' "expected status 200 with Next CSS chunk; actual $actual; body=${BODY:0:160}"
  fi
}

admin_unauthorized() {
  local actual="curl exit $CURL_EXIT"
  [[ "$CURL_EXIT" -eq 0 ]] && actual="status $STATUS"
  if [[ "$CURL_EXIT" -eq 0 && "$STATUS" == "401" ]] && grep -q '"error"' <<<"$BODY"; then
    pass 'GET /api/admin/letta-diag' "$actual; unauthorized JSON"
  else
    fail 'GET /api/admin/letta-diag' "expected status 401 with error JSON; actual $actual; body=${BODY:0:160}"
  fi
}

chat_validation() {
  local actual="curl exit $CURL_EXIT"
  [[ "$CURL_EXIT" -eq 0 ]] && actual="status $STATUS"
  if [[ "$CURL_EXIT" -eq 0 && "$STATUS" == "400" ]] &&
    grep -q '"error":"Validation failed"' <<<"$BODY" &&
    grep -q '"issues"' <<<"$BODY"; then
    pass 'POST /api/chat' "$actual; zod issues present"
  else
    fail 'POST /api/chat' "expected status 400 with zod issues; actual $actual; body=${BODY:0:160}"
  fi
}

waitlist_subscribe() {
  local email="symy-smoke-$(date +%s)-$$@example.invalid"
  local actual="curl exit $CURL_EXIT"
  [[ "$CURL_EXIT" -eq 0 ]] && actual="status $STATUS"
  if [[ "$CURL_EXIT" -eq 0 && "$STATUS" == "200" ]] &&
    grep -q '"success":true' <<<"$BODY"; then
    pass 'POST /api/waitlist/subscribe' "$actual; dummy email $email"
  else
    fail 'POST /api/waitlist/subscribe' "expected status 200 success=true; actual $actual; body=${BODY:0:160}"
  fi
}

reflections_unauthorized() {
  local actual="curl exit $CURL_EXIT"
  [[ "$CURL_EXIT" -eq 0 ]] && actual="status $STATUS"
  if [[ "$CURL_EXIT" -eq 0 && "$STATUS" == "401" ]] &&
    grep -q '"error":"Not authenticated"' <<<"$BODY"; then
    pass 'POST /api/reflections' "$actual; unauthorized JSON"
  else
    fail 'POST /api/reflections' "expected status 401 Not authenticated; actual $actual; body=${BODY:0:160}"
  fi
}

export_data_unauthorized() {
  local actual="curl exit $CURL_EXIT"
  [[ "$CURL_EXIT" -eq 0 ]] && actual="status $STATUS"
  if [[ "$CURL_EXIT" -eq 0 && "$STATUS" == "401" ]] &&
    grep -q '"error":"Not authenticated"' <<<"$BODY"; then
    pass 'GET /api/user/export-data' "$actual; unauthorized JSON"
  else
    fail 'GET /api/user/export-data' "expected status 401 Not authenticated; actual $actual; body=${BODY:0:160}"
  fi
}

printf 'Symy smoke suite\nTarget: %s\n\n' "$BASE_URL"

request GET /api/health
health
request GET /
root_redirect
request GET /zh
zh_page
request GET /api/admin/letta-diag
admin_unauthorized
request POST /api/chat '{}' application/json
chat_validation
request POST /api/waitlist/subscribe "{\"email\":\"symy-smoke-$(date +%s)-$$@example.invalid\"}" application/json
waitlist_subscribe
request POST /api/reflections '{"text":"smoke"}' application/json
reflections_unauthorized
request GET /api/user/export-data
export_data_unauthorized

printf '\nSummary: %d/%d passed, %d failed\n' "$((TOTAL - FAILED))" "$TOTAL" "$FAILED"
[[ "$FAILED" -eq 0 ]]
