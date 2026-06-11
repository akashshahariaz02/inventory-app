import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { forgotPassword } from '../api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await forgotPassword(email);
      if (res.data.email_sent === false && res.data.email_error) {
        toast.error(res.data.email_error);
      } else {
        toast.success('Reset code sent if the email exists');
      }
      navigate('/reset-password', { state: { email } });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to request reset code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1 className="brand-name"><span className="brand-hicc">HICC</span>-<span className="brand-src">SRC</span> <span className="brand-jv">JV</span></h1>
          <p>Forgot Password</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" />
          </div>
          <button type="submit" className="btn btn-primary" style={{width:'100%', justifyContent:'center'}} disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Code'}
          </button>
        </form>
        <div style={{marginTop:'14px', textAlign:'center'}}>
          <Link to="/login" className="text-muted" style={{fontSize:'13px'}}>Back to login</Link>
        </div>
      </div>
    </div>
  );
}
