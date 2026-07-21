// ============================================================================
// jokura / tsar_bomba.js
// ☢ ツァーリ・ボンバ: ゲームバランスを完全に無視した「最終兵器TNT」。
//   通常TNT(explosives.js)・地殻貫通爆弾(aerial_bomb.js)とは爆発処理を完全分離した
//   専用の大規模災害イベント。設置(地面) or 空中投下で使用し、短い起爆演出のあと
//   閃光→中心消滅→巨大クレーター→衝撃波→余波(キノコ雲・煙柱)という段階演出を
//   時間分割で処理する。ボスを含む全モンスターは無敵/シールド/フェーズ/復活を
//   迂回して強制即死させる。
//
//   読み込み順: … explosives → aerial_bomb → tsar_bomba → hud → … なので
//   ExplosionSystem / ftvShake / removeBlock / kill系 などは実行時に定義済み。
//   （関数はホイストされるので、ここから後段ファイル(input/main)の関数を呼んでも可）
//
//   専用構造:
//     TsarBombaConfig          … 調整用定数（半径・深度・演出・負荷制御）
//     TsarBombaEntity(_tsarBombs) … 落下/設置中の爆弾エンティティ
//     tsarForceKill            … 防御貫通の強制撃破サービス
//     TsarDestructionQueue     … クレーター破壊のキュー＋フレーム分散
//     TsarBombaExplosionController … 段階爆発シーケンスの司令塔
//     ShockwaveController       … リング状衝撃波（時間で半径拡大）
//     MushroomCloudEffect       … 専用キノコ雲＋煙柱
// ============================================================================

// ─── デバッグ用スケール（0.2 などにすると半径・深度が縮小してテストしやすい） ───
let TSAR_BOMBA_DEBUG_SCALE=1;

// ── 実ワールドはチャンク描画半径が狭い（DRAW_R: PC≈96 / スマホ≈48ブロック、
//    地下は概ね y≈-32 まで）。要件の目安値(消滅40/破壊130/衝撃200…)をそのまま
//    使うと未生成領域への空撃ちになり負荷だけ増えるため、「遊べる範囲」に圧縮した
//    初期値にしている。全て定数化してあり、後からここだけ変えれば規模を調整できる。
const TsarBombaConfig={
  // ── 起爆前演出 ──
  fuseTime:2.5,          // 着弾から起爆までの待ち時間（秒）
  warnBeepInterval:0.32, // 起爆前の警告音の間隔（秒）

  // ── 落下挙動（空中投下時） ──
  minAltitude:5,         // 空中投下に必要な地表からの高さ
  cooldown:3.0,          // 連続使用クールダウン（秒）
  spawnBelow:2.4,        // プレイヤーの何ブロック下に生成するか
  gravity:30,            // 落下加速度
  inheritVel:0.5,        // プレイヤー水平速度の継承率
  maxFall:70,            // 終端速度
  fallFuseTimeout:7.0,   // 何にも当たらなかった場合の強制起爆までの猶予（秒）

  // ── 爆発規模（DEBUG_SCALE が乗る） ──
  vaporizeRadius:isTouch?18:26,    // 中心消滅半径（球）: 何もかも消える
  destructionRadius:isTouch?34:52, // 完全破壊半径 = クレーター外縁
  shockwaveRadius:isTouch?58:88,   // 衝撃波の到達半径
  craterDepth:isTouch?26:40,       // クレーター最深部の深さ
  deepBlastRadius:isTouch?16:24,   // 深部が最大深度を保つ半径（中心の縦穴）

  // ── 負荷制御 ──
  scanPerFrame:isTouch?4000:9000,  // 破壊候補スキャンのフレーム上限（voxel数）
  blocksPerFrame:isTouch?260:520,  // 1フレームあたりの破壊ブロック数
  maxDebris:isTouch?10:28,         // 破片パーティクルの上限
  maxGlassify:isTouch?120:280,     // ガラス化/焦土化する地表列の上限

  // ── 衝撃波 ──
  shockwaveSpeed:isTouch?42:56,    // 衝撃波の広がる速度（ブロック/秒）
  shockEdgeDamage:70,              // 衝撃波前面の敵ダメージ基準値
  shockKnockback:26,               // 衝撃波の水平ノックバック基準値

  // ── 地形変化 ──
  destroyBedrock:false,  // クレーター床より下を掘り抜くか（現状は床でクランプ）
  glassifyRim:true,      // 爆心リングをガラス化/黒曜石化するか

  // ── 演出 ──
  flashPeak:0.98,        // 全画面白飛びの最大不透明度
  flashFade:1.6,         // 白飛びが引くまでの時間（秒）
  shakeSurface:1.2,      // 起爆時のカメラシェイク強度
  cloudLife:13,          // キノコ雲の寿命（秒）
  secondaryBooms:4,      // 遅れて鳴る二次爆発の回数

  // ── 誤使用防止 ──
  confirm:true,          // 二段確認（一度目=警告、二度目=起動）を要求するか
  confirmWindow:4.0,     // 二段確認の受付時間（秒）
};

