import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { getProcurements, createProcurement, deleteProcurement, getProducts, getCategories, createProduct, createCategory } from '../api';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { useParams } from 'react-router-dom';
import { parseCsv, readTextFile } from '../utils/csv';

const UNIT_OPTIONS = ['Nos', 'Cu.m', 'Rolls', 'Feet', 'Meter', 'Piece', 'Kg', 'Liter', 'Box', 'Roll'];
const NEW_PRODUCT_VALUE = '__new_product__';
const ADD_CATEGORY_VALUE = '__add_category__';
const ADD_UNIT_VALUE = '__add_unit__';

function ProcurementModal({ projectId, products, categories, onSave, onClose }) {
  const [form, setForm] = useState({ product_id: '', supplier_name: '', purchase_date: format(new Date(), 'yyyy-MM-dd'), challan_number: '', quantity: '', rate: '', remarks: '' });
  const [newProduct, setNewProduct] = useState({ name: '', category_id: '', size: '', unit: 'Piece', minimum_stock: 0, description: '' });
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingUnit, setAddingUnit] = useState(false);
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
      if (!productId || !form.purchase_date || !form.challan_number?.trim() || !form.quantity || !form.rate) {
        toast.error('Please select a product and enter quantity, rate, purchase date, and challan / invoice number before saving.');
        setSaving(false);
        return;
      }
      if (isNewProduct) {
        if (!newProduct.name.trim()) {
          toast.error('Product name is required');
          setSaving(false);
          return;
        }
        if (!newProduct.unit?.trim()) {
          toast.error('Unit is required');
          setSaving(false);
          return;
        }
        if (addingCategory && !newCategoryName.trim()) {
          toast.error('New category name is required');
          setSaving(false);
          return;
        }
        if (!form.supplier_name?.trim()) {
          toast.error('Supplier name is required when adding a new product with IN quantity.');
          setSaving(false);
          return;
        }
        let categoryId = newProduct.category_id || null;
        if (addingCategory) {
          const category = await createCategory({ name: newCategoryName.trim() });
          categoryId = category.data.id;
        }
        const created = await createProduct({
          ...newProduct,
          project_id: projectId,
          category_id: categoryId,
          opening_stock: form.quantity,
          supplier_name: form.supplier_name,
          purchase_date: form.purchase_date,
          challan_number: form.challan_number,
          rate: form.rate,
          remarks: newProduct.description
        });
        toast.success(`Product and procurement added! ${created.data.challan_number || form.challan_number}`);
        onSave();
        return;
      }

      const res = await createProcurement({ ...form, project_id: projectId, product_id: productId });
      toast.success(`Procurement added! ${res.data.challan_number}`);
      onSave();
    } catch (err) { toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setProduct = (k, v) => setNewProduct(p => ({ ...p, [k]: v }));
  const handleNewProductCategory = (value) => {
    if (value === ADD_CATEGORY_VALUE) {
      setAddingCategory(true);
      setProduct('category_id', '');
      return;
    }
    setAddingCategory(false);
    setNewCategoryName('');
    setProduct('category_id', value);
  };
  const handleNewProductUnit = (value) => {
    if (value === ADD_UNIT_VALUE) {
      setAddingUnit(true);
      setProduct('unit', '');
      return;
    }
    setAddingUnit(false);
    setProduct('unit', value);
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
    const displayLabel = `${product.name} — Stock: ${product.current_stock} ${product.unit}`.toLowerCase();
    return label.includes(query) || displayLabel.includes(query) || query.includes(label) || query.includes(displayLabel);
  }).slice(0, 8);

  const selectProduct = (product) => {
    setProductSearch(`${product.name}${product.size ? ` (${product.size})` : ''} — Stock: ${product.current_stock} ${product.unit}`);
    set('product_id', product.id);
    setShowSuggestions(false);
  };

  const selectNewProduct = () => {
    const typedName = productSearch.trim();
    setProduct('name', typedName);
    setProductSearch(typedName ? `Add new product: ${typedName}` : 'Add new product');
    set('product_id', NEW_PRODUCT_VALUE);
    setShowSuggestions(false);
  };

  useEffect(() => {
    if (form.product_id === NEW_PRODUCT_VALUE) {
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
              {showSuggestions && productSearch.trim() && (
                <ul className="product-suggest-menu">
                  {filteredProducts.map(product => (
                    <li key={product.id}>
                      <button type="button" className="product-suggest-item" onMouseDown={e => e.preventDefault()} onClick={() => selectProduct(product)}>
                        {product.name}{product.size ? ` (${product.size})` : ''} — Stock: {product.current_stock} {product.unit}
                      </button>
                    </li>
                  ))}
                  {filteredProducts.length === 0 && (
                    <li>
                      <div className="product-suggest-empty">
                        No matching product found
                      </div>
                    </li>
                  )}
                  <li>
                    <button type="button" className="product-suggest-add" onMouseDown={e => e.preventDefault()} onClick={selectNewProduct}>
                      <span>+ Add new product</span>
                      {productSearch.trim() && <strong>{productSearch.trim()}</strong>}
                    </button>
                  </li>
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
                      <select className="form-control" value={addingCategory ? ADD_CATEGORY_VALUE : (newProduct.category_id || '')} onChange={e => handleNewProductCategory(e.target.value)}>
                        <option value="">Select category</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        <option value={ADD_CATEGORY_VALUE}>+ Add new category</option>
                      </select>
                      {addingCategory && (
                        <input className="form-control" style={{marginTop:'8px'}} value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="New category name" required={isNewProduct} />
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Size / Diameter</label>
                      <input className="form-control" value={newProduct.size} onChange={e => setProduct('size', e.target.value)} placeholder="e.g. OD 800, DN700" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Unit *</label>
                      <select className="form-control" value={addingUnit ? ADD_UNIT_VALUE : newProduct.unit} onChange={e => handleNewProductUnit(e.target.value)}>
                        {UNIT_OPTIONS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                        <option value={ADD_UNIT_VALUE}>+ Add new unit</option>
                      </select>
                      {addingUnit && (
                        <input className="form-control" style={{marginTop:'8px'}} value={newProduct.unit} onChange={e => setProduct('unit', e.target.value)} placeholder="New unit name" required={isNewProduct} />
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Quantity</label>
                      <input className="form-control" type="number" min="1" step="1" value={form.quantity} onChange={e => set('quantity', e.target.value)} required placeholder="e.g. 1721" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Rate / Unit Price</label>
                      <input className="form-control" type="number" min="0" step="0.01" value={form.rate} onChange={e => set('rate', e.target.value)} placeholder="0.00" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Minimum Stock Alert</label>
                      <input className="form-control" type="number" min="0" value={newProduct.minimum_stock} onChange={e => setProduct('minimum_stock', e.target.value)} />
                    </div>
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
              <input className="form-control" value={form.challan_number} onChange={e => set('challan_number', e.target.value)} required placeholder="Enter challan / invoice number" />
            </div>
            {isNewProduct && (
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-control" value={newProduct.description} onChange={e => setProduct('description', e.target.value)} placeholder="Optional notes" />
              </div>
            )}
            {!isNewProduct && (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Quantity *</label>
                  <input className="form-control" type="number" min="1" step="1" value={form.quantity} onChange={e => set('quantity', e.target.value)} required placeholder="e.g. 1721" />
                </div>
                <div className="form-group">
                  <label className="form-label">Rate / Unit Price</label>
                  <input className="form-control" type="number" min="0" step="0.01" value={form.rate} onChange={e => set('rate', e.target.value)} placeholder="0.00" required />
                </div>
              </div>
            )}
            {total > 0 && (
              <div className="alert alert-success" style={{marginBottom:'12px'}}>
                <strong>Total Amount: ৳ {total.toLocaleString('en-BD', {minimumFractionDigits: 2})}</strong>
              </div>
            )}
            {!isNewProduct && (
              <div className="form-group">
                <label className="form-label">Remarks</label>
                <textarea className="form-control" value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Optional notes..." />
              </div>
            )}
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
  const importRef = useRef(null);

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

  const findProductForImport = (row) => {
    if (row.product_id) return products.find(p => p.id === row.product_id);
    const name = (row.product_name || row.product || row.name || '').trim().toLowerCase();
    const size = (row.size || '').trim().toLowerCase();
    if (!name) return null;
    return products.find(p => {
      const productName = (p.name || '').trim().toLowerCase();
      const productSize = (p.size || '').trim().toLowerCase();
      return productName === name && (!size || productSize === size);
    });
  };

  const handleImport = async (file) => {
    if (!file) return;
    try {
      const rows = parseCsv(await readTextFile(file));
      if (!rows.length) return toast.error('CSV file is empty');

      let created = 0;
      let skipped = 0;
      for (const row of rows) {
        const product = findProductForImport(row);
        const quantity = row.quantity || row.qty;
        const rate = row.rate || row.unit_price;
        if (!product || !quantity || !rate) {
          skipped += 1;
          continue;
        }
        await createProcurement({
          project_id: projectId,
          product_id: product.id,
          supplier_name: row.supplier_name || row.supplier || '',
          purchase_date: row.purchase_date || row.date || format(new Date(), 'yyyy-MM-dd'),
          challan_number: row.challan_number || row.invoice_number || '',
          quantity,
          rate,
          remarks: row.remarks || row.note || ''
        });
        created += 1;
      }

      toast.success(`${created} procurement row(s) imported${skipped ? `, ${skipped} skipped` : ''}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to import procurements');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const totalAmount = items.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h2>IN / Procurement</h2>
        <div className="header-actions">
          {hasPermission('Add Procurement (IN)') && (
            <>
              <input ref={importRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => handleImport(e.target.files?.[0])} />
              <button className="btn btn-secondary" onClick={() => importRef.current?.click()}>Import CSV</button>
            </>
          )}
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
              <table className="responsive-table">
                <thead>
                  <tr><th>Date</th><th>Product</th><th>Supplier</th><th>Challan</th><th>Quantity</th><th>Rate</th><th>Total</th><th>Remarks</th>{hasPermission('Delete Products') && <th></th>}</tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr className="no-hover"><td colSpan={9} className="text-muted" style={{textAlign:'center',padding:'40px'}}>No procurement entries found</td></tr>
                  ) : items.map(item => (
                    <tr key={item.id} className="no-hover">
                      <td data-label="Date" className="text-muted">{item.purchase_date}</td>
                      <td data-label="Product"><strong>{item.product_name}</strong>{item.size && <span className="text-muted"> {item.size}</span>}</td>
                      <td data-label="Supplier">{item.supplier_name || '—'}</td>
                      <td data-label="Challan">{item.challan_number || '—'}</td>
                      <td data-label="Quantity" className="text-success fw-600">+{Number(item.quantity).toLocaleString()} {item.unit}</td>
                      <td data-label="Rate">{item.rate ? `৳ ${item.rate}` : '—'}</td>
                      <td data-label="Total" className="fw-600">{item.total_amount ? `৳ ${Number(item.total_amount).toLocaleString()}` : '—'}</td>
                      <td data-label="Remarks" className="text-muted" style={{maxWidth:'150px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.remarks || '—'}</td>
                      {hasPermission('Delete Products') && <td data-label="Actions"><button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.id)}>Del</button></td>}
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
