// ============================================================================
// jokura / explosives.js
// TNT state, proximity detection, queued explosions, blast resistance and FX.
// Loaded after entities/humanoids and before input/main so it can reuse the
// existing voxel, damage, collision, particle, audio and save pipelines.
// ============================================================================

const ExplosionConfig={
  baseRadius:5,minRadius:2,maxRadius:isTouch?12:16,power:8,
  normalFuse:3.2,proximityFuse:1.4,chainFuseMin:.25,chainFuseMax:.9,
  proximityRange:4,maxPlacedSurvival:12,
  planBudget:isTouch?420:1100,destroyBudget:isTouch?42:120,
  maxNewExplosionsPerFrame:isTouch?1:2,maxActiveTasks:isTouch?2:4,
  maxDebrisPerExplosion:isTouch?8:24,maxBlockDrops:24,
};

const BlastResistance={
  values:[.7,2.7,.45,1.25,3.7,.7,2.9,Infinity,Infinity,.55,Infinity,.8,2.1,3.4,5.2,4.8,.35,2.2,2.2,.65,Infinity,3.8,.7,.5,.8,.2,.45,.7,.8],
  get(ti){const v=this.values[ti];return v==null?3:v;},
  isProtected(ti){return !Number.isFinite(this.get(ti));},
};
// 地殻貫通爆弾など「obsidianBreak」フラグ付きの爆発だけ、爆心近くの黒曜石を有限耐性で扱う。
// 通常TNTでは黒曜石(=Infinity)は無傷のまま。岩盤扱いの溶岩/水/火山岩は常に無傷。
const CRUST_OBSIDIAN_RES=5;
function _blastResFor(ev,ti,dist){
  if(ev&&ev.obsidianBreak&&ti===OBSIDIAN_BLOCK&&dist<=ev.obsidianBreak)return CRUST_OBSIDIAN_RES;
  return BlastResistance.get(ti);
}
function _blastCanDestroy(ev,ti,dist){
  if(ev&&ev.obsidianBreak&&ti===OBSIDIAN_BLOCK&&dist<=ev.obsidianBreak)return true;
  return !BlastResistance.isProtected(ti);
}

const _tntRecords=new Map();
const _tntIgnitedKeys=new Set();
let _tntPlacementMode='normal',_tntControlKey=null,_tntPreviewKey=null,_tntPreviewT=0;
let _tntPlayerVX=0,_tntPlayerVZ=0,_tntLastFuseSound=0,_tntLastExplosionSound=0;
const _tntFlashMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.42,depthWrite:false});
const _tntLampMat=new THREE.MeshBasicMaterial({color:0xff2200});
const _tntLampGeo=new THREE.BoxGeometry(.18,.1,.18);

