# RunPod ComfyUI Bash Kit

This folder contains a minimal bash-first workflow for running ComfyUI on a RunPod pod and retrieving generated files locally.

The scripts are designed for the cheapest practical hobby workflow:

- one persistent RunPod pod
- one ComfyUI API endpoint
- local shell scripts for create, start, wait, submit, fetch, and stop
- no `jq` dependency; JSON parsing is done with `node`

## What This Supports

- Provision a RunPod pod from the CLI
- Start and stop the pod from the CLI
- Wait for the pod and ComfyUI API to become ready
- Submit a ComfyUI workflow over HTTP
- Poll for completion and download output files locally
- Persist the pod id and discovered ComfyUI URL in `ai/.state/`

## Prerequisites

- `bash`
- `curl`
- `node`
- a RunPod API key
- a working RunPod pod configuration using either:
  - a `RUNPOD_TEMPLATE_ID`, or
  - a `RUNPOD_IMAGE_NAME` plus a startup command that launches ComfyUI on port `8188`

On Windows Git Bash, the scripts now guard against MSYS path conversion rewriting container paths like `/workspace` into local paths such as `C:/Program Files/Git/workspace`.

## Recommended Starter Config

For hobby use, start with:

- `COMMUNITY` cloud
- `Tesla T4` first, then `NVIDIA GeForce RTX 3070` fallback
- `30 GB` pod volume
- ComfyUI exposed on `8188/http`

The scripts default to those assumptions in `ai/.env.example`.

## First-Time Setup

1. Copy `ai/.env.example` to `ai/.env`.
2. Set `RUNPOD_API_KEY`.
3. Configure exactly one of:
   - `RUNPOD_TEMPLATE_ID`
   - `RUNPOD_IMAGE_NAME`
4. If you use `RUNPOD_IMAGE_NAME`, set `RUNPOD_START_COMMAND` so the container launches ComfyUI on `0.0.0.0:8188`.

Example image-based setup:

```bash
RUNPOD_IMAGE_NAME=my-comfyui-image:latest
RUNPOD_START_COMMAND=python main.py --listen 0.0.0.0 --port 8188
```

## Workflow JSON Requirement

`comfy-submit.sh` accepts either:

- a raw ComfyUI prompt graph object, or
- a full `/prompt` API payload containing a top-level `prompt` field

The easiest option is to export your workflow from ComfyUI in API format and store it under `ai/workflows/`.

## Script Reference

All scripts live in `ai/scripts/`.

### Create the pod

```bash
./ai/scripts/runpod-create.sh
```

This creates the pod and stores the returned pod id in `ai/.state/runpod.env`.

### Start the pod

```bash
./ai/scripts/runpod-start.sh
```

### Wait for RunPod and ComfyUI

```bash
./ai/scripts/runpod-wait.sh
```

This polls the pod until a public IP and mapped ComfyUI port are available, then checks the ComfyUI health endpoint.

### Check pod status

```bash
./ai/scripts/runpod-status.sh
```

This prints the current pod id, desired status, public IP, mapped ComfyUI URL, GPU, and hourly cost.

### Submit a workflow

```bash
./ai/scripts/comfy-submit.sh ai/workflows/example-api-workflow.json
```

It prints the returned `prompt_id` and stores it in the local state file.

### Fetch outputs

```bash
./ai/scripts/comfy-fetch.sh <prompt_id> ai/output/example
```

This polls ComfyUI history and downloads the generated image files locally.

### Stop the pod

```bash
./ai/scripts/runpod-stop.sh
```

### Delete the pod

```bash
./ai/scripts/runpod-delete.sh
```

This deletes the pod and clears local state.

### One-command generate flow

```bash
./ai/scripts/generate.sh ai/workflows/example-api-workflow.json ai/output/example
```

This will:

- start the pod
- wait for readiness
- submit the workflow
- fetch the outputs
- stop the pod if `AUTO_STOP_AFTER_FETCH=true`

## Suggested First Session

```bash
./ai/scripts/runpod-create.sh
./ai/scripts/runpod-wait.sh
prompt_id="$(./ai/scripts/comfy-submit.sh ai/workflows/example-api-workflow.json)"
./ai/scripts/comfy-fetch.sh "$prompt_id" ai/output/test
./ai/scripts/runpod-stop.sh
```

Or use:

```bash
./ai/scripts/generate.sh ai/workflows/example-api-workflow.json ai/output/test
```

## Example Workflow

An editable starter workflow lives at `ai/workflows/example-pixel-sprite-workflow.json`.

Before using it:

1. replace `REPLACE_WITH_YOUR_PIXEL_MODEL.safetensors` with your actual checkpoint filename
2. adjust the positive prompt for the asset you want
3. optionally change the seed, resolution, or filename prefix

## Notes

- The scripts use the current RunPod REST API at `https://rest.runpod.io/v1`.
- The pod url is derived from `publicIp` plus the mapped public port for `COMFYUI_PORT`.
- This starter kit uses the pod's persistent volume (`volumeInGb`) instead of a separate network volume, because it is simpler and cheaper to get started.
- If you later want a reusable network volume that survives pod deletion, the same script structure can be extended to create and attach one.
- A workspace skill for using this pipeline lives at `.github/skills/runpod-pixel-art/SKILL.md`.
