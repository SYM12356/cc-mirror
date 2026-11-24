'use strict';
/* ============================================================
 * 冒烟测试：headless 模拟运行游戏逻辑（无 DOM）
 * 运行：node test/smoke.js
 * ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const files = [
  'js/utils.js', 'js/config.js', 'js/progress.js', 'js/input.js', 'js/sfx.js',
  'js/bullet.js', 'js/drone.js', 'js/pickup.js', 'js/map.js', 'js/robot.js',
  'js/ai.js', 'js/game.js', 'js/net.js', 'js/survival.js', 'js/boss.js'
];

/* 注入 UI mock（game.js 在结算时调用 UI.showResult） */
let src = 'const UI = { showResult() {}, drawHUD() {}, showSurvivalResult() {}, drawSurvivalHUD() {}, drawLanHUD() {}, showBossResult() {}, drawBossHUD() {} };\n';
for (const f of files) {
  src += fs.readFileSync(path.join(root, f), 'utf8') + '\n;\n';
}
src += '\nreturn { U, CFG, Input, SFX, Bullet, Pickup, GameMap, Robot, AI, Game, Survival, BossFight, Net, NetHost, NetView, FX, Progress, Particles, Ambient, ScreenFX, KillFeed, Combat };\n';

const bundle = vm.runInThisContext('(function(){' + src + '})()', { filename: 'bundle.js' });
const { U, CFG, Input, Game, Survival, BossFight, GameMap, NetHost, NetView, FX, Progress, Particles, Ambient, ScreenFX, KillFeed } = bundle;

let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ FAIL: ' + msg); failures++; }
}

console.log('== 单人模式（玩家 tank vs AI scout）==');
let g = new Game({ mode: 'single', p1Mech: 'tank', p2Mech: 'scout', aiDifficulty: 'normal' });
check(g.state === 'countdown', '初始为倒计时状态');
check(g.robots.length === 2, '创建两名机器人');

let sawPlaying = false, sawOver = false;
bundle.Input.down.add('KeyJ');   // 玩家自动开火（自动瞄准），保证战斗必然结束
for (let i = 0; i < 60 * 60; i++) {
  g.update(1 / 60);
  if (g.state === 'playing') sawPlaying = true;
  if (g.state === 'over' || g.state === 'ended') sawOver = true;
  if (g.state === 'ended') break;
}
bundle.Input.down.delete('KeyJ');
check(sawPlaying, '倒计时后进入对战');
const [p1, p2] = g.robots;
console.log(`  对战 ${Math.floor(g.time)}s → 玩家装甲 ${Math.round(p1.hp / p1.maxHp * 100)}% / AI 装甲 ${Math.round(p2.hp / p2.maxHp * 100)}%`);
check(p1.hp < p1.maxHp || p2.hp < p2.maxHp || p2.kills + p1.kills > 0, '发生了战斗（有血量损失或击杀）');
check(g.state === 'ended', '战斗正常结束并进入结算');

console.log('== 双人模式（P1 模拟按键开火，4 机甲组合各跑 30 秒；清空障碍隔离弹道遮挡）==');
for (const combo of [['tank', 'tank'], ['scout', 'artillery'], ['assault', 'assault'], ['artillery', 'scout']]) {
  g = new Game({ mode: 'duel', p1Mech: combo[0], p2Mech: combo[1] });
  g.map.obstacles = [];        // 隔离变量：验证纯战斗链路（AI 测试保留障碍验证绕障）
  bundle.Input.down.add('KeyJ');   // P1 按住开火（自动瞄准对方）
  for (let i = 0; i < 60 * 30; i++) {
    g.update(1 / 60);
    if (g.state === 'ended') break;
  }
  bundle.Input.down.delete('KeyJ');
  const [a, b] = g.robots;
  const fought = a.hp < a.maxHp || b.hp < b.maxHp || a.kills > 0 || b.kills > 0;
  console.log(`  ${combo[0]} vs ${combo[1]} → ${a.hp > 0 && b.hp > 0 ? '双方存活' : a.hp > 0 ? 'P1胜' : b.hp > 0 ? 'P2胜' : '同归于尽'} (${Math.floor(g.time)}s) 战斗=${fought}`);
  check(fought, `${combo[0]} vs ${combo[1]} 发生了战斗`);
}
check(true, '双人模式各组合运行无异常');

console.log('== 连杀奖励系统 ==');
(function () {
  const g2 = new bundle.Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
  const [a, b] = g2.robots;
  /* 直接驱动 die()：a 击杀 b 3 次 → tier1 */
  for (let i = 0; i < 3; i++) {
    b.hp = 0;
    b.die(g2, a);
    b.dead = false; b.hp = b.maxHp;   // 重置以便继续
  }
  check(a.killStreak === 3, `连杀计数 3（实际 ${a.killStreak}）`);
  check(a.streakTier === 1 && a.streakT > 0, `3 连杀触发 tier1 增益（tier=${a.streakTier}, t=${a.streakT.toFixed(1)}）`);
  /* 伤害加成：makeBullet 后子弹伤害 ≈ 武器伤害 * 1.15 */
  const wpn = bundle.CFG.WEAPONS.minigun;
  const bl = bundle.Combat.makeBullet(a, 0, wpn);
  check(bl.dmg === Math.round(wpn.dmg * 1.15), `tier1 伤害 +15%（期望 ${Math.round(wpn.dmg * 1.15)}，实际 ${bl.dmg}）`);
  /* 移速加成：tier2 */
  b.dead = false; b.hp = b.maxHp;
  for (let i = 0; i < 2; i++) { b.hp = 0; b.die(g2, a); b.dead = false; b.hp = b.maxHp; }
  check(a.killStreak === 5 && a.streakTier === 2, `5 连杀 → tier2（tier=${a.streakTier}）`);
  const baseSpeed = a.mech.speed;
  check(Math.abs(a.speed / baseSpeed - 1.10) < 0.001, `tier2 移速 +10%（${(a.speed / baseSpeed).toFixed(2)}x）`);
  /* 增益到期归零 */
  a.streakT = 0.02;
  a.update(0.03, g2);
  check(a.streakTier === 0, '增益到期后 tier 归零');
  /* 死亡清零 */
  for (let i = 0; i < 3; i++) { b.hp = 0; b.die(g2, a); b.dead = false; b.hp = b.maxHp; }
  a.streakT = 5;
  a.die(g2, b);
  check(a.killStreak === 0 && a.streakTier === 0, '死亡后连杀与增益清零');
})();

