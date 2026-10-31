# Archi Guard: Markerformat und ehrliche Abnahme

Stand: 27.10.2026, Europe/Berlin. Status: Reparatur offline geprüft und global übertragen. Im echten GPT-OSS-Lauf sind global-v0.5 und die Nichtabnahme eines leeren Blocks nachgewiesen; der fachliche Quellenauftrag wurde nicht erfüllt.

## Auftrag und Anlass

Der Nutzer autorisierte im OpenCode-Praxistest die Reparatur der beobachteten Format-/Abdeckungslücke mit „dafür machen wir diese Tests“. Ursprungs-Chat: 00000000-0000-4000-8000-000000000005. Seine ausdrücklich gewählte Modellreferenz bleibt GPT-OSS; keine Modellumstellung durch diese Arbeit.

Die reale OpenCode-Antwort suchte durchgehend nach THIS_HIVE statt dem beauftragten THEHIVE-Dateinamen und behauptete einen fehlenden Import. Tatsächlich stehen die eingehenden Quellen-/Evidenzfelder bereits im kanonischen TheHive-DATA. Der zugehörige global-v0.4-Audit vom 27.10.2026, 14:44:39 Uhr Berlin, ist anhand der Sitzung, der ursprünglichen Benutzernachrichten-ID und des Antworttexts exakt zugeordnet: fehlender erkannter Block, null geprüfte Aussagen, null Korrekturen. Die Antwort enthielt fett formatierte Marker und eine leere JSON-Liste.

Ausführliche Ausgangsauswertung mit Hashes und Store-Zeilen: C:\Users\USER\Documents\ChatGPT\OpenCode\work\live-test\2026-10-27-guard-auswertung.md . Dieser Bericht ersetzt keine erneute Übernahme. Der TheHive-Store wurde in dieser Reparatur nicht beschrieben.

## Umsetzung

- archi_bridge_v2.py erkennt eigenständige Markerzeilen mit exakt gepaarten Markdown-Hüllen **,*,__,_,Backtick und äußerem Whitespace. JSON-Inhalt, Schema-/Größenregeln, Pfadsperren und Originalbelegprüfung bleiben unverändert. Zusätzliche/verwaiste oder fehlerhaft umhüllte Marker werden abgelehnt.
- Runtime global-v0.5 ergänzt abnahme. Fehlende, leere, negative oder wegen Infrastruktur ungeprüfte Befunde ergeben NICHT_ABGENOMMEN. Nur positiv formal geprüfte deklarierte Befunde können NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT ergeben; semantische freigabe bleibt NEIN.
- Fehlender/leerer Befundblock erhält BEFUNDE_FEHLEN_UNGEPRUEFT statt NICHT_ERFORDERLICH, ohne neue Korrekturreservierung oder Anforderung. Vorhandene Host-, Budget- und Sicherheitsgates bleiben maßgeblich. Die endgültige Abnahme berücksichtigt auch einen späteren Ausfall der Korrekturinfrastruktur. Bewusste Deaktivierung und normale Auftrags-/Modellgates werden nicht mit Infrastrukturfehlern gleichgesetzt; bereits tatsächlich geprüfte Befundzeilen bleiben erhalten.
- Audit, Konsolenprotokoll und nächster normaler Modellkontext enthalten den eindeutigen Abnahmestatus. Kein neuer Modellaufruf für Statusmeldungen.
- Der ursprüngliche GPT-OSS-Fall ist als integrierte Regression mit falschem Dateinamen im Freitext, fettem[] und echtem Read nachgebildet. Ergebnis LEER/NICHT_ABGENOMMEN/0geprüfte Befunde; keine semantische Erkennung der falschen Freitextbehauptung behauptet.

## Prüfbelege

- Parser: zuerst 119 erwartete rote Subtests, danach 29 Python-Plugin-Tests grün. Commit c9308b23519072d71cb41849f08e8727a8b966d4.
- Runtime: zuerst 65 Tests mit 9 erwarteten Fehlern, erster Grünstand 66/66. Commit 753aecb7a94d52c419b9efadcab357e73ec762ba.
- Review-Fix: drei neue Regressionen zunächst rot, danach vollständiger Node-Lauf 69/69 grün (23 Budget-/Modultests und 46 Integrationstests). Commit 5361478c8574de801c64de5d2604b06db0ed8788.
- Bridge-Selbsttest nach Parseränderung: 14/14 grün. Nach der Übertragung zusätzlich 29/29 Python-Plugin-Tests gegen den ausdrücklich aufgelösten installierten Bridge-Pfad grün. Keine Wiederholung der historischen V1-/Modell-/Native-Harness-Serien.
- Unabhängiger Parserreview ohne Befund. Der Gesamtreview fand den späten Infrastrukturstatus; nach dessen Reparatur keine offenen wesentlichen Review-Befunde. git diff --check sauber.
- Testprotokolle unter work/evidence/: 2026-10-27-audit-coverage-{red,green}.log, 2026-10-27-audit-review-{red,green}.log, 2026-10-27-audit-format-bridge-selftest.log und 2026-10-27-installed-bridge-tests.log. Die grünen maßgeblichen Suiten umfassen 69 Node-, 29 Python-Plugin- und 14 Bridge-Selbsttests.
- Die versionierten roten Protokolle enthalten normalisierte, zuvor nur aus Leerzeichen bestehende Blankzeilen. Unveränderte Rohbytes bleiben unter work/backups/20261027-145837-audit-coverage/raw-test-output erhalten; Vorher-/Nachher-Hashes stehen in work/evidence/2026-10-27-audit-log-normalization.json. Keine Prüfzeile oder Assertion wurde verändert.
- Sechs ursprüngliche betroffene Quellen unter work/backups/20261027-145837-audit-coverage gesichert und per SHA256 geprüft. Plancommit 0160f11b7497ca808c96905b0cad1220b461af54.

