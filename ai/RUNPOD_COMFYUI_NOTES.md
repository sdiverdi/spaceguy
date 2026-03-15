# RunPod + ComfyUI Handoff Notes

This file captures the non-obvious problems hit during setup and iteration so a future agent can get back to a working state quickly.

## Current Status

- The bash-first RunPod + ComfyUI flow is working from this repo.
- Local state lives in `ai/.state/runpod.env`.
- The scripts assume ComfyUI is exposed on port `8188` and use `COMFYUI_HEALTH_PATH=/system_stats` to detect readiness.
- The main flow is still:

```bash
./ai/scripts/runpod-create.sh
./ai/scripts/runpod-wait.sh
prompt_id="$(./ai/scripts/comfy-submit.sh ai/workflows/player-space-marine-front-idle.json)"
./ai/scripts/comfy-fetch.sh "$prompt_id" ai/output/player-space-marine/front-idle
./ai/scripts/runpod-stop.sh
```

## Biggest Failure Modes And Fixes

### 1. Git Bash on Windows was mangling container paths

Problem:

- Git for Windows / MSYS rewrote container-style paths like `/workspace` into host paths such as `C:/Program Files/Git/workspace`.
- This broke RunPod payloads and startup-command handling.

Fix already in repo:

- `ai/scripts/common.sh` exports `MSYS2_ENV_CONV_EXCL` for `RUNPOD_VOLUME_MOUNT_PATH` and `RUNPOD_START_COMMAND`.
- `ai/scripts/runpod-create.sh` also normalizes container paths before building the RunPod payload.

Practical rule:

- If a future agent sees `/workspace` or another container path turning into a Windows path, check the shell first before blaming RunPod.

### 2. `node "$workflow_file"` style usage caused path issues on Windows

Problem:

- Passing the workflow path directly as a Node CLI argument was vulnerable to shell/path handling issues in Git Bash.

Fix already in repo:

- `ai/scripts/comfy-submit.sh` now passes the path through `WORKFLOW_FILE` and reads it from `process.env` inside Node.

Practical rule:

- For Windows Git Bash compatibility, prefer env vars over positional file-path arguments when a script shells into Node.

### 3. RunPod API responses were not always wrapped the same way

Problem:

- Some responses exposed fields under `data`, while others behaved more like unwrapped payloads.
- This caused status parsing to fail intermittently.

Fix already in repo:

- `runpod-wait.sh` reads `data?.desiredStatus || desiredStatus || ""`.
- `runpod-status.sh` uses `payload.data ?? payload` before reading fields.

Practical rule:

- When touching RunPod parsing again, keep the code tolerant of both wrapped and unwrapped shapes.

### 4. ComfyUI readiness must be checked over HTTP, not just pod state

Problem:

- A pod can be up before ComfyUI is actually ready to accept prompts.

Working approach:

- `runpod-wait.sh` polls the pod until it has a public IP and mapped port.
- It then polls `http://<publicIp>:<mappedPort>/system_stats` until it succeeds.
- When ready, it stores `COMFYUI_URL` in `ai/.state/runpod.env`.

Practical rule:

- If prompt submission fails right after startup, re-check `COMFYUI_URL` and the `/system_stats` health endpoint before changing anything else.

## Model Installation Lessons

### 5. ComfyUI-Manager installs require the exact model catalog item

Working behavior discovered:

- Manager installs work by posting the exact external model catalog item plus a `ui_id` to `/manager/queue/install_model`.
- After queuing, call `/manager/queue/start`.
- Checkpoint names exposed to workflows are qualified names such as `SD1.5/AOM3A1_orangemixs.safetensors` and `SDXL/sd_xl_base_1.0.safetensors`.

Practical rule:

- Do not guess the checkpoint name inside a workflow. Query what ComfyUI actually registered and use that exact qualified path.

### 6. The LoRA could not be installed through the manager queue

Problem:

- The pixel-art SDXL LoRA was rejected by the manager-based install flow.

Working fallback:

- Download it directly through RunPod/ComfyUI server download instead of the manager queue.
- The working pattern was effectively:

```json
{
  "url": "<direct model url>",
  "save_path": "loras",
  "filename": "pixel_art_sdxl.safetensors"
}
```

Result:

- `LoraLoader` could then see `pixel_art_sdxl.safetensors`.

Practical rule:

- If manager install rejects a LoRA, bypass it and place the file directly under the correct ComfyUI model folder.

## Sprite Workflow Lessons

### 7. The original checkpoint was the main reason sprite quality was bad

Bad choice:

- `SD1.5/AOM3A1_orangemixs.safetensors`

Why it failed:

- It is an anime illustration model, not a sprite-focused model.
- Prompting alone did not overcome that mismatch.

Better setup:

- `SDXL/sd_xl_base_1.0.safetensors`
- `pixel_art_sdxl.safetensors` LoRA

Practical rule:

- If output looks like polished illustration art instead of readable sprite clusters, treat model choice as the first suspect, not prompt wording.

### 8. Multi-view outputs were caused by prompt ambiguity

Problem:

- Front-view prompts often returned turnaround-sheet style images or multiple viewpoints in one frame.

What helped:

- Add explicit positives such as `single character only` and `front view only`.
- Add explicit negatives such as `turnaround sheet`, `model sheet`, `character sheet`, `duplicate character`, `split view`, `front and back view together`.

Practical rule:

- For canonical sprite poses, say both what you want and what sheet-like alternatives must not appear.

### 9. Working sprite-processing pipeline

The current workflow shape that produced the better results was:

- Generate at `768x768`
- Decode image
- Downscale with `area` to `96x96`
- Quantize to about `28` colors with no dithering
- Upscale `6x` with `nearest-exact`
- Save final PNG at `576x576`

Practical rule:

- Keep the large-to-small-to-nearest-upscale flow if the goal is readable retro sprite output rather than clean illustration output.

## Evaluation Limitation

### 10. The VS Code coding agent could not autonomously inspect local images

Important limitation from this session:

- The agent could generate images and manipulate files, but could not directly look at local PNGs with built-in vision as part of an automated loop.
- Captioning APIs were tested as a proxy, but they are not a reliable substitute for direct visual evaluation.

Practical rule:

- If a future agent needs true autonomous visual critique, wire an explicit vision API call into the loop or use a chat session where the image is attached directly for review.

## Known Good Anchors

- Repo root: `c:/Users/steve/dev/game3`
- AI scripts: `ai/scripts/`
- AI workflows: `ai/workflows/`
- Output root: `ai/output/player-space-marine/`
- Working front-idle workflow: `ai/workflows/player-space-marine-front-idle.json`
- Pod state file: `ai/.state/runpod.env`

## Recommended Debug Order Next Time

1. Confirm `RUNPOD_POD_ID` and `COMFYUI_URL` in `ai/.state/runpod.env`.
2. Run `./ai/scripts/runpod-status.sh`.
3. Verify `http://<host>:<port>/system_stats` responds before submitting prompts.
4. If submission fails on Windows Git Bash, inspect path conversion issues before changing API code.
5. If model loading fails, verify the exact registered checkpoint or LoRA filename in ComfyUI.
6. If image quality is wrong, question the checkpoint choice before spending time on prompt tweaks.
