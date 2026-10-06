const { pool } = require('../db/pool');
const { MONTHS, MONTH_COLUMNS } = require('../config/vanColumns');

// Metric key -> SQL predicate on the party's resolved status.
const METRICS = {
  totalParties:    'TRUE',
  usingVAN:        "status LIKE 'USING_%'",
  notUsingVAN:     "status = 'NOT_USING'",
  usingVANCredit:  "status = 'USING_CREDIT'",
  usingVANAdvance: "status = 'USING_ADVANCE'",
  usingVANOther:   "status = 'USING_OTHER'",
  invalidMissing:  "status = 'INVALID_MISSING'",
  newVANUsers:     'is_new',
};

// Accepts "notUsingVAN", "not_using_van", "NOT-USING-VAN", ...
const METRIC_LOOKUP = Object.fromEntries(Object.keys(METRICS).map(k => [k.toLowerCase(), k]));
function resolveMetric(value) {
  return value ? METRIC_LOOKUP[String(value).toLowerCase().replace(/[_\-\s]/g, '')] : undefined;
}

const METRIC_COUNTS = Object.entries(METRICS)
  .map(([key, pred]) => `COUNT(DISTINCT pm_key) FILTER (WHERE ${pred})::int AS "${key}"`)
  .join(',\n      ');

const label = col => `COALESCE(NULLIF(btrim(d.${col}), ''), '(Blank)')`;

// Unpivots a party-year row into its monthly VAN usage values.
const MONTH_VALUES = MONTHS.map((m, i) => `('${m}', ${i + 1}, d.${MONTH_COLUMNS[m]})`).join(', ');
const MONTH_NO_SQL = `array_position(ARRAY[${MONTHS.map(m => `'${m}'`).join(',')}]::text[], month)`;

// One record per party (pm_key = party_code), classified over the uploaded months in scope:
// a single month uses that month's column; "All Months" counts a party as Using VAN if any month has a
// valid VAN code, Not Using if every month is "No", otherwise Invalid / Missing.
// Months that were never uploaded are excluded, so their default 'No' values are never counted.
//
// is_new = this is the FIRST uploaded month (across all years so far) in which the party uses VAN.
// A party that stops and starts again is new only the first time. The very first uploaded month is the
// baseline: parties already using VAN there are existing users, not new ones.
// Periods are compared as year * 100 + month number.
function recordsCte(params, year, month) {
  params.push(year);
  const yearParam = `$${params.length}`;
  let monthFilter = '';
  if (month) {
    params.push(month);
    monthFilter = ` AND v.month = $${params.length}`;
  }
  return `
    WITH uploaded AS (
      SELECT DISTINCT reporting_year AS yr, month, reporting_year * 100 + ${MONTH_NO_SQL} AS period
      FROM (SELECT reporting_year, unnest(months) AS month FROM uploads WHERE reporting_year <= ${yearParam}) x
    ),
    first_use AS (
      SELECT d.party_code, min(u.period) AS first_period
      FROM party_year_data d
      CROSS JOIN LATERAL (VALUES ${MONTH_VALUES}) AS v(month, month_no, usage)
      JOIN uploaded u ON u.yr = d.reporting_year AND u.month = v.month
      WHERE d.reporting_year <= ${yearParam}
        AND van_classification(v.usage, d.pay_terms) LIKE 'USING_%'
      GROUP BY d.party_code
    ),
    party_months AS (
      SELECT d.id, d.party_code,
             COALESCE(btrim(d.party_name), '') AS party_name,
             ${label('category_frequency_purchase')} AS category,
             ${label('regional_head')} AS regional_head,
             ${label('group_head')} AS group_head,
             ${label('sales_representative_name')} AS sales_rep,
             ${label('pay_terms')} AS status_pay_terms,
             v.month, v.month_no, v.usage,
             van_classification(v.usage, d.pay_terms) AS cls,
             (f.first_period = u.period
              AND u.period <> (SELECT min(period) FROM uploaded)) AS is_new
      FROM party_year_data d
      CROSS JOIN LATERAL (VALUES ${MONTH_VALUES}) AS v(month, month_no, usage)
      JOIN uploaded u ON u.yr = d.reporting_year AND u.month = v.month
      LEFT JOIN first_use f ON f.party_code = d.party_code
      WHERE d.reporting_year = ${yearParam}${monthFilter}
    ),
    records AS (
      SELECT id, party_code AS pm_key, party_code, party_name, category, regional_head, group_head, sales_rep,
             status_pay_terms,
             CASE WHEN count(*) = 1 THEN max(month) ELSE 'All Months' END AS reporting_month,
             CASE WHEN bool_or(cls LIKE 'USING_%') THEN max(cls) FILTER (WHERE cls LIKE 'USING_%')
                  WHEN bool_and(cls = 'NOT_USING') THEN 'NOT_USING'
                  ELSE 'INVALID_MISSING' END AS status,
             CASE WHEN count(*) = 1 THEN max(usage)
                  ELSE string_agg(upper(left(month, 3)) || ': ' || COALESCE(NULLIF(usage, ''), '(blank)'), ', ' ORDER BY month_no)
             END AS status_van_value,
             bool_or(is_new) AS is_new,
             COALESCE(string_agg(month, ', ' ORDER BY month_no) FILTER (WHERE is_new), '') AS started_in
      FROM party_months
      GROUP BY id, party_code, party_name, category, regional_head, group_head, sales_rep, status_pay_terms
    )`;
}

