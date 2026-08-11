// ============================================================================
// jokura / railgun.js
// 🚀 超大型レールガン: ツァーリ・ボンバ(面の破壊)・LONGINUS(縦の貫通)とは違い、
//   「照準した直線上を、超長距離まで一直線に貫通するトンネル」を刻む兵器。
//   爆発による面破壊は一切行わず、狙った方向へ円柱状に地形を掘り抜くだけ
//   ──「爆発した」ではなく「世界を撃ち抜いた」体験を作ることが目的。
//
//   流れ: RAILGUNをクラフト → L/🚀ボタンでチャージ開始(約3秒、その場でキャンセル可)
//     → チャージ完了で自動発射 → 閃光+轟音+反動 → 射線上のブロックを
//     フレーム分散で貫通破壊 → クールダウン(COOLING表示、この間チャージ不可)。
//
//   読み込み順: … longinus → longinus_sequence → railgun → railgun_sequence →
//               hud → … なので ftvShake/removeBlock/addBlock/hitEnemy 等の
//               他パーツの関数は実行時には定義済み（ホイストにより前方参照も可）。
//
//   専用構造:
//     RailgunConfig            … 調整用定数（射程・半径・負荷制御・演出）
//     RailgunDestructionQueue  … 射線上のトンネル破壊＋フレーム分散（Longinus方式を流用）
//     _railAnnihilateEntitiesAlongLine … 射線上の敵/ボス/ドラゴン/動物/村人/相棒を即時撃破
//     _railSpawnBeam/_railUpdateBeams … 発射直後だけ光る「通過した痕跡」のビーム残像
//     RailgunSequence(railgun_sequence.js) … CHARGING/CHARGED/COOLING の画面演出
//
//   地形破壊は SCORCHED_EARTH(黒く焼けた地面) / OBSIDIAN_BLOCK(ガラス化・溶融)
//   という既存ブロックを再利用する（新規ブロックIDはworldEdits側の5bitパック
//   ({ti}|{meta<<5) の都合で追加しづらいため、既存の資産を自然に流用する）。
// ============================================================================

const RailgunConfig={
  // ── 使用条件 ──
  chargeTime:3.0,          // チャージ時間（秒）
  cooldown:isTouch?13:10,  // クールダウン（秒）
  confirm:false,           // 発射自体は3秒のチャージで誤爆猶予があるため確認ダイアログは出さない

  // ── 射程・破壊半径: 現在地を含む端チャンクまで使い切り、未生成領域への
  //    空撃ちは避けつつ「世界を撃ち抜く」距離感を強める ──
  maxRange:isTouch?56:112,
  tunnelRadius:isTouch?2.2:2.8,     // 円柱トンネルの半径（2〜4ブロック程度）
  entryRadiusMul:1.55,              // 発射地点(マズル)側だけ広げて小さな入射クレーターを作る
  entryRange:3.2,                   // ↑の効果が及ぶ距離
  jitterAmp:isTouch?.35:.55,        // 断面を不規則にする距離ジッター

  // ── 負荷制御（フレーム分散） ──
  stepMul:.8,                       // マーチ間隔 = tunnelRadius*stepMul
  scanCellsPerFrame:isTouch?3200:7200,
  blocksPerFrame:isTouch?220:440,
  maxDebris:isTouch?7:16,
  wallBand:1.1,                     // 焼け跡/ガラス化を判定するトンネル外縁の帯厚
  maxWallBlocks:isTouch?90:190,
  maxGlassBlocks:isTouch?16:34,
  maxSteamPoints:isTouch?5:10,

  // ── 消滅判定: 射線上のエンティティはHP・防御・種別を問わず即時撃破 ──
  pierceBand:.6,                    // 判定半径 = tunnelRadius + これ

  // ── 反動・演出 ──
  recoilForce:4.5,
  shakeCharge:0.01,
  shakeFire:1.05,
  flashPeak:1.0,flashFade:.16,      // ごく短い閃光（Tsar/Longinusより明確に短い）
  beamLife:.4,                      // 通過痕ビームの残存時間（秒）
};

// ═══════════════════════════════════════════════════════════════════════════
// 状態
// ═══════════════════════════════════════════════════════════════════════════
let _railCD=0;                 // クールダウン残り秒
let _railCharging=null;        // {t,sparkT} チャージ中のみ非null
let _railPlayerVX=0,_railPlayerVZ=0; // 反動（main.jsのtickが毎フレーム消費）
let _railFlashLevel=0,_railFlashEl=null;
function _railFlash(){if(!_railFlashEl)_railFlashEl=document.getElementById('railgunFlash');return _railFlashEl;}

