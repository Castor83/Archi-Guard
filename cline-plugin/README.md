# Archi Guard für Cline / VS Code

Dieser zusätzliche native SDK-Adapter verwendet die bestehende Python-Bridge und das persistente Korrekturbudget. Er registriert beforeRun/beforeModel/afterTool/beforeTool und prüft vor Werkzeugen mit lifecycle.completesRun=true den Antworttext input.summary. Für das SDK-Lesewerkzeug read_files übernimmt er ausschließlich erfolgreiche strukturierte `{query, result, success}`-Einträge mit absolutem, tatsächlich vorhandenem Workspacepfad. Unbekannte, externe, binäre oder nicht zuordenbare Ausgaben ergeben keinen Lesenachweis. Bereichsabfragen mit einem vom Pfad abweichenden query-Label werden konservativ nicht zugeordnet.

Die jüngste echte Usernachrichten-ID, conversationId und kanonische Workspacewurzel binden den Auftrag. Assistant-modelInfo liefert die tatsächlich beobachtete Provider-/Modellreferenz. Eine separate Varianten-/Parameteridentität stellt dieser Vertrag nicht bereit: keine vollständige Variantenwechselgarantie behaupten. Fehlende Modellreferenzen stoppen die Abschlussprüfung. Negative Prüfcodes können höchstens zwei Skip-Rückmeldungen im selben Task auslösen; keine eigenen Modellaufrufe. Budget und Modell-Fence sind hashgebunden dauerhaft; Rohantworten und Readtexte werden nicht gespeichert. Nach Reload sind neue echte Reads erforderlich. Semantik und Vollständigkeit bleiben ungeprüft, Freigabe=NEIN.

## Aktueller nativer Nachweis, 31.10.2026

Der Adapter wird vom echten Cline-Host geladen. Normale Textabschlüsse werden über `afterModel` geprüft. Ein expliziter menschlicher Werkzeugplan kann registrierte Fehlaufrufe vor Ausführung mit `skip/reason` zurückweisen; zwei Rückmeldungen und ein dritter Stopp sind nativ beobachtet. Neue Benutzeraufträge verwenden neue Read-/Fortschrittsbindungen. Auch ein gültiger Folgeauftrag nach Budgeterschöpfung wurde bestätigt. Die [Abnahmeübersicht](../docs/reports/2026-10-31-bounded-native-acceptance.md) beschreibt Umfang und Grenzen; sie ersetzt keine allgemeine semantische oder externe Hookfehler-Abnahme.

## Historischer Aktivierungsnachweis vor Hosttests, 30.10.2026

Der Adapter ist im globalen Cline-Pluginordner registriert und nicht deaktiviert. Der reguläre JS-Einstieg und die sieben unveränderten Laufzeitdateien wurden installiert, alle neun Dateien per SHA256 rückgelesen. Der exakte Scanner der installierten Cline-Version findet ausschließlich den Einstieg; dieser lässt sich vollständig importieren. Das belegt Dateiregistrierung und Ladbarkeit, noch keinen Lauf im IDE-Host. Ein neuer Cline-Task muss ihn über die native Discovery laden. Modell-/Providerkonfigurationen und bestehende TheHive-Hooks wurden hashgeprüft unverändert erhalten.

Die ausdrückliche Aktivierung verändert den nativen Hookfehler-Default nicht: Eine allgemeine fail-closed Garantie ist weiterhin nicht belegt. Es wurde weder die Erweiterung gepatcht noch eine Sicherheits-/Vertrauensprüfung umgangen. Der separat installierte CLI-Befehl ist Version 3.0.71 und wurde für die IDE-Aktivierung nicht verwendet.

## Historischer Vorbereitungsstand vor Aktivierung

Implementiert und mit Offline-Vertragstests geprüft, nicht als im echten IDE-Host wirksam abgenommen. SDK-Verträge wurden mit den offiziellen Quellen abgeglichen; tatsächliche Ereignisse der installierten IDE 4.1.26 wurden hier nicht ausgelöst. Der vorhandene OpenCode-Adapter und globale TheHive-Dateihooks bleiben erhalten.

`scripts/Stage-ClinePlugin.ps1` kopiert sieben festgelegte Dateien außerhalb automatischer Discovery, sichert alte Dateien und prüft SHA256. Es aktiviert nichts und verändert keine Cline-Einstellungen, Modelle oder Hooks. Der Einstiegspunkt im Staging ist `cline-plugin/index.mjs`; dessen relative Abhängigkeiten werden mitkopiert.

Cline dokumentiert ein Hooklimit von drei Sekunden und einen Fehlerdefault, der Hookfehler ignorieren kann. Der Adapter beendet seinen Bridgeprozess nach einer Sekunde und liefert spätestens nach zwei Sekunden eine Stop-Rückgabe; das ersetzt keine bestätigte Host-Fail-closed-Policy. Deshalb verhindert das Stagingskript eine versehentliche Kopie direkt in automatisch geladene Cline-Plugin-/Hookverzeichnisse. Die konkrete IDE-Discovery und eine unterstützte fail-closed Einstellung müssen vor Aktivierung gesondert verifiziert werden. Ohne sie keine harte Abschlussgarantie und keine automatische Produktivaktivierung.

## Offline prüfen

`node --test tests/cline-plugin.test.mjs`

Echte Python-Bridge mit temporären Quellen, keine Inferenz oder UI-Steuerung. Quellenverträge: https://docs.cline.bot/sdk/plugins ; https://github.com/cline/cline/blob/main/sdk/packages/shared/src/agent.ts ; https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/tools/definitions.ts . Online-main kann sich ändern; kein Ersatz für die native Hostabnahme.
