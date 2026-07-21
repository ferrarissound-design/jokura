// ============================================================================
// jokura / aerial_bomb.js
// 🌋 地殻貫通爆弾（航空TNT）: 飛行中にのみ投下できる空中爆撃兵器。
//   空から落下 → 地表着弾 → 地表大爆発 → 地下へ貫通 → 深部で複数回の連鎖爆発
// という二段構成の破壊を起こす。専用の落下エンティティを持つが、破壊処理・
// エフェクト・ダメージは explosives.js の ExplosionSystem / ExplosionEffectManager を
// 再利用する（爆発イベントを時間差でキューへ流し込むだけ）。負荷対策も
// ExplosionSystem 側の「破壊キュー＋フレーム分散＋予算制限」がそのまま効く。
//
// 読み込み順: … world → combat → entities → humanoids → explosives → aerial_bomb → …
// なので ExplosionSystem 等はこの時点で定義済み。
//
// 拡張方針: CrustBombConfig.variants に別種（焼夷弾・水中爆雷等）を足しやすいよう、
// 見た目/爆発プロファイルは定数側に寄せている。
// ============================================================================

const CrustBombConfig={
  // ── 使用条件 ──
  minAltitude:6,        // 地表からこの高さ以上でないと投下不可（自爆防止＆演出のため）
  cooldown:2.4,         // 連射クールダウン（秒）

  // ── 落下挙動 ──
  spawnBelow:2.2,       // プレイヤーの何ブロック下に生成するか
  gravity:26,           // 落下加速度
  inheritVel:0.55,      // プレイヤー水平速度の継承率（向き・移動の影響）
  maxFall:62,           // 終端速度
  spinSpeed:5.0,        // 回転速度（rad/s）
  wobble:0.14,          // 揺れ幅（rad）
  trailInterval:0.045,  // 煙トレイルの発生間隔（秒）
  fuseTimeout:6.0,      // 万一何にも当たらなかった場合の強制起爆（秒）

  // ── 第1段階：地表爆発 ──
  surfaceRadius:isTouch?14:18,   // 地表クレーターの半径
  surfacePowerMul:1.9,           // 通常TNT比の破壊力倍率（地表）

  // ── 第2段階：地下貫通・深度別連鎖爆発 ──
  // depth = 着弾点からの下方向ブロック数 / radius = その深度での爆発半径。
  // この世界の地下は概ね y≈-32 までなので、要件の例(10/25/45/70)を世界規模に
  // 合わせて圧縮してある（下記 depthClampY でさらに床抜けを防ぐ）。
  depthBlasts:[
    {depth:9,  radius:isTouch?9:11,  powerMul:1.5},  // 中規模
    {depth:18, radius:isTouch?11:14, powerMul:1.7},  // 中規模
    {depth:28, radius:isTouch?14:18, powerMul:2.1},  // 大規模
    {depth:38, radius:isTouch?17:23, powerMul:2.6},  // 超大規模（深部の巨大空洞）
  ],
  shaftStep:6,          // 縦孔（貫通孔）を刻むブラストの深さ間隔
  shaftRadiusMin:4,     // 縦孔の半径下限
  shaftRadiusMax:8,     // 縦孔の半径上限
  chainInterval:0.14,   // 連鎖ブラストを発火する時間差（秒）※負荷分散と「地下から遅れて響く」演出
  radiusJitter:0.28,    // 半径のランダムゆらぎ（0-1）: 真円を避け自然な崩落感を出す
  horizJitter:2.4,      // 各ブラストの水平ズレ最大（ブロック）: 縦孔を不規則にする
  depthClampY:-34,      // これより下では爆発させない（岩盤/未生成領域の空撃ちを防ぐ）
  obsidianBreakRadius:6,// 爆心からこの距離内なら黒曜石も破壊する（近接のみ）

  // ── 演出 ──
  shakeSurface:0.75,    // 着弾時のカメラシェイク強度
  shakeChain:0.28,      // 連鎖爆発ごとのカメラシェイク強度
};