function railgunPlayerImpulse(dt){
  const out={x:_railPlayerVX,z:_railPlayerVZ};
  const decay=Math.exp(-6*dt);
  _railPlayerVX*=decay;_railPlayerVZ*=decay;
  if(Math.abs(_railPlayerVX)<.02)_railPlayerVX=0;if(Math.abs(_railPlayerVZ)<.02)_railPlayerVZ=0;
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 使用（キー/ボタン1回で開始。チャージ中に再度押すとキャンセル）
// ═══════════════════════════════════════════════════════════════════════════
function deployRailgun(){
  if(!gs.running)return;
  if(_railCharging){_railCancelCharge();return;}
  if(_railCD>0){showBonus('🚀 クールダウン中… '+_railCD.toFixed(1)+'s');playTone(200,.08,.06,'square');return;}
  if(!isCreative()&&(inv.railgun|0)<=0){showBonus('🚀 RAILGUNがない！ クラフトしよう');playTone(180,.1,.08,'sawtooth');return;}
  initAudio();
  _railCharging={t:0,sparkT:.15};
  if(typeof RailgunSequence!=='undefined')RailgunSequence.chargeStart();
  sfxRailgunChargeStart(RailgunConfig.chargeTime);
  if(typeof audioDuckTo==='function')audioDuckTo(.55,.35);
}
function _railCancelCharge(){
  if(!_railCharging)return;
  _railCharging=null;
  sfxRailgunChargeStop(true);
  if(typeof audioMasterReset==='function')audioMasterReset();
  if(typeof RailgunSequence!=='undefined')RailgunSequence.chargeCancelled();
  showBonus('🚀 チャージ中止');
  playTone(160,.14,.08,'sine');
}

// ═══════════════════════════════════════════════════════════════════════════
// 発射
// ═══════════════════════════════════════════════════════════════════════════
const _railDir=new THREE.Vector3();
function _railFire(){
  const C=RailgunConfig;
  _railCD=C.cooldown;
  if(!isCreative()){inv.railgun=Math.max(0,(inv.railgun|0)-1);updateInvHUD();}
  camera.getWorldDirection(_railDir);
  const ox=camera.position.x,oy=camera.position.y,oz=camera.position.z;
  const dir={x:_railDir.x,y:_railDir.y,z:_railDir.z};
  const seed=(Math.random()*2147483647)|0;

  const hl=Math.hypot(dir.x,dir.z)||1e-6;
  _railPlayerVX-=dir.x/hl*C.recoilForce;_railPlayerVZ-=dir.z/hl*C.recoilForce;

  if(settings.flash!==false)_railFlashLevel=C.flashPeak;
  if(typeof ftvShake==='function')ftvShake(C.shakeFire,.6);

  sfxRailgunChargeStop(true);
  if(typeof audioMasterReset==='function')audioMasterReset();
  sfxRailgunFire(.7);
  setTimeout(()=>sfxRailgunRumble(.32,1.7),360+Math.random()*90);

  if(typeof RailgunSequence!=='undefined'){RailgunSequence.charged();RailgunSequence.fired();}

  _railSpawnBeam(ox,oy,oz,dir);
  _railAnnihilateEntitiesAlongLine(ox,oy,oz,dir);
  RailgunDestructionQueue.begin(ox,oy,oz,dir,seed);
}

// ── 射線上のエンティティを問答無用で撃破する。
// 通常の死亡処理へ致死値を渡し、ドロップ・スコア・実績・ボス進行は維持する。 ──
function _railAnnihilateEntitiesAlongLine(ox,oy,oz,dir){
  const C=RailgunConfig,R=C.tunnelRadius+C.pierceBand,R2=R*R,maxT=C.maxRange;
  const within=(p)=>{
    const rx=p.x-ox,ry=p.y-oy,rz=p.z-oz;
    const t=Math.max(0,Math.min(maxT,rx*dir.x+ry*dir.y+rz*dir.z));
    const cx=ox+dir.x*t,cy=oy+dir.y*t,cz=oz+dir.z*t;
    const dx=p.x-cx,dy=p.y-cy,dz=p.z-cz;
    return dx*dx+dy*dy+dz*dz<=R2;
  };
  const lethal=(e)=>Math.max(1,(Number(e.hp)||0)+(Number(e.maxHp)||0)+1);
  if(typeof enemies!=='undefined')for(const e of[...enemies]){if(!e.dead&&within(e.root.position))hitEnemy(e,lethal(e));}
  if(typeof boss!=='undefined'&&boss&&within(boss.root.position))hitBoss(lethal(boss));
  if(typeof dragon!=='undefined'&&dragon&&within(dragon.root.position))hitDragon(lethal(dragon),true);
  if(typeof mobs!=='undefined')for(const m of[...mobs]){if(!m.dead&&within(m.root.position))hitMob(m,lethal(m));}
  if(typeof humanoids!=='undefined')for(const h of[...humanoids]){const dead=typeof HUMANOID_STATES!=='undefined'&&h.state===HUMANOID_STATES.DEAD;if(!dead&&within(h.root.position))hitHumanoid(h,lethal(h));}
  if(typeof pet!=='undefined'&&pet&&within(pet.root.position))removePet();
}

// ═══════════════════════════════════════════════════════════════════════════
// 見た目: 発射直後だけ光る「通過した痕跡」のビーム（常時発光するレーザーにはしない）
// ═══════════════════════════════════════════════════════════════════════════
let _railBeams=[];
const _railBeamCoreGeo=new THREE.CylinderGeometry(1,1,1,7,1,true);
const _railBeamGlowGeo=new THREE.CylinderGeometry(1,1,1,10,1,true);
const _railUpAxis=new THREE.Vector3(0,1,0);
function _railSpawnBeam(ox,oy,oz,dir){
  const C=RailgunConfig,len=C.maxRange;
  const mx=ox+dir.x*len*.5,my=oy+dir.y*len*.5,mz=oz+dir.z*len*.5;
  const coreMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.95,depthWrite:false});
  const glowMat=new THREE.MeshBasicMaterial({color:0x8fd6ff,transparent:true,opacity:.32,depthWrite:false,side:THREE.DoubleSide});
  const core=new THREE.Mesh(_railBeamCoreGeo,coreMat);
  const glow=new THREE.Mesh(_railBeamGlowGeo,glowMat);
  const q=new THREE.Quaternion().setFromUnitVectors(_railUpAxis,new THREE.Vector3(dir.x,dir.y,dir.z));
  core.quaternion.copy(q);glow.quaternion.copy(q);
  core.position.set(mx,my,mz);glow.position.set(mx,my,mz);
  core.scale.set(.05,len,.05);glow.scale.set(.2,len,.2);
  scene.add(core);scene.add(glow);
  _railBeams.push({core,glow,coreMat,glowMat,t:0,life:C.beamLife});
  const n=isTouch?4:9;
  for(let i=0;i<n;i++){
    const d=Math.random()*Math.min(16,len);
    spawnParticles(ox+dir.x*d,oy+dir.y*d,oz+dir.z*d,i%2?0xdfefff:0xffffff,1);
  }
}
function _railUpdateBeams(dt){
  for(let i=_railBeams.length-1;i>=0;i--){
    const b=_railBeams[i];b.t+=dt;const q=Math.min(1,b.t/b.life),fade=1-q;
    b.coreMat.opacity=.95*fade*fade;b.glowMat.opacity=.32*fade;
    const gs2=.2*(1+q*1.8);b.glow.scale.x=gs2;b.glow.scale.z=gs2;
    if(b.t>=b.life){scene.remove(b.core);scene.remove(b.glow);b.coreMat.dispose();b.glowMat.dispose();_railBeams.splice(i,1);}
  }
}
function _railResetBeams(){
  for(const b of _railBeams){scene.remove(b.core);scene.remove(b.glow);b.coreMat.dispose();b.glowMat.dispose();}
  _railBeams.length=0;
}

