const LANG_STORAGE_KEY = 'wts-build-lang';

let manifestList    = [];
let selectedEntry    = null;
let sourceJSON       = null;
let translationJSON  = null;
let unitsJSON        = null;   // null = not attempted / not available for this language
let wtsText          = null;
let wtsFilename      = '';
let builtWTS         = null;
let checkPassed      = false;

const langSelect    = document.getElementById('lang-select');
const dbSelect      = document.getElementById('db-select');
const checkReport   = document.getElementById('check-report');
const formHint      = document.getElementById('form-hint');
const btnCheck      = document.getElementById('btn-check');
const btnBuild      = document.getElementById('btn-build');

// --- Language select: remember last choice ---
const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
if (savedLang) langSelect.value = savedLang;

langSelect.addEventListener('change', () => {
  localStorage.setItem(LANG_STORAGE_KEY, langSelect.value);
  invalidateCheck();
});

// --- Load manifest ---
fetch('database/manifest.json').then(r => r.ok ? r.json() : []).catch(() => []).then(manifest => {
  manifestList = manifest;
  dbSelect.innerHTML = '<option value="" disabled selected>— выбери базу —</option>' +
    manifest.map(e => `<option value="${e.file}">${e.label}</option>`).join('');
});

// Campaign prefix ("RoA" из "RoA_A01_M02_EN_...") — используется, чтобы найти
// campaign-wide базу имён персонажей по предсказуемому имени файла, без
// какого-либо отдельного манифеста.
function campaignPrefix(entry) {
  return entry.file.split('_')[0];
}

dbSelect.addEventListener('change', () => {
  selectedEntry = manifestList.find(e => e.file === dbSelect.value) || null;
  invalidateCheck();
});

// --- .wts file picker ---
const wtsInput      = document.getElementById('wts-input');
const wtsDrop       = document.getElementById('wts-drop');
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
    invalidateCheck();
  };
  reader.readAsText(file, 'utf-8');
}

function invalidateCheck() {
  checkPassed = false;
  builtWTS = null;
  btnBuild.disabled = true;
  checkReport.classList.add('hidden');
  document.getElementById('result-section').classList.add('hidden');
  btnCheck.disabled = !(selectedEntry && langSelect.value && wtsText);
}

invalidateCheck();

// --- Проверить (integrity check) ---
btnCheck.addEventListener('click', async () => {
  formHint.classList.add('hidden');
  btnCheck.disabled = true;
  btnCheck.textContent = 'Проверяю...';

  const lang = langSelect.value;
  const rows = [];
  let hardFail = false;

  sourceJSON = null;
  translationJSON = null;
  unitsJSON = null;

  // 1. Source EN database
  try {
    const res = await fetch(`./database/${selectedEntry.file}.json`);
    if (!res.ok) throw new Error(String(res.status));
    sourceJSON = await res.json();
    const total = Object.keys(sourceJSON.strings).length;
    rows.push(row('ok', 'Исходная база (EN)', `${total} строк`));
  } catch (e) {
    rows.push(row('err', 'Исходная база (EN)', `не найдена (${e.message})`));
    hardFail = true;
  }

  // 2. Translation for selected map + language
  const transName = selectedEntry.translations && selectedEntry.translations[lang];
  if (!transName) {
    rows.push(row('err', `Перевод карты (${lang})`, 'нет записи в manifest.json'));
    hardFail = true;
  } else {
    try {
      const res = await fetch(`./database/translations/${lang}/${transName}.json`);
      if (!res.ok) throw new Error(String(res.status));
      translationJSON = await res.json();
      const total      = sourceJSON ? Object.keys(sourceJSON.strings).length : 0;
      const translated = Object.keys(translationJSON).length;
      const pct = total ? Math.round((translated / total) * 100) : 0;
      rows.push(row('ok', `Перевод карты (${lang})`, `${translated} / ${total} строк (${pct}%)`));
    } catch (e) {
      rows.push(row('err', `Перевод карты (${lang})`, `не загрузился (${e.message})`));
      hardFail = true;
    }
  }

  // 3. Campaign-wide character names DB — fixed filename, no manifest needed
  // (soft check: missing file does not block the build).
  const unitsPath = `./database/translations/${lang}/${campaignPrefix(selectedEntry)}_UNITS_${lang}.json`;
  try {
    const res = await fetch(unitsPath);
    if (!res.ok) throw new Error(String(res.status));
    unitsJSON = await res.json();

    const speakers = new Set();
    if (sourceJSON) {
      for (const entry of Object.values(sourceJSON.strings)) {
        if (entry.type === 'VO' && entry.unit_id) speakers.add(entry.unit_id);
      }
    }
    const missing = [...speakers].filter(id => unitsJSON[id] === undefined);
    if (missing.length) {
      rows.push(row('warn', `База имён персонажей (${lang})`,
        `${speakers.size - missing.length} / ${speakers.size} персонажей этой карты переведено — нет перевода: ${missing.join(', ')}`));
    } else {
      rows.push(row('ok', `База имён персонажей (${lang})`, `${speakers.size} / ${speakers.size} персонажей этой карты переведено`));
    }
  } catch (e) {
    rows.push(row('warn', `База имён персонажей (${lang})`, `нет файла ${unitsPath.replace('./', '')} — сборка не заблокирована`));
  }

  // 4. .wts file
  if (wtsText) {
    const total = parseWTS(wtsText).filter(s => s.type === 'string').length;
    rows.push(row('ok', 'Файл .wts от разраба', `${total} STRING-блоков`));
  } else {
    rows.push(row('err', 'Файл .wts от разраба', 'не загружен'));
    hardFail = true;
  }

  checkReport.innerHTML = rows.join('');
  checkReport.classList.remove('hidden');

  checkPassed = !hardFail;
  btnBuild.disabled = !checkPassed;
  btnCheck.disabled = false;
  btnCheck.textContent = 'Проверить';
});

