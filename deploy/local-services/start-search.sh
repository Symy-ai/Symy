#!/usr/bin/env bash
# Foreground launcher for the local search service (:8010, Milvus catalog retrieval).
# Used as ExecStart by symy-search.service; also runnable by hand.
# Keys (EMBED_* etc.) come from $RUNTIME_ROOT/.env — never commit them here.
set -euo pipefail

RUNTIME_ROOT="${RUNTIME_ROOT:-/home/spark/runtime/Shopping-AI}"
VENV_PY="${VENV_PY:-/home/spark/venvs/search/bin/python}"
ENV_FILE="${ENV_FILE:-$RUNTIME_ROOT/.env}"
PORT="${PORT:-8010}"

if [[ ! -x "$VENV_PY" ]]; then
  echo "ERROR: $VENV_PY not found — run setup-venvs.sh first" >&2
  exit 1
fi
if [[ ! -r "$ENV_FILE" ]]; then
  echo "ERROR: env file $ENV_FILE not readable (EMBED_*/MILVUS_* live there)" >&2
  exit 1
fi

cd "$RUNTIME_ROOT"

# WSL 里的代理会劫持 localhost 和大模型直连，全部清掉
unset ALL_PROXY all_proxy HTTP_PROXY http_proxy HTTPS_PROXY https_proxy SOCKS_PROXY socks_proxy
export NO_PROXY="localhost,127.0.0.1,open.bigmodel.cn"
export no_proxy="$NO_PROXY"

export PYTHONPATH="$RUNTIME_ROOT/search"
export SHARED_CONFIG_ROOT="$RUNTIME_ROOT/platform/configs"
export CONFIG_OVERRIDE="${CONFIG_OVERRIDE:-config-local.yaml}"

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

export MILVUS_HOST="${MILVUS_HOST:-localhost}"
export MILVUS_PORT="${MILVUS_PORT:-19530}"

exec "$VENV_PY" -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
