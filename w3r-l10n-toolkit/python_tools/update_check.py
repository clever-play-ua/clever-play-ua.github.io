"""
CLI port of the browser "Update DB" page (js/update-app.js): checks an EN
source JSON against a fresh .wts export and classifies every key into one of:

    ok         - string_number found, text unchanged (nothing to do)
    updated    - string_number found, text changed (needs re-translation)
    reassigned - string_number gone, but the same (or near-identical) text
                 was found under a different number elsewhere in the .wts
                 (WC3 renumbers STRING ids on every World Editor resave --
                 this is the normal "same text, new numbers" case)
    not_found  - string_number gone and no matching text found anywhere
                 (string was likely removed from the map)

Identity in this system is the TEXT (and its hash), not the string_number --
string_number is just a pointer that gets re-resolved here. If an entry has
a "wts_source" field (a raw baseline distinct from a possibly hand-edited
"source"), that baseline is used for comparison instead of "source", exactly
like the browser tool.

Usage:
    python python_tools/update_check.py \
        --en database/RoA_GLOBAL_EN.json \
        --wts translations/enUS/1.01/war3campaign_general.wts \
        [--out database/RoA_GLOBAL_EN.json] \
        [--min-score 0.95] [--max-fuzzy-candidates 500]

Without --out this is a dry run: it only prints the report. With --out it
writes an updated copy of the JSON (source/hash refreshed for "updated"
entries, string_number/source/hash refreshed for "reassigned" entries --
matching every reassignment above --min-score, same default as the browser
tool's "all checked").
"""

import argparse
import hashlib
import json
import re
from pathlib import Path

WTS_BLOCK_RE = re.compile(r"STRING (\d+)\s*\n(?://.*\n)?\{\n([\s\S]*?)\n\}")


def load_wts_files(paths):
    combined = {}
    for path in paths:
        text = Path(path).read_text(encoding="utf-8")
        for m in WTS_BLOCK_RE.finditer(text):
            num, body = m.group(1), m.group(2).rstrip()
            combined.setdefault(num, body)
    return combined


def normalize_ws(s):
    return " ".join((s or "").split())


def compute_hash(text):
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()[:10]


def levenshtein(a, b):
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i] + [0] * len(b)
        for j, cb in enumerate(b, start=1):
            curr[j] = prev[j - 1] if ca == cb else 1 + min(prev[j], curr[j - 1], prev[j - 1])
        prev = curr
    return prev[len(b)]


def text_similarity(a, b):
    a, b = a.strip(), b.strip()
    if a == b:
        return 1.0
    longer = max(len(a), len(b))
    if longer == 0:
        return 1.0
    if min(len(a), len(b)) / longer < 0.5:
        return 0.0
    return 1 - levenshtein(a, b) / longer


