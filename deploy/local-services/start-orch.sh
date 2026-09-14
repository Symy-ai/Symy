#!/usr/bin/env bash
# Foreground launcher for the local orchestrator (:8082, LangGraph agent + /img image proxy).
# Used as ExecStart by symy-orch.service; also runnable by hand.
# Keys come from $RUNTIME_ROOT/.env — never commit them here.
set -euo pipefail

RUNTIME_ROOT="${RUNTIME_ROOT:-/home/spark/runtime/Shopping-AI}"
VENV_PY="${VENV_PY:-/home/spark/venvs/orch/bin/python}"
ENV_FILE="${ENV_FILE:-$RUNTIME_ROOT/.env}"
PORT="${PORT:-8082}"

if [[ ! -x "$VENV_PY" ]]; then
  echo "ERROR: $VENV_PY not found — run setup-venvs.sh first" >&2
  exit 1
fi
if [[ ! -r "$ENV_FILE" ]]; then
  echo "ERROR: env file $ENV_FILE not readable (LLM_* live there)" >&2
  exit 1
fi

cd "$RUNTIME_ROOT"

# WSL 里的代理会劫持 localhost 和大模型直连，全部清掉
unset ALL_PROXY all_proxy HTTP_PROXY http_proxy HTTPS_PROXY https_proxy SOCKS_PROXY socks_proxy
export NO_PROXY="localhost,127.0.0.1,open.bigmodel.cn"
export no_proxy="$NO_PROXY"

export PYTHONPATH="$RUNTIME_ROOT/orchestrator"
export SHARED_CONFIG_ROOT="$RUNTIME_ROOT/platform/configs"
export CONFIG_OVERRIDE="${CONFIG_OVERRIDE:-config-local.yaml}"

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

# .env 只定义 LLM_API_KEY；部分依赖（openai 客户端/cognee）读 OPENAI_API_KEY，做一次映射
export OPENAI_API_KEY="${OPENAI_API_KEY:-$LLM_API_KEY}"

export MILVUS_HOST="${MILVUS_HOST:-localhost}"
export MILVUS_PORT="${MILVUS_PORT:-19530}"

exec "$VENV_PY" -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
