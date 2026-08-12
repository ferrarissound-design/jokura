// ============================================================================
// jokura / world_eater.js
// 🕳 終端界専用・最終破壊装置「WORLD EATER（世界喰らい）」。
//
// 他の超兵器(TNT/TSAR BOMBA/LONGINUS/RAILGUN/地殻貫通爆弾)が「ブロックや地形を
// 爆破する兵器」であるのに対し、WORLD EATERだけは一段上の存在として実装する。
// 爆発でブロックを吹き飛ばすのではなく、指定地点を中心に「終端界そのものの
// 存在を消していく」。爆発エフェクト・飛散ブロック・アイテム化・大量の
// パーティクル/メッシュ生成はしない。静かに、不気味に、世界が欠落していく
// 演出だけを積み重ねる。
//
// 解禁条件: ABYSS COLOSSUS撃破(ezColossusDefeated)。colossus.js の撃破シーケンス
// (SILENCE RESTOREDバナーの少し後)から worldEaterOnColossusDefeated() が呼ばれる。
// 使用条件: クリエイティブ + 終端界滞在中のみ。通常世界では絶対に使用できない。
//
// 世界侵食: 既存のチャンクメッシュ/voxel削除基盤(addBlock/removeBlock/
// chunks[]/rec.keys)をそのまま再利用する。TsarBlastZones(tsar_bomba.js)と
// 同じ「永久破壊領域を軽量パラメータだけで登録し、未生成チャンクは生成時に
// 領域を避けて生成、生成済みチャンクはフレーム分散キューで削る」方式を採るが、
// TSARと違い侵食半径(radius)は瞬時に確定せず、時間経過で 0→maxRadius へ
// ゆっくり成長する。この「今の侵食半径」が世界侵食の唯一の情報源であり、
// チャンク生成時のフック(end_zone.js の put1)と、読み込み済みチャンクの
// フレーム分散削除(WorldEaterErosion)の両方が同じ関数(_weZoneShapeAt)を
// 参照するので、読み込み済み/未読み込みチャンクの境界に段差が出ない。
//
// セーブ: ブロック単位の削除ログは一切保存しない。特異点座標+半径+seedという
// 少数のパラメータ(weZone)だけを保存し、ロード後は上記の同じ仕組みで
// 侵食済み領域を再構築する(TsarBlastZonesと同じ設計思想)。
//
// パフォーマンス: 1フレームあたりの削除ブロック数・チャンク確認数に上限を設け、
// 大量のParticles/Meshは生成しない。既存チャンクメッシュ方式(removeBlockが
// markDirtyAround/flushDirtyChunksを経由して merged mesh を再構築する)を
// そのまま使う。
//
// 読み込み順: … destabilization → colossus → world_eater → hud → …
// なので destabShowBanner/showBonus/ftvShake/playTone/audioDuckTo/ezNoise/
// ColossusConfig/colossusApplyErosion 等は実行時に定義済み。
// ============================================================================

const WorldEaterConfig={
  // ── 発動: 照準先の地点を特異点の中心にする(LONGINUSの照準ロジックと同じ考え方) ──
  targetMaxRange:isTouch?70:100,
  targetMinRange:6,

  // ── 特異点(予兆演出) ──
  singularityRadius:2.6,     // 最初の見た目の半径(2〜3ブロック程度)
  singularityTime:2.0,       // 予兆演出の長さ(秒)。この間「何かがおかしい」を積み上げる

  // ── 世界侵食: 半径は瞬時に確定せず、時間経過でゆっくり成長する ──
  // maxRadius は「終端界のうち実際に遊べる範囲」の目安(描画距離の数倍)。
  // 手続き生成の島は理論上無限に続くため、厳密な"全世界"ではなく
  // 「プレイヤーが知覚できる終端界」を対象にする(要件の近似値算出方針に準拠)。
  maxRadius:isTouch?150:220,
  growPerSec:isTouch?2.0:2.9, // 侵食半径が1秒に伸びる量(ブロック) → 完了まで約75〜80秒

  // ── 負荷制御(フレーム分散) ──
  chunkChecksPerFrame:isTouch?4:9,   // 1フレームで確認するチャンク数の上限
  blocksPerFrame:isTouch?90:200,     // 1フレームで削除するブロック数の上限
  cursorRebuildInterval:2.4,         // 生成済みチャンク一覧を取り直す間隔(秒)

  // ── 境界の不規則さ(完全な球形にしない) ──
  edgeNoiseScale:0.045,
  edgeNoiseAmp:0.10,
  edgeJitter:2.4,
};

