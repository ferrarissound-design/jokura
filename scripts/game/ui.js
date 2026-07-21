// ============================================================================
// jokura / ui.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、下記の順序で <script> として読み込まれ、すべて同一のグローバル
// スコープを共有する（元は単一の boot() 関数だったため、この順序と共有スコープが前提）。
// 読み込み順: state → achievements → crafting → save → ui → audio → world →
//             combat → entities → hud → input → main
// ============================================================================

// ═══ HELP / SETTINGS ═══
const SETTINGS_KEY='jokura-settings-v1';
// difficulty: player-damage multiplier; lookSens: touch look multiplier; flash: hit/lava screen flashes; autoSave: periodic save
const settings={bgmMuted:false,sfxMuted:false,difficulty:'normal',lookSens:1,flash:true,autoSave:true,shadows:null,bob:true,gameMode:'survival',skyQuality:'auto',showCoords:false,tntRadius:5,tntBlockDamage:true,tntEntityDamage:true,tntPlayerDamage:true,tntPlayerKnockback:true,tntItemDrops:false,tntScreenShake:true,tntChain:true,tntPreview:true,tntFriendlyFire:false,tntEffectQuality:'auto'};
const SKY_QUALITIES=['auto','low','medium','high'];
const DIFF_MULT={easy:.6,normal:1,hard:1.5};
function difficultyMult(){return DIFF_MULT[settings.difficulty]||1;}
async function loadSettings(){
  try{const r=await window.storage.get(SETTINGS_KEY);const saved=JSON.parse((r&&r.value)||'{}');Object.assign(settings,saved);}catch(e){}
  if(!(settings.difficulty in DIFF_MULT))settings.difficulty='normal';
  settings.lookSens=Math.max(.4,Math.min(2,Number(settings.lookSens)||1));
  if(typeof settings.shadows!=='boolean')settings.shadows=!isTouch; // shadows default: PC on, mobile off
  if(typeof settings.bob!=='boolean')settings.bob=true;
  if(SKY_QUALITIES.indexOf(settings.skyQuality)<0)settings.skyQuality='auto';
  settings.tntRadius=Math.max(2,Math.min(isTouch?12:16,Number(settings.tntRadius)||5));
  if(!['auto','low','high'].includes(settings.tntEffectQuality))settings.tntEffectQuality='auto';
  // LS initialises from settings.lookSens at its own declaration; don't touch it here (TDZ)
}
function applyAccessibility(){try{LS=LS_BASE*settings.lookSens;}catch(e){}}
async function saveSettings(){try{await window.storage.set(SETTINGS_KEY,JSON.stringify(settings));}catch(e){}}
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
const $skyQualityBtn=document.getElementById('skyQualityBtn');
const $coordsToggleBtn=document.getElementById('coordsToggleBtn');
const $tntRadiusBtn=document.getElementById('tntRadiusBtn'),$tntDestroyBtn=document.getElementById('tntDestroyBtn'),$tntEntityDamageBtn=document.getElementById('tntEntityDamageBtn'),$tntPlayerDamageBtn=document.getElementById('tntPlayerDamageBtn'),$tntDropsBtn=document.getElementById('tntDropsBtn'),$tntShakeBtn=document.getElementById('tntShakeBtn'),$tntChainBtn=document.getElementById('tntChainBtn'),$tntPreviewBtn=document.getElementById('tntPreviewBtn'),$tntQualityBtn=document.getElementById('tntQualityBtn');
function applyCoordsSetting(){const el=document.getElementById('coordsDisplay');if(el)el.style.display=settings.showCoords?'':'none';}
function toggleCoords(){settings.showCoords=!settings.showCoords;saveSettings();updateSettingsUI();applyCoordsSetting();showSaveToast(settings.showCoords?'座標表示 ON':'座標表示 OFF');}
const SKY_QUALITY_LABEL={auto:'AUTO',low:'LOW',medium:'MID',high:'HIGH'};
function updateSettingsUI(){
  if($bgmToggleBtn){$bgmToggleBtn.textContent='BGM: '+(settings.bgmMuted?'OFF':'ON');$bgmToggleBtn.classList.toggle('on',!settings.bgmMuted);$bgmToggleBtn.classList.toggle('off',settings.bgmMuted);}
  if($sfxToggleBtn){$sfxToggleBtn.textContent='SE: '+(settings.sfxMuted?'OFF':'ON');$sfxToggleBtn.classList.toggle('on',!settings.sfxMuted);$sfxToggleBtn.classList.toggle('off',settings.sfxMuted);}
  for(const k in $diffBtns){if($diffBtns[k])$diffBtns[k].classList.toggle('sel',settings.difficulty===k);}
  const si=SENS_VALS.indexOf(SENS_VALS.reduce((a,b)=>Math.abs(b-settings.lookSens)<Math.abs(a-settings.lookSens)?b:a,1));
  $sensBtns.forEach((b,i)=>{if(b)b.classList.toggle('sel',i===si);});
  if($flashToggleBtn){$flashToggleBtn.textContent='画面フラッシュ: '+(settings.flash?'ON':'OFF');$flashToggleBtn.classList.toggle('on',settings.flash);$flashToggleBtn.classList.toggle('off',!settings.flash);}
  if($autoSaveToggleBtn){$autoSaveToggleBtn.textContent='オートセーブ: '+(settings.autoSave?'ON':'OFF');$autoSaveToggleBtn.classList.toggle('on',settings.autoSave);$autoSaveToggleBtn.classList.toggle('off',!settings.autoSave);}
  if($shadowToggleBtn){$shadowToggleBtn.textContent='影(シャドウ): '+(settings.shadows?'ON':'OFF');$shadowToggleBtn.classList.toggle('on',!!settings.shadows);$shadowToggleBtn.classList.toggle('off',!settings.shadows);}
  if($skyQualityBtn){$skyQualityBtn.textContent='空の品質: '+(SKY_QUALITY_LABEL[settings.skyQuality]||'AUTO');$skyQualityBtn.classList.add('on');}
  if($bobToggleBtn){$bobToggleBtn.textContent='画面の揺れ: '+(settings.bob?'ON':'OFF');$bobToggleBtn.classList.toggle('on',!!settings.bob);$bobToggleBtn.classList.toggle('off',!settings.bob);}
  if($coordsToggleBtn){$coordsToggleBtn.textContent='座標表示: '+(settings.showCoords?'ON':'OFF');$coordsToggleBtn.classList.toggle('on',!!settings.showCoords);$coordsToggleBtn.classList.toggle('off',!settings.showCoords);}
  const tntToggle=(el,label,on)=>{if(!el)return;el.textContent=label+': '+(on?'ON':'OFF');el.classList.toggle('on',!!on);el.classList.toggle('off',!on);};
  if($tntRadiusBtn){$tntRadiusBtn.textContent='爆発半径: '+settings.tntRadius;$tntRadiusBtn.classList.add('on');}
  tntToggle($tntDestroyBtn,'ブロック破壊',settings.tntBlockDamage);tntToggle($tntEntityDamageBtn,'エンティティダメージ',settings.tntEntityDamage);tntToggle($tntPlayerDamageBtn,'プレイヤーダメージ',settings.tntPlayerDamage);tntToggle($tntDropsBtn,'アイテムドロップ',settings.tntItemDrops);tntToggle($tntShakeBtn,'画面揺れ',settings.tntScreenShake);tntToggle($tntChainBtn,'連鎖爆発',settings.tntChain);tntToggle($tntPreviewBtn,'爆破範囲表示',settings.tntPreview);
  if($tntQualityBtn){$tntQualityBtn.textContent='爆発演出: '+String(settings.tntEffectQuality||'auto').toUpperCase();$tntQualityBtn.classList.add('on');}
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
function _toggleTNTSetting(key){settings[key]=!settings[key];saveSettings();updateSettingsUI();}
function cycleTNTRadius(){const vals=isTouch?[3,4,5,6,8,10,12]:[3,4,5,6,8,10,12,16],i=vals.indexOf(settings.tntRadius);settings.tntRadius=vals[(i+1)%vals.length];saveSettings();updateSettingsUI();}
function cycleTNTEffectQuality(){const vals=['auto','low','high'],i=vals.indexOf(settings.tntEffectQuality);settings.tntEffectQuality=vals[(i+1)%vals.length];saveSettings();updateSettingsUI();}
function cycleSkyQuality(){
  const i=SKY_QUALITIES.indexOf(settings.skyQuality);
  settings.skyQuality=SKY_QUALITIES[(i+1)%SKY_QUALITIES.length];
  saveSettings();updateSettingsUI();
  try{if(typeof skySystem!=='undefined')skySystem.setQuality(settings.skyQuality);}catch(e){}
  showSaveToast('空の品質: '+(SKY_QUALITY_LABEL[settings.skyQuality]||'AUTO'));
}
loadSettings().then(()=>{updateSettingsUI();updateModeBtn();applyCoordsSetting();});
// ─── MODE SELECT (title screen): NEW GAME starts in the selected mode ───
if(settings.gameMode!=='creative')settings.gameMode='survival';
const $modeBtn=document.getElementById('modeBtn');
function updateModeBtn(){if($modeBtn)$modeBtn.textContent=settings.gameMode==='creative'?'🎮 MODE: 🪄 CREATIVE':'🎮 MODE: ⚔ SURVIVAL';}
function toggleModeSelect(){
  settings.gameMode=settings.gameMode==='creative'?'survival':'creative';
  saveSettings();updateModeBtn();
  showSaveToast(settings.gameMode==='creative'?'🪄 クリエイティブモード':'⚔ サバイバルモード');
  playTone(settings.gameMode==='creative'?1000:600,.08,.08,'sine');
}
updateModeBtn();
if($modeBtn)bindTapSafe($modeBtn,toggleModeSelect);
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
if($skyQualityBtn)bindTapSafe($skyQualityBtn,cycleSkyQuality);
if($coordsToggleBtn)bindTapSafe($coordsToggleBtn,toggleCoords);
if($tntRadiusBtn)bindTapSafe($tntRadiusBtn,cycleTNTRadius);
if($tntDestroyBtn)bindTapSafe($tntDestroyBtn,()=>_toggleTNTSetting('tntBlockDamage'));
if($tntEntityDamageBtn)bindTapSafe($tntEntityDamageBtn,()=>_toggleTNTSetting('tntEntityDamage'));
if($tntPlayerDamageBtn)bindTapSafe($tntPlayerDamageBtn,()=>_toggleTNTSetting('tntPlayerDamage'));
if($tntDropsBtn)bindTapSafe($tntDropsBtn,()=>_toggleTNTSetting('tntItemDrops'));
if($tntShakeBtn)bindTapSafe($tntShakeBtn,()=>_toggleTNTSetting('tntScreenShake'));
if($tntChainBtn)bindTapSafe($tntChainBtn,()=>_toggleTNTSetting('tntChain'));
if($tntPreviewBtn)bindTapSafe($tntPreviewBtn,()=>_toggleTNTSetting('tntPreview'));
if($tntQualityBtn)bindTapSafe($tntQualityBtn,cycleTNTEffectQuality);
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
// ─── GUIDE / QUEST LOG ───
const $questPanel=document.getElementById('questPanel'),$questBody=document.getElementById('questBody');
const $questBtn=document.getElementById('questBtn'),$questCloseBtn=document.getElementById('questCloseBtn');
const $codexPanel=document.getElementById('codexPanel'),$codexBody=document.getElementById('codexBody');
const $codexCloseBtn=document.getElementById('codexCloseBtn'),$codexBtn=document.getElementById('codexBtn'),$pauseCodexBtn=document.getElementById('pauseCodexBtn');
function isBaseReady(){return (typeof bedCount!=='undefined'&&bedCount>0)||(beds&&beds.length>0)||(typeof chestCount!=='undefined'&&chestCount>0)||(chests&&chests.length>0);}
function recipeStatusText(r){
  if(r.wi>=0&&unlockedWeapons[r.wi])return '作成済み';
  if(r.wi===-6&&hasDiamondSword)return '作成済み';
  if(r.wi===-7&&hasDiamondBow)return '作成済み';
  if(r.wi===-8&&hasDiamondStaff)return '作成済み';
  if(r.wi===-10&&hasDiamondHammer)return '作成済み';
  if(r.wi===-26&&(hasIronSword||hasDiamondSword))return '作成済み';
  if(r.wi===-9&&trophyCount>0)return '作成済み×'+trophyCount;
  if(r.armorTier!=null&&armor&&armor.tier===r.armorTier)return '装備中 耐久'+armorPct()+'%';
  if(r.req!=null&&!unlockedWeapons[r.req])return '要: '+WEAPONS[r.req].name;
  return canCraft(r)?'作成可能':'不足: '+(getMissingMaterialsText(r)||r.desc);
}
function renderQuestLog(){
  const gotDiamond=(inv.diamond>0)||hasDiamondSword||hasDiamondBow||hasDiamondStaff||hasDiamondHammer;
  const questGroups=[
    {title:'序盤の準備',items:[
      ['⚔ 剣をクラフト',unlockedWeapons[1],'現在の目標: '+getCurrentGoal()],
      ['🔨 ハンマーをクラフト',unlockedWeapons[2],'石を掘る速度と近接火力を確保'],
      ['🛏 ベッド/📦チェストで拠点準備',isBaseReady(),'夜スキップと素材保管で長期戦に備える'],
      ['🏹 弓をクラフト',unlockedWeapons[3],'空中やボス相手の安全な攻撃手段'],
      ['🛡 鎧をクラフト',!!achievements.firstArmor||!!armor,'敵の攻撃を軽減。防ぐたび耐久が減り0で壊れる（再クラフトで修理）'],
      ['🐑 羊の毛を刈る',!!achievements.firstShear,'倒さずにウールを収集できる。刈った羊の毛はしばらくすると生え変わる'],
      ['🌾 小麦を収穫',!!achievements.firstHarvest,'草から種を作って草ブロックの上に植え、育ったら収穫しよう'],
      ['🐴 ウマを手なずけて騎乗',!!achievements.firstMount,'🌾小麦×1で手なずけ、Xキー(PLACE長押し)で乗る。移動が速くなり段差も越えやすい']
    ]},
    {title:'地下探索とダイヤ装備',items:[
      ['🔶 鉄鉱石を入手',inv.ironOre>0||inv.ironIngot>0||hasIronSword||!!achievements.firstSmelt,'深さ13以降の地下に生成される'],
      ['🔥 かまどで鉄を精錬',!!achievements.firstSmelt,'🪨×12でかまどを作って設置し、鉄鉱石＋木(燃料)でインゴットに'],
      ['🍖 かまどでステーキを焼く',!!achievements.firstCook,'かまどで🥩肉を焼くと回復量アップ。砂を焼けば🪟ガラスも作れる'],
      ['🔩 鉄の剣・鉄の鎧を作成',hasIronSword||(armor&&armor.tier===3),'石とダイヤの間の中間装備。ダイヤまでのつなぎに'],
      ['💎 ダイヤを入手',gotDiamond,'深く掘るほど貴重素材と危険が増える'],
      ['💎 Diamond Swordを作成',hasDiamondSword,'WAVE中盤以降の主力武器'],
      ['🔮 Diamond Staff / Bow / Hammerを強化',hasDiamondStaff||hasDiamondBow||hasDiamondHammer,'戦い方に合わせてダイヤ装備を追加'],
      ['⚒ 強化台で武器をエンチャント',!!achievements.firstEnchant,'余った💎や💠で攻撃+1/射程+15%/🔥炎上/❄氷結を付与'],
      ['🌍 バイオーム固有素材をコンプリート',!!achievements.biomeCollector,'🧊氷(雪原)・⬛黒曜石(火山)・🔮水晶(岩山)・🌵サボテン(砂漠)・🍄キノコ(森林)・🟤粘土(草原)'],
      ['🗝 地上構造物の宝箱を開ける',!!achievements.structureRaider,'🏠小屋・🏜ピラミッド・❄イグルー・🌲遺跡を探索。ピラミッドの宝は中心に埋まっている'],
      ['🗺 宝の地図の宝を発見',!!achievements.mapMaster,'地下祭壇の宝箱から入手した地図のコンパスを辿ろう']
    ]},
    {title:'WAVE進行',items:[
      ['🌊 WAVE5に到達',gs.wave>=5,'スケルトンキングが出現'],
      ['🌊 WAVE10に到達',gs.wave>=10,'炎のゴーレムが出現'],
      ['🌊 WAVE15に到達',gs.wave>=15,'ダークアイが出現'],
      ['🌊 WAVE20に到達',gs.wave>=20,'最終決戦: 地上でキングドラゴンを迎え撃つ'],
      ['🏆 キングダイヤモンドドラゴン撃破',!!achievements.dragonSlayer,'ゲームクリア実績'],
      ['♾ エンドレスモードに挑戦',endlessMode||!!achievements.endless25,'クリア後に選択可能。5WAVEごとにEXボス出現、難易度は無限に上昇']
    ]},
    {title:'ランダムイベント',items:[
      ['🧙 行商人と取引する',!!achievements.firstTrade,'一定間隔で近くに出現。Xキー(スマホはPLACE長押し)で話しかけて交易'],
      ['☄ 隕石の直撃を受けて生き延びる',!!achievements.meteorStruck,'警告の光柱が出たら離れよう。着弾地点にレア素材が降ってくる'],
      ['🌕 満月の夜を生き延びる',!!achievements.fullMoonSurvivor,'夜が来るとまれに発生。敵が増えるがキルスコアも2倍に']
    ]}
  ];
  let h='<div class="codexSection"><div class="codexHd">🎯 現在の目標</div><div class="codexGoal">'+getCurrentGoal()+'</div></div>';
  const done=v=>v?'✅':'⬜';
  for(const group of questGroups){
    h+='<div class="codexSection"><div class="codexHd">📋 '+group.title+'</div>';
    for(const [name,ok,note] of group.items)h+='<div class="questItem'+(ok?' done':'')+'">'+done(ok)+' '+name+'</div><div class="codexNote">'+note+'</div>';
    h+='</div>';
  }
  return h;
}
function renderBiomeDiscoveryGuide(){
  if(typeof BIOME_DEFS==='undefined'||typeof discoveredBiomes==='undefined')return '';
  const ids=Object.keys(BIOME_DEFS).map(Number).sort((a,b)=>a-b),found=ids.filter(id=>discoveredBiomes[id]).length;
  let h='<div class="codexSection"><div class="codexHd">🧭 バイオーム図鑑 '+found+'/'+ids.length+'</div>';
  for(const id of ids){
    const def=BIOME_DEFS[id],ok=!!discoveredBiomes[id];
    const terrain=ok?'地表: '+def.surface+' / 地中: '+def.subsurface+' / 水面: '+(def.waterLevel==null?'なし':def.waterLevel):'未発見のため詳細不明';
    const hooks=ok?'植生: '+(def.vegetation||[]).join(', ')+' / 構造: '+(def.structures||[]).join(', '):'探索して発見しよう';
    h+='<div class="codexRow"><span>'+(ok?'✅ ':'⬛ ')+def.name+'</span><span class="codexCost">'+(ok?def.key:'???')+'</span></div><div class="codexNote">'+terrain+'<br>'+hooks+'</div>';
  }
  h+='</div>';
  return h;
}
function renderRecipeGuide(){
  let h='<div class="codexSection"><div class="codexHd">🛠 クラフト図鑑</div>';
  for(const r of CRAFT_RECIPES)h+='<div class="codexRow"><span>'+r.name+'</span><span class="codexCost">'+r.desc+' / '+recipeStatusText(r)+'</span></div>';
  h+='</div>';
  return h;
}
function renderWorldGuide(){
  const waveText=BOSS_DEFS.filter(b=>[5,10,15,20].includes(b.wave)).map(b=>'WAVE'+b.wave+': '+b.name+(b.finalBoss?'（最終ボス）':'')).join('<br>');
  return '<div class="codexSection"><div class="codexHd">🌍 バイオーム / 地下 / WAVE</div>'+
    '<div class="codexSub">バイオーム</div><div class="codexNote">🌿草原: 基本素材集め / 🏜砂漠: 砂と開けた地形 / 🌲森林: 木材集め / 🪨岩山: 石と鉱石向き / 🌋火山: 溶岩と強敵に注意 / ❄雪原: 寒冷ダメージに注意。</div>'+
    '<div class="codexSub">バイオーム固有素材</div><div class="codexNote">各バイオームの地表にそこでしか採れない素材が生成される。🧊氷(❄雪原・上を歩くと滑る・氷矢の素材) / ⬛黒曜石(🌋火山・超硬くて敵に壊されない・火矢の素材) / 🔮水晶(🪨岩山・射程強化に使用) / 🌵サボテン(🏜砂漠・ジュース) / 🍄キノコ(🌲森林・シチュー) / 🟤粘土(🌿草原・レンガ×4)。黒曜石を掘るには💎ダイヤハンマーが必要。</div>'+
    '<div class="codexSub">⚒ 武器強化（エンチャント）</div><div class="codexNote">🪨×15+💎×1で強化台をクラフトし、Xキー(スマホはPLACE長押し)で設置。近くでクラフトメニューを開くと強化メニューが現れる。⚔攻撃強化(💎・最大Lv3・全武器+1/Lv) / 🎯射程強化(💎+🔮・最大Lv3・+15%/Lv) / 🔥炎上付与(💠・近接ヒットで敵が燃える) / ❄氷結付与(💠+🧊・近接ヒットで敵が鈍足)。</div>'+
    '<div class="codexSub">🏹 火矢と氷矢</div><div class="codexNote">🪵×2+⬛黒曜石×1で🔥火矢×10、🪵×2+🧊氷×1で🧊氷矢×10をクラフト。Rキー(スマホは左のARROW表示タップ)で装填切替。火矢は命中した敵を炎上させ、氷矢は動きを遅くする。ボスにも有効。</div>'+
    '<div class="codexSub">♾ エンドレスモード</div><div class="codexNote">WAVE20のキングドラゴンを倒すと、クリア画面からそのままエンドレスモードへ突入できる。WAVEは無限に続き敵は強くなり続ける。5WAVEごとに歴代ボスの強化版（EXボス）が出現し、倒すと💎を落とす。ハイスコアはランキングに♾クリア済みとして記録される。</div>'+
    '<div class="codexSub">防具</div><div class="codexNote">鎧は敵の攻撃を軽減する（🛡木20% / 🛡石35% / 🔩鉄45% / 💎ダイヤ55%）。ダメージを防ぐたび耐久が減り、0で壊れる。再クラフトで修理・装備し直せる。溶岩・寒冷・空腹ダメージには無効。</div>'+
    '<div class="codexSub">🔥 精錬・調理（かまど）</div><div class="codexNote">地下の深さ13以降に🔶鉄鉱石が生成される。🪨×12でかまどをクラフトしてXキー(スマホはPLACE長押し)で設置し、近くでクラフトメニューを開くと「🔥精錬」「🍖調理」メニューが現れる。<b>精錬</b>: 鉄鉱石＋🪵木(燃料)で🔩鉄インゴット（🔩鉄の剣・鉄の鎧の素材）、🏖砂＋🪵木で🪟ガラス（半透明の建材）。<b>調理</b>: 🥩肉＋🪵木で🍖ステーキ。生肉より回復量が多く（満腹度+60/HP+25）、EATボタンで優先して食べる。</div>'+
    '<div class="codexSub">🪟 建築ブロック</div><div class="codexNote">🪟ガラス（かまどで砂を焼く・半透明で明かりを通す）と🧶ウールブロック（🧶ウール×2→×4でクラフト・柔らかな建材）は、ホットバーの9・0番スロット（スマホはタップ）で選んで設置する。クリエイティブモードでは無限に使える。</div>'+
    '<div class="codexSub">🌦 天気</div><div class="codexNote">🌧雨・⛈雷雨は見た目だけでなく戦況に影響する。屋外で雨に濡れていると🔥炎上(DoT)の消化が早まる。❄雪原で⛈雷雨が重なると吹雪になり、移動速度が低下し満腹度の消費が増え、寒冷ダメージの間隔も短くなる。⛈雷雨では白い光の柱が現れたら数秒後に落雷する予告。範囲内にいるとプレイヤー・敵・ボスいずれもダメージを受けるので、柱を見たら離れよう。</div>'+
    '<div class="codexSub">動物・牧畜</div><div class="codexNote">🐷豚: 倒すと🥩肉 / 🐑羊: Xキーで刈ると倒さず🧶ウールが手に入り、しばらくすると毛が生え変わる。倒すと肉とウールの両方 / 🐔鶏: 時々🥚卵を産み落とす。歩いて拾うと満腹度が回復。倒すと肉。</div>'+
    '<div class="codexSub">🐺 相棒（ペット）</div><div class="codexNote">野生のオオカミは🥩肉を持っていると寄ってくる。近づいてXキー(スマホはPLACE長押し)で肉を1つあげると手なずけられ、相棒として付いてきて敵と戦ってくれる。HPが0になっても倒れるだけで、時間経過か肉をあげると復活。肉をあげればHP回復もできる。</div>'+
    '<div class="codexSub">🐴 騎乗（マウント）</div><div class="codexNote">草原などに野生のウマが群れている。🌾小麦を持っていると寄ってきて、近くでXキー(スマホはPLACE長押し)で小麦×1をあげると手なずけられる（サドル付きに）。もう一度Xで騎乗！移動速度が大幅に上がり、ジャンプで2ブロックの段差も越えられる。ダッシュしても追加の満腹度を消費しない（走るのはウマ）。降りるのもX。降りている間はオオカミのように付いてくる。</div>'+
    '<div class="codexSub">農業</div><div class="codexNote">🌿草×3で🌱種をクラフトし、草ブロックの上を見てXキーで植える。時間とともに育ち、成熟したらXキーで収穫（🌾小麦＋時々🌱種）。🌾小麦×4で🍞パンを作ると満腹度とHPを回復できる。</div>'+
    '<div class="codexSub">地下</div><div class="codexNote">深く掘るとダイヤ、古い宝箱、地下ドラゴンに遭遇する。危険なら階段やブロックで地上へ戻ろう。</div>'+
    '<div class="codexSub">🕷 地上の新たな敵</div><div class="codexNote">WAVEが進むと通常の敵に加えて新顔が混ざる。💣<b>クリーパー</b>(WAVE4〜): 近づくと点火音とともに白く点滅・膨張し、約1秒後に爆発してブロックごと吹き飛ばす(⬛黒曜石は壊れない)。点火中は動かないので走って離れるか、近づかれる前に弓で仕留めよう。🕷<b>クモ</b>(WAVE3〜): 素早く、壁をよじ登ってくるので高い壁だけでは拠点を守れない。👻<b>ファントム</b>(WAVE6〜の夜・満月の夜): 夜空から急降下してくる飛行敵。朝日を浴びると燃えて消滅する。</div>'+
    '<div class="codexSub">☄ ランダムイベント</div><div class="codexNote">プレイ中にまれに発生する環境イベント。🧙<b>行商人</b>: 一定間隔で近くに出現し、Xキー(スマホはPLACE長押し)で話しかけると交易パネルが開く。余った木材・石材などをダイヤや鉄インゴットなどのレア素材と交換できる（在庫は出現ごとにリセット）。放っておくとしばらくして立ち去る。☄<b>隕石落下</b>: 地上にいると警告の光柱が出現し、数秒後に着弾する。直撃を受けるとダメージを受けるが、着弾地点には浅いクレーターができ、鉄鉱石やダイヤなどのレア素材が降ってくる。🌕<b>満月の夜</b>: 夜が始まる瞬間にまれに発生。敵の出現数が増えるが、キルスコアが2倍になりドロップ率も上がる。夜明けまで生き延びよう。</div>'+
    '<div class="codexSub">🗺 地上構造物と宝の地図</div><div class="codexNote">世界の各地にバイオーム固有の構造物が生成される。🏜砂漠のピラミッド（宝は中心に埋まっているので掘り進もう） / ❄雪原のイグルー / 🏠森・🌿草原の小屋 / 🌲森・🌿草原の遺跡。中心には🗝金の宝箱があり、💎ダイヤ・🔩鉄インゴット・🏹矢など豪華な報酬が入っている。地下祭壇の宝箱からは時々🗺宝の地図が手に入り、所持中は画面上部のコンパスが最寄りの構造物の宝を指し示す。矢印を頼りに遠征し、目標の宝箱を開けると特大ボーナス！</div>'+
    '<div class="codexSub">重要WAVE</div><div class="codexNote">'+waveText+'</div></div>';
}
function renderCodex(){
  const body=renderQuestLog()+renderBiomeDiscoveryGuide()+renderRecipeGuide()+renderWorldGuide()+'<div class="codexSection"><div class="codexHd">🏅 実績ヒント</div>';
  let h=body;
  for(const def of Object.values(ACHIEVEMENT_DEFS))h+='<div class="codexRow"><span>'+def.title+'</span><span class="codexCost">'+def.desc+'</span></div>';
  h+='</div>';
  if($codexBody)$codexBody.innerHTML=h;
  if($questBody)$questBody.innerHTML=renderQuestLog()+renderBiomeDiscoveryGuide()+renderRecipeGuide()+renderWorldGuide();
}
function openCodex(){renderCodex();setPanel($codexPanel,true);}
function closeCodex(){setPanel($codexPanel,false);}
function openQuest(){renderCodex();setPanel($questPanel,true);}
function closeQuest(){setPanel($questPanel,false);}
if($codexBtn)bindTapSafe($codexBtn,openCodex);
if($pauseCodexBtn)bindTapSafe($pauseCodexBtn,openCodex);
if($codexCloseBtn)bindTapSafe($codexCloseBtn,closeCodex);
if($questBtn)bindTapSafe($questBtn,openQuest);
if($questCloseBtn)bindTapSafe($questCloseBtn,closeQuest);

// village NPC panel uses the same menu-panel behavior as the miner/merchant UI.
const $villagerCloseBtn=document.getElementById('villagerCloseBtn');
if($villagerCloseBtn)bindTapSafe($villagerCloseBtn,()=>{if(typeof closeVillagerUI==='function')closeVillagerUI();});
