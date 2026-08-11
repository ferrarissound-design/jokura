// ============================================================================
// jokura / dimensions.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、同一のグローバルスコープを共有する前提で読み込まれる。
// world.js（チャンク・voxel基盤）・save.js（worldEdits圧縮）・explosives.js/
// tsar_bomba.js/longinus.js/railgun.js（各兵器のsave/load/reset）より後、
// end_zone.js（終端界の実装）より前に読み込むこと。
//
// ═══ 設計方針 ═══
// 「通常世界」と「終端界」は voxels/chunks/worldEdits/TNT/ツァーリ/LONGINUS/
// RAILGUNの状態を完全に分離するが、これらを2セット同時にメモリへ保持し続ける
// ことはしない（スマホでメモリが増え続けない、という要件のため）。
// 離脱するディメンションは save.js の各 xxxSaveState() で軽量なスナップショット
// (JSON化可能なプレーンオブジェクト)に圧縮して _dimStore へ退避し、voxels/chunks
// は破棄する。入場するディメンションは同じ xxxLoadState() でスナップショットから
// 復元する（既存のセーブ/ロードの仕組みをそのままディメンション間移動にも流用する）。
// 未訪問のディメンションはスナップショットが null のまま、シードだけワールド
// シードから決定的に導出して新規生成する。
// ============================================================================

// ═══ CURRENT DIMENSION ═══
let currentDimension='overworld'; // 'overworld' | 'endZone'
// 現在アクティブでない方のディメンションの軽量スナップショット（null = 未訪問）
const _dimStore={overworld:null,endZone:null};
let _dimTransitioning=false;

function _emptyDimSnapshot(){
  return{seed:WORLD_SEED,worldEdits:{v:2,placed:{},removed:[]},explosives:[],tsarBombs:[],tsarZones:[],longinus:null,railgun:null,px:0,py:20,pz:0,yaw:0,pitch:0};
}
// 現在ライブな(=currentDimensionが指す)ワールド状態を軽量スナップショットへ圧縮する。
// voxels/chunksそのものは含めない（決定的に再生成できるため）。
function _packLiveDimension(dim){
  return{
    seed:dim==='overworld'?WORLD_SEED:ezSeed,
    worldEdits:packWorldEdits(worldEdits),
    explosives:(typeof tntSaveState==='function')?tntSaveState():[],
    tsarBombs:(typeof tsarBombaSaveState==='function')?tsarBombaSaveState():[],
    tsarZones:(typeof tsarZonesSaveState==='function')?tsarZonesSaveState():[],
    longinus:(typeof longinusSaveState==='function')?longinusSaveState():null,
    railgun:(typeof railgunSaveState==='function')?railgunSaveState():null,
    px:P.x,py:P.y,pz:P.z,yaw:yaw,pitch:pitch,
    firstEntryShown:dim==='endZone'?ezFirstEntryShown:undefined
  };
}

