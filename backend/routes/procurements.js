const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authenticateToken, requireRole, requireProjectAccess, hasProjectAccess } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { recalculateProductStock } = require('../utils/stock');

const router = express.Router();

async function generateChallanNumber(projectId) {
  const latest = await db.get(`
    SELECT challan_number
    FROM procurements
    WHERE project_id = ? AND challan_number LIKE 'IN-%'
    ORDER BY CAST(SUBSTR(challan_number, 4) AS INTEGER) DESC
    LIMIT 1
  `, projectId);
  const latestNumber = parseInt(latest?.challan_number?.replace('IN-', '') || '0', 10);
  return `IN-${String(latestNumber + 1).padStart(4, '0')}`;
}

// Get suppliers list
router.get('/meta/suppliers', authenticateToken, requireProjectAccess(req => req.query.project_id), async (req, res) => {
  const { project_id } = req.query;
  const suppliers = project_id
    ? await db.all('SELECT DISTINCT supplier_name FROM procurements WHERE project_id = ? AND supplier_name IS NOT NULL ORDER BY supplier_name', project_id)
    : await db.all('SELECT DISTINCT supplier_name FROM procurements WHERE supplier_name IS NOT NULL ORDER BY supplier_name');
  res.json(suppliers.map(s => s.supplier_name));
});

// Get all procurements
router.get('/', authenticateToken, requireProjectAccess(req => req.query.project_id), async (req, res) => {
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

  const procurements = await db.all(query, ...params);
  res.json(procurements);
});

// Get single procurement
router.get('/:id', authenticateToken, async (req, res) => {
  const proc = await db.get(`
    SELECT pr.*, p.name as product_name, p.unit, p.size FROM procurements pr
    JOIN products p ON pr.product_id = p.id WHERE pr.id = ?
  `, req.params.id);
  if (!proc) return res.status(404).json({ error: 'Procurement not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, proc.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  res.json(proc);
});

// Create procurement — stock auto increases
router.post('/', authenticateToken, requireRole('admin', 'store_manager'), requireProjectAccess(req => req.body.project_id), async (req, res) => {
  const { project_id, product_id, supplier_name, purchase_date, challan_number, project, site_location, quantity, rate, remarks } = req.body;
  if (!project_id || !product_id || !quantity || !purchase_date || !challan_number?.trim()) {
    return res.status(400).json({ error: 'project_id, product_id, quantity, purchase_date, challan_number are required' });
  }

  const product = await db.get('SELECT * FROM products WHERE id = ? AND project_id = ?', product_id, project_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const qty = parseFloat(quantity);
  const rateNum = rate === undefined || rate === null || rate === '' ? 0 : parseFloat(rate);
  if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0' });
  if (!Number.isFinite(rateNum) || rateNum < 0) return res.status(400).json({ error: 'Rate cannot be negative' });
  const total = qty * rateNum;
  const id = uuidv4();
  const finalChallanNumber = challan_number.trim();

  await db.transaction(async tx => {
    await tx.run(`
      INSERT INTO procurements (id, project_id, product_id, supplier_name, purchase_date, challan_number, project, site_location, quantity, rate, total_amount, remarks, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, project_id, product_id, supplier_name, purchase_date, finalChallanNumber, project, site_location, qty, rateNum, total, remarks, req.user.id);

    await recalculateProductStock(tx, product_id);
    await logAudit(tx, req.user.id, 'CREATE', 'procurements', id, null, { ...req.body, challan_number: finalChallanNumber, quantity: qty, total_amount: total }, remarks || 'Procurement added');
  });

  const updatedStock = await db.get('SELECT current_stock FROM products WHERE id = ?', product_id);
  res.status(201).json({ message: 'Procurement added, stock updated', id, challan_number: finalChallanNumber, new_stock: updatedStock.current_stock });
});

// Update procurement
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const proc = await db.get('SELECT * FROM procurements WHERE id = ?', req.params.id);
  if (!proc) return res.status(404).json({ error: 'Procurement not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, proc.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }

  const { supplier_name, purchase_date, challan_number, project, site_location, quantity, rate, remarks } = req.body;
  const newQty = quantity === undefined || quantity === '' ? proc.quantity : parseFloat(quantity);
  const newRate = rate === undefined || rate === '' ? proc.rate : parseFloat(rate);
  if (!Number.isFinite(newQty) || newQty <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0' });
  if (!Number.isFinite(newRate) || newRate < 0) return res.status(400).json({ error: 'Rate cannot be negative' });

  await db.transaction(async tx => {
    await tx.run(`
      UPDATE procurements SET supplier_name=?, purchase_date=?, challan_number=?, project=?, site_location=?, quantity=?, rate=?, total_amount=?, remarks=?
      WHERE id=?
    `, supplier_name || proc.supplier_name, purchase_date || proc.purchase_date, challan_number || proc.challan_number,
      project ?? proc.project, site_location ?? proc.site_location, newQty, newRate, newQty * newRate, remarks ?? proc.remarks, req.params.id);

    await recalculateProductStock(tx, proc.product_id);
    await logAudit(tx, req.user.id, 'UPDATE', 'procurements', req.params.id, proc, req.body, remarks || 'Procurement updated');
  });

  res.json({ message: 'Procurement updated' });
});

// Delete procurement
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const proc = await db.get('SELECT * FROM procurements WHERE id = ?', req.params.id);
  if (!proc) return res.status(404).json({ error: 'Procurement not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, proc.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }

  await db.transaction(async tx => {
    await tx.run('DELETE FROM procurements WHERE id = ?', req.params.id);
    await recalculateProductStock(tx, proc.product_id);
    await logAudit(tx, req.user.id, 'DELETE', 'procurements', req.params.id, proc, null, 'Procurement deleted');
  });

  res.json({ message: 'Procurement deleted, stock reverted' });
});

module.exports = router;
