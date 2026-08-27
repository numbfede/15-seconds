import type {
  GameSnapshot,
  LeaderboardEntry,
  LobbyState,
  ScoreEvent,
} from '../types/index.js';

export type ClientMessage =
  | { type: 'CREATE_ROOM'; name: string }
  | { type: 'JOIN_ROOM'; roomCode: string; name: string }
  | { type: 'LEAVE_ROOM' }
  | { type: 'START_GAME' }
  | { type: 'INPUT'; up: boolean; down: boolean; left: boolean; right: boolean; action: boolean; seq: number }
  | { type: 'PLAY_AGAIN' }
  | { type: 'BACK_TO_LOBBY' }
  | { type: 'ADD_BOT' }
  | { type: 'REMOVE_BOT' }
  | { type: 'SKIP_ROUND' }
  | { type: 'PING'; t: number };

export type ServerMessage =
  | { type: 'WELCOME'; playerId: string }
  | { type: 'ROOM_CREATED'; lobby: LobbyState; playerId: string }
  | { type: 'ROOM_JOINED'; lobby: LobbyState; playerId: string }
  | { type: 'LOBBY_UPDATE'; lobby: LobbyState }
  | { type: 'GAME_STATE'; state: GameSnapshot }
  | { type: 'SCORE_POP'; events: ScoreEvent[] }
  | { type: 'GAME_OVER'; leaderboard: LeaderboardEntry[]; yourId: string }
  | { type: 'ERROR'; code: string; message: string }
  | { type: 'PONG'; t: number }
  | { type: 'LEFT_ROOM' };

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !('type' in data)) return null;
    return data as ClientMessage;
  } catch {
    return null;
  }
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !('type' in data)) return null;
    return data as ServerMessage;
  } catch {
    return null;
  }
}
