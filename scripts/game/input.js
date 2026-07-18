// ============================================================================
// jokura / input.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、下記の順序で <script> として読み込まれ、すべて同一のグローバル
// スコープを共有する（元は単一の boot() 関数だったため、この順序と共有スコープが前提）。
// 読み込み順: state → achievements → crafting → save → ui → audio → world →
//             combat → entities → hud → input → main
// ============================================================================

// ═══ JOYSTICK ═══
const joy={x:0,y:0};const jW=document.getElementById('joyWrap'),jK=document.getElementById('joyKnob');
let jActive=false,jPid=null,jCX=60,jCY=60;const JMAX=38;
function setKnob(dx,dy){let l=Math.hypot(dx,dy);if(l>JMAX){dx=dx/l*JMAX;dy=dy/l*JMAX;}jK.style.left=(60+dx-25)+'px';jK.style.top=(60+dy-25)+'px';joy.x=dx/JMAX;joy.y=dy/JMAX;}
function resetKnob(){jK.style.left='35px';jK.style.top='35px';joy.x=0;joy.y=0;}
if(!isDesktop){jW.addEventListener('pointerdown',(e)=>{e.preventDefault();initAudio();jActive=true;jPid=e.pointerId;jW.setPointerCapture(jPid);const r=jW.getBoundingClientRect();jCX=r.left+r.width/2;jCY=r.top+r.height/2;setKnob(e.clientX-jCX,e.clientY-jCY);});jW.addEventListener('pointermove',(e)=>{if(!jActive||e.pointerId!==jPid)return;e.preventDefault();setKnob(e.clientX-jCX,e.clientY-jCY);});const endJ=(e)=>{if(e.pointerId!==jPid)return;jActive=false;jPid=null;resetKnob();};jW.addEventListener('pointerup',endJ);jW.addEventListener('pointercancel',endJ);}

// ═══ X操作（家具・農作業） ═══
function doFurnitureAction(){
  if(!gs.running)return;
  if(mounted){dismountHorse();return;} // 騎乗中のXは常に降車
  if(_merchantNearby())               openMerchantPanel();
  else if(_bedNearby())                    sleepBed();
  else if(_chestNearby())             interactChest();
  else if(_treasureNearby())          openTreasure();
  else if(_horseMountableNearby())    mountHorse();
  else if(_tameableWolfNearby())      tameNearestWolf();
  else if(_petFeedableNearby())       feedPet();
  else if(_tameableHorseNearby())     tameNearestHorse();
  else if(_shearableSheepNearby())    shearNearestSheep();
  else if(_cropNearby())              harvestNearestCrop();
  else if(bedCount>0)                 placeBed();
  else if(chestCount>0)               placeChest();
  else if(furnaceCount>0)             placeFurnace();
  else if(enchTableCount>0)           placeEnchTable();
  else if(trophyCount>0)              placeTrophy();
  else if((isCreative()||inv.seed>0)&&plantSeed()){}
  else showBonus('置ける家具がない！');
}

