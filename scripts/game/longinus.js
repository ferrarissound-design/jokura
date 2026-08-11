// ============================================================================
// jokura / longinus.js
// 🔱 LONGINUS（神の杖）: 軌道運動エネルギー兵器。TNT/ツァーリ・ボンバのように
//   「面」で地表を吹き飛ばす爆弾ではなく、天から巨大な槍が落下し世界を「点」で
//   縦に貫く神罰演出。着弾地点はプレイヤーが狙いを定めてから TARGET LOCK →
//   神罰メッセージ → 降下 → 着弾(縦穴穿孔+閃光+衝撃)→ 余波 の順に進む固定シーケンス
//   で、Tsar のような「物理落下→衝突点で起爆」ではなく「先に着弾点を決めてから
//   そこへ向けて降ってくる」方式なので、地形破壊は専用の縦穴カービング
//   (LonginusDestructionQueue)で行う。既存の ExplosionSystem 等の面的な爆発
//   処理は再利用しない（見た目が「巨大TNT」になるのを避けるため）。
//   ただしパーティクル/破片/カメラシェイク/音/フレーム分散破壊のパターンは
//   tsar_bomba.js と同じ既存関数を再利用する。
//
//   着弾地点は永久に「神罰汚染地帯(JUDGMENT ZONE)」として残る: 壁面は審判石
//   (JUDGMENT_STONE)の亀裂、表層は焦土(SCORCHED_EARTH)/神晶(DIVINE_GLASS)、
//   最深部にごく少数の神罰核(JUDGMENT_CORE、採掘可能なレアブロック)を埋め込む。
//
//   画面演出のテキスト/フェード類は longinus_sequence.js が担当する。
//
//   読み込み順: … tsar_bomba → tsar_sequence → longinus → longinus_sequence → hud → …
//   （関数はホイストされるので、後段ファイルの関数をここから呼んでも実行時には解決する）
// ============================================================================

const LonginusConfig={
  // ── 使用条件 ──
  cooldown:4.0,           // 演出完了後のクールダウン（秒）
  maxTargetRange:isTouch?34:42, // 着弾地点として選べる最大距離（描画範囲内に収め未生成チャンクへの空撃ちを防ぐ）
  minTargetRange:4,       // 近すぎる自爆的な指定を避ける下限
  confirm:true, // 使用前にYES/NO確認ダイアログを出すか

  // ── 発動シーケンス（秒） ──
  lockTime:1.3,          // Phase1: TARGET LOCK
  judgmentTime:2.1,       // Phase2: 神罰メッセージ
  descentHeight:isTouch?85:120, // Phase3: 降下開始高度（着弾点からの相対高さ）
  descentTime:1.6,        // Phase3: 降下にかかる時間
  aftermathTime:4.6,      // Phase5: 余波演出の長さ

  // ── 破壊規模: 横(クレーター)より縦(シャフト)を強調 ──
  craterRadius:isTouch?8:11,     // 表層クレーターの半径
  craterDepth:isTouch?5:6,       // クレーター(すり鉢)の深さ
  shaftRadiusTop:isTouch?3.4:4.4,// クレーター最深部=シャフト最上部の半径
  shaftRadiusBottom:isTouch?0.9:1.2, // シャフト最深部の半径
  shaftDepth:isTouch?27:36,      // 着弾地表からの総貫通深度（世界の地下限界≒32付近に合わせる）
  wallBand:1.4,                  // 壁面の「亀裂」帯の厚み
  jitterAmp:isTouch?1.0:1.4,     // 断面を不規則にする横ジッター量
  pocketCount:isTouch?3:6,       // 崩落/空洞ポケットの数
  pocketRadiusMin:1.1,pocketRadiusMax:2.4,

  // ── 負荷制御（フレーム分散） ──
  scanPerFrame:isTouch?2600:6200,
  blocksPerFrame:isTouch?220:440,
  maxDebris:isTouch?8:16,
  maxWallBlocks:isTouch?160:300, // 亀裂(審判石)化の上限
  maxZoneBlocks:isTouch?110:220, // 表層(焦土/神晶)化の上限

  // ── 演出 ──
  shakeImpact:1.15,
  flashPeak:0.92,flashFade:1.1,
  pillarHeight:isTouch?26:36,
};

