// ============================================================================
// jokura / colossus.js
// 🌀 終端界専用: 巨大骸骨覚醒イベント「ABYSS COLOSSUS（終端巨神）」。
//
// これは「敵を1体追加する」機能ではない。destabilization.js のDESTABILIZATIONが
// 100%に達した瞬間、プレイヤー自身の破壊行為が呼び覚ました超巨大存在として
// 世界に現れる。小さなHPバーを持つ通常の敵ではなく、既存の超兵器で少しずつ
// 「解体」していく巨大構造として扱う。
//
// パフォーマンス方針: チャンク/ボクセルは一切使わない。頭・胸部・左右腕の
// 各パーツを、共有ジオメトリを使った少数の大きな THREE.Mesh（合計30個未満）
// だけで構成する。破壊時も新規メッシュを大量生成せず、既存パーツの色/回転/
// 可視性を変えるだけで見た目を変化させる（大量の物理オブジェクト生成はしない）。
// 終端界へ入退場するたびに ezMount()/ezUnmount() と同じ流儀で scene への
// add/remove だけを行い、ジオメトリ自体は使い回す。
//
// 読み込み順: … railgun → railgun_sequence → destabilization → colossus → hud → …
// ============================================================================

const ColossusConfig={
  anchor:{x:40,y:58,z:-120}, // 終端界の開始地点から見て一方向へ離れた「深淵の底」に固定
  dmg:{tnt:9,crust:32,railgun:95,longinus:150,tsarBase:50},
  coreRevealNeeded:2, // HEAD/L-ARM/R-ARMのうちこの数が壊れたらCOREが露出する
};

let ezColossusAwakened=false;
let ezColossusDefeated=false;

function _colossusFreshState(){
  return{
    parts:{
      head:{hp:230,maxHp:230,destroyed:false},
      chest:{hp:360,maxHp:360,destroyed:false},
      armL:{hp:260,maxHp:260,destroyed:false},
      armR:{hp:260,maxHp:260,destroyed:false},
    },
    coreExposed:false,
    core:{hp:260,maxHp:260},
    destroyedCount:0,
    defeatPhase:null,defeatT:0,
  };
}
let ezColossus=_colossusFreshState();

// ─── 見た目の構築（1度だけ生成し、以降は add/remove と色/回転の変更だけで再利用） ───
let _colossusBuilt=false,_colossusRoot=null,_colossusRock=null;
let _colossusHead=null,_colossusChest=null,_colossusArmL=null,_colossusArmR=null,_colossusCore=null;
let _colossusEyeMats=[];
const _colossusDecals=[];
const COLOSSUS_MAX_DECALS=18;
const _colossusDecalGeo=new THREE.SphereGeometry(0.9,6,5);

