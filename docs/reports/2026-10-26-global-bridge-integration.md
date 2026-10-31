# Archi Guard: Integrationsnachweis vom 26.10.2026

## Ergebnis

Die vorhandenen Python-Qualitätsprüfer sind über die bestehende Archi Bridge V2 mit dem globalen OpenCode-Plugin verbunden. Ein echter normaler Build-Durchlauf mit OpenCode Desktop 2.1.4 und dem vorgegebenen Ollama/Qwen-Modell löste die Prüfstrecke automatisch aus. Die korrekte Literal-Kontrolle wurde formal bestätigt, die absichtlich falsche Literal-Kontrolle erkannt. Beide Prüfergebnisse sind der tatsächlichen Session und endgültigen Antwort per SHA256 eindeutig zugeordnet.

Dies ist der Nachweis der **nachgelagerten Integration**, einschließlich inhaltlicher Literalprüfung. Es ist kein Nachweis einer allgemeinen Halluzinationsreduktion, vollständigen Abdeckung aller Aussagen oder Korrektur vor der Anzeige.

## Änderung

- `archi_bridge_v2.py`: begrenzter `--plugin-stdin`-Transport und `analyze_plugin`; bisheriger beleg-audit-Exportpfad unverändert. V1/V2 werden wiederverwendet; ihre Dateien und Freigabegrenzen sind unverändert.
- `global-plugin/runtime.mjs`: bestehender Ledger plus echte Read-Resultate im Speicher, begrenzte Zuordnung nach Session/Benutzerprompt/Assistant-Nachrichten, Abschluss-Event und Pythonaufruf ohne Shell. Finale Assistant-Nachricht wird auch dann berücksichtigt, wenn sie keinen Text enthält; kein Rückfall auf eine ältere Zwischenausgabe. Parallele/neuere Prompts verbrauchen das Audit vorheriger Antworten nicht.
- `global-plugin/index.ts`: bestehende Plugin-ID, delegiert an die geprüfte Laufzeit. Keine neuen Agenten.
- `scripts/Sync-GlobalPlugin.ps1`: sechs versionsgleiche Dateien kontrolliert übertragen; vorher Backup, danach SHA256-Abgleich, gezielter Rückweg. Keine Konfigurations-/Provider-/Modelländerung.

Prüfermeldungen landen unter `C:\Users\USER\.local\state\archi-guard\audits.jsonl`. Das Protokoll speichert nur Zuordnungshashes, Prüfcodes und Zähler. Die letzte Meldung wird beim nächsten normalen Kontextaufbau derselben Session mitgegeben. Keine weiteren Modellläufe werden ausgelöst. Eine sofort sichtbare Warnung im abgeschlossenen Antworttext wird nicht zugesichert.

## Gezielte lokale Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| Neue Node-Integrationstests mit echten Pythonaufrufen | 10/10, Exit 0 |
| Neue Python-Bridge-Vertragstests | 17/17, Exit 0 |
| Bestehende Bridge-Regressionen wegen geänderter Bridge | 14/14, Exit 0 |
| Synchronisation/Rollback an temporärem Ziel | 6 Dateien geprüft; Originaldatei exakt wiederhergestellt |
| `git diff --check`, Node-Syntaxprüfung | erfolgreich |

Die Anschlussfunktion und zwei durch unabhängigen Review gefundene P2-Zuordnungsfehler wurden zunächst durch scheiternde Tests nachgewiesen und anschließend korrigiert. Die neuen Leerlisten-/Formatfälle sind ebenfalls als Regressionen gesichert. Die historischen 42 V1-Selbsttests und der alte MORPH-/Hook-Laufzeittest wurden nicht wiederholt.

## Echter Ende-zu-Ende-Durchlauf

- Desktop-Binary: `C:\Users\USER\AppData\Local\Programs\@opencodedesktop\resources\opencode-cli.exe`, verifiziert Version 2.1.4. Die PATH-Version 1.19.4 wurde nicht verwendet.
- Ein Benutzerauftrag mit `run --standalone --format json --agent build`, Modell `ollama/hf.co/unsloth/Qwen3.8-27B-GGUF:UD-Q3_K_XL`, gezielter Fixture-Read und zwei vorgegebenen Regressionstestbefunden. Ein normaler Tool-/Antwortablauf enthält die erforderlichen Modellfortsetzungen; kein zusätzlicher Kritiker oder separater Modellvergleich.
- Fixture: `tests/fixtures/evidence.js`, eine Quellzeile. Genau ein beobachteter Toolaufruf: `read`, `completed`, Metadaten `archi_guard_observed=global-v0.2`.
- Session: `ses_e88828f67ffeYxbD0ebB0sfer9`; Auditzeit `2026-10-26T09:16:06.637Z` = **10:16:06 MEZ**.
- CLI Exit 0; stderr leer. Private Testprozesse regulär beendet; keine Fremdprozesse beendet und kein Modell entladen.
- M1: `BELEGKETTE_FORMAL_VOLLSTAENDIG`, `SCHLUSS_UNGEPRUEFT`, eine exakte Belegzeile/eine bestätigte Literalregel.
- M2: `FAKTREGEL_NICHT_BESTAETIGT`, `SCHLUSS_UNBELEGT`, eine exakte Belegzeile/eine nicht bestätigte Literalregel.
- Beide: `READ_PFAD_UND_ZITAT_BEOBACHTET`, `freigabe=NEIN`; Toolumfang nicht abgeschnitten.
- Session-SHA256: `745d195f18db320d824ff346f241276c676ddbc990144a17185bf4860666db92`.
- Endantwort-SHA256: `7d70ea22ef12f0cfcd06918541b793815a5ca7741bcdf0b7219098af40ef8e9b`. Die CLI-Textausgabe ergibt exakt denselben Hash wie das automatisch erzeugte Audit.