function _tntAttachVisual(rec,v){
  rec.voxel=v;rec.mesh=v&&v.mesh||null;
  if(!rec.mesh)return;
  rec.mesh.userData.tntKey=rec.key;
  let flash=rec.mesh.getObjectByName('tntFlash');
  if(!flash){flash=new THREE.Mesh(boxGeo,_tntFlashMat);flash.name='tntFlash';flash.scale.setScalar(1.012);flash.visible=false;rec.mesh.add(flash);}
  rec.flash=flash;
  _tntUpdateSensorVisual(rec);
}
function _tntUpdateSensorVisual(rec){
  if(!rec.mesh)return;
  let lamp=rec.mesh.getObjectByName('tntSensor');
  if(rec.mode==='proximity'){
    if(!lamp){lamp=new THREE.Mesh(_tntLampGeo,_tntLampMat);lamp.name='tntSensor';lamp.position.y=.56;rec.mesh.add(lamp);}
    rec.lamp=lamp;lamp.visible=true;
  }else if(lamp){lamp.visible=false;rec.lamp=lamp;}
}
function onTNTBlockAdded(key,v){
  const p=key.split('|').map(Number);
  let rec=_tntRecords.get(key);
  if(!rec){rec={key,x:p[0],y:p[1],z:p[2],type:'tnt',mode:(v.meta|0)===1?'proximity':'normal',state:(v.meta|0)===1?'armed':'inactive',detectRange:ExplosionConfig.proximityRange,fuse:0,fuseTotal:0,beepT:0,sparkT:0,owner:'player'};_tntRecords.set(key,rec);}
  _tntAttachVisual(rec,v);
}
function onTNTBlockRemoved(key){
  const rec=_tntRecords.get(key);if(!rec)return;
  _tntIgnitedKeys.delete(key);
  if(_tntControlKey===key)closeTNTControl();
  _tntRecords.delete(key);
}
function canPlaceTNT(){
  if(isCreative())return true;
  if(_tntRecords.size>=ExplosionConfig.maxPlacedSurvival){showBonus('💣 TNT設置上限 '+ExplosionConfig.maxPlacedSurvival);playTone(170,.1,.08,'sawtooth');return false;}
  return true;
}
function configurePlacedTNT(key,mode){
  const rec=_tntRecords.get(key);if(!rec)return;
  rec.mode=mode==='proximity'?'proximity':'normal';rec.state=rec.mode==='proximity'?'armed':'inactive';
  const v=voxels[key];if(v){v.meta=rec.mode==='proximity'?1:0;worldEdits.placed[key]=TNT_BLOCK|(v.meta<<5);}
  _tntUpdateSensorVisual(rec);updateTNTModeButton();
}
function setTNTPlacementMode(mode){_tntPlacementMode=mode==='proximity'?'proximity':'normal';updateTNTModeButton();}
function toggleTNTPlacementMode(){setTNTPlacementMode(_tntPlacementMode==='normal'?'proximity':'normal');showBonus(_tntPlacementMode==='proximity'?'🔴 TNT: 近接爆弾':'💣 TNT: 手動起爆');}
function updateTNTModeButton(){
  const b=document.getElementById('tntModeBtn');if(!b)return;
  const selected=typeof curType!=='undefined'&&SLOT_TI[curType]===TNT_BLOCK;
  b.style.display=gs.running&&selected?'':'none';b.textContent=_tntPlacementMode==='proximity'?'🔴 PROX 4':'💣 MANUAL';
}

function igniteTNT(key,source='manual',fuseOverride){
  const rec=_tntRecords.get(key);if(!rec||rec.state==='ignited'||rec.state==='exploded')return false;
  const v=voxels[key];if(!v||!v.active)return false;
  rec.state='ignited';
  const fuse=fuseOverride!=null?fuseOverride:(source==='proximity'?ExplosionConfig.proximityFuse:ExplosionConfig.normalFuse);
  rec.fuse=Math.max(.05,fuse);rec.fuseTotal=rec.fuse;rec.beepT=0;rec.sparkT=0;rec.source=source;
  _tntIgnitedKeys.add(key);
  _tntPreviewKey=key;_tntPreviewT=Math.max(_tntPreviewT,rec.fuse);
  if(_tntControlKey===key)closeTNTControl();
  playTone(source==='proximity'?1050:820,.08,.06,'square');return true;
}
function _tntDetonate(rec){
  if(!rec||rec.state==='exploded')return;
  rec.state='exploded';const v=voxels[rec.key];
  if(v){if(v.playerPlaced)delete worldEdits.placed[rec.key];else worldEdits.removed[rec.key]=true;removeBlock(rec.x,rec.y,rec.z);}
  ExplosionSystem.enqueue({x:rec.x+.5,y:rec.y+.5,z:rec.z+.5,radius:_tntRadius(),owner:rec.owner,sourceKey:rec.key});
}
function recoverTNT(key){
  const rec=_tntRecords.get(key);if(!rec||rec.state==='ignited'||rec.state==='exploded')return false;
  const v=voxels[key];if(!v)return false;
  if(v.playerPlaced)delete worldEdits.placed[key];else worldEdits.removed[key]=true;
  removeBlock(rec.x,rec.y,rec.z);if(!isCreative()){inv.tnt++;updateInvHUD();}
  sfxBreak();showBonus('💣 TNTを回収');return true;
}

