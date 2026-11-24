#!/usr/bin/env python3
"""Erzeugt die Tagesliste Gahlendorf 10 als HTML-Seite aus workbook.json (Daten-Repo).
Nachfolger von tagesliste_generator.py (las früher Fehmarn.ods) – Layout und Logik unverändert.
Aufruf: python3 tools/tagesliste.py <workbook.json> <ausgabe.html> [YYYY-MM-DD]
Benötigt pandas. Liest die gespeicherten Werte (die App bzw. wbcli.js rechnen sie bei jedem Speichern neu)."""
import sys, html, json, datetime as dt, warnings
import pandas as pd
warnings.filterwarnings('ignore')
src, out = sys.argv[1], sys.argv[2]
today = pd.Timestamp(sys.argv[3]) if len(sys.argv) > 3 else pd.Timestamp(dt.date.today())
WB = json.load(open(src, encoding='utf-8'))
def _grid(name):
    s = next(x for x in WB['sheets'] if x['name'] == name)
    R = max(len(s['k']), len(s['v']), max([f[2]+1 for f in s['frm']] or [0]))
    C = max([len(r) for r in s['k']] + [len(r) for r in s['v']] + [f[0]+1 for f in s['frm']] + [1])
    g = [[None]*C for _ in range(R)]
    for r,row in enumerate(s['k']):
        for c,x in enumerate(row):
            if x is not None: g[r][c] = x[1:] if isinstance(x,str) and x[:1]=="'" else x
    for r,row in enumerate(s['v']):
        for c,x in enumerate(row):
            if x is not None: g[r][c] = None if isinstance(x,dict) else x
    return g
def _date(v):
    if isinstance(v,(int,float)) and not isinstance(v,bool) and v > 30000: return pd.Timestamp('1899-12-30') + pd.Timedelta(days=int(v))
    return pd.NaT
def sheet(name, header):
    g = _grid(name)
    if header == 0: df = pd.DataFrame(g[1:]); df.columns = range(df.shape[1]) ; return df
    return pd.DataFrame(g)
WT = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag']
def e(s): return html.escape(str(s))
def short(s, n=110):
    s = ' '.join(str(s).split()); return s if len(s) <= n else s[:n-1].rstrip() + '…'
def fd(d): return d.strftime('%d.%m.')
import re
def clean(v):
    s = '' if pd.isna(v) else ' '.join(str(v).split())
    s = re.sub(r'\[(Verlauf|Kurzfassung)[^\]]*\]', '', s).strip()
    return '' if s.lower() == 'nan' else s
def detail(r):
    # Ergänzt 09.11.2026 (Tagesliste-Chat, Wunsch Lars): pro Aufgabe ausführlich – was genau zu tun ist und der neueste Stand
    m = clean(r.iloc[12]); parts = re.split(r'\s*\|\s*Neuester Stand\s*', m)
    how = parts[0].strip(' |'); new = ('Stand ' + parts[-1].strip()) if len(parts) > 1 else ''
    if not new:
        mm = re.search(r'(\d{2}\.\d{2}\.:\s.*)$', how)
        if mm and mm.start() > 0: new, how = mm.group(1), how[:mm.start()].strip()
    out = []
    if how: out.append(f'<span class="d"><b>So geht’s:</b> {e(short(how, 420))}</span>')
    if new: out.append(f'<span class="d"><b>Neuester Stand:</b> {e(short(new, 300))}</span>')
    who = clean(r.iloc[6]); gw = clean(r.iloc[5]); bl = clean(r.iloc[8])
    info = ' · '.join(x for x in [f'Wer: {who}' if who else '', f'Gewerk: {gw}' if gw else '', f'wartet auf Nr. {bl}' if bl else ''] if x)
    if info: out.append(f'<span class="d i">{e(info)}</span>')
    return ''.join(out)

rp = sheet('Renovierungsplan', 0)
rp = rp[pd.to_numeric(rp.iloc[:,0], errors='coerce').notna()]
rp = rp[~rp.iloc[:,2].astype(str).str.strip().isin(['erledigt','entfällt'])]
rp['nr'] = rp.iloc[:,0].astype(int); rp['txt'] = rp.iloc[:,1]; rp['st'] = rp.iloc[:,2].astype(str)
rp['prio'] = pd.to_numeric(rp.iloc[:,3], errors='coerce').fillna(10).astype(int)
rp['due'] = rp.iloc[:,26].map(_date)
rp['own'] = rp.iloc[:,25].map(_date)  # Spalte Z = eigenes Datum
# Heute: Aufgaben mit eigenem Termin (Spalte Z) genau heute – eigener Block oben (ergänzt 07.11.2026, Renovierungsplan-Chat)
hd = rp[rp.own.dt.normalize() == today].sort_values(['prio','nr'])
rp = rp[~rp.nr.isin(hd.nr)]
od = rp[rp.due <= today].sort_values(['prio','due'])
wk = rp[(rp.due > today) & (rp.due <= today + pd.Timedelta(days=7))].sort_values(['prio','due'])

