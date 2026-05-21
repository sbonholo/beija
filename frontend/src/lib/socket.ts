import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  const url =
    import.meta.env.VITE_SOCKET_URL ||
    import.meta.env.VITE_API_URL ||
    undefined;
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

export function refreshSocketAuth() {
  closeSocket();
  return getSocket();
}
