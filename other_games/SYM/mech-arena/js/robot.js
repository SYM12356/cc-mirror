'use strict';
/* ============================================================
 * 机器人（机甲）：移动 / 武器 / 技能 / 受击 / 绘制
 * ============================================================ */

class Robot {
  constructor(mechId, playerKey, opts = {}) {
    this.mech = CFG.MECHS[mechId];
    this.playerKey = playerKey;          // 'p1' | 'p2' | 'ai'
    this.bonus = opts.bonus || null;     // 养成加成（玩家机甲有，AI 无）
    this.level = opts.level || null;     // 显示用等级
    this.name = opts.name || this.mech.name;
    this.color = opts.color || this.mech.color;
    this.darkColor = opts.colorDark || this.mech.colorDark;
    /* 机甲皮肤（玩家装备，AI 用默认） */
    if (opts.skin) {
      this.color = opts.skin.color;
      this.darkColor = opts.skin.dark;
    }
    this.x = opts.x; this.y = opts.y;
    this.vx = 0; this.vy = 0;
    this.maxHp = Math.round(this.mech.hp * (this.bonus ? this.bonus.hpMult : 1));
    this.hp = this.maxHp;
    this.radius = this.mech.radius;
    this.aim = opts.aim || 0;
    this.dead = false;

    /* 武器（loadout 按槽位自由配置，槽位数量取决于底盘）
     * 防御性规范化：长度对齐槽位、无效武器回退 */
    const slots = this.mech.slots;
    const raw = (opts.loadout && opts.loadout.length) ? opts.loadout : ['minigun', 'grenade'];
    this.loadout = slots.map((type, i) => {
      const w = raw[i];
      return CFG.WEAPONS[w] ? w : (type === 'sub' ? 'grenade' : 'minigun');
    });
    this.slotIndex = 0;                  // 当前武器槽索引
    this.subAmmo = CFG.SUB_AMMO_START;   // 副槽共享弹药
    this.subAmmoMax = CFG.SUB_AMMO_MAX * this.mech.slots.filter(s => s === 'sub').length;

    /* 插件 */
    this.plug = opts.plug || null;
    this.drone = (this.plug === 'drone') ? new Drone(this) : null;
    this.repairT = 0;
    if (this.plug === 'ammo') {
      this.subAmmoMax += 10;
      this.subAmmo = this.subAmmoMax;    // 弹药背包：开局全满
    }

    /* 专属大招能量（能量核心道具：开局直接充满） */
    this.ulti = 0;
    this.ultiMax = 100;
    if (this.playerKey === 'p1' && Progress.consumeUltiCharge()) {
      this.ulti = this.ultiMax;
      Floaters.add(this.x, this.y - this.radius - 20, '⚡ 能量核心已启动', '#ffd43b', 15);
    }
    this.ultiActive = 0;                 // 大招持续计时（壁垒）
    this.ultiPulseT = 0;
    this.scoutDashLeft = 0;              // 幻影连击剩余段数
    this.scoutDashT = 0;
    this.cool = 0;                       // 开火冷却
    this.heat = 0;                       // 过热条
    this.overheated = false;

    /* 负面状态 */
    this.slowT = 0;                      // 减速剩余
    this.dotT = 0;                       // 中毒剩余
    this.dotDps = 0;                     // 中毒每秒伤害

    /* 精英怪（生存模式） */
    this.elite = !!opts.elite;
    this.speedMult = opts.speedMult || 1;

    /* 底盘被动 */
    const p = this.mech.passive || {};
    this.passiveDmgReduce = p.type === 'dmgReduce' ? p.value : 0;
    this.passiveSpeedUp = p.type === 'speedUp' ? p.value : 0;
    this.passiveCdReduce = p.type === 'cdReduce' ? p.value : 0;
    this.passiveDmgUp = p.type === 'dmgUp' ? p.value : 0;
    this.passiveRegen = p.type === 'regen' ? p.value : 0;    // 纳米再生：每 2.5s 回血
    this.regenT = 0;

    /* 技能 */
    this.skillId = this.mech.skill;
    this.skillCool = 0;
    this.skillActive = 0;                // 技能持续时间剩余
    this.shieldCharge = 0;               // 道具护盾核心给的额外护盾
    this.stunT = 0;
    this.chargingNuke = 0;               // 湮灭炮蓄力剩余秒

    /* 状态 */
    this.boostT = 0;
    this.invulnT = 0;
    this.hitFlash = 0;
    this.muzzleT = 0;
    this.dashTrail = [];
    this.thrustAcc = 0;
    this.moveX = 0; this.moveY = 0;      // 由输入或 AI 写入
    this.fireHeld = false;
    this.aimOverride = null;             // AI 直接指定炮塔角度

    /* 胜负统计 */
    this.kills = 0;

    /* 连杀奖励：3/5/8 连杀触发临时增益，持续 10 秒，死亡清零 */
    this.killStreak = 0;
    this.streakTier = 0;      // 0=无 1=伤害+15% 2=+移速10% 3=+技能CD-20%
    this.streakT = 0;         // 增益剩余秒
  }

