'use strict';
/* ============================================================
 * Boss 战：单人挑战巨型机甲「巨兽」
 * 三阶段：扫射/导弹 → 蓄力炮/冲撞 → 狂暴 + 召唤小兵
 * ============================================================ */

class BossFight {
  constructor(cfg) {
    this.mode = 'boss';
    this.p1Mech = cfg.p1Mech;
    this.bossType = cfg.bossType || 'inferno';
    const BCFG = CFG.BOSSES[this.bossType] || CFG.BOSSES.inferno;

    this.map = GameMap;
    this.map.generate();

    this.player = new Robot(this.p1Mech, 'p1', {
      x: this.map.W / 2, y: this.map.H - 150,
      name: '你',
      bonus: Progress.bonuses(this.p1Mech),
      level: Progress.mech(this.p1Mech).level,
      loadout: Progress.getLoadout(this.p1Mech),
      plug: Progress.mech(this.p1Mech).plug,
      skin: Progress.skinFor(this.p1Mech)
    });
    this.player.invulnT = 3.2;

    /* 巨型 Boss */
    this.boss = new Robot('tank', 'ai', {
      x: this.map.W / 2, y: 160,
      name: BCFG.name,
      loadout: ['minigun', 'grenade'],
      plug: null
    });
    this.boss.maxHp = BCFG.hp;
    this.boss.hp = BCFG.hp;
    this.boss.radius = 58;
    this.boss.passiveDmgReduce = 0.15;
    this.boss.color = BCFG.color;          // Boss 专属配色
    this.boss.darkColor = BCFG.dark;
    this.boss.elite = true;               // 复用精英金色描边

    /* 冰霜 Boss 专属状态 */
    this.frostSpikes = [];
    this.blizzardT = 0;

    /* 雷暴 Boss 专属状态 */
    this.stormMarks = [];     // 落雷预警圈 {x,y,delay}
    this.empFieldT = 0;       // 电磁脉冲场计时

    this.minions = [];
    this.bullets = [];
    this.pickups = [];
    this.burnZones = [];
    this.heavenFalls = [];

    this.state = 'countdown';
    this.countdown = 3.2;
    this.phase = 1;
    this.skillT = 1.6;
    this.charging = 0;        // 蓄力炮倒计时
    this.slamT = 0;
    this.slamming = false;
    this.slamDir = 0;
    this.slamHit = false;
    this.summonT = 14;
    this.dmgDealt = 0;
    this.time = 0;
    this.overT = 0;
    this.slowmoT = 0;
    this.shakeT = 0;
    this.bossT = 0;          // Boss 动画计时（必须在构造初始化，否则 NaN）

    SFX.count();
  }

  get phaseName() {
    return this.phase === 1 ? 'Ⅰ 警戒' : this.phase === 2 ? 'Ⅱ 狂怒' : 'Ⅲ 灭世';
  }

  enemyOf(robot) {
    if (robot === this.player) return this.boss;
    return this.player;
  }

  shake(n) {
    if (Progress.settings && Progress.settings.screenShake === false) return;
    this.shakeT = Math.max(this.shakeT, n);
  }

  spawnBullet(owner, angle, w) {
    this.bullets.push(Combat.makeBullet(owner, angle, w));
  }

  /* Boss 专用弹 */
  bossShot(angle, dmg, speed, size, color, opts = {}) {
    const b = new Bullet({
      x: this.boss.x + Math.cos(angle) * (this.boss.radius + 16),
      y: this.boss.y + Math.sin(angle) * (this.boss.radius + 16),
      owner: this.boss,
      angle, dmg, speed, size, color,
      knock: opts.knock || 40,
      aoe: opts.aoe || 0,
      homing: opts.homing || false,
      turn: 3,
      slow: opts.slow || 0,
      slowDur: opts.slowDur || 0,
      life: opts.life || 3
    });
    this.bullets.push(b);
    return b;
  }

