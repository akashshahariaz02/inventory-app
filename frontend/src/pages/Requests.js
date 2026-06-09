import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getRequests,
  createRequest,
  updateRequest,
  deleteRequest,
  approveRequest,
  rejectRequest,
  getProducts,
  getProjects
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useParams } from 'react-router-dom';

const emptyItem = { product_id: '', quantity: '' };

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function documentTemplate({ title, subtitle, requestNumber, projectName, date, preparedBy, approvedBy, bodyRows, metaRows, signatureLabels }) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)} - ${escapeHtml(requestNumber || '-')}</title>
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
              <div class="subtitle">${escapeHtml(subtitle)}</div>
            </div>
            <div class="docno">
              <div><strong>Project:</strong> ${escapeHtml(projectName || '-')}</div>
              <div><strong>Req. No:</strong> ${escapeHtml(requestNumber || '-')}</div>
              <div><strong>Date:</strong> ${escapeHtml(date || '-')}</div>
            </div>
          </div>
          <div class="section">
            <table class="meta">
              <tbody>${metaRows}</tbody>
            </table>
            <h2>Material Details</h2>
            <table class="items">
              <thead><tr><th>SL</th><th>Product</th><th>Category</th><th>Size</th><th>Quantity</th><th>Unit</th></tr></thead>
              <tbody>${bodyRows}</tbody>
            </table>
            <div class="signatures">
              ${signatureLabels.map(label => `<div class="line">${escapeHtml(label)}</div>`).join('')}
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

