import { io, type Socket } from 'socket.io-client';
import { API_URL, refreshSession, session } from '@/api/client';

/**
 * Live connection to the API (Socket.IO). The server pushes chat messages, read receipts,
 * "typing…" signals and new notifications to this user's private channel.
 */
let socket: Socket | null = null;

export function connectRealtime(): Socket {
  if (socket) return socket;
  const s = io(API_URL, {
    // Read at every (re)connection, so a refreshed access token is picked up.
    auth: (cb) => cb({ token: session.getAccessToken() }),
    transports: ['websocket'],
  });
  // Rejections by the server (expired token) are not retried automatically: refresh, then retry.
  s.on('connect_error', async (err) => {
    if (err.message === 'TOKEN_INVALID' && (await refreshSession())) s.connect();
  });
  socket = s;
  return s;
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
}

export const getSocket = () => socket;
