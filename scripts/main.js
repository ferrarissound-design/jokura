(function(){
function boot(){
if(typeof THREE==='undefined'){document.getElementById('ovTitle').textContent='読込失敗';return;}

// ═══ STORAGE POLYFILL ═══
if(!window.storage){
  window.storage={
    get:function(k){try{var v=localStorage.getItem(k);return Promise.resolve(v!=null?{value:v}:null);}catch(e){return Promise.resolve(null);}},
    set:function(k,v){try{localStorage.setItem(k,v);return Promise.resolve(true);}catch(e){return Promise.resolve(false);}},
    delete:function(k){try{localStorage.removeItem(k);}catch(e){}return Promise.resolve();}
  };
}

// ═══ DEVICE ═══
const isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
const isDesktop=!isTouch;
const FRAME_MIN=isTouch?(1000/30):0;
const DRAW_R=isTouch?3:6;
const MINIMAP_INTERVAL=isTouch?.7:.35;
if(isDesktop){document.getElementById('joyWrap').style.display='none';document.getElementById('weaponBtn').style.display='none';document.getElementById('actionWrap').style.display='none';document.getElementById('hint').style.display='none';document.getElementById('hintPC').style.display='block';}

// ═══ INVENTORY ═══
const inv={wood:0,stone:0,sand:0,grass:0,brick:0,arrow:0,diamond:0,dragonCore:0};
let hasDiamondSword=false,hasDiamondBow=false,hasDiamondStaff=false,hasDiamondHammer=false;
const unlockedWeapons=[true,false,false,false,false,false];
const BLOCK_MAT_MAP=['grass','stone','sand','wood','brick','grass','stone',null,null,null,null,'grass','stone','stone','stone','diamond'];
const SLOT_MAT=['grass','stone','sand','wood','brick'];

const CRAFT_RECIPES=[
  {name:'⚔ Sword',  wi:1,  needs:{wood:5},          desc:'🪵×5'},
  {name:'🔨 Hammer', wi:2,  needs:{wood:4,stone:10}, desc:'🪵×4+🪨×10'},
  {name:'🏹 Bow',    wi:3,  needs:{wood:3,stone:3},  desc:'🪵×3+🪨×3'},
  {name:'🪄 Magic',  wi:4,  needs:{brick:5,stone:5}, desc:'🧱×5+🪨×5'},
  {name:'📦 Chest',  wi:-1, needs:{wood:10},         desc:'🪵×10'},
  {name:'🛏 Bed',    wi:-2, needs:{wood:6,grass:4},  desc:'🪵×6+🌿×4'},
  {name:'🧱 Brick×3',wi:-3, needs:{stone:5},         desc:'🪨×5'},
  {name:'💊 ポーション',wi:-4, needs:{grass:3},        desc:'🌿×3'},
  {name:'🏹 矢束×10',  wi:-5, needs:{wood:2},          desc:'🪵×2', req:3},
  {name:'💎 Diamond Sword',wi:-6,needs:{diamond:3,wood:1},desc:'💎×3+🪵×1'},
  {name:'💎 Diamond Bow',  wi:-7,needs:{diamond:3,wood:2},desc:'💎×3+🪵×2',req:3},
  {name:'🔮 Diamond Staff',wi:-8,needs:{diamond:5,wood:2},desc:'💎×5+🪵×2'},
  {name:'🏆 ダイヤドラゴン像',wi:-9,needs:{dragonCore:1,diamond:3},desc:'💠×1+💎×3'},
  {name:'💎 Diamond Hammer',wi:-10,needs:{diamond:4,stone:20},       desc:'💎×4+🪨×20', req:2},
];

const ACHIEVEMENT_DEFS={
  firstSword:{title:'はじめての剣',desc:'剣をクラフトする',reward:'🥩 +1',apply(){meat+=1;updateMeatHUD();}},
  firstHammer:{title:'石の使い手',desc:'ハンマーをクラフトする',reward:'SCORE +300',apply(){gs.score+=300;}},
  firstBow:{title:'遠距離デビュー',desc:'弓をクラフトする',reward:'🏹 +10',apply(){inv.arrow+=10;updateInvHUD();}},
  firstBase:{title:'拠点づくり',desc:'チェストかベッドを設置する',reward:'HP +30',apply(){P.hp=Math.min(P.maxHp,P.hp+30);}},
  firstDiamond:{title:'ダイヤ発見',desc:'ダイヤを初めて入手する',reward:'SCORE +500',apply(){gs.score+=500;}},
  treasureHunter:{title:'地下探検家',desc:'地下宝箱を開ける',reward:'💎 +1',apply(){inv.diamond+=1;updateInvHUD();}},
  wave5:{title:'WAVE5到達',desc:'WAVE5に到達する',reward:'🥩 +2 / 🏹 +10',apply(){meat+=2;inv.arrow+=10;updateMeatHUD();updateInvHUD();}},
  bossSlayer:{title:'ボススレイヤー',desc:'通常ボスを倒す',reward:'SCORE +1000',apply(){gs.score+=1000;}},
  finalChallenge:{title:'最終決戦',desc:'WAVE20に到達する',reward:'💎 +2',apply(){inv.diamond+=2;updateInvHUD();}},
  dragonSlayer:{title:'ドラゴンスレイヤー',desc:'キングダイヤモンドドラゴンを倒す',reward:'🏆 CLEAR BONUS',apply(){gs.score+=3000;}},
};
const achievements={};
function resetAchievements(){for(const key of Object.keys(ACHIEVEMENT_DEFS))achievements[key]=false;}
function loadAchievements(saved){resetAchievements();if(saved&&typeof saved==='object'){for(const key of Object.keys(ACHIEVEMENT_DEFS))achievements[key]=!!saved[key];}}
function unlockAchievement(key){
  const def=ACHIEVEMENT_DEFS[key];if(!def||achievements[key])return;
  achievements[key]=true;
  if(def.apply)def.apply();
  showBonus('🏅 '+def.title+' 達成！ '+def.reward);
  playTone(1200,.12,.12,'triangle');setTimeout(()=>playTone(1600,.1,.1,'triangle'),110);
  renderAchievements();
}
resetAchievements();

const $invWood=document.getElementById('invWood');
const $invStone=document.getElementById('invStone');
const $invSand=document.getElementById('invSand');
const $invGrass=document.getElementById('invGrass');
const $invBrick=document.getElementById('invBrick');
const $invArrow=document.getElementById('invArrow');
const $invDiamond=document.getElementById('invDiamond');
const $invDragonCore=document.getElementById('invDragonCore');
const $treasureInfo=document.getElementById('treasureInfo');
const $craftPanel=document.getElementById('craftPanel');

function updateInvHUD(){
  $invWood.textContent='🪵 WOOD: '+inv.wood;
  $invStone.textContent='🪨 STONE: '+inv.stone;
  $invSand.textContent='🏖 SAND: '+inv.sand;
  $invGrass.textContent='🌿 GRASS: '+inv.grass;
  $invBrick.textContent='🧱 BRICK: '+inv.brick;
  $invArrow.textContent='🏹 ARROW: '+inv.arrow;
  $invDiamond.textContent='💎 DIAMOND: '+inv.diamond;
  $invDragonCore.textContent='💠 DRAGON CORE: '+inv.dragonCore;
}

function addMaterial(ti){
  const mat=BLOCK_MAT_MAP[ti];if(!mat)return;
  if(mat==='diamond'&&inv.diamond===0)showAlert('💎 DIAMOND FOUND!');
  inv[mat]++;updateInvHUD();
  if(mat==='diamond')unlockAchievement('firstDiamond');
}

function canCraft(recipe){
  for(const[k,v] of Object.entries(recipe.needs)){if(inv[k]<v)return false;}
  return true;
}

const MATERIAL_LABELS={
  wood:'🪵 WOOD',
  stone:'🪨 STONE',
  sand:'🏖 SAND',
  grass:'🌿 GRASS',
  brick:'🧱 BRICK',
  arrow:'🏹 ARROW',
  diamond:'💎 DIAMOND',
  dragonCore:'💠 DRAGON CORE'
};

function getMissingMaterialsText(recipe){
  const lacks=[];
  for(const[k,v] of Object.entries(recipe.needs)){
    const cur=inv[k]||0;
    if(cur<v){const label=MATERIAL_LABELS[k]||k.toUpperCase();lacks.push(label+' '+cur+'/'+v);}
  }
  return lacks.join('  ');
}

function applyDiamondSword(){
  hasDiamondSword=true;
  WEAPONS[1].name='💎 Diamond Sword';WEAPONS[1].dmg=8;WEAPONS[1].cd=0.35;
  unlockedWeapons[1]=true;
  if(weaponIdx===1){const wl=document.getElementById('weaponLabel');if(wl)wl.textContent='💎 Diamond Sword';}
}
function applyDiamondBow(){
  hasDiamondBow=true;
  WEAPONS[3].name='💎 Diamond Bow';WEAPONS[3].dmg=9;WEAPONS[3].cd=0.5;
  unlockedWeapons[3]=true;
  if(weaponIdx===3){const wl=document.getElementById('weaponLabel');if(wl)wl.textContent='💎 Diamond Bow';}
}
function applyDiamondStaff(){
  hasDiamondStaff=true;
  unlockedWeapons[5]=true;
  if(weaponIdx===5){const wl=document.getElementById('weaponLabel');if(wl)wl.textContent='🔮 Diamond Staff';}
}
function applyDiamondHammer(){
  hasDiamondHammer=true;
  WEAPONS[2].name='💎 Diamond Hammer';WEAPONS[2].dmg=18;WEAPONS[2].cd=1.1;WEAPONS[2].range=4.5;WEAPONS[2].type='hammer';
  unlockedWeapons[2]=true;
  if(weaponIdx===2){const wl=document.getElementById('weaponLabel');if(wl)wl.textContent='💎 Diamond Hammer';}
}
function doCraft(idx){
  const r=CRAFT_RECIPES[idx];if(!r)return;
  if(r.wi>=0&&unlockedWeapons[r.wi])return;
  if(r.wi===-6&&hasDiamondSword)return;
  if(r.wi===-7&&hasDiamondBow)return;
  if(r.wi===-8&&hasDiamondStaff)return;
  if(r.wi===-10&&hasDiamondHammer)return;
  if(r.req!=null&&!unlockedWeapons[r.req]){showBonus('先に'+WEAPONS[r.req].name+'を入手しよう');playTone(200,.1,.08,'sawtooth');closeCraftPanel();return;}
  if(!canCraft(r)){showBonus('素材が足りない…');playTone(200,.1,.08,'sawtooth');closeCraftPanel();return;}
  for(const[k,v] of Object.entries(r.needs))inv[k]-=v;
  if(r.wi===-1){chestCount++;updateChestHUD();showBonus('📦 チェスト×'+chestCount);}
  else if(r.wi===-2){bedCount++;updateBedHUD();showBonus('🛏 ベッド×'+bedCount);}
  else if(r.wi===-3){inv.brick+=3;showBonus('🧱 レンガ×3 CRAFTED!');}
  else if(r.wi===-4){P.hp=Math.min(P.maxHp,P.hp+30);showBonus('💊 HP+30 HEALED!');}
  else if(r.wi===-5){inv.arrow+=10;showBonus('🏹 矢×10 CRAFTED!');}
  else if(r.wi===-6){applyDiamondSword();showAlert('💎 DIAMOND SWORD CRAFTED!');playTone(1400,.2,.2,'sine');setTimeout(()=>playTone(1800,.15,.2,'sine'),150);setTimeout(()=>playTone(2200,.1,.2,'sine'),300);}
  else if(r.wi===-7){applyDiamondBow();showAlert('💎 DIAMOND BOW CRAFTED!');playTone(1600,.2,.2,'triangle');setTimeout(()=>playTone(2000,.15,.2,'triangle'),150);setTimeout(()=>playTone(2400,.1,.2,'triangle'),300);}
  else if(r.wi===-8){applyDiamondStaff();showAlert('🔮 DIAMOND STAFF CRAFTED!');playTone(2400,.2,.15,'sine');setTimeout(()=>playTone(3200,.15,.12,'sine'),120);setTimeout(()=>playTone(1800,.1,.1,'sine'),240);}
  else if(r.wi===-9){trophyCount++;updateTrophyHUD();showAlert('🏆 ダイヤドラゴン像 CRAFTED! 拠点に飾ろう！');playTone(2000,.2,.15,'sine');setTimeout(()=>playTone(2600,.15,.12,'sine'),130);setTimeout(()=>playTone(3200,.1,.1,'sine'),260);}
  else if(r.wi===-10){applyDiamondHammer();showAlert('💎 DIAMOND HAMMER CRAFTED!');playTone(900,.15,.2,'square');setTimeout(()=>playTone(700,.15,.18,'square'),120);setTimeout(()=>playTone(1100,.1,.15,'square'),240);}
  else{unlockedWeapons[r.wi]=true;showBonus('🛠 '+r.name+' CRAFTED!');}
  if(r.wi===1)unlockAchievement('firstSword');
  else if(r.wi===2)unlockAchievement('firstHammer');
  else if(r.wi===3)unlockAchievement('firstBow');
  updateInvHUD();if(r.wi!==-6&&r.wi!==-7&&r.wi!==-8&&r.wi!==-9){playTone(800,.15,.12,'sine');setTimeout(()=>playTone(1000,.1,.1,'sine'),120);}
  closeCraftPanel();
}

function buildCraftPanel(){
  $craftPanel.innerHTML='';
  CRAFT_RECIPES.forEach((r,i)=>{
    const el=document.createElement('div');
    el.className='citem';
    if(r.wi>=0&&unlockedWeapons[r.wi]){el.classList.add('done');el.textContent='✅ '+r.name;}
    else if(r.wi===-6&&hasDiamondSword){el.classList.add('done');el.textContent='✅ '+r.name+' (作成済み)';}
    else if(r.wi===-7&&hasDiamondBow){el.classList.add('done');el.textContent='✅ '+r.name+' (作成済み)';}
    else if(r.wi===-8&&hasDiamondStaff){el.classList.add('done');el.textContent='✅ '+r.name+' (作成済み)';}
    else if(r.wi===-10&&hasDiamondHammer){el.classList.add('done');el.textContent='✅ '+r.name+' (作成済み)';}
    else if(r.wi===-9&&trophyCount>0){el.classList.add('done');el.textContent='✅ '+r.name+' (作成済み×'+trophyCount+')';}
    else if(r.req!=null&&!unlockedWeapons[r.req]){el.classList.add('locked');el.textContent='🔒 '+r.name+' ('+r.desc+') / 要:'+WEAPONS[r.req].name;}
    else if(!canCraft(r)){el.classList.add('locked');const miss=getMissingMaterialsText(r);el.textContent='🔒 '+r.name+' ('+r.desc+') / 不足 '+miss;}
    else{el.textContent='🔵 '+r.name+' ('+r.desc+')';el.addEventListener('pointerdown',(e)=>{e.stopPropagation();doCraft(i);});}
    $craftPanel.appendChild(el);
  });
}
function openCraftPanel(){if(!gs.running)return;buildCraftPanel();$craftPanel.classList.add('open');}
function closeCraftPanel(){$craftPanel.classList.remove('open');}
function toggleCraftPanel(){if($craftPanel.classList.contains('open'))closeCraftPanel();else openCraftPanel();}

function unlockWeaponByDrop(wi){
  if(wi>=0&&wi<unlockedWeapons.length&&!unlockedWeapons[wi])unlockedWeapons[wi]=true;
}

const $craftBtn=document.getElementById('craftBtn');
let _craftBtnLastT=0;
function _onCraftBtnTap(){const now=Date.now();if(now-_craftBtnLastT<100)return;_craftBtnLastT=now;toggleCraftPanel();}
function bindTapSafe(el,fn){
  let lockUntil=0;
  const run=(e)=>{
    const now=performance.now();
    if(now<lockUntil)return;
    lockUntil=now+350;
    e.preventDefault();
    e.stopPropagation();
    fn(e);
  };
  el.addEventListener('pointerdown',run);
  el.addEventListener('touchstart',run,{passive:false});
}

bindTapSafe($craftBtn,_onCraftBtnTap);
document.addEventListener('pointerdown',(e)=>{if(!$craftPanel.classList.contains('open'))return;if(e.target.closest('#craftPanel')||e.target.id==='craftBtn')return;closeCraftPanel();},{passive:true});

function resetInv(){
  inv.wood=0;inv.stone=0;inv.sand=0;inv.grass=0;inv.brick=0;inv.arrow=0;inv.diamond=0;inv.dragonCore=0;
  hasDiamondSword=false;
  WEAPONS[1].name='⚔ Sword';WEAPONS[1].dmg=3;WEAPONS[1].cd=0.4;
  hasDiamondBow=false;
  WEAPONS[3].name='🏹 Bow';WEAPONS[3].dmg=4;WEAPONS[3].cd=0.7;
  hasDiamondStaff=false;
  hasDiamondHammer=false;
  WEAPONS[2].name='🔨 Hammer';WEAPONS[2].dmg=6;WEAPONS[2].cd=0.8;WEAPONS[2].range=3;WEAPONS[2].type='melee';
  for(let i=0;i<unlockedWeapons.length;i++)unlockedWeapons[i]=(i===0);
  updateInvHUD();
}

// ═══ WORLD EDITS ═══
const worldEdits={placed:{},removed:{}};
function resetWorldEdits(){
  for(const k in worldEdits.placed)delete worldEdits.placed[k];
  for(const k in worldEdits.removed)delete worldEdits.removed[k];
}
function applyWorldEdits(){
  for(const k in worldEdits.removed){
    if(voxels[k]&&voxels[k].active){
      const v=voxels[k];removeBlock(v.mesh.userData.x,v.mesh.userData.y,v.mesh.userData.z);
    }
  }
  for(const k in worldEdits.placed){
    if(!voxels[k]){
      const[x,y,z]=k.split('|').map(Number);
      addBlock(x,y,z,worldEdits.placed[k],true,true);
    }
  }
}

// ═══ SAVE ═══
const SAVE_VERSION=6;
const SAVE_SLOT_COUNT=3;
const SAVE_BASE_KEY='jokura-save-v6';
const SAVE_KEY=SAVE_BASE_KEY; // legacy single-slot key kept for migration
const LEGACY_SAVE_KEYS=['jokura-save-v5'];
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
  if(version<6)migrated.version=6;
  return migrated;
}
async function loadSaveData(slot=activeSaveSlot){
  const safeSlot=Math.max(1,Math.min(SAVE_SLOT_COUNT,Number(slot)||1));
  const keys=[saveKeyForSlot(safeSlot)];
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
  if(safeSlot===1){
    try{await window.storage.delete(SAVE_KEY);}catch(e){}
    for(const key of LEGACY_SAVE_KEYS){try{await window.storage.delete(key);}catch(e){}}
  }
}
async function saveGame(){
  const data={
    version:SAVE_VERSION,saveSlot:activeSaveSlot,
    score:gs.score,kills:gs.kills,wave:gs.wave,day:gs.day,time:gs.time,
    nextWave:gs.nextWave,hp:P.hp,weaponIdx,curType,finalBossPending,
    px:P.x,py:P.y,pz:P.z,yaw,pitch,
    inv:{...inv},unlockedWeapons:[...unlockedWeapons],meat,hasDiamondSword,hasDiamondBow,hasDiamondStaff,hasDiamondHammer,
    worldSeed:WORLD_SEED,
    worldEdits:{placed:{...worldEdits.placed},removed:{...worldEdits.removed}},
    chestCount,chests:chests.map(c=>({x:c.x,y:c.y,z:c.z,contents:{...c.contents}})),
    bedCount,beds:beds.map(b=>({x:b.x,y:b.y,z:b.z})),
    trophyCount,trophies:trophies.map(t=>({x:t.x,y:t.y,z:t.z})),
    openedTreasures:[...openedTreasureKeys],
    achievements:{...achievements},
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
const $contBtn=document.getElementById('contBtn'),$saveInfo=document.getElementById('saveInfo');
const $saveSlotPanel=document.getElementById('saveSlotPanel'),$saveSlotList=document.getElementById('saveSlotList'),$saveSlotCloseBtn=document.getElementById('saveSlotCloseBtn');
function formatSaveMeta(d){
  if(!d)return 'EMPTY';
  const dt=new Date(d.savedAt||Date.now());
  return `DAY${d.day||1} WAVE${d.wave||0} SCORE${d.score||0} / ${dt.getMonth()+1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2,'0')}`;
}
async function updateOverlaySaveInfo(keepContState){
  const rows=await getAllSaveSlots();
  const filled=rows.filter(r=>r.data);
  // game-over / clear screens disable the continue button on purpose; don't override that
  if(!keepContState)$contBtn.classList.remove('disabled');
  if(filled.length){$saveInfo.textContent=`💾 SLOT ${activeSaveSlot}: ${formatSaveMeta(rows[activeSaveSlot-1].data)}　(${filled.length}/${SAVE_SLOT_COUNT})`;}
  else{$saveInfo.textContent='セーブデータなし / セーブスロットから空スロットを選べます';}
}
async function renderSaveSlots(){
  if(!$saveSlotList)return;
  const rows=await getAllSaveSlots();
  $saveSlotList.innerHTML='';
  rows.forEach(({slot,data})=>{
    const wrap=document.createElement('div');
    wrap.className='saveSlot'+(slot===activeSaveSlot?' active':'');
    const title=document.createElement('div');title.className='saveSlotTitle';title.textContent='SLOT '+slot+(slot===activeSaveSlot?'  ★ SELECTED':'');wrap.appendChild(title);
    const meta=document.createElement('div');meta.className='saveSlotMeta';meta.textContent=formatSaveMeta(data);wrap.appendChild(meta);
    const btns=document.createElement('div');btns.className='saveSlotBtns';
    const main=document.createElement('button');main.className='slotBtn';main.textContent=data?'LOAD':'NEW GAME';main.addEventListener('pointerdown',(e)=>{e.preventDefault();e.stopPropagation();setActiveSaveSlot(slot);closeSaveSlots();data?continueGame():startGame();});btns.appendChild(main);
    const use=document.createElement('button');use.className='slotBtn secondary';use.textContent='SELECT';use.addEventListener('pointerdown',(e)=>{e.preventDefault();e.stopPropagation();setActiveSaveSlot(slot);updateOverlaySaveInfo();renderSaveSlots();showSaveToast('SLOT '+slot+' SELECTED');});btns.appendChild(use);
    if(data){
      const fresh=document.createElement('button');fresh.className='slotBtn danger';fresh.textContent='NEW';fresh.addEventListener('pointerdown',async(e)=>{e.preventDefault();e.stopPropagation();await startNewGameWithConfirm(slot);});btns.appendChild(fresh);
      const del=document.createElement('button');del.className='slotBtn danger';del.textContent='DELETE';del.addEventListener('pointerdown',async(e)=>{e.preventDefault();e.stopPropagation();if(confirm('SLOT '+slot+' を削除しますか？')){await deleteSave(slot);updateOverlaySaveInfo();renderSaveSlots();showSaveToast('SLOT '+slot+' DELETED');}});btns.appendChild(del);
    }
    wrap.appendChild(btns);$saveSlotList.appendChild(wrap);
  });
}
function openSaveSlots(){renderSaveSlots();if($saveSlotPanel)$saveSlotPanel.classList.add('show');}
function closeSaveSlots(){if($saveSlotPanel)$saveSlotPanel.classList.remove('show');}
async function startNewGameWithConfirm(slot=activeSaveSlot){
  const safeSlot=Math.max(1,Math.min(SAVE_SLOT_COUNT,Number(slot)||1));
  const existing=await loadSaveData(safeSlot);
  if(existing&&!confirm('SLOT '+safeSlot+' のセーブデータを上書きして新しく始めますか？'))return;
  setActiveSaveSlot(safeSlot);
  closeSaveSlots();
  await startGame();
}
updateOverlaySaveInfo();
const SPLASHES=['ダイヤを掘れ！','クリーパーじゃないよ！','地下ドラゴン注意！','素材を集めろ！','100% 本物！','ピクセルアート！','モバイル対応！','ブロックを積め！','WAVE20まで生き残れ！','地下が怖い…','無限に遊べる！','ジョークラへようこそ！','採掘が楽しい！','宝箱を探せ！','キングダイヤモンドドラゴンを倒せ！'];
const $ovSplash=document.getElementById('ovSplash');
function rotateSplash(){if($ovSplash)$ovSplash.textContent=SPLASHES[Math.floor(Math.random()*SPLASHES.length)];}
rotateSplash();
const SCORE_KEY='jokura_scores';
function saveScore(cleared){
  try{
    const arr=JSON.parse(localStorage.getItem(SCORE_KEY)||'[]');
    const now=new Date();
    arr.push({score:gs.score,wave:gs.wave,kills:gs.kills,day:gs.day,cleared,date:(now.getMonth()+1)+'/'+(now.getDate())});
    arr.sort((a,b)=>b.score-a.score);arr.splice(5);
    localStorage.setItem(SCORE_KEY,JSON.stringify(arr));
  }catch(e){}
}
const $rankInfo=document.getElementById('rankInfo');
function renderRankHUD(){
  if(!$rankInfo)return;
  try{
    const arr=JSON.parse(localStorage.getItem(SCORE_KEY)||'[]');
    if(!arr.length){$rankInfo.innerHTML='<div style="color:#f9d34299;font-size:min(9px,2.5vw);letter-spacing:1px">🏆 BEST SCORE: 0</div>';return;}
    const medals=['🥇','🥈','🥉','',''];
    const best=arr[0];
    let h='<div style="color:#f9d342;font-size:min(10px,2.8vw);font-weight:900;letter-spacing:2px;margin-bottom:3px">🏆 BEST SCORE: '+best.score.toLocaleString()+'pt</div>';
    arr.forEach((r,i)=>{h+='<div style="font-size:min(9px,2.6vw);color:#ccc;letter-spacing:.4px;line-height:1.75">'+(medals[i]||'　')+(r.cleared?'💎':'　')+' #'+(i+1)+'　'+r.score.toLocaleString()+'pt　W'+r.wave+'　'+r.kills+'kill　'+r.day+'日　<span style="color:#7ecfff66">'+r.date+'</span></div>';});
    $rankInfo.innerHTML=h;
  }catch(e){$rankInfo.innerHTML='';}
}
renderRankHUD();
const $saveToast=document.getElementById('saveToast');let saveToastTimer=0;
function showSaveToast(msg){$saveToast.textContent=msg;$saveToast.classList.add('show');saveToastTimer=2;}

// ═══ HELP / SETTINGS ═══
const SETTINGS_KEY='jokura-settings-v1';
// difficulty: player-damage multiplier; lookSens: touch look multiplier; flash: hit/lava screen flashes; autoSave: periodic save
const settings={bgmMuted:false,sfxMuted:false,difficulty:'normal',lookSens:1,flash:true,autoSave:true,shadows:null,bob:true};
const DIFF_MULT={easy:.6,normal:1,hard:1.5};
function difficultyMult(){return DIFF_MULT[settings.difficulty]||1;}
function loadSettings(){
  try{const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');Object.assign(settings,saved);}catch(e){}
  if(!(settings.difficulty in DIFF_MULT))settings.difficulty='normal';
  settings.lookSens=Math.max(.4,Math.min(2,Number(settings.lookSens)||1));
  if(typeof settings.shadows!=='boolean')settings.shadows=!isTouch; // shadows default: PC on, mobile off
  if(typeof settings.bob!=='boolean')settings.bob=true;
  // LS initialises from settings.lookSens at its own declaration; don't touch it here (TDZ)
}
function applyAccessibility(){try{LS=LS_BASE*settings.lookSens;}catch(e){}}
function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch(e){}}
const $helpPanel=document.getElementById('helpPanel'),$settingsPanel=document.getElementById('settingsPanel'),$achievementsPanel=document.getElementById('achievementsPanel');
const $helpBtn=document.getElementById('helpBtn'),$helpCloseBtn=document.getElementById('helpCloseBtn');
const $achievementsBtn=document.getElementById('achievementsBtn'),$achievementsCloseBtn=document.getElementById('achievementsCloseBtn'),$achievementsList=document.getElementById('achievementsList');
const $settingsBtn=document.getElementById('settingsBtn'),$settingsCloseBtn=document.getElementById('settingsCloseBtn'),$pauseSettingsBtn=document.getElementById('pauseSettingsBtn');
const $bgmToggleBtn=document.getElementById('bgmToggleBtn'),$sfxToggleBtn=document.getElementById('sfxToggleBtn');
function setPanel(panel,open){if(panel)panel.classList.toggle('show',open);}
function openHelp(){setPanel($helpPanel,true);}
function closeHelp(){setPanel($helpPanel,false);}
function openSettings(){updateSettingsUI();setPanel($settingsPanel,true);}
function closeSettings(){setPanel($settingsPanel,false);}
function renderAchievements(){
  if(!$achievementsList)return;
  $achievementsList.innerHTML='';
  for(const [key,def] of Object.entries(ACHIEVEMENT_DEFS)){
    const done=!!achievements[key];
    const item=document.createElement('div');item.className='achievementItem'+(done?' done':'');
    const title=document.createElement('div');title.className='achievementTitle';title.textContent=(done?'✅ ':'⬛ ')+def.title;item.appendChild(title);
    const desc=document.createElement('div');desc.className='achievementDesc';desc.textContent=def.desc;item.appendChild(desc);
    const reward=document.createElement('div');reward.className='achievementReward';reward.textContent='報酬: '+def.reward;item.appendChild(reward);
    $achievementsList.appendChild(item);
  }
}
function openAchievements(){renderAchievements();setPanel($achievementsPanel,true);}
function closeAchievements(){setPanel($achievementsPanel,false);}
const $diffBtns={easy:document.getElementById('diffEasyBtn'),normal:document.getElementById('diffNormalBtn'),hard:document.getElementById('diffHardBtn')};
const $sensBtns=[document.getElementById('sensLowBtn'),document.getElementById('sensMidBtn'),document.getElementById('sensHighBtn')];
const SENS_VALS=[.6,1,1.5];
const $flashToggleBtn=document.getElementById('flashToggleBtn'),$autoSaveToggleBtn=document.getElementById('autoSaveToggleBtn'),$shadowToggleBtn=document.getElementById('shadowToggleBtn'),$bobToggleBtn=document.getElementById('bobToggleBtn');
function updateSettingsUI(){
  if($bgmToggleBtn){$bgmToggleBtn.textContent='BGM: '+(settings.bgmMuted?'OFF':'ON');$bgmToggleBtn.classList.toggle('on',!settings.bgmMuted);$bgmToggleBtn.classList.toggle('off',settings.bgmMuted);}
  if($sfxToggleBtn){$sfxToggleBtn.textContent='SE: '+(settings.sfxMuted?'OFF':'ON');$sfxToggleBtn.classList.toggle('on',!settings.sfxMuted);$sfxToggleBtn.classList.toggle('off',settings.sfxMuted);}
  for(const k in $diffBtns){if($diffBtns[k])$diffBtns[k].classList.toggle('sel',settings.difficulty===k);}
  const si=SENS_VALS.indexOf(SENS_VALS.reduce((a,b)=>Math.abs(b-settings.lookSens)<Math.abs(a-settings.lookSens)?b:a,1));
  $sensBtns.forEach((b,i)=>{if(b)b.classList.toggle('sel',i===si);});
  if($flashToggleBtn){$flashToggleBtn.textContent='画面フラッシュ: '+(settings.flash?'ON':'OFF');$flashToggleBtn.classList.toggle('on',settings.flash);$flashToggleBtn.classList.toggle('off',!settings.flash);}
  if($autoSaveToggleBtn){$autoSaveToggleBtn.textContent='オートセーブ: '+(settings.autoSave?'ON':'OFF');$autoSaveToggleBtn.classList.toggle('on',settings.autoSave);$autoSaveToggleBtn.classList.toggle('off',!settings.autoSave);}
  if($shadowToggleBtn){$shadowToggleBtn.textContent='影(シャドウ): '+(settings.shadows?'ON':'OFF');$shadowToggleBtn.classList.toggle('on',!!settings.shadows);$shadowToggleBtn.classList.toggle('off',!settings.shadows);}
  if($bobToggleBtn){$bobToggleBtn.textContent='画面の揺れ: '+(settings.bob?'ON':'OFF');$bobToggleBtn.classList.toggle('on',!!settings.bob);$bobToggleBtn.classList.toggle('off',!settings.bob);}
}
function toggleBgmMute(){
  settings.bgmMuted=!settings.bgmMuted;saveSettings();updateSettingsUI();
  if(settings.bgmMuted)stopBgm();
  else if(gs&&gs.running){bgmBiome=-1;bgmBoss=false;bgmWave=false;bgmUnder=false;bgmUnderDragon=false;}
  showSaveToast(settings.bgmMuted?'🔇 BGM OFF':'🎵 BGM ON');
}
function toggleSfxMute(){settings.sfxMuted=!settings.sfxMuted;saveSettings();updateSettingsUI();showSaveToast(settings.sfxMuted?'🔇 SE OFF':'🔊 SE ON');}
function setDifficulty(d){if(!(d in DIFF_MULT))return;settings.difficulty=d;saveSettings();updateSettingsUI();showSaveToast('難易度: '+d.toUpperCase());}
function setLookSens(v){settings.lookSens=v;applyAccessibility();saveSettings();updateSettingsUI();showSaveToast('視点感度: '+(v<1?'LOW':v>1?'HIGH':'MID'));}
function toggleFlash(){settings.flash=!settings.flash;saveSettings();updateSettingsUI();showSaveToast(settings.flash?'画面フラッシュ ON':'画面フラッシュ OFF');}
function toggleAutoSave(){settings.autoSave=!settings.autoSave;saveSettings();updateSettingsUI();showSaveToast(settings.autoSave?'オートセーブ ON':'オートセーブ OFF');}
function toggleShadows(){settings.shadows=!settings.shadows;saveSettings();updateSettingsUI();applyShadowSetting();showSaveToast(settings.shadows?'🌤 影 ON':'影 OFF');}
function toggleBob(){settings.bob=!settings.bob;saveSettings();updateSettingsUI();showSaveToast(settings.bob?'画面の揺れ ON':'画面の揺れ OFF');}
loadSettings();updateSettingsUI();
if($helpBtn)bindTapSafe($helpBtn,openHelp);
if($helpCloseBtn)bindTapSafe($helpCloseBtn,closeHelp);
if($achievementsBtn)bindTapSafe($achievementsBtn,openAchievements);
if($achievementsCloseBtn)bindTapSafe($achievementsCloseBtn,closeAchievements);
if($settingsBtn)bindTapSafe($settingsBtn,openSettings);
if($pauseSettingsBtn)bindTapSafe($pauseSettingsBtn,openSettings);
if($settingsCloseBtn)bindTapSafe($settingsCloseBtn,closeSettings);
if($saveSlotCloseBtn)bindTapSafe($saveSlotCloseBtn,closeSaveSlots);
if($bgmToggleBtn)bindTapSafe($bgmToggleBtn,toggleBgmMute);
if($sfxToggleBtn)bindTapSafe($sfxToggleBtn,toggleSfxMute);
for(const k in $diffBtns){if($diffBtns[k])bindTapSafe($diffBtns[k],()=>setDifficulty(k));}
$sensBtns.forEach((b,i)=>{if(b)bindTapSafe(b,()=>setLookSens(SENS_VALS[i]));});
if($flashToggleBtn)bindTapSafe($flashToggleBtn,toggleFlash);
if($autoSaveToggleBtn)bindTapSafe($autoSaveToggleBtn,toggleAutoSave);
if($shadowToggleBtn)bindTapSafe($shadowToggleBtn,toggleShadows);
if($bobToggleBtn)bindTapSafe($bobToggleBtn,toggleBob);
// ─── ROBUST MENU CLOSE ───
// On small phones a tall panel can push the bottom CLOSE button past the visible
// viewport. Give every .menuPanel an always-visible corner ✕ (pinned to the
// screen, never scrolls away) plus tap-the-dark-backdrop-to-close, so a menu can
// always be dismissed regardless of content height or scroll quirks.
document.querySelectorAll('.menuPanel').forEach((panel)=>{
  const x=document.createElement('button');
  x.className='menuCloseX';x.type='button';x.textContent='✕';x.setAttribute('aria-label','閉じる');
  bindTapSafe(x,()=>panel.classList.remove('show'));
  panel.appendChild(x);
  panel.addEventListener('pointerdown',(e)=>{if(e.target===panel){e.preventDefault();e.stopPropagation();panel.classList.remove('show');}});
});
// ─── CODEX / QUEST LOG ───
const $codexPanel=document.getElementById('codexPanel'),$codexBody=document.getElementById('codexBody');
const $codexCloseBtn=document.getElementById('codexCloseBtn'),$codexBtn=document.getElementById('codexBtn'),$pauseCodexBtn=document.getElementById('pauseCodexBtn');
function renderCodex(){
  if(!$codexBody)return;
  const done=v=>v?'✅':'⬜';
  const hasBase=(typeof bedCount!=='undefined'&&bedCount>0)||(beds&&beds.length>0)||(typeof chestCount!=='undefined'&&chestCount>0)||(chests&&chests.length>0);
  const gotDiamond=(inv.diamond>0)||hasDiamondSword||hasDiamondBow||hasDiamondStaff||hasDiamondHammer;
  const quests=[
    ['⚔ 剣をクラフト',unlockedWeapons[1]],
    ['🔨 ハンマーをクラフト',unlockedWeapons[2]],
    ['🏹 弓をクラフト',unlockedWeapons[3]],
    ['🏠 拠点(チェスト/ベッド)を設置',hasBase],
    ['💎 ダイヤを入手',gotDiamond],
    ['💎 ダイヤ剣をクラフト',hasDiamondSword],
    ['🌊 WAVE5に到達',gs.wave>=5],
    ['🌊 WAVE20に到達',gs.wave>=20],
    ['🏆 キングダイヤモンドドラゴン撃破',!!achievements.dragonSlayer],
  ];
  let h='<div class="codexSection"><div class="codexHd">🎯 今の目標</div><div class="codexGoal">'+getCurrentGoal()+'</div></div>';
  h+='<div class="codexSection"><div class="codexHd">📋 クエスト進行</div>';
  for(const [t,d] of quests)h+='<div class="questItem'+(d?' done':'')+'">'+done(d)+' '+t+'</div>';
  h+='</div>';
  h+='<div class="codexSection"><div class="codexHd">🛠 クラフトレシピ</div>';
  for(const r of CRAFT_RECIPES)h+='<div class="codexRow"><span>'+r.name+'</span><span class="codexCost">'+r.desc+'</span></div>';
  h+='</div>';
  h+='<div class="codexSection"><div class="codexHd">⚔ 武器</div>';
  for(const w of WEAPONS)h+='<div class="codexRow"><span>'+w.name+'</span><span class="codexCost">DMG '+w.dmg+' / '+w.type+'</span></div>';
  h+='</div>';
  $codexBody.innerHTML=h;
}
function openCodex(){renderCodex();setPanel($codexPanel,true);}
function closeCodex(){setPanel($codexPanel,false);}
if($codexBtn)bindTapSafe($codexBtn,openCodex);
if($pauseCodexBtn)bindTapSafe($pauseCodexBtn,openCodex);
if($codexCloseBtn)bindTapSafe($codexCloseBtn,closeCodex);

// ═══ AUDIO ═══
let audioCtx=null;
function initAudio(){if(!audioCtx){try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){return;}}if(audioCtx.state==='suspended'){audioCtx.resume().catch(()=>{});}}
function playTone(f,d,v,t){if(settings.sfxMuted)return;initAudio();if(!audioCtx||audioCtx.state!=='running')return;try{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=t||'square';o.frequency.value=f;g.gain.setValueAtTime(v||.1,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+(d||.1));o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+(d||.1));}catch(e){}}
const sfxHit=()=>playTone(220,.08,.12);
const sfxKill=()=>{playTone(440,.05,.15);setTimeout(()=>playTone(660,.1,.12),60);};
const sfxBreak=()=>playTone(160,.06,.08,'sawtooth');
const sfxPlace=()=>playTone(600,.04,.06,'sine');
const sfxDmg=()=>playTone(100,.15,.18,'sawtooth');
const sfxLava=()=>playTone(60,.25,.2,'sawtooth');
const sfxSnow=()=>playTone(300,.1,.08,'sine');
const sfxJump=()=>{playTone(300,.06,.06,'sine');setTimeout(()=>playTone(400,.04,.05,'sine'),40);};
const sfxWave=()=>{playTone(180,.3,.15);setTimeout(()=>playTone(120,.3,.12),200);};
const sfxBow=()=>{playTone(800,.12,.1,'triangle');setTimeout(()=>playTone(600,.06,.06,'triangle'),50);};
const sfxMagic=()=>{playTone(260,.35,.12,'sine');setTimeout(()=>playTone(520,.2,.08,'sine'),100);};
const sfxSword=()=>playTone(350,.08,.1,'sawtooth');
const sfxHammer=()=>{playTone(120,.15,.14,'sawtooth');setTimeout(()=>playTone(80,.1,.1,'square'),60);};
const sfxBossAppear=()=>{for(let i=0;i<4;i++)setTimeout(()=>playTone(80+i*30,.5,.25,'sawtooth'),i*150);};
const sfxBossDmg=()=>{playTone(60,.2,.3,'sawtooth');setTimeout(()=>playTone(90,.15,.2,'square'),80);};
const sfxBossDie=()=>{for(let i=0;i<6;i++)setTimeout(()=>{playTone(400-i*40,.3,.3,'sawtooth');playTone(200-i*20,.3,.2,'square');},i*120);};
const sfxCharge=()=>{playTone(150,.5,.2,'sawtooth');setTimeout(()=>playTone(300,.3,.15,'sawtooth'),200);};
const sfxDiamondStaff=()=>{playTone(2400,.1,.12,'sine');setTimeout(()=>playTone(3200,.07,.08,'sine'),70);setTimeout(()=>playTone(1800,.06,.06,'sine'),140);};
const sfxOink=()=>{playTone(350,.12,.08,'sine');setTimeout(()=>playTone(280,.1,.06,'sine'),80);};
const sfxEnterUnder=()=>{[400,300,220,160,100].forEach((f,i)=>setTimeout(()=>playTone(f,.18,.07,'sine'),i*90));};
const sfxExitUnder=()=>{[100,160,220,300,440].forEach((f,i)=>setTimeout(()=>playTone(f,.15,.06,'sine'),i*80));};
const sfxKillDragon=()=>{[500,600,700,800,1000,1300].forEach((f,i)=>setTimeout(()=>playTone(f,.35,.18,'sine'),i*100));setTimeout(()=>playTone(60,.8,.25,'sawtooth'),200);};

// ═══ BGM ═══
let bgmNodes=[],bgmSeqTimer=null,bgmBiome=-1,bgmBoss=false,bgmWave=false,bgmUnder=false,bgmUnderDragon=false;
function stopBgm(){stopSeq();bgmNodes.forEach(n=>{try{n.stop(audioCtx.currentTime+.05);}catch(e){}});bgmNodes=[];}
function stopSeq(){if(bgmSeqTimer){clearInterval(bgmSeqTimer);bgmSeqTimer=null;}}
function bgmOsc(freq,type,vol){if(settings.bgmMuted||!audioCtx||audioCtx.state!=='running')return null;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type||'sine';o.frequency.value=freq;g.gain.value=vol||.02;o.connect(g);g.connect(audioCtx.destination);o.start();bgmNodes.push(o);return o;}
function bgmNote(freq,dur,vol,type){if(settings.bgmMuted||!audioCtx||audioCtx.state!=='running')return;try{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type||'sine';o.frequency.value=freq;g.gain.setValueAtTime(vol||.04,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);}catch(e){}}
function bgmSeq(notes,interval,vol,type){let i=0;bgmSeqTimer=setInterval(()=>{if(!audioCtx||audioCtx.state!=='running')return;const f=notes[i%notes.length];if(f>0)bgmNote(f,interval*.9/1000,vol,type);i++;},interval);}
function startBgm(m){
  if(settings.bgmMuted){stopBgm();return;}
  initAudio();stopBgm();if(!audioCtx||audioCtx.state!=='running')return;
  if(m==='boss'){bgmOsc(36,'sine',.022);bgmOsc(54,'triangle',.012);bgmSeq([36,0,36,41,0,33,36,0,36,0,41,36,0,36,0,0],170,.04,'triangle');}
  else if(m==='wave'){bgmOsc(55,'sine',.018);bgmOsc(82,'triangle',.01);bgmSeq([110,0,110,82,110,0,82,0],190,.035,'triangle');}
  else if(m===0){bgmOsc(55,'sine',.018);bgmOsc(110,'triangle',.012);bgmSeq([261,294,330,349,392,349,330,294],580,.028,'triangle');}
  else if(m===1){bgmOsc(41,'sine',.018);bgmOsc(82,'sine',.01);bgmSeq([196,0,0,220,0,174,0,0],880,.022,'sine');}
  else if(m===2){bgmOsc(65,'sine',.016);bgmOsc(130,'sine',.01);bgmSeq([261,311,392,466,392,311,261,233],490,.024,'sine');}
  else if(m===3){bgmOsc(49,'sine',.018);bgmOsc(98,'triangle',.01);bgmSeq([98,0,0,73,0,98,0,0],270,.032,'triangle');}
  else if(m===4){bgmOsc(36,'sine',.02);bgmOsc(54,'triangle',.012);bgmSeq([55,0,55,0,41,0,55,0,0,55,0,41,55,0,0,0],210,.035,'triangle');}
  else if(m===5){bgmOsc(65,'sine',.016);bgmOsc(130,'sine',.01);bgmSeq([261,0,311,0,261,0,233,0,261,0,294,0,261,0,0,0],650,.022,'sine');}
  else if(m==='under'){bgmOsc(29,'sine',.028);bgmOsc(43,'sine',.014);bgmOsc(58,'sine',.007);bgmSeq([55,0,0,0,0,49,0,0,0,0,55,0,0,41,0,0],750,.018,'sine');}
  else if(m==='under_dragon'){bgmOsc(24,'sine',.032);bgmOsc(36,'sawtooth',.01);bgmOsc(48,'triangle',.008);bgmSeq([36,0,36,0,33,0,36,0,29,0,0,0,36,0,33,29],220,.028,'sawtooth');}
}
function updateBgm(biome,isUnder){
  if(settings.bgmMuted){if(bgmNodes.length||bgmSeqTimer)stopBgm();return;}
  if(!audioCtx||audioCtx.state!=='running')return;
  // 地下ドラゴン戦が最優先
  if(isUnder&&dragon){if(!bgmUnderDragon){bgmUnderDragon=true;bgmUnder=false;bgmBoss=false;bgmWave=false;bgmBiome=-1;startBgm('under_dragon');}return;}
  if(bgmUnderDragon){bgmUnderDragon=false;bgmBiome=-1;}
  // 地上ボス戦
  if(boss&&!isUnder){if(!bgmBoss){bgmBoss=true;bgmUnder=false;bgmWave=false;bgmBiome=-1;startBgm('boss');}return;}
  if(bgmBoss){bgmBoss=false;bgmBiome=-1;}
  // 地下 ambient
  if(isUnder){if(!bgmUnder){bgmUnder=true;bgmWave=false;bgmBiome=-1;startBgm('under');}return;}
  if(bgmUnder){bgmUnder=false;bgmBiome=-1;}
  // 地上ウェーブ
  const waveActive=enemies.length>3;
  if(waveActive){if(!bgmWave){bgmWave=true;bgmBiome=-1;startBgm('wave');}return;}
  if(bgmWave){bgmWave=false;bgmBiome=-1;}
  if(biome!==bgmBiome){bgmBiome=biome;startBgm(biome);}
}

// ═══ THREE ═══
const canvas=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'low-power'});
renderer.shadowMap.enabled=false;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.setClearColor(0x0b0f17);
let SHADOWS_ON=false;
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x0b0f17,20,60);
const camera=new THREE.PerspectiveCamera(72,1,.05,130);
function resize(){
  const w=document.documentElement.clientWidth||window.innerWidth,h=document.documentElement.clientHeight||window.innerHeight;
  canvas.width=w;canvas.height=h;camera.aspect=w/h;camera.updateProjectionMatrix();
  renderer.setPixelRatio(isTouch?1:Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(w,h,false);
}
window.addEventListener('resize',resize);window.addEventListener('orientationchange',()=>{setTimeout(resize,100);setTimeout(resize,300);});
if(window.visualViewport)window.visualViewport.addEventListener('resize',resize);
resize();setTimeout(resize,50);setTimeout(resize,300);setTimeout(resize,800);
const hemLight=new THREE.HemisphereLight(0xbfdcff,0x1a1f2a,.9);scene.add(hemLight);
const sun=new THREE.DirectionalLight(0xffffff,1);sun.position.set(10,18,8);scene.add(sun);
scene.add(sun.target);
const SHADOW_R=20;
sun.shadow.mapSize.width=1024;sun.shadow.mapSize.height=1024;
sun.shadow.camera.left=-SHADOW_R;sun.shadow.camera.right=SHADOW_R;sun.shadow.camera.top=SHADOW_R;sun.shadow.camera.bottom=-SHADOW_R;
sun.shadow.camera.near=1;sun.shadow.camera.far=150;
sun.shadow.bias=-0.0005;sun.shadow.normalBias=0.05;
scene.add(new THREE.AmbientLight(0x112233,.4));
// ─── SKY: gradient dome + square sun/moon + drifting clouds ───
function _skyGradTex(){
  const c=document.createElement('canvas');c.width=1;c.height=64;const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,64); // canvas top = zenith (uv.y=1)
  g.addColorStop(0,'rgb(106,118,170)');g.addColorStop(.45,'rgb(255,255,255)');g.addColorStop(1,'rgb(255,255,255)');
  x.fillStyle=g;x.fillRect(0,0,1,64);
  return new THREE.CanvasTexture(c);
}
const skyMesh=new THREE.Mesh(new THREE.SphereGeometry(110,12,6),new THREE.MeshBasicMaterial({color:0x0b1a3b,map:_skyGradTex(),side:THREE.BackSide,fog:false,depthWrite:false}));scene.add(skyMesh);
function _celestTex(core,edge){
  const c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d');
  x.fillStyle=edge;x.fillRect(0,0,16,16);x.fillStyle=core;x.fillRect(2,2,12,12);
  const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;return t;
}
const sunSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:_celestTex('#fff6c8','#ffd75e'),transparent:true,opacity:.95,fog:false,depthWrite:false}));
sunSprite.scale.set(14,14,1);sunSprite.visible=false;scene.add(sunSprite);
const moonSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:_celestTex('#e8ecf5','#9aa4c0'),transparent:true,opacity:.9,fog:false,depthWrite:false}));
moonSprite.scale.set(9,9,1);moonSprite.visible=false;scene.add(moonSprite);
const cloudGroup=new THREE.Group();scene.add(cloudGroup);
const cloudMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.42,fog:false,depthWrite:false});
const CLOUD_Y=46,CLOUD_RANGE=150;
(function(){
  const g=new THREE.BoxGeometry(1,1,1);
  for(let i=0;i<26;i++){
    const m=new THREE.Mesh(g,cloudMat);
    m.scale.set(9+Math.random()*16,.8,6+Math.random()*10);
    m.position.set((Math.random()*2-1)*CLOUD_RANGE,CLOUD_Y+Math.random()*6,(Math.random()*2-1)*CLOUD_RANGE);
    cloudGroup.add(m);
  }
})();
// night stars: points on the upper sky dome, fading in with darkness and
// slowly rotating with the day cycle like the real Minecraft sky
const starPivot=new THREE.Group();scene.add(starPivot);
const starMat=new THREE.PointsMaterial({color:0xffffff,size:1.0,sizeAttenuation:true,transparent:true,opacity:0,fog:false,depthWrite:false});
(function(){
  const N=320,pos=new Float32Array(N*3);
  for(let i=0;i<N;i++){
    // random direction biased to the upper hemisphere
    let x,y,z,l;
    do{x=Math.random()*2-1;y=Math.random();z=Math.random()*2-1;l=Math.hypot(x,y,z);}while(l>1||l<.2||y/l<.06);
    pos[i*3]=x/l*100;pos[i*3+1]=y/l*100;pos[i*3+2]=z/l*100;
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const stars=new THREE.Points(g,starMat);stars.frustumCulled=false;stars.renderOrder=1;
  starPivot.add(stars);
})();

// ═══ NOISE ═══
function makeNoise(seed){const p=new Uint8Array(512);let s=seed||42;function r(){s=(s*16807+0)%2147483647;return(s&0x7fffffff)/2147483647;}const t=new Uint8Array(256);for(let i=0;i<256;i++)t[i]=i;for(let i=255;i>0;i--){const j=(r()*i)|0;const tmp=t[i];t[i]=t[j];t[j]=tmp;}for(let i=0;i<512;i++)p[i]=t[i&255];const g=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];function dot2(gi,x,y){const v=g[gi%8];return v[0]*x+v[1]*y;}function fade(t){return t*t*t*(t*(t*6-15)+10);}function lerp(a,b,t){return a+t*(b-a);}return function(x,y){const X=Math.floor(x)&255,Y=Math.floor(y)&255;x-=Math.floor(x);y-=Math.floor(y);const u=fade(x),v=fade(y);const a=p[X]+Y,b=p[X+1]+Y;return lerp(lerp(dot2(p[a],x,y),dot2(p[b],x-1,y),u),lerp(dot2(p[a+1],x,y-1),dot2(p[b+1],x-1,y-1),u),v);};}
let WORLD_SEED=Math.floor(Math.random()*999999);
let noise=makeNoise(WORLD_SEED),noiseB=makeNoise(WORLD_SEED+11111),noiseV=makeNoise(WORLD_SEED+22222);
function initWorldNoise(seed){WORLD_SEED=seed;noise=makeNoise(seed);noiseB=makeNoise(seed+11111);noiseV=makeNoise(seed+22222);}
function fbm(x,z,oct){let v=0,amp=1,freq=1,mx=0;for(let i=0;i<oct;i++){v+=noise(x*freq,z*freq)*amp;mx+=amp;amp*=.5;freq*=2;}return v/mx;}
function hash2i(x,z,seed){seed=seed||1337;let h=(Math.imul(x,374761393)+Math.imul(z,668265263))^seed;h=Math.imul(h^(h>>>13),1274126177);return(h^(h>>>16))>>>0;}
function rand2(x,z,seed){return hash2i(x|0,z|0,seed)/4294967296;}
function rand3(x,y,z,seed){seed=seed||1337;let h=(Math.imul(x,374761393)+Math.imul(z,668265263)+Math.imul(y,1013904223))^seed;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}