// ═══ INPUT ═══
let lActive=false,lId=null,lX=0,lY=0;const LS_BASE=.006;let LS=LS_BASE*(settings.lookSens||1);const uiPointers=new Set();
if(!isDesktop){document.addEventListener('pointerdown',(e)=>{if(e.clientX<window.innerWidth*.38)return;const el=e.target;if(el&&(el.closest('#regionEditHud')||el.id==='regionEditBtn'||el.closest('#actionWrap')||el.closest('#hotbar')||el.closest('#overlay')||el.closest('#minimap')||el.closest('#joyWrap')||el.closest('#topBar')||el.id==='saveFloatBtn'||el.id==='eatBtn'||el.id==='craftBtn'||el.id==='questBtn'||el.id==='weaponBtn'||el.id==='pauseBtn'||el.closest('#craftPanel')||el.closest('#pauseOverlay')||el.closest('.menuPanel'))){uiPointers.add(e.pointerId);return;}lActive=true;lId=e.pointerId;lX=e.clientX;lY=e.clientY;},{passive:true});document.addEventListener('pointermove',(e)=>{if(!lActive||e.pointerId!==lId)return;yaw-=(e.clientX-lX)*LS;pitch-=(e.clientY-lY)*LS;pitch=Math.max(-1.45,Math.min(1.45,pitch));lX=e.clientX;lY=e.clientY;},{passive:true});document.addEventListener('pointerup',(e)=>{uiPointers.delete(e.pointerId);if(e.pointerId!==lId)return;lActive=false;lId=null;},{passive:true});document.addEventListener('pointercancel',(e)=>{uiPointers.delete(e.pointerId);if(e.pointerId!==lId)return;lActive=false;lId=null;},{passive:true});}
const keys={};
document.addEventListener('keydown',(e)=>{
  keys[e.code]=true;
  if(e.code==='Space'&&gs.running){e.preventDefault();if(!e.repeat)doJump();}
  if(e.code>='Digit1'&&e.code<='Digit9')setType(parseInt(e.code[5])-1);
  if(e.code==='Digit0')setType(9);
  if(e.code==='KeyE')cycleWeapon();
  if(e.code==='KeyR')cycleArrowMode();
  if(e.code==='F5'&&gs.running){e.preventDefault();saveGame();}
  if(e.code==='KeyC'){if(gs.running)toggleCraftPanel();}
  if(e.code==='KeyQ'||e.code==='KeyG')openQuest();
  if(e.code==='KeyX')doFurnitureAction();
  if(e.code==='KeyB'){
    if(!gs.running)return;
    if(_bedNearby())sleepBed();else placeBed();
  }
  if(e.code==='KeyV'){if(typeof _onRegionEditBtnTap==='function')_onRegionEditBtnTap();}
  if(e.code==='Escape'||e.code==='KeyP'){if(gs.running)togglePause();}
});
document.addEventListener('keyup',(e)=>{keys[e.code]=false;});
if(isDesktop){canvas.addEventListener('click',()=>{canvas.requestPointerLock?.();initAudio();});document.addEventListener('mousemove',(e)=>{if(document.pointerLockElement!==canvas)return;yaw-=e.movementX*.003;pitch-=e.movementY*.003;pitch=Math.max(-1.5,Math.min(1.5,pitch));});canvas.addEventListener('mousedown',(e)=>{if(document.pointerLockElement!==canvas)return;if(e.button===0){attackHeld=true;doAttack();}if(e.button===2)doPlace();});document.addEventListener('mouseup',(e)=>{if(e.button===0)attackHeld=false;});canvas.addEventListener('contextmenu',(e)=>e.preventDefault());}

// ═══ HOTBAR ═══
let curType=0;const slots=[...document.querySelectorAll('.hslot')];
function setType(idx){if(idx<0||idx>=SLOT_TI.length)return;curType=idx;slots.forEach(x=>x.classList.remove('active'));slots[idx].classList.add('active');if(typeof updateRegionEditUI==='function')updateRegionEditUI();}
slots.forEach(s=>{s.addEventListener('pointerdown',(ev)=>{ev.preventDefault();initAudio();setType(parseInt(s.dataset.i,10));});});
function cycleWeapon(){let next=(weaponIdx+1)%WEAPONS.length;for(let i=0;i<WEAPONS.length;i++){if(unlockedWeapons[next])break;next=(next+1)%WEAPONS.length;}if(!unlockedWeapons[next]){showBonus('🔒 武器未解放');return;}weaponIdx=next;showBonus(WEAPONS[weaponIdx].name);playTone(600,.08,.08,'sine');}

