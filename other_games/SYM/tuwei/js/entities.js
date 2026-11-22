/* ===================================================================
 * entities.js — 玩家控制器 + 武器视图模型 + 战术 AI 敌人
 * =================================================================== */

/* ---------------- 玩家 ---------------- */
var Player = (function(){
  var p={
    pos:new THREE.Vector3(0,1.7,0), vel:new THREE.Vector3(),
    yaw:0, pitch:0, height:1.7,
    hp:100, maxHp:100, stam:100, maxStam:100,
    parts:{head:100,chest:100,arm:100,leg:100},
    status:{bleed:false,pain:false,fracture:false},
    crouch:false, prone:false, sprint:false,
    onGround:true, vy:0,
    firstPerson:true,
    weapon:null,          // 当前武器实例 {def, mag, reserve, ammoType, attachments}
    weapons:[],           // 携带武器数组
    activeSlot:0,
    reloading:false, reloadT:0,
    firing:false, fireCooldown:0,
    recoil:0, recoilV:0, spreadBloom:0,
    ads:false, adsT:0,
    breath:false, breathT:0,   // 屏息
    bolt:false, boltT:0,        // 栓动拉栓
    swayX:0, swayY:0, swayT:0,  // 瞄准晃动
    usedMed:null, medT:0,
    alive:true,
    bob:0, stepDist:0,
    kills:0, headshots:0,
    lastDamage:0
  };
  var camera, viewGroup, weaponMesh, muzzleFlash;
  var sens=8;

  function init(cam){
    camera=cam;
    buildViewModel();
  }
  function setSens(v){sens=v;}
  function reset(cfg,skills){
    var s=Save.get();
    p.maxHp=140+(skills.s_health||0)*15;
    p.maxStam=120+(skills.s_stam||0)*10;
    p.hp=p.maxHp;p.stam=p.maxStam;
    p.regenDelay=0;
    p.parts={head:100,chest:100,arm:100,leg:100};
    p.status={bleed:false,pain:false,fracture:false};
    p.alive=true;p.kills=0;p.headshots=0;p.recoil=0;p.spreadBloom=0;
    p.yaw=0;p.pitch=0;
    var sp=DATA.MAP.spawn;p.pos.set(sp.x,p.height,sp.z);
    p.vel.set(0,0,0);p.vy=0;p.onGround=true;

    // 根据配置构建武器
    p.weapons=[];
    if(cfg.weapon&&DATA.WEAPONS[cfg.weapon]){
      p.weapons.push(makeWeapon(cfg.weapon,cfg.ammoType||'normal',cfg.mags||2));
    }
    p.activeSlot=0;p.weapon=p.weapons[0]||null;
    // 护甲
    p.armor=cfg.armor?DATA.ARMOR_ITEMS[cfg.armor]?DATA.ARMOR_ITEMS[cfg.armor].armor:0:0;
    p.helmet=cfg.helmet?DATA.ARMOR_ITEMS[cfg.helmet]?DATA.ARMOR_ITEMS[cfg.helmet].armor:0:0;
    p.reloading=false;p.firing=false;p.ads=false;p.adsT=0;
    p.breath=false;p.bolt=false;p.boltT=0;p.swayX=0;p.swayY=0;
    updateViewModel();
    syncCamera();
  }
  function makeWeapon(id,ammoType,mags){
    var def=DATA.WEAPONS[id];
    var reserve=(def.res||30)*(mags||1);
    return {def:def,mag:def.mag,reserve:reserve,ammoType:ammoType||'normal',attachments:{}};
  }

  // ---------- 武器视图模型 ----------
  var scopeMesh=null;
  function buildViewModel(){
    viewGroup=new THREE.Group();
    camera.add(viewGroup);
    var darkMetal=new THREE.MeshStandardMaterial({color:0x242824,roughness:0.45,metalness:0.7});
    var polymer=new THREE.MeshStandardMaterial({color:0x2b2e29,roughness:0.8,metalness:0.1});
    var accent=new THREE.MeshStandardMaterial({color:0x6b6146,roughness:0.5,metalness:0.5});
    weaponMesh=new THREE.Group();
    // 机匣
    var body=new THREE.Mesh(new THREE.BoxGeometry(0.10,0.13,0.55),polymer);
    body.position.set(0,0,-0.2);weaponMesh.add(body);
    // 上导轨
    var rail=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.025,0.5),darkMetal);
    rail.position.set(0,0.078,-0.2);weaponMesh.add(rail);
    // 枪管 + 消焰器
    var barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.028,0.38,10),darkMetal);
    barrel.rotation.x=Math.PI/2;barrel.position.set(0,0,-0.62);weaponMesh.add(barrel);
    var flashHider=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.035,0.12,8),accent);
    flashHider.rotation.x=Math.PI/2;flashHider.position.set(0,0,-0.83);weaponMesh.add(flashHider);
    // 护木
    var handguard=new THREE.Mesh(new THREE.BoxGeometry(0.11,0.09,0.26),polymer);
    handguard.position.set(0,-0.01,-0.5);weaponMesh.add(handguard);
    // 握把 + 扳机护圈
    var grip=new THREE.Mesh(new THREE.BoxGeometry(0.065,0.19,0.10),polymer);
    grip.position.set(0,-0.14,-0.04);grip.rotation.x=-0.22;weaponMesh.add(grip);
    var trigger=new THREE.Mesh(new THREE.TorusGeometry(0.05,0.01,6,10,Math.PI),darkMetal);
    trigger.position.set(0,-0.07,-0.14);trigger.rotation.y=Math.PI/2;weaponMesh.add(trigger);
    // 弹匣（略微倾斜）
    var mag=new THREE.Mesh(new THREE.BoxGeometry(0.075,0.22,0.11),accent);
    mag.position.set(0,-0.17,-0.2);mag.rotation.x=0.08;weaponMesh.add(mag);
    // 枪托
    var stock=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.1,0.24),polymer);
    stock.position.set(0,-0.02,0.16);weaponMesh.add(stock);
    // 机械瞄具
    var frontSight=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.06,0.02),darkMetal);
    frontSight.position.set(0,0.11,-0.7);weaponMesh.add(frontSight);
    scopeMesh=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.18,10),darkMetal);
    scopeMesh.rotation.x=Math.PI/2;scopeMesh.position.set(0,0.13,-0.18);scopeMesh.visible=false;weaponMesh.add(scopeMesh);
    // 枪口火焰
    muzzleFlash=new THREE.Mesh(new THREE.SphereGeometry(0.1,8,6),new THREE.MeshBasicMaterial({color:0xffd066,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
    muzzleFlash.position.set(0,0,-0.9);weaponMesh.add(muzzleFlash);
    weaponMesh.position.set(0.22,-0.22,-0.35);
    viewGroup.add(weaponMesh);
  }
  function updateViewModel(){
    if(!weaponMesh)return;
    var visible=!!p.weapon&&p.alive;
    weaponMesh.visible=visible;
    if(!visible)return;
    var type=p.weapon.def.type;
    var scale=type==='sniper'?1.25:type==='smg'?0.9:type==='pistol'?0.75:1;
    weaponMesh.scale.setScalar(scale);
    if(scopeMesh)scopeMesh.visible=(type==='dmr'||type==='sniper');
  }
  function flashMuzzle(){
    if(!muzzleFlash)return;
    muzzleFlash.material.opacity=0.9;
    setTimeout(function(){if(muzzleFlash)muzzleFlash.material.opacity=0;},45);
  }

  // ---------- 每帧更新 ----------
  function update(dt,game){
    if(!p.alive)return;
    var s=Save.get();
    // 视角输入
    if(Input.isLocked()||game.touchMode){
      var sensMul=sens/8;
      p.yaw-=Input.mouse.dx*0.0022*sensMul + Input.touch.lookX*0.005*sensMul;
      p.pitch-=Input.mouse.dy*0.0022*sensMul + Input.touch.lookY*0.005*sensMul;
      p.pitch=U.clamp(p.pitch,-1.4,1.4);
    }
    Input.mouse.dx=0;Input.mouse.dy=0;Input.touch.lookX=0;Input.touch.lookY=0;

    // 姿态
    if(Input.pressed('KeyC'))p.crouch=!p.crouch;
    if((Input.pressed('KeyZ')||Input.pressed('ControlLeft')))p.prone=!p.prone;
    if(Input.pressed('KeyV'))toggleView();
    p.height=p.prone?0.7:p.crouch?1.15:1.7;

    // 移动输入
    var mx=0,mz=0;
    if(Input.down('KeyW'))mz+=1;if(Input.down('KeyS'))mz-=1;
    if(Input.down('KeyA'))mx-=1;if(Input.down('KeyD'))mx+=1;
    mx+=Input.touch.moveX;mz-=Input.touch.moveY;
    var mlen=Math.hypot(mx,mz);if(mlen>1){mx/=mlen;mz/=mlen;}

    // 冲刺
    var wantSprint=(Input.down('ShiftLeft')||Input.down('ShiftRight'))&&mz>0.3&&!p.crouch&&!p.prone&&!p.ads&&p.stam>5;
    p.sprint=wantSprint;
    var baseSpeed=(4.2+(s.skills.s_speed||0)*0.22);
    if(p.crouch)baseSpeed*=0.55;if(p.prone)baseSpeed*=0.3;
    if(p.sprint)baseSpeed*=1.65;
    if(p.status.fracture)baseSpeed*=0.65;
    if(p.status.bleed)baseSpeed*=0.9;

    // 体力
    if(p.sprint)p.stam=Math.max(0,p.stam-16*dt);else p.stam=Math.min(p.maxStam,p.stam+11*dt);

    // 世界方向移动（相机朝向 -Z：forward=(-sin,-cos)，right=(cos,-sin)）
    var cos=Math.cos(p.yaw),sin=Math.sin(p.yaw);
    var wx=(mx*cos-mz*sin)*baseSpeed;
    var wz=(-mx*sin-mz*cos)*baseSpeed;
    p.vel.x=U.lerp(p.vel.x,wx,Math.min(1,dt*12));
    p.vel.z=U.lerp(p.vel.z,wz,Math.min(1,dt*12));

    // 跳跃（地面高度支持屋顶）
    var groundY=World.groundHeightAt(p.pos.x,p.pos.z,p.pos.y)+p.height;
    if(Input.pressed('Space')&&p.onGround&&!p.prone){p.vy=6.2;p.onGround=false;Audio2.step();}
    p.vy-=18*dt;
    p.pos.y+=p.vy*dt;
    if(p.pos.y<=groundY){p.pos.y=groundY;p.vy=0;p.onGround=true;}

    // 碰撞 + 移动
    var nx=p.pos.x+p.vel.x*dt, nz=p.pos.z+p.vel.z*dt;
    var res=World.resolveCollision(nx,nz,0.42,p.pos.y-0.4,p.pos.y+0.4);
    p.pos.x=res.x;p.pos.z=res.z;
    var lim=108;p.pos.x=U.clamp(p.pos.x,-lim,lim);p.pos.z=U.clamp(p.pos.z,-lim,lim);

    // 脚步声/体力消耗
    var moved=Math.hypot(p.vel.x,p.vel.z)*dt;
    p.stepDist+=moved;
    if(p.stepDist>2.4&&p.onGround&&!p.crouch){p.stepDist=0;Audio2.step();game.makeNoise(p.pos.x,p.pos.z,p.sprint?26:15);}

    // 头部摇晃
    p.bob+=moved*(p.sprint?3.2:2.4);
    var bobY=Math.sin(p.bob*2)*0.025*(p.onGround?1:0);
    var bobX=Math.cos(p.bob)*0.015*(p.onGround?1:0);

    // 后坐力恢复
    p.recoilV*=-dt*8;p.recoil+=p.recoilV*dt;p.recoil=Math.max(0,p.recoil);
    p.spreadBloom=Math.max(0,p.spreadBloom-dt*1.6);

    // 瞄准（狙击/精确步枪高倍镜）
    var wantAds=Input.mouse.right||Input.touch.ads;
    p.ads=wantAds&&!p.sprint;
    p.adsT=U.lerp(p.adsT,p.ads?1:0,Math.min(1,dt*(p.isMarksman?8:10)));

    // 屏息（瞄准时按住 Shift 稳定准星，消耗体力）
    var marksman=p.weapon&&(p.weapon.def.type==='sniper'||p.weapon.def.type==='dmr');
    p.isMarksman=!!marksman;
    var wantBreath=p.ads&&marksman&&(Input.down('ShiftLeft')||Input.down('ShiftRight'))&&p.stam>2&&!p.bolt;
    p.breath=wantBreath;
    if(p.breath)p.stam=Math.max(0,p.stam-9*dt);
    // 瞄准晃动：屏息时几乎消失
    if(p.ads&&marksman){
      p.swayT+=dt;
      var swayAmt=p.breath?0.15:(1.0);
      p.swayX=Math.sin(p.swayT*1.7)*0.006*swayAmt+Math.sin(p.swayT*0.9)*0.003*swayAmt;
      p.swayY=Math.cos(p.swayT*1.3)*0.005*swayAmt;
    }else{p.swayX=U.lerp(p.swayX,0,Math.min(1,dt*8));p.swayY=U.lerp(p.swayY,0,Math.min(1,dt*8));}

    // 栓动拉栓（射击后需拉栓，R 可加速）
    if(p.bolt){
      p.boltT-=dt;
      if(Input.pressed('KeyR')&&p.boltT>0.35)p.boltT=0.35;
      if(p.boltT<=0){p.bolt=false;Audio2.beep(520,0.07,0.06);}
    }

    // 射击
    if(p.fireCooldown>0)p.fireCooldown-=dt;
    var wantFire=Input.mouse.left||Input.touch.fire;
    if(wantFire&&p.weapon&&!p.reloading&&!p.bolt&&p.fireCooldown<=0){
      fire(game);
    }
    if(!wantFire)p.firing=false;

    // 换弹
    if(Input.pressed('KeyR'))reload();
    if(p.reloading){
      p.reloadT-=dt;
      if(p.reloadT<=0)finishReload();
    }
    // 切弹种
    if(Input.pressed('KeyB')&&p.weapon){
      var types=['normal','ap','sub'];var i=types.indexOf(p.weapon.ammoType);
      p.weapon.ammoType=types[(i+1)%types.length];
      Toast.show('切换弹种：'+DATA.AMMO[p.weapon.ammoType].name);
      Audio2.beep(520,0.06,0.06);
      game.updateHUD();
    }
    // 切武器
    if(Input.pressed('Digit1'))switchWeapon(0);
    if(Input.pressed('Digit2'))switchWeapon(1);
    if(Input.pressed('Digit3'))switchWeapon(2);
    // 医疗
    if(Input.pressed('KeyH'))useMed(game);

    // 流血伤害
    if(p.status.bleed){
      p.lastDamage-=dt;
      if(p.lastDamage<=0){p.lastDamage=2;damage({part:'chest',amount:2,source:'bleed',game:game});}
    }
    // 休闲模式：脱战后缓慢自动回血（无流血状态、5 秒未受伤）
    if(!p.status.bleed&&p.hp>0&&p.hp<p.maxHp){
      p.regenDelay=Math.max(0,(p.regenDelay||0)-dt);
      if(p.regenDelay<=0)p.hp=Math.min(p.maxHp,p.hp+2.5*dt);
    }
    // 同步相机
    syncCamera(bobY,bobX);

    // 视图模型动画
    if(weaponMesh){
      var adsPos=p.adsT*0.18;
      weaponMesh.position.x=U.lerp(0.22,0.0,p.adsT);
      weaponMesh.position.y=U.lerp(-0.22+bobY,-0.14,p.adsT);
      weaponMesh.position.z=U.lerp(-0.35,-0.28,p.adsT);
      weaponMesh.rotation.x=p.recoil*1.2;
      weaponMesh.visible=p.firstPerson&&!!p.weapon;
    }
  }

  function syncCamera(bobY,bobX){
    camera.position.set(p.pos.x+(bobX||0),p.pos.y+(bobY||0),p.pos.z);
    var pitch=p.pitch-p.recoil+p.swayY;
    camera.rotation.order='YXZ';
    camera.rotation.y=p.yaw+p.swayX;camera.rotation.x=pitch;
    // 高倍镜缩放（狙击 4x / 精确 2x）
    var baseFov=(Save.get().settings.fov)||75;
    var zoom=1;
    if(p.weapon&&p.adsT>0){
      if(p.weapon.def.type==='sniper')zoom=4;
      else if(p.weapon.def.type==='dmr')zoom=2;
    }
    var targetFov=baseFov/zoom;
    if(Math.abs(camera.fov-targetFov)>0.05){
      camera.fov=U.lerp(camera.fov,targetFov,Math.min(1,(0.016)*14));
      camera.updateProjectionMatrix();
    }
  }

  // ---------- 射击 ----------
  function fire(game){
    var w=p.weapon;if(!w||p.reloading||p.bolt||p.fireCooldown>0)return;
    var def=w.def;
    var rpm=def.rpm;
    p.fireCooldown=60/rpm;
    if(w.mag<=0){Audio2.beep(180,0.05,0.08);reload();return;}
    w.mag--;
    p.firing=true;
    p.spreadBloom=Math.min(3,p.spreadBloom+0.5);
    // 后坐
    var rec=def.recoil*(1+p.adsT*(-0.3))*(1+(w.attachments.grip?w.attachments.grip.mods.recoil+1:1)-1);
    var ammo=DATA.AMMO[w.ammoType];
    var quiet=ammo.quiet||(w.attachments.muzzle&&w.attachments.muzzle.mods.quiet);
    Audio2.shot(def.type,quiet);
    flashMuzzle();
    p.recoilV+=rec*(p.ads?0.6:1);
    p.pitch=U.clamp(p.pitch+rec*0.25,-1.4,1.4);
    // 栓动步枪：射击后进入拉栓，准星剧烈上跳
    if(def.type==='sniper'||def.type==='dmr'){
      p.bolt=true;p.boltT=def.type==='sniper'?1.5:1.0;
      p.pitch=U.clamp(p.pitch+0.06,-1.4,1.4);
      game.killfeed('拉栓中… 按 R 加速');
    }

    // 噪声
    game.makeNoise(p.pos.x,p.pos.z,quiet?18:def.type==='shotgun'?70:def.type==='sniper'?90:60);

    // 射线（多弹丸）
    var dir=new THREE.Vector3();camera.getWorldDirection(dir);
    var baseSpread=def.spread*(1+p.spreadBloom*0.25)*(p.ads?0.35:1)*(p.status.pain?1.3:1);
    if(w.attachments.muzzle)baseSpread*=1+(w.attachments.muzzle.mods.spread||0);
    for(var b=0;b<def.pellets;b++){
      var d=dir.clone();
      d.x+=U.rand(-baseSpread,baseSpread);d.y+=U.rand(-baseSpread,baseSpread);d.z+=U.rand(-baseSpread,baseSpread);
      d.normalize();
      traceShot(game,d,def.dmg*ammo.dmg,ammo.pen,def.type);
    }
    game.updateHUD();
    if(w.mag===0)setTimeout(function(){if(p.weapon===w)reload();},200);
  }

  function traceShot(game,dir,dmg,pen,weaponType){
    var origin=camera.position.clone();
    var maxDist=(p.weapon?p.weapon.def.range:80)*1.5;
    // 弹道下坠：狙击枪远距离子弹会下坠，需抬高瞄准
    var dropPerSq=0;
    if(weaponType==='sniper')dropPerSq=0.0022;   // 约 220m 处下坠 ~1m
    else if(weaponType==='dmr')dropPerSq=0.0008;
    function dropAt(dist){return dropPerSq*dist*dist;}
    // 先查敌人（用下坠修正后的射线）
    var aimDir=dir.clone();
    if(dropPerSq>0){
      // 先粗测距离：用世界射线找最近遮挡
      var pre=World.raycast(origin,dir,maxDist);
      var refDist=pre.hit?pre.dist:Math.min(maxDist,150);
      aimDir.y-=dropAt(refDist)/refDist;
      aimDir.normalize();
    }
    var hitEnemy=null,enemyDist=Infinity;
    var targets=game.enemies.filter(function(e){return e.alive;});
    targets.forEach(function(e){
      var r=e.state==='prone'?0.5:0.85;
      var center=new THREE.Vector3(e.pos.x,e.pos.y+0.9,e.pos.z);
      var to=center.clone().sub(origin);
      var t=to.dot(aimDir);if(t<0||t>maxDist)return;
      var closest=origin.clone().add(aimDir.clone().multiplyScalar(t));
      // 按该距离的实际下坠校正命中点
      if(dropPerSq>0)closest.y-=dropAt(t);
      var dd=closest.distanceTo(center);
      if(dd<r&&t<enemyDist){enemyDist=t;hitEnemy=e;hitEnemy._hitPoint=closest.clone();}
    });
    // 世界障碍
    var wh=World.raycast(origin,aimDir,maxDist);
    if(wh.hit&&wh.dist<enemyDist){
      var impactPt=wh.point.clone();
      if(dropPerSq>0)impactPt.y-=dropAt(wh.dist);
      game.spawnImpact(impactPt,wh.obj);
      return;
    }
    if(hitEnemy){
      // 判定部位
      var hp=hitEnemy._hitPoint.y-hitEnemy.pos.y;
      var part=hp>1.5?'head':hp>0.9?'chest':hp>0.5?'arm':'leg';
      var mult=DATA.BODY[part].mult;
      // 穿甲
      var armor=part==='head'?hitEnemy.typeDef.armor:Math.max(hitEnemy.typeDef.armor,p.helmet?0:0);
      var reduce=0;
      if(armor>0){var arr=DATA.ARMOR[armor].pen||[];reduce=arr[Math.min(Math.floor(pen*arr.length),arr.length-1)]||0;}
      var final=dmg*mult*(1-reduce);
      hitEnemy.takeDamage(final,part,game);
      game.onHit(part,final,hitEnemy);
      if(part==='head')p.headshots++;
      Audio2.hit(!hitEnemy.alive);
    } else {
      // 打空：远处弹着
      game.spawnImpact(origin.clone().add(dir.clone().multiplyScalar(Math.min(maxDist,120))),null);
    }
  }

  function reload(){
    if(!p.weapon||p.reloading)return;
    var w=p.weapon;
    if(w.mag>=w.def.mag||w.reserve<=0)return;
    p.reloading=true;
    p.reloadT=w.def.type==='sniper'?2.4:1.9;
    Audio2.beep(300,0.06,0.05);
  }
  function finishReload(){
    var w=p.weapon;if(!w){p.reloading=false;return;}
    var need=w.def.mag-w.mag;
    var take=Math.min(need,w.reserve);
    w.mag+=take;w.reserve-=take;p.reloading=false;
    Audio2.beep(420,0.08,0.06);
  }
  function switchWeapon(slot){
    if(slot>=p.weapons.length)return;
    if(p.activeSlot===slot)return;
    p.activeSlot=slot;p.weapon=p.weapons[slot];
    p.reloading=false;updateViewModel();
    Audio2.beep(380,0.06,0.05);
  }

  // ---------- 受伤 ----------
  function damage(o){
    if(!p.alive)return;
    var game=o.game;
    var amount=o.amount||0;
    // 护甲减伤（身体）
    if(o.part!=='bleed'&&o.source!=='bleed'){
      var armor=p.armor;
      if(o.part==='head'&&p.helmet>armor)armor=p.helmet;
      if(armor>0){
        var protect=DATA.ARMOR[armor].protect;
        amount*=(1-protect*0.5);
      }
    }
    p.hp-=amount;
    p.regenDelay=5; // 受伤后 5 秒内不回血
    if(o.part&&p.parts[o.part]!==undefined){
      p.parts[o.part]=Math.max(0,p.parts[o.part]-amount*0.6);
      if(p.parts[o.part]<=0&&o.part==='leg'&&!p.status.fracture){p.status.fracture=true;Toast.show('腿部受伤：移动速度下降','bad');}
      if(p.parts[o.part]<=25&&o.part==='arm'&&!p.status.pain){p.status.pain=true;Toast.show('手臂受伤：瞄准抖动','bad');}
    }
    // 出血
    if(o.source!=='bleed'&&amount>8&&U.chance(0.25)&&!p.status.bleed){p.status.bleed=true;Toast.show('你正在出血！使用止血绷带','bad');}
    // 屏幕反馈
    var flash=$('damage-flash');flash.style.opacity=Math.min(0.9,0.3+amount/40);
    setTimeout(function(){flash.style.opacity=0;},160);
    if(game)game.onPlayerDamaged(amount);
    if(p.hp<=0){p.hp=0;p.alive=false;if(game)game.onPlayerDeath();}
  }

  // ---------- 医疗 ----------
  function useMed(game){
    // 自动选择合适的医疗品
    var inv=game.inventory;
    var choice=null;
    if(p.status.bleed&&inv.meds.m_bandage>0)choice='m_bandage';
    else if(p.status.fracture&&inv.meds.m_splint>0)choice='m_splint';
    else if(p.status.pain&&inv.meds.m_painkill>0)choice='m_painkill';
    else if(p.hp<p.maxHp-15&&inv.meds.m_medkit>0)choice='m_medkit';
    else if(p.hp<p.maxHp-30&&inv.meds.m_surgery>0)choice='m_surgery';
    if(!choice){Toast.show('没有适用的医疗品','bad');return;}
    if(p.usedMed)return;
    var def=DATA.MEDS[choice];
    p.usedMed=choice;p.medT=def.time;
    inv.meds[choice]--;
    Toast.show('使用 '+def.name+'（'+def.time+'秒）');
  }

  function updateMed(dt){
    if(!p.usedMed)return;
    p.medT-=dt;
    if(p.medT>0)return;
    var def=DATA.MEDS[p.usedMed];
    switch(def.use){
      case 'bleed':p.status.bleed=false;break;
      case 'fracture':p.status.fracture=false;break;
      case 'pain':p.status.pain=false;break;
      case 'heal':p.hp=Math.min(p.maxHp,p.hp+(def.heal||50));p.parts={head:100,chest:100,arm:100,leg:100};break;
      case 'surgery':p.hp=Math.min(p.maxHp,p.hp+(def.heal||100));p.parts={head:100,chest:100,arm:100,leg:100};
        p.status={bleed:false,pain:false,fracture:false};break;
    }
    Toast.show(def.name+' 使用完成','good');Audio2.beep(620,0.12,0.08);
    p.usedMed=null;
  }

  function toggleView(){
    p.firstPerson=!p.firstPerson;
    if(weaponMesh)weaponMesh.visible=p.firstPerson;
    Toast.show(p.firstPerson?'第一人称':'第三人称');
  }

  function addWeapon(id,ammoType){
    if(p.weapons.length>=3){Toast.show('武器槽已满','bad');return false;}
    p.weapons.push(makeWeapon(id,ammoType||'normal',1));
    return true;
  }

  return {p:p,init:init,reset:reset,update:update,damage:damage,useMed:useMed,updateMed:updateMed,
    reload:reload,fire:fire,switchWeapon:switchWeapon,addWeapon:addWeapon,toggleView:toggleView,
    syncCamera:syncCamera,flashMuzzle:flashMuzzle,makeWeapon:makeWeapon,setSens:setSens};
})();