const FILTER_COLUMNS = {
  category:     'category',
  regionalHead: 'regional_head',
  groupHead:    'group_head',
  salesRep:     'sales_rep',
};

// Pay term is a secondary split that only applies to parties actually using VAN.
function filterClause(params, f = {}) {
  const clauses = ['TRUE'];
  if (f.payTerm && f.payTerm !== 'ALL') {
    params.push(f.payTerm);
    clauses.push(`status LIKE 'USING_%' AND lower(status_pay_terms) = lower(btrim($${params.length}))`);
  }
  for (const [key, col] of Object.entries(FILTER_COLUMNS)) {
    if (f[key]) {
      params.push(f[key]);
      clauses.push(`${col} = $${params.length}`);
    }
  }
  if (f.newOnly) clauses.push('is_new');
  if (f.metric) clauses.push(METRICS[f.metric]);
  return clauses.join(' AND ');
}

// The baseline for "new VAN users": the earliest uploaded month overall, and whether the selected
// month is that baseline (in which case nobody counts as new).
async function getNewUsersBasis(year, month) {
  const { rows: [first] } = await pool.query(
    `SELECT reporting_year AS year, month FROM (
       SELECT reporting_year, unnest(months) AS month FROM uploads
     ) x ORDER BY reporting_year, ${MONTH_NO_SQL} LIMIT 1`
  );
  if (!first) return null;
  return {
    startMonth: `${first.month} ${first.year}`,
    isStartMonth: Boolean(month) && first.year === year && first.month === month,
  };
}

const withRate = t => ({
  ...t,
  vanUsagePercentage: t.totalParties > 0 ? (t.usingVAN / t.totalParties) * 100 : 0,
});

const byLabel = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

// Category order: A, B, C, ... alphabetically, then "cash sales", with blanks at the very end.
const categoryRank = c => {
  const s = String(c).trim().toLowerCase();
  return s === '(blank)' ? 2 : s === 'cash sales' ? 1 : 0;
};
const byCategory = (a, b) => categoryRank(a) - categoryRank(b) || byLabel(a, b);

// ── Discovery ───────────────────────────────────────────────────────────────

async function getYears() {
  const { rows } = await pool.query(
    'SELECT DISTINCT reporting_year AS year FROM party_year_data ORDER BY 1'
  );
  return rows.map(r => r.year);
}

// Every party row has all 12 month columns, so the months with real data are the uploaded ones.
async function getMonths(year) {
  const { rows } = await pool.query(
    'SELECT DISTINCT unnest(months) AS month FROM uploads WHERE reporting_year = $1', [year]
  );
  const found = new Set(rows.map(r => r.month));
  return MONTHS.filter(m => found.has(m));
}

