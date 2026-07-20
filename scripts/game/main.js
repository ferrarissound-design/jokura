// ============================================================================
// jokura / main.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、下記の順序で <script> として読み込まれ、すべて同一のグローバル
// スコープを共有する（元は単一の boot() 関数だったため、この順序と共有スコープが前提）。
// 読み込み順: state → achievements → crafting → save → ui → audio → world →
//             combat → entities → hud → input → main
// ============================================================================

// ═══ BUTTONS ═══
const breakBtn=document.getElementById('breakBtn'),placeBtn=document.getElementById('placeBtn'),jumpBtn=document.getElementById('jumpBtn'),weaponBtn=document.getElementById('weaponBtn'),saveFloatBtn=document.getElementById('saveFloatBtn');
// hold ATTACK to keep mining/attacking (auto-repeats at the weapon cooldown in tick)
let attackHeld=false;
let _attackLockUntil=0;
function _attackDown(e){
  const now=performance.now();
  if(now<_attackLockUntil)return;
  _attackLockUntil=now+350;
  e.preventDefault();e.stopPropagation();attackHeld=true;doAttack(e);
}
function _attackUp(){attackHeld=false;}
if(HAS_POINTER_EVENTS){
  breakBtn.addEventListener('pointerdown',_attackDown);
  breakBtn.addEventListener('pointerup',_attackUp);
  breakBtn.addEventListener('pointercancel',_attackUp);
  breakBtn.addEventListener('pointerleave',_attackUp);
}else{
  breakBtn.addEventListener('touchstart',_attackDown,{passive:false});
  breakBtn.addEventListener('touchend',_attackUp);
  breakBtn.addEventListener('touchcancel',_attackUp);
}
let _jumpBtnLastT=0;
function _onJumpBtnTap(){const now=Date.now();if(now-_jumpBtnLastT<100)return;_jumpBtnLastT=now;doJump();}
bindTapSafe(jumpBtn,_onJumpBtnTap);
// ─── CREATIVE FLIGHT BUTTONS (touch) ───
// FLY toggles flight; while flying, hold JUMP to ascend and ⬇ to descend
const $flyBtn=document.getElementById('flyBtn'),$flyDownBtn=document.getElementById('flyDownBtn');
function _bindHold(el,set){
  if(!el)return;
  const dn=(e)=>{e.preventDefault();set(true);};
  const up=()=>set(false);
  if(HAS_POINTER_EVENTS){el.addEventListener('pointerdown',dn);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('pointerleave',up);}
  else{el.addEventListener('touchstart',dn,{passive:false});el.addEventListener('touchend',up);el.addEventListener('touchcancel',up);}
}
_bindHold(jumpBtn,v=>{jumpBtnHeld=v;});
_bindHold($flyDownBtn,v=>{flyDownHeld=v;});
if($flyBtn)bindTapSafe($flyBtn,toggleFly);
function updateFlyBtns(){
  const show=isCreative()&&!isDesktop&&gs.running;
  if($flyBtn){$flyBtn.style.display=show?'':'none';$flyBtn.textContent=P.flying?'🛬 LAND':'🕊 FLY';}
  if($flyDownBtn)$flyDownBtn.style.display=show&&P.flying?'':'none';
}
// ─── 🏗 特殊生成 PICKER (creative only) ───
// ボタンは即座にメニューを開くだけ（クールダウン不要）。実際の一発生成（数千
// ブロック編集）はメニュー内のボタン側で1.5秒クールダウンを共有して踏む。
const $structBtn=document.getElementById('structBtn');
const $regionEditBtn=document.getElementById('regionEditBtn');
const $regionEditHud=document.getElementById('regionEditHud');
const $regionEditStatus=document.getElementById('regionEditStatus');
const $regionEditBlockName=document.getElementById('regionEditBlockName');
const $rePickABtn=document.getElementById('rePickABtn');
const $rePickBBtn=document.getElementById('rePickBBtn');
const $reUndoBtn=document.getElementById('reUndoBtn');
const $structPanel=document.getElementById('structPanel');
const $structBody=document.getElementById('structBody');
const $structCloseBtn=document.getElementById('structCloseBtn');
let _structGenCooldownT=0;
function buildStructPanel(){
  if(!$structBody)return;
  $structBody.innerHTML='';
  const grid=document.createElement('div');grid.className='structGrid';
  for(const def of SPECIAL_STRUCTURES){
    const b=document.createElement('button');b.className='structBtn';
    b.innerHTML='<span class="sIcon">'+def.icon+'</span><span class="sLabel">'+def.label+'</span><span class="sDesc">'+def.desc+'</span>';
    b.addEventListener('pointerdown',(e)=>{
      e.stopPropagation(); // cheatBtnと同じ理由: パネルの縦スワイプを潰さない
      if(!gs.running||!isCreative())return;
      const now=performance.now();
      if(now<_structGenCooldownT)return;
      _structGenCooldownT=now+1500;
      initAudio();
      generateSpecialStructure(def.key);
      closeStructPanel();
    });
    grid.appendChild(b);
  }
  $structBody.appendChild(grid);
}
function openStructPanel(){if(!gs.running||!isCreative())return;buildStructPanel();setPanel($structPanel,true);}
function closeStructPanel(){setPanel($structPanel,false);}
function _onStructBtnTap(){if(!gs.running||!isCreative())return;initAudio();openStructPanel();}
if($structBtn)bindTapSafe($structBtn,_onStructBtnTap);
function _hotbarSlotName(i){const s=(typeof slots!=='undefined')&&slots[i];return s?s.textContent.replace(/[0-9]/g,'').trim():'';}
function updateRegionEditUI(){
  if(!$regionEditHud||!regionEditor)return;
  const st=regionEditor.state;
  const on=st.active&&isCreative()&&gs.running;
  $regionEditHud.style.display=on?'':'none';
  if(!on)return;
  if($regionEditStatus)$regionEditStatus.textContent=st.msg;
  // バッチ編集中はボタンを無効化して二重実行や誤タップを防ぐ
  $regionEditHud.classList.toggle('reBusy',st.busy);
  // 次のタップでどちらの点が選ばれるかをボタンのハイライトで示す
  if($rePickABtn)$rePickABtn.classList.toggle('reActive',!st.busy&&st.picking==='A');
  if($rePickBBtn)$rePickBBtn.classList.toggle('reActive',!st.busy&&st.picking==='B');
  if($regionEditBlockName)$regionEditBlockName.textContent=_hotbarSlotName(curType)||'?';
  if($reUndoBtn){
    const n=st.undoStack.length;
    $reUndoBtn.textContent=n>0?'↩ Undo ('+n+')':'↩ Undo';
    $reUndoBtn.classList.toggle('reDisabled',n===0);
  }
}
function _onRegionEditBtnTap(){if(!gs.running||!isCreative())return;initAudio();if(!regionEditor)regionEditor=makeRegionEditor();regionEditor.toggle();updateRegionEditUI();}
if($regionEditBtn)bindTapSafe($regionEditBtn,_onRegionEditBtnTap);
if($regionEditHud)$regionEditHud.addEventListener('pointerdown',(e)=>{e.stopPropagation();const b=e.target.closest('button[data-re]');if(!b||!regionEditor)return;e.preventDefault();const a=b.dataset.re;if(a==='pickA')regionEditor.setPickMode('A');else if(a==='pickB')regionEditor.setPickMode('B');else if(a==='fill')regionEditor.run('fill');else if(a==='delete')regionEditor.run('delete');else if(a==='wall')regionEditor.run('wall');else if(a==='floor')regionEditor.run('floor');else if(a==='box')regionEditor.run('box');else if(a==='undo')regionEditor.undo();else if(a==='clear')regionEditor.resetSelection();else if(a==='close')regionEditor.close();updateRegionEditUI();});
if($structCloseBtn)bindTapSafe($structCloseBtn,closeStructPanel);
// Creative-only spawn eggs: reuse the voxel mob builders and place the
// selected mob a few blocks in front of the player.
const CREATIVE_MOBS=[
  {icon:'🐷',label:'ブタ',desc:'おとなしい動物',kind:'pig'},
  {icon:'🐑',label:'ヒツジ',desc:'羊毛がとれる',kind:'sheep'},
  {icon:'🐔',label:'ニワトリ',desc:'卵を産む',kind:'chicken'},
  {icon:'🐺',label:'オオカミ',desc:'肉で仲間になる',kind:'wolf'},
  {icon:'🐴',label:'ウマ',desc:'乗って移動できる',kind:'horse'},
];
function _creativeSpawnPoint(){
  const dir=new THREE.Vector3();camera.getWorldDirection(dir);dir.y=0;
  if(dir.lengthSq()<.01)dir.set(0,0,-1);else dir.normalize();
  const x=P.x+dir.x*5,z=P.z+dir.z*5;
  return{x,z,y:getHeight(Math.floor(x),Math.floor(z))};
}
function spawnCreativeMob(def){
  if(!gs.running||!isCreative())return;
  const p=_creativeSpawnPoint(),before=mobs.length;createAnimal(p.x,p.z,def.kind);
  if(mobs.length===before){showBonus('動物が多すぎます');return;}
  showBonus(def.icon+' '+def.label+'を召喚');playTone(720,.08,.08,'square');
}
function clearCreativeMobs(){
  if(!isCreative())return;
  for(const e of enemies){scene.remove(e.root);disposeObject3D(e.root);}enemies.length=0;
  for(const m of mobs){scene.remove(m.root);disposeObject3D(m.root);}mobs.length=0;
  clearHumanoids();
  showBonus('召喚モブを全消去');
}
// creative hides survival-only HUD (HP/満腹度/EAT/MEAT), like Minecraft creative
function applyModeUI(){
  const cr=isCreative();
  const hp=document.getElementById('hpArea'),fd=document.getElementById('fdArea');
  if(hp)hp.style.display=cr?'none':'';
  if(fd)fd.style.display=cr?'none':'';
  if($eatBtn)$eatBtn.style.display=cr?'none':'';
  if($meatLabel)$meatLabel.style.display=cr?'none':'';
  if($structBtn)$structBtn.style.display=cr?'':'none';
  if($regionEditBtn)$regionEditBtn.style.display=cr?'':'none';
  if(!cr&&regionEditor)regionEditor.close();
  if(typeof updateRegionEditUI==='function')updateRegionEditUI();
  updateFlyBtns();
  if(typeof applyMobileModeUI==='function')applyMobileModeUI();
}
let _weaponBtnLastT=0;
function _onWeaponBtnTap(){const now=Date.now();if(now-_weaponBtnLastT<100)return;_weaponBtnLastT=now;cycleWeapon();}
bindTapSafe(weaponBtn,_onWeaponBtnTap);
let _saveBtnLastT=0;
function _onSaveBtnTap(){const now=Date.now();if(now-_saveBtnLastT<100)return;_saveBtnLastT=now;if(gs.running)saveGame();}
bindTapSafe(saveFloatBtn,_onSaveBtnTap);

