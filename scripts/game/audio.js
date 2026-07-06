// ============================================================================
// jokura / audio.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、下記の順序で <script> として読み込まれ、すべて同一のグローバル
// スコープを共有する（元は単一の boot() 関数だったため、この順序と共有スコープが前提）。
// 読み込み順: state → achievements → crafting → save → ui → audio → world →
//             combat → entities → hud → input → main
// ============================================================================

// ═══ AUDIO ═══
let audioCtx=null;
function initAudio(){if(!audioCtx){try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){return;}}if(audioCtx.state==='suspended'){audioCtx.resume().catch(()=>{});}}
function playTone(f,d,v,t){if(settings.sfxMuted)return;initAudio();if(!audioCtx||audioCtx.state!=='running')return;try{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=t||'square';o.frequency.value=f;g.gain.setValueAtTime(v||.1,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+(d||.1));o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+(d||.1));}catch(e){}}
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
const sfxKillDragon=()=>{[500,600,700,800,1000,1300].forEach((f,i)=>setTimeout(()=>playTone(f,.35,.18,'sine'),i*100));setTimeout(()=>playTone(60,.8,.25,'sawtooth'),200);};

// ═══ BGM ═══
let bgmNodes=[],bgmSeqTimer=null,bgmBiome=-1,bgmBoss=false,bgmWave=false,bgmUnder=false,bgmUnderDragon=false;
function stopBgm(){stopSeq();bgmNodes.forEach(n=>{try{n.stop(audioCtx.currentTime+.05);}catch(e){}});bgmNodes=[];}
function stopSeq(){if(bgmSeqTimer){clearInterval(bgmSeqTimer);bgmSeqTimer=null;}}
function bgmOsc(freq,type,vol){if(settings.bgmMuted||!audioCtx||audioCtx.state!=='running')return null;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type||'sine';o.frequency.value=freq;g.gain.value=vol||.02;o.connect(g);g.connect(audioCtx.destination);o.start();bgmNodes.push(o);return o;}
function bgmNote(freq,dur,vol,type){if(settings.bgmMuted||!audioCtx||audioCtx.state!=='running')return;try{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type||'sine';o.frequency.value=freq;g.gain.setValueAtTime(vol||.04,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);}catch(e){}}
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

