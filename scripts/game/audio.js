// ============================================================================
// jokura / audio.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、下記の順序で <script> として読み込まれ、すべて同一のグローバル
// スコープを共有する（元は単一の boot() 関数だったため、この順序と共有スコープが前提）。
// 読み込み順: state → achievements → crafting → save → ui → audio → world →
//             combat → entities → hud → input → main
// ============================================================================

// ═══ AUDIO ═══
// すべての音は audioMaster（マスターゲイン）経由で出力する。☢ ツァーリ・ボンバの
// 「着弾直前の静寂」で BGM・環境音・警告音をまとめて一瞬で落とすために必要で、
// 通常時は常に 1.0 なので既存の音量バランスには影響しない。
let audioCtx=null,audioMaster=null;
function initAudio(){
  if(!audioCtx){
    try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){return;}
    try{audioMaster=audioCtx.createGain();audioMaster.gain.value=1;audioMaster.connect(audioCtx.destination);}catch(e){audioMaster=null;}
  }
  // 'suspended' だけでなく 'interrupted'（iOS Safariで着信・他アプリ切替後などに
  // 遷移する状態）でも再開を試みないと、タップし続けても音が二度と戻らなくなる。
  if(audioCtx.state!=='running'&&audioCtx.state!=='closed'){
    try{audioCtx.resume().catch(()=>{});}catch(e){}
  }
}
// 全音の出口。マスターゲインを作れなかった環境では従来どおり destination へ直結する。
function audioOut(){return audioMaster||audioCtx.destination;}
// 全体音量を sec 秒かけて v へ落とす（v は 0 不可なので下限つき）
function audioDuckTo(v,sec){
  if(!audioCtx||!audioMaster)return;
  try{
    const t=audioCtx.currentTime,g=audioMaster.gain;
    g.cancelScheduledValues(t);g.setValueAtTime(Math.max(.0001,g.value),t);
    g.exponentialRampToValueAtTime(Math.max(.0001,v),t+Math.max(.02,sec||.15));
  }catch(e){}
}
// ダックを即座に解除して通常音量へ戻す（演出の中断・リセットでも必ず呼ぶ）
function audioMasterReset(){
  if(!audioCtx||!audioMaster)return;
  try{const t=audioCtx.currentTime,g=audioMaster.gain;g.cancelScheduledValues(t);g.setValueAtTime(1,t);}catch(e){}
}
function playTone(f,d,v,t){if(settings.sfxMuted)return;initAudio();if(!audioCtx||audioCtx.state!=='running')return;try{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=t||'square';o.frequency.value=f;g.gain.setValueAtTime(v||.1,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+(d||.1));o.connect(g);g.connect(audioOut());o.start();o.stop(audioCtx.currentTime+(d||.1));}catch(e){}}
const sfxHit=()=>playTone(220,.08,.12);
const sfxKill=()=>{playTone(440,.05,.15);setTimeout(()=>playTone(660,.1,.12),60);};
const sfxBreak=()=>playTone(160,.06,.08,'sawtooth');
const sfxPlace=()=>playTone(600,.04,.06,'sine');
const sfxDmg=()=>playTone(100,.15,.18,'sawtooth');
const sfxLava=()=>playTone(60,.25,.2,'sawtooth');
const sfxSnow=()=>playTone(300,.1,.08,'sine');
const sfxJump=()=>{playTone(300,.06,.06,'sine');setTimeout(()=>playTone(400,.04,.05,'sine'),40);};
const sfxWave=()=>{playTone(180,.3,.15);setTimeout(()=>playTone(120,.3,.12),200);};
const sfxBow=()=>{playTone(800,.12,.1,'triangle');setTimeout(()=>playTone(600,.06,.06,'triangle'),50);};
const sfxMagic=()=>{playTone(260,.35,.12,'sine');setTimeout(()=>playTone(520,.2,.08,'sine'),100);};
const sfxSword=()=>playTone(350,.08,.1,'sawtooth');
const sfxHammer=()=>{playTone(120,.15,.14,'sawtooth');setTimeout(()=>playTone(80,.1,.1,'square'),60);};
const sfxBossAppear=()=>{for(let i=0;i<4;i++)setTimeout(()=>playTone(80+i*30,.5,.25,'sawtooth'),i*150);};
const sfxBossDmg=()=>{playTone(60,.2,.3,'sawtooth');setTimeout(()=>playTone(90,.15,.2,'square'),80);};
const sfxBossDie=()=>{for(let i=0;i<6;i++)setTimeout(()=>{playTone(400-i*40,.3,.3,'sawtooth');playTone(200-i*20,.3,.2,'square');},i*120);};
const sfxCharge=()=>{playTone(150,.5,.2,'sawtooth');setTimeout(()=>playTone(300,.3,.15,'sawtooth'),200);};
const sfxDiamondStaff=()=>{playTone(2400,.1,.12,'sine');setTimeout(()=>playTone(3200,.07,.08,'sine'),70);setTimeout(()=>playTone(1800,.06,.06,'sine'),140);};
const sfxOink=()=>{playTone(350,.12,.08,'sine');setTimeout(()=>playTone(280,.1,.06,'sine'),80);};
const sfxEnterUnder=()=>{[400,300,220,160,100].forEach((f,i)=>setTimeout(()=>playTone(f,.18,.07,'sine'),i*90));};
const sfxExitUnder=()=>{[100,160,220,300,440].forEach((f,i)=>setTimeout(()=>playTone(f,.15,.06,'sine'),i*80));};
// ─── ☢ ツァーリ・ボンバ 起動シーケンス用（既存の Web Audio だけで生成する） ───
// 警告音: frac は 1(起爆まで遠い)→0(直前)。近づくほど高く・鋭くなる。
// 鳴らす間隔は tsar_bomba.js の fuse 側が短くしていく。
function sfxTsarAlarm(frac){
  const u=1-Math.max(0,Math.min(1,frac));
  playTone(300+u*300,.10,.085,'square');
  playTone(74,.16,.05,'sawtooth');
  setTimeout(()=>playTone(212+u*268,.09,.055,'square'),70);
}
// 静寂へ落ちる瞬間の「回線が切れた」音（この直後にマスターがダックされる）
function sfxTsarSignalLost(){playTone(1180,.05,.05,'sine');setTimeout(()=>playTone(300,.16,.04,'sine'),60);}
// 起爆の低音轟音。sfxThunder と同じくノイズ＋ローパスで作る（外部音源なし）。
function sfxTsarRumble(vol,dur){
  if(settings.sfxMuted)return;initAudio();if(!audioCtx||audioCtx.state!=='running')return;
  try{
    const d=Math.max(.4,dur||2.2),t0=audioCtx.currentTime,v=Math.max(.02,Math.min(.9,vol||.5));
    const buf=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*d),audioCtx.sampleRate);
    const data=buf.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const src=audioCtx.createBufferSource();src.buffer=buf;
    const lp=audioCtx.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(300,t0);lp.frequency.linearRampToValueAtTime(42,t0+d);lp.Q.value=.7;
    const g=audioCtx.createGain();
    g.gain.setValueAtTime(.0001,t0);
    g.gain.exponentialRampToValueAtTime(v,t0+.08);
    g.gain.exponentialRampToValueAtTime(v*.3,t0+d*.42);
    g.gain.exponentialRampToValueAtTime(.0001,t0+d);
    src.connect(lp);lp.connect(g);g.connect(audioOut());src.start();src.stop(t0+d);
  }catch(e){}
}

