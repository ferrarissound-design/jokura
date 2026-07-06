// ============================================================================
// jokura / hud.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、下記の順序で <script> として読み込まれ、すべて同一のグローバル
// スコープを共有する（元は単一の boot() 関数だったため、この順序と共有スコープが前提）。
// 読み込み順: state → achievements → crafting → save → ui → audio → world →
//             combat → entities → hud → input → main
// ============================================================================

// ═══ MEAT HUD ═══
function updateMeatHUD(){$meatLabel.textContent='🥩 MEAT: '+meat;if(meat>0)$eatBtn.classList.remove('disabled');else $eatBtn.classList.add('disabled');}
function eatMeat(){if(meat<=0||!gs.running)return;meat--;P.food=Math.min(100,P.food+40);P.hp=Math.min(P.maxHp,P.hp+10);gs.score+=MEAT_SCORE;updateMeatHUD();showBonus('\ud83c\udf56 \u6e80\u8179\u5ea6+40 HP+10  +'+MEAT_SCORE);playTone(700,.15,.1,'sine');setTimeout(()=>playTone(900,.1,.08,'sine'),100);}
let _eatBtnLastT=0;
function _onEatBtnTap(){const now=Date.now();if(now-_eatBtnLastT<100)return;_eatBtnLastT=now;eatMeat();}
bindTapSafe($eatBtn,_onEatBtnTap);

// ═══ GAME STATE ═══
const gs={running:false,score:0,kills:0,day:1,time:0,wave:0,nextWave:15,paused:false};
const DAY_DUR=90;
// ♾ エンドレスモード: WAVE20クリア後に選択可能。WAVEが無限に続き、
// 敵のHP/ダメージ/速度のスケーリングが上限緩和のまま伸び続ける。
// 5WAVEごとに既存ボスの強化版（EXボス）が出現する。
let endlessMode=false;
function makeEndlessBossDef(){
  const base=BOSS_DEFS[Math.floor(Math.random()*(BOSS_DEFS.length-1))]; // 最終ボスは除外
  const over=gs.wave-20;
  return{...base,wave:gs.wave,baseWave:base.wave,finalBoss:false,miniBoss:false,
    name:base.name+' EX',
    baseHp:Math.round(base.baseHp*(1+over*.12)),
    dmg:base.dmg+Math.floor(over*.7),
    score:base.score+over*100,
    diamondDrop:2+Math.floor(over/5)};
}
function startWave(){if(isCreative())return;gs.wave++;if(gs.wave>=5)unlockAchievement('wave5');if(gs.wave>=20)unlockAchievement('finalChallenge');if(endlessMode&&gs.wave>=25)unlockAchievement('endless25');if(endlessMode&&gs.wave>=30)unlockAchievement('endless30');let bossDef=BOSS_DEFS.find(b=>b.wave===gs.wave);if(!bossDef&&endlessMode&&gs.wave>20&&gs.wave%5===0)bossDef=makeEndlessBossDef();if(bossDef&&bossDef.finalBoss){finalBossPending=true;showAlert('⚠ 最終決戦の時… 地上へ戻れ！');playTone(80,.3,.6,'sawtooth');setTimeout(()=>{if(gs.running)playTone(120,.2,.4,'sawtooth');},400);gs.nextWave=DAY_DUR*3;}else if(bossDef&&bossDef.miniBoss){showAlert('⚡ MINI BOSS WAVE '+gs.wave+'!  '+bossDef.name);playTone(320,.2,.3,'sawtooth');setTimeout(()=>playTone(480,.15,.25,'sawtooth'),200);setTimeout(()=>{if(gs.running)spawnBoss(bossDef);},1200);const n=Math.min(4+gs.wave,10);for(let i=0;i<n;i++)setTimeout(()=>{if(gs.running)spawnEnemy();},600+i*350);gs.nextWave=Math.min(DAY_DUR*(.8+gs.wave*.04),DAY_DUR*1.1);}else if(bossDef){showAlert('👑 BOSS WAVE '+gs.wave+'!');sfxBossAppear();setTimeout(()=>{if(gs.running)spawnBoss(bossDef);},1500);const n=Math.min(2+gs.wave,6);for(let i=0;i<n;i++)setTimeout(()=>{if(gs.running)spawnEnemy();},500+i*400);gs.nextWave=Math.min(DAY_DUR*(.7+gs.wave*.05),DAY_DUR*1.2);}else{const n=Math.min(3+gs.wave*2,16);for(let i=0;i<n;i++)setTimeout(()=>{if(gs.running)spawnEnemy();},i*350);showAlert('⚠️ WAVE '+gs.wave+'  ('+n+'体)');sfxWave();gs.nextWave=Math.min(DAY_DUR*(.7+gs.wave*.05),DAY_DUR*1.2);}}

