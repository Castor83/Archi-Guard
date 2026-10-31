#!/usr/bin/env python3
"""Archi Guard V2 (0.1): konservatives, deterministisches Belegketten-Gate.

Verwendung (im selben Ordner wie archi_belegpruefer_v1_1.py):
  py archi_schlusspruefer_v2.py --self-test
  py archi_schlusspruefer_v2.py --root E:\\MORPH-Studio \
      --input morph-....jsonl --output v2-ergebnis.jsonl

Verarbeitet die bisherigen V1-Eingaben direkt (datei/zeile/zitat).
Erweitertes JSONL-Eingabeformat (zusaetzliche Felder):
  {"id":"M1","quelle":"beleg-audit","behauptung":"...",
   "behaupteter_status":"BEWIESEN",
   "belege":[{"id":"B1","datei":"...","zeile":55,"zitat":"..."}],
   "pflichtbelege":["B1"],
   "fakten":[{"typ":"QUELLZEILE_ENTHAELT", "beleg_id":"B1",
              "literal":"127.0.0.1"}]}

V2 prueft nur: Sind erforderliche Belege da, originalgetreu, und decken
verifizierte Zeilenzitate die *formal eingeschraenkte* Fakt-Regel ab?
Die semantische Richtigkeit frei formulierter Schlussfolgerungen wird NIE
maschinell bestaetigt. Ein BEWIESEN-Label ohne Belegketten-/Logikbeweis
wird als nicht freigegeben ausgewiesen. Keine externe KI / kein Netzwerk.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest

try:
    from archi_belegpruefer_v1_1 import (verify as v1_verify, sha256, safe_suffix,
                                        VERSION as V1_VERSION)
except ImportError as exc:
    raise SystemExit("FEHLER: archi_belegpruefer_v1_1.py muss im selben Ordner liegen") from exc

VERSION = "2.0.0-alpha1"
ID_RE = re.compile(r"[A-Za-z0-9_.-]{1,64}\Z", re.ASCII)
STATUSES = frozenset({"BEWIESEN", "VERMUTUNG", "UNBEKANNT"})
MAX_BELEGE = 24
MAX_FAKTEN = 24


def _hash(v: object) -> str:
    return hashlib.sha256((v if isinstance(v, str) else str(v)).encode("utf-8")).hexdigest()


def _result():
    return {
        "datum": datetime.now(timezone.utc).isoformat(),
        "pruefer": f"skript:archi_schlusspruefer/{VERSION}",
        "basis_pruefer": f"archi_belegpruefer/{V1_VERSION}",
        "pruefcode": "FORMAT_FEHLER",
        "belegketten_status": "UNVOLLSTAENDIG",
        "schlussstatus": "SCHLUSS_UNBELEGT",
        "freigabe": "NEIN",
        "belege_gesamt": 0,
        "belege_exakt": 0,
        "fakten_geprueft": 0,
        "fakten_ungeklaert": 0,
        "details": [],
    }


def _ident(v):
    return isinstance(v, str) and ID_RE.fullmatch(v) is not None


def pruefen(record: object, roots: tuple[Path, ...], agent_hash: str | None = None) -> dict:
    """Kein Text/Zitat/Pfad aus dem Eingabedatensatz fliesst in die Ausgabe."""
    out = _result()
    if not isinstance(record, dict):
        return out
    if not all(k in record for k in ("id", "quelle", "behauptung")):
        return out
    if not _ident(record["id"]) or not isinstance(record["behauptung"], str):
        return out
    # Keine ID / Beschreibung / Quelle aus Agententext unveraendert zurueckschreiben.
    out["id_sha256"] = _hash(record["id"])
    out["behauptung_sha256"] = _hash(record["behauptung"])
    out["behauptung_laenge"] = len(record["behauptung"])
    out["agent_sha256"] = agent_hash
    status = record.get("behaupteter_status", "UNBEKANNT")
    if not isinstance(status, str) or status not in STATUSES:
        return out
    out["behaupteter_status"] = status

    legacy = "belege" not in record
    if legacy:
        # Bestehende MORPH-V1-JSONL ohne Konvertierung lesen.
        evidences = [{"id": "B1", **{k: record[k] for k in
                      ("datei", "zeile", "zitat", "datei_sha256_audit") if k in record}}]
    else:
        evidences = record["belege"]
    if (not isinstance(evidences, list) or not (1 <= len(evidences) <= MAX_BELEGE)
            or any(not isinstance(e, dict) or not _ident(e.get("id")) for e in evidences)):
        return out
    evid_ids = [e["id"] for e in evidences]
    if len(set(evid_ids)) != len(evid_ids):
        return out

    obligations = record.get("pflichtbelege")
    if obligations is not None and (not isinstance(obligations, list)
        or not obligations or len(obligations) > MAX_BELEGE
        or any(not _ident(k) for k in obligations)
        or len(set(obligations)) != len(obligations)):
        return out

    missing = sorted(set(obligations or ()) - set(evid_ids))
    # Belege, die nicht in der Pflichtliste stehen, duerfen nie ein OK erschleichen.
    unlisted = bool(obligations and (set(evid_ids) - set(obligations)))
    out["pflichtbelege_deklariert"] = obligations is not None
    out["fehlende_pflichtbelege"] = len(missing)
    out["ungenannte_belege"] = len(set(evid_ids) - set(obligations)) if obligations else 0
    out["belege_gesamt"] = len(evidences)

    by_id = {}
    all_exact = True
    some_normalized = False
    for idx, e in enumerate(evidences, 1):
        partial = {**e, "quelle": record["quelle"], "behauptung": record["behauptung"]}
        # V1-Validierung der Belege erhaelt den unabhaengigen Abgleich gegen Originaldatei.
        # IDs koennen fuer V1 auf maschinengepruefte Werte normalisiert werden.
        partial["id"] = record["id"]
        vr = v1_verify(partial, roots, agent_hash)
        code = vr["pruefcode"]
        by_id[e["id"]] = {"code": code, "original": e}
        out["details"].append({"index": idx, "pruefcode": code})
        out["belege_exakt"] += code == "OK"
        all_exact &= code == "OK"
        some_normalized |= code == "OK_NORMALISIERT"

    facts = record.get("fakten", [])
    if not isinstance(facts, list) or len(facts) > MAX_FAKTEN:
        return out
    for item in facts:
        if (not isinstance(item, dict)
            or item.get("typ") != "QUELLZEILE_ENTHAELT"
            or not _ident(item.get("beleg_id"))
            or not isinstance(item.get("literal"), str)
            or not item["literal"] or len(item["literal"]) > 512):
            return out
        target = by_id.get(item["beleg_id"])
        # Text wird nur an Belegen geprueft, die V1 exakt verifiziert hat.
        if target is not None and target["code"] == "OK" and item["literal"] in target["original"].get("zitat", ""):
            out["fakten_geprueft"] += 1
        else:
            out["fakten_ungeklaert"] += 1

    if missing or unlisted or not obligations:
        out["pruefcode"] = "BELEGKETTE_UNVOLLSTAENDIG"
        out["belegketten_status"] = "UNVOLLSTAENDIG"
    elif not all_exact:
        out["pruefcode"] = "BELEGE_NICHT_EXAKT"
        out["belegketten_status"] = "NUR_NORMALISIERT" if some_normalized and all(
            entry["code"] in {"OK_NORMALISIERT", "OK"} for entry in by_id.values()) else "ABGELEHNT"
    elif out["fakten_ungeklaert"]:
        out["pruefcode"] = "FAKTREGEL_NICHT_BESTAETIGT"
        out["belegketten_status"] = "EXAKT"
    else:
        out["pruefcode"] = "BELEGKETTE_FORMAL_VOLLSTAENDIG"
        out["belegketten_status"] = "EXAKT"
        # Selbst eine formale Kette beweist keine freie Programmfehler-Diagnose.
        out["schlussstatus"] = "SCHLUSS_UNGEPRUEFT"

    # Keine automatische Freigabe semantischer Agentenbehauptungen.
    # Bei BEWIESEN besonders deutlich machen, dass der Status nicht gestuetzt ist.
    out["freigabe"] = "NEIN"
    return out


def _roots(values: list[str]) -> tuple[Path, ...]:
    if not values:
        raise ValueError("missing roots")
    result = tuple(Path(r).resolve(strict=True) for r in values)
    if any(not p.is_dir() or p == Path(p.anchor) or not safe_suffix(p) for p in result):
        raise ValueError("invalid root")
    return result


def cli() -> int:
    p = argparse.ArgumentParser(description="Archi Guard V2: Belegketten-Gate und konservative Schlusspruefung")
    p.add_argument("--self-test", action="store_true", help="Offline-Regressionstests")
    p.add_argument("--root", action="append", help="Freigegebene Wurzel (mehrfach moeglich)")
    p.add_argument("--input", help="V1- oder V2-JSONL-Eingabe")
    p.add_argument("--output", help="Ergebnis-JSONL; nur anhaengen")
    p.add_argument("--agent-file", help="Agenten-MD-Datei fuer SHA-256")
    a = p.parse_args()
    if a.self_test:
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests))
        return 0 if result.wasSuccessful() else 1
    if not a.root or not a.input or not a.output:
        p.error("--root, --input und --output benoetigt")
    try:
        roots = _roots(a.root)
        inp = Path(a.input).resolve(strict=True)
        original_out = Path(a.output)
        if original_out.is_symlink():
            raise ValueError("symlink output rejected")
        out = original_out.resolve(strict=False)
        if (not inp.is_file() or inp == out or not out.parent.is_dir()
            or (out.exists() and not out.is_file())):
            raise ValueError("input/output path rejected")
        agent_hash = sha256(Path(a.agent_file).read_bytes()) if a.agent_file else None
        count, flagged = 0, 0
        with inp.open("r", encoding="utf-8-sig") as src, out.open("a", encoding="utf-8") as dst:
            for raw in src:
                if not raw.strip():
                    continue
                try:
                    rec = json.loads(raw)
                except json.JSONDecodeError:
                    rec = None
                v = pruefen(rec, roots, agent_hash)
                count += 1
                v["datensatz_index"] = count
                dst.write(json.dumps(v, ensure_ascii=False, separators=(",", ":")) + "\n")
                print(f"[{count}] {v['pruefcode']} / {v['schlussstatus']}")
                flagged += v["pruefcode"] != "BELEGKETTE_FORMAL_VOLLSTAENDIG"
        print(f"V2: {count} Befunde | {flagged} formal unvollstaendig/auffaellig | 0 automatisch freigegebene Schluesse")
        # Keine semantische Schlussfreigabe: Exit 1 signalisiert stets offene Pruefung.
        return 1
    except (OSError, UnicodeError, ValueError) as exc:
        print(f"FEHLER: {type(exc).__name__} (Details aus Datenschutzgruenden unterdrueckt)", file=sys.stderr)
        return 2


class Tests(unittest.TestCase):
    def setUp(self):
        t = tempfile.TemporaryDirectory()
        self.addCleanup(t.cleanup)
        self.temp = Path(t.name)
        self.root = self.temp / "projekt"
        self.root.mkdir()
        self.roots = (self.root.resolve(),)
        self.source = self.root / "script.ps1"
        self.quote = "    Write-Host 'ARCHI_TEST_DUMMY_WERT'"
        self.source.write_text(self.quote + "\n" + "Write-Host 'Zweite Zeile!'\n", encoding="utf-8")

    def v1(self, **kw):
        return {"id": "A1", "quelle": "beleg-audit", "behauptung": "Daraus folgt ein kritischer Fehler", "datei": str(self.source),
                "zeile": 1, "zitat": self.quote, **kw}

    def v2(self, evidence=None, **kw):
        if evidence is None:
            evidence = {"id": "B1", "datei": str(self.source), "zeile": 1, "zitat": self.quote}
        return {"id": "A1", "quelle": "beleg-audit", "behauptung": "Daraus folgt ein kritischer Fehler",
                "behaupteter_status": "BEWIESEN", "belege": [evidence], "pflichtbelege": ["B1"], **kw}

    def test_01_altes_format_unbelegt(self):
        r = pruefen(self.v1(), self.roots)
        self.assertEqual(r["pruefcode"], "BELEGKETTE_UNVOLLSTAENDIG")
        self.assertEqual(r["belege_exakt"], 1)

    def test_02_exakte_kette_kein_semantischer_freibrief(self):
        r = pruefen(self.v2(), self.roots)
        self.assertEqual(r["pruefcode"], "BELEGKETTE_FORMAL_VOLLSTAENDIG")
        self.assertEqual(r["schlussstatus"], "SCHLUSS_UNGEPRUEFT")
        self.assertEqual(r["freigabe"], "NEIN")

    def test_03_normalisiert_nicht_exakt(self):
        e = {"id": "B1", "datei": str(self.source), "zeile": 1, "zitat": self.quote.strip()}
        r = pruefen(self.v2(e), self.roots)
        self.assertEqual(r["belegketten_status"], "NUR_NORMALISIERT")
        self.assertEqual(r["schlussstatus"], "SCHLUSS_UNBELEGT")

    def test_04_zitat_andere_zeile(self):
        e = {"id": "B1", "datei": str(self.source), "zeile": 7, "zitat": self.quote}
        r = pruefen(self.v2(e), self.roots)
        self.assertEqual(r["details"][0]["pruefcode"], "ZITAT_ANDERE_ZEILE")

    def test_05_plichtbeleg_fehlt(self):
        r = pruefen(self.v2(pflichtbelege=["B1", "B2"]), self.roots)
        self.assertEqual(r["fehlende_pflichtbelege"], 1)
        self.assertEqual(r["pruefcode"], "BELEGKETTE_UNVOLLSTAENDIG")

    def test_06_nicht_referenzierter_beleg(self):
        r = pruefen(self.v2(pflichtbelege=["B9"]), self.roots)
        self.assertEqual(r["pruefcode"], "BELEGKETTE_UNVOLLSTAENDIG")

    def test_07_doppelte_ids(self):
        d = self.v2()
        d["belege"].append(d["belege"][0].copy())
        self.assertEqual(pruefen(d, self.roots)["pruefcode"], "FORMAT_FEHLER")

    def test_08_faktregel_positiv_aber_schluss_offen(self):
        r = pruefen(self.v2(fakten=[{"typ": "QUELLZEILE_ENTHAELT", "beleg_id": "B1", "literal": "ARCHI_TEST"}]), self.roots)
        self.assertEqual(r["fakten_geprueft"], 1)
        self.assertEqual(r["schlussstatus"], "SCHLUSS_UNGEPRUEFT")

    def test_09_faktregel_falsch(self):
        r = pruefen(self.v2(fakten=[{"typ": "QUELLZEILE_ENTHAELT", "beleg_id": "B1", "literal": "DIESE_ZEICHEN_SIND_NICHT_DA"}]), self.roots)
        self.assertEqual(r["pruefcode"], "FAKTREGEL_NICHT_BESTAETIGT")

    def test_10_faktregel_ohne_exaktes_zitat(self):
        e = {"id": "B1", "datei": str(self.source), "zeile": 1, "zitat": self.quote.strip()}
        r = pruefen(self.v2(e, fakten=[{"typ": "QUELLZEILE_ENTHAELT", "beleg_id": "B1", "literal": "ARCHI_TEST"}]), self.roots)
        self.assertEqual(r["fakten_geprueft"], 0)

    def test_11_geheimtext_nicht_in_ausgabe(self):
        d = self.v2()
        d["behauptung"] = "SCHLUESSEL_TEST_SUPER_SECRET=111122223333"
        d["belege"][0]["zitat"] = "SCHLUESSEL_TEST_SUPER_SECRET=111122223333"
        d["belege"][0]["datei"] = str(self.root / ".env")
        out = json.dumps(pruefen(d, self.roots))
        self.assertNotIn("SCHLUESSEL_TEST_SUPER_SECRET", out)
        self.assertNotIn(".env", out)

    def test_12_formfehler(self):
        self.assertEqual(pruefen({}, self.roots)["pruefcode"], "FORMAT_FEHLER")

    def test_13_ungueltige_statusangabe(self):
        self.assertEqual(pruefen(self.v2(behaupteter_status="MEGA_BESTAETIGT"), self.roots)["pruefcode"], "FORMAT_FEHLER")

    def test_14_fehlende_datei(self):
        e = {"id": "B1", "datei": str(self.root / "fehlt.ps1"), "zeile": 1, "zitat": self.quote}
        r = pruefen(self.v2(e), self.roots)
        self.assertEqual(r["details"][0]["pruefcode"], "DATEI_FEHLT")

    def test_15_unterdrueckt_entfernte_texte(self):
        r = pruefen(self.v2(), self.roots)
        raw = json.dumps(r)
        self.assertNotIn(self.quote, raw)
        self.assertNotIn(str(self.source), raw)
        self.assertNotIn("kritischer Fehler", raw)

    def test_16_root_plicht(self):
        with self.assertRaises(ValueError):
            _roots([])

    def test_17_root_dateisystem_verboten(self):
        with self.assertRaises(ValueError):
            _roots([str(Path(self.root.anchor))])

    def test_18_abweichende_faktregel_ohne_zitatleck(self):
        d = self.v2(fakten=[{"typ": "QUELLZEILE_ENTHAELT", "beleg_id": "B1", "literal": "SCHLUESSEL_TEST"}])
        raw = json.dumps(pruefen(d, self.roots))
        self.assertNotIn("SCHLUESSEL_TEST", raw)

    def test_19_unbekannte_faktregel_nicht_erlaubt(self):
        r = pruefen(self.v2(fakten=[{"typ": "KI_IST_SICH_SICHER", "beleg_id": "B1", "literal": "TEST"}]), self.roots)
        self.assertEqual(r["pruefcode"], "FORMAT_FEHLER")

    def test_21_status_typfehler_fail_closed(self):
        r = pruefen(self.v2(behaupteter_status=[]), self.roots)
        self.assertEqual(r["pruefcode"], "FORMAT_FEHLER")

    def test_20_ungueltiger_evidence_id(self):
        e = {"id": "B1;geheim", "datei": str(self.source), "zeile": 1, "zitat": self.quote}
        self.assertEqual(pruefen(self.v2(e), self.roots)["pruefcode"], "FORMAT_FEHLER")


if __name__ == "__main__":
    sys.exit(cli())
