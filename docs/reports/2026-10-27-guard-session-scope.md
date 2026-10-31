# Guard Session Scope – Offline-Korrektur

Stand27.10.2026, @codex-desktop-agent. Scope: ausdrücklich freigegebene
Repository-Korrektur und gezielte Offline-Prüfung. Kein Deployment oder Modelllauf.

## Problem und Verhalten

Der echte MORPH-Test wurde parallel von Instanzen mit und ohne ursprünglichen
Read-Nachweis geprüft. Der isolierte Replay unter C:/TheHive/work/verification/
guard-read-cross-instance-replay-20261027.mjs/.json reproduziert die Übernahme
einer fremden Nachkorrektur. Der vorhandene Host liefert bereits ctx.location;
eine neue globale Koordinationsschicht ist nicht erforderlich.

Runtime global-v0.6 prüft die tatsächliche Sessionlocation vor Prompt-/Kontext-,
Modell-, Werkzeug- und Auditverarbeitung. Lokale Verzeichnisse werden mit
realpath aufgelöst, Windows-Schreibweisen vereinheitlicht und workspaceIDs exakt
verglichen. Netzwerk-/relative/ungültige Locations gelten nicht als Eigentum.
Fehlende Setupidentität wird sichtbar abgelehnt; nicht aufklärbare
Sessionidentität erteilt keine Abnahme. Fremde Modellhooks kehren ohne Eingriff
in Budget/Fence zurück. Eigene Reads bleiben über Nachkorrekturen erhalten.

Ein bekannter eigener Auftrag wird bei neuer menschlicher Eingabe synchron
abgebrochen, bevor die asynchrone Locationabfrage wartet. Das verhindert eine
alte Korrekturanforderung zwischen Nutzerprompt und abgeschlossenem Scopecheck.
Ein weggezogener alter Auftrag kann damit nur beendet, nicht fremd übernommen werden.

## Prüfungen

- Neue Scopefälle vor Codeänderung: vier Tests, drei erwartete Fehler und ein
  bestehender Windows-Positivfall. Nach Änderung alle vier bestanden.
- Erste betroffene Gesamtsuite:71/73; zwei bestehende Fehlerstimuli hingen an
  internen session.get-Aufrufzahlen. Sie werden jetzt am tatsächlichen reservierten
  Budget beziehungsweise am Beginn der unveränderten Pythonbridge ausgelöst.
- Dadurch sichtbar gewordener echter Prompt-/Dispatch-Race: gezielt rot,
  nach synchroner Unterbrechung grün. Drei entsprechende Fälle bestanden.
- Abschließend betroffene komplette Node-Suite:75Tests,75bestanden,0Fehler,
 0übersprungen. Weitere Workspace-/unbekannte Locationfälle eingeschlossen.
- Unveränderte Python-/PreCompact-Suiten nicht wiederholt. Keine Modelle,
  produktiven Budgets, echte Sessions oder installierten Plugin-Dateien verändert.

Rawlogs: C:/TheHive/work/verification/guard-scope-red-20261027.txt,
guard-scope-green-20261027.txt, guard-scope-race-red-20261027.txt,
guard-scope-race-green-20261027.txt und guard-scope-suite-final-20261027.txt.
Der erste gefilterte Testaufruf fand wegen falscher Testregistrierungsposition
keine Scopefälle; dies wurde vor Codeänderung korrigiert und nicht als RED-Beleg gezählt.

## Abschluss der Reviewkorrekturen, 27.10.2026

Der erste unabhängige Review fand zwei zusätzliche Scopewechsel während
asynchroner Verarbeitung: nach dem Bridgeaufruf sowie während der Kontextabfrage
im Modellhook. Die Sessionlocation wird dort erneut geprüft. Eine fremde
Location beendet die Verarbeitung ohne Folgeaudit oder Fence-Löschung; eine
unbekannte Location verhindert die Abnahme und erhält die bestehende Fence.
Auch vor der abschließenden Auditbewertung wird die Location erneut gelesen.

