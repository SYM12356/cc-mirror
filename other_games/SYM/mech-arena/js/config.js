'use strict';
/* ============================================================
 * 全局配置：底盘 / 武器 / 技能 / 插件 / 大招 / 道具 / 地图 / 皮肤 / 徽章 / Boss
 * ============================================================ */

const CFG = {
  W: 1280,          // 画布宽
  H: 720,           // 画布高

  /* ---------- 底盘定义（武器自由配置，见 Progress.loadout）
   * slots: 武器槽位列表 — 'main' 无限弹药（机枪过热）；'sub' 消耗弹药 */
  MECHS: {
    tank: {
      id: 'tank', name: '磐石 · 重装底盘',
      desc: '厚重装甲正面硬刚；3 武器槽，被动减伤，技能能量护盾',
      hp: 130, speed: 128, radius: 21,
      slots: ['main', 'sub', 'sub'],
      skill: 'shield',
      passive: { name: '厚重装甲', type: 'dmgReduce', value: 0.08, desc: '受到的伤害 -8%' },
      color: '#4dabf7', colorDark: '#1b6fb0'
    },
    scout: {
      id: 'scout', name: '疾风 · 轻型底盘',
      desc: '极速机动；2 武器槽，被动加速，技能能量冲刺',
      hp: 78, speed: 212, radius: 16,
      slots: ['main', 'sub'],
      skill: 'dash',
      passive: { name: '疾风引擎', type: 'speedUp', value: 0.06, desc: '移动速度 +6%' },
      color: '#63e6be', colorDark: '#12b886'
    },
    assault: {
      id: 'assault', name: '猛禽 · 突击底盘',
      desc: '双主武器无限火力；被动技能加速，技能EMP脉冲',
      hp: 96, speed: 168, radius: 18,
      slots: ['main', 'main'],
      skill: 'emp',
      passive: { name: '战术核心', type: 'cdReduce', value: 0.12, desc: '技能冷却 -12%' },
      color: '#ffa94d', colorDark: '#e8590c'
    },
    artillery: {
      id: 'artillery', name: '烈焰 · 炮手底盘',
      desc: '多武器火力平台；3 武器槽，被动伤害加成，技能湮灭炮',
      hp: 92, speed: 150, radius: 18,
      slots: ['main', 'main', 'sub'],
      skill: 'nuke',
      passive: { name: '弹药大师', type: 'dmgUp', value: 0.08, desc: '武器伤害 +8%' },
      color: '#ff6b6b', colorDark: '#c92a2a'
    },
    guardian: {
      id: 'guardian', name: '守护 · 支援底盘',
      desc: '钢铁壁垒守护者；3 武器槽，被动再生，技能治疗波',
      hp: 118, speed: 148, radius: 20,
      slots: ['main', 'sub', 'sub'],
      skill: 'heal',
      passive: { name: '纳米再生', type: 'regen', value: 3, desc: '每 2.5 秒回复 3 点装甲' },
      color: '#b197fc', colorDark: '#7048e8'
    }
  },

  /* ---------- 武器定义（主槽无限弹药；副槽消耗弹药） ---------- */
  WEAPONS: {
    minigun: {
      name: '火神机枪',
      desc: '高射速弹幕，连续射击会过热',
      dmg: 6, rate: 0.085, speed: 660, spread: 0.11,
      bulletSize: 3.2, color: '#ffd166', knock: 30,
      heatPerShot: 3.2
    },
    laser: {
      name: '脉冲激光',
      desc: '精准单发，穿透 1 个目标',
      dmg: 15, rate: 0.3, speed: 920, spread: 0.015,
      bulletSize: 4.5, color: '#ff5da2', knock: 60,
      pierce: 1
    },
    shotgun: {
      name: '霰弹风暴',
      desc: '扇形 6 连发，近身爆发之王',
      dmg: 10, pellets: 6, rate: 0.72, speed: 540, spread: 0.30,
      bulletSize: 3.6, color: '#ffd166', knock: 120
    },
    missile: {
      name: '追踪导弹',
      desc: '自动追踪目标，命中范围爆炸',
      dmg: 34, rate: 1.05, speed: 340, spread: 0.03,
      bulletSize: 6, color: '#ffa94d', knock: 180,
      homing: true, turn: 3.2, aoe: 64
    },
    plasma: {
      name: '等离子炮',
      desc: '蓄能重炮，范围伤害击退强',
      dmg: 58, rate: 1.35, speed: 300, spread: 0.02,
      bulletSize: 9, color: '#9775fa', knock: 260,
      aoe: 56
    },
    grenade: {
      name: '榴弹发射器',
      desc: '弹墙反弹的榴弹，消耗弹药',
      dmg: 46, rate: 0.9, speed: 420, spread: 0.05,
      bulletSize: 7, color: '#69db7c', knock: 200,
      aoe: 72, bounce: true
    },
    sniper: {
      name: '狙击枪',
      desc: '超远狙击，穿透 3 个目标，一击致命',
      dmg: 60, rate: 1.25, speed: 1400, spread: 0.005,
      bulletSize: 3.2, color: '#e5dbff', knock: 160,
      pierce: 3, tracer: true
    },
    frost: {
      name: '冰霜枪',
      desc: '冰冻射线，命中减速 35%',
      dmg: 6, rate: 0.13, speed: 760, spread: 0.03,
      bulletSize: 5, color: '#66d9e8', knock: 20,
      slow: 0.35, slowDur: 1.6
    },
    flame: {
      name: '火焰喷射器',
      desc: '短程喷火，持续范围灼烧',
      dmg: 5, rate: 0.06, speed: 320, spread: 0.12,
      bulletSize: 5, color: '#ff922b', knock: 10,
      aoe: 34, life: 0.22, fire: true
    },
    needle: {
      name: '毒针枪',
      desc: '命中注入毒素，持续掉血',
      dmg: 10, rate: 0.25, speed: 820, spread: 0.02,
      bulletSize: 3, color: '#8ce99a', knock: 30,
      dot: { dps: 6, dur: 3 }
    },
    tesla: {
      name: '特斯拉电弧枪',
      desc: '电弧弹命中溅射，小范围电击',
      dmg: 14, rate: 0.24, speed: 860, spread: 0.04,
      bulletSize: 5, color: '#74c0fc', knock: 60,
      aoe: 42, spark: true
    },
    napalm: {
      name: '燃烧榴弹',
      desc: '落地后点燃战场，灼烧地带持续 2.5 秒',
      dmg: 20, rate: 1.0, speed: 360, spread: 0.04,
      bulletSize: 7, color: '#ff8787', knock: 140,
      aoe: 80, burn: { r: 90, dps: 14, dur: 2.5 }
    },
    sonic: {
      name: '声波炮',
      desc: '震荡波穿透 4 个目标，强击退',
      dmg: 24, rate: 0.85, speed: 640, spread: 0.01,
      bulletSize: 10, color: '#c0eb75', knock: 260,
      pierce: 4
    },
    saw: {
      name: '链锯风暴',
      desc: '近战持续切割，贴脸伤害爆炸',
      dmg: 13, rate: 0.09, speed: 0, spread: 0,
      bulletSize: 0, color: '#ffa94d', knock: 90,
      melee: true, range: 92
    },
    rail: {
      name: '充能磁轨炮',
      desc: '电磁加速重弹，穿透 5 个目标',
      dmg: 42, rate: 1.15, speed: 1500, spread: 0.005,
      bulletSize: 5, color: '#e599f7', knock: 220,
      pierce: 5, tracer: true
    }
  },

  /* 副武器弹药 */
  SUB_AMMO_MAX: 10,
  SUB_AMMO_START: 8,

  /* ---------- 技能定义 ---------- */
  SKILLS: {
    dash: {
      name: '能量冲刺', cd: 3.4, dur: 0.16, impulse: 1500,
    },
    shield: {
      name: '能量护盾', cd: 9, dur: 3.2, absorb: 0.72
    },
    emp: {
      name: 'EMP 脉冲', cd: 9.5, radius: 180, stun: 2.3
    },
    nuke: {
      name: '湮灭炮', cd: 13, radius: 115, dmg: 85, selfDmg: 22,
      charge: 0.7
    },
    heal: {
      name: '治疗波', cd: 8, heal: 32, clear: true,
      color: '#b197fc'
    }
  },

  /* ---------- 道具 ---------- */
  PICKUPS: {
    health:  { name: '修复包', color: '#51cf66', icon: '+', val: 30, weight: 34 },
    mega:    { name: '超级修复', color: '#2f9e44', icon: '++', val: 70, weight: 10 },
    ammo:    { name: '弹药箱', color: '#ffd43b', icon: '≡', val: 8, weight: 26 },
    boost:   { name: '推进器', color: '#22b8cf', icon: '»', val: 8, weight: 18 },
    shield:  { name: '护盾核心', color: '#748ffc', icon: '◎', val: 40, weight: 12 }
  },
  PICKUP_LIFE: 22,
  PICKUP_MAX_ON_FIELD: 6,
  PICKUP_SPAWN_INTERVAL: 4.5,

  /* ---------- 地图 ---------- */
  MAP: {
    wall: 14,
    grid: 48,
    obstacles: 9,
    obstacleMin: 46, obstacleMax: 150
  },

  AI_DIFFICULTY: {
    easy:   { aimErr: 0.20, react: 0.5,  fireChance: 0.55, skillChance: 0.35 },
    normal: { aimErr: 0.085, react: 0.25, fireChance: 0.8,  skillChance: 0.6 },
    hard:   { aimErr: 0.035, react: 0.12, fireChance: 0.95, skillChance: 0.85 }
  },

  /* ---------- 插件（每台底盘 1 个插件槽） ---------- */
  PLUGINS: {
    drone: {
      name: '攻击无人机',
      desc: '环绕机身，自动射击附近敌人（每 1.0 秒一发）'
    },
    repair: {
      name: '维修核心',
      desc: '每 5 秒自动修复 5 点装甲'
    },
    ammo: {
      name: '弹药背包',
      desc: '副武器弹药上限 +10，开局弹药全满'
    },
    armor: {
      name: '反应装甲',
      desc: '受到的伤害 -10%（与底盘被动叠加）'
    },
    engine: {
      name: '急速引擎',
      desc: '移动速度 +10%'
    },
    battery: {
      name: '能量电池',
      desc: '大招充能速度 +40%'
    }
  },

  /* ---------- 底盘专属大招（能量条攒满后释放） ---------- */
  ULTIS: {
    tank: {
      name: '终极壁垒', color: '#4dabf7', icon: '🛡',
    },
    scout: {
      name: '幻影连击', color: '#63e6be', icon: '🌪',
    },
    assault: {
      name: '雷霆审判', color: '#ffa94d', icon: '⚡',
    },
    artillery: {
      name: '天罚轰炸', color: '#ff6b6b', icon: '☄',
    },
    guardian: {
      name: '圣盾领域', color: '#b197fc', icon: '✚',
    }
  },

  /* ---------- 机甲皮肤（徽章商店兑换） ---------- */
  SKINS: {
    tank: [
      { id: 'default',       name: '原版 · 蔚蓝', color: '#4dabf7', dark: '#1b6fb0', cost: 0 },
      { id: 'tank_crimson',  name: '猩红装甲',   color: '#ff6b6b', dark: '#9c2222', cost: 120 },
      { id: 'tank_emerald',  name: '翡翠武装',   color: '#51cf66', dark: '#2b8a3e', cost: 150 },
      { id: 'tank_gold',     name: '鎏金战甲',   color: '#ffd43b', dark: '#c0781e', cost: 200 }
    ],
    scout: [
      { id: 'default',        name: '原版 · 翠绿', color: '#63e6be', dark: '#12b886', cost: 0 },
      { id: 'scout_violet',   name: '暗影紫',     color: '#b197fc', dark: '#7048e8', cost: 120 },
      { id: 'scout_pink',     name: '樱花粉',     color: '#f783ac', dark: '#c2255c', cost: 150 },
      { id: 'scout_sky',      name: '天穹白',     color: '#a5d8ff', dark: '#4dabf7', cost: 200 }
    ],
    assault: [
      { id: 'default',         name: '原版 · 橙焰', color: '#ffa94d', dark: '#e8590c', cost: 0 },
      { id: 'assault_steel',   name: '暗钢',       color: '#adb5bd', dark: '#495057', cost: 120 },
      { id: 'assault_blood',   name: '血怒红',     color: '#ff8787', dark: '#c92a2a', cost: 150 },
      { id: 'assault_volt',    name: '霓虹紫',     color: '#9775fa', dark: '#5f3dc4', cost: 200 }
    ],
    artillery: [
      { id: 'default',           name: '原版 · 赤红', color: '#ff6b6b', dark: '#c92a2a', cost: 0 },
      { id: 'artillery_ember',   name: '余烬橙',     color: '#ff922b', dark: '#d9480f', cost: 120 },
      { id: 'artillery_ghost',   name: '幽灵白',     color: '#dee2e6', dark: '#868e96', cost: 150 },
      { id: 'artillery_cobalt',  name: '钴蓝重炮',   color: '#4dabf7', dark: '#1864ab', cost: 200 }
    ],
    guardian: [
      { id: 'default',            name: '原版 · 圣辉紫', color: '#b197fc', dark: '#7048e8', cost: 0 },
      { id: 'guardian_lumen',     name: '圣光金',       color: '#ffd43b', dark: '#c0781e', cost: 120 },
      { id: 'guardian_aurora',    name: '极光青',       color: '#63e6be', dark: '#0ca678', cost: 150 },
      { id: 'guardian_obsidian',  name: '黑曜石',       color: '#adb5bd', dark: '#343a40', cost: 200 }
    ]
  },

  /* ---------- 徽章兑换 ---------- */
  MEDAL_SHOP: {
    coin_bag:  { name: '金币袋',   icon: '💰', cost: 20, desc: '立即获得 600 金币',       type: 'coins' },
    xp_crystal: { name: '经验结晶', icon: '💎', cost: 50, desc: '当前机甲 +300 经验',     type: 'xp' },
    ulti_core:  { name: '能量核心', icon: '🔋', cost: 80, desc: '立即充满当前机甲大招能量', type: 'ulti' }
  },

  /* 各模式胜利的徽章奖励 */
  MEDAL_REWARD: {
    win: 1, rankedWinBonus: 1, champion: 5,
    survivalPerWave: 1 / 3,    // 每 3 波 +1
    bossWin: 3
  },

  /* ---------- Boss 定义 ---------- */
  BOSSES: {
    inferno: { name: '烈焰巨兽', icon: '🔥', desc: '火焰与毁灭之力 · 三阶段狂暴', color: '#ff6b6b', dark: '#a61e1e', hp: 3200 },
    frost: { name: '冰霜巨兽', icon: '❄️', desc: '极寒风暴主宰 · 冰刺与暴风雪', color: '#74c0fc', dark: '#1864ab', hp: 2800 },
    storm: { name: '雷暴主宰', icon: '⚡', desc: '雷霆万钧 · 落雷与连锁闪电', color: '#ffd43b', dark: '#e8590c', hp: 3000 }
  }
};
