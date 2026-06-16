// ─── Database list ────────────────────────────────────────────────────────────
// Each entry: { file: 'RoA_A01_M01_EN_1781635020', label: 'RoA · Act 1 · Map 01' }
// file = filename without .json extension; Unix timestamp suffix is parsed for display.
const DATABASES = [
  { file: 'RoA_A01_M01_EN', label: 'RoA · Act 1 · Map 01' },
];

const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

function formatFileLabel(db) {
  const m = db.file.match(/_(\d{9,})$/);
  if (!m) return db.label;
  const d = new Date(parseInt(m[1]) * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${db.label}  ·  ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${hh}:${mm}:${ss}`;
}

let dbJSON  = null;
let wtsRaw  = null;
let changes = null;

const dbSelect    = document.getElementById('db-select');
const fetchStatus = document.getElementById('fetch-status');
const btnCheck    = document.getElementById('btn-check');
const formHint    = document.getElementById('form-hint');

// ─── Populate select ──────────────────────────────────────────────────────────
for (const db of DATABASES) {
  const opt = document.createElement('option');
  opt.value       = db.file;
  opt.textContent = formatFileLabel(db);
  dbSelect.appendChild(opt);
}

// ─── Fetch DB on select change ────────────────────────────────────────────────
dbSelect.addEventListener('change', async () => {
  dbJSON = null;
  updateCheckBtn();

  const file = dbSelect.value;
  if (!file) { setFetchStatus(''); return; }

  setFetchStatus('Loading...');
  try {
    const res = await fetch(`database/${file}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dbJSON = await res.json();
    const count = Object.keys(dbJSON.strings || {}).length;
    setFetchStatus(`✓ ${count} rows`, 'ok');
  } catch (err) {
    setFetchStatus(`✕ ${err.message}`, 'err');
  }
  updateCheckBtn();
});

function setFetchStatus(msg, type) {
  fetchStatus.textContent = msg;
  fetchStatus.className   = msg ? `db-status db-status--${type || 'loading'}` : 'db-status hidden';
}

// ─── WTS drop zone ────────────────────────────────────────────────────────────
setupDropZone('drop-wts', 'wts-file', 'label-wts', loadWTS);

function setupDropZone(zoneId, inputId, labelId, onFile) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) onFile(file, labelId);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) onFile(input.files[0], labelId);
  });
}

function loadWTS(file, labelId) {
  const reader = new FileReader();
  reader.onload = (e) => {
    wtsRaw = e.target.result;
    document.getElementById(labelId).textContent = file.name;
    updateCheckBtn();
  };
  reader.readAsText(file, 'UTF-8');
}

function updateCheckBtn() {
  btnCheck.disabled = !(dbJSON && wtsRaw);
}

// ─── Check ────────────────────────────────────────────────────────────────────
btnCheck.addEventListener('click', () => {
  hideHint();
  document.getElementById('results').classList.add('hidden');

  const wtsMap = parseWTS(wtsRaw);
  changes = runCheck(dbJSON, wtsMap);
  renderResults(changes);
});

// ─── WTS parser ───────────────────────────────────────────────────────────────
function parseWTS(text) {
  const map   = {};
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let i = 0;

  while (i < lines.length) {
    const m = lines[i].trim().match(/^STRING\s+(\d+)$/i);
    if (m) {
      const num = parseInt(m[1], 10);
      i++;
      while (i < lines.length && lines[i].trim() !== '{') i++;
      i++; // skip {
      const parts = [];
      while (i < lines.length && lines[i].trim() !== '}') {
        parts.push(lines[i]);
        i++;
      }
      i++; // skip }
      map[num] = parts.join('\n').trimEnd();
    } else {
      i++;
    }
  }

  return map;
}

// ─── Check algorithm ──────────────────────────────────────────────────────────
function runCheck(db, wtsMap) {
  const ok         = [];
  const updated    = [];
  const reassigned = [];
  const notFound   = [];
  const claimed    = new Set();

  // First pass: exact string_number lookup
  for (const [key, entry] of Object.entries(db.strings)) {
    const sn = entry.string_number;
    if (sn == null || !(sn in wtsMap)) continue;

    claimed.add(sn);
    // Use wts_source baseline if present (set by a previous update run), otherwise fall back to source
    const baseline = entry.wts_source ?? entry.source;
    if (normalizeWS(wtsMap[sn]) === normalizeWS(baseline)) {
      ok.push(key);
    } else {
      updated.push({ key, sn, oldSource: baseline, newSource: wtsMap[sn] });
    }
  }

  // Second pass: fuzzy match for entries whose string_number is gone from WTS
  for (const [key, entry] of Object.entries(db.strings)) {
    const sn = entry.string_number;
    if (sn == null || sn in wtsMap) continue;

    const baseline = entry.wts_source ?? entry.source;
    const match = fuzzySearch(baseline, wtsMap, claimed);
    if (match) {
      claimed.add(match.sn);
      reassigned.push({
        key,
        oldSN:     sn,
        newSN:     match.sn,
        oldSource: baseline,
        newSource: match.text,
        score:     match.score,
        accepted:  true,
      });
    } else {
      notFound.push({ key, entry });
    }
  }

  return { ok, updated, reassigned, notFound };
}

function fuzzySearch(source, wtsMap, skip) {
  let best      = null;
  let bestScore = 0.95;

  for (const [snStr, text] of Object.entries(wtsMap)) {
    const sn = parseInt(snStr);
    if (skip.has(sn)) continue;
    const score = textSimilarity(source, text);
    if (score > bestScore) { bestScore = score; best = { sn, text, score }; }
  }

  return best;
}

