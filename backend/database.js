const { Pool } = require('pg');

function cleanConnectionString(url) {
  return (url || '').replace(/\?schema=public$/, '');
}

function replacePlaceholders(sql) {
  let index = 0;
  let inSingle = false;
  let inDouble = false;
  let result = '';

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const previous = sql[i - 1];

    if (char === "'" && !inDouble && previous !== '\\') inSingle = !inSingle;
    if (char === '"' && !inSingle && previous !== '\\') inDouble = !inDouble;

    if (char === '?' && !inSingle && !inDouble) {
      index += 1;
      result += `$${index}`;
    } else {
      result += char;
    }
  }

  return result
    .replace(/date\('now'\)/gi, 'CURRENT_DATE')
    .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
}

const databaseUrl = cleanConnectionString(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

async function connectToMaintenanceDb() {
  const url = new URL(databaseUrl);
  const targetDatabase = url.pathname.replace('/', '') || 'postgres';
  url.pathname = '/postgres';
  const maintenancePool = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 10000 });
  return { maintenancePool, targetDatabase };
}

async function ensureDatabaseExists() {
  if (!databaseUrl) throw new Error('DATABASE_URL is required for PostgreSQL');

  const { maintenancePool, targetDatabase } = await connectToMaintenanceDb();
  try {
    const existing = await maintenancePool.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDatabase]);
    if (existing.rowCount === 0) {
      await maintenancePool.query(`CREATE DATABASE "${targetDatabase.replace(/"/g, '""')}"`);
    }
  } finally {
    await maintenancePool.end();
  }
}

async function query(sql, params = [], client = pool) {
  return client.query(replacePlaceholders(sql), params);
}

