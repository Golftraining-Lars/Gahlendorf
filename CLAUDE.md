# Gahlendorf (App-Repo, ÖFFENTLICH)
- Zuerst README.md komplett lesen (Architektur, Operationen, Standardregeln).
- Hier liegen NIE echte Daten (keine workbook.json, keine Bilder, keine Auszüge in Tests oder Commits). Daten: privates Repo Golftraining-Lars/Gahlendorf-Daten (dort CLAUDE.md lesen).
- Jede Code-Änderung: tests.js anpassen, `npm install && node tests.js` muss grün sein; README (Operationen, Changelog) und Versionsnummer in core.js/index.html/sw.js gleich halten.
- Datenänderungen nur mit `node tools/wbcli.js …` gegen die workbook.json aus dem Daten-Repo.
