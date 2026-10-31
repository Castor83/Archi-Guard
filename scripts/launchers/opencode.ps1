$archiDesktopCli = Join-Path $env:LOCALAPPDATA 'Programs\@opencodedesktop\resources\opencode-cli.exe'
if (-not (Test-Path -LiteralPath $archiDesktopCli -PathType Leaf)) {
    throw 'OpenCode Desktop-CLI nicht gefunden'
}
if ($MyInvocation.ExpectingInput) {
    $input | & $archiDesktopCli @args
} else {
    & $archiDesktopCli @args
}
exit $LASTEXITCODE
