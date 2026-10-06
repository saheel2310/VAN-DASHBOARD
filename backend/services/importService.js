const XLSX = require('xlsx');
const { pool, withTransaction } = require('../db/pool');
const { MONTHS, MONTH_COLUMNS, excelColumnName } = require('../config/vanColumns');

// ── Header normalisation ────────────────────────────────────────────────────

const norm = s => String(s ?? '').trim().toLowerCase().replace(/[\s_\-]+/g, ' ');

// normalised header -> party_year_data master column
const COL_ALIASES = {
  'party code':                  'party_code',
  'partycode':                   'party_code',
  'party name':                  'party_name',
  'partyname':                   'party_name',
  'sales representative name':   'sales_representative_name',
  'sales representative':        'sales_representative_name',
  'sales rep name':              'sales_representative_name',
  'group head':                  'group_head',
  'regional head':               'regional_head',
  'nos':                         'nos',
  'category frequency purchase': 'category_frequency_purchase',
  'van nos':                     'van_nos',
  'pay terms':                   'pay_terms',
  'payment terms':               'pay_terms',
  'months van used (0 4)':       'months_van_used',
  'months van used':             'months_van_used',
  'van status':                  'van_status',
  'conversion wave':             'conversion_wave',
  'van no':                      'van_no',
  'upi':                         'upi',
};

const REQUIRED = {
  party_code:                  'PARTY CODE',
  party_name:                  'PARTY NAME',
  sales_representative_name:   'Sales Representative Name',
  group_head:                  'Group Head',
  regional_head:               'Regional Head',
  category_frequency_purchase: 'category_frequency_purchase',
  pay_terms:                   'pay terms',
};

// Master columns, in insert order. Only those present in the uploaded file are written.
const MASTER_COLUMNS = [
  ['party_name', 'text'], ['sales_representative_name', 'text'], ['group_head', 'text'],
  ['regional_head', 'text'], ['nos', 'numeric'], ['category_frequency_purchase', 'text'],
  ['pay_terms', 'text'], ['van_nos', 'text'], ['months_van_used', 'text'], ['van_status', 'text'],
  ['conversion_wave', 'text'], ['van_no', 'text'], ['upi', 'text'],
];

// "VAN_Usage_AUG_26", "van usage aug 26", "VAN_Usage_August_2026", "VAN Usage Aug"
const VAN_COL_RE = /^van ?usage ?([a-z]+) ?(\d{2}|\d{4})?$/;

class ValidationError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

function monthFromToken(token) {
  if (token.length < 3) return null;
  return MONTHS.find(m => m.toLowerCase().startsWith(token)) || null;
}

// Finds the master columns and, for the selected year, one VAN usage column per month present in the file.
// A column with the year's suffix (e.g. _26) wins over one without a year; other years' columns are ignored.
function classifyHeaders(headers, year) {
  const columns = {};
  const vanMatches = [];   // { header, month, yy }
  for (const h of headers) {
    if (h === undefined || h === null || String(h).trim() === '') continue;
    const n = norm(h);
    const m = VAN_COL_RE.exec(n);
    if (m && monthFromToken(m[1])) {
      vanMatches.push({ header: String(h).trim(), month: monthFromToken(m[1]), yy: m[2] ? m[2].slice(-2) : null });
    } else if (COL_ALIASES[n]) {
      columns[COL_ALIASES[n]] ??= h;
    }
  }

  const yy = String(year).slice(-2);
  const vanByMonth = {};
  const ambiguous = [];
  for (const month of MONTHS) {
    const exact = vanMatches.filter(v => v.month === month && v.yy === yy);
    const noYear = vanMatches.filter(v => v.month === month && v.yy === null);
    const pick = exact.length ? exact : noYear;
    if (pick.length > 1) ambiguous.push(`${month}: ${pick.map(v => v.header).join(' / ')}`);
    else if (pick.length === 1) vanByMonth[month] = pick[0].header;
  }
  const otherYears = vanMatches.filter(v => v.yy && v.yy !== yy).map(v => v.header);
  return { columns, vanByMonth, ambiguous, otherYears, vanMatches };
}

const asText = v => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

