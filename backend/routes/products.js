const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authenticateToken, requireRole, requireProjectAccess, hasProjectAccess } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { recalculateProductStock } = require('../utils/stock');

const router = express.Router();

// Get all products with stock info
router.get('/', authenticateToken, requireProjectAccess(req => req.query.project_id), (req, res) => {
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

  const products = db.prepare(query).all(...params);
  res.json(products);
});

// Get single product
router.get('/:id', authenticateToken, (req, res) => {
  const product = db.prepare(`
    SELECT p.*, c.name as category_name,
      COALESCE((SELECT SUM(quantity) FROM procurements WHERE project_id = p.project_id AND product_id = p.id), 0) as total_in,
      COALESCE((SELECT SUM(quantity) FROM issues WHERE project_id = p.project_id AND product_id = p.id), 0) as total_out
    FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?
  `).get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!hasProjectAccess(req.user.id, req.user.role, product.project_id)) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  res.json(product);
});

// Create product
router.post('/', authenticateToken, requireRole('admin', 'store_manager'), requireProjectAccess(req => req.body.project_id), (req, res) => {
  const { project_id, name, category_id, size, unit, opening_stock, minimum_stock, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Product name required' });
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND is_active = 1').get(project_id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const id = uuidv4();
  const stock = parseFloat(opening_stock) || 0;
  const create = db.transaction(() => {
    db.prepare(`
      INSERT INTO products (id, project_id, name, category_id, size, unit, opening_stock, current_stock, minimum_stock, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, project_id, name, category_id || null, size, unit || 'Piece', stock, stock, parseFloat(minimum_stock) || 0, description);

    if (stock > 0) {
      db.prepare(`
        INSERT INTO procurements (id, project_id, product_id, supplier_name, purchase_date, challan_number, quantity, rate, total_amount, remarks, created_by)
        VALUES (?, ?, ?, 'Opening Stock', date('now'), ?, ?, 0, 0, 'Opening stock from product creation', ?)
      `).run(uuidv4(), project_id, id, `OPENING-${id.slice(0, 8)}`, stock, req.user.id);
      recalculateProductStock(db, id);
    }

    logAudit(db, req.user.id, 'CREATE', 'products', id, null, req.body, description || 'Product created');
  });

  create();
  res.status(201).json({ message: 'Product created', id });
});

// Update product
router.put('/:id', authenticateToken, requireRole('admin', 'store_manager'), (req, res) => {
  const { name, category_id, size, unit, minimum_stock, description } = req.body;
  const old = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Product not found' });
  if (!hasProjectAccess(req.user.id, req.user.role, old.project_id)) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }

  db.prepare(`
    UPDATE products SET name=?, category_id=?, size=?, unit=?, minimum_stock=?, description=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name || old.name, category_id === undefined ? old.category_id : category_id || null, size || old.size, unit || old.unit,
    parseFloat(minimum_stock) ?? old.minimum_stock, description ?? old.description, req.params.id);

  logAudit(db, req.user.id, 'UPDATE', 'products', req.params.id, old, req.body, description || 'Product updated');
  res.json({ message: 'Product updated' });
});

// Delete product
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!hasProjectAccess(req.user.id, req.user.role, product.project_id)) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  logAudit(db, req.user.id, 'DELETE', 'products', req.params.id, product, null, 'Product deleted');
  res.json({ message: 'Product deleted' });
});

// Get categories
router.get('/meta/categories', authenticateToken, (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  res.json(categories);
});

// Create category
router.post('/meta/categories', authenticateToken, requireRole('admin', 'store_manager'), (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO categories (id, name, description) VALUES (?, ?, ?)').run(id, name, description);
  res.status(201).json({ message: 'Category created', id });
});

module.exports = router;