// ══════════════════════════════════════════════════════════════════════════
// 照準: プレイヤーの視線方向から着弾地点(地表)を推定する。
//   castVoxel はマイニング用で射程がごく短い(t<=7)ため、ここでは
//   surfaceHeightAt を使った粗いレイマーチで遠距離の着弾点を求める
//   （aerial_bomb.js の落下スイープと同じ考え方を、逆向き＝視線から地形へ適用）。
// ══════════════════════════════════════════════════════════════════════════
const _lgnDir=new THREE.Vector3();
function _lgnPickTarget(){
  const C=LonginusConfig;
  camera.getWorldDirection(_lgnDir);
  const ox=camera.position.x,oy=camera.position.y,oz=camera.position.z;
  const dx=_lgnDir.x,dy=_lgnDir.y,dz=_lgnDir.z;
  const horiz=Math.hypot(dx,dz)||1e-6;
  let tx=null,tz=null;
  if(dy<-0.02){
    const steps=Math.ceil(C.maxTargetRange*2);
    for(let s=1;s<=steps;s++){
      const t=s*0.5;if(t>C.maxTargetRange)break;
      const x=ox+dx*t,y=oy+dy*t,z=oz+dz*t;
      const gy=surfaceHeightAt(Math.floor(x),Math.floor(z));
      if(y<=gy+1){tx=x;tz=z;break;}
    }
  }
  if(tx==null){
    const dist=Math.min(C.maxTargetRange,Math.max(6,C.maxTargetRange*0.55));
    tx=ox+(dx/horiz)*dist;tz=oz+(dz/horiz)*dist;
  }
  let ix=Math.floor(tx),iz=Math.floor(tz);
  const pdx=ix+0.5-P.x,pdz=iz+0.5-P.z,pd=Math.hypot(pdx,pdz);
  if(pd>C.maxTargetRange){const f=C.maxTargetRange/pd;ix=Math.floor(P.x+pdx*f);iz=Math.floor(P.z+pdz*f);}
  else if(pd<C.minTargetRange&&pd>0.001){const f=C.minTargetRange/pd;ix=Math.floor(P.x+pdx*f);iz=Math.floor(P.z+pdz*f);}
  const iy=Math.floor(surfaceHeightAt(ix,iz));
  return{x:ix,y:iy,z:iz};
}

// ══════════════════════════════════════════════════════════════════════════
// 見た目: 降下する槍（1度だけジオメトリ/マテリアルを作り、以降クローンして使う）
// ══════════════════════════════════════════════════════════════════════════
const _lgnShaftGeo=new THREE.CylinderGeometry(0.16,0.24,2.5,10);
const _lgnTipGeo=new THREE.ConeGeometry(0.24,1.15,10);
const _lgnPlasmaGeo=new THREE.CylinderGeometry(0.32,0.46,3.3,8,1,true);
const _lgnBodyMat=new THREE.MeshBasicMaterial({color:0xff3a1a});
const _lgnGlowMat=new THREE.MeshBasicMaterial({color:0xfff2c8,transparent:true,opacity:.9});
const _lgnPlasmaMat=new THREE.MeshBasicMaterial({color:0xbfe6ff,transparent:true,opacity:.32,depthWrite:false,side:THREE.DoubleSide});
function _makeLonginusSpear(){
  const root=new THREE.Object3D();
  const shaft=new THREE.Mesh(_lgnShaftGeo,_lgnBodyMat.clone());shaft.position.y=0.35;
  const tip=new THREE.Mesh(_lgnTipGeo,_lgnGlowMat.clone());tip.position.y=-1.1;
  const plasma=new THREE.Mesh(_lgnPlasmaGeo,_lgnPlasmaMat.clone());plasma.position.y=0.1;
  root.add(shaft,tip,plasma);
  markShadowCaster(root);
  return{root,shaft,tip,plasma};
}

