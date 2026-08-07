#!/usr/bin/env bash
set -e

# PoseForge README Demo Generator
# Generates web/public/demo/poseforge-readme-demo.mp4 (1200x675 / 1200x676, 10s, silent)
# and web/public/demo/poseforge-readme-demo.gif (GitHub-friendly size)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_DIR"

echo "=== PoseForge Demo Generator ==="
echo "Working directory: $REPO_DIR"

# 1. Ensure output directories exist
mkdir -p web/public/demo
mkdir -p tmp/demo_frames

# 2. Render frames using Node.js
echo "Rendering animation frames..."
node scripts/render-readme-frames.js

# 3. Generate MP4 (1200x675 / 1200x676, 10 seconds, silent)
MP4_OUTPUT="web/public/demo/poseforge-readme-demo.mp4"
echo "Encoding MP4 video to $MP4_OUTPUT ..."

ffmpeg -y \
  -framerate 30 \
  -i tmp/demo_frames/frame_%04d.png \
  -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -r 30 \
  -an \
  -movflags +faststart \
  "$MP4_OUTPUT"

# 4. Generate GitHub-friendly GIF
GIF_OUTPUT="web/public/demo/poseforge-readme-demo.gif"
echo "Generating optimized GIF to $GIF_OUTPUT ..."

PALETTE_TMP="tmp/palette.png"
ffmpeg -y \
  -i "$MP4_OUTPUT" \
  -vf "fps=15,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff" \
  "$PALETTE_TMP"

ffmpeg -y \
  -i "$MP4_OUTPUT" \
  -i "$PALETTE_TMP" \
  -filter_complex "fps=15,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" \
  "$GIF_OUTPUT"

rm -f "$PALETTE_TMP"

# 5. Verification checks
echo "=== Verifying Output Media ==="

DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$MP4_OUTPUT")
RESOLUTION=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$MP4_OUTPUT")
BLACK_FRAMES=$(ffmpeg -v error -i "$MP4_OUTPUT" -vf "blackdetect=d=0.1:pix_th=0.10" -f null - 2>&1 | grep -c "black_start" || true)

MP4_SIZE=$(du -h "$MP4_OUTPUT" | cut -f1)
GIF_SIZE=$(du -h "$GIF_OUTPUT" | cut -f1)
MP4_BYTES=$(wc -c < "$MP4_OUTPUT" | tr -d ' ')
GIF_BYTES=$(wc -c < "$GIF_OUTPUT" | tr -d ' ')

echo "MP4 File: $MP4_OUTPUT ($MP4_SIZE / $MP4_BYTES bytes)"
echo "GIF File: $GIF_OUTPUT ($GIF_SIZE / $GIF_BYTES bytes)"
echo "Resolution: $RESOLUTION"
echo "Duration: ${DURATION}s (Expected: ~10.0s)"
echo "Black Frames Detected: $BLACK_FRAMES (Expected: 0)"

if [ "$BLACK_FRAMES" -ne 0 ]; then
  echo "Error: Black frames detected!"
  exit 1
fi

echo "=== Generation Complete & Verified ==="
