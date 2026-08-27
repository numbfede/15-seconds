import type { GameSnapshot, ServerMessage } from '@15-seconds/shared';
import { GAME_CONFIG } from '@15-seconds/shared';
import { NetworkClient, loadRuntimeConfig } from './networking/NetworkClient.js';
import { UIManager } from './ui/UIManager.js';
import { KeyboardInput } from './input/Keyboard.js';
import { VirtualJoystick } from './input/VirtualJoystick.js';
import { ActionButton } from './input/ActionButton.js';
import { GameRenderer } from './game/GameRenderer.js';
import { AudioSystem } from './systems/AudioSystem.js';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const menuRoot = document.getElementById('menu-root') as HTMLElement;
const hudRoot = document.getElementById('hud-root') as HTMLElement;
const touchRoot = document.getElementById('touch-root') as HTMLElement;
const toastRoot = document.getElementById('toast-root') as HTMLElement;

const net = new NetworkClient();
const audio = new AudioSystem();
const keyboard = new KeyboardInput();
const renderer = new GameRenderer(canvas);

let state: GameSnapshot | null = null;
let inGame = false;
let seq = 0;
let lastInputSent = 0;
let fps = 60;
let frames = 0;
let fpsTimer = 0;
let prevPhase = '';
let prevEchoCount = 0;
let completedFlash = false;
let lastTs = 0;

touchRoot.innerHTML = `
  <button class="fullscreen-btn btn-ghost" id="btn-fs">FULLSCREEN</button>
  <div id="joystick-zone">
    <div id="joystick-base"></div>
    <div id="joystick-knob"></div>
  </div>
  <button id="action-btn">ACT</button>
`;

const joystick = new VirtualJoystick(
  document.getElementById('joystick-zone') as HTMLElement,
  document.getElementById('joystick-knob') as HTMLElement,
);
const actionBtn = new ActionButton(document.getElementById('action-btn') as HTMLButtonElement);

document.getElementById('btn-fs')?.addEventListener('click', async () => {
  audio.unlock();
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    // unsupported
  }
});

const ui = new UIManager(menuRoot, hudRoot, toastRoot, {
  onCreate: (name) => {
    audio.unlock();
    net.send({ type: 'CREATE_ROOM', name });
  },
  onJoin: (name, code) => {
    audio.unlock();
    net.send({ type: 'JOIN_ROOM', name, roomCode: code.toUpperCase() });
  },
  onStart: () => net.send({ type: 'START_GAME' }),
  onLeave: () => {
    net.send({ type: 'LEAVE_ROOM' });
    leaveGameView();
  },
  onPlayAgain: () => net.send({ type: 'PLAY_AGAIN' }),
  onBackToLobby: () => net.send({ type: 'BACK_TO_LOBBY' }),
  onAddBot: () => net.send({ type: 'ADD_BOT' }),
  onRemoveBot: () => net.send({ type: 'REMOVE_BOT' }),
});

function enterGameView(): void {
  inGame = true;
  renderer.resetCamera();
  ui.hideMenus();
  canvas.style.display = 'block';
  const touch = isTouchDevice();
  joystick.setVisible(touch);
  actionBtn.setVisible(touch);
}

function leaveGameView(): void {
  inGame = false;
  state = null;
  canvas.style.display = 'none';
  joystick.setVisible(false);
  actionBtn.setVisible(false);
  ui.renderHud(null, { fps, ping: net.lastPingMs, debug: GAME_CONFIG.DEBUG });
}

function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

function handleServerMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'WELCOME':
      ui.setLocalId(msg.playerId);
      break;
    case 'ROOM_CREATED':
    case 'ROOM_JOINED':
      ui.setLocalId(msg.playerId);
      ui.showLobby(msg.lobby, msg.playerId);
      break;
    case 'LOBBY_UPDATE':
      leaveGameView();
      if (net.playerId) ui.showLobby(msg.lobby, net.playerId);
      break;
    case 'GAME_STATE':
      state = msg.state;
      if (msg.state.phase !== 'LOBBY' && msg.state.phase !== 'RESULTS') {
        if (!inGame) enterGameView();
      }
      onStateFx(msg.state);
      break;
    case 'SCORE_POP':
      ui.pushScoreEvents(msg.events);
      for (const ev of msg.events) {
        if (ev.reason.includes('objective')) audio.objective();
        else if (ev.reason === 'pickup') audio.pickup();
        else if (ev.reason === 'button') audio.button();
      }
      renderer.addShake(4);
      break;
    case 'GAME_OVER':
      leaveGameView();
      audio.victory();
      ui.showResults(msg.leaderboard, msg.yourId);
      break;
    case 'ERROR':
      ui.showError(msg.message);
      break;
    case 'LEFT_ROOM':
      leaveGameView();
      ui.showMain();
      break;
    default:
      break;
  }
}

net.onMessage(handleServerMessage);
net.onStatus((status) => ui.setConnection(status));

void loadRuntimeConfig().then(() => {
  ui.setServerLabel(net.url);
  net.connect();
});

function onStateFx(s: GameSnapshot): void {
  if (s.phase === 'COUNTDOWN' && prevPhase !== 'COUNTDOWN') {
    audio.roundStart();
    completedFlash = false;
  }
  if (s.phase === 'COUNTDOWN') {
    const sec = Math.ceil(s.timeLeft);
    if (sec !== ui.lastCountdown && sec > 0) audio.countdown();
  }
  if (s.phase === 'PLAYING' && prevPhase === 'COUNTDOWN') audio.go();
  if (s.phase === 'ROUND_END' && prevPhase !== 'ROUND_END') audio.roundEnd();
  if (s.echoes.length > prevEchoCount) audio.echoSpawn();
  if (s.objective?.completed && !completedFlash) {
    completedFlash = true;
    renderer.addShake(8);
    const local = s.players.find((p) => p.id === net.playerId);
    if (local) renderer.burst(local.x, local.y, local.color);
  }
  prevEchoCount = s.echoes.length;
  prevPhase = s.phase;
}

function collectInput(): {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  action: boolean;
} {
  return {
    up: keyboard.up || joystick.up,
    down: keyboard.down || joystick.down,
    left: keyboard.left || joystick.left,
    right: keyboard.right || joystick.right,
    action: keyboard.action || actionBtn.pressed,
  };
}

function sendInput(now: number): void {
  if (!inGame || !state || state.phase !== 'PLAYING') return;
  const interval = 1000 / GAME_CONFIG.INPUT_RATE;
  if (now - lastInputSent < interval) return;
  lastInputSent = now;
  seq += 1;
  const input = collectInput();
  net.send({ type: 'INPUT', ...input, seq });
}

function loop(now: number): void {
  const dt = Math.min(0.05, (now - (lastTs || now)) / 1000);
  lastTs = now;

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fps = frames / fpsTimer;
    frames = 0;
    fpsTimer = 0;
  }

  net.drain();
  sendInput(now);
  renderer.update(dt);

  if (inGame && state) {
    renderer.render(state, net.playerId);
  }

  ui.renderHud(inGame ? state : null, {
    fps,
    ping: net.lastPingMs,
    debug: import.meta.env.DEV || GAME_CONFIG.DEBUG,
  });

  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => renderer.resize());
renderer.resize();
requestAnimationFrame(loop);

document.body.addEventListener(
  'touchmove',
  (e) => {
    if (inGame) e.preventDefault();
  },
  { passive: false },
);
