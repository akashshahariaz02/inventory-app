import React, { createContext, useContext, useState, useEffect } from 'react';
import { getMe } from '../api';
import { defaultPermissions, normalizePermissions } from '../utils/permissions';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('user'));
      return saved ? { ...saved, permissions: normalizePermissions(saved.permissions) } : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      getMe().then(res => {
        const nextUser = { ...res.data.user, permissions: normalizePermissions(res.data.user.permissions) };
        setUser(nextUser);
        localStorage.setItem('user', JSON.stringify(nextUser));
      }).catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const loginUser = (token, userData) => {
    const nextUser = { ...userData, permissions: normalizePermissions(userData.permissions) };
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const effectivePermissions = user?.role === 'admin'
    ? defaultPermissions('admin')
    : {
        ...defaultPermissions(user?.role || 'viewer'),
        ...(user?.permissions || {}),
      };

  const hasPermission = (permission) => Boolean(effectivePermissions[permission]);

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'admin' || user?.role === 'store_manager';

  return (
    <AuthContext.Provider value={{ user, loading, loginUser, logout, isAdmin, isManager, hasPermission, permissions: effectivePermissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
