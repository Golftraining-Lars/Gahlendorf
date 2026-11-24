#!/bin/bash
# ODS -> Daten-Repo (workbook.json + bilder/). Einmalige Migration bzw. Notfall-Neuimport.
# Aufruf: tools/build_data.sh <Fehmarn.ods> <ziel-ordner> <version>
set -e
ODS="$1"; OUT="$2"; VER="$3"; T=$(mktemp -d); HERE=$(cd "$(dirname "$0")" && pwd)
cp "$ODS" "$T/f.ods"; (cd "$T" && soffice --headless --convert-to xlsx f.ods >/dev/null 2>&1)
python3 "$HERE/ods_extras.py" "$T/f.ods" "$T/extras.json"
mkdir -p "$OUT"; python3 "$HERE/ods_images.py" "$T/f.ods" "$OUT"
node "$HERE/ods2json.js" "$T/f.xlsx" "$T/extras.json" "$T/plain.json" "$VER"
node -e "
const C=require('$HERE/../wbcodec.js'),fs=require('fs');const w=JSON.parse(fs.readFileSync('$T/plain.json','utf8'));
w.images=JSON.parse(fs.readFileSync('$OUT/images.json','utf8'));const e=C.encode(w);fs.writeFileSync('$OUT/workbook.json',JSON.stringify(e));
console.log('workbook.json',fs.statSync('$OUT/workbook.json').size,'Bytes');"
rm -rf "$T"