Drei neue Regressionen scheiterten zunächst am unveränderten Stand und bestanden
nach der Korrektur. Der bereits vor dem Chatwechsel abgeschlossene Gesamtlauf
meldet 78 Tests, 78 bestanden, 0 Fehler, 0 übersprungen, EXIT=0. Die Quellen
wurden zuletzt vor Erstellung dieses Logs geschrieben. Im Nachfolger wurden
der vorhandene Log und der Diff gelesen sowie beide JavaScript-Dateien mit
node --check und der Diff mit git diff --check geprüft; keine Tests wiederholt.
Die jetzt erfassten SHA256-Werte binden die gelesenen Quellen und vorhandenen
Logs an den Abschlussbeleg; der frühere Testlauf selbst erfasste keine Quellhashes.

Zusätzliche Belege unter C:/TheHive/work/verification/:
guard-scope-review-red-20261027.txt, guard-scope-review-green-20261027.txt,
guard-scope-suite-reviewed-20261027.txt und guard-scope-closure-20261027.json.

## Grenzen

Ein erneuter unabhängiger Read-only-Review des finalen Diffs fand keinen
verbleibenden Codeblocker in diesen zwei Korrekturen. Die Prüfungen bilden keine
atomare Sperre gegen beliebige spätere Hoständerungen während nachgelagerter
Dateisystemoperationen. Zum damaligen Offlineabschluss blieb die
installierte global-v0.5 erhalten. Offlineerfolg beweist keine geladene
global-v0.6 oder erfolgreiche Hostabnahme. Die semantische Prüfschicht bleibt
offen; formale Belege geben weiterhin keine semantische Gesamtfreigabe.

## Nachfolgend freigegebene Übertragung

Der Nutzer gab im Nachfolger ausdrücklich „OpenCode geschlossen – v0.6 übertragen“
frei. Nach gezieltem Beenden des noch verbliebenen OpenCode-Backends führte der
bestehende Sync-GlobalPlugin.ps1 die Sicherung und Übertragung durch. Sieben von
sieben installierten Dateien und alle Sicherungskopien stimmen mit dem Manifest
überein. Quellcommit1f32ab7, Dateiversion global-v0.6. Beleg:
work/evidence/2026-10-27-session-scope-deployment.json.

Die frühere Deploymentgrenze ist damit für diese Übertragung aufgehoben. Ein
neuer Modelllauf wurde nicht durch Codex gestartet. Der Nutzer führt denselben
bekannten kleinen MORPH-Lesetest in einem frischen OpenCode-Chat aus; tatsächliche
Hostversion, Read-Provenienz und exakte Auditzuordnung sind noch offen.

## Ein delegierter nativer Livetest: Teilerfolg, formale Abnahme FAIL

Der Nutzer delegierte danach ausdrücklich den einen vorbereiteten Test. Genau
ein nativer CLI-run im echten E:/MORPH-Studio, Build, dasselbe GPT-OSS/default.
Session ses_e81ada056ffec3gM9ogPT8wW4L, user msg_17e526091001EZdFhFHGfV3r0t,
finale Antwort msg_17e528736001HrPfn7JhaMmGrv. Prozess Exit0 und Session succeeded;
das sind Ausführungswerte und keine fachliche Gesamtfreigabe.

Ein erfolgreicher Read lieferte tatsächlich Zeilen114–141,1619Zeichen, mit
archi_guard_observed:global-v0.6. Der Audit vom2026-10-27T17:05:14.112Z ist über
Session-, Nutzer-ID- und vollständigen Antwort-SHA256 exakt zugeordnet und
bestätigt ebenfalls global-v0.6. Die beiden deutschen Sachantworten entsprechen
den Originalzeilen115,134,137–140.

