/* ===================================================================
 * core.js — 工具函数、音频、存档、输入管理
 * =================================================================== */

// ---------- 数学/通用工具 ----------
var U = {
  clamp:function(v,a,b){return Math.max(a,Math.min(b,v));},
  lerp:function(a,b,t){return a+(b-a)*t;},
  rand:function(a,b){return a+Math.random()*(b-a);},
  randInt:function(a,b){return Math.floor(a+Math.random()*(b-a+1));},
  pick:function(arr){return arr[Math.floor(Math.random()*arr.length)];},
  chance:function(p){return Math.random()<p;},
  dist:function(ax,az,bx,bz){return Math.hypot(ax-bx,az-bz);},
  angleLerp:function(a,b,t){var d=((b-a+Math.PI)%(Math.PI*2))-Math.PI;return a+d*t;},
  fmtTime:function(s){s=Math.max(0,Math.floor(s));var m=Math.floor(s/60);var ss=s%60;return (m<10?'0':'')+m+':'+(ss<10?'0':'')+ss;},
  uid:function(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);},
  now:function(){return performance.now()/1000;}
};

// ---------- $. 选择器 ----------
function $(id){return document.getElementById(id);}
function show(id){var e=$(id);if(e)e.classList.remove('hidden');}
function hide(id){var e=$(id);if(e)e.classList.add('hidden');}
function el(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;}

// ---------- Toast ----------
var Toast = {
  show:function(msg,type,dur){
    var t=el('div','toast'+(type?' '+type:''),msg);
    $('toast-layer').appendChild(t);
    setTimeout(function(){t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(function(){t.remove();},320);},dur||2200);
  }
};

// ---------- 音频（Web Audio 合成，无外部资源）----------
var Audio2 = (function(){
  var ctx=null, master=null, volume=0.6;
  function init(){
    if(ctx)return;
    try{
      ctx=new (window.AudioContext||window.webkitAudioContext)();
      master=ctx.createGain();master.gain.value=volume;master.connect(ctx.destination);
    }catch(e){ctx=null;}
  }
  function resume(){if(ctx&&ctx.state==='suspended')ctx.resume();}
  function setVolume(v){volume=v;if(master)master.gain.value=v;}
  // 噪声缓冲
  var noiseBuf=null;
  function getNoise(){
    if(noiseBuf)return noiseBuf;
    var len=ctx.sampleRate*1;noiseBuf=ctx.createBuffer(1,len,ctx.sampleRate);
    var d=noiseBuf.getChannelData(0);for(var i=0;i<len;i++)d[i]=Math.random()*2-1;
    return noiseBuf;
  }
  // 枪声
  function shot(type,quiet){
    if(!ctx)return;resume();
    var now=ctx.currentTime;
    var src=ctx.createBufferSource();src.buffer=getNoise();
    var filter=ctx.createBiquadFilter();filter.type='lowpass';
    var gain=ctx.createGain();
    var base=type==='pistol'?1200:type==='shotgun'?700:type==='sniper'?900:1400;
    filter.frequency.setValueAtTime(base,now);
    filter.frequency.exponentialRampToValueAtTime(180,now+0.14);
    var vol=quiet?0.12:0.32;
    gain.gain.setValueAtTime(vol,now);
    gain.gain.exponentialRampToValueAtTime(0.001,now+(quiet?0.1:0.18));
    src.connect(filter);filter.connect(gain);gain.connect(master);
    src.start(now);src.stop(now+0.2);
    // 低频冲击
    var osc=ctx.createOscillator();var og=ctx.createGain();
    osc.frequency.setValueAtTime(quiet?90:130,now);
    osc.frequency.exponentialRampToValueAtTime(40,now+0.1);
    og.gain.setValueAtTime(quiet?0.05:0.18,now);
    og.gain.exponentialRampToValueAtTime(0.001,now+0.12);
    osc.connect(og);og.connect(master);osc.start(now);osc.stop(now+0.13);
  }
  // 命中/受击
  function hit(kill){
    if(!ctx)return;
    var now=ctx.currentTime;
    var osc=ctx.createOscillator();var g=ctx.createGain();
    osc.type='square';
    osc.frequency.setValueAtTime(kill?180:520,now);
    osc.frequency.exponentialRampToValueAtTime(kill?80:300,now+0.06);
    g.gain.setValueAtTime(0.12,now);g.gain.exponentialRampToValueAtTime(0.001,now+0.08);
    osc.connect(g);g.connect(master);osc.start(now);osc.stop(now+0.09);
  }
  // 通用提示音
  function beep(freq,dur,vol){
    if(!ctx)return;resume();
    var now=ctx.currentTime;var osc=ctx.createOscillator();var g=ctx.createGain();
    osc.type='sine';osc.frequency.value=freq||440;
    g.gain.setValueAtTime(vol||0.1,now);g.gain.exponentialRampToValueAtTime(0.001,now+(dur||0.1));
    osc.connect(g);g.connect(master);osc.start(now);osc.stop(now+(dur||0.1)+0.02);
  }
  // 脚步
  function step(){
    if(!ctx)return;
    var now=ctx.currentTime;var src=ctx.createBufferSource();src.buffer=getNoise();
    var f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=350;
    var g=ctx.createGain();g.gain.setValueAtTime(0.05,now);g.gain.exponentialRampToValueAtTime(0.001,now+0.08);
    src.connect(f);f.connect(g);g.connect(master);src.start(now);src.stop(now+0.09);
  }
  // 环境氛围（低频嗡鸣）
  var ambience=null;
  function startAmbience(){
    if(!ctx||ambience)return;
    var osc=ctx.createOscillator();var g=ctx.createGain();
    osc.type='sine';osc.frequency.value=55;
    g.gain.value=0.03;osc.connect(g);g.connect(master);osc.start();
    ambience={osc:osc,gain:g};
  }
  function stopAmbience(){if(ambience){try{ambience.osc.stop();}catch(e){}ambience=null;}}
  return {init:init,resume:resume,setVolume:setVolume,shot:shot,hit:hit,beep:beep,step:step,
    startAmbience:startAmbience,stopAmbience:stopAmbience};
})();

