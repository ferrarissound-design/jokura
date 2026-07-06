// ============================================================================
// jokura / crafting.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、下記の順序で <script> として読み込まれ、すべて同一のグローバル
// スコープを共有する（元は単一の boot() 関数だったため、この順序と共有スコープが前提）。
// 読み込み順: state → achievements → crafting → save → ui → audio → world →
//             combat → entities → hud → input → main
// ============================================================================

const $invWood=document.getElementById('invWood');
const $invStone=document.getElementById('invStone');
const $invSand=document.getElementById('invSand');
const $invGrass=document.getElementById('invGrass');
const $invBrick=document.getElementById('invBrick');
const $invArrow=document.getElementById('invArrow');
const $invFireArrow=document.getElementById('invFireArrow');
const $invIceArrow=document.getElementById('invIceArrow');
const $invIce=document.getElementById('invIce');
const $invObsidian=document.getElementById('invObsidian');
const $invCrystal=document.getElementById('invCrystal');
const $invCactus=document.getElementById('invCactus');
const $invMushroom=document.getElementById('invMushroom');
const $invClay=document.getElementById('invClay');
const $invIronOre=document.getElementById('invIronOre');
const $invIronIngot=document.getElementById('invIronIngot');
const $invDiamond=document.getElementById('invDiamond');
const $invDragonCore=document.getElementById('invDragonCore');
const $invSeed=document.getElementById('invSeed');
const $invWheat=document.getElementById('invWheat');
const $invWool=document.getElementById('invWool');
const $treasureInfo=document.getElementById('treasureInfo');
const $craftPanel=document.getElementById('craftPanel');

function updateInvHUD(){
  const q=v=>isCreative()?'∞':v; // creative: everything is infinite
  $invWood.textContent='🪵 WOOD: '+q(inv.wood);
  $invStone.textContent='🪨 STONE: '+q(inv.stone);
  $invSand.textContent='🏖 SAND: '+q(inv.sand);
  $invGrass.textContent='🌿 GRASS: '+q(inv.grass);
  $invBrick.textContent='🧱 BRICK: '+q(inv.brick);
  $invArrow.textContent=(arrowMode==='normal'?'▶':'')+'🏹 ARROW: '+q(inv.arrow);
  $invArrow.classList.toggle('sel',arrowMode==='normal');
  // 特殊矢と固有素材の行は手に入れるまで隠す（HUDを圧迫しないように）
  const optRow=(el,txt,v,sel)=>{if(!el)return;const show=isCreative()||v>0||sel;el.style.display=show?'':'none';el.textContent=(sel?'▶':'')+txt+': '+q(v);if(sel!=null)el.classList.toggle('sel',!!sel);};
  optRow($invFireArrow,'🔥 FIRE ARROW',inv.fireArrow,arrowMode==='fire');
  optRow($invIceArrow,'🧊 ICE ARROW',inv.iceArrow,arrowMode==='ice');
  optRow($invIce,'🧊 ICE',inv.ice,null);
  optRow($invObsidian,'⬛ OBSIDIAN',inv.obsidian,null);
  optRow($invCrystal,'🔮 CRYSTAL',inv.crystal,null);
  optRow($invCactus,'🌵 CACTUS',inv.cactus,null);
  optRow($invMushroom,'🍄 MUSHROOM',inv.mushroom,null);
  optRow($invClay,'🟤 CLAY',inv.clay,null);
  optRow($invIronOre,'🔶 IRON ORE',inv.ironOre,null);
  optRow($invIronIngot,'🔩 IRON INGOT',inv.ironIngot,null);
  $invDiamond.textContent='💎 DIAMOND: '+q(inv.diamond);
  $invDragonCore.textContent='💠 DRAGON CORE: '+q(inv.dragonCore);
  if($invSeed)$invSeed.textContent='🌱 SEED: '+q(inv.seed);
  if($invWheat)$invWheat.textContent='🌾 WHEAT: '+q(inv.wheat);
  if($invWool)$invWool.textContent='🧶 WOOL: '+q(inv.wool);
  const tc=document.getElementById('torchCount');if(tc)tc.textContent=isCreative()?'∞':(inv.torch>0?inv.torch:'');
  const slc=document.getElementById('slabCount');if(slc)slc.textContent=isCreative()?'∞':(inv.slab>0?inv.slab:'');
  const stc=document.getElementById('stairCount');if(stc)stc.textContent=isCreative()?'∞':(inv.stair>0?inv.stair:'');
}

