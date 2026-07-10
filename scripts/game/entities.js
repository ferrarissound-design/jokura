// ============================================================================
// jokura / entities.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、下記の順序で <script> として読み込まれ、すべて同一のグローバル
// スコープを共有する（元は単一の boot() 関数だったため、この順序と共有スコープが前提）。
// 読み込み順: state → achievements → crafting → save → ui → audio → world →
//             combat → entities → hud → input → main
// ============================================================================

// ═══ ITEMS ═══
let items=[];
const ITEM_DEFS=[
  {name:'❤ HP薬',  type:'hp',    value:25,color:0xff4444},
  {name:'⚔ Sword', type:'weapon',wi:1,   color:0x44aaff},
  {name:'🔨 Hammer',type:'weapon',wi:2,   color:0xaa44ff},
  {name:'🏹 Bow',   type:'weapon',wi:3,   color:0x44ff44},
  {name:'🪄 Magic', type:'weapon',wi:4,   color:0xff44ff},
  {name:'⭐ +Score',type:'score', value:30,color:0xffff00},
];
const itemGeo=new THREE.BoxGeometry(.35,.35,.35);
function dropItem(x,y,z,etype){
  if(Math.random()>(fullMoonNight?.65:.45))return; // 🌕満月の夜はドロップ率アップ
  const pool=ITEM_DEFS.filter(i=>i.type!=='weapon');
  const it=pool[Math.floor(Math.random()*pool.length)];
  const mat=new THREE.MeshBasicMaterial({color:it.color,transparent:true,opacity:.9});
  const m=new THREE.Mesh(itemGeo,mat);m.position.set(x,y+.5,z);scene.add(m);
  items.push({mesh:m,mat,info:it,x,y:y+.5,z,time:0});
}

// ☄ 隕石落下の戦利品: 着弾地点にランダムな素材アイテムをばらまく（重み付き抽選）
const METEOR_LOOT_DEFS=[
  {name:'🔶 隕石の鉄鉱石',   key:'ironOre',   value:2,color:0xcaa472,weight:35},
  {name:'💎 隕石のダイヤ',   key:'diamond',   value:1,color:0x3fe0ff,weight:20},
  {name:'🔮 隕石の水晶',     key:'crystal',   value:2,color:0xcc66ff,weight:20},
  {name:'⬛ 隕石の黒曜石',   key:'obsidian',  value:2,color:0x30105a,weight:18},
  {name:'💠 隕石のドラゴンコア',key:'dragonCore',value:1,color:0x00e5ff,weight:7},
];
function _pickWeighted(pool){
  const total=pool.reduce((s,p)=>s+p.weight,0);let r=Math.random()*total;
  for(const p of pool){if((r-=p.weight)<=0)return p;}
  return pool[pool.length-1];
}
function spawnMeteorLoot(x,y,z){
  const n=2+Math.floor(Math.random()*2);
  for(let i=0;i<n;i++){
    const def=_pickWeighted(METEOR_LOOT_DEFS);
    const mat=new THREE.MeshBasicMaterial({color:def.color,transparent:true,opacity:.9});
    const ox=(Math.random()-.5)*1.6,oz=(Math.random()-.5)*1.6;
    const m=new THREE.Mesh(itemGeo,mat);m.position.set(x+ox,y,z+oz);scene.add(m);
    items.push({mesh:m,mat,info:{type:'mat',key:def.key,value:def.value,name:def.name},x:x+ox,y,z:z+oz,time:0});
  }
}

// ═══ CHESTS ═══
let chests=[];
let chestCount=0;
const $chestLabel=document.getElementById('invChest');
function updateChestHUD(){if($chestLabel)$chestLabel.textContent='📦 CHEST: '+chestCount;}
const $chestInfo=document.getElementById('chestInfo');
function updateChestInfo(){
  if(!gs.running||chests.length===0){$chestInfo.classList.remove('show');return;}
  let nearest=null,nearDist=99;
  for(const c of chests){const dx=c.x+.5-P.x,dz=c.z+.5-P.z,dy=c.y+.35-(P.y+.8);const d=Math.hypot(dx,dy,dz);if(d<2.5&&d<nearDist){nearDist=d;nearest=c;}}
  if(!nearest){$chestInfo.classList.remove('show');return;}
  const ct=nearest.contents;const parts=[];
  if(ct.wood>0)parts.push('🪵'+ct.wood);if(ct.stone>0)parts.push('🪨'+ct.stone);
  if(ct.sand>0)parts.push('🏖'+ct.sand);if(ct.grass>0)parts.push('🌿'+ct.grass);
  if(ct.brick>0)parts.push('🧱'+ct.brick);if(ct.meat>0)parts.push('🥩'+ct.meat);
  $chestInfo.textContent=parts.length?'📦 '+parts.join(' '):'📦 空';
  $chestInfo.classList.add('show');
}

const _chestGeo=new THREE.BoxGeometry(.9,.7,.7);
const _chestMatBody=new THREE.MeshStandardMaterial({color:0x6d3a1e,roughness:.85});
const _chestMatLid=new THREE.MeshStandardMaterial({color:0x8b4a25,roughness:.8});
const _chestMatLock=new THREE.MeshStandardMaterial({color:0xd4a96a,roughness:.4,metalness:.5});
function makeChestMesh(){
  const root=new THREE.Object3D();
  const body=new THREE.Mesh(_chestGeo,_chestMatBody.clone());body.position.y=.35;
  const lid=new THREE.Mesh(new THREE.BoxGeometry(.9,.2,.7),_chestMatLid.clone());lid.position.y=.75;
  const lock=new THREE.Mesh(new THREE.BoxGeometry(.14,.14,.08),_chestMatLock.clone());lock.position.set(0,.72,.36);
  const lineM=new THREE.MeshBasicMaterial({color:0x4a2510});
  const lh=new THREE.Mesh(new THREE.BoxGeometry(.92,.06,.72),lineM);lh.position.y=.52;
  root.add(body,lid,lock,lh);markShadowCaster(root);return root;
}
function placeChest(){
  if(!gs.running)return;if(chestCount<=0){showBonus('チェストがない！');return;}
  const bh=castVoxel();if(!bh)return;
  const n={x:bh.nx,y:bh.ny,z:bh.nz},d=bh;
  const px=d.x+Math.round(n.x),py=d.y+Math.round(n.y),pz=d.z+Math.round(n.z);
  for(const c of chests){if(Math.floor(c.x)===px&&Math.floor(c.y)===py&&Math.floor(c.z)===pz)return;}
  if(px<P.x+.45&&px+1>P.x-.45&&py<P.y+1.75&&py+1>P.y&&pz<P.z+.45&&pz+1>P.z-.45)return;
  const mesh=makeChestMesh();mesh.position.set(px+.5,py,pz+.5);scene.add(mesh);
  chestCount--;chests.push({mesh,x:px,y:py,z:pz,contents:{wood:0,stone:0,sand:0,grass:0,brick:0,meat:0}});
  updateChestHUD();sfxPlace();showBonus('📦 チェスト設置！');unlockAchievement('firstBase');
}
function interactChest(){
  if(!gs.running)return;
  let nearest=null,nearDist=2.2;
  for(const c of chests){const dx=c.x+.5-P.x,dz=c.z+.5-P.z,dy=c.y+.35-(P.y+.8);const dist=Math.hypot(dx,dy,dz);if(dist<nearDist){nearDist=dist;nearest=c;}}
  if(!nearest)return;
  const hasContents=Object.values(nearest.contents).some(v=>v>0);
  if(!hasContents){
    nearest.contents.wood+=inv.wood;nearest.contents.stone+=inv.stone;nearest.contents.sand+=inv.sand;
    nearest.contents.grass+=inv.grass;nearest.contents.brick+=inv.brick;nearest.contents.meat+=meat;
    inv.wood=0;inv.stone=0;inv.sand=0;inv.grass=0;inv.brick=0;meat=0;
    updateInvHUD();updateMeatHUD();showBonus('📦 預けた');playTone(600,.1,.1,'sine');
  } else {
    inv.wood+=nearest.contents.wood;inv.stone+=nearest.contents.stone;inv.sand+=nearest.contents.sand;
    inv.grass+=nearest.contents.grass;inv.brick+=nearest.contents.brick;meat+=nearest.contents.meat;
    nearest.contents={wood:0,stone:0,sand:0,grass:0,brick:0,meat:0};
    updateInvHUD();updateMeatHUD();showBonus('📦 取り出した');playTone(800,.1,.1,'sine');
  }
}
function resetChests(){for(const c of chests)scene.remove(c.mesh);chests=[];chestCount=0;updateChestHUD();}

// ═══ BEDS ═══
let beds=[];
let bedCount=0;
const $bedLabel=document.getElementById('invBed');
function updateBedHUD(){if($bedLabel)$bedLabel.textContent='🛏 BED: '+bedCount;}

