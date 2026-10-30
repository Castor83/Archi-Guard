[CmdletBinding()]
param(
    [string]$TargetDirectory = (Join-Path $env:USERPROFILE '.config\opencode\plugins\archi-guard'),
    [string]$BackupRoot = (Join-Path $env:USERPROFILE '.local\state\archi-guard\backups'),
    [string]$RestoreBackup
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$target = [IO.Path]::GetFullPath($TargetDirectory).TrimEnd('\')
$backupBase = [IO.Path]::GetFullPath($BackupRoot).TrimEnd('\')
$files = @(
    @{ Name = 'index.ts'; Source = 'global-plugin\index.ts' },
    @{ Name = 'core.mjs'; Source = 'global-plugin\core.mjs' },
    @{ Name = 'runtime.mjs'; Source = 'global-plugin\runtime.mjs' },
    @{ Name = 'correction.mjs'; Source = 'global-plugin\correction.mjs' },
    @{ Name = 'archi_bridge_v2.py'; Source = 'archi_bridge_v2.py' },
    @{ Name = 'archi_belegpruefer_v1_1.py'; Source = 'archi_belegpruefer_v1_1.py' },
    @{ Name = 'archi_schlusspruefer_v2.py'; Source = 'archi_schlusspruefer_v2.py' }
)
function Assert-RegularPath([string]$Path) {
    if ((Test-Path -LiteralPath $Path) -and ((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Verknuepfungen als Synchronisationsziel nicht erlaubt'
    }
}
Assert-RegularPath $target
foreach ($file in $files) { Assert-RegularPath (Join-Path $target $file.Name) }

function Restore-Manifest([string]$Folder, $Manifest) {
    if ($Manifest.TargetDirectory -ne $target) { throw 'Backup gehoert nicht zum Zielordner' }
    foreach ($entry in $Manifest.Files) {
        if ($entry.Name -notin $files.Name) { throw 'Unbekannter Dateiname im Backup' }
        $dest = Join-Path $target $entry.Name
        if ($entry.HadOriginal) {
            $old = Join-Path (Join-Path $Folder 'old') $entry.Name
            if ((Get-FileHash -LiteralPath $old).Hash -ne $entry.OldHash) { throw 'Backupdatei stimmt nicht mit Manifest ueberein' }
            Copy-Item -LiteralPath $old -Destination $dest -Force
            if ((Get-FileHash -LiteralPath $dest).Hash -ne $entry.OldHash) { throw 'Wiederherstellung nicht verifiziert' }
        } elseif (Test-Path -LiteralPath $dest -PathType Leaf) {
            # Nur die sieben oben festgelegten Einzeldateien; kein rekursives Entfernen.
            Remove-Item -LiteralPath $dest -Force
        }
    }
}

if ($RestoreBackup) {
    $folder = [IO.Path]::GetFullPath($RestoreBackup)
    $manifest = Get-Content -LiteralPath (Join-Path $folder 'manifest.json') -Raw | ConvertFrom-Json
    Restore-Manifest $folder $manifest
    [pscustomobject]@{ Restored = $true; TargetDirectory = $target; BackupPath = $folder }
    return
}
if ($backupBase.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase) -or $backupBase -eq $target) {
    throw 'Backups muessen ausserhalb des automatisch geladenen Pluginordners liegen'
}
foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $repo $file.Source) -PathType Leaf)) { throw 'Quelldatei fehlt' }
}
$folder = Join-Path $backupBase ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path (Join-Path $folder 'old'), (Join-Path $folder 'new') -Force | Out-Null
New-Item -ItemType Directory -Path $target -Force | Out-Null
$entries = foreach ($file in $files) {
    $dest = Join-Path $target $file.Name
    $staged = Join-Path (Join-Path $folder 'new') $file.Name
    Copy-Item -LiteralPath (Join-Path $repo $file.Source) -Destination $staged
    $exists = Test-Path -LiteralPath $dest -PathType Leaf
    $oldHash = $null
    if ($exists) {
        Copy-Item -LiteralPath $dest -Destination (Join-Path (Join-Path $folder 'old') $file.Name)
        $oldHash = (Get-FileHash -LiteralPath $dest).Hash
    }
    [pscustomobject]@{ Name = $file.Name; HadOriginal = $exists; OldHash = $oldHash; NewHash = (Get-FileHash -LiteralPath $staged).Hash }
}
$manifest = [pscustomobject]@{ SchemaVersion = 1; CreatedUtc = [DateTime]::UtcNow.ToString('o'); TargetDirectory = $target; Files = @($entries) }
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $folder 'manifest.json') -Encoding utf8
try {
    foreach ($entry in $entries) {
        $dest = Join-Path $target $entry.Name
        Copy-Item -LiteralPath (Join-Path (Join-Path $folder 'new') $entry.Name) -Destination $dest -Force
        if ((Get-FileHash -LiteralPath $dest).Hash -ne $entry.NewHash) { throw 'Uebertragene Datei stimmt nicht mit Quelle ueberein' }
    }
} catch {
    Restore-Manifest $folder $manifest
    throw
}
[pscustomobject]@{ Restored = $false; TargetDirectory = $target; BackupPath = $folder; VerifiedFiles = $entries.Count }
