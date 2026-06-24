let csvHeaders = null;
let csvRows    = null;
let mapping    = {};   // colIndex (number) -> 'key' | 'translation' | 'status'
let generatedJSON = null;

const PREVIEW_ROWS = 4;

// ── Drop zone ────────────────────────────────────────────────────────────────
const dropZone  = document.getElementById('drop-csv');
const fileInput = document.getElementById('file-csv');
const labelEl   = document.getElementById('label-csv');

dropZone.addEventListener('click',    () => fileInput.click());
dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    labelEl.textContent = file.name;
    dropZone.classList.add('drag-over'); // reuse border style as "loaded"
    onCsvLoaded(e.target.result);
  };
  reader.readAsText(file, 'UTF-8');
}

// ── Parse & initialise ───────────────────────────────────────────────────────
function onCsvLoaded(text) {
  hideHint();
  const all = parseCSVText(text);
  if (!all.length) { showHint('Empty or invalid CSV file.'); return; }

  csvHeaders = all[0].map(c => c.trim());
  csvRows    = all.slice(1).filter(r => r.some(c => c.trim()));
  mapping    = {};

  // Auto-detect common column names
  csvHeaders.forEach((h, i) => {
    const u = h.toUpperCase();
    if (u === 'VARIABLE NAME' || u === 'VARIABLE_NAME' || u === 'KEY') {
      mapping[i] = 'key';
    } else if (u === 'TRANSLATION' || u === 'TRANSLATED') {
      mapping[i] = 'translation';
    } else if (u === 'STATUS') {
      mapping[i] = 'status';
    }
  });

  document.getElementById('csv-info').textContent =
    `${csvRows.length} rows · ${csvHeaders.length} columns`;

  renderMappingTable();
  updateState();

  document.getElementById('mapping-section').classList.remove('hidden');
  document.getElementById('result-section').classList.add('hidden');
  document.getElementById('preview-section').classList.add('hidden');
  document.getElementById('warn-section').classList.add('hidden');
}