  get speed() {
    let s = this.mech.speed;
    if (this.boostT > 0) s *= 1.45;
    if (this.bonus) s *= this.bonus.speedMult;
    if (this.passiveSpeedUp) s *= 1 + this.passiveSpeedUp;
    if (this.plug === 'engine') s *= 1.10;   // 急速引擎插件
    if (this.speedMult !== 1) s *= this.speedMult;   // 精英怪倍率
    if (this.slowT > 0) s *= 0.65;           // 冰霜减速
    if (this.streakT > 0 && this.streakTier >= 2) s *= 1.10;   // 连杀奖励：移速 +10%
    return s;
  }

  get skillCfg() { return CFG.SKILLS[this.skillId]; }

  get isStunned() { return this.stunT > 0; }
  get isCharging() { return this.chargingNuke > 0; }

  /* 当前槽位类型：'main'（无限弹药）| 'sub'（消耗弹药） */
  get slotType() { return this.mech.slots[this.slotIndex] || 'main'; }

  heal(v) {
    this.hp = Math.min(this.maxHp, this.hp + v);
  }

  /* ---------- 每帧更新 ---------- */
  update(dt, game) {
    if (this.dead) return;      // 死亡后停止一切逻辑（防死尸开火/移动）
    /* 计时器 */
    if (this.cool > 0) this.cool -= dt;
    if (this.skillCool > 0) this.skillCool -= dt;
    if (this.skillActive > 0) this.skillActive -= dt;
    if (this.streakT > 0) {
      this.streakT -= dt;
      if (this.streakT <= 0) { this.streakT = 0; this.streakTier = 0; }   // 增益到期
    }
    if (this.stunT > 0) this.stunT -= dt;
    if (this.boostT > 0) this.boostT -= dt;
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.muzzleT > 0) this.muzzleT -= dt;

    /* 负面状态：冰霜减速 & 毒针 DoT */
    if (this.slowT > 0) this.slowT -= dt;
    if (this.dotT > 0 && game && game.state === 'playing') {
      this.dotT -= dt;
      this.hp -= this.dotDps * dt;
      if (Math.random() < dt * 22) {
        Particles.spawn(this.x + U.rand(-9, 9), this.y + U.rand(-9, 9),
          { count: 1, colors: ['#8ce99a', '#b2f2bb'], speed: 26, life: 0.5, size: 2.5 });
      }
      if (this.hp <= 0 && !this.dead) {
        this.hp = 0;
        this.die(game, null);
      }
    }

    /* 插件：维修核心自动回血 */
    if (this.plug === 'repair' && this.hp < this.maxHp) {
      this.repairT -= dt;
      if (this.repairT <= 0) {
        this.repairT = 5;
        this.hp = Math.min(this.maxHp, this.hp + 5);
        Particles.spawn(this.x, this.y, { count: 5, angle: -Math.PI / 2, spread: 1.4, speed: 60, life: 0.6, size: 2.5, colors: ['#51cf66', '#b2f2bb'], gravity: -60 });
      }
    }

    /* 底盘被动：纳米再生（守卫者） */
    if (this.passiveRegen > 0 && this.hp < this.maxHp) {
      this.regenT -= dt;
      if (this.regenT <= 0) {
        this.regenT = 2.5;
        this.hp = Math.min(this.maxHp, this.hp + this.passiveRegen);
        Particles.spawn(this.x, this.y, { count: 3, angle: -Math.PI / 2, spread: 1.2, speed: 50, life: 0.5, size: 2, colors: ['#b197fc', '#e5dbff'], gravity: -50 });
      }
    }

    /* 插件：无人机 */
    if (this.drone) this.drone.update(dt, game);

    /* 大招持续效果：终极壁垒（无敌 + 脉冲伤害） / 圣盾领域（持续回血） */
    if (this.ultiActive > 0) {
      this.ultiActive -= dt;
      if (this.mech.id === 'guardian') {
        /* 圣盾领域：每 0.5s 回血 + 净化 */
        this.ultiPulseT -= dt;
        if (this.ultiPulseT <= 0) {
          this.ultiPulseT = 0.5;
          this.heal(6);
          this.slowT = 0; this.dotT = 0;
          Shockwaves.add(this.x, this.y, 120, 'rgba(177,151,252,0.6)');
          Particles.spawn(this.x, this.y, { count: 8, angle: U.rand(0, Math.PI * 2), spread: Math.PI * 2, speed: 90, life: 0.6, size: 3, colors: ['#b197fc', '#e5dbff'], gravity: -40 });
        }
      } else {
        this.invulnT = Math.max(this.invulnT, 0.06);
        this.ultiPulseT -= dt;
        if (this.ultiPulseT <= 0) {
          this.ultiPulseT = 0.5;
          Shockwaves.add(this.x, this.y, 170, 'rgba(90,170,255,0.5)');
          const t = game.enemyOf(this);
          if (t && !t.dead && U.dist(this.x, this.y, t.x, t.y) < 180) {
            t.takeDamage(8, U.angleTo(t.x, t.y, this.x, this.y), 40, game, this);
            t.applyStatus(0.35, 0.5);
          }
        }
      }
      if (Math.random() < dt * 26) {
        Particles.spawn(this.x + U.rand(-20, 20), this.y + U.rand(-20, 20),
          { count: 1, angle: U.rand(0, Math.PI * 2), speed: 70, life: 0.4, size: 3, colors: this.mech.id === 'guardian' ? ['#b197fc', '#ffffff'] : ['#4dabf7', '#ffffff'] });
      }
    }

