#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

require_runpod_api
require_pod_id

started_at="$(date +%s)"

while true; do
  pod_json="$(api_request GET "/pods/${RUNPOD_POD_ID}")"
  desired_status="$(printf '%s' "$pod_json" | json_get_or_empty 'data.desiredStatus || ""')"
  comfy_url="$(printf '%s' "$pod_json" | pod_http_url_from_json)"

  if [[ -n "$comfy_url" ]]; then
    health_url="${comfy_url}${COMFYUI_HEALTH_PATH}"
    if wait_for_http_ok "$health_url" "$RUNPOD_POLL_INTERVAL_SEC"; then
      set_state_var COMFYUI_URL "$comfy_url"
      log "ComfyUI is ready at $comfy_url"
      printf '%s\n' "$comfy_url"
      exit 0
    fi
  fi

  if (( $(date +%s) - started_at >= RUNPOD_WAIT_TIMEOUT_SEC )); then
    die "timed out waiting for pod $RUNPOD_POD_ID and ComfyUI to become ready"
  fi

  log "Waiting for pod $RUNPOD_POD_ID${desired_status:+ (status: $desired_status)}"
  sleep "$RUNPOD_POLL_INTERVAL_SEC"
done
