import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber } from '../utils/excel';

export default function Charts({ summary }) {
  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h3>Using vs Not Using VAN</h3>
          <p>Distinct parties per category for the selected filters.</p>
        </div>
      </div>
      <div className="chart-area">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={summary.rows} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="category" />
            <YAxis allowDecimals={false} />
            <Tooltip formatter={(value) => formatNumber(value)} />
            <Legend />
            <Bar dataKey="usingVAN" name="Using VAN" fill="#16a34a" radius={[6, 6, 0, 0]} />
            <Bar dataKey="notUsingVAN" name="Not Using VAN" fill="#dc2626" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