// ═══ FISHING ═══
let fishCD=0;
function tryFishing(bh){
  if(!bh||bh.ti!==WATER_BLOCK)return false;
  const now=performance.now()/1000;
  if(now<fishCD){showBonus('🎣 少し待とう…');playTone(220,.06,.05,'sine');return true;}
  fishCD=now+2.8;
  const roll=Math.random();
  let msg='🎣 ';
  if(roll<.58){
    meat++;
    updateMeatHUD();
    msg+='魚を釣った！ 🥩 +1';
  }else if(roll<.78){
    const n=2+Math.floor(Math.random()*3);
    inv.arrow+=n;
    updateInvHUD();
    msg+='流木の矢 🏹 +'+n;
  }else if(roll<.91){
    const mats=['wood','stone','sand','clay'];
    const k=mats[Math.floor(Math.random()*mats.length)];
    const n=1+Math.floor(Math.random()*3);
    inv[k]+=n;
    updateInvHUD();
    msg+='水辺の素材 '+(MATERIAL_LABELS[k]||k).split(' ')[0]+' +'+n;
  }else if(roll<.985){
    inv.ironOre++;
    updateInvHUD();
    msg+='沈んだ鉄鉱石 🔶 +1';
  }else{
    const hadDiamond=inv.diamond>0;
    inv.diamond++;
    updateInvHUD();
    if(!hadDiamond)unlockAchievement('firstDiamond');
    msg+='水底のダイヤ 💎 +1';
  }
  gs.score+=5;
  showBonus(msg);
  playTone(520,.09,.08,'sine');setTimeout(()=>playTone(760,.08,.07,'sine'),90);
  return true;
}

// ═══ COMBAT ═══
// enemy/boss/dragon meshes are built with per-instance geometries and cloned
// materials, so they must be disposed on removal to avoid GPU memory leaks
function disposeObject3D(root){root.traverse(o=>{if(o.isMesh){if(o.geometry)o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else if(o.material)o.material.dispose();}else if(o.isSprite&&o.material){if(o.material.map)o.material.map.dispose();o.material.dispose();}});}
function flashEnemy(e){for(const m of e.flashMeshes||[e.body,e.head]){m.material.emissive.setHex(0xffffff);m.material.emissiveIntensity=1.5;}setTimeout(()=>{try{for(const m of e.flashMeshes||[e.body,e.head]){m.material.emissive.setHex(e.type.emissive);m.material.emissiveIntensity=e.type.emissiveIntensity||.15;}}catch(x){}},100);}
// 敵の死亡後処理を一箇所に集約: 直接攻撃(hitEnemy)だけでなく、炎上DoT・
// ファントムの日光焼死などmain.jsのtickループで hp<=0 を検知するケースでも
// キル数・スコア・実績・SEが必ず一致するようにする。
function finalizeEnemyDeath(en){
  const ep=en.root.position;
  spawnParticles(ep.x,ep.y,ep.z,en.type.color,4);
  dropItem(ep.x,ep.y,ep.z,en.type);
  scene.remove(en.root);disposeObject3D(en.root);
  const idx=enemies.indexOf(en);if(idx>=0)enemies.splice(idx,1);
  gs.kills++;
  const pts=en.type.score*(gs.wave||1)*fullMoonScoreMult();
  gs.score+=pts;
  if(en.type.creeper)unlockAchievement('creeperHunter');
  if(en.type.phantom)unlockAchievement('phantomHunter');
  sfxKill();showBonus('+'+pts);
}
function hitEnemy(en,dmgVal){en.hp-=dmgVal;flashEnemy(en);const ratio=Math.max(0,en.hp/en.maxHp);en.hpBar.scale.x=Math.max(.01,ratio);en.hpBar.material.color.setHex(ratio>.5?0x44ff44:ratio>.25?0xffaa00:0xff2222);if(en.hp<=0&&!en.dead){en.dead=true;finalizeEnemyDeath(en);}}