Die gesamte Antwort umfasst jedoch4652Zeichen einschließlich unerbetener
Vorrede; das sichtbare JSON besitzt keine erforderlichen Auditmarker.
Tatsächlich: BlockFEHLEND,0deklarierte/geprüfte Befunde,
KEINE_STRUKTURIERTEN_BEFUNDE/NICHT_ABGENOMMEN,freigabeNEIN,
BEFUNDE_FEHLEN_UNGEPRUEFT,0/2Nachkorrekturen. Damit ist die Nichtabnahme fehlender
Belege korrekt beobachtet. Erhaltene volle Read-Provenienz bei Nachkorrekturen
oder fremden Instanzen ist nicht ausgeübt beziehungsweise nicht verifiziert.

Der native Aufrufpfad speicherte den sonst identischen Originalprompt mit zwei
äußeren Anführungszeichen. Keine byteidentische Transportbehauptung und keine
unbelegte Ursache des Modellformats daraus ableiten. Keine zweite Testinferenz,
kein umgeschriebener Replay und keine produktive Reparatur. Der gestartete
Hintergrunddienst wurde mit dem vorhandenen service stop beendet; anschließend
keine OpenCode-Prozesse. Ergebnis und Quellenhashes:
work/evidence/2026-10-27-v06-native-read-result.json. Ungefragte Vorrede wird
nicht als neues Gedächtniswissen oder im Ergebnisbeleg kopiert; vollständiger
Antwort-Hash und Originalsession erhalten die Zuordnung.

## Gezielter Marker-Folgetest auf erneutes „teste weiter“

Eine weitere ausdrückliche Nutzeranweisung autorisierte genau einen gezielten
nativen Folgetest. Einzige fachliche Änderung: Die bestehenden Markernamen
wurden zusätzlich im Nutzerprompt genannt. Keine vorbefüllte richtige Antwort,
kein künstlicher Negativbefund, keine Guard-/Provider-/Modell-/Variantenänderung.
Session ses_e81a571faffebbgLnn2b9Ad42y im echten MORPH-Workspace, Build/GPT-OSS.

Alle drei Antworten besitzen diesmal gültige Marker. Alle drei Audits wurden
an Session, ursprüngliche Nutzer-ID und jeweilige Antwort-SHA256 gebunden.
Der Guard forderte genau zwei natürliche Nachkorrekturen an. Das Modell las
außer dem ursprünglichen114/28-Read während der ersten Korrektur die Zeilen115,
136 und137 nochmals einzeln; das verletzt die Ein-Read-Vorgabe. Zwei Befunde
statt eines verletzen ebenfalls den engeren Nutzerauftrag, obwohl die
allgemeine Guardobergrenze von drei Befunden nicht überschritten wurde.

BefundM2 zitierte zunächst die falsche Zeile136 und ohne Originaleinrückung.
Nach Korrektur ist Zeile137 exakt; sein echter Read bleibt in der ersten und
zweiten Nachkorrektur formal vollständig. Zwischen diesen beiden Antworten
gab es keinen weiteren Read. Dieser begrenzte echte Erhalt ist belegt, eine
universelle Mehrinstanz-/Wiederaufnahmegarantie nicht.

BefundM1 enthält zuletzt nach JSON-Decodierung echte zusätzliche Backslashes
vor den Anführungszeichen. Dieser Text steht weder in Originalzeile115 noch
in einem der vier Reads. Der fehlende Werkzeugnachweis für diesen geänderten
Text ist daher hier keine belegte Wiederholung des früheren Ledgerverlusts.
Die Prüfung wird nicht gelockert, um eine positive Abnahme zu erzwingen.

Finaler Audit2026-10-27T17:14:59.854Z: NICHT_ABGENOMMEN,
ERSCHOEPFT_UNGELOEST2/2,freigabeNEIN. Quellinhalt und Modellschritte unverändert
aufgezeichnet, kein neuer Replay/Modellvergleich. Offizieller service stop
erfolgreich, danach keine OpenCode-Prozesse. Strukturierte Belege einschließlich
der JSON-decodierten Zitate und Originalzeilen:
work/evidence/2026-10-27-v06-marker-native-result.json. Roh-Vorrede wird nicht
als Gedächtniswissen übernommen. Offene Ausgabe-/Umfangsfehler bleiben offen.
