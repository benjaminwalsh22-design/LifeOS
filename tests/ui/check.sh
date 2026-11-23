#!/bin/bash
# Rebuild the preview and run every check. Usage: tests/ui/check.sh [quick]
# Set LIFEOS_PAYLOAD (and LIFEOS_LIFE) to a copy of real app data to also run the layout test against it; never commit that file.
cd "$(dirname "$0")/../.." || exit 1
python3 tools/next/build.py || exit 1
cd tests/ui
node -e "
const fs=require('fs');const html=fs.readFileSync('../../next.html','utf8');
const code=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((a,b)=>b.length-a.length)[0];
try{ new Function(code); console.log('syntax ok') }catch(e){ console.log('SYNTAX', e.message); process.exit(1) }" || exit 1
F=$(cd ../.. && pwd)/next.html   # the preview; index.html is the live app
echo "nav:     $(node nav.test.js | grep -v '^ok' | tr '\n' ' ')"
echo "sprint:  $(LIFEOS_FILE=$F node sprint.test.js | grep -v '^ok' | tr '\n' ' ')"
echo "study:   $(LIFEOS_FILE=$F node study.test.js | grep -v '^ok' | tr '\n' ' ')"
echo "goals:   $(LIFEOS_FILE=$F node goals.test.js | grep -v '^ok' | tr '\n' ' ')"
echo "reader:  $(node ../goal/sift.test.mjs | tail -1)"
echo "parity:  $(node parity.test.js | grep -v '^ok' | tr '\n' ' ')"
echo "contrast: $(python3 contrast.py | tail -1)"
[ "$1" = quick ] || echo "gesture: $(node gesture.test.js | grep -v '^ok' | tr '\n' ' ')"
[ "$1" = quick ] || echo "smoke:   $(node smoke.test.js | grep -v '^ok' | tr '\n' ' ')"
[ "$1" = quick ] || echo "layout:  $(node layout.test.js | tail -4 | tr '\n' ' ')"
[ "$1" = quick ] || [ -z "$LIFEOS_PAYLOAD" ] || echo "layout (your data): $(node layout.test.js | tail -4 | tr '\n' ' ')"
