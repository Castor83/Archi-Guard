import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "report-summary.py"
spec = importlib.util.spec_from_file_location("report_summary", SCRIPT)
summary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(summary)


class ReportSummaryTests(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run(
            [sys.executable, "-X", "utf8", str(SCRIPT), *map(str, args)],
            capture_output=True, text=True, encoding="utf-8",
        )

    def test_nested_paths_identify_each_result(self):
        data = {"cases": [{"status": "OK"}, {"check": {"validation": "NICHT_ABGENOMMEN"}}]}
        rows = summary.extract_results(data)
        self.assertEqual([row["path"] for row in rows], [
            "cases[0].status", "cases[1].check.validation",
        ])
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "report.json"
            report.write_text(json.dumps(data), encoding="utf-8")
            text = self.run_cli(report)
            self.assertEqual(text.returncode, 0, text.stderr)
            self.assertIn("cases[0].status: OK", text.stdout)
            self.assertIn("cases[1].check.validation: NICHT_ABGENOMMEN", text.stdout)

    def test_unknown_fields_never_imply_success(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "unknown.json"
            report.write_text('{"metadata": "only"}', encoding="utf-8")
            result = self.run_cli(report)
            self.assertEqual(result.returncode, 0)
            self.assertIn("Ergebnisfelder: unbekannt", result.stdout)
            self.assertNotIn("bestanden", result.stdout.lower())

    def test_result_field_and_null_status_are_preserved(self):
        rows = summary.extract_results({"result": "NOT_ACCEPTED", "status": None})
        self.assertEqual([(row["path"], row["value"]) for row in rows], [
            ("result", "NOT_ACCEPTED"), ("status", "unbekannt"),
        ])

    def test_result_containers_are_traversed(self):
        rows = summary.extract_results({"result": [{"status": "OK"}, {"status": "NOT_ACCEPTED"}]})
        paths = {row["path"] for row in rows}
        self.assertIn("result[0].status", paths)
        self.assertIn("result[1].status", paths)

    def test_object_shaped_open_points_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "open.json"
            report.write_text(json.dumps({
                "status": "PARTIAL", "open_points": {"native": "retry not tested"},
            }), encoding="utf-8")
            result = self.run_cli(report)
            self.assertEqual(result.returncode, 0)
            self.assertIn("retry not tested", result.stdout)
            self.assertNotIn("Offene Punkte: unbekannt", result.stdout)

    def test_oversized_json_number_does_not_abort_later_reports(self):
        with tempfile.TemporaryDirectory() as directory:
            invalid = Path(directory) / "number.json"
            valid = Path(directory) / "valid.json"
            invalid.write_text('{"number":' + "9" * 5000 + '}', encoding="utf-8")
            valid.write_text('{"status":"GEPRUEFT"}', encoding="utf-8")
            result = self.run_cli(invalid, valid)
            # Python 3.11+ rejects oversized integers; older supported Python may parse them.
            if sys.version_info >= (3, 11) and sys.get_int_max_str_digits() != 0:
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("JSON-Fehler", result.stdout)
            self.assertIn("status: GEPRUEFT", result.stdout)
            self.assertNotIn("Traceback", result.stderr)

    def test_explicit_open_points_are_shown_without_inventing_a_verdict(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "partial.json"
            report.write_text(json.dumps({
                "result": "PARTIAL", "open_points": ["native retry not tested"],
            }), encoding="utf-8")
            result = self.run_cli(report)
            self.assertEqual(result.returncode, 0)
            self.assertIn("result: PARTIAL", result.stdout)
            self.assertIn("Offene Punkte:", result.stdout)
            self.assertIn("native retry not tested", result.stdout)
            self.assertNotIn("bestanden", result.stdout.lower())

    def test_invalid_json_and_missing_file_fail_but_valid_files_still_print(self):
        with tempfile.TemporaryDirectory() as directory:
            invalid = Path(directory) / "invalid.json"
            valid = Path(directory) / "valid.json"
            invalid.write_text("not json", encoding="utf-8")
            valid.write_text('{"status": "GEPRUEFT"}', encoding="utf-8")
            result = self.run_cli(invalid, Path(directory) / "missing.json", valid)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("JSON-Fehler", result.stdout)
            self.assertIn("DATEI_NICHT_VORHANDEN", result.stdout)
            self.assertIn("status: GEPRUEFT", result.stdout)

    def test_scan_is_sorted_and_does_not_modify_reports(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshots = {"b.json": b'{"status":"B"}', "a.json": b'{"status":"A"}'}
            for name, content in snapshots.items():
                (root / name).write_bytes(content)
            result = self.run_cli("--scan", root)
            self.assertEqual(result.returncode, 0)
            self.assertLess(result.stdout.index("=== a.json ==="), result.stdout.index("=== b.json ==="))
            for name, content in snapshots.items():
                self.assertEqual((root / name).read_bytes(), content)


if __name__ == "__main__":
    unittest.main()