// ─── 🔱 LONGINUS 用（既存の Web Audio ノイズバッファ手法を流用） ───
// 降下音: 帯域を低→高へ持ち上げていく「降ってくる悲鳴」。tsar の轟音(低→低のまま
// 大きくなるだけ)とは逆に、周波数そのものが登っていくことで速度感を出す。
function sfxLonginusDescent(vol,dur){
  if(settings.sfxMuted)return;initAudio();if(!audioCtx||audioCtx.state!=='running')return;
  try{
    const d=Math.max(.3,dur||1.6),t0=audioCtx.currentTime,v=Math.max(.02,Math.min(.9,vol||.4));
    const buf=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*d),audioCtx.sampleRate);
    const data=buf.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const src=audioCtx.createBufferSource();src.buffer=buf;
    const bp=audioCtx.createBiquadFilter();bp.type='bandpass';bp.frequency.setValueAtTime(160,t0);bp.frequency.exponentialRampToValueAtTime(2200,t0+d);bp.Q.value=.9;
    const g=audioCtx.createGain();
    g.gain.setValueAtTime(.0001,t0);
    g.gain.exponentialRampToValueAtTime(v*.5,t0+d*.5);
    g.gain.exponentialRampToValueAtTime(v,t0+d*.94);
    g.gain.exponentialRampToValueAtTime(.0001,t0+d);
    src.connect(bp);bp.connect(g);g.connect(audioOut());src.start();src.stop(t0+d);
  }catch(e){}
}
// 着弾音: 甲高いクラック(縦に貫く一撃)＋低音の轟き(tsarRumbleを短く再利用)を重ねる
function sfxLonginusImpact(vol){
  if(settings.sfxMuted)return;initAudio();if(!audioCtx||audioCtx.state!=='running')return;
  const v=Math.max(.03,Math.min(.9,vol||.5));
  try{
    const d=.3,t0=audioCtx.currentTime;
    const buf=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*d),audioCtx.sampleRate);
    const data=buf.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const src=audioCtx.createBufferSource();src.buffer=buf;
    const hp=audioCtx.createBiquadFilter();hp.type='bandpass';hp.frequency.setValueAtTime(2600,t0);hp.frequency.exponentialRampToValueAtTime(180,t0+d);hp.Q.value=1.1;
    const g=audioCtx.createGain();g.gain.setValueAtTime(v,t0);g.gain.exponentialRampToValueAtTime(.0001,t0+d);
    src.connect(hp);hp.connect(g);g.connect(audioOut());src.start();src.stop(t0+d);
  }catch(e){}
  sfxTsarRumble(v*.85,1.6);
}

