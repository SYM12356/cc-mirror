/* ===================================================================
 * systems.js — 背包、搜刮、撤离、任务、进度、UI 面板渲染
 * =================================================================== */

/* ---------------- 局内背包 ---------------- */
function makeInventory(cfg){
  var inv={
    items:[],   // {id,qty}
    meds:{},
    armor:null, helmet:null,
    weight:0, maxWeight:30
  };
  // 从配置带入医疗
  if(cfg.meds)for(var k in cfg.meds)inv.meds[k]=cfg.meds[k];
  // 弹药作为特殊物品（由 takeFromStash 按弹匣数注入）
  inv.ammo={normal:0,ap:0,sub:0};
  return inv;
}

var Inv = (function(){
  function itemWeight(id,qty){
    var def=DATA.ITEMS[id];if(!def)return 0;
    return (def.weight||0.5)*(qty||1);
  }
  function calcWeight(inv){
    var w=0;
    inv.items.forEach(function(it){w+=itemWeight(it.id,it.qty);});
    for(var k in inv.meds)w+=itemWeight(k,inv.meds[k]);
    if(inv.armor)w+=itemWeight(inv.armor,1);
    if(inv.helmet)w+=itemWeight(inv.helmet,1);
    for(var a in inv.ammo)w+=inv.ammo[a]*0.01;
    inv.weight=w;return w;
  }
  function add(inv,id,qty){
    qty=qty||1;
    if(calcWeight(inv)+itemWeight(id,qty)>inv.maxWeight){Toast.show('背包超载','bad');return false;}
    var f=inv.items.find(function(x){return x.id===id;});
    if(f&&DATA.ITEMS[id].category!=='weapon'&&DATA.ITEMS[id].category!=='armor')f.qty+=qty;
    else inv.items.push({id:id,qty:qty});
    calcWeight(inv);return true;
  }
  function addAmmo(inv,type,count){inv.ammo[type]=(inv.ammo[type]||0)+count;calcWeight(inv);}
  function remove(inv,id,qty){
    qty=qty||1;var f=inv.items.find(function(x){return x.id===id;});
    if(!f)return false;f.qty-=qty;if(f.qty<=0)inv.items=inv.items.filter(function(x){return x!==f;});
    calcWeight(inv);return true;
  }
  // 从库存中取出带入
  function takeFromStash(inv,stash){
    // 武器
    var w=stash.weapon;
    if(w&&DATA.WEAPONS[w]){
      var wDef=DATA.WEAPONS[w];
      inv.items.push({id:w,qty:1});
      // 备弹从弹药类型换算
      var box=stash.ammoBox||'box_normal';
      var bDef=DATA.AMMO_BOX[box];
      inv.ammo[bDef.ammo]+=bDef.count*(stash.mags||2);
      Save.removeItem(w,1);Save.removeItem(box,Math.min(Save.itemQty(box),stash.mags||2));
    }
    // 医疗
    for(var m in stash.meds){
      var n=Math.min(stash.meds[m],Save.itemQty(m));
      if(n>0){inv.meds[m]=n;Save.removeItem(m,n);}
    }
    // 护甲
    if(stash.armor&&Save.removeItem(stash.armor,1))inv.armor=stash.armor;
    if(stash.helmet&&Save.removeItem(stash.helmet,1))inv.helmet=stash.helmet;
    calcWeight(inv);
  }
  // 带回并存入库存
  function bankToStash(inv){
    inv.items.forEach(function(it){Save.addItem(it.id,it.qty);});
    for(var m in inv.meds){if(inv.meds[m]>0)Save.addItem(m,inv.meds[m]);}
    if(inv.armor)Save.addItem(inv.armor,1);
    if(inv.helmet)Save.addItem(inv.helmet,1);
    // 剩余弹药折算成弹药盒
    for(var a in inv.ammo){
      if(inv.ammo[a]<=0)continue;
      var boxId='box_'+a;
      if(DATA.AMMO_BOX[boxId]){
        var per=DATA.AMMO_BOX[boxId].count;
        var boxes=Math.floor(inv.ammo[a]/per);
        if(boxes>0)Save.addItem(boxId,boxes);
      }
    }
    Save.save();
  }
  return {calcWeight:calcWeight,itemWeight:itemWeight,add:add,addAmmo:addAmmo,remove:remove,
    takeFromStash:takeFromStash,bankToStash:bankToStash};
})();

