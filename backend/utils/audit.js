const { v4: uuidv4 } = require('uuid');

function logAudit(db, userId, action, tableName, recordId, oldValue, newValue, reason) {
  try {
    db.prepare(`
      INSERT INTO audit_log (id, user_id, action, table_name, record_id, old_value, new_value, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      userId || null,
      action,
      tableName,
      recordId || null,
      oldValue == null ? null : JSON.stringify(oldValue),
      newValue == null ? null : JSON.stringify(newValue),
      reason || null
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { logAudit };