  areaDamage(x, y, radius, dmg, from, knock) {
    const targets = [this.player, this.boss, ...this.minions];
    for (const r of targets) {
      if (r.dead || r === from) continue;
      const d = U.dist(x, y, r.x, r.y);
      if (d <= radius + r.radius) {
        const angle = U.angleTo(r.x, r.y, x, y);
        const falloff = 1 - U.clamp(d / (radius + r.radius), 0, 1) * 0.35;
        r.takeDamage(dmg * falloff, angle, knock, this, from);
      }
    }
  }

  addBurnZone(x, y, r, dps, dur, owner) {
    this.burnZones.push({ x, y, r, dps, dur, maxDur: dur, owner, tick: 0 });
  }

  /* EMP 眩晕（玩家/小兵技能与大招使用，Boss 免疫） */
  empStun(from, radius, dur) {
    const targets = [this.player, this.boss, ...this.minions];
    for (const r of targets) {
      if (r.dead || r === from || r === this.boss) continue;
      if (U.dist(from.x, from.y, r.x, r.y) <= radius + r.radius) {
        r.stunT = Math.max(r.stunT, dur);
      }
    }
  }

  /* ---------- Boss AI ---------- */
  updateBoss(dt) {
    const b = this.boss;
    if (b.dead) return;

    /* 阶段判定 */
    const hpPct = b.hp / b.maxHp;
    if (hpPct < 0.33 && this.phase < 3) this.enterPhase(3);
    else if (hpPct < 0.66 && this.phase < 2) this.enterPhase(2);

    /* 移动：左右横移逼近玩家 */
    if (!this.slamming && this.charging <= 0) {
      const speed = 46 + this.phase * 18;
      const dirToPlayer = Math.sign(this.player.x - b.x) || 1;
      b.x += (dirToPlayer * 0.6 + Math.sin(this.bossT * 0.7) * 0.4) * speed * dt;
      b.y += (this.player.y > b.y ? 1 : -1) * 12 * dt;
      b.y = U.clamp(b.y, 100, this.map.H * 0.55);
      /* 自动瞄准玩家 */
      b.aim = U.angleLerp(b.aim, U.angleTo(b.x, b.y, this.player.x, this.player.y), Math.min(1, 2.5 * dt));
    }
    const pos = this.map.resolveCircle(b.x, b.y, b.radius);
    b.x = pos.x; b.y = pos.y;

    /* 冲撞 */
    if (this.slamming) {
      this.slamT -= dt;
      b.x += Math.cos(this.slamDir) * 420 * dt;
      b.y += Math.sin(this.slamDir) * 420 * dt;
      if (this.slamT <= 0) {
        this.slamming = false;
        this.skillT = 1.2;
      }
      /* 冲撞接触伤害（每次冲撞仅一次） */
      if (!this.slamHit && U.dist(b.x, b.y, this.player.x, this.player.y) < b.radius + this.player.radius + 8) {
        this.slamHit = true;
        this.player.takeDamage(25, U.angleTo(this.player.x, this.player.y, b.x, b.y), 320, this, b);
      }
    }

    /* 蓄力炮 */
    if (this.charging > 0) {
      this.charging -= dt;
      if (this.charging <= 0) {
        const a = U.angleTo(b.x, b.y, this.player.x, this.player.y);
        this.bossShot(a, 34, 420, 14, '#ff6b6b', { aoe: 60, knock: 200, life: 2 });
        Shockwaves.add(b.x, b.y, 90, 'rgba(255,100,90,1)');
        SFX.explode(false);
        this.skillT = 1.6;
      }
    }

    /* 技能循环 */
    if (this.charging <= 0 && !this.slamming) {
      this.skillT -= dt;
      if (this.skillT <= 0) {
        this.bossSkill();
      }
    }

    /* 召唤小兵（阶段 3） */
    if (this.phase >= 3) {
      this.summonT -= dt;
      if (this.summonT <= 0) {
        this.summonT = 9;
        this.summonMinions(2);
      }
    }

    /* 冰霜 Boss 专属推进 */
    if (this.bossType === 'frost') this.updateFrost(dt);
    /* 雷暴 Boss 专属推进 */
    if (this.bossType === 'storm') this.updateStorm(dt);

    /* 低血量特效：机体冒烟 */
    if (hpPct < 0.5 && Math.random() < dt * 4) {
      Particles.spawn(b.x + U.rand(-20, 20), b.y - b.radius,
        { count: 1, angle: -Math.PI / 2, spread: 0.4, speed: 40, life: 0.9, size: 8,
          colors: ['#495057', '#868e96'], shape: 'smoke', gravity: -25, grow: 10 });
    }
  }