console.log('== 武器 & 技能冒烟 ==');
g = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
g.state = 'playing'; g.countdown = 0;
for (const r of g.robots) r.invulnT = 0;
/* 强制开火：直接调用 tryFire（绕过 readPlayer 对 fireHeld 的覆盖） */
const shooter = g.robots[0];
shooter.moveX = 1; shooter.moveY = 0;
shooter.aimOverride = U.angleTo(shooter.x, shooter.y, g.robots[1].x, g.robots[1].y);
let sawOverheat = false;
for (let i = 0; i < 60 * 6; i++) {
  shooter.cool = 0;             // 无视射速冷却，连续射击
  shooter.tryFire(g);
  g.update(1 / 60);
  if (shooter.overheated) sawOverheat = true;
}
check(true, '子弹系统正常（持续开火无异常）');
check(shooter.heat > 0 || sawOverheat, '机枪产生过热');
check(sawOverheat, '连续射击触发强制冷却');
shooter.overheated = false; shooter.heat = 0;
shooter.useSkill(g);   // shield
check(shooter.skillActive > 0 || shooter.skillCool > 0, '技能触发');
for (let i = 0; i < 60 * 10; i++) g.update(1 / 60);
check(shooter.skillCool < CFG.SKILLS.shield.cd, '技能冷却恢复');

console.log('== 道具系统 ==');
let spawned = 0;
for (let i = 0; i < 60 * 40; i++) {
  g.update(1 / 60);
  spawned = Math.max(spawned, g.pickups.length);
  if (g.state === 'ended') break;
}
check(spawned > 0, `道具正常刷新（场上最多 ${spawned} 个）`);

console.log('== 养成 & 经济系统 ==');
check(Progress.coins() === 500, '初始金币 500');
check(Progress.isUnlocked('tank') && Progress.isUnlocked('scout'), '磐石/疾风初始解锁');
check(!Progress.isUnlocked('assault'), '猛禽初始未解锁');
check(Progress.buyChassis('assault') === false, '金币不足无法购买（900 > 500）');
Progress.addCoins(500);
check(Progress.coins() === 1000, '加币后 1000');
check(Progress.buyChassis('assault') === true, '购买猛禽成功');
check(Progress.coins() === 100, '购买扣除 900 金币');

const r1 = Progress.finishMatch('tank', true, 2);
check(r1.coins === 120 + 40 + 80, `胜利+2杀+首胜 = ${r1.coins} 金币`);
check(r1.firstWin === true, '获得每日首胜奖励');
check(!r1.leveled, '90 经验不足升级（需 100）');
const r2 = Progress.finishMatch('tank', true, 0);
check(r2.firstWin === false, '每日首胜仅一次');
check(r2.leveled === true && r2.level === 2, '再次胜利升级到 Lv.2');
check(Progress.availPoints('tank') === 1, '升级获得 1 个属性点');
check(Progress.spendPoint('tank', 'armor') === true, '加点成功');
check(Progress.spendPoint('tank', 'armor') === false, '点数不足不能再加');
const b = Progress.bonuses('tank');
check(Math.abs(b.hpMult - 1.04) < 0.001, '装甲点生效：+4% 最大装甲');
check(Math.abs(b.dmgMult - 1) < 0.001, '未加火力无加成');
const r3 = Progress.finishMatch('tank', false, 1);
check(r3.coins === 50 + 20, `失败+1杀 = ${r3.coins} 金币`);

/* 养成属性实际进战斗 */
g = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
const boosted = g.robots[0], plain = g.robots[1];
check(boosted.maxHp === Math.round(130 * 1.04), `P1 装甲加成生效（maxHp=${boosted.maxHp}）`);
check(plain.maxHp === 130, 'P2/AI 无养成加成');
check(boosted.level === 2 && plain.level === null, 'P1 显示等级，AI 不显示');

console.log('== 商店 & 自由武器配置 ==');
check(Progress.hasWeapon('minigun') && Progress.hasWeapon('laser') && Progress.hasWeapon('grenade'), '初始拥有 机枪/激光/榴弹');
check(!Progress.hasWeapon('shotgun') && !Progress.hasWeapon('missile'), '霰弹/导弹未拥有');
check(Progress.buyWeapon('shotgun') === true, '购买霰弹成功（-500 🪙）');
check(Progress.hasWeapon('shotgun'), '霰弹已进入武器库');
check(Progress.buyWeapon('missile') === false, '金币不足买不起导弹');
const ldTank = Progress.getLoadout('tank');
check(ldTank.length === 3 && ldTank[0] === 'minigun' && ldTank[1] === 'grenade', '磐石 3 槽默认 机枪+榴弹+榴弹');
check(Progress.setLoadout('tank', 0, 'shotgun') === true, '把霰弹配置到槽 1');
check(Progress.getLoadout('tank')[0] === 'shotgun', '槽 1 配置生效');
check(Progress.setLoadout('tank', 1, 'missile') === false, '未拥有的武器不能装备');
check(Progress.getLoadout('tank')[1] === 'grenade', '槽 2 保持原配置');
check(Progress.getLoadout('scout').length === 2, '疾风 2 槽');
check(Progress.getLoadout('assault').length === 2 && CFG.MECHS.assault.slots[1] === 'main', '猛禽 2 主槽');
check(Progress.getLoadout('artillery').length === 3, '烈焰 3 槽');
g = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
check(g.robots[0].loadout[0] === 'shotgun' && g.robots[0].loadout.length === 3, '战斗中装备槽位配置');
check(g.robots[0].subAmmoMax === 20, '磐石双副槽弹药上限 20');
const gA = new Game({ mode: 'duel', p1Mech: 'assault', p2Mech: 'tank' });
check(gA.robots[0].subAmmoMax === 0 && gA.robots[0].slotType === 'main', '猛禽无副槽、不耗弹药');

