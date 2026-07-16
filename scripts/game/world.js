// ============================================================================
// jokura / world.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、下記の順序で <script> として読み込まれ、すべて同一のグローバル
// スコープを共有する（元は単一の boot() 関数だったため、この順序と共有スコープが前提）。
// 読み込み順: state → achievements → crafting → save → ui → audio → world →
//             combat → entities → hud → input → main
// ============================================================================

// ═══ THREE ═══
const canvas=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'low-power'});
renderer.shadowMap.enabled=false;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.setClearColor(0x0b0f17);
let SHADOWS_ON=false;
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x0b0f17,20,60);
const camera=new THREE.PerspectiveCamera(72,1,.05,130);
function resize(){
  const w=document.documentElement.clientWidth||window.innerWidth,h=document.documentElement.clientHeight||window.innerHeight;
  canvas.width=w;canvas.height=h;camera.aspect=w/h;camera.updateProjectionMatrix();
  renderer.setPixelRatio(isTouch?1:Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(w,h,false);
}
window.addEventListener('resize',resize);window.addEventListener('orientationchange',()=>{setTimeout(resize,100);setTimeout(resize,300);});
if(window.visualViewport)window.visualViewport.addEventListener('resize',resize);
resize();setTimeout(resize,50);setTimeout(resize,300);setTimeout(resize,800);
const hemLight=new THREE.HemisphereLight(0xbfdcff,0x1a1f2a,.9);scene.add(hemLight);
const sun=new THREE.DirectionalLight(0xffffff,1);sun.position.set(10,18,8);scene.add(sun);
scene.add(sun.target);
const SHADOW_R=20;
sun.shadow.mapSize.width=1024;sun.shadow.mapSize.height=1024;
sun.shadow.camera.left=-SHADOW_R;sun.shadow.camera.right=SHADOW_R;sun.shadow.camera.top=SHADOW_R;sun.shadow.camera.bottom=-SHADOW_R;
sun.shadow.camera.near=1;sun.shadow.camera.far=150;
sun.shadow.bias=-0.0005;sun.shadow.normalBias=0.05;
scene.add(new THREE.AmbientLight(0x112233,.28)); // dimmer base so night/caves read dark and torches matter
// ─── TORCH LIGHTS: a small pool of point lights that snap to the nearest
// placed torches each frame — real illumination without unbounded light cost.
// Lazily added to the scene on first torch so day-time shaders stay cheap. ───
const TORCH_LIGHT_N=isTouch?2:4;
const torchLights=[];let torchLightsAdded=false;
for(let i=0;i<TORCH_LIGHT_N;i++){const l=new THREE.PointLight(0xffa542,0,9,1.6);l.castShadow=false;torchLights.push(l);}
function updateTorchLights(){
  if(!torchBlocks.size){if(torchLightsAdded)for(const l of torchLights)l.intensity=0;return;}
  if(!torchLightsAdded){for(const l of torchLights)scene.add(l);torchLightsAdded=true;}
  const cx=camera.position.x,cy=camera.position.y,cz=camera.position.z,near=[];
  for(const k of torchBlocks){
    const p=k.split('|'),x=+p[0]+.5,y=+p[1]+.55,z=+p[2]+.5,d2=(x-cx)*(x-cx)+(y-cy)*(y-cy)+(z-cz)*(z-cz);
    if(d2>484)continue; // ignore torches >22 blocks away
    if(near.length<TORCH_LIGHT_N)near.push({d2,x,y,z});
    else{let mi=0;for(let i=1;i<near.length;i++)if(near[i].d2>near[mi].d2)mi=i;if(d2<near[mi].d2)near[mi]={d2,x,y,z};}
  }
  for(let i=0;i<torchLights.length;i++){const l=torchLights[i];if(i<near.length){l.position.set(near[i].x,near[i].y,near[i].z);l.intensity=1.8;}else l.intensity=0;}
}
// ─── SKY: gradient dome + square sun/moon + drifting clouds ───
function _skyGradTex(){
  const c=document.createElement('canvas');c.width=1;c.height=64;const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,64); // canvas top = zenith (uv.y=1)
  g.addColorStop(0,'rgb(106,118,170)');g.addColorStop(.45,'rgb(255,255,255)');g.addColorStop(1,'rgb(255,255,255)');
  x.fillStyle=g;x.fillRect(0,0,1,64);
  return new THREE.CanvasTexture(c);
}
const skyMesh=new THREE.Mesh(new THREE.SphereGeometry(110,12,6),new THREE.MeshBasicMaterial({color:0x0b1a3b,map:_skyGradTex(),side:THREE.BackSide,fog:false,depthWrite:false}));scene.add(skyMesh);
function _celestTex(core,edge){
  const c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d');
  x.fillStyle=edge;x.fillRect(0,0,16,16);x.fillStyle=core;x.fillRect(2,2,12,12);
  const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;return t;
}
const sunSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:_celestTex('#fff6c8','#ffd75e'),transparent:true,opacity:.95,fog:false,depthWrite:false}));
sunSprite.scale.set(14,14,1);sunSprite.visible=false;scene.add(sunSprite);
const moonSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:_celestTex('#e8ecf5','#9aa4c0'),transparent:true,opacity:.9,fog:false,depthWrite:false}));
moonSprite.scale.set(9,9,1);moonSprite.visible=false;scene.add(moonSprite);
const cloudGroup=new THREE.Group();scene.add(cloudGroup);
const cloudMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.42,fog:false,depthWrite:false});
const CLOUD_Y=46,CLOUD_RANGE=150;
(function(){
  const g=new THREE.BoxGeometry(1,1,1);
  for(let i=0;i<26;i++){
    const m=new THREE.Mesh(g,cloudMat);
    m.scale.set(9+Math.random()*16,.8,6+Math.random()*10);
    m.position.set((Math.random()*2-1)*CLOUD_RANGE,CLOUD_Y+Math.random()*6,(Math.random()*2-1)*CLOUD_RANGE);
    cloudGroup.add(m);
  }
})();
// night stars: points on the upper sky dome, fading in with darkness and
// slowly rotating with the day cycle like the real Minecraft sky
const starPivot=new THREE.Group();scene.add(starPivot);
const starMat=new THREE.PointsMaterial({color:0xffffff,size:1.0,sizeAttenuation:true,transparent:true,opacity:0,fog:false,depthWrite:false});
(function(){
  const N=320,pos=new Float32Array(N*3);
  for(let i=0;i<N;i++){
    // random direction biased to the upper hemisphere
    let x,y,z,l;
    do{x=Math.random()*2-1;y=Math.random();z=Math.random()*2-1;l=Math.hypot(x,y,z);}while(l>1||l<.2||y/l<.06);
    pos[i*3]=x/l*100;pos[i*3+1]=y/l*100;pos[i*3+2]=z/l*100;
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const stars=new THREE.Points(g,starMat);stars.frustumCulled=false;stars.renderOrder=1;
  starPivot.add(stars);
})();

// ─── WEATHER: rain / snow precipitation fields (shader-animated, follow player) ───
// A fixed column of streaks (rain) / flakes (snow) around the player; the fall
// is done entirely in the vertex shader (mod of uTime), so there is no
// per-particle JS cost. The whole group is re-centred on the player each frame.
const PRECIP_R=16,PRECIP_H=22; // radius / column height
const _precipCount=isTouch?360:900;
function _makePrecipUniforms(){return{uTime:{value:0},uSpeed:{value:1},uH:{value:PRECIP_H}};}
function _precipAttribs(){
  const n=_precipCount,pos=new Float32Array(n*3),ph=new Float32Array(n);
  for(let i=0;i<n;i++){
    pos[i*3]=(Math.random()*2-1)*PRECIP_R;
    pos[i*3+1]=Math.random()*PRECIP_H;
    pos[i*3+2]=(Math.random()*2-1)*PRECIP_R;
    ph[i]=Math.random()*PRECIP_H;
  }
  return{pos,ph};
}
// preprocessor directives (#ifdef/#endif) must sit at the start of a line
const _precipVert=[
  'uniform float uTime;uniform float uSpeed;uniform float uH;attribute float aPhase;',
  'void main(){',
  '  vec3 p=position;',
  '  float off=mod(uTime*uSpeed+aPhase,uH);',
  '  p.y-=off;',
  '  p.x+=off*0.16;',            // slight wind slant
  '#ifdef IS_SNOW',
  '  p.x+=sin(uTime*0.7+aPhase)*0.6;',
  '  p.z+=cos(uTime*0.5+aPhase*1.3)*0.6;',
  '#endif',
  '  vec4 mv=modelViewMatrix*vec4(p,1.0);',
  '#ifdef IS_SNOW',
  '  gl_PointSize=2.6*(300.0/-mv.z);',
  '#endif',
  '  gl_Position=projectionMatrix*mv;',
  '}'
].join('\n');
// rain: short vertical streaks as line segments
const rainGroup=new THREE.Group();rainGroup.visible=false;scene.add(rainGroup);
(function(){
  const{pos,ph}=_precipAttribs();
  const n=_precipCount,lp=new Float32Array(n*6),lph=new Float32Array(n*2);
  for(let i=0;i<n;i++){
    const x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2];
    lp[i*6]=x;lp[i*6+1]=y;lp[i*6+2]=z;         // top
    lp[i*6+3]=x;lp[i*6+4]=y-0.7;lp[i*6+5]=z;   // bottom (streak length)
    lph[i*2]=ph[i];lph[i*2+1]=ph[i];
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(lp,3));
  g.setAttribute('aPhase',new THREE.BufferAttribute(lph,1));
  g.setDrawRange(0,n*2);
  const mat=new THREE.LineBasicMaterial({color:0x9fb8d8,transparent:true,opacity:.0,fog:false,depthWrite:false});
  mat.onBeforeCompile=(sh)=>{Object.assign(sh.uniforms,_makePrecipUniforms());rainGroup.userData.u=sh.uniforms;sh.vertexShader=_precipVert;};
  const lines=new THREE.LineSegments(g,mat);lines.frustumCulled=false;lines.renderOrder=2;
  rainGroup.add(lines);rainGroup.userData.mat=mat;
})();
// snow: drifting flakes as points
const snowGroup=new THREE.Group();snowGroup.visible=false;scene.add(snowGroup);
(function(){
  const{pos,ph}=_precipAttribs();
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('aPhase',new THREE.BufferAttribute(ph,1));
  const mat=new THREE.PointsMaterial({color:0xeef4ff,size:2.6,sizeAttenuation:true,transparent:true,opacity:.0,fog:false,depthWrite:false});
  mat.onBeforeCompile=(sh)=>{Object.assign(sh.uniforms,_makePrecipUniforms());sh.uniforms.uSpeed.value=.45;snowGroup.userData.u=sh.uniforms;sh.defines=Object.assign({IS_SNOW:''},sh.defines);sh.vertexShader=_precipVert;};
  const pts=new THREE.Points(g,mat);pts.frustumCulled=false;pts.renderOrder=2;
  snowGroup.add(pts);snowGroup.userData.mat=mat;
})();

// ═══ NOISE ═══
function makeNoise(seed){const p=new Uint8Array(512);let s=seed||42;function r(){s=(s*16807+0)%2147483647;return(s&0x7fffffff)/2147483647;}const t=new Uint8Array(256);for(let i=0;i<256;i++)t[i]=i;for(let i=255;i>0;i--){const j=(r()*i)|0;const tmp=t[i];t[i]=t[j];t[j]=tmp;}for(let i=0;i<512;i++)p[i]=t[i&255];const g=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];function dot2(gi,x,y){const v=g[gi%8];return v[0]*x+v[1]*y;}function fade(t){return t*t*t*(t*(t*6-15)+10);}function lerp(a,b,t){return a+t*(b-a);}return function(x,y){const X=Math.floor(x)&255,Y=Math.floor(y)&255;x-=Math.floor(x);y-=Math.floor(y);const u=fade(x),v=fade(y);const a=p[X]+Y,b=p[X+1]+Y;return lerp(lerp(dot2(p[a],x,y),dot2(p[b],x-1,y),u),lerp(dot2(p[a+1],x,y-1),dot2(p[b+1],x-1,y-1),u),v);};}
let WORLD_SEED=Math.floor(Math.random()*999999);
let noise=makeNoise(WORLD_SEED),noiseB=makeNoise(WORLD_SEED+11111),noiseV=makeNoise(WORLD_SEED+22222);
function initWorldNoise(seed){WORLD_SEED=seed;noise=makeNoise(seed);noiseB=makeNoise(seed+11111);noiseV=makeNoise(seed+22222);}
function fbm(x,z,oct){let v=0,amp=1,freq=1,mx=0;for(let i=0;i<oct;i++){v+=noise(x*freq,z*freq)*amp;mx+=amp;amp*=.5;freq*=2;}return v/mx;}
function hash2i(x,z,seed){seed=seed||1337;let h=(Math.imul(x,374761393)+Math.imul(z,668265263))^seed;h=Math.imul(h^(h>>>13),1274126177);return(h^(h>>>16))>>>0;}
function rand2(x,z,seed){return hash2i(x|0,z|0,seed)/4294967296;}
function rand3(x,y,z,seed){seed=seed||1337;let h=(Math.imul(x,374761393)+Math.imul(z,668265263)+Math.imul(y,1013904223))^seed;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}

