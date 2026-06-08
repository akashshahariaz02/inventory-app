const express = require('express');
const { db } = require('../database');
const { authenticateToken, requireRole, requireProjectAccess, hasProjectAccess } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

// Dashboard summary
router.get('/dashboard', authenticateToken, requireProjectAccess(req => req.query.project_id), (req, res) => {
  const { project_id, category_id } = req.query;
  const projectWhere = project_id ? 'WHERE project_id = ?' : '';
  const projectParams = project_id ? [project_id] : [];
  const totalProducts = db.prepare(`SELECT COUNT(*) as count FROM products ${projectWhere}`).get(...projectParams).count;
  const totalStock = db.prepare(`SELECT SUM(current_stock) as total FROM products ${projectWhere}`).get(...projectParams).total || 0;
  const lowStockItems = db.prepare(`SELECT COUNT(*) as count FROM products WHERE current_stock <= minimum_stock AND minimum_stock > 0${project_id ? ' AND project_id = ?' : ''}`).get(...projectParams).count;
  const pendingRequests = db.prepare(`SELECT COUNT(*) as count FROM requests WHERE status = 'pending'${project_id ? ' AND project_id = ?' : ''}`).get(...projectParams).count;

  const lowStockProducts = db.prepare(`
    SELECT p.name, p.size, p.unit, p.current_stock, p.minimum_stock, c.name as category
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.current_stock <= p.minimum_stock AND p.minimum_stock > 0${project_id ? ' AND p.project_id = ?' : ''}
    ORDER BY p.current_stock ASC LIMIT 10
  `).all(...projectParams);

  const recentActivity = db.prepare(`
    SELECT *
    FROM (
      SELECT 'IN' as type, pr.purchase_date as date, p.name as product_name, p.unit, pr.quantity, pr.supplier_name as party, pr.created_at as created_at
      FROM procurements pr JOIN products p ON pr.product_id = p.id
      ${project_id ? 'WHERE pr.project_id = ?' : ''}
      UNION ALL
      SELECT 'OUT' as type, i.issue_date as date, p.name as product_name, p.unit, i.quantity, i.issued_to as party, i.created_at as created_at
      FROM issues i JOIN products p ON i.product_id = p.id
      ${project_id ? 'WHERE i.project_id = ?' : ''}
    )
    ORDER BY created_at DESC
    LIMIT 10
  `).all(...(project_id ? [project_id, project_id] : []));

  const categoryFilter = `${project_id ? ' AND procurements.project_id = ?' : ''}${category_id ? ' AND p.category_id = ?' : ''}`;
  const categoryParams = [...(project_id ? [project_id] : []), ...(category_id ? [category_id] : [])];

  const monthlyData = db.prepare(`
    SELECT 
      strftime('%Y-%m', purchase_date) as month,
      SUM(quantity) as total_in,
      SUM(total_amount) as total_amount
    FROM procurements
    JOIN products p ON procurements.product_id = p.id
    WHERE purchase_date >= date('now', '-12 months')${categoryFilter}
    GROUP BY strftime('%Y-%m', purchase_date)
    ORDER BY month
  `).all(...categoryParams);

  const monthlyOutParams = [...(project_id ? [project_id] : []), ...(category_id ? [category_id] : [])];
  const monthlyOut = db.prepare(`
    SELECT strftime('%Y-%m', issue_date) as month, SUM(quantity) as total_out
    FROM issues
    JOIN products p ON issues.product_id = p.id
    WHERE issue_date >= date('now', '-12 months')${project_id ? ' AND issues.project_id = ?' : ''}${category_id ? ' AND p.category_id = ?' : ''}
    GROUP BY strftime('%Y-%m', issue_date) ORDER BY month
  `).all(...monthlyOutParams);

  res.json({ totalProducts, totalStock, lowStockItems, pendingRequests, lowStockProducts, recentActivity, monthlyData, monthlyOut });
});

// Full report
router.get('/summary', authenticateToken, requireProjectAccess(req => req.query.project_id), (req, res) => {
  const { project_id, from_date, to_date, period } = req.query;
  let fromDate = from_date;
  let toDate = to_date || new Date().toISOString().split('T')[0];

  if (!fromDate) {
    const now = new Date();
    if (period === 'weekly') fromDate = new Date(now.setDate(now.getDate() - 7)).toISOString().split('T')[0];
    else if (period === 'yearly') fromDate = new Date(now.setFullYear(now.getFullYear() - 1)).toISOString().split('T')[0];
    else fromDate = new Date(new Date().setDate(1)).toISOString().split('T')[0]; // monthly default
  }

  const productReport = db.prepare(`
    SELECT 
      p.name as product_name, p.size, p.unit, c.name as category,
      p.opening_stock,
      COALESCE((SELECT SUM(quantity) FROM procurements WHERE product_id = p.id AND purchase_date BETWEEN ? AND ?), 0) as period_in,
      COALESCE((SELECT SUM(quantity) FROM issues WHERE product_id = p.id AND issue_date BETWEEN ? AND ?), 0) as period_out,
      p.current_stock as closing_balance,
      p.minimum_stock
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE 1=1${project_id ? ' AND p.project_id = ?' : ''}
    ORDER BY p.name
  `).all(fromDate, toDate, fromDate, toDate, ...(project_id ? [project_id] : []));

  const totals = db.prepare(`
    SELECT 
      (SELECT COALESCE(SUM(total_amount), 0) FROM procurements WHERE purchase_date BETWEEN ? AND ?${project_id ? ' AND project_id = ?' : ''}) as total_procurement_value,
      (SELECT COALESCE(SUM(quantity), 0) FROM procurements WHERE purchase_date BETWEEN ? AND ?${project_id ? ' AND project_id = ?' : ''}) as total_procured_qty,
      (SELECT COALESCE(SUM(quantity), 0) FROM issues WHERE issue_date BETWEEN ? AND ?${project_id ? ' AND project_id = ?' : ''}) as total_issued_qty
  `).get(
    fromDate, toDate, ...(project_id ? [project_id] : []),
    fromDate, toDate, ...(project_id ? [project_id] : []),
    fromDate, toDate, ...(project_id ? [project_id] : [])
  );

  res.json({ fromDate, toDate, period: period || 'monthly', productReport, totals });
});

