// ============================================================================
// jokura / state.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、下記の順序で <script> として読み込まれ、すべて同一のグローバル
// スコープを共有する（元は単一の boot() 関数だったため、この順序と共有スコープが前提）。
// 読み込み順: state → achievements → crafting → save → ui → audio → world →
//             combat → entities → hud → input → main
// ============================================================================


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
const inv={wood:0,stone:0,sand:0,grass:0,brick:0,arrow:0,fireArrow:0,iceArrow:0,diamond:0,dragonCore:0,dungeonKey:0,torch:0,slab:0,stair:0,tnt:0,seed:0,wheat:0,wool:0,ice:0,obsidian:0,crystal:0,cactus:0,mushroom:0,clay:0,ironOre:0,ironIngot:0,glass:0,woolBlock:0,steak:0,crustBomb:0,tsarBomba:0,longinus:0,judgmentCore:0,railgun:0};
// 弓に装填する矢の種類: 'normal' | 'fire'(炎上) | 'ice'(鈍足)
let arrowMode='normal';

// ═══ ARMOR ═══
// 鎧は敵の攻撃ダメージを cut 分軽減し、防いだ量だけ耐久(dur)が減る。0で壊れる。
// 溶岩・寒冷・空腹ダメージには無効。再クラフトで修理・装備し直せる。
const ARMOR_DEFS=[
  {name:'🛡 木の鎧',   cut:.20,maxDur:60, hudColor:'#d8b07a'},
  {name:'🛡 石の鎧',   cut:.35,maxDur:120,hudColor:'#c2cad6'},
  {name:'💎 ダイヤの鎧',cut:.55,maxDur:250,hudColor:'#7fe9ff'},
  // tier 3 = 鉄。表示順はレシピ側で制御するため、セーブ互換のため末尾に追加
  {name:'🔩 鉄の鎧',   cut:.45,maxDur:180,hudColor:'#dfe4ee'},
];
let armor=null; // {tier,dur} 装備中の鎧（null=未装備）

// ═══ 宝の地図（地上構造物への案内） ═══
// 地下祭壇の宝箱から入手することがある。所持中はコンパスHUDが最寄りの
// 未開封の地上構造物（ピラミッド/イグルー/遺跡）の宝箱を指し示す。
// 目標の宝箱を開けると大報酬とともに消費される。null=未所持。
let treasureMap=null; // {wx,wz,key,type} 目標構造物の中心座標と宝箱voxelキー

// ═══ 🌕 満月の夜（ランダムイベント） ═══
// 夜が始まる瞬間に確率で発生。発生中は敵が追加で湧き、キル時のスコアが2倍になる。
// 夜明けまで生き延びると実績。セーブはせず、夜ごとに再抽選される。
let fullMoonNight=false;

// ═══ 🧙 行商人の交易品（ランダムイベント） ═══
// 一定間隔でワールドに出現する行商人が提示する交換レート。stockは出現ごとにリセットされる
// 個数制限（無限に素材をダイヤ化できないようにするため）。
const MERCHANT_TRADES=[
  {give:{wood:24},   get:{diamond:1},    desc:'🪵×24 → 💎×1',  stock:2},
  {give:{stone:30},  get:{diamond:1},    desc:'🪨×30 → 💎×1',  stock:2},
  {give:{wool:6},    get:{arrow:24},     desc:'🧶×6 → 🏹×24',  stock:3},
  {give:{wheat:12},  get:{crystal:2},    desc:'🌾×12 → 🔮×2',  stock:2},
  {give:{clay:6},    get:{brick:10},     desc:'🟤×6 → 🧱×10',  stock:3},
  {give:{ironOre:6}, get:{ironIngot:4},  desc:'🔶×6 → 🔩×4',   stock:2},
  {give:{diamond:3}, get:{dragonCore:1}, desc:'💎×3 → 💠×1',   stock:1},
];

// ═══ 🐞 チート（ボタン式デバッグパネル） ═══
// ポーズメニューの「🐞 CHEATS」から開くパネルでアイテム付与・無敵・時間/天候変更・
// 敵召喚などを実行できる。チートを使ったランはローカルランキングに記録しない
// （クリエイティブと同じ扱い）。godMode 中はあらゆるダメージを無効化する。
let cheatsUsed=false;
let godMode=false;