// ═══ WORLD ═══
const CHUNK=16,CHUNK_Y=8;
const WORLD_CY_MIN=-4,WORLD_CY_MAX=2; // underground (-32) to mountain tops (+16)
const DRAW_RY=isTouch?1:2;
// world is unbounded horizontally; chunks beyond this radius (padding past the
// view distance) are fully unloaded — voxels freed, geometry disposed — so
// memory stays bounded no matter how far the player wanders (Minecraft-style
// chunk loading/unloading rather than a hard world border)
const UNLOAD_R=DRAW_R+4;
const BLOCK_COLORS=[0x4caf50,0x8a8f98,0xd9c27a,0x5d4037,0xef9a9a,0x2e7d32,0x78909c,0x1a0a00,0xff4500,0xddeeff,0x1565c0,0x6b4226,0x1e1e1e,0x2a2e3d,0x8b4513,0x00e5ff,0xffa030,0x8a8f98,0x8a8f98,0xaadfff,0x1b0b2e,0xcc66ff,0x2e9e4f,0xd0483e,0xb0a08c,0xbfe6ff,0xf4f4ec,0x3f9e3f];
// [grass,stone,sand,wood,brick,forest-grass,grey-stone,volcano-rock,lava,snow,water,cave-dirt,coal-ore,deep-stone,iron-ore,diamond-ore,torch,slab,stair,ice,obsidian,crystal,cactus,mushroom,clay,glass,wool-block,leaf]
const BLOCK_HARDNESS=[1,3,1,2,4,1,3,99,99,1,99,1,2,4,5,6,1,2,2,1,6,4,1,1,1,1,1,1];
const LAVA_BLOCK=8,SNOW_BLOCK=9,WATER_BLOCK=10,CAVE_DIRT=11,COAL_ORE=12,DEEP_STONE=13,IRON_ORE=14,DIAMOND_ORE=15,TORCH_BLOCK=16,SLAB_BLOCK=17,STAIR_BLOCK=18;
// バイオーム固有素材ブロック（そのバイオームの地表にだけ生成される）
// 氷=滑る / 黒曜石=超硬い+敵に壊されない(耐爆) / 水晶・サボテン・キノコ・粘土=クラフト素材
const ICE_BLOCK=19,OBSIDIAN_BLOCK=20,CRYSTAL_BLOCK=21,CACTUS_BLOCK=22,MUSHROOM_BLOCK=23,CLAY_BLOCK=24;
// 建築ブロック: 🪟ガラス(半透明・かまどで砂を焼く) / 🧶ウールブロック(柔らかい建材)
const GLASS_BLOCK=25,WOOL_BLOCK=26;
// 🍃 葉ブロック: 木の傘に使う（以前は草ブロックの傘で側面が土に見えていた）
const LEAF_BLOCK=27;
const SLOT_TI=[0,1,2,3,4,TORCH_BLOCK,SLAB_BLOCK,STAIR_BLOCK,GLASS_BLOCK,WOOL_BLOCK];
// ─── PARTIAL BLOCKS (slabs & stairs) ───
// Shapes are described as 1-2 sub-boxes in local cell coords [x0,y0,z0,x1,y1,z1].
// meta — slab: 0 bottom half / 1 top half; stair: 0-3 = which side the tall
// half faces (+x,+z,-x,-z). The same boxes drive both meshing and collision.
function isPartial(ti){return ti===SLAB_BLOCK||ti===STAIR_BLOCK;}
const STAIR_DIRS=[[1,0],[0,1],[-1,0],[0,-1]];
function shapeBoxes(ti,meta){
  if(ti===SLAB_BLOCK)return meta?[[0,.5,0,1,1,1]]:[[0,0,0,1,.5,1]];
  if(ti===STAIR_BLOCK){
    const d=STAIR_DIRS[meta&3];
    return[[0,0,0,1,.5,1],
           [d[0]>0?.5:0,.5,d[1]>0?.5:0,d[0]<0?.5:1,1,d[1]<0?.5:1]];
  }
  return[[0,0,0,1,1,1]];
}
const boxGeo=new THREE.BoxGeometry(1,1,1);
// Minecraft-style face shading baked into the shared geometry's vertex colors:
// top bright, N/S sides mid, E/W darker, bottom darkest.
// BoxGeometry face order: +x,-x,+y(top),-y(bottom),+z,-z — 4 verts per face.
(function(){
  const FACE_SHADE=[.72,.72,1,.55,.86,.86];
  const cols=new Float32Array(24*3);
  for(let f=0;f<6;f++){const s=FACE_SHADE[f];for(let v=0;v<4;v++){const o=(f*4+v)*3;cols[o]=cols[o+1]=cols[o+2]=s;}}
  boxGeo.setAttribute('color',new THREE.BufferAttribute(cols,3));
})();
// ─── MERGED CHUNK MESHES (greedy chunk meshing foundation) ───
// All opaque cube blocks of a chunk are baked into ONE mesh: only exposed
// faces are emitted, per-corner vertex AO (classic side1/side2/corner rule)
// and the directional face shading are baked into vertex colors, and faces
// are grouped by material so a chunk renders in a handful of draw calls
// instead of one per block. Water and torches stay as individual meshes
// (custom geometry/shader). Editing a block rebuilds only the touched chunks.
const AO_LEVEL=[1,.76,.58,.45];
boxGeo.computeBoundingSphere();boxGeo.computeBoundingBox();
function _aoOccluder(x,y,z){const v=voxels[vKey(x,y,z)];return(v&&v.ti!==WATER_BLOCK&&v.ti!==TORCH_BLOCK&&v.ti!==GLASS_BLOCK&&!isPartial(v.ti))?1:0;}
const _FACE_UV=[[0,0],[1,0],[1,1],[0,1]];
// face order matches blockMats material arrays: +x,-x,+y(top),-y(bottom),+z,-z
const FACE_DEF=(()=>{
  const defs=[
    {n:[1,0,0], c:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]],shade:.72},
    {n:[-1,0,0],c:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]],shade:.72},
    {n:[0,1,0], c:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]],shade:1},
    {n:[0,-1,0],c:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],shade:.55},
    {n:[0,0,1], c:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],shade:.86},
    {n:[0,0,-1],c:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]],shade:.86},
  ];
  for(const d of defs){
    const a=d.n[0]!==0?0:d.n[1]!==0?1:2;
    const t=[0,1,2].filter(i=>i!==a);
    // per corner: offsets of the side1/side2/corner AO probes
    d.ao=d.c.map(c=>{
      const du=c[t[0]]===1?1:-1,dv=c[t[1]]===1?1:-1;
      const s1=[...d.n];s1[t[0]]+=du;
      const s2=[...d.n];s2[t[1]]+=dv;
      const cc=[...d.n];cc[t[0]]+=du;cc[t[1]]+=dv;
      return[s1,s2,cc];
    });
  }
  return defs;
})();
function makeChunkRec(isUnder){
  const mesh=new THREE.Mesh(new THREE.BufferGeometry(),[]);
  mesh.castShadow=!isUnder;mesh.receiveShadow=true;
  mesh.userData.isChunk=true;
  return{keys:new Set(),specials:new Set(),solidMesh:mesh,built:false,loaded:true,under:isUnder};
}
// emit one sub-box of a partial block (slab / stair). Faces flush with the
// cell boundary are culled against full neighbours like normal cube faces;
// inset faces are always drawn. Flat directional shading (no AO probes) and
// UVs cropped to the box extents so the texture doesn't stretch.
function _emitSubBox(buckets,bm,x,y,z,e,skipBottom){
  for(let f=0;f<6;f++){
    if(skipBottom&&f===3)continue; // stair upper box sits on the base box
    const fd=FACE_DEF[f];
    const flush=f===0?e[3]===1:f===1?e[0]===0:f===2?e[4]===1:f===3?e[1]===0:f===4?e[5]===1:e[2]===0;
    if(flush&&_aoOccluder(x+fd.n[0],y+fd.n[1],z+fd.n[2]))continue;
    const mat=Array.isArray(bm)?bm[f]:bm;
    let b=buckets.get(mat);
    if(!b){b={pos:[],nrm:[],uv:[],col:[],idx:[]};buckets.set(mat,b);}
    const vi=b.pos.length/3;
    for(let ci=0;ci<4;ci++){
      const c=fd.c[ci];
      const lx=c[0]?e[3]:e[0],ly=c[1]?e[4]:e[1],lz=c[2]?e[5]:e[2];
      b.pos.push(x+lx,y+ly,z+lz);
      b.nrm.push(fd.n[0],fd.n[1],fd.n[2]);
      b.uv.push(fd.n[0]!==0?lz:lx,fd.n[1]!==0?lz:ly);
      b.col.push(fd.shade,fd.shade,fd.shade);
    }
    b.idx.push(vi,vi+1,vi+2,vi,vi+2,vi+3);
  }
}
function buildChunkMesh(rec){
  const buckets=new Map();
  for(const k of rec.keys){
    const v=voxels[k];if(!v)continue;
    const ti=v.ti;if(ti===WATER_BLOCK||ti===TORCH_BLOCK||ti===GLASS_BLOCK)continue;
    const p=k.split('|');const x=+p[0],y=+p[1],z=+p[2];
    const bm=blockMats[ti];
    if(isPartial(ti)){
      const boxes=shapeBoxes(ti,v.meta||0);
      for(let bi=0;bi<boxes.length;bi++)_emitSubBox(buckets,bm,x,y,z,boxes[bi],ti===STAIR_BLOCK&&bi===1);
      continue;
    }
    for(let f=0;f<6;f++){
      const fd=FACE_DEF[f];
      if(_aoOccluder(x+fd.n[0],y+fd.n[1],z+fd.n[2]))continue; // hidden face
      const mat=Array.isArray(bm)?bm[f]:bm;
      let b=buckets.get(mat);
      if(!b){b={pos:[],nrm:[],uv:[],col:[],idx:[]};buckets.set(mat,b);}
      const vi=b.pos.length/3;
      // grass tops (ti 0/1 face index 2) are tinted per-column so the green
      // blends smoothly across a biome border instead of snapping
      const tint=(f===2&&(ti===0||ti===5))?(v.tint||computeGrassTint(x,z)):null;
      for(let ci=0;ci<4;ci++){
        const c=fd.c[ci];
        b.pos.push(x+c[0],y+c[1],z+c[2]);
        b.nrm.push(fd.n[0],fd.n[1],fd.n[2]);
        b.uv.push(_FACE_UV[ci][0],_FACE_UV[ci][1]);
        const A=fd.ao[ci];
        const s1=_aoOccluder(x+A[0][0],y+A[0][1],z+A[0][2]);
        const s2=_aoOccluder(x+A[1][0],y+A[1][1],z+A[1][2]);
        const cc=_aoOccluder(x+A[2][0],y+A[2][1],z+A[2][2]);
        const sh=fd.shade*AO_LEVEL[(s1&&s2)?3:s1+s2+cc];
        if(tint)b.col.push(sh*tint[0],sh*tint[1],sh*tint[2]);
        else b.col.push(sh,sh,sh);
      }
      b.idx.push(vi,vi+1,vi+2,vi,vi+2,vi+3);
    }
  }
  let vTotal=0,iTotal=0;
  for(const b of buckets.values()){vTotal+=b.pos.length/3;iTotal+=b.idx.length;}
  const pos=new Float32Array(vTotal*3),nrm=new Float32Array(vTotal*3),uv=new Float32Array(vTotal*2),col=new Float32Array(vTotal*3);
  const idx=vTotal>65535?new Uint32Array(iTotal):new Uint16Array(iTotal);
  const geo=new THREE.BufferGeometry(),mats=[];
  let vo=0,io=0;
  for(const[mat,b]of buckets){
    pos.set(b.pos,vo*3);nrm.set(b.nrm,vo*3);uv.set(b.uv,vo*2);col.set(b.col,vo*3);
    for(let i=0;i<b.idx.length;i++)idx[io+i]=b.idx[i]+vo;
    geo.addGroup(io,b.idx.length,mats.length);
    mats.push(mat);
    vo+=b.pos.length/3;io+=b.idx.length;
  }
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('normal',new THREE.BufferAttribute(nrm,3));
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geo.setAttribute('color',new THREE.BufferAttribute(col,3));
  geo.setIndex(new THREE.BufferAttribute(idx,1));
  geo.computeBoundingSphere();geo.computeBoundingBox();
  rec.solidMesh.geometry.dispose();
  rec.solidMesh.geometry=geo;
  rec.solidMesh.material=mats;
  rec.built=true;
}
// chunk record owning given world coordinates (may be null if not generated)
function recAt(x,y,z){
  const cx=Math.floor(x/CHUNK),cz=Math.floor(z/CHUNK);
  if(y<0){const cy=Math.floor(y/CHUNK_Y);return underChunks[ucKey(cx,cy,cz)]||null;}
  return chunks[cKey(cx,cz)]||null;
}
// mark every chunk whose faces/AO can change when (x,y,z) changes
const _dirtyRecs=new Set();
let _deferDirty=false;
function markDirtyAround(x,y,z){
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
    const v=voxels[vKey(x+dx,y+dy,z+dz)];
    if(v&&v.rec)_dirtyRecs.add(v.rec);
    else{const r=recAt(x+dx,y+dy,z+dz);if(r)_dirtyRecs.add(r);}
  }
}
function flushDirtyChunks(){
  if(_deferDirty||!_dirtyRecs.size)return;
  for(const rec of _dirtyRecs){if(rec.built)buildChunkMesh(rec);}
  _dirtyRecs.clear();
}
// ─── PIXEL-ART BLOCK TEXTURES (Minecraft style) ───
// 16x16 procedural textures rendered to canvas, sampled with NearestFilter for
// crisp blocky pixels instead of flat solid colours.
const TEX_SIZE=16;
function _shade(hex,f){ // f: -1..1, negative darkens, positive lightens
  let r=(hex>>16)&255,g=(hex>>8)&255,b=hex&255;
  if(f>=0){r+=(255-r)*f;g+=(255-g)*f;b+=(255-b)*f;}else{r*=(1+f);g*=(1+f);b*=(1+f);}
  return 'rgb('+(r|0)+','+(g|0)+','+(b|0)+')';
}
function _texCtx(){const c=document.createElement('canvas');c.width=c.height=TEX_SIZE;return[c,c.getContext('2d')];}
function _mkTex(c){
  // fake ambient occlusion: darken the outer pixels so each block reads as its own cube
  const x=c.getContext('2d'),s=TEX_SIZE;
  x.fillStyle='rgba(0,0,0,.16)';x.fillRect(0,0,s,1);x.fillRect(0,s-1,s,1);x.fillRect(0,1,1,s-2);x.fillRect(s-1,1,1,s-2);
  x.fillStyle='rgba(0,0,0,.07)';x.fillRect(1,1,s-2,1);x.fillRect(1,s-2,s-2,1);x.fillRect(1,2,1,s-4);x.fillRect(s-2,2,1,s-4);
  const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapNearestFilter;return t;
}
function _rng(seed){let s=seed>>>0||1;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
// speckled solid block (stone, sand, dirt, snow…)
function noisyTex(base,seed,amt){
  amt=amt==null?.14:amt;const[c,x]=_texCtx();const r=_rng(seed);
  for(let j=0;j<TEX_SIZE;j++)for(let i=0;i<TEX_SIZE;i++){
    const v=r();let f=0;
    if(v<.22)f=amt;else if(v<.44)f=-amt;else if(v<.5)f=-amt*1.8;
    x.fillStyle=_shade(base,f);x.fillRect(i,j,1,1);
  }
  return _mkTex(c);
}
// grass/dirt side: dirt body with a jagged grassy fringe along the top
function grassSideTex(grassCol,dirtCol,seed){
  const[c,x]=_texCtx();const r=_rng(seed);
  for(let j=0;j<TEX_SIZE;j++)for(let i=0;i<TEX_SIZE;i++){
    const v=r();x.fillStyle=_shade(dirtCol,v<.3?.12:v<.55?-.12:0);x.fillRect(i,j,1,1);
  }
  for(let i=0;i<TEX_SIZE;i++){
    const h=3+Math.floor(r()*2);
    for(let j=0;j<h;j++){const v=r();x.fillStyle=_shade(grassCol,v<.4?.12:v<.7?-.1:0);x.fillRect(i,j,1,1);}
  }
  return _mkTex(c);
}
// wood log bark: vertical streaks
function logSideTex(base,seed){
  const[c,x]=_texCtx();const r=_rng(seed);
  for(let i=0;i<TEX_SIZE;i++){
    const col=(r()-.5)*.18;
    for(let j=0;j<TEX_SIZE;j++){const v=r();x.fillStyle=_shade(base,col+(v<.18?-.1:v<.28?.08:0));x.fillRect(i,j,1,1);}
  }
  return _mkTex(c);
}
// wood log end: concentric growth rings
function logTopTex(base,seed){
  const[c,x]=_texCtx();
  for(let j=0;j<TEX_SIZE;j++)for(let i=0;i<TEX_SIZE;i++){
    const dx=i-7.5,dy=j-7.5,d=Math.sqrt(dx*dx+dy*dy),ring=Math.sin(d*1.9);
    x.fillStyle=_shade(base,d<1.4?-.2:ring>.3?.12:ring<-.3?-.14:0);x.fillRect(i,j,1,1);
  }
  return _mkTex(c);
}
// brick wall with mortar lines, staggered rows
function brickTex(base,seed){
  const[c,x]=_texCtx();const r=_rng(seed);
  for(let j=0;j<TEX_SIZE;j++)for(let i=0;i<TEX_SIZE;i++){const v=r();x.fillStyle=_shade(base,v<.3?.08:v<.5?-.08:0);x.fillRect(i,j,1,1);}
  x.fillStyle=_shade(base,-.5);
  for(let y=0;y<TEX_SIZE;y+=4)x.fillRect(0,y,TEX_SIZE,1);
  for(let y=0;y<TEX_SIZE;y+=4){const off=((y/4)%2)===0?0:4;for(let xx=off;xx<TEX_SIZE;xx+=8)x.fillRect(xx,y,1,4);}
  return _mkTex(c);
}
// ore: stone body sprinkled with mineral blobs
function oreTex(stoneCol,oreCol,seed){
  const[c,x]=_texCtx();const r=_rng(seed);
  for(let j=0;j<TEX_SIZE;j++)for(let i=0;i<TEX_SIZE;i++){const v=r();x.fillStyle=_shade(stoneCol,v<.3?.1:v<.55?-.12:0);x.fillRect(i,j,1,1);}
  const pts=[[0,0],[1,0],[0,1],[1,1],[2,1],[1,2]];
  for(let b=0;b<6;b++){
    const bx=1+Math.floor(r()*(TEX_SIZE-3)),by=1+Math.floor(r()*(TEX_SIZE-3)),n=2+Math.floor(r()*4);
    for(let p=0;p<n;p++){const o=pts[Math.floor(r()*pts.length)];x.fillStyle=_shade(oreCol,r()<.5?0:.18);x.fillRect(bx+o[0],by+o[1],1,1);}
  }
  return _mkTex(c);
}
// vertexColors picks up the face shading baked into boxGeo
function smat(map,extra){return new THREE.MeshStandardMaterial(Object.assign({map,roughness:.9,metalness:.05,vertexColors:true},extra||{}));}
const _T={
  grassTop:noisyTex(0x6fb13a,11,.13), grassSide:grassSideTex(0x6fb13a,0x7a5230,12), dirt:noisyTex(0x7a5230,13,.14),
  forestTop:noisyTex(0x3f9a3a,14,.13), forestSide:grassSideTex(0x3f9a3a,0x5d4a28,15),
  // neutral (near-white) grass-top used in-world: the actual green comes from
  // the per-column biome tint baked into vertex color, so it can blend
  grassTopNeutral:noisyTex(0xffffff,1101,.13),
  stone:noisyTex(0x8a8f98,21,.12), sand:noisyTex(0xd9c27a,22,.1),
  logSide:logSideTex(0x6b4a2f,23), logTop:logTopTex(0x9a7a4f,24), brick:brickTex(0xc05a4a,25),
  greyStone:noisyTex(0x78909c,26,.12), volcano:noisyTex(0x1a0a00,27,.5), snow:noisyTex(0xeef3ff,28,.06),
  caveDirt:noisyTex(0x6b4226,29,.14), coal:oreTex(0x8a8f98,0x1a1a1a,30), deepStone:noisyTex(0x2a2e3d,31,.18),
  iron:oreTex(0x8a8f98,0xcaa472,32), diamond:oreTex(0x7fb6c8,0x3fe0ff,33), lava:noisyTex(0xff4500,34,.22),
  ice:noisyTex(0xbfe6ff,61,.07), obsidian:noisyTex(0x1b0b2e,62,.35), crystal:oreTex(0x8a8f98,0xcc66ff,63),
  cactus:noisyTex(0x2e9e4f,64,.16), mushroom:oreTex(0xd0483e,0xffe9d0,65), clay:noisyTex(0xb0a08c,66,.1),
  woolBlk:noisyTex(0xf4f4ec,71,.05),
  leaf:noisyTex(0x3f9e3f,72,.22),
};
// BoxGeometry group order: +x,-x,+y(top),-y(bottom),+z,-z
function faceMats(side,top,bottom){const s=smat(side);return[s,s,smat(top),smat(bottom),s,s];}
// shared top material for both grass biomes: same neutral texture, so their
// merged-mesh faces batch into one draw call; the green comes from vertex tint
const _grassTopMat=smat(_T.grassTopNeutral);
const blockMats=BLOCK_COLORS.map((c,i)=>{
  switch(i){
    case 0: {const s=smat(_T.grassSide);return[s,s,_grassTopMat,smat(_T.dirt),s,s];}
    case 1: return smat(_T.stone);
    case 2: return smat(_T.sand);
    case 3: return faceMats(_T.logSide,_T.logTop,_T.logTop);
    case 4: return smat(_T.brick);
    case 5: {const s=smat(_T.forestSide);return[s,s,_grassTopMat,smat(_T.dirt),s,s];}
    case 6: return smat(_T.greyStone);
    case 7: return smat(_T.volcano,{roughness:.3,metalness:.4,emissive:0x330000,emissiveIntensity:.3});
    case LAVA_BLOCK: return smat(_T.lava,{roughness:.8,emissive:0xff2200,emissiveIntensity:1.2,vertexColors:false}); // glows evenly, no face shading
    case SNOW_BLOCK: return smat(_T.snow,{roughness:.3,metalness:.1,emissive:0x8899bb,emissiveIntensity:.08});
    case WATER_BLOCK: return new THREE.MeshStandardMaterial({color:c,roughness:.1,metalness:.2,transparent:true,opacity:.78,emissive:0x003366,emissiveIntensity:.12,vertexColors:true});
    case CAVE_DIRT: return smat(_T.caveDirt);
    case COAL_ORE: return smat(_T.coal,{roughness:.95,metalness:.05,emissive:0x111111,emissiveIntensity:.05});
    case DEEP_STONE: return smat(_T.deepStone,{roughness:.8,metalness:.15,emissive:0x0a0d1a,emissiveIntensity:.1});
    case IRON_ORE: return smat(_T.iron,{roughness:.7,metalness:.35,emissive:0x3a1500,emissiveIntensity:.08});
    case DIAMOND_ORE: return smat(_T.diamond,{roughness:.15,metalness:.7,emissive:0x00aaff,emissiveIntensity:.45,transparent:true,opacity:.95});
    case TORCH_BLOCK: return new THREE.MeshStandardMaterial({color:0x3a2410,roughness:.6,metalness:0,emissive:0xff8a1e,emissiveIntensity:1.15,vertexColors:false});
    case ICE_BLOCK: return smat(_T.ice,{roughness:.05,metalness:.3,transparent:true,opacity:.85,emissive:0x99ccff,emissiveIntensity:.12});
    case OBSIDIAN_BLOCK: return smat(_T.obsidian,{roughness:.15,metalness:.5,emissive:0x30105a,emissiveIntensity:.35});
    case CRYSTAL_BLOCK: return smat(_T.crystal,{roughness:.2,metalness:.4,emissive:0xaa44ff,emissiveIntensity:.4});
    case CACTUS_BLOCK: return smat(_T.cactus);
    case MUSHROOM_BLOCK: return smat(_T.mushroom,{emissive:0x441111,emissiveIntensity:.12});
    case CLAY_BLOCK: return smat(_T.clay);
    case GLASS_BLOCK: return new THREE.MeshStandardMaterial({color:0xbfe6ff,roughness:.05,metalness:.15,transparent:true,opacity:.32,emissive:0x113344,emissiveIntensity:.06,vertexColors:true});
    case WOOL_BLOCK: return smat(_T.woolBlk,{roughness:1});
    case LEAF_BLOCK: return smat(_T.leaf,{roughness:1});
    default: return new THREE.MeshStandardMaterial({color:c,roughness:.9,metalness:.05,vertexColors:true});
  }
});
// slabs & stairs share the stone material so their faces batch with stone blocks
blockMats[SLAB_BLOCK]=blockMats[1];blockMats[STAIR_BLOCK]=blockMats[1];
function applyShadowSetting(){
  SHADOWS_ON=!!settings.shadows;
  renderer.shadowMap.enabled=SHADOWS_ON;
  sun.castShadow=SHADOWS_ON;
  const bump=m=>{if(m)m.needsUpdate=true;};
  for(const bm of blockMats){if(Array.isArray(bm))bm.forEach(bump);else bump(bm);}
  scene.traverse(o=>{if(o.isMesh){if(Array.isArray(o.material))o.material.forEach(bump);else bump(o.material);}});
}
applyShadowSetting();
// ─── WATER: recessed surface + shader waves ───
// Water blocks use a shorter box (top at 14/16 like Minecraft) so the surface
// sits below the neighbouring land, and the top vertices bob on a world-space
// sine field injected into the shared material — adjacent water blocks form
// one continuous wave with zero per-frame JS cost.
const waterGeo=new THREE.BoxGeometry(1,.875,1);
waterGeo.translate(0,-.0625,0); // top at +0.375 (block-top −0.125), bottom flush
waterGeo.setAttribute('color',boxGeo.getAttribute('color')); // reuse face shading
waterGeo.computeBoundingSphere();waterGeo.computeBoundingBox();
// slim torch post that rests on the cell floor (non-solid, glows + casts light)
const torchGeo=new THREE.BoxGeometry(.16,.62,.16);torchGeo.translate(0,-.19,0);
torchGeo.computeBoundingSphere();torchGeo.computeBoundingBox();
// 🪟 ガラス: 半透明なので水と同じく個別メッシュで描画する（マージメッシュに入れると
// 透過と面カリングが破綻するため）。当たり判定は通常ブロックと同じで固体。
const glassGeo=new THREE.BoxGeometry(1,1,1);
glassGeo.setAttribute('color',boxGeo.getAttribute('color')); // reuse face shading (same 24-vert layout)
glassGeo.computeBoundingSphere();glassGeo.computeBoundingBox();
let _waterUniforms=null;
blockMats[WATER_BLOCK].onBeforeCompile=(sh)=>{
  sh.uniforms.uTime={value:0};
  _waterUniforms=sh.uniforms;
  sh.vertexShader='uniform float uTime;\n'+sh.vertexShader.replace(
    '#include <begin_vertex>',
    ['#include <begin_vertex>',
     'vec4 jkW=modelMatrix*vec4(position,1.0);',
     'if(position.y>0.3){transformed.y+=sin(jkW.x*1.9+uTime*1.8)*.05+cos(jkW.z*1.6+uTime*2.2)*.04;}'
    ].join('\n'));
};
// give the hotbar swatches the matching pixel-art look
(function(){
  const swatch=[_T.grassTop,_T.stone,_T.sand,_T.logSide,_T.brick];
  document.querySelectorAll('.hslot .dot').forEach((dot,i)=>{
    const t=swatch[i];if(!t||!t.image)return;
    dot.style.backgroundImage='url('+t.image.toDataURL()+')';
    dot.style.backgroundSize='cover';dot.style.imageRendering='pixelated';
  });
})();
let voxels={},lavaBlocks=new Set(),torchBlocks=new Set();
const vKey=(x,y,z)=>x+'|'+y+'|'+z;const cKey=(cx,cz)=>cx+','+cz;const ucKey=(cx,cy,cz)=>cx+','+cy+','+cz;
let chunks={},activeChunks={};
let underChunks={},activeUnderChunks={};
const TORCH_SPAWN_SAFE_R=10,TORCH_SPAWN_SAFE_Y=6;
function isTorchSpawnProtected(x,y,z){
  if(!torchBlocks.size)return false;
  const r2=TORCH_SPAWN_SAFE_R*TORCH_SPAWN_SAFE_R;
  for(const k of torchBlocks){
    const[tX,tY,tZ]=k.split('|').map(Number);
    if(Math.abs(tY-y)>TORCH_SPAWN_SAFE_Y)continue;
    const dx=tX+.5-x,dz=tZ+.5-z;
    if(dx*dx+dz*dz<=r2)return true;
  }
  return false;
}

const BIOMES={PLAINS:0,DESERT:1,FOREST:2,MOUNTAIN:3,VOLCANO:4,SNOW:5};
function getBiome(wx,wz){
  const b1=noiseB(wx*0.008,wz*0.008),b2=noiseB(wx*0.012+100,wz*0.012+100);
  const bv=noiseV(wx*0.012+50,wz*0.012-50),bs=noiseV(wx*0.009-80,wz*0.009+80);
  if(bv>0.15)return BIOMES.VOLCANO;if(bs>0.22)return BIOMES.SNOW;
  if(b1>0.25)return BIOMES.MOUNTAIN;if(b2<-0.2)return BIOMES.DESERT;
  if(b1<-0.15&&b2>0)return BIOMES.FOREST;return BIOMES.PLAINS;
}
function getBiomeName(b){return['🌿 PLAINS','🏜 DESERT','🌲 FOREST','🪨 MOUNTAIN','🌋 VOLCANO','❄ SNOW'][b];}
function getGroundType(biome){return[0,2,5,1,7,SNOW_BLOCK][biome];}
// ─── BIOME GRASS COLOR BLENDING (Minecraft-style) ───
// Grass tops (ti 0 plains / ti 5 forest) render with a shared neutral texture
// and get their green from this per-column tint instead, so the color fades
// smoothly across a biome border rather than snapping at the tile edge.
const PLAINS_GRASS_RGB=[0x6f/255,0xb1/255,0x3a/255],FOREST_GRASS_RGB=[0x3f/255,0x9a/255,0x3a/255];
function computeGrassTint(wx,wz,biomeAt){
  biomeAt=biomeAt||getBiome;
  let r=0,g=0,b=0,n=0;
  for(let dz=-2;dz<=2;dz+=2)for(let dx=-2;dx<=2;dx+=2){
    const c=biomeAt(wx+dx,wz+dz)===BIOMES.FOREST?FOREST_GRASS_RGB:PLAINS_GRASS_RGB;
    r+=c[0];g+=c[1];b+=c[2];n++;
  }
  return[r/n,g/n,b/n];
}
// ─── 高さ生成（バイオーム境界ブレンド） ───
// 以前はバイオームごとに振幅/底上げを離散的に切り替えていたため、山岳・火山と
// 平原の境目に垂直の壁ができていた。getBiome と同じノイズ場のしきい値を
// スムーズステップの重みに変え、優先度の低い順に係数をブレンドすることで
// 境界がなだらかな斜面になる（ブロックの種類の切り替え自体は getBiome のまま）。
const _BIOME_BLEND_W=0.12; // ブレンド幅（ノイズ値単位）: 大きいほど裾野が広い
function _biomeW(v){const t=v/(2*_BIOME_BLEND_W)+.5;return t<=0?0:t>=1?1:t*t*(3-2*t);}
function getHeight(wx,wz){
  const b1=noiseB(wx*0.008,wz*0.008),b2=noiseB(wx*0.012+100,wz*0.012+100);
  const bv=noiseV(wx*0.012+50,wz*0.012-50),bs=noiseV(wx*0.009-80,wz*0.009+80);
  const n=fbm(wx*0.03,wz*0.03,4);
  // 大きな緩いうねり: 真っ平らだった平原にもゆるやかな丘と窪地を作る
  const roll=fbm(wx*0.006+321,wz*0.006-321,2)*1.6;
  // [振幅, 底上げ] を優先度の低い順にブレンド（後のブレンドほど優先 = getBiome の判定順）
  let amp=1.2,off=0;                                            // PLAINS
  const wF=Math.min(_biomeW(-0.15-b1),_biomeW(b2));             // FOREST: b1<-0.15 && b2>0
  amp+=(1.5-amp)*wF;off+=(0.3-off)*wF;
  const wD=_biomeW(-0.2-b2);                                    // DESERT: b2<-0.2
  amp+=(0.8-amp)*wD;off+=(0-off)*wD;
  const wM=_biomeW(b1-0.25);                                    // MOUNTAIN: b1>0.25
  amp+=(4-amp)*wM;off+=(2-off)*wM;
  const wS=_biomeW(bs-0.22);                                    // SNOW: bs>0.22
  amp+=(2.5-amp)*wS;off+=(0.5-off)*wS;
  const wV=_biomeW(bv-0.15);                                    // VOLCANO: bv>0.15
  amp+=(3.5-amp)*wV;off+=(1.5-off)*wV;
  return Math.max(0,Math.floor(n*amp+off+roll+1));
}
// getHeight()は決定的な生成時の高さで、cave mouth等の3D彫り込みやプレイヤーの
// 採掘・建築による改変を反映しない。落雷・隕石の着弾位置など「今その場に実際に
// 地面があるか」が重要な場面ではこちらを使う。該当チャンクが未生成/その範囲に
// 固体ブロックが無い場合はgetHeight()の値へフォールバックする。
function surfaceHeightAt(wx,wz){
  const top=getHeight(wx,wz);
  for(let y=top+10;y>=top-20;y--){
    const v=voxels[vKey(wx,y,wz)];
    if(v&&v.active&&v.ti!==WATER_BLOCK&&v.ti!==LAVA_BLOCK)return y;
  }
  return top;
}

// Registers a voxel. Cube blocks live in the merged chunk mesh; only water
// and torches get an individual mesh (custom geometry / shader).
// Returns the voxel key (generation collects the keys into its chunk record).
function addBlock(x,y,z,ti,addToScene,playerPlaced,meta){
  const k=vKey(x,y,z);if(voxels[k])return;
  const v={ti,meta:meta|0,active:!!addToScene,playerPlaced:!!playerPlaced,rec:null,mesh:null,tint:null};
  // live placement (player build / world-edit replay): world-gen sets tint
  // itself via tintAt() for its own blend-cache reuse, this covers the rest
  if(addToScene&&(ti===0||ti===5))v.tint=computeGrassTint(x,z);
  if(ti===WATER_BLOCK||ti===TORCH_BLOCK||ti===GLASS_BLOCK){
    const geo=ti===WATER_BLOCK?waterGeo:ti===TORCH_BLOCK?torchGeo:glassGeo;
    const m=new THREE.Mesh(geo,blockMats[ti]);
    m.position.set(x+.5,y+.5,z+.5);
    m.castShadow=false;m.receiveShadow=ti!==TORCH_BLOCK;
    m.userData={x,y,z,isBlock:true,ti};
    v.mesh=m;
  }
  voxels[k]=v;
  if(addToScene){ // live placement (player / world-edit replay)
    const rec=recAt(x,y,z);
    if(rec){v.rec=rec;rec.keys.add(k);if(v.mesh)rec.specials.add(v.mesh);}
    if(v.mesh)scene.add(v.mesh);
    if(ti===LAVA_BLOCK)lavaBlocks.add(k);if(ti===TORCH_BLOCK)torchBlocks.add(k);
    markDirtyAround(x,y,z);
    flushDirtyChunks();
  }
  return k;
}
function removeBlock(x,y,z){
  const k=vKey(x,y,z);const v=voxels[k];if(!v)return;
  if(v.mesh){scene.remove(v.mesh);if(v.rec)v.rec.specials.delete(v.mesh);}
  if(v.rec)v.rec.keys.delete(k);
  lavaBlocks.delete(k);torchBlocks.delete(k);
  delete voxels[k];
  markDirtyAround(x,y,z);
  flushDirtyChunks();
}

// ─── 3D SURFACE CARVING (cliffs, overhangs, cave mouths) ───
// cave mouths: rare, wide low-frequency blobs that drill from the surface
// down into the underground cave field (isUnderSolid carves the same shaft)
function _caveMouth(x,y,z){return noise(x*0.035+777,z*0.035+y*0.02)<-0.34;}
// cliff erosion: notches cut into mountain/volcano flanks; the surviving
// top blocks become ledges and overhangs
function _cliffCarve(x,y,z){return noiseB(x*0.07,z*0.07+y*0.11)>0.34;}
// 🌳 植樹: 原木の幹(高さth) + 🍃葉ブロックの傘。傘は幹の頭を3x3で囲み、
// その上に十字の1層を載せる。（以前は草ブロックの傘で、側面が土に見えて
// キノコのような柱になっていた）
function _growTree(wx,h,wz,th,meshes){
  for(let t=1;t<=th;t++){const m=addBlock(wx,h+t,wz,3,false);if(m)meshes.add(m);}
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
    if(dx!==0||dz!==0){const m=addBlock(wx+dx,h+th,wz+dz,LEAF_BLOCK,false);if(m)meshes.add(m);}
    if(Math.abs(dx)+Math.abs(dz)<=1){const m=addBlock(wx+dx,h+th+1,wz+dz,LEAF_BLOCK,false);if(m)meshes.add(m);}
  }
}
function generateChunk(cx,cz){
  const key=cKey(cx,cz);if(chunks[key])return;
  const meshes=new Set(),ox=cx*CHUNK,oz=cz*CHUNK;
  // per-generation caches: neighbour exposure tests hit the same cells often
  const colCache=new Map(),solidCache=new Map();
  const colAt=(x,z)=>{
    const k=x+'|'+z;let c=colCache.get(k);
    if(!c){
      const h=getHeight(x,z),biome=getBiome(x,z);
      const lakeN=noise(x*.05+777,z*.05+777);
      const lake=(biome===BIOMES.PLAINS&&h===0&&lakeN>0.25)||(biome===BIOMES.FOREST&&h===0&&lakeN>0.45);
      c={h,biome,lake,tint:null};colCache.set(k,c);
    }
    return c;
  };
  // grass tint, memoized per column; reuses colAt so overlapping blend
  // samples between neighbouring columns cost no extra noise calls
  const tintAt=(x,z)=>{const c=colAt(x,z);return c.tint||(c.tint=computeGrassTint(x,z,(xx,zz)=>colAt(xx,zz).biome));};
  // is a surface cell solid? (lakes keep their bed and are never carved)
  const solidAt=(x,y,z)=>{
    if(y<0)return isUnderSolid(x,y,z);
    const k=x+'|'+y+'|'+z;const hit=solidCache.get(k);
    if(hit!==undefined)return hit;
    const c=colAt(x,z);let s;
    if(c.lake)s=y<=c.h-1;
    else if(y>c.h)s=false;
    else if(_caveMouth(x,y,z))s=false;
    else if((c.biome===BIOMES.MOUNTAIN||c.biome===BIOMES.VOLCANO)&&y>=1&&y<c.h&&_cliffCarve(x,y,z))s=false;
    else s=true;
    solidCache.set(k,s);return s;
  };
  for(let lx=0;lx<CHUNK;lx++)for(let lz=0;lz<CHUNK;lz++){
    const wx=ox+lx,wz=oz+lz;
    const ci=colAt(wx,wz),h=ci.h,biome=ci.biome;
    // lakes carve one block down: sandy bed below, water in the ground cell,
    // so the surface sits lower than the surrounding land (Minecraft-style)
    if(ci.lake){
      const mb=addBlock(wx,h-1,wz,2,false);if(mb)meshes.add(mb);
      const mw=addBlock(wx,h,wz,WATER_BLOCK,false);if(mw)meshes.add(mw);
      continue;
    }
    const sub=biome===BIOMES.VOLCANO?7:biome===BIOMES.SNOW?SNOW_BLOCK:1;
    const deepTi=biome===BIOMES.MOUNTAIN?6:biome===BIOMES.VOLCANO?7:1;
    // full-column pass: only exposed solid cells become meshes, so cliff
    // faces, overhang undersides and cave-mouth walls all get real blocks
    for(let y=0;y<=h;y++){
      if(!solidAt(wx,y,wz))continue;
      const exposed=
        !solidAt(wx+1,y,wz)||!solidAt(wx-1,y,wz)||
        !solidAt(wx,y,wz+1)||!solidAt(wx,y,wz-1)||
        !solidAt(wx,y+1,wz)||!solidAt(wx,y-1,wz);
      if(!exposed)continue;
      const ti=y===h?getGroundType(biome):y===h-1?sub:deepTi;
      const m=addBlock(wx,y,wz,ti,false);if(m){meshes.add(m);if(ti===0||ti===5)voxels[m].tint=tintAt(wx,wz);}
    }
    if(!solidAt(wx,h,wz))continue; // top carved away: no features over the hole
    if(biome===BIOMES.VOLCANO){
      if(rand2(wx,wz,30)<0.06){const lm=addBlock(wx,h,wz,LAVA_BLOCK,false);if(lm)meshes.add(lm);if(rand2(wx,wz,31)<0.5){const lm2=addBlock(wx,h+1,wz,LAVA_BLOCK,false);if(lm2)meshes.add(lm2);}}
      if(rand2(wx,wz,32)<0.05){const topH=2+Math.floor(rand2(wx,wz,33)*5);for(let rh=1;rh<=topH;rh++){const mr=addBlock(wx,h+rh,wz,7,false);if(mr)meshes.add(mr);}}
      if(rand2(wx,wz,34)<0.03){const mr=addBlock(wx,h+1,wz,7,false);if(mr)meshes.add(mr);const mr2=addBlock(wx,h+2,wz,7,false);if(mr2)meshes.add(mr2);}
      // 火山限定: 黒曜石（高硬度・敵に壊されない）
      if(rand2(wx,wz,46)<0.03){const mo=addBlock(wx,h+1,wz,OBSIDIAN_BLOCK,false);if(mo)meshes.add(mo);}
    }
    if(biome===BIOMES.SNOW){
      if(rand2(wx,wz,40)<0.04){for(let th=1;th<=4;th++){const mt=addBlock(wx,h+th,wz,3,false);if(mt)meshes.add(mt);}for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const ml=addBlock(wx+dx,h+4,wz+dz,SNOW_BLOCK,false);if(ml)meshes.add(ml);}const top=addBlock(wx,h+5,wz,SNOW_BLOCK,false);if(top)meshes.add(top);}
      if(rand2(wx,wz,41)<0.03){const topH=1+Math.floor(rand2(wx,wz,42)*3);for(let rh=1;rh<=topH;rh++){const mr=addBlock(wx,h+rh,wz,SNOW_BLOCK,false);if(mr)meshes.add(mr);}}
      // 雪原限定: 氷（上に乗ると滑る・氷矢の素材）
      if(rand2(wx,wz,45)<0.045){const mi=addBlock(wx,h+1,wz,ICE_BLOCK,false);if(mi)meshes.add(mi);}
    }
    if(biome===BIOMES.FOREST&&rand2(wx,wz,10)<0.06)_growTree(wx,h,wz,3+Math.floor(rand2(wx,wz,102)*3),meshes); // 高さ3〜5
    // 森林限定: キノコ
    if(biome===BIOMES.FOREST&&rand2(wx,wz,51)<0.02){const mm=addBlock(wx,h+1,wz,MUSHROOM_BLOCK,false);if(mm)meshes.add(mm);}
    if(biome===BIOMES.PLAINS&&rand2(wx,wz,11)<0.008)_growTree(wx,h,wz,3+Math.floor(rand2(wx,wz,103)*2),meshes); // 高さ3〜4
    // 草原限定: 粘土
    if(biome===BIOMES.PLAINS&&rand2(wx,wz,52)<0.012){const mc=addBlock(wx,h+1,wz,CLAY_BLOCK,false);if(mc)meshes.add(mc);}
    if(biome===BIOMES.MOUNTAIN&&rand2(wx,wz,12)<0.04){const top=1+Math.floor(rand2(wx,wz,120)*3);for(let rh=1;rh<=top;rh++){const mr=addBlock(wx,h+rh,wz,6,false);if(mr)meshes.add(mr);}}
    // 岩山限定: 水晶
    if(biome===BIOMES.MOUNTAIN&&rand2(wx,wz,47)<0.025){const mq=addBlock(wx,h+1,wz,CRYSTAL_BLOCK,false);if(mq)meshes.add(mq);}
    if(biome===BIOMES.DESERT&&rand2(wx,wz,13)<0.01){const ms=addBlock(wx,h+1,wz,LEAF_BLOCK,false);if(ms)meshes.add(ms);} // 低木
    // 砂漠限定: サボテン（1〜3段の柱）
    if(biome===BIOMES.DESERT&&rand2(wx,wz,48)<0.02){const ch=1+Math.floor(rand2(wx,wz,49)*3);for(let cy=1;cy<=ch;cy++){const mc=addBlock(wx,h+cy,wz,CACTUS_BLOCK,false);if(mc)meshes.add(mc);}}
  }
  _spawnSurfaceStructures(cx,cz,meshes);
  const rec=makeChunkRec(false);
  for(const k2 of meshes){const v=voxels[k2];if(!v)continue;v.rec=rec;rec.keys.add(k2);if(v.mesh)rec.specials.add(v.mesh);}
  chunks[key]=rec;
  // a new chunk changes visible faces/AO along its borders: rebuild any
  // neighbour whose merged mesh was already built
  const nb=[chunks[cKey(cx-1,cz)],chunks[cKey(cx+1,cz)],chunks[cKey(cx,cz-1)],chunks[cKey(cx,cz+1)],underChunks[ucKey(cx,-1,cz)]];
  for(const r of nb)if(r&&r.built)buildChunkMesh(r);
}
function _showRec(rec){
  if(!rec.built)buildChunkMesh(rec);
  scene.add(rec.solidMesh);
  for(const m of rec.specials)scene.add(m);
  for(const k of rec.keys){const v=voxels[k];if(!v)continue;v.active=true;if(v.ti===LAVA_BLOCK)lavaBlocks.add(k);if(v.ti===TORCH_BLOCK)torchBlocks.add(k);}
}
function _hideRec(rec){
  scene.remove(rec.solidMesh);
  for(const m of rec.specials)scene.remove(m);
  for(const k of rec.keys){const v=voxels[k];if(!v)continue;v.active=false;lavaBlocks.delete(k);torchBlocks.delete(k);}
}
function showChunk(cx,cz){const key=cKey(cx,cz);if(!chunks[key]||activeChunks[key])return;_showRec(chunks[key]);activeChunks[key]=true;}
function hideChunk(cx,cz){const key=cKey(cx,cz);if(!activeChunks[key]||!chunks[key])return;_hideRec(chunks[key]);delete activeChunks[key];}
function showUnderChunk(cx,cy,cz){const key=ucKey(cx,cy,cz);if(!underChunks[key]||activeUnderChunks[key])return;_showRec(underChunks[key]);activeUnderChunks[key]=true;}
function hideUnderChunk(cx,cy,cz){const key=ucKey(cx,cy,cz);if(!activeUnderChunks[key]||!underChunks[key])return;_hideRec(underChunks[key]);delete activeUnderChunks[key];}
let lastPCX=null,lastPCZ=null,lastPCY=null;
function updateChunks(force){
  const pcx=Math.floor(P.x/CHUNK),pcz=Math.floor(P.z/CHUNK),pcy=Math.floor(P.y/CHUNK_Y);
  if(!force&&pcx===lastPCX&&pcz===lastPCZ&&pcy===lastPCY)return false;
  lastPCX=pcx;lastPCZ=pcz;lastPCY=pcy;
  const needed={},neededU={},list=[];
  for(let dx=-DRAW_R;dx<=DRAW_R;dx++)for(let dz=-DRAW_R;dz<=DRAW_R;dz++){
    list.push([pcx+dx,pcz+dz]);
  }
  // pass 1: generate all needed chunks (voxels only). Doing this before any
  // mesh build means fresh chunks see all their neighbours → no rebuild storm
  let grew=false;
  for(const[cx,cz]of list){
    if(!chunks[cKey(cx,cz)]){generateChunk(cx,cz);grew=true;}
    if(!underChunks[ucKey(cx,-1,cz)]){generateUnderChunk(cx,-1,cz);grew=true;}
    if(P.y<0){for(let dy=0;dy<=DRAW_RY;dy++){const cy=pcy-dy;if(cy>=-1||cy<WORLD_CY_MIN)continue;if(!underChunks[ucKey(cx,cy,cz)]){generateUnderChunk(cx,cy,cz);grew=true;}}}
  }
  // pass 2: build (lazily inside show) + show
  for(const[cx,cz]of list){
    needed[cKey(cx,cz)]=true;showChunk(cx,cz);
    neededU[ucKey(cx,-1,cz)]=true;showUnderChunk(cx,-1,cz);
    if(P.y<0){for(let dy=0;dy<=DRAW_RY;dy++){const cy=pcy-dy;if(cy>=-1||cy<WORLD_CY_MIN)continue;neededU[ucKey(cx,cy,cz)]=true;showUnderChunk(cx,cy,cz);}}
  }
  for(const key in activeChunks){if(!needed[key]){const[cx,cz]=key.split(',').map(Number);hideChunk(cx,cz);}}
  for(const key in activeUnderChunks){if(!neededU[key]){const[cx,cy,cz]=key.split(',').map(Number);hideUnderChunk(cx,cy,cz);}}
  unloadFarChunks(pcx,pcz);
  return grew;
}
// fully evict chunks well outside the view distance: dispose their merged
// mesh geometry and drop their blocks from voxels{}, so a long walk in one
// direction doesn't grow memory forever. Re-entering the area later just
// regenerates it (deterministic from the seed) and worldEdits re-applies
// any player changes there.
function _disposeChunkRec(rec){
  _dirtyRecs.delete(rec);
  rec.solidMesh.geometry.dispose();
  for(const k of rec.keys){lavaBlocks.delete(k);torchBlocks.delete(k);delete voxels[k];}
  rec.keys.clear();rec.specials.clear();
}
function unloadFarChunks(pcx,pcz){
  for(const key in chunks){
    if(activeChunks[key])continue;
    const[cx,cz]=key.split(',').map(Number);
    if(Math.max(Math.abs(cx-pcx),Math.abs(cz-pcz))>UNLOAD_R){_disposeChunkRec(chunks[key]);delete chunks[key];}
  }
  for(const key in underChunks){
    if(activeUnderChunks[key])continue;
    const[cx,,cz]=key.split(',').map(Number);
    if(Math.max(Math.abs(cx-pcx),Math.abs(cz-pcz))>UNLOAD_R){_disposeChunkRec(underChunks[key]);delete underChunks[key];}
  }
}
function clearWorld(){
  resetFrozenVillage(); // ⏳ 時間が止まった村の静止メッシュ（矢・炎・グロー）も一緒に破棄
  const drop=(rec)=>{scene.remove(rec.solidMesh);rec.solidMesh.geometry.dispose();for(const m of rec.specials)scene.remove(m);};
  for(const key in chunks)drop(chunks[key]);
  for(const key in underChunks)drop(underChunks[key]);
  chunks={};activeChunks={};underChunks={};activeUnderChunks={};voxels={};lavaBlocks.clear();torchBlocks.clear();_dirtyRecs.clear();lastPCX=null;lastPCZ=null;lastPCY=null;
}

