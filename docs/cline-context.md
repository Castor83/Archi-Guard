# Use Cline's built-in context controls

Cline already provides these controls. An additional context-filter plugin,
model, dependency or extension patch is not required.

Verified against the installed Cline 4.1.26 on 2026-10-31:

| Control | Configured value | Meaning |
| --- | --- | --- |
| Model `contextWindow` | 32768 | Match the actual backend's accepted context window |
| `CLINE_MESSAGE_BUILDER_MAX_TOOL_RESULT_CHARS` | 6000 | Native per-string tool-result truncation limit |
| `CLINE_MESSAGE_BUILDER_MAX_TOTAL_TEXT_BYTES` | 48000 | Native aggregate conversation-text budget |

These values are a profile for the tested local 32768-context backend,
not universal defaults for every model. The model registry is the existing
`~/.cline/data/settings/models.json`; change only the intended model's
`contextWindow`. Keep unrelated models, output limits and credentials intact.

On Windows, configure the existing environment controls with PowerShell:

```powershell
[Environment]::SetEnvironmentVariable('CLINE_MESSAGE_BUILDER_MAX_TOOL_RESULT_CHARS', '6000', 'User')
[Environment]::SetEnvironmentVariable('CLINE_MESSAGE_BUILDER_MAX_TOTAL_TEXT_BYTES', '48000', 'User')
```

Record previous values first. Fully exit and reopen VS Code so its extension
host inherits the new environment. Reading the saved registry alone does not
prove that an already-running process has adopted it. To roll back, restore
the previous model entry and environment values (`$null` removes a previously
unset user variable), then restart VS Code again.

## Verification and limits

The restarted extension-host PID was identified from VS Code's host log and
its actual process environment was read: both configured values were present.
The model entry was read back at 32768. No model inference was needed.

An offline replay used the unchanged installed native MessageBuilder text
budget code on the previously recorded failing conversation. It reduced
226264 message-text bytes to 47999 under the 48000-byte budget; a single
196731-character result string became 6000 characters. Original messages
were unchanged. This is native-code/configuration evidence, not a new live
model-request or a complete end-to-end acceptance run.

The result limit is per string, not a hard aggregate bound for every tool
call. The aggregate budget handles eligible text and preserves native
minimums. System prompts, tool schemas, protocol overhead and media have
additional costs. Bytes and characters are not tokens; oversized protected
content can still exceed a budget. Truncation markers disclose omissions.
Read missing relevant sections before treating evidence as complete.

Use narrow searches and exclude backups/bundles from ordinary exploration.
In this installed version `search_codebase` accepted query patterns, not a
path filter, and allowed about 48000 characters per pattern. Four patterns
could therefore produce about 192000 result characters. Prefer a scoped
shell search when the native search cannot express the needed scope, and
return only the needed matches. Keep required Guard evidence tied to actual
current `read_files` results.

The local durable knowledge note records these existing capabilities so
future context troubleshooting starts here instead of rebuilding them.