// PLACEボタン長押し：近くにベッド→睡眠、チェスト→操作、ベッド所持→設置、チェスト所持→設置
let placeLongPressTimer=null;
let placePressActive=false;
let _placeLockUntil=0;
function _bedNearby(){return beds.some(b=>{const dx=b.x+.5-P.x,dz=b.z+.9-P.z,dy=b.y+.3-(P.y+.8);return Math.hypot(dx,dy,dz)<2.5;});}
function _chestNearby(){return chests.some(c=>{const dx=c.x+.5-P.x,dz=c.z+.5-P.z,dy=c.y+.35-(P.y+.8);return Math.hypot(dx,dy,dz)<2.2;});}
function _startPlacePress(){
  const now=performance.now();
  if(now<_placeLockUntil||placePressActive)return;
  _placeLockUntil=now+350;
  placePressActive=true;
  initAudio();
  placeLongPressTimer=setTimeout(()=>{
    placeLongPressTimer=null;
    doFurnitureAction();
  },500);
}
function _endPlacePress(runShort){
  if(!placePressActive)return;
  placePressActive=false;
  if(placeLongPressTimer!==null){clearTimeout(placeLongPressTimer);placeLongPressTimer=null;if(runShort)doPlace();}
}
function _placeDown(e){e.preventDefault();e.stopPropagation();_startPlacePress();}
function _placeUp(e){e.preventDefault();e.stopPropagation();_endPlacePress(true);}
function _placeCancel(){_endPlacePress(false);}
if(HAS_POINTER_EVENTS){
  placeBtn.addEventListener('pointerdown',_placeDown);
  placeBtn.addEventListener('pointerup',_placeUp);
  placeBtn.addEventListener('pointercancel',_placeCancel);
}else{
  placeBtn.addEventListener('touchstart',_placeDown,{passive:false});
  placeBtn.addEventListener('touchend',_placeUp,{passive:false});
  placeBtn.addEventListener('touchcancel',_placeCancel);
}

