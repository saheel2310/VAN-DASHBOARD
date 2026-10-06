import React from 'react';
import { LayoutDashboard } from 'lucide-react';
import { NEW_USERS_RULE } from '../utils/metrics';

export default function DashboardControls({
  selectedYear,
  selectedMonth,
  selectedPayTerm,
  newOnly,
  availableYears,
  availableMonths,
  payTerms,
  onYearChange,
  onMonthChange,
  onPayTermChange,
  onNewOnlyChange,
  onOpenDashboard,
}) {
  return (
    <section className="controls-card">
      <div>
        <div className="section-label">Filters</div>
        <h1>Dashboard view</h1>
      </div>

      <div className="dashboard-filters">
        <div className="filter-group">
          <label htmlFor="year-select">Year</label>
          <select
            id="year-select"
            value={selectedYear}
            onChange={(event) => onYearChange(event.target.value)}
          >
            {availableYears.map((year) => (
              <option key={year} value={String(year)}>{year}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="month-select">Month</label>
          <select
            id="month-select"
            value={selectedMonth}
            onChange={(event) => onMonthChange(event.target.value)}
          >
            {availableMonths.map((month) => (
              <option key={month} value={month}>{month}</option>
            ))}
          </select>
        </div>

        <div className="filter-group" title={NEW_USERS_RULE}>
          <label htmlFor="segment-select">Parties</label>
          <select
            id="segment-select"
            value={newOnly ? 'new' : 'all'}
            onChange={(event) => onNewOnlyChange(event.target.value === 'new')}
          >
            <option value="all">All parties</option>
            <option value="new">New VAN users only</option>
          </select>
        </div>
      </div>

      <div className="pay-term-card">
        <div className="section-label">Pay terms (VAN users only)</div>
        <div className="pay-term-tabs">
          <button
            className={selectedPayTerm === 'ALL' ? 'active' : ''}
            onClick={() => onPayTermChange('ALL')}
            type="button"
          >
            All
          </button>
          {payTerms.map((term) => (
            <button
              key={term}
              className={selectedPayTerm === term ? 'active' : ''}
              onClick={() => onPayTermChange(term)}
              type="button"
            >
              {term}
            </button>
          ))}
        </div>
      </div>

      <button className="primary-button" onClick={onOpenDashboard} type="button">
        <LayoutDashboard size={16} /> Go to Dashboard
      </button>
    </section>
  );
}
