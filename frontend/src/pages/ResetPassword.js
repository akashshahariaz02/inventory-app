import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { resetPassword } from '../api';

export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: location.state?.email || '',
    code: '',
    new_password: '',
    confirm_password: ''
  });
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.new_password !== form.confirm_password) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      await resetPassword({ email: form.email, code: form.code, new_password: form.new_password });
      toast.success('Password reset. Please sign in.');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>HICC-SRC JV</h1>
          <p>Reset Password</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-control" type="email" value={form.email} onChange={e => set('email', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Email Code</label>
            <input className="form-control" value={form.code} onChange={e => set('code', e.target.value.replace(/\D/g, '').slice(0, 6))} required placeholder="6-digit code" />
          </div>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input className="form-control" type={showPassword ? 'text' : 'password'} value={form.new_password} onChange={e => set('new_password', e.target.value)} required />
            <div className="text-muted" style={{fontSize:'12px'}}>Minimum 10 characters with uppercase, lowercase, number, and symbol.</div>
          </div>
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input className="form-control" type={showPassword ? 'text' : 'password'} value={form.confirm_password} onChange={e => set('confirm_password', e.target.value)} required />
          </div>
          <div className="form-group" style={{marginTop:'-6px'}}>
            <label style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:'var(--text2)', cursor:'pointer'}}>
              <input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} />
              Show password
            </label>
          </div>
          <button type="submit" className="btn btn-primary" style={{width:'100%', justifyContent:'center'}} disabled={saving}>
            {saving ? 'Saving...' : 'Reset Password'}
          </button>
        </form>
        <div style={{marginTop:'14px', textAlign:'center'}}>
          <Link to="/forgot-password" className="text-muted" style={{fontSize:'13px'}}>Request a new code</Link>
        </div>
      </div>
    </div>
  );
}
