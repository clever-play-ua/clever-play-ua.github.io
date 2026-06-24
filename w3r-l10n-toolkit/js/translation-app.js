let rawVO   = null;
let rawText = null;
let generatedJSON = null;

const formHint = document.getElementById('form-hint');

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

document.getElementById('btn-parse').addEventListener('click', () => {
  hideHint();
  if (!rawVO && !rawText) return showHint('Upload at least one CSV file');
  processCSVs();
});

function processCSVs() {
  ['result-section', 'preview-section', 'warn-section'].forEach(id =>
    document.getElementById(id).classList.add('hidden'));

  const voRes   = rawVO   ? parseVoCSVTranslation(rawVO)    : { results: [], warnings: [] };
  const textRes = rawText ? parseTextCSVTranslation(rawText) : { results: [], warnings: [] };

  const allResults  = [...voRes.results,  ...textRes.results];
  const allWarnings = [...voRes.warnings, ...textRes.warnings];

  if (allResults.length === 0) {
    showHint('No IMPLIMENTED rows with translations found.');
    return;
  }

  buildTranslation(allResults, voRes.results.length, textRes.results.length);
  if (allWarnings.length) showWarnings(allWarnings);
}

function buildTranslation(rows, voCount, textCount) {
  generatedJSON = {};
  for (const row of rows) {
    if (generatedJSON[row.key]) continue;
    generatedJSON[row.key] = row.translation;
  }

  showStats(voCount, textCount, Object.keys(generatedJSON).length);
  renderPreview(generatedJSON);
}

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

function renderPreview(data) {
  const keys  = Object.keys(data);
  const tbody = document.getElementById('preview-body');
  tbody.innerHTML = '';

  function appendRows(ks) {
    ks.forEach(key => {
      const text = data[key];
      const preview = text.length > 70 ? text.slice(0, 70) + '…' : text;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono">${key}</td>
        <td class="source-text">${preview}</td>
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

document.getElementById('btn-download').addEventListener('click', () => {
  if (!generatedJSON) return;
  const firstKey = Object.keys(generatedJSON)[0] || '';
  const m = firstKey.match(/^([A-Za-z]+)_(A\d+)_([A-Za-z0-9]+)_/);
  const campaign = m ? m[1] : 'UNKNOWN';
  const act      = m ? m[2] : '?';
  const map      = m ? m[3] : '?';
  const ts = Math.floor(Date.now() / 1000);
  const filename = `${campaign}_${act}_${map}_UA_${ts}.json`;
  const blob = new Blob([JSON.stringify(generatedJSON, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
});

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

function showHint(msg) { formHint.textContent = msg; formHint.classList.remove('hidden'); }
function hideHint()    { formHint.classList.add('hidden'); }
