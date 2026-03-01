const sshService = require('../services/sshService');

/**
 * Registers Socket.IO events for real-time log streaming.
 *
 * Client events:
 *   start-log-stream  { sessionId, file, lines? }  — begin tailing a log file
 *   stop-log-stream   {}                            — stop the current tail stream
 *
 * Server emits:
 *   log-data          { chunk }                     — new log output
 *   log-error         { message }                   — error from the stream
 *   log-connected     { file }                      — stream started
 *   log-disconnected  {}                            — stream ended
 */
module.exports = function registerLogSocket(io) {
  io.on('connection', (socket) => {
    let activeStream = null;

    socket.on('start-log-stream', async ({ sessionId, file, lines = 100 }) => {
      // Stop any running stream first
      if (activeStream) {
        try { activeStream.close(); } catch (_) {}
        activeStream = null;
      }

      if (!sshService.isConnected(sessionId)) {
        socket.emit('log-error', { message: 'SSH session not found — please reconnect' });
        return;
      }

      // Sanitize filename
      const safeFile = (file || '').replace(/[^a-zA-Z0-9._-]/g, '');
      if (!safeFile) {
        socket.emit('log-error', { message: 'Invalid log file name' });
        return;
      }

      const filePath = `/home/tibiaOG/logs/${safeFile}`;

      try {
        activeStream = await sshService.tailFile(
          sessionId,
          filePath,
          (chunk) => socket.emit('log-data', { chunk }),
          (errMsg) => socket.emit('log-error', { message: errMsg }),
          lines,
        );
        socket.emit('log-connected', { file: safeFile });
      } catch (err) {
        socket.emit('log-error', { message: `Failed to start log stream: ${err.message}` });
      }
    });

    socket.on('stop-log-stream', () => {
      if (activeStream) {
        try { activeStream.close(); } catch (_) {}
        activeStream = null;
        socket.emit('log-disconnected', {});
      }
    });

    socket.on('disconnect', () => {
      if (activeStream) {
        try { activeStream.close(); } catch (_) {}
        activeStream = null;
      }
    });
  });
};