// ブロック破壊共通処理
function breakBlock(bh){
  const d=bh; // castVoxel hit record: {x,y,z,ti,nx,ny,nz}
  if(d.ti===WATER_BLOCK)return;
  const k=vKey(d.x,d.y,d.z);
  const v=voxels[k];
  if(v){
    ftvOnBlockBroken(k); // ⏳ 時間が止まった村: 時間結晶なら耐久を減らす
    sucOnBlockBroken(k); // 🏛 封印された地底都市: 封印装置の結晶なら耐久を減らす
    sccOnBlockBroken(k); // ☁ 天空都市: 動力炉の結晶なら再起動する
    spawnBlockDebris(d.x+.5,d.y+.5,d.z+.5,v.ti);
    addMaterial(v.ti);
    if(v.ti===TORCH_BLOCK){inv.torch++;updateInvHUD();}
    if(v.ti===DIAMOND_ORE&&!isCreative()&&dragon===null&&!dragonWarnPending&&P.y<-12&&Math.random()<0.2){dragonWarnPending=true;showAlert('⚠ ダイヤを掘った…何かが目覚めた…');playTone(80,.2,.4,'sawtooth');setTimeout(()=>{if(gs.running)spawnDiamondDragon();},3000);}
    if(!v.playerPlaced){if(!isCreative())gs.score+=2;worldEdits.removed[k]=true;}
    else{delete worldEdits.placed[k];}
  }
  removeBlock(d.x,d.y,d.z);
}

// ─── ENEMY BLOCK BREAKING ───
function enemyBreakBlockAt(x,y,z){
  const k=vKey(x,y,z);const v=voxels[k];if(!v||!v.active||v.ti===WATER_BLOCK)return false;
  if(v.ti===OBSIDIAN_BLOCK)return false; // 黒曜石は耐爆: 敵・ボスには絶対に壊せない
  ftvOnBlockBroken(k); // ⏳ 敵が時間結晶を砕いた場合も解除が進む（詰み防止）
  sucOnBlockBroken(k); // 🏛 敵が封印装置を砕いた場合も解除が進む（詰み防止）
  sccOnBlockBroken(k); // ☁ 敵の破壊でも動力炉が反応する（詰み防止）
  spawnBlockDebris(x+.5,y+.5,z+.5,v.ti);
  if(Math.hypot(x-P.x,z-P.z)<20)sfxBreak();
  if(v.playerPlaced)delete worldEdits.placed[k];else worldEdits.removed[k]=true;
  removeBlock(x,y,z);return true;
}
function getForwardBlockForEnemy(e){
  const ep=e.root.position;const dx=P.x-ep.x,dz=P.z-ep.z;const dl=Math.hypot(dx,dz)||1;
  const nx=dx/dl,nz=dz/dl;const gy=Math.floor(ep.y-.85);
  for(let s=1;s<=2;s++){
    const bx=Math.floor(ep.x+nx*s),bz=Math.floor(ep.z+nz*s);
    for(let by=gy;by<=gy+1;by++){const k=vKey(bx,by,bz);const v=voxels[k];if(v&&v.active)return{x:bx,y:by,z:bz,v};}
  }
  return null;
}
function tryEnemyBreakBlock(e){
  const et=e.type;if(!et.breakPow)return;
  const bl=getForwardBlockForEnemy(e);if(!bl)return;
  const ti=bl.v.ti;let hard=BLOCK_HARDNESS[ti]!==undefined?BLOCK_HARDNESS[ti]:99;
  if(et.firePow&&(ti===0||ti===3||ti===5||ti===9))hard=1;
  if(et.breakSoft&&hard>1)return;
  if(et.breakChance&&Math.random()>et.breakChance)return;
  if(et.breakPow>=hard){enemyBreakBlockAt(bl.x,bl.y,bl.z);e.breakCd=et.breakCd0||4;}
}
function tryBossBreakBlock(){
  if(!boss)return;const bp=boss.root.position,sc=boss.sc;
  const dx=P.x-bp.x,dz=P.z-bp.z,dl=Math.hypot(dx,dz)||1;
  const nx=dx/dl,nz=dz/dl;const gy=Math.floor(bp.y-.85*sc);
  const pow=(boss.def.wave>=15?5:boss.def.wave>=10?4:3)+boss.phase-1;
  for(let s=1;s<=Math.ceil(sc*1.5)+1;s++){
    const bx=Math.floor(bp.x+nx*s),bz=Math.floor(bp.z+nz*s);
    for(let by=gy;by<=gy+Math.ceil(sc*1.5);by++){
      const k=vKey(bx,by,bz);const v=voxels[k];if(!v||!v.active||v.ti===OBSIDIAN_BLOCK)continue;
      const hard=BLOCK_HARDNESS[v.ti]!==undefined?BLOCK_HARDNESS[v.ti]:99;
      if(pow>=hard){enemyBreakBlockAt(bx,by,bz);return;}
    }
  }
}

