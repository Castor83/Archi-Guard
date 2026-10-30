# Arbeitsbericht: Archi Guard, OpenCode und MORPH

Stand: 27.10.2026. Erstellt von @codex-desktop-agent im Chat `01a17e36-ced7-7643-bade-2c9f5fcbbc9f`.

Dieser Bericht beschreibt die übernommene Reparatur, ihren Abschluss in diesem Chat, die anschließende Übertragung und zwei echte native Testaufträge. Für den Bericht wurden vorhandene Belege gelesen und aktuelle Datei-/Prozessdaten geprüft; keine Tests oder Modellläufe wiederholt.

## 1. Ergebnis und aktueller Stand

**Guard global-v0.6 ist installiert und im echten OpenCode-Host nachgewiesen. Die geprüften Offlinefälle bestehen. Eine vollständige erfolgreiche Live-Abnahme liegt weiterhin nicht vor.**

Das ist kein einheitlicher PASS/FAIL für alle Komponenten:

| Teil | Belegter Stand | Grenze |
|---|---|---|
| Reparatur der Projekt-/Sessionzuordnung | Implementiert; betroffene Offline-Suite 78/78 bestanden | Keine universelle Garantie gegen jeden späteren Zustandswechsel |
| Installierte Dateien | Sieben von sieben Dateien stimmen mit der geprüften Übertragung überein | Dateiidentität allein wäre kein Hostnachweis |
| Tatsächlich geladene Version | global-v0.6 in echten Read-Metadaten und zugeordneten Audits beider Testaufträge | Keine allgemeine Betriebsabnahme |
| Automatische Nachkorrektur | Im zweiten Test zweimal tatsächlich ausgeführt; Grenze 2/2 eingehalten | Nicht alle Befunde wurden dadurch richtig |
| Erhalt eines exakten Lesenachweises | Im zweiten Test über die zweite Nachkorrektur konkret belegt | Kein umfassender nativer Mehrinstanznachweis |
| Befolgung des engen Nutzerauftrags | Weiter fehlerhaft: Ausgabeformat, Zahl der Befunde und Reads | Kein bestandenes Gesamtergebnis |
| Unabhängige semantische Qualitätsprüfung | Weiter offen und nicht implementiert | Formale Belege bestätigen keine freien Schlussfolgerungen |

Bei der aktuellen lesenden Prüfung am 27.10.2026 um 19:24 Uhr Europe/Berlin waren keine OpenCode-Prozesse vorhanden. Alle sieben installierten Dateien stimmten weiterhin mit dem Übertragungsbeleg überein. Das ist eine Momentaufnahme.

## 2. Ursprüngliches Problem und übernommene Arbeit

Der frühere MORPH-Livefall hatte einen echten Read, trotzdem entstanden Audits ohne diesen Nachweis. Der vorhandene isolierte Replay zeigte, dass eine fremde Guard-Instanz eine Nachkorrektur einer anderen Sitzung übernehmen konnte, ohne deren ursprüngliche Read-Daten zu besitzen.

Die grundlegende Korrektur war beim Wechsel in diesen Chat bereits implementiert. Sie gehört zum Vorgängerstand `2f2b767`. Die Runtime vergleicht ihre tatsächliche Projekt-/Workspaceidentität mit der Sessionidentität. Fremde oder nicht zuverlässig zuordenbare Sitzungen erhalten dadurch keine unbegründete Abnahme. Der vorher zusätzlich gefundene Prompt-/Dispatch-Zeitfehler war ebenfalls bereits korrigiert.

Ich habe diese grundlegende Reparatur in diesem Chat nicht nochmals neu entwickelt. Mein anfänglicher Auftrag war, die vorhandenen Reviewkorrekturen zu prüfen, zu dokumentieren und gezielt zu committen.

## 3. Was ich in diesem Chat konkret erledigt habe

### 3.1 Arbeitsstand übernommen und Review abgeschlossen