function row(status, label, detail) {
  const icon = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✗';
  return `<div class="check-row"><span>${label}</span><span class="check-${status}">${icon} ${detail}</span></div>`;
}

// --- Собрать .wts ---
btnBuild.addEventListener('click', () => {
  formHint.classList.add('hidden');

  if (!checkPassed || !sourceJSON || !translationJSON || !wtsText) {
    formHint.textContent = 'Сначала нажми «Проверить» — не все данные загружены.';
    formHint.classList.remove('hidden');
    return;
  }

  try {
    const result = buildLocalized(sourceJSON, translationJSON, wtsText, unitsJSON);
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
// src     = EN reference database ({ meta, strings: { key: { string_number, source, unit_id, unit_name, type, ... } } })
// trn     = translation file (flat { key: "translated text" })
// wtsRaw  = developer's current .wts (source-language text, authoritative string numbers)
// unitsDB = campaign-wide character names translation (flat { unit_id: "translated name" }), or null
function buildLocalized(src, trn, wtsRaw, unitsDB) {
  // Build string_number → key lookup
  const numToKey = new Map();
  for (const [key, entry] of Object.entries(src.strings)) {
    if (entry.string_number != null) numToKey.set(entry.string_number, key);
  }

  // Build string_number → translated text lookup
  const numToTranslation = new Map();
  for (const [num, key] of numToKey) {
    if (trn[key] !== undefined) numToTranslation.set(num, trn[key]);
  }

  // Reverse lookup: exact English display name → unit_id (for standalone name
  // strings — units/items sitting in the .wts completely separate from dialogue,
  // with no reliable comment tag to identify them by). Also collect the set of
  // speakers used in this map, so we can report characters whose name never
  // turned up as a standalone string (renamed/removed on the dev's side).
  const nameToUnitId = new Map();
  const speakerIds   = new Set();
  for (const entry of Object.values(src.strings)) {
    if (entry.type !== 'VO' || !entry.unit_id) continue;
    speakerIds.add(entry.unit_id);
    if (entry.unit_name) nameToUnitId.set(entry.unit_name.trim(), entry.unit_id);
  }

  const segments  = parseWTS(wtsRaw);
  const totalStrings = segments.filter(s => s.type === 'string').length;
  let translated    = 0;
  let namesReplaced  = 0;
  const matchedSpeakers          = new Set();
  const namesMissingTranslation  = new Set(); // found in .wts, but no entry in unitsDB

  const output = segments.map(seg => {
    if (seg.type === 'raw') return seg.text;

    const text = numToTranslation.get(seg.num);
    if (text !== undefined) {
      translated++;
      return [...seg.before, text, seg.closing].join('\n');
    }

    // Not a tracked dialogue/text string — check if it's a standalone
    // character name (exact match only, never a partial/contains match).
    const contentTrimmed = seg.content.join('\n').trim();
    const unitId = nameToUnitId.get(contentTrimmed);
    if (unitId) {
      matchedSpeakers.add(unitId);
      const translatedName = unitsDB && unitsDB[unitId];
      if (translatedName !== undefined) {
        namesReplaced++;
        return [...seg.before, translatedName, seg.closing].join('\n');
      }
      namesMissingTranslation.add(unitId);
    }

    return [...seg.before, ...seg.content, seg.closing].join('\n');
  }).join('\n');

  const namesNotFoundInWts = [...speakerIds].filter(id => !matchedSpeakers.has(id));

  return {
    wts: output,
    translated,
    untranslated: totalStrings - translated,
    total: totalStrings,
    namesReplaced,
    namesMissingTranslation: [...namesMissingTranslation],
    namesNotFoundInWts,
  };
}

// --- Result UI ---
function showResult({ translated, untranslated, total, namesReplaced, namesMissingTranslation, namesNotFoundInWts }) {
  document.getElementById('stat-translated').textContent  = `✓ ${translated} переведено`;
  document.getElementById('stat-untranslated').textContent = `${untranslated} без перевода`;
  document.getElementById('stat-total').textContent        = `${total} всего в .wts`;
  document.getElementById('stat-names').textContent        = `✓ ${namesReplaced} имён персонажей заменено`;

  const notes = [];
  if (namesMissingTranslation.length) {
    notes.push(`Имя найдено в .wts, но нет перевода в базе персонажей: ${namesMissingTranslation.join(', ')}`);
  }
  if (namesNotFoundInWts.length) {
    notes.push(`Персонаж говорит в этой карте, но его имя нигде не найдено как отдельная строка (возможно, изменилось у разраба): ${namesNotFoundInWts.join(', ')}`);
  }

  const namesNoteEl = document.getElementById('names-note');
  if (notes.length) {
    namesNoteEl.innerHTML = notes.map(n => `<li>${n}</li>`).join('');
    namesNoteEl.closest('.error-section').classList.remove('hidden');
  } else {
    namesNoteEl.closest('.error-section').classList.add('hidden');
  }

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
