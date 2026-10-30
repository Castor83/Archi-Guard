# Archi Guard Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execute locally without additional implementer agents.

**Goal:** Correct the six verified CodeRabbit findings without activating hosts or models.
**Architecture:** Reuse the existing Python bridge, runtime defaults, CLI launchers and unittest/Node tests. Keep the local source authoritative; synchronize only sanitized, explicitly selected files into the existing public PR.
**Tech Stack:** Python standard library, Node test runner, Git Bash, PowerShell.
**Spec:** User request in this chat: “aber auch die ferhler beheben”; CodeRabbit review 5708897767.

## Global Constraints

- Do not start models, OpenCode, Cline tasks or hooks in the real host.
- Preserve untracked references and existing global Cline/TheHive hooks.
- Do not weaken quote, provenance, correction-budget or approval checks.
- Cline integration is a separate requested deliverable; establish the installed host contract before designing the adapter.

## Review Focus

- Output symlinks must leave their targets unchanged.
- An interrupted read-back must never leave a PASS receipt.
- UTF-8 input must not depend on the Windows console encoding.
- Launcher paths with spaces and argument boundaries must survive export.
- The sanitized integration suite must use the explicitly configured Python.

## Task 1: Review regressions and fixes

- [x] Run `py -3 -B -m unittest discover -s tests -p test_review_regressions.py -v`; confirm the five named regressions fail for the reviewed causes.
- [x] In V1 CLI reject the original output symlink before resolving, as V2 already does.
- [x] In the snapshot script verify copied bytes before writing the final manifest; preserve ERROR receipts.
- [x] In the fallback script read bounded stdin bytes and decode UTF-8 explicitly.
- [x] Derive the Git Bash launcher from LOCALAPPDATA. Let integration tests use existing bridge defaults instead of a user-specific Python override.
- [x] Clarify historical v0.5 instructions and use v0.6 for current host observations.
- [x] Run the new regressions, existing Python tests, bridge/V1/V2 self-tests and existing Node suites. Record exact outcomes.
- [x] Commit only these repairs, tests and this plan. Preserve the worktree for the Cline work.

## Task 2: Public PR synchronization

- [ ] Copy only repaired source files and new tests into the existing export, sanitize local user names and verify hashes/sensitive patterns.
- [ ] Re-run appropriate offline checks in the sanitized export, commit and push the existing PR branch.
- [ ] Read back GitHub head, file list and review state. Record the milestone in the existing project store.
