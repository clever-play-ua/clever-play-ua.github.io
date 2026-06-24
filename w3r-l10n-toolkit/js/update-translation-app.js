// State
let manifestList    = [];
let selectedEntry   = null;
let dbMeta          = null;
let baseTranslation = null;
let generatedJSON   = null;

const sources = {
  0: { headers: null, rows: null, mapping: {} },
  1: { headers: null, rows: null, mapping: {} },
};

const PREVIEW_ROWS = 4;
const dbSelect    = document.getElementById('db-select');
const fetchStatus = document.getElementById('fetch-status');
const formHint    = document.getElementById('form-hint');

// ── Manifest ──────────────────────────────────────────────────────────────────
fetch('database/manifest.json')
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(list => {
    manifestList = list;
    list.forEach(entry => {
      const opt       = document.createElement('option');
      opt.value       = entry.file;
      opt.textContent = entry.label;
      dbSelect.appendChild(opt);
    });
  })
  .catch(() => {
    const opt       = document.createElement('option');
    opt.textContent = '⚠ manifest.json not found';
    dbSelect.appendChild(opt);
  });

// ── DB select ─────────────────────────────────────────────────────────────────
dbSelect.addEventListener('change', () => {
  const file = dbSelect.value;
  resetResults();
  hideHint();

  if (!file) {
    selectedEntry = dbMeta = baseTranslation = null;
    setStatus('hidden');
    document.getElementById('csv-section').classList.add('hidden');
    document.getElementById('base-preview').classList.add('hidden');
    return;
  }

  selectedEntry = manifestList.find(e => e.file === file) || null;
  setStatus('loading', 'Loading…');

  fetch(`database/${file}.json`)
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      dbMeta = data.meta || null;
      if (selectedEntry?.translation) {
        return fetch(`database/translations/${selectedEntry.translation}.json`)
          .then(r => r.ok ? r.json() : null).catch(() => null);
      }
      return null;
    })
    .then(trans => {
      baseTranslation = trans || {};
      const count = Object.keys(baseTranslation).length;
      setStatus('ok', count ? `Base: ${count} entries` : 'No existing translation');
      renderBasePreview(baseTranslation);
      resetCsvInputs();
      document.getElementById('csv-section').classList.remove('hidden');
      checkMergeReady();
    })
    .catch(() => {
      setStatus('err', 'Load failed');
      showHint('Could not load the selected database.');
    });
});

function renderBasePreview(trans) {
  const wrap  = document.getElementById('base-preview');
  const table = document.getElementById('base-preview-table');
  const title = document.getElementById('base-preview-title');
  const keys  = Object.keys(trans);

  if (!keys.length) { wrap.classList.add('hidden'); return; }

  title.textContent = `Current translation — ${keys.length} entries`;
  table.innerHTML = keys.slice(0, 5).map(key => {
    const val  = trans[key];
    const clip = val.length > 90 ? val.slice(0, 90) + '…' : val;
    return `<tr><td>${esc(key)}</td><td>${esc(clip)}</td></tr>`;
  }).join('');

  wrap.classList.remove('hidden');
}

function setStatus(type, text) {
  if (type === 'hidden') { fetchStatus.classList.add('hidden'); return; }
  fetchStatus.textContent = text;
  fetchStatus.className   = `db-status db-status--${type}`;
  fetchStatus.classList.remove('hidden');
}

// ── CSV drop zones ────────────────────────────────────────────────────────────
[0, 1].forEach(idx => {
  const zone  = document.getElementById(`drop-src-${idx}`);
  const input = document.getElementById(`file-src-${idx}`);

  zone.addEventListener('click',    () => input.click());
  zone.addEventListener('dragover',  e  => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) loadCsv(e.dataTransfer.files[0], idx);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) loadCsv(input.files[0], idx);
  });
});

function loadCsv(file, idx) {
  const reader = new FileReader();
  reader.onload = e => onCsvLoaded(idx, e.target.result, file.name);
  reader.readAsText(file, 'UTF-8');
}

