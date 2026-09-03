import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runMigrations } from './db/migrations';
import employeesRouter    from './routes/employees';
import leaveRequestsRouter from './routes/leaveRequests';
import webhookRouter       from './routes/webhook';
import syncRouter          from './routes/sync';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map(o => o.trim().toLowerCase());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, Railway health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin.toLowerCase())) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const key = process.env.COGNITO_API_KEY || '';
  res.json({
    status: 'ok',
    service: 'hollandia-hr-api',
    timestamp: new Date().toISOString(),
    cognito_key_set: key.length > 0,
    cognito_key_preview: key.length > 10 ? `${key.slice(0, 10)}...${key.slice(-4)}` : '(not set)',
    cognito_key_length: key.length,
  });
});

app.use('/api/employees',          employeesRouter);
app.use('/api/leave-requests',     leaveRequestsRouter);
app.use('/api/webhook/cognito',    webhookRouter);
app.use('/api/sync',               syncRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
runMigrations();
app.listen(PORT, () => {
  console.log(`[Hollandia HR API] Running on port ${PORT}`);
});
