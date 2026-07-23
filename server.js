/* =========================================================
   Network Access Node — Watch Party backend.
   Runs on Render as a long-lived Node process (not
   serverless), so it can hold WebSocket connections open.
   ========================================================= */
const express = require('express');
const multer = require('multer');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const RoomStore = require('./rooms');

const PORT = process.env.PORT || 8080;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());

/* ---------------------------------------------------------
   REST: room lifecycle
   --------------------------------------------------------- */
app.post('/rooms', (req, res) => {
  const room = RoomStore.createRoom();
  res.json({ code: room.code });
});

app.get('/rooms/:code', (req, res) => {
  const room = RoomStore.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'room-not-found' });
  res.json(RoomStore.roomSummary(room));
});

/* ---------------------------------------------------------
   REST: host uploads a local file so the room can share it.
   Stored on disk, then served back out as a normal URL that
   the frontend's existing streaming.js can play like any
   other network source.
   --------------------------------------------------------- */
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`;
      cb(null, safeName);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4GB ceiling; tune to taste
});

app.post('/rooms/:code/upload', upload.single('media'), (req, res) => {
  const room = RoomStore.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'room-not-found' });
  if (!req.file) return res.status(400).json({ error: 'no-file' });

  const publicUrl = `/media/${req.file.filename}`;
  const kind = req.file.mimetype.startsWith('audio/') ? 'audio' : 'video';

  room.media = { type: 'upload', src: publicUrl, kind, title: req.file.originalname };
  RoomStore.broadcast(room, { type: 'load-media', media: room.media });

  res.json({ url: publicUrl, kind });
});

/* ---------------------------------------------------------
   Range-request file serving so seeking works on uploads.
   --------------------------------------------------------- */
app.get('/media/:filename', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  fs.stat(filePath, (err, stat) => {
    if (err) return res.status(404).end();

    const range = req.headers.range;
    if (!range) {
      res.writeHead(200, { 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
      return fs.createReadStream(filePath).pipe(res);
    }

    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : stat.size - 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': 'application/octet-stream',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  });
});

/* ---------------------------------------------------------
   WebSocket: presence, sync events, chat, WebRTC signaling.
   Protocol (JSON messages):
     client -> server: { type:'join', code, name }
                        { type:'chat', text }
                        { type:'sync', action, payload }   // host-only, enforced below
                        { type:'signal', to, data }        // WebRTC offer/answer/ice relay
                        { type:'mute', muted }
     server -> client:  { type:'joined', clientId, room }
                         { type:'presence', room }
                         { type:'chat', from, name, text, ts }
                         { type:'sync', action, payload }
                         { type:'load-media', media }
                         { type:'signal', from, data }
                         { type:'error', reason }
   --------------------------------------------------------- */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  let joinedCode = null;
  let clientId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      const result = RoomStore.joinRoom(msg.code, ws, msg.name);
      if (result.error) {
        ws.send(JSON.stringify({ type: 'error', reason: result.error }));
        return;
      }
      joinedCode = result.room.code;
      clientId = result.clientId;
      ws.send(JSON.stringify({ type: 'joined', clientId, room: RoomStore.roomSummary(result.room) }));
      RoomStore.broadcast(result.room, { type: 'presence', room: RoomStore.roomSummary(result.room) });
      return;
    }

    if (!joinedCode || !clientId) return; // must join before anything else
    const room = RoomStore.getRoom(joinedCode);
    if (!room) return;

    switch (msg.type) {
      case 'chat': {
        const client = room.clients.get(clientId);
        const entry = { from: clientId, name: client?.name || 'Guest', text: String(msg.text).slice(0, 1000), ts: Date.now() };
        RoomStore.pushChat(joinedCode, entry);
        RoomStore.broadcast(room, { type: 'chat', ...entry });
        break;
      }
      case 'sync': {
        // only the host's transport actions are authoritative
        if (clientId !== room.hostId) return;
        RoomStore.broadcast(room, { type: 'sync', action: msg.action, payload: msg.payload }, clientId);
        break;
      }
      case 'signal': {
        const target = room.clients.get(msg.to);
        if (target && target.ws.readyState === target.ws.OPEN) {
          target.ws.send(JSON.stringify({ type: 'signal', from: clientId, data: msg.data }));
        }
        break;
      }
      case 'mute': {
        const client = room.clients.get(clientId);
        if (client) client.muted = !!msg.muted;
        RoomStore.broadcast(room, { type: 'presence', room: RoomStore.roomSummary(room) });
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => {
    if (!joinedCode || !clientId) return;
    const room = RoomStore.leaveRoom(joinedCode, clientId);
    if (room) RoomStore.broadcast(room, { type: 'presence', room: RoomStore.roomSummary(room) });
  });
});

server.listen(PORT, () => {
  console.log(`Network Access Node backend listening on :${PORT}`);
});
