'use strict';
/* ============================================================
 * 局域网联机：WebSocket 客户端 + 房主快照同步 + 客户端渲染视图
 * 协议：房主权威——房主完整模拟，客户端上传输入、接收状态快照
 * ============================================================ */

const Net = {
  ws: null,
  role: null,          // 'host' | 'guest'
  roomId: null,
  connected: false,
  onEvent: null,       // 消息分发回调（UI 设置）

  connect(url) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        reject(new Error('连接地址无效'));
        return;
      }
      this.ws.onopen = () => {
        this.connected = true;
        resolve();
      };
      this.ws.onerror = () => {
        if (!this.connected) reject(new Error('无法连接（检查 IP 与端口，双方需在同一网络）'));
      };
      /* 连接超时兜底（握手无响应不无限等待） */
      setTimeout(() => {
        if (!this.connected) {
          try { this.ws.close(); } catch (e) { /* ignore */ }
          reject(new Error('连接超时'));
        }
      }, 5000);
      this.ws.onclose = () => {
        this.connected = false;
        if (this.onEvent) this.onEvent({ type: 'conn-closed' });
      };
      this.ws.onmessage = (e) => {
        let data;
        try { data = JSON.parse(e.data); } catch (err) { return; }
        if (this.onEvent) this.onEvent(data);
      };
    });
  },

  send(obj) {
    if (this.ws && this.connected) {
      try { this.ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ }
    }
  },

  close() {
    try { if (this.ws) this.ws.close(); } catch (e) { /* ignore */ }
    this.ws = null;
    this.connected = false;
  },

  wsUrl(ip, port) {
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    return proto + ip + ':' + (port || location.port || 3000);
  }
};

/* ============================================================
 * 客户端渲染视图：接收房主快照，纯渲染 + 上传输入
 * ============================================================ */

class NetView {
  constructor(init) {
    this.map = GameMap;
    this.map.theme = init.theme || GameMap.THEMES.factory;
    this.map.obstacles = init.obstacles || [];
    this.map.decorations = [];

    /* 客户端视角：我是 P2，对手是 P1 */
    this.me = this.makeGhost(init.p2Mech, init.loadout2, init.plug2, '你');
    this.op = this.makeGhost(init.p1Mech, init.loadout1, init.plug1, '对手');

    this.bullets = [];
    this.pickups = [];
    this.state = 'countdown';
    this.countdown = 3.6;
    this.time = 0;
    this.resultShown = false;
    this.muzzleAcc = 0;
    this.spectator = !!init.spectator;   // 观战模式不发送输入
  }

  makeGhost(mechId, loadout, plug, name) {
    return new Robot(mechId, 'p2', {
      x: 0, y: 0,
      name,
      loadout: loadout || ['minigun', 'grenade'],
      plug: plug || null,
      level: Progress.mech(mechId).level,
      skin: Progress.skinFor(mechId)
    });
  }

  /* ---------- 应用快照 ---------- */
  applyState(s) {
    this.applyRobot(this.me, s.op);     // 自己的状态（服务器 P2）
    this.applyRobot(this.op, s.me);     // 对手状态（服务器 P1）

    this.bullets = (Array.isArray(s.bullets) ? s.bullets : []).filter(b => b && typeof b === 'object').map(b => ({
      x: b.x || 0, y: b.y || 0, vx: b.vx || 0, vy: b.vy || 0,
      size: b.size || 3, color: b.color || '#fff', tracer: !!b.tracer
    }));
    this.pickups = (Array.isArray(s.pickups) ? s.pickups : []).filter(p => p && typeof p === 'object' && CFG.PICKUPS[p.type]).map(p => {
      const pk = new Pickup(p.type, p.x || 0, p.y || 0);
      pk.spawnT = 0;
      return pk;
    });
    this.countdown = s.countdown;
    this.state = s.state;
    this.time = s.time;
  }

