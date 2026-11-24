# Gahlendorf 10 – App

Progressive Web App für Renovierung, Kosten, Finanzen und Wissen rund um Gahlendorf 10 (Fehmarn).
**Seit 24.11.2026 ersetzt sie die Arbeitsmappe `Fehmarn.ods`** (letzte ODS-Version 8.12, Entscheidung Lars).

- **App (dieses Repo, öffentlich):** nur Code, keine Daten. Läuft über GitHub Pages.
- **Daten (Repo `Gahlendorf-Daten`, privat):** seit 1.1.0 **eine Datei je Blatt**: `meta.json` (Reihenfolge der Blätter, Formate, Auswahllisten, Bilder-Zuordnung, Fotos zu Aufgaben) und `sheets/<blatt>.json` (Eingaben, Formeln, letzte Werte); dazu `bilder/` (Bilder aus der ODS) und `bilder/aufgaben/` (Fotos aus der App). Bis 1.0.x lag alles in einer `workbook.json`.
- **Sync:** Cloudflare Worker `gahlendorf-sync` (Ordner `worker/`) – liest und schreibt das private Repo, **Lesen und Schreiben nur mit Schlüssel**.

> Datenschutz: In dieses Repo gehören **nie** echte Daten (auch keine Test-Kopie). `tests.js` arbeitet mit einer synthetischen Mini-Arbeitsmappe; der Abgleich mit echten Daten läuft nur lokal über `GAHLENDORF_DATA=…`.

## Architektur

| Datei | Aufgabe |
|---|---|
| `index.html` | Oberfläche (Start, Aufgaben, Kosten, Wissen, Mehr/alle Blätter), Speicher (IndexedDB), Sync, Export |
| `engine-worker.js` | Rechenkern im Hintergrund (Web Worker) |
| `engine.js` | HyperFormula + Zusatzfunktionen, damit die ODS-Formeln **unverändert** wie in LibreOffice rechnen |
| `core.js` | Arbeitsmappe im Rechenkern: Operationen, Protokoll, Schnappschuss – gemeinsam für App, Tests und Chat-Werkzeug |
| `ui-logic.js` | Reine Oberflächen-Logik ohne DOM (Heute dran, Aufräumen, Filter, Klartext-Status, Datumsrechnung) – von `tests.js` geprüft |
| `wbcodec.js` | Kompaktes Speicherformat (Formeln relativ kodiert, Vorlagen + Läufe je Spalte); `encodeSplit`/`fromTexts` = eine Datei je Blatt |
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
| `foto` | `nr, path, date` | Foto zu einer Aufgabe (Datei `bilder/aufgaben/<nr>-<zeit>.jpg`, Liste in `meta.json` → `fotos`) |
| `version` | `to, date, by` | Versionspflege wie bisher: Übersicht B3/C3, Legende A1, Arbeitsweise B12, Stand der Dinge A1 |

Jede Operation schreibt ins Blatt **Aenderungsprotokoll** (`[Lars] …`, `[Mio] …`, `[Renovierungsplan-Chat] …`).

**Regel aus der Arbeitsweise (18.11.2026) bleibt:** Status und „erledigt am“ von Maßnahmen, die im Kostenplan stehen, werden nur im Kostenplan geändert. Die App macht das automatisch: Ändert man den Status einer solchen Aufgabe, schreibt sie in den Kostenplan (Spalten C/D).

### Sync (Worker v2, „Git-Tree-Commit“)
1. `GET ?manifest=1` → aktueller Commit + Kennung (Blob-SHA) jeder Datei. Die App lädt nur Dateien, deren Kennung sich geändert hat (`?fresh=1&path=…&ref=<commit>`).
2. Speichern: lokal 3,5 s nach der letzten Änderung (IndexedDB); ans Repo höchstens alle 2 Minuten bzw. sofort beim Verlassen der App / „Jetzt abgleichen“.
3. `POST ?commit=1` mit `{base, message, files:[{path,text}|{path,base64}]}` – nur die geänderten Blätter (+ neue Fotos). Der Worker baut daraus **einen** Commit (Blobs → Tree → Commit → Ref ohne force).
4. `409` = inzwischen hat jemand anderes committet (anderes Gerät, Claude-Chat) → frische Fassung holen, eigene Ops aus dem Journal erneut anwenden, wieder senden.
5. Übernahme aus 1.0.x: Die App wandelt eine lokale bzw. entfernte `workbook.json` automatisch ins neue Format um.

