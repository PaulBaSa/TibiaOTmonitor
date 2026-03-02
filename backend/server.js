require('dotenv').config();
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const apiRoutes = require('./src/routes/api');
const registerLogSocket = require('./src/socket/logSocket');

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS || '*';
const corsOptions = {
  origin: allowedOrigins === '*' ? '*' : allowedOrigins.split(','),
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'tibia-monitor-backend', ts: Date.now() });
});

app.use('/api', apiRoutes);

const PORT = parseInt(process.env.PORT || '3000', 10);
const SSL_CERT = process.env.SSL_CERT_PATH;
const SSL_KEY  = process.env.SSL_KEY_PATH;
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '443', 10);

const useSSL = SSL_CERT && SSL_KEY;

if (useSSL) {
  // HTTP server that redirects all traffic to HTTPS
  const redirectApp = express();
  redirectApp.use((req, res) => {
    const host = req.headers.host ? req.headers.host.split(':')[0] : req.hostname;
    const httpsUrl = HTTPS_PORT === 443
      ? `https://${host}${req.url}`
      : `https://${host}:${HTTPS_PORT}${req.url}`;
    res.redirect(301, httpsUrl);
  });
  http.createServer(redirectApp).listen(PORT, '0.0.0.0', () => {
    console.log(`   HTTP  :${PORT} → redirects to HTTPS :${HTTPS_PORT}`);
  });

  // HTTPS server with certbot certificates
  let sslOptions;
  try {
    sslOptions = {
      cert: fs.readFileSync(SSL_CERT),
      key:  fs.readFileSync(SSL_KEY),
    };
  } catch (err) {
    console.error(`\nFailed to load SSL certificates: ${err.message}`);
    console.error('Check SSL_CERT_PATH and SSL_KEY_PATH in your .env file.\n');
    process.exit(1);
  }

  const httpsServer = https.createServer(sslOptions, app);
  const io = new Server(httpsServer, {
    cors: { origin: corsOptions.origin, methods: ['GET', 'POST'] },
  });
  registerLogSocket(io);

  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`\n🗡️  Tibia Monitor Backend running on port ${HTTPS_PORT} (HTTPS)`);
    console.log(`   Health: https://localhost:${HTTPS_PORT}/health`);
    console.log(`   API:    https://localhost:${HTTPS_PORT}/api\n`);
  });
} else {
  // Plain HTTP (no SSL configured)
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: corsOptions.origin, methods: ['GET', 'POST'] },
  });
  registerLogSocket(io);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🗡️  Tibia Monitor Backend running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   API:    http://localhost:${PORT}/api\n`);
  });
}