  bossSkill() {
    const b = this.boss;
    if (this.bossType === 'frost') return this.frostSkill();
    if (this.bossType === 'storm') return this.stormSkill();
    const p = U.angleTo(b.x, b.y, this.player.x, this.player.y);
    const r = Math.random();
    const phaseMult = 1 + (this.phase - 1) * 0.4;

    if (this.phase >= 2 && r < 0.25) {
      /* 冲撞 */
      this.slamming = true;
      this.slamHit = false;
      this.slamT = 0.55;
      this.slamDir = U.angleTo(b.x, b.y, this.player.x, this.player.y);
      Floaters.add(b.x, b.y - b.radius - 20, '冲撞！', '#ff8787', 16);
      SFX.tone(120, 0.4, 'sawtooth', 0.3, 50);
    } else if (this.phase >= 2 && r < 0.5) {
      /* 蓄力炮 */
      this.charging = 0.8;
      Shockwaves.add(b.x, b.y, 60, 'rgba(255,80,80,0.8)');
      Floaters.add(b.x, b.y - b.radius - 20, '蓄力炮！', '#ff8787', 16);
    } else if (r < 0.75) {
      /* 导弹齐射 */
      const n = 2 + this.phase;
      for (let i = 0; i < n; i++) {
        const a = p + (i - (n - 1) / 2) * 0.22;
        this.bossShot(a, 18 * phaseMult, 330, 7, '#ffa94d', { homing: true, aoe: 55, knock: 140, life: 3.4 });
      }
      Particles.spawn(b.x, b.y, { count: 8, colors: ['#ffa94d', '#ffd8a8'], speed: 140, life: 0.4, size: 4 });
    } else {
      /* 扇形扫射 */
      const pellets = 4 + this.phase * 2;
      for (let i = 0; i < pellets; i++) {
        const a = p + (i - (pellets - 1) / 2) * 0.12;
        this.bossShot(a, 9 * phaseMult, 460, 4.5, '#ff6b6b', { knock: 30 });
      }
      SFX.shoot('minigun');
    }
    this.skillT = Math.max(0.5, (1.8 - this.phase * 0.3) * U.rand(0.8, 1.3));
  }

  /* ---------- 冰霜巨兽技能（frost 专属） ---------- */
  frostSkill() {
    const b = this.boss;
    const p = U.angleTo(b.x, b.y, this.player.x, this.player.y);
    const r = Math.random();
    const phaseMult = 1 + (this.phase - 1) * 0.35;

    if (r < 0.35) {
      /* 冰霜吐息：扇形冰弹（减速） */
      const pellets = 4 + this.phase * 2;
      for (let i = 0; i < pellets; i++) {
        const a = p + (i - (pellets - 1) / 2) * 0.11;
        this.bossShot(a, 8 * phaseMult, 470, 5, '#a5d8ff', { knock: 25, slow: 0.4, slowDur: 1.2 });
      }
      Particles.spawn(b.x, b.y, { count: 10, angle: p, spread: 0.5, speed: 200, life: 0.5, size: 4, colors: ['#a5d8ff', '#e7f5ff'] });
      SFX.tone(500, 0.3, 'sine', 0.2, 200);
    } else if (r < 0.65) {
      /* 冰刺：玩家脚下预警后爆发 */
      this.frostSpikes.push({ x: this.player.x, y: this.player.y, delay: 0.7 });
      Shockwaves.add(this.player.x, this.player.y, 40, 'rgba(140,210,255,0.7)');
      Floaters.add(this.player.x, this.player.y - 30, '冰刺！', '#a5d8ff', 15);
    } else {
      /* 冰锥齐射 */
      const n = 2 + this.phase;
      for (let i = 0; i < n; i++) {
        const a = p + (i - (n - 1) / 2) * 0.28;
        this.bossShot(a, 16 * phaseMult, 360, 8, '#74c0fc', { aoe: 46, knock: 120, slow: 0.3, slowDur: 1.0 });
      }
    }
    this.skillT = Math.max(0.6, (2.0 - this.phase * 0.3) * U.rand(0.85, 1.3));
  }

