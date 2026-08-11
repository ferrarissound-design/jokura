// ============================================================================
// jokura / save.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、下記の順序で <script> として読み込まれ、すべて同一のグローバル
// スコープを共有する（元は単一の boot() 関数だったため、この順序と共有スコープが前提）。
// 読み込み順: state → achievements → crafting → save → ui → audio → world →
//             combat → entities → hud → input → main
// ============================================================================

// ═══ WORLD EDITS ═══
// 編集はチャンク列("cx,cz")ごとに索引し、「前回の適用以降に新しく生成された
// チャンク列」の分だけ再生する。以前は applyWorldEdits がチャンク境界を跨ぐたびに
// 全編集キーを走査していたため、長時間プレイで編集が数万件に育つと0.5秒ごとの
// スパイクになっていた。placed/removed の書き込み箇所はゲーム全域に散らばっている
// ので、Proxy の set トラップで索引を自動維持し、書き込み側のイディオム
// （worldEdits.placed[k]=v / worldEdits.removed[k]=true / delete ...）は一切変えない。
const _weIndex=new Map();       // "cx,cz" → Set(voxelKey) 編集のチャンク列索引
const _wePendingCols=new Set(); // 前回適用以降に（再）生成されたチャンク列
function _weTrack(k){
  // voxelキー "x|y|z" からチャンク列キーを導く（world.js の cKey と同じ書式）
  const x=+k.slice(0,k.indexOf('|')),z=+k.slice(k.lastIndexOf('|')+1);
  const col=Math.floor(x/CHUNK)+','+Math.floor(z/CHUNK);
  let s=_weIndex.get(col);
  if(!s){s=new Set();_weIndex.set(col,s);}
  s.add(k);
}
// delete は索引から消さない（placed/removed 両方に載るキーがあるため参照カウントが
// 要る）。陳腐化した索引エントリは applyWorldEdits が検証時に破棄する。
const _weHandler={set(t,k,v){t[k]=v;_weTrack(k);return true;}};
const worldEdits={placed:new Proxy({},_weHandler),removed:new Proxy({},_weHandler)};
// world.js の generateChunk/generateUnderChunk（唯一の生成入口）から呼ばれる
function weMarkChunkGenerated(cx,cz){_wePendingCols.add(cx+','+cz);}
function resetWorldEdits(){
  for(const k in worldEdits.placed)delete worldEdits.placed[k];
  for(const k in worldEdits.removed)delete worldEdits.removed[k];
  _weIndex.clear();
  // _wePendingCols はクリアしない: ロード時は updateChunks(true)（列を記録）→
  // resetWorldEdits → unpack → applyWorldEdits の順で走るため、ここで消すと
  // ロード直後の再生対象が失われる。生成済みで編集の無い列は適用時に無視される。
}
function applyWorldEdits(){
  if(_wePendingCols.size===0)return;
  _deferDirty=true; // batch chunk rebuilds: one per touched chunk, not per edit
  for(const col of _wePendingCols){
    const set=_weIndex.get(col);
    if(!set)continue;
    for(const k of set){
      const removed=worldEdits.removed[k];
      const raw=worldEdits.placed[k]; // packed ti|(meta<<5); legacy saves store plain ti (≤16, meta 0)
      if(removed===undefined&&raw===undefined){set.delete(k);continue;} // 取り消し済み編集の陳腐化索引
      // 同一キーは removed → placed の順（put が地形上書き時に両方を記録するため）
      if(removed&&voxels[k]&&voxels[k].active){
        const[x,y,z]=k.split('|').map(Number);
        removeBlock(x,y,z);
      }
      if(raw!==undefined&&!voxels[k]){
        const[x,y,z]=k.split('|').map(Number);
        // Do not replay edits into chunks that are not currently generated.
        // applyWorldEdits() runs after chunk generation, so the edit will be
        // applied once its owning chunk record exists instead of creating an
        // invisible orphan voxel with collision but no merged-mesh membership.
        // (地下層は列より細かい単位で生成されるため、この voxel 単位の検証は
        // チャンク列索引になっても引き続き必要)
        if(recAt(x,y,z))addBlock(x,y,z,raw&31,true,true,raw>>5);
      }
    }
    if(set.size===0)_weIndex.delete(col);
  }
  _wePendingCols.clear();
  _deferDirty=false;flushDirtyChunks();
}
// ─── セーブ時のworldEdits圧縮 ───
// 実行時の worldEdits.placed/removed は combat.js/input.js/hud.js/world.js の多数の
// 箇所で直接読み書きされる十進数文字列キー("x|y|z")のオブジェクトマップのままにし、
// セーブ/ロードの入出力境界だけで圧縮する(ゲームロジックには一切触れない)。
// 掘った・置いたブロックはプレイが長くなるほど無期限に増え続けlocalStorageの容量を
// 圧迫しやすいため、保存時のみ: (1)座標を10進数よりコンパクなbase36へ変換、
// (2)removedは値を持たないため{true}のオブジェクトマップではなく配列にする。
// 旧セーブ(base36導入前)のキーを誤ってbase36として読むと座標が化けてしまうため、
// vタグで新旧形式を明示的に判別する(shapeだけでの自動判定はしない)。
const WORLD_EDITS_PACK_VERSION=2;
function _weKeyToB36(k){const p=k.split('|');return Number(p[0]).toString(36)+'|'+Number(p[1]).toString(36)+'|'+Number(p[2]).toString(36);}
function _weB36ToKey(bk){const p=bk.split('|');return parseInt(p[0],36)+'|'+parseInt(p[1],36)+'|'+parseInt(p[2],36);}
function packWorldEdits(we){
  const placed={};
  for(const k in we.placed)placed[_weKeyToB36(k)]=we.placed[k];
  return{v:WORLD_EDITS_PACK_VERSION,placed,removed:Object.keys(we.removed).map(_weKeyToB36)};
}
function unpackWorldEditsInto(target,saved){
  if(!saved)return;
  if(saved.v>=WORLD_EDITS_PACK_VERSION){
    const placed=saved.placed||{};for(const bk in placed)target.placed[_weB36ToKey(bk)]=placed[bk];
    for(const bk of saved.removed||[])target.removed[_weB36ToKey(bk)]=true;
  }else{
    // v無し(base36導入前)の旧セーブ: 十進数キーのオブジェクトマップのまま
    Object.assign(target.placed,saved.placed||{});
    Object.assign(target.removed,saved.removed||{});
  }
}

