import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getIssues, createIssue, deleteIssue, deleteIssueGroup, getProducts, getProjects } from '../api';
import { useAuth } from '../context/AuthContext';
import { useParams } from 'react-router-dom';
import { formatDateBD, todayBD } from '../utils/dates';

function IssueModal({ projectId, projectName, products, onSave, onClose }) {
  const [form, setForm] = useState({
    issue_date: todayBD(),
    issued_to: '',
    project: projectName || '',
    site_location: '',
    purpose: '',
    approved_by: '',
    remarks: '',
    items: [{ product_id: '', quantity: '' }]
  });
  const [saving, setSaving] = useState(false);

  const productById = (id) => products.find(product => product.id === id);
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const setItem = (index, key, value) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [key]: value } : item))
    }));
  };
  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { product_id: '', quantity: '' }] }));
  const removeItem = (index) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((_, i) => i !== index) : prev.items
    }));
  };

  useEffect(() => {
    setForm(prev => ({ ...prev, project: projectName || '' }));
  }, [projectName]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const items = form.items.filter(item => item.product_id && parseFloat(item.quantity) > 0);
    if (!form.issue_date || !form.issued_to || !items.length) {
      toast.error('Please enter issue date, issued to person, and at least one product item.');
      return;
    }

    const requestedByProduct = new Map();
    for (const item of items) {
      requestedByProduct.set(item.product_id, (requestedByProduct.get(item.product_id) || 0) + Number(item.quantity || 0));
    }
    for (const [productId, requestedQty] of requestedByProduct.entries()) {
      const product = productById(productId);
      if (product && requestedQty > Number(product.current_stock || 0)) {
        toast.error(`Insufficient stock for ${product.name}. Available: ${product.current_stock} ${product.unit}, requested: ${requestedQty} ${product.unit}`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await createIssue({ ...form, items, project: projectName || form.project, project_id: projectId });
      toast.success(`Issue recorded! ${res.data.request_number}`);
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">New Material Issue (OUT)</h3>
          <button className="btn-close" onClick={onClose}>x</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Issue Date *</label>
                <input className="form-control" type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Req. No</label>
                <input className="form-control" value="Auto generated after submit" disabled />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Items *</label>
              {form.items.map((item, index) => {
                const selectedProduct = productById(item.product_id);
                return (
                  <div key={index} className="card" style={{ boxShadow: 'none', marginBottom: '10px' }}>
                    <div className="card-body" style={{ padding: '14px' }}>
                      <div className="form-row-3">
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Product</label>
                          <select className="form-control" value={item.product_id} onChange={e => setItem(index, 'product_id', e.target.value)} required>
                            <option value="">Select product...</option>
                            {products.map(product => (
                              <option key={product.id} value={product.id}>
                                {product.name} {product.size ? `(${product.size})` : ''} - Available: {product.current_stock} {product.unit}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Quantity</label>
                          <input
                            className="form-control"
                            type="number"
                            min="1"
                            step="1"
                            max={selectedProduct?.current_stock || undefined}
                            value={item.quantity}
                            onChange={e => setItem(index, 'quantity', e.target.value)}
                            required
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Unit</label>
                          <input className="form-control" value={selectedProduct?.unit || ''} disabled placeholder="Auto" />
                        </div>
                      </div>
                      {selectedProduct && (
                        <div className="text-muted" style={{ fontSize: '12px', marginTop: '8px' }}>
                          Available Stock: {selectedProduct.current_stock} {selectedProduct.unit}
                        </div>
                      )}
                      {form.items.length > 1 && (
                        <button type="button" className="btn btn-danger btn-sm" style={{ marginTop: '10px' }} onClick={() => removeItem(index)}>
                          Remove Item
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>+ Add Item</button>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Issued To *</label>
                <input className="form-control" value={form.issued_to} onChange={e => set('issued_to', e.target.value)} required placeholder="Person name" />
              </div>
              <div className="form-group">
                <label className="form-label">Project</label>
                <input className="form-control" value={projectName || form.project || ''} disabled placeholder="Project name" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Site Location</label>
              <input className="form-control" value={form.site_location} onChange={e => set('site_location', e.target.value)} placeholder="Site A, Warehouse..." />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Requisition By</label>
                <input className="form-control" value={form.approved_by} onChange={e => set('approved_by', e.target.value)} placeholder="Engineer name" />
              </div>
              <div className="form-group">
                <label className="form-label">Purpose</label>
                <input className="form-control" value={form.purpose} onChange={e => set('purpose', e.target.value)} placeholder="Main line installation..." />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Remarks</label>
              <textarea className="form-control" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={saving}>{saving ? 'Saving...' : 'Record Issue'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function issueDocumentTemplate({ requestNumber, projectName, date, issuedTo, siteLocation, preparedBy, approvedBy, bodyRows }) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Issue Invoice - ${escapeHtml(requestNumber || '-')}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #111827; margin: 32px; background: #f3f4f6; }
          .toolbar { text-align: right; margin-bottom: 14px; }
          .toolbar button { padding: 8px 14px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer; }
          .invoice { background: #fff; border: 1px solid #dbeafe; border-radius: 10px; overflow: hidden; }
          .brand { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; padding: 22px 26px; border-bottom: 4px solid #1d4ed8; }
          h1 { margin: 0; font-size: 28px; letter-spacing: .02em; }
          .brand-hicc { color: #1d4ed8; }
          .brand-src { color: #dc2626; }
          .brand-jv { color: #111827; }
          .subtitle { margin-top: 4px; color: #475569; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; }
          .docno { text-align: right; font-size: 13px; line-height: 1.7; }
          .docno strong { color: #0f172a; }
          .section { padding: 22px 26px; }
          .meta { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .meta th, .meta td { border: 1px solid #d1d5db; padding: 9px 10px; font-size: 13px; text-align: left; }
          .meta th { width: 145px; background: #f8fafc; color: #334155; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; }
          h2 { margin: 0 0 12px; font-size: 15px; color: #0f172a; text-transform: uppercase; letter-spacing: .06em; }
          .items { width: 100%; border-collapse: collapse; }
          .items th, .items td { border: 1px solid #cbd5e1; padding: 10px; font-size: 13px; text-align: left; }
          .items th { background: #1d4ed8; color: #fff; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; }
          .items td.qty { text-align: right; font-weight: 700; }
          .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 36px; margin-top: 70px; }
          .line { border-top: 1px solid #111827; padding-top: 8px; font-size: 12px; text-align: center; min-height: 34px; }
          .footer { display: flex; justify-content: space-between; padding: 14px 26px; border-top: 1px solid #e5e7eb; color: #64748b; font-size: 11px; }
          @media print {
            body { margin: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .toolbar { display: none; }
            .invoice { border: none; border-radius: 0; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
        <div class="invoice">
          <div class="brand">
            <div>
              <h1><span class="brand-hicc">HICC</span>-<span class="brand-src">SRC</span> <span class="brand-jv">JV</span></h1>
              <div class="subtitle">Material Issue Invoice</div>
            </div>
            <div class="docno">
              <div><strong>Project:</strong> ${escapeHtml(projectName || '-')}</div>
              <div><strong>Req. No:</strong> ${escapeHtml(requestNumber || '-')}</div>
              <div><strong>Date:</strong> ${escapeHtml(date || '-')}</div>
            </div>
          </div>
          <div class="section">
            <table class="meta">
              <tbody>
                <tr><th>Issued To</th><td>${escapeHtml(issuedTo || '-')}</td><th>Prepared By</th><td>${escapeHtml(preparedBy || '-')}</td></tr>
                <tr><th>Site Location</th><td>${escapeHtml(siteLocation || '-')}</td><th>Approved By</th><td>${escapeHtml(approvedBy || '-')}</td></tr>
              </tbody>
            </table>
            <h2>Issued Material Details</h2>
            <table class="items">
              <thead><tr><th>SL</th><th>Product</th><th>Category</th><th>Size</th><th>Quantity</th><th>Unit</th></tr></thead>
              <tbody>${bodyRows}</tbody>
            </table>
            <div class="signatures">
              <div class="line">Prepared By</div>
              <div class="line">Received By</div>
              <div class="line">Approved Signature</div>
            </div>
          </div>
          <div class="footer">
            <span>Prepared By: ${escapeHtml(preparedBy || '-')}</span>
            <span>Approved By: ${escapeHtml(approvedBy || '-')}</span>
          </div>
        </div>
      </body>
    </html>
  `;
}

function printIssueInvoice(item, allItems) {
  const invoiceItems = item.request_number
    ? allItems.filter(row => row.request_number === item.request_number)
    : [item];
  const invoice = window.open('', '_blank', 'width=900,height=700');
  if (!invoice) {
    toast.error('Please allow popups to generate invoice PDF');
    return;
  }

  const bodyRows = invoiceItems.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(row.product_name)}</td>
      <td>${escapeHtml(row.category_name || '-')}</td>
      <td>${escapeHtml(row.size || '-')}</td>
      <td class="qty">${Number(row.quantity).toLocaleString()}</td>
      <td>${escapeHtml(row.unit)}</td>
    </tr>
  `).join('');
  invoice.document.write(issueDocumentTemplate({
    requestNumber: item.request_number || item.id,
    projectName: item.project || item.project_name || '-',
    date: formatDateBD(item.issue_date),
    issuedTo: item.issued_to,
    siteLocation: item.site_location || item.location,
    preparedBy: item.created_by_name || item.issued_to,
    approvedBy: item.approved_by,
    bodyRows
  }));
  invoice.document.close();
}

export default function Issues() {
  const { projectId } = useParams();
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const { hasPermission } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, pRes, prRes] = await Promise.all([
        getIssues({ project_id: projectId, search, from_date: fromDate, to_date: toDate }),
        getProducts({ project_id: projectId }),
        getProjects()
      ]);
      setItems(iRes.data);
      setProducts(pRes.data);
      setProjectName(prRes.data.find(item => item.id === projectId)?.name || '');
    } catch {
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId, search, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const issueGroups = Object.values(items.reduce((groups, item) => {
    const key = item.request_number || item.id;
    if (!groups[key]) groups[key] = { ...item, items: [] };
    groups[key].items.push(item);
    return groups;
  }, {}));

  const handleDeleteGroup = async (group) => {
    if (!window.confirm(`Delete issue "${group.request_number || group.id}"? Stock for all items will be restored.`)) return;
    try {
      if (group.request_number) await deleteIssueGroup(group.request_number, projectId);
      else await deleteIssue(group.id);
      toast.success('Deleted and stock restored');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h2>OUT / Issue</h2>
        <div className="header-actions">
          {hasPermission('Add Issue (OUT)') && <button className="btn btn-danger" onClick={() => setShowModal(true)}>+ New Issue</button>}
        </div>
      </div>
      <div className="page-content">
        <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginBottom: '16px' }}>
          <div className="metric-card danger">
            <div className="metric-label">Total Issues</div>
            <div className="metric-value">{issueGroups.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Issued Qty</div>
            <div className="metric-value">{totalQty.toLocaleString()}</div>
          </div>
        </div>

        <div className="filters">
          <input className="form-control search-input" placeholder="Search product, person, site..." value={search} onChange={e => setSearch(e.target.value)} />
          <input className="form-control" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <input className="form-control" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>

        <div className="card">
          <div className="table-container">
            {loading ? <div className="page-loading"><div className="spinner"></div></div> : (
              <table>
                <thead>
                  <tr><th>Date</th><th>Req. No</th><th>Issued To</th><th>Project</th><th>Site Location</th><th>Items</th><th>Purpose</th><th>Requisition By</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {issueGroups.length === 0 ? (
                    <tr className="no-hover"><td colSpan={9} className="text-muted" style={{ textAlign: 'center', padding: '40px' }}>No issue records found</td></tr>
                  ) : issueGroups.map(group => (
                    <tr key={group.request_number || group.id} className="no-hover">
                      <td className="text-muted">{formatDateBD(group.issue_date)}</td>
                      <td className="text-primary fw-600">{group.request_number || '-'}</td>
                      <td>{group.issued_to}</td>
                      <td>{group.project || group.project_name || '-'}</td>
                      <td>{group.site_location || group.location || '-'}</td>
                      <td>
                        {group.items.map(item => (
                          <div key={item.id}>
                            <strong>{item.product_name}</strong>{item.size && <span className="text-muted"> {item.size}</span>}
                            <span className="text-danger fw-600"> -{Number(item.quantity).toLocaleString()} {item.unit}</span>
                          </div>
                        ))}
                      </td>
                      <td className="text-muted" style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.purpose || '-'}</td>
                      <td className="text-muted">{group.approved_by || '-'}</td>
                      <td>
                        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => printIssueInvoice(group, items)}>PDF</button>
                          {hasPermission('Delete Products') && <button className="btn btn-danger btn-sm" onClick={() => handleDeleteGroup(group)}>Del</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showModal && <IssueModal projectId={projectId} projectName={projectName} products={products} onSave={() => { setShowModal(false); load(); }} onClose={() => setShowModal(false)} />}
    </div>
  );
}
