'use strict';
/* ============================================================
 * 生存模式：无尽波次防守
 * 敌人一波波来袭（每 5 波一个精英），玩家存活越久奖励越多
 * ============================================================ */

class Survival {
  constructor(cfg) {
    this.mode = 'survival';
    this.p1Mech = cfg.p1Mech;

    this.map = GameMap;
    this.map.generate();                       // 随机地图主题

    this.player = new Robot(this.p1Mech, 'p1', {
      x: this.map.W / 2, y: this.map.H - 130,
      name: '你',
      bonus: Progress.bonuses(this.p1Mech),
      level: Progress.mech(this.p1Mech).level,
      loadout: Progress.getLoadout(this.p1Mech),
      plug: Progress.mech(this.p1Mech).plug,
      skin: Progress.skinFor(this.p1Mech)
    });
    this.player.invulnT = 3;

    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    this.burnZones = [];
    this.heavenFalls = [];

    this.wave = 0;
    this.state = 'prepare';                    // prepare | playing | over | ended
    this.prepareT = 3;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.kills = 0;
    this.overT = 0;
    this.time = 0;
    this.slowmoT = 0;
    this.shakeT = 0;

    SFX.count();
  }

  /* AI 与机器人引用的 game 接口 */
  enemyOf(robot) {
    if (robot === this.player) {
      /* 玩家 → 最近的敌人 */
      let best = null, bestD = Infinity;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = U.dist2(this.player.x, this.player.y, e.x, e.y);
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    }
    return this.player;
  }

  shake(n) {
    if (Progress.settings && Progress.settings.screenShake === false) return;
    this.shakeT = Math.max(this.shakeT, n);
  }

  /* ---------- 武器/技能接口（复用 Game 逻辑） ---------- */
  spawnBullet(owner, angle, w) {
    this.bullets.push(Combat.makeBullet(owner, angle, w));
  }

  areaDamage(x, y, radius, dmg, from, knock, excludeSelf = true) {
    const targets = [this.player, ...this.enemies];
    for (const r of targets) {
      if (r.dead || (from === r && excludeSelf)) continue;
      const d = U.dist(x, y, r.x, r.y);
      if (d <= radius + r.radius) {
        const angle = U.angleTo(r.x, r.y, x, y);
        const falloff = 1 - U.clamp(d / (radius + r.radius), 0, 1) * 0.35;
        r.takeDamage(dmg * falloff, angle, knock, this, from);
        if (from && from !== r) from.addUlti(U.clamp(dmg * 0.35, 2, 12));
      }
    }
  }

  empStun(from, radius, dur) {
    for (const e of this.enemies) {
      if (e.dead || e === from) continue;
      if (U.dist(from.x, from.y, e.x, e.y) <= radius + e.radius) {
        e.stunT = Math.max(e.stunT, dur);
      }
    }
  }

  addBurnZone(x, y, r, dps, dur, owner) {
    this.burnZones.push({ x, y, r, dps, dur, maxDur: dur, owner, tick: 0 });
    Particles.spawn(x, y, { count: 16, colors: ['#ff922b', '#ffd43b'], speed: 160, life: 0.5, size: 4, gravity: 60 });
    Shockwaves.add(x, y, r, 'rgba(255,150,60,0.8)');
  }

