# Auditformat und explizite Nichtabnahme: Umsetzungsplan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Tasks are checked individually.

Goal: Formatierung an eigenständigen Audit-Markern robust behandeln und fehlende prüfbare Befunde eindeutig als NICHT_ABGENOMMEN ausweisen.

Architecture: Bestehende Python-Bridge und OpenCode-Adapter erweitern. Deterministische Prüfer, Quellen-/Pfadsperren, Modellbindung und das persistente Budget bleiben unverändert. Keine allgemeine semantische Freigabe und keine zusätzlichen Modellaufrufe für Statusmeldungen.

Tech Stack: vorhandenes Python unittest, Node node:test, PowerShell-Deployment; keine neuen Abhängigkeiten.

Spec: Nutzerfreigabe im Chat 00000000-0000-4000-8000-000000000005 vom27.10.2026 („dafür machen wir diese Tests“) für den zuvor beschriebenen begrenzten Reparaturumfang. Ausgangsbefund: work/live-test/2026-10-27-guard-auswertung.md im OpenCode-Arbeitsordner.

## Grenzen und Entscheidungen

- Ausschließlich eigene zugehörige Dateien ändern und committen; unversionierte Referenzquellen erhalten.
- Marker vollständig auf eigener Zeile; optional exakt gepaarte Markdown-Hüllen **, *, __, _, Backtick zulassen. Den JSON-Inhalt nicht umschreiben.
- Doppelte/verwaiste Marker, übergroße oder ungültige JSON-Daten, fremde Pfade und erfundene Belege weiter ablehnen.
- Eine leere Liste bleibt leer. Fehlende/ungeprüfte Befunde werden nicht erfunden und verbrauchen keine neue Korrekturreservierung.
- Ergebnisfeld abnahme: NICHT_ABGENOMMEN, wenn kein Befund geprüft wurde, Infrastruktur/Format fehlschlug oder ein deklarierter Befund negativ ausfiel. Nur bei formal bestandenen deklarierten Befunden NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT; freigabe bleibt NEIN.
- Bei fehlendem/leeren Block Korrekturstatus BEFUNDE_FEHLEN_UNGEPRUEFT anstelle NICHT_ERFORDERLICH; vorhandene Host-/Infrastruktur-/Budgetblockaden behalten Vorrang.
- Der neue Status erscheint im Audit, im bestehenden Konsolenprotokoll und im nächsten normalen Modellkontext. OpenCode2.1.4 besitzt im Server-Plugin keine UI-/Toast-API. synthetic(resume:false) ist kein passiver sichtbarer Hinweis, sondern neue spätere Modelleingabe; deshalb nicht zur Warnung verwenden. Direkte GUI-Anzeige wird ohne belegte Schnittstelle nicht behauptet.
- Globale Übertragung erst nach Prüfungen und geschlossener OpenCode-Instanz über das vorhandene Backup-/SHA-Verfahren. Keine laufende Instanz oder fremde Modelle beenden.

## Review-Fokus

- Fett/kursiv/Codehüllen verändern ausschließlich die Marker-Erkennung.
- Gemischte Markerformatierungen dürfen die Zahl der Marker nicht verschleiern.
- Ein formal gültiges [] darf keine Abnahme ergeben.
- Negative Literal-/Readbefunde bleiben negativ und erhalten bestehende Korrekturlimits.
- Fehlende Hostmethoden und Protokollfehler dürfen keine positive Abnahme erzeugen.

## Task1: Markerparser

Files: archi_bridge_v2.py; tests/test_bridge_plugin.py.

Interface: _parse_json_block(text) -> (records,coverage) unverändert; keine neuen Prüfer- oder JSON-Schemafelder.

- [x] Regressionstests: dieselbe vorhandene gültige Befundliste zwischen **, *, __, _, Backtick-Markern ergibt GEPRUEFT/1geprüfter Befund; zusätzliche verwaiste formatierte Marker bleiben FORMAT_FEHLER; inkonsistente Hüllen werden nicht akzeptiert; Markerwörter in JSON bleiben Daten.
- [x] Neue Tests einmal rot sehen; dann ausschließlich Marker-Erkennung erweitern.
- [x] tests/test_bridge_plugin.py ausführen; Änderungen prüfen und gezielt committen.

## Task2: Eindeutige Abdeckung

Files: global-plugin/runtime.mjs; tests/plugin-integration.test.mjs; README.md; docs/OPENCODE-LIVE-ARBEITSANWEISUNG.md.

Interface: Ergänzendes Auditfeld abnahme wie oben; vorhandene Befund- und Budgetformate bleiben bestehen. Korrekturstatus für fehlende/leere Befunde BEFUNDE_FEHLEN_UNGEPRUEFT.

- [x] Regressionstests für fehlenden Block, korrektes [], formatierte [], negativen Befund und gültigen Befund mit echter Read-Beobachtung zuerst rot sehen.
- [x] Abnahme aus tatsächlichem Bridge-Ergebnis berechnen und im bestehenden Audit/Kontext/Konsolenpfad ausgeben. Keine neue Modelldispatch- oder GUI-Schnittstelle erfinden.
- [x] Passende bestehende Erwartungen an den ehrlicheren Korrekturstatus aktualisieren; sicherstellen, dass null Dispatches/null neue Reservierungen entstehen.
- [x] node --test tests/correction.test.mjs tests/plugin-integration.test.mjs sowie Python-Bridge-Tests ausführen; Bridge-Selbsttest wegen Parseränderung ausführen. Keine historischen Modell-/V1-Testserien wiederholen.
- [x] Versionskennung auf global-v0.5 setzen und Dokumentation anpassen. Unabhängiger Code-/Anforderungsreview, dann nur eigene Dateien committen.

## Task3: Lokale Übertragung und Abschluss

- [x] Installationszustand und laufenden Host prüfen; falls OpenCode offen ist, keine gemischte Live-Übertragung. Geprüften Stand und genaue Übertragungsanweisung bereithalten.
- [x] Bei geschlossenem OpenCode vorhandenes scripts/Sync-GlobalPlugin.ps1 verwenden; sieben gesicherte/übertragene Dateien per SHA prüfen. Keine automatische neue Modellsitzung starten.
- [x] Arbeitsstand und Ergebnisbericht inkrementell aktualisieren. Offline-Abnahme, Übertragung und noch fehlenden nativen Hostnachweis getrennt berichten.
