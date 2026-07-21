// ============================================================================
// jokura / mobileui.js
// スマホ向けUI整理レイヤー。既存のゲームロジック（doAttack/doPlace/setType/
// setArrowMode/eatMeat 等）と状態（inv/weaponIdx/curType/isCreative 等）を
// 再利用し、表示と操作導線だけを再構成する。PARTS の最後に読み込まれるため、
// ここでは全モジュールのグローバルが利用可能。
//   - 上部メニュー（バッグ/クエスト/クラフト/メニュー）
//   - インベントリ（バッグ）パネル: タブ + アイコングリッド
//   - メイン/サブアクションボタンの選択アイテム連動表示
//   - クリエイティブ表示・ミニマップ拡縮
// ============================================================================

// ─── クリエイティブ判定に応じた body クラス（CSSでバッジ表示等を切替） ───
function applyMobileModeUI(){
  try{document.body.classList.toggle('creative',isCreative());}catch(e){}
}

// ═══ メイン/サブ アクションボタン（選択中の武器・ブロックに連動） ═══
// メイン(breakBtn) = 現在の武器のアクション（ATTACK/SHOOT/CAST/MINE、採掘も兼ねる）。
// サブ(placeBtn)  = 現在のホットバーブロックの設置（長押しで家具・農作業）。
// 既存の doAttack / doPlace / doFurnitureAction をそのまま呼ぶ実装は main.js 側の
// バインドを流用し、ここではラベル/アイコンの見た目更新だけを行う。
const _mainActIcon=document.getElementById('mainActIcon');
const _mainActLabel=document.getElementById('mainActLabel');
const _subActIcon=document.getElementById('subActIcon');
const _subActLabel=document.getElementById('subActLabel');
const _weaponBtnIcon=document.getElementById('weaponBtnIcon');
const _miniCoords=document.getElementById('miniCoords');
// ホットバーの各スロット（ブロック）のアイコン絵文字と表示名
const BLOCK_ICONS=['🌿','🪨','🏖','🪵','🧱','🔥','⬜','🪜','🪟','🧶','💣'];
const BLOCK_NAMES=['Grass','Stone','Sand','Wood','Brick','Torch','Slab','Stairs','Glass','Wool','TNT'];
function _weaponGlyph(){const n=(WEAPONS[weaponIdx]&&WEAPONS[weaponIdx].name)||'';return n.split(' ')[0]||'👊';}
function _weaponVerb(){
  const w=WEAPONS[weaponIdx];if(!w)return 'ATTACK';
  if(w.type==='ranged')return 'SHOOT';
  if(w.type==='aoe'||w.type==='staff')return 'CAST';
  if(w.type==='hammer')return 'MINE';
  return 'ATTACK';
}
let _muiLastActKey='';
function updateActionBtns(){
  if(isDesktop)return; // PCは actionWrap 非表示
  const glyph=_weaponGlyph(),verb=_weaponVerb();
  const bi=BLOCK_ICONS[curType]||'🧱',bn=BLOCK_NAMES[curType]||'';
  const key=glyph+'|'+verb+'|'+bi+'|'+bn;
  if(key!==_muiLastActKey){
    _muiLastActKey=key;
    if(_mainActIcon)_mainActIcon.textContent=glyph;
    if(_mainActLabel)_mainActLabel.textContent=verb;
    if(_subActIcon)_subActIcon.textContent=bi;
    if(_subActLabel)_subActLabel.textContent='PLACE';
    if(_weaponBtnIcon)_weaponBtnIcon.textContent=glyph;
  }
  if(_miniCoords)_miniCoords.textContent='X:'+Math.floor(P.x)+' Z:'+Math.floor(P.z);
}

// ═══ インベントリ（バッグ）パネル ═══
const _bagPanel=document.getElementById('bagPanel');
const _bagTabsEl=document.getElementById('bagTabs');
const _bagGridEl=document.getElementById('bagGrid');
const _bagHint=document.getElementById('bagHint');
const _bagBtn=document.getElementById('bagBtn');
const _bagCloseBtn=document.getElementById('bagCloseBtn');
let bagOpen=false,bagTab='blocks';