// ═══ SAVE ═══
const SAVE_VERSION=7;
const SAVE_SLOT_COUNT=3;
const SAVE_BASE_KEY='jokura-save-v7';
const SAVE_KEY=SAVE_BASE_KEY; // legacy single-slot key kept for migration
const LEGACY_SAVE_KEYS=['jokura-save-v6','jokura-save-v5'];
const ACTIVE_SAVE_SLOT_KEY='jokura-active-save-slot';
function getStoredActiveSaveSlot(){
  try{const n=Number(localStorage.getItem(ACTIVE_SAVE_SLOT_KEY)||1);return Math.max(1,Math.min(SAVE_SLOT_COUNT,n||1));}
  catch(e){return 1;}
}
let activeSaveSlot=getStoredActiveSaveSlot();
function saveKeyForSlot(slot){return SAVE_BASE_KEY+'-slot-'+slot;}
function setActiveSaveSlot(slot){
  activeSaveSlot=Math.max(1,Math.min(SAVE_SLOT_COUNT,Number(slot)||1));
  try{localStorage.setItem(ACTIVE_SAVE_SLOT_KEY,String(activeSaveSlot));}catch(e){}
}
function migrateSaveData(data){
  if(!data||typeof data!=='object')return null;
  const migrated={...data};
  const version=Number(migrated.version||0);
  if(version<7)migrated.version=7;
  return migrated;
}
async function loadSaveData(slot=activeSaveSlot){
  const safeSlot=Math.max(1,Math.min(SAVE_SLOT_COUNT,Number(slot)||1));
  const keys=[saveKeyForSlot(safeSlot),'jokura-save-v6-slot-'+safeSlot];
  if(safeSlot===1)keys.push(SAVE_KEY,...LEGACY_SAVE_KEYS);
  for(const key of keys){
    try{
      const r=await window.storage.get(key);
      if(!r||!r.value)continue;
      const parsed=JSON.parse(r.value);
      const migrated=migrateSaveData(parsed);
      if(!migrated)continue;
      migrated.saveSlot=safeSlot;
      if(key!==saveKeyForSlot(safeSlot)||migrated.version!==SAVE_VERSION){
        await window.storage.set(saveKeyForSlot(safeSlot),JSON.stringify(migrated));
      }
      return migrated;
    }catch(e){
      continue;
    }
  }
  return null;
}
async function getAllSaveSlots(){
  const rows=[];
  for(let slot=1;slot<=SAVE_SLOT_COUNT;slot++)rows.push({slot,data:await loadSaveData(slot)});
  return rows;
}
async function deleteSave(slot=activeSaveSlot){
  const safeSlot=Math.max(1,Math.min(SAVE_SLOT_COUNT,Number(slot)||1));
  try{await window.storage.delete(saveKeyForSlot(safeSlot));}catch(e){}
  try{await window.storage.delete('jokura-save-v6-slot-'+safeSlot);}catch(e){}
  if(safeSlot===1){
    try{await window.storage.delete(SAVE_KEY);}catch(e){}
    for(const key of LEGACY_SAVE_KEYS){try{await window.storage.delete(key);}catch(e){}}
  }
}
async function saveGame(){
  const existing=await loadSaveData(activeSaveSlot);
  const slotName=(existing&&existing.slotName)||('SLOT '+activeSaveSlot);
  const data={
    version:SAVE_VERSION,saveSlot:activeSaveSlot,slotName,
    gameMode,flying:!!P.flying,cheatsUsed,
    score:gs.score,kills:gs.kills,wave:gs.wave,day:gs.day,time:gs.time,
    nextWave:gs.nextWave,hp:P.hp,food:P.food,weaponIdx,curType,finalBossPending,endlessMode,
    px:P.x,py:P.y,pz:P.z,yaw,pitch,
    inv:{...inv},unlockedWeapons:[...unlockedWeapons],meat,hasDiamondSword,hasDiamondBow,hasDiamondStaff,hasDiamondHammer,hasIronSword,
    arrowMode,enchants:{...enchants},
    enchTableCount,enchTables:enchTables.map(t=>({x:t.x,y:t.y,z:t.z})),
    furnaceCount,furnaces:furnaces.map(f=>({x:f.x,y:f.y,z:f.z})),
    pet:pet?{hp:Math.round(pet.hp),downT:Math.round(pet.downT)}:null,
    horseTamed:!!horse,mounted,
    armor:armor?{tier:armor.tier,dur:Math.round(armor.dur)}:null,
    worldSeed:WORLD_SEED,worldGenVersion:2,
    worldEdits:packWorldEdits(worldEdits),
    explosives:(typeof tntSaveState==='function')?tntSaveState():[],
    tsarBombs:(typeof tsarBombaSaveState==='function')?tsarBombaSaveState():[],
    // ☢ 永久破壊領域（3000%級の巨大クレーターを未読み込み範囲へ遅延適用するための
    // 少数パラメータのみ）。旧セーブには存在しないため読み込み側は配列でなければ
    // 空扱いにする（tsarZonesLoadState）。SAVE_VERSIONは上げていない: 既存フィールドは
    // 一切変更しておらず、この追加フィールドが無くても正常に読み込めるため。
    tsarZones:(typeof tsarZonesSaveState==='function')?tsarZonesSaveState():[],
    // 🔱 LONGINUS: 進行中の演出は保存しない（数秒の固定シーケンスなので次回起動時に
    // クールダウンだけ引き継ぐ）。着弾済みのクレーター/専用ブロックは worldEdits 経由で
    // 通常のブロック編集と同様に保存されるため、ここでは別途保存する必要が無い。
    longinus:(typeof longinusSaveState==='function')?longinusSaveState():null,
    // 🚀 RAILGUN: LONGINUSと同じ理由でクールダウンだけ保存する（掘られたトンネルは
    // worldEdits経由で保存される）。
    railgun:(typeof railgunSaveState==='function')?railgunSaveState():null,
    chestCount,chests:chests.map(c=>({x:c.x,y:c.y,z:c.z,contents:{...c.contents}})),
    bedCount,beds:beds.map(b=>({x:b.x,y:b.y,z:b.z})),
    trophyCount,trophies:trophies.map(t=>({x:t.x,y:t.y,z:t.z})),
    farmPlots:farmPlots.map(f=>({x:f.x,y:f.y,z:f.z,stage:f.stage,growT:f.growT})),
    openedTreasures:[...openedTreasureKeys],
    treasureMap:treasureMap?{...treasureMap}:null,
    // 🏛 封印された地底都市（未生成なら null。旧セーブに無い場合も未生成として扱う）
    undergroundCity:(typeof sucSaveState==='function')?sucSaveState():null,
    // ☁ 崩れかけの天空都市（旧セーブに無い場合は未生成として扱う）
    skyCity:(typeof sccSaveState==='function')?sccSaveState():null,
    // 🌊 海底に沈んだ王都（旧セーブに無い場合は未生成として扱う）
    sunkenCity:(typeof srcSaveState==='function')?srcSaveState():null,
    // 🏰 歩き続ける巨大城塞（移動体なので現在位置・向き・歩行位相を保存）
    walkingFortress:(typeof wfSaveState==='function')?wfSaveState():null,
    villages:(typeof villagesSaveState==='function')?villagesSaveState():null,
    achievements:{...achievements},
    discoveredBiomes:(typeof discoveredBiomes!=='undefined')?{...discoveredBiomes}:{},
    preview:captureSavePreview(),
    biomeName:getSaveBiomeName(),
    goalText:getSaveGoalText(),
    savedAt:Date.now()
  };
  try{
    const r=await window.storage.set(saveKeyForSlot(activeSaveSlot),JSON.stringify(data));
    showSaveToast(r?'💾 SLOT '+activeSaveSlot+' SAVED!':'⚠ 保存失敗');
    updateOverlaySaveInfo();
    if($saveSlotPanel&&$saveSlotPanel.classList.contains('show'))renderSaveSlots();
  }
  catch(e){showSaveToast('⚠ 保存失敗');}
}
const $contBtn=document.getElementById('contBtn'),$saveSlotsBtn=document.getElementById('saveSlotsBtn'),$saveInfo=document.getElementById('saveInfo');
const $saveSlotPanel=document.getElementById('saveSlotPanel'),$saveSlotList=document.getElementById('saveSlotList'),$saveSlotCloseBtn=document.getElementById('saveSlotCloseBtn');
function captureSavePreview(){
  try{
    if(!canvas||!canvas.width||!canvas.height)return '';
    const out=document.createElement('canvas');out.width=220;out.height=124;
    const ctx=out.getContext('2d');ctx.drawImage(canvas,0,0,out.width,out.height);
    return out.toDataURL('image/jpeg',0.58);
  }catch(e){return '';}
}
function getSaveBiomeName(){
  try{return getBiomeName(getBiome(Math.floor(P.x),Math.floor(P.z))).replace(/[^\x20-\x7E\u3040-\u30ff\u3400-\u9fff]/g,'').trim()||'UNKNOWN';}
  catch(e){return 'UNKNOWN';}
}
function getSaveGoalText(){
  try{return getCurrentGoal().replace(/[^\x20-\x7E\u3040-\u30ff\u3400-\u9fff]/g,'').trim();}
  catch(e){return '';}
}
function formatSlotName(slot,d){return (d&&d.slotName)||('SLOT '+slot);}
function formatSaveMeta(d){
  if(!d)return 'EMPTY';
  const dt=new Date(d.savedAt||Date.now());
  const mode=d.gameMode==='creative'?'🪄CREATIVE ':d.endlessMode?'♾ENDLESS ':'';
  return `${mode}DAY${d.day||1} WAVE${d.wave||0} SCORE${d.score||0} / ${dt.getMonth()+1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2,'0')}`;
}
function formatSaveDetails(d){
  if(!d)return 'Start a fresh world in this slot.';
  const parts=[
    'HP '+Math.round(d.hp||100),
    'KILLS '+(d.kills||0),
    'DIAMOND '+((d.inv&&d.inv.diamond)||0),
    'X '+Math.floor(d.px||0)+' Z '+Math.floor(d.pz||0)
  ];
  if(d.biomeName)parts.push(d.biomeName);
  return parts.join(' / ');
}
function openSaveSlots(){renderSaveSlots();if($saveSlotPanel)$saveSlotPanel.classList.add('show');}
function closeSaveSlots(){if($saveSlotPanel)$saveSlotPanel.classList.remove('show');}
async function updateOverlaySaveInfo(options={}){
  const rows=await getAllSaveSlots();
  const filled=rows.filter(r=>r.data);
  const keepContState=options===true||options.enableContinueButton===false;
  const isEndOverlay=!gs.running&&!overlay.classList.contains('hide')&&(ovTitle.textContent==='GAME OVER'||ovTitle.textContent==='GAME CLEAR!!');
  const canTouchCont=!keepContState&&!isEndOverlay;
  const active=rows[activeSaveSlot-1]&&rows[activeSaveSlot-1].data;
  if(filled.length&&active){
    if(canTouchCont)$contBtn.classList.remove('disabled');
    $contBtn.textContent='CONTINUE '+formatSlotName(activeSaveSlot,active);
    $saveInfo.textContent=`SAVE ${formatSlotName(activeSaveSlot,active)}: ${formatSaveMeta(active)} (${filled.length}/${SAVE_SLOT_COUNT})`;
  }else if(filled.length){
    if(canTouchCont)$contBtn.classList.add('disabled');
    $contBtn.textContent='CONTINUE';
    $saveInfo.textContent='Active slot is empty. Open SAVE SLOTS to choose a saved slot.';
  }else{
    if(canTouchCont)$contBtn.classList.add('disabled');
    $contBtn.textContent='CONTINUE';
    $saveInfo.textContent='No save data yet. Open SAVE SLOTS to pick an empty slot.';
  }
}
async function renderSaveSlots(){
  if(!$saveSlotList)return;
  const rows=await getAllSaveSlots();
  $saveSlotList.innerHTML='';
  rows.forEach(({slot,data})=>{
    const wrap=document.createElement('div');
    wrap.className='saveSlot'+(slot===activeSaveSlot?' active':'');
    const preview=document.createElement('div');preview.className='saveSlotPreview';
    if(data&&data.preview){const img=document.createElement('img');img.alt='slot preview';img.src=data.preview;preview.appendChild(img);}
    else{preview.textContent='EMPTY';}
    wrap.appendChild(preview);
    const body=document.createElement('div');body.className='saveSlotBody';
    const title=document.createElement('div');title.className='saveSlotTitle';title.textContent=formatSlotName(slot,data)+(slot===activeSaveSlot?'  * SELECTED':'');body.appendChild(title);
    const meta=document.createElement('div');meta.className='saveSlotMeta';meta.textContent=formatSaveMeta(data);body.appendChild(meta);
    const detail=document.createElement('div');detail.className='saveSlotDetail';detail.textContent=formatSaveDetails(data);body.appendChild(detail);
    if(data&&data.goalText){const goal=document.createElement('div');goal.className='saveSlotGoal';goal.textContent=data.goalText;body.appendChild(goal);}
    const btns=document.createElement('div');btns.className='saveSlotBtns';
    const main=document.createElement('button');main.className='slotBtn';main.textContent=data?'LOAD':'NEW';main.addEventListener('pointerdown',(e)=>{e.preventDefault();e.stopPropagation();setActiveSaveSlot(slot);closeSaveSlots();data?continueGame():startNewGameWithConfirm(slot);});btns.appendChild(main);
    const use=document.createElement('button');use.className='slotBtn secondary';use.textContent='SELECT';use.addEventListener('pointerdown',(e)=>{e.preventDefault();e.stopPropagation();setActiveSaveSlot(slot);updateOverlaySaveInfo();renderSaveSlots();showSaveToast('SLOT '+slot+' SELECTED');});btns.appendChild(use);
    if(data){
      const rename=document.createElement('button');rename.className='slotBtn secondary';rename.textContent='NAME';rename.addEventListener('pointerdown',async(e)=>{e.preventDefault();e.stopPropagation();await renameSaveSlot(slot,data);});btns.appendChild(rename);
      const fresh=document.createElement('button');fresh.className='slotBtn danger';fresh.textContent='NEW';fresh.addEventListener('pointerdown',async(e)=>{e.preventDefault();e.stopPropagation();await startNewGameWithConfirm(slot);});btns.appendChild(fresh);
      const del=document.createElement('button');del.className='slotBtn danger';del.textContent='DELETE';del.addEventListener('pointerdown',async(e)=>{e.preventDefault();e.stopPropagation();if(confirm(formatSlotName(slot,data)+' will be deleted. Continue?')){await deleteSave(slot);updateOverlaySaveInfo();renderSaveSlots();showSaveToast('SLOT '+slot+' DELETED');}});btns.appendChild(del);
    }
    body.appendChild(btns);wrap.appendChild(body);$saveSlotList.appendChild(wrap);
  });
}
async function renameSaveSlot(slot,data){
  const current=formatSlotName(slot,data);
  const next=prompt('Slot name',current);
  if(next==null)return;
  const clean=next.trim().slice(0,24)||('SLOT '+slot);
  const updated={...data,slotName:clean};
  await window.storage.set(saveKeyForSlot(slot),JSON.stringify(updated));
  updateOverlaySaveInfo();renderSaveSlots();showSaveToast('SLOT '+slot+' NAMED');
}
async function startNewGameWithConfirm(slot=activeSaveSlot){
  const safeSlot=Math.max(1,Math.min(SAVE_SLOT_COUNT,Number(slot)||1));
  const existing=await loadSaveData(safeSlot);
  if(existing&&!confirm('SLOT '+safeSlot+' のセーブデータを上書きして新しく始めますか？'))return;
  setActiveSaveSlot(safeSlot);
  closeSaveSlots();
  await startGame();
}
// 初回の updateOverlaySaveInfo() 呼び出しは main.js の末尾（全モジュール読込後）に移動。
// async 継続部が gs / overlay / ovTitle（後続モジュールで定義）を参照するため。
const SPLASHES=['ダイヤを掘れ！','クリーパー、本当に来た！','地下ドラゴン注意！','素材を集めろ！','100% 本物！','ピクセルアート！','モバイル対応！','ブロックを積め！','WAVE20まで生き残れ！','地下が怖い…','無限に遊べる！','ジョークラへようこそ！','採掘が楽しい！','宝箱を探せ！','キングダイヤモンドドラゴンを倒せ！','武器をエンチャントしろ！','氷の上は滑るぞ！','黒曜石は壊されない！','エンドレスに挑め！','火矢で敵を燃やせ！','鉄を精錬しろ！','かまどを作ろう！','ウマに乗って駆けろ！','小麦でウマを手なずけろ！','ピラミッドに宝が眠る！','宝の地図を追え！','イグルーを探せ！','遺跡に財宝あり！',
'行商人と交易しろ！','隕石に気をつけろ！','満月の夜は危険がいっぱい！',
'爆発する前に倒せ！','クモは壁を登るぞ！','夜空のファントムに注意！'];
const $ovSplash=document.getElementById('ovSplash');
function rotateSplash(){if($ovSplash)$ovSplash.textContent=SPLASHES[Math.floor(Math.random()*SPLASHES.length)];}
rotateSplash();
const SCORE_KEY='jokura_scores';
// 難易度は被ダメージ0.6〜1.5倍とスコア難度に大きく影響するため、ランキングにも
// 記録して表示する。旧バージョンの記録には diff が無いので表示側は空欄でフォールバックする。
const DIFF_TAG={easy:'😌EASY',normal:'⚔NORM',hard:'🔥HARD'};
async function saveScore(cleared){
  if(isCreative()||cheatsUsed)return; // creative / cheat-used runs don't enter the ranking
  try{
    const r=await window.storage.get(SCORE_KEY);
    const arr=JSON.parse((r&&r.value)||'[]');
    const now=new Date();
    arr.push({score:gs.score,wave:gs.wave,kills:gs.kills,day:gs.day,cleared,diff:settings.difficulty||'normal',date:(now.getMonth()+1)+'/'+(now.getDate())+'/'+String(now.getFullYear()).slice(2)});
    arr.sort((a,b)=>b.score-a.score);arr.splice(5);
    await window.storage.set(SCORE_KEY,JSON.stringify(arr));
    renderRankHUD();
  }catch(e){}
}
const $rankInfo=document.getElementById('rankInfo');
async function renderRankHUD(){
  if(!$rankInfo)return;
  try{
    const r=await window.storage.get(SCORE_KEY);
    const arr=JSON.parse((r&&r.value)||'[]');
    if(!arr.length){$rankInfo.innerHTML='<div style="color:#f9d34299;font-size:min(9px,2.5vw);letter-spacing:1px">🏆 BEST SCORE: 0</div>';return;}
    const medals=['🥇','🥈','🥉','',''];
    const best=arr[0];
    let h='<div style="color:#f9d342;font-size:min(10px,2.8vw);font-weight:900;letter-spacing:2px;margin-bottom:3px">🏆 BEST SCORE: '+best.score.toLocaleString()+'pt</div>';
    arr.forEach((r,i)=>{h+='<div style="font-size:min(9px,2.6vw);color:#ccc;letter-spacing:.4px;line-height:1.75">'+(medals[i]||'　')+(r.cleared?'💎':'　')+' #'+(i+1)+'　'+r.score.toLocaleString()+'pt　W'+r.wave+'　'+r.kills+'kill　'+r.day+'日　<span style="color:#9fc7e6cc">'+(DIFF_TAG[r.diff]||'')+'</span>　<span style="color:#7ecfff66">'+r.date+'</span></div>';});
    $rankInfo.innerHTML=h;
  }catch(e){$rankInfo.innerHTML='';}
}
renderRankHUD();
const $saveToast=document.getElementById('saveToast');let saveToastTimer=0;
function showSaveToast(msg){$saveToast.textContent=msg;$saveToast.classList.add('show');saveToastTimer=2;}

