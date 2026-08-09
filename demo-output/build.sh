#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

node "$SCRIPT_DIR/record-walkthrough.cjs"
node "$SCRIPT_DIR/compose-video.cjs"