- Den bestätigten TheHive-Checkpoint mit dem bestehenden Reader einschließlich Hash- und Elternprüfung geladen.
- Den schon abgeschlossenen finalen Testlog gelesen: **78 Tests, 78 bestanden, 0 Fehler, EXIT=0**. Diese Suite lief vor dem Chatwechsel und wurde hier nicht wiederholt.
- Den tatsächlichen Diff von `runtime.mjs` und `plugin-integration.test.mjs` geprüft.
- Die beiden Dateien mit `node --check` und den Diff mit `git diff --check` geprüft.
- Einen weiteren unabhängigen Read-only-Review des begrenzten Diffs durchführen lassen; kein verbleibender Codeblocker in den beiden Reviewkorrekturen.
- Die vorhandenen Korrekturen, drei Regressionen und die aktualisierte Dokumentation in `1f32ab7` gesichert.

Die Reviewkorrekturen prüfen die Sessionlocation nach asynchronen Bridge-/Kontextabfragen erneut. Ein inzwischen fremder Kontext darf keine fremde Korrektursperre löschen oder einen Folgeaudit für die fremde Sitzung erzeugen. Eine unbekannte Location verhindert die Abnahme. Die Prüfungen stellen keine atomare Sperre gegen beliebige spätere Hoständerungen dar.

Die beim Abschluss erfassten Quellhashes binden den gelesenen Stand an den Abschlussbeleg. Der ursprüngliche Testlauf selbst hatte keine Quellhashes aufgezeichnet; diese Nachweisgrenze bleibt erhalten.

### 3.2 Vorgänger und Gedächtnis abgeglichen

Den archivierten Vorgänger „TheHive – Hooks und Livetest“ und den zugehörigen Chat „ArchiCard-Funktionsweise erklären“ gezielt nachgelesen. Daraus wurden insbesondere der Originaltest und deine Klarstellung bestätigt, dass du auf eine semantische KI-Prüfung nicht grundsätzlich verzichtet hast.

Den vorhandenen Nachfolger übernommen und den untätigen Ursprung erst nach bestätigter Übernahme archiviert. Projektakte, Prüfbelege und Checkpoints wurden mit vorhandenen TheHive-Werkzeugen fortgeschrieben. Parallele fremde Änderungen wurden erhalten. Ein Parentkonflikt wurde vom Store abgefangen und vor dem erneuten Speichern gezielt abgeglichen.

### 3.3 v0.6 nach deiner Freigabe übertragen

Zunächst war weiterhin v0.5 installiert. Dein ausdrückliches „OpenCode geschlossen – v0.6 übertragen“ gab die Übertragung frei.

Die geschlossene Oberfläche hatte den Backendprozess PID 227564 zurückgelassen. Seine Identität und sein fehlender ursprünglicher Elternprozess wurden geprüft. Ich habe diesen verbliebenen Prozess für die freigegebene Aktualisierung gezielt beendet und danach keine OpenCode-Prozesse mehr festgestellt.

Anschließend habe ich das vorhandene `Sync-GlobalPlugin.ps1` unverändert verwendet. Es sicherte und übertrug sieben festgelegte Dateien. Installierte Dateien und alle sieben Sicherungskopien wurden gegen das Manifest geprüft.

Installationsordner: `C:\Users\USER\.config\opencode\plugins\archi-guard`.

Backup: `C:\Users\USER\.local\state\archi-guard\backups\20261027-174833-53c7dd81`.

Es wurde das Guard-Plugin aktualisiert. Die OpenCode-Anwendung selbst wurde nicht aktualisiert. Das beobachtete Weiterlaufen des Backends ist ein konkreter Vorfall; eine allgemeine Reparatur der App-Schließlogik wurde nicht durchgeführt.

## 4. Erster nativer Testauftrag

Zunächst sollte der Nutzer den vorbereiteten Test selbst bedienen. Mit „kannst du das testen ich muss weg“ hast du anschließend genau diesen Test an mich delegiert. Erst danach startete ich die native Inferenz.

Verwendet wurden der normale installierte OpenCode-CLI-Aufruf, der echte Workspace `E:\MORPH-Studio`, Agent Build und unverändert `ollama/gpt-oss-20b-32k:latest` mit Variante default. Es gab keinen Modellvergleich und keinen zusätzlichen Kritiker.