// ═══════════════════════════════════════════════════════════════════════════
// 毎フレーム更新
// ═══════════════════════════════════════════════════════════════════════════
function updateRailgun(dt){
  const C=RailgunConfig;
  if(_railCD>0)_railCD=Math.max(0,_railCD-dt);
  if(_railCharging){
    const c=_railCharging;c.t+=dt;
    c.sparkT-=dt;if(c.sparkT<=0){c.sparkT=.12+Math.random()*.1;if(typeof ftvShake==='function')ftvShake(C.shakeCharge,.1);}
    const p=Math.min(1,c.t/C.chargeTime);
    if(typeof RailgunSequence!=='undefined')RailgunSequence.chargeProgress(p);
    if(c.t>=C.chargeTime){_railCharging=null;_railFire();}
  }
  if(typeof RailgunSequence!=='undefined'){
    if(_railCD>0)RailgunSequence.cooling(_railCD);
    else RailgunSequence.coolingDone();
    RailgunSequence.update(dt);
  }
  _railUpdateBeams(dt);
  RailgunDestructionQueue.update();
  if(_railFlashLevel>0){
    _railFlashLevel=Math.max(0,_railFlashLevel-dt/Math.max(.05,C.flashFade));
    const el=_railFlash();if(el)el.style.opacity=String(_railFlashLevel);
  }else{const el=_railFlash();if(el&&el.style.opacity!=='0')el.style.opacity='0';}
}

