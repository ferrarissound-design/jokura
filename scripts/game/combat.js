// ============================================================================
// jokura / combat.js
// scripts/main.js を機能別に分割したファイルの一部。index.html から three.js の
// 読み込み完了後、下記の順序で <script> として読み込まれ、すべて同一のグローバル
// スコープを共有する（元は単一の boot() 関数だったため、この順序と共有スコープが前提）。
// 読み込み順: state → achievements → crafting → save → ui → audio → world →
//             combat → entities → hud → input → main
// ============================================================================

// ═══ PHYSICS ═══
function overlaps(px,py,pz,hw,hh){
  hw=hw||.35;hh=hh||1.75;
  const mnX=Math.floor(px-hw),mxX=Math.floor(px+hw),mnY=Math.floor(py),mxY=Math.floor(py+hh),mnZ=Math.floor(pz-hw),mxZ=Math.floor(pz+hw);
  for(let bx=mnX;bx<=mxX;bx++)for(let by=mnY;by<=mxY;by++)for(let bz=mnZ;bz<=mxZ;bz++){
    const v=voxels[vKey(bx,by,bz)];if(!v||!v.active||v.ti===WATER_BLOCK||v.ti===TORCH_BLOCK)continue;
    if(isPartial(v.ti)){
      for(const e of shapeBoxes(v.ti,v.meta||0)){
        if(px-hw<bx+e[3]&&px+hw>bx+e[0]&&py<by+e[4]&&py+hh>by+e[1]&&pz-hw<bz+e[5]&&pz+hw>bz+e[2])return true;
      }
      continue;
    }
    if(px-hw<bx+1&&px+hw>bx&&py<by+1&&py+hh>by&&pz-hw<bz+1&&pz+hw>bz)return true;
  }
  const CHW=0.45,CHH=0.7;
  for(const c of chests){const cx=c.x+.5,cy=c.y,cz=c.z+.5;if(px-hw<cx+CHW&&px+hw>cx-CHW&&py<cy+CHH&&py+hh>cy&&pz-hw<cz+CHW&&pz+hw>cz-CHW)return true;}
  for(const b of beds){const bx=b.x+.5,by=b.y,bz=b.z+.9;if(px-hw<bx+.5&&px+hw>bx-.5&&py<by+.35&&py+hh>by&&pz-hw<bz+.9&&pz+hw>bz-.9)return true;}
  for(const t of trophies){const tx=t.x+.5,ty=t.y,tz=t.z+.5;if(px-hw<tx+.38&&px+hw>tx-.38&&py<ty+.75&&py+hh>ty&&pz-hw<tz+.38&&pz+hw>tz-.38)return true;}
  return false;
}
let lavaDmgTimer=0,snowDmgTimer=0,starveT=0;
const $lavaFlash=document.getElementById('lavaFlash'),$snowFlash=document.getElementById('snowFlash');
function checkLava(){const px=Math.floor(P.x),py=Math.floor(P.y),pz=Math.floor(P.z);for(let by=py-1;by<=py+1;by++){if(lavaBlocks.has(vKey(px,by,pz)))return true;for(const[dx,dz]of[[-1,0],[1,0],[0,-1],[0,1]]){if(lavaBlocks.has(vKey(px+dx,by,pz+dz)))return true;}}return false;}

// ═══ PARTICLES ═══
let particles=[];const particleGeo=new THREE.BoxGeometry(.1,.1,.1);
function spawnParticles(x,y,z,color,count){count=isTouch?Math.min(count,2):Math.min(count,5);if(isTouch&&particles.length>=12)return;for(let i=0;i<count;i++){const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1});const m=new THREE.Mesh(particleGeo,mat);m.position.set(x,y,z);scene.add(m);particles.push({mesh:m,mat,vx:(Math.random()-.5)*5,vy:Math.random()*4+2,vz:(Math.random()-.5)*5,life:.4+Math.random()*.3});}}
// block-break debris: more pieces than a hit spark, with per-piece shade and
// size variation so the burst reads as chunks of the broken block
function spawnBlockDebris(x,y,z,ti){
  const base=BLOCK_COLORS[ti]!==undefined?BLOCK_COLORS[ti]:0x888888;
  const n=isTouch?4:9;
  if(isTouch&&particles.length>=12)return;
  for(let i=0;i<n;i++){
    const f=(Math.random()-.5)*.5;
    let r=(base>>16&255)/255,g=(base>>8&255)/255,b=(base&255)/255;
    if(f>=0){r+=(1-r)*f;g+=(1-g)*f;b+=(1-b)*f;}else{r*=1+f;g*=1+f;b*=1+f;}
    const mat=new THREE.MeshBasicMaterial({color:new THREE.Color(r,g,b),transparent:true,opacity:1});
    const m=new THREE.Mesh(particleGeo,mat);
    const sc=.6+Math.random()*1.2;m.scale.set(sc,sc,sc);
    m.position.set(x+(Math.random()-.5)*.6,y+(Math.random()-.5)*.6,z+(Math.random()-.5)*.6);
    scene.add(m);
    particles.push({mesh:m,mat,vx:(Math.random()-.5)*6,vy:Math.random()*4.5+2,vz:(Math.random()-.5)*6,life:.5+Math.random()*.35});
  }
}
function spawnLavaParticles(x,y,z){for(let i=0;i<3;i++){const mat=new THREE.MeshBasicMaterial({color:Math.random()<.5?0xff4400:0xff8800,transparent:true,opacity:1});const m=new THREE.Mesh(particleGeo,mat);m.position.set(x,y,z);scene.add(m);particles.push({mesh:m,mat,vx:(Math.random()-.5)*2,vy:Math.random()*3+2,vz:(Math.random()-.5)*2,life:.6+Math.random()*.4});}}
function spawnSnowParticles(x,y,z){for(let i=0;i<2;i++){const mat=new THREE.MeshBasicMaterial({color:0xddeeff,transparent:true,opacity:.8});const m=new THREE.Mesh(particleGeo,mat);m.position.set(x+Math.random()-.5,y+Math.random()*2+1,z+Math.random()-.5);scene.add(m);particles.push({mesh:m,mat,vx:(Math.random()-.5)*.5,vy:-Math.random()*1.5-.5,vz:(Math.random()-.5)*.5,life:1.5+Math.random()});}}
function updateParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){scene.remove(p.mesh);p.mat.dispose();particles.splice(i,1);continue;}p.vy-=12*dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;p.mesh.rotation.x+=dt*4;p.mat.opacity=Math.max(0,p.life/.4);}}

// ═══ WEAPONS ═══
const WEAPONS=[
  {name:'👊 Fist', dmg:1,range:3,  cd:.3, type:'melee',  sfx:sfxHit},
  {name:'⚔ Sword', dmg:3,range:3.5,cd:.4, type:'melee',  sfx:sfxSword},
  {name:'🔨 Hammer',dmg:6,range:3,  cd:.8, type:'melee',  sfx:sfxHammer},
  {name:'🏹 Bow',   dmg:4,range:25, cd:.7, type:'ranged', sfx:sfxBow},
  {name:'🪄 Magic', dmg:5,range:8,  cd:1.4,type:'aoe',    sfx:sfxMagic},
  {name:'🔮 Diamond Staff',dmg:15,range:35,cd:1.5,type:'staff',sfx:sfxDiamondStaff},
];
// 🌕 満月の夜: 通常の雑魚キルスコアを2倍にする（ボス/ドラゴンのスコアには適用しない）
function fullMoonScoreMult(){return fullMoonNight?2:1;}
let weaponIdx=0,attackCD=0;
const $wl=document.getElementById('weaponLabel');
const $cdFill=document.getElementById('cdFill');
const $meatLabel=document.getElementById('meatLabel');
const $eatBtn=document.getElementById('eatBtn');
const MEAT_SCORE=25;
const MOB_RESPAWN_INTERVAL=60;
let mobRespawnT=MOB_RESPAWN_INTERVAL;
let projectiles=[];
const arrowGeo=new THREE.BoxGeometry(.12,.12,.5);const arrowMat=new THREE.MeshBasicMaterial({color:0xddaa44});const diamondArrowMat=new THREE.MeshBasicMaterial({color:0x00e5ff});
const fireArrowMat=new THREE.MeshBasicMaterial({color:0xff7722});const iceArrowMat=new THREE.MeshBasicMaterial({color:0xaaeeff});
const staffOrbGeo=new THREE.OctahedronGeometry(.22,0);const staffOrbMat=new THREE.MeshBasicMaterial({color:0x88ffff});
// エンチャント込みの実効ダメージ / 射程
function wDmg(w){return w.dmg+enchants.atk;}
function wRange(w){return w.range*(1+enchants.rng*.15);}
function ensureUnlockedWeaponSelected(){
  if(unlockedWeapons[weaponIdx])return;
  const fallback=unlockedWeapons.findIndex(Boolean);
  if(fallback>=0)weaponIdx=fallback;
  else{unlockedWeapons[0]=true;weaponIdx=0;}
  attackCD=0;
}
// ─── 状態異常（炎上=DoT / 氷結=鈍足）: 火矢・氷矢と属性エンチャントが付与 ───
function igniteEnemy(en){if(!en||en.dead)return;en.burnT=3;}
function chillEnemy(en){if(!en||en.dead)return;en.slowT=3;}
function igniteBoss(){if(boss)boss.burnT=Math.max(boss.burnT||0,2.5);}
function chillBoss(){if(boss)boss.slowT=Math.max(boss.slowT||0,1.6);}
// 近接ヒット時の属性エンチャント適用
function applyMeleeEnchants(target,isBoss){
  if(enchants.fire){if(isBoss)igniteBoss();else igniteEnemy(target);}
  if(enchants.frost){if(isBoss)chillBoss();else chillEnemy(target);}
}
function fireStaff(){const dir=new THREE.Vector3();camera.getWorldDirection(dir);const m=new THREE.Mesh(staffOrbGeo,staffOrbMat.clone());const sx=P.x,sy=P.y+1.5,sz=P.z;m.position.set(sx,sy,sz);scene.add(m);projectiles.push({mesh:m,x:sx,y:sy,z:sz,dx:dir.x*70,dy:dir.y*70,dz:dir.z*70,life:2.5,dmg:wDmg(WEAPONS[5]),staff:true});}
function fireArrow(mode){const dir=new THREE.Vector3();camera.getWorldDirection(dir);const isDiamond=hasDiamondBow;const am=mode==='fire'?fireArrowMat:mode==='ice'?iceArrowMat:isDiamond?diamondArrowMat:arrowMat;const m=new THREE.Mesh(arrowGeo,am.clone());const sx=P.x,sy=P.y+1.5,sz=P.z;m.position.set(sx,sy,sz);m.lookAt(sx+dir.x,sy+dir.y,sz+dir.z);scene.add(m);const spd=isDiamond?55:35;const life=isDiamond?2.4:1.8;projectiles.push({mesh:m,x:sx,y:sy,z:sz,dx:dir.x*spd,dy:dir.y*spd,dz:dir.z*spd,life,dmg:wDmg(WEAPONS[3])+(mode==='fire'?1:0),diamond:isDiamond,fireA:mode==='fire',iceA:mode==='ice'});}
const bossArrowGeo=new THREE.BoxGeometry(.2,.2,.7);
function fireBossArrow(bx,by,bz,tx,ty,tz,dmgVal){const dx=tx-bx,dy=ty-by,dz=tz-bz,l=Math.hypot(dx,dy,dz)||1;const m=new THREE.Mesh(bossArrowGeo,new THREE.MeshBasicMaterial({color:0xff3300}));m.position.set(bx,by,bz);scene.add(m);projectiles.push({mesh:m,x:bx,y:by,z:bz,dx:(dx/l)*22,dy:(dy/l)*22,dz:(dz/l)*22,life:2.5,dmg:dmgVal,isBossArrow:true});}

