# WTS L10n Toolkit

A browser-based tool for managing Warcraft III `.wts` localization without a backend, build tools, or dependencies. Pure HTML + CSS + vanilla JavaScript, hosted on GitHub Pages.

---

## The Problem

Warcraft III stores all map text in `.wts` files — numbered string blocks:

```
STRING 4281
{
Uther, I want you to stay here and take care of the wounded.
}
```

The map developer keeps iterating: fixing typos, adding lines, renumbering everything. Translators have to figure out from scratch each release — what changed, what's new, what just moved to a different number.

---

## The Solution

A JSON database owned by the localization team, not the developer. It assigns a **stable human-readable key** to every string and tracks the current `string_number` in the WTS. Updates run through a two-pass algorithm that detects text changes and fuzzy-matches renumbered strings.

---

## Current Pages

### Create DB (`index.html`)

Upload one or two CSVs exported from Google Sheets → generates the English reference database JSON.

- **VO CSV** (7 columns): `STATUS · UNIT · UNIT TRANSLATION · ENGLISH · TRANSLATION · STRING NUMBER · VARIABLE NAME`
- **Text CSV** (6 columns): `STATUS · TYPE · ENGLISH · TRANSLATION · STRING NUMBER · VARIABLE NAME`

Both files are optional and can be combined into one output. The tool auto-detects wrong file in wrong zone (column count check on the header).

Output: `RoA_A01_M01_EN.json`

### Update DB (`update.html`)

Select an existing database from the `database/` folder (fetched via `fetch()`), drop a new `.wts` file, run the check.

Results are split into three sections:

| Section | Meaning | Action |
|---|---|---|
| Text changed (same STRING #) | Source text differs at the same number | Applied automatically on download |
| STRING # changed (fuzzy ≥ 95%) | String moved to a new number | Shown with checkboxes — uncheck to reject |
| Not found | No match in new WTS at all | Manual review |

Download produces an updated `_EN.json` with new hashes and string numbers applied.

---

## Database Format

One JSON file per map, e.g. `RoA_A01_M01_EN.json`:

```json
{
  "meta": {
    "campaign": "RoA",
    "act": "A01",
    "map": "M01",
    "source_lang": "en",
    "generated": "2026-06-16"
  },
  "strings": {
    "RoA_A01_M01_VO_S001_001_TME": {
      "hash": "a3f9c2d1e0",
      "string_number": 3848,
      "type": "VO",
      "unit": "Terenas Menethil II",
      "source": "Guards, to me!…"
    },
    "RoA_A01_M01_OBJE_001": {
      "hash": "c9d4e2f1a8",
      "string_number": 3777,
      "type": "OBJE",
      "source": "Shield the King"
    }
  }
}
```

- `hash` — first 10 hex chars of SHA-256 of `source`; used only for change detection
- `string_number` — single integer (a string appears exactly once in a WTS)
- `type` — extracted from key pattern (`VO`, `OBJE`, `MESS`, `SCRN`)
- `unit` — character name, VO strings only

---

## Key Format

```
RoA _ A01 _ M01 _ VO _ S001 _ 001 _ TME
 │     │     │    │     │     │      │
 │     │     │    │     │     │      └── Character initials (VO only); SYS = narrator
 │     │     │    │     │     └───────── Line number in scene (3 digits)
 │     │     │    │     └─────────────── Scene number (3 digits)
 │     │     │    └───────────────────── String type
 │     │     └──────────────────────────  Map number
 │     └────────────────────────────────  Act number
 └──────────────────────────────────────  Campaign abbreviation
```

### String Types

| Code | Usage |
|------|-------|
| `VO` | Character voice lines |
| `OBJE` | Quest objectives and descriptions |
| `MESS` | In-game trigger messages / hints |
| `SCRN` | Screen text (timers, counters, labels) |

### Zero-padding rules

| Segment | Digits | Example |
|---------|--------|---------|
| Act | 2 | `A01`, `A09` |
| Map | 2 | `M01`, `M12` |
| Scene | 3 | `S001`, `S080` |
| Line | 3 | `001`, `042` |

Without padding, `S10` sorts before `S9`. Maps can have 80+ scenes.

---

## Update Algorithm

### Pass 1 — exact string number lookup

For every key in the database, look up its `string_number` in the new WTS:

- Found, text identical → **unchanged**
- Found, text differs → **updated** (typo fix, content edit)
- Not found → candidate for pass 2

### Pass 2 — fuzzy match for missing strings

For each candidate from pass 1, scan the new WTS (skipping numbers already claimed):

- Levenshtein similarity ≥ 95% → **renumbered** (proposed match, user can reject)
- No match → **not found** (manual review)

### Why 95% and not lower?

Warcraft III objectives often share nearly identical text between states (e.g. `Retake West wing` vs `Retake East wing`). Lower thresholds would produce false matches. 95% is tight enough to only fire on genuine renames.

---

## Project Structure

```
w3r-l10n-toolkit/
├── index.html          Create DB page
├── update.html         Update DB page
├── translate.html      (legacy — generate translation JSON)
├── build.html          (legacy — build localized WTS)
├── js/
│   ├── keygen.js       SHA-256 via crypto.subtle
│   ├── csv-parser.js   RFC 4180 parser + parseVoCSV + parseTextCSV
│   ├── app.js          Create DB logic
│   └── update-app.js   Update DB logic
├── css/
│   └── style.css       All styles — dark theme, design tokens
└── database/
    └── *.json          English reference databases (fetched at runtime)
```

---

## Technical Notes

- **Stack**: HTML + CSS + vanilla JS — zero dependencies, no build step
- **Hashing**: `crypto.subtle.digest('SHA-256', ...)` — requires secure context (HTTPS, localhost, or `file://`)
- **CSV parsing**: full RFC 4180 — handles quoted multi-line fields, escaped quotes, `\r\n` normalization
- **DB loading**: `fetch('database/id_EN.json')` — static files served by GitHub Pages
- **Similarity**: two-row space-optimized Levenshtein, O(n×m); length ratio pre-check < 0.5 → skip
- **Hosting**: GitHub Pages — no server, no cookies, no tracking

---

## Part of Clever Play UA

Built for the Ukrainian localization of Warcraft III Reforged custom campaigns by [Clever Play UA](https://github.com/clever-play-ua). Open tool for anyone working with `.wts` localization.
