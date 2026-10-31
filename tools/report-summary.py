#!/usr/bin/env python3
"""Zusammenfassung von JSON-Prüfberichten im archi-guard-Projekt."""
import json
import sys
from pathlib import Path


RESULT_FIELDS = {"status", "validation", "check_status", "final_native_state", "result"}
OPEN_FIELDS = {"open_points", "offene_punkte", "limitations", "limits", "blockers"}


def load_json(path: Path) -> tuple[object, str | None]:
    """Lade JSON-Datei; return (data, error)."""
    try:
        content = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None, "DATEI_NICHT_VORHANDEN"
    except (OSError, UnicodeError) as e:
        return None, f"Lesefehler: {e}"
    try:
        return json.loads(content), None
    except (ValueError, RecursionError) as e:
        return None, f"JSON-Fehler: {e}"


def extract_results(obj: object, prefix: str = "", fields=None) -> list[dict]:
    """Rekursiv Ergebnisfelder extrahieren."""
    fields = RESULT_FIELDS if fields is None else fields
    results = []

    if isinstance(obj, dict):
        for key, value in obj.items():
            field_name = f"{prefix}.{key}" if prefix else key

            # Direkte Ergebnisfelder
            if key in fields:
                results.append({
                    "field": key,
                    "value": ("unbekannt" if value is None else
                              json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list, bool)) else str(value)),
                    "path": field_name
                })

            # Verschachtelte Objekte/Listen
            if isinstance(value, (dict, list)):
                results.extend(extract_results(value, field_name, fields))

    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            results.extend(extract_results(item, f"{prefix}[{i}]", fields))

    return results


def summarize_report(path: Path) -> str:
    """Erstelle Zusammenfassung für einen Bericht."""
    data, error = load_json(path)
    return format_report(path, data, error)


def format_report(path: Path, data: object, error: str | None) -> str:
    lines = [f"\n=== {path.name} ===", f"Pfad: {path.absolute()}"]

    if error:
        lines.append("Status: FEHLER")
        lines.append(f"Details: {error}")
        return "\n".join(lines)

    results = extract_results(data)

    if results:
        lines.append("Ergebnisfelder:")
        for r in results:
            lines.append(f"  {r['path']}: {r['value']}")
    else:
        lines.append("Ergebnisfelder: unbekannt (keine Ergebnisfelder gefunden)")

    open_points = extract_results(data, fields=OPEN_FIELDS)
    if open_points:
        lines.append("Offene Punkte:")
        for row in open_points:
            lines.append(f"  {row['path']}: {row['value']}")
    else:
        lines.append("Offene Punkte: unbekannt (keine expliziten Angaben)")

    lines.append("")
    return "\n".join(lines)


def main():
    """Hauptfunktion."""
    if len(sys.argv) < 2:
        print("Verwendung: report-summary.py <Berichtspfad> [Pfad2 ...]")
        print("Oder: report-summary.py --scan <Verzeichnis>")
        sys.exit(1)

    if sys.argv[1] == "--scan":
        if len(sys.argv) < 3:
            print("Fehler: --scan benötigt Verzeichnispfad")
            sys.exit(1)

        dir_path = Path(sys.argv[2])
        if not dir_path.is_dir():
            print(f"Fehler: {dir_path} ist kein Verzeichnis")
            sys.exit(1)

        json_files = sorted(dir_path.glob("*.json"))
        if not json_files:
            print(f"Keine JSON-Dateien in {dir_path}")
            sys.exit(0)

        print(f"Berichtszusammenfassung für {len(json_files)} Dateien in {dir_path}")
        paths = json_files
    else:
        print("Berichtszusammenfassung:")
        paths = [Path(path_str) for path_str in sys.argv[1:]]

    failed = False
    for path in paths:
        data, error = load_json(path)
        failed = failed or error is not None
        print(format_report(path, data, error))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
