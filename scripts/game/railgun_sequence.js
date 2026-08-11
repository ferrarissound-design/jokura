// ============================================================================
// jokura / railgun_sequence.js
// 🚀 レールガンの画面演出だけを担当する司令塔（longinus_sequence.jsと同じ設計）。
//   地形破壊・照準・発射物理・音の実処理は railgun.js が持ち、ここでは body の
//   クラス付け替えと軽量DOM/CSS演出だけを行う。
//
//   フェーズ: idle → charging(ゲージ0→100%) → charged → fire → cooling → idle
//   発射処理そのものには触れず、チャージ後半の磁場収束・発射時の衝撃波・
//   放射状ストリーク・残光を追加して「世界を一直線に撃ち抜く」感を強める。
// ============================================================================

const RAIL_SEQ_CLASSES=['railCharging','railCharged','railFire','railCooling','railOverdrive','railAfterglow'];

const RailgunSequence={
  phase:'idle',
  _chargedT:0,
  _fireT:0,
  _afterT:0,
  _gaugeFill:null,_gaugePct:null,_coolText:null,_fx:null,

  _els(){
    if(!this._gaugeFill)this._gaugeFill=document.getElementById('railgunGaugeFill');
    if(!this._gaugePct)this._gaugePct=document.getElementById('railgunGaugePct');
    if(!this._coolText)this._coolText=document.getElementById('railgunCoolText');
    this._ensureFx();
  },

  _ensureFx(){
    if(this._fx&&this._fx.isConnected)return;
    let fx=document.getElementById('railgunOverdriveFx');
    if(!fx){
      fx=document.createElement('div');
      fx.id='railgunOverdriveFx';
      fx.setAttribute('aria-hidden','true');
      fx.innerHTML=
        '<div class="railMagRing r1"></div><div class="railMagRing r2"></div><div class="railMagRing r3"></div>'+
        '<div class="railFireRing"></div><div class="railAfterglowCore"></div>'+
        Array.from({length:10},(_,i)=>'<div class="railFireStreak" style="--a:'+(i*36)+'deg"></div>').join('');
      const hud=document.getElementById('hud')||document.body;
      hud.appendChild(fx);
    }
    this._fx=fx;
    if(!document.getElementById('railgunOverdriveStyle')){
      const s=document.createElement('style');
      s.id='railgunOverdriveStyle';
      s.textContent=`
#railgunOverdriveFx{position:absolute;inset:0;z-index:34;pointer-events:none;opacity:0;overflow:hidden;transition:opacity .12s linear}
.railMagRing,.railFireRing,.railAfterglowCore,.railFireStreak{position:absolute;left:50%;top:50%;pointer-events:none}
.railMagRing{width:20vmin;height:20vmin;border:1px solid rgba(173,226,255,.28);border-radius:50%;opacity:0;transform:translate(-50%,-50%);box-shadow:0 0 18px rgba(90,190,255,.18),inset 0 0 18px rgba(160,225,255,.08)}
.railMagRing.r2{width:31vmin;height:31vmin;border-style:dashed}.railMagRing.r3{width:43vmin;height:43vmin;border-color:rgba(110,195,255,.2)}
body.railCharging .railMagRing{opacity:.35;animation:railMagPulse 1.35s ease-in-out infinite}
body.railOverdrive .railMagRing{opacity:.82;border-color:rgba(220,245,255,.62);box-shadow:0 0 24px rgba(120,210,255,.5),inset 0 0 22px rgba(190,235,255,.2);animation-duration:.42s}
body.railOverdrive .railMagRing.r2{animation-direction:reverse}.railMagRing.r3{animation-delay:-.14s}
@keyframes railMagPulse{0%,100%{transform:translate(-50%,-50%) scale(.92) rotate(0deg);filter:brightness(.85)}50%{transform:translate(-50%,-50%) scale(1.04) rotate(18deg);filter:brightness(1.35)}}
.railFireRing{width:8vmin;height:8vmin;border:3px solid rgba(235,250,255,.98);border-radius:50%;opacity:0;transform:translate(-50%,-50%);box-shadow:0 0 28px #bfeaff,0 0 70px rgba(60,170,255,.75)}
body.railFire .railFireRing{animation:railShockRing .52s cubic-bezier(.1,.7,.2,1) forwards}
@keyframes railShockRing{0%{opacity:1;transform:translate(-50%,-50%) scale(.25)}45%{opacity:.9}100%{opacity:0;transform:translate(-50%,-50%) scale(10)}}
.railFireStreak{width:2px;height:11vmin;opacity:0;transform-origin:50% 0;background:linear-gradient(to bottom,rgba(255,255,255,.98),rgba(130,210,255,.6),rgba(80,160,255,0));box-shadow:0 0 9px #c8efff}
body.railFire .railFireStreak{animation:railStreakBurst .46s ease-out forwards;transform:rotate(var(--a)) translateY(-8vmin)}
@keyframes railStreakBurst{0%{opacity:0;height:2vmin;filter:brightness(2.2)}15%{opacity:1}100%{opacity:0;height:46vmin;filter:brightness(.8)}}
.railAfterglowCore{width:3vmin;height:3vmin;border-radius:50%;opacity:0;transform:translate(-50%,-50%);background:rgba(245,252,255,.95);box-shadow:0 0 24px #fff,0 0 64px #9bdcff,0 0 140px rgba(45,150,255,.85)}
body.railFire .railAfterglowCore{animation:railCoreFlash .34s ease-out forwards}
body.railAfterglow .railAfterglowCore{animation:railCoreAfter .9s ease-out forwards}
@keyframes railCoreFlash{0%{opacity:1;transform:translate(-50%,-50%) scale(2.8)}100%{opacity:.3;transform:translate(-50%,-50%) scale(.7)}}
@keyframes railCoreAfter{0%{opacity:.38;transform:translate(-50%,-50%) scale(1.2)}100%{opacity:0;transform:translate(-50%,-50%) scale(4.5)}}
body.railFire #railgunWarp{animation:railWarpPulse .52s ease-out!important;background:radial-gradient(circle at 50% 50%,rgba(245,252,255,.34) 0%,rgba(135,205,255,.18) 22%,rgba(40,110,200,.28) 62%,rgba(0,18,45,.12) 100%)!important}
body.railFire #c{animation:railWarpCanvas .52s cubic-bezier(.1,.7,.2,1)!important}
body.railOverdrive #railgunGaugeWrap{box-shadow:0 0 16px rgba(130,215,255,.55),0 0 22px rgba(70,160,255,.3) inset}
body.railOverdrive #railgunGaugeFill{filter:brightness(1.35);box-shadow:0 0 18px rgba(220,245,255,.95)}
body.railOverdrive #railgunStatus{color:#e9f8ff;text-shadow:0 0 10px #8fd8ff,1px 1px 0 #000}
@media (prefers-reduced-motion:reduce){.railMagRing,.railFireRing,.railFireStreak,.railAfterglowCore{animation-duration:.01s!important}}
`;
      document.head.appendChild(s);
    }
  },

  chargeStart(){
    this._clearClasses();
    this.phase='charging';
    document.body.classList.add('railCharging');
    this._els();
    if(this._gaugeFill)this._gaugeFill.style.width='0%';
    if(this._gaugePct)this._gaugePct.textContent='0%';
    if(this._fx)this._fx.style.opacity='.18';
  },
  chargeProgress(p){
    this._els();
    const v=Math.max(0,Math.min(1,p));
    const pct=Math.round(v*100);
    if(this._gaugeFill)this._gaugeFill.style.width=pct+'%';
    if(this._gaugePct)this._gaugePct.textContent=pct+'%';
    if(this._fx)this._fx.style.opacity=String(.12+v*.68);
    document.body.classList.toggle('railOverdrive',v>=.78);
  },
  chargeCancelled(){
    document.body.classList.remove('railCharging','railOverdrive');
    if(this._fx)this._fx.style.opacity='0';
    this.phase='idle';
  },
  charged(){
    const b=document.body;
    b.classList.remove('railCharging');
    b.classList.add('railOverdrive');
    b.classList.remove('railCharged');void b.offsetWidth;b.classList.add('railCharged');
    this._chargedT=.5;
  },
  fired(){
    this._ensureFx();
    const b=document.body;
    b.classList.remove('railFire','railAfterglow');void b.offsetWidth;
    b.classList.add('railFire','railAfterglow');
    if(this._fx)this._fx.style.opacity='1';
    this._fireT=.55;
    this._afterT=.9;
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
    this.phase='idle';this._chargedT=0;this._fireT=0;this._afterT=0;
    this._clearClasses();
    if(this._fx)this._fx.style.opacity='0';
    if(typeof audioMasterReset==='function')audioMasterReset();
  },
  update(dt){
    if(this._chargedT>0){this._chargedT-=dt;if(this._chargedT<=0)document.body.classList.remove('railCharged');}
    if(this._fireT>0){this._fireT-=dt;if(this._fireT<=0)document.body.classList.remove('railFire','railOverdrive');}
    if(this._afterT>0){this._afterT-=dt;if(this._afterT<=0){document.body.classList.remove('railAfterglow');if(this._fx)this._fx.style.opacity='0';}}
  },
  _clearClasses(){
    const b=document.body;
    for(const c of RAIL_SEQ_CLASSES)b.classList.remove(c);
  },
};

function railgunSeqAbort(){RailgunSequence.abort();}
