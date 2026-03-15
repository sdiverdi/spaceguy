#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

workflow_file="${1:-}"
output_dir="${2:-}"
[[ -n "$workflow_file" ]] || die "usage: generate.sh <workflow-json> [output-dir]"

"$SCRIPT_DIR/runpod-start.sh" >/dev/null
"$SCRIPT_DIR/runpod-wait.sh" >/dev/null
prompt_id="$($SCRIPT_DIR/comfy-submit.sh "$workflow_file")"
"$SCRIPT_DIR/comfy-fetch.sh" "$prompt_id" "$output_dir"

if [[ "${AUTO_STOP_AFTER_FETCH:-true}" =~ ^([Tt][Rr][Uu][Ee]|1)$ ]]; then
  "$SCRIPT_DIR/runpod-stop.sh" >/dev/null
fi
