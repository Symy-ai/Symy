#!/usr/bin/env bash
# Idempotent installer for the local Symy services on this WSL host.
#
# Does, in order:
#   1. build /home/spark/venvs/{search,orch}          (setup-venvs.sh, as spark)
#   2. make Milvus containers restart on docker start (docker update --restart unless-stopped)
#      and start them if they are down
#   3. install symy-search.service / symy-orch.service, enable + (re)start them
#   4. report health of :8010 / :8082
#
# Safe to re-run: venvs are reused, docker update is a no-op once applied,
# units are overwritten and restarted. Never run by CI — host-local only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_ROOT="${RUNTIME_ROOT:-/home/spark/runtime/Shopping-AI}"
ENV_FILE="$RUNTIME_ROOT/.env"
UNIT_DIR="/etc/systemd/system"
UNITS=(symy-search.service symy-orch.service)
MILVUS_CONTAINERS=(milvus-etcd milvus-minio milvus-standalone)
MILVUS_HEALTHZ_URL="${MILVUS_HEALTHZ_URL:-http://localhost:9091/healthz}"

if [[ $EUID -eq 0 ]]; then
  SUDO_CMD=()
else
  SUDO_CMD=(sudo)
fi

# docker needs sudo unless the current user can talk to the daemon already
if docker info >/dev/null 2>&1; then
  DOCKER_CMD=(docker)
else
  DOCKER_CMD=("${SUDO_CMD[@]}" docker)
fi

log()  { echo "[install] $*"; }
warn() { echo "[install] WARNING: $*" >&2; }
die()  { echo "[install] ERROR: $*" >&2; exit 1; }

# ---- preflight ------------------------------------------------------------

[[ -r "$ENV_FILE" ]] || die "$ENV_FILE not readable — LLM/EMBED keys live there (see README.md)"
[[ -f "$SCRIPT_DIR/symy-search.service" && -f "$SCRIPT_DIR/symy-orch.service" ]] \
  || die "unit files not found next to install.sh"

# ---- 1. venvs (as spark, so ownership stays with spark) --------------------

log "building venvs"
if [[ $EUID -eq 0 ]]; then
  sudo -u spark -H -- "$SCRIPT_DIR/setup-venvs.sh"
else
  "$SCRIPT_DIR/setup-venvs.sh"
fi

# ---- 2. Milvus containers ---------------------------------------------------

log "setting restart=unless-stopped on ${MILVUS_CONTAINERS[*]}"
for c in "${MILVUS_CONTAINERS[@]}"; do
  if ! "${DOCKER_CMD[@]}" update --restart unless-stopped "$c"; then
    warn "docker update failed for $c (container missing? Milvus not installed?)"
  fi
done

log "starting Milvus containers if stopped"
for c in "${MILVUS_CONTAINERS[@]}"; do
  state="$("${DOCKER_CMD[@]}" inspect -f '{{.State.Running}}' "$c" 2>/dev/null || echo missing)"
  if [[ "$state" != "true" ]]; then
    "${DOCKER_CMD[@]}" start "$c" || warn "could not start $c"
    [[ "$c" == "milvus-minio" ]] && sleep 4   # etcd+minio before standalone
  fi
done

log "waiting for Milvus healthz"
milvus_ok=0
for _ in $(seq 1 30); do
  if curl -4 -s --noproxy '*' -o /dev/null -m 3 "$MILVUS_HEALTHZ_URL"; then
    milvus_ok=1
    break
  fi
  sleep 2
done
if [[ $milvus_ok -eq 1 ]]; then
  log "Milvus healthy"
else
  warn "Milvus healthz not answering on $MILVUS_HEALTHZ_URL — search will crash-loop until it is up"
fi

# ---- 3. systemd units --------------------------------------------------------

log "installing unit files to $UNIT_DIR"
"${SUDO_CMD[@]}" cp -f "$SCRIPT_DIR/symy-search.service" "$SCRIPT_DIR/symy-orch.service" "$UNIT_DIR/"
"${SUDO_CMD[@]}" systemctl daemon-reload
"${SUDO_CMD[@]}" systemctl enable "${UNITS[@]}"
# restart (not just enable --now) so re-runs pick up unit/script changes
"${SUDO_CMD[@]}" systemctl restart "${UNITS[@]}"

# ---- 4. health report --------------------------------------------------------

wait_http() {
  local url="$1" tries="$2" i code
  for ((i = 1; i <= tries; i++)); do
    code="$(curl -4 -s --noproxy '*' -o /dev/null -w '%{http_code}' -m 3 "$url" || true)"
    # any HTTP response (even 404) means the server is up
    if [[ "$code" != "000" && -n "$code" ]]; then
      echo "up (http $code)"
      return 0
    fi
    sleep 2
  done
  echo "no answer"
  return 1
}

log "search   : $(wait_http http://localhost:8010/health 20 || true)"
log "orch     : $(wait_http http://localhost:8082/docs 20 || true)"
if [[ $milvus_ok -eq 0 ]]; then
  warn "Milvus still down — see: docker ps | grep milvus"
fi

log "done. logs: journalctl -u symy-search -u symy-orch -f"
