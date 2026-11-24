'use strict';
/* ============================================================
 * DOM 冒烟测试：模拟浏览器加载全部脚本（含 ui.js / main.js）
 * 运行：node test/dom-smoke.js
 * ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

/* ---------- 最小 DOM mock ---------- */
class MockEl {
  constructor(tag, id) {
    this.tagName = tag.toUpperCase();
    this.id = id || '';
    this.children = [];
    this.style = { setProperty() {} };
    this.dataset = {};
    this.classList = { _s: new Set(), add: (c) => this.classList._s.add(c), remove: (c) => this.classList._s.delete(c), toggle: (c, f) => { f ? this.classList._s.add(c) : this.classList._s.delete(c); }, contains: (c) => this.classList._s.has(c) };
    this._listeners = {};
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.checked = false;
  }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  appendChild(c) { this.children.push(c); }
  querySelectorAll() { return []; }
  closest(sel) {
    /* 简化：仅匹配自身 className（事件委托测试用） */
    const cls = sel.replace('.', '');
    return (this.className || '').split(/\s+/).includes(cls) ? this : null;
  }
}

const elements = {};
['menu', 'menu-coins', 'btn-hangar', 'btn-shop', 'btn-help', 'btn-quests', 'btn-settings',
 'btn-back-menu', 'btn-rematch', 'btn-result-menu', 'btn-hangar-back', 'btn-hangar-shop',
 'btn-shop-back', 'btn-quests-back', 'btn-settings-back', 'btn-ranked-back', 'btn-ranked-start',
 'btn-tournament-back', 'btn-tournament-menu', 'btn-tournament-start', 'btn-training-back',
 'btn-training-start', 'mech-cards', 'select-title', 'hangar-mechs', 'hangar-coins', 'hangar-medals', 'shop-medals',
 'shop-items', 'shop-coins', 'ranked-coins', 'rank-badge', 'rank-name', 'rank-score',
 'rank-bar-fill', 'rank-wins', 'rank-losses', 'rank-champs', 'tournament-champs',
 'tournament-title', 'tournament-bracket', 'training-mechs', 'training-coins',
 'quests-coins', 'quests-daily', 'quests-achievements', 'profile', 'profile-coins', 'profile-grid', 'btn-profile', 'btn-profile-back', 'set-volume', 'set-volume-label',
 'set-shake', 'set-fps', 'set-music', 'btn-reset-save', 'btn-export-save', 'btn-import-save', 'result-title', 'result-sub', 'result-info', 'result-reward',
 'toast', 'game-screen', 'lan', 'lan-ip', 'lan-room', 'lan-status', 'lan-chat-list', 'lan-chat-input', 'btn-lan-send', 'btn-lan-create', 'btn-lan-join', 'btn-lan-back',
 'guide', 'guide-icon', 'guide-title', 'guide-text', 'guide-dots', 'btn-guide-next', 'btn-guide-skip', 'btn-guide-action',
 'ranked', 'tournament', 'training', 'quests', 'settings', 'help', 'mech-select', 'hangar', 'shop', 'result', 'boss-select', 'boss-options', 'btn-boss-back',
 'login', 'ltab-login', 'ltab-register', 'login-user', 'login-pass', 'login-pass2', 'login-pass2-wrap', 'login-msg', 'btn-login-go', 'btn-login-skip', 'btn-logout', 'menu-user'].forEach(id => {
  elements[id] = new MockEl('div', id);
});
const canvas = new MockEl('canvas', 'game-canvas');
canvas.getContext = () => new Proxy({}, {
  get: (t, k) => {
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
    return typeof k === 'string' ? () => {} : undefined;
  }
});
elements['game-canvas'] = canvas;

global.document = {
  getElementById: (id) => elements[id] || null,
  querySelectorAll: (sel) => {
    /* data-mode 按钮 */
    if (sel === '[data-mode]') {
      return ['ranked', 'tournament', 'survival', 'training', 'duel'].map(m => {
        const b = new MockEl('button');
        b.dataset.mode = m;
        return b;
      });
    }
    if (sel.startsWith('#training-diffs')) {
      return ['dummy', 'easy', 'normal', 'hard'].map(d => {
        const b = new MockEl('button');
        b.dataset.diff = d;
        return b;
      });
    }
    if (sel.startsWith('#training-mechs')) {
      return ['tank', 'scout'].map(m => {
        const b = new MockEl('button');
        b.dataset.mech = m;
        return b;
      });
    }
    if (sel.startsWith('#settings .fx-opt') || sel.startsWith('#settings')) {
      return ['low', 'medium', 'high'].map(f => {
        const b = new MockEl('button');
        b.dataset.fx = f;
        return b;
      });
    }
    return [];
  },
  addEventListener() {},
  createElement: (tag) => new MockEl(tag)
};
global.window = {
  addEventListener() {},
  AudioContext: undefined,
  webkitAudioContext: undefined,
  __DSH__: undefined
};
global.requestAnimationFrame = () => 0;
global.performance = { now: () => Date.now() };
global.location = { reload() {} };
global.confirm = () => false;
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};