// ═══ HUD ═══
const $sv=document.getElementById('scoreVal'),$kv=document.getElementById('killVal'),$dv=document.getElementById('dayVal'),$di=document.getElementById('dayIcon'),$hf=document.getElementById('hpFill'),$wa=document.getElementById('waveAlert'),$df=document.getElementById('dmgFlash'),$bp=document.getElementById('bonusPopup'),$bl=document.getElementById('biomeLabel'),$cd=document.getElementById('coordsDisplay'),$wt=document.getElementById('waveTimer'),$goalLabel=document.getElementById('goalLabel'),$ff=document.getElementById('fdFill');
const $pauseBtn=document.getElementById('pauseBtn'),$pauseOverlay=document.getElementById('pauseOverlay');
const $resumeBtn=document.getElementById('resumeBtn'),$pauseSaveBtn=document.getElementById('pauseSaveBtn');
function togglePause(){
  if(!gs.running)return;
  gs.paused=!gs.paused;
  if(gs.paused){
    $pauseOverlay.classList.add('show');$pauseBtn.textContent='▶';
    if(audioCtx&&audioCtx.state==='running')audioCtx.suspend();
  }else{
    $pauseOverlay.classList.remove('show');$pauseBtn.textContent='⏸';
    lastT=performance.now();
    if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
  }
}
let waTimer=0,bpTimer=0;
const showAlert=t=>{$wa.textContent=t;$wa.classList.add('show');waTimer=2.5;};
const showBonus=t=>{$bp.textContent=t;$bp.classList.add('show');bpTimer=1.5;};
function dmgPlayer(v){if(isCreative())return;if(P.invT>0)return;let dmg=v*difficultyMult();if(armor){const def=ARMOR_DEFS[armor.tier];const blocked=dmg*def.cut;dmg-=blocked;armor.dur-=blocked;if(armor.dur<=0){armor=null;showAlert('🛡 鎧が壊れた！');playTone(280,.2,.15,'sawtooth');setTimeout(()=>playTone(180,.15,.12,'sawtooth'),140);}updateArmorHUD();}P.hp=Math.max(0,P.hp-dmg);P.invT=.8;if(settings.flash){$df.classList.add('on');setTimeout(()=>$df.classList.remove('on'),130);}sfxDmg();if(P.hp<=0)gameOver();}
function dmgLava(){if(isCreative())return;P.hp=Math.max(0,P.hp-8);if(settings.flash){$lavaFlash.classList.add('on');setTimeout(()=>$lavaFlash.classList.remove('on'),200);}sfxLava();if(P.hp<=0)gameOver();}
function dmgSnow(){if(isCreative())return;P.hp=Math.max(0,P.hp-3);if(settings.flash){$snowFlash.classList.add('on');setTimeout(()=>$snowFlash.classList.remove('on'),200);}sfxSnow();if(P.hp<=0)gameOver();}
function matProgress(mat,need){return (inv[mat]||0)+'/'+need;}
function getCurrentGoal(){
  if(!gs.running)return '🎯 NEW GAMEで冒険開始';
  if(isCreative())return isDesktop?'🪄 クリエイティブ：自由に建築！Space2回で飛行':'🪄 クリエイティブ：自由に建築！FLYで飛行';
  if(P.hp<=35&&meat>0)return '🍖 HPが低い！肉で回復しよう';
  if(!unlockedWeapons[1])return '🪵 木を集めて剣を作ろう WOOD '+matProgress('wood',5);
  if(!unlockedWeapons[2])return '🪨 石を集めてハンマー作成 STONE '+matProgress('stone',10)+' / WOOD '+matProgress('wood',4);
  if(bedCount===0&&beds.length===0)return '🛏 ベッドで夜をスキップ WOOD '+matProgress('wood',6)+' / GRASS '+matProgress('grass',4);
  if(!unlockedWeapons[3])return '🏹 弓を作って遠距離対策 WOOD '+matProgress('wood',3)+' / STONE '+matProgress('stone',3);
  if(!armor&&gs.wave>=3)return '🛡 鎧を作って防御を固めよう WOOD '+matProgress('wood',8)+' / GRASS '+matProgress('grass',4);
  if(farmPlots.length===0&&!achievements.firstHarvest)return '🌾 草から種を作り、畑で小麦を育てよう';
  if(!hasIronSword&&!hasDiamondSword&&inv.ironOre>0&&furnaces.length===0&&furnaceCount===0)return '🔥 かまど(🪨×12)を作って鉄を精錬しよう';
  if(!hasIronSword&&!hasDiamondSword&&inv.ironIngot>=3&&inv.wood>=1)return '🔩 鉄の剣を作ろう INGOT '+matProgress('ironIngot',3);
  if(inv.diamond===0&&!hasDiamondSword)return '💎 地下で鉄とダイヤを探そう（鉄は深さ13〜）';
  if(!hasDiamondSword)return '💎 ダイヤ剣を作ろう DIAMOND '+matProgress('diamond',3)+' / WOOD '+matProgress('wood',1);
  if(finalBossPending)return '⚠ 地上へ戻って最終決戦に備えよう';
  if(boss)return '👑 ボスを倒せ！攻撃後は距離を取ろう';
  if(dragon)return '💎 地下ドラゴン戦！ダイヤ武器が有効';
  if(endlessMode)return '♾ エンドレスWAVE'+gs.wave+'  どこまで生き残れるか！';
  if(gs.wave<5)return '⚔ WAVE5のボスまで生き残ろう 現在WAVE '+gs.wave;
  if(!achievements.firstEnchant&&hasDiamondSword&&gs.wave>=8)return '⚒ 強化台(🪨×15+💎×1)で武器を強化しよう';
  if(gs.wave<20)return '🌊 WAVE20まで装備と拠点を強化しよう 現在WAVE '+gs.wave;
  return '🏆 キングダイヤモンドドラゴンを倒してクリア！';
}
function updateGoalHUD(){if($goalLabel)$goalLabel.textContent=getCurrentGoal();}
function updateHUD(){
  $sv.textContent=gs.score;$kv.textContent=gs.kills;$dv.textContent='DAY '+gs.day;
  const pct=Math.max(0,Math.min(100,P.hp));$hf.style.width=pct+'%';
  $hf.style.background=pct>40?'linear-gradient(90deg,#43a047,#a5d6a7)':'linear-gradient(90deg,#e53935,#ff8a80)';
  const fpct=Math.max(0,Math.min(100,P.food));if($ff){$ff.style.width=fpct+'%';$ff.style.background=fpct>20?'linear-gradient(90deg,#e07f1f,#ffcf7f)':'linear-gradient(90deg,#b71c1c,#ff8a65)';}
  {const _wi=weatherIcon();$bl.textContent=getBiomeName(getBiome(Math.floor(P.x),Math.floor(P.z)))+(_wi?'  '+_wi:'');}
  $cd.textContent='X:'+Math.floor(P.x)+' Z:'+Math.floor(P.z);
  const w=WEAPONS[weaponIdx];
  const arrowIcon=weaponIdx===3&&arrowMode!=='normal'?(arrowMode==='fire'?'🔥':'🧊'):'';
  $wl.textContent=w.name+arrowIcon+enchSuffix()+(unlockedWeapons[weaponIdx]?'':'🔒');
  updateGoalHUD();updatePetHUD();
  const cdRatio=attackCD>0?attackCD/w.cd:0;$cdFill.style.width=(cdRatio*100)+'%';
  updateChestInfo();_updateTreasureInfo();
  const nextDef=BOSS_DEFS.find(b=>b.wave===gs.wave+1);
  let isBossNext=!!nextDef&&!nextDef.miniBoss;const isMiniBossNext=!!nextDef&&!!nextDef.miniBoss;
  if(endlessMode&&gs.wave>=20&&(gs.wave+1)%5===0)isBossNext=true; // エンドレスは5WAVEごとにEXボス
  if(gs.nextWave>0&&gs.nextWave<=10){
    const label=isBossNext?'👑 BOSS WAVE ':isMiniBossNext?'⚡ MINI BOSS ':'⚠️ WAVE ';
    $wt.textContent=label+(gs.wave+1)+' まで '+Math.ceil(gs.nextWave)+'秒';
    $wt.className='show'+(isBossNext||isMiniBossNext?' boss':'');
  }else{$wt.classList.remove('show');}
}