Lokale Rohbelege, Testauftrag und maschinelle Nachprüfung: `C:\Users\USER\.local\state\archi-guard\verification\e2e-*-20261026.*`. Die anfänglich leeren CLI-Ausgabedateien waren eine Momentaufnahme vor dem später erfolgreichen Abschluss; ein Startfehler wurde nicht belegt.

## Deployment und Rückweg

Die sechs aktiven Dateien wurden vor dem Test per Hash geprüft. Backup des ursprünglichen Plugins: `C:\Users\USER\.local\state\archi-guard\backups\20261026-101335-dfe9cb73`. Das Manifest enthält vorhandene/neu angelegte Dateien und deren Hashes. Deploymentbeleg: `C:\Users\USER\.local\state\archi-guard\last-deployment.json`.

```powershell
& 'C:\Users\USER\projects\archi-guard\scripts\Sync-GlobalPlugin.ps1' -RestoreBackup 'C:\Users\USER\.local\state\archi-guard\backups\20261026-101335-dfe9cb73'
```

OpenCode war vor der Übertragung geschlossen. Neue normale Instanzen laden den installierten Stand automatisch. Es wurde nichts gepusht, hochgeladen oder in TheHive gespeichert.

## Grenzen und offene Folgearbeit

Live nachgewiesen ist **Build**. Plan nutzt dieselbe globale Anbindung und wurde mit gezielten Host-Vertragstests geprüft, aber ohne separaten Live-Modelllauf. Der einzelne Live-Test enthält einen ausdrücklich vorgegebenen Prüfblock und kontrollierte Testdaten; automatische Formattreue bei beliebigen normalen Aufgaben bleibt unbewiesen.

Die globale Ausgabeanweisung umfasst maximal drei deklarierte Befunde. Nicht deklarierte Aussagen werden nicht automatisch extrahiert. Auch eine formal passende Belegkette beweist keine frei formulierte Diagnose. Fehlende/ungültige Blöcke erhalten keine Freigabe; alle freien Schlüsse behalten `freigabe=NEIN`. Externe Quellen außerhalb der Sessionwurzel bleiben gesperrt. Nach Plugin-Neuladen ohne beobachteten Prompt ist die Zuordnung nicht rückwirkend bewiesen.

Die weiteren Projektphasen – breitere Aussageabdeckung, begrenzte Korrektur, kontrolliertes Lernen und belastbarer Vorher/Nachher-Vergleich – bleiben offen. Der nächste fachliche Schritt ist die klar abgegrenzte Planung dieser Aussageabdeckung anhand normaler Antworten, ohne aus diesem Integrationstest bereits einen allgemeinen Qualitätsnachweis abzuleiten. Keine zusätzlichen Modelltests wurden dazu gestartet.

## Primärquellen

- [Session-Hookvertrag v2.1.4](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/plugin/src/promise/session.ts)
- [Read-Eingabe und Darstellung v2.1.4](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/core/src/tool/plugin/read.ts)
- [Abschlussereignis v2.1.4](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/schema/src/session-event.ts)

Maßgeblicher OpenCode-Tag-Commit: `68bc26b7da1990ce10ffecfbc1e09eb13aa5d824`. Die aktuelle Webdokumentation nennt zusätzlich APIs, die der Plugin-Adapter dieser installierten Version noch nicht anbietet.

## Repositoryabschluss

Der geprüfte Stand wurde lokal per Fast-Forward in den ursprünglichen `master` übernommen. Implementierung: `2694367`; Live-Prüfbericht: `ba3f898`; Übernahmestand vor abschliessender Dokumentation: `2edd88d`. Alle sechs aktiven Dateien stimmen bytegenau mit dem live geprüften Quellstand und dem Originalrepository überein. V1/V2 und Ledgerkern haben unveränderte Git-Inhalte. Kein Remote/Push. Die fünf ursprünglichen unversionierten Einträge sind erhalten; kein pauschal sauberer Arbeitsbaum behauptet. Fortlaufender Abschlussstand: `work/handoff/01a17768-341b-7c71-94be-70a5967cdc6e-working.md`.
