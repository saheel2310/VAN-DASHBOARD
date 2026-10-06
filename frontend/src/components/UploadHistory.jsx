import React, { useEffect, useState } from 'react';
import { fetchUploadHistory } from '../utils/api';
import { formatNumber } from '../utils/excel';

export default function UploadHistory({ year, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!year) { setRows([]); return; }
    setError('');
    fetchUploadHistory(year).then(setRows).catch(err => setError(err.message));
  }, [year, refreshKey]);

  if (!rows.length && !error) return null;

  return (
    <div className="table-card" style={{ marginTop: 14 }}>
      <div className="table-header">
        <div>
          <h3>Upload history ({year})</h3>
          <p>One row per uploaded Excel file. Months struck through were later replaced by a newer upload.</p>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Year</th>
              <th>Months imported</th>
              <th>Parties</th>
              <th>Uploaded At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 650 }}>{r.fileName}</td>
                <td>{r.year}</td>
                <td>
                  {r.months.map((m, i) => (
                    <React.Fragment key={m}>
                      {i > 0 && ', '}
                      {r.replacedMonths.includes(m)
                        ? <s style={{ color: '#9ca3af' }} title="Replaced by a later upload">{m}</s>
                        : m}
                    </React.Fragment>
                  ))}
                </td>
                <td>{formatNumber(r.recordCount)}</td>
                <td>{new Date(r.uploadedAt).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