const miniCanvas=document.getElementById('miniCanvas');const miniCtx=miniCanvas.getContext('2d');
function drawMinimap(){const S=90;miniCtx.fillStyle='rgba(0,0,0,.75)';miniCtx.fillRect(0,0,S,S);const sc=1.2,cx=S/2,cy=S/2;for(let dx=-20;dx<=20;dx+=2)for(let dz=-20;dz<=20;dz+=2){const wx=Math.floor(P.x)+dx,wz=Math.floor(P.z)+dz,b=getBiome(wx,wz);miniCtx.fillStyle=['#3a7d3a','#c4a44a','#1b5e1b','#6a6a6a','#cc3300','#aaccee'][b];miniCtx.fillRect(cx+dx*sc-1,cy+dz*sc-1,3,3);}
  for(const mob of mobs){const mp=mob.root.position,mx2=cx+(mp.x-P.x)*sc,my2=cy+(mp.z-P.z)*sc;if(mx2>-2&&mx2<S+2&&my2>-2&&my2<S+2){miniCtx.fillStyle=mob.kind==='wolf'?'#b8c4d0':'#f4a9a8';miniCtx.fillRect(mx2-1.5,my2-1.5,3,3);}}
  if(pet){const petP=pet.root.position,ptx=cx+(petP.x-P.x)*sc,pty=cy+(petP.z-P.z)*sc;if(ptx>-2&&ptx<S+2&&pty>-2&&pty<S+2){miniCtx.fillStyle='#7fd4ff';miniCtx.fillRect(ptx-1.5,pty-1.5,3,3);}}
  if(horse&&!mounted){const hp3=horse.root.position,htx=cx+(hp3.x-P.x)*sc,hty=cy+(hp3.z-P.z)*sc;if(htx>-2&&htx<S+2&&hty>-2&&hty<S+2){miniCtx.fillStyle='#d9a066';miniCtx.fillRect(htx-1.5,hty-1.5,3,3);}}
  for(const e of enemies){const p=e.root.position,ex=cx+(p.x-P.x)*sc,ey=cy+(p.z-P.z)*sc;if(ex<-2||ex>S+2||ey<-2||ey>S+2)continue;miniCtx.fillStyle=e.type.lava?'#ff6600':e.type.ice?'#44ddff':e.type.name==='Skeleton'?'#eeeeff':e.type.name==='Golem'?'#4488ff':'#ff4444';miniCtx.fillRect(ex-1.5,ey-1.5,3,3);}
  if(boss){const p=boss.root.position,bx=cx+(p.x-P.x)*sc,by=cy+(p.z-P.z)*sc;if(bx>-5&&bx<S+5&&by>-5&&by<S+5){miniCtx.fillStyle='#ff0066';miniCtx.fillRect(bx-3,by-3,6,6);}}
  for(const it of items){const ix=cx+(it.x-P.x)*sc,iy=cy+(it.z-P.z)*sc;if(ix>-2&&ix<S+2&&iy>-2&&iy<S+2){miniCtx.fillStyle='#ffff00';miniCtx.fillRect(ix-1,iy-1,2,2);}}
  miniCtx.fillStyle='#44ff44';miniCtx.beginPath();miniCtx.arc(cx,cy,2.5,0,Math.PI*2);miniCtx.fill();
  const ddx=Math.sin(yaw)*7,ddy=-Math.cos(yaw)*7;miniCtx.strokeStyle='#44ff44';miniCtx.lineWidth=1.5;miniCtx.beginPath();miniCtx.moveTo(cx,cy);miniCtx.lineTo(cx+ddx,cy+ddy);miniCtx.stroke();
}

function updateUnderAtmosphere(py){
  const depth=-py;
  let fr,fg,fb,hi;
  if(depth<10){const t=depth/10;fr=0.04+t*0.01;fg=0.05+t*0.01;fb=0.10+t*0.02;hi=Math.max(0.12,0.35-t*0.15);}
  else if(depth<22){const t=(depth-10)/12;fr=0.05-t*0.03;fg=0.06-t*0.03;fb=0.12+t*0.01;hi=Math.max(0.06,0.20-t*0.10);}
  else{const t=Math.min(1,(depth-22)/10);fr=0.02;fg=0.03+t*0.03;fb=0.08+t*0.05;hi=Math.max(0.03,0.10-t*0.05);}
  scene.fog.color.setRGB(fr,fg,fb);renderer.setClearColor(scene.fog.color);
  hemLight.color.setRGB(fr*0.5,fg*0.6,fb*1.5);hemLight.intensity=hi;
  sun.intensity=Math.max(0.02,hi*0.35);
  scene.fog.near=depth>22?13:depth>10?16:19;
  scene.fog.far=depth>22?42:depth>10?52:58;
}
let WEATHER_DIM=0; // 0 clear .. ~0.5 storm; darkens sky/fog/light (visual only)
function updateSky(t,inVolcano,inSnow){const b=.5-.5*Math.cos((t-.15)*Math.PI*2);
// sunrise/sunset glow: peaks when the sun crosses the horizon (dayT 0 and 0.5)
const _dT=(t+0.1)%1;const _edge=Math.min(_dT,Math.abs(_dT-.5),1-_dT);const glow=Math.max(0,1-_edge/0.07);
if(inVolcano){skyMesh.material.color.setRGB(.18+b*.05,.04,.02);scene.fog.color.setRGB(.22,.05,.02);renderer.setClearColor(scene.fog.color);sun.color.setHex(0xff6600);sun.intensity=Math.max(.3,.8-.4*b);hemLight.color.setHex(0xff3300);hemLight.intensity=.5;}else if(inSnow){skyMesh.material.color.setRGB(Math.max(.15,.55-.3*b),Math.max(.18,.65-.35*b),Math.max(.22,.8-.4*b));scene.fog.color.setRGB(Math.max(.2,.6-.3*b),Math.max(.22,.68-.35*b),Math.max(.25,.82-.4*b));renderer.setClearColor(scene.fog.color);sun.color.setHex(0xaaccff);sun.intensity=Math.max(.2,.7-.4*b);hemLight.color.setHex(0xaaddff);hemLight.intensity=Math.max(.2,.7-.4*b);}else{
  let sr=Math.max(.02,.45-.43*b),sg=Math.max(.03,.70-.66*b),sb=Math.max(.05,.98-.92*b);
  let fr=Math.max(.04,.55-.49*b),fg=Math.max(.04,.73-.67*b),fb=Math.max(.06,.93-.85*b);
  const gm=glow*.55; // mix toward warm orange at dawn/dusk
  sr=sr*(1-gm)+1.0*gm;sg=sg*(1-gm)+.45*gm;sb=sb*(1-gm)+.20*gm;
  fr=fr*(1-gm)+1.0*gm;fg=fg*(1-gm)+.52*gm;fb=fb*(1-gm)+.26*gm;
  skyMesh.material.color.setRGB(sr,sg,sb);scene.fog.color.setRGB(fr,fg,fb);renderer.setClearColor(scene.fog.color);
  sun.color.setRGB(1,1-glow*.35,1-glow*.6);sun.intensity=Math.max(.05,1-.95*b);
  hemLight.color.setHex(0xbfdcff);hemLight.intensity=Math.max(.1,.95-.82*b);
}
// storm darkening (visual only): pull light down and desaturate sky/fog toward grey
if(WEATHER_DIM>0.01&&!inVolcano){
  const k=1-WEATHER_DIM*0.7;
  sun.intensity*=1-WEATHER_DIM*0.85;
  hemLight.intensity=Math.max(.12,hemLight.intensity*(1-WEATHER_DIM*0.5));
  scene.fog.color.multiplyScalar(k);skyMesh.material.color.multiplyScalar(k);
  renderer.setClearColor(scene.fog.color);
}
$di.textContent=b>.5?'🌙':'☀️';}