// Audit log
router.get('/audit', authenticateToken, requireRole('admin'), (req, res) => {
  const logs = db.prepare(`
    SELECT al.*, u.name as user_name, u.email as user_email FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC LIMIT 100
  `).all();
  res.json(logs);
});

// Quotations
router.get('/quotations', authenticateToken, requireProjectAccess(req => req.query.project_id), (req, res) => {
  const { project_id, product_id, status } = req.query;
  let q = `SELECT qt.*, COALESCE(p.name, qt.product_name) as product_name FROM quotations qt LEFT JOIN products p ON qt.product_id = p.id WHERE 1=1`;
  const params = [];
  if (project_id) { q += ' AND qt.project_id = ?'; params.push(project_id); }
  if (product_id) { q += ' AND qt.product_id = ?'; params.push(product_id); }
  if (status) { q += ' AND qt.status = ?'; params.push(status); }
  q += ' ORDER BY qt.created_at DESC';
  res.json(db.prepare(q).all(...params));
});

router.post('/quotations', authenticateToken, requireRole('admin', 'store_manager'), requireProjectAccess(req => req.body.project_id), (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const { project_id, product_id, product_name, supplier_name, quote_date, quantity, rate, delivery_days, payment_terms, validity_days, notes } = req.body;
  if (!project_id || !supplier_name || !quote_date || !quantity || !rate) return res.status(400).json({ error: 'project_id, supplier_name, quote_date, quantity, rate required' });
  const qty = parseFloat(quantity);
  const unitRate = parseFloat(rate);
  if (qty <= 0 || unitRate < 0) return res.status(400).json({ error: 'quantity must be greater than 0 and rate cannot be negative' });
  const id = uuidv4();
  db.prepare(`
    INSERT INTO quotations (id, project_id, product_id, product_name, supplier_name, quote_date, quantity, rate, total_amount, delivery_days, payment_terms, validity_days, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, project_id, product_id || null, product_name, supplier_name, quote_date, qty, unitRate, qty * unitRate, delivery_days || null, payment_terms, validity_days || 30, notes, req.user.id);
  logAudit(db, req.user.id, 'CREATE', 'quotations', id, null, { ...req.body, total_amount: qty * unitRate }, notes || 'Quotation added');
  res.status(201).json({ message: 'Quotation added', id });
});

router.put('/quotations/:id', authenticateToken, requireRole('admin', 'store_manager'), (req, res) => {
  const qt = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id);
  if (!qt) return res.status(404).json({ error: 'Quotation not found' });
  if (!hasProjectAccess(req.user.id, req.user.role, qt.project_id)) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }

  const { product_id, product_name, supplier_name, quote_date, quantity, rate, delivery_days, payment_terms, validity_days, notes } = req.body;
  if (!supplier_name || !quote_date || !quantity || !rate) return res.status(400).json({ error: 'supplier_name, quote_date, quantity, rate required' });
  const qty = parseFloat(quantity);
  const unitRate = parseFloat(rate);
  if (qty <= 0 || unitRate < 0) return res.status(400).json({ error: 'quantity must be greater than 0 and rate cannot be negative' });

  db.prepare(`
    UPDATE quotations
    SET product_id = ?, product_name = ?, supplier_name = ?, quote_date = ?, quantity = ?, rate = ?, total_amount = ?, delivery_days = ?, payment_terms = ?, validity_days = ?, notes = ?
    WHERE id = ?
  `).run(product_id || null, product_name, supplier_name, quote_date, qty, unitRate, qty * unitRate, delivery_days || null, payment_terms, validity_days || 30, notes, req.params.id);
  logAudit(db, req.user.id, 'UPDATE', 'quotations', req.params.id, qt, { ...req.body, total_amount: qty * unitRate }, notes || 'Quotation updated');

  res.json({ message: 'Quotation updated' });
});

router.delete('/quotations/:id', authenticateToken, requireRole('admin', 'store_manager'), (req, res) => {
  const qt = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id);
  if (!qt) return res.status(404).json({ error: 'Quotation not found' });
  if (!hasProjectAccess(req.user.id, req.user.role, qt.project_id)) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  if (qt.status === 'selected') return res.status(400).json({ error: 'Selected quotation cannot be deleted' });

  db.prepare('DELETE FROM quotations WHERE id = ?').run(req.params.id);
  logAudit(db, req.user.id, 'DELETE', 'quotations', req.params.id, qt, null, 'Quotation deleted');
  res.json({ message: 'Quotation deleted' });
});

router.patch('/quotations/:id/select', authenticateToken, requireRole('admin', 'store_manager'), (req, res) => {
  const qt = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id);
  if (!qt) return res.status(404).json({ error: 'Quotation not found' });
  if (!hasProjectAccess(req.user.id, req.user.role, qt.project_id)) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  // Deselect others for same product
  if (qt.product_id) db.prepare("UPDATE quotations SET status='rejected' WHERE product_id = ? AND id != ?").run(qt.product_id, req.params.id);
  db.prepare("UPDATE quotations SET status='selected' WHERE id=?").run(req.params.id);
  logAudit(db, req.user.id, 'UPDATE', 'quotations', req.params.id, qt, { status: 'selected' }, 'Quotation selected');
  res.json({ message: 'Quotation selected' });
});

module.exports = router;