// ── CSV loaded → mapping table ────────────────────────────────────────────────
function onCsvLoaded(idx, text, filename) {
  const all = parseCSVText(text);
  if (!all.length) { showHint('Empty or invalid CSV.'); return; }

  const src   = sources[idx];
  src.headers = all[0].map(c => c.trim());
  src.rows    = all.slice(1).filter(r => r.some(c => c.trim()));
  src.mapping = {};

  // Auto-detect Variable Name and Translation columns
  src.headers.forEach((h, i) => {
    const u = h.toUpperCase();
    if (u === 'VARIABLE NAME' || u === 'VARIABLE_NAME' || u === 'KEY') src.mapping[i] = 'key';
    else if (u === 'TRANSLATION' || u === 'TRANSLATED')                  src.mapping[i] = 'translation';
  });

  document.getElementById(`label-src-${idx}`).textContent = filename;
  document.getElementById(`drop-src-${idx}`).classList.add('drag-over');
  document.getElementById(`info-src-${idx}`).textContent  =
    `${src.rows.length} rows · ${src.headers.length} columns`;

  renderMappingTable(idx);
  document.getElementById(`mapping-block-${idx}`).classList.remove('hidden');
  checkMergeReady();
}

function renderMappingTable(idx) {
  const src     = sources[idx];
  const table   = document.getElementById(`maptable-${idx}`);
  const preview = src.rows.slice(0, PREVIEW_ROWS);

  // thead
  let html = '<thead><tr>';
  src.headers.forEach((h, i) => {
    html += `<th>
      <div class="col-name">${esc(h)}</div>
      <select class="col-map-select" data-col="${i}" data-idx="${idx}">
        <option value="">— skip —</option>
        <option value="key">Variable Name</option>
        <option value="translation">Translation</option>
      </select>
    </th>`;
  });
  html += '</tr></thead><tbody>';

  // preview rows
  preview.forEach(row => {
    html += '<tr>';
    src.headers.forEach((_, i) => {
      const val  = (row[i] || '').trim();
      const clip = val.length > 60 ? val.slice(0, 60) + '…' : val;
      html += `<td>${esc(clip)}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;

  // events
  table.querySelectorAll('.col-map-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const col = parseInt(sel.dataset.col, 10);
      const val = sel.value;
      // enforce unique roles
      if (val) {
        Object.keys(src.mapping).forEach(k => { if (src.mapping[k] === val) delete src.mapping[k]; });
        src.mapping[col] = val;
      } else {
        delete src.mapping[col];
      }
      syncTableUI(idx);
      checkMergeReady();
    });
  });

  syncTableUI(idx);
}

function syncTableUI(idx) {
  const src   = sources[idx];
  const table = document.getElementById(`maptable-${idx}`);
  if (!table) return;

  table.querySelectorAll('.col-map-select').forEach(sel => {
    const col  = parseInt(sel.dataset.col, 10);
    const role = src.mapping[col] || '';
    sel.value     = role;
    sel.className = 'col-map-select' +
      (role === 'key'         ? ' mapped-key'   :
       role === 'translation' ? ' mapped-trans'  : '');
  });

  table.querySelectorAll('tbody tr').forEach(tr => {
    tr.querySelectorAll('td').forEach((td, i) => {
      const role = src.mapping[i];
      td.className = role === 'key'         ? 'col-key'         :
                     role === 'translation' ? 'col-translation'  : '';
    });
  });

}

// ── Merge ─────────────────────────────────────────────────────────────────────
function checkMergeReady() {
  const anyReady = [0, 1].some(idx => {
    const src = sources[idx];
    return src.rows &&
      Object.values(src.mapping).includes('key') &&
      Object.values(src.mapping).includes('translation');
  });
  document.getElementById('btn-merge').disabled = !anyReady;
}

document.getElementById('btn-merge').addEventListener('click', doMerge);

function doMerge() {
  hideHint();
  resetResults();

  generatedJSON = Object.assign({}, baseTranslation);
  let addedCount   = 0;
  let updatedCount = 0;
  const warnings   = [];
  const changes    = [];

  [0, 1].forEach(idx => {
    const src = sources[idx];
    if (!src.rows) return;

    const keyCol   = colFor(src, 'key');
    const transCol = colFor(src, 'translation');
    if (keyCol === null || transCol === null) return;

    for (let i = 0; i < src.rows.length; i++) {
      const row   = src.rows[i];
      const key   = (row[keyCol]   || '').trim();
      const trans = (row[transCol] || '').trim();

      if (!key && !trans) continue;
      if (!key)   { warnings.push(`CSV${idx + 1} row ${i + 2}: missing variable name`); continue; }
      if (!trans) { warnings.push(`CSV${idx + 1} row ${i + 2} (${key}): missing translation`); continue; }

      const isNew     = !(key in generatedJSON);
      const oldTrans  = isNew ? null : generatedJSON[key];
      const isChanged = !isNew && oldTrans !== trans;

      generatedJSON[key] = trans;
      if (isNew)          { addedCount++;   changes.push({ key, oldTrans: null,     newTrans: trans, tag: 'new' }); }
      else if (isChanged) { updatedCount++; changes.push({ key, oldTrans,           newTrans: trans, tag: 'updated' }); }
    }
  });

  const baseCount  = Object.keys(baseTranslation || {}).length;
  const totalCount = Object.keys(generatedJSON).length;
  const hasChanges = addedCount > 0 || updatedCount > 0;

  document.getElementById('stat-base').textContent    = `${baseCount} base`;
  document.getElementById('stat-new').textContent     = `${addedCount} new`;
  document.getElementById('stat-updated').textContent = `${updatedCount} updated`;
  document.getElementById('stat-total').textContent   = `${totalCount} total`;

  document.getElementById('no-changes-msg').classList.toggle('hidden', hasChanges);
  document.getElementById('download-actions').style.display = hasChanges ? '' : 'none';

  if (warnings.length) {
    document.getElementById('warn-list').innerHTML =
      warnings.map(w => `<li>${esc(w)}</li>`).join('');
    document.getElementById('warn-section').classList.remove('hidden');
  }

  renderPreview(changes);
  document.getElementById('result-section').classList.remove('hidden');
}

function colFor(src, role) {
  const entry = Object.entries(src.mapping).find(([, v]) => v === role);
  return entry ? parseInt(entry[0], 10) : null;
}

// ── Preview ───────────────────────────────────────────────────────────────────
function renderPreview(changes) {
  const tbody = document.getElementById('preview-body');
  tbody.innerHTML = '';
  if (!changes.length) { document.getElementById('preview-section').classList.add('hidden'); return; }

  function appendRows(items) {
    items.forEach(({ key, oldTrans, newTrans, tag }) => {
      const tr = document.createElement('tr');
      if (tag === 'updated' && oldTrans !== null) {
        const { oldHtml, newHtml } = diffInline(oldTrans, newTrans);
        tr.innerHTML = `
          <td class="mono">${esc(key)}</td>
          <td><span class="tag-${tag}">${tag}</span></td>
          <td class="source-text">${oldHtml}</td>
          <td class="source-text">${newHtml}</td>
        `;
      } else {
        const clip = newTrans.length > 80 ? newTrans.slice(0, 80) + '…' : newTrans;
        tr.innerHTML = `
          <td class="mono">${esc(key)}</td>
          <td><span class="tag-${tag}">${tag}</span></td>
          <td class="cell-dash">—</td>
          <td class="source-text">${esc(clip)}</td>
        `;
      }
      tbody.appendChild(tr);
    });
  }

  appendRows(changes.slice(0, 10));

  const moreEl    = document.getElementById('preview-more');
  const remaining = changes.length - 10;
  if (remaining > 0) {
    moreEl.innerHTML =
      `<button id="btn-show-all" class="btn btn-ghost">... and ${remaining} more — show all</button>`;
    document.getElementById('btn-show-all').addEventListener('click', () => {
      appendRows(changes.slice(10));
      moreEl.textContent = '';
    });
  } else {
    moreEl.textContent = '';
  }

  document.getElementById('preview-section').classList.remove('hidden');
}

// ── Download ──────────────────────────────────────────────────────────────────
document.getElementById('btn-download').addEventListener('click', () => {
  if (!generatedJSON) return;
  const meta = dbMeta || {};
  const ts   = Math.floor(Date.now() / 1000);
  const parts = [meta.campaign, meta.act, meta.map, 'UA', ts].filter(Boolean);
  const filename = (parts.length > 1 ? parts : ['translation', ts]).join('_') + '.json';
  const blob = new Blob([JSON.stringify(generatedJSON, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
});

// ── Reset ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-reset-csv').addEventListener('click', () => {
  resetCsvInputs();
  resetResults();
  checkMergeReady();
});

function resetCsvInputs() {
  [0, 1].forEach(idx => {
    const src = sources[idx];
    src.headers = src.rows = null;
    src.mapping = {};
    document.getElementById(`label-src-${idx}`).textContent = 'Drop CSV or click';
    document.getElementById(`file-src-${idx}`).value        = '';
    document.getElementById(`drop-src-${idx}`).classList.remove('drag-over');
    document.getElementById(`mapping-block-${idx}`).classList.add('hidden');
  });
}

function resetResults() {
  generatedJSON = null;
  ['result-section', 'preview-section', 'warn-section'].forEach(id =>
    document.getElementById(id).classList.add('hidden'));
}

// ── Inline diff ───────────────────────────────────────────────────────────────
// Returns { oldHtml, newHtml } with <mark> tags around changed chars only.
// Uses character-level LCS so scattered changes (capitalisation, single words)
// each get their own highlight instead of one big block.
function diffInline(a, b) {
  if (a === b) return { oldHtml: esc(a), newHtml: esc(b) };

  // For very long strings fall back to prefix/suffix to keep it fast
  if (a.length + b.length > 600) return prefixSuffixDiff(a, b);

  // LCS table
  const m = a.length, n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) { dp[i] = new Array(n + 1).fill(0); }
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);

  // Backtrack → classify each char as equal / removed / added
  const oldParts = [], newParts = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
      oldParts.unshift({ ch: a[i-1], changed: false });
      newParts.unshift({ ch: b[j-1], changed: false });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      newParts.unshift({ ch: b[j-1], changed: true });
      j--;
    } else {
      oldParts.unshift({ ch: a[i-1], changed: true });
      i--;
    }
  }

  return { oldHtml: partsToHtml(oldParts, 'diff-rem'), newHtml: partsToHtml(newParts, 'diff-add') };
}

function partsToHtml(parts, cls) {
  let html = '', inMark = false;
  for (const { ch, changed } of parts) {
    if (changed && !inMark)  { html += `<mark class="${cls}">`; inMark = true; }
    if (!changed && inMark)  { html += '</mark>'; inMark = false; }
    html += esc(ch);
  }
  if (inMark) html += '</mark>';
  return html;
}

function prefixSuffixDiff(a, b) {
  let pre = 0;
  const minLen = Math.min(a.length, b.length);
  while (pre < minLen && a[pre] === b[pre]) pre++;
  let sufA = a.length, sufB = b.length;
  while (sufA > pre && sufB > pre && a[sufA-1] === b[sufB-1]) { sufA--; sufB--; }
  return {
    oldHtml: esc(a.slice(0, pre)) + (sufA > pre ? `<mark class="diff-rem">${esc(a.slice(pre, sufA))}</mark>` : '') + esc(a.slice(sufA)),
    newHtml: esc(b.slice(0, pre)) + (sufB > pre ? `<mark class="diff-add">${esc(b.slice(pre, sufB))}</mark>` : '') + esc(b.slice(sufB)),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function showHint(msg) { formHint.textContent = msg; formHint.classList.remove('hidden'); }
function hideHint()    { formHint.classList.add('hidden'); }