// ─── CELESTIAL: sun/moon orbit, drifting clouds, sky follows player ───
function updateCelestial(t,dt){
  const px=P.x,py=P.y,pz=P.z;
  skyMesh.position.set(px,py,pz);
  // sunrise t=0.9, noon t=0.15, sunset t=0.4; night 0.4-0.9
  const dayT=(t+0.1)%1;
  const isDayNow=dayT<0.5;
  const sunA=Math.PI*Math.min(1,dayT/0.5);
  const moonA=Math.PI*Math.max(0,Math.min(1,(t-0.4)/0.5));
  const sunDir={x:Math.cos(sunA)*.85,y:Math.sin(sunA)+.04,z:.35};
  const moonDir={x:Math.cos(moonA)*.85,y:Math.sin(moonA)+.04,z:-.3};
  const d=isDayNow?sunDir:moonDir;
  const dl=Math.hypot(d.x,d.y,d.z);
  // snap the light anchor to whole blocks to reduce shadow shimmer while walking
  const ax=Math.round(px),ay=Math.round(py),az=Math.round(pz);
  sun.position.set(ax+d.x/dl*60,ay+Math.max(.15,d.y)/dl*60,az+d.z/dl*60);
  sun.target.position.set(ax,ay,az);
  sunSprite.position.set(px+sunDir.x*96,py+sunDir.y*90,pz+sunDir.z*96);
  moonSprite.position.set(px+moonDir.x*96,py+moonDir.y*90,pz+moonDir.z*96);
  const skyVis=skyMesh.visible;
  sunSprite.visible=skyVis&&isDayNow&&sunDir.y>.02;
  moonSprite.visible=skyVis&&!isDayNow&&moonDir.y>.02;
  cloudGroup.visible=skyVis;
  sun.castShadow=SHADOWS_ON&&skyVis;
  starPivot.position.set(px,py,pz);
  starPivot.rotation.z=-dayT*Math.PI*.5;
  starPivot.visible=skyVis;
  if(skyVis){
    const b=.5-.5*Math.cos((t-.15)*Math.PI*2); // same brightness curve as updateSky
    starMat.opacity=Math.max(0,Math.min(1,(b-.55)*3))*.9; // fade in after dusk
    const cb=Math.max(.25,1-b*.8);
    cloudMat.color.setRGB(cb,cb,Math.min(1,cb+.02));
    for(const cl of cloudGroup.children){
      cl.position.x+=dt*1.4;
      if(cl.position.x-px>CLOUD_RANGE)cl.position.x-=CLOUD_RANGE*2;
      else if(px-cl.position.x>CLOUD_RANGE)cl.position.x+=CLOUD_RANGE*2;
      if(cl.position.z-pz>CLOUD_RANGE)cl.position.z-=CLOUD_RANGE*2;
      else if(pz-cl.position.z>CLOUD_RANGE)cl.position.z+=CLOUD_RANGE*2;
    }
  }
}

// ─── WEATHER STATE ───
// 天気は見た目/音だけでなく以下のゲームプレイに接続する:
//  雨・雷雨(屋外時): 炎上(DoT)の消化が早まる(weatherWet)
//  吹雪(雪原+雷雨tier): 移動速度低下・満腹度消費増加・寒冷ダメージ間隔短縮(blizzard)
//  雷雨: 落雷が予告付きでプレイヤー/敵/ボスにダメージを与えることがある
let weather=0;              // 0 clear, 1 rain, 2 thunderstorm
let weatherT=45+Math.random()*60;
let LIGHTNING=0,lightningT=6;
let weatherWet=false;  // 屋外で雨/雷雨が降っている（炎上ダメージ減衰に使用）
let blizzard=false;    // 雪原での吹雪（移動速度・満腹度・寒冷ダメージに影響）
const $lightning=document.getElementById('lightning');
function weatherIcon(){return weather===2?'⛈':weather===1?'🌧':'';}
function setWeather(w){
  weather=w;
  weatherT=w===0?(55+Math.random()*70):w===1?(42+Math.random()*48):(26+Math.random()*30);
}
function resetWeather(){weather=0;weatherT=45+Math.random()*60;LIGHTNING=0;lightningT=6;WEATHER_DIM=0;weatherWet=false;blizzard=false;
  for(const grp of[rainGroup,snowGroup]){grp.visible=false;grp.userData.mat.opacity=0;}
  clearLightningStrikes();}
