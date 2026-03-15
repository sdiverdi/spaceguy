#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AI_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
STATE_DIR="$AI_DIR/.state"
STATE_FILE="$STATE_DIR/runpod.env"
ENV_FILE="${AI_ENV_FILE:-$AI_DIR/.env}"
RUNPOD_BASE_URL="${RUNPOD_BASE_URL:-https://rest.runpod.io/v1}"

configure_windows_shell_compat() {
  case "${OSTYPE:-}:${MSYSTEM:-}" in
    msys:*|cygwin:*|*:*MINGW*)
      export MSYS2_ENV_CONV_EXCL="${MSYS2_ENV_CONV_EXCL:+$MSYS2_ENV_CONV_EXCL;}RUNPOD_VOLUME_MOUNT_PATH;RUNPOD_START_COMMAND"
      ;;
  esac
}

load_env_file() {
  local file_path="$1"
  if [[ -f "$file_path" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file_path"
    set +a
  fi
}

load_env_file "$ENV_FILE"
load_env_file "$STATE_FILE"
configure_windows_shell_compat

RUNPOD_BASE_URL="${RUNPOD_BASE_URL:-https://rest.runpod.io/v1}"
COMFYUI_PORT="${COMFYUI_PORT:-8188}"
COMFYUI_HEALTH_PATH="${COMFYUI_HEALTH_PATH:-/system_stats}"
RUNPOD_WAIT_TIMEOUT_SEC="${RUNPOD_WAIT_TIMEOUT_SEC:-900}"
RUNPOD_POLL_INTERVAL_SEC="${RUNPOD_POLL_INTERVAL_SEC:-5}"
COMFYUI_FETCH_TIMEOUT_SEC="${COMFYUI_FETCH_TIMEOUT_SEC:-1800}"

die() {
  echo "error: $*" >&2
  exit 1
}

log() {
  echo "$*" >&2
}

require_cmd() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || die "missing required command: $command_name"
}

require_env() {
  local var_name="$1"
  [[ -n "${!var_name:-}" ]] || die "missing required environment variable: $var_name"
}

ensure_state_dir() {
  mkdir -p "$STATE_DIR"
}

set_state_var() {
  local key="$1"
  local value="$2"
  local temp_file
  ensure_state_dir
  temp_file="$(mktemp)"
  if [[ -f "$STATE_FILE" ]]; then
    grep -v "^export ${key}=" "$STATE_FILE" > "$temp_file" || true
  fi
  printf 'export %s=%q\n' "$key" "$value" >> "$temp_file"
  mv "$temp_file" "$STATE_FILE"
  export "$key=$value"
}

clear_state_var() {
  local key="$1"
  local temp_file
  ensure_state_dir
  temp_file="$(mktemp)"
  if [[ -f "$STATE_FILE" ]]; then
    grep -v "^export ${key}=" "$STATE_FILE" > "$temp_file" || true
    mv "$temp_file" "$STATE_FILE"
  else
    rm -f "$temp_file"
  fi
  unset "$key" || true
}

json_get() {
  local expression="$1"
  node -e 'const fs = require("fs"); const expression = process.argv[1]; const input = fs.readFileSync(0, "utf8"); const data = JSON.parse(input); const value = Function("data", `return (${expression});`)(data); if (value === undefined || value === null) process.exit(5); if (typeof value === "object") process.stdout.write(JSON.stringify(value)); else process.stdout.write(String(value));' "$expression"
}

json_get_or_empty() {
  local expression="$1"
  node -e 'const fs = require("fs"); const expression = process.argv[1]; const input = fs.readFileSync(0, "utf8"); const data = JSON.parse(input); let value; try { value = Function("data", `return (${expression});`)(data); } catch (_error) { value = ""; } if (value === undefined || value === null) value = ""; if (typeof value === "object") process.stdout.write(JSON.stringify(value)); else process.stdout.write(String(value));' "$expression"
}

api_request() {
  local method="$1"
  local path="$2"
  local data_file="${3:-}"
  local url="$RUNPOD_BASE_URL$path"
  local curl_args=(-sS --fail-with-body -X "$method" "$url" -H "Authorization: Bearer $RUNPOD_API_KEY")
  if [[ -n "$data_file" ]]; then
    curl_args+=(-H "Content-Type: application/json" --data @"$data_file")
  fi
  curl "${curl_args[@]}"
}

require_common_tools() {
  require_cmd curl
  require_cmd node
}

require_runpod_api() {
  require_common_tools
  require_env RUNPOD_API_KEY
}

require_pod_id() {
  require_env RUNPOD_POD_ID
}

pod_http_url_from_json() {
  COMFYUI_PORT="$COMFYUI_PORT" node -e 'const fs = require("fs"); const input = fs.readFileSync(0, "utf8"); const data = JSON.parse(input); const port = process.env.COMFYUI_PORT; const publicIp = data.publicIp || ""; const mappedPort = data.portMappings ? data.portMappings[String(port)] : ""; if (publicIp && mappedPort) process.stdout.write(`http://${publicIp}:${mappedPort}`);'
}

wait_for_http_ok() {
  local url="$1"
  local timeout_sec="$2"
  local started_at
  started_at="$(date +%s)"
  while true; do
    if curl -sS --fail "$url" >/dev/null 2>&1; then
      return 0
    fi
    if (( $(date +%s) - started_at >= timeout_sec )); then
      return 1
    fi
    sleep "$RUNPOD_POLL_INTERVAL_SEC"
  done
}