// ═══ GAME MODE (survival / creative) ═══
// creative: 無敵・ブロック無限・即時破壊・飛行・敵WAVEなし（本家クリエイティブ準拠）
let gameMode='survival';
const isCreative=()=>gameMode==='creative';
let hasDiamondSword=false,hasDiamondBow=false,hasDiamondStaff=false,hasDiamondHammer=false;
let hasIronSword=false; // 鉄の剣: 石とダイヤの中間ティア（ダイヤ剣を作ると上書きされる）
const unlockedWeapons=[true,false,false,false,false,false];
// 末尾の'grass'は🍃葉ブロック: 旧仕様（草ブロックの木の傘）と同じ素材を落とす
// 末尾4件(29-32)は🔱LONGINUSの「神罰汚染地帯」専用ブロック。審判石/神晶/焦土は
// 世界に刻まれた傷跡として掘っても素材を落とさず、神罰核だけが採掘可能なレア素材になる。
const BLOCK_MAT_MAP=['grass','stone','sand','wood','brick','grass','stone',null,null,null,null,'grass','stone','stone','ironOre','diamond',null,'slab','stair','ice','obsidian','crystal','cactus','mushroom','clay','glass','woolBlock','grass','tnt',null,null,null,'judgmentCore'];
const SLOT_MAT=['grass','stone','sand','wood','brick','torch','slab','stair','glass','woolBlock','tnt'];

const CRAFT_RECIPES=[
  {name:'⚔ Sword',  wi:1,  needs:{wood:5},          desc:'🪵×5'},
  {name:'🔨 Hammer', wi:2,  needs:{wood:4,stone:10}, desc:'🪵×4+🪨×10'},
  {name:'🏹 Bow',    wi:3,  needs:{wood:3,stone:3},  desc:'🪵×3+🪨×3'},
  {name:'🪄 Magic',  wi:4,  needs:{brick:5,stone:5}, desc:'🧱×5+🪨×5'},
  {name:'🔥 Torch×4',wi:-11,needs:{wood:1,stone:1},  desc:'🪵×1+🪨×1'},
  {name:'📦 Chest',  wi:-1, needs:{wood:10},         desc:'🪵×10'},
  {name:'🛏 Bed',    wi:-2, needs:{wood:6,grass:4},  desc:'🪵×6+🌿×4'},
  {name:'🧱 Brick×3',wi:-3, needs:{stone:5},         desc:'🪨×5'},
  {name:'⬜ ハーフブロック×4',wi:-12,needs:{stone:2},   desc:'🪨×2'},
  {name:'🪜 階段×4',  wi:-13,needs:{stone:3},         desc:'🪨×3'},
  {name:'💊 ポーション',wi:-4, needs:{grass:3},        desc:'🌿×3'},
  {name:'🏹 矢束×10',  wi:-5, needs:{wood:2},          desc:'🪵×2', req:3},
  {name:'🛡 木の鎧',   wi:-14,armorTier:0,needs:{wood:8,grass:4},   desc:'🪵×8+🌿×4'},
  {name:'🛡 石の鎧',   wi:-15,armorTier:1,needs:{stone:15,wood:5},  desc:'🪨×15+🪵×5', req:2},
  {name:'🔥 かまど',   wi:-25,needs:{stone:12},       desc:'🪨×12', req:2},
  {name:'🔩 鉄の剣',   wi:-26,needs:{ironIngot:3,wood:1},desc:'🔩×3+🪵×1', req:1},
  {name:'🔩 鉄の鎧',   wi:-27,armorTier:3,needs:{ironIngot:5},desc:'🔩×5', req:2},
  {name:'💎 Diamond Sword',wi:-6,needs:{diamond:3,wood:1},desc:'💎×3+🪵×1'},
  {name:'💎 Diamond Bow',  wi:-7,needs:{diamond:3,wood:2},desc:'💎×3+🪵×2',req:3},
  {name:'🔮 Diamond Staff',wi:-8,needs:{diamond:5,wood:2},desc:'💎×5+🪵×2'},
  {name:'🏆 ダイヤドラゴン像',wi:-9,needs:{dragonCore:1,diamond:3},desc:'💠×1+💎×3'},
  {name:'💎 Diamond Hammer',wi:-10,needs:{diamond:4,stone:20},       desc:'💎×4+🪨×20', req:2},
  {name:'💎 ダイヤの鎧',wi:-16,armorTier:2,needs:{diamond:4,stone:10},desc:'💎×4+🪨×10'},
  {name:'🌱 種×4',    wi:-17,needs:{grass:3},        desc:'🌿×3'},
  {name:'🍞 パン',     wi:-18,needs:{wheat:4},        desc:'🌾×4'},
  {name:'🔥 火矢×10',  wi:-20,needs:{wood:2,obsidian:1},desc:'🪵×2+⬛×1', req:3},
  {name:'🧊 氷矢×10',  wi:-21,needs:{wood:2,ice:1},   desc:'🪵×2+🧊×1', req:3},
  {name:'🍄 キノコシチュー',wi:-22,needs:{mushroom:2},   desc:'🍄×2'},
  {name:'🌵 サボテンジュース',wi:-23,needs:{cactus:2},   desc:'🌵×2'},
  {name:'🧱 レンガ×4(粘土)',wi:-24,needs:{clay:2},      desc:'🟤×2'},
  {name:'🧶 ウールブロック×4',wi:-28,needs:{wool:2},     desc:'🧶×2'},
  {name:'⚒ 強化台',   wi:-19,needs:{stone:15,diamond:1},desc:'🪨×15+💎×1', req:2},
  {name:'💣 TNT ×2',wi:-29,needs:{sand:4,ironOre:1},desc:'SAND×4 + IRON ORE×1'},
  // 🌋 地殻貫通爆弾（航空TNT）: 飛行中に投下する超強力な空中兵器。素材コストは高め。
  {name:'🌋 地殻貫通爆弾',wi:-30,needs:{tnt:4,ironIngot:3,obsidian:2},desc:'💣×4 + 🔩×3 + ⬛×2', req:2},
  // ☢ ツァーリ・ボンバ: ゲームバランス無視の最終兵器。ワールド破壊級の大規模災害。
  {name:'☢ ツァーリ・ボンバ',wi:-31,needs:{crustBomb:2,diamond:6,obsidian:8,dragonCore:1},desc:'🌋×2 + 💎×6 + ⬛×8 + 💠×1', req:2},
  // 🔱 LONGINUS: 横方向の爆発力ではなく縦方向の貫通と永久の傷跡を刻む軌道兵器。
  {name:'🔱 LONGINUS',wi:-32,needs:{crystal:12,diamond:10,obsidian:10,dragonCore:2},desc:'🔮×12 + 💎×10 + ⬛×10 + 💠×2', req:2},
  // 🚀 超大型レールガン: 面でも縦でもなく「線」で世界を撃ち抜く超長距離貫通兵器。
  {name:'🚀 RAILGUN',wi:-33,needs:{ironIngot:8,diamond:8,crystal:6,obsidian:4},desc:'🔩×8 + 💎×8 + 🔮×6 + ⬛×4', req:2},
];

