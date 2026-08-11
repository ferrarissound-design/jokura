// ============================================================================
// jokura / destabilization.js
// 🌀 終端界専用: DESTABILIZATION（崩壊度）システム。
// 「好きなだけ破壊できる世界」に、破壊するほど世界そのものが反応して変化する
// 仕組みを足す。終端界にいる間だけ意味を持つ 0〜100 のゲージで、通常ブロック
// 破壊・TNT・地殻貫通爆弾・RAILGUN・LONGINUS・TSAR BOMBAの使用量（＝破壊規模の
// 推定値）に応じて増加する。25/50/75%で段階的な演出、100%で colossus.js の
// 巨大骸骨覚醒イベントを起動する。
//
// 破壊量そのものを厳密計測すると各兵器のフレーム分散キューへ深く食い込む必要が
// あるため、要件どおり「破壊半径や設定値から推定値を加算する方式」を採る
// （球/円柱の体積を粗く見積もるだけの軽い計算で、キューには一切手を入れない）。
//
// 読み込み順: … tsar_bomba → tsar_sequence → longinus → longinus_sequence →
//             railgun → railgun_sequence → destabilization → colossus → hud → …
// なので showAlert/showBonus/ftvShake/playTone/audioDuckTo 等は実行時に定義済み。
// ============================================================================

const DestabConfig={
  perBlockBreak:0.018,           // 通常ブロック破壊 1個あたり（ごく少量）
  tnt:{flat:0.35,perBlock:0.012,cap:3.5},          // 少量
  crust:{flat:1.6,perBlock:0.01,cap:8},            // 中程度
  railgun:{flat:2.2,perBlock:0.0009,cap:8},        // 中程度（円柱体積は大きいので係数は小さめ）
  longinus:{flat:8,perBlock:0.014,cap:18},         // 大きく上昇
  tsarBase:{flat:5,perBlock:0.003,cap:60},         // 非常に大きく上昇（威力設定で変動）
};

let ezDestab=0;          // 0-100。終端界にいる間だけ意味を持つ
let ezDestabStage=0;     // 直近に発火した閾値: 0/25/50/75/100
const $destabGaugeWrap=document.getElementById('destabGaugeWrap');
const $destabGaugeFill=document.getElementById('destabGaugeFill');
const $destabGaugePct=document.getElementById('destabGaugePct');
const $destabBanner=document.getElementById('destabBanner');
const $destabBannerTitle=document.getElementById('destabBannerTitle');
const $destabBannerSub=document.getElementById('destabBannerSub');
let _destabBannerT=0;

function destabActive(){
  return typeof currentDimension!=='undefined'&&currentDimension==='endZone'
    &&!(typeof ezColossusDefeated!=='undefined'&&ezColossusDefeated);
}
// 半径Rの球の体積から「破壊されたであろうブロック数」を粗く見積もる
function _destabSphereBlocks(r){const rr=Math.max(0.4,r);return (4/3)*Math.PI*rr*rr*rr;}
function _destabCylinderBlocks(r,len){return Math.PI*Math.max(0.3,r)*Math.max(0.3,r)*Math.max(1,len);}

function _destabAdd(amount){
  if(!destabActive())return;
  if(!(amount>0))return;
  if(ezDestab>=100)return;
  ezDestab=Math.min(100,ezDestab+amount);
  _destabCheckStages();
  destabUpdateHUD();
}