// ═══ 状態 ═══
let weUnlocked=false;         // ABYSS COLOSSUS撃破後の解禁演出が完了したか
let wePhase='idle';           // 'idle' | 'singularity' | 'eroding' | 'done'
let wePhaseT=0;
let weWorldLoss=0;            // 0-100。WORLD LOSS表示用の近似値
let weZone=null;              // {x,y,z,seed,radius,maxRadius,cursorKeys,cursorIdx,cursorAge,doneChunks}
let _weUnlockSeq=null;        // {phase,t} 解禁演出(ABYSS CORE DETECTED → WORLD EATER UNLOCKED)
let _weCriticalShown=false;   // DIMENSIONAL INTEGRITY CRITICAL(50%)を出したか
let _weLastDuckPct=-1;

function weActive(){return typeof currentDimension!=='undefined'&&currentDimension==='endZone';}

// ─── colossus.js から呼ばれる: 撃破シーケンスの「SILENCE RESTORED」の少し後 ───
function worldEaterOnColossusDefeated(){
  if(weUnlocked||_weUnlockSeq)return;
  _weUnlockSeq={phase:'wait',t:0};
}
function _weUpdateUnlockSeq(dt){
  const s=_weUnlockSeq;if(!s)return;
  s.t+=dt;
  if(s.phase==='wait'){
    if(s.t>=2.4){
      s.phase='core';s.t=0;
      if(typeof destabShowBanner==='function')destabShowBanner('ABYSS CORE DETECTED','UNKNOWN ENERGY SOURCE RECOVERED',3.2);
      playTone(58,1.4,.16,'sine');if(typeof ftvShake==='function')ftvShake(0.12,0.6);
    }
  }else if(s.phase==='core'){
    if(s.t>=3.6){
      s.phase='unlocked';s.t=0;
      weUnlocked=true;
      if(typeof destabShowBanner==='function')destabShowBanner('WORLD EATER','UNLOCKED',3.6);
      if(typeof showBonus==='function')showBonus('🌀 最終兵器「世界喰らい」が解禁された');
      playTone(46,1.8,.2,'sine');setTimeout(()=>playTone(28,2.2,.14,'sine'),220);
      if(typeof updateWorldEaterBtn==='function')updateWorldEaterBtn();
    }
  }else if(s.phase==='unlocked'){
    if(s.t>=3.8)_weUnlockSeq=null;
  }
}