    /* 大招持续效果：幻影连击（4 段突进） */
    if (this.scoutDashLeft > 0) {
      this.scoutDashT -= dt;
      this.invulnT = Math.max(this.invulnT, 0.05);
      if (this.scoutDashT <= 0) {
        this.scoutDashT = 0.16;
        this.scoutDashLeft--;
        this.vx = Math.cos(this.aim) * 1150;
        this.vy = Math.sin(this.aim) * 1150;
        this.invulnT = Math.max(this.invulnT, 0.3);
        Shockwaves.add(this.x, this.y, 40, 'rgba(140,230,220,0.8)');
        for (let i = 0; i < 10; i++) {
          Particles.spawn(this.x, this.y, { count: 1, angle: this.aim + Math.PI, spread: 0.5, speed: 260, life: 0.3, size: 3, colors: ['#63e6be', '#ffffff'], shape: 'spark' });
        }
      }
    }

    /* 低血量：机甲受损冒烟 */
    if (this.hp / this.maxHp < 0.3 && !this.dead && Math.random() < dt * 3.5) {
      Particles.spawn(this.x + U.rand(-7, 7), this.y - this.radius,
        { count: 1, angle: -Math.PI / 2, spread: 0.4, speed: 40, life: 0.8, size: 5,
          colors: ['#495057', '#868e96'], shape: 'smoke', gravity: -25, grow: 6 });
    }

    /* 过热恢复：冷却 0.9 秒后归零 */
    if (this.overheated) {
      this.heatCoolT = (this.heatCoolT || 0) + dt;
      if (this.heatCoolT > 0.9) {
        this.overheated = false;
        this.heat = 0;
        this.heatCoolT = 0;
      }
    } else if (this.heat > 0) {
      this.heat = Math.max(0, this.heat - 22 * dt);
    }

    /* 移动：眩晕/蓄力时无法控制 */
    const canMove = !this.isStunned && !this.isCharging;
    if (canMove) {
      const accel = 6.5;
      const tx = this.moveX * this.speed;
      const ty = this.moveY * this.speed;
      const k = Math.min(1, accel * dt);
      this.vx += (tx - this.vx) * k;
      this.vy += (ty - this.vy) * k;
    } else {
      this.vx *= Math.pow(0.1, dt);
      this.vy *= Math.pow(0.1, dt);
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    /* 地图碰撞 */
    const pos = game.map.resolveCircle(this.x, this.y, this.radius);
    this.x = pos.x; this.y = pos.y;

    /* 冲刺残影 */
    if (this.skillId === 'dash' && this.skillActive > 0) {
      this.dashTrail.push({ x: this.x, y: this.y, life: 0.3 });
    }
    for (let i = this.dashTrail.length - 1; i >= 0; i--) {
      this.dashTrail[i].life -= dt;
      if (this.dashTrail[i].life <= 0) this.dashTrail.splice(i, 1);
    }

    /* 推进器粒子 */
    const moving = Math.hypot(this.vx, this.vy) > 30;
    if (moving && canMove) {
      this.thrustAcc += dt;
      if (this.thrustAcc > 0.045) {
        this.thrustAcc = 0;
        const back = Math.atan2(this.vy, this.vx) + Math.PI;
        Particles.spawn(
          this.x - Math.cos(this.aim) * this.radius * 0.7,
          this.y - Math.sin(this.aim) * this.radius * 0.7,
          { count: 1, angle: back, spread: 0.7, speed: 90, life: 0.3, size: 3,
            colors: [this.color, '#8fb8ff'], glow: true }
        );
      }
    }

    /* 炮塔朝向（AI 可覆盖） */
    if (this.aimOverride !== null) {
      this.aim = U.angleLerp(this.aim, this.aimOverride, Math.min(1, 14 * dt));
    }

    /* 持续开火 */
    if (this.fireHeld && canMove && !this.overheated) {
      const w = this.currentWeapon();
      if (w) this.tryFire(game);
    }

    /* 湮灭炮蓄力完成 */
    if (this.chargingNuke > 0) {
      this.chargingNuke -= dt;
      const sc = this.skillCfg;
      if (this.chargingNuke <= 0) {
        this.chargingNuke = 0;
        this.detonateNuke(game, sc);
      }
    }
  }

  currentWeapon() {
    return CFG.WEAPONS[this.loadout[this.slotIndex]];
  }

  /* 命中状态：冰霜减速 / 毒针 DoT */
  applyStatus(slow, slowDur, dot) {
    if (slow) this.slowT = Math.max(this.slowT, slowDur);
    if (dot) {
      this.dotDps = Math.max(this.dotDps, dot.dps);
      this.dotT = Math.max(this.dotT, dot.dur);
    }
  }

