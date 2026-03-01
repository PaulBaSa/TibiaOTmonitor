import axios from 'axios';

let _baseURL = '';

export function setBaseURL(url) {
  _baseURL = url.replace(/\/$/, ''); // strip trailing slash
}

export function getBaseURL() {
  return _baseURL;
}

function client() {
  return axios.create({
    baseURL: _baseURL,
    timeout: 20000,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function checkBackendHealth() {
  const res = await client().get('/health');
  return res.data;
}

/**
 * Establish SSH connection.
 * Returns { sessionId }
 */
export async function connectSSH({ host, port, username, password, privateKey, passphrase }) {
  const res = await client().post('/api/connect', {
    host, port, username, password, privateKey, passphrase,
  });
  return res.data;
}

export async function disconnectSSH(sessionId) {
  const res = await client().delete(`/api/disconnect/${sessionId}`);
  return res.data;
}

export async function checkSessionStatus(sessionId) {
  const res = await client().get(`/api/status/${sessionId}`);
  return res.data;
}

/**
 * Fetch all server metrics.
 * @param {string} sessionId
 * @param {{ dbName?, dbUser?, dbPass? }} dbConfig
 */
export async function fetchMetrics(sessionId, dbConfig = {}) {
  const params = {};
  if (dbConfig.dbName) params.dbName = dbConfig.dbName;
  if (dbConfig.dbUser) params.dbUser = dbConfig.dbUser;
  if (dbConfig.dbPass) params.dbPass = dbConfig.dbPass;

  const res = await client().get(`/api/metrics/${sessionId}`, { params });
  return res.data;
}

/**
 * Measure round-trip latency from the mobile device to the backend
 * by timing a /health request. Runs 3 probes and returns avg/min/max.
 */
export async function fetchPing() {
  const PROBES = 3;
  const times = [];
  const c = client();
  for (let i = 0; i < PROBES; i++) {
    const t0 = Date.now();
    try {
      await c.get('/health', { timeout: 5000 });
      times.push(Date.now() - t0);
    } catch (_) {
      // probe failed — skip
    }
  }
  if (times.length === 0) return { alive: false, latencyMs: null, min: null, max: null };
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    alive: true,
    latencyMs: parseFloat(avg.toFixed(1)),
    min: Math.min(...times),
    max: Math.max(...times),
  };
}

export async function fetchLogFiles(sessionId) {
  const res = await client().get(`/api/logs/files/${sessionId}`);
  return res.data;
}

export async function fetchLogTail(sessionId, file, lines = 200) {
  const res = await client().get(`/api/logs/tail/${sessionId}`, {
    params: { file, lines },
  });
  return res.data;
}
