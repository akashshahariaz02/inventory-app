const express = require('express');
const { db } = require('../database');
const { authenticateToken, requireRole, requireProjectAccess, hasProjectAccess } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

// Dashboard summary
router.get('/dashboard', authenticateToken, requireProjectAccess(req => req.query.project_id), async (req, res) => {
  const { project_id, category_id } = req.query;
  const projectWhere = project_id ? 'WHERE project_id = ?' : '';
  const projectParams = project_id ? [project_id] : [];
  const totalProducts = (await db.get(`SELECT COUNT(*) as count FROM products ${projectWhere}`, ...projectParams)).count;
  const totalStock = (await db.get(`SELECT SUM(current_stock) as total FROM products ${projectWhere}`, ...projectParams)).total || 0;
  const lowStockItems = (await db.get(`SELECT COUNT(*) as count FROM products WHERE current_stock <= minimum_stock AND minimum_stock > 0${project_id ? ' AND project_id = ?' : ''}`, ...projectParams)).count;
  const pendingRequests = (await db.get(`SELECT COUNT(*) as count FROM requests WHERE status = 'pending'${project_id ? ' AND project_id = ?' : ''}`, ...projectParams)).count;

  const lowStockProducts = await db.all(`
    SELECT p.name, p.size, p.unit, p.current_stock, p.minimum_stock, c.name as category
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.current_stock <= p.minimum_stock AND p.minimum_stock > 0${project_id ? ' AND p.project_id = ?' : ''}
    ORDER BY p.current_stock ASC LIMIT 10
  `, ...projectParams);

  const recentActivity = await db.all(`
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
  `, ...(project_id ? [project_id, project_id] : []));

  const categoryFilter = `${project_id ? ' AND procurements.project_id = ?' : ''}${category_id ? ' AND p.category_id = ?' : ''}`;
  const categoryParams = [...(project_id ? [project_id] : []), ...(category_id ? [category_id] : [])];

  const monthlyData = await db.all(`
    SELECT 
      TO_CHAR(purchase_date, 'YYYY-MM') as month,
      SUM(quantity) as total_in,
      SUM(total_amount) as total_amount
    FROM procurements
    JOIN products p ON procurements.product_id = p.id
    WHERE purchase_date >= CURRENT_DATE - INTERVAL '12 months'${categoryFilter}
    GROUP BY TO_CHAR(purchase_date, 'YYYY-MM')
    ORDER BY month
  `, ...categoryParams);

  const monthlyOutParams = [...(project_id ? [project_id] : []), ...(category_id ? [category_id] : [])];
  const monthlyOut = await db.all(`
    SELECT TO_CHAR(issue_date, 'YYYY-MM') as month, SUM(quantity) as total_out
    FROM issues
    JOIN products p ON issues.product_id = p.id
    WHERE issue_date >= CURRENT_DATE - INTERVAL '12 months'${project_id ? ' AND issues.project_id = ?' : ''}${category_id ? ' AND p.category_id = ?' : ''}
    GROUP BY TO_CHAR(issue_date, 'YYYY-MM') ORDER BY month
  `, ...monthlyOutParams);

  res.json({ totalProducts, totalStock, lowStockItems, pendingRequests, lowStockProducts, recentActivity, monthlyData, monthlyOut });
});

