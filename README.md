# Archi Guard: globale Belegprüfung

## Zieloberfläche: VS Code mit Cline

Der zusätzliche [native Cline-Adapter](cline-plugin/README.md) ist implementiert und offline geprüft (50 Python- und 91 Node-Tests am 30.10.2026). Er verwendet die vorhandenen Prüfer, die Bridge und die dauerhaften Korrekturbudgets. Das Stagingskript stellt die Dateien außerhalb automatisch geladener Verzeichnisse bereit; bestehende TheHive-Hooks bleiben erhalten.

**Begrenzte native Cline-Abnahme, Stand 31.10.2026:** Echte Hostbelege bestätigen Quellprüfung, Werkzeugkorrektur, getrennte Folgeaufträge, Ablehnung alter Lesebelege, Stopp beim dritten Fehlaufruf und erfolgreichen neuen Auftrag danach. Ein positiver Zweischritt-Werkzeugplan ist ebenfalls belegt. Die [Abnahmeübersicht](docs/reports/2026-10-31-bounded-native-acceptance.md) trennt diese Nachweise von offenen allgemeinen Garantien. Semantik und ein garantierter Abbruch bei jedem externen Hookfehler sind weiterhin nicht abgenommen. Die OpenCode-Integration bleibt ein separater Hostadapter.

Vorhandene [Cline-Kontextlimits](docs/cline-context.md) begrenzen Werkzeugausgaben und Nachrichtentext ohne neuen Filter. Das [Berichts-CLI](docs/report-summary.md) fasst JSON-Ergebnisfelder zusammen, ohne fehlende Angaben als bestanden auszulegen.

## Modularer Aufbau

- **Prüfkern:** `archi_belegpruefer_v1_1.py` und `archi_schlusspruefer_v2.py` prüfen Belege deterministisch, unabhängig von Modell und Provider.
- **Transport und Befundformat:** `archi_bridge_v2.py` verbindet das vereinbarte Datenformat mit den vorhandenen Prüfern.
- **Korrekturregeln und Budget:** `global-plugin/correction.mjs` entscheidet anhand fester Prüfcodes und verwaltet höchstens zwei dauerhafte Reservierungen. Es verwendet keine Provider-SDKs und kennt keine Modellfamilien.
- **OpenCode-Adapter:** `global-plugin/runtime.mjs` beobachtet Hostereignisse, bindet Antworten an Benutzeraufträge und fordert Korrekturen über die vorhandene OpenCode-Schnittstelle an. Ein zusätzliches Modell braucht keine Änderung am Prüfkern oder Budgetmodul.

OpenCode Desktop **2.1.4** lädt das globale Plugin für normale Build-/Plan-Sitzungen. Das Plugin fordert bis zu drei strukturierte Befunde im bestehenden `ARCHI_AUDIT_JSON_BEGIN`-/`END`-Format an. Nach `session.execution.succeeded` liest es die zugehörige abgeschlossene Antwort und übergibt sie mit tatsächlich beobachteten `read`-Ergebnissen an **die vorhandene Archi Bridge V2**. Diese ruft V2 und darüber V1 auf.

## Aussagekraft

Geprüft werden Originaldatei, Zeile, Zitat, deklarierte Pflichtbelege und Literalregeln. Jeder Beleg benötigt zusätzlich einen passenden echten `read`-Pfad und das Zitat im beobachteten Werkzeugresultat. Relative Read-Pfade werden ausschließlich anhand der tatsächlichen Sessionwurzel aufgelöst. Externe Quellen außerhalb dieser Wurzel werden von den vorhandenen Pfadsperren abgelehnt. Strukturierte Textseiten unterstützen mehrzeilige Zitate; beim Rückfall auf formatierten Modelltext können Zeilenpräfixe die Zuordnung konservativ verhindern.

**Freie Schlussfolgerungen bleiben semantisch ungeprüft. `freigabe` bleibt immer `NEIN`.** Die Prüfung erfolgt nach der Antwort; die erste Antwort ist bereits sichtbar. Ein allgemeiner Rückgang von Halluzinationen ist nicht nachgewiesen.

`GEPRUEFT` bedeutet nur, dass die deklarierten Befunde durch die Prüfstrecke gelaufen sind. Maßgeblich sind deren `pruefcode`, `schlussstatus` und `werkzeugnachweis`. Fehlende oder leere Blöcke ergeben `KEINE_STRUKTURIERTEN_BEFUNDE`, ungültige Blöcke `FORMAT_FEHLER`, Prozess-/Transportfehler `PRUEFER_FEHLER`. Keine dieser Meldungen bestätigt eine Antwort. Eine Begrenzung der gespeicherten Toolausgaben wird im Protokoll kenntlich gemacht.

