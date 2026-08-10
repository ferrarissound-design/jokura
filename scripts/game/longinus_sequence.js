// ============================================================================
// jokura / longinus_sequence.js
// 🔱 LONGINUS「神罰演出」— 画面テキスト/暗転演出だけを担当する司令塔。
//   地形破壊・照準・降下物理・音の実処理は longinus.js が持ち、ここでは
//   body のクラス付け替え → CSS アニメーションでテキストと周辺減光だけを
//   出し入れする（tsar_sequence.js と同じ設計方針）。
//
//   Tsar の「HUDが壊れる終末兵器」演出とは違い、LONGINUSは「静かで厳粛な神罰」
//   を狙うため、HUDを大きく破壊したりスキャンライン/グリッチは入れない。
//   画面は常にヴィネット止まりで完全には覆わず、着弾地点は視界の中心に
//   残るようにする（着弾地点はプレイヤーが照準した先＝画面中央付近）。
//
//   フェーズ（すべて longinus.js から明示的に呼ばれる。内部タイマーは持たない。
//   ただし complete の自動フェードアウトと impact の短い歪みだけは独立更新する）:
//     idle → lock → judgment → descent → (impact/silenceは一瞬のフラグ) →
//     complete → idle
//
//   読み込み順: … tsar_sequence → longinus → longinus_sequence → hud → …
// ============================================================================

const LGN_SEQ={
  completeHold:2.6, // JUDGMENT COMPLETE が自動で消えるまでの秒数
  warpTime:0.42,    // 着弾時の短い画面歪み
};
const LGN_SEQ_CLASSES=['lgnLock','lgnJudgment','lgnDescent','lgnSilence','lgnComplete','lgnWarp'];

const LonginusSequence={
  phase:'idle',
  _completeT:0,
  _warpT:0,

  active(){return this.phase!=='idle';},

  lock(cx,cy,cz){
    this._clearClasses();
    this.phase='lock';
    document.body.classList.add('lgnLock');
  },
  judgment(){
    document.body.classList.remove('lgnLock');
    document.body.classList.add('lgnJudgment');
    this.phase='judgment';
  },
  descentStart(){
    document.body.classList.remove('lgnJudgment');
    document.body.classList.add('lgnDescent');
    this.phase='descent';
  },
  // 着弾直前の一瞬の無音・静止（longinus.js が audioDuckTo と同じタイミングで呼ぶ）
  silence(){
    document.body.classList.add('lgnSilence');
    setTimeout(()=>{document.body.classList.remove('lgnSilence');},180);
  },
  // 着弾の瞬間: 短い画面歪み（tsar の onShockwavePass 相当。閃光そのものは
  // longinus.js 側の #longinusFlash が別途受け持つ）
  impactFlash(cx,cy,cz){
    document.body.classList.remove('lgnDescent');
    const b=document.body;
    b.classList.remove('lgnWarp');void b.offsetWidth;b.classList.add('lgnWarp');
    this._warpT=LGN_SEQ.warpTime;
    this.phase='impact';
  },
  // 着弾後の余韻を経て、静かに JUDGMENT COMPLETE を表示する
  complete(){
    document.body.classList.add('lgnComplete');
    this._completeT=LGN_SEQ.completeHold;
    this.phase='complete';
  },
  // ストライク全体の終了（余韻演出も含め完了）。まだ complete 中でなければ
  // 保険として即座に片付ける。
  finish(){
    if(this.phase!=='idle')this.abort();
  },
  // 死亡・リセット・タイトル復帰など、外部から強制的に後始末したいとき
  abort(){
    this.phase='idle';this._completeT=0;this._warpT=0;
    this._clearClasses();
    if(typeof audioMasterReset==='function')audioMasterReset();
  },
  update(dt){
    if(this._warpT>0){this._warpT-=dt;if(this._warpT<=0)document.body.classList.remove('lgnWarp');}
    if(this.phase==='complete'){
      this._completeT-=dt;
      if(this._completeT<=0){
        document.body.classList.remove('lgnComplete');
        this.phase='idle';
      }
    }
  },
  _clearClasses(){
    const b=document.body;
    for(const c of LGN_SEQ_CLASSES)b.classList.remove(c);
  },
};

function longinusSeqAbort(){LonginusSequence.abort();}
