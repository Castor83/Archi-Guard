# Archi Guard – Aussageabdeckung und Zuordnungsfehler

> For agentic workers: Execute the bounded repairs in this session. Existing user order is to repair and finish Archi Guard; do not reopen model/editor selection or request the same implementation approval again.

Stand: 27.10.2026. Neuer ausdrücklicher Auftrag: „du sollst achi guard reparieren und fertig stellen“. Er nimmt die frühere Projektpause wieder auf. Die TheHive-Wartungsreparatur ist abgeschlossen; deren noch offene Lern-/Hookabnahmen sind keine Archi-Guard-Abnahme.

**Goal:** Die belegten Parser- und Turn-Zuordnungsfehler beheben und die Grenzen jeder Belegprüfung maschinenlesbar sowie im Modellkontext sichtbar machen.

**Architecture:** Bestehende Python-Bridge/V2/V1-Kette und globales Plugin beibehalten. Gemeinsamer Parser, keine zweite Befundschema-Implementation. Ausgabe ergänzt ausschließlich datenminimierte Strukturmetadaten. Keine freie semantische Freigabe. Zusätzliche Modellaufrufe ausschließlich als bestätigte begrenzte Nachkorrektur gemäß Task 4.

**Tech Stack:** vorhandenes Python >=3.10, Node.js, OpenCode 2.1.4; keine Zusatzabhängigkeit.
**Spec:** HANDOFF_CURRENT.md, vorhandene Prüfer-/Runtime-Verträge und aktueller Nutzerauftrag.

## Verbindliche Grenzen und Entscheidungen

- Nutzergrundsatz: modularer Aufbau und Modellunabhängigkeit. Deterministische Prüfer, Format-/Transportbrücke, providerneutrale Korrektur-/Budgetlogik und OpenCode-Hostadapter getrennt halten. Keine Modellfamilien-/Provider-Fallunterscheidung im Kern; weitere Modelle brauchen keine Kernänderung.
- Höchstens drei deklarierte Befunde, vorhandene Format-/Pfad-/Geheimnis-/Read-/AST-Sperren und freigabe=NEIN erhalten. Eine Ressourcengrenze ist keine Aussagevollständigkeit.
- Genau ein geordnetes Paar eigenständiger Markerzeilen; Markerwörter in JSON-Strings sind Daten. Keine globale Teilstringzählung.
- Strukturabdeckung: abdeckung enthält blockstatus (FEHLEND, LEER, GUELTIG, UNGUELTIG oder UNBEKANNT), deklarierte_befunde, gepruefte_befunde, freitext_zeichen, aussagen_gesamt=null, vollstaendigkeit=NICHT_NACHGEWIESEN. Keine Rohtexte, Pfade oder Zitate und keine semantische Prozentquote.
- Fehlerhafte letzte Datensätze oder zusätzliche kaputte Marker dürfen keine Teilfreigabe/Teilrows erzeugen.
- Werkzeuglimits nach Assistant-ID zuordnen. Verspätete alte Antworten dürfen ihren Nachweis behalten; spätere saubere Antworten dürfen kein altes Limit erben. Unzuordenbare Limits bleiben konservativ sichtbar.
- prompt_id_sha256 präzisiert die bestehende Benutzer-ID-Zuordnung. prompt_sha256 bleibt als Kompatibilitätsalias erhalten.
- Die Prüfung bleibt nachgelagert. Ein aktiver Korrekturlauf, serverübergreifender Kandidatenzähler, kontrolliertes Fehlerlernen und allgemeine Wirksamkeit sind weitere Projektteile; nicht aus den Teilreparaturen als fertig ableiten.
- Keine neue Inferenz, kein Modellwechsel, keine Hook-Aktivierung, keine alte Testreihe zum Selbstzweck. Passend betroffene Regressionen laufen wegen tatsächlicher Codeänderung.
- Primäres vorhandenes Repository nutzen; neue lokale Branch codex/archi-guard-repair. Ungetrackte Fremdbelege unverändert. Kein weiterer Worktree, kein Push.
- Nach geprüften Teilreparaturen gezielt committen; Arbeitsstand inkrementell fortführen. Aktives Plugin nur über den vorhandenen, in Task 4 auf sieben Dateien erweiterten Backup-/Hash-Transfer aktualisieren, wenn die lokalen Prüfungen bestehen. Kein laufender Host wird als neu geladen behauptet.

## Review Focus

Zusätzliche alleinstehende Marker; CRLF/Whitespace; Markerwörter als JSON-Daten; Formatfehler nach einem korrekten ersten Datensatz; verspäteter alter Abschluss bei neuerem Prompt. Diese Fälle gehören zu den gezielten Regressionen.

## Task 1 – Strikter Parser und ehrliche Strukturabdeckung

Files: archi_bridge_v2.py; tests/test_bridge_plugin.py.
Interface: _json_block(text) bleibt kompatibel und verwendet denselben erweiterten Parser wie analyze_plugin(payload, roots).
Output: bestehende drei Ergebnisfelder plus abdeckung wie oben; keine semantische Gesamtzahl behaupten.