// ═══ ディメンション切替の本体 ═══
// leaving側: ライブ状態をスナップショットへ退避し、兵器系のランタイム状態を
// 完全にリセットしてから chunks/voxels を破棄する。
// target側: スナップショットがあれば復元、無ければそのディメンションのシードから
// 新規生成する。どちらの場合も generateChunk/generateEndZoneChunk のどちらか
// 片方しか動かないので、通常世界の地表・地下チャンクが終端界滞在中に生成される
// ことはない。
function _swapDimension(target){
  const leaving=currentDimension;
  _dimStore[leaving]=_packLiveDimension(leaving);
  if(typeof resetTNTSystem==='function')resetTNTSystem();
  if(typeof resetCrustBomb==='function')resetCrustBomb();
  if(typeof resetTsarBomba==='function')resetTsarBomba(); // TsarBlastZones/_tsarZoneGridも同時にクリアされる
  if(typeof resetLonginus==='function')resetLonginus();
  if(typeof resetRailgun==='function')resetRailgun();
  if(typeof regionEditor!=='undefined'&&regionEditor){regionEditor.close();regionEditor.resetUndo();regionEditor.resetSelection();}
  if(leaving==='endZone'&&typeof ezUnmount==='function')ezUnmount();
  _disposeAllChunks();

  currentDimension=target;
  const snap=_dimStore[target];
  resetWorldEdits();
  if(target==='overworld'){
    initWorldNoise(snap?snap.seed:WORLD_SEED);
    if(typeof tsarZonesLoadState==='function')tsarZonesLoadState(snap?snap.tsarZones:[]);
    updateChunks(true);
  }else{
    ezSeed=snap?snap.seed:_deriveEndZoneSeed(WORLD_SEED);
    if(typeof ezInitNoise==='function')ezInitNoise(ezSeed);
    ezFirstEntryShown=snap?!!snap.firstEntryShown:false;
    if(typeof tsarZonesLoadState==='function')tsarZonesLoadState(snap?snap.tsarZones:[]);
    if(typeof updateEndZoneChunks==='function')updateEndZoneChunks(true);
  }
  if(snap&&snap.worldEdits)unpackWorldEditsInto(worldEdits,snap.worldEdits);
  applyWorldEdits();
  if(typeof tntLoadState==='function')tntLoadState(snap?snap.explosives:[]);
  if(typeof tsarBombaLoadState==='function')tsarBombaLoadState(snap?snap.tsarBombs:[]);
  if(typeof longinusLoadState==='function')longinusLoadState(snap?snap.longinus:null);
  if(typeof railgunLoadState==='function')railgunLoadState(snap?snap.railgun:null);
  if(snap){P.x=snap.px;P.y=snap.py;P.z=snap.pz;yaw=snap.yaw;pitch=snap.pitch;}
  else if(target==='overworld'){const sp=findSafeSpawn(0,0);P.x=sp.x;P.y=sp.y;P.z=sp.z;}
  else{P.x=EZ_SPAWN.x;P.y=EZ_SPAWN.y;P.z=EZ_SPAWN.z;}
  P.velY=0;P.onGround=false;
  _dimStore[target]=null;
  document.body.classList.toggle('endZone',target==='endZone');
  if(target==='endZone'){
    if(typeof ezMount==='function')ezMount();
    if(!ezFirstEntryShown){ezFirstEntryShown=true;if(typeof ezShowFirstEntryBanner==='function')ezShowFirstEntryBanner();}
  }
  if(typeof ezUpdateMenuButtons==='function')ezUpdateMenuButtons();
  if(typeof updateHUD==='function')updateHUD();
  if(typeof saveGame==='function')saveGame();
}

// ─── 画面フェード（黒紫）+ 低い効果音 + ディメンション名表示。短時間で完了する ───
const $dimWarp=document.getElementById('dimWarp'),$dimWarpText=document.getElementById('dimWarpText');
function _dimFadeTransition(label,midCallback){
  if(typeof playTone==='function'){playTone(70,.5,.28,'sine');setTimeout(()=>{if(typeof playTone==='function')playTone(46,.55,.2,'sine');},90);}
  if(!$dimWarp){midCallback();return;}
  if($dimWarpText)$dimWarpText.textContent=label;
  $dimWarp.classList.add('show');
  setTimeout(()=>{
    midCallback();
    setTimeout(()=>{$dimWarp.classList.remove('show');},80);
  },240);
}
// クリエイティブ専用の公開API。BUILDメニューのボタンから呼ばれる。
function enterDimension(target){
  if(!gs.running||!isCreative())return;
  if(currentDimension===target||_dimTransitioning)return;
  if(typeof closeHudPopovers==='function')closeHudPopovers();
  _dimTransitioning=true;
  const label=target==='endZone'?'🌀 THE END ZONE':'🌍 OVERWORLD';
  _dimFadeTransition(label,()=>{
    _swapDimension(target);
    _dimTransitioning=false;
  });
}