// ── 着弾地点の照準演出（同心円・十字線・光柱・吸い込まれる粒子） ──
const _lgnRingGeoShared=new THREE.RingGeometry(0.9,1.0,40);
const _lgnMoteGeo=new THREE.BoxGeometry(.08,.08,.08);
function _lgnMakeReticle(cx,gy,cz){
  const C=LonginusConfig,R=C.craterRadius,col=0xdcefff;
  const grp=new THREE.Group();grp.position.set(cx,gy+0.06,cz);
  const rings=[];
  for(const f of[1,0.72,0.46,0.22]){
    const mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false});
    const m=new THREE.Mesh(_lgnRingGeoShared,mat);m.rotation.x=-Math.PI/2;m.scale.setScalar(R*f);
    grp.add(m);rings.push({mesh:m,mat,base:R*f});
  }
  const crossMat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.6,depthWrite:false});
  const crossMat2=crossMat.clone();
  const crossH=new THREE.Mesh(new THREE.BoxGeometry(R*2.2,0.03,0.06),crossMat);crossH.position.y=0.02;
  const crossV=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.03,R*2.2),crossMat2);crossV.position.y=0.02;
  grp.add(crossH,crossV);
  const pillarMat=new THREE.MeshBasicMaterial({color:0xfff2c8,transparent:true,opacity:.3,depthWrite:false,side:THREE.DoubleSide});
  const pillar=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.16,1,8,1,true),pillarMat);
  pillar.position.y=C.pillarHeight/2;pillar.scale.y=C.pillarHeight;
  grp.add(pillar);
  let light=null;
  if(!isTouch){light=new THREE.PointLight(0xfff2c8,1.5,Math.min(50,R*4));light.position.y=2;grp.add(light);}
  scene.add(grp);
  return{grp,rings,crossMat,crossMat2,pillar,pillarMat,light,moteT:0,motes:[]};
}
function _lgnSpawnMote(r){
  const C=LonginusConfig,ang=Math.random()*Math.PI*2,rad=C.craterRadius*(0.7+Math.random()*0.5);
  const from=new THREE.Vector3(Math.cos(ang)*rad,0.3+Math.random()*0.5,Math.sin(ang)*rad);
  const to=new THREE.Vector3(0,C.pillarHeight*0.5*Math.random(),0);
  const mat=new THREE.MeshBasicMaterial({color:0xfff2c8,transparent:true,opacity:.9});
  const mesh=new THREE.Mesh(_lgnMoteGeo,mat);mesh.position.copy(from);
  r.grp.add(mesh);
  const total=0.5+Math.random()*0.4;
  r.motes.push({mesh,mat,from,to,life:total,total});
}
function _lgnUpdateReticle(r,dt,fastPulse){
  if(!r)return;
  const t=performance.now()/1000;
  for(let i=0;i<r.rings.length;i++){
    const ring=r.rings[i],pulse=1+Math.sin(t*(fastPulse?4.2:1.6)+i*0.7)*0.05;
    ring.mesh.scale.setScalar(ring.base*pulse);
    ring.mesh.rotation.z+=dt*(0.15+i*0.08)*(i%2?1:-1);
  }
  const op=0.5+Math.sin(t*3)*0.15;r.crossMat.opacity=op;r.crossMat2.opacity=op;
  if(r.light)r.light.intensity=1.4+Math.sin(t*5)*0.4;
  r.moteT-=dt;
  if(r.moteT<=0&&r.motes.length<(isTouch?6:14)){r.moteT=isTouch?.16:.09;_lgnSpawnMote(r);}
  for(let i=r.motes.length-1;i>=0;i--){
    const m=r.motes[i];m.life-=dt;
    const k=Math.min(1,1-m.life/m.total);
    m.mesh.position.lerpVectors(m.from,m.to,Math.pow(k,0.6));
    m.mat.opacity=Math.max(0,(1-k)*0.9);
    if(m.life<=0){r.grp.remove(m.mesh);m.mat.dispose();r.motes.splice(i,1);}
  }
}
function _lgnDisposeReticle(r){
  if(!r)return;
  scene.remove(r.grp);
  for(const ring of r.rings)ring.mat.dispose();
  r.crossMat.dispose();r.crossMat2.dispose();r.pillarMat.dispose();
  for(const m of r.motes){r.grp.remove(m.mesh);m.mat.dispose();}
}
function _lgnCloudPunch(x,y,z){
  spawnParticles(x,y,z,0xffffff,isTouch?2:5);
  if(typeof ftvShake==='function')ftvShake(0.06,0.15);
}

// ══════════════════════════════════════════════════════════════════════════
// 状態
// ══════════════════════════════════════════════════════════════════════════
const _lgnStrikes=[];
let _lgnCD=0;
let _lgnFlashLevel=0,_lgnFlashEl=null;
function _lgnFlash(){if(!_lgnFlashEl)_lgnFlashEl=document.getElementById('longinusFlash');return _lgnFlashEl;}

