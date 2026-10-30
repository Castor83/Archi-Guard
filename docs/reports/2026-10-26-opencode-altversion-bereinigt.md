# Alte OpenCode-npm-Installation bereinigt

Am 26.10.2026 war `opencode-ai@1.19.4` tatsächlich noch global unter `C:\Users\USER\AppData\Roaming\npm\node_modules\opencode-ai` registriert. Die drei npm-Launcher unter `C:\Users\USER\AppData\Roaming\npm` hatten Vorrang im PATH. Das war kein bloßer Verweis auf eine schon entfernte Binary.

Die Desktop-Installation verwendet weiterhin 2.1.4. Die geprüften Desktop-/Startmenü-Verknüpfungen und `start-opencode-qwen.ps1` verwiesen bereits auf die Desktop-Anwendung. Im geprüften Umfang fand sich kein automatischer Wiederinstallationsbefehl. Ob eine frühere Entfernung die separate npm-Installation ausließ oder diese später zurückkam, ist nicht belegt.

Vor der Deinstallation wurde das vollständige Paket einschließlich seiner lokalen Abhängigkeiten und der drei bisherigen Launcher gesichert: `C:\Users\USER\.local\state\archi-guard\backups\npm-opencode-ai-1.19.4-20261026-102623`. Acht Paketdateien wurden per SHA256 gegen die Sicherung geprüft; Manifest `files.json` liegt dort. Die Sicherung ist nicht im PATH.

Gezielte Deinstallation mit npm, festem geprüftem Prefix und deaktivierten Paketskripten:

```powershell
npm uninstall --global --prefix 'C:\Users\USER\AppData\Roaming\npm' --ignore-scripts --no-audit --no-fund opencode-ai
```

Ergebnis: drei Pakete entfernt; `npm ls -g --depth=0 opencode-ai` meldet `(empty)`. Paketpfad und sämtliche drei alten npm-Launcher sind nicht mehr vorhanden.

Neue kleine Launcher unter `C:\Users\USER\.local\bin` verwenden ausschließlich `C:\Users\USER\AppData\Local\Programs\@opencodedesktop\resources\opencode-cli.exe`. Dieses Benutzerverzeichnis war bereits im PATH, daher war keine PATH-Änderung erforderlich. Es wurde keine weitere Binary kopiert oder installiert. Vorlagen: `scripts/launchers/opencode`, `opencode.cmd`, `opencode.ps1`.

Verifikation: `opencode --version` meldet in PowerShell und CMD jeweils `opencode v2.1.4`; der Git-Bash-Launcher ebenfalls. `Get-Command -All` und `where.exe opencode` zeigen ausschließlich die neuen Launcher. Die sechs globalen Archi-Guard-Dateien sind weiterhin bytegenau identisch zum live geprüften Integrationsstand. Keine Modellaufrufe, Prozessstarts der Oberfläche, Provideränderungen oder Änderungen an Sitzungsdaten durchgeführt. Keine Fremddateien entfernt.

Maschineller lokaler Bereinigungsbeleg: `C:\Users\USER\.local\state\archi-guard\opencode-cleanup-20261026.json`. Weitere Maßnahmen für diese Bereinigung sind nicht erforderlich.
