import React from 'react';

export default function MetricCard({ title, value, subtitle, tone = '' }) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value}</div>
      {subtitle && <div className="metric-subtitle">{subtitle}</div>}
    </div>
  );
}
