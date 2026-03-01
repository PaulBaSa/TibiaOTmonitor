const sshService = require('./sshService');

/**
 * All shell commands used to collect metrics from the remote server.
 * Commands are designed to be safe, fast, and produce parseable output.
 */
const CMDS = {
  // System
  hostname:    'hostname',
  osInfo:      'cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d\'"\' -f2',
  kernelVer:   'uname -r',
  cpuModel:    'grep "model name" /proc/cpuinfo | head -1 | cut -d\':\' -f2 | xargs',
  cpuCores:    'nproc',

  // CPU — two snapshots 500ms apart for accuracy
  cpu: `awk '{u=$2+$4; t=$2+$3+$4+$5+$6+$7+$8; print u, t}' /proc/stat > /tmp/_cpu1; \
sleep 0.5; \
awk '{u=$2+$4; t=$2+$3+$4+$5+$6+$7+$8; print u, t}' /proc/stat > /tmp/_cpu2; \
awk 'NR==FNR{u1=$1;t1=$2;next} {du=$1-u1; dt=$2-t1; printf "%.1f", (dt>0)?(du/dt*100):0}' /tmp/_cpu1 /tmp/_cpu2`,

  // Memory (bytes)
  memory: `free -b | awk 'NR==2{printf "{\\"used\\":%d,\\"total\\":%d,\\"free\\":%d,\\"cached\\":%d}", $3, $2, $4, $6}'`,

  // Disk for root filesystem (bytes)
  disk: `df -B1 / | awk 'NR==2{printf "{\\"used\\":%d,\\"total\\":%d,\\"available\\":%d}", $3, $2, $4}'`,

  // Load average
  loadAvg: `cat /proc/loadavg | awk '{printf "{\\"1m\\":%.2f,\\"5m\\":%.2f,\\"15m\\":%.2f}", $1, $2, $3}'`,

  // Uptime in seconds
  uptimeSeconds: `cat /proc/uptime | awk '{printf "%.0f", $1}'`,

  // Tibia server process — substring match so renamed/wrapped binaries are also caught
  serverProcess: `(pgrep -f 'tfs|tibia|forgottenserver|otserv|canary') > /dev/null 2>&1 && echo running || echo stopped`,

  // Game port 7171
  port7171: `ss -tlnp 2>/dev/null | grep -q ':7171' && echo open || echo closed`,

  // Login server port 7172
  port7172: `ss -tlnp 2>/dev/null | grep -q ':7172' && echo open || echo closed`,

  // Active established connections on game port
  connections7171: `ss -tn 2>/dev/null | grep -c ':7171.*ESTAB' || echo 0`,

  // Network RX/TX bytes since boot (eth0 or enp* interface, first one found)
  netStats: `cat /proc/net/dev | awk 'NR>2 && $1!~/lo:/{gsub(/:/, "", $1); printf "{\\"iface\\":\\"%s\\",\\"rx\\":%s,\\"tx\\":%s}", $1, $2, $10; exit}'`,

  // CPU temperature (may not be available on all systems)
  cpuTemp: `cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | awk '{printf "%.1f", $1/1000}' || echo null`,

  // List log files
  listLogs: `ls /home/tibiaOG/logs/ 2>/dev/null`,

  // Process name and uptime for Tibia server
  processMeta: `ps -eo pid,comm,etimes,pcpu,pmem --sort=-pcpu 2>/dev/null | awk 'NR>1 && ($2=="tfs" || $2=="tibia" || $2=="forgottenserver" || $2=="otserv" || $2=="canary") {printf "{\\"pid\\":%s,\\"name\\":\\"%s\\",\\"uptime\\":%s,\\"cpu\\":%.1f,\\"mem\\":%.1f}", $1,$2,$3,$4,$5; exit}'`,
};

function playerCountCmd(dbName, dbUser, dbPass) {
  // Uses mysql CLI; 2>/dev/null suppresses password warning
  return `mysql -u'${dbUser}' -p'${dbPass}' '${dbName}' -se "SELECT COUNT(*) FROM players_online;" 2>/dev/null || echo null`;
}

