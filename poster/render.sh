#!/usr/bin/env bash
# Render the World Tree poster HTML to a 1600x1000 PNG using headless Chromium.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
"$CHROME" --headless --no-sandbox --disable-gpu --hide-scrollbars \
  --window-size=1600,1100 --virtual-time-budget=9000 \
  --screenshot="$DIR/raw.png" \
  "file://$DIR/world-tree-poster.html" 2>/dev/null || true
python3 - "$DIR" <<'PY'
import sys
from PIL import Image
d=sys.argv[1]
Image.open(d+'/raw.png').convert('RGB').crop((0,0,1600,1000)).save(d+'/world-tree-poster.png')
print('rendered', d+'/world-tree-poster.png')
PY
