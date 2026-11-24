"""Liest aus der ODS, was der xlsx-Umweg verliert: Auswahllisten (Validierung) je Zelle,
Spaltenbreiten, ausgeblendete Spalten/Zeilen/Blätter, Zellhintergrund + Fett (vereinfacht)."""
import zipfile, re, json, sys
from lxml import etree
src, out = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(src); root = etree.fromstring(z.read('content.xml')); sty = etree.fromstring(z.read('styles.xml'))
NS = {'table':'urn:oasis:names:tc:opendocument:xmlns:table:1.0','style':'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
      'fo':'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0','office':'urn:oasis:names:tc:opendocument:xmlns:office:1.0'}
T = '{%s}' % NS['table']; S = '{%s}' % NS['style']; FO = '{%s}' % NS['fo']
def ref2(a):  # "$Listen.$R$3:.$R$4" -> (sheet, r0,c0,r1,c1)
    a = a.strip('[]'); parts = a.split(':')
    def one(p, sheet=None):
        p = p.replace('$', '')
        if '.' in p:
            sh, cell = p.rsplit('.', 1); sh = sh.strip("'") or sheet
        else: sh, cell = sheet, p
        m = re.match(r'([A-Z]+)(\d+)', cell); c = 0
        for ch in m.group(1): c = c*26 + ord(ch)-64
        return sh, int(m.group(2))-1, c-1
    s0, r0, c0 = one(parts[0]); s1, r1, c1 = one(parts[1], s0) if len(parts) > 1 else (s0, r0, c0)
    return [s0, r0, c0, r1, c1]
vals = {}
for v in root.iter(T+'content-validation'):
    cond = v.get(T+'condition') or ''
    m = re.match(r'of:cell-content-is-in-list\((.*)\)$', cond)
    if not m: continue
    arg = m.group(1)
    if arg.startswith('['): vals[v.get(T+'name')] = {'range': ref2(arg)}
    else: vals[v.get(T+'name')] = {'list': [x.strip('"') for x in re.findall(r'"[^"]*"', arg)]}
# Stile: Hintergrund + fett
styles = {}
for st in root.iter(S+'style'):
    if st.get(S+'family') != 'table-cell': continue
    d = {}
    tc = st.find(S+'table-cell-properties'); tp = st.find(S+'text-properties')
    if tc is not None and tc.get(FO+'background-color') not in (None, 'transparent'): d['bg'] = tc.get(FO+'background-color')
    if tp is not None and tp.get(FO+'font-weight') == 'bold': d['b'] = 1
    if tp is not None and tp.get(FO+'color'): d['fg'] = tp.get(FO+'color')
    if d: styles[st.get(S+'name')] = d
colw = {}
for st in root.iter(S+'style'):
    if st.get(S+'family') == 'table-column':
        p = st.find(S+'table-column-properties')
        if p is not None and p.get(S+'column-width'):
            w = p.get(S+'column-width'); x = float(re.sub('[a-z]', '', w)); unit = re.sub('[0-9.]', '', w)
            colw[st.get(S+'name')] = round(x*37.8 if unit == 'cm' else x*96 if unit == 'in' else x)
tabvis = {}
for st in root.iter(S+'style'):
    if st.get(S+'family') == 'table':
        p = st.find(S+'table-properties')
        if p is not None and p.get(T+'display') == 'false': tabvis[st.get(S+'name')] = False
res = {'validations': vals, 'sheets': {}}
for t in root.iter(T+'table'):
    name = t.get(T+'name'); sh = {'hidden': t.get(T+'style-name') in tabvis, 'cols': [], 'hiddenCols': [], 'hiddenRows': [], 'val': {}, 'sty': {}}
    c = 0
    for col in t.iter(T+'table-column'):
        n = int(col.get(T+'number-columns-repeated', '1'))
        for k in range(min(n, 80)):
            if c + k < 80:
                sh['cols'].append(colw.get(col.get(T+'style-name'), 80))
                if col.get(T+'visibility') == 'collapse': sh['hiddenCols'].append(c+k)
        c += n
        dcs = col.get(T+'default-cell-style-name')
    r = 0
    for row in t.iter(T+'table-row'):
        rep = int(row.get(T+'number-rows-repeated', '1'))
        if row.get(T+'visibility') == 'collapse' and rep < 5000: sh['hiddenRows'] += list(range(r, r+rep))
        if rep > 3000: r += rep; continue
        cc = 0
        for cell in row:
            if cell.tag not in (T+'table-cell', T+'covered-table-cell'): continue
            n = int(cell.get(T+'number-columns-repeated', '1'))
            vn = cell.get(T+'content-validation-name'); sn = cell.get(T+'style-name')
            for k in range(min(n, 80 - cc) if cc < 80 else 0):
                for rr in range(rep if rep < 3000 else 0):
                    key = f'{r+rr},{cc+k}'
                    if vn and vn in vals: sh['val'][key] = vn
                    if sn in styles: sh['sty'][key] = sn
            cc += n
        r += rep
    res['sheets'][name] = sh
res['styles'] = styles
json.dump(res, open(out, 'w'), ensure_ascii=False)
print('validations', len(vals), 'sheets', len(res['sheets']), 'hidden', [k for k, v in res['sheets'].items() if v['hidden']][:30])