Der Auftrag verlangte genau einen Read der installierten ReActor-Datei mit Offset 114 und Limit 28, eine kurze Antwort und genau einen Befund im Guard-Format.

**Tatsächlich beobachtet:**

- Session `ses_e81ada056ffec3gM9ogPT8wW4L` erfolgreich beendet; nativer Prozess EXIT=0.
- Genau ein erfolgreicher Read, tatsächlich Zeilen 114–141, 1619 Zeichen.
- global-v0.6 in den Read-Metadaten und im exakt zugeordneten Audit bestätigt.
- Die beiden deutschen Sachantworten entsprachen der Quelle.
- Die vollständige Antwort umfasste aber 4652 Zeichen mit unerbetener Vorrede.
- Der vorgeschriebene Auditblock fehlte. Ergebnis: `NICHT_ABGENOMMEN`, 0 geprüfte Befunde, `freigabe=NEIN`, 0/2 Nachkorrekturen.

Der Guard nahm eine Antwort ohne prüfbare Befunde somit nicht fälschlich ab. Die vollständige Belegkette und ihr Erhalt bei Nachkorrekturen wurden in diesem Lauf mangels strukturierter Befunde nicht geprüft.

Der native Aufrufpfad speicherte den sonst gleichen Originalprompt mit zwei zusätzlichen äußeren Anführungszeichen. Deshalb war die Promptübermittlung nicht byteidentisch. Ob CLI, Shell oder eine andere Grenze diese Zeichen erzeugte, wurde nicht abschließend lokalisiert; ihre Ursächlichkeit für den Ausgabefehler ist nicht belegt.

## 5. Zweiter nativer Testauftrag auf „teste weiter“

Für diesen einen weiteren Lauf wurde nur eine fachliche Testvariable geändert: Im Nutzerprompt standen die bereits vorgeschriebenen Auditmarkernamen nun ausdrücklich. Modell, Variante, Guard, Workspace und ursprünglicher Readbereich blieben gleich. Es wurde keine richtige Antwort vorgegeben und kein absichtlich falscher Befund eingespeist.

Session: `ses_e81a571faffebbgLnn2b9Ad42y`.

**Ergebnis:**

| Kriterium | Beobachtung | Bewertung |
|---|---|---|
| Auditmarker | In allen drei abgeschlossenen Antworten vorhanden | In diesem Lauf erfüllt |
| Befundzahl | Zwei statt des verlangten einen Befunds | Nutzerauftrag verletzt |
| Reads | Ein ursprünglicher Read plus drei zusätzliche Einzelausschnitte | Nutzerauftrag verletzt |
| Nachkorrekturen | Zwei natürliche Guard-Anforderungen | Budgetgrenze eingehalten |
| Befund M2 | Falsche Zeile 136 auf 137 korrigiert; Originaleinrückung danach exakt | Begrenzt erfolgreich korrigiert |
| Lesenachweis M2 | In den letzten beiden Antworten formal vollständig, ohne neuen Read dazwischen | Erhalt über die zweite Nachkorrektur belegt |
| Befund M1 | Nach JSON-Decodierung zusätzliche echte Backslashes im Zitat | Originalzitat weiterhin falsch |
| Endstatus | `NICHT_ABGENOMMEN`, `ERSCHOEPFT_UNGELOEST`, 2/2 | Gesamttest nicht bestanden |

Wichtig für die Fehlerzuordnung: Der letzte M1-Zitattext steht weder in Originalzeile 115 noch in einem der vier tatsächlich gelesenen Ausschnitte. `LESEBELEG_NICHT_BEOBACHTET` ist für diesen veränderten Text daher kein Beleg für einen erneuten Verlust des Read-Ledgers. Der Guard darf ein solches Zitat nicht als exakt bestätigen.

Bei M2 ist dagegen ein konkreter positiver Befund möglich: Ein bereits beobachteter exakter Lesenachweis blieb über eine weitere Nachkorrektur erhalten. Das ist ein begrenzter Live-Nachweis, keine universelle Garantie für jede Instanzkombination.

