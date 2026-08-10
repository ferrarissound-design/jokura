// ============================================================================
// jokura / tsar_sequence.js
// ☢ ツァーリ・ボンバ「終末兵器 起動シーケンス」— 演出専用の司令塔。
//
//   爆発の実処理（tsar_bomba.js: 破壊キュー・衝撃波・強制即死・キノコ雲・セーブ）
//   には一切触れず、「使った瞬間だけ別のゲームに乗っ取られたように見せる」演出
//   だけを担当する。実装は body のクラス付け替え → CSS アニメーションが基本で、
//   JS が毎フレーム触るのは残り時間テキスト（20Hz・textContent のみ）だけ。
//
//   フェーズ:
//     idle       … 何もしていない（DOM/クラス/音の残留ゼロ）
//     armed      … 空中投下直後。着弾していないので IMPACT は --.--
//     countdown  … 着弾〜起爆。シネスコ帯・警告パネル・IMPACT カウントダウン
//     signalLost … 起爆 0.3 秒前。全音を急速に落とし SIGNAL LOST だけ残す
//     flash      … 起爆。帯もHUDも消し、閃光と爆心から引く白飛びだけにする
//     shockwave  … 衝撃波通過。HUDが壊れた状態で戻る／通過時に歪み＋強シェイク
//     hudOffline … SCORE ---- / KILLS ?? / MINIMAP OFFLINE の障害表示
//     recovery   … 数秒かけて順番に復旧し、中央に WORLD DATA UPDATED
//
//   状態遷移の駆動は既存 tick（updateTsarBomba → TsarSequence.update(dt)）のみ。
//   setTimeout を新設しないので、ポーズ中は自動的に止まり、リセット/死亡/
//   タイトル復帰では abort() 一発で確実にクリーンアップできる。
//
//   読み込み順: … tsar_bomba → tsar_sequence → hud → … （main.js より前）
// ============================================================================

// 各フェーズの長さ（秒）。合計しても起爆後 6.3 秒ほどでテンポを崩さない。
// 「静寂」に入るタイミングだけは起爆処理と共有する必要があるので
// TsarBombaConfig.silenceLead を唯一の定義元にしている。
const TSAR_SEQ={
  flash:0.60,       // 閃光（HUD・帯を全部消す時間）
  shock:1.40,       // 衝撃波（壊れたHUDが戻ってくる）
  offline:2.40,     // HUD障害
  recovery:1.90,    // 順次復旧 + WORLD DATA UPDATED
  armedMax:14,      // 着弾しないまま放置された場合の保険（秒）
  lostMax:1.60,     // 起爆が来ないまま静寂が続いた場合の保険（秒）
};
// 演出で使う body クラス。abort() はこの一覧を消すだけで完全に元へ戻る。
const TSAR_SEQ_CLASSES=['tsarCine','tsarHot','tsarSilent','tsarBlast','tsarOffline','tsarRecover','tsarWarp','tsarNoFlash','tsarExtinct'];

// ─── DOM は index.html に静的に置いてある（実行時生成・innerHTML更新をしない） ───
let _tcRoot=null,_tcYield=null,_tcImpact=null,_tcBurst=null,_tcHazard=null,_tcRestored=null,_tcReady=false;
function _tcEnsure(){
  if(_tcReady)return;
  _tcReady=true;
  _tcRoot=document.getElementById('tsarCine');
  _tcYield=document.getElementById('tsarYield');
  _tcImpact=document.getElementById('tsarImpact');
  _tcBurst=document.getElementById('tsarBurst');
  _tcHazard=_tcRoot?_tcRoot.querySelector('.tcHazard'):null;
  _tcRestored=_tcRoot?_tcRoot.querySelector('.tcRestored'):null;
}
// 現在のツァーリ・ボンバ規模設定をそのまま出力（20%〜1000%）
function _tsarYieldText(){
  const raw=(typeof settings!=='undefined'&&settings.tsarScale!=null)?Number(settings.tsarScale):1;
  return Math.round((raw||1)*100)+'%';
}
// 残り時間 SS.CC（着弾前は --.--）
function _tsarImpactText(sec){
  if(sec==null)return '--.--';
  const v=Math.max(0,sec);
  return (v<10?'0':'')+v.toFixed(2);
}
// 雨/雪の見た目を一瞬引かせる。_updatePrecip が毎フレーム目標値へ補間で
// 戻すので、opacity を 0 に叩くだけで「衝撃波に押し流された」ように見える
// （パーティクル全件へのCPU物理計算はしない）。
function _tcHushWeather(){
  const gs2=[typeof rainGroup!=='undefined'?rainGroup:null,typeof snowGroup!=='undefined'?snowGroup:null];
  for(const g of gs2){if(g&&g.userData&&g.userData.mat)g.userData.mat.opacity=0;}
}
// 爆心を画面座標(%)に射影して、白飛びが引いていく中心に使う（起爆時に1回だけ）
const _tcProjV=new THREE.Vector3();
function _tcSetBurstOrigin(cx,cy,cz){
  if(!_tcBurst)return;
  let px=50,py=48;
  try{
    _tcProjV.set(cx,cy,cz).project(camera);
    px=(_tcProjV.x*0.5+0.5)*100;py=(-_tcProjV.y*0.5+0.5)*100;
    if(_tcProjV.z>1){px=100-px;py=100-py;} // 背後にある場合は反対側から引かせる
    px=Math.max(-15,Math.min(115,px));py=Math.max(-15,Math.min(115,py));
  }catch(e){}
  _tcBurst.style.setProperty('--bx',px.toFixed(1)+'%');
  _tcBurst.style.setProperty('--by',py.toFixed(1)+'%');
}

