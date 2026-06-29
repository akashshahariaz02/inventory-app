import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getAuditLog, getProjects, getUsers } from '../api';
import { formatDateTimeBD } from '../utils/dates';

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ event_type: '', user_id: '', action: '', table_name: '', project_id: '', from_date: '', to_date: '' });

  const load = () => {
    setLoading(true);
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    getAuditLog(params)
      .then(res => setLogs(res.data))
      .catch(() => toast.error('Failed to load activity log'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    Promise.all([getUsers(), getProjects()])
      .then(([uRes, pRes]) => {
        setUsers(uRes.data);
        setProjects(pRes.data);
      })
      .catch(() => {});
  }, []);

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  const resetFilters = () => {
    const empty = { event_type: '', user_id: '', action: '', table_name: '', project_id: '', from_date: '', to_date: '' };
    setFilters(empty);
    setLoading(true);
    getAuditLog()
      .then(res => setLogs(res.data))
      .catch(() => toast.error('Failed to load activity log'))
      .finally(() => setLoading(false));
  };

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
        <div className="filters">
          <select className="form-control" value={filters.event_type} onChange={e => setFilter('event_type', e.target.value)}>
            <option value="">All Events</option>
            <option value="auth">Auth Events</option>
            <option value="invite">Invite Events</option>
            <option value="password">Password Events</option>
          </select>
          <select className="form-control" value={filters.action} onChange={e => setFilter('action', e.target.value)}>
            <option value="">All Actions</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="INVITE_RESENT">Invite Resent</option>
            <option value="PASSWORD_SET">Password Set</option>
            <option value="PASSWORD_RESET">Password Reset</option>
            <option value="PASSWORD_CHANGED">Password Changed</option>
            <option value="LOGIN_SUCCESS">Login Success</option>
            <option value="LOGIN_FAILED">Login Failed</option>
          </select>
          <select className="form-control" value={filters.user_id} onChange={e => setFilter('user_id', e.target.value)}>
            <option value="">All Users</option>
            {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
          <select className="form-control" value={filters.table_name} onChange={e => setFilter('table_name', e.target.value)}>
            <option value="">All Modules</option>
            <option value="users">Users</option>
            <option value="requests">Requests</option>
            <option value="procurements">Procurements</option>
            <option value="issues">Issues</option>
            <option value="products">Products</option>
            <option value="quotations">Quotations</option>
            <option value="database_backup">Database Backup</option>
          </select>
          <select className="form-control" value={filters.project_id} onChange={e => setFilter('project_id', e.target.value)}>
            <option value="">All Projects</option>
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <input className="form-control" type="date" value={filters.from_date} onChange={e => setFilter('from_date', e.target.value)} />
          <input className="form-control" type="date" value={filters.to_date} onChange={e => setFilter('to_date', e.target.value)} />
          <button className="btn btn-primary" onClick={load}>Apply</button>
          <button className="btn btn-secondary" onClick={resetFilters}>Reset</button>
        </div>
        <div className="card">
          <div className="table-container">
            {loading ? <div className="page-loading"><div className="spinner"></div></div> : (
              <table className="responsive-table">
                <thead>
                  <tr><th>Time</th><th>User</th><th>Action</th><th>Record</th><th>Why / Reason</th></tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr className="no-hover"><td colSpan={5} className="text-muted" style={{textAlign:'center', padding:'40px'}}>No activity yet</td></tr>
                  ) : logs.map(log => (
                    <tr key={log.id} className="no-hover">
                      <td data-label="Time" className="text-muted">{formatDateTimeBD(log.created_at)}</td>
                      <td data-label="User">
                        <strong>{log.user_name || 'System'}</strong>
                        {log.user_email && <div className="text-muted" style={{fontSize:'11px'}}>{log.user_email}</div>}
                      </td>
                      <td data-label="Action"><span className={`badge ${log.action === 'DELETE' ? 'badge-danger' : log.action === 'CREATE' ? 'badge-success' : 'badge-warning'}`}>{describe(log)}</span></td>
                      <td data-label="Record" className="text-muted">{log.record_id || '-'}</td>
                      <td data-label="Why / Reason">{log.reason || '-'}</td>
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