const ProximityDetector={
  interval:isTouch?.32:.22,timer:0,cursor:0,lastEnemyCount:0,lastChecked:0,
  update(dt){
    this.timer-=dt;if(this.timer>0)return;this.timer=this.interval;
    const bucketSize=6,buckets=new Map(),add=(obj)=>{if(!obj||!obj.root)return;const p=obj.root.position,k=Math.floor(p.x/bucketSize)+','+Math.floor(p.z/bucketSize);let a=buckets.get(k);if(!a){a=[];buckets.set(k,a);}a.push(obj);};
    for(const e of enemies)if(!e.dead)add(e);if(boss)add(boss);if(dragon)add(dragon);
    this.lastEnemyCount=enemies.length+(boss?1:0)+(dragon?1:0);
    const armed=[];for(const r of _tntRecords.values())if(r.state==='armed'&&r.voxel&&r.voxel.active){armed.push(r);if(r.lamp)r.lamp.visible=!r.lamp.visible;}
    if(!armed.length){this.cursor=0;this.lastChecked=0;return;}
    const limit=Math.min(armed.length,isTouch?48:96);this.lastChecked=limit;
    for(let n=0;n<limit;n++){
      const r=armed[(this.cursor+n)%armed.length],range=r.detectRange||ExplosionConfig.proximityRange;
      const cx=Math.floor((r.x+.5)/bucketSize),cz=Math.floor((r.z+.5)/bucketSize),cellR=Math.ceil(range/bucketSize);let found=false;
      for(let dx=-cellR;dx<=cellR&&!found;dx++)for(let dz=-cellR;dz<=cellR&&!found;dz++)for(const e of buckets.get((cx+dx)+','+(cz+dz))||[]){const p=e.root.position;if(Math.hypot(p.x-(r.x+.5),p.y-(r.y+.5),p.z-(r.z+.5))<=range){found=true;break;}}
      if(found)igniteTNT(r.key,'proximity',ExplosionConfig.proximityFuse);
    }
    this.cursor=(this.cursor+limit)%armed.length;
  }
};

function _tntRadius(){const r=isCreative()?Number(settings.tntRadius)||ExplosionConfig.baseRadius:ExplosionConfig.baseRadius;return Math.max(ExplosionConfig.minRadius,Math.min(ExplosionConfig.maxRadius,r));}
function _tntTransmission(x1,y1,z1,x2,y2,z2){
  const dx=x2-x1,dy=y2-y1,dz=z2-z1,steps=Math.ceil(Math.hypot(dx,dy,dz)*2.2);let hit=0;
  for(let i=1;i<steps;i++){const t=i/steps,v=voxels[vKey(Math.floor(x1+dx*t),Math.floor(y1+dy*t),Math.floor(z1+dz*t))];if(!v||!v.active)continue;if(v.ti===OBSIDIAN_BLOCK)return .08;if(v.ti!==WATER_BLOCK){hit++;if(hit>=2)return .22;}}
  return hit?.48:1;
}
function _tntDamageAndKnockback(ev){
  const R=ev.radius,entityDamage=(pos,maxD)=>{const d=Math.hypot(pos.x-ev.x,pos.y-ev.y,pos.z-ev.z);if(d>=R)return null;const transmission=_tntTransmission(ev.x,ev.y,ev.z,pos.x,pos.y,pos.z);const f=Math.max(0,1-d/R)*transmission;return{damage:Math.max(1,maxD*f),force:f,d};};
  if(settings.tntEntityDamage!==false){
  for(const e of [...enemies]){if(e.dead)continue;const h=entityDamage(e.root.position,48);if(!h)continue;const p=e.root.position,dx=p.x-ev.x,dz=p.z-ev.z,l=Math.hypot(dx,dz)||1,res=e.type.explosionResistance==null?(e.type.name.includes('Golem') ? .55 : 1):e.type.explosionResistance;hitEnemy(e,h.damage*res);if(!e.dead){e.blastVX=(e.blastVX||0)+dx/l*11*h.force*res;e.blastVZ=(e.blastVZ||0)+dz/l*11*h.force*res;e.velY=Math.max(e.velY||0,5*h.force*res);}}
  if(boss){const h=entityDamage(boss.root.position,36);if(h){const p=boss.root.position,dx=p.x-ev.x,dz=p.z-ev.z,l=Math.hypot(dx,dz)||1,res=boss.def.explosionResistance==null ? .45 : boss.def.explosionResistance;hitBoss(h.damage*res);if(boss){boss.blastVX=(boss.blastVX||0)+dx/l*5*h.force*res;boss.blastVZ=(boss.blastVZ||0)+dz/l*5*h.force*res;boss.velY=Math.max(boss.velY||0,2*h.force*res);}}}
  if(dragon){const h=entityDamage(dragon.root.position,30);if(h)hitDragon(h.damage*.45,true);}
  }
  if(!isCreative()&&settings.tntPlayerDamage!==false){const pp={x:P.x,y:P.y+1,z:P.z},h=entityDamage(pp,62);if(h){dmgPlayer(h.damage);if(settings.tntPlayerKnockback!==false){const dx=P.x-ev.x,dz=P.z-ev.z,l=Math.hypot(dx,dz)||1;_tntPlayerVX+=dx/l*13*h.force;_tntPlayerVZ+=dz/l*13*h.force;P.velY=Math.max(P.velY,6*h.force);P.onGround=false;}}}
  if(settings.tntEntityDamage!==false&&settings.tntFriendlyFire){for(const m of [...mobs]){if(m.dead)continue;const h=entityDamage(m.root.position,32);if(h)hitMob(m,h.damage);}for(const hmob of [...humanoids]){if(hmob.state===HUMANOID_STATES.DEAD)continue;const h=entityDamage(hmob.root.position,30);if(h)hitHumanoid(hmob,h.damage);}if(pet&&pet.downT<=0){const h=entityDamage(pet.root.position,30);if(h)hitPet(h.damage);}}
}