// ---------- 存档系统 ----------
var Save = (function(){
  var KEY='wangyixuan_breakout_save_v1';
  var def=function(){
    return {
      cash:600, level:1, xp:0,
      skills:{s_health:0,s_dmg:0,s_speed:0,s_stam:0,s_scav:0},
      stash:[ // 初始库存：{id,qty}
        {id:'w_pistol',qty:1},{id:'w_smg',qty:1},{id:'w_sniper',qty:1},
        {id:'box_normal',qty:2},{id:'box_ap',qty:1},
        {id:'m_bandage',qty:3},{id:'m_medkit',qty:1},
        {id:'g_vest1',qty:1},{id:'a_grip',qty:1},{id:'a_muzzle',qty:1},{id:'a_scope4',qty:1}
      ],
      loadout:{weapon:'w_pistol',ammoType:'normal',mags:2,meds:{m_bandage:2,m_medkit:1},armor:'g_vest1',helmet:null},
      quests:{q1:0,q2:0,q3:0,q4:0},questsDone:[],
      stats:{extracts:0,deaths:0,kills:0,elites:0,loot:0,totalCash:0},
      version:2,
      settings:{quality:'medium',fov:75,sens:8,volume:60,control:'auto'}
    };
  };
  var data=null;
  function load(){
    try{
      var raw=localStorage.getItem(KEY);
      data=raw?JSON.parse(raw):def();
    }catch(e){data=def();}
    // 补齐字段
    var d=def();
    for(var k in d)if(data[k]===undefined)data[k]=d[k];
    for(var s in d.skills)if(data.skills[s]===undefined)data.skills[s]=0;
    // 版本迁移：v1 老存档补发狙击枪套装
    if(!data.version||data.version<2){
      ['w_sniper','box_ap','a_scope4'].forEach(function(id){
        if(!data.stash.some(function(x){return x.id===id;}))data.stash.push({id:id,qty:id==='w_sniper'?1:id==='box_ap'?1:1});
      });
      data.version=2;save();
    }
    return data;
  }
  function save(){try{localStorage.setItem(KEY,JSON.stringify(data));}catch(e){}}
  function reset(){data=def();save();}
  function get(){return data||load();}
  // 库存操作
  function addItem(id,qty){
    qty=qty||1;var s=get();
    var found=s.stash.find(function(x){return x.id===id;});
    if(found)found.qty+=qty;else s.stash.push({id:id,qty:qty});
    save();
  }
  function removeItem(id,qty){
    qty=qty||1;var s=get();
    var found=s.stash.find(function(x){return x.id===id;});
    if(!found)return false;
    found.qty-=qty;if(found.qty<=0)s.stash=s.stash.filter(function(x){return x!==found;});
    save();return true;
  }
  function hasItem(id,qty){var s=get();var f=s.stash.find(function(x){return x.id===id;});return f&&f.qty>=(qty||1);}
  function itemQty(id){var s=get();var f=s.stash.find(function(x){return x.id===id;});return f?f.qty:0;}
  function addCash(v){var s=get();s.cash+=v;if(v>0)s.stats.totalCash+=v;save();}
  function addXP(v){
    var s=get();s.xp+=v;
    var need=s.level*300;
    while(s.xp>=need){s.xp-=need;s.level++;need=s.level*300;Toast.show('等级提升！当前等级 '+s.level,'good');Audio2.beep(660,0.3,0.15);}
    save();
  }
  return {load:load,save:save,reset:reset,get:get,addItem:addItem,removeItem:removeItem,
    hasItem:hasItem,itemQty:itemQty,addCash:addCash,addXP:addXP};
})();