/* ---------------- 战术 AI 敌人 ---------------- */
var EnemyManager = (function(){
  var list=[];
  var scene;
  var bodyGeo=new THREE.BoxGeometry(0.7,1.4,0.5);
  var headGeo=new THREE.SphereGeometry(0.24,10,8);
  var gunGeo=new THREE.BoxGeometry(0.08,0.08,0.6);

  function init(sc){scene=sc;}

  function spawnAll(difficulty){
    list=[];
    var rng=mulberryLocal(Math.floor(Date.now()%10000));
    DATA.MAP.zones.forEach(function(z){
      if(z.type==='open')return;
      for(var i=0;i<z.enemies;i++){
        var px=z.x+(rng()-0.5)*(z.w-8),pz=z.z+(rng()-0.5)*(z.d-8);
        var type=chooseType(z,rng,difficulty);
        spawn(type,px,pz);
      }
    });
    // 精英守卫较少（休闲平衡：仅行政楼一只，概率降低）
    [[20,-60]].forEach(function(p){if(U.chance(0.35))spawn('elite',p[0]+U.rand(-6,6),p[1]+U.rand(-6,6));});
  }

  function chooseType(z,rng,diff){
    var r=rng();
    if(z.id==='admin'||z.id==='lab')return r<0.15?'elite':'militant';
    if(r<0.45)return 'raider';
    return 'militant';
  }

  function spawn(typeId,x,z){
    var td=DATA.ENEMY_TYPES[typeId];
    var group=new THREE.Group();
    var mat=new THREE.MeshStandardMaterial({color:td.color,roughness:0.85});
    var body=new THREE.Mesh(bodyGeo,mat);body.position.y=0.9;body.castShadow=true;group.add(body);
    var head=new THREE.Mesh(headGeo,new THREE.MeshStandardMaterial({color:0x9a8065,roughness:0.9}));
    head.position.y=1.85;head.castShadow=true;group.add(head);
    var gun=new THREE.Mesh(gunGeo,new THREE.MeshStandardMaterial({color:0x222,metalness:0.6}));
    gun.position.set(0.3,1.1,-0.4);group.add(gun);
    // 护甲片
    var vest=new THREE.Mesh(new THREE.BoxGeometry(0.72,0.6,0.55),new THREE.MeshStandardMaterial({color:0x2e352e,roughness:0.7}));
    vest.position.y=1.15;group.add(vest);
    group.position.set(x,0,z);scene.add(group);

    var e={
      typeId:typeId,typeDef:td,group:group,mesh:body,headMesh:head,
      pos:new THREE.Vector3(x,0,z),vel:new THREE.Vector3(),
      hp:td.hp,maxHp:td.hp,armor:td.armor,alive:true,
      state:'patrol',stateT:0,alert:0,
      yaw:U.rand(0,Math.PI*2),
      patrolTarget:new THREE.Vector3(x,0,z),
      fireCooldown:U.rand(0.5,2), burst:0,
      coverPoint:null, lastSeen:null, talkCooldown:0,
      takeDamage:function(amount,part,game){
        if(!this.alive)return;
        // 敌人护甲减伤
        var reduce=0;
        if(this.armor>0){var arr=DATA.ARMOR[this.armor].pen||[];reduce=arr[0]||0;}
        this.hp-=amount*(1-reduce*0.4);
        this.alert=1;this.lastSeen={x:Player.p.pos.x,z:Player.p.pos.z};
        this.state='combat';this.stateT=0;
        if(this.hp<=0)this.die(game);
      },
      die:function(game){
        this.alive=false;
        this.group.rotation.z=Math.PI/2;
        this.group.position.y=0.3;
        if(game)game.onEnemyKilled(this);
        setTimeout(function(){if(this.group.parent)this.group.parent.remove(this.group);}.bind(this),20000);
      }
    };
    list.push(e);
    return e;
  }

  function update(dt,game){
    var pp=Player.p;
    list.forEach(function(e){
      if(!e.alive)return;
      e.stateT+=dt;e.fireCooldown-=dt;e.talkCooldown-=dt;
      var dx=pp.pos.x-e.pos.x,dz=pp.pos.z-e.pos.z;
      var dist=Math.hypot(dx,dz);
      var canSee=false;
      if(pp.alive&&dist<e.typeDef.sight){
        // 视锥 + 遮挡
        var toPlayer=Math.atan2(dz,dx);
        var angDiff=Math.abs(((toPlayer-e.yaw+Math.PI)%(Math.PI*2))-Math.PI);
        if(angDiff<1.2||e.alert>0.3){
          var origin=new THREE.Vector3(e.pos.x,1.5,e.pos.z);
          var dir=new THREE.Vector3(pp.pos.x-e.pos.x,(pp.pos.y+0.9)-1.5,pp.pos.z-e.pos.z).normalize();
          var wh=World.raycast(origin,dir,dist);
          if(!wh.hit||wh.dist>=dist-1)canSee=true;
        }
      }
      // 听觉
      if(game.noiseEvents.length>0&&e.alert<0.8){
        game.noiseEvents.forEach(function(n){
          var nd=U.dist(e.pos.x,e.pos.z,n.x,n.z);
          if(nd<n.radius){e.alert=Math.max(e.alert,0.5);e.lastSeen={x:n.x,z:n.z};}
        });
      }
      if(canSee){
        e.alert=Math.min(1,e.alert+dt*1.5);
        e.lastSeen={x:pp.pos.x,z:pp.pos.z};
      }else{
        e.alert=Math.max(0,e.alert-dt*0.15);
      }

      // 状态机
      if(e.alert>=0.85){
        if(e.state!=='combat'){e.state='combat';e.stateT=0;}
      }else if(e.alert>0.3){
        if(e.state!=='search'){e.state='search';e.stateT=0;}
      }else{
        if(e.state!=='patrol'){e.state='patrol';e.stateT=0;}
      }

      // 呼叫支援
      if(e.state==='combat'&&e.talkCooldown<=0){
        e.talkCooldown=8;
        callSupport(e,list,game);
      }

      var moveTarget=null,runSpeed=e.typeDef.speed;
      if(e.state==='combat'){
        // 找掩体
        if(!e.coverPoint||e.stateT>3){
          e.coverPoint=findCover(e,pp,list);
          e.stateT=0;
        }
        if(e.coverPoint){
          moveTarget=e.coverPoint;
          // 到掩体后探头射击
          if(U.dist(e.pos.x,e.pos.z,e.coverPoint.x,e.coverPoint.z)<1.5){
            moveTarget=null;
          }
        }
        // 包抄：部分敌人侧翼移动
        if(e.typeId==='militant'&&U.chance(dt*0.15)&&!e.flank){
          e.flank={x:pp.pos.x+U.rand(-14,14),z:pp.pos.z+U.rand(-14,14)};
          setTimeout(function(){e.flank=null;},6000);
        }
        if(e.flank)moveTarget=e.flank;
        // 低血量撤退
        if(e.hp<e.maxHp*0.3){
          if(!e.retreat){
            e.retreat={x:e.pos.x+(e.pos.x-pp.pos.x)*0.4,z:e.pos.z+(e.pos.z-pp.pos.z)*0.4};
            game.killfeed(e.typeDef.name+' 撤退中');
          }
          moveTarget=e.retreat;runSpeed*=1.2;
        }
        // 射击
        if(canSee&&e.fireCooldown<=0&&U.dist(e.pos.x,e.pos.z,pp.pos.x,pp.pos.z)<e.typeDef.range){
          enemyShoot(e,game);
          e.fireCooldown=60/(e.typeId==='elite'?260:200)*U.rand(1.0,1.6);
        }
      }else if(e.state==='search'){
        moveTarget=e.lastSeen;runSpeed*=0.7;
        if(U.dist(e.pos.x,e.pos.z,e.lastSeen.x,e.lastSeen.z)<2)e.alert=Math.max(0,e.alert-dt*0.5);
      }else{
        // 巡逻
        if(U.dist(e.pos.x,e.pos.z,e.patrolTarget.x,e.patrolTarget.z)<2){
          e.patrolTarget.set(e.pos.x+U.rand(-18,18),0,e.pos.z+U.rand(-18,18));
        }
        moveTarget=e.patrolTarget;runSpeed*=0.5;
      }

      // 移动
      if(moveTarget){
        var mdx=moveTarget.x-e.pos.x,mdz=moveTarget.z-e.pos.z;
        var mlen=Math.hypot(mdx,mdz);
        if(mlen>0.5){
          var vx=mdx/mlen*runSpeed,vz=mdz/mlen*runSpeed;
          var nx=e.pos.x+vx*dt,nz=e.pos.z+vz*dt;
          var res=World.resolveCollision(nx,nz,0.5,0,2);
          e.pos.x=res.x;e.pos.z=res.z;
          e.yaw=U.angleLerp(e.yaw,Math.atan2(mdz,mdx),dt*4);
        }
      }else if(canSee){
        e.yaw=U.angleLerp(e.yaw,Math.atan2(dz,dx),dt*6);
      }
      e.group.position.set(e.pos.x,e.group.position.y,e.pos.z);
      e.group.rotation.y=-e.yaw+Math.PI/2;
      // 视野指示（高处可见）
      if(e.state==='combat')e.headMesh.material.emissive=new THREE.Color(0x330000);
    });
  }

  function enemyShoot(e,game){
    var pp=Player.p;
    var origin=new THREE.Vector3(e.pos.x,1.3,e.pos.z);
    var target=new THREE.Vector3(pp.pos.x,pp.pos.y-0.2,pp.pos.z);
    var dir=target.sub(origin).normalize();
    var acc=e.typeDef.accuracy;
    dir.x+=U.rand(-1,1)*(1-acc)*0.3;dir.y+=U.rand(-1,1)*(1-acc)*0.2;dir.z+=U.rand(-1,1)*(1-acc)*0.3;
    dir.normalize();
    // 检查视线
    var wh=World.raycast(origin,dir,U.dist(e.pos.x,e.pos.z,pp.pos.x,pp.pos.z)+2);
    if(wh.hit&&wh.dist<U.dist(e.pos.x,e.pos.z,pp.pos.x,pp.pos.z)-1)return;
    var dmg=e.typeDef.dmg;
    Player.damage({part:U.pick(['chest','chest','arm','leg','head']),amount:dmg,source:'enemy',game:game});
    game.spawnTracer(origin,origin.clone().add(dir.clone().multiplyScalar(30)));
    game.makeNoise(e.pos.x,e.pos.z,40);
  }

  function callSupport(e,list,game){
    var helped=0;
    list.forEach(function(o){
      if(o===e||!o.alive||helped>=2)return;
      var d=U.dist(o.pos.x,o.pos.z,e.pos.x,e.pos.z);
      if(d<50&&o.alert<0.5){
        o.alert=0.7;o.lastSeen={x:Player.p.pos.x,z:Player.p.pos.z};
        game.killfeed(o.typeDef.name+' 已被呼叫支援');
        helped++;
      }
    });
  }

  function findCover(e,pp,list){
    var best=null,bestScore=-Infinity;
    var toPlayer=Math.atan2(pp.pos.z-e.pos.z,pp.pos.x-e.pos.x);
    for(var i=0;i<10;i++){
      var a=toPlayer+U.rand(-2,2),r=U.rand(4,12);
      var cx=e.pos.x+Math.cos(a)*r,cz=e.pos.z+Math.sin(a)*r;
      // 找掩体物体
      var covers=World.getColliders().filter(function(c){
        return cx>c.minX-2&&cx<c.maxX+2&&cz>c.minZ-2&&cz<c.maxZ+2&&(c.maxY-c.minY)>0.8;
      });
      if(covers.length===0)continue;
      var c=covers[0];
      // 掩体应在敌人与玩家之间
      var px=(c.minX+c.maxX)/2,pz=(c.minZ+c.maxZ)/2;
      var toCover={x:px-e.pos.x,z:pz-e.pos.z};
      var dot=toCover.x*Math.cos(toPlayer)+toCover.z*Math.sin(toPlayer);
      var score=dot-U.dist(px,pz,pp.pos.x,pp.pos.z)*0.2;
      if(score>bestScore){bestScore=score;best={x:px+(e.pos.x-px)*0.7,z:pz+(e.pos.z-pz)*0.7};}
    }
    return best||null;
  }

  function mulberryLocal(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}

  function getAlive(){return list.filter(function(e){return e.alive;});}
  function clear(){list.forEach(function(e){if(e.group.parent)e.group.parent.remove(e.group);});list=[];}
  function count(){return list.filter(function(e){return e.alive;}).length;}
  function elitesKilled(){return list.filter(function(e){return !e.alive&&e.typeId==='elite';}).length;}

  return {init:init,spawnAll:spawnAll,update:update,getList:function(){return list;},getAlive:getAlive,
    clear:clear,count:count,elitesKilled:elitesKilled};
})();
