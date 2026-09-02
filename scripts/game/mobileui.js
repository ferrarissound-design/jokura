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
const _weaponBtnLabel=document.getElementById('weaponBtnLabel');
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
    // ATTACKボタン(大)と武器切替ボタン(小)が同じ武器アイコンを表示すると「同じ拳なのに
    // 役割が違う」ように見えて紛らわしいため、武器切替側は固定の🔁アイコン+現在武器の
    // 絵文字を小さく添える見た目に分け、役割の違いを一目でわかるようにする。
    if(_weaponBtnIcon)_weaponBtnIcon.textContent='🔁';
    if(_weaponBtnLabel)_weaponBtnLabel.textContent=glyph;
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
    const keys=['wood','stone','sand','grass','clay','ironOre','ironIngot','wool','ice','obsidian','crystal','cactus','mushroom','judgmentCore'];
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
    const out=_infoItems(['diamond','dragonCore','dungeonKey']);
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

// ============================================================================
// クリエイティブHUD: 「…」メニュー / BUILDメニュー / BOMBメニュー
// ----------------------------------------------------------------------------
// 方針: 新しいボタンを増やして機能を実装し直すのではなく、既存の要素
// (#structBtn, #regionEditBtn, #crustBombBtn, #tsarBombBtn, #longinusBtn, #railgunBtn とその背後の関数)
// をポップオーバーの中へそのまま移動して再利用する。イベントバインドは各機能の
// スクリプト(main.js/aerial_bomb.js/tsar_bomba.js)側で既に済んでいるため、DOM上の
// 親要素を変えるだけで見た目だけを「常時フロート」から「メニューを開いた時だけ
// 表示される行」に変えられる。将来ボムや建築物を追加する場合も、対応する既存
// ボタンに .popItem クラスを付けてこのポップオーバーへ appendChild するだけで
// HUDにボタンが増殖しない。
// ============================================================================
const $hudMenuBtn=document.getElementById('hudMenuBtn');
const $hudMenuPopover=document.getElementById('hudMenuPopover');
const $buildMenuBtn=document.getElementById('buildMenuBtn');
const $buildMenuPopover=document.getElementById('buildMenuPopover');
const $bombMenuBtn=document.getElementById('bombMenuBtn');
const $bombMenuPopover=document.getElementById('bombMenuPopover');
const _hudPopovers=[$hudMenuPopover,$buildMenuPopover,$bombMenuPopover].filter(Boolean);

// 既存の特殊生成/範囲編集/地殻貫通爆弾/ツァーリ・ボンバボタンをポップオーバーへ移設。
// (getElementByIdで取得済みの各スクリプト側の参照は、DOM上の親を変えても失われない)
// 移設先でタップされたら(各機能自身のハンドラは stopPropagation するため document 側の
// 監視には頼れない)、ポップオーバー自体は閉じておく。元のタップ処理は別リスナーとして
// そのまま生き続けるので、ここで追加するのは「閉じる」だけの副作用。
if($buildMenuPopover){
  const sb=document.getElementById('structBtn'),rb=document.getElementById('regionEditBtn');
  if(sb){$buildMenuPopover.appendChild(sb);sb.addEventListener('pointerdown',()=>closeHudPopovers());}
  if(rb){$buildMenuPopover.appendChild(rb);rb.addEventListener('pointerdown',()=>closeHudPopovers());}
}
if($bombMenuPopover){
  const cb=document.getElementById('crustBombBtn'),tb=document.getElementById('tsarBombBtn'),lb=document.getElementById('longinusBtn'),rb=document.getElementById('railgunBtn'),wb=document.getElementById('worldEaterBtn');
  if(cb){$bombMenuPopover.appendChild(cb);cb.addEventListener('pointerdown',()=>closeHudPopovers());}
  if(tb){$bombMenuPopover.appendChild(tb);tb.addEventListener('pointerdown',()=>closeHudPopovers());}
  if(lb){$bombMenuPopover.appendChild(lb);lb.addEventListener('pointerdown',()=>closeHudPopovers());}
  if(rb){$bombMenuPopover.appendChild(rb);rb.addEventListener('pointerdown',()=>closeHudPopovers());}
  // 🕳 WORLD EATER: 他の超兵器と同じ導線(#actionWrap→bombMenuPopover)に乗せる
  if(wb){$bombMenuPopover.appendChild(wb);wb.addEventListener('pointerdown',()=>closeHudPopovers());}
}

