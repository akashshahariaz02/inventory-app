import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { changePassword } from '../api';
import { useAuth } from '../context/AuthContext';

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, loginUser } = useAuth();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [saving, setSaving] = useState(false);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.new_password !== form.confirm_password) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      await changePassword({ current_password: form.current_password, new_password: form.new_password });
      const token = localStorage.getItem('token');
      loginUser(token, { ...user, must_change_password: false, is_verified: true });
      toast.success('Password changed');
      navigate('/projects');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Change Password</h2>
      </div>
      <div className="page-content">
        <div className="card" style={{maxWidth:'520px'}}>
          <div className="card-body">
            <div className="alert alert-warning" style={{fontSize:'13px'}}>
              You must change your password before continuing.
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input className="form-control" type="password" value={form.current_password} onChange={e => set('current_password', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input className="form-control" type="password" value={form.new_password} onChange={e => set('new_password', e.target.value)} required />
                <div className="text-muted" style={{fontSize:'12px'}}>Minimum 10 characters with uppercase, lowercase, number, and symbol.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input className="form-control" type="password" value={form.confirm_password} onChange={e => set('confirm_password', e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Change Password'}</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
