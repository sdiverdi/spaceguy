---
name: runpod-pixel-art
description: "Use when generating pixel art sprite assets, sprite ideas, enemy sprites, pickup sprites, or tiles through the ai/ RunPod + ComfyUI bash scripts. Trigger for requests like: generate pixel art, make sprite assets, run the RunPod image workflow, create enemy sprite sheets, produce pixel-art game assets, or submit ComfyUI workflows from bash."
---

# RunPod Pixel Art

Use this skill when the task is to generate or iterate on video-game sprite assets through the repository's RunPod automation kit in `ai/`.

## Scope

This skill is for:

- starting and stopping the RunPod pod
- checking pod status and ComfyUI readiness
- submitting workflow JSON files from `ai/workflows/`
- downloading generated output files into `ai/output/`
- iterating on prompts, seeds, and workflow JSON for pixel-art sprite generation
- producing assets like player sprites, enemy sprites, pickups, tiles, portraits, and effects

This skill is not for:

- general game coding unrelated to the image pipeline
- non-RunPod image providers
- local ComfyUI installs on the user's machine

## Required Inputs

Before using the scripts, verify:

- `ai/.env` exists
- `RUNPOD_API_KEY` is set
- either `RUNPOD_TEMPLATE_ID` or `RUNPOD_IMAGE_NAME` is set
- the configured container exposes ComfyUI on port `8188`

If `ai/.env` is missing, stop and ask the user to create it from `ai/.env.example`.

## Default Workflow

1. Read `ai/README.md` and the requested workflow JSON in `ai/workflows/`.
2. If the user does not already have a workflow, start from `ai/workflows/example-pixel-sprite-workflow.json`.
3. Confirm any model-specific placeholder values are replaced, especially `ckpt_name`.
4. Run `./ai/scripts/runpod-start.sh`.
5. Run `./ai/scripts/runpod-wait.sh`.
6. Run `./ai/scripts/runpod-status.sh` if you need the current URL, cost, or mapped ports.
7. Submit the workflow with `./ai/scripts/comfy-submit.sh <workflow-json>`.
8. Fetch outputs with `./ai/scripts/comfy-fetch.sh <prompt-id> <output-dir>`.
9. If appropriate, stop the pod with `./ai/scripts/runpod-stop.sh`.

## Bash Commands

Use these commands from the workspace root:

```bash
./ai/scripts/runpod-create.sh
./ai/scripts/runpod-start.sh
./ai/scripts/runpod-wait.sh
./ai/scripts/runpod-status.sh
prompt_id="$(./ai/scripts/comfy-submit.sh ai/workflows/example-pixel-sprite-workflow.json)"
./ai/scripts/comfy-fetch.sh "$prompt_id" ai/output/example
./ai/scripts/runpod-stop.sh
```

Single-command path:

```bash
./ai/scripts/generate.sh ai/workflows/example-pixel-sprite-workflow.json ai/output/example
```

## Iteration Rules

- Keep workflows small and debuggable at first.
- Prefer one checkpoint and one prompt target at a time.
- Save outputs under descriptive folders in `ai/output/`.
- Change one axis at a time when iterating: prompt, seed, size, CFG, or steps.
- For pixel art, prefer cleaner prompts over higher CFG or more steps.

## Asset Guidance

Good first targets:

- one player concept sprite
- one crawler enemy
- one drone enemy
- one pickup icon set
- one tile mood test

Typical prompt constraints:

- pixel art
- sprite asset
- transparent background
- centered composition
- readable silhouette
- limited palette
- retro console game look

Typical negative constraints:

- photorealistic
- painterly
- blurry
- detailed background
- watermark
- text
- multiple characters

## Failure Handling

If pod creation or start fails:

- run `./ai/scripts/runpod-status.sh`
- inspect `ai/.env`
- verify the GPU type string is valid for the current RunPod API

If ComfyUI never becomes ready:

- verify the image or template actually launches ComfyUI on `0.0.0.0:8188`
- verify `COMFYUI_PORT` and `COMFYUI_HEALTH_PATH`

If submission succeeds but outputs are empty:

- inspect the workflow JSON
- verify `ckpt_name`
- lower complexity before adding LoRAs or custom nodes