function _tntApplyImpulses(dt){
  const decay=Math.exp(-5.5*dt);
  for(const e of enemies){if(Math.abs(e.blastVX||0)+Math.abs(e.blastVZ||0)>.03){moveEnemy(e,e.blastVX,e.blastVZ,dt);e.blastVX*=decay;e.blastVZ*=decay;}}
  if(boss&&Math.abs(boss.blastVX||0)+Math.abs(boss.blastVZ||0)>.03){const p=boss.root.position,fy=p.y-.85*boss.sc,nx=p.x+boss.blastVX*dt,nz=p.z+boss.blastVZ*dt;if(!overlaps(nx,fy,p.z,boss.sc*.4,1.7*boss.sc))p.x=nx;if(!overlaps(p.x,fy,nz,boss.sc*.4,1.7*boss.sc))p.z=nz;boss.blastVX*=decay;boss.blastVZ*=decay;}
}
function tntPlayerImpulse(dt){const out={x:_tntPlayerVX,z:_tntPlayerVZ};const decay=Math.exp(-5.8*dt);_tntPlayerVX*=decay;_tntPlayerVZ*=decay;if(Math.abs(_tntPlayerVX)<.02)_tntPlayerVX=0;if(Math.abs(_tntPlayerVZ)<.02)_tntPlayerVZ=0;return out;}

