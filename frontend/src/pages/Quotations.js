import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getQuotations,
  createQuotation,
  updateQuotation,
  deleteQuotation,
  selectQuotation,
  getProducts
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useParams } from 'react-router-dom';
import { formatDateBD, todayBD } from '../utils/dates';

function QuotationModal({ projectId, products, quotation, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    product_id: quotation?.product_id || '',
    product_name: quotation?.product_name || '',
    supplier_name: quotation?.supplier_name || '',
    quote_date: quotation?.quote_date || todayBD(),
    quantity: quotation?.quantity || 1,
    rate: quotation?.rate || '',
    total_amount: quotation?.total_amount || 0,
    delivery_days: quotation?.delivery_days || '',
    payment_terms: quotation?.payment_terms || '',
    validity_days: quotation?.validity_days || 30,
    notes: quotation?.notes || ''
  }));
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(quotation);
  const totalAmount = (parseFloat(form.quantity) || 0) * (parseFloat(form.rate) || 0);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await updateQuotation(quotation.id, form);
        toast.success('Quotation updated!');
      } else {
        await createQuotation({ ...form, project_id: projectId });
        toast.success('Quotation added!');
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
          <h3 className="modal-title">{isEdit ? 'Edit Quotation' : 'Add Quotation'}</h3>
          <button className="btn-close" onClick={onClose}>x</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Product Name (Manual)</label>
              <input className="form-control" value={form.product_name} onChange={e => set('product_name', e.target.value)} placeholder="Enter product name" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Supplier Name *</label>
                <input className="form-control" value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)} required placeholder="Vendor / Company" />
              </div>
              <div className="form-group">
                <label className="form-label">Quote Date *</label>
                <input className="form-control" type="date" value={form.quote_date} onChange={e => set('quote_date', e.target.value)} required />
              </div>
            </div>
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Quantity *</label>
                <input className="form-control" type="number" min="0.01" step="0.01" value={form.quantity} onChange={e => set('quantity', e.target.value)} required placeholder="1" />
              </div>
              <div className="form-group">
                <label className="form-label">Unit Price *</label>
                <input className="form-control" type="number" min="0" step="0.01" value={form.rate} onChange={e => set('rate', e.target.value)} required placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">Total Price</label>
                <input className="form-control" value={totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} disabled />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Delivery (days)</label>
                <input className="form-control" type="number" min="0" value={form.delivery_days} onChange={e => set('delivery_days', e.target.value)} placeholder="5" />
              </div>
              <div className="form-group">
                <label className="form-label">Validity (days)</label>
                <input className="form-control" type="number" min="1" value={form.validity_days} onChange={e => set('validity_days', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Payment Terms</label>
              <input className="form-control" value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} placeholder="e.g. 7 days credit, Cash on delivery" />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-control" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Quotation'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Quotations() {
  const { projectId } = useParams();
  const [quotations, setQuotations] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState(null);
  const [filterProduct, setFilterProduct] = useState('');
  const { isManager } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [qRes, pRes] = await Promise.all([getQuotations({ project_id: projectId, product_id: filterProduct }), getProducts({ project_id: projectId })]);
      setQuotations(qRes.data);
      setProducts(pRes.data);
    } catch {
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId, filterProduct]);

  useEffect(() => { load(); }, [load]);

  const handleSelect = async (id) => {
    try {
      await selectQuotation(id);
      toast.success('Quotation selected!');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleDelete = async (quotation) => {
    if (!window.confirm(`Delete quotation from ${quotation.supplier_name}?`)) return;
    try {
      await deleteQuotation(quotation.id);
      toast.success('Quotation deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const badgeClass = { pending: 'badge-warning', selected: 'badge-success', rejected: 'badge-danger' };

  return (
    <div>
      <div className="page-header">
        <h2>Quotation Management</h2>
        {isManager && (
          <div className="header-actions">
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Quotation</button>
          </div>
        )}
      </div>
      <div className="page-content">
        <div className="filters">
          <select className="form-control" value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
            <option value="">All Products</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} {p.size ? `(${p.size})` : ''}</option>)}
          </select>
        </div>

        <div className="card">
          <div className="table-container">
            {loading ? <div className="page-loading"><div className="spinner"></div></div> : (
              <table>
                <thead>
                  <tr><th>Product</th><th>Supplier</th><th>Date</th><th>Quantity</th><th>Unit Price</th><th>Total Price</th><th>Delivery</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {quotations.length === 0 ? (
                    <tr className="no-hover"><td colSpan={9} className="text-muted" style={{textAlign:'center',padding:'40px'}}>No quotations found</td></tr>
                  ) : quotations.map(q => (
                    <tr key={q.id} className="no-hover" style={q.status === 'selected' ? {background:'var(--success-light)'} : {}}>
                      <td><strong>{q.product_name || '-'}</strong></td>
                      <td className="fw-600">{q.supplier_name}</td>
                      <td className="text-muted">{formatDateBD(q.quote_date)}</td>
                      <td className="fw-600">{Number(q.quantity || 1).toLocaleString()}</td>
                      <td className="fw-600 text-primary">{Number(q.rate).toLocaleString()}</td>
                      <td className="fw-600 text-success">{Number(q.total_amount || ((q.quantity || 1) * q.rate)).toLocaleString()}</td>
                      <td>{q.delivery_days ? `${q.delivery_days} days` : '-'}</td>
                      <td><span className={`badge ${badgeClass[q.status] || 'badge-neutral'}`}>{q.status}</span></td>
                      <td>
                        {isManager ? (
                          <div className="flex gap-2" style={{flexWrap:'wrap'}}>
                            {q.status === 'pending' && <button className="btn btn-success btn-sm" onClick={() => handleSelect(q.id)}>Select</button>}
                            <button className="btn btn-secondary btn-sm" onClick={() => setEditingQuotation(q)}>Edit</button>
                            {q.status !== 'selected' && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(q)}>Delete</button>}
                            {q.status === 'selected' && <span className="text-success" style={{fontSize:'12px'}}>Selected</span>}
                          </div>
                        ) : (
                          <span className="text-muted" style={{fontSize:'11px'}}>View only</span>
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

      {showModal && <QuotationModal projectId={projectId} products={products} onSave={() => { setShowModal(false); load(); }} onClose={() => setShowModal(false)} />}
      {editingQuotation && <QuotationModal projectId={projectId} products={products} quotation={editingQuotation} onSave={() => { setEditingQuotation(null); load(); }} onClose={() => setEditingQuotation(null)} />}
    </div>
  );
}