// ═══ セーブ/ロード連携 ═══
// save.js の saveGame() が呼ぶ。既存のトップレベル項目(worldSeed/worldEdits/
// explosives/tsarBombs/tsarZones/longinus/railgun/px/py/pz/yaw/pitch)は常に
// 「通常世界」を指す（後方互換のため意味を変えない）。終端界のデータは新規
// トップレベル項目 endZone / currentDimension に追加するだけなので、endZoneを
// 知らない旧バージョンやendZone未訪問のセーブでもそのまま読める。
function dimensionsSaveFields(){
  const overworld=(currentDimension==='overworld')?_packLiveDimension('overworld'):(_dimStore.overworld||_emptyDimSnapshot());
  const endZone=(currentDimension==='endZone')?_packLiveDimension('endZone'):_dimStore.endZone;
  return{
    currentDimension,
    worldSeed:overworld.seed,worldEdits:overworld.worldEdits,
    explosives:overworld.explosives,tsarBombs:overworld.tsarBombs,tsarZones:overworld.tsarZones,
    longinus:overworld.longinus,railgun:overworld.railgun,
    px:overworld.px,py:overworld.py,pz:overworld.pz,yaw:overworld.yaw,pitch:overworld.pitch,
    endZone
  };
}
// main.js の continueGame() が worldSeed/worldEdits等を読み込む直前に呼ぶ。
// 戻り値 true = 終端界がアクティブだったのでワールド読み込みまで完了させた
// （呼び出し側は既存の通常世界読み込みブロックをスキップする）。
// 戻り値 false = 通常世界がアクティブ。呼び出し側は従来どおりのブロックを実行する。
function dimensionsApplyContinueLoad(d){
  currentDimension=(d.currentDimension==='endZone')?'endZone':'overworld';
  _dimStore.endZone=d.endZone?{...d.endZone}:null;
  if(currentDimension!=='endZone'){_dimStore.overworld=null;document.body.classList.remove('endZone');return false;}
  _dimStore.overworld={
    seed:d.worldSeed,worldEdits:d.worldEdits||{v:2,placed:{},removed:[]},
    explosives:d.explosives||[],tsarBombs:d.tsarBombs||[],tsarZones:d.tsarZones||[],
    longinus:d.longinus||null,railgun:d.railgun||null,
    px:d.px||0,py:(d.py!=null?d.py:20),pz:d.pz||0,yaw:d.yaw||0,pitch:d.pitch||0
  };
  const snap=_dimStore.endZone||{};
  _dimStore.endZone=null;
  ezSeed=snap.seed!=null?snap.seed:_deriveEndZoneSeed(d.worldSeed||WORLD_SEED);
  if(typeof ezInitNoise==='function')ezInitNoise(ezSeed);
  ezFirstEntryShown=!!snap.firstEntryShown;
  if(typeof tsarZonesLoadState==='function')tsarZonesLoadState(snap.tsarZones||[]);
  if(typeof updateEndZoneChunks==='function')updateEndZoneChunks(true);
  resetWorldEdits();
  if(snap.worldEdits)unpackWorldEditsInto(worldEdits,snap.worldEdits);
  applyWorldEdits();
  if(typeof tntLoadState==='function')tntLoadState(snap.explosives||[]);
  if(typeof tsarBombaLoadState==='function')tsarBombaLoadState(snap.tsarBombs||[]);
  if(typeof longinusLoadState==='function')longinusLoadState(snap.longinus||null);
  if(typeof railgunLoadState==='function')railgunLoadState(snap.railgun||null);
  P.x=snap.px!=null?snap.px:EZ_SPAWN.x;P.y=snap.py!=null?snap.py:EZ_SPAWN.y;P.z=snap.pz!=null?snap.pz:EZ_SPAWN.z;
  yaw=snap.yaw||0;pitch=snap.pitch||0;
  document.body.classList.add('endZone');
  if(typeof ezMount==='function')ezMount();
  if(typeof ezUpdateMenuButtons==='function')ezUpdateMenuButtons();
  return true;
}
// main.js の startGame()（新規ゲーム）から呼ぶ。常に通常世界から始める。
function dimensionsResetForNewGame(){
  currentDimension='overworld';
  _dimStore.overworld=null;_dimStore.endZone=null;
  if(typeof ezUnmount==='function')ezUnmount();
  document.body.classList.remove('endZone');
  if(typeof ezUpdateMenuButtons==='function')ezUpdateMenuButtons();
}