function closeHudPopovers(){for(const p of _hudPopovers)p.classList.remove('show');}
function toggleHudPopover(el){
  if(!el)return;
  const willOpen=!el.classList.contains('show');
  closeHudPopovers();
  if(willOpen){el.classList.add('show');initAudio();}
}
if($hudMenuBtn)bindTapSafe($hudMenuBtn,()=>toggleHudPopover($hudMenuPopover));
if($buildMenuBtn)bindTapSafe($buildMenuBtn,()=>{if(!gs.running||!isCreative())return;toggleHudPopover($buildMenuPopover);});
if($bombMenuBtn)bindTapSafe($bombMenuBtn,()=>{if(!gs.running||!isCreative())return;toggleHudPopover($bombMenuPopover);});
// ポップオーバー外をタップしたら閉じる（メニューボタン自身とポップオーバー本体は除く）
document.addEventListener('pointerdown',(e)=>{
  if(e.target.closest('.hudPopover,#hudMenuBtn,#buildMenuBtn,#bombMenuBtn'))return;
  closeHudPopovers();
});

// ─── 「…」メニューの中身: 既存機能をそのまま呼び出すだけ ───
function _bindPopAction(id,fn){
  const el=document.getElementById(id);
  if(!el)return;
  bindTapSafe(el,()=>{fn();closeHudPopovers();});
}
_bindPopAction('hmBagBtn',()=>{if(typeof openBag==='function')openBag();});
_bindPopAction('hmQuestBtn',()=>{if(typeof openQuest==='function')openQuest();});
_bindPopAction('hmCraftBtn',()=>{if(typeof toggleCraftPanel==='function')toggleCraftPanel();});
_bindPopAction('hmSaveBtn',()=>{if(gs.running&&typeof saveGame==='function')saveGame();});
_bindPopAction('hmSettingsBtn',()=>{if(typeof openSettings==='function')openSettings();});
_bindPopAction('hmPauseBtn',()=>{if(typeof togglePause==='function')togglePause();});

// ─── BOMBメニュー: TNTはホットバーの通常ブロックなので、ここではワンタップで
// ホットバー選択を切り替えるショートカットだけを提供する（設置・起爆は既存のPLACE/
// TNT操作パネルをそのまま使う）。 ───
_bindPopAction('bombTntSelectBtn',()=>{
  if(!gs.running)return;
  const i=(typeof SLOT_MAT!=='undefined')?SLOT_MAT.indexOf('tnt'):-1;
  if(i<0)return;
  setType(i);showBonus('▶ 💣 TNT を選択（PLACEで設置）');
});

// 初期反映（タイトル表示中も body クラスを整合させておく）
applyMobileModeUI();

