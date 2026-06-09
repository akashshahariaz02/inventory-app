import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getIssues, createIssue, deleteIssue, getProducts, getProjects } from '../api';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { useParams } from 'react-router-dom';

function IssueModal({ projectId, projectName, products, onSave, onClose }) {
  const [form, setForm] = useState({ product_id: '', issue_date: format(new Date(), 'yyyy-MM-dd'), issued_to: '', project: projectName || '', site_location: '', quantity: '', purpose: '', approved_by: '', remarks: '' });
  const [saving, setSaving] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const set = (k, v) => {
    setForm(p => ({ ...p, [k]: v }));
    if (k === 'product_id') setSelectedProduct(products.find(p => p.id === v) || null);
  };

  const handleProductSearch = (value) => {
    setProductSearch(value);
    set('product_id', '');
    setShowSuggestions(true);
  };

  const filteredProducts = products.filter(product => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return false;
    const label = `${product.name}${product.size ? ` (${product.size})` : ''}`.toLowerCase();
    const displayLabel = `${product.name} — Available: ${product.current_stock} ${product.unit}`.toLowerCase();
    return label.includes(query) || displayLabel.includes(query) || query.includes(label) || query.includes(displayLabel);
  }).slice(0, 8);

  const selectProduct = (product) => {
    setProductSearch(`${product.name}${product.size ? ` (${product.size})` : ''} — Available: ${product.current_stock} ${product.unit}`);
    set('product_id', product.id);
    setShowSuggestions(false);
  };

  useEffect(() => {
    if (!form.product_id) {
      setSelectedProduct(null);
      return;
    }

    const match = products.find(p => p.id === form.product_id);
    setSelectedProduct(match || null);
  }, [form.product_id, products]);

  useEffect(() => {
    setForm(prev => ({ ...prev, project: projectName || '' }));
  }, [projectName]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_id || !form.issue_date || !form.issued_to || !form.quantity) {
      toast.error('Please select a product, issue date, issued to person, and quantity before saving.');
      return;
    }
    setSaving(true);
    try {
      const res = await createIssue({ ...form, project: projectName || form.project, project_id: projectId });
      toast.success(`Issue recorded! ${res.data.request_number}`);
      onSave();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">New Material Issue (OUT)</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Product *</label>
              <input
                className="form-control"
                autoFocus
                value={productSearch}
                onChange={e => handleProductSearch(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
                placeholder="Type to search product..."
                required
              />
              {showSuggestions && filteredProducts.length > 0 && (
                <ul className="product-suggest-menu">
                  {filteredProducts.map(product => (
                    <li key={product.id}>
                      <button type="button" className="product-suggest-item" onMouseDown={e => e.preventDefault()} onClick={() => selectProduct(product)}>
                        {product.name}{product.size ? ` (${product.size})` : ''} — Available: {product.current_stock} {product.unit}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {selectedProduct && (
              <div className="alert alert-success" style={{marginBottom:'12px'}}>
                Available Stock: <strong>{selectedProduct.current_stock} {selectedProduct.unit}</strong>
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Issue Date *</label>
                <input className="form-control" type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Quantity *</label>
                <input className="form-control" type="number" min="0.01" step="0.01" value={form.quantity} onChange={e => set('quantity', e.target.value)} required
                  max={selectedProduct?.current_stock || undefined} />
              </div>
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
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Site Location</label>
                <input className="form-control" value={form.site_location} onChange={e => set('site_location', e.target.value)} placeholder="Site A, Warehouse..." />
              </div>
              <div className="form-group">
                <label className="form-label">Req. No</label>
                <input className="form-control" value="Auto generated after submit" disabled />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Requisition By</label>
                <input className="form-control" value={form.approved_by} onChange={e => set('approved_by', e.target.value)} placeholder="Engineer name" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Purpose</label>
              <input className="form-control" value={form.purpose} onChange={e => set('purpose', e.target.value)} placeholder="Main line installation..." />
            </div>
            <div className="form-group">
              <label className="form-label">Remarks</label>
              <textarea className="form-control" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={saving}>{saving ? 'Saving...' : '↓ Record Issue'}</button>
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
    date: item.issue_date,
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
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [projectId, search, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this issue? Stock will be restored.')) return;
    try { await deleteIssue(id); toast.success('Deleted & stock restored'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h2>OUT / Issue</h2>
        <div className="header-actions">
          {hasPermission('Add Issue (OUT)') && <button className="btn btn-danger" onClick={() => setShowModal(true)}>+ New Issue</button>}
        </div>
      </div>
      <div className="page-content">
        <div className="metrics-grid" style={{gridTemplateColumns:'repeat(2,1fr)', marginBottom:'16px'}}>
          <div className="metric-card danger">
            <div className="metric-label">Total Issues</div>
            <div className="metric-value">{items.length}</div>
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
                  <tr><th>Date</th><th>Product</th><th>Issued To</th><th>Project</th><th>Site Location</th><th>Req. No</th><th>Quantity</th><th>Purpose</th><th>Requisition By</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr className="no-hover"><td colSpan={10} className="text-muted" style={{textAlign:'center',padding:'40px'}}>No issue records found</td></tr>
                  ) : items.map(item => (
                    <tr key={item.id} className="no-hover">
                      <td className="text-muted">{item.issue_date}</td>
                      <td><strong>{item.product_name}</strong>{item.size && <span className="text-muted"> {item.size}</span>}</td>
                      <td>{item.issued_to}</td>
                      <td>{item.project || item.project_name || '-'}</td>
                      <td>{item.site_location || item.location || '-'}</td>
                      <td className="text-primary">{item.request_number || '—'}</td>
                      <td className="text-danger fw-600">-{Number(item.quantity).toLocaleString()} {item.unit}</td>
                      <td className="text-muted" style={{maxWidth:'140px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.purpose || '—'}</td>
                      <td className="text-muted">{item.approved_by || '—'}</td>
                      <td>
                        <div className="flex gap-2" style={{flexWrap:'wrap'}}>
                          <button className="btn btn-secondary btn-sm" onClick={() => printIssueInvoice(item, items)}>PDF</button>
                          {hasPermission('Delete Products') && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.id)}>Del</button>}
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
