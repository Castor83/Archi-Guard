# Globale Archi-Bridge-Integration

**Ziel und verbindliche Spezifikation:** Die vom Nutzer übergebene Projektübergabe vom 25.10.2026 verlangt die vorhandene Python-Prüfstrecke in normalen OpenCode-Build-/Plan-Durchläufen, einen gezielten Ende-zu-Ende-Test und lokale Git-Checkpoints. Kein neuer Agent, Prüfer oder Provider; keine Wiederholung der 42 V1-Selbsttests und alten Hook-Diagnosen.

**Entscheidung:** In OpenCode 2.1.4 auf `session.execution.succeeded` reagieren, die aktuelle Antwort über `ctx.session.context` lesen und die bestehende Bridge über begrenztes stdin/stdout-JSON ausführen. Der `context`-Hook fordert das vorhandene strukturierte Befundformat an. Echte `read`-Ergebnisse werden ausschließlich im Speicher gehalten und mit Quelle und Zitat verbunden. Das Ergebnis wird ohne Rohtexte lokal protokolliert. Kein zusätzlicher Modellaufruf und keine behauptete Korrekturfähigkeit.

**Abgewogen:** Nur `execute.after` erreicht die endgültige Antwort nicht; HTTP-Stream-Manipulation ist für die vorhandene deterministische Prüfung unnötig. Der öffentliche Abschluss-Event ist daher der passende Anschluss. Aktuelle Online-Dokumentation enthält gegenüber 2.1.4 zusätzliche APIs; maßgeblich ist Tag `v2.1.4`, Commit `68bc26b7da1990ce10ffecfbc1e09eb13aa5d824`.

**Grenzen:** V1 prüft Originalzeilen, V2 die formale Belegkette und Literalregeln. Freie Schlussfolgerungen bleiben ungeprüft, `freigabe=NEIN`. Fehlende/ungültige Blöcke sind keine erfolgreiche Inhaltsprüfung. Prüfung findet nach abgeschlossener Ausgabe statt; ein Beweis einer allgemeinen Qualitätssteigerung oder Korrekturschleife ist nicht Teil dieses Integrationsnachweises.

## Aufgaben

- [x] Bridge erweitern: `analyze_plugin(payload, roots)` und `--plugin-stdin`; bestehende beleg-audit-Schnittstelle erhalten. Neue Tests zuerst scheitern sehen, dann gezielt prüfen, zusätzlich ursprüngliche Bridge-Tests wegen Änderung der Bridge.
- [x] Plugin verbinden: vorhandenen Ledger nutzen, echte Toolausgaben begrenzen, Antworten pro aktuellem Prompt und Session zuordnen, Python ohne Shell mit Zeitlimit aufrufen, minimiertes JSONL schreiben. Sessionwurzel aus `session.get`, keine Erweiterung durch modellseitige Pfade. Gleichzeitige Sitzungen, doppelte Abschlussereignisse, Tool-only-Schritte und Fehlerfälle gezielt testen.
- [x] Synchronisationsskript: Dateien vorab validieren, Backup außerhalb des automatisch geladenen Pluginordners, gezielt übertragen und Hashes prüfen; Rückweg dokumentieren. Keine Modell-/Providerkonfiguration ändern.
- [x] Frischer Code-Review, begrenzte relevante Tests und genau ein normaler Qwen/OpenCode-2.1.4-Durchlauf mit gezielt falscher Literalbehauptung. Echte Ausgabe und Bridge-Ergebnis korrelieren. Kein Wiederholen des alten MORPH-Lesetests.
- [x] Nach verifizierten fachlichen Schritten eigene Dateien committen, Arbeitsübergabe aktualisieren und ursprünglichen `master` bei unverändertem Ausgangsstand lokal vorwärtsführen. Kein Push.

## Review-Fokus

Aktuelle statt ältere Antwort; parallele Prompts/Sessionwechsel; fehlendes oder abgeschnittenes Werkzeugresultat; Pythonfehler/Timeout; kein positives Audit bei leerem/ungültigem Markerblock. Quellinhalte dürfen keine Anweisungen für Prozessaufruf oder Protokollpfad liefern. Originale V1/V2-Pfad- und Geheimnissperren bleiben erhalten.

## Arbeitsorte und Autorisierung

Originalrepo: `C:\Users\USER\projects\archi-guard`, `master`, Ausgang `b713383` ohne Remote. Fremde unversionierte Dateien bleiben erhalten. Isolierter Arbeitsbaum: `C:\Users\USER\projects\archi-guard-global-bridge`, Branch `codex/global-bridge-integration`. Native Worktree-Erstellung gilt für das Chat-Arbeitsverzeichnis Archi, nicht dieses externe Repository; deshalb gezielter Git-Worktree dort. Umsetzung und gezielter Integrationstest sind durch die übergebene Fortsetzungsanweisung autorisiert; keine erneute Planfreigabe nötig.