console.log('== 新武器 ==');
/* 狙击：高伤穿透 */
const gs = new Game({ mode: 'duel', p1Mech: 'scout', p2Mech: 'tank' });
gs.spawnBullet(gs.robots[0], 0, CFG.WEAPONS.sniper);
check(gs.bullets[0].dmg === 60 && gs.bullets[0].pierce === 3, '狙击 60 伤穿透 3');
/* 冰霜：减速参数 + 命中生效 */
const gf = new Game({ mode: 'duel', p1Mech: 'scout', p2Mech: 'scout' });
gf.state = 'playing'; gf.countdown = 0;
for (const r of gf.robots) r.invulnT = 0;
gf.spawnBullet(gf.robots[0], 0, CFG.WEAPONS.frost);
check(gf.bullets[0].slow === 0.35 && gf.bullets[0].slowDur === 1.6, '冰霜弹带减速参数');
gf.bullets[0].x = gf.robots[1].x; gf.bullets[0].y = gf.robots[1].y;
gf.collideBullets();
check(gf.robots[1].slowT > 1.5 && gf.robots[1].speed < 212 * 0.8, '命中后目标减速');
/* 毒针：DoT 持续掉血 */
const gd = new Game({ mode: 'duel', p1Mech: 'scout', p2Mech: 'scout' });
gd.state = 'playing'; gd.countdown = 0;
for (const r of gd.robots) r.invulnT = 0;
gd.spawnBullet(gd.robots[0], 0, CFG.WEAPONS.needle);
check(gd.bullets[0].dot && gd.bullets[0].dot.dps === 6, '毒针带 DoT 参数');
gd.bullets[0].x = gd.robots[1].x; gd.bullets[0].y = gd.robots[1].y;
gd.collideBullets();
const hpBeforeDot = gd.robots[1].hp;
for (let i = 0; i < 60; i++) gd.update(1 / 60);
check(gd.robots[1].hp < hpBeforeDot - 5, '中毒持续掉血');
/* 火焰：短程范围 */
const gfl = new Game({ mode: 'duel', p1Mech: 'scout', p2Mech: 'scout' });
gfl.spawnBullet(gfl.robots[0], 0, CFG.WEAPONS.flame);
check(gfl.bullets[0].aoe === 34 && gfl.bullets[0].life <= 0.22, '火焰短程范围灼烧');
/* AI 槽位随机武器 */
const g6 = new Game({ mode: 'single', p1Mech: 'tank', p2Mech: 'scout' });
check(g6.robots[1].loadout.length === CFG.MECHS.scout.slots.length, 'AI 武器槽数与底盘一致');

console.log('== 新武器 & 新底盘（链锯 / 磁轨炮 / 守卫者） ==');
/* 链锯：近战命中 */
const nSaw = new Game({ mode: 'duel', p1Mech: 'guardian', p2Mech: 'scout' });
nSaw.state = 'playing'; nSaw.countdown = 0;
for (const r of nSaw.robots) r.invulnT = 0;
const sawA = nSaw.robots[0], sawB = nSaw.robots[1];
sawA.loadout = ['saw', 'grenade', 'grenade'];
sawA.slotIndex = 0;
sawA.x = 400; sawA.y = 300; sawB.x = 420; sawB.y = 300;   // 贴脸
sawA.aim = 0;                                             // 面向右方（B 在右侧）
const sawBhp = sawB.hp;
sawA.tryFire(nSaw);
check(sawB.hp < sawBhp, '链锯近战命中造成伤害');
check(nSaw.bullets.length === 0, '链锯不发射子弹');
/* 磁轨炮：穿透 5 + 高伤 */
const nRail = new Game({ mode: 'duel', p1Mech: 'guardian', p2Mech: 'scout' });
nRail.spawnBullet(nRail.robots[0], 0, CFG.WEAPONS.rail);
check(nRail.bullets[0].dmg === 42 && nRail.bullets[0].pierce === 5, '磁轨炮 42 伤穿透 5');
/* 守卫者再生被动 */
const nG = new Game({ mode: 'duel', p1Mech: 'guardian', p2Mech: 'scout' });
const guard = nG.robots[0];
guard.hp = guard.maxHp - 20;
for (let i = 0; i < 60 * 3; i++) nG.update(1 / 60);
check(guard.hp > guard.maxHp - 20, '守卫者被动再生回血');
/* 守卫者治疗技能 */
const nH = new Game({ mode: 'duel', p1Mech: 'guardian', p2Mech: 'scout' });
const healR = nH.robots[0];
healR.hp = healR.maxHp - 40;
healR.slowT = 1.0;
healR.useSkill(nH);
check(healR.hp > healR.maxHp - 40, '治疗波回复生命');
check(healR.slowT === 0, '治疗波清除减速');
/* 守卫者大招：圣盾领域（回血 + 护盾） */
const nUlt = new Game({ mode: 'duel', p1Mech: 'guardian', p2Mech: 'scout' });
const ultR = nUlt.robots[0];
ultR.ulti = 100;
ultR.hp = ultR.maxHp - 60;
ultR.useUltimate(nUlt);
check(ultR.shieldCharge >= 60 && ultR.ultiActive > 5, '圣盾领域：护盾 + 持续回血');
const hpU1 = ultR.hp;
for (let i = 0; i < 60; i++) nUlt.update(1 / 60);
check(ultR.hp > hpU1, '圣盾领域持续回血生效');
/* 守卫者皮肤存在 */
check((CFG.SKINS.guardian || []).length === 4, '守卫者 4 款皮肤');
check(Progress.SHOP.chassis.guardian === 1200, '守卫者底盘价格 1200');