function parseAndValidate(fileBuffer, year) {
  let wb;
  try { wb = XLSX.read(fileBuffer, { type: 'buffer' }); }
  catch (e) { throw new ValidationError(`Cannot read Excel file: ${e.message}`); }

  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new ValidationError('The Excel file has no sheets.');
  const headerRow = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })[0] || [];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', blankrows: false });
  if (!raw.length) throw new ValidationError('The Excel file has no data rows.');

  const { columns, vanByMonth, ambiguous, otherYears, vanMatches } = classifyHeaders(headerRow, year);

  const missing = Object.keys(REQUIRED).filter(c => !columns[c]).map(c => REQUIRED[c]);
  if (missing.length) throw new ValidationError(`Missing required columns: ${missing.join(', ')}`);

  if (ambiguous.length) {
    throw new ValidationError(`More than one VAN usage column for the same month — ${ambiguous.join('; ')}.`);
  }
  const months = MONTHS.filter(m => vanByMonth[m]);
  if (!months.length) {
    const found = vanMatches.map(v => v.header).join(', ') || 'none';
    throw new ValidationError(
      `No VAN usage columns for ${year} found (expected names like ${excelColumnName('April', year)}). ` +
      `VAN usage columns in the file: ${found}.`
    );
  }

  const presentMaster = MASTER_COLUMNS.filter(([c]) => columns[c]);
  const records = [];
  const missingCode = [];
  const badNos = [];
  const seen = new Map();   // party_code -> first Excel row number
  const duplicates = [];

  raw.forEach((src, i) => {
    const rowNo = i + 2;
    const code = asText(src[columns.party_code]);
    if (!code) {
      if (Object.values(src).some(v => asText(v) !== null)) missingCode.push(rowNo);
      return;
    }
    if (seen.has(code)) {
      duplicates.push(`${code} (rows ${seen.get(code)} and ${rowNo})`);
      return;
    }
    seen.set(code, rowNo);

    const rec = { party_code: code };
    for (const [col] of presentMaster) rec[col] = asText(src[columns[col]]);
    if (rec.nos !== undefined && rec.nos !== null) {
      const n = Number(rec.nos);
      if (Number.isFinite(n)) rec.nos = n;
      else badNos.push(`row ${rowNo} ("${rec.nos}")`);
    }
    // Blank cell -> '' so it is stored (and classified) as Invalid / Missing rather than 'No'.
    for (const m of months) rec[MONTH_COLUMNS[m]] = asText(src[vanByMonth[m]]) ?? '';
    records.push(rec);
  });

  const list = (items, label) => {
    const more = items.length > 5 ? ` and ${items.length - 5} more` : '';
    return `${label}: ${items.slice(0, 5).join(', ')}${more}.`;
  };
  const problems = [];
  if (missingCode.length) problems.push(list(missingCode.map(r => `row ${r}`), 'Rows without a PARTY CODE'));
  if (duplicates.length) problems.push(list(duplicates, 'Duplicate PARTY CODE values'));
  if (badNos.length) problems.push(list(badNos, 'Non-numeric "nos" values'));
  if (problems.length) throw new ValidationError(`Upload rejected. ${problems.join(' ')}`);
  if (!records.length) throw new ValidationError('No rows with a PARTY CODE were found.');

  return { records, presentMaster, months, vanByMonth, ignoredColumns: otherYears };
}

// ── Import ──────────────────────────────────────────────────────────────────

async function uploadedMonths(db, year) {
  const { rows } = await db.query(
    'SELECT DISTINCT unnest(months) AS month FROM uploads WHERE reporting_year = $1', [year]
  );
  return new Set(rows.map(r => r.month));
}

// Validates the file and reports what an import would do, without writing anything.
async function previewExcel(fileBuffer, year) {
  const { records, months, vanByMonth, ignoredColumns } = parseAndValidate(fileBuffer, year);
  const existing = await uploadedMonths(pool, year);
  const { rows: [{ n }] } = await pool.query(
    'SELECT count(*)::int AS n FROM party_year_data WHERE reporting_year = $1 AND party_code = ANY($2)',
    [year, records.map(r => r.party_code)]
  );
  return {
    year,
    months: months.map(m => ({ month: m, column: vanByMonth[m], alreadyUploaded: existing.has(m) })),
    totalRows: records.length,
    existingParties: n,
    newParties: records.length - n,
    ignoredColumns,
  };
}

