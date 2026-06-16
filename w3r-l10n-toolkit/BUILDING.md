# Building WTS L10n Toolkit from Scratch

A step-by-step guide to recreating this mini-app. No frameworks, no build tools, no Node.js — pure HTML, CSS, and vanilla JavaScript. Hosted for free on GitHub Pages.

This guide covers **Create DB** — the page that turns Google Sheets CSV exports into a structured English reference database.

---

## What We're Building

The user exports two CSV files from Google Sheets (voice lines and text strings), drops them on the page, and downloads a JSON database file. The JSON assigns a stable human-readable key to every string and records a SHA-256 hash for future change detection.

---

## Part 1 — Project Setup

### File Structure

No package.json, no webpack. Just files.

```
my-toolkit/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── keygen.js
│   ├── csv-parser.js
│   └── app.js
└── database/
    └── (generated JSON files go here)
```

### GitHub Pages

Create a repository, push these files to `main`, go to **Settings → Pages → Source: main branch / root**. Done. The app is live at `https://your-username.github.io/your-repo/`.

No HTTPS configuration needed — GitHub Pages provides it. This matters because `crypto.subtle` (used for hashing) requires a secure context.

---

## Part 2 — Design System (CSS)

Start with CSS custom properties. Every color, radius, and spacing comes from tokens — you change one variable and the whole UI updates.

```css
/* css/style.css */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #12121e;   /* page background */
  --surface:  #1c1c2e;   /* card / input background */
  --surface2: #252538;   /* elevated surface */
  --border:   #2e2e48;   /* subtle borders */
  --accent:   #f5a623;   /* orange highlight */
  --text:     #e8e8f0;   /* primary text */
  --muted:    #7070a0;   /* secondary text */
  --success:  #4caf50;
  --warn:     #ff9800;
  --radius:   6px;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.6;
}
```

**Why dark theme?** Translators work for hours. Dark UI reduces eye strain. The orange accent (`#f5a623`) is warm enough to be readable on dark backgrounds without feeling harsh.

### Layout Container

```css
.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 36px 20px;
}
```

A single centered column. No grid frameworks needed for a tool this simple.

### Form Elements

Style inputs and selects uniformly so they feel native to the UI:

```css
.form-group input,
.form-group select {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  padding: 8px 12px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}
.form-group input:focus,
.form-group select:focus { border-color: var(--accent); }
```

The `transition: border-color 0.15s` gives a subtle focus ring without the jarring browser default.

### Drop Zone

The core interactive element — a dashed rectangle that responds to drag-and-drop:

```css
.drop-zone {
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  padding: 20px 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.drop-zone:hover,
.drop-zone.drag-over {
  border-color: var(--accent);
  background: rgba(245, 166, 35, 0.04);
}
```

The `drag-over` class is toggled by JavaScript during a drag event. The `rgba(245, 166, 35, 0.04)` tint is barely visible — just enough feedback without being distracting.

### Buttons

Two variants: primary (action) and ghost (secondary):

```css
.btn {
  display: inline-block;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  padding: 8px 18px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s, border-color 0.15s;
}
.btn:hover { border-color: var(--accent); }

.btn-primary {
  background: var(--accent);
  color: #000;
  border-color: var(--accent);
  font-weight: 600;
  padding: 10px 24px;
}
.btn-primary:hover { background: #e0951f; }

.btn-ghost {
  background: none;
  color: var(--muted);
  border-color: transparent;
}
.btn-ghost:hover { color: var(--text); border-color: var(--border); }
```

### Page Navigation

Tab-style navigation between pages using plain anchor tags:

```css
.page-nav {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 28px;
}
.page-nav-link {
  color: var(--muted);
  text-decoration: none;
  padding: 10px 22px;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;          /* overlaps the border-bottom of .page-nav */
  transition: color 0.15s, border-color 0.15s;
}
.page-nav-link.active { color: var(--accent); border-bottom-color: var(--accent); }
```

