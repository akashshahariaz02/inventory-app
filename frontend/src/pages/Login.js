import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { login } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { loginUser } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login(form.email, form.password);
      loginUser(res.data.token, res.data.user);
      toast.success(`Welcome back, ${res.data.user.name}!`);
      navigate(res.data.user.must_change_password ? '/change-password' : '/projects');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>HICC-SRC JV</h1>
          <p>Professional Inventory Management System</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-control" type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} required placeholder="you@company.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-control" type="password" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} required placeholder="••••••••" />
          </div>
          <button type="submit" className="btn btn-primary" style={{width:'100%', justifyContent:'center', padding:'10px', marginTop:'8px'}} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div style={{marginTop:'14px', textAlign:'center'}}>
          <Link to="/forgot-password" className="text-muted" style={{fontSize:'13px'}}>Forgot password?</Link>
        </div>
      </div>
    </div>
  );
}