function _cBox(w,h,d,color){
  const mat=new THREE.MeshStandardMaterial({color,roughness:.88,metalness:.04,fog:false,emissive:0x000000,emissiveIntensity:0});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  mesh.frustumCulled=false;
  return mesh;
}
function _colossusBuild(){
  if(_colossusBuilt)return;
  _colossusBuilt=true;
  const boneColor=0x2b2620,boneColorDark=0x191510;
  const root=new THREE.Group();root.visible=false;root.frustumCulled=false;

  // 台座（深淵から突き出た岩の塊。破壊対象ではなく装飾のみ）
  const rock=new THREE.Group();
  const r1=_cBox(30,18,26,0x120e12);r1.position.y=-31;rock.add(r1);
  const r2=_cBox(24,14,20,0x181218);r2.position.y=-16;rock.add(r2);
  root.add(rock);_colossusRock=rock;

  // 胸部（CHEST CORE）
  const chestGroup=new THREE.Group();chestGroup.position.set(0,26,0);
  const chestShell=_cBox(24,30,18,boneColor);
  const plateL=_cBox(11,26,3,boneColorDark);plateL.position.set(-6,0,9.2);
  const plateR=_cBox(11,26,3,boneColorDark);plateR.position.set(6,0,9.2);
  const coreMesh=new THREE.Mesh(new THREE.SphereGeometry(6,14,10),new THREE.MeshBasicMaterial({color:0x9a2aff,transparent:true,opacity:0,fog:false}));
  coreMesh.frustumCulled=false;
  chestGroup.add(chestShell,plateL,plateR,coreMesh);
  root.add(chestGroup);
  _colossusChest={group:chestGroup,shell:chestShell,plates:[plateL,plateR]};
  _colossusCore=coreMesh;

  // 頭部（HEAD）
  const headGroup=new THREE.Group();headGroup.position.set(0,50,2);
  const skull=_cBox(16,16,16,boneColor);
  const jaw=_cBox(14,5,15,boneColorDark);jaw.position.set(0,-9,1);
  const cheekL=_cBox(4,6,4,boneColorDark);cheekL.position.set(-7,-3,6);
  const cheekR=_cBox(4,6,4,boneColorDark);cheekR.position.set(7,-3,6);
  const eyeMatL=new THREE.MeshBasicMaterial({color:0xff3344,transparent:true,opacity:0,fog:false});
  const eyeMatR=eyeMatL.clone();
  const eyeL=new THREE.Mesh(new THREE.BoxGeometry(2.6,2.6,1.4),eyeMatL);eyeL.position.set(-4,1,8.2);eyeL.frustumCulled=false;
  const eyeR=new THREE.Mesh(new THREE.BoxGeometry(2.6,2.6,1.4),eyeMatR);eyeR.position.set(4,1,8.2);eyeR.frustumCulled=false;
  headGroup.add(skull,jaw,cheekL,cheekR,eyeL,eyeR);
  root.add(headGroup);
  _colossusHead={group:headGroup,shell:skull,fragments:[jaw,cheekL,cheekR]};
  _colossusEyeMats=[eyeMatL,eyeMatR];

  // 腕（LEFT ARM / RIGHT ARM）: 肩ピボットで、破壊時に垂れ下がる回転を掛けられるようにする
  function buildArm(side){
    const shoulder=new THREE.Group();shoulder.position.set(18*side,40,0);
    const upper=_cBox(7,20,7,boneColor);upper.position.y=-10;shoulder.add(upper);
    const lower=_cBox(6,18,6,boneColorDark);lower.position.y=-29;shoulder.add(lower);
    const hand=_cBox(7,8,7,boneColor);hand.position.y=-42;shoulder.add(hand);
    return{group:shoulder,shell:[upper,lower,hand]};
  }
  const armL=buildArm(-1),armR=buildArm(1);
  root.add(armL.group,armR.group);
  _colossusArmL=armL;_colossusArmR=armR;

  _colossusRoot=root;
}
function _colossusPartCenter(name){
  const A=ColossusConfig.anchor;
  if(name==='head')return{x:A.x,y:A.y+50,z:A.z+2,r:11};
  if(name==='chest')return{x:A.x,y:A.y+26,z:A.z,r:16};
  if(name==='core')return{x:A.x,y:A.y+26,z:A.z,r:7};
  if(name==='armL')return{x:A.x-18,y:A.y+20,z:A.z,r:14};
  if(name==='armR')return{x:A.x+18,y:A.y+20,z:A.z,r:14};
  return null;
}
function _colossusPartMeshes(name){
  if(name==='head')return _colossusHead?[_colossusHead.shell,..._colossusHead.fragments]:[];
  if(name==='chest')return _colossusChest?[_colossusChest.shell,..._colossusChest.plates]:[];
  if(name==='armL')return _colossusArmL?_colossusArmL.shell:[];
  if(name==='armR')return _colossusArmR?_colossusArmR.shell:[];
  return[];
}

