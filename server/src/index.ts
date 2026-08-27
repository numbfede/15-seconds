import http from 'node:http';
import { WebSocketServer } from 'ws';
import { applyGameConfig, GAME_CONFIG } from '@15-seconds/shared';
import { RoomManager } from './rooms/RoomManager.js';

function loadEnvConfig(): void {
  const overrides: Parameters<typeof applyGameConfig>[0] = {};
  if (process.env.MIN_PLAYERS) overrides.MIN_PLAYERS = Number(process.env.MIN_PLAYERS);
  if (process.env.MAX_PLAYERS) overrides.MAX_PLAYERS = Number(process.env.MAX_PLAYERS);
  if (process.env.TOTAL_ROUNDS) overrides.TOTAL_ROUNDS = Number(process.env.TOTAL_ROUNDS);
  if (process.env.ROUND_DURATION) overrides.ROUND_DURATION = Number(process.env.ROUND_DURATION);
  if (process.env.MAX_ACTIVE_ECHOS) {
    overrides.MAX_ACTIVE_ECHOS = Number(process.env.MAX_ACTIVE_ECHOS);
  }
  if (process.env.ALLOW_BOTS !== undefined) {
    overrides.ALLOW_BOTS = process.env.ALLOW_BOTS === 'true';
  }
  if (process.env.DEBUG !== undefined) {
    overrides.DEBUG = process.env.DEBUG === 'true';
  }
  applyGameConfig(overrides);
}

loadEnvConfig();

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

const manager = new RoomManager();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(
      JSON.stringify({
        ok: true,
        rooms: manager.roomCount,
        uptime: process.uptime(),
      }),
    );
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*',
  });
  res.end('15 SECONDS multiplayer server');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  manager.handleConnection(ws);
});

server.listen(PORT, HOST, () => {
  console.log(`15 SECONDS server listening on ${HOST}:${PORT}`);
  console.log(
    `Config: rounds=${GAME_CONFIG.TOTAL_ROUNDS} duration=${GAME_CONFIG.ROUND_DURATION}s maxPlayers=${GAME_CONFIG.MAX_PLAYERS}`,
  );
});
