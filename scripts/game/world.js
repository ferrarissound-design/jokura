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
// Work in a colour-managed pipeline and gently compress bright sunlit faces.
// This keeps snow/sand readable without turning grass and the held item neon.
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.78;
let SHADOWS_ON=false;
// ─── 距離フォグ（空気遠近法）の調律パラメータ ───
// 地表のフォグ near/far は毎フレーム DRAW_R*CHUNK（＝描画半径・ワールド単位）に
// 下記の倍率を掛けて決める（main.js の tick 内）。THREE.Fog は線形＋smoothstep で、
// depth>=far のピクセルは完全にフォグ色（＝空色）へ飽和する。旧値では far が描画縁
// (0.98) にほぼ一致し、ロード済みチャンクの外周がまるごと空色に溶けて「遠景が半透明の
// 板」に見えていた。far を 1.0（描画縁）より外へ置くことで、最遠でもシルエットと地表色
// を ~2 割残し、空気遠近法らしい馴染みに変える。色は sky.js が地平線色へ同期させたまま
// なので、地平線と空の境界は従来どおりシームレス。組み込みフォグのみで完結し、マテリアル
// 透明度もシェーダも増やさないため、スマホでも追加負荷はゼロ。
const FOG_START_MULTIPLIER=0.76; // 旧 0.70：近～中景をより長くクリアに保つ（フォグ開始を少し遠く）
const FOG_END_MULTIPLIER=1.10;   // 旧 0.98：描画縁を越えて薄まりを緩め、遠景を消さず残す
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
// ─── SKY ───
// スカイドーム/太陽/月/星/雲などの空表現は sky.js の SkySystem へ移設した
// （world.js の直後に読み込まれ、ここで作った scene/camera/renderer/sun/hemLight を
// 利用する）。skyMesh / sunSprite / moonSprite のグローバルは sky.js が別名として提供する。
// CLOUD_Y だけは天空都市の生成高さ算出（_scc/_srcPlanなどのbaseY）で参照するため残す。
const CLOUD_Y=46;

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
const BLOCK_COLORS=[0x4caf50,0x8a8f98,0xd9c27a,0x5d4037,0xef9a9a,0x2e7d32,0x78909c,0x1a0a00,0xff4500,0xddeeff,0x1565c0,0x6b4226,0x1e1e1e,0x2a2e3d,0x8b4513,0x00e5ff,0xffa030,0x8a8f98,0x8a8f98,0xaadfff,0x1b0b2e,0xcc66ff,0x2e9e4f,0xd0483e,0xb0a08c,0xbfe6ff,0xf4f4ec,0x3f9e3f,0xe53920,0x2b2b33,0xdcefff,0x1c1512,0xfff0c4];
// [grass,stone,sand,wood,brick,forest-grass,grey-stone,volcano-rock,lava,snow,water,cave-dirt,coal-ore,deep-stone,iron-ore,diamond-ore,torch,slab,stair,ice,obsidian,crystal,cactus,mushroom,clay,glass,wool-block,leaf,tnt,judgment-stone,divine-glass,scorched-earth,judgment-core]
const BLOCK_HARDNESS=[1,3,1,2,4,1,3,99,99,1,99,1,2,4,5,6,1,2,2,1,6,4,1,1,1,1,1,1,1,6,4,2,7];
const LAVA_BLOCK=8,SNOW_BLOCK=9,WATER_BLOCK=10,CAVE_DIRT=11,COAL_ORE=12,DEEP_STONE=13,IRON_ORE=14,DIAMOND_ORE=15,TORCH_BLOCK=16,SLAB_BLOCK=17,STAIR_BLOCK=18;
// バイオーム固有素材ブロック（そのバイオームの地表にだけ生成される）
// 氷=滑る / 黒曜石=超硬い+敵に壊されない(耐爆) / 水晶・サボテン・キノコ・粘土=クラフト素材
const ICE_BLOCK=19,OBSIDIAN_BLOCK=20,CRYSTAL_BLOCK=21,CACTUS_BLOCK=22,MUSHROOM_BLOCK=23,CLAY_BLOCK=24;
// 建築ブロック: 🪟ガラス(半透明・かまどで砂を焼く) / 🧶ウールブロック(柔らかい建材)
const GLASS_BLOCK=25,WOOL_BLOCK=26;
// 🍃 葉ブロック: 木の傘に使う（以前は草ブロックの傘で側面が土に見えていた）
const LEAF_BLOCK=27,TNT_BLOCK=28;
// 🔱 LONGINUS（軌道貫通兵器）が刻む「神罰汚染地帯」専用ブロック。通常の爆発跡とは
// 別物として扱う: 審判石(壁面の亀裂)・神晶(半透明・着弾熱で結晶化)・焦土(表層)・
// 神罰核(最深部にごく少量・採掘可能なレアブロック)。詳細は longinus.js を参照。
const JUDGMENT_STONE=29,DIVINE_GLASS=30,SCORCHED_EARTH=31,JUDGMENT_CORE=32;
const SLOT_TI=[0,1,2,3,4,TORCH_BLOCK,SLAB_BLOCK,STAIR_BLOCK,GLASS_BLOCK,WOOL_BLOCK,TNT_BLOCK];
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
function _aoOccluder(x,y,z){const v=voxels[vKey(x,y,z)];return(v&&v.ti!==WATER_BLOCK&&v.ti!==TORCH_BLOCK&&v.ti!==GLASS_BLOCK&&v.ti!==DIVINE_GLASS&&!isPartial(v.ti))?1:0;}
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
    const ti=v.ti;if(ti===WATER_BLOCK||ti===TORCH_BLOCK||ti===GLASS_BLOCK||ti===TNT_BLOCK||ti===DIVINE_GLASS)continue;
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
  // 🌀 終端界: 縦チャンク(underChunks)を持たない単一の chunks[] だけを使う
  // （島は下面まで同じ列メッシュへ載る）。y<0 でも underChunks を参照しない。
  if(currentDimension==='endZone')return chunks[cKey(cx,cz)]||null;
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
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapNearestFilter;return t;
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
// Natural blocks use a few larger clusters over the one-pixel grain. At a
// distance the clusters remain visible, while close up the texture stays crisp.
function naturalTex(base,seed,amt,clusters){
  amt=amt==null?.12:amt;clusters=clusters==null?8:clusters;
  const[c,x]=_texCtx(),r=_rng(seed);
  for(let j=0;j<TEX_SIZE;j++)for(let i=0;i<TEX_SIZE;i++){
    const v=r();x.fillStyle=_shade(base,v<.18?amt:v<.38?-amt:v<.43?-amt*1.55:0);x.fillRect(i,j,1,1);
  }
  for(let n=0;n<clusters;n++){
    const px=(r()*14)|0,py=(r()*14)|0,w=1+((r()*3)|0),h=1+((r()*2)|0);
    x.fillStyle=_shade(base,r()<.52?-amt*1.45:amt*1.25);x.fillRect(px,py,w,h);
    if(r()<.7){x.fillStyle=_shade(base,r()<.5?-amt*.55:amt*.55);x.fillRect(Math.min(15,px+w),py,1,h);}
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
function tntSideTex(){
  const[c,x]=_texCtx();
  x.fillStyle='#d9331f';x.fillRect(0,0,16,16);
  x.fillStyle='#f05a28';for(let i=1;i<16;i+=4)x.fillRect(i,0,2,16);
  x.fillStyle='#f2dfb3';x.fillRect(0,5,16,6);
  x.fillStyle='#1b1715';x.fillRect(0,5,16,1);x.fillRect(0,10,16,1);
  x.fillStyle='#b71c1c';x.font='bold 6px monospace';x.textAlign='center';x.fillText('TNT',8,10);
  return _mkTex(c);
}
function tntTopTex(){
  const[c,x]=_texCtx();x.fillStyle='#e44925';x.fillRect(0,0,16,16);
  x.fillStyle='#7d1b12';for(let i=-12;i<20;i+=6){x.save();x.translate(i,0);x.rotate(Math.PI/4);x.fillRect(0,-12,2,32);x.restore();}
  x.fillStyle='#202020';x.fillRect(6,6,4,4);x.fillStyle='#ffb12b';x.fillRect(7,7,2,2);
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
// 🔱 LONGINUS「審判石」: 暗い岩肌に白金色の亀裂が数本走る（発光は material 側の emissive で付与）
function crackedTex(base,crackCol,seed){
  const[c,x]=_texCtx();const r=_rng(seed);
  for(let j=0;j<TEX_SIZE;j++)for(let i=0;i<TEX_SIZE;i++){const v=r();x.fillStyle=_shade(base,v<.25?.07:v<.5?-.1:0);x.fillRect(i,j,1,1);}
  x.strokeStyle=_shade(crackCol,0);x.lineWidth=1;x.lineCap='round';
  for(let n=0;n<3;n++){
    let px=1+r()*(TEX_SIZE-2),py=1+r()*(TEX_SIZE-2),ang=r()*Math.PI*2;
    x.beginPath();x.moveTo(px,py);
    const segN=3+Math.floor(r()*3);
    for(let s=0;s<segN;s++){ang+=r()*1.6-.8;px+=Math.cos(ang)*(2+r()*3);py+=Math.sin(ang)*(2+r()*3);x.lineTo(px,py);}
    x.stroke();
  }
  return _mkTex(c);
}
// 🔱 LONGINUS「神罰核」: 暗い母岩に強く光る筋（oreTexと同じ手法で密度高め）
function coreTex(base,glowCol,seed){
  const[c,x]=_texCtx();const r=_rng(seed);
  for(let j=0;j<TEX_SIZE;j++)for(let i=0;i<TEX_SIZE;i++){const v=r();x.fillStyle=_shade(base,v<.3?.08:v<.55?-.1:0);x.fillRect(i,j,1,1);}
  const pts=[[0,0],[1,0],[0,1],[1,1],[2,1],[1,2],[2,0],[0,2]];
  for(let b=0;b<9;b++){
    const bx=1+Math.floor(r()*(TEX_SIZE-3)),by=1+Math.floor(r()*(TEX_SIZE-3)),n=3+Math.floor(r()*5);
    for(let p=0;p<n;p++){const o=pts[Math.floor(r()*pts.length)];x.fillStyle=_shade(glowCol,r()<.4?.1:.3);x.fillRect(bx+o[0],by+o[1],1,1);}
  }
  return _mkTex(c);
}
// vertexColors picks up the face shading baked into boxGeo
function smat(map,extra){return new THREE.MeshStandardMaterial(Object.assign({map,roughness:.9,metalness:.05,vertexColors:true},extra||{}));}
const _T={
  grassTop:naturalTex(0x668f3f,11,.11,7), grassSide:grassSideTex(0x668f3f,0x765333,12), dirt:naturalTex(0x765333,13,.13,10),
  forestTop:naturalTex(0x477d3c,14,.11,8), forestSide:grassSideTex(0x477d3c,0x58462c,15),
  // neutral (near-white) grass-top used in-world: the actual green comes from
  // the per-column biome tint baked into vertex color, so it can blend
  grassTopNeutral:naturalTex(0xffffff,1101,.1,7),
  stone:naturalTex(0x85888b,21,.11,11), sand:naturalTex(0xd4bf79,22,.075,7),
  logSide:logSideTex(0x6b4a2f,23), logTop:logTopTex(0x9a7a4f,24), brick:brickTex(0xc05a4a,25),
  greyStone:naturalTex(0x747d82,26,.12,10), volcano:naturalTex(0x1a0a00,27,.32,9), snow:naturalTex(0xe6edf2,28,.04,5),
  caveDirt:naturalTex(0x62432b,29,.13,10), coal:oreTex(0x85888b,0x1a1a1a,30), deepStone:naturalTex(0x30343b,31,.14,10),
  iron:oreTex(0x8a8f98,0xcaa472,32), diamond:oreTex(0x7fb6c8,0x3fe0ff,33), lava:noisyTex(0xff4500,34,.22),
  ice:noisyTex(0xbfe6ff,61,.07), obsidian:noisyTex(0x1b0b2e,62,.35), crystal:oreTex(0x8a8f98,0xcc66ff,63),
  cactus:noisyTex(0x2e9e4f,64,.16), mushroom:oreTex(0xd0483e,0xffe9d0,65), clay:noisyTex(0xb0a08c,66,.1),
  woolBlk:noisyTex(0xf4f4ec,71,.05),
  leaf:naturalTex(0x477a3c,72,.15,11),
  tntSide:tntSideTex(),tntTop:tntTopTex(),
  judgmentStone:crackedTex(0x232228,0xd8e8ff,81),
  divineGlass:noisyTex(0xdcefff,82,.06),
  scorchedEarth:naturalTex(0x1c1512,83,.16,9),
  judgmentCore:coreTex(0x2a241c,0xffe9a0,84),
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
    case WATER_BLOCK: return new THREE.MeshStandardMaterial({color:0x2f79ad,roughness:.16,metalness:.05,transparent:true,opacity:.66,depthWrite:false,emissive:0x062c48,emissiveIntensity:.08,vertexColors:true});
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
    case TNT_BLOCK: return faceMats(_T.tntSide,_T.tntTop,_T.tntTop);
    // 🔱 LONGINUS「神罰汚染地帯」専用ブロック（詳細: longinus.js）
    case JUDGMENT_STONE: return smat(_T.judgmentStone,{roughness:.55,metalness:.25,emissive:0x9fc8ff,emissiveIntensity:.22});
    case DIVINE_GLASS: return new THREE.MeshStandardMaterial({color:0xdcefff,map:_T.divineGlass,roughness:.08,metalness:.1,transparent:true,opacity:.55,emissive:0xaeefff,emissiveIntensity:.5,vertexColors:true});
    case SCORCHED_EARTH: return smat(_T.scorchedEarth,{roughness:1,emissive:0x1a0800,emissiveIntensity:.05});
    case JUDGMENT_CORE: return smat(_T.judgmentCore,{roughness:.35,metalness:.4,emissive:0xffdd88,emissiveIntensity:.85});
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
  sh.vertexShader='uniform float uTime;\nvarying vec3 vJkWaterPos;\n'+sh.vertexShader.replace(
    '#include <begin_vertex>',
    ['#include <begin_vertex>',
     'vec4 jkW=modelMatrix*vec4(position,1.0);',
     'vJkWaterPos=jkW.xyz;',
     'if(position.y>0.3){transformed.y+=sin(jkW.x*1.9+uTime*1.8)*.05+cos(jkW.z*1.6+uTime*2.2)*.04;}'
    ].join('\n'));
  sh.fragmentShader='uniform float uTime;\nvarying vec3 vJkWaterPos;\n'+sh.fragmentShader.replace(
    '#include <output_fragment>',
    ['#include <output_fragment>',
     'float jkRipple=sin(vJkWaterPos.x*2.6+uTime*1.3)*cos(vJkWaterPos.z*2.2-uTime*1.1);',
     'gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(0.28,0.62,0.82),0.07+jkRipple*0.025);'
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

const BIOMES={PLAINS:0,DESERT:1,FOREST:2,MOUNTAIN:3,VOLCANO:4,SNOW:5,OCEAN:6,SWAMP:7,MUSHROOM_ISLAND:8};
const SEA_LEVEL=1,SWAMP_WATER_LEVEL=1;
// 新バイオームはIDを末尾へ追加し、既存セーブの数値IDをずらさない。
// ブロックIDは保存形式(5bit)互換のため既存ブロックを組み合わせ、将来の専用ID追加に備えて定義へ集約する。
const BIOME_DEFS={
  [BIOMES.PLAINS]:{id:BIOMES.PLAINS,key:'plains',name:'🌿 PLAINS',surface:0,subsurface:1,baseHeight:1,relief:1.2,waterLevel:null,vegetation:['oakTree','clay'],structures:['village'],spawns:['pig','cow','zombie'],colors:{water:0x2f79ad,sky:0xcbecff,fog:0xcbecff,ambient:1},bgmKey:'plains',fishingKey:'default'},
  [BIOMES.DESERT]:{id:BIOMES.DESERT,key:'desert',name:'🏜 DESERT',surface:2,subsurface:2,baseHeight:1,relief:.8,waterLevel:null,vegetation:['cactus','shrub'],structures:['pyramid'],spawns:['husk'],colors:{water:0x2f79ad,sky:0xf3d59a,fog:0xe7c486,ambient:1},bgmKey:'desert',fishingKey:'default'},
  [BIOMES.FOREST]:{id:BIOMES.FOREST,key:'forest',name:'🌲 FOREST',surface:5,subsurface:1,baseHeight:1.3,relief:1.5,waterLevel:null,vegetation:['forestTree','mushroom'],structures:['worldTree'],spawns:['wolf','zombie'],colors:{water:0x2f79ad,sky:0xbfe4d0,fog:0xbfe4d0,ambient:.95},bgmKey:'forest',fishingKey:'default'},
  [BIOMES.MOUNTAIN]:{id:BIOMES.MOUNTAIN,key:'mountain',name:'🪨 MOUNTAIN',surface:1,subsurface:1,baseHeight:3,relief:4,waterLevel:null,vegetation:['rocks','crystal'],structures:['watchtower'],spawns:['golem'],colors:{water:0x2f79ad,sky:0xd5e7ff,fog:0xd5e7ff,ambient:1},bgmKey:'mountain',fishingKey:'default'},
  [BIOMES.VOLCANO]:{id:BIOMES.VOLCANO,key:'volcano',name:'🌋 VOLCANO',surface:7,subsurface:7,baseHeight:2.5,relief:3.5,waterLevel:null,vegetation:['obsidian'],structures:['stoneGod'],spawns:['lavaSlime'],colors:{water:0x2f79ad,sky:0x7a210d,fog:0x6a1508,ambient:.8},bgmKey:'volcano',fishingKey:'default'},
  [BIOMES.SNOW]:{id:BIOMES.SNOW,key:'snow',name:'❄ SNOW',surface:SNOW_BLOCK,subsurface:SNOW_BLOCK,baseHeight:1.5,relief:2.5,waterLevel:null,vegetation:['spruce','ice'],structures:['igloo'],spawns:['stray'],colors:{water:0x9bdfff,sky:0xeaf6ff,fog:0xeaf6ff,ambient:1},bgmKey:'snow',fishingKey:'default'},
  [BIOMES.OCEAN]:{id:BIOMES.OCEAN,key:'ocean',name:'🌊 OCEAN',surface:2,subsurface:1,baseHeight:-4,relief:2.2,waterLevel:SEA_LEVEL,vegetation:['kelp','coral','seabedRock'],structures:['sandbar','reef','shipwreckHook','underwaterRuinHook'],spawns:['fish'],colors:{water:0x1b6ca8,sky:0x8fcfff,fog:0x1b6ca8,ambient:.95},bgmKey:'ocean',fishingKey:'ocean'},
  [BIOMES.SWAMP]:{id:BIOMES.SWAMP,key:'swamp',name:'🐊 SWAMP',surface:CLAY_BLOCK,subsurface:CAVE_DIRT,baseHeight:0,relief:.6,waterLevel:SWAMP_WATER_LEVEL,vegetation:['swampTree','vine','mushroom','deadTree','lily'],structures:['swampHutHook'],spawns:['slime','frog'],colors:{water:0x375f35,sky:0x81976f,fog:0x46583a,ambient:.78},bgmKey:'swamp',fishingKey:'swamp'},
  [BIOMES.MUSHROOM_ISLAND]:{id:BIOMES.MUSHROOM_ISLAND,key:'mushroomIsland',name:'🍄 MUSHROOM ISLAND',surface:MUSHROOM_BLOCK,subsurface:CAVE_DIRT,baseHeight:3,relief:1.2,waterLevel:null,vegetation:['giantMushroom','smallMushroom','glowMushroom','mushroomRocks'],structures:['mushroomCreatureHook'],spawns:['mooshroomHook'],colors:{water:0x516bb0,sky:0xd0b6ff,fog:0x8f76b8,ambient:.9},bgmKey:'mushroomIsland',fishingKey:'mushroomIsland'}
};
const FISHING_LOOT_TABLES={ocean:[],swamp:[],mushroomIsland:[],default:[]};
function _biomeFields(wx,wz){return{b1:noiseB(wx*0.008,wz*0.008),b2:noiseB(wx*0.012+100,wz*0.012+100),bv:noiseV(wx*0.012+50,wz*0.012-50),bs:noiseV(wx*0.009-80,wz*0.009+80),o:noiseB(wx*0.0032-410,wz*0.0032+410),s:noiseV(wx*0.0048+730,wz*0.0048-730),m:noiseV(wx*0.0022+1700,wz*0.0022-1700)};}
function _mushroomIslandMask(wx,wz){const f=_biomeFields(wx,wz);return f.o>0.18&&f.m>0.47&&noiseB(wx*0.018+900,wz*0.018-900)>-0.1;}
function getBiome(wx,wz){
  const f=_biomeFields(wx,wz);
  if(_mushroomIslandMask(wx,wz))return BIOMES.MUSHROOM_ISLAND;
  if(f.o>0.10)return BIOMES.OCEAN; // 低周波ノイズで広い入り組んだ水域を作る
  if(f.s>0.30&&f.o>-0.18)return BIOMES.SWAMP;
  if(f.bv>0.15)return BIOMES.VOLCANO;if(f.bs>0.22)return BIOMES.SNOW;
  if(f.b1>0.25)return BIOMES.MOUNTAIN;if(f.b2<-0.2)return BIOMES.DESERT;
  if(f.b1<-0.15&&f.b2>0)return BIOMES.FOREST;return BIOMES.PLAINS;
}
function getBiomeName(b){return(BIOME_DEFS[b]||BIOME_DEFS[BIOMES.PLAINS]).name;}
function getGroundType(biome){return(BIOME_DEFS[biome]||BIOME_DEFS[BIOMES.PLAINS]).surface;}
function getWaterSurfaceY(wx,wz){const b=getBiome(Math.floor(wx),Math.floor(wz));return BIOME_DEFS[b].waterLevel;}
function getWaterDepth(wx,wz){const wy=getWaterSurfaceY(wx,wz);return wy==null?0:Math.max(0,wy-surfaceHeightAt(Math.floor(wx),Math.floor(wz)));}
function isBoatNavigableBlock(ti){return ti===WATER_BLOCK;}
function getAquaticState(wx,wz){const depth=getWaterDepth(wx,wz);return{biome:getBiome(Math.floor(wx),Math.floor(wz)),surfaceY:getWaterSurfaceY(wx,wz),depth,kind:depth<=0?'land':depth<2?'shallow':'water'};}
function isPlayerOnWater(){const st=getAquaticState(P.x,P.z);return st.depth>0&&Math.abs(P.y-(st.surfaceY+1.6))<2.2;}
function getFishingContext(wx,wz){const b=getBiome(Math.floor(wx),Math.floor(wz)),def=BIOME_DEFS[b]||BIOME_DEFS[BIOMES.PLAINS];return{biome:b,biomeKey:def.key,waterSurfaceY:getWaterSurfaceY(wx,wz),waterDepth:getWaterDepth(wx,wz),table:FISHING_LOOT_TABLES[def.fishingKey]||FISHING_LOOT_TABLES.default};}
const discoveredBiomes={};
let _lastDiscoveredBiome=null;
function resetBiomeDiscoveries(){for(const k in discoveredBiomes)delete discoveredBiomes[k];_lastDiscoveredBiome=null;}
function loadBiomeDiscoveries(saved){
  resetBiomeDiscoveries();
  if(saved&&typeof saved==='object')for(const id of Object.keys(saved)){const n=Number(id);if(BIOME_DEFS[n])discoveredBiomes[n]=!!saved[id];}
}
function getDiscoveredBiomeIds(){return Object.keys(discoveredBiomes).map(Number).filter(id=>BIOME_DEFS[id]&&discoveredBiomes[id]);}
function markBiomeDiscovered(biome){
  if(!BIOME_DEFS[biome]||discoveredBiomes[biome])return false;
  discoveredBiomes[biome]=true;
  const count=getDiscoveredBiomeIds().length,total=Object.keys(BIOME_DEFS).length;
  showAlert('🧭 '+getBiomeName(biome)+' 発見！  '+count+'/'+total);
  if(count>=total&&typeof unlockAchievement==='function')unlockAchievement('biomeExplorer');
  if(typeof renderCodex==='function')renderCodex();
  return true;
}
function updateBiomeDiscovery(biome){
  if(biome===_lastDiscoveredBiome)return;
  _lastDiscoveredBiome=biome;
  markBiomeDiscovered(biome);
}
function updateBiomeAtmosphere(biome){
  const def=BIOME_DEFS[biome]||BIOME_DEFS[BIOMES.PLAINS];
  if(!def.colors)return;
  if(biome===BIOMES.OCEAN&&getWaterSurfaceY(P.x,P.z)!=null&&P.y<getWaterSurfaceY(P.x,P.z)+1.1){
    const depth=Math.min(1,Math.max(0,(getWaterSurfaceY(P.x,P.z)-P.y)/5));
    scene.fog.color.setHex(def.colors.fog);scene.fog.near=5;scene.fog.far=38-12*depth;renderer.setClearColor(scene.fog.color);
    hemLight.intensity=.42;return;
  }
  if(biome===BIOMES.SWAMP){scene.fog.color.setHex(def.colors.fog);scene.fog.near=Math.min(scene.fog.near,18);scene.fog.far=Math.min(scene.fog.far,52);renderer.setClearColor(scene.fog.color);hemLight.intensity=Math.min(hemLight.intensity,.62);}
  else if(biome===BIOMES.OCEAN){scene.fog.color.lerp(new THREE.Color(def.colors.fog),.18);renderer.setClearColor(scene.fog.color);}
  else if(biome===BIOMES.MUSHROOM_ISLAND){scene.fog.color.lerp(new THREE.Color(def.colors.fog),.14);renderer.setClearColor(scene.fog.color);}
}

// ─── BIOME GRASS COLOR BLENDING (Minecraft-style) ───
// Grass tops (ti 0 plains / ti 5 forest) render with a shared neutral texture
// and get their green from this per-column tint instead, so the color fades
// smoothly across a biome border rather than snapping at the tile edge.
function _linearGrassTint(hex){const c=new THREE.Color(hex).convertSRGBToLinear();return[c.r,c.g,c.b];}
const PLAINS_GRASS_RGB=_linearGrassTint(0x689443),FOREST_GRASS_RGB=_linearGrassTint(0x487d3e),SWAMP_GRASS_RGB=_linearGrassTint(0x5f7040),MUSHROOM_GRASS_RGB=_linearGrassTint(0x8a5aa0);
function computeGrassTint(wx,wz,biomeAt){
  biomeAt=biomeAt||getBiome;
  let r=0,g=0,b=0,n=0;
  for(let dz=-2;dz<=2;dz+=2)for(let dx=-2;dx<=2;dx+=2){
    const bb=biomeAt(wx+dx,wz+dz);const c=bb===BIOMES.FOREST?FOREST_GRASS_RGB:bb===BIOMES.SWAMP?SWAMP_GRASS_RGB:bb===BIOMES.MUSHROOM_ISLAND?MUSHROOM_GRASS_RGB:PLAINS_GRASS_RGB;
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
  const f=_biomeFields(wx,wz);
  const n=fbm(wx*0.03,wz*0.03,4);
  const roll=fbm(wx*0.006+321,wz*0.006-321,2)*1.6;
  let amp=1.2,off=0;                                            // PLAINS
  const wF=Math.min(_biomeW(-0.15-f.b1),_biomeW(f.b2));
  amp+=(1.5-amp)*wF;off+=(0.3-off)*wF;
  const wD=_biomeW(-0.2-f.b2);
  amp+=(0.8-amp)*wD;off+=(0-off)*wD;
  const wM=_biomeW(f.b1-0.25);
  amp+=(4-amp)*wM;off+=(2-off)*wM;
  const wS=_biomeW(f.bs-0.22);
  amp+=(2.5-amp)*wS;off+=(0.5-off)*wS;
  const wV=_biomeW(f.bv-0.15);
  amp+=(3.5-amp)*wV;off+=(1.5-off)*wV;
  const wSw=_biomeW(Math.min(f.s-0.30,f.o+0.18));                 // SWAMP: 陸から湿地へ浅く遷移
  amp+=(.6-amp)*wSw;off+=(0-off)*wSw;
  const wO=_biomeW(f.o-0.10);                                     // OCEAN: 海岸はブレンド、沖は深く
  const trench=fbm(wx*.018-1200,wz*.018+1200,3)*1.8;
  amp+=(2.2-amp)*wO;off+=(-4+trench-off)*wO;
  const wMi=_mushroomIslandMask(wx,wz)?1:0;                        // 島単位で明確に分離
  if(wMi){const dome=Math.max(0,1-Math.abs(noiseV(wx*.01+1700,wz*.01-1700)))*1.4; amp=1.2;off=2.5+dome;}
  return Math.floor(n*amp+off+roll+1);
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
  if(ti===WATER_BLOCK||ti===TORCH_BLOCK||ti===GLASS_BLOCK||ti===TNT_BLOCK||ti===DIVINE_GLASS){
    const geo=ti===WATER_BLOCK?waterGeo:ti===TORCH_BLOCK?torchGeo:(ti===GLASS_BLOCK||ti===DIVINE_GLASS)?glassGeo:boxGeo;
    const m=new THREE.Mesh(geo,blockMats[ti]);
    m.position.set(x+.5,y+.5,z+.5);
    m.castShadow=ti===TNT_BLOCK;m.receiveShadow=ti!==TORCH_BLOCK;
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
  if(ti===TNT_BLOCK&&typeof onTNTBlockAdded==='function')onTNTBlockAdded(k,v);
  return k;
}
function removeBlock(x,y,z){
  const k=vKey(x,y,z);const v=voxels[k];if(!v)return;
  if(v.ti===TNT_BLOCK&&typeof onTNTBlockRemoved==='function')onTNTBlockRemoved(k,v);
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

function _growSwampTree(wx,h,wz,meshes){
  _growTree(wx,h,wz,3+Math.floor(rand2(wx,wz,160)*2),meshes);
  // ツタは葉の下に葉ブロックを垂らす軽量表現。個数は乱数で抑制する。
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(rand2(wx+dx,wz+dz,161)<.45){const m=addBlock(wx+dx,h+2,wz+dz,LEAF_BLOCK,false);if(m)meshes.add(m);}
}
function _growGiantMushroom(wx,h,wz,meshes){
  const stem=3+Math.floor(rand2(wx,wz,170)*3),r=1+Math.floor(rand2(wx,wz,171)*2);
  for(let y=1;y<=stem;y++){const m=addBlock(wx,h+y,wz,CAVE_DIRT,false);if(m)meshes.add(m);}
  for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)if(Math.abs(dx)+Math.abs(dz)<=r+1){const m=addBlock(wx+dx,h+stem,wz+dz,MUSHROOM_BLOCK,false);if(m)meshes.add(m);}
  const top=addBlock(wx,h+stem+1,wz,MUSHROOM_BLOCK,false);if(top)meshes.add(top);
}
function _seabedType(wx,wz,h){const r=rand2(wx,wz,180);if(r<.45)return 2;if(r<.62)return CLAY_BLOCK;if(r<.82)return CAVE_DIRT;return h<-3?1:6;}
function _placeAquaticDecor(wx,h,wz,biome,meshes){
  if(biome===BIOMES.OCEAN){
    if(rand2(wx,wz,181)<.018){const mh=addBlock(wx,h+1,wz,LEAF_BLOCK,false);if(mh)meshes.add(mh);} // 海藻
    if(rand2(wx,wz,182)<.008){const mc=addBlock(wx,h+1,wz,CRYSTAL_BLOCK,false);if(mc)meshes.add(mc);} // サンゴ風
    if(rand2(wx,wz,183)<.010){const mr=addBlock(wx,h+1,wz,6,false);if(mr)meshes.add(mr);} // 海底岩
    // shipwreckHook / underwaterRuinHook は BIOME_DEFS.structures に登録済み。重い構造生成は次段階で接続する。
  }else if(biome===BIOMES.SWAMP){
    if(rand2(wx,wz,184)<.030){const ml=addBlock(wx,SWAMP_WATER_LEVEL+1,wz,LEAF_BLOCK,false);if(ml)meshes.add(ml);} // 蓮・水草
  }
}
function _growTree(wx,h,wz,th,meshes){
  if(wx*wx+wz*wz<=16)return; // keep the first view around world spawn open
  for(let t=1;t<=th;t++){const m=addBlock(wx,h+t,wz,3,false);if(m)meshes.add(m);}
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
    if(dx!==0||dz!==0){const m=addBlock(wx+dx,h+th,wz+dz,LEAF_BLOCK,false);if(m)meshes.add(m);}
    if(Math.abs(dx)+Math.abs(dz)<=1){const m=addBlock(wx+dx,h+th+1,wz+dz,LEAF_BLOCK,false);if(m)meshes.add(m);}
  }
}
function generateChunk(cx,cz){
  const key=cKey(cx,cz);if(chunks[key])return;
  weMarkChunkGenerated(cx,cz); // 新規生成列を記録 → applyWorldEdits がこの列だけ再生する
  const meshes=new Set(),ox=cx*CHUNK,oz=cz*CHUNK;
  // ☢ ツァーリ・ボンバ 永久破壊領域: このチャンクと交差する領域だけを先に
  // 索引で絞り込む（交差しないチャンクは以下の zoneCut/zoneAny が常に false を
  // 即返すだけで追加コストゼロ）。solidAt に組み込むことで、クレーターの
  // 内側は「地形が無い」ものとして生成され、外側の生き残ったブロックは
  // 「露出面」として正しく実体化する＝チャンク境界に段差や孤立voxelができない。
  const _tzZones=(typeof tsarMatchedZonesForChunk==='function')?tsarMatchedZonesForChunk(cx,cz):null;
  const zoneAny=_tzZones?(x,y,z)=>_tsarZonesRemoveAny(x,y,z,_tzZones):null;
  // per-generation caches: neighbour exposure tests hit the same cells often
  const colCache=new Map(),solidCache=new Map();
  const colAt=(x,z)=>{
    const k=x+'|'+z;let c=colCache.get(k);
    if(!c){
      const h=getHeight(x,z),biome=getBiome(x,z);
      const lakeN=noise(x*.05+777,z*.05+777);
      const wet=biome===BIOMES.OCEAN||biome===BIOMES.SWAMP;
      const lake=!wet&&((biome===BIOMES.PLAINS&&h===0&&lakeN>0.25)||(biome===BIOMES.FOREST&&h===0&&lakeN>0.45));
      const waterY=BIOME_DEFS[biome].waterLevel;
      c={h,biome,lake,waterY,tint:null};colCache.set(k,c);
    }
    return c;
  };
  // grass tint, memoized per column; reuses colAt so overlapping blend
  // samples between neighbouring columns cost no extra noise calls
  const tintAt=(x,z)=>{const c=colAt(x,z);return c.tint||(c.tint=computeGrassTint(x,z,(xx,zz)=>colAt(xx,zz).biome));};
  // is a surface cell solid? (lakes keep their bed and are never carved)
  const solidAt=(x,y,z)=>{
    if(y<0){let s=isUnderSolid(x,y,z);if(s&&zoneAny&&zoneAny(x,y,z))s=false;return s;}
    const k=x+'|'+y+'|'+z;const hit=solidCache.get(k);
    if(hit!==undefined)return hit;
    const c=colAt(x,z);let s;
    if(c.lake)s=y<=c.h-1;
    else if(c.biome===BIOMES.OCEAN||c.biome===BIOMES.SWAMP)s=y<=c.h;
    else if(y>c.h)s=false;
    else if(_caveMouth(x,y,z))s=false;
    else if((c.biome===BIOMES.MOUNTAIN||c.biome===BIOMES.VOLCANO)&&y>=1&&y<c.h&&_cliffCarve(x,y,z))s=false;
    else s=true;
    if(s&&zoneAny&&zoneAny(x,y,z))s=false; // ☢ 永久破壊領域の内側は地形なし扱い
    solidCache.set(k,s);return s;
  };
  for(let lx=0;lx<CHUNK;lx++)for(let lz=0;lz<CHUNK;lz++){
    const wx=ox+lx,wz=oz+lz;
    const ci=colAt(wx,wz),h=ci.h,biome=ci.biome;
    // lakes carve one block down: sandy bed below, water in the ground cell,
    // so the surface sits lower than the surrounding land (Minecraft-style)
    if(ci.lake){
      // ☢ 永久破壊領域: 湖の水/湖底も露出判定を通らない一括生成なので個別に判定する
      if(!zoneAny||!zoneAny(wx,h-1,wz)){const mb=addBlock(wx,h-1,wz,2,false);if(mb)meshes.add(mb);}
      if(!zoneAny||!zoneAny(wx,h,wz)){const mw=addBlock(wx,h,wz,WATER_BLOCK,false);if(mw)meshes.add(mw);}
      continue;
    }
    if((biome===BIOMES.OCEAN||biome===BIOMES.SWAMP)&&ci.waterY!=null){
      const bedTi=biome===BIOMES.OCEAN?_seabedType(wx,wz,h):(rand2(wx,wz,185)<.45?CLAY_BLOCK:rand2(wx,wz,186)<.72?CAVE_DIRT:0);
      if(!zoneAny||!zoneAny(wx,h,wz)){const mb=addBlock(wx,h,wz,bedTi,false);if(mb)meshes.add(mb);}
      for(let wy=h+1;wy<=ci.waterY;wy++){if(zoneAny&&zoneAny(wx,wy,wz))continue;const mw=addBlock(wx,wy,wz,WATER_BLOCK,false);if(mw)meshes.add(mw);}
      if(!zoneAny||!zoneAny(wx,h+1,wz)){
        _placeAquaticDecor(wx,h,wz,biome,meshes);
        if(biome===BIOMES.SWAMP&&h>=ci.waterY&&rand2(wx,wz,187)<.035)_growSwampTree(wx,h,wz,meshes);
      }
      continue;
    }
    const sub=biome===BIOMES.VOLCANO?7:biome===BIOMES.SNOW?SNOW_BLOCK:biome===BIOMES.MUSHROOM_ISLAND?CAVE_DIRT:1;
    const deepTi=biome===BIOMES.MOUNTAIN?6:biome===BIOMES.VOLCANO?7:1;
    // full-column pass: only exposed solid cells become meshes, so cliff
    // faces, overhang undersides and cave-mouth walls all get real blocks
    for(let y=Math.min(0,h);y<=h;y++){
      if(!solidAt(wx,y,wz))continue;
      const exposed=
        !solidAt(wx+1,y,wz)||!solidAt(wx-1,y,wz)||
        !solidAt(wx,y,wz+1)||!solidAt(wx,y,wz-1)||
        !solidAt(wx,y+1,wz)||!solidAt(wx,y-1,wz);
      if(!exposed)continue;
      const ti=y===h?getGroundType(biome):y===h-1?sub:deepTi;
      const m=addBlock(wx,y,wz,ti,false);if(m){meshes.add(m);if(ti===0||ti===5||biome===BIOMES.SWAMP||biome===BIOMES.MUSHROOM_ISLAND)voxels[m].tint=tintAt(wx,wz);}
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
    if(biome===BIOMES.SWAMP){if(rand2(wx,wz,60)<0.05)_growSwampTree(wx,h,wz,meshes);if(rand2(wx,wz,61)<0.03){const mm=addBlock(wx,h+1,wz,MUSHROOM_BLOCK,false);if(mm)meshes.add(mm);}if(rand2(wx,wz,62)<0.018){const md=addBlock(wx,h+1,wz,3,false);if(md)meshes.add(md);}}
    if(biome===BIOMES.MUSHROOM_ISLAND){if(rand2(wx,wz,70)<0.035)_growGiantMushroom(wx,h,wz,meshes);if(rand2(wx,wz,71)<0.08){const mm=addBlock(wx,h+1,wz,MUSHROOM_BLOCK,false);if(mm)meshes.add(mm);}if(rand2(wx,wz,72)<0.018){const mq=addBlock(wx,h+1,wz,CRYSTAL_BLOCK,false);if(mq)meshes.add(mq);}}
  }
  _spawnSurfaceStructures(cx,cz,meshes);
  if(typeof maybeGenerateVillageForChunk==='function')maybeGenerateVillageForChunk(cx,cz,meshes);
  // ☢ 永久破壊領域: 構造物/村は solidAt を経由しない直接配置なので、露出判定とは
  // 別に最後の掃除パスで領域内に落ちたぶんだけ取り除く（このチャンクの新規voxelの
  // 個数だけを見る軽い後始末で、まだシーンに追加されていないので removeBlock不要）
  if(zoneAny){
    for(const k of meshes){
      const v=voxels[k];if(!v)continue;
      const p=k.split('|'),x=+p[0],y=+p[1],z=+p[2];
      if(zoneAny(x,y,z)){delete worldEdits.placed[k];delete worldEdits.removed[k];delete voxels[k];meshes.delete(k);}
    }
  }
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
    if(!chunks[cKey(cx,cz)]){generateChunk(cx,cz);wfMaybeSpawnNearChunk(cx,cz);grew=true;}
    if(!underChunks[ucKey(cx,-1,cz)]){generateUnderChunk(cx,-1,cz);grew=true;}
    if(P.y<0){for(let dy=0;dy<=DRAW_RY;dy++){const cy=pcy-dy;if(cy>=-1||cy<WORLD_CY_MIN)continue;if(!underChunks[ucKey(cx,cy,cz)]){generateUnderChunk(cx,cy,cz);grew=true;}}}
  }
  // 🏛 封印された地底都市: 都市の範囲だけは全階層を生成する（天井・建物上部の欠け防止）
  if(P.y<0&&_sucEnsureChunks(pcx,pcz))grew=true;
  // 🌊 海底に沈んだ王都: 海面越しに上から見えるため、地上にいても深部チャンクを生成する
  if(_srcEnsureChunks(pcx,pcz))grew=true;
  // pass 2: build (lazily inside show) + show
  for(const[cx,cz]of list){
    needed[cKey(cx,cz)]=true;showChunk(cx,cz);
    neededU[ucKey(cx,-1,cz)]=true;showUnderChunk(cx,-1,cz);
    if(P.y<0){for(let dy=0;dy<=DRAW_RY;dy++){const cy=pcy-dy;if(cy>=-1||cy<WORLD_CY_MIN)continue;neededU[ucKey(cx,cy,cz)]=true;showUnderChunk(cx,cy,cz);}}
  }
  // 🏛 封印された地底都市: 都市の範囲だけは全階層を表示する
  if(P.y<0)_sucShowChunks(neededU,pcx,pcz);
  // 🌊 海底に沈んだ王都: 都市の範囲の深部チャンクは地上からも常に表示する
  _srcShowChunks(neededU,pcx,pcz);
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
// scene からチャンクの全メッシュ(本体+特殊メッシュ)を外して破棄するだけの下請け。
// clearWorld()（新規ゲーム/セーブロード用: 構造物の状態もリセットする）と
// dimensions.js のディメンション退出処理（構造物の状態はリセットしない）の
// 両方から呼ばれる。
function _disposeAllChunks(){
  const drop=(rec)=>{scene.remove(rec.solidMesh);rec.solidMesh.geometry.dispose();for(const m of rec.specials)scene.remove(m);};
  for(const key in chunks)drop(chunks[key]);
  for(const key in underChunks)drop(underChunks[key]);
  chunks={};activeChunks={};underChunks={};activeUnderChunks={};voxels={};lavaBlocks.clear();torchBlocks.clear();_dirtyRecs.clear();lastPCX=null;lastPCZ=null;lastPCY=null;
}
function clearWorld(){
  resetFrozenVillage(); // ⏳ 時間が止まった村の静止メッシュ（矢・炎・グロー）も一緒に破棄
  resetUndergroundCity(); // 🏛 封印された地底都市の演出メッシュと状態も破棄
  resetCollapsingSkyCity(); // ☁ 崩れかけの天空都市の輪・遠景演出と状態も破棄
  resetSunkenRoyalCity(); // 🌊 海底に沈んだ王都の海面メッシュと状態も破棄
  resetProceduralDungeon(); // 🗝 自動生成ダンジョンの進行状態も破棄
  _disposeAllChunks();
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
  weMarkChunkGenerated(cx,cz); // 地下層の生成でも列を記録（y<0 の編集を再生するため）
  const meshes=new Set(),ox=cx*CHUNK,oy=cy*CHUNK_Y,oz=cz*CHUNK;
  const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  // ☢ ツァーリ・ボンバ 永久破壊領域: generateChunk と同じ考え方で、露出判定にも
  // 領域を「空洞」として組み込む（solidU）。交差する領域が無いチャンクは
  // isUnderSolid をそのまま使うので追加コストが無い。
  const _tzZones=(typeof tsarMatchedZonesForChunk==='function')?tsarMatchedZonesForChunk(cx,cz):null;
  const zoneAny=_tzZones?(x,y,z)=>_tsarZonesRemoveAny(x,y,z,_tzZones):null;
  const solidU=zoneAny?(x,y,z)=>isUnderSolid(x,y,z)&&!zoneAny(x,y,z):isUnderSolid;
  for(let lx=0;lx<CHUNK;lx++)for(let lz=0;lz<CHUNK;lz++)for(let ly=0;ly<CHUNK_Y;ly++){
    const wx=ox+lx,wy=oy+ly,wz=oz+lz;
    if(!solidU(wx,wy,wz))continue; // cave air (or ☢ crater void)
    if(!dirs.some(([dx,dy,dz])=>!solidU(wx+dx,wy+dy,wz+dz)))continue; // fully interior
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
  // ☢ 永久破壊領域: 地下部屋(宝箱の柱等)も直接配置なので同じ後始末を行う
  if(zoneAny){
    for(const k of meshes){
      const v=voxels[k];if(!v)continue;
      const p=k.split('|'),x=+p[0],y=+p[1],z=+p[2];
      if(zoneAny(x,y,z)){delete worldEdits.placed[k];delete worldEdits.removed[k];delete voxels[k];meshes.delete(k);}
    }
  }
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
