/* ===================================================================
 * data.js — 全局配置数据（武器、护甲、物品、地图、敌人）
 * 全部为原创虚构内容
 * =================================================================== */
var DATA = (function(){
  'use strict';

  // ---------- 物品稀有度 ----------
  var RARITY = {
    1:{name:'常见',color:'#9aa096'},
    2:{name:'稀有',color:'#5f88b8'},
    3:{name:'史诗',color:'#9b6fc0'},
    4:{name:'珍藏',color:'#c8a24a'}
  };

  // ---------- 部位系数 ----------
  var BODY = {
    head:{mult:4.0,label:'头部'},
    chest:{mult:1.0,label:'胸部'},
    arm:{mult:0.7,label:'手臂'},
    leg:{mult:0.75,label:'腿部'}
  };

  // ---------- 护甲等级（穿透阈值）----------
  var ARMOR = {
    0:{name:'无护甲', protect:0},
    1:{name:'轻型護甲', protect:0.25, pen:[0,0.15]},
    2:{name:'中型護甲', protect:0.45, pen:[0,0.25,0.4]},
    3:{name:'重型護甲', protect:0.62, pen:[0,0.2,0.35,0.5]},
    4:{name:'精英護甲', protect:0.75, pen:[0,0.18,0.3,0.45,0.6]}
  };

  // ---------- 弹药类型 ----------
  var AMMO = {
    normal:{name:'普通弹',dmg:1,pen:0.15,cost:1},
    ap:{name:'穿甲弹',dmg:0.85,pen:0.55,cost:2},
    sub:{name:'亚音速弹',dmg:0.95,pen:0.1,cost:1,quiet:true}
  };

  // ---------- 武器 ----------
  // dmg:基础伤害, rpm:射速, mag:弹匣, res:备弹基数, spread:散布(弧度),
  // recoil:后坐, range:有效射程, pellets:弹丸数, auto:全自动
  var WEAPONS = {
    w_pistol:{id:'w_pistol',name:'P-9 手枪',type:'pistol',dmg:24,rpm:320,mag:15,res:60,spread:0.018,recoil:0.012,range:60,pellets:1,auto:false,rarity:1,slot:1},
    w_smg:{id:'w_smg',name:'蜂鸟 冲锋枪',type:'smg',dmg:17,rpm:800,mag:30,res:120,spread:0.032,recoil:0.010,range:45,pellets:1,auto:true,rarity:2,slot:1},
    w_rifle:{id:'w_rifle',name:'W-56 突击步枪',type:'rifle',dmg:32,rpm:600,mag:30,res:120,spread:0.012,recoil:0.020,range:110,pellets:1,auto:true,rarity:3,slot:1},
    w_dmr:{id:'w_dmr',name:'游隼 精确射手步枪',type:'dmr',dmg:58,rpm:180,mag:10,res:40,spread:0.006,recoil:0.035,range:180,pellets:1,auto:false,rarity:4,slot:1},
    w_shotgun:{id:'w_shotgun',name:'破门者 霰弹枪',type:'shotgun',dmg:12,rpm:75,mag:6,res:24,spread:0.10,recoil:0.055,range:22,pellets:8,auto:false,rarity:2,slot:1},
    w_sniper:{id:'w_sniper',name:'长夜 狙击步枪',type:'sniper',dmg:110,rpm:45,mag:5,res:20,spread:0.002,recoil:0.06,range:260,pellets:1,auto:false,rarity:4,slot:1}
  };

  // ---------- 配件（改装）----------
  var ATTACHMENTS = {
    a_muzzle:{id:'a_muzzle',name:'消焰器',type:'muzzle',rarity:2,mods:{spread:-0.15,recoil:-0.1}},
    a_supp:{id:'a_supp',name:'消音器',type:'muzzle',rarity:4,mods:{spread:-0.05,recoil:0,quiet:true}},
    a_grip:{id:'a_grip',name:'垂直握把',type:'grip',rarity:2,mods:{recoil:-0.25}},
    a_stock:{id:'a_stock',name:'战术枪托',type:'stock',rarity:3,mods:{recoil:-0.2,spread:-0.1}},
    a_scope2:{id:'a_scope2',name:'2倍镜',type:'optic',rarity:2,mods:{zoom:2}},
    a_scope4:{id:'a_scope4',name:'4倍镜',type:'optic',rarity:4,mods:{zoom:4}}
  };

  // ---------- 医疗/消耗品 ----------
  var MEDS = {
    m_bandage:{id:'m_bandage',name:'止血绷带',rarity:1,use:'bleed',time:2,weight:0.2,cost:20,desc:'停止出血'},
    m_painkill:{id:'m_painkill',name:'止痛药',rarity:2,use:'pain',time:1.5,weight:0.1,cost:40,desc:'缓解疼痛'},
    m_splint:{id:'m_splint',name:'夹板',rarity:1,use:'fracture',time:3,weight:0.4,cost:30,desc:'固定骨折'},
    m_medkit:{id:'m_medkit',name:'急救包',rarity:3,use:'heal',time:4,weight:1.0,cost:120,desc:'恢复大量生命',heal:60},
    m_surgery:{id:'m_surgery',name:'战地手术包',rarity:4,use:'surgery',time:6,weight:1.6,cost:300,desc:'恢复所有部位至健康',heal:100}
  };

  // ---------- 护甲物品 ----------
  var ARMOR_ITEMS = {
    g_vest1:{id:'g_vest1',name:'轻型防弹衣',rarity:1,armor:1,weight:2.5,cost:150},
    g_vest2:{id:'g_vest2',name:'中型防弹衣',rarity:2,armor:2,weight:3.8,cost:400},
    g_vest3:{id:'g_vest3',name:'重型防弹衣',rarity:3,armor:3,weight:5.5,cost:900},
    g_helmet1:{id:'g_helmet1',name:'轻型头盔',rarity:1,armor:1,weight:1.0,cost:120},
    g_helmet2:{id:'g_helmet2',name:'战术头盔',rarity:3,armor:3,weight:1.8,cost:700}
  };

  // ---------- 贵重物（变卖）----------
  var VALUABLES = {
    v_watch:{id:'v_watch',name:'旧式腕表',rarity:2,weight:0.1,cost:180},
    v_chip:{id:'v_chip',name:'加密存储芯片',rarity:4,weight:0.1,cost:1200},
    v_cert:{id:'v_cert',name:'学院证书',rarity:1,weight:0.1,cost:60},
    v_coin:{id:'v_coin',name:'纪念币',rarity:3,weight:0.1,cost:450},
    v_gold:{id:'v_gold',name:'金质徽章',rarity:4,weight:0.2,cost:2000}
  };

  // ---------- 弹药箱 ----------
  var AMMO_BOX = {
    box_normal:{id:'box_normal',name:'普通弹药盒',rarity:1,weight:0.6,cost:60,ammo:'normal',count:60},
    box_ap:{id:'box_ap',name:'穿甲弹药盒',rarity:3,weight:0.6,cost:220,ammo:'ap',count:40},
    box_sub:{id:'box_sub',name:'亚音速弹药盒',rarity:2,weight:0.6,cost:100,ammo:'sub',count:60}
  };

  // 汇聚所有可拾取物品定义
  var ITEMS = {};
  function merge(src,category){ for(var k in src){ var o=Object.assign({},src[k]); o.category=category; ITEMS[k]=o; } }
  merge(WEAPONS,'weapon');merge(ATTACHMENTS,'attachment');merge(MEDS,'med');
  merge(ARMOR_ITEMS,'armor');merge(VALUABLES,'valuable');merge(AMMO_BOX,'ammo');

  // ---------- 地图区域（虚构「云杉学院」）----------
  // 坐标系：X 东西, Z 南北, 单位≈米。地图约 220x220
  var MAP = {
    size:220,
    spawn:{x:-88,z:88},
    zones:[
      {id:'teach',name:'教学楼群',x:-40,z:-30,w:56,d:44,type:'indoor',loot:3,enemies:2},
      {id:'admin',name:'行政中心',x:20,z:-60,w:34,d:30,type:'indoor',loot:4,enemies:2},
      {id:'library',name:'图书馆',x:55,z:-10,w:40,d:34,type:'indoor',loot:3,enemies:1},
      {id:'gym',name:'体育馆',x:70,z:55,w:44,d:38,type:'semi',loot:2,enemies:1},
      {id:'dorm',name:'宿舍区',x:-55,z:45,w:44,d:36,type:'indoor',loot:3,enemies:2},
      {id:'lab',name:'实验楼',x:5,z:20,w:30,d:26,type:'indoor',loot:4,enemies:2},
      {id:'court',name:'中央广场',x:0,z:-5,w:36,d:36,type:'open',loot:1,enemies:1}
    ],
    extracts:[
      {id:'gate_e',name:'东侧校门',x:98,z:0,condition:'time',openAt:30,label:'定时开放 · 30秒后'},
      {id:'gate_w',name:'西侧检修门',x:-98,z:-10,condition:'lever',label:'需激活配电箱'},
      {id:'roof',name:'体育馆屋顶',x:70,z:55,condition:'signal',label:'需发射信号弹',y:14}
    ],
    levers:[
      {id:'lever_w',x:-70,z:-30,label:'西侧配电箱'}
    ]
  };

  // ---------- 敌人类型 ----------
  var ENEMY_TYPES = {
    militant:{id:'militant',name:'武装分子',color:0x4a5a44,hp:80,armor:1,dmg:5,range:50,accuracy:0.42,
      speed:3.2,sight:42,hear:32,aggro:0.8,lootTier:2},
    raider:{id:'raider',name:'失控学员',color:0x6b5a3a,hp:65,armor:1,dmg:6,range:30,accuracy:0.32,
      speed:3.8,sight:34,hear:38,aggro:1.0,lootTier:1},
    elite:{id:'elite',name:'精英守卫',color:0x3a4a52,hp:130,armor:2,dmg:8,range:65,accuracy:0.55,
      speed:2.8,sight:58,hear:30,aggro:0.7,lootTier:4}
  };

  // ---------- 任务线 ----------
  var QUESTS = [
    {id:'q1',name:'初次突围',desc:'成功撤离一次',type:'extract',target:1,reward:300},
    {id:'q2',name:'搜刮者',desc:'累计带出 10 件物品',type:'loot',target:10,reward:500},
    {id:'q3',name:'清剿行动',desc:'累计击倒 15 名敌人',type:'kill',target:15,reward:800},
    {id:'q4',name:'精英猎手',desc:'击倒 3 名精英守卫',type:'elite',target:3,reward:1500}
  ];

  // ---------- 技能（元进度）----------
  var SKILLS = {
    s_health:{id:'s_health',name:'强健体魄',desc:'每级 +15 最大生命',max:5,cost:200},
    s_dmg:{id:'s_dmg',name:'武器精通',desc:'每级 +4% 伤害',max:5,cost:250},
    s_speed:{id:'s_speed',name:'轻装疾行',desc:'每级 +5% 移速',max:5,cost:200},
    s_stam:{id:'s_stam',name:'耐力训练',desc:'每级 +10% 体力',max:5,cost:150},
    s_scav:{id:'s_scav',name:'搜刮专家',desc:'每级 +8% 搜刮速度',max:5,cost:180}
  };

  // ---------- 帮助文本 ----------
  var HELP = [
    ['移动','W A S D'],['冲刺','Shift'],['蹲伏','C'],['趴下','Z / Ctrl'],['跳跃/翻越','空格'],
    ['射击','鼠标左键'],['瞄准(ADS)','鼠标右键'],['装弹/拉栓','R'],['切换弹种','B'],['切换武器','1 / 2 / 3'],
    ['狙击镜屏息','瞄准时按住 Shift'],
    ['切换视角','V'],['互动/搜刮','F (长按)'],['背包','Tab'],['地图','M'],['暂停','Esc'],
    ['触控移动','左侧摇杆'],['触控视角','右侧滑动'],['触控射击','射击按钮']
  ];

  // ---------- 出生点推荐配置 ----------
  var STARTER = {
    weapon:'w_pistol',ammo:{normal:45},meds:{m_bandage:2,m_medkit:1},
    armor:{body:'g_vest1',helmet:null},cash:600
  };

  return {
    RARITY:RARITY,BODY:BODY,ARMOR:ARMOR,AMMO:AMMO,WEAPONS:WEAPONS,ATTACHMENTS:ATTACHMENTS,
    MEDS:MEDS,ARMOR_ITEMS:ARMOR_ITEMS,VALUABLES:VALUABLES,AMMO_BOX:AMMO_BOX,ITEMS:ITEMS,
    MAP:MAP,ENEMY_TYPES:ENEMY_TYPES,QUESTS:QUESTS,SKILLS:SKILLS,HELP:HELP,STARTER:STARTER
  };
})();