  /* ---------- 波次管理 ---------- */
  makeEnemy(elite) {
    const mech = U.pick(Object.keys(CFG.MECHS));
    const diff = this.wave < 3 ? 'easy' : this.wave < 8 ? 'normal' : 'hard';
    const e = new Robot(mech, 'ai', {
      x: U.rand(130, this.map.W - 130),
      y: U.rand(70, 120),
      name: (elite ? '精英·' : 'AI·') + CFG.MECHS[mech].name.split('·')[0],
      loadout: CFG.MECHS[mech].slots.map(() => U.pick(['minigun', 'laser', 'shotgun', 'minigun', 'laser', 'grenade', 'frost', 'sniper', 'missile', 'plasma', 'sonic', 'needle', 'flame', 'tesla', 'napalm', 'saw', 'rail'])),
      plug: Math.random() < 0.45 ? U.pick(Object.keys(CFG.PLUGINS)) : null,
      elite,
      speedMult: elite ? 1.25 : 1
    });
    /* 敌人血量随波次成长（wave 8 后不再零成长） */
    const waveMult = 1 + (this.wave - 1) * 0.04;
    e.maxHp = Math.round(e.maxHp * waveMult);
    e.hp = e.maxHp;
    if (elite) {
      e.maxHp = Math.round(e.maxHp * 3);
      e.hp = e.maxHp;
      e.radius = Math.round(e.radius * 1.35);
      e.passiveDmgUp = (e.passiveDmgUp || 0) + 0.5;
    }
    e.ai = new AI(e, this, diff);
    return e;
  }

  startWave() {
    this.wave++;
    const n = Math.min(2 + this.wave, 11);
    this.spawnQueue = [];
    for (let i = 0; i < n; i++) this.spawnQueue.push(this.makeEnemy(false));
    if (this.wave % 5 === 0) this.spawnQueue.push(this.makeEnemy(true));
    this.state = 'playing';
    this.spawnTimer = 0.4;
    Floaters.add(this.map.W / 2, 110, `—— 第 ${this.wave} 波 ——`, '#ffd43b', 26);
    ScreenFX.flash('rgba(255,212,59,0.2)', 0.2);
    SFX.count();
  }

  spawnEnemies(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const maxConcurrent = Math.min(2 + Math.floor(this.wave / 3), 6);
    const alive = this.enemies.filter(e => !e.dead).length;
    if (alive >= maxConcurrent || !this.spawnQueue.length) return;
    this.spawnTimer = 0.6;
    const e = this.spawnQueue.shift();
    this.enemies.push(e);
    Particles.spawn(e.x, e.y, { count: 14, colors: ['#ffa94d', '#fff'], speed: 200, life: 0.5, size: 3.5 });
    Shockwaves.add(e.x, e.y, 50, 'rgba(255,180,100,0.8)');
  }

  onRobotDeath(robot) {
    if (robot === this.player) {
      this.slowmoT = 0.55;
      this.shake(14);
      this.overT = 1.8;
      this.state = 'over';
      return;
    }
    this.kills++;
    /* 掉落补给 */
    if (Math.random() < 0.35) {
      const type = Math.random() < 0.55 ? 'health' : 'ammo';
      const p = new Pickup(type, robot.x, robot.y);
      p.spawnT = 0.5;
      this.pickups.push(p);
    }
    /* 波次清空判定 */
    if (this.state === 'playing' && !this.spawnQueue.length && this.enemies.every(e => e.dead)) {
      const bonus = 15 + this.wave * 2;
      Progress.addCoins(bonus);
      Floaters.add(this.map.W / 2, 130, `波次奖励 +${bonus} 🪙`, '#ffd43b', 20);
      this.state = 'prepare';
      this.prepareT = 2.5;
    }
  }

  /* ---------- 玩家输入 ---------- */
  readPlayer() {
    const r = this.player;
    const ax = Input.axis('p1');
    const m = Math.hypot(ax.x, ax.y);
    r.moveX = m > 0.01 ? ax.x / m : 0;
    r.moveY = m > 0.01 ? ax.y / m : 0;

    const t = this.enemyOf(r);
    if (t && !t.dead) r.aimOverride = U.angleTo(r.x, r.y, t.x, t.y);

    r.fireHeld = Input.isActive('p1', 'fire');
    if (Input.pressedActive('p1', 'sub')) r.switchSlot();
    if (Input.pressedActive('p1', 'swap')) r.switchSlot();
    if (Input.pressedActive('p1', 'skill')) r.useSkill(this);
    if (Input.pressedActive('p1', 'ulti')) {
      r.useUltimate(this);
    }
  }

