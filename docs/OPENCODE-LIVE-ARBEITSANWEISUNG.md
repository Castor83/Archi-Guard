# Arbeitsanweisung für den OpenCode-Chat: Praxistest mit Archi Guard

Stand: 27.10.2026, Europe/Berlin. Diese Datei kannst du direkt als Arbeitsanweisung verwenden.

## Aktueller einzelner MORPH-Test nach v0.6-Übertragung

**Gezielter Folgetest ebenfalls abgeschlossen:** Auf erneutes „teste weiter“
wurden nur die Markernamen im Nutzerprompt ausdrücklich ergänzt. Marker gültig,
zwei natürliche Nachkorrekturen; ein exakter Befund blieb dabei erhalten. Das
andere Originalzitat ist falsch escaped, außerdem zwei statt eines Befunds und
vier statt eines Reads. Final weiterhin NICHT_ABGENOMMEN,2/2ausgeschöpft.
Beleg: work/evidence/2026-10-27-v06-marker-native-result.json. Kein allgemeiner
Erfolg und keine erneute identische Testaufforderung aus diesem Nachtrag.

**Bereits einmal ausgeführt:** Der Nutzer delegierte den Lauf anschließend an
Codex. Nativer Host und ein Read bestätigt, Ausgabeformat FAIL wegen fehlender
Auditmarker; keine Nachkorrektur und keine vollständige Read-Kettenabnahme.
Beleg: work/evidence/2026-10-27-v06-native-read-result.json. Den unten erhaltenen
Originalauftrag nicht ohne neuen konkreten Anlass nochmals ausführen.

Der Nutzer startet OpenCode nach vollständig beendetem alten Backend neu,
öffnet E:/MORPH-Studio und einen frischen Build-Chat mit seinem bisherigen
GPT-OSS. Keine automatische Versendung oder Modellinferenz durch Codex.
Der folgende Auftrag ist der unveränderte frühere Nutzerprompt
msg_17e0a9931001Ivg04DsFGgBofN aus ses_e81f566ceffdVvyf1WJF9lb9Ye.
Es handelt sich um die gezielte Hostabnahme des vorher fehlerhaften Livepfads,
nicht um eine Wiederholung der bestandenen Offline-Suite.

```text
Prüfe ausschließlich lesend, wie ReActor Restaurierungsmodelle benennt.

Verwende genau einen read-Aufruf:
path: E:\MORPH-Studio\ComfyUI_windows_portable\ComfyUI\custom_nodes\ComfyUI-ReActor\nodes.py
offset: 114
limit: 28

Verwende limit, nicht maxLines. Keine weiteren Dateien oder Werkzeuge.

Beantworte anhand dieses Ausschnitts:
1. Welches Verzeichnis durchsucht get_restorers?
2. Wie bildet get_model_names die angebotenen Modellnamen?

Höchstens vier Sätze plus genau ein belegter Befund im vollständigen
Auditformat des geladenen Guards. Keine Änderungen ausführen.
```

Danach nur den tatsächlich abgeschlossenen Lauf auswerten: geladene
global-v0.6, echter Read114–141, Antwortinhalt, Read-Pfad/Zitat und exakte
Session-/Nutzer-/Antwortbindung im Audit. Keine verlorenen Read-Nachweise oder
konkurrierenden Fremdaudits als Erfolg werten. Nachkorrekturen nur beobachten,
falls sie natürlich auftreten; ohne eine solche ist der Wiederaufnahmeteil
nicht ausgeübt. Keine semantische Gesamtfreigabe ableiten. Der frühere konkrete
Quellenlauf mit v0.5 ist bereits ausgewertet; die folgenden allgemeinen
Anweisungen ändern diesen Status nicht.

## Dein Auftrag

Der Mensch führt jetzt mit dir einen Praxistest anhand einer echten Arbeitsaufgabe durch. Nutze eine normale OpenCode-Build- oder Plan-Sitzung mit dem bestehenden globalen Archi Guard. Die konkrete Aufgabe und das Arbeitsprojekt aus eurem Chat sind maßgeblich. Wechsle nicht allein wegen dieser Anleitung in das Guard-Repository.