// ══════════════════════════════════════════════════════════════════════════
// 使用（YES/NO確認 → 照準 → シーケンス開始）
// ══════════════════════════════════════════════════════════════════════════
function deployLonginus(){
  if(!gs.running)return;
  if(_lgnStrikes.length){showBonus('🔱 前回の神罰が進行中…');playTone(200,.08,.06,'square');return;}
  if(_lgnCD>0){showBonus('🔱 チャージ中… '+_lgnCD.toFixed(1)+'s');playTone(200,.08,.06,'square');return;}
  if(!isCreative()&&(inv.longinus|0)<=0){showBonus('🔱 LONGINUSがない！ クラフトしよう');playTone(180,.1,.08,'sawtooth');return;}
  const needConfirm=(typeof settings!=='undefined'&&settings.longinusConfirm===false)?false:LonginusConfig.confirm;
  if(needConfirm&&!confirm('🔱 本当に神罰を下しますか？ 世界に永久の傷跡が残ります。')){
    playTone(160,.18,.12,'sine');setTimeout(()=>playTone(120,.2,.1,'sine'),160);
    return;
  }
  const tgt=_lgnPickTarget();
  if(!isCreative()){inv.longinus=Math.max(0,(inv.longinus|0)-1);updateInvHUD();}
  _lgnBeginStrike(tgt.x,tgt.y,tgt.z);
}

function _lgnBeginStrike(tx,ty,tz){
  const cx=tx+0.5,cz=tz+0.5;
  const s={
    id:'lg'+Date.now().toString(36)+Math.floor(Math.random()*1e4),
    tx,ty,tz,cx,cz,
    phase:'lock',t:0,
    reticle:_lgnMakeReticle(cx,ty,cz),
    spear:null,
    seed:(Math.random()*2147483647)|0,
    completeShown:false,impactDone:false,cloudPunched:false,
  };
  _lgnStrikes.push(s);
  if(typeof LonginusSequence!=='undefined')LonginusSequence.lock(cx,ty,cz);
  playTone(1200,.12,.1,'sine');setTimeout(()=>playTone(900,.15,.08,'sine'),110);
  if(typeof audioDuckTo==='function')audioDuckTo(0.35,0.6); // 不穏な静寂: 環境音を弱める
}

function _lgnStartDescent(s){
  const C=LonginusConfig;
  s.phase='descent';s.t=0;
  s.spearStartY=s.ty+C.descentHeight;
  const built=_makeLonginusSpear();
  built.root.position.set(s.cx,s.spearStartY,s.cz);
  built.root.scale.setScalar(0.04);
  scene.add(built.root);
  s.spear=built;
  if(typeof LonginusSequence!=='undefined')LonginusSequence.descentStart();
  const d=Math.hypot(P.x-s.cx,P.y-s.ty,P.z-s.cz);
  sfxLonginusDescent(Math.max(.08,.5*(1-d/140)),C.descentTime+0.15);
}

function _lgnUpdateDescent(s,dt){
  const C=LonginusConfig;
  const p=Math.min(1,s.t/C.descentTime);
  const ease=p*p*p; // 終盤ほど加速する落下カーブ
  const y=s.spearStartY+(s.ty+1-s.spearStartY)*ease;
  if(s.spear){
    s.spear.root.position.y=y;
    s.spear.root.scale.setScalar(0.04+0.96*Math.min(1,p*1.15));
    s.spear.root.rotation.y+=dt*3;
    s.trailT=(s.trailT||0)-dt;
    if(s.trailT<=0){s.trailT=isTouch?.08:.045;spawnParticles(s.cx,y+0.6,s.cz,0xff8a1e,isTouch?1:2);}
  }
  if(!s.cloudPunched&&p>0.5){s.cloudPunched=true;_lgnCloudPunch(s.cx,y,s.cz);}
  const pd=Math.hypot(P.x-s.cx,P.z-s.cz);
  if(pd<120&&typeof ftvShake==='function'){const near=Math.max(0,1-pd/120);ftvShake(0.02+p*p*0.22*near,0.12);}
  if(p>=1&&!s.impactDone){s.impactDone=true;_lgnImpact(s);}
}

