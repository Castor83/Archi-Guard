# Guard Session Scope Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this single bounded task; one fresh whole-change review at the end.

**Goal:** Prevent a Guard instance from recovering, auditing or reserving corrections for another project's session.

**Architecture:** Use the existing ctx.location and actual session.location from OpenCode2.1.4. Canonical local directory and optional workspaceID identify the owner; no new coordinator. Keep all existing provenance, model/fence and two-attempt limits.

**Tech Stack:** Existing Node ES modules and Node test runner; unchanged Python bridge.

**Spec:** C:\TheHive\work\verification\guard-read-scope-proposal-20261027.md; approved by the user's direct ja in session01a17dde-8c48-7d42-a5eb-4f9c247c84b0.

## Global Constraints

- Implementation and targeted offline checks only; no installed plugin changes, model runs, downloads, UI steering, deployment or host restart.
- Preserve untracked reference files and the existing correction budget/fence contract.
- Ruling: work in the existing clean tracked repair checkout, branch codex/archi-guard-repair. The installed plugin is a separate copy; no new branch/worktree or dependency setup is needed for this approved narrow correction.
- User's targeted verification scope overrides skill examples requiring unrelated suites or duplicate successful runs.

## Review Focus

- Global completion events after a correction must not hydrate a foreign session.
- A foreign model.request handler must not interfere with another project's valid model.
- Invalid/unavailable identity cannot become ownership or a successful audit.
- Windows case/separators and workspace identity must neither duplicate ownership nor reject valid aliases.
- Own reload, moved sessions, and model/prompt changes must retain conservative fence behavior.

## Task 1: Bind existing runtime entry points to their actual session scope

**Files:** Modify global-plugin/runtime.mjs and tests/plugin-integration.test.mjs; update README.md/HANDOFF_CURRENT.md and an offline report after validation.

**Interfaces:** Existing setupGuard(ctx, options), ctx.location, ctx.session.get({sessionID}).location, hook callbacks, event stream, persisted correction methods. No new public API.

- [ ] Add a failing two-instance regression: owner has a read; foreign instance sees the same correction context/event but creates neither audit nor reservation.
- [ ] Add failing wrong/missing workspace/location checks and a Windows equivalent-directory positive case.
- [ ] Run only the new regressions; Expected: FAIL for currently unscoped foreign recovery/identity.
- [ ] Add the smallest shared scope comparison and apply it before state/ledger/audit/fence side effects; preserve legitimate same-scope reload and existing model protections.
- [ ] Run new regressions; Expected: PASS.
- [ ] Run the affected complete Node suite once: node --test tests/correction.test.mjs tests/plugin-integration.test.mjs. Expected: no failures; existing unchanged Python/PreCompact suites are outside this correction.
- [ ] Review the full diff with one fresh reviewer; resolve meaningful findings with a focused red/green check.
- [ ] Save exact test evidence, scope/remaining deployment limits and own commits. Update central checkpoint through the existing writer.

**Completion:** Only the repository correction and offline acceptance can be complete. Installed global-v0.5 and user-run host acceptance remain separate.