// 実効値（DEBUG_SCALE 反映）。設定変更に追従できるよう毎回計算する軽い getter。
function _tsarScaledConfig(){
  const raw=(typeof settings!=='undefined'&&settings.tsarScale!=null)?settings.tsarScale:TSAR_BOMBA_DEBUG_SCALE;
  const s=Math.max(0.05,Number(raw)||1),c=TsarBombaConfig;
  // 大規模スケール時は破壊対象が半径の2乗以上で増えるため、フレーム分散の
  // 予算も引き上げる（上限つき。1フレームの負荷が壊れない範囲で処理を速める）
  const budget=Math.min(4,Math.max(1,s));
  return{
    vaporizeR:c.vaporizeRadius*s,
    destroyR:c.destructionRadius*s,
    shockR:c.shockwaveRadius*s,
    craterDepth:c.craterDepth*s,
    deepR:c.deepBlastRadius*s,
    scanPerFrame:Math.round(c.scanPerFrame*budget),
    blocksPerFrame:Math.round(c.blocksPerFrame*budget),
    maxGlassify:Math.round(c.maxGlassify*Math.min(6,Math.max(1,s))),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 見た目（1度だけ生成し、以降クローン）
// ══════════════════════════════════════════════════════════════════════════
const _tsarBodyGeo=new THREE.BoxGeometry(1.5,2.0,1.5);
const _tsarBodyMat=new THREE.MeshStandardMaterial({color:0x24160f,roughness:.5,metalness:.6,emissive:0x220000,emissiveIntensity:.3});
const _tsarStripeMat=new THREE.MeshBasicMaterial({color:0xffcc00});
const _tsarWarnMat=new THREE.MeshBasicMaterial({color:0xff2200});
const _tsarFinMat=new THREE.MeshStandardMaterial({color:0x0d0a08,roughness:.7,metalness:.35});
const _tsarNoseMat=new THREE.MeshBasicMaterial({color:0xff5522,transparent:true,opacity:.9});
function _makeTsarBombMesh(){
  const root=new THREE.Object3D();
  const body=new THREE.Mesh(_tsarBodyGeo,_tsarBodyMat.clone());
  const s1=new THREE.Mesh(new THREE.BoxGeometry(1.56,0.3,1.56),_tsarStripeMat.clone());s1.position.y=0.55;
  const s2=new THREE.Mesh(new THREE.BoxGeometry(1.56,0.3,1.56),_tsarStripeMat.clone());s2.position.y=-0.05;
  const warn=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.5,1.6),_tsarWarnMat.clone());warn.position.y=-0.55;warn.visible=false;
  const nose=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.6,0.6),_tsarNoseMat.clone());nose.position.y=-1.15;
  const fins=[];
  for(let i=0;i<4;i++){const f=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.85,0.85),_tsarFinMat.clone());const a=i*Math.PI/2;f.position.set(Math.cos(a)*0.85,0.85,Math.sin(a)*0.85);f.rotation.y=-a;fins.push(f);}
  root.add(body,s1,s2,warn,nose,...fins);
  markShadowCaster(root);
  return{root,warn,nose};
}
const _tsarAimGeo=new THREE.RingGeometry(2.6,3.4,28);
const _tsarAimMat=new THREE.MeshBasicMaterial({color:0xff2200,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false});

// ══════════════════════════════════════════════════════════════════════════
// 状態
// ══════════════════════════════════════════════════════════════════════════
const _tsarBombs=[];         // 落下/設置中の TsarBombaEntity
let _tsarBombCD=0;           // クールダウン残り
let _tsarTrailAcc=0;
let _tsarArmT=0;             // 二段確認の受付タイマー
let _tsarPlayerVX=0,_tsarPlayerVZ=0; // プレイヤーへの衝撃波ノックバック（main.js が消費）
let _tsarFlashLevel=0;       // 全画面白飛びの現在レベル（毎フレーム減衰）
let _tsarFlashEl=null;
function _tsarFlash(){if(!_tsarFlashEl)_tsarFlashEl=document.getElementById('tsarFlash');return _tsarFlashEl;}

// ══════════════════════════════════════════════════════════════════════════
// tsarForceKill: 防御貫通の強制撃破サービス
//   通常ダメージ計算(hit系)は無敵/シールド/ダメージ上限/フェーズ移行/復活で
//   止められうるため、既存の「死亡処理」だけを直接叩いて即死させる。死亡演出・
//   ドロップ・討伐数・実績・ボスバー消去・戦闘終了は既存関数の再利用で発火させ、
//   防御・無敵・フェーズ・復活だけを迂回する。
// ══════════════════════════════════════════════════════════════════════════
const tsarForceKill={
  enemy(e){
    if(!e||e.dead)return;
    e.hp=0;e.dead=true;e.slowT=0;e.burnT=0;
    if(typeof finalizeEnemyDeath==='function')finalizeEnemyDeath(e); // ドロップ/討伐数/スコア/実績/除去
  },
  boss(){
    if(typeof boss==='undefined'||!boss)return;
    boss.hp=0;boss.slowT=0;boss.burnT=0;boss.phase=99;boss.charging=false;
    if(typeof killBoss==='function')killBoss(); // ドロップ/ボスバー消去/実績/最終ボスならクリア処理
  },
  dragon(){
    if(typeof dragon==='undefined'||!dragon)return;
    dragon.hp=0;
    if(typeof killDragon==='function')killDragon(); // ドラゴンコア/ダイヤ/スコア
  },
  mob(m){if(!m||m.dead)return;m.hp=0;if(typeof killMob==='function')killMob(m);},
  humanoid(h){if(!h||(typeof HUMANOID_STATES!=='undefined'&&h.state===HUMANOID_STATES.DEAD))return;h.hp=0;if(typeof killHumanoid==='function')killHumanoid(h);},
  pet(){if(typeof pet==='undefined'||!pet)return;if(typeof hitPet==='function')hitPet(99999);},
};