const _bedGeos={
  base:new THREE.BoxGeometry(1.0,.3,1.8),mat:new THREE.BoxGeometry(.98,.25,1.75),
  pillow:new THREE.BoxGeometry(.7,.18,.45),leg:new THREE.BoxGeometry(.12,.25,.12),
};
const _bedMats={
  wood:new THREE.MeshStandardMaterial({color:0x6d3a1e,roughness:.85}),
  sheet:new THREE.MeshStandardMaterial({color:0xeeeeff,roughness:.9}),
  pillow:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8}),
};
function makeBedMesh(){
  const root=new THREE.Object3D();
  const base=new THREE.Mesh(_bedGeos.base,_bedMats.wood.clone());base.position.y=.15;
  const mat=new THREE.Mesh(_bedGeos.mat,_bedMats.sheet.clone());mat.position.y=.31;
  const pillow=new THREE.Mesh(_bedGeos.pillow,_bedMats.pillow.clone());pillow.position.set(0,.42,.62);
  const legPos=[[-0.42,-.12,.82],[.42,-.12,.82],[-.42,-.12,-.82],[.42,-.12,-.82]];
  const legs=legPos.map(([x,y,z])=>{const l=new THREE.Mesh(_bedGeos.leg,_bedMats.wood.clone());l.position.set(x,y,z);return l;});
  root.add(base,mat,pillow,...legs);markShadowCaster(root);return root;
}
function placeBed(){
  if(!gs.running)return;if(bedCount<=0){showBonus('ベッドがない！');return;}
  const bh=castVoxel();if(!bh)return;
  const n={x:bh.nx,y:bh.ny,z:bh.nz},d=bh;
  const px=d.x+Math.round(n.x),py=d.y+Math.round(n.y),pz=d.z+Math.round(n.z);
  for(const b of beds){if(Math.floor(b.x)===px&&Math.floor(b.y)===py&&Math.floor(b.z)===pz)return;}
  if(px<P.x+.45&&px+1>P.x-.45&&py<P.y+1.75&&py+1>P.y&&pz<P.z+.45&&pz+1.8>P.z-.45)return;
  const mesh=makeBedMesh();mesh.position.set(px+.5,py,pz+.9);scene.add(mesh);
  bedCount--;beds.push({mesh,x:px,y:py,z:pz});
  updateBedHUD();sfxPlace();showBonus('🛏 ベッド設置！');unlockAchievement('firstBase');
}
function sleepBed(){
  if(!gs.running)return;
  let nearest=null,nearDist=2.5;
  for(const b of beds){
    const dx=b.x+.5-P.x,dz=b.z+.9-P.z,dy=b.y+.3-(P.y+.8);
    const dist=Math.hypot(dx,dy,dz);
    if(dist<nearDist){nearDist=dist;nearest=b;}
  }
  if(!nearest)return;
  // 夜だけ眠れる：gs.time 0.4〜0.9 が夜
  const isNight=(gs.time>=0.4&&gs.time<=0.9);
  if(!isNight){
    showBonus('☀ まだ眠る時間じゃない');
    playTone(300,.1,.08,'sine');
    return;
  }
  if(boss||enemies.some(e=>Math.hypot(e.root.position.x-P.x,e.root.position.z-P.z)<12)){
    showBonus('⚠ 近くに敵がいて眠れない！');
    playTone(200,.15,.1,'sawtooth');
    return;
  }
  gs.time=0.05;
  gs.day++;
  P.hp=Math.min(P.maxHp,P.hp+40);
  gs.nextWave=Math.max(gs.nextWave,20);
  showAlert('🌅 朝になった  DAY '+gs.day);
  showBonus('🛏 HP回復 +40');
  playTone(440,.2,.1,'sine');
  setTimeout(()=>playTone(550,.2,.08,'sine'),150);
  setTimeout(()=>playTone(660,.3,.07,'sine'),300);
}
function resetBeds(){for(const b of beds)scene.remove(b.mesh);beds=[];bedCount=0;updateBedHUD();}

let trophies=[];
let trophyCount=0;
const $trophyLabel=document.getElementById('invTrophy');
function updateTrophyHUD(){if($trophyLabel)$trophyLabel.textContent='🏆 DRAGON STATUE: '+trophyCount;}
function makeTrophyMesh(){
  const root=new THREE.Object3D();
  const bMat=new THREE.MeshStandardMaterial({color:0x1b2838,roughness:.3,emissive:0x001525,emissiveIntensity:.6});
  const cMat=new THREE.MeshStandardMaterial({color:0x00b4d8,emissive:0x00e5ff,emissiveIntensity:1.4,roughness:.1});
  const pedMat=new THREE.MeshStandardMaterial({color:0x2a2e3d,roughness:.75});
  const ped=new THREE.Mesh(new THREE.BoxGeometry(.7,.14,.7),pedMat);ped.position.y=.07;
  const body=new THREE.Mesh(new THREE.BoxGeometry(.34,.38,.28),bMat.clone());body.position.y=.34;
  const head=new THREE.Mesh(new THREE.BoxGeometry(.19,.17,.21),bMat.clone());head.position.set(0,.60,.05);
  const snout=new THREE.Mesh(new THREE.BoxGeometry(.12,.1,.14),bMat.clone());snout.position.set(0,.57,.19);
  const wingL=new THREE.Mesh(new THREE.BoxGeometry(.07,.26,.20),cMat.clone());wingL.position.set(-.27,.44,0);wingL.rotation.z=.38;
  const wingR=new THREE.Mesh(new THREE.BoxGeometry(.07,.26,.20),cMat.clone());wingR.position.set(.27,.44,0);wingR.rotation.z=-.38;
  const core=new THREE.Mesh(new THREE.OctahedronGeometry(.09,0),cMat.clone());core.position.set(0,.37,.16);
  root.add(ped,body,head,snout,wingL,wingR,core);
  markShadowCaster(root);
  return root;
}
function placeTrophy(){
  if(!gs.running)return;if(trophyCount<=0){showBonus('ドラゴン像がない！クラフトしよう');return;}
  const bh=castVoxel();if(!bh)return;
  const n={x:bh.nx,y:bh.ny,z:bh.nz},d=bh;
  const px=d.x+Math.round(n.x),py=d.y+Math.round(n.y),pz=d.z+Math.round(n.z);
  for(const t of trophies){if(Math.floor(t.x)===px&&Math.floor(t.y)===py&&Math.floor(t.z)===pz)return;}
  if(px<P.x+.4&&px+1>P.x-.4&&py<P.y+1.75&&py+1>P.y&&pz<P.z+.4&&pz+1>P.z-.4)return;
  const mesh=makeTrophyMesh();mesh.position.set(px+.5,py,pz+.5);scene.add(mesh);
  trophyCount--;trophies.push({mesh,x:px,y:py,z:pz});
  updateTrophyHUD();sfxPlace();showBonus('🏆 ドラゴン像を設置した！');
}
function resetTrophies(){for(const t of trophies)scene.remove(t.mesh);trophies=[];trophyCount=0;updateTrophyHUD();}

// ═══ 強化台（エンチャントテーブル） ═══
// チェスト等と同じ設置型家具。近くでクラフトパネルを開くと武器強化メニューが出る。
let enchTables=[];
let enchTableCount=0;
const $enchTableLabel=document.getElementById('invEnchantTable');
function updateEnchTableHUD(){if($enchTableLabel)$enchTableLabel.textContent='⚒ ENCHANT TABLE: '+enchTableCount;}
function makeEnchTableMesh(){
  const root=new THREE.Object3D();
  const baseMat=new THREE.MeshStandardMaterial({color:0x2a2e3d,roughness:.7});
  const topMat=new THREE.MeshStandardMaterial({color:0x1b2838,roughness:.3,emissive:0x7a3bd6,emissiveIntensity:.7});
  const gemMat=new THREE.MeshStandardMaterial({color:0xb388ff,emissive:0xaa66ff,emissiveIntensity:1.6,roughness:.1});
  const base=new THREE.Mesh(new THREE.BoxGeometry(.85,.55,.85),baseMat);base.position.y=.28;
  const top=new THREE.Mesh(new THREE.BoxGeometry(.95,.16,.95),topMat);top.position.y=.63;
  const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.14,0),gemMat);gem.position.y=.92;
  root.add(base,top,gem);markShadowCaster(root);return root;
}
function placeEnchTable(){
  if(!gs.running)return;if(enchTableCount<=0){showBonus('強化台がない！クラフトしよう');return;}
  const bh=castVoxel();if(!bh)return;
  const n={x:bh.nx,y:bh.ny,z:bh.nz},d=bh;
  const px=d.x+Math.round(n.x),py=d.y+Math.round(n.y),pz=d.z+Math.round(n.z);
  for(const t of enchTables){if(Math.floor(t.x)===px&&Math.floor(t.y)===py&&Math.floor(t.z)===pz)return;}
  if(px<P.x+.45&&px+1>P.x-.45&&py<P.y+1.75&&py+1>P.y&&pz<P.z+.45&&pz+1>P.z-.45)return;
  const mesh=makeEnchTableMesh();mesh.position.set(px+.5,py,pz+.5);scene.add(mesh);
  enchTableCount--;enchTables.push({mesh,x:px,y:py,z:pz});
  updateEnchTableHUD();sfxPlace();showBonus('⚒ 強化台設置！近くでCRAFTを開くと強化できる');
}
function _enchTableNearby(){return enchTables.some(t=>{const dx=t.x+.5-P.x,dz=t.z+.5-P.z,dy=t.y+.5-(P.y+.8);return Math.hypot(dx,dy,dz)<3.2;});}
function resetEnchTables(){for(const t of enchTables)scene.remove(t.mesh);enchTables=[];enchTableCount=0;updateEnchTableHUD();}

