# 15 SECONDS

Multiplayer HTML5 party game where every 15-second round records your actions — and your **Echo** replays them in later rounds. Echoes can press buttons and pick up items. Your past is still playing.

## Stack

- **client** — Vite + TypeScript + Canvas 2D
- **server** — Node.js + `ws` (authoritative), HTTP `/health` + WebSocket on one port
- **shared** — types, protocol, `GAME_CONFIG`

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

- Client: http://localhost:5173  
- Server: ws://localhost:3001 (`GET /health`)

Set `VITE_SERVER_URL` in `.env` (never hardcode only localhost in production).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Build shared, then watch shared + server + client |
| `npm run typecheck` | Strict TypeScript across workspaces |
| `npm run build` | Build shared → server → client |
| `npm start` | Run production server (`server/dist/index.js`) |
| `npm run smoke` | End-to-end check: join, rounds, echo replay (`SMOKE_URL` to target a remote server) |

## Gameplay

- 2–15 players (dev default min = 1)
- 7 rounds × 15 seconds
- Objectives: `COLLECT`, `BUTTON`, `THREE_BUTTONS`, `REACH`, `DELIVER`, `SURVIVE`
- Mobile: virtual joystick + action button
- Desktop: WASD / arrows + Space / E

## Pointing the client at a server

The client resolves the WebSocket URL in this order:

1. `client/public/config.json` → `{ "serverUrl": "wss://…" }`, fetched at page load
2. `VITE_SERVER_URL` baked in at build time
3. same host as the page

`config.json` is the one to change in production: edit it, push, and the deployed
frontend points at the new server on the next load — no rebuild or env var change needed.

## Deploy

### Frontend (Vercel)

`vercel.json` builds the client to `client/dist`. The Vercel project is linked to the
GitHub repo, so pushing to `main` deploys automatically.

### Backend (Render free)

`render.yaml` defines a free Frankfurt web service:

- build: `npm ci --include=dev && npm run build -w shared && npm run build -w server`
- start: `node server/dist/index.js`
- health: `/health`
- **Do not set `PORT`** — Render provides it
- set `HOST=0.0.0.0`

`--include=dev` is required: Render sets `NODE_ENV=production`, which makes npm skip
devDependencies, and the build needs TypeScript from there.

One-click blueprint deploy:
<https://render.com/deploy?repo=https://github.com/numbfede/15-seconds>

Then put the resulting `wss://<service>.onrender.com` into `client/public/config.json`.

Free Render instances sleep after ~15 minutes idle and take roughly a minute to wake,
so the first player to connect after a quiet period will wait.

### DNS / TLS

Point `game.` to Vercel and `server.` (or your WS host) to Render. Use `wss://` in production behind HTTPS.

### Nginx (optional reverse proxy)

```nginx
location / {
  proxy_pass http://127.0.0.1:3001;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

## Env vars

See `.env.example` for `VITE_SERVER_URL`, `MIN_PLAYERS`, `MAX_PLAYERS`, `TOTAL_ROUNDS`, `ROUND_DURATION`, `MAX_ACTIVE_ECHOS`, `ALLOW_BOTS`, `DEBUG`.
