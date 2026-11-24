'use strict';
/* ============================================================
 * 游戏主类：状态机 / 输入 / 碰撞 / 道具 / 渲染
 * mode: 'single'（玩家 vs AI） | 'duel'（本地双人）
 * ============================================================ */

class Game {
  constructor(cfg) {
    this.mode = cfg.mode;                    // 'single' | 'duel'
    this.p1Mech = cfg.p1Mech;
    this.p2Mech = cfg.p2Mech;                // 双人时玩家2 / 单人时 AI 机甲
    this.aiDifficulty = cfg.aiDifficulty || 'normal';

    this.map = GameMap;
    this.map.generate();

    this.robots = [];
    this.bullets = [];
    this.pickups = [];
    this.burnZones = [];      // 燃烧地带（napalm）
    this.heavenFalls = [];    // 天罚导弹落点（artillery 大招）
    this.lightnings = [];     // 雷暴闪电（绘制用）
    this.weather = null;      // 动态天气事件
    this.weatherTimer = U.rand(26, 42);

    this.state = 'countdown';
    this.countdown = 3.6;
    this.time = 0;
    this.winner = null;
    this.overT = 0;
    this.shakeT = 0;
    this.slowmoT = 0;
    this.pickupTimer = 1.5;
    this.ai = null;

    /* 出生：玩家底盘使用养成加成 + 自由配置的武器（按槽位）+ 插件；AI 随机 */
    const p1 = new Robot(this.p1Mech, 'p1', {
      x: 170, y: this.map.H / 2,
      name: this.mode === 'single' ? '你' : '玩家1',
      bonus: Progress.bonuses(this.p1Mech),
      level: Progress.mech(this.p1Mech).level,
      loadout: cfg.loadout1 || Progress.getLoadout(this.p1Mech),
      plug: cfg.plug1 !== undefined ? cfg.plug1 : Progress.mech(this.p1Mech).plug,
      skin: Progress.skinFor(this.p1Mech)
    });
    /* AI 武器按强度加权抽取（机枪/激光/霰弹权重高，减少废组合方差） */
    const WEAPON_POOL = ['minigun', 'laser', 'shotgun', 'minigun', 'laser', 'grenade', 'frost', 'sniper', 'missile', 'plasma', 'sonic', 'needle', 'flame', 'tesla', 'napalm', 'saw', 'rail'];
    const aiLoadout = () => CFG.MECHS[this.p2Mech].slots.map(() => U.pick(WEAPON_POOL));
    const p2 = new Robot(this.p2Mech, this.mode === 'single' ? 'ai' : 'p2', {
      x: this.map.W - 170, y: this.map.H / 2,
      name: this.mode === 'single' ? 'AI 对手' : (this.mode === 'lan' ? '对手' : '玩家2'),
      loadout: this.mode === 'single'
        ? aiLoadout()
        : (cfg.loadout2 || Progress.getLoadout(this.p2Mech)),
      plug: this.mode === 'single'
        ? (Math.random() < 0.6 ? U.pick(Object.keys(CFG.PLUGINS)) : null)
        : (cfg.plug2 !== undefined ? cfg.plug2 : Progress.mech(this.p2Mech).plug)
    });
    this.robots = [p1, p2];

    /* 倒计时期间无敌 */
    for (const r of this.robots) r.invulnT = this.countdown + 0.3;

    if (this.mode === 'single' && cfg.aiEnabled !== false) {
      this.ai = new AI(p2, this, this.aiDifficulty);
    }

    /* 局域网联机：房主权威模式（关闭天气，避免客户端无视觉提示的伤害） */
    if (cfg.netRole === 'host') {
      NetHost.attach(this);
      this.weatherTimer = Infinity;
    }

    SFX.count();
  }

  enemyOf(robot) {
    return this.robots.find(r => r !== robot);
  }

  /* ---------- 生成子弹 ---------- */
  spawnBullet(owner, angle, w) {
    this.bullets.push(Combat.makeBullet(owner, angle, w));
  }

  /* ---------- 范围伤害（导弹/等离子/湮灭炮） ---------- */
  areaDamage(x, y, radius, dmg, from, knock, excludeSelf = true) {
    for (const r of this.robots) {
      if (r.dead) continue;
      if (from === r && excludeSelf) continue;
      const d = U.dist(x, y, r.x, r.y);
      if (d <= radius + r.radius) {
        const angle = U.angleTo(r.x, r.y, x, y);
        const falloff = 1 - U.clamp(d / (radius + r.radius), 0, 1) * 0.35;
        r.takeDamage(dmg * falloff, angle, knock, this, from);
        if (from && from !== r) from.addUlti(U.clamp(dmg * 0.35, 2, 12));
      }
    }
  }

