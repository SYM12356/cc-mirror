'use strict';
/* ============================================================
 * 键盘输入：支持双人（P1 / P2）+ AI（不占用键盘）
 * 边沿触发：pressed(p, action) 只在按键按下瞬间返回 true
 * ============================================================ */

const Input = {
  down: new Set(),        // 当前按住的键
  justPressed: new Set(), // 本帧按下的键（帧末清空）

  BINDINGS: {
    /* 紧凑键盘友好：P2 动作键全部贴近方向键（右Shift// / . / ,） */
    p1: {
      up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
      fire: 'KeyJ', sub: 'KeyK', skill: 'KeyL', swap: 'KeyQ', ulti: 'Space'
    },
    p2: {
      up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
      fire: 'ShiftRight', sub: 'Slash', skill: 'Period', swap: null, ulti: 'Comma'
    }
  },

  /* 动作的显示名（设置面板用） */
  ACTION_NAMES: {
    up: '上移', down: '下移', left: '左移', right: '右移',
    fire: '开火', sub: '切换武器', skill: '技能', swap: '快速切枪', ulti: '必杀技'
  },

  /* 从存档加载自定义键位（覆盖默认） */
  loadBindings() {
    const kb = (typeof Progress !== 'undefined' && Progress.settings && Progress.settings.keybinds) || {};
    for (const player of ['p1', 'p2']) {
      const saved = kb[player] || {};
      for (const action of Object.keys(this.BINDINGS[player])) {
        if (saved[action] !== undefined) this.BINDINGS[player][action] = saved[action];
      }
    }
  },

  /* 重绑定单个动作；返回 {ok, error}（冲突检测） */
  setBinding(player, action, code) {
    if (!code) return { ok: false, error: '无效按键' };
    /* 冲突检测：该键是否已被同玩家其他动作占用 */
    const other = Object.keys(this.BINDINGS[player]).find(a => a !== action && this.BINDINGS[player][a] === code);
    if (other) return { ok: false, error: `与「${this.ACTION_NAMES[other] || other}」冲突` };
    this.BINDINGS[player][action] = code;
    /* 持久化 */
    if (typeof Progress !== 'undefined') {
      if (!Progress.settings.keybinds) Progress.settings.keybinds = {};
      if (!Progress.settings.keybinds[player]) Progress.settings.keybinds[player] = {};
      Progress.settings.keybinds[player][action] = code;
      Progress.save();
    }
    return { ok: true };
  },

  /* 重置某玩家键位为默认 */
  resetBindings(player) {
    const def = {
      p1: {
        up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
        fire: 'KeyJ', sub: 'KeyK', skill: 'KeyL', swap: 'KeyQ', ulti: 'Space'
      },
      p2: {
        up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
        fire: 'ShiftRight', sub: 'Slash', skill: 'Period', swap: null, ulti: 'Comma'
      }
    };
    this.BINDINGS[player] = Object.assign({}, def[player]);
    if (typeof Progress !== 'undefined') {
      if (!Progress.settings.keybinds) Progress.settings.keybinds = {};
      delete Progress.settings.keybinds[player];
      Progress.save();
    }
  },

  init() {
    this.loadBindings();
    window.addEventListener('keydown', (e) => {
      /* 输入框/文本域内不拦截按键（聊天输入） */
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.repeat) return;
      if (!this.down.has(e.code)) this.justPressed.add(e.code);
      this.down.add(e.code);
      // 防止方向键/空格滚动页面
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.justPressed.clear();
    });
  },

  isDown(player, action) {
    const code = this.BINDINGS[player][action];
    return code ? this.down.has(code) : false;
  },

  pressed(player, action) {
    const code = this.BINDINGS[player][action];
    return code ? this.justPressed.has(code) : false;
  },

  /* 玩家动作是否激活（键盘 或 触控按钮） */
  isActive(player, action) {
    return this.isDown(player, action) || (player === 'p1' && this._touchDown(action));
  },

  /* 触控按钮按下瞬间（帧内边沿） */
  touchPressedActions: new Set(),
  _noteTouchPress(action) { this.touchPressedActions.add(action); },
  pressedActive(player, action) {
    if (player === 'p1' && this.touchPressedActions.has(action)) return true;
    return this.pressed(player, action);
  },

  /* 移动轴，返回 {x, y}（归一化由调用方处理） */
  axis(player) {
    /* 触控摇杆优先（移动端） */
    if (this.touchAxis && (this.touchAxis.x !== 0 || this.touchAxis.y !== 0)) {
      return { x: this.touchAxis.x, y: this.touchAxis.y };
    }
    let x = 0, y = 0;
    if (this.isDown(player, 'left')) x -= 1;
    if (this.isDown(player, 'right')) x += 1;
    if (this.isDown(player, 'up')) y -= 1;
    if (this.isDown(player, 'down')) y += 1;
    return { x, y };
  },

  /* 触控输入注入（移动端）：摇杆轴 + 虚拟按键 */
  touchAxis: { x: 0, y: 0 },
  touchButtons: new Set(),   // 触控按下的动作名

  setTouchAxis(x, y) {
    /* 归一化到 [-1,1]，死区 0.15 */
    const m = Math.hypot(x, y);
    if (m < 0.15) { this.touchAxis.x = 0; this.touchAxis.y = 0; return; }
    this.touchAxis.x = x / m;
    this.touchAxis.y = y / m;
  },

  clearTouchAxis() { this.touchAxis.x = 0; this.touchAxis.y = 0; },

  setTouchButton(action, down) {
    if (down) this.touchButtons.add(action);
    else this.touchButtons.delete(action);
  },

  /* 触控下动作视为按住（供 isDown） */
  _touchDown(action) { return this.touchButtons.has(action); },

  endFrame() {
    this.justPressed.clear();
    this.touchPressedActions.clear();
  }
};