const db = {
  async query(sql, params = []) {
    return query(sql, params);
  },
  async get(sql, ...params) {
    const result = await query(sql, params);
    return result.rows[0];
  },
  async all(sql, ...params) {
    const result = await query(sql, params);
    return result.rows;
  },
  async run(sql, ...params) {
    const result = await query(sql, params);
    return { changes: result.rowCount, rows: result.rows };
  },
  async exec(sql) {
    return query(sql);
  },
  async transaction(callback) {
    const client = await pool.connect();
    const tx = {
      async get(sql, ...params) {
        const result = await query(sql, params, client);
        return result.rows[0];
      },
      async all(sql, ...params) {
        const result = await query(sql, params, client);
        return result.rows;
      },
      async run(sql, ...params) {
        const result = await query(sql, params, client);
        return { changes: result.rowCount, rows: result.rows };
      },
      async exec(sql) {
        return query(sql, [], client);
      }
    };

    try {
      await client.query('BEGIN');
      const value = await callback(tx);
      await client.query('COMMIT');
      return value;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
  async close() {
    await pool.end();
  }
};

async function initializeDatabase() {
  await ensureDatabaseExists();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin','store_manager','viewer')),
      permissions TEXT DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      is_verified INTEGER DEFAULT 1,
      must_change_password INTEGER DEFAULT 0,
      invite_token_hash TEXT,
      invite_expires_at TIMESTAMP,
      failed_login_count INTEGER DEFAULT 0,
      lock_until TIMESTAMP,
      last_login TIMESTAMP,
      password_changed_at TIMESTAMP,
      reset_code_hash TEXT,
      reset_code_expires_at TIMESTAMP,
      reset_code_attempts INTEGER DEFAULT 0,
      phone TEXT,
      designation TEXT,
      department TEXT,
      address TEXT,
      avatar_url TEXT
    );

    CREATE TABLE IF NOT EXISTS project_access (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      granted_by TEXT REFERENCES users(id),
      granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, project_id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      name TEXT NOT NULL,
      category_id TEXT REFERENCES categories(id),
      size TEXT,
      unit TEXT NOT NULL DEFAULT 'Piece',
      opening_stock REAL DEFAULT 0,
      current_stock REAL DEFAULT 0,
      minimum_stock REAL DEFAULT 0,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT,
      email TEXT,
      address TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS procurements (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      supplier_id TEXT,
      supplier_name TEXT,
      purchase_date DATE NOT NULL,
      challan_number TEXT,
      project TEXT,
      site_location TEXT,
      quantity REAL NOT NULL,
      rate REAL NOT NULL,
      total_amount REAL NOT NULL,
      remarks TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      issue_date DATE NOT NULL,
      issued_to TEXT NOT NULL,
      project TEXT,
      site_location TEXT,
      location TEXT,
      request_number TEXT,
      quantity REAL NOT NULL,
      purpose TEXT,
      approved_by TEXT,
      remarks TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      request_number TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(id),
      requested_by TEXT NOT NULL REFERENCES users(id),
      requester_name TEXT NOT NULL,
      location TEXT,
      quantity REAL NOT NULL,
      purpose TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      approved_by TEXT,
      approved_at TIMESTAMP,
      rejection_reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      product_id TEXT REFERENCES products(id),
      product_name TEXT,
      supplier_name TEXT NOT NULL,
      quote_date DATE NOT NULL,
      quantity REAL DEFAULT 1,
      rate REAL NOT NULL,
      total_amount REAL DEFAULT 0,
      delivery_days INTEGER,
      payment_terms TEXT,
      validity_days INTEGER DEFAULT 30,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','selected','rejected')),
      file_path TEXT,
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      user_id TEXT,
      action TEXT NOT NULL,
      table_name TEXT,
      record_id TEXT,
      old_value TEXT,
      new_value TEXT,
      reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec('ALTER TABLE products DROP CONSTRAINT IF EXISTS products_unit_check');

  await createDatabaseIndexes();

  const { v4: uuidv4 } = require('uuid');
  const bcrypt = require('bcryptjs');
  const defaultProjectId = await ensureDefaultProject();

  const adminExists = await db.get('SELECT id FROM users WHERE email = ?', 'admin@inventory.com');
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    const adminId = uuidv4();
    await db.run('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', adminId, 'System Admin', 'admin@inventory.com', hashedPassword, 'admin');
    await db.run('UPDATE projects SET created_by = ? WHERE id = ? AND created_by IS NULL', adminId, defaultProjectId);
  }

  await seedInventoryProducts(uuidv4);
  await assignExistingUsersToDefaultProject();
  await hardenExistingAuthState();
  await alignOpeningStockHistory(uuidv4);
  const { recalculateAllProductStock } = require('./utils/stock');
  await recalculateAllProductStock(db);
  await optimizeDatabase();
}

async function createDatabaseIndexes() {
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);
    CREATE INDEX IF NOT EXISTS idx_users_verified_active ON users(is_verified, is_active);
    CREATE INDEX IF NOT EXISTS idx_project_access_project ON project_access(project_id);
    CREATE INDEX IF NOT EXISTS idx_products_project ON products(project_id);
    CREATE INDEX IF NOT EXISTS idx_products_project_category ON products(project_id, category_id);
    CREATE INDEX IF NOT EXISTS idx_products_project_name ON products(project_id, name);
    CREATE INDEX IF NOT EXISTS idx_procurements_project_product ON procurements(project_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_procurements_project_date ON procurements(project_id, purchase_date);
    CREATE INDEX IF NOT EXISTS idx_procurements_project_created ON procurements(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_procurements_challan ON procurements(challan_number);
    CREATE INDEX IF NOT EXISTS idx_procurements_supplier ON procurements(supplier_name);
    CREATE INDEX IF NOT EXISTS idx_issues_project_product ON issues(project_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_issues_project_date ON issues(project_id, issue_date);
    CREATE INDEX IF NOT EXISTS idx_issues_project_created ON issues(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_issues_request_number ON issues(request_number);
    CREATE INDEX IF NOT EXISTS idx_issues_site_location ON issues(site_location);
    CREATE INDEX IF NOT EXISTS idx_requests_project_status ON requests(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_requests_project_number ON requests(project_id, request_number);
    CREATE INDEX IF NOT EXISTS idx_requests_requested_by ON requests(requested_by);
    CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_quotations_project_product ON quotations(project_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_quotations_project_status ON quotations(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_quotations_project_date ON quotations(project_id, quote_date);
    CREATE INDEX IF NOT EXISTS idx_audit_project_created ON audit_log(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_log(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_table_record ON audit_log(table_name, record_id);
  `);
}

async function optimizeDatabase() {
  await db.run('ANALYZE');
}

async function ensureDefaultProject() {
  const { v4: uuidv4 } = require('uuid');
  const existing = await db.get("SELECT id FROM projects WHERE name = 'SWTPPP-III'");
  if (existing) return existing.id;
  const admin = await db.get("SELECT id FROM users WHERE email = 'admin@inventory.com'");
  const id = uuidv4();
  await db.run('INSERT INTO projects (id, name, description, created_by) VALUES (?, ?, ?, ?)', id, 'SWTPPP-III', 'Default project for existing inventory data', admin?.id || null);
  return id;
}

async function assignExistingUsersToDefaultProject() {
  const defaultProjectId = await ensureDefaultProject();
  const admin = await db.get("SELECT id FROM users WHERE email = 'admin@inventory.com'");
  const users = await db.all("SELECT id FROM users WHERE role != 'admin'");
  for (const user of users) {
    await db.run(
      'INSERT INTO project_access (user_id, project_id, granted_by) VALUES (?, ?, ?) ON CONFLICT (user_id, project_id) DO NOTHING',
      user.id,
      defaultProjectId,
      admin?.id || null
    );
  }
}

async function hardenExistingAuthState() {
  const bcrypt = require('bcryptjs');
  await db.run('UPDATE users SET is_verified = 1 WHERE is_verified IS NULL');
  await db.run('UPDATE users SET failed_login_count = 0 WHERE failed_login_count IS NULL');

  const admin = await db.get("SELECT id, password FROM users WHERE email = 'admin@inventory.com'");
  if (admin?.password && bcrypt.compareSync('admin123', admin.password)) {
    await db.run('UPDATE users SET must_change_password = 1, is_verified = 1 WHERE id = ?', admin.id);
  }
}

async function seedInventoryProducts(uuidv4) {
  const inventoryProducts = [
    { name: 'Ductile iron pipe, restrained', category: 'Pipe', size: 'DN700', unit: 'Meter', totalIn: 30, balance: 30, minStock: 10 },
    { name: 'HDPE pipe SDR17', category: 'Pipe', size: 'OD 800', unit: 'Meter', totalIn: 1721, balance: 1721, minStock: 100 },
    { name: 'HDPE pipe SDR17', category: 'Pipe', size: 'OD 710', unit: 'Meter', totalIn: 1047, balance: 1047, minStock: 100 },
    { name: 'HDPE pipe SDR17', category: 'Pipe', size: 'OD 560', unit: 'Meter', totalIn: 954, balance: 954, minStock: 50 },
    { name: 'HDPE pipe SDR17', category: 'Pipe', size: 'OD 400', unit: 'Meter', totalIn: 2971, balance: 2971, minStock: 200 },
    { name: '45 degree bend DI', category: 'Fitting', size: 'DN700', unit: 'Piece', totalIn: 8, balance: 8, minStock: 2 },
    { name: '11.25 degree bend HDPE', category: 'Fitting', size: 'OD 800', unit: 'Piece', totalIn: 3, balance: 3, minStock: 1 },
    { name: '22.5 degree bend HDPE', category: 'Fitting', size: 'OD 800', unit: 'Piece', totalIn: 3, balance: 3, minStock: 1 },
    { name: 'DI Tee, Flanged', category: 'Fitting', size: 'DN700/DN400', unit: 'Piece', totalIn: 6, balance: 6, minStock: 2 },
    { name: 'DI Tee, Flanged', category: 'Fitting', size: 'DN500/DN200', unit: 'Piece', totalIn: 6, balance: 6, minStock: 2 },
    { name: 'DI Tee, Flanged', category: 'Fitting', size: 'DN400/DN200', unit: 'Piece', totalIn: 13, balance: 13, minStock: 5 },
    { name: 'Butterfly valve', category: 'Valve', size: 'DN700', unit: 'Piece', totalIn: 1, balance: 1, minStock: 1 },
    { name: 'Gate valve', category: 'Valve', size: 'DN500', unit: 'Piece', totalIn: 3, balance: 3, minStock: 1 },
    { name: 'Single orifice air valve', category: 'Valve', size: 'DN80', unit: 'Piece', totalIn: 1, balance: 1, minStock: 1 },
    { name: 'Double orifice air valve', category: 'Valve', size: 'DN80', unit: 'Piece', totalIn: 4, balance: 4, minStock: 1 },
    { name: 'Dismantling joint', category: 'Fitting', size: 'DN700', unit: 'Piece', totalIn: 1, balance: 1, minStock: 1 },
    { name: 'Dismantling joint', category: 'Fitting', size: 'DN500', unit: 'Piece', totalIn: 3, balance: 3, minStock: 1 },
    { name: 'Flange adapter for HDPE', category: 'Fitting', size: 'DN700/OD800', unit: 'Piece', totalIn: 6, balance: 6, minStock: 2 },
    { name: 'Flange adapter for HDPE', category: 'Fitting', size: 'DN400/OD400', unit: 'Piece', totalIn: 23, balance: 23, minStock: 5 }
  ];

  await db.transaction(async tx => {
    const defaultProjectId = await ensureDefaultProject();
    const admin = await tx.get("SELECT id FROM users WHERE email = 'admin@inventory.com'");

    for (const item of inventoryProducts) {
      await tx.run('INSERT INTO categories (id, name) VALUES (?, ?) ON CONFLICT (name) DO NOTHING', uuidv4(), item.category);
      const category = await tx.get('SELECT id FROM categories WHERE name = ?', item.category);
      let product = await tx.get(`
        SELECT p.id
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE p.project_id = ? AND p.name = ? AND p.size = ? AND c.name = ?
      `, defaultProjectId, item.name, item.size, item.category);

      if (!product) {
        const productId = uuidv4();
        await tx.run(`
          INSERT INTO products (id, project_id, name, category_id, size, unit, opening_stock, current_stock, minimum_stock, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, productId, defaultProjectId, item.name, category.id, item.size, item.unit, item.balance, item.balance, item.minStock, 'Imported from inventory_products seed data');
        product = { id: productId };
      }

      const opening = await tx.get(`
        SELECT id FROM procurements
        WHERE project_id = ? AND product_id = ? AND supplier_name = 'Opening Stock' AND remarks = 'Initial inventory import'
      `, defaultProjectId, product.id);

      if (item.totalIn > 0 && !opening) {
        await tx.run(`
          INSERT INTO procurements (id, project_id, product_id, supplier_name, purchase_date, challan_number, quantity, rate, total_amount, remarks, created_by)
          VALUES (?, ?, ?, 'Opening Stock', CURRENT_DATE, ?, ?, 0, 0, 'Initial inventory import', ?)
        `, uuidv4(), defaultProjectId, product.id, `OPENING-${product.id.slice(0, 8)}`, item.totalIn, admin?.id || null);
      }
    }
  });
}

async function alignOpeningStockHistory(uuidv4) {
  const products = await db.all('SELECT id, project_id, current_stock FROM products');
  const admin = await db.get("SELECT id FROM users WHERE email = 'admin@inventory.com'");

  await db.transaction(async tx => {
    for (const product of products) {
      const totalIn = await tx.get('SELECT COALESCE(SUM(quantity), 0) as total FROM procurements WHERE project_id = ? AND product_id = ?', product.project_id, product.id);
      if (Number(totalIn.total || 0) > 0) continue;

      const totalOut = await tx.get('SELECT COALESCE(SUM(quantity), 0) as total FROM issues WHERE project_id = ? AND product_id = ?', product.project_id, product.id);
      const missingIn = Number(product.current_stock || 0) + Number(totalOut.total || 0);
      if (missingIn > 0) {
        await tx.run(`
          INSERT INTO procurements (id, project_id, product_id, supplier_name, purchase_date, challan_number, quantity, rate, total_amount, remarks, created_by)
          VALUES (?, ?, ?, 'Opening Stock', CURRENT_DATE, ?, ?, 0, 0, 'Initial stock history alignment', ?)
        `, uuidv4(), product.project_id, product.id, `OPENING-ALIGN-${product.id.slice(0, 8)}`, missingIn, admin?.id || null);
      }
    }
  });
}

module.exports = { db, initializeDatabase };
