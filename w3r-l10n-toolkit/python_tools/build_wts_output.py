"""
Build a locale .wts export from an EN reference .wts (structure/order/comments)
plus an EN source JSON (key -> string_number) and a locale translation JSON
(flat key -> text).

Every STRING block is kept byte-for-byte from the EN .wts (header, optional
comment line, braces) except the body: if the block's number maps to a key
with a non-empty translation, the body is replaced with that translation;
otherwise the original English body is kept as a fallback (so the exported
.wts always stays complete/valid, even for partially-translated files).

Usage:
    python python_tools/build_wts_output.py \
        --en database/enUS/RoA_GLOBAL_EN.json \
        --translation database/ukUA/RoA_GLOBAL_ukUA.json \
        --wts translations/enUS/1.01/war3campaign_general.wts \
        --out translations/ukUA/1.01/war3campaign_general.wts
"""

import argparse
import json
from pathlib import Path
import re

BLOCK_RE = re.compile(r"(STRING (\d+)\s*\n(?://.*\n)?)\{\n([\s\S]*?)\n\}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--en", required=True)
    ap.add_argument("--translation", required=True)
    ap.add_argument("--wts", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    en = json.loads(Path(args.en).read_text(encoding="utf-8"))
    translation = json.loads(Path(args.translation).read_text(encoding="utf-8"))
    src_text = Path(args.wts).read_text(encoding="utf-8")

    num_to_text = {}
    for key, entry in en["strings"].items():
        sn = entry.get("string_number")
        if sn is None:
            continue
        t = translation.get(key)
        if t:
            num_to_text[str(sn)] = t

    stats = {"translated": 0, "fallback": 0}

    def replace(m):
        header, num = m.group(1), m.group(2)
        if num in num_to_text:
            stats["translated"] += 1
            return f"{header}{{\n{num_to_text[num]}\n}}"
        stats["fallback"] += 1
        return m.group(0)

    out_text = BLOCK_RE.sub(replace, src_text)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(out_text, encoding="utf-8")

    total = stats["translated"] + stats["fallback"]
    print(f"{args.out}")
    print(f"  total STRING blocks: {total}")
    print(f"  translated: {stats['translated']}")
    print(f"  fallback to EN: {stats['fallback']}")


if __name__ == "__main__":
    main()
