// Lightweight, state-driven humanoid mobs. New variants can be added to
// HUMANOID_TYPES without changing the shared builder or update loop.
const HUMANOID_STATES=Object.freeze({
  IDLE:'idle',WANDER:'wander',WATCH:'watch',FLEE:'flee',FOLLOW:'follow',
  HOSTILE:'hostile',ATTACK:'attack',MINE:'mine',DEAD:'dead',
});
const HUMANOID_TYPES={
  wanderingMiner:{
    name:'放浪の採掘者',hp:16,dmg:7,speed:1.45,hostileSpeed:2.45,
    skin:0x9b6a54,skinDark:0x7d4f40,shirt:0x7b315f,robe:0x64254e,
    pants:0x49352f,boots:0x5b5855,hair:0x6f4a3c,
    tool:0x59656b,handle:0x6f482a,dropKey:'ironOre',
  },
};
const humanoids=[];
const MAX_HUMANOIDS=isTouch?2:4;
const HUMANOID_AI_INTERVAL=isTouch?.55:.35;
let humanoidSpawnT=8;

function _humanoidMat(color){return new THREE.MeshStandardMaterial({color,roughness:.9,metalness:0});}
function _humanoidPivot(mesh,x,y,z){
  const pivot=new THREE.Object3D();pivot.position.set(x,y,z);mesh.position.y=-mesh.geometry.parameters.height*.5;pivot.add(mesh);return pivot;
}
function buildVoxelHumanoid(def){
  const root=new THREE.Object3D();
  const body=makeBox(.76,.94,.42,_humanoidMat(def.shirt));body.position.set(0,1.28,0);
  const robeLower=makeBox(.64,.6,.4,_humanoidMat(def.robe));robeLower.position.set(0,.56,0);
  const robePanel=makeBox(.16,.82,.045,_humanoidMat(def.robe));robePanel.position.set(0,1.13,.235);
  const head=makeBox(.72,.78,.64,_humanoidMat(def.skin));head.position.set(0,2.08,0);
  const hairTop=makeBox(.74,.13,.66,_humanoidMat(def.hair));hairTop.position.y=.39;head.add(hairTop);
  const hairL=makeBox(.13,.32,.06,_humanoidMat(def.hair));hairL.position.set(-.25,.19,.335);head.add(hairL);
  const hairR=makeBox(.13,.32,.06,_humanoidMat(def.hair));hairR.position.set(.25,.19,.335);head.add(hairR);
  const brow=makeBox(.6,.1,.055,_humanoidMat(0x2b201c));brow.position.set(0,.1,.345);head.add(brow);
  const eyeWhiteL=makeBox(.19,.13,.05,new THREE.MeshBasicMaterial({color:0xe6e2d5}));eyeWhiteL.position.set(-.2,-.02,.35);head.add(eyeWhiteL);
  const eyeWhiteR=makeBox(.19,.13,.05,new THREE.MeshBasicMaterial({color:0xe6e2d5}));eyeWhiteR.position.set(.2,-.02,.35);head.add(eyeWhiteR);
  const eyeL=makeBox(.08,.13,.035,new THREE.MeshBasicMaterial({color:0x15933a}));eyeL.position.set(0,0,.04);eyeWhiteL.add(eyeL);
  const eyeR=makeBox(.08,.13,.035,new THREE.MeshBasicMaterial({color:0x15933a}));eyeR.position.set(0,0,.04);eyeWhiteR.add(eyeR);
  const nose=makeBox(.22,.46,.22,_humanoidMat(def.skinDark));nose.position.set(0,-.18,.43);head.add(nose);
  const cheekL=makeBox(.16,.14,.06,_humanoidMat(def.skinDark));cheekL.position.set(-.17,-.27,.35);head.add(cheekL);
  const cheekR=makeBox(.16,.14,.06,_humanoidMat(def.skinDark));cheekR.position.set(.17,-.27,.35);head.add(cheekR);
  const chin=makeBox(.3,.12,.08,_humanoidMat(def.skinDark));chin.position.set(0,-.42,.3);head.add(chin);
  const armLMesh=makeBox(.24,.86,.28,_humanoidMat(def.shirt));
  const armRMesh=makeBox(.24,.86,.28,_humanoidMat(def.shirt));
  const armL=_humanoidPivot(armLMesh,-.5,1.66,0),armR=_humanoidPivot(armRMesh,.5,1.66,0);
  const handL=makeBox(.25,.22,.29,_humanoidMat(def.skin));handL.position.y=-.78;armL.add(handL);
  const handR=makeBox(.25,.22,.29,_humanoidMat(def.skin));handR.position.y=-.78;armR.add(handR);
  const legLMesh=makeBox(.29,.9,.32,_humanoidMat(def.pants));
  const legRMesh=makeBox(.29,.9,.32,_humanoidMat(def.pants));
  const legL=_humanoidPivot(legLMesh,-.2,.88,0),legR=_humanoidPivot(legRMesh,.2,.88,0);
  const bootL=makeBox(.3,.22,.43,_humanoidMat(def.boots));bootL.position.set(0,-.82,.06);legL.add(bootL);
  const bootR=makeBox(.3,.22,.43,_humanoidMat(def.boots));bootR.position.set(0,-.82,.06);legR.add(bootR);
  const pickaxe=new THREE.Object3D();pickaxe.position.set(0,-.72,.22);pickaxe.rotation.set(-.25,0,0);
  const handle=makeBox(.09,.9,.09,_humanoidMat(def.handle));handle.rotation.z=-.35;
  const pickHead=makeBox(.82,.16,.16,new THREE.MeshStandardMaterial({color:def.tool,roughness:.45,metalness:.65}));pickHead.position.set(-.08,-.38,0);pickHead.rotation.z=-.35;
  pickaxe.add(handle,pickHead);armR.add(pickaxe);
  const hp=makeHpBar(.9);hp.bg.position.y=2.62;hp.fg.position.y=2.62;
  const label=makeLabelSprite(def.name,'#e5c07b');label.position.y=2.82;
  root.add(body,robeLower,robePanel,head,armL,armR,legL,legR,hp.bg,hp.fg,label);
  return{root,body,head,armL,armR,legL,legR,pickaxe,hpBar:hp.fg,flashMeshes:[body,head,armLMesh,armRMesh]};
}