  /* ---------- EMP 眩晕 ---------- */
  empStun(from, radius, dur) {
    const t = this.enemyOf(from);
    if (t && !t.dead) {
      const d = U.dist(from.x, from.y, t.x, t.y);
      if (d <= radius + t.radius) {
        t.stunT = Math.max(t.stunT, dur);
        Floaters.add(t.x, t.y - t.radius - 14, 'EMP!', '#b197fc', 16);
      }
    }
  }

  /* ---------- 机器人死亡 ---------- */
  onRobotDeath(robot) {
    this.slowmoT = 0.55;
    this.shake(14);
    const other = this.enemyOf(robot);
    if (other && other.dead) {
      this.winner = null;               // 同归于尽
    } else {
      this.winner = other;
    }
    /* 延迟结算，让爆炸演出播完 */
    this.overT = 1.6;
    this.state = 'over';
  }

  shake(n) {
    if (Progress.settings && Progress.settings.screenShake === false) return;
    this.shakeT = Math.max(this.shakeT, n);
  }

  /* ---------- 玩家输入 ---------- */
  readPlayer(r, key) {
    const ax = Input.axis(key);
    const m = Math.hypot(ax.x, ax.y);
    r.moveX = m > 0.01 ? ax.x / m : 0;
    r.moveY = m > 0.01 ? ax.y / m : 0;

    /* 自动瞄准最近的敌方机器人 */
    const t = this.enemyOf(r);
    if (t && !t.dead) {
      r.aimOverride = U.angleTo(r.x, r.y, t.x, t.y);
    }

    r.fireHeld = (key === 'p1') ? Input.isActive(key, 'fire') : Input.isDown(key, 'fire');
    if ((key === 'p1') ? Input.pressedActive(key, 'sub') : Input.pressed(key, 'sub')) r.switchSlot();
    if ((key === 'p1') ? Input.pressedActive(key, 'swap') : Input.pressed(key, 'swap')) r.switchSlot();
    if ((key === 'p1') ? Input.pressedActive(key, 'skill') : Input.pressed(key, 'skill')) r.useSkill(this);
    if ((key === 'p1') ? Input.pressedActive(key, 'ulti') : Input.pressed(key, 'ulti')) r.useUltimate(this);
  }

  readInput() {
    /* 局域网房主：P1 本地、P2 网络输入 + 快照广播 */
    if (this.netHost) {
      this.readPlayer(this.robots[0], 'p1');
      NetHost.readNetPlayer(this);
      NetHost.tick(this, this.lastDt || 1 / 60);
      return;
    }
    this.readPlayer(this.robots[0], 'p1');
    if (this.mode === 'duel') {
      this.readPlayer(this.robots[1], 'p2');
    } else if (this.ai) {
      this.ai.update(this.lastDt || 1 / 60);
    }
  }

  /* ---------- 碰撞 ---------- */
  collideBullets() {
    for (const b of this.bullets) {
      if (b.dead) continue;
      for (const r of this.robots) {
        if (r.dead || r === b.owner) continue;

        /* 子弹可击毁敌方的攻击无人机 */
        if (r.drone && !r.drone.dead && U.circleCircleHit(b.x, b.y, b.size, r.drone.x, r.drone.y, r.drone.radius)) {
          r.drone.takeDamage(b.dmg);
          b.dead = true;
          break;
        }

        if (U.circleCircleHit(b.x, b.y, b.size, r.x, r.y, r.radius)) {
          if (b.aoe) {
            b.explode(this);
          } else {
            const angle = b.angle;
            r.takeDamage(b.dmg, angle, b.knock, this, b.owner);
            if (b.owner) b.owner.addUlti(U.clamp(b.dmg * 0.5, 4, 20));   // 按伤害充能
            if (b.slow) r.applyStatus(b.slow, b.slowDur);
            if (b.dot) r.applyStatus(null, null, b.dot);
            if (b.pierce > 0) {
              b.pierce--;
            } else {
              Particles.spawn(b.x, b.y, { count: 6, colors: [b.color, '#fff'], speed: 150, life: 0.3, size: 3 });
              b.dead = true;
            }
          }
          break;
        }
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  collideRobots() {
    const [a, b] = this.robots;
    if (a.dead || b.dead) return;
    if (U.circleCircleHit(a.x, a.y, a.radius, b.x, b.y, b.radius)) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const overlap = (a.radius + b.radius - d) / 2;
      const nx = dx / d, ny = dy / d;
      a.x -= nx * overlap; a.y -= ny * overlap;
      b.x += nx * overlap; b.y += ny * overlap;
      /* 弹性碰撞速度交换分量 */
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel > 0) {
        const imp = rel * 0.4;
        a.vx -= nx * imp; a.vy -= ny * imp;
        b.vx += nx * imp; b.vy += ny * imp;
      }
    }
  }

  /* ---------- 道具 ---------- */
  updatePickups(dt) {
    /* 刷新 */
    this.pickupTimer -= dt;
    if (this.state === 'playing' && this.pickupTimer <= 0) {
      this.pickupTimer = CFG.PICKUP_SPAWN_INTERVAL;
      if (this.pickups.length < CFG.PICKUP_MAX_ON_FIELD) {
        let ok = false, px = 0, py = 0;
        for (let i = 0; i < 30 && !ok; i++) {
          const p = this.map.randomSpawnPoint();
          px = p.x; py = p.y;
          ok = true;
          for (const r of this.robots) {
            if (U.dist2(px, py, r.x, r.y) < 130 * 130) { ok = false; break; }
          }
        }
        if (ok) {
          const type = this.rollPickup();
          this.pickups.push(new Pickup(type, px, py));
        }
      }
    }

    /* 拾取 & 生命周期 */
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.update(dt);
      if (p.dead) { this.pickups.splice(i, 1); continue; }
      if (p.spawnT <= 0) {
        for (const r of this.robots) {
          if (r.dead) continue;
          if (U.dist2(p.x, p.y, r.x, r.y) <= (r.radius + p.r + 3) ** 2) {
            p.apply(r);
            p.dead = true;
            break;
          }
        }
      }
    }
    this.pickups = this.pickups.filter(p => !p.dead);
  }