/* ---------------- 搜刮物资生成 ---------------- */
var LootGen = (function(){
  function roll(tier){
    var pools={1:[],2:[],3:[],4:[]};
    for(var id in DATA.ITEMS){
      var def=DATA.ITEMS[id];
      pools[def.rarity].push(id);
    }
    // tier 决定权重：高 tier 更可能出高稀有度
    var r=Math.random();
    var rarity;
    if(tier>=4){rarity=r<0.15?1:r<0.4?2:r<0.75?3:4;}
    else if(tier===3){rarity=r<0.3?1:r<0.65?2:r<0.92?3:4;}
    else if(tier===2){rarity=r<0.5?1:r<0.85?2:r<0.98?3:4;}
    else {rarity=r<0.75?1:r<0.97?2:3;}
    var pool=pools[rarity].length?pools[rarity]:pools[1];
    return U.pick(pool);
  }
  function generate(tier,count){
    var out=[];
    var n=count||U.randInt(2,4);
    for(var i=0;i<n;i++){
      var id=roll(tier);
      out.push({id:id,qty:U.randInt(1,DATA.ITEMS[id].category==='weapon'?1:3)});
    }
    // 必定有弹药
    if(U.chance(0.7)){
      var types=['normal','normal','ap','sub'];
      out.push({id:'box_'+U.pick(types),qty:1});
    }
    return out;
  }
  function fromEnemy(e){
    var tier=e.typeDef.lootTier;
    var out=[];
    var n=U.randInt(1,tier);
    for(var i=0;i<n;i++){var id=roll(tier);out.push({id:id,qty:1});}
    // 敌人掉弹
    out.push({id:'box_normal',qty:1});
    return out;
  }
  return {roll:roll,generate:generate,fromEnemy:fromEnemy};
})();

/* ---------------- 撤离系统 ---------------- */
var Extraction = (function(){
  function status(ex,game){
    if(game.exploreMode)return true; // 探索模式：所有撤离点常开
    if(ex.condition==='time')return game.gameTime>=ex.openAt;
    if(ex.condition==='lever')return World.leverActivated('lever_w');
    if(ex.condition==='signal')return game.signalFired;
    return true;
  }
  function available(game){
    return DATA.MAP.extracts.filter(function(ex){return status(ex,game);});
  }
  function nearest(x,z,game){
    var best=null,bd=Infinity;
    available(game).forEach(function(ex){
      var d=U.dist(x,z,ex.x,ex.z);if(d<bd){bd=d;best=ex;}
    });
    return {ex:best,dist:bd};
  }
  return {status:status,available:available,nearest:nearest};
})();

/* ---------------- 任务与进度 ---------------- */
var Progress = (function(){
  function updateQuest(type,amount){
    var s=Save.get();
    DATA.QUESTS.forEach(function(q){
      if(s.questsDone.indexOf(q.id)>=0)return;
      if(q.type===type){
        s.quests[q.id]=(s.quests[q.id]||0)+amount;
        if(s.quests[q.id]>=q.target){
          s.questsDone.push(q.id);
          Save.addCash(q.reward);
          Toast.show('任务完成：'+q.name+' +¥'+q.reward,'good');
          Audio2.beep(720,0.25,0.12);
        }
      }
    });
    Save.save();
  }
  function renderQuestPanel(){
    var s=Save.get();
    return DATA.QUESTS.map(function(q){
      var done=s.questsDone.indexOf(q.id)>=0;
      var cur=s.quests[q.id]||0;
      return '<div class="eq-row"><span>'+(done?'✓ ':'')+q.name+'</span><span>'+Math.min(cur,q.target)+'/'+q.target+'</span></div>';
    }).join('');
  }
  return {updateQuest:updateQuest,renderQuestPanel:renderQuestPanel};
})();

