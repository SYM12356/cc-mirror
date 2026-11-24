'use strict';
/* ============================================================
 * 道具：血包 / 弹药箱 / 推进器 / 护盾核心
 * ============================================================ */

class Pickup {
  constructor(type, x, y) {
    this.type = type;
    this.cfg = CFG.PICKUPS[type];
    this.x = x; this.y = y;
    this.r = 13;
    this.life = CFG.PICKUP_LIFE;
    this.maxLife = CFG.PICKUP_LIFE;
    this.spawnT = 0.4;      // 生成后的短暂无敌（防贴脸瞬拾）
    this.bob = Math.random() * Math.PI * 2;
    this.dead = false;
  }

  update(dt) {
    this.life -= dt;
    this.bob += dt * 3;
    if (this.spawnT > 0) this.spawnT -= dt;
    if (this.life <= 0) this.dead = true;
  }

  /* 被机器人拾取 */
  apply(robot) {
    const c = this.cfg;
    switch (this.type) {
      case 'health': case 'mega':
        robot.heal(c.val);
        break;
      case 'ammo':
        robot.subAmmo = Math.min(robot.subAmmoMax, robot.subAmmo + c.val);
        break;
      case 'boost':
        robot.boostT = c.val;
        break;
      case 'shield':
        robot.shieldCharge = Math.min(60, (robot.shieldCharge || 0) + c.val);
        break;
    }
    Floaters.add(this.x, this.y - 18, '+' + c.val, c.color, 15);
    Particles.spawn(this.x, this.y, { count: 14, colors: [c.color, '#fff'], speed: 170, life: 0.5, size: 3 });
    Particles.spawn(this.x, this.y, { count: 8, colors: ['#ffffff', c.color], speed: 260, life: 0.3, size: 2, shape: 'spark' });
    Particles.spawn(this.x, this.y, { count: 5, angle: -Math.PI / 2, spread: 1.2, speed: 90, life: 0.7, size: 4, colors: [c.color], gravity: -50, grow: 5 });
    Shockwaves.add(this.x, this.y, 42, c.color);
    SFX.pickup();
  }

  draw(ctx) {
    if (this.spawnT > 0) {
      ctx.globalAlpha = 0.35 + 0.65 * (1 - this.spawnT / 0.4);
    }
    /* 即将消失时闪烁 */
    if (this.life < 4 && Math.floor(this.life * 4) % 2 === 0) ctx.globalAlpha *= 0.35;

    const c = this.cfg;
    const bobY = Math.sin(this.bob) * 3;

    /* 光晕 */
    ctx.save();
    ctx.shadowColor = c.color;
    ctx.shadowBlur = FXQuality.shadow ? 16 : 0;
    ctx.fillStyle = 'rgba(24,36,66,0.9)';
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y + bobY, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = c.color;
    ctx.font = `bold 15px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.icon, this.x, this.y + bobY + 1);

    /* 名字 */
    ctx.globalAlpha *= 0.9;
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.fillStyle = '#cfe3ff';
    ctx.fillText(c.name, this.x, this.y + bobY - this.r - 6);
    ctx.globalAlpha = 1;
  }
}