fr = sheet('Fristen', None)
fr['d'] = fr[0].map(_date)
fr = fr[(fr.d >= today) & (fr.d <= today + pd.Timedelta(days=7))].sort_values('d')
wa = sheet('Regelmäßige Wartung', None)
wa = wa[wa[9].astype(str).str.contains('überfällig|bald', na=False)]
en = sheet('Entscheidungen', None)
en = en[en[3].astype(str).str.strip() == 'OFFEN']

def task_rows(df, kind):
    rows = []
    for _, r in df.iterrows():
        late = (today - r.due).days if kind == 'od' else None
        meta = (f'seit {fd(r.due)} · {late} T' if late else 'heute fällig') if kind == 'od' else f'bis {WT[r.due.weekday()][:2]} {fd(r.due)}'
        cls = 'p1' if r.prio == 1 else ('p2' if r.prio == 2 else 'px')
        rows.append(f'<li class="task {cls}"><input type="checkbox" id="c{r.nr}" data-k="{r.nr}"><label for="c{r.nr}"><span class="nr">{r.nr}</span><span class="t">{e(clean(r.txt))}</span>{detail(r)}<span class="meta"><span class="pill">P{r.prio}</span>{e(meta)}{" · läuft" if r.st=="läuft" else ""}</span></label></li>')
    return rows

def block(title, rows, sub, split=12):
    if not rows: return f'<section><h2>{title}</h2><p class="empty">Nichts offen.</p></section>'
    head, rest = rows[:split], rows[split:]
    more = f'<details><summary>{len(rest)} weitere anzeigen</summary><ul class="list">{"".join(rest)}</ul></details>' if rest else ''
    return f'<section><h2>{title} <span class="count">{len(rows)}</span></h2><p class="sub">{sub}</p><ul class="list">{"".join(head)}</ul>{more}</section>'

odr = task_rows(od, 'od'); wkr = task_rows(wk, 'wk'); hdr = task_rows(hd, 'od')
p1o = sum(od.prio == 1); p1w = sum(wk.prio == 1)
termine = ''.join(f'<li><span class="date">{WT[r.d.weekday()][:2]} {fd(r.d)}</span><span class="t">{e(clean(r[1]))}{("<br><small>" + e(short(clean(r[7]),260)) + "</small>") if len(r) > 7 and clean(r[7]) else ""}</span><span class="tag">{e(r[2])}</span></li>' for _, r in fr.iterrows()) or '<li class="empty">Keine Termine in den nächsten 7 Tagen.</li>'
wart = ''.join(f'<li class="{"warn" if "überfällig" in str(r[9]) else "soon"}"><span class="nr">{e(r[0])}</span><span class="t">{e(clean(r[2]))}{("<br><small>" + e(short(clean(r[12]),220)) + "</small>") if clean(r[12]) else ""}</span><span class="tag">{e(r[9])}</span></li>' for _, r in wa.iterrows()) or '<li class="empty">Alles im grünen Bereich.</li>'
ents = ''.join(f'<li><b>{e(r[1])}</b> – {e(short(r[2],140))}</li>' for _, r in en.head(3).iterrows())