const TsarSequence={
  phase:'idle',
  t:0,            // 現フェーズの経過秒
  _impactT:null,  // 起爆までの残り秒（着弾前は null）
  _uiT:0,         // テキスト更新の間引きタイマー
  _warp:0,        // 画面歪みクラスの残り時間
  _hot:false,
  _yShown:'',_iShown:'',

  active(){return this.phase!=='idle';},

  // ── フェーズ1a: 投下直後（まだ着弾していない） ──
  arm(){
    if(this.phase==='armed'||this.phase==='countdown'||this.phase==='signalLost')return;
    this._begin();
    this._impactT=null;
    this._enter('armed');
    this._paint();
  },
  // ── フェーズ1b: 着弾〜起爆のカウントダウン（既存 fuse と同期） ──
  countdown(remain){
    this._impactT=remain;
    if(this.phase==='countdown'||this.phase==='signalLost')return;
    // 直前の爆発の余韻が残っていても、新しい起動が最優先（連続使用時の残留防止）
    if(this.phase!=='idle'&&this.phase!=='armed')this.abort();
    this._begin();
    this._enter('countdown');
    this._paint();
  },
  // ── フェーズ2: 着弾直前の静寂 ──
  signalLost(){
    if(this.phase!=='armed'&&this.phase!=='countdown')return;
    this._enter('signalLost');
    if(typeof sfxTsarSignalLost==='function')sfxTsarSignalLost();
    if(typeof stopBgm==='function')stopBgm();          // BGM を止める
    if(typeof audioDuckTo==='function')audioDuckTo(0.02,0.13); // 環境音・警告音ごと落とす
    _tcHushWeather();
  },
  // ── フェーズ3: 起爆（閃光。文字は出さない） ──
  detonate(cx,cy,cz){
    this._begin();
    _tcSetBurstOrigin(cx,cy,cz);
    // 画面フラッシュ OFF の設定を尊重: 白飛びの代わりに暗赤の縁取りへ差し替える
    document.body.classList.toggle('tsarNoFlash',typeof settings!=='undefined'&&settings.flash===false);
    // EXTINCTION(3000%)級だけ、既存のハザード表示/復旧表示の文言を専用のものへ
    // 差し替える（新しい演出システムは作らず、既存の tcHazard/tcRestored を再利用）
    const extinct=typeof settings!=='undefined'&&Number(settings.tsarScale)>=30;
    document.body.classList.toggle('tsarExtinct',extinct);
    if(_tcHazard)_tcHazard.textContent=extinct?'☢ EXTINCTION EVENT':'ENVIRONMENTAL HAZARD';
    if(_tcRestored)_tcRestored.textContent=extinct?'REGIONAL TERRAIN DATA ERASED':'WORLD DATA UPDATED';
    this._impactT=null;
    this._enter('flash');
    if(typeof audioMasterReset==='function')audioMasterReset(); // 静寂から復帰（爆音は原寸で）
  },
  // ── フェーズ3の後半: 衝撃波がプレイヤーへ到達した瞬間 ──
  onShockwavePass(f){
    const b=document.body,k=Math.max(0.15,Math.min(1,f||0.5));
    b.classList.remove('tsarWarp');
    void b.offsetWidth; // 連続使用でもアニメーションを頭から再生させる
    b.classList.add('tsarWarp');
    this._warp=0.46;
    _tcHushWeather();
    if(typeof ftvShake==='function')ftvShake(Math.max(.3,1.05*k),.55);
    if(typeof playTone==='function'){playTone(44,.5,.16*k,'sine');playTone(86,.28,.09*k,'square');}
  },

  update(dt){
    // 歪みクラスはフェーズと独立に寿命管理（idle 後に残さない）
    if(this._warp>0){this._warp-=dt;if(this._warp<=0)document.body.classList.remove('tsarWarp');}
    if(this.phase==='idle')return;
    this.t+=dt;
    const D=TSAR_SEQ;
    switch(this.phase){
      case 'armed':
        if(this.t>=D.armedMax){this.abort();return;} // 着弾しないまま放置された保険
        this._tickText(dt);
        return;
      case 'countdown':
        this._tickText(dt);
        return;
      case 'signalLost':
        if(this.t>=D.lostMax)this.abort();           // 起爆が来ないままの保険
        return;
      case 'flash':
        if(this.t>=D.flash)this._enter('shockwave');
        return;
      case 'shockwave':
        if(this.t>=D.shock)this._enter('hudOffline');
        return;
      case 'hudOffline':
        if(this.t>=D.offline)this._enter('recovery');
        return;
      case 'recovery':
        if(this.t>=D.recovery)this.finish();
        return;
    }
  },

  // 起爆キャンセル・死亡・リセット・タイトル復帰・連続使用の全てで呼ばれる後始末
  abort(){
    this.phase='idle';this.t=0;this._impactT=null;this._uiT=0;this._hot=false;this._warp=0;
    this._yShown='';this._iShown='';
    const b=document.body;
    for(const c of TSAR_SEQ_CLASSES)b.classList.remove(c);
    if(typeof audioMasterReset==='function')audioMasterReset();
    this._bgmResume();
    // 既存の全画面白飛びも一緒に落とす（tsar_bomba.js のレベル変数）
    _tsarFlashLevel=0;
    const el=document.getElementById('tsarFlash');if(el)el.style.opacity='0';
  },
  finish(){this.abort();},

  // ─── 内部 ───
  _begin(){_tcEnsure();},
  _enter(p){
    this.phase=p;this.t=0;
    const b=document.body,on=(c,v)=>b.classList.toggle(c,v);
    const cine=(p==='armed'||p==='countdown'||p==='signalLost');
    on('tsarCine',cine);
    on('tsarSilent',p==='signalLost');
    on('tsarBlast',p==='flash');
    on('tsarOffline',p==='shockwave'||p==='hudOffline'||p==='recovery');
    on('tsarRecover',p==='recovery');
    if(!cine&&this._hot){this._hot=false;on('tsarHot',false);}
    if(p==='recovery')this._bgmResume(); // 復旧に合わせて BGM も戻す
  },
  _tickText(dt){
    this._uiT-=dt;
    if(this._uiT>0)return;
    this._uiT=0.05; // 20Hz。textContent のみ・innerHTML は触らない
    this._paint();
  },
  _paint(){
    if(_tcYield){const y=_tsarYieldText();if(y!==this._yShown){this._yShown=y;_tcYield.textContent=y;}}
    if(_tcImpact){const s=_tsarImpactText(this._impactT);if(s!==this._iShown){this._iShown=s;_tcImpact.textContent=s;}}
    const hot=this._impactT!=null&&this._impactT<=1.0;
    if(hot!==this._hot){this._hot=hot;document.body.classList.toggle('tsarHot',hot);}
  },
  // BGM は stopBgm() で止めているので、追跡変数を無効化して updateBgm に再開させる
  _bgmResume(){
    if(typeof bgmBiome==='undefined')return;
    bgmBiome=-1;bgmBoss=false;bgmWave=false;bgmUnder=false;bgmUnderDragon=false;
  },
};

// 死亡・ゲームリセットなど、tsar_bomba.js の外から後始末したいとき用
function tsarSeqAbort(){TsarSequence.abort();}
