import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getCategories, getDashboard } from '../api';
import { useParams } from 'react-router-dom';
import { formatDateTimeBD } from '../utils/dates';

function Badge({ status }) {
  const map = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger', good: 'badge-success', 'low stock': 'badge-danger' };
  return <span className={`badge ${map[status] || 'badge-neutral'}`}>{status}</span>;
}

export default function Dashboard() {
  const { projectId } = useParams();
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [chartCategoryId, setChartCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    getCategories().then(r => setCategories(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    const hasDashboard = Boolean(data);
    if (hasDashboard) setChartLoading(true);
    else setLoading(true);

    getDashboard({ project_id: projectId, category_id: chartCategoryId || undefined })
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        setChartLoading(false);
      });
  }, [chartCategoryId, projectId]);

  if (loading) return <div className="page-loading"><div className="spinner"></div></div>;
  if (!data) return <div className="alert alert-danger">Failed to load dashboard</div>;

  // Merge monthly IN and OUT data
  const allMonths = new Set([...(data.monthlyData || []).map(d => d.month), ...(data.monthlyOut || []).map(d => d.month)]);
  const chartData = [...allMonths].sort().map(month => {
    const inData = data.monthlyData?.find(d => d.month === month);
    const outData = data.monthlyOut?.find(d => d.month === month);
    return { month: month.slice(5), in: inData?.total_in || 0, out: outData?.total_out || 0 };
  });

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <span style={{fontSize:'12px',color:'var(--text3)'}}>Last updated: {formatDateTimeBD(new Date())}</span>
      </div>
      <div className="page-content">
        {data.lowStockItems > 0 && (
          <div className="alert alert-danger">
            ⚠️ <strong>{data.lowStockItems} product(s)</strong> are below minimum stock level: {data.lowStockProducts.map(p => `${p.name} ${p.size || ''}`).join(', ')}
          </div>
        )}

        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">📦 Total Products</div>
            <div className="metric-value">{data.totalProducts}</div>
            <div className="metric-sub">Active items</div>
          </div>
          <div className="metric-card success">
            <div className="metric-label">🏪 Total Stock</div>
            <div className="metric-value">{Number(data.totalStock || 0).toLocaleString()}</div>
            <div className="metric-sub">Units combined</div>
          </div>
          <div className={`metric-card ${data.lowStockItems > 0 ? 'danger' : ''}`}>
            <div className="metric-label">⚠️ Low Stock</div>
            <div className="metric-value">{data.lowStockItems}</div>
            <div className="metric-sub">Below minimum</div>
          </div>
          <div className={`metric-card ${data.pendingRequests > 0 ? 'warning' : ''}`}>
            <div className="metric-label">📋 Pending Requests</div>
            <div className="metric-value">{data.pendingRequests}</div>
            <div className="metric-sub">Awaiting approval</div>
          </div>
        </div>

        <div className="grid-2" style={{marginBottom:'24px'}}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Monthly IN vs OUT (Last 12 months)</span>
              <select
                className="form-control"
                value={chartCategoryId}
                onChange={e => setChartCategoryId(e.target.value)}
                style={{width:'160px', minWidth:'160px', padding:'6px 10px', fontSize:'12px'}}
              >
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="card-body" style={{paddingTop:'8px'}}>
              {chartLoading ? (
                <div className="page-loading" style={{height:'240px'}}><div className="spinner"></div></div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{top:0, right:0, left:-20, bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{fontSize:11}} />
                    <YAxis tick={{fontSize:11}} />
                    <Tooltip formatter={(val) => val.toLocaleString()} />
                    <Legend wrapperStyle={{fontSize:'12px'}} />
                    <Bar dataKey="in" name="Procured (IN)" fill="#2563eb" radius={[3,3,0,0]} />
                    <Bar dataKey="out" name="Issued (OUT)" fill="#dc2626" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">⚠️ Low Stock Alert</span>
            </div>
            <div className="table-container">
              {data.lowStockProducts.length === 0 ? (
                <div className="empty-state" style={{padding:'30px'}}>All products are well-stocked ✅</div>
              ) : (
                <table>
                  <thead><tr><th>Product</th><th>Current</th><th>Minimum</th></tr></thead>
                  <tbody>
                    {data.lowStockProducts.map((p, i) => (
                      <tr key={i} className="no-hover">
                        <td><strong>{p.name}</strong> {p.size && <span className="text-muted">{p.size}</span>}</td>
                        <td className="text-danger fw-600">{p.current_stock} {p.unit}</td>
                        <td className="text-muted">{p.minimum_stock} {p.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Activity</span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Type</th><th>Date</th><th>Product</th><th>Quantity</th><th>Party</th></tr>
              </thead>
              <tbody>
                {(data.recentActivity || []).map((item, i) => (
                  <tr key={i} className="no-hover">
                    <td><span className={`badge ${item.type === 'IN' ? 'badge-success' : 'badge-danger'}`}>{item.type}</span></td>
                    <td className="text-muted">{item.date}</td>
                    <td><strong>{item.product_name}</strong></td>
                    <td className={item.type === 'IN' ? 'text-success fw-600' : 'text-danger fw-600'}>
                      {item.type === 'IN' ? '+' : '-'}{Number(item.quantity).toLocaleString()} {item.unit}
                    </td>
                    <td className="text-muted">{item.party}</td>
                  </tr>
                ))}
                {!data.recentActivity?.length && (
                  <tr className="no-hover"><td colSpan={5} className="text-muted" style={{textAlign:'center',padding:'30px'}}>No activity yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