The `margin-bottom: -1px` trick makes the active tab's bottom border visually sit on top of the nav's bottom border — creating the classic tab effect without JavaScript.

---

## Part 3 — HTML Structure (index.html)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WTS L10n Toolkit</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div class="container">

    <header>
      <h1>WTS L10n Toolkit</h1>
      <p class="subtitle">Warcraft III · .wts Localization Manager</p>
    </header>

    <nav class="page-nav">
      <a href="index.html" class="page-nav-link active">Create DB</a>
      <a href="update.html" class="page-nav-link">Update DB</a>
    </nav>

    <h2>Build database from CSV</h2>

    <!-- Two drop zones side by side -->
    <div class="form-row">
      <div class="form-group">
        <label>VO — character voices (7-col)</label>
        <div class="drop-zone" id="drop-vo">
          <p id="label-vo">Drop CSV or click</p>
          <input type="file" id="file-vo" accept=".csv,text/csv" style="display:none">
        </div>
      </div>
      <div class="form-group">
        <label>Text — objectives, hints, screen (6-col)</label>
        <div class="drop-zone" id="drop-text">
          <p id="label-text">Drop CSV or click</p>
          <input type="file" id="file-text" accept=".csv,text/csv" style="display:none">
        </div>
      </div>
    </div>

    <!-- Error / hint line -->
    <div id="form-hint" class="form-hint hidden"></div>

    <div class="textarea-actions">
      <button id="btn-parse" class="btn btn-primary">Parse &amp; Build JSON</button>
      <button id="btn-reset" class="btn btn-ghost">Reset</button>
    </div>

    <!-- Skipped rows warning box -->
    <div id="warn-section" class="error-section hidden">
      <p class="error-title">Skipped rows:</p>
      <ul id="warn-list"></ul>
    </div>

    <!-- Result stats + download -->
    <div id="result-section" class="hidden">
      <div class="stats">
        <span id="stat-vo" class="stat">0 VO</span>
        <span id="stat-text" class="stat">0 Text</span>
        <span id="stat-total" class="stat success">0 total</span>
      </div>
      <div class="actions">
        <button id="btn-download" class="btn btn-primary">⬇ Download JSON</button>
      </div>
    </div>

    <!-- Preview table -->
    <div id="preview-section" class="preview-section hidden">
      <h3>Preview</h3>
      <table>
        <thead>
          <tr>
            <th>Key (Variable Name)</th>
            <th>Type</th>
            <th>Unit</th>
            <th>English</th>
            <th>String #</th>
          </tr>
        </thead>
        <tbody id="preview-body"></tbody>
      </table>
      <p class="preview-more" id="preview-more"></p>
    </div>

  </div>

  <script src="js/keygen.js"></script>
  <script src="js/csv-parser.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

Key decisions:
- Scripts at the bottom of `<body>` so the DOM is ready when they run — no `DOMContentLoaded` wrappers needed
- `hidden` class is `display: none !important` — toggled by JS throughout
- The file `<input>` is hidden; clicking the drop zone triggers it via JS

---

## Part 4 — SHA-256 Hashing (keygen.js)

The browser's `crypto.subtle` API does SHA-256 natively. The function is async because `crypto.subtle.digest()` returns a Promise.

```js
// js/keygen.js
async function computeHash(text) {
  const encoded = new TextEncoder().encode(text);
  const buffer  = await crypto.subtle.digest('SHA-256', encoded);
  const bytes   = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 10);   // first 10 hex chars = 40 bits
}
```

**Why only 10 hex chars?** 40 bits gives ~1 trillion possible values. A WTS file has at most a few thousand strings. The probability of any two strings colliding is negligible. Shorter hashes make the JSON more readable.

**Why hash at all?** When the developer releases a new WTS, we compare the stored hash to a freshly-computed hash of the same string number. If they differ, the source text changed — possibly a typo fix, possibly a content edit. Without the hash we'd have to do a full string comparison every time.

---

## Part 5 — CSV Parsing (csv-parser.js)

### Why not `text.split(',')` ?

