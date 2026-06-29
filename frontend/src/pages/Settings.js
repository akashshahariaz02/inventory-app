import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { createBackup, getBackups, restoreBackup } from '../api';
import { formatDateTimeBD } from '../utils/dates';

function formatSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [backups, setBackups] = useState([]);
  const [backupDir, setBackupDir] = useState('');
  const [driveStatus, setDriveStatus] = useState({ driveAvailable: true, folderExists: true, error: '' });
  const [busy, setBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState('');
  const [confirm, setConfirm] = useState('');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');

  const loadBackups = async () => {
    setLoading(true);
    try {
      const res = await getBackups();
      setBackups(res.data.backups || []);
      setBackupDir(res.data.backupDir || '');
      setDriveStatus({
        driveAvailable: res.data.driveAvailable !== false,
        folderExists: res.data.folderExists !== false,
        error: res.data.error || ''
      });
      setRestoreFile(res.data.backups?.[0]?.fileName || '');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBackups(); }, []);

  useEffect(() => {
    document.body.classList.toggle('theme-dark', darkMode);
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const handleCreateBackup = async () => {
    setBusy(true);
    try {
      const res = await createBackup();
      toast.success(`Backup created: ${res.data.fileName}`);
      await loadBackups();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Backup failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) return toast.error('Select a backup file');
    if (confirm !== 'RESTORE') return toast.error('Type RESTORE to confirm');
    if (!window.confirm('Restore will replace current database data. Continue?')) return;

    setBusy(true);
    try {
      const res = await restoreBackup({ fileName: restoreFile, confirm });
      toast.success(res.data.message || 'Database restored');
      setConfirm('');
      await loadBackups();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={handleCreateBackup} disabled={busy || !driveStatus.driveAvailable}>
            {busy ? 'Working...' : 'Create Backup'}
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Appearance</h3>
            </div>
            <div className="card-body">
              <label className="toggle-row">
                <span>
                  <strong>Dark Mode</strong>
                  <small>Use a darker interface for low-light work.</small>
                </span>
                <input type="checkbox" checked={darkMode} onChange={e => setDarkMode(e.target.checked)} />
              </label>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Google Drive Backup</h3>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Google Drive Folder</label>
                <input className="form-control" value={backupDir} disabled />
              </div>
              {!driveStatus.driveAvailable ? (
                <div className="alert alert-danger" style={{marginBottom: 0}}>
                  Google Drive is not connected on this server. Install Google Drive for desktop, sign in, and make sure this folder is available.
                </div>
              ) : !driveStatus.folderExists ? (
                <div className="alert alert-warning" style={{marginBottom: 0}}>
                  Google Drive is connected, but this backup folder does not exist yet. Create the folder or click Create Backup.
                </div>
              ) : (
                <div className="alert alert-success" style={{marginBottom: 0}}>
                  Google Drive backup folder is available. Manual and daily backups will be saved here.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card mt-4">
          <div className="card-header">
            <h3 className="card-title">Database Backups</h3>
            <button className="btn btn-secondary btn-sm" onClick={loadBackups} disabled={loading}>Refresh</button>
          </div>
          <div className="table-container">
            {loading ? (
              <div className="page-loading"><div className="spinner"></div></div>
            ) : !driveStatus.driveAvailable ? (
              <div className="empty-state">Google Drive is not connected</div>
            ) : backups.length === 0 ? (
              <div className="empty-state">No backups found</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Backup File</th>
                    <th>Size</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map(backup => (
                    <tr key={backup.fileName} className="no-hover">
                      <td><strong>{backup.fileName}</strong></td>
                      <td>{formatSize(backup.size)}</td>
                      <td>{formatDateTimeBD(backup.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card mt-4">
          <div className="card-header">
            <h3 className="card-title">Restore Database</h3>
          </div>
          <div className="card-body">
            <div className="alert alert-warning">
              Restore replaces current database data. The backend creates an emergency backup before restore, but you should still use this only when necessary.
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Backup File</label>
                <select className="form-control" value={restoreFile} onChange={e => setRestoreFile(e.target.value)} disabled={!driveStatus.driveAvailable || !backups.length}>
                  {backups.map(backup => <option key={backup.fileName} value={backup.fileName}>{backup.fileName}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Type RESTORE</label>
                <input className="form-control" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="RESTORE" />
              </div>
            </div>
            <button className="btn btn-danger" disabled={busy || !driveStatus.driveAvailable || !backups.length} onClick={handleRestore}>Restore Selected Backup</button>
          </div>
        </div>
      </div>
    </div>
  );
}
