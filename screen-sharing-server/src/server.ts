import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import type {
  ClientToServerEvents,
  Room,
  RoomInfo,
  ServerToClientEvents,
  User,
} from './types.js';
import { generateRoomCode, isValidCode, log, normalizeCode } from './utils.js';

const PORT = Number(process.env.PORT ?? 5000);
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS ?? 1000 * 60 * 60); // 1h
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*'; // TODO: restrict in production

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CORS_ORIGIN },
});

const rooms = new Map<string, Room>(); // keyed by room code
const users = new Map<string, User>(); // keyed by socket id

function toRoomInfo(room: Room): RoomInfo {
  return {
    code: room.code,
    hostConnected: room.hostId !== null,
    viewerCount: room.viewers.length,
    createdAt: room.createdAt.toISOString(),
  };
}

function createRoom(): Room {
  let code = generateRoomCode();
  while (rooms.has(code)) {
    code = generateRoomCode();
  }
  const room: Room = {
    id: uuidv4(),
    code,
    hostId: null,
    viewers: [],
    createdAt: new Date(),
  };
  rooms.set(code, room);
  log('Room', `created ${code} (${room.id})`);
  return room;
}

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: rooms.size, uptime: process.uptime() });
});

app.post('/api/rooms/create', (_req, res) => {
  try {
    const room = createRoom();
    res.status(201).json(toRoomInfo(room));
  } catch (err) {
    log('Server', 'failed to create room', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.get('/api/rooms/:code', (req, res) => {
  const code = normalizeCode(req.params.code);
  if (!isValidCode(code)) {
    res.status(400).json({ error: 'Invalid room code format' });
    return;
  }
  const room = rooms.get(code);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  res.json(toRoomInfo(room));
});

// ---------------------------------------------------------------------------
// Socket.io signaling
// ---------------------------------------------------------------------------

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function relay(
  event: 'webrtc:offer' | 'webrtc:answer' | 'webrtc:ice-candidate',
  socket: AppSocket,
  to: string,
  data: unknown,
): void {
  const sender = users.get(socket.id);
  if (!sender) {
    socket.emit('room:error', 'Join a room before signaling');
    return;
  }
  const target = users.get(to);
  if (!target || target.roomId !== sender.roomId) {
    socket.emit('room:error', `Peer ${to} is not in your room`);
    return;
  }
  log('Signal', `${event} ${socket.id} -> ${to}`);
  socket.to(to).emit(event, socket.id, data);
}

io.on('connection', (socket: AppSocket) => {
  log('Server', `socket connected ${socket.id}`);

  socket.on('host:join', ({ code: rawCode }) => {
    try {
      const code = normalizeCode(rawCode ?? '');
      const room = rooms.get(code);
      if (!room) {
        socket.emit('room:error', `Room ${code} not found`);
        return;
      }
      if (room.hostId && room.hostId !== socket.id) {
        socket.emit('room:error', `Room ${code} already has a host`);
        return;
      }
      room.hostId = socket.id;
      users.set(socket.id, { id: socket.id, type: 'host', roomId: room.code });
      socket.join(room.code);
      socket.emit('room:joined', { ...toRoomInfo(room), role: 'host', selfId: socket.id });
      socket.to(room.code).emit('host:connected');
      log('Room', `host ${socket.id} joined ${code}`);
    } catch (err) {
      log('Server', 'host:join failed', err);
      socket.emit('room:error', 'Internal error joining room');
    }
  });

  socket.on('viewer:join', ({ code: rawCode }) => {
    try {
      const code = normalizeCode(rawCode ?? '');
      const room = rooms.get(code);
      if (!room) {
        socket.emit('room:error', `Room ${code} not found`);
        return;
      }
      if (!room.viewers.includes(socket.id)) {
        room.viewers.push(socket.id);
      }
      users.set(socket.id, { id: socket.id, type: 'viewer', roomId: room.code });
      socket.join(room.code);
      socket.emit('room:joined', { ...toRoomInfo(room), role: 'viewer', selfId: socket.id });
      if (room.hostId) {
        io.to(room.hostId).emit('viewer:connected', socket.id);
      }
      log('Room', `viewer ${socket.id} joined ${code} (${room.viewers.length} viewers)`);
    } catch (err) {
      log('Server', 'viewer:join failed', err);
      socket.emit('room:error', 'Internal error joining room');
    }
  });

  socket.on('webrtc:offer', ({ to, data }) => relay('webrtc:offer', socket, to, data));
  socket.on('webrtc:answer', ({ to, data }) => relay('webrtc:answer', socket, to, data));
  socket.on('webrtc:ice-candidate', ({ to, data }) =>
    relay('webrtc:ice-candidate', socket, to, data),
  );

  socket.on('latency:ping', (sentAt, ack) => {
    if (typeof ack === 'function') ack(sentAt);
  });

  socket.on('disconnect', (reason) => {
    log('Server', `socket disconnected ${socket.id} (${reason})`);
    const user = users.get(socket.id);
    if (!user) return;
    users.delete(socket.id);

    const room = rooms.get(user.roomId);
    if (!room) return;

    if (user.type === 'host') {
      room.hostId = null;
      io.to(room.code).emit('host:disconnected');
      log('Room', `host left ${room.code}`);
    } else {
      room.viewers = room.viewers.filter((id) => id !== socket.id);
      if (room.hostId) {
        io.to(room.hostId).emit('viewer:disconnected', socket.id);
      }
      log('Room', `viewer left ${room.code} (${room.viewers.length} viewers)`);
    }
  });
});

// ---------------------------------------------------------------------------
// Housekeeping: drop empty, expired rooms
// ---------------------------------------------------------------------------

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const expired = now - room.createdAt.getTime() > ROOM_TTL_MS;
    const empty = room.hostId === null && room.viewers.length === 0;
    if (expired && empty) {
      rooms.delete(code);
      io.to(code).emit('room:closed');
      log('Room', `expired ${code}`);
    }
  }
}, 60_000).unref();

httpServer.listen(PORT, () => {
  log('Server', `signaling server listening on :${PORT} (CORS: ${CORS_ORIGIN})`);
});
