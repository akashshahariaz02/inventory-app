const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authenticateToken, requireRole, requireProjectAccess, hasProjectAccess } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { recalculateProductStock } = require('../utils/stock');

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
  const latestAudit = await db.get(`
    SELECT record_id as request_number
    FROM audit_log
    WHERE table_name = 'requests' AND record_id LIKE 'REQ-%'
    ORDER BY CAST(SUBSTR(record_id, 5) AS INTEGER) DESC
    LIMIT 1
  `);

  const latestNumber = Math.max(
    parseInt(latestRequest?.request_number?.replace('REQ-', '') || '1000', 10),
    parseInt(latestIssue?.request_number?.replace('REQ-', '') || '1000', 10),
    parseInt(latestAudit?.request_number?.replace('REQ-', '') || '1000', 10)
  );
  return `REQ-${String(latestNumber + 1).padStart(4, '0')}`;
}

function groupRequests(rows) {
  const grouped = new Map();

  for (const row of rows) {
    if (!grouped.has(row.request_number)) {
      grouped.set(row.request_number, {
        id: row.id,
        project_id: row.project_id,
        request_number: row.request_number,
        requested_by: row.requested_by,
        requester_name: row.requester_name,
        requester_display_name: row.requester_display_name,
        location: row.location,
        purpose: row.purpose,
        status: row.status,
        approved_by: row.approved_by,
        approved_at: row.approved_at,
        rejection_reason: row.rejection_reason,
        created_at: row.created_at,
        items: []
      });
    }

    grouped.get(row.request_number).items.push({
      id: row.id,
      product_id: row.product_id,
      product_name: row.product_name,
      category_name: row.category_name,
      size: row.size,
      unit: row.unit,
      quantity: row.quantity
    });
  }

  return [...grouped.values()];
}

async function getRequestGroupById(id) {
  const seed = await db.get('SELECT request_number FROM requests WHERE id = ?', id);
  if (!seed) return null;

  const rows = await db.all(`
    SELECT r.*, p.name as product_name, p.unit, p.size, c.name as category_name, u.name as requester_display_name
    FROM requests r
    JOIN products p ON r.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN users u ON r.requested_by = u.id
    WHERE r.request_number = ?
    ORDER BY r.created_at, p.name
  `, seed.request_number);

  return groupRequests(rows)[0] || null;
}

function canModifyRequestGroup(group, user) {
  return group.requested_by === user.id || ['admin', 'store_manager'].includes(user.role);
}

