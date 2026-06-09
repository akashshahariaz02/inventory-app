const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authenticateToken, requireRole, JWT_SECRET } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { sendInviteEmail, sendPasswordResetCodeEmail } = require('../utils/mailer');

const router = express.Router();
const loginAttempts = new Map();
const MAX_FAILED_LOGIN_ATTEMPTS = 25;
const LOGIN_LOCK_MINUTES = 15;

function parsePermissions(value) {
  try { return typeof value === 'string' ? JSON.parse(value) : value || {}; }
  catch { return {}; }
}

function defaultPermissionsForRole(roleName) {
  return {
    'View Dashboard & Reports': true,
    'View Inventory': true,
    'Add Products': roleName === 'admin' || roleName === 'store_manager',
    'Edit Products': roleName === 'admin',
    'Delete Products': roleName === 'admin',
    'Add Procurement (IN)': roleName === 'admin' || roleName === 'store_manager',
    'Add Issue (OUT)': roleName === 'admin' || roleName === 'store_manager',
    'Submit Requests': true,
    'Approve/Reject Requests': roleName === 'admin' || roleName === 'store_manager',
    'Manage Quotations': roleName === 'admin' || roleName === 'store_manager',
    'Manage Users': roleName === 'admin',
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: parsePermissions(user.permissions),
    must_change_password: Boolean(user.must_change_password),
    is_verified: Boolean(user.is_verified),
    last_login: user.last_login || null,
    phone: user.phone || '',
    designation: user.designation || '',
    department: user.department || '',
    address: user.address || '',
    avatar_url: user.avatar_url || '',
  };
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10) return 'Password must be at least 10 characters';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must include a number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a symbol';
  return null;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createInviteToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return { token, hash, expiresAt };
}

function createResetCode() {
  const code = String(crypto.randomInt(100000, 1000000));
  const hash = hashToken(code);
  return { code, hash };
}

function loginKey(req, email) {
  return `${req.ip || 'local'}:${String(email || '').toLowerCase()}`;
}

function getAttempt(key) {
  const attempt = loginAttempts.get(key);
  if (!attempt || attempt.resetAt < Date.now()) return { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
  return attempt;
}

async function registerFailedLogin(req, email, user) {
  const key = loginKey(req, email);
  const attempt = getAttempt(key);
  attempt.count += 1;
  loginAttempts.set(key, attempt);

  if (user) {
    const dbCount = Number(user.failed_login_count || 0) + 1;
    const lockUntil = dbCount >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000).toISOString() : null;
    await db.run('UPDATE users SET failed_login_count = ?, lock_until = ? WHERE id = ?', dbCount, lockUntil, user.id);
    await logAudit(db, user.id, 'LOGIN_FAILED', 'users', user.id, null, { email: user.email, locked: Boolean(lockUntil) }, lockUntil ? 'Account temporarily locked' : 'Invalid password');
  } else {
    await logAudit(db, null, 'LOGIN_FAILED', 'users', null, null, { email }, 'Invalid email');
  }

  return attempt.count >= MAX_FAILED_LOGIN_ATTEMPTS;
}

