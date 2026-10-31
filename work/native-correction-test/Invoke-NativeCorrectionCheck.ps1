#requires -Version 7.4
<#
Prepare/review this file before running it. Running it consumes the ONE authorized
native check: one user prompt, at most two Guard-generated corrections, no retry.
The -PreflightOnly switch stops before reserving the one-shot marker or admitting a prompt.
No model/provider changes, downloads, model unloads, global reloads or service registration.

Pinned OpenCode 2.1.4 source: 68bc26b7da1990ce10ffecfbc1e09eb13aa5d824.
  packages/cli/src/server-process.ts:63-68,111-128,140-154,200-207
    Default serve remains alive; --service alone registers a service.
  packages/cli/src/database-path.ts:2-10 supports OPENCODE_DB=:memory:.
  packages/core/src/config/plugin/policy.ts:40-65 and plugin/module.ts:49-56
    integration.use also gates local plugins; this fixture leaves that loader policy unchanged.
    tool.use matches `${action}:${resource}`.
  packages/core/src/file-access.ts:83-93,137-145 uses location-relative read resources.
  packages/schema/src/config/agent.ts:21 supports steps=3.
  packages/protocol/src/groups/{agent,plugin,session,permission}.ts defines the REST routes.
  packages/cli/src/run/noninteractive.ts:522,730-755 ends at the first succeeded/idle;
    therefore this harness deliberately keeps a separate default serve alive.

This is a bounded function check, not evidence of general model quality or semantic approval.
Native reasoning parts and unfiltered backend output are never exported by this harness.
#>
[CmdletBinding()]
param([switch]$PreflightOnly)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$expectedModel = 'ollama/hf.co/unsloth/Qwen3.8-27B-GGUF:UD-Q3_K_XL'
$agentID = 'archi-guard-native'
$globalPath = Join-Path $env:USERPROFILE '.config\opencode\opencode.json'
$activePlugin = Join-Path $env:USERPROFILE '.config\opencode\plugins\archi-guard'
$auditPath = Join-Path $env:USERPROFILE '.local\state\archi-guard\audits.jsonl'
$budgetDirectory = Join-Path (Split-Path $auditPath -Parent) 'corrections'
$cli = Join-Path $env:LOCALAPPDATA 'Programs\@opencodedesktop\resources\opencode-cli.exe'
$runID = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$runDirectory = Join-Path $PSScriptRoot ('run-' + $runID)
$resultPath = Join-Path $runDirectory 'result.json'
$statusPath = Join-Path $runDirectory 'status.jsonl'
$contextPath = Join-Path $runDirectory 'context.filtered.json'
$ownAuditsPath = Join-Path $runDirectory 'audits.own.jsonl'
$budgetPath = $null
$server = $null
$serverStart = $null
$headers = $null
$password = $null
$sessionID = $null
$promptID = $null
$baseURL = $null
$script:stdoutRead = $null
$script:stderrRead = $null
$script:auditOffset = 0L
$script:auditCarry = ''
$script:auditDecoder = [Text.Encoding]::UTF8.GetDecoder()
$script:ownAudits = [Collections.Generic.List[object]]::new()
$script:filteredContext = @()
$started = [DateTimeOffset]::UtcNow
$deadline = $started.AddMinutes(8)
$result = [ordered]@{
    schema = 1; runID = $runID; status = 'PREPARING'; phase = 'preflight'
    startedUtc = $started.ToString('o'); finishedUtc = $null
    promptDispatches = 0; dispatchOutcome = 'NOT_DISPATCHED'; sessionID = $null; promptID = $null
    model = $expectedModel; maximumCorrections = 2; correctionCount = 0
    originalTrigger = $false; lastAnswerHash = $null; terminalGuardStatus = $null
    toolCount = 0; fixtureReadCount = 0; unexpectedToolCount = 0; modelBindingPreserved = $null
    ownServePID = $null; ownServeStopped = $null; backendLinesDiscarded = 0
    isolatedDatabase = ':memory:'; reasoningExported = $false
    globalConfigUnchanged = $null; fixtureUnchanged = $null; pluginHashes = @(); permissionDecisions = @()
    registeredAgent = $null; guardRegistration = $null; preDispatchSession = $null
    budget = $null; failurePhase = $null; failureType = $null; assertionCode = $null
    preflightOnly = [bool]$PreflightOnly; lastApiRoute = $null; lastHttpStatus = $null
    failedApiRoute = $null; failedHttpStatus = $null; agentDiagnostic = $null
    evidence = [ordered]@{ directory = $runDirectory; result = $resultPath
        context = $contextPath; audits = $ownAuditsPath; status = $statusPath }
}

