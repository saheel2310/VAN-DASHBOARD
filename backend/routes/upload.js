const express = require('express');
const multer  = require('multer');
const { importExcel, previewExcel, getUploadHistory } = require('../services/importService');
const { MONTHS } = require('../config/vanColumns');

const router = express.Router();
// Memory storage: the uploaded workbook is parsed from RAM and never written to disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Shared checks for preview and import; responds 400 and returns null on bad input.
function readUpload(req, res) {
  const yearNum = Number(req.body.year);
  if (!req.body.year)                                                 { res.status(400).json({ error: 'Year is required.' }); return null; }
  if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) { res.status(400).json({ error: 'Invalid year.' }); return null; }
  if (!req.file)                                                      { res.status(400).json({ error: 'No file uploaded.' }); return null; }
  if (!/\.xlsx?$/i.test(req.file.originalname || ''))                 { res.status(400).json({ error: 'Only .xlsx / .xls files are accepted.' }); return null; }
  return yearNum;
}

// "months" may be a JSON array or a comma-separated list of month names; omitted = all detected months.
function parseMonths(value) {
  if (value === undefined || value === '') return undefined;
  let list;
  try { list = JSON.parse(value); } catch { list = String(value).split(','); }
  if (!Array.isArray(list)) return null;
  list = list.map(m => String(m).trim());
  return list.every(m => MONTHS.includes(m)) ? list : null;
}

router.post('/preview', upload.single('file'), ah(async (req, res) => {
  const year = readUpload(req, res);
  if (year) res.json(await previewExcel(req.file.buffer, year));
}));

router.post('/excel', upload.single('file'), ah(async (req, res) => {
  const year = readUpload(req, res);
  if (!year) return;
  const months = parseMonths(req.body.months);
  if (months === null) return res.status(400).json({ error: 'Invalid months list.' });

  const result = await importExcel(req.file.buffer, req.file.originalname, year, months);
  console.log(`[import] ${result.months.join('/')} ${year}: ${result.totalRows} rows, ${result.newParties} new, ${result.updatedParties} updated, ${result.resetToNo} reset to No`);
  res.json(result);
}));

router.get(['/history', '/history/:year'], ah(async (req, res) => {
  const { year } = req.params;
  if (year !== undefined && !/^\d{4}$/.test(year)) return res.status(400).json({ error: 'Invalid year.' });
  res.json(await getUploadHistory(year === undefined ? null : Number(year)));
}));

module.exports = router;