/* ---------- 按浏览器顺序加载全部脚本 ---------- */
const files = [
  'js/utils.js', 'js/config.js', 'js/account.js', 'js/progress.js', 'js/input.js', 'js/sfx.js',
  'js/bullet.js', 'js/drone.js', 'js/pickup.js', 'js/map.js', 'js/robot.js',
  'js/ai.js', 'js/game.js', 'js/net.js', 'js/survival.js', 'js/boss.js', 'js/music.js', 'js/ui.js', 'js/main.js'
];

let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ FAIL: ' + msg); failures++; }
}

try {
  let src = '';
  for (const f of files) {
    src += fs.readFileSync(path.join(root, f), 'utf8') + '\n;\n';
  }
  vm.runInThisContext(src, { filename: 'bundle-dom.js' });
  console.log('== DOM 冒烟：全部脚本加载执行无异常 ==');
  check(true, '脚本加载与初始化无异常');
} catch (e) {
  console.log('  ✗ FAIL: 加载异常 →', e.message);
  console.log(e.stack.split('\n').slice(0, 4).join('\n'));
  failures++;
  process.exit(1);
}

/* ---------- 模拟点击每个模式按钮 ---------- */
const modes = ['ranked', 'tournament', 'survival', 'training', 'duel'];
for (const m of modes) {
  try {
    const btn = document.createElement('button');
    btn.dataset.mode = m;
    /* 直接调用 UI 入口方法（等价于按钮点击） */
    if (m === 'ranked') UI.showRanked();
    else if (m === 'tournament') UI.showTournament();
    else if (m === 'survival') UI.showMechSelect({ mode: 'survival' });
    else if (m === 'training') UI.showTraining();
    else UI.showMechSelect({ mode: 'duel' });
    check(true, `${m} 入口正常`);
  } catch (e) {
    check(false, `${m} 入口异常: ${e.message}`);
  }
}

/* 排位/锦标赛/训练开始按钮（模拟点击 handler） */
try {
  UI.showRanked();
  const startBtn = elements['btn-ranked-start'];
  const fns = startBtn._listeners['click'] || [];
  for (const fn of fns) fn();
  check(true, '排位「开始排位」按钮可用');
} catch (e) {
  check(false, '排位按钮异常: ' + e.message);
}
try {
  UI.showTournament();
  const startBtn = elements['btn-tournament-start'];
  const fns = startBtn._listeners['click'] || [];
  for (const fn of fns) fn();
  check(true, '锦标赛「开始比赛」按钮可用');
} catch (e) {
  check(false, '锦标赛按钮异常: ' + e.message);
}
try {
  UI.showTraining();
  const startBtn = elements['btn-training-start'];
  const fns = startBtn._listeners['click'] || [];
  for (const fn of fns) fn();
  check(true, '训练场「开始训练」按钮可用');
} catch (e) {
  check(false, '训练场按钮异常: ' + e.message);
}

/* 任务中心 & 设置 */
try {
  UI.showQuests();
  UI.renderQuests();
  check(true, '任务中心渲染正常');
} catch (e) {
  check(false, '任务中心异常: ' + e.message);
}
try {
  UI.showSettings();
  check(true, '设置面板正常');
} catch (e) {
  check(false, '设置面板异常: ' + e.message);
}

/* 局域网界面 */
try {
  UI.showLan();
  check(true, '局域网对战界面正常');
} catch (e) {
  check(false, '局域网界面异常: ' + e.message);
}

/* 新手引导 */
try {
  Progress.data.guided = false;
  UI.maybeShowGuide();
  check(UI.guideStep === 0 && UI.el('guide-title').textContent.length > 0, '新手引导显示');
  UI.el('btn-guide-next')._listeners['click'][0]();
  check(UI.guideStep === 1, '引导下一步');
  UI.finishGuide();
  check(Progress.data.guided === true, '引导完成标记');
} catch (e) {
  check(false, '新手引导异常: ' + e.message);
}

/* 机库皮肤与徽章 */
try {
  UI.showHangar();
  UI.renderHangar();
  check(UI.el('hangar-medals') !== null, '机库徽章显示元素存在');
} catch (e) {
  check(false, '机库皮肤渲染异常: ' + e.message);
}