function sfxThunder(){
  if(settings.sfxMuted)return;initAudio();if(!audioCtx||audioCtx.state!=='running')return;
  try{
    const dur=1.1+Math.random()*0.9,t0=audioCtx.currentTime;
    const buf=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*dur),audioCtx.sampleRate);
    const data=buf.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const src=audioCtx.createBufferSource();src.buffer=buf;
    const lp=audioCtx.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(240,t0);lp.frequency.linearRampToValueAtTime(70,t0+dur);lp.Q.value=.6;
    const g=audioCtx.createGain();
    g.gain.setValueAtTime(0.0001,t0);
    g.gain.exponentialRampToValueAtTime(0.5,t0+0.05);
    g.gain.exponentialRampToValueAtTime(0.16,t0+0.35);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    src.connect(lp);lp.connect(g);g.connect(audioCtx.destination);src.start();src.stop(t0+dur);
    playTone(85,.2,.22,'sawtooth'); // initial crack
  }catch(e){}
}
function triggerLightning(){
  LIGHTNING=2.0; // additive light flash, decays in updateWeather
  if(settings.flash&&$lightning){$lightning.classList.add('on');setTimeout(()=>$lightning&&$lightning.classList.remove('on'),120);}
  setTimeout(sfxThunder,300+Math.random()*1500); // thunder trails the flash
}
function _updatePrecip(grp,on,cx,cy,cz,nowSec,speed,maxOp,dt){
  const mat=grp.userData.mat,u=grp.userData.u;
  mat.opacity+=((on?maxOp:0)-mat.opacity)*Math.min(1,dt*2.2);
  grp.visible=mat.opacity>0.01;
  if(!grp.visible)return;
  grp.position.set(cx,cy,cz);
  if(u){u.uTime.value=nowSec;u.uSpeed.value=speed;}
}
function updateWeather(dt,inVolcano,inSnow,isUnder,nowSec){
  weatherT-=dt;
  if(weatherT<=0){
    if(weather===0)setWeather(Math.random()<0.7?1:2);else setWeather(0);
    if(weather===2)showAlert('⛈ 雷雨がやってきた');
    else if(weather===1)showAlert('🌧 雨が降り出した');
  }
  const active=weather>=1&&!isUnder&&!inVolcano;
  weatherWet=active; // 屋外の雨/雷雨: 炎上の消化を早める（updateBoss/敵ループで参照）
  const dimTarget=isUnder||inVolcano?0:(weather===2?0.5:weather===1?0.2:0);
  WEATHER_DIM+=(dimTarget-WEATHER_DIM)*Math.min(1,dt*1.4);
  const gy=P.y-6;
  _updatePrecip(rainGroup,active&&!inSnow,P.x,gy,P.z,nowSec,weather===2?17:13,weather===2?.6:.45,dt);
  // 吹雪(雪原+雷雨tier)はより濃く速い降雪にして視覚的にも危険を伝える
  _updatePrecip(snowGroup,active&&inSnow,P.x,gy,P.z,nowSec,weather===2?4.4:2.6,weather===2?.95:.75,dt);
  const wasBlizzard=blizzard;
  blizzard=active&&inSnow&&weather===2;
  if(blizzard&&!wasBlizzard&&!isCreative())showAlert('❄ 吹雪だ！動きが鈍り満腹度も早く減る');
  if(weather===2&&!isUnder){lightningT-=dt;if(lightningT<=0){lightningT=4+Math.random()*9;triggerLightning();if(!inVolcano)maybeSpawnLightningStrike();}}
  if(LIGHTNING>0){LIGHTNING=Math.max(0,LIGHTNING-dt*5);hemLight.intensity+=LIGHTNING;} // applied after updateSky this frame
  updateLightningStrikes(dt);
}

// ─── 落雷（雷雨中、予告付きでダメージを与える環境ハザード） ───
// 警告(warnT)の間はビームとリングが徐々に濃くなり、逃げる猶予を与える。
// 経過後にプレイヤー/敵/ボスへ水平距離判定でダメージを与える（他のAoE攻撃と同じ判定方式）。
let lightningStrikes=[]; // {mesh,ring,x,z,warnT,totalWarn}
const _strikeBeamGeo=new THREE.CylinderGeometry(.05,.05,34,6);
const _strikeRingGeo=new THREE.RingGeometry(.5,.9,16);
function maybeSpawnLightningStrike(){
  if(isCreative()||!gs.running)return;
  let tx,tz;
  const nearby=[];
  for(const e of enemies){const d=Math.hypot(e.root.position.x-P.x,e.root.position.z-P.z);if(d<16)nearby.push(e.root.position);}
  if(boss){const d=Math.hypot(boss.root.position.x-P.x,boss.root.position.z-P.z);if(d<16)nearby.push(boss.root.position);}
  if(nearby.length&&Math.random()<0.55){
    const t=nearby[Math.floor(Math.random()*nearby.length)];tx=t.x;tz=t.z;
  }else if(Math.random()<0.45){
    tx=P.x;tz=P.z; // プレイヤー自身を狙う（警告時間中に逃げれば回避できる）
  }else{
    const ang=Math.random()*Math.PI*2,dist=6+Math.random()*8;
    tx=P.x+Math.cos(ang)*dist;tz=P.z+Math.sin(ang)*dist;
  }
  const gy=getHeight(Math.floor(tx),Math.floor(tz));
  const mat=new THREE.MeshBasicMaterial({color:0xeaf6ff,transparent:true,opacity:0});
  const mesh=new THREE.Mesh(_strikeBeamGeo,mat);
  mesh.position.set(tx,gy+17,tz);scene.add(mesh);
  const ringMat=new THREE.MeshBasicMaterial({color:0xeaf6ff,transparent:true,opacity:0,side:THREE.DoubleSide});
  const ring=new THREE.Mesh(_strikeRingGeo,ringMat);
  ring.rotation.x=-Math.PI/2;ring.position.set(tx,gy+.05,tz);scene.add(ring);
  lightningStrikes.push({mesh,ring,x:tx,z:tz,warnT:0.9,totalWarn:0.9});
  playTone(1400,.15,.06,'sine'); // 落雷予告の高音（雷鳴とは別音）
}
function _resolveLightningStrike(s){
  const gy=getHeight(Math.floor(s.x),Math.floor(s.z));
  spawnParticles(s.x,gy+1,s.z,0xeaf6ff,8);
  sfxThunder();
  const R=2.6;
  if(Math.hypot(s.x-P.x,s.z-P.z)<R){
    dmgPlayer(14);
    if(P.hp>0)unlockAchievement('thunderStruck');
  }
  if(boss){const bp=boss.root.position;if(Math.hypot(s.x-bp.x,s.z-bp.z)<R*boss.sc)hitBoss(10);}
  for(const en of[...enemies]){const ep=en.root.position;if(Math.hypot(s.x-ep.x,s.z-ep.z)<R)hitEnemy(en,8);}
}
function updateLightningStrikes(dt){
  for(let i=lightningStrikes.length-1;i>=0;i--){
    const s=lightningStrikes[i];
    s.warnT-=dt;
    const p=Math.max(0,1-s.warnT/s.totalWarn);
    s.mesh.material.opacity=p*0.55;
    s.ring.material.opacity=p*0.6;
    s.ring.scale.setScalar(1+p*.3);
    if(s.warnT<=0){
      _resolveLightningStrike(s);
      scene.remove(s.mesh);s.mesh.material.dispose();
      scene.remove(s.ring);s.ring.material.dispose();
      lightningStrikes.splice(i,1);
    }
  }
}
function clearLightningStrikes(){
  for(const s of lightningStrikes){scene.remove(s.mesh);s.mesh.material.dispose();scene.remove(s.ring);s.ring.material.dispose();}
  lightningStrikes.length=0;
}