// ─── UNDERGROUND GENERATION ───
function _underRoomType(rx,ry,rz){
  const cd=-(ry*8+4);if(cd<9||cd>32)return 0;
  const r=rand3(rx,ry+5000,rz,WORLD_SEED+99887);
  if(cd>=10&&cd<=22&&r<0.04)return 1; // mine room
  if(cd>22&&r<0.032)return 2;          // altar room
  return 0;
}
function _isRoomVoid(wx,wy,wz){
  const depth=-wy;if(depth<9||depth>32)return false;
  const rx=Math.floor(wx/24),ry=Math.floor(wy/8),rz=Math.floor(wz/24);
  const rt=_underRoomType(rx,ry,rz);if(!rt)return false;
  const lx=wx-rx*24,ly=wy-ry*8,lz=wz-rz*24;
  if(rt===1)return lx>=8&&lx<=16&&ly>=1&&ly<=3&&lz>=8&&lz<=16;
  return lx>=9&&lx<=15&&ly>=1&&ly<=4&&lz>=9&&lz<=15;
}
function isUnderSolid(wx,wy,wz){
  if(_isRoomVoid(wx,wy,wz))return false;
  const depth=-wy;
  // surface cave mouths continue straight down so entrances always connect
  if(depth<=22&&_caveMouth(wx,wy,wz))return false;
  const n1=noiseB(wx*0.09+wy*0.13,wz*0.09);
  const n2=noiseV(wx*0.09,wz*0.09+wy*0.13);
  const base=(n1+n2)*0.5;
  if(depth>22){
    // Deep: large cathedral voids carved by low-freq noise
    const bigCave=noise(wx*0.025+777,wz*0.025+wy*0.015);
    if(bigCave<-0.25)return false; // carve open void
    return base<=0.11;
  }
  if(depth>10){
    // Mid: finer branching passages via mixed frequencies
    const nFine=noiseV(wx*0.18+wy*0.24+444,wz*0.18);
    return(base*0.65+nFine*0.35)<=0.12;
  }
  // Shallow: standard caves
  return base<=0.12;
}
function generateUnderChunk(cx,cy,cz){
  const key=ucKey(cx,cy,cz);if(underChunks[key])return;
  const meshes=new Set(),ox=cx*CHUNK,oy=cy*CHUNK_Y,oz=cz*CHUNK;
  const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for(let lx=0;lx<CHUNK;lx++)for(let lz=0;lz<CHUNK;lz++)for(let ly=0;ly<CHUNK_Y;ly++){
    const wx=ox+lx,wy=oy+ly,wz=oz+lz;
    if(!isUnderSolid(wx,wy,wz))continue; // cave air
    if(!dirs.some(([dx,dy,dz])=>!isUnderSolid(wx+dx,wy+dy,wz+dz)))continue; // fully interior
    const depth=-wy;
    let ti;
    if(depth<=10){
      ti=rand3(wx,wy,wz,80)<0.22?1:CAVE_DIRT;
      if(rand3(wx,wy,wz,81)<0.02&&depth>5)ti=COAL_ORE;
    }else if(depth<=16){
      ti=1;
      if(rand3(wx,wy,wz,52)<0.05)ti=COAL_ORE;
      if(depth>13&&rand3(wx,wy,wz,55)<0.012)ti=IRON_ORE;
    }else if(depth<=22){
      ti=DEEP_STONE;
      if(rand3(wx,wy,wz,53)<0.03)ti=IRON_ORE;
      if(rand3(wx,wy,wz,57)<0.008)ti=DIAMOND_ORE;
    }else if(depth<=28){
      ti=DEEP_STONE;
      if(rand3(wx,wy,wz,54)<0.018)ti=IRON_ORE;
      if(rand3(wx,wy,wz,58)<0.015)ti=DIAMOND_ORE;
    }else{
      ti=DEEP_STONE;
      if(rand3(wx,wy,wz,62)<0.025)ti=DIAMOND_ORE;
    }
    if(wy===WORLD_CY_MIN*CHUNK_Y){
      const hx=Math.floor(wx/3)*3,hz=Math.floor(wz/3)*3;
      if(rand3(hx,-32,hz,8888)<0.38)continue;
      ti=LAVA_BLOCK;
    }
    const m=addBlock(wx,wy,wz,ti,false);if(m)meshes.add(m);
  }
  _spawnRoomContent(cx,cy,cz,meshes);
  const rec=makeChunkRec(true);
  for(const k2 of meshes){const v=voxels[k2];if(!v)continue;v.rec=rec;rec.keys.add(k2);if(v.mesh)rec.specials.add(v.mesh);}
  underChunks[key]=rec;
  // rebuild built neighbours whose border faces/AO change now that we exist
  const nb=[
    underChunks[ucKey(cx-1,cy,cz)],underChunks[ucKey(cx+1,cy,cz)],
    underChunks[ucKey(cx,cy,cz-1)],underChunks[ucKey(cx,cy,cz+1)],
    underChunks[ucKey(cx,cy-1,cz)],underChunks[ucKey(cx,cy+1,cz)],
    cy===-1?chunks[cKey(cx,cz)]:null,
  ];
  for(const r of nb)if(r&&r.built)buildChunkMesh(r);
}

// ─── UNDERGROUND ROOMS ───
let underTreasures={},openedTreasureKeys=new Set();
function _makeTreasureMesh(type){
  const root=new THREE.Object3D();
  // type 1=古い宝箱(茶) / 2=地下祭壇(青) / 3=地上構造物(金)
  const bodyCol=type===2?0x1a3a50:type===3?0x6a4a12:0x4a2c0a;
  const lidCol=type===2?0x0088cc:type===3?0xcaa032:0x7a4a10;
  const emCol=type===2?0x005588:type===3?0x6a5010:0;
  const emI=type===2?.5:type===3?.45:0;
  const bMat=new THREE.MeshStandardMaterial({color:bodyCol,roughness:.7,metalness:type===3?.3:0});
  const lMat=new THREE.MeshStandardMaterial({color:lidCol,roughness:.5,metalness:type===3?.4:0,emissive:emCol,emissiveIntensity:emI});
  const lockMat=new THREE.MeshStandardMaterial({color:0xddcc44,roughness:.4,metalness:.6});
  const body=new THREE.Mesh(new THREE.BoxGeometry(.78,.5,.58),bMat);body.position.y=.25;
  const lid=new THREE.Mesh(new THREE.BoxGeometry(.78,.18,.58),lMat);lid.position.y=.59;
  const lock=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.07),lockMat);lock.position.set(0,.55,.31);
  root.add(body,lid,lock);markShadowCaster(root);return root;
}
function _spawnRoomContent(cx,cy,cz,meshes){
  const ox=cx*CHUNK,oy=cy*CHUNK_Y,oz=cz*CHUNK;
  const rxA=Math.floor((ox-8)/24),rxB=Math.floor((ox+CHUNK+7)/24);
  const rzA=Math.floor((oz-8)/24),rzB=Math.floor((oz+CHUNK+7)/24);
  const pb=(wx,wy,wz,ti)=>{if(wx<ox||wx>=ox+CHUNK||wy<oy||wy>=oy+CHUNK_Y||wz<oz||wz>=oz+CHUNK)return;const m=addBlock(wx,wy,wz,ti,false);if(m)meshes.add(m);};
  for(let rx=rxA;rx<=rxB;rx++)for(let rz=rzA;rz<=rzB;rz++){
    const rt=_underRoomType(rx,cy,rz);if(!rt)continue;
    const wcx=rx*24,wcy=cy*CHUNK_Y,wcz=rz*24;
    if(rt===1){ // 廃採掘部屋: 木の支柱 + 宝箱
      [[8,1,8],[8,2,8],[16,1,8],[16,2,8],[8,1,16],[8,2,16],[16,1,16],[16,2,16]].forEach(([dlx,dly,dlz])=>pb(wcx+dlx,wcy+dly,wcz+dlz,3));
      if(rand3(rx,cy,rz,77)<0.5){pb(wcx+8,wcy+2,wcz+12,COAL_ORE);pb(wcx+8,wcy+1,wcz+11,COAL_ORE);}
      const tx=wcx+12,ty=wcy+1,tz=wcz+12,tk=vKey(tx,ty,tz);
      if(!underTreasures[tk]&&tx>=ox&&tx<ox+CHUNK&&tz>=oz&&tz<oz+CHUNK&&ty>=oy&&ty<oy+CHUNK_Y){
        const mesh=_makeTreasureMesh(1);mesh.position.set(tx+.5,ty,tz+.5);
        if(!openedTreasureKeys.has(tk))scene.add(mesh);
        underTreasures[tk]={mesh,opened:openedTreasureKeys.has(tk),type:1};
      }
    }else{ // 地下祭壇: クリスタル柱 + 祭壇石 + 宝箱
      [[9,1,9],[9,2,9],[9,3,9],[15,1,9],[15,2,9],[15,3,9],[9,1,15],[9,2,15],[9,3,15],[15,1,15],[15,2,15],[15,3,15]].forEach(([dlx,dly,dlz])=>pb(wcx+dlx,wcy+dly,wcz+dlz,DIAMOND_ORE));
      pb(wcx+12,wcy+1,wcz+12,DEEP_STONE);pb(wcx+12,wcy+2,wcz+12,DIAMOND_ORE);
      const tx=wcx+10,ty=wcy+1,tz=wcz+10,tk=vKey(tx,ty,tz);
      if(!underTreasures[tk]&&tx>=ox&&tx<ox+CHUNK&&tz>=oz&&tz<oz+CHUNK&&ty>=oy&&ty<oy+CHUNK_Y){
        const mesh=_makeTreasureMesh(2);mesh.position.set(tx+.5,ty,tz+.5);
        if(!openedTreasureKeys.has(tk))scene.add(mesh);
        underTreasures[tk]={mesh,opened:openedTreasureKeys.has(tk),type:2};
      }
    }
  }
}
function _disposeTreasureMesh(mesh){mesh.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});}
function resetTreasures(){for(const k in underTreasures){scene.remove(underTreasures[k].mesh);_disposeTreasureMesh(underTreasures[k].mesh);}underTreasures={};openedTreasureKeys=new Set();treasureMap=null;$treasureInfo.classList.remove('show');const tc=document.getElementById('treasureCompass');if(tc)tc.style.display='none';}
function _treasureNearby(){for(const k in underTreasures){const t=underTreasures[k];if(t.opened)continue;const[tx,ty,tz]=k.split('|').map(Number);if(Math.hypot(tx+.5-P.x,ty+.3-(P.y+.8),tz+.5-P.z)<2.5)return true;}return false;}
function _updateTreasureInfo(){
  let near=null,nearD=2.5;
  for(const k in underTreasures){const t=underTreasures[k];if(t.opened)continue;const[tx,ty,tz]=k.split('|').map(Number);const d=Math.hypot(tx+.5-P.x,ty+.3-(P.y+.8),tz+.5-P.z);if(d<nearD){nearD=d;near={k,t};}}
  if(near){$treasureInfo.textContent=near.t.type===2?'💠 地下祭壇の宝箱！ 長押しで開ける':near.t.type===3?'🗺 構造物の宝箱！ 長押しで開ける':'📦 古い宝箱！ 長押しで開ける';$treasureInfo.classList.add('show');}
  else $treasureInfo.classList.remove('show');
}
function openTreasure(){
  if(!gs.running)return;
  let nearK=null,nearD=2.5;
  for(const k in underTreasures){const t=underTreasures[k];if(t.opened)continue;const[tx,ty,tz]=k.split('|').map(Number);const d=Math.hypot(tx+.5-P.x,ty+.3-(P.y+.8),tz+.5-P.z);if(d<nearD){nearD=d;nearK=k;}}
  if(!nearK)return;
  const t=underTreasures[nearK];t.opened=true;openedTreasureKeys.add(nearK);scene.remove(t.mesh);_disposeTreasureMesh(t.mesh);
  const hadDiamond=inv.diamond>0;
  let msg='';
  let mapCompleted=false;
  if(t.type===3){
    // 地上構造物の宝箱: 豪華な報酬。構造物の種類ごとに味付けする
    const d=2+Math.floor(Math.random()*3);inv.diamond+=d;msg='💎×'+d;
    if(Math.random()<0.5){const a=8+Math.floor(Math.random()*8);inv.arrow+=a;msg+=' 🏹×'+a;}
    if(Math.random()<0.4){const ii=1+Math.floor(Math.random()*3);inv.ironIngot+=ii;msg+=' 🔩×'+ii;}
    if(t.struct==='pyramid'&&Math.random()<0.35){inv.dragonCore+=1;msg+=' 💠×1';}
    if(t.struct==='igloo'&&Math.random()<0.6){const ic=2+Math.floor(Math.random()*3);inv.ice+=ic;msg+=' 🧊×'+ic;}
    if(t.struct==='ruins'&&Math.random()<0.5){const m=1+Math.floor(Math.random()*3);meat+=m;updateMeatHUD();msg+=' 🥩×'+m;}
    if(t.struct==='hut'){
      const m=1+Math.floor(Math.random()*2);meat+=m;updateMeatHUD();msg+=' 🥩×'+m;
      const tor=2+Math.floor(Math.random()*3);inv.torch+=tor;msg+=' 🔥×'+tor;
    }
    gs.score+=400;
    unlockAchievement('structureRaider');
    // 宝の地図が指していた宝ならクリア報酬
    if(treasureMap&&nearK===treasureMap.key){treasureMap=null;mapCompleted=true;gs.score+=600;inv.diamond+=2;msg+=' +💎×2(地図ボーナス)';unlockAchievement('mapMaster');const tc=document.getElementById('treasureCompass');if(tc)tc.style.display='none';}
  }else if(t.type===2){
    const d=1+Math.floor(Math.random()*2);inv.diamond+=d;msg='💎×'+d;
    if(Math.random()<0.08){inv.dragonCore+=1;msg+=' 💠×1';}
    if(Math.random()<0.35){const a=5+Math.floor(Math.random()*6);inv.arrow+=a;msg+=' 🏹×'+a;}
    // 地下祭壇では時々🗺宝の地図が手に入る（地上の構造物へ導く）
    if(!treasureMap){
      const target=findNearestStructure(P.x,P.z,64);
      if(target){treasureMap=target;msg+=' 🗺宝の地図';setTimeout(()=>{if(gs.running)showAlert('🗺 宝の地図を発見！ コンパスが示す地上の宝を探せ');},1400);}
    }
  }else{
    const roll=Math.random();
    if(roll<0.30){const w=2+Math.floor(Math.random()*3);inv.wood+=w;msg='🪵×'+w;}
    else if(roll<0.55){const s=3+Math.floor(Math.random()*3);inv.stone+=s;msg='🪨×'+s;}
    else if(roll<0.75){const a=4+Math.floor(Math.random()*5);inv.arrow+=a;msg='🏹×'+a;}
    else if(roll<0.90){const m=1+Math.floor(Math.random()*2);meat+=m;updateMeatHUD();msg='🥩×'+m;}
    else{inv.diamond+=1;msg='💎×1';}
  }
  updateInvHUD();
  if(!hadDiamond&&inv.diamond>0)unlockAchievement('firstDiamond');
  showBonus((t.type===3?'🗝 宝箱を開けた！ ':'📦 宝箱を開けた！ ')+msg);
  if(mapCompleted)setTimeout(()=>{if(gs.running)showAlert('🗺 地図の宝を発見！ 大量の財宝を手に入れた');},600);
  unlockAchievement('treasureHunter');
  playTone(900,.12,.1,'sine');setTimeout(()=>playTone(1300,.08,.08,'sine'),90);
  _updateTreasureInfo();saveGame();
}

// ─── 地上構造物（バイオーム別の建造物 + 宝箱） ───
// 世界シードから決定的に生成される。グリッド1マスにつき最大1つ、対応バイオーム
// （🏜砂漠=ピラミッド / ❄雪原=イグルー / 🌲森・🌿草原=遺跡）にのみ出現する。
// 各構造物の中心には🗝金の宝箱（type 3）が入っており、豪華な報酬が手に入る。
const STRUCT_GRID=80;   // 構造物グリッドの1マスのブロック数
const STRUCT_PAD=5;     // 構造物の最大フットプリント半径（チャンク重なり判定用）
function _structSeed(a){return((WORLD_SEED^0x5bd1e9)>>>0)+a;}
// グリッドマス(gx,gz)に構造物があるか判定し、あれば中心座標と種類を返す
function structAt(gx,gz){
  if(rand2(gx,gz,_structSeed(1))>=0.5)return null;        // 半分のマスにのみ抽選
  const jx=8+Math.floor(rand2(gx,gz,_structSeed(2))*(STRUCT_GRID-16));
  const jz=8+Math.floor(rand2(gx,gz,_structSeed(3))*(STRUCT_GRID-16));
  const wx=gx*STRUCT_GRID+jx,wz=gz*STRUCT_GRID+jz;
  if(Math.abs(wx)<14&&Math.abs(wz)<14)return null;        // 開始地点の真上は避ける
  const biome=getBiome(wx,wz);
  let type;
  if(biome===BIOMES.DESERT)type='pyramid';
  else if(biome===BIOMES.SNOW)type='igloo';
  else if(biome===BIOMES.FOREST||biome===BIOMES.PLAINS)type=rand2(gx,gz,_structSeed(6))<0.58?'hut':'ruins';
  else return null; // 火山・岩山には生成しない
  return{type,wx,wz,biome};
}
// 構造物の宝箱voxelキー（生成側と地図側で同じ位置を指すよう一元化）
function structChestKey(s){return vKey(s.wx,getHeight(s.wx,s.wz)+1,s.wz);}
// このチャンクに重なる構造物のブロックと宝箱を配置する
function _spawnSurfaceStructures(cx,cz,meshes){
  const ox=cx*CHUNK,oz=cz*CHUNK;
  const gA=Math.floor((ox-STRUCT_PAD)/STRUCT_GRID),gB=Math.floor((ox+CHUNK+STRUCT_PAD)/STRUCT_GRID);
  const gzA=Math.floor((oz-STRUCT_PAD)/STRUCT_GRID),gzB=Math.floor((oz+CHUNK+STRUCT_PAD)/STRUCT_GRID);
  const pb=(wx,wy,wz,ti)=>{if(wx<ox||wx>=ox+CHUNK||wz<oz||wz>=oz+CHUNK)return;const m=addBlock(wx,wy,wz,ti,false);if(m)meshes.add(m);};
  for(let gx=gA;gx<=gB;gx++)for(let gz=gzA;gz<=gzB;gz++){
    const s=structAt(gx,gz);if(!s)continue;
    const h=getHeight(s.wx,s.wz);
    const cxw=s.wx,czw=s.wz;
    if(s.type==='pyramid'){
      // 段々ピラミッド（砂）: 5x5→3x3→1x1。中心底に宝箱、宝箱セルは空ける
      for(let t=0;t<3;t++){const e=2-t;for(let dx=-e;dx<=e;dx++)for(let dz=-e;dz<=e;dz++){if(t===0&&dx===0&&dz===0)continue;pb(cxw+dx,h+1+t,czw+dz,2);}}
    }else if(s.type==='igloo'){
      // 雪のドーム（半球シェル）: 入口を1つ空ける。中心床は空けて宝箱を置く
      for(let dx=-3;dx<=3;dx++)for(let dy=0;dy<=3;dy++)for(let dz=-3;dz<=3;dz++){
        const r2=dx*dx+dy*dy+dz*dz;if(r2<4.8||r2>10.5)continue;
        if(dz>=2&&dx===0&&dy<=1)continue; // 入口
        pb(cxw+dx,h+1+dy,czw+dz,SNOW_BLOCK);
      }
    }else if(s.type==='hut'){
      for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
        if(dx===0&&dz===0)continue;
        pb(cxw+dx,h+1,czw+dz,3);
      }
      for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
        const edge=Math.max(Math.abs(dx),Math.abs(dz))===3;
        if(!edge)continue;
        if(dz===3&&Math.abs(dx)<=1)continue;
        for(let dy=2;dy<=3;dy++)pb(cxw+dx,h+dy,czw+dz,3);
      }
      for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){
        if(Math.abs(dx)===4&&Math.abs(dz)===4)continue;
        pb(cxw+dx,h+4,czw+dz,4);
      }
      pb(cxw-2,h+2,czw-2,TORCH_BLOCK);
      pb(cxw+2,h+2,czw+2,TORCH_BLOCK);
    }else{ // ruins: 崩れたレンガの壁 + 四隅の石柱。中心に宝箱
      for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
        if(Math.max(Math.abs(dx),Math.abs(dz))!==2)continue; // 外周のみ
        const rr=rand2(cxw+dx,czw+dz,_structSeed(7));
        const wh=rr<0.35?0:rr<0.7?1:2; // 崩れ具合で高さがまばら
        for(let dy=1;dy<=wh;dy++)pb(cxw+dx,h+dy,czw+dz,4);
      }
      [[-2,-2],[2,-2],[-2,2],[2,2]].forEach(([dx,dz])=>{for(let dy=1;dy<=3;dy++)pb(cxw+dx,h+dy,czw+dz,1);});
    }
    // 宝箱（このチャンクが宝箱セルを含む場合のみ登録）
    const tx=cxw,ty=h+1,tz=czw,tk=vKey(tx,ty,tz);
    if(!underTreasures[tk]&&tx>=ox&&tx<ox+CHUNK&&tz>=oz&&tz<oz+CHUNK){
      const mesh=_makeTreasureMesh(3);mesh.position.set(tx+.5,ty,tz+.5);
      if(!openedTreasureKeys.has(tk))scene.add(mesh);
      underTreasures[tk]={mesh,opened:openedTreasureKeys.has(tk),type:3,struct:s.type};
    }
  }
}
// ═══ 特殊構造物 生成共通ヘルパー（put/clr/anchor/chunk-ensure/ybase）═══
// 賢者の樹庭・プレアデス監視塔など、クリエイティブのワンクリック特殊生成が共通で使う
// 部品。put/clr は状態を持たないので、どのジェネレータからも安全に呼べる。

// put: ワールド生成ブロックの上書きは removed と placed の両方を記録する。
// applyWorldEdits は removed→placed の順で再生し、placed は既存 voxel を
// スキップするため、removed が無いと再訪時に元の地形が勝ってしまう。
// meta も doPlace(input.js)/applyWorldEdits(save.js) と同じ ti|(meta<<5) で
// パックする（旧実装は meta を捨てておりトーチ以外は無害だったが、階段の
// 向きは meta 依存なのでここを直さないとセーブ&ロードで向きが復元されない）。
function put(x,y,z,ti,meta){
  meta=meta|0;
  const k=vKey(x,y,z),v=voxels[k];
  if(v){
    if(v.ti===ti&&(v.meta|0)===meta)return;
    if(v.playerPlaced)delete worldEdits.placed[k];else worldEdits.removed[k]=true;
    removeBlock(x,y,z);
  }
  addBlock(x,y,z,ti,true,true,meta);
  worldEdits.placed[k]=ti|(meta<<5);
}
// clr: ドロップなしの破壊（breakBlock と同じ worldEdits イディオム）
function clr(x,y,z){
  const k=vKey(x,y,z),v=voxels[k];
  if(!v)return;
  if(v.playerPlaced)delete worldEdits.placed[k];else worldEdits.removed[k]=true;
  removeBlock(x,y,z);
}
// プレイヤーのカメラ水平前方 dist ブロック先を中心アンカーにする
function _frontAnchor(dist){
  camera.getWorldDirection(_rd);
  let fx=_rd.x,fz=_rd.z,fl=Math.hypot(fx,fz);
  if(fl<0.1){fx=-Math.sin(yaw);fz=-Math.cos(yaw);fl=Math.hypot(fx,fz)||1;}
  fx/=fl;fz/=fl;
  const cx0=Math.floor(P.x+fx*dist),cz0=Math.floor(P.z+fz*dist);
  return{fx,fz,cx0,cz0,aim:Math.atan2(fz,fx)};
}
// フットプリント半径 R が重なりうる全チャンクを事前生成する。未生成チャンク
// への addBlock は不可視の孤児 voxel になるため（applyWorldEdits と同じ理由）
function _ensureChunksAround(cx0,cz0,R,pad){
  pad=pad==null?2:pad;
  for(let cx=Math.floor((cx0-R-pad)/CHUNK);cx<=Math.floor((cx0+R+pad)/CHUNK);cx++)
    for(let cz=Math.floor((cz0-R-pad)/CHUNK);cz<=Math.floor((cz0+R+pad)/CHUNK);cz++)
      generateChunk(cx,cz);
}
// 周辺地表の中央値と中心直下の高さの高い方（丘に半分埋まった土台を避ける）
function _footprintYBase(cx0,cz0,R,step){
  step=step||5;
  const hs=[];
  for(let dx=-R;dx<=R;dx+=step)for(let dz=-R;dz<=R;dz+=step){
    if(dx*dx+dz*dz>R*R)continue;
    hs.push(surfaceHeightAt(cx0+dx,cz0+dz));
  }
  hs.sort((a,b)=>a-b);
  return Math.max(hs[Math.floor(hs.length/2)],surfaceHeightAt(cx0,cz0));
}

// ═══ 🏔 賢者の樹庭 ワンクリック生成 ═══
// クリエイティブ専用: プレイヤーの前方に「岩の尖塔群＋頂上アーチ＋巨木＋池」を
// 一発生成する。結果は worldEdits に記録されるため、通常の建築と同じくセーブ・
// チャンク再訪で復元される（形は押すたびに Math.random() で変わってよい）。
function generateSageGarden(){
  const{fx,fz,cx0,cz0,aim}=_frontAnchor(20);
  const R=13;                      // 土台の半径（直径27 ≒ 3×3チャンクに収まる）
  _ensureChunksAround(cx0,cz0,R,2);
  const rock=()=>Math.random()<0.8?6:1; // 灰岩8割＋石2割のまだら模様

  _deferDirty=true; // 数千ブロックの一括編集: チャンク再構築は最後に1回ずつ
  try{
    const ybase=_footprintYBase(cx0,cz0,R,5);
    const yTop=ybase+30; // モバイルのフォグ far(≈47)より下に収める

    // ─ 1. 草の土台: 低い列は石で盛り、丘や木は ybase で切って草でフタをする ─
    for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
      const d2=dx*dx+dz*dz;if(d2>R*R)continue;
      const x=cx0+dx,z=cz0+dz;
      const sh=surfaceHeightAt(x,z);
      // 低地の縁だけギザギザに（丘の列をスキップすると池の上に丘が残るため）
      if(sh<ybase&&d2>(R-1.5)*(R-1.5)&&Math.random()<0.35)continue;
      for(let y=sh+1;y<ybase;y++)put(x,y,z,1);
      // ybase より上の既存物（木・丘の表面・岩柱・サボテン等）を一掃してから草でフタ。
      // put が ybase セルを必ず実体化するので、丘の非voxel内部の上に穴は残らない
      for(let y=ybase+1;y<=yTop+4;y++)clr(x,y,z);
      put(x,ybase,z,0);
    }

    // ─ 2. 尖塔 5〜7本（リング配置。±90°の2本が最も高い「アーチ塔」）─
    const nSp=5+Math.floor(Math.random()*3);
    const spires=[];
    const archTops=[];                    // アーチ塔の頂部 [x,y,z]
    for(let i=0;i<nSp;i++){
      const isArch=i<2;
      // アーチ塔は視線の左右±90°: プレイヤーから見て門になる
      const ang=isArch?aim+(i===0?1:-1)*Math.PI/2+(Math.random()-.5)*.3
                      :aim+Math.PI*(0.25+1.5*Math.random());
      const r=8+Math.random()*3;
      // リーン弱め: 頂部が門の真上からずれてゲートが崩れるのを防ぐ＋どっしり感
      const leanAmp=isArch?.12:.24;
      spires.push({
        bx:cx0+Math.cos(ang)*r,bz:cz0+Math.sin(ang)*r,
        // アーチ全体が画面に収まるよう主塔・アーチをやや低めに
        H:Math.round(isArch?20+Math.random()*3:11+Math.random()*8),
        r0:2.8+Math.random()*1.4, // 根元を太く（細い柱ではなく岩山のシルエット）
        leanX:(Math.random()-.5)*leanAmp,leanZ:(Math.random()-.5)*leanAmp,
        isArch,
      });
    }
    for(const s of spires){
      let px=s.bx,pz=s.bz;
      const H=Math.max(6,Math.min(s.H,yTop-ybase));
      for(let t=0;t<=H;t++){
        const y=ybase+t;
        // 根元を膨らませ上部を細くする（岩山型）＋ノイズで有機的な輪郭、
        // リーンの累積でゆるく傾く。baseBulge は下から 35% 区間だけ効く
        const taper=s.r0*(1-0.7*t/H);
        const baseBulge=Math.max(0,1-t/(H*0.35))*s.r0*0.9;
        const rr=Math.max(1,taper+baseBulge+noise(px*.3,t*.4)*.6);
        px+=s.leanX*(Math.random()*.8+.6);pz+=s.leanZ*(Math.random()*.8+.6);
        const cxs=Math.round(px),czs=Math.round(pz);
        for(let dx=-Math.ceil(rr);dx<=Math.ceil(rr);dx++)for(let dz=-Math.ceil(rr);dz<=Math.ceil(rr);dz++){
          if(dx*dx+dz*dz>rr*rr)continue;
          put(cxs+dx,y,czs+dz,rock());
        }
        if(t===H&&s.isArch)archTops.push([cxs,y,czs]);
      }
    }

    // ─ 2b. 根元まわりの小岩（岩山の裾）: 塔の足元に自然なボリュームを足す ─
    for(const s of spires){
      const baseR=s.r0*1.9; // 根元の太さ相当（taper+baseBulge の t=0 値）
      const nB=3+Math.floor(Math.random()*3);
      for(let bi=0;bi<nB;bi++){
        const a=Math.random()*Math.PI*2,dist=baseR+0.5+Math.random()*3;
        const bx=Math.round(s.bx+Math.cos(a)*dist),bz=Math.round(s.bz+Math.sin(a)*dist);
        if(Math.hypot(bx-cx0,bz-cz0)>R-1)continue; // 土台内のみ
        const bh=1+Math.floor(Math.random()*3),br=1+Math.random()*0.9;
        for(let tt=0;tt<bh;tt++){
          const rr=Math.max(0,br*(1-tt/bh));
          for(let dx=-Math.ceil(rr);dx<=Math.ceil(rr);dx++)for(let dz=-Math.ceil(rr);dz<=Math.ceil(rr);dz++){
            if(dx*dx+dz*dz>rr*rr+0.3)continue;
            put(bx+dx,ybase+1+tt,bz+dz,rock());
          }
        }
        if(Math.random()<0.4)put(bx,ybase+1+bh,bz,0); // 苔むした天面
      }
    }

    // ─ 3. アーチ: 2本のアーチ塔の頂部を2次ベジェで接続 ─
    if(archTops.length===2){
      const[a,b]=archTops;
      const mx=(a[0]+b[0])/2,my=Math.min((a[1]+b[1])/2+3,yTop),mz=(a[2]+b[2])/2;
      for(let i=0;i<=40;i++){
        const t=i/40,u=1-t;
        const x=u*u*a[0]+2*u*t*mx+t*t*b[0];
        const y=Math.min(u*u*a[1]+2*u*t*my+t*t*b[1],yTop);
        const z=u*u*a[2]+2*u*t*mz+t*t*b[2];
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
          if(dx*dx+dy*dy+dz*dz>2.6)continue; // 半径≈1.6の岩ブロブ
          put(Math.round(x)+dx,Math.round(y)+dy,Math.round(z)+dz,rock());
        }
      }
    }

    // ─ 4. レッジ（緑の棚）と苔、垂れ下がる蔦 ─
    const vines=[]; // 蔦の起点候補 [x,y,z]
    for(const s of spires){
      const H=Math.max(6,Math.min(s.H,yTop-ybase));
      const nL=2+Math.floor(Math.random()*2);
      // レッジは「外向き」に張り出す: 内向きに出すと中央の巨木が緑の壁で隠れる
      const outward=Math.atan2(s.bz-cz0,s.bx-cx0);
      for(let li=0;li<nL;li++){
        const t=Math.floor(H*(0.35+0.45*Math.random()));
        const y=ybase+t;
        const rr=Math.max(1,s.r0*(1-0.7*t/H))+2;
        const face=outward+(Math.random()-.5)*1.6;
        const lx=Math.round(s.bx+s.leanX*t),lz=Math.round(s.bz+s.leanZ*t);
        for(let dx=-Math.ceil(rr);dx<=Math.ceil(rr);dx++)for(let dz=-Math.ceil(rr);dz<=Math.ceil(rr);dz++){
          const d2=dx*dx+dz*dz;if(d2>rr*rr)continue;
          // 半円: face 方向の半分だけ張り出す
          if(Math.cos(Math.atan2(dz,dx)-face)<-0.1)continue;
          const x=lx+dx,z=lz+dz;
          put(x,y,z,rock());
          put(x,y+1,z,0); // 上面は草
          if(Math.random()<0.25)put(x,y+2,z,LEAF_BLOCK); // 葉のクランプ
          if(d2>(rr-1.3)*(rr-1.3))vines.push([x,y,z]); // 縁は蔦の起点候補
        }
      }
      // 塔の側面の苔（ざっくり: 塔に沿って低確率で葉を貼る）
      for(let t=2;t<H;t++){
        if(Math.random()>=0.3)continue;
        const y=ybase+t;
        const rr=Math.max(1,s.r0*(1-0.7*t/H));
        const a=Math.random()*Math.PI*2;
        const x=Math.round(s.bx+s.leanX*t+Math.cos(a)*(rr+1)),z=Math.round(s.bz+s.leanZ*t+Math.sin(a)*(rr+1));
        if(!voxels[vKey(x,y,z)])put(x,y,z,LEAF_BLOCK);
      }
    }
    // 蔦: レッジ縁から下へ 2〜6 ブロック垂らす（空中のみ）
    for(const[x,y,z]of vines){
      if(Math.random()>=0.3)continue;
      const len=2+Math.floor(Math.random()*5);
      for(let d=1;d<=len;d++){
        if(voxels[vKey(x,y-d,z)])break;
        put(x,y-d,z,LEAF_BLOCK);
      }
    }

    // ─ 5. 巨木（御神木）: 中央に太い幹＋斜め枝＋大きな楕円体の樹冠 ─
    const TH=13+Math.floor(Math.random()*4);
    for(let t=1;t<=TH;t++){
      // 下 2/3 は 3×3 の太い幹、上部は 2×2 に絞って自然にすぼめる
      const wide=t<=TH*0.66;
      for(let dx=(wide?-1:0);dx<=1;dx++)for(let dz=(wide?-1:0);dz<=1;dz++)
        put(cx0+dx,ybase+t,cz0+dz,3);
    }
    const canY=ybase+TH;
    for(let bi=0;bi<4;bi++){ // 枝: 4方向へ斜め上に伸びる
      const ba=Math.PI/4+bi*Math.PI/2+(Math.random()-.5)*.5;
      let bx=cx0+.5,bz=cz0+.5,by=canY-4-Math.floor(Math.random()*2);
      for(let st=0;st<5;st++){
        bx+=Math.cos(ba);bz+=Math.sin(ba);by+=(st%2===0)?1:0;
        put(Math.round(bx),by,Math.round(bz),3);
      }
    }
    const rxz=6,ry=3.8;
    for(let dx=-rxz-1;dx<=rxz+2;dx++)for(let dy=-Math.ceil(ry);dy<=Math.ceil(ry);dy++)for(let dz=-rxz-1;dz<=rxz+2;dz++){
      const nx=dx/rxz,nyv=dy/ry,nz=dz/rxz;
      if(nx*nx+nyv*nyv+nz*nz>1+(Math.random()-.5)*.3)continue; // 15%ジッタ
      const x=cx0+dx,y=canY+dy,z=cz0+dz;
      if(y>yTop+3)continue;
      if(!voxels[vKey(x,y,z)])put(x,y,z,LEAF_BLOCK);
      // 樹冠の縁から蔦
      if(dy<=0&&Math.random()<0.06&&nx*nx+nz*nz>0.55){
        const len=2+Math.floor(Math.random()*4);
        for(let d=1;d<=len;d++){
          if(voxels[vKey(x,y-d,z)])break;
          put(x,y-d,z,LEAF_BLOCK);
        }
      }
    }

    // ─ 6. 池: プレイヤー寄りに水面＋砂の縁＋岩ボルダー ─
    // 地面(ybase)を1段だけ除去して砂の底を「明示的に」敷く: 地表生成は露出セル
    // しか voxel 化しないため、掘りっぱなしだと不可視の穴になる
    const pondX=Math.round(cx0-fx*5),pondZ=Math.round(cz0-fz*5),pondR=4+Math.random();
    for(let dx=-7;dx<=7;dx++)for(let dz=-7;dz<=7;dz++){
      const d2=dx*dx+dz*dz;if(d2>(pondR+2)*(pondR+2))continue;
      const x=pondX+dx,z=pondZ+dz;
      if(Math.hypot(x-cx0,z-cz0)>R-1)continue; // 土台の外へはみ出さない
      if(d2<=pondR*pondR){
        put(x,ybase-1,z,2);         // 砂底
        put(x,ybase,z,WATER_BLOCK);  // 水面
      }else if(d2<=(pondR+1)*(pondR+1)){
        put(x,ybase,z,2);           // 砂の内縁（水際をはっきり）
      }else if(Math.random()<0.55){
        put(x,ybase,z,rock());      // 石の外縁でまばらに縁取り
      }
    }
    for(let bi=0;bi<3;bi++){ // 水辺の岩
      const ba=Math.random()*Math.PI*2;
      const x=pondX+Math.round(Math.cos(ba)*(pondR+1.5)),z=pondZ+Math.round(Math.sin(ba)*(pondR+1.5));
      if(Math.hypot(x-cx0,z-cz0)>R-1)continue;
      put(x,ybase+1,z,rock());
      if(Math.random()<0.5)put(x,ybase+2,z,rock());
    }
  }finally{
    _deferDirty=false;flushDirtyChunks();
  }
  showBonus('🏔 賢者の樹庭を生成！');
  playTone(520,.12,.1,'triangle');setTimeout(()=>playTone(780,.12,.1,'triangle'),120);
}

