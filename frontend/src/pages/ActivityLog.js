import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getAuditLog } from '../api';

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuditLog()
      .then(res => setLogs(res.data))
      .catch(() => toast.error('Failed to load activity log'))
      .finally(() => setLoading(false));
  }, []);

  const describe = (log) => {
    const table = log.table_name?.replace('_', ' ');
    if (log.table_name === 'requests') {
      if (log.reason?.toLowerCase().includes('approved')) return 'Approved request';
      if (log.reason?.toLowerCase().includes('rejected')) return 'Rejected request';
      if (log.action === 'CREATE') return 'Created request';
      if (log.action === 'DELETE') return 'Deleted request';
      return 'Updated request';
    }
    if (log.table_name === 'issues' && log.action === 'CREATE') return 'Recorded issue';
    if (log.table_name === 'procurements' && log.action === 'CREATE') return 'Added procurement';
    return `${log.action?.toLowerCase()} ${table}`;
  };

  return (
    <div>
      <div className="page-header">
        <h2>Activity Log</h2>
        <span style={{fontSize:'12px', color:'var(--text3)'}}>Admin only. Records cannot be deleted.</span>
      </div>
      <div className="page-content">
        <div className="card">
          <div className="table-container">
            {loading ? <div className="page-loading"><div className="spinner"></div></div> : (
              <table>
                <thead>
                  <tr><th>Time</th><th>User</th><th>Action</th><th>Record</th><th>Why / Reason</th></tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr className="no-hover"><td colSpan={5} className="text-muted" style={{textAlign:'center', padding:'40px'}}>No activity yet</td></tr>
                  ) : logs.map(log => (
                    <tr key={log.id} className="no-hover">
                      <td className="text-muted">{log.created_at}</td>
                      <td>
                        <strong>{log.user_name || 'System'}</strong>
                        {log.user_email && <div className="text-muted" style={{fontSize:'11px'}}>{log.user_email}</div>}
                      </td>
                      <td><span className={`badge ${log.action === 'DELETE' ? 'badge-danger' : log.action === 'CREATE' ? 'badge-success' : 'badge-warning'}`}>{describe(log)}</span></td>
                      <td className="text-muted">{log.record_id || '-'}</td>
                      <td>{log.reason || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