function doAttack(e){
  if(e)e.preventDefault();if(!gs.running)return;initAudio();
  if(regionEditor&&regionEditor.state.active){const bh=castVoxel(true);if(bh)regionEditor.pick(bh);return;}
  if(attackCD>0)return;
  if(!unlockedWeapons[weaponIdx]){showBonus('🔒 武器未解放！クラフトしよう');playTone(200,.08,.08,'sawtooth');return;}
  const w=WEAPONS[weaponIdx];
  if(w.type==='ranged'&&inv.arrow+inv.fireArrow+inv.iceArrow<=0&&!isCreative()){showBonus('矢がない！🪵×2でクラフト');playTone(200,.08,.08,'sawtooth');return;}
  attackCD=w.cd;w.sfx();triggerHandSwing();
  if(w.type==='staff'){fireStaff();return;}
  if(w.type==='ranged'){
    // 装填中の矢種を消費（切れていたら他の種類へフォールバック）
    let mode=arrowMode;
    if(!isCreative()){
      if(mode==='fire'&&inv.fireArrow<=0)mode='normal';
      if(mode==='ice'&&inv.iceArrow<=0)mode='normal';
      if(mode==='normal'&&inv.arrow<=0)mode=inv.fireArrow>0?'fire':'ice';
      inv[mode==='fire'?'fireArrow':mode==='ice'?'iceArrow':'arrow']--;updateInvHUD();
    }
    const dm=wDmg(w)+(mode==='fire'?1:0);
    const eh=castEnemiesFar(wRange(w));if(eh){const found=findEnemyByMesh(eh.object);if(found){
      if(found.isBoss){hitBoss(dm);if(mode==='fire')igniteBoss();if(mode==='ice')chillBoss();}
      else if(found.humanoid)hitHumanoid(found.humanoid,dm);
      else{hitEnemy(found.enemy,dm);if(mode==='fire')igniteEnemy(found.enemy);if(mode==='ice')chillEnemy(found.enemy);}
      return;}}
    fireArrow(mode);return;
  }
  if(w.type==='hammer'){
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;spawnParticles(P.x+Math.cos(a)*2.5,P.y+.3,P.z+Math.sin(a)*2.5,0x00e5ff,1);}
    spawnParticles(P.x,P.y+.5,P.z,0xaaf8ff,3);
    let anyHit=false;
    if(boss){const bp=boss.root.position;if(Math.hypot(bp.x-P.x,bp.z-P.z)<wRange(w)){hitBoss(wDmg(w));applyMeleeEnchants(null,true);anyHit=true;}}
    if(dragon){const dp=dragon.root.position;if(Math.hypot(dp.x-P.x,dp.z-P.z)<wRange(w)){hitDragon(wDmg(w),true);anyHit=true;}}
    for(const en of[...enemies]){const ep=en.root.position;if(Math.hypot(ep.x-P.x,ep.z-P.z)<wRange(w)){hitEnemy(en,wDmg(w));applyMeleeEnchants(en,false);anyHit=true;}}
    attackMobs(w);
    if(attackHumanoids(w))anyHit=true;
    if(!anyHit){const bh=castVoxel();if(regionEditor&&regionEditor.state.active){if(bh)regionEditor.pick(bh);return;}if(bh){mineBlock(bh);}}
    return;
  }
  if(w.type==='aoe'){
    spawnParticles(P.x,P.y+1.5,P.z,0xff44ff,4);let anyHit=false;
    if(boss){const bp=boss.root.position,dx=bp.x-P.x,dy=bp.y-P.y,dz=bp.z-P.z;if(Math.sqrt(dx*dx+dy*dy+dz*dz)<wRange(w)){hitBoss(wDmg(w));applyMeleeEnchants(null,true);anyHit=true;}}
    if(dragon){const dp=dragon.root.position,dx=dp.x-P.x,dy=dp.y-P.y,dz=dp.z-P.z;if(Math.sqrt(dx*dx+dy*dy+dz*dz)<wRange(w)){hitDragon(wDmg(w),false);anyHit=true;}}
    for(const en of[...enemies]){const ep=en.root.position,dx=ep.x-P.x,dy=ep.y-P.y,dz=ep.z-P.z;if(Math.sqrt(dx*dx+dy*dy+dz*dz)<wRange(w)){hitEnemy(en,wDmg(w));applyMeleeEnchants(en,false);anyHit=true;}}
    attackMobs(w);
    if(attackHumanoids(w))anyHit=true;
    if(!anyHit){const bh=castVoxel();if(bh){mineBlock(bh);}}
    return;
  }
  const eh=castEnemies();if(eh&&eh.distance<=wRange(w)){const found=findEnemyByMesh(eh.object);if(found){if(found.isBoss){hitBoss(wDmg(w));applyMeleeEnchants(null,true);}else if(found.humanoid){hitHumanoid(found.humanoid,wDmg(w));}else{hitEnemy(found.enemy,wDmg(w));applyMeleeEnchants(found.enemy,false);}return;}}
  if(dragon){const dp=dragon.root.position;if((dp.x-P.x)**2+(dp.y-(P.y+1.5))**2+(dp.z-P.z)**2<wRange(w)*wRange(w)){hitDragon(wDmg(w),weaponIdx===1&&hasDiamondSword);return;}}
  attackMobs(w);
  if(attackHumanoids(w))return;
  const bh=castVoxel();if(bh){mineBlock(bh);}
}