// ═══ WORLD ═══
const CHUNK=16,CHUNK_Y=8,WORLD_R=48;
const WORLD_CY_MIN=-4,WORLD_CY_MAX=2; // underground (-32) to mountain tops (+16)
const DRAW_RY=isTouch?1:2;
const BLOCK_COLORS=[0x4caf50,0x8a8f98,0xd9c27a,0x5d4037,0xef9a9a,0x2e7d32,0x78909c,0x1a0a00,0xff4500,0xddeeff,0x1565c0,0x6b4226,0x1e1e1e,0x2a2e3d,0x8b4513,0x00e5ff];
// [grass,stone,sand,wood,brick,forest-grass,grey-stone,volcano-rock,lava,snow,water,cave-dirt,coal-ore,deep-stone,iron-ore,diamond-ore]
const BLOCK_HARDNESS=[1,3,1,2,4,1,3,99,99,1,99,1,2,4,5,6];
const LAVA_BLOCK=8,SNOW_BLOCK=9,WATER_BLOCK=10,CAVE_DIRT=11,COAL_ORE=12,DEEP_STONE=13,IRON_ORE=14,DIAMOND_ORE=15;
const boxGeo=new THREE.BoxGeometry(1,1,1);
// Minecraft-style face shading baked into the shared geometry's vertex colors:
// top bright, N/S sides mid, E/W darker, bottom darkest.
// BoxGeometry face order: +x,-x,+y(top),-y(bottom),+z,-z — 4 verts per face.
(function(){
  const FACE_SHADE=[.72,.72,1,.55,.86,.86];
  const cols=new Float32Array(24*3);
  for(let f=0;f<6;f++){const s=FACE_SHADE[f];for(let v=0;v<4;v++){const o=(f*4+v)*3;cols[o]=cols[o+1]=cols[o+2]=s;}}
  boxGeo.setAttribute('color',new THREE.BufferAttribute(cols,3));
})();
// ─── VERTEX AO (Minecraft-style smooth lighting) ───
// Each visible block corner is darkened by how many solid neighbours surround
// it (classic side1/side2/corner rule). AO is baked into a per-block vertex
// color attribute; geometries are cached by AO pattern and share
// position/normal/uv/index with boxGeo, so flat terrain reuses a handful of
// geometries and memory stays low. Recomputed locally when blocks change.
const AO_LEVEL=[1,.76,.58,.45];
boxGeo.computeBoundingSphere();boxGeo.computeBoundingBox();
const _aoCache=new Map();
const _aoTmp=new Uint8Array(24);
const _occ27=new Uint8Array(27);
function _aoOccluder(x,y,z){const v=voxels[vKey(x,y,z)];return(v&&v.ti!==WATER_BLOCK)?1:0;}
// fills _aoTmp with per-vertex occlusion levels (0-3); returns false if the
// block is fully buried (no exposed face → keep the plain shared geometry)
function _computeBlockAO(x,y,z){
  let i=0;
  for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)_occ27[i++]=_aoOccluder(x+dx,y+dy,z+dz);
  const at=(dx,dy,dz)=>_occ27[(dy+1)*9+(dz+1)*3+(dx+1)];
  if(at(1,0,0)&&at(-1,0,0)&&at(0,1,0)&&at(0,-1,0)&&at(0,0,1)&&at(0,0,-1))return false;
  const pos=boxGeo.getAttribute('position'),norm=boxGeo.getAttribute('normal');
  for(let v=0;v<24;v++){
    const nx=norm.getX(v),ny=norm.getY(v),nz=norm.getZ(v);
    const px=pos.getX(v)>0?1:-1,py=pos.getY(v)>0?1:-1,pz=pos.getZ(v)>0?1:-1;
    let s1,s2,c;
    if(nx!==0){s1=at(nx,py,0);s2=at(nx,0,pz);c=at(nx,py,pz);}
    else if(ny!==0){s1=at(px,ny,0);s2=at(0,ny,pz);c=at(px,ny,pz);}
    else{s1=at(px,0,nz);s2=at(0,py,nz);c=at(px,py,nz);}
    _aoTmp[v]=(s1&&s2)?3:s1+s2+c;
  }
  return true;
}
function _aoGeometryFor(x,y,z){
  if(!_computeBlockAO(x,y,z))return boxGeo;
  let key='',any=false;
  for(let v=0;v<24;v++){key+=_aoTmp[v];if(_aoTmp[v])any=true;}
  if(!any)return boxGeo;
  let g=_aoCache.get(key);
  if(!g){
    if(_aoCache.size>20000)_aoCache.clear(); // safety valve; in-use geometries stay referenced by meshes
    g=new THREE.BufferGeometry();
    g.setIndex(boxGeo.getIndex());
    g.setAttribute('position',boxGeo.getAttribute('position'));
    g.setAttribute('normal',boxGeo.getAttribute('normal'));
    g.setAttribute('uv',boxGeo.getAttribute('uv'));
    const base=boxGeo.getAttribute('color'),cols=new Float32Array(72);
    for(let v=0;v<24;v++){const f=base.getX(v)*AO_LEVEL[_aoTmp[v]];cols[v*3]=cols[v*3+1]=cols[v*3+2]=f;}
    g.setAttribute('color',new THREE.BufferAttribute(cols,3));
    for(const gr of boxGeo.groups)g.addGroup(gr.start,gr.count,gr.materialIndex);
    g.boundingSphere=boxGeo.boundingSphere;g.boundingBox=boxGeo.boundingBox;
    _aoCache.set(key,g);
  }
  return g;
}
function refreshBlockAO(x,y,z){
  const v=voxels[vKey(x,y,z)];if(!v)return;
  if(v.ti===WATER_BLOCK||v.ti===LAVA_BLOCK)return; // untinted / glowing blocks keep flat shading
  v.mesh.geometry=_aoGeometryFor(x,y,z);
}
function refreshAOAround(x,y,z,includeSelf){
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
    if(!includeSelf&&dx===0&&dy===0&&dz===0)continue;
    refreshBlockAO(x+dx,y+dy,z+dz);
  }
}
function _applyAOToMeshes(meshes){
  for(const m of meshes){const d=m.userData;refreshBlockAO(d.x,d.y,d.z);}
}
// re-shade one boundary plane of an already-generated neighbour chunk after a
// new chunk appears next to it (its border AO was computed without us)
function _refreshPlaneAO(meshes,axis,value){
  for(const m of meshes){const d=m.userData;if((axis==='x'?d.x:axis==='z'?d.z:d.y)===value)refreshBlockAO(d.x,d.y,d.z);}
}
// ─── PIXEL-ART BLOCK TEXTURES (Minecraft style) ───
// 16x16 procedural textures rendered to canvas, sampled with NearestFilter for
// crisp blocky pixels instead of flat solid colours.
const TEX_SIZE=16;
function _shade(hex,f){ // f: -1..1, negative darkens, positive lightens
  let r=(hex>>16)&255,g=(hex>>8)&255,b=hex&255;
  if(f>=0){r+=(255-r)*f;g+=(255-g)*f;b+=(255-b)*f;}else{r*=(1+f);g*=(1+f);b*=(1+f);}
  return 'rgb('+(r|0)+','+(g|0)+','+(b|0)+')';
}
function _texCtx(){const c=document.createElement('canvas');c.width=c.height=TEX_SIZE;return[c,c.getContext('2d')];}
function _mkTex(c){
  // fake ambient occlusion: darken the outer pixels so each block reads as its own cube
  const x=c.getContext('2d'),s=TEX_SIZE;
  x.fillStyle='rgba(0,0,0,.16)';x.fillRect(0,0,s,1);x.fillRect(0,s-1,s,1);x.fillRect(0,1,1,s-2);x.fillRect(s-1,1,1,s-2);
  x.fillStyle='rgba(0,0,0,.07)';x.fillRect(1,1,s-2,1);x.fillRect(1,s-2,s-2,1);x.fillRect(1,2,1,s-4);x.fillRect(s-2,2,1,s-4);
  const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapNearestFilter;return t;
}
function _rng(seed){let s=seed>>>0||1;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
// speckled solid block (stone, sand, dirt, snow…)
function noisyTex(base,seed,amt){
  amt=amt==null?.14:amt;const[c,x]=_texCtx();const r=_rng(seed);
  for(let j=0;j<TEX_SIZE;j++)for(let i=0;i<TEX_SIZE;i++){
    const v=r();let f=0;
    if(v<.22)f=amt;else if(v<.44)f=-amt;else if(v<.5)f=-amt*1.8;
    x.fillStyle=_shade(base,f);x.fillRect(i,j,1,1);
  }
  return _mkTex(c);
}
// grass/dirt side: dirt body with a jagged grassy fringe along the top
function grassSideTex(grassCol,dirtCol,seed){
  const[c,x]=_texCtx();const r=_rng(seed);
  for(let j=0;j<TEX_SIZE;j++)for(let i=0;i<TEX_SIZE;i++){
    const v=r();x.fillStyle=_shade(dirtCol,v<.3?.12:v<.55?-.12:0);x.fillRect(i,j,1,1);
  }
  for(let i=0;i<TEX_SIZE;i++){
    const h=3+Math.floor(r()*2);
    for(let j=0;j<h;j++){const v=r();x.fillStyle=_shade(grassCol,v<.4?.12:v<.7?-.1:0);x.fillRect(i,j,1,1);}
  }
  return _mkTex(c);
}
// wood log bark: vertical streaks
function logSideTex(base,seed){
  const[c,x]=_texCtx();const r=_rng(seed);
  for(let i=0;i<TEX_SIZE;i++){
    const col=(r()-.5)*.18;
    for(let j=0;j<TEX_SIZE;j++){const v=r();x.fillStyle=_shade(base,col+(v<.18?-.1:v<.28?.08:0));x.fillRect(i,j,1,1);}
  }
  return _mkTex(c);
}
// wood log end: concentric growth rings
function logTopTex(base,seed){
  const[c,x]=_texCtx();
  for(let j=0;j<TEX_SIZE;j++)for(let i=0;i<TEX_SIZE;i++){
    const dx=i-7.5,dy=j-7.5,d=Math.sqrt(dx*dx+dy*dy),ring=Math.sin(d*1.9);
    x.fillStyle=_shade(base,d<1.4?-.2:ring>.3?.12:ring<-.3?-.14:0);x.fillRect(i,j,1,1);
  }
  return _mkTex(c);
}
// brick wall with mortar lines, staggered rows
function brickTex(base,seed){
  const[c,x]=_texCtx();const r=_rng(seed);
  for(let j=0;j<TEX_SIZE;j++)for(let i=0;i<TEX_SIZE;i++){const v=r();x.fillStyle=_shade(base,v<.3?.08:v<.5?-.08:0);x.fillRect(i,j,1,1);}
  x.fillStyle=_shade(base,-.5);
  for(let y=0;y<TEX_SIZE;y+=4)x.fillRect(0,y,TEX_SIZE,1);
  for(let y=0;y<TEX_SIZE;y+=4){const off=((y/4)%2)===0?0:4;for(let xx=off;xx<TEX_SIZE;xx+=8)x.fillRect(xx,y,1,4);}
  return _mkTex(c);
}
// ore: stone body sprinkled with mineral blobs
function oreTex(stoneCol,oreCol,seed){
  const[c,x]=_texCtx();const r=_rng(seed);
  for(let j=0;j<TEX_SIZE;j++)for(let i=0;i<TEX_SIZE;i++){const v=r();x.fillStyle=_shade(stoneCol,v<.3?.1:v<.55?-.12:0);x.fillRect(i,j,1,1);}
  const pts=[[0,0],[1,0],[0,1],[1,1],[2,1],[1,2]];
  for(let b=0;b<6;b++){
    const bx=1+Math.floor(r()*(TEX_SIZE-3)),by=1+Math.floor(r()*(TEX_SIZE-3)),n=2+Math.floor(r()*4);
    for(let p=0;p<n;p++){const o=pts[Math.floor(r()*pts.length)];x.fillStyle=_shade(oreCol,r()<.5?0:.18);x.fillRect(bx+o[0],by+o[1],1,1);}
  }
  return _mkTex(c);
}
// vertexColors picks up the face shading baked into boxGeo
function smat(map,extra){return new THREE.MeshStandardMaterial(Object.assign({map,roughness:.9,metalness:.05,vertexColors:true},extra||{}));}
const _T={
  grassTop:noisyTex(0x6fb13a,11,.13), grassSide:grassSideTex(0x6fb13a,0x7a5230,12), dirt:noisyTex(0x7a5230,13,.14),
  forestTop:noisyTex(0x3f9a3a,14,.13), forestSide:grassSideTex(0x3f9a3a,0x5d4a28,15),
  stone:noisyTex(0x8a8f98,21,.12), sand:noisyTex(0xd9c27a,22,.1),
  logSide:logSideTex(0x6b4a2f,23), logTop:logTopTex(0x9a7a4f,24), brick:brickTex(0xc05a4a,25),
  greyStone:noisyTex(0x78909c,26,.12), volcano:noisyTex(0x1a0a00,27,.5), snow:noisyTex(0xeef3ff,28,.06),
  caveDirt:noisyTex(0x6b4226,29,.14), coal:oreTex(0x8a8f98,0x1a1a1a,30), deepStone:noisyTex(0x2a2e3d,31,.18),
  iron:oreTex(0x8a8f98,0xcaa472,32), diamond:oreTex(0x7fb6c8,0x3fe0ff,33), lava:noisyTex(0xff4500,34,.22),
};
// BoxGeometry group order: +x,-x,+y(top),-y(bottom),+z,-z
function faceMats(side,top,bottom){const s=smat(side);return[s,s,smat(top),smat(bottom),s,s];}
const blockMats=BLOCK_COLORS.map((c,i)=>{
  switch(i){
    case 0: return faceMats(_T.grassSide,_T.grassTop,_T.dirt);
    case 1: return smat(_T.stone);
    case 2: return smat(_T.sand);
    case 3: return faceMats(_T.logSide,_T.logTop,_T.logTop);
    case 4: return smat(_T.brick);
    case 5: return faceMats(_T.forestSide,_T.forestTop,_T.dirt);
    case 6: return smat(_T.greyStone);
    case 7: return smat(_T.volcano,{roughness:.3,metalness:.4,emissive:0x330000,emissiveIntensity:.3});
    case LAVA_BLOCK: return smat(_T.lava,{roughness:.8,emissive:0xff2200,emissiveIntensity:1.2,vertexColors:false}); // glows evenly, no face shading
    case SNOW_BLOCK: return smat(_T.snow,{roughness:.3,metalness:.1,emissive:0x8899bb,emissiveIntensity:.08});
    case WATER_BLOCK: return new THREE.MeshStandardMaterial({color:c,roughness:.1,metalness:.2,transparent:true,opacity:.78,emissive:0x003366,emissiveIntensity:.12,vertexColors:true});
    case CAVE_DIRT: return smat(_T.caveDirt);
    case COAL_ORE: return smat(_T.coal,{roughness:.95,metalness:.05,emissive:0x111111,emissiveIntensity:.05});
    case DEEP_STONE: return smat(_T.deepStone,{roughness:.8,metalness:.15,emissive:0x0a0d1a,emissiveIntensity:.1});
    case IRON_ORE: return smat(_T.iron,{roughness:.7,metalness:.35,emissive:0x3a1500,emissiveIntensity:.08});
    case DIAMOND_ORE: return smat(_T.diamond,{roughness:.15,metalness:.7,emissive:0x00aaff,emissiveIntensity:.45,transparent:true,opacity:.95});
    default: return new THREE.MeshStandardMaterial({color:c,roughness:.9,metalness:.05,vertexColors:true});
  }
});
function applyShadowSetting(){
  SHADOWS_ON=!!settings.shadows;
  renderer.shadowMap.enabled=SHADOWS_ON;
  sun.castShadow=SHADOWS_ON;
  const bump=m=>{if(m)m.needsUpdate=true;};
  for(const bm of blockMats){if(Array.isArray(bm))bm.forEach(bump);else bump(bm);}
  scene.traverse(o=>{if(o.isMesh){if(Array.isArray(o.material))o.material.forEach(bump);else bump(o.material);}});
}
applyShadowSetting();
// ─── WATER: recessed surface + shader waves ───
// Water blocks use a shorter box (top at 14/16 like Minecraft) so the surface
// sits below the neighbouring land, and the top vertices bob on a world-space
// sine field injected into the shared material — adjacent water blocks form
// one continuous wave with zero per-frame JS cost.
const waterGeo=new THREE.BoxGeometry(1,.875,1);
waterGeo.translate(0,-.0625,0); // top at +0.375 (block-top −0.125), bottom flush
waterGeo.setAttribute('color',boxGeo.getAttribute('color')); // reuse face shading
waterGeo.computeBoundingSphere();waterGeo.computeBoundingBox();
let _waterUniforms=null;
blockMats[WATER_BLOCK].onBeforeCompile=(sh)=>{
  sh.uniforms.uTime={value:0};
  _waterUniforms=sh.uniforms;
  sh.vertexShader='uniform float uTime;\n'+sh.vertexShader.replace(
    '#include <begin_vertex>',
    ['#include <begin_vertex>',
     'vec4 jkW=modelMatrix*vec4(position,1.0);',
     'if(position.y>0.3){transformed.y+=sin(jkW.x*1.9+uTime*1.8)*.05+cos(jkW.z*1.6+uTime*2.2)*.04;}'
    ].join('\n'));
};
// give the hotbar swatches the matching pixel-art look
(function(){
  const swatch=[_T.grassTop,_T.stone,_T.sand,_T.logSide,_T.brick];
  document.querySelectorAll('.hslot .dot').forEach((dot,i)=>{
    const t=swatch[i];if(!t||!t.image)return;
    dot.style.backgroundImage='url('+t.image.toDataURL()+')';
    dot.style.backgroundSize='cover';dot.style.imageRendering='pixelated';
  });
})();
let voxels={},blockMeshes=new Set(),lavaBlocks=new Set();
const vKey=(x,y,z)=>x+'|'+y+'|'+z;const cKey=(cx,cz)=>cx+','+cz;const ucKey=(cx,cy,cz)=>cx+','+cy+','+cz;
let chunks={},activeChunks={};
let underChunks={},activeUnderChunks={};

const BIOMES={PLAINS:0,DESERT:1,FOREST:2,MOUNTAIN:3,VOLCANO:4,SNOW:5};
function getBiome(wx,wz){
  const b1=noiseB(wx*0.008,wz*0.008),b2=noiseB(wx*0.012+100,wz*0.012+100);
  const bv=noiseV(wx*0.012+50,wz*0.012-50),bs=noiseV(wx*0.009-80,wz*0.009+80);
  if(bv>0.15)return BIOMES.VOLCANO;if(bs>0.22)return BIOMES.SNOW;
  if(b1>0.25)return BIOMES.MOUNTAIN;if(b2<-0.2)return BIOMES.DESERT;
  if(b1<-0.15&&b2>0)return BIOMES.FOREST;return BIOMES.PLAINS;
}
function getBiomeName(b){return['🌿 PLAINS','🏜 DESERT','🌲 FOREST','🪨 MOUNTAIN','🌋 VOLCANO','❄ SNOW'][b];}
function getGroundType(biome){return[0,2,5,1,7,SNOW_BLOCK][biome];}
function getHeight(wx,wz){const biome=getBiome(wx,wz);let h=fbm(wx*0.03,wz*0.03,4);if(biome===BIOMES.MOUNTAIN)h=h*4+2;else if(biome===BIOMES.FOREST)h=h*1.5+0.3;else if(biome===BIOMES.DESERT)h=h*0.8;else if(biome===BIOMES.VOLCANO)h=h*3.5+1.5;else if(biome===BIOMES.SNOW)h=h*2.5+0.5;else h=h*1.2;return Math.max(0,Math.floor(h+1));}

function addBlock(x,y,z,ti,addToScene,playerPlaced){
  const k=vKey(x,y,z);if(voxels[k])return;
  const m=new THREE.Mesh(ti===WATER_BLOCK?waterGeo:boxGeo,blockMats[ti]);
  m.position.set(x+.5,y+.5,z+.5);
  m.castShadow=y>=0&&ti!==WATER_BLOCK;m.receiveShadow=true;
  m.userData={x,y,z,isBlock:true,ti,playerPlaced:!!playerPlaced};
  if(addToScene)scene.add(m);
  voxels[k]={mesh:m,ti,active:!!addToScene,playerPlaced:!!playerPlaced};
  if(addToScene){
    blockMeshes.add(m);if(ti===LAVA_BLOCK)lavaBlocks.add(k);
    const cx=Math.floor(x/CHUNK),cz=Math.floor(z/CHUNK);
    if(y<0){const cy=Math.floor(y/CHUNK_Y),ck=ucKey(cx,cy,cz);if(underChunks[ck])underChunks[ck].meshes.add(m);}
    else{const ck=cKey(cx,cz);if(chunks[ck])chunks[ck].meshes.add(m);}
    refreshAOAround(x,y,z,true); // placed live: shade self + re-shade neighbours
  }
  return m;
}
function removeBlock(x,y,z){const k=vKey(x,y,z);const v=voxels[k];if(!v)return;scene.remove(v.mesh);blockMeshes.delete(v.mesh);lavaBlocks.delete(k);const cx=Math.floor(x/CHUNK),cz=Math.floor(z/CHUNK);if(y<0){const cy=Math.floor(y/CHUNK_Y),ck=ucKey(cx,cy,cz);if(underChunks[ck])underChunks[ck].meshes.delete(v.mesh);}else{const ck=cKey(cx,cz);if(chunks[ck])chunks[ck].meshes.delete(v.mesh);}delete voxels[k];refreshAOAround(x,y,z,false);}

function generateChunk(cx,cz){
  const key=cKey(cx,cz);if(chunks[key])return;
  const meshes=new Set(),ox=cx*CHUNK,oz=cz*CHUNK;
  for(let lx=0;lx<CHUNK;lx++)for(let lz=0;lz<CHUNK;lz++){
    const wx=ox+lx,wz=oz+lz,h=getHeight(wx,wz),biome=getBiome(wx,wz);
    const lakeN=noise(wx*.05+777,wz*.05+777);
    const isLake=(biome===BIOMES.PLAINS&&h===0&&lakeN>0.25)||(biome===BIOMES.FOREST&&h===0&&lakeN>0.45);
    // lakes carve one block down: sandy bed below, water in the ground cell,
    // so the surface sits lower than the surrounding land (Minecraft-style)
    if(isLake){
      const mb=addBlock(wx,h-1,wz,2,false);if(mb)meshes.add(mb);
      const mw=addBlock(wx,h,wz,WATER_BLOCK,false);if(mw)meshes.add(mw);
    }else{
      const m=addBlock(wx,h,wz,getGroundType(biome),false);if(m)meshes.add(m);
    }
    const sub=biome===BIOMES.VOLCANO?7:biome===BIOMES.SNOW?SNOW_BLOCK:1;
    if(h>0){const m2=addBlock(wx,h-1,wz,sub,false);if(m2)meshes.add(m2);}
    if(biome===BIOMES.VOLCANO){
      if(rand2(wx,wz,30)<0.06){const lm=addBlock(wx,h,wz,LAVA_BLOCK,false);if(lm)meshes.add(lm);if(rand2(wx,wz,31)<0.5){const lm2=addBlock(wx,h+1,wz,LAVA_BLOCK,false);if(lm2)meshes.add(lm2);}}
      if(rand2(wx,wz,32)<0.05){const topH=2+Math.floor(rand2(wx,wz,33)*5);for(let rh=1;rh<=topH;rh++){const mr=addBlock(wx,h+rh,wz,7,false);if(mr)meshes.add(mr);}}
      if(rand2(wx,wz,34)<0.03){const mr=addBlock(wx,h+1,wz,7,false);if(mr)meshes.add(mr);const mr2=addBlock(wx,h+2,wz,7,false);if(mr2)meshes.add(mr2);}
    }
    if(biome===BIOMES.SNOW){
      if(rand2(wx,wz,40)<0.04){for(let th=1;th<=4;th++){const mt=addBlock(wx,h+th,wz,1,false);if(mt)meshes.add(mt);}for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const ml=addBlock(wx+dx,h+4,wz+dz,SNOW_BLOCK,false);if(ml)meshes.add(ml);}const top=addBlock(wx,h+5,wz,SNOW_BLOCK,false);if(top)meshes.add(top);}
      if(rand2(wx,wz,41)<0.03){const topH=1+Math.floor(rand2(wx,wz,42)*3);for(let rh=1;rh<=topH;rh++){const mr=addBlock(wx,h+rh,wz,SNOW_BLOCK,false);if(mr)meshes.add(mr);}}
    }
    if(biome===BIOMES.FOREST&&!isLake&&rand2(wx,wz,10)<0.06){for(let th=1;th<=3;th++){const mt=addBlock(wx,h+th,wz,3,false);if(mt)meshes.add(mt);}for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){if(dx===0&&dz===0){const ml=addBlock(wx,h+4,wz,5,false);if(ml)meshes.add(ml);}else{const ml=addBlock(wx+dx,h+3,wz+dz,5,false);if(ml)meshes.add(ml);}}}
    if(biome===BIOMES.PLAINS&&!isLake&&rand2(wx,wz,11)<0.008){for(let th=1;th<=3;th++){const mt=addBlock(wx,h+th,wz,3,false);if(mt)meshes.add(mt);}const ml=addBlock(wx,h+4,wz,0,false);if(ml)meshes.add(ml);[[-1,0],[1,0],[0,-1],[0,1]].forEach(([dx,dz])=>{const ml2=addBlock(wx+dx,h+3,wz+dz,0,false);if(ml2)meshes.add(ml2);});}
    if(biome===BIOMES.MOUNTAIN&&rand2(wx,wz,12)<0.04){const top=1+Math.floor(rand2(wx,wz,120)*3);for(let rh=1;rh<=top;rh++){const mr=addBlock(wx,h+rh,wz,6,false);if(mr)meshes.add(mr);}}
    if(biome===BIOMES.DESERT&&rand2(wx,wz,13)<0.01){for(let sh=1;sh<=2;sh++){const ms=addBlock(wx,h+sh,wz,0,false);if(ms)meshes.add(ms);}}
  }
  chunks[key]={meshes,loaded:true};
  // vertex AO: shade this chunk, then re-shade the facing border of any
  // already-generated neighbour (its edge AO was computed before we existed)
  _applyAOToMeshes(meshes);
  const west=chunks[cKey(cx-1,cz)],east=chunks[cKey(cx+1,cz)],north=chunks[cKey(cx,cz-1)],south=chunks[cKey(cx,cz+1)];
  if(west)_refreshPlaneAO(west.meshes,'x',ox-1);
  if(east)_refreshPlaneAO(east.meshes,'x',ox+CHUNK);
  if(north)_refreshPlaneAO(north.meshes,'z',oz-1);
  if(south)_refreshPlaneAO(south.meshes,'z',oz+CHUNK);
  const below=underChunks[ucKey(cx,-1,cz)];
  if(below)_refreshPlaneAO(below.meshes,'y',-1);
}
function showChunk(cx,cz){const key=cKey(cx,cz);if(!chunks[key]||activeChunks[key])return;for(const m of chunks[key].meshes){if(!m.parent)scene.add(m);const k=vKey(m.userData.x,m.userData.y,m.userData.z);if(voxels[k]){voxels[k].active=true;if(voxels[k].ti===LAVA_BLOCK)lavaBlocks.add(k);}blockMeshes.add(m);}activeChunks[key]=true;}
function hideChunk(cx,cz){const key=cKey(cx,cz);if(!activeChunks[key]||!chunks[key])return;for(const m of chunks[key].meshes){scene.remove(m);const k=vKey(m.userData.x,m.userData.y,m.userData.z);if(voxels[k]){voxels[k].active=false;lavaBlocks.delete(k);}blockMeshes.delete(m);}delete activeChunks[key];}
function showUnderChunk(cx,cy,cz){const key=ucKey(cx,cy,cz);if(!underChunks[key]||activeUnderChunks[key])return;for(const m of underChunks[key].meshes){if(!m.parent)scene.add(m);const k=vKey(m.userData.x,m.userData.y,m.userData.z);if(voxels[k]){voxels[k].active=true;if(voxels[k].ti===LAVA_BLOCK)lavaBlocks.add(k);}blockMeshes.add(m);}activeUnderChunks[key]=true;}
function hideUnderChunk(cx,cy,cz){const key=ucKey(cx,cy,cz);if(!activeUnderChunks[key]||!underChunks[key])return;for(const m of underChunks[key].meshes){scene.remove(m);const k=vKey(m.userData.x,m.userData.y,m.userData.z);if(voxels[k]){voxels[k].active=false;lavaBlocks.delete(k);}blockMeshes.delete(m);}delete activeUnderChunks[key];}
let lastPCX=null,lastPCZ=null,lastPCY=null;
function updateChunks(force){
  const pcx=Math.floor(P.x/CHUNK),pcz=Math.floor(P.z/CHUNK),pcy=Math.floor(P.y/CHUNK_Y);
  if(!force&&pcx===lastPCX&&pcz===lastPCZ&&pcy===lastPCY)return;
  lastPCX=pcx;lastPCZ=pcz;lastPCY=pcy;
  const needed={},neededU={};
  for(let dx=-DRAW_R;dx<=DRAW_R;dx++)for(let dz=-DRAW_R;dz<=DRAW_R;dz++){
    const cx=pcx+dx,cz=pcz+dz;
    if(cx<-WORLD_R||cx>=WORLD_R||cz<-WORLD_R||cz>=WORLD_R)continue;
    const sk=cKey(cx,cz);needed[sk]=true;if(!chunks[sk])generateChunk(cx,cz);showChunk(cx,cz);
    const uk1=ucKey(cx,-1,cz);neededU[uk1]=true;if(!underChunks[uk1])generateUnderChunk(cx,-1,cz);showUnderChunk(cx,-1,cz);
    if(P.y<0){for(let dy=0;dy<=DRAW_RY;dy++){const cy=pcy-dy;if(cy>=-1||cy<WORLD_CY_MIN)continue;const uk=ucKey(cx,cy,cz);neededU[uk]=true;if(!underChunks[uk])generateUnderChunk(cx,cy,cz);showUnderChunk(cx,cy,cz);}}
  }
  for(const key in activeChunks){if(!needed[key]){const[cx,cz]=key.split(',').map(Number);hideChunk(cx,cz);}}
  for(const key in activeUnderChunks){if(!neededU[key]){const[cx,cy,cz]=key.split(',').map(Number);hideUnderChunk(cx,cy,cz);}}
}
function clearWorld(){for(const key in chunks)for(const m of chunks[key].meshes)scene.remove(m);for(const key in underChunks)for(const m of underChunks[key].meshes)scene.remove(m);chunks={};activeChunks={};underChunks={};activeUnderChunks={};voxels={};blockMeshes=new Set();lavaBlocks.clear();lastPCX=null;lastPCZ=null;lastPCY=null;}

