# Public review snapshot

Updated 2026-10-31 from source commit `9316cbe8acbdab51049f193aa7f6990ecdecab87`.

PUBLIC-FILES.txt lists the 64 selected source, test and documentation
files. Personal usernames in source copies are replaced with USER. Private
Git history, raw session messages, local runtime receipts, user environment,
model configuration, backups and handoff files are excluded. Existing dirty
release snapshots were left untouched; this snapshot starts from the current
public PR head.

This update includes the native Cline adapter and explicit tool-plan workflow,
bounded correction and visible-stop support, the JSON report CLI, and portable
instructions for existing Cline context controls. See the bounded native
acceptance report for the actual tested branches and remaining general limits.
The stop-notice patch script is optional source, not executed by this export.
The context correction requires no extension patch.

Validation in the source tree: 59 Python tests and 114 Node tests passed.
The three final review findings were reproduced and fixed before export.
The sanitized snapshot is tested separately before publication. No new model
inference, runtime installation, hook activation, server start or PR merge is
part of publication. Formal evidence checking is not semantic acceptance;
`freigabe` remains `NEIN`.
