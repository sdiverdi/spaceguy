#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

require_runpod_api
require_pod_id

pod_json="$(api_request GET "/pods/${RUNPOD_POD_ID}")"
COMFYUI_PORT="$COMFYUI_PORT" node <<'NODE' <<<"$pod_json"
const fs = require('fs')

const data = JSON.parse(fs.readFileSync(0, 'utf8'))
const port = process.env.COMFYUI_PORT || '8188'
const mappedPort = data.portMappings?.[String(port)] || ''
const comfyUrl = data.publicIp && mappedPort ? `http://${data.publicIp}:${mappedPort}` : ''

const lines = [
  `pod_id=${data.id || ''}`,
  `name=${data.name || ''}`,
  `desired_status=${data.desiredStatus || ''}`,
  `cost_per_hr=${data.costPerHr || data.adjustedCostPerHr || ''}`,
  `gpu=${data.gpu?.displayName || data.machine?.gpuDisplayName || ''}`,
  `public_ip=${data.publicIp || ''}`,
  `comfyui_url=${comfyUrl}`,
  `ports=${Array.isArray(data.ports) ? data.ports.join(',') : ''}`,
  `machine_id=${data.machineId || ''}`,
  `last_started_at=${data.lastStartedAt || ''}`,
  `last_status_change=${data.lastStatusChange || ''}`,
]

process.stdout.write(`${lines.join('\n')}\n`)
NODE
