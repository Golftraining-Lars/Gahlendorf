# Gahlendorf 10 – App

Progressive Web App für Renovierung, Kosten, Finanzen und Wissen rund um Gahlendorf 10 (Fehmarn).
**Seit 24.11.2026 ersetzt sie die Arbeitsmappe `Fehmarn.ods`** (letzte ODS-Version 8.12, Entscheidung Lars).

- **App (dieses Repo, öffentlich):** nur Code, keine Daten. Läuft über GitHub Pages.
- **Daten (Repo `Gahlendorf-Daten`, privat):** `workbook.json` (komplette Arbeitsmappe: alle 61 Blätter, Formeln, Werte, Formate, Auswahllisten) und `bilder/`.
- **Sync:** Cloudflare Worker `gahlendorf-sync` (Ordner `worker/`) – liest und schreibt das private Repo, **Lesen und Schreiben nur mit Schlüssel**.

> Datenschutz: In dieses Repo gehören **nie** echte Daten (auch keine Test-Kopie). `tests.js` arbeitet mit einer synthetischen Mini-Arbeitsmappe; der Abgleich mit echten Daten läuft nur lokal über `GAHLENDORF_DATA=…`.

## Architektur

| Datei | Aufgabe |
|---|---|
| `index.html` | Oberfläche (Start, Aufgaben, Kosten, Wissen, Mehr/alle Blätter), Speicher (IndexedDB), Sync, Export |
| `engine-worker.js` | Rechenkern im Hintergrund (Web Worker) |
| `engine.js` | HyperFormula + Zusatzfunktionen, damit die ODS-Formeln **unverändert** wie in LibreOffice rechnen |
| `core.js` | Arbeitsmappe im Rechenkern: Operationen, Protokoll, Schnappschuss – gemeinsam für App, Tests und Chat-Werkzeug |
| `wbcodec.js` | Kompaktes Speicherformat (Formeln relativ kodiert, Vorlagen + Läufe je Spalte) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installierbar, App-Hülle offline |
| `tools/wbcli.js` | Kommandozeile für die Claude-Chats (gleiche Ops wie die App) |
| `tools/build_data.sh` (+ `ods_extras.py`, `ods_images.py`, `ods2json.js`) | Einmaliger Import aus einer `.ods` (Migration / Notfall) |
| `worker/` | Cloudflare Worker + `wrangler.toml` |
| `tests.js` | Commit-Gate: `node tests.js` muss grün sein (Exitcode 0) |

### Rechnen
- Formeln bleiben im Excel-Stil (englische Funktionsnamen, Komma als Trenner) – so wie LibreOffice sie beim Export schreibt.
- `engine.js` ergänzt bzw. ersetzt Funktionen mit LibreOffice-Verhalten: N, TEXTJOIN, LOOKUP, RANK, FIXED, VALUE, TEXT, INDEX (einzeilig = Spaltenindex, leere Zelle = „leer“), MATCH (Platzhalter `*`/`?`), COUNTIF(S)/SUMIF(S)/AVERAGEIF(S)/MINIFS/MAXIFS (Kriterium `""` = leere Zellen, `"<>"` = nicht leer), ROW(Bereich) als Matrix, ROUNDUP/ROUNDDOWN ohne Gleitkommafehler, IRR, TODAY (für Tests einstellbar).
- Abgleich bei der Migration: **41.891 von 41.892 Formeln identisch** mit LibreOffice (einzige Abweichung: leere Zelle wird als leer statt 0 angezeigt).
- Start: Die App zeigt sofort die zuletzt gespeicherten Werte; der Rechenkern baut sich im Hintergrund auf (Desktop ca. 15–25 s, Handy länger). Änderungen erscheinen sofort, Folgewerte (Summen, Fälligkeiten, Ampeln) nach dem Rechengang.

### Operationen (`core.js` → `Book.apply(op)`)
Jede Änderung ist eine Operation. Sie wird lokal ausgeführt, im Journal gespeichert und bei einem Sync-Konflikt auf die frische Fassung erneut angewandt. Zeilen werden über ihren **Schlüssel** gefunden (Renovierungsplan/Kostenplan: Nr. in Spalte A, Wissensspeicher: ID, Kontakte: Name), nicht über die Position.

| Operation | Felder | Wirkung |
|---|---|---|
| `set` | `sheet, key\|r, c, input` | eine Zelle; Protokolleintrag (außer `log:false`) |
| `sets` | `sheet, key\|r, cells:{Spalte:Wert}` | mehrere Zellen einer Zeile in einem Rechengang, ein Protokolleintrag |
| `task` | `fields:{B:…, D:…, F:…, Z:Datum …}` | neue Aufgabe im Renovierungsplan: letzte Aufgabenzeile mit Formeln kopieren, H N P AD Z Y W leeren, C=offen, T=beide, O=Lars, nächste freie Nr. |
| `ws` | `fields:{inhalt, nr, thema, typ, quelle, status, aufgabe}` | neuer Wissensspeicher-Eintrag mit nächster W-Nummer und heutigem Datum |
| `row` | `sheet, col, fields:{Spalte:Wert}, copyFormulas` | neue Zeile am Blattende (z. B. Kontakte) |
| `version` | `to, date, by` | Versionspflege wie bisher: Übersicht B3/C3, Legende A1, Arbeitsweise B12, Stand der Dinge A1 |