// Full report
router.get('/summary', authenticateToken, requireProjectAccess(req => req.query.project_id), async (req, res) => {
  const { project_id, from_date, to_date, period } = req.query;
  let fromDate = from_date;
  let toDate = to_date || new Date().toISOString().split('T')[0];

  if (!fromDate) {
    const now = new Date();
    if (period === 'weekly') fromDate = new Date(now.setDate(now.getDate() - 7)).toISOString().split('T')[0];
    else if (period === 'yearly') fromDate = new Date(now.setFullYear(now.getFullYear() - 1)).toISOString().split('T')[0];
    else fromDate = new Date(new Date().setDate(1)).toISOString().split('T')[0]; // monthly default
  }

  const productReport = await db.all(`
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
  `, fromDate, toDate, fromDate, toDate, ...(project_id ? [project_id] : []));

  const totals = await db.get(`
    SELECT 
      (SELECT COALESCE(SUM(total_amount), 0) FROM procurements WHERE purchase_date BETWEEN ? AND ?${project_id ? ' AND project_id = ?' : ''}) as total_procurement_value,
      (SELECT COALESCE(SUM(quantity), 0) FROM procurements WHERE purchase_date BETWEEN ? AND ?${project_id ? ' AND project_id = ?' : ''}) as total_procured_qty,
      (SELECT COALESCE(SUM(quantity), 0) FROM issues WHERE issue_date BETWEEN ? AND ?${project_id ? ' AND project_id = ?' : ''}) as total_issued_qty
  `,
    fromDate, toDate, ...(project_id ? [project_id] : []),
    fromDate, toDate, ...(project_id ? [project_id] : []),
    fromDate, toDate, ...(project_id ? [project_id] : [])
  );

  const categoryTotals = await db.all(`
    SELECT
      COALESCE(c.name, 'Uncategorized') as category,
      COUNT(DISTINCT p.id) as products,
      COALESCE(SUM(p.current_stock), 0) as balance,
      COALESCE(SUM(pin.total_in), 0) as total_in,
      COALESCE(SUM(pout.total_out), 0) as total_out,
      COALESCE(SUM(pin.total_value), 0) as total_value
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN (
      SELECT product_id, SUM(quantity) as total_in, SUM(total_amount) as total_value
      FROM procurements
      WHERE purchase_date BETWEEN ? AND ?${project_id ? ' AND project_id = ?' : ''}
      GROUP BY product_id
    ) pin ON pin.product_id = p.id
    LEFT JOIN (
      SELECT product_id, SUM(quantity) as total_out
      FROM issues
      WHERE issue_date BETWEEN ? AND ?${project_id ? ' AND project_id = ?' : ''}
      GROUP BY product_id
    ) pout ON pout.product_id = p.id
    WHERE 1=1${project_id ? ' AND p.project_id = ?' : ''}
    GROUP BY COALESCE(c.name, 'Uncategorized')
    ORDER BY category
  `,
    fromDate, toDate, ...(project_id ? [project_id] : []),
    fromDate, toDate, ...(project_id ? [project_id] : []),
    ...(project_id ? [project_id] : [])
  );

  const supplierTotals = await db.all(`
    SELECT
      COALESCE(NULLIF(TRIM(supplier_name), ''), 'Unknown Supplier') as supplier_name,
      COUNT(*) as entries,
      COALESCE(SUM(quantity), 0) as total_qty,
      COALESCE(SUM(total_amount), 0) as total_value
    FROM procurements
    WHERE purchase_date BETWEEN ? AND ?${project_id ? ' AND project_id = ?' : ''}
    GROUP BY COALESCE(NULLIF(TRIM(supplier_name), ''), 'Unknown Supplier')
    ORDER BY total_value DESC, supplier_name
  `, fromDate, toDate, ...(project_id ? [project_id] : []));

  const dateTotals = await db.all(`
    SELECT TO_CHAR(day_date, 'YYYY-MM-DD') as date,
      COALESCE(SUM(total_in), 0) as total_in,
      COALESCE(SUM(total_out), 0) as total_out,
      COALESCE(SUM(total_value), 0) as total_value
    FROM (
      SELECT purchase_date as day_date, SUM(quantity) as total_in, 0::real as total_out, SUM(total_amount) as total_value
      FROM procurements
      WHERE purchase_date BETWEEN ? AND ?${project_id ? ' AND project_id = ?' : ''}
      GROUP BY purchase_date
      UNION ALL
      SELECT issue_date as day_date, 0::real as total_in, SUM(quantity) as total_out, 0::real as total_value
      FROM issues
      WHERE issue_date BETWEEN ? AND ?${project_id ? ' AND project_id = ?' : ''}
      GROUP BY issue_date
    ) daily
    GROUP BY day_date
    ORDER BY day_date
  `,
    fromDate, toDate, ...(project_id ? [project_id] : []),
    fromDate, toDate, ...(project_id ? [project_id] : [])
  );

  const projectTotals = await db.all(`
    SELECT
      COALESCE(prj.name, 'No Project') as project_name,
      COUNT(DISTINCT p.id) as products,
      COALESCE(SUM(p.current_stock), 0) as balance,
      COALESCE(SUM(pin.total_in), 0) as total_in,
      COALESCE(SUM(pout.total_out), 0) as total_out,
      COALESCE(SUM(pin.total_value), 0) as total_value
    FROM products p
    LEFT JOIN projects prj ON p.project_id = prj.id
    LEFT JOIN (
      SELECT product_id, SUM(quantity) as total_in, SUM(total_amount) as total_value
      FROM procurements
      WHERE purchase_date BETWEEN ? AND ?
      GROUP BY product_id
    ) pin ON pin.product_id = p.id
    LEFT JOIN (
      SELECT product_id, SUM(quantity) as total_out
      FROM issues
      WHERE issue_date BETWEEN ? AND ?
      GROUP BY product_id
    ) pout ON pout.product_id = p.id
    WHERE 1=1${project_id ? ' AND p.project_id = ?' : ''}
    GROUP BY COALESCE(prj.name, 'No Project')
    ORDER BY project_name
  `, fromDate, toDate, fromDate, toDate, ...(project_id ? [project_id] : []));

  res.json({ fromDate, toDate, period: period || 'monthly', productReport, totals, projectTotals, categoryTotals, supplierTotals, dateTotals });
});

