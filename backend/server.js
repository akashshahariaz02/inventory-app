require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { db, initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/products', require('./routes/products'));
app.use('/api/procurements', require('./routes/procurements'));
app.use('/api/issues', require('./routes/issues'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/settings', require('./routes/settings'));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await db.get('SELECT 1');
    res.json({ status: 'ok', database: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'unavailable', timestamp: new Date().toISOString() });
  }
});

// 404 handler
app.use('/api/*', (req, res) => res.status(404).json({ error: 'Route not found' }));

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/build/index.html')));
}

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

let server;

async function startServer() {
  await initializeDatabase();
  server = app.listen(PORT, () => {
    console.log(`\n🚀 Inventory Server running on http://localhost:${PORT}`);
    console.log(`📊 API Base: http://localhost:${PORT}/api`);
  });
  return server;
}

function shutdown(signal) {
  console.log(`\n${signal} received. Closing server and database...`);
  if (!server) {
    db.close()
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Database shutdown error:', err.message);
        process.exit(1);
      });
    return;
  }
  server.close(() => {
    db.close()
      .then(() => process.exit(0))
      .catch(err => {
      console.error('Database shutdown error:', err.message);
      process.exit(1);
    });
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

if (require.main === module) {
  startServer().catch(err => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
}

module.exports = { app, startServer, shutdown };