// ═══ かまど（精錬台） ═══
// 強化台と同じ設置型家具。近くでクラフトパネルを開くと精錬メニューが出る。
let furnaces=[];
let furnaceCount=0;
const $furnaceLabel=document.getElementById('invFurnace');
function updateFurnaceHUD(){if($furnaceLabel)$furnaceLabel.textContent='🔥 FURNACE: '+furnaceCount;}
function makeFurnaceMesh(){
  const root=new THREE.Object3D();
  const stoneMat=new THREE.MeshStandardMaterial({color:0x6f7680,roughness:.9});
  const darkMat=new THREE.MeshStandardMaterial({color:0x1c1c22,roughness:.95});
  const emberMat=new THREE.MeshStandardMaterial({color:0xff5a1e,emissive:0xff6a22,emissiveIntensity:1.5,roughness:.4});
  const body=new THREE.Mesh(new THREE.BoxGeometry(.9,.9,.9),stoneMat);body.position.y=.45;
  const mouth=new THREE.Mesh(new THREE.BoxGeometry(.5,.34,.1),darkMat);mouth.position.set(0,.3,.43);
  const ember=new THREE.Mesh(new THREE.BoxGeometry(.34,.14,.06),emberMat);ember.position.set(0,.22,.45);
  const top=new THREE.Mesh(new THREE.BoxGeometry(.96,.1,.96),darkMat.clone());top.position.y=.95;
  root.add(body,mouth,ember,top);markShadowCaster(root);return root;
}
function placeFurnace(){
  if(!gs.running)return;if(furnaceCount<=0){showBonus('かまどがない！クラフトしよう');return;}
  const bh=castVoxel();if(!bh)return;
  const n={x:bh.nx,y:bh.ny,z:bh.nz},d=bh;
  const px=d.x+Math.round(n.x),py=d.y+Math.round(n.y),pz=d.z+Math.round(n.z);
  for(const f of furnaces){if(Math.floor(f.x)===px&&Math.floor(f.y)===py&&Math.floor(f.z)===pz)return;}
  if(px<P.x+.45&&px+1>P.x-.45&&py<P.y+1.75&&py+1>P.y&&pz<P.z+.45&&pz+1>P.z-.45)return;
  const mesh=makeFurnaceMesh();mesh.position.set(px+.5,py,pz+.5);scene.add(mesh);
  furnaceCount--;furnaces.push({mesh,x:px,y:py,z:pz});
  updateFurnaceHUD();sfxPlace();showBonus('🔥 かまど設置！近くでCRAFTを開くと精錬できる');
}
function _furnaceNearby(){return furnaces.some(f=>{const dx=f.x+.5-P.x,dz=f.z+.5-P.z,dy=f.y+.5-(P.y+.8);return Math.hypot(dx,dy,dz)<3.2;});}
function resetFurnaces(){for(const f of furnaces)scene.remove(f.mesh);furnaces=[];furnaceCount=0;updateFurnaceHUD();}

// ═══ FARMING（小麦畑） ═══
// 畑は草ブロックの上に設置する独立の装飾物（チェスト等と同じ扱い）。stage 0→1→2 で育ち、
// stage2（成熟）で収穫すると小麦とたまに種が手に入るが、畑自体は消えるので再度植える必要がある。
let farmPlots=[];
const CROP_STAGE_T=[20,45]; // 経過秒数のしきい値：stage1へ20秒、stage2（成熟）へ45秒
const _farmSoilGeo=new THREE.BoxGeometry(.94,.1,.94);
const _farmSoilMat=new THREE.MeshStandardMaterial({color:0x4a3320,roughness:.95});
const _cropStageGeos=[new THREE.BoxGeometry(.16,.22,.16),new THREE.BoxGeometry(.22,.42,.22),new THREE.BoxGeometry(.28,.62,.28)];
const _cropStageMats=[
  new THREE.MeshStandardMaterial({color:0x5fae3c,roughness:.85}),
  new THREE.MeshStandardMaterial({color:0x9dbb3a,roughness:.85}),
  new THREE.MeshStandardMaterial({color:0xe0c04a,roughness:.8,emissive:0x332200,emissiveIntensity:.15}),
];
function makeFarmMesh(stage){
  const root=new THREE.Object3D();
  const soil=new THREE.Mesh(_farmSoilGeo,_farmSoilMat.clone());soil.position.y=.05;
  const geo=_cropStageGeos[stage];
  const crop=new THREE.Mesh(geo,_cropStageMats[stage].clone());crop.position.y=.1+geo.parameters.height/2;
  root.add(soil,crop);markShadowCaster(root);return root;
}
function _cropNearby(){return farmPlots.some(f=>{if(f.stage<2)return false;const dx=f.x+.5-P.x,dz=f.z+.5-P.z,dy=f.y+.3-(P.y+.8);return Math.hypot(dx,dy,dz)<2.3;});}
function plantSeed(){
  if(!gs.running)return false;
  if(!isCreative()&&inv.seed<=0)return false;
  const bh=castVoxel();if(!bh)return false;
  if(!((bh.ti===0||bh.ti===5)&&bh.ny>0))return false; // 草ブロック(草原/森林)の上面を見ている場合のみ植えられる
  const px=bh.x,py=bh.y+1,pz=bh.z;
  for(const f of farmPlots){if(Math.floor(f.x)===px&&Math.floor(f.y)===py&&Math.floor(f.z)===pz)return false;}
  if(px<P.x+.4&&px+1>P.x-.4&&py<P.y+1.75&&py+1>P.y&&pz<P.z+.4&&pz+1>P.z-.4)return false;
  if(!isCreative())inv.seed--;
  const mesh=makeFarmMesh(0);mesh.position.set(px+.5,py,pz+.5);scene.add(mesh);
  farmPlots.push({mesh,x:px,y:py,z:pz,stage:0,growT:0});
  updateInvHUD();sfxPlace();showBonus('🌱 種を植えた！');
  return true;
}
function harvestNearestCrop(){
  let nearest=null,nd=2.3;
  for(const f of farmPlots){if(f.stage<2)continue;const dx=f.x+.5-P.x,dz=f.z+.5-P.z,dy=f.y+.3-(P.y+.8);const d=Math.hypot(dx,dy,dz);if(d<nd){nd=d;nearest=f;}}
  if(!nearest)return;
  scene.remove(nearest.mesh);
  const idx=farmPlots.indexOf(nearest);if(idx>=0)farmPlots.splice(idx,1);
  const wheat=2+Math.floor(Math.random()*3);
  inv.wheat+=wheat;
  const seedBack=Math.random()<0.6?1+Math.floor(Math.random()*2):0;
  if(seedBack>0)inv.seed+=seedBack;
  updateInvHUD();sfxPlace();showBonus('🌾 小麦×'+wheat+(seedBack?' / 🌱 種×'+seedBack:'')+' 収穫！');
  unlockAchievement('firstHarvest');
}
function updateFarmPlots(dt){
  for(const f of farmPlots){
    if(f.stage>=2)continue;
    f.growT+=dt;
    const nextStage=f.growT>=CROP_STAGE_T[1]?2:(f.growT>=CROP_STAGE_T[0]?1:0);
    if(nextStage!==f.stage){
      f.stage=nextStage;
      scene.remove(f.mesh);
      f.mesh=makeFarmMesh(f.stage);
      f.mesh.position.set(f.x+.5,f.y,f.z+.5);
      scene.add(f.mesh);
    }
  }
}
function resetFarmPlots(){for(const f of farmPlots)scene.remove(f.mesh);farmPlots=[];}