page = f'''<title>Tagesliste Gahlendorf 10</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono:wght@500&display=swap">
<style>
/* Layout: eine ruhige Spalte wie ein Klemmbrett – Kopf mit Datum und Zählern, darunter die Listen nach Dringlichkeit */
:root{{--bg:#f3f5f4;--card:#ffffff;--fg:#1d2a2a;--muted:#5b6b6a;--line:#d6dedc;--accent:#1f6f78;--red:#b42318;--amber:#9a6200;--redbg:#fdeceb;--amberbg:#fdf3e1;
--f-display:"Fraunces",Georgia,serif;--f-body:"Source Sans 3",system-ui,sans-serif;--f-mono:"JetBrains Mono",ui-monospace,monospace}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#111818;--card:#182222;--fg:#e4ecea;--muted:#9aaba9;--line:#2c3a3a;--accent:#6cc3cc;--red:#ff8a80;--amber:#f2b552;--redbg:#3a1d1b;--amberbg:#3a2d14;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#111818;--card:#182222;--fg:#e4ecea;--muted:#9aaba9;--line:#2c3a3a;--accent:#6cc3cc;--red:#ff8a80;--amber:#f2b552;--redbg:#3a1d1b;--amberbg:#3a2d14;color-scheme:dark}}
body{{background:var(--bg);color:var(--fg);font:16px/1.45 var(--f-body);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:20px 40px}}
.wrap{{max-width:760px;margin:0 auto;display:grid;gap:22px}}
header{{display:grid;gap:6px}}
.eyebrow{{font:500 12px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}}
h1{{font:600 clamp(26px,6vw,36px)/1.1 var(--f-display);margin:0;text-wrap:balance}}
.stats{{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}}
.stat{{font:500 13px var(--f-mono);padding:4px 10px;border-radius:999px;background:var(--card);border:1px solid var(--line)}}
.stat.r{{color:var(--red);border-color:var(--red)}}
.hint{{color:var(--muted);font-size:14px;margin:0}}
section{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;min-width:0}}
h2{{font:600 19px/1.2 var(--f-display);margin:0 0 2px}}
.count{{font:500 13px var(--f-mono);color:var(--muted)}}
.sub{{margin:0 0 8px;color:var(--muted);font-size:14px}}
.list,.plain{{list-style:none;margin:0;padding:0;display:grid}}
.task label{{display:grid;grid-template-columns:44px 1fr;gap:2px 8px;padding:8px 0;border-top:1px solid var(--line);cursor:pointer}}
.task input{{position:absolute;opacity:0}}
.task input:focus-visible+label{{outline:2px solid var(--accent);outline-offset:2px}}
.task input:checked+label{{opacity:.45}} .task input:checked+label .t{{text-decoration:line-through}}
.nr{{font:500 14px var(--f-mono);color:var(--accent);font-variant-numeric:tabular-nums;grid-row:span 5}}
.task .t{{font-weight:600}}
.d{{display:block;font-size:14px;color:var(--fg);margin-top:2px}} .d b{{color:var(--accent);font-weight:600}} .d.i{{color:var(--muted);font-size:13px}}
.task .t{{min-width:0}}
.meta{{font-size:13px;color:var(--muted);display:flex;gap:6px;align-items:center;flex-wrap:wrap}}
.pill{{font:500 11px var(--f-mono);padding:1px 6px;border-radius:4px;background:var(--bg);border:1px solid var(--line)}}
.p1 .pill{{color:var(--red);border-color:var(--red)}}
.plain li{{display:grid;grid-template-columns:auto 1fr auto;gap:4px 10px;padding:8px 0;border-top:1px solid var(--line);align-items:baseline}}
.plain .t{{min-width:0}}
.date{{font:500 13px var(--f-mono);color:var(--accent);font-variant-numeric:tabular-nums;white-space:nowrap}}
.tag{{font-size:12px;color:var(--muted)}}
.warn .tag{{color:var(--red);font-weight:600}} .soon .tag{{color:var(--amber);font-weight:600}}
.ent li{{grid-template-columns:1fr}}
details summary{{cursor:pointer;color:var(--accent);font-weight:600;padding:8px 0;border-top:1px solid var(--line)}}
.empty{{color:var(--muted)}}
footer{{color:var(--muted);font-size:13px}}
@media (max-width:480px){{.plain li{{grid-template-columns:1fr}} .tag{{justify-self:start}}}}
</style>
<div class="wrap">
<header>
<div class="eyebrow">Gahlendorf 10 · Tagesliste</div>
<h1>{WT[today.weekday()]}, {today.strftime('%d.%m.%Y')}</h1>
<div class="stats"><span class="stat r">{len(hd)} mit Termin heute</span><span class="stat r">{len(od)} überfällig · davon {p1o} Prio 1</span><span class="stat">{len(wk)} fällig in 7 Tagen · {p1w} Prio 1</span><span class="stat">{len(fr)} Termine</span></div>
<p class="hint">Abhaken merkt sich nur dieses Gerät. Status ändern: in der App Gahlendorf 10 (golftraining-lars.github.io/Gahlendorf) oder Claude im Tagesliste-Chat sagen.</p>
</header>
<section><h2>Termine &amp; Fristen</h2><p class="sub">nächste 7 Tage</p><ul class="plain">{termine}</ul></section>
{block('Heute (fester Termin)', hdr, 'Aufgaben mit eigenem Termin heute', split=40) if len(hd) else ''}
{block('Überfällig', odr, 'Prio 1 zuerst, dann nach Fälligkeit')}
{block('Diese Woche fällig', wkr, 'bis ' + fd(today + pd.Timedelta(days=7)) + ' – Prio 1 zuerst')}
<section><h2>Wartung</h2><p class="sub">überfällig oder bald</p><ul class="plain">{wart}</ul></section>
<section><h2>Offene Entscheidungen</h2><ul class="plain ent">{ents or '<li class="empty">Keine offenen Entscheidungen.</li>'}</ul></section>
<footer>Stand: Arbeitsmappe (App), gelesen am {today.strftime('%d.%m.%Y')} · wird jeden Morgen gegen 6:40 Uhr neu erstellt.</footer>
</div>
<script>
(function(){{var key='tl-{today.strftime('%Y-%m-%d')}',s={{}};try{{s=JSON.parse(localStorage.getItem(key)||'{{}}')}}catch(e){{}}
document.querySelectorAll('.task input').forEach(function(c){{c.checked=!!s[c.dataset.k];c.addEventListener('change',function(){{s[c.dataset.k]=c.checked;try{{localStorage.setItem(key,JSON.stringify(s))}}catch(e){{}}}})}});}})();
</script>'''
open(out, 'w', encoding='utf-8').write(page)
print('ok', len(od), len(wk), len(fr))
