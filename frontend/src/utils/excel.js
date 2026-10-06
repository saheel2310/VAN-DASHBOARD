import * as XLSX from 'xlsx';

export function formatNumber(value) {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export function exportDashboard(breakdown, columns, fileName, sheetTitle = 'Dashboard') {
  const toRow = (label, values) => ({
    Category: label,
    ...Object.fromEntries(columns.map(c => [c.label, values[c.key]])),
    'VAN Usage %': Number((values.vanUsagePercentage || 0).toFixed(1)),
  });

  const sheetData = breakdown.rows.map(row => toRow(row.category, row));
  sheetData.push(toRow('Grand Total', breakdown.totals));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheetData), sheetTitle.slice(0, 31));
  XLSX.writeFile(workbook, fileName);
}
