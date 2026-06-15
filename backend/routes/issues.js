const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authenticateToken, requireRole, requireProjectAccess, hasProjectAccess } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { getAvailableStockForUpdate, recalculateProductStock } = require('../utils/stock');

const router = express.Router();

async function generateRequestNumber(projectId) {
  const latestRequest = await db.get(`
    SELECT request_number
    FROM requests
    WHERE project_id = ? AND request_number LIKE 'REQ-%'
    ORDER BY CAST(SUBSTR(request_number, 5) AS INTEGER) DESC
    LIMIT 1
  `, projectId);
  const latestIssue = await db.get(`
    SELECT request_number
    FROM issues
    WHERE project_id = ? AND request_number LIKE 'REQ-%'
    ORDER BY CAST(SUBSTR(request_number, 5) AS INTEGER) DESC
    LIMIT 1
  `, projectId);
  const latestNumber = Math.max(
    parseInt(latestRequest?.request_number?.replace('REQ-', '') || '1000', 10),
    parseInt(latestIssue?.request_number?.replace('REQ-', '') || '1000', 10)
  );
  return `REQ-${String(latestNumber + 1).padStart(4, '0')}`;
}

// Get unique sites/locations
router.get('/meta/locations', authenticateToken, requireProjectAccess(req => req.query.project_id), async (req, res) => {
  const { project_id } = req.query;
  const locs = project_id
    ? await db.all('SELECT DISTINCT location FROM issues WHERE project_id = ? AND location IS NOT NULL ORDER BY location', project_id)
    : await db.all('SELECT DISTINCT location FROM issues WHERE location IS NOT NULL ORDER BY location');
  res.json(locs.map(l => l.location));
});

// Get all issues
router.get('/', authenticateToken, requireProjectAccess(req => req.query.project_id), async (req, res) => {
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

  const issues = await db.all(query, ...params);
  res.json(issues);
});

// Get single issue
router.get('/:id', authenticateToken, async (req, res) => {
  const issue = await db.get(`
    SELECT i.*, p.name as product_name, p.unit, p.size, prj.name as project_name FROM issues i
    LEFT JOIN projects prj ON i.project_id = prj.id
    JOIN products p ON i.product_id = p.id
    WHERE i.id = ?
  `, req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, issue.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  res.json(issue);
});

// Create issue — stock auto decreases
router.post('/', authenticateToken, requireRole('admin', 'store_manager'), requireProjectAccess(req => req.body.project_id), async (req, res) => {
  const { project_id, product_id, issue_date, issued_to, project, site_location, location, request_number, quantity, purpose, approved_by, remarks } = req.body;
  if (!project_id || !product_id || !quantity || !issue_date || !issued_to) {
    return res.status(400).json({ error: 'project_id, product_id, quantity, issue_date, issued_to are required' });
  }

  const product = await db.get('SELECT * FROM products WHERE id = ? AND project_id = ?', product_id, project_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const qty = parseFloat(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0' });
  if (product.current_stock < qty) {
    return res.status(400).json({
      error: `Insufficient stock. Available: ${product.current_stock} ${product.unit}, Requested: ${qty} ${product.unit}`
    });
  }

  const finalSiteLocation = site_location ?? location;
  const finalRequestNumber = request_number?.trim() || await generateRequestNumber(project_id);
  const id = uuidv4();
  try {
    await db.transaction(async tx => {
      const stock = await getAvailableStockForUpdate(tx, product_id);
      if (!stock || stock.project_id !== project_id) {
        const err = new Error('Product not found');
        err.statusCode = 404;
        throw err;
      }
      if (stock.available < qty) {
        const err = new Error(`Insufficient stock. Available: ${stock.available} ${stock.unit}, Requested: ${qty} ${stock.unit}`);
        err.statusCode = 400;
        throw err;
      }

      await tx.run(`
        INSERT INTO issues (id, project_id, product_id, issue_date, issued_to, project, site_location, location, request_number, quantity, purpose, approved_by, remarks, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id, project_id, product_id, issue_date, issued_to, project, finalSiteLocation, finalSiteLocation, finalRequestNumber, qty, purpose, approved_by, remarks, req.user.id);

      await recalculateProductStock(tx, product_id);
      await logAudit(tx, req.user.id, 'CREATE', 'issues', id, null, { ...req.body, request_number: finalRequestNumber, quantity: qty, site_location: finalSiteLocation }, purpose || remarks || 'Material issued');
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Failed to record issue' });
  }

  const updatedStock = await db.get('SELECT current_stock FROM products WHERE id = ?', product_id);
  res.status(201).json({ message: 'Issue recorded, stock updated', id, request_number: finalRequestNumber, new_stock: updatedStock.current_stock });
});

// Update issue
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const issue = await db.get('SELECT * FROM issues WHERE id = ?', req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, issue.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }

  const { issued_to, project, site_location, location, request_number, quantity, purpose, approved_by, remarks } = req.body;
  const newQty = quantity === undefined || quantity === '' ? issue.quantity : parseFloat(quantity);
  if (!Number.isFinite(newQty) || newQty <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0' });
  const diff = newQty - issue.quantity;

  const finalSiteLocation = site_location ?? location ?? issue.site_location ?? issue.location;
  try {
    await db.transaction(async tx => {
      if (diff > 0) {
        const stock = await getAvailableStockForUpdate(tx, issue.product_id);
        if (!stock || stock.available < diff) {
          const err = new Error(`Insufficient stock for quantity increase. Available: ${stock?.available ?? 0} ${stock?.unit || ''}`.trim());
          err.statusCode = 400;
          throw err;
        }
      }

      await tx.run(`UPDATE issues SET issued_to=?, project=?, site_location=?, location=?, request_number=?, quantity=?, purpose=?, approved_by=?, remarks=? WHERE id=?`,
        issued_to || issue.issued_to, project ?? issue.project, finalSiteLocation, finalSiteLocation, request_number ?? issue.request_number,
          newQty, purpose ?? issue.purpose, approved_by ?? issue.approved_by, remarks ?? issue.remarks, req.params.id);
      if (diff !== 0) {
        await recalculateProductStock(tx, issue.product_id);
      }
      await logAudit(tx, req.user.id, 'UPDATE', 'issues', req.params.id, issue, req.body, purpose || remarks || 'Issue updated');
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Failed to update issue' });
  }

  res.json({ message: 'Issue updated' });
});

// Delete issue
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const issue = await db.get('SELECT * FROM issues WHERE id = ?', req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, issue.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }

  await db.transaction(async tx => {
    await tx.run('DELETE FROM issues WHERE id = ?', req.params.id);
    await recalculateProductStock(tx, issue.product_id);
    await logAudit(tx, req.user.id, 'DELETE', 'issues', req.params.id, issue, null, 'Issue deleted');
  });

  res.json({ message: 'Issue deleted, stock restored' });
});

module.exports = router;
