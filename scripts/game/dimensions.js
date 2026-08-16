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
// 通常世界のランタイム物体はチャンク外のscene直下に置かれている。チャンクだけを
// 破棄すると終端界の同座標へ敵・動物・ドロップが持ち越されるため、入場中は一時退避する。
let _overworldRuntimeSnapshot=null;
// 終端界で保存したデータを直接ロードした場合、通常世界の相棒や動物はまだ生成できない。
// 通常世界へ戻るまでセーブ由来の軽量データだけを保持する。
let _stagedOverworldContinueRuntime=null;

function _runtimeSceneNode(o){return o&&(o.root||o.mesh)||null;}
function _setRuntimeNodesVisible(list,visible){for(const o of list||[]){const n=_runtimeSceneNode(o);if(n){if(visible)scene.add(n);else scene.remove(n);}}}
function _setOverworldPersistentSceneVisible(visible){
  for(const list of[chests,beds,trophies,enchTables,furnaces,farmPlots])_setRuntimeNodesVisible(list,visible);
  for(const k in underTreasures){const t=underTreasures[k];if(t&&!t.opened&&t.mesh){if(visible)scene.add(t.mesh);else scene.remove(t.mesh);}}
  _setRuntimeNodesVisible([pet,horse,merchant],visible);
  const setNode=n=>{if(n){if(visible)scene.add(n);else scene.remove(n);}};
  if(frozenVillage){for(const a of frozenVillage.arrows||[])setNode(a.mesh);for(const f of frozenVillage.flames||[])setNode(f);setNode(frozenVillage.sprite);}
  if(undergroundCity){setNode(undergroundCity.group);setNode(undergroundCity.sprite);setNode(undergroundCity.pillar);}
  if(collapsingSkyCity){setNode(collapsingSkyCity.visual);setNode(collapsingSkyCity.beam);}
  if(sunkenRoyalCity)setNode(sunkenRoyalCity.visual);
  if(walkingFortress)setNode(walkingFortress.mesh);
}
function _disposeRuntimeList(list){for(const o of list||[]){const n=_runtimeSceneNode(o);if(n){scene.remove(n);disposeObject3D(n);}}}
function _disposeLooseRuntime(){
  _disposeRuntimeList(enemies.splice(0));
  _disposeRuntimeList(mobs.splice(0));
  _disposeRuntimeList(humanoids.splice(0));
  for(const it of items.splice(0)){scene.remove(it.mesh);if(it.mat)it.mat.dispose();}
  for(const p of projectiles.splice(0)){scene.remove(p.mesh);if(p.mesh&&p.mesh.material)p.mesh.material.dispose();}
  if(boss){scene.remove(boss.root);disposeObject3D(boss.root);boss=null;}
  if(dragon){scene.remove(dragon.root);disposeObject3D(dragon.root);dragon=null;}
  if(typeof $bossWrap!=='undefined')$bossWrap.classList.remove('show');
}
function _detachOverworldRuntime(){
  if(_overworldRuntimeSnapshot)return;
  if(mounted&&typeof dismountHorse==='function')dismountHorse();
  _overworldRuntimeSnapshot={
    enemies:enemies.splice(0),mobs:mobs.splice(0),humanoids:humanoids.splice(0),
    items:items.splice(0),projectiles:projectiles.splice(0),boss,dragon
  };
  boss=null;dragon=null;
  _setRuntimeNodesVisible(_overworldRuntimeSnapshot.enemies,false);
  _setRuntimeNodesVisible(_overworldRuntimeSnapshot.mobs,false);
  _setRuntimeNodesVisible(_overworldRuntimeSnapshot.humanoids,false);
  _setRuntimeNodesVisible(_overworldRuntimeSnapshot.items,false);
  _setRuntimeNodesVisible(_overworldRuntimeSnapshot.projectiles,false);
  _setRuntimeNodesVisible([_overworldRuntimeSnapshot.boss,_overworldRuntimeSnapshot.dragon],false);
  _setOverworldPersistentSceneVisible(false);
  if(typeof $bossWrap!=='undefined')$bossWrap.classList.remove('show');
}
function _restoreOverworldRuntime(){
  // 終端界でチート召喚などにより作られた通常系ランタイムは通常世界へ持ち帰らない。
  _disposeLooseRuntime();
  const s=_overworldRuntimeSnapshot;_overworldRuntimeSnapshot=null;
  if(s){
    enemies.push(...s.enemies);mobs.push(...s.mobs);humanoids.push(...s.humanoids);
    items.push(...s.items);projectiles.push(...s.projectiles);boss=s.boss;dragon=s.dragon;
    _setRuntimeNodesVisible(s.enemies,true);_setRuntimeNodesVisible(s.mobs,true);_setRuntimeNodesVisible(s.humanoids,true);
    _setRuntimeNodesVisible(s.items,true);_setRuntimeNodesVisible(s.projectiles,true);
    _setRuntimeNodesVisible([boss,dragon],true);
    if(boss&&typeof $bossWrap!=='undefined')$bossWrap.classList.add('show');
  }
  _setOverworldPersistentSceneVisible(true);
}
function _discardOverworldRuntime(){
  _stagedOverworldContinueRuntime=null;
  const s=_overworldRuntimeSnapshot;_overworldRuntimeSnapshot=null;if(!s)return;
  _disposeRuntimeList(s.enemies);_disposeRuntimeList(s.mobs);_disposeRuntimeList(s.humanoids);
  for(const it of s.items){scene.remove(it.mesh);if(it.mat)it.mat.dispose();}
  for(const p of s.projectiles){scene.remove(p.mesh);if(p.mesh&&p.mesh.material)p.mesh.material.dispose();}
  _disposeRuntimeList([s.boss,s.dragon]);
}

