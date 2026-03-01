# CLAUDE.md — TibiaOTmonitor

This file provides guidance for AI assistants working with the TibiaOTmonitor codebase.

---

## Project Overview

**TibiaOTmonitor** is a mobile monitoring application (iOS & Android) paired with a Node.js backend that lets operators remotely monitor a Tibia Open Tibia (OT) game server. The architecture is:

```
Mobile App (React Native/Expo)
    ↕ REST / WebSocket
Backend Server (Express + Socket.IO)
    ↕ SSH (ssh2)
Remote Linux Server (running TFS/OT process)
```

The backend establishes SSH sessions to the game server and exposes metrics and log streaming via a local REST API. The mobile app connects to this local backend over LAN or the internet.

---

## Repository Structure

```
TibiaOTmonitor/
├── README.md                      # End-user documentation
├── CLAUDE.md                      # This file
├── backend/                       # Node.js/Express backend
│   ├── server.js                  # Entry point — HTTP + Socket.IO init
│   ├── package.json
│   ├── .env.example               # Environment variable template
│   └── src/
│       ├── routes/
│       │   └── api.js             # All REST endpoints
│       ├── services/
│       │   ├── sshService.js      # SSH session manager (singleton)
│       │   └── metricsService.js  # SSH command execution for metrics
│       └── socket/
│           └── logSocket.js       # Socket.IO log streaming handler
└── mobile/                        # React Native (Expo 51) mobile app
    ├── App.js                     # Root component
    ├── app.json                   # Expo configuration
    ├── babel.config.js
    ├── package.json
    └── src/
        ├── context/
        │   └── AppContext.js      # Global state (React Context + hooks)
        ├── navigation/
        │   └── AppNavigator.js    # Stack + Tab navigation
        ├── screens/
        │   ├── SetupScreen.js     # Connection configuration form
        │   ├── DashboardScreen.js # Live metrics display
        │   ├── LogsScreen.js      # Real-time log viewer
        │   └── SettingsScreen.js  # Preferences + disconnect
        ├── services/
        │   ├── api.js             # Axios HTTP client (singleton)
        │   └── socket.js          # Socket.IO client (singleton)
        ├── components/
        │   ├── MetricCard.js      # Reusable metric tile with progress bar
        │   ├── StatusBadge.js     # Online/offline/warning pill indicator
        │   └── LogViewer.js       # Color-coded scrollable log lines
        └── theme/
            └── index.js           # Design tokens (colors, spacing, typography)
```

---

## Technology Stack

### Backend
| Dependency | Version | Purpose |
|---|---|---|
| Node.js | 18+ | Runtime |
| Express | 4.19.2 | HTTP server and routing |
| Socket.IO | 4.7.5 | Real-time WebSocket events |
| ssh2 | 1.15.0 | SSH connections to remote server |
| cors | 2.8.5 | Cross-origin request handling |
| dotenv | 16.4.5 | Environment variable loading |
| uuid | 9.0.1 | Session ID generation |
| ping | 0.4.4 | ICMP latency measurement |

### Mobile
| Dependency | Version | Purpose |
|---|---|---|
| React Native | 0.74.5 | Cross-platform mobile framework |
| Expo | ~51.0 | Build tooling and native APIs |
| React Navigation | 6.x | Screen navigation |
| Axios | 1.7.7 | HTTP requests to backend |
| socket.io-client | 4.7.5 | Real-time log streaming |
| expo-secure-store | 13.0.2 | Encrypted credential storage |
| @react-native-async-storage | 1.23.1 | Plain key-value persistence |

---

## Development Workflows

### Backend

```bash
cd backend

# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env

# Development (auto-restarts on file changes — requires nodemon)
npm run dev

# Production
npm start
```

The backend listens on `0.0.0.0:3000` by default. Set `PORT` in `.env` to override.

**Required `.env` variables:**
```
PORT=3000
ALLOWED_ORIGINS=*
SESSION_EXPIRY_MINUTES=30
```

### Mobile

```bash
cd mobile

# Install dependencies
npm install

# Start Expo development server
npm start          # Universal (scan QR with Expo Go)
npm run android    # Android emulator/device
npm run ios        # iOS simulator/device (macOS only)
npm run web        # Web browser

# Production builds (requires EAS CLI + Expo account)
npx eas build --platform android --profile preview
npx eas build --platform ios --profile preview
```

### Testing

There are currently **no automated tests** in this repository. When adding tests:
- **Backend:** Use Jest + supertest
- **Mobile:** Use Jest + React Native Testing Library

---

## Key Architectural Decisions

### SSH Session Management (`backend/src/services/sshService.js`)
- Sessions are stored in a `Map<sessionId, sessionData>` in memory.
- Each session has a `lastUsed` timestamp; sessions idle for `SESSION_EXPIRY_MINUTES` are automatically cleaned up.
- SSH connections support both password auth and private key auth.
- Connection timeout is 15 seconds; keep-alive interval is 10 seconds.
- Active shell streams are tracked in `session.streams` and destroyed on disconnect.

### Metrics Collection (`backend/src/services/metricsService.js`)
- All metrics are collected by executing Linux shell commands via SSH.
- CPU usage is measured by taking two `/proc/stat` snapshots 500ms apart and computing the diff.
- Tibia server detection checks for processes named: `tfs`, `tibia`, `forgottenserver`, `otserv`, `canary`.
- Port status (7171, 7172) is checked with `ss -tlnp`.
- Player count requires optional MySQL credentials and runs: `SELECT COUNT(*) FROM players_online;`.
- All metrics are returned in a single JSON object from `GET /api/metrics/:sessionId`.