def run_check(strings, wts_map, min_score, max_fuzzy_candidates):
    ok, updated, reassigned, not_found = [], [], [], []
    claimed = set()

    # --- pass 1: exact string_number lookup ---
    pending = []  # entries needing pass 2, with their baseline text
    for key, entry in strings.items():
        sn = entry.get("string_number")
        baseline = entry.get("wts_source", entry["source"])
        if sn is not None and str(sn) in wts_map:
            claimed.add(str(sn))
            new_text = wts_map[str(sn)]
            if normalize_ws(new_text) == normalize_ws(baseline):
                ok.append(key)
            else:
                updated.append({"key": key, "sn": sn, "old_source": baseline, "new_source": new_text})
        elif sn is not None:
            pending.append((key, entry, baseline))

    # --- pass 2a: fast path -- exact (normalized) text match among unclaimed wts entries ---
    unclaimed = {num: text for num, text in wts_map.items() if num not in claimed}
    text_index = {}
    for num, text in unclaimed.items():
        text_index.setdefault(normalize_ws(text), []).append(num)

    still_pending = []
    for key, entry, baseline in pending:
        candidates = text_index.get(normalize_ws(baseline))
        if candidates:
            new_sn = candidates.pop()
            if not candidates:
                del text_index[normalize_ws(baseline)]
            claimed.add(new_sn)
            del unclaimed[new_sn]
            reassigned.append({
                "key": key, "old_sn": entry.get("string_number"), "new_sn": new_sn,
                "old_source": baseline, "new_source": wts_map[new_sn], "score": 1.0,
            })
        else:
            still_pending.append((key, entry, baseline))

    # --- pass 2b: slow path -- Levenshtein fuzzy search, only for genuine leftovers ---
    if still_pending and unclaimed:
        pair_count = len(still_pending) * len(unclaimed)
        if pair_count > max_fuzzy_candidates * max_fuzzy_candidates:
            print(f"  (skipping fuzzy match: {len(still_pending)} candidates x {len(unclaimed)} "
                  f"unclaimed .wts entries = {pair_count:,} pairs, over the safety cap of "
                  f"{max_fuzzy_candidates}^2. Raise --max-fuzzy-candidates if you need this.)")
            for key, entry, baseline in still_pending:
                not_found.append({"key": key, "entry": entry})
        else:
            for key, entry, baseline in still_pending:
                best_sn, best_score = None, min_score
                for num, text in unclaimed.items():
                    score = text_similarity(baseline, text)
                    if score > best_score:
                        best_sn, best_score = num, score
                if best_sn is not None:
                    claimed.add(best_sn)
                    new_text = unclaimed.pop(best_sn)
                    reassigned.append({
                        "key": key, "old_sn": entry.get("string_number"), "new_sn": best_sn,
                        "old_source": baseline, "new_source": new_text, "score": best_score,
                    })
                else:
                    not_found.append({"key": key, "entry": entry})

    return {"ok": ok, "updated": updated, "reassigned": reassigned, "not_found": not_found}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--en", required=True)
    ap.add_argument("--wts", nargs="+", required=True)
    ap.add_argument("--out", help="Write the updated JSON here (omit for a dry run / report only)")
    ap.add_argument("--min-score", type=float, default=0.95)
    ap.add_argument("--max-fuzzy-candidates", type=int, default=500,
                     help="Safety cap on the O(n*m) Levenshtein fallback (default 500x500)")
    args = ap.parse_args()

    en_path = Path(args.en)
    db = json.loads(en_path.read_text(encoding="utf-8"))
    wts_map = load_wts_files(args.wts)

    result = run_check(db["strings"], wts_map, args.min_score, args.max_fuzzy_candidates)

    print(f"Unchanged:  {len(result['ok'])}")
    print(f"Updated (text changed, needs re-translation): {len(result['updated'])}")
    for item in result["updated"]:
        print(f"  {item['key']} (STRING {item['sn']})")
        print(f"    old: {item['old_source']!r}")
        print(f"    new: {item['new_source']!r}")
    print(f"Reassigned (renumbered, same text): {len(result['reassigned'])}")
    for item in result["reassigned"]:
        print(f"  {item['key']}: STRING {item['old_sn']} -> {item['new_sn']} ({item['score']*100:.0f}% match)")
    print(f"Not found (removed from .wts?): {len(result['not_found'])}")
    for item in result["not_found"]:
        print(f"  {item['key']} (was STRING {item['entry'].get('string_number')}): {item['entry']['source']!r}")

    if args.out:
        for item in result["updated"]:
            entry = db["strings"][item["key"]]
            entry["source"] = item["new_source"]
            entry["hash"] = compute_hash(item["new_source"])
            if "wts_source" in entry:
                entry["wts_source"] = item["new_source"]
        for item in result["reassigned"]:
            entry = db["strings"][item["key"]]
            entry["string_number"] = int(item["new_sn"])
            entry["source"] = item["new_source"]
            entry["hash"] = compute_hash(item["new_source"])
            if "wts_source" in entry:
                entry["wts_source"] = item["new_source"]

        from datetime import date
        db["meta"]["updated"] = date.today().isoformat()
        Path(args.out).write_text(json.dumps(db, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nWrote: {args.out}")
    else:
        print("\n(dry run -- pass --out <path> to write the updated JSON)")


if __name__ == "__main__":
    main()
