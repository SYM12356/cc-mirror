/* ===================================================================
 * game.js — 主游戏：状态机、循环、交互、HUD、撤离、移动端控制
 * =================================================================== */
window.game = (function(){
  'use strict';

  var G={
    state:'menu',           // menu / playing / paused / result / panel
    gameTime:0, sessionTime:0,
    signalFired:false,
    noiseEvents:[],
    inventory:null,
    enemies:[],
    interactTarget:null,
    looting:false, lootT:0, lootData:null,
    extracting:false, extractT:0, extractEx:null,
    effects:[],
    tracers:[],
    touchMode:false,
    frameCount:0
  };
  var lastT=0, rafId=0;
  var canvas;
  var API; // 公共接口对象，供 Player/EnemyManager 回调使用

  // ---------- 启动 ----------
  function boot(){
    canvas=$('game-canvas');
    var s=Save.load();
    applySettings(s.settings);
    Audio2.setVolume(s.settings.volume/100);
    UI.renderHelp();
    G.touchMode=IS_TOUCH||s.settings.control==='mobile';

    // 加载进度（模拟，实际是初始化）
    setLoad(10,'初始化渲染器…');
    setTimeout(function(){
      var ctx=World.init(canvas,s.settings.quality);
      setLoad(55,'生成学院场景…');
      setTimeout(function(){
        Player.init(World.getCamera());
        ctx.scene.add(World.getCamera()); // 相机加入场景以挂载视图模型
        EnemyManager.init(ctx.scene);
        setLoad(90,'装载系统…');
        setTimeout(function(){
          setLoad(100,'就绪');
          setTimeout(function(){
            hide('screen-loading');show('screen-menu');
            refreshMenu();
            bindUI();bindMobile();
            lastT=U.now();loop();
          },350);
        },200);
      },150);
    },100);
  }
  function setLoad(p,t){$('load-fill').style.width=p+'%';$('load-text').textContent=t;}

  function applySettings(st){
    if(!st)return;
    sensGlobal=st.sens||8;
    if(Player&&Player.setSens)Player.setSens(sensGlobal);
  }
  var sensGlobal=8;

  function refreshMenu(){
    var s=Save.get();
    $('menu-record').textContent='资产：¥'+s.cash+' · 等级 '+s.level;
    $('menu-meta').textContent='角色：汪义轩 · 高年级成年学员';
  }

  // ---------- UI 绑定 ----------
  function bindUI(){
    $('btn-start').onclick=function(){Audio2.init();Audio2.resume();openStash();};
    $('btn-explore').onclick=function(){Audio2.init();Audio2.resume();startRaid(true);};
    $('btn-stash-menu').onclick=function(){Audio2.init();openStash();};
    $('btn-help').onclick=function(){show('screen-help');};
    $('btn-settings').onclick=function(){openSettings('menu');};
    $('btn-go-deploy').onclick=function(){startRaid();};
    $('btn-equip-suggest').onclick=function(){UI.suggestLoadout();};
    $('btn-result-stash').onclick=function(){show('screen-stash');UI.renderStash();hide('screen-result');G.state='panel';};
    $('btn-result-again').onclick=function(){startRaid();};
    $('btn-resume').onclick=function(){resume();};
    $('btn-pause-settings').onclick=function(){openSettings('pause');};
    $('btn-abandon').onclick=function(){hide('screen-pause');
      if(G.exploreMode)endRaid(true,'探索结束 · 战利品已保留');
      else endRaid(false,'放弃行动');
    };
    $('btn-reset-save').onclick=function(){
      if(confirm('确定重置所有存档？此操作不可撤销。')){Save.reset();applySettings(Save.get().settings);refreshMenu();Toast.show('存档已重置','bad');}
    };

    // 关闭按钮
    document.querySelectorAll('[data-close]').forEach(function(b){
      b.onclick=function(){
        var which=b.getAttribute('data-close');
        hide('screen-'+which);
        if(G.state==='panel')G.state='menu';
        if(which==='inventory'){resumeFromPanel();}
      };
    });

    // 设置
    $('set-quality').value=Save.get().settings.quality;
    $('set-fov').value=Save.get().settings.fov;$('fov-val').textContent=Save.get().settings.fov;
    $('set-sens').value=Save.get().settings.sens;$('sens-val').textContent=Save.get().settings.sens;
    $('set-volume').value=Save.get().settings.volume;$('vol-val').textContent=Save.get().settings.volume;
    $('set-control').value=Save.get().settings.control;
    $('set-quality').onchange=function(e){Save.get().settings.quality=e.target.value;Save.save();Toast.show('画质设置在下次进入战区生效');};
    $('set-fov').oninput=function(e){$('fov-val').textContent=e.target.value;World.getCamera().fov=+e.target.value;World.getCamera().updateProjectionMatrix();Save.get().settings.fov=+e.target.value;Save.save();};
    $('set-sens').oninput=function(e){$('sens-val').textContent=e.target.value;sensGlobal=+e.target.value;if(Player.setSens)Player.setSens(sensGlobal);Save.get().settings.sens=+e.target.value;Save.save();};
    $('set-volume').oninput=function(e){$('vol-val').textContent=e.target.value;Audio2.setVolume(e.target.value/100);Save.get().settings.volume=+e.target.value;Save.save();};
    $('set-control').onchange=function(e){Save.get().settings.control=e.target.value;G.touchMode=e.target.value==='mobile'||(e.target.value==='auto'&&IS_TOUCH);Save.save();Toast.show('操作模式：'+e.target.options[e.target.selectedIndex].text);};

    // 菜单快捷键
    document.addEventListener('keydown',function(e){
      if(e.code==='Escape'){
        if(G.state==='playing'){pause();}
        else if(G.state==='paused'){resume();}
        else if(G.state==='panel'){
          var open=document.querySelector('.screen:not(.hidden)');
          if(open&&open.id!=='screen-menu'&&open.id!=='screen-loading'){open.classList.add('hidden');G.state='menu';refreshMenu();}
        }
      }
      if(e.code==='Tab'&&G.state==='playing'){e.preventDefault();openInventory();}
      if(e.code==='KeyM'&&G.state==='playing'){toastCompass();}
    });
  }

  function openSettings(from){
    window._settingsFrom=from;show('screen-settings');
    if(G.state==='menu')G.state='panel';
  }
  // 设置面板关闭需返回来源
  document.querySelector('[data-close="settings"]').addEventListener('click',function(){
    if(window._settingsFrom==='pause'){show('screen-pause');}
    else{show('screen-menu');refreshMenu();}
  });

  function openStash(){hide('screen-menu');show('screen-stash');UI.renderStash();G.state='panel';}

  // ---------- 开始一局 ----------
  function startRaid(explore){
    G.exploreMode=!!explore;
    hide('screen-stash');hide('screen-menu');hide('screen-result');hide('screen-settings');
    Audio2.init();Audio2.resume();Audio2.startAmbience();
    var s=Save.get();
    // 校验配置
    var lo=s.loadout;
    if(!lo.weapon||!DATA.WEAPONS[lo.weapon]||!Save.hasItem(lo.weapon,1)){
      lo.weapon='w_pistol';
      if(!Save.hasItem('w_pistol',1))Save.addItem('w_pistol',1);
    }
    if(!lo.ammoBox||!DATA.AMMO_BOX[lo.ammoBox])lo.ammoBox='box_normal';
    if(!Save.hasItem(lo.ammoBox,1))lo.ammoBox='box_normal';

    // 构建局内背包
    G.inventory=makeInventory(lo);
    Inv.takeFromStash(G.inventory,{weapon:lo.weapon,ammoBox:lo.ammoBox,mags:lo.mags||2,meds:lo.meds,armor:lo.armor,helmet:lo.helmet});

    Player.reset(lo,s.skills);
    // 同步护甲/头盔到玩家
    Player.p.armor=lo.armor?DATA.ARMOR_ITEMS[lo.armor].armor:0;
    Player.p.helmet=lo.helmet?DATA.ARMOR_ITEMS[lo.helmet].armor:0;
    // 同步弹药到武器
    if(Player.p.weapon){
      var bDef=DATA.AMMO_BOX[lo.ammoBox];
      Player.p.weapon.ammoType=bDef.ammo;
      Player.p.weapon.reserve=G.inventory.ammo[bDef.ammo];
    }
    // 清理上一局敌人掉落的无实体搜刮点，并重置固定搜刮点
    World.getLootSpots().forEach(function(sp){
      if(sp._drop){sp.used=true;sp.mesh.visible=false;}
    });

    EnemyManager.clear();
    if(!G.exploreMode)EnemyManager.spawnAll();
    G.enemies=EnemyManager.getList();

    G.gameTime=0;G.sessionTime=0;G.signalFired=false;
    G.noiseEvents=[];G.effects=[];G.tracers=[];
    G.extracting=false;G.looting=false;G.interactTarget=null;
    // 重置搜刮点
    World.getLootSpots().forEach(function(sp){sp.used=false;sp.mesh.visible=true;});
    // 相机 FOV
    World.getCamera().fov=s.settings.fov;World.getCamera().updateProjectionMatrix();

    show('hud');
    if(G.touchMode){show('mobile-controls');Input.exitLock();}
    else{hide('mobile-controls');Input.setEnabled(true);Input.requestLock(canvas);}
    G.state='playing';
    if(G.exploreMode)Toast.show('探索模式：无敌人 · 自由搜刮与熟悉地图，按撤离指引突围');
    else Toast.show('已进入云杉学院 · 看屏幕上方箭头找撤离点，搜刮后撤离');
    updateHUD();
  }

  // ---------- 暂停/恢复 ----------
  function pause(){
    if(G.state!=='playing')return;
    G.state='paused';Input.setEnabled(false);Input.exitLock();
    show('screen-pause');
  }
  function resume(){
    hide('screen-pause');hide('screen-settings');
    G.state='playing';Input.setEnabled(true);
    if(!G.touchMode)Input.requestLock(canvas);
    lastT=U.now();
  }
  function openInventory(){
    if(G.state!=='playing')return;
    G.state='panel';Input.setEnabled(false);Input.exitLock();
    UI.renderInventory(G);show('screen-inventory');
  }
  function resumeFromPanel(){
    if(G.state==='panel'){G.state='playing';Input.setEnabled(true);if(!G.touchMode)Input.requestLock(canvas);lastT=U.now();}
  }

  // ---------- 主循环 ----------
  function loop(){
    rafId=requestAnimationFrame(loop);
    var t=U.now(),dt=Math.min(0.05,t-lastT||0.016);lastT=t;
    G.frameCount++;

    if(G.state==='playing'){
      G.gameTime+=dt;G.sessionTime+=dt;
      Player.update(dt,API);
      Player.updateMed(dt);
      EnemyManager.update(dt,API);
      updateInteract(dt);
      updateExtraction(dt);
      updateEffects(dt);
      World.update(dt,G.gameTime);
      // 清理噪声
      G.noiseEvents=G.noiseEvents.filter(function(n){return (U.now()-n.time)<0.5;});
      updateHUD();
      renderMinimap();
    }else if(G.state==='paused'||G.state==='panel'){
      World.update(dt*0.2,G.gameTime);
    }
    World.getRenderer().render(World.getScene(),World.getCamera());
    Input.clearJust();
  }

  // ---------- 交互（搜刮/配电箱）----------
  function updateInteract(dt){
    var pp=Player.p;
    if(G.looting){
      G.lootT-=dt;
      $('loot-bar-fill').style.width=((1-G.lootT/G.lootDur)*100)+'%';
      if(G.lootT<=0){finishLoot();}
      return;
    }
    // 找最近可交互对象
    var target=null,bd=3.2;
    World.getLootSpots().forEach(function(sp){
      if(sp.used)return;
      var d=U.dist(pp.pos.x,pp.pos.z,sp.x,sp.z);
      if(d<bd){bd=d;target={type:'loot',spot:sp,dist:d};}
    });
    DATA.MAP.levers.forEach(function(l){
      if(World.leverActivated(l.id))return;
      var d=U.dist(pp.pos.x,pp.pos.z,l.x,l.z);
      if(d<bd){bd=d;target={type:'lever',lever:l,dist:d};}
    });
    // 检修梯：攀爬/下屋顶
    var ladder=World.getLadder();
    if(ladder){
      if(pp.pos.y>=ladder.topY-1){
        // 已在屋顶：走到梯子顶端附近可下来
        var rd=U.dist(pp.pos.x,pp.pos.z,ladder.topX,ladder.topZ);
        if(rd<4){bd=rd;target={type:'ladderDown',dist:rd};}
      }else if(pp.pos.y<3){
        // 地面：靠近梯子底部可上去
        var ld=U.dist(pp.pos.x,pp.pos.z,ladder.x,ladder.z);
        if(ld<3.2){bd=ld;target={type:'ladderUp',dist:ld};}
      }
    }
    G.interactTarget=target;
    var prompt=$('hud-prompt');
    if(target){
      var label=target.type==='loot'?'搜刮容器':target.type==='lever'?'激活 '+target.lever.label:
        target.type==='ladderUp'?'攀爬检修梯':'沿检修梯下到地面';
      prompt.textContent='[F] '+label;
      prompt.classList.remove('hidden');
      if(Input.down('KeyF')||Input.touch.interact){
        if(target.type==='loot')startLoot(target.spot);
        else if(target.type==='ladderUp'){
          pp.pos.set(ladder.topX,ladder.topY+pp.height,ladder.topZ);pp.vy=0;pp.onGround=true;
          Toast.show('已攀上体育馆屋顶');Audio2.step();
        }else if(target.type==='ladderDown'){
          pp.pos.set(ladder.x,pp.height,ladder.z);pp.vy=0;pp.onGround=true;
          Toast.show('已下到地面');Audio2.step();
        }else if(target.type==='lever'){
          World.activateLever(target.lever.id);
          Toast.show('已激活 '+target.lever.label+' · 西侧检修门开放','good');
          Audio2.beep(680,0.2,0.1);
          makeNoise(target.lever.x,target.lever.z,25);
        }
      }
    }else{
      prompt.classList.add('hidden');
    }
  }
  function startLoot(spot){
    var skill=Save.get().skills.s_scav||0;
    G.looting=true;
    G.lootDur=Math.max(0.8,2.6-skill*0.2);
    G.lootT=G.lootDur;
    G.lootSpot=spot;
    G.lootData=LootGen.generate(spot.tier);
    $('hud-loot-progress').classList.remove('hidden');
    Audio2.beep(200,0.1,0.04);
  }
  function finishLoot(){
    G.looting=false;
    $('hud-loot-progress').classList.add('hidden');
    var spot=G.lootSpot;
    spot.used=true;spot.mesh.visible=false;
    var gained=[];
    G.lootData.forEach(function(it){
      var def=DATA.ITEMS[it.id];if(!def)return;
      var ok=false;
      if(def.category==='ammo'){Inv.addAmmo(G.inventory,def.ammo,def.count*it.qty);ok=true;}
      else if(def.category==='med'){
        G.inventory.meds[it.id]=(G.inventory.meds[it.id]||0)+it.qty;
        G.inventory.items.push({id:it.id,qty:it.qty});ok=true;
      }else ok=Inv.add(G.inventory,it.id,it.qty);
      if(ok)gained.push(def.name+'×'+it.qty);
    });
    if(gained.length){
      Toast.show('获得：'+gained.slice(0,4).join('、')+(gained.length>4?' 等':''),'good');
      Progress.updateQuest('loot',gained.length);
      Audio2.beep(600,0.1,0.07);
    }else Toast.show('背包已满','bad');
    makeNoise(spot.x,spot.z,12);
    updateHUD();
  }

  // ---------- 撤离 ----------
  function updateExtraction(dt){
    var pp=Player.p;
    var near=Extraction.nearest(pp.pos.x,pp.pos.z,G);
    // 信号弹发射（在体育馆屋顶按 G）
    if(Input.pressed('KeyG')&&!G.signalFired){
      var roof=DATA.MAP.extracts.find(function(e){return e.id==='roof';});
      if(U.dist(pp.pos.x,pp.pos.z,roof.x,roof.z)<10&&pp.pos.y>8){
        G.signalFired=true;
        Toast.show('信号弹已发射 · 屋顶撤离点开放','good');Audio2.beep(880,0.4,0.15);
        makeNoise(pp.pos.x,pp.pos.z,80);
      }else Toast.show('需要在体育馆屋顶发射信号弹','bad');
    }
    if(G.extracting){
      G.extractT-=dt;
      $('extract-countdown').textContent=U.fmtTime(G.extractT);
      if(U.dist(pp.pos.x,pp.pos.z,G.extractEx.x,G.extractEx.z)>5){
        G.extracting=false;$('hud-extract').classList.add('hidden');Toast.show('离开撤离区，倒计时取消','bad');
      }else if(G.extractT<=0){
        endRaid(true,'成功从'+G.extractEx.name+'撤离');
      }
      return;
    }
    if(near.ex&&near.dist<4){
      var open=Extraction.status(near.ex,G);
      if(open){
        if(!G._extractPrompted){Toast.show('到达 '+near.ex.name+' · 长按 F 撤离');G._extractPrompted=true;}
        if(Input.down('KeyF')||Input.touch.interact){
          G.extracting=true;G.extractT=6;G.extractEx=near.ex;
          $('hud-extract').classList.remove('hidden');
          Toast.show('开始撤离，保持在该区域 6 秒');
        }
      }else{
        $('hud-prompt').textContent='[锁定] '+near.ex.name+' · '+near.ex.label;
        $('hud-prompt').classList.remove('hidden');
      }
    }else{
      G._extractPrompted=false;
    }
  }

  // ---------- 结束一局 ----------
  function endRaid(success,reason){
    if(G.state==='result')return;
    G.state='result';
    Input.setEnabled(false);Input.exitLock();Audio2.stopAmbience();
    hide('hud');hide('mobile-controls');hide('hud-extract');

    var s=Save.get();
    s.stats=s.stats||{};
    var lootValue=0,lootLines=[];
    if(success){
      // 结算战利品
      G.inventory.items.forEach(function(it){
        var def=DATA.ITEMS[it.id];
        if(def&&def.category==='valuable'){lootValue+=def.cost*it.qty;}
        if(def)lootLines.push({name:def.name,qty:it.qty,val:def.cost*it.qty});
      });
      // 变卖贵重物，其余存入仓库
      G.inventory.items=G.inventory.items.filter(function(it){
        return !DATA.ITEMS[it.id]||DATA.ITEMS[it.id].category!=='valuable';
      });
      Inv.bankToStash(G.inventory);
      Save.addCash(lootValue);
      Save.addXP(150+Player.p.kills*20+lootLines.length*5);
      s.stats.extracts=(s.stats.extracts||0)+1;
      Progress.updateQuest('extract',1);
    }else{
      // 休闲模式：阵亡仅损失拾取物与医疗，保留主武器与护甲，避免卡死
      var lo=s.loadout;
      if(lo.weapon&&DATA.WEAPONS[lo.weapon])Save.addItem(lo.weapon,1);
      if(lo.armor&&DATA.ARMOR_ITEMS[lo.armor])Save.addItem(lo.armor,1);
      s.stats.deaths=(s.stats.deaths||0)+1;
    }
    s.stats.kills=(s.stats.kills||0)+Player.p.kills;
    s.stats.elites=(s.stats.elites||0)+EnemyManager.elitesKilled();
    s.stats.loot=(s.stats.loot||0)+lootLines.length;
    Save.save();
    Progress.updateQuest('kill',Player.p.kills);
    Progress.updateQuest('elite',EnemyManager.elitesKilled());

    // 显示结算
    $('result-title').textContent=success?'撤离成功':'行动失败';
    $('result-title').className=success?'':'fail';
    $('result-sub').textContent=reason;
    $('result-stats').innerHTML=
      '<div class="stat">击倒<b>'+Player.p.kills+'</b></div>'+
      '<div class="stat">爆头<b>'+Player.p.headshots+'</b></div>'+
      '<div class="stat">战利品<b>'+lootLines.length+'</b></div>'+
      '<div class="stat">收益<b>¥'+lootValue+'</b></div>'+
      '<div class="stat">时长<b>'+U.fmtTime(G.sessionTime)+'</b></div>';
    $('result-loot').innerHTML=lootLines.length?
      lootLines.map(function(l){return '<div class="loot-line"><span>'+l.name+' ×'+l.qty+'</span><b>'+(l.val>0?'¥'+l.val:'存入仓库')+'</b></div>';}).join('')
      :'<div style="text-align:center">没有带回战利品</div>';
    show('screen-result');
    refreshMenu();
  }

  // ---------- 事件回调 ----------
  function onEnemyKilled(e){
    Player.p.kills++;
    Audio2.beep(240,0.15,0.08);
    killfeed('你击倒了 '+e.typeDef.name);
    // 掉落物生成在尸体处
    var drops=LootGen.fromEnemy(e);
    drops.forEach(function(it){
      // 直接加入可搜刮点
      World.getLootSpots().push({
        x:e.pos.x,z:e.pos.z,mesh:{visible:true,children:[],material:null},used:false,tier:e.typeDef.lootTier,
        _drop:true,_items:[it]
      });
    });
  }
  function onPlayerDeath(){
    setTimeout(function(){endRaid(false,'你在行动中阵亡，带入与拾取物资已损失');},1200);
  }
  function onPlayerDamaged(amount){
    updateHUD();
  }
  function onHit(part,amount,enemy){
    var hm=$('hud-hitmarker');hm.style.opacity='1';
    setTimeout(function(){hm.style.opacity='0';},120);
    if(part==='head')killfeed('爆头！');
  }
  function killfeed(msg){
    var kf=el('div','kf',msg);
    $('hud-killfeed').appendChild(kf);
    setTimeout(function(){kf.style.opacity='0';kf.style.transition='opacity .4s';setTimeout(function(){kf.remove();},420);},3200);
  }
  function makeNoise(x,z,radius){
    G.noiseEvents.push({x:x,z:z,radius:radius,time:U.now()});
  }
  function spawnImpact(point,obj){
    if(!point)return;
    var m=new THREE.Mesh(new THREE.SphereGeometry(0.06,5,4),new THREE.MeshBasicMaterial({color:0xcccccc,transparent:true,opacity:0.8}));
    m.position.copy(point);World.getScene().add(m);
    G.effects.push({mesh:m,life:0.6,max:0.6});
  }
  function spawnTracer(from,to){
    var geo=new THREE.BufferGeometry().setFromPoints([from,to]);
    var mat=new THREE.LineBasicMaterial({color:0xffaa44,transparent:true,opacity:0.7});
    var line=new THREE.Line(geo,mat);World.getScene().add(line);
    G.effects.push({mesh:line,life:0.12,max:0.12});
  }
  function updateEffects(dt){
    for(var i=G.effects.length-1;i>=0;i--){
      var e=G.effects[i];e.life-=dt;
      if(e.life<=0){World.getScene().remove(e.mesh);G.effects.splice(i,1);}
      else if(e.mesh.material)e.mesh.material.opacity=0.8*(e.life/e.max);
    }
  }

  // ---------- HUD ----------
  function updateHUD(){
    if(!Player.p)return;
    var pp=Player.p;
    $('health-fill').style.width=(pp.hp/pp.maxHp*100)+'%';
    $('health-fill').style.background=pp.hp/pp.maxHp>0.5?'var(--good)':pp.hp/pp.maxHp>0.25?'var(--warn)':'var(--danger)';
    $('health-num').textContent=Math.ceil(pp.hp);
    $('stam-fill').style.width=(pp.stam/pp.maxStam*100)+'%';
    // 部位
    document.querySelectorAll('#hud-parts .part').forEach(function(el){
      var v=pp.parts[el.getAttribute('data-part')];
      el.className='part'+(v<=0?' black':v<50?' hurt':'');
    });
    // 状态
    var st=[];if(pp.status.bleed)st.push('出血');if(pp.status.pain)st.push('疼痛');if(pp.status.fracture)st.push('骨折');
    $('hud-status').innerHTML=st.map(function(s){return '<span class="status-chip">'+s+'</span>';}).join('');

    if(pp.weapon){
      $('weapon-name').textContent=pp.weapon.def.name;
      $('ammo-mag').textContent=pp.weapon.mag;
      $('ammo-res').textContent=pp.weapon.reserve;
      $('ammo-type').textContent=DATA.AMMO[pp.weapon.ammoType].name;
      $('fire-mode').textContent=pp.weapon.def.auto?'全自动':'半自动';
    }else{
      $('weapon-name').textContent='未装备';$('ammo-mag').textContent='--';$('ammo-res').textContent='--';
    }
    // 罗盘（相机朝 -Z 为北，yaw 增大朝西，故取负）
    var deg=((-pp.yaw*180/Math.PI)%360+360)%360;
    var dirs=['N','NE','E','SE','S','SW','W','NW'];
    $('compass-dir').textContent=dirs[Math.round(deg/45)%8];
    $('compass-deg').textContent=String(Math.round(deg)).padStart(3,'0')+'°';
    // 准星 ADS / 狙击镜覆盖层
    $('hud-crosshair').classList.toggle('ads',pp.ads);
    var scoped=pp.ads&&pp.isMarksman&&pp.adsT>0.55;
    var scopeEl=$('scope-overlay');
    scopeEl.classList.toggle('hidden',!scoped);
    scopeEl.classList.toggle('bolting',!!pp.bolt);
    if(scoped){
      var zoom=pp.weapon&&pp.weapon.def.type==='sniper'?4:2;
      $('scope-zoom').textContent=zoom.toFixed(1)+'×';
      var br=$('scope-breath');br.classList.toggle('active',!!pp.breath);
      br.textContent=pp.breath?'屏息中…':(pp.stam<10?'体力不足':'屏息 [Shift]');
      var dir=new THREE.Vector3();World.getCamera().getWorldDirection(dir);
      var hit=World.raycast(World.getCamera().position,dir,260);
      $('scope-range').textContent=hit.hit?Math.round(hit.dist)+' m':'---- m';
    }
    // 快捷槽
    document.querySelectorAll('#hud-quick .slot').forEach(function(s,i){
      s.classList.toggle('active',i===pp.activeSlot);
    });
    // 目标 / 撤离
    if(!G.extracting){
      $('objective-text').textContent=G.exploreMode?
        '【探索模式】自由搜刮 · 沿指引撤离':
        '搜刮物资 · 寻找撤离点 · 已击倒 '+pp.kills;
    }
    // 区域标签
    var zone=DATA.MAP.zones.find(function(z){return Math.abs(pp.pos.x-z.x)<z.w/2&&Math.abs(pp.pos.z-z.z)<z.d/2;});
    $('zone-label').textContent=zone?zone.name:'校外区域';
    // 撤离指引：最近可用撤离点方位与距离
    if(G.state==='playing'){
      var near=Extraction.nearest(pp.pos.x,pp.pos.z,G);
      if(near.ex){
        $('eg-name').textContent=near.ex.name;
        $('eg-dist').textContent=Math.round(near.dist)+' m';
        // 相对朝向箭头（0=正前）
        var toEx=Math.atan2(near.ex.z-pp.pos.z,near.ex.x-pp.pos.x);
        var rel=toEx-(Math.PI/2-pp.yaw); // 前为 -Z 时 yaw=0
        $('eg-arrow').style.transform='rotate('+(-rel*180/Math.PI)+'deg)';
      }else{
        $('eg-name').textContent='等待开放';$('eg-dist').textContent='-- m';
      }
    }
  }
  function renderMinimap(){
    var c=$('minimap'),ctx=c.getContext('2d');
    World.drawMinimap(ctx,Player.p.pos.x,Player.p.pos.z,EnemyManager.getList(),DATA.MAP.extracts,null,Player.p.yaw);
  }
  function toastCompass(){
    var ex=Extraction.available(G);
    Toast.show('可用撤离点：'+ex.map(function(e){return e.name;}).join('、')||'暂无撤离点开放');
  }

  // ---------- 移动端控制 ----------
  function bindMobile(){
    var stick=$('stick-base'),knob=$('stick-knob');
    var active=false,cx=0,cy=0;
    function stickStart(e){
      active=true;var r=stick.getBoundingClientRect();cx=r.left+r.width/2;cy=r.top+r.height/2;stickMove(e);
    }
    function stickMove(e){
      if(!active)return;var t=e.touches?e.touches[0]:e;
      var dx=t.clientX-cx,dy=t.clientY-cy,max=42;
      var d=Math.hypot(dx,dy);if(d>max){dx=dx/d*max;dy=dy/d*max;}
      knob.style.transform='translate('+dx+'px,'+dy+'px)';
      Input.touch.moveX=dx/max;Input.touch.moveY=dy/max;
    }
    function stickEnd(){active=false;knob.style.transform='';Input.touch.moveX=0;Input.touch.moveY=0;}
    stick.addEventListener('touchstart',function(e){e.preventDefault();stickStart(e);},{passive:false});
    stick.addEventListener('touchmove',function(e){e.preventDefault();stickMove(e);},{passive:false});
    stick.addEventListener('touchend',stickEnd);stick.addEventListener('touchcancel',stickEnd);

    var looking=false,lx=0,ly=0;
    var look=$('look-zone');
    look.addEventListener('touchstart',function(e){e.preventDefault();var t=e.touches[0];lx=t.clientX;ly=t.clientY;},{passive:false});
    look.addEventListener('touchmove',function(e){e.preventDefault();var t=e.touches[0];Input.touch.lookX+=(t.clientX-lx)*1.4;Input.touch.lookY+=(t.clientY-ly)*1.4;lx=t.clientX;ly=t.clientY;},{passive:false});

    function btn(id,on,off){
      var b=$(id);
      b.addEventListener('touchstart',function(e){e.preventDefault();b.classList.add('pressed');if(on)on();},{passive:false});
      b.addEventListener('touchend',function(e){e.preventDefault();b.classList.remove('pressed');if(off)off();},{passive:false});
    }
    btn('btn-fire',function(){Input.touch.fire=true;},function(){Input.touch.fire=false;});
    btn('btn-ads',function(){Input.touch.ads=true;},function(){Input.touch.ads=false;});
    btn('btn-reload',function(){Player.reload();});
    btn('btn-crouch',function(){Player.p.crouch=!Player.p.crouch;});
    btn('btn-prone',function(){Player.p.prone=!Player.p.prone;});
    btn('btn-jump',function(){if(Player.p.onGround){Player.p.vy=6.2;Player.p.onGround=false;}});
    btn('btn-interact',function(){Input.touch.interact=true;setTimeout(function(){Input.touch.interact=false;},180);});
    btn('btn-inventory',function(){openInventory();});
    btn('btn-view',function(){Player.toggleView();});
    btn('btn-w1',function(){Player.switchWeapon(0);});
    btn('btn-w2',function(){Player.switchWeapon(1);});
    btn('btn-w3',function(){Player.switchWeapon(2);});
  }

  // ---------- 调试：暴露给测试 ----------
  function _debug(){
    return {
      startRaid:startRaid,endRaid:endRaid,
      getState:function(){return G.state;},
      getGame:function(){return G;},
      teleport:function(x,z){Player.p.pos.x=x;Player.p.pos.z=z;},
      killAll:function(){EnemyManager.getList().forEach(function(e){if(e.alive)e.die(API);});}
    };
  }

  API = {onEnemyKilled:onEnemyKilled,onPlayerDeath:onPlayerDeath,onPlayerDamaged:onPlayerDamaged,
    onHit:onHit,makeNoise:makeNoise,spawnImpact:spawnImpact,spawnTracer:spawnTracer,
    updateHUD:updateHUD,killfeed:killfeed,startRaid:startRaid,endRaid:endRaid,pause:pause,resume:resume,
    openInventory:openInventory,_debug:_debug,G:G};
  // 把状态字段镜像到 API，供 Player/EnemyManager/UI 通过同一对象访问
  ['inventory','enemies','noiseEvents','touchMode','gameTime','signalFired','extracting'].forEach(function(k){
    Object.defineProperty(API,k,{get:function(){return G[k];},set:function(v){G[k]=v;}});
  });

  document.addEventListener('DOMContentLoaded',boot);

  return API;
})();
