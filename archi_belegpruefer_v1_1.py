#!/usr/bin/env python3
"""Archi Guard: deterministischer, lesender Zeilen-/Zitat-Pruefer (stdlib).

Beispiel-Aufruf:
 python archi_belegpruefer.py --root E:\\MORPH-Studio --input claims.jsonl \
   --output ergebnisse.jsonl --agent-file C:\\Users\\...\\beleg-audit.md

Eingabe-JSONL pro Zeile:
 {"id":"M-1", "quelle":"beleg-audit", "behauptung":"...",
  "datei":"E:\\\\MORPH-Studio\\\\start-morph-ui.ps1", "zeile":55,
  "zitat":"Vollstaendige Originalzeile", "datei_sha256_audit":"optional"}

Nur der Beleg (Datei+Zeile+Zitat) wird geprueft, niemals die Schlussfolgerung.
Ausgabe enthaelt keine gelesenen Datei- oder Zitattexte.
"""

from __future__ import annotations

import argparse
import codecs
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import unittest

VERSION = "1.1.0"
MIN_LENGTH = 12
REVIEWER = f"skript:archi_belegpruefer/{VERSION}"

# Fuenzte Kategorie nur fuer nachgewiesene Fehler des Pruefers selbst.
# Nicht automatisch auf Agentenbefunde anwenden.
URSACHENKLASSEN = (
    "fehlende_datei", "falsche_zeile", "unzulaessiger_schluss",
    "ungeeignete_anweisung", "pruefer_fehler_oder_spezifikationsluecke",
)


def fingerprint(value: object) -> dict[str, object]:
    """Nur SHA-256 und Laenge; niemals unkontrollierten Agententext speichern."""
    raw = value if isinstance(value, str) else str(value)
    return {"sha256": sha256(raw.encode("utf-8")), "laenge": len(raw)}



def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# Einheitliche Geheimnisnamen-Pruefung fuer Dateien und Verzeichnisbestandteile.
# Eine Extension-Allowlist allein verhindert keine geheimen Inhalte in erlaubten Dateien.
DENY_NAMES = frozenset({".npmrc", ".netrc", ".pypirc", ".gitconfig", ".git-credentials",
                        "credentials", "credentials.json", "id_rsa", "id_ed25519"})
DENY_DIRS = frozenset({".git", ".ssh", ".aws", ".kube", ".gnupg", "secrets"})
DENY_ENDINGS = (".pem", ".p12", ".pfx", ".key", ".keystore")
VALID_SOURCES = frozenset({"beleg-audit", "regression", "manuell", "review", "claude", "chatgpt", "extern"})
ID_RE = re.compile(r"[A-Za-z0-9_.-]{1,64}\Z", re.ASCII)


def safe_suffix(path: Path) -> bool:
    """Sperrt erkennbare Geheimnisdateien in allen Verzeichnisebenen."""
    for n in (part.casefold() for part in path.parts):
        if (".env" in n or n in DENY_NAMES or n in DENY_DIRS
                or n.endswith(DENY_ENDINGS)):
            return False
    return True


def suspicious_path(raw: str) -> bool:
    """Offensichtliche Windows-Aliasse und Sonderpfade vor IO ablehnen."""
    if raw.startswith(("\\\\", "//", "\\\\?\\", "\\\\.\\")):
        return True  # UNC, Device- und Extended-Length-Pfade
    # ADS: C:\ ist nur am Laufwerksanfang erlaubt, jedes weitere ':' wird verworfen.
    rest = raw[2:] if re.match(r"^[A-Za-z]:[\\/]", raw) else raw
    if ":" in rest:
        return True
    parts = re.split(r"[\\/]", raw)
    if any(p in {"..", "."} or (p and p[-1] in ". ") or re.search(r"~[0-9]+(?:\.|$)", p)
           for p in parts):
        return True
    return False


