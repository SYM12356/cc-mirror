'use strict';
/* ============================================================
 * 攻击无人机插件：环绕主人飞行，自动射击附近敌人
 * ============================================================ */

class Drone {
  constructor(owner) {
    this.owner = owner;
    this.angle = Math.random() * Math.PI * 2;
    this.cd = 1.2;
    this.x = owner.x;
    this.y = owner.y;
    this.hp = 25;              // 可被击毁
    this.dead = false;
    this.flash = 0;
  }

  get radius() { return 9; }

  update(dt, game) {
    if (this.dead) return;

    /* 环绕主人 */
    this.angle += dt * 1.7;
    const rad = this.owner.radius + 28 + Math.sin(this.angle * 2) * 6;
    this.x = this.owner.x + Math.cos(this.angle) * rad;
    this.y = this.owner.y + Math.sin(this.angle) * rad;
    if (this.flash > 0) this.flash -= dt;

    /* 自动索敌射击 */
    this.cd -= dt;
    const target = game.enemyOf(this.owner);
    if (target && !target.dead && this.cd <= 0) {
      const d = U.dist(this.x, this.y, target.x, target.y);
      if (d < 460) {
        this.cd = 1.0;
        const a = U.angleTo(this.x, this.y, target.x, target.y) + U.rand(-0.08, 0.08);
        const b = new Bullet({
          x: this.x + Math.cos(a) * 10,
          y: this.y + Math.sin(a) * 10,
          owner: this.owner,
          angle: a,
          dmg: 7,
          speed: 540,
          size: 2.8,
          color: '#22b8cf',
          knock: 20,
          life: 1.6
        });
        game.bullets.push(b);
        SFX.tone(920, 0.05, 'square', 0.07, 700);
        Particles.spawn(this.x, this.y, { count: 2, angle: a, spread: 0.2, speed: 90, life: 0.2, size: 2, colors: ['#66d9e8', '#fff'], shape: 'spark' });
      }
    }
  }

  /* 被子弹击中 */
  takeDamage(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flash = 0.1;
    Particles.spawn(this.x, this.y, { count: 4, colors: ['#66d9e8', '#fff'], speed: 120, life: 0.3, size: 2.5, shape: 'spark' });
    if (this.hp <= 0) {
      this.dead = true;
      Particles.spawn(this.x, this.y, { count: 16, colors: ['#22b8cf', '#ffd166', '#fff'], speed: 220, life: 0.6, size: 3 });
      Shockwaves.add(this.x, this.y, 34, 'rgba(80,210,230,0.9)');
    }
  }

  draw(ctx) {
    if (this.dead) return;

    /* 连接线（与主人之间若有若无的光线） */
    ctx.strokeStyle = 'rgba(80,210,230,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.owner.x, this.owner.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.translate(this.x, this.y);

    /* 光晕 */
    ctx.save();
    ctx.shadowColor = '#22b8cf';
    ctx.shadowBlur = FXQuality.shadow ? 12 : 0;
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : 'rgba(40,60,90,0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* 机翼（小三角） */
    ctx.fillStyle = this.flash > 0 ? '#fff' : '#e8590c';
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-2, -5);
    ctx.lineTo(-2, 5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(2, -5);
    ctx.lineTo(2, 5);
    ctx.closePath();
    ctx.fill();

    /* 机身 */
    ctx.fillStyle = '#22b8cf';
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    /* 机头灯 */
    ctx.save();
    ctx.shadowColor = '#ffe066';
    ctx.shadowBlur = FXQuality.shadow ? 8 : 0;
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(Math.cos(this.angle) * 0 + 4, 0, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }
}