function _lgnImpact(s){
  const C=LonginusConfig;
  if(s.spear){scene.remove(s.spear.root);disposeObject3D(s.spear.root);s.spear=null;}
  const cx=s.tx+0.5,cz=s.tz+0.5,topY=s.ty;
  if(typeof LonginusSequence!=='undefined')LonginusSequence.silence();
  if(typeof audioDuckTo==='function')audioDuckTo(0.02,0.06); // 着弾直前の無音(約0.16秒)
  setTimeout(()=>{
    if(typeof audioMasterReset==='function')audioMasterReset();
    const d=Math.hypot(P.x-cx,P.y+1-topY,P.z-cz);
    sfxLonginusImpact(Math.max(.08,.55*(1-d/130)));
  },160);
  if(settings.flash!==false)_lgnFlashLevel=C.flashPeak;
  spawnParticles(cx,topY+1,cz,0xffffff,isTouch?8:16);
  spawnParticles(cx,topY+1,cz,0xdcefff,isTouch?4:8);
  if(typeof ftvShake==='function')ftvShake(C.shakeImpact*(settings.flash===false?1.3:1),0.9);
  if(typeof LonginusSequence!=='undefined')LonginusSequence.impactFlash(cx,topY,cz);
  _lgnVaporizeEntities(cx,topY+1,cz,C.craterRadius*1.35);
  LonginusDestructionQueue.begin(s.tx,s.ty,s.tz,s.seed);
  // 🌀 終端界: DESTABILIZATION加算 + CHEST COREなど重要部位へ大ダメージ
  if(typeof currentDimension!=='undefined'&&currentDimension==='endZone'){
    if(typeof destabOnWeaponUse==='function')destabOnWeaponUse('longinus',C.craterRadius);
    if(typeof colossusHitByLonginus==='function')colossusHitByLonginus(cx,topY+1,cz,C.craterRadius*1.6);
  }
  if(s.reticle&&s.reticle.pillarMat)s.reticle.pillarMat.opacity=0.95;
  s.phase='aftermath';s.t=0;
}

function _lgnUpdateAftermath(s,dt){
  const C=LonginusConfig;
  if(s.reticle&&s.reticle.pillarMat){
    const q=Math.min(1,s.t/C.aftermathTime);
    s.reticle.pillarMat.opacity=Math.max(0,0.95*(1-q)*(1-q));
    if(s.reticle.pillar)s.reticle.pillar.scale.y=Math.max(C.pillarHeight*0.2,C.pillarHeight*(1-q*0.7));
  }
  s.smokeT=(s.smokeT||0)-dt;
  if(s.smokeT<=0){s.smokeT=isTouch?.5:.28;spawnParticles(s.tx+.5+(Math.random()-.5)*4,s.ty+1+Math.random()*2,s.tz+.5+(Math.random()-.5)*4,0x3a352f,isTouch?1:2);}
  s.ashT=(s.ashT||0)-dt;
  if(s.ashT<=0){s.ashT=isTouch?.6:.35;spawnParticles(s.tx+.5+(Math.random()-.5)*6,s.ty+3+Math.random()*3,s.tz+.5+(Math.random()-.5)*6,0xdcefff,isTouch?1:2);}
  s.rockT=(s.rockT||0)-dt;
  if(s.rockT<=0){s.rockT=1.1+Math.random()*1.6;spawnBlockDebris(s.tx+.5+(Math.random()-.5)*C.craterRadius,s.ty+2,s.tz+.5+(Math.random()-.5)*C.craterRadius,JUDGMENT_STONE);}
  if(!s.completeShown&&s.t>=1.7){s.completeShown=true;if(typeof LonginusSequence!=='undefined')LonginusSequence.complete();}
}

function _lgnEndStrike(s){
  _lgnDisposeReticle(s.reticle);
  if(s.spear){scene.remove(s.spear.root);disposeObject3D(s.spear.root);}
  _lgnCD=LonginusConfig.cooldown;
  if(typeof LonginusSequence!=='undefined')LonginusSequence.finish();
}

function updateLonginus(dt){
  if(_lgnCD>0)_lgnCD=Math.max(0,_lgnCD-dt);
  const C=LonginusConfig;
  for(let i=_lgnStrikes.length-1;i>=0;i--){
    const s=_lgnStrikes[i];
    s.t+=dt;
    if(s.phase==='lock'){
      _lgnUpdateReticle(s.reticle,dt,false);
      if(s.t>=C.lockTime){s.phase='judgment';s.t=0;if(typeof LonginusSequence!=='undefined')LonginusSequence.judgment();playTone(90,.5,.14,'sine');}
    }else if(s.phase==='judgment'){
      _lgnUpdateReticle(s.reticle,dt,false);
      if(s.t>=C.judgmentTime)_lgnStartDescent(s);
    }else if(s.phase==='descent'){
      _lgnUpdateReticle(s.reticle,dt,true);
      _lgnUpdateDescent(s,dt);
    }else if(s.phase==='aftermath'){
      _lgnUpdateAftermath(s,dt);
      if(s.t>=C.aftermathTime){_lgnEndStrike(s);_lgnStrikes.splice(i,1);}
    }
  }
  LonginusDestructionQueue.update();
  if(typeof LonginusSequence!=='undefined')LonginusSequence.update(dt);
  if(_lgnFlashLevel>0){
    _lgnFlashLevel=Math.max(0,_lgnFlashLevel-dt/Math.max(0.1,C.flashFade));
    const el=_lgnFlash();if(el)el.style.opacity=String(_lgnFlashLevel);
  }else{const el=_lgnFlash();if(el&&el.style.opacity!=='0')el.style.opacity='0';}
}

