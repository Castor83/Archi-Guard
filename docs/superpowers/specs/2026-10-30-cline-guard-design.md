# Archi Guard in Cline/VS Code: konkreter Anschlussentwurf

Stand: 30.10.2026. Nutzerziel: Guard in VS Code mit Cline anbinden und die sechs Reviewfehler korrigieren. Die Reviewfehler sind im Quellcommit d95aa4f und öffentlichen PR-Commit 4918d3c korrigiert. Dieser Anschlussentwurf ist noch keine installierte Integration.

## Bestand und Entscheidung

Lokal ist Cline 4.1.26 installiert. Die vorhandenen globalen TheHive-Skripte UserPromptSubmit.ps1 und PostToolUse.ps1 liefern Wissens-/Prüfhinweise; sie sind keine unabhängige Guardprüfung. Sie bleiben unverändert. Der vorhandene Guard hat deterministische Python-Prüfer, eine stdin/stdout-Bridge, persistente Korrekturbudgets und einen OpenCode-Hostadapter.

Empfehlung: Cline-eigenes SDK-Plugin als kleiner zusätzlicher Hostadapter. Vorhandene Prüfer und Budgetmodule werden wiederverwendet. Kein eigener VS-Code-Editor, kein neues Modell, kein zusätzlicher MCP-Dienst und keine zweite Lernablage.

| Weg | Fähigkeiten | Pro | Contra |
|---|---|---|---|
| Cline-SDK-Plugin, empfohlen | Werkzeugergebnisse beobachten, Modellkontext ergänzen, Abschlusswerkzeug vor Ausführung prüfen und mit Fehlergrund zurückweisen | Native Schnittstelle; verwendet denselben Cline-Task und dasselbe gewählte Modell; vorhandener Prüfkern bleibt erhalten | Exakte Laufzeit-/Toolverträge und Fail-closed-Verhalten müssen für die installierte IDE-Version geprüft werden |
| Externe Cline-Dateihooks | Hinweise und Werkzeugereignisse über JSON verarbeiten | Vorhandene globale Hooks bereits genutzt | TaskComplete-Rückgabe ist kein verlässlicher Abschlussblocker; für die vollständige Guardwirkung allein ungeeignet |

## Kleinster eigener Anteil

Ein zusätzlicher Ordner `cline-plugin/` übersetzt ausschließlich den Cline-Hostvertrag in das vorhandene Bridgeformat `{text, reads}` und die bestehende Korrekturbudget-Schnittstelle. Die Registrierung, Lesezuordnung und Rückmeldung sind hostabhängig; dafür existiert im Guard noch kein Cline-Adapter.

1. Setup bindet den Adapter an den tatsächlichen Workspace aus dem Cline-Kontext. Keine Wurzel aus modellgesteuerten Toolparametern freigeben.
2. Bei neuem menschlichen Auftrag werden echte Task-/Benutzernachrichten- und Modellreferenzen gebunden. Fehlen stabile Referenzen, keine automatische Korrektur und keine Abnahme behaupten.
3. Erfolgreiche native Dateileseereignisse liefern Pfad und tatsächlich erhaltenen Text für das vorhandene Read-Ledger. Unbekannte oder abgeschnittene Ergebnisformen gelten nicht als Lesenachweis. Rohtexte bleiben begrenzt im Arbeitsspeicher, keine Chat-/Quellenkopien im Audit.
4. Vor einem als Abschluss markierten Werkzeug wird dessen tatsächlicher Antworttext durch die Python-Bridge geprüft. Die Befunde bleiben deterministisch; freie Schlussfolgerungen und Vollständigkeit aller Aussagen bleiben ungeprüft, freigabe=NEIN.
5. Konkrete negative Prüfcodes dürfen über die native Toolrückmeldung höchstens zwei Nachkorrekturen im gleichen gebundenen Auftrag und Modell anfordern. Keine eigene Inferenz, kein alternatives Modell und kein Zurücksetzen bei Reload. Fehlende/leere Befunde und Infrastrukturfehler erteilen keine Freigabe.
6. Bridgeprozess und Budgetprüfung erhalten ein eigenes Zeitlimit unter dem Cline-Hooklimit. Cline dokumentiert einen Hookfehler-Default, der Fehler ignorieren kann: Ohne belegte fail-closed Hostkonfiguration keine harte Abschlussgarantie behaupten und keine scheinbar wirksame Vollaktivierung durchführen.

## Umsetzung und Abnahme

- Erst die konkrete installierte IDE-Plugin-Discovery, Ereignisformen, Abschlusskennzeichnung, stabile Auftrags-/Modellreferenzen und Fehlerbehandlung anhand verfügbarer Primärquellen bzw. der lokalen Quellkopie binden. Die beobachteten SDK-Symbole allein belegen keinen geladenen Adapter.
- Kleine Offline-Vertragstests: echter temporärer Quellbeleg; falsches Zitat; fehlender Read; fremder Workspace/Task; neuer Nutzerauftrag; Modellwechsel; Doppelauslieferung; zwei Korrekturen und konservative dritte Ablehnung; Prozessfehler/Timeout und Reload. Existierende Bridge-/Budgettests wiederverwenden.
- Installationsskript kopiert nur die genau festgelegten Plugin-Dateien, sichert vorherige Dateien und liest Hashes zurück. Kein Überschreiben der globalen TheHive-Hooks, keine Änderung an Modell-/Providerkonfigurationen oder Hookvertrauen. Vor Hoständerungen muss die tatsächlich nötige Pluginfreigabe konkret feststehen.
- Der echte Cline-Ablauf ist eine eigene Hostabnahme: Nutzer bedient eine harmlose Aufgabe; keine neue Modellinferenz durch diesen Umsetzungsauftrag. Erst danach getrennt berichten: vorbereitet, offline geprüft, installiert und im Host beobachtet. Kein UI-Zugriff ohne die erforderliche vorherige Zeitfensterabstimmung.

## Quellen und Grenzen

- Offizielle Plugin-Dokumentation: https://docs.cline.bot/sdk/plugins und https://github.com/cline/cline/blob/main/sdk/examples/plugins/README.md — beforeTool kann skip/reason liefern; afterRun liefert keine Steuerrückgabe. Online-Schnittstellen können neuer sein als die lokale IDE-Version.
- Lokale Paketmetadaten: saoudrizwan.claude-dev 4.1.26, dist/extension.js; darin SDK-Lebenszyklusfunktionen beobachtet, kein funktionaler Hosttest.
- Vorhandene Fachnotiz: C:/TheHive/20_Wissen/Lokale-KI-Frontends.md, Cline-Hooks vom 28.10.2026. Die tatsächlichen globalen Skripte wurden erneut lesend geprüft.
- Die gezielte REA-Analyse der Plugin-Sandbox erreichte ihr 15-Sekunden-Providerlimit ohne fertiges Ergebnis. Daraus wird kein Funktionsnachweis abgeleitet.

Freigabepunkt: Den zusätzlichen Cline-SDK-Adapter nach diesem Umfang entwickeln. Aktivierung oder Modelltests werden damit nicht vorweggenommen.