Google Sheets exports RFC 4180 CSV. Multi-line fields (like long quest descriptions) are wrapped in double quotes:

```csv
"This is a multi-line
quest objective text."
```

A naive split on commas or newlines breaks these. You need a proper character-by-character parser.

### The Core Parser

```js
function parseCSVText(text) {
  const rows = [];
  let row = [], field = '', inQuote = false, i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && i + 1 < n && text[i + 1] === '"') {
        // Escaped quote: "" inside a quoted field → literal "
        field += '"'; i += 2;
      } else if (ch === '"') {
        // End of quoted field
        inQuote = false; i++;
      } else if (ch === '\r') {
        // Strip \r — Windows line endings inside quoted fields
        // would otherwise appear in the stored text
        i++;
      } else {
        field += ch; i++;
      }
    } else {
      if      (ch === '"')  { inQuote = true; i++; }
      else if (ch === ',')  { row.push(field); field = ''; i++; }
      else if (ch === '\r') {
        // \r\n line ending: skip the \r, let \n handle the row break
        if (i + 1 < n && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = ''; i++;
      }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
      else                  { field += ch; i++; }
    }
  }
  // Handle last row without trailing newline
  if (field || row.length > 0) {
    row.push(field);
    if (row.some(f => f.trim())) rows.push(row);
  }
  return rows;
}
```

The `\r` stripping inside quoted fields is critical — Windows line endings (`\r\n`) inside a multi-line quoted cell would leave literal `\r` characters in stored text, which then appear as `\r\n` in the output WTS file.

### Format-Specific Parsers

The project has two CSV layouts from Google Sheets:

**VO CSV** (7 columns):
```
STATUS · UNIT · UNIT TRANSLATION · ENGLISH · TRANSLATION · STRING NUMBER · VARIABLE NAME
```

**Text CSV** (6 columns):
```
STATUS · TYPE · ENGLISH · TRANSLATION · STRING NUMBER · VARIABLE NAME
```

Rather than one parser that tries to auto-detect, use two explicit functions — one per format. This makes the code readable and the column indices obvious.

```js
function parseVoCSV(csvText) {
  const allRows = parseCSVText(csvText);
  if (!allRows.length) return { results: [], warnings: [] };

  // Wrong file detection: Text CSV has "TYPE" in header col[1], VO has "UNIT"
  const headerCol1 = (allRows[0][1] || '').trim().toUpperCase();
  if (headerCol1 === 'TYPE') {
    return {
      results: [],
      warnings: ['⚠ Wrong file in VO zone: this looks like a Text CSV. Swap the drop zones.']
    };
  }

  let dataStart = 0;
  if ((allRows[0][0] || '').trim().toUpperCase() === 'STATUS') dataStart = 1;

  const results = [], warnings = [];

  for (let i = dataStart; i < allRows.length; i++) {
    const row    = allRows[i];
    const status = (row[0] || '').trim();
    if (!status) continue;
    if (status.toUpperCase().includes('SCENE')) continue;  // separator rows

    const key    = (row[6] || '').trim();   // VARIABLE NAME
    const source = (row[3] || '').trim();   // ENGLISH

    if (!key && !source) continue;
    if (!key)    { warnings.push(`VO row ${i + 1}: missing VARIABLE NAME`); continue; }
    if (!source) { warnings.push(`VO row ${i + 1} (${key}): missing English text`); continue; }

    results.push({
      key,
      type:         typeFromKey(key) || 'VO',
      unit:         (row[1] || '').trim() || null,
      source,
      stringNumber: extractStringNumber(row[5]),
    });
  }
  return { results, warnings };
}
```

**The wrong-file detection** (`headerCol1 === 'TYPE'`) catches the most common mistake: dropping VO CSV on the Text zone. Instead of silently producing 100 "missing English" warnings, it immediately explains the problem.

### Helper functions