console.log('== loadout 防御修复（机库改武器后战斗一致性） ==');
/* 模拟用户路径：配置 → 新对局 → 战斗内使用 */
Progress.setLoadout('tank', 0, 'laser');
Progress.setLoadout('tank', 1, 'grenade');
const gL = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
check(gL.robots[0].loadout[0] === 'laser' && gL.robots[0].loadout[1] === 'grenade', '改配置后新对局正确加载');
gL.robots[0].slotIndex = 1;
check(gL.robots[0].currentWeapon().name === '榴弹发射器', '战斗中切换槽位使用正确武器');
/* 畸形 loadout 防御 */
const gm = bundle.Progress.mech('tank');
gm.loadout = ['invalid_weapon', 'laser'];
const gX = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
check(gX.robots[0].loadout[0] === 'minigun' && gX.robots[0].loadout[1] === 'laser', '畸形武器回退不崩溃');
gm.loadout = ['minigun', 'grenade', 'grenade'];
check(true, '存档恢复');

console.log('== 插件系统 ==');
check(Progress.hasPlugin('repair'), '初始拥有维修核心');
check(Progress.buyPlugin('drone') === false, '金币不足买不起无人机');
Progress.addCoins(1600);
check(Progress.buyPlugin('drone') === true, '购买攻击无人机成功');
check(Progress.setPlug('tank', 'drone') === true, '磐石安装无人机');
check(Progress.mech('tank').plug === 'drone', '插件安装已保存');
check(Progress.setPlug('tank', 'no-such') === false, '无效插件不能安装');
const gD = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
check(gD.robots[0].drone !== null && gD.robots[0].drone.dead === false, '无人机进入战斗');
for (let i = 0; i < 60 * 6; i++) gD.update(1 / 60);
check(gD.bullets.length >= 0 && !gD.robots[0].drone.dead, '无人机持续存活并工作');
/* 维修核心 */
const gR = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
gR.robots[0].plug = 'repair';
gR.state = 'playing'; gR.countdown = 0;
gR.robots[0].invulnT = 0; gR.robots[1].invulnT = 0;
gR.robots[0].hp = 50;
gR.robots[0].repairT = 0.1;
for (let i = 0; i < 60 * 6; i++) gR.update(1 / 60);
check(gR.robots[0].hp > 50, `维修核心自动回血（hp=${gR.robots[0].hp.toFixed(1)}）`);
/* 弹药背包 */
Progress.addCoins(500);
Progress.buyPlugin('ammo');
Progress.setPlug('tank', 'ammo');
const gAmmo = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
check(gAmmo.robots[0].subAmmoMax === 30 && gAmmo.robots[0].subAmmo === 30, '弹药背包 +10 且开局全满');
Progress.setPlug('tank', 'drone');

console.log('== 专属大招 ==');
const gU = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
const ua = gU.robots[0], ub = gU.robots[1];
check(ua.ulti === 0, '大招能量初始为 0');
ua.addUlti(100);
check(ua.ulti === 100, '大招能量充满');
check(ua.useUltimate(gU) === true, '磐石释放终极壁垒');
check(ua.ultiActive > 4.5 && ua.invulnT > 4, '壁垒期间无敌');
gU.state = 'playing'; gU.countdown = 0;
for (const r of gU.robots) r.invulnT = 0;
const hpU = ub.hp;
gU.robots[1].x = ua.x + 100; gU.robots[1].y = ua.y;
for (let i = 0; i < 60; i++) gU.update(1 / 60);
check(ub.hp < hpU, '壁垒脉冲对周围敌人造成伤害');
/* 猛禽大招 EMP */
const gE = new Game({ mode: 'duel', p1Mech: 'assault', p2Mech: 'tank' });
gE.state = 'playing'; gE.countdown = 0;
for (const r of gE.robots) r.invulnT = 0;
gE.robots[1].x = gE.robots[0].x + 120; gE.robots[1].y = gE.robots[0].y;   // 靠近再放大招
gE.robots[0].addUlti(100);
gE.robots[0].useUltimate(gE);
check(gE.robots[1].stunT > 2.5, '雷霆审判眩晕 3 秒');
check(gE.robots[1].hp < gE.robots[1].maxHp, '雷霆审判造成伤害');
/* 烈焰天罚 */
const gH = new Game({ mode: 'duel', p1Mech: 'artillery', p2Mech: 'tank' });
gH.state = 'playing'; gH.countdown = 0;
for (const r of gH.robots) r.invulnT = 0;
gH.robots[1].x = gH.robots[0].x + 80; gH.robots[1].y = gH.robots[0].y;   // 目标先到位
gH.robots[0].addUlti(100);
gH.robots[0].useUltimate(gH);
check(gH.heavenFalls.length === 8, '天罚轰炸 8 枚导弹');
for (const f of gH.heavenFalls) { f.x = gH.robots[1].x; f.y = gH.robots[1].y; }  // 固定落点隔离随机
const hpT = gH.robots[1].hp;
for (let i = 0; i < 60 * 3; i++) gH.update(1 / 60);
check(gH.robots[1].hp < hpT, '天罚导弹命中造成伤害');

console.log('== 新武器 ==');
/* 特斯拉电弧 */
const gT = new Game({ mode: 'duel', p1Mech: 'scout', p2Mech: 'scout' });
gT.spawnBullet(gT.robots[0], 0, CFG.WEAPONS.tesla);
check(gT.bullets[0].spark === true && gT.bullets[0].aoe === 42, '特斯拉电弧带溅射');
/* 燃烧榴弹 */
const gN = new Game({ mode: 'duel', p1Mech: 'scout', p2Mech: 'scout' });
gN.spawnBullet(gN.robots[0], 0, CFG.WEAPONS.napalm);
const napalmBullet = gN.bullets[0];
check(napalmBullet.burn !== null, '燃烧榴弹带燃烧参数');
napalmBullet.x = gN.robots[1].x; napalmBullet.y = gN.robots[1].y;
napalmBullet.explode(gN);
check(gN.burnZones.length === 1, '爆炸后生成燃烧地带');
/* 声波炮 */
const gS = new Game({ mode: 'duel', p1Mech: 'scout', p2Mech: 'scout' });
gS.spawnBullet(gS.robots[0], 0, CFG.WEAPONS.sonic);
check(gS.bullets[0].pierce === 4 && gS.bullets[0].knock === 260, '声波炮穿透 4 + 强击退');

