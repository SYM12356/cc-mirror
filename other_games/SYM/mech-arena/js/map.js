'use strict';
/* ============================================================
 * 地图：程序化生成障碍 + 网格背景 + 碰撞
 * ============================================================ */

const GameMap = {
  W: CFG.W,
  H: CFG.H,
  wall: CFG.MAP.wall,
  obstacles: [],
  decorations: [],
  theme: null,

  /* ---------- 地图主题 ---------- */
  THEMES: {
    factory: {
      name: '霓虹工厂',
      bgTop: '#141b30', bgBot: '#0d1322',
      grid: 'rgba(120,170,255,0.13)',
      wallFill: 'rgba(110,160,255,0.16)', wallStroke: 'rgba(160,200,255,0.85)',
      obstacleFill: 'rgba(28,39,66,0.97)', obstacleStroke: 'rgba(120,170,255,0.7)',
      decor: '#8fb0e8', light: 'rgba(120,170,255,0.04)'
    },
    ice: {
      name: '极寒冰原',
      bgTop: '#1b2737', bgBot: '#111926',
      grid: 'rgba(175,220,255,0.11)',
      wallFill: 'rgba(180,220,245,0.16)', wallStroke: 'rgba(215,240,255,0.85)',
      obstacleFill: 'rgba(40,60,82,0.95)', obstacleStroke: 'rgba(185,220,240,0.75)',
      decor: '#a4c4d8', light: 'rgba(175,225,255,0.04)'
    },
    volcano: {
      name: '熔岩峡谷',
      bgTop: '#29141b', bgBot: '#180b10',
      grid: 'rgba(255,135,85,0.11)',
      wallFill: 'rgba(255,115,75,0.15)', wallStroke: 'rgba(255,155,105,0.85)',
      obstacleFill: 'rgba(66,32,32,0.97)', obstacleStroke: 'rgba(255,135,90,0.7)',
      decor: '#d48c6c', light: 'rgba(255,125,80,0.04)'
    },
    space: {
      name: '深空遗迹',
      bgTop: '#16172e', bgBot: '#0c0d1a',
      grid: 'rgba(165,145,255,0.11)',
      wallFill: 'rgba(145,130,250,0.16)', wallStroke: 'rgba(185,175,255,0.85)',
      obstacleFill: 'rgba(38,34,76,0.97)', obstacleStroke: 'rgba(155,145,255,0.75)',
      decor: '#a49bd4', light: 'rgba(155,140,255,0.04)'
    }
  },

  pickRandomTheme() {
    const keys = Object.keys(this.THEMES);
    this.theme = this.THEMES[keys[Math.floor(Math.random() * keys.length)]];
    return this.theme;
  },

  generate() {
    this.obstacles = [];
    this.decorations = [];
    this.pickRandomTheme();          // 每局重抽主题（4 张地图轮换）

    /* 出生点保护区域（对准实际出生位） */
    const spawnZones = [
      { x: 170 - 60, y: this.H / 2 - 60, w: 120, h: 120 },
      { x: this.W - 170 - 60, y: this.H / 2 - 60, w: 120, h: 120 }
    ];

    let n = 0, guard = 0;
    while (n < CFG.MAP.obstacles && guard++ < 400) {
      const w = U.randInt(CFG.MAP.obstacleMin, CFG.MAP.obstacleMax);
      const h = U.randInt(CFG.MAP.obstacleMin, CFG.MAP.obstacleMax);
      const x = U.randInt(this.wall + 10, this.W - this.wall - 10 - w);
      const y = U.randInt(this.wall + 10, this.H - this.wall - 10 - h);

      /* 与出生点太近则跳过 */
      let nearSpawn = false;
      for (const z of spawnZones) {
        if (x < z.x + z.w + 60 && x + w > z.x - 60 && y < z.y + z.h + 60 && y + h > z.y - 60) {
          nearSpawn = true; break;
        }
      }
      if (nearSpawn) continue;

      /* 与已有障碍重叠则跳过 */
      let overlap = false;
      for (const o of this.obstacles) {
        if (x < o.x + o.w + 24 && x + w > o.x - 24 && y < o.y + o.h + 24 && y + h > o.y - 24) {
          overlap = true; break;
        }
      }
      if (overlap) continue;

      this.obstacles.push({ x, y, w, h });
      n++;
    }

    /* 背景装饰点 */
    for (let i = 0; i < 70; i++) {
      this.decorations.push({
        x: U.rand(0, this.W), y: U.rand(0, this.H),
        r: U.rand(1, 3.2), a: U.rand(0.3, 0.55),
        tw: U.rand(0, Math.PI * 2)
      });
    }
  },

  /* 命中边框墙 → 返回墙矩形 */
  hitWall(x, y) {
    const w = this.wall;
    if (x <= w) return { x: 0, y: 0, w, h: this.H };
    if (x >= this.W - w) return { x: this.W - w, y: 0, w, h: this.H };
    if (y <= w) return { x: 0, y: 0, w: this.W, h: w };
    if (y >= this.H - w) return { x: 0, y: this.H - w, w: this.W, h: w };
    return null;
  },

  /* 命中障碍物（不含墙） */
  hitObstacle(x, y) {
    for (const o of this.obstacles) {
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o;
    }
    return null;
  },

  /* 圆 vs 全部静态碰撞，返回修正后的位置 */
  resolveCircle(cx, cy, r) {
    /* 多遍迭代：单遍顺序解析会在多障碍交界处残留重叠（被 B 推出后不再回检 A） */
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      /* 边框（每次迭代都重新约束，防障碍把圆推出地图/嵌入墙内） */
      cx = U.clamp(cx, this.wall + r, this.W - this.wall - r);
      cy = U.clamp(cy, this.wall + r, this.H - this.wall - r);
      for (const o of this.obstacles) {
        const nx = U.clamp(cx, o.x, o.x + o.w);
        const ny = U.clamp(cy, o.y, o.y + o.h);
        const dx = cx - nx, dy = cy - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 === 0) {
          /* 圆心在矩形内：推向最近边 */
          const left = cx - o.x, right = o.x + o.w - cx;
          const top = cy - o.y, bot = o.y + o.h - cy;
          const m = Math.min(left, right, top, bot);
          if (m === left) cx = o.x - r;
          else if (m === right) cx = o.x + o.w + r;
          else if (m === top) cy = o.y - r;
          else cy = o.y + o.h + r;
          moved = true;
        } else {
          const d = Math.sqrt(d2);
          const push = (r - d) / d;
          cx += dx * push; cy += dy * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    /* 最终再约束一次边框（防推越墙边） */
    cx = U.clamp(cx, this.wall + r, this.W - this.wall - r);
    cy = U.clamp(cy, this.wall + r, this.H - this.wall - r);
    return { x: cx, y: cy };
  },

  /* 是否有障碍物挡在两点之间（AI 视线检测，简化抽样） */
  blocksLine(x1, y1, x2, y2) {
    const d = U.dist(x1, y1, x2, y2);
    const steps = Math.max(4, Math.floor(d / 24));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = U.lerp(x1, x2, t), py = U.lerp(y1, y2, t);
      if (this.hitWall(px, py) || this.hitObstacle(px, py)) return true;
    }
    return false;
  },

  /* 随机可站立的道具刷新点 */
  randomSpawnPoint(r = 20) {
    let guard = 0;
    while (guard++ < 60) {
      const x = U.rand(this.wall + 40, this.W - this.wall - 40);
      const y = U.rand(this.wall + 40, this.H - this.wall - 40);
      if (this.hitWall(x, y) || this.hitObstacle(x, y)) continue;
      /* 不要太靠近机器人 */
      return { x, y };
    }
    return { x: this.W / 2, y: this.H / 2 };
  },

  draw(ctx) {
    const th = this.theme;
    /* 底色（按主题） */
    const grad = ctx.createLinearGradient(0, 0, 0, this.H);
    grad.addColorStop(0, th.bgTop);
    grad.addColorStop(1, th.bgBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H);

    /* 网格 */
    ctx.strokeStyle = th.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= this.W; x += CFG.MAP.grid) {
      ctx.moveTo(x, 0); ctx.lineTo(x, this.H);
    }
    for (let y = 0; y <= this.H; y += CFG.MAP.grid) {
      ctx.moveTo(0, y); ctx.lineTo(this.W, y);
    }
    ctx.stroke();

    /* 装饰点 */
    for (const d of this.decorations) {
      ctx.globalAlpha = d.a * (0.7 + 0.3 * Math.sin(d.tw + performance.now() / 900));
      ctx.fillStyle = th.decor;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* 体积光柱（缓慢摆动的科技光柱，低特效关闭） */
    const now = performance.now() / 1000;
    if (FXQuality.lightColumns) for (let i = 0; i < 3; i++) {
      const x = (i * 431 + 173) % this.W;
      const sway = Math.sin(now * 0.7 + i * 2.1) * 16;
      const g = ctx.createLinearGradient(x - 46, 0, x + 46, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, th.light);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(x + sway, 0);
      ctx.transform(1, 0.08, 0, 1, 0, 0);
      ctx.fillRect(-46, 0, 92, this.H);
      ctx.restore();
    }

    /* 边框墙 */
    const w = this.wall;
    ctx.fillStyle = th.wallFill;
    ctx.strokeStyle = th.wallStroke;
    ctx.lineWidth = 3;
    ctx.fillRect(0, 0, this.W, w);
    ctx.fillRect(0, this.H - w, this.W, w);
    ctx.fillRect(0, 0, w, this.H);
    ctx.fillRect(this.W - w, 0, w, this.H);
    ctx.strokeRect(1.5, 1.5, this.W - 3, this.H - 3);

    /* 障碍物（按主题） */
    for (const o of this.obstacles) {
      ctx.fillStyle = th.obstacleFill;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = th.obstacleStroke;
      ctx.lineWidth = 3;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      /* 内角装饰线 */
      ctx.strokeStyle = th.obstacleStroke;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const L = 12;
      ctx.moveTo(o.x + 4, o.y + 4 + L); ctx.lineTo(o.x + 4, o.y + 4); ctx.lineTo(o.x + 4 + L, o.y + 4);
      ctx.moveTo(o.x + o.w - 4 - L, o.y + o.h - 4); ctx.lineTo(o.x + o.w - 4, o.y + o.h - 4); ctx.lineTo(o.x + o.w - 4, o.y + o.h - 4 - L);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
};