// ---------- 输入管理 ----------
var Input = (function(){
  var keys={}, justPressed={};
  var mouse={dx:0,dy:0,left:false,right:false,leftJust:false,rightJust:false};
  var locked=false, enabled=false;
  var touch={moveX:0,moveY:0,lookX:0,lookY:0,fire:false,ads:false};

  function onKey(e,down){
    var k=e.code||e.key;
    if(down&&!keys[k])justPressed[k]=true;
    keys[k]=down;
    if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(k)>=0)e.preventDefault();
  }
  window.addEventListener('keydown',function(e){onKey(e,true);});
  window.addEventListener('keyup',function(e){onKey(e,false);});

  document.addEventListener('mousemove',function(e){
    if(locked&&enabled){mouse.dx+=e.movementX||0;mouse.dy+=e.movementY||0;}
  });
  document.addEventListener('mousedown',function(e){
    if(!enabled||!locked)return;
    if(e.button===0){mouse.left=true;mouse.leftJust=true;}
    if(e.button===2){mouse.right=true;mouse.rightJust=true;}
  });
  document.addEventListener('mouseup',function(e){
    if(e.button===0)mouse.left=false;if(e.button===2)mouse.right=false;
  });
  document.addEventListener('contextmenu',function(e){e.preventDefault();});

  function requestLock(canvas){
    if(canvas.requestPointerLock)canvas.requestPointerLock();
  }
  function exitLock(){if(document.exitPointerLock)document.exitPointerLock();}
  document.addEventListener('pointerlockchange',function(){
    locked=(document.pointerLockElement===($('game-canvas')));
  });

  function clearJust(){justPressed={};mouse.leftJust=false;mouse.rightJust=false;}
  function setEnabled(v){enabled=v;if(!v){mouse.left=false;mouse.right=false;}}
  function isLocked(){return locked;}

  return {
    keys:keys,justPressed:justPressed,mouse:mouse,touch:touch,
    clearJust:clearJust,setEnabled:setEnabled,requestLock:requestLock,exitLock:exitLock,isLocked:isLocked,
    down:function(k){return !!keys[k];},
    pressed:function(k){return !!justPressed[k];}
  };
})();

// ---------- 输入设备检测 ----------
var IS_TOUCH = (('ontouchstart' in window)||navigator.maxTouchPoints>0);