// ─── 終端界の入退場と連動したライフサイクル（ezMount/ezUnmount と同じ流儀） ───
function colossusMount(){
  if(!_colossusBuilt)_colossusBuild();
  if(_colossusRoot&&_colossusRoot.parent!==scene)scene.add(_colossusRoot);
  _colossusApplyStateToMesh();
}
function colossusUnmount(){
  if(_colossusRoot&&_colossusRoot.parent===scene)scene.remove(_colossusRoot);
}

// ─── 25%〜75%の間に呼ばれる、まだ動かない見た目の変化 ───
function colossusRevealSilhouette(){ // 50%: 遠景にシルエットが見えるようにする（まだ動かない）
  if(_colossusRoot)_colossusRoot.visible=true;
}
function colossusEnterStirring(){ // 75%: 目にごく弱い光
  if(_colossusRoot)_colossusRoot.visible=true;
  for(const m of _colossusEyeMats)m.opacity=Math.max(m.opacity,0.22);
}
let _colossusStirT=3+Math.random()*4;
function _colossusStirIdle(dt){
  for(const m of _colossusEyeMats)m.opacity=0.15+Math.random()*0.15;
  _colossusStirT-=dt;
  if(_colossusStirT<=0){
    _colossusStirT=6+Math.random()*8;
    const A=ColossusConfig.anchor;
    if(Math.hypot(P.x-A.x,P.z-A.z)<80){
      if(typeof ftvShake==='function')ftvShake(0.12,.4);
      spawnParticles(A.x,A.y+40,A.z,0x2a2420,isTouch?2:4);
    }
  }
}

// ─── 100%: 覚醒シーケンス ───
let _colossusAwakenSeq=null;
function colossusAwaken(){
  if(ezColossusAwakened||ezColossusDefeated)return;
  ezColossusAwakened=true;
  if(!_colossusRoot)_colossusBuild();
  if(_colossusRoot)_colossusRoot.visible=true;
  _colossusAwakenSeq={phase:'silence',t:0};
  if(typeof audioDuckTo==='function')audioDuckTo(0.04,0.5);
}
function _colossusAnimateToActivePose(p){
  const e=p*p*(3-2*p);
  if(_colossusHead)_colossusHead.group.rotation.x=-0.12*e;
  if(_colossusArmL&&!ezColossus.parts.armL.destroyed)_colossusArmL.group.rotation.z=-0.18*e;
  if(_colossusArmR&&!ezColossus.parts.armR.destroyed)_colossusArmR.group.rotation.z=0.18*e;
  if(_colossusChest)_colossusChest.group.position.y=26+Math.sin(e*Math.PI)*0.6;
}
function _colossusUpdateAwakenSeq(dt){
  const s=_colossusAwakenSeq;s.t+=dt;
  if(s.phase==='silence'){
    if(s.t>=0.6){s.phase='warn';s.t=0;if(typeof destabShowBanner==='function')destabShowBanner('WARNING','',1.6);}
  }else if(s.phase==='warn'){
    if(s.t>=1.6){
      s.phase='reactivated';s.t=0;
      if(typeof destabShowBanner==='function')destabShowBanner('ANCIENT ENTITY','REACTIVATED',2.4);
      if(typeof audioMasterReset==='function')audioMasterReset();
      playTone(36,1.8,.3,'sine');if(typeof sfxTsarRumble==='function')sfxTsarRumble(0.4,2.6);
      for(const m of _colossusEyeMats)m.opacity=1;
      if(typeof ftvShake==='function')ftvShake(1.1,2.2);
      const A=ColossusConfig.anchor;
      if(typeof _destabCrumbleNear==='function')_destabCrumbleNear(A.x,A.y,A.z,6);
    }
  }else if(s.phase==='reactivated'){
    if(s.t>=2.4){s.phase='move';s.t=0;if(typeof destabShowBanner==='function')destabShowBanner('ABYSS COLOSSUS','終端巨神',2.6);}
  }else if(s.phase==='move'){
    const p=Math.min(1,s.t/3.2);
    _colossusAnimateToActivePose(p);
    if(p>=1){_colossusAwakenSeq=null;if(typeof showBonus==='function')showBonus('👹 巨大骸骨が完全に覚醒した');}
  }
}
let _colossusIdleT=0;
function _colossusIdle(dt){
  _colossusIdleT+=dt;const w=_colossusIdleT;
  if(_colossusHead)_colossusHead.group.rotation.y=Math.sin(w*0.4)*0.08;
  if(_colossusArmL&&!ezColossus.parts.armL.destroyed)_colossusArmL.group.rotation.x=Math.sin(w*0.5)*0.05;
  if(_colossusArmR&&!ezColossus.parts.armR.destroyed)_colossusArmR.group.rotation.x=Math.sin(w*0.5+1)*0.05;
  for(const m of _colossusEyeMats)m.opacity=0.85+Math.sin(w*2.2)*0.15;
  if(ezColossus.coreExposed&&_colossusCore&&ezColossus.core.hp>0)_colossusCore.material.opacity=0.6+Math.sin(w*3)*0.25;
}