// ============================================================================
// END ZONE STATE CONSISTENCY HOTFIX
// PARTSの最後で全モジュールが揃った後に、既存の公開関数を最小限ラップする。
// 1) 終端界の浮島高度をsurfaceHeightAtへ反映
// 2) WORLD EATER侵食域へのブロック再配置/再建を禁止
// 3) ABYSS COLOSSUSの侵食opacityが非表示状態やCOREを復活させないよう修正
// 4) WORLD EATER完了後の再入場で無音状態を復元
// ============================================================================
const _ezHotfixSurfaceHeightAt=surfaceHeightAt;
function _ezHotfixEndZoneSurfaceHeightAt(wx,wz){
  wx=Math.floor(wx);wz=Math.floor(wz);
  // 読み込み済み列は、建造物も含めた実際の最上面を優先する。
  for(let y=EZ_ISLAND_Y_MAX+30;y>=EZ_VOID_Y;y--){
    const v=voxels[vKey(wx,y,wz)];
    if(v&&v.active&&v.ti!==WATER_BLOCK&&v.ti!==LAVA_BLOCK)return y;
  }
  let best=null;
  const testIsland=(isl)=>{
    if(!isl)return;
    const dx=wx-isl.wx,dz=wz-isl.wz;
    const q=(dx*dx)/(isl.rx*isl.rx)+(dz*dz)/(isl.rz*isl.rz);
    const edge=ezRand(wx,wz,9100+((isl.gx*131+isl.gz*977)|0));
    if(q>1+(edge-.5)*.22)return;
    const dome=Math.floor((ezNoiseV(wx*.045,wz*.045)+1)*1.6);
    const sy=isl.topY-Math.floor(Math.max(0,q-.55)*7)+dome;
    if(best==null||sy>best)best=sy;
  };
  testIsland(_ezCentralIsland());
  const gx0=Math.floor(wx/EZ_ISLAND_GRID),gz0=Math.floor(wz/EZ_ISLAND_GRID);
  for(let gx=gx0-1;gx<=gx0+1;gx++)for(let gz=gz0-1;gz<=gz0+1;gz++)testIsland(_ezIslandAt(gx,gz));
  return best==null?EZ_VOID_Y-1:best;
}
window.surfaceHeightAt=function(wx,wz){
  if(typeof currentDimension!=='undefined'&&currentDimension==='endZone')return _ezHotfixEndZoneSurfaceHeightAt(wx,wz);
  return _ezHotfixSurfaceHeightAt(wx,wz);
};

const _ezHotfixAddBlock=addBlock;
window.addBlock=function(x,y,z,ti,addToScene,playerPlaced,meta){
  if(typeof currentDimension!=='undefined'&&currentDimension==='endZone'&&typeof weZoneRemovesAt==='function'&&weZoneRemovesAt(x,y,z))return;
  return _ezHotfixAddBlock(x,y,z,ti,addToScene,playerPlaced,meta);
};

const _ezHotfixApplyWorldEdits=applyWorldEdits;
window.applyWorldEdits=function(){
  if(typeof currentDimension!=='undefined'&&currentDimension==='endZone'&&typeof weZoneRemovesAt==='function'){
    for(const col of _wePendingCols){
      const set=_weIndex.get(col);if(!set)continue;
      for(const k of set){
        if(worldEdits.placed[k]===undefined)continue;
        const p=k.split('|'),x=+p[0],y=+p[1],z=+p[2];
        if(weZoneRemovesAt(x,y,z)){delete worldEdits.placed[k];delete worldEdits.removed[k];}
      }
    }
  }
  return _ezHotfixApplyWorldEdits();
};

window.colossusApplyErosion=function(t){
  if(!_colossusRoot)return;
  t=Math.max(0,Math.min(1,t));
  _colossusErosionT=t;
  const op=1-t,meshes=[];
  if(_colossusRock)_colossusRock.traverse(o=>{if(o.isMesh)meshes.push(o);});
  if(_colossusChest){meshes.push(_colossusChest.shell);for(const pl of _colossusChest.plates)meshes.push(pl);}
  if(_colossusHead){meshes.push(_colossusHead.shell);for(const f of _colossusHead.fragments)meshes.push(f);}
  if(_colossusArmL)for(const m of _colossusArmL.shell)meshes.push(m);
  if(_colossusArmR)for(const m of _colossusArmR.shell)meshes.push(m);
  for(const m of meshes){
    if(!m||!m.material)continue;
    if(!m.material.transparent)m.material.transparent=true;
    m.material.opacity=op;
  }
  if(_colossusCore&&_colossusCore.material){
    if(!_colossusCore.material.transparent)_colossusCore.material.transparent=true;
    const coreBase=!ezColossusDefeated&&ezColossus.coreExposed&&ezColossus.core.hp>0?.7:0;
    _colossusCore.material.opacity=coreBase*op;
  }
  const baseVisible=(typeof ezDestab!=='undefined'&&ezDestab>=50)||ezColossusAwakened||ezColossusDefeated;
  _colossusRoot.visible=baseVisible&&op>.01;
};