function dimensionsStageOverworldContinueRuntime(d){
  if(currentDimension!=='endZone')return;
  _stagedOverworldContinueRuntime={
    pet:d.pet?{hp:d.pet.hp,downT:d.pet.downT}:null,
    horseTamed:!!d.horseTamed,mounted:!!d.mounted
  };
  // 家具類は通常世界の座標で復元済みだが、終端界のsceneには表示しない。
  _setOverworldPersistentSceneVisible(false);
}
function dimensionsCompanionSaveFields(){
  const s=_stagedOverworldContinueRuntime;
  return s?{pet:s.pet?{...s.pet}:null,horseTamed:s.horseTamed,mounted:s.mounted}:null;
}
function _restoreStagedOverworldContinueRuntime(){
  const s=_stagedOverworldContinueRuntime;if(!s)return;
  _stagedOverworldContinueRuntime=null;
  if(s.pet)spawnPetAtPlayer(s.pet.hp!=null?s.pet.hp:PET_MAX_HP,s.pet.downT||0);
  if(s.horseTamed)spawnHorseAtPlayer(s.mounted);
  spawnAnimals(8);spawnHumanoids(1);
}

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
    firstEntryShown:dim==='endZone'?ezFirstEntryShown:undefined,
    // 🌀 DESTABILIZATION / 巨大骸骨: ezFirstEntryShownと同じ扱い（終端界にだけ意味を
    // 持つ単純な状態なので、離脱時にスナップショットへ退避し再入場時に復元する）
    destab:(dim==='endZone'&&typeof destabSaveState==='function')?destabSaveState():undefined,
    colossus:(dim==='endZone'&&typeof colossusSaveState==='function')?colossusSaveState():undefined,
    // 🕳 WORLD EATER: 上と同じ扱い。ブロック単位の削除ログではなく特異点座標+半径+seed
    // だけの軽量スナップショット(worldEaterSaveState参照)。
    worldEater:(dim==='endZone'&&typeof worldEaterSaveState==='function')?worldEaterSaveState():undefined,
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
  if(leaving==='overworld'&&target==='endZone')_detachOverworldRuntime();
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
    if(typeof destabLoadState==='function')destabLoadState(snap?snap.destab:null);
    if(typeof colossusLoadState==='function')colossusLoadState(snap?snap.colossus:null);
    // 🕳 WORLD EATER: ezColossusDefeatedの復元後に読み込む(旧セーブからの自動解禁判定に必要)
    if(typeof worldEaterLoadState==='function')worldEaterLoadState(snap?snap.worldEater:null);
    if(typeof tsarZonesLoadState==='function')tsarZonesLoadState(snap?snap.tsarZones:[]);
    if(typeof updateEndZoneChunks==='function')updateEndZoneChunks(true);
  }
  if(snap&&snap.worldEdits)unpackWorldEditsInto(worldEdits,snap.worldEdits);
  applyWorldEdits();
  if(typeof tntLoadState==='function')tntLoadState(snap?snap.explosives:[]);
  if(typeof tsarBombaLoadState==='function')tsarBombaLoadState(snap?snap.tsarBombs:[]);
  if(typeof longinusLoadState==='function')longinusLoadState(snap?snap.longinus:null);
  if(typeof railgunLoadState==='function')railgunLoadState(snap?snap.railgun:null);
  if(target==='overworld'&&leaving==='endZone')_restoreOverworldRuntime();
  if(snap){P.x=snap.px;P.y=snap.py;P.z=snap.pz;yaw=snap.yaw;pitch=snap.pitch;}
  else if(target==='overworld'){const sp=findSafeSpawn(0,0);P.x=sp.x;P.y=sp.y;P.z=sp.z;}
  else{P.x=EZ_SPAWN.x;P.y=EZ_SPAWN.y;P.z=EZ_SPAWN.z;}
  if(target==='overworld'&&leaving==='endZone')_restoreStagedOverworldContinueRuntime();
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
  _discardOverworldRuntime();
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
  if(typeof destabLoadState==='function')destabLoadState(snap.destab||null);
  if(typeof colossusLoadState==='function')colossusLoadState(snap.colossus||null);
  // 🕳 WORLD EATER: ezColossusDefeatedの復元後に読み込む(旧セーブからの自動解禁判定に必要)
  if(typeof worldEaterLoadState==='function')worldEaterLoadState(snap.worldEater||null);
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
  _discardOverworldRuntime();
  currentDimension='overworld';
  _dimStore.overworld=null;_dimStore.endZone=null;
  if(typeof ezUnmount==='function')ezUnmount();
  document.body.classList.remove('endZone');
  if(typeof ezUpdateMenuButtons==='function')ezUpdateMenuButtons();
  // 🌀 新規ゲームでは DESTABILIZATION / 巨大骸骨の状態も必ず初期化する
  if(typeof resetDestabilization==='function')resetDestabilization();
  if(typeof resetColossus==='function')resetColossus();
  // 🕳 新規ゲームでは WORLD EATER の解禁/発動状態も必ず初期化する
  if(typeof resetWorldEater==='function')resetWorldEater();
}
