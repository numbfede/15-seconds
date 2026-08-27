export type GamePhase =
  | 'LOBBY'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'ROUND_END'
  | 'NEXT_ROUND'
  | 'RESULTS';

export type ObjectiveType =
  | 'COLLECT'
  | 'BUTTON'
  | 'THREE_BUTTONS'
  | 'REACH'
  | 'DELIVER'
  | 'SURVIVE';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlayerPublic {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  score: number;
  alive: boolean;
  holdingItemId: string | null;
  isBot: boolean;
}

export interface EchoPublic {
  id: string;
  ownerId: string;
  color: string;
  round: number;
  x: number;
  y: number;
  holdingItemId: string | null;
  alpha: number;
}

export interface ButtonPublic {
  id: string;
  x: number;
  y: number;
  radius: number;
  pressed: boolean;
  label: string;
}

export interface ItemPublic {
  id: string;
  x: number;
  y: number;
  radius: number;
  heldBy: string | null;
  kind: 'orb' | 'package';
}

export interface ZonePublic {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'target' | 'safe' | 'spawn';
  active: boolean;
}

export interface WallPublic {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ObjectivePublic {
  type: ObjectiveType;
  title: string;
  description: string;
  completed: boolean;
  progress: number;
  target: number;
  buttons: ButtonPublic[];
  items: ItemPublic[];
  zones: ZonePublic[];
}

export interface ScoreEvent {
  playerId: string;
  amount: number;
  reason: string;
}

export interface RoomPlayerInfo {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  isBot: boolean;
  score: number;
}

export interface LobbyState {
  roomCode: string;
  hostId: string;
  players: RoomPlayerInfo[];
  maxPlayers: number;
  minPlayers: number;
}

export interface GameSnapshot {
  roomCode: string;
  phase: GamePhase;
  round: number;
  totalRounds: number;
  timeLeft: number;
  hostId: string;
  players: PlayerPublic[];
  echoes: EchoPublic[];
  walls: WallPublic[];
  objective: ObjectivePublic | null;
  scoreEvents: ScoreEvent[];
  mapWidth: number;
  mapHeight: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  color: string;
  score: number;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  action: boolean;
  seq: number;
}

export interface RecordedFrame {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  action: boolean;
}

export interface ActionRecording {
  playerId: string;
  round: number;
  startX: number;
  startY: number;
  color: string;
  frames: RecordedFrame[];
}