// ── 落下エンティティの見た目（1度だけ生成、以降クローン） ──
const _crustBombGeo=new THREE.BoxGeometry(0.9,1.15,0.9);
const _crustBombMat=new THREE.MeshStandardMaterial({color:0x2a1a1a,roughness:.55,metalness:.5,emissive:0x330000,emissiveIntensity:.4});
const _crustBombStripeMat=new THREE.MeshBasicMaterial({color:0xff5a1e});
const _crustBombFinMat=new THREE.MeshStandardMaterial({color:0x14100f,roughness:.7,metalness:.3});
const _crustBombCoreMat=new THREE.MeshBasicMaterial({color:0xffcc44,transparent:true,opacity:.9});
function _makeCrustBombMesh(){
  const root=new THREE.Object3D();
  const body=new THREE.Mesh(_crustBombGeo,_crustBombMat.clone());
  const stripe=new THREE.Mesh(new THREE.BoxGeometry(0.94,0.16,0.94),_crustBombStripeMat.clone());stripe.position.y=0.16;
  const stripe2=new THREE.Mesh(new THREE.BoxGeometry(0.94,0.12,0.94),_crustBombStripeMat.clone());stripe2.position.y=-0.22;
  const core=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.3,0.3),_crustBombCoreMat.clone());core.position.y=-0.62;
  // 尾翼（落下感）
  const fins=[];
  for(let i=0;i<4;i++){const f=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.5,0.5),_crustBombFinMat.clone());const a=i*Math.PI/2;f.position.set(Math.cos(a)*0.5,0.5,Math.sin(a)*0.5);f.rotation.y=-a;fins.push(f);}
  root.add(body,stripe,stripe2,core,...fins);
  markShadowCaster(root);
  return{root,core};
}

// 着弾予測リング（真下の地表に投影する軽い視覚補助）
const _crustAimGeo=new THREE.RingGeometry(1.6,2.2,24);
const _crustAimMat=new THREE.MeshBasicMaterial({color:0xff3b1e,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false});

const _crustBombs=[];      // 落下中のエンティティ
const _crustBlastQueue=[]; // 時間差で発火する爆発イベント {t, ev}
let _crustBombCD=0;        // クールダウン残り
let _crustTrailAcc=0;

// ─── 使用条件チェック ───
function _crustBombAltitude(){
  // 真下の地表からの高さ。surfaceHeightAt は「今その場に実際に地面があるか」を返す。
  const gy=surfaceHeightAt(Math.floor(P.x),Math.floor(P.z));
  return P.y-gy;
}
function canDeployCrustBomb(){
  if(!gs.running)return false;
  if(!P.flying){showBonus('🌋 地殻貫通爆弾は飛行中のみ使用可能');playTone(180,.12,.08,'sawtooth');return false;}
  if(_crustBombCD>0){showBonus('🌋 チャージ中… '+_crustBombCD.toFixed(1)+'s');playTone(220,.08,.06,'square');return false;}
  if(_crustBombAltitude()<CrustBombConfig.minAltitude){showBonus('🌋 高度不足！ もっと上空へ（最低'+CrustBombConfig.minAltitude+'ブロック）');playTone(200,.12,.08,'sawtooth');return false;}
  if(!isCreative()&&inv.crustBomb<=0){showBonus('🌋 地殻貫通爆弾がない！ クラフトしよう');playTone(180,.1,.08,'sawtooth');return false;}
  return true;
}

