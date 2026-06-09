const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { db } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
const execFileAsync = promisify(execFile);

const BACKUP_DIR = process.env.BACKUP_DIR || 'C:\\inventory-backups';
const PG_BIN = process.env.PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin';
const DATABASE_NAME = getDatabaseName();
const DB_CONFIG = getDatabaseConfig();

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function getDatabaseConfig() {
  const url = new URL((process.env.DATABASE_URL || '').replace(/\?schema=public$/, ''));
  return {
    host: url.hostname || 'localhost',
    port: url.port || '5432',
    user: decodeURIComponent(url.username || 'postgres'),
    password: decodeURIComponent(url.password || ''),
    database: (url.pathname || '/inventorymanagement').replace('/', '')
  };
}

function getDatabaseName() {
  try {
    return getDatabaseConfig().database || 'inventorymanagement';
  } catch {
    return 'inventorymanagement';
  }
}

function ensureBackupDir() {
  const parsed = path.parse(BACKUP_DIR);
  if (parsed.root && !fs.existsSync(parsed.root)) {
    throw new Error(`Backup drive is not available: ${parsed.root}. Install/start Google Drive for desktop and check BACKUP_DIR.`);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function toolPath(name) {
  return path.join(PG_BIN, `${name}.exe`);
}

function backupFileName() {
  const stamp = new Date()
    .toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '')
    .slice(0, 15);
  return `${DATABASE_NAME}_${stamp}.dump`;
}

function safeBackupPath(fileName) {
  if (!/^[\w.-]+\.dump$/.test(fileName)) throw new Error('Invalid backup file name');
  const fullPath = path.join(BACKUP_DIR, fileName);
  if (!fullPath.startsWith(path.resolve(BACKUP_DIR))) throw new Error('Invalid backup path');
  return fullPath;
}

function listBackupFiles() {
  ensureBackupDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter(name => name.startsWith(`${DATABASE_NAME}_`) && name.endsWith('.dump'))
    .map(name => {
      const fullPath = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(fullPath);
      return {
        fileName: name,
        size: stat.size,
        createdAt: stat.mtime
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function runPgDump(filePath) {
  await execFileAsync(toolPath('pg_dump'), [
    '-h', DB_CONFIG.host,
    '-p', DB_CONFIG.port,
    '-U', DB_CONFIG.user,
    '-d', DB_CONFIG.database,
    '-F', 'c',
    '-f', filePath
  ], {
    env: { ...process.env, PGPASSWORD: DB_CONFIG.password },
    timeout: 120000
  });
}

async function runPgRestore(filePath) {
  await execFileAsync(toolPath('pg_restore'), [
    '-h', DB_CONFIG.host,
    '-p', DB_CONFIG.port,
    '-U', DB_CONFIG.user,
    '-d', DB_CONFIG.database,
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-acl',
    filePath
  ], {
    env: { ...process.env, PGPASSWORD: DB_CONFIG.password },
    timeout: 180000
  });
}

function pruneBackups() {
  const backups = listBackupFiles();
  for (const backup of backups.slice(30)) {
    fs.unlinkSync(path.join(BACKUP_DIR, backup.fileName));
  }
}

router.get('/backups', authenticateToken, requireRole('admin'), asyncHandler(async (req, res) => {
  const parsed = path.parse(BACKUP_DIR);
  const driveAvailable = !parsed.root || fs.existsSync(parsed.root);
  const folderExists = fs.existsSync(BACKUP_DIR);
  const backups = driveAvailable && folderExists ? listBackupFiles() : [];

  res.json({
    backupDir: BACKUP_DIR,
    driveAvailable,
    folderExists,
    error: driveAvailable ? null : `Google Drive is not connected or mounted at ${parsed.root}`,
    backups
  });
}));

router.post('/backups', authenticateToken, requireRole('admin'), asyncHandler(async (req, res) => {
  ensureBackupDir();
  const fileName = backupFileName();
  const filePath = path.join(BACKUP_DIR, fileName);

  await runPgDump(filePath);
  pruneBackups();

  await logAudit(db, req.user.id, 'CREATE', 'database_backup', fileName, null, { backup_dir: BACKUP_DIR }, 'Database backup created');
  res.status(201).json({ message: 'Backup created', fileName, backupDir: BACKUP_DIR });
}));

router.post('/restore', authenticateToken, requireRole('admin'), asyncHandler(async (req, res) => {
  const { fileName, confirm } = req.body || {};
  if (confirm !== 'RESTORE') return res.status(400).json({ error: 'Type RESTORE to confirm database restore' });
  if (!fileName) return res.status(400).json({ error: 'Backup file is required' });

  const restorePath = safeBackupPath(fileName);
  if (!fs.existsSync(restorePath)) return res.status(404).json({ error: 'Backup file not found' });

  const emergencyFileName = `${DATABASE_NAME}_before_restore_${backupFileName().replace(`${DATABASE_NAME}_`, '')}`;
  const emergencyPath = path.join(BACKUP_DIR, emergencyFileName);
  await runPgDump(emergencyPath);
  await runPgRestore(restorePath);
  await logAudit(db, req.user.id, 'RESTORE', 'database_backup', fileName, null, { emergency_backup: emergencyFileName }, 'Database restored from backup');

  res.json({ message: 'Database restored. Restart backend after restore.', emergencyBackup: emergencyFileName });
}));

module.exports = router;
