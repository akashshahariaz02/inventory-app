require('dotenv').config();

const assert = require('assert');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const PORT = process.env.TEST_PORT || '5055';
const BASE_URL = `http://localhost:${PORT}/api`;
const TEST_PASSWORD = 'TestPass123!';
const databaseUrl = (process.env.DATABASE_URL || '').replace(/\?schema=public$/, '');

if (!databaseUrl) {
  console.error('DATABASE_URL is required to run tests');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const ids = {
  project: `test-project-${uuidv4()}`,
  admin: `test-admin-${uuidv4()}`,
  viewer: `test-viewer-${uuidv4()}`,
  prefix: `SMOKE-${Date.now()}`
};

let server;
let token;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {})
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { res, data };
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const { res, data } = await request('/health');
      if (res.ok && data.status === 'ok') return;
    } catch {
      await wait(500);
    }
  }
  throw new Error('Test server did not start');
}

async function setup() {
  const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 12);
  await pool.query('INSERT INTO projects (id, name, description, created_by, is_active) VALUES ($1, $2, $3, $4, 1)', [
    ids.project,
    `${ids.prefix} Project`,
    'Automated smoke test project',
    ids.admin
  ]);
  await pool.query(`
    INSERT INTO users (id, name, email, password, role, is_active, is_verified, must_change_password, failed_login_count)
    VALUES ($1, $2, $3, $4, 'admin', 1, 1, 0, 0)
  `, [ids.admin, `${ids.prefix} Admin`, `${ids.prefix.toLowerCase()}@example.com`, passwordHash]);
  await pool.query(`
    INSERT INTO users (id, name, email, password, role, is_active, is_verified, must_change_password, failed_login_count)
    VALUES ($1, $2, $3, $4, 'viewer', 1, 1, 0, 0)
  `, [ids.viewer, `${ids.prefix} Viewer`, `${ids.prefix.toLowerCase()}-viewer@example.com`, passwordHash]);
}

async function cleanup() {
  await pool.query('DELETE FROM audit_log WHERE record_id LIKE $1 OR user_id IN ($2, $3)', [`${ids.prefix}%`, ids.admin, ids.viewer]);
  await pool.query('DELETE FROM issues WHERE project_id = $1', [ids.project]);
  await pool.query('DELETE FROM requests WHERE project_id = $1', [ids.project]);
  await pool.query('DELETE FROM procurements WHERE project_id = $1', [ids.project]);
  await pool.query('DELETE FROM quotations WHERE project_id = $1', [ids.project]);
  await pool.query('DELETE FROM products WHERE project_id = $1', [ids.project]);
  await pool.query('DELETE FROM project_access WHERE project_id = $1 OR user_id IN ($2, $3)', [ids.project, ids.admin, ids.viewer]);
  await pool.query('DELETE FROM projects WHERE id = $1', [ids.project]);
  await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [ids.admin, ids.viewer]);
}

async function startServer() {
  process.env.PORT = PORT;
  const serverModule = require('../server');
  server = await serverModule.startServer();
  await waitForServer();
}

async function stopServer() {
  if (server) await new Promise(resolve => server.close(resolve));
}

async function testAuth() {
  const blocked = await request('/products');
  assert.strictEqual(blocked.res.status, 401, 'protected route should require token');

  const login = await request('/auth/login', {
    method: 'POST',
    body: { email: `${ids.prefix.toLowerCase()}@example.com`, password: TEST_PASSWORD }
  });
  assert.strictEqual(login.res.status, 200, 'admin login should work');
  assert.ok(login.data.token, 'login should return token');
  token = login.data.token;
}

