# CodeRabbit-Befunde: gezielte Reparatur

Stand: 30.10.2026. Ausgang: Review 5708897767 auf öffentlichem Commit ff2d16c, lokale Quelle 7935d60.

Alle sechs Befunde korrigiert: V1 prüft den ursprünglichen Ausgabepfad vor Symlinkauflösung; die historische Fallback-Quellkopie liest begrenzte UTF-8-Bytes; die Snapshot-Quellkopie veröffentlicht ihr endgültiges Manifest erst nach dem Read-back; Git Bash bestimmt den CLI-Pfad aus LOCALAPPDATA; die Integrationssuite übernimmt vorhandene Python-Defaults einschließlich ARCHI_GUARD_PYTHON; die Arbeitsanweisung trennt historischen v0.5-Stand von aktuellem v0.6.

Fünf neue verhaltensbezogene Offline-Regressionen scheiterten zunächst an diesen Fehlern und bestanden nach der Korrektur. Geprüft wurden reale temporäre Symlinks, simulierte Unterbrechung vor Read-back, UTF-8-Eingabe unter cp1252, ein harmloser temporärer CLI-Ersatz mit Leerzeichen im Pfad sowie die anonymisierte Integrationssuite mit ausdrücklich vorgegebenem Python.

Ergebnis: unittest discover 46/46; Node Budget-/Runtime-Suiten 78/78; V1 42/42, V2 21/21 und Bridge 14/14 Selbsttests. Summe 201 bestandene Offline-Tests, keine übersprungenen Node-Tests. Unabhängiger Diff-Review ohne weitere konkrete Befunde. Keine Modelle, echten Cline-/OpenCode-Tasks oder installierten Hooks ausgeführt oder geändert.

Cline in VS Code ist das erklärte Integrationsziel. Der bestehende OpenCode-Adapter wird durch diese Fehlerkorrekturen nicht als Cline-Anbindung ausgegeben. Die getrennte Cline-Anbindung und ihr wirklicher Hostablauf sind noch offen. Vorhandene globale TheHive-Hooks bleiben erhalten.