// ─── UNDERGROUND GENERATION ───
function _underRoomType(rx,ry,rz){
  const cd=-(ry*8+4);if(cd<9||cd>32)return 0;
  const r=rand3(rx,ry+5000,rz,WORLD_SEED+99887);
  if(cd>=10&&cd<=22&&r<0.04)return 1; // mine room
  if(cd>22&&r<0.032)return 2;          // altar room
  return 0;
}
function _isRoomVoid(wx,wy,wz){
  const depth=-wy;if(depth<9||depth>32)return false;
  const rx=Math.floor(wx/24),ry=Math.floor(wy/8),rz=Math.floor(wz/24);
  const rt=_underRoomType(rx,ry,rz);if(!rt)return false;
  const lx=wx-rx*24,ly=wy-ry*8,lz=wz-rz*24;
  if(rt===1)return lx>=8&&lx<=16&&ly>=1&&ly<=3&&lz>=8&&lz<=16;
  return lx>=9&&lx<=15&&ly>=1&&ly<=4&&lz>=9&&lz<=15;
}
function isUnderSolid(wx,wy,wz){
  if(_isRoomVoid(wx,wy,wz))return false;
  const depth=-wy;
  const n1=noiseB(wx*0.09+wy*0.13,wz*0.09);
  const n2=noiseV(wx*0.09,wz*0.09+wy*0.13);
  const base=(n1+n2)*0.5;
  if(depth>22){
    // Deep: large cathedral voids carved by low-freq noise
    const bigCave=noise(wx*0.025+777,wz*0.025+wy*0.015);
    if(bigCave<-0.25)return false; // carve open void
    return base<=0.11;
  }
  if(depth>10){
    // Mid: finer branching passages via mixed frequencies
    const nFine=noiseV(wx*0.18+wy*0.24+444,wz*0.18);
    return(base*0.65+nFine*0.35)<=0.12;
  }
  // Shallow: standard caves
  return base<=0.12;
}
function generateUnderChunk(cx,cy,cz){
  const key=ucKey(cx,cy,cz);if(underChunks[key])return;
  const meshes=new Set(),ox=cx*CHUNK,oy=cy*CHUNK_Y,oz=cz*CHUNK;
  const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for(let lx=0;lx<CHUNK;lx++)for(let lz=0;lz<CHUNK;lz++)for(let ly=0;ly<CHUNK_Y;ly++){
    const wx=ox+lx,wy=oy+ly,wz=oz+lz;
    if(!isUnderSolid(wx,wy,wz))continue; // cave air
    if(!dirs.some(([dx,dy,dz])=>!isUnderSolid(wx+dx,wy+dy,wz+dz)))continue; // fully interior
    const depth=-wy;
    let ti;
    if(depth<=10){
      ti=rand3(wx,wy,wz,80)<0.22?1:CAVE_DIRT;
      if(rand3(wx,wy,wz,81)<0.02&&depth>5)ti=COAL_ORE;
    }else if(depth<=16){
      ti=1;
      if(rand3(wx,wy,wz,52)<0.05)ti=COAL_ORE;
      if(depth>13&&rand3(wx,wy,wz,55)<0.012)ti=IRON_ORE;
    }else if(depth<=22){
      ti=DEEP_STONE;
      if(rand3(wx,wy,wz,53)<0.03)ti=IRON_ORE;
      if(rand3(wx,wy,wz,57)<0.008)ti=DIAMOND_ORE;
    }else if(depth<=28){
      ti=DEEP_STONE;
      if(rand3(wx,wy,wz,54)<0.018)ti=IRON_ORE;
      if(rand3(wx,wy,wz,58)<0.015)ti=DIAMOND_ORE;
    }else{
      ti=DEEP_STONE;
      if(rand3(wx,wy,wz,62)<0.025)ti=DIAMOND_ORE;
    }
    if(wy===WORLD_CY_MIN*CHUNK_Y){
      const hx=Math.floor(wx/3)*3,hz=Math.floor(wz/3)*3;
      if(rand3(hx,-32,hz,8888)<0.38)continue;
      ti=LAVA_BLOCK;
    }
    const m=addBlock(wx,wy,wz,ti,false);if(m)meshes.add(m);
  }
  _spawnRoomContent(cx,cy,cz,meshes);
  underChunks[key]={meshes,loaded:true};
  // vertex AO for cave surfaces + re-shade borders of existing neighbours
  _applyAOToMeshes(meshes);
  const uw=underChunks[ucKey(cx-1,cy,cz)],ue=underChunks[ucKey(cx+1,cy,cz)];
  const un=underChunks[ucKey(cx,cy,cz-1)],us=underChunks[ucKey(cx,cy,cz+1)];
  const ud=underChunks[ucKey(cx,cy-1,cz)],uu=underChunks[ucKey(cx,cy+1,cz)];
  if(uw)_refreshPlaneAO(uw.meshes,'x',ox-1);
  if(ue)_refreshPlaneAO(ue.meshes,'x',ox+CHUNK);
  if(un)_refreshPlaneAO(un.meshes,'z',oz-1);
  if(us)_refreshPlaneAO(us.meshes,'z',oz+CHUNK);
  if(ud)_refreshPlaneAO(ud.meshes,'y',oy-1);
  if(uu)_refreshPlaneAO(uu.meshes,'y',oy+CHUNK_Y);
  if(cy===-1){const surf=chunks[cKey(cx,cz)];if(surf)_refreshPlaneAO(surf.meshes,'y',0);}
}

// ─── UNDERGROUND ROOMS ───
let underTreasures={},openedTreasureKeys=new Set();
function _makeTreasureMesh(type){
  const root=new THREE.Object3D();
  const bMat=new THREE.MeshStandardMaterial({color:type===2?0x1a3a50:0x4a2c0a,roughness:.7});
  const lMat=new THREE.MeshStandardMaterial({color:type===2?0x0088cc:0x7a4a10,roughness:.5,emissive:type===2?0x005588:0,emissiveIntensity:type===2?.5:0});
  const lockMat=new THREE.MeshStandardMaterial({color:0xddcc44,roughness:.4,metalness:.6});
  const body=new THREE.Mesh(new THREE.BoxGeometry(.78,.5,.58),bMat);body.position.y=.25;
  const lid=new THREE.Mesh(new THREE.BoxGeometry(.78,.18,.58),lMat);lid.position.y=.59;
  const lock=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.07),lockMat);lock.position.set(0,.55,.31);
  root.add(body,lid,lock);markShadowCaster(root);return root;
}
function _spawnRoomContent(cx,cy,cz,meshes){
  const ox=cx*CHUNK,oy=cy*CHUNK_Y,oz=cz*CHUNK;
  const rxA=Math.floor((ox-8)/24),rxB=Math.floor((ox+CHUNK+7)/24);
  const rzA=Math.floor((oz-8)/24),rzB=Math.floor((oz+CHUNK+7)/24);
  const pb=(wx,wy,wz,ti)=>{if(wx<ox||wx>=ox+CHUNK||wy<oy||wy>=oy+CHUNK_Y||wz<oz||wz>=oz+CHUNK)return;const m=addBlock(wx,wy,wz,ti,false);if(m)meshes.add(m);};
  for(let rx=rxA;rx<=rxB;rx++)for(let rz=rzA;rz<=rzB;rz++){
    const rt=_underRoomType(rx,cy,rz);if(!rt)continue;
    const wcx=rx*24,wcy=cy*CHUNK_Y,wcz=rz*24;
    if(rt===1){ // 廃採掘部屋: 木の支柱 + 宝箱
      [[8,1,8],[8,2,8],[16,1,8],[16,2,8],[8,1,16],[8,2,16],[16,1,16],[16,2,16]].forEach(([dlx,dly,dlz])=>pb(wcx+dlx,wcy+dly,wcz+dlz,3));
      if(rand3(rx,cy,rz,77)<0.5){pb(wcx+8,wcy+2,wcz+12,COAL_ORE);pb(wcx+8,wcy+1,wcz+11,COAL_ORE);}
      const tx=wcx+12,ty=wcy+1,tz=wcz+12,tk=vKey(tx,ty,tz);
      if(!underTreasures[tk]&&tx>=ox&&tx<ox+CHUNK&&tz>=oz&&tz<oz+CHUNK&&ty>=oy&&ty<oy+CHUNK_Y){
        const mesh=_makeTreasureMesh(1);mesh.position.set(tx+.5,ty,tz+.5);
        if(!openedTreasureKeys.has(tk))scene.add(mesh);
        underTreasures[tk]={mesh,opened:openedTreasureKeys.has(tk),type:1};
      }
    }else{ // 地下祭壇: クリスタル柱 + 祭壇石 + 宝箱
      [[9,1,9],[9,2,9],[9,3,9],[15,1,9],[15,2,9],[15,3,9],[9,1,15],[9,2,15],[9,3,15],[15,1,15],[15,2,15],[15,3,15]].forEach(([dlx,dly,dlz])=>pb(wcx+dlx,wcy+dly,wcz+dlz,DIAMOND_ORE));
      pb(wcx+12,wcy+1,wcz+12,DEEP_STONE);pb(wcx+12,wcy+2,wcz+12,DIAMOND_ORE);
      const tx=wcx+10,ty=wcy+1,tz=wcz+10,tk=vKey(tx,ty,tz);
      if(!underTreasures[tk]&&tx>=ox&&tx<ox+CHUNK&&tz>=oz&&tz<oz+CHUNK&&ty>=oy&&ty<oy+CHUNK_Y){
        const mesh=_makeTreasureMesh(2);mesh.position.set(tx+.5,ty,tz+.5);
        if(!openedTreasureKeys.has(tk))scene.add(mesh);
        underTreasures[tk]={mesh,opened:openedTreasureKeys.has(tk),type:2};
      }
    }
  }
}
function _disposeTreasureMesh(mesh){mesh.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});}
function resetTreasures(){for(const k in underTreasures){scene.remove(underTreasures[k].mesh);_disposeTreasureMesh(underTreasures[k].mesh);}underTreasures={};openedTreasureKeys=new Set();$treasureInfo.classList.remove('show');}
function _treasureNearby(){for(const k in underTreasures){const t=underTreasures[k];if(t.opened)continue;const[tx,ty,tz]=k.split('|').map(Number);if(Math.hypot(tx+.5-P.x,ty+.3-(P.y+.8),tz+.5-P.z)<2.5)return true;}return false;}
function _updateTreasureInfo(){
  let near=null,nearD=2.5;
  for(const k in underTreasures){const t=underTreasures[k];if(t.opened)continue;const[tx,ty,tz]=k.split('|').map(Number);const d=Math.hypot(tx+.5-P.x,ty+.3-(P.y+.8),tz+.5-P.z);if(d<nearD){nearD=d;near={k,t};}}
  if(near){$treasureInfo.textContent=near.t.type===2?'💠 地下祭壇の宝箱！ 長押しで開ける':'📦 古い宝箱！ 長押しで開ける';$treasureInfo.classList.add('show');}
  else $treasureInfo.classList.remove('show');
}
function openTreasure(){
  if(!gs.running)return;
  let nearK=null,nearD=2.5;
  for(const k in underTreasures){const t=underTreasures[k];if(t.opened)continue;const[tx,ty,tz]=k.split('|').map(Number);const d=Math.hypot(tx+.5-P.x,ty+.3-(P.y+.8),tz+.5-P.z);if(d<nearD){nearD=d;nearK=k;}}
  if(!nearK)return;
  const t=underTreasures[nearK];t.opened=true;openedTreasureKeys.add(nearK);scene.remove(t.mesh);_disposeTreasureMesh(t.mesh);
  const hadDiamond=inv.diamond>0;
  let msg='';
  if(t.type===2){
    const d=1+Math.floor(Math.random()*2);inv.diamond+=d;msg='💎×'+d;
    if(Math.random()<0.08){inv.dragonCore+=1;msg+=' 💠×1';}
    if(Math.random()<0.35){const a=5+Math.floor(Math.random()*6);inv.arrow+=a;msg+=' 🏹×'+a;}
  }else{
    const roll=Math.random();
    if(roll<0.30){const w=2+Math.floor(Math.random()*3);inv.wood+=w;msg='🪵×'+w;}
    else if(roll<0.55){const s=3+Math.floor(Math.random()*3);inv.stone+=s;msg='🪨×'+s;}
    else if(roll<0.75){const a=4+Math.floor(Math.random()*5);inv.arrow+=a;msg='🏹×'+a;}
    else if(roll<0.90){const m=1+Math.floor(Math.random()*2);meat+=m;updateMeatHUD();msg='🥩×'+m;}
    else{inv.diamond+=1;msg='💎×1';}
  }
  updateInvHUD();
  if(!hadDiamond&&inv.diamond>0)unlockAchievement('firstDiamond');
  showBonus('📦 宝箱を開けた！ '+msg);
  unlockAchievement('treasureHunter');
  playTone(900,.12,.1,'sine');setTimeout(()=>playTone(1300,.08,.08,'sine'),90);
  _updateTreasureInfo();saveGame();
}