## Einrichtung (einmalig)
1. **GitHub-Token** (github.com → Settings → Developer settings → Fine-grained tokens): nur Repo `Gahlendorf-Daten`, Berechtigung *Contents: Read and write*.
2. **Cloudflare Worker** (bei Updates nur den Code ersetzen und *Deploy*) (dash.cloudflare.com → Workers & Pages → Create → Worker `gahlendorf-sync`): Inhalt von `worker/worker.js` einfügen, Deploy. Unter *Settings → Variables and Secrets* drei **Secrets** anlegen: `GITHUB_TOKEN` (Token aus 1), `READ_KEY` und `WRITE_KEY` (je eine lange Zufallszeichenkette, z. B. 40 Zeichen aus einem Passwortmanager).
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
node tools/wbcli.js serial 24.11.2026                                     # Datum → Zahl (Datumszellen)
python3 tools/tagesliste.py ../gahlendorf-daten/workbook.json tagesliste.html 2026-11-24  # Tagesliste-Seite
```
Startprompts für die Chats: `docs/Startprompt_Tagesliste_Chat.txt`, `docs/Startprompt_Gahlendorf_Chat.txt`.

## Standardregeln (wie bei der Golf-PWA)
- Bei **jeder** Code-Änderung `tests.js` anpassen; `node tests.js` muss grün sein, bevor committet wird.
- Diese Doku aktuell halten: neue Operationen in die Tabelle oben (der Test prüft das), Changelog unten, Versionsnummer in `core.js` (`VERSION`), `index.html` (`APP_VERSION`) und `sw.js` (Cache-Name) gleich halten (der Test prüft das).

## Changelog
## 1.2.0
- 24.11.2026: **Bedienung (Audit 1–13).** Start: Block „Heute dran“ (max. 5: fester Termin heute, dann Prio 1–2 fällig), weitere Bereiche einklappbar mit Anzahl; **„Überfälliges aufräumen“** (je Aufgabe +1 Woche / +1 Monat / +3 Monate / Datum / erledigt / entfällt / überspringen; setzt Spalte Z bzw. den Status – Kostenplan-Regel bleibt). Aufgabendialog: Knöpfe unten immer sichtbar, Nachfrage bei ungespeicherten Änderungen, Schnellknöpfe für die Fälligkeit, „Meine Bemerkungen“ (Spalte N) oben, Bemerkungen (M) einklappbar. Langer Druck auf den Erledigt-Kreis = Statusauswahl. **Rückgängig** (6 s) nach erledigt/Status/Datum/Einkauf. Startanzeige des Rechenkerns mit Fortschritt (nach der Dauer des letzten Starts) und vorgemerkten Änderungen. Statusanzeige oben in Klartext („Alles gespeichert“, „3 Änderungen warten“). Aufgaben: Filter Etappe/Gewerk/Ausführung, „Ohne Datum“, Sortierung, „weitere laden“. Wissen: Themen-Leiste, Filter Thema/Typ, Aufgaben-Nummern antippbar, „weitere laden“. Mehr: Suche, zuletzt geöffnet. Tabellen: Zeile als Karte (Zeilennummer bzw. am Handy jede Zelle), Spaltenauswahl je Blatt. Neue Ansichten **Eigenleistung**, **Einkaufsliste** (abhaken), **Fotos & Bilder**. Bedienbarkeit mit Tastatur/Bildschirmleser (Rollen, Beschriftungen). Neue Datei `ui-logic.js` (reine Logik, in `tests.js` geprüft).
## 1.1.0
- 24.11.2026: **Eine Datei je Blatt** + Worker v2 (ein Commit mit nur den geänderten Blättern über die Git-Daten-API) – das Daten-Repo wächst nur noch um echte Änderungen. **Start = Tagesliste** (Heute, Überfällig, Diese Woche, Termine 7 Tage, Wartung, Entscheidungen). **Diagramme** Kontostand-Prognose (Finanzen). **Bedingte Farben** in der Tabellenansicht (Prio-Farbskala, Status, Ampeln, gestrichene Kosten). **Fotos an Aufgaben** (verkleinert, offline vorgemerkt). Ansichten finden Kostenplan-/Finanzzeilen über Beschriftungen statt fester Positionen; Protokoll zeigt Datumsangaben als TT.MM.JJJJ. `wbcli.js` und `tagesliste.py` lesen/schreiben den Daten-Ordner.
## 1.0.1
- 24.11.2026: Senden ans Daten-Repo höchstens alle 2 Minuten (sofort beim Verlassen der App / „Jetzt abgleichen“) – jeder Push ist ein Commit der ganzen Arbeitsmappe. Geräte ohne Schreib-Schlüssel sind echt „nur lesen“. Content-Security-Policy. Neu: `tools/tagesliste.py` (Tagesliste aus workbook.json), `wbcli.js serial`, Startprompts in `docs/`.
## 1.0.0
- 24.11.2026: Erste Fassung. Komplette Übernahme von Fehmarn.ods v8.12 (61 Blätter, 41.892 Formeln, 54 Auswahllisten, 48 Bilder). Ansichten Start, Aufgaben (Status, Neu, Erledigt-Haken), Kosten (Kostenplan), Wissen (Suche, Neu), Finanzen, Kontakte, Entscheidungen, Berichte, alle Blätter als Tabelle mit Bearbeiten. Offline-fähig, Sync über Cloudflare Worker, Excel-Export.