// ─── ダメージ処理 ───
function _colossusActive(){return ezColossusAwakened&&!ezColossusDefeated&&!_colossusAwakenSeq;}
function _colossusLiveTargets(){
  const out=[];
  if(!ezColossus.parts.head.destroyed)out.push(Object.assign({name:'head'},_colossusPartCenter('head')));
  if(!ezColossus.parts.armL.destroyed)out.push(Object.assign({name:'armL'},_colossusPartCenter('armL')));
  if(!ezColossus.parts.armR.destroyed)out.push(Object.assign({name:'armR'},_colossusPartCenter('armR')));
  if(ezColossus.coreExposed){if(ezColossus.core.hp>0)out.push(Object.assign({name:'core'},_colossusPartCenter('core')));}
  else if(!ezColossus.parts.chest.destroyed)out.push(Object.assign({name:'chest'},_colossusPartCenter('chest')));
  return out;
}
function _colossusFlashPart(name){
  const meshes=_colossusPartMeshes(name);
  for(const m of meshes){if(m.material&&m.material.emissive){m.material.emissive.setHex(0xffffff);m.material.emissiveIntensity=1.1;}}
  setTimeout(()=>{for(const m of meshes){if(m.material&&m.material.emissive){m.material.emissive.setHex(0x000000);m.material.emissiveIntensity=0;}}},110);
}
function _colossusFlashCore(){
  if(!_colossusCore)return;
  _colossusCore.material.color.setHex(0xffffff);
  setTimeout(()=>{if(_colossusCore)_colossusCore.material.color.setHex(0x9a2aff);},110);
}
function _colossusRevealCore(){
  if(ezColossus.coreExposed)return;
  ezColossus.coreExposed=true;
  if(_colossusChest)for(const pl of _colossusChest.plates)pl.visible=false;
  if(_colossusCore)_colossusCore.material.opacity=0.75;
  if(typeof showAlert==='function')showAlert('⚠ ABYSS CORE EXPOSED');
  if(typeof ftvShake==='function')ftvShake(0.5,.5);
  playTone(90,.6,.2,'sine');
}
function _colossusDestroyPart(name){
  const p=ezColossus.parts[name];
  if(!p||p.destroyed)return;
  p.destroyed=true;p.hp=0;
  if(name!=='chest')ezColossus.destroyedCount++;
  if(typeof ftvShake==='function')ftvShake(0.5,.6);
  playTone(70,.4,.22,'sawtooth');setTimeout(()=>playTone(46,.5,.18,'sine'),140);
  const c=_colossusPartCenter(name);
  if(c)spawnParticles(c.x,c.y,c.z,0x2a2420,isTouch?3:7);
  if(name==='head'&&_colossusHead){
    for(const f of _colossusHead.fragments)f.visible=false;
    _colossusHead.shell.material.color.multiplyScalar(0.55);
    if(typeof showBonus==='function')showBonus('💀 HEAD DESTROYED');
  }else if(name==='armL'&&_colossusArmL){
    _colossusArmL.group.rotation.set(0.6,0,-1.9);
    for(const m of _colossusArmL.shell)m.material.color.multiplyScalar(0.5);
    if(typeof showBonus==='function')showBonus('💥 LEFT ARM DESTROYED');
  }else if(name==='armR'&&_colossusArmR){
    _colossusArmR.group.rotation.set(0.6,0,1.9);
    for(const m of _colossusArmR.shell)m.material.color.multiplyScalar(0.5);
    if(typeof showBonus==='function')showBonus('💥 RIGHT ARM DESTROYED');
  }else if(name==='chest'){
    if(typeof showBonus==='function')showBonus('💠 CHEST ARMOR SHATTERED');
  }
  if(!ezColossus.coreExposed&&(ezColossus.destroyedCount>=ColossusConfig.coreRevealNeeded||name==='chest'))_colossusRevealCore();
  colossusUpdateHUD();
}
function _colossusDamagePartByName(name,dmg){
  if(!_colossusActive())return;
  if(name==='core'){
    if(!ezColossus.coreExposed||ezColossus.core.hp<=0)return;
    ezColossus.core.hp=Math.max(0,ezColossus.core.hp-dmg);
    _colossusFlashCore();colossusUpdateHUD();
    if(ezColossus.core.hp<=0)colossusDefeat();
    return;
  }
  const p=ezColossus.parts[name];
  if(!p||p.destroyed)return;
  p.hp=Math.max(0,p.hp-dmg);
  _colossusFlashPart(name);colossusUpdateHUD();
  if(p.hp<=0)_colossusDestroyPart(name);
}
function _colossusAreaDamage(x,y,z,radius,baseDmg,kind){
  if(!_colossusActive())return false;
  const targets=_colossusLiveTargets();
  let hitAny=false;
  for(const t of targets){
    const d=Math.hypot(t.x-x,t.y-y,t.z-z),reach=radius+t.r;
    if(d>=reach)continue;
    const f=Math.max(0.25,1-d/reach);
    _colossusDamagePartByName(t.name,baseDmg*f);
    hitAny=true;
  }
  if(hitAny&&typeof ftvShake==='function')ftvShake(0.18,.35);
  return hitAny;
}
function _colossusAddDecal(x,y,z){
  if(!_colossusRoot)return;
  const A=ColossusConfig.anchor;
  if(_colossusDecals.length<COLOSSUS_MAX_DECALS){
    const mat=new THREE.MeshBasicMaterial({color:0x0a0608,fog:false});
    const mesh=new THREE.Mesh(_colossusDecalGeo,mat);mesh.frustumCulled=false;mesh.userData.isColossusDecal=true;
    _colossusRoot.add(mesh);_colossusDecals.push(mesh);
    mesh.position.set(x-A.x,y-A.y,z-A.z);
  }else{
    const mesh=_colossusDecals.shift();
    mesh.position.set(x-A.x,y-A.y,z-A.z);
    _colossusDecals.push(mesh);
  }
}

