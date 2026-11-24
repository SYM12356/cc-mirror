'use strict';
/* ============================================================
 * MECH ARENA 服务器（纯 Node，零依赖）
 *  - HTTP 静态文件服务
 *  - WebSocket 局域网对战：房间创建/加入/消息中转
 * 启动：node server.js  →  http://localhost:3000
 * ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { upgradeRequest } = require('./js/net-ws');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

/* 输入数值钳制（服务器无 U 工具） */
function clampNum(v, a, b) {
  return (typeof v === 'number' && !isNaN(v)) ? Math.min(b, Math.max(a, v)) : 0;
}

/* ---------- 房间管理 ---------- */
const rooms = new Map();   // roomId -> { host, guest, hostName, guestName, spectators: [] }

function genRoomId() {
  for (let i = 0; i < 100; i++) {
    const id = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(id)) return id;
  }
  return String(Date.now() % 10000);
}

function localIPs() {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const it of list || []) {
      if (it.family === 'IPv4' && !it.internal) ips.push(it.address);
    }
  }
  return ips;
}

function sendTo(conn, obj) {
  if (conn) conn.send(obj);
}

function relay(room, from, obj) {
  const to = from === room.host ? room.guest : room.host;
  sendTo(to, obj);
  /* 状态/开始/结果/聊天也同步给观战者 */
  if (obj.type === 'state' || obj.type === 'start' || obj.type === 'result' || obj.type === 'chat') {
    for (const sp of room.spectators) sendTo(sp, obj);
  }
}

function leaveRoom(conn) {
  for (const [roomId, room] of rooms) {
    /* 观战者断开：仅从观战列表移除 */
    const si = room.spectators.indexOf(conn);
    if (si !== -1) {
      room.spectators.splice(si, 1);
      console.log(`观战者离开房间 ${roomId}`);
      continue;               // 继续遍历（同一连接可能涉及多房间）
    }
    if (room.host === conn || room.guest === conn) {
      const isHost = room.host === conn;
      const other = isHost ? room.guest : room.host;
      sendTo(other, { type: 'peer-left', msg: isHost ? '房主已离开' : '对手已断开' });
      for (const sp of room.spectators) sendTo(sp, { type: 'peer-left', msg: '对战已结束' });
      room.host = null;
      room.guest = null;
      room.spectators = [];
      rooms.delete(roomId);
      console.log(`房间 ${roomId} 已关闭（${isHost ? '房主' : '对手'}离开）`);
      continue;
    }
  }
  return null;
}

