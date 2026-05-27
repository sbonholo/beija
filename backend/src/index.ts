import express from 'express';
import cors from 'cors';
import http from 'http';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { initSocket } from './socket.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import eventRoutes from './routes/events.js';
import reactionRoutes from './routes/reactions.js';
import matchRoutes from './routes/matches.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: config.isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
}));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('not allowed by CORS'));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d' }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});
app.use('/api', globalLimiter);

// Stricter limit for auth endpoints to slow down OTP abuse
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});
app.use('/api/auth', authLimiter);

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});
app.use('/api/reactions', writeLimiter);
app.use('/api/matches', writeLimiter);

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});
app.use('/api/profile/me/photo', uploadLimiter);

const safetyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});
app.use('/api/users', safetyLimiter);

// Rate limit event browsing to prevent attendance scraping
const eventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});
app.use('/api/events', eventLimiter);

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'beija', time: Date.now() }));

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/reactions', reactionRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = typeof err?.message === 'string' ? err.message : String(err ?? 'unknown');
  if (config.isProd) {
    // Avoid leaking internal paths or query details in production logs
    console.error('[error]', err?.code ?? 'ERR', msg.slice(0, 120));
  } else {
    console.error('[error]', err);
  }
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file_too_large' });
  if (msg === 'invalid_image_type') return res.status(400).json({ error: 'invalid_image_type' });
  res.status(500).json({ error: 'internal_error' });
});

const server = http.createServer(app);
initSocket(server);

server.listen(config.port, () => {
  console.log(`[beija] listening on http://localhost:${config.port}`);
});
