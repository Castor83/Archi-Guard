# Cline Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execute locally; preserve the existing worktree and global hooks.

**Goal:** Implement the approved bounded Cline SDK adapter using existing bridge/budget modules.
**Architecture:** Native callbacks translate supported read/completion events; no new inference or service.
**Tech Stack:** Node ESM, Python standard library, existing PowerShell staging.
**Spec:** ../specs/2026-10-30-cline-guard-design.md; explicitly approved by user “genemigt”.

## Global Constraints
- No models, live IDE tasks, UI interaction or automatic activation.
- Keep TheHive hooks and existing provider settings untouched.
- Unknown host binding never yields approval.

## Review Focus
- Native read output is query/result/success, not an invented path/content payload.
- User changes during asynchronous verification invalidate the result.
- Model fence and budget must survive reload without sharing another workspace's state.
- Infrastructure errors cannot reserve corrections or grant approval.
- Internal deadlines do not prove fail-closed behavior of an unverified IDE host.

## Tasks
- [x] Pin supported primary-source callback/response shapes; record IDE acceptance limits.
- [x] Write failing native-plugin and real-bridge contract tests.
- [x] Implement cline-plugin/index.mjs using existing modules.
- [x] Test staging with temporary directories and verify existing files/hash rollback.
- [x] Verify all offline suites and request independent diff review.
- [ ] Commit, synchronize only approved source changes to the public PR, and save checkpoint.
- [ ] Native activation/IDE acceptance remains a separate unverified step; do not claim it occurred.