// ═══ PHYSICS ═══
function overlaps(px,py,pz,hw,hh){
  hw=hw||.35;hh=hh||1.75;
  const mnX=Math.floor(px-hw),mxX=Math.floor(px+hw),mnY=Math.floor(py),mxY=Math.floor(py+hh),mnZ=Math.floor(pz-hw),mxZ=Math.floor(pz+hw);
  for(let bx=mnX;bx<=mxX;bx++)for(let by=mnY;by<=mxY;by++)for(let bz=mnZ;bz<=mxZ;bz++){
    const v=voxels[vKey(bx,by,bz)];if(!v||!v.active||v.ti===WATER_BLOCK)continue;
    if(px-hw<bx+1&&px+hw>bx&&py<by+1&&py+hh>by&&pz-hw<bz+1&&pz+hw>bz)return true;
  }
  const CHW=0.45,CHH=0.7;
  for(const c of chests){const cx=c.x+.5,cy=c.y,cz=c.z+.5;if(px-hw<cx+CHW&&px+hw>cx-CHW&&py<cy+CHH&&py+hh>cy&&pz-hw<cz+CHW&&pz+hw>cz-CHW)return true;}
  for(const b of beds){const bx=b.x+.5,by=b.y,bz=b.z+.9;if(px-hw<bx+.5&&px+hw>bx-.5&&py<by+.35&&py+hh>by&&pz-hw<bz+.9&&pz+hw>bz-.9)return true;}
  for(const t of trophies){const tx=t.x+.5,ty=t.y,tz=t.z+.5;if(px-hw<tx+.38&&px+hw>tx-.38&&py<ty+.75&&py+hh>ty&&pz-hw<tz+.38&&pz+hw>tz-.38)return true;}
  return false;
}
let lavaDmgTimer=0,snowDmgTimer=0;
const $lavaFlash=document.getElementById('lavaFlash'),$snowFlash=document.getElementById('snowFlash');
function checkLava(){const px=Math.floor(P.x),py=Math.floor(P.y),pz=Math.floor(P.z);for(let by=py-1;by<=py+1;by++){if(lavaBlocks.has(vKey(px,by,pz)))return true;for(const[dx,dz]of[[-1,0],[1,0],[0,-1],[0,1]]){if(lavaBlocks.has(vKey(px+dx,by,pz+dz)))return true;}}return false;}

// ═══ PARTICLES ═══
let particles=[];const particleGeo=new THREE.BoxGeometry(.1,.1,.1);
function spawnParticles(x,y,z,color,count){count=isTouch?Math.min(count,2):Math.min(count,5);if(isTouch&&particles.length>=12)return;for(let i=0;i<count;i++){const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1});const m=new THREE.Mesh(particleGeo,mat);m.position.set(x,y,z);scene.add(m);particles.push({mesh:m,mat,vx:(Math.random()-.5)*5,vy:Math.random()*4+2,vz:(Math.random()-.5)*5,life:.4+Math.random()*.3});}}
function spawnLavaParticles(x,y,z){for(let i=0;i<3;i++){const mat=new THREE.MeshBasicMaterial({color:Math.random()<.5?0xff4400:0xff8800,transparent:true,opacity:1});const m=new THREE.Mesh(particleGeo,mat);m.position.set(x,y,z);scene.add(m);particles.push({mesh:m,mat,vx:(Math.random()-.5)*2,vy:Math.random()*3+2,vz:(Math.random()-.5)*2,life:.6+Math.random()*.4});}}
function spawnSnowParticles(x,y,z){for(let i=0;i<2;i++){const mat=new THREE.MeshBasicMaterial({color:0xddeeff,transparent:true,opacity:.8});const m=new THREE.Mesh(particleGeo,mat);m.position.set(x+Math.random()-.5,y+Math.random()*2+1,z+Math.random()-.5);scene.add(m);particles.push({mesh:m,mat,vx:(Math.random()-.5)*.5,vy:-Math.random()*1.5-.5,vz:(Math.random()-.5)*.5,life:1.5+Math.random()});}}
function updateParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){scene.remove(p.mesh);p.mat.dispose();particles.splice(i,1);continue;}p.vy-=12*dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;p.mesh.rotation.x+=dt*4;p.mat.opacity=Math.max(0,p.life/.4);}}

// ═══ WEAPONS ═══
const WEAPONS=[
  {name:'👊 Fist', dmg:1,range:3,  cd:.3, type:'melee',  sfx:sfxHit},
  {name:'⚔ Sword', dmg:3,range:3.5,cd:.4, type:'melee',  sfx:sfxSword},
  {name:'🔨 Hammer',dmg:6,range:3,  cd:.8, type:'melee',  sfx:sfxHammer},
  {name:'🏹 Bow',   dmg:4,range:25, cd:.7, type:'ranged', sfx:sfxBow},
  {name:'🪄 Magic', dmg:5,range:8,  cd:1.4,type:'aoe',    sfx:sfxMagic},
  {name:'🔮 Diamond Staff',dmg:15,range:35,cd:1.5,type:'staff',sfx:sfxDiamondStaff},
];
let weaponIdx=0,attackCD=0;
const $wl=document.getElementById('weaponLabel');
const $cdFill=document.getElementById('cdFill');
const $meatLabel=document.getElementById('meatLabel');
const $eatBtn=document.getElementById('eatBtn');
const MEAT_HP=20,MEAT_SCORE=25;
const MOB_RESPAWN_INTERVAL=60;
let mobRespawnT=MOB_RESPAWN_INTERVAL;
let projectiles=[];
const arrowGeo=new THREE.BoxGeometry(.12,.12,.5);const arrowMat=new THREE.MeshBasicMaterial({color:0xddaa44});const diamondArrowMat=new THREE.MeshBasicMaterial({color:0x00e5ff});
const staffOrbGeo=new THREE.OctahedronGeometry(.22,0);const staffOrbMat=new THREE.MeshBasicMaterial({color:0x88ffff});
function fireStaff(){const dir=new THREE.Vector3();camera.getWorldDirection(dir);const m=new THREE.Mesh(staffOrbGeo,staffOrbMat.clone());const sx=P.x,sy=P.y+1.5,sz=P.z;m.position.set(sx,sy,sz);scene.add(m);projectiles.push({mesh:m,x:sx,y:sy,z:sz,dx:dir.x*70,dy:dir.y*70,dz:dir.z*70,life:2.5,dmg:WEAPONS[5].dmg,staff:true});}
function fireArrow(){const dir=new THREE.Vector3();camera.getWorldDirection(dir);const isDiamond=hasDiamondBow;const m=new THREE.Mesh(arrowGeo,(isDiamond?diamondArrowMat:arrowMat).clone());const sx=P.x,sy=P.y+1.5,sz=P.z;m.position.set(sx,sy,sz);m.lookAt(sx+dir.x,sy+dir.y,sz+dir.z);scene.add(m);const spd=isDiamond?55:35;const life=isDiamond?2.4:1.8;projectiles.push({mesh:m,x:sx,y:sy,z:sz,dx:dir.x*spd,dy:dir.y*spd,dz:dir.z*spd,life,dmg:WEAPONS[3].dmg,diamond:isDiamond});}
const bossArrowGeo=new THREE.BoxGeometry(.2,.2,.7);
function fireBossArrow(bx,by,bz,tx,ty,tz,dmgVal){const dx=tx-bx,dy=ty-by,dz=tz-bz,l=Math.hypot(dx,dy,dz)||1;const m=new THREE.Mesh(bossArrowGeo,new THREE.MeshBasicMaterial({color:0xff3300}));m.position.set(bx,by,bz);scene.add(m);projectiles.push({mesh:m,x:bx,y:by,z:bz,dx:(dx/l)*22,dy:(dy/l)*22,dz:(dz/l)*22,life:2.5,dmg:dmgVal,isBossArrow:true});}

// ═══ PLAYER ═══
const P={x:0,y:20,z:0,velY:0,onGround:false,hp:100,maxHp:100,invT:0};
let yaw=0,pitch=0;
const SPEED=6,SPRINT_SPEED=10,GRAV=18,JV=7.5,EYE=1.55;
let coyoteTime=0,jumpBuffer=0;
const COYOTE=0.15,JBUF=0.12;
function movePlayer(vx,vz,dt){P.velY-=GRAV*dt;const steps=3,sdt=dt/steps;let grounded=false;for(let s=0;s<steps;s++){let nx=P.x+vx*sdt;if(!overlaps(nx,P.y,P.z))P.x=nx;let nz=P.z+vz*sdt;if(!overlaps(P.x,P.y,nz))P.z=nz;const ny=P.y+P.velY*sdt;if(!overlaps(P.x,ny,P.z)){P.y=ny;}else{if(P.velY<0)grounded=true;P.velY=0;}}P.onGround=grounded;if(P.onGround){coyoteTime=COYOTE;}else{coyoteTime=Math.max(0,coyoteTime-dt);}if(jumpBuffer>0){jumpBuffer-=dt;if(P.onGround||coyoteTime>0){P.velY=JV;P.onGround=false;coyoteTime=0;jumpBuffer=0;sfxJump();}}const wMin=-WORLD_R*CHUNK,wMax=WORLD_R*CHUNK;P.x=Math.max(wMin+1,Math.min(wMax-1,P.x));P.z=Math.max(wMin+1,Math.min(wMax-1,P.z));if(P.y<-40){P.y=20;P.velY=0;dmgPlayer(15);}}
function doJump(){if(!gs.running)return;initAudio();if(P.onGround||coyoteTime>0){P.velY=JV;P.onGround=false;coyoteTime=0;jumpBuffer=0;sfxJump();}else{jumpBuffer=JBUF;}}

// ═══ ENEMY BUILDERS ═══
function makeMat(color,emissive,emissiveIntensity,roughness){return new THREE.MeshStandardMaterial({color,emissive:emissive||0,emissiveIntensity:emissiveIntensity||0,roughness:roughness||.7});}
// mark an entity's body parts as shadow casters (skips HP bars / labels, which use basic materials)
function markShadowCaster(root){root.traverse(o=>{if(o.isMesh&&o.material&&!Array.isArray(o.material)&&!o.material.isMeshBasicMaterial){o.castShadow=true;o.receiveShadow=true;}});}
function makeBox(w,h,d,mat){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);}
// limb that pivots at its top (hip/shoulder) so rotation swings like a real leg/arm
function makeLimb(w,h,d,mat,px,py,pz){const g=new THREE.Object3D();g.position.set(px,py,pz);const m=makeBox(w,h,d,mat);m.position.y=-h/2;g.add(m);return g;}
function makeLabelSprite(name,color){const lc=document.createElement('canvas');lc.width=128;lc.height=32;const lx=lc.getContext('2d');lx.fillStyle='rgba(0,0,0,0.5)';lx.fillRect(0,0,128,32);lx.fillStyle=color||'#fff';lx.font='bold 15px sans-serif';lx.textAlign='center';lx.fillText(name,64,22);const tex=new THREE.CanvasTexture(lc);const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));sp.scale.set(1.4,.35,1);return sp;}
function makeHpBar(width){const bg=makeBox(width,.08,.05,new THREE.MeshBasicMaterial({color:0x333333}));const fg=makeBox(width,.08,.06,new THREE.MeshBasicMaterial({color:0x44ff44}));fg.position.z=.01;return{bg,fg};}
function buildZombie(mat){
  const root=new THREE.Object3D();
  const skin=mat.clone();                          // green skin (head + arms) — keeps night glow
  const shirt=makeMat(0x2f6b6b,0x0a2626,0,.75);    // torn teal shirt (torso)
  const pants=makeMat(0x35356b,0x0a0a1a,0,.75);    // dark trousers (legs)
  const body=makeBox(.5,.72,.27,shirt);body.position.y=.3;
  // ragged shirt hem
  const hem=makeBox(.52,.14,.29,makeMat(0x265a5a,0,0,.8));hem.position.y=-.32;body.add(hem);
  const head=makeBox(.55,.55,.55,skin);head.position.y=.92;
  const eyeM=new THREE.MeshBasicMaterial({color:0x140014});
  const el=makeBox(.12,.1,.06,eyeM);el.position.set(-.13,.02,.28);head.add(el);
  const er=makeBox(.12,.1,.06,eyeM.clone());er.position.set(.13,.02,.28);head.add(er);
  const brow=makeBox(.44,.05,.05,makeMat(0x254018,0,0,.8));brow.position.set(0,.12,.27);head.add(brow);
  // classic outstretched arms
  const armL=makeLimb(.22,.7,.22,skin.clone(),-.36,.55,0);armL.rotation.x=-Math.PI/2;
  const armR=makeLimb(.22,.7,.22,skin.clone(), .36,.55,0);armR.rotation.x=-Math.PI/2;
  const legL=makeLimb(.23,.75,.25,pants.clone(),-.13,-.1,0);
  const legR=makeLimb(.23,.75,.25,pants.clone(), .13,-.1,0);
  const hp=makeHpBar(.9);hp.bg.position.y=1.55;hp.fg.position.y=1.55;
  const lb=makeLabelSprite('Zombie','#88ff44');lb.position.y=1.78;
  root.add(body,head,armL,armR,legL,legR,hp.bg,hp.fg,lb);
  return{root,body,head,hpBar:hp.fg,legL,legR,armL,armR,armSwing:false};
}
function buildSkeleton(mat){
  const root=new THREE.Object3D();
  const bone=mat.clone();
  const body=makeBox(.38,.62,.2,bone.clone());body.position.y=.32;
  const spine=makeBox(.09,.62,.09,bone.clone());spine.position.set(0,0,-.05);body.add(spine);
  for(let i=0;i<3;i++){const rib=makeBox(.42,.06,.06,bone.clone());rib.position.set(0,.18-i*.17,.1);body.add(rib);}
  const pelvis=makeBox(.34,.12,.16,bone.clone());pelvis.position.y=-.32;body.add(pelvis);
  const head=makeBox(.5,.5,.5,bone.clone());head.position.y=.9;
  const eyeM=new THREE.MeshBasicMaterial({color:0x000000});
  const el=makeBox(.13,.14,.06,eyeM);el.position.set(-.12,.03,.26);head.add(el);
  const er=makeBox(.13,.14,.06,eyeM.clone());er.position.set(.12,.03,.26);head.add(er);
  const jaw=makeBox(.36,.07,.42,makeMat(0xb8b8a8,0,0,.8));jaw.position.set(0,-.22,0);head.add(jaw);
  for(let i=0;i<3;i++){const tooth=makeBox(.05,.06,.04,new THREE.MeshBasicMaterial({color:0x555544}));tooth.position.set(-.1+i*.1,-.18,.26);head.add(tooth);}
  // left arm hangs, right arm raised holding a bow
  const armL=makeLimb(.13,.7,.13,bone.clone(),-.28,.55,0);
  const armR=makeLimb(.13,.7,.13,bone.clone(), .28,.55,.05);armR.rotation.x=-1.3;
  const bowM=makeMat(0x6b4423,0,0,.6);const bow=new THREE.Object3D();
  const bu=makeBox(.06,.32,.06,bowM);bu.position.y=.16;bu.rotation.z=.22;
  const bd=makeBox(.06,.32,.06,bowM.clone());bd.position.y=-.16;bd.rotation.z=-.22;
  const bs=makeBox(.02,.64,.02,new THREE.MeshBasicMaterial({color:0xdedede}));bs.position.x=.06;
  bow.add(bu,bd,bs);bow.position.set(0,-.72,.05);armR.add(bow);
  const legL=makeLimb(.14,.75,.15,bone.clone(),-.11,-.12,0);
  const legR=makeLimb(.14,.75,.15,bone.clone(), .11,-.12,0);
  const hp=makeHpBar(.7);hp.bg.position.y=1.5;hp.fg.position.y=1.5;
  const lb=makeLabelSprite('Skeleton','#eeeeff');lb.position.y=1.72;
  root.add(body,head,armL,armR,legL,legR,hp.bg,hp.fg,lb);
  return{root,body,head,hpBar:hp.fg,legL,legR,armSwing:false};
}
function buildGolem(mat){
  const root=new THREE.Object3D();
  const iron=mat.clone();
  const moss=makeMat(0x4a7a32,0x0c1808,0,.85);
  const body=makeBox(1.1,1.15,.7,iron.clone());body.position.y=.28;
  const belt=makeBox(1.14,.2,.74,makeMat(0x3a4650,0x0a0e12,0,.7));belt.position.y=-.26;body.add(belt);
  const m1=makeBox(.32,.3,.04,moss);m1.position.set(.24,.1,.36);body.add(m1);
  const m2=makeBox(.2,.42,.04,moss.clone());m2.position.set(-.3,-.02,.36);body.add(m2);
  const head=makeBox(.5,.58,.5,iron.clone());head.position.y=1.05;
  const nose=makeBox(.16,.48,.2,iron.clone());nose.position.set(0,-.04,.26);head.add(nose);
  const eyeM=new THREE.MeshBasicMaterial({color:0xff2200});
  const el=makeBox(.1,.14,.06,eyeM);el.position.set(-.15,.16,.25);head.add(el);
  const er=makeBox(.1,.14,.06,eyeM.clone());er.position.set(.15,.16,.25);head.add(er);
  // heavy arms reaching toward the ground
  const armL=makeLimb(.34,1.3,.34,iron.clone(),-.78,.55,0);
  const armR=makeLimb(.34,1.3,.34,iron.clone(), .78,.55,0);
  const legL=makeLimb(.42,.55,.46,iron.clone(),-.27,-.3,0);
  const legR=makeLimb(.42,.55,.46,iron.clone(), .27,-.3,0);
  const hp=makeHpBar(1.4);hp.bg.position.y=1.5;hp.fg.position.y=1.5;
  const lb=makeLabelSprite('Golem','#aaaaaa');lb.position.y=1.72;
  root.add(body,head,armL,armR,legL,legR,hp.bg,hp.fg,lb);
  return{root,body,head,hpBar:hp.fg,legL,legR,armL,armR};
}
function buildFireDemon(mat){const root=new THREE.Object3D();const body=makeBox(.8,1.5,.65,mat.clone());const head=makeBox(.65,.65,.65,mat.clone());head.position.y=1.1;const eyeM=new THREE.MeshBasicMaterial({color:0xffff00});const el=makeBox(.16,.14,.07,eyeM);el.position.set(-.16,.06,.34);head.add(el);const er=makeBox(.16,.14,.07,eyeM.clone());er.position.set(.16,.06,.34);head.add(er);const hornM=new THREE.MeshStandardMaterial({color:0x220000,emissive:0x440000,emissiveIntensity:.5});const hornL=makeBox(.1,.45,.1,hornM);hornL.position.set(-.2,.48,.0);hornL.rotation.z=-.3;head.add(hornL);const hornR=makeBox(.1,.45,.1,hornM.clone());hornR.position.set(.2,.48,.0);hornR.rotation.z=.3;head.add(hornR);const wingM=new THREE.MeshStandardMaterial({color:0xcc2200,emissive:0x661100,emissiveIntensity:.4,transparent:true,opacity:.8});const wingL=makeBox(.12,1.1,.6,wingM);wingL.position.set(-.72,.1,-.1);wingL.rotation.z=.3;const wingR=makeBox(.12,1.1,.6,wingM.clone());wingR.position.set(.72,.1,-.1);wingR.rotation.z=-.3;const armM=mat.clone();const armL=makeBox(.25,.9,.25,armM);armL.position.set(-.55,.0,0);const armR=makeBox(.25,.9,.25,armM.clone());armR.position.set(.55,.0,0);const tail=makeBox(.18,.7,.18,mat.clone());tail.position.set(0,-.5,-.4);tail.rotation.x=.6;const hp=makeHpBar(.9);hp.bg.position.y=1.6;hp.fg.position.y=1.6;hp.fg.material.color.setHex(0xff6600);const lb=makeLabelSprite('FireDemon','#ff8800');lb.position.y=1.8;root.add(body,head,wingL,wingR,armL,armR,tail,hp.bg,hp.fg,lb);return{root,body,head,hpBar:hp.fg};}
function buildIceGolem(mat){const root=new THREE.Object3D();const body=makeBox(1.1,1.5,.9,mat.clone());const head=makeBox(.7,.6,.7,mat.clone());head.position.y=1.1;const eyeM=new THREE.MeshBasicMaterial({color:0x00ddff});const el=makeBox(.15,.12,.07,eyeM);el.position.set(-.18,.05,.36);head.add(el);const er=makeBox(.15,.12,.07,eyeM.clone());er.position.set(.18,.05,.36);head.add(er);const spikeM=new THREE.MeshStandardMaterial({color:0xaaddff,emissive:0x224466,emissiveIntensity:.4,transparent:true,opacity:.85});const spike1=makeBox(.15,.5,.15,spikeM);spike1.position.set(0,.45,.0);head.add(spike1);const spike2=makeBox(.12,.35,.12,spikeM.clone());spike2.position.set(-.22,.35,.0);spike2.rotation.z=.3;head.add(spike2);const spike3=makeBox(.12,.35,.12,spikeM.clone());spike3.position.set(.22,.35,.0);spike3.rotation.z=-.3;head.add(spike3);const armM=mat.clone();const armL=makeBox(.35,1.0,.35,armM);armL.position.set(-.75,-.1,0);const armR=makeBox(.35,1.0,.35,armM.clone());armR.position.set(.75,-.1,0);const hp=makeHpBar(1.1);hp.bg.position.y=1.55;hp.fg.position.y=1.55;hp.fg.material.color.setHex(0x44ddff);const lb=makeLabelSprite('IceGolem','#aaddff');lb.position.y=1.75;root.add(body,head,armL,armR,hp.bg,hp.fg,lb);return{root,body,head,hpBar:hp.fg};}

function buildBat(mat){
  const root=new THREE.Object3D();
  const body=makeBox(.35,.2,.3,mat.clone());
  const earL=makeBox(.07,.15,.06,mat.clone());earL.position.set(-.1,.17,-.05);body.add(earL);
  const earR=makeBox(.07,.15,.06,mat.clone());earR.position.set(.1,.17,-.05);body.add(earR);
  const eyeM=new THREE.MeshBasicMaterial({color:0xff2222});
  const el=makeBox(.07,.07,.05,eyeM);el.position.set(-.08,.03,.16);body.add(el);
  const er=makeBox(.07,.07,.05,eyeM.clone());er.position.set(.08,.03,.16);body.add(er);
  const lWingG=new THREE.Object3D();lWingG.position.set(-.175,0,0);
  const lWing=makeBox(.42,.06,.28,mat.clone());lWing.position.set(-.21,0,0);lWingG.add(lWing);
  const rWingG=new THREE.Object3D();rWingG.position.set(.175,0,0);
  const rWing=makeBox(.42,.06,.28,mat.clone());rWing.position.set(.21,0,0);rWingG.add(rWing);
  const hp=makeHpBar(.45);hp.bg.position.y=.42;hp.fg.position.y=.42;hp.fg.material.color.setHex(0xff4444);
  const lb=makeLabelSprite('Bat','#cc88ff');lb.position.y=.62;
  root.add(body,lWingG,rWingG,hp.bg,hp.fg,lb);
  return{root,body,head:body,hpBar:hp.fg,lWing:lWingG,rWing:rWingG};
}
function buildCaveSlime(mat){
  const root=new THREE.Object3D();
  const body=makeBox(1.0,.55,1.0,mat.clone());body.position.y=.27;
  const top=makeBox(.75,.35,.75,mat.clone());top.position.y=.66;
  const eyeM=new THREE.MeshBasicMaterial({color:0xffcc00});
  const el=makeBox(.14,.1,.07,eyeM);el.position.set(-.18,.05,.38);top.add(el);
  const er=makeBox(.14,.1,.07,eyeM.clone());er.position.set(.18,.05,.38);top.add(er);
  const hp=makeHpBar(.8);hp.bg.position.y=1.1;hp.fg.position.y=1.1;
  const lb=makeLabelSprite('スライム','#cc44ff');lb.position.y=1.3;
  root.add(body,top,hp.bg,hp.fg,lb);
  return{root,body,head:top,hpBar:hp.fg};
}
function buildAbyssBat(mat){
  const root=new THREE.Object3D();
  const body=makeBox(.55,.45,.4,mat.clone());
  const lWingG=new THREE.Object3D();lWingG.position.set(-.21,0,0);
  const lWing=makeBox(.52,.08,.36,mat.clone());lWing.position.set(-.26,0,0);lWingG.add(lWing);
  const rWingG=new THREE.Object3D();rWingG.position.set(.21,0,0);
  const rWing=makeBox(.52,.08,.36,mat.clone());rWing.position.set(.26,0,0);rWingG.add(rWing);
  const eyeM=new THREE.MeshBasicMaterial({color:0x00ffcc});
  const el=makeBox(.1,.09,.07,eyeM);el.position.set(-.14,.07,.21);body.add(el);
  const er=makeBox(.1,.09,.07,eyeM.clone());er.position.set(.14,.07,.21);body.add(er);
  const earL=makeBox(.1,.22,.08,mat.clone());earL.position.set(-.18,.32,.0);body.add(earL);
  const earR=makeBox(.1,.22,.08,mat.clone());earR.position.set(.18,.32,.0);body.add(earR);
  const hp=makeHpBar(.55);hp.bg.position.y=.52;hp.fg.position.y=.52;hp.fg.material.color.setHex(0xaa44ff);
  const lb=makeLabelSprite('深淵コウモリ','#9966ff');lb.position.y=.7;
  root.add(body,lWingG,rWingG,hp.bg,hp.fg,lb);
  return{root,body,head:body,hpBar:hp.fg,lWing:lWingG,rWing:rWingG};
}
function buildCrystalGolem(mat){
  const root=new THREE.Object3D();
  const cMat=new THREE.MeshStandardMaterial({color:0x44aacc,emissive:0x00bbff,emissiveIntensity:1.2,roughness:.1,transparent:true,opacity:.9});
  const body=makeBox(1.3,1.2,.95,mat.clone());body.position.y=-.1;
  const head=makeBox(.6,.52,.6,mat.clone());head.position.y=.9;
  const eyeM=new THREE.MeshBasicMaterial({color:0x00ffff});
  const el=makeBox(.13,.1,.07,eyeM);el.position.set(-.15,.04,.32);head.add(el);
  const er=makeBox(.13,.1,.07,eyeM.clone());er.position.set(.15,.04,.32);head.add(er);
  const sp1=makeBox(.18,.52,.18,cMat);sp1.position.set(.42,.6,.48);body.add(sp1);
  const sp2=makeBox(.16,.44,.16,cMat.clone());sp2.position.set(-.38,.55,.48);body.add(sp2);
  const sp3=makeBox(.14,.35,.14,cMat.clone());sp3.position.set(.12,.62,.48);body.add(sp3);
  const armL=makeBox(.38,1.1,.38,mat.clone());armL.position.set(-.88,-.15,0);
  const armR=makeBox(.38,1.1,.38,mat.clone());armR.position.set(.88,-.15,0);
  const hp=makeHpBar(1.3);hp.bg.position.y=1.4;hp.fg.position.y=1.4;hp.fg.material.color.setHex(0x00ccff);
  const lb=makeLabelSprite('クリスタルゴーレム','#00ddff');lb.position.y=1.6;
  root.add(body,head,armL,armR,hp.bg,hp.fg,lb);
  return{root,body,head,hpBar:hp.fg};
}
function buildDiamondDragon(){
  const root=new THREE.Object3D();
  const bMat=makeMat(0xc2f7ff,0x22d6ff,1.35,.02);
  const cMat=makeMat(0xe9fdff,0x66f2ff,2.0,.0);
  const coreMat=new THREE.MeshStandardMaterial({color:0xeaffff,emissive:0x66ffff,emissiveIntensity:2.4,roughness:.02,metalness:.12,transparent:true,opacity:.92});
  const eyeM=new THREE.MeshBasicMaterial({color:0xaaf0ff});
  // Body
  const body=makeBox(.9,1.0,.7,bMat.clone());
  // Neck
  const neck=makeBox(.38,.42,.38,bMat.clone());neck.position.set(0,.62,.18);
  // Head
  const head=makeBox(.55,.5,.58,bMat.clone());head.position.set(0,.88,.32);
  // Snout
  const snout=makeBox(.32,.2,.38,bMat.clone());snout.position.set(0,-.1,.32);head.add(snout);
  // Eyes (blue-white glow)
  const eyeL=makeBox(.12,.12,.07,eyeM);eyeL.position.set(-.17,.06,.3);head.add(eyeL);
  const eyeR=makeBox(.12,.12,.07,eyeM.clone());eyeR.position.set(.17,.06,.3);head.add(eyeR);
  // Crown crystal spikes
  for(let i=0;i<3;i++){const hh=makeBox(.1,.28+i*.04,.1,cMat.clone());hh.position.set((i-1)*.2,.3+i*.03,-.04);head.add(hh);}
  const spikeL=makeBox(.08,.18,.08,cMat.clone());spikeL.position.set(-.3,.12,.0);spikeL.rotation.z=.5;head.add(spikeL);
  const spikeR=makeBox(.08,.18,.08,cMat.clone());spikeR.position.set(.3,.12,.0);spikeR.rotation.z=-.5;head.add(spikeR);
  // Crystal wings (flat angular panels)
  const wingLG=new THREE.Object3D();wingLG.position.set(-.45,.15,-.05);
  const wingLa=makeBox(.7,.07,.85,cMat.clone());wingLa.position.set(-.35,.0,.0);wingLa.rotation.z=.28;wingLG.add(wingLa);
  const wingLb=makeBox(.38,.05,.48,cMat.clone());wingLb.position.set(-.32,.05,.22);wingLa.add(wingLb);
  const wingRG=new THREE.Object3D();wingRG.position.set(.45,.15,-.05);
  const wingRa=makeBox(.7,.07,.85,cMat.clone());wingRa.position.set(.35,.0,.0);wingRa.rotation.z=-.28;wingRG.add(wingRa);
  const wingRb=makeBox(.38,.05,.48,cMat.clone());wingRb.position.set(.32,.05,.22);wingRa.add(wingRb);
  // Crystal scales on body
  for(let i=0;i<4;i++){const sc=makeBox(.12,.09,.1,cMat.clone());sc.position.set(i%2===0?-.28:.28,.3-i*.15,.37);body.add(sc);}
  // Diamond facets around torso
  for(let i=0;i<6;i++){
    const ang=(i/6)*Math.PI*2;
    const ft=makeBox(.09,.3,.13,cMat.clone());
    ft.position.set(Math.sin(ang)*.43,.08,Math.cos(ang)*.2);
    ft.rotation.y=ang;
    body.add(ft);
  }
  // Tail
  const tail=makeBox(.3,.3,.85,bMat.clone());tail.position.set(0,-.1,-.72);tail.rotation.x=.2;
  const tailTip=makeBox(.15,.15,.3,cMat.clone());tailTip.position.set(0,0,-.58);tail.add(tailTip);
  // Chest core (pulsing diamond crystal)
  const core=makeBox(.3,.3,.12,coreMat);core.position.set(0,.12,.37);
  // HP bar (cyan)
  const hp=makeHpBar(1.3);hp.bg.position.y=1.75;hp.fg.position.y=1.75;hp.fg.material.color.setHex(0x00e5ff);
  const lb=makeLabelSprite('💎Dragon','#00e5ff');lb.position.y=1.98;
  root.add(body,neck,head,wingLG,wingRG,tail,core,hp.bg,hp.fg,lb);
  return{root,body,head,hpBar:hp.fg,core,wingL:wingLG,wingR:wingRG};
}
const ENEMY_TYPES=[
  {name:'Zombie',  color:0x447733,emissive:0x112200,hp:3,dmg:10,score:50, builder:buildZombie,              breakPow:1,  breakSoft:true, breakChance:.3, breakCd0:6},
  {name:'Skeleton',color:0xddddcc,emissive:0x888877,hp:2,dmg:8, score:40, builder:buildSkeleton,emissiveIntensity:.25, breakPow:0},
  {name:'Golem',   color:0x556677,emissive:0x111822,hp:8,dmg:20,score:100,builder:buildGolem,               breakPow:3,  breakCd0:3},
  {name:'FireDemon',color:0xcc3300,emissive:0x661100,hp:5,dmg:15,score:80,builder:buildFireDemon,lava:true,  breakPow:2.5,firePow:true,  breakCd0:3.5},
  {name:'IceGolem',color:0x88bbdd,emissive:0x224466,hp:6,dmg:12,score:70,builder:buildIceGolem,ice:true,    breakPow:2,  breakCd0:4},
  {name:'Bat',        color:0x2a1a3a,emissive:0x220033,emissiveIntensity:.2, hp:2,dmg:5, score:30, builder:buildBat,        bat:true,   breakPow:0},
  {name:'CaveSlime',  color:0x331155,emissive:0x660099,emissiveIntensity:.3, hp:2,dmg:5, score:35, builder:buildCaveSlime,              breakPow:0},
  {name:'AbyssBat',   color:0x050010,emissive:0x440088,emissiveIntensity:.25,hp:3,dmg:9, score:55, builder:buildAbyssBat,  bat:true,   breakPow:0},
  {name:'CrystalGolem',color:0x1e3040,emissive:0x00aacc,emissiveIntensity:.3,hp:10,dmg:22,score:120,builder:buildCrystalGolem,crystal:true,breakPow:3,breakCd0:3.5},
];
let enemies=[];
function spawnEnemy(){
  let angle=Math.random()*Math.PI*2,dist=20+Math.random()*10;
  let sx=P.x+Math.cos(angle)*dist,sz=P.z+Math.sin(angle)*dist;
  const wMin=-WORLD_R*CHUNK+2,wMax=WORLD_R*CHUNK-2;sx=Math.max(wMin,Math.min(wMax,sx));sz=Math.max(wMin,Math.min(wMax,sz));
  const h=getHeight(Math.floor(sx),Math.floor(sz));
  const biome=getBiome(Math.floor(sx),Math.floor(sz));
  let et;
  if(biome===BIOMES.VOLCANO&&Math.random()<.55)et=ENEMY_TYPES[3];
  else if(biome===BIOMES.SNOW&&Math.random()<.55)et=ENEMY_TYPES[4];
  else et=ENEMY_TYPES[Math.floor(Math.random()*3)];
  const mat=makeMat(et.color,et.emissive,et.emissiveIntensity||.15,.6);
  const built=et.builder(mat);
  built.root.position.set(sx,h+1.85,sz);markShadowCaster(built.root);scene.add(built.root);
  const mhp=et.hp+Math.floor(gs.wave*.7);
  enemies.push({root:built.root,body:built.body,head:built.head,hpBar:built.hpBar,hp:mhp,maxHp:mhp,type:et,velY:0,onGround:false,atkCd:0,stuckT:0,lastX:sx,lastZ:sz,flashMeshes:[built.body,built.head],dead:false,breakCd:0});
}
const UNDER_SPAWN_CD=isTouch?10:8,UNDER_MAX=5;
let dragon=null,dragonSpawnT=90,dragonWarnPending=false;
let finalBossPending=false;
let underSpawnT=0;
function spawnUnderEnemy(){
  for(let attempt=0;attempt<15;attempt++){
    const angle=Math.random()*Math.PI*2,dist=8+Math.random()*10;
    const sx=Math.round(P.x+Math.cos(angle)*dist),sz=Math.round(P.z+Math.sin(angle)*dist);
    for(let dy=-3;dy<=3;dy++){
      const sy=Math.floor(P.y)+dy;
      if(sy>=0)continue;
      if(voxels[vKey(sx,sy,sz)])continue;
      const vf=voxels[vKey(sx,sy-1,sz)];
      if(!vf||!vf.active||vf.ti===WATER_BLOCK||vf.ti===LAVA_BLOCK)continue;
      const depth=-sy;
      let et;
      if(depth>=22){et=Math.random()<.3?ENEMY_TYPES[7]:ENEMY_TYPES[8];}
      else if(depth>=12){const r=Math.random();et=r<.25?ENEMY_TYPES[6]:r<.65?ENEMY_TYPES[7]:ENEMY_TYPES[8];}
      else et=Math.random()<.6?ENEMY_TYPES[6]:ENEMY_TYPES[7];
      const mat=makeMat(et.color,et.emissive,et.emissiveIntensity||.15,.6);
      const built=et.builder(mat);
      built.root.position.set(sx+.5,sy+.85,sz+.5);markShadowCaster(built.root);scene.add(built.root);
      const mhp=et.hp+Math.floor(depth*0.08)+Math.floor(gs.wave*.3);
      enemies.push({root:built.root,body:built.body,head:built.head,hpBar:built.hpBar,hp:mhp,maxHp:mhp,type:et,velY:0,onGround:false,atkCd:0,stuckT:0,lastX:sx+.5,lastZ:sz+.5,flashMeshes:[built.body,built.head],dead:false,breakCd:0,lWing:built.lWing,rWing:built.rWing});
      return;
    }
  }
}
function spawnDiamondDragon(){
  if(dragon||P.y>=-1)return;
  dragonWarnPending=false;
  const angle=Math.random()*Math.PI*2,dist=12+Math.random()*6;
  const sx=P.x+Math.cos(angle)*dist,sz=P.z+Math.sin(angle)*dist;
  const built=buildDiamondDragon();
  built.root.position.set(sx,P.y+1.0,sz);
  markShadowCaster(built.root);
  scene.add(built.root);
  const mhp=80+gs.wave*3;
  dragon={root:built.root,body:built.body,head:built.head,hpBar:built.hpBar,core:built.core,wingL:built.wingL,wingR:built.wingR,hp:mhp,maxHp:mhp,state:'prowl',stateT:3,coreT:0,atkCd:0,chargeDir:{x:1,z:0},flashT:0};
  dragonSpawnT=180;
  showAlert('💎 ダイヤモンドドラゴン現る！💎装備が必要！');
  sfxBossAppear();
}
function hitDragon(dmg,isDiamond){
  if(!dragon)return;
  if(!isDiamond){
    showBonus('NO EFFECT! 💎装備が必要');
    playTone(80,.15,.12,'square');
    dragon.body.material.emissive.setHex(0x441100);dragon.body.material.emissiveIntensity=1.5;
    setTimeout(()=>{if(dragon){dragon.body.material.emissive.setHex(0x001020);dragon.body.material.emissiveIntensity=.3;}},120);
    return;
  }
  dragon.hp-=dmg;dragon.flashT=.15;
  dragon.body.material.emissive.setHex(0xffffff);dragon.body.material.emissiveIntensity=2;
  dragon.head.material.emissive.setHex(0xffffff);dragon.head.material.emissiveIntensity=2;
  dragon.hpBar.scale.x=Math.max(.01,dragon.hp/dragon.maxHp);
  sfxBossDmg();
  if(dragon.hp<=0)killDragon();
}
function killDragon(){
  if(!dragon)return;
  const dp=dragon.root.position;
  for(let i=0;i<8;i++)setTimeout(()=>spawnParticles(dp.x+(Math.random()-.5)*3,dp.y+(Math.random()-.5)*1.5,dp.z+(Math.random()-.5)*3,0x00e5ff,5),i*80);
  const hadDiamond=inv.diamond>0;inv.diamond+=4;inv.dragonCore+=1;updateInvHUD();if(!hadDiamond)unlockAchievement('firstDiamond');
  gs.score+=2000;gs.kills++;
  scene.remove(dragon.root);disposeObject3D(dragon.root);dragon=null;
  dragonSpawnT=180;
  showAlert('💠 DIAMOND DRAGON DEFEATED!');
  playTone(1800,.3,.4,'sine');setTimeout(()=>playTone(2200,.2,.3,'sine'),180);setTimeout(()=>playTone(2600,.15,.4,'sine'),360);
  setTimeout(()=>showBonus('💠 ドラゴンコア×1 獲得！ 像をクラフトしよう'),1200);
}
function moveEnemy(e,vx,vz,dt){const p=e.root.position,fy=p.y-.85;e.velY-=GRAV*dt;const nx=p.x+vx*dt;if(!overlaps(nx,fy,p.z,.5,1.7))p.x=nx;const nz=p.z+vz*dt;if(!overlaps(p.x,fy,nz,.5,1.7))p.z=nz;const ny=fy+e.velY*dt;if(!overlaps(p.x,ny,p.z,.5,1.7)){p.y=ny+.85;e.onGround=false;}else{if(e.velY<0)e.onGround=true;e.velY=0;}if(p.y<-38)e.hp=0;}

