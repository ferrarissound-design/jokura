// ============================================================================
// jokura / railgun_sequence.js
// 🚀 レールガンの画面演出だけを担当する司令塔（longinus_sequence.jsと同じ設計）。
//   地形破壊・照準・発射物理・音の実処理は railgun.js が持ち、ここでは body の
//   クラス付け替え → CSS でチャージゲージ/CHARGED/COOLINGの出し入れだけを行う。
//
//   フェーズ: idle → charging(ゲージ0→100%) → (chargedは一瞬のフラッシュ表示) →
//             fire(閃光と同時の短い明滅) → cooling(残りクールダウン秒数) → idle
//   すべて railgun.js から明示的に呼ばれる。内部タイマーは「charged」の自動消去と
//   「fire」クラスの自動解除だけ持つ。
//
//   読み込み順: … longinus_sequence → railgun → railgun_sequence → hud → …
// ============================================================================

const RAIL_SEQ_CLASSES=['railCharging','railCharged','railFire','railCooling'];

const RailgunSequence={
  phase:'idle',
  _chargedT:0,
  _fireT:0,
  _gaugeFill:null,_gaugePct:null,_coolText:null,

  _els(){
    if(!this._gaugeFill)this._gaugeFill=document.getElementById('railgunGaugeFill');
    if(!this._gaugePct)this._gaugePct=document.getElementById('railgunGaugePct');
    if(!this._coolText)this._coolText=document.getElementById('railgunCoolText');
  },

  chargeStart(){
    this._clearClasses();
    this.phase='charging';
    document.body.classList.add('railCharging');
    this._els();
    if(this._gaugeFill)this._gaugeFill.style.width='0%';
    if(this._gaugePct)this._gaugePct.textContent='0%';
  },
  chargeProgress(p){
    this._els();
    const pct=Math.round(Math.max(0,Math.min(1,p))*100);
    if(this._gaugeFill)this._gaugeFill.style.width=pct+'%';
    if(this._gaugePct)this._gaugePct.textContent=pct+'%';
  },
  chargeCancelled(){
    document.body.classList.remove('railCharging');
    this.phase='idle';
  },
  // チャージ完了の一瞬（fired()と同じフレームで呼ばれ、閃光と重なって見える）
  charged(){
    document.body.classList.remove('railCharging');
    const b=document.body;b.classList.remove('railCharged');void b.offsetWidth;b.classList.add('railCharged');
    this._chargedT=.5;
  },
  fired(){
    const b=document.body;b.classList.remove('railFire');void b.offsetWidth;b.classList.add('railFire');
    this._fireT=.35;
    this.phase='fire';
  },
  cooling(sec){
    this._els();
    document.body.classList.add('railCooling');
    if(this._coolText)this._coolText.textContent='RAILGUN COOLING '+Math.max(0,sec).toFixed(1)+'s';
    this.phase='cooling';
  },
  coolingDone(){
    if(this.phase!=='cooling')return;
    document.body.classList.remove('railCooling');
    this._els();
    if(this._coolText)this._coolText.textContent='';
    this.phase='idle';
  },
  abort(){
    this.phase='idle';this._chargedT=0;this._fireT=0;
    this._clearClasses();
    if(typeof audioMasterReset==='function')audioMasterReset();
  },
  update(dt){
    if(this._chargedT>0){this._chargedT-=dt;if(this._chargedT<=0)document.body.classList.remove('railCharged');}
    if(this._fireT>0){this._fireT-=dt;if(this._fireT<=0)document.body.classList.remove('railFire');}
  },
  _clearClasses(){
    const b=document.body;
    for(const c of RAIL_SEQ_CLASSES)b.classList.remove(c);
  },
};

function railgunSeqAbort(){RailgunSequence.abort();}