// ══════════════════════════════════════════════════════════════════════════
// エンティティ消滅: ダメージ計算やノックバックを一切介さず、着弾半径内の敵・
// ボス・ドラゴン・モブ・動物・村人問わず即座に消滅させる（tsarForceKill を
// そのまま再利用し、防御・無敵・フェーズ・復活を迂回する）。
// ══════════════════════════════════════════════════════════════════════════
function _lgnVaporizeEntities(cx,cy,cz,R){
  const R2=R*R,within=(p)=>{const dx=p.x-cx,dy=p.y-cy,dz=p.z-cz;return dx*dx+dy*dy+dz*dz<=R2;};
  if(typeof enemies!=='undefined')for(const e of[...enemies]){if(!e.dead&&within(e.root.position))tsarForceKill.enemy(e);}
  if(typeof boss!=='undefined'&&boss&&within(boss.root.position))tsarForceKill.boss();
  if(typeof dragon!=='undefined'&&dragon&&within(dragon.root.position))tsarForceKill.dragon();
  if(typeof mobs!=='undefined')for(const m of[...mobs]){if(!m.dead&&within(m.root.position))tsarForceKill.mob(m);}
  if(typeof humanoids!=='undefined')for(const h of[...humanoids]){const dead=typeof HUMANOID_STATES!=='undefined'&&h.state===HUMANOID_STATES.DEAD;if(!dead&&within(h.root.position))tsarForceKill.humanoid(h);}
  if(typeof pet!=='undefined'&&pet&&pet.downT<=0&&within(pet.root.position))tsarForceKill.pet();
  // 着弾半径内のプレイヤー（クリエイティブ/無敵以外）も問答無用で即死させる
  if(!isCreative()&&!(typeof godMode!=='undefined'&&godMode)){
    const pp={x:P.x,y:P.y+1,z:P.z};
    if(within(pp)){P.invT=0;if(typeof dmgPlayer==='function')dmgPlayer(99999);}
  }
}