/* ---------- WebSocket 消息处理 ---------- */
function handleWSMessage(conn, msg) {
  let data;
  try { data = JSON.parse(msg); } catch (e) { return; }
  /* 非对象消息（null/数字/字符串/数组）直接忽略 */
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;

  switch (data.type) {
    case 'create': {
      leaveRoom(conn);           // 清理该连接已占用的旧房间
      data.name = String(data.name || '房主').slice(0, 32);
      const roomId = genRoomId();
      const room = { roomId, host: conn, guest: null, hostName: data.name || '房主', guestName: null, spectators: [] };
      rooms.set(roomId, room);
      conn.roomId = roomId;
      console.log(`房间 ${roomId} 创建（${room.hostName}）`);
      conn.send({ type: 'created', roomId, ips: localIPs() });
      break;
    }
    case 'join': {
      /* 换房前清理旧房间占用（防观战者跨房泄漏） */
      leaveRoom(conn);
      data.name = String(data.name || '对手').slice(0, 32);
      let roomId = String(data.roomId || '').slice(0, 8);
      let room = rooms.get(roomId);
      if (!room) {
        /* 空房间号 → 自动加入第一个有空位的房间 */
        if (!roomId || roomId === '0000') {
          for (const [, r] of rooms) {
            if (r.guest === null) { room = r; roomId = r.roomId; break; }
          }
        }
      }
      if (!room) {
        conn.send({ type: 'error', msg: '房间不存在' });
        break;
      }
      if (room.host === conn) {
        conn.send({ type: 'error', msg: '不能加入自己的房间' });
        break;
      }
      if (room.guest === conn) {
        conn.send({ type: 'error', msg: '已在房间中' });
        break;
      }
      if (room.guest) {
        /* 房间已满 → 以观战身份加入 */
        room.spectators.push(conn);
        conn.roomId = roomId;
        console.log(`观战者加入房间 ${roomId}`);
        conn.send({ type: 'spectator', roomId, hostName: room.hostName, guestName: room.guestName });
        sendTo(room.host, { type: 'spectator-joined' });
        break;
      }
      room.guest = conn;
      room.guestName = data.name || '对手';
      conn.roomId = roomId;
      console.log(`玩家加入房间 ${roomId}（${room.guestName}）`);
      sendTo(room.host, { type: 'peer-joined', name: room.guestName });
      conn.send({ type: 'joined', roomId, hostName: room.hostName });
      break;
    }
    case 'ready': {
      /* 加入者选好机甲 → 通知房主（白名单校验，防非法机甲拖垮房主客户端） */
      const room = rooms.get(conn.roomId);
      if (room && room.guest === conn) {
        const VALID = ['tank', 'scout', 'assault', 'artillery'];
        const mech = VALID.includes(data.mech) ? data.mech : 'tank';
        const loadout = Array.isArray(data.loadout) ? data.loadout.slice(0, 4) : null;
        sendTo(room.host, { type: 'guest-ready', mech, loadout, plug: typeof data.plug === 'string' ? data.plug : null });
      }
      break;
    }
    case 'start': {
      /* 房主开始对局（携带双方配置与地图）→ 通知加入者与观战者 */
      const room = rooms.get(conn.roomId);
      if (room && room.host === conn) {
        const payload = {
          type: 'host-start',
          p1Mech: data.p1Mech, p2Mech: data.p2Mech,
          loadout1: data.loadout1, loadout2: data.loadout2,
          plug1: data.plug1, plug2: data.plug2,
          theme: data.theme, obstacles: data.obstacles
        };
        sendTo(room.guest, payload);
        for (const sp of room.spectators) sendTo(sp, payload);
      }
      break;
    }
    case 'input': {
      /* 仅客机可上传输入（观战者/房主禁止） */
      const room = rooms.get(conn.roomId);
      if (!room || room.guest !== conn) break;
      const d = data.data || {};
      const clean = {
        mx: clampNum(d.mx, -1, 1),
        my: clampNum(d.my, -1, 1),
        fire: d.fire === true,
        sub: d.sub === true,
        skill: d.skill === true,
        ulti: d.ulti === true
      };
      relay(room, conn, { type: 'input', data: clean });
      break;
    }
    case 'state':
    case 'result': {
      /* 仅房主可广播状态/结果 */
      const room = rooms.get(conn.roomId);
      if (room && room.host === conn) relay(room, conn, data);
      break;
    }
    case 'chat': {
      const room = rooms.get(conn.roomId);
      if (room) {
        data.text = String(data.text || '').slice(0, 200);   // 防日志洪水
        data.from = String(data.from || '').slice(0, 32);
        relay(room, conn, data);
      }
      break;
    }
  }
}

/* ---------- HTTP 静态服务 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  /* 只允许 GET */
  if (req.method !== 'GET') {
    res.writeHead(405).end('Method Not Allowed');
    return;
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }
  /* 含 NUL 等非法字符：拒绝（防 fs.readFile 抛 ERR_INVALID_ARG_VALUE 崩溃进程） */
  if (urlPath.indexOf('\0') !== -1 || /[\x00-\x1f]/.test(urlPath)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';

  /* 防路径穿越 */
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

/* WebSocket 升级 */
server.on('upgrade', (req, socket) => {
  const conn = upgradeRequest(req, socket);
  if (!conn) return;
  conn.onMessage = (msg) => handleWSMessage(conn, msg);
  conn.onClose = () => leaveRoom(conn);
});

server.listen(PORT, () => {
  console.log('==============================================');
  console.log('  MECH ARENA · 机甲对决 已启动');
  console.log(`  本机访问    http://localhost:${PORT}`);
  console.log(`  局域网联机  http://${localIPs()[0] || '?'}:${PORT}`);
  console.log('==============================================');
});