// 消滅半径内(球)の全エンティティを例外なく即死させる
function _tsarVaporizeEntities(cx,cy,cz,R){
  const R2=R*R,within=(p)=>{const dx=p.x-cx,dy=p.y-cy,dz=p.z-cz;return dx*dx+dy*dy+dz*dz<=R2;};
  if(typeof enemies!=='undefined')for(const e of [...enemies]){if(!e.dead&&within(e.root.position))tsarForceKill.enemy(e);}
  if(typeof boss!=='undefined'&&boss&&within(boss.root.position))tsarForceKill.boss();
  if(typeof dragon!=='undefined'&&dragon&&within(dragon.root.position))tsarForceKill.dragon();
  if(typeof mobs!=='undefined')for(const m of [...mobs]){if(!m.dead&&within(m.root.position))tsarForceKill.mob(m);}
  if(typeof humanoids!=='undefined')for(const h of [...humanoids]){const dead=typeof HUMANOID_STATES!=='undefined'&&h.state===HUMANOID_STATES.DEAD;if(!dead&&within(h.root.position))tsarForceKill.humanoid(h);}
  if(typeof pet!=='undefined'&&pet&&pet.downT<=0&&within(pet.root.position))tsarForceKill.pet();
  // 消滅半径内のプレイヤー（クリエイティブ/無敵/デバッグ以外）は即死。
  // 無敵時間(P.invT)で死を免れないよう先にリセットしてからダメージを与える。
  if(!isCreative()&&!(typeof godMode!=='undefined'&&godMode)){const pp={x:P.x,y:P.y+1,z:P.z};if(within(pp)){P.invT=0;if(typeof dmgPlayer==='function')dmgPlayer(99999);}}
}

// ══════════════════════════════════════════════════════════════════════════
// TsarDestructionQueue: クレーター破壊のキュー＋フレーム分散
//   起爆時に voxels のキーをスナップショットし、フレームごとに一定数だけ
//   「破壊候補判定→破壊」を進める。真円/半球ではなくノイズで不規則な輪郭にする。
// ══════════════════════════════════════════════════════════════════════════
function _tsarHash(x,z){ // 0..1 の決定的擬似乱数（リムの不規則化用）
  let h=(x*374761393+z*668265263)|0;h=(h^(h>>13))*1274126177|0;return((h>>>0)%1000)/1000;
}
const TsarDestructionQueue={
  active:null,
  begin(cx,cy,cz){
    const S=_tsarScaledConfig();
    this.active={
      cx,cy,cz,S,
      keys:Object.keys(voxels), // スナップショット（以降 voxels が変化しても走査は安定）
      scan:0,blocks:[],destroy:0,debris:0,
      glassCols:new Map(), // "x|z" -> floorY（リムのガラス化候補）
      done:false,
    };
  },
  _depthAt(hd,S){
    if(hd>=S.destroyR)return 0;
    if(hd<=S.deepR)return S.craterDepth;
    const t=(hd-S.deepR)/Math.max(0.001,S.destroyR-S.deepR);
    return S.craterDepth*Math.pow(Math.max(0,1-t),1.7);
  },
  _scanKey(t,k){
    const p=k.split('|'),x=+p[0],y=+p[1],z=+p[2];
    const dx=x+0.5-t.cx,dz=z+0.5-t.cz,hd=Math.hypot(dx,dz),S=t.S;
    if(hd>S.destroyR)return;
    const dy=y+0.5-t.cy,d3=Math.hypot(dx,dy,dz);
    // リムのゆらぎ: ノイズで縁を不規則に、局所的に縦穴/崩落壁が残るように
    const wob=(_tsarHash(x,z)-0.35)*S.craterDepth*0.28;
    const floorY=t.cy-this._depthAt(hd,S)+wob;
    const inVapor=d3<=S.vaporizeR;
    let remove=false;
    if(inVapor)remove=true;                       // 中心消滅: 黒曜石も建築も液体も消す
    else if(hd<=S.destroyR&&y+0.5>=floorY)remove=true; // クレーター床から上を全部えぐる
    if(!remove)return;
    const v=voxels[k];if(!v||!v.active)return;
    t.blocks.push({x,y,z,k,ti:v.ti,d:d3,playerPlaced:v.playerPlaced});
    // 縁付近の「新しい床」を記録（後段で焦土/ガラス化）
    if(TsarBombaConfig.glassifyRim&&!inVapor&&hd>S.destroyR*0.45){
      const col=x+'|'+z,cur=t.glassCols.get(col);
      const fy=Math.floor(floorY)-1;
      if(cur===undefined||fy<cur)t.glassCols.set(col,fy);
    }
  },
  _destroyOne(t){
    const b=t.blocks[t.destroy++],v=voxels[b.k];
    if(!v||!v.active||v.ti!==b.ti)return;
    if(typeof ftvOnBlockBroken==='function')ftvOnBlockBroken(b.k);
    if(typeof sucOnBlockBroken==='function')sucOnBlockBroken(b.k);
    if(typeof sccOnBlockBroken==='function')sccOnBlockBroken(b.k);
    if(t.debris<TsarBombaConfig.maxDebris&&Math.hypot(b.x-P.x,b.z-P.z)<26&&Math.random()<0.5){spawnBlockDebris(b.x+.5,b.y+.5,b.z+.5,v.ti);t.debris++;}
    if(v.playerPlaced)delete worldEdits.placed[b.k];else worldEdits.removed[b.k]=true;
    removeBlock(b.x,b.y,b.z);
  },
  update(){
    const t=this.active;if(!t||t.done)return;
    const prevDefer=_deferDirty;_deferDirty=true;
    // スキャン（破壊候補の収集）を分割
    let sb=t.S.scanPerFrame;
    while(t.scan<t.keys.length&&sb-->0)this._scanKey(t,t.keys[t.scan++]);
    // 破壊（近い順に見えるよう、収集済み分を距離ソートしてから消す）
    if(t.scan>=t.keys.length&&!t._sorted){t.blocks.sort((a,b)=>a.d-b.d);t._sorted=true;}
    if(t._sorted){let db=t.S.blocksPerFrame;while(t.destroy<t.blocks.length&&db-->0)this._destroyOne(t);}
    _deferDirty=prevDefer;if(!prevDefer)flushDirtyChunks();
    if(t._sorted&&t.destroy>=t.blocks.length){this._glassify(t);t.done=true;}
  },
  // 爆心リングの地表を焦土(黒曜石)・ガラス化する（上限つき・軽量）
  _glassify(t){
    if(!TsarBombaConfig.glassifyRim)return;
    let n=0;const prevDefer=_deferDirty;_deferDirty=true;
    for(const[col,fy] of t.glassCols){
      if(n++>=t.S.maxGlassify)break;
      const p=col.split('|'),x=+p[0],z=+p[1];
      const k=vKey(x,fy,z),v=voxels[k];
      if(!v||!v.active||v.ti===WATER_BLOCK||v.ti===LAVA_BLOCK)continue;
      const gti=Math.random()<0.35?GLASS_BLOCK:OBSIDIAN_BLOCK; // 一部ガラス化・大半は黒い岩
      if(v.playerPlaced)delete worldEdits.placed[k];else worldEdits.removed[k]=true;
      removeBlock(x,fy,z);
      addBlock(x,fy,z,gti,true,true,0);
      worldEdits.placed[k]=gti|(0<<5);delete worldEdits.removed[k];
    }
    _deferDirty=prevDefer;if(!prevDefer)flushDirtyChunks();
  },
  reset(){this.active=null;},
};

