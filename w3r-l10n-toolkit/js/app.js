let rawVO   = null;
let rawText = null;
let generatedJSON = null;

const formHint = document.getElementById('form-hint');

// --- Drop zones ---
setupDrop('drop-vo',   'file-vo',   'label-vo',   (content) => { rawVO   = content; });
setupDrop('drop-text', 'file-text', 'label-text',  (content) => { rawText = content; });

function setupDrop(zoneId, inputId, labelId, onLoad) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) readFile(file, labelId, onLoad);
  });
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

// --- Parse ---
document.getElementById('btn-parse').addEventListener('click', () => {
  hideHint();
  if (!rawVO && !rawText) return showHint('Upload at least one CSV file');
  processCSVs();
});

async function processCSVs() {
  ['result-section', 'preview-section', 'warn-section'].forEach(id =>
    document.getElementById(id).classList.add('hidden'));

  const voRes   = rawVO   ? parseVoCSV(rawVO)     : { results: [], warnings: [] };
  const textRes = rawText ? parseTextCSV(rawText)  : { results: [], warnings: [] };

  const allResults  = [...voRes.results,   ...textRes.results];
  const allWarnings = [...voRes.warnings,  ...textRes.warnings];

  if (allResults.length === 0) {
    showHint('No rows found. Check CSV format — requires ENGLISH and VARIABLE NAME columns.');
    return;
  }

  await buildDatabase(allResults, voRes.results.length, textRes.results.length);
  if (allWarnings.length) showWarnings(allWarnings);
}

// --- Build JSON ---
async function buildDatabase(rows, voCount, textCount) {
  const strings = {};

  for (const row of rows) {
    if (strings[row.key]) continue;

    const hash  = await computeHash(row.source);
    const entry = { hash };

    if (row.stringNumber !== null) entry.string_number = row.stringNumber;
    if (row.type)                  entry.type           = row.type;
    if (row.unit)                  entry.unit           = row.unit;

    entry.source = row.source;
    strings[row.key] = entry;
  }

  // Meta: derive campaign/act/map from first key (type excluded — file is mixed)
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

// --- UI ---
function showStats(voCount, textCount, total) {
  document.getElementById('stat-vo').textContent    = `${voCount} VO`;
  document.getElementById('stat-text').textContent  = `${textCount} Text`;
  document.getElementById('stat-total').textContent = `${total} total`;
  document.getElementById('result-section').classList.remove('hidden');
}

function showWarnings(warnings) {
  document.getElementById('warn-list').innerHTML =
    warnings.map(w => `<li>${w}</li>`).join('');
  document.getElementById('warn-section').classList.remove('hidden');
}

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
  } else {
    moreEl.textContent = '';
  }

  document.getElementById('preview-section').classList.remove('hidden');
}

// --- Download ---
document.getElementById('btn-download').addEventListener('click', () => {
  if (!generatedJSON) return;
  const { campaign, act, map } = generatedJSON.meta;
  const filename = `${campaign}_${act}_${map}_EN.json`;
  const blob = new Blob([JSON.stringify(generatedJSON, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
});

// --- Reset ---
document.getElementById('btn-reset').addEventListener('click', () => {
  rawVO = rawText = generatedJSON = null;
  document.getElementById('label-vo').textContent   = 'Drop CSV or click';
  document.getElementById('label-text').textContent = 'Drop CSV or click';
  document.getElementById('file-vo').value   = '';
  document.getElementById('file-text').value = '';
  ['result-section', 'preview-section', 'warn-section'].forEach(id =>
    document.getElementById(id).classList.add('hidden'));
  hideHint();
});

// --- Helpers ---
function showHint(msg) { formHint.textContent = msg; formHint.classList.remove('hidden'); }
function hideHint()    { formHint.classList.add('hidden'); }
