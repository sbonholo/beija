import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  // Return existing socket even when disconnected — socket.io-client handles
  // reconnection internally. Creating a new instance on disconnect leaks listeners.
  if (socket) return socket;
  const url =
    import.meta.env.VITE_SOCKET_URL ||
    import.meta.env.VITE_API_URL ||
    null;
  if (!url) return null;
  socket = io(url, {
    autoConnect: true,
    transports: ['websocket', 'polling'],
    auth: { token: getToken() },
  });
  return socket;
}

export function closeSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function refreshSocketAuth(): Socket | null {
  closeSocket();
  return getSocket();
}