// ══════════════════════════════════════════════════════════════════════════
// ShockwaveController: リング状衝撃波（時間で半径拡大）
// ══════════════════════════════════════════════════════════════════════════
const ShockwaveController={
  active:null,ring:null,ringMat:null,
  begin(cx,cy,cz){
    const S=_tsarScaledConfig();
    this.active={cx,cy,cz,S,r:S.vaporizeR,hit:new WeakSet(),t:0};
    const ringMat=new THREE.MeshBasicMaterial({color:0xffe6b0,transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false});
    const ring=new THREE.Mesh(new THREE.RingGeometry(0.9,1.0,40),ringMat);ring.rotation.x=-Math.PI/2;ring.position.set(cx,cy+0.6,cz);scene.add(ring);
    this.ring=ring;this.ringMat=ringMat;
  },
  update(dt){
    const a=this.active;if(!a)return;
    const prevR=a.r;a.r=Math.min(a.S.shockR,a.r+TsarBombaConfig.shockwaveSpeed*dt);a.t+=dt;
    // 前面の可視リング
    if(this.ring){this.ring.scale.setScalar(a.r);this.ringMat.opacity=.6*Math.max(0,1-a.r/a.S.shockR);}
    // 前面が新たに到達した帯 (prevR, a.r] のエンティティへ大ダメージ＋強ノックバック
    this._sweep(a,prevR,a.r);
    // 通過中は距離減衰の軽いカメラシェイク
    const pd=Math.hypot(P.x-a.cx,P.z-a.cz);
    if(Math.abs(pd-a.r)<8&&typeof ftvShake==='function')ftvShake(0.25*Math.max(0.1,1-a.r/a.S.shockR),.3);
    if(a.r>=a.S.shockR){
      if(this.ring){scene.remove(this.ring);this.ringMat.dispose();this.ring=null;}
      this.active=null;
    }
  },
  _sweep(a,r0,r1){
    const band=(p)=>{const d=Math.hypot(p.x-a.cx,p.z-a.cz);return d>r0&&d<=r1;};
    const dmgAt=(p)=>{const d=Math.hypot(p.x-a.cx,p.z-a.cz);return Math.max(0.15,1-d/a.S.shockR);};
    const push=(o,mul)=>{const p=o.root.position,dx=p.x-a.cx,dz=p.z-a.cz,l=Math.hypot(dx,dz)||1,f=dmgAt(p);o.blastVX=(o.blastVX||0)+dx/l*TsarBombaConfig.shockKnockback*f*mul;o.blastVZ=(o.blastVZ||0)+dz/l*TsarBombaConfig.shockKnockback*f*mul;o.velY=Math.max(o.velY||0,9*f*mul);};
    if(typeof enemies!=='undefined')for(const e of [...enemies]){if(e.dead||a.hit.has(e))continue;if(!band(e.root.position))continue;a.hit.add(e);hitEnemy(e,TsarBombaConfig.shockEdgeDamage*dmgAt(e.root.position));if(!e.dead)push(e,1);}
    if(typeof boss!=='undefined'&&boss&&!a.hit.has(boss)&&band(boss.root.position)){a.hit.add(boss);if(typeof hitBoss==='function')hitBoss(TsarBombaConfig.shockEdgeDamage*0.8*dmgAt(boss.root.position));if(boss)push(boss,0.5);}
    if(typeof dragon!=='undefined'&&dragon&&!a.hit.has(dragon)&&band(dragon.root.position)){a.hit.add(dragon);if(typeof hitDragon==='function')hitDragon(TsarBombaConfig.shockEdgeDamage*dmgAt(dragon.root.position),true);}
    if(typeof mobs!=='undefined')for(const m of [...mobs]){if(m.dead||a.hit.has(m))continue;if(!band(m.root.position))continue;a.hit.add(m);if(typeof hitMob==='function')hitMob(m,TsarBombaConfig.shockEdgeDamage);}
    if(typeof humanoids!=='undefined')for(const h of [...humanoids]){const dead=typeof HUMANOID_STATES!=='undefined'&&h.state===HUMANOID_STATES.DEAD;if(dead||a.hit.has(h))continue;if(!band(h.root.position))continue;a.hit.add(h);if(typeof hitHumanoid==='function')hitHumanoid(h,TsarBombaConfig.shockEdgeDamage);}
    // プレイヤー: 衝撃波帯で距離減衰の大ダメージ＋強ノックバック＋耳鳴り
    if(!isCreative()&&!(typeof godMode!=='undefined'&&godMode)){const pp={x:P.x,y:P.y+1,z:P.z};if(band(pp)&&!a.hitPlayer){a.hitPlayer=true;const f=dmgAt(pp);if(typeof dmgPlayer==='function')dmgPlayer(90*f);const dx=P.x-a.cx,dz=P.z-a.cz,l=Math.hypot(dx,dz)||1;_tsarPlayerVX+=dx/l*TsarBombaConfig.shockKnockback*f;_tsarPlayerVZ+=dz/l*TsarBombaConfig.shockKnockback*f;P.velY=Math.max(P.velY,8*f);P.onGround=false;_tsarFlashLevel=Math.max(_tsarFlashLevel,0.5*f);playTone(180,.5,.09*f,'sine');playTone(90,.7,.07*f,'sine');if(typeof ftvShake==='function')ftvShake(0.6*f,.5);}}
  },
  reset(){if(this.ring){scene.remove(this.ring);this.ringMat.dispose();this.ring=null;}this.active=null;},
};

