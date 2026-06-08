import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { getReport } from '../api';
import { useParams } from 'react-router-dom';

// ── Colour palette ────────────────────────────────────────────────────────────
const PIE_COLORS = ['#2563eb','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#65a30d'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = n  => Number(n || 0).toLocaleString();
const pct  = (a, b) => b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0;

// Properly escape a CSV cell value
function csvCell(val) {
  const s = String(val == null ? '' : val);
  // Always wrap in double-quotes and escape internal double-quotes by doubling them
  return '"' + s.replace(/"/g, '""') + '"';
}

function getMovementStatus(p) {
  if (p.period_in === 0 && p.period_out === 0)                                  return { label: 'Dead Stock',   cls: 'badge-neutral' };
  if (p.closing_balance <= 0)                                                    return { label: 'Out of Stock', cls: 'badge-danger'  };
  if (p.minimum_stock > 0 && p.closing_balance <= p.minimum_stock)              return { label: 'Low Stock',    cls: 'badge-danger'  };
  if (p.minimum_stock > 0 && p.closing_balance <= p.minimum_stock * 1.5)        return { label: 'Warning',      cls: 'badge-warning' };
  return { label: 'OK', cls: 'badge-success' };
}

function quickRange(key) {
  const now = new Date();
  const pad = d => d.toISOString().split('T')[0];
  const ago = d => { const x = new Date(now); x.setDate(x.getDate() - d); return pad(x); };
  return ({
    today   : [pad(now), pad(now)],
    week    : [ago(6),   pad(now)],
    month   : [new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0], pad(now)],
    quarter : [new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1).toISOString().split('T')[0], pad(now)],
    year    : [new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0], pad(now)],
    all     : ['2000-01-01', pad(now)],
  })[key] || [pad(now), pad(now)];
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, variant = '' }) {
  return (
    <div className={`metric-card ${variant}`} style={{ minWidth: 0 }}>
      <div className="metric-label" style={{ fontSize: 11 }}>{label}</div>
      <div className="metric-value" style={{ fontSize: 22, wordBreak: 'break-word' }}>{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children, height = 260 }) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header"><span className="card-title">{title}</span></div>
      <div className="card-body" style={{ paddingTop: 12 }}>
        <div style={{ height }}>{children}</div>
      </div>
    </div>
  );
}

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.05) return null;
  const R = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  return (
    <text x={cx + r * Math.cos(-midAngle * R)} y={cy + r * Math.sin(-midAngle * R)}
      fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

const TT = { fontSize: 12, borderRadius: 8 };

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Reports() {
  const { projectId } = useParams();
  const [report,       setReport]       = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [period,       setPeriod]       = useState('monthly');
  const [fromDate,     setFromDate]     = useState('');
  const [toDate,       setToDate]       = useState('');
  const [tab,          setTab]          = useState('overview');
  const [catFilter,    setCatFilter]    = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search,       setSearch]       = useState('');
  const [sortKey,      setSortKey]      = useState('product_name');
  const [sortDir,      setSortDir]      = useState('asc');
  const [topN,         setTopN]         = useState(10);
  const [activeQuick,  setActiveQuick]  = useState('');

  useEffect(() => { load(); }, []); // eslint-disable-line

  const load = async () => {
    setLoading(true);
    try {
      const res = await getReport({ project_id: projectId, period, from_date: fromDate, to_date: toDate });
      setReport(res.data);
    } catch { toast.error('Failed to load report'); }
    finally  { setLoading(false); }
  };

  const applyQuick = key => {
    const [f, t] = quickRange(key);
    setFromDate(f); setToDate(t); setActiveQuick(key);
  };

  // ── derived data ────────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    if (!report) return [];
    return report.productReport
      .filter(p => {
        const ms = !search       || p.product_name.toLowerCase().includes(search.toLowerCase()) || (p.size||'').toLowerCase().includes(search.toLowerCase());
        const mc = !catFilter    || p.category === catFilter;
        const mv = !statusFilter || getMovementStatus(p).label === statusFilter;
        return ms && mc && mv;
      })
      .sort((a, b) => {
        let va = a[sortKey] ?? '', vb = b[sortKey] ?? '';
        if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
        return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
      });
  }, [report, catFilter, search, statusFilter, sortKey, sortDir]);

  const categories = useMemo(() => {
    if (!report) return [];
    return [...new Set(report.productReport.map(p => p.category).filter(Boolean))].sort();
  }, [report]);

  const kpis = useMemo(() => {
    if (!report) return {};
    const pr = report.productReport;
    return {
      lowCount    : pr.filter(p => p.minimum_stock > 0 && p.closing_balance <= p.minimum_stock).length,
      deadCount   : pr.filter(p => p.period_in === 0 && p.period_out === 0).length,
      activeCount : pr.filter(p => p.period_out > 0).length,

    };
  }, [report]);

  const categoryChartData = useMemo(() => {
    if (!report) return [];
    const m = {};
    report.productReport.forEach(p => {
      const c = p.category || 'Other';
      if (!m[c]) m[c] = { name: c, balance: 0, in: 0, out: 0 };
      m[c].balance += p.closing_balance; m[c].in += p.period_in; m[c].out += p.period_out;
    });
    return Object.values(m).sort((a,b) => b.balance - a.balance);
  }, [report]);

  const topUsedData = useMemo(() => {
    if (!report) return [];
    return [...report.productReport]
      .filter(p => p.period_out > 0)
      .sort((a,b) => b.period_out - a.period_out)
      .slice(0, topN)
      .map(p => ({ name: `${p.product_name}${p.size ? ' '+p.size : ''}`.slice(0, 24), out: p.period_out, in: p.period_in }));
  }, [report, topN]);

  const stockLevelData = useMemo(() => {
    if (!report) return [];
    return [...report.productReport]
      .filter(p => p.minimum_stock > 0)
      .sort((a,b) => pct(a.closing_balance, a.minimum_stock * 3) - pct(b.closing_balance, b.minimum_stock * 3))
      .slice(0, 14)
      .map(p => ({
        name  : `${p.product_name} ${p.size||''}`.trim().slice(0, 22),
        stock : p.closing_balance,
        min   : p.minimum_stock,
      }));
  }, [report]);

  // ── sorting ──────────────────────────────────────────────────────────────────
  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  const si = key => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  // ── CSV export (fixed) ───────────────────────────────────────────────────────
  const exportCSV = () => {
    if (!report) return;
    const cols = ['Product','Size','Unit','Category','Opening','Period IN','Period OUT','Closing Balance','Min Stock','Status','Movement'];
    const body = rows.map(p => {
      const { label } = getMovementStatus(p);
      const isDead    = p.period_in === 0 && p.period_out === 0;
      const movement  = isDead ? 'Dead Stock' : p.period_out > 0 ? 'Active' : 'IN Only';
      return [
        csvCell(p.product_name),
        csvCell(p.size),
        csvCell(p.unit),
        csvCell(p.category),
        csvCell(p.opening_stock),
        csvCell(p.period_in),
        csvCell(p.period_out),
        csvCell(p.closing_balance),
        csvCell(p.minimum_stock),   // ← was breaking before for sizes like 3"
        csvCell(label),
        csvCell(movement),
      ].join(',');
    });
    const csv  = [cols.map(csvCell).join(','), ...body].join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `inventory-report-${period}-${report.fromDate}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported! All columns included.');
  };

  // ── Print / PDF ───────────────────────────────────────────────────────────────
  const exportPrint = () => {
    if (!report) return;
    const pr = report.productReport;

    // summary stats for print header
    const lowItems  = pr.filter(p => p.minimum_stock > 0 && p.closing_balance <= p.minimum_stock);
    const totalIn   = pr.reduce((s,p) => s+p.period_in,  0);
    const totalOut  = pr.reduce((s,p) => s+p.period_out, 0);

    const statusColor = { 'OK': '#166534', 'Warning': '#92400e', 'Low Stock': '#991b1b', 'Out of Stock': '#991b1b', 'Dead Stock': '#475569' };
    const statusBg    = { 'OK': '#dcfce7', 'Warning': '#fef3c7', 'Low Stock': '#fee2e2', 'Out of Stock': '#fee2e2', 'Dead Stock': '#f1f5f9' };

    const tableRows = pr
      .sort((a,b) => a.product_name.localeCompare(b.product_name))
      .map(p => {
        const { label } = getMovementStatus(p);
        const isLow = p.minimum_stock > 0 && p.closing_balance <= p.minimum_stock;
        const sc = statusColor[label] || '#111';
        const sb = statusBg[label]    || '#fff';
        return `
          <tr style="${isLow ? 'background:#fff1f2' : ''}">
            <td><strong>${p.product_name}</strong></td>
            <td>${p.size || '—'}</td>
            <td>${p.category || '—'}</td>
            <td style="text-align:center">${p.unit}</td>
            <td style="text-align:right">${fmt(p.period_in)}</td>
            <td style="text-align:right;color:#dc2626;font-weight:600">${fmt(p.period_out)}</td>
            <td style="text-align:right;font-weight:700;color:${isLow?'#dc2626':'#15803d'}">${fmt(p.closing_balance)}</td>
            <td style="text-align:center">${fmt(p.minimum_stock)}</td>
            <td style="text-align:center">
              <span style="background:${sb};color:${sc};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap">${label}</span>
            </td>
          </tr>`;
      }).join('');

    const alertRows = lowItems.length === 0 ? '' : `
      <div class="alert-box">
        <div class="alert-title">⚠️ ${lowItems.length} Product(s) Require Immediate Attention</div>
        <table class="alert-table">
          <thead><tr><th>Product</th><th>Size</th><th>Current Stock</th><th>Min Required</th><th>Shortage</th></tr></thead>
          <tbody>
            ${lowItems.map(p => `<tr>
              <td>${p.product_name}</td><td>${p.size||'—'}</td>
              <td style="color:#dc2626;font-weight:700">${fmt(p.closing_balance)} ${p.unit}</td>
              <td>${fmt(p.minimum_stock)} ${p.unit}</td>
              <td style="color:#dc2626;font-weight:700">-${fmt(Math.max(0,p.minimum_stock-p.closing_balance))} ${p.unit}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    const html = `<!DOCTYPE html><html lang="en"><head>
    <meta charset="UTF-8"><title>Inventory Report</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }

      /* Header */
      .report-header { background: linear-gradient(135deg,#1e40af,#2563eb); color: white; padding: 28px 36px; }
      .report-header h1 { font-size: 22px; font-weight: 700; letter-spacing: .3px; margin-bottom: 4px; }
      .report-header .subtitle { font-size: 12px; opacity: .85; margin-bottom: 20px; }
      .header-meta { display: flex; gap: 32px; flex-wrap: wrap; margin-top: 8px; }
      .header-meta .meta-item { background: rgba(255,255,255,.15); border-radius: 8px; padding: 10px 16px; min-width: 110px; }
      .header-meta .meta-label { font-size: 10px; opacity: .8; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 3px; }
      .header-meta .meta-value { font-size: 18px; font-weight: 700; }

      /* Body */
      .body-wrap { padding: 24px 36px; }

      /* Section title */
      .section-title { font-size: 13px; font-weight: 700; color: #1e40af; text-transform: uppercase;
        letter-spacing: .07em; margin: 20px 0 10px; padding-bottom: 6px;
        border-bottom: 2px solid #dbeafe; display: flex; align-items: center; gap: 6px; }

      /* Alert box */
      .alert-box { background: #fff1f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626;
        border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; }
      .alert-title { font-size: 13px; font-weight: 700; color: #991b1b; margin-bottom: 10px; }
      .alert-table { width: 100%; border-collapse: collapse; font-size: 11px; }
      .alert-table th { background: #fee2e2; padding: 5px 8px; text-align: left; font-size: 10px;
        text-transform: uppercase; letter-spacing: .04em; color: #7f1d1d; }
      .alert-table td { padding: 5px 8px; border-bottom: 1px solid #fecaca; }

      /* Main table */
      table.main { width: 100%; border-collapse: collapse; font-size: 11.5px; }
      table.main thead tr { background: #1e40af; }
      table.main thead th { color: white; padding: 8px 10px; text-align: left; font-size: 10.5px;
        font-weight: 600; letter-spacing: .05em; white-space: nowrap; }
      table.main thead th:nth-child(4),
      table.main thead th:nth-child(5),
      table.main thead th:nth-child(6),
      table.main thead th:nth-child(7),
      table.main thead th:nth-child(8),
      table.main thead th:nth-child(9) { text-align: center; }
      table.main tbody tr:nth-child(even) { background: #f8fafc; }
      table.main tbody tr:hover { background: #eff6ff; }
      table.main td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }

      /* Summary grid */
      .summary-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 20px; }
      .summary-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
      .summary-card .sc-label { font-size: 10px; font-weight: 600; text-transform: uppercase;
        letter-spacing: .06em; color: #64748b; margin-bottom: 4px; }
      .summary-card .sc-value { font-size: 20px; font-weight: 700; color: #0f172a; }
      .summary-card.green { border-color: #86efac; background: #f0fdf4; }
      .summary-card.green .sc-value { color: #15803d; }
      .summary-card.red   { border-color: #fca5a5; background: #fff1f2; }
      .summary-card.red   .sc-value { color: #dc2626; }
      .summary-card.blue  { border-color: #93c5fd; background: #eff6ff; }
      .summary-card.blue  .sc-value { color: #1d4ed8; }

      /* Footer */
      .report-footer { margin-top: 28px; padding: 16px 36px; background: #f8fafc;
        border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between;
        align-items: center; font-size: 11px; color: #64748b; }

      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .report-header { -webkit-print-color-adjust: exact; }
        @page { margin: 0; size: A4 landscape; }
      }
    </style></head><body>

    <!-- Header -->
    <div class="report-header">
      <h1>HICC-SRC JV Inventory Report</h1>
      <div class="subtitle">Period: ${report.fromDate} → ${report.toDate} &nbsp;·&nbsp; Generated: ${new Date().toLocaleString()}</div>
      <div class="header-meta">
        <div class="meta-item"><div class="meta-label">Total Products</div><div class="meta-value">${pr.length}</div></div>
        <div class="meta-item"><div class="meta-label">Period IN (qty)</div><div class="meta-value">${fmt(totalIn)}</div></div>
        <div class="meta-item"><div class="meta-label">Period OUT (qty)</div><div class="meta-value">${fmt(totalOut)}</div></div>
        <div class="meta-item"><div class="meta-label">Low Stock Items</div><div class="meta-value">${lowItems.length}</div></div>
        <div class="meta-item"><div class="meta-label">Procurement Value</div><div class="meta-value">৳ ${fmt(report.totals.total_procurement_value)}</div></div>
      </div>
    </div>

    <div class="body-wrap">

      <!-- Summary cards -->
      <div class="section-title">📊 Summary</div>
      <div class="summary-grid">
        <div class="summary-card blue">
          <div class="sc-label">Total Products</div>
          <div class="sc-value">${pr.length}</div>
        </div>
        <div class="summary-card green">
          <div class="sc-label">Active Products</div>
          <div class="sc-value">${pr.filter(p => p.period_in > 0 || p.period_out > 0).length}</div>
        </div>
        <div class="summary-card red">
          <div class="sc-label">Low Stock Items</div>
          <div class="sc-value">${lowItems.length}</div>
        </div>
        <div class="summary-card">
          <div class="sc-label">Dead Stock Items</div>
          <div class="sc-value">${pr.filter(p => p.period_in===0 && p.period_out===0).length}</div>
        </div>
      </div>

      <!-- Low stock alert -->
      ${alertRows}

      <!-- Main inventory table -->
      <div class="section-title">📋 Product-wise Inventory Detail</div>
      <table class="main">
        <thead>
          <tr>
            <th>Product Name</th>
            <th>Size</th>
            <th>Category</th>
            <th style="text-align:center">Unit</th>
            <th style="text-align:center">Period IN</th>
            <th style="text-align:center">Period OUT</th>
            <th style="text-align:center">Balance</th>
            <th style="text-align:center">Min Stock</th>
            <th style="text-align:center">Status</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

    </div>

    <!-- Footer -->
    <div class="report-footer">
      <span>HICC-SRC JV Inventory Management System</span>
      <span>Total: ${pr.length} products &nbsp;|&nbsp; IN: ${fmt(totalIn)} &nbsp;|&nbsp; OUT: ${fmt(totalOut)}</span>
    </div>

    <script>window.onload = () => window.print();</script>
    </body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h2>📊 Reports & Analytics</h2>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={exportPrint} disabled={!report}>🖨 Print / PDF</button>
          <button className="btn btn-secondary" onClick={exportCSV}   disabled={!report}>↓ Export CSV</button>
          <button className="btn btn-primary"   onClick={load}        disabled={loading}>
            {loading ? 'Generating…' : '⟳ Generate'}
          </button>
        </div>
      </div>

      <div className="page-content">

        {/* Filter bar */}
        <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
            <div>
              <div className="form-label">Period</div>
              <select className="form-control" value={period} onChange={e => setPeriod(e.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <div className="form-label">From Date</div>
              <input className="form-control" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </div>
            <div>
              <div className="form-label">To Date</div>
              <input className="form-control" type="date" value={toDate}   onChange={e => setToDate(e.target.value)} />
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingBottom:1 }}>
              {[['Today','today'],['This Week','week'],['This Month','month'],['Quarter','quarter'],['This Year','year'],['All Time','all']].map(([l,k]) => (
                <button key={k}
                  onClick={() => applyQuick(k)}
                  style={{
                    padding:'5px 12px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer',
                    border: activeQuick===k ? 'none' : '1px solid var(--border2)',
                    background: activeQuick===k
                      ? ({today:'#2563eb',week:'#7c3aed',month:'#16a34a',quarter:'#d97706',year:'#dc2626',all:'#0891b2'})[k] || '#2563eb'
                      : 'white',
                    color: activeQuick===k ? 'white' : 'var(--text2)',
                    transition:'all .15s',
                  }}
                >{l}</button>
              ))}
            </div>
          </div>
        </div>

        {loading && <div className="page-loading"><div className="spinner"></div></div>}

        {report && (
          <>
            {/* KPI cards */}
            <div className="metrics-grid" style={{ gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', marginBottom:20 }}>
              <KpiCard label="📦 Total Products"     value={report.productReport.length}                              sub="in report" />
              <KpiCard label="✅ Active Products"     value={kpis.activeCount}                                         sub="had movement"   variant="success" />
              <KpiCard label="💰 Procurement Value"  value={`৳ ${fmt(report.totals.total_procurement_value)}`}        sub="period total"   variant="success" />
              <KpiCard label="📥 Total Procured"     value={fmt(report.totals.total_procured_qty)}                    sub="units IN" />
              <KpiCard label="📤 Total Issued"       value={fmt(report.totals.total_issued_qty)}                      sub="units OUT"      variant="danger" />
              <KpiCard label="⚠️ Low Stock"          value={kpis.lowCount}                                            sub="below minimum"  variant={kpis.lowCount  > 0 ? 'danger'  : ''} />
              <KpiCard label="💤 Dead Stock"         value={kpis.deadCount}                                           sub="zero movement"  variant={kpis.deadCount > 0 ? 'warning' : ''} />
            </div>

            {/* Tabs */}
            <div style={{ display:'flex', gap:0, marginBottom:20, borderBottom:'2px solid var(--border)' }}>
              {[['overview','📋 Overview'],['charts','📊 Charts'],['table','📄 Full Table']].map(([k,l]) => (
                <button key={k} onClick={() => setTab(k)} style={{
                  padding:'9px 20px', border:'none', background:'none', cursor:'pointer',
                  fontWeight:600, fontSize:13, color: tab===k ? 'var(--primary)' : 'var(--text2)',
                  borderBottom: tab===k ? '2px solid var(--primary)' : '2px solid transparent',
                  marginBottom:-2, transition:'color .15s'
                }}>{l}</button>
              ))}
            </div>

            {/* ═══ OVERVIEW TAB ═══ */}
            {tab === 'overview' && (
              <>
                {kpis.lowCount > 0 && (
                  <div className="alert alert-danger" style={{ marginBottom:16 }}>
                    ⚠️ <strong>{kpis.lowCount} product(s)</strong> are at or below minimum stock. Immediate procurement needed.
                  </div>
                )}

                <div className="grid-2" style={{ marginBottom:20 }}>
                  {/* Category breakdown */}
                  <div className="card">
                    <div className="card-header"><span className="card-title">📦 Category Breakdown</span></div>
                    <div className="table-container">
                      <table>
                        <thead><tr><th>Category</th><th>Products</th><th>IN</th><th>OUT</th><th>Balance</th></tr></thead>
                        <tbody>
                          {categoryChartData.map((c,i) => (
                            <tr key={i} className="no-hover">
                              <td>
                                <span style={{ display:'inline-block',width:10,height:10,borderRadius:2,background:PIE_COLORS[i%PIE_COLORS.length],marginRight:6 }}></span>
                                <strong>{c.name}</strong>
                              </td>
                              <td className="text-muted">{report.productReport.filter(p=>(p.category||'Other')===c.name).length}</td>
                              <td className="text-success fw-600">{fmt(c.in)}</td>
                              <td className="text-danger fw-600">{fmt(c.out)}</td>
                              <td className="fw-600">{fmt(c.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Stock status bars */}
                  <div className="card">
                    <div className="card-header"><span className="card-title">🔢 Stock Status Breakdown</span></div>
                    <div className="card-body">
                      {[
                        { label:'OK / Healthy', color:'#16a34a', count: report.productReport.filter(p=>getMovementStatus(p).label==='OK').length },
                        { label:'Warning',      color:'#d97706', count: report.productReport.filter(p=>getMovementStatus(p).label==='Warning').length },
                        { label:'Low Stock',    color:'#dc2626', count: report.productReport.filter(p=>getMovementStatus(p).label==='Low Stock').length },
                        { label:'Out of Stock', color:'#991b1b', count: report.productReport.filter(p=>getMovementStatus(p).label==='Out of Stock').length },
                        { label:'Dead Stock',   color:'#94a3b8', count: report.productReport.filter(p=>getMovementStatus(p).label==='Dead Stock').length },
                      ].map(row => (
                        <div key={row.label} style={{ marginBottom:14 }}>
                          <div style={{ display:'flex',justifyContent:'space-between',marginBottom:4 }}>
                            <span style={{ fontSize:13,fontWeight:500 }}>{row.label}</span>
                            <span style={{ fontSize:13,fontWeight:700,color:row.color }}>{row.count}</span>
                          </div>
                          <div style={{ height:8,background:'var(--border)',borderRadius:4,overflow:'hidden' }}>
                            <div style={{ height:'100%',background:row.color,borderRadius:4,width:`${pct(row.count,report.productReport.length)}%`,transition:'width .4s' }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Low stock attention list */}
                {kpis.lowCount > 0 && (
                  <div className="card" style={{ marginBottom:20 }}>
                    <div className="card-header"><span className="card-title">⚠️ Items Needing Attention</span></div>
                    <div className="table-container">
                      <table>
                        <thead><tr><th>Product</th><th>Size</th><th>Category</th><th>Current</th><th>Minimum</th><th>Shortage</th><th>Status</th></tr></thead>
                        <tbody>
                          {report.productReport
                            .filter(p => p.minimum_stock > 0 && p.closing_balance <= p.minimum_stock * 1.5)
                            .sort((a,b) => (a.closing_balance/Math.max(1,a.minimum_stock)) - (b.closing_balance/Math.max(1,b.minimum_stock)))
                            .map((p,i) => {
                              const { label, cls } = getMovementStatus(p);
                              const isLow = p.closing_balance <= p.minimum_stock;
                              return (
                                <tr key={i} className="no-hover" style={{ background: isLow ? 'var(--danger-light)' : 'var(--warning-light)' }}>
                                  <td><strong>{p.product_name}</strong></td>
                                  <td>{p.size||'—'}</td>
                                  <td>{p.category||'—'}</td>
                                  <td className="text-danger fw-600">{fmt(p.closing_balance)} {p.unit}</td>
                                  <td>{fmt(p.minimum_stock)} {p.unit}</td>
                                  <td className="text-danger fw-600">{Math.max(0,p.minimum_stock-p.closing_balance) > 0 ? `-${fmt(p.minimum_stock-p.closing_balance)}` : '—'}</td>
                                  <td><span className={`badge ${cls}`}>{label}</span></td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ═══ CHARTS TAB ═══ */}
            {tab === 'charts' && (
              <>
                <div className="grid-2" style={{ marginBottom:0 }}>
                  <ChartCard title="📦 Stock by Category (Pie)">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categoryChartData} dataKey="balance" nameKey="name"
                          cx="50%" cy="50%" outerRadius={100} labelLine={false} label={PieLabel}>
                          {categoryChartData.map((_,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={TT} formatter={v => [fmt(v),'Balance']} />
                        <Legend wrapperStyle={{ fontSize:12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="📊 Category IN vs OUT">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryChartData} margin={{ left:-10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize:11 }} />
                        <YAxis tick={{ fontSize:11 }} />
                        <Tooltip contentStyle={TT} formatter={v => fmt(v)} />
                        <Legend wrapperStyle={{ fontSize:12 }} />
                        <Bar dataKey="in"  name="IN"  fill="#2563eb" radius={[3,3,0,0]} />
                        <Bar dataKey="out" name="OUT" fill="#dc2626" radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                {topUsedData.length > 0 && (
                  <div className="card" style={{ marginBottom:20 }}>
                    <div className="card-header">
                      <span className="card-title">🏆 Most Issued Products</span>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:12, color:'var(--text3)' }}>Show:</span>
                        {[5,10,15,20,'All'].map(n => {
                          const val = n === 'All' ? 9999 : n;
                          const isActive = topN === val;
                          return (
                            <button key={n} onClick={() => setTopN(val)} style={{
                              padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600,
                              cursor:'pointer', border:'none',
                              background: isActive ? 'var(--primary)' : 'var(--bg)',
                              color: isActive ? 'white' : 'var(--text2)',
                              transition:'all .15s',
                            }}>{n}</button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="card-body" style={{ paddingTop:12 }}>
                      <div style={{ height: Math.max(240, topUsedData.length * 34) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={topUsedData} layout="vertical" margin={{ left:10, right:30 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize:11 }} />
                            <YAxis type="category" dataKey="name" width={175} tick={{ fontSize:11 }} />
                            <Tooltip contentStyle={TT} formatter={v => fmt(v)} />
                            <Legend wrapperStyle={{ fontSize:12 }} />
                            <Bar dataKey="in"  name="IN"  fill="#2563eb" radius={[0,3,3,0]} />
                            <Bar dataKey="out" name="OUT" fill="#dc2626" radius={[0,3,3,0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}

                {stockLevelData.length > 0 && (
                  <ChartCard title="📉 Stock vs Minimum Threshold" height={300}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stockLevelData} margin={{ left:-10, right:20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize:10 }} angle={-20} textAnchor="end" height={55} />
                        <YAxis tick={{ fontSize:11 }} />
                        <Tooltip contentStyle={TT} formatter={v => fmt(v)} />
                        <Legend wrapperStyle={{ fontSize:12 }} />
                        <Line type="monotone" dataKey="stock" name="Current Stock" stroke="#2563eb" strokeWidth={2} dot={{ r:4 }} />
                        <Line type="monotone" dataKey="min"   name="Min Required"  stroke="#dc2626" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}

                {(() => {
                  const active = report.productReport.filter(p => p.period_in > 0 || p.period_out > 0)
                    .map(p => ({ name:`${p.product_name} ${p.size||''}`.trim().slice(0,22), in:p.period_in, out:p.period_out, balance:p.closing_balance }));
                  if (!active.length) return null;
                  return (
                    <ChartCard title="⚖️ IN vs OUT vs Balance — Active Products" height={Math.max(280, active.length * 30)}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={active} layout="vertical" margin={{ left:10, right:30 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize:11 }} />
                          <YAxis type="category" dataKey="name" width={165} tick={{ fontSize:11 }} />
                          <Tooltip contentStyle={TT} formatter={v => fmt(v)} />
                          <Legend wrapperStyle={{ fontSize:12 }} />
                          <Bar dataKey="in"      name="IN"      fill="#2563eb" radius={[0,3,3,0]} />
                          <Bar dataKey="out"     name="OUT"     fill="#dc2626" radius={[0,3,3,0]} />
                          <Bar dataKey="balance" name="Balance" fill="#16a34a" radius={[0,3,3,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  );
                })()}
              </>
            )}

            {/* ═══ FULL TABLE TAB ═══ */}
            {tab === 'table' && (
              <>
                <div className="filters" style={{ marginBottom:16 }}>
                  <input className="form-control search-input" placeholder="Search product or size…" value={search} onChange={e => setSearch(e.target.value)} />
                  <select className="form-control" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
                    <option value="">All Categories</option>
                    {categories.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <select className="form-control" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All Status</option>
                    <option>OK</option><option>Warning</option><option>Low Stock</option><option>Out of Stock</option><option>Dead Stock</option>
                  </select>
                  <span style={{ fontSize:12,color:'var(--text3)',paddingLeft:4 }}>{rows.length} / {report.productReport.length} products</span>
                </div>

                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Product-wise Summary ({report.fromDate} → {report.toDate})</span>
                    <span style={{ fontSize:12,color:'var(--text3)' }}>Click headers to sort</span>
                  </div>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          {[['product_name','Product'],['category','Category'],['size','Size'],['unit','Unit'],
                            ['opening_stock','Opening'],['period_in','Period IN'],['period_out','Period OUT'],
                            ['closing_balance','Balance'],['minimum_stock','Min Stock']
                          ].map(([k,l]) => (
                            <th key={k} style={{ cursor:'pointer',userSelect:'none',whiteSpace:'nowrap' }} onClick={() => toggleSort(k)}>
                              {l}{si(k)}
                            </th>
                          ))}
                          <th>Stock %</th><th>Status</th><th>Movement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr className="no-hover"><td colSpan={12} style={{ textAlign:'center',padding:'40px',color:'var(--text3)' }}>No products match filters</td></tr>
                        ) : rows.map((p,i) => {
                          const { label, cls } = getMovementStatus(p);
                          const isLow  = p.minimum_stock > 0 && p.closing_balance <= p.minimum_stock;
                          const isDead = p.period_in === 0 && p.period_out === 0;
                          const bPct   = pct(p.closing_balance, Math.max(p.minimum_stock * 3, p.closing_balance, 1));
                          const bColor = isLow ? '#dc2626' : p.closing_balance <= p.minimum_stock * 1.5 ? '#d97706' : '#16a34a';
                          return (
                            <tr key={i} className="no-hover" style={ isLow ? { background:'var(--danger-light)' } : isDead ? { background:'#f8fafc' } : {} }>
                              <td><strong>{p.product_name}</strong></td>
                              <td>{p.category ? <span className="badge badge-info">{p.category}</span> : '—'}</td>
                              <td>{p.size||'—'}</td>
                              <td style={{ color:'var(--text3)' }}>{p.unit}</td>
                              <td style={{ color:'var(--text3)' }}>{fmt(p.opening_stock)}</td>
                              <td className="text-success fw-600">+{fmt(p.period_in)}</td>
                              <td className="text-danger fw-600">-{fmt(p.period_out)}</td>
                              <td><strong style={{ color:bColor }}>{fmt(p.closing_balance)}</strong></td>
                              <td style={{ color:'var(--text3)' }}>{fmt(p.minimum_stock)}</td>
                              <td style={{ minWidth:110 }}>
                                <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                                  <div style={{ flex:1,height:6,background:'var(--border)',borderRadius:3,overflow:'hidden' }}>
                                    <div style={{ height:'100%',width:`${bPct}%`,background:bColor,borderRadius:3 }}></div>
                                  </div>
                                  <span style={{ fontSize:11,color:'var(--text3)',minWidth:30 }}>{bPct}%</span>
                                </div>
                              </td>
                              <td><span className={`badge ${cls}`}>{label}</span></td>
                              <td>
                                <span className={`badge ${isDead ? 'badge-neutral' : p.period_out > 0 ? 'badge-success' : 'badge-info'}`}>
                                  {isDead ? '💤 Dead' : p.period_out > 0 ? '🔄 Active' : '📥 IN only'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Footer totals */}
                  <div style={{ padding:'12px 16px',borderTop:'1px solid var(--border)',display:'flex',gap:24,fontSize:13,flexWrap:'wrap' }}>
                    <span>🔢 <strong>{rows.length}</strong> products shown</span>
                    <span>📥 IN: <strong className="text-success">{fmt(rows.reduce((s,p)=>s+p.period_in,0))}</strong></span>
                    <span>📤 OUT: <strong className="text-danger">{fmt(rows.reduce((s,p)=>s+p.period_out,0))}</strong></span>
                    <span>📦 Balance: <strong>{fmt(rows.reduce((s,p)=>s+p.closing_balance,0))}</strong></span>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
