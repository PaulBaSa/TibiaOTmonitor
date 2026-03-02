require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const apiRoutes = require('./src/routes/api');
const registerLogSocket = require('./src/socket/logSocket');

const app = express();
const server = http.createServer(app);

const allowedOrigins = process.env.ALLOWED_ORIGINS || '*';
const io = new Server(server, {
  cors: {
    origin: allowedOrigins === '*' ? '*' : allowedOrigins.split(','),
    methods: ['GET', 'POST'],
  },
});

app.use(cors({
  origin: allowedOrigins === '*' ? '*' : allowedOrigins.split(','),
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'tibia-monitor-backend', ts: Date.now() });
});

app.use('/api', apiRoutes);

registerLogSocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🗡️  Tibia Monitor Backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   API:    http://localhost:${PORT}/api\n`);
});