function isLocked(user) {
  return user.lock_until && new Date(user.lock_until).getTime() > Date.now();
}

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const key = loginKey(req, email);
  const attempt = getAttempt(key);
  if (attempt.count >= MAX_FAILED_LOGIN_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }

  const user = await db.get(`
    SELECT id, name, email, password, role, permissions, is_verified, must_change_password,
      failed_login_count, lock_until, last_login
    FROM users
    WHERE email = ? AND is_active = 1
  `, email);

  if (!user) {
    await registerFailedLogin(req, email, null);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (isLocked(user)) {
    return res.status(423).json({ error: 'Account temporarily locked. Try again later.' });
  }

  if (!user.is_verified) {
    await logAudit(db, user.id, 'LOGIN_BLOCKED', 'users', user.id, null, { email: user.email }, 'Account not verified');
    return res.status(403).json({ error: 'Account is not verified. Please set your password using the invite link.' });
  }

  const validPassword = bcrypt.compareSync(password, user.password);
  if (!validPassword) {
    const tooMany = await registerFailedLogin(req, email, user);
    return res.status(tooMany ? 429 : 401).json({ error: tooMany ? 'Too many login attempts. Try again later.' : 'Invalid credentials' });
  }

  loginAttempts.delete(key);
  await db.run('UPDATE users SET failed_login_count = 0, lock_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = ?', user.id);
  await logAudit(db, user.id, 'LOGIN_SUCCESS', 'users', user.id, null, { email: user.email }, 'User signed in');

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: publicUser(user) });
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Admin creates an invited user. The user sets their own password later.
router.post('/register', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, email, role, project_ids } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

  const exists = await db.get('SELECT id FROM users WHERE email = ?', email);
  if (exists) return res.status(400).json({ error: 'Email already exists' });

  const roleName = role || 'viewer';
  const id = uuidv4();
  const invite = createInviteToken();
  const disabledPassword = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
  const defaultPermissions = defaultPermissionsForRole(roleName);

  await db.transaction(async tx => {
    await tx.run(`
      INSERT INTO users (
        id, name, email, password, role, permissions, is_verified, must_change_password,
        invite_token_hash, invite_expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
    `, id, name, email, disabledPassword, roleName, JSON.stringify(defaultPermissions), invite.hash, invite.expiresAt);

    if (roleName !== 'admin' && Array.isArray(project_ids)) {
      for (const projectId of project_ids.filter(Boolean)) {
        await tx.run('INSERT INTO project_access (user_id, project_id, granted_by) VALUES (?, ?, ?) ON CONFLICT (user_id, project_id) DO NOTHING', id, projectId, req.user.id);
      }
    }
  });

  const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/set-password/${invite.token}`;
  const emailResult = await sendInviteEmail({ to: email, name, inviteUrl, expiresAt: invite.expiresAt });
  await logAudit(
    db,
    req.user.id,
    'CREATE',
    'users',
    id,
    null,
    { name, email, role: roleName, project_ids, email_sent: emailResult.sent },
    emailResult.sent ? 'User invited by email' : `User invited, email not sent: ${emailResult.reason}`
  );

  res.status(201).json({
    message: 'User invited successfully',
    id,
    invite_token: invite.token,
    invite_url: `/set-password/${invite.token}`,
    invite_expires_at: invite.expiresAt,
    email_sent: emailResult.sent,
    email_error: emailResult.sent ? null : emailResult.reason,
  });
});

router.get('/invite/:token', async (req, res) => {
  const hash = hashToken(req.params.token);
  const user = await db.get(`
    SELECT id, name, email, role, invite_expires_at, is_verified
    FROM users
    WHERE invite_token_hash = ? AND is_active = 1
  `, hash);
  if (!user || user.is_verified || new Date(user.invite_expires_at).getTime() < Date.now()) {
    return res.status(404).json({ error: 'Invite link is invalid or expired' });
  }
  res.json({ name: user.name, email: user.email, role: user.role, expires_at: user.invite_expires_at });
});

router.post('/invite/:token/set-password', async (req, res) => {
  const { password } = req.body;
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const hash = hashToken(req.params.token);
  const user = await db.get(`
    SELECT id, name, email, invite_expires_at, is_verified
    FROM users
    WHERE invite_token_hash = ? AND is_active = 1
  `, hash);
  if (!user || user.is_verified || new Date(user.invite_expires_at).getTime() < Date.now()) {
    return res.status(404).json({ error: 'Invite link is invalid or expired' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  await db.run(`
    UPDATE users
    SET password = ?, is_verified = 1, must_change_password = 0, invite_token_hash = NULL,
      invite_expires_at = NULL, password_changed_at = CURRENT_TIMESTAMP,
      failed_login_count = 0, lock_until = NULL
    WHERE id = ?
  `, passwordHash, user.id);
  await logAudit(db, user.id, 'PASSWORD_SET', 'users', user.id, null, { email: user.email }, 'User verified account and set password');
  res.json({ message: 'Password set successfully. You can now sign in.' });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = await db.get('SELECT id, name, email, is_active, is_verified FROM users WHERE email = ?', email);
  if (!user || !user.is_active || !user.is_verified) {
    await logAudit(db, user?.id || null, 'PASSWORD_RESET_REQUEST', 'users', user?.id || null, null, { email, valid_user: false }, 'Password reset requested');
    return res.json({ message: 'If the email exists, a reset code has been sent.' });
  }

  const reset = createResetCode();
  const updated = await db.get(`
    UPDATE users
    SET reset_code_hash = ?, reset_code_expires_at = CURRENT_TIMESTAMP + INTERVAL '10 minutes', reset_code_attempts = 0
    WHERE id = ?
    RETURNING reset_code_expires_at
  `, reset.hash, user.id);

  const emailResult = await sendPasswordResetCodeEmail({ to: user.email, name: user.name, code: reset.code, expiresAt: updated.reset_code_expires_at });
  await logAudit(
    db,
    user.id,
    'PASSWORD_RESET_REQUEST',
    'users',
    user.id,
    null,
    { email: user.email, email_sent: emailResult.sent },
    emailResult.sent ? 'Password reset code emailed' : `Password reset code generated, email not sent: ${emailResult.reason}`
  );

  res.json({
    message: 'If the email exists, a reset code has been sent.',
    email_sent: emailResult.sent,
    email_error: emailResult.sent ? null : emailResult.reason,
  });
});

router.post('/reset-password', async (req, res) => {
  const { email, code, new_password } = req.body;
  if (!email || !code || !new_password) return res.status(400).json({ error: 'Email, code, and new password are required' });

  const passwordError = validatePassword(new_password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const user = await db.get(`
    SELECT id, email, reset_code_hash, reset_code_expires_at, reset_code_attempts
    FROM users
    WHERE email = ? AND is_active = 1 AND is_verified = 1
  `, email);

  if (!user || !user.reset_code_hash || !user.reset_code_expires_at) {
    return res.status(400).json({ error: 'Invalid or expired reset code' });
  }

  if (Number(user.reset_code_attempts || 0) >= 5) {
    return res.status(429).json({ error: 'Too many code attempts. Request a new code.' });
  }

  if (new Date(user.reset_code_expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Reset code expired. Request a new code.' });
  }

  if (hashToken(String(code).trim()) !== user.reset_code_hash) {
    await db.run('UPDATE users SET reset_code_attempts = COALESCE(reset_code_attempts, 0) + 1 WHERE id = ?', user.id);
    await logAudit(db, user.id, 'PASSWORD_RESET_FAILED', 'users', user.id, null, { email: user.email }, 'Invalid reset code');
    return res.status(400).json({ error: 'Invalid reset code' });
  }

  const passwordHash = bcrypt.hashSync(new_password, 12);
  await db.run(`
    UPDATE users
    SET password = ?, must_change_password = 0, failed_login_count = 0, lock_until = NULL,
      reset_code_hash = NULL, reset_code_expires_at = NULL, reset_code_attempts = 0,
      password_changed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, passwordHash, user.id);

  await logAudit(db, user.id, 'PASSWORD_RESET', 'users', user.id, null, { email: user.email }, 'Password reset by email code');
  res.json({ message: 'Password reset successfully. You can now sign in.' });
});