// ─── 照準: 視線方向の地表を特異点の中心にする(longinus.jsの照準と同じ考え方) ───
const _weDir=new THREE.Vector3();
function _wePickTarget(){
  const C=WorldEaterConfig;
  camera.getWorldDirection(_weDir);
  const ox=camera.position.x,oy=camera.position.y,oz=camera.position.z;
  const dx=_weDir.x,dy=_weDir.y,dz=_weDir.z,horiz=Math.hypot(dx,dz)||1e-6;
  let tx=null,tz=null;
  if(dy<-0.02){
    const steps=Math.ceil(C.targetMaxRange*2);
    for(let s=1;s<=steps;s++){
      const t=s*0.5;if(t>C.targetMaxRange)break;
      const x=ox+dx*t,y=oy+dy*t,z=oz+dz*t;
      const gy=surfaceHeightAt(Math.floor(x),Math.floor(z));
      if(y<=gy+1){tx=x;tz=z;break;}
    }
  }
  if(tx==null){
    const dist=Math.min(C.targetMaxRange,Math.max(8,C.targetMaxRange*0.6));
    tx=ox+(dx/horiz)*dist;tz=oz+(dz/horiz)*dist;
  }
  let ix=Math.floor(tx),iz=Math.floor(tz);
  const pdx=ix+0.5-P.x,pdz=iz+0.5-P.z,pd=Math.hypot(pdx,pdz);
  if(pd>C.targetMaxRange){const f=C.targetMaxRange/pd;ix=Math.floor(P.x+pdx*f);iz=Math.floor(P.z+pdz*f);}
  else if(pd<C.targetMinRange&&pd>0.001){const f=C.targetMinRange/pd;ix=Math.floor(P.x+pdx*f);iz=Math.floor(P.z+pdz*f);}
  const iy=Math.floor(surfaceHeightAt(ix,iz));
  return{x:ix,y:iy,z:iz};
}

// ─── 発動(クリエイティブ+終端界滞在中のみ) ───
function deployWorldEater(){
  if(!gs.running||!isCreative()||!weActive())return;
  if(!weUnlocked){if(typeof showBonus==='function')showBonus('🕳 ABYSS COLOSSUSを倒すまで扱えない');playTone(160,.12,.08,'sawtooth');return;}
  if(wePhase!=='idle'){if(typeof showBonus==='function')showBonus('🕳 世界喰らいは既に発動している');playTone(160,.1,.06,'square');return;}
  if(!confirm('🕳 世界喰らいを解き放ちますか？\n終端界の全てを消し去ります。二度と元には戻せません。'))return;
  const tgt=_wePickTarget();
  _weBeginSingularity(tgt.x,tgt.y,tgt.z);
}

// ═══ 見た目: 特異点(1度だけ生成し、以降は位置とスケールだけ変える) ═══
let _weSingGroup=null,_weSingCore=null,_weSingHalo=null;
const _weSingMotes=[];
let _weMoteT=0;
const _weSingCoreGeo=new THREE.SphereGeometry(1,14,10);
const _weSingCoreMat=new THREE.MeshBasicMaterial({color:0x0a0410,transparent:true,opacity:.96,fog:false});
const _weSingHaloGeo=new THREE.RingGeometry(0.55,1,28);
const _weSingHaloMat=new THREE.MeshBasicMaterial({color:0x8a2aff,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false,fog:false});
const _weMoteGeo=new THREE.BoxGeometry(.1,.1,.1);
function _weBuildSingularityVisual(cx,cy,cz){
  if(!_weSingGroup){
    _weSingGroup=new THREE.Group();_weSingGroup.frustumCulled=false;
    _weSingCore=new THREE.Mesh(_weSingCoreGeo,_weSingCoreMat.clone());_weSingCore.frustumCulled=false;
    _weSingHalo=new THREE.Mesh(_weSingHaloGeo,_weSingHaloMat.clone());_weSingHalo.rotation.x=Math.PI/2.3;_weSingHalo.frustumCulled=false;
    _weSingGroup.add(_weSingCore,_weSingHalo);
  }
  _weSingGroup.position.set(cx,cy,cz);
  _weSingGroup.scale.setScalar(0.12);
  if(_weSingGroup.parent!==scene)scene.add(_weSingGroup);
}
function _weSpawnMote(cx,cy,cz){
  if(_weSingMotes.length>=(isTouch?5:10))return;
  const ang=Math.random()*Math.PI*2,rad=6+Math.random()*11;
  const from=new THREE.Vector3(cx+Math.cos(ang)*rad,cy+(Math.random()-.3)*4,cz+Math.sin(ang)*rad);
  const to=new THREE.Vector3(cx,cy,cz);
  const mat=new THREE.MeshBasicMaterial({color:0xb37bff,transparent:true,opacity:.85,fog:false});
  const mesh=new THREE.Mesh(_weMoteGeo,mat);mesh.position.copy(from);mesh.frustumCulled=false;
  scene.add(mesh);
  const total=0.9+Math.random()*.5;
  _weSingMotes.push({mesh,mat,from,to,life:total,total});
}
function _weUpdateMotes(dt){
  for(let i=_weSingMotes.length-1;i>=0;i--){
    const m=_weSingMotes[i];m.life-=dt;const k=Math.min(1,1-m.life/m.total);
    m.mesh.position.lerpVectors(m.from,m.to,Math.pow(k,0.7));
    m.mat.opacity=Math.max(0,.85*(1-k*0.35));
    if(m.life<=0){scene.remove(m.mesh);m.mat.dispose();_weSingMotes.splice(i,1);}
  }
}
function _weClearMotes(){for(const m of _weSingMotes){scene.remove(m.mesh);m.mat.dispose();}_weSingMotes.length=0;}