// ─── 武器ごとの接続窓口（各兵器ファイルの発射/着弾処理から呼ばれる） ───
// RAILGUN: 一直線に貫通し、当たった部位すべてに大ダメージ＋撃ち抜き跡
function colossusHitByRailgun(ox,oy,oz,dir,maxRange){
  if(!_colossusActive())return;
  const targets=_colossusLiveTargets();
  let hitAny=false;
  for(const t of targets){
    const rx=t.x-ox,ry=t.y-oy,rz=t.z-oz;
    const tt=Math.max(0,Math.min(maxRange,rx*dir.x+ry*dir.y+rz*dir.z));
    const px=ox+dir.x*tt,py=oy+dir.y*tt,pz=oz+dir.z*tt;
    const d=Math.hypot(t.x-px,t.y-py,t.z-pz);
    if(d<=t.r){_colossusDamagePartByName(t.name,ColossusConfig.dmg.railgun);_colossusAddDecal(px,py,pz);hitAny=true;}
  }
  if(hitAny&&typeof ftvShake==='function')ftvShake(0.32,.35);
}
// LONGINUS: CHEST CORE付近に特大ダメージ（着弾点が近いほど大きい）
function colossusHitByLonginus(x,y,z,radius){
  _colossusAreaDamage(x,y,z,radius,ColossusConfig.dmg.longinus,'longinus');
}
// TSAR BOMBA: 広範囲・複数部位同時。威力設定(scale)で伸びるが上限をかけ、連打だけで終わらせない
function colossusHitByTsar(x,y,z,radius,scale){
  const mul=Math.min(3,Math.sqrt(Math.max(0.05,Number(scale)||1)));
  _colossusAreaDamage(x,y,z,radius,ColossusConfig.dmg.tsarBase*mul,'tsar');
}
// TNT / 地殻貫通爆弾: どちらも explosives.js の共通爆発経路(_start)から呼ばれる
function colossusHitByExplosion(x,y,z,radius,kind,powerMul){
  const base=(kind==='crust'?ColossusConfig.dmg.crust:ColossusConfig.dmg.tnt)*(powerMul||1);
  _colossusAreaDamage(x,y,z,radius,base,kind);
}