  rollPickup() {
    const total = Object.values(CFG.PICKUPS).reduce((s, c) => s + c.weight, 0);
    let roll = Math.random() * total;
    for (const [key, c] of Object.entries(CFG.PICKUPS)) {
      roll -= c.weight;
      if (roll <= 0) return key;
    }
    return 'health';
  }

  /* ---------- 燃烧地带（燃烧榴弹） ---------- */
  addBurnZone(x, y, r, dps, dur, owner) {
    this.burnZones.push({ x, y, r, dps, dur, maxDur: dur, owner, tick: 0 });
    Particles.spawn(x, y, { count: 16, colors: ['#ff922b', '#ffd43b'], speed: 160, life: 0.5, size: 4, gravity: 60 });
    Shockwaves.add(x, y, r, 'rgba(255,150,60,0.8)');
  }

  updateBurnZones(dt) {
    Combat.tickBurnZones(this, dt, () => this.robots);
  }

  drawBurnZones(ctx) {
    Combat.drawBurnZones(ctx, this.burnZones);
  }

  /* ---------- 天罚导弹（烈焰大招） ---------- */
  updateHeavenFalls(dt) {
    const artillery = this.robots.find(r => r.mech.id === 'artillery') || this.robots[0];
    Combat.tickHeavenFalls(this, dt, artillery, 30, 70);
  }

  drawHeavenFalls(ctx) {
    Combat.drawHeavenFalls(ctx, this.heavenFalls);
  }

  /* ---------- 主循环 ---------- */
  update(dt) {
    this.lastDt = dt;
    if (this.slowmoT > 0) {
      this.slowmoT -= dt;
      dt *= 0.35;
    }
    if (this.shakeT > 0) this.shakeT -= dt;
    this.time += dt;

    switch (this.state) {
      case 'countdown':
        this.countdown -= dt;
        /* 倒计时中禁止行动 */
        for (const r of this.robots) { r.moveX = 0; r.moveY = 0; r.fireHeld = false; }
        if (this.countdown <= 0) {
          this.countdown = 0;
          this.state = 'playing';
          SFX.go();
        }
        break;
      case 'playing':
        this.readInput();
        break;
      case 'over':
        this.overT -= dt;
        if (this.overT <= 0) {
          this.state = 'ended';
          UI.showResult(this);
        }
        break;
    }

    /* 结算中禁止行动 */
    if (this.state === 'over') {
      for (const r of this.robots) { r.moveX = 0; r.moveY = 0; r.fireHeld = false; }
    }

    for (const r of this.robots) r.update(dt, this);
    for (const b of this.bullets) b.update(dt, this);
    this.collideBullets();
    this.collideRobots();
    this.updatePickups(dt);
    this.updateBurnZones(dt);
    this.updateHeavenFalls(dt);
    FX.update(dt);

    /* 低血量屏幕警告（玩家视角） */
    const p1r = this.robots[0];
    if (this.state === 'playing' && !p1r.dead && p1r.hp / p1r.maxHp < 0.25) {
      ScreenFX.setLowHp(true);
    } else {
      ScreenFX.setLowHp(false);
    }

    /* 动态天气事件 */
    this.updateWeather(dt);
  }

