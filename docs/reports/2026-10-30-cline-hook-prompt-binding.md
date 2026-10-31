# Cline hook context invalidated the human prompt binding

The global Archi Guard adapter selected the last message with role `user` as
the human request. Cline 4.1.26 also uses that role for host-injected hook
context and reminders. After `beforeRun`, the native runtime flushes hook
context with metadata `{ userRunSpan: 0, displayRole: 'system' }`. Native
reminders carry `userRunSpan: 0`. The adapter consequently returned
`stop: true` from `beforeModel` before sending any model request.

Evidence: installed Cline `dist/extension.js`, methods
`flushPendingHookContexts`, `addUserReminderMessage`, `prepareModelRequest`
and `applyStopControl`; latest affected native session
`1793367937054_pb5r2`. Host log ends after context diagnostics with no model
request diagnostics and zero tokens. The host logger does not print the
exception details, so the precise error is reproduced in isolated adapter
tests rather than claimed as a captured native exception.

The adapter now excludes native messages identified by this host metadata
when binding the human request. It does not identify host messages by their
text. Real subsequent user messages still invalidate prior read provenance.

Verification: two new injected-context cases failed before the fix with
`ARCHI_GUARD: Auftragsbindung fehlt; Freigabe=NEIN`. Both pass after the fix;
all 17 adapter/registration tests pass, including a real user message whose
text resembles hook context. `git diff --check` passes.

The single changed runtime file was installed into the existing global
Cline plugin after a hash-verified backup in
`work/backups/cline-prompt-binding-20261030/index-before.mjs`. Installed
SHA256: `9d40247dc0e87265fea6057953ab551ab17906790599ebd7805bfeb1c9bc9502`.
The installed JS entry imports successfully and exposes the four existing
hooks. No provider, model profile, or TheHive file hook was changed. No model
inference was started for the repair. A fresh native Cline run remains open;
the already-running extension may retain its cached plugin module.
