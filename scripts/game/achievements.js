// ============================================================================
// jokura / achievements.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、下記の順序で <script> として読み込まれ、すべて同一のグローバル
// スコープを共有する（元は単一の boot() 関数だったため、この順序と共有スコープが前提）。
// 読み込み順: state → achievements → crafting → save → ui → audio → world →
//             combat → entities → hud → input → main
// ============================================================================

const ACHIEVEMENT_DEFS={
  firstSword:{title:'はじめての剣',desc:'剣をクラフトする',reward:'🥩 +1',apply(){meat+=1;updateMeatHUD();}},
  firstHammer:{title:'石の使い手',desc:'ハンマーをクラフトする',reward:'SCORE +300',apply(){gs.score+=300;}},
  firstBow:{title:'遠距離デビュー',desc:'弓をクラフトする',reward:'🏹 +10',apply(){inv.arrow+=10;updateInvHUD();}},
  firstArmor:{title:'鉄壁の備え',desc:'鎧をクラフトする',reward:'SCORE +300',apply(){gs.score+=300;}},
  firstBase:{title:'拠点づくり',desc:'チェストかベッドを設置する',reward:'HP +30',apply(){P.hp=Math.min(P.maxHp,P.hp+30);}},
  firstShear:{title:'羊毛刈り',desc:'羊の毛を刈る',reward:'SCORE +200',apply(){gs.score+=200;}},
  firstTame:{title:'最高の相棒',desc:'オオカミを肉で手なずける',reward:'SCORE +300',apply(){gs.score+=300;}},
  firstHarvest:{title:'収穫の喜び',desc:'小麦を収穫する',reward:'HP +20 / 満腹度+20',apply(){P.hp=Math.min(P.maxHp,P.hp+20);P.food=Math.min(100,P.food+20);}},
  firstDiamond:{title:'ダイヤ発見',desc:'ダイヤを初めて入手する',reward:'SCORE +500',apply(){gs.score+=500;}},
  treasureHunter:{title:'地下探検家',desc:'地下宝箱を開ける',reward:'💎 +1',apply(){inv.diamond+=1;updateInvHUD();}},
  wave5:{title:'WAVE5到達',desc:'WAVE5に到達する',reward:'🥩 +2 / 🏹 +10',apply(){meat+=2;inv.arrow+=10;updateMeatHUD();updateInvHUD();}},
  bossSlayer:{title:'ボススレイヤー',desc:'通常ボスを倒す',reward:'SCORE +1000',apply(){gs.score+=1000;}},
  finalChallenge:{title:'最終決戦',desc:'WAVE20に到達する',reward:'💎 +2',apply(){inv.diamond+=2;updateInvHUD();}},
  dragonSlayer:{title:'ドラゴンスレイヤー',desc:'キングダイヤモンドドラゴンを倒す',reward:'🏆 CLEAR BONUS',apply(){gs.score+=3000;}},
  firstEnchant:{title:'エンチャントの力',desc:'強化台で武器を強化する',reward:'SCORE +500',apply(){gs.score+=500;}},
  firstSmelt:{title:'鉄の時代',desc:'かまどで鉄を精錬する',reward:'SCORE +300',apply(){gs.score+=300;}},
  firstCook:{title:'料理人',desc:'かまどで肉を焼いてステーキを作る',reward:'🥩 +2',apply(){meat+=2;updateMeatHUD();}},
  thunderStruck:{title:'雷に打たれても',desc:'落雷の直撃を受けて生き延びる',reward:'SCORE +200',apply(){gs.score+=200;}},
  firstTameHorse:{title:'ウマ使い',desc:'ウマを小麦で手なずける',reward:'SCORE +200',apply(){gs.score+=200;}},
  firstMount:{title:'名騎手',desc:'ウマに騎乗する',reward:'SCORE +300',apply(){gs.score+=300;}},
  biomeCollector:{title:'バイオームコレクター',desc:'6バイオームの固有素材をすべて所持する',reward:'💎 +2',apply(){inv.diamond+=2;updateInvHUD();}},
  biomeExplorer:{title:'世界を知る者',desc:'すべてのバイオームを発見する',reward:'SCORE +1000',apply(){gs.score+=1000;}},
  structureRaider:{title:'遺跡荒らし',desc:'地上構造物の宝箱を開ける',reward:'SCORE +400',apply(){gs.score+=400;}},
  mapMaster:{title:'トレジャーハンター',desc:'宝の地図の宝を発見する',reward:'💎 +2',apply(){inv.diamond+=2;updateInvHUD();}},
  endless25:{title:'終わらない戦い',desc:'エンドレスモードでWAVE25に到達',reward:'SCORE +2000',apply(){gs.score+=2000;}},
  endless30:{title:'伝説の生存者',desc:'エンドレスモードでWAVE30に到達',reward:'SCORE +5000',apply(){gs.score+=5000;}},
  meteorStruck:{title:'隕石サバイバー',desc:'隕石の直撃を受けて生き延びる',reward:'SCORE +300',apply(){gs.score+=300;}},
  creeperHunter:{title:'爆発物処理班',desc:'クリーパーを爆発する前に倒す',reward:'SCORE +300',apply(){gs.score+=300;}},
  phantomHunter:{title:'夜空の狩人',desc:'ファントムを倒す',reward:'SCORE +300',apply(){gs.score+=300;}},
  firstTrade:{title:'商談成立',desc:'行商人と取引する',reward:'SCORE +300',apply(){gs.score+=300;}},
  fullMoonSurvivor:{title:'満月を越えて',desc:'満月の夜を生き延びる',reward:'SCORE +500',apply(){gs.score+=500;}},
};
const achievements={};
function resetAchievements(){for(const key of Object.keys(ACHIEVEMENT_DEFS))achievements[key]=false;}
function loadAchievements(saved){resetAchievements();if(saved&&typeof saved==='object'){for(const key of Object.keys(ACHIEVEMENT_DEFS))achievements[key]=!!saved[key];}}
function unlockAchievement(key){
  if(isCreative())return; // achievements are survival-only
  const def=ACHIEVEMENT_DEFS[key];if(!def||achievements[key])return;
  achievements[key]=true;
  if(def.apply)def.apply();
  showBonus('🏅 '+def.title+' 達成！ '+def.reward);
  playTone(1200,.12,.12,'triangle');setTimeout(()=>playTone(1600,.1,.1,'triangle'),110);
  renderAchievements();
}
resetAchievements();

