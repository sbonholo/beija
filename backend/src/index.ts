import express from 'express';
import cors from 'cors';
import http from 'http';
import { config } from './config.js';
import { initSocket } from './socket.js';
import './seed.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import eventRoutes from './routes/events.js';
import reactionRoutes from './routes/reactions.js';
import matchRoutes from './routes/matches.js';

const app = express();

app.use(
  cors({
    origin: config.corsOrigins.length ? config.corsOrigins : true,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'beija', time: Date.now() }));

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/reactions', reactionRoutes);
app.use('/api/matches', matchRoutes);

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