// Get all requests
router.get('/', authenticateToken, requireProjectAccess(req => req.query.project_id), async (req, res) => {
  const { project_id, status, search } = req.query;
  let query = `
    SELECT r.*, p.name as product_name, p.unit, p.size, c.name as category_name, u.name as requester_display_name
    FROM requests r
    JOIN products p ON r.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN users u ON r.requested_by = u.id
    WHERE 1=1
  `;
  const params = [];
  if (project_id) {
    query += ' AND r.project_id = ?';
    params.push(project_id);
  }

  if (req.user.role === 'viewer') {
    query += ' AND r.requested_by = ?';
    params.push(req.user.id);
  }
  if (status) { query += ' AND r.status = ?'; params.push(status); }
  if (search) {
    query += ' AND (p.name LIKE ? OR r.request_number LIKE ? OR r.requester_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY r.created_at DESC, r.request_number DESC, p.name';

  res.json(groupRequests(await db.all(query, ...params)));
});

// Get single request group
router.get('/:id', authenticateToken, async (req, res) => {
  const group = await getRequestGroupById(req.params.id);
  if (!group) return res.status(404).json({ error: 'Request not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, group.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  if (req.user.role === 'viewer' && group.requested_by !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json(group);
});

// Create request with one or many items
router.post('/', authenticateToken, requireProjectAccess(req => req.body.project_id), async (req, res) => {
  const { project_id, items, product_id, quantity, location, purpose } = req.body;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  const requestItems = Array.isArray(items) ? items : [{ product_id, quantity }];
  const validItems = requestItems.filter(item => item.product_id && parseFloat(item.quantity) > 0);
  if (!validItems.length) return res.status(400).json({ error: 'At least one product and quantity are required' });

  for (const item of validItems) {
    const product = await db.get('SELECT id FROM products WHERE id = ? AND project_id = ?', item.product_id, project_id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
  }

  const requestNumber = await generateRequestNumber(project_id);
  const createdIds = [];

  await db.transaction(async tx => {
    for (const item of validItems) {
      const id = uuidv4();
      createdIds.push(id);
      await tx.run(`
        INSERT INTO requests (id, project_id, request_number, product_id, requested_by, requester_name, location, quantity, purpose, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `, id, project_id, requestNumber, item.product_id, req.user.id, req.user.name, location, parseFloat(item.quantity), purpose);
    }

    await logAudit(tx, req.user.id, 'CREATE', 'requests', requestNumber, null, { ...req.body, request_number: requestNumber, items: validItems }, purpose || 'Request submitted');
  });

  res.status(201).json({ message: 'Request submitted', id: createdIds[0], request_number: requestNumber });
});

// Update pending request group
router.put('/:id', authenticateToken, async (req, res) => {
  const group = await getRequestGroupById(req.params.id);
  if (!group) return res.status(404).json({ error: 'Request not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, group.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  if (group.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be edited' });
  if (!canModifyRequestGroup(group, req.user)) return res.status(403).json({ error: 'You can only edit your own pending requests' });

  const { items, product_id, quantity, location, purpose } = req.body;
  const requestItems = Array.isArray(items) ? items : [{ product_id, quantity }];
  const validItems = requestItems.filter(item => item.product_id && parseFloat(item.quantity) > 0);
  if (!validItems.length) return res.status(400).json({ error: 'At least one product and quantity are required' });

  for (const item of validItems) {
    const product = await db.get('SELECT id FROM products WHERE id = ? AND project_id = ?', item.product_id, group.project_id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
  }

  await db.transaction(async tx => {
    await tx.run('DELETE FROM requests WHERE request_number = ?', group.request_number);
    for (const item of validItems) {
      await tx.run(`
        INSERT INTO requests (id, project_id, request_number, product_id, requested_by, requester_name, location, quantity, purpose, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `, uuidv4(), group.project_id, group.request_number, item.product_id, group.requested_by, group.requester_name, location, parseFloat(item.quantity), purpose, group.created_at);
    }

    await logAudit(tx, req.user.id, 'UPDATE', 'requests', group.request_number, group, { ...req.body, items: validItems }, purpose || 'Request updated');
  });

  res.json({ message: 'Request updated' });
});

// Delete pending request group
router.delete('/:id', authenticateToken, async (req, res) => {
  const group = await getRequestGroupById(req.params.id);
  if (!group) return res.status(404).json({ error: 'Request not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, group.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  if (group.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be deleted' });
  if (!canModifyRequestGroup(group, req.user)) return res.status(403).json({ error: 'You can only delete your own pending requests' });

  await db.run('DELETE FROM requests WHERE request_number = ?', group.request_number);
  await logAudit(db, req.user.id, 'DELETE', 'requests', group.request_number, group, null, 'Pending request deleted');
  res.json({ message: 'Request deleted' });
});

// Approve request group
router.patch('/:id/approve', authenticateToken, requireRole('admin', 'store_manager'), async (req, res) => {
  const group = await getRequestGroupById(req.params.id);
  if (!group) return res.status(404).json({ error: 'Request not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, group.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  if (group.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

  for (const item of group.items) {
    const product = await db.get('SELECT * FROM products WHERE id = ?', item.product_id);
    if (product.current_stock < item.quantity) {
      return res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${product.current_stock} ${product.unit}` });
    }
  }

  await db.transaction(async tx => {
    await tx.run(`UPDATE requests SET status='approved', approved_by=?, approved_at=CURRENT_TIMESTAMP WHERE request_number=?`, req.user.name, group.request_number);

    for (const item of group.items) {
      await tx.run(`
        INSERT INTO issues (id, project_id, product_id, issue_date, issued_to, project, site_location, location, request_number, quantity, purpose, approved_by, created_by)
        VALUES (?, ?, ?, CURRENT_DATE, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, uuidv4(), group.project_id, item.product_id, group.requester_name, null, group.location, group.location, group.request_number, item.quantity, group.purpose, req.user.name, req.user.id);
      await recalculateProductStock(tx, item.product_id);
    }

    await logAudit(tx, req.user.id, 'UPDATE', 'requests', group.request_number, group, { status: 'approved' }, 'Request approved and issue created');
  });

  res.json({ message: 'Request approved and issue created automatically' });
});

// Reject request group
router.patch('/:id/reject', authenticateToken, requireRole('admin', 'store_manager'), async (req, res) => {
  const group = await getRequestGroupById(req.params.id);
  if (!group) return res.status(404).json({ error: 'Request not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, group.project_id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  if (group.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

  await db.run(`UPDATE requests SET status='rejected', approved_by=?, approved_at=CURRENT_TIMESTAMP, rejection_reason=? WHERE request_number=?`,
    req.user.name, req.body.reason || 'Rejected by manager', group.request_number);
  await logAudit(db, req.user.id, 'UPDATE', 'requests', group.request_number, group, { status: 'rejected', reason: req.body.reason }, req.body.reason || 'Rejected by manager');

  res.json({ message: 'Request rejected' });
});

module.exports = router;