- [x] Neue Regressionen für zusätzliche Marker, CRLF und Markerwörter sowie FEHLEND/LEER/GUELTIG/UNGUELTIG und ungeprüften Freitext schreiben.
- [x] Neue Regressionen gegen unveränderten Code scheitern sehen.
- [x] Gemeinsamen Parser und minimierte Metadaten implementieren. Prüferfehler bleiben vollständig ablehnend.
- [x] Neue Fälle und tatsächlich betroffene vorhandene Bridge-Regressionen prüfen; keine V1-/Hook-/Modelltestwiederholung.
- [x] Eigenen passenden geprüften Schritt samt Arbeitsstand committen.

## Task 2 – Runtime-Ausgabe und turngenaue Werkzeuglimits

Files: global-plugin/runtime.mjs; tests/plugin-integration.test.mjs.
Interface: runBridge prüft/säubert abdeckung und reicht nur den vereinbarten Metadatenvertrag weiter. auditSummary zeigt geprüfte deklarierte Befunde, ungeprüften Freitext und unbekannte Gesamtdeckung. Limitbeobachtungen gehören zu Assistant-IDs; Audit verwendet die IDs des zugehörigen Benutzerturns.

- [x] Regressionen für Limit aus früherem Turn und verspäteten alten Abschluss sowie Abdeckung/Datensparsamkeit schreiben; zunächst scheitern sehen.
- [x] Alte Session-Boolean-Speicherung durch begrenzte, turnzuordenbare Beobachtung ersetzen. Metadaten strikt validieren.
- [x] prompt_id_sha256 ergänzen und Kontextbezeichnung präzisieren; Alias erhalten.
- [x] Gezielte betroffene Runtime-Integration mit echten Python-Unterprozessen prüfen und unabhängig reviewen.
- [x] Eigenen passenden geprüften Schritt samt Arbeitsstand committen.

## Task 3 – Gesicherte Übertragung und aktueller Projektstand

Files: README.md; HANDOFF_CURRENT.md; docs/reports/2026-10-27-guard-reparatur.md; work/handoff/00000000-0000-4000-8000-000000000003-working.md.

- [x] Nutzer-Wiederaufnahme und tatsächlich erreichte Funktionen dokumentieren; alte Pause als Historie erhalten.
- [x] Vorhandene aktive sechs Dateien zunächst nur gegen Repository-/Ausgangshashes prüfen. Zwischenzeitliche Fremdänderungen erhalten.
- [x] Nur nach bestandenem Review vorhandenes Sync-GlobalPlugin.ps1 mit eigenem Backup verwenden; alle sechs Zielhashes prüfen.
- [x] Übertragene Bytes von tatsächlichem Host-Neuladen und noch offener Laufzeit-/Qualitätsabnahme unterscheiden.
- [x] Eigene Dokumentation/Belege gezielt committen; danach beim nächsten sachlich offenen Projektteil fortsetzen.

## Task 4 – Bestätigte begrenzte automatische Nachkorrektur

Nutzerentscheidung am 27.10.2026 im Vorgängerchat: Empfehlung mit höchstens zwei zusätzlichen Korrekturversuchen ausdrücklich bestätigt. Neueste Präzisierung im Chat 00000000-0000-4000-8000-000000000004: „das sollte alles modell unabhängig funtionieren“. Damit entfällt die frühere Einschränkung auf Qwen/Ollama. Die erste Antwort ist bereits sichtbar. Kein zusätzlicher Kritiker und kein vom Guard veranlasster Modell-/Providerwechsel; normale Prüfungen starten keine Inferenz.

Pinned API: packages/plugin/src/promise/session.ts und packages/schema/src/session-message.ts am Commit 68bc26b7da1990ce10ffecfbc1e09eb13aa5d824. ctx.session.synthetic({sessionID,id,text,description,metadata,delivery:'queue',resume:true}) ist der vorhandene Anschluss; kein erfundener Freigabe-Hook. Assistant.model und Session.model müssen dieselbe ausgewählte Referenz bezeichnen. Neuere menschliche Aufträge und Kind-Sessions erhalten keine automatische Nachkorrektur eines alten Auftrags.

Files: neues global-plugin/correction.mjs und tests/correction.test.mjs; Runtime/Integration; vorhandenes Sync-Skript auf sieben feste Dateien erweitern.

### Gemeinsame Schnittstellen