router.post('/change-password', authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body;
  const passwordError = validatePassword(new_password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const user = await db.get('SELECT id, email, password FROM users WHERE id = ? AND is_active = 1', req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!bcrypt.compareSync(current_password || '', user.password)) {
    await logAudit(db, req.user.id, 'PASSWORD_CHANGE_FAILED', 'users', req.user.id, null, { email: user.email }, 'Current password incorrect');
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const passwordHash = bcrypt.hashSync(new_password, 12);
  await db.run(`
    UPDATE users
    SET password = ?, must_change_password = 0, is_verified = 1, password_changed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, passwordHash, user.id);
  await logAudit(db, req.user.id, 'PASSWORD_CHANGED', 'users', req.user.id, null, { email: user.email }, 'Password changed');
  res.json({ message: 'Password changed successfully' });
});

router.put('/profile', authenticateToken, async (req, res) => {
  const { name, phone, designation, department, address, avatar_url } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  if (avatar_url && typeof avatar_url === 'string' && avatar_url.length > 500000) {
    return res.status(400).json({ error: 'Profile image is too large' });
  }

  const old = await db.get(`
    SELECT id, name, email, role, permissions, is_verified, must_change_password, last_login,
      phone, designation, department, address, avatar_url
    FROM users
    WHERE id = ?
  `, req.user.id);
  if (!old) return res.status(404).json({ error: 'User not found' });

  await db.run(`
    UPDATE users
    SET name = ?, phone = ?, designation = ?, department = ?, address = ?, avatar_url = ?
    WHERE id = ?
  `,
    name.trim(),
    phone || null,
    designation || null,
    department || null,
    address || null,
    avatar_url || null,
    req.user.id
  );

  const updated = await db.get(`
    SELECT id, name, email, role, permissions, is_verified, must_change_password, last_login,
      phone, designation, department, address, avatar_url
    FROM users
    WHERE id = ?
  `, req.user.id);

  await logAudit(db, req.user.id, 'UPDATE', 'users', req.user.id, old, updated, 'Profile updated');
  res.json({ message: 'Profile updated', user: publicUser(updated) });
});

router.post('/users/:id/resend-invite', authenticateToken, requireRole('admin'), async (req, res) => {
  const user = await db.get('SELECT id, name, email, is_verified FROM users WHERE id = ?', req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.is_verified) return res.status(400).json({ error: 'User is already verified' });

  const invite = createInviteToken();
  await db.run('UPDATE users SET invite_token_hash = ?, invite_expires_at = ? WHERE id = ?', invite.hash, invite.expiresAt, user.id);
  const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/set-password/${invite.token}`;
  const emailResult = await sendInviteEmail({ to: user.email, name: user.name, inviteUrl, expiresAt: invite.expiresAt });
  await logAudit(
    db,
    req.user.id,
    'INVITE_RESENT',
    'users',
    user.id,
    null,
    { email: user.email, email_sent: emailResult.sent },
    emailResult.sent ? 'Invite resent by email' : `Invite regenerated, email not sent: ${emailResult.reason}`
  );
  res.json({
    invite_token: invite.token,
    invite_url: `/set-password/${invite.token}`,
    invite_expires_at: invite.expiresAt,
    email_sent: emailResult.sent,
    email_error: emailResult.sent ? null : emailResult.reason,
  });
});

// Get all users (admin only)
router.get('/users', authenticateToken, requireRole('admin'), async (req, res) => {
  const users = await db.all(`
    SELECT id, name, email, role, permissions, created_at, is_active, is_verified,
      must_change_password, invite_expires_at, last_login, lock_until
    FROM users
    ORDER BY created_at DESC
  `);
  const access = await db.all(`
    SELECT pa.user_id, p.id, p.name
    FROM project_access pa
    JOIN projects p ON pa.project_id = p.id
    WHERE p.is_active = 1
    ORDER BY p.name
  `);
  const byUser = access.reduce((map, row) => {
    if (!map[row.user_id]) map[row.user_id] = [];
    map[row.user_id].push({ id: row.id, name: row.name });
    return map;
  }, {});
  res.json(users.map(user => ({
    ...user,
    invite_expired: Boolean(!user.is_verified && user.invite_expires_at && new Date(user.invite_expires_at).getTime() < Date.now()),
    projects: user.role === 'admin' ? [] : (byUser[user.id] || [])
  })));
});

// Update user role/status/access
router.patch('/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const { role, is_active, permissions, project_ids } = req.body;
  const updates = [];
  const values = [];
  if (role) {
    updates.push('role = ?');
    values.push(role);
    if (permissions === undefined) {
      updates.push('permissions = ?');
      values.push(JSON.stringify(defaultPermissionsForRole(role)));
    }
  }
  if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
  if (permissions !== undefined) { updates.push('permissions = ?'); values.push(typeof permissions === 'string' ? permissions : JSON.stringify(permissions)); }

  const old = await db.get('SELECT id, name, email, role, permissions, is_active FROM users WHERE id = ?', req.params.id);
  if (!old) return res.status(404).json({ error: 'User not found' });
  if (old.role === 'admin' && old.id !== req.user.id && role && role !== old.role) {
    return res.status(403).json({ error: 'One admin cannot change another admin role' });
  }
  if (!updates.length && project_ids === undefined) return res.status(400).json({ error: 'Nothing to update' });

  await db.transaction(async tx => {
    if (updates.length) {
      values.push(req.params.id);
      await tx.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, ...values);
    }

    if (project_ids !== undefined) {
      await tx.run('DELETE FROM project_access WHERE user_id = ?', req.params.id);
      const finalRole = role || old.role;
      if (finalRole !== 'admin' && Array.isArray(project_ids)) {
        for (const projectId of project_ids.filter(Boolean)) {
          await tx.run('INSERT INTO project_access (user_id, project_id, granted_by) VALUES (?, ?, ?) ON CONFLICT (user_id, project_id) DO NOTHING', req.params.id, projectId, req.user.id);
        }
      }
    }
  });

  await logAudit(db, req.user.id, 'UPDATE', 'users', req.params.id, old, { role, is_active, permissions, project_ids }, 'User role/status/access updated');
  res.json({ message: 'User updated' });
});

router.delete('/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const old = await db.get('SELECT id, name, email, role, is_active FROM users WHERE id = ?', req.params.id);
  if (!old) return res.status(404).json({ error: 'User not found' });
  if (old.role === 'admin') {
    return res.status(403).json({ error: 'Admin accounts cannot be deleted by another admin' });
  }

  await db.transaction(async tx => {
    await tx.run('DELETE FROM project_access WHERE user_id = ?', req.params.id);
    await tx.run('DELETE FROM users WHERE id = ?', req.params.id);
  });

  await logAudit(db, req.user.id, 'DELETE', 'users', req.params.id, old, null, 'User account deleted by admin');
  res.json({ message: 'User deleted' });
});

module.exports = router;