// ── Mapping table ────────────────────────────────────────────────────────────
function renderMappingTable() {
  const table   = document.getElementById('mapping-table');
  const preview = csvRows.slice(0, PREVIEW_ROWS);

  let html = '<thead><tr>';
  csvHeaders.forEach((h, i) => {
    html += `<th>
      <div class="col-name">${esc(h)}</div>
      <select class="col-map-select" data-col="${i}">
        <option value="">— skip —</option>
        <option value="key">Variable Name</option>
        <option value="translation">Translation</option>
        <option value="status">Status filter</option>
      </select>
    </th>`;
  });
  html += '</tr></thead><tbody>';

  preview.forEach(row => {
    html += '<tr>';
    csvHeaders.forEach((_, i) => {
      const val  = (row[i] || '').trim();
      const clip = val.length > 60 ? val.slice(0, 60) + '…' : val;
      html += `<td>${esc(clip)}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';

  table.innerHTML = html;

  table.querySelectorAll('.col-map-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const col = parseInt(sel.dataset.col, 10);
      const val = sel.value;

      // One column per role
      if (val) {
        Object.keys(mapping).forEach(k => { if (mapping[k] === val) delete mapping[k]; });
        mapping[col] = val;
      } else {
        delete mapping[col];
      }

      syncSelects();
      updateColumnClasses();
      updateState();
    });
  });

  syncSelects();
  updateColumnClasses();
}

function syncSelects() {
  document.querySelectorAll('.col-map-select').forEach(sel => {
    const col  = parseInt(sel.dataset.col, 10);
    const role = mapping[col] || '';
    sel.value = role;
    sel.className = 'col-map-select' +
      (role === 'key'         ? ' mapped-key'   :
       role === 'translation' ? ' mapped-trans'  :
       role === 'status'      ? ' mapped-stat'   : '');
  });
}

function updateColumnClasses() {
  document.querySelectorAll('#mapping-table tbody tr').forEach(tr => {
    tr.querySelectorAll('td').forEach((td, i) => {
      const role = mapping[i];
      td.className = role === 'key'         ? 'col-key'         :
                     role === 'translation' ? 'col-translation'  :
                     role === 'status'      ? 'col-status'       : '';
    });
  });
}

function updateState() {
  const hasKey    = Object.values(mapping).includes('key');
  const hasTrans  = Object.values(mapping).includes('translation');
  const hasStatus = Object.values(mapping).includes('status');

  document.getElementById('btn-build').disabled = !(hasKey && hasTrans);
  document.getElementById('status-filter-row').classList.toggle('hidden', !hasStatus);
}

// ── Build ────────────────────────────────────────────────────────────────────
document.getElementById('btn-build').addEventListener('click', buildTranslation);

function buildTranslation() {
  const keyCol    = colFor('key');
  const transCol  = colFor('translation');
  const statusCol = colFor('status');
  const filterVal = document.getElementById('status-filter-value').value.trim().toUpperCase();

  generatedJSON = {};
  let skipped  = 0;
  const warnings = [];

  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i];

    if (statusCol !== null && filterVal) {
      const status = (row[statusCol] || '').trim().toUpperCase();
      if (!status.includes(filterVal)) { skipped++; continue; }
    }

    const key   = (row[keyCol]   || '').trim();
    const trans = (row[transCol] || '').trim();

    if (!key && !trans) continue;
    if (!key)   { warnings.push(`Row ${i + 2}: missing variable name`); continue; }
    if (!trans) { warnings.push(`Row ${i + 2} (${key}): missing translation`); continue; }
    if (generatedJSON[key]) continue;

    generatedJSON[key] = trans;
  }

  const total = Object.keys(generatedJSON).length;
  document.getElementById('stat-total').textContent   = `${total} entries`;
  document.getElementById('stat-skipped').textContent = `${skipped} skipped`;

  if (warnings.length) {
    document.getElementById('warn-list').innerHTML =
      warnings.map(w => `<li>${esc(w)}</li>`).join('');
    document.getElementById('warn-section').classList.remove('hidden');
  } else {
    document.getElementById('warn-section').classList.add('hidden');
  }

  renderPreview(generatedJSON);
  document.getElementById('result-section').classList.remove('hidden');
}

function colFor(role) {
  const entry = Object.entries(mapping).find(([, v]) => v === role);
  return entry ? parseInt(entry[0], 10) : null;
}

// ── Preview ──────────────────────────────────────────────────────────────────
function renderPreview(data) {
  const keys  = Object.keys(data);
  const tbody = document.getElementById('preview-body');
  tbody.innerHTML = '';

  function appendRows(ks) {
    ks.forEach(key => {
      const text = data[key];
      const clip = text.length > 90 ? text.slice(0, 90) + '…' : text;
      const tr   = document.createElement('tr');
      tr.innerHTML = `<td class="mono">${esc(key)}</td><td class="source-text">${esc(clip)}</td>`;
      tbody.appendChild(tr);
    });
  }

  appendRows(keys.slice(0, 10));

  const moreEl    = document.getElementById('preview-more');
  const remaining = keys.length - 10;
  if (remaining > 0) {
    moreEl.innerHTML =
      `<button id="btn-show-all" class="btn btn-ghost">... and ${remaining} more — show all</button>`;
    document.getElementById('btn-show-all').addEventListener('click', () => {
      appendRows(keys.slice(10));
      moreEl.textContent = '';
    });
  } else {
    moreEl.textContent = '';
  }

  document.getElementById('preview-section').classList.remove('hidden');
}

// ── Download ─────────────────────────────────────────────────────────────────
document.getElementById('btn-download').addEventListener('click', () => {
  if (!generatedJSON) return;
  const firstKey = Object.keys(generatedJSON)[0] || '';
  const m = firstKey.match(/^([A-Za-z]+)_(A\d+)_([A-Za-z0-9]+)_/);
  const parts = m
    ? [m[1], m[2], m[3], 'UA', Math.floor(Date.now() / 1000)]
    : ['translation', Math.floor(Date.now() / 1000)];
  const filename = parts.join('_') + '.json';
  const blob = new Blob([JSON.stringify(generatedJSON, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
});

// ── Reset ────────────────────────────────────────────────────────────────────
document.getElementById('btn-reset').addEventListener('click', () => {
  csvHeaders = csvRows = generatedJSON = null;
  mapping = {};
  labelEl.textContent = 'Drop any CSV file or click to choose';
  dropZone.classList.remove('drag-over');
  fileInput.value = '';
  document.getElementById('csv-info').textContent = '';
  document.getElementById('status-filter-value').value = '';
  ['mapping-section', 'result-section', 'preview-section', 'warn-section']
    .forEach(id => document.getElementById(id).classList.add('hidden'));
  hideHint();
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showHint(msg) {
  const el = document.getElementById('form-hint');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideHint() {
  document.getElementById('form-hint').classList.add('hidden');
}
