let generatedJSON = null;

const campaignSelect = document.getElementById('campaign-name');
const mapSelect      = document.getElementById('map-name');
const mapDate        = document.getElementById('map-version');
const langInput      = document.getElementById('lang-code');
const textarea       = document.getElementById('lines-input');
const formHint       = document.getElementById('form-hint');
const dateDisplay    = document.getElementById('date-display');

// --- Helpers ---
function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  return `${d} ${months[m - 1]} ${y}`;
}

function isoToday() {
  return new Date().toISOString().split('T')[0];
}

function toJSON(data) {
  return JSON.stringify(data, null, 2);
}

// --- Form ---
function formReady() {
  return mapSelect.value && mapDate.value && langInput.value.trim();
}

function updateTextarea() {
  const ready = formReady();
  textarea.disabled = !ready;
  textarea.placeholder = ready
    ? 'Вставь строки с переводом...'
    : 'Сначала выбери карту, дату и язык...';
  formHint.classList.add('hidden');
}

function showFormHint(msg) {
  formHint.textContent = msg;
  formHint.classList.remove('hidden');
}

function updateDateDisplay() {
  if (mapDate.value) {
    dateDisplay.textContent = formatDate(mapDate.value);
    dateDisplay.classList.add('has-value');
  } else {
    dateDisplay.textContent = 'Select date...';
    dateDisplay.classList.remove('has-value');
  }
}

mapSelect.addEventListener('change', updateTextarea);
langInput.addEventListener('input', updateTextarea);
mapDate.addEventListener('change', () => { updateDateDisplay(); updateTextarea(); });

document.getElementById('btn-today').addEventListener('click', () => {
  mapDate.value = isoToday();
  updateDateDisplay();
  updateTextarea();
});

document.getElementById('date-wrap').addEventListener('click', () => {
  try { mapDate.showPicker(); } catch(e) { mapDate.click(); }
});

textarea.addEventListener('focus', () => {
  if (!mapSelect.value)        { textarea.blur(); showFormHint('Сначала выбери карту'); return; }
  if (!mapDate.value)          { textarea.blur(); showFormHint('Сначала укажи дату версии'); return; }
  if (!langInput.value.trim()) { textarea.blur(); showFormHint('Укажи код языка'); }
});

// --- Translation parser ---
// Supports:
//   Marker format:  KEY [tab] ;" [tab] Translation text [tab] ;"
//   Simple format:  KEY [tab] Translation text
//   CSV:            KEY, "Translation text"
function parseTranslationRecord(record) {
  if (!record.includes('\t')) {
    const fields = parseCSVFields(record);
    return { key: fields[0]?.trim() || '', translation: fields[1]?.trim() || '' };
  }

  const fields = record.split('\t').map(f => f.trim());

  let openIdx = -1, closeIdx = -1;
  for (let i = 0; i < fields.length; i++) {
    if (fields[i] === ';"') {
      if (openIdx === -1) openIdx = i;
      else { closeIdx = i; break; }
    } else if (fields[i] === '";' && openIdx !== -1) {
      closeIdx = i; break;
    }
  }

  if (openIdx !== -1 && closeIdx !== -1) {
    const translation = fields.slice(openIdx + 1, closeIdx).join('\n').trim();
    const rest = [
      ...fields.slice(0, openIdx),
      ...fields.slice(closeIdx + 1),
    ].filter(f => f !== '' && f !== ',' && f !== ';');
    const key = rest.find(f => KEY_RE.test(f)) || rest[0] || '';
    return { key, translation };
  }

  // Simple: KEY [tab] translation (any remaining tabs = part of text)
  const meaningful = fields.filter(f => f !== '' && f !== ',' && f !== ';' && f !== ';"' && f !== '";');
  const key = meaningful.find(f => KEY_RE.test(f)) || meaningful[0] || '';
  const translation = meaningful.filter(f => f !== key).join(' ').trim();
  return { key, translation };
}

