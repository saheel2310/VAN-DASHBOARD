import React, { useEffect, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { formatNumber } from '../utils/excel';
import { METRIC_LABELS, NO_DATA_MESSAGES, STATUS_BADGES } from '../utils/metrics';
import {
  fetchDrilldownRegionalHead,
  fetchDrilldownGroupHead,
  fetchDrilldownSalesRep,
  fetchDrilldownParties,
} from '../utils/api';

const LEVELS = {
  regionalHead: { title: 'Regional Head',        fetch: fetchDrilldownRegionalHead, next: 'groupHead' },
  groupHead:    { title: 'Group Head',           fetch: fetchDrilldownGroupHead,    next: 'salesRep' },
  salesRep:     { title: 'Sales Representative', fetch: fetchDrilldownSalesRep,     next: null },
  parties:      { title: 'Parties',              fetch: fetchDrilldownParties },
};

export default function Drilldown({ route, navigateTo, defaults = {} }) {
  const [search, setSearch]   = useState('');
  const [rows, setRows]       = useState([]);
  const [noData, setNoData]   = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const params       = route.params;
  const year         = params.get('year')         || defaults.year    || '';
  const month        = params.get('month')        || defaults.month   || 'All Months';
  const payTerm      = params.get('payTerm')      || defaults.payTerm || 'ALL';
  const category     = params.get('category')     || '';
  const metric       = METRIC_LABELS[params.get('metric')] ? params.get('metric') : 'totalParties';
  const regionalHead = params.get('regionalHead') || '';
  const groupHead    = params.get('groupHead')    || '';
  const salesRep     = params.get('salesRep')     || '';
  const newOnly      = params.get('newOnly') === '1' ? '1' : '';

  const level = !regionalHead ? 'regionalHead' : !groupHead ? 'groupHead' : !salesRep ? 'salesRep' : 'parties';
  const isParties = level === 'parties';
  const allMonths = month === 'All Months';
  const metricLabel = METRIC_LABELS[metric];
  // In "All Months" a new VAN user may have started in any month, so show which.
  const showStarted = allMonths && (newOnly || metric === 'newVANUsers');
  const partyCols = showStarted ? 6 : 5;

  const base = { year, month, payTerm, newOnly, category, metric };
  const path = { ...base, regionalHead, groupHead, salesRep };

  useEffect(() => {
    if (!year) { setLoading(false); return; }
    setLoading(true);
    setError('');
    setSearch('');
    LEVELS[level].fetch(path)
      .then(data => { setRows(data.rows || []); setNoData(data.noData || ''); })
      .catch(err => { setRows([]); setError(err.message); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, payTerm, newOnly, category, metric, regionalHead, groupHead, salesRep]);

  const q = search.trim().toLowerCase();
  const displayRows = isParties && q
    ? rows.filter(r => r.partyCode.toLowerCase().includes(q) || r.partyName.toLowerCase().includes(q))
    : rows;

  const breadcrumbs = [
    { label: 'Dashboard', path: '/', params: {} },
    { label: 'Category Breakdown', path: '/category-breakdown', params: { year, month, payTerm, newOnly } },
    { label: `${category ? `Category ${category} · ` : 'All categories · '}${metricLabel}`, path: '/drilldown', params: base },
  ];
  if (regionalHead) breadcrumbs.push({ label: regionalHead, path: '/drilldown', params: { ...base, regionalHead } });
  if (groupHead)    breadcrumbs.push({ label: groupHead,    path: '/drilldown', params: { ...base, regionalHead, groupHead } });
  if (salesRep)     breadcrumbs.push({ label: salesRep,     path: '/drilldown', params: path });

  const openRow = label => {
    if (level === 'regionalHead') navigateTo('/drilldown', { ...base, regionalHead: label });
    else if (level === 'groupHead') navigateTo('/drilldown', { ...base, regionalHead, groupHead: label });
    else if (level === 'salesRep') navigateTo('/drilldown', { ...base, regionalHead, groupHead, salesRep: label });
  };

  const total = isParties ? displayRows.length : displayRows.reduce((s, r) => s + r.value, 0);
  const unit = 'parties';

  return (
    <div className="page-card">
      <div className="page-header-row">
        <div>
          <div className="breadcrumb-row">
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={`${crumb.label}-${i}`}>
                {i > 0 && <span className="breadcrumb-separator">›</span>}
                <button className="breadcrumb-link" type="button" onClick={() => navigateTo(crumb.path, crumb.params)}>
                  {crumb.label}
                </button>
              </React.Fragment>
            ))}
          </div>
          <h2>{LEVELS[level].title}</h2>
        </div>
        <button className="secondary-button" onClick={() => window.history.back()} type="button">
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div className="drilldown-context">
        <div><strong>Year:</strong> {year || '—'}</div>
        <div><strong>Month:</strong> {month}</div>
        <div><strong>Pay Term:</strong> {payTerm === 'ALL' ? 'All pay terms' : `${payTerm} (VAN users only)`}</div>
        <div><strong>Category:</strong> {category || 'All categories'}</div>
        <div><strong>Metric:</strong> {metricLabel}</div>
        {newOnly && <div><strong>Parties:</strong> <span className="status-badge blue">New VAN users only</span></div>}
        {regionalHead && <div><strong>Regional Head:</strong> {regionalHead}</div>}
        {groupHead && <div><strong>Group Head:</strong> {groupHead}</div>}
        {salesRep && <div><strong>Sales Rep:</strong> {salesRep}</div>}
      </div>

      {isParties && (
        <div className="search-bar-wrap">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="Search by party code or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
          />
        </div>
      )}

      {loading && <div style={{ padding: 24, color: '#788298' }}>Loading…</div>}
      {error && <div className="error-banner">{error}</div>}

      {!loading && !error && (!year || noData) && (
        <div className="empty-state-card">
          <div className="empty-state-title">{year ? NO_DATA_MESSAGES[noData] : 'No data available'}</div>
          <p>Please upload an Excel file.</p>
        </div>
      )}

      {!loading && !error && year && !noData && (
        <div className="table-wrap">
          <table>
            <thead>
              {isParties ? (
                <tr>
                  <th>Party Code</th>
                  <th>Party Name</th>
                  <th>{allMonths ? 'VAN Usage by Month' : 'VAN Usage Value'}</th>
                  {showStarted && <th>Started Using In</th>}
                  <th>Pay Terms</th>
                  <th>Classification</th>
                </tr>
              ) : (
                <tr>
                  <th>{LEVELS[level].title}</th>
                  <th>{metricLabel} ({unit})</th>
                </tr>
              )}
            </thead>
            <tbody>
              {displayRows.length === 0 && (
                <tr><td colSpan={isParties ? partyCols : 2} style={{ textAlign: 'center', color: '#788298' }}>No matching records.</td></tr>
              )}
              {isParties
                ? displayRows.map(p => {
                    const badge = STATUS_BADGES[p.status];
                    return (
                      <tr key={p.partyCode}>
                        <td style={{ fontWeight: 650, color: '#1f2937' }}>{p.partyCode || '—'}</td>
                        <td>{p.partyName || '—'}</td>
                        <td><code>{p.vanValue || '(blank)'}</code></td>
                        {showStarted && <td>{p.startedIn || '—'}</td>}
                        <td>{p.payTerms}</td>
                        <td><span className={`status-badge ${badge.className}`}>{badge.label}</span></td>
                      </tr>
                    );
                  })
                : displayRows.map(item => (
                    <tr key={item.label}>
                      <td>
                        <button className="drilldown-link" type="button" onClick={() => openRow(item.label)}>
                          {item.label}
                        </button>
                      </td>
                      <td className={metric === 'notUsingVAN' ? 'negative-value' : ''}>{formatNumber(item.value)}</td>
                    </tr>
                  ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={isParties ? partyCols - 1 : 1}>
                  {isParties
                    ? `Total: ${formatNumber(total)} ${unit}${q ? ` matching "${search.trim()}" (of ${formatNumber(rows.length)})` : ''}`
                    : `Grand Total (${rows.length} ${LEVELS[level].title.toLowerCase()}s)`}
                </td>
                <td style={{ fontWeight: 800 }}>{isParties ? '' : formatNumber(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
