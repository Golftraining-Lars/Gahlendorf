"""Bilder aus der ODS je Blatt nach <out>/bilder/ kopieren; Zuordnung als JSON."""
import zipfile, re, json, sys, os, unicodedata
src, out = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(src); c = z.read('content.xml').decode()
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', s.replace('ä','ae').replace('ö','oe').replace('ü','ue').replace('ß','ss').lower()).encode('ascii','ignore').decode()).strip('-')
os.makedirs(os.path.join(out, 'bilder'), exist_ok=True)
cur = None; res = {}; n = {}
for m in re.finditer(r'<table:table table:name="([^"]+)"|xlink:href="(Pictures/[^"]+)"', c):
    if m.group(1): cur = m.group(1).replace('&amp;', '&'); continue
    p = m.group(2); ext = os.path.splitext(p)[1].lower()
    n[cur] = n.get(cur, 0) + 1; name = f'bilder/{slug(cur)}-{n[cur]:02d}{ext}'
    open(os.path.join(out, name), 'wb').write(z.read(p)); res.setdefault(cur, []).append(name)
json.dump(res, open(os.path.join(out, 'images.json'), 'w'), ensure_ascii=False, indent=1)
print({k: len(v) for k, v in res.items()})