  /* 冰刺与暴风雪推进 */
  updateFrost(dt) {
    for (let i = this.frostSpikes.length - 1; i >= 0; i--) {
      const sp = this.frostSpikes[i];
      sp.delay -= dt;
      if (sp.delay <= 0) {
        this.frostSpikes.splice(i, 1);
        this.areaDamage(sp.x, sp.y, 72, 28, this.boss, 220);
        Particles.spawn(sp.x, sp.y, { count: 16, colors: ['#a5d8ff', '#e7f5ff', '#fff'], speed: 240, life: 0.5, size: 4 });
        Particles.spawn(sp.x, sp.y, { count: 8, colors: ['#e7f5ff'], speed: 320, life: 0.4, size: 2.5, shape: 'spark' });
        Shockwaves.add(sp.x, sp.y, 72, 'rgba(160,220,255,0.9)');
        this.shake(6);
      }
    }
    /* 暴风雪：阶段 2+ 全场持续伤害与减速 */
    if (this.phase >= 2) {
      this.blizzardT -= dt;
      if (this.blizzardT <= 0) {
        this.blizzardT = 1.1;
        if (!this.player.dead) {
          this.player.takeDamage(5, U.rand(0, Math.PI * 2), 20, this, this.boss);
          this.player.applyStatus(0.2, 0.6);
        }
        Shockwaves.add(this.boss.x, this.boss.y, 300, 'rgba(180,230,255,0.3)');
      }
    }
  }