```js
function extractStringNumber(raw) {
  if (!raw) return null;
  const m = raw.trim().match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
  // "STRING 3848" → 3848
}

function typeFromKey(key) {
  // "RoA_A01_M01_VO_S001_001_TME" → "VO"
  // "RoA_A01_M01_OBJE_001"        → "OBJE"
  const m = key.match(/^[A-Za-z]+_A\d+_M\d+_([A-Z]+)/);
  return m ? m[1] : null;
}
```

Extracting `type` from the key pattern is more reliable than trusting the TYPE column in the Text CSV — Google Sheets users sometimes enter inconsistent values there.

---

## Part 6 — Drop Zone Wiring (app.js)

### Setting Up Drop Zones

Both drop zones share the same behavior, so extract a reusable function:

```js
// js/app.js
let rawVO   = null;
let rawText = null;

setupDrop('drop-vo',   'file-vo',   'label-vo',   (content) => { rawVO   = content; });
setupDrop('drop-text', 'file-text', 'label-text',  (content) => { rawText = content; });

function setupDrop(zoneId, inputId, labelId, onLoad) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);

  // Click on zone → open file picker
  zone.addEventListener('click', () => input.click());

  // Drag visual feedback
  zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));

  // Handle drop
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) readFile(file, labelId, onLoad);
  });

  // Handle file picker selection
  input.addEventListener('change', () => {
    if (input.files[0]) readFile(input.files[0], labelId, onLoad);
  });
}

function readFile(file, labelId, onLoad) {
  const reader = new FileReader();
  reader.onload = (e) => {
    onLoad(e.target.result);
    document.getElementById(labelId).textContent = file.name;
  };
  reader.readAsText(file, 'UTF-8');
}
```

`e.preventDefault()` on `dragover` is required — without it the browser navigates to the file instead of firing the `drop` event.

`FileReader.readAsText(file, 'UTF-8')` — always specify the encoding. Google Sheets exports UTF-8 BOM-less CSV. Without the encoding argument, the browser may guess wrong on Windows.

---

## Part 7 — Building the JSON Database (app.js, continued)

### The Build Function

```js
let generatedJSON = null;

document.getElementById('btn-parse').addEventListener('click', () => {
  if (!rawVO && !rawText) return showHint('Upload at least one CSV file');
  processCSVs();
});

async function processCSVs() {
  const voRes   = rawVO   ? parseVoCSV(rawVO)    : { results: [], warnings: [] };
  const textRes = rawText ? parseTextCSV(rawText) : { results: [], warnings: [] };

  const allResults  = [...voRes.results,  ...textRes.results];
  const allWarnings = [...voRes.warnings, ...textRes.warnings];

  if (allResults.length === 0) {
    showHint('No rows found. Check CSV format.');
    return;
  }

  await buildDatabase(allResults, voRes.results.length, textRes.results.length);
  if (allWarnings.length) showWarnings(allWarnings);
}

async function buildDatabase(rows, voCount, textCount) {
  const strings = {};

  for (const row of rows) {
    if (strings[row.key]) continue;  // deduplicate

    const hash  = await computeHash(row.source);
    const entry = { hash };

    if (row.stringNumber !== null) entry.string_number = row.stringNumber;
    if (row.type)                  entry.type           = row.type;
    if (row.unit)                  entry.unit           = row.unit;
    entry.source = row.source;

    strings[row.key] = entry;
  }

  // Derive meta from the first key pattern: "RoA_A01_M01_..."
  const firstKey  = Object.keys(strings)[0] || '';
  const metaMatch = firstKey.match(/^([A-Za-z]+)_(A\d+)_(M\d+)_/);

  generatedJSON = {
    meta: {
      campaign:    metaMatch ? metaMatch[1] : '?',
      act:         metaMatch ? metaMatch[2] : '?',
      map:         metaMatch ? metaMatch[3] : '?',
      source_lang: 'en',
      generated:   new Date().toISOString().split('T')[0],
    },
    strings,
  };

  showStats(voCount, textCount, Object.keys(strings).length);
  renderPreview(strings);
}
```