  /* ---------- 开火 ---------- */
  tryFire(game) {
    if (this.cool > 0 || this.overheated || this.isStunned || this.isCharging) return false;

    const w = this.currentWeapon();
    if (!w) return false;

    /* 副槽弹药 */
    if (this.slotType === 'sub') {
      if (this.subAmmo <= 0) {
        /* 弹药耗尽自动切到下一个主槽 */
        this.switchToMainSlot();
        SFX.tone(200, 0.1, 'square', 0.15, 120);
        return false;
      }
      this.subAmmo--;
    }

    this.cool = w.rate;

    /* 近战武器（链锯）：对前方扇形范围内敌人直接造成伤害 */
    if (w.melee) {
      this.muzzleT = 0.06;
      this.muzzleFx(w);
      SFX.shoot(this.loadout[this.slotIndex]);
      const hitR = w.range || 90;
      const t = game.enemyOf(this);
      if (t && !t.dead) {
        const d = U.dist(this.x, this.y, t.x, t.y);
        if (d <= hitR + t.radius) {
          const angTo = U.angleTo(this.x, this.y, t.x, t.y);
          /* 角度差：|aim - angTo| 归一化到 [-π, π] */
          let diff = Math.abs(this.aim - angTo) % (Math.PI * 2);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (diff < 1.1) {   // 前方约 ±63° 扇形判定
            t.takeDamage(w.dmg, angTo, w.knock, game, this);
            /* 链锯切割火花 */
            Particles.spawn(t.x, t.y, { count: 4, angle: angTo, spread: 0.9, speed: 240, life: 0.22, size: 2.5, colors: ['#ffa94d', '#ffd43b', '#fff'], shape: 'spark' });
            if (Math.random() < 0.5) SFX.tone(220 + U.rand(0, 160), 0.06, 'sawtooth', 0.1, 260);
          }
        }
      }
      /* 链锯自身旋转粒子（视觉） */
      Particles.spawn(this.x + Math.cos(this.aim) * (this.radius + 30), this.y + Math.sin(this.aim) * (this.radius + 30),
        { count: 2, angle: this.aim + U.rand(-0.8, 0.8), spread: 0.4, speed: 320, life: 0.16, size: 2, colors: ['#ffe066', '#ffa94d'], shape: 'spark' });
      return true;
    }

    /* 过热累积（机枪类） */
    if (w.heatPerShot) {
      this.heat += w.heatPerShot;
      if (this.heat >= 100) {
        this.overheated = true;
        this.heat = 100;
        this.heatCoolT = 0;
        SFX.tone(90, 0.4, 'sawtooth', 0.2, 40);
        Floaters.add(this.x, this.y - this.radius - 14, '过热!', '#ff8787', 13);
      }
    }

    const shots = w.pellets || 1;
    for (let i = 0; i < shots; i++) {
      const spread = U.rand(-w.spread, w.spread);
      const a = this.aim + spread;
      game.spawnBullet(this, a, w);
    }

    /* 枪口闪光与后坐 */
    this.muzzleT = 0.06;
    const knockBack = w.knock ? -w.knock * 0.25 : 0;
    this.vx += Math.cos(this.aim) * knockBack * (shots > 1 ? 0.6 : 1);
    this.vy += Math.sin(this.aim) * knockBack * (shots > 1 ? 0.6 : 1);

    this.muzzleFx(w);
    SFX.shoot(this.loadout[this.slotIndex]);
    return true;
  }

  /* 武器专属枪口粒子特效 */
  muzzleFx(w) {
    const mx = this.x + Math.cos(this.aim) * (this.radius + 14);
    const my = this.y + Math.sin(this.aim) * (this.radius + 14);
    const back = this.aim + Math.PI;

    if (w.fire) {
      /* 火焰喷射器：喷出火舌 */
      Particles.spawn(mx, my, { count: 4, angle: this.aim, spread: 0.35, speed: 300, life: 0.28, size: 5.5, colors: ['#ff922b', '#ffd43b', '#ff6b6b'], grow: -10 });
    } else if (w.slow) {
      /* 冰霜枪：冰晶 */
      Particles.spawn(mx, my, { count: 4, angle: this.aim, spread: 0.25, speed: 210, life: 0.4, size: 3, colors: ['#66d9e8', '#c5f6fa'], shape: 'rect', spin: 8 });
    } else if (w.dot) {
      /* 毒针枪：毒雾 */
      Particles.spawn(mx, my, { count: 3, angle: this.aim, spread: 0.2, speed: 200, life: 0.5, size: 3, colors: ['#8ce99a', '#69db7c'], grow: 6 });
    } else if (w.tracer) {
      /* 狙击枪：强光长曳光 */
      Particles.spawn(mx, my, { count: 7, angle: this.aim, spread: 0.07, speed: 340, life: 0.3, size: 2.5, colors: ['#e5dbff', '#ffffff'], shape: 'spark' });
      Shockwaves.add(mx, my, 26, 'rgba(230,220,255,0.9)');
    } else if (w.homing) {
      /* 导弹：发射烟 */
      Particles.spawn(mx, my, { count: 3, angle: back, spread: 0.5, speed: 130, life: 0.4, size: 4, colors: ['#ffa94d', '#ffd8a8'] });
      Particles.spawn(mx, my, { count: 2, angle: back, spread: 0.4, speed: 70, life: 0.7, size: 6, colors: ['#868e96', '#adb5bd'], shape: 'smoke', gravity: -30, grow: 10 });
    } else if (w.pellets) {
      /* 霰弹：火花+烟 */
      Particles.spawn(mx, my, { count: 6, angle: this.aim, spread: 0.55, speed: 200, life: 0.22, size: 2.5, colors: ['#ffd166', '#ffe8cc'], shape: 'spark' });
      Particles.spawn(mx, my, { count: 4, angle: back, spread: 0.7, speed: 90, life: 0.5, size: 5, colors: ['#adb5bd', '#ced4da'], shape: 'smoke', gravity: -40, grow: 8 });
    } else if (w.heatPerShot) {
      /* 机枪：弹壳 + 烟 */
      Particles.spawn(mx, my, { count: 1, angle: back + U.rand(-0.4, 0.4), spread: 0.15, speed: 280, life: 0.55, size: 2.6, colors: ['#ffd166', '#fcc419'], shape: 'rect', spin: 16, gravity: 520 });
      Particles.spawn(mx, my, { count: 1, angle: back, spread: 0.55, speed: 75, life: 0.4, size: 4, colors: ['#868e96', '#adb5bd'], shape: 'smoke', gravity: -30, grow: 7 });
    } else {
      /* 激光/等离子：能量火花 */
      Particles.spawn(mx, my, { count: 3, angle: this.aim, spread: 0.12, speed: 230, life: 0.2, size: 2.5, colors: [w.color, '#ffffff'], shape: 'spark' });
      if (w.aoe) Shockwaves.add(mx, my, 20, 'rgba(180,150,255,0.8)');
    }
  }

