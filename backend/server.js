require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize DB first
initializeDatabase();

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

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404 handler
app.use('/api/*', (req, res) => res.status(404).json({ error: 'Route not found' }));

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/dist/index.html')));
}

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Inventory Server running on http://localhost:${PORT}`);
  console.log(`📊 API Base: http://localhost:${PORT}/api`);
  console.log(`🔑 Default Login: admin@inventory.com / admin123\n`);
});

module.exports = app;
