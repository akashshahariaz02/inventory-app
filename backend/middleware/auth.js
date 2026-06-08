const jwt = require('jsonwebtoken');
const { db } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'inventory_jwt_secret_2024';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const user = jwt.verify(token, JWT_SECRET);
    const dbUser = db.prepare(`
      SELECT id, name, email, role, permissions, is_verified, must_change_password, last_login,
        phone, designation, department, address, avatar_url
      FROM users
      WHERE id = ? AND is_active = 1
    `).get(user.id);
    if (!dbUser) return res.status(401).json({ error: 'User not found or inactive' });
    req.user = dbUser;
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function hasProjectAccess(userId, role, projectId) {
  if (!projectId) return false;
  if (role === 'admin') return true;
  return Boolean(db.prepare('SELECT 1 FROM project_access WHERE user_id = ? AND project_id = ?').get(userId, projectId));
}

function requireProjectAccess(getProjectId) {
  return (req, res, next) => {
    const projectId = typeof getProjectId === 'function' ? getProjectId(req) : req.query.project_id || req.body.project_id;
    if (!projectId) {
      if (req.user.role === 'admin') return next();
      return res.status(400).json({ error: 'project_id required' });
    }
    if (!hasProjectAccess(req.user.id, req.user.role, projectId)) {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole, requireProjectAccess, hasProjectAccess, JWT_SECRET };