// Audit log
router.get('/audit', authenticateToken, requireRole('admin'), async (req, res) => {
  const { event_type, user_id, action, table_name, project_id, from_date, to_date } = req.query;
  let query = `
    SELECT al.*, u.name as user_name, u.email as user_email FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (event_type === 'invite') {
    query += ` AND (al.action IN ('CREATE', 'INVITE_RESENT') AND al.table_name = 'users')`;
  } else if (event_type === 'password') {
    query += ` AND al.action LIKE 'PASSWORD%'`;
  } else if (event_type === 'auth') {
    query += ` AND (al.action LIKE 'LOGIN%' OR al.action LIKE 'PASSWORD%' OR al.action = 'INVITE_RESENT')`;
  }
  if (user_id) { query += ' AND al.user_id = ?'; params.push(user_id); }
  if (action) { query += ' AND al.action = ?'; params.push(action); }
  if (table_name) { query += ' AND al.table_name = ?'; params.push(table_name); }
  if (project_id) { query += ' AND al.project_id = ?'; params.push(project_id); }
  if (from_date) { query += ' AND al.created_at >= ?'; params.push(from_date); }
  if (to_date) { query += " AND al.created_at < (?::date + INTERVAL '1 day')"; params.push(to_date); }
  query += ' ORDER BY al.created_at DESC LIMIT 300';

  const logs = await db.all(query, ...params);
  res.json(logs);
});

// Quotations
router.get('/quotations', authenticateToken, requireProjectAccess(req => req.query.project_id), async (req, res) => {
  const { project_id, product_id, status } = req.query;
  let q = `SELECT qt.*, COALESCE(p.name, qt.product_name) as product_name FROM quotations qt LEFT JOIN products p ON qt.product_id = p.id WHERE 1=1`;
  const params = [];
  if (project_id) { q += ' AND qt.project_id = ?'; params.push(project_id); }
  if (product_id) { q += ' AND qt.product_id = ?'; params.push(product_id); }
  if (status) { q += ' AND qt.status = ?'; params.push(status); }
  q += ' ORDER BY qt.created_at DESC';
  res.json(await db.all(q, ...params));
});

router.post('/quotations', authenticateToken, requireRole('admin', 'store_manager'), requireProjectAccess(req => req.body.project_id), async (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const { project_id, product_id, product_name, supplier_name, quote_date, quantity, rate, delivery_days, payment_terms, validity_days, notes } = req.body;
  if (!project_id || !supplier_name || !quote_date || !quantity || !rate) return res.status(400).json({ error: 'project_id, supplier_name, quote_date, quantity, rate required' });
  const qty = parseFloat(quantity);
  const unitRate = parseFloat(rate);
  if (qty <= 0 || unitRate < 0) return res.status(400).json({ error: 'quantity must be greater than 0 and rate cannot be negative' });
  const id = uuidv4();
  await db.run(`
    INSERT INTO quotations (id, project_id, product_id, product_name, supplier_name, quote_date, quantity, rate, total_amount, delivery_days, payment_terms, validity_days, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, id, project_id, product_id || null, product_name, supplier_name, quote_date, qty, unitRate, qty * unitRate, delivery_days || null, payment_terms, validity_days || 30, notes, req.user.id);
  await logAudit(db, req.user.id, 'CREATE', 'quotations', id, null, { ...req.body, total_amount: qty * unitRate }, notes || 'Quotation added');
  res.status(201).json({ message: 'Quotation added', id });
});

