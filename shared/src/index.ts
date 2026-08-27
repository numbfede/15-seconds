export {
  GAME_CONFIG,
  PLAYER_COLORS,
  createGameConfig,
  applyGameConfig,
} from './constants/game.js';
export type { GameConfig, PlayerColor } from './constants/game.js';

export type {
  GamePhase,
  ObjectiveType,
  Vec2,
  Rect,
  PlayerPublic,
  EchoPublic,
  ButtonPublic,
  ItemPublic,
  ZonePublic,
  WallPublic,
  ObjectivePublic,
  ScoreEvent,
  RoomPlayerInfo,
  LobbyState,
  GameSnapshot,
  LeaderboardEntry,
  InputState,
  RecordedFrame,
  ActionRecording,
} from './types/index.js';

export type { ClientMessage, ServerMessage } from './protocol/messages.js';
export { parseClientMessage, parseServerMessage } from './protocol/messages.js';