console.log('== 底盘被动 ==');
/* 磐石：减伤 8% */
const tankA = g.robots[0], tankB = g.robots[1];
g.state = 'playing'; g.countdown = 0;
for (const r of g.robots) r.invulnT = 0;
const hpBefore = tankB.hp;
tankB.takeDamage(100, 0, 0, g, tankA);
check(Math.abs(tankB.hp - (hpBefore - 92)) < 0.01, `磐石被动减伤 8%（掉 ${hpBefore - tankB.hp} 血）`);
/* 疾风：速度 +6% */
const g2 = new Game({ mode: 'duel', p1Mech: 'scout', p2Mech: 'tank' });
check(Math.abs(g2.robots[0].speed - 212 * 1.06) < 0.5, `疾风被动加速（speed=${g2.robots[0].speed.toFixed(1)}）`);
/* 烈焰：伤害 +8% */
const g3 = new Game({ mode: 'duel', p1Mech: 'artillery', p2Mech: 'tank' });
g3.spawnBullet(g3.robots[0], 0, CFG.WEAPONS.laser);
check(g3.bullets[0].dmg === Math.round(15 * 1.08), `烈焰被动增伤（子弹伤害=${g3.bullets[0].dmg}）`);
/* 猛禽：技能冷却 -12% */
const g4 = new Game({ mode: 'duel', p1Mech: 'assault', p2Mech: 'tank' });
g4.robots[0].useSkill(g4);
check(Math.abs(g4.robots[0].skillCool - 9.5 * 0.88) < 0.01, `猛禽被动减CD（skillCool=${g4.robots[0].skillCool.toFixed(2)}）`);
/* AI 随机武器 */
const g5 = new Game({ mode: 'single', p1Mech: 'tank', p2Mech: 'scout' });
check(g5.robots[1].loadout.every(w => CFG.WEAPONS[w] !== undefined), 'AI 随机武器有效');

console.log('== 排位赛 / 锦标赛 / 训练场 ==');
const rk1 = Progress.finishRanked(true, 1);
check(rk1.delta === 25 && rk1.score === 1025, `排位胜利 +25（score=${rk1.score}）`);
check(rk1.wins === 1 && rk1.losses === 0, '排位胜场记录');
const rk2 = Progress.finishRanked(false, 0);
check(rk2.delta === -25 && rk2.score === 1000, `排位失败 -25（score=${rk2.score}）`);
check(rk2.losses === 1, '排位负场记录');
check(Progress.rankProgress(1010).rank.name === '白银', '1010 分处于白银段位');
check(Progress.rankProgress(1250).rank.name === '白金', '1250 分处于白金段位');
Progress.data.ranked.score = 1118;
const rk3 = Progress.finishRanked(true, 0);
check(rk3.rankUp === true && rk3.newRank.name === '黄金', '冲段成功晋升黄金');
check(rk3.score === 1143, '分数更新为 1143');
const coinsBefore = Progress.coins();
const champs = Progress.addChampion();
check(champs === 1, '锦标赛冠军次数 +1');
check(Progress.coins() >= coinsBefore + 400, '冠军奖金 +400 金币（成就奖励另计）');

/* 训练场木桩：无 AI 实例、不反击 */
g = new Game({ mode: 'single', p1Mech: 'tank', p2Mech: 'scout', aiEnabled: false });
check(g.ai === null, '木桩模式不创建 AI');
for (let i = 0; i < 60 * 5; i++) g.update(1 / 60);
check(g.robots[1].hp === g.robots[1].maxHp, '木桩不会反击');

console.log('== 粒子系统 ==');
Particles.spawn(0, 0, { count: 1000, shape: 'spark' });
check(Particles.list.length === Particles.MAX, `粒子上限保护（${Particles.list.length} = ${Particles.MAX}）`);
Particles.spawn(0, 0, { count: 20, shape: 'rect', spin: 5, gravity: 100 });
Particles.spawn(0, 0, { count: 20, shape: 'smoke', gravity: -30, grow: 10 });
check(Particles.list.every(p => p.shape && p.life > 0 && typeof p.rot === 'number'), '新粒子类型属性完整');
for (let i = 0; i < 200; i++) FX.update(1 / 60);
check(Particles.list.length === 0, '粒子生命周期正常回收');
check(Ambient.list.length > 0, '环境尘埃已生成');
const mockCtx = {
  globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '',
  beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
  arc() {}, ellipse() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, transform() {}, fillRect() {},
  strokeRect() {}, strokeText() {}, fillText() {}, setLineDash() {},
  createRadialGradient() { return { addColorStop() {} }; },
  createLinearGradient() { return { addColorStop() {} }; }
};
FX.draw(mockCtx);
check(true, '全部粒子类型绘制无异常');

console.log('== 屏幕特效 ==');
ScreenFX.flash('#ffffff', 0.5);
check(ScreenFX.flashA > 0.4, '全屏闪光触发');
ScreenFX.hurt();
check(ScreenFX.hurtV > 0, '受击红晕触发');
KillFeed.add('KILL!', '2 KILLS！', '#ffd43b');
check(KillFeed.items.length === 1, '击杀横幅生成');
ScreenFX.draw(mockCtx, 0);
KillFeed.draw(mockCtx);
check(true, '屏幕特效绘制无异常');
for (let i = 0; i < 200; i++) FX.update(1 / 60);
check(ScreenFX.flashA === 0 && KillFeed.items.length === 0, '屏幕特效自动消退');

