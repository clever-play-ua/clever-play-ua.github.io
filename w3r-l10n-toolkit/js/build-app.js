// Known databases and their available languages
const DATABASES = {
  'RoA_A01_CNMC1': ['ukUA'],
};

let sourceJSON      = null;
let translationJSON = null;
let wtsText         = null;
let wtsFilename     = '';
let builtWTS        = null;

const dbSelect      = document.getElementById('db-select');
const langSelect    = document.getElementById('lang-select');
const fetchStatus   = document.getElementById('fetch-status');
const formHint      = document.getElementById('form-hint');
const btnBuild      = document.getElementById('btn-build');

// --- Database / language selection ---
dbSelect.addEventListener('change', () => {
  const db = dbSelect.value;
  const langs = DATABASES[db] || [];

  langSelect.innerHTML = langs.map(l => `<option value="${l}">${l}</option>`).join('');
  langSelect.disabled = langs.length === 0;

  sourceJSON = null;
  translationJSON = null;
  updateBuildButton();

  if (langs.length === 1) {
    langSelect.value = langs[0];
    fetchJSONs(db, langs[0]);
  }
});

langSelect.addEventListener('change', () => {
  fetchJSONs(dbSelect.value, langSelect.value);
});

async function fetchJSONs(db, lang) {
  sourceJSON = null;
  translationJSON = null;
  updateBuildButton();

  showFetchStatus('Загружаю базу...', false);

  try {
    const [srcRes, trnRes] = await Promise.all([
      fetch(`./database/${db}_EN.json`),
      fetch(`./database/${db}_${lang}.json`),
    ]);

    if (!srcRes.ok)  throw new Error(`${db}_EN.json — ${srcRes.status}`);
    if (!trnRes.ok)  throw new Error(`${db}_${lang}.json — ${trnRes.status}`);

    sourceJSON      = await srcRes.json();
    translationJSON = await trnRes.json();

    const total = Object.keys(sourceJSON.strings).length;
    const translated = Object.keys(translationJSON.strings).length;
    showFetchStatus(`✓ База загружена — ${translated} / ${total} строк переведено`, false);
  } catch(e) {
    showFetchStatus(`Ошибка загрузки: ${e.message}`, true);
  }

  updateBuildButton();
}

function showFetchStatus(msg, isError) {
  fetchStatus.textContent = msg;
  fetchStatus.style.color = isError ? 'var(--warn)' : 'var(--success)';
  fetchStatus.classList.remove('hidden');
}

// --- .wts file picker ---
const wtsInput    = document.getElementById('wts-input');
const wtsDrop     = document.getElementById('wts-drop');
const wtsFilenameEl = document.getElementById('wts-filename');

wtsInput.addEventListener('change', () => {
  if (wtsInput.files[0]) loadWTS(wtsInput.files[0]);
});

wtsDrop.addEventListener('dragover', e => { e.preventDefault(); wtsDrop.classList.add('drag-over'); });
wtsDrop.addEventListener('dragleave', () => wtsDrop.classList.remove('drag-over'));
wtsDrop.addEventListener('drop', e => {
  e.preventDefault();
  wtsDrop.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadWTS(file);
});

function loadWTS(file) {
  wtsFilename = file.name;
  wtsFilenameEl.textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    wtsText = e.target.result;
    updateBuildButton();
  };
  reader.readAsText(file, 'utf-8');
}

function updateBuildButton() {
  btnBuild.disabled = !(sourceJSON && translationJSON && wtsText);
}

// --- Build ---
document.getElementById('btn-build').addEventListener('click', () => {
  formHint.classList.add('hidden');

  try {
    const result = buildLocalized(sourceJSON, translationJSON, wtsText);
    builtWTS = result.wts;
    showResult(result);
  } catch(e) {
    formHint.textContent = 'Ошибка: ' + e.message;
    formHint.classList.remove('hidden');
  }
});

// --- WTS parser ---
function parseWTS(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const segments = [];
  let i = 0;
  let raw = [];

  while (i < lines.length) {
    const m = lines[i].match(/^STRING\s+(\d+)\s*$/);

    if (!m) { raw.push(lines[i]); i++; continue; }

    if (raw.length) { segments.push({ type: 'raw', text: raw.join('\n') }); raw = []; }

    const num = parseInt(m[1]);
    const before = [lines[i]];
    i++;

    // Comments between STRING and {
    while (i < lines.length && lines[i].trim() !== '{') {
      before.push(lines[i]);
      i++;
    }

    if (i >= lines.length) { raw.push(...before); continue; }

    before.push(lines[i]); // {
    i++;

    const content = [];
    while (i < lines.length && lines[i].trim() !== '}') {
      content.push(lines[i]);
      i++;
    }

    const closing = i < lines.length ? lines[i] : '}';
    i++;

    segments.push({ type: 'string', num, before, content, closing });
  }

  if (raw.length) segments.push({ type: 'raw', text: raw.join('\n') });
  return segments;
}

// --- Core build logic ---
function buildLocalized(src, trn, wtsRaw) {
  // Build num → key lookup
  const numToKey = new Map();
  for (const [key, entry] of Object.entries(src.strings)) {
    for (const num of entry.string_numbers) {
      numToKey.set(num, key);
    }
  }

  // Build num → translation lookup
  const numToTranslation = new Map();
  for (const [num, key] of numToKey) {
    if (trn.strings[key] !== undefined) {
      numToTranslation.set(num, trn.strings[key]);
    }
  }

  const segments  = parseWTS(wtsRaw);
  const totalStrings = segments.filter(s => s.type === 'string').length;
  let translated  = 0;

  const output = segments.map(seg => {
    if (seg.type === 'raw') return seg.text;

    const text = numToTranslation.get(seg.num);
    if (text !== undefined) {
      translated++;
      return [...seg.before, text, seg.closing].join('\n');
    }
    return [...seg.before, ...seg.content, seg.closing].join('\n');
  }).join('\n');

  return {
    wts: output,
    translated,
    untranslated: totalStrings - translated,
    total: totalStrings,
  };
}

// --- Result UI ---
function showResult({ translated, untranslated, total }) {
  document.getElementById('stat-translated').textContent  = `✓ ${translated} переведено`;
  document.getElementById('stat-untranslated').textContent = `${untranslated} без перевода`;
  document.getElementById('stat-total').textContent        = `${total} всего в .wts`;
  document.getElementById('result-section').classList.remove('hidden');
}

// --- Download ---
document.getElementById('btn-download').addEventListener('click', () => {
  if (!builtWTS) return;
  const lang     = langSelect.value;
  const outName  = wtsFilename.replace(/\.wts$/i, `_${lang}.wts`);
  const blob     = new Blob([builtWTS], { type: 'text/plain;charset=utf-8' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href = url; a.download = outName; a.click();
  URL.revokeObjectURL(url);
});
