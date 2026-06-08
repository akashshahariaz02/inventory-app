const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'inventory.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin','store_manager','viewer')),
      permissions TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS project_access (
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      granted_by TEXT,
      granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, project_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(granted_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      name TEXT NOT NULL,
      category_id TEXT,
      size TEXT,
      unit TEXT NOT NULL DEFAULT 'Piece' CHECK(unit IN ('Feet','Meter','Piece','Kg','Liter','Box','Roll')),
      opening_stock REAL DEFAULT 0,
      current_stock REAL DEFAULT 0,
      minimum_stock REAL DEFAULT 0,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT,
      email TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS procurements (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      product_id TEXT NOT NULL,
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
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(product_id) REFERENCES products(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      product_id TEXT NOT NULL,
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
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(product_id) REFERENCES products(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      request_number TEXT NOT NULL,
      product_id TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      location TEXT,
      quantity REAL NOT NULL,
      purpose TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      approved_by TEXT,
      approved_at DATETIME,
      rejection_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(product_id) REFERENCES products(id),
      FOREIGN KEY(requested_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      product_id TEXT,
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
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(product_id) REFERENCES products(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  migrateDatabase();

  const { v4: uuidv4 } = require('uuid');
  const bcrypt = require('bcryptjs');
  const defaultProjectId = ensureDefaultProject();

  const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@inventory.com');
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    const adminId = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)').run(
      adminId,
      'System Admin',
      'admin@inventory.com',
      hashedPassword,
      'admin'
    );
    db.prepare('UPDATE projects SET created_by = ? WHERE id = ? AND created_by IS NULL').run(adminId, defaultProjectId);

    const categories = ['Pipe', 'Fitting', 'Valve', 'Flange', 'Cable', 'Cement', 'Steel', 'Other'];
    const insertCat = db.prepare('INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)');
    categories.forEach(cat => insertCat.run(uuidv4(), cat));

    const catPipe = db.prepare("SELECT id FROM categories WHERE name = 'Pipe'").get();
    const catFitting = db.prepare("SELECT id FROM categories WHERE name = 'Fitting'").get();
    const catValve = db.prepare("SELECT id FROM categories WHERE name = 'Valve'").get();

    const insertProduct = db.prepare(`
      INSERT INTO products (id, project_id, name, category_id, size, unit, opening_stock, current_stock, minimum_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertProduct.run(uuidv4(), defaultProjectId, 'GI Pipe', catPipe.id, '2"', 'Feet', 0, 721, 500);
    insertProduct.run(uuidv4(), defaultProjectId, 'HDPE Pipe', catPipe.id, '4"', 'Meter', 0, 30, 100);
    insertProduct.run(uuidv4(), defaultProjectId, 'MS Pipe', catPipe.id, '1.5"', 'Feet', 0, 1300, 200);
    insertProduct.run(uuidv4(), defaultProjectId, 'Ball Valve', catValve.id, '3"', 'Piece', 0, 88, 20);
    insertProduct.run(uuidv4(), defaultProjectId, 'Elbow 90 deg', catFitting.id, '1"', 'Piece', 0, 12, 50);

    console.log('Database seeded with default admin: admin@inventory.com / admin123');
  }

  seedInventoryProducts(uuidv4);
  assignExistingDataToDefaultProject();
  assignExistingUsersToDefaultProject();
  hardenExistingAuthState();
  alignOpeningStockHistory(uuidv4);
  const { recalculateAllProductStock } = require('./utils/stock');
  recalculateAllProductStock(db);
}

function migrateDatabase() {
  addColumnIfMissing('users', 'permissions', 'TEXT DEFAULT "{}"');
  addColumnIfMissing('users', 'is_verified', 'INTEGER DEFAULT 1');
  addColumnIfMissing('users', 'must_change_password', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'invite_token_hash', 'TEXT');
  addColumnIfMissing('users', 'invite_expires_at', 'DATETIME');
  addColumnIfMissing('users', 'failed_login_count', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'lock_until', 'DATETIME');
  addColumnIfMissing('users', 'last_login', 'DATETIME');
  addColumnIfMissing('users', 'password_changed_at', 'DATETIME');
  addColumnIfMissing('users', 'reset_code_hash', 'TEXT');
  addColumnIfMissing('users', 'reset_code_expires_at', 'DATETIME');
  addColumnIfMissing('users', 'reset_code_attempts', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'phone', 'TEXT');
  addColumnIfMissing('users', 'designation', 'TEXT');
  addColumnIfMissing('users', 'department', 'TEXT');
  addColumnIfMissing('users', 'address', 'TEXT');
  addColumnIfMissing('users', 'avatar_url', 'TEXT');
  addColumnIfMissing('projects', 'description', 'TEXT');
  addColumnIfMissing('projects', 'created_by', 'TEXT');
  addColumnIfMissing('projects', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
  addColumnIfMissing('projects', 'is_active', 'INTEGER DEFAULT 1');
  addColumnIfMissing('products', 'project_id', 'TEXT');
  addColumnIfMissing('procurements', 'project_id', 'TEXT');
  addColumnIfMissing('procurements', 'project', 'TEXT');
  addColumnIfMissing('procurements', 'site_location', 'TEXT');
  addColumnIfMissing('issues', 'project_id', 'TEXT');
  addColumnIfMissing('issues', 'project', 'TEXT');
  addColumnIfMissing('issues', 'site_location', 'TEXT');
  addColumnIfMissing('requests', 'project_id', 'TEXT');
  addColumnIfMissing('quotations', 'project_id', 'TEXT');
  addColumnIfMissing('quotations', 'quantity', 'REAL DEFAULT 1');
  addColumnIfMissing('quotations', 'total_amount', 'REAL DEFAULT 0');
  addColumnIfMissing('audit_log', 'project_id', 'TEXT');
  addColumnIfMissing('audit_log', 'reason', 'TEXT');

  db.prepare('UPDATE quotations SET total_amount = COALESCE(quantity, 1) * rate WHERE total_amount IS NULL OR total_amount = 0').run();
  db.prepare('UPDATE issues SET site_location = location WHERE site_location IS NULL AND location IS NOT NULL').run();

  migrateRequestsForMultipleItems();
  assignExistingDataToDefaultProject();
  assignExistingUsersToDefaultProject();
  hardenExistingAuthState();
}

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(col => col.name);
  if (!columns.includes(column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function ensureDefaultProject() {
  const { v4: uuidv4 } = require('uuid');
  const existing = db.prepare("SELECT id FROM projects WHERE name = 'SWTPPP-III'").get();
  if (existing) return existing.id;
  const admin = db.prepare("SELECT id FROM users WHERE email = 'admin@inventory.com'").get();
  const id = uuidv4();
  db.prepare('INSERT INTO projects (id, name, description, created_by) VALUES (?, ?, ?, ?)').run(
    id,
    'SWTPPP-III',
    'Default project for existing inventory data',
    admin?.id || null
  );
  return id;
}

function assignExistingDataToDefaultProject() {
  const defaultProjectId = ensureDefaultProject();
  for (const table of ['products', 'procurements', 'issues', 'requests', 'quotations', 'audit_log']) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(col => col.name);
    if (columns.includes('project_id')) {
      db.prepare(`UPDATE ${table} SET project_id = ? WHERE project_id IS NULL OR project_id = ''`).run(defaultProjectId);
    }
  }
}

function assignExistingUsersToDefaultProject() {
  const defaultProjectId = ensureDefaultProject();
  const admin = db.prepare("SELECT id FROM users WHERE email = 'admin@inventory.com'").get();
  const users = db.prepare("SELECT id FROM users WHERE role != 'admin'").all();
  const grant = db.prepare('INSERT OR IGNORE INTO project_access (user_id, project_id, granted_by) VALUES (?, ?, ?)');
  for (const user of users) {
    grant.run(user.id, defaultProjectId, admin?.id || null);
  }
}

function hardenExistingAuthState() {
  const bcrypt = require('bcryptjs');
  db.prepare('UPDATE users SET is_verified = 1 WHERE is_verified IS NULL').run();
  db.prepare('UPDATE users SET failed_login_count = 0 WHERE failed_login_count IS NULL').run();

  const admin = db.prepare("SELECT id, password FROM users WHERE email = 'admin@inventory.com'").get();
  if (admin?.password && bcrypt.compareSync('admin123', admin.password)) {
    db.prepare('UPDATE users SET must_change_password = 1, is_verified = 1 WHERE id = ?').run(admin.id);
  }
}

function migrateRequestsForMultipleItems() {
  const requestTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'requests'").get();
  if (!requestTable?.sql?.includes('request_number TEXT UNIQUE')) return;

  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE requests_new (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      request_number TEXT NOT NULL,
      product_id TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      location TEXT,
      quantity REAL NOT NULL,
      purpose TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      approved_by TEXT,
      approved_at DATETIME,
      rejection_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(product_id) REFERENCES products(id),
      FOREIGN KEY(requested_by) REFERENCES users(id)
    );

    INSERT INTO requests_new (
      id, project_id, request_number, product_id, requested_by, requester_name, location, quantity, purpose,
      status, approved_by, approved_at, rejection_reason, created_at
    )
    SELECT
      id, project_id, request_number, product_id, requested_by, requester_name, location, quantity, purpose,
      status, approved_by, approved_at, rejection_reason, created_at
    FROM requests;

    DROP TABLE requests;
    ALTER TABLE requests_new RENAME TO requests;
  `);
  db.pragma('foreign_keys = ON');
}

function seedInventoryProducts(uuidv4) {
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

  const seed = db.transaction(() => {
    const defaultProjectId = ensureDefaultProject();
    const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)');
    const findCategory = db.prepare('SELECT id FROM categories WHERE name = ?');
    const findProduct = db.prepare(`
      SELECT p.id
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.project_id = ? AND p.name = ? AND p.size = ? AND c.name = ?
    `);
    const insertProduct = db.prepare(`
      INSERT INTO products (id, project_id, name, category_id, size, unit, opening_stock, current_stock, minimum_stock, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const findOpeningProcurement = db.prepare(`
      SELECT id FROM procurements
      WHERE project_id = ? AND product_id = ? AND supplier_name = 'Opening Stock' AND remarks = 'Initial inventory import'
    `);
    const insertOpeningProcurement = db.prepare(`
      INSERT INTO procurements (id, project_id, product_id, supplier_name, purchase_date, challan_number, quantity, rate, total_amount, remarks, created_by)
      VALUES (?, ?, ?, 'Opening Stock', date('now'), ?, ?, 0, 0, 'Initial inventory import', ?)
    `);
    const admin = db.prepare("SELECT id FROM users WHERE email = 'admin@inventory.com'").get();

    for (const item of inventoryProducts) {
      insertCategory.run(uuidv4(), item.category);
      const category = findCategory.get(item.category);
      let product = findProduct.get(defaultProjectId, item.name, item.size, item.category);

      if (!product) {
        const productId = uuidv4();
        insertProduct.run(
          productId,
          defaultProjectId,
          item.name,
          category.id,
          item.size,
          item.unit,
          item.balance,
          item.balance,
          item.minStock,
          'Imported from inventory_products seed data'
        );
        product = { id: productId };
      }

      if (item.totalIn > 0 && !findOpeningProcurement.get(defaultProjectId, product.id)) {
        insertOpeningProcurement.run(uuidv4(), defaultProjectId, product.id, `OPENING-${product.id.slice(0, 8)}`, item.totalIn, admin?.id || null);
      }
    }
  });

  seed();
}

function alignOpeningStockHistory(uuidv4) {
  const products = db.prepare('SELECT id, project_id, current_stock FROM products').all();
  const totalIn = db.prepare('SELECT COALESCE(SUM(quantity), 0) as total FROM procurements WHERE project_id = ? AND product_id = ?');
  const totalOut = db.prepare('SELECT COALESCE(SUM(quantity), 0) as total FROM issues WHERE project_id = ? AND product_id = ?');
  const insertAdjustment = db.prepare(`
    INSERT INTO procurements (id, project_id, product_id, supplier_name, purchase_date, challan_number, quantity, rate, total_amount, remarks, created_by)
    VALUES (?, ?, ?, 'Opening Stock', date('now'), ?, ?, 0, 0, 'Initial stock history alignment', ?)
  `);
  const admin = db.prepare("SELECT id FROM users WHERE email = 'admin@inventory.com'").get();

  const align = db.transaction(() => {
    for (const product of products) {
      const existingIn = totalIn.get(product.project_id, product.id).total;
      if (existingIn > 0) continue;

      const missingIn = product.current_stock + totalOut.get(product.project_id, product.id).total;
      if (missingIn > 0) {
        insertAdjustment.run(
          uuidv4(),
          product.project_id,
          product.id,
          `OPENING-ALIGN-${product.id.slice(0, 8)}`,
          missingIn,
          admin?.id || null
        );
      }
    }
  });

  align();
}

module.exports = { db, initializeDatabase };