async function testProductProcurementIssue() {
  const createProduct = await request('/products', {
    method: 'POST',
    token,
    body: {
      project_id: ids.project,
      name: `${ids.prefix} Pipe`,
      category_id: null,
      size: 'DN100',
      unit: 'Piece',
      opening_stock: 100,
      supplier_name: 'Smoke Supplier',
      purchase_date: '2026-06-09',
      rate: 50,
      minimum_stock: 5,
      description: 'Smoke test product'
    }
  });
  assert.strictEqual(createProduct.res.status, 201, 'product creation should work');
  const productId = createProduct.data.id;

  const procurements = await request(`/procurements?project_id=${ids.project}`, { token });
  assert.strictEqual(procurements.res.status, 200, 'procurements should load');
  const opening = procurements.data.find(row => row.product_id === productId);
  assert.ok(opening, 'opening procurement should be created');
  assert.strictEqual(opening.supplier_name, 'Smoke Supplier', 'opening procurement should use actual supplier');
  assert.ok(String(opening.challan_number).startsWith('IN-'), 'opening procurement should use IN auto challan');

  const issue = await request('/issues', {
    method: 'POST',
    token,
    body: {
      project_id: ids.project,
      product_id: productId,
      issue_date: '2026-06-09',
      issued_to: 'Smoke Receiver',
      site_location: 'Smoke Site',
      quantity: 25,
      purpose: 'Smoke test issue'
    }
  });
  assert.strictEqual(issue.res.status, 201, 'issue creation should work');
  assert.strictEqual(Number(issue.data.new_stock), 75, 'issue should reduce stock');

  const badIssue = await request('/issues', {
    method: 'POST',
    token,
    body: {
      project_id: ids.project,
      product_id: productId,
      issue_date: '2026-06-09',
      issued_to: 'Smoke Receiver',
      quantity: -1
    }
  });
  assert.strictEqual(badIssue.res.status, 400, 'negative issue quantity should be blocked');

  return productId;
}

async function testRequestApproval(productId) {
  const req = await request('/requests', {
    method: 'POST',
    token,
    body: {
      project_id: ids.project,
      location: 'Smoke Site',
      purpose: 'Smoke request',
      items: [{ product_id: productId, quantity: 10 }]
    }
  });
  assert.strictEqual(req.res.status, 201, 'request creation should work');

  const approve = await request(`/requests/${req.data.id}/approve`, { method: 'PATCH', token });
  assert.strictEqual(approve.res.status, 200, 'request approval should work');

  const issues = await request(`/issues?project_id=${ids.project}`, { token });
  const autoIssue = issues.data.find(row => row.request_number === req.data.request_number);
  assert.ok(autoIssue, 'approved request should create issue');
}

async function testReports() {
  const report = await request(`/reports/summary?project_id=${ids.project}&from_date=2026-06-01&to_date=2026-06-30`, { token });
  assert.strictEqual(report.res.status, 200, 'summary report should load');
  assert.ok(Array.isArray(report.data.productReport), 'summary report should include product report');
  assert.ok(Array.isArray(report.data.projectTotals), 'summary report should include project totals');
  assert.ok(Array.isArray(report.data.categoryTotals), 'summary report should include category totals');
  assert.ok(Array.isArray(report.data.supplierTotals), 'summary report should include supplier totals');
  assert.ok(Array.isArray(report.data.dateTotals), 'summary report should include date totals');
}

async function testFailedLoginLock() {
  const email = `${ids.prefix.toLowerCase()}-viewer@example.com`;
  let lastStatus = 0;
  for (let i = 0; i < 25; i += 1) {
    const attempt = await request('/auth/login', {
      method: 'POST',
      body: { email, password: 'WrongPass123!' }
    });
    lastStatus = attempt.res.status;
  }
  assert.strictEqual(lastStatus, 429, '25th failed login should trigger lock response');

  const locked = await request('/auth/login', {
    method: 'POST',
    body: { email, password: TEST_PASSWORD }
  });
  assert.ok([423, 429].includes(locked.res.status), 'locked user should not be able to login immediately');
}

async function run() {
  try {
    await cleanup();
    await setup();
    await startServer();
    await testAuth();
    const productId = await testProductProcurementIssue();
    await testRequestApproval(productId);
    await testReports();
    await testFailedLoginLock();
    console.log('\nSmoke tests passed.');
  } finally {
    await stopServer();
    await cleanup();
    await pool.end();
    const { db } = require('../database');
    await db.close();
  }
}

run().catch(err => {
  console.error('\nSmoke tests failed:');
  console.error(err);
  process.exit(1);
});
