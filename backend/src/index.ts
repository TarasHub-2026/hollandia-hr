import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runMigrations } from './db/migrations';
import employeesRouter    from './routes/employees';
import leaveRequestsRouter from './routes/leaveRequests';
import authRouter          from './routes/auth';
import auditRouter         from './routes/audit';
import exportRouter        from './routes/export';
import { secureStoredPins } from './middleware/security';

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
app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '1mb' }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'hollandia-hr-api',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/employees',          employeesRouter);
app.use('/api/leave-requests',     leaveRequestsRouter);
app.use('/api/auth',               authRouter);
app.use('/api/audit',              auditRouter);
app.use('/api/export',             exportRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
runMigrations();
secureStoredPins();
app.listen(PORT, () => {
  console.log(`[Hollandia HR API] Running on port ${PORT}`);
});