// ═══ MOBS（豚・羊・鶏） ═══
const mobs=[];const MAX_MOBS=15;let meat=0;
const _pigGeos={body:new THREE.BoxGeometry(.9,.65,.6),head:new THREE.BoxGeometry(.58,.52,.52),leg:new THREE.BoxGeometry(.2,.45,.2),nose:new THREE.BoxGeometry(.26,.18,.08),eye:new THREE.BoxGeometry(.09,.09,.05)};
const _pigMatBase={body:new THREE.MeshStandardMaterial({color:0xf4a9a8,roughness:.9}),leg:new THREE.MeshStandardMaterial({color:0xe8968f,roughness:.9}),nose:new THREE.MeshStandardMaterial({color:0xf08080,roughness:.8}),eye:new THREE.MeshBasicMaterial({color:0x111111})};
function makePigMesh(){
  const root=new THREE.Object3D();
  const body=new THREE.Mesh(_pigGeos.body,_pigMatBase.body.clone());body.position.y=.32;
  const head=new THREE.Mesh(_pigGeos.head,_pigMatBase.body.clone());head.position.set(0,.68,.34);
  const nose=new THREE.Mesh(_pigGeos.nose,_pigMatBase.nose.clone());nose.position.set(0,-.08,.27);head.add(nose);
  const eyeL=new THREE.Mesh(_pigGeos.eye,_pigMatBase.eye.clone());eyeL.position.set(-.16,.07,.27);head.add(eyeL);
  const eyeR=new THREE.Mesh(_pigGeos.eye,_pigMatBase.eye.clone());eyeR.position.set(.16,.07,.27);head.add(eyeR);
  const legPos=[[-.25,-.06,.16],[.25,-.06,.16],[-.25,-.06,-.16],[.25,-.06,-.16]];
  const legs=legPos.map(([x,y,z])=>{const l=new THREE.Mesh(_pigGeos.leg,_pigMatBase.leg.clone());l.position.set(x,y,z);return l;});
  root.add(body,head,...legs);return{root,body,head,legs};
}
const _sheepGeos={body:new THREE.BoxGeometry(.85,.55,.65),wool:new THREE.BoxGeometry(.98,.7,.78),head:new THREE.BoxGeometry(.4,.4,.42),leg:new THREE.BoxGeometry(.18,.4,.18),eye:new THREE.BoxGeometry(.07,.07,.04)};
const _sheepMatBase={wool:new THREE.MeshStandardMaterial({color:0xf4f4ec,roughness:1}),skin:new THREE.MeshStandardMaterial({color:0xe8c9a8,roughness:.85}),leg:new THREE.MeshStandardMaterial({color:0xcaa87e,roughness:.9}),eye:new THREE.MeshBasicMaterial({color:0x111111})};
function makeSheepMesh(){
  const root=new THREE.Object3D();
  const body=new THREE.Mesh(_sheepGeos.body,_sheepMatBase.skin.clone());body.position.y=.42;
  const wool=new THREE.Mesh(_sheepGeos.wool,_sheepMatBase.wool.clone());wool.position.y=.5;
  const head=new THREE.Mesh(_sheepGeos.head,_sheepMatBase.skin.clone());head.position.set(0,.58,.4);
  const eyeL=new THREE.Mesh(_sheepGeos.eye,_sheepMatBase.eye.clone());eyeL.position.set(-.12,.05,.21);head.add(eyeL);
  const eyeR=new THREE.Mesh(_sheepGeos.eye,_sheepMatBase.eye.clone());eyeR.position.set(.12,.05,.21);head.add(eyeR);
  const legPos=[[-.22,-.1,.16],[.22,-.1,.16],[-.22,-.1,-.16],[.22,-.1,-.16]];
  const legs=legPos.map(([x,y,z])=>{const l=new THREE.Mesh(_sheepGeos.leg,_sheepMatBase.leg.clone());l.position.set(x,y,z);return l;});
  root.add(body,wool,head,...legs);return{root,body,head,legs,wool};
}
const _chickenGeos={body:new THREE.BoxGeometry(.4,.38,.42),head:new THREE.BoxGeometry(.24,.24,.24),beak:new THREE.BoxGeometry(.12,.09,.14),wing:new THREE.BoxGeometry(.1,.28,.32),leg:new THREE.BoxGeometry(.06,.26,.06),eye:new THREE.BoxGeometry(.05,.05,.03)};
const _chickenMatBase={body:new THREE.MeshStandardMaterial({color:0xf5f0e0,roughness:.9}),beak:new THREE.MeshStandardMaterial({color:0xe0a53c,roughness:.7}),comb:new THREE.MeshStandardMaterial({color:0xdd3344,roughness:.7}),leg:new THREE.MeshStandardMaterial({color:0xe0a53c,roughness:.8}),eye:new THREE.MeshBasicMaterial({color:0x111111})};
function makeChickenMesh(){
  const root=new THREE.Object3D();
  const body=new THREE.Mesh(_chickenGeos.body,_chickenMatBase.body.clone());body.position.y=.34;
  const head=new THREE.Mesh(_chickenGeos.head,_chickenMatBase.body.clone());head.position.set(0,.58,.16);
  const beak=new THREE.Mesh(_chickenGeos.beak,_chickenMatBase.beak.clone());beak.position.set(0,-.03,.16);head.add(beak);
  const comb=new THREE.Mesh(new THREE.BoxGeometry(.08,.09,.14),_chickenMatBase.comb.clone());comb.position.set(0,.15,.02);head.add(comb);
  const eyeL=new THREE.Mesh(_chickenGeos.eye,_chickenMatBase.eye.clone());eyeL.position.set(-.09,.04,.12);head.add(eyeL);
  const eyeR=new THREE.Mesh(_chickenGeos.eye,_chickenMatBase.eye.clone());eyeR.position.set(.09,.04,.12);head.add(eyeR);
  const wingL=new THREE.Mesh(_chickenGeos.wing,_chickenMatBase.body.clone());wingL.position.set(-.22,.34,0);
  const wingR=new THREE.Mesh(_chickenGeos.wing,_chickenMatBase.body.clone());wingR.position.set(.22,.34,0);
  const legPos=[[-.1,-.15,.08],[.1,-.15,.08]];
  const legs=legPos.map(([x,y,z])=>{const l=new THREE.Mesh(_chickenGeos.leg,_chickenMatBase.leg.clone());l.position.set(x,y,z);return l;});
  root.add(body,head,wingL,wingR,...legs);return{root,body,head,legs};
}
const _wolfGeos={body:new THREE.BoxGeometry(.75,.5,.95),head:new THREE.BoxGeometry(.42,.4,.44),snout:new THREE.BoxGeometry(.2,.16,.22),ear:new THREE.BoxGeometry(.1,.16,.06),leg:new THREE.BoxGeometry(.16,.45,.16),tail:new THREE.BoxGeometry(.12,.12,.42),eye:new THREE.BoxGeometry(.07,.07,.04),collar:new THREE.BoxGeometry(.46,.1,.46)};
const _wolfMatBase={fur:new THREE.MeshStandardMaterial({color:0x9aa0a8,roughness:.9}),furDark:new THREE.MeshStandardMaterial({color:0x6f757d,roughness:.9}),snout:new THREE.MeshStandardMaterial({color:0xd8dade,roughness:.85}),collar:new THREE.MeshStandardMaterial({color:0xdd2233,roughness:.6}),eye:new THREE.MeshBasicMaterial({color:0x111111})};
function makeWolfMesh(){
  const root=new THREE.Object3D();
  const body=new THREE.Mesh(_wolfGeos.body,_wolfMatBase.fur.clone());body.position.y=.42;
  const head=new THREE.Mesh(_wolfGeos.head,_wolfMatBase.fur.clone());head.position.set(0,.62,.5);
  const snout=new THREE.Mesh(_wolfGeos.snout,_wolfMatBase.snout.clone());snout.position.set(0,-.08,.28);head.add(snout);
  const earL=new THREE.Mesh(_wolfGeos.ear,_wolfMatBase.furDark.clone());earL.position.set(-.13,.26,-.05);head.add(earL);
  const earR=new THREE.Mesh(_wolfGeos.ear,_wolfMatBase.furDark.clone());earR.position.set(.13,.26,-.05);head.add(earR);
  const eyeL=new THREE.Mesh(_wolfGeos.eye,_wolfMatBase.eye.clone());eyeL.position.set(-.11,.06,.23);head.add(eyeL);
  const eyeR=new THREE.Mesh(_wolfGeos.eye,_wolfMatBase.eye.clone());eyeR.position.set(.11,.06,.23);head.add(eyeR);
  const collar=new THREE.Mesh(_wolfGeos.collar,_wolfMatBase.collar.clone());collar.position.set(0,.47,.5);collar.visible=false;
  const tail=new THREE.Mesh(_wolfGeos.tail,_wolfMatBase.furDark.clone());tail.position.set(0,.55,-.6);tail.rotation.x=.5;
  const legPos=[[-.2,-.08,.3],[.2,-.08,.3],[-.2,-.08,-.3],[.2,-.08,-.3]];
  const legs=legPos.map(([x,y,z])=>{const l=new THREE.Mesh(_wolfGeos.leg,_wolfMatBase.furDark.clone());l.position.set(x,y,z);return l;});
  root.add(body,head,collar,tail,...legs);return{root,body,head,legs,tail,collar};
}
const _horseGeos={body:new THREE.BoxGeometry(.7,.7,1.4),head:new THREE.BoxGeometry(.34,.5,.62),neck:new THREE.BoxGeometry(.3,.7,.34),leg:new THREE.BoxGeometry(.18,.8,.18),tail:new THREE.BoxGeometry(.14,.52,.14),mane:new THREE.BoxGeometry(.14,.6,.18),ear:new THREE.BoxGeometry(.08,.15,.06),eye:new THREE.BoxGeometry(.07,.07,.04),snout:new THREE.BoxGeometry(.24,.2,.18),saddle:new THREE.BoxGeometry(.52,.13,.55)};
const _horseMatBase={coat:new THREE.MeshStandardMaterial({color:0xa97a55,roughness:.9}),dark:new THREE.MeshStandardMaterial({color:0x5d4433,roughness:.95}),snout:new THREE.MeshStandardMaterial({color:0xc9a582,roughness:.85}),saddle:new THREE.MeshStandardMaterial({color:0x8b3a2e,roughness:.6}),eye:new THREE.MeshBasicMaterial({color:0x111111})};
function makeHorseMesh(){
  const root=new THREE.Object3D();
  const body=new THREE.Mesh(_horseGeos.body,_horseMatBase.coat.clone());body.position.y=.55;
  const neck=new THREE.Mesh(_horseGeos.neck,_horseMatBase.coat.clone());neck.position.set(0,.95,.55);neck.rotation.x=-.3;
  const head=new THREE.Mesh(_horseGeos.head,_horseMatBase.coat.clone());head.position.set(0,1.32,.72);
  const snout=new THREE.Mesh(_horseGeos.snout,_horseMatBase.snout.clone());snout.position.set(0,-.1,.36);head.add(snout);
  const earL=new THREE.Mesh(_horseGeos.ear,_horseMatBase.dark.clone());earL.position.set(-.1,.3,-.12);head.add(earL);
  const earR=new THREE.Mesh(_horseGeos.ear,_horseMatBase.dark.clone());earR.position.set(.1,.3,-.12);head.add(earR);
  const eyeL=new THREE.Mesh(_horseGeos.eye,_horseMatBase.eye.clone());eyeL.position.set(-.18,.08,.2);head.add(eyeL);
  const eyeR=new THREE.Mesh(_horseGeos.eye,_horseMatBase.eye.clone());eyeR.position.set(.18,.08,.2);head.add(eyeR);
  const mane=new THREE.Mesh(_horseGeos.mane,_horseMatBase.dark.clone());mane.position.set(0,1.12,.4);mane.rotation.x=-.3;
  const tail=new THREE.Mesh(_horseGeos.tail,_horseMatBase.dark.clone());tail.position.set(0,.62,-.8);tail.rotation.x=.55;
  const saddle=new THREE.Mesh(_horseGeos.saddle,_horseMatBase.saddle.clone());saddle.position.set(0,.95,-.1);saddle.visible=false;
  const legPos=[[-.22,-.1,.5],[.22,-.1,.5],[-.22,-.1,-.5],[.22,-.1,-.5]];
  const legs=legPos.map(([x,y,z])=>{const l=new THREE.Mesh(_horseGeos.leg,_horseMatBase.dark.clone());l.position.set(x,y,z);return l;});
  root.add(body,neck,head,mane,tail,saddle,...legs);return{root,body,head,legs,tail,saddle};
}
const ANIMAL_KINDS={
  pig:{build:makePigMesh,hp:3,color:0xf4a9a8},
  sheep:{build:makeSheepMesh,hp:4,color:0xf4f4ec},
  chicken:{build:makeChickenMesh,hp:2,color:0xf5f0e0},
  wolf:{build:makeWolfMesh,hp:6,color:0x9aa0a8},
  horse:{build:makeHorseMesh,hp:8,color:0xa97a55},
};
function createAnimal(wx,wz,kind='pig'){
  if(mobs.length>=MAX_MOBS)return;
  const def=ANIMAL_KINDS[kind]||ANIMAL_KINDS.pig;
  const h=getHeight(Math.floor(wx),Math.floor(wz));const built=def.build();built.root.position.set(wx,h+1.05,wz);markShadowCaster(built.root);scene.add(built.root);
  const mob={kind,root:built.root,body:built.body,head:built.head,legs:built.legs,hp:def.hp,maxHp:def.hp,velY:0,onGround:false,wanderAngle:Math.random()*Math.PI*2,wanderT:0,hitFlash:0,oinkT:2+Math.random()*5,dead:false};
  if(kind==='sheep'){mob.wool=built.wool;mob.sheared=false;mob.regrowT=0;}
  if(kind==='chicken')mob.eggT=15+Math.random()*15;
  if(kind==='wolf'){mob.tail=built.tail;mob.collar=built.collar;}
  if(kind==='horse'){mob.tail=built.tail;mob.saddle=built.saddle;}
  mobs.push(mob);
}
function spawnAnimals(count=8){
  for(let i=0;i<count;i++){
    const angle=Math.random()*Math.PI*2,dist=10+Math.random()*20;
    const wx=P.x+Math.cos(angle)*dist,wz=P.z+Math.sin(angle)*dist;
    const roll=Math.random();
    const kind=roll<0.4?'pig':(roll<0.62?'sheep':(roll<0.75?'chicken':(roll<0.88?'wolf':'horse')));
    createAnimal(wx,wz,kind);
  }
}
function killMob(mob){
  scene.remove(mob.root);disposeObject3D(mob.root);mob.dead=true;
  let msg,color=0xf4a9a8;
  if(mob.kind==='sheep'){
    meat++;const wool=mob.sheared?(1+Math.floor(Math.random()*2)):(2+Math.floor(Math.random()*2));
    inv.wool+=wool;updateInvHUD();msg='🥩 MEAT +1 / 🧶 WOOL +'+wool;color=0xf4f4ec;
  }else if(mob.kind==='chicken'){
    meat++;msg='🥩 MEAT +1';color=0xf5f0e0;
  }else if(mob.kind==='wolf'){
    msg='🐺 オオカミを倒した…（肉で手なずけられたのに）';color=0x9aa0a8;
  }else if(mob.kind==='horse'){
    meat+=2;msg='🥩 MEAT +2 …（🌾小麦で手なずけて乗れたのに）';color=0xa97a55;
  }else{
    meat++;msg='🥩 MEAT x'+meat;
  }
  updateMeatHUD();showBonus(msg);playTone(500,.12,.1,'sine');spawnParticles(mob.root.position.x,mob.root.position.y,mob.root.position.z,color,3);
}
function hitMob(mob,damage=1){if(mob.dead)return;mob.hp-=damage;mob.hitFlash=.15;mob.root.scale.set(1.3,.7,1.3);sfxOink();if(mob.hp<=0)killMob(mob);}
const _atkDir=new THREE.Vector3();
function attackMobs(w){
  if(w.type==='ranged')return;camera.getWorldDirection(_atkDir);const range=w.type==='aoe'?w.range:(w.range+.5);
  for(let i=mobs.length-1;i>=0;i--){const mob=mobs[i];if(mob.dead)continue;const mp=mob.root.position;const hdx=mp.x-P.x,hdz=mp.z-P.z,hdist=Math.hypot(hdx,hdz);if(hdist>range)continue;if(w.type==='aoe'){hitMob(mob,w.dmg);}else{const hlen=Math.hypot(_atkDir.x,_atkDir.z)||1;const dot=(hdx/hdist)*(_atkDir.x/hlen)+(hdz/hdist)*(_atkDir.z/hlen);if(dot>0.3)hitMob(mob,w.dmg);}}
}
// ═══ SHEARING ═══
function _shearableSheepNearby(){return mobs.some(m=>m.kind==='sheep'&&!m.dead&&!m.sheared&&Math.hypot(m.root.position.x-P.x,m.root.position.z-P.z)<2.5);}
function shearNearestSheep(){
  let nearest=null,nd=2.5;
  for(const m of mobs){if(m.kind!=='sheep'||m.dead||m.sheared)continue;const d=Math.hypot(m.root.position.x-P.x,m.root.position.z-P.z);if(d<nd){nd=d;nearest=m;}}
  if(!nearest)return;
  const wool=1+Math.floor(Math.random()*2);
  inv.wool+=wool;nearest.sheared=true;nearest.regrowT=45;
  if(nearest.wool)nearest.wool.visible=false;
  updateInvHUD();showBonus('🧶 ウール×'+wool+' 刈った！');playTone(700,.1,.1,'triangle');unlockAchievement('firstShear');
}
// ═══ EGGS ═══
const EGG_ITEM={name:'🥚 EGG',type:'egg',value:15,color:0xfff3c4};
function layEgg(x,y,z){
  const mat=new THREE.MeshBasicMaterial({color:EGG_ITEM.color,transparent:true,opacity:.9});
  const m=new THREE.Mesh(itemGeo,mat);m.position.set(x,y,z);scene.add(m);
  items.push({mesh:m,mat,info:EGG_ITEM,x,y,z,time:0});
}
function updateMobs(dt){
  const FLEE_DIST=6,WANDER_SPD=1.4,FLEE_SPD=4.2;const swing=Math.sin(Date.now()*.006)*.35;
  for(let i=mobs.length-1;i>=0;i--){
    const mob=mobs[i];if(mob.dead){mobs.splice(i,1);continue;}
    const mp=mob.root.position;const dx=P.x-mp.x,dz=P.z-mp.z,dist=Math.hypot(dx,dz);
    const tooFar=dist>55;mob.root.visible=!tooFar;if(tooFar)continue;
    if(mob.hitFlash>0){mob.hitFlash-=dt;if(mob.hitFlash<=0)mob.root.scale.set(1,1,1);}
    if(mob.kind==='pig'){mob.oinkT-=dt;if(mob.oinkT<=0){mob.oinkT=4+Math.random()*6;if(dist<20)sfxOink();}}
    if(mob.kind==='sheep'&&mob.sheared){mob.regrowT-=dt;if(mob.regrowT<=0){mob.sheared=false;if(mob.wool)mob.wool.visible=true;}}
    if(mob.kind==='chicken'){mob.eggT-=dt;if(mob.eggT<=0){mob.eggT=18+Math.random()*14;if(mob.onGround)layEgg(mp.x,mp.y-.3,mp.z);}}
    const kFleeDist=mob.kind==='chicken'?8:FLEE_DIST,kFleeSpd=mob.kind==='chicken'?5.2:FLEE_SPD,kWanderSpd=mob.kind==='chicken'?1.7:WANDER_SPD;
    mob.velY-=GRAV*dt;const fy=mp.y-.5;const ny=fy+mob.velY*dt;
    if(!overlaps(mp.x,ny,mp.z,.38,.95)){mp.y=ny+.5;mob.onGround=false;}else{if(mob.velY<0)mob.onGround=true;mob.velY=0;}
    if(mp.y<-10){const rh=getHeight(Math.floor(mp.x),Math.floor(mp.z));mp.y=rh+1.05;mob.velY=0;continue;}
    let moveX=0,moveZ=0;
    if(mob.kind==='wolf'&&dist<9){
      // オオカミは逃げない：肉を持っていると寄ってくる（おねだり）
      mob.root.rotation.y=Math.atan2(dx,dz);
      if((meat>0||isCreative())&&dist>1.8){const l=dist||1;moveX=(dx/l)*1.8;moveZ=(dz/l)*1.8;}
      if(mob.tail)mob.tail.rotation.y=Math.sin(Date.now()*.008)*.5;
    }
    else if(mob.kind==='horse'&&dist<9){
      // ウマも逃げない：小麦を持っていると寄ってくる
      mob.root.rotation.y=Math.atan2(dx,dz);
      if((inv.wheat>0||isCreative())&&dist>2.0){const l=dist||1;moveX=(dx/l)*1.6;moveZ=(dz/l)*1.6;}
      if(mob.tail)mob.tail.rotation.y=Math.sin(Date.now()*.008)*.4;
    }
    else if(dist<kFleeDist){const l=dist||1;moveX=-(dx/l)*kFleeSpd;moveZ=-(dz/l)*kFleeSpd;mob.root.rotation.y=Math.atan2(-dx,-dz);if(mob.onGround&&Math.random()<.012)mob.velY=5;}
    else{mob.wanderT-=dt;if(mob.wanderT<=0){mob.wanderAngle+=(Math.random()-.5)*Math.PI;mob.wanderT=1.5+Math.random()*2;}moveX=Math.sin(mob.wanderAngle)*kWanderSpd;moveZ=Math.cos(mob.wanderAngle)*kWanderSpd;mob.root.rotation.y=mob.wanderAngle;}
    const nx2=mp.x+moveX*dt;if(!overlaps(nx2,fy,mp.z,.38,.95))mp.x=nx2;
    const nz2=mp.z+moveZ*dt;if(!overlaps(mp.x,fy,nz2,.38,.95))mp.z=nz2;
    const moving=Math.abs(moveX)+Math.abs(moveZ)>.1;if(moving&&mob.legs){for(let li=0;li<mob.legs.length;li++){mob.legs[li].rotation.x=(li%2===0?1:-1)*swing;}}
  }
}