Ab Laufzeitversion `global-v0.5` enthält jeder Audit ausdrücklich `abnahme`. Ohne geprüften Befund, bei Format-/Infrastrukturfehlern oder einem negativen Befund lautet der Wert `NICHT_ABGENOMMEN`. Nur wenn alle deklarierten Befunde die formale Belegprüfung mit tatsächlich beobachtetem Read bestehen, lautet er `NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT`. Das bestätigt ausschließlich diese deklarierten Befunde; `freigabe=NEIN` und `SCHLUSS_UNGEPRUEFT` bleiben bestehen. Die Marker müssen eigenständig auf einer Zeile stehen; exakt gepaarte Markdown-Hüllen (`**`, `*`, `__`, `_` oder Backtick) werden ebenfalls erkannt. Der JSON-Inhalt wird dabei nicht umgeschrieben; `[]` bleibt ohne geprüfte Befunde.

Die Strukturabdeckung benennt geprüfte deklarierte Befunde und ungeprüften Freitext. Die Gesamtzahl aller Aussagen bleibt unbekannt. Werkzeuglimits werden der jeweiligen Antwort zugeordnet; eine spätere saubere Antwort erbt kein altes Limit. `prompt_id_sha256` bezeichnet den Hash der Benutzer-Nachrichten-ID; `prompt_sha256` bleibt Kompatibilitätsalias.

Die letzte Prüfung einschließlich `abnahme` wird im Audit, im bestehenden Konsolenprotokoll und beim nächsten normalen Modellaufruf derselben Session als ausdrücklich zugeordneter Systemkontext ausgegeben. OpenCode 2.1.4 bietet dem Server-Plugin keine UI-/Toast-/Message-Writer-Schnittstelle. Ein unmittelbarer passiver GUI-Hinweis bleibt offen. `session.synthetic({resume:false})` würde spätere Modelleingabe einreihen und wird deshalb nicht für Warnungen verwendet; Statusmeldungen starten keine zusätzliche Inferenz. Die frühere CLI für `beleg-audit`-Sessionexporte bleibt erhalten.

## Begrenzte automatische Nachkorrektur

Archi Guard arbeitet unabhängig von Modellfamilie und Provider. Die deterministische Prüfung verwendet kein Kritiker-Modell. Für eine Nachkorrektur wird dieselbe in OpenCode ausgewählte Provider-/Modell-/Variantenreferenz des ursprünglichen Auftrags verwendet; der Guard wählt kein anderes Modell aus. Höchstens zwei Nachkorrektur-Anforderungen pro ursprünglichem Benutzerauftrag sind freigegeben. Auslöser sind ausschließlich konkrete Format-, Belegketten-, Zitat-, Literal- oder Read-Nachweisfehler. Fehlende/leere Befundblöcke, ungeprüfte Semantik und Infrastrukturfehler starten keine Korrektur.

Bei fehlendem oder leerem Befundblock meldet die Nachkorrektur `BEFUNDE_FEHLEN_UNGEPRUEFT` und reserviert keinen weiteren Versuch. Bestehende Host-, Modell-, Infrastruktur- und Zustandsblockaden behalten Vorrang; bereits verbrauchte Versuche bleiben erhalten. Eine ausbleibende Korrektur ist keine Abnahme.

Das Budget wird vor dem Einreihen exklusiv gesperrt, dauerhaft gespeichert und zurückgelesen. Doppelte Abschlussereignisse, Plugin-Neuladen und unklar angenommene Anforderungen setzen den Zähler nicht zurück. Zustand: `C:\Users\USER\.local\state\archi-guard\corrections`; gespeichert werden ausschließlich Schema, Hashes und Zähler. Beschädigte Dateien und vorhandene Sperren blockieren konservativ. Der Guard löscht keine alten Sperren automatisch.

Auch die aktive Auftrags-/Modellbindung wird unabhängig vom Chatkontext gespeichert. Der OpenCode-Adapter prüft sie am tatsächlichen `model.request`, einschließlich Nebenanfragen. Nach Komprimierung oder Plugin-Neuladen führt eine fehlende Zuordnung zur Sperre statt zu einem ungebundenen Modellaufruf. Ein bestätigter neuer Benutzerauftrag kann einen alten, noch nicht zugestellten Korrekturauftrag gezielt beenden; eine spätere Zustellung bleibt gesperrt.

