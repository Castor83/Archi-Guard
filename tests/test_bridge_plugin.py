"""Focused integration contract for the existing bridge's plugin transport."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import archi_bridge_v2 as bridge


class PluginBridgeTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.source = self.root / "source.py"
        self.quote = 'VERSION = "ARCHI_PLUGIN_LOCAL_TEST"'
        self.source.write_text(self.quote + "\n", encoding="utf-8")
        self.other = self.root / "other.py"
        self.other.write_text(self.quote + "\n", encoding="utf-8")
        self.claim = {
            "id": "M1", "quelle": "review", "behauptung": "The source has this version.",
            "behaupteter_status": "BEWIESEN",
            "belege": [{"id": "B1", "datei": str(self.source), "zeile": 1, "zitat": self.quote}],
            "pflichtbelege": ["B1"],
            "fakten": [{"typ": "QUELLZEILE_ENTHAELT", "beleg_id": "B1", "literal": "ARCHI_PLUGIN_LOCAL_TEST"}],
        }

    def payload(self, claim=None, reads=None):
        if claim is None:
            claim = self.claim
        if reads is None:
            reads = [{"path": str(self.source), "content": "<file>\n1: " + self.quote + "\n</file>"}]
        return {"text": bridge.BEGIN + "\n" + json.dumps([claim]) + "\n" + bridge.END,
                "reads": reads}

    def analyze(self, payload):
        self.assertTrue(callable(getattr(bridge, "analyze_plugin", None)),
                        "The existing bridge must expose analyze_plugin")
        return bridge.analyze_plugin(payload, (self.root.resolve(),))

    def assert_result(self, result, status, blockstatus, declared=0, checked=0, free_text=0):
        self.assertEqual(result, {
            "status": status, "rows": [], "freigabe": "NEIN",
            "abdeckung": {
                "blockstatus": blockstatus,
                "deklarierte_befunde": declared,
                "gepruefte_befunde": checked,
                "freitext_zeichen": free_text,
                "aussagen_gesamt": None,
                "vollstaendigkeit": "NICHT_NACHGEWIESEN",
            },
        })

    def test_coverage_valid_block_never_claims_complete_statement_coverage(self):
        result = self.analyze(self.payload())
        self.assertEqual(set(result), {"status", "rows", "freigabe", "abdeckung"})
        self.assertEqual(result["abdeckung"], {
            "blockstatus": "GUELTIG", "deklarierte_befunde": 1,
            "gepruefte_befunde": 1, "freitext_zeichen": 0,
            "aussagen_gesamt": None, "vollstaendigkeit": "NICHT_NACHGEWIESEN",
        })
        self.assertEqual(result["status"], "GEPRUEFT")
        self.assertEqual(len(result["rows"]), 1)
        self.assertEqual(result["freigabe"], "NEIN")

    def test_coverage_extra_orphan_marker_rejects_entire_block(self):
        valid = self.payload()["text"]
        for marker in [bridge.BEGIN, bridge.END]:
            for text in [marker + "\n" + valid, valid + "\n" + marker]:
                with self.subTest(marker=marker, before=text.startswith(marker + "\n" + bridge.BEGIN)):
                    with self.assertRaises(bridge.BridgeError):
                        bridge._json_block(text)
                    self.assert_result(self.analyze({"text": text, "reads": []}),
                                       "FORMAT_FEHLER", "UNGUELTIG", free_text=len(text))

    def test_coverage_crlf_and_trailing_marker_whitespace_are_valid(self):
        payload = self.payload()
        payload["text"] = (bridge.BEGIN + " \t\r\n" + json.dumps([self.claim])
                           + "\r\n" + bridge.END + "\t \r\n")
        self.assertEqual(bridge._json_block(payload["text"]), [self.claim])
        result = self.analyze(payload)
        self.assertEqual(result["status"], "GEPRUEFT")
        self.assertIn("abdeckung", result)
        self.assertEqual(result["abdeckung"]["blockstatus"], "GUELTIG")
        self.assertEqual(result["abdeckung"]["freitext_zeichen"], 0)

    def test_coverage_paired_marker_wrappers_preserve_evidence(self):
        wrappers = ["", "**", "*", "__", "_", "`"]
        for begin_wrapper in wrappers:
            for end_wrapper in wrappers:
                for whitespace in ["", " \t"]:
                    with self.subTest(begin=begin_wrapper, end=end_wrapper, whitespace=whitespace):
                        payload = self.payload()
                        payload["text"] = (
                            whitespace + begin_wrapper + bridge.BEGIN + begin_wrapper + whitespace
                            + "\r\n" + json.dumps([self.claim]) + "\r\n"
                            + whitespace + end_wrapper + bridge.END + end_wrapper + whitespace + "\r\n"
                        )
                        result = self.analyze(payload)
                        self.assertEqual(result["status"], "GEPRUEFT")
                        self.assertEqual(bridge._json_block(payload["text"]), [self.claim])
                        self.assertEqual(result["abdeckung"]["blockstatus"], "GUELTIG")
                        self.assertEqual(result["abdeckung"]["gepruefte_befunde"], 1)
                        self.assertEqual(result["abdeckung"]["freitext_zeichen"], 0)
                        self.assertEqual(result["rows"][0]["pruefcode"], "BELEGKETTE_FORMAL_VOLLSTAENDIG")

    def test_coverage_formatted_orphan_markers_reject_entire_block(self):
        valid = self.payload()["text"]
        for wrapper in ["**", "*", "__", "_", "`"]:
            for marker in [bridge.BEGIN, bridge.END]:
                formatted = " \t" + wrapper + marker + wrapper + "\t "
                for index, text in enumerate([formatted, formatted + "\n" + valid, valid + "\n" + formatted]):
                    with self.subTest(wrapper=wrapper, marker=marker, case=index):
                        with self.assertRaises(bridge.BridgeError):
                            bridge._json_block(text)
                        self.assert_result(self.analyze({"text": text, "reads": []}),
                                           "FORMAT_FEHLER", "UNGUELTIG", free_text=len(text.strip()))

    def test_coverage_malformed_marker_wrappers_reject_entire_block(self):
        valid = self.payload()["text"]
        for opening, closing in [("**", "*"), ("*", "**"), ("__", "_"), ("_", "__"),
                                 ("`", ""), ("", "`"), ("**", "__"), ("***", "***"), ("``", "``")]:
            for marker in [bridge.BEGIN, bridge.END]:
                malformed = opening + marker + closing
                for index, text in enumerate([valid.replace(marker, malformed), valid + "\n" + malformed]):
                    with self.subTest(opening=opening, closing=closing, marker=marker, case=index):
                        with self.assertRaises(bridge.BridgeError):
                            bridge._json_block(text)
                        self.assert_result(self.analyze({"text": text, "reads": []}),
                                           "FORMAT_FEHLER", "UNGUELTIG", free_text=len(text))

    def test_coverage_marker_words_inside_json_strings_are_data(self):
        claim = copy.deepcopy(self.claim)
        claim["behauptung"] = (bridge.BEGIN + "\n" + bridge.END + "\n**" + bridge.BEGIN
                               + "**\n`" + bridge.END + "`")
        payload = self.payload(claim)
        self.assertEqual(bridge._json_block(payload["text"]), [claim])
        result = self.analyze(payload)
        self.assertEqual(result["status"], "GEPRUEFT")
        self.assertIn("abdeckung", result)
        self.assertEqual(result["abdeckung"]["blockstatus"], "GUELTIG")
        self.assertEqual(result["abdeckung"]["deklarierte_befunde"], 1)
        self.assertEqual(result["abdeckung"]["gepruefte_befunde"], 1)

    def test_coverage_unstructured_text_outside_block_remains_unchecked(self):
        payload = self.payload()
        payload["text"] = " alpha\n" + payload["text"] + "\nomega "
        result = self.analyze(payload)
        self.assertEqual(result["status"], "GEPRUEFT")
        self.assertIn("abdeckung", result)
        self.assertEqual(result["abdeckung"], {
            "blockstatus": "GUELTIG", "deklarierte_befunde": 1,
            "gepruefte_befunde": 1, "freitext_zeichen": 12,
            "aussagen_gesamt": None, "vollstaendigkeit": "NICHT_NACHGEWIESEN",
        })
        self.assertEqual(result["rows"][0]["freigabe"], "NEIN")

    def test_coverage_inline_marker_words_are_unstructured_text(self):
        text = "Uses " + bridge.BEGIN + " and " + bridge.END + "."
        self.assert_result(self.analyze({"text": " \n" + text + "\n ", "reads": []}),
                           "KEINE_STRUKTURIERTEN_BEFUNDE", "FEHLEND", free_text=len(text))

    def test_coverage_invalid_last_record_discards_all_rows(self):
        invalid = copy.deepcopy(self.claim)
        invalid["belege"][0]["zeile"] = "1"
        text = bridge.BEGIN + "\n" + json.dumps([self.claim, invalid]) + "\n" + bridge.END
        self.assert_result(self.analyze({"text": text, "reads": []}),
                           "FORMAT_FEHLER", "UNGUELTIG", declared=2, free_text=len(text))

    def test_coverage_three_claim_limit_remains_enforced(self):
        for count in [3, 4]:
            text = bridge.BEGIN + "\n" + json.dumps([self.claim] * count) + "\n" + bridge.END
            with self.subTest(count=count):
                result = self.analyze({"text": text, "reads": []})
                if count == 3:
                    self.assertEqual(result["status"], "GEPRUEFT")
                    self.assertEqual(len(result["rows"]), 3)
                    self.assertIn("abdeckung", result)
                    self.assertEqual(result["abdeckung"]["deklarierte_befunde"], 3)
                    self.assertEqual(result["abdeckung"]["gepruefte_befunde"], 3)
                else:
                    self.assert_result(result, "FORMAT_FEHLER", "UNGUELTIG", free_text=len(text))

    def test_json_block_character_limit_excludes_marker_line_delimiters(self):
        body = "[]" + " " * (bridge.MAX_JSON_CHARS - 2)
        try:
            records = bridge._json_block(bridge.BEGIN + "\n" + body + "\n" + bridge.END)
        except bridge.BridgeError:
            self.fail("A JSON body at the existing character limit must remain accepted")
        self.assertEqual(records, [])
        with self.assertRaises(bridge.BridgeError):
            bridge._json_block(bridge.BEGIN + "\n" + body + " \n" + bridge.END)

    def test_exact_chain_with_observed_read_stays_semantically_open(self):
        result = self.analyze(self.payload())
        self.assertEqual(result["status"], "GEPRUEFT")
        self.assertEqual(result["freigabe"], "NEIN")
        row = result["rows"][0]
        self.assertEqual(row["pruefcode"], "BELEGKETTE_FORMAL_VOLLSTAENDIG")
        self.assertEqual(row["schlussstatus"], "SCHLUSS_UNGEPRUEFT")
        self.assertEqual(row["freigabe"], "NEIN")
        self.assertEqual(row["werkzeugnachweis"], "READ_PFAD_UND_ZITAT_BEOBACHTET")

    def test_false_literal_is_not_confirmed_even_with_observed_read(self):
        claim = copy.deepcopy(self.claim)
        claim["fakten"][0]["literal"] = "THIS_IS_NOT_IN_THE_SOURCE"
        row = self.analyze(self.payload(claim))["rows"][0]
        self.assertEqual(row["pruefcode"], "FAKTREGEL_NICHT_BESTAETIGT")
        self.assertEqual(row["schlussstatus"], "SCHLUSS_UNBELEGT")
        self.assertEqual(row["freigabe"], "NEIN")

    def test_read_must_match_the_evidence_path_and_actual_output(self):
        cases = [
            ("missing", []),
            ("wrong path", [{"path": str(self.other), "content": self.quote}]),
            ("wrong output", [{"path": str(self.source), "content": "A different read result"}]),
            ("relative path", [{"path": "source.py", "content": self.quote}]),
        ]
        for label, reads in cases:
            with self.subTest(label=label):
                row = self.analyze(self.payload(reads=reads))["rows"][0]
                self.assertEqual(row["pruefcode"], "LESEBELEG_NICHT_BEOBACHTET")
                self.assertEqual(row["schlussstatus"], "SCHLUSS_UNBELEGT")
                self.assertEqual(row["freigabe"], "NEIN")
                self.assertEqual(row["werkzeugnachweis"], "READ_PFAD_UND_ZITAT_NICHT_BEOBACHTET")
                self.assertEqual(row["details"], [{"index": 1, "pruefcode": "OK"}])

    def test_every_evidence_requires_its_own_observed_read(self):
        claim = copy.deepcopy(self.claim)
        claim["belege"].append({"id": "B2", "datei": str(self.other), "zeile": 1, "zitat": self.quote})
        claim["pflichtbelege"].append("B2")
        row = self.analyze(self.payload(claim))["rows"][0]
        self.assertEqual(row["pruefcode"], "LESEBELEG_NICHT_BEOBACHTET")
        self.assertEqual(len(row["details"]), 2)

    def test_canonical_read_path_matches_source_alias(self):
        alias = str(self.root / "folder" / ".." / "source.py")
        (self.root / "folder").mkdir()
        row = self.analyze(self.payload(reads=[{"path": alias, "content": self.quote}]))["rows"][0]
        self.assertEqual(row["pruefcode"], "BELEGKETTE_FORMAL_VOLLSTAENDIG")

    def test_multiline_quote_requires_exact_contiguous_tool_output(self):
        second = 'DESCRIPTION = "ANOTHER_LOCAL_TEST_LINE"'
        self.source.write_text(self.quote + "\n" + second + "\n", encoding="utf-8")
        claim = copy.deepcopy(self.claim)
        claim["belege"][0]["zitat"] += "\n" + second
        for observed, expected in [
            (self.quote + "\n" + second, "BELEGKETTE_FORMAL_VOLLSTAENDIG"),
            ("1: " + self.quote + "\n2: " + second, "LESEBELEG_NICHT_BEOBACHTET"),
        ]:
            with self.subTest(expected=expected):
                row = self.analyze(self.payload(claim, [{"path": str(self.source), "content": observed}]))["rows"][0]
                self.assertEqual(row["pruefcode"], expected)
                self.assertEqual(row["freigabe"], "NEIN")

    def test_no_marker_is_never_a_positive_audit(self):
        text = "Ordinary answer without structured evidence."
        self.assert_result(self.analyze({"text": text, "reads": []}),
                           "KEINE_STRUKTURIERTEN_BEFUNDE", "FEHLEND", free_text=len(text))

    def test_empty_claim_list_is_never_a_positive_audit(self):
        text = bridge.BEGIN + "\n[]\n" + bridge.END
        self.assert_result(self.analyze({"text": text, "reads": []}),
                           "KEINE_STRUKTURIERTEN_BEFUNDE", "LEER")

    def test_broken_marker_or_json_is_format_error(self):
        for text in [bridge.BEGIN, bridge.END, bridge.BEGIN + "\n{broken\n" + bridge.END,
                     self.payload()["text"] + "\n" + self.payload()["text"]]:
            with self.subTest(text=text[:30]):
                self.assert_result(self.analyze({"text": text, "reads": []}),
                                   "FORMAT_FEHLER", "UNGUELTIG", free_text=len(text))

    def test_malformed_payload_is_format_error(self):
        for payload in [None, {}, {"text": 3, "reads": []}, {"text": "text", "reads": "invalid"},
                        {"text": "text", "reads": [{"path": str(self.source), "content": 3}]}]:
            with self.subTest(payload=payload):
                text = payload.get("text") if isinstance(payload, dict) else None
                self.assert_result(self.analyze(payload), "FORMAT_FEHLER", "UNBEKANNT",
                                   free_text=len(text.strip()) if isinstance(text, str) else 0)

    def test_invalid_claim_schema_is_format_error_without_partial_rows(self):
        invalid_status = copy.deepcopy(self.claim)
        invalid_status["behaupteter_status"] = "AUTOMATICALLY_APPROVED"
        invalid_evidence = copy.deepcopy(self.claim)
        invalid_evidence["belege"][0]["zeile"] = "1"
        for claim in [invalid_status, invalid_evidence]:
            with self.subTest(claim=claim):
                payload = self.payload(claim)
                self.assert_result(self.analyze(payload), "FORMAT_FEHLER", "UNGUELTIG",
                                   declared=1, free_text=len(payload["text"]))

    def test_plugin_contract_is_independent_of_build_or_plan_agent_name(self):
        for agent in ["build", "plan"]:
            payload = self.payload()
            payload["agent"] = agent
            row = self.analyze(payload)["rows"][0]
            self.assertEqual(row["pruefcode"], "BELEGKETTE_FORMAL_VOLLSTAENDIG")

    def test_output_contains_no_raw_claim_quote_path_or_read_text(self):
        claim = copy.deepcopy(self.claim)
        claim["behauptung"] = "PRIVATE_UNTRUSTED_CLAIM_TEXT"
        read_text = self.quote + " PRIVATE_UNTRUSTED_READ_TEXT"
        payload = self.payload(claim, [{"path": str(self.source), "content": read_text}])
        payload["text"] = "PRIVATE_UNTRUSTED_EXTRA_TEXT\n" + payload["text"]
        result = self.analyze(payload)
        serialized = json.dumps(result)
        for value in [claim["behauptung"], self.quote, str(self.source), "PRIVATE_UNTRUSTED_READ_TEXT",
                      "PRIVATE_UNTRUSTED_EXTRA_TEXT"]:
            self.assertNotIn(value, serialized)

    def run_cli(self, raw, *extra):
        return subprocess.run([sys.executable, "-B", str(Path(bridge.__file__).resolve()),
                               "--plugin-stdin", "--root", str(self.root), *extra],
                              input=raw, capture_output=True, timeout=15)

    def test_cli_stdout_is_one_utf8_json_object_with_open_result_and_no_files(self):
        before = set(self.root.iterdir())
        process = self.run_cli(json.dumps(self.payload(), ensure_ascii=False).encode("utf-8"))
        self.assertEqual(process.returncode, 0, process.stderr.decode("utf-8", errors="replace"))
        result = json.loads(process.stdout.decode("utf-8"))
        self.assertEqual(result["status"], "GEPRUEFT")
        self.assertEqual(result["rows"][0]["freigabe"], "NEIN")
        self.assertEqual(process.stderr, b"")
        self.assertEqual(set(self.root.iterdir()), before)

    def test_cli_format_result_uses_successful_transport_exit(self):
        process = self.run_cli(json.dumps({"text": bridge.BEGIN, "reads": []}).encode("utf-8"))
        self.assertEqual(process.returncode, 0)
        self.assertEqual(json.loads(process.stdout)["status"], "FORMAT_FEHLER")

    def test_cli_rejects_invalid_utf8_invalid_json_and_oversize_without_raw_error(self):
        for raw in [b"\xffPRIVATE_CLI_PAYLOAD", b"{PRIVATE_CLI_PAYLOAD", b" " * (1024 * 1024 + 1)]:
            with self.subTest(size=len(raw)):
                process = self.run_cli(raw)
                self.assertEqual(process.returncode, 2)
                self.assertEqual(process.stdout, b"")
                self.assertNotIn(b"PRIVATE_CLI_PAYLOAD", process.stderr)
                self.assertNotIn(str(self.root).encode("utf-8"), process.stderr)

    def test_cli_requires_root(self):
        process = subprocess.run([sys.executable, "-B", str(Path(bridge.__file__).resolve()), "--plugin-stdin"],
                                 input=b'{"text":"text","reads":[]}', capture_output=True, timeout=15)
        self.assertEqual(process.returncode, 2)
        self.assertEqual(process.stdout, b"")


if __name__ == "__main__":
    unittest.main()
