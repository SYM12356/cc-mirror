'use strict';
/* ============================================================
 * AI 对手：瞄准预测 / 保持距离 / 避障 / 捡道具 / 技能时机
 * ============================================================ */

class AI {
  constructor(robot, game, difficulty = 'normal') {
    this.r = robot;
    this.game = game;
    this.diff = CFG.AI_DIFFICULTY[difficulty] || CFG.AI_DIFFICULTY.normal;
    this.decisionT = 0;
    this.slotTimer = U.rand(1, 2);
    this.dodge = 0;          // 绕行偏转角（弧度）
    this.dodgeT = 0;         // 绕行保持时间
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = U.rand(0.5, 1.5);
    this.moveAim = 0;
  }

  target() { return this.game.enemyOf(this.r); }

  update(dt) {
    const r = this.r;
    const t = this.target();
    this.strafeTimer += dt;     // 绕圈相位随时间变化

    if (!t || t.dead) {
      r.moveX = 0; r.moveY = 0; r.fireHeld = false;
      return;
    }

    /* 反应延迟：每隔一段时间重新决策 */
    this.decisionT -= dt;
    if (this.decisionT <= 0) {
      this.decisionT = this.diff.react + U.rand(0, 0.1);
      this.decide();
    }

    /* 避障：前方有障碍 → 偏转航向并保持一段时间（沿墙绕行） */
    this.dodgeT -= dt;
    if (this.dodgeT <= 0) {
      const lookDist = 58 + r.speed * 0.3;
      const lookX = r.x + Math.cos(this.moveAim) * lookDist;
      const lookY = r.y + Math.sin(this.moveAim) * lookDist;
      if (GameMap.hitWall(lookX, lookY) || GameMap.hitObstacle(lookX, lookY)) {
        this.dodgeT = U.rand(0.5, 0.85);
        this.dodge = (Math.random() < 0.5 ? -1 : 1) * U.rand(Math.PI / 4, Math.PI / 2.5);
      } else {
        this.dodge = 0;
      }
    }

    /* 移动向量 */
    let mx = 0, my = 0;
    if (this.goPickup) {
      const d = U.dist(r.x, r.y, this.goPickup.x, this.goPickup.y);
      if (d > 14) {
        mx = (this.goPickup.x - r.x) / d;
        my = (this.goPickup.y - r.y) / d;
      }
      if (d < 40 || !this.goPickup || this.goPickup.dead) this.goPickup = null;
    } else if (this.kiteDir) {
      /* 保持距离：径向（远离/靠近）+ 切向（绕圈） */
      const dist = U.dist(r.x, r.y, t.x, t.y);
      const radial = dist > this.kiteDist + 60 ? 1 : dist < this.kiteDist - 40 ? -1 : 0;
      const dx = (t.x - r.x) / dist, dy = (t.y - r.y) / dist;
      const strafe = Math.sin(this.strafeTimer * 3) * 0.7;
      mx = dx * radial - dy * strafe * this.strafeDir;
      my = dy * radial + dx * strafe * this.strafeDir;
      const ml = Math.hypot(mx, my);
      if (ml > 0) { mx /= ml; my /= ml; }
    }

    /* 施加绕行偏转 */
    if (this.dodge !== 0) {
      const a = Math.atan2(my, mx) + this.dodge;
      mx = Math.cos(a); my = Math.sin(a);
    }

    r.moveX = mx;
    r.moveY = my;
    if (Math.hypot(mx, my) > 0.1) this.moveAim = Math.atan2(my, mx);

    const distT = U.dist(r.x, r.y, t.x, t.y);

    /* 槽位切换决策：当前武器不适应距离时换槽 */
    this.slotTimer -= dt;
    if (this.slotTimer <= 0 && r.loadout.length > 1) {
      this.slotTimer = U.rand(2, 3.5);
      const w = r.currentWeapon();
      const ideal = this.idealRangeFor(w);
      if (Math.abs(distT - ideal) > 130 || (r.slotType === 'sub' && r.subAmmo <= 0)) {
        r.switchSlot();
      }
    }

    /* 瞄准：预测目标位置 + 难度噪声 */
    const w = r.currentWeapon();
    const lead = (w && w.speed) ? distT / w.speed : 0;
    const px = t.x + t.vx * lead * 0.9;
    const py = t.y + t.vy * lead * 0.9;
    const baseAim = U.angleTo(r.x, r.y, px, py);
    const noise = U.rand(-this.diff.aimErr, this.diff.aimErr);
    r.aimOverride = baseAim + noise;

    /* 射击决策 */
    r.fireHeld = false;
    if (this.decideFire && distT < 560 && distT > 60) {
      const clear = !GameMap.blocksLine(r.x, r.y, t.x, t.y);
      if (clear && Math.random() < this.diff.fireChance) {
        r.fireHeld = true;
      }
    }
  }

