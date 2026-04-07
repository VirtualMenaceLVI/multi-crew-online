'use strict';

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const apiRoutes = require('./api-routes');

const app = express();
const PORT = process.env.PORT || 3000;
const DEV_MODE = process.env.NODE_ENV !== 'production';

// ── Middleware ─────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth-only rate limiter to prevent brute-force login attempts.
// The general API rate limiter has been removed — the game's 1-second polling
// and multi-crew physics ticks generate far too many legitimate requests for a
// blanket IP limit to be useful without causing real gameplay problems.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' }
});
app.use('/api/auth', authLimiter);

// Simple request logger in dev mode
if (DEV_MODE) {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ── Static Files ───────────────────────────────────────────────────────────────

// Serve the public directory (CSS, JS)
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

// Serve the root index.html
app.use(express.static(path.join(__dirname, '..')));

// ── API Routes ─────────────────────────────────────────────────────────────────

app.use('/api', apiRoutes);

// ── Health Check ───────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: DEV_MODE ? 'development' : 'production',
    timestamp: new Date().toISOString()
  });
});

// ── SPA Fallback ───────────────────────────────────────────────────────────────
// All other routes serve index.html so the client-side router handles them.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ── Error Handler ──────────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('[Server Error]', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║       MULTI-CREW ONLINE - DEV SERVER     ║
  ╚══════════════════════════════════════════╝
  Mode   : ${DEV_MODE ? 'DEVELOPMENT (JSON files)' : 'PRODUCTION'}
  Port   : ${PORT}
  URL    : http://localhost:${PORT}
  `);
});

module.exports = app;
