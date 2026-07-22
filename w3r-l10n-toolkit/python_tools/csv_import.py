"""
Import a "CSW - Localization" Google Sheets CSV export into the project's
JSON database format (see FORMAT_SPEC.md).

Usage:
    python python_tools/csv_import.py \
        --csv "path/to/export.csv" \
        --relation GLOBAL \
        --name RoA_GLOBAL \
        --wts "translations/enUS/1.01/war3campaign_general.wts" \
        --database-dir database --version 1.01

What it does:
    1. Reads the CSV (columns: RELATION,TYPE,UNIT ID,UNIT NAME,EN,UA,ES,PT,FR,
       VARIABLE,STRING NUMBER).
    2. Keeps only rows where RELATION matches --relation AND VARIABLE is filled in.
    3. Fixes the common UTF-8-decoded-as-cp1252 mojibake in every text cell.
    4. Resolves STRING NUMBER ("STRING 1234" -> 1234; "IN GAME TRANSLATION"
       or blank -> None).
    5. If a STRING NUMBER is present, looks up the canonical English text in the
       given .wts file(s); otherwise (or if not found) falls back to the CSV's
       own EN cell.
    6. Writes {name}_EN.json to --database-dir/enUS/, and {name}_{locale}.json to
       --database-dir/{locale}/ for each of UA/ES/PT/FR that has
       any non-empty cells (locale codes: UA->ukUA, ES->esMX, PT->ptBR, FR->frFR).
    7. Prints a report: rows kept / skipped, string numbers not found in the
       .wts files, and any cells where the mojibake fix could not be applied
       cleanly (left as-is, flagged for manual review).
"""

import argparse
import csv
import hashlib
import json
import re
import sys
from datetime import date
from pathlib import Path

LOCALE_MAP = {"UA": "ukUA", "ES": "esMX", "PT": "ptBR", "FR": "frFR"}
CSV_COLUMNS = ["RELATION", "TYPE", "UNIT ID", "UNIT NAME", "EN", "UA", "ES", "PT", "FR", "VARIABLE", "STRING NUMBER"]

WTS_BLOCK_RE = re.compile(r"STRING (\d+)\s*\n(?://.*\n)?\{\n([\s\S]*?)\n\}")
STRING_NUMBER_RE = re.compile(r"(\d+)")
TYPE_WORD_RE = re.compile(r"[A-Za-z]+")


def fix_mojibake(text):
    """Best-effort fix for UTF-8 text that got decoded once as cp1252/latin-1.
    Leaves the text untouched (and reports it) if the round-trip fails, rather
    than guessing at lost bytes.
    """
    if not text:
        return text, False
    if not re.search(r"Ã.|Â.|Ð.|Å", text):
        return text, False
    # reconstruct a lost NBSP: "Ã" + two literal spaces was originally
    # "Ã" + NBSP(0xA0) + space, i.e. the standalone word "à ".
    candidate = re.sub(r"Ã(  )", "Ã" + chr(0xA0) + " ", text)
    try:
        # latin-1 (not cp1252): it maps every byte 0x00-0xFF with no undefined
        # slots, so it never fails to *encode*. cp1252 leaves 5 codepoints
        # (0x81, 0x8D, 0x8F, 0x90, 0x9D) undefined, which are hit constantly by
        # Cyrillic mojibake and would falsely flag perfectly recoverable text.
        fixed = candidate.encode("latin-1", errors="strict").decode("utf-8", errors="strict")
        return fixed, False
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text, True


def parse_string_number(raw):
    if not raw:
        return None
    m = STRING_NUMBER_RE.search(raw)
    return int(m.group(1)) if m else None


def clean_type(raw):
    if not raw:
        return None
    m = TYPE_WORD_RE.search(raw)
    return m.group(0).upper() if m else None


def load_wts_files(paths):
    combined = {}
    for path in paths:
        text = Path(path).read_text(encoding="utf-8")
        for m in WTS_BLOCK_RE.finditer(text):
            num, body = m.group(1), m.group(2)
            combined.setdefault(num, body)
    return combined