Insgesamt gab es in dieser Phase **zwei ursprüngliche native Testaufträge**. Das bedeutet nicht nur zwei einzelne Provideranfragen: Werkzeugschritte und die beiden automatischen Nachkorrekturen gehören zu diesen Aufträgen. Eine Modellvergleichsserie wurde nicht ausgeführt.

## 6. Was ich ausdrücklich nicht getan oder nicht erreicht habe

- Keine MORPH-Funktion, ReActor-Node, Oberfläche, Workflow- oder Modellkonfiguration verändert; keine Bildgenerierung durchgeführt.
- Keine neuen Modelle heruntergeladen, keine Modell-/Provider-/Variantenwechsel und keine Entladung anderer Modelle vorgenommen.
- Keine Zitate nachträglich passend gemacht und keine Prüferregeln gelockert, um einen PASS zu erzeugen.
- Nach dem Reviewabschluss keine weitere Guard-Codekorrektur wegen der Live-Ausgabefehler implementiert.
- Die bereits bestandenen Offline-Suiten nicht erneut für Bericht oder Übergabe ausgeführt.
- Keine unabhängige semantische Judge-/NLI-/DeepEval-Prüfschicht implementiert oder abgenommen. Sie bleibt Bestandteil des offenen Gesamtziels.
- Kein Nachtraining des Modells und keinen vollständigen TheHive-Präferenzlernzyklus nachgewiesen. Gespeicherte Fakten und Suchbarkeit sind davon getrennt.
- Keine neuen Codex-Hooks, Truständerungen, künstliche Komprimierung oder neue allgemeine Chatwechsel-Automatik eingerichtet.
- Keine allgemeine Behebung des OpenCode-Schließverhaltens und keine umfassende native Mehrinstanzabnahme behauptet.
- Keine Veröffentlichung oder Git-Pushes. Im Guard-Repository ist kein Remote konfiguriert.

Die nativen Originalantworten verbleiben in der OpenCode-Sitzungsdatenbank. Auswertungen speichern passende Hashes, Audits und gezielte Befunddaten. Unerbetene Modellvorrede wurde nicht als Gedächtniswissen übernommen. Die erzeugten rohen stdout-/stderr-Dateien liegen lokal unversioniert; sie wurden nicht als bereinigter Erfolgsbeleg committed.

## 7. Prozesse, Dateien und Sicherung

Nach beiden nativen Tests wurde der dafür gestartete vorhandene OpenCode-Dienst mit dem unterstützten Befehl `opencode-cli.exe service stop` beendet. Auch bei der aktuellen Berichtsprüfung waren keine OpenCode-Prozesse vorhanden. Andere Modelle oder Dienste wurden dafür nicht entladen.

Die bestehende TheHive-Wartung und Indexierung wurden nicht neu eingerichtet. Vorhandene Automatiken konnten auf Notiz- oder Commitänderungen reagieren; das ist keine neue umfassende Abnahme dieser Dienste.

Guard-Repository: `C:\Users\USER\projects\archi-guard`, Branch `codex/archi-guard-repair`. TheHive: `C:\TheHive`, Branch `codex/global-handoff`. Unzugehörige Arbeitsstände und unversionierte Referenzen blieben erhalten.

| Guard-Commit | Inhalt |
|---|---|
| `2f2b767` | Übernommene grundlegende Session-/Projektbindung aus dem Vorgänger |
| `1f32ab7` | Geprüfte Reviewkorrekturen und drei Regressionen gesichert |
| `0762533` | Übertragung und vorbereiteter manueller Test dokumentiert |
| `c24a75d` | Erster delegierter nativer Lauf ehrlich ausgewertet |
| `0218dd4` | Marker-Folgetest, Nachkorrekturen und verbleibende Zitatfehler dokumentiert |

Die zugehörigen TheHive-Nachweise wurden separat in `ba363d4`, `85c77e1`, `f413d55` und `772eae8` gesichert. Der fachliche Quellcheckpoint vor dieser Berichtserstellung war `0f31065c0727c2cfb5af83c8f4300a250b66c2ac24b8a2432bb298d9212c2041`. Dieser Bericht wird als eigener Dokumentationsschritt ergänzt; er verändert den festgestellten Testausgang nicht.