// ══════════════════════════════════════════════════════════════════════════
// MushroomCloudEffect: 専用キノコ雲＋煙柱（軽量・寿命付き・遠距離はLODで簡略）
// ══════════════════════════════════════════════════════════════════════════
const _tsarCloudGeo=new THREE.SphereGeometry(1,12,9);
const _tsarStemGeo=new THREE.CylinderGeometry(0.55,0.9,1,10,1,true);
const MushroomCloudEffect={
  active:[],
  spawn(cx,cy,cz){
    const d=Math.hypot(P.x-cx,P.z-cz),far=d>120;
    const grp=new THREE.Group();grp.position.set(cx,cy,cz);
    const stemMat=new THREE.MeshBasicMaterial({color:0x30271f,transparent:true,opacity:.72,depthWrite:false});
    const capMat=new THREE.MeshBasicMaterial({color:0x4a3b2c,transparent:true,opacity:.82,depthWrite:false});
    const stem=new THREE.Mesh(_tsarStemGeo,stemMat);stem.scale.set(3,8,3);stem.position.y=4;
    const cap=new THREE.Mesh(_tsarCloudGeo,capMat);cap.scale.set(6,3.4,6);cap.position.y=10;
    grp.add(stem,cap);
    let light=null;
    if(!far&&!isTouch){light=new THREE.PointLight(0xff6622,3,60);light.position.y=9;grp.add(light);}
    scene.add(grp);
    this.active.push({grp,stem,stemMat,cap,capMat,light,t:0,life:TsarBombaConfig.cloudLife,cx,cy,cz,far,puffT:0});
  },
  update(dt){
    for(let i=this.active.length-1;i>=0;i--){
      const c=this.active[i];c.t+=dt;const q=c.t/c.life;
      // 上昇＋横拡散
      c.cap.position.y=10+q*22;c.cap.scale.set(6+q*10,3.4+q*2,6+q*10);
      c.stem.scale.set(3+q*1.5,8+q*14,3+q*1.5);c.stem.position.y=4+q*11;
      c.grp.rotation.y+=dt*0.15;
      c.capMat.opacity=.82*Math.max(0,1-q);c.stemMat.opacity=.72*Math.max(0,1-q*1.1);
      if(c.light)c.light.intensity=3*Math.max(0,1-q*2.2);
      // 立ち上る黒煙（近距離のみ、間引き）
      if(!c.far){c.puffT-=dt;if(c.puffT<=0){c.puffT=isTouch?.4:.22;spawnParticles(c.cx+(Math.random()-.5)*4,c.cy+2+q*10,c.cz+(Math.random()-.5)*4,0x2a221b,isTouch?1:2);}}
      if(c.t>=c.life){scene.remove(c.grp);c.stemMat.dispose();c.capMat.dispose();this.active.splice(i,1);}
    }
  },
  reset(){for(const c of this.active){scene.remove(c.grp);c.stemMat.dispose();c.capMat.dispose();}this.active.length=0;},
};