function textSimilarity(a, b) {
  a = a.trim(); b = b.trim();
  if (a === b) return 1;
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return 1;
  if (Math.min(a.length, b.length) / longer < 0.5) return 0;
  return 1 - levenshtein(a, b) / longer;
}

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[b.length];
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderResults(ch) {
  document.getElementById('stat-ok').textContent         = `${ch.ok.length} unchanged`;
  document.getElementById('stat-updated').textContent    = `${ch.updated.length} updated`;
  document.getElementById('stat-reassigned').textContent = `${ch.reassigned.length} renumbered`;
  document.getElementById('stat-notfound').textContent   = `${ch.notFound.length} not found`;

  document.getElementById('stat-ok').className         = 'stat' + (ch.ok.length         ? ' success' : '');
  document.getElementById('stat-updated').className    = 'stat' + (ch.updated.length    ? ' warn'    : '');
  document.getElementById('stat-reassigned').className = 'stat' + (ch.reassigned.length ? ' warn'    : '');
  document.getElementById('stat-notfound').className   = 'stat' + (ch.notFound.length   ? ''         : ' success');

  renderSection('section-updated',    'body-updated',    renderUpdatedRows(ch.updated));
  renderSection('section-reassigned', 'body-reassigned', renderReassignedRows(ch.reassigned));
  renderSection('section-notfound',   'body-notfound',   renderNotFoundRows(ch.notFound));

  document.getElementById('btn-download').disabled = !(ch.updated.length > 0 || ch.reassigned.length > 0);
  document.getElementById('results').classList.remove('hidden');
}

function renderSection(sectionId, tbodyId, html) {
  const section = document.getElementById(sectionId);
  if (!html) { section.classList.add('hidden'); return; }
  document.getElementById(tbodyId).innerHTML = html;
  section.classList.remove('hidden');
}

function renderUpdatedRows(items) {
  if (!items.length) return '';
  return items.map(item => {
    const { oldHtml, newHtml } = diffWords(item.oldSource, item.newSource);
    return `
    <tr>
      <td class="mono">${esc(item.key)}</td>
      <td class="mono dim">${item.sn}</td>
      <td class="source-text">${oldHtml}</td>
      <td class="source-text">${newHtml}</td>
    </tr>`;
  }).join('');
}

function diffWords(oldText, newText) {
  const a = (oldText || '').split(/(\s+)/);
  const b = (newText || '').split(/(\s+)/);
  const m = a.length, n = b.length;

  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);

  const aParts = [], bParts = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
      aParts.unshift({ t: a[i-1], ch: false });
      bParts.unshift({ t: b[j-1], ch: false });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      bParts.unshift({ t: b[j-1], ch: true }); j--;
    } else {
      aParts.unshift({ t: a[i-1], ch: true }); i--;
    }
  }

  const render = (parts, cls) =>
    parts.map(p => (p.ch && p.t.trim()) ? `<mark class="${cls}">${esc(p.t)}</mark>` : esc(p.t)).join('');

  return { oldHtml: render(aParts, 'diff-rem'), newHtml: render(bParts, 'diff-add') };
}

function renderReassignedRows(items) {
  if (!items.length) return '';
  return items.map((item, idx) => `
    <tr>
      <td><input type="checkbox" class="reassign-cb" data-idx="${idx}" checked></td>
      <td class="mono">${esc(item.key)}</td>
      <td class="mono dim">${item.oldSN} → ${item.newSN}</td>
      <td class="source-text dim">${esc(item.oldSource)}</td>
      <td class="source-text">${esc(item.newSource)}</td>
      <td class="mono dim">${Math.round(item.score * 100)}%</td>
    </tr>`).join('');
}

function renderNotFoundRows(items) {
  if (!items.length) return '';
  return items.map(item => `
    <tr>
      <td class="mono">${esc(item.key)}</td>
      <td class="mono dim">${item.entry.string_number ?? '—'}</td>
      <td class="source-text">${esc(item.entry.source)}</td>
    </tr>`).join('');
}

document.getElementById('body-reassigned').addEventListener('change', (e) => {
  if (e.target.classList.contains('reassign-cb')) {
    changes.reassigned[parseInt(e.target.dataset.idx)].accepted = e.target.checked;
  }
});

// ─── Download ─────────────────────────────────────────────────────────────────
document.getElementById('btn-download').addEventListener('click', async () => {
  if (!dbJSON || !changes) return;

  const newDB = JSON.parse(JSON.stringify(dbJSON));
  newDB.meta.generated = new Date().toISOString().split('T')[0];

  for (const item of changes.updated) {
    const entry  = newDB.strings[item.key];
    entry.source = item.newSource;
    entry.hash   = await computeHash(item.newSource);
    // If the DB previously had a wts_source baseline, keep tracking it in sync
    if (entry.wts_source != null) entry.wts_source = item.newSource;
  }

  for (const item of changes.reassigned) {
    if (!item.accepted) continue;
    const entry         = newDB.strings[item.key];
    entry.string_number = item.newSN;
    entry.source        = item.newSource;
    entry.hash          = await computeHash(item.newSource);
    if (entry.wts_source != null) entry.wts_source = item.newSource;
  }

  const { campaign, act, map } = newDB.meta;
  const ts = Math.floor(Date.now() / 1000);
  const filename = `${campaign}_${act}_${map}_EN_${ts}.json`;
  const blob = new Blob([JSON.stringify(newDB, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeWS(s) { return (s || '').split(/\s+/).join(' ').trim(); }
function trim80(str) { return str && str.length > 80 ? str.slice(0, 80) + '…' : str; }
function esc(str)    { return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function showHint(msg) { formHint.textContent = msg; formHint.classList.remove('hidden'); }
function hideHint()    { formHint.classList.add('hidden'); }
