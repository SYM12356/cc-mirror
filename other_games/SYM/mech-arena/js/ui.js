'use strict';
/* ============================================================
 * UI：主菜单 / 选机甲 / HUD / 结算
 * ============================================================ */

const UI = {
  game: null,
  lastCfg: null,
  selectStep: 0,          // 选机步骤：0=等P1, 1=等P2
  picked: {},

  el(id) { return document.getElementById(id); },

  show(sel) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    this.el(sel).classList.add('active');
  },

  /* ---------- 主菜单 ---------- */
  showMenu() {
    const el = this.el('menu-coins');
    if (el) el.textContent = Progress.coins();
    const uel = this.el('menu-user');
    if (uel) {
      const user = (typeof Account !== 'undefined' && Account.isLoggedIn()) ? Account.current() : '';
      uel.textContent = user ? `👤 ${user}` : '👤 游客';
    }
    /* 清理僵尸对局：不再每帧 update+render 已结束的战斗，并让菜单底图可见 */
    this.game = null;
    this.netView = null;
    FX.clear();
    Music.start('menu');
    this.show('menu');
  },

  /* ---------- 用户登录 / 注册 / 退出 ---------- */
  _loginMode: 'login',     // 'login' | 'register'

  showLogin() {
    this._loginMode = 'login';
    this._syncLoginTabs();
    this.show('login');
  },

  _syncLoginTabs() {
    const li = this.el('ltab-login'), rg = this.el('ltab-register');
    if (li) li.classList.toggle('sel', this._loginMode === 'login');
    if (rg) rg.classList.toggle('sel', this._loginMode === 'register');
    const p2 = this.el('login-pass2-wrap');
    if (p2) p2.style.display = this._loginMode === 'register' ? 'block' : 'none';
    const go = this.el('btn-login-go');
    if (go) go.textContent = this._loginMode === 'login' ? '登 录' : '注 册 并 登 录';
    const msg = this.el('login-msg');
    if (msg) msg.textContent = '';
  },

  _setLoginMsg(text, isErr) {
    const msg = this.el('login-msg');
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = isErr ? '#ff8787' : '#51cf66';
  },

  _doLoginSubmit() {
    const user = (this.el('login-user').value || '').trim();
    const pw = this.el('login-pass').value || '';
    if (this._loginMode === 'login') {
      if (!user || !pw) { this._setLoginMsg('请输入用户名和密码', true); return; }
      const res = Account.login(user, pw);
      if (!res.ok) { this._setLoginMsg(res.error, true); return; }
    } else {
      const pw2 = this.el('login-pass2').value || '';
      if (pw !== pw2) { this._setLoginMsg('两次输入的密码不一致', true); return; }
      const res = Account.register(user, pw);
      if (!res.ok) { this._setLoginMsg(res.error, true); return; }
    }
    /* 登录/注册成功：载入该账号存档并进入主菜单 */
    Progress.load();
    SFX.pickup();
    this.toast(`欢迎，${Account.current()}！`, '#51cf66');
    this.showMenu();
  },

  bindLogin() {
    const bind = (id, fn) => {
      const el = this.el(id);
      if (el) el.addEventListener('click', fn);
    };
    bind('ltab-login', () => { this._loginMode = 'login'; this._syncLoginTabs(); });
    bind('ltab-register', () => { this._loginMode = 'register'; this._syncLoginTabs(); });
    bind('btn-login-go', () => this._doLoginSubmit());
    /* 回车提交 */
    const onEnter = (e) => { if (e.key === 'Enter') this._doLoginSubmit(); };
    const u = this.el('login-user'), p = this.el('login-pass'), p2 = this.el('login-pass2');
    if (u) u.addEventListener('keydown', onEnter);
    if (p) p.addEventListener('keydown', onEnter);
    if (p2) p2.addEventListener('keydown', onEnter);
    /* 游客：跳过登录（存档 key 用 guest） */
    bind('btn-login-skip', () => {
      Progress.load();
      this.toast('以游客身份游玩（进度不保存）', '#4dabf7');
      this.showMenu();
    });
    /* 主菜单退出登录 */
    bind('btn-logout', () => {
      if (!confirm('确定退出登录吗？当前账号进度会保留在账号下。')) return;
      Account.logout();
      this.game = null;
      this.netView = null;
      Progress.load();          // 切回 guest 档
      this.showLogin();
    });
  },

  /* ---------- 轻提示 ---------- */
  toast(msg, color) {
    const t = this.el('toast');
    t.textContent = msg;
    t.style.borderColor = color || '#4dabf7';
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  },

  /* ---------- 机库 ---------- */
  showHangar() {
    this.renderHangar();
    this.show('hangar');
  },

  renderHangar() {
    this.el('hangar-coins').textContent = Progress.coins();
    const md = this.el('hangar-medals');
    if (md) md.textContent = Progress.medals();
    const box = this.el('hangar-mechs');
    box.innerHTML = '';

    for (const id of Object.keys(CFG.MECHS)) {
      const m = CFG.MECHS[id];
      const save = Progress.mech(id);
      const card = document.createElement('div');
      card.className = 'hangar-card' + (save.unlocked ? '' : ' locked');
      card.style.setProperty('--mc', m.color);

      if (!save.unlocked) {
        const cost = Progress.SHOP.chassis[id];
        card.innerHTML = `
          <div class="h-lock">🔒</div>
          <div class="h-name" style="color:${m.color}">${m.name}</div>
          <div class="h-desc">${m.desc}</div>
          <button class="h-unlock" data-id="${id}" data-cost="${cost}">
            解锁 · ${cost} 🪙
          </button>`;
      } else {
        const b = Progress.bonuses(id);
        const avail = Progress.availPoints(id);
        const need = Progress.expNeed(save.level);
        const pct = Math.min(100, Math.round(save.exp / need * 100));
        const ld = Progress.getLoadout(id);
        const passive = m.passive ? `<div class="h-passive">被动 · <b>${m.passive.name}</b>（${m.passive.desc}）</div>` : '';
        const loadoutRows = m.slots.map((type, i) => {
          const opts = Object.keys(CFG.WEAPONS)
            .filter(w => Progress.hasWeapon(w))
            .map(w => `<option value="${w}" ${ld[i] === w ? 'selected' : ''}>${CFG.WEAPONS[w].name}</option>`)
            .join('');
          return `<div class="h-lo-row"><span>${type === 'sub' ? '副' : '主'}武器 ${i + 1}</span><select class="h-select" data-id="${id}" data-slot="${i}">${opts}</select></div>`;
        }).join('');
        const plugOpts = '<option value="">无插件</option>' + Object.keys(CFG.PLUGINS)
          .filter(p => Progress.hasPlugin(p))
          .map(p => `<option value="${p}" ${save.plug === p ? 'selected' : ''}>${CFG.PLUGINS[p].name}</option>`)
          .join('');
        const curSkin = Progress.skinFor(id);
        const skinOpts = (CFG.SKINS[id] || []).map(sk => {
          const owned = sk.cost <= 0 || Progress.hasSkin(sk.id);
          return `<option value="${sk.id}" ${curSkin && curSkin.id === sk.id ? 'selected' : ''} ${owned ? '' : 'disabled'}>${sk.name}${owned ? '' : ' 🔒'}</option>`;
        }).join('');
        const lockInfo = Object.entries(Progress.SHOP.weapons)
          .filter(([w]) => !Progress.hasWeapon(w))
          .map(([w, c]) => `🔒${CFG.WEAPONS[w].name} ${c}🪙`)
          .join('　');
        card.innerHTML = `
          <div class="h-head">
            <span class="h-name" style="color:${m.color}">${m.name}</span>
            <span class="h-level">Lv.${save.level}</span>
          </div>
          <div class="h-exp"><i style="width:${pct}%"></i></div>
          <div class="h-exp-text">${save.exp} / ${need} EXP</div>
          <div class="h-stats">
            装甲 <b>${Math.round(m.hp * b.hpMult)}</b> · 速度 <b>${Math.round(m.speed * b.speedMult * (m.passive && m.passive.type === 'speedUp' ? 1 + m.passive.value : 1))}</b> · 火力 <b>+${Math.round((b.dmgMult - 1) * 100)}%</b> · 技能 <b>-${Math.round((1 - b.cdMult) * 100)}%</b> CD
          </div>
          ${passive}
          <div class="h-loadout">${loadoutRows}
            <div class="h-lo-row"><span>插件</span><select class="h-select h-plug" data-id="${id}">${plugOpts}</select></div>
            <div class="h-lo-row"><span>涂装</span><select class="h-select h-skin" data-id="${id}">${skinOpts}</select></div>
          </div>
          ${lockInfo ? `<div class="h-lockinfo">${lockInfo}</div>` : ''}
          <div class="h-pts">可用属性点 <b>${avail}</b></div>
          <div class="h-up">
            ${Object.entries(Progress.STATS).map(([k, s]) => `
              <div class="h-up-row">
                <span>${s.name} <i>${save.pts[k]}/${s.max}</i></span>
                <button class="h-btn" data-id="${id}" data-stat="${k}"
                  ${avail <= 0 || save.pts[k] >= s.max ? 'disabled' : ''}>+1</button>
              </div>`).join('')}
          </div>
          <div class="h-desc">${m.desc}</div>`;
      }
      box.appendChild(card);
    }
  },

  /* 机库按钮事件（事件委托） */
  bindHangar() {
    const box = this.el('hangar-mechs');
    box.addEventListener('click', (e) => {
      const unlockBtn = e.target.closest('.h-unlock');
      if (unlockBtn) {
        const id = unlockBtn.dataset.id;
        const cost = +unlockBtn.dataset.cost;
        if (Progress.buyChassis(id)) {
          this.toast(`🔓 已解锁 ${CFG.MECHS[id].name}！`, '#51cf66');
          SFX.pickup();
          this.renderHangar();
        } else {
          this.toast(`🪙 金币不足（需 ${cost}），多打几局吧！`, '#ff8787');
        }
        return;
      }
      const btn = e.target.closest('.h-btn');
      if (btn) {
        const { id, stat } = btn.dataset;
        if (Progress.spendPoint(id, stat)) {
          this.toast(`+1 ${Progress.STATS[stat].name}（${Progress.STATS[stat].desc}）`, '#ffd43b');
          SFX.tone(660, 0.08, 'sine', 0.2);
          this.renderHangar();
        } else {
          this.toast('没有可用属性点，升级机甲获取', '#ff8787');
        }
        return;
      }
    });
    /* select 下拉框必须用 change 事件（click 在展开时触发，读到的还是旧值） */
    box.addEventListener('change', (e) => {
      const skinSel = e.target.closest('.h-skin');
      if (skinSel) {
        if (Progress.equipSkin(skinSel.dataset.id, skinSel.value)) {
          this.toast(`🎨 已装备涂装：${Progress.skinFor(skinSel.dataset.id).name}`, '#ffd43b');
          SFX.tone(600, 0.08, 'sine', 0.18);
          this.renderHangar();
        }
        return;
      }
      const plugSel = e.target.closest('.h-plug');
      if (plugSel) {
        const id = plugSel.dataset.id;
        if (Progress.setPlug(id, plugSel.value || null)) {
          this.toast(plugSel.value ? `🧩 已安装 ${CFG.PLUGINS[plugSel.value].name}` : '插件已卸载', '#22b8cf');
          SFX.tone(560, 0.08, 'sine', 0.18);
          this.renderHangar();
        }
        return;
      }
      const sel = e.target.closest('.h-select');
      if (sel) {
        const { id } = sel.dataset;
        const slot = +sel.dataset.slot;
        if (Progress.setLoadout(id, slot, sel.value)) {
          this.toast(`⚙ 已装备 ${CFG.WEAPONS[sel.value].name}`, '#4dabf7');
          SFX.tone(520, 0.06, 'square', 0.12);
          this.renderHangar();
        }
      }
    });
  },

  /* ---------- 商店 ---------- */
  showShop() {
    this.renderShop();
    this.show('shop');
  },

  renderShop() {
    this.el('shop-coins').textContent = Progress.coins();
    const sm = this.el('shop-medals');
    if (sm) sm.textContent = Progress.medals();
    const box = this.el('shop-items');
    box.innerHTML = '';

    /* 底盘分区 */
    box.appendChild(this.shopSection('🛠 底盘'));
    for (const id of Object.keys(CFG.MECHS)) {
      const m = CFG.MECHS[id];
      box.appendChild(this.shopCard({
        id, type: 'chassis',
        name: m.name, desc: m.desc, color: m.color,
        owned: Progress.isUnlocked(id),
        cost: Progress.SHOP.chassis[id],
        extra: `被动：${m.passive.name}（${m.passive.desc}）　技能：${CFG.SKILLS[m.skill].name}`
      }));
    }

    /* 武器分区 */
    box.appendChild(this.shopSection('🔫 武器'));
    for (const id of Object.keys(CFG.WEAPONS)) {
      const w = CFG.WEAPONS[id];
      let extra = `伤害 ${w.dmg} · 射速 ${(1 / w.rate).toFixed(1)}/s`;
      if (w.pellets) extra += ' · 6 弹丸';
      if (w.homing) extra += ' · 追踪';
      if (w.aoe) extra += w.fire ? ' · 近距灼烧' : (w.spark ? ' · 电击溅射' : ' · 范围爆炸');
      if (w.burn) extra += ' · 点燃地面';
      if (w.bounce) extra += ' · 弹墙反弹';
      if (w.heatPerShot) extra += ' · 过热机制';
      if (w.pierce) extra += ' · 穿透';
      if (w.slow) extra += ' · 减速';
      if (w.dot) extra += ' · 中毒';
      if (w.tracer) extra += ' · 超远程';
      box.appendChild(this.shopCard({
        id, type: 'weapon',
        name: w.name, desc: w.desc, color: w.color,
        owned: Progress.hasWeapon(id),
        cost: Progress.SHOP.weapons[id],
        extra
      }));
    }

    /* 徽章商店分区 */
    box.appendChild(this.shopSection('🏅 徽章商店（胜利获得，可兑换）'));
    for (const [id, item] of Object.entries(CFG.MEDAL_SHOP)) {
      box.appendChild(this.shopCard({
        id, type: 'medal-item',
        name: item.icon + ' ' + item.name, desc: item.desc, color: '#ffd43b',
        owned: false, cost: item.cost, costIcon: '🏅', costLabel: '兑换',
        extra: '🏅 徽章兑换'
      }));
    }
    for (const [mechId, list] of Object.entries(CFG.SKINS)) {
      for (const skin of list) {
        if (skin.cost <= 0) continue;
        box.appendChild(this.shopCard({
          id: mechId + ':' + skin.id, type: 'skin',
          name: CFG.MECHS[mechId].name.split('·')[0] + ' · ' + skin.name,
          desc: '机甲外观涂装（购买后自动装备）', color: skin.color,
          owned: Progress.hasSkin(skin.id), cost: skin.cost, costIcon: '🏅', costLabel: '兑换',
          extra: '🏅 徽章兑换'
        }));
      }
    }

    /* 插件分区 */
    box.appendChild(this.shopSection('🧩 插件'));
    for (const id of Object.keys(CFG.PLUGINS)) {
      const p = CFG.PLUGINS[id];
      box.appendChild(this.shopCard({
        id, type: 'plugin',
        name: p.name, desc: p.desc, color: p.color,
        owned: Progress.hasPlugin(id),
        cost: Progress.SHOP.plugins[id],
        extra: '每台底盘可安装 1 个插件'
      }));
    }
  },

  favoriteMech() {
    const mg = Progress.data.stats.mechGames || {};
    let best = null, bestN = 0;
    for (const [id, n] of Object.entries(mg)) {
      if (n > bestN) { bestN = n; best = id; }
    }
    return best || 'tank';
  },

  shopSection(text) {
    const d = document.createElement('div');
    d.className = 'shop-section';
    d.textContent = text;
    return d;
  },

  shopCard(item) {
    const div = document.createElement('div');
    div.className = 'shop-item' + (item.owned ? ' owned' : '');
    div.style.setProperty('--mc', item.color);
    div.innerHTML = `
      <div class="si-name" style="color:${item.color}">${item.name}</div>
      <div class="si-desc">${item.desc}</div>
      <div class="si-extra">${item.extra}</div>
      <div class="si-bottom">
        ${item.owned
          ? '<span class="si-owned">✓ 已拥有</span>'
          : `<button class="si-buy" data-type="${item.type}" data-id="${item.id}">${item.costLabel || '购买'} · ${item.cost} ${item.costIcon || '🪙'}</button>`}
      </div>`;
    return div;
  },

  bindShop() {
    const box = this.el('shop-items');
    box.addEventListener('click', (e) => {
      const btn = e.target.closest('.si-buy');
      if (!btn) return;
      const { type, id } = btn.dataset;
      if (type === 'medal-item') {
        const item = CFG.MEDAL_SHOP[id];
        const fav = this.favoriteMech();
        const r = Progress.redeemMedal(id, fav);
        if (r.ok) {
          this.toast(`✓ 兑换 ${item.name}！`, '#ffd43b');
          SFX.pickup();
          this.renderShop();
        } else {
          this.toast(`🏅 徽章不足（需 ${item.cost}），多打胜仗吧！`, '#ff8787');
        }
        return;
      }
      if (type === 'skin') {
        const [mechId, skinId] = id.split(':');
        if (Progress.buySkin(mechId, skinId)) {
          const skin = Progress.skinFor(mechId);
          this.toast(`✓ 获得并装备 ${skin.name}！`, '#ffd43b');
          SFX.pickup();
          this.renderShop();
        } else {
          this.toast('🏅 徽章不足', '#ff8787');
        }
        return;
      }
      const cost = (type === 'chassis' ? Progress.SHOP.chassis : type === 'weapon' ? Progress.SHOP.weapons : Progress.SHOP.plugins)[id];
      const ok = type === 'chassis' ? Progress.buyChassis(id) : type === 'weapon' ? Progress.buyWeapon(id) : Progress.buyPlugin(id);
      if (ok) {
        const name = type === 'chassis' ? CFG.MECHS[id].name : type === 'weapon' ? CFG.WEAPONS[id].name : CFG.PLUGINS[id].name;
        this.toast(`✓ 已购买 ${name}！`, '#51cf66');
        SFX.pickup();
        this.renderShop();
      } else {
        this.toast(`🪙 金币不足（需 ${cost}）`, '#ff8787');
      }
    });
  },

  /* 基础奖励行（金币/经验/首胜/升级） */
  rewardRows(reward) {
    let html = `<div class="reward-row">🪙 金币 <b>+${reward.coins}</b>　·　EXP <b>+${reward.expGain}</b></div>`;
    if (reward.medalsGained) html += `<div class="reward-row bonus">🏅 徽章 <b>+${reward.medalsGained}</b></div>`;
    if (reward.firstWin) html += `<div class="reward-row bonus">🎁 每日首胜奖励 +${Progress.REWARD.firstWinCoins}</div>`;
    if (reward.leveled) html += `<div class="reward-row levelup">⬆ 机甲升至 Lv.${reward.level}，获得 1 属性点！</div>`;
    return html;
  },

  /* ---------- 排位赛 ---------- */
  showRanked() {
    this.refreshRanked();
    this.show('ranked');
  },

  refreshRanked() {
    const d = Progress.data.ranked;
    const { rank, pct } = Progress.rankProgress(d.score);
    this.el('ranked-coins').textContent = Progress.coins();
    this.el('rank-badge').textContent = rank.icon;
    this.el('rank-badge').style.color = rank.color;
    this.el('rank-badge').style.borderColor = rank.color;
    this.el('rank-badge').style.textShadow = `0 0 22px ${rank.color}`;
    this.el('rank-name').textContent = rank.name;
    this.el('rank-name').style.color = rank.color;
    this.el('rank-score').innerHTML = `分数 <b>${d.score}</b>`;
    this.el('rank-bar-fill').style.width = pct + '%';
    this.el('rank-bar-fill').style.background = rank.color;
    this.el('rank-wins').textContent = d.wins;
    this.el('rank-losses').textContent = d.losses;
    this.el('rank-champs').textContent = Progress.data.tournament.champions;
  },

  /* ---------- 锦标赛 ---------- */
  showTournament() {
    /* 未激活 → 新开一届：7 名 AI 机师 */
    if (!this.tournament || !this.tournament.active) {
      const aiMechs = Object.keys(CFG.MECHS);
      const others = [];
      for (let i = 0; i < 7; i++) {
        others.push({ name: 'AI-' + (i + 1), mech: U.pick(aiMechs) });
      }
      this.tournament = { active: true, round: 1, others, opponent: null };
    }
    this.el('tournament-champs').textContent = Progress.data.tournament.champions;
    this.drawBracket();
    this.el('btn-tournament-start').style.display = '';
    this.el('btn-tournament-menu').style.display = 'none';
    this.show('tournament');
  },

  /* 抽取本轮对手（从剩余选手中随机一名） */
  drawTournamentOpponent() {
    const t = this.tournament;
    if (!t.others.length) return false;
    const idx = Math.floor(Math.random() * t.others.length);
    t.opponent = t.others.splice(idx, 1)[0];
    return true;
  },

  /* 模拟其他 AI 对局 */
  simulateOthers() {
    const t = this.tournament;
    const winners = [];
    for (let i = 0; i + 1 < t.others.length; i += 2) {
      winners.push(Math.random() < 0.5 ? t.others[i] : t.others[i + 1]);
    }
    if (t.others.length % 2 === 1) winners.push(t.others[t.others.length - 1]);
    t.others = winners;
  },

  /* 回合结算：返回奖励 HTML 片段 */
  tournamentRoundEnd(win) {
    const t = this.tournament;
    if (!t || !t.active) return '';
    const roundName = t.round === 1 ? '八强赛' : t.round === 2 ? '半决赛' : '决赛';

    if (!win) {
      t.active = false;
      this.el('btn-tournament-start').style.display = 'none';
      this.el('btn-tournament-menu').style.display = '';
      return `<div class="reward-row" style="color:#ff8787">🏆 ${roundName}出局，遗憾淘汰</div>`;
    }

    this.simulateOthers();
    t.round++;

    if (t.round > 3) {
      /* 夺冠 */
      t.active = false;
      const champs = Progress.addChampion();
      this.el('btn-tournament-start').style.display = 'none';
      this.el('btn-tournament-menu').style.display = '';
      SFX.win();
      return `<div class="reward-row levelup">🏆🏆 夺得锦标赛冠军！奖金 +${Progress.TOURNAMENT.championCoins} 🪙（累计 ${champs} 冠）</div>`;
    }

    /* 晋级，抽取下一轮对手并更新对阵 */
    this.drawTournamentOpponent();
    this.drawBracket();
    const nextName = t.round === 2 ? '半决赛' : '决赛';
    return `<div class="reward-row levelup">🏆 晋级${nextName}！对手：${t.opponent.name}（${CFG.MECHS[t.opponent.mech].name}）</div>`;
  },

  drawBracket() {
    const t = this.tournament;
    const roundName = t.round === 1 ? '八强赛' : t.round === 2 ? '半决赛' : '决赛';
    this.el('tournament-title').textContent = `${roundName} · 8 人淘汰赛 第 ${t.round} 轮`;

    const box = this.el('tournament-bracket');
    box.innerHTML = '';

    /* 你的比赛 */
    if (t.opponent) {
      box.appendChild(this.bracketMatch('你', null, t.opponent.name, t.opponent.mech, true));
    } else {
      box.appendChild(this.bracketMatch('你', null, '等待抽签', null, true));
    }

    /* 其他 AI 对局 */
    for (let i = 0; i + 1 < t.others.length; i += 2) {
      box.appendChild(this.bracketMatch(t.others[i].name, t.others[i].mech, t.others[i + 1].name, t.others[i + 1].mech, false));
    }
    if (t.others.length % 2 === 1) {
      const last = t.others[t.others.length - 1];
      box.appendChild(this.bracketMatch(last.name, last.mech, '轮空', null, false));
    }
  },

  bracketMatch(aName, aMech, bName, bMech, mine) {
    const div = document.createElement('div');
    div.className = 'bracket-match' + (mine ? ' mine' : '');
    const side = (name, mech) => {
      const color = mech ? CFG.MECHS[mech].color : '#ffd43b';
      const isMe = !mech && mine;
      return `<span class="bm-side ${isMe ? 'me' : ''}"><i style="background:${color};box-shadow:0 0 8px ${color}"></i>${name}${isMe ? ' ★' : ''}</span>`;
    };
    div.innerHTML = side(aName, aMech) + '<span class="bm-vs">VS</span>' + side(bName, bMech);
    return div;
  },

  /* ---------- 训练场 ---------- */
  showTraining() {
    if (!this.training) this.training = { diff: 'easy', mech: 'scout' };
    this.el('training-coins').textContent = Progress.coins();
    const box = this.el('training-mechs');
    if (!box.children.length) {
      for (const id of Object.keys(CFG.MECHS)) {
        const m = CFG.MECHS[id];
        const b = document.createElement('button');
        b.className = 'opt-btn';
        b.dataset.mech = id;
        b.textContent = m.name.split('·')[0];
        b.style.setProperty('--mc', m.color);
        /* 动态创建的按钮必须在此绑定（启动时容器为空，main.js 绑不上） */
        b.addEventListener('click', () => {
          this.training.mech = id;
          this.refreshTrainingOpts();
        });
        box.appendChild(b);
      }
    }
    this.refreshTrainingOpts();
    this.show('training');
  },

  refreshTrainingOpts() {
    document.querySelectorAll('#training-diffs .opt-btn').forEach(b => {
      b.classList.toggle('sel', b.dataset.diff === this.training.diff);
    });
    document.querySelectorAll('#training-mechs .opt-btn').forEach(b => {
      b.classList.toggle('sel', b.dataset.mech === this.training.mech);
    });
  },

  /* ---------- 生存模式结算 ---------- */
  showSurvivalResult(s) {
    const reward = Progress.finishSurvival(s.player.mech.id, s.wave, s.kills);

    this.el('result-title').textContent = '生存结束';
    this.el('result-title').style.color = '#ff8c42';
    this.el('result-sub').innerHTML =
      `坚持到 <b style="color:#ffd43b">第 ${s.wave} 波</b>${reward.newBest ? '　<span style="color:#51cf66">★ 新纪录！</span>' : ''}`;
    this.el('result-info').innerHTML = `
      <div>击杀 <b>${s.kills}</b> 个敌人 · 最高纪录 <b>${reward.bestWave}</b> 波</div>
      <div>地图 <b>${s.map.theme.name}</b> · 用时 ${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}</div>
    `;
    let rewardHtml = `<div class="reward-row">🪙 金币 <b>+${reward.coins}</b>　·　EXP <b>+${reward.expGain}</b></div>`;
    if (reward.medalsGained) rewardHtml += `<div class="reward-row bonus">🏅 徽章 <b>+${reward.medalsGained}</b></div>`;
    if (reward.leveled) rewardHtml += `<div class="reward-row levelup">⬆ 机甲升至 Lv.${reward.level}，获得 1 属性点！</div>`;
    this.el('result-reward').innerHTML = rewardHtml;

    const ach = Progress.checkAchievements();
    if (ach.length) {
      this.toast(`🏆 达成成就：${ach[0].name} +${ach[0].reward}🪙！`, '#ffd43b');
    }

    SFX.lose();
    this.show('result');
  },

  /* 生存模式 HUD */
  drawSurvivalHUD(s, ctx, t) {
    /* 顶部：波次 + 敌人剩余 */
    const remaining = s.spawnQueue.length + s.enemies.filter(e => !e.dead).length;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 26px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(`第 ${s.wave} 波`, CFG.W / 2 + 1, 29);
    ctx.fillStyle = '#ffd43b';
    ctx.shadowColor = 'rgba(255,212,59,0.7)';
    ctx.shadowBlur = 12;
    ctx.fillText(`第 ${s.wave} 波`, CFG.W / 2, 28);
    ctx.shadowBlur = 0;
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(220,235,255,0.95)';
    ctx.fillText(`敌人 ×${remaining} · 击杀 ${s.kills} · ${s.map.theme.name}`, CFG.W / 2, 56);

    /* 准备倒计时 */
    if (s.state === 'prepare') {
      const n = Math.ceil(s.prepareT);
      ctx.font = 'bold 44px "Segoe UI", sans-serif';
      ctx.fillStyle = n > 1 ? '#bfe3ff' : '#ffd43b';
      ctx.fillText(`第 ${s.wave + 1} 波来袭：${n}`, CFG.W / 2, CFG.H / 2 - 60);
    }

    /* 玩家面板 */
    this.drawPlayerPanel(ctx, s.player, 16, 12, 'left', t);
    this.drawWeaponBar(ctx, s.player, 16, CFG.H - 64, 'left');
    this.drawUltiBar(ctx, s.player, CFG.W / 2 - 220, CFG.H - 90, 'left', t);

    /* 操作提示 */
    if (s.time < 6 && s.state === 'prepare') {
      ctx.globalAlpha = 0.85;
      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('WASD 移动 · J 开火 · K/Q 切换武器 · L 技能 · 空格 大招', CFG.W / 2, CFG.H - 30);
      ctx.globalAlpha = 1;
    }
  },

  /* ---------- 任务（成就 + 每日） ---------- */
  showQuests() {
    this.renderQuests();
    this.show('quests');
  },

  renderQuests() {
    this.el('quests-coins').textContent = Progress.coins();

    /* 每日任务 */
    const daily = Progress.getDaily();
    const dBox = this.el('quests-daily');
    dBox.innerHTML = '';
    daily.tasks.forEach((task, idx) => {
      const pool = Progress.DAILY_POOL.find(p => p.id === task.id);
      if (!pool) return;   // 过期任务兜底
      const pct = Math.min(100, Math.round(task.prog / pool.target * 100));
      const div = document.createElement('div');
      div.className = 'quest-item' + (task.claimed ? ' claimed' : task.done ? ' done' : '');
      div.innerHTML = `
        <div class="q-info">
          <div class="q-name">${pool.name} <span>${task.prog}/${pool.target}</span></div>
          <div class="q-bar"><i style="width:${pct}%"></i></div>
        </div>
        <div class="q-reward">+${pool.reward} 🪙</div>
        ${task.claimed ? '<span class="q-state">已领取</span>'
          : task.done ? `<button class="q-claim" data-idx="${idx}">领取</button>`
          : '<span class="q-state">进行中</span>'}`;
      dBox.appendChild(div);
    });

    /* 成就 */
    const aBox = this.el('quests-achievements');
    aBox.innerHTML = '';
    for (const a of Progress.ACHIEVEMENTS) {
      const got = Progress.isAchieved(a.id);
      const div = document.createElement('div');
      div.className = 'ach-item' + (got ? ' got' : '');
      div.innerHTML = `
        <span class="ach-icon">${got ? '🏆' : '🔒'}</span>
        <div class="ach-info">
          <div class="ach-name">${a.name} <small>+${a.reward}🪙</small></div>
          <div class="ach-desc">${a.desc}</div>
        </div>`;
      aBox.appendChild(div);
    }
  },

  bindQuests() {
    const dBox = this.el('quests-daily');
    dBox.addEventListener('click', (e) => {
      const btn = e.target.closest('.q-claim');
      if (!btn) return;
      const reward = Progress.claimDaily(+btn.dataset.idx);
      if (reward) {
        this.toast(`✓ 每日任务完成 +${reward} 🪙`, '#51cf66');
        SFX.pickup();
        this.renderQuests();
      }
    });
  },

  /* ---------- 设置 ---------- */
  showSettings() {
    const s = Progress.settings;
    const vol = this.el('set-volume');
    vol.value = Math.round(s.volume * 100);
    document.querySelectorAll('#settings .fx-opt').forEach(b => {
      b.classList.toggle('sel', b.dataset.fx === s.fxQuality);
    });
    this.el('set-shake').checked = s.screenShake;
    this.el('set-fps').checked = !!s.showFps;
    this.el('set-music').checked = !!s.music;
    this.renderKeybinds();
    this.show('settings');
  },

  /* 渲染键位配置面板 */
  renderKeybinds() {
    const box = this.el('keybind-list');
    if (!box) return;
    box.innerHTML = '';
    const keyName = (code) => {
      if (!code) return '—';
      const map = {
        'Space': '空格', 'ShiftLeft': '左Shift', 'ShiftRight': '右Shift',
        'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
        'ControlLeft': '左Ctrl', 'ControlRight': '右Ctrl',
        'Enter': '回车', 'Slash': '/', 'Period': '.', 'Comma': ',', 'Backslash': '\\', 'Quote': "'", 'Semicolon': ';'
      };
      return map[code] || code.replace('Key', '');
    };
    for (const player of ['p1', 'p2']) {
      const head = document.createElement('div');
      head.className = 'kb-head';
      head.textContent = player === 'p1' ? '玩家 1（WASD 区）' : '玩家 2（方向键区）';
      box.appendChild(head);
      for (const action of ['up', 'down', 'left', 'right', 'fire', 'sub', 'skill', 'swap', 'ulti']) {
        const row = document.createElement('div');
        row.className = 'kb-row';
        const label = document.createElement('span');
        label.className = 'kb-label';
        label.textContent = Input.ACTION_NAMES[action];
        const btn = document.createElement('button');
        btn.className = 'btn ghost small kb-btn';
        btn.dataset.player = player;
        btn.dataset.action = action;
        btn.textContent = keyName(Input.BINDINGS[player][action]);
        row.appendChild(label);
        row.appendChild(btn);
        box.appendChild(row);
      }
    }
    /* 重绑定：点击后进入监听态 */
    box.querySelectorAll('.kb-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prev = btn.textContent;
        btn.textContent = '按任意键...';
        btn.classList.add('recording');
        const player = btn.dataset.player, action = btn.dataset.action;
        const onKey = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.removeEventListener('keydown', onKey, true);
          const code = e.code;
          btn.classList.remove('recording');
          if (code === 'Escape') { btn.textContent = prev; return; }
          const res = Input.setBinding(player, action, code);
          if (res.ok) {
            btn.textContent = keyName(code);
            this.toast(`已绑定：${Input.ACTION_NAMES[action]} → ${keyName(code)}`, '#51cf66');
            this.renderKeybinds();
          } else {
            this.toast('⚠ ' + res.error, '#ff8787');
            btn.textContent = prev;
          }
        };
        window.addEventListener('keydown', onKey, true);
      });
    });
    /* 重置按钮 */
    for (const player of ['p1', 'p2']) {
      const reset = document.createElement('button');
      reset.className = 'btn ghost small kb-reset';
      reset.textContent = `重置${player === 'p1' ? 'P1' : 'P2'}键位`;
      reset.addEventListener('click', () => {
        Input.resetBindings(player);
        this.toast(`${player === 'p1' ? 'P1' : 'P2'} 键位已恢复默认`, '#4dabf7');
        this.renderKeybinds();
      });
      box.appendChild(reset);
    }
  },

  bindSettings() {
    this.el('set-volume').addEventListener('input', (e) => {
      Progress.setSetting('volume', +e.target.value / 100);
      this.el('set-volume-label').textContent = e.target.value + '%';
    });
    document.querySelectorAll('#settings .fx-opt').forEach(b => {
      b.addEventListener('click', () => {
        Progress.setSetting('fxQuality', b.dataset.fx);
        document.querySelectorAll('#settings .fx-opt').forEach(x => x.classList.toggle('sel', x === b));
        this.toast(`特效密度：${b.textContent}`, '#4dabf7');
      });
    });
    this.el('set-shake').addEventListener('change', (e) => {
      Progress.setSetting('screenShake', e.target.checked);
    });
    this.el('set-fps').addEventListener('change', (e) => {
      Progress.setSetting('showFps', e.target.checked);
    });
    this.el('set-music').addEventListener('change', (e) => {
      Progress.setSetting('music', e.target.checked);
      this.toast(e.target.checked ? '🎵 背景音乐已开启' : '🔇 背景音乐已关闭', '#4dabf7');
    });
    this.el('btn-reset-save').addEventListener('click', () => {
      if (confirm('确定要重置全部存档吗？金币/等级/成就都将清空！')) {
        Progress.resetSave();
        location.reload();
      }
    });

    /* 存档导出：下载 JSON 文件 */
    this.el('btn-export-save').addEventListener('click', () => {
      const blob = new Blob([Progress.exportSave()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'mech-arena-save-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      this.toast('📤 存档已导出', '#51cf66');
    });

    /* 存档导入：读取文件并校验 */
    this.el('btn-import-save').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        if (!confirm(`将用文件「${file.name}」覆盖当前存档，确定吗？`)) return;
        const reader = new FileReader();
        reader.onload = () => {
          const res = Progress.importSave(String(reader.result));
          if (res.ok) {
            this.toast('📥 存档导入成功，已生效', '#51cf66');
            this.showMenu();
          } else {
            this.toast('⚠ ' + res.error, '#ff8787');
          }
        };
        reader.onerror = () => this.toast('⚠ 文件读取失败', '#ff8787');
        reader.readAsText(file);
      });
      input.click();
    });
  },

  /* ---------- 移动端触控（虚拟摇杆 + 按键） ---------- */
  bindTouch() {
    /* 防御：无 window/navigator 的测试环境直接跳过 */
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!isTouch) return;                 // 非触屏设备不显示
    const ui = this.el('touch-ui');
    if (!ui) return;
    ui.classList.add('visible');

    const stick = this.el('t-stick');
    const knob = this.el('t-stick-knob');
    const STICK_R = 52;                   // 摇杆活动半径（px）
    let stickId = null, baseX = 0, baseY = 0;

    /* 摇杆：pointer 事件（含鼠标，触屏用 touch） */
    const stickDown = (e) => {
      if (stickId !== null) return;
      stickId = e.pointerId;
      const rect = stick.getBoundingClientRect();
      baseX = rect.left + rect.width / 2;
      baseY = rect.top + rect.height / 2;
      stick.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const stickMove = (e) => {
      if (e.pointerId !== stickId) return;
      let dx = e.clientX - baseX, dy = e.clientY - baseY;
      const m = Math.hypot(dx, dy);
      if (m > STICK_R) { dx = dx / m * STICK_R; dy = dy / m * STICK_R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      Input.setTouchAxis(dx / STICK_R, dy / STICK_R);
    };
    const stickUp = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      knob.style.transform = 'translate(0,0)';
      Input.clearTouchAxis();
    };
    stick.addEventListener('pointerdown', stickDown);
    stick.addEventListener('pointermove', stickMove);
    stick.addEventListener('pointerup', stickUp);
    stick.addEventListener('pointercancel', stickUp);

    /* 动作按钮：按下即触发（按住保持，抬起释放） */
    document.querySelectorAll('#touch-ui .t-btn').forEach(btn => {
      const act = btn.dataset.act;
      const down = (e) => {
        e.preventDefault();
        if (btn.dataset.touchId !== undefined) return;
        btn.dataset.touchId = e.pointerId;
        btn.classList.add('t-active');
        Input.setTouchButton(act, true);
        Input._noteTouchPress(act);       // 边沿触发：技能/切枪/大招只需按下瞬间
        /* 长按开火无需额外处理；技能类瞬间触发后立即释放 */
        if (act !== 'fire') {
          Input.setTouchButton(act, false);
          btn.dataset.touchId = undefined;
          btn.classList.remove('t-active');
        }
      };
      const up = (e) => {
        if (String(btn.dataset.touchId) !== String(e.pointerId)) return;
        btn.dataset.touchId = undefined;
        btn.classList.remove('t-active');
        Input.setTouchButton(act, false);
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    });
  },

  /* HTML 转义（防局域网消息注入） */
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  /* ---------- 局域网对战 ---------- */
  showLan() {
    this.lanHostMech = null;
    this.lanGuest = null;
    this.lanSpectator = false;
    this.chatMsgs = [];
    this.el('lan-status').innerHTML = '';
    this.el('lan-status').classList.remove('active');
    this.el('lan-chat-list').innerHTML = '';
    this.show('lan');
  },

  bindLan() {
    this.el('btn-lan-create').addEventListener('click', () => {
      if (Net.connected) { this.toast('已连接，请先断开', '#ffd43b'); return; }
      Net.connect(Net.wsUrl(location.hostname))
        .then(() => {
          Net.send({ type: 'create', name: '房主' });
        })
        .catch(e => this.toast(e.message, '#ff8787'));
    });
    this.el('btn-lan-join').addEventListener('click', () => {
      const ip = this.el('lan-ip').value.trim();
      const roomId = this.el('lan-room').value.trim();
      if (!ip) { this.toast('请输入房主 IP', '#ff8787'); return; }
      Net.connect(Net.wsUrl(ip))
        .then(() => {
          Net.send({ type: 'join', roomId: roomId || '0000', name: '玩家' });
        })
        .catch(e => this.toast(e.message, '#ff8787'));
    });
    this.el('btn-lan-send').addEventListener('click', () => this.sendChat());
    this.el('lan-chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendChat();
    });
    Net.onEvent = (msg) => this.onNetEvent(msg);
  },

  sendChat() {
    const inp = this.el('lan-chat-input');
    const text = inp.value.trim();
    if (!text || !Net.connected) return;
    const from = Net.role === 'host' ? '房主' : '玩家';
    Net.send({ type: 'chat', text, from });
    this.pushChat(from, text);
    inp.value = '';
  },

  pushChat(from, text) {
    this.chatMsgs = this.chatMsgs || [];
    this.chatMsgs.push({ from, text });
    if (this.chatMsgs.length > 40) this.chatMsgs.shift();
    const list = this.el('lan-chat-list');
    if (list) {
      const div = document.createElement('div');
      div.className = 'lan-chat-msg';
      const b = document.createElement('b');
      b.textContent = from;
      const span = document.createElement('span');
      span.textContent = ' ' + text;
      div.appendChild(b);
      div.appendChild(span);
      list.appendChild(div);
      list.scrollTop = list.scrollHeight;
    }
  },

  /* 战斗 HUD 中显示最近聊天 */
  drawNetChat(ctx) {
    const msgs = this.chatMsgs || [];
    if (!msgs.length) return;
    const start = Math.max(0, msgs.length - 3);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '12px "Segoe UI", sans-serif';
    for (let i = start; i < msgs.length; i++) {
      const y = 96 + (i - start) * 18;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(`${msgs[i].from}: ${msgs[i].text}`, 13, y + 1);
      ctx.fillStyle = 'rgba(220,235,255,0.95)';
      ctx.fillText(`${msgs[i].from}: ${msgs[i].text}`, 13, y);
    }
  },

  onNetEvent(msg) {
    try {
      this._onNetEvent(msg);
    } catch (e) {
      console.error('net event error:', e);
    }
  },

  _onNetEvent(msg) {
    switch (msg.type) {
      case 'created': {
        Net.role = 'host';
        Net.roomId = msg.roomId;
        const ips = (msg.ips && msg.ips.length) ? msg.ips.join(' / ') : '查看本机 IP';
        this.el('lan-status').innerHTML =
          `🏠 房间号 <b>${this.esc(msg.roomId)}</b>　·　本机 IP <b>${this.esc(ips)}</b><br>告诉对手以上信息，等待加入...`;
        this.el('lan-status').classList.add('active');
        this.showMechSelect({ mode: 'lan', role: 'host' });
        break;
      }
      case 'joined': {
        Net.role = 'guest';
        this.el('lan-status').innerHTML = `🔗 已加入房间 <b>${this.esc(msg.roomId)}</b>（房主：${this.esc(msg.hostName)}）`;
        this.el('lan-status').classList.add('active');
        this.showMechSelect({ mode: 'lan', role: 'guest' });
        break;
      }
      case 'spectator-joined': {
        this.toast('👁 有观众加入了房间', '#4dabf7');
        break;
      }
      case 'spectator': {
        Net.role = 'spectator';
        this.lanSpectator = true;
        this.el('lan-status').innerHTML = `👁 以观战身份加入房间 <b>${this.esc(msg.roomId)}</b>（${this.esc(msg.hostName)} vs ${this.esc(msg.guestName)}）`;
        this.el('lan-status').classList.add('active');
        this.el('lan-chat-list').innerHTML = '';
        break;
      }
      case 'chat': {
        this.pushChat(msg.from, msg.text);
        break;
      }
      case 'peer-joined': {
        this.el('lan-status').innerHTML = `🤝 对手 <b>${this.esc(msg.name)}</b> 已加入！请选择机甲`;
        this.el('lan-status').classList.add('active');
        break;
      }
      case 'guest-ready': {
        this.lanGuest = { mech: msg.mech, loadout: msg.loadout, plug: msg.plug };
        this.toast(`对手选择了 ${CFG.MECHS[msg.mech].name}！`, '#51cf66');
        this.tryLanStart();
        break;
      }
      case 'host-start': {
        this.startLanView(msg);
        break;
      }
      case 'input': {
        if (UI.game && UI.game.netHost) UI.game.netInput = msg.data;
        break;
      }
      case 'state': {
        if (UI.netView) UI.netView.applyState(msg);
        break;
      }
      case 'result': {
        if (UI.netView) this.showLanResult(msg.winner);
        break;
      }
      case 'error': {
        this.toast('⚠ ' + msg.msg, '#ff8787');
        break;
      }
      case 'peer-left':
      case 'conn-closed': {
        this.toast('⚠ ' + (msg.msg || '连接已断开'), '#ff8787');
        this.lanCleanup();
        this.showMenu();
        break;
      }
    }
  },

  lanCleanup() {
    Net.close();
    Net.role = null;
    this.game = null;
    this.netView = null;
  },

  /* 房主：双方就绪后开战（幂等：已在对局中不重复开） */
  tryLanStart() {
    if (!this.lanHostMech || !this.lanGuest) return;
    if (this.game && this.game.netHost) return;   // 已开战
    const m1 = this.lanHostMech;
    const g = this.lanGuest;
    this.show('game-screen');
    Music.start('battle');
    this.game = new Game({
      mode: 'lan',
      netRole: 'host',
      p1Mech: m1,
      p2Mech: g.mech,
      loadout1: Progress.getLoadout(m1),
      plug1: Progress.mech(m1).plug,
      loadout2: g.loadout,
      plug2: g.plug
    });
    SFX.init();
    Net.send({
      type: 'start',
      p1Mech: m1, p2Mech: g.mech,
      loadout1: Progress.getLoadout(m1), loadout2: g.loadout,
      plug1: Progress.mech(m1).plug, plug2: g.plug,
      theme: this.game.map.theme,
      obstacles: this.game.map.obstacles
    });
  },

  /* 房主：重赛（复用双方配置重新开战） */
  lanRematch() {
    clearTimeout(this._lanCleanupTimer);
    const m1 = this.lanHostMech;
    const g = this.lanGuest;
    if (!m1 || !g) { this.showMenu(); return; }
    this.show('game-screen');
    this.game = new Game({
      mode: 'lan', netRole: 'host',
      p1Mech: m1, p2Mech: g.mech,
      loadout1: Progress.getLoadout(m1), plug1: Progress.mech(m1).plug,
      loadout2: g.loadout, plug2: g.plug
    });
    SFX.init();
    Net.send({
      type: 'start',
      p1Mech: m1, p2Mech: g.mech,
      loadout1: Progress.getLoadout(m1), loadout2: g.loadout,
      plug1: Progress.mech(m1).plug, plug2: g.plug,
      theme: this.game.map.theme, obstacles: this.game.map.obstacles
    });
  },

  /* 客户端：进入快照渲染视图 */
  startLanView(msg) {
    /* 房主消息校验（防注入崩溃） */
    const VALID = ['tank', 'scout', 'assault', 'artillery', 'guardian'];
    if (!VALID.includes(msg.p1Mech) || !VALID.includes(msg.p2Mech)) {
      this.toast('⚠ 收到非法对战配置，已断开', '#ff8787');
      this.lanCleanup();
      this.showMenu();
      return;
    }
    if (!Array.isArray(msg.obstacles)) msg.obstacles = [];
    this.show('game-screen');
    Music.start('battle');
    this.netView = new NetView({
      p1Mech: msg.p1Mech, p2Mech: msg.p2Mech,
      loadout1: msg.loadout1, loadout2: msg.loadout2,
      plug1: msg.plug1, plug2: msg.plug2,
      theme: msg.theme, obstacles: msg.obstacles,
      spectator: this.lanSpectator
    });
    this.game = this.netView;
  },

  /* 客户端结算（防重复结算） */
  showLanResult(winner) {
    if (this.netView && this.netView.resultShown) return;
    if (this.netView) this.netView.resultShown = true;
    if (this.lanSpectator) {
      /* 观战者不发放胜/负奖励 */
      this.el('result-title').textContent = '观战结束';
      this.el('result-title').style.color = '#9ec6ff';
      this.el('result-sub').innerHTML = `房主 vs 对手 · 第 ${Math.floor(this.netView.time)} 秒`;
      this.el('result-info').innerHTML = '';
      this.el('result-reward').innerHTML = '<div class="reward-row">👁 观战模式不发放奖励</div>';
      this.show('result');
      this.lanCleanup();
      return;
    }
    const win = winner === 'p2';
    const mechId = this.netView.me.mech.id;
    const reward = Progress.finishMatch(mechId, win, 0);

    this.el('result-title').textContent = win ? '胜 利 !' : '败 北';
    this.el('result-title').style.color = win ? '#51cf66' : '#ff6b6b';
    this.el('result-sub').innerHTML = win ? '你在局域网对战中获胜！' : '对手更胜一筹';
    this.el('result-info').innerHTML = `<div>局域网对战 · ${Math.floor(this.netView.time)} 秒</div>`;
    let rewardHtml = `<div class="reward-row">🪙 金币 <b>+${reward.coins}</b>　·　EXP <b>+${reward.expGain}</b></div>`;
    if (reward.leveled) rewardHtml += `<div class="reward-row levelup">⬆ 机甲升至 Lv.${reward.level}，获得 1 属性点！</div>`;
    this.el('result-reward').innerHTML = rewardHtml;

    if (win) SFX.win(); else SFX.lose();
    this.show('result');
    this.lanCleanup();
  },

  /* 客户端 HUD */
  drawLanHUD(v, ctx, t) {
    /* 顶部 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 20px "Segoe UI", sans-serif';
    ctx.fillStyle = '#9ec6ff';
    ctx.shadowColor = 'rgba(100,160,255,0.6)';
    ctx.shadowBlur = 10;
    ctx.fillText('⚡ 局域网对战', CFG.W / 2, 24);
    ctx.shadowBlur = 0;
    ctx.font = '13px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(200,220,255,0.85)';
    ctx.fillText(`${Math.floor(v.time / 60)}:${String(Math.floor(v.time % 60)).padStart(2, '0')}`, CFG.W / 2, 44);

    /* 倒计时 */
    if (v.state === 'countdown') {
      const n = Math.ceil(v.countdown);
      ctx.font = 'bold 110px "Segoe UI", sans-serif';
      ctx.fillStyle = n > 1 ? '#bfe3ff' : '#ffd43b';
      ctx.fillText(n > 0 ? n : '开始!', CFG.W / 2, CFG.H / 2 - 40);
    }

    /* 双方面板 + 武器栏 + 大招 */
    this.drawPlayerPanel(ctx, v.me, 16, 12, 'left', t);
    this.drawPlayerPanel(ctx, v.op, CFG.W - 16, 12, 'right', t);
    this.drawWeaponBar(ctx, v.me, 16, CFG.H - 64, 'left');
    this.drawUltiBar(ctx, v.me, CFG.W / 2 - 220, CFG.H - 90, 'left', t);
    this.drawUltiBar(ctx, v.op, CFG.W / 2 + 220, CFG.H - 90, 'right', t);

    /* 连接状态 */
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(140,200,255,0.7)';
    ctx.fillText('LAN 连接中 · 延迟 <30ms', CFG.W / 2, CFG.H - 14);

    this.drawNetChat(ctx);
  },

  /* ---------- Boss 选关 ---------- */
  showBossSelect() {
    const box = this.el('boss-options');
    box.innerHTML = '';
    for (const [id, B] of Object.entries(CFG.BOSSES)) {
      const rec = (Progress.data.bossRec && Progress.data.bossRec[id]) || { clears: 0, bestTime: 0 };
      const card = document.createElement('button');
      card.className = 'boss-option';
      card.style.setProperty('--mc', B.color);
      card.innerHTML = `
        <div class="bo-icon">${B.icon}</div>
        <div class="bo-name" style="color:${B.color}">${B.name}</div>
        <div class="bo-desc">${B.desc}</div>
        <div class="bo-stats">击败 <b>${rec.clears}</b> 次 · 最快 <b>${rec.bestTime ? Math.floor(rec.bestTime / 60) + ':' + String(rec.bestTime % 60).padStart(2, '0') : '—'}</b></div>`;
      card.addEventListener('click', () => this.showMechSelect({ mode: 'boss', bossType: id }));
      box.appendChild(card);
    }
    this.show('boss-select');
  },

  /* ---------- Boss 战 HUD & 结算 ---------- */
  drawBossHUD(b, ctx, t) {
    /* 顶部 Boss 血条 */
    const bw = 620, bh = 18;
    const bx = CFG.W / 2 - bw / 2, by = 22;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.fillStyle = b.boss.color;
    ctx.shadowColor = b.boss.color;
    ctx.shadowBlur = 10;
    ctx.fillText(`${b.boss.name} ${b.phaseName}`, CFG.W / 2, by - 14);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this.roundRect(ctx, bx - 2, by - 2, bw + 4, bh + 4, 9);
    ctx.fill();
    ctx.fillStyle = '#3d1515';
    this.roundRect(ctx, bx, by, bw, bh, 7);
    ctx.fill();
    const pct = U.clamp(b.boss.hp / b.boss.maxHp, 0, 1);
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#ff8787');
    g.addColorStop(1, '#e03131');
    ctx.fillStyle = g;
    this.roundRect(ctx, bx, by, Math.max(4, bw * pct), bh, 7);
    ctx.fill();
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(`${Math.ceil(b.boss.hp)} / ${b.boss.maxHp}`, CFG.W / 2, by + bh / 2 + 1);

    /* 倒计时 */
    if (b.state === 'countdown') {
      const n = Math.ceil(b.countdown);
      ctx.font = 'bold 100px "Segoe UI", sans-serif';
      ctx.fillStyle = n > 1 ? '#bfe3ff' : '#ffd43b';
      ctx.fillText(n > 0 ? n : '开战!', CFG.W / 2, CFG.H / 2 - 40);
    }

    /* 玩家面板 */
    this.drawPlayerPanel(ctx, b.player, 16, 12, 'left', t);
    this.drawWeaponBar(ctx, b.player, 16, CFG.H - 64, 'left');
    this.drawUltiBar(ctx, b.player, CFG.W / 2 - 220, CFG.H - 90, 'left', t);

    /* 伤害统计 */
    ctx.font = '13px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,212,59,0.9)';
    ctx.fillText(`已造成伤害 ${Math.floor(b.dmgDealt)}`, CFG.W - 130, CFG.H - 20);

    if (b.time < 6 && b.state === 'countdown') {
      ctx.globalAlpha = 0.85;
      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('WASD 移动 · J 开火 · K/Q 切武器 · L 技能 · 空格 大招', CFG.W / 2, CFG.H - 30);
      ctx.globalAlpha = 1;
    }
  },

  showBossResult(b) {
    const win = b.boss.dead;
    const reward = Progress.finishBoss(b.player.mech.id, b.bossType, win, b.dmgDealt, b.time);

    this.el('result-title').textContent = win ? '巨兽 已 击 败 !' : '战败...';
    this.el('result-title').style.color = win ? '#ffd43b' : '#ff6b6b';
    this.el('result-sub').innerHTML = win
      ? (reward.firstClear ? '<span style="color:#ffd43b">★ 首次击败巨兽！</span>' : '你终结了巨兽的威胁')
      : '巨兽太过强大，再试一次吧';
    this.el('result-info').innerHTML = `
      <div>造成伤害 <b>${Math.floor(b.dmgDealt)}</b> · 战斗时长 <b>${Math.floor(b.time / 60)}:${String(Math.floor(b.time % 60)).padStart(2, '0')}</b></div>
      <div>击败次数 <b>${reward.clears}</b> · 最快 ${Math.floor(reward.bestTime / 60)}:${String(reward.bestTime % 60).padStart(2, '0')} · 最高伤害 <b>${reward.bestDamage}</b></div>
    `;
    let rewardHtml = `<div class="reward-row">🪙 金币 <b>+${reward.coins}</b>　·　EXP <b>+${reward.expGain}</b></div>`;
    if (reward.firstClear) rewardHtml += `<div class="reward-row bonus">🎉 首次通关额外 +300 🪙</div>`;
    if (reward.leveled) rewardHtml += `<div class="reward-row levelup">⬆ 机甲升至 Lv.${reward.level}，获得 1 属性点！</div>`;
    this.el('result-reward').innerHTML = rewardHtml;

    const ach = Progress.checkAchievements();
    if (ach.length) this.toast(`🏆 达成成就：${ach[0].name} +${ach[0].reward}🪙！`, '#ffd43b');

    if (win) SFX.win(); else SFX.lose();
    this.show('result');
  },

  /* ---------- 战绩档案 ---------- */
  showProfile() {
    this.renderProfile();
    this.show('profile');
  },

  renderProfile() {
    const P = Progress;
    const d = P.data;
    const s = d.stats;

    this.el('profile-coins').textContent = P.coins();
    const box = this.el('profile-grid');
    box.innerHTML = '';

    const card = (title, rowsHtml, color = '#4dabf7') => {
      const div = document.createElement('div');
      div.className = 'profile-card';
      div.style.setProperty('--mc', color);
      div.innerHTML = `<div class="pc-title">${title}</div><div class="pc-rows">${rowsHtml}</div>`;
      return div;
    };
    const row = (k, v) => `<div class="pc-row"><span>${k}</span><b>${v}</b></div>`;

    /* 总览 */
    const winRate = s.gamesPlayed ? Math.round(s.wins / s.gamesPlayed * 100) : 0;
    box.appendChild(card('⚔ 总览', [
      row('总场次', s.gamesPlayed),
      row('胜 / 负', `${s.wins} / ${s.losses}`),
      row('胜率', winRate + '%'),
      row('总击杀', s.kills),
      row('最高单局连杀', s.lastStreak || P.lastStreak || 0),
      row('大招释放', s.ultiUsed),
      row('累计收入', s.coinsEarned + ' 🪙'),
      row('徽章', P.medals() + ' 🏅')
    ].join(''), '#51cf66'));

    /* 最爱底盘 */
    const mg = s.mechGames || {};
    const sorted = Object.entries(mg).sort((a, b) => b[1] - a[1]);
    const favRows = sorted.length
      ? sorted.map(([id, n]) => row(CFG.MECHS[id].name, n + ' 场')).join('')
      : row('暂无对战记录', '—');
    box.appendChild(card('🤖 机甲使用', favRows, '#63e6be'));

    /* 排位 */
    const rk = d.ranked;
    const rank = P.rankFor(rk.score);
    box.appendChild(card('🏅 排位', [
      row('段位', `<span style="color:${rank.color}">${rank.name}</span>`),
      row('分数', rk.score),
      row('排位战绩', `${rk.wins} 胜 / ${rk.losses} 负`),
      row('胜率', rk.wins + rk.losses ? Math.round(rk.wins / (rk.wins + rk.losses) * 100) + '%' : '—')
    ].join(''), '#ffd43b'));

    /* 生存 */
    box.appendChild(card('🌊 生存模式', [
      row('最高波次', d.survival.bestWave),
      row('最高击杀', d.survival.bestKills)
    ].join(''), '#ffa94d'));

    /* 锦标赛 & Boss */
    box.appendChild(card('🏆 锦标赛', [
      row('夺冠次数', d.tournament.champions)
    ].join(''), '#ff6b6b'));
    box.appendChild(card('👾 Boss 战', [
      row('击败巨兽', d.boss.clears + ' 次'),
      row('最快通关', d.boss.bestTime ? Math.floor(d.boss.bestTime / 60) + ':' + String(d.boss.bestTime % 60).padStart(2, '0') : '—'),
      row('最高伤害', d.boss.bestDamage || '—')
    ].join(''), '#e64980'));
  },

  /* ---------- 新手引导 ---------- */
  GUIDE_STEPS: [
    { icon: '👋', title: '欢迎加入 MECH ARENA', text: '这是一款 2D 机甲对战竞技场。挑战 AI、与好友同屏或局域网对战、闯无尽生存、讨伐巨型 Boss！' },
    { icon: '🗺', title: '主菜单一览', text: '顶部是 档案 / 任务 / 机库 / 商店 / 设置；中央 7 张卡片是全部战斗模式，点击即可开始。' },
    { icon: '🎯', title: '从训练场开始', text: '推荐先玩「训练场」：无惩罚、自由练习，熟悉武器与走位手感。', action: true },
    { icon: '🛠', title: '升级与改装', text: '战斗赢金币和经验：在「机库」升级底盘、属性加点、配置武器与插件；「商店」购买新装备。' },
    { icon: '🏅', title: '徽章与成就', text: '每场胜利获得徽章，可在商店兑换皮肤与道具；完成「任务」中的成就和每日任务再领奖励！' }
  ],

  maybeShowGuide() {
    if (Progress.data.guided) return;
    this.guideStep = 0;
    this.renderGuideStep();
    this.show('guide');
  },

  renderGuideStep() {
    const s = this.GUIDE_STEPS[this.guideStep];
    this.el('guide-icon').textContent = s.icon;
    this.el('guide-title').textContent = s.title;
    this.el('guide-text').textContent = s.text;
    this.el('btn-guide-action').style.display = s.action ? '' : 'none';
    this.el('btn-guide-next').textContent = this.guideStep < this.GUIDE_STEPS.length - 1 ? '下一步 →' : '开始游戏';
    /* 步骤点 */
    this.el('guide-dots').innerHTML = this.GUIDE_STEPS.map((_, i) =>
      `<span class="guide-dot ${i === this.guideStep ? 'on' : ''}"></span>`).join('');
  },

  bindGuide() {
    this.el('btn-guide-next').addEventListener('click', () => {
      this.guideStep++;
      if (this.guideStep >= this.GUIDE_STEPS.length) {
        this.finishGuide();
      } else {
        this.renderGuideStep();
      }
    });
    this.el('btn-guide-skip').addEventListener('click', () => this.finishGuide());
    this.el('btn-guide-action').addEventListener('click', () => {
      this.finishGuide();
      this.showMechSelect({ mode: 'training' });
    });
  },

  finishGuide() {
    Progress.data.guided = true;
    Progress.save();
    this.showMenu();
  },

  showHelp() {
    this.show('help');
  },

  /* ---------- 选机甲 ---------- */
  showMechSelect(cfg) {
    this.lastCfg = cfg;
    this.selectStep = 0;
    this.picked = {};

    const box = this.el('mech-cards');
    box.innerHTML = '';
    const mechIds = Object.keys(CFG.MECHS);

    for (const id of mechIds) {
      const m = CFG.MECHS[id];
      const unlocked = Progress.isUnlocked(id);
      const card = document.createElement('div');
      card.className = 'mech-card' + (unlocked ? '' : ' unowned');
      card.dataset.id = id;
      card.style.setProperty('--mc', m.color);

      const hpPct = Math.round(m.hp / 130 * 100);
      const spPct = Math.round(m.speed / 212 * 100);
      const ld = Progress.getLoadout(id);
      const armStr = m.slots.map((type, i) => `${type === 'sub' ? '副' : '主'} ${CFG.WEAPONS[ld[i]].name}`).join(' / ');
      const sk = CFG.SKILLS[m.skill].name;
      const passive = m.passive ? m.passive.name : '';
      const ulti = CFG.ULTIS[m.id] ? CFG.ULTIS[m.id].name : '';
      const plugId = Progress.mech(id).plug;
      const plugName = plugId ? CFG.PLUGINS[plugId].name : '无';

      card.innerHTML = `
        <div class="mech-avatar" style="background:${m.color}22;border-color:${m.color}">
          <span class="mech-avatar-core" style="background:${m.color};box-shadow:0 0 18px ${m.color}"></span>
          ${unlocked ? '' : '<span class="avatar-lock">🔒</span>'}
        </div>
        <div class="mech-name" style="color:${m.color}">${m.name}${unlocked ? '' : ' <small>未解锁</small>'}</div>
        <div class="mech-desc">${m.desc}</div>
        <div class="mech-stats">
          <div class="stat"><span>装甲</span><div class="bar"><i style="width:${hpPct}%;background:#51cf66"></i></div></div>
          <div class="stat"><span>机动</span><div class="bar"><i style="width:${spPct}%;background:#4dabf7"></i></div></div>
        </div>
        <div class="mech-arms">
          <div><span style="color:${m.color}">武器</span> ${armStr}</div>
          <div><span style="color:${m.color}">技能</span> ${sk}</div>
          <div><span style="color:${m.color}">大招</span> ${ulti}</div>
          <div><span style="color:${m.color}">被动</span> ${passive}</div>
          <div><span style="color:${m.color}">插件</span> ${plugName}</div>
        </div>
        <div class="mech-pick-hint"></div>
      `;

      card.addEventListener('click', () => this.onPickCard(card, id, m));
      box.appendChild(card);
    }

    this.updateSelectTitle();
    this.show('mech-select');
  },

  updateSelectTitle() {
    const cfg = this.lastCfg;
    let title;
    if (cfg.mode === 'duel') {
      title = this.selectStep === 0 ? '玩家 1 · 选择你的机甲' : '玩家 2 · 选择你的机甲';
    } else if (cfg.mode === 'lan') {
      title = cfg.role === 'host' ? '🌐 局域网对战（房主）· 选择你的机甲' : '🌐 局域网对战 · 选择你的机甲';
    } else if (cfg.mode === 'boss') {
      title = '👾 Boss 战 · 选择你的机甲';
    } else if (cfg.mode === 'survival') {
      title = '🌊 生存模式 · 选择你的机甲';
    } else if (cfg.battleType === 'ranked') {
      title = '🏅 排位赛 · 选择你的机甲';
    } else if (cfg.battleType === 'tournament') {
      title = `🏆 锦标赛 ${this.tournament ? '第 ' + this.tournament.round + ' 轮' : ''} · 选择你的机甲`;
    } else if (cfg.battleType === 'training') {
      title = '🎯 训练场 · 选择你的机甲';
    } else {
      title = '选择你的机甲（AI 将随机出战）';
    }
    this.el('select-title').textContent = title;
  },

  onPickCard(card, id) {
    if (!Progress.isUnlocked(id)) {
      this.toast('🔒 该机甲尚未解锁，去机库看看吧！', '#ff8787');
      return;
    }
    const cfg = this.lastCfg;
    card.classList.add('picked');

    if (cfg.mode === 'lan') {
      this.picked.p1 = id;
      if (cfg.role === 'guest') {
        /* 客户端：上报机甲配置，等待房主开战 */
        Net.send({ type: 'ready', mech: id, loadout: Progress.getLoadout(id), plug: Progress.mech(id).plug });
        this.toast('已选择，等待房主开始...', '#4dabf7');
      } else {
        this.lanHostMech = id;
        this.toast('已选择，等待对手...', '#4dabf7');
        this.tryLanStart();
      }
      return;
    }

    if (cfg.mode === 'boss') {
      this.picked.p1 = id;
      this.startGame();
      return;
    }

    if (cfg.mode === 'survival') {
      this.picked.p1 = id;
      this.startGame();
      return;
    }

    if (cfg.mode === 'single') {
      this.picked.p1 = id;
      if (cfg.battleType === 'tournament' && this.tournament && this.tournament.opponent) {
        /* 锦标赛：对手机甲由赛程指定 */
        this.picked.p2 = this.tournament.opponent.mech;
      } else if (cfg.aiMech) {
        /* 训练场：指定 AI 机甲 */
        this.picked.p2 = cfg.aiMech;
      } else {
        const rest = Object.keys(CFG.MECHS).filter(k => k !== id);
        this.picked.p2 = rest[Math.floor(Math.random() * rest.length)];
      }
      this.startGame();
      return;
    }

    /* 双人：轮流选 */
    if (this.selectStep === 0) {
      this.picked.p1 = id;
      this.selectStep = 1;
      document.querySelectorAll('.mech-card').forEach(c => {
        if (c.dataset.id === id) c.classList.add('locked');
      });
      this.updateSelectTitle();
    } else {
      if (this.picked.p1 === id) return;   // 不能选同一个
      this.picked.p2 = id;
      this.startGame();
    }
  },

  /* ---------- 开始游戏 ---------- */
  startGame() {
    const cfg = this.lastCfg;
    this.show('game-screen');
    Music.start('battle');
    if (cfg.mode === 'survival') {
      this.game = new Survival({ p1Mech: this.picked.p1 });
      SFX.init();
      return;
    }
    if (cfg.mode === 'boss') {
      this.game = new BossFight({ p1Mech: this.picked.p1, bossType: cfg.bossType });
      SFX.init();
      return;
    }
    this.game = new Game({
      mode: cfg.mode,
      p1Mech: this.picked.p1,
      p2Mech: this.picked.p2,
      aiDifficulty: cfg.aiDifficulty || 'normal',
      aiEnabled: cfg.aiEnabled !== false,
      battleType: cfg.battleType
    });
    SFX.init();
  },

  /* ---------- 结算 ---------- */
  showResult(game) {
    const [a, b] = game.robots;

    if (game.winner) {
      const win = game.winner;
      const isYou = win.playerKey === 'p1';
      this.el('result-title').textContent = isYou ? '胜 利 !' : '败 北';
      this.el('result-title').style.color = isYou ? '#51cf66' : '#ff6b6b';
      this.el('result-sub').innerHTML =
        `<span style="color:${win.color}">${win.name}</span> 赢得了战斗！`;
    } else {
      this.el('result-title').textContent = '同归于尽';
      this.el('result-title').style.color = '#ffd43b';
      this.el('result-sub').textContent = '双方同时被击毁...';
    }

    const t = Math.floor(game.time);
    const mm = Math.floor(t / 60), ss = t % 60;
    this.el('result-info').innerHTML = `
      <div>战斗时长 <b>${mm}:${String(ss).padStart(2, '0')}</b></div>
      <div>${a.name} 剩余装甲 <b style="color:${a.hp > 0 ? '#51cf66' : '#ff6b6b'}">${Math.max(0, Math.round(a.hp / a.maxHp * 100))}%</b></div>
      <div>${b.name} 剩余装甲 <b style="color:${b.hp > 0 ? '#51cf66' : '#ff6b6b'}">${Math.max(0, Math.round(b.hp / b.maxHp * 100))}%</b></div>
    `;

    if (game.winner && game.winner.playerKey === 'p1') SFX.win();
    else if (game.winner) SFX.lose();
    else SFX.lose();

    /* 养成 & 经济结算（按战斗类型） */
    const r1 = game.robots[0];
    const win = !!game.winner && game.winner === r1;
    const cfg = this.lastCfg;
    let rewardHtml = '';

    if (cfg.battleType === 'training') {
      rewardHtml = '<div class="reward-row">🎯 训练场 · 无奖励、无惩罚</div>';
    } else if (game.mode === 'duel') {
      /* 本地双人：娱乐对战，不获得任何奖励（防刷金币/经验/徽章） */
      rewardHtml = '<div class="reward-row">🎮 本地双人 · 娱乐对战，不获得奖励</div>';
    } else if (cfg.battleType === 'ranked') {
      const reward = Progress.finishMatch(r1.mech.id, win, r1.kills);
      const rk = Progress.finishRanked(win, r1.kills);
      const deltaColor = rk.delta >= 0 ? '#51cf66' : '#ff6b6b';
      rewardHtml = `<div class="reward-row">🏅 排位分 <b style="color:${deltaColor}">${rk.delta >= 0 ? '+' : ''}${rk.delta}</b> → <b>${rk.score}</b>（${rk.newRank.name}）</div>`;
      if (rk.rankUp) rewardHtml += `<div class="reward-row levelup">⬆ 晋升至 ${rk.newRank.name} 段位！</div>`;
      if (rk.rankDown) rewardHtml += `<div class="reward-row" style="color:#ff8787">⬇ 掉段至 ${rk.newRank.name} 段位</div>`;
      rewardHtml += this.rewardRows(reward);
    } else if (cfg.battleType === 'tournament') {
      const tRes = this.tournamentRoundEnd(win);
      const reward = Progress.finishMatch(r1.mech.id, win, r1.kills);
      rewardHtml = tRes + this.rewardRows(reward);
    } else {
      const reward = Progress.finishMatch(r1.mech.id, win, r1.kills);
      rewardHtml = this.rewardRows(reward);
    }
    this.el('result-reward').innerHTML = rewardHtml;

    /* 局域网房主：广播胜负并断连 */
    if (game.netHost) {
      const winner = game.winner === game.robots[0] ? 'p1'
        : game.winner === game.robots[1] ? 'p2' : 'draw';
      Net.send({ type: 'result', winner });
      clearTimeout(this._lanCleanupTimer);
      this._lanCleanupTimer = setTimeout(() => this.lanCleanup(), 1200);
    }

    this.show('result');
  },

  rematch() {
    if (this.game && this.game.netHost) {
      this.lanRematch();
      return;
    }
    if (this.lastCfg && this.lastCfg.mode === 'lan') {
      this.toast('等待房主发起重赛...', '#4dabf7');
      return;
    }
    this.startGame();
  },

  /* ---------- HUD ---------- */
  drawHUD(game, ctx, t) {
    /* 倒计时 */
    if (game.state === 'countdown') {
      const n = Math.ceil(game.countdown);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 110px "Segoe UI", sans-serif';
      ctx.shadowColor = 'rgba(120,180,255,0.8)';
      ctx.shadowBlur = 30;
      ctx.fillStyle = n > 1 ? '#bfe3ff' : '#ffd43b';
      const scale = 1 + Math.max(0, (game.countdown % 1) - 0.6) * 1.6;
      ctx.translate(CFG.W / 2, CFG.H / 2 - 40);
      ctx.scale(scale, scale);
      ctx.fillText(n > 0 ? n : '开始!', 0, 0);
      ctx.restore();
    }

    /* 顶部中央：VS + 天气横幅 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(180,210,255,0.9)';
    ctx.shadowColor = 'rgba(100,160,255,0.6)';
    ctx.shadowBlur = 10;
    ctx.fillText('VS', CFG.W / 2, 34);
    ctx.shadowBlur = 0;

    if (game.weather) {
      const wNames = { meteor: '☄ 陨石雨', storm: '⚡ 雷暴', airdrop: '✈ 空投补给' };
      const wColors = { meteor: '#ff8c42', storm: '#74c0fc', airdrop: '#69db7c' };
      const flash = Math.floor(t * 5) % 2 === 0;
      ctx.font = 'bold 17px "Segoe UI", sans-serif';
      ctx.fillStyle = flash ? wColors[game.weather.type] : '#eef4ff';
      ctx.shadowColor = wColors[game.weather.type];
      ctx.shadowBlur = 14;
      ctx.fillText(wNames[game.weather.type] || '', CFG.W / 2, 62);
      ctx.shadowBlur = 0;
    }

    /* 双方面板 */
    this.drawPlayerPanel(ctx, game.robots[0], 16, 12, 'left', t);
    this.drawPlayerPanel(ctx, game.robots[1], CFG.W - 16, 12, 'right', t);

    /* 底部武器栏 */
    this.drawWeaponBar(ctx, game.robots[0], 16, CFG.H - 64, 'left');
    if (game.mode === 'duel') {
      this.drawWeaponBar(ctx, game.robots[1], CFG.W - 16, CFG.H - 64, 'right');
    }

    /* 大招能量条 */
    this.drawUltiBar(ctx, game.robots[0], CFG.W / 2 - 220, CFG.H - 90, 'left', t);
    if (game.mode === 'duel') {
      this.drawUltiBar(ctx, game.robots[1], CFG.W / 2 + 220, CFG.H - 90, 'right', t);
    }

    /* 局域网房主：显示聊天 */
    if (game.netHost) this.drawNetChat(ctx);

    /* 操作提示（开局 7 秒） */
    if (game.mode === 'single' && game.state === 'playing' && game.time < 7) {
      ctx.globalAlpha = 0.85;
      ctx.textAlign = 'center';
      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('WASD 移动 · J 开火 · K/Q 切换武器 · L 技能', CFG.W / 2, CFG.H - 30);
      ctx.globalAlpha = 1;
    }
  },

  drawPlayerPanel(ctx, r, x, y, align, t) {
    const w = 210, bh = 12;
    const bx = align === 'left' ? x : x - w;
    const dir = align === 'left' ? 1 : -1;

    /* 名字 */
    ctx.textAlign = align === 'left' ? 'left' : 'right';
    ctx.textBaseline = 'bottom';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(r.name, bx + dir * 1, y + 18 + 1);
    ctx.fillStyle = r.color;
    ctx.fillText(r.name, bx + dir * 1, y + 18);

    /* 连杀奖励状态（3/5/8 连杀） */
    if (r.streakT > 0 && r.streakTier > 0) {
      const tierNames = { 1: '🔥×3 伤害UP', 2: '🔥×5 疾风', 3: '🔥×8 无双' };
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(tierNames[r.streakTier], bx + dir * 1, y + 18 - 14 + 1);
      ctx.fillStyle = '#ffd43b';
      ctx.fillText(tierNames[r.streakTier], bx + dir * 1, y + 18 - 14);
      /* 剩余时间细条 */
      const sw = 60, p = U.clamp(r.streakT / 10, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(align === 'left' ? bx : bx + w - sw, y + 18 - 10, sw, 3);
      ctx.fillStyle = '#ffd43b';
      ctx.fillRect(align === 'left' ? bx : bx + w - sw, y + 18 - 10, sw * p, 3);
    }

    /* 血条 */
    const hy = y + 24;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx - 1, hy - 1, w + 2, bh + 2);
    ctx.fillStyle = '#202b47';
    ctx.fillRect(bx, hy, w, bh);
    const pct = U.clamp(r.hp / r.maxHp, 0, 1);
    ctx.fillStyle = pct > 0.5 ? '#51cf66' : pct > 0.25 ? '#ffd43b' : '#ff6b6b';
    ctx.fillRect(bx, hy, w * pct, bh);
    /* 血量数字 */
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = align === 'left' ? 'right' : 'left';
    ctx.fillText(Math.ceil(r.hp) + '/' + r.maxHp, align === 'left' ? bx + w + 6 : bx - 6, hy + bh / 2 + 1);

    /* 技能图标 + 冷却 */
    const sc = r.skillCfg;
    const sx = align === 'left' ? bx + 20 : bx + w - 20;
    const sy = y + 52;
    const sr = 15;
    ctx.textAlign = 'center';

    /* 图标底 */
    ctx.fillStyle = 'rgba(20,30,54,0.9)';
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    /* 图标文字 */
    const icons = { dash: '»', shield: '◎', emp: '✺', nuke: '☢', heal: '+' };
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.fillStyle = r.color;
    ctx.fillText(icons[r.skillId] || '!', sx, sy + 1);

    /* CD 遮罩 */
    if (r.skillCool > 0) {
      const p = 1 - r.skillCool / sc.cd;
      ctx.fillStyle = 'rgba(5,8,16,0.72)';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, sr, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.font = 'bold 9px "Segoe UI", sans-serif';
      ctx.fillStyle = '#ffd43b';
      ctx.fillText(r.skillCool.toFixed(1), sx, sy + 1);
    }
    /* 技能名 */
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(220,235,255,0.95)';
    ctx.textAlign = align === 'left' ? 'left' : 'right';
    ctx.fillText(sc.name, sx + dir * (sr + 8), sy + 1);

    /* 弹药（副槽共享） */
    ctx.textAlign = align === 'left' ? 'right' : 'left';
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillStyle = r.subAmmo > 0 ? '#ffe066' : '#9db4dd';
    ctx.fillText('弹药 ×' + Math.ceil(r.subAmmo) + '/' + r.subAmmoMax, align === 'left' ? bx + w + 60 : bx - 60, sy + 1);

    /* 护盾核心条 */
    if (r.shieldCharge > 0) {
      ctx.fillStyle = 'rgba(116,143,252,0.85)';
      ctx.fillRect(bx, hy + bh + 3, w * U.clamp(r.shieldCharge / 60, 0, 1), 3);
    }

    /* 眩晕指示 */
    if (r.isStunned) {
      ctx.textAlign = align === 'left' ? 'left' : 'right';
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.fillStyle = '#ffe066';
      ctx.fillText('⚡ 瘫痪中 ' + r.stunT.toFixed(1) + 's', bx + dir * (w / 2 - 30), y + 52);
    }
  },

  drawWeaponBar(ctx, r, x, y, align) {
    const bw = 260;
    const rows = r.loadout.length;
    const hasHeat = r.slotType === 'main' && r.heat > 0;
    const hasPlug = r.plug && CFG.PLUGINS[r.plug];
    const textY0 = 16 + (hasHeat ? 14 : 0);
    const ph = textY0 + rows * 15 + 22 + (hasPlug ? 15 : 0);
    const bx = align === 'left' ? x : x - bw;

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(9,14,28,0.85)';
    ctx.strokeStyle = 'rgba(150,190,255,0.6)';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, bx - 8, y - 8, bw + 16, ph, 8);
    ctx.fill();
    ctx.stroke();

    /* 过热条（主槽机枪） */
    if (hasHeat) {
      const hx = align === 'left' ? bx + 8 : bx + bw - 98;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(hx, y + 4, 90, 8);
      const hp = U.clamp(r.heat / 100, 0, 1);
      ctx.fillStyle = r.overheated ? '#ff6b6b' : '#ffa94d';
      ctx.fillRect(hx, y + 4, 90 * hp, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 9px "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(r.overheated ? '过热!' : '热量', align === 'left' ? bx + 104 : bx + bw - 104, y + 8);
    }

    /* 槽位列表（当前槽高亮） */
    ctx.textAlign = align === 'left' ? 'left' : 'right';
    for (let i = 0; i < rows; i++) {
      const w = CFG.WEAPONS[r.loadout[i]] || null;
      const isCur = i === r.slotIndex;
      const type = (r.mech.slots && r.mech.slots[i] === 'sub') ? '副' : '主';
      const wName = w ? w.name : '未知武器';
      let label = `${type}${i + 1} ${wName}`;
      if (isCur && type === 'sub') label += ` ×${Math.max(0, Math.ceil(r.subAmmo))}`;
      if (isCur) label += ' ◀';
      ctx.font = isCur ? 'bold 11.5px "Segoe UI", sans-serif' : '11px "Segoe UI", sans-serif';
      ctx.fillStyle = isCur ? (type === 'sub' ? '#ffe066' : '#e6f2ff') : '#93a8d0';
      ctx.fillText(label, align === 'left' ? bx : bx + bw, y + textY0 + i * 15);
    }
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(220,235,255,0.85)';
    ctx.fillText('K/Q 切换武器', align === 'left' ? bx : bx + bw, y + textY0 + rows * 15 + 4);
    if (hasPlug) {
      const p = CFG.PLUGINS[r.plug];
      ctx.font = '10px "Segoe UI", sans-serif';
      ctx.fillStyle = p.color;
      ctx.fillText('🧩 ' + p.name, align === 'left' ? bx : bx + bw, y + textY0 + rows * 15 + 18);
    }
    ctx.restore();
  },

  /* 大招能量条 */
  drawUltiBar(ctx, r, x, y, align, t) {
    const u = r.ultiCfg;
    if (!u) return;
    const w = 190, h = 10;
    const bx = align === 'left' ? x : x - w;
    const pct = U.clamp(r.ulti / r.ultiMax, 0, 1);

    ctx.save();
    ctx.globalAlpha = 0.92;

    /* 底槽 */
    ctx.fillStyle = 'rgba(8,12,22,0.75)';
    this.roundRect(ctx, bx - 1, y - 1, w + 2, h + 2, 6);
    ctx.fill();
    ctx.fillStyle = '#161d33';
    this.roundRect(ctx, bx, y, w, h, 5);
    ctx.fill();

    /* 能量填充 */
    if (pct > 0) {
      const g = ctx.createLinearGradient(bx, 0, bx + w, 0);
      g.addColorStop(0, '#4dabf7');
      g.addColorStop(1, u.color);
      ctx.fillStyle = g;
      this.roundRect(ctx, bx, y, Math.max(6, w * pct), h, 5);
      ctx.fill();
    }

    /* 满能量：金色呼吸 + 就绪提示 */
    ctx.textAlign = align === 'left' ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    if (pct >= 1) {
      const flash = Math.floor(t * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ffd43b' : '#fff3bf';
      ctx.fillText(`★ ${u.name} 就绪 · 按 ${align === 'left' ? '空格' : '，'}`, align === 'left' ? bx + w + 8 : bx - 8, y + h / 2);
      ctx.strokeStyle = flash ? 'rgba(255,212,59,0.95)' : 'rgba(255,212,59,0.4)';
      ctx.lineWidth = 1.5;
      this.roundRect(ctx, bx - 1.5, y - 1.5, w + 3, h + 3, 7);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(200,220,255,0.85)';
      ctx.fillText(`${u.icon} ${u.name} ${Math.floor(pct * 100)}%`, align === 'left' ? bx + w + 8 : bx - 8, y + h / 2);
    }
    ctx.restore();
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
};
