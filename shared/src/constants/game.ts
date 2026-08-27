export type GameConfig = {
  MIN_PLAYERS: number;
  MAX_PLAYERS: number;
  TOTAL_ROUNDS: number;
  ROUND_DURATION: number;
  COUNTDOWN_DURATION: number;
  ROUND_END_DURATION: number;
  MAX_ACTIVE_ECHOS: number;
  TICK_RATE: number;
  PLAYER_SPEED: number;
  PLAYER_RADIUS: number;
  MAP_WIDTH: number;
  MAP_HEIGHT: number;
  NICKNAME_MIN: number;
  NICKNAME_MAX: number;
  ROOM_CODE_LENGTH: number;
  SCORE_OBJECTIVE: number;
  SCORE_SECONDARY: number;
  SCORE_SURVIVAL: number;
  INPUT_RATE: number;
  ALLOW_BOTS: boolean;
  DEBUG: boolean;
};

export const GAME_CONFIG: GameConfig = {
  MIN_PLAYERS: 1,
  MAX_PLAYERS: 15,
  TOTAL_ROUNDS: 7,
  ROUND_DURATION: 15,
  COUNTDOWN_DURATION: 3,
  ROUND_END_DURATION: 2.5,
  MAX_ACTIVE_ECHOS: 60,
  TICK_RATE: 30,
  PLAYER_SPEED: 180,
  PLAYER_RADIUS: 14,
  MAP_WIDTH: 960,
  MAP_HEIGHT: 640,
  NICKNAME_MIN: 2,
  NICKNAME_MAX: 16,
  ROOM_CODE_LENGTH: 4,
  SCORE_OBJECTIVE: 100,
  SCORE_SECONDARY: 25,
  SCORE_SURVIVAL: 25,
  INPUT_RATE: 30,
  ALLOW_BOTS: true,
  DEBUG: false,
};

export function createGameConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...GAME_CONFIG, ...overrides };
}

export function applyGameConfig(overrides: Partial<GameConfig>): void {
  Object.assign(GAME_CONFIG, overrides);
}

export const PLAYER_COLORS = [
  '#00f5ff',
  '#ff2d95',
  '#b8ff3c',
  '#ff9f1c',
  '#7b61ff',
  '#ff5e5b',
  '#2ec4b6',
  '#ffe66d',
  '#4cc9f0',
  '#f72585',
  '#80ffdb',
  '#ffba08',
  '#9b5de5',
  '#00bbf9',
  '#fee440',
] as const;

export type PlayerColor = (typeof PLAYER_COLORS)[number];
