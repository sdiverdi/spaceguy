#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

require_runpod_api
require_pod_id

api_request DELETE "/pods/${RUNPOD_POD_ID}" >/dev/null

pod_id="$RUNPOD_POD_ID"
clear_state_var RUNPOD_POD_ID
clear_state_var COMFYUI_URL
clear_state_var LAST_COMFY_PROMPT_ID

log "Deleted pod $pod_id"
printf '%s\n' "$pod_id"