// ═══════════════════════════════════════════════════════════════════════════
// RailgunDestructionQueue: 射線に沿って一定間隔でサンプル点を取り、その周囲の
// 立方体だけを走査する（Longinusの「縦シャフト全域を走査」ではなく「線分に
// そった局所走査」にすることで、超長距離でも走査対象を線形に抑える）。
// 同じボクセルを複数サンプル点から二重に拾わないよう vKey で重複排除する。
// ═══════════════════════════════════════════════════════════════════════════
const RailgunDestructionQueue={
  active:null,_debris:0,
  begin(ox,oy,oz,dir,seed){
    const C=RailgunConfig,radius=C.tunnelRadius;
    const stepLen=Math.max(.5,radius*C.stepMul);
    const steps=Math.max(1,Math.ceil(C.maxRange/stepLen));
    const R=Math.ceil(radius+C.jitterAmp)+1,side=R*2+1,cubeVol=side*side*side;
    this._debris=0;
    this.active={
      ox,oy,oz,dir,seed,radius,stepLen,side,R,cubeVol,
      total:steps*cubeVol,cursor:0,
      seen:new Set(),
      blocks:[],wallCandidates:[],steamPoints:[],
      sorted:false,destroy:0,destroyed:false,wallDone:false,done:false,
    };
  },
  _scanCell(t,i,C){
    const side=t.side,R=t.R,cubeVol=t.cubeVol;
    const stepIndex=Math.floor(i/cubeVol),local=i-stepIndex*cubeVol;
    const lx=local%side,rem=Math.floor(local/side),lz=rem%side,ly=Math.floor(rem/side);
    const distAlong=stepIndex*t.stepLen;
    const cxAt=t.ox+t.dir.x*distAlong,cyAt=t.oy+t.dir.y*distAlong,czAt=t.oz+t.dir.z*distAlong;
    const x=Math.floor(cxAt)+(lx-R),y=Math.floor(cyAt)+(ly-R),z=Math.floor(czAt)+(lz-R);
    const k=vKey(x,y,z);
    if(t.seen.has(k))return;t.seen.add(k);
    const v=voxels[k];if(!v||!v.active)return;
    const rx=x+.5-t.ox,ry=y+.5-t.oy,rz=z+.5-t.oz;
    let tt=rx*t.dir.x+ry*t.dir.y+rz*t.dir.z;
    tt=Math.max(0,Math.min(C.maxRange,tt));
    const px=t.ox+t.dir.x*tt,py=t.oy+t.dir.y*tt,pz=t.oz+t.dir.z*tt;
    const dx=x+.5-px,dy=y+.5-py,dz=z+.5-pz,d=Math.hypot(dx,dy,dz);
    let radAt=t.radius;
    if(tt<C.entryRange){const f=1-tt/C.entryRange;radAt*=1+(C.entryRadiusMul-1)*f;}
    const jitter=(rand3(x,y,z,t.seed)-.5)*2*C.jitterAmp;
    radAt+=jitter;
    if(d<=radAt){
      t.blocks.push({x,y,z,k,ti:v.ti,tt,playerPlaced:v.playerPlaced});
      if(v.ti===WATER_BLOCK&&t.steamPoints.length<C.maxSteamPoints&&Math.random()<.25)t.steamPoints.push({x:x+.5,y:y+1,z:z+.5});
      return;
    }
    if(d<=radAt+C.wallBand&&t.wallCandidates.length<C.maxWallBlocks&&Math.random()<.28)t.wallCandidates.push({x,y,z});
  },
  _destroyOne(t){
    const b=t.blocks[t.destroy++],v=voxels[b.k];
    if(!v||!v.active||v.ti!==b.ti)return;
    if(typeof ftvOnBlockBroken==='function')ftvOnBlockBroken(b.k);
    if(typeof sucOnBlockBroken==='function')sucOnBlockBroken(b.k);
    if(typeof sccOnBlockBroken==='function')sccOnBlockBroken(b.k);
    const C=RailgunConfig;
    if(this._debris<C.maxDebris&&Math.hypot(b.x-P.x,b.z-P.z)<26&&Math.random()<.35){spawnBlockDebris(b.x+.5,b.y+.5,b.z+.5,v.ti);this._debris++;}
    if(b.playerPlaced)delete worldEdits.placed[b.k];else worldEdits.removed[b.k]=true;
    removeBlock(b.x,b.y,b.z);
  },
  _convertWalls(t){
    const C=RailgunConfig;let wallN=0,glassN=0;
    for(const w of t.wallCandidates){
      if(wallN>=C.maxWallBlocks)break;
      const k=vKey(w.x,w.y,w.z),v=voxels[k];
      if(!v||!v.active||v.ti===WATER_BLOCK||v.ti===LAVA_BLOCK||v.ti===SCORCHED_EARTH||v.ti===OBSIDIAN_BLOCK)continue;
      let nti=SCORCHED_EARTH;
      if(glassN<C.maxGlassBlocks&&Math.random()<.22){nti=OBSIDIAN_BLOCK;glassN++;}
      removeBlock(w.x,w.y,w.z);
      addBlock(w.x,w.y,w.z,nti,true,true,0);
      worldEdits.placed[k]=nti|(0<<5);delete worldEdits.removed[k];
      wallN++;
    }
  },
  _spawnSteam(t){
    for(const p of t.steamPoints){
      if(Math.hypot(p.x-P.x,p.z-P.z)>40)continue;
      spawnParticles(p.x,p.y,p.z,0xffffff,isTouch?1:3);
      spawnParticles(p.x,p.y+.3,p.z,0xdfe8ec,isTouch?1:2);
    }
  },
  update(){
    const t=this.active;if(!t||t.done)return;
    const C=RailgunConfig,prevDefer=_deferDirty;_deferDirty=true;
    let sb=C.scanCellsPerFrame;
    while(t.cursor<t.total&&sb-->0)this._scanCell(t,t.cursor++,C);
    if(t.cursor>=t.total&&!t.sorted){t.blocks.sort((a,b)=>a.tt-b.tt);t.sorted=true;}
    if(t.sorted&&!t.destroyed){
      let db=C.blocksPerFrame;
      while(t.destroy<t.blocks.length&&db-->0)this._destroyOne(t);
      if(t.destroy>=t.blocks.length)t.destroyed=true;
    }
    if(t.destroyed&&!t.wallDone){this._convertWalls(t);this._spawnSteam(t);t.wallDone=true;t.done=true;}
    _deferDirty=prevDefer;if(!prevDefer)flushDirtyChunks();
  },
  reset(){this.active=null;this._debris=0;},
};