// ─── 🚀 超大型レールガン 用（既存のWeb Audioノイズ/オシレーター手法を流用） ───
// チャージ音: 徐々に音程が上がる「唸り」。tsarのように鳴らしっぱなしにできるよう
// オシレーターを保持し、発射/中断時に sfxRailgunChargeStop で確実に止める。
let _railChargeOscs=null,_railChargeGain=null;
function sfxRailgunChargeStart(dur){
  if(settings.sfxMuted)return;initAudio();if(!audioCtx||audioCtx.state!=='running')return;
  sfxRailgunChargeStop(true);
  try{
    const t0=audioCtx.currentTime,d=Math.max(.3,dur||3);
    const o1=audioCtx.createOscillator();o1.type='sawtooth';
    o1.frequency.setValueAtTime(85,t0);o1.frequency.exponentialRampToValueAtTime(920,t0+d);
    const o2=audioCtx.createOscillator();o2.type='sine';
    o2.frequency.setValueAtTime(170,t0);o2.frequency.exponentialRampToValueAtTime(1840,t0+d);
    const g=audioCtx.createGain();
    g.gain.setValueAtTime(.0001,t0);
    g.gain.exponentialRampToValueAtTime(.075,t0+d*.55);
    g.gain.exponentialRampToValueAtTime(.15,t0+d);
    o1.connect(g);o2.connect(g);g.connect(audioOut());
    o1.start();o2.start();
    _railChargeOscs=[o1,o2];_railChargeGain=g;
  }catch(e){}
}
function sfxRailgunChargeStop(fast){
  if(!_railChargeOscs)return;
  try{
    const t=audioCtx.currentTime,ramp=fast?.05:.12;
    _railChargeGain.gain.cancelScheduledValues(t);
    _railChargeGain.gain.setValueAtTime(Math.max(.0001,_railChargeGain.gain.value),t);
    _railChargeGain.gain.exponentialRampToValueAtTime(.0001,t+ramp);
    for(const o of _railChargeOscs)o.stop(t+ramp+.02);
  }catch(e){}
  _railChargeOscs=null;_railChargeGain=null;
}
// 発射音: 甲高い電気クラック(バチッ)の直後に低音の砲声(ドン)を重ねる
function sfxRailgunFire(vol){
  if(settings.sfxMuted)return;initAudio();if(!audioCtx||audioCtx.state!=='running')return;
  const v=Math.max(.03,Math.min(.9,vol||.6));
  try{
    const d=.11,t0=audioCtx.currentTime;
    const buf=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*d),audioCtx.sampleRate);
    const data=buf.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const src=audioCtx.createBufferSource();src.buffer=buf;
    const hp=audioCtx.createBiquadFilter();hp.type='highpass';hp.frequency.setValueAtTime(3400,t0);hp.Q.value=.9;
    const g=audioCtx.createGain();g.gain.setValueAtTime(v,t0);g.gain.exponentialRampToValueAtTime(.0001,t0+d);
    src.connect(hp);hp.connect(g);g.connect(audioOut());src.start();src.stop(t0+d);
  }catch(e){}
  setTimeout(()=>{playTone(66,.3,Math.min(.9,v*.95),'square');playTone(42,.42,Math.min(.9,v*.7),'sawtooth');},55);
}
// 遠くから返ってくる衝撃音（ゴゴゴゴ…）: tsarの轟音生成をそのまま再利用する
function sfxRailgunRumble(vol,dur){sfxTsarRumble(vol,dur);}