const _tntFxSphereGeo=new THREE.SphereGeometry(1,10,7),_tntFxRingGeo=new THREE.TorusGeometry(1,.045,5,28);
const ExplosionEffectManager={
  active:[],spawn(ev){
    const d=Math.hypot(P.x-ev.x,P.y+1-ev.y,P.z-ev.z),quality=settings.tntEffectQuality||'auto',near=d<42;
    spawnParticles(ev.x,ev.y,ev.z,0xffdd88,near?10:3);spawnParticles(ev.x,ev.y+.2,ev.z,0x443b38,near?8:2);spawnParticles(ev.x,ev.y,ev.z,0xff4a18,near?8:2);
    if(near&&quality!=='low'){
      const group=new THREE.Group(),fireMat=new THREE.MeshBasicMaterial({color:0xff7a20,transparent:true,opacity:.9,depthWrite:false}),ringMat=new THREE.MeshBasicMaterial({color:0xffd08a,transparent:true,opacity:.8,depthWrite:false});
      const fire=new THREE.Mesh(_tntFxSphereGeo,fireMat),ring=new THREE.Mesh(_tntFxRingGeo,ringMat);ring.rotation.x=Math.PI/2;group.add(fire,ring);
      let light=null;if(!isTouch&&quality!=='low'){light=new THREE.PointLight(0xffa040,2.5,Math.min(18,ev.radius*3));group.add(light);}
      group.position.set(ev.x,ev.y,ev.z);scene.add(group);this.active.push({group,fire,ring,fireMat,ringMat,light,t:0,life:.65,radius:ev.radius});
    }
    const now=performance.now();if(now-_tntLastExplosionSound>65){_tntLastExplosionSound=now;const vol=Math.max(.025,.34*(1-d/70));playTone(58,.42,vol,'sine');playTone(105,.24,vol*.75,'square');}
    if(settings.tntScreenShake!==false&&d<ev.radius*5)ftvShake(Math.max(.03,(1-d/(ev.radius*5))*.42),.48);
  },update(dt){for(let i=this.active.length-1;i>=0;i--){const f=this.active[i];f.t+=dt;const q=Math.min(1,f.t/f.life);f.fire.scale.setScalar(.35+q*f.radius*.7);f.ring.scale.setScalar(.3+q*f.radius*1.25);f.fireMat.opacity=(1-q)*.9;f.ringMat.opacity=(1-q)*.8;if(f.light)f.light.intensity=(1-q)*2.5;if(f.t>=f.life){scene.remove(f.group);f.fireMat.dispose();f.ringMat.dispose();this.active.splice(i,1);}}},reset(){for(const f of this.active){scene.remove(f.group);f.fireMat.dispose();f.ringMat.dispose();}this.active.length=0;}
};