function _humanoidGroundAt(x,z,nearY){
  const bx=Math.floor(x),bz=Math.floor(z),top=Math.floor(nearY+1.25);
  for(let y=top;y>=top-5;y--){
    const floor=voxels[vKey(bx,y,bz)],a1=voxels[vKey(bx,y+1,bz)],a2=voxels[vKey(bx,y+2,bz)];
    if(floor&&floor.active&&floor.ti!==WATER_BLOCK&&floor.ti!==LAVA_BLOCK&&
      (!a1||!a1.active||a1.ti===WATER_BLOCK||a1.ti===TORCH_BLOCK)&&
      (!a2||!a2.active||a2.ti===WATER_BLOCK||a2.ti===TORCH_BLOCK))return y+1.01;
  }
  return null;
}
function _humanoidSpawnGround(x,z){
  if(P.y>=0)return surfaceHeightAt(Math.floor(x),Math.floor(z))+1.01;
  return _humanoidGroundAt(x,z,P.y);
}
function setHumanoidState(mob,state,duration=0){
  if(mob.state===HUMANOID_STATES.DEAD)return;
  mob.state=state;mob.stateT=duration;
  if(state===HUMANOID_STATES.WANDER)mob.wanderAngle+=(Math.random()-.5)*Math.PI*1.6;
}
function createHumanoid(kind='wanderingMiner',x=P.x+5,z=P.z+5,y=null){
  if(humanoids.length>=MAX_HUMANOIDS)return null;
  const def=HUMANOID_TYPES[kind];if(!def)return null;
  const gy=y==null?_humanoidSpawnGround(x,z):y;if(gy==null)return null;
  const built=buildVoxelHumanoid(def);built.root.position.set(x,gy,z);markShadowCaster(built.root);scene.add(built.root);
  const mob={kind,def,...built,hp:def.hp,maxHp:def.hp,state:HUMANOID_STATES.IDLE,stateT:1+Math.random()*2,
    aiT:Math.random()*HUMANOID_AI_INTERVAL,wanderAngle:Math.random()*Math.PI*2,hostile:false,
    attackCd:0,walkT:Math.random()*6,mineT:0,hitFlash:0,deadT:0,mineTarget:null};
  humanoids.push(mob);return mob;
}
function spawnHumanoids(count=1){
  for(let n=0;n<count&&humanoids.length<MAX_HUMANOIDS;n++){
    for(let attempt=0;attempt<10;attempt++){
      const a=Math.random()*Math.PI*2,d=14+Math.random()*13,x=P.x+Math.sin(a)*d,z=P.z+Math.cos(a)*d;
      const y=_humanoidSpawnGround(x,z);if(y==null||overlaps(x,y,z,.34,2.48))continue;
      if(createHumanoid('wanderingMiner',x,z,y))break;
    }
  }
}
function clearHumanoids(){for(const h of humanoids){scene.remove(h.root);disposeObject3D(h.root);}humanoids.length=0;humanoidSpawnT=8;}