/* ---------------- UI 面板渲染 ---------------- */
var UI = (function(){
  function rarityColor(id){var d=DATA.ITEMS[id];return d?DATA.RARITY[d.rarity].color:'#999';}
  function itemCard(id,qty,selected,onclick){
    var d=DATA.ITEMS[id];if(!d)return '';
    var html='<div class="item-card rare-'+d.rarity+(selected?' selected':'')+'" data-id="'+id+'" '+(onclick?'onclick="'+onclick+'"':'')+'>';
    html+='<div class="item-name" style="color:'+DATA.RARITY[d.rarity].color+'">'+d.name+'</div>';
    html+='<div class="item-meta">'+itemDesc(id,d)+'</div>';
    if(qty>1)html+='<div class="item-qty">×'+qty+'</div>';
    html+='</div>';
    return html;
  }
  function itemDesc(id,d){
    if(d.category==='weapon')return '伤害 '+d.dmg+' · 射速 '+d.rpm+' · 弹匣 '+d.mag;
    if(d.category==='med')return d.desc+' · '+(d.time||0)+'s';
    if(d.category==='armor')return '防护等级 '+d.armor;
    if(d.category==='ammo')return d.ammo==='ap'?'穿甲弹 ×'+d.count:d.ammo==='sub'?'亚音速 ×'+d.count:'普通弹 ×'+d.count;
    if(d.category==='attachment')return '配件 · '+d.type;
    if(d.category==='valuable')return '价值 ¥'+d.cost;
    return '';
  }

  // 仓库渲染
  function renderStash(){
    var s=Save.get();
    $('stash-list').innerHTML=s.stash.map(function(it){return itemCard(it.id,it.qty,false,"UI.pickStashItem('"+it.id+"')");}).join('')
      ||'<div style="color:var(--ink-dim);font-size:12px">仓库为空</div>';
    $('stash-cash').textContent='现金：¥'+s.cash;
    renderLoadout();
  }
  function renderLoadout(){
    var s=Save.get(),lo=s.loadout;
    var weaponName=lo.weapon&&DATA.WEAPONS[lo.weapon]?DATA.WEAPONS[lo.weapon].name:'无武器';
    var boxName=lo.ammoBox&&DATA.AMMO_BOX[lo.ammoBox]?DATA.AMMO_BOX[lo.ammoBox].name:'普通弹药盒';
    var armorName=lo.armor&&DATA.ARMOR_ITEMS[lo.armor]?DATA.ARMOR_ITEMS[lo.armor].name:'无护甲';
    var html='';
    html+='<div class="lslot filled" onclick="UI.unequipStash(\'weapon\')"><span><span class="lslot-label">主武器</span> '+weaponName+'</span><button>✕</button></div>';
    html+='<div class="lslot filled" onclick="UI.unequipStash(\'ammoBox\')"><span><span class="lslot-label">弹药</span> '+boxName+' ×'+(lo.mags||2)+'</span><button>✕</button></div>';
    html+='<div class="lslot filled" onclick="UI.unequipStash(\'armor\')"><span><span class="lslot-label">护甲</span> '+armorName+'</span><button>✕</button></div>';
    var meds=[];for(var m in lo.meds){if(lo.meds[m]>0&&DATA.MEDS[m])meds.push(DATA.MEDS[m].name+'×'+lo.meds[m]);}
    html+='<div class="lslot"><span><span class="lslot-label">医疗</span> '+(meds.join(' ')||'无')+'</span></div>';
    $('loadout-slots').innerHTML=html;
  }
  var picking=null;
  function pickStashItem(id){
    var d=DATA.ITEMS[id];if(!d)return;
    var s=Save.get(),lo=s.loadout;
    if(d.category==='weapon'){lo.weapon=id;}
    else if(d.category==='ammo'){lo.ammoBox=id;lo.mags=Math.min(3,Save.itemQty(id));}
    else if(d.category==='armor'){
      if(id.indexOf('helmet')>=0)lo.helmet=id;else lo.armor=id;
    }
    else if(d.category==='med'){
      var have=Save.itemQty(id);lo.meds[id]=Math.min(3,have);
    }
    else {Toast.show('该物品无法带入，可在撤离后变卖');return;}
    Save.save();renderLoadout();Audio2.beep(480,0.05,0.05);
  }
  function unequipStash(slot){
    var s=Save.get(),lo=s.loadout;
    if(slot==='weapon')lo.weapon=null;
    else if(slot==='ammoBox')lo.ammoBox=null;
    else if(slot==='armor')lo.armor=null;
    Save.save();renderLoadout();
  }
  function suggestLoadout(){
    var s=Save.get(),lo=s.loadout;
    // 选拥有的最好的武器
    var weapons=s.stash.filter(function(x){return DATA.WEAPONS[x.id];}).sort(function(a,b){return DATA.WEAPONS[b.id].rarity-DATA.WEAPONS[a.id].rarity;});
    if(weapons.length)lo.weapon=weapons[0].id;
    var boxes=s.stash.filter(function(x){return DATA.AMMO_BOX[x.id];});
    if(boxes.length)lo.ammoBox=boxes[0].id;
    var armors=s.stash.filter(function(x){return DATA.ITEMS[x.id]&&DATA.ITEMS[x.id].category==='armor'&&x.id.indexOf('helmet')<0;});
    if(armors.length)lo.armor=armors[0].id;
    lo.meds={};['m_bandage','m_medkit','m_painkill'].forEach(function(m){if(Save.itemQty(m)>0)lo.meds[m]=Math.min(2,Save.itemQty(m));});
    Save.save();renderLoadout();Toast.show('已应用推荐配置','good');
  }

  // 局内背包渲染
  function renderInventory(game){
    var inv=game.inventory;
    var html='';
    inv.items.forEach(function(it,i){html+=itemCard(it.id,it.qty,false,"UI.invAction("+i+")");});
    // 弹药显示
    for(var a in inv.ammo){
      if(inv.ammo[a]<=0)continue;
      var boxId='box_'+a;
      if(DATA.AMMO_BOX[boxId])html+=itemCard(boxId,Math.ceil(inv.ammo[a]/DATA.AMMO_BOX[boxId].count),false,'');
    }
    $('inv-list').innerHTML=html||'<div style="color:var(--ink-dim);font-size:12px">背包为空</div>';
    $('inv-weight').textContent=inv.weight.toFixed(1)+' / '+inv.maxWeight+' kg';

    var eq='<div class="eq-row"><span>主武器</span><span>'+(Player.p.weapon?Player.p.weapon.def.name:'无')+'</span></div>';
    eq+='<div class="eq-row"><span>护甲</span><span>'+(Player.p.armor?DATA.ARMOR[Player.p.armor].name:'无')+'</span></div>';
    eq+='<div class="eq-row"><span>头盔</span><span>'+(Player.p.helmet?DATA.ARMOR[Player.p.helmet].name:'无')+'</span></div>';
    eq+='<div class="eq-row"><span>击倒</span><span>'+Player.p.kills+'</span></div>';
    $('inv-equipped').innerHTML=eq;

    var hp='';
    for(var part in Player.p.parts){
      var v=Player.p.parts[part];
      hp+='<div class="hp-row"><span style="width:28px">'+DATA.BODY[part].label+'</span><div class="vital-bar"><div style="width:'+v+'%;background:'+(v>50?'var(--good)':v>25?'var(--warn)':'var(--danger)')+'"></div></div><span>'+Math.round(v)+'</span></div>';
    }
    var st=[];
    if(Player.p.status.bleed)st.push('出血');if(Player.p.status.pain)st.push('疼痛');if(Player.p.status.fracture)st.push('骨折');
    hp+='<div style="margin-top:8px;font-size:11px">状态：'+(st.join('、')||'正常')+'</div>';
    hp+='<div style="font-size:11px;margin-top:6px">生命 '+Math.round(Player.p.hp)+' / '+Player.p.maxHp+'</div>';
    hp+='<div style="margin-top:8px"><button class="btn-ghost small" onclick="Player.useMed(window.game)">使用医疗品 (H)</button></div>';
    hp+='<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:8px"><b style="color:var(--accent)">任务</b>'+Progress.renderQuestPanel()+'</div>';
    $('inv-health').innerHTML=hp;
  }
  function invAction(index){
    var inv=window.game.inventory;
    var it=inv.items[index];if(!it)return;
    var d=DATA.ITEMS[it.id];
    if(d.category==='weapon'){
      if(Player.addWeapon(it.id)){Inv.remove(inv,it.id,1);Toast.show('已装备 '+d.name,'good');renderInventory(window.game);}
      return;
    }
    if(d.category==='med'){
      inv.meds[it.id]=(inv.meds[it.id]||0)+it.qty;
      Inv.remove(inv,it.id,it.qty);
      Toast.show('已存入医疗栏');renderInventory(window.game);return;
    }
    if(d.category==='armor'){
      if(it.id.indexOf('helmet')>=0)inv.helmet=it.id;else inv.armor=it.id;
      Inv.remove(inv,it.id,1);Toast.show('已装备 '+d.name,'good');renderInventory(window.game);return;
    }
    if(d.category==='ammo'){
      Inv.addAmmo(inv,d.ammo,d.count*it.qty);Inv.remove(inv,it.id,it.qty);
      Toast.show('弹药已整理');renderInventory(window.game);return;
    }
    Toast.show('贵重物品：撤离后可变卖 ¥'+d.cost);
  }

  function renderHelp(){
    $('help-grid').innerHTML=DATA.HELP.map(function(h){return '<div><span>'+h[0]+'</span><kbd>'+h[1]+'</kbd></div>';}).join('');
  }

  return {renderStash:renderStash,renderLoadout:renderLoadout,pickStashItem:pickStashItem,
    unequipStash:unequipStash,suggestLoadout:suggestLoadout,renderInventory:renderInventory,
    invAction:invAction,renderHelp:renderHelp,itemCard:itemCard};
})();