// ═══ BOSS ═══
const BOSS_DEFS=[
  {wave:5, name:'💀 スケルトンキング',color:0xaaaaee,emissive:0x3333aa,baseHp:60, dmg:18,score:800, scale:2.2,patterns:['multishot','charge','stomp'],   deathColor:0x8888ff},
  {wave:10,name:'🔥 炎のゴーレム',  color:0xff4400,emissive:0x881100,baseHp:110,dmg:28,score:1500,scale:2.8,patterns:['charge','aoeBlast','multishot'], deathColor:0xff6600},
  {wave:13,name:'🦴 スケルトンウォーロード',color:0xbbccee,emissive:0x2244aa,baseHp:95,dmg:22,score:1200,scale:1.8,patterns:['multishot','charge','stomp'],deathColor:0x8899ff,miniBoss:true,diamondDrop:2},
  {wave:15,name:'👁 ダークアイ',    color:0x220044,emissive:0x550088,baseHp:175,dmg:35,score:2500,scale:3.2,patterns:['omnishot','charge','aoeBlast'],  deathColor:0xaa00ff},
  {wave:17,name:'🔮 ダークウィザード',color:0x1a0030,emissive:0x7700bb,baseHp:145,dmg:30,score:1800,scale:2.0,patterns:['omnishot','aoeBlast','charge'],deathColor:0xbb44ff,miniBoss:true,diamondDrop:3},
  {wave:20,name:'💎 キングダイヤモンドドラゴン',color:0x0a1520,emissive:0x00aaff,baseHp:260,dmg:45,score:8000,scale:2.0,patterns:['multishot','omnishot','charge','stomp','aoeBlast'],deathColor:0x00e5ff,finalBoss:true},
];
let boss=null;
const $bossWrap=document.getElementById('bossHpWrap'),$bossName=document.getElementById('bossName'),$bossHpFill=document.getElementById('bossHpFill'),$bossPhase=document.getElementById('bossPhase');
function buildKingDragon(sc,def){
  const root=new THREE.Object3D();
  const bMat=makeMat(0xd5fbff,0x3de6ff,1.6,.02);
  const cMat=makeMat(0xf0feff,0x8af8ff,2.5,.0);
  const coreMat=makeMat(0xffffff,0x9cffff,3.2,.0);
  const eyeM=new THREE.MeshBasicMaterial({color:0xffffff});
  const g=new THREE.Object3D();g.position.y=-0.5*sc;root.add(g);
  const body=makeBox(1.0*sc,.88*sc,1.8*sc,bMat.clone());g.add(body);
  const chest=makeBox(.55*sc,.45*sc,.1*sc,cMat.clone());chest.position.set(0,.08*sc,.92*sc);body.add(chest);
  const core=makeBox(.28*sc,.28*sc,.12*sc,coreMat.clone());core.position.set(0,.08*sc,.97*sc);body.add(core);
  const chestGem=makeBox(.42*sc,.42*sc,.16*sc,cMat.clone());chestGem.position.set(0,.08*sc,.84*sc);chestGem.rotation.y=Math.PI/4;body.add(chestGem);
  const chestGem2=makeBox(.22*sc,.5*sc,.12*sc,cMat.clone());chestGem2.position.set(0,.08*sc,.84*sc);chestGem2.rotation.x=Math.PI/4;body.add(chestGem2);
  for(let i=0;i<4;i++){const sp=makeBox(.1*sc,(.32-.04*i)*sc,.09*sc,cMat.clone());sp.position.set(0,.48*sc,(.6-.4*i)*sc);body.add(sp);}
  for(let i=0;i<4;i++){const sl=makeBox(.1*sc,.18*sc,.14*sc,cMat.clone());sl.position.set(-.52*sc,(.08+.08*i)*sc,(.55-.36*i)*sc);sl.rotation.z=.4;body.add(sl);const sr=sl.clone();sr.position.x=.52*sc;sr.rotation.z=-.4;body.add(sr);}
  for(let i=0;i<8;i++){
    const ang=(i/8)*Math.PI*2;
    const facet=makeBox(.09*sc,.32*sc,.14*sc,cMat.clone());
    facet.position.set(Math.sin(ang)*.58*sc,.06*sc,Math.cos(ang)*.75*sc);
    facet.rotation.y=ang;
    body.add(facet);
  }
  const neck=makeBox(.4*sc,.52*sc,.4*sc,bMat.clone());neck.position.set(0,.55*sc,.88*sc);neck.rotation.x=-.3;g.add(neck);
  const head=makeBox(.75*sc,.6*sc,.9*sc,bMat.clone());head.position.set(0,1.1*sc,1.42*sc);g.add(head);
  const snout=makeBox(.42*sc,.32*sc,.52*sc,bMat.clone());snout.position.set(0,-.14*sc,.52*sc);head.add(snout);
  const njL=makeBox(.07*sc,.15*sc,.06*sc,cMat.clone());njL.position.set(-.13*sc,-.14*sc,.28*sc);snout.add(njL);
  const njR=njL.clone();njR.position.x=.13*sc;snout.add(njR);
  const eyeL=makeBox(.13*sc,.13*sc,.07*sc,eyeM.clone());eyeL.position.set(-.25*sc,.1*sc,.47*sc);head.add(eyeL);
  const eyeR=makeBox(.13*sc,.13*sc,.07*sc,eyeM.clone());eyeR.position.set(.25*sc,.1*sc,.47*sc);head.add(eyeR);
  const h0=makeBox(.1*sc,.52*sc,.09*sc,cMat.clone());h0.position.set(0,.44*sc,-.06*sc);h0.rotation.x=.28;head.add(h0);
  const hL=makeBox(.09*sc,.4*sc,.09*sc,cMat.clone());hL.position.set(-.26*sc,.36*sc,-.05*sc);hL.rotation.set(.22,0,-.38);head.add(hL);
  const hR=makeBox(.09*sc,.4*sc,.09*sc,cMat.clone());hR.position.set(.26*sc,.36*sc,-.05*sc);hR.rotation.set(.22,0,.38);head.add(hR);
  const jcL=makeBox(.07*sc,.16*sc,.06*sc,cMat.clone());jcL.position.set(-.14*sc,-.15*sc,.28*sc);snout.add(jcL);
  const jcR=jcL.clone();jcR.position.x=.14*sc;snout.add(jcR);
  function makeWing(side){const wg=new THREE.Object3D();const w1=makeBox(1.2*sc,.06*sc,1.5*sc,cMat.clone());w1.position.set(side*.6*sc,0,0);w1.rotation.z=side*.28;wg.add(w1);const w2=makeBox(.75*sc,.05*sc,.9*sc,cMat.clone());w2.position.set(side*1.25*sc,-.32*sc,-.08*sc);w2.rotation.z=side*.52;wg.add(w2);const wt=makeBox(.11*sc,.11*sc,.42*sc,cMat.clone());wt.position.set(side*1.75*sc,-.52*sc,-.18*sc);wg.add(wt);return wg;}
  const wingL=makeWing(-1);wingL.position.set(-.5*sc,.26*sc,.18*sc);g.add(wingL);
  const wingR=makeWing(1);wingR.position.set(.5*sc,.26*sc,.18*sc);g.add(wingR);
  function makeLeg(){const lg=new THREE.Object3D();lg.add(makeBox(.3*sc,.45*sc,.28*sc,bMat.clone()));const lo=makeBox(.22*sc,.38*sc,.22*sc,bMat.clone());lo.position.y=-.42*sc;lg.add(lo);const ft=makeBox(.36*sc,.1*sc,.44*sc,cMat.clone());ft.position.y=-.66*sc;lg.add(ft);return lg;}
  const legFL=makeLeg();legFL.position.set(-.52*sc,-.44*sc,.62*sc);g.add(legFL);
  const legFR=makeLeg();legFR.position.set(.52*sc,-.44*sc,.62*sc);g.add(legFR);
  const legBL=makeLeg();legBL.position.set(-.52*sc,-.44*sc,-.62*sc);g.add(legBL);
  const legBR=makeLeg();legBR.position.set(.52*sc,-.44*sc,-.62*sc);g.add(legBR);
  const tail1=makeBox(.38*sc,.32*sc,.8*sc,bMat.clone());tail1.position.set(0,-.1*sc,-1.08*sc);tail1.rotation.x=.18;g.add(tail1);
  const tail2=makeBox(.26*sc,.22*sc,.62*sc,bMat.clone());tail2.position.set(0,-.08*sc,-.76*sc);tail2.rotation.x=.22;tail1.add(tail2);
  const tailTip=makeBox(.14*sc,.14*sc,.28*sc,cMat.clone());tailTip.position.set(0,-.04*sc,-.44*sc);tail2.add(tailTip);
  for(let i=0;i<3;i++){const ts=makeBox(.08*sc,(.2-.04*i)*sc,.07*sc,cMat.clone());ts.position.set(0,.18*sc,(.22-.22*i)*sc);tail1.add(ts);}
  const hpBg=makeBox(2.8*sc,.14,.07,new THREE.MeshBasicMaterial({color:0x003344}));hpBg.position.y=1.9*sc;root.add(hpBg);
  const hpFg=makeBox(2.8*sc,.14,.08,new THREE.MeshBasicMaterial({color:0x00e5ff}));hpFg.position.y=1.9*sc;hpFg.position.z=.01;root.add(hpFg);
  const lc=document.createElement('canvas');lc.width=256;lc.height=48;const lx=lc.getContext('2d');lx.fillStyle='rgba(0,0,0,.65)';lx.fillRect(0,0,256,48);lx.fillStyle='#00e5ff';lx.font='bold 14px sans-serif';lx.textAlign='center';lx.fillText(def.name,128,32);
  const tex=new THREE.CanvasTexture(lc);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));sprite.scale.set(4.5*sc,.65*sc,1);sprite.position.y=2.3*sc;root.add(sprite);
  return{root,body,head,hpBar:hpFg,mat:bMat};
}
function buildBoss(def,sc){
  if(def.finalBoss)return buildKingDragon(sc,def);
  const root=new THREE.Object3D();
  const mat=new THREE.MeshStandardMaterial({color:def.color,roughness:.5,emissive:def.emissive,emissiveIntensity:.35});
  const body=new THREE.Mesh(new THREE.BoxGeometry(.85*sc,1.7*sc,.85*sc),mat.clone());
  const head=new THREE.Mesh(new THREE.BoxGeometry(.7*sc,.7*sc,.7*sc),mat.clone());head.position.y=1.15*sc;
  const eyeM=new THREE.MeshBasicMaterial({color:0xff0000});const eyeG=new THREE.BoxGeometry(.2*sc,.2*sc,.08*sc);
  head.add(new THREE.Mesh(eyeG,eyeM).translateX(-.2*sc).translateY(.08*sc).translateZ(.36*sc));
  head.add(new THREE.Mesh(eyeG,eyeM.clone()).translateX(.2*sc).translateY(.08*sc).translateZ(.36*sc));
  if(def.wave===5){const crownM=new THREE.MeshStandardMaterial({color:0xffd700,emissive:0x886600,emissiveIntensity:.4});for(let i=0;i<5;i++){const spike=new THREE.Mesh(new THREE.BoxGeometry(.12*sc,.3*sc,.12*sc),crownM);spike.position.set((-0.28+i*.14)*sc,.4*sc,.0);head.add(spike);}const aL=new THREE.Mesh(new THREE.BoxGeometry(.22*sc,1.2*sc,.22*sc),mat.clone());aL.position.set(-.58*sc,-.1*sc,0);root.add(aL);const aR=new THREE.Mesh(new THREE.BoxGeometry(.22*sc,1.2*sc,.22*sc),mat.clone());aR.position.set(.58*sc,-.1*sc,0);root.add(aR);}
  else if(def.wave===10){body.scale.x=1.3;body.scale.z=1.2;const lavaM=new THREE.MeshBasicMaterial({color:0xff4400});for(let i=0;i<4;i++){const crack=new THREE.Mesh(new THREE.BoxGeometry(.08*sc,.5*sc,.06*sc),lavaM);crack.position.set((Math.random()-.5)*.6*sc,(Math.random()-.5)*.5*sc,.44*sc);body.add(crack);}const aL=new THREE.Mesh(new THREE.BoxGeometry(.5*sc,1.0*sc,.5*sc),mat.clone());aL.position.set(-.9*sc,-.2*sc,0);root.add(aL);const aR=new THREE.Mesh(new THREE.BoxGeometry(.5*sc,1.0*sc,.5*sc),mat.clone());aR.position.set(.9*sc,-.2*sc,0);root.add(aR);}
  else if(def.wave===15){const pupilM=new THREE.MeshBasicMaterial({color:0xcc00ff});const pupil=new THREE.Mesh(new THREE.BoxGeometry(.35*sc,.35*sc,.1*sc),pupilM);pupil.position.set(0,.05*sc,.36*sc);head.add(pupil);for(let i=0;i<4;i++){const angle=i*(Math.PI/2);const tent=new THREE.Mesh(new THREE.BoxGeometry(.18*sc,1.0*sc,.18*sc),mat.clone());tent.position.set(Math.cos(angle)*.7*sc,-.6*sc,Math.sin(angle)*.7*sc);tent.rotation.z=Math.cos(angle)*.4;tent.rotation.x=Math.sin(angle)*.4;root.add(tent);}}
  const hpBg=new THREE.Mesh(new THREE.BoxGeometry(1.8*sc,.12,.06),new THREE.MeshBasicMaterial({color:0x330000}));hpBg.position.y=2.2*sc;
  const hpFg=new THREE.Mesh(new THREE.BoxGeometry(1.8*sc,.12,.07),new THREE.MeshBasicMaterial({color:0xff1744}));hpFg.position.y=2.2*sc;hpFg.position.z=.01;
  const lc=document.createElement('canvas');lc.width=256;lc.height=48;const lx=lc.getContext('2d');lx.fillStyle='rgba(0,0,0,.65)';lx.fillRect(0,0,256,48);lx.fillStyle='#ff4444';lx.font='bold 20px sans-serif';lx.textAlign='center';lx.fillText(def.name,128,34);
  const tex=new THREE.CanvasTexture(lc);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));sprite.scale.set(3.5*sc,.55*sc,1);sprite.position.y=2.65*sc;
  root.add(body,head,hpBg,hpFg,sprite);return{root,body,head,hpBar:hpFg,mat};
}
function spawnBoss(def){if(boss)return;const angle=Math.random()*Math.PI*2,dist=18;let sx=P.x+Math.cos(angle)*dist,sz=P.z+Math.sin(angle)*dist;const wMin=-WORLD_R*CHUNK+3,wMax=WORLD_R*CHUNK-3;sx=Math.max(wMin,Math.min(wMax,sx));sz=Math.max(wMin,Math.min(wMax,sz));const h=getHeight(Math.floor(sx),Math.floor(sz));const sc=def.scale;const built=buildBoss(def,sc);built.root.position.set(sx,h+1.85*sc,sz);markShadowCaster(built.root);scene.add(built.root);const mhp=def.baseHp+gs.wave*4;boss={root:built.root,body:built.body,head:built.head,hpBar:built.hpBar,mat:built.mat,hp:mhp,maxHp:mhp,def,velY:0,onGround:false,atkCd:0,atkPhase:0,chargeDir:null,chargeT:0,charging:false,phase:1,stuckT:0,lastX:sx,lastZ:sz,flashT:0,breakCd:0,sc};$bossName.textContent=def.name;$bossHpFill.style.width='100%';$bossPhase.textContent='PHASE 1';$bossWrap.classList.add('show');sfxBossAppear();showAlert('👑 BOSS: '+def.name);}
function updateBossHUD(){if(!boss)return;const r=Math.max(0,boss.hp/boss.maxHp);$bossHpFill.style.width=(r*100)+'%';$bossHpFill.style.background=r>.5?'linear-gradient(90deg,#ff1744,#ff6d00)':r>.25?'linear-gradient(90deg,#ff6d00,#ffab00)':'linear-gradient(90deg,#aa0000,#ff1744)';const ph=boss.hp<boss.maxHp*.33?3:boss.hp<boss.maxHp*.66?2:1;if(ph!==boss.phase){boss.phase=ph;$bossPhase.textContent='PHASE '+ph;showBonus('⚡ PHASE '+ph+'!');sfxWave();if(ph===2)boss.body.material.emissiveIntensity=.6;if(ph===3){boss.body.material.emissiveIntensity=1.2;boss.head.material.emissiveIntensity=1.2;}}}
function hitBoss(dmgVal){if(!boss)return;boss.hp-=dmgVal;boss.flashT=.15;boss.body.material.emissive.setHex(0xffffff);boss.body.material.emissiveIntensity=2;boss.head.material.emissive.setHex(0xffffff);boss.head.material.emissiveIntensity=2;const r=Math.max(0,boss.hp/boss.maxHp);boss.hpBar.scale.x=Math.max(.01,r);sfxBossDmg();if(boss.hp<=0)killBoss();}
function killBoss(){
  if(!boss)return;
  const bp=boss.root.position.clone();
  const deathColor=boss.def.deathColor;
  const bossScore=boss.def.score;
  const bossRoot=boss.root;
  for(let i=0;i<12;i++)setTimeout(()=>spawnParticles(bp.x+(Math.random()-.5)*4,bp.y+(Math.random()-.5)*3,bp.z+(Math.random()-.5)*4,deathColor,5),i*80);
  const wDrop=[1,2,3,4][Math.floor(Math.random()*4)];
  const it=ITEM_DEFS[wDrop];
  const mat=new THREE.MeshBasicMaterial({color:it.color,transparent:true,opacity:.9});
  const m=new THREE.Mesh(itemGeo,mat);m.position.set(bp.x,bp.y+1,bp.z);scene.add(m);
  items.push({mesh:m,mat,info:it,x:bp.x,y:bp.y+1,z:bp.z,time:0});
  const hp=ITEM_DEFS[0];
  const mat2=new THREE.MeshBasicMaterial({color:hp.color,transparent:true,opacity:.9});
  const m2=new THREE.Mesh(itemGeo,mat2);m2.position.set(bp.x+1,bp.y+1,bp.z);scene.add(m2);
  items.push({mesh:m2,mat:mat2,info:hp,x:bp.x+1,y:bp.y+1,z:bp.z,time:0});
  gs.score+=bossScore;gs.kills++;
  const wasMiniBoss=boss.def.miniBoss||false;const dDrop=boss.def.diamondDrop||0;
  sfxBossDie();showBonus((wasMiniBoss?'⚡ MINI BOSS DEAD! ':'💀 BOSS DEAD! ')+'+'+bossScore);
  scene.remove(bossRoot);disposeObject3D(bossRoot);const wasFinal=boss.def.finalBoss||false;boss=null;$bossWrap.classList.remove('show');
  if(dDrop>0){const hadDiamond=inv.diamond>0;inv.diamond+=dDrop;updateInvHUD();if(!hadDiamond)unlockAchievement('firstDiamond');setTimeout(()=>showBonus('💎×'+dDrop+' ゲット！'),1000);}
  if(!wasMiniBoss&&!wasFinal)unlockAchievement('bossSlayer');
  if(wasFinal)setTimeout(()=>gameComplete(),2000);
}
function updateBoss(dt){if(!boss)return;const bp=boss.root.position,sc=boss.sc;const dx=P.x-bp.x,dz=P.z-bp.z,dist=Math.hypot(dx,dz);if(boss.flashT>0){boss.flashT-=dt;if(boss.flashT<=0){boss.body.material.emissive.setHex(boss.def.emissive);boss.body.material.emissiveIntensity=.35+boss.phase*.2;boss.head.material.emissive.setHex(boss.def.emissive);boss.head.material.emissiveIntensity=.35+boss.phase*.2;}}const fy=bp.y-(.85*sc);boss.velY-=GRAV*dt;const spd=2+boss.phase*.8+(gs.wave*.15);if(boss.charging){const cd=boss.chargeDir;const nx=bp.x+cd.x*12*dt;const nz=bp.z+cd.z*12*dt;if(!overlaps(nx,fy,bp.z,sc*.4,1.7*sc))bp.x=nx;else if(boss.breakCd<=0){tryBossBreakBlock();boss.breakCd=Math.max(.5,1.2-boss.phase*.15);}if(!overlaps(bp.x,fy,nz,sc*.4,1.7*sc))bp.z=nz;else if(boss.breakCd<=0){tryBossBreakBlock();boss.breakCd=Math.max(.5,1.2-boss.phase*.15);}boss.chargeT-=dt;if(boss.chargeT<=0)boss.charging=false;}else if(dist>2){const nx=bp.x+(dx/dist)*spd*dt;const nz=bp.z+(dz/dist)*spd*dt;if(!overlaps(nx,fy,bp.z,sc*.4,1.7*sc))bp.x=nx;if(!overlaps(bp.x,fy,nz,sc*.4,1.7*sc))bp.z=nz;}const ny=fy+boss.velY*dt;if(!overlaps(bp.x,ny,bp.z,sc*.4,1.7*sc)){bp.y=ny+.85*sc;boss.onGround=false;}else{if(boss.velY<0)boss.onGround=true;boss.velY=0;}if(bp.y<-1){const rh=getHeight(Math.floor(bp.x),Math.floor(bp.z));bp.y=rh+1.85*sc;boss.velY=0;boss.onGround=true;}bp.x=Math.max(-WORLD_R*CHUNK+2,Math.min(WORLD_R*CHUNK-2,bp.x));bp.z=Math.max(-WORLD_R*CHUNK+2,Math.min(WORLD_R*CHUNK-2,bp.z));boss.root.rotation.y=Math.atan2(dx,dz);boss.stuckT+=dt;if(boss.stuckT>1.5){const mv=Math.abs(bp.x-boss.lastX)+Math.abs(bp.z-boss.lastZ);if(mv<.3&&boss.onGround){boss.velY=7;if(boss.breakCd<=0){tryBossBreakBlock();boss.breakCd=Math.max(1,2.5-boss.phase*.3);}}boss.lastX=bp.x;boss.lastZ=bp.z;boss.stuckT=0;}boss.atkCd=Math.max(0,boss.atkCd-dt);boss.breakCd=Math.max(0,boss.breakCd-dt);if(dist<2.5*sc&&boss.atkCd<=0&&hasLOS(bp.x,bp.y,bp.z,P.x,P.y+1,P.z)){dmgPlayer(boss.def.dmg+boss.phase*5);boss.atkCd=1.5-boss.phase*.2;}if(!boss.charging){boss.atkPhase=(boss.atkPhase||0)-dt;if(boss.atkPhase<=0){const pats=boss.def.patterns,pat=pats[Math.floor(Math.random()*pats.length)];boss.atkPhase=Math.max(1.2,3-boss.phase*.5);if(pat==='multishot'){[-0.4,0,0.4].forEach(a=>{const ca=Math.atan2(dx,dz)+a;fireBossArrow(bp.x,bp.y+sc,bp.z,bp.x+Math.sin(ca)*20,bp.y+sc,bp.z+Math.cos(ca)*20,boss.def.dmg*.6);});sfxBow();}else if(pat==='omnishot'){for(let a=0;a<8;a++){const ang=(a/8)*Math.PI*2;fireBossArrow(bp.x,bp.y+sc,bp.z,bp.x+Math.sin(ang)*20,bp.y+sc,bp.z+Math.cos(ang)*20,boss.def.dmg*.5);}sfxBow();sfxMagic();}else if(pat==='charge'){if(dist>4){sfxCharge();boss.charging=true;boss.chargeDir={x:dx/dist,z:dz/dist};boss.chargeT=0.6;boss.velY=4;}}else if(pat==='stomp'){if(boss.onGround){boss.velY=8;sfxHammer();}if(dist<6&&hasLOS(bp.x,bp.y,bp.z,P.x,P.y+1,P.z)){dmgPlayer(boss.def.dmg*.8);spawnParticles(bp.x,bp.y,bp.z,boss.def.deathColor,5);}}else if(pat==='aoeBlast'){spawnParticles(bp.x,bp.y+.5,bp.z,boss.def.deathColor,8);if(dist<7&&hasLOS(bp.x,bp.y+sc,bp.z,P.x,P.y+1,P.z)){dmgPlayer(boss.def.dmg*1.2);sfxMagic();}for(const e of enemies){const ed=Math.hypot(e.root.position.x-bp.x,e.root.position.z-bp.z);if(ed<8)e.hp=Math.min(e.hp+2,e.maxHp);}}}}boss.hpBar.lookAt(camera.position);updateBossHUD();}
function updateDragon(dt){
  if(!dragon)return;
  const dp=dragon.root.position;
  const px=P.x,py=P.y+1.5,pz=P.z;
  const dx=px-dp.x,dz=pz-dp.z,dist=Math.hypot(dx,dz);
  // Flash recovery
  if(dragon.flashT>0){dragon.flashT-=dt;if(dragon.flashT<=0){dragon.body.material.emissive.setHex(0x001020);dragon.body.material.emissiveIntensity=.3;dragon.head.material.emissive.setHex(0x001020);dragon.head.material.emissiveIntensity=.3;}}
  // Core pulse + wing flap
  dragon.coreT+=dt;
  dragon.core.material.emissiveIntensity=dragon.state==='telegraph'?5.0:(1.8+Math.sin(dragon.coreT*4)*.6);
  dragon.wingL.rotation.z=Math.sin(dragon.coreT*5)*.28;
  dragon.wingR.rotation.z=-Math.sin(dragon.coreT*5)*.28;
  // Face player
  if(dist>0.5)dragon.root.rotation.y=Math.atan2(dx,dz);
  // Contact damage
  dragon.atkCd=Math.max(0,dragon.atkCd-dt);
  if(dragon.atkCd<=0&&Math.hypot(dx,py-dp.y,dz)<2.3){dmgPlayer(25);dragon.atkCd=1.4;}
  // Hover toward player Y (always), clamp underground
  const targetY=Math.min(py,-0.6);
  dp.y+=(targetY-dp.y)*2.5*dt;
  if(dp.y>-0.4)dp.y=-0.4;
  // State machine
  dragon.stateT-=dt;
  if(dragon.state==='prowl'){
    if(dist>2.5){
      const nx=dp.x+(dx/dist)*4*dt;if(!overlaps(nx,dp.y-.3,dp.z,.4,.7))dp.x=nx;
      const nz=dp.z+(dz/dist)*4*dt;if(!overlaps(dp.x,dp.y-.3,nz,.4,.7))dp.z=nz;
    }
    if(dragon.stateT<=0){
      dragon.stateT=2.5+Math.random()*2;
      if(dist<14){dragon.state='telegraph';dragon.stateT=0.75;dragon.chargeDir={x:dx/(dist||1),z:dz/(dist||1)};playTone(120,.2,.15,'sawtooth');}
    }
  }else if(dragon.state==='telegraph'){
    if(dragon.stateT<=0){dragon.state='charge';dragon.stateT=0.45;sfxCharge();}
  }else if(dragon.state==='charge'){
    let wallHit=false;
    const nx=dp.x+dragon.chargeDir.x*18*dt;if(!overlaps(nx,dp.y-.3,dp.z,.4,.7))dp.x=nx;else wallHit=true;
    const nz=dp.z+dragon.chargeDir.z*18*dt;if(!overlaps(dp.x,dp.y-.3,nz,.4,.7))dp.z=nz;else wallHit=true;
    if(dragon.stateT<=0||wallHit){dragon.state='recoil';dragon.stateT=1.8;}
  }else if(dragon.state==='recoil'){
    const nx=dp.x-dragon.chargeDir.x*2*dt;if(!overlaps(nx,dp.y-.3,dp.z,.4,.7))dp.x=nx;
    const nz=dp.z-dragon.chargeDir.z*2*dt;if(!overlaps(dp.x,dp.y-.3,nz,.4,.7))dp.z=nz;
    if(dragon.stateT<=0){dragon.state='prowl';dragon.stateT=2.5+Math.random()*2;}
  }
  const wMin=-WORLD_R*CHUNK+2,wMax=WORLD_R*CHUNK-2;
  dp.x=Math.max(wMin,Math.min(wMax,dp.x));dp.z=Math.max(wMin,Math.min(wMax,dp.z));
}

