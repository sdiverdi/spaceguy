#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

require_common_tools

workflow_file="${1:-}"
[[ -n "$workflow_file" ]] || die "usage: comfy-submit.sh <workflow-json>"
[[ -f "$workflow_file" ]] || die "workflow file not found: $workflow_file"
require_env COMFYUI_URL

payload_file="$(mktemp)"

WORKFLOW_FILE="$workflow_file" node <<'NODE' > "$payload_file"
const fs = require('fs')
const workflowPath = process.env.WORKFLOW_FILE
const input = JSON.parse(fs.readFileSync(workflowPath, 'utf8'))
const payload = Object.prototype.hasOwnProperty.call(input, 'prompt') ? input : { prompt: input }
process.stdout.write(JSON.stringify(payload, null, 2))
NODE

response="$(curl -sS --fail-with-body -X POST "${COMFYUI_URL}/prompt" -H "Content-Type: application/json" --data @"$payload_file")"
rm -f "$payload_file"

prompt_id="$(printf '%s' "$response" | json_get 'data.prompt_id || data.promptId')"
set_state_var LAST_COMFY_PROMPT_ID "$prompt_id"

log "Submitted workflow: $workflow_file"
printf '%s\n' "$prompt_id"
