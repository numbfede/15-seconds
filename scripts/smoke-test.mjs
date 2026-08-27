#!/usr/bin/env node
// End-to-end check: two players, room join, two rounds, echoes spawn and replay.
import WebSocket from 'ws';

const URL = process.env.SMOKE_URL ?? 'ws://127.0.0.1:3001';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT ?? 90000);

const log = (...a) => console.log('[smoke]', ...a);
const fail = (msg) => {
  console.error('[smoke] FAIL:', msg);
  process.exit(1);
};

class Client {
  constructor(name) {
    this.name = name;
    this.ws = new WebSocket(URL);
    this.messages = [];
    this.playerId = null;
    this.lastState = null;
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'WELCOME') this.playerId = msg.playerId;
      if (msg.type === 'GAME_STATE') this.lastState = msg.state;
      this.messages.push(msg);
    });
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
  }

  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }

  /** Waits for the first message matching predicate, scanning already-received ones too. */
  wait(predicate, label, timeout = 20000) {
    const found = this.messages.find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.ws.off('message', onMessage);
        reject(new Error(`timeout waiting for ${label}`));
      }, timeout);
      const onMessage = (raw) => {
        const msg = JSON.parse(String(raw));
        if (predicate(msg)) {
          clearTimeout(timer);
          this.ws.off('message', onMessage);
          resolve(msg);
        }
      };
      this.ws.on('message', onMessage);
    });
  }

  moveFor(ms, dir) {
    let seq = 0;
    const timer = setInterval(() => {
      seq += 1;
      this.send({ type: 'INPUT', ...dir, action: true, seq });
    }, 50);
    return new Promise((resolve) =>
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, ms),
    );
  }
}

const globalTimer = setTimeout(() => fail('global timeout'), TIMEOUT_MS);

try {
  const host = new Client('HostBot');
  const guest = new Client('GuestBot');
  await Promise.all([host.open(), guest.open()]);
  log('both sockets open ->', URL);

  await host.wait((m) => m.type === 'WELCOME', 'host WELCOME');
  await guest.wait((m) => m.type === 'WELCOME', 'guest WELCOME');

  host.send({ type: 'CREATE_ROOM', name: 'HostBot' });
  const created = await host.wait((m) => m.type === 'ROOM_CREATED', 'ROOM_CREATED');
  const code = created.lobby.roomCode;
  if (!/^[A-Z0-9]{4}$/.test(code)) fail(`bad room code: ${code}`);
  log('room created:', code);

  // Case-insensitive join must work.
  guest.send({ type: 'JOIN_ROOM', roomCode: code.toLowerCase(), name: 'GuestBot' });
  const joined = await guest.wait((m) => m.type === 'ROOM_JOINED', 'ROOM_JOINED');
  if (joined.lobby.players.length !== 2) fail(`expected 2 players, got ${joined.lobby.players.length}`);
  log('guest joined, players:', joined.lobby.players.map((p) => p.name).join(', '));

  // Unknown room must be rejected.
  const stray = new Client('Stray');
  await stray.open();
  stray.send({ type: 'JOIN_ROOM', roomCode: 'ZZZZ', name: 'Stray' });
  const err = await stray.wait((m) => m.type === 'ERROR', 'ERROR for bad room');
  log('bad room rejected:', err.code);
  stray.ws.close();

  host.send({ type: 'START_GAME' });
  await host.wait((m) => m.type === 'GAME_STATE' && m.state.phase === 'COUNTDOWN', 'COUNTDOWN');
  log('countdown started');

  const playing = await host.wait(
    (m) => m.type === 'GAME_STATE' && m.state.phase === 'PLAYING',
    'PLAYING round 1',
    20000,
  );
  const objective = playing.state.objective;
  if (!objective?.title) fail('round 1 has no objective');
  log('round 1 objective:', objective.title);

  const startX = host.lastState?.players.find((p) => p.id === host.playerId)?.x;

  // Move both players so recordings are non-trivial.
  await Promise.all([
    host.moveFor(6000, { up: false, down: false, left: false, right: true }),
    guest.moveFor(6000, { up: true, down: false, left: false, right: false }),
  ]);

  const endX = host.lastState?.players.find((p) => p.id === host.playerId)?.x;
  if (typeof startX === 'number' && typeof endX === 'number' && Math.abs(endX - startX) < 5) {
    fail(`host did not move (x ${startX} -> ${endX})`);
  }
  log('movement applied by server: x', startX?.toFixed(0), '->', endX?.toFixed(0));

  await host.wait(
    (m) => m.type === 'GAME_STATE' && m.state.phase === 'ROUND_END',
    'ROUND_END',
    25000,
  );
  log('round 1 ended');

  const round2 = await host.wait(
    (m) => m.type === 'GAME_STATE' && m.state.phase === 'PLAYING' && m.state.round === 2,
    'PLAYING round 2',
    30000,
  );
  const echoCount = round2.state.echoes.length;
  if (echoCount < 2) fail(`expected >=2 echoes in round 2, got ${echoCount}`);
  log('round 2 echoes spawned:', echoCount);

  // Echoes must actually replay movement, not stand still.
  const first = round2.state.echoes.map((e) => ({ id: e.id, x: e.x, y: e.y }));
  await new Promise((r) => setTimeout(r, 3000));
  const later = host.lastState?.echoes ?? [];
  const moved = first.some((e) => {
    const now = later.find((l) => l.id === e.id);
    return now && (Math.abs(now.x - e.x) > 2 || Math.abs(now.y - e.y) > 2);
  });
  if (!moved) fail('echoes are not replaying movement');
  log('echoes are replaying recorded movement');

  const scores = host.lastState?.players.map((p) => `${p.name}=${p.score}`).join(' ');
  log('scores:', scores);

  host.ws.close();
  guest.ws.close();
  clearTimeout(globalTimer);
  log('PASS — all checks green');
  process.exit(0);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
