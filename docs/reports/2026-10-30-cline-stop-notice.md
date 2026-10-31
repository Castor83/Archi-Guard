# Visible Cline status for Guard stops

Native task `1793369958349_f7m3q` confirms the text-completion guard ran:
receipt route `text`, status `FORMAT_FEHLER`, validation `NICHT_ABGENOMMEN`
at `2026-10-30T14:19:53.482Z`. Its prompt hash matches the actual task's
first user message. Answer SHA256:
`592223bc3a98de1fe495f30b479c17e4b592b569268818c551efe72eefcb8f65`.
The corresponding Cline log records `Textabschluss nicht abgenommen`, then
the abort and `idle`. The rejected final answer is absent from the saved
messages. This is a native negative-test result, not a positive acceptance.

The user saw streamed output and thought the task hung, then requested a
message. Cline's native `A2n` adapter receives `snapshot.lastError`, but for
`run-finished` previously emitted only `done`, discarding that stop reason.
The plugin logger reaches only the output log; the checked plugin event and
hook contracts offer no direct UI-notice return from afterModel.

The smallest local host correction adds a native status notice before the
existing done event only when status is `aborted` and the host's last error
starts with `ARCHI_GUARD:`. It uses the existing notice-to-`say/info` renderer.
It preserves ordinary completion, user cancellation and the Guard decision;
no model request, provider change, file-hook change, or new extension is used.

`scripts/Patch-ClineStopNotice.mjs` applies only to publisher saoudrizwan,
version4.1.26 and exact original bundle SHA256
`ae4cec19fd74dc97681dcfcfe5a6644cae4a5f5f19396f1424dcd9eada659559`.
It validates the unique anchor, creates an exclusive backup and manifest,
verifies the backup, rechecks the target, atomically replaces it, and rereads
the resulting hash. An unknown/updated bundle is refused. Source transformation
is idempotent; the installer itself refuses an already modified bundle.

Applied target:
`C:/Users/USER/.vscode/extensions/saoudrizwan.claude-dev-4.1.26/dist/extension.js`.
Installed SHA256:
`e8d48ac68cb5356ecd1cac82a79acc0351ccda48f7f713c5e2e4364e94d85647`.
Verified original backup and manifest:
`work/backups/cline-stop-notice-20261030/extension-before.js` and
`work/backups/cline-stop-notice-20261030/manifest.json`.
The original bundle remains local and uncommitted. Restore consists of copying
that verified backup to the exact target, after checking the target has not
since been updated, then reloading the host.

Three new tests first failed before the implementation. After application,
all four targeted notice/registration tests pass. They execute only the exact
inert native event translator, status helper and UI-event converter, not the
extension bootstrap or live UI. Guard abort produces an info message followed
by the unchanged aborted done event; ordinary completion/cancellation and a
missing snapshot are unchanged. The full installed bundle passes node --check.
Read-only independent review found no important issue.

Status: locally applied and verified; one host reload is required. No new
native task or screenshot confirms actual rendered visibility yet. Cline
updates may overwrite this version-specific local patch; it must be reviewed
against the new owning version, not blindly reapplied. This changes the prior
historical claim that the extension bundle was untouched. Existing plugin
streaming and hookErrorMode limits remain. Global Q3 autostart is unrelated
and remains open.

## Native confirmation after reload

Task `1793370773127_uqzzm` started at `2026-10-30T14:32:53.471Z`, performed
one successful read and was stopped by afterModel at `14:33:35.984Z` with
`FORMAT_FEHLER` / `NICHT_ABGENOMMEN`. Receipt answer SHA256:
`05cd28ace17012bd10862439217892c9f0a5cea16cc6582d5adc35781ebed97d`.
The installed bundle still has the patched hash above. The user explicitly
confirmed `Ja, Meldung sichtbar` for the Guard status message. The native
negative Guard path and its visible stop notice are therefore confirmed.

The supplied JSON now correctly escapes the path and quote but omits the
required `behauptung` field. Offline isolation with the same read/quote and
claim structure returns FORMAT_FEHLER without that field and
BELEGKETTE_FORMAL_VOLLSTAENDIG with it. No new inference was used. The shortened
test instruction did not explicitly name that field; use the complete schema
for any later positive test. A valid positive *native* completion is still
distinct from this successful negative test and notice confirmation.