// ═══ PLAYER ═══
const P={x:0,y:20,z:0,velY:0,onGround:false,hp:100,maxHp:100,invT:0,food:100,flying:false};
let yaw=0,pitch=0;
const SPEED=6,SPRINT_SPEED=10,GRAV=18,JV=7.5,EYE=1.55;
// 騎乗中はジャンプ力アップ（約2ブロック超え）。mounted/MOUNT_JVは騎乗セクションで定義
function jumpV(){return mounted?MOUNT_JV:JV;}
const FLY_SPEED=12,FLY_VSPEED=8; // creative flight: fast horizontal + vertical
let coyoteTime=0,jumpBuffer=0;
const COYOTE=0.15,JBUF=0.12;
let jumpBtnHeld=false,flyDownHeld=false; // touch hold state for creative flight
function flyMove(vx,vz,dt){
  // creative flight: no gravity; ascend/descend by held input, collide with blocks
  const up=(isDesktop&&keys['Space'])||jumpBtnHeld;
  const down=(isDesktop&&(keys['ShiftLeft']||keys['ShiftRight']))||flyDownHeld;
  const vy=((up?1:0)-(down?1:0))*FLY_VSPEED;
  const steps=3,sdt=dt/steps;
  for(let s=0;s<steps;s++){
    const nx=P.x+vx*sdt;if(!overlaps(nx,P.y,P.z))P.x=nx;
    const nz=P.z+vz*sdt;if(!overlaps(P.x,P.y,nz))P.z=nz;
    const ny=P.y+vy*sdt;
    if(!overlaps(P.x,ny,P.z))P.y=ny;
    else if(vy<0){setFlying(false);break;} // touched down: land like Minecraft
  }
  P.velY=0;P.onGround=false;coyoteTime=0;jumpBuffer=0;
  if(P.y<-40){P.y=20;P.velY=0;}
}
// 氷の上は滑る: 入力速度へ即座に切り替わらず、前フレームの速度から
// ゆっくり補間する（氷から降りると即座に通常操作へ戻る）
let _slideVX=0,_slideVZ=0;
function _onIce(){
  if(!P.onGround)return false;
  const v=voxels[vKey(Math.floor(P.x),Math.floor(P.y-.1),Math.floor(P.z))];
  return !!v&&v.ti===ICE_BLOCK;
}
function movePlayer(vx,vz,dt){if(P.flying){flyMove(vx,vz,dt);return;}
  if(_onIce()){const k=Math.min(1,dt*2.2);_slideVX+=(vx-_slideVX)*k;_slideVZ+=(vz-_slideVZ)*k;vx=_slideVX;vz=_slideVZ;}
  else{_slideVX=vx;_slideVZ=vz;}
  P.velY-=GRAV*dt;const steps=3,sdt=dt/steps;let grounded=false;for(let s=0;s<steps;s++){const canStep=grounded||P.onGround;let nx=P.x+vx*sdt;if(!overlaps(nx,P.y,P.z))P.x=nx;else if(canStep&&!overlaps(nx,P.y+.55,P.z)){P.x=nx;P.y+=.55;}let nz=P.z+vz*sdt;if(!overlaps(P.x,P.y,nz))P.z=nz;else if(canStep&&!overlaps(P.x,P.y+.55,nz)){P.z=nz;P.y+=.55;}const ny=P.y+P.velY*sdt;if(!overlaps(P.x,ny,P.z)){P.y=ny;}else{if(P.velY<0)grounded=true;P.velY=0;}}P.onGround=grounded;if(P.onGround){coyoteTime=COYOTE;}else{coyoteTime=Math.max(0,coyoteTime-dt);}if(jumpBuffer>0){jumpBuffer-=dt;if(P.onGround||coyoteTime>0){P.velY=jumpV();P.onGround=false;coyoteTime=0;jumpBuffer=0;sfxJump();}}if(P.y<-40){P.y=20;P.velY=0;dmgPlayer(15);}}
let _flyTapT=0;
function setFlying(on){
  if(!isCreative()&&on)return;
  if(P.flying===!!on)return;
  if(on&&mounted)dismountHorse(); // 飛行と騎乗は併用しない
  P.flying=!!on;
  if(P.flying){P.velY=0;P.onGround=false;showBonus('🕊 飛行ON');playTone(900,.08,.08,'sine');setTimeout(()=>playTone(1200,.06,.06,'sine'),80);}
  else{showBonus('🛬 飛行OFF');playTone(500,.08,.06,'sine');}
  updateFlyBtns();
}
function toggleFly(){if(!gs.running||!isCreative())return;initAudio();setFlying(!P.flying);}
function doJump(){
  if(!gs.running)return;initAudio();
  if(isCreative()){
    const now=performance.now();
    if(now-_flyTapT<350){_flyTapT=0;toggleFly();return;} // double-tap: toggle flight
    _flyTapT=now;
    if(P.flying)return; // while flying, holding jump ascends (see flyMove)
  }
  if(P.onGround||coyoteTime>0){P.velY=jumpV();P.onGround=false;coyoteTime=0;jumpBuffer=0;if(!isCreative())P.food=Math.max(0,P.food-.3);sfxJump();}else{jumpBuffer=JBUF;}
}

// ═══ ENEMY BUILDERS ═══
function makeMat(color,emissive,emissiveIntensity,roughness){return new THREE.MeshStandardMaterial({color,emissive:emissive||0,emissiveIntensity:emissiveIntensity||0,roughness:roughness||.7});}
// mark an entity's body parts as shadow casters (skips HP bars / labels, which use basic materials)
function markShadowCaster(root){root.traverse(o=>{if(o.isMesh&&o.material&&!Array.isArray(o.material)&&!o.material.isMeshBasicMaterial){o.castShadow=true;o.receiveShadow=true;}});}
function makeBox(w,h,d,mat){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);}
// limb that pivots at its top (hip/shoulder) so rotation swings like a real leg/arm
function makeLimb(w,h,d,mat,px,py,pz){const g=new THREE.Object3D();g.position.set(px,py,pz);const m=makeBox(w,h,d,mat);m.position.y=-h/2;g.add(m);return g;}
function makeLabelSprite(name,color){const lc=document.createElement('canvas');lc.width=128;lc.height=32;const lx=lc.getContext('2d');lx.fillStyle='rgba(0,0,0,0.5)';lx.fillRect(0,0,128,32);lx.fillStyle=color||'#fff';lx.font='bold 15px sans-serif';lx.textAlign='center';lx.fillText(name,64,22);const tex=new THREE.CanvasTexture(lc);const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));sp.scale.set(1.4,.35,1);return sp;}
function makeHpBar(width){const bg=makeBox(width,.08,.05,new THREE.MeshBasicMaterial({color:0x333333}));const fg=makeBox(width,.08,.06,new THREE.MeshBasicMaterial({color:0x44ff44}));fg.position.z=.01;return{bg,fg};}
function buildZombie(mat){
  const root=new THREE.Object3D();
  const skin=mat.clone();                          // green skin (head + arms) — keeps night glow
  const shirt=makeMat(0x2f6b6b,0x0a2626,0,.75);    // torn teal shirt (torso)
  const pants=makeMat(0x35356b,0x0a0a1a,0,.75);    // dark trousers (legs)
  const body=makeBox(.5,.72,.27,shirt);body.position.y=.3;
  // ragged shirt hem
  const hem=makeBox(.52,.14,.29,makeMat(0x265a5a,0,0,.8));hem.position.y=-.32;body.add(hem);
  const head=makeBox(.55,.55,.55,skin);head.position.y=.92;
  const eyeM=new THREE.MeshBasicMaterial({color:0x140014});
  const el=makeBox(.12,.1,.06,eyeM);el.position.set(-.13,.02,.28);head.add(el);
  const er=makeBox(.12,.1,.06,eyeM.clone());er.position.set(.13,.02,.28);head.add(er);
  const brow=makeBox(.44,.05,.05,makeMat(0x254018,0,0,.8));brow.position.set(0,.12,.27);head.add(brow);
  // classic outstretched arms
  const armL=makeLimb(.22,.7,.22,skin.clone(),-.36,.55,0);armL.rotation.x=-Math.PI/2;
  const armR=makeLimb(.22,.7,.22,skin.clone(), .36,.55,0);armR.rotation.x=-Math.PI/2;
  const legL=makeLimb(.23,.75,.25,pants.clone(),-.13,-.1,0);
  const legR=makeLimb(.23,.75,.25,pants.clone(), .13,-.1,0);
  const hp=makeHpBar(.9);hp.bg.position.y=1.55;hp.fg.position.y=1.55;
  const lb=makeLabelSprite('Zombie','#88ff44');lb.position.y=1.78;
  root.add(body,head,armL,armR,legL,legR,hp.bg,hp.fg,lb);
  return{root,body,head,hpBar:hp.fg,legL,legR,armL,armR,armSwing:false};
}
function buildSkeleton(mat){
  const root=new THREE.Object3D();
  const bone=mat.clone();
  const body=makeBox(.38,.62,.2,bone.clone());body.position.y=.32;
  const spine=makeBox(.09,.62,.09,bone.clone());spine.position.set(0,0,-.05);body.add(spine);
  for(let i=0;i<3;i++){const rib=makeBox(.42,.06,.06,bone.clone());rib.position.set(0,.18-i*.17,.1);body.add(rib);}
  const pelvis=makeBox(.34,.12,.16,bone.clone());pelvis.position.y=-.32;body.add(pelvis);
  const head=makeBox(.5,.5,.5,bone.clone());head.position.y=.9;
  const eyeM=new THREE.MeshBasicMaterial({color:0x000000});
  const el=makeBox(.13,.14,.06,eyeM);el.position.set(-.12,.03,.26);head.add(el);
  const er=makeBox(.13,.14,.06,eyeM.clone());er.position.set(.12,.03,.26);head.add(er);
  const jaw=makeBox(.36,.07,.42,makeMat(0xb8b8a8,0,0,.8));jaw.position.set(0,-.22,0);head.add(jaw);
  for(let i=0;i<3;i++){const tooth=makeBox(.05,.06,.04,new THREE.MeshBasicMaterial({color:0x555544}));tooth.position.set(-.1+i*.1,-.18,.26);head.add(tooth);}
  // left arm hangs, right arm raised holding a bow
  const armL=makeLimb(.13,.7,.13,bone.clone(),-.28,.55,0);
  const armR=makeLimb(.13,.7,.13,bone.clone(), .28,.55,.05);armR.rotation.x=-1.3;
  const bowM=makeMat(0x6b4423,0,0,.6);const bow=new THREE.Object3D();
  const bu=makeBox(.06,.32,.06,bowM);bu.position.y=.16;bu.rotation.z=.22;
  const bd=makeBox(.06,.32,.06,bowM.clone());bd.position.y=-.16;bd.rotation.z=-.22;
  const bs=makeBox(.02,.64,.02,new THREE.MeshBasicMaterial({color:0xdedede}));bs.position.x=.06;
  bow.add(bu,bd,bs);bow.position.set(0,-.72,.05);armR.add(bow);
  const legL=makeLimb(.14,.75,.15,bone.clone(),-.11,-.12,0);
  const legR=makeLimb(.14,.75,.15,bone.clone(), .11,-.12,0);
  const hp=makeHpBar(.7);hp.bg.position.y=1.5;hp.fg.position.y=1.5;
  const lb=makeLabelSprite('Skeleton','#eeeeff');lb.position.y=1.72;
  root.add(body,head,armL,armR,legL,legR,hp.bg,hp.fg,lb);
  return{root,body,head,hpBar:hp.fg,legL,legR,armSwing:false};
}
function buildGolem(mat){
  const root=new THREE.Object3D();
  const iron=mat.clone();
  const moss=makeMat(0x4a7a32,0x0c1808,0,.85);
  const body=makeBox(1.1,1.15,.7,iron.clone());body.position.y=.28;
  const belt=makeBox(1.14,.2,.74,makeMat(0x3a4650,0x0a0e12,0,.7));belt.position.y=-.26;body.add(belt);
  const m1=makeBox(.32,.3,.04,moss);m1.position.set(.24,.1,.36);body.add(m1);
  const m2=makeBox(.2,.42,.04,moss.clone());m2.position.set(-.3,-.02,.36);body.add(m2);
  const head=makeBox(.5,.58,.5,iron.clone());head.position.y=1.05;
  const nose=makeBox(.16,.48,.2,iron.clone());nose.position.set(0,-.04,.26);head.add(nose);
  const eyeM=new THREE.MeshBasicMaterial({color:0xff2200});
  const el=makeBox(.1,.14,.06,eyeM);el.position.set(-.15,.16,.25);head.add(el);
  const er=makeBox(.1,.14,.06,eyeM.clone());er.position.set(.15,.16,.25);head.add(er);
  // heavy arms reaching toward the ground
  const armL=makeLimb(.34,1.3,.34,iron.clone(),-.78,.55,0);
  const armR=makeLimb(.34,1.3,.34,iron.clone(), .78,.55,0);
  const legL=makeLimb(.42,.55,.46,iron.clone(),-.27,-.3,0);
  const legR=makeLimb(.42,.55,.46,iron.clone(), .27,-.3,0);
  const hp=makeHpBar(1.4);hp.bg.position.y=1.5;hp.fg.position.y=1.5;
  const lb=makeLabelSprite('Golem','#aaaaaa');lb.position.y=1.72;
  root.add(body,head,armL,armR,legL,legR,hp.bg,hp.fg,lb);
  return{root,body,head,hpBar:hp.fg,legL,legR,armL,armR};
}
function buildFireDemon(mat){const root=new THREE.Object3D();const body=makeBox(.8,1.5,.65,mat.clone());const head=makeBox(.65,.65,.65,mat.clone());head.position.y=1.1;const eyeM=new THREE.MeshBasicMaterial({color:0xffff00});const el=makeBox(.16,.14,.07,eyeM);el.position.set(-.16,.06,.34);head.add(el);const er=makeBox(.16,.14,.07,eyeM.clone());er.position.set(.16,.06,.34);head.add(er);const hornM=new THREE.MeshStandardMaterial({color:0x220000,emissive:0x440000,emissiveIntensity:.5});const hornL=makeBox(.1,.45,.1,hornM);hornL.position.set(-.2,.48,.0);hornL.rotation.z=-.3;head.add(hornL);const hornR=makeBox(.1,.45,.1,hornM.clone());hornR.position.set(.2,.48,.0);hornR.rotation.z=.3;head.add(hornR);const wingM=new THREE.MeshStandardMaterial({color:0xcc2200,emissive:0x661100,emissiveIntensity:.4,transparent:true,opacity:.8});const wingL=makeBox(.12,1.1,.6,wingM);wingL.position.set(-.72,.1,-.1);wingL.rotation.z=.3;const wingR=makeBox(.12,1.1,.6,wingM.clone());wingR.position.set(.72,.1,-.1);wingR.rotation.z=-.3;const armM=mat.clone();const armL=makeBox(.25,.9,.25,armM);armL.position.set(-.55,.0,0);const armR=makeBox(.25,.9,.25,armM.clone());armR.position.set(.55,.0,0);const tail=makeBox(.18,.7,.18,mat.clone());tail.position.set(0,-.5,-.4);tail.rotation.x=.6;const hp=makeHpBar(.9);hp.bg.position.y=1.6;hp.fg.position.y=1.6;hp.fg.material.color.setHex(0xff6600);const lb=makeLabelSprite('FireDemon','#ff8800');lb.position.y=1.8;root.add(body,head,wingL,wingR,armL,armR,tail,hp.bg,hp.fg,lb);return{root,body,head,hpBar:hp.fg};}
function buildIceGolem(mat){const root=new THREE.Object3D();const body=makeBox(1.1,1.5,.9,mat.clone());const head=makeBox(.7,.6,.7,mat.clone());head.position.y=1.1;const eyeM=new THREE.MeshBasicMaterial({color:0x00ddff});const el=makeBox(.15,.12,.07,eyeM);el.position.set(-.18,.05,.36);head.add(el);const er=makeBox(.15,.12,.07,eyeM.clone());er.position.set(.18,.05,.36);head.add(er);const spikeM=new THREE.MeshStandardMaterial({color:0xaaddff,emissive:0x224466,emissiveIntensity:.4,transparent:true,opacity:.85});const spike1=makeBox(.15,.5,.15,spikeM);spike1.position.set(0,.45,.0);head.add(spike1);const spike2=makeBox(.12,.35,.12,spikeM.clone());spike2.position.set(-.22,.35,.0);spike2.rotation.z=.3;head.add(spike2);const spike3=makeBox(.12,.35,.12,spikeM.clone());spike3.position.set(.22,.35,.0);spike3.rotation.z=-.3;head.add(spike3);const armM=mat.clone();const armL=makeBox(.35,1.0,.35,armM);armL.position.set(-.75,-.1,0);const armR=makeBox(.35,1.0,.35,armM.clone());armR.position.set(.75,-.1,0);const hp=makeHpBar(1.1);hp.bg.position.y=1.55;hp.fg.position.y=1.55;hp.fg.material.color.setHex(0x44ddff);const lb=makeLabelSprite('IceGolem','#aaddff');lb.position.y=1.75;root.add(body,head,armL,armR,hp.bg,hp.fg,lb);return{root,body,head,hpBar:hp.fg};}