// ═══ 🗼 プレアデス監視塔 ワンクリック生成 ═══
// クリエイティブ専用: プレイヤーの前方に「地面から伸びる細い塔＋頂上の台座＋
// 神殿」を一発生成する。外周に沿ってらせん階段が頂上まで続き、実際に登って
// 辿り着ける。賢者の樹庭と同じ共有ヘルパー（put/clr/_frontAnchor/
// _ensureChunksAround/_footprintYBase）を使う。
function generatePleiadesWatchtower(){
  const{cx0,cz0,aim}=_frontAnchor(14); // footprintが小さいので賢者の樹庭より近め
  const R=11;         // チャンク確保・土台高さ算出用（雲装飾の届く範囲まで広め）
  const groundR=8;     // 地上のクリア/整地範囲（台座＋門）
  _ensureChunksAround(cx0,cz0,R,2);
  const towerRock=()=>Math.random()<0.82?1:6; // 石8.2割＋灰岩1.8割（賢者の樹庭と逆比率で差別化）

  _deferDirty=true;
  try{
    const ybase=_footprintYBase(cx0,cz0,R,3);
    const Hshaft=40;                       // シャフトの高さ（ybase+1〜+40）
    const topR=8;                          // 頂上台座の半径（従来6より拡張）
    const platformY=ybase+41,shrineY0=ybase+42,roofY=ybase+45;

    // ─ 0. フットプリントの地形をクリアしてキャップ ─
    for(let dx=-groundR;dx<=groundR;dx++)for(let dz=-groundR;dz<=groundR;dz++){
      const d2=dx*dx+dz*dz;if(d2>groundR*groundR)continue;
      const x=cx0+dx,z=cz0+dz,sh=surfaceHeightAt(x,z);
      for(let y=sh+1;y<ybase;y++)put(x,y,z,1);
      for(let y=ybase+1;y<=roofY+2;y++)clr(x,y,z);
      put(x,ybase,z,0);
    }

    // ─ 1. 土台円盤（半径5、聖地らしい広めの石畳）─
    for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=5;dz++){
      if(dx*dx+dz*dz>25)continue;
      put(cx0+dx,ybase,cz0+dz,1);
    }
    // ─ 1b. 入口の門: 階段の昇り始め方向（aim+π）に石柱2本＋まぐさ石で
    // 簡単な鳥居風の入口を作る。聖地らしさを出す軽いアクセント ─
    {
      const gateAng=aim+Math.PI,ex=Math.cos(gateAng),ez=Math.sin(gateAng);
      const px=-ez,pz=ex; // 進行方向に直交するベクトル（柱の左右オフセット）
      const gr=6;
      for(const side of[-1,1]){
        const gx=Math.round(cx0+ex*gr+px*1.5*side),gz=Math.round(cz0+ez*gr+pz*1.5*side);
        for(let dy=1;dy<=3;dy++)put(gx,ybase+dy,gz,1);
      }
      // まぐさ石: 柱の頂点をつなぐ横木（数点補間して埋める）
      for(let s=-1;s<=1;s+=0.5){
        const gx=Math.round(cx0+ex*gr+px*1.5*s),gz=Math.round(cz0+ez*gr+pz*1.5*s);
        put(gx,ybase+4,gz,1);
      }
    }

    // ─ 2. 細い塔本体（半径2ほど、ゆるいテーパー＋微揺らぎ＋数段のリング装飾）─
    // collarCenters の高さ付近で半径が張り出し、単調な円柱にリング状の段差を作る
    const collarCenters=[10,20,30];
    for(let t=1;t<=Hshaft;t++){
      const baseR=2.2-0.4*(t/Hshaft)+noise(t*.35,0)*0.15;
      let collar=0;
      for(const c of collarCenters)collar=Math.max(collar,Math.max(0,1-Math.abs(t-c)/1.5)*1.1);
      const r=baseR+collar;
      const y=ybase+t;
      for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){
        const d2=dx*dx+dz*dz;if(d2>r*r)continue;
        // リングの張り出し部分だけ灰岩を濃くして、帯として視認しやすくする
        put(cx0+dx,y,cz0+dz,d2>baseR*baseR?6:towerRock());
      }
    }

    // ─ 3. 外周らせん階段: 半径3のリング上を22.5°刻み・1段で1ブロック上昇。
    // 弧長 r*Δθ ≈ 3*(π/8) ≈ 1.18 で隣接段がほぼ連続、40段(2.5周)で頂上へ。
    // プレイヤーの反対側（aim+π）から昇り始め、頂上で祠の入口側に出る。
    const rStair=3,dTheta=Math.PI/8,startAng=aim+Math.PI;
    for(let i=0;i<Hshaft;i++){
      const ang=startAng+i*dTheta,nextAng=startAng+(i+1)*dTheta;
      const x=Math.round(cx0+Math.cos(ang)*rStair),z=Math.round(cz0+Math.sin(ang)*rStair);
      const y=ybase+1+i;
      // 進行方向の接線ベクトルを最近傍4方向へスナップ（doPlaceと同じ式）
      const tx=Math.cos(nextAng)-Math.cos(ang),tz=Math.sin(nextAng)-Math.sin(ang);
      const meta=Math.abs(tx)>Math.abs(tz)?(tx>0?0:2):(tz>0?1:3);
      put(x,y-1,z,1);            // 段の直下に石の支え（浮遊防止）
      put(x,y,z,STAIR_BLOCK,meta);
    }

    // ─ 3b. 塔上部の雲装飾: 台座のすぐ下〜同じ高さ帯を漂う小さな雲の塊を
    // 数個配置して高所感を強める（台座・階段には接触しない外側の空中）
    const nClouds=4+Math.floor(Math.random()*2);
    for(let ci=0;ci<nClouds;ci++){
      const ca=Math.random()*Math.PI*2,cr=8.5+Math.random()*1.8;
      const ccx=Math.round(cx0+Math.cos(ca)*cr),ccz=Math.round(cz0+Math.sin(ca)*cr);
      const ccy=platformY-Math.floor(Math.random()*7);
      const cloudCells=[[0,0],[1,0],[-1,0],[0,1],[0,-1]];
      for(const[dx,dz]of cloudCells)if(Math.random()<0.85)put(ccx+dx,ccy,ccz+dz,WOOL_BLOCK);
    }

    // ─ 4. 頂上の台座（半径8に拡張、縁にスラブの縁石）─
    for(let dx=-topR;dx<=topR;dx++)for(let dz=-topR;dz<=topR;dz++){
      const d2=dx*dx+dz*dz;if(d2>topR*topR)continue;
      const x=cx0+dx,z=cz0+dz;
      if(d2>(topR-1)*(topR-1))put(x,platformY,z,SLAB_BLOCK,0);
      else put(x,platformY,z,1);
    }

    // ─ 5. 頂上の神殿（柱4本＋屋根を拡大、遠くからも見えやすく）─
    for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
      const edge=Math.max(Math.abs(dx),Math.abs(dz))===3;
      if(!edge)continue;
      if(dz===3&&Math.abs(dx)<=1)continue; // 入口
      for(let dy=1;dy<=3;dy++)put(cx0+dx,shrineY0-1+dy,cz0+dz,3);
    }
    for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){
      if(Math.abs(dx)===4&&Math.abs(dz)===4)continue; // 角を落とした屋根
      put(cx0+dx,roofY,cz0+dz,4);
    }
    put(cx0-2,shrineY0+1,cz0-2,TORCH_BLOCK);
    put(cx0+2,shrineY0+1,cz0+2,TORCH_BLOCK);
  }finally{
    _deferDirty=false;flushDirtyChunks();
  }
  showBonus('🗼 プレアデス監視塔を生成！');
  playTone(660,.12,.1,'triangle');setTimeout(()=>playTone(990,.12,.1,'triangle'),120);
}

// ═══ 🏝 空中神殿 ワンクリック生成 ═══
// クリエイティブ専用: プレイヤーの前方かつ上空に「浮遊島＋中央の八角神殿」を
// 一発生成する。地表とは完全に分離した空中に浮くのが特徴で、遠景でも「空に神殿が
// 浮いている」シルエットを最優先にした。島は上面が平らで下面は逆三角形の岩塊。
// 賢者の樹庭・監視塔と同じ共有ヘルパー（put/clr/_frontAnchor/_ensureChunksAround/
// _footprintYBase）を使う。MVPとして直径24（R=12）に抑えている。
function generateSkyTemple(){
  const{fx,fz,cx0,cz0,aim}=_frontAnchor(20);
  const R=12;                       // 島の半径（直径24, MVPの上限）
  _ensureChunksAround(cx0,cz0,R,8); // 周囲の浮遊岩まで届く広めのパッド
  const rock=()=>Math.random()<0.75?1:6; // 石7.5割＋灰岩2.5割のまだら岩

  _deferDirty=true; // 数千ブロックの一括編集: チャンク再構築は最後に1回ずつ
  try{
    const ybase=_footprintYBase(cx0,cz0,R,5);
    const topY=ybase+16;            // 島の上面（地表から16ブロック浮遊）
    const coneDepth=9;              // 下面の逆三角形（円錐）の深さ

    // ─ 1. 浮遊島本体: 上面は平らな円盤、下面は逆三角形の岩塊 ─
    // 縁はノイズでギザギザにして、遠景シルエットを岩島らしく見せる。
    for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
      const d=Math.hypot(dx,dz);
      const edge=R-0.6+noise(dx*.25,dz*.25)*1.3; // 有機的な外周
      if(d>edge)continue;
      const x=cx0+dx,z=cz0+dz;
      put(x,topY,z,0);   // 平らな草の上面
      put(x,topY-1,z,1); // 直下は土台石
    }
    // 逆三角形の岩塊: 下へ行くほど半径を直線的に絞り、先端は一点に収束させる
    for(let t=1;t<=coneDepth;t++){
      const rr=R*(1-t/coneDepth)+noise(t*.4,0)*0.8;
      const y=topY-1-t;
      for(let dx=-Math.ceil(rr);dx<=Math.ceil(rr);dx++)for(let dz=-Math.ceil(rr);dz<=Math.ceil(rr);dz++){
        if(dx*dx+dz*dz>rr*rr)continue;
        put(cx0+dx,y,cz0+dz,rock());
      }
    }
    const tipY=topY-1-coneDepth;    // 円錐の先端（滝の起点）

    // ─ 2. 中央神殿: 石畳＋八角形の石柱8本＋レンガ屋根＋中央祭壇 ─
    const plazaR=5,pillarH=4;
    const pillarY0=topY+1,roofY=pillarY0+pillarH; // 柱 topY+1..+4 / 屋根 topY+5
    // 石畳（縁はスラブで一段落とす）
    for(let dx=-plazaR;dx<=plazaR;dx++)for(let dz=-plazaR;dz<=plazaR;dz++){
      const d2=dx*dx+dz*dz;if(d2>plazaR*plazaR)continue;
      const x=cx0+dx,z=cz0+dz;
      if(d2>(plazaR-1)*(plazaR-1))put(x,topY,z,SLAB_BLOCK,0);
      else put(x,topY,z,1);
    }
    // 八角形に石柱8本（半径4のリング。aim基準で入口側が揃う）
    const pilR=4,nPil=8;
    for(let i=0;i<nPil;i++){
      const a=aim+i*Math.PI*2/nPil;
      const px=Math.round(cx0+Math.cos(a)*pilR),pz=Math.round(cz0+Math.sin(a)*pilR);
      for(let dy=0;dy<pillarH;dy++)put(px,pillarY0+dy,pz,1);
    }
    // 屋根: レンガの八角錐（下段 半径5 → 上段 半径3 → 頂部）で神殿感を出す
    for(let dx=-plazaR;dx<=plazaR;dx++)for(let dz=-plazaR;dz<=plazaR;dz++){
      if(dx*dx+dz*dz>plazaR*plazaR)continue;
      put(cx0+dx,roofY,cz0+dz,4);
    }
    for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
      if(dx*dx+dz*dz>9)continue;
      put(cx0+dx,roofY+1,cz0+dz,4);
    }
    put(cx0,roofY+2,cz0,4); // 屋根の頂点
    // 中央祭壇: 石台＋スラブ＋発光する水晶の御神体（屋根の下で光る）
    put(cx0,topY+1,cz0,1);
    put(cx0,topY+2,cz0,SLAB_BLOCK,0);
    put(cx0,topY+3,cz0,CRYSTAL_BLOCK);
    // 入口の松明（プレイヤー側の柱間に1本）
    {
      const ex=Math.round(cx0+Math.cos(aim)*(plazaR-1)),ez=Math.round(cz0+Math.sin(aim)*(plazaR-1));
      if(!voxels[vKey(ex,topY+1,ez)])put(ex,topY+1,ez,TORCH_BLOCK);
    }

    // ─ 3. 島縁の小さな木と草 ─
    for(let i=0;i<3;i++){
      const a=aim+Math.PI*(0.6+i*0.7)+Math.random()*0.4,tr=R-3;
      const tx=Math.round(cx0+Math.cos(a)*tr),tz=Math.round(cz0+Math.sin(a)*tr);
      const th=2+Math.floor(Math.random()*2);
      for(let dy=1;dy<=th;dy++)put(tx,topY+dy,tz,3); // 幹
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)put(tx+dx,topY+th+1,tz+dz,LEAF_BLOCK);
      put(tx,topY+th+2,tz,LEAF_BLOCK); // 樹冠の頭
    }
    // 草（低い葉のクランプ）を上面に点在。神殿や幹が既にあるセルは避ける
    for(let i=0;i<12;i++){
      const a=Math.random()*Math.PI*2,gr=(R-2)*Math.sqrt(Math.random());
      const gx=Math.round(cx0+Math.cos(a)*gr),gz=Math.round(cz0+Math.sin(a)*gr);
      if(voxels[vKey(gx,topY,gz)]&&!voxels[vKey(gx,topY+1,gz)])put(gx,topY+1,gz,LEAF_BLOCK);
    }

    // ─ 4. 下面から短い滝と垂れ蔦 ─
    // 滝: 円錐先端から水を2〜4段（この世界の水は静的ブロックなので柱として垂れる）
    const wl=2+Math.floor(Math.random()*3);
    for(let d=0;d<wl;d++)put(cx0,tipY-1-d,cz0,WATER_BLOCK);
    // 蔦: 島の底縁（上面直下）から葉を2〜5段、空中セルにだけ垂らす
    for(let i=0;i<14;i++){
      const a=Math.random()*Math.PI*2;
      const vx=Math.round(cx0+Math.cos(a)*(R-1)),vz=Math.round(cz0+Math.sin(a)*(R-1));
      if(!voxels[vKey(vx,topY-1,vz)])continue; // 島の底がある縁のみ
      const len=2+Math.floor(Math.random()*4);
      for(let d=1;d<=len;d++){
        if(voxels[vKey(vx,topY-1-d,vz)])break; // 岩に当たったら止める
        put(vx,topY-1-d,vz,LEAF_BLOCK);
      }
    }

    // ─ 5. 周囲の小さな浮遊岩 4〜6個（島の高度帯にばらつかせる）─
    const nRock=4+Math.floor(Math.random()*3);
    for(let i=0;i<nRock;i++){
      const a=aim+i*Math.PI*2/nRock+Math.random()*0.6;
      const dist=R+2+Math.random()*3;
      const rx=Math.round(cx0+Math.cos(a)*dist),rz=Math.round(cz0+Math.sin(a)*dist);
      const ry=topY-3+Math.floor(Math.random()*8)-2;
      const br=1+Math.random()*1.2;
      for(let dx=-2;dx<=2;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-2;dz<=2;dz++){
        if(dx*dx+dy*dy*1.5+dz*dz>br*br)continue;
        put(rx+dx,ry+dy,rz+dz,rock());
      }
    }
  }finally{
    _deferDirty=false;flushDirtyChunks();
  }
  showBonus('🏝 空中神殿を生成！');
  playTone(587,.12,.1,'triangle');setTimeout(()=>playTone(880,.12,.1,'triangle'),120);
}

// ═══ 🌳 世界樹 ワンクリック生成 ═══
// クリエイティブ専用: プレイヤー前方の地表に、高さ80〜110・樹冠幅60〜80ほどの
// 「巨大な世界樹」をプロシージャルに生成する。ねじれ合流する中空の幹（内部に螺旋
// 階段と祭壇）、放射状の根、多数の枝、複数の葉クランプで構成された樹冠、垂れる蔦、
// 樹上の展望台、そして少し離れた精霊の泉を含む「ダンジョン兼ランドマーク」。
// 賢者の樹庭・監視塔・空中神殿と同じ共有ヘルパー（put/clr/_frontAnchor/
// _ensureChunksAround/_footprintYBase）を使う。巨大なので requestAnimationFrame で
// フェーズを分割し、フレーム毎に少しずつ生成して処理落ちを避ける。
const WT_TAU=Math.PI*2;
// ── 数値はここへ集約（形が崩壊しないよう各要素に最小値/最大値を設定）──
const WORLD_TREE_CFG={
  anchorDist:30,               // プレイヤー前方の生成距離（大きいので離す）
  height:{min:80,max:112},      // 全体の高さ
  trunkBaseR:{min:9,max:13},    // 幹の根元半径（直径18〜26）
  trunkTopR:{min:2.5,max:3.6},  // 幹上部の半径（上ほど細くする）
  subTrunks:{min:3,max:5},      // 合流する幹（ストランド）の本数
  twistTurns:{min:0.4,max:1.3}, // 幹のねじれ回転数
  roots:{min:8,max:14},         // 根の本数
  rootLen:{min:10,max:20},      // 根の長さ
  branches:{min:10,max:18},     // 主枝の本数
  branchLen:{min:9,max:20},     // 主枝の長さ
  leafClumpR:{min:6,max:12},    // 葉クランプの半径
  canopyR:{min:30,max:40},      // 樹冠の広がり半径（幅60〜80）
  domeClumps:{min:14,max:22},   // 樹冠を形づくるドーム状クランプ数
  vineLen:{min:2,max:9},        // ツタの長さ
};

// 生成進捗オーバーレイの表示/更新（分割生成中のみ表示、完了・失敗で消す）
function _wtSetProgress(show,frac){
  const el=document.getElementById('worldTreeProgress');
  if(!el)return;
  el.style.display=show?'':'none';
  if(show){const fill=document.getElementById('wtpFill');if(fill)fill.style.width=Math.round((frac||0)*100)+'%';}
}
// 決定的乱数（mulberry32）: 同じシードなら同じ世界樹を再現できる
function _wtRng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// 位置ハッシュ（0..1）: 樹皮のまだらや葉の隙間など、フェーズ分割に依存しない
// 決定的なばらつきに使う（rngのように呼び出し順へ依存しない）
function _wtHash(a){a=a|0;a=(a^61)^(a>>>16);a=a+(a<<3)|0;a=a^(a>>>4);a=Math.imul(a,0x27d4eb2d);a=a^(a>>>15);return((a>>>0)/4294967296);}
// 整地などで安全に消してよい自然ブロックか（石・レンガ・水・鉱石等は残す）
function _wtClearable(ti){return ti===0||ti===2||ti===3||ti===5||ti===9||ti===LEAF_BLOCK||ti===CACTUS_BLOCK||ti===MUSHROOM_BLOCK;}
// 幹の高さ比 f(0=根元,1=頂点) における半径。上ほど細く、根元にフレア（根張り）
function _wtTrunkR(plan,f){
  const base=plan.topR+(plan.baseR-plan.topR)*Math.pow(1-f,1.3);
  const flare=Math.max(0,1-f/0.12)*plan.baseR*0.45;
  return base+flare;
}
// 幹の断面を構成するストランド群（下で広がり上で1本へ合流＝ねじれ合流）
function _wtStrandsAt(plan,f){
  const t=f*plan.H;
  const axX=plan.leanX*t, axZ=plan.leanZ*t;   // 幹軸のゆるい傾き（左右非対称化）
  const r=_wtTrunkR(plan,f);
  const spread=plan.baseSpread*Math.pow(1-f,1.6); // 上へ向かうほど中心へ収束
  const sr=Math.max(1.6,r*0.55);
  const arr=[];
  for(let i=0;i<plan.nSub;i++){
    const a=plan.strandAng[i]+plan.twist*f*WT_TAU;
    const bump=noise(Math.cos(a)*1.5+f*2.2,Math.sin(a)*1.5)*0.9; // 樹皮の凹凸
    arr.push({sx:axX+Math.cos(a)*spread,sz:axZ+Math.sin(a)*spread,rr:sr+bump});
  }
  return{arr,axX,axZ,r};
}
function _wtInside(arr,dx,dz){
  for(let i=0;i<arr.length;i++){const ex=dx-arr[i].sx,ez=dz-arr[i].sz;if(ex*ex+ez*ez<=arr[i].rr*arr[i].rr)return true;}
  return false;
}
// 幹の樹皮ブロック: 基本は木材、まだらに暗い木材、根元付近に苔を混ぜる
function _wtBark(plan,wx,wy,wz){
  const h=_wtHash((wx*73856093)^(wy*19349663)^(wz*83492791));
  if(h<0.12)return CAVE_DIRT;                                   // 少し暗い木材（まだら）
  if(wy<plan.ybase+plan.H*0.32&&h>0.9)return LEAF_BLOCK;        // 根元付近の苔
  return 3;                                                     // 木材
}

// 生成に適したアンカーを選ぶ（起伏の小さい・水の無い平地を優先し、崖/水上を避ける）
function _pickTreeAnchor(){
  const base=_frontAnchor(WORLD_TREE_CFG.anchorDist);
  const cands=[base];
  for(let k=0;k<4;k++){
    const off=6+k*5,a=base.aim+(k%2?1:-1)*0.7;
    cands.push({fx:base.fx,fz:base.fz,cx0:Math.round(base.cx0+Math.cos(a)*off),cz0:Math.round(base.cz0+Math.sin(a)*off),aim:base.aim});
  }
  let best=base,bestScore=Infinity;
  for(const c of cands){
    _ensureChunksAround(c.cx0,c.cz0,7,1);
    const hs=[];let water=0;
    for(let dx=-6;dx<=6;dx+=3)for(let dz=-6;dz<=6;dz+=3){
      const x=c.cx0+dx,z=c.cz0+dz,sh=surfaceHeightAt(x,z);hs.push(sh);
      for(let y=sh;y<=sh+2;y++){const v=voxels[vKey(x,y,z)];if(v&&v.ti===WATER_BLOCK){water++;break;}}
    }
    const mn=Math.min.apply(null,hs),mx=Math.max.apply(null,hs);
    const score=(mx-mn)*2+water*8;                              // 起伏が小さく水が無いほど良い
    if(score<bestScore){bestScore=score;best=c;}
  }
  return best;
}

// 世界樹の「設計図」を決定的に作る（重い put は後段のフェーズで実行）
function _planWorldTree(rng,anchor){
  const cfg=WORLD_TREE_CFG;
  const ri=o=>o.min+Math.floor(rng()*(o.max-o.min+1));
  const rf=o=>o.min+rng()*(o.max-o.min);
  const cx0=anchor.cx0,cz0=anchor.cz0,aim=anchor.aim;
  const ybase=_footprintYBase(cx0,cz0,cfg.trunkBaseR.max+3,4);
  const H=ri(cfg.height);
  const baseR=rf(cfg.trunkBaseR),topR=rf(cfg.trunkTopR);
  const nSub=ri(cfg.subTrunks);
  const twist=(rng()<0.5?-1:1)*rf(cfg.twistTurns);              // ねじれ方向もランダム
  const baseSpread=baseR*0.42;
  const strandAng=[];for(let i=0;i<nSub;i++)strandAng.push(rng()*WT_TAU);
  const leanA=rng()*WT_TAU,leanAmt=1.5+rng()*3;                 // 幹の傾き（非対称化）
  const leanX=Math.cos(leanA)*leanAmt/H,leanZ=Math.sin(leanA)*leanAmt/H;
  const deckT=Math.round(H*0.72);                              // 展望台の高さ
  const plan={cfg,cx0,cz0,aim,ybase,H,baseR,topR,nSub,twist,baseSpread,strandAng,leanX,leanZ,deckT,
              rootList:[],branchList:[],leafClumps:[],vineSeeds:[]};

  // ── 根: 放射状に nRoot 本、曲がりながら地面へ潜る。一部はアーチ状に浮かす ──
  const nRoot=ri(cfg.roots);
  for(let i=0;i<nRoot;i++){
    const ang=(i/nRoot)*WT_TAU+(rng()-0.5)*0.5;                 // ほぼ放射状＋揺らぎ
    const len=rf(cfg.rootLen),arch=rng()<0.3;
    let dir=ang,r=2.4+rng()*1.3;
    let x=cx0+Math.cos(ang)*(baseR*0.7),z=cz0+Math.sin(ang)*(baseR*0.7);
    const steps=Math.max(4,Math.round(len)),pts=[];
    for(let s=0;s<=steps;s++){
      const f=s/steps;
      dir+=(rng()-0.5)*0.5;                                     // 曲がりながら伸びる
      x+=Math.cos(dir);z+=Math.sin(dir);
      const gy=surfaceHeightAt(Math.round(x),Math.round(z));    // 地表高さを取得して潜らせる
      let y;
      if(arch){const lf=Math.sin(Math.min(f,0.85)/0.85*Math.PI)*3.5;y=(f<0.85)?ybase+Math.round(lf):gy;} // 橋/アーチ状
      else{y=Math.min(ybase,gy)-Math.round(f*2)+(f<0.25?Math.round((0.25-f)*4):0);}
      pts.push({x:Math.round(x),y:Math.round(y),z:Math.round(z),r:Math.max(1,r*(1-f*0.7))});
    }
    plan.rootList.push({pts});
  }

  // ── 枝: 主枝＋子枝を再帰的に生成し、枝先へ葉クランプを登録 ──
  const growBranch=(sx,sy,sz,dir0,pitch0,len,r0,depth)=>{
    let dir=dir0,pitch=pitch0,x=sx,y=sy,z=sz;
    const steps=Math.max(4,Math.round(len)),pts=[];
    for(let s=0;s<=steps;s++){
      const f=s/steps;
      dir+=(rng()-0.5)*0.35;                                    // 自然な蛇行
      pitch+=(rng()-0.5)*0.15-0.03;                             // ゆるやかに垂れる
      x+=Math.cos(dir);z+=Math.sin(dir);y+=pitch;
      pts.push({x:Math.round(x),y:Math.round(y),z:Math.round(z),r:Math.max(1,r0*(1-f*0.72))});
    }
    plan.branchList.push({pts});
    const tip=pts[pts.length-1];
    plan.leafClumps.push({x:tip.x,y:tip.y,z:tip.z,r:rf(cfg.leafClumpR),density:0.3+rng()*0.25});
    if(depth>0){                                                // 太い枝から細い枝へ分岐
      const nChild=1+Math.floor(rng()*2);
      for(let c=0;c<nChild;c++){
        const at=pts[Math.min(pts.length-1,Math.floor(pts.length*(0.5+rng()*0.35)))];
        growBranch(at.x,at.y,at.z,dir+(rng()<0.5?1:-1)*(0.5+rng()*0.6),pitch+(rng()-0.5)*0.3,len*0.55,r0*0.6,depth-1);
      }
    }
  };
  const nBranch=ri(cfg.branches);
  for(let i=0;i<nBranch;i++){
    const fo=0.45+rng()*0.4,t0=fo*H,ang=rng()*WT_TAU,et=rng();
    // 上向き/横向き/斜め下向きを混ぜる
    const pitch=et<0.5?(0.15+rng()*0.5):et<0.8?(rng()-0.5)*0.25:-(0.1+rng()*0.3);
    const rAt=_wtTrunkR(plan,fo);
    const sx=cx0+plan.leanX*t0+Math.cos(ang)*rAt,sz=cz0+plan.leanZ*t0+Math.sin(ang)*rAt,sy=ybase+t0;
    growBranch(sx,sy,sz,ang,pitch,rf(cfg.branchLen),2.0+rng()*1.1,1);
  }

  // ── 樹冠ドーム: 幅の広いシルエットを作るため、葉クランプをドーム状に散らす ──
  const crownSpread=rf(cfg.canopyR),domeCY=ybase+Math.round(H*0.8);
  const nDome=ri(cfg.domeClumps);
  for(let i=0;i<nDome;i++){
    const a=rng()*WT_TAU,rad=crownSpread*(0.3+0.7*Math.sqrt(rng())),shape=1-rad/crownSpread;
    const cy=domeCY+Math.round(shape*H*0.16)+Math.round((rng()-0.5)*8);   // 中心ほど高い＝ドーム
    plan.leafClumps.push({x:cx0+Math.round(Math.cos(a)*rad),y:cy,z:cz0+Math.round(Math.sin(a)*rad),r:rf(cfg.leafClumpR)*(0.9+rng()*0.5),density:0.28+rng()*0.22});
  }

  // ── ツタの起点: 葉クランプの底や枝の途中からランダム長で垂らす ──
  for(const c of plan.leafClumps){
    if(rng()<0.5){const a=rng()*WT_TAU;plan.vineSeeds.push({x:c.x+Math.round(Math.cos(a)*c.r*0.6),y:c.y-Math.round(c.r*0.5),z:c.z+Math.round(Math.sin(a)*c.r*0.6),len:ri(cfg.vineLen)});}
  }
  for(const b of plan.branchList){
    if(rng()<0.4){const p=b.pts[Math.floor(b.pts.length*0.7)];plan.vineSeeds.push({x:p.x,y:p.y-1,z:p.z,len:ri(cfg.vineLen)});}
  }

  // ── 精霊の泉: 本体から少しずらした位置へ（景観に変化をつける）──
  plan.springAng=aim+(rng()<0.5?1:-1)*(0.8+rng()*0.8);
  plan.springDist=baseR+7+rng()*6;
  plan.springR=3+Math.floor(rng()*2);
  return plan;
}