// ═══ OVERLAY ═══
const overlay=document.getElementById('overlay'),ovTitle=document.getElementById('ovTitle'),ovInfo=document.getElementById('ovInfo'),ovBtn=document.getElementById('ovBtn'),ovSub=document.getElementById('ovSub');
const $endlessBtn=document.getElementById('endlessBtn');
let _endlessBtnLastT=0;
bindTapSafe($endlessBtn,()=>{const now=Date.now();if(now-_endlessBtnLastT<100)return;_endlessBtnLastT=now;startEndless();});
const $contDeathBtn=document.getElementById('contDeathBtn');
let _contDeathLastT=0;
function _onContDeathTap(){const now=Date.now();if(now-_contDeathLastT<100)return;_contDeathLastT=now;continueAfterDeath();}
bindTapSafe($contDeathBtn,_onContDeathTap);
let undergroundSnapshot=null,prevPlayerUnderground=false;
function undergroundDeath(){
  P.hp=0;P.invT=99;gs.running=false;updateHUD();
  if(undergroundSnapshot){
    for(const k in undergroundSnapshot.inv){if(k in inv)inv[k]=undergroundSnapshot.inv[k];}
    unlockedWeapons.forEach((_,i)=>{unlockedWeapons[i]=undergroundSnapshot.unlockedWeapons[i];});
    if(undergroundSnapshot.hasDiamondSword){if(!hasDiamondSword)applyDiamondSword();}else{if(hasDiamondSword){hasDiamondSword=false;resetSwordStats();}}
    // 鉄の剣もスナップショットへ巻き戻す（ダイヤ剣が無いときだけ性能を反映）
    hasIronSword=!!undergroundSnapshot.hasIronSword;
    if(hasIronSword){unlockedWeapons[1]=true;if(!hasDiamondSword){WEAPONS[1].name='🔩 Iron Sword';WEAPONS[1].dmg=5;WEAPONS[1].cd=0.38;}}
    else if(!hasDiamondSword){resetSwordStats();}
    if(undergroundSnapshot.hasDiamondBow){if(!hasDiamondBow)applyDiamondBow();}else{if(hasDiamondBow){hasDiamondBow=false;WEAPONS[3].name='🏹 Bow';WEAPONS[3].dmg=4;WEAPONS[3].cd=0.7;}}
    if(undergroundSnapshot.hasDiamondStaff){if(!hasDiamondStaff)applyDiamondStaff();}else{if(hasDiamondStaff){hasDiamondStaff=false;}}
    if(undergroundSnapshot.hasDiamondHammer){if(!hasDiamondHammer)applyDiamondHammer();}else{if(hasDiamondHammer){hasDiamondHammer=false;WEAPONS[2].name='🔨 Hammer';WEAPONS[2].dmg=6;WEAPONS[2].cd=0.8;WEAPONS[2].range=3;WEAPONS[2].type='melee';}}
    ensureUnlockedWeaponSelected();
    chestCount=undergroundSnapshot.chestCount;bedCount=undergroundSnapshot.bedCount;trophyCount=undergroundSnapshot.trophyCount||trophyCount;enchTableCount=undergroundSnapshot.enchTableCount!=null?undergroundSnapshot.enchTableCount:enchTableCount;furnaceCount=undergroundSnapshot.furnaceCount!=null?undergroundSnapshot.furnaceCount:furnaceCount;updateChestHUD();updateBedHUD();updateTrophyHUD();updateEnchTableHUD();updateFurnaceHUD();
    // 地下入場時点の鎧・エンチャントへ巻き戻す（地下で作った/壊れた分は失う）
    armor=undergroundSnapshot.armor?{...undergroundSnapshot.armor}:null;updateArmorHUD();
    if(undergroundSnapshot.enchants)Object.assign(enchants,undergroundSnapshot.enchants);
    undergroundSnapshot=null;
  }
  prevPlayerUnderground=false;
  gs.score=0;
  for(let i=enemies.length-1;i>=0;i--){if(enemies[i].root.position.y<0){scene.remove(enemies[i].root);disposeObject3D(enemies[i].root);enemies.splice(i,1);}}
  if(dragon){dragon.hp=dragon.maxHp;dragon.hpBar.scale.x=1;dragon.state='prowl';dragon.stateT=3;}
  $df.classList.add('on');
  setTimeout(()=>{
    $df.classList.remove('on');
    const sh=getHeight(Math.floor(P.x),Math.floor(P.z));
    P.y=sh+1.5;P.velY=0;P.onGround=false;
    P.hp=30;P.invT=4;gs.running=true;
    updateInvHUD();saveGame();
    showAlert('☠ 地下で倒れた… 戦利品を失い地上へ戻された');
  },900);
}
function gameComplete(){
  gs.running=false;
  unlockAchievement('dragonSlayer');
  saveScore(true);
  ovTitle.style.color='#00e5ff';ovTitle.style.textShadow='3px 3px 0 #006688,6px 6px 0 #003344,0 0 30px #00e5ffaa';
  ovTitle.textContent='GAME CLEAR!!';
  if($ovSplash)$ovSplash.textContent='💎 キングダイヤモンドドラゴンを討伐！';
  ovSub.textContent='CONGRATULATIONS';
  ovInfo.innerHTML='スコア: <b>'+gs.score+'</b><br>ウェーブ: '+gs.wave+'　キル: '+gs.kills+'<br>生存日数: '+gs.day+'日<br><span style="color:#b499e6">♾ エンドレスモードでこの世界の続きに挑戦できる！</span>';
  ovBtn.textContent='もう一度';
  $contDeathBtn.style.display='none';$endlessBtn.style.display='';$contBtn.classList.add('disabled');
  renderRankHUD();overlay.classList.remove('hide');updateOverlaySaveInfo({enableContinueButton:false});
  [1200,1500,1800,2200,2600,3000].forEach((f,i)=>setTimeout(()=>playTone(f,.25,.35,'sine'),i*160));
}
// クリア画面から現在のワールドのままエンドレス突入
function startEndless(){
  if(gs.running)return;
  endlessMode=true;gs.running=true;
  P.hp=P.maxHp;P.invT=3;gs.nextWave=20;
  ovTitle.style.color='';ovTitle.style.textShadow='';ovTitle.textContent='ジョークラ';
  ovSub.textContent='VOXEL SURVIVAL';
  $endlessBtn.style.display='none';$contBtn.classList.remove('disabled');
  overlay.classList.add('hide');
  showAlert('♾ ENDLESS MODE！WAVEは無限に続く…');
  playTone(500,.15,.2,'sawtooth');setTimeout(()=>playTone(750,.15,.18,'sawtooth'),160);setTimeout(()=>playTone(1000,.2,.2,'sawtooth'),320);
  saveGame();
}
function gameOver(){
  if(P.y<0&&undergroundSnapshot){undergroundDeath();return;}
  saveScore(endlessMode); // エンドレス中の死亡は「クリア済みラン」としてランキングに残す
  $endlessBtn.style.display='none';
  gs.running=false;ovTitle.style.color='#ff4444';ovTitle.style.textShadow='3px 3px 0 #880000,6px 6px 0 #330000';ovTitle.textContent='GAME OVER';if($ovSplash)$ovSplash.textContent='また挑戦しよう！';ovSub.textContent='';ovInfo.innerHTML='スコア: <b>'+gs.score+'</b><br>ウェーブ: '+gs.wave+'　キル: '+gs.kills+'<br>生存日数: '+gs.day+'日<br>🥩 MEAT: '+meat;ovBtn.textContent='RETRY';$contDeathBtn.style.display='';$contBtn.classList.add('disabled');renderRankHUD();overlay.classList.remove('hide');updateOverlaySaveInfo({enableContinueButton:false});
}
function continueAfterDeath(){P.hp=P.maxHp;P.invT=3;gs.score=Math.floor(gs.score*0.5);gs.running=true;$contDeathBtn.style.display='none';$contBtn.classList.remove('disabled');overlay.classList.add('hide');saveGame();showAlert('コンティニュー！ スコア半減');}
function commonReset(){
  for(const e of enemies){scene.remove(e.root);disposeObject3D(e.root);}enemies.length=0;
  for(const mob of mobs){scene.remove(mob.root);disposeObject3D(mob.root);}mobs.length=0;meat=0;mobRespawnT=MOB_RESPAWN_INTERVAL;updateMeatHUD();
  if(typeof clearVillages==='function')clearVillages();else clearHumanoids();
  removePet();removeHorse();removeMerchant();merchantSpawnT=60+Math.random()*60;
  resetMeteorEvent();resetWalkingFortress();fullMoonNight=false;_wasDayPhase=true;fullMoonSpawnT=0;cheatsUsed=false;godMode=false;
  resetChests();resetBeds();resetTrophies();resetEnchTables();resetFurnaces();resetTreasures();resetFarmPlots();
  endlessMode=false;if($endlessBtn)$endlessBtn.style.display='none';
  if(boss){scene.remove(boss.root);disposeObject3D(boss.root);boss=null;$bossWrap.classList.remove('show');}
  if(dragon){scene.remove(dragon.root);disposeObject3D(dragon.root);dragon=null;}dragonWarnPending=false;dragonSpawnT=90;
  for(const it of items){scene.remove(it.mesh);it.mat.dispose();}items.length=0;
  for(const p of projectiles){scene.remove(p.mesh);p.mesh.material.dispose();}projectiles.length=0;
  for(let i=particles.length-1;i>=0;i--){scene.remove(particles[i].mesh);particles[i].mat.dispose();}particles.length=0;
  if(regionEditor){regionEditor.close();regionEditor.resetUndo();}
  clearWorld();yaw=0;pitch=0;attackCD=0;fishCD=0;coyoteTime=0;jumpBuffer=0;lavaDmgTimer=0;snowDmgTimer=0;resetKnob();stopBgm();stopSeq();bgmBiome=-1;bgmBoss=false;bgmWave=false;closeCraftPanel();$wt.classList.remove('show');undergroundSnapshot=null;prevPlayerUnderground=false;finalBossPending=false;bgmUnder=false;bgmUnderDragon=false;
  gs.paused=false;$pauseOverlay.classList.remove('show');$pauseBtn.style.display='none';
}
async function startGame(){
  await deleteSave();$contDeathBtn.style.display='none';
  ovTitle.style.color='';ovTitle.style.textShadow='';ovTitle.textContent='ジョークラ';
  ovSub.textContent='VOXEL SURVIVAL';rotateSplash();
  overlay.classList.add('hide');initAudio();
  gameMode=settings.gameMode==='creative'?'creative':'survival';
  initWorldNoise(Math.floor(Math.random()*999999));
  commonReset();resetInv();resetAchievements();resetWorldEdits();
  P.x=0;P.z=0;P.velY=0;P.onGround=false;P.hp=100;P.food=100;P.invT=0;P.flying=false;
  if(isCreative())for(let i=0;i<unlockedWeapons.length;i++)unlockedWeapons[i]=true; // creative: all weapons
  weaponIdx=0;curType=0;setType(0);
  updateChunks(true);
  // spawn on the actual generated surface: 3D carving (cave mouths / cliffs)
  // can differ from the raw heightmap at (0,0)
  {
    let sy=getHeight(0,0);
    for(let y=getHeight(0,0)+3;y>=-6;y--){const v=voxels[vKey(0,y,0)];if(v&&v.ti!==WATER_BLOCK&&v.ti!==LAVA_BLOCK){sy=y;break;}}
    P.y=sy+1.01;
  }
  P.onGround=true;
  gs.score=0;gs.kills=0;gs.wave=0;gs.day=1;gs.time=0;gs.nextWave=isCreative()?999999:18;gs.running=true;
  resetWeather();
  $pauseBtn.style.display='flex';
  applyModeUI();
  const starterVillageReady=(typeof ensureStarterVillage==='function')&&ensureStarterVillage();
  if(isCreative())showAlert('🪄 CREATIVE MODE：自由に建築しよう！');
  else if(starterVillageReady&&villages&&villages[0])showAlert('🏘 近くに村があります：X '+Math.round(villages[0].center.x)+' / Z '+Math.round(villages[0].center.z));
  spawnAnimals(8);if(!villagers||!villagers.length)spawnHumanoids(1);updateInvHUD();resize();
}
async function continueGame(){
  const d=await loadSaveData();if(!d)return;
  $contDeathBtn.style.display='none';
  ovTitle.style.color='';ovTitle.style.textShadow='';ovTitle.textContent='ジョークラ';ovSub.textContent='VOXEL SURVIVAL';rotateSplash();
  overlay.classList.add('hide');initAudio();commonReset();resetInv();loadAchievements(d.achievements);
  gameMode=d.gameMode==='creative'?'creative':'survival';
  gs.score=d.score||0;gs.kills=d.kills||0;gs.wave=d.wave||0;gs.day=d.day||1;gs.time=d.time||0;gs.nextWave=d.nextWave??30;gs.running=true;
  _wasDayPhase=(gs.time<.4||gs.time>.9); // ロード直後に夜開始イベント（満月抽選）が誤発火しないよう同期
  cheatsUsed=!!d.cheatsUsed; // チート使用済みのランはロード後もランキング対象外を維持
  endlessMode=!isCreative()&&!!d.endlessMode;
  resetWeather();
  finalBossPending=!isCreative()&&!!d.finalBossPending;
  if(!isCreative()&&!finalBossPending&&!endlessMode&&gs.wave>=20&&!achievements.dragonSlayer)finalBossPending=true;
  P.hp=d.hp||100;P.food=(d.food!=null?d.food:100);P.invT=0;P.velY=0;P.onGround=false;P.x=d.px||0;P.z=d.pz||0;P.y=d.py||20;
  P.flying=isCreative()&&!!d.flying;
  weaponIdx=Math.max(0,Math.min(WEAPONS.length-1,d.weaponIdx||0));
  curType=Math.max(0,Math.min(SLOT_TI.length-1,d.curType||0));setType(curType);
  yaw=d.yaw||0;pitch=d.pitch||0;
  if(d.inv)Object.assign(inv,d.inv);
  if(d.unlockedWeapons)d.unlockedWeapons.forEach((v,i)=>{if(i<unlockedWeapons.length)unlockedWeapons[i]=v;});
  else unlockedWeapons[0]=true;
  if(isCreative())for(let i=0;i<unlockedWeapons.length;i++)unlockedWeapons[i]=true;
  meat=d.meat||0;updateMeatHUD();
  arrowMode=(d.arrowMode==='fire'||d.arrowMode==='ice')?d.arrowMode:'normal';
  if(d.enchants){enchants.atk=Math.max(0,Math.min(3,d.enchants.atk|0));enchants.rng=Math.max(0,Math.min(3,d.enchants.rng|0));enchants.fire=!!d.enchants.fire;enchants.frost=!!d.enchants.frost;}
  armor=(d.armor&&ARMOR_DEFS[d.armor.tier])?{tier:d.armor.tier,dur:Math.min(ARMOR_DEFS[d.armor.tier].maxDur,Math.max(1,d.armor.dur||0))}:null;updateArmorHUD();
  if(d.hasIronSword)applyIronSword(); // ダイヤ剣より先に適用（ダイヤが上書きする）
  if(d.hasDiamondSword)applyDiamondSword();
  if(d.hasDiamondBow)applyDiamondBow();
  if(d.hasDiamondStaff)applyDiamondStaff();
  if(d.hasDiamondHammer)applyDiamondHammer();
  ensureUnlockedWeaponSelected();
  if(d.worldSeed!=null)initWorldNoise(d.worldSeed);
  // 🏛 封印された地底都市の状態復元。updateChunks が都市チャンクの生成フックを
  // 参照するため、最初の updateChunks(true) より前に復元しておく
  sucLoadState(d.undergroundCity);
  // ☁ 天空都市も座標と炉の状態を先に復元する。ブロック本体は直後の worldEdits が担う。
  sccLoadState(d.skyCity);
  // 🌊 沈んだ王都も座標を先に復元する（updateChunks が深部チャンクの生成フックを参照するため）
  srcLoadState(d.sunkenCity);
  // 🏰 歩き続ける巨大城塞: 移動体なのでチャンク生成前に位置だけ復元
  wfLoadState(d.walkingFortress);
  if(d.villages&&typeof generatedVillageChunks!=='undefined')(d.villages.generatedChunks||[]).forEach(k=>generatedVillageChunks.add(k));
  updateChunks(true);
  if(d.worldEdits){resetWorldEdits();unpackWorldEditsInto(worldEdits,d.worldEdits);}
  applyWorldEdits();
  if(typeof villagesLoadState==='function')villagesLoadState(d.villages);
  // チェスト復元
  chestCount=d.chestCount||0;
  if(d.chests){for(const cd of d.chests){const mesh=makeChestMesh();mesh.position.set(cd.x+.5,cd.y,cd.z+.5);scene.add(mesh);chests.push({mesh,x:cd.x,y:cd.y,z:cd.z,contents:cd.contents||{wood:0,stone:0,sand:0,grass:0,brick:0,meat:0}});}}
  updateChestHUD();
  // ベッド復元
  bedCount=d.bedCount||0;
  if(d.beds){for(const bd of d.beds){const mesh=makeBedMesh();mesh.position.set(bd.x+.5,bd.y,bd.z+.9);scene.add(mesh);beds.push({mesh,x:bd.x,y:bd.y,z:bd.z});}}
  updateBedHUD();
  // ドラゴン像復元
  trophyCount=d.trophyCount||0;
  if(d.trophies){for(const td of d.trophies){const mesh=makeTrophyMesh();mesh.position.set(td.x+.5,td.y,td.z+.5);scene.add(mesh);trophies.push({mesh,x:td.x,y:td.y,z:td.z});}}
  updateTrophyHUD();
  // 強化台復元
  enchTableCount=d.enchTableCount||0;
  if(d.enchTables){for(const td of d.enchTables){const mesh=makeEnchTableMesh();mesh.position.set(td.x+.5,td.y,td.z+.5);scene.add(mesh);enchTables.push({mesh,x:td.x,y:td.y,z:td.z});}}
  updateEnchTableHUD();
  // かまど復元
  furnaceCount=d.furnaceCount||0;
  if(d.furnaces){for(const fd of d.furnaces){const mesh=makeFurnaceMesh();mesh.position.set(fd.x+.5,fd.y,fd.z+.5);scene.add(mesh);furnaces.push({mesh,x:fd.x,y:fd.y,z:fd.z});}}
  updateFurnaceHUD();
  // 畑復元
  if(d.farmPlots){for(const fd of d.farmPlots){const st=Math.max(0,Math.min(2,fd.stage||0));const mesh=makeFarmMesh(st);mesh.position.set(fd.x+.5,fd.y,fd.z+.5);scene.add(mesh);farmPlots.push({mesh,x:fd.x,y:fd.y,z:fd.z,stage:st,growT:fd.growT||0});}}
  // 地下宝箱の開封済み復元（宝箱メッシュはchunk再生成時に _spawnRoomContent が担当）
  if(d.openedTreasures)d.openedTreasures.forEach(k=>openedTreasureKeys.add(k));
  // 宝の地図の復元（目標がすでに開封済みなら破棄）
  treasureMap=(d.treasureMap&&d.treasureMap.key&&!openedTreasureKeys.has(d.treasureMap.key))?d.treasureMap:null;
  sccAfterLoad(); // 開封済み集合の復元後に、天空都市の特別な宝箱を安全に登録する
  for(let adj=0;adj<5;adj++){if(!overlaps(P.x,P.y,P.z))break;P.y+=0.5;}
  // 相棒オオカミ復元（ワールド生成後にプレイヤーの隣へ）
  if(d.pet)spawnPetAtPlayer(d.pet.hp!=null?d.pet.hp:PET_MAX_HP,d.pet.downT||0);
  // ウマ復元（騎乗状態も引き継ぐ）
  if(d.horseTamed)spawnHorseAtPlayer(!!d.mounted);
  $pauseBtn.style.display='flex';
  applyModeUI();
  spawnAnimals(8);spawnHumanoids(1);updateInvHUD();resize();
}
// アイテムピックアップ（武器ドロップで解放）
function pickupItem(info){
  if(info.type==='hp'){P.hp=Math.min(P.maxHp,P.hp+info.value);showBonus(info.name);playTone(700,.15,.1,'sine');}
  else if(info.type==='weapon'){unlockWeaponByDrop(info.wi);showBonus(info.name+' GET!');playTone(900,.15,.1);}
  else if(info.type==='score'){gs.score+=info.value;showBonus(info.name);playTone(1000,.1,.08);}
  else if(info.type==='egg'){P.food=Math.min(100,P.food+info.value);showBonus(info.name+' FOOD+'+info.value);playTone(650,.12,.08,'sine');}
  else if(info.type==='mat'){inv[info.key]=(inv[info.key]||0)+info.value;updateInvHUD();showBonus(info.name+' +'+info.value);playTone(750,.15,.1,'sine');}
}
let _ovBtnLastT=0;
function _onOvBtnTap(){const now=Date.now();if(now-_ovBtnLastT<100)return;_ovBtnLastT=now;startNewGameWithConfirm();}
bindTapSafe(ovBtn,_onOvBtnTap);
let _contBtnLastT=0;
function _onContBtnTap(){const now=Date.now();if(now-_contBtnLastT<100)return;_contBtnLastT=now;if(!$contBtn.classList.contains('disabled'))continueGame();}
bindTapSafe($contBtn,_onContBtnTap);
let _saveSlotsBtnLastT=0;
function _onSaveSlotsBtnTap(){const now=Date.now();if(now-_saveSlotsBtnLastT<100)return;_saveSlotsBtnLastT=now;openSaveSlots();}
if($saveSlotsBtn)bindTapSafe($saveSlotsBtn,_onSaveSlotsBtnTap);
let _pauseBtnLastT=0;
function _onPauseBtnTap(){const now=Date.now();if(now-_pauseBtnLastT<100)return;_pauseBtnLastT=now;togglePause();}
bindTapSafe($pauseBtn,_onPauseBtnTap);
let _resumeBtnLastT=0;
function _onResumeBtnTap(){const now=Date.now();if(now-_resumeBtnLastT<100)return;_resumeBtnLastT=now;if(gs.paused)togglePause();}
bindTapSafe($resumeBtn,_onResumeBtnTap);
let _pauseSaveBtnLastT=0;
function _onPauseSaveBtnTap(){const now=Date.now();if(now-_pauseSaveBtnLastT<100)return;_pauseSaveBtnLastT=now;saveGame();}
bindTapSafe($pauseSaveBtn,_onPauseSaveBtnTap);