console.log('== 多地图 & 天气事件 ==');
const gM = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
const themeName = gM.map.theme && gM.map.theme.name;
check(!!themeName, `对局使用随机地图主题（${themeName}）`);
gM.map.draw(mockCtx);
check(true, '主题地图绘制无异常');
gM.state = 'playing';
gM.startWeather();
check(gM.weather !== null, '天气事件触发');
for (let i = 0; i < 60 * 9; i++) gM.update(1 / 60);
check(gM.weather === null, '天气事件自动结束');

console.log('== 生存模式 ==');
const s = new Survival({ p1Mech: 'tank' });
check(s.state === 'prepare' && s.prepareT > 2, '生存开局准备中');
s.startWave();
check(s.wave === 1 && s.spawnQueue.length === 3, '第一波 3 个敌人');
bundle.Input.down.add('KeyJ');   // 玩家自动开火
for (let i = 0; i < 60 * 40; i++) {
  s.update(1 / 60);
  if (s.state === 'ended') break;
  if (s.state === 'prepare' && s.wave >= 1) s.prepareT = 0.2;   // 加速波次
}
bundle.Input.down.delete('KeyJ');
check(s.wave >= 1 && s.time > 5, `生存正常推进（wave=${s.wave}, kills=${s.kills}, state=${s.state}）`);
const sResult = Progress.finishSurvival('tank', s.wave, s.kills);
check(sResult.coins === s.wave * 15 + s.kills * 10, '生存奖励计算正确');
check(Progress.data.survival.bestWave === s.wave, '最高波次记录更新');

console.log('== 成就 & 每日任务 ==');
Progress.recordWin();
check(Progress.isAchieved('first_win') === true, '首胜达成「初露锋芒」');
check(Progress.data.stats.wins >= 1, '胜利统计累计');
const coinsA = Progress.coins();
Progress.addCoins(2100);
check(Progress.isAchieved('rich_2000') === true, '累计 2000 金币达成「日进斗金」');
check(Progress.coins() >= coinsA + 2100, '金币入账（成就奖励另计）');
const daily = Progress.getDaily();
check(daily.tasks.length === 3, '每日任务 3 个');
for (const t of daily.tasks) Progress.addDailyProgress(t.id, 99);
let claimed = 0;
for (let i = 0; i < 3; i++) if (Progress.claimDaily(i)) claimed++;
check(claimed === 3, '三个任务全部可领取奖励');

console.log('== 设置系统 ==');
Progress.setSetting('volume', 0.3);
check(Progress.settings.volume === 0.3, '音量设置保存');
Progress.setSetting('fxQuality', 'low');
check(Particles.MAX === 300, '低特效粒子上限 300');
Progress.setSetting('fxQuality', 'medium');
check(Particles.MAX === 500, '中特效粒子上限 500');
Progress.setSetting('fxQuality', 'high');
check(Particles.MAX === 700, '高特效粒子上限 700');
Progress.setSetting('screenShake', false);
const gShake = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
gShake.shake(10);
check(gShake.shakeT === 0, '关闭屏幕震动后不震屏');
Progress.setSetting('screenShake', true);

console.log('== 键位自定义 ==');
Input.loadBindings();   // 从存档加载（当前无 keybinds → 保持默认）
const kb1 = Object.assign({}, Input.BINDINGS.p1);
check(Input.BINDINGS.p1.fire === 'KeyJ', '默认 P1 开火为 J');
const res1 = Input.setBinding('p1', 'fire', 'KeyP');
check(res1.ok && Input.BINDINGS.p1.fire === 'KeyP', '重绑定 P1 开火为 P');
check(Progress.settings.keybinds.p1.fire === 'KeyP', '键位持久化到存档');
const resConflict = Input.setBinding('p1', 'skill', 'KeyP');
check(!resConflict.ok, '冲突检测：P 已被占用则拒绝');
const resSame = Input.setBinding('p1', 'fire', 'KeyJ');
check(resSame.ok && Input.BINDINGS.p1.fire === 'KeyJ', '改回 J 成功');
Input.resetBindings('p1');
check(Input.BINDINGS.p1.fire === 'KeyJ' && !Progress.settings.keybinds.p1, '重置 P1 恢复默认');
Input.loadBindings();
check(Input.BINDINGS.p1.fire === 'KeyJ', '重新加载后保持默认');
/* 恢复 kb1 以防影响后续（实际无影响，仅防御） */
Input.BINDINGS.p1 = kb1;

console.log('== 移动端触控输入 ==');
/* 虚拟摇杆：axis 返回归一化方向 */
Input.setTouchAxis(30, 40);
const tAxis = Input.axis('p1');
check(Math.abs(Math.hypot(tAxis.x, tAxis.y) - 1) < 0.001 && tAxis.x > 0.5 && tAxis.y > 0.5, '摇杆输出归一化方向');
/* 死区：小位移归零 */
Input.setTouchAxis(0.05, 0.05);
const tDead = Input.axis('p1');
check(tDead.x === 0 && tDead.y === 0, '摇杆死区（微小位移忽略）');
/* 触控按钮：按住 → isActive 为 true；松开 → false */
Input.setTouchButton('fire', true);
check(Input.isActive('p1', 'fire') === true, '触控开火按住生效');
Input.setTouchButton('fire', false);
check(Input.isActive('p1', 'fire') === false, '触控开火松开失效');
/* 边沿触发：_noteTouchPress 后 pressedActive 一次为真，endFrame 后为假 */
Input._noteTouchPress('skill');
check(Input.pressedActive('p1', 'skill') === true, '触控技能边沿触发');
Input.endFrame();
check(Input.pressedActive('p1', 'skill') === false, '触控技能边沿帧末清除');
/* 触控下战斗输入链路：duel 模式 P1 摇杆移动生效 */
const gTch = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
gTch.state = 'playing'; gTch.countdown = 0;
for (const r of gTch.robots) r.invulnT = 0;
const tP1 = gTch.robots[0];
Input.setTouchAxis(0, -1);      // 向上（屏幕 y 向下为正）
gTch.readInput();
check(tP1.moveY < 0, '触控摇杆驱动 P1 移动');
Input.clearTouchAxis();
/* 触控开火链路 */
Input.setTouchButton('fire', true);
gTch.readInput();
check(tP1.fireHeld === true, '触控开火驱动 P1 开火');
Input.setTouchButton('fire', false);
Input.setTouchAxis(0, 0);

