let csvHeaders = null;
let csvRows    = null;
let mapping    = {};   // colIndex (number) -> 'id' | 'name' | 'en'
let generatedJSON = null;
let previewEN  = {};   // unit_id -> english name, preview-only, not saved

const PREVIEW_ROWS = 4;

// ── Language select ──────────────────────────────────────────────────────────
const langSelect    = document.getElementById('lang-select');
const langCustomGrp = document.getElementById('lang-custom-group');
const langCustom    = document.getElementById('lang-custom');

langSelect.addEventListener('change', () => {
  langCustomGrp.classList.toggle('hidden', langSelect.value !== '__custom__');
});

function currentLangCode() {
  if (langSelect.value === '__custom__') {
    return (langCustom.value.trim().toUpperCase() || 'XX').replace(/[^A-Z0-9-]/g, '');
  }
  return langSelect.value;
}

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
    if (u === 'ID' || u === 'UNIT ID' || u === 'UNIT_ID') {
      mapping[i] = 'id';
    } else if (u.includes('TRANSLAT')) {
      mapping[i] = 'name';
    } else if (u === 'ENGLISH' || u === 'NAME' || u === 'ENGLISH NAME') {
      mapping[i] = 'en';
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
        <option value="id">Unit ID</option>
        <option value="name">Translated Name</option>
        <option value="en">English Name</option>
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
      (role === 'id'   ? ' mapped-id'   :
       role === 'name' ? ' mapped-name' :
       role === 'en'   ? ' mapped-en'   : '');
  });
}

function updateColumnClasses() {
  document.querySelectorAll('#mapping-table tbody tr').forEach(tr => {
    tr.querySelectorAll('td').forEach((td, i) => {
      const role = mapping[i];
      td.className = role === 'id'   ? 'col-id'   :
                     role === 'name' ? 'col-name'  :
                     role === 'en'   ? 'col-en'    : '';
    });
  });
}

function updateState() {
  const hasId   = Object.values(mapping).includes('id');
  const hasName = Object.values(mapping).includes('name');

  document.getElementById('btn-build').disabled = !(hasId && hasName);
}

// ── Build ────────────────────────────────────────────────────────────────────
document.getElementById('btn-build').addEventListener('click', buildUnitsDB);

function buildUnitsDB() {
  const idCol   = colFor('id');
  const nameCol = colFor('name');
  const enCol   = colFor('en');

  generatedJSON = {};
  previewEN     = {};
  let skipped   = 0;
  const warnings = [];

  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i];

    const id   = (row[idCol]   || '').trim();
    const name = (row[nameCol] || '').trim();
    const en   = enCol !== null ? (row[enCol] || '').trim() : '';

    if (!id && !name) continue;
    if (!id)   { warnings.push(`Row ${i + 2}: missing unit ID`); continue; }
    if (!name) { warnings.push(`Row ${i + 2} (${id}): missing translated name`); continue; }
    if (generatedJSON[id] !== undefined) { skipped++; continue; }

    generatedJSON[id] = name;
    if (en) previewEN[id] = en;
  }

  const total = Object.keys(generatedJSON).length;
  document.getElementById('stat-total').textContent   = `${total} characters`;
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
  document.getElementById('download-hint').textContent =
    `Save this file under database/translations/${currentLangCode()}/ — same filename every time, just overwrite the old one.`;
}

function colFor(role) {
  const entry = Object.entries(mapping).find(([, v]) => v === role);
  return entry ? parseInt(entry[0], 10) : null;
}

// ── Preview ──────────────────────────────────────────────────────────────────
function renderPreview(data) {
  const ids   = Object.keys(data);
  const tbody = document.getElementById('preview-body');
  tbody.innerHTML = '';

  function appendRows(ks) {
    ks.forEach(id => {
      const name = data[id];
      const en   = previewEN[id] || '—';
      const tr   = document.createElement('tr');
      tr.innerHTML = `<td class="mono">${esc(id)}</td><td class="dim">${esc(en)}</td><td class="source-text">${esc(name)}</td>`;
      tbody.appendChild(tr);
    });
  }

  appendRows(ids.slice(0, 10));

  const moreEl    = document.getElementById('preview-more');
  const remaining = ids.length - 10;
  if (remaining > 0) {
    moreEl.innerHTML =
      `<button id="btn-show-all" class="btn btn-ghost">... and ${remaining} more — show all</button>`;
    document.getElementById('btn-show-all').addEventListener('click', () => {
      appendRows(ids.slice(10));
      moreEl.textContent = '';
    });
  } else {
    moreEl.textContent = '';
  }

  document.getElementById('preview-section').classList.remove('hidden');
}

// ── Download ─────────────────────────────────────────────────────────────────
// No timestamp in the filename on purpose: this is a single campaign-wide
// glossary, not a versioned snapshot. Re-downloading always produces the same
// name, so dropping the new file into database/translations/<lang>/ overwrites
// the old one and build.html picks it up automatically — no manifest to edit.
document.getElementById('btn-download').addEventListener('click', () => {
  if (!generatedJSON) return;
  const prefix = (document.getElementById('campaign-prefix').value.trim() || 'CAMPAIGN').replace(/[^A-Za-z0-9]/g, '');
  const lang   = currentLangCode();
  const filename = `${prefix}_UNITS_${lang}.json`;
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
  previewEN = {};
  labelEl.textContent = 'Drop the characters CSV or click to choose';
  dropZone.classList.remove('drag-over');
  fileInput.value = '';
  document.getElementById('csv-info').textContent = '';
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
