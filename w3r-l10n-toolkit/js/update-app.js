// ─── Database list ────────────────────────────────────────────────────────────
// Add entries here as new map databases are generated.
const DATABASES = [
  { id: 'RoA_A01_M01', label: 'RoA · Act 1 · Map 01' },
];

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
  opt.value       = db.id;
  opt.textContent = db.label;
  dbSelect.appendChild(opt);
}

// ─── Fetch DB on select change ────────────────────────────────────────────────
dbSelect.addEventListener('change', async () => {
  dbJSON = null;
  updateCheckBtn();

  const id = dbSelect.value;
  if (!id) { setFetchStatus(''); return; }

  setFetchStatus('Loading...');
  try {
    const res = await fetch(`database/${id}_EN.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dbJSON = await res.json();
    const count = Object.keys(dbJSON.strings || {}).length;
    setFetchStatus(`Loaded: ${count} rows`, 'ok');
  } catch (err) {
    setFetchStatus(`Load error: ${err.message}`, 'err');
  }
  updateCheckBtn();
});

function setFetchStatus(msg, type) {
  fetchStatus.textContent = msg;
  fetchStatus.className   = 'form-hint' + (msg ? '' : ' hidden');
  if (type === 'ok')  fetchStatus.style.color = 'var(--success)';
  else if (type === 'err') fetchStatus.style.color = 'var(--warn)';
  else fetchStatus.style.color = 'var(--muted)';
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

    if (entry.wts_source != null) {
      // Has WTS baseline from a previous run — compare original-language text
      if (wtsMap[sn] === entry.wts_source) {
        ok.push({ key, sn, text: wtsMap[sn] });
      } else {
        updated.push({ key, sn, oldSource: entry.wts_source, newSource: wtsMap[sn] });
      }
    } else {
      // No WTS baseline yet (DB built from CSV only) — treat current WTS as baseline
      ok.push({ key, sn, text: wtsMap[sn] });
    }
  }

  // Second pass: fuzzy match for entries whose string_number is gone from WTS
  for (const [key, entry] of Object.entries(db.strings)) {
    const sn = entry.string_number;
    if (sn == null || sn in wtsMap) continue;

    // Prefer original-language baseline; fall back to English source
    const compareText = entry.wts_source ?? entry.source;
    const match = fuzzySearch(compareText, wtsMap, claimed);
    if (match) {
      claimed.add(match.sn);
      reassigned.push({
        key,
        oldSN:     sn,
        newSN:     match.sn,
        oldSource: compareText,
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

  document.getElementById('btn-download').disabled = !(ch.ok.length > 0 || ch.updated.length > 0 || ch.reassigned.length > 0);
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
  return items.map(item => `
    <tr>
      <td class="mono">${esc(item.key)}</td>
      <td class="mono dim">${item.sn}</td>
      <td class="source-text dim">${esc(trim80(item.oldSource))}</td>
      <td class="source-text">${esc(trim80(item.newSource))}</td>
    </tr>`).join('');
}

function renderReassignedRows(items) {
  if (!items.length) return '';
  return items.map((item, idx) => `
    <tr>
      <td><input type="checkbox" class="reassign-cb" data-idx="${idx}" checked></td>
      <td class="mono">${esc(item.key)}</td>
      <td class="mono dim">${item.oldSN} → ${item.newSN}</td>
      <td class="source-text dim">${esc(trim80(item.oldSource))}</td>
      <td class="source-text">${esc(trim80(item.newSource))}</td>
      <td class="mono dim">${Math.round(item.score * 100)}%</td>
    </tr>`).join('');
}

function renderNotFoundRows(items) {
  if (!items.length) return '';
  return items.map(item => `
    <tr>
      <td class="mono">${esc(item.key)}</td>
      <td class="mono dim">${item.entry.string_number ?? '—'}</td>
      <td class="source-text">${esc(trim80(item.entry.source))}</td>
    </tr>`).join('');
}

document.getElementById('body-reassigned').addEventListener('change', (e) => {
  if (e.target.classList.contains('reassign-cb')) {
    changes.reassigned[parseInt(e.target.dataset.idx)].accepted = e.target.checked;
  }
});

// ─── Download ─────────────────────────────────────────────────────────────────
document.getElementById('btn-download').addEventListener('click', () => {
  if (!dbJSON || !changes) return;

  const newDB = JSON.parse(JSON.stringify(dbJSON));
  newDB.meta.generated = new Date().toISOString().split('T')[0];

  // Save current WTS text as baseline for all unchanged strings (bootstrap or refresh)
  for (const item of changes.ok) {
    newDB.strings[item.key].wts_source = item.text;
  }

  // For updated strings: record new WTS text as baseline; English source stays for manual review
  for (const item of changes.updated) {
    newDB.strings[item.key].wts_source = item.newSource;
  }

  // For renumbered strings: update string_number and record new WTS text as baseline
  for (const item of changes.reassigned) {
    if (!item.accepted) continue;
    const entry         = newDB.strings[item.key];
    entry.string_number = item.newSN;
    entry.wts_source    = item.newSource;
  }

  const { campaign, act, map } = newDB.meta;
  const filename = `${campaign}_${act}_${map}_EN.json`;
  const blob = new Blob([JSON.stringify(newDB, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function trim80(str) { return str && str.length > 80 ? str.slice(0, 80) + '…' : str; }
function esc(str)    { return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function showHint(msg) { formHint.textContent = msg; formHint.classList.remove('hidden'); }
function hideHint()    { formHint.classList.add('hidden'); }