// 根元の整地: 斜面を埋めて根元が宙に浮かないようにし、上の自然物を軽く掃除する
function _wtBasePad(plan){
  const{cx0,cz0,ybase,baseR}=plan,R=baseR+4;
  for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
    if(dx*dx+dz*dz>R*R)continue;
    const x=cx0+dx,z=cz0+dz,sh=surfaceHeightAt(x,z);
    for(let y=sh+1;y<ybase;y++)put(x,y,z,1);                    // 傾斜地を石で埋めて高さを吸収
    put(x,ybase,z,0);                                           // 根元の地面（草）
    for(let y=ybase+1;y<=ybase+3;y++){const v=voxels[vKey(x,y,z)];if(v&&_wtClearable(v.ti))clr(x,y,z);} // 幹に食い込む自然物だけ除去
  }
}
// 幹本体: 高さ t0..t1 の各層で「外殻だけ」を置く（内部は空洞にして軽量化＋探索可能に）
function _wtTrunkLayers(plan,t0,t1){
  const shellThk=2;
  for(let t=t0;t<=t1;t++){
    const f=t/plan.H,S=_wtStrandsAt(plan,f);
    const R=Math.ceil(S.r+plan.baseSpread+3),W=2*R+1;
    const grid=new Uint8Array(W*W);                             // この層の内外を1度だけ判定
    for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++)if(_wtInside(S.arr,dx,dz))grid[(dx+R)*W+(dz+R)]=1;
    const y=plan.ybase+t;
    for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
      if(!grid[(dx+R)*W+(dz+R)])continue;
      let edge=false;                                           // 近傍に外部があれば外殻セル
      for(let ox=-shellThk;ox<=shellThk&&!edge;ox++){
        const gx=dx+ox+R;if(gx<0||gx>=W){edge=true;break;}
        for(let oz=-shellThk;oz<=shellThk;oz++){const gz=dz+oz+R;if(gz<0||gz>=W||!grid[gx*W+gz]){edge=true;break;}}
      }
      if(!edge)continue;
      const wx=plan.cx0+dx,wz=plan.cz0+dz;
      put(wx,y,wz,_wtBark(plan,wx,y,wz));
    }
  }
}
// 根元付近の入口を開ける（プレイヤー正面側にトンネルを掘って内部の祭壇・階段へ）
function _wtCarveDoor(plan){
  const{cx0,cz0,ybase}=plan,ex=Math.cos(plan.aim),ez=Math.sin(plan.aim),px=-ez,pz=ex;
  for(let h=1;h<=4;h++)for(let s=-1;s<=1;s++)for(let rad=0;rad<=plan.baseR+3;rad++){
    clr(Math.round(cx0+ex*rad+px*s),ybase+h,Math.round(cz0+ez*rad+pz*s));
  }
}
// 幹内部の螺旋階段＋踊り場＋松明（実際に登って展望台まで到達できる）
function _wtStairs(plan){
  const{cx0,cz0,ybase}=plan,dTheta=Math.PI/8,startAng=plan.aim+Math.PI;
  for(let i=0;;i++){
    const t=2+i;if(t>plan.deckT)break;
    const f=t/plan.H,interiorR=Math.max(1.5,_wtTrunkR(plan,f)-2.2);
    const rStair=Math.min(interiorR,3.2);
    const ang=startAng+i*dTheta,nextAng=startAng+(i+1)*dTheta;
    const axX=plan.leanX*t,axZ=plan.leanZ*t;
    const x=Math.round(cx0+axX+Math.cos(ang)*rStair),z=Math.round(cz0+axZ+Math.sin(ang)*rStair),y=ybase+t;
    const tx=Math.cos(nextAng)-Math.cos(ang),tz=Math.sin(nextAng)-Math.sin(ang);
    const meta=Math.abs(tx)>Math.abs(tz)?(tx>0?0:2):(tz>0?1:3);
    clr(x,y,z);clr(x,y+1,z);clr(x,y+2,z);                       // 頭上を空ける
    put(x,y-1,z,3);                                             // 段の支え
    put(x,y,z,STAIR_BLOCK,meta);
    if(i>0&&i%12===0){                                          // 数段ごとに踊り場と灯り
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)put(x+dx,y,z+dz,3);
      put(x,y+1,z,TORCH_BLOCK);
    }
  }
}
// 根元中央の祭壇（宝箱の代替として発光する御神体を置く）
function _wtAltar(plan){
  const{cx0,cz0,ybase}=plan,y=ybase;
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
    put(cx0+dx,y,cz0+dz,1);                                     // 石畳の台座
    if((dx||dz)&&Math.abs(dx)+Math.abs(dz)===2&&_wtHash(dx*7+dz*3)<0.6)put(cx0+dx,y+1,cz0+dz,LEAF_BLOCK); // 苔むした四隅
  }
  put(cx0,y+1,cz0,1);
  put(cx0,y+2,cz0,SLAB_BLOCK,0);
  put(cx0,y+3,cz0,CRYSTAL_BLOCK);                              // 発光する御神体
  put(cx0+1,y+1,cz0+1,TORCH_BLOCK);
  put(cx0-1,y+1,cz0-1,TORCH_BLOCK);
}
// 根: 設計図の経路に沿って、やや平たい木ブロックの塊を積む
function _wtRoots(plan,i0,i1){
  for(let i=i0;i<i1;i++)for(const p of plan.rootList[i].pts){
    const rr=p.r,cr=Math.ceil(rr);
    for(let dx=-cr;dx<=cr;dx++)for(let dy=-cr;dy<=cr;dy++)for(let dz=-cr;dz<=cr;dz++){
      if(dx*dx+dy*dy*1.4+dz*dz>rr*rr)continue;                  // 縦を潰して平たい根に
      put(p.x+dx,p.y+dy,p.z+dz,_wtBark(plan,p.x+dx,p.y+dy,p.z+dz));
    }
  }
}
// 枝: 設計図の経路に沿って木ブロックの塊を積む
function _wtBranches(plan,i0,i1){
  for(let i=i0;i<i1;i++)for(const p of plan.branchList[i].pts){
    const rr=p.r,cr=Math.ceil(rr);
    for(let dx=-cr;dx<=cr;dx++)for(let dy=-cr;dy<=cr;dy++)for(let dz=-cr;dz<=cr;dz++){
      if(dx*dx+dy*dy+dz*dz>rr*rr)continue;
      put(p.x+dx,p.y+dy,p.z+dz,_wtBark(plan,p.x+dx,p.y+dy,p.z+dz));
    }
  }
}
// 樹冠: 葉クランプ i0..i1 を疎らな楕円殻として置く（内部は空洞＝隙間から空が見える）
function _wtCanopy(plan,i0,i1){
  for(let i=i0;i<i1&&i<plan.leafClumps.length;i++){
    const c=plan.leafClumps[i],r=c.r,R=Math.ceil(r);
    for(let dx=-R;dx<=R;dx++)for(let dy=-R;dy<=R;dy++)for(let dz=-R;dz<=R;dz++){
      const nd=Math.sqrt(dx*dx+dy*dy+dz*dz)/r;
      const jit=(_wtHash((c.x+dx)*7+(c.y+dy)*13+(c.z+dz)*3)-0.5)*0.3;
      if(nd>1+jit||nd<0.45)continue;                            // 外周＋内部空洞
      const h=_wtHash((c.x+dx)*131^(c.y+dy)*57^(c.z+dz)*911);
      if(h>c.density*(0.6+nd))continue;                         // 密度にばらつき（隙間）
      const x=c.x+dx,y=c.y+dy,z=c.z+dz;
      if(voxels[vKey(x,y,z)])continue;                          // 幹・枝は潰さない
      if(h<0.006&&nd>0.6){put(x,y,z,CRYSTAL_BLOCK);continue;}   // 控えめな発光ブロック（夜に淡く光る）
      put(x,y,z,LEAF_BLOCK);
    }
  }
}
// ツタ: 起点から下方向へ、空中セルにだけランダム長で葉を垂らす
function _wtVines(plan){
  for(const s of plan.vineSeeds){
    for(let d=1;d<=s.len;d++){if(voxels[vKey(s.x,s.y-d,s.z)])break;put(s.x,s.y-d,s.z,LEAF_BLOCK);}
  }
}
// 樹上の展望台: 幹の外へ張り出す木の床＋隙間のある柵＋頭上の葉を掃除して眺望を確保
function _wtDeck(plan){
  const{cx0,cz0,ybase}=plan,t=plan.deckT,y=ybase+t;
  const cxx=Math.round(cx0+plan.leanX*t),czz=Math.round(cz0+plan.leanZ*t),R=5;
  for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){if(dx*dx+dz*dz<=R*R)put(cxx+dx,y,czz+dz,3);} // 床
  for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){                                            // 転落防止の柵
    const d2=dx*dx+dz*dz;if(d2<=(R-1)*(R-1)||d2>R*R)continue;
    put(cxx+dx,y+1,czz+dz,3);
    if(((dx+dz)&1)===0)put(cxx+dx,y+2,czz+dz,SLAB_BLOCK,0);      // 一段おき＝隙間から見渡せる
  }
  for(let dx=-R-2;dx<=R+2;dx++)for(let dz=-R-2;dz<=R+2;dz++)for(let dy=1;dy<=4;dy++){            // 頭上の葉を除去
    const v=voxels[vKey(cxx+dx,y+dy,czz+dz)];if(v&&v.ti===LEAF_BLOCK)clr(cxx+dx,y+dy,czz+dz);
  }
  const ex=Math.cos(plan.aim),ez=Math.sin(plan.aim);
  for(let dy=0;dy<=2;dy++)for(let r=0;r<=R;r++)clr(Math.round(cxx+ex*r),y+dy,Math.round(czz+ez*r)); // 幹内部から床への出入口
  put(cxx,y,czz,3);
  put(cxx,y+1,czz,TORCH_BLOCK);                                 // 展望台の灯り
}
// 精霊の泉: 本体から少しずらした浅い池＋苔・花（葉）・キノコ・発光植物
function _wtSpring(plan){
  const{cx0,cz0}=plan,a=plan.springAng,dist=plan.springDist;
  const px=Math.round(cx0+Math.cos(a)*dist),pz=Math.round(cz0+Math.sin(a)*dist);
  const gy=surfaceHeightAt(px,pz),R=plan.springR;
  for(let dx=-R-1;dx<=R+1;dx++)for(let dz=-R-1;dz<=R+1;dz++){
    const d2=dx*dx+dz*dz;if(d2>(R+1)*(R+1))continue;
    const x=px+dx,z=pz+dz,sh=surfaceHeightAt(x,z);
    for(let y=sh+1;y<gy;y++)put(x,y,z,1);                       // ゆるく均す
    if(d2<=R*R){put(x,gy-1,z,2);put(x,gy,z,WATER_BLOCK);}       // 砂底＋水面（浅い池）
    else if(_wtHash(x*13+z*7)<0.7)put(x,gy,z,2);                // 砂の縁
    const v=voxels[vKey(x,gy+1,z)];if(v&&_wtClearable(v.ti))clr(x,gy+1,z);
  }
  for(let i=0;i<14;i++){                                        // 縁の装飾
    const aa=Math.random()*WT_TAU,dd=R+0.5+Math.random()*1.5;
    const x=Math.round(px+Math.cos(aa)*dd),z=Math.round(pz+Math.sin(aa)*dd),sh=surfaceHeightAt(x,z);
    if(voxels[vKey(x,sh+1,z)])continue;
    const rr=Math.random();
    put(x,sh+1,z,rr<0.4?LEAF_BLOCK:rr<0.7?MUSHROOM_BLOCK:CRYSTAL_BLOCK);
  }
}
// 根元まわりの装飾: 苔・草・キノコ・発光植物を少量散らす
function _wtGroundDecor(plan){
  const{cx0,cz0,baseR}=plan,R=baseR+6;
  for(let i=0;i<60;i++){
    const a=Math.random()*WT_TAU,d=baseR*0.8+Math.random()*(R-baseR*0.8);
    const x=Math.round(cx0+Math.cos(a)*d),z=Math.round(cz0+Math.sin(a)*d),gy=surfaceHeightAt(x,z);
    if(voxels[vKey(x,gy+1,z)])continue;
    const rr=Math.random();
    if(rr<0.4)put(x,gy+1,z,LEAF_BLOCK);
    else if(rr<0.6)put(x,gy+1,z,MUSHROOM_BLOCK);
    else if(rr<0.72)put(x,gy+1,z,CRYSTAL_BLOCK);
  }
}

let _worldTreeBusy=false; // 生成中フラグ（ボタン連打による多重生成を防ぐ）
function generateWorldTree(){
  if(_worldTreeBusy){showBonus('🌳 世界樹を生成中…');return;}
  // 確認ダイアログ（生成する / キャンセル）
  if(!window.confirm('巨大な世界樹を生成します。周囲の地形が変化する場合があります。生成しますか？'))return;
  _worldTreeBusy=true;
  _wtSetProgress(true,0);
  // ── 準備（同期）: アンカー選定・チャンク確保・設計図・整地 ──
  let plan;
  try{
    const anchor=_pickTreeAnchor();
    _ensureChunksAround(anchor.cx0,anchor.cz0,WORLD_TREE_CFG.canopyR.max+4,3);
    const seed=((WORLD_SEED^(anchor.cx0*73856093)^(anchor.cz0*19349663))>>>0)||1; // ワールドシード＋座標で決定的
    plan=_planWorldTree(_wtRng(seed),anchor);
    _deferDirty=true;_wtBasePad(plan);_deferDirty=false;flushDirtyChunks();
  }catch(e){
    console.error('世界樹: 準備中にエラー',e);
    _deferDirty=false;try{flushDirtyChunks();}catch(_){}
    _worldTreeBusy=false;_wtSetProgress(false);showBonus('⚠ 世界樹の生成に失敗しました');
    return;
  }
  // ── フェーズ列（1フェーズ/フレームで実行して処理落ちを避ける）──
  const phases=[];
  const half=Math.floor(plan.H/2);
  phases.push(()=>_wtTrunkLayers(plan,0,half));                 // 幹（下半分）
  phases.push(()=>{_wtTrunkLayers(plan,half+1,plan.H);_wtCarveDoor(plan);}); // 幹（上半分）＋入口
  phases.push(()=>{_wtStairs(plan);_wtAltar(plan);});           // 螺旋階段＋祭壇
  const rN=plan.rootList.length,rMid=Math.ceil(rN/2);
  phases.push(()=>_wtRoots(plan,0,rMid));
  phases.push(()=>_wtRoots(plan,rMid,rN));
  const bN=plan.branchList.length,bMid=Math.ceil(bN/2);
  phases.push(()=>_wtBranches(plan,0,bMid));
  phases.push(()=>_wtBranches(plan,bMid,bN));
  const clN=plan.leafClumps.length,clStep=Math.max(1,Math.ceil(clN/4));
  for(let s=0;s<clN;s+=clStep){const a=s,b=Math.min(clN,s+clStep);phases.push(()=>_wtCanopy(plan,a,b));}
  phases.push(()=>{_wtVines(plan);_wtDeck(plan);});             // ツタ＋展望台
  phases.push(()=>{_wtSpring(plan);_wtGroundDecor(plan);});     // 泉＋根元の装飾
  // ── フレーム分割で実行 ──
  let idx=0;_deferDirty=true;
  const step=()=>{
    try{
      phases[idx]();idx++;
      _deferDirty=false;flushDirtyChunks();                     // フェーズ毎に段階的に姿を現す
      _wtSetProgress(true,idx/phases.length);
      if(idx<phases.length){_deferDirty=true;requestAnimationFrame(step);}
      else{
        _worldTreeBusy=false;_wtSetProgress(false);showBonus('🌳 世界樹を生成！');
        playTone(392,.14,.1,'triangle');setTimeout(()=>playTone(587,.14,.1,'triangle'),140);setTimeout(()=>playTone(784,.16,.1,'triangle'),300);
      }
    }catch(e){
      console.error('世界樹: 生成中にエラー',e);                // 途中でエラーが起きてもゲーム全体は止めない
      _deferDirty=false;try{flushDirtyChunks();}catch(_){}
      _worldTreeBusy=false;_wtSetProgress(false);showBonus('⚠ 世界樹の生成に失敗しました');
    }
  };
  requestAnimationFrame(step);
}

// ═══ 🦴 眠れる石神 ワンクリック生成 ═══
// クリエイティブ専用: プレイヤー前方の地表に、地面へ倒れて石化・風化した「超巨大な
// 人型の神」をプロシージャルに生成する。頭蓋骨・背骨・肋骨・両腕と手・脚・胸の
// 「古代の心核」・そばに突き刺さった巨大武器で構成された、遠景ランドマーク兼探索
// ダンジョン。血や肉は描かず、白骨と化石・骨の遺跡・神話時代の亡骸の雰囲気にする。
// 賢者の樹庭・監視塔・空中神殿・世界樹と同じ共有ヘルパー（put/clr/_frontAnchor/
// _ensureChunksAround/_footprintYBase/surfaceHeightAt）を使う。世界樹と同じく巨大
// なので requestAnimationFrame でフェーズを分割し、少しずつ生成して処理落ちを避ける。
//
// 各パーツは「ローカル座標」で設計し、鉛直まわりの yaw 回転（rotateLocalPosition＝
// _ssgLocalToWorld）でワールド座標へ変換する。yaw だけなので球は回転不変となり、
// ローカル中心をワールドへ移してからワールド球を積むだけで継ぎ目のない骨が描ける。
// ローカル x = 頭→足 の体軸 / ローカル y = 上 / ローカル z = 左右。

// ── 調整用パラメータ（形が崩壊しないよう、後段で最小値を効かせる）──
// null の項目は生成時にランダム化される（毎回同じ形にならないようにするため）。
const SLEEPING_STONE_GOD_CFG={
  anchorDist:34,        // プレイヤー前方の生成距離（巨大なので離す）
  giantLength:108,      // 全長（頭頂〜足先のローカル長さの目安）
  skullRadius:9,        // 頭蓋骨の半径（中空の探索部屋になる）
  bodyLength:46,        // 胴体（背骨）の長さ: 首の付け根〜骨盤
  ribCount:8,           // 肋骨の本数（左右それぞれ）
  ribSpacing:4,         // 肋骨の間隔（体軸方向）
  boneThickness:2,      // 骨の太さ（チューブ半径の基準）
  armLength:40,         // 腕の長さ（上腕＋前腕）
  legLength:42,         // 脚の長さ（大腿＋すね）
  handScale:1.0,        // 手・指のスケール
  burialDepth:4,        // 地面への埋まり具合（全体をこのぶん沈めて地形に馴染ませる）
  damageRate:0.12,      // 骨の欠損・ひび割れの割合
  mossRate:0.06,        // 苔（葉ブロック）の付着割合
  debrisRate:0.4,       // 周囲へ散らす崩れた骨片の量
  treasureCount:4,      // 宝箱の数
  enemyCount:5,         // 敵の配置数（クリエイティブでは湧くだけ）
  generateWeapon:true,  // 巨大武器を生成するか
  weaponType:null,      // 'sword'|'axe'|'spear'|null(=ランダム)
  direction:null,       // 0..7(=北南東西＋斜め)。null=ランダム
  overallRotation:null, // 追加の傾き(ラジアン)。null=わずかにランダム
  overallScale:1.0,     // 全体スケール（下げれば軽量化）
};

// 生成進捗オーバーレイ（世界樹のものを流用。ラベルだけ差し替えて使い終わりに戻す）
function _ssgSetProgress(show,frac){
  const el=document.getElementById('worldTreeProgress');if(!el)return;
  const lbl=document.getElementById('wtpLabel');
  el.style.display=show?'':'none';
  if(show){if(lbl)lbl.textContent='🦴 眠れる石神を生成中…';const fill=document.getElementById('wtpFill');if(fill)fill.style.width=Math.round((frac||0)*100)+'%';}
  else if(lbl)lbl.textContent='🌳 世界樹を生成中…';
}

// getTerrainHeight: 既存の地表高さ取得のエイリアス（各部位の接地に使う）
function _ssgGroundY(x,z){return surfaceHeightAt(x,z);}

// rotateLocalPosition: ローカル座標→ワールド座標（鉛直yaw回転＋スケール＋アンカー平行移動）
function _ssgLocalToWorld(plan,lx,ly,lz){
  const s=plan.scale,c=plan.cos,sn=plan.sin;
  const rx=(lx*c-lz*sn)*s,rz=(lx*sn+lz*c)*s;
  return{x:Math.round(plan.ax+rx),y:Math.round(plan.baseY+ly*s),z:Math.round(plan.az+rz)};
}
// 骨ブロック: 白(ウール)を主体に、風化した象牙(粘土)・黄土(砂)・灰石・石を位置ハッシュ
// で混ぜて陰影と風化を出す（単色を避ける）。ごく低確率で苔を混ぜる
function _ssgBone(x,y,z,plan){
  const h=_wtHash((x*73856093)^(y*19349663)^(z*83492791));
  if(y>plan.groundY&&h<plan.mossRate)return LEAF_BLOCK; // 上面寄りに苔
  if(h<0.16)return CLAY_BLOCK;   // 風化した象牙色（やや灰）
  if(h<0.28)return 2;            // 黄土色（砂）＝古い骨のシミ
  if(h<0.38)return 6;            // 灰石＝陰影
  if(h<0.44)return 1;            // 石＝濃い陰
  return WOOL_BLOCK;             // 骨の白（主体）
}
// ワールド球を積む（solid、または opts.thk で殻＝内部空洞）。ti 未指定なら骨ブロック
function _ssgSphere(plan,wx,wy,wz,r,opts){
  opts=opts||{};const thk=opts.thk||0,dmg=opts.damage==null?0:opts.damage,ti=opts.ti;
  const R=Math.ceil(r),r2=r*r,ri2=thk>0?(r-thk)*(r-thk):-1;
  for(let dx=-R;dx<=R;dx++)for(let dy=-R;dy<=R;dy++)for(let dz=-R;dz<=R;dz++){
    const d2=dx*dx+dy*dy+dz*dz;if(d2>r2)continue;if(ri2>=0&&d2<ri2)continue;
    const x=wx+dx,y=wy+dy,z=wz+dz;
    if(dmg>0&&_wtHash(((x*911)^(y*57)^(z*131))+7)<dmg)continue; // 欠損/ひび
    put(x,y,z,ti!=null?ti:_ssgBone(x,y,z,plan));
  }
}
// ワールド球を掘る（内部の探索空間・目/口/ひび割れなどの侵入口）
function _ssgCarve(wx,wy,wz,r){
  const R=Math.ceil(r),r2=r*r;
  for(let dx=-R;dx<=R;dx++)for(let dy=-R;dy<=R;dy++)for(let dz=-R;dz<=R;dz++)
    if(dx*dx+dy*dy+dz*dz<=r2)clr(wx+dx,wy+dy,wz+dz);
}
// ローカルの経路（点列）に沿って骨の球を連ね、継ぎ目のないチューブ（骨）を作る
function _ssgPolyline(plan,pts,localR,opts){
  for(let i=0;i<pts.length;i++){
    const p=pts[i],w=_ssgLocalToWorld(plan,p[0],p[1],p[2]);
    const r=(Array.isArray(localR)?localR[i]:localR)*plan.scale;
    _ssgSphere(plan,w.x,w.y,w.z,Math.max(1,r),opts);
  }
}
// ローカルの2点を結ぶ骨（半径 r0→r1 でテーパー）。密な点列にして途切れさせない
function _ssgBoneSeg(plan,a,b,r0,r1,opts){
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
  const n=Math.max(2,Math.round(Math.hypot(dx,dy,dz)));
  const pts=[],rs=[];
  for(let i=0;i<=n;i++){const t=i/n;pts.push([a[0]+dx*t,a[1]+dy*t,a[2]+dz*t]);rs.push(r0+(r1-r0)*t);}
  _ssgPolyline(plan,pts,rs,opts);
}

// ── 敵をワールド座標へ直接1体配置（既存の敵システムを流用。生成順の都合で combat.js
// のグローバル(ENEMY_TYPES/enemies/makeMat)は実行時に解決されるため typeof で防御）──
function _ssgSpawnEnemyAt(wx,wy,wz,idx){
  if(typeof ENEMY_TYPES==='undefined'||typeof enemies==='undefined'||typeof makeMat!=='function')return;
  const et=ENEMY_TYPES[Math.max(0,Math.min(ENEMY_TYPES.length-1,idx|0))];
  try{
    const mat=makeMat(et.color,et.emissive,et.emissiveIntensity||.15,.6);
    const built=et.builder(mat);
    built.root.position.set(wx+.5,wy+(et.bat?3:1.85),wz+.5);
    if(typeof markShadowCaster==='function')markShadowCaster(built.root);
    scene.add(built.root);
    const wv=(typeof gs!=='undefined'&&gs.wave)||0,mhp=et.hp+Math.floor(wv*.7);
    enemies.push({root:built.root,body:built.body,head:built.head,hpBar:built.hpBar,hp:mhp,maxHp:mhp,type:et,velY:0,onGround:false,atkCd:0,stuckT:0,lastX:wx+.5,lastZ:wz+.5,flashMeshes:[built.body,built.head],dead:false,breakCd:0,lWing:built.lWing,rWing:built.rWing});
  }catch(e){console.warn('眠れる石神: 敵の配置に失敗',e);}
}
// ── 宝箱をワールド座標へ配置（既存の underTreasures 宝箱システムを流用、type3=豪華報酬）
// 注: 既存の地上構造物の宝箱と同じ「セッション内登録」方式。地形ブロックは worldEdits で
// 永続化されるが、宝箱メッシュはチャンク完全アンロード→再訪では復元されない（既知の制約）
function _ssgPlaceChest(wx,wy,wz){
  const tk=vKey(wx,wy,wz);if(underTreasures[tk])return;
  put(wx,wy-1,wz,1);clr(wx,wy,wz);clr(wx,wy+1,wz); // 石の土台＋宝箱ぶんの空間
  const mesh=_makeTreasureMesh(3);mesh.position.set(wx+.5,wy,wz+.5);
  if(!openedTreasureKeys.has(tk))scene.add(mesh);
  underTreasures[tk]={mesh,opened:openedTreasureKeys.has(tk),type:3,struct:'sleepingStoneGod'};
}

// 巨人の「設計図」を決定的に作る（重い put は後段のフェーズで実行）。ポーズ（頭の向き・
// 曲げる腕・埋まる脚・欠損）に軽いランダム差分を入れ、毎回同じ形にならないようにする
function _planGiantRemains(rng,anchor){
  const cfg=SLEEPING_STONE_GOD_CFG;
  const cx0=anchor.cx0,cz0=anchor.cz0;
  const scale=cfg.overallScale||1;
  const dir=cfg.direction!=null?cfg.direction:Math.floor(rng()*8);        // 北南東西＋斜め
  const rot=cfg.overallRotation!=null?cfg.overallRotation:(rng()-0.5)*0.4; // 自然な傾き
  const dirAngle=dir*Math.PI/4+rot;
  const skullR=cfg.skullRadius,boneR=cfg.boneThickness,body=cfg.bodyLength;
  // フットプリント（全体が収まる半径）で整地基準の高さを取る
  const foot=Math.round((skullR*1.4+body+cfg.legLength+8)*scale);
  const ybase=_footprintYBase(cx0,cz0,Math.min(foot,60),6);
  const plan={
    cfg,ax:cx0,az:cz0,cx0,cz0,scale,dir,dirAngle,cos:Math.cos(dirAngle),sin:Math.sin(dirAngle),
    ybase,baseY:ybase-cfg.burialDepth,groundY:ybase, // groundY: ワールドの地表面Y（苔判定に使う）
    skullR,boneR,body,mossRate:cfg.mossRate,damageRate:cfg.damageRate,
    contacts:[],chestSpots:[],enemySpots:[],
  };
  // 体軸レイアウト（ローカルx: 頭0 → 足）。背骨は burialDepth ぶん沈めても地表より上に
  // 出るよう、埋没量より少し高い位置に置く（＝一部だけ土に埋まって見える）
  plan.spineY=cfg.burialDepth+2;             // 背骨は地面すぐ上（一部埋没）
  plan.spineStartX=skullR*1.4;               // 首の付け根
  plan.pelvisX=plan.spineStartX+body;        // 骨盤
  plan.shoulderX=plan.spineStartX+body*0.12; // 肩
  plan.ribWidth=skullR*1.7;                  // 肋骨の張り出し
  plan.sternumY=skullR*1.5;                  // 胸の高さ（肋骨の頂点＝胸骨ライン）
  plan.spineCurve=1+rng()*1.2;               // 背骨の緩いS字カーブ量
  plan.headZ=(rng()<0.5?-1:1)*(1.5+rng()*2); // 頭が少し横を向く
  plan.bentArm=rng()<0.5?-1:1;               // 曲げる腕（-1=左/+1=右）
  plan.buriedLeg=rng()<0.5?-1:1;             // 地中に埋まる脚
  plan.chestX=plan.shoulderX+(cfg.ribCount-1)*cfg.ribSpacing*0.5; // 胸郭中心（心核）
  // 肋骨: 欠損する本数をランダムに選ぶ（倒れて折れた/土に埋まった表現）
  plan.ribMissing={};
  const nMiss=Math.floor(rng()*3);
  for(let m=0;m<nMiss;m++){const i=Math.floor(rng()*cfg.ribCount),s=rng()<0.5?-1:1;plan.ribMissing[i+'_'+s]=true;}
  plan.weaponType=cfg.weaponType||['sword','axe','spear'][Math.floor(rng()*3)];
  plan.rng=rng;
  return plan;
}

// ── generateSpine: 頭から腰まで、節のある背骨（椎骨の連続）を緩いカーブで並べる ──
function _ssgSpine(plan){
  const x0=plan.spineStartX,x1=plan.pelvisX,seg=2.2,rng=plan.rng;
  for(let x=x0;x<=x1;x+=seg){
    const u=(x-x0)/(x1-x0);
    const z=Math.sin(u*Math.PI*1.5)*plan.spineCurve;   // 地面に沿った緩いカーブ
    const y=plan.spineY+Math.sin(u*Math.PI)*1.2;       // ゆるいアーチ
    const w=_ssgLocalToWorld(plan,x,y,z);
    plan.contacts.push({x:w.x,y:w.y,z:w.z});
    if(_wtHash((w.x*31)^(w.z*17))<plan.damageRate*0.6)continue; // 一部が崩れて途切れる
    _ssgSphere(plan,w.x,w.y,w.z,Math.max(1,boneMul(plan,1.15)),{});
    // 椎骨の棘突起（上へ突き出す小さな節）で「棒でない骨らしさ」を出す
    _ssgSphere(plan,w.x,w.y+Math.round(plan.boneR*1.2*plan.scale),w.z,Math.max(1,boneMul(plan,0.5)),{});
  }
}
function boneMul(plan,m){return plan.boneR*m*plan.scale;}

// ── generateRibCage: 背骨の左右に、外側へ膨らむ弧を描く肋骨を並べる。上部に胸骨、
// 内部は歩いて探索できる巨大ホール。肋骨の間・欠損部が侵入口になる ──
function _ssgRibCage(plan){
  const cfg=plan.cfg;
  for(let i=0;i<cfg.ribCount;i++){
    const ribX=plan.shoulderX+i*cfg.ribSpacing;
    for(const side of[-1,1]){
      if(plan.ribMissing[i+'_'+side])continue;      // 欠損した肋骨は飛ばす
      const broken=_wtHash((i*97)^(side*131))<plan.damageRate; // 途中で折れる
      const N=Math.max(8,Math.round(plan.ribWidth+plan.sternumY-plan.spineY));
      const uMax=broken?0.55+plan.rng()*0.2:1.0;
      const pts=[];
      for(let k=0;k<=N;k++){
        const u=(k/N)*uMax;
        const z=side*plan.ribWidth*Math.sin(u*Math.PI*0.95);           // 外へ張り出して戻る弧
        const y=plan.spineY+(plan.sternumY-plan.spineY)*Math.sin(u*Math.PI/2); // 背骨→胸骨へ上る
        const x=ribX+Math.sin(u*Math.PI)*cfg.ribSpacing*0.35;          // わずかに前へ反る
        pts.push([x,y,z]);
      }
      _ssgPolyline(plan,pts,plan.boneR*0.95,{damage:plan.damageRate*0.4});
    }
    // 胸骨: 肋骨の頂点付近を体軸方向につなぐ節（心核の上だけは割れ目として開ける）
    if(Math.abs(ribX-plan.chestX)>3.0){
      const w=_ssgLocalToWorld(plan,ribX,plan.sternumY,0);
      _ssgSphere(plan,w.x,w.y,w.z,Math.max(1,boneMul(plan,0.9)),{damage:plan.damageRate*0.5});
    }
    // 肋骨内部の敵の湧き位置候補（床＝地表付近）
    if(i%3===1){const w=_ssgLocalToWorld(plan,ribX,plan.spineY,0);plan.enemySpots.push({x:w.x,y:plan.ybase,z:w.z});}
  }
  // 肋骨内部に1つ宝箱候補（胸郭のホール床）
  const wc=_ssgLocalToWorld(plan,plan.shoulderX+cfg.ribSpacing,plan.spineY,plan.ribWidth*0.4);
  plan.chestSpots.push({x:wc.x,y:plan.ybase+1,z:wc.z});
}

