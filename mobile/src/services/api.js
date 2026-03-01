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

export async function fetchPing(sessionId) {
  const res = await client().get(`/api/ping/${sessionId}`);
  return res.data;
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
