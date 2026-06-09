require('dotenv').config();

const path = require('path');
const SQLite = require('better-sqlite3');
const { db, initializeDatabase } = require('../database');

const sqlitePath = path.join(__dirname, '..', 'inventory.db');
const sqlite = new SQLite(sqlitePath, { readonly: true });

const tables = [
  'users',
  'projects',
  'categories',
  'suppliers',
  'products',
  'procurements',
  'issues',
  'requests',
  'quotations',
  'project_access',
  'audit_log'
];

function getColumns(table) {
  return sqlite.prepare(`PRAGMA table_info(${table})`).all().map(col => col.name);
}

async function getPostgresColumns(table) {
  const rows = await db.all(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ?
    ORDER BY ordinal_position
  `, table);
  return rows.map(row => row.column_name);
}

function normalizeValue(value) {
  if (value === undefined) return null;
  if (value === '') return null;
  return value;
}

async function clearPostgresTables() {
  for (const table of [...tables].reverse()) {
    await db.run(`DELETE FROM ${table}`);
  }
}

async function copyTable(table) {
  const sqliteColumns = getColumns(table);
  const postgresColumns = await getPostgresColumns(table);
  const columns = sqliteColumns.filter(col => postgresColumns.includes(col));
  if (!columns.length) return 0;

  const rows = sqlite.prepare(`SELECT ${columns.map(col => `"${col}"`).join(', ')} FROM ${table}`).all();
  if (!rows.length) return 0;

  const columnSql = columns.map(col => `"${col}"`).join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const insertSql = `INSERT INTO ${table} (${columnSql}) VALUES (${placeholders})`;

  for (const row of rows) {
    await db.run(insertSql, ...columns.map(col => normalizeValue(row[col])));
  }

  return rows.length;
}

async function migrate() {
  await initializeDatabase();
  await clearPostgresTables();

  const copied = {};
  for (const table of tables) {
    copied[table] = await copyTable(table);
  }

  const { recalculateAllProductStock } = require('../utils/stock');
  await recalculateAllProductStock(db);
  await db.run('ANALYZE');
  await db.close();
  sqlite.close();

  console.log('SQLite to PostgreSQL migration complete:');
  for (const table of tables) {
    console.log(`${table}: ${copied[table]} rows`);
  }
}

migrate().catch(async err => {
  console.error('Migration failed:', err.message);
  try { await db.close(); } catch {}
  try { sqlite.close(); } catch {}
  process.exit(1);
});
