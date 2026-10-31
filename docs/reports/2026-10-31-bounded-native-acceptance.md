# Bounded native Cline acceptance and completion

Checked 2026-10-30/31 against installed Cline 4.1.26. Existing native
messages, Guard receipts and host logs supplied these observations; no
additional model run was started to prepare this report.

| Scenario | Observed result |
| --- | --- |
| Wrong registered tool, then correction | `run_commands` received `Nicht ausgeführt`, `1/2`; the same human request then performed the planned successful `read_files` |
| New request in the same chat | Fresh successful read with a new call ID and answer-bound positive receipt |
| New request without a fresh read | `LESEBELEG_NICHT_BEOBACHTET`, `NICHT_ABGENOMMEN`, and native host abort; earlier reads were not accepted |
| Correction budget exhausted | Three distinct invalid registered calls: `1/2`, `2/2`, then native abort; the user supplied the matching visible exhaustion message |
| New valid request after that stop | Fresh planned read succeeded, with a matching positive final-answer receipt |
| Two-step ordered plan | Successful `read_files`, then successful `run_commands` returning `ARCHI_STEP_2_OK`, then matching formal receipt |

The local evidence record retains source, user/call identity and answer
hashes. Raw transcripts, machine paths, runtime state and private handoffs
are intentionally not part of the public source export.

This confirms only these branches. It does not establish semantic
correctness of all answer text, all-tool coverage, or unconditional
fail-closed behavior for external hook errors. The positive two-step test
did not exercise omission/reordering. Formal receipts inspect only
declared evidence; `freigabe` remains `NEIN`.

## Existing context controls

Repeated build attempts exceeded the actual 32768-token backend window.
The configured model advertised 65536; a four-pattern search returned
roughly 192000 result characters. The model registry was corrected and
native MessageBuilder limits configured without an extension patch or new
filter. See [native controls](../cline-context.md).

The restarted extension-host process inherited both configured limits.
Offline replay of the unchanged native budget code confirmed text reduction.
This is separate from a new live model-request test; system/tool overhead
and tokenizer differences still matter.

## Report CLI

The existing Cline-created Python CLI was completed rather than rebuilt.
It reports full nested field paths, raw outcome values and explicit open
points. Missing data stays unknown. Read/JSON errors are visible and return
nonzero while other inputs are processed. Nine regression tests and actual
positive/negative report invocations confirmed this behavior. See
[usage and limits](../report-summary.md).

## Durable knowledge

The native controls and exact settings were stored and read back in the
existing local knowledge note. Future troubleshooting should start with
those capabilities. Storage is not model training, automatic semantic
learning or an update of independent running agents.