// ─── 撃破シーケンス（通常の敵死亡演出ではなく、世界イベントとして処理する） ───
function colossusDefeat(){
  if(ezColossusDefeated)return;
  ezColossusDefeated=true;
  ezColossus.defeatPhase='coreCollapse';ezColossus.defeatT=0;
  if(typeof audioDuckTo==='function')audioDuckTo(0.08,0.4);
  if(typeof ftvShake==='function')ftvShake(0.8,1.2);
}
function _colossusUpdateDefeatSeq(dt){
  ezColossus.defeatT+=dt;const t=ezColossus.defeatT,ph=ezColossus.defeatPhase;
  if(ph==='coreCollapse'){
    if(_colossusCore){
      _colossusCore.material.opacity=Math.max(0,0.9-t*0.7);
      _colossusCore.material.color.setHex(Math.floor(t*20)%2===0?0xffffff:0x9a2aff);
    }
    if(t>=1.2){ezColossus.defeatPhase='dim';ezColossus.defeatT=0;}
  }else if(ph==='dim'){
    const q=Math.min(1,t/1.0);
    for(const m of _colossusEyeMats)m.opacity=Math.max(0,0.9*(1-q));
    if(_colossusCore)_colossusCore.material.opacity=0;
    if(t>=1.0){ezColossus.defeatPhase='collapse';ezColossus.defeatT=0;if(typeof ftvShake==='function')ftvShake(1.4,2.6);}
  }else if(ph==='collapse'){
    const q=Math.min(1,t/2.6);
    if(_colossusRoot){_colossusRoot.position.y=ColossusConfig.anchor.y-q*22;_colossusRoot.rotation.z=q*0.14;}
    if(t>=2.6){ezColossus.defeatPhase='shockwave';ezColossus.defeatT=0;}
  }else if(ph==='shockwave'){
    if(t<0.05){
      const A=ColossusConfig.anchor;
      if(typeof _destabCrumbleNear==='function')_destabCrumbleNear(A.x,A.y,A.z,10);
      if(typeof ftvShake==='function')ftvShake(1.0,1.0);
      playTone(34,1.4,.3,'sine');
      if(typeof destabShowBanner==='function')destabShowBanner('ANCIENT ENTITY TERMINATED','DESTABILIZATION COMPLETE',3.4);
    }
    if(t>=3.4){ezColossus.defeatPhase='silence';ezColossus.defeatT=0;}
  }else if(ph==='silence'){
    if(t>=2.2){
      ezColossus.defeatPhase='done';ezColossus.defeatT=0;
      if(typeof destabShowBanner==='function')destabShowBanner('SILENCE RESTORED','',3.0);
      if(typeof showBonus==='function')showBonus('🌀 終端界に、癒えない傷跡が残った');
    }
  }
  // 'done' フェーズ: 何もしない。骸骨は崩れた姿のまま永久に残る（世界に傷跡を残す）
}

