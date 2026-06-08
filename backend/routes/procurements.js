const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authenticateToken, requireRole, requireProjectAccess, hasProjectAccess } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { recalculateProductStock } = require('../utils/stock');

const router = express.Router();

function generateChallanNumber(projectId) {
  const latest = db.prepare(`
    SELECT challan_number
    FROM procurements
    WHERE project_id = ? AND challan_number LIKE 'IN-%'
    ORDER BY CAST(SUBSTR(challan_number, 4) AS INTEGER) DESC
    LIMIT 1
  `).get(projectId);
  const latestNumber = parseInt(latest?.challan_number?.replace('IN-', '') || '0', 10);
  return `IN-${String(latestNumber + 1).padStart(4, '0')}`;
}

// Get all procurements
router.get('/', authenticateToken, requireProjectAccess(req => req.query.project_id), (req, res) => {
  const { project_id, product_id, supplier, from_date, to_date, search } = req.query;
  let query = `
    SELECT pr.*, p.name as product_name, p.unit, p.size, c.name as category_name
    FROM procurements pr
    JOIN products p ON pr.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE 1=1
  `;
  const params = [];
  if (project_id) { query += ' AND pr.project_id = ?'; params.push(project_id); }
  if (product_id) { query += ' AND pr.product_id = ?'; params.push(product_id); }
  if (supplier) { query += ' AND pr.supplier_name LIKE ?'; params.push(`%${supplier}%`); }
  if (from_date) { query += ' AND pr.purchase_date >= ?'; params.push(from_date); }
  if (to_date) { query += ' AND pr.purchase_date <= ?'; params.push(to_date); }
  if (search) { query += ' AND (p.name LIKE ? OR pr.challan_number LIKE ? OR pr.supplier_name LIKE ? OR pr.project LIKE ? OR pr.site_location LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
  query += ' ORDER BY pr.purchase_date DESC, pr.created_at DESC';

  const procurements = db.prepare(query).all(...params);
  res.json(procurements);
});

// Get single procurement
router.get('/:id', authenticateToken, (req, res) => {
  const proc = db.prepare(`
    SELECT pr.*, p.name as product_name, p.unit, p.size FROM procurements pr
    JOIN products p ON pr.product_id = p.id WHERE pr.id = ?
  `).get(req.params.id);
  if (!proc) return res.status(404).json({ error: 'Procurement not found' });
  if (!hasProjectAccess(req.user.id, req.user.role, proc.project_id)) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  res.json(proc);
});

// Create procurement — stock auto increases
router.post('/', authenticateToken, requireRole('admin', 'store_manager'), requireProjectAccess(req => req.body.project_id), (req, res) => {
  const { project_id, product_id, supplier_name, purchase_date, challan_number, project, site_location, quantity, rate, remarks } = req.body;
  if (!project_id || !product_id || !quantity || !rate || !purchase_date) {
    return res.status(400).json({ error: 'project_id, product_id, quantity, rate, purchase_date are required' });
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND project_id = ?').get(product_id, project_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const qty = parseFloat(quantity);
  const rateNum = parseFloat(rate);
  const total = qty * rateNum;
  const id = uuidv4();
  const finalChallanNumber = challan_number?.trim() || generateChallanNumber(project_id);

  const insertAndUpdate = db.transaction(() => {
    db.prepare(`
      INSERT INTO procurements (id, project_id, product_id, supplier_name, purchase_date, challan_number, project, site_location, quantity, rate, total_amount, remarks, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, project_id, product_id, supplier_name, purchase_date, finalChallanNumber, project, site_location, qty, rateNum, total, remarks, req.user.id);

    recalculateProductStock(db, product_id);
    logAudit(db, req.user.id, 'CREATE', 'procurements', id, null, { ...req.body, challan_number: finalChallanNumber, quantity: qty, total_amount: total }, remarks || 'Procurement added');
  });

  insertAndUpdate();
  const updatedStock = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(product_id);
  res.status(201).json({ message: 'Procurement added, stock updated', id, challan_number: finalChallanNumber, new_stock: updatedStock.current_stock });
});

// Update procurement
router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const proc = db.prepare('SELECT * FROM procurements WHERE id = ?').get(req.params.id);
  if (!proc) return res.status(404).json({ error: 'Procurement not found' });
  if (!hasProjectAccess(req.user.id, req.user.role, proc.project_id)) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }

  const { supplier_name, purchase_date, challan_number, project, site_location, quantity, rate, remarks } = req.body;
  const newQty = parseFloat(quantity) || proc.quantity;
  const newRate = parseFloat(rate) || proc.rate;

  const update = db.transaction(() => {
    db.prepare(`
      UPDATE procurements SET supplier_name=?, purchase_date=?, challan_number=?, project=?, site_location=?, quantity=?, rate=?, total_amount=?, remarks=?
      WHERE id=?
    `).run(supplier_name || proc.supplier_name, purchase_date || proc.purchase_date, challan_number || proc.challan_number,
      project ?? proc.project, site_location ?? proc.site_location, newQty, newRate, newQty * newRate, remarks ?? proc.remarks, req.params.id);

    recalculateProductStock(db, proc.product_id);
    logAudit(db, req.user.id, 'UPDATE', 'procurements', req.params.id, proc, req.body, remarks || 'Procurement updated');
  });

  update();
  res.json({ message: 'Procurement updated' });
});

// Delete procurement
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const proc = db.prepare('SELECT * FROM procurements WHERE id = ?').get(req.params.id);
  if (!proc) return res.status(404).json({ error: 'Procurement not found' });
  if (!hasProjectAccess(req.user.id, req.user.role, proc.project_id)) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }

  const deleteAndRevert = db.transaction(() => {
    db.prepare('DELETE FROM procurements WHERE id = ?').run(req.params.id);
    recalculateProductStock(db, proc.product_id);
    logAudit(db, req.user.id, 'DELETE', 'procurements', req.params.id, proc, null, 'Procurement deleted');
  });

  deleteAndRevert();
  res.json({ message: 'Procurement deleted, stock reverted' });
});

// Get suppliers list
router.get('/meta/suppliers', authenticateToken, requireProjectAccess(req => req.query.project_id), (req, res) => {
  const { project_id } = req.query;
  const suppliers = project_id
    ? db.prepare('SELECT DISTINCT supplier_name FROM procurements WHERE project_id = ? AND supplier_name IS NOT NULL ORDER BY supplier_name').all(project_id)
    : db.prepare('SELECT DISTINCT supplier_name FROM procurements WHERE supplier_name IS NOT NULL ORDER BY supplier_name').all();
  res.json(suppliers.map(s => s.supplier_name));
});

module.exports = router;
