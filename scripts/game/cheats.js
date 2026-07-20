// ============================================================================
// jokura / cheats.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、他モジュールの後（最後）に読み込まれ、同一のグローバルスコープを
// 共有する。ポーズメニューの「🐞 CHEATS」から開くボタン式チートパネルを提供する。
// マイクラのコマンド（/give・/tp・/time など）に相当する機能を、スマホでも押しやすい
// ボタンで実行できるようにしたもの。チートを使ったランはランキングに記録されない
// （saveScore が cheatsUsed を見てスキップする）。
// ============================================================================

const $cheatPanel=document.getElementById('cheatPanel');
const $cheatBody=document.getElementById('cheatBody');
const $cheatBtn=document.getElementById('cheatBtn');
const $cheatCloseBtn=document.getElementById('cheatCloseBtn');

function markCheat(){cheatsUsed=true;}
// インベントリ素材を付与（存在するキーのみ）
function _giveInv(k,n){if(k in inv)inv[k]+=n;}
// 指定タイプの敵をプレイヤーの近くに召喚
function _cheatSpawnEnemy(etIdx,yoff){
  const et=ENEMY_TYPES[etIdx];if(!et)return;
  const angle=Math.random()*Math.PI*2,dist=6+Math.random()*4;
  const sx=P.x+Math.cos(angle)*dist,sz=P.z+Math.sin(angle)*dist;
  const h=getHeight(Math.floor(sx),Math.floor(sz));
  const mat=makeMat(et.color,et.emissive,et.emissiveIntensity||.15,.6);
  const built=et.builder(mat);
  built.root.position.set(sx,h+(yoff!=null?yoff:1.85),sz);markShadowCaster(built.root);scene.add(built.root);
  const mhp=et.hp+Math.floor(gs.wave*.7);
  enemies.push({root:built.root,body:built.body,head:built.head,hpBar:built.hpBar,hp:mhp,maxHp:mhp,type:et,velY:0,onGround:false,atkCd:0,stuckT:0,lastX:sx,lastZ:sz,flashMeshes:[built.body,built.head],dead:false,breakCd:0,lWing:built.lWing,rWing:built.rWing});
}