  switchSlot() {
    this.slotIndex = (this.slotIndex + 1) % this.loadout.length;
    this.cool = Math.max(this.cool, 0.12);
    SFX.tone(520, 0.08, 'square', 0.12);
    return true;
  }

  /* 切到下一个主槽（弹药耗尽时） */
  switchToMainSlot() {
    for (let i = 1; i <= this.loadout.length; i++) {
      const idx = (this.slotIndex + i) % this.loadout.length;
      if (this.mech.slots[idx] === 'main') {
        this.slotIndex = idx;
        return;
      }
    }
    this.slotIndex = (this.slotIndex + 1) % this.loadout.length;
  }

  /* ---------- 技能 ---------- */
  useSkill(game) {
    if (this.skillCool > 0 || this.isStunned || this.isCharging) return false;
    const s = this.skillCfg;
    let cdMult = (this.bonus ? this.bonus.cdMult : 1) * (1 - this.passiveCdReduce);
    if (this.streakT > 0 && this.streakTier >= 3) cdMult *= 0.8;   // 连杀奖励：技能 CD -20%
    this.skillCool = s.cd * cdMult;
    SFX.skill(this.skillId);

    switch (this.skillId) {
      case 'dash': {
        /* 沿当前移动方向冲刺；无输入则沿炮塔方向 */
        let dx = this.moveX, dy = this.moveY;
        const ml = Math.hypot(dx, dy);
        if (ml < 0.1) { dx = Math.cos(this.aim); dy = Math.sin(this.aim); }
        else { dx /= ml; dy /= ml; }
        this.vx = dx * s.impulse;
        this.vy = dy * s.impulse;
        this.skillActive = s.dur;
        this.invulnT = Math.max(this.invulnT, s.dur);
        for (let i = 0; i < 14; i++) {
          Particles.spawn(this.x, this.y, { count: 1, angle: Math.atan2(dy, dx) + Math.PI, spread: 0.6, speed: 220, life: 0.35, size: 3.5, colors: [s.color, '#e0fbff'] });
        }
        Particles.spawn(this.x, this.y, { count: 8, angle: Math.atan2(dy, dx) + Math.PI, spread: 0.5, speed: 300, life: 0.3, size: 2, colors: ['#ffffff', s.color], shape: 'spark' });
        break;
      }
      case 'shield':
        this.skillActive = s.dur;
        Shockwaves.add(this.x, this.y, 60, 'rgba(90,180,255,0.9)');
        break;
      case 'emp': {
        Shockwaves.add(this.x, this.y, s.radius, 'rgba(180,140,255,0.95)');
        Shockwaves.add(this.x, this.y, s.radius * 1.6, 'rgba(200,170,255,0.45)');
        Particles.spawn(this.x, this.y, { count: 26, colors: ['#b197fc', '#e5dbff'], speed: 320, life: 0.55, size: 3.5 });
        Particles.spawn(this.x, this.y, { count: 14, colors: ['#ffffff', '#b197fc'], speed: 420, life: 0.35, size: 2, shape: 'spark' });
        game.empStun(this, s.radius, s.stun);
        break;
      }
      case 'nuke':
        this.chargingNuke = s.charge;
        this.skillActive = s.charge;
        break;
      case 'heal': {
        /* 治疗波：立即回血 + 清除负面状态 */
        this.heal(s.heal);
        this.slowT = 0;
        this.dotT = 0;
        this.dotDps = 0;
        this.stunT = 0;
        Shockwaves.add(this.x, this.y, 90, 'rgba(177,151,252,0.9)');
        Particles.spawn(this.x, this.y, { count: 22, angle: -Math.PI / 2, spread: 1.6, speed: 130, life: 0.7, size: 3.5, colors: ['#b197fc', '#e5dbff', '#ffffff'], gravity: -80, grow: -4 });
        Floaters.add(this.x, this.y - this.radius - 16, '+' + s.heal, '#b197fc', 16);
        break;
      }
    }
    return true;
  }