## Grenzen

Ein formal gültiges[] enthält keine Aussage. Formatrobustheit ersetzt deshalb keine inhaltliche Prüfung. Unstrukturierter Freitext und allgemeine Vollständigkeit bleiben ungeprüft, auch bei positiv geprüften einzelnen Befunden.

Der Server-Plugin-Kontext von OpenCode 2.1.4 besitzt keine passive Toast-/UI-/Assistant-Append-API. synthetic(resume:false) reiht spätere Modelleingabe ein und wurde dafür nicht benutzt. Eine sofortige passive Desktop-Warnung bleibt innerhalb dieses API-Umfangs offen. Taggenaue Quellen: packages/plugin/src/promise/plugin.ts:26-55 und promise/session.ts:154-174 im [OpenCode-Tag v2.1.4](https://github.com/anomalyco/opencode/tree/v2.1.4/packages/plugin/src/promise).

Eine allgemeine native Abnahme ist damit nicht behauptet. Der nachfolgend getrennt ausgewertete Nutzerlauf bestätigt Hostbeobachtung und Leererblock-Verhalten, enthält aber keinen fachlich geprüften Befund. Codex startete dafür keine Modellinferenz. Der frühere Qwen-Header-Timeout und die Reasoning-Menüanzeige bleiben getrennte Fragen; sie wurden nicht durch diese Format-/Statusänderung behoben.

## Übertragung und nächster Schritt

Der Nutzer schloss OpenCode für die Übertragung. Sein verwaister Backend-PID 178116 wurde an den exakten bekannten Programm-/Parentpfad gebunden und beendet; danach null OpenCode-Prozesse. Dieser Stillstand wurde unmittelbar vor der Übertragung erneut geprüft. Ollama und Modelle blieben unberührt.

Um 15:12:25 Uhr Berlin übertrug das vorhandene scripts/Sync-GlobalPlugin.ps1 den fachlichen Stand 5361478 nach C:\Users\USER\.config\opencode\plugins\archi-guard. Sieben von sieben Dateien wurden im Skript und anschließend unabhängig per SHA256 gegen die Quellen geprüft. Installierte Runtime enthält global-v0.5. Rücksicherung: C:\Users\USER\.local\state\archi-guard\backups\20261027-151225-699edb80. Maschinenbeleg: work/evidence/2026-10-27-audit-format-deployment.json .

Genau nächster Schritt: OpenCode neu öffnen und den vorhandenen echten Quellenauftrag mit der beibehaltenen GPT-OSS-Modellwahl lesend fortsetzen; anschließend den neuen global-v0.5-Audit der konkreten Antwort zuordnen. Kein TheHive-Doppelimport und keine zusätzliche Vergleichsserie.

## Nachtrag: echter GPT-OSS-Lauf um 15:22:47 Uhr Berlin

Der Nutzer führte den vorgeschlagenen Quellenauftrag aus und übergab die sichtbare Antwort. Sitzung, ursprüngliche Benutzernachrichten-ID und sichtbarer Antworttext stimmen per SHA256 exakt mit dem Audit in C:\Users\USER\.local\state\archi-guard\audits.jsonl, Zeile 18, überein. Antwort-SHA256: 52e3a99a9da5900d690360d14eae33b7600facd1063bbb571bc22675151326a2. Der sichtbare Antworttext wurde unverändert gehasht, ohne Roh-Reasoningdaten in den Beleg zu übernehmen.

| Kriterium | Beobachtung | Beleg | Bewertung |
|---|---|---|---|
| Guard im echten Host | global-v0.5 im Audit und in erfolgreichen Read-Metadaten | Audit/Read-Provenienz | PASS |
| Leeren Block ehrlich behandeln | LEER, NICHT_ABGENOMMEN, null geprüfte Befunde | zugeordneter Audit | PASS |
| Keine neue Korrekturschleife für fehlende Befunde | BEFUNDE_FEHLEN_UNGEPRUEFT, null Versuche | zugeordneter Audit | PASS |
| Fachlichen Quellenauftrag erfüllen | kein geprüfter Befund zum angefragten Eintrag; Antwort behandelt einen älteren Bericht | Originalauftrag, Werkzeugfolge und sichtbare Antwort | FAIL |

Die Werkzeugfolge erklärt die Abweichung: zwei übergroße, gekürzte Reads von current.md; zweimal das nicht vorhandene Werkzeug search; einmal Offset 815 auf einen Bericht mit nur 29 Zeilen. Nach einem erreichten Ausgabelimit fügte OpenCode eine synthetische Fortsetzung hinzu. Diese war keine Guard-Nachkorrektur. Das Modell setzte danach die Wiedergabe des alten Berichts fort und lieferte erneut [].

Maschinenbeleg: work/evidence/2026-10-27-gpt-oss-native-audit-evaluation.json . Ausschließlich lesende Auswertung; keine weitere Guard-, Hook-, Modell- oder Konfigurationsänderung. Die Reparatur bleibt unverändert. Der nächste Schritt ist ein einzelner begrenzter Read des tatsächlichen Evidenzabschnitts mit einem kurzen Befund, keine Wiederholung der gesamten Dokumentlektüre.
