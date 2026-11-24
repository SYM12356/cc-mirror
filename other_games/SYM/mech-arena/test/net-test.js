'use strict';
/* ============================================================
 * 局域网联机服务器测试（真实 WebSocket 双客户端）
 * 运行：node test/net-test.js
 * ============================================================ */

const { spawn } = require('child_process');
const path = require('path');

const PORT = 3199;
const root = path.join(__dirname, '..');

/* 启动服务器子进程 */
const server = spawn('node', ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT) }
});

let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ FAIL: ' + msg); failures++; }
}

function wsConnect(ip = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${ip}:${PORT}`);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(e);
  });
}

function nextMsg(ws, type, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待 ' + type + ' 超时')), timeout);
    const handler = (e) => {
      const data = JSON.parse(e.data);
      if (!type || data.type === type) {
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        resolve(data);
      }
    };
    ws.addEventListener('message', handler);
  });
}

(async () => {
  /* 等待服务器就绪 */
  await new Promise((r) => setTimeout(r, 600));

  console.log('== WebSocket 握手与帧编解码 ==');
  const host = await wsConnect();
  check(host.readyState === WebSocket.OPEN, 'WebSocket 连接成功（握手/掩码解码正常）');

  console.log('== 房间创建与加入 ==');
  host.send(JSON.stringify({ type: 'create', name: '房主A' }));
  const created = await nextMsg(host, 'created');
  check(created.type === 'created' && /^\d{4}$/.test(created.roomId), `房间创建成功（房间号 ${created.roomId}）`);
  check(Array.isArray(created.ips), '服务器返回本机 IP 列表');

  const guest = await wsConnect();
  const peerJoinedPromise = nextMsg(host, 'peer-joined');   // 先注册监听（服务器先发房主）
  guest.send(JSON.stringify({ type: 'join', roomId: created.roomId, name: '客机B' }));
  const joined = await nextMsg(guest, 'joined');
  check(joined.type === 'joined', '加入者进入房间');

  const peerJoined = await peerJoinedPromise;
  check(peerJoined.name === '客机B', '房主收到对手加入通知');

  console.log('== 消息中转 ==');
  guest.send(JSON.stringify({ type: 'ready', mech: 'scout' }));
  const guestReady = await nextMsg(host, 'guest-ready');
  check(guestReady.mech === 'scout', '加入者选机消息转发给房主');

  host.send(JSON.stringify({
    type: 'start',
    p1Mech: 'tank', p2Mech: 'scout',
    loadout1: ['minigun', 'grenade'], loadout2: ['laser'],
    theme: { name: '测试地图' }, obstacles: []
  }));
  const startMsg = await nextMsg(guest, 'host-start');
  check(startMsg.p2Mech === 'scout' && startMsg.theme.name === '测试地图', '房主开始消息（含配置与地图）转发给加入者');

  /* 高频状态同步 */
  let stateCount = 0;
  const statePromise = new Promise((resolve) => {
    const handler = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'state') {
        stateCount++;
        if (stateCount >= 5) {
          guest.removeEventListener('message', handler);
          resolve(data);
        }
      }
    };
    guest.addEventListener('message', handler);
  });
  for (let i = 0; i < 6; i++) {
    host.send(JSON.stringify({ type: 'state', seq: i, p1: { x: i }, p2: { x: i * 2 } }));
  }
  const stateMsg = await statePromise;
  check(stateMsg.seq === 4 && stateMsg.p2.x === 8, '状态快照持续转发');

  console.log('== 观战者 ==');
  const host2 = await wsConnect();
  host2.send(JSON.stringify({ type: 'create', name: '房主2' }));
  const created2 = await nextMsg(host2, 'created');
  const guest2 = await wsConnect();
  guest2.send(JSON.stringify({ type: 'join', roomId: created2.roomId, name: '客机2' }));
  await nextMsg(guest2, 'joined');
  const spec2 = await wsConnect();
  const spec2Promise = nextMsg(spec2, 'spectator');
  spec2.send(JSON.stringify({ type: 'join', roomId: created2.roomId, name: '观众' }));
  const specMsg = await spec2Promise;
  check(specMsg.type === 'spectator', '房间满员时第三连接成为观战者');
  /* 房主广播状态 → 观战者也能收到 */
  const specStatePromise = nextMsg(spec2, 'state');
  host2.send(JSON.stringify({ type: 'state', seq: 1, note: '观战转发' }));
  const specState = await specStatePromise;
  check(specState.seq === 1, '状态快照同步给观战者');
  host2.close(); guest2.close(); spec2.close();

  console.log('== 断开处理 ==');
  guest.close();
  const peerLeft = await nextMsg(host, 'peer-left');
  check(peerLeft.type === 'peer-left', '对手断开时房主收到通知');

  host.close();
  server.kill();
  console.log(failures === 0 ? '\n✅ 联机服务器测试通过' : `\n❌ ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.log('  ✗ FAIL: 测试异常 →', e.message);
  server.kill();
  process.exit(1);
});