// ─── 増加要因 ───
function destabOnBlockBroken(){_destabAdd(DestabConfig.perBlockBreak);}
// kind: 'tnt' | 'crust' | 'railgun' | 'longinus' | 'tsar'
// a/b の意味は kind ごとに異なる（各武器ファイル側のコメント参照）
function destabOnWeaponUse(kind,a,b){
  const C=DestabConfig;
  if(kind==='tnt'){
    const blocks=_destabSphereBlocks(a);
    _destabAdd(Math.min(C.tnt.cap,C.tnt.flat+blocks*C.tnt.perBlock));
  }else if(kind==='crust'){
    const blocks=_destabSphereBlocks(a);
    _destabAdd(Math.min(C.crust.cap,C.crust.flat+blocks*C.crust.perBlock));
  }else if(kind==='railgun'){
    const blocks=_destabCylinderBlocks(a,b);
    _destabAdd(Math.min(C.railgun.cap,C.railgun.flat+blocks*C.railgun.perBlock));
  }else if(kind==='longinus'){
    const blocks=_destabSphereBlocks(a);
    _destabAdd(Math.min(C.longinus.cap,C.longinus.flat+blocks*C.longinus.perBlock));
  }else if(kind==='tsar'){
    const scale=Math.max(0.05,Number(b)||1);
    const blocks=_destabSphereBlocks(a);
    // 威力設定(TSAR_SCALE_VALS: 20%〜3000%)に応じた段階ボーナス。
    // 3000% EXTINCTION級は世界が明確に危険な状態へ進むくらい大きく上げる。
    const tierBonus=scale>=30?42:scale>=20?28:scale>=10?17:scale>=5?10:scale>=1.5?4:0;
    _destabAdd(Math.min(C.tsarBase.cap,C.tsarBase.flat+tierBonus+blocks*C.tsarBase.perBlock));
  }
}

// ─── HUDゲージ ───
function destabUpdateHUD(){
  if(!$destabGaugeWrap)return;
  const inEz=typeof currentDimension!=='undefined'&&currentDimension==='endZone';
  $destabGaugeWrap.style.display=inEz?'':'none';
  if(!inEz)return;
  const pct=Math.round(ezDestab);
  if($destabGaugeFill)$destabGaugeFill.style.width=pct+'%';
  if($destabGaugePct)$destabGaugePct.textContent=pct+'%';
  if($destabGaugeWrap)$destabGaugeWrap.classList.toggle('critical',ezDestab>=75);
}

// ─── 段階演出バナー（25/75%の短い警告、100%覚醒シーケンス、撃破後の余韻で再利用） ───
function destabShowBanner(title,sub,dur){
  if(!$destabBanner)return;
  if($destabBannerTitle)$destabBannerTitle.textContent=title;
  if($destabBannerSub)$destabBannerSub.textContent=sub||'';
  $destabBanner.classList.add('show');
  _destabBannerT=Math.max(_destabBannerT,dur||2.6);
}
function destabHideBanner(){if($destabBanner)$destabBanner.classList.remove('show');_destabBannerT=0;}

// ─── 段階チェック ───
function _destabCheckStages(){
  if(ezDestab>=25&&ezDestabStage<25){ezDestabStage=25;_destabStage25();}
  if(ezDestab>=50&&ezDestabStage<50){ezDestabStage=50;_destabStage50();}
  if(ezDestab>=75&&ezDestabStage<75){ezDestabStage=75;_destabStage75();}
  if(ezDestab>=100&&ezDestabStage<100){ezDestabStage=100;_destabStage100();}
}

function _destabStage25(){
  destabShowBanner('⚠ DESTABILIZATION DETECTED','世界がわずかに軋み始めた…',2.6);
  if(typeof ftvShake==='function')ftvShake(0.08,0.7);
  playTone(48,1.1,0.12,'sine');
  if(typeof sfxTsarRumble==='function')sfxTsarRumble(0.12,1.4);
}
function _destabStage50(){
  destabShowBanner('崩壊が進行している','遠くに何かの気配がある…',3.0);
  if(typeof ftvShake==='function')ftvShake(0.14,1.0);
  playTone(42,1.4,0.16,'sine');
  if(typeof sfxTsarRumble==='function')sfxTsarRumble(0.18,1.8);
  if(typeof colossusRevealSilhouette==='function')colossusRevealSilhouette();
}
function _destabStage75(){
  destabShowBanner('WARNING','ANOMALOUS MASS DETECTED',3.4);
  if(typeof ftvShake==='function')ftvShake(0.2,1.1);
  playTone(38,1.5,0.2,'sine');playTone(60,0.5,0.14,'sawtooth');
  if(typeof colossusEnterStirring==='function')colossusEnterStirring();
}
function _destabStage100(){
  if(typeof colossusAwaken==='function')colossusAwaken();
}