// ─── 矢の切替（通常/火矢/氷矢）: 左のARROW行タップ or Rキー ───
function setArrowMode(m){
  if(m!=='normal'&&!isCreative()&&inv[m==='fire'?'fireArrow':'iceArrow']<=0){showBonus(m==='fire'?'🔥 火矢がない！🪵×2+⬛×1でクラフト':'🧊 氷矢がない！🪵×2+🧊×1でクラフト');return;}
  arrowMode=m;updateInvHUD();
  showBonus(m==='fire'?'🔥 火矢を装填（命中で炎上）':m==='ice'?'🧊 氷矢を装填（命中で鈍足）':'🏹 通常の矢を装填');
  playTone(700,.08,.08,'sine');
}
function cycleArrowMode(){
  if(!gs.running)return;
  const order=['normal','fire','ice'];
  let i=order.indexOf(arrowMode);
  for(let s=0;s<order.length;s++){
    i=(i+1)%order.length;const m=order[i];
    if(m==='normal'||isCreative()||inv[m==='fire'?'fireArrow':'iceArrow']>0){arrowMode=m;updateInvHUD();showBonus(m==='fire'?'🔥 火矢を装填':m==='ice'?'🧊 氷矢を装填':'🏹 通常の矢を装填');playTone(700,.08,.08,'sine');return;}
  }
}
const $armorLabel=document.getElementById('armorLabel');
function armorPct(){if(!armor)return 0;return Math.max(0,Math.ceil(armor.dur/ARMOR_DEFS[armor.tier].maxDur*100));}
function updateArmorHUD(){
  if(!$armorLabel)return;
  if(!armor){$armorLabel.style.display='none';return;}
  const def=ARMOR_DEFS[armor.tier];
  $armorLabel.style.display='block';
  $armorLabel.style.color=def.hudColor;
  $armorLabel.textContent=def.name+' '+(isCreative()?'∞':armorPct()+'%');
}
function equipArmor(tier){
  const def=ARMOR_DEFS[tier];if(!def)return;
  armor={tier,dur:def.maxDur};
  updateArmorHUD();
  showAlert(def.name+' 装備！ 被ダメージ-'+Math.round(def.cut*100)+'%');
  unlockAchievement('firstArmor');
  playTone(500,.12,.12,'square');setTimeout(()=>playTone(750,.1,.1,'square'),110);
}

const FIRST_FIND_ALERTS={
  ice:'🧊 氷を入手！氷矢の素材だ（上を歩くと滑る）',
  obsidian:'⬛ 黒曜石を入手！火矢の素材だ',
  crystal:'🔮 水晶を入手！強化台の射程強化に使える',
  cactus:'🌵 サボテンを入手！ジュースにできる',
  mushroom:'🍄 キノコを入手！シチューにできる',
  clay:'🟤 粘土を入手！レンガの素材だ',
  ironOre:'🔶 鉄鉱石を入手！🔥かまど(🪨×12)で精錬しよう',
};
function addMaterial(ti){
  const mat=BLOCK_MAT_MAP[ti];if(!mat)return;
  if(mat==='diamond'&&inv.diamond===0)showAlert('💎 DIAMOND FOUND!');
  if(FIRST_FIND_ALERTS[mat]&&inv[mat]===0)showAlert(FIRST_FIND_ALERTS[mat]);
  inv[mat]++;updateInvHUD();
  if(mat==='diamond')unlockAchievement('firstDiamond');
  if(inv.ice>0&&inv.obsidian>0&&inv.crystal>0&&inv.cactus>0&&inv.mushroom>0&&inv.clay>0)unlockAchievement('biomeCollector');
}

