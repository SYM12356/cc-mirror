/* ===================================================================
 * world.js — 程序化生成虚构「云杉学院」地图、光照、碰撞、小地图
 * =================================================================== */
var World = (function(){
  'use strict';
  var scene,camera,renderer;
  var colliders=[];        // {minX,maxX,minZ,maxZ,minY,maxY, mesh}  轴对齐盒碰撞
  var lootSpots=[];        // 搜刮点 {x,z,y,type,mesh,used}
  var extractMeshes={};    // 撤离点视觉
  var leverMeshes={};
  var worldLadder=null;
  var quality='medium';
  var buildingGroup;

  // ---------- 程序化纹理 ----------
  function hexToRgb(hex){return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
  function makeNoiseTexture(size,base,spread,grid){
    var c=document.createElement('canvas');c.width=c.height=size;
    var ctx=c.getContext('2d');
    var rgb=hexToRgb(base);
    ctx.fillStyle=base;ctx.fillRect(0,0,size,size);
    // 多尺度噪点：细颗粒 + 中尺度斑块
    for(var i=0;i<size*size*0.5;i++){
      var g=Math.floor((Math.random()-0.5)*spread);
      var col='rgba('+U.clamp(rgb[0]+g,0,255)+','+U.clamp(rgb[1]+g,0,255)+','+U.clamp(rgb[2]+g,0,255)+','+(0.15+Math.random()*0.25).toFixed(2)+')';
      ctx.fillStyle=col;ctx.fillRect(Math.random()*size,Math.random()*size,1+(Math.random()*2|0),1+(Math.random()*2|0));
    }
    for(var p=0;p<size*0.5;p++){
      var pg=Math.floor((Math.random()-0.5)*spread*1.4);
      ctx.fillStyle='rgba('+U.clamp(rgb[0]+pg,0,255)+','+U.clamp(rgb[1]+pg,0,255)+','+U.clamp(rgb[2]+pg,0,255)+',0.10)';
      var pr=4+Math.random()*14;
      ctx.beginPath();ctx.arc(Math.random()*size,Math.random()*size,pr,0,Math.PI*2);ctx.fill();
    }
    if(grid){
      ctx.strokeStyle='rgba(0,0,0,0.16)';ctx.lineWidth=1;
      for(var g2=0;g2<size;g2+=16){ctx.beginPath();ctx.moveTo(g2,0);ctx.lineTo(g2,size);ctx.stroke();
        ctx.beginPath();ctx.moveTo(0,g2);ctx.lineTo(size,g2);ctx.stroke();}
    }
    var tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    return tex;
  }
  // 道路标线纹理（虚线中心线 + 边缘磨损）
  function makeRoadTexture(size){
    var c=document.createElement('canvas');c.width=size;c.height=size;
    var ctx=c.getContext('2d');
    ctx.fillStyle='#3a3e3c';ctx.fillRect(0,0,size,size);
    for(var i=0;i<size*size*0.4;i++){
      var v=Math.floor(Math.random()*24);
      ctx.fillStyle='rgba('+(58+v)+','+(62+v)+','+(60+v)+',0.3)';
      ctx.fillRect(Math.random()*size,Math.random()*size,2,2);
    }
    // 中央黄色虚线
    ctx.fillStyle='rgba(196,164,72,0.85)';
    for(var y=0;y<size;y+=48)ctx.fillRect(size/2-2,y,4,26);
    var tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    return tex;
  }
  // 天空渐变球纹理
  function makeSkyTexture(){
    var c=document.createElement('canvas');c.width=8;c.height=256;
    var ctx=c.getContext('2d');
    var grad=ctx.createLinearGradient(0,0,0,256);
    grad.addColorStop(0,'#25323f');   // 天顶
    grad.addColorStop(0.45,'#4a5a63');
    grad.addColorStop(0.72,'#7d8a86'); // 地平线
    grad.addColorStop(0.86,'#9a927c');
    grad.addColorStop(1,'#5a5f57');    // 地面反光
    ctx.fillStyle=grad;ctx.fillRect(0,0,8,256);
    var tex=new THREE.CanvasTexture(c);
    return tex;
  }

  var MAT={};
  function buildMaterials(){
    var ground=makeNoiseTexture(256,'#3c4636',30,false);ground.repeat.set(34,34);
    var concrete=makeNoiseTexture(128,'#72756e',24,true);concrete.repeat.set(2,2);
    var wall=makeNoiseTexture(128,'#9a9486',20,false);wall.repeat.set(2,1);
    var brick=makeNoiseTexture(128,'#7a6050',24,true);brick.repeat.set(3,2);
    var wood=makeNoiseTexture(128,'#5f4a34',18,false);wood.repeat.set(1,1);
    var metal=makeNoiseTexture(128,'#525b5e',18,true);metal.repeat.set(1,1);
    var sandbag=makeNoiseTexture(128,'#7b7352',22,false);sandbag.repeat.set(2,1);
    var road=makeRoadTexture(128);road.repeat.set(1,14);
    MAT.ground=new THREE.MeshStandardMaterial({map:ground,roughness:1,color:0xffffff});
    MAT.asphalt=new THREE.MeshStandardMaterial({map:road,roughness:0.94,color:0x8a908b});
    MAT.roadPlain=new THREE.MeshStandardMaterial({map:ground,roughness:0.95,color:0x6d736e});
    MAT.concrete=new THREE.MeshStandardMaterial({map:concrete,roughness:0.92});
    MAT.wall=new THREE.MeshStandardMaterial({map:wall,roughness:0.9,color:0xbdb5a4});
    MAT.brick=new THREE.MeshStandardMaterial({map:brick,roughness:0.95});
    MAT.wood=new THREE.MeshStandardMaterial({map:wood,roughness:0.85});
    MAT.metal=new THREE.MeshStandardMaterial({map:metal,roughness:0.55,metalness:0.45});
    MAT.sandbag=new THREE.MeshStandardMaterial({map:sandbag,roughness:1,color:0xa89d78});
    MAT.glass=new THREE.MeshStandardMaterial({color:0x35505c,roughness:0.12,metalness:0.7,transparent:true,opacity:0.62,
      emissive:0x1a2b33,emissiveIntensity:0.35});
    MAT.roof=new THREE.MeshStandardMaterial({map:concrete,color:0x4a4f49,roughness:0.96});
    MAT.green=new THREE.MeshStandardMaterial({color:0x456039,roughness:1});
    MAT.leaf=new THREE.MeshStandardMaterial({color:0x3d5a34,roughness:1,flatShading:true});
    MAT.trunk=new THREE.MeshStandardMaterial({map:wood,color:0x6b563e,roughness:1});
    MAT.mark=new THREE.MeshStandardMaterial({color:0xc8a24a,roughness:0.8});
    MAT.dark=new THREE.MeshStandardMaterial({color:0x1c201d,roughness:1});
    MAT.crate=new THREE.MeshStandardMaterial({map:wood,roughness:0.9,color:0xb08d5a});
    MAT.paint=new THREE.MeshStandardMaterial({color:0xded8c8,roughness:0.9});
    MAT.stripe=new THREE.MeshStandardMaterial({color:0xb8633f,roughness:0.9});
    // 真实照片贴图（异步加载，成功则替换程序化贴图，失败自动保留原贴图）
    applyPhotoTextures();
  }

  // ---------- 真实 PBR 贴图接入（本地 assets/tex，CC0） ----------
  function applyPhotoTextures(){
    if(typeof THREE.TextureLoader==='undefined')return;
    var loader=new THREE.TextureLoader();
    function load(mat,file,rx,ry,tint){
      loader.load('assets/tex/'+file,function(tex){
        tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
        tex.repeat.set(rx,ry);
        if(tex.encoding!==undefined)tex.encoding=THREE.sRGBEncoding;
        if(renderer&&renderer.capabilities&&renderer.capabilities.getMaxAnisotropy)
          tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
        mat.map=tex;
        if(tint!==undefined&&mat.color)mat.color.setHex(tint);
        mat.needsUpdate=true;
      },undefined,function(){
        // 加载失败：保留程序化贴图，静默回退
      });
    }
    load(MAT.ground,'ground_grass.jpg',26,26);
    load(MAT.green,'ground_grass.jpg',6,5,0x7a9a6a);
    load(MAT.concrete,'concrete.jpg',4,4);
    load(MAT.wall,'concrete.jpg',3,2,0xd6d0c2);
    load(MAT.brick,'brick.jpg',3,2);
    load(MAT.wood,'wood.jpg',2,2);
    load(MAT.metal,'metal.jpg',2,2);
    load(MAT.roof,'concrete.jpg',4,4,0x5a6058);
    load(MAT.trunk,'wood.jpg',1,2,0x7a6248);
    load(MAT.crate,'wood.jpg',1,1,0xc09a64);
    load(MAT.sandbag,'concrete.jpg',2,1,0x9a8f68);
    load(MAT.roadPlain,'asphalt.jpg',12,12);
    load(MAT.asphalt,'asphalt.jpg',2,16,0x9aa09a);
    // 黄虚线改用几何体绘制（buildGround 中），避免 file:// 下 canvas 合成贴图被污染
  }

  // ---------- 初始化 ----------
  function init(canvas,q){
    quality=q||'medium';
    scene=new THREE.Scene();
    scene.background=new THREE.Color(0x5c6a68);
    scene.fog=new THREE.FogExp2(0x5c6a68,0.0048);
    buildSky();

    camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,600);

    renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:quality!=='low',powerPreference:'high-performance'});
    renderer.setSize(window.innerWidth,window.innerHeight);
    renderer.shadowMap.enabled=quality!=='low';
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    if(renderer.outputEncoding!==undefined)renderer.outputEncoding=THREE.sRGBEncoding;
    if(renderer.toneMapping!==undefined){renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;}

    buildMaterials();
    buildLights();
    buildingGroup=new THREE.Group();scene.add(buildingGroup);
    buildGround();
    buildPerimeter();
    buildZones();
    buildSpawnArea();
    buildCoverProps();
    buildLootSpots();
    buildExtracts();
    buildLevers();
    buildDecor();

    window.addEventListener('resize',onResize);
    return {scene:scene,camera:camera,renderer:renderer};
  }

  function onResize(){
    if(!renderer)return;
    camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
  }

  // ---------- 天空穹顶 ----------
  function buildSky(){
    var geo=new THREE.SphereGeometry(480,32,16);
    var mat=new THREE.MeshBasicMaterial({map:makeSkyTexture(),side:THREE.BackSide,depthWrite:false,fog:false});
    var sky=new THREE.Mesh(geo,mat);scene.add(sky);
    // 远山剪影（增加景深）
    var ridgeMat=new THREE.MeshBasicMaterial({color:0x414e4c,side:THREE.DoubleSide,fog:false});
    var ridgeGeo=new THREE.PlaneGeometry(900,60);
    var ridge=new THREE.Mesh(ridgeGeo,ridgeMat);
    ridge.position.set(0,16,-360);scene.add(ridge);
    var ridge2=new THREE.Mesh(ridgeGeo,new THREE.MeshBasicMaterial({color:0x4c5956,side:THREE.DoubleSide,fog:false}));
    ridge2.position.set(-260,10,-300);ridge2.scale.set(0.7,0.7,1);ridge2.rotation.y=0.3;scene.add(ridge2);
    // 太阳光晕
    var glow=new THREE.Sprite(new THREE.SpriteMaterial({map:makeGlowTexture(),color:0xffe9b0,transparent:true,
      opacity:0.55,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
    glow.scale.set(120,120,1);glow.position.set(-180,150,-300);scene.add(glow);
  }
  function makeGlowTexture(){
    var c=document.createElement('canvas');c.width=c.height=64;
    var ctx=c.getContext('2d');var g=ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,244,210,1)');g.addColorStop(0.25,'rgba(255,226,160,0.55)');
    g.addColorStop(1,'rgba(255,220,150,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
    return new THREE.CanvasTexture(c);
  }

  // ---------- 光照 ----------
  function buildLights(){
    var hemi=new THREE.HemisphereLight(0xbcc9d0,0x4a4636,0.7);scene.add(hemi);
    var sun=new THREE.DirectionalLight(0xffe6bd,1.45);
    sun.position.set(-90,110,45);sun.castShadow=quality!=='low';
    var shadowRes=quality==='high'?2048:quality==='medium'?1024:512;
    sun.shadow.mapSize.set(shadowRes,shadowRes);
    sun.shadow.camera.left=-130;sun.shadow.camera.right=130;sun.shadow.camera.top=130;sun.shadow.camera.bottom=-130;
    sun.shadow.camera.near=1;sun.shadow.camera.far=320;sun.shadow.bias=-0.0004;
    sun.shadow.normalBias=0.02;
    scene.add(sun);
    // 冷色补光（模拟天空反射），提升暗部层次
    var fill=new THREE.DirectionalLight(0x8fa6bb,0.35);fill.position.set(70,60,-80);scene.add(fill);
    var amb=new THREE.AmbientLight(0x4a544b,0.35);scene.add(amb);
  }

  // ---------- 地面 ----------
  function buildGround(){
    var g=new THREE.Mesh(new THREE.PlaneGeometry(260,260),MAT.ground);
    g.rotation.x=-Math.PI/2;g.receiveShadow=true;scene.add(g);
    // 主干道
    var roadMat=MAT.asphalt;
    var road1=new THREE.Mesh(new THREE.PlaneGeometry(16,220),roadMat);road1.rotation.x=-Math.PI/2;road1.position.set(0,0.02,0);road1.receiveShadow=true;scene.add(road1);
    var road2=new THREE.Mesh(new THREE.PlaneGeometry(220,14),roadMat);road2.rotation.x=-Math.PI/2;road2.position.set(0,0.02,10);road2.receiveShadow=true;scene.add(road2);
    // 黄色虚线（几何体，避免贴图污染）
    var lineMat=new THREE.MeshBasicMaterial({color:0xb99a46});
    var dashGeo=new THREE.PlaneGeometry(0.28,6);
    for(var d=-104;d<104;d+=12){
      var dash=new THREE.Mesh(dashGeo,lineMat);
      dash.rotation.x=-Math.PI/2;dash.position.set(0,0.035,d);scene.add(dash);
    }
    // 广场铺装
    var plaza=new THREE.Mesh(new THREE.PlaneGeometry(36,36),MAT.concrete);plaza.rotation.x=-Math.PI/2;plaza.position.set(0,0.03,-5);plaza.receiveShadow=true;scene.add(plaza);
    // 草坪
    var lawn=new THREE.Mesh(new THREE.PlaneGeometry(30,24),MAT.green);lawn.rotation.x=-Math.PI/2;lawn.position.set(70,0.02,55);lawn.receiveShadow=true;scene.add(lawn);
    // 人行道（建筑周边）
    DATA.MAP.zones.forEach(function(z){
      if(z.type==='open')return;
      var path=new THREE.Mesh(new THREE.PlaneGeometry(z.w+5,z.d+5),MAT.roadPlain);
      path.rotation.x=-Math.PI/2;path.position.set(z.x,0.012,z.z);path.receiveShadow=true;scene.add(path);
      var inner=new THREE.Mesh(new THREE.PlaneGeometry(z.w,z.d),MAT.concrete);
      inner.rotation.x=-Math.PI/2;inner.position.set(z.x,0.018,z.z);inner.receiveShadow=true;scene.add(inner);
    });
    // 地面细节：落叶、碎石、裂缝
    var rng=mulberry(31415);
    var detailGeo=new THREE.PlaneGeometry(0.5,0.35);
    var leafMats=[new THREE.MeshStandardMaterial({color:0x6b5a35,roughness:1,side:THREE.DoubleSide}),
                  new THREE.MeshStandardMaterial({color:0x7a4030,roughness:1,side:THREE.DoubleSide}),
                  new THREE.MeshStandardMaterial({color:0x4a5238,roughness:1,side:THREE.DoubleSide})];
    var detailCount=quality==='low'?80:quality==='medium'?160:260;
    for(var i=0;i<detailCount;i++){
      var x=(rng()-0.5)*200,z=(rng()-0.5)*200;
      var leaf=new THREE.Mesh(detailGeo,leafMats[Math.floor(rng()*leafMats.length)]);
      leaf.rotation.x=-Math.PI/2;leaf.rotation.z=rng()*Math.PI;
      leaf.position.set(x,0.04,z);leaf.scale.setScalar(0.5+rng());scene.add(leaf);
    }
  }

  // ---------- 围墙 ----------
  function buildPerimeter(){
    var s=110,t=2,h=6;
    addWall(-s,0,0,t,s*2,h,MAT.brick); // 西
    addWall(s,0,0,t,s*2,h,MAT.brick);  // 东
    addWall(0,-s,s*2,t,h,MAT.brick);   // 北
    addWall(0,s,s*2,t,h,MAT.brick);    // 南
    // 校门柱
    [[-98,-10],[98,0]].forEach(function(p){
      var p1=new THREE.Mesh(new THREE.BoxGeometry(3,8,3),MAT.concrete);
      p1.position.set(p[0],4,p[1]);p1.castShadow=true;scene.add(p1);
    });
  }

  // ---------- 出生点安全区（西南角，带掩体）----------
  function buildSpawnArea(){
    var sx=DATA.MAP.spawn.x, sz=DATA.MAP.spawn.z; // (-88, 88)
    var sb=MAT.sandbag||MAT.concrete;
    // 北侧矮掩体（防来自地图内部的火力），留出东侧缺口
    addWall(sx,sz-9,12,1.4,1.25,sb);
    // 东侧矮掩体（L 形），北侧留缺口便于出击
    addWall(sx+9,sz-2,1.4,10,1.25,sb);
    // 角落沙袋堆
    [[sx-6,sz-8],[sx+6,sz+4]].forEach(function(p){
      var b=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.0,1.4),sb);
      b.position.set(p[0],0.5,p[1]);b.castShadow=true;b.receiveShadow=true;buildingGroup.add(b);
      addCollider(p[0],p[1],2.4,1.4,0,1.0);
    });
    // 补给木箱
    [[sx-3,sz+2],[sx+2,sz+5]].forEach(function(p){
      var c=new THREE.Mesh(new THREE.BoxGeometry(1.4,1.2,1.4),MAT.crate);
      c.position.set(p[0],0.6,p[1]);c.castShadow=true;buildingGroup.add(c);
      addCollider(p[0],p[1],1.4,1.4,0,1.2);
    });
    // 废弃车辆（提供侧向掩护）
    buildCar(sx-12,sz-6,0.4);
    // 出生点地面标识
    var decal=new THREE.Mesh(new THREE.RingGeometry(2.6,3.0,32),
      new THREE.MeshBasicMaterial({color:0x9fb08a,side:THREE.DoubleSide,transparent:true,opacity:0.45}));
    decal.rotation.x=-Math.PI/2;decal.position.set(sx,0.05,sz);scene.add(decal);
    // 简易岗亭（视觉地标）
    var hut=new THREE.Mesh(new THREE.BoxGeometry(4,3,4),MAT.metal);
    hut.position.set(sx-11,1.5,sz+6);hut.castShadow=true;buildingGroup.add(hut);
    addCollider(sx-11,sz+6,4,4,0,3);
  }

  // ---------- 墙体助手（带碰撞）----------
  function addWall(x,z,w,d,h,mat,y){
    y=y||0;
    var m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat||MAT.wall);
    m.position.set(x,y+h/2,z);m.castShadow=true;m.receiveShadow=true;buildingGroup.add(m);
    addCollider(x,z,w,d,y,y+h);
    return m;
  }
  function addCollider(x,z,w,d,minY,maxY){
    colliders.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY:minY||0,maxY:maxY||3});
  }

  // ---------- 建筑生成 ----------
  function buildZones(){
    DATA.MAP.zones.forEach(function(z){
      if(z.type==='open'){buildOpenZone(z);return;}
      buildBuilding(z);
    });
    // 体育馆独立处理（屋顶撤离）
    buildGym();
  }

  function buildBuilding(z){
    var hw=z.w/2,hd=z.d/2;
    var floors=z.id==='teach'?3:(z.id==='admin'?2:1);
    var fh=4.2;
    // 地板基座
    var base=new THREE.Mesh(new THREE.BoxGeometry(z.w,0.6,z.d),MAT.concrete);
    base.position.set(z.x,0.3,z.z);base.receiveShadow=true;buildingGroup.add(base);
    for(var f=0;f<floors;f++){
      var y=f*fh;
      // 外墙（正确尺寸；南墙留 4m 门洞可进入）
      addWall(z.x,z.z-hd,z.w,0.6,fh,MAT.wall,y);      // 北墙：整幅
      var segW=(z.w-4)/2;
      addWall(z.x-2-segW/2,z.z+hd,segW,0.6,fh,MAT.wall,y); // 南墙左段
      addWall(z.x+2+segW/2,z.z+hd,segW,0.6,fh,MAT.wall,y); // 南墙右段
      addWall(z.x-hw,z.z,0.6,z.d,fh,MAT.wall,y);      // 西墙：整幅
      addWall(z.x+hw,z.z,0.6,z.d,fh,MAT.wall,y);      // 东墙：整幅
      // 添加门窗（视觉）
      addWindows(z,y,fh);
      // 内部隔墙（迷宫感）
      addInteriorWalls(z,y,fh,f);
      // 楼板
      if(f<floors-1){
        var slab=new THREE.Mesh(new THREE.BoxGeometry(z.w,0.3,z.d),MAT.concrete);
        slab.position.set(z.x,y+fh,z.z);slab.receiveShadow=true;buildingGroup.add(slab);
        // 楼梯
        buildStairs(z,y,fh);
      }
    }
    // 屋顶
    var roof=new THREE.Mesh(new THREE.BoxGeometry(z.w+1,0.5,z.d+1),MAT.roof);
    roof.position.set(z.x,floors*fh+0.25,z.z);roof.castShadow=true;roof.receiveShadow=true;buildingGroup.add(roof);
    // 门洞（南侧开一个入口，通过移除碰撞简化为缺口视觉）
    addEntrance(z);
  }

  function addWindows(z,y,fh){
    var hw=z.w/2,hd=z.d/2;
    var winCount=Math.max(2,Math.floor(z.w/8));
    for(var i=1;i<winCount;i++){
      var wx=z.x-hw+(z.w/winCount)*i;
      var win=new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.8),MAT.glass);
      win.position.set(wx,y+2.4,z.z-hd+0.32);buildingGroup.add(win);
      var win2=win.clone();win2.position.z=z.z+hd-0.32;win2.rotation.y=Math.PI;buildingGroup.add(win2);
    }
  }

  function addInteriorWalls(z,y,fh,floor){
    var rng=mulberry(seedFrom(z.id)+floor*13);
    var hw=z.w/2-3,hd=z.d/2-3;
    var n=3+Math.floor(rng()*3);
    for(var i=0;i<n;i++){
      var wx=z.x+(rng()-0.5)*hw*1.6;
      var wz=z.z+(rng()-0.5)*hd*1.6;
      var horiz=rng()>0.5;
      var len=6+rng()*8;
      var w=horiz?len:0.5,d=horiz?0.5:len;
      // 避免完全封死：留间隙，隔墙较短
      addWall(wx,wz,w,d,fh*0.85,MAT.wall,y);
    }
  }

  function buildStairs(z,y,fh){
    // 建筑内侧一段阶梯（视觉 + 可行走斜坡碰撞由高度场处理简化）
    var sx=z.x+z.w/2-2.5,sz=z.z;
    for(var s=0;s<7;s++){
      var st=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.3,1.0),MAT.concrete);
      st.position.set(sx,y+0.3+s*(fh/7),sz-3+s*1.0);st.castShadow=true;buildingGroup.add(st);
    }
  }

  function addEntrance(z){
    // 门口地垫标识
    var mat=new THREE.Mesh(new THREE.PlaneGeometry(4,2),MAT.mark);
    mat.rotation.x=-Math.PI/2;mat.position.set(z.x,0.06,z.z+z.d/2+1.2);scene.add(mat);
  }

  function buildOpenZone(z){
    // 中央广场喷泉
    var fountain=new THREE.Mesh(new THREE.CylinderGeometry(4,4.5,0.8,20),MAT.concrete);
    fountain.position.set(z.x,0.4,z.z);fountain.receiveShadow=true;scene.add(fountain);
    var water=new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.4,0.1,20),MAT.glass);
    water.position.set(z.x,0.85,z.z);scene.add(water);
    addCollider(z.x,z.z,8,8,0,1);
  }

  function buildGym(){
    var z=DATA.MAP.zones.find(function(x){return x.id==='gym';});
    var hw=z.w/2,hd=z.d/2;
    var h=12;
    // 三面整墙
    addWall(z.x,z.z-hd,z.w,0.8,h,MAT.brick,0);          // 北
    addWall(z.x-hw,z.z,0.8,z.d,h,MAT.brick,0);          // 西
    addWall(z.x+hw,z.z,0.8,z.d,h,MAT.brick,0);          // 东
    // 南墙留 6m 大门（可进入体育馆内部）
    var doorW=6,segW=(z.w-doorW)/2;
    addWall(z.x-(doorW/2+segW/2),z.z+hd,segW,0.8,h,MAT.brick,0);
    addWall(z.x+(doorW/2+segW/2),z.z+hd,segW,0.8,h,MAT.brick,0);
    // 门楣（视觉）
    var lintel=new THREE.Mesh(new THREE.BoxGeometry(doorW,2.5,0.8),MAT.brick);
    lintel.position.set(z.x,h-1.25,z.z+hd);lintel.castShadow=true;scene.add(lintel);
    // 地板
    var floor=new THREE.Mesh(new THREE.BoxGeometry(z.w,0.4,z.d),MAT.wood);
    floor.position.set(z.x,0.2,z.z);floor.receiveShadow=true;scene.add(floor);
    // 看台
    for(var i=0;i<3;i++){
      var stand=new THREE.Mesh(new THREE.BoxGeometry(z.w-4,0.6+i*0.6,2),MAT.concrete);
      stand.position.set(z.x,0.3+i*0.3,z.z-hd+3+i*2);stand.receiveShadow=true;scene.add(stand);
    }
    // 全幅屋顶（撤离点在屋顶，整片可站立）
    var roof=new THREE.Mesh(new THREE.BoxGeometry(z.w,0.5,z.d),MAT.roof);
    roof.position.set(z.x,h+0.25,z.z);roof.castShadow=true;roof.receiveShadow=true;scene.add(roof);
    // 屋顶护栏（视觉，不挡路）
    [[z.x,z.z-hd+0.4,z.w,0.2],[z.x,z.z+hd-0.4,z.w,0.2]].forEach(function(p){
      var r=new THREE.Mesh(new THREE.BoxGeometry(p[2],0.8,p[3]),MAT.metal);
      r.position.set(p[0],h+0.9,p[1]);scene.add(r);
    });
    // 外部检修梯（东墙外侧，从地面直通屋顶）
    var ladder=new THREE.Group();
    var rail1=new THREE.Mesh(new THREE.BoxGeometry(0.12,h,0.12),MAT.metal);rail1.position.set(-0.5,h/2,0);ladder.add(rail1);
    var rail2=rail1.clone();rail2.position.x=0.5;ladder.add(rail2);
    for(var r=0;r<h;r++){
      var rung=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.08,0.08),MAT.metal);rung.position.set(0,0.5+r,0);ladder.add(rung);
    }
    var lx=z.x+hw+1.3, lz=z.z;
    ladder.position.set(lx,0,lz);scene.add(ladder);
    worldLadder={x:lx,z:lz,topX:z.x+hw-3,topY:h,topZ:lz};
  }

  // ---------- 掩体道具 ----------
  function buildCoverProps(){
    var rng=mulberry(7788);
    // 各处箱子、课桌、障碍
    DATA.MAP.zones.forEach(function(z){
      if(z.type==='open')return;
      var count=z.type==='indoor'?Math.floor(z.w*z.d/90):4;
      for(var i=0;i<count;i++){
        var px=z.x+(rng()-0.5)*(z.w-6);
        var pz=z.z+(rng()-0.5)*(z.d-6);
        var type=rng();
        var w,d,h,mat;
        if(type<0.35){w=2.4;d=1.2;h=1.1;mat=MAT.wood;}       // 课桌
        else if(type<0.6){w=1.4;d=1.4;h=1.6;mat=MAT.crate;}  // 箱子
        else if(type<0.8){w=2.0;d=0.9;h=1.9;mat=MAT.metal;}  // 柜子
        else {w=1.0;d=1.0;h=1.2;mat=MAT.concrete;}            // 障碍墩
        var m=new THREE.Mesh(new THREE.BoxGeometry(w,d,h),mat);
        m.position.set(px,h/2,pz);m.castShadow=true;m.receiveShadow=true;buildingGroup.add(m);
        addCollider(px,pz,w,d,0,h);
      }
    });
    // 街道上的废弃车辆
    var cars=[[-30,10],[38,10],[-6,-40],[6,60],[-70,-10],[80,30]];
    cars.forEach(function(p){buildCar(p[0],p[1],rng()*Math.PI);});
    // 路障
    [[-20,10],[26,10],[0,-28],[0,34]].forEach(function(p){
      var b=new THREE.Mesh(new THREE.BoxGeometry(4,1.1,0.8),MAT.concrete);
      b.position.set(p[0],0.55,p[1]);b.castShadow=true;scene.add(b);addCollider(p[0],p[1],4,0.8,0,1.1);
    });
  }

  function buildCar(x,z,rot){
    var g=new THREE.Group();
    var body=new THREE.Mesh(new THREE.BoxGeometry(4.4,1.2,2),new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(rngHue(x),0.15,0.3),roughness:0.6,metalness:0.3}));
    body.position.y=0.9;body.castShadow=true;g.add(body);
    var cabin=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.9,1.8),MAT.glass);cabin.position.set(-0.2,1.8,0);g.add(cabin);
    [[1.5,1.0],[1.5,-1.0],[-1.5,1.0],[-1.5,-1.0]].forEach(function(w){
      var wheel=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,0.3,12),MAT.dark);
      wheel.rotation.x=Math.PI/2;wheel.position.set(w[0],0.5,w[1]);g.add(wheel);
    });
    g.position.set(x,0,z);g.rotation.y=rot;scene.add(g);
    addCollider(x,z,4.4,2,0,1.5);
  }
  function rngHue(x){return ((x*13)%360)/360;}

  // ---------- 搜刮点 ----------
  function buildLootSpots(){
    var rng=mulberry(4455);
    DATA.MAP.zones.forEach(function(z){
      if(z.type==='open')return;
      for(var i=0;i<z.loot;i++){
        var px=z.x+(rng()-0.5)*(z.w-10);
        var pz=z.z+(rng()-0.5)*(z.d-10);
        var container=makeContainer(px,pz,rng()>0.5);
        lootSpots.push({x:px,z:pz,mesh:container,used:false,
          tier:z.id==='admin'||z.id==='lab'?4:z.id==='teach'?3:2});
      }
    });
    // 广场散落
    for(var k=0;k<3;k++){
      var px=-14+k*14,pz=-18;
      var c=makeContainer(px,pz,false);
      lootSpots.push({x:px,z:pz,mesh:c,used:false,tier:2});
    }
  }
  function makeContainer(x,z,tall){
    var g=new THREE.Group();
    var body=new THREE.Mesh(new THREE.BoxGeometry(tall?1.2:1.6,tall?2:1.0,tall?1.0:1.2),tall?MAT.metal:MAT.wood);
    body.position.y=tall?1:0.5;body.castShadow=true;g.add(body);
    // 标记条
    var stripe=new THREE.Mesh(new THREE.BoxGeometry(tall?1.22:1.62,0.08,tall?1.02:1.22),MAT.mark);
    stripe.position.y=tall?1.4:0.7;g.add(stripe);
    g.position.set(x,0,z);buildingGroup.add(g);
    // 容器实体碰撞（尺寸略小于视觉，避免挡住搜刮交互距离）
    addCollider(x,z,tall?1.1:1.5,tall?0.9:1.1,0,tall?2:1);
    return g;
  }

  // ---------- 撤离点 ----------
  function buildExtracts(){
    DATA.MAP.extracts.forEach(function(ex){
      var g=new THREE.Group();
      var y=ex.y||0;
      var ring=new THREE.Mesh(new THREE.RingGeometry(3.4,4.2,32),new THREE.MeshBasicMaterial({color:0xc8a24a,side:THREE.DoubleSide,transparent:true,opacity:0.7}));
      ring.rotation.x=-Math.PI/2;ring.position.y=y+0.08;g.add(ring);
      var beam=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,14,8),new THREE.MeshBasicMaterial({color:0xc8a24a,transparent:true,opacity:0.25}));
      beam.position.y=y+7;g.add(beam);
      g.position.set(ex.x,0,ex.z);scene.add(g);
      extractMeshes[ex.id]=g;
    });
  }

  // ---------- 配电箱 ----------
  function buildLevers(){
    DATA.MAP.levers.forEach(function(l){
      var g=new THREE.Group();
      var box=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.6,0.5),MAT.metal);box.position.y=1.4;box.castShadow=true;g.add(box);
      var lever=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.5,0.15),MAT.mark);lever.position.set(0,1.5,0.35);g.add(lever);
      g.position.set(l.x,0,l.z);scene.add(g);leverMeshes[l.id]={group:g,lever:lever,activated:false};
      addCollider(l.x,l.z,1.2,0.5,0,2);
    });
  }

  // ---------- 装饰（树、路灯、场景道具）----------
  function makeTree(x,z,rng){
    var g=new THREE.Group();
    var h=3+rng()*2;
    var trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.38,h,7),MAT.trunk);
    trunk.position.y=h/2;trunk.castShadow=true;g.add(trunk);
    // 三层树冠，交错低多边形，更自然
    var layers=3;
    for(var l=0;l<layers;l++){
      var r=(2.4-l*0.55)*(0.85+rng()*0.3);
      var ch=(2.6-l*0.3);
      var crown=new THREE.Mesh(new THREE.ConeGeometry(r,ch,7),MAT.leaf);
      crown.position.y=h+0.4+l*1.25;
      crown.rotation.y=rng()*Math.PI;
      crown.castShadow=true;g.add(crown);
    }
    var sc=0.85+rng()*0.4;g.scale.setScalar(sc);
    g.position.set(x,0,z);scene.add(g);
  }
  function buildDecor(){
    var rng=mulberry(99887);
    var treeCount=quality==='low'?16:quality==='medium'?28:40;
    for(var i=0;i<treeCount;i++){
      var x=(rng()-0.5)*205,z=(rng()-0.5)*205;
      if(Math.abs(x)<12||Math.abs(z-10)<10)continue;
      if(inAnyZone(x,z))continue;
      makeTree(x,z,rng);
    }
    // 路灯（带暖色发光灯头）
    var lampMat=new THREE.MeshStandardMaterial({color:0xfff0c0,emissive:0xffd98a,emissiveIntensity:0.9,roughness:0.4});
    for(var j=0;j<9;j++){
      var lx=-84+j*21,lz=-2;
      var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.15,7,8),MAT.metal);pole.position.set(lx,3.5,lz);pole.castShadow=true;scene.add(pole);
      var arm=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.1,0.1),MAT.metal);arm.position.set(lx+0.6,6.95,lz);scene.add(arm);
      var lamp=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.14,0.5),lampMat);lamp.position.set(lx+1.2,6.9,lz);scene.add(lamp);
    }
    buildCampusProps(rng);
  }
  // 学院环境道具：旗杆、横幅、标语牌、长椅、垃圾桶、栅栏、空调外机
  function buildCampusProps(rng){
    // 旗杆 + 旗（中央广场两侧）
    [[-16,-18],[16,-18]].forEach(function(p){
      var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.1,11,8),MAT.metal);
      pole.position.set(p[0],5.5,p[1]);pole.castShadow=true;scene.add(pole);
      var flag=new THREE.Mesh(new THREE.PlaneGeometry(3,1.8),
        new THREE.MeshStandardMaterial({color:0x8a3f34,side:THREE.DoubleSide,roughness:1}));
      flag.position.set(p[0]+1.6,9.6,p[1]);scene.add(flag);
    });
    // 长椅（道路两侧）
    [[-40,8],[-26,14],[30,8],[44,14],[0,20]].forEach(function(p){
      var g=new THREE.Group();
      var seat=new THREE.Mesh(new THREE.BoxGeometry(2.6,0.12,0.7),MAT.wood);seat.position.y=0.55;g.add(seat);
      var back=new THREE.Mesh(new THREE.BoxGeometry(2.6,0.6,0.1),MAT.wood);back.position.set(0,0.9,-0.3);g.add(back);
      [[-1.1,0.28],[1.1,0.28]].forEach(function(l){
        var leg=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.55,0.6),MAT.metal);leg.position.set(l[0],l[1],0);g.add(leg);
      });
      g.position.set(p[0],0,p[1]);g.rotation.y=(rng()-0.5)*0.4;scene.add(g);
    });
    // 宣传栏 / 公告牌
    [[-8,16],[8,-16],[-64,20]].forEach(function(p){
      var board=new THREE.Mesh(new THREE.BoxGeometry(4,2.2,0.2),MAT.paint);
      board.position.set(p[0],1.6,p[1]);board.castShadow=true;scene.add(board);
      var frame=new THREE.Mesh(new THREE.BoxGeometry(4.3,2.5,0.12),MAT.stripe);
      frame.position.set(p[0],1.6,p[1]-0.08);scene.add(frame);
      var post1=new THREE.Mesh(new THREE.BoxGeometry(0.12,1.5,0.12),MAT.metal);post1.position.set(p[0]-1.5,0.75,p[1]);scene.add(post1);
      var post2=post1.clone();post2.position.x=p[0]+1.5;scene.add(post2);
      addCollider(p[0],p[1],4,0.3,0,2.7);
    });
    // 垃圾桶
    [[-34,12],[22,12],[-12,24],[54,12]].forEach(function(p){
      var bin=new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.36,1.1,10),MAT.metal);
      bin.position.set(p[0],0.55,p[1]);bin.castShadow=true;scene.add(bin);
      var lid=new THREE.Mesh(new THREE.CylinderGeometry(0.46,0.46,0.12,10),MAT.dark);
      lid.position.set(p[0],1.15,p[1]);scene.add(lid);
    });
    // 建筑屋顶空调外机（增加天际线细节）
    var acGeo=new THREE.BoxGeometry(1.4,1,1);
    DATA.MAP.zones.forEach(function(z){
      if(z.type==='open'||z.id==='gym')return;
      var floors=z.id==='teach'?3:(z.id==='admin'?2:1);
      var roofY=floors*4.2+0.5;
      for(var k=0;k<3;k++){
        var ac=new THREE.Mesh(acGeo,MAT.metal);
        ac.position.set(z.x+(rng()-0.5)*(z.w-6),roofY+0.5,z.z+(rng()-0.5)*(z.d-6));
        ac.castShadow=true;scene.add(ac);
      }
    });
    // 围墙铁丝网顶部（视觉）
    var wireMat=new THREE.MeshBasicMaterial({color:0x3a403a});
    for(var sx=-100;sx<=100;sx+=8){
      var spike=new THREE.Mesh(new THREE.ConeGeometry(0.2,0.8,5),wireMat);
      spike.position.set(sx,6.4,-110);scene.add(spike);
      var spike2=spike.clone();spike2.position.z=110;scene.add(spike2);
    }
  }
  function inAnyZone(x,z){
    return DATA.MAP.zones.some(function(z){return Math.abs(x-z.x)<z.w/2+3&&Math.abs(z-z.z)<z.d/2+3;});
  }

  // ---------- 地面高度查询（屋顶可站立，按当前高度决定在地面还是屋顶）----------
  function groundHeightAt(x,z,currentY){
    var gym=DATA.MAP.zones.find(function(z2){return z2.id==='gym';});
    if(gym&&x>=gym.x-gym.w/2&&x<=gym.x+gym.w/2&&z>=gym.z-gym.d/2&&z<=gym.z+gym.d/2){
      // 已在屋顶高度才站在屋顶，否则在馆内地面
      if(currentY!==undefined&&currentY>=gymRoofY()-2)return gymRoofY();
    }
    return 0;
  }
  function gymRoofY(){var gym=DATA.MAP.zones.find(function(z2){return z2.id==='gym';});return gym?12:12;}

  // ---------- 碰撞查询 ----------
  function resolveCollision(x,z,radius,minY,maxY){
    var nx=x,nz=z;
    for(var i=0;i<colliders.length;i++){
      var c=colliders[i];
      if(maxY<c.minY||minY>c.maxY)continue;
      // 最近点
      var cx=U.clamp(nx,c.minX,c.maxX),cz=U.clamp(nz,c.minZ,c.maxZ);
      var dx=nx-cx,dz=nz-cz,d2=dx*dx+dz*dz;
      if(d2<radius*radius){
        if(d2>0.0001){var d=Math.sqrt(d2);nx=cx+dx/d*radius;nz=cz+dz/d*radius;}
        else{
          // 中心在盒内，推向最近边
          var l=nx-c.minX,r=c.maxX-nx,b=nz-c.minZ,t=c.maxZ-nz;
          var m=Math.min(l,r,b,t);
          if(m===l)nx=c.minX-radius;else if(m===r)nx=c.maxX+radius;
          else if(m===b)nz=c.minZ-radius;else nz=c.maxZ+radius;
        }
      }
    }
    return {x:nx,z:nz};
  }

  // 射线检测：返回 {hit,point,dist,obj,part}
  function raycast(origin,dir,maxDist,ignore){
    var ray=new THREE.Raycaster(origin,dir,0,maxDist||200);
    // 收集可命中对象
    var targets=[];
    buildingGroup.traverse(function(o){if(o.isMesh)targets.push(o);});
    scene.children.forEach(function(o){
      if(o===buildingGroup)return;
      if(o.userData&&o.userData.hittable){o.traverse(function(m){if(m.isMesh)targets.push(m);});}
    });
    var hits=ray.intersectObjects(targets,false);
    if(hits.length>0){
      var h=hits[0];
      return {hit:true,point:h.point,dist:h.distance,obj:h.object};
    }
    return {hit:false};
  }

  // ---------- 小地图绘制 ----------
  function drawMinimap(ctx,px,pz,enemies,extracts,levers,yaw){
    var W=ctx.canvas.width,H=ctx.canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#121612';ctx.fillRect(0,0,W,H);
    var scale=W/230;
    function tx(x){return W/2+(x-px)*scale;}
    function tz(z){return H/2+(z-pz)*scale;}
    // 区域
    ctx.fillStyle='#252c25';
    DATA.MAP.zones.forEach(function(z){ctx.fillRect(tx(z.x-z.w/2),tz(z.z-z.d/2),z.w*scale,z.d*scale);});
    // 道路
    ctx.fillStyle='#1e231e';ctx.fillRect(tx(-8),0,16*scale,H);ctx.fillRect(0,tz(3),W,14*scale);
    // 围墙
    ctx.strokeStyle='#4a5247';ctx.strokeRect(tx(-110),tz(-110),220*scale,220*scale);
    // 撤离点
    DATA.MAP.extracts.forEach(function(ex){
      ctx.fillStyle='#c8a24a';ctx.beginPath();ctx.arc(tx(ex.x),tz(ex.z),4,0,Math.PI*2);ctx.fill();
    });
    // 敌人
    if(enemies)enemies.forEach(function(e){
      if(!e.alive)return;
      ctx.fillStyle='#c0453c';ctx.fillRect(tx(e.pos.x)-2,tz(e.pos.z)-2,4,4);
    });
    // 玩家朝向三角
    ctx.save();ctx.translate(W/2,H/2);ctx.rotate(-yaw);
    ctx.fillStyle='#e8e4d6';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(4,5);ctx.lineTo(-4,5);ctx.closePath();ctx.fill();
    ctx.restore();
  }

  // ---------- 工具：种子随机 ----------
  function seedFrom(s){var h=0;for(var i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return Math.abs(h)||1;}
  function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}

  // ---------- 更新撤离点脉冲 ----------
  var pulse=0;
  function update(dt,gameTime){
    pulse+=dt;
    for(var id in extractMeshes){
      var g=extractMeshes[id];
      g.children[0].material.opacity=0.45+Math.sin(pulse*2)*0.2;
      g.rotation.y+=dt*0.4;
    }
  }

  function setLootUsed(mesh){mesh.children.forEach(function(c){if(c.material&&c.material.color)c.material.color.multiplyScalar(0.4);});}
  function activateLever(id){
    var l=leverMeshes[id];if(!l||l.activated)return;
    l.activated=true;l.lever.rotation.x=Math.PI/2;
  }

  return {
    init:init,update:update,resolveCollision:resolveCollision,raycast:raycast,
    drawMinimap:drawMinimap,setLootUsed:setLootUsed,activateLever:activateLever,
    getScene:function(){return scene;},getCamera:function(){return camera;},getRenderer:function(){return renderer;},
    getColliders:function(){return colliders;},getLootSpots:function(){return lootSpots;},
    groundHeightAt:groundHeightAt,
    leverActivated:function(id){return leverMeshes[id]&&leverMeshes[id].activated;},
    getLadder:function(){return worldLadder;},
    resize:onResize
  };
})();
