const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authenticateToken, requireRole, requireProjectAccess, hasProjectAccess } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { recalculateProductStock } = require('../utils/stock');

const router = express.Router();

async function generateChallanNumber(projectId, conn = db) {
  const latest = await conn.get(`
    SELECT challan_number
    FROM procurements
    WHERE project_id = ? AND challan_number LIKE 'IN-%'
    ORDER BY CAST(SUBSTR(challan_number, 4) AS INTEGER) DESC
    LIMIT 1
  `, projectId);
  const latestNumber = parseInt(latest?.challan_number?.replace('IN-', '') || '0', 10);
  return `IN-${String(latestNumber + 1).padStart(4, '0')}`;
}

// Get categories
router.get('/meta/categories', authenticateToken, async (req, res) => {
  const categories = await db.all('SELECT * FROM categories ORDER BY name');
  res.json(categories);
});

// Create category
router.post('/meta/categories', authenticateToken, requireRole('admin', 'store_manager'), async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name required' });
  const id = uuidv4();
  await db.run('INSERT INTO categories (id, name, description) VALUES (?, ?, ?)', id, name, description);
  res.status(201).json({ message: 'Category created', id });
});

// Get all products with stock info
router.get('/', authenticateToken, requireProjectAccess(req => req.query.project_id), async (req, res) => {
  const { project_id, search, category_id, low_stock } = req.query;
  let query = `
    SELECT p.*, c.name as category_name,
      COALESCE((SELECT SUM(quantity) FROM procurements WHERE project_id = p.project_id AND product_id = p.id), 0) as total_in,
      COALESCE((SELECT SUM(quantity) FROM issues WHERE project_id = p.project_id AND product_id = p.id), 0) as total_out
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE 1=1
  `;
  const params = [];
  if (project_id) { query += ` AND p.project_id = ?`; params.push(project_id); }
  if (search) { query += ` AND (p.name LIKE ? OR p.size LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (category_id) { query += ` AND p.category_id = ?`; params.push(category_id); }
  if (low_stock === 'true') { query += ` AND p.current_stock <= p.minimum_stock`; }
  query += ' ORDER BY p.name';

  const products = await db.all(query, ...params);
  res.json(products);
});

// Get single product
router.get('/:id', authenticateToken, async (req, res) => {
  const product = await db.get(`
    SELECT p.*, c.name as category_name,
      COALESCE((SELECT SUM(quantity) FROM procurements WHERE project_id = p.project_id AND product_id = p.id), 0) as total_in,
      COALESCE((SELECT SUM(quantity) FROM issues WHERE project_id = p.project_id AND product_id = p.id), 0) as total_out
    FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?
  `, req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, product.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  res.json(product);
});

// Create product
router.post('/', authenticateToken, requireRole('admin', 'store_manager'), requireProjectAccess(req => req.body.project_id), async (req, res) => {
  const { project_id, name, category_id, size, unit, opening_stock, minimum_stock, description, supplier_name, purchase_date, rate, remarks } = req.body;
  if (!name) return res.status(400).json({ error: 'Product name required' });
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  const project = await db.get('SELECT id FROM projects WHERE id = ? AND is_active = 1', project_id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const id = uuidv4();
  const stock = parseFloat(opening_stock) || 0;
  const unitRate = parseFloat(rate) || 0;
  if (stock < 0) return res.status(400).json({ error: 'Opening stock cannot be negative' });
  if (unitRate < 0) return res.status(400).json({ error: 'Rate cannot be negative' });
  if (stock > 0 && !supplier_name?.trim()) return res.status(400).json({ error: 'Supplier name is required when opening stock is greater than 0' });
  if (stock > 0 && !purchase_date) return res.status(400).json({ error: 'Purchase date is required when opening stock is greater than 0' });
  if (stock > 0 && (rate === undefined || rate === null || rate === '')) return res.status(400).json({ error: 'Rate is required when opening stock is greater than 0' });

  await db.transaction(async tx => {
    await tx.run(`
      INSERT INTO products (id, project_id, name, category_id, size, unit, opening_stock, current_stock, minimum_stock, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, project_id, name, category_id || null, size, unit || 'Piece', stock, stock, parseFloat(minimum_stock) || 0, description);

    if (stock > 0) {
      const challanNumber = await generateChallanNumber(project_id, tx);
      await tx.run(`
        INSERT INTO procurements (id, project_id, product_id, supplier_name, purchase_date, challan_number, quantity, rate, total_amount, remarks, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, uuidv4(), project_id, id, supplier_name.trim(), purchase_date, challanNumber, stock, unitRate, stock * unitRate, remarks || description || 'Opening stock from new product', req.user.id);
      await recalculateProductStock(tx, id);
    }

    await logAudit(tx, req.user.id, 'CREATE', 'products', id, null, req.body, description || 'Product created');
  });

  res.status(201).json({ message: 'Product created', id });
});

// Update product
router.put('/:id', authenticateToken, requireRole('admin', 'store_manager'), async (req, res) => {
  const { name, category_id, size, unit, minimum_stock, description } = req.body;
  const old = await db.get('SELECT * FROM products WHERE id = ?', req.params.id);
  if (!old) return res.status(404).json({ error: 'Product not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, old.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }

  await db.run(`
    UPDATE products SET name=?, category_id=?, size=?, unit=?, minimum_stock=?, description=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `, name || old.name, category_id === undefined ? old.category_id : category_id || null, size || old.size, unit || old.unit,
    parseFloat(minimum_stock) ?? old.minimum_stock, description ?? old.description, req.params.id);

  await logAudit(db, req.user.id, 'UPDATE', 'products', req.params.id, old, req.body, description || 'Product updated');
  res.json({ message: 'Product updated' });
});

// Delete product
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const product = await db.get('SELECT * FROM products WHERE id = ?', req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, product.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  await db.run('DELETE FROM products WHERE id = ?', req.params.id);
  await logAudit(db, req.user.id, 'DELETE', 'products', req.params.id, product, null, 'Product deleted');
  res.json({ message: 'Product deleted' });
});

module.exports = router;
