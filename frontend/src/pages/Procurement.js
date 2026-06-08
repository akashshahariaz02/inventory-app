import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getProcurements, createProcurement, deleteProcurement, getProducts, getCategories, createProduct } from '../api';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { useParams } from 'react-router-dom';

const UNIT_OPTIONS = ['Nos', 'Cu.m', 'Rolls', 'Feet', 'Meter', 'Piece', 'Kg', 'Liter', 'Box', 'Roll'];
const NEW_PRODUCT_VALUE = '__new_product__';

function ProcurementModal({ projectId, products, categories, onSave, onClose }) {
  const [form, setForm] = useState({ product_id: '', supplier_name: '', purchase_date: format(new Date(), 'yyyy-MM-dd'), quantity: '', rate: '', remarks: '' });
  const [newProduct, setNewProduct] = useState({ name: '', category_id: '', size: '', unit: '', minimum_stock: 0, description: '' });
  const [productSearch, setProductSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const isNewProduct = form.product_id === NEW_PRODUCT_VALUE;
  const total = (parseFloat(form.quantity) || 0) * (parseFloat(form.rate) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let productId = form.product_id;
      if (!productId || !form.purchase_date || !form.quantity || !form.rate) {
        toast.error('Please select a product, quantity, rate, and purchase date before saving.');
        setSaving(false);
        return;
      }
      if (isNewProduct) {
        if (!newProduct.name.trim()) {
          toast.error('Product name is required');
          setSaving(false);
          return;
        }
        const created = await createProduct({ ...newProduct, project_id: projectId, category_id: newProduct.category_id || null, opening_stock: 0 });
        productId = created.data.id;
      }

      const res = await createProcurement({ ...form, project_id: projectId, product_id: productId });
      toast.success(`Procurement added! ${res.data.challan_number}`);
      onSave();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setProduct = (k, v) => setNewProduct(p => ({ ...p, [k]: v }));

  const handleProductSearch = (value) => {
    setProductSearch(value);
    set('product_id', '');
    setShowSuggestions(true);
  };

  const filteredProducts = products.filter(product => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return false;
    const label = `${product.name}${product.size ? ` (${product.size})` : ''}`.toLowerCase();
    const displayLabel = `${product.name} — Stock: ${product.current_stock} ${product.unit}`.toLowerCase();
    return label.includes(query) || displayLabel.includes(query) || query.includes(label) || query.includes(displayLabel);
  }).slice(0, 8);

  const selectProduct = (product) => {
    setProductSearch(`${product.name}${product.size ? ` (${product.size})` : ''} — Stock: ${product.current_stock} ${product.unit}`);
    set('product_id', product.id);
    setShowSuggestions(false);
  };

  useEffect(() => {
    if (form.product_id === NEW_PRODUCT_VALUE) {
      setProductSearch('+ Add new product...');
      return;
    }

    const match = products.find(p => p.id === form.product_id);
    if (match) {
      setProductSearch(`${match.name}${match.size ? ` (${match.size})` : ''} — Stock: ${match.current_stock} ${match.unit}`);
    }
  }, [form.product_id, products]);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">New Procurement (IN)</h3>
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
                <ul className="dropdown-menu show" style={{ display: 'block', maxHeight: '220px', overflowY: 'auto', width: '100%', position: 'static', marginTop: '4px' }}>
                  {filteredProducts.map(product => (
                    <li key={product.id}>
                      <button type="button" className="dropdown-item" onMouseDown={e => e.preventDefault()} onClick={() => selectProduct(product)}>
                        {product.name}{product.size ? ` (${product.size})` : ''} — Stock: {product.current_stock} {product.unit}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {isNewProduct && (
              <div className="card" style={{boxShadow:'none', marginBottom:'16px'}}>
                <div className="card-header">
                  <span className="card-title">New Product Details</span>
                </div>
                <div className="card-body">
                  <div className="form-group">
                    <label className="form-label">Product Name *</label>
                    <input className="form-control" value={newProduct.name} onChange={e => setProduct('name', e.target.value)} required={isNewProduct} placeholder="e.g. HDPE pipe SDR17" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Category</label>
                      <select className="form-control" value={newProduct.category_id} onChange={e => setProduct('category_id', e.target.value)}>
                        <option value="">Select category</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Size / Diameter</label>
                      <input className="form-control" value={newProduct.size} onChange={e => setProduct('size', e.target.value)} placeholder="e.g. OD 800, DN700" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Unit *</label>
                      <input className="form-control" list="procurement-unit-options" value={newProduct.unit} onChange={e => setProduct('unit', e.target.value)} placeholder="Select or type unit" required={isNewProduct} />
                      <datalist id="procurement-unit-options">
                        {UNIT_OPTIONS.map(unit => <option key={unit} value={unit} />)}
                      </datalist>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Minimum Stock Alert</label>
                      <input className="form-control" type="number" min="0" value={newProduct.minimum_stock} onChange={e => setProduct('minimum_stock', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea className="form-control" value={newProduct.description} onChange={e => setProduct('description', e.target.value)} placeholder="Optional notes" />
                  </div>
                </div>
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Supplier Name</label>
                <input className="form-control" value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)} placeholder="Supplier / Vendor" />
              </div>
              <div className="form-group">
                <label className="form-label">Purchase Date *</label>
                <input className="form-control" type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Challan / Invoice Number</label>
              <input className="form-control" value="Auto generated after submit" disabled />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Quantity *</label>
                <input className="form-control" type="number" min="0.01" step="0.01" value={form.quantity} onChange={e => set('quantity', e.target.value)} required placeholder="e.g. 1721" />
              </div>
              <div className="form-group">
                <label className="form-label">Rate (per unit)</label>
                <input className="form-control" type="number" min="0" step="0.01" value={form.rate} onChange={e => set('rate', e.target.value)} placeholder="0.00" required />
              </div>
            </div>
            {total > 0 && (
              <div className="alert alert-success" style={{marginBottom:'12px'}}>
                <strong>Total Amount: ৳ {total.toLocaleString('en-BD', {minimumFractionDigits: 2})}</strong>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Remarks</label>
              <textarea className="form-control" value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Optional notes..." />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : '✓ Add Procurement'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Procurement() {
  const { projectId } = useParams();
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const { hasPermission } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, pRes] = await Promise.all([
        getProcurements({ project_id: projectId, search, from_date: fromDate, to_date: toDate }),
        getProducts({ project_id: projectId })
      ]);
      setItems(iRes.data);
      setProducts(pRes.data);
      const cRes = await getCategories();
      setCategories(cRes.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [projectId, search, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this procurement? Stock will be reverted.')) return;
    try { await deleteProcurement(id); toast.success('Deleted & stock reverted'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const totalAmount = items.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h2>IN / Procurement</h2>
        <div className="header-actions">
          {hasPermission('Add Procurement (IN)') && <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Entry</button>}
        </div>
      </div>
      <div className="page-content">
        <div className="metrics-grid" style={{gridTemplateColumns:'repeat(3,1fr)', marginBottom:'16px'}}>
          <div className="metric-card success">
            <div className="metric-label">Total Entries</div>
            <div className="metric-value">{items.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Quantity</div>
            <div className="metric-value">{totalQty.toLocaleString()}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Value</div>
            <div className="metric-value">৳ {totalAmount.toLocaleString()}</div>
          </div>
        </div>

        <div className="filters">
          <input className="form-control search-input" placeholder="Search product, supplier, challan..." value={search} onChange={e => setSearch(e.target.value)} />
          <input className="form-control" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <input className="form-control" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          {(fromDate || toDate) && <button className="btn btn-secondary btn-sm" onClick={() => { setFromDate(''); setToDate(''); }}>Clear</button>}
        </div>

        <div className="card">
          <div className="table-container">
            {loading ? <div className="page-loading"><div className="spinner"></div></div> : (
              <table>
                <thead>
                  <tr><th>Date</th><th>Product</th><th>Supplier</th><th>Challan</th><th>Quantity</th><th>Rate</th><th>Total</th><th>Remarks</th>{hasPermission('Delete Products') && <th></th>}</tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr className="no-hover"><td colSpan={9} className="text-muted" style={{textAlign:'center',padding:'40px'}}>No procurement entries found</td></tr>
                  ) : items.map(item => (
                    <tr key={item.id} className="no-hover">
                      <td className="text-muted">{item.purchase_date}</td>
                      <td><strong>{item.product_name}</strong>{item.size && <span className="text-muted"> {item.size}</span>}</td>
                      <td>{item.supplier_name || '—'}</td>
                      <td>{item.challan_number || '—'}</td>
                      <td className="text-success fw-600">+{Number(item.quantity).toLocaleString()} {item.unit}</td>
                      <td>{item.rate ? `৳ ${item.rate}` : '—'}</td>
                      <td className="fw-600">{item.total_amount ? `৳ ${Number(item.total_amount).toLocaleString()}` : '—'}</td>
                      <td className="text-muted" style={{maxWidth:'150px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.remarks || '—'}</td>
                      {hasPermission('Delete Products') && <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.id)}>Del</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showModal && <ProcurementModal projectId={projectId} products={products} categories={categories} onSave={() => { setShowModal(false); load(); }} onClose={() => setShowModal(false)} />}
    </div>
  );
}