def allowed_path(raw: str, roots: tuple[Path, ...]) -> tuple[Path | None, str | None]:
    if not isinstance(raw, str) or not raw or "\x00" in raw or suspicious_path(raw):
        return None, "PFAD_VERBOTEN"
    path = Path(raw)
    if not path.is_absolute() or not safe_suffix(path):
        return None, "PFAD_VERBOTEN"
    try:
        real = path.resolve(strict=True)
    except FileNotFoundError:
        # Fehlende Dateien innerhalb vertrauter Wurzeln duerfen als solche gemeldet werden.
        parent = path.parent.resolve(strict=False)
        if not any(parent == root or root in parent.parents for root in roots):
            return None, "PFAD_VERBOTEN"
        if not safe_suffix(parent):
            return None, "PFAD_VERBOTEN"
        return None, "DATEI_FEHLT"
    except (OSError, RuntimeError, ValueError):
        return None, "DATEI_NICHT_LESBAR"
    if not any(real == root or root in real.parents for root in roots):
        return None, "PFAD_VERBOTEN"
    if not safe_suffix(real):
        return None, "PFAD_VERBOTEN"
    if not real.is_file():
        return None, "DATEI_FEHLT"
    return real, None


def decode_source(raw: bytes) -> str:
    if raw.startswith(codecs.BOM_UTF8):
        return raw.decode("utf-8-sig", errors="strict")
    if raw.startswith(codecs.BOM_UTF32_LE) or raw.startswith(codecs.BOM_UTF32_BE):
        return raw.decode("utf-32", errors="strict")
    if raw.startswith(codecs.BOM_UTF16_LE) or raw.startswith(codecs.BOM_UTF16_BE):
        return raw.decode("utf-16", errors="strict")
    try:
        return raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="strict")


def normalized_lines(text: str) -> list[str]:
    """Nur echte CR/LF trennen, nicht Form-Feed oder andere Steuerzeichen."""
    if not text:
        return []
    parts = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    return parts[:-1] if parts and parts[-1] == "" else parts