const ExplosionSystem={
  queue:[],tasks:[],lastPlanned:0,lastMs:0,lastOcclusion:1,lastChunks:new Set(),
  enqueue(ev){this.queue.push(ev);},
  _start(ev){ExplosionEffectManager.spawn(ev);_tntDamageAndKnockback(ev);
    // 🌀 終端界: DESTABILIZATION加算 + 巨大骸骨へのダメージ（TNT/地殻貫通爆弾どちらも
    // ここを通るため、この1箇所だけで両方をカバーできる）
    if(typeof currentDimension!=='undefined'&&currentDimension==='endZone'){
      const kind=ev.crust?'crust':'tnt';
      if(typeof destabOnWeaponUse==='function')destabOnWeaponUse(kind,ev.radius);
      if(typeof colossusHitByExplosion==='function')colossusHitByExplosion(ev.x,ev.y,ev.z,ev.radius,kind,ev.powerMul||1);
    }
    const r=Math.ceil(ev.radius),size=r*2+1,total=settings.tntBlockDamage===false?0:size*size*size;this.tasks.push({ev,r,size,scan:0,total,blocks:[],destroy:0,drops:[],debris:0,chunks:new Set(),started:performance.now()});},
  _scanOne(t){
    const i=t.scan++,s=t.size,dx=i%s-t.r,dy=Math.floor(i/s)%s-t.r,dz=Math.floor(i/(s*s))-t.r,dist=Math.hypot(dx,dy,dz);if(dist>t.ev.radius+.15)return;
    const x=Math.floor(t.ev.x)+dx,y=Math.floor(t.ev.y)+dy,z=Math.floor(t.ev.z)+dz,k=vKey(x,y,z),v=voxels[k];if(!v||!v.active)return;
    const attenuation=1-dist/(t.ev.radius+.25),random=.76+Math.random()*.48,trans=_tntTransmission(t.ev.x,t.ev.y,t.ev.z,x+.5,y+.5,z+.5);this.lastOcclusion=trans;
    const force=ExplosionConfig.power*(t.ev.powerMul||1)*attenuation*random*trans,res=_blastResFor(t.ev,v.ti,dist);
    if(v.ti===TNT_BLOCK){if(settings.tntChain!==false&&force>.35)igniteTNT(k,'chain',ExplosionConfig.chainFuseMin+Math.random()*(ExplosionConfig.chainFuseMax-ExplosionConfig.chainFuseMin));return;}
    if(force>res)t.blocks.push({x,y,z,k,ti:v.ti,dist});
  },
  _destroyOne(t){
    const b=t.blocks[t.destroy++],v=voxels[b.k];if(!v||!v.active||v.ti!==b.ti||!_blastCanDestroy(t.ev,v.ti,b.dist))return;
    if(typeof ftvOnBlockBroken==='function')ftvOnBlockBroken(b.k);if(typeof sucOnBlockBroken==='function')sucOnBlockBroken(b.k);if(typeof sccOnBlockBroken==='function')sccOnBlockBroken(b.k);
    if(t.debris<ExplosionConfig.maxDebrisPerExplosion&&Math.hypot(b.x-P.x,b.z-P.z)<28){spawnBlockDebris(b.x+.5,b.y+.5,b.z+.5,v.ti);t.debris++;}
    if(settings.tntItemDrops&&!isCreative()&&t.drops.length<ExplosionConfig.maxBlockDrops){const mat=BLOCK_MAT_MAP[v.ti];if(mat)t.drops.push({mat,ti:v.ti,x:b.x+.5,y:b.y+.5,z:b.z+.5});}
    if(v.playerPlaced)delete worldEdits.placed[b.k];else worldEdits.removed[b.k]=true;
    t.chunks.add(Math.floor(b.x/CHUNK)+','+Math.floor(b.z/CHUNK));removeBlock(b.x,b.y,b.z);
  },
  update(dt){
    const started=performance.now();let launched=0;while(this.queue.length&&this.tasks.length<ExplosionConfig.maxActiveTasks&&launched<ExplosionConfig.maxNewExplosionsPerFrame){this._start(this.queue.shift());launched++;}
    let planBudget=ExplosionConfig.planBudget,destroyBudget=ExplosionConfig.destroyBudget;const prevDefer=_deferDirty;_deferDirty=true;
    for(let ti=0;ti<this.tasks.length;ti++){const t=this.tasks[ti];while(t.scan<t.total&&planBudget-->0)this._scanOne(t);if(t.scan>=t.total)while(t.destroy<t.blocks.length&&destroyBudget-->0)this._destroyOne(t);if(planBudget<=0&&destroyBudget<=0)break;}
    _deferDirty=prevDefer;if(!prevDefer)flushDirtyChunks();
    for(let i=this.tasks.length-1;i>=0;i--){const t=this.tasks[i];if(t.scan<t.total||t.destroy<t.blocks.length)continue;for(const d of t.drops){const mat=new THREE.MeshBasicMaterial({color:BLOCK_COLORS[d.ti]||0xffffff,transparent:true,opacity:.9}),mesh=new THREE.Mesh(itemGeo,mat),info={type:'mat',key:d.mat,value:1,name:MATERIAL_LABELS[d.mat]||d.mat.toUpperCase()};mesh.position.set(d.x,d.y,d.z);scene.add(mesh);items.push({mesh,mat,info,x:d.x,y:d.y,z:d.z,time:0});}this.lastPlanned=t.blocks.length;this.lastChunks=t.chunks;this.tasks.splice(i,1);}
    this.lastMs=performance.now()-started;
  },reset(){this.queue.length=0;this.tasks.length=0;this.lastPlanned=0;this.lastChunks.clear();}
};