// 各タブは inv 等の現在状態からアイテム記述子の配列を返すビルダーを持つ。
// 記述子: {icon,name,count(number|null=非表示),sel,act:fn|null,locked,badge}
const BAG_TABS=[
  {id:'blocks',label:'ブロック',build(){
    const out=[];
    for(let i=0;i<SLOT_MAT.length;i++){
      const mat=SLOT_MAT[i];
      out.push({icon:BLOCK_ICONS[i],name:BLOCK_NAMES[i],count:inv[mat]||0,
        sel:curType===i,act:()=>{setType(i);showBonus('▶ '+BLOCK_NAMES[i]);}});
    }
    return out;
  }},
  {id:'mats',label:'素材',build(){
    const keys=['wood','stone','sand','grass','clay','ironOre','ironIngot','wool','ice','obsidian','crystal','cactus','mushroom'];
    return _infoItems(keys);
  }},
  {id:'weapons',label:'武器',build(){
    const out=[];
    for(let i=0;i<WEAPONS.length;i++){
      const w=WEAPONS[i],unlocked=!!unlockedWeapons[i];
      out.push({icon:(w.name.split(' ')[0]||'⚔'),name:w.name.replace(/^\S+\s*/,'')||w.name,
        count:null,sel:weaponIdx===i,locked:!unlocked,badge:unlocked?'':'🔒',
        act:unlocked?()=>{weaponIdx=i;attackCD=0;showBonus(w.name);playTone(600,.08,.08,'sine');}:null});
    }
    // 矢の装填切替（弓用）
    const arrows=[['normal','🏹','ARROW','arrow'],['fire','🔥','FIRE','fireArrow'],['ice','🧊','ICE','iceArrow']];
    for(const [m,ic,nm,k] of arrows){
      const c=m==='normal'?inv.arrow:inv[k];
      if(!isCreative()&&m!=='normal'&&c<=0)continue;
      out.push({icon:ic,name:nm+'矢',count:c,sel:arrowMode===m,
        act:()=>setArrowMode(m)});
    }
    if(armor){const d=ARMOR_DEFS[armor.tier];out.push({icon:'🛡',name:d.name.replace(/^\S+\s*/,''),count:null,info:true,badge:isCreative()?'∞':armorPct()+'%'});}
    return out;
  }},
  {id:'food',label:'食料・作物',build(){
    const out=[];
    out.push({icon:'🥩',name:'MEAT',count:meat,act:meat>0?()=>eatMeat():null,locked:meat<=0});
    out.push({icon:'🍖',name:'STEAK',count:inv.steak||0,act:(inv.steak||0)>0?()=>eatMeat():null,locked:(inv.steak||0)<=0});
    out.push(..._infoItems(['seed','wheat']));
    return out;
  }},
  {id:'facility',label:'設備',build(){
    return [
      {icon:'📦',name:'Chest',count:chestCount,info:true},
      {icon:'🛏',name:'Bed',count:bedCount,info:true},
      {icon:'🔥',name:'Furnace',count:furnaceCount,info:true},
      {icon:'⚒',name:'Ench Table',count:enchTableCount,info:true},
      {icon:'🏆',name:'Statue',count:trophyCount,info:true},
    ];
  }},
  {id:'special',label:'特殊アイテム',build(){
    const out=_infoItems(['diamond','dragonCore']);
    if(treasureMap)out.push({icon:'🗺',name:'宝の地図',count:null,info:true});
    return out;
  }},
];
// count>0（またはクリエイティブ）のものだけを情報アイテムとして並べる
function _infoItems(keys){
  const out=[];
  for(const k of keys){
    const c=inv[k]||0;
    if(!isCreative()&&c<=0)continue;
    const lbl=(MATERIAL_LABELS[k]||k);
    out.push({icon:lbl.split(' ')[0]||'▪',name:lbl.replace(/^\S+\s*/,'')||k,count:c,info:true});
  }
  if(!out.length)out.push({icon:'—',name:'なし',count:null,info:true,empty:true});
  return out;
}
function _bagCount(d){
  // クリエイティブでは各アイテムに∞を並べず、上部の「CREATIVE ∞」表示に集約する
  if(d.count==null||isCreative())return '';
  return d.count;
}
function renderBag(){
  if(!_bagGridEl||!_bagTabsEl)return;
  // タブバー（初回のみ生成、以降は選択状態だけ更新）
  if(!_bagTabsEl.childElementCount){
    for(const t of BAG_TABS){
      const b=document.createElement('button');b.className='bagTab';b.dataset.tab=t.id;b.textContent=t.label;
      b.addEventListener('pointerdown',(e)=>{e.preventDefault();e.stopPropagation();bagTab=t.id;renderBag();playTone(520,.05,.05,'sine');});
      _bagTabsEl.appendChild(b);
    }
  }
  for(const b of _bagTabsEl.children)b.classList.toggle('sel',b.dataset.tab===bagTab);
  const tab=BAG_TABS.find(t=>t.id===bagTab)||BAG_TABS[0];
  const items=tab.build();
  _bagGridEl.innerHTML='';
  for(const d of items){
    const el=document.createElement('div');
    el.className='bagItem'+(d.sel?' sel':'')+(d.locked?' locked':'')+(d.info?' info':'')+(d.empty?' empty':'')+((d.act&&!d.locked)?' act':'');
    if(!isCreative()&&!d.info&&!d.locked&&typeof d.count==='number'&&d.count<=0)el.classList.add('empty');
    const cnt=_bagCount(d);
    el.innerHTML='<div class="bagIcon">'+d.icon+'</div><div class="bagName">'+d.name+'</div>'+
      (cnt!==''?'<div class="bagCount">'+cnt+'</div>':'')+
      (d.badge?'<div class="bagBadge">'+d.badge+'</div>':'');
    if(d.act&&!d.locked){
      el.addEventListener('pointerdown',(e)=>{e.preventDefault();e.stopPropagation();d.act();renderBag();});
    }
    _bagGridEl.appendChild(el);
  }
  if(_bagHint)_bagHint.textContent=bagTab==='blocks'?'ブロックをタップでホットバー選択。設置はサブアクションで。'
    :bagTab==='weapons'?'武器をタップで装備。矢をタップで装填切替。'
    :bagTab==='food'?'肉・ステーキをタップで食べる。'
    :'所持アイテムの一覧です。';
}
function renderBagIfOpen(){if(bagOpen)renderBag();}
function openBag(){if(!gs.running)return;bagOpen=true;renderBag();setPanel(_bagPanel,true);}
function closeBag(){bagOpen=false;setPanel(_bagPanel,false);}
function toggleBag(){if(_bagPanel&&_bagPanel.classList.contains('show'))closeBag();else openBag();}
if(_bagBtn)bindTapSafe(_bagBtn,toggleBag);
if(_bagCloseBtn)bindTapSafe(_bagCloseBtn,closeBag);
// .menuPanel の共通クローズ（背景タップ/✕）で閉じたときも bagOpen を同期
if(_bagPanel){
  const _sync=()=>{bagOpen=_bagPanel.classList.contains('show');};
  _bagPanel.addEventListener('pointerup',_sync);
}
// PC: I / Tab でインベントリ開閉
document.addEventListener('keydown',(e)=>{
  if(!gs.running)return;
  if(e.code==='KeyI'||e.code==='Tab'){e.preventDefault();toggleBag();}
});

// ═══ ミニマップ タップで拡大／縮小 ═══
const _minimapEl=document.getElementById('minimap');
if(_minimapEl){
  bindTapSafe(_minimapEl,()=>{_minimapEl.classList.toggle('big');});
}

// 初期反映（タイトル表示中も body クラスを整合させておく）
applyMobileModeUI();
