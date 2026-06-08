const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authenticateToken, requireRole, requireProjectAccess, hasProjectAccess } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { recalculateProductStock } = require('../utils/stock');

const router = express.Router();

function generateRequestNumber(projectId) {
  const latestRequest = db.prepare(`
    SELECT request_number
    FROM requests
    WHERE project_id = ? AND request_number LIKE 'REQ-%'
    ORDER BY CAST(SUBSTR(request_number, 5) AS INTEGER) DESC
    LIMIT 1
  `).get(projectId);
  const latestIssue = db.prepare(`
    SELECT request_number
    FROM issues
    WHERE project_id = ? AND request_number LIKE 'REQ-%'
    ORDER BY CAST(SUBSTR(request_number, 5) AS INTEGER) DESC
    LIMIT 1
  `).get(projectId);
  const latestNumber = Math.max(
    parseInt(latestRequest?.request_number?.replace('REQ-', '') || '1000', 10),
    parseInt(latestIssue?.request_number?.replace('REQ-', '') || '1000', 10)
  );
  return `REQ-${String(latestNumber + 1).padStart(4, '0')}`;
}

// Get all issues
router.get('/', authenticateToken, requireProjectAccess(req => req.query.project_id), (req, res) => {
  const { project_id, product_id, location, from_date, to_date, search } = req.query;
  let query = `
    SELECT i.*, p.name as product_name, p.unit, p.size, c.name as category_name, prj.name as project_name
    FROM issues i
    JOIN products p ON i.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN projects prj ON i.project_id = prj.id
    WHERE 1=1
  `;
  const params = [];
  if (project_id) { query += ' AND i.project_id = ?'; params.push(project_id); }
  if (product_id) { query += ' AND i.product_id = ?'; params.push(product_id); }
  if (location) { query += ' AND (i.location LIKE ? OR i.site_location LIKE ?)'; params.push(`%${location}%`, `%${location}%`); }
  if (from_date) { query += ' AND i.issue_date >= ?'; params.push(from_date); }
  if (to_date) { query += ' AND i.issue_date <= ?'; params.push(to_date); }
  if (search) { query += ' AND (p.name LIKE ? OR i.issued_to LIKE ? OR i.project LIKE ? OR i.site_location LIKE ? OR i.location LIKE ? OR i.request_number LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
  query += ' ORDER BY i.issue_date DESC, i.created_at DESC';

  const issues = db.prepare(query).all(...params);
  res.json(issues);
});

// Get single issue
router.get('/:id', authenticateToken, (req, res) => {
  const issue = db.prepare(`
    SELECT i.*, p.name as product_name, p.unit, p.size, prj.name as project_name FROM issues i
    LEFT JOIN projects prj ON i.project_id = prj.id
    JOIN products p ON i.product_id = p.id
    WHERE i.id = ?
  `).get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  if (!hasProjectAccess(req.user.id, req.user.role, issue.project_id)) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  res.json(issue);
});

// Create issue — stock auto decreases
router.post('/', authenticateToken, requireRole('admin', 'store_manager'), requireProjectAccess(req => req.body.project_id), (req, res) => {
  const { project_id, product_id, issue_date, issued_to, project, site_location, location, request_number, quantity, purpose, approved_by, remarks } = req.body;
  if (!project_id || !product_id || !quantity || !issue_date || !issued_to) {
    return res.status(400).json({ error: 'project_id, product_id, quantity, issue_date, issued_to are required' });
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND project_id = ?').get(product_id, project_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const qty = parseFloat(quantity);
  if (product.current_stock < qty) {
    return res.status(400).json({
      error: `Insufficient stock. Available: ${product.current_stock} ${product.unit}, Requested: ${qty} ${product.unit}`
    });
  }

  const finalSiteLocation = site_location ?? location;
  const finalRequestNumber = request_number?.trim() || generateRequestNumber(project_id);
  const id = uuidv4();
  const insertAndUpdate = db.transaction(() => {
    db.prepare(`
      INSERT INTO issues (id, project_id, product_id, issue_date, issued_to, project, site_location, location, request_number, quantity, purpose, approved_by, remarks, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, project_id, product_id, issue_date, issued_to, project, finalSiteLocation, finalSiteLocation, finalRequestNumber, qty, purpose, approved_by, remarks, req.user.id);

    recalculateProductStock(db, product_id);
    logAudit(db, req.user.id, 'CREATE', 'issues', id, null, { ...req.body, request_number: finalRequestNumber, quantity: qty, site_location: finalSiteLocation }, purpose || remarks || 'Material issued');
  });

  insertAndUpdate();
  const updatedStock = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(product_id);
  res.status(201).json({ message: 'Issue recorded, stock updated', id, request_number: finalRequestNumber, new_stock: updatedStock.current_stock });
});

// Update issue
router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  if (!hasProjectAccess(req.user.id, req.user.role, issue.project_id)) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }

  const { issued_to, project, site_location, location, request_number, quantity, purpose, approved_by, remarks } = req.body;
  const newQty = parseFloat(quantity) || issue.quantity;
  const diff = newQty - issue.quantity;

  const product = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(issue.product_id);
  if (diff > 0 && product.current_stock < diff) {
    return res.status(400).json({ error: `Insufficient stock for quantity increase. Available: ${product.current_stock}` });
  }

  const finalSiteLocation = site_location ?? location ?? issue.site_location ?? issue.location;
  const update = db.transaction(() => {
    db.prepare(`UPDATE issues SET issued_to=?, project=?, site_location=?, location=?, request_number=?, quantity=?, purpose=?, approved_by=?, remarks=? WHERE id=?`)
      .run(issued_to || issue.issued_to, project ?? issue.project, finalSiteLocation, finalSiteLocation, request_number ?? issue.request_number,
        newQty, purpose ?? issue.purpose, approved_by ?? issue.approved_by, remarks ?? issue.remarks, req.params.id);
    if (diff !== 0) {
      recalculateProductStock(db, issue.product_id);
    }
    logAudit(db, req.user.id, 'UPDATE', 'issues', req.params.id, issue, req.body, purpose || remarks || 'Issue updated');
  });

  update();
  res.json({ message: 'Issue updated' });
});

// Delete issue
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  if (!hasProjectAccess(req.user.id, req.user.role, issue.project_id)) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }

  const deleteAndRevert = db.transaction(() => {
    db.prepare('DELETE FROM issues WHERE id = ?').run(req.params.id);
    recalculateProductStock(db, issue.product_id);
    logAudit(db, req.user.id, 'DELETE', 'issues', req.params.id, issue, null, 'Issue deleted');
  });

  deleteAndRevert();
  res.json({ message: 'Issue deleted, stock restored' });
});

// Get unique sites/locations
router.get('/meta/locations', authenticateToken, requireProjectAccess(req => req.query.project_id), (req, res) => {
  const { project_id } = req.query;
  const locs = project_id
    ? db.prepare('SELECT DISTINCT location FROM issues WHERE project_id = ? AND location IS NOT NULL ORDER BY location').all(project_id)
    : db.prepare('SELECT DISTINCT location FROM issues WHERE location IS NOT NULL ORDER BY location').all();
  res.json(locs.map(l => l.location));
});

module.exports = router;