// ═══ 特異点フェーズ: 約2秒間、周囲の音が弱まり・光が吸い込まれ・粒子が中心へ ═══
function _weBeginSingularity(tx,ty,tz){
  const cx=tx+0.5,cz=tz+0.5,cy=ty+1.0;
  weZone={x:cx,y:cy,z:cz,seed:(Math.random()*2147483647)|0,radius:0,maxRadius:WorldEaterConfig.maxRadius,
    cursorKeys:null,cursorIdx:0,cursorAge:0,doneChunks:new Set()};
  wePhase='singularity';wePhaseT=0;weWorldLoss=0;_weCriticalShown=false;_weLastDuckPct=-1;
  _weBuildSingularityVisual(cx,cy,cz);
  if(typeof audioDuckTo==='function')audioDuckTo(0.55,1.2);
  playTone(40,1.8,.2,'sine');
  if(typeof ftvShake==='function')ftvShake(0.08,0.8);
  worldEaterUpdateHUD();
  if(typeof updateWorldEaterBtn==='function')updateWorldEaterBtn();
}
function _weUpdateSingularity(dt){
  wePhaseT+=dt;
  const C=WorldEaterConfig,p=Math.min(1,wePhaseT/C.singularityTime);
  const e=p*p*(3-2*p);
  if(_weSingGroup)_weSingGroup.scale.setScalar(0.12+(C.singularityRadius-0.12)*e);
  if(_weSingHalo)_weSingHalo.rotation.z+=dt*(0.6+p*1.4);
  _weMoteT-=dt;
  if(_weMoteT<=0&&weZone){_weMoteT=isTouch?.16:.09;_weSpawnMote(weZone.x,weZone.y,weZone.z);}
  _weUpdateMotes(dt);
  if(typeof audioDuckTo==='function')audioDuckTo(Math.max(0.1,0.55-p*0.4),0.4);
  if(p>0.25&&Math.random()<dt*1.4&&typeof ftvShake==='function')ftvShake(0.02+p*0.05,0.2);
  if(p>=1)_weBeginErosion();
}
function _weBeginErosion(){
  wePhase='eroding';wePhaseT=0;
  if(typeof destabShowBanner==='function')destabShowBanner('WORLD STRUCTURE FAILURE','',2.6);
  if(typeof showBonus==='function')showBonus('🕳 侵食が始まった…もう戻れない');
  playTone(32,2.0,.22,'sine');
  if(typeof ftvShake==='function')ftvShake(0.28,1.0);
  if(_weSingGroup)_weSingGroup.scale.setScalar(WorldEaterConfig.singularityRadius);
  worldEaterUpdateHUD();
}

