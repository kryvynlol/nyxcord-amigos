const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',') : true },
  maxHttpBufferSize: 1e6
});
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const rateLimits = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, app: 'Nyxcord' }));

function clean(value, max = 500) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
}
function roomId(value) {
  const id = clean(value, 32).toLowerCase();
  return /^[a-z0-9-]{3,32}$/.test(id) ? id : null;
}
function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, { users: new Map(), messages: [], callUsers: new Map() });
  const room = rooms.get(id);
  if (!room.callUsers) room.callUsers = new Map();
  return room;
}
function limited(socket, event, max = 8, windowMs = 5000) {
  const key = `${socket.id}:${event}`;
  const now = Date.now();
  const old = rateLimits.get(key) || [];
  const fresh = old.filter(t => now - t < windowMs);
  fresh.push(now);
  rateLimits.set(key, fresh);
  return fresh.length <= max;
}
function userList(room) {
  return [...room.users.values()].map(u => ({ id: u.id, name: u.name, color: u.color }));
}
function callUserList(room) {
  return [...room.callUsers.values()].map(u => ({ id: u.id, name: u.name, color: u.color }));
}
function leaveRoom(socket) {
  const id = socket.data.room;
  if (!id) return;
  const room = rooms.get(id);
  if (room) {
    const wasInCall = room.callUsers.has(socket.id);
    room.callUsers.delete(socket.id);
    room.users.delete(socket.id);
    if (wasInCall) {
      socket.to(id).emit('call-user-left', { id: socket.id, users: callUserList(room) });
      io.to(id).emit('call-users', callUserList(room));
    }
    socket.to(id).emit('user-left', { id: socket.id });
    io.to(id).emit('users', userList(room));
    if (room.users.size === 0) rooms.delete(id);
  }
  socket.leave(id);
  socket.data.room = null;
}

io.on('connection', socket => {
  socket.on('join-room', ({ room: requestedRoom, name: requestedName } = {}, cb = () => {}) => {
    if (!limited(socket, 'join-room', 5)) return cb({ ok: false, error: 'Aguarde um instante e tente novamente.' });
    const id = roomId(requestedRoom);
    const name = clean(requestedName, 24);
    if (!id) return cb({ ok: false, error: 'A sala deve ter de 3 a 32 caracteres: letras, números ou hífen.' });
    if (!name) return cb({ ok: false, error: 'Digite um nome para entrar.' });
    leaveRoom(socket);
    const room = getRoom(id);
    const user = { id: socket.id, name, color: `hsl(${crypto.createHash('md5').update(name).digest().readUInt16BE(0) % 360} 75% 70%)` };
    room.users.set(socket.id, user);
    socket.join(id);
    socket.data.room = id;
    socket.data.name = name;
    socket.emit('history', room.messages.slice(-100));
    socket.to(id).emit('user-joined', user);
    io.to(id).emit('users', userList(room));
    cb({ ok: true, room: id, id: socket.id, users: userList(room) });
  });

  socket.on('chat-message', ({ text } = {}) => {
    if (!limited(socket, 'chat-message', 8)) return;
    const id = socket.data.room;
    const body = clean(text, 1000);
    if (!id || !body) return;
    const room = rooms.get(id);
    if (!room) return;
    const message = { id: crypto.randomUUID(), userId: socket.id, name: socket.data.name || 'Anônimo', text: body, time: Date.now() };
    room.messages.push(message);
    room.messages = room.messages.slice(-200);
    io.to(id).emit('chat-message', message);
  });

  // Voice call membership is separate from being present in the text room.
  socket.on('call-join', (cb = () => {}) => {
    const id = socket.data.room;
    if (!id || !rooms.has(id)) return cb({ ok: false, error: 'Entre em uma sala antes de iniciar a chamada.' });
    const room = rooms.get(id);
    const user = room.users.get(socket.id);
    if (!user) return cb({ ok: false, error: 'Sua sessão da sala expirou. Entre novamente.' });
    if (!room.callUsers.has(socket.id)) {
      room.callUsers.set(socket.id, user);
      socket.data.inCall = true;
      socket.to(id).emit('call-user-joined', user);
      io.to(id).emit('call-users', callUserList(room));
    }
    cb({ ok: true, users: callUserList(room) });
  });
  socket.on('call-leave', () => {
    const id = socket.data.room;
    if (!id || !rooms.has(id)) return;
    const room = rooms.get(id);
    if (!room.callUsers.has(socket.id)) return;
    room.callUsers.delete(socket.id);
    socket.data.inCall = false;
    socket.to(id).emit('call-user-left', { id: socket.id, users: callUserList(room) });
    io.to(id).emit('call-users', callUserList(room));
  });

  // WebRTC signaling only: audio/video/screen media travels peer-to-peer, not through this server.
  socket.on('webrtc-offer', ({ to, offer } = {}) => {
    if (socket.data.room && typeof to === 'string' && offer) io.to(to).emit('webrtc-offer', { from: socket.id, offer });
  });
  socket.on('webrtc-answer', ({ to, answer } = {}) => {
    if (socket.data.room && typeof to === 'string' && answer) io.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });
  socket.on('webrtc-ice', ({ to, candidate } = {}) => {
    if (socket.data.room && typeof to === 'string' && candidate) io.to(to).emit('webrtc-ice', { from: socket.id, candidate });
  });
  socket.on('disconnect', () => { leaveRoom(socket); for (const key of rateLimits.keys()) if (key.startsWith(`${socket.id}:`)) rateLimits.delete(key); });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Nyxcord rodando na porta ${PORT}`));