// セクション定義: [ラベル, 実行関数]。実行後は共通で HUD 更新＋markCheat＋パネル再描画。
const CHEAT_SECTIONS=[
  {title:'🥚 モブ召喚',creativeOnly:true,btns:[
    ['🐷 ブタ',()=>spawnCreativeMob(CREATIVE_MOBS[0])],
    ['🐑 ヒツジ',()=>spawnCreativeMob(CREATIVE_MOBS[1])],
    ['🐔 ニワトリ',()=>spawnCreativeMob(CREATIVE_MOBS[2])],
    ['🐺 オオカミ',()=>spawnCreativeMob(CREATIVE_MOBS[3])],
    ['🐴 ウマ',()=>spawnCreativeMob(CREATIVE_MOBS[4])],
    ['🧹 モブを全消去',clearCreativeMobs],
  ]},
  {title:'🎁 アイテム',btns:[
    ['🪵🪨 基本×64',()=>{_giveInv('wood',64);_giveInv('stone',64);_giveInv('sand',64);_giveInv('grass',64);showBonus('🎁 基本素材×64');}],
    ['💎 ダイヤ×16',()=>{_giveInv('diamond',16);showBonus('🎁 💎×16');}],
    ['💠 コア×4',()=>{_giveInv('dragonCore',4);showBonus('🎁 💠×4');}],
    ['🏹 矢×64',()=>{_giveInv('arrow',64);showBonus('🎁 🏹×64');}],
    ['🔥🧊 特殊矢×16',()=>{_giveInv('fireArrow',16);_giveInv('iceArrow',16);showBonus('🎁 火矢/氷矢×16');}],
    ['🔩 鉄×16',()=>{_giveInv('ironOre',16);_giveInv('ironIngot',16);showBonus('🎁 鉄×16');}],
    ['🧊⬛🔮 素材×16',()=>{['ice','obsidian','crystal','cactus','mushroom','clay'].forEach(k=>_giveInv(k,16));showBonus('🎁 バイオーム素材×16');}],
    ['🪟🧶 建材×64',()=>{_giveInv('glass',64);_giveInv('woolBlock',64);showBonus('🎁 建材×64');}],
    ['🔥⬜🪜 設置×32',()=>{_giveInv('torch',32);_giveInv('slab',32);_giveInv('stair',32);_giveInv('brick',32);showBonus('🎁 設置ブロック×32');}],
    ['🥩🍖 食料×16',()=>{meat+=16;inv.steak=(inv.steak||0)+16;showBonus('🎁 肉/ステーキ×16');}],
    ['🌾🌱🧶 農×16',()=>{_giveInv('seed',16);_giveInv('wheat',16);_giveInv('wool',16);showBonus('🎁 農業素材×16');}],
    ['📦🛏🔥⚒ 家具×3',()=>{chestCount+=3;bedCount+=3;furnaceCount+=3;enchTableCount+=3;updateChestHUD();updateBedHUD();updateFurnaceHUD();updateEnchTableHUD();showBonus('🎁 家具×3');}],
  ]},
  {title:'⚔ 装備・強化',btns:[
    ['⚔ 全武器解放',()=>{for(let i=0;i<unlockedWeapons.length;i++)unlockedWeapons[i]=true;showBonus('⚔ 全武器解放');}],
    ['💎 ダイヤ装備一式',()=>{applyDiamondSword();applyDiamondBow();applyDiamondStaff();applyDiamondHammer();showAlert('💎 ダイヤ装備一式');}],
    ['🔩 鉄の剣',()=>{applyIronSword();showBonus('🔩 鉄の剣');}],
    ['🛡 ダイヤの鎧',()=>{equipArmor(2);}],
    ['✨ エンチャントMAX',()=>{enchants.atk=3;enchants.rng=3;enchants.fire=true;enchants.frost=true;showAlert('✨ エンチャントMAX');}],
  ]},
  {title:'❤ プレイヤー',btns:[
    ['❤ HP・満腹MAX',()=>{P.hp=P.maxHp;P.food=100;showBonus('❤ 全回復');}],
    [()=>'🛡 無敵: '+(godMode?'ON':'OFF'),()=>{godMode=!godMode;showAlert('🛡 無敵 '+(godMode?'ON':'OFF'));}],
    ['⭐ SCORE+10000',()=>{gs.score+=10000;showBonus('⭐ SCORE +10000');}],
  ]},
  {title:'🕐 時間・天気',btns:[
    ['☀ 昼にする',()=>{gs.time=0.15;showBonus('☀ 昼');}],
    ['🌙 夜にする',()=>{gs.time=0.6;showBonus('🌙 夜');}],
    ['🌤 晴れ',()=>{setWeather(0);showBonus('🌤 晴れ');}],
    ['🌧 雨',()=>{setWeather(1);showBonus('🌧 雨');}],
    ['⛈ 雷雨',()=>{setWeather(2);showBonus('⛈ 雷雨');}],
    ['🌕 満月の夜',()=>{gs.time=0.6;fullMoonNight=true;showAlert('🌕 満月の夜！');}],
  ]},
  {title:'🌊 WAVE・敵',btns:[
    ['⏩ 次のWAVEへ',()=>{gs.nextWave=0.05;showBonus('⏩ 次のWAVE');}],
    ['🧟 雑魚×5',()=>{for(let i=0;i<5;i++)spawnEnemy();showBonus('🧟 敵×5召喚');}],
    ['💣 クリーパー',()=>{_cheatSpawnEnemy(ET_CREEPER);showBonus('💣 クリーパー召喚');}],
    ['🕷 クモ',()=>{_cheatSpawnEnemy(ET_SPIDER);showBonus('🕷 クモ召喚');}],
    ['👻 ファントム',()=>{_cheatSpawnEnemy(ET_PHANTOM,4.5);showBonus('👻 ファントム召喚');}],
    ['👑 ボス召喚',()=>{if(boss){showBonus('既にボスがいる');return;}const d=BOSS_DEFS.find(b=>!b.miniBoss&&!b.finalBoss)||BOSS_DEFS[0];spawnBoss(d);}],
    ['💎 最終ボス召喚',()=>{if(boss){showBonus('既にボスがいる');return;}const d=BOSS_DEFS.find(b=>b.finalBoss);if(d)spawnBoss(d);}],
  ]},
  {title:'🎲 イベント・移動',btns:[
    ['🧙 行商人を呼ぶ',()=>{removeMerchant();spawnMerchant();showBonus('🧙 行商人');}],
    ['☄ 隕石',()=>{maybeSpawnMeteor();}],
    ['🏗 特殊生成',()=>{closeCheatPanel();openStructPanel();}],
    ['⬆ 地上へ',()=>{const sh=getHeight(Math.floor(P.x),Math.floor(P.z));P.y=sh+2;P.velY=0;P.onGround=false;showBonus('⬆ 地上へ');}],
    ['🏠 原点(0,0)へ',()=>{P.x=0;P.z=0;const sh=getHeight(0,0);P.y=sh+2;P.velY=0;P.onGround=false;updateChunks(true);showBonus('🏠 原点へ');}],
    ['☁ 天空都市へ',()=>{const C=collapsingSkyCity;if(!C){showBonus('天空都市は未生成');return;}P.x=C.cx;P.z=C.cz;P.y=C.baseY+2;P.velY=0;P.onGround=false;P.flying=isCreative();updateChunks(true);applyWorldEdits();showBonus('☁ 天空都市の中央広場へ');}],
    ['⚙ 天空動力炉へ',()=>{const C=collapsingSkyCity;if(!C){showBonus('天空都市は未生成');return;}P.x=C.reactor.x+2.8;P.z=C.reactor.z+.5;P.y=C.reactor.y+2;P.velY=0;P.onGround=false;P.flying=isCreative();updateChunks(true);applyWorldEdits();showBonus(C.activated?'⚙ 稼働中の天空動力炉へ':'⚙ 動力炉に接触すると再起動');}],
  ]},
];