def compute_hash(text):
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()[:10]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", required=True, help="Path to the CSW-Localization CSV export")
    ap.add_argument("--relation", required=True, help='Value to filter the RELATION column on, e.g. "GLOBAL"')
    ap.add_argument("--name", required=True, help='Basename for output files, e.g. "RoA_GLOBAL"')
    ap.add_argument("--wts", nargs="*", default=[], help="One or more .wts files to resolve STRING NUMBER -> English text")
    ap.add_argument("--database-dir", default="database", help="Base output directory (default: database)")
    ap.add_argument("--version", default=None, help='.wts version this was built from, e.g. "1.01" (written to meta.version)')
    args = ap.parse_args()

    wts_map = load_wts_files(args.wts) if args.wts else {}

    with open(args.csv, encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)

    kept = 0
    skipped_no_variable = 0
    skipped_wrong_relation = 0
    missing_string_number = []
    mojibake_flags = []
    duplicate_keys = []

    en_strings = {}
    translations = {loc: {} for loc in LOCALE_MAP.values()}

    for i, row in enumerate(rows, start=2):  # 1-indexed + header
        row = row + [""] * (len(CSV_COLUMNS) - len(row))
        relation, raw_type, unit_id, unit_name, en, ua, es, pt, fr, variable, string_number_raw = row[:11]

        if relation.strip() != args.relation:
            skipped_wrong_relation += 1
            continue
        if not variable.strip():
            skipped_no_variable += 1
            continue

        key = variable.strip()
        if key in en_strings:
            duplicate_keys.append((i, key))
            continue

        fields = {}
        for label, raw in (("EN", en), ("UA", ua), ("ES", es), ("PT", pt), ("FR", fr)):
            fixed, failed = fix_mojibake(raw.strip())
            # A failed fix means real bytes were lost upstream (not just a
            # codec guess) -- writing the mojibake into a translation file
            # would be worse than skipping it, so drop the cell entirely.
            # EN is kept regardless: it's the fallback source text and there
            # is nothing better to fall back to.
            fields[label] = fixed if (label == "EN" or not failed) else ""
            if failed:
                mojibake_flags.append((i, key, label))

        string_number = parse_string_number(string_number_raw)
        source = fields["EN"]
        if string_number is not None:
            wts_text = wts_map.get(str(string_number))
            if wts_text is not None:
                source = wts_text
            else:
                missing_string_number.append((i, key, string_number))

        entry = {"hash": compute_hash(source)}
        if string_number is not None:
            entry["string_number"] = string_number
        type_clean = clean_type(raw_type)
        if type_clean:
            entry["type"] = type_clean
        if unit_id.strip():
            entry["unit_id"] = unit_id.strip()
        if unit_name.strip():
            entry["unit_name"] = unit_name.strip()
        entry["source"] = source

        en_strings[key] = entry
        kept += 1

        for label, locale in LOCALE_MAP.items():
            text = fields[label]
            if text:
                translations[locale][key] = text

    # --- write EN source JSON ---
    db_dir = Path(args.database_dir)
    en_dir = db_dir / "enUS"
    en_dir.mkdir(parents=True, exist_ok=True)
    en_out = en_dir / f"{args.name}_EN.json"
    meta = {
        "campaign": args.name.split("_")[0] if "_" in args.name else args.name,
        "act": args.relation,
        "map": args.relation,
        "source_lang": "enUS",
    }
    if args.version:
        meta["version"] = args.version
    meta["updated"] = date.today().isoformat()
    en_json = {"meta": meta, "strings": en_strings}
    en_out.write_text(json.dumps(en_json, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # --- write translation JSONs ---
    written_translations = []
    for locale, data in translations.items():
        if not data:
            continue
        loc_dir = db_dir / locale
        loc_dir.mkdir(parents=True, exist_ok=True)
        out_path = loc_dir / f"{args.name}_{locale}.json"
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        written_translations.append((locale, out_path, len(data)))

    # --- report ---
    print(f"Rows kept:                    {kept}")
    print(f"Skipped (wrong RELATION):     {skipped_wrong_relation}")
    print(f"Skipped (no VARIABLE):        {skipped_no_variable}")
    print(f"Duplicate keys skipped:       {len(duplicate_keys)}")
    for i, key in duplicate_keys:
        print(f"  row {i}: {key}")
    print(f"STRING NUMBER not in .wts:    {len(missing_string_number)}")
    for i, key, num in missing_string_number:
        print(f"  row {i}: {key} (STRING {num}) -- used CSV EN text instead")
    print(f"Mojibake left unfixed:        {len(mojibake_flags)}")
    for i, key, label in mojibake_flags:
        print(f"  row {i}: {key} [{label}]")
    print(f"Wrote: {en_out} ({kept} keys)")
    for locale, path, n in written_translations:
        print(f"Wrote: {path} ({n} keys)")


if __name__ == "__main__":
    main()
