import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProjects } from '../api';

const icons = {
  dashboard: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V7zM13 7a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1h-6a1 1 0 01-1-1V7zM13 15a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1h-6a1 1 0 01-1-1v-2zM3 17a1 1 0 011-1h6a1 1 0 011 1v0a1 1 0 01-1 1H4a1 1 0 01-1-1v0z"/></svg>,
  inventory: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>,
  procurement: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>,
  issue: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>,
  requests: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>,
  quotations: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>,
  reports: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>,
  projects: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>,
  back: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7"/></svg>,
  activity: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  users: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>,
  profile: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a8.25 8.25 0 1115 0"/></svg>,
  settings: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.5 6h3m-7.2 7.5l1.5 2.6m8.4-2.6l-1.5 2.6M12 10a2 2 0 100 4 2 2 0 000-4zm8.25 2a8.25 8.25 0 11-16.5 0 8.25 8.25 0 0116.5 0z"/></svg>,
  logout: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
};

export default function Sidebar({ pendingCount, isOpen, onClose }) {
  const { user, logout, isAdmin, isManager, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const projectId = location.pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const activeProject = projects.find(project => project.id === projectId);
  const selectedProjectLabel = activeProject?.name || 'Selected Project';

  useEffect(() => {
    if (user) getProjects().then(r => setProjects(r.data)).catch(() => {});
  }, [user]);

  const handleLogout = () => { logout(); onClose?.(); navigate('/login'); };

  const initials = user?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <h1 className="brand-name"><span className="brand-hicc">HICC</span>-<span className="brand-src">SRC</span>&nbsp;<span className="brand-jv">JV</span></h1>
        <span>Inventory Management</span>
      </div>

      <nav>
        {!projectId ? (
          <>
            <span className="nav-section">Main</span>
            <NavLink to="/projects" end onClick={onClose} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              {icons.projects} Projects
            </NavLink>
            {projects.map(project => (
              <NavLink key={project.id} to={`/projects/${project.id}/dashboard`} onClick={onClose} className="nav-link nav-sub-link">
                {icons.projects} {project.name}
              </NavLink>
            ))}
            {(isAdmin || hasPermission('Manage Users')) && (
              <>
                <span className="nav-section">Admin</span>
                <NavLink to="/users" onClick={onClose} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
                  {icons.users} Users & Roles
                </NavLink>
                <NavLink to="/activity" onClick={onClose} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
                  {icons.activity} Activity Log
                </NavLink>
                <NavLink to="/settings" onClick={onClose} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
                  {icons.settings} Settings
                </NavLink>
              </>
            )}
          </>
        ) : (
          <>
            <span className="nav-section">Project</span>
            <NavLink to="/projects" onClick={onClose} className="nav-link">
              {icons.back} Back to Projects
            </NavLink>
            <NavLink to={`/projects/${projectId}/dashboard`} onClick={onClose} className="nav-link nav-sub-link">
              {icons.projects} {selectedProjectLabel}
            </NavLink>
            <span className="nav-section">Menu</span>
            <NavLink to={`/projects/${projectId}/dashboard`} end onClick={onClose} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              {icons.dashboard} Dashboard
            </NavLink>
            <NavLink to={`/projects/${projectId}/inventory`} onClick={onClose} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              {icons.inventory} Inventory
            </NavLink>

            {isManager && (
              <>
                <span className="nav-section">Transactions</span>
                <NavLink to={`/projects/${projectId}/procurement`} onClick={onClose} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
                  {icons.procurement} IN / Procurement
                </NavLink>
                <NavLink to={`/projects/${projectId}/issues`} onClick={onClose} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
                  {icons.issue} OUT / Issue
                </NavLink>
              </>
            )}

            <span className="nav-section">Manage</span>
            <NavLink to={`/projects/${projectId}/requests`} onClick={onClose} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              {icons.requests} Requests
              {pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
            </NavLink>
            <NavLink to={`/projects/${projectId}/quotations`} onClick={onClose} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              {icons.quotations} Quotations
            </NavLink>
            <NavLink to={`/projects/${projectId}/reports`} onClick={onClose} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              {icons.reports} Reports
            </NavLink>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="avatar" style={{overflow:'hidden'}}>
            {user?.avatar_url ? <img src={user.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : initials}
          </div>
          <div className="user-info">
            <p>{user?.name}</p>
            <span>{user?.role?.replace('_', ' ')}</span>
          </div>
        </div>
        <NavLink to="/profile" onClick={onClose} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`} style={{marginBottom:'8px'}}>
          {icons.profile} My Profile
        </NavLink>
        <button className="btn-logout" onClick={handleLogout}>
          {icons.logout} Sign Out
        </button>
      </div>
    </aside>
  );
}