// ═══ MAIN LOOP ═══
let lavaParticleT=0,snowParticleT=0,lastT=0,minimapT=0,hudT=0,chunkT=0,autoSaveT=0;
let _wasDayPhase=true,fullMoonSpawnT=0;
const AUTOSAVE_INTERVAL=60;
document.addEventListener('visibilitychange',()=>{if(!document.hidden)lastT=performance.now();});
function tick(now){
  requestAnimationFrame(tick);
  if(isTouch&&now-lastT<FRAME_MIN){return;}
  const dt=Math.min(.05,(now-lastT)/1000);lastT=now;
  if(saveToastTimer>0){saveToastTimer-=dt;if(saveToastTimer<=0)$saveToast.classList.remove('show');}
  if(!gs.running){rainGroup.visible=false;snowGroup.visible=false;if(regionEditor&&regionEditor.state.active)regionEditor.updateVisuals();
  renderer.render(scene,camera);return;}
  if(gs.paused){if(regionEditor&&regionEditor.state.active)regionEditor.updateVisuals();
  renderer.render(scene,camera);return;}
  const prevTime=gs.time;gs.time=(gs.time+dt/DAY_DUR)%1;
  if(gs.time<prevTime){gs.day++;showAlert('🌅 DAY '+gs.day);}
  const isDay=(gs.time<.4||gs.time>.9);
  // 🌕満月の夜: 夜が始まる瞬間に抽選し、夜明けまで生き延びると実績
  if(!isCreative()&&_wasDayPhase&&!isDay){
    fullMoonNight=Math.random()<0.24;
    if(fullMoonNight){
      showAlert('🌕 満月の夜だ！敵が増え、キルスコアが2倍に！');
      playTone(200,.3,.25,'sawtooth');setTimeout(()=>playTone(150,.3,.25,'sawtooth'),220);
      fullMoonSpawnT=6;
    }
  }
  if(!isCreative()&&!_wasDayPhase&&isDay&&fullMoonNight){unlockAchievement('fullMoonSurvivor');fullMoonNight=false;}
  _wasDayPhase=isDay;
  const curBiome=getBiome(Math.floor(P.x),Math.floor(P.z));
  const inVolcano=curBiome===BIOMES.VOLCANO,inSnow=curBiome===BIOMES.SNOW;
  const _isUnder=P.y<0;
  updateSky(gs.time,inVolcano,inSnow);updateBgm(curBiome,_isUnder);
  if(_isUnder){updateUnderAtmosphere(P.y);skyMesh.visible=false;}
  else{scene.fog.near=DRAW_R*CHUNK*FOG_START_MULTIPLIER;scene.fog.far=DRAW_R*CHUNK*FOG_END_MULTIPLIER;skyMesh.visible=true;}
  updateCelestial(gs.time,dt);
  updateWeather(dt,inVolcano,inSnow,_isUnder,now/1000);
  updateMeteorEvent(dt,_isUnder);
  updateTorchLights();
  updateBlockCursor();
  if(_waterUniforms)_waterUniforms.uTime.value=now/1000;
  // hold-to-mine: auto-repeat attack at the weapon cadence (skip bow to spare arrows)
  if(attackHeld){const w=WEAPONS[weaponIdx];if(w.type!=='ranged'&&attackCD<=0)doAttack();}
  // cracks heal if you stop mining a block (Minecraft-style)
  if(miningKey&&performance.now()/1000-miningLastT>0.7)resetMining();
  if(isCreative()){P.hp=P.maxHp;P.food=100;} // creative: always full
  if(isDay&&!inVolcano&&!inSnow&&P.hp<P.maxHp&&P.invT<=0&&P.food>60){P.hp=Math.min(P.maxHp,P.hp+2.5*dt);P.food=Math.max(0,P.food-.5*dt);}
  if(!isCreative()){gs.nextWave-=dt;if(gs.nextWave<=0)startWave();}
  // 🌕満月の夜: 通常WAVEとは別に、地上でアンビエントな追加湧きを発生させる
  if(fullMoonNight&&!_isUnder&&!isCreative()&&enemies.length<(isTouch?18:30)){
    fullMoonSpawnT-=dt;if(fullMoonSpawnT<=0){fullMoonSpawnT=5+Math.random()*4;spawnEnemy();}
  }
  if(_isUnder&&!prevPlayerUnderground){undergroundSnapshot={inv:{...inv},unlockedWeapons:[...unlockedWeapons],hasDiamondSword,hasDiamondBow,hasDiamondStaff,hasDiamondHammer,hasIronSword,chestCount,bedCount,trophyCount,enchTableCount,furnaceCount,armor:armor?{tier:armor.tier,dur:armor.dur}:null,enchants:{...enchants}};sfxEnterUnder();}
  if(!_isUnder&&prevPlayerUnderground){undergroundSnapshot=null;sfxExitUnder();}
  prevPlayerUnderground=_isUnder;
  if(!_isUnder&&finalBossPending&&!boss&&!isCreative()){finalBossPending=false;const fd=BOSS_DEFS.find(b=>b.finalBoss);if(fd&&gs.running){showAlert('💎 キングダイヤモンドドラゴン 降臨！！');sfxBossAppear();playTone(60,.4,.8,'sawtooth');setTimeout(()=>{if(gs.running)spawnBoss(fd);},2500);}}
  if(_isUnder&&!isCreative()){const uc=enemies.filter(e=>e.root.position.y<0).length;underSpawnT=Math.max(0,underSpawnT-dt);if(underSpawnT<=0&&uc<UNDER_MAX){spawnUnderEnemy();underSpawnT=UNDER_SPAWN_CD;}}
  if(_isUnder&&P.y<-12&&dragon===null&&!dragonWarnPending&&!isCreative()){dragonSpawnT-=dt;if(dragonSpawnT<=0){dragonSpawnT=60+Math.random()*30;if(Math.random()<0.09){dragonWarnPending=true;showAlert('⚠ 地下の底から咆哮が響く…💎');playTone(80,.2,.4,'sawtooth');setTimeout(()=>{if(gs.running)spawnDiamondDragon();},3000);}}}

  if(waTimer>0){waTimer-=dt;if(waTimer<=0)$wa.classList.remove('show');}
  if(bpTimer>0){bpTimer-=dt;if(bpTimer<=0)$bp.classList.remove('show');}
  P.invT=Math.max(0,P.invT-dt);if(attackCD>0)attackCD=Math.max(0,attackCD-dt);
  lavaDmgTimer=Math.max(0,lavaDmgTimer-dt);if(lavaDmgTimer<=0&&checkLava()){dmgLava();lavaDmgTimer=0.8;}
  if(inSnow){snowDmgTimer=Math.max(0,snowDmgTimer-dt);if(snowDmgTimer<=0){dmgSnow();snowDmgTimer=blizzard?2.2:3.0;}}
  lavaParticleT+=dt;if(lavaParticleT>.15){lavaParticleT=0;for(const k of lavaBlocks){if(Math.random()<.04){const[lx,ly,lz]=k.split('|').map(Number);if(Math.abs(lx-P.x)<20&&Math.abs(lz-P.z)<20)spawnLavaParticles(lx+.5,ly+1,lz+.5);}}}
  if(inSnow){snowParticleT+=dt;if(snowParticleT>.3){snowParticleT=0;spawnSnowParticles(P.x,P.y,P.z);}}
  let fw=joy.y,sr=joy.x;
  if(isDesktop){fw=0;sr=0;if(keys['KeyW']||keys['ArrowUp'])fw=1;if(keys['KeyS']||keys['ArrowDown'])fw=-1;if(keys['KeyA']||keys['ArrowLeft'])sr=-1;if(keys['KeyD']||keys['ArrowRight'])sr=1;if(fw&&sr){const inv2=1/Math.SQRT2;fw*=inv2;sr*=inv2;}}
  const _wantSprint=isDesktop?(!!keys['ShiftLeft']||!!keys['ShiftRight']):Math.hypot(joy.x,joy.y)>.92;
  const sprinting=_wantSprint&&P.food>20&&!P.flying; // too hungry to sprint / shift descends while flying
  const curSpeed=(mounted?(_wantSprint?MOUNT_GALLOP:MOUNT_SPEED):(P.flying?FLY_SPEED:(sprinting?SPRINT_SPEED:SPEED)))*(blizzard?0.72:1);
  const sY=Math.sin(yaw),cY=Math.cos(yaw);
  movePlayer((sr*cY+fw*sY)*curSpeed,(fw*cY-sr*sY)*curSpeed,dt);
  camera.position.set(P.x,P.y+EYE+(mounted?MOUNT_EYE:0),P.z);camera.rotation.order='YXZ';camera.rotation.x=pitch;camera.rotation.y=yaw;
  ftvApplyCamShake(dt); // ⏳ 時間結晶の破壊演出: カメラ位置決定後に軽い揺れを重ねる
  sucUpdate(dt); // 🏛 封印された地底都市: 封印装置の演出・接触解除・地底王の管理（遠距離では即リターン）
  updateCollapsingSkyCity(dt); // ☁ 天空都市: 近距離だけ炉・輪・落石・接触再起動を更新
  srcUpdate(dt); // 🌊 沈んだ王都: 海面メッシュの表示と海中の青いフォグ（遠距離では即リターン）
  updateWalkingFortress(dt); // 🏰 歩き続ける巨大城塞: 低頻度の移動体更新・搭乗中の運搬
  const _moving=(Math.abs(fw)+Math.abs(sr))>.01;
  updateViewBob(_moving,sprinting);
  updateHand(dt,_moving,sprinting);
  // hunger: drains over time, faster while sprinting; at 0 you slowly starve
  // (HP never drops below 10 from hunger, like Minecraft's gentler modes)
  // 騎乗中のダッシュは追加の満腹度を消費しない（走るのはウマ）
  if(!isCreative())P.food=Math.max(0,P.food-(0.21+(sprinting&&_moving&&!mounted?0.35:0)+(blizzard?0.15:0))*dt);
  if(P.food<=0&&!godMode){starveT+=dt;if(starveT>=3){starveT=0;if(P.hp>10){P.hp=Math.max(10,P.hp-2*difficultyMult());playTone(160,.12,.06,'sawtooth');}}}
  else starveT=0;
  // sprint FOV kick (Minecraft-style)
  const _tgtFov=(sprinting&&_moving)?80:72;
  if(Math.abs(camera.fov-_tgtFov)>0.01){camera.fov+=(_tgtFov-camera.fov)*Math.min(1,dt*7);camera.updateProjectionMatrix();}
  chunkT+=dt;if(chunkT>.5){if(updateChunks(false))applyWorldEdits();chunkT=0;}
  updateBoss(dt);updateDragon(dt);updateMobs(dt);updateHumanoids(dt);updatePet(dt);updateHorse(dt);updateFarmPlots(dt);updateMerchant(dt,_isUnder);
  mobRespawnT-=dt;if(mobRespawnT<=0){mobRespawnT=MOB_RESPAWN_INTERVAL;const lack=MAX_MOBS-mobs.length;if(lack>0)spawnAnimals(Math.min(lack,4));}
  const t=Date.now()/1000;
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i],ep=e.root.position;
    if(e.hp<=0&&!e.dead){e.dead=true;finalizeEnemyDeath(e);continue;}
    // ⏳ 時間が止まった村: 停止中(frozen)の敵はAI・移動・攻撃・距離デスポーンを
    // すべてスキップして「一枚絵」のまま保つ（攻撃は受けるのでHPバーの向きだけ更新）
    if(e.frozen){e.hpBar.lookAt(camera.position);continue;}
    const dx=P.x-ep.x,dz=P.z-ep.z;const dist=Math.hypot(dx,dz);
    if(dist>50&&!e.noDespawn){scene.remove(e.root);disposeObject3D(e.root);enemies.splice(i,1);continue;} // 🏛 地底王などnoDespawnの敵は距離で消えない
    // 状態異常: 炎上（0.7秒ごとに2ダメージ）/ 氷結（移動速度45%）
    if(e.slowT>0)e.slowT-=dt;
    if(e.burnT>0){
      e.burnT-=dt*(weatherWet?2.2:1); // 雨天は消火が早い
      e.burnAcc=(e.burnAcc||0)+dt;
      if(e.burnAcc>=.7){e.burnAcc=0;e.hp-=2;spawnParticles(ep.x,ep.y+.5,ep.z,0xff6622,2);
        const br=Math.max(0,e.hp/e.maxHp);e.hpBar.scale.x=Math.max(.01,br);}
    }
    const statusSpd=e.slowT>0?.45:1;
    // 💣 クリーパー: 近づくと点火し、白く点滅・膨張しながら約1秒後に爆発する。
    // 点火中は移動しないので、走って距離を取れば爆発をやり過ごせる。
    if(e.type.creeper){
      if(e.fuseT==null&&dist<2.7&&Math.abs(P.y+1-ep.y)<2.6&&hasLOS(ep.x,ep.y,ep.z,P.x,P.y+1,P.z)){
        e.fuseT=1.15;
        playTone(1500,.5,.07,'sawtooth');setTimeout(()=>playTone(1100,.4,.06,'sawtooth'),120);
      }
      if(e.fuseT!=null){
        e.fuseT-=dt;
        const fl=Math.floor(e.fuseT*12)%2===0;
        for(const m of[e.body,e.head]){m.material.emissive.setHex(fl?0xffffff:e.type.emissive);m.material.emissiveIntensity=fl?1.5:.15;}
        e.root.scale.setScalar(1+(1.15-Math.max(0,e.fuseT))/1.15*.3);
        if(e.fuseT<=0){creeperExplode(e);scene.remove(e.root);disposeObject3D(e.root);enemies.splice(i,1);continue;}
        e.hpBar.lookAt(camera.position);
        continue;
      }
    }
    if(e.type.bat){
      // 👻 ファントム: 夜明けの日光を浴びると燃えて消滅していく
      if(e.type.phantom&&(gs.time<.4||gs.time>.9)&&ep.y>=0){
        e.sunT=(e.sunT||0)+dt;
        if(e.sunT>=.5){e.sunT=0;e.hp-=2;spawnParticles(ep.x,ep.y+.3,ep.z,0xffaa33,2);e.hpBar.scale.x=Math.max(.01,Math.max(0,e.hp/e.maxHp));}
      }
      const dy3=P.y+0.8-ep.y,dist3=Math.hypot(dx,dy3,dz);
      e.root.rotation.y=Math.atan2(dx,dz);
      if(dist3>0.6){const spd=(3.5+gs.wave*.15)*statusSpd*dt;ep.x+=dx/dist3*spd;ep.y+=dy3/dist3*spd;ep.z+=dz/dist3*spd;}
      const bk=voxels[vKey(Math.floor(ep.x),Math.floor(ep.y),Math.floor(ep.z))];if(bk&&bk.active)ep.y+=0.4;
      e.wingT=(e.wingT||0)+dt*12;
      if(e.lWing)e.lWing.rotation.z=Math.sin(e.wingT)*.7;
      if(e.rWing)e.rWing.rotation.z=-Math.sin(e.wingT)*.7;
      e.atkCd=Math.max(0,e.atkCd-dt);
      if(dist3<1.1&&e.atkCd<=0){dmgPlayer(Math.min(e.type.dmg+gs.wave*2,endlessMode?70:40));e.atkCd=0.7;}
      e.hpBar.lookAt(camera.position);
      continue;
    }
    e.root.rotation.y=Math.atan2(dx,dz);const spd=Math.min(2.5+gs.wave*.3,endlessMode?8:6.5)*statusSpd*(e.type.spdMul||1);
    if(dist>1)moveEnemy(e,(dx/dist)*spd,(dz/dist)*spd,dt);
    // 🕷 クモ: 進行方向に壁があるとよじ登る（高い壁だけでは防げない）
    if(e.type.spider&&dist>1.2){
      const wx2=Math.floor(ep.x+(dx/(dist||1))*.8),wz2=Math.floor(ep.z+(dz/(dist||1))*.8);
      const wy2=Math.floor(ep.y-.85);
      const w1=voxels[vKey(wx2,wy2,wz2)],w2=voxels[vKey(wx2,wy2+1,wz2)];
      if((w1&&w1.active)||(w2&&w2.active)){e.velY=Math.max(e.velY,3.4);e.onGround=false;}
    }
    // walk cycle: swing legs (and arms unless held in a fixed pose)
    if(e.legL){const moving=dist>1&&e.onGround;e.walkT=(e.walkT||0)+(moving?dt*7:0);const sw=moving?Math.sin(e.walkT)*.5:THREE.MathUtils.lerp(e.legL.rotation.x,0,.2);e.legL.rotation.x=sw;e.legR.rotation.x=-sw;if(e.armSwing!==false){if(e.armL)e.armL.rotation.x=-sw;if(e.armR)e.armR.rotation.x=sw;}}
    e.stuckT+=dt;if(e.stuckT>1.2){const mv=Math.abs(ep.x-e.lastX)+Math.abs(ep.z-e.lastZ);if(mv<.3&&e.onGround&&dist<14){e.velY=6.5;if(e.breakCd<=0)tryEnemyBreakBlock(e);}e.lastX=ep.x;e.lastZ=ep.z;e.stuckT=0;}
    if(e.onGround&&dist<6&&Math.random()<.008)e.velY=6;
    e.atkCd=Math.max(0,e.atkCd-dt);e.breakCd=Math.max(0,e.breakCd-dt);
    // 相棒オオカミが密着していると敵はそちらを攻撃（ペットが盾になる）
    if(pet&&pet.downT<=0&&e.atkCd<=0){const petP=pet.root.position;if(Math.hypot(petP.x-ep.x,petP.z-ep.z)<1.5&&Math.abs(petP.y-ep.y)<2){hitPet(Math.min(e.type.dmg*.5+gs.wave*.4,9));e.atkCd=1.2;}}
    if(dist<1.6&&e.atkCd<=0&&hasLOS(ep.x,ep.y,ep.z,P.x,P.y+1,P.z)){dmgPlayer(Math.min(e.type.dmg+gs.wave*2,endlessMode?70:40));e.atkCd=1.2;}
    if(e.type.lava){const pulse=.35+Math.sin(t*4+i)*.2;e.body.material.emissiveIntensity=pulse;e.head.material.emissiveIntensity=pulse;}
    else if(e.type.ice){const pulse=.2+Math.sin(t*2+i)*.1;e.body.material.emissiveIntensity=pulse;e.head.material.emissiveIntensity=pulse;}
    else if(e.type.crystal){const pulse=.4+Math.sin(t*3+i)*.25;e.body.material.emissiveIntensity=pulse;e.head.material.emissiveIntensity=pulse;}
    else if(e.type.name==='Skeleton'){const nb=gs.time>.5?(gs.time-.5)*2:0;e.body.material.emissiveIntensity=.15+nb*.35;e.head.material.emissiveIntensity=.15+nb*.35;}
    else{const nb=gs.time>.5?(gs.time-.5)*2:0;e.body.material.emissiveIntensity=.08+nb*.3;e.head.material.emissiveIntensity=.08+nb*.3;}
    e.hpBar.lookAt(camera.position);
  }
  for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.x+=p.dx*dt;p.y+=p.dy*dt;p.z+=p.dz*dt;p.life-=dt;p.mesh.position.set(p.x,p.y,p.z);let hit=false;if(p.isBossArrow){const dx=p.x-P.x,dy=p.y-(P.y+1),dz=p.z-P.z;if(dx*dx+dy*dy+dz*dz<1.2){dmgPlayer(p.dmg);hit=true;}}else{for(const en of enemies){const ep=en.root.position,dx=p.x-ep.x,dy=p.y-ep.y,dz=p.z-ep.z;if(dx*dx+dy*dy+dz*dz<1.8){hitEnemy(en,p.dmg);if(p.fireA)igniteEnemy(en);if(p.iceA)chillEnemy(en);hit=true;break;}}if(!hit)for(const h of humanoids){if(h.state===HUMANOID_STATES.DEAD)continue;const hp=h.root.position,dx=p.x-hp.x,dy=p.y-(hp.y+1.1),dz=p.z-hp.z;if(dx*dx+dy*dy+dz*dz<1.5){hitHumanoid(h,p.dmg);hit=true;break;}}if(!hit&&boss){const bp=boss.root.position,dx=p.x-bp.x,dy=p.y-bp.y,dz=p.z-bp.z;if(dx*dx+dy*dy+dz*dz<(boss.sc*2)){hitBoss(p.dmg);if(p.fireA)igniteBoss();if(p.iceA)chillBoss();hit=true;}}if(!hit&&dragon){const dp=dragon.root.position,pdx=p.x-dp.x,pdy=p.y-dp.y,pdz=p.z-dp.z;if(pdx*pdx+pdy*pdy+pdz*pdz<2.5){hitDragon(p.dmg,p.diamond===true||p.staff===true);hit=true;}}}if(!hit){const k=vKey(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z));if(voxels[k]&&voxels[k].active)hit=true;}if(hit&&p.fireA)spawnParticles(p.x,p.y,p.z,0xff6622,4);else if(hit&&p.iceA)spawnParticles(p.x,p.y,p.z,0xaaeeff,4);else if(hit&&p.diamond)spawnParticles(p.x,p.y,p.z,0x00e5ff,3);if(hit&&p.staff)spawnParticles(p.x,p.y,p.z,0x88ffff,5);if(hit||p.life<=0){scene.remove(p.mesh);p.mesh.material.dispose();projectiles.splice(i,1);}}
  for(let i=items.length-1;i>=0;i--){const it=items[i];it.time+=dt;it.mesh.position.y=it.y+Math.sin(it.time*3)*.2;it.mesh.rotation.y+=dt*2;const dx=P.x-it.x,dz=P.z-it.z,dy=P.y-it.y;if(dx*dx+dy*dy+dz*dz<3){pickupItem(it.info);scene.remove(it.mesh);it.mat.dispose();items.splice(i,1);continue;}if(it.time>25){scene.remove(it.mesh);it.mat.dispose();items.splice(i,1);}}
  updateParticles(dt);
  hudT+=dt;if(hudT>.1){updateHUD();hudT=0;}
  minimapT+=dt;if(minimapT>MINIMAP_INTERVAL){drawMinimap();minimapT=0;}
  if(settings.autoSave&&gs.running&&!gs.paused){autoSaveT+=dt;if(autoSaveT>=AUTOSAVE_INTERVAL){autoSaveT=0;saveGame();showSaveToast('💾 AUTO-SAVED');}}
  if(regionEditor&&regionEditor.state.active)regionEditor.updateVisuals();
  renderer.render(scene,camera);
}
requestAnimationFrame(tick);
document.addEventListener('touchmove',(e)=>{if(e.target.closest('#craftPanel')||e.target.closest('.menuCard')||e.target.closest('#ovContent'))return;e.preventDefault();},{passive:false});
// iOS Safari: prevent all zoom (pinch, double-tap, gesture)
document.addEventListener('gesturestart',(e)=>e.preventDefault(),{passive:false});
document.addEventListener('gesturechange',(e)=>e.preventDefault(),{passive:false});
document.addEventListener('gestureend',(e)=>e.preventDefault(),{passive:false});
document.addEventListener('touchstart',(e)=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
document.addEventListener('dblclick',(e)=>e.preventDefault(),{passive:false});
document.addEventListener('wheel',(e)=>{if(e.ctrlKey)e.preventDefault();},{passive:false});
// 全モジュール読込後にオーバーレイのセーブ情報を初期化（save.js から移動）。
updateOverlaySaveInfo();
