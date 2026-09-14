#!/usr/bin/env bash
# Build the durable venvs for local services:
#   /home/spark/venvs/search — uvicorn search service (:8010)
#   /home/spark/venvs/orch   — uvicorn orchestrator (:8082)
# Idempotent: existing venvs are reused (deps re-synced, which is a no-op when
# requirements.txt is unchanged). Pass --force to delete and rebuild.
set -euo pipefail

RUNTIME_ROOT="${RUNTIME_ROOT:-/home/spark/runtime/Shopping-AI}"
VENVS_ROOT="${VENVS_ROOT:-/home/spark/venvs}"
PYTHON_VER="${PYTHON_VER:-3.12}"

FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
elif [[ -n "${1:-}" ]]; then
  echo "usage: $0 [--force]" >&2
  exit 2
fi

if [[ $EUID -eq 0 ]]; then
  echo "WARNING: running as root — venvs will be root-owned; prefer running as spark" >&2
fi

UV_BIN="$(command -v uv || true)"
if [[ -z "$UV_BIN" && -x "$HOME/.local/bin/uv" ]]; then
  UV_BIN="$HOME/.local/bin/uv"
fi

build_venv() {
  local name="$1"
  local reqs="$2"
  local vpath="$VENVS_ROOT/$name"

  if [[ ! -f "$reqs" ]]; then
    echo "ERROR: $reqs not found" >&2
    exit 1
  fi

  if [[ -x "$vpath/bin/python" && $FORCE -eq 0 ]]; then
    echo "[setup-venvs] $vpath exists, reusing (--force to rebuild)"
  else
    if [[ $FORCE -eq 1 && -d "$vpath" ]]; then
      rm -rf "$vpath"
    fi
    if [[ -n "$UV_BIN" ]]; then
      "$UV_BIN" venv "$vpath" --python "$PYTHON_VER"
    else
      echo "[setup-venvs] uv not found, falling back to python$PYTHON_VER -m venv"
      "python$PYTHON_VER" -m venv "$vpath"
    fi
  fi

  echo "[setup-venvs] syncing deps for $name from $reqs"
  if [[ -n "$UV_BIN" ]]; then
    "$UV_BIN" pip install -p "$vpath/bin/python" -r "$reqs"
  else
    "$vpath/bin/python" -m pip install --quiet -r "$reqs"
  fi
  echo "[setup-venvs] $name ready: $vpath"
}

mkdir -p "$VENVS_ROOT"
build_venv search "$RUNTIME_ROOT/search/requirements.txt"
build_venv orch "$RUNTIME_ROOT/orchestrator/requirements.txt"