// ─── TARGET BLOCK OUTLINE (Minecraft-style block cursor) ───
const cursorBox=new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002,1.002,1.002)),
  new THREE.LineBasicMaterial({color:0x000000,transparent:true,opacity:.55}));
cursorBox.visible=false;scene.add(cursorBox);
// ─── BLOCK DAMAGE / CRACK OVERLAY (Minecraft destroy-stages) ───
const CRACK_STAGES=6;
function makeCrackTextures(){
  const S=16,texs=[];const rng=_rng(4242);
  // pre-generate a few jagged crack polylines; each appears at a threshold
  const lines=[];
  for(let b=0;b<7;b++){
    let px=2+rng()*(S-4),py=2+rng()*(S-4);const pts=[[px,py]];
    const segN=3+Math.floor(rng()*4);let ang=rng()*Math.PI*2;
    for(let s=0;s<segN;s++){ang+=rng()*1.4-.7;px+=Math.cos(ang)*(2+rng()*2);py+=Math.sin(ang)*(2+rng()*2);pts.push([px,py]);}
    lines.push({pts,order:b/7});
  }
  for(let st=0;st<CRACK_STAGES;st++){
    const c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d');
    const frac=(st+1)/CRACK_STAGES;
    x.strokeStyle='rgba(0,0,0,.62)';x.lineWidth=1;x.lineCap='round';
    for(const ln of lines){if(ln.order>frac)continue;x.beginPath();x.moveTo(ln.pts[0][0],ln.pts[0][1]);for(let i=1;i<ln.pts.length;i++)x.lineTo(ln.pts[i][0],ln.pts[i][1]);x.stroke();}
    if(st>=3){x.fillStyle='rgba(0,0,0,.32)';for(let i=0;i<st*3;i++)x.fillRect((rng()*S)|0,(rng()*S)|0,1,1);}
    const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;texs.push(t);
  }
  return texs;
}
const crackTex=makeCrackTextures();
const crackMat=new THREE.MeshBasicMaterial({map:crackTex[0],transparent:true,opacity:.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,fog:false});
const crackMesh=new THREE.Mesh(new THREE.BoxGeometry(1.012,1.012,1.012),crackMat);
crackMesh.visible=false;crackMesh.renderOrder=3;scene.add(crackMesh);
let miningKey='',miningProgress=0,miningLastT=0;
function resetMining(){miningKey='';miningProgress=0;crackMesh.visible=false;}
// hammer is the pickaxe (fast miner); diamond hammer faster; sword/magic middling
function weaponMinePower(){if(weaponIdx===2)return hasDiamondHammer?6:4;if(weaponIdx===1)return 1.5;if(weaponIdx===4)return 2;return 1;}
function mineBlock(bh){
  const d=bh;if(d.ti===WATER_BLOCK)return;
  if(isCreative()){breakBlock(bh);sfxBreak();resetMining();return;} // creative: instant break (even lava rock)
  const hard=BLOCK_HARDNESS[d.ti]!==undefined?BLOCK_HARDNESS[d.ti]:99;
  const now=performance.now()/1000;
  if(hard>=99){playTone(90,.06,.05,'square');resetMining();return;} // unbreakable: dull thud
  const key=vKey(d.x,d.y,d.z);
  if(miningKey!==key){miningKey=key;miningProgress=0;}
  miningProgress+=weaponMinePower()/hard;
  miningLastT=now;
  if(miningProgress>=0.999){breakBlock(bh);sfxBreak();resetMining();}
  else{
    const stage=Math.min(CRACK_STAGES-1,Math.floor(miningProgress*CRACK_STAGES));
    crackMat.map=crackTex[stage];crackMat.needsUpdate=true;
    crackMesh.position.set(d.x+.5,d.y+.5,d.z+.5);crackMesh.visible=true;
    spawnParticles(d.x+.5,d.y+.5,d.z+.5,BLOCK_COLORS[d.ti],1);
    playTone(150+miningProgress*130,.05,.03,'square');
  }
}
const _cd=new THREE.Vector3();
// grid walk (DDA) through the voxel map — much cheaper than raycasting every mesh
function ddaTargetVoxel(maxD){
  camera.getWorldDirection(_cd);
  const ox=camera.position.x,oy=camera.position.y,oz=camera.position.z;
  let x=Math.floor(ox),y=Math.floor(oy),z=Math.floor(oz);
  const stepX=_cd.x>0?1:-1,stepY=_cd.y>0?1:-1,stepZ=_cd.z>0?1:-1;
  const tDx=Math.abs(1/(_cd.x||1e-9)),tDy=Math.abs(1/(_cd.y||1e-9)),tDz=Math.abs(1/(_cd.z||1e-9));
  let tMx=(_cd.x>0?(x+1-ox):(ox-x))*tDx;
  let tMy=(_cd.y>0?(y+1-oy):(oy-y))*tDy;
  let tMz=(_cd.z>0?(z+1-oz):(oz-z))*tDz;
  let t=0;
  while(t<=maxD){
    const v=voxels[vKey(x,y,z)];
    if(v&&v.active&&v.ti!==WATER_BLOCK)return{x,y,z};
    if(tMx<tMy&&tMx<tMz){t=tMx;tMx+=tDx;x+=stepX;}
    else if(tMy<tMz){t=tMy;tMy+=tDy;y+=stepY;}
    else{t=tMz;tMz+=tDz;z+=stepZ;}
  }
  return null;
}
function updateBlockCursor(){
  const hit=gs.running&&!gs.paused?ddaTargetVoxel(7):null;
  if(hit){cursorBox.position.set(hit.x+.5,hit.y+.5,hit.z+.5);cursorBox.visible=true;}
  else cursorBox.visible=false;
}

