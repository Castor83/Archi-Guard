# Cline Tool Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Wrong tool calls receive bounded correction feedback while required steps gate completion.

**Architecture:** Add a small per-human-request tool-plan adapter using the existing correction budget and model fence. Native beforeTool rejects, afterTool advances, completion hooks gate missing steps.

**Tech Stack:** Existing Node ESM, node:test, Cline4.1.26 SDK hooks; no new dependency.

**Spec:** ../specs/2026-10-30-cline-tool-plan.md

## Global Constraints

- Explicit user plan only; no fixed global workflow or new inference.
- Two corrections; persistent existing budget; no writes by rejected tools.
- Preserve foreign/untracked files and global TheHive file hooks.
- In-place on the established codex/archi-guard-repair branch; selective staging.

## Review Focus

- Model/tool context must not introduce a plan.
- Wrong arguments and batched out-of-order calls must not advance.
- Native tool failure must not fulfill a required step.
- Reload/model switch must not reset correction budget.
- Existing no-plan source audit behavior must remain intact.

## Task 1: Tool-plan contract and correction state

Files: cline-plugin/tool-plan.mjs, tests/cline-tool-plan.test.mjs.
- [x] Write failing parser, wrong-tool/argument, progress, limit, duplicate, reload and model-binding tests.
- [x] Run red; implement using reserveCorrection/setCorrectionFence.
- [x] Run targeted tests; retain evidence in this plan.

## Task 2: Native integration and packaging

Files: cline-plugin/index.mjs, scripts/Stage-ClinePlugin.ps1,
tests/cline-plugin.test.mjs, tests/cline-registration.test.mjs,
tests/test_cline_staging.py.
- [x] Add failing native-hook integration tests.
- [x] Bind only the real user message; gate both completion routes; observe native successes.
- [x] Include the one new runtime module in existing staging/registration lists.
- [x] Run relevant Node and staging checks; fresh-context review; fix important findings.
- [x] Commit own files, install with verified backup and read-back, save own checkpoint.
- [x] Deliver one complete live test; no claim of native live acceptance before its result.

Verification: 36 feature/adapter/registration/notice Node tests; 23 existing
correction-store tests; four Python staging tests pass. New cases observed
red before implementation/fix. Independent review found model-binding and
changed-input/duplicate-ID issues; both were reproduced, fixed and re-reviewed.
Source is installed with verified backups; final evidence/checkpoint follows.
Implementation commit: 409efb1. Live test text:
../../reports/2026-10-30-cline-tool-plan-live-test.txt. Native acceptance remains pending.