**Why `if (strings[row.key]) continue`?** The same key can appear in both VO and Text CSVs if there's a data entry error. First occurrence wins — we don't silently overwrite.

**Why derive meta from the key?** The key already encodes campaign/act/map. Asking the user to fill these in separately would be redundant and error-prone.

---

## Part 8 — File Download

No server needed. The browser can generate a file from a string using `Blob` + `URL.createObjectURL`:

```js
document.getElementById('btn-download').addEventListener('click', () => {
  if (!generatedJSON) return;

  const { campaign, act, map } = generatedJSON.meta;
  const filename = `${campaign}_${act}_${map}_EN.json`;

  const blob = new Blob(
    [JSON.stringify(generatedJSON, null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);

  // Programmatically click a temporary link
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);  // release memory
});
```

`JSON.stringify(obj, null, 2)` — the `null, 2` arguments produce human-readable indented JSON. This matters because the database file will be committed to git — readable diffs are important.

`URL.revokeObjectURL` immediately after `click()` is safe because the browser handles the download asynchronously. The blob stays in memory until the download starts.

---

## Part 9 — Showing Results

### Stats

```js
function showStats(voCount, textCount, total) {
  document.getElementById('stat-vo').textContent    = `${voCount} VO`;
  document.getElementById('stat-text').textContent  = `${textCount} Text`;
  document.getElementById('stat-total').textContent = `${total} total`;
  document.getElementById('result-section').classList.remove('hidden');
}
```

### Preview Table (first 10 rows, expandable)

```js
function renderPreview(strings) {
  const keys  = Object.keys(strings);
  const tbody = document.getElementById('preview-body');
  tbody.innerHTML = '';

  function appendRows(ks) {
    ks.forEach(key => {
      const s   = strings[key];
      const src = s.source.length > 60 ? s.source.slice(0, 60) + '…' : s.source;
      const tr  = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono">${key}</td>
        <td class="mono dim">${s.type || '—'}</td>
        <td>${s.unit || '—'}</td>
        <td class="source-text">${src}</td>
        <td class="mono dim">${s.string_number ?? '—'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  appendRows(keys.slice(0, 10));

  const moreEl    = document.getElementById('preview-more');
  const remaining = keys.length - 10;
  if (remaining > 0) {
    moreEl.innerHTML =
      `<button id="btn-show-all" class="btn btn-ghost">... and ${remaining} more rows — show all</button>`;
    document.getElementById('btn-show-all').addEventListener('click', () => {
      appendRows(keys.slice(10));
      moreEl.textContent = '';
    });
  }

  document.getElementById('preview-section').classList.remove('hidden');
}
```

**Why only 10 rows by default?** A typical map has 200-400 strings. Rendering all of them immediately blocks the UI thread briefly and produces a very long page. Showing 10 with a "show all" button is the right default for a tool used by people who will skim the preview, not read every row.

---

## Summary: What Makes This Pattern Work

| Decision | Reason |
|---|---|
| No build step | Zero friction to maintain and deploy |
| CSS custom properties for theme | One variable change updates entire UI |
| Drop zone + hidden file input | Native file picker fallback for drag-and-drop |
| `FileReader.readAsText(file, 'UTF-8')` | Explicit encoding avoids Windows misdetection |
| RFC 4180 parser, not `split(',')` | Google Sheets exports multi-line quoted fields |
| `\r` stripping inside quoted fields | Prevents literal `\r` in stored text |
| Column-count format detection | Catches wrong-file-in-wrong-zone before it creates confusing warnings |
| SHA-256 via `crypto.subtle` | Native browser API, no library, requires HTTPS |
| First 10 hex chars of hash | Enough bits for collision safety at any realistic map size |
| Extract `type` from key pattern | More reliable than the TYPE column in CSV |
| `JSON.stringify(obj, null, 2)` | Readable diffs when database is committed to git |
| `URL.revokeObjectURL` after download | Releases the blob from memory immediately |

---

*Next: [Update DB](README.md#update-db) — loading a database by fetch and running the two-pass WTS comparison algorithm.*