function Write-Utf8([string]$Path, [string]$Text) {
    [IO.File]::WriteAllText($Path, $Text, [Text.UTF8Encoding]::new($false))
}
function Hash-Text([string]$Text) {
    [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Text))).ToLowerInvariant()
}
function Write-Status([string]$Phase) {
    $result.phase = $Phase
    $line = @{ time = [DateTimeOffset]::UtcNow.ToString('o'); phase = $Phase
        dispatches = $result.promptDispatches; corrections = $result.correctionCount
        audits = $script:ownAudits.Count } | ConvertTo-Json -Compress
    [IO.File]::AppendAllText($statusPath, $line + "`n", [Text.UTF8Encoding]::new($false))
    Write-Host ('STATUS={0}; dispatches={1}; corrections={2}; audits={3}' -f
        $Phase, $result.promptDispatches, $result.correctionCount, $script:ownAudits.Count)
}
function Assert-Check([bool]$Condition, [string]$Code) {
    if (-not $Condition) {
        $failure = [InvalidOperationException]::new($Code)
        $failure.Data['ArchiAssertionCode'] = $Code
        throw $failure
    }
}
function Api([string]$Method, [string]$Route, $Body = $null) {
    Assert-Check (-not ($PreflightOnly -and $Method -eq 'Post' -and $Route -match '/prompt(?:\?|$)')) 'PREFLIGHT_PROMPT_FORBIDDEN'
    $result.lastApiRoute = $Method.ToUpperInvariant() + ' ' + (($Route -split '\?', 2)[0] -replace '/ses_[^/]+', '/{sessionID}')
    $result.lastHttpStatus = $null
    $remaining = [int][Math]::Floor(($deadline - [DateTimeOffset]::UtcNow).TotalSeconds)
    Assert-Check ($remaining -gt 0) 'DEADLINE'
    $arguments = @{ Method = $Method; Uri = $baseURL + $Route; Headers = $headers
        TimeoutSec = [Math]::Min(10, $remaining); MaximumRedirection = 0; NoProxy = $true
        ErrorAction = 'Stop' }
    if ($null -ne $Body) {
        $arguments.ContentType = 'application/json; charset=utf-8'
        $arguments.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 25 -Compress))
    }
    # Do not print requests, auth headers, raw responses or exception bodies.
    try {
        $response = Invoke-RestMethod @arguments -StatusCodeVariable httpStatus
        $result.lastHttpStatus = [int]$httpStatus
        return $response
    } catch {
        if ($_.Exception.Response) { $result.lastHttpStatus = [int]$_.Exception.Response.StatusCode }
        $result.failedApiRoute = $result.lastApiRoute
        $result.failedHttpStatus = $result.lastHttpStatus
        # Never persist ErrorDetails.Message: a raw HTTP response remains in RAM only.
        throw
    }
}
function Pump-ServerOutput {
    # Pipe data is consumed in RAM. Only the validated startup URL is retained.
    foreach ($channel in @('stdout', 'stderr')) {
        $task = if ($channel -eq 'stdout') { $script:stdoutRead } else { $script:stderrRead }
        for ($i = 0; $i -lt 200 -and $null -ne $task -and $task.IsCompleted; $i++) {
            try { $line = $task.GetAwaiter().GetResult() } catch { $line = $null }
            if ($null -eq $line) { $task = $null; break }
            if ($channel -eq 'stdout' -and $line -match '^server listening on (http://127\.0\.0\.1:[0-9]+)/?$') {
                $script:baseURL = $Matches[1]
            } else { $result.backendLinesDiscarded++ }
            $task = if ($channel -eq 'stdout') { $server.StandardOutput.ReadLineAsync() } else { $server.StandardError.ReadLineAsync() }
        }
        if ($channel -eq 'stdout') { $script:stdoutRead = $task } else { $script:stderrRead = $task }
    }
}
function Get-ModelKey($Model) {
    if ($null -eq $Model) { return '' }
    $variant = if ($Model.variant) { [string]$Model.variant } else { 'default' }
    return ([ordered]@{ providerID = [string]$Model.providerID; id = [string]$Model.id; variant = $variant } | ConvertTo-Json -Compress)
}
function Read-OwnAudits {
    if (-not (Test-Path -LiteralPath $auditPath -PathType Leaf)) { return }
    $stream = [IO.File]::Open($auditPath, [IO.FileMode]::Open, [IO.FileAccess]::Read,
        [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
    try {
        Assert-Check ($stream.Length -ge $script:auditOffset) 'AUDIT_TRUNCATED'
        [void]$stream.Seek($script:auditOffset, [IO.SeekOrigin]::Begin)
        $buffer = [byte[]]::new(65536)
        while (($count = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $chars = [char[]]::new([Text.Encoding]::UTF8.GetMaxCharCount($count))
            $decoded = $script:auditDecoder.GetChars($buffer, 0, $count, $chars, 0, $false)
            $script:auditCarry += [string]::new($chars, 0, $decoded)
            $script:auditOffset += $count
        }
    } finally { $stream.Dispose() }
    while (($newline = $script:auditCarry.IndexOf("`n")) -ge 0) {
        $line = $script:auditCarry.Substring(0, $newline).TrimEnd("`r")
        $script:auditCarry = $script:auditCarry.Substring($newline + 1)
        if (-not $line.Trim()) { continue }
        try { $audit = $line | ConvertFrom-Json -AsHashtable } catch { continue }
        if ($audit.session_sha256 -eq (Hash-Text $sessionID) -and
            $audit.prompt_id_sha256 -eq (Hash-Text $promptID)) {
            $script:ownAudits.Add($audit)
            [IO.File]::AppendAllText($ownAuditsPath, $line + "`n", [Text.UTF8Encoding]::new($false))
        }
    }
}
function Save-FilteredContext($Messages) {
    $safe = [Collections.Generic.List[object]]::new()
    foreach ($message in $Messages) {
        if ($message.type -eq 'assistant') {
            $text = (@($message.content | Where-Object type -EQ 'text' | ForEach-Object { [string]$_.text }) -join "`n")
            $tools = @($message.content | Where-Object type -EQ 'tool' | ForEach-Object {
                $readPath = if ($_.state.input.path) { [string]$_.state.input.path } else { '' }
                $pathMatches = $false
                if ($readPath) {
                    try { $pathMatches = [IO.Path]::GetFullPath((Join-Path $runDirectory $readPath)) -eq $fixturePath } catch {}
                    if ([IO.Path]::IsPathRooted($readPath)) {
                        try { $pathMatches = [IO.Path]::GetFullPath($readPath) -eq $fixturePath } catch {}
                    }
                }
                [ordered]@{ id = $_.id; name = $_.name; status = $_.state.status
                    fixturePathMatches = $pathMatches; executed = $_.executed
                    archiGuardObserved = $_.state.metadata.archi_guard_observed }
            })
            $safe.Add([ordered]@{ id = $message.id; type = 'assistant'; agent = $message.agent
                model = $message.model; finish = $message.finish; completed = $message.time.completed
                text = $text; textSha256 = Hash-Text $text; tools = $tools })
        } elseif ($message.type -eq 'synthetic') {
            $safe.Add([ordered]@{ id = $message.id; type = 'synthetic'
                metadata = [ordered]@{ archi_guard_correction = $message.metadata.archi_guard_correction
                    schema_version = $message.metadata.schema_version; prompt_id_sha256 = $message.metadata.prompt_id_sha256
                    answer_sha256 = $message.metadata.answer_sha256; versuch = $message.metadata.versuch
                    maximum = $message.metadata.maximum } })
        } elseif ($message.type -eq 'user') {
            $safe.Add([ordered]@{ id = $message.id; type = 'user'; isOriginalPrompt = ($message.id -eq $promptID) })
        } elseif ($message.type -eq 'idle') {
            $safe.Add([ordered]@{ id = $message.id; type = 'idle'; outcome = $message.outcome })
        }
        # Never serialize reasoning, system/skill text, provider native data or raw tool results.
    }
    $script:filteredContext = @($safe.ToArray())
    Write-Utf8 $contextPath (ConvertTo-Json -InputObject $script:filteredContext -Depth 20)
}

# The durable one-shot marker is reserved immediately before dispatch, after preflight.
$markerPath = Join-Path $PSScriptRoot 'native-check-invocation.lock'
[void][IO.Directory]::CreateDirectory($runDirectory)
Write-Utf8 $ownAuditsPath ''
Write-Status 'preflight'
$globalHash = $null
try {
    Assert-Check (Test-Path -LiteralPath $cli -PathType Leaf) 'CLI_MISSING'
    $globalHash = (Get-FileHash -LiteralPath $globalPath -Algorithm SHA256).Hash
    $globalConfig = Get-Content -LiteralPath $globalPath -Raw | ConvertFrom-Json -AsHashtable
    Assert-Check ($globalConfig.model -eq $expectedModel) 'CONFIG_MODEL_CHANGED'
    Assert-Check ($globalConfig.providers.ollama.settings.baseURL -eq 'http://127.0.0.1:11434/v1') 'PROVIDER_ENDPOINT_CHANGED'
    $model = [ordered]@{ providerID = 'ollama'; id = $expectedModel.Substring('ollama/'.Length) }
    $modelKey = Get-ModelKey $model
    $modelHash = Hash-Text $modelKey
    $files = [ordered]@{ 'index.ts' = 'global-plugin\index.ts'; 'core.mjs' = 'global-plugin\core.mjs'
        'runtime.mjs' = 'global-plugin\runtime.mjs'; 'correction.mjs' = 'global-plugin\correction.mjs'
        'archi_bridge_v2.py' = 'archi_bridge_v2.py'; 'archi_belegpruefer_v1_1.py' = 'archi_belegpruefer_v1_1.py'
        'archi_schlusspruefer_v2.py' = 'archi_schlusspruefer_v2.py' }
    foreach ($name in $files.Keys) {
        $sourceHash = (Get-FileHash -LiteralPath (Join-Path $repo $files[$name]) -Algorithm SHA256).Hash
        $deployedHash = (Get-FileHash -LiteralPath (Join-Path $activePlugin $name) -Algorithm SHA256).Hash
        Assert-Check ($sourceHash -eq $deployedHash) 'PLUGIN_NOT_SYNCHRONIZED'
        $result.pluginHashes += @{ name = $name; sha256 = $sourceHash.ToLowerInvariant() }
    }

    $fixturePath = Join-Path $runDirectory 'fixture.js'
    $fixtureLine = 'export const ARCHI_NATIVE_FIXTURE = "ORIGINAL_WERT";'
    Write-Utf8 $fixturePath ($fixtureLine + "`n")
    $fixtureHash = (Get-FileHash -LiteralPath $fixturePath -Algorithm SHA256).Hash
    $rules = @(@{ action = '*'; resource = '*'; effect = 'deny' },
        @{ action = 'read'; resource = 'fixture.js'; effect = 'allow' })
    $fixtureConfig = [ordered]@{
        default_agent = $agentID; update = 'disable'; share = 'disabled'; snapshots = $false
        websearch = $false; lsp = $false; formatter = $false; warming = $false
        permissions = $rules
        agents = @{ $agentID = @{ description = 'Ein begrenzter lokaler Guard-Funktionstest'
            mode = 'primary'; steps = 3; permissions = $rules } }
        policies = @(@{ action = 'tool.use'; resource = '*'; effect = 'deny' },
            @{ action = 'tool.use'; resource = 'read:fixture.js'; effect = 'allow' })
    }
    Write-Utf8 (Join-Path $runDirectory 'opencode.json') ($fixtureConfig | ConvertTo-Json -Depth 15)
    $control = @(@{ id = 'M1'; quelle = 'review'; behauptung = 'Kontrollbefund fuer eine absichtlich falsche Literalregel.'
        behaupteter_status = 'VERMUTUNG'; belege = @(@{ id = 'B1'; datei = $fixturePath; zeile = 1; zitat = $fixtureLine })
        pflichtbelege = @('B1'); fakten = @(@{ typ = 'QUELLZEILE_ENTHAELT'; beleg_id = 'B1'; literal = 'ABSICHTLICH_FALSCHER_WERT' }) })
    $controlJson = ConvertTo-Json -InputObject $control -Depth 10 -Compress
    $prompt = @"
Dies ist genau ein autorisierter technischer Kontrollauftrag fuer Archi Guard.
Lies genau einmal mit read diese eigene harmlose Datei: $fixturePath
Keine weiteren Reads, Werkzeuge, Dateioperationen, Recherche oder Unteragenten.
Die erste Antwort soll nur einen kurzen Hinweis auf den absichtlich fehlerhaften Kontrollbefund und diesen exakt vorgegebenen Datenblock enthalten. Das falsche Literal ist als kontrollierter Trigger beabsichtigt; passe es in der ERSTEN Antwort nicht an. Zitat und Zeile muessen den gelesenen Originalinhalt exakt wiedergeben.
ARCHI_AUDIT_JSON_BEGIN
$controlJson
ARCHI_AUDIT_JSON_END
Falls danach eine synthetische Archi-Guard-Nachkorrektur eingeht: Befolge sie ohne neue Werkzeuge; korrigiere die falsche Literalregel anhand des bereits gelesenen Originals und behalte den Datenblock bei. Kein weiterer Benutzerauftrag ist erforderlich. Semantische Freigabe bleibt NEIN.
"@
    Write-Utf8 (Join-Path $runDirectory 'prompt.own.txt') $prompt
    if (Test-Path -LiteralPath $auditPath -PathType Leaf) { $script:auditOffset = (Get-Item -LiteralPath $auditPath).Length }

    Write-Status 'start-own-serve'
    $password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $serverStart = [Diagnostics.ProcessStartInfo]::new($cli)
    $serverStart.UseShellExecute = $false; $serverStart.CreateNoWindow = $true
    $serverStart.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $serverStart.RedirectStandardOutput = $true; $serverStart.RedirectStandardError = $true
    $serverStart.WorkingDirectory = $runDirectory
    foreach ($argument in @('serve', '--hostname', '127.0.0.1', '--port', '0')) { $serverStart.ArgumentList.Add($argument) }
    $serverStart.Environment['OPENCODE_PASSWORD'] = $password
    [void]$serverStart.Environment.Remove('OPENCODE_SERVER_PASSWORD')
    $serverStart.Environment['OPENCODE_DISABLE_MODELS_FETCH'] = '1'
    $serverStart.Environment['OPENCODE_DB'] = ':memory:'
    $serverStart.Environment['OPENCODE_PRINT_LOGS'] = '0'
    foreach ($injected in @('OPENCODE_CONFIG', 'OPENCODE_CONFIG_CONTENT', 'OPENCODE_CONFIG_DIR', 'OPENCODE_SIMULATE')) {
        [void]$serverStart.Environment.Remove($injected)
    }
    # Own process, own in-memory sessions; global config/provider/plugin files are merely loaded.
    $server = [Diagnostics.Process]::Start($serverStart)
    $result.ownServePID = $server.Id
    $script:stdoutRead = $server.StandardOutput.ReadLineAsync()
    $script:stderrRead = $server.StandardError.ReadLineAsync()
    $readyDeadline = [DateTimeOffset]::UtcNow.AddSeconds(40)
    while (-not $baseURL -and [DateTimeOffset]::UtcNow -lt $readyDeadline) {
        Pump-ServerOutput
        Assert-Check (-not $server.HasExited) 'SERVE_EXITED_BEFORE_READY'
        Start-Sleep -Milliseconds 150
    }
    Assert-Check ([bool]$baseURL) 'SERVE_NOT_READY'
    $headers = @{ Authorization = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('opencode:' + $password)) }
    $info = Api 'Get' '/api/info'
    $version = if ($info.version) { $info.version } else { $info.data.version }
    Assert-Check ($version -eq '2.1.4') 'HOST_VERSION_MISMATCH'

    Write-Status 'verify-host-contract'
    $query = '?location%5Bdirectory%5D=' + [Uri]::EscapeDataString($runDirectory)
    # The first single-agent GET returned 404 although subsequent native list/config
    # GETs confirmed this exact ID. Use the supported list endpoint and select the
    # exact configured ID; a startup/readiness explanation remains unconfirmed.
    $registrationDeadline = [DateTimeOffset]::UtcNow.AddSeconds(5)
    $ownAgents = @()
    $plugins = @()
    do {
        $inventory = Api 'Get' ('/api/agent' + $query)
        Assert-Check ($inventory.location.directory -eq $runDirectory) 'AGENT_LOCATION_MISMATCH'
        $ownAgents = @($inventory.data | Where-Object { $_.id -ceq $agentID })
        $plugins = (Api 'Get' ('/api/plugin' + $query)).data
        # Pinned public Plugin.Info: optional id; state.status is active or failed.
        # A load failure can omit id, so identify only our exact deployed local source
        # for diagnostics. Source matching never authorizes a missing/mismatched id.
        $ownGuardEntries = @($plugins | Where-Object {
            if ($_.id -ceq 'archi.guard.global') { return $true }
            if ($_.source.type -ne 'local' -or -not $_.source.path) { return $false }
            try {
                $sourcePath = [IO.Path]::GetFullPath([string]$_.source.path)
                return $sourcePath -eq $activePlugin -or $sourcePath -eq (Join-Path $activePlugin 'index.ts')
            } catch { return $false }
        })
        $result.guardRegistration = @{ expectedStatusField = 'state.status'; matchedCount = $ownGuardEntries.Count
            entries = @($ownGuardEntries | ForEach-Object {
                $errorText = [string]$_.state.error
                $errorType = if ($errorText -match '\b(TypeError|ReferenceError|SyntaxError|RangeError|Error)\b') { $Matches[1] }
                    elseif ($errorText) { 'UNCLASSIFIED' } else { $null }
                @{ id = $_.id; status = $(if ($_.state.status -in @('active', 'failed')) { $_.state.status } else { 'UNEXPECTED' })
                    fieldNames = @($_.PSObject.Properties.Name); stateFieldNames = @($_.state.PSObject.Properties.Name)
                    errorType = $errorType; errorSha256 = $(if ($errorText) { Hash-Text $errorText } else { $null }) }
            }) }
        $guardActive = @($plugins | Where-Object { $_.id -eq 'archi.guard.global' -and $_.state.status -eq 'active' }).Count -eq 1
        if ($ownAgents.Count -eq 1 -and $guardActive) { break }
        Start-Sleep -Milliseconds 100
    } while ([DateTimeOffset]::UtcNow -lt $registrationDeadline)
    $result.agentDiagnostic = @{ listedOwnAgent = @($ownAgents | Select-Object id, name, mode, steps) }
    Assert-Check ($ownAgents.Count -eq 1) 'AGENT_NOT_REGISTERED'
    $agent = $ownAgents[0]
    Assert-Check ($agent.id -eq $agentID -and $agent.mode -eq 'primary' -and $agent.steps -eq 3) 'AGENT_NOT_REGISTERED'
    # Public effective /permission decisions below are authoritative. The host may
    # append/normalize agent rules; an assumed raw-array position proves no effect.
    Assert-Check $guardActive 'GUARD_NOT_ACTIVE'
    $result.registeredAgent = @{ id = $agent.id; name = $agent.name; mode = $agent.mode; steps = $agent.steps }
    $created = (Api 'Post' '/api/session' @{ title = 'Archi Guard bounded native check ' + $runID
        agent = $agentID; model = $model; location = @{ directory = $runDirectory } }).data
    $sessionID = $created.id; $result.sessionID = $sessionID
    Assert-Check ([bool]$sessionID) 'SESSION_NOT_CREATED'
    $session = (Api 'Get' ('/api/session/' + $sessionID)).data
    Assert-Check ($session.agent -eq $agentID -and $session.location.directory -eq $runDirectory -and
        -not $session.parentID -and (Get-ModelKey $session.model) -eq $modelKey) 'SESSION_BINDING_MISMATCH'
    foreach ($case in @(@{ action = 'read'; resource = 'fixture.js'; expected = 'allow' },
        @{ action = 'read'; resource = 'other.js'; expected = 'deny' },
        @{ action = 'edit'; resource = 'fixture.js'; expected = 'deny' },
        @{ action = 'shell'; resource = 'echo ARCHI_FORBIDDEN'; expected = 'deny' },
        @{ action = 'external_directory'; resource = 'C:/*'; expected = 'deny' })) {
        $decision = (Api 'Post' ('/api/session/' + $sessionID + '/permission') @{
            action = $case.action; resources = @($case.resource); save = @(); agent = $agentID }).data
        $result.permissionDecisions += @{ action = $case.action; resource = $case.resource; effect = $decision.effect }
        Assert-Check ($decision.effect -eq $case.expected) 'NATIVE_PERMISSION_MISMATCH'
    }
    Assert-Check ((Get-FileHash -LiteralPath $globalPath).Hash -eq $globalHash) 'GLOBAL_CONFIG_CHANGED_BEFORE_DISPATCH'
    # Last no-inference binding check immediately before the sole POST /prompt.
    $session = (Api 'Get' ('/api/session/' + $sessionID)).data
    Assert-Check ($session.agent -eq $agentID -and (Get-ModelKey $session.model) -eq $modelKey) 'MODEL_CHANGED_BEFORE_DISPATCH'
    $result.preDispatchSession = @{ id = $sessionID; agent = $session.agent; model = $session.model
        location = $session.location.directory; parentID = $session.parentID }

    if ($PreflightOnly) {
        $result.status = 'PASS_PREFLIGHT_NO_INFERENCE'
        Write-Status 'preflight-only-complete'
        return
    }
    Write-Status 'single-prompt-dispatch'
    # Never remove or reuse an existing marker. A failed preflight creates none;
    # any admission attempt, including an unknown transport outcome, consumes it.
    $marker = [IO.File]::Open($markerPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $markerBytes = [Text.Encoding]::UTF8.GetBytes($runDirectory + "`n")
        $marker.Write($markerBytes); $marker.Flush($true)
    } finally { $marker.Dispose() }
    $result.promptDispatches = 1; $result.dispatchOutcome = 'REQUEST_STARTED_DO_NOT_RETRY'
    Write-Utf8 $resultPath ($result | ConvertTo-Json -Depth 20)
    # No retry around this call: a transport timeout is an unknown admission, not permission to resend.
    $admission = (Api 'Post' ('/api/session/' + $sessionID + '/prompt') @{ text = $prompt }).data
    $promptID = $admission.id; $result.promptID = $promptID
    Assert-Check ([bool]$promptID) 'PROMPT_ADMISSION_UNKNOWN'
    $result.dispatchOutcome = 'ADMITTED'
    $taskHash = Hash-Text (ConvertTo-Json -InputObject @($sessionID, $promptID) -Compress)
    $budgetPath = Join-Path $budgetDirectory ($taskHash + '.json')
    Write-Status 'await-guard-terminal'
    $lastCounts = ''
    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        Pump-ServerOutput
        Assert-Check (-not $server.HasExited) 'OWN_SERVE_EXITED'
        $messages = @((Api 'Get' ('/api/session/' + $sessionID + '/context')).data)
        Save-FilteredContext $messages
        Read-OwnAudits
        $allSynthetic = @($messages | Where-Object type -EQ 'synthetic')
        $synthetic = @($allSynthetic | Where-Object { $_.metadata.archi_guard_correction -eq $true })
        $result.correctionCount = $synthetic.Count
        Assert-Check ($allSynthetic.Count -eq $synthetic.Count -and $synthetic.Count -le 2) 'SYNTHETIC_BUDGET_VIOLATION'
        foreach ($item in $synthetic) {
            Assert-Check ($item.metadata.prompt_id_sha256 -eq (Hash-Text $promptID) -and
                $item.metadata.maximum -eq 2 -and $item.metadata.versuch -in @(1, 2)) 'SYNTHETIC_BINDING_MISMATCH'
        }
        $assistants = @($script:filteredContext | Where-Object type -EQ 'assistant')
        $result.modelBindingPreserved = @($assistants | Where-Object { (Get-ModelKey $_.model) -ne $modelKey }).Count -eq 0
        Assert-Check $result.modelBindingPreserved 'ASSISTANT_MODEL_CHANGED'
        $tools = @($assistants | ForEach-Object { $_.tools })
        $result.toolCount = $tools.Count
        $result.fixtureReadCount = @($tools | Where-Object { $_.name -eq 'read' -and $_.status -eq 'completed' -and $_.fixturePathMatches }).Count
        $result.unexpectedToolCount = @($tools | Where-Object { $_.name -ne 'read' -or -not $_.fixturePathMatches }).Count
        Assert-Check ($result.unexpectedToolCount -eq 0) 'UNEXPECTED_TOOL_ATTEMPT'
        $completed = @($assistants | Where-Object { ($_.finish -or $_.completed) -and $_.finish -ne 'tool-calls' })
        $last = $completed | Select-Object -Last 1
        if ($last) { $result.lastAnswerHash = $last.textSha256 }
        $matching = @($script:ownAudits | Where-Object answer_sha256 -EQ $result.lastAnswerHash)
        $lastAudit = $matching | Select-Object -Last 1
        if ($script:ownAudits.Count -gt 0) {
            $result.originalTrigger = @($script:ownAudits[0].rows | Where-Object pruefcode -EQ 'FAKTREGEL_NICHT_BESTAETIGT').Count -gt 0
        }
        if (Test-Path -LiteralPath $budgetPath -PathType Leaf) {
            $state = Get-Content -LiteralPath $budgetPath -Raw | ConvertFrom-Json -AsHashtable
            Assert-Check ($state.taskHash -eq $taskHash -and $state.modelHash -eq $modelHash -and
                $state.attempts -ge 0 -and $state.attempts -le 2 -and @($state.answers).Count -eq $state.attempts) 'BUDGET_STATE_MISMATCH'
            $result.budget = $state
        }
        $inbox = @((Api 'Get' ('/api/session/' + $sessionID + '/inbox')).data)
        $active = (Api 'Get' '/api/session/active').data
        $isActive = if ($active -is [Collections.IDictionary]) { $active.Contains($sessionID) } else { $null -ne $active.PSObject.Properties[$sessionID] }
        $terminal = $lastAudit.korrektur.status
        $counts = '{0}:{1}:{2}:{3}' -f $result.correctionCount, $script:ownAudits.Count, $result.toolCount, $terminal
        if ($counts -ne $lastCounts) { Write-Status 'await-guard-terminal'; $lastCounts = $counts }
        if ($lastAudit -and $terminal -in @('NICHT_ERFORDERLICH', 'ERSCHOEPFT_UNGELOEST') -and
            -not $isActive -and $inbox.Count -eq 0) {
            $result.terminalGuardStatus = $terminal
            $result.status = if (-not $result.originalTrigger -or $synthetic.Count -eq 0) { 'TRIGGER_NOT_REACHED' }
                elseif ($result.fixtureReadCount -ne 1) { 'TOOL_COUNT_MISMATCH' }
                elseif ($result.budget.attempts -ne $synthetic.Count) { 'BUDGET_COUNT_MISMATCH' }
                elseif ($terminal -eq 'NICHT_ERFORDERLICH') { 'PASS_NATIVE_CORRECTION' }
                else { 'BOUNDED_EXHAUSTED_UNRESOLVED' }
            break
        }
        Start-Sleep -Milliseconds 500
    }
    if ($result.status -eq 'PREPARING') { $result.status = 'BOUNDED_TIMEOUT' }
} catch {
    # Exception text can contain response bodies or credentials: persist only phase and .NET type.
    $result.status = if ($result.promptDispatches -eq 0) { 'PREFLIGHT_BLOCKED_NO_INFERENCE' } else { 'BOUNDED_CHECK_INCOMPLETE' }
    $result.failurePhase = $result.phase
    $result.failureType = $_.Exception.GetType().FullName
    $result.assertionCode = $_.Exception.Data['ArchiAssertionCode']
    if ($PreflightOnly -and $result.failurePhase -eq 'verify-host-contract' -and -not $sessionID) {
        # Narrow no-inference diagnostics: retain only booleans/counts for this own fixture.
        $diagnostic = [ordered]@{ locationMatches = $null; fixtureConfigLoaded = $null
            fixtureAgentConfigured = $null; nativeAgentListed = $null; nativeAgentCount = $null; listedOwnAgent = @() }
        try {
            $location = Api 'Get' ('/api/location' + $query)
            $diagnostic.locationMatches = $location.directory -eq $runDirectory
            $entries = @(Api 'Get' ('/api/config' + $query))
            $fixtureEntries = @($entries | Where-Object { $_.type -eq 'document' -and $_.path -eq (Join-Path $runDirectory 'opencode.json') })
            $diagnostic.fixtureConfigLoaded = $fixtureEntries.Count -eq 1
            $diagnostic.fixtureAgentConfigured = @($fixtureEntries | Where-Object { $null -ne $_.info.agents.$agentID }).Count -eq 1
            $agents = @((Api 'Get' ('/api/agent' + $query)).data)
            $diagnostic.nativeAgentListed = @($agents | Where-Object id -EQ $agentID).Count -eq 1
            $diagnostic.nativeAgentCount = $agents.Count
            $diagnostic.listedOwnAgent = @($agents | Where-Object id -EQ $agentID | Select-Object id, name, mode, steps)
        } catch {}
        $result.agentDiagnostic = $diagnostic
    }
} finally {
    if ($server) {
        try {
            Pump-ServerOutput
            if (-not $server.HasExited) {
                # This Process handle identifies exactly the server created above. No process-name or tree kill.
                $server.Kill($false)
                [void]$server.WaitForExit(5000)
            }
            $result.ownServeStopped = $server.HasExited
        } catch { $result.ownServeStopped = $false }
        $server.Dispose()
    }
    if ($serverStart) { $serverStart.Environment['OPENCODE_PASSWORD'] = '' }
    $headers = $null; $password = $null; $serverStart = $null
    if ($globalHash) {
        try { $result.globalConfigUnchanged = (Get-FileHash -LiteralPath $globalPath).Hash -eq $globalHash }
        catch { $result.globalConfigUnchanged = $false }
    }
    if ($fixtureHash) {
        try { $result.fixtureUnchanged = (Get-FileHash -LiteralPath $fixturePath).Hash -eq $fixtureHash }
        catch { $result.fixtureUnchanged = $false }
    }
    if ($result.globalConfigUnchanged -eq $false) { $result.status = 'GLOBAL_CONFIG_DRIFT_DETECTED' }
    if ($result.fixtureUnchanged -eq $false) { $result.status = 'FIXTURE_DRIFT_DETECTED' }
    if ($result.ownServeStopped -eq $false) { $result.status = 'OWN_SERVE_STOP_UNCONFIRMED' }
    $result.finishedUtc = [DateTimeOffset]::UtcNow.ToString('o')
    Write-Utf8 $resultPath ($result | ConvertTo-Json -Depth 25)
    Write-Status 'finished'
    Write-Host ('RESULT={0}; dispatches={1}; corrections={2}; tools={3}' -f
        $result.status, $result.promptDispatches, $result.correctionCount, $result.toolCount)
    Write-Host ('EVIDENCE=' + $resultPath)
}