function buildBat(mat){
  const root=new THREE.Object3D();
  const body=makeBox(.35,.2,.3,mat.clone());
  const earL=makeBox(.07,.15,.06,mat.clone());earL.position.set(-.1,.17,-.05);body.add(earL);
  const earR=makeBox(.07,.15,.06,mat.clone());earR.position.set(.1,.17,-.05);body.add(earR);
  const eyeM=new THREE.MeshBasicMaterial({color:0xff2222});
  const el=makeBox(.07,.07,.05,eyeM);el.position.set(-.08,.03,.16);body.add(el);
  const er=makeBox(.07,.07,.05,eyeM.clone());er.position.set(.08,.03,.16);body.add(er);
  const lWingG=new THREE.Object3D();lWingG.position.set(-.175,0,0);
  const lWing=makeBox(.42,.06,.28,mat.clone());lWing.position.set(-.21,0,0);lWingG.add(lWing);
  const rWingG=new THREE.Object3D();rWingG.position.set(.175,0,0);
  const rWing=makeBox(.42,.06,.28,mat.clone());rWing.position.set(.21,0,0);rWingG.add(rWing);
  const hp=makeHpBar(.45);hp.bg.position.y=.42;hp.fg.position.y=.42;hp.fg.material.color.setHex(0xff4444);
  const lb=makeLabelSprite('Bat','#cc88ff');lb.position.y=.62;
  root.add(body,lWingG,rWingG,hp.bg,hp.fg,lb);
  return{root,body,head:body,hpBar:hp.fg,lWing:lWingG,rWing:rWingG};
}
function buildCaveSlime(mat){
  const root=new THREE.Object3D();
  const body=makeBox(1.0,.55,1.0,mat.clone());body.position.y=.27;
  const top=makeBox(.75,.35,.75,mat.clone());top.position.y=.66;
  const eyeM=new THREE.MeshBasicMaterial({color:0xffcc00});
  const el=makeBox(.14,.1,.07,eyeM);el.position.set(-.18,.05,.38);top.add(el);
  const er=makeBox(.14,.1,.07,eyeM.clone());er.position.set(.18,.05,.38);top.add(er);
  const hp=makeHpBar(.8);hp.bg.position.y=1.1;hp.fg.position.y=1.1;
  const lb=makeLabelSprite('スライム','#cc44ff');lb.position.y=1.3;
  root.add(body,top,hp.bg,hp.fg,lb);
  return{root,body,head:top,hpBar:hp.fg};
}
function buildAbyssBat(mat){
  const root=new THREE.Object3D();
  const body=makeBox(.55,.45,.4,mat.clone());
  const lWingG=new THREE.Object3D();lWingG.position.set(-.21,0,0);
  const lWing=makeBox(.52,.08,.36,mat.clone());lWing.position.set(-.26,0,0);lWingG.add(lWing);
  const rWingG=new THREE.Object3D();rWingG.position.set(.21,0,0);
  const rWing=makeBox(.52,.08,.36,mat.clone());rWing.position.set(.26,0,0);rWingG.add(rWing);
  const eyeM=new THREE.MeshBasicMaterial({color:0x00ffcc});
  const el=makeBox(.1,.09,.07,eyeM);el.position.set(-.14,.07,.21);body.add(el);
  const er=makeBox(.1,.09,.07,eyeM.clone());er.position.set(.14,.07,.21);body.add(er);
  const earL=makeBox(.1,.22,.08,mat.clone());earL.position.set(-.18,.32,.0);body.add(earL);
  const earR=makeBox(.1,.22,.08,mat.clone());earR.position.set(.18,.32,.0);body.add(earR);
  const hp=makeHpBar(.55);hp.bg.position.y=.52;hp.fg.position.y=.52;hp.fg.material.color.setHex(0xaa44ff);
  const lb=makeLabelSprite('深淵コウモリ','#9966ff');lb.position.y=.7;
  root.add(body,lWingG,rWingG,hp.bg,hp.fg,lb);
  return{root,body,head:body,hpBar:hp.fg,lWing:lWingG,rWing:rWingG};
}
function buildCrystalGolem(mat){
  const root=new THREE.Object3D();
  const cMat=new THREE.MeshStandardMaterial({color:0x44aacc,emissive:0x00bbff,emissiveIntensity:1.2,roughness:.1,transparent:true,opacity:.9});
  const body=makeBox(1.3,1.2,.95,mat.clone());body.position.y=-.1;
  const head=makeBox(.6,.52,.6,mat.clone());head.position.y=.9;
  const eyeM=new THREE.MeshBasicMaterial({color:0x00ffff});
  const el=makeBox(.13,.1,.07,eyeM);el.position.set(-.15,.04,.32);head.add(el);
  const er=makeBox(.13,.1,.07,eyeM.clone());er.position.set(.15,.04,.32);head.add(er);
  const sp1=makeBox(.18,.52,.18,cMat);sp1.position.set(.42,.6,.48);body.add(sp1);
  const sp2=makeBox(.16,.44,.16,cMat.clone());sp2.position.set(-.38,.55,.48);body.add(sp2);
  const sp3=makeBox(.14,.35,.14,cMat.clone());sp3.position.set(.12,.62,.48);body.add(sp3);
  const armL=makeBox(.38,1.1,.38,mat.clone());armL.position.set(-.88,-.15,0);
  const armR=makeBox(.38,1.1,.38,mat.clone());armR.position.set(.88,-.15,0);
  const hp=makeHpBar(1.3);hp.bg.position.y=1.4;hp.fg.position.y=1.4;hp.fg.material.color.setHex(0x00ccff);
  const lb=makeLabelSprite('クリスタルゴーレム','#00ddff');lb.position.y=1.6;
  root.add(body,head,armL,armR,hp.bg,hp.fg,lb);
  return{root,body,head,hpBar:hp.fg};
}
function buildCreeper(mat){
  const root=new THREE.Object3D();
  const green=mat.clone();
  const body=makeBox(.5,.85,.32,green);body.position.y=.42;
  const head=makeBox(.55,.55,.55,mat.clone());head.position.y=1.12;
  // 悲しげな目と口
  const faceM=new THREE.MeshBasicMaterial({color:0x0d1f08});
  const el=makeBox(.13,.13,.06,faceM);el.position.set(-.14,.08,.28);head.add(el);
  const er=makeBox(.13,.13,.06,faceM.clone());er.position.set(.14,.08,.28);head.add(er);
  const mouth=makeBox(.14,.2,.06,faceM.clone());mouth.position.set(0,-.12,.28);head.add(mouth);
  const mL=makeBox(.07,.14,.06,faceM.clone());mL.position.set(-.105,-.17,.28);head.add(mL);
  const mR=makeBox(.07,.14,.06,faceM.clone());mR.position.set(.105,-.17,.28);head.add(mR);
  // 4本の短い脚（前後2対。後脚はarmL/armRに割り当てて既存の歩行アニメで交互に動かす）
  const legFL=makeLimb(.2,.4,.2,mat.clone(),-.14,.02,.14);
  const legFR=makeLimb(.2,.4,.2,mat.clone(), .14,.02,.14);
  const legBL=makeLimb(.2,.4,.2,mat.clone(),-.14,.02,-.14);
  const legBR=makeLimb(.2,.4,.2,mat.clone(), .14,.02,-.14);
  const hp=makeHpBar(.8);hp.bg.position.y=1.62;hp.fg.position.y=1.62;
  const lb=makeLabelSprite('Creeper','#66ff44');lb.position.y=1.84;
  root.add(body,head,legFL,legFR,legBL,legBR,hp.bg,hp.fg,lb);
  return{root,body,head,hpBar:hp.fg,legL:legFL,legR:legFR,armL:legBR,armR:legBL};
}
function buildSpider(mat){
  const root=new THREE.Object3D();
  const fur=mat.clone();
  const body=makeBox(.8,.42,.95,fur);body.position.set(0,.42,-.2);
  const head=makeBox(.5,.42,.45,mat.clone());head.position.set(0,.44,.45);
  const eyeM=new THREE.MeshBasicMaterial({color:0xff2222});
  const e1=makeBox(.09,.09,.05,eyeM);e1.position.set(-.16,.06,.23);head.add(e1);
  const e2=makeBox(.09,.09,.05,eyeM.clone());e2.position.set(.16,.06,.23);head.add(e2);
  const e3=makeBox(.06,.06,.05,eyeM.clone());e3.position.set(-.06,.14,.23);head.add(e3);
  const e4=makeBox(.06,.06,.05,eyeM.clone());e4.position.set(.06,.14,.23);head.add(e4);
  const fangM=new THREE.MeshBasicMaterial({color:0xd8d8c8});
  const f1=makeBox(.06,.12,.05,fangM);f1.position.set(-.08,-.18,.22);head.add(f1);
  const f2=makeBox(.06,.12,.05,fangM.clone());f2.position.set(.08,-.18,.22);head.add(f2);
  // 左右4本ずつの脚（グループごと揺らす）
  const legLG=new THREE.Object3D();legLG.position.set(-.4,.42,-.1);
  const legRG=new THREE.Object3D();legRG.position.set(.4,.42,-.1);
  for(let i=0;i<4;i++){
    const ll=makeBox(.55,.07,.09,fur.clone());ll.position.set(-.28,-.06,-.32+i*.22);ll.rotation.z=.45;legLG.add(ll);
    const rl=makeBox(.55,.07,.09,fur.clone());rl.position.set(.28,-.06,-.32+i*.22);rl.rotation.z=-.45;legRG.add(rl);
  }
  const hp=makeHpBar(.85);hp.bg.position.y=1.0;hp.fg.position.y=1.0;hp.fg.material.color.setHex(0xff6644);
  const lb=makeLabelSprite('Spider','#ff8866');lb.position.y=1.2;
  root.add(body,head,legLG,legRG,hp.bg,hp.fg,lb);
  return{root,body,head,hpBar:hp.fg,legL:legLG,legR:legRG,armSwing:false};
}
function buildPhantom(mat){
  const root=new THREE.Object3D();
  const skin=mat.clone();
  const body=makeBox(.5,.2,1.0,skin);
  const head=makeBox(.34,.18,.3,mat.clone());head.position.set(0,.02,.55);
  const eyeM=new THREE.MeshBasicMaterial({color:0x66ff88});
  const el=makeBox(.09,.07,.05,eyeM);el.position.set(-.1,.04,.14);head.add(el);
  const er=makeBox(.09,.07,.05,eyeM.clone());er.position.set(.1,.04,.14);head.add(er);
  const lWingG=new THREE.Object3D();lWingG.position.set(-.25,.05,0);
  const lW1=makeBox(.6,.06,.7,skin.clone());lW1.position.set(-.3,0,0);lWingG.add(lW1);
  const lW2=makeBox(.35,.05,.45,skin.clone());lW2.position.set(-.62,.02,-.05);lWingG.add(lW2);
  const rWingG=new THREE.Object3D();rWingG.position.set(.25,.05,0);
  const rW1=makeBox(.6,.06,.7,skin.clone());rW1.position.set(.3,0,0);rWingG.add(rW1);
  const rW2=makeBox(.35,.05,.45,skin.clone());rW2.position.set(.62,.02,-.05);rWingG.add(rW2);
  const tail=makeBox(.2,.08,.4,skin.clone());tail.position.set(0,0,-.62);
  const hp=makeHpBar(.6);hp.bg.position.y=.5;hp.fg.position.y=.5;hp.fg.material.color.setHex(0x88aaff);
  const lb=makeLabelSprite('Phantom','#88aaff');lb.position.y=.7;
  root.add(body,head,lWingG,rWingG,tail,hp.bg,hp.fg,lb);
  return{root,body,head:body,hpBar:hp.fg,lWing:lWingG,rWing:rWingG};
}
function buildDiamondDragon(){
  const root=new THREE.Object3D();
  const bMat=makeMat(0xc2f7ff,0x22d6ff,1.35,.02);
  const cMat=makeMat(0xe9fdff,0x66f2ff,2.0,.0);
  const coreMat=new THREE.MeshStandardMaterial({color:0xeaffff,emissive:0x66ffff,emissiveIntensity:2.4,roughness:.02,metalness:.12,transparent:true,opacity:.92});
  const eyeM=new THREE.MeshBasicMaterial({color:0xaaf0ff});
  // Body
  const body=makeBox(.9,1.0,.7,bMat.clone());
  // Neck
  const neck=makeBox(.38,.42,.38,bMat.clone());neck.position.set(0,.62,.18);
  // Head
  const head=makeBox(.55,.5,.58,bMat.clone());head.position.set(0,.88,.32);
  // Snout
  const snout=makeBox(.32,.2,.38,bMat.clone());snout.position.set(0,-.1,.32);head.add(snout);
  // Eyes (blue-white glow)
  const eyeL=makeBox(.12,.12,.07,eyeM);eyeL.position.set(-.17,.06,.3);head.add(eyeL);
  const eyeR=makeBox(.12,.12,.07,eyeM.clone());eyeR.position.set(.17,.06,.3);head.add(eyeR);
  // Crown crystal spikes
  for(let i=0;i<3;i++){const hh=makeBox(.1,.28+i*.04,.1,cMat.clone());hh.position.set((i-1)*.2,.3+i*.03,-.04);head.add(hh);}
  const spikeL=makeBox(.08,.18,.08,cMat.clone());spikeL.position.set(-.3,.12,.0);spikeL.rotation.z=.5;head.add(spikeL);
  const spikeR=makeBox(.08,.18,.08,cMat.clone());spikeR.position.set(.3,.12,.0);spikeR.rotation.z=-.5;head.add(spikeR);
  // Crystal wings (flat angular panels)
  const wingLG=new THREE.Object3D();wingLG.position.set(-.45,.15,-.05);
  const wingLa=makeBox(.7,.07,.85,cMat.clone());wingLa.position.set(-.35,.0,.0);wingLa.rotation.z=.28;wingLG.add(wingLa);
  const wingLb=makeBox(.38,.05,.48,cMat.clone());wingLb.position.set(-.32,.05,.22);wingLa.add(wingLb);
  const wingRG=new THREE.Object3D();wingRG.position.set(.45,.15,-.05);
  const wingRa=makeBox(.7,.07,.85,cMat.clone());wingRa.position.set(.35,.0,.0);wingRa.rotation.z=-.28;wingRG.add(wingRa);
  const wingRb=makeBox(.38,.05,.48,cMat.clone());wingRb.position.set(.32,.05,.22);wingRa.add(wingRb);
  // Crystal scales on body
  for(let i=0;i<4;i++){const sc=makeBox(.12,.09,.1,cMat.clone());sc.position.set(i%2===0?-.28:.28,.3-i*.15,.37);body.add(sc);}
  // Diamond facets around torso
  for(let i=0;i<6;i++){
    const ang=(i/6)*Math.PI*2;
    const ft=makeBox(.09,.3,.13,cMat.clone());
    ft.position.set(Math.sin(ang)*.43,.08,Math.cos(ang)*.2);
    ft.rotation.y=ang;
    body.add(ft);
  }
  // Tail
  const tail=makeBox(.3,.3,.85,bMat.clone());tail.position.set(0,-.1,-.72);tail.rotation.x=.2;
  const tailTip=makeBox(.15,.15,.3,cMat.clone());tailTip.position.set(0,0,-.58);tail.add(tailTip);
  // Chest core (pulsing diamond crystal)
  const core=makeBox(.3,.3,.12,coreMat);core.position.set(0,.12,.37);
  // HP bar (cyan)
  const hp=makeHpBar(1.3);hp.bg.position.y=1.75;hp.fg.position.y=1.75;hp.fg.material.color.setHex(0x00e5ff);
  const lb=makeLabelSprite('💎Dragon','#00e5ff');lb.position.y=1.98;
  root.add(body,neck,head,wingLG,wingRG,tail,core,hp.bg,hp.fg,lb);
  return{root,body,head,hpBar:hp.fg,core,wingL:wingLG,wingR:wingRG};
}
const ENEMY_TYPES=[
  {name:'Zombie',  color:0x447733,emissive:0x112200,hp:3,dmg:10,score:50, builder:buildZombie,              breakPow:1,  breakSoft:true, breakChance:.3, breakCd0:6},
  {name:'Skeleton',color:0xddddcc,emissive:0x888877,hp:2,dmg:8, score:40, builder:buildSkeleton,emissiveIntensity:.25, breakPow:0},
  {name:'Golem',   color:0x556677,emissive:0x111822,hp:8,dmg:20,score:100,builder:buildGolem,               breakPow:3,  breakCd0:3},
  {name:'FireDemon',color:0xcc3300,emissive:0x661100,hp:5,dmg:15,score:80,builder:buildFireDemon,lava:true,  breakPow:2.5,firePow:true,  breakCd0:3.5},
  {name:'IceGolem',color:0x88bbdd,emissive:0x224466,hp:6,dmg:12,score:70,builder:buildIceGolem,ice:true,    breakPow:2,  breakCd0:4},
  {name:'Bat',        color:0x2a1a3a,emissive:0x220033,emissiveIntensity:.2, hp:2,dmg:5, score:30, builder:buildBat,        bat:true,   breakPow:0},
  {name:'CaveSlime',  color:0x331155,emissive:0x660099,emissiveIntensity:.3, hp:2,dmg:5, score:35, builder:buildCaveSlime,              breakPow:0},
  {name:'AbyssBat',   color:0x050010,emissive:0x440088,emissiveIntensity:.25,hp:3,dmg:9, score:55, builder:buildAbyssBat,  bat:true,   breakPow:0},
  {name:'CrystalGolem',color:0x1e3040,emissive:0x00aacc,emissiveIntensity:.3,hp:10,dmg:22,score:120,builder:buildCrystalGolem,crystal:true,breakPow:3,breakCd0:3.5},
  // ─── 地上の新敵バリエーション ───
  // Creeper: 近づくと点火→膨張→爆発(ブロック破壊)。点火中は動かない=走れば逃げられる
  // Spider: 高速で壁をよじ登る。高い壁だけでは防げない
  // Phantom: 夜だけ出現する飛行敵(bat AI)。朝日を浴びると燃えて消滅
  {name:'Creeper', color:0x4fae3d,emissive:0x123b0a,hp:4,dmg:6, score:90,builder:buildCreeper,creeper:true,spdMul:.9, breakPow:0},
  {name:'Spider',  color:0x3a2b28,emissive:0x1a0d0d,hp:3,dmg:9, score:60,builder:buildSpider, spider:true, spdMul:1.3,breakPow:0},
  {name:'Phantom', color:0x46608c,emissive:0x2244aa,emissiveIntensity:.3,hp:3,dmg:12,score:75,builder:buildPhantom,bat:true,phantom:true,breakPow:0},
];
const ET_CREEPER=9,ET_SPIDER=10,ET_PHANTOM=11;
let enemies=[];
// 💣 クリーパーの爆発: プレイヤー・相棒・他の敵にダメージを与え、周囲のブロックを
// 吹き飛ばす（⬛黒曜石・水・溶岩は壊れない）。爆発による自滅にはスコアが入らない。
function creeperExplode(e){
  const ep=e.root.position;
  spawnParticles(ep.x,ep.y+.3,ep.z,0xffaa33,8);
  spawnParticles(ep.x,ep.y+.6,ep.z,0x88ff66,6);
  sfxThunder();playTone(120,.25,.3,'square');
  const R=3.2;
  const pd=Math.hypot(ep.x-P.x,ep.z-P.z);
  if(pd<R&&Math.abs(P.y+1-ep.y)<3.2)dmgPlayer(Math.min(24+gs.wave*1.2,endlessMode?60:40)*(1-(pd/R)*.55));
  for(const en of[...enemies]){if(en===e)continue;const p2=en.root.position;if(Math.hypot(p2.x-ep.x,p2.z-ep.z)<R)hitEnemy(en,12);}
  if(pet&&pet.downT<=0){const pp=pet.root.position;if(Math.hypot(pp.x-ep.x,pp.z-ep.z)<R)hitPet(10);}
  const bx=Math.floor(ep.x),by=Math.floor(ep.y-.4),bz=Math.floor(ep.z);
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
    if(dx*dx+dy*dy+dz*dz>2)continue;
    const x=bx+dx,y=by+dy,z=bz+dz,k=vKey(x,y,z);const v=voxels[k];
    if(!v||!v.active||v.ti===WATER_BLOCK||v.ti===LAVA_BLOCK||v.ti===OBSIDIAN_BLOCK)continue;
    spawnBlockDebris(x+.5,y+.5,z+.5,v.ti);
    if(v.playerPlaced)delete worldEdits.placed[k];else worldEdits.removed[k]=true;
    removeBlock(x,y,z);
  }
}
function spawnEnemy(){
  let angle=Math.random()*Math.PI*2,dist=20+Math.random()*10;
  let sx=P.x+Math.cos(angle)*dist,sz=P.z+Math.sin(angle)*dist;
  const h=getHeight(Math.floor(sx),Math.floor(sz));
  const biome=getBiome(Math.floor(sx),Math.floor(sz));
  let et;
  if(biome===BIOMES.VOLCANO&&Math.random()<.55)et=ENEMY_TYPES[3];
  else if(biome===BIOMES.SNOW&&Math.random()<.55)et=ENEMY_TYPES[4];
  else{
    // WAVEが進むほど新顔が混ざる。ファントムは夜（または満月の夜）限定
    const r=Math.random(),isNightNow=gs.time>=.4&&gs.time<=.9;
    if(gs.wave>=4&&r<.16)et=ENEMY_TYPES[ET_CREEPER];
    else if(gs.wave>=3&&r<.32)et=ENEMY_TYPES[ET_SPIDER];
    else if((gs.wave>=6||fullMoonNight)&&isNightNow&&r<.52)et=ENEMY_TYPES[ET_PHANTOM];
    else et=ENEMY_TYPES[Math.floor(Math.random()*3)];
  }
  const mat=makeMat(et.color,et.emissive,et.emissiveIntensity||.15,.6);
  const built=et.builder(mat);
  built.root.position.set(sx,h+(et.bat?4.5:1.85),sz);markShadowCaster(built.root);scene.add(built.root);
  const mhp=et.hp+Math.floor(gs.wave*.7);
  enemies.push({root:built.root,body:built.body,head:built.head,hpBar:built.hpBar,hp:mhp,maxHp:mhp,type:et,velY:0,onGround:false,atkCd:0,stuckT:0,lastX:sx,lastZ:sz,flashMeshes:[built.body,built.head],dead:false,breakCd:0,lWing:built.lWing,rWing:built.rWing});
}
const UNDER_SPAWN_CD=isTouch?10:8,UNDER_MAX=5;
let dragon=null,dragonSpawnT=90,dragonWarnPending=false;
let finalBossPending=false;
let underSpawnT=0;
function spawnUnderEnemy(){
  for(let attempt=0;attempt<15;attempt++){
    const angle=Math.random()*Math.PI*2,dist=8+Math.random()*10;
    const sx=Math.round(P.x+Math.cos(angle)*dist),sz=Math.round(P.z+Math.sin(angle)*dist);
    for(let dy=-3;dy<=3;dy++){
      const sy=Math.floor(P.y)+dy;
      if(sy>=0)continue;
      if(voxels[vKey(sx,sy,sz)])continue;
      const vf=voxels[vKey(sx,sy-1,sz)];
      if(!vf||!vf.active||vf.ti===WATER_BLOCK||vf.ti===LAVA_BLOCK)continue;
      const depth=-sy;
      let et,r=Math.random();
      // Underground enemy tiers: bats/slimes in shallow caves, abyss bats in
      // mid/deep caves, and crystal golems only in the deepest layer.
      if(depth>=22){et=r<.65?ENEMY_TYPES[7]:ENEMY_TYPES[8];}
      else if(depth>=12){et=r<.45?ENEMY_TYPES[7]:r<.75?ENEMY_TYPES[6]:ENEMY_TYPES[5];}
      else et=r<.55?ENEMY_TYPES[5]:ENEMY_TYPES[6];
      const mat=makeMat(et.color,et.emissive,et.emissiveIntensity||.15,.6);
      const built=et.builder(mat);
      built.root.position.set(sx+.5,sy+.85,sz+.5);markShadowCaster(built.root);scene.add(built.root);
      const mhp=et.hp+Math.floor(depth*0.08)+Math.floor(gs.wave*.3);
      enemies.push({root:built.root,body:built.body,head:built.head,hpBar:built.hpBar,hp:mhp,maxHp:mhp,type:et,velY:0,onGround:false,atkCd:0,stuckT:0,lastX:sx+.5,lastZ:sz+.5,flashMeshes:[built.body,built.head],dead:false,breakCd:0,lWing:built.lWing,rWing:built.rWing});
      return;
    }
  }
}
function spawnDiamondDragon(){
  dragonWarnPending=false;
  if(dragon||P.y>=-1)return;
  const angle=Math.random()*Math.PI*2,dist=12+Math.random()*6;
  const sx=P.x+Math.cos(angle)*dist,sz=P.z+Math.sin(angle)*dist;
  const built=buildDiamondDragon();
  built.root.position.set(sx,P.y+1.0,sz);
  markShadowCaster(built.root);
  scene.add(built.root);
  const mhp=80+gs.wave*3;
  dragon={root:built.root,body:built.body,head:built.head,hpBar:built.hpBar,core:built.core,wingL:built.wingL,wingR:built.wingR,hp:mhp,maxHp:mhp,state:'prowl',stateT:3,coreT:0,atkCd:0,chargeDir:{x:1,z:0},flashT:0};
  dragonSpawnT=180;
  showAlert('💎 ダイヤモンドドラゴン現る！💎装備が必要！');
  sfxBossAppear();
}
function hitDragon(dmg,isDiamond){
  if(!dragon)return;
  if(!isDiamond){
    showBonus('NO EFFECT! 💎装備が必要');
    playTone(80,.15,.12,'square');
    dragon.body.material.emissive.setHex(0x441100);dragon.body.material.emissiveIntensity=1.5;
    setTimeout(()=>{if(dragon){dragon.body.material.emissive.setHex(0x001020);dragon.body.material.emissiveIntensity=.3;}},120);
    return;
  }
  dragon.hp-=dmg;dragon.flashT=.15;
  dragon.body.material.emissive.setHex(0xffffff);dragon.body.material.emissiveIntensity=2;
  dragon.head.material.emissive.setHex(0xffffff);dragon.head.material.emissiveIntensity=2;
  dragon.hpBar.scale.x=Math.max(.01,dragon.hp/dragon.maxHp);
  sfxBossDmg();
  if(dragon.hp<=0)killDragon();
}
function killDragon(){
  if(!dragon)return;
  const dp=dragon.root.position;
  for(let i=0;i<8;i++)setTimeout(()=>spawnParticles(dp.x+(Math.random()-.5)*3,dp.y+(Math.random()-.5)*1.5,dp.z+(Math.random()-.5)*3,0x00e5ff,5),i*80);
  const hadDiamond=inv.diamond>0;inv.diamond+=4;inv.dragonCore+=1;updateInvHUD();if(!hadDiamond)unlockAchievement('firstDiamond');
  gs.score+=2000;gs.kills++;
  scene.remove(dragon.root);disposeObject3D(dragon.root);dragon=null;
  dragonSpawnT=180;
  showAlert('💠 DIAMOND DRAGON DEFEATED!');
  playTone(1800,.3,.4,'sine');setTimeout(()=>playTone(2200,.2,.3,'sine'),180);setTimeout(()=>playTone(2600,.15,.4,'sine'),360);
  setTimeout(()=>showBonus('💠 ドラゴンコア×1 獲得！ 像をクラフトしよう'),1200);
}
function moveEnemy(e,vx,vz,dt){const p=e.root.position,fy=p.y-.85;e.velY-=GRAV*dt;const nx=p.x+vx*dt;if(!overlaps(nx,fy,p.z,.5,1.7))p.x=nx;const nz=p.z+vz*dt;if(!overlaps(p.x,fy,nz,.5,1.7))p.z=nz;const ny=fy+e.velY*dt;if(!overlaps(p.x,ny,p.z,.5,1.7)){p.y=ny+.85;e.onGround=false;}else{if(e.velY<0)e.onGround=true;e.velY=0;}if(p.y<-38)e.hp=0;}