// ═══ 世界の境界形状: 完全な球ではなく、ノイズで少し不規則にする ═══
// 生成済み/読み込み済みチャンクの削除(WorldEaterErosion)と、未読み込み
// チャンクの生成時カービング(weZoneRemovesAt, end_zone.js から呼ばれる)が
// 同じこの関数を使うことで、境界に段差ができない。
function _weZoneShapeAt(x,y,z,zone){
  const dx=x+0.5-zone.x,dy=y+0.5-zone.y,dz=z+0.5-zone.z;
  const d=Math.hypot(dx,dy,dz);
  const C=WorldEaterConfig,maxCheck=zone.radius*(1+C.edgeNoiseAmp)+C.edgeJitter+2;
  if(d>maxCheck)return false;
  const big=(typeof ezNoise==='function')?ezNoise((x+zone.seed)*C.edgeNoiseScale,(z+zone.seed)*C.edgeNoiseScale):0;
  const jitter=(rand3(x,y,z,zone.seed)-0.5)*2;
  const localR=Math.max(0,zone.radius*(1+big*C.edgeNoiseAmp)+jitter*C.edgeJitter);
  return d<=localR;
}
// end_zone.js の generateEndZoneChunk(put1) から呼ばれる公開窓口
function weZoneRemovesAt(x,y,z){
  if(!weZone||wePhase==='idle'||wePhase==='singularity')return false;
  return _weZoneShapeAt(x,y,z,weZone);
}

// ═══ 世界侵食: 読み込み済み(生成済み)チャンクをフレーム分散で削っていく ═══
// TsarDestructionQueueと同じく既存のremoveBlock/chunks[]/rec.keysを再利用する。
// 爆発しない・アイテム化しない・破片を出さない・大量パーティクルを出さない
// （removeBlockを呼ぶだけで、それ以外のFXは一切呼ばない）。
const WorldEaterErosion={
  update(zone,dt){
    const C=WorldEaterConfig;
    zone.cursorAge=(zone.cursorAge||0)+dt;
    if(!zone.cursorKeys||zone.cursorIdx>=zone.cursorKeys.length||zone.cursorAge>C.cursorRebuildInterval){
      zone.cursorKeys=Object.keys(chunks);zone.cursorIdx=0;zone.cursorAge=0;
      if(!zone.cursorKeys.length)return;
    }
    let checks=C.chunkChecksPerFrame,budget=C.blocksPerFrame;
    const prevDefer=_deferDirty;_deferDirty=true;
    while(checks-->0&&budget>0&&zone.cursorIdx<zone.cursorKeys.length){
      const key=zone.cursorKeys[zone.cursorIdx++];
      if(zone.doneChunks.has(key))continue;
      const rec=chunks[key];
      if(!rec){zone.doneChunks.add(key);continue;}
      const p=key.split(','),cx=+p[0],cz=+p[1],ox=cx*CHUNK,oz=cz*CHUNK;
      const nx=Math.max(ox,Math.min(zone.x,ox+CHUNK)),nz=Math.max(oz,Math.min(zone.z,oz+CHUNK));
      const near=Math.hypot(nx-zone.x,nz-zone.z);
      const margin=C.edgeJitter+zone.radius*C.edgeNoiseAmp+8;
      if(near>zone.radius+margin)continue; // まだ侵食半径から遠い: 後で再確認する
      let far=0;
      for(const c of[[ox,oz],[ox+CHUNK,oz],[ox,oz+CHUNK],[ox+CHUNK,oz+CHUNK]]){
        const d=Math.hypot(c[0]-zone.x,c[1]-zone.z);if(d>far)far=d;
      }
      let n=0;
      for(const vk of rec.keys){
        if(n>=budget)break;
        const vp=vk.split('|'),x=+vp[0],y=+vp[1],z=+vp[2];
        if(!_weZoneShapeAt(x,y,z,zone))continue;
        const v=voxels[vk];if(!v||!v.active)continue;
        n++;
        if(v.playerPlaced)delete worldEdits.placed[vk];else worldEdits.removed[vk]=true;
        removeBlock(x,y,z);
      }
      budget-=n;
      if(far<=zone.radius-margin)zone.doneChunks.add(key); // 完全に飲み込まれた: もう確認不要
    }
    _deferDirty=prevDefer;if(!prevDefer)flushDirtyChunks();
  },
};