router.put('/quotations/:id', authenticateToken, requireRole('admin', 'store_manager'), async (req, res) => {
  const qt = await db.get('SELECT * FROM quotations WHERE id = ?', req.params.id);
  if (!qt) return res.status(404).json({ error: 'Quotation not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, qt.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }

  const { product_id, product_name, supplier_name, quote_date, quantity, rate, delivery_days, payment_terms, validity_days, notes } = req.body;
  if (!supplier_name || !quote_date || !quantity || !rate) return res.status(400).json({ error: 'supplier_name, quote_date, quantity, rate required' });
  const qty = parseFloat(quantity);
  const unitRate = parseFloat(rate);
  if (qty <= 0 || unitRate < 0) return res.status(400).json({ error: 'quantity must be greater than 0 and rate cannot be negative' });

  await db.run(`
    UPDATE quotations
    SET product_id = ?, product_name = ?, supplier_name = ?, quote_date = ?, quantity = ?, rate = ?, total_amount = ?, delivery_days = ?, payment_terms = ?, validity_days = ?, notes = ?
    WHERE id = ?
  `, product_id || null, product_name, supplier_name, quote_date, qty, unitRate, qty * unitRate, delivery_days || null, payment_terms, validity_days || 30, notes, req.params.id);
  await logAudit(db, req.user.id, 'UPDATE', 'quotations', req.params.id, qt, { ...req.body, total_amount: qty * unitRate }, notes || 'Quotation updated');

  res.json({ message: 'Quotation updated' });
});

router.delete('/quotations/:id', authenticateToken, requireRole('admin', 'store_manager'), async (req, res) => {
  const qt = await db.get('SELECT * FROM quotations WHERE id = ?', req.params.id);
  if (!qt) return res.status(404).json({ error: 'Quotation not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, qt.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  if (qt.status === 'selected') return res.status(400).json({ error: 'Selected quotation cannot be deleted' });

  await db.run('DELETE FROM quotations WHERE id = ?', req.params.id);
  await logAudit(db, req.user.id, 'DELETE', 'quotations', req.params.id, qt, null, 'Quotation deleted');
  res.json({ message: 'Quotation deleted' });
});

router.patch('/quotations/:id/select', authenticateToken, requireRole('admin', 'store_manager'), async (req, res) => {
  const qt = await db.get('SELECT * FROM quotations WHERE id = ?', req.params.id);
  if (!qt) return res.status(404).json({ error: 'Quotation not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, qt.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  // Deselect others for same product
  if (qt.product_id) await db.run("UPDATE quotations SET status='rejected' WHERE product_id = ? AND id != ?", qt.product_id, req.params.id);
  await db.run("UPDATE quotations SET status='selected' WHERE id=?", req.params.id);
  await logAudit(db, req.user.id, 'UPDATE', 'quotations', req.params.id, qt, { status: 'selected' }, 'Quotation selected');
  res.json({ message: 'Quotation selected' });
});

module.exports = router;