// ═══ PET（オオカミの相棒） ═══
let pet=null;
const PET_MAX_HP=40,PET_REVIVE_T=30,PET_BITE_CD=.9;
const $petLabel=document.getElementById('petLabel');
const sfxBark=()=>{playTone(520,.07,.12,'square');setTimeout(()=>playTone(430,.09,.1,'square'),90);};
function updatePetHUD(){
  if(!$petLabel)return;
  if(!pet){$petLabel.style.display='none';return;}
  $petLabel.style.display='block';
  $petLabel.textContent=pet.downT>0?'🐺 相棒: 気絶中… '+Math.ceil(pet.downT)+'s':'🐺 相棒 HP: '+Math.ceil(pet.hp)+'/'+pet.maxHp;
}
function _makePetState(built,hp,downT){
  return{root:built.root,body:built.body,head:built.head,legs:built.legs,tail:built.tail,collar:built.collar,
    hp:Math.max(0,Math.min(PET_MAX_HP,hp)),maxHp:PET_MAX_HP,velY:0,onGround:false,atkCd:0,hitFlash:0,
    downT:Math.max(0,downT||0),barkT:3,target:null};
}
function _tameableWolfNearby(){return !pet&&mobs.some(m=>m.kind==='wolf'&&!m.dead&&Math.hypot(m.root.position.x-P.x,m.root.position.z-P.z)<2.5);}
function tameNearestWolf(){
  if(pet)return;
  let nearest=null,nd=2.5;
  for(const m of mobs){if(m.kind!=='wolf'||m.dead)continue;const d=Math.hypot(m.root.position.x-P.x,m.root.position.z-P.z);if(d<nd){nd=d;nearest=m;}}
  if(!nearest)return;
  if(!isCreative()&&meat<=0){showBonus('🥩 肉がないと手なずけられない！');return;}
  if(!isCreative()){meat--;updateMeatHUD();}
  const idx=mobs.indexOf(nearest);if(idx>=0)mobs.splice(idx,1);
  pet=_makePetState(nearest,PET_MAX_HP,0);
  if(pet.collar)pet.collar.visible=true;
  spawnParticles(pet.root.position.x,pet.root.position.y+.5,pet.root.position.z,0xff7788,5);
  sfxBark();showBonus('🐺 オオカミを手なずけた！相棒が一緒に戦ってくれる');
  unlockAchievement('firstTame');updatePetHUD();
}
function _petFeedableNearby(){return !!pet&&meat>0&&(pet.hp<pet.maxHp||pet.downT>0)&&Math.hypot(pet.root.position.x-P.x,pet.root.position.z-P.z)<2.5;}
function feedPet(){
  if(!pet||meat<=0)return;
  meat--;updateMeatHUD();
  pet.hp=Math.min(pet.maxHp,pet.hp+15);
  if(pet.downT>0){pet.downT=0;pet.root.rotation.z=0;showBonus('🍖 相棒が元気を取り戻した！');}
  else showBonus('🍖 相棒のHP回復！');
  spawnParticles(pet.root.position.x,pet.root.position.y+.5,pet.root.position.z,0xff7788,4);
  sfxBark();updatePetHUD();
}
function hitPet(dmg){
  if(!pet||pet.downT>0)return;
  pet.hp-=dmg;pet.hitFlash=.15;pet.root.scale.set(1.25,.75,1.25);playTone(300,.1,.1,'square');
  if(pet.hp<=0){pet.hp=0;pet.downT=PET_REVIVE_T;pet.target=null;pet.root.rotation.z=1.35;showAlert('🐺 相棒が倒れた… しばらくすると復活');playTone(200,.25,.15,'sawtooth');}
}
function removePet(){if(pet){scene.remove(pet.root);disposeObject3D(pet.root);pet=null;}updatePetHUD();}
function spawnPetAtPlayer(hp,downT){
  removePet();
  const built=makeWolfMesh();
  const h=getHeight(Math.floor(P.x+1),Math.floor(P.z+1));
  built.root.position.set(P.x+1,Math.max(P.y+.5,h+1.05),P.z+1);
  markShadowCaster(built.root);scene.add(built.root);
  built.collar.visible=true;
  pet=_makePetState(built,hp,downT);
  if(pet.downT>0)pet.root.rotation.z=1.35;
  else if(pet.hp<=0)pet.hp=Math.ceil(PET_MAX_HP*.5);
  updatePetHUD();
}
function updatePet(dt){
  if(!pet)return;
  const pp=pet.root.position;
  const dx=P.x-pp.x,dz=P.z-pp.z,dist=Math.hypot(dx,dz);
  if(pet.hitFlash>0){pet.hitFlash-=dt;if(pet.hitFlash<=0)pet.root.scale.set(1,1,1);}
  // はぐれたらテレポートで合流
  if(dist>28||Math.abs(P.y-pp.y)>14){pp.set(P.x,P.y+.6,P.z);pet.velY=0;pet.target=null;}
  // 重力
  pet.velY-=GRAV*dt;const fy=pp.y-.5;const ny=fy+pet.velY*dt;
  if(!overlaps(pp.x,ny,pp.z,.38,.95)){pp.y=ny+.5;pet.onGround=false;}else{if(pet.velY<0)pet.onGround=true;pet.velY=0;}
  if(pet.downT>0){
    pet.downT-=dt;
    if(pet.downT<=0){pet.downT=0;pet.hp=Math.ceil(pet.maxHp*.5);pet.root.rotation.z=0;sfxBark();showBonus('🐺 相棒が復活した！');}
    return;
  }
  pet.hp=Math.min(pet.maxHp,pet.hp+.4*dt); // ゆっくり自然回復
  // ターゲット選択：近くの敵を迎撃（プレイヤーから離れすぎる敵は追わない）
  let target=pet.target;
  if(target&&(target.dead||target.hp<=0||enemies.indexOf(target)<0))target=null;
  if(!target){
    let bd=11;
    for(const e of enemies){if(e.dead||e.type.bat)continue;const ep=e.root.position;const d=Math.hypot(ep.x-pp.x,ep.z-pp.z);if(d<bd&&Math.hypot(ep.x-P.x,ep.z-P.z)<18&&Math.abs(ep.y-pp.y)<6){bd=d;target=e;}}
  }
  pet.target=target;
  let moveX=0,moveZ=0;
  if(target){
    const ep=target.root.position;const tdx=ep.x-pp.x,tdz=ep.z-pp.z,td=Math.hypot(tdx,tdz);
    pet.root.rotation.y=Math.atan2(tdx,tdz);
    if(td>1.3){const spd=5.2;moveX=tdx/td*spd;moveZ=tdz/td*spd;if(pet.onGround&&Math.random()<.02)pet.velY=5.5;}
    pet.atkCd=Math.max(0,pet.atkCd-dt);
    if(td<1.5&&pet.atkCd<=0){hitEnemy(target,2+Math.floor(gs.wave*.3));pet.atkCd=PET_BITE_CD;playTone(380,.06,.1,'square');}
  }else if(dist>3){
    const spd=dist>8?6:3.4;
    moveX=dx/dist*spd;moveZ=dz/dist*spd;pet.root.rotation.y=Math.atan2(dx,dz);
    if(pet.onGround&&dist>5&&Math.random()<.02)pet.velY=5.5;
  }else{
    pet.root.rotation.y=Math.atan2(dx,dz);
    pet.barkT-=dt;if(pet.barkT<=0){pet.barkT=6+Math.random()*8;if(dist<12&&Math.random()<.5)sfxBark();}
  }
  const nx=pp.x+moveX*dt;if(!overlaps(nx,pp.y-.5,pp.z,.38,.95))pp.x=nx;
  const nz=pp.z+moveZ*dt;if(!overlaps(pp.x,pp.y-.5,nz,.38,.95))pp.z=nz;
  const moving=Math.abs(moveX)+Math.abs(moveZ)>.1;
  if(moving&&pet.legs){const swing=Math.sin(Date.now()*.008)*.45;for(let li=0;li<pet.legs.length;li++)pet.legs[li].rotation.x=(li%2===0?1:-1)*swing;}
  if(pet.tail)pet.tail.rotation.y=Math.sin(Date.now()*.006)*(moving?.25:.5);
}

