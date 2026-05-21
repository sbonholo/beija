import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { verifyToken } from './auth.js';
import { config } from './config.js';

let io: Server | null = null;

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: config.corsOrigins.length ? config.corsOrigins : true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = (socket.handshake.auth?.token as string) || '';
    const userId = token ? verifyToken(token) : null;
    if (!userId) return next(new Error('unauthorized'));
    socket.data.userId = userId;
    socket.join(`user:${userId}`);
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.on('event:join', (eventId: string) => {
      if (typeof eventId === 'string' && eventId) socket.join(`event:${eventId}`);
    });
    socket.on('event:leave', (eventId: string) => {
      if (typeof eventId === 'string' && eventId) socket.leave(`event:${eventId}`);
    });
    socket.on('disconnect', () => {
      // presence cleanup could go here
      void userId;
    });
  });

  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function emitToEvent(eventId: string, event: string, payload: unknown) {
  if (!io) return;
  io.to(`event:${eventId}`).emit(event, payload);
}
