'use strict';
/* ============================================================
 * 子弹：直线弹 / 追踪弹 / 范围爆炸
 * ============================================================ */

class Bullet {
  constructor(opts) {
    this.x = opts.x; this.y = opts.y;
    this.owner = opts.owner;            // Robot 引用
    this.dmg = opts.dmg;
    this.speed = opts.speed;
    this.size = opts.size;
    this.color = opts.color;
    this.knock = opts.knock || 0;
    this.aoe = opts.aoe || 0;           // 爆炸半径
    this.homing = !!opts.homing;        // 追踪
    this.turn = opts.turn || 0;         // 追踪转向速率
    this.bounce = !!opts.bounce;        // 撞墙反弹（榴弹）
    this.pierce = opts.pierce || 0;     // 可穿透次数
    this.life = opts.life || 3.2;       // 秒
    this.slow = opts.slow || 0;         // 冰霜：减速比例
    this.slowDur = opts.slowDur || 0;
    this.dot = opts.dot || null;        // 毒针：{dps, dur}
    this.spark = !!opts.spark;          // 特斯拉：电击特效
    this.burn = opts.burn || null;      // 燃烧榴弹：{r, dps, dur}
    this.fire = !!opts.fire;            // 火焰喷射器：轻量灼烧弹
    this.tracer = !!opts.tracer;        // 狙击：长光带
    this.trail = [];
    this.dead = false;

    const a = opts.angle;
    this.vx = Math.cos(a) * this.speed;
    this.vy = Math.sin(a) * this.speed;
  }

  get angle() { return Math.atan2(this.vy, this.vx); }

