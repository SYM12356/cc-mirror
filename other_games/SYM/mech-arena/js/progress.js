'use strict';
/* ============================================================
 * 养成 & 经济系统：金币 / 机甲等级 / 属性加点 / 解锁
 * 存档：localStorage（不可用时退化为内存存档）
 * ============================================================ */

const Progress = {
  /* 存档 key：按登录用户隔离（未登录 → guest 兼容旧档） */
  get KEY() {
    const user = (typeof Account !== 'undefined' && Account.isLoggedIn()) ? Account.current() : 'guest';
    return 'mechArenaSave_v1_' + user;
  },

  /* ---------- 商店 ---------- */
  SHOP: {
    /* 武器价格（初始拥有：火神机枪 / 脉冲激光 / 榴弹发射器） */
    weapons: {
      shotgun: 500,
      flame: 650,
      frost: 700,
      needle: 750,
      saw: 750,
      sniper: 800,
      sonic: 700,
      tesla: 850,
      missile: 900,
      napalm: 950,
      plasma: 950,
      rail: 1100
    },
    /* 底盘价格（磐石、疾风初始解锁） */
    chassis: {
      assault: 900,
      artillery: 1400,
      guardian: 1200
    },
    /* 插件价格 */
    plugins: {
      ammo: 400,
      armor: 500,
      engine: 450,
      repair: 600,
      battery: 700,
      drone: 900
    }
  },

  /* 初始武器库 */
  START_WEAPONS: ['minigun', 'laser', 'grenade'],

  /* 初始插件库 */
  START_PLUGINS: ['repair'],

  /* ---------- 成就 ---------- */
  ACHIEVEMENTS: [
    { id: 'first_win',    name: '初露锋芒',   desc: '赢得第一场战斗',       reward: 100 },
    { id: 'win_10',       name: '常胜将军',   desc: '累计胜利 10 场',        reward: 300 },
    { id: 'kill_100',     name: '百人斩',     desc: '累计击杀 100 个敌人',   reward: 500 },
    { id: 'streak_5',     name: '五连杀',     desc: '单局取得 5 连杀',       reward: 200 },
    { id: 'champion_1',   name: '冠军之路',   desc: '夺得一次锦标赛冠军',    reward: 400 },
    { id: 'rank_gold',    name: '黄金战士',   desc: '排位达到黄金段位',      reward: 300 },
    { id: 'rank_master',  name: '登峰造极',   desc: '排位达到大师段位',      reward: 800 },
    { id: 'survival_10',  name: '生存专家',   desc: '生存模式闯过第 10 波',  reward: 300 },
    { id: 'survival_20',  name: '不死战神',   desc: '生存模式闯过第 20 波',  reward: 600 },
    { id: 'all_weapons',  name: '军火库',     desc: '拥有全部武器',          reward: 400 },
    { id: 'all_plugins',  name: '改装大师',   desc: '拥有全部插件',          reward: 300 },
    { id: 'rich_2000',    name: '日进斗金',   desc: '累计获得 2000 金币',    reward: 400 },
    { id: 'boss_kill',    name: '屠龙者',     desc: '击败 Boss 战中的巨兽',   reward: 300 },
    { id: 'boss_3',       name: '猎兽大师',   desc: '累计击败巨兽 3 次',      reward: 500 }
  ],

  /* ---------- 每日任务池（每日随机 3 个） ---------- */
  DAILY_POOL: [
    { id: 'd_win',     name: '赢得战斗',      target: 2,   reward: 80 },
    { id: 'd_kills',   name: '击杀敌人',      target: 12,  reward: 100 },
    { id: 'd_survive', name: '生存闯过第 5 波', target: 5,  reward: 120 },
    { id: 'd_ulti',    name: '释放大招',      target: 3,   reward: 70 },
    { id: 'd_spend',   name: '商店消费',      target: 400, reward: 90 },
    { id: 'd_ranked',  name: '进行排位赛',    target: 2,   reward: 100 }
  ],

  /* ---------- 设置 ---------- */
  DEFAULT_SETTINGS: {
    volume: 0.8,
    fxQuality: 'high',        // low | medium | high
    screenShake: true,
    showFps: false,
    music: true
  },

  /* 底盘默认武器配置（按槽位数组；未拥有时自动回退：主→火神机枪，副→榴弹） */
  DEFAULT_LOADOUT: {
    tank:      ['minigun', 'grenade', 'grenade'],
    scout:     ['laser', 'grenade'],
    assault:   ['minigun', 'shotgun'],
    artillery: ['laser', 'minigun', 'grenade'],
    guardian:  ['minigun', 'grenade', 'grenade']
  },

  /* 战斗奖励 */
  REWARD: {
    winCoins: 120, loseCoins: 50,
    winExp: 60, loseExp: 25,
    killCoins: 20, killExp: 15,
    firstWinCoins: 80
  },

  /* 段位表（按分数） */
  RANKS: [
    { name: '青铜', min: 0,    color: '#d99a5b', icon: 'Ⅲ' },
    { name: '白银', min: 1000, color: '#cdd7e6', icon: 'Ⅱ' },
    { name: '黄金', min: 1120, color: '#ffd43b', icon: 'Ⅰ' },
    { name: '白金', min: 1240, color: '#7ec8e3', icon: 'S' },
    { name: '钻石', min: 1360, color: '#4dabf7', icon: 'SS' },
    { name: '大师', min: 1480, color: '#e64980', icon: 'SSS' }
  ],
  RANK_SCORE_MIN: 100,          // 排位分下限

  /* 排位赛得分 */
  RANKED: {
    win: 25, lose: -25
  },

  /* 锦标赛奖励 */
  TOURNAMENT: {
    championCoins: 400
  },

  STATS: {
    armor:     { name: '装甲', desc: '每点 +4% 最大装甲', max: 10 },
    agility:   { name: '机动', desc: '每点 +3% 移动速度', max: 10 },
    firepower: { name: '火力', desc: '每点 +5% 武器伤害', max: 10 },
    support:   { name: '辅助', desc: '每点 -3% 技能冷却', max: 10 }
  },

  data: null,

  /* ---------- 存档 ---------- */
  defaults() {
    const mechs = {};
    for (const id of Object.keys(this.DEFAULT_LOADOUT)) {
      mechs[id] = {
        unlocked: id === 'tank' || id === 'scout',
        level: 1, exp: 0,
        pts: { armor: 0, agility: 0, firepower: 0, support: 0 },
        loadout: this.DEFAULT_LOADOUT[id].slice(),
        plug: null                    // 插件槽
      };
    }
    return {
      coins: 500,
      ownedWeapons: this.START_WEAPONS.slice(),
      ownedPlugins: this.START_PLUGINS.slice(),
      mechs,
      lastWinDate: '',
      ranked: { score: 1000, wins: 0, losses: 0 },
      tournament: { champions: 0 },
      survival: { bestWave: 0, bestKills: 0 },
      boss: { clears: 0, bestTime: 0, bestDamage: 0 },
      medals: 0,
      skins: {},
      ownedSkins: [],
      guided: false,
      stats: { wins: 0, losses: 0, gamesPlayed: 0, kills: 0, coinsEarned: 0, ultiUsed: 0, mechGames: {} },
      achievements: [],
      daily: null,
      settings: Object.assign({}, this.DEFAULT_SETTINGS)
    };
  },

  load() {
    try {
      /* 旧档迁移：首次登录用户若还没有存档，则继承 guest（未登录）时代的旧档，避免丢失进度 */
      if (typeof Account !== 'undefined' && Account.isLoggedIn()) {
        const userKey = this.KEY;
        if (!localStorage.getItem(userKey)) {
          const legacy = localStorage.getItem('mechArenaSave_v1_guest') || localStorage.getItem('mechArenaSave_v1');
          if (legacy) localStorage.setItem(userKey, legacy);
        }
      }
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        this.data = JSON.parse(raw);
        this.sanitize();
      } else {
        this.data = this.defaults();
        this.save();
      }
    } catch (e) {
      /* 无 localStorage（隐私模式/测试环境）→ 内存存档 */
      this.data = this.defaults();
    }
  },

  sanitize() {
    const d = this.defaults();
    /* 极老/损坏存档兜底：保证关键容器存在，避免 TypeError 导致整个存档重置 */
    if (!this.data.mechs || typeof this.data.mechs !== 'object') this.data.mechs = {};
    if (!this.data.stats || typeof this.data.stats !== 'object') this.data.stats = {};
    for (const id of Object.keys(d.mechs)) {
      const m = this.data.mechs[id];
      if (!m) { this.data.mechs[id] = d.mechs[id]; continue; }
      m.unlocked = !!m.unlocked;
      m.level = Math.max(1, Math.floor(Number(m.level) || 1));
      m.exp = Math.max(0, Math.floor(Number(m.exp) || 0));
      m.pts = Object.assign({ armor: 0, agility: 0, firepower: 0, support: 0 }, m.pts || {});
      /* 属性点钳制到上限（防损坏存档数值爆炸：armor 99 → +396% 血） */
      for (const k of ['armor', 'agility', 'firepower', 'support']) {
        m.pts[k] = U.clamp(Math.floor(Number(m.pts[k]) || 0), 0, this.STATS[k].max);
      }
      /* 旧存档 loadout（{main,sub} 对象）迁移为槽位数组 */
      if (Array.isArray(m.loadout)) {
        m.loadout = m.loadout.slice(0, this.DEFAULT_LOADOUT[id].length);
        while (m.loadout.length < this.DEFAULT_LOADOUT[id].length) m.loadout.push(this.DEFAULT_LOADOUT[id][m.loadout.length]);
      } else if (m.loadout && m.loadout.main) {
        m.loadout = [m.loadout.main, m.loadout.sub, ...this.DEFAULT_LOADOUT[id].slice(2)];
      } else {
        m.loadout = this.DEFAULT_LOADOUT[id].slice();
      }
    }
    this.data.coins = Number.isFinite(this.data.coins) ? this.data.coins : d.coins;
    this.data.ownedWeapons = Array.isArray(this.data.ownedWeapons)
      ? this.data.ownedWeapons.filter(w => CFG.WEAPONS[w])
      : d.ownedWeapons.slice();
    this.data.ownedPlugins = Array.isArray(this.data.ownedPlugins)
      ? this.data.ownedPlugins.filter(p => CFG.PLUGINS[p])
      : d.ownedPlugins.slice();
    if (!this.data.ranked) this.data.ranked = { score: 1000, wins: 0, losses: 0, winStreak: 0 };
    /* 类型/NaN 清洗：防字符串拼接导致段位异常（"1000"+28 → 1600 大师） */
    const rk = this.data.ranked;
    rk.score = U.clamp(Number.isFinite(+rk.score) ? +rk.score : 1000, 100, 1600);
    rk.wins = Math.max(0, Number.isFinite(+rk.wins) ? +rk.wins : 0);
    rk.losses = Math.max(0, Number.isFinite(+rk.losses) ? +rk.losses : 0);
    rk.winStreak = Math.max(0, Number.isFinite(+rk.winStreak) ? +rk.winStreak : 0);
    /* mechGames 过滤非法 key（防档案页崩溃） */
    if (this.data.stats.mechGames) {
      const mg = {};
      for (const [id, n] of Object.entries(this.data.stats.mechGames)) {
        if (CFG.MECHS[id] && Number.isFinite(+n)) mg[id] = +n;
      }
      this.data.stats.mechGames = mg;
    }
    /* 过期每日任务过滤 */
    if (this.data.daily && Array.isArray(this.data.daily.tasks)) {
      this.data.daily.tasks = this.data.daily.tasks.filter(t => this.DAILY_POOL.some(p => p.id === t.id));
      if (!this.data.daily.tasks.length) this.data.daily = null;
    }
    /* coins NaN 兜底 */
    if (!Number.isFinite(this.data.coins)) this.data.coins = 500;
    if (!this.data.tournament) this.data.tournament = { champions: 0 };
    if (!this.data.survival) this.data.survival = { bestWave: 0, bestKills: 0 };
    if (!this.data.boss) this.data.boss = { clears: 0, bestTime: 0, bestDamage: 0 };
    if (typeof this.data.medals !== 'number') this.data.medals = 0;
    if (!this.data.skins) this.data.skins = {};
    if (!Array.isArray(this.data.ownedSkins)) this.data.ownedSkins = ['default'];
    if (typeof this.data.guided !== 'boolean') this.data.guided = false;
    this.data.stats = Object.assign({ wins: 0, losses: 0, gamesPlayed: 0, kills: 0, coinsEarned: 0, ultiUsed: 0, mechGames: {} }, this.data.stats || {});
    const st = this.data.stats;
    for (const k of ['wins', 'losses', 'gamesPlayed', 'kills', 'coinsEarned', 'ultiUsed', 'lastStreak']) {
      st[k] = Math.max(0, Number.isFinite(+st[k]) ? +st[k] : 0);
    }
    if (!st.mechGames) st.mechGames = {};
    this.data.achievements = Array.isArray(this.data.achievements) ? this.data.achievements : [];
    this.data.settings = Object.assign({}, this.DEFAULT_SETTINGS, this.data.settings || {});
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* 忽略 */ }
  },

  /* ---------- 生存模式结算 ---------- */
  finishSurvival(mechId, wave, kills) {
    const coins = wave * 15 + kills * 10;
    const exp = wave * 12 + kills * 6;
    this.addCoins(coins);
    const expResult = this.addExp(mechId, exp);
    const d = this.data.survival;
    const newBest = wave > d.bestWave;
    if (newBest) d.bestWave = wave;
    if (kills > d.bestKills) d.bestKills = kills;
    this.data.stats.kills += kills;
    this.data.stats.gamesPlayed++;
    const medalsGained = this.addMedals(Math.floor(wave * CFG.MEDAL_REWARD.survivalPerWave));
    const mg = this.data.stats.mechGames;
    mg[mechId] = (mg[mechId] || 0) + 1;
    this.addDailyProgress('d_kills', kills);
    this.addDailyProgress('d_survive', wave);
    this.save();
    this.checkAchievements();
    return {
      coins, exp: expResult.exp, expGain: exp, newBest, medalsGained,
      bestWave: d.bestWave, bestKills: d.bestKills,
      leveled: expResult.leveled, level: expResult.level
    };
  },

  /* ---------- Boss 战结算 ---------- */
  finishBoss(mechId, bossType, win, dmgDealt, timeSec) {
    const d = this.data.boss;
    let coins = Math.floor(dmgDealt / 30) + (win ? 260 : 0);
    const exp = Math.floor(dmgDealt / 15) + (win ? 100 : 0);
    const firstClear = win && d.clears === 0;
    if (firstClear) coins += 300;
    const medalsGained = win ? this.addMedals(CFG.MEDAL_REWARD.bossWin) : 0;
    if (win) {
      d.clears++;
      if (!d.bestTime || timeSec < d.bestTime) d.bestTime = Math.round(timeSec);
      /* 各 Boss 独立记录 */
      if (bossType) {
        if (!this.data.bossRec) this.data.bossRec = {};
        const rec = (this.data.bossRec[bossType] = this.data.bossRec[bossType] || { clears: 0, bestTime: 0 });
        rec.clears++;
        if (!rec.bestTime || timeSec < rec.bestTime) rec.bestTime = Math.round(timeSec);
      }
    }
    if (dmgDealt > d.bestDamage) d.bestDamage = Math.floor(dmgDealt);
    this.addCoins(coins);
    const expResult = this.addExp(mechId, exp);
    this.data.stats.gamesPlayed++;
    const mg = this.data.stats.mechGames;
    mg[mechId] = (mg[mechId] || 0) + 1;
    this.save();
    this.checkAchievements();
    return {
      coins, exp: expResult.exp, expGain: exp, firstClear, medalsGained,
      clears: d.clears, bestTime: d.bestTime, bestDamage: d.bestDamage,
      leveled: expResult.leveled, level: expResult.level
    };
  },

  /* ---------- 统计与事件钩子 ---------- */
  recordWin() {
    this.data.stats.wins++;
    this.addDailyProgress('d_win', 1);
    this.save();
    this.checkAchievements();
  },

  recordRanked() {
    this.addDailyProgress('d_ranked', 1);
    this.save();
    this.checkAchievements();
  },

  recordUlti() {
    this.data.stats.ultiUsed++;
    this.addDailyProgress('d_ulti', 1);
    this.save();
  },

  recordSpend(n) {
    this.addDailyProgress('d_spend', n);
    this.save();
  },

  /* ---------- 成就 ---------- */
  isAchieved(id) { return this.data.achievements.includes(id); },

  checkAchievements() {
    const s = this.data.stats;
    const newly = [];
    for (const a of this.ACHIEVEMENTS) {
      if (this.isAchieved(a.id)) continue;
      let done = false;
      switch (a.id) {
        case 'first_win': done = s.wins >= 1; break;
        case 'win_10': done = s.wins >= 10; break;
        case 'kill_100': done = s.kills >= 100; break;
        case 'streak_5': done = this.lastStreak >= 5; break;
        case 'champion_1': done = this.data.tournament.champions >= 1; break;
        case 'rank_gold': done = this.rankFor(this.data.ranked.score).min >= 1120; break;
        case 'rank_master': done = this.rankFor(this.data.ranked.score).min >= 1480; break;
        case 'survival_10': done = this.data.survival.bestWave >= 10; break;
        case 'survival_20': done = this.data.survival.bestWave >= 20; break;
        case 'all_weapons': done = Object.keys(this.SHOP.weapons).every(w => this.hasWeapon(w)) && this.START_WEAPONS.every(w => this.hasWeapon(w)); break;
        case 'all_plugins': done = Object.keys(CFG.PLUGINS).every(p => this.hasPlugin(p)); break;
        case 'rich_2000': done = s.coinsEarned >= 2000; break;
        case 'boss_kill': done = this.data.boss.clears >= 1; break;
        case 'boss_3': done = this.data.boss.clears >= 3; break;
      }
      if (done) {
        this.data.achievements.push(a.id);
        this.addCoins(a.reward);
        newly.push(a);
      }
    }
    if (newly.length) this.save();
    return newly;
  },

  /* ---------- 每日任务 ---------- */
  today() { return new Date().toISOString().slice(0, 10); },

  getDaily() {
    const t = this.today();
    if (!this.data.daily || this.data.daily.date !== t) {
      /* 按日期种子稳定随机选 3 个任务（标准 LCG，保证均匀） */
      let seed = 0;
      for (const ch of t) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
      const rand = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
      const pool = this.DAILY_POOL.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      this.data.daily = {
        date: t,
        tasks: pool.slice(0, 3).map(p => ({ id: p.id, prog: 0, done: false }))
      };
      this.save();
    }
    return this.data.daily;
  },

  addDailyProgress(id, n) {
    const d = this.getDaily();
    let changed = false;
    for (const task of d.tasks) {
      if (task.id === id && !task.done && !task.claimed) {
        const pool = this.DAILY_POOL.find(p => p.id === id);
        task.prog = Math.min(pool.target, task.prog + n);
        if (task.prog >= pool.target) task.done = true;
        changed = true;
      }
    }
    if (changed) this.save();
  },

  claimDaily(idx) {
    const d = this.getDaily();
    const task = d.tasks[idx];
    if (!task || !task.done || task.claimed) return false;
    const pool = this.DAILY_POOL.find(p => p.id === task.id);
    this.addCoins(pool.reward);
    task.done = false;                 // 已领取
    task.claimed = true;
    this.save();
    return pool.reward;
  },

  /* ---------- 徽章 & 皮肤 ---------- */
  medals() { return this.data.medals; },
  addMedals(n) {
    if (n <= 0) return 0;
    this.data.medals += n;
    this.save();
    return n;
  },
  spendMedals(n) {
    if (this.data.medals < n) return false;
    this.data.medals -= n;
    this.save();
    return true;
  },

  hasSkin(id) { return this.data.ownedSkins.includes(id); },

  skinFor(mechId) {
    const equipped = this.data.skins[mechId];
    const list = CFG.SKINS[mechId] || [];
    return list.find(x => x.id === equipped) || list[0] || null;
  },

  buySkin(mechId, skinId) {
    const skin = (CFG.SKINS[mechId] || []).find(x => x.id === skinId);
    if (!skin || skin.cost <= 0 || this.hasSkin(skinId)) return false;
    if (!this.spendMedals(skin.cost)) return false;
    this.data.ownedSkins.push(skinId);
    this.data.skins[mechId] = skinId;
    this.save();
    return true;
  },

  equipSkin(mechId, skinId) {
    const skin = (CFG.SKINS[mechId] || []).find(x => x.id === skinId);
    if (!skin || (skin.cost > 0 && !this.hasSkin(skinId))) return false;
    this.data.skins[mechId] = skinId;
    this.save();
    return true;
  },

  /* 徽章兑换 */
  redeemMedal(itemId, mechId) {
    const item = CFG.MEDAL_SHOP[itemId];
    if (!item) return { ok: false };
    if (!this.spendMedals(item.cost)) return { ok: false, msg: '徽章不足' };
    switch (item.type) {
      case 'coins': this.addCoins(600); break;
      case 'xp': this.addExp(mechId, 300); break;
      case 'ulti': this.data.pendingUltiCharge = true; break;   // 下一局大招直接充满
    }
    this.save();
    return { ok: true };
  },
  consumeUltiCharge() {
    if (this.data.pendingUltiCharge) {
      this.data.pendingUltiCharge = false;
      this.save();
      return true;
    }
    return false;
  },

  /* ---------- 设置 ---------- */
  get settings() { return this.data.settings; },

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
    this.applySettings();
  },

  applySettings() {
    const s = this.data.settings;
    if (typeof SFX !== 'undefined') SFX.setVolume(s.volume);
    Particles.MAX = s.fxQuality === 'low' ? 300 : s.fxQuality === 'medium' ? 500 : 700;
    FXQuality.shadow = s.fxQuality !== 'low';
    FXQuality.weather = s.fxQuality !== 'low';
    FXQuality.lightColumns = s.fxQuality !== 'low';
    FXQuality.ambient = s.fxQuality === 'low' ? 14 : s.fxQuality === 'medium' ? 30 : 46;
    try {
      Music.setEnabled(!!s.music);
      Music.setVolume(s.volume);
    } catch (e) { /* Music 未加载（TDZ）时忽略 */ }
  },

  resetSave() {
    this.data = this.defaults();
    this.save();
  },

  /* ---------- 存档导出 / 导入（JSON 备份，含版本号） ---------- */
  exportSave() {
    return JSON.stringify({ app: 'mech-arena', version: 1, savedAt: Date.now(), data: this.data });
  },

  importSave(json) {
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      return { ok: false, error: '文件不是有效的 JSON' };
    }
    const data = (parsed && typeof parsed === 'object') ? (parsed.data || parsed) : null;
    if (!data || typeof data !== 'object') return { ok: false, error: '存档内容无效' };
    this.data = data;
    this.sanitize();
    this.save();
    return { ok: true, coins: this.data.coins };
  },

  /* ---------- 金币 ---------- */
  coins() { return this.data.coins; },
  addCoins(n) {
    this.data.coins += n;
    if (n > 0) this.data.stats.coinsEarned += n;
    this.save();
  },

  /* ---------- 机甲数据 ---------- */
  mech(id) {
    if (!this.data.mechs[id]) this.data.mechs[id] = this.defaults().mechs[id];
    const m = this.data.mechs[id];
    /* 惰性规范化 loadout：长度对齐槽位、无效武器回退（修复旧档/异常数据） */
    const slots = CFG.MECHS[id].slots;
    if (!Array.isArray(m.loadout)) {
      m.loadout = this.DEFAULT_LOADOUT[id].slice();
    } else {
      m.loadout = slots.map((type, i) => {
        const w = m.loadout[i];
        return CFG.WEAPONS[w] ? w : (type === 'sub' ? 'grenade' : 'minigun');
      });
    }
    return m;
  },

  isUnlocked(id) { return this.mech(id).unlocked; },

  /* ---------- 商店购买 ---------- */
  hasWeapon(id) { return this.data.ownedWeapons.includes(id); },

  buyWeapon(id) {
    const cost = this.SHOP.weapons[id];
    if (!cost || this.hasWeapon(id) || this.data.coins < cost) return false;
    this.data.coins -= cost;
    this.data.ownedWeapons.push(id);
    this.save();
    this.recordSpend(cost);
    this.checkAchievements();
    return true;
  },

  buyChassis(id) {
    const cost = this.SHOP.chassis[id];
    if (!cost || this.isUnlocked(id) || this.data.coins < cost) return false;
    this.data.coins -= cost;
    this.mech(id).unlocked = true;
    this.save();
    this.recordSpend(cost);
    return true;
  },

  hasPlugin(id) { return this.data.ownedPlugins.includes(id); },

  buyPlugin(id) {
    const cost = this.SHOP.plugins[id];
    if (!cost || this.hasPlugin(id) || this.data.coins < cost) return false;
    this.data.coins -= cost;
    this.data.ownedPlugins.push(id);
    this.save();
    this.recordSpend(cost);
    this.checkAchievements();
    return true;
  },

  /* 插件装备到底盘 */
  setPlug(chassisId, plugId) {
    if (plugId && !CFG.PLUGINS[plugId]) return false;
    if (plugId && !this.hasPlugin(plugId)) return false;
    this.mech(chassisId).plug = plugId || null;
    this.save();
    return true;
  },

  /* ---------- 武器配置（loadout：按槽位数组） ---------- */
  getLoadout(chassisId) {
    const m = this.mech(chassisId);
    const slots = CFG.MECHS[chassisId].slots;
    const ld = (Array.isArray(m.loadout) ? m.loadout : this.DEFAULT_LOADOUT[chassisId]);
    return slots.map((type, i) => {
      const w = ld[i];
      /* 未拥有的武器回退：主→火神机枪，副→榴弹 */
      return this.hasWeapon(w) ? w : (type === 'sub' ? 'grenade' : 'minigun');
    });
  },

  setLoadout(chassisId, slotIndex, weaponId) {
    if (!CFG.WEAPONS[weaponId] || !this.hasWeapon(weaponId)) return false;
    const slots = CFG.MECHS[chassisId].slots;
    if (slotIndex < 0 || slotIndex >= slots.length) return false;
    const m = this.mech(chassisId);
    m.loadout = this.getLoadout(chassisId);
    m.loadout[slotIndex] = weaponId;
    this.save();
    return true;
  },

  /* ---------- 等级经验 ---------- */
  expNeed(level) { return 100 + (level - 1) * 60; },

  addExp(id, n) {
    const m = this.mech(id);
    m.exp += n;
    let leveled = false;
    while (m.exp >= this.expNeed(m.level)) {
      m.exp -= this.expNeed(m.level);
      m.level++;
      leveled = true;
    }
    this.save();
    return { leveled, level: m.level, exp: m.exp, need: this.expNeed(m.level) };
  },

  /* 可用属性点 = 等级 - 1 - 已用点数 */
  availPoints(id) {
    const m = this.mech(id);
    const used = m.pts.armor + m.pts.agility + m.pts.firepower + m.pts.support;
    return Math.max(0, m.level - 1 - used);
  },

  spendPoint(id, stat) {
    const m = this.mech(id);
    const cfg = this.STATS[stat];
    if (!cfg) return false;
    if (this.availPoints(id) <= 0) return false;
    if (m.pts[stat] >= cfg.max) return false;
    m.pts[stat]++;
    this.save();
    return true;
  },

  /* 该机甲的战斗属性加成倍率 */
  bonuses(id) {
    const p = this.mech(id).pts;
    return {
      hpMult: 1 + p.armor * 0.04,
      speedMult: 1 + p.agility * 0.03,
      dmgMult: 1 + p.firepower * 0.05,
      cdMult: Math.max(0.4, 1 - p.support * 0.03)
    };
  },

  /* ---------- 排位赛 ---------- */
  rankFor(score) {
    let r = this.RANKS[0];
    for (const rk of this.RANKS) if (score >= rk.min) r = rk;
    return r;
  },

  rankProgress(score) {
    const r = this.rankFor(score);
    const next = this.RANKS[this.RANKS.indexOf(r) + 1];
    if (!next) return { rank: r, pct: 100, next: null };
    const pct = U ? U.clamp((score - r.min) / (next.min - r.min) * 100, 0, 100) : 0;
    return { rank: r, pct, next };
  },

  finishRanked(win, kills) {
    const d = this.data.ranked;
    const oldRank = this.rankFor(d.score);
    if (win) {
      d.wins++;
      d.winStreak = (d.winStreak || 0) + 1;
    } else {
      d.losses++;
      d.winStreak = 0;
    }
    /* 连胜加成：第 2 连胜起每胜 +3，封顶 +6（避免段位通胀） */
    const streakBonus = win ? 3 * Math.min(Math.max(d.winStreak - 1, 0), 2) : 0;
    if (win) this.addMedals(CFG.MEDAL_REWARD.rankedWinBonus);
    d.score = U.clamp(d.score + (win ? this.RANKED.win : this.RANKED.lose) + streakBonus, this.RANK_SCORE_MIN, 1600);
    const newRank = this.rankFor(d.score);
    this.save();
    this.recordRanked();
    this.checkAchievements();
    return {
      delta: (win ? this.RANKED.win : this.RANKED.lose) + streakBonus,
      score: d.score, wins: d.wins, losses: d.losses,
      winStreak: d.winStreak || 0, streakBonus,
      oldRank, newRank,
      rankUp: newRank !== oldRank && newRank.min > oldRank.min,
      rankDown: newRank !== oldRank && newRank.min < oldRank.min
    };
  },

  /* ---------- 锦标赛 ---------- */
  addChampion() {
    this.data.tournament.champions++;
    this.addMedals(CFG.MEDAL_REWARD.champion);
    this.addCoins(this.TOURNAMENT.championCoins);
    this.save();
    this.checkAchievements();
    return this.data.tournament.champions;
  },

  /* ---------- 每局结算 ---------- */
  finishMatch(id, win, kills) {
    const today = new Date().toISOString().slice(0, 10);
    let firstWin = false;
    if (win && this.data.lastWinDate !== today) {
      this.data.lastWinDate = today;
      firstWin = true;
    }
    const R = this.REWARD;
    const coins = (win ? R.winCoins : R.loseCoins) + kills * R.killCoins + (firstWin ? R.firstWinCoins : 0);
    const exp = (win ? R.winExp : R.loseExp) + kills * R.killExp;
    this.addCoins(coins);
    const expResult = this.addExp(id, exp);

    /* 统计：场次/胜负/机甲使用 */
    this.data.stats.gamesPlayed++;
    if (!win) this.data.stats.losses++;
    const mg = this.data.stats.mechGames;
    mg[id] = (mg[id] || 0) + 1;

    /* 成就 & 每日任务钩子 */
    const medalsGained = win ? this.addMedals(CFG.MEDAL_REWARD.win) : 0;
    if (win) this.recordWin();
    if (kills > 0) {
      this.data.stats.kills += kills;
      this.lastStreak = Math.max(this.lastStreak || 0, kills);
      this.data.stats.lastStreak = Math.max(this.data.stats.lastStreak || 0, this.lastStreak);
      this.addDailyProgress('d_kills', kills);
    }
    this.save();
    this.checkAchievements();

    return { coins, exp: expResult.exp, expGain: exp, kills, firstWin, medalsGained, leveled: expResult.leveled, level: expResult.level };
  }
};

Progress.load();