// ─── ABYSS COLOSSUSの死骸: 侵食半径が到達した分だけ徐々に透明化させる。
// 新規メッシュは増やさず、colossus.js側の既存パーツの opacity を下げるだけ ───
function _weApplyColossusErosion(){
  if(!weZone||typeof colossusApplyErosion!=='function'||typeof ColossusConfig==='undefined')return;
  const A=ColossusConfig.anchor,span=20;
  const d=Math.hypot(A.x-weZone.x,(A.y+20)-weZone.y,A.z-weZone.z);
  const t=Math.max(0,Math.min(1,(weZone.radius-(d-span))/(span*2)));
  colossusApplyErosion(t);
}

// ═══ WORLD LOSS: 侵食半径からの近似値。厳密な全ブロック走査はしない ═══
function _weUpdateErosion(dt){
  if(!weZone)return;
  const C=WorldEaterConfig;
  weZone.radius=Math.min(weZone.maxRadius,weZone.radius+C.growPerSec*dt);
  weWorldLoss=Math.min(100,(weZone.radius/weZone.maxRadius)*100);
  WorldEaterErosion.update(weZone,dt);
  _weApplyColossusErosion();
  _weUpdateAmbientDecay();
  _weUpdateBoundaryFx(dt);
  if(weZone.radius>=weZone.maxRadius){
    wePhase='done';wePhaseT=0;weWorldLoss=100;
    _weOnComplete();
  }
}
// 世界が消えるほど音も無くなる(侵食開始時からマスター音量を段階的に絞る)
function _weUpdateAmbientDecay(){
  const pct=Math.round(weWorldLoss);
  if(pct===_weLastDuckPct)return;
  _weLastDuckPct=pct;
  const t=weWorldLoss/100,level=Math.max(0.03,1-t*0.97);
  if(typeof audioDuckTo==='function')audioDuckTo(level,1.6);
}
// 境界付近の軽量な演出(紫の粒子・稀なシェイク・小さな画面ノイズ)。
// 発生源はプレイヤー近くの境界1点だけに絞り、頻度も間引く(性能優先)。
let _weFxT=0;
const $weFlash=document.getElementById('weFlash');
function _weUpdateBoundaryFx(dt){
  _weFxT-=dt;if(_weFxT>0||!weZone)return;
  _weFxT=isTouch?0.55:0.32;
  const ang=Math.random()*Math.PI*2,r=weZone.radius*(0.82+Math.random()*0.2);
  const fx=weZone.x+Math.cos(ang)*r,fz=weZone.z+Math.sin(ang)*r;
  if(Math.hypot(fx-P.x,fz-P.z)>70)return;
  const fy=surfaceHeightAt(Math.floor(fx),Math.floor(fz))+1;
  spawnParticles(fx,fy,fz,Math.random()<0.5?0x2a0a40:0x0a0410,isTouch?1:2);
  if(Math.random()<0.1&&typeof ftvShake==='function')ftvShake(0.05,0.25);
  if(Math.random()<0.05&&$weFlash){$weFlash.style.opacity='0.14';setTimeout(()=>{if($weFlash)$weFlash.style.opacity='0';},90);}
}