// ─── FIRST-PERSON HAND & HELD ITEM (Minecraft-style) ───
scene.add(camera); // so meshes attached to the camera get rendered
const handGroup=new THREE.Group();
handGroup.position.set(.44,-.4,-.7);
handGroup.visible=false;
camera.add(handGroup);
function _hmat(color,extra){
  const m=new THREE.MeshStandardMaterial(Object.assign({color,roughness:.8,metalness:.1},extra||{}));
  m.depthTest=false; // always draw over the world, like Minecraft's hand
  return m;
}
function _hmesh(geo,mat,x,y,z){const m=new THREE.Mesh(geo,mat);m.position.set(x||0,y||0,z||0);m.renderOrder=1000;m.frustumCulled=false;return m;}
function _hbox(w,h,d,mat,x,y,z){return _hmesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z);}
const armMesh=_hbox(.14,.14,.42,_hmat(0xd8a274),.02,-.05,.13);
armMesh.rotation.set(.25,-.15,0);
handGroup.add(armMesh);
let heldRoot=null,heldKey='';
function _buildHeld(){
  const root=new THREE.Group();
  if(weaponIdx===1){ // sword
    const blade=_hmat(hasDiamondSword?0x59e0ff:0xcfd6dd,hasDiamondSword?{emissive:0x1188aa,emissiveIntensity:.5}:null);
    root.add(_hbox(.05,.11,.05,_hmat(0x6b4a2f),0,-.1,0));   // grip
    root.add(_hbox(.15,.035,.05,_hmat(0x9a7a4f),0,-.03,0)); // guard
    root.add(_hbox(.055,.42,.028,blade,0,.2,0));            // blade
    root.rotation.set(-.5,.15,-.25);
  }else if(weaponIdx===2){ // hammer
    const head=_hmat(hasDiamondHammer?0x59e0ff:0x8a8f98,hasDiamondHammer?{emissive:0x1188aa,emissiveIntensity:.4}:null);
    root.add(_hbox(.05,.44,.05,_hmat(0x6b4a2f),0,.03,0));
    root.add(_hbox(.24,.13,.13,head,0,.28,0));
    root.rotation.set(-.5,.1,-.2);
  }else if(weaponIdx===3){ // bow
    const wood=_hmat(hasDiamondBow?0x2fbbd8:0x6b4a2f);
    root.add(_hbox(.04,.2,.05,wood,0,.17,.045));
    root.add(_hbox(.04,.16,.05,wood,0,0,0));
    root.add(_hbox(.04,.2,.05,wood,0,-.17,.045));
    root.add(_hbox(.012,.5,.012,_hmat(0xeeeeee),0,0,.09)); // string
    root.rotation.set(0,-.5,-.15);
  }else if(weaponIdx===4){ // magic
    root.add(_hbox(.045,.4,.045,_hmat(0x4a2c66),0,.05,0));
    root.add(_hmesh(new THREE.OctahedronGeometry(.075,0),_hmat(0xff66ff,{emissive:0xaa22aa,emissiveIntensity:.8}),0,.3,0));
    root.rotation.set(-.4,0,-.15);
  }else if(weaponIdx===5){ // diamond staff
    root.add(_hbox(.045,.46,.045,_hmat(0x1b3a4a),0,.05,0));
    root.add(_hmesh(new THREE.OctahedronGeometry(.085,0),_hmat(0x88ffff,{emissive:0x00ccee,emissiveIntensity:1.2}),0,.33,0));
    root.rotation.set(-.4,0,-.15);
  } // fist: arm only
  root.position.set(0,.03,-.07);
  return root;
}
function _refreshHeld(){
  const key=weaponIdx+'|'+WEAPONS[weaponIdx].name;
  if(key===heldKey)return;
  heldKey=key;
  if(heldRoot){handGroup.remove(heldRoot);heldRoot.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}
  heldRoot=_buildHeld();handGroup.add(heldRoot);
}
let handT=0,walkPhase=0,swingT=0,_lastStep=0;
function triggerHandSwing(){swingT=1;}
// ─── OFFHAND: selected hotbar block shown in the left hand ───
const offhandGroup=new THREE.Group();
offhandGroup.visible=false;
camera.add(offhandGroup);
const _offGeo=new THREE.BoxGeometry(.34,.34,.34);
_offGeo.setAttribute('color',boxGeo.getAttribute('color')); // reuse face shading (same 24-vert layout)
const _offMatCache={};
function _offMatsFor(ti){
  if(_offMatCache[ti])return _offMatCache[ti];
  // clone world materials so depthTest can be disabled without affecting blocks
  const mk=m=>{const c=m.clone();c.depthTest=false;return c;};
  const src=blockMats[ti];
  const mats=Array.isArray(src)?src.map(mk):mk(src);
  _offMatCache[ti]=mats;return mats;
}
// half-height / stepped preview geometries for the new partial blocks
const _slabOffGeo=new THREE.BoxGeometry(.34,.17,.34);
_slabOffGeo.setAttribute('color',boxGeo.getAttribute('color'));
const _stairOffBaseGeo=new THREE.BoxGeometry(.34,.17,.34);
_stairOffBaseGeo.setAttribute('color',boxGeo.getAttribute('color'));
const _stairOffTopGeo=new THREE.BoxGeometry(.17,.17,.34);
_stairOffTopGeo.setAttribute('color',boxGeo.getAttribute('color'));
let _offMesh=null,_offType=-1;
function _refreshOffhand(){
  if(_offType===curType&&_offMesh)return;
  _offType=curType;
  if(_offMesh)offhandGroup.remove(_offMesh); // geometry/materials are cached, don't dispose
  const ti=SLOT_TI[curType];
  if(ti===STAIR_BLOCK){
    _offMesh=new THREE.Group();
    const base=new THREE.Mesh(_stairOffBaseGeo,_offMatsFor(ti));base.position.y=-.085;
    const top=new THREE.Mesh(_stairOffTopGeo,_offMatsFor(ti));top.position.set(.085,.085,0);
    for(const m of[base,top]){m.renderOrder=1000;m.frustumCulled=false;}
    _offMesh.add(base,top);
  }else{
    _offMesh=new THREE.Mesh(ti===TORCH_BLOCK?torchGeo:ti===SLAB_BLOCK?_slabOffGeo:_offGeo,_offMatsFor(ti));
  }
  _offMesh.renderOrder=1000;_offMesh.frustumCulled=false;
  _offMesh.rotation.set(ti===TORCH_BLOCK?.15:.35,.75,ti===TORCH_BLOCK?-.2:0);
  _offMesh.scale.setScalar(ti===TORCH_BLOCK?.55:1); // torch is a tall stick; shrink to hand size
  offhandGroup.add(_offMesh);
}
let placeSwingT=0;
function triggerPlaceSwing(){placeSwingT=1;}
// per-material footsteps: soft grass, dull sand/snow, knocky wood, clicky stone
const FOOT_TONE={0:[150,'triangle'],5:[150,'triangle'],2:[105,'triangle'],[SNOW_BLOCK]:[95,'triangle'],3:[190,'square'],[CAVE_DIRT]:[130,'triangle']};
function playFootstep(){
  const under=voxels[vKey(Math.floor(P.x),Math.floor(P.y-.06),Math.floor(P.z))];
  if(!under||!under.active)return;
  const def=FOOT_TONE[under.ti]||[240,'square']; // stone-ish default
  playTone(def[0]+Math.random()*40-20,.05,.022,def[1]);
}
function updateHand(dt,moving,sprinting){
  handGroup.visible=gs.running;
  if(!gs.running)return;
  _refreshHeld();
  handT+=dt;
  if(moving&&P.onGround)walkPhase+=dt*(sprinting?11:8);
  const bobOn=settings.bob!==false;
  const wb=(moving&&P.onGround&&bobOn)?1:0;
  const sway=Math.sin(handT*1.6)*.006; // idle breathing
  // keep the hand on-screen for any aspect ratio (portrait phones have a narrow FOV)
  const hw=Math.tan(camera.fov*Math.PI/360)*.7*camera.aspect;
  const hx=Math.min(.5,Math.max(.15,hw*.62));
  handGroup.position.set(
    hx+Math.sin(walkPhase)*.028*wb,
    -.4+sway-Math.abs(Math.cos(walkPhase))*.03*wb,
    -.7);
  if(swingT>0)swingT=Math.max(0,swingT-dt*4.5);
  const s=swingT>0?Math.sin((1-swingT)*Math.PI):0; // quick forward arc
  handGroup.rotation.set(-s*.7,s*.3,0);
  handGroup.position.z=-.7-s*.12;
  handGroup.position.y-=s*.04;
  // offhand block: mirrored on the left, bobs in antiphase, swings on place
  offhandGroup.visible=gs.running;
  _refreshOffhand();
  if(placeSwingT>0)placeSwingT=Math.max(0,placeSwingT-dt*4.5);
  const ps=placeSwingT>0?Math.sin((1-placeSwingT)*Math.PI):0;
  offhandGroup.position.set(
    -hx+Math.sin(walkPhase+Math.PI)*.024*wb,
    -.42+sway*.8-Math.abs(Math.cos(walkPhase+Math.PI))*.026*wb-ps*.04,
    -.68-ps*.15);
  offhandGroup.rotation.set(-ps*.8,-ps*.3,0);
  if(wb){const step=Math.floor(walkPhase/Math.PI);if(step!==_lastStep){_lastStep=step;playFootstep();}}
}
function updateViewBob(moving,sprinting){
  const wb=(settings.bob!==false&&moving&&P.onGround)?1:0;
  camera.position.y+=Math.abs(Math.sin(walkPhase))*.045*wb;
  camera.rotation.z=Math.sin(walkPhase)*.006*wb;
}

