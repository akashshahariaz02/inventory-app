import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { updateProfile } from '../api';
import { useAuth } from '../context/AuthContext';

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Profile() {
  const { user, loginUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    designation: user?.designation || '',
    department: user?.department || '',
    address: user?.address || '',
    avatar_url: user?.avatar_url || ''
  });
  const [saving, setSaving] = useState(false);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please select an image file');
    if (file.size > 350 * 1024) return toast.error('Image must be 350 KB or smaller');
    try {
      set('avatar_url', await readImageAsDataUrl(file));
    } catch {
      toast.error('Failed to read image');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await updateProfile(form);
      const token = localStorage.getItem('token');
      loginUser(token, res.data.user);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>My Profile</h2>
      </div>
      <div className="page-content">
        <div className="card" style={{maxWidth:'720px'}}>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="flex gap-2" style={{alignItems:'center', marginBottom:'18px'}}>
                <div className="avatar" style={{width:'72px',height:'72px',fontSize:'20px',overflow:'hidden'}}>
                  {form.avatar_url ? <img src={form.avatar_url} alt="Profile" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : form.name?.slice(0,2).toUpperCase()}
                </div>
                <div>
                  <label className="btn btn-secondary btn-sm">
                    Upload Photo
                    <input type="file" accept="image/*" onChange={handleImage} style={{display:'none'}} />
                  </label>
                  {form.avatar_url && <button type="button" className="btn btn-danger btn-sm" style={{marginLeft:'8px'}} onClick={() => set('avatar_url', '')}>Remove</button>}
                  <div className="text-muted" style={{fontSize:'12px', marginTop:'6px'}}>Use a square image, max 350 KB.</div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-control" value={user?.email || ''} disabled />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-control" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+880..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Designation</label>
                  <input className="form-control" value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="Store Manager" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Department</label>
                <input className="form-control" value={form.department} onChange={e => set('department', e.target.value)} placeholder="Procurement, Store, Admin..." />
              </div>

              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-control" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Optional personal address" />
              </div>

              <div className="flex gap-2" style={{flexWrap:'wrap'}}>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/change-password')}>Change Password</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