### Real-time Log Streaming (`backend/src/socket/logSocket.js`)
- Uses Socket.IO to stream `tail -f` output from files in `/home/tibiaOG/logs/`.
- Filenames are sanitized with a regex allowlist (`/^[a-zA-Z0-9._-]+$/`) to prevent path traversal.
- Only one active stream per Socket.IO connection is allowed.

### Mobile State Management (`mobile/src/context/AppContext.js`)
- Global state lives in a single React Context (`AppContext`).
- Sensitive data (`SSH_CONFIG`, `DB_CONFIG`) is stored via `expo-secure-store` (encrypted on-device).
- Non-sensitive data (`BACKEND_URL`, `PREFERENCES`) is stored via `AsyncStorage`.
- The custom hook `useApp()` is the only way screens should access global state.

### Credential Flow
1. User enters backend URL, SSH credentials, and optional DB credentials in `SetupScreen`.
2. Mobile performs a health check on the backend, then POSTs SSH credentials to `POST /api/connect`.
3. Backend establishes the SSH connection, returns a `sessionId`.
4. All subsequent API calls use `sessionId`; the SSH session stays open server-side.
5. Credentials are stored encrypted on-device; `sessionId` is held only in memory.

---

## API Reference

### REST Endpoints

```
GET  /health                                  → health check
POST /api/connect                             → start SSH session, returns sessionId
DELETE /api/disconnect/:sessionId             → end SSH session
GET  /api/status/:sessionId                   → check if session is alive
GET  /api/metrics/:sessionId[?dbName&dbUser&dbPass] → full metrics snapshot
GET  /api/ping/:sessionId                     → ICMP latency to remote host
GET  /api/logs/files/:sessionId               → list log files in /home/tibiaOG/logs/
GET  /api/logs/tail/:sessionId?file=X&lines=N → last N lines of a log file
```

### Socket.IO Events

**Client → Server:**
```
start-log-stream  { sessionId, file, lines? }
stop-log-stream   {}
```

**Server → Client:**
```
log-connected     { file }
log-data          { chunk }
log-error         { message }
log-disconnected  {}
```

---

## Code Conventions

### General
- **JavaScript only** — no TypeScript in this repo.
- `camelCase` for variables and functions.
- `PascalCase` for React components and class-like constructors.
- `UPPER_SNAKE_CASE` for constants and environment variable names.

### Backend
- Service modules export a **singleton instance** (not a class).
- Use `async/await` throughout; avoid raw callbacks except in ssh2 event handlers.
- Use `Promise.all()` for parallel SSH commands within metrics collection.
- Route handlers call service methods and format responses; keep business logic in services.
- Error responses always include a human-readable `error` field in JSON.

### Mobile
- **Functional components only** — no class components.
- Styles are defined with `StyleSheet.create()` at the bottom of each file.
- All styles reference `theme/index.js` tokens rather than inline color literals.
- Side effects belong in `useEffect`; event callbacks belong in `useCallback`.
- Destructive user actions (disconnect, forget credentials) always show an `Alert.alert` confirmation.
- The log viewer caps at **1000 lines** (FIFO eviction) to prevent memory issues.

### Security
- SSH credentials are never logged or stored in plain text.
- Log file paths are sanitized to prevent path traversal before use in `tail` commands.
- The backend does not persist any credentials; sessions are memory-only.
- `expo-secure-store` is used for all sensitive on-device data.

---

## Design System (`mobile/src/theme/index.js`)

The app uses a **dark theme** with a Tibia gold accent:

| Token | Value | Usage |
|---|---|---|
| `colors.primary` | `#C4A535` | Accent, buttons, active tabs |
| `colors.bg` | `#0D0D0D` | Screen backgrounds |
| `colors.surface` | `#1A1A1A` | Cards and containers |
| `colors.elevated` | `#242424` | Inputs, dropdowns |
| `colors.text` | `#FFFFFF` | Primary text |
| `colors.textSecondary` | `#AAAAAA` | Labels, descriptions |
| `colors.ok` | `#4CAF50` | Good/online status |
| `colors.warn` | `#FF9800` | Warning status |
| `colors.error` | `#F44336` | Error/offline status |

Spacing uses a 4px grid: `spacing.xs=4`, `sm=8`, `md=16`, `lg=24`, `xl=32`.

---

## Common Pitfalls

1. **SSH session expiry:** Sessions expire after `SESSION_EXPIRY_MINUTES` of inactivity. The mobile app checks `GET /api/status/:sessionId` before each action, but if a session expires mid-use the user must reconnect from `SetupScreen`.

2. **Metro bundler + Socket.IO:** The Expo Metro bundler may have issues resolving Socket.IO's `ws` fallback. Ensure `socket.js` forces `transports: ['websocket']` (already done).

3. **Path sanitization scope:** Log files are restricted to `/home/tibiaOG/logs/`. If the server uses a different log directory, update `metricsService.js` (the `logsDir` variable) and `logSocket.js`.

4. **MySQL player count:** This is entirely optional and gated on the presence of `dbName`, `dbUser`, and `dbPass` query params. Errors in the MySQL query are caught and result in `playerCount: null` rather than a metrics failure.

5. **CPU temperature:** Only available on Linux systems with `/sys/class/thermal/thermal_zone0/temp`. On servers without this file the field is omitted from the response.

6. **Android network:** On Android, the mobile app cannot reach `localhost` for the backend — use the machine's LAN IP address.

---

## Git Workflow

The project uses feature branches prefixed with `claude/`.

```bash
# Create and switch to the feature branch
git checkout -b claude/<feature>-<id>

# Push with upstream tracking
git push -u origin claude/<feature>-<id>
```

Branch naming: `claude/` prefix + short description + session/ticket ID suffix (e.g. `claude/add-claude-documentation-JehdE`).
