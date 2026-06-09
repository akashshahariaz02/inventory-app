import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { getRequests } from './api';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Procurement from './pages/Procurement';
import Issues from './pages/Issues';
import Requests from './pages/Requests';
import Quotations from './pages/Quotations';
import Reports from './pages/Reports';
import Users from './pages/Users';
import ActivityLog from './pages/ActivityLog';
import Projects from './pages/Projects';
import SetPassword from './pages/SetPassword';
import ChangePassword from './pages/ChangePassword';
import Profile from './pages/Profile';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Settings from './pages/Settings';
import './index.css';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading"><div className="spinner"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password && window.location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/projects" replace />;
  return children;
}

function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const currentProjectId = location.pathname.match(/^\/projects\/([^/]+)/)?.[1];

  useEffect(() => {
    if (user && currentProjectId) {
      getRequests({ status: 'pending', project_id: currentProjectId }).then(r => setPendingCount(r.data.length)).catch(() => {});
      const interval = setInterval(() => {
        getRequests({ status: 'pending', project_id: currentProjectId }).then(r => setPendingCount(r.data.length)).catch(() => {});
      }, 30000);
      return () => clearInterval(interval);
    }
    setPendingCount(0);
  }, [user, currentProjectId]);

  return (
    <div className={`app-layout ${sidebarOpen ? 'sidebar-visible' : ''}`}>
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
        <span></span>
        <span></span>
        <span></span>
      </button>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <Sidebar pendingCount={pendingCount} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/projects/:projectId" element={<Navigate to="dashboard" replace />} />
          <Route path="/projects/:projectId/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/projects/:projectId/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
          <Route path="/projects/:projectId/procurement" element={<ProtectedRoute roles={['admin','store_manager']}><Procurement /></ProtectedRoute>} />
          <Route path="/projects/:projectId/issues" element={<ProtectedRoute roles={['admin','store_manager']}><Issues /></ProtectedRoute>} />
          <Route path="/projects/:projectId/requests" element={<ProtectedRoute><Requests /></ProtectedRoute>} />
          <Route path="/projects/:projectId/quotations" element={<ProtectedRoute><Quotations /></ProtectedRoute>} />
          <Route path="/projects/:projectId/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/activity" element={<ProtectedRoute roles={['admin']}><ActivityLog /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute roles={['admin']}><Users /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute roles={['admin']}><Settings /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    document.body.classList.toggle('theme-dark', localStorage.getItem('theme') === 'dark');
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" toastOptions={{ duration: 3000, style: { fontSize: '13px' } }} />
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/set-password/:token" element={<SetPassword />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading"><div className="spinner"></div></div>;
  if (user) return <Navigate to={user.must_change_password ? '/change-password' : '/projects'} replace />;
  return children;
}