  update(dt, game) {
    const prevX = this.x, prevY = this.y;

    /* 追踪弹转向目标（敌方机器人） */
    if (this.homing) {
      const t = game.enemyOf(this.owner);
      if (t && !t.dead) {
        const want = U.angleTo(this.x, this.y, t.x, t.y);
        const cur = this.angle;
        const na = U.angleLerp(cur, want, this.turn * dt);
        const sp = Math.hypot(this.vx, this.vy);
        this.vx = Math.cos(na) * sp;
        this.vy = Math.sin(na) * sp;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;

    /* 拖尾 */
    this.trail.push({ x: (prevX + this.x) / 2, y: (prevY + this.y) / 2 });
    if (this.trail.length > 9) this.trail.shift();

    /* 飞行粒子拖尾 */
    if (Math.random() < 0.55) {
      if (this.fire) {
        /* 火焰：持续喷火 */
        Particles.spawn(this.x, this.y, { count: 1, angle: this.angle + Math.PI, spread: 0.5, speed: 120, life: 0.3, size: 4.5, colors: ['#ff922b', '#ffd43b'], grow: -6 });
      } else if (this.homing) {
        /* 导弹：尾焰烟轨 */
        Particles.spawn(this.x, this.y, { count: 1, angle: this.angle + Math.PI, spread: 0.3, speed: 90, life: 0.5, size: 4, colors: ['#ffa94d', '#ffd8a8'] });
        Particles.spawn(this.x, this.y, { count: 1, angle: this.angle + Math.PI, spread: 0.4, speed: 40, life: 0.8, size: 6, colors: ['#868e96', '#adb5bd'], shape: 'smoke', gravity: -20, grow: 8 });
      } else {
        Particles.spawn(this.x, this.y, { count: 1, angle: this.angle + Math.PI, spread: 0.25, speed: this.speed * 0.2, life: 0.22, size: this.size * 0.55, colors: [this.color, '#ffffff'] });
      }
    }

    /* 撞墙 */
    const hitWall = game.map.hitWall(this.x, this.y);
    if (hitWall) {
      if (this.bounce) {
        /* 反弹：用上一帧位置判断穿越方向（当前位置已在墙内） */
        if (prevX < hitWall.x || prevX > hitWall.x + hitWall.w) this.vx *= -1;
        if (prevY < hitWall.y || prevY > hitWall.y + hitWall.h) this.vy *= -1;
        this.x = prevX; this.y = prevY;
        SFX.tone(300, 0.05, 'square', 0.08, 180);
        this.bounce--;
      } else if (this.aoe) {
        this.explode(game);
      } else {
        Particles.spawn(this.x, this.y, { count: 5, colors: [this.color, '#aaa'], speed: 120, life: 0.25, size: 2.5 });
        this.dead = true;
      }
    }

    /* 撞障碍物（非墙） */
    if (!this.dead) {
      const ob = game.map.hitObstacle(this.x, this.y);
      if (ob) {
        if (this.bounce) {
          if (prevX < ob.x || prevX > ob.x + ob.w) this.vx *= -1;
          if (prevY < ob.y || prevY > ob.y + ob.h) this.vy *= -1;
          this.x = prevX; this.y = prevY;
          this.bounce--;
        } else if (this.aoe) {
          this.explode(game);
        } else {
          Particles.spawn(this.x, this.y, { count: 5, colors: [this.color, '#aaa'], speed: 120, life: 0.25, size: 2.5 });
          this.dead = true;
        }
      }
    }

    if (this.life <= 0) {
      if (this.aoe) this.explode(game);
      else this.dead = true;
    }
  }

  explode(game) {
    if (this.dead) return;
    this.dead = true;

    if (this.fire) {
      /* 火焰弹：轻量灼烧（不刷屏） */
      game.areaDamage(this.x, this.y, this.aoe, this.dmg, this.owner, this.knock);
      if (Math.random() < 0.25) {
        Particles.spawn(this.x, this.y, { count: 3, colors: ['#ff922b', '#ffd43b'], speed: 90, life: 0.35, size: 4, gravity: -60 });
      }
      return;
    }
    game.areaDamage(this.x, this.y, this.aoe, this.dmg, this.owner, this.knock);

    if (this.spark) {
      /* 特斯拉：电击爆裂 */
      Particles.spawn(this.x, this.y, { count: 14, colors: ['#74c0fc', '#a5d8ff', '#ffffff'], speed: 260, life: 0.4, size: 3, shape: 'spark' });
      Particles.spawn(this.x, this.y, { count: 8, colors: ['#74c0fc', '#e7f5ff'], speed: 140, life: 0.5, size: 4 });
      Shockwaves.add(this.x, this.y, this.aoe, 'rgba(140,200,255,0.95)');
      SFX.tone(1200, 0.12, 'sawtooth', 0.12, 300);
    } else if (this.burn) {
      /* 燃烧榴弹：点燃地面 */
      game.addBurnZone(this.x, this.y, this.burn.r, this.burn.dps, this.burn.dur, this.owner);
    } else {
      /* 常规爆炸：火球 + 火环 + 火花 + 烟 */
      Particles.spawn(this.x, this.y, { count: 22, colors: ['#ffd166', '#ff8c42', '#ff6b6b'], speed: 280, life: 0.5, size: 4, gravity: 120 });
      Particles.spawn(this.x, this.y, { count: 10, colors: ['#ffd166', '#fff3b0'], speed: 420, life: 0.3, size: 2.2, shape: 'spark' });
      Particles.spawn(this.x, this.y, { count: 6, colors: ['#495057', '#868e96'], speed: 55, life: 1.1, size: 8, gravity: -30, shape: 'smoke', grow: 14 });
      Particles.spawn(this.x, this.y, { count: 3, speed: 0, life: 0.45, size: 8, grow: Math.max(60, this.aoe * 3.2), colors: ['rgba(255,200,120,0.85)', 'rgba(255,150,80,0.6)'], shape: 'ring' });
      Shockwaves.add(this.x, this.y, this.aoe, 'rgba(255,170,80,0.9)');
      SFX.explode(this.aoe > 60);
    }
  }

  draw(ctx) {
    /* 狙击：长渐变光带 */
    if (this.tracer) {
      const a = this.angle;
      const g = ctx.createLinearGradient(this.x, this.y, this.x - Math.cos(a) * 280, this.y - Math.sin(a) * 280);
      g.addColorStop(0, 'rgba(235,225,255,0.85)');
      g.addColorStop(1, 'rgba(235,225,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - Math.cos(a) * 280, this.y - Math.sin(a) * 280);
      ctx.stroke();
    }
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const a = (i / this.trail.length) * 0.5;
      ctx.globalAlpha = a;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, this.size * 0.55 * (i / this.trail.length + 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = FXQuality.shadow ? 14 : 0;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