// ═══ BOSS ═══
const BOSS_DEFS=[
  {wave:5, name:'💀 スケルトンキング',color:0xaaaaee,emissive:0x3333aa,baseHp:60, dmg:18,score:800, scale:2.2,patterns:['multishot','charge','stomp'],   deathColor:0x8888ff},
  {wave:10,name:'🔥 炎のゴーレム',  color:0x3a2415,emissive:0xbb2200,baseHp:110,dmg:28,score:1500,scale:2.8,patterns:['charge','aoeBlast','multishot'], deathColor:0xff6600},
  {wave:13,name:'🦴 スケルトンウォーロード',color:0xbbccee,emissive:0x2244aa,baseHp:95,dmg:22,score:1200,scale:1.8,patterns:['multishot','charge','stomp'],deathColor:0x8899ff,miniBoss:true,diamondDrop:2},
  {wave:15,name:'👁 ダークアイ',    color:0x220044,emissive:0x550088,baseHp:175,dmg:35,score:2500,scale:3.2,patterns:['omnishot','charge','aoeBlast'],  deathColor:0xaa00ff},
  {wave:17,name:'🔮 ダークウィザード',color:0x1a0030,emissive:0x7700bb,baseHp:145,dmg:30,score:1800,scale:2.0,patterns:['omnishot','aoeBlast','charge'],deathColor:0xbb44ff,miniBoss:true,diamondDrop:3},
  {wave:20,name:'💎 キングダイヤモンドドラゴン',color:0x0a1520,emissive:0x00aaff,baseHp:260,dmg:45,score:8000,scale:2.0,patterns:['multishot','omnishot','charge','stomp','aoeBlast'],deathColor:0x00e5ff,finalBoss:true},
];
let boss=null;
const $bossWrap=document.getElementById('bossHpWrap'),$bossName=document.getElementById('bossName'),$bossHpFill=document.getElementById('bossHpFill'),$bossPhase=document.getElementById('bossPhase');
function buildKingDragon(sc,def){
  const root=new THREE.Object3D();
  const bMat=makeMat(0xd5fbff,0x3de6ff,1.6,.02);
  const cMat=makeMat(0xf0feff,0x8af8ff,2.5,.0);
  const coreMat=makeMat(0xffffff,0x9cffff,3.2,.0);
  const eyeM=new THREE.MeshBasicMaterial({color:0xffffff});
  const g=new THREE.Object3D();g.position.y=-0.5*sc;root.add(g);
  const body=makeBox(1.0*sc,.88*sc,1.8*sc,bMat.clone());g.add(body);
  const chest=makeBox(.55*sc,.45*sc,.1*sc,cMat.clone());chest.position.set(0,.08*sc,.92*sc);body.add(chest);
  const core=makeBox(.28*sc,.28*sc,.12*sc,coreMat.clone());core.position.set(0,.08*sc,.97*sc);body.add(core);
  const chestGem=makeBox(.42*sc,.42*sc,.16*sc,cMat.clone());chestGem.position.set(0,.08*sc,.84*sc);chestGem.rotation.y=Math.PI/4;body.add(chestGem);
  const chestGem2=makeBox(.22*sc,.5*sc,.12*sc,cMat.clone());chestGem2.position.set(0,.08*sc,.84*sc);chestGem2.rotation.x=Math.PI/4;body.add(chestGem2);
  for(let i=0;i<4;i++){const sp=makeBox(.1*sc,(.32-.04*i)*sc,.09*sc,cMat.clone());sp.position.set(0,.48*sc,(.6-.4*i)*sc);body.add(sp);}
  for(let i=0;i<4;i++){const sl=makeBox(.1*sc,.18*sc,.14*sc,cMat.clone());sl.position.set(-.52*sc,(.08+.08*i)*sc,(.55-.36*i)*sc);sl.rotation.z=.4;body.add(sl);const sr=sl.clone();sr.position.x=.52*sc;sr.rotation.z=-.4;body.add(sr);}
  for(let i=0;i<8;i++){
    const ang=(i/8)*Math.PI*2;
    const facet=makeBox(.09*sc,.32*sc,.14*sc,cMat.clone());
    facet.position.set(Math.sin(ang)*.58*sc,.06*sc,Math.cos(ang)*.75*sc);
    facet.rotation.y=ang;
    body.add(facet);
  }
  const neck=makeBox(.4*sc,.52*sc,.4*sc,bMat.clone());neck.position.set(0,.55*sc,.88*sc);neck.rotation.x=-.3;g.add(neck);
  const head=makeBox(.75*sc,.6*sc,.9*sc,bMat.clone());head.position.set(0,1.1*sc,1.42*sc);g.add(head);
  const snout=makeBox(.42*sc,.32*sc,.52*sc,bMat.clone());snout.position.set(0,-.14*sc,.52*sc);head.add(snout);
  const njL=makeBox(.07*sc,.15*sc,.06*sc,cMat.clone());njL.position.set(-.13*sc,-.14*sc,.28*sc);snout.add(njL);
  const njR=njL.clone();njR.position.x=.13*sc;snout.add(njR);
  const eyeL=makeBox(.13*sc,.13*sc,.07*sc,eyeM.clone());eyeL.position.set(-.25*sc,.1*sc,.47*sc);head.add(eyeL);
  const eyeR=makeBox(.13*sc,.13*sc,.07*sc,eyeM.clone());eyeR.position.set(.25*sc,.1*sc,.47*sc);head.add(eyeR);
  const h0=makeBox(.1*sc,.52*sc,.09*sc,cMat.clone());h0.position.set(0,.44*sc,-.06*sc);h0.rotation.x=.28;head.add(h0);
  const hL=makeBox(.09*sc,.4*sc,.09*sc,cMat.clone());hL.position.set(-.26*sc,.36*sc,-.05*sc);hL.rotation.set(.22,0,-.38);head.add(hL);
  const hR=makeBox(.09*sc,.4*sc,.09*sc,cMat.clone());hR.position.set(.26*sc,.36*sc,-.05*sc);hR.rotation.set(.22,0,.38);head.add(hR);
  const jcL=makeBox(.07*sc,.16*sc,.06*sc,cMat.clone());jcL.position.set(-.14*sc,-.15*sc,.28*sc);snout.add(jcL);
  const jcR=jcL.clone();jcR.position.x=.14*sc;snout.add(jcR);
  function makeWing(side){const wg=new THREE.Object3D();const w1=makeBox(1.2*sc,.06*sc,1.5*sc,cMat.clone());w1.position.set(side*.6*sc,0,0);w1.rotation.z=side*.28;wg.add(w1);const w2=makeBox(.75*sc,.05*sc,.9*sc,cMat.clone());w2.position.set(side*1.25*sc,-.32*sc,-.08*sc);w2.rotation.z=side*.52;wg.add(w2);const wt=makeBox(.11*sc,.11*sc,.42*sc,cMat.clone());wt.position.set(side*1.75*sc,-.52*sc,-.18*sc);wg.add(wt);return wg;}
  const wingL=makeWing(-1);wingL.position.set(-.5*sc,.26*sc,.18*sc);g.add(wingL);
  const wingR=makeWing(1);wingR.position.set(.5*sc,.26*sc,.18*sc);g.add(wingR);
  function makeLeg(){const lg=new THREE.Object3D();lg.add(makeBox(.3*sc,.45*sc,.28*sc,bMat.clone()));const lo=makeBox(.22*sc,.38*sc,.22*sc,bMat.clone());lo.position.y=-.42*sc;lg.add(lo);const ft=makeBox(.36*sc,.1*sc,.44*sc,cMat.clone());ft.position.y=-.66*sc;lg.add(ft);return lg;}
  const legFL=makeLeg();legFL.position.set(-.52*sc,-.44*sc,.62*sc);g.add(legFL);
  const legFR=makeLeg();legFR.position.set(.52*sc,-.44*sc,.62*sc);g.add(legFR);
  const legBL=makeLeg();legBL.position.set(-.52*sc,-.44*sc,-.62*sc);g.add(legBL);
  const legBR=makeLeg();legBR.position.set(.52*sc,-.44*sc,-.62*sc);g.add(legBR);
  const tail1=makeBox(.38*sc,.32*sc,.8*sc,bMat.clone());tail1.position.set(0,-.1*sc,-1.08*sc);tail1.rotation.x=.18;g.add(tail1);
  const tail2=makeBox(.26*sc,.22*sc,.62*sc,bMat.clone());tail2.position.set(0,-.08*sc,-.76*sc);tail2.rotation.x=.22;tail1.add(tail2);
  const tailTip=makeBox(.14*sc,.14*sc,.28*sc,cMat.clone());tailTip.position.set(0,-.04*sc,-.44*sc);tail2.add(tailTip);
  for(let i=0;i<3;i++){const ts=makeBox(.08*sc,(.2-.04*i)*sc,.07*sc,cMat.clone());ts.position.set(0,.18*sc,(.22-.22*i)*sc);tail1.add(ts);}
  const hpBg=makeBox(2.8*sc,.14,.07,new THREE.MeshBasicMaterial({color:0x003344}));hpBg.position.y=1.9*sc;root.add(hpBg);
  const hpFg=makeBox(2.8*sc,.14,.08,new THREE.MeshBasicMaterial({color:0x00e5ff}));hpFg.position.y=1.9*sc;hpFg.position.z=.01;root.add(hpFg);
  const lc=document.createElement('canvas');lc.width=256;lc.height=48;const lx=lc.getContext('2d');lx.fillStyle='rgba(0,0,0,.65)';lx.fillRect(0,0,256,48);lx.fillStyle='#00e5ff';lx.font='bold 14px sans-serif';lx.textAlign='center';lx.fillText(def.name,128,32);
  const tex=new THREE.CanvasTexture(lc);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));sprite.scale.set(4.5*sc,.65*sc,1);sprite.position.y=2.3*sc;root.add(sprite);
  return{root,body,head,hpBar:hpFg,mat:bMat};
}
function buildBoss(def,sc){
  if(def.finalBoss)return buildKingDragon(sc,def);
  const visualWave=def.baseWave||def.wave;
  const root=new THREE.Object3D();
  const mat=new THREE.MeshStandardMaterial({color:def.color,roughness:.5,emissive:def.emissive,emissiveIntensity:.35});
  const body=new THREE.Mesh(new THREE.BoxGeometry(.85*sc,1.7*sc,.85*sc),mat.clone());
  const head=new THREE.Mesh(new THREE.BoxGeometry(.7*sc,.7*sc,.7*sc),mat.clone());head.position.y=1.15*sc;
  const glow=(w,h,d,c)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({color:c}));
  if(visualWave===5||visualWave===13){
    // 骸骨共通: 眼窩＋光る瞳＋鼻孔＋歯＋肋骨＋背骨＋骨の腕
    const boneM=()=>makeMat(0xe8e0cc,0x444455,.25,.55);
    const sockL=glow(.2*sc,.22*sc,.06*sc,0x05050a);sockL.position.set(-.17*sc,.12*sc,.33*sc);head.add(sockL);
    const sockR=sockL.clone();sockR.position.x=.17*sc;head.add(sockR);
    const pupL=glow(.1*sc,.1*sc,.05*sc,visualWave===5?0xff2200:0x44ddff);pupL.position.set(-.17*sc,.12*sc,.36*sc);head.add(pupL);
    const pupR=pupL.clone();pupR.position.x=.17*sc;head.add(pupR);
    const nose=glow(.08*sc,.12*sc,.05*sc,0x05050a);nose.position.set(0,-.06*sc,.35*sc);head.add(nose);
    const jaw=glow(.44*sc,.05*sc,.05*sc,0x05050a);jaw.position.set(0,-.21*sc,.35*sc);head.add(jaw);
    for(let i=0;i<4;i++){const th=makeBox(.08*sc,.1*sc,.04*sc,boneM());th.position.set((-.15+i*.1)*sc,-.28*sc,.36*sc);head.add(th);}
    for(let i=0;i<4;i++){const rib=makeBox(.62*sc,.08*sc,.05*sc,boneM());rib.position.set(0,(.6-.22*i)*sc,.43*sc);body.add(rib);}
    const spine=makeBox(.1*sc,1.05*sc,.05*sc,boneM());spine.position.set(0,.1*sc,.43*sc);body.add(spine);
    const pelvis=makeBox(.5*sc,.14*sc,.05*sc,boneM());pelvis.position.set(0,-.55*sc,.43*sc);body.add(pelvis);
    const armG=new THREE.BoxGeometry(.15*sc,1.15*sc,.15*sc);
    const aL=new THREE.Mesh(armG,boneM());aL.position.set(-.56*sc,-.08*sc,0);aL.rotation.z=.12;root.add(aL);
    const aR=new THREE.Mesh(armG,boneM());aR.position.set(.56*sc,-.08*sc,0);aR.rotation.z=-.12;root.add(aR);
    if(visualWave===5){
      // 王: 黄金の王冠＋宝石＋真紅のマント
      const crownM=new THREE.MeshStandardMaterial({color:0xffd700,emissive:0x886600,emissiveIntensity:.5});
      const band=new THREE.Mesh(new THREE.BoxGeometry(.56*sc,.12*sc,.56*sc),crownM);band.position.y=.38*sc;head.add(band);
      for(let i=0;i<5;i++){const spike=new THREE.Mesh(new THREE.BoxGeometry(.09*sc,(i===2?.34:.2)*sc,.09*sc),crownM.clone());spike.position.set((-.22+i*.11)*sc,(i===2?.58:.52)*sc,.2*sc);head.add(spike);}
      const jewel=glow(.1*sc,.1*sc,.05*sc,0xff2266);jewel.position.set(0,.38*sc,.29*sc);head.add(jewel);
      const capeM=()=>makeMat(0x8a0a1a,0x330000,.3,.8);
      const mantle=makeBox(1.2*sc,.18*sc,.7*sc,capeM());mantle.position.set(0,.78*sc,-.12*sc);root.add(mantle);
      const cape=makeBox(.95*sc,1.5*sc,.07*sc,capeM());cape.position.set(0,-.02*sc,-.48*sc);root.add(cape);
    }else{
      // 武将: 角付き兜＋トゲ肩鎧＋バトルアックス
      const ironM=()=>makeMat(0x38404c,0x111820,.3,.45);
      const helm=makeBox(.78*sc,.28*sc,.78*sc,ironM());helm.position.y=.32*sc;head.add(helm);
      const hornL=makeBox(.12*sc,.44*sc,.12*sc,boneM());hornL.position.set(-.42*sc,.5*sc,0);hornL.rotation.z=.5;head.add(hornL);
      const hornR=hornL.clone();hornR.rotation.z=-.5;hornR.position.x=.42*sc;head.add(hornR);
      const pdL=makeBox(.42*sc,.22*sc,.52*sc,ironM());pdL.position.set(-.56*sc,.72*sc,0);root.add(pdL);
      const pdR=pdL.clone();pdR.position.x=.56*sc;root.add(pdR);
      const spkL=makeBox(.1*sc,.3*sc,.1*sc,ironM());spkL.position.set(-.6*sc,.95*sc,0);root.add(spkL);
      const spkR=spkL.clone();spkR.position.x=.6*sc;root.add(spkR);
      const haft=makeBox(.09*sc,1.55*sc,.09*sc,makeMat(0x5a3a1a,0,0,.85));haft.position.set(.76*sc,.3*sc,.22*sc);haft.rotation.x=.12;root.add(haft);
      const bladeL=makeBox(.12*sc,.6*sc,.42*sc,ironM());bladeL.position.set(0,.52*sc,.27*sc);haft.add(bladeL);
      const bladeR=bladeL.clone();bladeR.position.z=-.27*sc;haft.add(bladeR);
      const edgeL=glow(.09*sc,.54*sc,.06*sc,0x66eeff);edgeL.position.set(0,.52*sc,.5*sc);haft.add(edgeL);
      const edgeR=edgeL.clone();edgeR.position.z=-.5*sc;haft.add(edgeR);
    }
  }
  else if(visualWave===10){
    // ゴーレム: 岩の巨体＋溶岩の亀裂＋燃える頭と拳
    body.scale.x=1.3;body.scale.z=1.2;head.scale.set(.85,.8,.85);head.position.y=1.08*sc;
    const rockM=()=>makeMat(0x332112,0x441100,.3,.95);
    const lavaC=[0xff4400,0xff7700,0xffbb00];
    for(let i=0;i<6;i++){const crack=glow(.07*sc,(.3+(i%3)*.15)*sc,.05*sc,lavaC[i%3]);crack.position.set((-.3+i*.12)*sc,(.5-(i%4)*.28)*sc,.44*sc);crack.rotation.z=(i%2?.35:-.35);body.add(crack);}
    const core=glow(.3*sc,.3*sc,.08*sc,0xffcc33);core.position.set(0,.28*sc,.45*sc);core.rotation.z=Math.PI/4;body.add(core);
    const eL=glow(.16*sc,.12*sc,.06*sc,0xffcc00);eL.position.set(-.18*sc,.08*sc,.36*sc);head.add(eL);
    const eR=eL.clone();eR.position.x=.18*sc;head.add(eR);
    const brow=makeBox(.6*sc,.12*sc,.14*sc,rockM());brow.position.set(0,.24*sc,.32*sc);head.add(brow);
    for(let i=0;i<3;i++){const f=glow((.32-.09*i)*sc,.15*sc,(.32-.09*i)*sc,lavaC[i]);f.position.y=(.44+i*.14)*sc;head.add(f);}
    const shG=new THREE.BoxGeometry(.55*sc,.4*sc,.72*sc);
    const shL=new THREE.Mesh(shG,rockM());shL.position.set(-.78*sc,.82*sc,0);root.add(shL);
    const shR=new THREE.Mesh(shG,rockM());shR.position.set(.78*sc,.82*sc,0);root.add(shR);
    for(const sx of[-.78,.78])for(let i=0;i<3;i++){const f=glow((.2-.06*i)*sc,.13*sc,(.2-.06*i)*sc,lavaC[i]);f.position.set(sx*sc,(1.08+i*.12)*sc,0);root.add(f);}
    const armG=new THREE.BoxGeometry(.45*sc,.9*sc,.45*sc);
    const aL=new THREE.Mesh(armG,mat.clone());aL.position.set(-.88*sc,.12*sc,0);root.add(aL);
    const aR=new THREE.Mesh(armG,mat.clone());aR.position.set(.88*sc,.12*sc,0);root.add(aR);
    const fG=new THREE.BoxGeometry(.56*sc,.46*sc,.56*sc);
    const fL=new THREE.Mesh(fG,rockM());fL.position.set(-.92*sc,-.5*sc,.08*sc);root.add(fL);
    const fR=new THREE.Mesh(fG,rockM());fR.position.set(.92*sc,-.5*sc,.08*sc);root.add(fR);
    const kL=glow(.4*sc,.08*sc,.08*sc,0xff5500);kL.position.set(0,.05*sc,.29*sc);fL.add(kL);
    const kR=kL.clone();fR.add(kR);
  }
  else if(visualWave===15){
    // 巨大な単眼: 白目＋虹彩＋血管、影の胴体と8本の触手
    body.scale.set(.7,1,.7);
    head.scale.set(1.7,1.7,1.7);head.position.y=1.35*sc;
    head.material.color.setHex(0xe8e4f2);
    const iris=glow(.36*sc,.36*sc,.05*sc,0x7700cc);iris.position.set(0,0,.36*sc);head.add(iris);
    const pupil=glow(.17*sc,.17*sc,.05*sc,0x000000);pupil.position.set(0,0,.38*sc);head.add(pupil);
    const glint=glow(.05*sc,.05*sc,.04*sc,0xffffff);glint.position.set(.07*sc,.08*sc,.39*sc);head.add(glint);
    for(let i=0;i<6;i++){const ang=i/6*Math.PI*2;const v=glow(.035*sc,.16*sc,.04*sc,0xaa1133);v.position.set(Math.cos(ang)*.27*sc,Math.sin(ang)*.27*sc,.355*sc);v.rotation.z=ang+Math.PI/2;head.add(v);}
    const lid=makeBox(.74*sc,.16*sc,.74*sc,mat.clone());lid.position.y=.33*sc;head.add(lid);
    for(let i=0;i<8;i++){const angle=i*(Math.PI/4);const tent=new THREE.Mesh(new THREE.BoxGeometry(.15*sc,(.8+(i%2)*.35)*sc,.15*sc),mat.clone());tent.position.set(Math.cos(angle)*.5*sc,-.68*sc,Math.sin(angle)*.5*sc);tent.rotation.z=Math.cos(angle)*.5;tent.rotation.x=Math.sin(angle)*.5;root.add(tent);}
    const wL=glow(.08*sc,.08*sc,.05*sc,0xcc00ff);wL.position.set(-.15*sc,.35*sc,.31*sc);body.add(wL);
    const wR=wL.clone();wR.position.x=.15*sc;body.add(wR);
  }
  else if(visualWave===17){
    // 魔導士: とんがり帽子＋ローブ＋白髭＋魔法の杖
    const robeM=()=>new THREE.MeshStandardMaterial({color:def.color,roughness:.6,emissive:def.emissive,emissiveIntensity:.25});
    const brim=makeBox(1.0*sc,.09*sc,1.0*sc,robeM());brim.position.y=.38*sc;head.add(brim);
    const h1=makeBox(.5*sc,.24*sc,.5*sc,robeM());h1.position.y=.53*sc;head.add(h1);
    const h2=makeBox(.32*sc,.22*sc,.32*sc,robeM());h2.position.y=.72*sc;head.add(h2);
    const h3=makeBox(.15*sc,.2*sc,.15*sc,robeM());h3.position.y=.88*sc;h3.rotation.y=.3;head.add(h3);
    const band=glow(.52*sc,.06*sc,.52*sc,0xbb44ff);band.position.y=.44*sc;head.add(band);
    const face=glow(.5*sc,.32*sc,.05*sc,0x08000d);face.position.set(0,.06*sc,.34*sc);head.add(face);
    const eL=glow(.1*sc,.08*sc,.05*sc,0xdd66ff);eL.position.set(-.12*sc,.1*sc,.37*sc);head.add(eL);
    const eR=eL.clone();eR.position.x=.12*sc;head.add(eR);
    const beard=makeBox(.42*sc,.3*sc,.08*sc,makeMat(0xccccdd,0,0,.8));beard.position.set(0,-.28*sc,.36*sc);head.add(beard);
    const beard2=makeBox(.3*sc,.45*sc,.07*sc,makeMat(0xccccdd,0,0,.8));beard2.position.set(0,.6*sc,.46*sc);body.add(beard2);
    const belt=glow(.9*sc,.08*sc,.9*sc,0x9922ee);belt.position.y=-.1*sc;body.add(belt);
    const skirt2=makeBox(.98*sc,.5*sc,.95*sc,robeM());skirt2.position.y=-.5*sc;body.add(skirt2);
    const skirt=makeBox(1.1*sc,.55*sc,1.05*sc,robeM());skirt.position.y=-.72*sc;body.add(skirt);
    const slL=makeBox(.24*sc,.9*sc,.24*sc,robeM());slL.position.set(-.55*sc,.08*sc,0);slL.rotation.z=.15;root.add(slL);
    const slR=makeBox(.24*sc,.9*sc,.24*sc,robeM());slR.position.set(.55*sc,.2*sc,.18*sc);slR.rotation.x=-.6;root.add(slR);
    const staff=makeBox(.07*sc,1.6*sc,.07*sc,makeMat(0x4a3018,0,0,.85));staff.position.set(.58*sc,.15*sc,.48*sc);root.add(staff);
    const orb=glow(.2*sc,.2*sc,.2*sc,0xcc44ff);orb.position.y=.85*sc;orb.rotation.set(.6,.6,0);staff.add(orb);
    const orbCore=glow(.12*sc,.12*sc,.12*sc,0xffffff);orbCore.position.y=.85*sc;staff.add(orbCore);
  }
  const hpBg=new THREE.Mesh(new THREE.BoxGeometry(1.8*sc,.12,.06),new THREE.MeshBasicMaterial({color:0x330000}));hpBg.position.y=2.2*sc;
  const hpFg=new THREE.Mesh(new THREE.BoxGeometry(1.8*sc,.12,.07),new THREE.MeshBasicMaterial({color:0xff1744}));hpFg.position.y=2.2*sc;hpFg.position.z=.01;
  const lc=document.createElement('canvas');lc.width=256;lc.height=48;const lx=lc.getContext('2d');lx.fillStyle='rgba(0,0,0,.65)';lx.fillRect(0,0,256,48);lx.fillStyle='#ff4444';lx.font='bold 20px sans-serif';lx.textAlign='center';lx.fillText(def.name,128,34);
  const tex=new THREE.CanvasTexture(lc);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));sprite.scale.set(3.5*sc,.55*sc,1);sprite.position.y=2.65*sc;
  root.add(body,head,hpBg,hpFg,sprite);return{root,body,head,hpBar:hpFg,mat};
}
function spawnBoss(def){if(boss)return;const angle=Math.random()*Math.PI*2,dist=18;let sx=P.x+Math.cos(angle)*dist,sz=P.z+Math.sin(angle)*dist;const h=getHeight(Math.floor(sx),Math.floor(sz));const sc=def.scale;const built=buildBoss(def,sc);built.root.position.set(sx,h+1.85*sc,sz);markShadowCaster(built.root);scene.add(built.root);const mhp=def.baseHp+gs.wave*4;boss={root:built.root,body:built.body,head:built.head,hpBar:built.hpBar,mat:built.mat,hp:mhp,maxHp:mhp,def,velY:0,onGround:false,atkCd:0,atkPhase:0,chargeDir:null,chargeT:0,charging:false,phase:1,stuckT:0,lastX:sx,lastZ:sz,flashT:0,breakCd:0,sc};$bossName.textContent=def.name;$bossHpFill.style.width='100%';$bossPhase.textContent='PHASE 1';$bossWrap.classList.add('show');sfxBossAppear();showAlert('👑 BOSS: '+def.name);}
function updateBossHUD(){if(!boss)return;const r=Math.max(0,boss.hp/boss.maxHp);$bossHpFill.style.width=(r*100)+'%';$bossHpFill.style.background=r>.5?'linear-gradient(90deg,#ff1744,#ff6d00)':r>.25?'linear-gradient(90deg,#ff6d00,#ffab00)':'linear-gradient(90deg,#aa0000,#ff1744)';const ph=boss.hp<boss.maxHp*.33?3:boss.hp<boss.maxHp*.66?2:1;if(ph!==boss.phase){boss.phase=ph;$bossPhase.textContent='PHASE '+ph;showBonus('⚡ PHASE '+ph+'!');sfxWave();if(ph===2)boss.body.material.emissiveIntensity=.6;if(ph===3){boss.body.material.emissiveIntensity=1.2;boss.head.material.emissiveIntensity=1.2;}}}
function hitBoss(dmgVal){if(!boss)return;boss.hp-=dmgVal;boss.flashT=.15;boss.body.material.emissive.setHex(0xffffff);boss.body.material.emissiveIntensity=2;boss.head.material.emissive.setHex(0xffffff);boss.head.material.emissiveIntensity=2;const r=Math.max(0,boss.hp/boss.maxHp);boss.hpBar.scale.x=Math.max(.01,r);sfxBossDmg();if(boss.hp<=0)killBoss();}
function killBoss(){
  if(!boss)return;
  const bp=boss.root.position.clone();
  const deathColor=boss.def.deathColor;
  const bossScore=boss.def.score;
  const bossRoot=boss.root;
  for(let i=0;i<12;i++)setTimeout(()=>spawnParticles(bp.x+(Math.random()-.5)*4,bp.y+(Math.random()-.5)*3,bp.z+(Math.random()-.5)*4,deathColor,5),i*80);
  const wDrop=[1,2,3,4][Math.floor(Math.random()*4)];
  const it=ITEM_DEFS[wDrop];
  const mat=new THREE.MeshBasicMaterial({color:it.color,transparent:true,opacity:.9});
  const m=new THREE.Mesh(itemGeo,mat);m.position.set(bp.x,bp.y+1,bp.z);scene.add(m);
  items.push({mesh:m,mat,info:it,x:bp.x,y:bp.y+1,z:bp.z,time:0});
  const hp=ITEM_DEFS[0];
  const mat2=new THREE.MeshBasicMaterial({color:hp.color,transparent:true,opacity:.9});
  const m2=new THREE.Mesh(itemGeo,mat2);m2.position.set(bp.x+1,bp.y+1,bp.z);scene.add(m2);
  items.push({mesh:m2,mat:mat2,info:hp,x:bp.x+1,y:bp.y+1,z:bp.z,time:0});
  gs.score+=bossScore;gs.kills++;
  const wasMiniBoss=boss.def.miniBoss||false;const dDrop=boss.def.diamondDrop||0;
  sfxBossDie();showBonus((wasMiniBoss?'⚡ MINI BOSS DEAD! ':'💀 BOSS DEAD! ')+'+'+bossScore);
  scene.remove(bossRoot);disposeObject3D(bossRoot);const wasFinal=boss.def.finalBoss||false;boss=null;$bossWrap.classList.remove('show');
  if(dDrop>0){const hadDiamond=inv.diamond>0;inv.diamond+=dDrop;updateInvHUD();if(!hadDiamond)unlockAchievement('firstDiamond');setTimeout(()=>showBonus('💎×'+dDrop+' ゲット！'),1000);}
  if(!wasMiniBoss&&!wasFinal)unlockAchievement('bossSlayer');
  if(wasFinal)setTimeout(()=>gameComplete(),2000);
}
function updateBoss(dt){if(!boss)return;const bp=boss.root.position,sc=boss.sc;const dx=P.x-bp.x,dz=P.z-bp.z,dist=Math.hypot(dx,dz);
  // 状態異常（火矢/炎上エンチャント=DoT、氷矢/氷結エンチャント=鈍足）
  if(boss.slowT>0)boss.slowT-=dt;
  if(boss.burnT>0){
    boss.burnT-=dt*(weatherWet?2.2:1); // 雨天は消火が早い
    boss.burnAcc=(boss.burnAcc||0)+dt;
    if(boss.burnAcc>=.7){boss.burnAcc=0;boss.hp-=3;spawnParticles(bp.x,bp.y+sc*.5,bp.z,0xff6622,3);
      boss.hpBar.scale.x=Math.max(.01,boss.hp/boss.maxHp);
      if(boss.hp<=0){killBoss();return;}}
  }
  if(boss.flashT>0){boss.flashT-=dt;if(boss.flashT<=0){boss.body.material.emissive.setHex(boss.def.emissive);boss.body.material.emissiveIntensity=.35+boss.phase*.2;boss.head.material.emissive.setHex(boss.def.emissive);boss.head.material.emissiveIntensity=.35+boss.phase*.2;}}const fy=bp.y-(.85*sc);boss.velY-=GRAV*dt;const spd=(2+boss.phase*.8+(gs.wave*.15))*(boss.slowT>0?.5:1);if(boss.charging){const cd=boss.chargeDir;const nx=bp.x+cd.x*12*dt;const nz=bp.z+cd.z*12*dt;if(!overlaps(nx,fy,bp.z,sc*.4,1.7*sc))bp.x=nx;else if(boss.breakCd<=0){tryBossBreakBlock();boss.breakCd=Math.max(.5,1.2-boss.phase*.15);}if(!overlaps(bp.x,fy,nz,sc*.4,1.7*sc))bp.z=nz;else if(boss.breakCd<=0){tryBossBreakBlock();boss.breakCd=Math.max(.5,1.2-boss.phase*.15);}boss.chargeT-=dt;if(boss.chargeT<=0)boss.charging=false;}else if(dist>2){const nx=bp.x+(dx/dist)*spd*dt;const nz=bp.z+(dz/dist)*spd*dt;if(!overlaps(nx,fy,bp.z,sc*.4,1.7*sc))bp.x=nx;if(!overlaps(bp.x,fy,nz,sc*.4,1.7*sc))bp.z=nz;}const ny=fy+boss.velY*dt;if(!overlaps(bp.x,ny,bp.z,sc*.4,1.7*sc)){bp.y=ny+.85*sc;boss.onGround=false;}else{if(boss.velY<0)boss.onGround=true;boss.velY=0;}if(bp.y<-1){const rh=getHeight(Math.floor(bp.x),Math.floor(bp.z));bp.y=rh+1.85*sc;boss.velY=0;boss.onGround=true;}boss.root.rotation.y=Math.atan2(dx,dz);boss.stuckT+=dt;if(boss.stuckT>1.5){const mv=Math.abs(bp.x-boss.lastX)+Math.abs(bp.z-boss.lastZ);if(mv<.3&&boss.onGround){boss.velY=7;if(boss.breakCd<=0){tryBossBreakBlock();boss.breakCd=Math.max(1,2.5-boss.phase*.3);}}boss.lastX=bp.x;boss.lastZ=bp.z;boss.stuckT=0;}boss.atkCd=Math.max(0,boss.atkCd-dt);boss.breakCd=Math.max(0,boss.breakCd-dt);if(dist<2.5*sc&&boss.atkCd<=0&&hasLOS(bp.x,bp.y,bp.z,P.x,P.y+1,P.z)){dmgPlayer(boss.def.dmg+boss.phase*5);boss.atkCd=1.5-boss.phase*.2;}if(!boss.charging){boss.atkPhase=(boss.atkPhase||0)-dt;if(boss.atkPhase<=0){const pats=boss.def.patterns,pat=pats[Math.floor(Math.random()*pats.length)];boss.atkPhase=Math.max(1.2,3-boss.phase*.5);if(pat==='multishot'){[-0.4,0,0.4].forEach(a=>{const ca=Math.atan2(dx,dz)+a;fireBossArrow(bp.x,bp.y+sc,bp.z,bp.x+Math.sin(ca)*20,bp.y+sc,bp.z+Math.cos(ca)*20,boss.def.dmg*.6);});sfxBow();}else if(pat==='omnishot'){for(let a=0;a<8;a++){const ang=(a/8)*Math.PI*2;fireBossArrow(bp.x,bp.y+sc,bp.z,bp.x+Math.sin(ang)*20,bp.y+sc,bp.z+Math.cos(ang)*20,boss.def.dmg*.5);}sfxBow();sfxMagic();}else if(pat==='charge'){if(dist>4){sfxCharge();boss.charging=true;boss.chargeDir={x:dx/dist,z:dz/dist};boss.chargeT=0.6;boss.velY=4;}}else if(pat==='stomp'){if(boss.onGround){boss.velY=8;sfxHammer();}if(dist<6&&hasLOS(bp.x,bp.y,bp.z,P.x,P.y+1,P.z)){dmgPlayer(boss.def.dmg*.8);spawnParticles(bp.x,bp.y,bp.z,boss.def.deathColor,5);}}else if(pat==='aoeBlast'){spawnParticles(bp.x,bp.y+.5,bp.z,boss.def.deathColor,8);if(dist<7&&hasLOS(bp.x,bp.y+sc,bp.z,P.x,P.y+1,P.z)){dmgPlayer(boss.def.dmg*1.2);sfxMagic();}for(const e of enemies){const ed=Math.hypot(e.root.position.x-bp.x,e.root.position.z-bp.z);if(ed<8){e.hp=Math.min(e.hp+2,e.maxHp);const ratio=Math.max(0,e.hp/e.maxHp);e.hpBar.scale.x=Math.max(.01,ratio);e.hpBar.material.color.setHex(ratio>.5?0x44ff44:ratio>.25?0xffaa00:0xff2222);}}}}}boss.hpBar.lookAt(camera.position);updateBossHUD();}
