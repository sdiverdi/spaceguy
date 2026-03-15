# Workflows

Place ComfyUI API-format workflow JSON files in this folder.

The bash scripts can submit either:

- a raw prompt graph object, or
- a top-level payload shaped like the body for `POST /prompt`

Example usage:

```bash
./ai/scripts/comfy-submit.sh ai/workflows/my-workflow.json
```

Starter file:

- `example-pixel-sprite-workflow.json`

That example uses a minimal text-to-image graph with:

- `CheckpointLoaderSimple`
- `EmptyLatentImage`
- positive and negative CLIP encodes
- `KSampler`
- `VAEDecode`
- `SaveImage`

You must replace the placeholder checkpoint name before submitting it.