// ═══ RAYCAST ═══
const RC=new THREE.Raycaster();const _rd=new THREE.Vector3();
// castVoxel: voxel-grid DDA instead of raycasting thousands of meshes.
// Returns {x,y,z,ti,nx,ny,nz} — block coords plus the face normal entered.
function castVoxel(){
  camera.getWorldDirection(_rd);
  const ox=camera.position.x,oy=camera.position.y,oz=camera.position.z;
  let x=Math.floor(ox),y=Math.floor(oy),z=Math.floor(oz);
  const stepX=_rd.x>0?1:-1,stepY=_rd.y>0?1:-1,stepZ=_rd.z>0?1:-1;
  const tDx=Math.abs(1/(_rd.x||1e-9)),tDy=Math.abs(1/(_rd.y||1e-9)),tDz=Math.abs(1/(_rd.z||1e-9));
  let tMx=(_rd.x>0?(x+1-ox):(ox-x))*tDx;
  let tMy=(_rd.y>0?(y+1-oy):(oy-y))*tDy;
  let tMz=(_rd.z>0?(z+1-oz):(oz-z))*tDz;
  let t=0,nx=0,ny=0,nz=0;
  while(t<=7){
    const v=voxels[vKey(x,y,z)];
    if(v&&v.active&&v.ti!==WATER_BLOCK)return{x,y,z,ti:v.ti,nx,ny,nz,hy:oy+_rd.y*t};
    if(tMx<tMy&&tMx<tMz){t=tMx;tMx+=tDx;x+=stepX;nx=-stepX;ny=0;nz=0;}
    else if(tMy<tMz){t=tMy;tMy+=tDy;y+=stepY;nx=0;ny=-stepY;nz=0;}
    else{t=tMz;tMz+=tDz;z+=stepZ;nx=0;ny=0;nz=-stepZ;}
  }
  return null;
}
function getEnemyMeshes(){const ms=[];for(const e of enemies)ms.push(e.body,e.head);if(boss)ms.push(boss.body,boss.head);return ms;}
// enemy shots: raycast only enemy meshes, then confirm line-of-sight through
// the voxel grid (blocks no longer participate in mesh raycasts)
function _losToPoint(p){return hasLOS(camera.position.x,camera.position.y,camera.position.z,p.x,p.y,p.z);}
function castEnemies(){camera.getWorldDirection(_rd);RC.set(camera.position,_rd);RC.far=10;const h=RC.intersectObjects(getEnemyMeshes(),false);if(!h.length)return null;if(!_losToPoint(h[0].point))return null;return h[0];}
function castEnemiesFar(range){camera.getWorldDirection(_rd);RC.set(camera.position,_rd);RC.far=range;const h=RC.intersectObjects(getEnemyMeshes(),false);if(!h.length)return null;if(!_losToPoint(h[0].point))return null;return h[0];}
function findEnemyByMesh(obj){for(const e of enemies){if(obj===e.body||obj===e.head)return{enemy:e,isBoss:false};}if(boss&&(obj===boss.body||obj===boss.head))return{enemy:boss,isBoss:true};return null;}
function hasLOS(x1,y1,z1,x2,y2,z2){
  const dx=x2-x1,dy=y2-y1,dz=z2-z1;
  const steps=Math.ceil(Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz))*2)+1;
  for(let i=1;i<steps;i++){const t=i/steps;const k=vKey(Math.floor(x1+dx*t),Math.floor(y1+dy*t),Math.floor(z1+dz*t));const v=voxels[k];if(v&&v.active)return false;}
  return true;
}