// Imports the selected months (default: all detected). The file is a complete snapshot of each of them:
// the month is first set to 'No' for every existing party of the year, then parties in the file get their
// uploaded values. Other months are untouched.
async function importExcel(fileBuffer, fileName, year, selectedMonths) {
  const parsed = parseAndValidate(fileBuffer, year);
  const { records, presentMaster, ignoredColumns } = parsed;

  let months = parsed.months;
  if (selectedMonths) {
    const unknown = selectedMonths.filter(m => !months.includes(m));
    if (unknown.length) throw new ValidationError(`The file has no ${year} VAN usage column for: ${unknown.join(', ')}.`);
    months = months.filter(m => selectedMonths.includes(m));
    if (!months.length) throw new ValidationError('Select at least one month to import.');
  }
  const monthCols = months.map(m => MONTH_COLUMNS[m]);

  const recordCols = [['party_code', 'text'], ...presentMaster, ...monthCols.map(c => [c, 'text'])];
  const insertCols = ['reporting_year', 'party_code', ...presentMaster.map(([c]) => c), ...monthCols];
  const selectCols = ['$1', 'x.party_code', ...presentMaster.map(([c]) => `x.${c}`), ...monthCols.map(c => `x.${c}`)];
  const updateSet = [...presentMaster.map(([c]) => c), ...monthCols].map(c => `${c} = EXCLUDED.${c}`).concat('updated_at = now()');

  const upsertSql = `
    WITH upserted AS (
      INSERT INTO party_year_data (${insertCols.join(', ')})
      SELECT ${selectCols.join(', ')}
      FROM jsonb_to_recordset($2::jsonb) AS x(${recordCols.map(([c, t]) => `${c} ${t}`).join(', ')})
      ON CONFLICT (reporting_year, party_code) DO UPDATE SET ${updateSet.join(', ')}
      RETURNING (xmax = 0) AS inserted
    )
    SELECT count(*) FILTER (WHERE inserted)::int AS inserted,
           count(*) FILTER (WHERE NOT inserted)::int AS updated
    FROM upserted`;

  return withTransaction(async client => {
    // One import per year at a time: every upload rewrites rows of the whole year.
    await client.query('SELECT pg_advisory_xact_lock(7311, $1)', [year]);

    const reset = await client.query(
      `UPDATE party_year_data SET ${monthCols.map(c => `${c} = 'No'`).join(', ')}, updated_at = now()
       WHERE reporting_year = $1`, [year]
    );
    const { rows: [counts] } = await client.query(upsertSql, [year, JSON.stringify(records)]);
    await client.query(
      'INSERT INTO uploads (reporting_year, file_name, months, record_count) VALUES ($1, $2, $3, $4)',
      [year, fileName, months, records.length]
    );

    const monthList = months.length > 1 ? `${months.slice(0, -1).join(', ')} and ${months.at(-1)}` : months[0];
    return {
      success: true,
      year,
      months,
      totalRows: records.length,
      newParties: counts.inserted,
      updatedParties: counts.updated,
      resetToNo: reset.rowCount - counts.updated,
      ignoredColumns,
      message: `${monthList} ${year} data uploaded successfully`,
    };
  });
}

// One row per uploaded file. replacedMonths = months a later upload of the same year has overwritten.
async function getUploadHistory(year) {
  const { rows } = await pool.query(
    `SELECT u.id, u.reporting_year AS year, u.file_name AS "fileName", u.months,
            u.record_count AS "recordCount", u.uploaded_at AS "uploadedAt",
            ARRAY(SELECT m FROM unnest(u.months) AS m
                  WHERE EXISTS (SELECT 1 FROM uploads l
                                WHERE l.reporting_year = u.reporting_year AND l.id > u.id AND m = ANY(l.months))
                 ) AS "replacedMonths"
     FROM uploads u
     WHERE ($1::int IS NULL OR u.reporting_year = $1)
     ORDER BY u.id DESC`,
    [year ?? null]
  );
  return rows;
}

module.exports = { importExcel, previewExcel, getUploadHistory, parseAndValidate };