Liegt die konkrete Aufgabe schon vor, arbeite innerhalb der bestehenden Freigaben direkt daran. Fehlt sie noch, frage nur nach dieser Aufgabe. Stelle keine neue Installations-, Benchmark- oder Entwicklungsrunde vor den Praxistest. Diese Anleitung erteilt keine zusätzlichen Werkzeug- oder Änderungsrechte.

Der Mensch hat eine eigene Hook-Prüfung angekündigt. Ihr Ergebnis ist hier **nicht bestätigt**. Unterscheide die OpenCode-Plugin-Hooks von den separaten Codex-Hooks für Kontextkomprimierung. Richte keine Hooks neu ein, ändere keine Vertrauenseinstellungen und behaupte keine bestandene Hook-Abnahme ohne Beleg.

## Verbindliche Arbeitsweise

- Erst verstehen, dann gezielt messen, dann handeln. Lies vorhandene Projektanweisungen und, falls vorhanden, zuerst `graphify-out/GRAPH_REPORT.md`. Öffne anschließend nur notwendige Dateien. Ein fehlender Graph ist kein Auftrag zu Installation oder Neuaufbau.
- Modularität und Modellunabhängigkeit sind Grundsätze. Neue Modelle dürfen keine Änderung am Prüfkern oder Budgetmodul benötigen.
- Trenne beobachtete Tatsachen, fachliche Vermutungen und ungeprüfte Aussagen. Ein erfolgreicher Werkzeugaufruf beweist noch keine fachlich richtige Schlussfolgerung.
- Erhalte Fremdänderungen. Prüfe eigene fachlich abgeschlossene Änderungen passend und committe nur zugehörige eigene Dateien. Kein Push, Upload, Modellwechsel, Download, Entladen fremder Modelle oder zusätzlicher Kritiker aus dieser Anleitung ableiten.
- Der Praxistest prüft eure echte Aufgabe. Erfinde keine Fehler und wiederhole den bereits abgeschlossenen Kontrolltest nicht.

## Tatsächlicher Guard-Stand

Der historisch geprüfte und global übertragene Vorgänger war `global-v0.4`: Abschlussstand `8a4dbe998ad0d2f449aa5ee250718c6a8a56d4d8`; fachlicher Adapterstand `284bd5e217a03c48670569861e5ecb22fc2eba99`. Die folgenden Nachweise gelten für diesen Vorgänger:

- **63 betroffene Offline-Tests bestanden:** 23 Budget-/Modultests und 40 Runtime-Integrationstests.
- **Ein kontrollierter nativer Funktionstest bestanden:** ein ursprünglicher Benutzerprompt, ein Fixture-Read, eine automatische Nachkorrektur mit unverändertem Modell, Budget 1 von 2. Das absichtlich falsche Literal wurde erkannt; danach waren Literalregel und formale Belegkette bestätigt. Der eigene Testhost wurde beendet.
- Die sieben installierten Plugin-Dateien wurden vor Erstellung dieser Anleitung erneut gegen den Deploymentbeleg geprüft: **7 von 7 stimmen überein**. Das allein beweist nicht, welche Version ein bereits laufender Host geladen hat.
- Plugin-ID: `archi.guard.global`; Laufzeitversion im erfolgreichen Nachweis: `global-v0.4`; geprüfter OpenCode-Host: Desktop 2.1.4.
- Damalige Modellreferenz beim Abgleich: `ollama/hf.co/unsloth/Qwen3.8-27B-GGUF:UD-Q3_K_XL`. Der danach ausgewertete Praxistest dieses Reparaturanlasses verwendete laut Nutzer `gpt-oss-20b-32k:latest`. Nutze das vom Menschen gewählte Modell; der Guard darf es nicht selbst umschalten. Andere Provider-/Modellreferenzen wurden offline geprüft, nicht alle live abgenommen.