  detonateNuke(game, s) {
    Shockwaves.add(this.x, this.y, s.radius * 1.5, 'rgba(255,120,90,1)');
    Shockwaves.add(this.x, this.y, s.radius * 2.4, 'rgba(255,200,120,0.5)');
    Particles.spawn(this.x, this.y, { count: 60, colors: ['#ff6b6b', '#ffa94d', '#ffe066', '#fff'], speed: 420, life: 0.9, size: 5, gravity: 60 });
    Particles.spawn(this.x, this.y, { count: 24, colors: ['#f03e3e', '#ffa94d'], speed: 700, life: 0.4, size: 6 });
    Particles.spawn(this.x, this.y, { count: 18, colors: ['#495057', '#343a40'], speed: 90, life: 1.8, size: 12, gravity: -28, shape: 'smoke', grow: 20 });
    Particles.spawn(this.x, this.y, { count: 30, colors: ['#ffd166', '#ffffff'], speed: 600, life: 0.45, size: 2.5, shape: 'spark' });
    game.areaDamage(this.x, this.y, s.radius, s.dmg, this, 400, true);
    game.areaDamage(this.x, this.y, s.radius, s.selfDmg, this, 0, false, false);
    game.shake(14);
    SFX.explode(true);
  }

  /* 命中敌人时充能（由 game 调用） */
  addUlti(n) {
    if (this.dead) return;
    let v = n;
    if (this.plug === 'battery') v *= 1.4;  // 能量电池插件
    this.ulti = Math.min(this.ultiMax, this.ulti + v);
  }

  /* ---------- 专属大招 ---------- */
  get ultiCfg() { return CFG.ULTIS[this.mech.id]; }

  useUltimate(game) {
    if (this.ulti < this.ultiMax || this.dead || this.isStunned) return false;
    const u = this.ultiCfg;
    this.ulti = 0;
    if (this.playerKey === 'p1') Progress.recordUlti();   // 只统计玩家
    SFX.skill('nuke');
    Floaters.add(this.x, this.y - this.radius - 18, u.name, u.color, 17);
    /* 大招氛围：全屏色闪 + 时间凝滞 */
    ScreenFX.flash(u.color, 0.26);
    game.slowmoT = Math.max(game.slowmoT, 0.22);

    switch (this.mech.id) {
      case 'tank': {
        /* 终极壁垒：5 秒无敌 + 脉冲伤害 */
        this.ultiActive = 5;
        this.invulnT = 5.2;
        Shockwaves.add(this.x, this.y, 90, 'rgba(90,170,255,1)');
        Shockwaves.add(this.x, this.y, 170, 'rgba(90,170,255,0.5)');
        Particles.spawn(this.x, this.y, { count: 40, colors: ['#4dabf7', '#ffffff'], speed: 300, life: 0.8, size: 4 });
        break;
      }
      case 'scout': {
        /* 幻影连击：4 段突进 */
        this.scoutDashLeft = 4;
        this.scoutDashT = 0;
        this.invulnT = Math.max(this.invulnT, 1.0);
        break;
      }
      case 'assault': {
        /* 雷霆审判：大范围 EMP */
        Shockwaves.add(this.x, this.y, 420, 'rgba(255,200,120,1)');
        Shockwaves.add(this.x, this.y, 620, 'rgba(255,160,80,0.4)');
        Particles.spawn(this.x, this.y, { count: 50, colors: ['#ffa94d', '#ffe066', '#ffffff'], speed: 420, life: 0.7, size: 4, shape: 'spark' });
        game.areaDamage(this.x, this.y, 400, 60, this, 300);
        game.empStun(this, 400, 3);
        game.shake(12);
        break;
      }
      case 'artillery': {
        /* 天罚轰炸：8 枚导弹落向目标区域 */
        const t = game.enemyOf(this);
        const tx = t ? t.x + t.vx * 0.35 : this.x;
        const ty = t ? t.y + t.vy * 0.35 : this.y;
        for (let i = 0; i < 8; i++) {
          game.heavenFalls.push({ x: tx + U.rand(-130, 130), y: ty + U.rand(-130, 130), delay: 0.45 + i * 0.15, caster: this });
        }
        break;
      }
      case 'guardian': {
        /* 圣盾领域：6 秒持续回血 + 减伤光环 */
        this.ultiActive = 6;
        this.shieldCharge = Math.max(this.shieldCharge, 60);
        Shockwaves.add(this.x, this.y, 130, 'rgba(177,151,252,1)');
        Shockwaves.add(this.x, this.y, 240, 'rgba(177,151,252,0.45)');
        Particles.spawn(this.x, this.y, { count: 40, angle: -Math.PI / 2, spread: Math.PI * 2, speed: 260, life: 0.9, size: 4, colors: ['#b197fc', '#e5dbff', '#ffffff'], gravity: -60 });
        break;
      }
    }
    return true;
  }

  /* ---------- 受击 ---------- */
  takeDamage(amount, angle, knock, game, from) {
    if (this.invulnT > 0 || this.dead) return;
    if (game && game.state !== 'playing') return;

    /* 护盾技能减伤 */
    let dmg = amount;
    if (this.passiveDmgReduce) dmg *= 1 - this.passiveDmgReduce;
    if (this.plug === 'armor') dmg *= 0.90;   // 反应装甲插件
    if (this.skillId === 'shield' && this.skillActive > 0) {
      dmg *= 1 - CFG.SKILLS.shield.absorb;
    }
    /* 道具护盾核心吸收 */
    if (this.shieldCharge > 0) {
      const absorb = Math.min(this.shieldCharge, dmg);
      this.shieldCharge -= absorb;
      dmg -= absorb;
      Particles.spawn(this.x, this.y, { count: 4, colors: ['#748ffc', '#dbe4ff'], speed: 120, life: 0.3, size: 2.5 });
    }

    this.hp -= dmg;
    this.hitFlash = 0.12;
    this.addUlti(5);                       // 受击充能
    if (this.playerKey !== 'ai') ScreenFX.hurt();   // 玩家受击屏幕红晕

    /* 击退 */
    if (knock > 0) {
      this.vx += Math.cos(angle) * knock * 0.55;
      this.vy += Math.sin(angle) * knock * 0.55;
    }

    Floaters.add(this.x, this.y - this.radius - 8, '-' + Math.round(dmg), '#ff6b6b', 15);
    Particles.spawn(this.x, this.y, { count: 7, colors: [this.color, '#fff', '#ff8787'], speed: 170, life: 0.35, size: 3 });
    Particles.spawn(this.x, this.y, { count: 5, colors: ['#ffffff', this.color], speed: 280, life: 0.22, size: 2, shape: 'spark' });
    SFX.robotHit();

    if (this.hp <= 0) {
      this.hp = 0;
      this.die(game, from);
    }
  }