// ══════════════════════════════════════════════════════════════════════════
// LonginusDestructionQueue: 縦穴穿孔（フレーム分散スキャン→破壊→壁面/表層/最深部の
// 「神罰汚染地帯」ブロック置換）。真円/直筒ではなく、上部は広いクレーター・
// 深くなるほど細くなるシャフト・複数の不規則な崩落ポケットで形を作る。
// ══════════════════════════════════════════════════════════════════════════
function _lgnRadiusAt(d,C){
  if(d<=0)return C.craterRadius;
  if(d>=C.shaftDepth)return 0;
  if(d<=C.craterDepth){
    const t=d/C.craterDepth;
    return C.shaftRadiusTop+(C.craterRadius-C.shaftRadiusTop)*Math.pow(1-t,1.5);
  }
  const t=(d-C.craterDepth)/Math.max(0.001,C.shaftDepth-C.craterDepth);
  return C.shaftRadiusBottom+(C.shaftRadiusTop-C.shaftRadiusBottom)*Math.pow(1-t,0.85);
}
const LonginusDestructionQueue={
  active:null,_debris:0,
  begin(tx,ty,tz,seed){
    const C=LonginusConfig,cx=tx+0.5,cz=tz+0.5,topY=ty;
    const pockets=[];
    for(let i=0;i<C.pocketCount;i++){
      const d=C.craterDepth+2+Math.random()*Math.max(1,C.shaftDepth-C.craterDepth-5);
      const rad=_lgnRadiusAt(d,C),ang=Math.random()*Math.PI*2,off=rad*(0.1+Math.random()*0.55);
      pockets.push({x:cx+Math.cos(ang)*off,y:topY-d,z:cz+Math.sin(ang)*off,r:C.pocketRadiusMin+Math.random()*(C.pocketRadiusMax-C.pocketRadiusMin)});
    }
    const R=Math.ceil(C.craterRadius+C.jitterAmp+C.pocketRadiusMax+2);
    const x0=tx-R,z0=tz-R,span=R*2+1;
    const minY=Math.max(-40,topY-C.shaftDepth-1),heightN=Math.max(1,topY-minY+1);
    this._debris=0;
    this.active={
      tx,tz,cx,cz,topY,seed,pockets,x0,z0,span,minY,heightN,
      total:span*span*heightN,cursor:0,
      blocks:[],wallCandidates:[],bottomY:topY,
      destroy:0,sorted:false,destroyed:false,wallDone:false,rimDone:false,coreDone:false,done:false,
    };
  },
  _scanCell(t,i,C){
    const span=t.span,xi=i%span,rem=Math.floor(i/span),zi=rem%span,yi=Math.floor(rem/span);
    const x=t.x0+xi,z=t.z0+zi,y=t.topY-yi,d=yi;
    const k=vKey(x,y,z),v=voxels[k];if(!v||!v.active)return;
    const jitter=(rand2(x,z,t.seed)-0.5)*2*C.jitterAmp;
    const hd=Math.hypot(x+0.5-t.cx,z+0.5-t.cz)-jitter;
    const radiusAtD=_lgnRadiusAt(d,C);
    let hit=hd<radiusAtD;
    if(!hit)for(const p of t.pockets){if(Math.hypot(x+0.5-p.x,y+0.5-p.y,z+0.5-p.z)<p.r){hit=true;break;}}
    if(hit){t.blocks.push({x,y,z,k,ti:v.ti,d,playerPlaced:v.playerPlaced});if(y<t.bottomY)t.bottomY=y;return;}
    if(d>C.craterDepth&&hd<radiusAtD+C.wallBand&&t.wallCandidates.length<C.maxWallBlocks&&Math.random()<0.22)t.wallCandidates.push({x,y,z});
  },
  _destroyOne(t){
    const b=t.blocks[t.destroy++],v=voxels[b.k];
    if(!v||!v.active||v.ti!==b.ti)return;
    if(typeof ftvOnBlockBroken==='function')ftvOnBlockBroken(b.k);
    if(typeof sucOnBlockBroken==='function')sucOnBlockBroken(b.k);
    if(typeof sccOnBlockBroken==='function')sccOnBlockBroken(b.k);
    const C=LonginusConfig;
    if(this._debris<C.maxDebris&&Math.hypot(b.x-P.x,b.z-P.z)<24&&Math.random()<0.4){spawnBlockDebris(b.x+.5,b.y+.5,b.z+.5,v.ti);this._debris++;}
    if(b.playerPlaced)delete worldEdits.placed[b.k];else worldEdits.removed[b.k]=true;
    removeBlock(b.x,b.y,b.z);
  },
  _convertWalls(t){
    let n=0;const C=LonginusConfig;
    for(const w of t.wallCandidates){
      if(n++>=C.maxWallBlocks)break;
      const k=vKey(w.x,w.y,w.z),v=voxels[k];
      if(!v||!v.active||v.ti===WATER_BLOCK||v.ti===LAVA_BLOCK||v.ti===JUDGMENT_STONE)continue;
      removeBlock(w.x,w.y,w.z);
      addBlock(w.x,w.y,w.z,JUDGMENT_STONE,true,true,0);
      worldEdits.placed[k]=JUDGMENT_STONE|(0<<5);delete worldEdits.removed[k];
    }
  },
  _convertRim(t,C){
    const R=Math.ceil(C.craterRadius*1.2);let n=0;
    for(let dx=-R;dx<=R&&n<C.maxZoneBlocks;dx++)for(let dz=-R;dz<=R&&n<C.maxZoneBlocks;dz++){
      const x=t.tx+dx,z=t.tz+dz;
      const hd=Math.hypot(x+0.5-t.cx,z+0.5-t.cz);if(hd>C.craterRadius*1.2)continue;
      let found=null;
      for(let y=t.topY+2;y>=t.topY-C.craterDepth-3;y--){
        const v=voxels[vKey(x,y,z)];
        if(v&&v.active){if(v.ti!==WATER_BLOCK&&v.ti!==LAVA_BLOCK&&v.ti!==JUDGMENT_STONE&&v.ti!==DIVINE_GLASS&&v.ti!==SCORCHED_EARTH)found={y,playerPlaced:v.playerPlaced};break;}
      }
      if(!found)continue;
      n++;
      const nti=Math.random()<0.32?DIVINE_GLASS:SCORCHED_EARTH,k=vKey(x,found.y,z);
      removeBlock(x,found.y,z);
      addBlock(x,found.y,z,nti,true,true,0);
      worldEdits.placed[k]=nti|(0<<5);delete worldEdits.removed[k];
    }
  },
  _placeCores(t,C){
    const n=1+Math.floor(Math.random()*Math.min(3,C.pocketCount||3));
    const baseY=Math.max(t.minY+1,t.bottomY-1);
    const spots=[[0,0],[1,0],[-1,0],[0,1],[0,-1]];
    let placed=0;
    for(let i=0;i<spots.length&&placed<n;i++){
      if(i>0&&Math.random()<0.4)continue;
      const[ox,oz]=spots[i],x=t.tx+ox,z=t.tz+oz,y=baseY-(i>0?Math.floor(Math.random()*2):0);
      const k=vKey(x,y,z),v=voxels[k];
      if(v&&(v.ti===WATER_BLOCK||v.ti===LAVA_BLOCK))continue;
      if(v)removeBlock(x,y,z);
      addBlock(x,y,z,JUDGMENT_CORE,true,false,0);
      worldEdits.placed[k]=JUDGMENT_CORE|(0<<5);delete worldEdits.removed[k];
      placed++;
    }
  },
  update(){
    const t=this.active;if(!t||t.done)return;
    const C=LonginusConfig,prevDefer=_deferDirty;_deferDirty=true;
    let sb=t.scanPerFrame||C.scanPerFrame;
    while(t.cursor<t.total&&sb-->0)this._scanCell(t,t.cursor++,C);
    if(t.cursor>=t.total&&!t.sorted){t.blocks.sort((a,b)=>a.d-b.d);t.sorted=true;}
    if(t.sorted&&!t.destroyed){
      let db=C.blocksPerFrame;
      while(t.destroy<t.blocks.length&&db-->0)this._destroyOne(t);
      if(t.destroy>=t.blocks.length)t.destroyed=true;
    }
    if(t.destroyed&&!t.wallDone){this._convertWalls(t);t.wallDone=true;}
    else if(t.wallDone&&!t.rimDone){this._convertRim(t,C);t.rimDone=true;}
    else if(t.rimDone&&!t.coreDone){this._placeCores(t,C);t.coreDone=true;t.done=true;}
    _deferDirty=prevDefer;if(!prevDefer)flushDirtyChunks();
  },
  reset(){this.active=null;this._debris=0;},
};