function buildCheatPanel(){
  if(!$cheatBody)return;
  $cheatBody.innerHTML='';
  for(const sec of CHEAT_SECTIONS){
    if(sec.creativeOnly&&!isCreative())continue;
    const hd=document.createElement('div');hd.className='cheatHd';hd.textContent=sec.title;$cheatBody.appendChild(hd);
    const grid=document.createElement('div');grid.className='cheatGrid';
    for(const[label,act] of sec.btns){
      const b=document.createElement('button');b.className='cheatBtn';b.textContent=(typeof label==='function')?label():label;
      b.addEventListener('pointerdown',(e)=>{
        // preventDefault はここでは呼ばない: パネル内はボタンがほぼ全面を占めるため、
        // 呼ぶとボタン上から始めた縦スワイプのスクロールジェスチャーごと潰れてしまう
        // (craftPanel の .citem と同じ理由で stopPropagation のみに留める)
        e.stopPropagation();
        if(!gs.running)return;
        initAudio();
        act();
        markCheat();
        updateInvHUD();updateMeatHUD();updateArmorHUD();updateHUD();
        playTone(760,.06,.06,'square');
        buildCheatPanel(); // 無敵ON/OFFなどラベルを最新化
      });
      grid.appendChild(b);
    }
    $cheatBody.appendChild(grid);
  }
}
function openCheatPanel(){if(!gs.running)return;buildCheatPanel();setPanel($cheatPanel,true);}
function closeCheatPanel(){setPanel($cheatPanel,false);}
if($cheatBtn)bindTapSafe($cheatBtn,openCheatPanel);
if($cheatCloseBtn)bindTapSafe($cheatCloseBtn,closeCheatPanel);

const _continueGameRestoreSavedPose=continueGame;
// 意図的な関数差し替え（ロード後に保存時の座標・視点を復元するラッパー）
// eslint-disable-next-line no-func-assign
continueGame=async function(){
  const d=await loadSaveData();
  if(!d)return;
  await _continueGameRestoreSavedPose();
  P.x=d.px??0;
  P.z=d.pz??0;
  P.y=d.py??20;
  yaw=d.yaw??0;
  pitch=d.pitch??0;
  camera.position.set(P.x,P.y+EYE+(mounted?MOUNT_EYE:0),P.z);
  camera.rotation.x=pitch;
  camera.rotation.y=yaw;
};
