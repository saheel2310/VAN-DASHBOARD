const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_ABBR = Object.fromEntries(MONTHS.map(m => [m, m.slice(0, 3).toUpperCase()]));

// party_year_data column holding a month's VAN usage, e.g. August -> van_usage_aug.
// Only ever built from MONTHS, so it is safe to interpolate into SQL.
const MONTH_COLUMNS = Object.fromEntries(MONTHS.map(m => [m, `van_usage_${m.slice(0, 3).toLowerCase()}`]));

// Name of the Excel column expected for a month, used in messages: August 2026 -> VAN_Usage_AUG_26.
function excelColumnName(month, year) {
  return `VAN_Usage_${MONTH_ABBR[month]}_${String(year).slice(-2)}`;
}

module.exports = { MONTHS, MONTH_ABBR, MONTH_COLUMNS, excelColumnName };
