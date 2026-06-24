// Parse standard CSV text (RFC 4180 — quoted fields, embedded commas/newlines)
function parseCSVText(text) {
  const rows = [];
  let row = [], field = '', inQuote = false, i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && i + 1 < n && text[i + 1] === '"') { field += '"'; i += 2; }
      else if (ch === '"')  { inQuote = false; i++; }
      else if (ch === '\r') { i++; } // strip \r, keep \n (normalize \r\n → \n)
      else                  { field += ch; i++; }
    } else {
      if      (ch === '"')  { inQuote = true; i++; }
      else if (ch === ',')  { row.push(field); field = ''; i++; }
      else if (ch === '\r') {
        if (i + 1 < n && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = ''; i++;
      }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
      else                  { field += ch; i++; }
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    if (row.some(f => f.trim())) rows.push(row);
  }
  return rows;
}

function extractStringNumber(raw) {
  if (!raw) return null;
  const m = raw.trim().match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Extract type from key pattern, e.g.:
//   RoA_A01_M01_VO_S001_001_TME → "VO"
//   RoA_A01_M01_OBJE_001        → "OBJE"
//   RoA_A01_M01_MESS_001        → "MESS"
//   RoA_A01_M01_SCRN_001        → "SCRN"
function typeFromKey(key) {
  const m = key.match(/^[A-Za-z]+_A\d+_M\d+_([A-Z]+)/);
  return m ? m[1] : null;
}

// ─── VO CSV (7 columns) ──────────────────────────────────────────────────────
// STATUS · UNIT · UNIT TRANSLATION · ENGLISH · TRANSLATION · STRING NUMBER · VARIABLE NAME
// Separator rows: STATUS contains "SCENE"
function parseVoCSV(csvText) {
  const allRows = parseCSVText(csvText);
  if (!allRows.length) return { results: [], warnings: [] };

  // Format guard: VO has 7 cols; header col[1] should NOT be "TYPE"
  const headerCol1 = (allRows[0][1] || '').trim().toUpperCase();
  if (headerCol1 === 'TYPE') {
    return { results: [], warnings: ['⚠ Wrong file in VO zone: this looks like a Text CSV (6-col). Swap the drop zones.'] };
  }

  let dataStart = 0;
  if ((allRows[0][0] || '').trim().toUpperCase() === 'STATUS') dataStart = 1;

  const results = [], warnings = [];

  for (let i = dataStart; i < allRows.length; i++) {
    const row    = allRows[i];
    const status = (row[0] || '').trim();
    if (!status) continue;
    if (status.toUpperCase().includes('SCENE')) continue;

    const key    = (row[6] || '').trim();
    const source = (row[3] || '').trim();

    if (!key && !source) continue;
    if (!key)    { warnings.push(`VO row ${i + 1}: missing VARIABLE NAME`); continue; }
    if (!source) { warnings.push(`VO row ${i + 1} (${key}): missing English text`); continue; }

    results.push({
      key,
      type:         typeFromKey(key) || 'VO',
      unit_id:      (row[2] || '').trim() || null,
      unit_name:    (row[1] || '').trim() || null,
      source,
      stringNumber: extractStringNumber(row[5]),
    });
  }

  return { results, warnings };
}

// ─── VO CSV → Translation only (7 columns, IMPLIMENTED rows) ────────────────
function parseVoCSVTranslation(csvText) {
  const allRows = parseCSVText(csvText);
  if (!allRows.length) return { results: [], warnings: [] };

  const headerCol1 = (allRows[0][1] || '').trim().toUpperCase();
  if (headerCol1 === 'TYPE') {
    return { results: [], warnings: ['⚠ Wrong file in VO zone: this looks like a Text CSV (6-col). Swap the drop zones.'] };
  }

  let dataStart = 0;
  if ((allRows[0][0] || '').trim().toUpperCase() === 'STATUS') dataStart = 1;

  const results = [], warnings = [];

  for (let i = dataStart; i < allRows.length; i++) {
    const row    = allRows[i];
    const status = (row[0] || '').trim();
    if (!status) continue;
    if (status.toUpperCase().includes('SCENE')) continue;
    if (!status.toUpperCase().includes('IMPLIMENTED')) continue;

    const key         = (row[6] || '').trim();
    const translation = (row[4] || '').trim();

    if (!key && !translation) continue;
    if (!key)         { warnings.push(`VO row ${i + 1}: missing VARIABLE NAME`); continue; }
    if (!translation) { warnings.push(`VO row ${i + 1} (${key}): missing translation`); continue; }

    results.push({ key, translation });
  }

  return { results, warnings };
}

// ─── Text CSV → Translation only (6 columns, IMPLIMENTED rows) ──────────────
function parseTextCSVTranslation(csvText) {
  const allRows = parseCSVText(csvText);
  if (!allRows.length) return { results: [], warnings: [] };

  const headerCol1 = (allRows[0][1] || '').trim().toUpperCase();
  if (headerCol1 === 'UNIT') {
    return { results: [], warnings: ['⚠ Wrong file in Text zone: this looks like a VO CSV (7-col). Swap the drop zones.'] };
  }

  let dataStart = 0;
  if ((allRows[0][0] || '').trim().toUpperCase() === 'STATUS') dataStart = 1;

  const results = [], warnings = [];

  for (let i = dataStart; i < allRows.length; i++) {
    const row    = allRows[i];
    const status = (row[0] || '').trim();
    if (!status) continue;
    if (status.toUpperCase().includes('TEXT TYPE')) continue;
    if (!status.toUpperCase().includes('IMPLIMENTED')) continue;

    const key         = (row[5] || '').trim();
    const translation = (row[3] || '').trim();

    if (!key && !translation) continue;
    if (!key)         { warnings.push(`Text row ${i + 1}: missing VARIABLE NAME`); continue; }
    if (!translation) { warnings.push(`Text row ${i + 1} (${key}): missing translation`); continue; }

    results.push({ key, translation });
  }

  return { results, warnings };
}

// ─── Text CSV (6 columns) ────────────────────────────────────────────────────
// STATUS · TYPE · ENGLISH · TRANSLATION · STRING NUMBER · VARIABLE NAME
// Separator rows: STATUS contains "TEXT TYPE"
function parseTextCSV(csvText) {
  const allRows = parseCSVText(csvText);
  if (!allRows.length) return { results: [], warnings: [] };

  // Format guard: Text has 6 cols; header col[1] should NOT be "UNIT"
  const headerCol1 = (allRows[0][1] || '').trim().toUpperCase();
  if (headerCol1 === 'UNIT') {
    return { results: [], warnings: ['⚠ Wrong file in Text zone: this looks like a VO CSV (7-col). Swap the drop zones.'] };
  }

  let dataStart = 0;
  if ((allRows[0][0] || '').trim().toUpperCase() === 'STATUS') dataStart = 1;

  const results = [], warnings = [];

  for (let i = dataStart; i < allRows.length; i++) {
    const row    = allRows[i];
    const status = (row[0] || '').trim();
    if (!status) continue;
    if (status.toUpperCase().includes('TEXT TYPE')) continue;

    const key    = (row[5] || '').trim();
    const source = (row[2] || '').trim();

    if (!key && !source) continue;
    if (!key)    { warnings.push(`Text row ${i + 1}: missing VARIABLE NAME`); continue; }
    if (!source) { warnings.push(`Text row ${i + 1} (${key}): missing English text`); continue; }

    results.push({
      key,
      type:         typeFromKey(key) || (row[1] || '').trim() || 'TEXT',
      unit:         null,
      source,
      stringNumber: extractStringNumber(row[4]),
    });
  }

  return { results, warnings };
}
