'use strict';
/* ============================================================
 * 账号系统：注册 / 登录 / 退出（密码 SHA-256 加盐哈希，零依赖）
 * - 用户表存 localStorage（key: mechArena_users）
 * - 会话存 sessionStorage（key: mechArena_session，刷新保持登录）
 * - 每个账号独立存档 key：mechArenaSave_v1_<用户名>
 * ============================================================ */

/* 纯 JS SHA-256（UTF-8 安全，浏览器/Node 通用） */
const SHA256 = (function () {
  function utf8(s) {
    return unescape(encodeURIComponent(s));
  }
  function sha256(ascii) {
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    const maxWord = Math.pow(2, 32);
    let result = '';
    const words = [];
    const asciiBitLength = ascii.length * 8;
    let hash = (sha256.h = sha256.h || []);
    const k = (sha256.k = sha256.k || []);
    let primeCounter = k.length;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (let i = 0; i < ascii.length; i++) {
      const j = ascii.charCodeAt(i);
      if (j >> 8) return;   // 必须已 UTF-8 编码
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, (j += 16));
      const oldHash = hash.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ (~e & hash[6]))
          + k[i]
          + (w[i] = i < 16 ? w[i] : (
              w[i - 16]
              + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
              + w[i - 7]
              + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
            ) | 0);
        const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (let i = 0; i < 8; i++) {
      for (let j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? 0 : '') + b.toString(16);
      }
    }
    return result;
  }
  return (s) => sha256(utf8(s));
})();

const Account = {
  USERS_KEY: 'mechArena_users',
  SESSION_KEY: 'mechArena_session',

  /* localStorage 不可用（隐私模式/测试）→ 内存 */
  _mem: { users: null, session: null },
  _ls() {
    try { return window.localStorage; } catch (e) { return null; }
  },
  _ss() {
    try { return window.sessionStorage; } catch (e) { return null; }
  },

  /* ---------- 用户表 ---------- */
  users() {
    const ls = this._ls();
    if (ls) {
      try { return JSON.parse(ls.getItem(this.USERS_KEY)) || {}; } catch (e) { return {}; }
    }
    return this._mem.users || {};
  },
  _saveUsers(u) {
    const ls = this._ls();
    if (ls) { try { ls.setItem(this.USERS_KEY, JSON.stringify(u)); } catch (e) {} }
    this._mem.users = u;
  },

  /* ---------- 密码哈希（加盐） ---------- */
  hashPassword(pw, salt) {
    return SHA256(salt + '::' + pw);
  },
  _salt() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  },

  /* ---------- 会话 ---------- */
  current() {
    const ss = this._ss();
    if (ss) { try { return ss.getItem(this.SESSION_KEY); } catch (e) { return null; } }
    return this._mem.session || null;
  },
  _setSession(user) {
    const ss = this._ss();
    if (ss) { try { ss.setItem(this.SESSION_KEY, user); } catch (e) {} }
    this._mem.session = user;
  },

  isLoggedIn() { return !!this.current(); },

  /* ---------- 注册 ---------- */
  register(user, pw) {
    const name = String(user || '').trim();
    const pass = String(pw || '');
    if (name.length < 2 || name.length > 16) return { ok: false, error: '用户名需 2~16 个字符' };
    if (!/^[\w\u4e00-\u9fa5-]+$/.test(name)) return { ok: false, error: '用户名只能含中文/字母/数字/下划线' };
    if (pass.length < 4) return { ok: false, error: '密码至少 4 位' };
    if (pass.length > 32) return { ok: false, error: '密码最多 32 位' };
    const users = this.users();
    if (users[name]) return { ok: false, error: '用户名已存在，请直接登录' };
    const salt = this._salt();
    users[name] = { salt, hash: this.hashPassword(pass, salt), createdAt: Date.now() };
    this._saveUsers(users);
    this._setSession(name);
    return { ok: true, user: name };
  },

  /* ---------- 登录 ---------- */
  login(user, pw) {
    const name = String(user || '').trim();
    const pass = String(pw || '');
    const users = this.users();
    const rec = users[name];
    if (!rec) return { ok: false, error: '用户不存在，请先注册' };
    if (this.hashPassword(pass, rec.salt) !== rec.hash) return { ok: false, error: '密码错误' };
    this._setSession(name);
    return { ok: true, user: name };
  },

  /* ---------- 退出 ---------- */
  logout() {
    this._setSession('');
  },

  /* ---------- 账号存档 key ---------- */
  saveKey(user) {
    return 'mechArenaSave_v1_' + (user || 'guest');
  }
};
