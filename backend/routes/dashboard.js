const express = require('express');
const svc = require('../services/dashboardService');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Parses year/month from the query; responds 400 on a malformed year.
function period(req, res) {
  const year = Number(req.query.year ?? req.params.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    res.status(400).json({ error: 'A valid year is required.' });
    return null;
  }
  const month = req.query.month && req.query.month !== 'All Months' ? req.query.month : null;
  return { year, month };
}

const isOn = v => v === '1' || v === 'true';

function drillFilters(q) {
  return {
    payTerm:      q.payTerm || 'ALL',
    newOnly:      isOn(q.newOnly),
    category:     q.category || '',
    regionalHead: q.regionalHead || '',
    groupHead:    q.groupHead || '',
    salesRep:     q.salesRep || q.salesRepresentative || '',
    metric:       svc.resolveMetric(q.metric),
  };
}

router.get('/years', ah(async (_req, res) => res.json(await svc.getYears())));

router.get(['/months', '/months/:year'], ah(async (req, res) => {
  const p = period(req, res);
  if (p) res.json(await svc.getMonths(p.year));
}));

router.get('/pay-terms', ah(async (req, res) => {
  const p = period(req, res);
  if (p) res.json(await svc.getPayTerms(p.year));
}));

router.get('/overview', ah(async (req, res) => {
  const p = period(req, res);
  if (!p) return;
  const noData = await svc.checkPeriod(p.year, p.month);
  if (noData) return res.json({ noData });
  const filters = { payTerm: req.query.payTerm, newOnly: isOn(req.query.newOnly) };
  res.json({
    totals: await svc.getOverview(p.year, p.month, filters),
    newUsersBasis: await svc.getNewUsersBasis(p.year, p.month),
  });
}));

router.get('/category-breakdown', ah(async (req, res) => {
  const p = period(req, res);
  if (!p) return;
  const noData = await svc.checkPeriod(p.year, p.month);
  if (noData) return res.json({ noData });
  res.json(await svc.getCategoryBreakdown(p.year, p.month, { payTerm: req.query.payTerm, newOnly: isOn(req.query.newOnly) }));
}));

const LEVELS = {
  'regional-head':        'regionalHead',
  'group-head':           'groupHead',
  'sales-representative': 'salesRep',
};

router.get('/drilldown/:level', ah(async (req, res, next) => {
  const level = LEVELS[req.params.level];
  if (!level && req.params.level !== 'parties') return next();
  const p = period(req, res);
  if (!p) return;
  const noData = await svc.checkPeriod(p.year, p.month);
  if (noData) return res.json({ noData, rows: [] });
  const filters = drillFilters(req.query);
  const rows = level
    ? await svc.getDrilldownLevel(level, p.year, p.month, filters)
    : await svc.getDrilldownParties(p.year, p.month, filters);
  res.json({ rows });
}));

module.exports = router;
