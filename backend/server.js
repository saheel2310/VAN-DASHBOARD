const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');

const { pool } = require('./db/pool');
const basicAuth = require('./middleware/basicAuth');
const uploadRoutes    = require('./routes/upload');
const dashboardRoutes = require('./routes/dashboard');

const app  = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean);

// Health check for the hosting platform; deliberately before the login.
app.get('/healthz', (_req, res) => res.send('ok'));

app.use(cors({ origin: CORS_ORIGIN }));
app.use(basicAuth());
app.use(express.json({ limit: '1mb' }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use('/api/uploads',   uploadRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// When the frontend has been built (npm run build), serve it from this server too, so a deployment
// is one service on one URL. In development the Vite dev server serves the frontend instead.
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));
  console.log('Serving the built frontend from frontend/dist.');
}

const DB_HINTS = {
  ECONNREFUSED: 'Cannot connect to PostgreSQL. Is it running, and is DATABASE_URL correct?',
  '28P01':      'PostgreSQL rejected the username/password in DATABASE_URL.',
  '3D000':      'The database in DATABASE_URL does not exist. Run "npm run migrate".',
  '42P01':      'Database tables are missing. Run "npm run migrate".',
};

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err.name === 'MulterError') return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: DB_HINTS[err.code] || err.message || 'Internal server error' });
});

app.listen(PORT, async () => {
  console.log(`VAN Dashboard Backend → http://localhost:${PORT}`);
  try {
    const { rows } = await pool.query("SELECT to_regclass('public.party_year_data') IS NOT NULL AS ready");
    console.log(rows[0].ready ? 'PostgreSQL connected.' : `PostgreSQL connected, but ${DB_HINTS['42P01']}`);
  } catch (err) {
    console.error(`PostgreSQL check failed: ${DB_HINTS[err.code] || err.message}`);
  }
});
