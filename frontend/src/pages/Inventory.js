import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { getProducts, createProduct, updateProduct, deleteProduct, getCategories, createCategory } from '../api';
import { useAuth } from '../context/AuthContext';
import { useParams } from 'react-router-dom';
import { parseCsv, readTextFile } from '../utils/csv';

const UNITS = ['Feet', 'Meter', 'Piece', 'Kg', 'Liter', 'Box', 'Roll'];
const today = () => new Date().toISOString().split('T')[0];

function ProductModal({ projectId, product, categories, onSave, onClose }) {
  const [form, setForm] = useState(product || {
    name: '',
    category_id: '',
    size: '',
    unit: 'Piece',
    opening_stock: 0,
    supplier_name: '',
    purchase_date: today(),
    rate: '',
    minimum_stock: 0,
    description: ''
  });
  const [saving, setSaving] = useState(false);
  const openingQty = parseFloat(form.opening_stock) || 0;
  const openingRate = parseFloat(form.rate) || 0;
  const openingTotal = openingQty * openingRate;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!product && openingQty > 0 && (!form.supplier_name?.trim() || !form.purchase_date || form.rate === '' || form.rate === null)) {
      toast.error('Supplier, purchase date, and rate are required when opening stock is greater than 0');
      return;
    }
    setSaving(true);
    try {
      if (product) await updateProduct(product.id, form);
      else await createProduct({ ...form, project_id: projectId });
      toast.success(product ? 'Product updated!' : 'Product created!');
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">{product ? 'Edit Product' : 'Add New Product'}</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Product Name *</label>
              <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} required placeholder="e.g. GI Pipe" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-control" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Size / Diameter</label>
                <input className="form-control" value={form.size} onChange={e => set('size', e.target.value)} placeholder='e.g. 2", 4mm' />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Unit *</label>
                <select className="form-control" value={form.unit} onChange={e => set('unit', e.target.value)}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Minimum Stock Alert</label>
                <input className="form-control" type="number" min="0" value={form.minimum_stock} onChange={e => set('minimum_stock', e.target.value)} />
              </div>
            </div>
            {!product && (
              <div className="card" style={{boxShadow:'none', marginBottom:'16px'}}>
                <div className="card-header">
                  <span className="card-title">Opening IN / Procurement Details</span>
                </div>
                <div className="card-body">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Opening Quantity</label>
                      <input className="form-control" type="number" min="0" step="0.01" value={form.opening_stock} onChange={e => set('opening_stock', e.target.value)} placeholder="0" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Rate / Unit Price</label>
                      <input className="form-control" type="number" min="0" step="0.01" value={form.rate} onChange={e => set('rate', e.target.value)} required={openingQty > 0} placeholder="0.00" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Supplier Name</label>
                      <input className="form-control" value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)} required={openingQty > 0} placeholder="Supplier / Vendor" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Purchase Date</label>
                      <input className="form-control" type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} required={openingQty > 0} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Challan / Invoice Number</label>
                    <input className="form-control" value="Auto generated after submit" disabled />
                  </div>
                  {openingQty > 0 && (
                    <div className="alert alert-success" style={{marginBottom:0}}>
                      <strong>Total Amount: ৳ {openingTotal.toLocaleString('en-BD', {minimumFractionDigits: 2})}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-control" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Product'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Inventory() {
  const { projectId } = useParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ search: '', category_id: '', low_stock: '' });
  const { hasPermission } = useAuth();
  const importRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([getProducts({ ...filters, project_id: projectId }), getCategories()]);
      setProducts(pRes.data);
      setCategories(cRes.data);
    } catch { toast.error('Failed to load inventory'); }
    finally { setLoading(false); }
  }, [filters, projectId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try { await deleteProduct(p.id); toast.success('Product deleted'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to delete'); }
  };

  const handleImport = async (file) => {
    if (!file) return;
    try {
      const rows = parseCsv(await readTextFile(file));
      if (!rows.length) return toast.error('CSV file is empty');

      const categoryByName = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));
      let created = 0;

      for (const row of rows) {
        const name = row.name || row.product_name || row.product;
        if (!name) continue;

        let categoryId = row.category_id || '';
        const categoryName = row.category || row.category_name;
        if (!categoryId && categoryName) {
          const key = categoryName.toLowerCase();
          categoryId = categoryByName.get(key);
          if (!categoryId) {
            const res = await createCategory({ name: categoryName });
            categoryId = res.data.id;
            categoryByName.set(key, categoryId);
          }
        }

        await createProduct({
          project_id: projectId,
          name,
          category_id: categoryId || null,
          size: row.size || '',
          unit: row.unit || 'Piece',
          opening_stock: row.opening_stock || row.stock || 0,
          supplier_name: row.supplier_name || row.supplier || '',
          purchase_date: row.purchase_date || row.date || today(),
          rate: row.rate || row.unit_price || '',
          minimum_stock: row.minimum_stock || row.min_stock || 0,
          description: row.description || row.remarks || ''
        });
        created += 1;
      }

      toast.success(`${created} product(s) imported`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to import products');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const stockColor = (p) => {
    if (p.minimum_stock > 0 && p.current_stock <= p.minimum_stock) return 'var(--danger)';
    if (p.current_stock <= p.minimum_stock * 1.5) return 'var(--warning)';
    return 'var(--success)';
  };

  const stockPct = (p) => {
    const totalIn = Number(p.total_in || 0);
    if (totalIn > 0) return Math.max(0, Math.min(100, Math.round((p.current_stock / totalIn) * 100)));
    if (!p.minimum_stock) return 0;
    return Math.max(0, Math.min(100, Math.round((p.current_stock / p.minimum_stock) * 100)));
  };

  return (
    <div>
      <div className="page-header">
        <h2>Inventory</h2>
        <div className="header-actions">
          {hasPermission('Add Products') && (
            <>
              <input ref={importRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => handleImport(e.target.files?.[0])} />
              <button className="btn btn-secondary" onClick={() => importRef.current?.click()}>Import CSV</button>
            </>
          )}
          {hasPermission('Add Products') && <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>+ Add Product</button>}
        </div>
      </div>
      <div className="page-content">
        <div className="filters">
          <input className="form-control search-input" placeholder="Search products..." value={filters.search} onChange={e => setFilters(p => ({...p, search: e.target.value}))} />
          <select className="form-control" value={filters.category_id} onChange={e => setFilters(p => ({...p, category_id: e.target.value}))}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="form-control" value={filters.low_stock} onChange={e => setFilters(p => ({...p, low_stock: e.target.value}))}>
            <option value="">All Stock</option>
            <option value="true">Low Stock Only</option>
          </select>
        </div>

        <div className="card">
          <div className="table-container">
            {loading ? (
              <div className="page-loading"><div className="spinner"></div></div>
            ) : products.length === 0 ? (
              <div className="empty-state">No products found</div>
            ) : (
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th>Product</th><th>Category</th><th>Size</th><th>Unit</th>
                    <th>Total IN</th><th>Total OUT</th><th>Balance</th>
                    <th>Min Stock</th><th>Stock Level</th>
                    {hasPermission('Edit Products') || hasPermission('Delete Products') ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} className="no-hover">
                      <td data-label="Product"><strong>{p.name}</strong>{p.description && <div className="text-muted" style={{fontSize:'11px'}}>{p.description}</div>}</td>
                      <td data-label="Category">{p.category_name ? <span className="badge badge-info">{p.category_name}</span> : '—'}</td>
                      <td data-label="Size">{p.size || '—'}</td>
                      <td data-label="Unit">{p.unit}</td>
                      <td data-label="Total IN" className="text-success fw-600">{Number(p.total_in || 0).toLocaleString()}</td>
                      <td data-label="Total OUT" className="text-danger fw-600">{Number(p.total_out || 0).toLocaleString()}</td>
                      <td data-label="Balance">
                        <strong style={{color: stockColor(p)}}>{Number(p.current_stock).toLocaleString()}</strong>
                        {p.minimum_stock > 0 && p.current_stock <= p.minimum_stock && <span className="badge badge-danger" style={{marginLeft:'6px'}}>LOW</span>}
                      </td>
                      <td data-label="Min Stock" className="text-muted">{p.minimum_stock}</td>
                      <td data-label="Stock Level" style={{minWidth:'120px'}}>
                        <div className="stock-bar">
                          <div className="stock-bar-bg">
                            <div className="stock-bar-fill" style={{width:`${stockPct(p)}%`, background: stockColor(p)}}></div>
                          </div>
                          <span style={{fontSize:'11px',color:'var(--text3)',minWidth:'30px'}}>{stockPct(p)}%</span>
                        </div>
                      </td>
                      {(hasPermission('Edit Products') || hasPermission('Delete Products')) && (
                        <td data-label="Actions">
                          <div className="flex gap-2">
                            {hasPermission('Edit Products') && <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(p); setShowModal(true); }}>Edit</button>}
                            {hasPermission('Delete Products') && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>Del</button>}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <ProductModal projectId={projectId} product={editing} categories={categories} onSave={() => { setShowModal(false); load(); }} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}