function _nearestHumanoidThreat(mob){
  let best=null,bd=7;
  for(const e of enemies){if(e.dead)continue;const d=Math.hypot(e.root.position.x-mob.root.position.x,e.root.position.z-mob.root.position.z);if(d<bd){bd=d;best=e;}}
  return best?{entity:best,dist:bd}:null;
}
function _nearbyOre(mob){
  const p=mob.root.position,bx=Math.floor(p.x),by=Math.floor(p.y+.8),bz=Math.floor(p.z);
  let best=null,bd=99;
  for(let dx=-4;dx<=4;dx++)for(let dy=-3;dy<=3;dy++)for(let dz=-4;dz<=4;dz++){
    const v=voxels[vKey(bx+dx,by+dy,bz+dz)];if(!v||!v.active||![COAL_ORE,IRON_ORE,DIAMOND_ORE,CRYSTAL_BLOCK].includes(v.ti))continue;
    const d=dx*dx+dy*dy+dz*dz;if(d<bd){bd=d;best={x:bx+dx+.5,y:by+dy+.5,z:bz+dz+.5};}
  }
  return best;
}
function _decideHumanoid(mob){
  const p=mob.root.position,dx=P.x-p.x,dz=P.z-p.z,dist=Math.hypot(dx,dz);
  if(mob.hostile){setHumanoidState(mob,dist<1.7?HUMANOID_STATES.ATTACK:HUMANOID_STATES.HOSTILE,.8);return;}
  const threat=_nearestHumanoidThreat(mob);
  if(threat){mob.fleeFrom=threat.entity;setHumanoidState(mob,HUMANOID_STATES.FLEE,1.5);return;}
  if(mob.state===HUMANOID_STATES.WATCH&&mob.stateT>0)return;
  if(mob.state===HUMANOID_STATES.WATCH){setHumanoidState(mob,HUMANOID_STATES.FOLLOW,3+Math.random()*3);return;}
  if(mob.state===HUMANOID_STATES.FOLLOW&&mob.stateT>0&&dist<12)return;
  if(dist<9&&Math.abs(P.y+1-p.y)<3&&hasLOS(p.x,p.y+1.7,p.z,P.x,P.y+1,P.z)){
    setHumanoidState(mob,HUMANOID_STATES.WATCH,1.1+Math.random()*1.2);return;
  }
  if(mob.stateT>0&&(mob.state===HUMANOID_STATES.IDLE||mob.state===HUMANOID_STATES.WANDER||mob.state===HUMANOID_STATES.MINE))return;
  const ore=_nearbyOre(mob);
  if(ore||p.y<0){mob.mineTarget=ore;setHumanoidState(mob,HUMANOID_STATES.MINE,2+Math.random()*2.5);return;}
  if(mob.state===HUMANOID_STATES.MINE&&mob.stateT>0)return;
  setHumanoidState(mob,Math.random()<.28?HUMANOID_STATES.IDLE:HUMANOID_STATES.WANDER,1.5+Math.random()*3);
}
function _humanoidMove(mob,vx,vz,dt){
  const p=mob.root.position,len=Math.hypot(vx,vz);if(len<.01)return false;
  const nx=p.x+vx*dt,nz=p.z+vz*dt,gy=_humanoidGroundAt(nx,nz,p.y);
  if(gy==null||gy-p.y>1.05||p.y-gy>1.2||overlaps(nx,gy,nz,.34,2.48)){
    mob.wanderAngle+=Math.PI*(.45+Math.random()*.6);return false;
  }
  p.x=nx;p.z=nz;p.y+=(gy-p.y)*Math.min(1,dt*10);mob.root.rotation.y=Math.atan2(vx,vz);return true;
}
function _animateHumanoid(mob,dt,moving){
  const blend=Math.min(1,dt*12);mob.walkT+=moving?dt*7:0;
  let legSwing=moving?Math.sin(mob.walkT)*.62:0,armSwing=-legSwing;
  if(mob.state===HUMANOID_STATES.MINE){mob.mineT+=dt*7;armSwing=-1.15+Math.sin(mob.mineT)*.75;legSwing=0;}
  else if(mob.state===HUMANOID_STATES.ATTACK){mob.mineT+=dt*9;armSwing=-1.3+Math.sin(mob.mineT)*.9;}
  mob.legL.rotation.x=THREE.MathUtils.lerp(mob.legL.rotation.x,legSwing,blend);
  mob.legR.rotation.x=THREE.MathUtils.lerp(mob.legR.rotation.x,-legSwing,blend);
  mob.armL.rotation.x=THREE.MathUtils.lerp(mob.armL.rotation.x,-armSwing*.75,blend);
  mob.armR.rotation.x=THREE.MathUtils.lerp(mob.armR.rotation.x,armSwing,blend);
}
function updateHumanoids(dt){
  humanoidSpawnT-=dt;if(humanoidSpawnT<=0){humanoidSpawnT=35+Math.random()*25;if(humanoids.length<MAX_HUMANOIDS)spawnHumanoids(1);}
  for(let i=humanoids.length-1;i>=0;i--){
    const mob=humanoids[i],p=mob.root.position;
    if(mob.state===HUMANOID_STATES.DEAD){mob.deadT-=dt;mob.root.rotation.z=Math.min(Math.PI*.48,mob.root.rotation.z+dt*3);if(mob.deadT<=0){scene.remove(mob.root);disposeObject3D(mob.root);humanoids.splice(i,1);}continue;}
    const pd=Math.hypot(P.x-p.x,P.z-p.z);if(pd>60){scene.remove(mob.root);disposeObject3D(mob.root);humanoids.splice(i,1);continue;}
    mob.root.visible=pd<48;if(!mob.root.visible)continue;
    mob.stateT=Math.max(0,mob.stateT-dt);mob.aiT-=dt;mob.attackCd=Math.max(0,mob.attackCd-dt);
    if(mob.aiT<=0){mob.aiT=HUMANOID_AI_INTERVAL+Math.random()*.18;_decideHumanoid(mob);}
    if(mob.hitFlash>0){mob.hitFlash-=dt;if(mob.hitFlash<=0)for(const m of mob.flashMeshes)m.material.emissive.setHex(0x000000);}
    let vx=0,vz=0,speed=mob.def.speed;
    if(mob.state===HUMANOID_STATES.WANDER){vx=Math.sin(mob.wanderAngle)*speed;vz=Math.cos(mob.wanderAngle)*speed;}
    else if(mob.state===HUMANOID_STATES.FOLLOW){const d=pd||1;if(pd>2.8){vx=(P.x-p.x)/d*speed;vz=(P.z-p.z)/d*speed;}else mob.root.rotation.y=Math.atan2(P.x-p.x,P.z-p.z);}
    else if(mob.state===HUMANOID_STATES.WATCH){mob.root.rotation.y=Math.atan2(P.x-p.x,P.z-p.z);}
    else if(mob.state===HUMANOID_STATES.FLEE){const q=mob.fleeFrom&&mob.fleeFrom.root?mob.fleeFrom.root.position:P;const dx=p.x-q.x,dz=p.z-q.z,d=Math.hypot(dx,dz)||1;vx=dx/d*2.6;vz=dz/d*2.6;}
    else if(mob.state===HUMANOID_STATES.HOSTILE){const d=pd||1;vx=(P.x-p.x)/d*mob.def.hostileSpeed;vz=(P.z-p.z)/d*mob.def.hostileSpeed;}
    else if(mob.state===HUMANOID_STATES.ATTACK){mob.root.rotation.y=Math.atan2(P.x-p.x,P.z-p.z);if(pd<1.8&&mob.attackCd<=0&&hasLOS(p.x,p.y+1.5,p.z,P.x,P.y+1,P.z)){dmgPlayer(mob.def.dmg);mob.attackCd=1.05;}}
    else if(mob.state===HUMANOID_STATES.MINE&&mob.mineTarget){mob.root.rotation.y=Math.atan2(mob.mineTarget.x-p.x,mob.mineTarget.z-p.z);}
    const moving=_humanoidMove(mob,vx,vz,dt);_animateHumanoid(mob,dt,moving);mob.hpBar.lookAt(camera.position);
  }
}

