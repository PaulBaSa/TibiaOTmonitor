const express = require('express');
const { v4: uuidv4 } = require('uuid');
const ping = require('ping');
const sshService = require('../services/sshService');
const { collectMetrics } = require('../services/metricsService');

const router = express.Router();

/**
 * POST /api/connect
 * Establish an SSH connection. Returns a session ID used in subsequent calls.
 * Body: { host, port, username, password?, privateKey?, passphrase?, dbName?, dbUser?, dbPass? }
 */
router.post('/connect', async (req, res) => {
  const { host, port, username, password, privateKey, passphrase } = req.body;

  if (!host || !username) {
    return res.status(400).json({ error: 'host and username are required' });
  }
  if (!password && !privateKey) {
    return res.status(400).json({ error: 'Either password or privateKey is required' });
  }

  const sessionId = uuidv4();
  try {
    await sshService.connect(sessionId, { host, port, username, password, privateKey, passphrase });
    res.json({ sessionId, message: 'Connected successfully' });
  } catch (err) {
    res.status(500).json({ error: `SSH connection failed: ${err.message}` });
  }
});

/**
 * DELETE /api/disconnect/:sessionId
 * Close the SSH session.
 */
router.delete('/disconnect/:sessionId', (req, res) => {
  sshService.disconnect(req.params.sessionId);
  res.json({ message: 'Disconnected' });
});

/**
 * GET /api/status/:sessionId
 * Returns whether the session is still alive.
 */
router.get('/status/:sessionId', (req, res) => {
  const connected = sshService.isConnected(req.params.sessionId);
  res.json({ connected });
});

/**
 * GET /api/metrics/:sessionId
 * Collect and return all server metrics.
 * Query params: dbName, dbUser, dbPass (optional, for player count)
 */
router.get('/metrics/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  if (!sshService.isConnected(sessionId)) {
    return res.status(401).json({ error: 'Session not found — please reconnect' });
  }

  const dbConfig = {
    dbName: req.query.dbName,
    dbUser: req.query.dbUser,
    dbPass: req.query.dbPass,
  };

  try {
    const metrics = await collectMetrics(sessionId, dbConfig);
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: `Failed to collect metrics: ${err.message}` });
  }
});

/**
 * GET /api/ping/:sessionId
 * Measure ICMP latency from the backend to the Tibia server host.
 */
router.get('/ping/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  if (!sshService.isConnected(sessionId)) {
    return res.status(401).json({ error: 'Session not found' });
  }

  // Retrieve the host from the stored session config
  const session = sshService.sessions.get(sessionId);
  if (!session) return res.status(401).json({ error: 'Session not found' });

  const host = session.config.host;

  try {
    const result = await ping.promise.probe(host, {
      timeout: 5,
      extra: ['-c', '3'],
    });
    res.json({
      host,
      alive: result.alive,
      latencyMs: result.alive ? parseFloat(result.avg) : null,
      min: result.alive ? parseFloat(result.min) : null,
      max: result.alive ? parseFloat(result.max) : null,
    });
  } catch (err) {
    // Some environments restrict ICMP; fall back gracefully
    res.json({ host, alive: null, latencyMs: null, error: err.message });
  }
});

/**
 * GET /api/logs/files/:sessionId
 * List available log files in the Tibia logs directory.
 */
router.get('/logs/files/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  if (!sshService.isConnected(sessionId)) {
    return res.status(401).json({ error: 'Session not found' });
  }

  try {
    const { stdout } = await sshService.exec(
      sessionId,
      'ls -1t /home/tibiaOG/logs/ 2>/dev/null',
    );
    const files = stdout.split('\n').map((f) => f.trim()).filter(Boolean);
    res.json({ directory: '/home/tibiaOG/logs', files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/logs/tail/:sessionId
 * Return the last N lines of a log file (non-streaming, one-shot).
 * Query: file (filename inside /home/tibiaOG/logs/), lines (default 200)
 */
router.get('/logs/tail/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { file, lines = '200' } = req.query;

  if (!sshService.isConnected(sessionId)) {
    return res.status(401).json({ error: 'Session not found' });
  }
  if (!file) {
    return res.status(400).json({ error: 'file query param is required' });
  }

  // Sanitize filename — only allow safe characters
  const safeFile = file.replace(/[^a-zA-Z0-9._-]/g, '');
  const safePath = `/home/tibiaOG/logs/${safeFile}`;

  try {
    const { stdout, stderr } = await sshService.exec(
      sessionId,
      `tail -n ${parseInt(lines, 10) || 200} "${safePath}" 2>&1`,
    );
    res.json({ file: safeFile, lines: stdout.split('\n') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/debug/:sessionId
 * Runs each metric command individually and returns raw stdout/stderr/exit code.
 * Useful for diagnosing why a metric is showing wrong values.
 * Remove or gate behind an env flag before exposing publicly.
 */
router.get('/debug/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  if (!sshService.isConnected(sessionId)) {
    return res.status(401).json({ error: 'Session not found — please reconnect' });
  }

  const commands = {
    serverProcess:   `(pgrep -f 'tfs|tibia|forgottenserver|otserv|canary') > /dev/null 2>&1 && echo running || echo stopped`,
    pgrep_raw:       `pgrep -f 'tfs|tibia|forgottenserver|otserv|canary'`,
    ps_all:          `ps -eo pid,comm,args | grep -Ei 'tfs|tibia|forgottenserver|otserv|canary' | grep -v grep`,
    port7171:        `ss -tlnp 2>/dev/null | grep ':7171'`,
    port7172:        `ss -tlnp 2>/dev/null | grep ':7172'`,
    connections7171: `ss -tn 2>/dev/null | grep ':7171'`,
    hostname:        `hostname`,
    cpu:             `cat /proc/stat | head -1`,
    memory:          `free -b | awk 'NR==2{printf "{\\"used\\":%d,\\"total\\":%d}", $3, $2}'`,
    uptime:          `cat /proc/uptime`,
    whoami:          `whoami`,
  };

  const results = {};
  for (const [name, cmd] of Object.entries(commands)) {
    try {
      const { stdout, stderr, code } = await sshService.exec(sessionId, cmd);
      results[name] = { stdout, stderr, code };
    } catch (err) {
      results[name] = { error: err.message };
    }
  }

  res.json(results);
});

module.exports = router;