// ══════════════════════════════════════════════════════════════════════════
// TsarBombaExplosionController: 段階爆発シーケンスの司令塔
//   1.閃光 → 2.中心消滅(強制即死+消滅キュー) → 3.巨大クレーター(TsarDestructionQueue)
//   → 4.衝撃波(ShockwaveController) → 5.余波(キノコ雲・煙柱・二次爆発)
// ══════════════════════════════════════════════════════════════════════════
const TsarBombaExplosionController={
  detonate(ix,iy,iz){
    const S=_tsarScaledConfig();
    const cx=ix+0.5,cy=iy+0.5,cz=iz+0.5;
    const d=Math.hypot(P.x-cx,P.y+1-cy,P.z-cz);

    // ── 第1段階: 閃光 ──
    if(settings.flash!==false)_tsarFlashLevel=TsarBombaConfig.flashPeak;
    spawnParticles(cx,cy+1,cz,0xffffff,isTouch?6:14);
    if(!isTouch){const light=new THREE.PointLight(0xfff2c0,6,Math.min(90,S.shockR));light.position.set(cx,cy+4,cz);scene.add(light);setTimeout(()=>{scene.remove(light);},260);}
    if(typeof ftvShake==='function')ftvShake(TsarBombaConfig.shakeSurface,1.1);

    // 起爆音（遠いほど遅れて届く演出＋低音の衝撃）
    const boom=()=>{const vol=Math.max(.05,.6*(1-d/120));playTone(38,.9,vol,'sine');playTone(70,.5,vol*.7,'square');playTone(120,.3,vol*.5,'sawtooth');};
    if(d>40)setTimeout(boom,Math.min(900,d*7));else boom();

    // ── 第2段階: 中心消滅（強制即死） ──
    _tsarVaporizeEntities(cx,cy,cz,S.vaporizeR);

    // ── 第3段階: 巨大クレーター（フレーム分散破壊） ──
    TsarDestructionQueue.begin(cx,cy,cz);

    // ── 第4段階: 衝撃波（時間で半径拡大） ──
    ShockwaveController.begin(cx,cy,cz);

    // ── 第5段階: 余波（キノコ雲＋煙柱＋遅延二次爆発） ──
    MushroomCloudEffect.spawn(cx,cy,cz);
    for(let n=1;n<=TsarBombaConfig.secondaryBooms;n++){
      setTimeout(()=>{
        const vol=Math.max(.03,.3*(1-d/120));playTone(48,.5,vol,'sine');
        spawnParticles(cx+(Math.random()-.5)*S.vaporizeR,cy+2,cz+(Math.random()-.5)*S.vaporizeR,0x201a14,2);
        if(typeof ftvShake==='function'&&Math.hypot(P.x-cx,P.z-cz)<S.shockR)ftvShake(0.15,.35);
      },600+n*700+Math.random()*300);
    }

    if(typeof showAlert==='function')showAlert('☢ ツァーリ・ボンバ 起爆！');
  },
};

// ══════════════════════════════════════════════════════════════════════════
// TsarBombaEntity: 落下/設置中の爆弾。states: 'falling' → 'fuse' → (爆発)
// ══════════════════════════════════════════════════════════════════════════
function _tsarSpawnEntity(sx,sy,sz,vx,vy,vz,state){
  const built=_makeTsarBombMesh();
  built.root.position.set(sx,sy,sz);scene.add(built.root);
  let aim=null;
  if(state==='falling'){aim=new THREE.Mesh(_tsarAimGeo,_tsarAimMat.clone());aim.rotation.x=-Math.PI/2;scene.add(aim);}
  _tsarBombs.push({root:built.root,warn:built.warn,nose:built.nose,aim,
    x:sx,y:sy,z:sz,px:sx,py:sy,pz:sz,vx,vy,vz,spin:Math.random()*Math.PI*2,age:0,
    state,fuse:TsarBombaConfig.fuseTime,beepT:0});
}

function _tsarBombSweep(b){
  const dx=b.x-b.px,dy=b.y-b.py,dz=b.z-b.pz,len=Math.hypot(dx,dy,dz);
  const steps=Math.max(1,Math.ceil(len*2));
  for(let s=1;s<=steps;s++){
    const t=s/steps,x=b.px+dx*t,y=b.py+dy*t,z=b.pz+dz*t;
    const v=voxels[vKey(Math.floor(x),Math.floor(y),Math.floor(z))];
    if(v&&v.active)return{x:Math.floor(x),y:Math.floor(y),z:Math.floor(z)};
    if(typeof enemies!=='undefined')for(const e of enemies){if(e.dead)continue;const ep=e.root.position;if(Math.abs(ep.x-x)<1.1&&Math.abs(ep.y+0.9-y)<1.6&&Math.abs(ep.z-z)<1.1)return{x:Math.floor(x),y:Math.floor(y),z:Math.floor(z)};}
    if(typeof boss!=='undefined'&&boss){const p=boss.root.position;if(Math.abs(p.x-x)<boss.sc&&Math.abs(p.y-y)<boss.sc*1.6&&Math.abs(p.z-z)<boss.sc)return{x:Math.floor(x),y:Math.floor(y),z:Math.floor(z)};}
    if(y<=surfaceHeightAt(Math.floor(x),Math.floor(z)))return{x:Math.floor(x),y:Math.floor(y),z:Math.floor(z)};
  }
  return null;
}