// ═══ ITEMS ═══
let items=[];
const ITEM_DEFS=[
  {name:'❤ HP薬',  type:'hp',    value:25,color:0xff4444},
  {name:'⚔ Sword', type:'weapon',wi:1,   color:0x44aaff},
  {name:'🔨 Hammer',type:'weapon',wi:2,   color:0xaa44ff},
  {name:'🏹 Bow',   type:'weapon',wi:3,   color:0x44ff44},
  {name:'🪄 Magic', type:'weapon',wi:4,   color:0xff44ff},
  {name:'⭐ +Score',type:'score', value:30,color:0xffff00},
];
const itemGeo=new THREE.BoxGeometry(.35,.35,.35);
function dropItem(x,y,z,etype){
  if(Math.random()>.45)return;
  const pool=ITEM_DEFS.filter(i=>i.type!=='weapon');
  const it=pool[Math.floor(Math.random()*pool.length)];
  const mat=new THREE.MeshBasicMaterial({color:it.color,transparent:true,opacity:.9});
  const m=new THREE.Mesh(itemGeo,mat);m.position.set(x,y+.5,z);scene.add(m);
  items.push({mesh:m,mat,info:it,x,y:y+.5,z,time:0});
}

// ═══ CHESTS ═══
let chests=[];
let chestCount=0;
const $chestLabel=document.getElementById('invChest');
function updateChestHUD(){if($chestLabel)$chestLabel.textContent='📦 CHEST: '+chestCount;}
const $chestInfo=document.getElementById('chestInfo');
function updateChestInfo(){
  if(!gs.running||chests.length===0){$chestInfo.classList.remove('show');return;}
  let nearest=null,nearDist=99;
  for(const c of chests){const dx=c.x+.5-P.x,dz=c.z+.5-P.z,dy=c.y+.35-(P.y+.8);const d=Math.hypot(dx,dy,dz);if(d<2.5&&d<nearDist){nearDist=d;nearest=c;}}
  if(!nearest){$chestInfo.classList.remove('show');return;}
  const ct=nearest.contents;const parts=[];
  if(ct.wood>0)parts.push('🪵'+ct.wood);if(ct.stone>0)parts.push('🪨'+ct.stone);
  if(ct.sand>0)parts.push('🏖'+ct.sand);if(ct.grass>0)parts.push('🌿'+ct.grass);
  if(ct.brick>0)parts.push('🧱'+ct.brick);if(ct.meat>0)parts.push('🥩'+ct.meat);
  $chestInfo.textContent=parts.length?'📦 '+parts.join(' '):'📦 空';
  $chestInfo.classList.add('show');
}

const _chestGeo=new THREE.BoxGeometry(.9,.7,.7);
const _chestMatBody=new THREE.MeshStandardMaterial({color:0x6d3a1e,roughness:.85});
const _chestMatLid=new THREE.MeshStandardMaterial({color:0x8b4a25,roughness:.8});
const _chestMatLock=new THREE.MeshStandardMaterial({color:0xd4a96a,roughness:.4,metalness:.5});
function makeChestMesh(){
  const root=new THREE.Object3D();
  const body=new THREE.Mesh(_chestGeo,_chestMatBody.clone());body.position.y=.35;
  const lid=new THREE.Mesh(new THREE.BoxGeometry(.9,.2,.7),_chestMatLid.clone());lid.position.y=.75;
  const lock=new THREE.Mesh(new THREE.BoxGeometry(.14,.14,.08),_chestMatLock.clone());lock.position.set(0,.72,.36);
  const lineM=new THREE.MeshBasicMaterial({color:0x4a2510});
  const lh=new THREE.Mesh(new THREE.BoxGeometry(.92,.06,.72),lineM);lh.position.y=.52;
  root.add(body,lid,lock,lh);markShadowCaster(root);return root;
}
function placeChest(){
  if(!gs.running)return;if(chestCount<=0){showBonus('チェストがない！');return;}
  const bh=castVoxel();if(!bh)return;
  const n=bh.face.normal,d=bh.object.userData;
  const px=d.x+Math.round(n.x),py=d.y+Math.round(n.y),pz=d.z+Math.round(n.z);
  for(const c of chests){if(Math.floor(c.x)===px&&Math.floor(c.y)===py&&Math.floor(c.z)===pz)return;}
  if(px<P.x+.45&&px+1>P.x-.45&&py<P.y+1.75&&py+1>P.y&&pz<P.z+.45&&pz+1>P.z-.45)return;
  const mesh=makeChestMesh();mesh.position.set(px+.5,py,pz+.5);scene.add(mesh);
  chestCount--;chests.push({mesh,x:px,y:py,z:pz,contents:{wood:0,stone:0,sand:0,grass:0,brick:0,meat:0}});
  updateChestHUD();sfxPlace();showBonus('📦 チェスト設置！');unlockAchievement('firstBase');
}
function interactChest(){
  if(!gs.running)return;
  let nearest=null,nearDist=2.2;
  for(const c of chests){const dx=c.x+.5-P.x,dz=c.z+.5-P.z,dy=c.y+.35-(P.y+.8);const dist=Math.hypot(dx,dy,dz);if(dist<nearDist){nearDist=dist;nearest=c;}}
  if(!nearest)return;
  const hasContents=Object.values(nearest.contents).some(v=>v>0);
  if(!hasContents){
    nearest.contents.wood+=inv.wood;nearest.contents.stone+=inv.stone;nearest.contents.sand+=inv.sand;
    nearest.contents.grass+=inv.grass;nearest.contents.brick+=inv.brick;nearest.contents.meat+=meat;
    inv.wood=0;inv.stone=0;inv.sand=0;inv.grass=0;inv.brick=0;meat=0;
    updateInvHUD();updateMeatHUD();showBonus('📦 預けた');playTone(600,.1,.1,'sine');
  } else {
    inv.wood+=nearest.contents.wood;inv.stone+=nearest.contents.stone;inv.sand+=nearest.contents.sand;
    inv.grass+=nearest.contents.grass;inv.brick+=nearest.contents.brick;meat+=nearest.contents.meat;
    nearest.contents={wood:0,stone:0,sand:0,grass:0,brick:0,meat:0};
    updateInvHUD();updateMeatHUD();showBonus('📦 取り出した');playTone(800,.1,.1,'sine');
  }
}
function resetChests(){for(const c of chests)scene.remove(c.mesh);chests=[];chestCount=0;updateChestHUD();}

// ═══ BEDS ═══
let beds=[];
let bedCount=0;
const $bedLabel=document.getElementById('invBed');
function updateBedHUD(){if($bedLabel)$bedLabel.textContent='🛏 BED: '+bedCount;}

const _bedGeos={
  base:new THREE.BoxGeometry(1.0,.3,1.8),mat:new THREE.BoxGeometry(.98,.25,1.75),
  pillow:new THREE.BoxGeometry(.7,.18,.45),leg:new THREE.BoxGeometry(.12,.25,.12),
};
const _bedMats={
  wood:new THREE.MeshStandardMaterial({color:0x6d3a1e,roughness:.85}),
  sheet:new THREE.MeshStandardMaterial({color:0xeeeeff,roughness:.9}),
  pillow:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8}),
};
function makeBedMesh(){
  const root=new THREE.Object3D();
  const base=new THREE.Mesh(_bedGeos.base,_bedMats.wood.clone());base.position.y=.15;
  const mat=new THREE.Mesh(_bedGeos.mat,_bedMats.sheet.clone());mat.position.y=.31;
  const pillow=new THREE.Mesh(_bedGeos.pillow,_bedMats.pillow.clone());pillow.position.set(0,.42,.62);
  const legPos=[[-0.42,-.12,.82],[.42,-.12,.82],[-.42,-.12,-.82],[.42,-.12,-.82]];
  const legs=legPos.map(([x,y,z])=>{const l=new THREE.Mesh(_bedGeos.leg,_bedMats.wood.clone());l.position.set(x,y,z);return l;});
  root.add(base,mat,pillow,...legs);markShadowCaster(root);return root;
}
function placeBed(){
  if(!gs.running)return;if(bedCount<=0){showBonus('ベッドがない！');return;}
  const bh=castVoxel();if(!bh)return;
  const n=bh.face.normal,d=bh.object.userData;
  const px=d.x+Math.round(n.x),py=d.y+Math.round(n.y),pz=d.z+Math.round(n.z);
  for(const b of beds){if(Math.floor(b.x)===px&&Math.floor(b.y)===py&&Math.floor(b.z)===pz)return;}
  if(px<P.x+.45&&px+1>P.x-.45&&py<P.y+1.75&&py+1>P.y&&pz<P.z+.45&&pz+1.8>P.z-.45)return;
  const mesh=makeBedMesh();mesh.position.set(px+.5,py,pz+.9);scene.add(mesh);
  bedCount--;beds.push({mesh,x:px,y:py,z:pz});
  updateBedHUD();sfxPlace();showBonus('🛏 ベッド設置！');unlockAchievement('firstBase');
}
function sleepBed(){
  if(!gs.running)return;
  let nearest=null,nearDist=2.5;
  for(const b of beds){
    const dx=b.x+.5-P.x,dz=b.z+.9-P.z,dy=b.y+.3-(P.y+.8);
    const dist=Math.hypot(dx,dy,dz);
    if(dist<nearDist){nearDist=dist;nearest=b;}
  }
  if(!nearest)return;
  // 夜だけ眠れる：gs.time 0.4〜0.9 が夜
  const isNight=(gs.time>=0.4&&gs.time<=0.9);
  if(!isNight){
    showBonus('☀ まだ眠る時間じゃない');
    playTone(300,.1,.08,'sine');
    return;
  }
  if(boss||enemies.some(e=>Math.hypot(e.root.position.x-P.x,e.root.position.z-P.z)<12)){
    showBonus('⚠ 近くに敵がいて眠れない！');
    playTone(200,.15,.1,'sawtooth');
    return;
  }
  gs.time=0.05;
  gs.day++;
  P.hp=Math.min(P.maxHp,P.hp+40);
  gs.nextWave=Math.max(gs.nextWave,20);
  showAlert('🌅 朝になった  DAY '+gs.day);
  showBonus('🛏 HP回復 +40');
  playTone(440,.2,.1,'sine');
  setTimeout(()=>playTone(550,.2,.08,'sine'),150);
  setTimeout(()=>playTone(660,.3,.07,'sine'),300);
}
function resetBeds(){for(const b of beds)scene.remove(b.mesh);beds=[];bedCount=0;updateBedHUD();}

let trophies=[];
let trophyCount=0;
const $trophyLabel=document.getElementById('invTrophy');
function updateTrophyHUD(){if($trophyLabel)$trophyLabel.textContent='🏆 DRAGON STATUE: '+trophyCount;}
function makeTrophyMesh(){
  const root=new THREE.Object3D();
  const bMat=new THREE.MeshStandardMaterial({color:0x1b2838,roughness:.3,emissive:0x001525,emissiveIntensity:.6});
  const cMat=new THREE.MeshStandardMaterial({color:0x00b4d8,emissive:0x00e5ff,emissiveIntensity:1.4,roughness:.1});
  const pedMat=new THREE.MeshStandardMaterial({color:0x2a2e3d,roughness:.75});
  const ped=new THREE.Mesh(new THREE.BoxGeometry(.7,.14,.7),pedMat);ped.position.y=.07;
  const body=new THREE.Mesh(new THREE.BoxGeometry(.34,.38,.28),bMat.clone());body.position.y=.34;
  const head=new THREE.Mesh(new THREE.BoxGeometry(.19,.17,.21),bMat.clone());head.position.set(0,.60,.05);
  const snout=new THREE.Mesh(new THREE.BoxGeometry(.12,.1,.14),bMat.clone());snout.position.set(0,.57,.19);
  const wingL=new THREE.Mesh(new THREE.BoxGeometry(.07,.26,.20),cMat.clone());wingL.position.set(-.27,.44,0);wingL.rotation.z=.38;
  const wingR=new THREE.Mesh(new THREE.BoxGeometry(.07,.26,.20),cMat.clone());wingR.position.set(.27,.44,0);wingR.rotation.z=-.38;
  const core=new THREE.Mesh(new THREE.OctahedronGeometry(.09,0),cMat.clone());core.position.set(0,.37,.16);
  root.add(ped,body,head,snout,wingL,wingR,core);
  markShadowCaster(root);
  return root;
}
function placeTrophy(){
  if(!gs.running)return;if(trophyCount<=0){showBonus('ドラゴン像がない！クラフトしよう');return;}
  const bh=castVoxel();if(!bh)return;
  const n=bh.face.normal,d=bh.object.userData;
  const px=d.x+Math.round(n.x),py=d.y+Math.round(n.y),pz=d.z+Math.round(n.z);
  for(const t of trophies){if(Math.floor(t.x)===px&&Math.floor(t.y)===py&&Math.floor(t.z)===pz)return;}
  if(px<P.x+.4&&px+1>P.x-.4&&py<P.y+1.75&&py+1>P.y&&pz<P.z+.4&&pz+1>P.z-.4)return;
  const mesh=makeTrophyMesh();mesh.position.set(px+.5,py,pz+.5);scene.add(mesh);
  trophyCount--;trophies.push({mesh,x:px,y:py,z:pz});
  updateTrophyHUD();sfxPlace();showBonus('🏆 ドラゴン像を設置した！');
}
function resetTrophies(){for(const t of trophies)scene.remove(t.mesh);trophies=[];trophyCount=0;updateTrophyHUD();}

// ═══ MOBS（豚） ═══
const mobs=[];const MAX_MOBS=15;let meat=0;
const _pigGeos={body:new THREE.BoxGeometry(.9,.65,.6),head:new THREE.BoxGeometry(.58,.52,.52),leg:new THREE.BoxGeometry(.2,.45,.2),nose:new THREE.BoxGeometry(.26,.18,.08),eye:new THREE.BoxGeometry(.09,.09,.05)};
const _pigMatBase={body:new THREE.MeshStandardMaterial({color:0xf4a9a8,roughness:.9}),leg:new THREE.MeshStandardMaterial({color:0xe8968f,roughness:.9}),nose:new THREE.MeshStandardMaterial({color:0xf08080,roughness:.8}),eye:new THREE.MeshBasicMaterial({color:0x111111})};
function makePigMesh(){
  const root=new THREE.Object3D();
  const body=new THREE.Mesh(_pigGeos.body,_pigMatBase.body.clone());body.position.y=.32;
  const head=new THREE.Mesh(_pigGeos.head,_pigMatBase.body.clone());head.position.set(0,.68,.34);
  const nose=new THREE.Mesh(_pigGeos.nose,_pigMatBase.nose.clone());nose.position.set(0,-.08,.27);head.add(nose);
  const eyeL=new THREE.Mesh(_pigGeos.eye,_pigMatBase.eye.clone());eyeL.position.set(-.16,.07,.27);head.add(eyeL);
  const eyeR=new THREE.Mesh(_pigGeos.eye,_pigMatBase.eye.clone());eyeR.position.set(.16,.07,.27);head.add(eyeR);
  const legPos=[[-.25,-.06,.16],[.25,-.06,.16],[-.25,-.06,-.16],[.25,-.06,-.16]];
  const legs=legPos.map(([x,y,z])=>{const l=new THREE.Mesh(_pigGeos.leg,_pigMatBase.leg.clone());l.position.set(x,y,z);return l;});
  root.add(body,head,...legs);return{root,body,head,legs};
}
function createPig(wx,wz){
  if(mobs.length>=MAX_MOBS)return;
  const h=getHeight(Math.floor(wx),Math.floor(wz));const built=makePigMesh();built.root.position.set(wx,h+1.05,wz);markShadowCaster(built.root);scene.add(built.root);
  mobs.push({root:built.root,body:built.body,head:built.head,legs:built.legs,hp:3,maxHp:3,velY:0,onGround:false,wanderAngle:Math.random()*Math.PI*2,wanderT:0,hitFlash:0,oinkT:2+Math.random()*5,dead:false});
}
function spawnPigs(count=8){
  for(let i=0;i<count;i++){
    const angle=Math.random()*Math.PI*2,dist=10+Math.random()*20;
    const wx=P.x+Math.cos(angle)*dist,wz=P.z+Math.sin(angle)*dist;
    const wMin=-WORLD_R*CHUNK+2,wMax=WORLD_R*CHUNK-2;
    createPig(Math.max(wMin,Math.min(wMax,wx)),Math.max(wMin,Math.min(wMax,wz)));
  }
}
function killMob(mob){scene.remove(mob.root);mob.dead=true;meat++;updateMeatHUD();showBonus('🥩 MEAT x'+meat);playTone(500,.12,.1,'sine');spawnParticles(mob.root.position.x,mob.root.position.y,mob.root.position.z,0xf4a9a8,3);}
function hitMob(mob,damage=1){if(mob.dead)return;mob.hp-=damage;mob.hitFlash=.15;mob.root.scale.set(1.3,.7,1.3);sfxOink();if(mob.hp<=0)killMob(mob);}
const _atkDir=new THREE.Vector3();
function attackMobs(w){
  if(w.type==='ranged')return;camera.getWorldDirection(_atkDir);const range=w.type==='aoe'?w.range:(w.range+.5);
  for(let i=mobs.length-1;i>=0;i--){const mob=mobs[i];if(mob.dead)continue;const mp=mob.root.position;const hdx=mp.x-P.x,hdz=mp.z-P.z,hdist=Math.hypot(hdx,hdz);if(hdist>range)continue;if(w.type==='aoe'){hitMob(mob,w.dmg);}else{const hlen=Math.hypot(_atkDir.x,_atkDir.z)||1;const dot=(hdx/hdist)*(_atkDir.x/hlen)+(hdz/hdist)*(_atkDir.z/hlen);if(dot>0.3)hitMob(mob,w.dmg);}}
}
function updateMobs(dt){
  const FLEE_DIST=6,WANDER_SPD=1.4,FLEE_SPD=4.2;const swing=Math.sin(Date.now()*.006)*.35;
  for(let i=mobs.length-1;i>=0;i--){
    const mob=mobs[i];if(mob.dead){mobs.splice(i,1);continue;}
    const mp=mob.root.position;const dx=P.x-mp.x,dz=P.z-mp.z,dist=Math.hypot(dx,dz);
    const tooFar=dist>55;mob.root.visible=!tooFar;if(tooFar)continue;
    if(mob.hitFlash>0){mob.hitFlash-=dt;if(mob.hitFlash<=0)mob.root.scale.set(1,1,1);}
    mob.oinkT-=dt;if(mob.oinkT<=0){mob.oinkT=4+Math.random()*6;if(dist<20)sfxOink();}
    mob.velY-=GRAV*dt;const fy=mp.y-.5;const ny=fy+mob.velY*dt;
    if(!overlaps(mp.x,ny,mp.z,.38,.95)){mp.y=ny+.5;mob.onGround=false;}else{if(mob.velY<0)mob.onGround=true;mob.velY=0;}
    if(mp.y<-10){const rh=getHeight(Math.floor(mp.x),Math.floor(mp.z));mp.y=rh+1.05;mob.velY=0;continue;}
    let moveX=0,moveZ=0;
    if(dist<FLEE_DIST){const l=dist||1;moveX=-(dx/l)*FLEE_SPD;moveZ=-(dz/l)*FLEE_SPD;mob.root.rotation.y=Math.atan2(-dx,-dz);if(mob.onGround&&Math.random()<.012)mob.velY=5;}
    else{mob.wanderT-=dt;if(mob.wanderT<=0){mob.wanderAngle+=(Math.random()-.5)*Math.PI;mob.wanderT=1.5+Math.random()*2;}moveX=Math.sin(mob.wanderAngle)*WANDER_SPD;moveZ=Math.cos(mob.wanderAngle)*WANDER_SPD;mob.root.rotation.y=mob.wanderAngle;}
    const nx2=mp.x+moveX*dt;if(!overlaps(nx2,fy,mp.z,.38,.95))mp.x=nx2;
    const nz2=mp.z+moveZ*dt;if(!overlaps(mp.x,fy,nz2,.38,.95))mp.z=nz2;
    const _wMin=-WORLD_R*CHUNK+2,_wMax=WORLD_R*CHUNK-2;mp.x=Math.max(_wMin,Math.min(_wMax,mp.x));mp.z=Math.max(_wMin,Math.min(_wMax,mp.z));
    const moving=Math.abs(moveX)+Math.abs(moveZ)>.1;if(moving&&mob.legs){for(let li=0;li<4;li++){mob.legs[li].rotation.x=(li%2===0?1:-1)*swing;}}
  }
}

// ═══ MEAT HUD ═══
function updateMeatHUD(){$meatLabel.textContent='🥩 MEAT: '+meat;if(meat>0)$eatBtn.classList.remove('disabled');else $eatBtn.classList.add('disabled');}
function eatMeat(){if(meat<=0||!gs.running)return;meat--;P.hp=Math.min(P.maxHp,P.hp+MEAT_HP);gs.score+=MEAT_SCORE;updateMeatHUD();showBonus('🍖 +'+MEAT_HP+'HP  +'+MEAT_SCORE);playTone(700,.15,.1,'sine');setTimeout(()=>playTone(900,.1,.08,'sine'),100);}
let _eatBtnLastT=0;
function _onEatBtnTap(){const now=Date.now();if(now-_eatBtnLastT<100)return;_eatBtnLastT=now;eatMeat();}
bindTapSafe($eatBtn,_onEatBtnTap);

// ═══ GAME STATE ═══
const gs={running:false,score:0,kills:0,day:1,time:0,wave:0,nextWave:15,paused:false};
const DAY_DUR=90;
function startWave(){gs.wave++;if(gs.wave>=5)unlockAchievement('wave5');if(gs.wave>=20)unlockAchievement('finalChallenge');const bossDef=BOSS_DEFS.find(b=>b.wave===gs.wave);if(bossDef&&bossDef.finalBoss){finalBossPending=true;showAlert('⚠ 最終決戦の時… 地上へ戻れ！');playTone(80,.3,.6,'sawtooth');setTimeout(()=>{if(gs.running)playTone(120,.2,.4,'sawtooth');},400);gs.nextWave=DAY_DUR*3;}else if(bossDef&&bossDef.miniBoss){showAlert('⚡ MINI BOSS WAVE '+gs.wave+'!  '+bossDef.name);playTone(320,.2,.3,'sawtooth');setTimeout(()=>playTone(480,.15,.25,'sawtooth'),200);setTimeout(()=>{if(gs.running)spawnBoss(bossDef);},1200);const n=Math.min(4+gs.wave,10);for(let i=0;i<n;i++)setTimeout(()=>{if(gs.running)spawnEnemy();},600+i*350);gs.nextWave=Math.min(DAY_DUR*(.8+gs.wave*.04),DAY_DUR*1.1);}else if(bossDef){showAlert('👑 BOSS WAVE '+gs.wave+'!');sfxBossAppear();setTimeout(()=>{if(gs.running)spawnBoss(bossDef);},1500);const n=Math.min(2+gs.wave,6);for(let i=0;i<n;i++)setTimeout(()=>{if(gs.running)spawnEnemy();},500+i*400);gs.nextWave=Math.min(DAY_DUR*(.7+gs.wave*.05),DAY_DUR*1.2);}else{const n=Math.min(3+gs.wave*2,16);for(let i=0;i<n;i++)setTimeout(()=>{if(gs.running)spawnEnemy();},i*350);showAlert('⚠️ WAVE '+gs.wave+'  ('+n+'体)');sfxWave();gs.nextWave=Math.min(DAY_DUR*(.7+gs.wave*.05),DAY_DUR*1.2);}}

// ═══ HUD ═══
const $sv=document.getElementById('scoreVal'),$kv=document.getElementById('killVal'),$dv=document.getElementById('dayVal'),$di=document.getElementById('dayIcon'),$hf=document.getElementById('hpFill'),$wa=document.getElementById('waveAlert'),$df=document.getElementById('dmgFlash'),$bp=document.getElementById('bonusPopup'),$bl=document.getElementById('biomeLabel'),$cd=document.getElementById('coordsDisplay'),$wt=document.getElementById('waveTimer'),$goalLabel=document.getElementById('goalLabel');
const $pauseBtn=document.getElementById('pauseBtn'),$pauseOverlay=document.getElementById('pauseOverlay');
const $resumeBtn=document.getElementById('resumeBtn'),$pauseSaveBtn=document.getElementById('pauseSaveBtn');
function togglePause(){
  if(!gs.running)return;
  gs.paused=!gs.paused;
  if(gs.paused){
    $pauseOverlay.classList.add('show');$pauseBtn.textContent='▶';
    if(audioCtx&&audioCtx.state==='running')audioCtx.suspend();
  }else{
    $pauseOverlay.classList.remove('show');$pauseBtn.textContent='⏸';
    lastT=performance.now();
    if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
  }
}
let waTimer=0,bpTimer=0;
const showAlert=t=>{$wa.textContent=t;$wa.classList.add('show');waTimer=2.5;};
const showBonus=t=>{$bp.textContent=t;$bp.classList.add('show');bpTimer=1.5;};
function dmgPlayer(v){if(P.invT>0)return;P.hp=Math.max(0,P.hp-v*difficultyMult());P.invT=.8;if(settings.flash){$df.classList.add('on');setTimeout(()=>$df.classList.remove('on'),130);}sfxDmg();if(P.hp<=0)gameOver();}
function dmgLava(){P.hp=Math.max(0,P.hp-8);if(settings.flash){$lavaFlash.classList.add('on');setTimeout(()=>$lavaFlash.classList.remove('on'),200);}sfxLava();if(P.hp<=0)gameOver();}
function dmgSnow(){P.hp=Math.max(0,P.hp-3);if(settings.flash){$snowFlash.classList.add('on');setTimeout(()=>$snowFlash.classList.remove('on'),200);}sfxSnow();if(P.hp<=0)gameOver();}
function matProgress(mat,need){return (inv[mat]||0)+'/'+need;}
function getCurrentGoal(){
  if(!gs.running)return '🎯 NEW GAMEで冒険開始';
  if(P.hp<=35&&meat>0)return '🍖 HPが低い！肉で回復しよう';
  if(!unlockedWeapons[1])return '🪵 木を集めて剣を作ろう WOOD '+matProgress('wood',5);
  if(!unlockedWeapons[2])return '🪨 石を集めてハンマー作成 STONE '+matProgress('stone',10)+' / WOOD '+matProgress('wood',4);
  if(bedCount===0&&beds.length===0)return '🛏 ベッドで夜をスキップ WOOD '+matProgress('wood',6)+' / GRASS '+matProgress('grass',4);
  if(!unlockedWeapons[3])return '🏹 弓を作って遠距離対策 WOOD '+matProgress('wood',3)+' / STONE '+matProgress('stone',3);
  if(inv.diamond===0&&!hasDiamondSword)return '💎 地下深くでダイヤを探そう';
  if(!hasDiamondSword)return '💎 ダイヤ剣を作ろう DIAMOND '+matProgress('diamond',3)+' / WOOD '+matProgress('wood',1);
  if(finalBossPending)return '⚠ 地上へ戻って最終決戦に備えよう';
  if(boss)return '👑 ボスを倒せ！攻撃後は距離を取ろう';
  if(dragon)return '💎 地下ドラゴン戦！ダイヤ武器が有効';
  if(gs.wave<5)return '⚔ WAVE5のボスまで生き残ろう 現在WAVE '+gs.wave;
  if(gs.wave<20)return '🌊 WAVE20まで装備と拠点を強化しよう 現在WAVE '+gs.wave;
  return '🏆 キングダイヤモンドドラゴンを倒してクリア！';
}
function updateGoalHUD(){if($goalLabel)$goalLabel.textContent=getCurrentGoal();}
function updateHUD(){
  $sv.textContent=gs.score;$kv.textContent=gs.kills;$dv.textContent='DAY '+gs.day;
  const pct=Math.max(0,Math.min(100,P.hp));$hf.style.width=pct+'%';
  $hf.style.background=pct>40?'linear-gradient(90deg,#43a047,#a5d6a7)':'linear-gradient(90deg,#e53935,#ff8a80)';
  $bl.textContent=getBiomeName(getBiome(Math.floor(P.x),Math.floor(P.z)));
  $cd.textContent='X:'+Math.floor(P.x)+' Z:'+Math.floor(P.z);
  const w=WEAPONS[weaponIdx];$wl.textContent=w.name+(unlockedWeapons[weaponIdx]?'':'🔒');
  updateGoalHUD();
  const cdRatio=attackCD>0?attackCD/w.cd:0;$cdFill.style.width=(cdRatio*100)+'%';
  updateChestInfo();_updateTreasureInfo();
  const nextDef=BOSS_DEFS.find(b=>b.wave===gs.wave+1);
  const isBossNext=!!nextDef&&!nextDef.miniBoss;const isMiniBossNext=!!nextDef&&!!nextDef.miniBoss;
  if(gs.nextWave>0&&gs.nextWave<=10){
    const label=isBossNext?'👑 BOSS WAVE ':isMiniBossNext?'⚡ MINI BOSS ':'⚠️ WAVE ';
    $wt.textContent=label+(gs.wave+1)+' まで '+Math.ceil(gs.nextWave)+'秒';
    $wt.className='show'+(isBossNext||isMiniBossNext?' boss':'');
  }else{$wt.classList.remove('show');}
}