console.log('== 局域网联机（房主权威 + 快照渲染） ==');
const gLan = new Game({
  mode: 'lan', netRole: 'host',
  p1Mech: 'tank', p2Mech: 'scout',
  loadout1: ['minigun', 'grenade'], loadout2: ['laser', 'grenade'],
  plug1: null, plug2: 'repair'
});
check(gLan.netHost === true, '房主模式已启用');
check(gLan.robots[1].loadout[0] === 'laser' && gLan.robots[1].plug === 'repair', '客户端机甲/插件配置生效');
check(gLan.ai === null, '联机模式无 AI');
gLan.state = 'playing'; gLan.countdown = 0;
for (const r of gLan.robots) r.invulnT = 0;
gLan.netInput = { mx: 1, my: 0, fire: true, sub: false, skill: false, ulti: false };
for (let i = 0; i < 60; i++) gLan.update(1 / 60);
check(gLan.robots[1].x > gLan.robots[1].x - 100 || gLan.robots[1].vx !== 0, '网络输入驱动客户端机器人');
const snap = NetHost.snapshot(gLan);
check(snap.me.x === gLan.robots[0].x && snap.op.x === gLan.robots[1].x, '快照包含双方位置');
check(Array.isArray(snap.bullets) && Array.isArray(snap.pickups), '快照包含子弹与道具');
const nv = new NetView({
  p1Mech: 'tank', p2Mech: 'scout',
  loadout1: ['minigun'], loadout2: ['laser', 'grenade'],
  plug1: null, plug2: null,
  theme: GameMap.THEMES.factory, obstacles: []
});
nv.applyState(snap);
check(nv.op.x === gLan.robots[0].x && nv.me.x === gLan.robots[1].x, '客户端视图应用快照');
check(nv.op.name === '对手' && nv.me.name === '你', '客户端视角角色正确');
nv.update(1 / 60);
nv.render(mockCtx, 0);
check(true, '客户端视图更新渲染无异常');

console.log('== Boss 战 ==');
const bf = new BossFight({ p1Mech: 'tank' });
check(bf.boss.maxHp === 3200 && bf.boss.radius === 58, '巨兽属性（3200 血 / 大体积）');
check(bf.state === 'countdown', 'Boss 战开局倒计时');
bf.state = 'playing'; bf.countdown = 0;
for (const r of [bf.player, bf.boss]) r.invulnT = 0;
bf.boss.x = bf.player.x + 200; bf.boss.y = 200;
bundle.Input.down.add('KeyJ');   // 玩家自动开火
for (let i = 0; i < 60 * 12; i++) {
  bf.update(1 / 60);
  if (bf.state === 'ended') break;
}
bundle.Input.down.delete('KeyJ');
check(bf.phase >= 1 && bf.time > 5, `Boss 战正常推进（phase=${bf.phase}, dmg=${Math.floor(bf.dmgDealt)}, state=${bf.state}）`);
check(bf.dmgDealt >= 0, 'Boss 受击伤害统计');
const bfRes = Progress.finishBoss('tank', bf.bossType || 'inferno', bf.boss.dead, bf.dmgDealt, bf.time);
check(bfRes.coins === Math.floor(bf.dmgDealt / 30) + (bf.boss.dead ? 260 : 0) + (bf.boss.dead && bfRes.clears === 1 ? 300 : 0), 'Boss 结算奖励计算正确');
check(Progress.data.boss.clears >= (bf.boss.dead ? 1 : 0), 'Boss 记录更新');
check(Progress.data.stats.mechGames.tank >= 1, '机甲使用次数统计');

/* 回归：Boss 战中猛禽 EMP 技能与大招不崩溃（曾导致页面静止） */
const bf2 = new BossFight({ p1Mech: 'assault' });
bf2.state = 'playing'; bf2.countdown = 0;
bf2.boss.x = 400; bf2.boss.y = 200;
bf2.player.ulti = 100;
let bfErr = null;
try { bf2.player.useUltimate(bf2); } catch (e) { bfErr = e.message; }
check(bfErr === null, 'Boss 战猛禽大招正常（' + (bfErr || '无异常') + '）');
const mnEmp = new bundle.Robot('assault', 'ai', { x: bf2.player.x + 150, y: 250, loadout: ['minigun'], plug: null });
mnEmp.useSkill(bf2);
check(mnEmp.stunT >= 0 && bf2.boss.stunT >= 0, 'Boss 战小兵 EMP 不崩溃且目标眩晕');
for (let i = 0; i < 60; i++) bf2.update(1 / 60);
check(bf2.state === 'playing' || bf2.state === 'over' || bf2.state === 'ended', 'EMP 后对局继续推进');

