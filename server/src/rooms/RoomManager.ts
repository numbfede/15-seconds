import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@15-seconds/shared';
import { GAME_CONFIG } from '@15-seconds/shared';
import { Room } from './Room.js';

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function sanitizeName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length < GAME_CONFIG.NICKNAME_MIN) return null;
  if (trimmed.length > GAME_CONFIG.NICKNAME_MAX) return null;
  return trimmed;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly playerRoom = new Map<string, string>();
  private idSeq = 0;

  createPlayerId(): string {
    this.idSeq += 1;
    return `p-${Date.now().toString(36)}-${this.idSeq}`;
  }

  handleConnection(ws: WebSocket): void {
    const playerId = this.createPlayerId();
    send(ws, { type: 'WELCOME', playerId });

    ws.on('message', (data) => {
      const raw = typeof data === 'string' ? data : data.toString();
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw) as ClientMessage;
      } catch {
        send(ws, { type: 'ERROR', code: 'BAD_JSON', message: 'Invalid message' });
        return;
      }
      this.handleMessage(playerId, ws, msg);
    });

    ws.on('close', () => {
      this.handleDisconnect(playerId);
    });
  }

  private handleDisconnect(playerId: string): void {
    const code = this.playerRoom.get(playerId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) {
      this.playerRoom.delete(playerId);
      return;
    }
    room.removeClient(playerId);
    this.playerRoom.delete(playerId);
  }

  private registerRoom(room: Room, playerId: string): void {
    room.onEmpty = () => {
      this.rooms.delete(room.code);
    };
    this.rooms.set(room.code, room);
    this.playerRoom.set(playerId, room.code);
  }

  private handleMessage(playerId: string, ws: WebSocket, msg: ClientMessage): void {
    if (msg.type === 'PING') {
      send(ws, { type: 'PONG', t: msg.t });
      return;
    }

    if (msg.type === 'CREATE_ROOM') {
      const name = sanitizeName(msg.name);
      if (!name) {
        send(ws, {
          type: 'ERROR',
          code: 'BAD_NAME',
          message: 'Nickname must be 2–16 characters',
        });
        return;
      }
      this.leaveCurrent(playerId);

      let room = new Room(playerId, name, ws);
      let attempts = 0;
      while (this.rooms.has(room.code) && attempts < 10) {
        room.destroy();
        room = new Room(playerId, name, ws);
        attempts++;
      }

      this.registerRoom(room, playerId);
      send(ws, {
        type: 'ROOM_CREATED',
        lobby: room.getLobby(),
        playerId,
      });
      return;
    }

    if (msg.type === 'JOIN_ROOM') {
      const name = sanitizeName(msg.name);
      if (!name) {
        send(ws, {
          type: 'ERROR',
          code: 'BAD_NAME',
          message: 'Nickname must be 2–16 characters',
        });
        return;
      }
      const code = msg.roomCode.trim().toUpperCase();
      const room = this.rooms.get(code);
      if (!room) {
        send(ws, { type: 'ERROR', code: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' });
        return;
      }
      this.leaveCurrent(playerId);
      const result = room.tryJoin(playerId, name, ws);
      if (!result.ok) {
        send(ws, { type: 'ERROR', code: result.code, message: result.message });
        return;
      }
      this.playerRoom.set(playerId, room.code);
      send(ws, {
        type: 'ROOM_JOINED',
        lobby: room.getLobby(),
        playerId,
      });
      room.broadcastLobby();
      return;
    }

    const code = this.playerRoom.get(playerId);
    if (!code) {
      send(ws, { type: 'ERROR', code: 'NOT_IN_ROOM', message: 'Not in a room' });
      return;
    }
    const room = this.rooms.get(code);
    if (!room) {
      this.playerRoom.delete(playerId);
      send(ws, { type: 'ERROR', code: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' });
      return;
    }

    if (msg.type === 'LEAVE_ROOM') {
      room.removeClient(playerId);
      this.playerRoom.delete(playerId);
      send(ws, { type: 'LEFT_ROOM' });
      return;
    }

    room.handleMessage(playerId, msg);
  }

  private leaveCurrent(playerId: string): void {
    const code = this.playerRoom.get(playerId);
    if (!code) return;
    const room = this.rooms.get(code);
    room?.removeClient(playerId);
    this.playerRoom.delete(playerId);
  }

  get roomCount(): number {
    return this.rooms.size;
  }
}