// ── generateSkull + generateJaw: 巨大な中空の頭蓋骨。目/鼻/口/後頭部のひびから内部へ
// 入れ、内部は小さな探索部屋（祭壇・発光・宝箱・敵）。下顎は少し開いて口が侵入口 ──
function _ssgSkull(plan){
  const skullR=plan.skullR,cy=skullR+plan.spineY*0.2; // ローカルの頭中心の高さ
  const S=_ssgLocalToWorld(plan,0,cy,plan.headZ);      // 頭中心（ワールド）
  plan.skullWorld=S;
  const thk=Math.max(2,Math.round(plan.boneR*plan.scale));
  // 頭蓋骨の殻（後頭部側=+x に欠けを作る）
  _ssgSphere(plan,S.x,S.y,S.z,skullR*plan.scale,{thk,damage:plan.damageRate*0.35});
  _ssgCarve(S.x,S.y,S.z,(skullR-thk-0.5)*plan.scale);   // 内部を確実に空洞化
  // 内部の床（立てる面）＝地表付近に骨/石の平床
  const floorY=Math.max(plan.ybase, S.y-Math.round((skullR-thk-1)*plan.scale));
  const fr=Math.round((skullR-thk-0.5)*plan.scale);
  for(let dx=-fr;dx<=fr;dx++)for(let dz=-fr;dz<=fr;dz++)if(dx*dx+dz*dz<=fr*fr)put(S.x+dx,floorY,S.z+dz,_ssgBone(S.x+dx,floorY,S.z+dz,plan));
  // 顔は体と反対（-x側）。目・鼻・口・後頭部のひびを掘って侵入口にする
  const F=v=>_ssgLocalToWorld(plan,v[0],cy+v[1],plan.headZ+v[2]);
  const eyeL=F([-skullR*0.55,skullR*0.15,-skullR*0.42]),eyeR=F([-skullR*0.55,skullR*0.15,skullR*0.42]);
  _ssgCarve(eyeL.x,eyeL.y,eyeL.z,2.3*plan.scale);      // 目の空洞（侵入口）
  _ssgCarve(eyeR.x,eyeR.y,eyeR.z,2.3*plan.scale);
  const nose=F([-skullR*0.72,-skullR*0.02,0]);_ssgCarve(nose.x,nose.y,nose.z,1.4*plan.scale); // 鼻の空洞
  const mouth=F([-skullR*0.5,-skullR*0.5,0]);_ssgCarve(mouth.x,mouth.y,mouth.z,2.6*plan.scale); // 口（侵入口）
  const crack=F([skullR*0.7,skullR*0.25,0]);_ssgCarve(crack.x,crack.y,crack.z,2.2*plan.scale);  // 後頭部のひび（侵入口）
  const chip=F([skullR*0.35,skullR*0.6,skullR*0.2]);_ssgCarve(chip.x,chip.y,chip.z,2.0*plan.scale); // 頭頂部の欠け
  // 苔・土の付着（上半球に少量）
  for(let n=0;n<20;n++){
    const a=plan.rng()*Math.PI*2,e=plan.rng()*0.9;
    const rx=Math.cos(a)*Math.cos(e),ry=Math.sin(e),rz=Math.sin(a)*Math.cos(e);
    const x=S.x+Math.round(rx*skullR*plan.scale),y=S.y+Math.round(ry*skullR*plan.scale),z=S.z+Math.round(rz*skullR*plan.scale);
    if(voxels[vKey(x,y,z)]&&plan.rng()<0.5)put(x,y,z,plan.rng()<0.6?LEAF_BLOCK:CAVE_DIRT);
  }
  // 内部の小部屋: 古代の祭壇（発光する御神体）＋松明。宝箱と敵の候補位置を登録
  put(S.x,floorY+1,S.z,SLAB_BLOCK,0);put(S.x,floorY+2,S.z,CRYSTAL_BLOCK);
  put(S.x+2,floorY+1,S.z+2,TORCH_BLOCK);put(S.x-2,floorY+1,S.z-2,TORCH_BLOCK);
  plan.chestSpots.push({x:S.x+2,y:floorY+1,z:S.z-2});          // 頭蓋骨内部の宝箱
  plan.chestSpots.push({x:eyeL.x,y:Math.max(plan.ybase+1,eyeL.y-1),z:eyeL.z}); // 片目の奥
  plan.enemySpots.push({x:S.x-1,y:floorY+1,z:S.z+1});          // 頭蓋骨内部の敵
  // 下顎（少し開いた口＝侵入口を残す）
  _ssgJaw(plan,cy);
}
function _ssgJaw(plan,cy){
  const skullR=plan.skullR,chinY=cy-skullR*0.85,jawW=skullR*0.6,N=14;
  const pts=[];
  for(let k=0;k<=N;k++){
    const u=k/N,z=(u*2-1)*jawW;
    const x=-skullR*0.35-(1-Math.abs(u*2-1))*skullR*0.55; // あご先が -x へ突き出す U 字
    const y=chinY+(1-Math.abs(u*2-1))*(-1.2);              // あご先が少し下がる
    pts.push([x,y,z+plan.headZ]);
  }
  _ssgPolyline(plan,pts,plan.boneR*0.85,{damage:plan.damageRate*0.4});
}

// ── generateArm + generateHand: 左右で異なる姿勢（片方は地面へ伸び、片方は肘を曲げる）。
// 上腕・前腕・肘、そして指を1本ずつ判別できる巨大な手。手のひらに報酬を置く ──
function _ssgArm(plan,side){
  const cfg=plan.cfg,bent=(side===plan.bentArm),armL=cfg.armLength;
  const shoulder=[plan.shoulderX,plan.spineY+1.5,side*plan.ribWidth*0.95];
  let elbow,wrist;
  if(bent){ // 肘を曲げ、前腕を胸元へ折り返す
    elbow=[plan.shoulderX+armL*0.28,plan.spineY+2,side*(plan.ribWidth+armL*0.34)];
    wrist=[plan.shoulderX-armL*0.02,plan.spineY+armL*0.14,side*(plan.ribWidth+armL*0.10)];
  }else{    // 体の横に真っ直ぐ伸ばして地面に横たわる
    elbow=[plan.shoulderX+armL*0.30,plan.spineY+0.5,side*(plan.ribWidth+armL*0.34)];
    wrist=[plan.shoulderX+armL*0.62,plan.spineY,side*(plan.ribWidth+armL*0.50)];
  }
  _ssgSphere(plan,..._triW(plan,shoulder),Math.max(1,boneMul(plan,1.6)),{}); // 肩関節
  _ssgBoneSeg(plan,shoulder,elbow,plan.boneR*1.4,plan.boneR*1.1,{});          // 上腕
  _ssgSphere(plan,..._triW(plan,elbow),Math.max(1,boneMul(plan,1.3)),{});     // 肘
  _ssgBoneSeg(plan,elbow,wrist,plan.boneR*1.1,plan.boneR*0.9,{});             // 前腕
  _ssgHand(plan,side,wrist,elbow,bent);
}
// ローカル点→_ssgLocalToWorld の (x,y,z) を配列で返す（スプレッド用）
function _triW(plan,p){const w=_ssgLocalToWorld(plan,p[0],p[1],p[2]);return[w.x,w.y,w.z];}
function _ssgHand(plan,side,wrist,elbow,bent){
  const hs=plan.cfg.handScale;
  // 手の向き＝前腕の延長（肘→手首）方向をローカル x-z 平面で正規化
  let dx=wrist[0]-elbow[0],dz=wrist[2]-elbow[2];const dl=Math.hypot(dx,dz)||1;dx/=dl;dz/=dl;
  const px=-dz,pz=dx; // 指を扇状に広げる横方向
  const palm=[wrist[0]+dx*2*hs,plan.spineY+0.5,wrist[2]+dz*2*hs];
  // 手のひら（平たい塊）
  _ssgSphere(plan,..._triW(plan,palm),Math.max(1,plan.boneR*1.8*hs*plan.scale),{});
  // 5本の指（親指＋4指）。指ごとに3節、先へ細くする。一部は折れる/埋まる差分
  for(let f=0;f<5;f++){
    const spread=(f-2)*0.5,dirx=dx+px*spread,dirz=dz+pz*spread,dn=Math.hypot(dirx,dirz)||1;
    const ux=dirx/dn,uz=dirz/dn;
    const fLen=(f===0?4.5:6.2)*hs;                 // 親指は短い
    const broken=_wtHash((side*71)^(f*131))<plan.damageRate; // 折れた指
    let base=[palm[0]+ux*plan.boneR*1.5,plan.spineY+0.3,palm[2]+uz*plan.boneR*1.5];
    const nSeg=broken?1+Math.floor(plan.rng()*2):3;
    for(let s=0;s<nSeg;s++){
      const t0=s/3,t1=(s+1)/3;
      const a=[base[0]+ux*fLen*t0,plan.spineY+0.3-(bent?0:t0*0.5),base[2]+uz*fLen*t0];
      const b=[base[0]+ux*fLen*t1,plan.spineY+0.3-(bent?0:t1*0.5),base[2]+uz*fLen*t1];
      _ssgBoneSeg(plan,a,b,(1.0-t0*0.4)*plan.boneR*0.7*hs,(1.0-t1*0.4)*plan.boneR*0.7*hs,{});
      _ssgSphere(plan,..._triW(plan,a),Math.max(1,plan.boneR*0.55*hs*plan.scale),{}); // 指の関節
    }
  }
  // 手のひらの上に報酬（伸ばした手＝発光する石／曲げた手＝古代の紋章風の鉱石）＋宝箱候補
  const pw=_ssgLocalToWorld(plan,palm[0],palm[1]+1,palm[2]);
  if(!bent){put(pw.x,pw.y,pw.z,CRYSTAL_BLOCK);plan.chestSpots.push({x:pw.x,y:pw.y,z:pw.z+2});}
  else{for(let dxx=-1;dxx<=1;dxx++)for(let dzz=-1;dzz<=1;dzz++)if((dxx+dzz)&1)put(pw.x+dxx,pw.y,pw.z+dzz,DIAMOND_ORE);} // 巨人が握っていた鉱石
}

// ── generateLeg: 骨盤から大腿・膝・すね・足・足の指。片脚は地中に深く埋める ──
function _ssgLeg(plan,side){
  const cfg=plan.cfg,legL=cfg.legLength,buried=(side===plan.buriedLeg);
  const spread=plan.ribWidth*0.5;
  const hip=[plan.pelvisX,plan.spineY+1,side*spread];
  const knee=[plan.pelvisX+legL*0.45,plan.spineY+(buried?legL*0.16:2),side*spread*1.15];
  // 埋まる脚は足首/足を地表下(ローカルy<groundY)へ沈める
  const ankleY=buried?-cfg.burialDepth*0.5:plan.spineY;
  const ankle=[plan.pelvisX+legL*0.9,ankleY,side*spread*1.2];
  const foot=[plan.pelvisX+legL,ankleY-0.5,side*spread*1.25];
  // 骨盤の塊
  _ssgSphere(plan,..._triW(plan,[plan.pelvisX,plan.spineY+1,0]),Math.max(1,boneMul(plan,2.0)),{});
  _ssgSphere(plan,..._triW(plan,hip),Math.max(1,boneMul(plan,1.6)),{});      // 股関節
  _ssgBoneSeg(plan,hip,knee,plan.boneR*1.6,plan.boneR*1.2,{damage:buried?plan.damageRate:0}); // 大腿骨
  _ssgSphere(plan,..._triW(plan,knee),Math.max(1,boneMul(plan,1.4)),{});     // 膝
  _ssgBoneSeg(plan,knee,ankle,plan.boneR*1.2,plan.boneR*1.0,{damage:buried?plan.damageRate*1.5:0}); // すね
  if(!buried){                                                              // 足＋足の指（埋没脚は省略）
    _ssgBoneSeg(plan,ankle,foot,plan.boneR*1.1,plan.boneR*1.3,{});
    for(let t=0;t<5;t++){
      const toe=[foot[0]+2+t*0.3,foot[1]-0.3,foot[2]+(t-2)*1.1*side];
      _ssgBoneSeg(plan,foot,toe,plan.boneR*0.6,plan.boneR*0.35,{damage:plan.damageRate});
    }
    plan.contacts.push({x:_triW(plan,foot)[0],y:plan.ybase,z:_triW(plan,foot)[2]});
  }
  plan.contacts.push({x:_triW(plan,hip)[0],y:plan.ybase,z:_triW(plan,hip)[2]});
}

// ── generateHeartCore: 胸郭中央に「古代の心核」の部屋。生物の心臓ではなく、巨人を
// 動かしていた魔力の核／古代装置のイメージ。発光する中心核・円形の部屋・周囲の古代石・
// 特殊鉱石・宝箱・ボス配置・侵入口。胸の割れ目から中がわずかに光って見える ──
function _ssgHeartCore(plan){
  const cx=plan.chestX,coreY=plan.sternumY*0.5,roomR=Math.max(4,plan.skullR*0.6);
  const C=_ssgLocalToWorld(plan,cx,coreY,0);
  // 古代石の球殻の部屋（黒曜石＝古代石）。内部は空洞
  _ssgSphere(plan,C.x,C.y,C.z,roomR*plan.scale,{ti:OBSIDIAN_BLOCK,thk:1.6});
  _ssgCarve(C.x,C.y,C.z,(roomR-1.6)*plan.scale);
  // 床
  const fY=C.y-Math.round((roomR-2)*plan.scale),fr=Math.round((roomR-2)*plan.scale);
  for(let dx=-fr;dx<=fr;dx++)for(let dz=-fr;dz<=fr;dz++)if(dx*dx+dz*dz<=fr*fr)put(C.x+dx,fY,C.z+dz,DEEP_STONE);
  // 周囲を囲む古代石の柱4本＋特殊鉱石
  for(let a=0;a<4;a++){const ang=a*Math.PI/2,rx=Math.round(Math.cos(ang)*(roomR-2)*plan.scale),rz=Math.round(Math.sin(ang)*(roomR-2)*plan.scale);
    for(let dy=1;dy<=Math.round((roomR-1)*plan.scale);dy++)put(C.x+rx,fY+dy,C.z+rz,dy%3===0?DIAMOND_ORE:OBSIDIAN_BLOCK);}
  // 中心核: 宙に浮く発光する結晶塊
  _ssgSphere(plan,C.x,C.y,C.z,Math.max(1.5,2.2*plan.scale),{ti:CRYSTAL_BLOCK});
  // 胸の割れ目（外壁の -y 側＝胸の外側から内部へ続く侵入口）。同時に光が漏れる
  const slit=_ssgLocalToWorld(plan,cx,plan.sternumY,0);
  _ssgCarve(slit.x,slit.y,slit.z,2.4*plan.scale);
  put(slit.x,slit.y-1,slit.z,CRYSTAL_BLOCK); // 割れ目のすぐ内側に発光ブロック→外からわずかに光る
  // 側面からの侵入口（肋骨の隙間からまっすぐ心核へ）
  const ent=_ssgLocalToWorld(plan,cx,coreY,plan.ribWidth);
  for(let r=0;r<=Math.round(plan.ribWidth*plan.scale);r++){const t=r/(plan.ribWidth*plan.scale||1);
    const x=Math.round(C.x+(ent.x-C.x)*t),y=Math.round(C.y+(ent.y-C.y)*t),z=Math.round(C.z+(ent.z-C.z)*t);
    _ssgCarve(x,y,z,1.6*plan.scale);}
  // 宝箱・ボス・敵の配置候補
  plan.chestSpots.unshift({x:C.x+2,y:fY+1,z:C.z}); // 心核の間の宝箱（最優先）
  plan.enemySpots.unshift({x:C.x,y:fY+1,z:C.z,boss:true}); // 心核のボス/強敵
}

// ── generateGiantWeapon: 巨人のそばに巨大な武器（剣/斧/槍からランダム）。地面に突き
// 刺さり、根元にクレーターとひび割れ・砕けた岩・苔、根元に小さな探索空間 ──
function _ssgWeapon(plan){
  // 伸ばした腕（=曲げていない側）の手の先あたりに配置
  const side=-plan.bentArm,armL=plan.cfg.armLength;
  const hand=_ssgLocalToWorld(plan,plan.shoulderX+armL*0.75,plan.spineY,side*(plan.ribWidth+armL*0.62));
  const gx=hand.x+Math.round((plan.rng()*6-3)),gz=hand.z+Math.round((plan.rng()*6-3));
  const gy=_ssgGroundY(gx,gz);
  const ang=plan.dirAngle+Math.PI/2+(plan.rng()-0.5); // だいたい体軸に直交して刺さる
  const ux=Math.cos(ang),uz=Math.sin(ang);
  const type=plan.weaponType,S=plan.scale;
  const bladeMat=(x,y,z)=>_wtHash((x*13)^(y*7)^(z*5))<0.25?IRON_ORE:_wtHash((x*3)^(z*9))<0.4?6:1; // 石＋灰石＋鉄の刃
  const stampCol=(x,y,z,r,mat)=>{const R=Math.ceil(r);for(let dx=-R;dx<=R;dx++)for(let dy=-R;dy<=R;dy++)for(let dz=-R;dz<=R;dz++){if(dx*dx+dy*dy+dz*dz>r*r)continue;put(x+dx,y+dy,z+dz,mat(x+dx,y+dy,z+dz));}};
  if(type==='spear'){
    // 槍: 地面に斜めに突き刺さる長い柄＋穂先
    const len=Math.round(46*S);
    for(let t=0;t<=len;t++){const f=t/len;const x=Math.round(gx+ux*Math.round(f*len*0.4)),z=Math.round(gz+uz*Math.round(f*len*0.4)),y=gy-Math.round(4*S)+Math.round(f*len);stampCol(x,y,z,Math.max(1,1.6*S*(1-f*0.3)),f>0.9?bladeMat:(a,b,c)=>3);}
  }else if(type==='axe'){
    // 斧: 地面から立つ太い柄＋上端の大きな斧頭（横倒しに近い自然な角度）
    const len=Math.round(30*S);
    for(let t=0;t<=len;t++){const y=gy-Math.round(3*S)+t;stampCol(gx,y,gz,Math.max(1,1.6*S),(a,b,c)=>3);} // 柄
    const hy=gy-Math.round(3*S)+len; // 斧頭（柄の上端から ux/uz 方向へ扇状に広がる刃）
    for(let dy=-Math.round(5*S);dy<=Math.round(5*S);dy++)for(let d=0;d<=Math.round(7*S);d++){
      const w=Math.round((1-Math.abs(dy)/(6*S))*d*0.6);if(w<0)continue;
      for(let dz=-w;dz<=w;dz++){const hx=Math.round(gx+ux*d),hz=Math.round(gz+uz*d);put(hx,hy+dy,hz,bladeMat(hx,hy+dy,hz));}
    }
  }else{
    // 剣: 地面に突き刺さる長い刀身＋鍔＋柄（刀身の下部は埋まる）
    const len=Math.round(50*S);
    for(let t=0;t<=len;t++){const f=t/len;const y=gy-Math.round(10*S)+Math.round(f*len);const w=Math.max(1,(1.6-Math.abs(f-0.5)*0.8)*S);stampCol(gx,y,gz,w,f<0.15?(a,b,c)=>1:bladeMat);}
    const gY=gy+Math.round(len*0.55);for(let d=-Math.round(5*S);d<=Math.round(5*S);d++)put(Math.round(gx+ux*d),gY,Math.round(gz+uz*d),1); // 鍔
    for(let t=1;t<=Math.round(8*S);t++)put(gx,gY+t,gz,3); // 柄
  }
  // 根元のクレーター＋ひび割れ＋砕けた岩＋苔
  for(let dx=-Math.round(8*S);dx<=Math.round(8*S);dx++)for(let dz=-Math.round(8*S);dz<=Math.round(8*S);dz++){
    const d=Math.hypot(dx,dz);if(d>8*S)continue;const x=gx+dx,z=gz+dz,sh=_ssgGroundY(x,z);
    if(d<3*S){clr(x,sh,z);put(x,sh-1,z,1);}                 // 中心を浅く抉る（クレーター）
    else if(_wtHash((x*7)^(z*13))<0.5)put(x,sh,z,_wtHash((x*5)^(z*3))<0.3?6:_wtHash(x^z)<0.2?LEAF_BLOCK:1); // 砕けた岩・苔・ひび
  }
  // 根元の小さな探索空間＋宝箱候補
  _ssgCarve(gx,gy,gz,2.2*S);put(gx,gy-1,gz,1);
  plan.chestSpots.push({x:gx,y:gy,z:gz});
  plan.enemySpots.push({x:gx+2,y:gy,z:gz});
  plan.contacts.push({x:gx,y:gy,z:gz});
}

// ── generateBoneDebris: 周囲へ崩れた骨片を散らし、地形に馴染ませる ──
function _ssgDebris(plan){
  const cfg=plan.cfg,foot=Math.round((plan.skullR+plan.body+cfg.legLength)*plan.scale*0.6);
  const n=Math.round(40*cfg.debrisRate);
  for(let i=0;i<n;i++){
    const a=plan.rng()*Math.PI*2,d=plan.skullR*plan.scale+plan.rng()*foot;
    const x=plan.cx0+Math.round(Math.cos(a)*d),z=plan.cz0+Math.round(Math.sin(a)*d),sh=_ssgGroundY(x,z);
    const r=1+Math.floor(plan.rng()*2);
    for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)for(let dy=0;dy<=r;dy++){if(dx*dx+dy*dy+dz*dz>r*r)continue;if(voxels[vKey(x+dx,sh+dy,z+dz)]&&plan.rng()<0.5)continue;put(x+dx,sh+dy,z+dz,_ssgBone(x+dx,sh+dy,z+dz,plan));}
  }
}

// ── blendWithTerrain: 接地点の下に土/石を詰めて骨が浮かないようにし、上に苔・土を少量
// 載せて地形の一部に見せる。地面の高さを取得して各接地点に合わせて盛る ──
function _ssgBlend(plan){
  const mr=4;
  for(const c of plan.contacts){
    for(let dx=-mr;dx<=mr;dx++)for(let dz=-mr;dz<=mr;dz++){
      const d=Math.hypot(dx,dz);if(d>mr)continue;
      const x=c.x+dx,z=c.z+dz,sh=_ssgGroundY(x,z);
      const top=Math.min(c.y-1,sh+Math.round((1-d/mr)*2)); // 距離で減衰する小さな盛り土
      for(let y=sh+1;y<=top;y++)put(x,y,z,y===top?(_wtHash(x^z)<0.3?0:5):1); // 石で埋め、天面は草
      if(_wtHash((x*17)^(z*7))<plan.mossRate*2){const v=voxels[vKey(x,c.y+1,z)];if(!v)put(x,c.y+1,z,LEAF_BLOCK);} // 骨の上に苔
    }
  }
}

// placeTreasure: 集めた候補位置から treasureCount 個の宝箱を配置（既存宝箱システム）
function _ssgTreasure(plan){
  const spots=plan.chestSpots;let placed=0;
  for(let i=0;i<spots.length&&placed<plan.cfg.treasureCount;i++){const s=spots[i];_ssgPlaceChest(s.x,s.y,s.z);placed++;}
}
// placeEnemies: 集めた候補位置から enemyCount 体の敵を配置（既存の敵システム）。
// クリエイティブでは湧くだけ。心核のボス候補には強めの敵（ゴーレム系）を置く
function _ssgEnemies(plan){
  const spots=plan.enemySpots;let placed=0;
  for(let i=0;i<spots.length&&placed<plan.cfg.enemyCount;i++){
    const s=spots[i];
    const idx=s.boss?(typeof ENEMY_TYPES!=='undefined'&&ENEMY_TYPES.length>8?8:2):[0,1,5][placed%3];
    _ssgSpawnEnemyAt(s.x,s.y,s.z,idx);placed++;
  }
}

let _sleepingStoneGodBusy=false; // 生成中フラグ（ボタン連打の多重生成を防ぐ）
function generateSleepingStoneGod(){
  if(_sleepingStoneGodBusy){showBonus('🦴 眠れる石神を生成中…');return;}
  if(!window.confirm('超巨大な「眠れる石神」を生成します。周囲の地形が変化する場合があります。生成しますか？'))return;
  _sleepingStoneGodBusy=true;_ssgSetProgress(true,0);
  let plan;
  try{
    const anchor=_frontAnchor(SLEEPING_STONE_GOD_CFG.anchorDist);
    const cfg=SLEEPING_STONE_GOD_CFG;
    const foot=Math.round((cfg.skullRadius*1.4+cfg.bodyLength+cfg.legLength+8)*(cfg.overallScale||1));
    _ensureChunksAround(anchor.cx0,anchor.cz0,Math.min(foot,60),3);
    const seed=((WORLD_SEED^(anchor.cx0*73856093)^(anchor.cz0*19349663))>>>0)||1;
    plan=_planGiantRemains(_wtRng(seed),anchor);
  }catch(e){
    console.error('眠れる石神: 準備中にエラー',e);
    _sleepingStoneGodBusy=false;_ssgSetProgress(false);showBonus('⚠ 眠れる石神の生成に失敗しました');return;
  }
  // フェーズ列（1フェーズ/フレーム）。骨→心核→武器→装飾→報酬の順に段階的に姿を現す
  const phases=[
    ()=>_ssgSpine(plan),
    ()=>_ssgRibCage(plan),
    ()=>{_ssgSkull(plan);},
    ()=>{_ssgArm(plan,-1);},
    ()=>{_ssgArm(plan,1);},
    ()=>{_ssgLeg(plan,-1);_ssgLeg(plan,1);},
    ()=>_ssgHeartCore(plan),
  ];
  if(SLEEPING_STONE_GOD_CFG.generateWeapon)phases.push(()=>_ssgWeapon(plan));
  phases.push(()=>{_ssgDebris(plan);_ssgBlend(plan);});
  phases.push(()=>{_ssgTreasure(plan);_ssgEnemies(plan);});
  let idx=0;_deferDirty=true;
  const step=()=>{
    try{
      phases[idx]();idx++;
      _deferDirty=false;flushDirtyChunks();
      _ssgSetProgress(true,idx/phases.length);
      if(idx<phases.length){_deferDirty=true;requestAnimationFrame(step);}
      else{
        _sleepingStoneGodBusy=false;_ssgSetProgress(false);showBonus('🦴 眠れる石神を生成！');
        playTone(196,.16,.1,'triangle');setTimeout(()=>playTone(262,.16,.1,'triangle'),150);setTimeout(()=>playTone(330,.2,.1,'triangle'),320);
      }
    }catch(e){
      console.error('眠れる石神: 生成中にエラー',e);
      _deferDirty=false;try{flushDirtyChunks();}catch(_){}
      _sleepingStoneGodBusy=false;_ssgSetProgress(false);showBonus('⚠ 眠れる石神の生成に失敗しました');
    }
  };
  requestAnimationFrame(step);
}

// ═══ 🏰 逆さ城 ワンクリック生成 ═══
// クリエイティブ専用: プレイヤー前方の空中に、上へ広がる土台と下へ長く垂れる尖塔群の
// 「浮かぶ逆さ城」を生成する。普通の城の上下反転ではなく、上側ほど広い（せり出した
// 土台・屋根・胸壁）／下側は鋭く細る塔が垂れる、遠景で一目で「逆さ」と分かる
// シルエットを最優先にした構成。城本体（内部: 入口ホール・通路・小部屋・魔力コアの
// 間・玉座の間）＋中央の太い主塔（内部は降りられる縦孔ダンジョン）＋左右の小塔＋
// 階段状の浮遊島の登り導線＋崩れた橋・垂れる鎖・一部だけ落ちる滝で装飾する。
// 賢者の樹庭・世界樹・眠れる石神と同じ共有ヘルパー（put/clr/_frontAnchor/
// _ensureChunksAround/_footprintYBase/surfaceHeightAt）を使い、requestAnimationFrame
// でフェーズ分割して処理落ちを避ける。色は黒・濃灰・紫・青系（DEEP_STONE/灰石/
// 黒曜石/水晶/ダイヤ鉱石/ガラス）で不気味かつ神秘的に。既存ブロックのみ使用。
// ── 数値はここへ集約（本体サイズ・塔の本数/深さ・島の数などを後から調整しやすく）──
const INVERTED_CASTLE_CFG={
  anchorDist:38,            // プレイヤー前方の生成距離（プレイヤー/初期地点と重ならない）
  altitude:30,              // 地表(ybase)から城本体の底までの高さ（地上から輪郭が見える）
  bodyHalfE:12,             // 本体の半幅（入口軸方向）→ 奥行き25
  bodyHalfL:9,              // 本体の半幅（左右方向）→ 幅19
  bodyInnerH:6,             // 内部空間の高さ
  crownPad:3,               // 上段（土台/屋根）のせり出し幅 → 逆さシルエットの要
  crownH:3,                 // 上段の壁の高さ
  mainTowerR:5,             // 中央の太い主塔の根元半径（下向き・内部は縦孔）
  mainTowerDepth:26,        // 主塔の深さ（先端ほど鋭く細る）
  sideTowers:[[1,1],[1,-1],[-1,1],[-1,-1]], // 小塔の位置（本体四隅、[e符号,l符号]）
  sideTowerR:2.6,           // 小塔の根元半径
  sideTowerDepth:{min:13,max:19}, // 小塔の深さ（本ごとにランダム）
  spikeDepth:{min:6,max:10},// 辺中央の細い飾りトゲの深さ
  islands:{min:3,max:6},    // 装飾用の小さな浮遊島の数
  pathIslands:7,            // 地上→城の階段状浮遊島の数
  pathStepY:4,              // 登り導線1段の高さ（ジャンプ＋ブロック設置で登れる）
  chains:{min:3,max:5},     // 垂れ下がる鎖の本数
  chainLen:{min:8,max:15},  // 鎖の長さ
  treasureCount:2,enemyCount:4,
};

// 生成進捗オーバーレイ（世界樹のものを流用。ラベルだけ差し替えて使い終わりに戻す）
function _icSetProgress(show,frac){
  const el=document.getElementById('worldTreeProgress');if(!el)return;
  const lbl=document.getElementById('wtpLabel');
  el.style.display=show?'':'none';
  if(show){if(lbl)lbl.textContent='🏰 逆さ城を生成中…';const fill=document.getElementById('wtpFill');if(fill)fill.style.width=Math.round((frac||0)*100)+'%';}
  else if(lbl)lbl.textContent='🌳 世界樹を生成中…';
}
// 城壁ブロック: 濃紺灰(主体)＋灰石＋黒曜石(紫)＋石のまだらで不気味な質感を出す
function _icWallTi(x,y,z){
  const h=_wtHash((x*73856093)^(y*19349663)^(z*83492791));
  if(h<0.52)return DEEP_STONE;
  if(h<0.82)return 6;
  if(h<0.93)return OBSIDIAN_BLOCK;
  return 1;
}
// ローカル座標(e=入口軸, l=左右)→ワールドx/z。入口軸は4方位に丸めてあるため常に整数
function _icW(plan,e,l){return{x:plan.cx0+plan.ex*e+plan.lx*l,z:plan.cz0+plan.ez*e+plan.lz*l};}
function _icPut(plan,e,y,l,ti,meta){const w=_icW(plan,e,l);put(w.x,y,w.z,ti==null?_icWallTi(w.x,y,w.z):ti,meta);}
function _icClr(plan,e,y,l){const w=_icW(plan,e,l);clr(w.x,y,w.z);}

// 逆さ城の「設計図」を決定的に作る（重い put は後段のフェーズで実行）
function _planInvertedCastle(rng,anchor){
  const cfg=INVERTED_CASTLE_CFG;
  const ri=o=>o.min+Math.floor(rng()*(o.max-o.min+1));
  // 入口はプレイヤー側へ向ける（壁を綺麗に保つため4方位へ丸める）
  let ex,ez;
  if(Math.abs(anchor.fx)>=Math.abs(anchor.fz)){ex=anchor.fx>0?-1:1;ez=0;}else{ex=0;ez=anchor.fz>0?-1:1;}
  const ybase=_footprintYBase(anchor.cx0,anchor.cz0,14,5);
  const baseY=ybase+cfg.altitude;
  const plan={
    cfg,cx0:anchor.cx0,cz0:anchor.cz0,ex,ez,lx:-ez,lz:ex,entA:Math.atan2(ez,ex),
    ybase,baseY,
    ceilY:baseY+cfg.bodyInnerH+1,          // 本体天井＝上段のせり出した底板
    hE:cfg.bodyHalfE,hL:cfg.bodyHalfL,
    chestSpots:[],enemySpots:[],rng,
  };
  plan.crownTop=plan.ceilY+cfg.crownH+1;   // 上段の屋根の高さ
  plan.towerDepths=cfg.sideTowers.map(()=>ri(cfg.sideTowerDepth));
  plan.chamberY=baseY-Math.round(cfg.mainTowerDepth*0.6); // 主塔内・縦孔の底の小部屋
  // 装飾用浮遊島: 入口方向のセクターは登り導線用に空けておく
  plan.decoIslands=[];
  const nIsl=ri(cfg.islands);
  for(let i=0;i<nIsl;i++){
    const a=plan.entA+Math.PI*(0.4+1.2*(i+rng()*0.7)/nIsl);
    plan.decoIslands.push({a,dist:20+rng()*8,y:baseY+Math.round(rng()*12-5),r:2.5+rng()*2,bridge:i<2});
  }
  // 鎖: 上段のせり出しの縁（本体壁より外側＝宙に浮く底板の下面）から垂らす
  plan.chainDefs=[];
  const nCh=ri(cfg.chains);
  for(let i=0;i<nCh;i++){
    const side=rng()<0.5?-1:1;
    plan.chainDefs.push(rng()<0.5
      ?{e:side*(plan.hE+cfg.crownPad-1),l:Math.round((rng()*2-1)*plan.hL),len:ri(cfg.chainLen)}
      :{e:Math.round((rng()*2-1)*plan.hE),l:side*(plan.hL+cfg.crownPad-1),len:ri(cfg.chainLen)});
  }
  plan.waterSide=rng()<0.5?-1:1;           // 滝を流す側（左右どちらか）
  plan.waterE=Math.round((rng()*2-1)*5);   // 滝の位置（入口軸方向のオフセット）
  plan.pathTurn=rng()<0.5?-1:1;            // 登り導線が城を旋回する向き
  return plan;
}