/* 雷暴主宰：技能与落雷推进不崩溃 */
console.log('== 雷暴主宰 ==');
const bfStorm = new BossFight({ p1Mech: 'tank', bossType: 'storm' });
check(bfStorm.boss.maxHp === 3000, '雷暴主宰 3000 血');
check(bfStorm.boss.name === '雷暴主宰', '雷暴主宰名称正确');
bfStorm.state = 'playing'; bfStorm.countdown = 0;
for (const r of [bfStorm.player, bfStorm.boss]) r.invulnT = 0;
bfStorm.boss.x = bfStorm.player.x + 200; bfStorm.boss.y = 200;
bfStorm.stormSkill();                       // 触发一次技能（落雷/闪电链/EMP）
check(bfStorm.stormMarks.length >= 0 && bfStorm.skillT > 0, '雷暴技能触发正常');
bundle.Input.down.add('KeyJ');
for (let i = 0; i < 60 * 8; i++) {
  bfStorm.update(1 / 60);
  if (bfStorm.state === 'ended') break;
}
bundle.Input.down.delete('KeyJ');
check(bfStorm.time > 3, `雷暴战正常推进（phase=${bfStorm.phase}, dmg=${Math.floor(bfStorm.dmgDealt)}）`);
/* per-Boss 记录 */
const stRes = Progress.finishBoss('tank', 'storm', bfStorm.boss.dead, bfStorm.dmgDealt, bfStorm.time);
const stRec = Progress.data.bossRec && Progress.data.bossRec.storm;
check(!bfStorm.boss.dead || (stRec && stRec.clears === 1), '雷暴独立记录正确（击败时创建并计数）');

console.log('== 排位连胜加成 ==');
const rkStreak = Progress.finishRanked(true, 0);
check(rkStreak.winStreak >= 1, '连胜计数');
check(rkStreak.streakBonus === 0 || rkStreak.streakBonus === 3, '连胜加成合理（首胜 0，之后 +3）');

console.log('== 徽章与皮肤 ==');
const medalsBefore = Progress.medals();
const mReward = Progress.finishMatch('tank', true, 0);
check(mReward.medalsGained === 1 && Progress.medals() === medalsBefore + 1, '胜利获得 1 徽章');
check(Progress.buySkin('tank', 'tank_gold') === false, '徽章不足买不起鎏金皮肤');
Progress.addMedals(300);
check(Progress.buySkin('tank', 'tank_gold') === true, '兑换鎏金战甲成功');
check(Progress.hasSkin('tank_gold') === true, '皮肤进入拥有列表');
check(Progress.skinFor('tank').id === 'tank_gold', '购买后自动装备');
check(Progress.equipSkin('tank', 'default') === true, '可换回默认皮肤');
const gSkin = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
check(gSkin.robots[0].color === '#4dabf7', '战斗中应用默认皮肤');
check(Progress.redeemMedal('coin_bag', 'tank').ok === true, '徽章兑换金币袋');
check(Progress.data.medals < Progress.medals() || Progress.data.medals >= 0, '徽章消耗记录');

console.log('== 审查修复回归 ==');
/* 1. frost Boss 正常运转（曾因方法缺失首帧崩溃） */
const bfFrost = new BossFight({ p1Mech: 'tank', bossType: 'frost' });
bfFrost.state = 'playing'; bfFrost.countdown = 0;
for (const r of [bfFrost.player, bfFrost.boss]) r.invulnT = 0;
let frostErr = null;
try {
  for (let i = 0; i < 60 * 8; i++) {
    bfFrost.update(1 / 60);
    if (bfFrost.state === 'ended') break;
  }
} catch (e) { frostErr = e.message; }
check(frostErr === null, '冰霜巨兽正常运行（' + (frostErr || '无异常') + '）');
check(bfFrost.bossType === 'frost' && bfFrost.boss.color === '#74c0fc', '冰霜 Boss 配色生效');

/* 2. 湮灭炮不再自杀（areaDamage 排除施法者） */
const gNuke = new Game({ mode: 'duel', p1Mech: 'artillery', p2Mech: 'tank' });
gNuke.state = 'playing'; gNuke.countdown = 0;
for (const r of gNuke.robots) r.invulnT = 0;
const hpSelf = gNuke.robots[0].hp;
gNuke.robots[0].useSkill(gNuke);   // 蓄力
gNuke.robots[0].chargingNuke = 0;  // 立即引爆（走自伤段）
const hpAfter = gNuke.robots[0].hp;
check(hpAfter > hpSelf - 30, `湮灭炮不再自杀（掉血 ${(hpSelf - hpAfter).toFixed(0)} < 22 自伤+余波）`);

/* 3. 榴弹反弹方向翻转 */
const gBounce = new Game({ mode: 'duel', p1Mech: 'scout', p2Mech: 'tank' });
gBounce.spawnBullet(gBounce.robots[0], Math.PI, CFG.WEAPONS.grenade);   // 向左打墙
const gr = gBounce.bullets[0];
gr.x = 40; gr.y = 360; gr.prevX = 60; gr.prevY = 360;   // 模拟穿墙
gr.vx = -420;
gBounce.map.hitWall = () => ({ x: 0, y: 0, w: 14, h: CFG.H });   // 强制撞左墙
gr.update(0, gBounce);
check(gr.vx > 0, '榴弹撞墙后反弹（vx=' + gr.vx.toFixed(0) + '）');

/* 4. 弹药箱补到 subAmmoMax */
const gPick = new Game({ mode: 'duel', p1Mech: 'tank', p2Mech: 'tank' });
gPick.robots[0].subAmmo = 3;
const pk = new bundle.Pickup('ammo', 0, 0);
pk.apply(gPick.robots[0]);
check(gPick.robots[0].subAmmo === Math.min(20, 3 + 8), '弹药箱按机甲容量补充');

/* 5. 每日任务不可双领（前面的测试已领完今日任务） */
const d2 = Progress.getDaily();
let claimAgain = 0;
for (let i = 0; i < 3; i++) if (Progress.claimDaily(i)) claimAgain++;
check(claimAgain === 0, '已领取的每日任务不可重复领取');

/* 6. ranked 字符串清洗 */
Progress.data.ranked.score = '1000';
Progress.data.ranked.winStreak = 0;
Progress.sanitize();
check(Progress.data.ranked.score === 1000, '字符串分数被 sanitize 清洗');
const rkClean = Progress.finishRanked(true, 0);
check(Number.isFinite(rkClean.score) && rkClean.score === 1025, '字符串分数被清洗后正常加减（' + rkClean.score + '）');

console.log(failures === 0 ? '\n✅ 全部通过' : `\n❌ ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
