'use strict';
/* ============================================================
 * 最小 WebSocket 服务器实现（RFC 6455，零依赖，仅 Node 端使用）
 * 支持：握手、文本帧收发（客户端掩码解码）、粘包处理、close/ping/pong
 * ============================================================ */

const crypto = require('crypto');
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/* 握手响应 key */
function acceptKey(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

/* 帧解码器（处理粘包与分包） */
class FrameDecoder {
  constructor() {
    this.buf = Buffer.alloc(0);
    this.fragBuf = null;
    this.fragOpcode = 0;
  }

  push(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    return this.parse();
  }

  parse() {
    const frames = [];
    while (true) {
      if (this.buf.length < 2) break;
      const fin = (this.buf[0] & 0x80) !== 0;
      const opcode = this.buf[0] & 0x0f;
      const masked = (this.buf[1] & 0x80) !== 0;
      if (!masked) throw new Error('client frame must be masked');   // RFC 6455 §5.1
      let len = this.buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) break;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) break;
        len = Number(this.buf.readBigUInt64BE(2));
        off = 10;
      }
      if (len > 262144) {
        /* 帧过大：丢弃连接（防内存耗尽） */
        throw new Error('frame too large: ' + len);
      }
      let maskKey = null;
      if (masked) {
        if (this.buf.length < off + 4) break;
        maskKey = this.buf.slice(off, off + 4);
        off += 4;
      }
      if (this.buf.length < off + len) break;
      let payload = this.buf.slice(off, off + len);
      if (maskKey) {
        const out = Buffer.alloc(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ maskKey[i & 3];
        payload = out;
      }
      this.buf = this.buf.slice(off + len);
      if (opcode === 0x0) {
        if (this.fragBuf === null) continue;
        this.fragBuf = Buffer.concat([this.fragBuf, payload]);
        if (fin) {
          frames.push({ fin: true, opcode: this.fragOpcode, payload: this.fragBuf });
          this.fragBuf = null;
          this.fragOpcode = 0;
        }
        continue;
      }
      if (!fin && (opcode === 0x1 || opcode === 0x2)) {
        this.fragBuf = payload;
        this.fragOpcode = opcode;
        continue;
      }
      frames.push({ fin, opcode, payload });
    }
    return frames;
  }
}

/* 编码一帧（服务端不掩码） */
function encodeFrame(opcode, payload, fin = true) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, data]);
}

const OP = { TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xA };

/* 单个 WebSocket 连接封装 */
class WSConn {
  constructor(socket, req) {
    this.socket = socket;
    this.decoder = new FrameDecoder();
    this.closed = false;
    this.onMessage = null;
    this.onClose = null;
    this.lastPong = Date.now();

    socket.on('data', (chunk) => {
      try {
        const frames = this.decoder.push(chunk);
        for (const f of frames) this.handleFrame(f);
      } catch (e) {
        this.close();
      }
    });
    socket.setNoDelay(true);      // 局域网小快照低延迟
    socket.on('close', () => this.handleClose());
    socket.on('error', () => this.handleClose());

    /* 心跳：15s ping，30s 无响应即清理（防断网死连接占位） */
    this.heartbeat = setInterval(() => {
      if (Date.now() - this.lastPong > 30000) { this.close(); return; }
      try { this.socket.write(encodeFrame(OP.PING, Buffer.alloc(0))); } catch (e) { this.close(); }
    }, 15000);
  }

  handleFrame(f) {
    switch (f.opcode) {
      case OP.TEXT:
        if (this.onMessage) this.onMessage(f.payload.toString('utf8'));
        break;
      case OP.PING:
        this.socket.write(encodeFrame(OP.PONG, f.payload));
        break;
      case OP.PONG:
        this.lastPong = Date.now();
        break;
      case OP.CLOSE:
        this.socket.write(encodeFrame(OP.CLOSE, Buffer.alloc(0)));
        this.socket.end();
        this.handleClose();
        break;
    }
  }

  handleClose() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    if (this.onClose) this.onClose();
  }

  sendText(text) {
    if (this.closed) return;
    this.socket.write(encodeFrame(OP.TEXT, text));
  }

  send(obj) {
    this.sendText(JSON.stringify(obj));
  }

  close() {
    try {
      this.socket.write(encodeFrame(OP.CLOSE, Buffer.alloc(0)));
      this.socket.end();
      this.socket.destroy();
    } catch (e) { /* ignore */ }
    this.handleClose();
  }
}

/* 升级 HTTP 请求为 WebSocket */
function upgradeRequest(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }
  const accept = acceptKey(key);
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  return new WSConn(socket, req);
}

module.exports = { WSConn, FrameDecoder, encodeFrame, acceptKey, upgradeRequest, OP };