function hitHumanoid(mob,damage=1){
  if(!mob||mob.state===HUMANOID_STATES.DEAD)return;
  mob.hp-=damage;mob.hostile=true;setHumanoidState(mob,HUMANOID_STATES.HOSTILE,8);mob.hitFlash=.12;
  for(const m of mob.flashMeshes){m.material.emissive.setHex(0xffffff);m.material.emissiveIntensity=1.2;}
  const ratio=Math.max(0,mob.hp/mob.maxHp);mob.hpBar.scale.x=Math.max(.01,ratio);mob.hpBar.material.color.setHex(ratio>.5?0x44ff44:ratio>.25?0xffaa00:0xff2222);
  spawnParticles(mob.root.position.x,mob.root.position.y+1,mob.root.position.z,0xe5c07b,2);
  if(mob.hp<=0)killHumanoid(mob);
}
function killHumanoid(mob){
  if(mob.state===HUMANOID_STATES.DEAD)return;
  mob.state=HUMANOID_STATES.DEAD;mob.deadT=.65;mob.hpBar.visible=false;mob.hostile=false;
  const p=mob.root.position,info={type:'mat',key:mob.def.dropKey,value:1,name:'⛏ 採掘者の鉄鉱石'};
  const mat=new THREE.MeshBasicMaterial({color:0xcaa472,transparent:true,opacity:.9});
  const mesh=new THREE.Mesh(itemGeo,mat);mesh.position.set(p.x,p.y+.5,p.z);scene.add(mesh);items.push({mesh,mat,info,x:p.x,y:p.y+.5,z:p.z,time:0});
  gs.score+=40;showBonus('放浪の採掘者 +40');playTone(360,.12,.09,'triangle');
}
function attackHumanoids(w){
  if(w.type==='ranged')return false;camera.getWorldDirection(_atkDir);const range=w.type==='aoe'?w.range:w.range+.5;let hit=false;
  const dl=Math.hypot(_atkDir.x,_atkDir.z)||1;
  for(const mob of [...humanoids]){if(mob.state===HUMANOID_STATES.DEAD)continue;const p=mob.root.position,dx=p.x-P.x,dz=p.z-P.z,d=Math.hypot(dx,dz);if(d>range)continue;
    if(w.type==='aoe'||d<.01||(dx/d)*(_atkDir.x/dl)+(dz/d)*(_atkDir.z/dl)>.3){hitHumanoid(mob,w.dmg);hit=true;}
  }
  return hit;
}
