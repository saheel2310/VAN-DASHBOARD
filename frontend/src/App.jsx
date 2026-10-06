import React, { useEffect, useState, useCallback } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import logo from './assets/shree-nm-logo.png';
import UploadPanel from './components/UploadPanel';
import DashboardControls from './components/DashboardControls';
import MetricCard from './components/MetricCard';
import ErrorBoundary from './components/ErrorBoundary';
import UploadHistory from './components/UploadHistory';
import CategoryBreakdown from './pages/CategoryBreakdown';
import Drilldown from './pages/Drilldown';
import { formatNumber, formatPercent, exportDashboard } from './utils/excel';
import { METRIC_COLUMNS, NO_DATA_MESSAGES } from './utils/metrics';
import {
  fetchYears, fetchMonths, fetchPayTerms,
  fetchOverview, fetchCategoryBreakdown, uploadExcel,
} from './utils/api';

function getRoute() {
  const hash = window.location.hash || '#/';
  const [p, q = ''] = hash.replace(/^#/, '').split('?');
  return { path: p || '/', params: new URLSearchParams(q) };
}
function navigateTo(path, params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  const q = sp.toString();
  window.location.hash = q ? `${path}?${q}` : path;
}

export default function App() {
  const [selectedYear,    setSelectedYear]    = useState('');
  const [selectedMonth,   setSelectedMonth]   = useState('All Months');
  const [selectedPayTerm, setSelectedPayTerm] = useState('ALL');
  const [newOnly,         setNewOnly]         = useState(false);

  const [availableYears,  setAvailableYears]  = useState([]);
  const [availableMonths, setAvailableMonths] = useState(['All Months']);
  const [payTerms,        setPayTerms]        = useState([]);
  const [overview,        setOverview]        = useState(null);

  const [loading,     setLoading]     = useState(true);
  const [dashLoading, setDashLoading] = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [backendOk,   setBackendOk]   = useState(null);
  const [error,       setError]       = useState('');
  const [dashError,   setDashError]   = useState('');
  const [refreshKey,  setRefreshKey]  = useState(0);
  const [route,       setRoute]       = useState(getRoute);

  useEffect(() => {
    fetchYears()
      .then(years => {
        setBackendOk(true);
        setAvailableYears(years);
        if (years.length) setSelectedYear(String(Math.max(...years)));
      })
      .catch(err => {
        const unreachable = err instanceof TypeError;
        setBackendOk(!unreachable);
        setError(unreachable
          ? 'Cannot reach the backend on port 3001. Run "npm run dev" from the project folder.'
          : err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  useEffect(() => {
    if (!selectedYear) { setAvailableMonths(['All Months']); return; }
    fetchMonths(selectedYear).then(months => {
      const list = ['All Months', ...months];
      setAvailableMonths(list);
      setSelectedMonth(prev => list.includes(prev) ? prev : 'All Months');
    }).catch(err => setDashError(err.message));
  }, [selectedYear, refreshKey]);

  useEffect(() => {
    if (!selectedYear) { setPayTerms([]); return; }
    fetchPayTerms(selectedYear, selectedMonth)
      .then(terms => {
        setPayTerms(terms);
        setSelectedPayTerm(prev => (prev === 'ALL' || terms.includes(prev) ? prev : 'ALL'));
      })
      .catch(err => setDashError(err.message));
  }, [selectedYear, selectedMonth, refreshKey]);

  useEffect(() => {
    if (!selectedYear) { setOverview(null); return; }
    setDashLoading(true);
    setDashError('');
    fetchOverview({ year: selectedYear, month: selectedMonth, payTerm: selectedPayTerm, newOnly: newOnly ? '1' : '' })
      .then(setOverview)
      .catch(err => { setOverview(null); setDashError(err.message || 'Failed to load dashboard data'); })
      .finally(() => setDashLoading(false));
  }, [selectedYear, selectedMonth, selectedPayTerm, newOnly, refreshKey]);

  const handleUpload = useCallback(async (file, year, months) => {
    setUploading(true);
    setError('');
    try {
      const result = await uploadExcel(file, year, months);
      const years = await fetchYears();
      setAvailableYears(years);
      setSelectedYear(String(year));
      setSelectedMonth(result.months.length === 1 ? result.months[0] : 'All Months');
      setSelectedPayTerm('ALL');
      setNewOnly(false);
      setRefreshKey(k => k + 1);
      return result;
    } finally {
      setUploading(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    setSelectedMonth('All Months');
    setSelectedPayTerm('ALL');
    setNewOnly(false);
    setDashError('');
    setRefreshKey(k => k + 1);
    navigateTo('/');
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const params = { year: selectedYear, month: selectedMonth, payTerm: selectedPayTerm, newOnly: newOnly ? '1' : '' };
      const data = await fetchCategoryBreakdown(params);
      if (data.noData) return;
      const suffix = [selectedYear, selectedMonth, selectedPayTerm, newOnly ? 'new-van-users' : '']
        .filter(Boolean).join('-').replace(/[^\w-]+/g, '_');
      exportDashboard(data, METRIC_COLUMNS, `van-dashboard-${suffix}.xlsx`,
        selectedMonth === 'All Months' ? `${selectedYear} All Months` : `${selectedMonth} ${selectedYear}`);
    } catch (err) {
      setDashError(err.message);
    }
  }, [selectedYear, selectedMonth, selectedPayTerm, newOnly]);

  if (loading) return (
    <div className="app-shell">
      <header className="topbar">
        <img className="brand-logo" src={logo} alt="Shree NM" />
        <div className="topbar-title">VAN Dashboard</div>
        <div />
      </header>
      <main className="content" style={{ textAlign: 'center', paddingTop: 80, color: '#788298' }}>
        Connecting to backend…
      </main>
    </div>
  );

  const defaults = { year: selectedYear, month: selectedMonth, payTerm: selectedPayTerm, newOnly: newOnly ? '1' : '' };
  const hasOverview = overview && !overview.noData;
  const totals = hasOverview ? overview.totals : null;
  const allMonths = selectedMonth === 'All Months';
  const payTermLabel = selectedPayTerm === 'ALL' ? 'All pay terms' : `${selectedPayTerm} (VAN users only)`;
  const basis = hasOverview ? overview.newUsersBasis : null;
  const startMonth = basis?.startMonth || 'the first month';
  const newUsersSubtitle = allMonths
    ? `Used VAN for the first time after ${startMonth}`
    : basis?.isStartMonth
      ? `${selectedMonth} is the starting month — its VAN users are existing, not new`
      : `First time using VAN (never used since ${startMonth})`;

  const renderOverview = () => (
    <>
      <UploadPanel onUpload={handleUpload} uploading={uploading} />
      {error && <div className="error-banner">{error}</div>}

      <DashboardControls
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        selectedPayTerm={selectedPayTerm}
        newOnly={newOnly}
        availableYears={availableYears}
        availableMonths={availableMonths}
        payTerms={payTerms}
        onYearChange={setSelectedYear}
        onMonthChange={setSelectedMonth}
        onPayTermChange={setSelectedPayTerm}
        onNewOnlyChange={setNewOnly}
        onOpenDashboard={() => navigateTo('/category-breakdown', defaults)}
      />

      {dashError && <div className="error-banner">{dashError}</div>}
      {dashLoading && !totals && (
        <div style={{ padding: '24px 0', color: '#788298', fontWeight: 600 }}>Loading dashboard…</div>
      )}

      {totals && (
        <>
          <section className="summary-head">
            <div>
              <span className="section-label">Current view</span>
              <h2>
                {payTermLabel} • {selectedMonth} {selectedYear}
                {newOnly && (
                  <span className="status-badge blue" style={{ marginLeft: 12, verticalAlign: 'middle' }}>
                    New VAN users only
                  </span>
                )}
              </h2>
            </div>
          </section>

          <section className="metrics-grid">
            <MetricCard
              title="Total Parties"
              value={formatNumber(totals.totalParties)}
              subtitle={allMonths
                ? `Distinct parties across ${availableMonths.length - 1} month(s)`
                : `Distinct parties in ${selectedMonth}`}
            />
            <MetricCard
              title="Using VAN"
              value={formatNumber(totals.usingVAN)}
              subtitle={`${allMonths ? 'In any month · ' : ''}Credit ${formatNumber(totals.usingVANCredit)} · 100% Adv ${formatNumber(totals.usingVANAdvance)}${totals.usingVANOther ? ` · Other ${formatNumber(totals.usingVANOther)}` : ''}`}
              tone="green"
            />
            <MetricCard
              title="Not Using VAN"
              value={formatNumber(totals.notUsingVAN)}
              subtitle={`${allMonths ? '"No" in every month' : 'VAN usage = "No"'}` +
                (totals.invalidMissing ? ` · ${formatNumber(totals.invalidMissing)} more invalid / missing` : '')}
              tone="red"
            />
            <MetricCard
              title="VAN Usage %"
              value={formatPercent(totals.vanUsagePercentage)}
              subtitle="Using VAN / Total Parties"
            />
            <MetricCard
              title="New VAN Users"
              value={formatNumber(totals.newVANUsers)}
              subtitle={newUsersSubtitle}
              tone="blue"
            />
          </section>
        </>
      )}

      {!dashLoading && !dashError && overview?.noData && (
        <div className="empty-state-card" style={{ marginTop: 20 }}>
          <div className="empty-state-title" style={{ fontSize: 24 }}>{NO_DATA_MESSAGES[overview.noData]}</div>
          <p style={{ fontSize: 14 }}>Upload an Excel file for this period to generate the dashboard.</p>
        </div>
      )}

      <UploadHistory year={selectedYear} refreshKey={refreshKey} />
    </>
  );

  const renderEmptyState = () => (
    <div className="empty-state-card">
      <div className="empty-state-title">No data available.</div>
      <p>Upload an Excel file to generate the dashboard.</p>
      <UploadPanel onUpload={handleUpload} uploading={uploading} />
      {error && <div className="error-banner">{error}</div>}
    </div>
  );

  const page = route.path === '/category-breakdown'
    ? <CategoryBreakdown route={route} navigateTo={navigateTo} defaults={defaults} />
    : route.path === '/drilldown'
      ? <Drilldown route={route} navigateTo={navigateTo} defaults={defaults} />
      : !availableYears.length
        ? renderEmptyState()
        : renderOverview();

  return (
    <div className="app-shell">
      <header className="topbar">
        <img className="brand-logo" src={logo} alt="Shree NM" />
        <div className="topbar-title">VAN Dashboard</div>
        <div className="header-actions">
          {backendOk !== null && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600,
              color: backendOk ? '#15803d' : '#b91c1c',
              background: backendOk ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${backendOk ? '#bbf7d0' : '#fecaca'}`,
              borderRadius:999, padding:'4px 10px' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background: backendOk ? '#16a34a' : '#ef4444', display:'inline-block' }} />
              {backendOk ? 'Backend connected' : 'Backend offline'}
            </span>
          )}
          <button className="secondary-button" onClick={handleReset} type="button">
            <RefreshCw size={16} /> Reset
          </button>
          <button className="primary-button" onClick={handleExport} disabled={!totals} type="button">
            <Download size={16} /> Export
          </button>
        </div>
      </header>

      <main className="content">
        <ErrorBoundary>
          {page}
        </ErrorBoundary>
      </main>
    </div>
  );
}