- correctionReasons(report): nur feste konkrete negative Codes FORMAT_FEHLER, BELEGKETTE_UNVOLLSTAENDIG, BELEGE_NICHT_EXAKT, FAKTREGEL_NICHT_BESTAETIGT, LESEBELEG_NICHT_BEOBACHTET. Erfolgreiche formale Kette, fehlender/leerer Prüfblock, SCHLUSS_UNGEPRUEFT und freigabe=NEIN lösen keine Korrektur aus. Infrastrukturfehler ebenfalls nicht.
- sameModelReference(a,b): valide identische providerID/id/variant-Referenzen unabhängig von Provider und Modellfamilie; kein automatisches Umschalten. Fehlende Angaben sperren die Nachkorrektur. Das SDK verwendet id; model ist kein Alias.
- readCorrectionBudget({directory,sessionID,promptID}): {status:'READY'|'STATE_BLOCKED', attempts:0..2|null}.
- readCorrectionFence({directory,sessionID,model?,promptID?}): CLEAR, ACTIVE mit taskHash/promptMatches/modelMatches oder STATE_BLOCKED. Dauerhafte Aktivbindung unabhängig vom Chatkontext.
- setCorrectionFence({directory,sessionID,promptID,model}) speichert die Aktivbindung vor Dispatch; clearCorrectionFence({directory,sessionID,taskHash}) beendet ausschließlich die passende Bindung. Zustand enthält nur Schema und Hashes. Compaction und Reload dürfen diese Sicherung nicht umgehen.
- reserveCorrection({directory,sessionID,promptID,answerID,answerHash,model}): {status:'RESERVED'|'DUPLICATE'|'EXHAUSTED'|'STATE_BLOCKED', attempts:0..2|null, syntheticID?:string}. Persistenter Schlüssel ist SHA256 aus ursprünglicher Session-/Benutzer-ID, nicht aus synthetischen Korrekturaufrufen.
- Vor Dispatch unter exklusiver Dateisperre reservieren und bytegeprüft dauerhaft speichern; maximal zwei Slots. Abschlussereignis-Duplikate erkennen, andere neue Assistant-Kandidaten dürfen denselben Text haben. Unklarer Dispatch wird nicht automatisch wiederholt/zurückgebucht.
- Zustand enthält nur Hashes, kleine Zähler und Schemaangaben. Keine Pfade, Benutzertexte, Quellzitate oder Antworten persistieren. Korrupten/gesperrten/umgeleiteten Zustand nicht als neues Budget behandeln. Kein automatisches Stale-Lock-Löschen.
- Jeder ursprüngliche Benutzerauftrag behält seinen Zähler bei Plugin-Neuladen. Das Budget steuert die vom Guard angeforderten Korrekturversuche; ein Modellversuch kann mehrere Tool-/Modellschritte umfassen.
- Runtime prüft nach einer Korrektur die neue letzte abgeschlossene Assistant-ID desselben Benutzerprompts erneut; unveränderte ID nicht erneut. Vorher beobachtete Reads bleiben nur für einen tatsächlich laufenden Korrekturpfad verfügbar und unter den vorhandenen Grenzen.
- Korrekturprompt enthält ausschließlich geprüfte Codes, Befundindizes und Hash-Zuordnung; keine aus Werkzeug-/Antworttext übernommenen Instruktionen. Keine zusätzlichen Rechte oder Dateiänderungsfreigabe. Nach Budgetende eindeutig ungelöst melden.
- Nach neuer Prüfung append-only Audit mit korrekter Zuordnung/Korrekturstatus. Neue Prompts dürfen verspätete alte Audits nicht verbrauchen.
- Reviewkorrektur vom 27.10.: Vorabchecks vor synthetic reichen nicht. Der Host reiht ohne Modell-/Prompt-CAS ein. Am tatsächlichen model.request muss ein aktiver Korrekturpfad auch Nebenanfragen gegen ursprünglichen Auftrag und festes Anfragemodell prüfen; Abweichungen blockieren vor Inferenz. Reload ohne erneuten menschlichen prompt-Hook muss berücksichtigt werden. Keine Modellumschaltung als Ersatz.
- Standardzustandsordner: bestehender lokaler Archi-Guard-Statusbereich, in Tests ausschließlich temporär. Runtime-Testhosts ohne Modell-/Synthetic-Vertrag bleiben auditfähig und starten keinen Korrekturlauf.

### Prüfung und Freigabe

- [x] Persistenz-/Lock-/Duplikat-/Reload-/Modelbindungs-Regressionsfälle zuerst RED, dann implementieren; keine Modellinferenz.
- [x] Runtime-Regressionen: formaler Erfolg löst nichts aus; zwei fehlerhafte Folgeantworten reservieren maximal zwei Dispatches; dritte Fehlantwort meldet erschöpft; Duplikate/neuere Prompts/fremde Modelle/Infrafehler/Kinder lösen keinen zusätzlichen Dispatch aus; erfolgreiche Folgeprüfung endet.
- [x] Unabhängiger Review, gezielte betroffene Prüfungen und lokaler Commit.
- [x] Bestehendes Sync-Skript mit sieben festen Dateien/Backup/Hashgleichheit nutzen; keine parallel fremd geänderten Dateien überschreiben.
- [x] Ein einzelner begrenzter nativer Funktionsauftrag für die neue Funktion ist durch die bestätigte automatische Nachkorrektur autorisiert: aktuell konfiguriertes lokales Modell, ursprünglicher Kandidat plus höchstens zwei Guard-Korrekturen, keine Vergleichsserie, keine Modelldownloads/-wechsel/Entladungen. Falls der Hostvertrag oder sichere Modellbindung nicht gegeben ist, keinen Lauf starten und keine native Abnahme behaupten.