// ─── 毎フレーム更新（end_zone.js の ezTick から、終端界にいる間だけ呼ばれる） ───
function colossusTick(dt){
  if(_colossusAwakenSeq)_colossusUpdateAwakenSeq(dt);
  else if(ezColossus.defeatPhase)_colossusUpdateDefeatSeq(dt);
  else if(ezColossusAwakened&&!ezColossusDefeated)_colossusIdle(dt);
  else if(!ezColossusAwakened&&typeof ezDestab!=='undefined'&&ezDestab>=75&&_colossusRoot&&_colossusRoot.visible)_colossusStirIdle(dt);
  colossusUpdateHUD();
}

// ─── HUD（新規UIは増やさず、既存のボスHPバーを終端界専用に転用する。
// 通常のWAVEボスは終端界(=クリエイティブ専用)では絶対に出現しないため競合しない） ───
function colossusUpdateHUD(){
  if(!$bossWrap)return;
  const inEz=typeof currentDimension!=='undefined'&&currentDimension==='endZone';
  if(!inEz||!ezColossusAwakened){$bossWrap.classList.remove('show');return;}
  $bossWrap.classList.add('show');
  $bossName.textContent='ABYSS COLOSSUS 終端巨神';
  if(ezColossusDefeated){
    $bossHpFill.style.width='0%';
    $bossPhase.textContent='TERMINATED';
    return;
  }
  if(ezColossus.coreExposed){
    const r=Math.max(0,ezColossus.core.hp/ezColossus.core.maxHp);
    $bossHpFill.style.width=(r*100)+'%';
    $bossHpFill.style.background='linear-gradient(90deg,#9a2aff,#ff3d6b)';
    $bossPhase.textContent='ABYSS CORE '+Math.ceil(r*100)+'%';
  }else{
    const p=ezColossus.parts,total=p.head.maxHp+p.chest.maxHp+p.armL.maxHp+p.armR.maxHp,cur=p.head.hp+p.chest.hp+p.armL.hp+p.armR.hp;
    const r=Math.max(0,cur/total);
    $bossHpFill.style.width=(r*100)+'%';
    $bossHpFill.style.background='linear-gradient(90deg,#ff1744,#ff6d00)';
    $bossPhase.textContent='HEAD'+(p.head.destroyed?'✅':'')+' / L-ARM'+(p.armL.destroyed?'✅':'')+' / R-ARM'+(p.armR.destroyed?'✅':'');
  }
}

