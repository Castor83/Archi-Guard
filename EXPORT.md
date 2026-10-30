# Archi Guard: öffentlicher Quellstand

Stand: 30.10.2026. Exportierter Quellcommit: `7935d60`.

Dieser Export enthält 32 versionierte Quell-, Test-, Skript- und Dokumentationsdateien außerhalb der privaten Übergabe- und Laufzeitdaten. `PUBLIC-FILES.txt` nennt jede übernommene Datei. Persönliche lokale Benutzernamen sind in den Exportkopien durch `USER` ersetzt. Die private Git-Historie wird nicht veröffentlicht.

Das manuelle native Testskript `work/native-correction-test/Invoke-NativeCorrectionCheck.ps1` ist als Quelltext enthalten und wurde nicht ausgeführt. Seine historischen Ausführungsfreigaben gelten durch diesen Export nicht erneut. Ausgeschlossen sind die übrigen Inhalte von `work/` (Laufzeitdaten, Backups, lokale Belege und Sitzungsdaten), `HANDOFF_CURRENT.md`, `.superpowers/`, Caches und unversionierte lokale Referenz-/Ergebnisdateien. Historische Berichte verweisen teilweise auf diese nicht veröffentlichten lokalen Nachweise; diese Verweise sind keine mitgelieferten Belege. Wartungsskripte unter `maintenance/codex-hooks` sind historische Quellkopien; ihre Veröffentlichung aktiviert keine Hooks und bescheinigt keinen aktuellen Hostbetrieb.

Archi Guard enthält deterministische Belegprüfung, eine Python-Bridge und einen OpenCode-Adapter mit begrenzter Nachkorrektur. Freie Schlussfolgerungen bleiben semantisch ungeprüft; `freigabe` bleibt `NEIN`. Historische Testergebnisse in den Dokumenten sind keine aktuelle Gesamtabnahme.

Für diesen Export wurden Dateiumfang und Hashes abgeglichen, bekannte sensible Muster geprüft sowie Python-, JavaScript- und PowerShell-Syntax validiert. Es wurden keine Modelle, Dienste, Hooks oder Deployments gestartet. Funktionstests und eine neue Hostabnahme wurden nicht durchgeführt.
