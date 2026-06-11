import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 30000,
});

// Attach token to every request
API.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
API.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const login = (email, password) => API.post('/auth/login', { email, password });
export const getMe = () => API.get('/auth/me');
export const registerUser = (data) => API.post('/auth/register', data);
export const getUsers = () => API.get('/auth/users');
export const updateUser = (id, data) => API.patch(`/auth/users/${id}`, data);
export const deleteUser = (id) => API.delete(`/auth/users/${id}`);
export const getInvite = (token) => API.get(`/auth/invite/${token}`);
export const setInvitePassword = (token, password) => API.post(`/auth/invite/${token}/set-password`, { password });
export const changePassword = (data) => API.post('/auth/change-password', data);
export const resendInvite = (id) => API.post(`/auth/users/${id}/resend-invite`);
export const updateProfile = (data) => API.put('/auth/profile', data);
export const forgotPassword = (email) => API.post('/auth/forgot-password', { email });
export const resetPassword = (data) => API.post('/auth/reset-password', data);

// Projects
export const getProjects = () => API.get('/projects');
export const getProject = (id) => API.get(`/projects/${id}`);
export const createProject = (data) => API.post('/projects', data);

// Products
export const getProducts = (params) => API.get('/products', { params });
export const getProduct = (id) => API.get(`/products/${id}`);
export const createProduct = (data) => API.post('/products', data);
export const updateProduct = (id, data) => API.put(`/products/${id}`, data);
export const deleteProduct = (id) => API.delete(`/products/${id}`);
export const getCategories = () => API.get('/products/meta/categories');
export const createCategory = (data) => API.post('/products/meta/categories', data);

// Procurements (IN)
export const getProcurements = (params) => API.get('/procurements', { params });
export const createProcurement = (data) => API.post('/procurements', data);
export const updateProcurement = (id, data) => API.put(`/procurements/${id}`, data);
export const deleteProcurement = (id) => API.delete(`/procurements/${id}`);
export const getSuppliers = () => API.get('/procurements/meta/suppliers');

// Issues (OUT)
export const getIssues = (params) => API.get('/issues', { params });
export const createIssue = (data) => API.post('/issues', data);
export const updateIssue = (id, data) => API.put(`/issues/${id}`, data);
export const deleteIssue = (id) => API.delete(`/issues/${id}`);
export const getLocations = () => API.get('/issues/meta/locations');

// Requests
export const getRequests = (params) => API.get('/requests', { params });
export const createRequest = (data) => API.post('/requests', data);
export const updateRequest = (id, data) => API.put(`/requests/${id}`, data);
export const deleteRequest = (id) => API.delete(`/requests/${id}`);
export const approveRequest = (id) => API.patch(`/requests/${id}/approve`);
export const rejectRequest = (id, reason) => API.patch(`/requests/${id}/reject`, { reason });

// Reports & Dashboard
export const getDashboard = (params) => API.get('/reports/dashboard', { params });
export const getReport = (params) => API.get('/reports/summary', { params });
export const getAuditLog = (params) => API.get('/reports/audit', { params });
export const getQuotations = (params) => API.get('/reports/quotations', { params });
export const createQuotation = (data) => API.post('/reports/quotations', data);
export const updateQuotation = (id, data) => API.put(`/reports/quotations/${id}`, data);
export const deleteQuotation = (id) => API.delete(`/reports/quotations/${id}`);
export const selectQuotation = (id) => API.patch(`/reports/quotations/${id}/select`);

// Settings
export const getBackups = () => API.get('/settings/backups');
export const createBackup = (data) => API.post('/settings/backups', data);
export const restoreBackup = (data) => API.post('/settings/restore', data);

export default API;