const miniCanvas=document.getElementById('miniCanvas');const miniCtx=miniCanvas.getContext('2d');
function drawMinimap(){const S=90;miniCtx.fillStyle='rgba(0,0,0,.75)';miniCtx.fillRect(0,0,S,S);const sc=1.2,cx=S/2,cy=S/2;for(let dx=-20;dx<=20;dx+=2)for(let dz=-20;dz<=20;dz+=2){const wx=Math.floor(P.x)+dx,wz=Math.floor(P.z)+dz,b=getBiome(wx,wz);miniCtx.fillStyle=['#3a7d3a','#c4a44a','#1b5e1b','#6a6a6a','#cc3300','#aaccee'][b];miniCtx.fillRect(cx+dx*sc-1,cy+dz*sc-1,3,3);}
  for(const mob of mobs){const mp=mob.root.position,mx2=cx+(mp.x-P.x)*sc,my2=cy+(mp.z-P.z)*sc;if(mx2>-2&&mx2<S+2&&my2>-2&&my2<S+2){miniCtx.fillStyle='#f4a9a8';miniCtx.fillRect(mx2-1.5,my2-1.5,3,3);}}
  for(const e of enemies){const p=e.root.position,ex=cx+(p.x-P.x)*sc,ey=cy+(p.z-P.z)*sc;if(ex<-2||ex>S+2||ey<-2||ey>S+2)continue;miniCtx.fillStyle=e.type.lava?'#ff6600':e.type.ice?'#44ddff':e.type.name==='Skeleton'?'#eeeeff':e.type.name==='Golem'?'#4488ff':'#ff4444';miniCtx.fillRect(ex-1.5,ey-1.5,3,3);}
  if(boss){const p=boss.root.position,bx=cx+(p.x-P.x)*sc,by=cy+(p.z-P.z)*sc;if(bx>-5&&bx<S+5&&by>-5&&by<S+5){miniCtx.fillStyle='#ff0066';miniCtx.fillRect(bx-3,by-3,6,6);}}
  for(const it of items){const ix=cx+(it.x-P.x)*sc,iy=cy+(it.z-P.z)*sc;if(ix>-2&&ix<S+2&&iy>-2&&iy<S+2){miniCtx.fillStyle='#ffff00';miniCtx.fillRect(ix-1,iy-1,2,2);}}
  miniCtx.fillStyle='#44ff44';miniCtx.beginPath();miniCtx.arc(cx,cy,2.5,0,Math.PI*2);miniCtx.fill();
  const ddx=Math.sin(yaw)*7,ddy=-Math.cos(yaw)*7;miniCtx.strokeStyle='#44ff44';miniCtx.lineWidth=1.5;miniCtx.beginPath();miniCtx.moveTo(cx,cy);miniCtx.lineTo(cx+ddx,cy+ddy);miniCtx.stroke();
}

function updateUnderAtmosphere(py){
  const depth=-py;
  let fr,fg,fb,hi;
  if(depth<10){const t=depth/10;fr=0.04+t*0.01;fg=0.05+t*0.01;fb=0.10+t*0.02;hi=Math.max(0.12,0.35-t*0.15);}
  else if(depth<22){const t=(depth-10)/12;fr=0.05-t*0.03;fg=0.06-t*0.03;fb=0.12+t*0.01;hi=Math.max(0.06,0.20-t*0.10);}
  else{const t=Math.min(1,(depth-22)/10);fr=0.02;fg=0.03+t*0.03;fb=0.08+t*0.05;hi=Math.max(0.03,0.10-t*0.05);}
  scene.fog.color.setRGB(fr,fg,fb);renderer.setClearColor(scene.fog.color);
  hemLight.color.setRGB(fr*0.5,fg*0.6,fb*1.5);hemLight.intensity=hi;
  sun.intensity=Math.max(0.02,hi*0.35);
  scene.fog.near=depth>22?13:depth>10?16:19;
  scene.fog.far=depth>22?42:depth>10?52:58;
}
function updateSky(t,inVolcano,inSnow){const b=.5-.5*Math.cos((t-.15)*Math.PI*2);
// sunrise/sunset glow: peaks when the sun crosses the horizon (dayT 0 and 0.5)
const _dT=(t+0.1)%1;const _edge=Math.min(_dT,Math.abs(_dT-.5),1-_dT);const glow=Math.max(0,1-_edge/0.07);
if(inVolcano){skyMesh.material.color.setRGB(.18+b*.05,.04,.02);scene.fog.color.setRGB(.22,.05,.02);renderer.setClearColor(scene.fog.color);sun.color.setHex(0xff6600);sun.intensity=Math.max(.3,.8-.4*b);hemLight.color.setHex(0xff3300);hemLight.intensity=.5;}else if(inSnow){skyMesh.material.color.setRGB(Math.max(.15,.55-.3*b),Math.max(.18,.65-.35*b),Math.max(.22,.8-.4*b));scene.fog.color.setRGB(Math.max(.2,.6-.3*b),Math.max(.22,.68-.35*b),Math.max(.25,.82-.4*b));renderer.setClearColor(scene.fog.color);sun.color.setHex(0xaaccff);sun.intensity=Math.max(.2,.7-.4*b);hemLight.color.setHex(0xaaddff);hemLight.intensity=Math.max(.2,.7-.4*b);}else{
  let sr=Math.max(.02,.45-.43*b),sg=Math.max(.03,.70-.66*b),sb=Math.max(.05,.98-.92*b);
  let fr=Math.max(.04,.55-.49*b),fg=Math.max(.04,.73-.67*b),fb=Math.max(.06,.93-.85*b);
  const gm=glow*.55; // mix toward warm orange at dawn/dusk
  sr=sr*(1-gm)+1.0*gm;sg=sg*(1-gm)+.45*gm;sb=sb*(1-gm)+.20*gm;
  fr=fr*(1-gm)+1.0*gm;fg=fg*(1-gm)+.52*gm;fb=fb*(1-gm)+.26*gm;
  skyMesh.material.color.setRGB(sr,sg,sb);scene.fog.color.setRGB(fr,fg,fb);renderer.setClearColor(scene.fog.color);
  sun.color.setRGB(1,1-glow*.35,1-glow*.6);sun.intensity=Math.max(.05,1-.95*b);
  hemLight.color.setHex(0xbfdcff);hemLight.intensity=Math.max(.1,.95-.82*b);
}$di.textContent=b>.5?'🌙':'☀️';}

// ─── CELESTIAL: sun/moon orbit, drifting clouds, sky follows player ───
function updateCelestial(t,dt){
  const px=P.x,py=P.y,pz=P.z;
  skyMesh.position.set(px,py,pz);
  // sunrise t=0.9, noon t=0.15, sunset t=0.4; night 0.4-0.9
  const dayT=(t+0.1)%1;
  const isDayNow=dayT<0.5;
  const sunA=Math.PI*Math.min(1,dayT/0.5);
  const moonA=Math.PI*Math.max(0,Math.min(1,(t-0.4)/0.5));
  const sunDir={x:Math.cos(sunA)*.85,y:Math.sin(sunA)+.04,z:.35};
  const moonDir={x:Math.cos(moonA)*.85,y:Math.sin(moonA)+.04,z:-.3};
  const d=isDayNow?sunDir:moonDir;
  const dl=Math.hypot(d.x,d.y,d.z);
  // snap the light anchor to whole blocks to reduce shadow shimmer while walking
  const ax=Math.round(px),ay=Math.round(py),az=Math.round(pz);
  sun.position.set(ax+d.x/dl*60,ay+Math.max(.15,d.y)/dl*60,az+d.z/dl*60);
  sun.target.position.set(ax,ay,az);
  sunSprite.position.set(px+sunDir.x*96,py+sunDir.y*90,pz+sunDir.z*96);
  moonSprite.position.set(px+moonDir.x*96,py+moonDir.y*90,pz+moonDir.z*96);
  const skyVis=skyMesh.visible;
  sunSprite.visible=skyVis&&isDayNow&&sunDir.y>.02;
  moonSprite.visible=skyVis&&!isDayNow&&moonDir.y>.02;
  cloudGroup.visible=skyVis;
  sun.castShadow=SHADOWS_ON&&skyVis;
  starPivot.position.set(px,py,pz);
  starPivot.rotation.z=-dayT*Math.PI*.5;
  starPivot.visible=skyVis;
  if(skyVis){
    const b=.5-.5*Math.cos((t-.15)*Math.PI*2); // same brightness curve as updateSky
    starMat.opacity=Math.max(0,Math.min(1,(b-.55)*3))*.9; // fade in after dusk
    const cb=Math.max(.25,1-b*.8);
    cloudMat.color.setRGB(cb,cb,Math.min(1,cb+.02));
    for(const cl of cloudGroup.children){
      cl.position.x+=dt*1.4;
      if(cl.position.x-px>CLOUD_RANGE)cl.position.x-=CLOUD_RANGE*2;
      else if(px-cl.position.x>CLOUD_RANGE)cl.position.x+=CLOUD_RANGE*2;
      if(cl.position.z-pz>CLOUD_RANGE)cl.position.z-=CLOUD_RANGE*2;
      else if(pz-cl.position.z>CLOUD_RANGE)cl.position.z+=CLOUD_RANGE*2;
    }
  }
}

// ─── TARGET BLOCK OUTLINE (Minecraft-style block cursor) ───
const cursorBox=new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002,1.002,1.002)),
  new THREE.LineBasicMaterial({color:0x000000,transparent:true,opacity:.55}));
cursorBox.visible=false;scene.add(cursorBox);
// ─── BLOCK DAMAGE / CRACK OVERLAY (Minecraft destroy-stages) ───
const CRACK_STAGES=6;
function makeCrackTextures(){
  const S=16,texs=[];const rng=_rng(4242);
  // pre-generate a few jagged crack polylines; each appears at a threshold
  const lines=[];
  for(let b=0;b<7;b++){
    let px=2+rng()*(S-4),py=2+rng()*(S-4);const pts=[[px,py]];
    const segN=3+Math.floor(rng()*4);let ang=rng()*Math.PI*2;
    for(let s=0;s<segN;s++){ang+=rng()*1.4-.7;px+=Math.cos(ang)*(2+rng()*2);py+=Math.sin(ang)*(2+rng()*2);pts.push([px,py]);}
    lines.push({pts,order:b/7});
  }
  for(let st=0;st<CRACK_STAGES;st++){
    const c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d');
    const frac=(st+1)/CRACK_STAGES;
    x.strokeStyle='rgba(0,0,0,.62)';x.lineWidth=1;x.lineCap='round';
    for(const ln of lines){if(ln.order>frac)continue;x.beginPath();x.moveTo(ln.pts[0][0],ln.pts[0][1]);for(let i=1;i<ln.pts.length;i++)x.lineTo(ln.pts[i][0],ln.pts[i][1]);x.stroke();}
    if(st>=3){x.fillStyle='rgba(0,0,0,.32)';for(let i=0;i<st*3;i++)x.fillRect((rng()*S)|0,(rng()*S)|0,1,1);}
    const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;texs.push(t);
  }
  return texs;
}
const crackTex=makeCrackTextures();
const crackMat=new THREE.MeshBasicMaterial({map:crackTex[0],transparent:true,opacity:.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,fog:false});
const crackMesh=new THREE.Mesh(new THREE.BoxGeometry(1.012,1.012,1.012),crackMat);
crackMesh.visible=false;crackMesh.renderOrder=3;scene.add(crackMesh);
let miningKey='',miningProgress=0,miningLastT=0;
function resetMining(){miningKey='';miningProgress=0;crackMesh.visible=false;}
// hammer is the pickaxe (fast miner); diamond hammer faster; sword/magic middling
function weaponMinePower(){if(weaponIdx===2)return hasDiamondHammer?6:4;if(weaponIdx===1)return 1.5;if(weaponIdx===4)return 2;return 1;}
function mineBlock(bh){
  const d=bh.object.userData;if(d.ti===WATER_BLOCK)return;
  const hard=BLOCK_HARDNESS[d.ti]!==undefined?BLOCK_HARDNESS[d.ti]:99;
  const now=performance.now()/1000;
  if(hard>=99){playTone(90,.06,.05,'square');resetMining();return;} // unbreakable: dull thud
  const key=vKey(d.x,d.y,d.z);
  if(miningKey!==key){miningKey=key;miningProgress=0;}
  miningProgress+=weaponMinePower()/hard;
  miningLastT=now;
  if(miningProgress>=0.999){breakBlock(bh);sfxBreak();resetMining();}
  else{
    const stage=Math.min(CRACK_STAGES-1,Math.floor(miningProgress*CRACK_STAGES));
    crackMat.map=crackTex[stage];crackMat.needsUpdate=true;
    crackMesh.position.copy(bh.object.position);crackMesh.visible=true;
    spawnParticles(bh.object.position.x,bh.object.position.y,bh.object.position.z,BLOCK_COLORS[d.ti],1);
    playTone(150+miningProgress*130,.05,.03,'square');
  }
}
const _cd=new THREE.Vector3();
// grid walk (DDA) through the voxel map — much cheaper than raycasting every mesh
function ddaTargetVoxel(maxD){
  camera.getWorldDirection(_cd);
  const ox=camera.position.x,oy=camera.position.y,oz=camera.position.z;
  let x=Math.floor(ox),y=Math.floor(oy),z=Math.floor(oz);
  const stepX=_cd.x>0?1:-1,stepY=_cd.y>0?1:-1,stepZ=_cd.z>0?1:-1;
  const tDx=Math.abs(1/(_cd.x||1e-9)),tDy=Math.abs(1/(_cd.y||1e-9)),tDz=Math.abs(1/(_cd.z||1e-9));
  let tMx=(_cd.x>0?(x+1-ox):(ox-x))*tDx;
  let tMy=(_cd.y>0?(y+1-oy):(oy-y))*tDy;
  let tMz=(_cd.z>0?(z+1-oz):(oz-z))*tDz;
  let t=0;
  while(t<=maxD){
    const v=voxels[vKey(x,y,z)];
    if(v&&v.active&&v.ti!==WATER_BLOCK)return{x,y,z};
    if(tMx<tMy&&tMx<tMz){t=tMx;tMx+=tDx;x+=stepX;}
    else if(tMy<tMz){t=tMy;tMy+=tDy;y+=stepY;}
    else{t=tMz;tMz+=tDz;z+=stepZ;}
  }
  return null;
}
function updateBlockCursor(){
  const hit=gs.running&&!gs.paused?ddaTargetVoxel(7):null;
  if(hit){cursorBox.position.set(hit.x+.5,hit.y+.5,hit.z+.5);cursorBox.visible=true;}
  else cursorBox.visible=false;
}

// ─── FIRST-PERSON HAND & HELD ITEM (Minecraft-style) ───
scene.add(camera); // so meshes attached to the camera get rendered
const handGroup=new THREE.Group();
handGroup.position.set(.44,-.4,-.7);
handGroup.visible=false;
camera.add(handGroup);
function _hmat(color,extra){
  const m=new THREE.MeshStandardMaterial(Object.assign({color,roughness:.8,metalness:.1},extra||{}));
  m.depthTest=false; // always draw over the world, like Minecraft's hand
  return m;
}
function _hmesh(geo,mat,x,y,z){const m=new THREE.Mesh(geo,mat);m.position.set(x||0,y||0,z||0);m.renderOrder=1000;m.frustumCulled=false;return m;}
function _hbox(w,h,d,mat,x,y,z){return _hmesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z);}
const armMesh=_hbox(.14,.14,.42,_hmat(0xd8a274),.02,-.05,.13);
armMesh.rotation.set(.25,-.15,0);
handGroup.add(armMesh);
let heldRoot=null,heldKey='';
function _buildHeld(){
  const root=new THREE.Group();
  if(weaponIdx===1){ // sword
    const blade=_hmat(hasDiamondSword?0x59e0ff:0xcfd6dd,hasDiamondSword?{emissive:0x1188aa,emissiveIntensity:.5}:null);
    root.add(_hbox(.05,.11,.05,_hmat(0x6b4a2f),0,-.1,0));   // grip
    root.add(_hbox(.15,.035,.05,_hmat(0x9a7a4f),0,-.03,0)); // guard
    root.add(_hbox(.055,.42,.028,blade,0,.2,0));            // blade
    root.rotation.set(-.5,.15,-.25);
  }else if(weaponIdx===2){ // hammer
    const head=_hmat(hasDiamondHammer?0x59e0ff:0x8a8f98,hasDiamondHammer?{emissive:0x1188aa,emissiveIntensity:.4}:null);
    root.add(_hbox(.05,.44,.05,_hmat(0x6b4a2f),0,.03,0));
    root.add(_hbox(.24,.13,.13,head,0,.28,0));
    root.rotation.set(-.5,.1,-.2);
  }else if(weaponIdx===3){ // bow
    const wood=_hmat(hasDiamondBow?0x2fbbd8:0x6b4a2f);
    root.add(_hbox(.04,.2,.05,wood,0,.17,.045));
    root.add(_hbox(.04,.16,.05,wood,0,0,0));
    root.add(_hbox(.04,.2,.05,wood,0,-.17,.045));
    root.add(_hbox(.012,.5,.012,_hmat(0xeeeeee),0,0,.09)); // string
    root.rotation.set(0,-.5,-.15);
  }else if(weaponIdx===4){ // magic
    root.add(_hbox(.045,.4,.045,_hmat(0x4a2c66),0,.05,0));
    root.add(_hmesh(new THREE.OctahedronGeometry(.075,0),_hmat(0xff66ff,{emissive:0xaa22aa,emissiveIntensity:.8}),0,.3,0));
    root.rotation.set(-.4,0,-.15);
  }else if(weaponIdx===5){ // diamond staff
    root.add(_hbox(.045,.46,.045,_hmat(0x1b3a4a),0,.05,0));
    root.add(_hmesh(new THREE.OctahedronGeometry(.085,0),_hmat(0x88ffff,{emissive:0x00ccee,emissiveIntensity:1.2}),0,.33,0));
    root.rotation.set(-.4,0,-.15);
  } // fist: arm only
  root.position.set(0,.03,-.07);
  return root;
}
function _refreshHeld(){
  const key=weaponIdx+'|'+WEAPONS[weaponIdx].name;
  if(key===heldKey)return;
  heldKey=key;
  if(heldRoot){handGroup.remove(heldRoot);heldRoot.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}
  heldRoot=_buildHeld();handGroup.add(heldRoot);
}
let handT=0,walkPhase=0,swingT=0,_lastStep=0;
function triggerHandSwing(){swingT=1;}
// per-material footsteps: soft grass, dull sand/snow, knocky wood, clicky stone
const FOOT_TONE={0:[150,'triangle'],5:[150,'triangle'],2:[105,'triangle'],[SNOW_BLOCK]:[95,'triangle'],3:[190,'square'],[CAVE_DIRT]:[130,'triangle']};
function playFootstep(){
  const under=voxels[vKey(Math.floor(P.x),Math.floor(P.y-.06),Math.floor(P.z))];
  if(!under||!under.active)return;
  const def=FOOT_TONE[under.ti]||[240,'square']; // stone-ish default
  playTone(def[0]+Math.random()*40-20,.05,.022,def[1]);
}
function updateHand(dt,moving,sprinting){
  handGroup.visible=gs.running;
  if(!gs.running)return;
  _refreshHeld();
  handT+=dt;
  if(moving&&P.onGround)walkPhase+=dt*(sprinting?11:8);
  const bobOn=settings.bob!==false;
  const wb=(moving&&P.onGround&&bobOn)?1:0;
  const sway=Math.sin(handT*1.6)*.006; // idle breathing
  // keep the hand on-screen for any aspect ratio (portrait phones have a narrow FOV)
  const hw=Math.tan(camera.fov*Math.PI/360)*.7*camera.aspect;
  const hx=Math.min(.5,Math.max(.15,hw*.62));
  handGroup.position.set(
    hx+Math.sin(walkPhase)*.028*wb,
    -.4+sway-Math.abs(Math.cos(walkPhase))*.03*wb,
    -.7);
  if(swingT>0)swingT=Math.max(0,swingT-dt*4.5);
  const s=swingT>0?Math.sin((1-swingT)*Math.PI):0; // quick forward arc
  handGroup.rotation.set(-s*.7,s*.3,0);
  handGroup.position.z=-.7-s*.12;
  handGroup.position.y-=s*.04;
  if(wb){const step=Math.floor(walkPhase/Math.PI);if(step!==_lastStep){_lastStep=step;playFootstep();}}
}
function updateViewBob(moving,sprinting){
  const wb=(settings.bob!==false&&moving&&P.onGround)?1:0;
  camera.position.y+=Math.abs(Math.sin(walkPhase))*.045*wb;
  camera.rotation.z=Math.sin(walkPhase)*.006*wb;
}

// ═══ RAYCAST ═══
const RC=new THREE.Raycaster();const _rd=new THREE.Vector3();
function castVoxel(){camera.getWorldDirection(_rd);RC.set(camera.position,_rd);RC.far=7;const h=RC.intersectObjects([...blockMeshes],false);return h.length?h[0]:null;}
function getEnemyMeshes(){const ms=[];for(const e of enemies)ms.push(e.body,e.head);if(boss)ms.push(boss.body,boss.head);return ms;}
function castEnemies(){camera.getWorldDirection(_rd);RC.set(camera.position,_rd);RC.far=10;const h=RC.intersectObjects([...getEnemyMeshes(),...blockMeshes],false);if(!h.length)return null;if(h[0].object.userData.isBlock)return null;return h[0];}
function castEnemiesFar(range){camera.getWorldDirection(_rd);RC.set(camera.position,_rd);RC.far=range;const h=RC.intersectObjects([...getEnemyMeshes(),...blockMeshes],false);if(!h.length)return null;if(h[0].object.userData.isBlock)return null;return h[0];}
function findEnemyByMesh(obj){for(const e of enemies){if(obj===e.body||obj===e.head)return{enemy:e,isBoss:false};}if(boss&&(obj===boss.body||obj===boss.head))return{enemy:boss,isBoss:true};return null;}
function hasLOS(x1,y1,z1,x2,y2,z2){
  const dx=x2-x1,dy=y2-y1,dz=z2-z1;
  const steps=Math.ceil(Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz))*2)+1;
  for(let i=1;i<steps;i++){const t=i/steps;const k=vKey(Math.floor(x1+dx*t),Math.floor(y1+dy*t),Math.floor(z1+dz*t));const v=voxels[k];if(v&&v.active)return false;}
  return true;
}

// ═══ JOYSTICK ═══
const joy={x:0,y:0};const jW=document.getElementById('joyWrap'),jK=document.getElementById('joyKnob');
let jActive=false,jPid=null,jCX=60,jCY=60;const JMAX=38;
function setKnob(dx,dy){let l=Math.hypot(dx,dy);if(l>JMAX){dx=dx/l*JMAX;dy=dy/l*JMAX;}jK.style.left=(60+dx-25)+'px';jK.style.top=(60+dy-25)+'px';joy.x=dx/JMAX;joy.y=dy/JMAX;}
function resetKnob(){jK.style.left='35px';jK.style.top='35px';joy.x=0;joy.y=0;}
if(!isDesktop){jW.addEventListener('pointerdown',(e)=>{e.preventDefault();initAudio();jActive=true;jPid=e.pointerId;jW.setPointerCapture(jPid);const r=jW.getBoundingClientRect();jCX=r.left+r.width/2;jCY=r.top+r.height/2;setKnob(e.clientX-jCX,e.clientY-jCY);});jW.addEventListener('pointermove',(e)=>{if(!jActive||e.pointerId!==jPid)return;e.preventDefault();setKnob(e.clientX-jCX,e.clientY-jCY);});const endJ=(e)=>{if(e.pointerId!==jPid)return;jActive=false;jPid=null;resetKnob();};jW.addEventListener('pointerup',endJ);jW.addEventListener('pointercancel',endJ);}

// ═══ INPUT ═══
let lActive=false,lId=null,lX=0,lY=0;const LS_BASE=.006;let LS=LS_BASE*(settings.lookSens||1);const uiPointers=new Set();
if(!isDesktop){document.addEventListener('pointerdown',(e)=>{if(e.clientX<window.innerWidth*.38)return;const el=e.target;if(el&&(el.closest('#actionWrap')||el.closest('#hotbar')||el.closest('#overlay')||el.closest('#minimap')||el.closest('#joyWrap')||el.closest('#topBar')||el.id==='saveFloatBtn'||el.id==='eatBtn'||el.id==='craftBtn'||el.id==='weaponBtn'||el.id==='pauseBtn'||el.closest('#craftPanel')||el.closest('#pauseOverlay'))){uiPointers.add(e.pointerId);return;}lActive=true;lId=e.pointerId;lX=e.clientX;lY=e.clientY;},{passive:true});document.addEventListener('pointermove',(e)=>{if(!lActive||e.pointerId!==lId)return;yaw-=(e.clientX-lX)*LS;pitch-=(e.clientY-lY)*LS;pitch=Math.max(-1.45,Math.min(1.45,pitch));lX=e.clientX;lY=e.clientY;},{passive:true});document.addEventListener('pointerup',(e)=>{uiPointers.delete(e.pointerId);if(e.pointerId!==lId)return;lActive=false;lId=null;},{passive:true});document.addEventListener('pointercancel',(e)=>{uiPointers.delete(e.pointerId);if(e.pointerId!==lId)return;lActive=false;lId=null;},{passive:true});}
const keys={};
document.addEventListener('keydown',(e)=>{
  keys[e.code]=true;
  if(e.code==='Space'&&gs.running){e.preventDefault();doJump();}
  if(e.code>='Digit1'&&e.code<='Digit5')setType(parseInt(e.code[5])-1);
  if(e.code==='KeyE')cycleWeapon();
  if(e.code==='F5'){e.preventDefault();if(gs.running)saveGame();}
  if(e.code==='KeyC'){if(gs.running)toggleCraftPanel();}
  if(e.code==='KeyX'){
    if(!gs.running)return;
    if(_bedNearby())           sleepBed();
    else if(_chestNearby())    interactChest();
    else if(_treasureNearby()) openTreasure();
    else if(bedCount>0)        placeBed();
    else if(chestCount>0)      placeChest();
    else if(trophyCount>0)     placeTrophy();
    else showBonus('置ける家具がない！');
  }
  if(e.code==='KeyB'){
    if(!gs.running)return;
    if(_bedNearby())sleepBed();else placeBed();
  }
  if(e.code==='Escape'||e.code==='KeyP'){if(gs.running)togglePause();}
});
document.addEventListener('keyup',(e)=>{keys[e.code]=false;});
if(isDesktop){canvas.addEventListener('click',()=>{canvas.requestPointerLock?.();initAudio();});document.addEventListener('mousemove',(e)=>{if(document.pointerLockElement!==canvas)return;yaw-=e.movementX*.003;pitch-=e.movementY*.003;pitch=Math.max(-1.5,Math.min(1.5,pitch));});canvas.addEventListener('mousedown',(e)=>{if(document.pointerLockElement!==canvas)return;if(e.button===0){attackHeld=true;doAttack();}if(e.button===2)doPlace();});document.addEventListener('mouseup',(e)=>{if(e.button===0)attackHeld=false;});canvas.addEventListener('contextmenu',(e)=>e.preventDefault());}

// ═══ HOTBAR ═══
let curType=0;const slots=[...document.querySelectorAll('.hslot')];
function setType(idx){if(idx<0||idx>4)return;curType=idx;slots.forEach(x=>x.classList.remove('active'));slots[idx].classList.add('active');}
slots.forEach(s=>{s.addEventListener('pointerdown',(ev)=>{ev.preventDefault();initAudio();setType(parseInt(s.dataset.i,10));});});
function cycleWeapon(){let next=(weaponIdx+1)%WEAPONS.length;for(let i=0;i<WEAPONS.length;i++){if(unlockedWeapons[next])break;next=(next+1)%WEAPONS.length;}if(!unlockedWeapons[next]){showBonus('🔒 武器未解放');return;}weaponIdx=next;showBonus(WEAPONS[weaponIdx].name);playTone(600,.08,.08,'sine');}

// ═══ COMBAT ═══
// enemy/boss/dragon meshes are built with per-instance geometries and cloned
// materials, so they must be disposed on removal to avoid GPU memory leaks
function disposeObject3D(root){root.traverse(o=>{if(o.isMesh){if(o.geometry)o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else if(o.material)o.material.dispose();}else if(o.isSprite&&o.material){if(o.material.map)o.material.map.dispose();o.material.dispose();}});}
function flashEnemy(e){for(const m of e.flashMeshes||[e.body,e.head]){m.material.emissive.setHex(0xffffff);m.material.emissiveIntensity=1.5;}setTimeout(()=>{try{for(const m of e.flashMeshes||[e.body,e.head]){m.material.emissive.setHex(e.type.emissive);m.material.emissiveIntensity=e.type.emissiveIntensity||.15;}}catch(x){}},100);}
function hitEnemy(en,dmgVal){en.hp-=dmgVal;flashEnemy(en);const ratio=Math.max(0,en.hp/en.maxHp);en.hpBar.scale.x=Math.max(.01,ratio);en.hpBar.material.color.setHex(ratio>.5?0x44ff44:ratio>.25?0xffaa00:0xff2222);if(en.hp<=0&&!en.dead){en.dead=true;const ep=en.root.position;spawnParticles(ep.x,ep.y,ep.z,en.type.color,4);dropItem(ep.x,ep.y,ep.z,en.type);scene.remove(en.root);disposeObject3D(en.root);const idx=enemies.indexOf(en);if(idx>=0)enemies.splice(idx,1);gs.kills++;const pts=en.type.score*(gs.wave||1);gs.score+=pts;sfxKill();showBonus('+'+pts);}}

// ブロック破壊共通処理
function breakBlock(bh){
  const d=bh.object.userData;
  if(d.ti===WATER_BLOCK)return;
  const k=vKey(d.x,d.y,d.z);
  const v=voxels[k];
  if(v){
    spawnParticles(bh.object.position.x,bh.object.position.y,bh.object.position.z,BLOCK_COLORS[v.ti],4);
    addMaterial(v.ti);
    if(v.ti===DIAMOND_ORE&&dragon===null&&!dragonWarnPending&&P.y<-12&&Math.random()<0.2){dragonWarnPending=true;showAlert('⚠ ダイヤを掘った…何かが目覚めた…');playTone(80,.2,.4,'sawtooth');setTimeout(()=>{if(gs.running)spawnDiamondDragon();},3000);}
    if(!d.playerPlaced){gs.score+=2;worldEdits.removed[k]=true;}
    else{delete worldEdits.placed[k];}
  }
  removeBlock(d.x,d.y,d.z);
}

// ─── ENEMY BLOCK BREAKING ───
function enemyBreakBlockAt(x,y,z){
  const k=vKey(x,y,z);const v=voxels[k];if(!v||!v.active||v.ti===WATER_BLOCK)return false;
  spawnParticles(x+.5,y+.5,z+.5,BLOCK_COLORS[v.ti],4);
  if(Math.hypot(x-P.x,z-P.z)<20)sfxBreak();
  if(v.playerPlaced)delete worldEdits.placed[k];else worldEdits.removed[k]=true;
  removeBlock(x,y,z);return true;
}
function getForwardBlockForEnemy(e){
  const ep=e.root.position;const dx=P.x-ep.x,dz=P.z-ep.z;const dl=Math.hypot(dx,dz)||1;
  const nx=dx/dl,nz=dz/dl;const gy=Math.floor(ep.y-.85);
  for(let s=1;s<=2;s++){
    const bx=Math.floor(ep.x+nx*s),bz=Math.floor(ep.z+nz*s);
    for(let by=gy;by<=gy+1;by++){const k=vKey(bx,by,bz);const v=voxels[k];if(v&&v.active)return{x:bx,y:by,z:bz,v};}
  }
  return null;
}
function tryEnemyBreakBlock(e){
  const et=e.type;if(!et.breakPow)return;
  const bl=getForwardBlockForEnemy(e);if(!bl)return;
  const ti=bl.v.ti;let hard=BLOCK_HARDNESS[ti]!==undefined?BLOCK_HARDNESS[ti]:99;
  if(et.firePow&&(ti===0||ti===3||ti===5||ti===9))hard=1;
  if(et.breakSoft&&hard>1)return;
  if(et.breakChance&&Math.random()>et.breakChance)return;
  if(et.breakPow>=hard){enemyBreakBlockAt(bl.x,bl.y,bl.z);e.breakCd=et.breakCd0||4;}
}
function tryBossBreakBlock(){
  if(!boss)return;const bp=boss.root.position,sc=boss.sc;
  const dx=P.x-bp.x,dz=P.z-bp.z,dl=Math.hypot(dx,dz)||1;
  const nx=dx/dl,nz=dz/dl;const gy=Math.floor(bp.y-.85*sc);
  const pow=(boss.def.wave>=15?5:boss.def.wave>=10?4:3)+boss.phase-1;
  for(let s=1;s<=Math.ceil(sc*1.5)+1;s++){
    const bx=Math.floor(bp.x+nx*s),bz=Math.floor(bp.z+nz*s);
    for(let by=gy;by<=gy+Math.ceil(sc*1.5);by++){
      const k=vKey(bx,by,bz);const v=voxels[k];if(!v||!v.active)continue;
      const hard=BLOCK_HARDNESS[v.ti]!==undefined?BLOCK_HARDNESS[v.ti]:99;
      if(pow>=hard){enemyBreakBlockAt(bx,by,bz);return;}
    }
  }
}

