"""
Build a locale translation JSON (flat {key: text}) from an EN source JSON's
string_number pointers plus a raw .wts export in that locale.

Usage:
    python python_tools/build_translation_from_wts.py \
        --en database/RoA_A01_M01_EN_1784126083.json \
        --wts translations/frFR/1.00/WC2Human01.wts \
        --out database/frFR/RoA_A01_M01_frFR.json \
        [--remap 4355:4017,4356:4287,4357:4290,4358:4293]

--remap lets you override the lookup number per-key for known renumbered
entries (en_string_number:actual_number_in_this_wts), found via
overlap_check-style comparison against the EN reference .wts.
"""

import argparse
import json
import re
from pathlib import Path

WTS_BLOCK_RE = re.compile(r"STRING (\d+)\s*\n(?://.*\n)?\{\n([\s\S]*?)\n\}")


def load_wts(path):
    text = Path(path).read_text(encoding="utf-8")
    m = {}
    for match in WTS_BLOCK_RE.finditer(text):
        m.setdefault(match.group(1), match.group(2).rstrip())
    return m


def parse_remap(s):
    remap = {}
    if not s:
        return remap
    for pair in s.split(","):
        en_num, actual_num = pair.split(":")
        remap[en_num.strip()] = actual_num.strip()
    return remap


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--en", required=True)
    ap.add_argument("--wts", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--remap", default="", help="en_number:actual_number,en_number:actual_number,...")
    args = ap.parse_args()

    en = json.loads(Path(args.en).read_text(encoding="utf-8"))
    wts_map = load_wts(args.wts)
    remap = parse_remap(args.remap)

    result = {}
    missing = []
    for key, entry in en["strings"].items():
        num = entry.get("string_number")
        if num is None:
            continue
        num_str = str(num)
        text = wts_map.get(num_str)
        used_remap = False
        if text is None and num_str in remap:
            text = wts_map.get(remap[num_str])
            used_remap = True
        if text is None:
            missing.append((key, num))
            continue
        result[key] = text
        if used_remap:
            print(f"  remapped: {key} STRING {num} -> {remap[num_str]}")

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {args.out}: {len(result)} keys")
    print(f"Missing (no matching STRING number in .wts): {len(missing)}")
    for key, num in missing:
        print(f"  {key} (STRING {num})")


if __name__ == "__main__":
    main()