function printApprovedRequestInvoice(request, projectName) {
  const invoice = window.open('', '_blank', 'width=900,height=700');
  if (!invoice) {
    toast.error('Please allow popups to generate the invoice PDF');
    return;
  }

  const bodyRows = (request.items || []).map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.product_name || '-')}</td>
      <td>${escapeHtml(item.category_name || '-')}</td>
      <td>${escapeHtml(item.size || '-')}</td>
      <td class="qty">${Number(item.quantity || 0).toLocaleString()}</td>
      <td>${escapeHtml(item.unit || '-')}</td>
    </tr>
  `).join('');
  const metaRows = `
    <tr><th>Requested By</th><td>${escapeHtml(request.requester_name || request.requester_display_name || '-')}</td><th>Status</th><td>${escapeHtml(request.status || '-')}</td></tr>
    <tr><th>Site Location</th><td>${escapeHtml(request.location || '-')}</td><th>Approved At</th><td>${escapeHtml(request.approved_at?.split('T')[0] || '-')}</td></tr>
    <tr><th>Purpose</th><td colspan="3">${escapeHtml(request.purpose || '-')}</td></tr>
  `;
  invoice.document.write(documentTemplate({
    title: 'Approved Request',
    subtitle: 'Approved Material Request',
    requestNumber: request.request_number || request.id,
    projectName,
    date: request.created_at?.split('T')[0],
    preparedBy: request.requester_name || request.requester_display_name,
    approvedBy: request.approved_by,
    metaRows,
    bodyRows,
    signatureLabels: ['Prepared By', 'Checked By', 'Approved Signature']
  }));
  invoice.document.close();
}

function RequestModal({ projectId, products, request, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    location: request?.location || '',
    purpose: request?.purpose || '',
    items: request?.items?.length
      ? request.items.map(item => ({ product_id: item.product_id, quantity: item.quantity }))
      : [{ ...emptyItem }]
  }));
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(request);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const setItem = (index, key, value) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [key]: value } : item)
    }));
  };
  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { ...emptyItem }] }));
  const removeItem = (index) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) || [{ ...emptyItem }] }));
  const productById = (id) => products.find(p => p.id === id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const items = form.items.filter(item => item.product_id && parseFloat(item.quantity) > 0);
    if (!items.length) {
      toast.error('Add at least one product');
      return;
    }

    setSaving(true);
    try {
      const payload = { project_id: projectId, location: form.location, purpose: form.purpose, items };
      if (isEdit) {
        await updateRequest(request.id, payload);
        toast.success('Request updated!');
      } else {
        const res = await createRequest(payload);
        toast.success(`Request submitted! ${res.data.request_number}`);
      }
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
          <h3 className="modal-title">{isEdit ? `Edit ${request.request_number}` : 'New Material Request'}</h3>
          <button className="btn-close" onClick={onClose}>x</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {!isEdit && (
              <div className="alert alert-success" style={{marginBottom:'16px'}}>
                Request number will be generated automatically after submit.
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Items *</label>
              {form.items.map((item, index) => {
                const selectedProduct = productById(item.product_id);
                return (
                  <div key={index} className="card" style={{boxShadow:'none', marginBottom:'10px'}}>
                    <div className="card-body" style={{padding:'14px'}}>
                      <div className="form-row-3">
                        <div className="form-group" style={{marginBottom:0}}>
                          <label className="form-label">Product</label>
                          <select className="form-control" value={item.product_id} onChange={e => setItem(index, 'product_id', e.target.value)} required>
                            <option value="">Select product...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.size ? `(${p.size})` : ''} - Available: {p.current_stock} {p.unit}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group" style={{marginBottom:0}}>
                          <label className="form-label">Quantity</label>
                          <input className="form-control" type="number" min="0.01" step="0.01" value={item.quantity} onChange={e => setItem(index, 'quantity', e.target.value)} required />
                        </div>
                        <div className="form-group" style={{marginBottom:0}}>
                          <label className="form-label">Unit</label>
                          <input className="form-control" value={selectedProduct?.unit || ''} disabled placeholder="Auto" />
                        </div>
                      </div>
                      {form.items.length > 1 && (
                        <button type="button" className="btn btn-danger btn-sm" style={{marginTop:'10px'}} onClick={() => removeItem(index)}>Remove Item</button>
                      )}
                    </div>
                  </div>
                );
              })}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>+ Add Item</button>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Site Location</label>
                <input className="form-control" value={form.location} onChange={e => set('location', e.target.value)} placeholder="Site A" />
              </div>
              <div className="form-group">
                <label className="form-label">Purpose</label>
                <input className="form-control" value={form.purpose} onChange={e => set('purpose', e.target.value)} placeholder="Reason for request..." />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Submit Request'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Requests() {
  const { projectId } = useParams();
  const [requests, setRequests] = useState([]);
  const [products, setProducts] = useState([]);
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const { user, hasPermission } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, pRes, projectsRes] = await Promise.all([
        getRequests({ project_id: projectId, status: statusFilter, search }),
        getProducts({ project_id: projectId }),
        getProjects()
      ]);
      setRequests(rRes.data);
      setProducts(pRes.data);
      setProjectName(projectsRes.data.find(project => project.id === projectId)?.name || '');
    } catch {
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id) => {
    try {
      await approveRequest(id);
      toast.success('Request approved & issue created automatically!');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please enter rejection reason');
      return;
    }
    try {
      await rejectRequest(rejectModal, rejectReason);
      toast.success('Request rejected');
      setRejectModal(null);
      setRejectReason('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleDelete = async (request) => {
    if (!window.confirm(`Delete request ${request.request_number}?`)) return;
    try {
      await deleteRequest(request.id);
      toast.success('Request deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const canApproveRequests = hasPermission('Approve/Reject Requests');
  const canEditRequest = (request) => request.status === 'pending' && (canApproveRequests || request.requested_by === user?.id);
  const counts = {
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length
  };
  const badgeClass = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger' };

  return (
    <div>
      <div className="page-header">
        <h2>Request Management</h2>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Request</button>
        </div>
      </div>
      <div className="page-content">
        {counts.pending > 0 && canApproveRequests && (
          <div className="alert alert-warning">
            <strong>{counts.pending} pending request(s)</strong> awaiting your approval.
          </div>
        )}

        <div className="filters">
          <input className="form-control search-input" placeholder="Search by product, name, req. no..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-control" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All ({counts.all})</option>
            <option value="pending">Pending ({counts.pending})</option>
            <option value="approved">Approved ({counts.approved})</option>
            <option value="rejected">Rejected ({counts.rejected})</option>
          </select>
        </div>

        <div className="card">
          <div className="table-container">
            {loading ? <div className="page-loading"><div className="spinner"></div></div> : (
              <table>
                <thead>
                  <tr><th>Req. No</th><th>Date</th><th>Requested By</th><th>Items</th><th>Site</th><th>Purpose</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr className="no-hover"><td colSpan={8} className="text-muted" style={{textAlign:'center',padding:'40px'}}>No requests found</td></tr>
                  ) : requests.map(r => (
                    <tr key={r.id} className="no-hover">
                      <td className="text-primary fw-600">{r.request_number}</td>
                      <td className="text-muted">{r.created_at?.split('T')[0]}</td>
                      <td>{r.requester_name}</td>
                      <td>
                        {(r.items || []).map(item => (
                          <div key={item.id}>
                            <strong>{item.product_name}</strong>{item.size && <span className="text-muted"> {item.size}</span>}
                            <span className="text-muted"> - {Number(item.quantity).toLocaleString()} {item.unit}</span>
                          </div>
                        ))}
                      </td>
                      <td>{r.location || '-'}</td>
                      <td className="text-muted" style={{maxWidth:'140px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.purpose || '-'}</td>
                      <td><span className={`badge ${badgeClass[r.status]}`}>{r.status}</span></td>
                      <td>
                        {r.status === 'pending' ? (
                          <div className="flex gap-2" style={{flexWrap:'wrap'}}>
                            {canEditRequest(r) && (
                              <>
                                <button className="btn btn-secondary btn-sm" onClick={() => setEditingRequest(r)}>Edit</button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}>Delete</button>
                              </>
                            )}
                            {canApproveRequests && (
                              <>
                                <button className="btn btn-success btn-sm" onClick={() => handleApprove(r.id)}>Approve</button>
                                <button className="btn btn-danger btn-sm" onClick={() => setRejectModal(r.id)}>Reject</button>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="flex gap-2" style={{flexWrap:'wrap'}}>
                            {r.status === 'approved' && (
                              <button className="btn btn-secondary btn-sm" onClick={() => printApprovedRequestInvoice(r, projectName)}>PDF</button>
                            )}
                            <span className="text-muted" style={{fontSize:'11px'}}>{r.approved_by || 'Locked'}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showModal && <RequestModal projectId={projectId} products={products} onSave={() => { setShowModal(false); load(); }} onClose={() => setShowModal(false)} />}
      {editingRequest && <RequestModal projectId={projectId} products={products} request={editingRequest} onSave={() => { setEditingRequest(null); load(); }} onClose={() => setEditingRequest(null)} />}

      {rejectModal && (
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:'400px'}}>
            <div className="modal-header">
              <h3 className="modal-title">Reject Request</h3>
              <button className="btn-close" onClick={() => setRejectModal(null)}>x</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Rejection Reason *</label>
                <textarea className="form-control" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="State reason..." autoFocus />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRejectModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject}>Confirm Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
