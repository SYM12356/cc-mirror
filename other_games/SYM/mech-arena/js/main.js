'use strict';
/* ============================================================
 * 入口：Canvas 初始化 + 主循环 + 菜单事件绑定
 * ============================================================ */

(function () {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = CFG.W;
  canvas.height = CFG.H;

  /* null 安全的事件绑定（任一元素缺失不中断后续绑定） */
  function bind(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  /* 菜单事件 */
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === 'single') {
        UI.showMechSelect({ mode: 'single', aiDifficulty: btn.dataset.diff });
      } else if (mode === 'duel') {
        UI.showMechSelect({ mode: 'duel' });
      } else if (mode === 'ranked') {
        UI.showRanked();
      } else if (mode === 'tournament') {
        UI.showTournament();
      } else if (mode === 'training') {
        UI.showTraining();
      } else if (mode === 'survival') {
        UI.showMechSelect({ mode: 'survival' });
      } else if (mode === 'boss') {
        UI.showBossSelect();
      } else if (mode === 'lan') {
        UI.showLan();
      }
    });
  });

  bind('btn-lan-back', () => {
    UI.lanCleanup();
    UI.showMenu();
  });
  bind('btn-boss-back', () => UI.showMenu());
  UI.bindLan();

  bind('btn-help', () => UI.showHelp());
  bind('btn-back-menu', () => UI.showMenu());
  bind('btn-rematch', () => UI.rematch());
  bind('btn-result-menu', () => UI.showMenu());
  bind('btn-hangar', () => UI.showHangar());
  bind('btn-hangar-back', () => UI.showMenu());
  bind('btn-hangar-shop', () => UI.showShop());
  bind('btn-shop', () => UI.showShop());
  bind('btn-shop-back', () => UI.showMenu());
  UI.bindHangar();
  UI.bindShop();
  UI.bindGuide();

  /* 任务中心 */
  bind('btn-quests', () => UI.showQuests());
  bind('btn-quests-back', () => UI.showMenu());
  UI.bindQuests();

  /* 战绩档案 */
  bind('btn-profile', () => UI.showProfile());
  bind('btn-profile-back', () => UI.showMenu());

  /* 设置 */
  bind('btn-settings', () => UI.showSettings());
  bind('btn-settings-back', () => UI.showMenu());
  UI.bindSettings();
  UI.bindTouch();

  /* 排位赛 */
  bind('btn-ranked-back', () => UI.showMenu());
  bind('btn-ranked-start', () => {
    const score = Progress.data.ranked.score;
    const rank = Progress.rankFor(score);
    const diff = rank.min < 1120 ? 'easy' : rank.min < 1240 ? 'normal' : 'hard';
    UI.showMechSelect({ mode: 'single', battleType: 'ranked', aiDifficulty: diff });
  });

  /* 锦标赛 */
  bind('btn-tournament-back', () => UI.showMenu());
  bind('btn-tournament-menu', () => UI.showMenu());
  bind('btn-tournament-start', () => {
    if (!UI.tournament || !UI.tournament.active) UI.showTournament();   /* 重新开赛 */
    if (!UI.tournament.opponent) UI.drawTournamentOpponent();           /* 首轮抽签 */
    UI.drawBracket();
    UI.showMechSelect({ mode: 'single', battleType: 'tournament', aiDifficulty: 'normal' });
  });

  /* 训练场 */
  bind('btn-training-back', () => UI.showMenu());
  document.querySelectorAll('#training-diffs .opt-btn').forEach(b => {
    b.addEventListener('click', () => {
      UI.training.diff = b.dataset.diff;
      UI.refreshTrainingOpts();
    });
  });
  /* 训练场机甲按钮由 showTraining 动态创建时绑定（此处容器启动时为空） */
  bind('btn-training-start', () => {
    const diff = UI.training.diff;
    UI.showMechSelect({
      mode: 'single',
      battleType: 'training',
      aiDifficulty: diff === 'dummy' ? 'easy' : diff,
      aiMech: UI.training.mech,
      aiEnabled: diff !== 'dummy'
    });
  });

  /* 首次交互时解锁音频（pointerdown + 旧浏览器兜底） */
  const unlockAudio = () => {
    SFX.init();
    Music.init();
    Progress.applySettings();
  };
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('mousedown', unlockAudio, { once: true });
  window.addEventListener('touchstart', unlockAudio, { once: true });

  Input.init();
  UI.bindLogin();
  /* 启动门：未登录显示登录屏；已登录直接进主菜单 */
  if (typeof Account !== 'undefined' && Account.isLoggedIn()) {
    Progress.load();
    UI.showMenu();
    UI.maybeShowGuide();
  } else {
    UI.showLogin();
  }

  /* ---------- 主循环 ---------- */
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;

  /* 性能监控：帧时间统计 + 自动降级 + FPS */
  const Perf = {
    samples: [],
    fps: 60,
    slowStreak: 0,

    record(dt) {
      this.samples.push(dt);
      if (this.samples.length > 60) this.samples.shift();
      if (this.samples.length < 60) return;
      const avg = this.samples.reduce((a, b) => a + b, 0) / 60;
      this.fps = Math.round(1 / avg);

      /* 持续掉帧 → 自动降低特效密度 */
      const q = Progress.settings.fxQuality;
      if ((avg > 0.024 && q === 'high') || (avg > 0.034 && q === 'medium')) {
        this.slowStreak++;
        if (this.slowStreak >= 3) {
          this.slowStreak = 0;
          const next = q === 'high' ? 'medium' : 'low';
          Progress.setSetting('fxQuality', next);
          UI.toast(next === 'low' ? '仍较卡顿，已切换低特效模式' : '检测到卡顿，已自动降低特效密度', '#ffd43b');
        }
      } else {
        this.slowStreak = 0;
      }
    }
  };

  /* 异常限频：每秒最多打一条错误日志 */
  let lastErrLog = 0;
  let errStreak = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    try {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 4) {
        if (UI.game) {
          try {
            UI.game.update(STEP);
          } catch (e) {
            /* 单帧异常不中断主循环：限频记录 + 连续异常自动回菜单 */
            const nowMs = performance.now();
            if (nowMs - lastErrLog > 1000) {
              console.error('update error:', e);
              lastErrLog = nowMs;
            }
            if (++errStreak > 120) {
              console.error('持续异常，自动返回主菜单');
              UI.game = null;
              UI.showMenu();
              errStreak = 0;
            }
          }
        } else {
          errStreak = 0;
        }
        acc -= STEP;
        steps++;
      }
      if (steps === 4) acc = 0;

      const t = now / 1000;

      /* 渲染：背景在游戏外时显示菜单底图（渲染异常不中断主循环） */
      ctx.clearRect(0, 0, CFG.W, CFG.H);
      if (UI.game) {
        try {
          UI.game.render(ctx, t);
        } catch (e) {
          const nowMs = performance.now();
          if (nowMs - lastErrLog > 1000) {
            console.error('render error:', e);
            lastErrLog = nowMs;
          }
        }
      } else {
        renderBackdrop(ctx, t);
      }

      /* FPS 显示（设置中开启） */
      if (Progress.settings.showFps) {
        Perf.record(dt);
        ctx.font = '11px "Segoe UI", sans-serif';
        ctx.fillStyle = Perf.fps >= 50 ? 'rgba(81,207,102,0.85)' : Perf.fps >= 30 ? 'rgba(255,212,59,0.9)' : 'rgba(255,107,107,0.95)';
        ctx.fillText('FPS ' + Perf.fps, 10, 16);
      } else {
        Perf.record(dt);
      }
    } catch (e) {
      /* 兜底：任何未包裹段抛错也不跳过按键清空 */
      const nowMs = performance.now();
      if (nowMs - lastErrLog > 1000) {
        console.error('frame error:', e);
        lastErrLog = nowMs;
      }
    } finally {
      Input.endFrame();   // 保证按键边沿清理必执行（防技能/切枪重复触发）
    }
  }

  /* ============================================================
   * 封面背景：深空星云 + 透视网格 + 巨型机甲剪影 + 扫描线 + 数据光点
   * ============================================================ */
  function drawMech(c, cx, cy, t) {
    const L = 210;                       // 基准半宽
    c.save();
    c.translate(cx, cy + Math.sin(t * 0.5) * 9);

    /* 背后光翼（放射线） */
    c.save();
    c.strokeStyle = 'rgba(96,180,255,0.16)';
    c.lineWidth = 2;
    for (let i = 0; i < 11; i++) {
      const a = Math.PI * (0.10 + i * 0.080);
      const len = L * (2.0 + 0.5 * Math.sin(t * 0.8 + i));
      c.beginPath();
      c.moveTo(0, -L * 0.45);
      c.lineTo(Math.cos(a) * len, -L * 0.45 - Math.sin(a) * len);
      c.stroke();
    }
    c.restore();

    /* 肩甲（左 + 镜像右） */
    const pauldron = () => {
      c.beginPath();
      c.moveTo(-L * 0.55, -L * 0.12);
      c.lineTo(-L * 1.08, -L * 0.46);
      c.lineTo(-L * 1.02, -L * 0.04);
      c.lineTo(-L * 0.55, L * 0.24);
      c.closePath();
      c.fill();
      c.stroke();
      /* 肩甲发光槽 */
      c.strokeStyle = 'rgba(120,200,255,0.55)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-L * 0.62, -L * 0.05);
      c.lineTo(-L * 1.0, -L * 0.3);
      c.stroke();
    };
    c.fillStyle = 'rgba(15,25,48,0.92)';
    c.strokeStyle = 'rgba(100,180,255,0.75)';
    c.lineWidth = 2.5;
    pauldron();
    c.save(); c.scale(-1, 1); pauldron(); c.restore();

    /* 胸甲 */
    c.beginPath();
    c.moveTo(-L * 0.56, -L * 0.16);
    c.lineTo(L * 0.56, -L * 0.16);
    c.lineTo(L * 0.42, L * 0.52);
    c.lineTo(-L * 0.42, L * 0.52);
    c.closePath();
    c.fill();
    c.stroke();
    /* 胸甲中线 */
    c.strokeStyle = 'rgba(120,200,255,0.4)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(0, -L * 0.16);
    c.lineTo(0, L * 0.5);
    c.stroke();

    /* 核心灯（脉动） */
    const pulse = 0.55 + 0.45 * Math.sin(t * 2.2);
    c.save();
    c.shadowColor = '#66c2ff';
    c.shadowBlur = 26 * pulse + 8;
    c.fillStyle = `rgba(150,215,255,${0.7 + 0.3 * pulse})`;
    c.beginPath();
    c.arc(0, L * 0.17, 20 + 3 * pulse, 0, Math.PI * 2);
    c.fill();
    c.restore();

    /* 颈部 */
    c.fillStyle = 'rgba(15,25,48,0.95)';
    c.fillRect(-L * 0.15, -L * 0.52, L * 0.30, L * 0.38);

    /* 头部（倒梯形） */
    c.strokeStyle = 'rgba(100,180,255,0.8)';
    c.beginPath();
    c.moveTo(-L * 0.30, -L * 0.52);
    c.lineTo(L * 0.30, -L * 0.52);
    c.lineTo(L * 0.22, -L * 0.98);
    c.lineTo(-L * 0.22, -L * 0.98);
    c.closePath();
    c.fill();
    c.stroke();

    /* 头冠天线 */
    c.strokeStyle = 'rgba(120,200,255,0.8)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, -L * 0.96);
    c.lineTo(0, -L * 1.2);
    c.moveTo(-L * 0.1, -L * 0.94);
    c.lineTo(-L * 0.19, -L * 1.12);
    c.moveTo(L * 0.1, -L * 0.94);
    c.lineTo(L * 0.19, -L * 1.12);
    c.stroke();
    /* 天线顶灯 */
    c.save();
    c.shadowColor = '#ffd43b';
    c.shadowBlur = 12;
    c.fillStyle = '#ffd43b';
    c.beginPath();
    c.arc(0, -L * 1.22, 4.5, 0, Math.PI * 2);
    c.fill();
    c.restore();

    /* 眼睛：发光横条 + 扫描瞳孔 */
    const eyeY = -L * 0.70;
    c.save();
    c.shadowColor = '#7cd4ff';
    c.shadowBlur = 18;
    c.fillStyle = 'rgba(150,220,255,0.95)';
    c.fillRect(-L * 0.18, eyeY, L * 0.36, 8);
    c.fillStyle = '#ffffff';
    const px = Math.sin(t * 1.5) * L * 0.11;
    c.fillRect(px - 3.5, eyeY - 3, 7, 14);
    c.restore();

    c.restore();
  }

  function renderBackdrop(c, t) {
    /* 1. 深空渐变 */
    const g = c.createLinearGradient(0, 0, 0, CFG.H);
    g.addColorStop(0, '#060a16');
    g.addColorStop(0.5, '#0b1430');
    g.addColorStop(1, '#0e1b3c');
    c.fillStyle = g;
    c.fillRect(0, 0, CFG.W, CFG.H);

    /* 2. 星云光斑（缓慢脉动） */
    const neb = (x, y, r, col, a) => {
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = a * (0.72 + 0.28 * Math.sin(t * 0.6 + x * 0.01));
      c.fillStyle = rg;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    };
    neb(CFG.W * 0.18, CFG.H * 0.22, 340, 'rgba(50,90,190,0.55)', 0.5);
    neb(CFG.W * 0.85, CFG.H * 0.18, 300, 'rgba(130,60,190,0.38)', 0.45);
    neb(CFG.W * 0.55, CFG.H * 0.92, 400, 'rgba(28,120,170,0.4)', 0.4);
    c.globalAlpha = 1;

    /* 3. 透视网格地平线 */
    c.strokeStyle = 'rgba(90,150,255,0.14)';
    c.lineWidth = 1;
    const horizon = CFG.H * 0.40;
    for (let i = 0; i <= 12; i++) {
      c.beginPath();
      c.moveTo(CFG.W / 2 + (i - 6) * 150, horizon);
      c.lineTo(CFG.W / 2 + (i - 6) * 28, CFG.H);
      c.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      const yy = horizon + (CFG.H - horizon) * Math.pow(i / 6, 1.7);
      c.beginPath();
      c.moveTo(0, yy);
      c.lineTo(CFG.W, yy);
      c.stroke();
    }

    /* 4. 巨型机甲剪影 */
    drawMech(c, CFG.W / 2, CFG.H * 0.66, t);

    /* 5. 上升数据光点 */
    for (let i = 0; i < 52; i++) {
      const a = Math.sin(t * 0.7 + i * 1.7) * 0.5 + 0.5;
      c.globalAlpha = 0.10 + a * 0.22;
      c.fillStyle = i % 3 === 0 ? '#ffc078' : '#a8c8ff';
      c.beginPath();
      c.arc((i * 97 + Math.sin(i) * 40) % CFG.W, (i * 53 + t * 26) % CFG.H, 1.2 + (i % 3), 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    /* 6. 扫描线（缓慢下移的亮带） */
    const sy = ((t * 80) % (CFG.H + 220)) - 110;
    const sg = c.createLinearGradient(0, sy - 48, 0, sy + 48);
    sg.addColorStop(0, 'rgba(120,190,255,0)');
    sg.addColorStop(0.5, 'rgba(120,190,255,0.07)');
    sg.addColorStop(1, 'rgba(120,190,255,0)');
    c.fillStyle = sg;
    c.fillRect(0, sy - 48, CFG.W, 96);
  }

  requestAnimationFrame(frame);
})();