const _tntPreviewMat=new THREE.MeshBasicMaterial({color:0xff5b45,wireframe:true,transparent:true,opacity:.2,depthWrite:false});
const _tntPreviewMesh=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),_tntPreviewMat);_tntPreviewMesh.visible=false;scene.add(_tntPreviewMesh);
function _updateTNTPreview(dt){
  if(_tntPreviewT>0)_tntPreviewT-=dt;
  let pos=null,radius=_tntRadius(),strong=false;
  if(_tntPreviewKey&&_tntPreviewT>0){const r=_tntRecords.get(_tntPreviewKey);if(r){pos={x:r.x+.5,y:r.y+.5,z:r.z+.5};radius=r.mode==='proximity'&&r.state==='armed'?r.detectRange:radius;strong=r.state==='ignited';}}
  if(!pos&&isCreative()&&settings.tntPreview!==false&&SLOT_TI[curType]===TNT_BLOCK){const bh=castVoxel(true);if(bh){if(bh.ti===TNT_BLOCK)pos={x:bh.x+.5,y:bh.y+.5,z:bh.z+.5};else pos={x:bh.x+Math.round(bh.nx)+.5,y:bh.y+Math.round(bh.ny)+.5,z:bh.z+Math.round(bh.nz)+.5};}}
  _tntPreviewMesh.visible=!!pos;if(pos){_tntPreviewMesh.position.set(pos.x,pos.y,pos.z);_tntPreviewMesh.scale.setScalar(radius);_tntPreviewMat.opacity=strong?.52:.2;_tntPreviewMat.color.setHex(strong?0xffd080:0xff5b45);}
}

function updateExplosionSystem(dt){
  ProximityDetector.update(dt);
  for(const key of [..._tntIgnitedKeys]){
    const rec=_tntRecords.get(key);if(!rec||rec.state!=='ignited'){_tntIgnitedKeys.delete(key);continue;}
    rec.fuse-=dt;rec.beepT-=dt;rec.sparkT-=dt;const frac=Math.max(0,rec.fuse/(rec.fuseTotal||1)),rate=.12+.34*frac;
    if(rec.beepT<=0){rec.beepT=rate;const now=performance.now();if(now-_tntLastFuseSound>70){_tntLastFuseSound=now;playTone(720+(1-frac)*650,.045,.035,'square');}}
    if(rec.sparkT<=0){rec.sparkT=isTouch?.18:.1;spawnParticles(rec.x+.5,rec.y+1.05,rec.z+.5,0xffa32b,2);}
    if(rec.mesh){const pulse=1+Math.sin(performance.now()*(.012+(1-frac)*.025))*(.025+(1-frac)*.035);rec.mesh.scale.setScalar(pulse);if(rec.flash)rec.flash.visible=Math.floor(performance.now()/(60+frac*190))%2===0;}
    if(rec.fuse<=.08&&rec.flash)rec.flash.visible=true;if(rec.fuse<=0)_tntDetonate(rec);
  }
  if(_tntControlKey)_renderTNTControl();
  _tntApplyImpulses(dt);ExplosionSystem.update(dt);ExplosionEffectManager.update(dt);_updateTNTPreview(dt);_updateTNTDebug();
}

function openTNTControlFromHit(hit){const key=vKey(hit.x,hit.y,hit.z),rec=_tntRecords.get(key);if(!rec||rec.state==='exploded')return false;_tntControlKey=key;_tntPreviewKey=key;_tntPreviewT=8;if(document.pointerLockElement)document.exitPointerLock?.();const el=document.getElementById('tntControl');if(el)el.classList.add('show');_renderTNTControl();return true;}
function closeTNTControl(){_tntControlKey=null;const el=document.getElementById('tntControl');if(el)el.classList.remove('show');}
function _renderTNTControl(){const r=_tntRecords.get(_tntControlKey),st=document.getElementById('tntControlStatus'),mb=document.getElementById('tntModeControlBtn');if(!r){closeTNTControl();return;}if(st)st.textContent=(r.mode==='proximity'?'🔴 近接爆弾':'💣 通常TNT')+' / '+r.state+(r.state==='ignited'?' '+r.fuse.toFixed(1)+'s':'');if(mb)mb.textContent=r.mode==='proximity'?'通常TNTへ':'近接爆弾へ';}
function _bindTNTControls(){
  const get=()=>_tntRecords.get(_tntControlKey),bind=(id,fn)=>{const el=document.getElementById(id);if(el)bindTapSafe(el,()=>{const r=get();if(r)fn(r);});};
  bind('tntIgniteBtn',r=>igniteTNT(r.key,'manual'));bind('tntModeControlBtn',r=>{if(r.state==='ignited')return;r.mode=r.mode==='proximity'?'normal':'proximity';r.state=r.mode==='proximity'?'armed':'inactive';const v=voxels[r.key];if(v){v.meta=r.mode==='proximity'?1:0;worldEdits.placed[r.key]=TNT_BLOCK|(v.meta<<5);}_tntUpdateSensorVisual(r);_renderTNTControl();});
  bind('tntRangeBtn',r=>{_tntPreviewKey=r.key;_tntPreviewT=5;_tntPreviewMesh.visible=true;});bind('tntRecoverBtn',r=>recoverTNT(r.key));const c=document.getElementById('tntCancelBtn');if(c)bindTapSafe(c,closeTNTControl);const p=document.getElementById('tntModeBtn');if(p)bindTapSafe(p,toggleTNTPlacementMode);
}

