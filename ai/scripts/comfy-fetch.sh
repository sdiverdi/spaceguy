#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

require_common_tools
require_env COMFYUI_URL

prompt_id="${1:-${LAST_COMFY_PROMPT_ID:-}}"
output_dir="${2:-$AI_DIR/output/${prompt_id:-latest}}"
[[ -n "$prompt_id" ]] || die "usage: comfy-fetch.sh <prompt-id> [output-dir]"

mkdir -p "$output_dir"
started_at="$(date +%s)"

while true; do
  history_json="$(curl -sS --fail-with-body "${COMFYUI_URL}/history/${prompt_id}")"

  status_json="$(PROMPT_ID="$prompt_id" node -e 'const fs = require("fs"); const promptId = process.env.PROMPT_ID; const history = JSON.parse(fs.readFileSync(0, "utf8")); const item = history[promptId] || history; const status = item?.status?.status_str || item?.status?.status || "pending"; const images = []; for (const node of Object.values(item?.outputs || {})) { for (const image of node?.images || []) images.push(image); } process.stdout.write(JSON.stringify({ status, images }, null, 2));' <<<"$history_json")"

  status="$(printf '%s' "$status_json" | json_get_or_empty 'data.status || "pending"')"
  image_count="$(printf '%s' "$status_json" | json_get_or_empty 'Array.isArray(data.images) ? data.images.length : 0')"

  if [[ "$status" == "error" ]]; then
    die "ComfyUI reported an error for prompt $prompt_id"
  fi

  if [[ "$status" == "success" && "$image_count" != "0" ]]; then
    break
  fi

  if (( $(date +%s) - started_at >= COMFYUI_FETCH_TIMEOUT_SEC )); then
    die "timed out waiting for prompt $prompt_id to finish"
  fi

  log "Waiting for prompt $prompt_id (status: $status)"
  sleep "$RUNPOD_POLL_INTERVAL_SEC"
done

STATUS_JSON="$status_json" OUTPUT_DIR="$output_dir" COMFYUI_URL="$COMFYUI_URL" node <<'NODE'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const payload = JSON.parse(process.env.STATUS_JSON)
const outputDir = process.env.OUTPUT_DIR
const comfyUrl = process.env.COMFYUI_URL

payload.images.forEach((image, index) => {
  const name = `${String(index + 1).padStart(2, '0')}-${image.filename}`
  const destination = path.join(outputDir, name)
  execFileSync('curl', [
    '-sS',
    '--fail-with-body',
    '--get',
    `${comfyUrl}/view`,
    '--data-urlencode', `filename=${image.filename}`,
    '--data-urlencode', `subfolder=${image.subfolder || ''}`,
    '--data-urlencode', `type=${image.type || 'output'}`,
    '--output', destination,
  ], { stdio: 'inherit' })
  console.error(`downloaded ${destination}`)
})
NODE

printf '%s\n' "$output_dir"