// ══════════════════════════════════════════════════════════════════════════
// UI（モバイル発動ボタン）
// ══════════════════════════════════════════════════════════════════════════
function updateLonginusBtn(){
  const btn=document.getElementById('longinusBtn');if(!btn)return;
  const has=isCreative()||(inv.longinus|0)>0;
  const show=!isDesktop&&gs.running&&has;
  btn.style.display=show?'':'none';
  if(show){const n=isCreative()?'∞':(inv.longinus|0);btn.innerHTML='<span class="aIcon">🔱</span><span class="aLabel">LONGINUS '+n+'</span>';}
}

// ══════════════════════════════════════════════════════════════════════════
// セーブ/リセット: 進行中の演出（数秒の固定シーケンス）自体は保存対象にせず、
// クールダウンだけ引き継ぐ。着弾済みのクレーター/ブロックは通常の worldEdits
// 経由で既に保存されているので、これとは無関係に正しく復元される。
// ══════════════════════════════════════════════════════════════════════════
function longinusSaveState(){return{cd:_lgnCD};}
function longinusLoadState(saved){
  if(!saved||typeof saved!=='object')return;
  _lgnCD=Math.max(0,Math.min(30,Number(saved.cd)||0));
}
function resetLonginus(){
  if(typeof LonginusSequence!=='undefined')LonginusSequence.abort();
  for(const s of _lgnStrikes){
    _lgnDisposeReticle(s.reticle);
    if(s.spear){scene.remove(s.spear.root);disposeObject3D(s.spear.root);}
  }
  _lgnStrikes.length=0;
  LonginusDestructionQueue.reset();
  _lgnCD=0;_lgnFlashLevel=0;
  const el=_lgnFlash();if(el)el.style.opacity='0';
}

window.deployLonginus=deployLonginus;