// ═══ 武器強化（エンチャント） ═══
// ⚒強化台の近くでクラフトパネルを開くと強化メニューが出る。
// atk/rng はレベル制（重ねがけ）、fire/frost は一度きりの属性付与。
// 効果は全武器共通に乗る: wDmg()/wRange() 参照。
const enchants={atk:0,rng:0,fire:false,frost:false};
function resetEnchants(){enchants.atk=0;enchants.rng=0;enchants.fire=false;enchants.frost=false;}
const ENCHANT_DEFS=[
  {key:'atk', icon:'⚔', name:'攻撃強化', max:3, cost:l=>({diamond:l+1}),        effect:'全武器ダメージ+1'},
  {key:'rng', icon:'🎯',name:'射程強化', max:3, cost:l=>({diamond:1,crystal:l}),effect:'攻撃射程+15%'},
  {key:'fire',icon:'🔥',name:'炎上付与', max:1, cost:()=>({dragonCore:1}),      effect:'近接攻撃で敵が燃える'},
  {key:'frost',icon:'❄',name:'氷結付与', max:1, cost:()=>({dragonCore:1,ice:3}),effect:'近接攻撃で敵が鈍足に'},
];
function enchLevel(d){const v=enchants[d.key];return v===true?1:v===false?0:v;}
function enchCostText(cost){return Object.entries(cost).map(([k,v])=>(MATERIAL_LABELS[k]||k).split(' ')[0]+'×'+v).join('+');}
function enchSuffix(){let s='';if(enchants.atk)s+=' ⚔+'+enchants.atk;if(enchants.rng)s+=' 🎯+'+enchants.rng;if(enchants.fire)s+='🔥';if(enchants.frost)s+='❄';return s;}

// ═══ 精錬（かまど） ═══
// 🔥かまどの近くでクラフトパネルを開くと精錬メニューが出る。
// 鉄鉱石＋燃料(木)で鉄インゴットを作り、鉄の剣・鉄の鎧の素材にする。
const SMELT_RECIPES=[
  {name:'🔩 鉄インゴット',   needs:{ironOre:1,wood:1},  desc:'🔶×1+🪵×1(燃料)', give:{ironIngot:1}},
  {name:'🔩 鉄インゴット×3', needs:{ironOre:3,wood:2},  desc:'🔶×3+🪵×2(燃料)', give:{ironIngot:3}},
  {name:'🪟 ガラス',         needs:{sand:1,wood:1},     desc:'🏖×1+🪵×1(燃料)', give:{glass:1}},
  {name:'🪟 ガラス×3',       needs:{sand:3,wood:2},     desc:'🏖×3+🪵×2(燃料)', give:{glass:3}},
];

// ═══ 🍖 調理（かまど） ═══
// 🔥かまどの近くでクラフトパネルを開くと調理メニューが出る。生肉を焼いて回復量の
// 高いステーキにできる。'meat' はインベントリ外のカウンタなので foodGet/foodAdd 経由で扱う。
const COOK_RECIPES=[
  {name:'🍖 ステーキ',   needs:{meat:1,wood:1},  desc:'🥩×1+🪵×1(燃料)', give:{steak:1}},
  {name:'🍖 ステーキ×3', needs:{meat:3,wood:2},  desc:'🥩×3+🪵×2(燃料)', give:{steak:3}},
];

