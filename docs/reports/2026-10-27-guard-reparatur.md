# Archi Guard – Reparatur und modellunabhängige Nachkorrektur

Stand: 27.10.2026, Europe/Berlin. Die beschriebene modulare Reparatur einschließlich Offline-Prüfungen, unabhängigen Reviews, gesicherter Übertragung und einem begrenzten nativen Funktionsauftrag ist abgeschlossen. Freie semantische Richtigkeit und allgemeine Qualitätsverbesserung bleiben ungeprüft.

## Maßgeblicher Auftrag

Im Chat 00000000-0000-4000-8000-000000000003 wurde „du sollst achi guard reparieren und fertig stellen“ beauftragt und die begrenzte Nachkorrekturempfehlung ausdrücklich bestätigt. Der aktuelle Chat 00000000-0000-4000-8000-000000000004 verlangt die Fortsetzung anhand dieses jüngsten Verlaufs, weil die alte Übergabe unzutreffend war. Neueste verbindliche Präzisierungen: modellunabhängige Funktion und modularer Aufbau.

Die Einschränkung auf Qwen/Ollama ist aufgehoben. Der Guard verwendet für eine Nachkorrektur dieselbe ausgewählte Provider-/Modell-/Variantenreferenz wie der ursprüngliche Auftrag. Er wählt kein anderes Modell. Mehrere Provider-/Modellreferenzen werden offline geprüft; dies ist keine native Abnahme aller Provider.

## Modulgrenzen

| Modul | Aufgabe |
|---|---|
| V1.1 und V2 | Deterministische Originalquellen-, Zitat-, Pflichtbeleg- und Literalprüfung |
| archi_bridge_v2.py | Befundformat und Transport zu denselben Prüfern |
| global-plugin/correction.mjs | Feste Korrekturgründe, providerneutraler Referenzvergleich, Budget und dauerhafte Aktivbindung |
| global-plugin/runtime.mjs | OpenCode-Ereignisse, echte Reads, Antwort-/Auftragsbindung und Hostanforderungen |
| Sync-GlobalPlugin.ps1 | Sieben feste Dateien, externe Sicherung, Hashprüfung und Rückweg |

Es gibt keine Modellfamilien- oder Provider-Fallunterscheidung im Prüfkern oder Budgetmodul. Ein neues Modell erfordert keine Kernänderung.

## Konkrete Änderungen

- Zusätzliche oder falsch geordnete alleinstehende Prüfmarker werden abgelehnt. Markerwörter innerhalb gültiger JSON-Daten bleiben Daten. Kein Teilergebnis bei einem späteren Formatfehler.
- Strukturabdeckung benennt geprüfte deklarierte Befunde und ungeprüften Freitext. Aussagegesamtzahl bleibt unbekannt. `prompt_id_sha256` präzisiert den Benutzer-ID-Hash; der bisherige Alias bleibt erhalten.
- Werkzeuglimits gehören zu den jeweiligen Antwort-IDs. Verspätete alte Abschlüsse behalten ihren Hinweis; spätere saubere Antworten erben kein altes Limit.
- Nachkorrektur ausschließlich bei konkreten negativen Prüfcodes. Fehlende/leere Blöcke, ungeprüfte Semantik und Infrastrukturfehler starten keine Korrektur. Maximal zwei Guard-Anforderungen pro ursprünglichem Auftrag.
- Reservierung erfolgt unter exklusiver Sperre, wird synchron gespeichert und zurückgelesen. Duplikate und unklare Admission setzen das Budget nicht zurück. Beschädigte/umgeleitete Zustände blockieren.
- Der Host prüft das tatsächliche Modell bei `model.request`, einschließlich Haupt- und Nebenanfragen. Neue Benutzeraufträge und Modellwechsel dürfen eine alte Guard-Anforderung nicht übernehmen.
- Echte Reload-Fälle ohne künstlich erneut zugestellten Prompt-Hook werden berücksichtigt. Verlorene Reads werden nie als beobachtet rekonstruiert.
- Aktivbindung wird zusätzlich als Schema und Hashes unabhängig vom Chatkontext gespeichert. Damit kann Host-Compaction plus Reload den Schutz nicht durch Entfernen typisierter Benutzer-/Synthetic-Nachrichten umgehen.
- Eine nie zugestellte Korrektur darf einen bestätigten neuen Benutzerauftrag nicht dauerhaft sperren. Wird sie später doch zugestellt, wird sie erneut erkannt und vor Inferenz abgelehnt.

