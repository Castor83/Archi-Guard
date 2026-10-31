# CLI and context verification completion plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution.

**Goal:** Finish the existing report CLI, verify native Cline context controls, preserve bounded Guard acceptance evidence, and submit the reviewed public changes to the existing CodeRabbit PR.

**Architecture:** Reuse the existing Python CLI and Cline's native MessageBuilder settings. Keep raw local session data and machine configuration local; publish portable instructions and summarized evidence through the existing sanitized release workflow.

**Tech stack:** Python standard library, Node offline verification, existing GitHub PR.

**Spec:** The user's current completion/upload request and the existing CLI continuation instructions in this chat.

## Constraints

- Preserve unrelated files and index entries. Reuse the existing report-summary worktree.
- No installation, model start, extension patch, or new context-filter implementation.
- Original JSON reports remain read-only. Unknown results never become a success assertion.
- Commit each completed, successfully checked work block. Upload only sanitized project files; do not merge the PR.

## Work blocks

- [x] CLI: five expected regression failures observed, six tests green after fixes; real positive/negative reports run successfully; input immutability checked.
- [x] Context: restarted extension host identified by its native host log; both limits present in actual process environment, model entry read back; native offline proof retained and setup/rollback/limits documented.
- [x] Guard and knowledge: native observations consolidated; README's stale pre-host status corrected; durable native-controls knowledge recorded and read back. No semantic approval claimed.
- [ ] Review: inspect the full changed scope with one independent review, address important findings, then update the sanitized PR branch and request CodeRabbit review. Record the remote head and review-start evidence.

## Review focus

Nested object/list paths must stay distinct; malformed/missing files must fail visibly and return nonzero; mixed reports must preserve each raw result; truncation must be disclosed; publication must omit local paths, raw session logs and user-specific configuration.

## Progress and rulings

- Reused the existing isolated worktree on report-summary-cli; no new checkout or implementation.
- Configuration remains local; portable instructions, not live user configuration, will be published.
- CLI block: preserved Cline's implementation, fixed paths/unknowns/exit status and added explicit open-point fields. The two pre-existing loose fixture files remain untouched and unstaged.
- Context block: no extension patch or model call. Process inheritance and native-code offline verification are confirmed; no new live model-request claim is made.
- Final review found three P2 gaps (object-shaped open points, nested result lists, oversized JSON integers). All reproduced with three new failing tests before fixes. Containers are now both preserved and traversed; decoder ValueError is handled per input. No deferred review findings.
