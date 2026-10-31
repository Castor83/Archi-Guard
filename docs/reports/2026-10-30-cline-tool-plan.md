# Bounded correction for wrong Cline tools

Implemented on the user's confirmation of beforeTool skip/reason feedback,
two correction opportunities and a visible third-failure stop. Native Cline
hooks and the existing correction budget/fence were reused. No new dependency,
model inference, backend configuration, global file-hook change or host patch.

Only a genuine human request can activate a plan, using standalone markers:

```text
ARCHI_TOOL_PLAN_BEGIN
{"steps":[{"tool":"read_files","input":{"files":[{"path":"C:\\absolute\\source.js"}]}}]}
ARCHI_TOOL_PLAN_END
```

Without a plan, existing behavior remains. There is no free-text inference of
which tool is correct and no fixed workflow for all tasks. Plans support the
three locally characterized native tools read_files, search_codebase and
run_commands, at most eight ordered steps and 16KiB JSON. Tool name and parsed
input must match the current step exactly (object key order is ignored).
Semantically equivalent but differently written inputs can require correction.
The plan does not grant additional filesystem/tool permissions.

Wrong calls return skip/reason and do not execute. Two different invalid call
IDs receive correction feedback; the next fails visibly. Identical redelivery
does not consume a new slot; altered input under a known ID stops, including
after reload. Existing reserveCorrection gains an opt-in strictDuplicateHash
check; default behavior for other callers is unchanged. Budget state remains
hashed and is namespaced separately for workflow correction.

Only successful native afterTool output for the pending exact call advances
the plan. Failed/foreign/out-of-order results do not fulfill requirements.
The workflow's model binding is checked again at final completion. New user
messages clear reads/progress. Reload conservatively clears progress/reads
but not the persistent correction count. Host/model-supplied context cannot
activate a plan. Merely mentioning a marker inline does not activate one.

A premature completion-tool call receives correction feedback. A premature
plain-text ending is stopped with the missing step: native afterModel has no
skip/retry contract. Unregistered tool names are handled by Cline before
beforeTool is invoked; this feature's retry counter applies to registered
tool calls that reach the hook. External hook failures remain subject to the
unchanged native ignore policy. No unconditional fail-closed claim is made.

Verification: 36 Node feature/adapter/registration/notice tests and 23 existing
correction-store tests pass; four Python staging tests pass. New tests were
observed failing first. Review found two binding issues (final model change,
altered input under duplicate ID); both have red/green regressions and the
independent reviewer confirmed closure. Existing no-plan behavior and staging
rollback tests remain green.

Installed runtime files and SHA256:

- cline-plugin/index.mjs: 19de9c08adf8764c036b0e61e169ddddd0e9166a6e38a6236d48969fee9adeff
- cline-plugin/tool-plan.mjs: 8c4c19edecc599f9c625b2ea9a2005ecad07227ff8b03e915b143e7b62ec41c2
- global-plugin/correction.mjs: b79764d712181d2dc45904dacd56db75b9d9d75fb35fa6458d41dfa983198439

Target root: C:/Users/USER/Documents/Cline/Plugins/archi-guard/.runtime.
Verified backup/manifest: work/backups/cline-tool-plan-20261030. The installed
JS entry imports successfully. Package/staging lists include the new module.
Source line numbers moved; earlier hardcoded adapter-line tests are historical.
No public export or push. A new native Cline task is still needed for live
acceptance of the retry flow; source/contract tests and import are not that
acceptance. Global Q3 autostart remains unrelated and open.

## Native acceptance boundary, 2026-10-30

The saved native evidence in `2026-10-30-cline-tool-plan-live.json`
(Cline task `1793381190782_17nqu`) confirms an active plan fence, matching
prompt/model bindings, one `read_files` call and a formally checked final
answer. The model did not attempt the requested wrong call. This is positive
plan-path evidence only; it does not exercise correction.

| Branch | Native evidence | Acceptance still required |
| --- | --- | --- |
| Exact planned read and formal answer | Confirmed in saved task evidence | No repetition needed |
| Wrong registered tool rejected before execution with skip/reason | Not exercised | Actual wrong call, hook feedback, and absence of its execution result |
| Correction within the same human request | Not exercised | After that feedback, exact planned read succeeds without a new user message |
| Third distinct invalid call stops visibly | Not exercised | Separate exhaustion task: two feedback events, then visible stop on third invalid call; no invalid command executes |

Offline test results above remain historical offline evidence. No native
retry or third-failure acceptance is inferred from them. The existing live
test prompt was not obeyed for its deliberate wrong-call step, so blindly
repeating it is not a new verification method. Any next authorized host test
must concretely produce that missing registered call; if the model again
chooses the correct read immediately, report the branch as unexercised and
stop. No model run, host operation or runtime change was performed for this
status clarification.

## Native correction confirmed, later task on 2026-10-30

Task `1793382257984_sx4xm` closes the wrong-call/correction gap above.
Its saved native messages show `run_commands` receiving an error result:
`ARCHI_GUARD: Nicht ausgeführt` with the expected `read_files` and budget
`1/2`. It has no successful command output. The next actual call is the
planned `read_files`, whose successful result contains the expected first
line. Both calls belong to the same human request. The final answer hash
matches the Guard receipt at `2026-10-30T17:45:19.078Z`, status `GEPRUEFT`,
code `BELEGKETTE_FORMAL_VOLLSTAENDIG`. This checks the declared source fact;
it is not semantic approval of every sentence in the answer.

Evidence: `2026-10-30-cline-tool-plan-correction-live.json`, extracted from
the existing native session and matched against the existing audit receipt.
The native wrong-call rejection and same-request correction are now
confirmed. Third-failure visible stop remains unexercised and separate.
No model was started and no test was repeated for this verification.

## Sequential requests and exhaustion: native series completed

Existing Cline task `1793382257984_sx4xm` now provides these separate
native observations, checked on 2026-10-30:

- Request 2: new successful read and answer-bound positive receipt after
  the initial corrected wrong call (`2026-10-30-cline-sequential-request2.json`).
- Request 3: no new tools; old read rejected with
  `LESEBELEG_NICHT_BEOBACHTET`, `NICHT_ABGENOMMEN`, and host abort
  (`2026-10-30-cline-sequential-request3.json`).
- Request 4: three distinct invalid registered calls; first two receive
  `1/2` and `2/2`, third triggers host abort. User supplied the visible
  exhaustion notice; no successful command result was observed
  (`2026-10-30-cline-third-invalid-call-stop.json`).
- Request 5: new planned read succeeds in the same task after that stop;
  final answer hash matches the positive receipt at
  `2026-10-30T20:02:26.716Z`
  (`2026-10-30-cline-post-stop-recovery.json`).

These observations close the previously open native branches for this
bounded test series. Earlier open statements above describe earlier
evidence. This is not general semantic acceptance, all-tool coverage or
a change to Cline's external hook-error policy. No model runs were started
by Codex for these checks.