/* 回归：机库武器 select 用 change 事件（click 委托读到旧值导致"装备后战斗仍用原武器"） */
try {
  Progress.addCoins(99999);
  if (!Progress.hasWeapon('sonic')) Progress.buyWeapon('sonic');
  const sel = new MockEl('select', 'fake-h-select');
  sel.className = 'h-select';
  sel.dataset.id = 'tank';
  sel.dataset.slot = '0';
  sel.value = 'sonic';
  const box = UI.el('hangar-mechs');
  /* 触发 box 上绑定的 change 委托 */
  (box._listeners.change || []).forEach(fn => fn({ target: sel }));
  check(Progress.getLoadout('tank')[0] === 'sonic', '机库 select change 后存档武器已更新');
  /* 开战使用新武器 */
  const gHangar = new Game({ mode: 'single', p1Mech: 'tank', p2Mech: 'scout' });
  check(gHangar.robots[0].loadout[0] === 'sonic', '战斗使用机库装备的武器');
  /* 插件 select change */
  const psel = new MockEl('select', 'fake-h-plug');
  psel.className = 'h-select h-plug';
  psel.dataset.id = 'tank';
  psel.value = 'repair';
  (box._listeners.change || []).forEach(fn => fn({ target: psel }));
  check(Progress.mech('tank').plug === 'repair', '机库插件 select change 后已安装');
  /* 还原避免影响后续 */
  Progress.setLoadout('tank', 0, 'minigun');
  Progress.setPlug('tank', null);
} catch (e) {
  check(false, '机库 loadout 回归异常: ' + e.message);
}

/* Boss 选关 */
try {
  UI.showBossSelect();
  check(UI.el('boss-select').classList.contains('active'), 'Boss 选关界面正常');
  UI.showMechSelect({ mode: 'boss', bossType: 'frost' });
  check(true, '冰霜 Boss 选机入口正常');
} catch (e) {
  check(false, 'Boss 选关异常: ' + e.message);
}

/* Boss 战入口 + 档案 */
try {
  UI.showMechSelect({ mode: 'boss' });
  check(true, 'Boss 战选机入口正常');
} catch (e) {
  check(false, 'Boss 战入口异常: ' + e.message);
}
try {
  UI.showProfile();
  UI.renderProfile();
  check(true, '战绩档案渲染正常');
} catch (e) {
  check(false, '档案页异常: ' + e.message);
}

/* 本地双人（duel）不获得奖励 */
try {
  const coinsD = Progress.coins();
  const gamesD = Progress.data.stats.gamesPlayed;
  const gDuel = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'scout' });
  gDuel.state = 'playing';
  gDuel.robots[0].hp = 0;
  gDuel.robots[0].die(gDuel, gDuel.robots[1]);
  gDuel.winner = gDuel.robots[1];
  UI.lastCfg = { mode: 'duel' };
  UI.showResult(gDuel);
  check(Progress.coins() === coinsD, '双人对战不获得金币');
  check(Progress.data.stats.gamesPlayed === gamesD, '双人对战不计入总场次');
  const rewardText = UI.el('result-reward').innerHTML || '';
  check(rewardText.indexOf('娱乐对战') >= 0, '双人结算显示娱乐提示');
  /* 对照：普通单人战斗仍发奖励 */
  const coinsS = Progress.coins();
  const gSingle = new Game({ mode: 'single', p1Mech: 'tank', p2Mech: 'scout' });
  gSingle.state = 'playing';
  gSingle.robots[1].hp = 0;
  gSingle.robots[1].die(gSingle, gSingle.robots[0]);
  gSingle.winner = gSingle.robots[0];
  UI.lastCfg = { mode: 'single' };
  UI.showResult(gSingle);
  check(Progress.coins() > coinsS, '单人战斗仍获得金币奖励');
} catch (e) {
  check(false, '双人无奖励异常: ' + e.message);
}

/* 用户登录系统 */
try {
  /* 未登录时启动门显示登录屏 */
  Account.logout();
  UI.showLogin();
  check(UI.el('login').classList.contains('active'), '未登录时显示登录屏');
  /* 注册新账号 */
  UI.el('login-user').value = '测试玩家';
  UI.el('login-pass').value = 'pass123';
  UI.el('login-pass2').value = 'pass123';
  UI._loginMode = 'register';
  UI._doLoginSubmit();
  check(Account.isLoggedIn() && Account.current() === '测试玩家', '注册后自动登录');
  check(Progress.KEY.indexOf('测试玩家') >= 0, '存档 key 按用户隔离');
  /* 给账号攒点金币，退出后 guest 不受影响 */
  Progress.addCoins(777);
  const savedCoins = Progress.coins();
  /* 退出登录 */
  Account.logout();
  Progress.load();
  UI.showLogin();
  check(!Account.isLoggedIn(), '退出后未登录');
  check(Progress.coins() !== savedCoins || Progress.KEY.indexOf('guest') >= 0, '退出后切回 guest 存档');
  /* 错误密码 */
  Account.logout();
  const bad = Account.login('测试玩家', 'wrong');
  check(bad.ok === false, '错误密码登录被拒');
  /* 正确密码重新登录（走 UI 完整流程，含存档重载） */
  UI.el('login-user').value = '测试玩家';
  UI.el('login-pass').value = 'pass123';
  UI._loginMode = 'login';
  UI._doLoginSubmit();
  check(Account.isLoggedIn() && Account.current() === '测试玩家', '正确密码登录成功');
  check(Progress.coins() === savedCoins, '重新登录后恢复该账号金币');
  /* 清理测试账号，避免影响其他用例（直接清 session） */
  Account.logout();
} catch (e) {
  check(false, '登录系统异常: ' + e.message);
}

console.log(failures === 0 ? '\n✅ DOM 冒烟通过' : `\n❌ ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
