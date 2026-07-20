// ============================================================================
// jokura / structures_registry.js
// 特殊生成メニュー: 登録テーブル + ディスパッチャ（全 generateXxx 定義後に読み込むこと）
// world.js から分割されたファイルの一部。全スクリプトは index.html の PARTS の
// 順序で <script> として読み込まれ、同一のグローバルスコープを共有する。
// SPECIAL_STRUCTURES が各 generateXxx を読み込み時に直接参照するため、
// このファイルは全 structures_*.js の最後に読み込まれる必要がある。
// ============================================================================

// ═══ 特殊生成メニュー: 登録テーブル + ディスパッチャ ═══
// UIの「特殊生成」ピッカーはこの配列を舐めてボタンを並べるだけ。新しい生成物を
// 追加するときは、この配列に1エントリ足して generateXxx() を実装すればよい
// （main.js/cheats.js 側のUIコードは変更不要）。
const SPECIAL_STRUCTURES=[
  {key:'sageGarden',icon:'🏔',label:'賢者の樹庭',desc:'岩の尖塔とアーチ、御神木と池',fn:generateSageGarden},
  {key:'pleiadesWatchtower',icon:'🗼',label:'プレアデス監視塔',desc:'天まで伸びる細い塔と頂上の神殿',fn:generatePleiadesWatchtower},
  {key:'skyTemple',icon:'🏝',label:'空中神殿',desc:'空に浮かぶ島と八角神殿、滝と浮遊岩',fn:generateSkyTemple},
  {key:'worldTree',icon:'🌳',label:'世界樹',desc:'大地を覆う巨大な神秘の樹',fn:generateWorldTree},
  {key:'sleepingStoneGod',icon:'🦴',label:'眠れる石神',desc:'倒れて石化した超巨大な人型の神。頭蓋骨・肋骨・心核を探索',fn:generateSleepingStoneGod},
  {key:'invertedCastle',icon:'🏰',label:'逆さ城',desc:'空中に浮かぶ暗黒の逆さ城。下向きの尖塔・浮遊島・魔力コアを探索',fn:generateInvertedCastle},
  {key:'frozenTimeVillage',icon:'⏳',label:'時間が止まった村',desc:'襲撃の瞬間ごと時間停止した村。中央の時間結晶を壊すと時が動き出す',fn:generateFrozenTimeVillage},
  {key:'sealedUndergroundCity',icon:'🏛',label:'封印された地底都市',desc:'地上の小さな遺跡の地下深くに眠る古代都市。中央神殿の封印装置を解き放て',fn:generateSealedUndergroundCity},
  {key:'collapsingSkyCity',icon:'☁',label:'崩れかけの天空都市',desc:'雲上に浮かぶ半壊都市。中央動力炉を再起動して光の橋と隠し制御室を復旧',fn:generateCollapsingSkyCity},
  {key:'sunkenRoyalCity',icon:'🌊',label:'海底に沈んだ王都',desc:'海面下に眠る巨大都市。城壁と時計塔を越え、王宮の王の間と地下宝物庫を目指せ',fn:generateSunkenRoyalCity},
  {key:'walkingFortress',icon:'🏰',label:'歩き続ける巨大城塞',desc:'四脚でゆっくり世界を歩く地形級の移動要塞。内部ホール・動力炉・制御室を探索',fn:generateWalkingFortress},
];
function generateSpecialStructure(key){
  const def=SPECIAL_STRUCTURES.find(s=>s.key===key);
  if(def)def.fn();
}

// プレイヤーから minDist 以上離れた最寄りの未開封構造物を探す（宝の地図の目標用）
function findNearestStructure(px,pz,minDist){
  const pgx=Math.floor(px/STRUCT_GRID),pgz=Math.floor(pz/STRUCT_GRID);
  let best=null,bestD=Infinity;
  for(let ring=0;ring<=6;ring++){
    for(let gx=pgx-ring;gx<=pgx+ring;gx++)for(let gz=pgz-ring;gz<=pgz+ring;gz++){
      if(Math.max(Math.abs(gx-pgx),Math.abs(gz-pgz))!==ring)continue; // リング外周のみ
      const s=structAt(gx,gz);if(!s)continue;
      const key=structChestKey(s);if(openedTreasureKeys.has(key))continue;
      const d=Math.hypot(s.wx-px,s.wz-pz);if(d<minDist)continue;
      if(d<bestD){bestD=d;best={wx:s.wx,wz:s.wz,key,type:s.type};}
    }
    if(best&&ring>=2)break; // 数リング先まで見つかれば十分
  }
  return best;
}
