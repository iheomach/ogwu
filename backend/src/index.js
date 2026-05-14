const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
require('dotenv').config();

const authenticate = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = [
  'http://localhost:5173',  // web admin dev
  'http://localhost:4173',  // web admin preview
  process.env.ADMIN_ORIGIN, // https://ogwu-web-admin-client.vercel.app
].filter(Boolean);

app.set('trust proxy', 1); // Railway sits behind a proxy — needed for rate limiting and IP detection

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile app, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());

// ── Rate limiting ─────────────────────────────────────────────────────────────

// Level 1: global — 300 requests per IP per 15 minutes across all routes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Level 2: per-user — 20 requests per user per minute on expensive routes
// keyGenerator reads req.user.id set by authenticate middleware
const userLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please slow down.' },
});

app.use(globalLimiter);

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/auth',                require('./routes/auth'));
app.use('/api/users',               require('./routes/users'));
app.use('/api/doctors',             require('./routes/doctors'));
app.use('/api/encounters',          require('./routes/encounters'));
app.use('/api/providers',           require('./routes/providers'));
app.use('/api/hospitals',           require('./routes/hospitals'));
app.use('/api/integrations/google', require('./routes/google'));

// Expensive routes — per-user limiter applied after authenticate
app.use('/api/triage',       authenticate, userLimiter, require('./routes/triage'));
app.use('/api/threads',      authenticate, userLimiter, require('./routes/threads'));
app.use('/api/appointments', authenticate, userLimiter, require('./routes/appointments'));
app.use('/api/agent',        authenticate, userLimiter, require('./routes/agent'));
app.use('/api/report',       authenticate, userLimiter, require('./routes/report'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