Die Korrektur verwendet nur feste Prüfcodes, Befundindizes und Hashzuordnung. Sie erweitert weder Werkzeugrechte noch den ursprünglichen Auftrag. Ein Versuch kann mehrere interne Modell-/Werkzeugschritte enthalten; das Budget zählt Guard-Anforderungen. Nach ausgeschöpftem Budget bleibt ein konkreter Fehler ausdrücklich ungelöst. Stand der Prüfung und Übertragung: [Reparaturbericht](docs/reports/2026-10-27-guard-reparatur.md).

## Installation und Rückweg

Aus dem Repository mit PowerShell 7:

```powershell
& .\scripts\Sync-GlobalPlugin.ps1
```

Das Skript synchronisiert sieben genau festgelegte Dateien nach `C:\Users\USER\.config\opencode\plugins\archi-guard`, einschließlich `correction.mjs`. Python-Prüfer werden mitkopiert, damit Plugin und Bridge denselben Stand verwenden. Vorherige Dateien und Manifest werden außerhalb des automatisch geladenen Pluginordners unter `C:\Users\USER\.local\state\archi-guard\backups` gesichert. Jede Zieldatei wird mit SHA256 geprüft; Fehler lösen die Wiederherstellung aus. Eine bereits laufende OpenCode-Instanz lädt Dateien erst beim nächsten Start neu; für zusammenhängende Übertragung OpenCode geschlossen halten. Das Skript beendet keine Prozesse und ändert keine Modell-/Providerkonfiguration.

```powershell
& .\scripts\Sync-GlobalPlugin.ps1 -RestoreBackup '<vom Skript ausgegebener BackupPath>'
```

Voraussetzung ist Python >= 3.10. Auf diesem Rechner wird die vorhandene Python-3.13-Installation verwendet. `ARCHI_GUARD_PYTHON` erlaubt einen expliziten anderen Interpreterpfad. Keine Zusatzpakete, kein Netzwerk und kein weiteres Modell für die Pythonprüfung. Eingaben laufen ausschließlich über stdin; maximal 1 MiB und fünf Sekunden Laufzeit je Pythonprozess. Beobachtete Tooltexte bleiben im Speicher und werden begrenzt.

## Ergebnisse und gezielte Prüfung

Der neue Repositorystand `global-v0.6` bindet jede Guard-Instanz über die vorhandene
`ctx.location` an kanonisches lokales Verzeichnis und optionale `workspaceID` ihrer
Sitzung. Fremde Sitzungen erhalten von dieser Instanz weder Audit, Read-Markierung
noch Korrekturreservierung. Fehlende Instanzidentität verhindert das Setup;
unaufklärbare Sessionidentität kann keine Belegabnahme erteilen und blockiert
Modellanforderungen konservativ. Ein neuer menschlicher Auftrag unterbricht die
alte Korrektur weiterhin sofort. Budget, Modellbindung und Reloadschutz bleiben
bestehen. Dieser Stand ist zunächst nur offline geprüft; die installierte Version
und die spätere natürliche Hostabnahme sind separat festzustellen.

Laufzeitprotokoll: `C:\Users\USER\.local\state\archi-guard\audits.jsonl`. Es enthält Hashes zur Zuordnung, Prüfcodes und Zähler; keine Antworttexte, Originalpfade oder Zitate. Die Begrenzung auf höchstens drei modellseitig deklarierte Befunde ist keine vollständige Abdeckung aller Aussagen.

```powershell
node --test tests/correction.test.mjs tests/plugin-integration.test.mjs
py -3 -B -m unittest discover -s tests -p test_bridge_plugin.py -v
py -3 -B archi_bridge_v2.py --self-test
```

Die 42 historischen V1-Selbsttests werden durch diese Integrationsprüfung nicht grundlos wiederholt. Die vorhandenen Bridge-Regressionen sind wegen der Bridge-Erweiterung relevant. Beim Integrationsnachweis war der npm-PATH-Befehl noch die alte Version 1.19.4. Diese separate Installation wurde anschließend am 26.10.2026 gesichert und deinstalliert. Der aktuelle Befehl `opencode` verwendet über die Launcher in `C:\Users\USER\.local\bin` direkt die vorhandene Desktop-CLI 2.1.4; deren Vorlagen liegen unter `scripts/launchers`. PowerShell, CMD und Git Bash wurden mit `--version` geprüft. Es wird keine zweite CLI-Binary installiert.

Taggenaue offizielle Schnittstellen: [Session-Hooks v2.1.4](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/plugin/src/promise/session.ts), [Read-Tool](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/core/src/tool/plugin/read.ts), [Abschlussereignis](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/schema/src/session-event.ts). Die aktuelle Online-Dokumentation enthält bereits APIs, die der Adapter von 2.1.4 noch nicht anbietet.
