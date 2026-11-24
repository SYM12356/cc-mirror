'use strict';
/* ============================================================
 * 工具函数 & 粒子系统
 * ============================================================ */

const U = {
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  rand(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(U.rand(a, b + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },
  dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); },
  angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); },
  angleLerp(a, b, t) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  },
  /* 圆 vs 圆碰撞 */
  circleCircleHit(ax, ay, ar, bx, by, br) {
    return U.dist2(ax, ay, bx, by) <= (ar + br) * (ar + br);
  }
};

/* ---------- 画质开关（由设置面板控制，低配设备关闭发光/天气/光柱） ---------- */
const FXQuality = {
  shadow: true,        // 发光特效（shadowBlur，最耗性能）
  weather: true,       // 动态天气事件
  lightColumns: true,  // 地图体积光柱
  ambient: 46          // 环境尘埃数量
};

/* ---------- 粒子系统（circle / spark 火花 / rect 残骸 / smoke 烟雾） ---------- */
const Particles = {
  list: [],
  MAX: 700,                       // 性能上限

  spawn(x, y, opts = {}) {
    let count = opts.count !== undefined ? opts.count : 8;
    const room = this.MAX - this.list.length;
    if (room <= 0) return;                    // 上限保护
    count = Math.min(count, room);            // 超量时截断
    const speed = opts.speed !== undefined ? opts.speed : 160;
    const life = opts.life !== undefined ? opts.life : 0.5;
    const size = opts.size !== undefined ? opts.size : 3;
    const colors = opts.colors || ['#ffd166', '#ff8c42', '#fff3b0'];
    const gravity = opts.gravity || 0;
    const drag = opts.drag !== undefined ? opts.drag : 0.9;
    const angle = opts.angle;
    const spread = opts.spread !== undefined ? opts.spread : Math.PI * 2;
    const shape = opts.shape || 'circle';
    for (let i = 0; i < count; i++) {
      const a = (angle !== undefined ? angle : Math.random() * Math.PI * 2) + U.rand(-spread / 2, spread / 2);
      const sp = speed * U.rand(0.3, 1);
      this.list.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: life * U.rand(0.6, 1.2),
        maxLife: life,
        size: size * U.rand(0.6, 1.4),
        color: U.pick(colors),
        gravity, drag,
        glow: opts.glow !== false,
        shape,
        rot: U.rand(0, Math.PI * 2),
        spin: opts.spin || 0,               // rect 旋转速度
        grow: opts.grow || 0                // 每秒尺寸增长（烟雾膨胀）
      });
    }
  },

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      const dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr; p.vy *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.size = Math.max(0.5, p.size + p.grow * dt);
    }
  },

  draw(ctx) {
    for (const p of this.list) {
      const a = U.clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      switch (p.shape) {
        case 'spark': {
          /* 高速火花：带拖尾的短线 */
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * 0.7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
          ctx.stroke();
          break;
        }
        case 'rect': {
          /* 旋转残骸/弹壳 */
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size * 0.6, -p.size * 0.3, p.size * 1.2, p.size * 0.6);
          ctx.restore();
          break;
        }
        case 'smoke': {
          /* 膨胀上浮的烟团（径向渐变） */
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0, p.color);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'ring': {
          /* 扩散圆环（爆炸火环） */
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.5, p.size * 0.22);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        default: {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
};

/* ---------- 战场环境尘埃（漂浮光点） ---------- */
const Ambient = {
  list: [],
  init(n) {
    this.list = [];
    for (let i = 0; i < n; i++) {
      this.list.push({
        x: Math.random() * CFG.W, y: Math.random() * CFG.H,
        r: U.rand(0.8, 2.2),
        spd: U.rand(4, 14),
        dir: Math.random() * Math.PI * 2,
        tw: U.rand(0, Math.PI * 2),
        color: Math.random() < 0.7 ? '#8fb8ff' : '#ffd8a8'
      });
    }
  },
  update(dt) {
    for (const p of this.list) {
      p.x += Math.cos(p.dir) * p.spd * dt;
      p.y += Math.sin(p.dir) * p.spd * dt - 2.5 * dt;
      p.tw += dt * 2;
      if (p.x < -12) p.x = CFG.W + 12;
      if (p.x > CFG.W + 12) p.x = -12;
      if (p.y < -12) p.y = CFG.H + 12;
      if (p.y > CFG.H + 12) p.y = -12;
    }
  },
  draw(ctx) {
    for (const p of this.list) {
      ctx.globalAlpha = 0.05 + 0.06 * (0.5 + 0.5 * Math.sin(p.tw));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
};

/* ---------- 冲击波效果 ---------- */
const Shockwaves = {
  list: [],
  add(x, y, r, color = 'rgba(255,180,90,0.8)') {
    this.list.push({ x, y, r: 8, maxR: r, color, life: 0.35, maxLife: 0.35 });
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.life -= dt;
      if (s.life <= 0) { this.list.splice(i, 1); continue; }
      const t = 1 - s.life / s.maxLife;
      s.r = U.lerp(8, s.maxR, 1 - (1 - t) * (1 - t));
    }
  },
  draw(ctx) {
    for (const s of this.list) {
      const a = s.life / s.maxLife;
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3 * a + 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
};

/* ---------- 飘字（伤害数字等） ---------- */
const Floaters = {
  list: [],
  add(x, y, text, color = '#fff', size = 14) {
    this.list.push({ x: x + U.rand(-8, 8), y, text, color, size, life: 0.9, maxLife: 0.9, vy: -46 });
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.life -= dt;
      if (f.life <= 0) { this.list.splice(i, 1); continue; }
      f.y += f.vy * dt;
      f.vy *= Math.pow(0.5, dt * 60);
    }
  },
  draw(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.list) {
      const a = U.clamp(f.life / f.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `bold ${f.size}px "Segoe UI", sans-serif`;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
};

/* ---------- 战斗共享工具（Game/Survival/BossFight 复用，消除重复） ---------- */
const Combat = {
  /* 构造子弹（含养成/被动加成） */
  makeBullet(owner, angle, w) {
    const dmg = Math.round(w.dmg
      * (owner.bonus ? owner.bonus.dmgMult : 1)
      * (1 + (owner.passiveDmgUp || 0))
      * (owner.streakT > 0 && owner.streakTier >= 1 ? 1.15 : 1));   // 连杀奖励：伤害 +15%
    return new Bullet({
      x: owner.x + Math.cos(angle) * (owner.radius + 12),
      y: owner.y + Math.sin(angle) * (owner.radius + 12),
      owner, angle, dmg,
      speed: w.speed * U.rand(0.95, 1.05),
      size: w.bulletSize, color: w.color, knock: w.knock,
      aoe: w.aoe, homing: w.homing, turn: w.turn,
      pierce: w.pierce, bounce: w.bounce,
      slow: w.slow, slowDur: w.slowDur, dot: w.dot,
      spark: w.spark, burn: w.burn, tracer: w.tracer, fire: w.fire,
      life: w.life || ((w.homing || w.bounce) ? 3.6 : 2.4)
    });
  },

  /* 燃烧地带推进（game.burnZones 数组 + targets 回调） */
  tickBurnZones(game, dt, getTargets) {
    for (let i = game.burnZones.length - 1; i >= 0; i--) {
      const z = game.burnZones[i];
      z.dur -= dt;
      if (z.dur <= 0) { game.burnZones.splice(i, 1); continue; }
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.25;
        for (const r of getTargets()) {
          if (r.dead || r === z.owner) continue;
          if (U.dist(z.x, z.y, r.x, r.y) < z.r + r.radius) {
            r.takeDamage(z.dps * 0.25, U.angleTo(r.x, r.y, z.x, z.y), 10, game, z.owner);
          }
        }
      }
      if (Math.random() < dt * 40) {
        Particles.spawn(z.x + U.rand(-z.r, z.r), z.y + U.rand(-z.r, z.r),
          { count: 1, colors: ['#ff922b', '#ffd43b'], speed: 40, life: 0.5, size: 4.5, gravity: -40, grow: 4 });
      }
    }
  },

  /* 燃烧地带绘制 */
  drawBurnZones(ctx, zones) {
    for (const z of zones) {
      const a = U.clamp(z.dur / z.maxDur, 0, 1) * 0.35;
      ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
      g.addColorStop(0, 'rgba(255,140,50,0.9)');
      g.addColorStop(1, 'rgba(255,140,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  },

  /* 天罚落点绘制 */
  drawHeavenFalls(ctx, falls) {
    for (const f of falls) {
      const blink = Math.floor(f.delay * 6) % 2 === 0;
      ctx.strokeStyle = blink ? 'rgba(255,120,90,0.95)' : 'rgba(255,120,90,0.4)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(f.x - 1.5, 0, 3, f.y - 10);
      ctx.globalAlpha = 1;
    }
  },

  /* 天罚落点推进 */
  tickHeavenFalls(game, dt, owner, dmg, aoe) {
    for (let i = game.heavenFalls.length - 1; i >= 0; i--) {
      const f = game.heavenFalls[i];
      f.delay -= dt;
      if (f.delay <= 0) {
        game.heavenFalls.splice(i, 1);
        const caster = f.caster || owner;   // 归属真实施法者（小兵大招等）
        game.areaDamage(f.x, f.y, aoe, dmg, f.weather ? null : caster, 200);
        if (f.weather) {
          Particles.spawn(f.x, f.y, { count: 26, colors: ['#ff8c42', '#ffd43b', '#ff6b6b'], speed: 300, life: 0.6, size: 5, gravity: 100 });
          Particles.spawn(f.x, f.y, { count: 8, colors: ['#ffd166', '#fff3b0'], speed: 450, life: 0.35, size: 2.5, shape: 'spark' });
          Particles.spawn(f.x, f.y, { count: 6, colors: ['#495057', '#868e96'], speed: 60, life: 1.3, size: 9, gravity: -30, shape: 'smoke', grow: 16 });
          Particles.spawn(f.x, f.y, { count: 2, speed: 0, life: 0.5, size: 10, grow: 260, colors: ['rgba(255,170,90,0.85)'], shape: 'ring' });
          game.shake(9);
        }
        Particles.spawn(f.x, f.y, { count: 20, colors: ['#ff6b6b', '#ffd166', '#fff'], speed: 280, life: 0.55, size: 4, gravity: 80 });
        Particles.spawn(f.x, f.y, { count: 8, colors: ['#ffd166', '#fff3b0'], speed: 420, life: 0.3, size: 2.2, shape: 'spark' });
        Shockwaves.add(f.x, f.y, aoe, 'rgba(255,120,90,0.9)');
        SFX.explode(false);
      }
    }
  }
};

/* ---------- 屏幕特效（全屏闪光 / 受击红晕 / 低血量警告） ---------- */
const ScreenFX = {
  flashA: 0, flashColor: '#ffffff',
  hurtV: 0,
  lowHpV: 0,

  flash(color, a) {
    if (typeof a !== 'number' || isNaN(a)) a = 0.3;   // 防御：缺省透明度
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, a);
  },
  hurt() { this.hurtV = Math.min(1, this.hurtV + 0.45); },
  setLowHp(on) {
    if (on && this.lowHpV < 0.5) this.lowHpV = 0.5;
    if (!on) this.lowHpV = 0;
  },

  update(dt) {
    this.flashA = Math.max(0, this.flashA - dt * 1.7);
    this.hurtV = Math.max(0, this.hurtV - dt * 1.3);
    if (this.lowHpV > 0) this.lowHpV = Math.max(0.35, this.lowHpV - dt * 0.15);
  },

  draw(ctx, t) {
    /* 全屏闪光 */
    if (this.flashA > 0) {
      ctx.globalAlpha = this.flashA;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      ctx.globalAlpha = 1;
    }
    /* 受击红晕 */
    if (this.hurtV > 0) {
      const g = ctx.createRadialGradient(CFG.W / 2, CFG.H / 2, CFG.H * 0.28, CFG.W / 2, CFG.H / 2, CFG.H * 0.78);
      g.addColorStop(0, 'rgba(255,50,50,0)');
      g.addColorStop(1, `rgba(255,50,50,${this.hurtV})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CFG.W, CFG.H);
    }
    /* 低血量红色脉冲边框 */
    if (this.lowHpV > 0) {
      const pulse = 0.6 + 0.4 * Math.sin(t * 5);
      const g = ctx.createRadialGradient(CFG.W / 2, CFG.H / 2, CFG.H * 0.32, CFG.W / 2, CFG.H / 2, CFG.H * 0.8);
      g.addColorStop(0, 'rgba(255,30,30,0)');
      g.addColorStop(1, `rgba(255,30,30,${this.lowHpV * pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CFG.W, CFG.H);
    }
  }
};

/* ---------- 击杀横幅（中央大字 + 连杀） ---------- */
const KillFeed = {
  items: [],
  add(main, sub, color) {
    this.items.push({ main, sub, color, life: 1.6, maxLife: 1.6 });
    if (this.items.length > 4) this.items.shift();   // 上限防堆积
  },
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      this.items[i].life -= dt;
      if (this.items[i].life <= 0) this.items.splice(i, 1);
    }
  },
  draw(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const k of this.items) {
      const t = 1 - k.life / k.maxLife;
      const scale = t < 0.12 ? 0.4 + (t / 0.12) * 0.6 : 1 + Math.sin(t * 22) * 0.015;
      const alpha = k.life < 0.4 ? k.life / 0.4 : 1;
      ctx.save();
      ctx.translate(CFG.W / 2, CFG.H / 2 - 100);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      ctx.font = '900 74px "Segoe UI", sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.72)';
      ctx.lineWidth = 9;
      ctx.strokeText(k.main, 0, 0);
      ctx.fillStyle = k.color;
      ctx.shadowColor = k.color;
      ctx.shadowBlur = FXQuality.shadow ? 26 : 0;
      ctx.fillText(k.main, 0, 0);
      if (k.sub) {
        ctx.shadowBlur = 0;   // 清除主标题发光继承
        ctx.font = 'bold 28px "Segoe UI", sans-serif';
        ctx.fillStyle = '#ffd43b';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 5;
        ctx.strokeText(k.sub, 0, 52);
        ctx.fillText(k.sub, 0, 52);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
};

/* 统一更新/绘制 */
const FX = {
  update(dt) {
    if (!Ambient.list.length) Ambient.init(FXQuality.ambient);
    Ambient.update(dt);
    Particles.update(dt);
    Shockwaves.update(dt);
    Floaters.update(dt);
    ScreenFX.update(dt);
    KillFeed.update(dt);
  },
  draw(ctx) {
    Ambient.draw(ctx);
    Particles.draw(ctx);
    Shockwaves.draw(ctx);
    Floaters.draw(ctx);
  },
  drawScreen(ctx, t) {
    ScreenFX.draw(ctx, t);
    KillFeed.draw(ctx);
  },
  clear() {
    Particles.list.length = 0;
    Shockwaves.list.length = 0;
    Floaters.list.length = 0;
    Ambient.list.length = 0;
    ScreenFX.flashA = 0; ScreenFX.hurtV = 0; ScreenFX.lowHpV = 0;
    KillFeed.items.length = 0;
  }
};