// ── 城本体（下段）: 底板・外壁・窓・入口ドア。内部は空洞（後段の _icInterior が間仕切る）──
function _icBodyShell(plan){
  const{hE,hL,baseY}=plan,innerH=plan.cfg.bodyInnerH;
  for(let e=-hE;e<=hE;e++)for(let l=-hL;l<=hL;l++){
    if(e*e+l*l<=2)continue;                // 中央の穴（魔力コアの間→主塔の縦孔へ降りる）
    _icPut(plan,e,baseY,l,null);           // 底板
  }
  for(let e=-hE;e<=hE;e++)for(let l=-hL;l<=hL;l++){
    if(Math.abs(e)!==hE&&Math.abs(l)!==hL)continue;
    for(let y=baseY+1;y<=baseY+innerH;y++)_icPut(plan,e,y,l,null); // 外壁
  }
  // 窓: 外壁の中段へ3マスおきにガラス／たまに水晶（夜は紫に光る魔力の窓に見える）
  for(let e=-hE;e<=hE;e++)for(let l=-hL;l<=hL;l++){
    if(Math.abs(e)!==hE&&Math.abs(l)!==hL)continue;
    if(((e+l+40)%3)!==1)continue;
    if(e===hE&&Math.abs(l)<=2)continue;    // 入口ドアの近くは開けない
    const h=_wtHash((e*31)^(l*17));
    if(h>0.75)continue;
    for(let y=baseY+3;y<=baseY+4;y++)_icPut(plan,e,y,l,h<0.2?CRYSTAL_BLOCK:GLASS_BLOCK);
  }
  // 入口ドア: プレイヤー側の壁を3幅×4高で開け、黒曜石の枠で縁取る
  for(let l=-1;l<=1;l++)for(let y=baseY+1;y<=baseY+4;y++)_icClr(plan,hE,y,l);
  for(let l=-2;l<=2;l+=4)for(let y=baseY+1;y<=baseY+5;y++)_icPut(plan,hE,y,l,OBSIDIAN_BLOCK);
  for(let l=-1;l<=1;l++)_icPut(plan,hE,baseY+5,l,OBSIDIAN_BLOCK);
}

// ── 上段（広い土台・屋根・胸壁・四隅の小櫓）: 上ほど広い「逆さ」シルエットの要 ──
function _icCrown(plan){
  const{hE,hL,ceilY,crownTop}=plan,pad=plan.cfg.crownPad;
  const HE=hE+pad,HL=hL+pad;
  for(let e=-HE;e<=HE;e++)for(let l=-HL;l<=HL;l++){
    _icPut(plan,e,ceilY,l,null);           // せり出した底板（下から見上げると巨大な天蓋）
    _icPut(plan,e,crownTop,l,null);        // 屋根
  }
  for(let e=-HE;e<=HE;e++)for(let l=-HL;l<=HL;l++){
    if(Math.abs(e)!==HE&&Math.abs(l)!==HL)continue;
    for(let y=ceilY+1;y<crownTop;y++)_icPut(plan,e,y,l,null); // 上段の壁
    if(((e+l+40)&1)===0)_icPut(plan,e,crownTop+1,l,null);     // 胸壁（1マスおきの凸凹）
    if(((e+l+80)%4)===0)_icPut(plan,e,ceilY,l,CRYSTAL_BLOCK); // 縁の魔力ライン（下から光って見える）
  }
  // 四隅の小櫓（3×3・高さ4）＋頂部の水晶
  for(const[se,sl]of[[1,1],[1,-1],[-1,1],[-1,-1]]){
    const ce=se*(HE-1),cl=sl*(HL-1);
    for(let de=-1;de<=1;de++)for(let dl=-1;dl<=1;dl++){
      if(de||dl)for(let y=crownTop+1;y<=crownTop+4;y++)_icPut(plan,ce+de,y,cl+dl,null);
      _icPut(plan,ce+de,crownTop+5,cl+dl,null);
    }
    _icPut(plan,ce,crownTop+6,cl,CRYSTAL_BLOCK);
  }
}

// ── 中央の主塔（下向き）: 外殻は鋭く細る円錐、内部は降りられる縦孔ダンジョン。
// 途中に膨らんだ小部屋（宝箱と敵）、先端は水晶の穂先が光る ──
function _icMainTower(plan){
  const{cx0,cz0,baseY,chamberY}=plan,cfg=plan.cfg,D=cfg.mainTowerDepth;
  for(let t=1;t<=D;t++){
    const y=baseY-t;
    const taper=cfg.mainTowerR*Math.pow(1-t/D,0.8);
    const bulge=2.4*Math.max(0,1-Math.abs(y-chamberY)/4);   // 縦孔の底の小部屋の膨らみ
    const rr=Math.max(0.8,taper+bulge);
    const rIn=rr>=2.6?rr-1.4:-1;                            // 太い区間だけ中空＝縦孔
    const R=Math.ceil(rr);
    for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
      const d2=dx*dx+dz*dz;
      if(d2>rr*rr)continue;
      if(rIn>0&&d2<rIn*rIn)continue;
      put(cx0+dx,y,cz0+dz,t>D-3?CRYSTAL_BLOCK:_icWallTi(cx0+dx,y,cz0+dz));
    }
    // 縦孔の足場: 2段ごとに螺旋状の小さな出っ張り（飛び降り/積み登りで上下移動）
    if(rIn>0.9&&(t&1)===0){
      const a=t*1.05,lr=rIn-0.5;
      put(cx0+Math.round(Math.cos(a)*lr),y,cz0+Math.round(Math.sin(a)*lr),SLAB_BLOCK,0);
    }
  }
  // 縦孔の底の小部屋: 床＋宝箱＋敵（降り切った先の報酬）
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(dx*dx+dz*dz<=5)put(cx0+dx,chamberY-2,cz0+dz,DEEP_STONE);
  plan.chestSpots.push({x:cx0,y:chamberY-1,z:cz0});
  plan.enemySpots.push({x:cx0+1,y:chamberY-1,z:cz0-1});
}

// ── 左右の小塔（四隅・中実）＋辺中央の細い飾りトゲ: どれも下向きに細り先端は水晶 ──
function _icSideTowers(plan){
  const{hE,hL,baseY}=plan,cfg=plan.cfg;
  cfg.sideTowers.forEach((s,i)=>{
    const w=_icW(plan,s[0]*(hE-2),s[1]*(hL-2)),D=plan.towerDepths[i];
    for(let t=1;t<=D;t++){
      const y=baseY-t,rr=Math.max(0.7,cfg.sideTowerR*(1-t/D));
      const R=Math.ceil(rr);
      for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
        if(dx*dx+dz*dz>rr*rr)continue;
        put(w.x+dx,y,w.z+dz,t>D-2?CRYSTAL_BLOCK:_icWallTi(w.x+dx,y,w.z+dz));
      }
    }
  });
  for(const[e,l]of[[plan.hE-1,0],[-plan.hE+1,0],[0,plan.hL-1],[0,-plan.hL+1]]){
    const w=_icW(plan,e,l),D=cfg.spikeDepth.min+Math.floor(plan.rng()*(cfg.spikeDepth.max-cfg.spikeDepth.min+1));
    for(let t=1;t<=D;t++)put(w.x,baseY-t,w.z,t===D?CRYSTAL_BLOCK:_icWallTi(w.x,baseY-t,w.z));
  }
}

// ── 内部: 入口ホール→細い通路→小部屋×4→魔力コアの間→玉座の間。外観優先で作りは最小限 ──
function _icInterior(plan){
  const{hL,baseY}=plan,innerH=plan.cfg.bodyInnerH,f=baseY+1;
  // e一定の間仕切り壁（中央3幅×3高のドアを開ける）
  const crossWall=(e)=>{
    for(let l=-hL+1;l<=hL-1;l++)for(let y=f;y<f+innerH;y++){
      if(Math.abs(l)<=1&&y<f+3)continue;
      _icPut(plan,e,y,l,null);
    }
  };
  crossWall(6);   // 入口ホール(e7..11)と通路の境
  crossWall(2);   // 通路と魔力コアの間の境
  crossWall(-4);  // 魔力コアの間と玉座の間の境
  // 細い通路(e3..5,幅3)の側壁と、左右の小部屋への1マスドア（e=4）
  for(let e=3;e<=5;e++)for(const l of[-2,2])for(let y=f;y<f+innerH;y++){
    if(e===4&&y<f+3)continue;
    _icPut(plan,e,y,l,null);
  }
  // 魔力コアの間の側壁（l=±5）と両脇のギャラリー小部屋（e=-1に1マスドア）
  for(let e=-3;e<=1;e++)for(const l of[-5,5])for(let y=f;y<f+innerH;y++){
    if(e===-1&&y<f+3)continue;
    _icPut(plan,e,y,l,null);
  }
  // 入口ホール: 左右に黒曜石の柱＋松明（入ってすぐの空間を飾る）
  for(const l of[-4,4])for(const e of[8,10]){
    for(let y=f;y<f+innerH;y++)_icPut(plan,e,y,l,OBSIDIAN_BLOCK);
    _icPut(plan,e-1,f,l,TORCH_BLOCK);
  }
  // 魔力コア: 床の穴（主塔の縦孔へ続く）の縁にダイヤ鉱石、宙に浮く水晶のコア
  for(let e=-2;e<=2;e++)for(let l=-2;l<=2;l++){
    const d2=e*e+l*l;
    if(d2>2&&d2<=6)_icPut(plan,e,baseY,l,DIAMOND_ORE);
  }
  const core=_icW(plan,0,0);
  for(const[dx,dy,dz]of[[0,0,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0]])
    put(core.x+dx,f+3+dy,core.z+dz,CRYSTAL_BLOCK);
  for(const[e,l]of[[-2,3],[-2,-3],[0,3],[0,-3]])                 // コアを囲む黒曜石の柱
    for(let y=f;y<f+innerH;y++)_icPut(plan,e,y,l,OBSIDIAN_BLOCK);
  // 玉座の間: 壇＋階段＋黒曜石の玉座＋頭上の水晶＋側柱
  const sm=plan.ex===1?2:plan.ex===-1?0:plan.ez===1?3:1;         // 階段は入口方向を向く
  for(let e=-11;e<=-9;e++)for(let l=-3;l<=3;l++)_icPut(plan,e,f,l,DEEP_STONE);
  for(let l=-3;l<=3;l++)_icPut(plan,-8,f,l,STAIR_BLOCK,sm);
  for(let y=f+1;y<=f+3;y++)_icPut(plan,-11,y,0,OBSIDIAN_BLOCK);  // 背もたれ
  _icPut(plan,-10,f+1,0,OBSIDIAN_BLOCK);                         // 座面
  _icPut(plan,-10,f+1,-1,SLAB_BLOCK,0);_icPut(plan,-10,f+1,1,SLAB_BLOCK,0); // 肘掛け
  _icPut(plan,-11,f+4,0,CRYSTAL_BLOCK);                          // 玉座の頭上の水晶
  for(const l of[-3,3]){for(let y=f+1;y<=f+3;y++)_icPut(plan,-10,y,l,DEEP_STONE);_icPut(plan,-10,f+4,l,CRYSTAL_BLOCK);}
  // 宝箱・敵の配置候補（玉座の間の壇上／入口ホール／小部屋／ギャラリー）
  const cs=_icW(plan,-9,2);plan.chestSpots.push({x:cs.x,y:f+1,z:cs.z});
  const eb=_icW(plan,-7,0);plan.enemySpots.push({x:eb.x,y:f,z:eb.z,boss:true});
  const eh=_icW(plan,9,0);plan.enemySpots.push({x:eh.x,y:f,z:eh.z});
  const er=_icW(plan,4,-6);plan.enemySpots.push({x:er.x,y:f,z:er.z});
  const eg=_icW(plan,-1,7);plan.enemySpots.push({x:eg.x,y:f,z:eg.z});
}

// ── 浮遊島1個: 上面が平らな小島（ノイズでギザギザの縁＋下向きの岩錐）。marker=水晶の道標 ──
function _icIsland(plan,wx,wy,wz,r,marker){
  const R=Math.ceil(r)+1;
  for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
    const edge=r+noise(dx*.3+wx*.1,dz*.3+wz*.1)*1.2;
    const d=Math.hypot(dx,dz);
    if(d>edge)continue;
    put(wx+dx,wy,wz+dz,_wtHash((wx+dx)*31^(wz+dz)*17)<0.25?OBSIDIAN_BLOCK:6); // 上面（灰石＋黒曜石）
    const depth=Math.max(1,Math.round((1-d/Math.max(edge,0.1))*(r+1)));       // 下の逆錐
    for(let t=1;t<=depth;t++)put(wx+dx,wy-t,wz+dz,_icWallTi(wx+dx,wy-t,wz+dz));
  }
  if(marker)put(wx,wy+1,wz,CRYSTAL_BLOCK);
}
// 装飾用の浮遊島（3〜6個）
function _icDecoIslands(plan){
  for(const d of plan.decoIslands){
    d.wx=plan.cx0+Math.round(Math.cos(d.a)*d.dist);
    d.wz=plan.cz0+Math.round(Math.sin(d.a)*d.dist);
    _icIsland(plan,d.wx,d.y,d.wz,d.r,plan.rng()<0.6);
  }
}
// 地上→城の登り導線: 城を旋回しながら階段状に高くなる浮遊島の列。最下段は地表すぐ上、
// 最上段は入口橋のすぐ下（1段4ブロック＝ジャンプ＋ブロック設置で登れる間隔）
function _icPathIslands(plan){
  const cfg=plan.cfg,N=cfg.pathIslands;
  for(let i=0;i<N;i++){
    const a=plan.entA+plan.pathTurn*0.3*(i+1);
    const dist=plan.hE+8+i*1.4;
    const wx=plan.cx0+Math.round(Math.cos(a)*dist),wz=plan.cz0+Math.round(Math.sin(a)*dist);
    let top=plan.baseY-3-i*cfg.pathStepY;
    top=Math.max(top,surfaceHeightAt(wx,wz)+2);   // 丘の上でも島が地面に埋まらないように
    _icIsland(plan,wx,top,wz,2.6+((i*7)%3)*0.5,true);
  }
}

// ── 崩れた橋: 2幅の石橋をハッシュで欠けさせる（gapRate=欠けの割合）──
function _icBridgeLine(x0,y0,z0,x1,y1,z1,gapRate){
  const len=Math.hypot(x1-x0,z1-z0)||1,n=Math.max(1,Math.round(len));
  const px=-(z1-z0)/len,pz=(x1-x0)/len;           // 幅方向の単位ベクトル
  for(let i=0;i<=n;i++){
    const t=i/n,bx=x0+(x1-x0)*t,by=y0+(y1-y0)*t,bz=z0+(z1-z0)*t;
    for(let w=0;w<2;w++){
      const wx=Math.round(bx+px*(w-0.5)),wz=Math.round(bz+pz*(w-0.5)),wy=Math.round(by);
      if(_wtHash((wx*13)^(wy*7)^(wz*29)^(i*57))<gapRate)continue;
      put(wx,wy,wz,_wtHash(wx*11^wz*3)<0.3?6:DEEP_STONE);
    }
  }
}
function _icBridges(plan){
  // 入口橋: ドアから登り導線の最初の島の方向へ（欠けは少なめ＝渡れる）
  const d0=_icW(plan,plan.hE+1,0),d1=_icW(plan,plan.hE+7,0);
  _icBridgeLine(d0.x,plan.baseY,d0.z,d1.x,plan.baseY,d1.z,0.12);
  // 城→装飾島の崩れた橋（大きく欠けた廃橋）
  for(const d of plan.decoIslands){
    if(!d.bridge||d.wx==null)continue;
    const le=(d.wx-plan.cx0)*plan.ex+(d.wz-plan.cz0)*plan.ez;
    const ll=(d.wx-plan.cx0)*plan.lx+(d.wz-plan.cz0)*plan.lz;
    const w=_icW(plan,Math.max(-plan.hE,Math.min(plan.hE,le)),Math.max(-plan.hL,Math.min(plan.hL,ll)));
    const wy=Math.max(plan.baseY+2,Math.min(plan.ceilY-1,d.y));
    _icBridgeLine(d.wx,d.y,d.wz,w.x,wy,w.z,0.35);
  }
}
// ── 鎖: 上段のせり出しの下面から黒曜石/灰石を交互に垂らす ──
function _icChains(plan){
  for(const c of plan.chainDefs){
    const w=_icW(plan,c.e,c.l);
    for(let d=1;d<=c.len;d++)put(w.x,plan.ceilY-d,w.z,(d&1)?OBSIDIAN_BLOCK:6);
  }
}
// ── 滝: 屋根の水源から縁を越え、一部だけ空中へ流れ落ちて途切れる ──
function _icWaterfall(plan){
  const pad=plan.cfg.crownPad,e=plan.waterE,side=plan.waterSide;
  for(let de=0;de<=1;de++)_icPut(plan,e+de,plan.crownTop+1,side*(plan.hL+pad-1),WATER_BLOCK); // 屋根の水源
  const w=_icW(plan,e,side*(plan.hL+pad+1));
  for(let y=plan.crownTop;y>=plan.baseY-6;y--)put(w.x,y,w.z,WATER_BLOCK); // 壁の外を落ちる水柱
}

// ── 宝箱（既存の underTreasures 宝箱システムを流用、type3=豪華報酬）と敵の配置 ──
function _icPlaceChest(wx,wy,wz){
  const tk=vKey(wx,wy,wz);if(underTreasures[tk])return;
  put(wx,wy-1,wz,DEEP_STONE);clr(wx,wy,wz);clr(wx,wy+1,wz);
  const mesh=_makeTreasureMesh(3);mesh.position.set(wx+.5,wy,wz+.5);
  if(!openedTreasureKeys.has(tk))scene.add(mesh);
  underTreasures[tk]={mesh,opened:openedTreasureKeys.has(tk),type:3,struct:'invertedCastle'};
}
function _icRewards(plan){
  let placed=0;
  for(const s of plan.chestSpots){if(placed>=plan.cfg.treasureCount)break;_icPlaceChest(s.x,s.y,s.z);placed++;}
  let en=0;
  for(const s of plan.enemySpots){
    if(en>=plan.cfg.enemyCount)break;
    const idx=s.boss?(typeof ENEMY_TYPES!=='undefined'&&ENEMY_TYPES.length>8?8:2):[0,1,5][en%3];
    _ssgSpawnEnemyAt(s.x,s.y,s.z,idx);en++;
  }
}

let _invertedCastleBusy=false; // 生成中フラグ（ボタン連打による多重生成を防ぐ）
function generateInvertedCastle(){
  if(_invertedCastleBusy){showBonus('🏰 逆さ城を生成中…');return;}
  if(!window.confirm('空中に浮かぶ巨大な「逆さ城」を生成します。生成しますか？'))return;
  _invertedCastleBusy=true;_icSetProgress(true,0);
  let plan;
  try{
    const anchor=_frontAnchor(INVERTED_CASTLE_CFG.anchorDist);
    _ensureChunksAround(anchor.cx0,anchor.cz0,34,3); // 本体＋浮遊島＋登り導線が収まる範囲
    const seed=((WORLD_SEED^(anchor.cx0*73856093)^(anchor.cz0*19349663)^0x9e3779)>>>0)||1;
    plan=_planInvertedCastle(_wtRng(seed),anchor);
  }catch(e){
    console.error('逆さ城: 準備中にエラー',e);
    _invertedCastleBusy=false;_icSetProgress(false);showBonus('⚠ 逆さ城の生成に失敗しました');return;
  }
  // フェーズ列（1フェーズ/フレーム）。本体→上段→塔→内部→島→橋・鎖・滝→報酬の順
  const phases=[
    ()=>_icBodyShell(plan),
    ()=>_icCrown(plan),
    ()=>_icMainTower(plan),
    ()=>_icSideTowers(plan),
    ()=>_icInterior(plan),
    ()=>_icDecoIslands(plan),
    ()=>_icPathIslands(plan),
    ()=>{_icBridges(plan);_icChains(plan);_icWaterfall(plan);},
    ()=>_icRewards(plan),
  ];
  let idx=0;_deferDirty=true;
  const step=()=>{
    try{
      phases[idx]();idx++;
      _deferDirty=false;flushDirtyChunks();
      _icSetProgress(true,idx/phases.length);
      if(idx<phases.length){_deferDirty=true;requestAnimationFrame(step);}
      else{
        _invertedCastleBusy=false;_icSetProgress(false);showBonus('🏰 逆さ城を生成！');
        playTone(220,.14,.1,'triangle');setTimeout(()=>playTone(330,.14,.1,'triangle'),140);setTimeout(()=>playTone(440,.18,.1,'triangle'),300);
      }
    }catch(e){
      console.error('逆さ城: 生成中にエラー',e);
      _deferDirty=false;try{flushDirtyChunks();}catch(_){}
      _invertedCastleBusy=false;_icSetProgress(false);showBonus('⚠ 逆さ城の生成に失敗しました');
    }
  };
  requestAnimationFrame(step);
}

// ═══ ⏳ 時間が止まった村 ワンクリック生成 ═══
// クリエイティブ専用: プレイヤー前方の「比較的平坦な地上」に、襲撃のまっただ中で
// 時間が停止した小さな村を生成する。遠くからは普通の村に見えるが、近づくと
// 「空中で静止した矢」「倒れかけの木」「崩れる途中の屋根」「浮遊する瓦礫」
// 「流れ出す途中で凍りついた水（氷ブロック）」「燃え広がる途中の炎」
// 「逃走・攻撃・転倒の途中で止まった敵」が見える。中央の巨大な時間結晶
// （青/水色/白/紫の発光ブロック＋グロースプライト）を規定回数壊すと、
// releaseFrozenVillage() が短い間隔で段階的に時間を再生し、村は襲撃が
// 再開された危険な場所に変化する。
// 停止は「この村に属するオブジェクト（敵は e.frozen フラグ、水は氷、矢は
// 静止メッシュ）」だけを対象にし、ワールド全体の時間には一切影響しない。
// 賢者の樹庭・眠れる石神・逆さ城と同じ共有ヘルパー（put/clr/_frontAnchor/
// _ensureChunksAround/_footprintYBase/surfaceHeightAt/_wtRng/_wtHash）を使い、
// requestAnimationFrame でフェーズ分割して処理落ちを避ける。
//
// 既知の制約（他の特殊生成と同じ）: ブロックは worldEdits で永続化されるが、
// 停止中の敵・矢・炎・宝箱メッシュ・結晶の耐久はセッション内限り。セーブ＆
// ロード後は結晶が「ただの結晶ブロックの塔」として残る。
// ── 調整用パラメータ（村の大きさ・家の数・矢/敵/瓦礫の量・結晶耐久・演出速度）──
const FROZEN_VILLAGE_CFG={
  anchorDist:42,          // プレイヤー前方の生成距離（初期地点・プレイヤーから離す）
  villageR:17,            // 村の半径（整地・配置範囲）
  houseCount:{min:4,max:7}, // 家の軒数
  arrowCount:9,           // 空中で静止する矢の本数
  flameCount:5,           // 燃え広がる途中で止まった炎の数
  debrisCount:12,         // 浮遊瓦礫の最大数（うち一部が解除時に落下）
  enemyInner:4,           // 村内の停止中の敵
  enemyOuter:3,           // 村の外周の停止中の敵
  crystalHp:4,            // 時間結晶の耐久（結晶ブロックを壊す回数）
  treasureCount:5,        // 宝箱の数
  replayStepMs:450,       // 解除演出の1段階の間隔（ms）: 小さいほど速く再生
};
// スマホは静止オブジェクトを少し減らして負荷を抑える
function _ftvN(n){return isTouch?Math.max(2,Math.round(n*0.7)):n;}

// 村の実行時状態（セッション内のみ）。null=村なし
let frozenVillage=null;

// 生成進捗オーバーレイ（世界樹のものを流用。ラベルだけ差し替えて使い終わりに戻す）
function _ftvSetProgress(show,frac){
  const el=document.getElementById('worldTreeProgress');if(!el)return;
  const lbl=document.getElementById('wtpLabel');
  el.style.display=show?'':'none';
  if(show){if(lbl)lbl.textContent='⏳ 時間が止まった村を生成中…';const fill=document.getElementById('wtpFill');if(fill)fill.style.width=Math.round((frac||0)*100)+'%';}
  else if(lbl)lbl.textContent='🌳 世界樹を生成中…';
}

// ── カメラ揺れ（結晶破壊演出用）: main.js の tick がカメラ位置決定後に呼ぶ ──
let _ftvShakeT=0,_ftvShakeDur=0,_ftvShakeAmp=0;
function ftvShake(amp,dur){_ftvShakeAmp=Math.max(_ftvShakeAmp,amp);_ftvShakeT=Math.max(_ftvShakeT,dur);_ftvShakeDur=Math.max(_ftvShakeDur,dur);}
function ftvApplyCamShake(dt){
  if(_ftvShakeT<=0)return;
  _ftvShakeT-=dt;
  if(_ftvShakeT<=0){_ftvShakeT=0;_ftvShakeDur=0;_ftvShakeAmp=0;return;}
  const f=_ftvShakeAmp*(_ftvShakeT/(_ftvShakeDur||1));
  camera.position.x+=(Math.random()-.5)*f;
  camera.position.y+=(Math.random()-.5)*f*.6;
  camera.position.z+=(Math.random()-.5)*f;
}

// ── 静止オブジェクト用の共有ジオメトリ/マテリアル（disposeは複製マテリアルのみ）──
const _ftvArrowGeo=new THREE.BoxGeometry(.12,.12,.55);
const _ftvArrowMat=new THREE.MeshBasicMaterial({color:0xddaa44});
const _ftvFireArrowMat=new THREE.MeshBasicMaterial({color:0xff5533});
const _ftvFlameGeoA=new THREE.BoxGeometry(.55,.6,.55);
const _ftvFlameGeoB=new THREE.BoxGeometry(.3,.5,.3);
const _ftvFlameMatA=new THREE.MeshBasicMaterial({color:0xff7722,transparent:true,opacity:.92});
const _ftvFlameMatB=new THREE.MeshBasicMaterial({color:0xffdd55,transparent:true,opacity:.95});
// 結晶の頭上に置くグロースプライト: 村のどこからでも青白い光として目立つ
function _ftvGlowSprite(){
  const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
  const g=x.createRadialGradient(32,32,2,32,32,30);
  g.addColorStop(0,'rgba(210,255,255,.95)');g.addColorStop(.4,'rgba(120,220,255,.5)');g.addColorStop(1,'rgba(150,120,255,0)');
  x.fillStyle=g;x.fillRect(0,0,64,64);
  const t=new THREE.CanvasTexture(c);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
  sp.scale.set(7,7,1);
  return sp;
}

// ── 平坦地探索: アンカー周辺の候補地から「高低差が最小・湖(h=0)なし・既存の地上
// 構造物と重ならない・プレイヤーから十分離れている」場所を選ぶ ──
function _ftvNearStruct(cx,cz,r){
  if(typeof structAt!=='function'||typeof STRUCT_GRID==='undefined')return false;
  for(let gx=Math.floor((cx-r)/STRUCT_GRID);gx<=Math.floor((cx+r)/STRUCT_GRID);gx++)
    for(let gz=Math.floor((cz-r)/STRUCT_GRID);gz<=Math.floor((cz+r)/STRUCT_GRID);gz++){
      const s=structAt(gx,gz);
      if(s&&Math.hypot(s.wx-cx,s.wz-cz)<r)return true;
    }
  return false;
}
function _ftvFindSite(anchor){
  const R=FROZEN_VILLAGE_CFG.villageR;
  const cands=[[0,0]];
  for(let ring=1;ring<=2;ring++)for(let a=0;a<8;a++){
    const ang=a*Math.PI/4;
    cands.push([Math.round(Math.cos(ang)*ring*12),Math.round(Math.sin(ang)*ring*12)]);
  }
  let best=null,bestScore=Infinity;
  for(const[ox,oz]of cands){
    const cx=anchor.cx0+ox,cz=anchor.cz0+oz;
    if(Math.hypot(cx-P.x,cz-P.z)<R+8)continue;        // プレイヤーを巻き込まない
    if(_ftvNearStruct(cx,cz,R+8))continue;             // 既存の地上構造物を避ける
    let hmin=Infinity,hmax=-Infinity,ok=true;
    for(let dx=-R;dx<=R&&ok;dx+=4)for(let dz=-R;dz<=R;dz+=4){
      if(dx*dx+dz*dz>R*R)continue;
      const h=getHeight(cx+dx,cz+dz);
      if(h<1){ok=false;break;}                         // 湖・水際を避ける
      if(h<hmin)hmin=h;if(h>hmax)hmax=h;
    }
    if(!ok)continue;
    const score=(hmax-hmin)+Math.hypot(ox,oz)*0.05;    // 平坦さ優先、僅差なら近い方
    if(score<bestScore){bestScore=score;best={cx,cz};}
  }
  return best;
}

// ── 設計図: 家・井戸・畑・見張り台を重ならない角度スロットに割り当てる ──
function _planFrozenVillage(rng,site){
  const cfg=FROZEN_VILLAGE_CFG;
  const ybase=_footprintYBase(site.cx,site.cz,cfg.villageR,4);
  const nH=cfg.houseCount.min+Math.floor(rng()*(cfg.houseCount.max-cfg.houseCount.min+1));
  const plan={
    cfg,cx0:site.cx,cz0:site.cz,R:cfg.villageR,ybase,rng,
    houses:[],chestSpots:[],flameSpots:[],
    coreKeys:new Set(),shardKeys:[],iceKeys:[],fallDebris:[],
    arrows:[],flames:[],frozenEnemies:[],blastSpot:null,tower:null,sprite:null,
  };
  const total=nH+3;                      // 家＋井戸/畑/見張り台
  const a0=rng()*Math.PI*2;
  const slots=[];
  for(let i=0;i<total;i++)slots.push(a0+i*(Math.PI*2/total)+(rng()-.5)*.2);
  const farmIdx=1+Math.floor(nH/2);
  plan.wellAng=slots[0];plan.farmAng=slots[farmIdx];plan.towerAng=slots[total-1];
  const styles=['blast','burning','collapse'];  // 最初の3軒は必ず「事件の途中」
  let hi=0;
  for(let i=0;i<total;i++){
    if(i===0||i===farmIdx||i===total-1)continue;
    const ang=slots[i],r=10+rng()*2.5;
    plan.houses.push({
      x:plan.cx0+Math.round(Math.cos(ang)*r),
      z:plan.cz0+Math.round(Math.sin(ang)*r),
      style:hi<styles.length?styles[hi]:(hi%2?'intact':'collapse'),
    });
    hi++;
  }
  return plan;
}

// ── 整地（half=-1: 西半分 / +1: 東半分。重い処理なので2フェーズに分割）──
function _ftvTerraform(plan,half){
  const R=plan.R,y0=plan.ybase;
  for(let dx=-R;dx<=R;dx++){
    if(half<0?dx>=0:dx<0)continue;
    for(let dz=-R;dz<=R;dz++){
      const d2=dx*dx+dz*dz;if(d2>R*R)continue;
      const x=plan.cx0+dx,z=plan.cz0+dz;
      const sh=surfaceHeightAt(x,z);
      if(sh<y0&&d2>(R-1.5)*(R-1.5)&&plan.rng()<0.35)continue; // 縁は自然にギザギザ
      for(let y=sh+1;y<y0;y++)put(x,y,z,1);
      for(let y=y0+1;y<=y0+12;y++)clr(x,y,z);   // 既存の木・丘・岩を一掃
      put(x,y0,z,0);
    }
  }
}

// ── 中央広場＋時間結晶。結晶スパイアの全ブロックが coreKeys（どこを壊しても耐久減）──
function _ftvPlazaCrystal(plan){
  const y0=plan.ybase,cx=plan.cx0,cz=plan.cz0,rng=plan.rng;
  // 石畳の広場
  for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=5;dz++){
    if(dx*dx+dz*dz>26)continue;
    put(cx+dx,y0,cz+dz,_wtHash((cx+dx)*13^(cz+dz)*7)<0.3?6:1);
  }
  // 台座（黒曜石＋深石）
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)put(cx+dx,y0+1,cz+dz,(dx||dz)?OBSIDIAN_BLOCK:DEEP_STONE);
  // 結晶スパイア: 中間が膨らむ塔。青(ダイヤ鉱石)/水色(氷)/白(ガラス)/紫(水晶)のまだら
  const spireR=[1.6,1.6,2.1,2.1,1.4,0.9,0.4];
  for(let t=1;t<=spireR.length;t++){
    const y=y0+1+t,rr=spireR[t-1],Rr=Math.ceil(rr);
    for(let dx=-Rr;dx<=Rr;dx++)for(let dz=-Rr;dz<=Rr;dz++){
      if(dx*dx+dz*dz>rr*rr)continue;
      const h=_wtHash(((cx+dx)*73)^(y*179)^((cz+dz)*283));
      put(cx+dx,y,cz+dz,h<0.45?CRYSTAL_BLOCK:h<0.68?ICE_BLOCK:h<0.85?GLASS_BLOCK:DIAMOND_ORE);
      plan.coreKeys.add(vKey(cx+dx,y,cz+dz));
    }
  }
  put(cx,y0+spireR.length+2,cz,CRYSTAL_BLOCK);           // 穂先
  plan.coreKeys.add(vKey(cx,y0+spireR.length+2,cz));
  // 浮遊する結晶片＋固まった空間のブロック（空中静止）
  const nSh=_ftvN(9);
  for(let i=0;i<nSh;i++){
    const a=rng()*Math.PI*2,d=3+rng()*3.5,y=y0+2+Math.floor(rng()*7);
    const x=cx+Math.round(Math.cos(a)*d),z=cz+Math.round(Math.sin(a)*d);
    if(voxels[vKey(x,y,z)])continue;
    put(x,y,z,[CRYSTAL_BLOCK,ICE_BLOCK,GLASS_BLOCK,1][Math.floor(rng()*4)]);
    plan.shardKeys.push(vKey(x,y,z));
  }
  // グロースプライト（遠景でも結晶の位置がわかる青白い光）
  plan.sprite=_ftvGlowSprite();
  plan.sprite.position.set(cx+.5,y0+7,cz+.5);
  scene.add(plan.sprite);
  // 結晶のそばの特別な報酬（最優先）
  plan.chestSpots.unshift({x:cx+3,y:y0+1,z:cz-3});
}