  die(game, from) {
    if (this.dead) return;
    this.dead = true;
    /* 死亡清零连杀奖励 */
    this.killStreak = 0;
    this.streakTier = 0;
    this.streakT = 0;
    if (from && from !== this) {
      from.kills++;
      from.addUlti(30);                    // 击杀充能
      /* 连杀奖励：3/5/8 连杀触发 3 档增益（10 秒，死亡清零） */
      from.killStreak++;
      const newTier = from.killStreak >= 8 ? 3 : from.killStreak >= 5 ? 2 : from.killStreak >= 3 ? 1 : 0;
      if (newTier > from.streakTier) {
        from.streakTier = newTier;
        const names = { 1: '3 连杀！伤害 +15%', 2: '5 连杀！移速 +10%', 3: '8 连杀！技能冷却 -20%' };
        KillFeed.add(names[newTier], from.killStreak + ' KILLS！', '#ffd43b');
        Floaters.add(from.x, from.y - from.radius - 26, names[newTier].split('！')[0] + '🔥', '#ffd43b', 16);
        Particles.spawn(from.x, from.y, { count: 14, angle: U.rand(0, Math.PI * 2), spread: Math.PI * 2, speed: 260, life: 0.7, size: 3.5, colors: ['#ffd43b', '#ff922b', '#fff3bf'], shape: 'spark', gravity: 120 });
        ScreenFX.flash('rgba(255,200,60,0.35)', 0.4);
        SFX.skill('emp');
      }
      from.streakT = 10;                   // 刷新增益持续
      /* 击杀横幅 + 全屏闪光 */
      KillFeed.add('KILL!', from.kills > 1 ? from.kills + ' KILLS！' : null, from.color);
      ScreenFX.flash('rgba(255,235,190,0.5)', 0.5);
      if (this.playerKey !== 'ai') ScreenFX.hurt();
    }
    /* 大爆炸：火球 + 火花 + 烟柱 + 残骸 */
    Particles.spawn(this.x, this.y, { count: 46, colors: [this.color, '#ffd166', '#ff6b6b', '#fff'], speed: 380, life: 1.0, size: 5, gravity: 200 });
    Particles.spawn(this.x, this.y, { count: 16, colors: ['#ffd166', '#fff3b0'], speed: 540, life: 0.4, size: 2.5, shape: 'spark' });
    Particles.spawn(this.x, this.y, { count: 9, colors: ['#495057', '#343a40', '#868e96'], speed: 75, life: 1.6, size: 10, gravity: -30, shape: 'smoke', grow: 18 });
    Particles.spawn(this.x, this.y, { count: 12, colors: [this.darkColor, '#2b3550', '#fff'], speed: 330, life: 0.8, size: 3.6, shape: 'rect', spin: U.rand(-12, 12), gravity: 380 });
    Shockwaves.add(this.x, this.y, 90, 'rgba(255,200,120,1)');
    Shockwaves.add(this.x, this.y, 150, 'rgba(255,140,80,0.5)');
    game.shake(12);
    SFX.explode(true);
    game.onRobotDeath(this);
  }

