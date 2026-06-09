const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authenticateToken, requireRole, hasProjectAccess } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  const query = req.user.role === 'admin' ? `
    SELECT p.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM products WHERE project_id = p.id) as product_count
    FROM projects p
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.is_active = 1
    ORDER BY p.created_at ASC, p.name ASC
  ` : `
    SELECT p.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM products WHERE project_id = p.id) as product_count
    FROM projects p
    JOIN project_access pa ON pa.project_id = p.id AND pa.user_id = ?
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.is_active = 1
    ORDER BY p.created_at ASC, p.name ASC
  `;
  const projects = req.user.role === 'admin' ? await db.all(query) : await db.all(query, req.user.id);
  res.json(projects);
});

router.get('/:id', authenticateToken, async (req, res) => {
  const project = await db.get('SELECT * FROM projects WHERE id = ? AND is_active = 1', req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!(await hasProjectAccess(req.user.id, req.user.role, project.id))) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }
  res.json(project);
});

router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Project name required' });

  const id = uuidv4();
  try {
    await db.run('INSERT INTO projects (id, name, description, created_by) VALUES (?, ?, ?, ?)',
      id,
      name.trim(),
      description || null,
      req.user.id
    );
    await logAudit(db, req.user.id, 'CREATE', 'projects', id, null, { name, description }, description || 'Project created');
    res.status(201).json({ message: 'Project created', id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Project name already exists' });
    }
    throw err;
  }
});

module.exports = router;
