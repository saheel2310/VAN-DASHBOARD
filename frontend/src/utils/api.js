const BASE = '/api';

async function req(url, opts = {}) {
  const res = await fetch(BASE + url, opts);
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(e.error || 'Request failed');
  }
  return res.json();
}

function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  });
  const s = p.toString();
  return s ? '?' + s : '';
}

export const fetchYears             = ()            => req('/dashboard/years');
export const fetchMonths            = year          => req(`/dashboard/months${qs({ year })}`);
export const fetchPayTerms          = (year, month) => req(`/dashboard/pay-terms${qs({ year, month })}`);
export const fetchOverview          = p             => req(`/dashboard/overview${qs(p)}`);
export const fetchCategoryBreakdown = p             => req(`/dashboard/category-breakdown${qs(p)}`);
export const fetchUploadHistory     = year          => req(`/uploads/history/${year}`);

export const fetchDrilldownRegionalHead = p => req(`/dashboard/drilldown/regional-head${qs(p)}`);
export const fetchDrilldownGroupHead    = p => req(`/dashboard/drilldown/group-head${qs(p)}`);
export const fetchDrilldownSalesRep     = p => req(`/dashboard/drilldown/sales-representative${qs(p)}`);
export const fetchDrilldownParties      = p => req(`/dashboard/drilldown/parties${qs(p)}`);

export async function previewExcel(file, year) {
  const form = new FormData();
  form.append('file', file);
  form.append('year', String(year));
  return req('/uploads/preview', { method: 'POST', body: form });
}

export async function uploadExcel(file, year, months) {
  const form = new FormData();
  form.append('file', file);
  form.append('year', String(year));
  form.append('months', JSON.stringify(months));
  return req('/uploads/excel', { method: 'POST', body: form });
}
