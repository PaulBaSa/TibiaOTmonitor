const { Client } = require('ssh2');

/**
 * Manages SSH connections keyed by session ID.
 * Each session corresponds to one SSH connection to a Tibia server.
 */
class SSHService {
  constructor() {
    // Map<sessionId, { client: Client, config: object, lastUsed: Date, streams: Set }>
    this.sessions = new Map();
    this._startCleanupTimer();
  }

  /**
   * Establish a new SSH connection and return a session ID.
   */
  async connect(sessionId, config) {
    // Close existing session if reconnecting with same ID
    if (this.sessions.has(sessionId)) {
      this.disconnect(sessionId);
    }

    return new Promise((resolve, reject) => {
      const conn = new Client();
      const timeout = setTimeout(() => {
        conn.destroy();
        reject(new Error('SSH connection timed out after 15 seconds'));
      }, 15000);

      conn.on('ready', () => {
        clearTimeout(timeout);
        this.sessions.set(sessionId, {
          client: conn,
          config,
          lastUsed: new Date(),
          streams: new Set(),
        });
        resolve({ success: true });
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        this.sessions.delete(sessionId);
        reject(err);
      });

      conn.on('close', () => {
        const session = this.sessions.get(sessionId);
        if (session) {
          session.streams.forEach((s) => { try { s.close(); } catch (_) {} });
          this.sessions.delete(sessionId);
        }
      });

      const connectConfig = {
        host: config.host,
        port: parseInt(config.port, 10) || 22,
        username: config.username,
        readyTimeout: 15000,
        keepaliveInterval: 10000,
      };

      if (config.privateKey) {
        connectConfig.privateKey = config.privateKey;
        if (config.passphrase) connectConfig.passphrase = config.passphrase;
      } else {
        connectConfig.password = config.password;
      }

      conn.connect(connectConfig);
    });
  }

  /**
   * Execute a single command over SSH and return stdout/stderr.
   */
  async exec(sessionId, command) {
    const session = this._getSession(sessionId);
    session.lastUsed = new Date();

    return new Promise((resolve, reject) => {
      session.client.exec(command, (err, stream) => {
        if (err) return reject(err);

        let stdout = '';
        let stderr = '';

        stream.on('data', (data) => { stdout += data.toString(); });
        stream.stderr.on('data', (data) => { stderr += data.toString(); });
        stream.on('close', (code) => {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
        });
        stream.on('error', reject);
      });
    });
  }

  /**
   * Start a `tail -f` stream on a remote file.
   * Returns the stream so the caller can close it.
   */
  async tailFile(sessionId, filePath, onData, onError, lines = 100) {
    const session = this._getSession(sessionId);
    session.lastUsed = new Date();

    return new Promise((resolve, reject) => {
      const cmd = `tail -n ${lines} -f "${filePath}" 2>&1`;
      session.client.exec(cmd, (err, stream) => {
        if (err) return reject(err);

        session.streams.add(stream);

        stream.on('data', (data) => onData(data.toString()));
        stream.stderr.on('data', (data) => onError(data.toString()));
        stream.on('close', () => session.streams.delete(stream));
        stream.on('error', (e) => { onError(e.message); session.streams.delete(stream); });

        resolve(stream);
      });
    });
  }

  disconnect(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.streams.forEach((s) => { try { s.close(); } catch (_) {} });
      try { session.client.end(); } catch (_) {}
      this.sessions.delete(sessionId);
    }
  }

  isConnected(sessionId) {
    return this.sessions.has(sessionId);
  }

  _getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('SSH session not found — please reconnect');
    return session;
  }

  /** Clean up sessions that have been idle longer than SESSION_EXPIRY_MINUTES */
  _startCleanupTimer() {
    const expiryMs = (parseInt(process.env.SESSION_EXPIRY_MINUTES, 10) || 30) * 60 * 1000;
    setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions.entries()) {
        if (now - session.lastUsed.getTime() > expiryMs) {
          console.log(`[SSH] Closing idle session ${id}`);
          this.disconnect(id);
        }
      }
    }, 60 * 1000);
  }
}

module.exports = new SSHService();