// ─── 投下 ───
function deployCrustBomb(){
  if(!canDeployCrustBomb())return;
  if(!isCreative()){inv.crustBomb--;updateInvHUD();}
  _crustBombCD=CrustBombConfig.cooldown;
  const C=CrustBombConfig;
  const built=_makeCrustBombMesh();
  const sx=P.x,sy=P.y-C.spawnBelow,sz=P.z;
  built.root.position.set(sx,sy,sz);
  scene.add(built.root);
  // 着弾予測リング
  const aim=new THREE.Mesh(_crustAimGeo,_crustAimMat.clone());aim.rotation.x=-Math.PI/2;scene.add(aim);
  // プレイヤーの移動速度・向きを少し継承（狙って落とせる）
  const yawDir={x:Math.sin(yaw),z:Math.cos(yaw)};
  const vx=_crustLastMoveX*C.inheritVel+yawDir.x*0.8;
  const vz=_crustLastMoveZ*C.inheritVel+yawDir.z*0.8;
  _crustBombs.push({root:built.root,core:built.core,aim,x:sx,y:sy,z:sz,px:sx,py:sy,pz:sz,vx,vy:-2,vz,spin:Math.random()*Math.PI*2,age:0});
  playTone(520,.09,.09,'square');setTimeout(()=>playTone(360,.12,.08,'square'),90);
  showBonus('🌋 地殻貫通爆弾 投下！');
}
// プレイヤーの直近の水平移動量（deploy時の慣性継承に使う）。main.js から毎フレーム更新。
let _crustLastMoveX=0,_crustLastMoveZ=0;
function crustBombNoteMove(mx,mz){_crustLastMoveX=mx;_crustLastMoveZ=mz;}

// ─── 落下更新＆衝突判定 ───
function updateCrustBombs(dt){
  if(_crustBombCD>0)_crustBombCD=Math.max(0,_crustBombCD-dt);
  const C=CrustBombConfig;
  _crustTrailAcc+=dt;
  const emitTrail=_crustTrailAcc>=C.trailInterval;if(emitTrail)_crustTrailAcc=0;
  for(let i=_crustBombs.length-1;i>=0;i--){
    const b=_crustBombs[i];
    b.age+=dt;
    b.px=b.x;b.py=b.y;b.pz=b.z;
    b.vy=Math.max(-C.maxFall,b.vy-C.gravity*dt);
    b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;
    // 回転＆揺れ（落下感）
    b.spin+=C.spinSpeed*dt;
    b.root.position.set(b.x,b.y,b.z);
    b.root.rotation.y=b.spin;
    b.root.rotation.z=Math.sin(b.age*7)*C.wobble;
    b.root.rotation.x=Math.sin(b.age*5+1)*C.wobble;
    if(b.core)b.core.material.opacity=0.6+Math.abs(Math.sin(b.age*12))*0.4;
    // 煙トレイル
    if(emitTrail){spawnParticles(b.x,b.y+.4,b.z,0x444038,2);if((i&1)===0)spawnParticles(b.x,b.y+.2,b.z,0x99552a,1);}
    // 着弾予測リング: 真下の地表へ投影
    if(b.aim){const gy=surfaceHeightAt(Math.floor(b.x),Math.floor(b.z));b.aim.position.set(b.x,gy+1.02,b.z);const k=Math.min(1,(b.y-gy)/24);b.aim.material.opacity=.2+.4*(1-k);b.aim.scale.setScalar(0.7+k*0.6);}
    // ── 衝突判定: 前フレーム位置→現在位置を線分マーチ（高速落下のすり抜け防止） ──
    const hit=_crustBombSweep(b);
    if(hit||b.age>=C.fuseTimeout){
      const ix=hit?hit.x:Math.floor(b.x),iy=hit?hit.y:Math.floor(b.y),iz=hit?hit.z:Math.floor(b.z);
      _detonateCrustBomb(ix,iy,iz);
      scene.remove(b.root);disposeObject3D(b.root);
      if(b.aim){scene.remove(b.aim);b.aim.material.dispose();}
      _crustBombs.splice(i,1);
    }
  }
  _drainCrustBlastQueue(dt);
}
// 線分レイマーチ: prev→cur を細かく刻んで最初に当たる固体/水/敵を探す。
function _crustBombSweep(b){
  const dx=b.x-b.px,dy=b.y-b.py,dz=b.z-b.pz;
  const len=Math.hypot(dx,dy,dz);
  const steps=Math.max(1,Math.ceil(len*2));
  for(let s=1;s<=steps;s++){
    const t=s/steps,x=b.px+dx*t,y=b.py+dy*t,z=b.pz+dz*t;
    // 地形/建築ブロック・水への接触
    const v=voxels[vKey(Math.floor(x),Math.floor(y),Math.floor(z))];
    if(v&&v.active)return{x:Math.floor(x),y:Math.floor(y),z:Math.floor(z)};
    // 敵への接触（近接起爆）
    for(const e of enemies){if(e.dead)continue;const ep=e.root.position;if(Math.abs(ep.x-x)<0.9&&Math.abs(ep.y+0.9-y)<1.4&&Math.abs(ep.z-z)<0.9)return{x:Math.floor(x),y:Math.floor(y),z:Math.floor(z)};}
    if(boss){const p=boss.root.position;if(Math.abs(p.x-x)<boss.sc&&Math.abs(p.y-y)<boss.sc*1.6&&Math.abs(p.z-z)<boss.sc)return{x:Math.floor(x),y:Math.floor(y),z:Math.floor(z)};}
    // 地表面より下に潜ったら起爆（3D彫り込みで voxel が疎な地形の保険）
    if(y<=surfaceHeightAt(Math.floor(x),Math.floor(z)))return{x:Math.floor(x),y:Math.floor(y),z:Math.floor(z)};
  }
  return null;
}