Der historische Zwischenstand `global-v0.5` ergänzte robustere Marker-Erkennung und ausdrückliche Nichtabnahme bei fehlenden prüfbaren Befunden. Der aktuelle Quellstand ist `global-v0.6` mit sitzungs- und workspacegebundener Read-Provenienz. Seine Offline-Prüfung, Übertragung und tatsächliche Hostbeobachtung bleiben getrennte Nachweise; maßgeblich sind die v0.6-Nachträge am Dokumentanfang. Die obigen v0.4-Nachweise bestätigen keine neuere native Abnahme.

Die alte Projektpause vom 26.10.2026 ist historisch. Ältere Übergaben mit „nur Offline-Planung“ oder „keine Korrekturschleife implementiert“ beschreiben nicht mehr diesen Stand.

## Modulgrenzen und relevante Pfade

Guard-Repository: `C:\Users\USER\projects\archi-guard`
Branch beim letzten Abgleich: `codex/archi-guard-repair`; kein Remote konfiguriert.

| Bestandteil | Aufgabe |
|---|---|
| `archi_belegpruefer_v1_1.py`, `archi_schlusspruefer_v2.py` | Modellunabhängige deterministische Quellen-, Zitat-, Pflichtbeleg- und Literalprüfung |
| `archi_bridge_v2.py` | Vorhandene Prüfer über dasselbe Befundformat verbinden |
| `global-plugin/correction.mjs` | Providerneutrale Korrekturregeln, Modellreferenzvergleich, persistentes Budget und Aktivbindung |
| `global-plugin/runtime.mjs` | OpenCode-Hostadapter: Ereignisse, echte Reads, Benutzer-/Antwortzuordnung und Korrekturanforderungen |

Aktives Plugin: `C:\Users\USER\.config\opencode\plugins\archi-guard`
Auditprotokoll: `C:\Users\USER\.local\state\archi-guard\audits.jsonl`
Budget und Aktivbindung: `C:\Users\USER\.local\state\archi-guard\corrections`
Deploymentbeleg: `C:\Users\USER\projects\archi-guard\work\evidence\2026-10-27-correction-deployment.json`
Letztes Deploymentbackup: `C:\Users\USER\.local\state\archi-guard\backups\20261027-130323-f01a583e`

Bei Detailbedarf gezielt lesen:

- `C:\Users\USER\projects\archi-guard\README.md`
- `C:\Users\USER\projects\archi-guard\HANDOFF_CURRENT.md`
- `C:\Users\USER\projects\archi-guard\docs\reports\2026-10-27-guard-reparatur.md`
- `C:\Users\USER\projects\archi-guard\work\native-correction-test\run-20261027-132414-267a14f3\result.json`

Lade nicht vorsorglich alle Berichte oder die gesamte Auditdatei. Der abgeschlossene Native-Harness und sein Einmalmarker bleiben erhalten; starte ihn nicht erneut. Die ursprünglichen unversionierten Belege im Guard-Repository bleiben unverändert.

## So arbeitet der Guard im Live-Auftrag

Der Adapter beobachtet `prompt`, `context`, `model.request`, `tool.execute.after` und den Abschluss `session.execution.succeeded`. Nach der abgeschlossenen Antwort prüft er deren deklarierte Befunde mit den tatsächlich beobachteten Reads. **Die erste Antwort ist zu diesem Zeitpunkt bereits sichtbar.**

Der nächste Modellkontext kann die zugeordnete Nachprüfung enthalten. Bei einem konkreten negativen Prüfbefund kann der Guard automatisch eine synthetische Nachkorrektur anfordern. Er verwendet dabei dieselbe Provider-/Modell-/Variantenreferenz und höchstens zwei Korrekturanforderungen pro ursprünglichem Benutzerauftrag. Fordere keine zusätzlichen Korrekturläufe manuell an und erfinde keine Synthetic-Ereignisse.

