#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

require_runpod_api

if [[ -n "${RUNPOD_POD_ID:-}" ]]; then
  log "RUNPOD_POD_ID is already set to $RUNPOD_POD_ID"
  log "Delete the existing pod or clear ai/.state/runpod.env if you want to create a new one."
  exit 0
fi

payload_file="$(mktemp)"

node > "$payload_file" <<'NODE'
const env = process.env
const split = (value) => (value || '').split(',').map((item) => item.trim()).filter(Boolean)
const intValue = (value, fallback) => value === undefined || value === '' ? fallback : Number.parseInt(value, 10)
const boolValue = (value, fallback) => value === undefined || value === '' ? fallback : /^true$/i.test(value)
const normalizeContainerPath = (value, fallback) => {
  const candidate = value === undefined || value === '' ? fallback : value
  const gitForWindowsPrefix = candidate.match(/^[A-Za-z]:\/Program Files\/Git(\/.*)$/)
  if (gitForWindowsPrefix) {
    return gitForWindowsPrefix[1]
  }
  return candidate.replace(/\\/g, '/')
}

if (env.RUNPOD_TEMPLATE_ID && env.RUNPOD_IMAGE_NAME) {
  console.error('Set exactly one of RUNPOD_TEMPLATE_ID or RUNPOD_IMAGE_NAME, not both.')
  process.exit(2)
}

if (!env.RUNPOD_TEMPLATE_ID && !env.RUNPOD_IMAGE_NAME) {
  console.error('Set RUNPOD_TEMPLATE_ID or RUNPOD_IMAGE_NAME in ai/.env before creating a pod.')
  process.exit(2)
}

const payload = {
  name: env.RUNPOD_POD_NAME || 'comfyui-hobby',
  cloudType: env.RUNPOD_CLOUD_TYPE || 'COMMUNITY',
  computeType: 'GPU',
  gpuCount: intValue(env.RUNPOD_GPU_COUNT, 1),
  gpuTypeIds: split(env.RUNPOD_GPU_TYPE_IDS || 'Tesla T4,NVIDIA GeForce RTX 3070'),
  gpuTypePriority: env.RUNPOD_GPU_TYPE_PRIORITY || 'availability',
  containerDiskInGb: intValue(env.RUNPOD_CONTAINER_DISK_GB, 50),
  volumeInGb: intValue(env.RUNPOD_VOLUME_GB, 30),
  volumeMountPath: normalizeContainerPath(env.RUNPOD_VOLUME_MOUNT_PATH, '/workspace'),
  ports: split(env.RUNPOD_PORTS || '8188/http,22/tcp'),
  supportPublicIp: boolValue(env.RUNPOD_SUPPORT_PUBLIC_IP, true),
  interruptible: boolValue(env.RUNPOD_INTERRUPTIBLE, false),
  minRAMPerGPU: intValue(env.RUNPOD_MIN_RAM_PER_GPU, 8),
  minVCPUPerGPU: intValue(env.RUNPOD_MIN_VCPU_PER_GPU, 4),
}

const dataCenters = split(env.RUNPOD_DATA_CENTER_IDS)
if (dataCenters.length > 0) {
  payload.dataCenterIds = dataCenters
  payload.dataCenterPriority = env.RUNPOD_DATA_CENTER_PRIORITY || 'availability'
}

const cudaVersions = split(env.RUNPOD_ALLOWED_CUDA_VERSIONS)
if (cudaVersions.length > 0) {
  payload.allowedCudaVersions = cudaVersions
}

if (env.RUNPOD_TEMPLATE_ID) {
  payload.templateId = env.RUNPOD_TEMPLATE_ID
} else {
  payload.imageName = env.RUNPOD_IMAGE_NAME
  if (env.RUNPOD_START_COMMAND) {
    payload.dockerStartCmd = ['bash', '-lc', env.RUNPOD_START_COMMAND]
  }
}

process.stdout.write(JSON.stringify(payload, null, 2))
NODE

response="$(api_request POST /pods "$payload_file")"
rm -f "$payload_file"

pod_id="$(printf '%s' "$response" | json_get 'data.id')"
cost_per_hr="$(printf '%s' "$response" | json_get_or_empty 'data.costPerHr || data.adjustedCostPerHr || ""')"

set_state_var RUNPOD_POD_ID "$pod_id"
clear_state_var COMFYUI_URL

log "Created RunPod pod: $pod_id"
if [[ -n "$cost_per_hr" ]]; then
  log "Estimated cost per hour: $cost_per_hr"
fi

printf '%s\n' "$pod_id"