## Prüfbelege

Modellunabhängiges Budget samt Aktivbindung: **23/23 Tests erfolgreich**. Vier neue Persistenzfälle zunächst RED; danach GREEN. Zuvor belegte der Mehrproviderfall die feste Qwen-Beschränkung durch einen erwarteten Fehlschlag.

Runtime-Integration: **40/40 Tests erfolgreich**; zusammen mit den 23 Modultests **63 betroffene Offline-Tests**. Fälle: tatsächliches Anfragemodell, Nebenanfragen, neuere Benutzeraufträge, unklare Admission, verspätete Zustellung, Reload ohne Prompt-Hook, Outputlimit ohne terminales Idle sowie Compaction mit anschließendem Reload. Vollständiges aktuelles Integrationslog: `work/evidence/2026-10-27-runtime-persistent-fence-integration.log`.

Sieben-Dateien-Synchronisation und Wiederherstellung am temporären Ziel erfolgreich: Original bytegleich wiederhergestellt, neu hinzugefügte Dateien entfernt. Node-Syntaxprüfungen erfolgreich. Unabhängige Reviews fanden die beschriebenen Runtime-Lücken vor der Übertragung; alle materiellen Befunde müssen vor Freigabe geprüft behoben sein.

Belege unter `work/evidence/2026-10-27-*`. RED-Zusammenfassungen sind als Zusammenfassung beobachteter Toolausgaben gekennzeichnet; Tests wurden nicht nur zur Berichtserstellung wiederholt. Gespeicherte Konsolenlogs können normalisierte nachgestellte Leerzeichen enthalten. Frühere Python-/Bridge-Nachweise aus dem Vorgänger wurden ohne Codeänderung an diesen Prüfern nicht erneut ausgeführt.

## Aktive Übertragung und native Abnahme

Sieben Dateien nach erneutem unverändertem Ausgangsabgleich mit dem vorhandenen Skript gesichert, kopiert und geprüft. Backup: C:\Users\USER\.local\state\archi-guard\backups\20261027-130323-f01a583e. Quellcommit: 284bd5e217a03c48670569861e5ecb22fc2eba99. Maschinenlesbarer Beleg: work/evidence/2026-10-27-correction-deployment.json. Ein laufender Host gilt durch Dateikopien nicht als neu geladen.

Für genau einen bereits autorisierten nativen Funktionsauftrag wird ein eigener temporärer Loopback-Host verwendet und danach beendet. Die normale Standalone-CLI beendet ihren Listener beim ersten erfolgreichen Ausführungsereignis und ist deshalb allein kein Nachweis nachgelagerter Guard-Korrekturen. Ein ausdrücklicher Kontrollbefund mit absichtlich falschem Literal prüft den Auslöser; dies ist kein spontan beobachteter Halluzinationsfehler.

Erste native Vorprüfung: `PREFLIGHT_BLOCKED_NO_INFERENCE` bei der Agentenabfrage, HTTP-Fehler vor dem ursprünglichen Prompt. **0 Modellaufträge**, kein Einmalmarker; eigener Testhost bestätigt beendet, globale Konfiguration und Fixture unverändert. Beleg: work/native-correction-test/run-20261027-130802-c8927e02/result.json. Schnittstellen-/Configklärung erfolgte ohne Inferenz; daraus wurde keine native Funktionsabnahme abgeleitet.

Die Vorprüfung wurde gezielt berichtigt: Agent aus der öffentlichen Liste auswählen; tatsächliche Permission-Entscheidungen statt einer angenommenen Array-Endposition prüfen. Eine von uns zusätzlich gesetzte Fixture-Policy `integration.use:* deny` blockierte laut `plugin/module.ts` auch lokale Plugins. Nur diese Test-Policy wurde entfernt. Globale Nutzerpolicies blieben unverändert. Vier abgebrochene Vorprüfungen einschließlich der Diagnosephase erzeugten insgesamt keinen Benutzerprompt und keinen Einmalmarker. Alle eigenen Hosts wurden beendet; diese lokalen Belege bleiben erhalten.

**Nativer Funktionsnachweis: PASS_NATIVE_CORRECTION.** Belegordner: `work/native-correction-test/run-20261027-132414-267a14f3`.