// ─── 現在の状態をメッシュへ反映（マウント直後・ロード直後の両方で呼ぶ） ───
function _colossusApplyStateToMesh(){
  if(!_colossusRoot)return;
  const destab=typeof ezDestab!=='undefined'?ezDestab:0;
  _colossusRoot.visible=destab>=50||ezColossusAwakened||ezColossusDefeated;
  _colossusRoot.position.set(ColossusConfig.anchor.x,ColossusConfig.anchor.y,ColossusConfig.anchor.z);
  _colossusRoot.rotation.set(0,0,0);
  for(const m of _colossusEyeMats)m.opacity=ezColossusAwakened?0.9:(destab>=75?0.25:0);
  if(_colossusHead){
    for(const f of _colossusHead.fragments)f.visible=!ezColossus.parts.head.destroyed;
    _colossusHead.shell.material.color.setHex(ezColossus.parts.head.destroyed?0x171310:0x2b2620);
    _colossusHead.group.rotation.set(0,0,0);
  }
  if(_colossusArmL){
    const d=ezColossus.parts.armL.destroyed;
    _colossusArmL.group.rotation.set(d?0.6:0,0,d?-1.9:0);
    for(const m of _colossusArmL.shell)m.material.color.setHex(d?0x151210:0x2b2620);
  }
  if(_colossusArmR){
    const d=ezColossus.parts.armR.destroyed;
    _colossusArmR.group.rotation.set(d?0.6:0,0,d?1.9:0);
    for(const m of _colossusArmR.shell)m.material.color.setHex(d?0x151210:0x2b2620);
  }
  if(_colossusChest)for(const pl of _colossusChest.plates)pl.visible=!ezColossus.coreExposed;
  if(_colossusCore)_colossusCore.material.opacity=ezColossus.coreExposed?0.7:0;
  if(ezColossusDefeated){
    _colossusRoot.position.y=ColossusConfig.anchor.y-22;
    _colossusRoot.rotation.z=0.14;
    for(const m of _colossusEyeMats)m.opacity=0;
    if(_colossusCore)_colossusCore.material.opacity=0;
    ezColossus.defeatPhase='done';ezColossus.defeatT=0;
  }else if(ezColossusAwakened){
    _colossusAnimateToActivePose(1);
  }
}

// ─── セーブ/ロード（旧セーブにフィールドが無い場合は初期状態として扱う） ───
function colossusSaveState(){
  return{
    awakened:ezColossusAwakened,defeated:ezColossusDefeated,
    parts:{
      head:{hp:ezColossus.parts.head.hp,destroyed:ezColossus.parts.head.destroyed},
      chest:{hp:ezColossus.parts.chest.hp,destroyed:ezColossus.parts.chest.destroyed},
      armL:{hp:ezColossus.parts.armL.hp,destroyed:ezColossus.parts.armL.destroyed},
      armR:{hp:ezColossus.parts.armR.hp,destroyed:ezColossus.parts.armR.destroyed},
    },
    coreExposed:ezColossus.coreExposed,coreHp:ezColossus.core.hp,
  };
}
function colossusLoadState(saved){
  ezColossus=_colossusFreshState();
  ezColossusAwakened=false;ezColossusDefeated=false;
  _colossusAwakenSeq=null;
  if(saved&&typeof saved==='object'){
    ezColossusAwakened=!!saved.awakened;
    ezColossusDefeated=!!saved.defeated;
    if(saved.parts){
      for(const k of['head','chest','armL','armR']){
        const sp=saved.parts[k];if(!sp)continue;
        const p=ezColossus.parts[k];
        const hp=Number(sp.hp);
        p.hp=Number.isFinite(hp)?Math.max(0,Math.min(p.maxHp,hp)):p.maxHp;
        p.destroyed=!!sp.destroyed||p.hp<=0;
      }
    }
    ezColossus.coreExposed=!!saved.coreExposed;
    const coreHp=Number(saved.coreHp);
    ezColossus.core.hp=Number.isFinite(coreHp)?Math.max(0,Math.min(ezColossus.core.maxHp,coreHp)):ezColossus.core.maxHp;
    ezColossus.destroyedCount=['head','armL','armR'].filter(k=>ezColossus.parts[k].destroyed).length;
  }
  if(_colossusDecals.length&&_colossusRoot){
    for(const d of[..._colossusDecals]){_colossusRoot.remove(d);d.material.dispose();}
    _colossusDecals.length=0;
  }
  _colossusApplyStateToMesh();
  colossusUpdateHUD();
}
// ═══ 終端界の再生成（regenerateEndZone）から呼ばれる: 覚醒状態・部位耐久・
// コア露出・撃破状態のすべてを初期状態へ戻す ═══
function resetColossus(){
  colossusLoadState(null);
}
