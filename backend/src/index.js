const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = [
  'http://localhost:5173',  // web admin dev
  'http://localhost:4173',  // web admin preview
  process.env.ADMIN_ORIGIN, // https://ogwu-web-admin-client.vercel.app
].filter(Boolean);

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/triage', require('./routes/triage'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/encounters', require('./routes/encounters'));
app.use('/api/threads', require('./routes/threads'));
app.use('/api/providers', require('./routes/providers'));
app.use('/api/integrations/google', require('./routes/google'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/agent', require('./routes/agent'));
app.use('/api/report', require('./routes/report'));
app.use('/api/hospitals', require('./routes/hospitals'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