// Returns 'year' / 'month' when there is nothing to show, else null.
async function checkPeriod(year, month) {
  const months = await getMonths(year);
  if (!months.length) return 'year';
  if (month && !months.includes(month)) return 'month';
  return null;
}

// Pay terms are a master field (one value per party per year), so they don't vary by month.
async function getPayTerms(year) {
  const { rows } = await pool.query(
    `SELECT DISTINCT btrim(pay_terms) AS term FROM party_year_data
     WHERE reporting_year = $1 AND NULLIF(btrim(pay_terms), '') IS NOT NULL
     ORDER BY 1`,
    [year]
  );
  return rows.map(r => r.term);
}

// ── Aggregations ────────────────────────────────────────────────────────────

// filters: { payTerm, newOnly }
async function getOverview(year, month, filters) {
  const params = [];
  const sql = `${recordsCte(params, year, month)}
    SELECT ${METRIC_COUNTS}
    FROM records WHERE ${filterClause(params, filters)}`;
  const { rows } = await pool.query(sql, params);
  return withRate(rows[0]);
}

async function getCategoryBreakdown(year, month, filters) {
  const params = [];
  const sql = `${recordsCte(params, year, month)}
    SELECT category, GROUPING(category) AS is_total, ${METRIC_COUNTS}
    FROM records WHERE ${filterClause(params, filters)}
    GROUP BY GROUPING SETS ((category), ())`;
  const [{ rows }, { rows: allCategories }] = await Promise.all([
    pool.query(sql, params),
    pool.query(
      `SELECT DISTINCT COALESCE(NULLIF(btrim(category_frequency_purchase), ''), '(Blank)') AS category
       FROM party_year_data WHERE reporting_year = $1`, [year]
    ),
  ]);

  const strip = ({ category, is_total, ...rest }) => withRate(rest);
  const zeros = () => withRate(Object.fromEntries(Object.keys(METRICS).map(k => [k, 0])));
  const found = new Map(rows.filter(r => r.is_total === 0).map(r => [r.category, strip(r)]));
  const totalRow = rows.find(r => r.is_total === 1);
  // Every category of the year is listed, in a fixed order, even when the filters leave it empty.
  return {
    rows: allCategories
      .map(c => ({ category: c.category, ...(found.get(c.category) || zeros()) }))
      .sort((a, b) => byCategory(a.category, b.category)),
    totals: totalRow ? strip(totalRow) : zeros(),
  };
}

const LEVEL_COLUMNS = { regionalHead: 'regional_head', groupHead: 'group_head', salesRep: 'sales_rep' };

async function getDrilldownLevel(level, year, month, filters) {
  const col = LEVEL_COLUMNS[level];
  const params = [];
  const sql = `${recordsCte(params, year, month)}
    SELECT ${col} AS label, COUNT(DISTINCT pm_key)::int AS value
    FROM records WHERE ${filterClause(params, filters)}
    GROUP BY ${col}`;
  const { rows } = await pool.query(sql, params);
  return rows.sort((a, b) => b.value - a.value || byLabel(a.label, b.label));
}

async function getDrilldownParties(year, month, filters) {
  const params = [];
  const sql = `${recordsCte(params, year, month)}
    SELECT DISTINCT ON (pm_key)
           party_code AS "partyCode", party_name AS "partyName", reporting_month AS month,
           status, status_pay_terms AS "payTerms", COALESCE(status_van_value, '') AS "vanValue",
           started_in AS "startedIn"
    FROM records WHERE ${filterClause(params, filters)}
    ORDER BY pm_key, id`;
  const { rows } = await pool.query(sql, params);
  return rows.sort((a, b) => byLabel(a.partyCode, b.partyCode));
}

module.exports = {
  METRICS, resolveMetric,
  getYears, getMonths, checkPeriod, getPayTerms, getNewUsersBasis,
  getOverview, getCategoryBreakdown, getDrilldownLevel, getDrilldownParties,
};