function parseTranslationLines(text) {
  const rawLines = text.split('\n');
  const records  = [];
  let buf = '';

  for (const line of rawLines) {
    const l = line.trimEnd();
    if (!l.trim() || l.trim().startsWith('//')) continue;

    buf = buf ? buf + '\n' + l : l;

    const markerCount = (buf.match(/;"/g) || []).length;
    const hasAltClose = buf.includes('";');

    if (markerCount === 0 || markerCount >= 2 || (markerCount === 1 && hasAltClose)) {
      records.push(buf.trim().replace(/;$/, '').trim());
      buf = '';
    }
  }
  if (buf.trim()) records.push(buf.trim().replace(/;$/, '').trim());

  const results = [], errors = [];

  records.forEach((record, idx) => {
    if (!record) return;
    try {
      const parsed = parseTranslationRecord(record);
      if (!parsed.key)         throw new Error('пустой ключ');
      if (!parsed.translation) throw new Error('пустой перевод');
      results.push(parsed);
    } catch(e) {
      errors.push({ line: idx + 1, text: record.slice(0, 60), reason: e.message });
    }
  });

  return { results, errors };
}

// --- Parse button ---
document.getElementById('btn-parse').addEventListener('click', () => {
  if (!mapSelect.value)        return showFormHint('Сначала выбери карту');
  if (!mapDate.value)          return showFormHint('Сначала укажи дату версии');
  if (!langInput.value.trim()) return showFormHint('Укажи код языка');

  const text = textarea.value.trim();
  if (!text) return;

  document.getElementById('error-section').classList.add('hidden');
  document.getElementById('result-section').classList.add('hidden');
  document.getElementById('preview-section').classList.add('hidden');

  const { results, errors } = parseTranslationLines(text);

  if (results.length === 0 && errors.length > 0) { showErrors(errors); return; }

  buildJSON(results);
  if (errors.length > 0) showErrors(errors);
});

function buildJSON(rows) {
  const strings = {};
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    strings[row.key] = row.translation;
  }

  generatedJSON = {
    meta: {
      campaign:    campaignSelect.value,
      map:         mapSelect.value,
      map_version: formatDate(mapDate.value),
      lang:        langInput.value.trim(),
      generated:   isoToday(),
    },
    strings,
  };

  showStats(Object.keys(strings).length);
  renderPreview(strings);
}

// --- UI ---
function showStats(total) {
  document.getElementById('stat-total').textContent = `✓ ${total} строк`;
  document.getElementById('result-section').classList.remove('hidden');
}

function showErrors(errors) {
  document.getElementById('error-list').innerHTML = errors.map(e =>
    `<li>Строка ${e.line}: <span class="mono">${e.text}</span> — ${e.reason}</li>`
  ).join('');
  document.getElementById('error-section').classList.remove('hidden');
}

function renderPreview(strings) {
  const allKeys = Object.keys(strings);
  const tbody   = document.getElementById('preview-body');
  tbody.innerHTML = '';

  function appendRows(keys) {
    keys.forEach(key => {
      const tr = document.createElement('tr');
      const t  = strings[key];
      tr.innerHTML = `
        <td class="mono">${key}</td>
        <td class="source-text">${t.slice(0, 100)}${t.length > 100 ? '…' : ''}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  appendRows(allKeys.slice(0, 5));

  const moreEl    = document.getElementById('preview-more');
  const remaining = allKeys.length - 5;
  if (remaining > 0) {
    moreEl.innerHTML = `<button id="btn-show-all" class="btn btn-ghost">... и ещё ${remaining} строк — показать все</button>`;
    document.getElementById('btn-show-all').addEventListener('click', () => {
      appendRows(allKeys.slice(5));
      moreEl.textContent = '';
    });
  } else {
    moreEl.textContent = '';
  }

  document.getElementById('preview-section').classList.remove('hidden');
}

// --- Download ---
document.getElementById('download-translation').addEventListener('click', () => {
  if (!generatedJSON) return;
  const { campaign, map, map_version, lang } = generatedJSON.meta;
  const ver      = map_version.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `translation_${campaign}_${map}_${ver}_${lang}.json`;
  const blob     = new Blob([toJSON(generatedJSON)], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
});

// --- Reset ---
document.getElementById('btn-reset').addEventListener('click', () => {
  generatedJSON        = null;
  textarea.value       = '';
  document.getElementById('result-section').classList.add('hidden');
  document.getElementById('preview-section').classList.add('hidden');
  document.getElementById('error-section').classList.add('hidden');
});