  applyRobot(r, snap) {
    if (!snap) return;
    const prevHp = r.hp;
    const wasDead = r.dead;

    r.x = snap.x; r.y = snap.y;
    r.vx = snap.vx || 0; r.vy = snap.vy || 0;
    r.aim = snap.aim || 0;
    r.hp = snap.hp; r.maxHp = snap.maxHp;
    r.slotIndex = snap.slotIndex || 0;
    if (snap.loadout) r.loadout = snap.loadout;
    r.subAmmo = snap.subAmmo || 0; r.subAmmoMax = snap.subAmmoMax || 0;
    r.ulti = snap.ulti || 0; r.ultiMax = snap.ultiMax || 100;
    r.skillCool = snap.skillCool || 0; r.skillActive = snap.skillActive || 0;
    r.stunT = snap.stunT || 0; r.slowT = snap.slowT || 0; r.dotT = snap.dotT || 0;
    r.heat = snap.heat || 0; r.overheated = !!snap.overheated;
    r.invulnT = snap.invulnT || 0; r.chargingNuke = snap.chargingNuke || 0;
    r.shieldCharge = snap.shieldCharge; r.boostT = snap.boostT;
    r.ultiActive = snap.ultiActive; r.scoutDashLeft = snap.scoutDashLeft;
    r.dead = snap.dead;

    /* 受击反馈 */
    if (prevHp > snap.hp && !snap.dead && snap.hp > 0) {
      Particles.spawn(snap.x, snap.y, { count: 8, colors: [r.color, '#fff', '#ff8787'], speed: 170, life: 0.35, size: 3 });
      if (r === this.me) ScreenFX.hurt();
      SFX.robotHit();
    }
    /* 死亡反馈 */
    if (snap.dead && !wasDead) {
      Particles.spawn(snap.x, snap.y, { count: 46, colors: [r.color, '#ffd166', '#ff6b6b', '#fff'], speed: 380, life: 1.0, size: 5, gravity: 200 });
      Shockwaves.add(snap.x, snap.y, 90, 'rgba(255,200,120,1)');
      SFX.explode(true);
      if (r === this.op) {
        KillFeed.add('KILL!', null, '#ffd43b');
        ScreenFX.flash('rgba(255,235,190,0.5)', 0.5);
      } else {
        KillFeed.add('DEFEATED', null, '#ff6b6b');
        ScreenFX.hurt();
      }
    }
  }

  /* ---------- 输入采样上传 ---------- */
  update(dt) {
    if (!this.spectator) {
      this.sendInput();
    }
    /* 本地环绕无人机（子弹由房主端同步） */
    const orbit = (owner, drone) => {
      if (!drone || drone.dead || owner.dead) return;
      drone.angle += dt * 1.7;
      const rad = owner.radius + 28 + Math.sin(drone.angle * 2) * 6;
      drone.x = owner.x + Math.cos(drone.angle) * rad;
      drone.y = owner.y + Math.sin(drone.angle) * rad;
    };
    orbit(this.me, this.me.drone);
    orbit(this.op, this.op.drone);
    FX.update(dt);
  }

  sendInput() {
    const ax = Input.axis('p1');
    const m = Math.hypot(ax.x, ax.y);
    const inp = {
      mx: m > 0.01 ? ax.x / m : 0,
      my: m > 0.01 ? ax.y / m : 0,
      fire: Input.isActive('p1', 'fire'),
      sub: Input.pressedActive('p1', 'sub') || Input.pressedActive('p1', 'swap'),
      skill: Input.pressedActive('p1', 'skill'),
      ulti: Input.pressedActive('p1', 'ulti')
    };
    Net.send({ type: 'input', data: inp });

    /* 本地开火反馈（对手位置在快照中） */
    if (inp.fire && this.me && !this.me.dead) {
      this.muzzleAcc += 0.016;
      if (this.muzzleAcc > 0.06) {
        this.muzzleAcc = 0;
        const w = this.me.currentWeapon();
        const mx = this.me.x + Math.cos(this.me.aim) * (this.me.radius + 12);
        const my = this.me.y + Math.sin(this.me.aim) * (this.me.radius + 12);
        Particles.spawn(mx, my, { count: 2, angle: this.me.aim, spread: 0.15, speed: 180, life: 0.15, size: 2.5, colors: [w ? w.color : '#fff', '#fff'], shape: 'spark' });
      }
    }
  }