Jede Operation schreibt ins Blatt **Aenderungsprotokoll** (`[Lars] …`, `[Mio] …`, `[Renovierungsplan-Chat] …`).

**Regel aus der Arbeitsweise (18.11.2026) bleibt:** Status und „erledigt am“ von Maßnahmen, die im Kostenplan stehen, werden nur im Kostenplan geändert. Die App macht das automatisch: Ändert man den Status einer solchen Aufgabe, schreibt sie in den Kostenplan (Spalten C/D).

### Sync (wie bei der Golf-PWA, „SHA-Türsteher“)
1. Laden: `GET ?fresh=1&path=workbook.json` mit `X-Read-Key` → Inhalt + `X-Repo-Sha`.
2. Speichern (3,5 s nach der letzten Änderung): Schnappschuss → `POST` mit `X-Write-Key`, `X-Base-Sha`, Inhalt als Base64 (`X-Encoding: base64`, spart dem Worker CPU-Zeit).
3. `409` = jemand anderes (anderes Gerät, Claude-Chat) hat inzwischen geschrieben → frische Fassung holen, eigene Ops aus dem Journal erneut anwenden, wieder senden.
4. Beim Öffnen und bei Rückkehr in die App wird die Kennung geprüft und ggf. neu geladen.

## Einrichtung (einmalig)
1. **GitHub-Token** (github.com → Settings → Developer settings → Fine-grained tokens): nur Repo `Gahlendorf-Daten`, Berechtigung *Contents: Read and write*.
2. **Cloudflare Worker** (dash.cloudflare.com → Workers & Pages → Create → Worker `gahlendorf-sync`): Inhalt von `worker/worker.js` einfügen, Deploy. Unter *Settings → Variables and Secrets* drei **Secrets** anlegen: `GITHUB_TOKEN` (Token aus 1), `READ_KEY` und `WRITE_KEY` (je eine lange Zufallszeichenkette, z. B. 40 Zeichen aus einem Passwortmanager).
3. **GitHub Pages** für dieses Repo: Settings → Pages → *Deploy from a branch* → `main` / `(root)`.
4. **App öffnen** (`https://golftraining-lars.github.io/Gahlendorf/`), *Mehr → Einstellungen*: Worker-Adresse, Lese- und Schreib-Schlüssel, Name → *Speichern & verbinden*. Danach „Zum Startbildschirm hinzufügen“.
5. Auf Mios Gerät genauso, mit Name „Mio“ (Schreib-Schlüssel leer lassen = nur lesen).

## Arbeiten mit Claude-Chats
Chats klonen beide Repos, ändern `workbook.json` **nur über `tools/wbcli.js`** (gleiche Ops wie die App, rechnet alle Formeln neu) und committen ins Daten-Repo. Details: `CLAUDE.md` im Daten-Repo.

```bash
node tools/wbcli.js read   ../gahlendorf-daten/workbook.json Renovierungsplan 500 515
node tools/wbcli.js apply  ../gahlendorf-daten/workbook.json ops.json     # Ops wie oben
node tools/wbcli.js script ../gahlendorf-daten/workbook.json skript.js    # freie Änderungen über die Book-API
node tools/wbcli.js xlsx   ../gahlendorf-daten/workbook.json Fehmarn.xlsx # Export für LibreOffice
```

## Standardregeln (wie bei der Golf-PWA)
- Bei **jeder** Code-Änderung `tests.js` anpassen; `node tests.js` muss grün sein, bevor committet wird.
- Diese Doku aktuell halten: neue Operationen in die Tabelle oben (der Test prüft das), Changelog unten, Versionsnummer in `core.js` (`VERSION`), `index.html` (`APP_VERSION`) und `sw.js` (Cache-Name) gleich halten (der Test prüft das).

## Changelog
## 1.0.0
- 24.11.2026: Erste Fassung. Komplette Übernahme von Fehmarn.ods v8.12 (61 Blätter, 41.892 Formeln, 54 Auswahllisten, 48 Bilder). Ansichten Start, Aufgaben (Status, Neu, Erledigt-Haken), Kosten (Kostenplan), Wissen (Suche, Neu), Finanzen, Kontakte, Entscheidungen, Berichte, alle Blätter als Tabelle mit Bearbeiten. Offline-fähig, Sync über Cloudflare Worker, Excel-Export.