function canCraft(recipe){
  if(isCreative())return true; // creative: no materials needed
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
  dragonCore:'💠 DRAGON CORE',
  slab:'⬜ SLAB',
  stair:'🪜 STAIRS',
  seed:'🌱 SEED',
  wheat:'🌾 WHEAT',
  wool:'🧶 WOOL',
  fireArrow:'🔥 FIRE ARROW',
  iceArrow:'🧊 ICE ARROW',
  ice:'🧊 ICE',
  obsidian:'⬛ OBSIDIAN',
  crystal:'🔮 CRYSTAL',
  cactus:'🌵 CACTUS',
  mushroom:'🍄 MUSHROOM',
  clay:'🟤 CLAY',
  ironOre:'🔶 IRON ORE',
  ironIngot:'🔩 IRON INGOT'
};

function getMissingMaterialsText(recipe){
  const lacks=[];
  for(const[k,v] of Object.entries(recipe.needs)){
    const cur=inv[k]||0;
    if(cur<v){const label=MATERIAL_LABELS[k]||k.toUpperCase();lacks.push(label+' '+cur+'/'+v);}
  }
  return lacks.join('  ');
}

function applyIronSword(){
  hasIronSword=true;
  unlockedWeapons[1]=true;
  if(hasDiamondSword)return; // ダイヤ剣が上位: 性能・表示は上書きしない
  WEAPONS[1].name='🔩 Iron Sword';WEAPONS[1].dmg=5;WEAPONS[1].cd=0.38;
  if(weaponIdx===1){const wl=document.getElementById('weaponLabel');if(wl)wl.textContent='🔩 Iron Sword';}
}
function resetSwordStats(){
  WEAPONS[1].name='⚔ Sword';WEAPONS[1].dmg=3;WEAPONS[1].cd=0.4;
  if(weaponIdx===1){const wl=document.getElementById('weaponLabel');if(wl)wl.textContent='⚔ Sword';}
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
  if(r.wi===-26&&(hasIronSword||hasDiamondSword))return; // ダイヤ剣所持なら鉄の剣は不要
  if(r.armorTier!=null&&armor&&armor.tier===r.armorTier&&armor.dur>=ARMOR_DEFS[r.armorTier].maxDur)return;
  if(!isCreative()&&r.req!=null&&!unlockedWeapons[r.req]){showBonus('先に'+WEAPONS[r.req].name+'を入手しよう');playTone(200,.1,.08,'sawtooth');closeCraftPanel();return;}
  if(!canCraft(r)){showBonus('素材が足りない…');playTone(200,.1,.08,'sawtooth');closeCraftPanel();return;}
  if(!isCreative())for(const[k,v] of Object.entries(r.needs))inv[k]-=v;
  if(r.wi===-1){chestCount++;updateChestHUD();showBonus('📦 チェスト×'+chestCount);}
  else if(r.wi===-2){bedCount++;updateBedHUD();showBonus('🛏 ベッド×'+bedCount);}
  else if(r.wi===-3){inv.brick+=3;showBonus('🧱 レンガ×3 CRAFTED!');}
  else if(r.wi===-4){P.hp=Math.min(P.maxHp,P.hp+30);showBonus('💊 HP+30 HEALED!');}
  else if(r.wi===-5){inv.arrow+=10;showBonus('🏹 矢×10 CRAFTED!');}
  else if(r.wi===-11){inv.torch+=4;showBonus('🔥 トーチ×4 CRAFTED!');}
  else if(r.wi===-12){inv.slab+=4;showBonus('⬜ ハーフブロック×4 CRAFTED!');}
  else if(r.wi===-13){inv.stair+=4;showBonus('🪜 階段×4 CRAFTED!');}
  else if(r.wi===-17){inv.seed+=4;showBonus('🌱 種×4 CRAFTED!');}
  else if(r.wi===-18){P.hp=Math.min(P.maxHp,P.hp+10);P.food=Math.min(100,P.food+50);showBonus('🍞 パン FOOD+50 HP+10!');}
  else if(r.wi===-20){inv.fireArrow+=10;showBonus('🔥 火矢×10 CRAFTED! ARROW表示タップ/Rで装填');}
  else if(r.wi===-21){inv.iceArrow+=10;showBonus('🧊 氷矢×10 CRAFTED! ARROW表示タップ/Rで装填');}
  else if(r.wi===-22){P.hp=Math.min(P.maxHp,P.hp+20);P.food=Math.min(100,P.food+35);showBonus('🍄 シチュー FOOD+35 HP+20!');}
  else if(r.wi===-23){P.food=Math.min(100,P.food+25);showBonus('🌵 ジュース FOOD+25!');}
  else if(r.wi===-24){inv.brick+=4;showBonus('🧱 レンガ×4 CRAFTED!');}
  else if(r.wi===-19){enchTableCount++;updateEnchTableHUD();showBonus('⚒ 強化台×'+enchTableCount+'  X/PLACE長押しで設置！');}
  else if(r.wi===-25){furnaceCount++;updateFurnaceHUD();showBonus('🔥 かまど×'+furnaceCount+'  X/PLACE長押しで設置！');}
  else if(r.wi===-26){applyIronSword();showAlert('🔩 IRON SWORD CRAFTED!');playTone(1000,.18,.18,'square');setTimeout(()=>playTone(1300,.14,.16,'square'),140);setTimeout(()=>playTone(1600,.1,.14,'square'),280);}
  else if(r.wi===-6){applyDiamondSword();showAlert('💎 DIAMOND SWORD CRAFTED!');playTone(1400,.2,.2,'sine');setTimeout(()=>playTone(1800,.15,.2,'sine'),150);setTimeout(()=>playTone(2200,.1,.2,'sine'),300);}
  else if(r.wi===-7){applyDiamondBow();showAlert('💎 DIAMOND BOW CRAFTED!');playTone(1600,.2,.2,'triangle');setTimeout(()=>playTone(2000,.15,.2,'triangle'),150);setTimeout(()=>playTone(2400,.1,.2,'triangle'),300);}
  else if(r.wi===-8){applyDiamondStaff();showAlert('🔮 DIAMOND STAFF CRAFTED!');playTone(2400,.2,.15,'sine');setTimeout(()=>playTone(3200,.15,.12,'sine'),120);setTimeout(()=>playTone(1800,.1,.1,'sine'),240);}
  else if(r.wi===-9){trophyCount++;updateTrophyHUD();showAlert('🏆 ダイヤドラゴン像 CRAFTED! 拠点に飾ろう！');playTone(2000,.2,.15,'sine');setTimeout(()=>playTone(2600,.15,.12,'sine'),130);setTimeout(()=>playTone(3200,.1,.1,'sine'),260);}
  else if(r.wi===-10){applyDiamondHammer();showAlert('💎 DIAMOND HAMMER CRAFTED!');playTone(900,.15,.2,'square');setTimeout(()=>playTone(700,.15,.18,'square'),120);setTimeout(()=>playTone(1100,.1,.15,'square'),240);}
  else if(r.armorTier!=null){equipArmor(r.armorTier);}
  else{unlockedWeapons[r.wi]=true;showBonus('🛠 '+r.name+' CRAFTED!');}
  if(r.wi===1)unlockAchievement('firstSword');
  else if(r.wi===2)unlockAchievement('firstHammer');
  else if(r.wi===3)unlockAchievement('firstBow');
  updateInvHUD();if(r.wi!==-6&&r.wi!==-7&&r.wi!==-8&&r.wi!==-9&&r.wi!==-26&&r.armorTier==null){playTone(800,.15,.12,'sine');setTimeout(()=>playTone(1000,.1,.1,'sine'),120);}
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
    else if(r.wi===-26&&hasIronSword){el.classList.add('done');el.textContent='✅ '+r.name+' (作成済み)';}
    else if(r.wi===-26&&hasDiamondSword){el.classList.add('done');el.textContent='✅ '+r.name+' (💎剣所持)';}
    else if(r.wi===-9&&trophyCount>0){el.classList.add('done');el.textContent='✅ '+r.name+' (作成済み×'+trophyCount+')';}
    else if(r.armorTier!=null&&armor&&armor.tier===r.armorTier&&armor.dur>=ARMOR_DEFS[r.armorTier].maxDur){el.classList.add('done');el.textContent='✅ '+r.name+' (装備中)';}
    else if(r.req!=null&&!unlockedWeapons[r.req]){el.classList.add('locked');el.textContent='🔒 '+r.name+' ('+r.desc+') / 要:'+WEAPONS[r.req].name;}
    else if(!canCraft(r)){el.classList.add('locked');const miss=getMissingMaterialsText(r);el.textContent='🔒 '+r.name+' ('+r.desc+') / 不足 '+miss;}
    else{el.textContent='🔵 '+r.name+' ('+r.desc+')';el.addEventListener('pointerdown',(e)=>{e.stopPropagation();doCraft(i);});}
    $craftPanel.appendChild(el);
  });
  // 🔥かまどの近くにいるときだけ精錬メニューを追加
  if(_furnaceNearby()){
    const hd=document.createElement('div');hd.className='citem header';hd.textContent='🔥 精錬（かまど）';$craftPanel.appendChild(hd);
    SMELT_RECIPES.forEach((r,i)=>{
      const el=document.createElement('div');el.className='citem';
      if(canCraft(r)){el.textContent='🔵 '+r.name+' ('+r.desc+')';el.addEventListener('pointerdown',(e)=>{e.stopPropagation();doSmelt(i);});}
      else{el.classList.add('locked');el.textContent='🔒 '+r.name+' ('+r.desc+') / 不足 '+getMissingMaterialsText(r);}
      $craftPanel.appendChild(el);
    });
  }
  // ⚒強化台の近くにいるときだけ武器強化メニューを追加
  if(_enchTableNearby()){
    const hd=document.createElement('div');hd.className='citem header';hd.textContent='⚒ 武器強化（強化台）';$craftPanel.appendChild(hd);
    ENCHANT_DEFS.forEach((d,i)=>{
      const el=document.createElement('div');el.className='citem';
      const lv=enchLevel(d);
      if(lv>=d.max){el.classList.add('done');el.textContent='✨ '+d.icon+' '+d.name+(d.max>1?' Lv'+lv:'')+' MAX';}
      else{
        const cost=d.cost(lv+1);
        const afford=isCreative()||Object.entries(cost).every(([k,v])=>(inv[k]||0)>=v);
        const label=d.icon+' '+d.name+(d.max>1?' Lv'+(lv+1):'')+' ('+enchCostText(cost)+')';
        if(afford){el.textContent='🔵 '+label;el.addEventListener('pointerdown',(e)=>{e.stopPropagation();doEnchant(i);});}
        else{el.classList.add('locked');el.textContent='🔒 '+label;}
      }
      $craftPanel.appendChild(el);
    });
  }
}
function doSmelt(i){
  const r=SMELT_RECIPES[i];if(!r)return;
  if(!_furnaceNearby()){showBonus('🔥 かまどの近くでのみ精錬できる');return;}
  if(!canCraft(r)){showBonus('素材が足りない…');playTone(200,.1,.08,'sawtooth');return;}
  if(!isCreative())for(const[k,v]of Object.entries(r.needs))inv[k]-=v;
  for(const[k,v]of Object.entries(r.give))inv[k]+=v;
  unlockAchievement('firstSmelt');
  updateInvHUD();
  showBonus(r.name+' 精錬完了！');
  playTone(600,.12,.12,'square');setTimeout(()=>playTone(900,.1,.1,'square'),110);
  buildCraftPanel(); // 連続精錬できるようパネルは開いたまま更新
}
function doEnchant(i){
  const d=ENCHANT_DEFS[i];if(!d)return;
  const lv=enchLevel(d);if(lv>=d.max)return;
  if(!_enchTableNearby()){showBonus('⚒ 強化台の近くでのみ強化できる');return;}
  const cost=d.cost(lv+1);
  if(!isCreative()){
    for(const[k,v]of Object.entries(cost)){if((inv[k]||0)<v){showBonus('素材が足りない…');playTone(200,.1,.08,'sawtooth');return;}}
    for(const[k,v]of Object.entries(cost))inv[k]-=v;
  }
  if(d.key==='fire')enchants.fire=true;
  else if(d.key==='frost')enchants.frost=true;
  else enchants[d.key]=lv+1;
  unlockAchievement('firstEnchant');
  updateInvHUD();
  showAlert(d.icon+' '+d.name+(d.max>1?' Lv'+(lv+1):'')+'！ '+d.effect);
  playTone(1500,.15,.15,'sine');setTimeout(()=>playTone(2000,.12,.12,'sine'),120);setTimeout(()=>playTone(2600,.1,.1,'sine'),240);
  buildCraftPanel(); // 連続強化できるようパネルは開いたまま更新
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
const HAS_POINTER_EVENTS='PointerEvent' in window;
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
  if(HAS_POINTER_EVENTS)el.addEventListener('pointerdown',run);
  else el.addEventListener('touchstart',run,{passive:false});
}

