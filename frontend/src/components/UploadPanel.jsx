import React, { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { previewExcel } from '../utils/api';

const n = v => Number(v).toLocaleString('en-IN');

export default function UploadPanel({ onUpload, uploading }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState([]);
  const [checking, setChecking] = useState(false);
  const [localErr, setLocalErr] = useState('');
  const [success, setSuccess] = useState('');

  const yearOptions = Array.from({ length: 7 }, (_, i) => currentYear - 3 + i);
  const yy = String(year).slice(-2);

  // Re-check the file whenever the file or year changes, so the month list always matches the import.
  useEffect(() => {
    if (!file) { setPreview(null); setSelected([]); return; }
    let cancelled = false;
    setChecking(true);
    setLocalErr('');
    setPreview(null);
    previewExcel(file, year)
      .then(p => {
        if (cancelled) return;
        setPreview(p);
        setSelected(p.months.map(m => m.month));
      })
      .catch(err => { if (!cancelled) setLocalErr(err.message); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [file, year]);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setSuccess(''); }
    e.target.value = '';
  };

  const toggle = month =>
    setSelected(prev => (prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]));

  const handleUpload = async () => {
    if (!file || !selected.length) return;
    setLocalErr('');
    setSuccess('');
    const months = preview.months.map(m => m.month).filter(m => selected.includes(m));
    try {
      const r = await onUpload(file, year, months);
      setSuccess(
        `${r.message}: ${n(r.totalRows)} parties — ${n(r.newParties)} new, ${n(r.updatedParties)} updated` +
        (r.resetToNo ? `, ${n(r.resetToNo)} not in this file set to "No" for these months.` : '.')
      );
      setFile(null);
    } catch (err) {
      setLocalErr(err.message);
    }
  };

  const replacing = preview ? preview.months.filter(m => m.alreadyUploaded && selected.includes(m.month)) : [];

  return (
    <div className="upload-panel">
      <div className="upload-copy">
        <div className="eyebrow">Excel input</div>
        <h2>Upload your VAN data</h2>
        <p>
          Select the <b>year</b> and choose the Excel workbook. The months are detected from the VAN usage
          column names (e.g. <b>VAN_Usage_APR_{yy}</b>) and you choose which of them to import. Each party is
          stored once per year, with its VAN usage for every month in the same row. For each imported month the
          file is the complete list: parties missing from it are set to "No".
        </p>
      </div>

      <div className="upload-controls">
        <div className="upload-field">
          <label htmlFor="upload-year">Year</label>
          <select id="upload-year" value={year} onChange={e => { setYear(Number(e.target.value)); setSuccess(''); }}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="upload-field" style={{ minWidth: 0 }}>
          <label>Excel file</label>
          <label className="upload-button" style={{ cursor: 'pointer' }}>
            <Upload size={16} />
            {file ? file.name : 'Choose Excel'}
            <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} hidden />
          </label>
        </div>

        <button
          className="primary-button"
          onClick={handleUpload}
          disabled={uploading || checking || !preview || !selected.length}
          type="button"
          style={{ alignSelf: 'flex-end' }}
        >
          {uploading ? 'Uploading…' : 'Upload Excel'}
        </button>
      </div>

      {checking && <div className="upload-full month-picker-note">Checking the file…</div>}

      {preview && (
        <div className="upload-full month-picker">
          <div className="month-picker-head">
            <strong>Months found in {file?.name} for {preview.year}</strong>
            <span>
              {n(preview.totalRows)} parties — {n(preview.existingParties)} already in the database, {n(preview.newParties)} new
            </span>
          </div>
          <div className="month-options">
            {preview.months.map(m => (
              <label key={m.month} className={`month-option${selected.includes(m.month) ? ' checked' : ''}`} title={m.column}>
                <input type="checkbox" checked={selected.includes(m.month)} onChange={() => toggle(m.month)} />
                {m.month}
                {m.alreadyUploaded && <small>already uploaded</small>}
              </label>
            ))}
          </div>
          {!selected.length && <div className="month-picker-note">Select at least one month to import.</div>}
          {replacing.length > 0 && (
            <div className="month-picker-note">
              Importing will replace the existing data for {replacing.map(m => m.month).join(', ')}.
            </div>
          )}
          {preview.ignoredColumns.length > 0 && (
            <div className="month-picker-note">Ignored (other year): {preview.ignoredColumns.join(', ')}</div>
          )}
        </div>
      )}

      {localErr && <div className="upload-full error-banner" style={{ marginTop: 0 }}>{localErr}</div>}
      {success && <div className="upload-full success-banner">{success}</div>}
    </div>
  );
}