// ═══ BGM ═══
let bgmNodes=[],bgmSeqTimer=null,bgmBiome=-1,bgmBoss=false,bgmWave=false,bgmUnder=false,bgmUnderDragon=false;
function stopBgm(){stopSeq();bgmNodes.forEach(n=>{try{n.stop(audioCtx.currentTime+.05);}catch(e){}});bgmNodes=[];}
function stopSeq(){if(bgmSeqTimer){clearInterval(bgmSeqTimer);bgmSeqTimer=null;}}
function bgmOsc(freq,type,vol){if(settings.bgmMuted||!audioCtx||audioCtx.state!=='running')return null;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type||'sine';o.frequency.value=freq;g.gain.value=vol||.02;o.connect(g);g.connect(audioOut());o.start();bgmNodes.push(o);return o;}
function bgmNote(freq,dur,vol,type){if(settings.bgmMuted||!audioCtx||audioCtx.state!=='running')return;try{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type||'sine';o.frequency.value=freq;g.gain.setValueAtTime(vol||.04,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur);o.connect(g);g.connect(audioOut());o.start();o.stop(audioCtx.currentTime+dur);}catch(e){}}
function bgmSeq(notes,interval,vol,type){let i=0;bgmSeqTimer=setInterval(()=>{if(!audioCtx||audioCtx.state!=='running')return;const f=notes[i%notes.length];if(f>0)bgmNote(f,interval*.9/1000,vol,type);i++;},interval);}
function startBgm(m){
  if(settings.bgmMuted){stopBgm();return;}
  initAudio();stopBgm();if(!audioCtx||audioCtx.state!=='running')return;
  if(m==='boss'){bgmOsc(36,'sine',.022);bgmOsc(54,'triangle',.012);bgmSeq([36,0,36,41,0,33,36,0,36,0,41,36,0,36,0,0],170,.04,'triangle');}
  else if(m==='wave'){bgmOsc(55,'sine',.018);bgmOsc(82,'triangle',.01);bgmSeq([110,0,110,82,110,0,82,0],190,.035,'triangle');}
  else if(m===0){bgmOsc(55,'sine',.018);bgmOsc(110,'triangle',.012);bgmSeq([261,294,330,349,392,349,330,294],580,.028,'triangle');}
  else if(m===1){bgmOsc(41,'sine',.018);bgmOsc(82,'sine',.01);bgmSeq([196,0,0,220,0,174,0,0],880,.022,'sine');}
  else if(m===2){bgmOsc(65,'sine',.016);bgmOsc(130,'sine',.01);bgmSeq([261,311,392,466,392,311,261,233],490,.024,'sine');}
  else if(m===3){bgmOsc(49,'sine',.018);bgmOsc(98,'triangle',.01);bgmSeq([98,0,0,73,0,98,0,0],270,.032,'triangle');}
  else if(m===4){bgmOsc(36,'sine',.02);bgmOsc(54,'triangle',.012);bgmSeq([55,0,55,0,41,0,55,0,0,55,0,41,55,0,0,0],210,.035,'triangle');}
  else if(m===5){bgmOsc(65,'sine',.016);bgmOsc(130,'sine',.01);bgmSeq([261,0,311,0,261,0,233,0,261,0,294,0,261,0,0,0],650,.022,'sine');}
  else if(m===6){bgmOsc(48,'sine',.014);bgmOsc(96,'triangle',.008);bgmSeq([196,0,220,0,247,0,220,0],720,.018,'sine');}
  else if(m===7){bgmOsc(39,'sine',.016);bgmOsc(78,'sine',.008);bgmSeq([147,0,165,0,139,0,0,123],820,.018,'triangle');}
  else if(m===8){bgmOsc(52,'sine',.014);bgmOsc(104,'sine',.008);bgmSeq([262,330,392,494,392,330,294,0],610,.02,'sine');}
  else if(m==='under'){bgmOsc(29,'sine',.028);bgmOsc(43,'sine',.014);bgmOsc(58,'sine',.007);bgmSeq([55,0,0,0,0,49,0,0,0,0,55,0,0,41,0,0],750,.018,'sine');}
  else if(m==='under_dragon'){bgmOsc(24,'sine',.032);bgmOsc(36,'sawtooth',.01);bgmOsc(48,'triangle',.008);bgmSeq([36,0,36,0,33,0,36,0,29,0,0,0,36,0,33,29],220,.028,'sawtooth');}
}
function updateBgm(biome,isUnder){
  if(settings.bgmMuted){if(bgmNodes.length||bgmSeqTimer)stopBgm();return;}
  if(!audioCtx||audioCtx.state!=='running')return;
  // 地下ドラゴン戦が最優先
  if(isUnder&&dragon){if(!bgmUnderDragon){bgmUnderDragon=true;bgmUnder=false;bgmBoss=false;bgmWave=false;bgmBiome=-1;startBgm('under_dragon');}return;}
  if(bgmUnderDragon){bgmUnderDragon=false;bgmBiome=-1;}
  // 地上ボス戦
  if(boss&&!isUnder){if(!bgmBoss){bgmBoss=true;bgmUnder=false;bgmWave=false;bgmBiome=-1;startBgm('boss');}return;}
  if(bgmBoss){bgmBoss=false;bgmBiome=-1;}
  // 地下 ambient
  if(isUnder){if(!bgmUnder){bgmUnder=true;bgmWave=false;bgmBiome=-1;startBgm('under');}return;}
  if(bgmUnder){bgmUnder=false;bgmBiome=-1;}
  // 地上ウェーブ
  const waveActive=enemies.length>3;
  if(waveActive){if(!bgmWave){bgmWave=true;bgmBiome=-1;startBgm('wave');}return;}
  if(bgmWave){bgmWave=false;bgmBiome=-1;}
  if(biome!==bgmBiome){bgmBiome=biome;startBgm(biome);}
}