  /* ---------- 渲染 ---------- */
  render(ctx, t) {
    this.map.draw(ctx);

    /* 子弹（简单发光绘制） */
    for (const b of this.bullets) {
      if (b.tracer) {
        const a = Math.atan2(b.vy, b.vx);
        const g = ctx.createLinearGradient(b.x, b.y, b.x - Math.cos(a) * 260, b.y - Math.sin(a) * 260);
        g.addColorStop(0, 'rgba(235,225,255,0.8)');
        g.addColorStop(1, 'rgba(235,225,255,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - Math.cos(a) * 260, b.y - Math.sin(a) * 260);
        ctx.stroke();
      }
      ctx.save();
      ctx.shadowColor = b.color;
      ctx.shadowBlur = FXQuality.shadow ? 10 : 0;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const p of this.pickups) p.draw(ctx);
    if (this.me.drone && !this.me.dead) this.me.drone.draw(ctx);
    if (this.op.drone && !this.op.dead) this.op.drone.draw(ctx);
    if (!this.me.dead) this.me.draw(ctx, t);
    if (!this.op.dead) this.op.draw(ctx, t);
    FX.draw(ctx);

    UI.drawLanHUD(this, ctx, t);
  }
}

/* ============================================================
 * 房主端：Game 的联机扩展（网络输入 + 快照广播）
 * ============================================================ */

const NetHost = {
  /* 应用到 Game：在 Game 构造时调用 */
  attach(game) {
    game.netHost = true;
    game.netInput = null;
    game.netTimer = 0;
    game.netEvent = null;
    return game;
  },

  /* 每帧：读取网络输入（P2 由客户端控制） */
  readNetPlayer(game) {
    const r = game.robots[1];
    const inp = game.netInput;
    if (!inp) {
      r.moveX = 0; r.moveY = 0; r.fireHeld = false;
      return;
    }
    r.moveX = inp.mx;
    r.moveY = inp.my;
    r.fireHeld = !!inp.fire;
    if (inp.sub) r.switchSlot();
    if (inp.skill) r.useSkill(game);
    if (inp.ulti) r.useUltimate(game);
    /* 自动瞄准房主玩家 */
    const t = game.robots[0];
    if (t && !t.dead) r.aimOverride = U.angleTo(r.x, r.y, t.x, t.y);
  },

  /* 20Hz 状态快照广播 */
  tick(game, dt) {
    game.netTimer -= dt;
    if (game.netTimer > 0) return;
    game.netTimer = 0.05;
    Net.send({ type: 'state', ...this.snapshot(game) });
  },

  snapshot(game) {
    const snap = (r) => ({
      x: r.x, y: r.y, vx: r.vx, vy: r.vy, aim: r.aim,
      hp: Math.round(r.hp * 10) / 10, maxHp: r.maxHp,
      name: r.name, color: r.color, darkColor: r.darkColor,
      slotIndex: r.slotIndex, loadout: r.loadout,
      subAmmo: Math.ceil(r.subAmmo), subAmmoMax: r.subAmmoMax,
      ulti: Math.round(r.ulti), ultiMax: r.ultiMax,
      skillCool: r.skillCool, skillActive: r.skillActive,
      stunT: r.stunT, slowT: r.slowT, dotT: r.dotT,
      heat: r.heat, overheated: r.overheated,
      invulnT: r.invulnT, chargingNuke: r.chargingNuke,
      shieldCharge: r.shieldCharge, boostT: r.boostT,
      ultiActive: r.ultiActive, scoutDashLeft: r.scoutDashLeft,
      dead: r.dead
    });
    return {
      me: snap(game.robots[0]),
      op: snap(game.robots[1]),
      bullets: game.bullets.filter(b => !b.dead).map(b => ({
        x: b.x, y: b.y, vx: b.vx, vy: b.vy,
        size: b.size, color: b.color, tracer: b.tracer
      })),
      pickups: game.pickups.map(p => ({ x: p.x, y: p.y, type: p.type })),
      countdown: game.countdown,
      state: game.state,
      time: game.time
    };
  }
};