def verify(record: object, roots: tuple[Path, ...], agent_hash: str | None = None) -> dict:
    result = {
        "datum": datetime.now(timezone.utc).isoformat(),
        "pruefer": REVIEWER,
        "status": "UNBESTAETIGT",  # Keine Aussage wird automatisch als wahr eingestuft.
        "belegstatus": "BELEG_NICHT_BESTAETIGT",
        "schlussstatus": "SCHLUSS_UNGEPRUEFT",
        "pruefcode": "FORMAT_FEHLER",
        "ursache_vorschlag": None,  # Klassifizierung niemals endgueltig setzen.
        "agent_sha256": agent_hash,
    }
    if not isinstance(record, dict):
        return result
    if not all(key in record for key in ("id", "quelle", "behauptung", "datei", "zeile", "zitat")):
        return result
    # Freitext bleibt ausschliesslich in der Eingabe-JSONL.
    # Keine unkontrollierten Werte einschliesslich Dateipfade im Ausgabeprotokoll.
    for key in ("id", "quelle", "behauptung", "datei"):
        fp = fingerprint(record[key])
        result[f"{key}_sha256"] = fp["sha256"]
        result[f"{key}_laenge"] = fp["laenge"]
    file, line, quote = record["datei"], record["zeile"], record["zitat"]
    if (not isinstance(record["id"], str) or not ID_RE.fullmatch(record["id"])
            or not isinstance(record["quelle"], str)
            or record["quelle"].casefold() not in VALID_SOURCES
            or not isinstance(record["behauptung"], str)
            or not isinstance(file, str) or not isinstance(line, int) or isinstance(line, bool)
            or line < 1 or not isinstance(quote, str) or not quote):
        result["ursache_vorschlag"] = "ungeeignete_anweisung"
        return result
    result["zeile"] = line
    expected_sha = record.get("datei_sha256_audit")
    if expected_sha is not None and (not isinstance(expected_sha, str)
                                     or not re.fullmatch(r"[a-fA-F0-9]{64}", expected_sha)):
        result["ursache_vorschlag"] = "ungeeignete_anweisung"
        return result
    path, error = allowed_path(file, roots)
    if error:
        result["pruefcode"] = error
        if error == "DATEI_FEHLT":
            result["ursache_vorschlag"] = "fehlende_datei"
        return result
    assert path is not None
    # Ab hier ist der Pfad freigegeben. Niemals einen Zitat-Hash fuer verbotene Pfade ausgeben.
    result["zitat_sha256"] = sha256(quote.encode("utf-8"))
    result["zitat_laenge"] = len(quote)
    try:
        before = path.stat()
        raw = path.read_bytes()
        after = path.stat()
        if (before.st_mtime_ns != after.st_mtime_ns or before.st_size != after.st_size
                or len(raw) != after.st_size):
            result["pruefcode"] = "DATEI_GEAENDERT"
            return result
        result["datei_sha256_pruefung"] = sha256(raw)
        result["datei_mtime_ns"] = after.st_mtime_ns
        result["audit_dateistand"] = "VERGLICHEN" if expected_sha else "UNBEKANNT"
        if expected_sha and expected_sha.casefold() != result["datei_sha256_pruefung"]:
            result["pruefcode"] = "DATEI_GEAENDERT"
            return result
        text = decode_source(raw)
    except (OSError, UnicodeError, ValueError):
        result["pruefcode"] = "DATEI_NICHT_LESBAR"
        return result
    lines = normalized_lines(text)
    target = normalized_lines(quote)
    if not target or any(not t.strip() for t in target):
        result["pruefcode"] = "ZITAT_ENTHAELT_LEERZEILE"
        return result
    if len(quote.strip()) < MIN_LENGTH:
        result["pruefcode"] = "ZITAT_ZU_KURZ"
        return result
    offset = line - 1
    result["zeile_existiert"] = offset < len(lines)
    if offset + len(target) <= len(lines) and lines[offset:offset + len(target)] == target:
        result["pruefcode"] = "OK"
        result["belegstatus"] = "BELEG_GEPRUEFT"
        return result
    # Exakte Fundstellen IMMER vor ungueltiger Positionsangabe suchen.
    others = [i + 1 for i in range(len(lines) - len(target) + 1)
              if lines[i:i + len(target)] == target]
    if others:
        result["pruefcode"] = "ZITAT_ANDERE_ZEILE"
        result["andere_zeilen"] = others[:10]
        result["weitere_fundstellen"] = max(0, len(others) - 10)
        result["ursache_vorschlag"] = "falsche_zeile"
    elif offset + len(target) <= len(lines) and all(
            actual.lstrip(" \t") == expected.lstrip(" \t")
            for actual, expected in zip(lines[offset:offset + len(target)], target)):
        # Nur fuehrende Einrueckung. Kein Teilzitat, keine korrigierten Woerter.
        result["pruefcode"] = "OK_NORMALISIERT"
        result["belegstatus"] = "BELEG_NUR_NORMALISIERT"
    elif offset + len(target) > len(lines):
        result["pruefcode"] = "ZEILE_FEHLT"
        result["ursache_vorschlag"] = "falsche_zeile"
    else:
        result["pruefcode"] = "ZITAT_ABWEICHEND"
    return result