  /* ---------- 绘制 ---------- */
  draw(ctx, t) {
    if (this.dead) return;

    /* 冲刺残影 */
    for (const d of this.dashTrail) {
      ctx.globalAlpha = (d.life / 0.3) * 0.45;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, this.radius * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const r = this.radius;
    const flash = this.hitFlash > 0;

    /* 阴影 */
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + r * 0.75, r * 0.95, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(this.x, this.y);

    /* 护盾光圈 */
    const hasShield = (this.skillId === 'shield' && this.skillActive > 0) || this.shieldCharge > 0;
    if (hasShield) {
      ctx.save();
      ctx.shadowColor = '#4dabf7';
      ctx.shadowBlur = FXQuality.shadow ? 16 : 0;
      ctx.strokeStyle = this.skillId === 'shield' && this.skillActive > 0
        ? 'rgba(120,200,255,0.85)' : 'rgba(130,150,255,0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, r + 6 + Math.sin(t * 5) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      /* 能量护盾技能：旋转六边形网格护罩 */
      if (this.skillId === 'shield' && this.skillActive > 0) {
        ctx.strokeStyle = 'rgba(130,205,255,0.32)';
        ctx.lineWidth = 1.5;
        for (let ring = 0; ring < 2; ring++) {
          const rr = r + 8 + ring * 11;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = t * 0.9 + i * (Math.PI / 3);
            const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
        /* 蜂窝连线 */
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = t * 0.9 + i * (Math.PI / 3);
          const px = Math.cos(a) * (r + 8), py = Math.sin(a) * (r + 8);
          ctx.moveTo(px, py);
          ctx.lineTo(px * 1.5, py * 1.5);
        }
        ctx.stroke();
      }
    }

    /* 大招能量充满：金色脉冲外圈 */
    if (this.ulti >= this.ultiMax) {
      const p = 0.5 + 0.5 * Math.sin(t * 7);
      ctx.strokeStyle = `rgba(255,212,59,${0.35 + 0.45 * p})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, r + 11 + p * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,212,59,${0.12 + 0.1 * p})`;
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 精英怪：金色铠甲描边 */
    if (this.elite) {
      const p = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.strokeStyle = `rgba(255,200,80,${0.5 + 0.4 * p})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    /* 眩晕标记 */
    if (this.isStunned) {
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + i * (Math.PI * 2 / 3);
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * (r + 9), Math.sin(a) * (r + 9));
      }
      ctx.stroke();
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 冰冻效果 */
    if (this.slowT > 0) {
      ctx.strokeStyle = 'rgba(140,235,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4 + Math.sin(t * 9) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#b3f0ff';
      for (let i = 0; i < 4; i++) {
        const a = t * 4 + i * (Math.PI * 2 / 4);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (r + 8), Math.sin(a) * (r + 8), 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* 中毒效果 */
    if (this.dotT > 0) {
      ctx.fillStyle = '#8ce99a';
      for (let i = 0; i < 3; i++) {
        const a = t * 3.5 + i * (Math.PI * 2 / 3);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (r + 7), Math.sin(a) * (r + 7), 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* 履带底盘 */
    ctx.fillStyle = flash ? '#fff' : this.darkColor;
    ctx.fillRect(-r - 2, -r * 0.55, r * 2 + 4, r * 1.1);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(-r - 2 + (i + 1) * r * 0.9, -r * 0.55, 4, r * 1.1);
    }
    /* 轮子 */
    ctx.fillStyle = 'rgba(230,240,255,0.8)';
    for (const wy of [-r * 0.4, r * 0.4]) {
      for (const wx of [-r * 0.6, r * 0.6]) {
        ctx.beginPath();
        ctx.arc(wx, wy, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* 炮管 */
    ctx.save();
    ctx.rotate(this.aim);
    ctx.fillStyle = flash ? '#fff' : '#2b3654';
    ctx.fillRect(0, -4.5, r + 14, 9);
    ctx.fillStyle = this.color;
    ctx.fillRect(r + 4, -3, 12, 6);
    /* 枪口闪光 */
    if (this.muzzleT > 0) {
      ctx.globalAlpha = this.muzzleT / 0.06;
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.arc(r + 16, 0, 6 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    /* 身体（带霓虹外发光，突出机器人） */
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = FXQuality.shadow ? 16 : 0;
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
    grad.addColorStop(0, flash ? '#ffffff' : this.color);
    grad.addColorStop(1, this.darkColor);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    /* 核心灯 */
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = FXQuality.shadow ? 10 : 0;
    ctx.fillStyle = '#eaf6ff';
    ctx.beginPath();
    ctx.arc(0, 0, 4.5 + Math.sin(t * 4) * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* 湮灭炮蓄力 */
    if (this.isCharging) {
      const p = 1 - this.chargingNuke / this.skillCfg.charge;
      ctx.strokeStyle = 'rgba(255,80,80,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 12, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,90,90,${0.25 + 0.3 * Math.sin(t * 20)})`;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 推进器喷焰 */
    if (Math.hypot(this.vx, this.vy) > 60 && !this.isStunned) {
      const back = Math.atan2(this.vy, this.vx) + Math.PI;
      ctx.fillStyle = 'rgba(140,190,255,0.5)';
      ctx.beginPath();
      ctx.arc(Math.cos(back) * (r + 5), Math.sin(back) * (r + 5), 4 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    /* 无敌闪烁（倒计时/冲刺中） */
    if (this.invulnT > 0 && Math.floor(t * 20) % 2 === 0) {
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    this.drawBars(ctx);
  }

  drawBars(ctx) {
    const bw = 48, bh = 5;
    const bx = this.x - bw / 2, by = this.y - this.radius - 20;

    /* 名字 */
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const label = this.level ? this.name + ' Lv.' + this.level : this.name;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(label, this.x + 1, by + 1);
    ctx.fillStyle = this.color;
    ctx.fillText(label, this.x, by);

    /* 血条 */
    const hy = by - 5;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx - 1, hy - 1, bw + 2, bh + 2);
    ctx.fillStyle = '#202b47';
    ctx.fillRect(bx, hy, bw, bh);
    const pct = U.clamp(this.hp / this.maxHp, 0, 1);
    ctx.fillStyle = pct > 0.5 ? '#51cf66' : pct > 0.25 ? '#ffd43b' : '#ff6b6b';
    ctx.fillRect(bx, hy, bw * pct, bh);

    /* 护盾条（道具护盾核心） */
    if (this.shieldCharge > 0) {
      ctx.fillStyle = 'rgba(116,143,252,0.85)';
      ctx.fillRect(bx, hy + bh + 1, bw * U.clamp(this.shieldCharge / 60, 0, 1), 2.5);
    }
  }
}