Ab v0.5 erscheint `abnahme` im Audit, im bestehenden Konsolenprotokoll und im nächsten normalen Modellkontext. OpenCode 2.1.4 besitzt im Server-Plugin keine UI-/Toast-/Message-Writer-Schnittstelle; ein unmittelbarer passiver GUI-Hinweis bleibt offen. `synthetic(resume:false)` würde spätere Modelleingabe einreihen und ist kein passiver Warnkanal. Für Statusmeldungen wird keine zusätzliche Inferenz gestartet.

Ein Korrekturversuch kann mehrere interne Modell-/Werkzeugschritte umfassen. Zwei Korrekturen sind keine allgemeine Grenze von zwei Modell- oder Werkzeugaufrufen. Eine feste beliebige Werkzeuganzahl ist kein Abnahmekriterium dieses Praxistests.

Budget und aktive Bindung überleben Plugin-Neuladen. Doppelte Ereignisse setzen das Budget nicht zurück. Beschädigte Zustände, vorhandene Sperren, unklare Modellbindung oder nach Komprimierung fehlende ursprüngliche Auftragszuordnung können konservativ blockieren. Melde das nachvollziehbar; lösche keine Sperren, Budgets oder Marker und umgehe die Bindung nicht durch einen Modellwechsel.

## Deine Antwort und die Belegdaten

Verwende das vom geladenen Guard vorgegebene Format. Am Ende der abschließenden Antwort steht genau ein Paar eigenständiger Markerzeilen mit einer JSON-Liste:

```text
ARCHI_AUDIT_JSON_BEGIN
[]
ARCHI_AUDIT_JSON_END
```

Bei passenden Aussagen über tatsächlich gelesenen Quelltext ersetzt du die leere Liste durch höchstens drei echte Befunde gemäß der vorhandenen Vorgabe in `README.md` bzw. `OUTPUT_RULES` des Adapters:

- `id`, `quelle="review"`, `behauptung` und ein ehrlicher `behaupteter_status`;
- `belege` mit Beleg-ID, absolutem tatsächlich gelesenem Pfad, Originalzeile und exaktem Zitat;
- `pflichtbelege` mit den zugehörigen Beleg-IDs;
- nur tatsächlich passende Literalregeln vom Typ `QUELLZEILE_ENTHAELT` in `fakten`.

Erfinde weder Belege noch Literalregeln. Lies keine zusätzlichen Dateien allein zum Füllen des Blocks. Ohne passende Quelltextaussage bleibt die Liste leer. Quellen außerhalb der tatsächlichen Sessionwurzel können durch die vorhandenen Pfadsperren abgelehnt werden; lockere diese Sperren nicht für den Test.

Die Marker müssen vollständig auf einer eigenen Zeile stehen. Ab v0.5 werden exakt gepaarte Markdown-Hüllen (`**`, `*`, `__`, `_` oder Backtick) ebenfalls erkannt; der JSON-Inhalt bleibt unverändert. Eine erkannte leere Liste enthält weiterhin null geprüfte Befunde.

`GEPRUEFT` bedeutet lediglich, dass die deklarierten Befunde verarbeitet wurden. Maßgeblich sind `pruefcode`, `schlussstatus` und `werkzeugnachweis`. `BELEGKETTE_FORMAL_VOLLSTAENDIG` ist keine semantische Gesamtfreigabe. `freigabe` bleibt **NEIN**; freie Schlussfolgerungen, nicht deklarierte Aussagen und allgemeine Vollständigkeit bleiben ungeprüft.

Bei null geprüften Befunden, einem Format-/Infrastrukturfehler oder einem negativen Befund lautet `abnahme=NICHT_ABGENOMMEN`. Nur vollständig formal bestandene deklarierte Befunde mit beobachtetem Read ergeben `NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT`; freie Schlussfolgerungen bleiben ungeprüft und `freigabe=NEIN` gilt weiter.

