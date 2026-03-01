# ⚔️ Tibia OT Monitor

A mobile app (iOS + Android) for monitoring your Open Tibia server in real time.
Built with **React Native (Expo)** for the mobile app and **Node.js** for the backend that bridges SSH.

---

## Architecture

```
┌──────────────────┐     HTTP/WebSocket     ┌──────────────────┐     SSH     ┌─────────────────────┐
│  Mobile App      │ ──────────────────────▶│  Node.js Backend │ ──────────▶│  Tibia Server       │
│  (iOS / Android) │                         │  (Express +      │            │  (Ubuntu 24)        │
│  React Native    │◀──────────────────────  │   Socket.IO)     │            │  /home/tibiaOG/logs │
└──────────────────┘                         └──────────────────┘            └─────────────────────┘
```

The **backend** runs on any machine (your PC, a cloud server, or the Tibia server itself).
The **mobile app** talks to the backend via REST + WebSocket.
The **backend** SSH-es into the Tibia server to collect metrics and stream logs.

---

## Features

### Dashboard
| Metric | How it's collected |
|---|---|
| Server status (running / stopped) | `pgrep` — checks for `tfs`, `tibia`, `forgottenserver`, `canary` |
| Players online | MySQL query on `players_online` table (optional) |
| Active connections | `ss` on port 7171 |
| CPU usage % | `/proc/stat` (two-snapshot diff for accuracy) |
| CPU temperature | `/sys/class/thermal/thermal_zone0/temp` |
| Memory usage | `free -b` |
| Disk usage (/) | `df -B1` |
| Load average | `/proc/loadavg` (1m / 5m / 15m) |
| System uptime | `/proc/uptime` |
| Ping / latency | ICMP ping from backend to server |
| Port 7171 (game) | `ss -tlnp` |
| Port 7172 (login) | `ss -tlnp` |
| Network RX/TX | `/proc/net/dev` |
| Tibia process (PID, CPU%, mem%) | `ps` |

### Logs Screen
- Lists all files in `/home/tibiaOG/logs/`
- Real-time tail via SSH + Socket.IO WebSocket
- Color-coded lines: ERROR (red), WARN (orange), INFO (blue), DEBUG (green)
- Auto-scroll toggle, clear button

### Settings
- View connection info
- Change auto-refresh interval (10s → 120s)
- Disconnect / forget credentials

---

## Quick Start

### 1. Run the Backend

Requirements: **Node.js 18+**

```bash
cd backend
cp .env.example .env
npm install
npm start
```

The backend listens on `http://0.0.0.0:3000` by default.
Make sure **port 3000 is reachable** from your phone (same Wi-Fi, or port-forwarded).

> **Tip:** You can also run the backend directly on the Tibia server — then the SSH connection goes to `localhost` and latency is near-zero.

### 2. Run the Mobile App

Requirements: **Node.js 18+**, **Expo Go** app on your phone

```bash
cd mobile
npm install
npm start
```

Scan the QR code with **Expo Go** (iOS) or the **Camera app** (Android).

---

## Setup Screen Fields

| Field | Example | Notes |
|---|---|---|
| Backend URL | `http://192.168.1.50:3000` | Must be reachable from your phone |
| SSH Host | `203.0.113.10` | Your Tibia server's IP or hostname |
| SSH Port | `22` | Default SSH port |
| SSH Username | `ubuntu` | The Linux user with access |
| SSH Password | `••••` | Or use a private key |
| Private Key (PEM) | `-----BEGIN RSA...` | Paste the full key content |
| Database Name | `tibia` | Optional — for player count |
| DB Username | `root` | MySQL/MariaDB user |
| DB Password | `••••` | Optional |

Credentials are stored **encrypted** using the device's secure keystore (`expo-secure-store`).

---

## Building for Production

### Android APK

```bash
cd mobile
npx eas build --platform android --profile preview
```

### iOS IPA

```bash
cd mobile
npx eas build --platform ios --profile preview
```

Requires an [Expo account](https://expo.dev) and (for iOS) an Apple Developer account.

---

## Backend — Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port to listen on |
| `ALLOWED_ORIGINS` | `*` | CORS allowed origins |
| `SESSION_EXPIRY_MINUTES` | `30` | Idle SSH sessions are auto-closed |

---

## Tibia Server Process Names

The app checks for these binary names (in order):

- `tfs` — The Forgotten Server
- `tibia` — Generic
- `forgottenserver` — Alternative TFS binary name
- `canary` — Canary OT Server
- `otserv` — OTServ

If your binary has a different name, edit the `serverProcess` command in:
`backend/src/services/metricsService.js`

---

## Security Notes

- SSH credentials are transmitted over HTTP to the backend. For production use, **run the backend with HTTPS** (e.g., behind an Nginx reverse proxy with TLS).
- The backend does not store credentials — they are used only for the duration of the session.
- SSH sessions are automatically closed after `SESSION_EXPIRY_MINUTES` of inactivity.
- Log file paths are sanitized to prevent path traversal attacks.

---

## Project Structure

```
TibiaOTmonitor/
├── backend/
│   ├── server.js                        # Express + Socket.IO entry point
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── routes/
│       │   └── api.js                   # REST endpoints
│       ├── services/
│       │   ├── sshService.js            # SSH connection manager
│       │   └── metricsService.js        # Metric collection via SSH
│       └── socket/
│           └── logSocket.js             # Real-time log streaming
└── mobile/
    ├── App.js
    ├── app.json
    ├── package.json
    └── src/
        ├── context/
        │   └── AppContext.js            # Global state
        ├── navigation/
        │   └── AppNavigator.js          # Stack + Tab navigation
        ├── screens/
        │   ├── SetupScreen.js           # SSH credentials entry
        │   ├── DashboardScreen.js       # Live metrics dashboard
        │   ├── LogsScreen.js            # Real-time log viewer
        │   └── SettingsScreen.js        # Preferences & disconnect
        ├── components/
        │   ├── MetricCard.js            # Metric tile with progress bar
        │   ├── StatusBadge.js           # Online/offline pill badge
        │   └── LogViewer.js             # Color-coded log display
        ├── services/
        │   ├── api.js                   # Axios HTTP client
        │   └── socket.js                # Socket.IO client
        └── theme/
            └── index.js                 # Colors, typography, spacing
```
