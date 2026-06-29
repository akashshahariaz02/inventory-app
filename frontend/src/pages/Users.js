import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { deleteUser, getProjects, getUsers, registerUser, resendInvite, updateUser } from '../api';
import { useAuth } from '../context/AuthContext';
import { PERMISSION_ITEMS, defaultPermissions, normalizePermissions } from '../utils/permissions';
import { formatDateBD, formatDateTimeBD } from '../utils/dates';

export default function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [inviteResult, setInviteResult] = useState(null);
  const [permissionDraft, setPermissionDraft] = useState({});
  const [projectDraft, setProjectDraft] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', role: 'viewer', project_ids: [] });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [res, projectRes] = await Promise.all([getUsers(), getProjects()]);
      const normalized = res.data.map(user => ({
        ...user,
        permissions: normalizePermissions(user.permissions),
      }));
      setUsers(normalized);
      setProjects(projectRes.data);
    }
    catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await registerUser(form);
      setInviteResult(res.data);
      toast.success(res.data.email_sent ? 'Verification email sent successfully' : 'User created, but email failed');
      if (!res.data.email_sent && res.data.email_error) toast.error(res.data.email_error);
      setShowModal(false);
      setForm({ name: '', email: '', role: 'viewer', project_ids: [] });
      load();
    } catch (err) { toast.error(err.response?.data?.error || err.message || 'Failed to create user'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (id, is_active) => {
    try {
      await updateUser(id, { is_active: !is_active });
      toast.success(is_active ? 'User deactivated' : 'User activated');
      load();
    } catch { toast.error('Failed'); }
  };

  const handleDeleteUser = async (targetUser) => {
    if (!window.confirm(`Delete user "${targetUser.name}"? This cannot be undone.`)) return;
    try {
      await deleteUser(targetUser.id);
      toast.success('User deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleRoleChange = async (id, role) => {
    try { await updateUser(id, { role }); toast.success('Role updated'); load(); }
    catch { toast.error('Failed'); }
  };

  const handleResendInvite = async (user) => {
    try {
      const res = await resendInvite(user.id);
      setInviteResult(res.data);
      toast.success(res.data.email_sent ? 'Verification email sent successfully' : 'Invite generated, but email failed');
      if (!res.data.email_sent && res.data.email_error) toast.error(res.data.email_error);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to resend invite');
    }
  };

  const openPermissionsEditor = (user) => {
    setEditingUser(user);
    setPermissionDraft({ ...defaultPermissions(user.role), ...(normalizePermissions(user.permissions) || {}) });
    setProjectDraft((user.projects || []).map(project => project.id));
  };

  const togglePermission = (key) => {
    setPermissionDraft(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSavePermissions = async () => {
    if (!editingUser) return;
    try {
      await updateUser(editingUser.id, { permissions: permissionDraft, project_ids: editingUser.role === 'admin' ? [] : projectDraft });
      toast.success('User access updated');
      setEditingUser(null);
      load();
    } catch { toast.error('Failed to update permissions'); }
  };

  const toggleFormProject = (projectId) => {
    setForm(prev => ({
      ...prev,
      project_ids: prev.project_ids.includes(projectId)
        ? prev.project_ids.filter(id => id !== projectId)
        : [...prev.project_ids, projectId]
    }));
  };

  const toggleDraftProject = (projectId) => {
    setProjectDraft(prev => prev.includes(projectId)
      ? prev.filter(id => id !== projectId)
      : [...prev, projectId]
    );
  };

  const roleColors = { admin: 'badge-danger', store_manager: 'badge-warning', viewer: 'badge-info' };
  const canResendInvite = (u) => !u.is_verified || u.invite_expired;

  return (
    <div>
      <div className="page-header">
        <h2>Users & Roles</h2>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add User</button>
        </div>
      </div>
      <div className="page-content">
        <div className="card">
          <div className="table-container">
            {loading ? <div className="page-loading"><div className="spinner"></div></div> : (
              <table>
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Role</th><th>Projects</th><th>Status</th><th>Security</th><th>Invite Expires</th><th>Created</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="no-hover">
                      <td>
                        <div className="flex gap-2">
                          <div className="avatar" style={{width:'28px',height:'28px',fontSize:'11px'}}>{u.name?.slice(0,2).toUpperCase()}</div>
                          <strong>{u.name}</strong>
                        </div>
                      </td>
                      <td className="text-muted">{u.email}</td>
                      <td>
                        <select
                          className={`badge ${roleColors[u.role]}`}
                          value={u.role}
                          onChange={e => handleRoleChange(u.id, e.target.value)}
                          disabled={u.role === 'admin' && u.id !== user?.id}
                          style={{border:'none',cursor:u.role === 'admin' && u.id !== user?.id ? 'not-allowed' : 'pointer',background:'transparent'}}
                        >
                          <option value="admin">Admin</option>
                          <option value="store_manager">Store Manager</option>
                          <option value="viewer">General User</option>
                        </select>
                      </td>
                      <td>
                        {u.role === 'admin' ? (
                          <span className="badge badge-success">All Projects</span>
                        ) : u.projects?.length ? (
                          <div className="flex gap-2" style={{flexWrap:'wrap'}}>
                            {u.projects.map(project => <span key={project.id} className="badge badge-info">{project.name}</span>)}
                          </div>
                        ) : (
                          <span className="badge badge-danger">No Access</span>
                        )}
                      </td>
                      <td><span className={`badge ${u.is_active ? 'badge-success' : 'badge-neutral'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        {u.is_verified ? (
                          <span className="badge badge-success">Verified</span>
                        ) : u.invite_expired ? (
                          <span className="badge badge-danger">Invite Expired</span>
                        ) : (
                          <span className="badge badge-warning">Pending Verify</span>
                        )}
                        {u.must_change_password ? <span className="badge badge-danger" style={{marginLeft:'6px'}}>Change Password</span> : null}
                      </td>
                      <td className="text-muted">
                        {u.is_verified ? '-' : formatDateTimeBD(u.invite_expires_at)}
                      </td>
                      <td className="text-muted">{formatDateBD(u.created_at)}</td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => openPermissionsEditor(u)} style={{marginRight:'6px'}}>Edit</button>
                        {canResendInvite(u) && <button className="btn btn-sm btn-primary" onClick={() => handleResendInvite(u)} style={{marginRight:'6px'}}>{u.invite_expired ? 'Resend' : 'Invite'}</button>}
                        <button className={`btn btn-sm ${u.is_active ? 'btn-secondary' : 'btn-success'}`} onClick={() => handleToggle(u.id, u.is_active)}>
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        {u.id !== user?.id && u.role !== 'admin' && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleDeleteUser(u)} style={{marginLeft:'6px'}}>
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card" style={{marginTop:'16px'}}>
          <div className="card-header"><span className="card-title">Role Permissions</span></div>
          <div className="card-body">
            <table>
              <thead><tr><th>Permission</th><th>Admin</th><th>Store Manager</th><th>General User</th></tr></thead>
              <tbody>
                {[
                  ['View Dashboard & Reports', '✅', '✅', '✅'],
                  ['View Inventory', '✅', '✅', '✅'],
                  ['Add Products', '✅', '✅', '❌'],
                  ['Edit Products', '✅', '❌', '❌'],
                  ['Delete Products', '✅', '❌', '❌'],
                  ['Add Procurement (IN)', '✅', '✅', '❌'],
                  ['Add Issue (OUT)', '✅', '✅', '❌'],
                  ['Submit Requests', '✅', '✅', '✅'],
                  ['Approve/Reject Requests', '✅', '✅', '❌'],
                  ['Manage Quotations', '✅', '✅', '❌'],
                  ['Manage Users', '✅', '❌', '❌'],
                ].map(([perm, ...cols]) => (
                  <tr key={perm} className="no-hover">
                    <td>{perm}</td>
                    {cols.map((v, i) => <td key={i} style={{fontSize:'16px'}}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editingUser && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingUser(null)}>
          <div className="modal" style={{maxWidth:'560px'}}>
            <div className="modal-header">
              <h3 className="modal-title">Edit Permissions — {editingUser.name}</h3>
              <button className="btn-close" onClick={() => setEditingUser(null)}>×</button>
            </div>
            <div className="modal-body">
              <p className="text-muted" style={{marginBottom:'12px'}}>Use ✔ to enable and ✖ to disable each permission for this user.</p>
              {editingUser.role !== 'admin' && (
                <div className="card" style={{boxShadow:'none', marginBottom:'14px'}}>
                  <div className="card-header"><span className="card-title">Project Access</span></div>
                  <div className="card-body">
                    {projects.length === 0 ? (
                      <div className="text-muted">No projects available</div>
                    ) : projects.map(project => (
                      <label key={project.id} className="flex gap-2" style={{marginBottom:'8px', cursor:'pointer'}}>
                        <input type="checkbox" checked={projectDraft.includes(project.id)} onChange={() => toggleDraftProject(project.id)} />
                        <span>{project.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="card" style={{boxShadow:'none'}}>
                <div className="card-body" style={{padding:'0'}}>
                  <table style={{width:'100%'}}>
                    <tbody>
                      {PERMISSION_ITEMS.map(item => (
                        <tr key={item} className="no-hover">
                          <td style={{padding:'8px 0'}}>{item}</td>
                          <td style={{textAlign:'right', padding:'8px 0'}}>
                            <button type="button" className={`btn btn-sm ${permissionDraft[item] ? 'btn-success' : 'btn-secondary'}`} onClick={() => togglePermission(item)} style={{marginRight:'6px'}}>
                              {permissionDraft[item] ? '✔' : '✖'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingUser(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleSavePermissions}>Save Access</button>
            </div>
          </div>
        </div>
      )}

      {inviteResult && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setInviteResult(null)}>
          <div className="modal" style={{maxWidth:'560px'}}>
            <div className="modal-header">
              <h3 className="modal-title">User Invite Link</h3>
              <button className="btn-close" onClick={() => setInviteResult(null)}>x</button>
            </div>
            <div className="modal-body">
              <div className={`alert ${inviteResult.email_sent ? 'alert-success' : 'alert-warning'}`} style={{fontSize:'13px'}}>
                {inviteResult.email_sent
                  ? 'Verification email sent successfully. Keep this link as a backup.'
                  : `Email failed${inviteResult.email_error ? `: ${inviteResult.email_error}` : ''}. Check SMTP settings or share this link manually.`}
              </div>
              <div className="form-group">
                <label className="form-label">Invite Link</label>
                <input className="form-control" readOnly value={`${window.location.origin}${inviteResult.invite_url}`} onFocus={e => e.target.select()} />
              </div>
              <div className="text-muted" style={{fontSize:'12px'}}>Expires: {formatDateTimeBD(inviteResult.invite_expires_at)}</div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setInviteResult(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}${inviteResult.invite_url}`).then(() => toast.success('Invite link copied'))}>Copy Link</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{maxWidth:'440px'}}>
            <div className="modal-header">
              <h3 className="modal-title">Add New User</h3>
              <button className="btn-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input className="form-control" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input className="form-control" type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-control" value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value, project_ids: e.target.value === 'admin' ? [] : p.project_ids}))}>
                    <option value="admin">Admin</option>
                    <option value="store_manager">Store Manager</option>
                    <option value="viewer">General User</option>
                  </select>
                </div>
                {form.role !== 'admin' && (
                  <div className="form-group">
                    <label className="form-label">Project Access</label>
                    <div className="card" style={{boxShadow:'none'}}>
                      <div className="card-body">
                        {projects.length === 0 ? (
                          <div className="text-muted">Create a project first</div>
                        ) : projects.map(project => (
                          <label key={project.id} className="flex gap-2" style={{marginBottom:'8px', cursor:'pointer'}}>
                            <input type="checkbox" checked={form.project_ids.includes(project.id)} onChange={() => toggleFormProject(project.id)} />
                            <span>{project.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
