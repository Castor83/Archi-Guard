# Guard checks native Cline text completions

User instruction: close the plain-text completion gap after confirming that
PostToolUse ran. The original task's receipt exists in
`~/.cline/data/logs/thehive-learning-hooks.jsonl` for conversation
`conv_1793368143463_y2k5l54`. The existing TheHive PostToolUse script observes
tool events; it does not inspect the subsequent model answer or Audit JSON.
That script remains unchanged.

The adapter now also uses native `afterModel`. The installed Cline 4.1.26
runtime calls this hook with the candidate `assistantMessage` before adding
it to the snapshot and consumes `stop/reason`. The adapter therefore binds
the candidate's model and answer identity explicitly. Intermediate tool-call
responses continue to the existing tool hooks. Ordinary text completions use
the same deterministic bridge, native read ledger, deadline and ownership
checks as completion tools. Unsupported/incomplete text endings stop.

Both completion routes record a small receipt in
`~/.local/state/archi-guard/cline-audits.jsonl`: route, timestamp, workspace,
conversation, prompt and answer hashes, status and formal check codes. No
answer or source text is stored. Results are also logged through the native
plugin logger. Receipts attest to validation only: `host_completion` remains
`NOT_ATTESTED` and `freigabe` remains `NEIN`.

Audit persistence occurs before any correction reservation. A missing audit
receipt cannot consume a correction that the host will not dispatch. Native
afterModel has no skip/retry contract, so invalid text completions stop and do
not reserve automatic corrections. Existing beforeTool correction behavior
is preserved. Empty/missing claims and infrastructure failures never grant
acceptance. Only declared formal evidence is checked, never all free text or
semantic correctness.

Verification: four new text/receipt tests failed before implementation.
Independent review found audit persistence originally followed correction
reservation; an additional test reproduced that failure, then passed after
reordering. All 23 adapter/registration tests pass, including the exact inert
afterModel-dispatch loop extracted from the installed Cline bundle. That
characterization executes the hook loop only, not the extension bootstrap or
a model. The reviewer confirmed the audit-order issue closed.

The installed plugin was replayed offline with the original native task's
read result and final response. The original text stops with FORMAT_FEHLER;
a valid declared fact passes formal checking; a false literal stops with
FAKTREGEL_NICHT_BESTAETIGT. Evidence:
`2026-10-30-cline-text-completion-replay.json`. No inference was run.

Installed file: `~/Documents/Cline/Plugins/archi-guard/.runtime/cline-plugin/index.mjs`.
SHA256: `75251c45bab159129f32b494766b5fe53ed8dad4edf986a2eedeab923e42f730`.
Previous installed bytes are hash-verified in
`work/backups/cline-text-completion-20261030/index-before.mjs`.
The actual installed JS entry imports and exposes afterModel plus the four
existing hooks. No provider/model settings, global file hooks, extension
bundle or hook trust settings were changed. No publication or push.

Limits: this is an installed, locally tested repair, not a new native live
acceptance. Reload the VS Code host and start a new Cline task to exercise the
new module. afterModel runs after streaming, so already displayed text is not
retracted; stop prevents successful completion through this path. The native
hookErrorMode default remains ignore: errors outside the adapter's explicit
handling do not have a general fail-closed guarantee. A receipt is not proof
that the host subsequently honored a stop or completed a run.

Primary contract: https://docs.cline.bot/sdk/plugins and the installed
saoudrizwan.claude-dev-4.1.26/dist/extension.js. Documentation agrees with the
observed stop/reason return contract; installed bytes determine this repair.
