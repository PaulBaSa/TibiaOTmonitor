import { io } from 'socket.io-client';

let _socket = null;

export function connectSocket(baseURL) {
  if (_socket) {
    _socket.disconnect();
  }
  _socket = io(baseURL.replace(/\/$/, ''), {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });
  return _socket;
}

export function getSocket() {
  return _socket;
}

export function disconnectSocket() {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}

export function startLogStream(sessionId, file, lines = 100) {
  if (!_socket) throw new Error('Socket not connected');
  _socket.emit('start-log-stream', { sessionId, file, lines });
}

export function stopLogStream() {
  if (!_socket) return;
  _socket.emit('stop-log-stream');
}