function updateTsarBomba(dt){
  if(_tsarBombCD>0)_tsarBombCD=Math.max(0,_tsarBombCD-dt);
  if(_tsarArmT>0)_tsarArmT=Math.max(0,_tsarArmT-dt);
  const C=TsarBombaConfig;
  _tsarTrailAcc+=dt;const emitTrail=_tsarTrailAcc>=0.05;if(emitTrail)_tsarTrailAcc=0;

  for(let i=_tsarBombs.length-1;i>=0;i--){
    const b=_tsarBombs[i];b.age+=dt;
    if(b.state==='falling'){
      b.px=b.x;b.py=b.y;b.pz=b.z;
      b.vy=Math.max(-C.maxFall,b.vy-C.gravity*dt);
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;
      b.spin+=4*dt;b.root.position.set(b.x,b.y,b.z);b.root.rotation.y=b.spin;b.root.rotation.z=Math.sin(b.age*6)*0.12;
      if(emitTrail){spawnParticles(b.x,b.y+.6,b.z,0x3a332b,2);}
      if(b.aim){const gy=surfaceHeightAt(Math.floor(b.x),Math.floor(b.z));b.aim.position.set(b.x,gy+1.02,b.z);const k=Math.min(1,(b.y-gy)/28);b.aim.material.opacity=.25+.45*(1-k);b.aim.scale.setScalar(0.8+k*0.7);}
      const hit=_tsarBombSweep(b);
      if(hit||b.age>=C.fallFuseTimeout){
        // 着弾: 起爆演出フェーズへ移行（クレーター中心に据える）
        b.x=hit?hit.x+0.5:b.x;b.z=hit?hit.z+0.5:b.z;
        b.impactX=hit?hit.x:Math.floor(b.x);b.impactZ=hit?hit.z:Math.floor(b.z);
        b.impactY=hit?hit.y:Math.floor(surfaceHeightAt(b.impactX,b.impactZ));
        b.y=b.impactY+1.0;b.root.position.set(b.x,b.y,b.z);
        b.state='fuse';b.fuse=C.fuseTime;b.beepT=0;
        if(b.aim){scene.remove(b.aim);b.aim.material.dispose();b.aim=null;}
        _tsarStartFuseFx(b);
      }
    }else if(b.state==='fuse'){
      b.fuse-=dt;b.beepT-=dt;
      // 起爆前演出: 赤点滅＋警告音、フューズ終盤ほど速く
      const frac=Math.max(0,b.fuse/C.fuseTime),rate=C.warnBeepInterval*(0.35+0.65*frac);
      if(b.beepT<=0){b.beepT=rate;playTone(320+(1-frac)*260,.09,.09,'square');playTone(150,.12,.06,'sawtooth');}
      if(b.warn)b.warn.visible=Math.floor(performance.now()/(90+frac*180))%2===0;
      if(b.nose)b.nose.material.opacity=0.5+Math.abs(Math.sin(b.age*10))*0.5;
      const pulse=1+Math.sin(performance.now()*(.012+(1-frac)*.03))*(.03+(1-frac)*.05);b.root.scale.setScalar(pulse);
      if(b.fuse<=0){
        const ix=b.impactX!=null?b.impactX:Math.floor(b.x),iy=b.impactY!=null?b.impactY:Math.floor(b.y),iz=b.impactZ!=null?b.impactZ:Math.floor(b.z);
        scene.remove(b.root);disposeObject3D(b.root);_tsarBombs.splice(i,1);
        TsarBombaExplosionController.detonate(ix,iy,iz);
      }
    }
  }

  // 段階システムの更新
  TsarDestructionQueue.update();
  ShockwaveController.update(dt);
  MushroomCloudEffect.update(dt);

  // 全画面白飛びの減衰
  if(_tsarFlashLevel>0){
    _tsarFlashLevel=Math.max(0,_tsarFlashLevel-dt/Math.max(0.1,C.flashFade));
    const el=_tsarFlash();if(el)el.style.opacity=String(_tsarFlashLevel);
  }else{const el=_tsarFlash();if(el&&el.style.opacity!=='0')el.style.opacity='0';}
}

// 着弾直後の演出: 低い警告音＋周囲環境音を弱める雰囲気（軽い実装）
function _tsarStartFuseFx(b){
  playTone(70,.4,.16,'sine');setTimeout(()=>playTone(55,.5,.14,'sine'),120);
  spawnParticles(b.x,b.y,b.z,0x332a20,4);
  if(typeof ftvShake==='function')ftvShake(0.25,.4);
  if(typeof showBonus==='function')showBonus('☢ 起爆シーケンス開始… 退避せよ！');
}

// プレイヤーへの衝撃波ノックバック（main.js の movePlayer に加算される）
function tsarPlayerImpulse(dt){
  const out={x:_tsarPlayerVX,z:_tsarPlayerVZ};
  const decay=Math.exp(-5.5*dt);
  _tsarPlayerVX*=decay;_tsarPlayerVZ*=decay;
  if(Math.abs(_tsarPlayerVX)<.02)_tsarPlayerVX=0;if(Math.abs(_tsarPlayerVZ)<.02)_tsarPlayerVZ=0;
  return out;
}

// ══════════════════════════════════════════════════════════════════════════
// 使用（設置 or 空中投下）＋誤使用防止（二段確認）
// ══════════════════════════════════════════════════════════════════════════
function _tsarAltitude(){const gy=surfaceHeightAt(Math.floor(P.x),Math.floor(P.z));return P.y-gy;}

function _tsarConsume(){if(!isCreative()){inv.tsarBomba=Math.max(0,(inv.tsarBomba|0)-1);updateInvHUD();}}