## 8. Wie es sinnvoll weitergeht

**Meine Empfehlung: zuerst den vorhandenen Anfrage-/Antwortpfad und die Ausgabevorgaben gezielt untersuchen; anschließend erst nach einer konkreten begründeten Änderung einen weiteren nativen Abnahmelauf.**

Der nächste konkrete Leseauftrag betrifft die Grenze zwischen OpenCode-Aufruf, tatsächlich übermittelten Anweisungen, Ollama-Antwort und JSON-Befund. Dabei sind drei offene Fragen zu beantworten:

1. Wo entstehen die zusätzlichen äußeren Prompt-Anführungszeichen, und welche Bedeutung haben sie tatsächlich für die Modellanfrage?
2. Welche bestehenden, unterstützten Funktionen zur Vorgabe einer strukturierten Ausgabe sind in der installierten Anbindung vorhanden? Geeignetes Vorhandenes ist vor Eigenbau zu verwenden; Verfügbarkeit oder Eignung wird hier noch nicht behauptet.
3. Wie sollen die engeren Aufgabenlimits – ein Read und ein Befund – im vorhandenen Ablauf verbindlich behandelt werden? Der allgemeine Guardvertrag erlaubt bis zu drei Befunde; das ersetzt keine Einhaltung der engeren Nutzeranweisung.

Die fehlerhaften JSON-decodierten Zitate selbst sind bereits belegt. Diese Prüfung muss nicht nochmals durch identische Modellläufe wiederholt werden. Noch offen ist, wie die Ausgabe an der zuständigen Stelle zuverlässig korrekt erzeugt beziehungsweise begrenzt wird. Eine Reparatur muss an einer belegten Ursache ansetzen; bloßes Entfernen unerwünschter Backslashes im fertigen Beleg wäre keine vertrauenswürdige Lösung.

Nach einer konkret geprüften Änderung genügt zunächst ein weiterer begrenzter nativer Fall mit demselben Modell und derselben Quelle. Erfolg verlangt echte gelesene Originalzeilen, gültigen Block, die verlangte Zahl an Befunden und Reads, nach JSON-Decodierung exakte Zitate und einen eindeutig passenden Audit. Automatische Nachkorrekturen dürfen ihre zwei Versuche nicht überschreiten.

Auch ein solcher Erfolg bestätigt nur die geprüften deklarierten Befunde. Die unabhängige semantische Qualitätsprüfung und eine umfassendere Mehrinstanzabnahme bleiben getrennte Aufgaben. Dieser Bericht startet weder eine Reparatur noch einen weiteren Test.

## 9. Originalbelege

- [Offlineabschluss und Hashgrenzen](C:/TheHive/work/verification/guard-scope-closure-20261027.json)
- [Vorhandener finaler Offline-Testlog: 78/78](C:/TheHive/work/verification/guard-scope-suite-reviewed-20261027.txt)
- [Übertragung und Backup](C:/Users/USER/projects/archi-guard/work/evidence/2026-10-27-session-scope-deployment.json)
- [Erster nativer Test: strukturierte Auswertung](C:/Users/USER/projects/archi-guard/work/evidence/2026-10-27-v06-native-read-result.json)
- [Marker-Folgetest: Zitate, Originalzeilen und drei Audits](C:/Users/USER/projects/archi-guard/work/evidence/2026-10-27-v06-marker-native-result.json)
- [Genauer Prompt des Marker-Folgetests](C:/Users/USER/projects/archi-guard/work/evidence/2026-10-27-v06-marker-native-prompt.txt)
- [Chronologischer technischer Fachbericht](C:/Users/USER/projects/archi-guard/docs/reports/2026-10-27-guard-session-scope.md)
- [Aktueller Guard-Arbeitsstand](C:/Users/USER/projects/archi-guard/HANDOFF_CURRENT.md)
- [Aktuelle TheHive-Projektion](C:/TheHive/work/handoff/TheHive/current.md)