// ─── 二段爆発のスケジューリング ───
function _crustBlastEv(x,y,z,radius,powerMul){
  return{x,y,z,radius,owner:'player',sourceKey:null,obsidianBreak:CrustBombConfig.obsidianBreakRadius,powerMul,crust:true};
}
function _detonateCrustBomb(ix,iy,iz){
  const C=CrustBombConfig;
  const cx=ix+0.5,cz=iz+0.5,topY=iy+0.5;
  const jitterXZ=()=>[cx+(Math.random()-.5)*C.horizJitter,cz+(Math.random()-.5)*C.horizJitter];
  const jRad=(r)=>r*(1-C.radiusJitter*0.5+Math.random()*C.radiusJitter);
  let step=0;
  // 第1段階: 地表爆発（即時・大クレーター）
  _crustBlastQueue.push({t:0,ev:_crustBlastEv(cx,topY,cz,jRad(C.surfaceRadius),C.surfacePowerMul),shake:C.shakeSurface});
  const deepest=C.depthBlasts[C.depthBlasts.length-1].depth;
  // 貫通孔（縦孔）: 地表から深部まで細い爆発を時間差で刻む → 上大・中細の形
  for(let d=C.shaftStep;d<deepest;d+=C.shaftStep){
    step++;
    const y=topY-d;if(y<C.depthClampY)break;
    const[jx,jz]=jitterXZ();
    const r=C.shaftRadiusMin+Math.random()*(C.shaftRadiusMax-C.shaftRadiusMin);
    _crustBlastQueue.push({t:step*C.chainInterval,ev:_crustBlastEv(jx,y,jz,r,1.3),shake:C.shakeChain*0.6});
  }
  // 深度別の大爆発（最深部が最大＝巨大空洞）
  for(const blast of C.depthBlasts){
    step++;
    const y=topY-blast.depth;if(y<C.depthClampY)continue;
    const[jx,jz]=jitterXZ();
    _crustBlastQueue.push({t:step*C.chainInterval+0.05,ev:_crustBlastEv(jx,y,jz,jRad(blast.radius),blast.powerMul),shake:C.shakeChain});
  }
  // 着弾の派手な演出（閃光・黒煙・衝撃波音・カメラシェイク）
  _crustSurfaceFlash(cx,topY,cz);
  ftvShake(C.shakeSurface,0.85);
  const d=Math.hypot(P.x-cx,P.y+1-topY,P.z-cz),vol=Math.max(.05,.5*(1-d/90));
  playTone(42,.7,vol,'sine');playTone(90,.4,vol*.7,'square');playTone(150,.25,vol*.5,'sawtooth');
  showAlert('🌋 地殻貫通爆弾 着弾！');
}
// 着弾時の閃光ドーム＋黒煙（軽量: 数個のメッシュを寿命付きで出す）
const _crustFxList=[];
function _crustSurfaceFlash(x,y,z){
  const d=Math.hypot(P.x-x,P.y+1-y,P.z-z);if(d>140)return;
  const near=d<60;
  spawnParticles(x,y+.5,z,0xffffff,near?12:4);spawnParticles(x,y+.3,z,0x1c1512,near?10:3);spawnParticles(x,y,z,0xff5a1e,near?10:3);
  if(settings.tntEffectQuality==='low')return;
  const flashMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.95,depthWrite:false});
  const flash=new THREE.Mesh(new THREE.SphereGeometry(1,10,7),flashMat);flash.position.set(x,y+.4,z);scene.add(flash);
  const ringMat=new THREE.MeshBasicMaterial({color:0xffce8a,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.14,6,26),ringMat);ring.rotation.x=Math.PI/2;ring.position.set(x,y+.3,z);scene.add(ring);
  let light=null;if(!isTouch){light=new THREE.PointLight(0xffb060,4,40);light.position.set(x,y+2,z);scene.add(light);}
  _crustFxList.push({flash,flashMat,ring,ringMat,light,t:0,life:1.1,radius:CrustBombConfig.surfaceRadius});
}
function _updateCrustFx(dt){
  for(let i=_crustFxList.length-1;i>=0;i--){
    const f=_crustFxList[i];f.t+=dt;const q=Math.min(1,f.t/f.life);
    f.flash.scale.setScalar(1+q*f.radius*.9);f.flashMat.opacity=(1-q)*.95;
    f.ring.scale.setScalar(1+q*f.radius*1.6);f.ringMat.opacity=(1-q)*.85;
    if(f.light)f.light.intensity=(1-q)*4;
    if(f.t>=f.life){scene.remove(f.flash);f.flashMat.dispose();scene.remove(f.ring);f.ringMat.dispose();if(f.light)scene.remove(f.light);_crustFxList.splice(i,1);}
  }
}
// スケジュールされた爆発を時間差で ExplosionSystem へ流し込む（負荷分散＆連鎖演出）
function _drainCrustBlastQueue(dt){
  for(let i=_crustBlastQueue.length-1;i>=0;i--){
    const s=_crustBlastQueue[i];s.t-=dt;
    if(s.t<=0){
      ExplosionSystem.enqueue(s.ev);
      if(s.shake&&Math.hypot(P.x-s.ev.x,P.z-s.ev.z)<s.ev.radius*5)ftvShake(s.shake,.5);
      // 地下の連鎖は「遅れて響く」低音を添える
      if(s.ev.y<P.y-4){const vol=Math.max(.03,.28*(1-Math.hypot(P.x-s.ev.x,P.y-s.ev.y,P.z-s.ev.z)/100));playTone(50,.45,vol,'sine');}
      _crustBlastQueue.splice(i,1);
    }
  }
}
function updateCrustBomb(dt){updateCrustBombs(dt);_updateCrustFx(dt);}

// ─── UI: 投下ボタン（モバイル）の表示更新 ───
function updateCrustBombBtn(){
  const btn=document.getElementById('crustBombBtn');if(!btn)return;
  const has=isCreative()||inv.crustBomb>0;
  const show=!isDesktop&&gs.running&&P.flying&&has;
  btn.style.display=show?'':'none';
  if(show){const n=isCreative()?'∞':inv.crustBomb;btn.innerHTML='<span class="aIcon">🌋</span><span class="aLabel">BOMB '+n+'</span>';}
}

// ─── リセット ───
function resetCrustBomb(){
  for(const b of _crustBombs){scene.remove(b.root);disposeObject3D(b.root);if(b.aim){scene.remove(b.aim);b.aim.material.dispose();}}
  _crustBombs.length=0;
  for(const f of _crustFxList){scene.remove(f.flash);f.flashMat.dispose();scene.remove(f.ring);f.ringMat.dispose();if(f.light)scene.remove(f.light);}
  _crustFxList.length=0;
  _crustBlastQueue.length=0;_crustBombCD=0;_crustTrailAcc=0;
}
window.deployCrustBomb=deployCrustBomb;
