import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getInvite, setInvitePassword } from '../api';
import { useAuth } from '../context/AuthContext';

function PasswordHelp() {
  return (
    <div className="text-muted" style={{fontSize:'12px', lineHeight:1.6}}>
      Minimum 10 characters with uppercase, lowercase, number, and symbol.
    </div>
  );
}

export default function SetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [invite, setInvite] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    logout();
    getInvite(token)
      .then(res => setInvite(res.data))
      .catch(err => toast.error(err.response?.data?.error || 'Invite link is invalid'))
      .finally(() => setLoading(false));
  }, [token, logout]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      await setInvitePassword(token, password);
      toast.success('Password set. Please sign in.');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to set password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>HICC-SRC JV</h1>
          <p>Set Your Password</p>
        </div>
        {loading ? (
          <div className="page-loading"><div className="spinner"></div></div>
        ) : !invite ? (
          <div>
            <div className="alert alert-danger">Invite link is invalid or expired.</div>
            <Link to="/login" className="btn btn-secondary" style={{width:'100%', justifyContent:'center'}}>Back to Login</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="alert alert-success" style={{fontSize:'12px'}}>
              Account: <strong>{invite.name}</strong><br />{invite.email}
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input className="form-control" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required />
              <PasswordHelp />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input className="form-control" type={showPassword ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </div>
            <div className="form-group" style={{marginTop:'-6px'}}>
              <label style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:'var(--text2)', cursor:'pointer'}}>
                <input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} />
                Show password
              </label>
            </div>
            <button type="submit" className="btn btn-primary" style={{width:'100%', justifyContent:'center'}} disabled={saving}>
              {saving ? 'Saving...' : 'Set Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