// ═══════════════════════════════════════════════════════════════════════════
// UI（モバイル発動ボタン）
// ═══════════════════════════════════════════════════════════════════════════
function updateRailgunBtn(){
  const btn=document.getElementById('railgunBtn');if(!btn)return;
  const has=isCreative()||(inv.railgun|0)>0;
  const show=!isDesktop&&gs.running&&has;
  btn.style.display=show?'':'none';
  if(show){const n=isCreative()?'∞':(inv.railgun|0);btn.innerHTML='<span class="aIcon">🚀</span><span class="aLabel">RAILGUN '+n+'</span>';}
}

// ═══════════════════════════════════════════════════════════════════════════
// セーブ/リセット: 進行中のチャージ(数秒)自体は保存対象にせず、クールダウンだけ
// 引き継ぐ。彫られたトンネルは通常のworldEdits経由で既に保存されている。
// ═══════════════════════════════════════════════════════════════════════════
function railgunSaveState(){return{cd:_railCD};}
function railgunLoadState(saved){
  if(!saved||typeof saved!=='object')return;
  _railCD=Math.max(0,Math.min(60,Number(saved.cd)||0));
}
function resetRailgun(){
  if(_railCharging){sfxRailgunChargeStop(true);_railCharging=null;}
  if(typeof RailgunSequence!=='undefined')RailgunSequence.abort();
  _railResetBeams();
  RailgunDestructionQueue.reset();
  _railCD=0;_railFlashLevel=0;_railPlayerVX=0;_railPlayerVZ=0;
  const el=_railFlash();if(el)el.style.opacity='0';
}

window.deployRailgun=deployRailgun;
