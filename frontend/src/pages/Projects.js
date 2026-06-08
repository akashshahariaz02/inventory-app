import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { createProject, getProjects } from '../api';
import { useAuth } from '../context/AuthContext';

function ProjectModal({ onSave, onClose }) {
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createProject(form);
      toast.success('Project created');
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{maxWidth: 460}}>
        <div className="modal-header">
          <h3 className="modal-title">Create New Project</h3>
          <button className="btn-close" onClick={onClose}>x</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Project Name *</label>
              <input className="form-control" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required placeholder="Project A" />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-control" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} placeholder="Optional notes" />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Create Project'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const { isManager } = useAuth();

  const load = async () => {
    setLoading(true);
    try {
      const res = await getProjects();
      setProjects(res.data);
    } catch {
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="page-header">
        <h2>Projects</h2>
        <div className="header-actions">
          {isManager && <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Create New Project</button>}
        </div>
      </div>
      <div className="page-content">
        <div className="card">
          <div className="table-container">
            {loading ? (
              <div className="page-loading"><div className="spinner"></div></div>
            ) : projects.length === 0 ? (
              <div className="empty-state">No projects found</div>
            ) : (
              <table>
                <thead><tr><th>Project</th><th>Description</th><th>Products</th><th>Created</th><th></th></tr></thead>
                <tbody>
                  {projects.map(project => (
                    <tr key={project.id} className="no-hover">
                      <td><strong>{project.name}</strong></td>
                      <td className="text-muted">{project.description || '-'}</td>
                      <td>{project.product_count || 0}</td>
                      <td className="text-muted">{project.created_at?.slice(0, 10)}</td>
                      <td><button className="btn btn-primary btn-sm" onClick={() => navigate(`/projects/${project.id}/dashboard`)}>Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showModal && <ProjectModal onSave={() => { setShowModal(false); load(); }} onClose={() => setShowModal(false)} />}
    </div>
  );
}