function formatUptime(seconds) {
  const s = parseInt(seconds, 10);
  if (isNaN(s)) return 'Unknown';
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

function safeJSON(str, fallback = null) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

/**
 * Collect all server metrics via SSH.
 * @param {string} sessionId
 * @param {{ dbName?, dbUser?, dbPass? }} dbConfig  optional DB credentials
 */
async function collectMetrics(sessionId, dbConfig = {}) {
  const run = (cmd) => sshService.exec(sessionId, cmd).then((r) => r.stdout).catch(() => null);

  // Run independent commands in parallel
  const [
    hostname, osInfo, kernelVer, cpuModel, cpuCores,
    cpu, memRaw, diskRaw, loadRaw,
    uptimeSec, serverProcess,
    port7171, port7172, connections7171,
    netRaw, cpuTemp, listLogs, processMeta,
  ] = await Promise.all([
    run(CMDS.hostname),
    run(CMDS.osInfo),
    run(CMDS.kernelVer),
    run(CMDS.cpuModel),
    run(CMDS.cpuCores),
    run(CMDS.cpu),
    run(CMDS.memory),
    run(CMDS.disk),
    run(CMDS.loadAvg),
    run(CMDS.uptimeSeconds),
    run(CMDS.serverProcess),
    run(CMDS.port7171),
    run(CMDS.port7172),
    run(CMDS.connections7171),
    run(CMDS.netStats),
    run(CMDS.cpuTemp),
    run(CMDS.listLogs),
    run(CMDS.processMeta),
  ]);

  // Optional: player count from MySQL
  let playerCount = null;
  if (dbConfig.dbName && dbConfig.dbUser) {
    const raw = await run(playerCountCmd(dbConfig.dbName, dbConfig.dbUser, dbConfig.dbPass || ''));
    const n = parseInt(raw, 10);
    playerCount = isNaN(n) ? null : n;
  }

  const memory = safeJSON(memRaw);
  const disk = safeJSON(diskRaw);
  const load = safeJSON(loadRaw);
  const net = safeJSON(netRaw);

  const logFiles = listLogs
    ? listLogs.split('\n').map((f) => f.trim()).filter(Boolean)
    : [];

  return {
    collectedAt: new Date().toISOString(),
    system: {
      hostname: hostname || 'Unknown',
      os: osInfo || 'Unknown',
      kernel: kernelVer || 'Unknown',
      cpuModel: cpuModel || 'Unknown',
      cpuCores: parseInt(cpuCores, 10) || null,
      uptimeSeconds: parseInt(uptimeSec, 10) || 0,
      uptimeFormatted: formatUptime(uptimeSec),
    },
    cpu: {
      usagePercent: parseFloat(cpu) || 0,
      temperature: cpuTemp === 'null' || !cpuTemp ? null : parseFloat(cpuTemp),
    },
    memory: memory ? {
      usedBytes: memory.used,
      totalBytes: memory.total,
      freeBytes: memory.free,
      cachedBytes: memory.cached,
      usagePercent: memory.total > 0 ? parseFloat(((memory.used / memory.total) * 100).toFixed(1)) : 0,
    } : null,
    disk: disk ? {
      usedBytes: disk.used,
      totalBytes: disk.total,
      availableBytes: disk.available,
      usagePercent: disk.total > 0 ? parseFloat(((disk.used / disk.total) * 100).toFixed(1)) : 0,
    } : null,
    load: load || { '1m': 0, '5m': 0, '15m': 0 },
    network: net || null,
    tibia: {
      serverStatus: (serverProcess || '').trim() === 'running' ? 'running' : 'stopped',
      port7171: (port7171 || '').trim(),
      port7172: (port7172 || '').trim(),
      activeConnections: parseInt(connections7171, 10) || 0,
      playerCount,
      process: safeJSON(processMeta),
    },
    logs: {
      files: logFiles,
      directory: '/home/tibiaOG/logs',
    },
  };
}

module.exports = { collectMetrics };
