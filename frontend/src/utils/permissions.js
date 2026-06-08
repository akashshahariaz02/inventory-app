export const PERMISSION_ITEMS = [
  'View Dashboard & Reports',
  'View Inventory',
  'Add Products',
  'Edit Products',
  'Delete Products',
  'Add Procurement (IN)',
  'Add Issue (OUT)',
  'Submit Requests',
  'Approve/Reject Requests',
  'Manage Quotations',
  'Manage Users',
];

export function defaultPermissions(role = 'viewer') {
  return {
    'View Dashboard & Reports': true,
    'View Inventory': true,
    'Add Products': role === 'admin' || role === 'store_manager',
    'Edit Products': role === 'admin',
    'Delete Products': role === 'admin',
    'Add Procurement (IN)': role === 'admin' || role === 'store_manager',
    'Add Issue (OUT)': role === 'admin' || role === 'store_manager',
    'Submit Requests': true,
    'Approve/Reject Requests': role === 'admin' || role === 'store_manager',
    'Manage Quotations': role === 'admin' || role === 'store_manager',
    'Manage Users': role === 'admin',
  };
}

export function normalizePermissions(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value) || {}; }
    catch { return {}; }
  }
  return value || {};
}