  /* ---------- 碰撞 ---------- */
  collideBullets() {
    for (const b of this.bullets) {
      if (b.dead) continue;
      const targets = [this.player, ...this.enemies];
      for (const r of targets) {
        if (r.dead || r === b.owner) continue;
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
            if (b.owner) b.owner.addUlti(U.clamp(b.dmg * 0.5, 4, 20));
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
    const all = [this.player, ...this.enemies];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        if (a.dead || b.dead) continue;
        if (U.circleCircleHit(a.x, a.y, a.radius, b.x, b.y, b.radius)) {
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          const overlap = (a.radius + b.radius - d) / 2;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * overlap; a.y -= ny * overlap;
          b.x += nx * overlap; b.y += ny * overlap;
        }
      }
    }
  }

  /* ---------- 道具 ---------- */
  updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.update(dt);
      if (p.dead) { this.pickups.splice(i, 1); continue; }
      if (p.spawnT <= 0) {
        if (U.dist2(p.x, p.y, this.player.x, this.player.y) <= (this.player.radius + p.r + 3) ** 2) {
          p.apply(this.player);
          p.dead = true;
        }
      }
    }
    this.pickups = this.pickups.filter(p => !p.dead);
  }

  updateBurnZones(dt) {
    Combat.tickBurnZones(this, dt, () => [this.player, ...this.enemies]);
  }

  updateHeavenFalls(dt) {
    Combat.tickHeavenFalls(this, dt, this.player, 30, 70);
  }

  drawBurnZones(ctx) {
    Combat.drawBurnZones(ctx, this.burnZones);
  }

  drawHeavenFalls(ctx) {
    Combat.drawHeavenFalls(ctx, this.heavenFalls);
  }

  /* ---------- 主循环 ---------- */
  update(dt) {
    if (this.slowmoT > 0) {
      this.slowmoT -= dt;
      dt *= 0.35;
    }
    if (this.shakeT > 0) this.shakeT -= dt;
    this.time += dt;

    switch (this.state) {
      case 'prepare':
        this.prepareT -= dt;
        if (this.prepareT <= 0) this.startWave();
        break;
      case 'playing':
        this.readPlayer();
        this.spawnEnemies(dt);
        for (const e of this.enemies) if (e.ai) e.ai.update(dt);
        break;
      case 'over':
        this.overT -= dt;
        if (this.overT <= 0) {
          this.state = 'ended';
          UI.showSurvivalResult(this);
        }
        break;
    }

    this.player.update(dt, this);
    for (const e of this.enemies) e.update(dt, this);
    for (const b of this.bullets) b.update(dt, this);
    this.collideBullets();
    this.collideRobots();
    this.updatePickups(dt);
    this.updateBurnZones(dt);
    this.updateHeavenFalls(dt);
    FX.update(dt);

    /* 清理死亡敌人 */
    this.enemies = this.enemies.filter(e => !e.dead);

    /* 低血量警告 */
    if (this.state === 'playing' && this.player.hp / this.player.maxHp < 0.25) {
      ScreenFX.setLowHp(true);
    } else {
      ScreenFX.setLowHp(false);
    }
  }

  render(ctx, t) {
    ctx.save();
    if (this.shakeT > 0) {
      ctx.translate(U.rand(-this.shakeT, this.shakeT) * 1.1, U.rand(-this.shakeT, this.shakeT) * 1.1);
    }

    this.map.draw(ctx);
    this.drawBurnZones(ctx);
    this.drawHeavenFalls(ctx);
    for (const p of this.pickups) p.draw(ctx);
    for (const e of this.enemies) if (e.drone) e.drone.draw(ctx);
    if (this.player.drone) this.player.drone.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    this.player.draw(ctx, t);
    for (const e of this.enemies) e.draw(ctx, t);
    FX.draw(ctx);

    ctx.restore();

    FX.drawScreen(ctx, t);
    UI.drawSurvivalHUD(this, ctx, t);
  }
}