// ── 家1軒。style: intact(ほぼ無傷)/collapse(崩れる途中)/burning(炎上中)/blast(爆発直前) ──
function _ftvHouse(plan,hd){
  const y0=plan.ybase,hx=hd.x,hz=hd.z,rng=plan.rng;
  // ドアは村の中心を向く（軸に丸める）
  const dxc=plan.cx0-hx,dzc=plan.cz0-hz;
  let dx=0,dz=0;
  if(Math.abs(dxc)>=Math.abs(dzc))dx=dxc>0?1:-1;else dz=dzc>0?1:-1;
  const wallTi=(x,y,z)=>{const h=_wtHash((x*53)^(y*97)^(z*193));return h<0.6?4:h<0.85?WOOL_BLOCK:1;};
  const dmg=hd.style==='intact'?0.03:hd.style==='collapse'?0.3:hd.style==='burning'?0.14:0.2;
  // 床
  for(let ax=-2;ax<=2;ax++)for(let az=-2;az<=2;az++)put(hx+ax,y0,hz+az,1);
  // 壁（高さ3）: 角は木の柱、中段に窓、ドア開口。dmgで「崩れ落ちる途中の壁」
  for(let ax=-2;ax<=2;ax++)for(let az=-2;az<=2;az++){
    if(Math.abs(ax)!==2&&Math.abs(az)!==2)continue;
    const corner=Math.abs(ax)===2&&Math.abs(az)===2;
    for(let y=1;y<=3;y++){
      if(!corner&&y<=2&&((dx!==0&&ax===dx*2&&az===0)||(dz!==0&&az===dz*2&&ax===0)))continue; // ドア
      if(!corner&&_wtHash(((hx+ax)*31)^((y0+y)*17)^((hz+az)*71))<dmg)continue;               // 欠け
      const win=!corner&&y===2&&((ax===0&&Math.abs(az)===2)||(az===0&&Math.abs(ax)===2));
      put(hx+ax,y0+y,hz+az,corner?3:win?GLASS_BLOCK:wallTi(hx+ax,y0+y,hz+az));
    }
  }
  // 屋根: 4段目に張り出した板＋5段目中央。collapse/blast は半分が「崩れ落ちる途中」
  // ＝欠けた部分の一部が空中に浮いたまま静止し、解除時に落下する
  const roofHole=hd.style==='collapse'||hd.style==='blast';
  for(let ax=-3;ax<=3;ax++)for(let az=-3;az<=3;az++){
    const wx=hx+ax,wz=hz+az;
    if(roofHole&&(ax-az>0)&&_wtHash((wx*7)^(wz*13))<0.55){
      if(plan.fallDebris.length<_ftvN(plan.cfg.debrisCount)&&_wtHash((wx*3)^(wz*29))<0.45){
        const fy=y0+6+Math.floor(rng()*2),fx=wx+Math.round((rng()-.5)*2),fz=wz+Math.round((rng()-.5)*2);
        if(!voxels[vKey(fx,fy,fz)]){put(fx,fy,fz,3);plan.fallDebris.push({x:fx,y:fy,z:fz,ti:3});}
      }
      continue;
    }
    put(wx,y0+4,wz,3);
  }
  for(let ax=-1;ax<=1;ax++)for(let az=-1;az<=1;az++){
    if(roofHole&&(ax-az>0))continue;
    put(hx+ax,y0+5,hz+az,SLAB_BLOCK,0);
  }
  if(hd.style==='blast'){
    // 爆発直前の家: ドアと反対側の壁に穴、外へ吹き飛ぶ途中の破片が空中静止、地面に焦げ跡
    const bx=hx-dx*2,bz=hz-dz*2;
    clr(bx,y0+1,bz);clr(bx,y0+2,bz);clr(bx-dz,y0+1,bz-dx);clr(bx-dz,y0+2,bz-dx);
    for(let i=0;i<3;i++){
      const fx=bx-dx*(1+i)+Math.round((rng()-.5)*2),fz=bz-dz*(1+i)+Math.round((rng()-.5)*2);
      const fy=y0+1+Math.floor(rng()*3);
      if(!voxels[vKey(fx,fy,fz)]){
        put(fx,fy,fz,4);
        if(plan.fallDebris.length<_ftvN(plan.cfg.debrisCount))plan.fallDebris.push({x:fx,y:fy,z:fz,ti:4});
      }
    }
    for(let ax=-2;ax<=2;ax++)for(let az=-2;az<=2;az++){
      if(_wtHash(((bx+ax)*19)^((bz+az)*43))<0.4)put(bx+ax-dx*2,y0,bz+az-dz*2,COAL_ORE); // 焦げ跡
    }
    plan.blastSpot={x:bx-dx*3,z:bz-dz*3};      // すぐそばで点火寸前のまま止まったクリーパー
  }
  if(hd.style==='burning'){
    // 燃え広がる途中の炎（屋根と壁際に静止した炎メッシュを後段フェーズで立てる）
    plan.flameSpots.push({x:hx-1,y:y0+5,z:hz-1},{x:hx+1,y:y0+6,z:hz+1},{x:hx+dx*3,y:y0+1,z:hz+dz*3});
  }
  // 内装: 松明＋（無傷の家には）ベッド。宝箱は無傷1軒＋崩れた1軒に配置
  put(hx-1,y0+1,hz-1,TORCH_BLOCK);
  if(hd.style==='intact'&&typeof makeBedMesh==='function'&&typeof beds!=='undefined'){
    const bmesh=makeBedMesh();bmesh.position.set(hx+1+.5,y0+1,hz+.9);scene.add(bmesh);
    beds.push({mesh:bmesh,x:hx+1,y:y0+1,z:hz});
  }
  if(hd.style==='intact'&&!plan._homeChestDone){plan._homeChestDone=true;plan.chestSpots.push({x:hx-dx+dz,y:y0+1,z:hz-dz+dx});}
  else if(hd.style==='collapse'&&!plan._ruinChestDone){plan._ruinChestDone=true;plan.chestSpots.push({x:hx+1,y:y0+1,z:hz-1});}
  // 家の中で止まったゾンビ（ドアの内側）
  if(hd.style==='collapse'&&!plan._houseEnemyDone){plan._houseEnemyDone=true;plan._houseEnemySpot={x:hx+dx,z:hz+dz,face:Math.atan2(dxc,dzc)+Math.PI};}
}
function _ftvHouses(plan){for(const hd of plan.houses)_ftvHouse(plan,hd);}

// ── 井戸（水は凍結）＋畑（水路が凍結・実った作物=食料）──
function _ftvIce(plan,x,y,z){put(x,y,z,ICE_BLOCK);plan.iceKeys.push(vKey(x,y,z));}
function _ftvWell(plan){
  const y0=plan.ybase,ang=plan.wellAng;
  const wx=plan.cx0+Math.round(Math.cos(ang)*6),wz=plan.cz0+Math.round(Math.sin(ang)*6);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)if(dx||dz)put(wx+dx,y0+1,wz+dz,1); // 石の縁
  for(const s of[-1,1]){for(let y=2;y<=3;y++)put(wx+s,y0+y,wz+s,3);}                   // 柱
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)put(wx+dx,y0+4,wz+dz,SLAB_BLOCK,0); // 屋根
  clr(wx,y0,wz);put(wx,y0-2,wz,1);clr(wx,y0-1,wz);
  _ftvIce(plan,wx,y0-1,wz);                       // 井戸の水（凍結）
  // 溢れて流れ出す途中で静止した水: 村の外側へ広がる氷の帯
  const fx=Math.abs(Math.cos(ang))>=Math.abs(Math.sin(ang))?(Math.cos(ang)>=0?1:-1):0;
  const fz=fx===0?(Math.sin(ang)>=0?1:-1):0;
  _ftvIce(plan,wx+fx,y0+1,wz+fz);                 // 縁を越える瞬間
  _ftvIce(plan,wx+fx*2,y0+1,wz+fz*2);
  _ftvIce(plan,wx+fx*3,y0+1,wz+fz*3+1);           // 地面に広がるしぶき
  _ftvIce(plan,wx+fx*3+1,y0+1,wz+fz*3);
}
function _ftvFarm(plan){
  const y0=plan.ybase,ang=plan.farmAng;
  const fx=plan.cx0+Math.round(Math.cos(ang)*10),fz=plan.cz0+Math.round(Math.sin(ang)*10);
  for(let ax=-2;ax<=2;ax++)for(let az=-1;az<=1;az++)put(fx+ax,y0,fz+az,CAVE_DIRT); // 畝
  for(let ax=-2;ax<=2;ax++)_ftvIce(plan,fx+ax,y0,fz);                              // 凍結した水路
  for(const[ax,az]of[[-3,-2],[3,-2],[-3,2],[3,2]])put(fx+ax,y0+1,fz+az,3);         // 四隅の杭
  // 実った作物（既存の畑システム: 収穫すると小麦=食料が手に入る）
  if(typeof farmPlots!=='undefined'&&typeof makeFarmMesh==='function'){
    for(let ax=-2;ax<=2;ax++)for(const az of[-1,1]){
      if(_wtHash(((fx+ax)*11)^((fz+az)*23))<0.25)continue;
      const mesh=makeFarmMesh(2);mesh.position.set(fx+ax+.5,y0+1,fz+az+.5);scene.add(mesh);
      farmPlots.push({mesh,x:fx+ax,y:y0+1,z:fz+az,stage:2,growT:99});
    }
  }
}

// ── 崩れかけの見張り台（頂上に弓矢の詰まった宝箱）＋倒れかけの木 ──
function _ftvTower(plan){
  const y0=plan.ybase,ang=plan.towerAng;
  const tx=plan.cx0+Math.round(Math.cos(ang)*13),tz=plan.cz0+Math.round(Math.sin(ang)*13);
  plan.tower={x:tx,z:tz};
  [[0,0,6],[3,0,3],[0,3,6],[3,3,6]].forEach(([lx,lz,H])=>{ // 4本脚（1本は折れて低い）
    for(let y=1;y<=H;y++)put(tx+lx,y0+y,tz+lz,3);
  });
  for(let ax=-1;ax<=4;ax++)for(let az=-1;az<=4;az++){       // 床（角が欠けている）
    if(_wtHash(((tx+ax)*17)^((tz+az)*31))<0.16)continue;
    put(tx+ax,y0+7,tz+az,3);
  }
  for(let ax=-1;ax<=4;ax++)for(let az=-1;az<=4;az++){       // 崩れた手すり
    if(ax!==-1&&ax!==4&&az!==-1&&az!==4)continue;
    if(((ax+az)&1)||_wtHash(((tx+ax)*7)^((tz+az)*13))<0.35)continue;
    put(tx+ax,y0+8,tz+az,SLAB_BLOCK,0);
  }
  // 中心へ向いた側に粗い登り段（1段ずつジャンプで登れる）
  const sx=tx-(Math.cos(ang)>=0?2:-2);
  for(let s=1;s<=6;s++){for(let y=1;y<=s;y++)put(sx,y0+y,tz-2+s,y===s?STAIR_BLOCK:1,3);}
  put(tx+1,y0+8,tz+2,TORCH_BLOCK);
  plan.chestSpots.push({x:tx+1,y:y0+8,z:tz+1}); // 見張り台の弓と矢（宝箱）
  plan.flameSpots.push({x:tx+3,y:y0+8,z:tz+3}); // 見張り台にも燃え移る途中の炎
}
function _ftvTrees(plan){
  // 倒れかけた状態で斜めに固定された木×2。根元の土がめくれて浮いている
  for(let i=0;i<2;i++){
    const a=plan.rng()*Math.PI*2;
    const bx=plan.cx0+Math.round(Math.cos(a)*(plan.R-2)),bz=plan.cz0+Math.round(Math.sin(a)*(plan.R-2));
    const by=surfaceHeightAt(bx,bz);
    const lean=plan.rng()*Math.PI*2,lx=Math.cos(lean),lz=Math.sin(lean);
    let px=bx+.5,pz=bz+.5;
    for(let t=1;t<=6;t++){px+=lx*.55;pz+=lz*.55;put(Math.round(px),by+t,Math.round(pz),3);}
    const cx=Math.round(px),cz=Math.round(pz),cy=by+7;
    for(let dx=-2;dx<=2;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-2;dz<=2;dz++){
      if(dx*dx+dy*dy*2+dz*dz>5)continue;
      if(!voxels[vKey(cx+dx,cy+dy,cz+dz)])put(cx+dx,cy+dy,cz+dz,LEAF_BLOCK);
    }
    put(bx-Math.round(lx*2),by+1,bz-Math.round(lz*2),CAVE_DIRT); // めくれた根元
    put(bx-Math.round(lx),by+2,bz-Math.round(lz),CAVE_DIRT);     // 浮いた土くれ
  }
}

// ── 空中で静止した矢＋燃え広がる途中で止まった炎（どちらも軽量な静止メッシュ）──
function _ftvArrows(plan){
  const y0=plan.ybase,n=_ftvN(plan.cfg.arrowCount);
  for(let i=0;i<n;i++){
    // 村の外側から家々へ向かう軌道の途中で静止した襲撃の矢
    const a=plan.rng()*Math.PI*2,d=6+plan.rng()*9;
    const x=plan.cx0+Math.cos(a)*d,z=plan.cz0+Math.sin(a)*d,y=y0+1.7+plan.rng()*2.6;
    let dx=plan.cx0+(plan.rng()*8-4)-x,dz=plan.cz0+(plan.rng()*8-4)-z,dy=(plan.rng()-.55)*1.2;
    const l=Math.hypot(dx,dy,dz)||1;dx/=l;dy/=l;dz/=l;
    const m=new THREE.Mesh(_ftvArrowGeo,(plan.rng()<0.3?_ftvFireArrowMat:_ftvArrowMat).clone());
    m.position.set(x,y,z);m.lookAt(x+dx,y+dy,z+dz);
    scene.add(m);
    plan.arrows.push({mesh:m,x,y,z,dx,dy,dz});
  }
}
function _ftvFlames(plan){
  for(const s of plan.flameSpots.slice(0,_ftvN(plan.cfg.flameCount))){
    const g=new THREE.Object3D();
    const f1=new THREE.Mesh(_ftvFlameGeoA,_ftvFlameMatA.clone());f1.position.y=.28;
    const f2=new THREE.Mesh(_ftvFlameGeoB,_ftvFlameMatB.clone());f2.position.y=.45;
    g.add(f1,f2);
    g.position.set(s.x+.5,s.y,s.z+.5);g.rotation.y=plan.rng()*Math.PI;
    scene.add(g);
    plan.flames.push(g);
  }
}

// ── 停止中の敵を1体配置（既存の敵システム＋frozenフラグ。main.jsのループが
// frozen中はAI/移動/攻撃/距離デスポーンをスキップする）──
function _ftvSpawnFrozenEnemy(plan,wx,wy,wz,idx,face,fallen){
  if(typeof ENEMY_TYPES==='undefined'||typeof enemies==='undefined'||typeof makeMat!=='function')return null;
  const et=ENEMY_TYPES[Math.max(0,Math.min(ENEMY_TYPES.length-1,idx|0))];
  try{
    const mat=makeMat(et.color,et.emissive,et.emissiveIntensity||.15,.6);
    const built=et.builder(mat);
    built.root.position.set(wx+.5,wy+(et.bat?3:(fallen?1.2:1.85)),wz+.5);
    built.root.rotation.y=face||0;
    if(fallen)built.root.rotation.z=1.0+plan.rng()*.35;   // 転倒の途中で静止
    if(typeof markShadowCaster==='function')markShadowCaster(built.root);
    scene.add(built.root);
    const wv=(typeof gs!=='undefined'&&gs.wave)||0,mhp=et.hp+Math.floor(wv*.7);
    const e={root:built.root,body:built.body,head:built.head,hpBar:built.hpBar,hp:mhp,maxHp:mhp,type:et,velY:0,onGround:true,atkCd:0,stuckT:0,lastX:wx+.5,lastZ:wz+.5,flashMeshes:[built.body,built.head],dead:false,breakCd:0,lWing:built.lWing,rWing:built.rWing,frozen:true};
    enemies.push(e);
    plan.frozenEnemies.push(e);
    return e;
  }catch(err){console.warn('時間が止まった村: 敵の配置に失敗',err);return null;}
}
// ── 宝箱（既存の underTreasures 宝箱システムを流用、type3=豪華報酬）──
function _ftvPlaceChest(wx,wy,wz){
  const tk=vKey(wx,wy,wz);if(underTreasures[tk])return;
  put(wx,wy-1,wz,1);clr(wx,wy,wz);clr(wx,wy+1,wz);
  const mesh=_makeTreasureMesh(3);mesh.position.set(wx+.5,wy,wz+.5);
  if(!openedTreasureKeys.has(tk))scene.add(mesh);
  underTreasures[tk]={mesh,opened:openedTreasureKeys.has(tk),type:3,struct:'frozenTimeVillage'};
}
// ── 停止中の敵（村内＋外周）＋宝箱の配置 ──
function _ftvActors(plan){
  const cfg=plan.cfg,y0=plan.ybase,rng=plan.rng;
  const center=(x,z)=>Math.atan2(plan.cx0-x,plan.cz0-z);
  // 村内: 攻撃・逃走・転倒の途中で止まった敵
  const innerDefs=[
    {idx:1,pose:'aim'},   // スケルトン: 弓を構えた瞬間
    {idx:0,pose:'chase'}, // ゾンビ: 家へ迫る途中
    {idx:0,pose:'fallen'},// ゾンビ: 転倒の途中
    {idx:10,pose:'chase'},// クモ: 走り込む途中
  ];
  let dangerRef=null;
  for(let i=0;i<Math.min(cfg.enemyInner,innerDefs.length);i++){
    const d=innerDefs[i];
    const a=rng()*Math.PI*2,r=4.5+rng()*4;
    const x=plan.cx0+Math.round(Math.cos(a)*r),z=plan.cz0+Math.round(Math.sin(a)*r);
    const face=d.pose==='aim'?center(x,z)+Math.PI:center(x,z); // 弓は外向き（家を狙う）
    const e=_ftvSpawnFrozenEnemy(plan,x,y0,z,d.idx,face,d.pose==='fallen');
    if(e&&!dangerRef)dangerRef={x,z};
  }
  // 崩れた家のドアの内側で止まったゾンビ
  if(plan._houseEnemySpot)_ftvSpawnFrozenEnemy(plan,plan._houseEnemySpot.x,y0,plan._houseEnemySpot.z,0,plan._houseEnemySpot.face,false);
  // 爆発直前の家のそば: 点火寸前のまま静止したクリーパー
  if(plan.blastSpot)_ftvSpawnFrozenEnemy(plan,plan.blastSpot.x,y0,plan.blastSpot.z,9,center(plan.blastSpot.x,plan.blastSpot.z),false);
  // 外周: 村へ迫る途中で止まった敵
  for(let i=0;i<cfg.enemyOuter;i++){
    const a=rng()*Math.PI*2,r=plan.R-1.5;
    const x=plan.cx0+Math.round(Math.cos(a)*r),z=plan.cz0+Math.round(Math.sin(a)*r);
    const e=_ftvSpawnFrozenEnemy(plan,x,surfaceHeightAt(x,z),z,i%2?10:0,center(x,z),false);
    if(e)dangerRef={x,z}; // 最後の外周の敵のそばに「危険だが価値のある」宝箱
  }
  if(dangerRef)plan.chestSpots.push({x:dangerRef.x+2,y:y0+1,z:dangerRef.z});
  let placed=0;
  for(const s of plan.chestSpots){if(placed>=cfg.treasureCount)break;_ftvPlaceChest(s.x,s.y,s.z);placed++;}
}

// ── 生成の仕上げ: 実行時状態を登録（結晶破壊フックと解除処理がこれを参照する）──
function _ftvFinalize(plan){
  frozenVillage={
    cfg:plan.cfg,
    cx0:plan.cx0,cz0:plan.cz0,ybase:plan.ybase,tower:plan.tower,
    coreKeys:plan.coreKeys,
    crystalHp:Math.min(plan.cfg.crystalHp,plan.coreKeys.size),
    spireKeys:[...plan.coreKeys],shardKeys:plan.shardKeys,
    arrows:plan.arrows,flames:plan.flames,iceKeys:plan.iceKeys,
    fallDebris:plan.fallDebris,enemies:plan.frozenEnemies,
    sprite:plan.sprite,released:false,
  };
}
// 村の静止メッシュを掃除して状態を破棄（clearWorld/再生成時に呼ばれる）
function resetFrozenVillage(){
  const V=frozenVillage;if(!V)return;
  for(const a of V.arrows){scene.remove(a.mesh);a.mesh.material.dispose();}
  for(const f of V.flames){scene.remove(f);f.traverse(o=>{if(o.isMesh&&o.material)o.material.dispose();});}
  if(V.sprite){scene.remove(V.sprite);if(V.sprite.material.map)V.sprite.material.map.dispose();V.sprite.material.dispose();}
  frozenVillage=null;_ftvShakeT=0;_ftvShakeDur=0;_ftvShakeAmp=0;
}

// ── 結晶破壊フック: breakBlock（プレイヤー）等から壊れたブロックのキーを受け取る。
// 結晶スパイアのブロックなら耐久を減らし、0で時間停止を解除する ──
function ftvOnBlockBroken(k){
  const V=frozenVillage;if(!V||V.released||!V.coreKeys.has(k))return;
  V.coreKeys.delete(k);
  V.crystalHp--;
  if(V.crystalHp>0){
    ftvShake(.12,.25);
    showBonus('⏳ 時間結晶にひびが入った…（あと '+V.crystalHp+'）');
    playTone(900,.1,.12,'triangle');
  }else releaseFrozenVillage();
}

// ═══ 時間停止の解除 ═══
// 一瞬で全部を動かさず、replayStepMs 間隔で「揺れ→結晶発光→結晶片の飛散→
// 矢→水→敵→瓦礫の落下→強敵出現」の順に段階再生する。止まっていた一枚絵が
// 動き出す演出のため、各段階は意図的に1テンポずつ遅らせる。
function releaseFrozenVillage(){
  const V=frozenVillage;if(!V||V.released)return;
  V.released=true;
  const stepMs=V.cfg.replayStepMs;
  const at=(i,fn)=>setTimeout(()=>{
    if(frozenVillage!==V)return; // リセット/再生成後の遅延実行を無効化
    try{fn();}catch(e){console.warn('時間停止解除: 演出中にエラー',e);}
  },Math.round(stepMs*i));
  // 1) 画面を軽く揺らす＋低い地響き
  showAlert('⏳ 時間結晶が砕けた…！');
  ftvShake(.4,.7);
  playTone(70,.5,.3,'sawtooth');
  // 2) 結晶の発光（グロースプライトの膨張＋粒子）
  at(1,()=>{
    if(V.sprite)V.sprite.scale.set(16,16,1);
    spawnParticles(V.cx0+.5,V.ybase+5,V.cz0+.5,0x99eeff,8);
    playTone(1400,.25,.18,'sine');setTimeout(()=>playTone(1900,.2,.14,'sine'),120);
  });
  // 3) 結晶片を散らす（スパイアと浮遊結晶片を砕く）
  at(2,()=>{
    _deferDirty=true;
    try{
      for(const k of V.spireKeys){const p=k.split('|');clr(+p[0],+p[1],+p[2]);}
      for(const k of V.shardKeys){const p=k.split('|');clr(+p[0],+p[1],+p[2]);}
    }finally{_deferDirty=false;flushDirtyChunks();}
    for(let i=0;i<6;i++)spawnBlockDebris(V.cx0+.5+(Math.random()-.5)*3,V.ybase+2+Math.random()*5,V.cz0+.5+(Math.random()-.5)*3,CRYSTAL_BLOCK);
    if(V.sprite){scene.remove(V.sprite);if(V.sprite.material.map)V.sprite.material.map.dispose();V.sprite.material.dispose();V.sprite=null;}
    ftvShake(.25,.4);
    playTone(300,.2,.2,'square');
  });
  // 4) 停止していた矢が飛ぶ（既存の飛翔体システムへ引き渡す。襲撃の矢なのでプレイヤーに当たる）
  at(3,()=>{
    for(const a of V.arrows)projectiles.push({mesh:a.mesh,x:a.x,y:a.y,z:a.z,dx:a.dx*22,dy:a.dy*22,dz:a.dz*22,life:2.5,dmg:7,isBossArrow:true});
    V.arrows=[];
    if(typeof sfxBow==='function')sfxBow();
  });
  // 5) 水が流れ始める（凍結していた氷→水）
  at(4,()=>{
    _deferDirty=true;
    try{for(const k of V.iceKeys){const p=k.split('|');put(+p[0],+p[1],+p[2],WATER_BLOCK);}}
    finally{_deferDirty=false;flushDirtyChunks();}
    V.iceKeys=[];
    playTone(520,.12,.1,'sine');
  });
  // 6) 停止していた敵が一斉に動き出す＋炎が揺らめく
  at(5,()=>{
    for(const e of V.enemies){
      if(!e||e.dead)continue;
      e.frozen=false;e.root.rotation.z=0;
      if(typeof flashEnemy==='function')flashEnemy(e);
    }
    V.enemies=[];
    for(const f of V.flames)spawnParticles(f.position.x,f.position.y+.6,f.position.z,0xff7722,3);
    showAlert('⚔ 村の時間が動き出した！襲撃が再開される！');
    playTone(160,.3,.25,'sawtooth');
  });
  // 7) 浮いていた瓦礫の一部が落下する
  at(6,()=>{
    for(const d of V.fallDebris){
      const v=voxels[vKey(d.x,d.y,d.z)];
      if(!v||v.ti!==d.ti)continue; // プレイヤーが先に壊した/変えた瓦礫はそのまま
      clr(d.x,d.y,d.z);
      spawnBlockDebris(d.x+.5,d.y+.5,d.z+.5,d.ti);
      const gy=surfaceHeightAt(d.x,d.z);
      if(!voxels[vKey(d.x,gy+1,d.z)])put(d.x,gy+1,d.z,d.ti);
    }
    V.fallDebris=[];
    ftvShake(.18,.3);
    playTone(120,.2,.2,'square');
  });
  // 8) 見張り台付近に少し強い敵が出現
  at(7,()=>{
    const sp=V.tower||{x:V.cx0,z:V.cz0};
    const sy=surfaceHeightAt(sp.x+2,sp.z+2)+1;
    _ssgSpawnEnemyAt(sp.x+2,sy,sp.z+2,(typeof ENEMY_TYPES!=='undefined'&&ENEMY_TYPES.length>8)?8:2);
    spawnParticles(sp.x+2.5,sy+1.5,sp.z+2.5,0x00ccff,8);
    showAlert('⚠ 時の番人クリスタルゴーレムが現れた！');
    if(typeof sfxBossAppear==='function')sfxBossAppear();
  });
}

let _frozenVillageBusy=false; // 生成中フラグ（ボタン連打による多重生成を防ぐ）
function generateFrozenTimeVillage(){
  if(_frozenVillageBusy){showBonus('⏳ 時間が止まった村を生成中…');return;}
  if(frozenVillage&&!frozenVillage.released){showBonus('⏳ 時間が止まった村はすでに存在する（時間結晶を壊すと解除）');return;}
  if(!window.confirm('「時間が止まった村」を生成します。平坦な地上を探して周囲の地形が少し変化します。生成しますか？'))return;
  if(frozenVillage)resetFrozenVillage(); // 解除済みの旧村の装飾を掃除して作り直す
  _frozenVillageBusy=true;_ftvSetProgress(true,0);
  let plan;
  try{
    const anchor=_frontAnchor(FROZEN_VILLAGE_CFG.anchorDist);
    const site=_ftvFindSite(anchor)||{cx:anchor.cx0,cz:anchor.cz0};
    _ensureChunksAround(site.cx,site.cz,FROZEN_VILLAGE_CFG.villageR+4,3);
    const seed=((WORLD_SEED^(site.cx*73856093)^(site.cz*19349663)^0x51f0ac)>>>0)||1;
    plan=_planFrozenVillage(_wtRng(seed),site);
  }catch(e){
    console.error('時間が止まった村: 準備中にエラー',e);
    _frozenVillageBusy=false;_ftvSetProgress(false);showBonus('⚠ 時間が止まった村の生成に失敗しました');return;
  }
  // フェーズ列（1フェーズ/フレーム）。整地→広場と結晶→家→井戸/畑→見張り台/木→矢/炎→敵/宝箱→仕上げ
  const phases=[
    ()=>_ftvTerraform(plan,-1),
    ()=>_ftvTerraform(plan,1),
    ()=>_ftvPlazaCrystal(plan),
    ()=>_ftvHouses(plan),
    ()=>{_ftvWell(plan);_ftvFarm(plan);},
    ()=>{_ftvTower(plan);_ftvTrees(plan);},
    ()=>{_ftvArrows(plan);_ftvFlames(plan);},
    ()=>_ftvActors(plan),
    ()=>_ftvFinalize(plan),
  ];
  let idx=0;_deferDirty=true;
  const step=()=>{
    try{
      phases[idx]();idx++;
      _deferDirty=false;flushDirtyChunks();
      _ftvSetProgress(true,idx/phases.length);
      if(idx<phases.length){_deferDirty=true;requestAnimationFrame(step);}
      else{
        _frozenVillageBusy=false;_ftvSetProgress(false);
        showBonus('⏳ 時間が止まった村を生成！中央の時間結晶を壊すと時が動き出す');
        playTone(392,.14,.1,'triangle');setTimeout(()=>playTone(523,.14,.1,'triangle'),140);setTimeout(()=>playTone(659,.18,.1,'triangle'),300);
      }
    }catch(e){
      console.error('時間が止まった村: 生成中にエラー',e);
      _deferDirty=false;try{flushDirtyChunks();}catch(_){}
      _frozenVillageBusy=false;_ftvSetProgress(false);showBonus('⚠ 時間が止まった村の生成に失敗しました');
    }
  };
  requestAnimationFrame(step);
}

// ═══ 特殊生成メニュー: 登録テーブル + ディスパッチャ ═══
// UIの「特殊生成」ピッカーはこの配列を舐めてボタンを並べるだけ。新しい生成物を
// 追加するときは、この配列に1エントリ足して generateXxx() を実装すればよい
// （main.js/cheats.js 側のUIコードは変更不要）。
const SPECIAL_STRUCTURES=[
  {key:'sageGarden',icon:'🏔',label:'賢者の樹庭',desc:'岩の尖塔とアーチ、御神木と池',fn:generateSageGarden},
  {key:'pleiadesWatchtower',icon:'🗼',label:'プレアデス監視塔',desc:'天まで伸びる細い塔と頂上の神殿',fn:generatePleiadesWatchtower},
  {key:'skyTemple',icon:'🏝',label:'空中神殿',desc:'空に浮かぶ島と八角神殿、滝と浮遊岩',fn:generateSkyTemple},
  {key:'worldTree',icon:'🌳',label:'世界樹',desc:'大地を覆う巨大な神秘の樹',fn:generateWorldTree},
  {key:'sleepingStoneGod',icon:'🦴',label:'眠れる石神',desc:'倒れて石化した超巨大な人型の神。頭蓋骨・肋骨・心核を探索',fn:generateSleepingStoneGod},
  {key:'invertedCastle',icon:'🏰',label:'逆さ城',desc:'空中に浮かぶ暗黒の逆さ城。下向きの尖塔・浮遊島・魔力コアを探索',fn:generateInvertedCastle},
  {key:'frozenTimeVillage',icon:'⏳',label:'時間が止まった村',desc:'襲撃の瞬間ごと時間停止した村。中央の時間結晶を壊すと時が動き出す',fn:generateFrozenTimeVillage},
];
function generateSpecialStructure(key){
  const def=SPECIAL_STRUCTURES.find(s=>s.key===key);
  if(def)def.fn();
}

// プレイヤーから minDist 以上離れた最寄りの未開封構造物を探す（宝の地図の目標用）
function findNearestStructure(px,pz,minDist){
  const pgx=Math.floor(px/STRUCT_GRID),pgz=Math.floor(pz/STRUCT_GRID);
  let best=null,bestD=Infinity;
  for(let ring=0;ring<=6;ring++){
    for(let gx=pgx-ring;gx<=pgx+ring;gx++)for(let gz=pgz-ring;gz<=pgz+ring;gz++){
      if(Math.max(Math.abs(gx-pgx),Math.abs(gz-pgz))!==ring)continue; // リング外周のみ
      const s=structAt(gx,gz);if(!s)continue;
      const key=structChestKey(s);if(openedTreasureKeys.has(key))continue;
      const d=Math.hypot(s.wx-px,s.wz-pz);if(d<minDist)continue;
      if(d<bestD){bestD=d;best={wx:s.wx,wz:s.wz,key,type:s.type};}
    }
    if(best&&ring>=2)break; // 数リング先まで見つかれば十分
  }
  return best;
}