const _ezHotfixWorldEaterMount=worldEaterMount;
window.worldEaterMount=function(){
  _ezHotfixWorldEaterMount();
  if(wePhase==='done'&&typeof audioDuckTo==='function')audioDuckTo(.02,.35);
  else if(wePhase==='eroding'){
    _weLastDuckPct=-1;
    if(typeof _weUpdateAmbientDecay==='function')_weUpdateAmbientDecay();
  }
};

// ============================================================================
// FINAL POLISH
// 長時間プレイとスマホ操作で残っていた小さな不整合を、全モジュール読込後に補正する。
// ============================================================================

// ─── バッグ: スクロール開始をタップとして誤認しない ───
// craft/cheat系と同じ bindTapSafe を使い、指を動かしたジェスチャでは選択・消費しない。
window.renderBag=function(){
  if(!_bagGridEl||!_bagTabsEl)return;
  if(!_bagTabsEl.childElementCount){
    for(const t of BAG_TABS){
      const b=document.createElement('button');b.className='bagTab';b.dataset.tab=t.id;b.textContent=t.label;
      bindTapSafe(b,()=>{bagTab=t.id;window.renderBag();playTone(520,.05,.05,'sine');});
      _bagTabsEl.appendChild(b);
    }
  }
  for(const b of _bagTabsEl.children)b.classList.toggle('sel',b.dataset.tab===bagTab);
  const tab=BAG_TABS.find(t=>t.id===bagTab)||BAG_TABS[0];
  const bagItems=tab.build();
  _bagGridEl.innerHTML='';
  for(const d of bagItems){
    const el=document.createElement('div');
    el.className='bagItem'+(d.sel?' sel':'')+(d.locked?' locked':'')+(d.info?' info':'')+(d.empty?' empty':'')+((d.act&&!d.locked)?' act':'');
    if(!isCreative()&&!d.info&&!d.locked&&typeof d.count==='number'&&d.count<=0)el.classList.add('empty');
    const cnt=_bagCount(d);
    el.innerHTML='<div class="bagIcon">'+d.icon+'</div><div class="bagName">'+d.name+'</div>'+
      (cnt!==''?'<div class="bagCount">'+cnt+'</div>':'')+
      (d.badge?'<div class="bagBadge">'+d.badge+'</div>':'');
    if(d.act&&!d.locked)bindTapSafe(el,()=>{d.act();window.renderBag();});
    _bagGridEl.appendChild(el);
  }
  if(_bagHint)_bagHint.textContent=bagTab==='blocks'?'ブロックをタップでホットバー選択。設置はサブアクションで。'
    :bagTab==='weapons'?'武器をタップで装備。矢をタップで装填切替。'
    :bagTab==='food'?'肉・ステーキをタップで食べる。'
    :'所持アイテムの一覧です。';
};
if(_bagTabsEl&&_bagTabsEl.childElementCount)_bagTabsEl.innerHTML='';
if(bagOpen)window.renderBag();

// ─── HUDポップオーバー: 他UIが stopPropagation しても外側タップで必ず閉じる ───
document.addEventListener('pointerdown',(e)=>{
  if(e.target.closest('.hudPopover,#hudMenuBtn,#buildMenuBtn,#bombMenuBtn'))return;
  closeHudPopovers();
},true);

// ─── 設置家具の当たり判定: 強化台とかまどもチェスト等と同様に実体を持たせる ───
const _finishOverlaps=overlaps;
window.overlaps=function(px,py,pz,hw,hh){
  if(_finishOverlaps(px,py,pz,hw,hh))return true;
  hw=hw||.35;hh=hh||1.75;
  const hitBox=(cx,cy,cz,hx,hy,hz)=>px-hw<cx+hx&&px+hw>cx-hx&&py<cy+hy&&py+hh>cy&&pz-hw<cz+hz&&pz+hw>cz-hz;
  for(const t of enchTables){if(hitBox(t.x+.5,t.y,t.z+.5,.48,1.08,.48))return true;}
  for(const f of furnaces){if(hitBox(f.x+.5,f.y,f.z+.5,.48,1.02,.48))return true;}
  return false;
};

