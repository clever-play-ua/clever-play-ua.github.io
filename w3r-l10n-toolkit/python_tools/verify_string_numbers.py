"""
Verify a generated EN source JSON (e.g. database/RoA_GLOBAL_EN.json) against
the raw .wts file(s) it was built from.

Checks:
    1. For every key with a "string_number", the .wts text for that number
       still matches the "source" field exactly (catches stale/edited JSON).
    2. Reports string_numbers referenced in the JSON but absent from the
       given .wts file(s).
    3. Groups keys that share the exact same source text (same hash) --
       informational only: this is often legitimate (e.g. the same ability
       name repeated across multiple rank/level rows), not an error.

Usage:
    python python_tools/verify_string_numbers.py \
        --en database/RoA_GLOBAL_EN.json \
        --wts translations/enUS/1.01/war3campaign_general.wts
"""

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

WTS_BLOCK_RE = re.compile(r"STRING (\d+)\s*\n(?://.*\n)?\{\n([\s\S]*?)\n\}")


def load_wts_files(paths):
    combined = {}
    for path in paths:
        text = Path(path).read_text(encoding="utf-8")
        for m in WTS_BLOCK_RE.finditer(text):
            num, body = m.group(1), m.group(2)
            combined.setdefault(num, body)
    return combined


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--en", required=True, help="Path to the generated EN source JSON")
    ap.add_argument("--wts", nargs="+", required=True, help="One or more .wts files to check against")
    args = ap.parse_args()

    wts_map = load_wts_files(args.wts)
    en = json.loads(Path(args.en).read_text(encoding="utf-8"))
    strings = en["strings"]

    checked = 0
    mismatches = []
    missing = []
    by_hash = defaultdict(list)

    for key, entry in strings.items():
        by_hash[entry["hash"]].append(key)

        num = entry.get("string_number")
        if num is None:
            continue
        checked += 1
        wts_text = wts_map.get(str(num))
        if wts_text is None:
            missing.append((key, num))
        elif wts_text != entry["source"]:
            mismatches.append((key, num, entry["source"], wts_text))

    dup_groups = [(h, keys) for h, keys in by_hash.items() if len(keys) > 1]

    tracked_numbers = {str(entry["string_number"]) for entry in strings.values() if "string_number" in entry}
    untracked = len(wts_map) - len(tracked_numbers)

    print(f"STRING blocks in .wts file(s): {len(wts_map)}")
    print(f"  tracked by this JSON:   {len(tracked_numbers)}")
    print(f"  NOT tracked (unverified by this run): {untracked}")
    print("  -> edits to untracked STRING numbers will NOT show up below, even if this JSON is 100% in sync.")
    print()
    print(f"Keys with string_number checked: {checked}")
    print(f"Mismatches (source != .wts text): {len(mismatches)}")
    for key, num, src, wts_text in mismatches:
        print(f"  {key} (STRING {num})")
        print(f"    json: {src!r}")
        print(f"    wts:  {wts_text!r}")

    print(f"string_number missing from .wts: {len(missing)}")
    for key, num in missing:
        print(f"  {key} (STRING {num})")

    print(f"Duplicate-text groups (same hash, informational): {len(dup_groups)}")
    for h, keys in dup_groups:
        print(f"  hash {h} ({len(keys)}x): {', '.join(keys)}")


if __name__ == "__main__":
    main()