- Ein ursprünglicher Benutzerprompt; genau ein abgeschlossener Read auf die eigene Fixture, keine weiteren Werkzeuge.
- Erster Befund: `FAKTREGEL_NICHT_BESTAETIGT`, exaktes Zitat und tatsächlich beobachteter Read.
- Genau eine automatische Nachkorrektur mit unveränderter Modellreferenz; persistentes Budget 1 von 2.
- Zweiter Audit: `BELEGKETTE_FORMAL_VOLLSTAENDIG`, Literalregel bestätigt, `READ_PFAD_UND_ZITAT_BEOBACHTET`; Korrekturstatus `NICHT_ERFORDERLICH`.
- Beide Audits gehören zur gleichen ursprünglichen Benutzer-Nachrichten-ID. Finale Antwort und letzter Audit stimmen im Texthash überein.
- Eigener Testhost PID 99376 bestätigt beendet; keine aktive Fence-Datei mehr. Globalconfig und Fixture unverändert. Das geladene lokale Testmodell wurde nicht entladen.

Der gespeicherte Ergebnisstatus, gefilterte Kontext, zwei Auditzeilen und Budgethashzustand wurden gelesen. Der Shell-Exitcode allein war kein Nachweis. Der Test verwendet das aktuell konfigurierte lokale Qwen-Modell; die Produktlogik enthält diese Beschränkung nicht. Kein weiterer Modellvergleich und keine Testwiederholung nach gestarteter Admission.

Code-Checkpoints: `729a1ac` (modellunabhängiges Budget), `eea4f92` (dauerhafte Aktivbindung), `284bd5e` (OpenCode-Adapter). Sieben aktive Dateien sind weiterhin bytegleich zum übertragenen Quellstand. `HANDOFF_CURRENT.md` und der fortlaufende Arbeitsstand enthalten den aktualisierten Abschluss.

## Grenzen

Die erste Antwort ist vor der Nachprüfung bereits sichtbar. Freie Schlussfolgerungen bleiben semantisch ungeprüft; `freigabe=NEIN`. Maximal drei deklarierte Befunde sind keine vollständige Aussageabdeckung. Ein Guard-Versuch kann mehrere interne Modell-/Werkzeugschritte umfassen. Allgemeine Halluzinationsreduktion, kontrolliertes Fehlerlernen und native Funktion aller Provider sind nicht nachgewiesen.

Ein nicht eindeutig zuordenbarer aktiver Auftrag blockiert konservativ. Eine vorhandene Dateisperre wird nicht automatisch entfernt. Es wird kein Host, Modell oder Provider umgeschaltet, kein Modell entladen und keine fremde Datei bereinigt.

Insbesondere kann eine Komprimierung die ursprüngliche Benutzerzuordnung aus dem typisierten Hostkontext entfernen. Der Guard stoppt die Korrektur dann auch bei unverändertem Modell; der Nutzer kann mit einem neuen Auftrag fortfahren. Sichere Ablehnung ist hier belegt, eine allgemeine Fortsetzung über beliebige Kontextkomprimierungen ist nicht abgenommen.

## Quellen

Gepinnter OpenCode-Stand: `68bc26b7da1990ce10ffecfbc1e09eb13aa5d824` (2.1.4).

- [Pluginvertrag](https://github.com/anomalyco/opencode/blob/68bc26b7da1990ce10ffecfbc1e09eb13aa5d824/packages/plugin/src/promise/session.ts)
- [Synthetic-Admission](https://github.com/anomalyco/opencode/blob/68bc26b7da1990ce10ffecfbc1e09eb13aa5d824/packages/core/src/session/session.ts)
- [Tatsächliche Modellanfrage](https://github.com/anomalyco/opencode/blob/68bc26b7da1990ce10ffecfbc1e09eb13aa5d824/packages/core/src/session/model-request.ts)
- [Promise-Hookadapter](https://github.com/anomalyco/opencode/blob/68bc26b7da1990ce10ffecfbc1e09eb13aa5d824/packages/plugin/src/promise/adapter.ts)
- [Hookausführung](https://github.com/anomalyco/opencode/blob/68bc26b7da1990ce10ffecfbc1e09eb13aa5d824/packages/core/src/plugin/hooks.ts)
- [Kontext nach Compaction](https://github.com/anomalyco/opencode/blob/68bc26b7da1990ce10ffecfbc1e09eb13aa5d824/packages/core/src/session/history.ts)