function tntSaveState(){return[..._tntRecords.values()].filter(r=>r.state!=='exploded').map(r=>({x:r.x,y:r.y,z:r.z,type:r.type,mode:r.mode,state:r.state,detectRange:r.detectRange,owner:r.owner,remaining:r.state==='ignited'?Math.max(.35,r.fuse):null}));}
function tntLoadState(saved){
  if(!Array.isArray(saved))return;
  for(const d of saved){const key=vKey(d.x|0,d.y|0,d.z|0);let r=_tntRecords.get(key);if(!r){r={key,x:d.x|0,y:d.y|0,z:d.z|0,type:d.type||'tnt',mode:'normal',state:'inactive',detectRange:ExplosionConfig.proximityRange,fuse:0,fuseTotal:0,beepT:0,sparkT:0,owner:'player',voxel:null,mesh:null};_tntRecords.set(key,r);}r.mode=d.mode==='proximity'?'proximity':'normal';r.state=d.state==='ignited'?'ignited':r.mode==='proximity'?'armed':'inactive';r.detectRange=Math.max(2,Math.min(8,Number(d.detectRange)||ExplosionConfig.proximityRange));r.owner=d.owner||'player';if(r.state==='ignited'){r.fuse=Math.max(.35,Number(d.remaining)||ExplosionConfig.normalFuse);r.fuseTotal=r.fuse;_tntIgnitedKeys.add(key);}_tntUpdateSensorVisual(r);}
}
function resetTNTSystem(){for(const r of _tntRecords.values())if(r.mesh)r.mesh.scale.setScalar(1);_tntRecords.clear();_tntIgnitedKeys.clear();ExplosionSystem.reset();ExplosionEffectManager.reset();_tntPlayerVX=0;_tntPlayerVZ=0;_tntControlKey=null;_tntPreviewKey=null;_tntPreviewT=0;_tntPreviewMesh.visible=false;closeTNTControl();}

function _updateTNTDebug(){const el=document.getElementById('tntDebug');if(!el)return;const on=!!window.JOKURA_TNT_DEBUG;el.style.display=on?'':'none';if(!on)return;const hit=ddaTargetVoxel(7),res=hit&&voxels[vKey(hit.x,hit.y,hit.z)]?BlastResistance.get(voxels[vKey(hit.x,hit.y,hit.z)].ti):'-';el.textContent='TNT DEBUG\nR '+_tntRadius()+' / detect '+ExplosionConfig.proximityRange+'\nignited '+[..._tntRecords.values()].filter(r=>r.state==='ignited').length+' / queue '+ExplosionSystem.queue.length+' / tasks '+ExplosionSystem.tasks.length+'\nplanned '+ExplosionSystem.lastPlanned+' / '+ExplosionSystem.lastMs.toFixed(2)+'ms\nchunks '+[...ExplosionSystem.lastChunks].join(' ')+'\nresistance '+res+' / cover '+ExplosionSystem.lastOcclusion.toFixed(2);}
function toggleTNTDebug(){window.JOKURA_TNT_DEBUG=!window.JOKURA_TNT_DEBUG;showBonus(window.JOKURA_TNT_DEBUG?'TNT DEBUG ON':'TNT DEBUG OFF');}
window.toggleTNTDebug=toggleTNTDebug;
_bindTNTControls();