// ═══ 🐴 騎乗（マウント） ═══
// 野生のウマを🌾小麦×1で手なずけると自分のウマになり（サドル表示）、
// 近くでXキー(スマホはPLACE長押し)で騎乗/降車できる。
// 騎乗中: 移動速度アップ（歩き11 / ダッシュ15.5）・ジャンプ力アップ（2ブロック超え）・
// ダッシュしても追加の満腹度を消費しない（走るのはウマなので）。
let horse=null;   // 手なずけたウマ {root,body,head,legs,tail,saddle,velY,onGround,...}
let mounted=false;
const MOUNT_SPEED=11,MOUNT_GALLOP=15.5,MOUNT_JV=9.2,MOUNT_EYE=.85;
const sfxNeigh=()=>{playTone(700,.08,.12,'sawtooth');setTimeout(()=>playTone(880,.1,.1,'sawtooth'),90);setTimeout(()=>playTone(620,.12,.08,'sawtooth'),200);};
function _makeHorseState(built){
  return{root:built.root,body:built.body,head:built.head,legs:built.legs,tail:built.tail,saddle:built.saddle,
    velY:0,onGround:false,walkT:0,lastX:built.root.position.x,lastZ:built.root.position.z,neighT:5};
}
function _tameableHorseNearby(){return !horse&&mobs.some(m=>m.kind==='horse'&&!m.dead&&Math.hypot(m.root.position.x-P.x,m.root.position.z-P.z)<2.6);}
function tameNearestHorse(){
  if(horse)return;
  let nearest=null,nd=2.6;
  for(const m of mobs){if(m.kind!=='horse'||m.dead)continue;const d=Math.hypot(m.root.position.x-P.x,m.root.position.z-P.z);if(d<nd){nd=d;nearest=m;}}
  if(!nearest)return;
  if(!isCreative()&&inv.wheat<=0){showBonus('🌾 小麦がないと手なずけられない！');return;}
  if(!isCreative()){inv.wheat--;updateInvHUD();}
  const idx=mobs.indexOf(nearest);if(idx>=0)mobs.splice(idx,1);
  horse=_makeHorseState(nearest);
  if(horse.saddle)horse.saddle.visible=true;
  spawnParticles(horse.root.position.x,horse.root.position.y+.8,horse.root.position.z,0xffd27a,5);
  sfxNeigh();showBonus('🐴 ウマを手なずけた！近くでX(PLACE長押し)で騎乗');
  unlockAchievement('firstTameHorse');
}
function _horseMountableNearby(){return !!horse&&!mounted&&Math.hypot(horse.root.position.x-P.x,horse.root.position.z-P.z)<2.6;}
function mountHorse(){
  if(!horse||mounted)return;
  mounted=true;
  if(P.flying)setFlying(false); // 騎乗と飛行は併用しない
  horse.root.position.set(P.x,P.y+.5,P.z);
  sfxNeigh();showBonus('🐴 騎乗！速く走れる（降りるのもX/PLACE長押し）');
  unlockAchievement('firstMount');
}
function dismountHorse(){
  if(!mounted)return;
  mounted=false;
  showBonus('🐴 降りた');playTone(500,.08,.08,'sine');
}
function removeHorse(){if(horse){scene.remove(horse.root);disposeObject3D(horse.root);horse=null;}mounted=false;}
function spawnHorseAtPlayer(mnt){
  removeHorse();
  const built=makeHorseMesh();
  const h=getHeight(Math.floor(P.x+1),Math.floor(P.z-1));
  built.root.position.set(P.x+1,Math.max(P.y+.5,h+1.05),P.z-1);
  markShadowCaster(built.root);scene.add(built.root);
  built.saddle.visible=true;
  horse=_makeHorseState(built);
  mounted=!!mnt;
}
function updateHorse(dt){
  if(!horse)return;
  const hp2=horse.root.position;
  if(mounted){
    // 騎乗中はプレイヤーの足元に追従（物理はプレイヤー側が担当）
    hp2.set(P.x,P.y+.5,P.z);
    horse.root.rotation.y=yaw;
    const movedDist=Math.hypot(hp2.x-horse.lastX,hp2.z-horse.lastZ);
    horse.lastX=hp2.x;horse.lastZ=hp2.z;
    if(movedDist>0.01){
      horse.walkT+=dt*(6+movedDist*8);
      const sw=Math.sin(horse.walkT)*.6;
      for(let li=0;li<horse.legs.length;li++)horse.legs[li].rotation.x=(li%2===0?1:-1)*sw;
    }else{
      for(const l of horse.legs)l.rotation.x*=.8;
    }
    if(horse.tail)horse.tail.rotation.y=Math.sin(Date.now()*.006)*.3;
    return;
  }
  const dx=P.x-hp2.x,dz=P.z-hp2.z,dist=Math.hypot(dx,dz);
  // はぐれたらテレポートで合流（相棒オオカミと同じ）
  if(dist>30||Math.abs(P.y-hp2.y)>14){hp2.set(P.x+1,P.y+.6,P.z-1);horse.velY=0;}
  // 重力
  horse.velY-=GRAV*dt;const fy=hp2.y-.5;const ny=fy+horse.velY*dt;
  if(!overlaps(hp2.x,ny,hp2.z,.38,.95)){hp2.y=ny+.5;horse.onGround=false;}else{if(horse.velY<0)horse.onGround=true;horse.velY=0;}
  let moveX=0,moveZ=0;
  if(dist>4){
    const spd=dist>10?6.5:3.2;
    moveX=dx/dist*spd;moveZ=dz/dist*spd;horse.root.rotation.y=Math.atan2(dx,dz);
    if(horse.onGround&&dist>6&&Math.random()<.02)horse.velY=6;
  }else{
    horse.neighT-=dt;if(horse.neighT<=0){horse.neighT=8+Math.random()*10;if(dist<12&&Math.random()<.4)sfxNeigh();}
  }
  const nx=hp2.x+moveX*dt;if(!overlaps(nx,hp2.y-.5,hp2.z,.38,.95))hp2.x=nx;
  const nz=hp2.z+moveZ*dt;if(!overlaps(hp2.x,hp2.y-.5,nz,.38,.95))hp2.z=nz;
  const moving=Math.abs(moveX)+Math.abs(moveZ)>.1;
  if(moving){const sw=Math.sin(Date.now()*.008)*.45;for(let li=0;li<horse.legs.length;li++)horse.legs[li].rotation.x=(li%2===0?1:-1)*sw;}
  if(horse.tail)horse.tail.rotation.y=Math.sin(Date.now()*.006)*(moving?.25:.45);
}