// ─── 環境演出: end_zone.js の ezApplyAtmosphere() が毎フレーム基本値を設定した
// 「あと」に呼ばれ、崩壊度に応じて空と霧をさらに不安定にする。ezTick からも
// 崩壊度なりの遠雷・浮遊粒子増加・小規模崩落を駆動する ───
function destabApplyAtmosphere(){
  if(!destabActive())return;
  const t=Math.min(1,ezDestab/100);
  if(t<=0)return;
  // 空/霧の色をより不安定に（暗く、赤黒く濁らせる）
  scene.fog.color.r=Math.max(0,scene.fog.color.r*(1-t*0.4));
  scene.fog.color.g=Math.max(0,scene.fog.color.g*(1-t*0.55));
  scene.fog.color.b=Math.max(0,scene.fog.color.b*(1-t*0.3));
  if(t>=0.25){scene.fog.color.r=Math.min(1,scene.fog.color.r+t*0.05);}
  renderer.setClearColor(scene.fog.color);
  hemLight.intensity=Math.max(0.08,hemLight.intensity*(1-t*0.45));
}

let _destabThunderT=4+Math.random()*4;
let _destabCrumbleT=10+Math.random()*8;
function destabTick(dt){
  if(_destabBannerT>0){_destabBannerT-=dt;if(_destabBannerT<=0)destabHideBanner();}
  if(!destabActive())return;
  // 50%以降: 時々遠雷、浮遊粒子はezMountの既存パーティクルで代替（増加は演出コスト対効果が低いため間引き用のダストで表現）
  if(ezDestab>=50){
    _destabThunderT-=dt;
    if(_destabThunderT<=0){
      _destabThunderT=(ezDestab>=75?5:9)+Math.random()*7;
      if($lightning){$lightning.classList.add('on');setTimeout(()=>{if($lightning)$lightning.classList.remove('on');},100);}
      if(typeof sfxThunder==='function')sfxThunder();
      if(typeof ftvShake==='function')ftvShake(0.05,0.3);
    }
    // 一部の浮島から小規模な崩落（軽量: プレイヤー近傍の数ブロックだけ）
    _destabCrumbleT-=dt;
    if(_destabCrumbleT<=0){
      _destabCrumbleT=(ezDestab>=75?9:16)+Math.random()*10;
      _destabCrumbleNear(P.x,P.y,P.z,3+Math.floor(Math.random()*3));
    }
  }
}

// プレイヤー近傍の地表ブロックをごく少数だけ崩す（TsarDestructionQueueのような
// フレーム分散キューは使わず、件数を最初から極小に絞ることで同じ効果を得る）
function _destabCrumbleNear(cx,cy,cz,count){
  let done=0;
  for(let attempt=0;attempt<24&&done<count;attempt++){
    const dx=Math.floor((Math.random()*2-1)*14),dz=Math.floor((Math.random()*2-1)*14);
    const x=Math.floor(cx)+dx,z=Math.floor(cz)+dz;
    const gy=surfaceHeightAt(x,z);
    const k=vKey(x,gy,z),v=voxels[k];
    if(!v||!v.active||v.ti===WATER_BLOCK||v.ti===OBSIDIAN_BLOCK)continue;
    if(Math.hypot(x-cx,z-cz)>36)continue;
    spawnBlockDebris(x+.5,gy+.5,z+.5,v.ti);
    if(v.playerPlaced)delete worldEdits.placed[k];else worldEdits.removed[k]=true;
    removeBlock(x,gy,z);
    done++;
  }
}

// ─── セーブ/ロード ───
function destabSaveState(){return{v:ezDestab,stage:ezDestabStage};}
function destabLoadState(saved){
  if(!saved||typeof saved!=='object'){ezDestab=0;ezDestabStage=0;return;}
  ezDestab=Math.max(0,Math.min(100,Number(saved.v)||0));
  ezDestabStage=[0,25,50,75,100].includes(saved.stage)?saved.stage:0;
  destabUpdateHUD();
}
function resetDestabilization(){
  ezDestab=0;ezDestabStage=0;_destabThunderT=4+Math.random()*4;_destabCrumbleT=10+Math.random()*8;
  destabHideBanner();
  destabUpdateHUD();
}