  /* 武器的理想作战距离 */
  idealRangeFor(w) {
    if (!w) return 280;
    if (w.melee) return 110;             // 链锯：贴脸
    if (w.fire) return 150;              // 火焰：贴脸
    if (w.pellets) return 170;           // 霰弹：近身
    if (w.heatPerShot) return 260;       // 机枪
    if (w.aoe) return 300;                // 榴弹/等离子
    if (w.slow) return 300;              // 冰霜
    if (w.dot) return 320;               // 毒针
    if (w.homing) return 380;            // 导弹
    if (w.tracer) return 450;            // 狙击/磁轨
    return 280;                          // 激光
  }

  decide() {
    const r = this.r;
    const t = this.target();
    if (!t) return;

    const dist = U.dist(r.x, r.y, t.x, t.y);
    const hpPct = r.hp / r.maxHp;

    /* 1. 血量低 → 找血包（仅普通对战模式，生存/Boss 敌人捡不到道具） */
    if (hpPct < 0.42 && this.game.pickups.length && this.game.mode !== 'survival' && this.game.mode !== 'boss') {
      let best = null, bestD = Infinity;
      for (const p of this.game.pickups) {
        if (p.type === 'health' || p.type === 'mega') {
          const d = U.dist2(r.x, r.y, p.x, p.y);
          if (d < bestD) { bestD = d; best = p; }
        }
      }
      if (best && bestD < 700 * 700) {
        this.goPickup = best;
        this.kiteDir = null;
        this.decideFire = false;
        return;
      }
    }
    this.goPickup = null;

    /* 2. 当前武器决定作战距离 */
    this.kiteDist = this.idealRangeFor(r.currentWeapon());
    this.kiteDir = true;
    this.decideFire = true;

    /* 4. 技能时机 */
    if (r.skillCool <= 0 && Math.random() < this.diff.skillChance) {
      const s = CFG.SKILLS[r.skillId];
      switch (r.skillId) {
        case 'shield':
          if (hpPct < 0.55 && dist < 420) r.useSkill(this.game);
          break;
        case 'dash':
          if ((dist < 190 && Math.random() < 0.5) || (t.invulnT <= 0 && r.hp < 35 && dist > 260)) {
            /* 冲向敌人或撤退 */
            r.moveX = (t.x - r.x) / Math.max(1, dist);
            r.moveY = (t.y - r.y) / Math.max(1, dist);
            r.useSkill(this.game);
          }
          break;
        case 'emp':
          if (dist < s.radius * 1.15) r.useSkill(this.game);
          break;
        case 'nuke':
          if (dist > 90 && dist < 260 && t.hp / t.maxHp > 0.3) r.useSkill(this.game);
          break;
        case 'heal':
          if (hpPct < 0.62) r.useSkill(this.game);
          break;
      }
    }

    /* 5. 专属大招：能量满时释放 */
    if (r.ulti >= r.ultiMax && Math.random() < this.diff.skillChance) {
      switch (r.mech.id) {
        case 'tank':
          if (hpPct < 0.6 || Math.random() < 0.4) r.useUltimate(this.game);
          break;
        case 'scout':
          if (dist < 300) r.useUltimate(this.game);
          break;
        case 'assault':
          if (dist < 380) r.useUltimate(this.game);
          break;
        case 'artillery':
          r.useUltimate(this.game);
          break;
        case 'guardian':
          if (hpPct < 0.7 || Math.random() < 0.4) r.useUltimate(this.game);
          break;
      }
    }
  }
}