def cli() -> int:
    parser = argparse.ArgumentParser(description="Archi Guard Belegpruefer – rein lesender Quellenabgleich")
    parser.add_argument("--self-test", action="store_true", help="Integrierte Offline-Regressionstests")
    parser.add_argument("--root", action="append", help="Freigegebene lokale Wurzel; mehrfach moeglich")
    parser.add_argument("--input", help="Eingabe JSONL")
    parser.add_argument("--output", help="Ergebnis JSONL (wird nur angehaengt)")
    parser.add_argument("--agent-file", help="Optionale Agenten-MD-Datei nur fuer SHA-256")
    args = parser.parse_args()
    if args.self_test:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(RegressionTests)
        outcome = unittest.TextTestRunner(verbosity=2).run(suite)
        return 0 if outcome.wasSuccessful() else 1
    if not args.root or not args.input or not args.output:
        parser.error("--root, --input und --output sind erforderlich")
    try:
        roots = tuple(Path(r).resolve(strict=True) for r in args.root)
        if not all(r.is_dir() for r in roots):
            raise ValueError("Wurzel muss ein existierendes Verzeichnis sein")
        if any(r == Path(r.anchor) for r in roots):
            raise ValueError("Laufwerks- oder Dateisystem-Wurzel als Freigabe nicht erlaubt")
        if any(not safe_suffix(r) for r in roots):
            raise ValueError("Geheimnis-Verzeichnis nicht als Wurzel erlaubt")
        inp = Path(args.input).resolve(strict=True)
        if not inp.is_file():
            raise ValueError("Eingabe ist keine Datei")
        original_out = Path(args.output)
        if original_out.is_symlink():
            raise ValueError("Ausgabe darf kein Symlink sein")
        out = original_out.resolve(strict=False)
        if out == inp or (out.exists() and not out.is_file()):
            raise ValueError("Ausgabe darf nicht die Eingabe oder ein Symlink sein")
        if not out.parent.exists():
            raise ValueError("Ausgabeverzeichnis existiert nicht")
        agent_hash = sha256(Path(args.agent_file).read_bytes()) if args.agent_file else None
        total, failed = 0, 0
        with inp.open("r", encoding="utf-8-sig") as source, out.open("a", encoding="utf-8", newline="\n") as dest:
            for rawline in source:
                if not rawline.strip():
                    continue
                try:
                    rec = json.loads(rawline)
                except json.JSONDecodeError:
                    rec = None
                answer = verify(rec, roots, agent_hash)
                total += 1
                answer["datensatz_index"] = total  # Kein unkontrollierter Eingabe-ID-Text.
                dest.write(json.dumps(answer, ensure_ascii=False, separators=(",", ":")) + "\n")
                failed += answer["pruefcode"] != "OK"
                print(f"[{total}] {answer['pruefcode']}")
        print(f"Belege: {total} | OK: {total-failed} | nicht bestaetigt: {failed}")
        return 1 if failed or total == 0 else 0
    except (OSError, ValueError, UnicodeError) as exc:
        print(f"FEHLER: {type(exc).__name__} (Details nicht protokolliert)", file=sys.stderr)
        return 2


class RegressionTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.addCleanup(self.td.cleanup)
        self.root = Path(self.td.name) / "frei"
        self.root.mkdir()
        self.roots = (self.root.resolve(),)
        self.file = self.root / "code.ps1"
        self.line1 = "Write-Host 'Änderung bestätigt'"
        self.line2 = "$status = 'läuft zuverlässig'"
        self.file.write_text(self.line1 + "\n" + self.line2 + "\n", encoding="utf-8")

    def record(self, path=None, line=1, quote=None, **extra):
        return {"id": "T1", "quelle": "Regression", "behauptung": "Eine Behauptung",
                "datei": str(path or self.file), "zeile": line,
                "zitat": self.line1 if quote is None else quote, **extra}

    def check(self, expected, **kwargs):
        res = verify(self.record(**kwargs), self.roots)
        self.assertEqual(res["pruefcode"], expected, res)
        self.assertEqual(res["schlussstatus"], "SCHLUSS_UNGEPRUEFT")
        return res

    def test_01_richtige_zeile(self):
        res = self.check("OK")
        self.assertEqual(res["belegstatus"], "BELEG_GEPRUEFT")

    def test_02_falsche_zeile(self):
        res = self.check("ZITAT_ANDERE_ZEILE", line=2)
        self.assertEqual(res["andere_zeilen"], [1])

    def test_03_datei_fehlt(self):
        self.check("DATEI_FEHLT", path=self.root / "fehlt.ps1")

    def test_04_zeile_fehlt(self):
        self.check("ZEILE_FEHLT", line=50, quote="Text, der nicht vorkommt")

    def test_05_zitat_abweichend(self):
        self.check("ZITAT_ABWEICHEND", quote="Write-Host 'komplett falsch'")

    def test_06_crlf(self):
        self.file.write_bytes((self.line1 + "\r\n" + self.line2 + "\r\n").encode("utf-8"))
        self.check("OK")

    def test_07_utf8_bom(self):
        self.file.write_bytes(codecs.BOM_UTF8 + (self.line1 + "\n").encode("utf-8"))
        self.check("OK")

    def test_08_umlaut_cp1252(self):
        self.file.write_bytes((self.line1 + "\r\n").encode("cp1252"))
        self.check("OK")

    def test_09_mehrzeilig(self):
        self.check("OK", quote=self.line1 + "\n" + self.line2)

    def test_10_dotdot_verboten(self):
        self.check("PFAD_VERBOTEN", path=str(self.root / "inner" / ".." / "code.ps1"))

    def test_11_env_verboten(self):
        p = self.root / ".env"
        p.write_text("ARCHI_FAKE=NICHT-ECHT", encoding="utf-8")
        self.check("PFAD_VERBOTEN", path=p)

    def test_12_env_unterordner_windows_variante(self):
        folder = self.root / "Unterordner"
        folder.mkdir()
        p = folder / ".ENV.local"
        p.write_text("ARCHI_FAKE=NICHT-ECHT", encoding="utf-8")
        self.check("PFAD_VERBOTEN", path=p)

    def test_13_extern_verboten(self):
        outside = Path(self.td.name) / "aussen.txt"
        outside.write_text(self.line1, encoding="utf-8")
        self.check("PFAD_VERBOTEN", path=outside)

    def test_14_utf16_bom(self):
        self.file.write_bytes((self.line1 + "\r\n").encode("utf-16"))
        self.check("OK")

    def test_15_utf32_bom(self):
        self.file.write_bytes((self.line1 + "\r\n").encode("utf-32"))
        self.check("OK")

    def test_16_envrc_verboten(self):
        p = self.root / ".envrc"
        p.write_text("ARCHI_FAKE=NICHT-ECHT", encoding="utf-8")
        self.check("PFAD_VERBOTEN", path=p)

    def test_18_hash_abweichung(self):
        self.check("DATEI_GEAENDERT", datei_sha256_audit="0" * 64)

    def test_17_kurzes_zitat(self):
        self.check("ZITAT_ZU_KURZ", quote="if")

    def test_19_unvollstaendiger_datensatz(self):
        result = verify({"datei": str(self.file)}, self.roots)
        self.assertEqual(result["pruefcode"], "FORMAT_FEHLER")

    def test_20_symlink_nach_aussen(self):
        outside = Path(self.td.name) / "aussen.txt"
        outside.write_text(self.line1, encoding="utf-8")
        link = self.root / "link.txt"
        try:
            link.symlink_to(outside)
        except (OSError, NotImplementedError):
            self.skipTest("Berechtigung zur Symlink-Erzeugung fehlt")
        self.check("PFAD_VERBOTEN", path=link)



    def test_21_zeile_nach_dateiende_zitat_frueher(self):
        res = self.check("ZITAT_ANDERE_ZEILE", line=999)
        self.assertEqual(res["andere_zeilen"], [1])

    def test_22_zitat_mehrfach_alle_fundstellen(self):
        self.file.write_text((self.line1 + "\n" + self.line2 + "\n") * 3, encoding="utf-8")
        res = self.check("ZITAT_ANDERE_ZEILE", line=999)
        self.assertEqual(res["andere_zeilen"], [1, 3, 5])

    def test_23_zeile_fehlt_und_zitat_kommt_nicht_vor(self):
        self.check("ZEILE_FEHLT", line=999, quote="Das ist definitiv nicht im Text")

    def test_24_eingabefreitext_bleibt_aus_protokoll(self):
        geheim = "FAKE_TOKEN_9f3X_NICHT_ECHT"
        rec = self.record()
        rec.update({"id": geheim, "quelle": geheim, "behauptung": geheim,
                    "zitat": geheim})
        res = verify(rec, self.roots)
        self.assertNotIn(geheim, json.dumps(res, ensure_ascii=False))
        self.assertIn("behauptung_sha256", res)
        self.assertIn("behauptung_laenge", res)

    def test_25_verbotener_pfad_bleibt_aus_protokoll(self):
        geheim = "FAKE_TOKEN_6u7Q_NICHT_ECHT"
        p = self.root / geheim / ".env"
        res = verify(self.record(path=p, quote=geheim), self.roots)
        self.assertEqual(res["pruefcode"], "PFAD_VERBOTEN")
        self.assertNotIn(geheim, json.dumps(res, ensure_ascii=False))

    def test_26_korrektes_zitat_nach_fix_erhalten(self):
        res = self.check("OK")
        self.assertEqual(res["belegstatus"], "BELEG_GEPRUEFT")
        self.assertEqual(res["schlussstatus"], "SCHLUSS_UNGEPRUEFT")

    def test_27_v1_verwaltete_ursachenklasse(self):
        self.assertIn("pruefer_fehler_oder_spezifikationsluecke", URSACHENKLASSEN)



    def test_28_jsonl_klartextfrei_end_to_end(self):
        import subprocess
        geheim = "FAKE_SECRET_d8m2_AUSSCHLIESSLICH_TEST"
        inp = Path(self.td.name) / "eingabe.jsonl"
        out = Path(self.td.name) / "ergebnis.jsonl"
        rec = self.record()
        rec.update({"id": "TEST-28", "quelle": "beleg-audit", "behauptung": geheim,
                    "zitat": geheim, "datei": str(self.root / geheim / ".env")})
        inp.write_text(json.dumps(rec, ensure_ascii=False) + "\n", encoding="utf-8")
        proc = subprocess.run([sys.executable, str(Path(__file__).resolve()),
              "--root", str(self.root), "--input", str(inp), "--output", str(out)],
              text=True, capture_output=True)
        self.assertEqual(proc.returncode, 1, proc.stderr)
        logged = out.read_text(encoding="utf-8")
        self.assertNotIn(geheim, logged)
        obj = json.loads(logged)
        self.assertEqual(obj["pruefcode"], "PFAD_VERBOTEN")
        self.assertEqual(obj["datensatz_index"], 1)

    def test_29_cli_ohne_root_wehrt_ab(self):
        import subprocess
        proc = subprocess.run([sys.executable, str(Path(__file__).resolve()),
               "--input", "a.jsonl", "--output", "b.jsonl"],
               text=True, capture_output=True)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("--root", proc.stderr)

    def test_30_ergebnisdatei_wird_angehaengt(self):
        import subprocess
        inp = Path(self.td.name) / "eingabe.jsonl"
        out = Path(self.td.name) / "ergebnis.jsonl"
        inp.write_text(json.dumps(self.record(), ensure_ascii=False) + "\n", encoding="utf-8")
        out.write_text("VORHANDEN\n", encoding="utf-8")
        proc = subprocess.run([sys.executable, str(Path(__file__).resolve()),
               "--root", str(self.root), "--input", str(inp), "--output", str(out)],
               text=True, capture_output=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        lines = out.read_text(encoding="utf-8").splitlines()
        self.assertEqual(lines[0], "VORHANDEN")
        self.assertEqual(json.loads(lines[1])["pruefcode"], "OK")


    def test_31_geheimnamen_prod_secrets_app_bak(self):
        for name in ("prod.env", "secrets.env", "app.env.bak", ".npmrc", ".netrc", "my.envrc"):
            with self.subTest(name=name):
                p = self.root / name
                p.write_text(self.line1, encoding="utf-8")
                res = self.check("PFAD_VERBOTEN", path=p)
                self.assertNotIn("zitat_sha256", res)

    def test_32_formfeed_zaehlt_nicht_als_neue_zeile(self):
        self.file.write_text("Vorlauf\fWeitere Zeichen\n" + self.line1 + "\n", encoding="utf-8")
        res = self.check("OK", line=2)
        self.assertEqual(res["zeile"], 2)

    def test_33_einrueckung_normalisiert_nicht_freigeben(self):
        self.file.write_text("    " + self.line1 + "\n", encoding="utf-8")
        res = self.check("OK_NORMALISIERT")
        self.assertEqual(res["belegstatus"], "BELEG_NUR_NORMALISIERT")
        self.assertEqual(res["status"], "UNBESTAETIGT")

    def test_34_keine_teilzitate_als_normalisiert(self):
        self.check("ZITAT_ABWEICHEND", quote="Write-Host 'Änderung")

    def test_35_leerzeile_anderer_code(self):
        self.check("ZITAT_ENTHAELT_LEERZEILE", quote=self.line1 + "\n\n" + self.line2)

    def test_36_quelle_und_id_ungueltig(self):
        rec = self.record()
        rec["quelle"] = "nicht-bekannt"
        self.assertEqual(verify(rec, self.roots)["pruefcode"], "FORMAT_FEHLER")
        rec["quelle"] = "beleg-audit"
        rec["id"] = "../secret"
        self.assertEqual(verify(rec, self.roots)["pruefcode"], "FORMAT_FEHLER")

    def test_37_keine_zitat_sha_bei_verbotenem_pfad(self):
        p = self.root / "secrets.env"
        p.write_text(self.line1, encoding="utf-8")
        result = verify(self.record(path=p, quote="FAKE_SECRET_123456789"), self.roots)
        self.assertEqual(result["pruefcode"], "PFAD_VERBOTEN")
        self.assertNotIn("zitat_sha256", result)

    def test_38_kein_root_dateisystem(self):
        import subprocess
        inp = Path(self.td.name) / "eingabe.jsonl"
        out = Path(self.td.name) / "ergebnis.jsonl"
        inp.write_text(json.dumps(self.record(), ensure_ascii=False) + "\n", encoding="utf-8")
        result = subprocess.run([sys.executable, str(Path(__file__).resolve()),
             "--root", str(Path(self.root.anchor)), "--input", str(inp), "--output", str(out)],
             capture_output=True, text=True)
        self.assertEqual(result.returncode, 2, result.stdout)
        self.assertIn("FEHLER", result.stderr)
        self.assertFalse(out.exists())

    def test_39_windows_ads_und_unc_statisch_verboten(self):
        for raw in (r"C:\Projekt\.env::$DATA", r"\\server\share\file.ps1", r"C:\PROJEKT\SECRET~1.ENV"):
            with self.subTest(raw=raw):
                self.assertTrue(suspicious_path(raw))

    def test_40_ursache_nicht_als_gewissheit(self):
        res = self.check("ZITAT_ABWEICHEND", quote="Dies ist eine ausreichend lange falsche Zeile")
        self.assertIsNone(res["ursache_vorschlag"])
        self.assertNotIn("ursachenklasse", res)

    def test_41_grosse_kleinschreibung_geheimname(self):
        p = self.root / "PROD.ENV"
        p.write_text(self.line1, encoding="utf-8")
        self.check("PFAD_VERBOTEN", path=p)

    def test_42_ausgabe_keine_geheimwerte_bei_ok(self):
        geheim = "FAKE_NOT_REAL_12345_SECRET"
        rec = self.record()
        rec["behauptung"] = geheim
        res = verify(rec, self.roots)
        self.assertEqual(res["pruefcode"], "OK")
        self.assertNotIn(geheim, json.dumps(res))



if __name__ == "__main__":
    sys.exit(cli())
