const { v4: uuidv4 } = require('uuid');

async function logAudit(db, userId, action, tableName, recordId, oldValue, newValue, reason) {
  try {
    const projectId = newValue?.project_id || oldValue?.project_id || null;
    await db.run(`
      INSERT INTO audit_log (id, project_id, user_id, action, table_name, record_id, old_value, new_value, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      uuidv4(),
      projectId,
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
