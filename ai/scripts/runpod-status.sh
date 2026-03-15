#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

require_runpod_api
require_pod_id

pod_json="$(api_request GET "/pods/${RUNPOD_POD_ID}")"
POD_JSON="$pod_json" COMFYUI_PORT="$COMFYUI_PORT" node <<'NODE'
const fs = require('fs')

const payload = JSON.parse(process.env.POD_JSON || '{}')
const data = payload.data ?? payload
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