  /* ---------- 天气事件（陨石雨 / 雷暴 / 空投） ---------- */
  updateWeather(dt) {
    for (let i = this.lightnings.length - 1; i >= 0; i--) {
      this.lightnings[i].life -= dt;
      if (this.lightnings[i].life <= 0) this.lightnings.splice(i, 1);
    }

    if (this.state !== 'playing') return;

    if (!this.weather) {
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        this.weatherTimer = U.rand(34, 55);
        if (FXQuality.weather && Math.random() < 0.7) this.startWeather();
      }
    } else {
      const w = this.weather;
      w.dur -= dt;
      w.tick -= dt;
      if (w.dur <= 0) {
        this.weather = null;
        Floaters.add(CFG.W / 2, 64, '天气事件结束', '#9db4dd', 16);
      } else if (w.tick <= 0) {
        w.tick = 0.55;
        this.weatherStep(w);
      }
    }
  }

  startWeather() {
    const types = ['meteor', 'storm', 'airdrop'];
    const type = U.pick(types);
    const names = { meteor: '⚠ 陨石雨来袭！', storm: '⚠ 雷暴降临！', airdrop: '✈ 空投补给！' };
    const colors = { meteor: '#ff8c42', storm: '#74c0fc', airdrop: '#69db7c' };
    this.weather = { type, dur: 7.5, tick: 0 };
    Floaters.add(CFG.W / 2, 64, names[type], colors[type], 22);
    ScreenFX.flash(colors[type], 0.15);
    SFX.tone(300, 0.5, 'sawtooth', 0.2, 80);
  }

  weatherStep(w) {
    if (w.type === 'meteor') {
      /* 陨石雨：随机落点，伤害双方 */
      const x = U.rand(this.map.wall + 40, this.map.W - this.map.wall - 40);
      const y = U.rand(this.map.wall + 40, this.map.H - this.map.wall - 40);
      this.heavenFalls.push({ x, y, delay: 0.7, weather: true });
      if (Math.random() < 0.5) {
        const x2 = U.rand(this.map.wall + 40, this.map.W - this.map.wall - 40);
        const y2 = U.rand(this.map.wall + 40, this.map.H - this.map.wall - 40);
        this.heavenFalls.push({ x: x2, y: y2, delay: 1.0, weather: true });
      }
    } else if (w.type === 'storm') {
      /* 雷暴：随机机器人附近落雷，眩晕 + 伤害 */
      const alive = this.robots.filter(r => !r.dead);
      const target = alive.length ? U.pick(alive) : this.robots[0];
      const lx = target.x + U.rand(-70, 70), ly = target.y + U.rand(-70, 70);
      this.lightnings.push({ x: lx, y: ly, life: 0.28 });
      this.areaDamage(lx, ly, 100, 16, null, 140);
      for (const r of this.robots) {
        if (!r.dead && U.dist(lx, ly, r.x, r.y) < 110) r.stunT = Math.max(r.stunT, 1.1);
      }
      Particles.spawn(lx, ly, { count: 16, colors: ['#74c0fc', '#e7f5ff', '#fff'], speed: 260, life: 0.4, size: 3, shape: 'spark' });
      SFX.tone(1400, 0.25, 'sawtooth', 0.22, 120);
    } else if (w.type === 'airdrop') {
      /* 空投：掉落补给道具 */
      const x = U.rand(this.map.wall + 50, this.map.W - this.map.wall - 50);
      const y = U.rand(this.map.wall + 50, this.map.H - this.map.wall - 50);
      const roll = Math.random();
      const type = roll < 0.45 ? 'health' : roll < 0.7 ? 'ammo' : roll < 0.85 ? 'boost' : 'shield';
      const p = new Pickup(type, x, y);
      p.spawnT = 0.6;
      this.pickups.push(p);
      Particles.spawn(x, y, { count: 8, colors: ['#69db7c', '#fff'], speed: 140, life: 0.5, size: 3 });
    }
  }

  drawWeather(ctx) {
    /* 闪电 */
    for (const l of this.lightnings) {
      const a = l.life / 0.28;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#eaf6ff';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#74c0fc';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(l.x, 0);
      let px = l.x;
      for (let i = 1; i <= 6; i++) {
        const ny = (l.y / 6) * i;
        px += U.rand(-18, 18);
        ctx.lineTo(px, ny);
      }
      ctx.lineTo(l.x, l.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  render(ctx, t) {
    ctx.save();
    if (this.shakeT > 0) {
      ctx.translate(U.rand(-this.shakeT, this.shakeT) * 1.1, U.rand(-this.shakeT, this.shakeT) * 1.1);
    }

    this.map.draw(ctx);
    this.drawWeather(ctx);

    this.drawBurnZones(ctx);
    this.drawHeavenFalls(ctx);
    for (const p of this.pickups) p.draw(ctx);
    for (const r of this.robots) if (r.drone) r.drone.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    for (const r of this.robots) r.draw(ctx, t);
    FX.draw(ctx);

    ctx.restore();

    /* 屏幕特效层（闪光/红晕/击杀横幅） */
    FX.drawScreen(ctx, t);

    UI.drawHUD(this, ctx, t);
  }
}