// ═══ 侵食レベルによる世界変化(end_zone.js の ezApplyAtmosphere から呼ばれる) ═══
function worldEaterApplyAtmosphere(){
  if(!weActive()||!weZone||wePhase==='idle'||wePhase==='singularity')return;
  const t=Math.min(1,weWorldLoss/100);if(t<=0)return;
  scene.fog.color.r=Math.max(0,scene.fog.color.r*(1-t*0.5));
  scene.fog.color.g=Math.max(0,scene.fog.color.g*(1-t*0.62));
  scene.fog.color.b=Math.max(0,scene.fog.color.b*(1-t*0.45));
  renderer.setClearColor(scene.fog.color);
  hemLight.intensity=Math.max(0.015,hemLight.intensity*(1-t*0.72));
  sun.intensity=Math.max(0,sun.intensity*(1-t*0.9));
  if(typeof _ezRing!=='undefined'&&_ezRing){
    _ezRing.material.opacity=Math.max(0.02,.32*(1-t*0.55));
    _ezRing.rotation.x=Math.PI/2.25+Math.sin(performance.now()*0.0005)*t*0.35;
  }
  if(typeof _ezParticles!=='undefined'&&_ezParticles)_ezParticles.material.opacity=Math.max(0,.7*(1-t*0.9));
  if(t>=0.5&&!_weCriticalShown){
    _weCriticalShown=true;
    if(typeof destabShowBanner==='function')destabShowBanner('DIMENSIONAL INTEGRITY','CRITICAL',2.2);
  }
}

// ═══ 100%到達: NOTHING REMAINS. → (1〜2秒後) 満足しましたか？ ═══
const $weEndScreen=document.getElementById('weEndScreen'),$weEndTitle=document.getElementById('weEndTitle');
function _weOnComplete(){
  if(typeof audioDuckTo==='function')audioDuckTo(0.02,2.4);
  if(typeof showBonus==='function')showBonus('🕳 終端界には、もう何も残っていない');
  if($weEndScreen&&$weEndTitle){
    $weEndTitle.textContent='NOTHING REMAINS.';
    $weEndScreen.classList.add('show');
    setTimeout(()=>{
      if(wePhase!=='done'||!$weEndTitle)return;
      $weEndTitle.textContent='満足しましたか？';
    },1800);
  }
  worldEaterUpdateHUD();
}

// ═══ 毎フレーム更新(end_zone.js の ezTick から、終端界にいる間だけ呼ばれる) ═══
function worldEaterTick(dt){
  _weUpdateUnlockSeq(dt);
  if(wePhase==='singularity')_weUpdateSingularity(dt);
  else if(wePhase==='eroding')_weUpdateErosion(dt);
  else if(wePhase==='done')_weApplyColossusErosion();
  worldEaterUpdateHUD();
}

// ═══ HUD ═══
const $weLossHud=document.getElementById('weLossHud'),$weLossPct=document.getElementById('weLossPct');
function worldEaterUpdateHUD(){
  const inEz=weActive();
  const showLoss=inEz&&(wePhase==='eroding'||wePhase==='done');
  if($weLossHud)$weLossHud.style.display=showLoss?'':'none';
  if(showLoss&&$weLossPct)$weLossPct.textContent=Math.round(weWorldLoss)+'%';
  if($weEndScreen&&!(inEz&&wePhase==='done'))$weEndScreen.classList.remove('show');
  if(typeof updateWorldEaterBtn==='function')updateWorldEaterBtn();
}

// ═══ ボタン(モバイル): 既存のcrustBomb/tsarBomb/longinus/railgunと同じ
// #actionWrap→#bombMenuPopoverの導線に乗せる(mobileui.js側で移設)。
// PCはキーバインド(input.js)のみ ═══
function updateWorldEaterBtn(){
  const btn=document.getElementById('worldEaterBtn');if(!btn)return;
  const show=!isDesktop&&gs.running&&isCreative()&&weActive()&&weUnlocked;
  btn.style.display=show?'':'none';
}