function deployTsarBomba(){
  if(!gs.running)return;
  if(_tsarBombCD>0){showBonus('☢ チャージ中… '+_tsarBombCD.toFixed(1)+'s');playTone(200,.08,.06,'square');return;}
  if(!isCreative()&&(inv.tsarBomba|0)<=0){showBonus('☢ ツァーリ・ボンバがない！ クラフトしよう');playTone(180,.1,.08,'sawtooth');return;}
  // 二段確認（誤使用防止）。設定 tsarConfirm=false で無効化できる。
  const needConfirm=(typeof settings!=='undefined'&&settings.tsarConfirm===false)?false:TsarBombaConfig.confirm;
  if(needConfirm&&_tsarArmT<=0){
    _tsarArmT=TsarBombaConfig.confirmWindow;
    showAlert('☢ 本当に使用しますか？ ワールドが崩壊します。もう一度で起動');
    playTone(140,.18,.12,'sawtooth');setTimeout(()=>playTone(110,.2,.1,'sawtooth'),160);
    return;
  }
  _tsarArmT=0;
  const flying=typeof P!=='undefined'&&P.flying;
  if(flying&&_tsarAltitude()>=TsarBombaConfig.minAltitude){_tsarAirDrop();}
  else{_tsarGroundPlace();}
}

function _tsarAirDrop(){
  _tsarConsume();_tsarBombCD=TsarBombaConfig.cooldown;
  const C=TsarBombaConfig;
  const sx=P.x,sy=P.y-C.spawnBelow,sz=P.z;
  const yawDir={x:Math.sin(yaw),z:Math.cos(yaw)};
  const vx=_tsarLastMoveX*C.inheritVel+yawDir.x*0.8;
  const vz=_tsarLastMoveZ*C.inheritVel+yawDir.z*0.8;
  _tsarSpawnEntity(sx,sy,sz,vx,-2,vz,'falling');
  playTone(420,.1,.1,'square');setTimeout(()=>playTone(300,.14,.09,'square'),100);
  showAlert('☢ ツァーリ・ボンバ 投下！');
}

function _tsarGroundPlace(){
  _tsarConsume();_tsarBombCD=TsarBombaConfig.cooldown;
  // プレイヤーの少し前方の地表に設置
  const fx=Math.sin(yaw),fz=Math.cos(yaw);
  const px=Math.floor(P.x+fx*2),pz=Math.floor(P.z+fz*2);
  const gy=surfaceHeightAt(px,pz);
  _tsarSpawnEntity(px+0.5,gy+1.5,pz+0.5,0,0,0,'fuse');
  const b=_tsarBombs[_tsarBombs.length-1];
  b.impactX=px;b.impactY=gy;b.impactZ=pz;b.fuse=TsarBombaConfig.fuseTime;
  _tsarStartFuseFx(b);
  showAlert('☢ ツァーリ・ボンバ 設置・点火！');
}

// プレイヤーの直近の水平移動量（投下時の慣性継承）。main.js から毎フレーム更新。
let _tsarLastMoveX=0,_tsarLastMoveZ=0;
function tsarBombNoteMove(mx,mz){_tsarLastMoveX=mx;_tsarLastMoveZ=mz;}

// ══════════════════════════════════════════════════════════════════════════
// UI（モバイル投下ボタン）
// ══════════════════════════════════════════════════════════════════════════
function updateTsarBombBtn(){
  const btn=document.getElementById('tsarBombBtn');if(!btn)return;
  const has=isCreative()||(inv.tsarBomba|0)>0;
  const show=!isDesktop&&gs.running&&has;
  btn.style.display=show?'':'none';
  if(show){const n=isCreative()?'∞':(inv.tsarBomba|0);const armed=_tsarArmT>0;btn.innerHTML='<span class="aIcon">☢</span><span class="aLabel">'+(armed?'CONFIRM':'TSAR '+n)+'</span>';btn.style.filter=armed?'drop-shadow(0 0 8px #ff3300)':'';}
}

// ══════════════════════════════════════════════════════════════════════════
// セーブ / リセット
//   地形破壊は worldEdits（既存のワールド保存方式）に反映済みなので
//   再読み込み後もクレーターは残る。落下/起爆中の爆弾だけ状態を保存する。
//   （倒したボスの復活防止・破壊建築の非復活も worldEdits/実績側で担保される）
// ══════════════════════════════════════════════════════════════════════════
function tsarBombaSaveState(){
  return _tsarBombs.map(b=>({x:b.x,y:b.y,z:b.z,state:b.state,fuse:b.fuse,
    impactX:b.impactX,impactY:b.impactY,impactZ:b.impactZ}));
}
function tsarBombaLoadState(saved){
  if(!Array.isArray(saved))return;
  for(const d of saved){
    // 落下途中はやり直しの安全策として「設置(fuse)」で復元する（すり抜け起爆防止）
    const ix=d.impactX!=null?d.impactX:Math.floor(d.x),iz=d.impactZ!=null?d.impactZ:Math.floor(d.z);
    const iy=d.impactY!=null?d.impactY:Math.floor(surfaceHeightAt(ix,iz));
    _tsarSpawnEntity(ix+0.5,iy+1.5,iz+0.5,0,0,0,'fuse');
    const b=_tsarBombs[_tsarBombs.length-1];
    b.impactX=ix;b.impactY=iy;b.impactZ=iz;b.fuse=Math.max(0.4,Number(d.fuse)||TsarBombaConfig.fuseTime);
  }
}
function resetTsarBomba(){
  for(const b of _tsarBombs){scene.remove(b.root);disposeObject3D(b.root);if(b.aim){scene.remove(b.aim);b.aim.material.dispose();}}
  _tsarBombs.length=0;
  TsarDestructionQueue.reset();ShockwaveController.reset();MushroomCloudEffect.reset();
  _tsarBombCD=0;_tsarTrailAcc=0;_tsarArmT=0;_tsarPlayerVX=0;_tsarPlayerVZ=0;_tsarFlashLevel=0;
  const el=_tsarFlash();if(el)el.style.opacity='0';
}

window.deployTsarBomba=deployTsarBomba;