// ─── 家具/畑のGPUリソース解放 ───
// 一部家具は共有Geometryを使うため disposeObject3D を一律適用せず、共有Geometryだけ
// 保護しつつ、インスタンス固有のGeometry/Materialを重複なく破棄する。
const _finishChestKeepGeos=new Set([_chestGeo]);
const _finishBedKeepGeos=new Set(Object.values(_bedGeos));
const _finishFarmKeepGeos=new Set([_farmSoilGeo,..._cropStageGeos]);
function _finishDisposeFurnitureMesh(root,keepGeos){
  if(!root)return;
  const geos=new Set(),mats=new Set();
  root.traverse(o=>{
    if(o.geometry&&(!keepGeos||!keepGeos.has(o.geometry)))geos.add(o.geometry);
    if(o.material){
      if(Array.isArray(o.material)){for(const m of o.material)if(m)mats.add(m);}
      else mats.add(o.material);
    }
  });
  for(const g of geos)if(g&&typeof g.dispose==='function')g.dispose();
  for(const m of mats)if(m&&typeof m.dispose==='function')m.dispose();
}
function _finishDisposeMeshes(meshes,keepGeos){for(const mesh of meshes)_finishDisposeFurnitureMesh(mesh,keepGeos);}

const _finishResetChests=resetChests;
window.resetChests=function(){const meshes=chests.map(c=>c.mesh);_finishResetChests();_finishDisposeMeshes(meshes,_finishChestKeepGeos);};
const _finishResetBeds=resetBeds;
window.resetBeds=function(){const meshes=beds.map(b=>b.mesh);_finishResetBeds();_finishDisposeMeshes(meshes,_finishBedKeepGeos);};
const _finishResetTrophies=resetTrophies;
window.resetTrophies=function(){const meshes=trophies.map(t=>t.mesh);_finishResetTrophies();_finishDisposeMeshes(meshes,null);};
const _finishResetEnchTables=resetEnchTables;
window.resetEnchTables=function(){const meshes=enchTables.map(t=>t.mesh);_finishResetEnchTables();_finishDisposeMeshes(meshes,null);};
const _finishResetFurnaces=resetFurnaces;
window.resetFurnaces=function(){const meshes=furnaces.map(f=>f.mesh);_finishResetFurnaces();_finishDisposeMeshes(meshes,null);};
const _finishResetFarmPlots=resetFarmPlots;
window.resetFarmPlots=function(){const meshes=farmPlots.map(f=>f.mesh);_finishResetFarmPlots();_finishDisposeMeshes(meshes,_finishFarmKeepGeos);};

const _finishUpdateFarmPlots=updateFarmPlots;
window.updateFarmPlots=function(dt){
  const oldMeshes=new Map();for(const f of farmPlots)oldMeshes.set(f,f.mesh);
  _finishUpdateFarmPlots(dt);
  for(const [f,mesh] of oldMeshes)if(mesh&&f.mesh!==mesh)_finishDisposeFurnitureMesh(mesh,_finishFarmKeepGeos);
};

const _finishHarvestNearestCrop=harvestNearestCrop;
window.harvestNearestCrop=function(){
  let nearest=null,nd=2.3;
  for(const f of farmPlots){if(f.stage<2)continue;const dx=f.x+.5-P.x,dz=f.z+.5-P.z,dy=f.y+.3-(P.y+.8);const d=Math.hypot(dx,dy,dz);if(d<nd){nd=d;nearest=f;}}
  const mesh=nearest&&nearest.mesh;
  _finishHarvestNearestCrop();
  if(mesh&&!farmPlots.some(f=>f.mesh===mesh))_finishDisposeFurnitureMesh(mesh,_finishFarmKeepGeos);
};
