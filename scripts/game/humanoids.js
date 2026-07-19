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
function clearHumanoids(){if(typeof closeVillagerUI==='function')closeVillagerUI();for(const h of humanoids){scene.remove(h.root);disposeObject3D(h.root);}humanoids.length=0;humanoidSpawnT=8;if(typeof villagers!=='undefined')villagers.length=0;}

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
    if(mob.kind==='villager')continue;
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
  if(typeof _updateVillagers==='function')_updateVillagers(dt);
}


// ═══ VILLAGES / VILLAGER NPCS ═══
const VILLAGE_CONFIG={spawnChance:.03,minVillageDistance:150,minFlatRadius:18,minHouses:5,maxHouses:10,playerSafeRadius:38,chunkAttemptLimit:1};
const VILLAGER_JOBS={farmer:'農民',miner:'採掘者',unemployed:'無職'};
const VILLAGER_AI_INTERVAL=.5;
const villages=[],villageHouses=[],villagers=[];
const generatedVillageChunks=new Set();
let _villageSeq=0,_houseSeq=0,_villagerSeq=0,selectedVillager=null,_villagerUiSig='';
function _vid(prefix,n){return prefix+'_'+String(n).padStart(3,'0');}
function getDayPeriod(time){const t=((time%1)+1)%1;if(t<.23)return'morning';if(t<.62)return'day';if(t<.76)return'evening';return'night';}
function _villageRng(x,z,salt){let s=hash2i(x|0,z|0,(WORLD_SEED||1)+salt)||1;return()=>{s=Math.imul(s^s>>>15,2246822507);s=Math.imul(s^s>>>13,3266489909);return((s^s>>>16)>>>0)/4294967296;};}
function _villageSurface(x,z){return surfaceHeightAt(Math.floor(x),Math.floor(z));}
function _isVillageGroundSafe(x,z,baseY){const y=_villageSurface(x,z),v=voxels[vKey(Math.floor(x),y,Math.floor(z))];return Math.abs(y-baseY)<=1&&v&&v.ti!==WATER_BLOCK&&v.ti!==LAVA_BLOCK;}
function _isFlatVillageSite(cx,cz,r){const by=_villageSurface(cx,cz);let checked=0;for(let x=cx-r;x<=cx+r;x+=3)for(let z=cz-r;z<=cz+r;z+=3){checked++;if(checked>220)return false;if(!_isVillageGroundSafe(x,z,by))return false;}return true;}
function _farFromVillages(x,z){if(Math.hypot(x,z)<VILLAGE_CONFIG.playerSafeRadius)return false;for(const v of villages){if(Math.hypot(v.center.x-x,v.center.z-z)<VILLAGE_CONFIG.minVillageDistance)return false;}return true;}
function _villagePut(x,y,z,ti,meshes,meta){
  meta=meta|0;
  const key=vKey(x,y,z),existing=voxels[key];
  if(existing){
    if(existing.playerPlaced)delete worldEdits.placed[key];
    else worldEdits.removed[key]=true;
    removeBlock(x,y,z);
  }
  const k=addBlock(x,y,z,ti,false,true,meta);
  worldEdits.placed[key]=ti|(meta<<5);
  if(k&&meshes)meshes.add(k);
  return k;
}
function _villageClear(x,y,z){
  const key=vKey(x,y,z),existing=voxels[key];
  if(!existing)return;
  if(existing.playerPlaced)delete worldEdits.placed[key];
  else worldEdits.removed[key]=true;
  removeBlock(x,y,z);
}
function _flattenVillageCell(x,z,ti,meshes){const y=_villageSurface(x,z);_villagePut(x,y,z,ti,meshes);for(let yy=y+1;yy<=y+4;yy++)_villageClear(x,yy,z);return y;}
function generateVillageWell(cx,cz,meshes){const y=_villageSurface(cx,cz);for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const edge=Math.abs(dx)===2||Math.abs(dz)===2;_flattenVillageCell(cx+dx,cz+dz,edge?1:2,meshes);if(edge)_villagePut(cx+dx,y+1,cz+dz,1,meshes);} _villagePut(cx,y+1,cz,WATER_BLOCK,meshes);for(const [dx,dz]of[[-2,-2],[2,-2],[-2,2],[2,2]])for(let h=2;h<=3;h++)_villagePut(cx+dx,y+h,cz+dz,3,meshes);for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(Math.abs(dx)===2||Math.abs(dz)===2)_villagePut(cx+dx,y+4,cz+dz,17,meshes);return{x:cx,y:y+1,z:cz};}
function generateVillageHouse(x,y,z,rotation,houseType,meshes,villageId){const w=5+(houseType%2)*2,d=5,id=_vid('house',++_houseSeq),dir=[[0,-1],[1,0],[0,1],[-1,0]][rotation&3],ex=x+dir[0]*(Math.floor(w/2)+1),ez=z+dir[1]*(Math.floor(d/2)+1);for(let dx=-Math.floor(w/2)-1;dx<=Math.floor(w/2)+1;dx++)for(let dz=-Math.floor(d/2)-1;dz<=Math.floor(d/2)+1;dz++)for(let yy=y;yy<=y+4;yy++)_villageClear(x+dx,yy,z+dz);for(let dx=-Math.floor(w/2);dx<=Math.floor(w/2);dx++)for(let dz=-Math.floor(d/2);dz<=Math.floor(d/2);dz++){_villagePut(x+dx,y,z+dz,3,meshes);const wall=Math.abs(dx)===Math.floor(w/2)||Math.abs(dz)===Math.floor(d/2);if(wall){const isDoor=(x+dx===ex-dir[0]&&z+dz===ez-dir[1]);for(let yy=1;yy<=3;yy++){if(isDoor&&yy<=2)continue;_villagePut(x+dx,y+yy,z+dz,(yy===2&&((dx+dz)&1)===0)?GLASS_BLOCK:3,meshes);}}}for(let dx=-Math.floor(w/2)-1;dx<=Math.floor(w/2)+1;dx++)for(let dz=-Math.floor(d/2)-1;dz<=Math.floor(d/2)+1;dz++)_villagePut(x+dx,y+4,z+dz,4,meshes);_flattenVillageCell(ex,ez,11,meshes);return{id,villageId,position:{x,y,z},entrancePosition:{x:ex,y:y+1,z:ez},homePosition:{x,y:y+1,z},residentIds:[]};}
function _createVillager(data){const def=HUMANOID_TYPES.wanderingMiner,built=buildVoxelHumanoid(def);built.root.position.set(data.position.x,data.position.y,data.position.z);markShadowCaster(built.root);scene.add(built.root);const v={kind:'villager',def,...built,id:data.id||_vid('villager',++_villagerSeq),name:data.name||_randomVillagerName(),job:data.job||'unemployed',villageId:data.villageId,homeId:data.homeId,hp:data.hp??20,maxHp:data.maxHp??20,inventory:data.inventory||[],state:data.currentState||'idle',currentState:data.currentState||'idle',currentTarget:data.currentTarget||null,homePosition:data.homePosition,workPosition:data.workPosition||null,alive:data.alive!==false,aiT:Math.random()*VILLAGER_AI_INTERVAL,walkT:Math.random()*6,mineT:0,target:null,stuckT:0,hitFlash:0,deadT:0,hostile:false,mineTarget:null};villagers.push(v);humanoids.push(v);return v;}
function _randomVillagerName(){const a=['アオ','ハル','ミナ','ソラ','ユイ','レン','ナナ','タク'];const b=['タ','ノ','ミ','ス','カ','リ'];return a[Math.floor(Math.random()*a.length)]+b[Math.floor(Math.random()*b.length)];}
function _assignJobs(n,rng){const jobs=[];for(let i=0;i<n;i++){const r=rng();jobs.push(r<.5?'farmer':r<.8?'miner':'unemployed');}if(!jobs.includes('farmer'))jobs[0]='farmer';return jobs;}
function _saveVillager(v){return{id:v.id,name:v.name,job:v.job,villageId:v.villageId,homeId:v.homeId,hp:Math.round(v.hp),maxHp:v.maxHp,inventory:v.inventory||[],currentState:v.currentState||v.state,position:{x:v.root.position.x,y:v.root.position.y,z:v.root.position.z},homePosition:v.homePosition,workPosition:v.workPosition,currentTarget:v.currentTarget,alive:v.state!==HUMANOID_STATES.DEAD&&v.alive!==false};}
function villagesSaveState(){return{villages:villages.map(v=>({...v})),houses:villageHouses.map(h=>({...h,residentIds:[...h.residentIds]})),villagers:villagers.map(_saveVillager),generatedChunks:[...generatedVillageChunks],seq:{v:_villageSeq,h:_houseSeq,r:_villagerSeq}};}
function villagesLoadState(d){clearVillages();if(!d)return;(d.generatedChunks||[]).forEach(k=>generatedVillageChunks.add(k));(d.villages||[]).forEach(v=>villages.push(v));(d.houses||[]).forEach(h=>villageHouses.push(h));const seq=d.seq||{};_villageSeq=seq.v||villages.length;_houseSeq=seq.h||villageHouses.length;_villagerSeq=seq.r||0;for(const vd of d.villagers||[])if(vd.alive!==false)_createVillager(vd);}
function clearVillages(){closeVillagerUI();for(const v of [...villagers]){scene.remove(v.root);disposeObject3D(v.root);const i=humanoids.indexOf(v);if(i>=0)humanoids.splice(i,1);}villagers.length=0;villages.length=0;villageHouses.length=0;generatedVillageChunks.clear();}
function _safeVillagerTarget(v,p){if(!p)return null;const y=_humanoidGroundAt(p.x,p.z,v.root.position.y);return y==null?null:{x:p.x,y,z:p.z};}
function _randomVillagePoint(vil,rng){const a=rng()*Math.PI*2,d=4+rng()*14;return{x:vil.center.x+Math.cos(a)*d,z:vil.center.z+Math.sin(a)*d};}
function _decideVillager(v){const vil=villages.find(q=>q.id===v.villageId),period=getDayPeriod(gs.time);if(!vil)return;const rng=Math.random;if(period==='night'||period==='evening'){v.currentState=period==='night'?'睡眠へ移動':'帰宅中';v.target=_safeVillagerTarget(v,v.homePosition);return;}if(v.job==='farmer'){const p=(v.workPosition||vil.workPositions.farm[0]);v.currentState=period==='morning'?'農地へ移動':'農作業中';v.target=_safeVillagerTarget(v,p);}
else if(v.job==='miner'){const p=(v.workPosition||vil.workPositions.mine[0]);v.currentState=period==='morning'?'採掘場へ移動':'採掘中';v.mineTarget=_nearbyOre(v);v.target=_safeVillagerTarget(v,p);}
else{const p=_randomVillagePoint(vil,rng);v.currentState=period==='morning'?'広場へ移動':(rng()<.35?'休憩中':'散歩中');v.target=v.currentState==='休憩中'?null:_safeVillagerTarget(v,p);}}
function _updateVillagers(dt){for(const v of villagers){if(v.state===HUMANOID_STATES.DEAD)continue;const p=v.root.position,pd=Math.hypot(P.x-p.x,P.z-p.z);v.aiT-=dt*(pd>45?.35:1);if(v.aiT<=0){v.aiT=VILLAGER_AI_INTERVAL+(pd>45?1.5:0)+Math.random()*.35;_decideVillager(v);}let vx=0,vz=0;if(v.target){const dx=v.target.x-p.x,dz=v.target.z-p.z,d=Math.hypot(dx,dz);if(d>.7){vx=dx/d*v.def.speed;vz=dz/d*v.def.speed;v.state=v.job==='miner'&&v.currentState==='採掘中'?HUMANOID_STATES.MINE:HUMANOID_STATES.WANDER;}else{v.target=null;v.state=v.job==='miner'&&v.currentState==='採掘中'?HUMANOID_STATES.MINE:HUMANOID_STATES.IDLE;}}const moving=_humanoidMove(v,vx,vz,dt);_animateHumanoid(v,dt,moving);v.hpBar.lookAt(camera.position);}updateVillagerUI();}
function maybeGenerateVillageForChunk(cx,cz,meshes,force){const ck=cKey(cx,cz);if(generatedVillageChunks.has(ck))return false;generatedVillageChunks.add(ck);if(!force&&rand2(cx,cz,(WORLD_SEED||1)+909)>VILLAGE_CONFIG.spawnChance)return false;const rng=_villageRng(cx,cz,707),x=cx*CHUNK+4+Math.floor(rng()*8),z=cz*CHUNK+4+Math.floor(rng()*8);console.log('[Village] Generation started');if(!_farFromVillages(x,z)){console.log('[Village] Generation skipped: too close');return false;}if(!_isFlatVillageSite(x,z,VILLAGE_CONFIG.minFlatRadius)){console.log('[Village] Generation skipped: not flat/safe');return false;}const villageId=_vid('village',++_villageSeq),well=generateVillageWell(x,z,meshes),village={id:villageId,center:{x,y:well.y,z},wellPosition:well,houseIds:[],villagerIds:[],roadPositions:[],workPositions:{farm:[],mine:[],common:[]}};const dirs=[[1,0],[-1,0],[0,1],[0,-1]],houseN=VILLAGE_CONFIG.minHouses+Math.floor(rng()*(VILLAGE_CONFIG.maxHouses-VILLAGE_CONFIG.minHouses+1)),jobs=_assignJobs(houseN,rng);let made=0;for(let i=0;i<houseN;i++){const dir=dirs[i%4],side=i%2?1:-1,dist=7+Math.floor(i/4)*7;for(let s=1;s<=dist+4;s++){const rx=x+dir[0]*s,rz=z+dir[1]*s;_flattenVillageCell(rx,rz,11,meshes);village.roadPositions.push({x:rx,y:_villageSurface(rx,rz)+1,z:rz});}const hx=x+dir[0]*dist+(dir[1]||0)*side*6,hz=z+dir[1]*dist+(dir[0]||0)*side*6,hy=_villageSurface(hx,hz)+1;if(!_isVillageGroundSafe(hx,hz,hy-1))continue;const house=generateVillageHouse(hx,hy-1,hz,dirs.indexOf(dir),i%2,meshes,villageId);villageHouses.push(house);village.houseIds.push(house.id);const wp=jobs[i]==='farmer'?{x:hx+side*4,y:hy,z:hz+side*4}:jobs[i]==='miner'?{x:x+dir[0]*20,y:hy,z:z+dir[1]*20}:well;if(jobs[i]==='farmer')village.workPositions.farm.push(wp);else if(jobs[i]==='miner')village.workPositions.mine.push(wp);else village.workPositions.common.push(wp);const vill=_createVillager({name:_randomVillagerName(),job:jobs[i],villageId,homeId:house.id,position:house.homePosition,homePosition:house.homePosition,workPosition:wp});house.residentIds.push(vill.id);village.villagerIds.push(vill.id);made++;}if(made<VILLAGE_CONFIG.minHouses){console.log('[Village] Generation failed: not enough houses');return false;}villages.push(village);console.log('[Village] Generation completed');console.log('[Village] Houses: '+made);console.log('[Village] Villagers: '+village.villagerIds.length);return true;}

