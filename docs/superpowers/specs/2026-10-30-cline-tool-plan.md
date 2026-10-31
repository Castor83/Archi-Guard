# Auftragsgebundene Werkzeugkorrektur

Nutzerfreigabe: „genau“ zur vorgeschlagenen beforeTool-Korrekturschleife:
falsche Aufrufe skip/reason; zwei Korrekturversuche, danach sichtbarer Stop;
kein Abschluss vor erfolgreichen Pflichtschritten.

Vorhanden: native Cline-Hooks, sichere persistente Korrekturbudgets und
Modellbindungen in global-plugin/correction.mjs, global installiertes Plugin.
Lücke: kein ausdrücklicher Werkzeugplan pro menschlichem Auftrag. Ergänzt
wird nur dessen Parser/Zustand und die Hookanbindung, kein neuer Dienst.

Ein echter Nutzerauftrag kann ARCHI_TOOL_PLAN_BEGIN / ARCHI_TOOL_PLAN_END
als eigene Zeilen um ein JSON-Objekt mit steps setzen. Jeder Schritt hat
exakt tool und input. Unterstützt werden die drei geprüften nativen Tools
read_files, search_codebase und run_commands. Input muss strukturell genau
übereinstimmen; Objekt-Reihenfolge ist egal, Array-Reihenfolge bleibt relevant.
Maximal acht Schritte und 16 KiB Plan. Ohne Plan gilt das bisherige Verhalten.
Kein Ableiten einer allgemeinen „richtigen“ Toolwahl aus freiem Text.

Fortschritt entsteht nur aus zugeordneten erfolgreichen afterTool-Ergebnissen,
nicht aus Modelltext. Falsches Tool/Argument wird nicht ausgeführt; skip nennt
den erwarteten Aufruf und den verbleibenden Versuch. Das vorhandene Budget
wird separat für Werkzeugkorrektur wiederverwendet, an Auftrag/Modell gebunden
und bei Reload nicht zurückgesetzt. Korrekte Aufrufe bleiben möglich.
Die dritte unterschiedliche Fehlwahl stoppt. Doppelauslieferung verbraucht
keinen zusätzlichen Versuch. Werkzeugfehler erfüllen keinen Pflichtschritt.

Neue echte Nutzernachricht setzt Planfortschritt und Lesebelege zurück.
Ein Reload beginnt konservativ mit null Fortschritt/Reads, behält jedoch das
Budget. Keine Übernahme von Plänen aus Hookkontext oder Werkzeugausgaben.
Vor Abschluss wird ein unvollständiger Plan sichtbar gestoppt. afterModel
unterstützt kein skip/retry für verfrühte reine Textabschlüsse; automatische
Korrektur ist hier ausschließlich für falsche Werkzeugaufrufe versprochen.

Keine neuen Modelle, Abhängigkeiten, Provideränderungen oder Hostpatches.
Globaler Installationspfad bleibt bestehen. Natürlicher Cline-Livetest ist
getrennt von Offline-/nativen Vertragstests; hookErrorMode ignore bleibt eine
bekannte Grenze allgemeiner Fail-closed-Garantien.
