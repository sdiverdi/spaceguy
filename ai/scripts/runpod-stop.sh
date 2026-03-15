#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

require_runpod_api
require_pod_id

current_json="$(api_request GET "/pods/${RUNPOD_POD_ID}")"
current_status="$(printf '%s' "$current_json" | json_get_or_empty 'data.desiredStatus || ""')"

if [[ "$current_status" == "EXITED" || "$current_status" == "TERMINATED" ]]; then
	clear_state_var COMFYUI_URL
	log "Pod $RUNPOD_POD_ID is already stopped"
	printf '%s\n' "$RUNPOD_POD_ID"
	exit 0
fi

api_request POST "/pods/${RUNPOD_POD_ID}/stop" >/dev/null
clear_state_var COMFYUI_URL

log "Stop requested for pod $RUNPOD_POD_ID"
printf '%s\n' "$RUNPOD_POD_ID"
