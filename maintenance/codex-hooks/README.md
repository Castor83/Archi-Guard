# Übergabe VOR Komprimierung

Nutzerpräzisierung vom 26.10.2026, vorrangig gegenüber älteren Nach-Komprimierungsregeln. Bestehenden synchronen `PreCompact` verwenden, keine zusätzlichen Modell-/Agenten-/codex-exec-Läufe für Berichte.

## Geprüfte Änderung

Die vorhandene globale Hookregistrierung war bereits vorhanden und standardmäßig synchron. Das bisherige Sicherungsskript gab bei Erfolg `{}` zurück, wodurch Komprimierung weiterlief. Es wird gezielt ergänzt:

1. Vorhandenen `work/handoff/<origin>-working.md` und einen bereits vorhandenen Workspace-Statuszeiger zum tatsächlichen Repository wiederverwenden. Nur die festen Dateien derselben Ursprungs-ID lesen; keine beliebigen statusseitigen Dateinamen.
2. Lokalen Sitzungsverlauf als unveränderten zum Öffnungszeitpunkt vorhandenen Präfix sichern; spätere Anhänge sind ausdrücklich nicht Teil dieses Snapshots. Arbeitsstand, optional vorhandenen vollständigen Bericht und Status mitsichern. Dateien und Manifest fsyncen, gesicherte Dateien zurücklesen und Hash/Größe prüfen.
3. Bei identischem Turn, unverändertem Checkpoint/Status und bestätigten gesicherten Dateien vorhandenen Snapshot wiederverwenden. Änderungen oder beschädigte Sicherungen erzeugen einen neuen überprüften Snapshot, keine Chat-Duplikate.
4. Nach bestätigter Sicherung JSON `continue:false` samt `stopReason` ausgeben. Auch bei fehlgeschlagener Sicherung vorsorglich stoppen, aber ausdrücklich **NICHT bestätigt** melden. Ein fehlerhafter Read-back darf kein PASS-Manifest hinterlassen.
5. `resume.md`, vorhandene Nachfolge-ID und lokale Handoff-Dateien für sichere Fortsetzung bereitstellen. Keine Netzwerk-/Modell-/Chat-Aufrufe aus dem Skript. Den alten Chat niemals von diesem Skript aus archivieren.

Der vorhandene `SessionStart(source=compact)`-Handler ist nur noch ein Notfall-Stopp mit `continue:false`. Er erzeugt keinen `additionalContext`, der einen weiteren Modelllauf zur Rekonstruktion des Berichts fordert.

## Installation und Vertrauen

Kanonische Skriptkopien liegen in diesem Ordner, aktive Dateien unter `C:\Users\USER\.codex\hooks`. Beide aktiven Dateien werden per SHA256 abgeglichen. Bestehende `hooks.json`-Befehle, Matcher, Zeitlimits und `config.toml`-Trustdefinitionen wurden **nicht geändert**. Es wurde kein Trust-Hash erzeugt/ersetzt und kein Trust-Bypass verwendet. Andere Guardrails-/Stop-/Tool-Hooks bleiben außerhalb dieses Auftrags.

Sicherung vor Änderung: Pfad in `C:\Users\USER\.local\state\archi-guard\last-precompact-backup.txt`. Dort liegen ursprüngliche `hooks.json`, `config.toml`, `AGENTS.md` und beide Skripte. Globale `AGENTS.md` wurde um die ausdrücklich vorrangige Nutzerpräzisierung ergänzt, bestehender Inhalt erhalten. Keine automatische Rücknahme bei Erfolg.

## Technische Grenzen

Die Skripte haben keinen zuverlässig eingerichteten Zugriff auf die Chat-Managementtools des laufenden Desktop-Agenten. Deshalb ist automatische Chaterstellung/Archivierung **aus dem synchronen Hook nicht implementiert**. Kein undokumentiertes Pipe-Protokoll, keine zusätzliche Codex-Instanz und kein Modellaufruf werden als Ersatz gestartet. Ein bereits laufender Agent kann bei ausdrücklich beauftragter Übergabe die vorhandenen Desktop-Werkzeuge für genau einen Nachfolger nutzen; das ist ein getrennter, statusgeführter Vorgang.

Ohne diesen verfügbaren Agenten: vom Hook ausgegebenen Snapshotordner öffnen, vorhandene Nachfolge-ID verwenden oder genau einen lokalen Chat manuell anlegen, `handoff.md` beziehungsweise `working.md` und `resume.md` übergeben. Nach bestätigter Übernahme den alten Chat archivieren. Bei unklarem Erstellen zuerst die Chatliste prüfen. Kein automatischer Retry-/Modell-Loop.

## Verifikation

12 gezielte Offline-Vertragstests, darunter Fehler-/Wiederholungs-/Fallbackfälle, mit dem tatsächlich konfigurierten Interpreter `C:\Users\USER\.venv\Scripts\python.exe` (3.12.10) bestanden. Kein echter Host-Compact-Probelauf und keine Inferenz ausgelöst. Eine Skriptprüfung belegt den JSON-/Sicherungsvertrag, nicht einen bereits beobachteten echten Host-Trigger oder eine vollständig automatische Chatmigration.

```powershell
& 'C:\Users\USER\.venv\Scripts\python.exe' -B -m unittest discover -s tests -p test_precompact_handoff.py -q
```

Offizielle Grundlage: [Codex Hooks](https://learn.chatgpt.com/docs/hooks), insbesondere PreCompact, gemeinsame Ausgabefelder, synchroner Standard und Hook-Vertrauen. Laut Dokumentation stoppt ein passender synchroner PreCompact mit `continue:false` vor der Komprimierung. Bei Prozessabsturz, ausbleibendem/unvertrautem Hook oder Hoständerungen darf daraus keine absolute Verhinderungsgarantie abgeleitet werden.
