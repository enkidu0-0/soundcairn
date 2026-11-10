#!/bin/bash
# Copies the shared page from the desktop app into the Android assets and adds the Android-only pieces.
set -euo pipefail
cd "$(dirname "$0")"
SRC="../desktop"
OUT="app/src/main/assets"
rm -rf "$OUT" && mkdir -p "$OUT"
cp -R "$SRC/app/assets" "$OUT/assets"
cp -R "$SRC/app/vendor" "$OUT/vendor"
cp "$SRC/app/donate.js" "$OUT/donate.js"
{ echo "(function(){"; cat "$SRC/lib.js"; echo "})();"; } > "$OUT/lib.js"
cp bridge.js "$OUT/bridge.js"
python3 - "$SRC/app/index.html" "$OUT/index.html" <<'PY'
import sys
s = open(sys.argv[1]).read()
css = """<style>
.android #setPick, .android #setOpen, .android #setToolsOpen, .android .cov.where { display: none; }
</style>
<script src="lib.js"></script>
<script src="bridge.js"></script>
"""
open(sys.argv[2], "w").write(s.replace("</head>", css + "</head>", 1))
PY
echo "assets ready"
