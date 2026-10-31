# JSON report summary

Python 3.10 or newer; standard library only. Run from the repository root:

```powershell
python -X utf8 tools/report-summary.py docs/reports/example.json
python -X utf8 tools/report-summary.py --scan docs/reports
python -B -m unittest discover -s tests -p test_report_summary.py -v
```

Multiple explicit input files are supported. `--scan` reads only the JSON
files directly inside the named directory, in sorted order. Reports are
never modified. Exit code is 1 if any input cannot be read or decoded;
other inputs are still shown. A readable report with no known result field
returns 0 but displays `unbekannt`, which is not an acceptance verdict.

The CLI prints each file's absolute path and the full dotted/indexed field
path for `status`, `validation`, `check_status`, `final_native_state`, and
`result`. Explicit `open_points`, `offene_punkte`, `limitations`, `limits`,
and `blockers` are shown separately. Missing data stays unknown. Raw source
values are not combined into a general pass/fail or semantic approval.

Example output from the native negative-test report includes:

```text
tests.test1_false_literal.status: EXPECTED_REJECTION_CONFIRMED
tests.test1_false_literal.validation: NICHT_ABGENOMMEN
tests.test2_mixed_quotes.validation: NICHT_ABGENOMMEN
```

An expected rejection can be a successful negative test while the audited
answer itself remains unaccepted. The CLI intentionally preserves both.