Fehlende/leere Blöcke melden `BEFUNDE_FEHLEN_UNGEPRUEFT` und lösen keine automatische Nachkorrektur oder neue Reservierung aus. Bestehende Host-, Modell-, Infrastruktur- und Zustandsblockaden behalten Vorrang; verbrauchte Versuche bleiben erhalten. Unbekannte Semantik und Infrastrukturfehler starten ebenfalls keine Korrektur. Eine ausbleibende Korrektur beweist daher nicht allein die Richtigkeit der Antwort. Umgekehrt ist eine Korrektur bei einer fehlerfreien Antwort kein notwendiges Testziel.

## Ablauf des gemeinsamen Praxistests

1. Lies die konkrete Aufgabe und das betroffene Projekt. Benenne kurz Ziel und überprüfbare Erfolgskriterien. Erfinde keine weitere Aufgabe.
2. Prüfe vorhandene Host-/Guardinformationen lesend, soweit sie zugänglich sind. Exakte Plugin-ID und Version bzw. für den neuen Stand `archi_guard_observed=global-v0.6` beim ersten ohnehin notwendigen Read sind mögliche Belege. Kennzeichne einen nicht zugänglichen Status als offen. Eine Datei auf der Platte ersetzt keinen Nachweis des geladenen Hosts.
3. Bearbeite den Auftrag normal und mit den nötigen Werkzeugen. Keine vorgeschaltete Testserie, kein absichtlicher Falschbefund, keine Änderung am Guard nur zur Erzeugung eines Testerfolgs.
4. Schließe die Antwort mit ehrlichen Befunddaten ab. Lass die nachgelagerte Prüfung und gegebenenfalls begrenzte Nachkorrektur regulär laufen.
5. Werte danach gemeinsam mit dem Menschen den abgeschlossenen Lauf aus. Falls die Auswertung in einem Folgeturn erfolgt, ordne den ursprünglichen Arbeitsauftrag ausdrücklich zu. Ein Audit zur gerade noch nicht abgeschlossenen Antwort kann noch nicht vorliegen.

Bekannte Testaufbau-Falle: Eine zusätzlich gesetzte Policy `integration.use:* deny` kann auch lokale Plugins einschließlich des Guards blockieren. Erzeuge keine solche neue Pauschalsperre für diesen Test. Erhalte die vorhandenen Sicherheitsregeln und kläre einen fehlenden Guard gezielt, ohne sie blind abzuschwächen.

Bei der Auswertung nur neue, zum ursprünglichen Auftrag passende Audit-Metadaten lesen, soweit die bestehenden Rechte dies erlauben. `prompt_id_sha256` ist der Hash der ursprünglichen Benutzer-Nachrichten-ID, **nicht des Prompttextes**; `prompt_sha256` ist der kompatible Alias. `answer_sha256` ordnet den Audit dem Antworttext zu. Unzuordenbare alte Auditzeilen zählen nicht als Nachweis dieses Live-Auftrags.

Berichte knapp mit einer Tabelle „Kriterium – Beobachtung – Beleg – PASS/FAIL/OFFEN“:

- fachliches Ergebnis der echten Aufgabe anhand ihrer Erfolgskriterien;
- Guard im tatsächlichen Host beobachtet oder Status offen;
- zugehöriger Audit, Prüfcodes und tatsächlicher Read-Nachweis;
- gegebenenfalls Korrekturgrund, Anzahl 0–2, unveränderte Modellreferenz und Endstatus;
- verbleibende Fehler, ungeprüfte Aussagen und technische Blocker.

Wenn kein passender Audit zugänglich ist, lautet dieser Teil **OFFEN**. Fehlende semantische Freigabe darf nicht als bestandene fachliche Prüfung ausgegeben werden. Ein erfolgreicher einzelner Praxistest beweist keine allgemeine Halluzinationsreduktion.

Speichere einen knappen Ergebnisbericht nur, soweit die konkrete Aufgabe Dateischreiben erlaubt, im betroffenen Projekt unter `work/live-test/`; sonst berichte im Chat. Keine Geheimnisse, Roh-Reasoningdaten oder unnötigen privaten Inhalte übernehmen. Dokumentiere Abweichungen, statt Prüfregeln oder Rechte für einen grünen Test abzuschwächen.