function updateDragon(dt){
  if(!dragon)return;
  const dp=dragon.root.position;
  const px=P.x,py=P.y+1.5,pz=P.z;
  const dx=px-dp.x,dz=pz-dp.z,dist=Math.hypot(dx,dz);
  // Flash recovery
  if(dragon.flashT>0){dragon.flashT-=dt;if(dragon.flashT<=0){dragon.body.material.emissive.setHex(0x001020);dragon.body.material.emissiveIntensity=.3;dragon.head.material.emissive.setHex(0x001020);dragon.head.material.emissiveIntensity=.3;}}
  // Core pulse + wing flap
  dragon.coreT+=dt;
  dragon.core.material.emissiveIntensity=dragon.state==='telegraph'?5.0:(1.8+Math.sin(dragon.coreT*4)*.6);
  dragon.wingL.rotation.z=Math.sin(dragon.coreT*5)*.28;
  dragon.wingR.rotation.z=-Math.sin(dragon.coreT*5)*.28;
  // Face player
  if(dist>0.5)dragon.root.rotation.y=Math.atan2(dx,dz);
  // Contact damage
  dragon.atkCd=Math.max(0,dragon.atkCd-dt);
  if(dragon.atkCd<=0&&Math.hypot(dx,py-dp.y,dz)<2.3){dmgPlayer(25);dragon.atkCd=1.4;}
  // Hover toward player Y (always), clamp underground
  const targetY=Math.min(py,-0.6);
  dp.y+=(targetY-dp.y)*2.5*dt;
  if(dp.y>-0.4)dp.y=-0.4;
  // State machine
  dragon.stateT-=dt;
  if(dragon.state==='prowl'){
    if(dist>2.5){
      const nx=dp.x+(dx/dist)*4*dt;if(!overlaps(nx,dp.y-.3,dp.z,.4,.7))dp.x=nx;
      const nz=dp.z+(dz/dist)*4*dt;if(!overlaps(dp.x,dp.y-.3,nz,.4,.7))dp.z=nz;
    }
    if(dragon.stateT<=0){
      dragon.stateT=2.5+Math.random()*2;
      if(dist<14){dragon.state='telegraph';dragon.stateT=0.75;dragon.chargeDir={x:dx/(dist||1),z:dz/(dist||1)};playTone(120,.2,.15,'sawtooth');}
    }
  }else if(dragon.state==='telegraph'){
    if(dragon.stateT<=0){dragon.state='charge';dragon.stateT=0.45;sfxCharge();}
  }else if(dragon.state==='charge'){
    let wallHit=false;
    const nx=dp.x+dragon.chargeDir.x*18*dt;if(!overlaps(nx,dp.y-.3,dp.z,.4,.7))dp.x=nx;else wallHit=true;
    const nz=dp.z+dragon.chargeDir.z*18*dt;if(!overlaps(dp.x,dp.y-.3,nz,.4,.7))dp.z=nz;else wallHit=true;
    if(dragon.stateT<=0||wallHit){dragon.state='recoil';dragon.stateT=1.8;}
  }else if(dragon.state==='recoil'){
    const nx=dp.x-dragon.chargeDir.x*2*dt;if(!overlaps(nx,dp.y-.3,dp.z,.4,.7))dp.x=nx;
    const nz=dp.z-dragon.chargeDir.z*2*dt;if(!overlaps(dp.x,dp.y-.3,nz,.4,.7))dp.z=nz;
    if(dragon.stateT<=0){dragon.state='prowl';dragon.stateT=2.5+Math.random()*2;}
  }
}