// ═══ 🧙 行商人（ランダムイベント: トレーダー） ═══
// 一定間隔でランダムにワールドへ出現する移動商人。その場に留まり、近くでXキー
// (スマホはPLACE長押し)で話しかけると交易パネルが開く。取引ごとの在庫(stock)は
// 出現ごとにリセットされ、無限に素材を変換できないようにしてある。
// 一定時間で立ち去るか、次回開始時にリセットされる（セーブはしない一時的な存在）。
let merchant=null; // {root,head,armL,armR,baseY,bobT,life,stockLeft:[...]}
const MERCHANT_LIFE=180;
let merchantSpawnT=60+Math.random()*60;
const _merchantGeos={
  robe:new THREE.BoxGeometry(.62,1.0,.5),head:new THREE.BoxGeometry(.34,.34,.34),
  hood:new THREE.BoxGeometry(.4,.22,.42),arm:new THREE.BoxGeometry(.16,.55,.16),
  pack:new THREE.BoxGeometry(.32,.4,.24),eye:new THREE.BoxGeometry(.06,.06,.04),
  trim:new THREE.BoxGeometry(.66,.1,.54),
};
const _merchantMatBase={
  robe:new THREE.MeshStandardMaterial({color:0x5a3a7a,roughness:.85}),
  trim:new THREE.MeshStandardMaterial({color:0xd8b04a,roughness:.6,metalness:.3}),
  skin:new THREE.MeshStandardMaterial({color:0xd8b088,roughness:.8}),
  pack:new THREE.MeshStandardMaterial({color:0x6d4a2a,roughness:.85}),
  eye:new THREE.MeshBasicMaterial({color:0x111111}),
};
function makeMerchantMesh(){
  const root=new THREE.Object3D();
  const robe=new THREE.Mesh(_merchantGeos.robe,_merchantMatBase.robe.clone());robe.position.y=.62;
  const trim=new THREE.Mesh(_merchantGeos.trim,_merchantMatBase.trim.clone());trim.position.y=.16;
  const head=new THREE.Mesh(_merchantGeos.head,_merchantMatBase.skin.clone());head.position.y=1.28;
  const hood=new THREE.Mesh(_merchantGeos.hood,_merchantMatBase.robe.clone());hood.position.set(0,1.42,-.02);
  const eyeL=new THREE.Mesh(_merchantGeos.eye,_merchantMatBase.eye.clone());eyeL.position.set(-.09,1.28,.17);
  const eyeR=new THREE.Mesh(_merchantGeos.eye,_merchantMatBase.eye.clone());eyeR.position.set(.09,1.28,.17);
  const armL=new THREE.Mesh(_merchantGeos.arm,_merchantMatBase.robe.clone());armL.position.set(-.38,.7,0);armL.rotation.z=.2;
  const armR=new THREE.Mesh(_merchantGeos.arm,_merchantMatBase.robe.clone());armR.position.set(.38,.7,0);armR.rotation.z=-.2;
  const pack=new THREE.Mesh(_merchantGeos.pack,_merchantMatBase.pack.clone());pack.position.set(0,.75,-.32);
  root.add(robe,trim,head,hood,eyeL,eyeR,armL,armR,pack);
  markShadowCaster(root);
  return{root,head,armL,armR};
}
function spawnMerchant(){
  if(merchant)return;
  const angle=Math.random()*Math.PI*2,dist=10+Math.random()*8;
  const wx=P.x+Math.cos(angle)*dist,wz=P.z+Math.sin(angle)*dist;
  const h=getHeight(Math.floor(wx),Math.floor(wz));
  const built=makeMerchantMesh();
  const baseY=h+1.01;
  built.root.position.set(wx,baseY,wz);
  scene.add(built.root);
  merchant={root:built.root,head:built.head,armL:built.armL,armR:built.armR,baseY,
    bobT:Math.random()*10,life:MERCHANT_LIFE,stockLeft:MERCHANT_TRADES.map(t=>t.stock)};
  showAlert('🧙 行商人が近くにやってきた！Xキー(スマホはPLACE長押し)で話しかけよう');
  playTone(500,.1,.1,'triangle');setTimeout(()=>playTone(650,.1,.1,'triangle'),110);
}
function removeMerchant(){
  if(!merchant)return;
  scene.remove(merchant.root);disposeObject3D(merchant.root);merchant=null;
  closeMerchantPanel();
}
function _merchantNearby(){return !!merchant&&Math.hypot(merchant.root.position.x-P.x,merchant.root.position.z-P.z)<2.8;}
function updateMerchant(dt,isUnder){
  if(!merchant){
    if(!isCreative()&&!isUnder){merchantSpawnT-=dt;if(merchantSpawnT<=0)spawnMerchant();}
    return;
  }
  merchant.life-=dt;
  if(merchant.life<=0){
    const wasNear=Math.hypot(merchant.root.position.x-P.x,merchant.root.position.z-P.z)<30;
    removeMerchant();merchantSpawnT=100+Math.random()*80;
    if(wasNear)showBonus('🧙 行商人が立ち去った');
    return;
  }
  merchant.bobT+=dt;
  merchant.root.position.y=merchant.baseY+Math.sin(merchant.bobT*1.4)*.05;
  merchant.root.rotation.y=Math.sin(merchant.bobT*.5)*.5;
  if(merchant.armL)merchant.armL.rotation.z=.2+Math.sin(merchant.bobT*.9)*.08;
  if(merchant.armR)merchant.armR.rotation.z=-.2-Math.sin(merchant.bobT*.9)*.08;
}
// ─── 交易パネル ───
const $merchantPanel=document.getElementById('merchantPanel'),$merchantBody=document.getElementById('merchantBody'),$merchantCloseBtn=document.getElementById('merchantCloseBtn');
const $merchantInfo=document.getElementById('merchantInfo');
function updateMerchantInfo(){
  if(!$merchantInfo)return;
  if(_merchantNearby()){$merchantInfo.textContent='🧙 行商人がいる！Xキー(スマホはPLACE長押し)で話しかける';$merchantInfo.classList.add('show');}
  else $merchantInfo.classList.remove('show');
}
function canAffordTrade(t){return Object.entries(t.give).every(([k,v])=>(inv[k]||0)>=v);}
function doTrade(i){
  if(!merchant)return;
  const t=MERCHANT_TRADES[i];if(!t)return;
  if(merchant.stockLeft[i]<=0){showBonus('🧙 この品はもう在庫がない');return;}
  if(!canAffordTrade(t)){showBonus('素材が足りない…');playTone(200,.1,.08,'sawtooth');return;}
  for(const[k,v]of Object.entries(t.give))inv[k]-=v;
  for(const[k,v]of Object.entries(t.get))inv[k]=(inv[k]||0)+v;
  merchant.stockLeft[i]--;
  updateInvHUD();
  unlockAchievement('firstTrade');
  showBonus('🧙 取引成立！ '+t.desc);
  playTone(700,.12,.1,'sine');setTimeout(()=>playTone(950,.1,.08,'sine'),100);
  buildMerchantPanel(); // 連続取引できるようパネルは開いたまま更新
}
function buildMerchantPanel(){
  if(!$merchantBody)return;
  $merchantBody.innerHTML='';
  if(!merchant){$merchantBody.innerHTML='<div class="citem locked">行商人はいない</div>';return;}
  MERCHANT_TRADES.forEach((t,i)=>{
    const el=document.createElement('div');el.className='citem';
    const left=merchant.stockLeft[i];
    if(left<=0){el.classList.add('done');el.textContent='✅ '+t.desc+' (在庫切れ)';}
    else if(!canAffordTrade(t)){el.classList.add('locked');el.textContent='🔒 '+t.desc+' (残り'+left+')';}
    else{el.textContent='🔵 '+t.desc+' (残り'+left+')';el.addEventListener('pointerdown',(e)=>{e.stopPropagation();doTrade(i);});}
    $merchantBody.appendChild(el);
  });
}
function openMerchantPanel(){if(!merchant)return;buildMerchantPanel();setPanel($merchantPanel,true);}
function closeMerchantPanel(){setPanel($merchantPanel,false);}
if($merchantCloseBtn)bindTapSafe($merchantCloseBtn,closeMerchantPanel);

