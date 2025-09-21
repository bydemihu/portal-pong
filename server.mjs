// server.mjs — WebSocket signaling with simple HTTP front (opening in a browser shows 200 OK)
// Relays: WebRTC signaling, gameplay data fallback, and Cloudflare Realtime SFU publish messages.

import http from 'http';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8080;

/** roomName -> {clients: Set<WS>, createdAt} */
const rooms = new Map();
/** client -> {room, role, id} */
const meta = new Map();

function listRooms() {
  const out = [];
  for (const [name, r] of rooms.entries()) out.push({ name, occupants: r.clients.size });
  return out;
}

function safeSend(ws, data) { try { ws.send(data); } catch {} }

function broadcastRoomUpdate(name) {
  const r = rooms.get(name);
  const payload = JSON.stringify({
    type: 'room_update',
    room: name,
    occupants: r ? r.clients.size : 0
  });
  if (r) for (const c of r.clients) safeSend(c, payload);
  const lobby = JSON.stringify({ type: 'rooms', rooms: listRooms() });
  for (const c of wss.clients) safeSend(c, lobby);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('BodyPong signaling server. Use WebSocket (wss://) to connect.\n');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  // initial lobby list
  safeSend(ws, JSON.stringify({ type: 'rooms', rooms: listRooms() }));

  ws.on('message', (msg) => {
    let data; try { data = JSON.parse(msg.toString()); } catch { return; }

    if (data.type === 'list') {
      safeSend(ws, JSON.stringify({ type: 'rooms', rooms: listRooms() }));
      return;
    }

    if (data.type === 'create_or_join') {
      const room = data.room?.trim();
      if (!room) return;
      let r = rooms.get(room);
      if (!r) { r = { clients: new Set(), createdAt: Date.now() }; rooms.set(room, r); }

      if (r.clients.size >= 2) {
        safeSend(ws, JSON.stringify({ type: 'join_rejected', reason: 'Room full' }));
        return;
      }

      r.clients.add(ws);
      const role = (r.clients.size === 1) ? 'P1' : 'P2';
      meta.set(ws, { room, role, id: Math.random().toString(36).slice(2) });
      safeSend(ws, JSON.stringify({ type: 'join_ok', room, role, occupants: r.clients.size }));

      broadcastRoomUpdate(room);

      if (r.clients.size === 2) {
        for (const c of r.clients) safeSend(c, JSON.stringify({ type: 'paired', room }));
      }
      return;
    }

    // Relay signaling or gameplay/SFU between peers in same room
    if ([
      'signal_offer', 'signal_answer', 'signal_ice', 'ready_state',
      'relay',             // gameplay DC fallback
      'sfu_publish'        // Cloudflare Realtime SFU publish info
    ].includes(data.type)) {
      const me = meta.get(ws); if (!me) return;
      const r = rooms.get(me.room); if (!r) return;
      for (const c of r.clients) if (c !== ws) safeSend(c, msg.toString());
      return;
    }

    if (data.type === 'leave') {
      const m = meta.get(ws);
      if (!m) return;
      const r = rooms.get(m.room);
      if (r) {
        r.clients.delete(ws);
        for (const c of r.clients) safeSend(c, JSON.stringify({ type: 'peer_left' }));
        if (r.clients.size === 0) rooms.delete(m.room);
        broadcastRoomUpdate(m.room);
      }
      meta.delete(ws);
    }
  });

  ws.on('close', () => {
    const m = meta.get(ws);
    if (!m) return;
    const r = rooms.get(m.room);
    if (r) {
      r.clients.delete(ws);
      for (const c of r.clients) safeSend(c, JSON.stringify({ type: 'peer_left' }));
      if (r.clients.size === 0) rooms.delete(m.room);
      broadcastRoomUpdate(m.room);
    }
    meta.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server listening on ws://localhost:${PORT}`);
});
