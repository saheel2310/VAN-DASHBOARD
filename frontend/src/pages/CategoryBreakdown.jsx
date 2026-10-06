import React, { useEffect, useState } from 'react';
import { ArrowLeft, BarChart2, X } from 'lucide-react';
import { formatNumber, formatPercent } from '../utils/excel';
import { fetchCategoryBreakdown } from '../utils/api';
import { METRIC_COLUMNS, NO_DATA_MESSAGES, ALL_MONTHS_RULE, NEW_USERS_RULE } from '../utils/metrics';
import Charts from '../components/Charts';

export default function CategoryBreakdown({ route, navigateTo, defaults = {} }) {
  const [showChart, setShowChart] = useState(false);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params  = route.params;
  const year    = params.get('year')    || defaults.year    || '';
  const month   = params.get('month')   || defaults.month   || 'All Months';
  const payTerm = params.get('payTerm') || defaults.payTerm || 'ALL';
  const newOnly = params.get('newOnly') === '1' ? '1' : '';

  useEffect(() => {
    if (!year) { setLoading(false); return; }
    setLoading(true);
    setError('');
    fetchCategoryBreakdown({ year, month, payTerm, newOnly })
      .then(setBreakdown)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [year, month, payTerm, newOnly]);

  const hasData = breakdown && !breakdown.noData;
  const columns = hasData
    ? METRIC_COLUMNS.filter(c => !c.optional || breakdown.totals[c.key] > 0)
    : [];

  const drill = (metric, category) =>
    navigateTo('/drilldown', { year, month, payTerm, newOnly, category, metric });

  const renderCell = (col, values, category) => {
    const v = values[col.key];
    if (!v) return <span className="metric-zero">0</span>;
    return (
      <button
        className={`metric-link${col.tone === 'negative' ? ' negative' : ''}`}
        type="button"
        title={`Drill into ${col.label}${category ? ` for ${category}` : ''}`}
        onClick={() => drill(col.key, category)}
      >
        {formatNumber(v)}
      </button>
    );
  };

  return (
    <div className="page-card">
      <div className="page-header-row">
        <div>
          <h2>Category Breakdown</h2>
          <div className="drilldown-context" style={{ marginTop: 8, marginBottom: 0 }}>
            <div><strong>Year:</strong> {year || '—'}</div>
            <div><strong>Month:</strong> {month}</div>
            <div><strong>Pay Term:</strong> {payTerm === 'ALL' ? 'All pay terms' : `${payTerm} (VAN users only)`}</div>
            <div title={month === 'All Months' ? ALL_MONTHS_RULE : undefined}>
              <strong>Counting:</strong> distinct parties{month === 'All Months' ? ' (Using = any month)' : ''}
            </div>
            {newOnly && (
              <div title={NEW_USERS_RULE}>
                <strong>Parties:</strong> <span className="status-badge blue">New VAN users only</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasData && (
            <button className="secondary-button" onClick={() => setShowChart(v => !v)} type="button">
              {showChart ? <><X size={16} /> Hide Chart</> : <><BarChart2 size={16} /> View Chart</>}
            </button>
          )}
          <button className="secondary-button" onClick={() => navigateTo('/')} type="button">
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>

      {loading && <div style={{ padding: 24, color: '#788298' }}>Loading…</div>}
      {error && <div className="error-banner">{error}</div>}

      {!loading && !error && (!year || breakdown?.noData) && (
        <div className="empty-state-card">
          <div className="empty-state-title">
            {year ? NO_DATA_MESSAGES[breakdown.noData] : 'No data available'}
          </div>
          <p>Please upload an Excel file.</p>
        </div>
      )}

      {!loading && hasData && (
        <>
          {showChart && (
            <div style={{ marginBottom: 14 }}>
              <Charts summary={breakdown} />
            </div>
          )}

          <div className="table-card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    {columns.map(c => <th key={c.key}>{c.label}</th>)}
                    <th>VAN Usage %</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.rows.map(row => (
                    <tr key={row.category}>
                      <td>
                        <button
                          className="metric-link category-link"
                          type="button"
                          onClick={() => drill('totalParties', row.category)}
                        >
                          {row.category}
                        </button>
                      </td>
                      {columns.map(c => (
                        <td key={c.key} className={c.tone === 'negative' ? 'negative-value' : ''}>
                          {renderCell(c, row, row.category)}
                        </td>
                      ))}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                          <span style={{ color: row.vanUsagePercentage >= 50 ? '#14833b' : '#dc3341', fontWeight: 700 }}>
                            {formatPercent(row.vanUsagePercentage)}
                          </span>
                          <div className="progress-bar-wrap">
                            <div className="progress-bar-fill" style={{ width: `${Math.min(100, Math.max(0, row.vanUsagePercentage))}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Grand Total</td>
                    {columns.map(c => <td key={c.key}>{renderCell(c, breakdown.totals)}</td>)}
                    <td style={{ fontWeight: 800 }}>
                      <span style={{ color: breakdown.totals.vanUsagePercentage >= 50 ? '#14833b' : '#dc3341' }}>
                        {formatPercent(breakdown.totals.vanUsagePercentage)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