// ═══ ライフサイクル: 終端界の入退場(colossus.js/destabilization.jsと同じ流儀) ═══
function worldEaterMount(){
  if(weZone&&wePhase!=='idle'&&_weSingGroup&&_weSingGroup.parent!==scene)scene.add(_weSingGroup);
  worldEaterUpdateHUD();
}
function worldEaterUnmount(){
  if($weLossHud)$weLossHud.style.display='none';
  if($weEndScreen)$weEndScreen.classList.remove('show');
  if(_weSingGroup&&_weSingGroup.parent===scene)scene.remove(_weSingGroup);
  _weClearMotes();
  if(typeof audioMasterReset==='function')audioMasterReset();
  _weLastDuckPct=-1;
}

// ═══ セーブ/ロード: ブロック単位ではなく「特異点座標+半径+seed」だけを保存する ═══
function worldEaterSaveState(){
  return{
    unlocked:weUnlocked,phase:wePhase,phaseT:wePhaseT,loss:weWorldLoss,
    zone:weZone?{x:weZone.x,y:weZone.y,z:weZone.z,seed:weZone.seed,radius:weZone.radius,maxRadius:weZone.maxRadius}:null,
  };
}
function worldEaterLoadState(saved){
  weUnlocked=saved?!!saved.unlocked:false;
  // 旧セーブ/WORLD EATER実装前に既に巨神を倒していた場合は、演出を再生せず即解禁する
  if(!weUnlocked&&typeof ezColossusDefeated!=='undefined'&&ezColossusDefeated)weUnlocked=true;
  wePhase='idle';wePhaseT=0;weWorldLoss=0;weZone=null;_weUnlockSeq=null;_weCriticalShown=false;_weLastDuckPct=-1;
  if(_weSingGroup&&_weSingGroup.parent===scene)scene.remove(_weSingGroup);
  _weClearMotes();
  if(saved&&saved.zone&&typeof saved.zone==='object'){
    const z=saved.zone;
    const x=Number(z.x),y=Number(z.y),zz=Number(z.z),seed=(Number(z.seed)|0);
    const maxRadius=Math.max(10,Math.min(WorldEaterConfig.maxRadius*4,Number(z.maxRadius)||WorldEaterConfig.maxRadius));
    const radius=Math.max(0,Math.min(maxRadius,Number(z.radius)||0));
    if(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(zz)){
      weZone={x,y,z:zz,seed,radius,maxRadius,cursorKeys:null,cursorIdx:0,cursorAge:0,doneChunks:new Set()};
      wePhase=(saved.phase==='singularity'||saved.phase==='eroding'||saved.phase==='done')?saved.phase:(radius>=maxRadius?'done':'eroding');
      wePhaseT=Math.max(0,Number(saved.phaseT)||0);
      weWorldLoss=Math.max(0,Math.min(100,Number(saved.loss)||(radius/maxRadius*100)));
      _weCriticalShown=weWorldLoss>=50;
      if(wePhase!=='idle')_weBuildSingularityVisual(x,y,zz);
      if(_weSingGroup)_weSingGroup.scale.setScalar(wePhase==='singularity'?0.3:WorldEaterConfig.singularityRadius);
    }
  }
  worldEaterUpdateHUD();
}
// ═══ 終端界の再生成(regenerateEndZone)から呼ばれる: WORLD EATER関連の
// すべての状態(解禁・発動・WORLD LOSS・特異点・侵食半径)を初期化する ═══
function resetWorldEater(){
  weUnlocked=false;wePhase='idle';wePhaseT=0;weWorldLoss=0;weZone=null;_weUnlockSeq=null;
  _weCriticalShown=false;_weLastDuckPct=-1;
  if(_weSingGroup&&_weSingGroup.parent===scene)scene.remove(_weSingGroup);
  _weClearMotes();
  if($weLossHud)$weLossHud.style.display='none';
  if($weEndScreen)$weEndScreen.classList.remove('show');
  if(typeof colossusApplyErosion==='function')colossusApplyErosion(0);
  if(typeof audioMasterReset==='function')audioMasterReset();
  worldEaterUpdateHUD();
}

window.deployWorldEater=deployWorldEater;