function doAttack(e){
  if(e)e.preventDefault();if(!gs.running)return;initAudio();if(attackCD>0)return;
  if(!unlockedWeapons[weaponIdx]){showBonus('🔒 武器未解放！クラフトしよう');playTone(200,.08,.08,'sawtooth');return;}
  const w=WEAPONS[weaponIdx];
  if(w.type==='ranged'&&inv.arrow<=0){showBonus('矢がない！🪵×2でクラフト');playTone(200,.08,.08,'sawtooth');return;}
  attackCD=w.cd;w.sfx();triggerHandSwing();
  if(w.type==='staff'){fireStaff();return;}
  if(w.type==='ranged'){
    inv.arrow--;updateInvHUD();
    const eh=castEnemiesFar(w.range);if(eh){const found=findEnemyByMesh(eh.object);if(found){if(found.isBoss)hitBoss(w.dmg);else hitEnemy(found.enemy,w.dmg);return;}}
    fireArrow();return;
  }
  if(w.type==='hammer'){
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;spawnParticles(P.x+Math.cos(a)*2.5,P.y+.3,P.z+Math.sin(a)*2.5,0x00e5ff,1);}
    spawnParticles(P.x,P.y+.5,P.z,0xaaf8ff,3);
    let anyHit=false;
    if(boss){const bp=boss.root.position;if(Math.hypot(bp.x-P.x,bp.z-P.z)<w.range){hitBoss(w.dmg);anyHit=true;}}
    if(dragon){const dp=dragon.root.position;if(Math.hypot(dp.x-P.x,dp.z-P.z)<w.range){hitDragon(w.dmg,true);anyHit=true;}}
    for(const en of[...enemies]){const ep=en.root.position;if(Math.hypot(ep.x-P.x,ep.z-P.z)<w.range){hitEnemy(en,w.dmg);anyHit=true;}}
    attackMobs(w);
    if(!anyHit){const bh=castVoxel();if(bh){mineBlock(bh);}}
    return;
  }
  if(w.type==='aoe'){
    spawnParticles(P.x,P.y+1.5,P.z,0xff44ff,4);let anyHit=false;
    if(boss){const bp=boss.root.position,dx=bp.x-P.x,dy=bp.y-P.y,dz=bp.z-P.z;if(Math.sqrt(dx*dx+dy*dy+dz*dz)<w.range){hitBoss(w.dmg);anyHit=true;}}
    if(dragon){const dp=dragon.root.position,dx=dp.x-P.x,dy=dp.y-P.y,dz=dp.z-P.z;if(Math.sqrt(dx*dx+dy*dy+dz*dz)<w.range){hitDragon(w.dmg,false);anyHit=true;}}
    for(const en of[...enemies]){const ep=en.root.position,dx=ep.x-P.x,dy=ep.y-P.y,dz=ep.z-P.z;if(Math.sqrt(dx*dx+dy*dy+dz*dz)<w.range){hitEnemy(en,w.dmg);anyHit=true;}}
    attackMobs(w);
    if(!anyHit){const bh=castVoxel();if(bh){mineBlock(bh);}}
    return;
  }
  const eh=castEnemies();if(eh&&eh.distance<=w.range){const found=findEnemyByMesh(eh.object);if(found){if(found.isBoss)hitBoss(w.dmg);else hitEnemy(found.enemy,w.dmg);return;}}
  if(dragon){const dp=dragon.root.position;if((dp.x-P.x)**2+(dp.y-(P.y+1.5))**2+(dp.z-P.z)**2<w.range*w.range){hitDragon(w.dmg,weaponIdx===1&&hasDiamondSword);return;}}
  attackMobs(w);
  const bh=castVoxel();if(bh){mineBlock(bh);}
}

function doPlace(e){
  if(e)e.preventDefault();if(!gs.running)return;initAudio();
  const bh=castVoxel();if(!bh)return;
  const n=bh.face.normal,d=bh.object.userData;
  const px=d.x+Math.round(n.x),py=d.y+Math.round(n.y),pz=d.z+Math.round(n.z);
  if(px<P.x+.35&&px+1>P.x-.35&&py<P.y+1.75&&py+1>P.y&&pz<P.z+.35&&pz+1>P.z-.35)return;
  for(const en of enemies){const ep=en.root.position,fy=ep.y-.85;if(px<ep.x+.5&&px+1>ep.x-.5&&py<fy+1.7&&py+1>fy&&pz<ep.z+.5&&pz+1>ep.z-.5)return;}
  const mat=SLOT_MAT[curType];
  if(inv[mat]<=0){showBonus('素材がない！ 🪵');playTone(180,.1,.1,'sawtooth');return;}
  inv[mat]--;updateInvHUD();
  addBlock(px,py,pz,curType,true,true);
  const pk=vKey(px,py,pz);worldEdits.placed[pk]=curType;delete worldEdits.removed[pk];
  sfxPlace();triggerHandSwing();
}

// ═══ BUTTONS ═══
const breakBtn=document.getElementById('breakBtn'),placeBtn=document.getElementById('placeBtn'),jumpBtn=document.getElementById('jumpBtn'),weaponBtn=document.getElementById('weaponBtn'),saveFloatBtn=document.getElementById('saveFloatBtn');
// hold ATTACK to keep mining/attacking (auto-repeats at the weapon cooldown in tick)
let attackHeld=false;
function _attackDown(e){e.preventDefault();e.stopPropagation();attackHeld=true;doAttack(e);}
function _attackUp(){attackHeld=false;}
breakBtn.addEventListener('pointerdown',_attackDown);
breakBtn.addEventListener('touchstart',_attackDown,{passive:false});
breakBtn.addEventListener('pointerup',_attackUp);
breakBtn.addEventListener('pointercancel',_attackUp);
breakBtn.addEventListener('pointerleave',_attackUp);
breakBtn.addEventListener('touchend',_attackUp);
breakBtn.addEventListener('touchcancel',_attackUp);
let _jumpBtnLastT=0;
function _onJumpBtnTap(){const now=Date.now();if(now-_jumpBtnLastT<100)return;_jumpBtnLastT=now;doJump();}
bindTapSafe(jumpBtn,_onJumpBtnTap);
let _weaponBtnLastT=0;
function _onWeaponBtnTap(){const now=Date.now();if(now-_weaponBtnLastT<100)return;_weaponBtnLastT=now;cycleWeapon();}
bindTapSafe(weaponBtn,_onWeaponBtnTap);
let _saveBtnLastT=0;
function _onSaveBtnTap(){const now=Date.now();if(now-_saveBtnLastT<100)return;_saveBtnLastT=now;if(gs.running)saveGame();}
bindTapSafe(saveFloatBtn,_onSaveBtnTap);

// PLACEボタン長押し：近くにベッド→睡眠、チェスト→操作、ベッド所持→設置、チェスト所持→設置
let placeLongPressTimer=null;
function _bedNearby(){return beds.some(b=>{const dx=b.x+.5-P.x,dz=b.z+.9-P.z,dy=b.y+.3-(P.y+.8);return Math.hypot(dx,dy,dz)<2.5;});}
function _chestNearby(){return chests.some(c=>{const dx=c.x+.5-P.x,dz=c.z+.5-P.z,dy=c.y+.35-(P.y+.8);return Math.hypot(dx,dy,dz)<2.2;});}
function _startPlacePress(){
  if(placeLongPressTimer!==null)return;
  initAudio();
  placeLongPressTimer=setTimeout(()=>{
    placeLongPressTimer=null;
    if(_bedNearby())           sleepBed();
    else if(_chestNearby())    interactChest();
    else if(_treasureNearby()) openTreasure();
    else if(bedCount>0)        placeBed();
    else if(chestCount>0)      placeChest();
    else if(trophyCount>0)     placeTrophy();
    else showBonus('置ける家具がない！');
  },500);
}
function _endPlacePress(runShort){
  if(placeLongPressTimer!==null){clearTimeout(placeLongPressTimer);placeLongPressTimer=null;if(runShort)doPlace();}
}
placeBtn.addEventListener('pointerdown', (e)=>{e.preventDefault();e.stopPropagation();_startPlacePress();});
placeBtn.addEventListener('pointerup',   (e)=>{e.preventDefault();e.stopPropagation();_endPlacePress(true);});
placeBtn.addEventListener('pointercancel',(e)=>{_endPlacePress(false);});
placeBtn.addEventListener('touchstart',  (e)=>{e.preventDefault();e.stopPropagation();_startPlacePress();},{passive:false});
placeBtn.addEventListener('touchend',    (e)=>{e.preventDefault();e.stopPropagation();_endPlacePress(true);},{passive:false});

// ═══ OVERLAY ═══
const overlay=document.getElementById('overlay'),ovTitle=document.getElementById('ovTitle'),ovInfo=document.getElementById('ovInfo'),ovBtn=document.getElementById('ovBtn'),ovSub=document.getElementById('ovSub');
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
    if(undergroundSnapshot.hasDiamondSword){if(!hasDiamondSword)applyDiamondSword();}else{if(hasDiamondSword){hasDiamondSword=false;WEAPONS[1].name='⚔ Sword';WEAPONS[1].dmg=3;WEAPONS[1].cd=0.4;unlockedWeapons[1]=false;}}
    if(undergroundSnapshot.hasDiamondBow){if(!hasDiamondBow)applyDiamondBow();}else{if(hasDiamondBow){hasDiamondBow=false;WEAPONS[3].name='🏹 Bow';WEAPONS[3].dmg=4;WEAPONS[3].cd=0.7;unlockedWeapons[3]=false;}}
    if(undergroundSnapshot.hasDiamondStaff){if(!hasDiamondStaff)applyDiamondStaff();}else{if(hasDiamondStaff){hasDiamondStaff=false;unlockedWeapons[5]=false;}}
    if(undergroundSnapshot.hasDiamondHammer){if(!hasDiamondHammer)applyDiamondHammer();}else{if(hasDiamondHammer){hasDiamondHammer=false;WEAPONS[2].name='🔨 Hammer';WEAPONS[2].dmg=6;WEAPONS[2].cd=0.8;WEAPONS[2].range=3;WEAPONS[2].type='melee';unlockedWeapons[2]=false;}}
    chestCount=undergroundSnapshot.chestCount;bedCount=undergroundSnapshot.bedCount;trophyCount=undergroundSnapshot.trophyCount||trophyCount;updateChestHUD();updateBedHUD();updateTrophyHUD();
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
  ovInfo.innerHTML='スコア: <b>'+gs.score+'</b><br>ウェーブ: '+gs.wave+'　キル: '+gs.kills+'<br>生存日数: '+gs.day+'日';
  ovBtn.textContent='もう一度';
  $contDeathBtn.style.display='none';$contBtn.classList.add('disabled');
  renderRankHUD();overlay.classList.remove('hide');updateOverlaySaveInfo(true);
  [1200,1500,1800,2200,2600,3000].forEach((f,i)=>setTimeout(()=>playTone(f,.25,.35,'sine'),i*160));
}
function gameOver(){
  if(P.y<0&&undergroundSnapshot){undergroundDeath();return;}
  saveScore(false);
  gs.running=false;ovTitle.style.color='#ff4444';ovTitle.style.textShadow='3px 3px 0 #880000,6px 6px 0 #330000';ovTitle.textContent='GAME OVER';if($ovSplash)$ovSplash.textContent='また挑戦しよう！';ovSub.textContent='';ovInfo.innerHTML='スコア: <b>'+gs.score+'</b><br>ウェーブ: '+gs.wave+'　キル: '+gs.kills+'<br>生存日数: '+gs.day+'日<br>🥩 MEAT: '+meat;ovBtn.textContent='RETRY';$contDeathBtn.style.display='';$contBtn.classList.add('disabled');renderRankHUD();overlay.classList.remove('hide');updateOverlaySaveInfo(true);
}
function continueAfterDeath(){P.hp=P.maxHp;P.invT=3;gs.score=Math.floor(gs.score*0.5);gs.running=true;$contDeathBtn.style.display='none';$contBtn.classList.remove('disabled');overlay.classList.add('hide');saveGame();showAlert('コンティニュー！ スコア半減');}
function commonReset(){
  for(const e of enemies){scene.remove(e.root);disposeObject3D(e.root);}enemies.length=0;
  for(const mob of mobs)scene.remove(mob.root);mobs.length=0;meat=0;mobRespawnT=MOB_RESPAWN_INTERVAL;updateMeatHUD();
  resetChests();resetBeds();resetTrophies();resetTreasures();
  if(boss){scene.remove(boss.root);disposeObject3D(boss.root);boss=null;$bossWrap.classList.remove('show');}
  if(dragon){scene.remove(dragon.root);disposeObject3D(dragon.root);dragon=null;}dragonWarnPending=false;dragonSpawnT=90;
  for(const it of items){scene.remove(it.mesh);it.mat.dispose();}items.length=0;
  for(const p of projectiles)scene.remove(p.mesh);projectiles.length=0;
  for(let i=particles.length-1;i>=0;i--){scene.remove(particles[i].mesh);particles[i].mat.dispose();}particles.length=0;
  clearWorld();yaw=0;pitch=0;attackCD=0;coyoteTime=0;jumpBuffer=0;lavaDmgTimer=0;snowDmgTimer=0;resetKnob();stopBgm();stopSeq();bgmBiome=-1;bgmBoss=false;bgmWave=false;closeCraftPanel();$wt.classList.remove('show');undergroundSnapshot=null;prevPlayerUnderground=false;finalBossPending=false;bgmUnder=false;bgmUnderDragon=false;
  gs.paused=false;$pauseOverlay.classList.remove('show');$pauseBtn.textContent='⏸';$pauseBtn.style.display='none';
}
async function startGame(){
  await deleteSave();$contDeathBtn.style.display='none';
  ovTitle.style.color='';ovTitle.style.textShadow='';ovTitle.textContent='ジョークラ';
  ovSub.textContent='VOXEL SURVIVAL';rotateSplash();
  overlay.classList.add('hide');initAudio();
  initWorldNoise(Math.floor(Math.random()*999999));
  commonReset();resetInv();resetAchievements();resetWorldEdits();
  P.x=0;P.z=0;P.velY=0;P.onGround=false;P.hp=100;P.invT=0;
  weaponIdx=0;curType=0;setType(0);
  updateChunks(true);const sh=getHeight(0,0);P.y=sh+1.01;P.onGround=true;
  gs.score=0;gs.kills=0;gs.wave=0;gs.day=1;gs.time=0;gs.nextWave=18;gs.running=true;
  $pauseBtn.style.display='flex';
  spawnPigs(8);updateInvHUD();resize();
}
async function continueGame(){
  const d=await loadSaveData();if(!d)return;
  $contDeathBtn.style.display='none';
  ovTitle.style.color='';ovTitle.style.textShadow='';ovTitle.textContent='ジョークラ';ovSub.textContent='VOXEL SURVIVAL';rotateSplash();
  overlay.classList.add('hide');initAudio();commonReset();resetInv();loadAchievements(d.achievements);
  gs.score=d.score||0;gs.kills=d.kills||0;gs.wave=d.wave||0;gs.day=d.day||1;gs.time=d.time||0;gs.nextWave=d.nextWave||30;gs.running=true;
  finalBossPending=!!d.finalBossPending;
  P.hp=d.hp||100;P.invT=0;P.velY=0;P.onGround=false;P.x=d.px||0;P.z=d.pz||0;P.y=d.py||20;
  weaponIdx=Math.max(0,Math.min(WEAPONS.length-1,d.weaponIdx||0));
  curType=Math.max(0,Math.min(4,d.curType||0));setType(curType);
  yaw=d.yaw||0;pitch=d.pitch||0;
  if(d.inv)Object.assign(inv,d.inv);
  if(d.unlockedWeapons)d.unlockedWeapons.forEach((v,i)=>{if(i<unlockedWeapons.length)unlockedWeapons[i]=v;});
  else unlockedWeapons[0]=true;
  meat=d.meat||0;updateMeatHUD();
  if(d.hasDiamondSword)applyDiamondSword();
  if(d.hasDiamondBow)applyDiamondBow();
  if(d.hasDiamondStaff)applyDiamondStaff();
  if(d.hasDiamondHammer)applyDiamondHammer();
  if(d.worldSeed)initWorldNoise(d.worldSeed);
  updateChunks(true);
  if(d.worldEdits){resetWorldEdits();Object.assign(worldEdits.placed,d.worldEdits.placed||{});Object.assign(worldEdits.removed,d.worldEdits.removed||{});}
  applyWorldEdits();
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
  // 地下宝箱の開封済み復元（宝箱メッシュはchunk再生成時に _spawnRoomContent が担当）
  if(d.openedTreasures)d.openedTreasures.forEach(k=>openedTreasureKeys.add(k));
  for(let adj=0;adj<5;adj++){if(!overlaps(P.x,P.y,P.z))break;P.y+=0.5;}
  $pauseBtn.style.display='flex';
  spawnPigs(8);updateInvHUD();resize();
}
// アイテムピックアップ（武器ドロップで解放）
function pickupItem(info){
  if(info.type==='hp'){P.hp=Math.min(P.maxHp,P.hp+info.value);showBonus(info.name);playTone(700,.15,.1,'sine');}
  else if(info.type==='weapon'){unlockWeaponByDrop(info.wi);showBonus(info.name+' GET!');playTone(900,.15,.1);}
  else if(info.type==='score'){gs.score+=info.value;showBonus(info.name);playTone(1000,.1,.08);}
}
let _ovBtnLastT=0;
function _onOvBtnTap(){const now=Date.now();if(now-_ovBtnLastT<100)return;_ovBtnLastT=now;startNewGameWithConfirm();}
bindTapSafe(ovBtn,_onOvBtnTap);
let _contBtnLastT=0;
function _onContBtnTap(){const now=Date.now();if(now-_contBtnLastT<100)return;_contBtnLastT=now;if(!$contBtn.classList.contains('disabled'))openSaveSlots();}
bindTapSafe($contBtn,_onContBtnTap);
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
const AUTOSAVE_INTERVAL=60;
document.addEventListener('visibilitychange',()=>{if(!document.hidden)lastT=performance.now();});
function tick(now){
  requestAnimationFrame(tick);
  if(isTouch&&now-lastT<FRAME_MIN){return;}
  const dt=Math.min(.05,(now-lastT)/1000);lastT=now;
  if(saveToastTimer>0){saveToastTimer-=dt;if(saveToastTimer<=0)$saveToast.classList.remove('show');}
  if(!gs.running){renderer.render(scene,camera);return;}
  if(gs.paused){renderer.render(scene,camera);return;}
  const prevTime=gs.time;gs.time=(gs.time+dt/DAY_DUR)%1;
  if(gs.time<prevTime){gs.day++;showAlert('🌅 DAY '+gs.day);}
  const curBiome=getBiome(Math.floor(P.x),Math.floor(P.z));
  const inVolcano=curBiome===BIOMES.VOLCANO,inSnow=curBiome===BIOMES.SNOW;
  const _isUnder=P.y<0;
  updateSky(gs.time,inVolcano,inSnow);updateBgm(curBiome,_isUnder);
  if(_isUnder){updateUnderAtmosphere(P.y);skyMesh.visible=false;}
  else{scene.fog.near=DRAW_R*CHUNK*0.7;scene.fog.far=DRAW_R*CHUNK*0.98;skyMesh.visible=true;}
  updateCelestial(gs.time,dt);
  updateBlockCursor();
  if(_waterUniforms)_waterUniforms.uTime.value=now/1000;
  // hold-to-mine: auto-repeat attack at the weapon cadence (skip bow to spare arrows)
  if(attackHeld){const w=WEAPONS[weaponIdx];if(w.type!=='ranged'&&attackCD<=0)doAttack();}
  // cracks heal if you stop mining a block (Minecraft-style)
  if(miningKey&&performance.now()/1000-miningLastT>0.7)resetMining();
  const isDay=(gs.time<.4||gs.time>.9);
  if(isDay&&!inVolcano&&!inSnow&&P.hp<P.maxHp&&P.invT<=0)P.hp=Math.min(P.maxHp,P.hp+2.5*dt);
  gs.nextWave-=dt;if(gs.nextWave<=0)startWave();
  if(_isUnder&&!prevPlayerUnderground){undergroundSnapshot={inv:{...inv},unlockedWeapons:[...unlockedWeapons],hasDiamondSword,hasDiamondBow,hasDiamondStaff,hasDiamondHammer,chestCount,bedCount,trophyCount};sfxEnterUnder();}
  if(!_isUnder&&prevPlayerUnderground){undergroundSnapshot=null;sfxExitUnder();}
  prevPlayerUnderground=_isUnder;
  if(!_isUnder&&finalBossPending&&!boss){finalBossPending=false;const fd=BOSS_DEFS.find(b=>b.finalBoss);if(fd&&gs.running){showAlert('💎 キングダイヤモンドドラゴン 降臨！！');sfxBossAppear();playTone(60,.4,.8,'sawtooth');setTimeout(()=>{if(gs.running)spawnBoss(fd);},2500);}}
  if(_isUnder){const uc=enemies.filter(e=>e.root.position.y<0).length;underSpawnT=Math.max(0,underSpawnT-dt);if(underSpawnT<=0&&uc<UNDER_MAX){spawnUnderEnemy();underSpawnT=UNDER_SPAWN_CD;}}
  if(_isUnder&&P.y<-12&&dragon===null&&!dragonWarnPending){dragonSpawnT-=dt;if(dragonSpawnT<=0){dragonSpawnT=60+Math.random()*30;if(Math.random()<0.09){dragonWarnPending=true;showAlert('⚠ 地下の底から咆哮が響く…💎');playTone(80,.2,.4,'sawtooth');setTimeout(()=>{if(gs.running)spawnDiamondDragon();},3000);}}}

  if(waTimer>0){waTimer-=dt;if(waTimer<=0)$wa.classList.remove('show');}
  if(bpTimer>0){bpTimer-=dt;if(bpTimer<=0)$bp.classList.remove('show');}
  P.invT=Math.max(0,P.invT-dt);if(attackCD>0)attackCD=Math.max(0,attackCD-dt);
  lavaDmgTimer=Math.max(0,lavaDmgTimer-dt);if(lavaDmgTimer<=0&&checkLava()){dmgLava();lavaDmgTimer=0.8;}
  if(inSnow){snowDmgTimer=Math.max(0,snowDmgTimer-dt);if(snowDmgTimer<=0){dmgSnow();snowDmgTimer=3.0;}}
  lavaParticleT+=dt;if(lavaParticleT>.15){lavaParticleT=0;for(const k of lavaBlocks){if(Math.random()<.04){const[lx,ly,lz]=k.split('|').map(Number);if(Math.abs(lx-P.x)<20&&Math.abs(lz-P.z)<20)spawnLavaParticles(lx+.5,ly+1,lz+.5);}}}
  if(inSnow){snowParticleT+=dt;if(snowParticleT>.3){snowParticleT=0;spawnSnowParticles(P.x,P.y,P.z);}}
  let fw=joy.y,sr=joy.x;
  if(isDesktop){fw=0;sr=0;if(keys['KeyW']||keys['ArrowUp'])fw=1;if(keys['KeyS']||keys['ArrowDown'])fw=-1;if(keys['KeyA']||keys['ArrowLeft'])sr=-1;if(keys['KeyD']||keys['ArrowRight'])sr=1;if(fw&&sr){const inv2=1/Math.SQRT2;fw*=inv2;sr*=inv2;}}
  const sprinting=!!keys['ShiftLeft']||!!keys['ShiftRight'];const curSpeed=sprinting?SPRINT_SPEED:SPEED;
  const sY=Math.sin(yaw),cY=Math.cos(yaw);
  movePlayer((sr*cY+fw*sY)*curSpeed,(fw*cY-sr*sY)*curSpeed,dt);
  camera.position.set(P.x,P.y+EYE,P.z);camera.rotation.order='YXZ';camera.rotation.x=pitch;camera.rotation.y=yaw;
  const _moving=(Math.abs(fw)+Math.abs(sr))>.01;
  updateViewBob(_moving,sprinting);
  updateHand(dt,_moving,sprinting);
  chunkT+=dt;if(chunkT>.5){updateChunks(false);applyWorldEdits();chunkT=0;}
  updateBoss(dt);updateDragon(dt);updateMobs(dt);
  mobRespawnT-=dt;if(mobRespawnT<=0){mobRespawnT=MOB_RESPAWN_INTERVAL;const lack=MAX_MOBS-mobs.length;if(lack>0)spawnPigs(Math.min(lack,4));}
  const t=Date.now()/1000;
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i],ep=e.root.position;
    if(e.hp<=0&&!e.dead){e.dead=true;spawnParticles(ep.x,ep.y,ep.z,e.type.color,4);dropItem(ep.x,ep.y,ep.z,e.type);scene.remove(e.root);disposeObject3D(e.root);enemies.splice(i,1);gs.kills++;gs.score+=e.type.score*(gs.wave||1);sfxKill();continue;}
    const dx=P.x-ep.x,dz=P.z-ep.z;const dist=Math.hypot(dx,dz);
    if(dist>50){scene.remove(e.root);disposeObject3D(e.root);enemies.splice(i,1);continue;}
    if(e.type.bat){
      const dy3=P.y+0.8-ep.y,dist3=Math.hypot(dx,dy3,dz);
      e.root.rotation.y=Math.atan2(dx,dz);
      if(dist3>0.6){const spd=(3.5+gs.wave*.15)*dt;ep.x+=dx/dist3*spd;ep.y+=dy3/dist3*spd;ep.z+=dz/dist3*spd;}
      const bk=voxels[vKey(Math.floor(ep.x),Math.floor(ep.y),Math.floor(ep.z))];if(bk&&bk.active)ep.y+=0.4;
      e.wingT=(e.wingT||0)+dt*12;
      if(e.lWing)e.lWing.rotation.z=Math.sin(e.wingT)*.7;
      if(e.rWing)e.rWing.rotation.z=-Math.sin(e.wingT)*.7;
      e.atkCd=Math.max(0,e.atkCd-dt);
      if(dist3<1.1&&e.atkCd<=0){dmgPlayer(Math.min(e.type.dmg+gs.wave*2,40));e.atkCd=0.7;}
      e.hpBar.lookAt(camera.position);
      continue;
    }
    e.root.rotation.y=Math.atan2(dx,dz);const spd=Math.min(2.5+gs.wave*.3,6.5);
    if(dist>1)moveEnemy(e,(dx/dist)*spd,(dz/dist)*spd,dt);
    // walk cycle: swing legs (and arms unless held in a fixed pose)
    if(e.legL){const moving=dist>1&&e.onGround;e.walkT=(e.walkT||0)+(moving?dt*7:0);const sw=moving?Math.sin(e.walkT)*.5:THREE.MathUtils.lerp(e.legL.rotation.x,0,.2);e.legL.rotation.x=sw;e.legR.rotation.x=-sw;if(e.armSwing!==false){if(e.armL)e.armL.rotation.x=-sw;if(e.armR)e.armR.rotation.x=sw;}}
    e.stuckT+=dt;if(e.stuckT>1.2){const mv=Math.abs(ep.x-e.lastX)+Math.abs(ep.z-e.lastZ);if(mv<.3&&e.onGround&&dist<14){e.velY=6.5;if(e.breakCd<=0)tryEnemyBreakBlock(e);}e.lastX=ep.x;e.lastZ=ep.z;e.stuckT=0;}
    if(e.onGround&&dist<6&&Math.random()<.008)e.velY=6;
    e.atkCd=Math.max(0,e.atkCd-dt);e.breakCd=Math.max(0,e.breakCd-dt);if(dist<1.6&&e.atkCd<=0&&hasLOS(ep.x,ep.y,ep.z,P.x,P.y+1,P.z)){dmgPlayer(Math.min(e.type.dmg+gs.wave*2,40));e.atkCd=1.2;}
    if(e.type.lava){const pulse=.35+Math.sin(t*4+i)*.2;e.body.material.emissiveIntensity=pulse;e.head.material.emissiveIntensity=pulse;}
    else if(e.type.ice){const pulse=.2+Math.sin(t*2+i)*.1;e.body.material.emissiveIntensity=pulse;e.head.material.emissiveIntensity=pulse;}
    else if(e.type.crystal){const pulse=.4+Math.sin(t*3+i)*.25;e.body.material.emissiveIntensity=pulse;e.head.material.emissiveIntensity=pulse;}
    else if(e.type.name==='Skeleton'){const nb=gs.time>.5?(gs.time-.5)*2:0;e.body.material.emissiveIntensity=.15+nb*.35;e.head.material.emissiveIntensity=.15+nb*.35;}
    else{const nb=gs.time>.5?(gs.time-.5)*2:0;e.body.material.emissiveIntensity=.08+nb*.3;e.head.material.emissiveIntensity=.08+nb*.3;}
    e.hpBar.lookAt(camera.position);
  }
  for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.x+=p.dx*dt;p.y+=p.dy*dt;p.z+=p.dz*dt;p.life-=dt;p.mesh.position.set(p.x,p.y,p.z);let hit=false;if(p.isBossArrow){const dx=p.x-P.x,dy=p.y-(P.y+1),dz=p.z-P.z;if(dx*dx+dy*dy+dz*dz<1.2){dmgPlayer(p.dmg);hit=true;}}else{for(const en of enemies){const ep=en.root.position,dx=p.x-ep.x,dy=p.y-ep.y,dz=p.z-ep.z;if(dx*dx+dy*dy+dz*dz<1.8){hitEnemy(en,p.dmg);hit=true;break;}}if(!hit&&boss){const bp=boss.root.position,dx=p.x-bp.x,dy=p.y-bp.y,dz=p.z-bp.z;if(dx*dx+dy*dy+dz*dz<(boss.sc*2)){hitBoss(p.dmg);hit=true;}}if(!hit&&dragon){const dp=dragon.root.position,pdx=p.x-dp.x,pdy=p.y-dp.y,pdz=p.z-dp.z;if(pdx*pdx+pdy*pdy+pdz*pdz<2.5){hitDragon(p.dmg,p.diamond===true||p.staff===true);hit=true;}}}if(!hit){const k=vKey(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z));if(voxels[k]&&voxels[k].active)hit=true;}if(hit&&p.diamond)spawnParticles(p.x,p.y,p.z,0x00e5ff,3);if(hit&&p.staff)spawnParticles(p.x,p.y,p.z,0x88ffff,5);if(hit||p.life<=0){scene.remove(p.mesh);p.mesh.material.dispose();projectiles.splice(i,1);}}
  for(let i=items.length-1;i>=0;i--){const it=items[i];it.time+=dt;it.mesh.position.y=it.y+Math.sin(it.time*3)*.2;it.mesh.rotation.y+=dt*2;const dx=P.x-it.x,dz=P.z-it.z,dy=P.y-it.y;if(dx*dx+dy*dy+dz*dz<3){pickupItem(it.info);scene.remove(it.mesh);it.mat.dispose();items.splice(i,1);continue;}if(it.time>25){scene.remove(it.mesh);it.mat.dispose();items.splice(i,1);}}
  updateParticles(dt);
  hudT+=dt;if(hudT>.1){updateHUD();hudT=0;}
  minimapT+=dt;if(minimapT>MINIMAP_INTERVAL){drawMinimap();minimapT=0;}
  if(settings.autoSave&&gs.running&&!gs.paused){autoSaveT+=dt;if(autoSaveT>=AUTOSAVE_INTERVAL){autoSaveT=0;saveGame();showSaveToast('💾 AUTO-SAVED');}}
  renderer.render(scene,camera);
}
requestAnimationFrame(tick);
document.addEventListener('touchmove',(e)=>{if(e.target.closest('#craftPanel')||e.target.closest('.menuCard'))return;e.preventDefault();},{passive:false});
// iOS Safari: prevent all zoom (pinch, double-tap, gesture)
document.addEventListener('gesturestart',(e)=>e.preventDefault(),{passive:false});
document.addEventListener('gesturechange',(e)=>e.preventDefault(),{passive:false});
document.addEventListener('gestureend',(e)=>e.preventDefault(),{passive:false});
document.addEventListener('touchstart',(e)=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
document.addEventListener('dblclick',(e)=>e.preventDefault(),{passive:false});
document.addEventListener('wheel',(e)=>{if(e.ctrlKey)e.preventDefault();},{passive:false});
}
if(typeof THREE==='undefined'){
  var fallback=document.createElement('script');
  fallback.src='https://unpkg.com/three@0.128.0/build/three.min.js';
  fallback.onload=boot;
  fallback.onerror=function(){document.getElementById('ovTitle').textContent='読込失敗';};
  document.head.appendChild(fallback);
}else{
  boot();
}
})();