function doPlace(e){
  if(e)e.preventDefault();if(!gs.running)return;initAudio();
  if(regionEditor&&regionEditor.state.active){const rb=castVoxel(true);if(rb)regionEditor.pick(rb);return;}
  const bh=castVoxel(true);if(!bh)return;
  if(tryFishing(bh))return;
  const n={x:bh.nx,y:bh.ny,z:bh.nz},d=bh;
  const px=d.x+Math.round(n.x),py=d.y+Math.round(n.y),pz=d.z+Math.round(n.z);
  if(px<P.x+.35&&px+1>P.x-.35&&py<P.y+1.75&&py+1>P.y&&pz<P.z+.35&&pz+1>P.z-.35)return;
  for(const en of enemies){const ep=en.root.position,fy=ep.y-.85;if(px<ep.x+.5&&px+1>ep.x-.5&&py<fy+1.7&&py+1>fy&&pz<ep.z+.5&&pz+1>ep.z-.5)return;}
  for(const h of humanoids){const p=h.root.position;if(px<p.x+.4&&px+1>p.x-.4&&py<p.y+2.5&&py+1>p.y&&pz<p.z+.4&&pz+1>p.z-.4)return;}
  const mat=SLOT_MAT[curType],ti=SLOT_TI[curType];
  if(!isCreative()){ // creative: infinite blocks, nothing consumed
    if(inv[mat]<=0){showBonus(mat==='torch'?'🔥 トーチがない！クラフトしよう':mat==='slab'?'⬜ ハーフブロックがない！クラフトしよう':mat==='stair'?'🪜 階段がない！クラフトしよう':'素材がない！ 🪵');playTone(180,.1,.1,'sawtooth');return;}
    inv[mat]--;updateInvHUD();
  }
  let meta=0;
  if(ti===SLAB_BLOCK){
    // top face → bottom slab, bottom face → top slab, side face → by hit height
    if(n.y>0)meta=0;else if(n.y<0)meta=1;else meta=(bh.hy-py>.5)?1:0;
  }else if(ti===STAIR_BLOCK){
    // tall half faces the way the player is looking, so walking on climbs up
    camera.getWorldDirection(_rd);
    meta=Math.abs(_rd.x)>Math.abs(_rd.z)?(_rd.x>0?0:2):(_rd.z>0?1:3);
  }
  addBlock(px,py,pz,ti,true,true,meta);
  const pk=vKey(px,py,pz);worldEdits.placed[pk]=ti|(meta<<5);delete worldEdits.removed[pk];
  sfxPlace();triggerPlaceSwing();
}

