#requires -Version 7.4
[CmdletBinding()]
param([string]$Destination = (Join-Path $env:USERPROFILE '.local\share\archi-guard\cline-staging'))
$ErrorActionPreference = 'Stop'
$source = Split-Path $PSScriptRoot -Parent
$target = [IO.Path]::GetFullPath($Destination)
if ($target -match '(?i)[\\/]\.cline[\\/]plugins(?:[\\/]|$)|[\\/]Cline[\\/](Plugins|Hooks)(?:[\\/]|$)') {
    throw 'Automatic plugin/hook discovery targets are refused until the native host contract is verified.'
}
if ($target.StartsWith('\\') -or $target -eq [IO.Path]::GetPathRoot($target)) { throw 'Local dedicated staging folder required' }
for ($ancestor = $target; $ancestor; $ancestor = Split-Path $ancestor -Parent) {
    if ((Test-Path -LiteralPath $ancestor) -and (Get-Item -LiteralPath $ancestor -Force).LinkType) { throw 'Linked staging path refused' }
    if ($ancestor -eq [IO.Path]::GetPathRoot($ancestor)) { break }
}
$files = @('cline-plugin/index.mjs', 'cline-plugin/tool-plan.mjs', 'global-plugin/runtime.mjs', 'global-plugin/core.mjs',
    'global-plugin/correction.mjs', 'archi_bridge_v2.py', 'archi_belegpruefer_v1_1.py', 'archi_schlusspruefer_v2.py')
$backup = $target + '.backup-' + [guid]::NewGuid().ToString('N')
$written = @()
try {
    foreach ($name in $files) {
        $from = Join-Path $source $name
        $to = Join-Path $target $name
        if (-not (Test-Path -LiteralPath $from -PathType Leaf) -or (Get-Item -LiteralPath $from).LinkType) { throw 'Regular source file required' }
        $parent = Split-Path $to -Parent
        if (Test-Path -LiteralPath $parent) {
            if ((Get-Item -LiteralPath $parent).LinkType) { throw 'Linked target folder refused' }
        }
        if (Test-Path -LiteralPath $to) {
            if (-not (Test-Path -LiteralPath $to -PathType Leaf) -or (Get-Item -LiteralPath $to).LinkType) { throw 'Regular target file required' }
            $saved = Join-Path $backup $name
            [IO.Directory]::CreateDirectory((Split-Path $saved -Parent)) | Out-Null
            Copy-Item -LiteralPath $to -Destination $saved
        }
        [IO.Directory]::CreateDirectory($parent) | Out-Null
        $written += $name
        Copy-Item -LiteralPath $from -Destination $to -Force
        if ((Get-FileHash -LiteralPath $from).Hash -ne (Get-FileHash -LiteralPath $to).Hash) { throw 'Read-back hash mismatch' }
    }
    @{status='STAGED_NOT_ACTIVE'; destination=$target; files=$files.Count; backup=$backup;
      reason='Native IDE discovery, fail-closed hook policy and live host acceptance remain unverified.'} | ConvertTo-Json -Compress
} catch {
    foreach ($name in $written) {
        $saved = Join-Path $backup $name
        $to = Join-Path $target $name
        if (Test-Path -LiteralPath $saved) { Copy-Item -LiteralPath $saved -Destination $to -Force }
        elseif (Test-Path -LiteralPath $to) { Remove-Item -LiteralPath $to -Force }
    }
    throw
}
