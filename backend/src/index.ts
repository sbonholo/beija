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

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(
  cors({
    origin: config.corsOrigins.length ? config.corsOrigins : false,
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
  max: 5,
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

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'beija', time: Date.now() }));

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/reactions', reactionRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/users', userRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err?.message || err);
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file_too_large' });
  if (err?.message === 'invalid_image_type') return res.status(400).json({ error: 'invalid_image_type' });
  res.status(500).json({ error: 'internal_error' });
});

const server = http.createServer(app);
initSocket(server);

server.listen(config.port, () => {
  console.log(`[beija] listening on http://localhost:${config.port}`);
});