function ensureStarterVillage(){
  if(villages.length||!gs.running)return false;
  const baseA=rand2(0,0,(WORLD_SEED||1)+1331)*Math.PI*2;
  for(let i=0;i<28;i++){
    const a=baseA+i*.9,r=70+(i%8)*10;
    const x=Math.round(Math.cos(a)*r),z=Math.round(Math.sin(a)*r);
    const cx=Math.floor(x/CHUNK),cz=Math.floor(z/CHUNK),ck=cKey(cx,cz);
    if(generatedVillageChunks.has(ck))generatedVillageChunks.delete(ck);
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
      if(!chunks[cKey(cx+dx,cz+dz)])generateChunk(cx+dx,cz+dz);
    }
    if(maybeGenerateVillageForChunk(cx,cz,new Set(),true)){
      flushDirtyChunks();
      console.log('[Village] Starter village ensured');
      return true;
    }
  }
  console.log('[Village] Starter village failed: no flat candidate');
  return false;
}

function spawnTestVillageNearPlayer(){const cx=Math.floor((P.x+28)/CHUNK),cz=Math.floor(P.z/CHUNK);generatedVillageChunks.delete(cKey(cx,cz));for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(!chunks[cKey(cx+dx,cz+dz)])generateChunk(cx+dx,cz+dz);maybeGenerateVillageForChunk(cx,cz,new Set(),true);flushDirtyChunks();showBonus('Village debug spawn');}
window.spawnTestVillageNearPlayer=spawnTestVillageNearPlayer;
function openVillagerUI(v){selectedVillager=v;_villagerUiSig='';updateVillagerUI(true);const p=document.getElementById('villagerPanel');if(p)setPanel(p,true);}
function closeVillagerUI(){selectedVillager=null;_villagerUiSig='';const p=document.getElementById('villagerPanel');if(p)setPanel(p,false);}
function updateVillagerUI(force){const p=document.getElementById('villagerPanel'),b=document.getElementById('villagerBody');if(!p||!b||!selectedVillager||!p.classList.contains('show'))return;if(selectedVillager.state===HUMANOID_STATES.DEAD){closeVillagerUI();return;}const v=selectedVillager,job=VILLAGER_JOBS[v.job]||v.job,tgt=v.target?`${Math.round(v.target.x)},${Math.round(v.target.y)},${Math.round(v.target.z)}`:'なし',extra=v.job==='farmer'?`<div>作業場所: ${v.workPosition?Math.round(v.workPosition.x)+','+Math.round(v.workPosition.z):'未設定'}</div><div>農作業状態: ${v.currentState}</div>`:v.job==='miner'?`<div>採掘対象: ${v.mineTarget?'鉱石':'なし'}</div><div>採掘地点: ${v.workPosition?Math.round(v.workPosition.x)+','+Math.round(v.workPosition.z):'未設定'}</div><div>採掘中: ${v.currentState==='採掘中'?'はい':'いいえ'}</div>`:`<div>散歩先: ${tgt}</div><div>状態: ${v.currentState}</div>`;const sig=[v.id,v.hp,v.currentState,tgt].join('|');if(!force&&sig===_villagerUiSig)return;_villagerUiSig=sig;b.innerHTML=`<div class="codexHd">${v.name}</div><div>職業: ${job}</div><div>HP: ${Math.max(0,Math.round(v.hp))}/${v.maxHp}</div><div>現在の行動: ${v.currentState}</div><div>所属村: ${v.villageId}</div><div>自宅: ${v.homeId}</div><div>所持品: ${(v.inventory||[]).join(', ')||'なし'}</div><div>移動先: ${tgt}</div><div>生存状態: ${v.alive!==false?'生存':'死亡'}</div>${extra}`;}

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
  mob.state=HUMANOID_STATES.DEAD;mob.deadT=.65;mob.hpBar.visible=false;mob.hostile=false;mob.alive=false;if(selectedVillager===mob)closeVillagerUI();
  if(mob.kind==='villager')return;
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
function _villagerNearby(){let best=null,bd=2.8;for(const v of villagers||[]){if(v.state===HUMANOID_STATES.DEAD)continue;const p=v.root.position,d=Math.hypot(p.x-P.x,p.z-P.z);if(d<bd&&Math.abs(p.y-P.y)<3){bd=d;best=v;}}return best;}
function openNearestVillagerUI(){const v=_villagerNearby();if(v){openVillagerUI(v);return true;}return false;}