  /* 冰刺预警圈绘制 */
  drawFrostSpikes(ctx) {
    for (const sp of this.frostSpikes) {
      const blink = Math.floor(sp.delay * 8) % 2 === 0;
      ctx.strokeStyle = blink ? 'rgba(170,225,255,0.95)' : 'rgba(170,225,255,0.4)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 20, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /* ---------- 雷暴主宰技能（storm 专属） ---------- */
  stormSkill() {
    const b = this.boss;
    const p = U.angleTo(b.x, b.y, this.player.x, this.player.y);
    const r = Math.random();
    const phaseMult = 1 + (this.phase - 1) * 0.35;

    if (r < 0.3) {
      /* 落雷：玩家脚下预警后雷击（眩晕） */
      const n = 1 + this.phase;
      for (let i = 0; i < n; i++) {
        this.stormMarks.push({ x: this.player.x + U.rand(-60, 60), y: this.player.y + U.rand(-60, 60), delay: 0.65 + i * 0.12 });
      }
      Shockwaves.add(this.player.x, this.player.y, 46, 'rgba(255,210,90,0.8)');
      Floaters.add(this.player.x, this.player.y - 30, '落雷！', '#ffd43b', 15);
      SFX.tone(1500, 0.15, 'sawtooth', 0.25, 500);
    } else if (r < 0.6) {
      /* 连锁闪电：电弹齐射（溅射电击） */
      const n = 2 + this.phase;
      for (let i = 0; i < n; i++) {
        const a = p + (i - (n - 1) / 2) * 0.24;
        this.bossShot(a, 15 * phaseMult, 420, 6, '#ffd43b', { aoe: 50, knock: 130, life: 3, spark: true });
      }
      Particles.spawn(b.x, b.y, { count: 10, angle: p, spread: 0.5, speed: 260, life: 0.35, size: 3, colors: ['#ffd43b', '#ffe066', '#fff'], shape: 'spark' });
    } else if (r < 0.82) {
      /* 闪电链：从 Boss 射向玩家的一发高速电球（强击退） */
      this.bossShot(p, 26 * phaseMult, 620, 9, '#ffe066', { aoe: 64, knock: 300, life: 2.4, spark: true });
      Shockwaves.add(b.x, b.y, 60, 'rgba(255,220,100,0.9)');
    } else {
      /* 电磁脉冲：全屏短暂眩晕（阶段 2+ 有预警） */
      Floaters.add(b.x, b.y - b.radius - 20, 'EMP！', '#ffd43b', 17);
      Shockwaves.add(b.x, b.y, 320, 'rgba(255,215,100,0.6)');
      Particles.spawn(b.x, b.y, { count: 30, angle: U.rand(0, Math.PI * 2), spread: Math.PI * 2, speed: 320, life: 0.6, size: 3, colors: ['#ffd43b', '#fff'], shape: 'spark' });
      this.player.stunT = Math.max(this.player.stunT, 0.8 + this.phase * 0.2);
      this.shake(8);
    }
    this.skillT = Math.max(0.55, (1.9 - this.phase * 0.3) * U.rand(0.85, 1.3));
  }

  /* 落雷与电磁场推进 */
  updateStorm(dt) {
    /* 落雷 */
    for (let i = this.stormMarks.length - 1; i >= 0; i--) {
      const mk = this.stormMarks[i];
      mk.delay -= dt;
      if (mk.delay <= 0) {
        this.stormMarks.splice(i, 1);
        /* 垂直闪电柱：从屏幕顶端劈下 */
        const boltY = Math.max(0, mk.y - 240);
        for (let k = 0; k < 10; k++) {
          const bx = mk.x + U.rand(-22, 22);
          Particles.spawn(bx, boltY + k * 24, { count: 1, angle: Math.PI / 2, spread: 0.15, speed: 700, life: 0.18, size: 3.5, colors: ['#fff', '#ffd43b', '#ffe066'], shape: 'spark' });
        }
        this.areaDamage(mk.x, mk.y, 78, 30, this.boss, 240);
        Particles.spawn(mk.x, mk.y, { count: 20, colors: ['#ffd43b', '#ffe066', '#fff'], speed: 300, life: 0.5, size: 4, shape: 'spark' });
        Shockwaves.add(mk.x, mk.y, 78, 'rgba(255,215,90,0.95)');
        this.shake(7);
        SFX.tone(900, 0.25, 'sawtooth', 0.3, 200);
      }
    }
    /* 阶段 2+：周期性电磁场（短暂持续伤害） */
    if (this.phase >= 2) {
      this.empFieldT -= dt;
      if (this.empFieldT <= 0) {
        this.empFieldT = 3.5;
        Floaters.add(this.player.x, this.player.y - 30, '⚡ 电磁场！', '#ffd43b', 14);
        /* 持续 1 秒的场：用延时标记（每 0.25s 一次电击） */
        for (let i = 0; i < 4; i++) {
          setTimeout(() => {
            if (typeof UI !== 'undefined' && UI.game !== this) return;
            if (!this.player.dead && this.state === 'playing') {
              this.player.takeDamage(4, U.rand(0, Math.PI * 2), 15, this, this.boss);
              Particles.spawn(this.player.x + U.rand(-14, 14), this.player.y + U.rand(-14, 14),
                { count: 4, colors: ['#ffd43b', '#fff'], speed: 180, life: 0.25, size: 2.5, shape: 'spark' });
            }
          }, i * 250);
        }
      }
    }
  }

  /* 落雷预警圈绘制 */
  drawStormMarks(ctx) {
    for (const mk of this.stormMarks) {
      const blink = Math.floor(mk.delay * 8) % 2 === 0;
      ctx.strokeStyle = blink ? 'rgba(255,220,100,0.95)' : 'rgba(255,220,100,0.4)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(mk.x, mk.y, 24, 0, Math.PI * 2);
      ctx.stroke();
      /* 中心闪电符号 */
      ctx.fillStyle = blink ? 'rgba(255,230,120,0.9)' : 'rgba(255,230,120,0.45)';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', mk.x, mk.y);
    }
  }

  enterPhase(n) {
    this.phase = n;
    this.bossT = 0;
    Floaters.add(this.boss.x, this.boss.y - this.boss.radius - 30,
      n === 2 ? '⚠ 巨兽狂怒！' : '☠ 灭世模式！', '#ff6b6b', 28);
    ScreenFX.flash('rgba(255,60,60,0.35)', 0.35);
    this.shake(14);
    SFX.tone(80, 0.9, 'sawtooth', 0.4, 30);
    /* 阶段切换恢复 8% 护盾 */
    this.boss.hp = Math.min(this.boss.maxHp, this.boss.hp + this.boss.maxHp * 0.08);
  }

  summonMinions(n) {
    for (let i = 0; i < n; i++) {
      const mech = U.pick(Object.keys(CFG.MECHS));
      const m = new Robot(mech, 'ai', {
        x: this.boss.x + U.rand(-120, 120),
        y: this.boss.y + 80,
        name: 'AI·' + CFG.MECHS[mech].name.split('·')[0],
        loadout: CFG.MECHS[mech].slots.map(() => U.pick(['minigun', 'laser', 'shotgun', 'minigun', 'laser', 'grenade', 'frost', 'sniper', 'missile', 'plasma', 'sonic', 'needle', 'flame', 'tesla', 'napalm', 'saw', 'rail'])),
        plug: null
      });
      m.ai = new AI(m, this, 'normal');
      this.minions.push(m);
      Particles.spawn(m.x, m.y, { count: 12, colors: ['#ffa94d', '#fff'], speed: 180, life: 0.5, size: 3 });
    }
    Floaters.add(this.boss.x, this.boss.y + 60, '召唤小兵！', '#ffa94d', 16);
  }

  /* ---------- 玩家输入 ---------- */
  readPlayer() {
    const r = this.player;
    const ax = Input.axis('p1');
    const m = Math.hypot(ax.x, ax.y);
    r.moveX = m > 0.01 ? ax.x / m : 0;
    r.moveY = m > 0.01 ? ax.y / m : 0;
    r.aimOverride = U.angleTo(r.x, r.y, this.boss.x, this.boss.y);
    r.fireHeld = Input.isActive('p1', 'fire');
    if (Input.pressedActive('p1', 'sub')) r.switchSlot();
    if (Input.pressedActive('p1', 'swap')) r.switchSlot();
    if (Input.pressedActive('p1', 'skill')) r.useSkill(this);
    if (Input.pressedActive('p1', 'ulti')) r.useUltimate(this);
  }

  /* ---------- 碰撞 ---------- */
  collideBullets() {
    for (const b of this.bullets) {
      if (b.dead) continue;

      /* 玩家子弹 → Boss & 小兵 */
      if (b.owner === this.player) {
        if (!this.boss.dead && U.circleCircleHit(b.x, b.y, b.size, this.boss.x, this.boss.y, this.boss.radius)) {
          this.hitBoss(b);
          continue;
        }
        for (const mn of this.minions) {
          if (mn.dead) continue;
          if (U.circleCircleHit(b.x, b.y, b.size, mn.x, mn.y, mn.radius)) {
            mn.takeDamage(b.dmg, b.angle, b.knock, this, this.player);
            if (b.slow) mn.applyStatus(b.slow, b.slowDur);
            if (b.dot) mn.applyStatus(null, null, b.dot);
            this.player.addUlti(U.clamp(b.dmg * 0.5, 4, 20));
            if (b.pierce > 0) b.pierce--;
            else b.dead = true;
            Particles.spawn(b.x, b.y, { count: 6, colors: [b.color, '#fff'], speed: 150, life: 0.3, size: 3 });
            break;
          }
        }
        continue;
      }

      /* Boss/小兵子弹 → 玩家 */
      if (b.owner !== this.player && !this.player.dead) {
        if (U.circleCircleHit(b.x, b.y, b.size, this.player.x, this.player.y, this.player.radius)) {
          if (b.aoe) b.explode(this);
          else {
            this.player.takeDamage(b.dmg, b.angle, b.knock, this, b.owner);   // 归属真实施法者
            if (b.slow) this.player.applyStatus(b.slow, b.slowDur);
            b.dead = true;
          }
        }
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  hitBoss(b) {
    if (b.aoe) {
      /* 范围弹在 Boss 处爆炸 */
      const before = this.boss.hp;
      this.areaDamage(b.x, b.y, b.aoe, b.dmg, this.player, b.knock);
      this.dmgDealt += Math.max(0, before - this.boss.hp);
      b.dead = true;
      return;
    }
    const before = this.boss.hp;
    this.boss.takeDamage(b.dmg, b.angle, b.knock * 0.3, this, this.player);
    if (b.slow) this.boss.applyStatus(b.slow, b.slowDur);
    if (b.dot) this.boss.applyStatus(null, null, b.dot);
    this.dmgDealt += Math.max(0, before - this.boss.hp);
    this.player.addUlti(U.clamp(b.dmg * 0.5, 4, 20));
    Particles.spawn(b.x, b.y, { count: 8, colors: ['#ffd166', '#fff'], speed: 200, life: 0.35, size: 3 });
    if (b.pierce > 0) b.pierce--;
    else b.dead = true;
    this.shake(3);
  }

  collideRobots() {
    if (this.player.dead || this.boss.dead) return;
    if (U.circleCircleHit(this.player.x, this.player.y, this.player.radius, this.boss.x, this.boss.y, this.boss.radius)) {
      const dx = this.player.x - this.boss.x, dy = this.player.y - this.boss.y;
      const d = Math.hypot(dx, dy) || 1;
      const overlap = (this.boss.radius + this.player.radius - d) / 2;
      this.player.x += dx / d * overlap;
      this.player.y += dy / d * overlap;
    }
    for (const mn of this.minions) {
      if (mn.dead) continue;
      if (U.circleCircleHit(this.player.x, this.player.y, this.player.radius, mn.x, mn.y, mn.radius)) {
        const dx = this.player.x - mn.x, dy = this.player.y - mn.y;
        const d = Math.hypot(dx, dy) || 1;
        const overlap = (mn.radius + this.player.radius - d) / 2;
        this.player.x += dx / d * overlap;
        this.player.y += dy / d * overlap;
      }
    }
  }

  updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.update(dt);
      if (p.dead) { this.pickups.splice(i, 1); continue; }
      if (p.spawnT <= 0 && U.dist2(p.x, p.y, this.player.x, this.player.y) <= (this.player.radius + p.r + 3) ** 2) {
        p.apply(this.player);
        p.dead = true;
      }
    }
    this.pickups = this.pickups.filter(p => !p.dead);
    /* 定期刷补给 */
    if (this.state === 'playing' && Math.random() < dt * 0.06 && this.pickups.length < 3) {
      const type = Math.random() < 0.6 ? 'health' : 'ammo';
      this.pickups.push(new Pickup(type, U.rand(100, this.map.W - 100), U.rand(200, this.map.H - 150)));
    }
  }

  updateBurnZones(dt) {
    Combat.tickBurnZones(this, dt, () => [this.player, this.boss, ...this.minions]);
  }

  updateHeavenFalls(dt) {
    Combat.tickHeavenFalls(this, dt, this.player, 30, 70);
  }

  /* ---------- 主循环 ---------- */
  update(dt) {
    if (this.slowmoT > 0) { this.slowmoT -= dt; dt *= 0.35; }
    if (this.shakeT > 0) this.shakeT -= dt;
    this.time += dt;
    this.bossT += dt;

    switch (this.state) {
      case 'countdown':
        this.countdown -= dt;
        if (this.countdown <= 0) { this.countdown = 0; this.state = 'playing'; SFX.go(); }
        break;
      case 'playing':
        this.readPlayer();
        this.updateBoss(dt);
        for (const mn of this.minions) if (mn.ai) mn.ai.update(dt);
        break;
      case 'over':
        this.overT -= dt;
        if (this.overT <= 0) {
          this.state = 'ended';
          UI.showBossResult(this);
        }
        break;
    }

    this.player.update(dt, this);
    this.boss.update(dt, this);
    for (const mn of this.minions) mn.update(dt, this);
    for (const b of this.bullets) b.update(dt, this);
    this.collideBullets();
    this.collideRobots();
    this.updatePickups(dt);
    this.updateBurnZones(dt);
    this.updateHeavenFalls(dt);
    FX.update(dt);
    this.minions = this.minions.filter(m => !m.dead);

    /* 低血量警告 */
    if (this.state === 'playing' && this.player.hp / this.player.maxHp < 0.25) ScreenFX.setLowHp(true);
    else ScreenFX.setLowHp(false);
  }

  onPlayerDeath() {
    this.slowmoT = 0.55;
    this.shake(14);
    this.overT = 1.8;
    this.state = 'over';
  }

  /* Robot.die 回调 */
  onRobotDeath(robot) {
    if (robot === this.boss) this.onBossDeath();
    else if (robot === this.player) this.onPlayerDeath();
  }

  onBossDeath() {
    this.slowmoT = 0.9;
    this.shake(16);
    ScreenFX.flash('rgba(255,235,190,0.6)', 0.6);
    KillFeed.add('BOSS DOWN!', null, '#ffd43b');
    /* 多段爆炸 */
    for (let i = 0; i < 10; i++) {
      setTimeout(() => {
        /* 守卫：已进入新对局则不再播放旧 Boss 爆炸（防跨局污染） */
        if (typeof UI !== 'undefined' && UI.game !== this) return;
        const x = this.boss.x + U.rand(-90, 90);
        const y = this.boss.y + U.rand(-90, 90);
        Particles.spawn(x, y, { count: 30, colors: ['#ffd166', '#ff6b6b', '#fff'], speed: 320, life: 0.8, size: 5, gravity: 100 });
        Shockwaves.add(x, y, 80, 'rgba(255,180,100,0.9)');
        SFX.explode(true);
      }, i * 180);
    }
    this.overT = 3.2;
    this.state = 'over';
  }

  /* ---------- 渲染 ---------- */
  render(ctx, t) {
    ctx.save();
    if (this.shakeT > 0) ctx.translate(U.rand(-this.shakeT, this.shakeT) * 1.1, U.rand(-this.shakeT, this.shakeT) * 1.1);

    this.map.draw(ctx);
    this.drawBurnZones(ctx);
    this.drawHeavenFalls(ctx);
    this.drawFrostSpikes(ctx);
    this.drawStormMarks(ctx);
    for (const p of this.pickups) p.draw(ctx);
    for (const mn of this.minions) mn.draw(ctx, t);
    for (const b of this.bullets) b.draw(ctx);
    if (!this.boss.dead) this.boss.draw(ctx, t);
    if (!this.player.dead) this.player.draw(ctx, t);
    FX.draw(ctx);
    ctx.restore();

    FX.drawScreen(ctx, t);
    UI.drawBossHUD(this, ctx, t);
  }

  drawBurnZones(ctx) {
    Combat.drawBurnZones(ctx, this.burnZones);
  }

  drawHeavenFalls(ctx) {
    Combat.drawHeavenFalls(ctx, this.heavenFalls);
  }
}
