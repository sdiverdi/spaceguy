#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

require_runpod_api
require_pod_id

current_json="$(api_request GET "/pods/${RUNPOD_POD_ID}")"
current_status="$(printf '%s' "$current_json" | json_get_or_empty 'data?.desiredStatus || desiredStatus || ""')"

if [[ "$current_status" == "RUNNING" ]]; then
	log "Pod $RUNPOD_POD_ID is already running"
	printf '%s\n' "$RUNPOD_POD_ID"
	exit 0
fi

response="$(api_request POST "/pods/${RUNPOD_POD_ID}/start")"
desired_status="$(printf '%s' "$response" | json_get_or_empty 'data?.desiredStatus || desiredStatus || ""')"

log "Start requested for pod $RUNPOD_POD_ID${desired_status:+ (desired status: $desired_status)}"
printf '%s\n' "$RUNPOD_POD_ID"