bindTapSafe($craftBtn,_onCraftBtnTap);
// ARROW行タップで装填する矢を切替（PCはRキーでも可）
if($invArrow)bindTapSafe($invArrow,()=>setArrowMode('normal'));
if($invFireArrow)bindTapSafe($invFireArrow,()=>setArrowMode('fire'));
if($invIceArrow)bindTapSafe($invIceArrow,()=>setArrowMode('ice'));
document.addEventListener('pointerdown',(e)=>{if(!$craftPanel.classList.contains('open'))return;if(e.target.closest('#craftPanel')||e.target.id==='craftBtn')return;closeCraftPanel();},{passive:true});

function resetInv(){
  inv.wood=0;inv.stone=0;inv.sand=0;inv.grass=0;inv.brick=0;inv.arrow=0;inv.fireArrow=0;inv.iceArrow=0;inv.diamond=0;inv.dragonCore=0;inv.torch=0;inv.slab=0;inv.stair=0;inv.seed=0;inv.wheat=0;inv.wool=0;
  inv.ice=0;inv.obsidian=0;inv.crystal=0;inv.cactus=0;inv.mushroom=0;inv.clay=0;
  inv.ironOre=0;inv.ironIngot=0;
  arrowMode='normal';resetEnchants();
  hasDiamondSword=false;hasIronSword=false;
  WEAPONS[1].name='⚔ Sword';WEAPONS[1].dmg=3;WEAPONS[1].cd=0.4;
  hasDiamondBow=false;
  WEAPONS[3].name='🏹 Bow';WEAPONS[3].dmg=4;WEAPONS[3].cd=0.7;
  hasDiamondStaff=false;
  hasDiamondHammer=false;
  WEAPONS[2].name='🔨 Hammer';WEAPONS[2].dmg=6;WEAPONS[2].cd=0.8;WEAPONS[2].range=3;WEAPONS[2].type='melee';
  for(let i=0;i<unlockedWeapons.length;i++)unlockedWeapons[i]=(i===0);
  armor=null;updateArmorHUD();
  updateInvHUD();
}

