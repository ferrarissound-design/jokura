// ============================================================================
// jokura / structures_procedural_dungeon.js
// 自動生成ダンジョン + ボス部屋。特殊生成メニューから地表へ生成し、迷路構造・
// 宝箱・罠・敵配置をワールドシードと生成座標から決定的に組み立てる。
// ============================================================================

const PROCEDURAL_DUNGEON_CFG={
  anchorDist:28,gridW:5,gridD:5,cellSize:11,roomHalf:5,wallH:4,
  chestCount:3,trapCount:4,mobCount:6,
};
const PROCEDURAL_DUNGEON_BOSS={
  wave:10,baseWave:10,name:'🗿 迷宮の番人',color:0x302839,emissive:0x7b2cff,
  baseHp:190,dmg:30,score:2800,scale:2.35,
  patterns:['charge','aoeBlast','omnishot','stomp'],deathColor:0xb55cff,
  miniBoss:true,diamondDrop:3,dungeonBoss:true,
};
let proceduralDungeon=null;
let _pdBusy=false;

function _pdSetProgress(show,frac){
  const el=document.getElementById('worldTreeProgress');if(!el)return;
  el.style.display=show?'':'none';
  const lbl=document.getElementById('wtpLabel');
  if(show){if(lbl)lbl.textContent='🗝 自動生成ダンジョンを構築中…';const fill=document.getElementById('wtpFill');if(fill)fill.style.width=Math.round((frac||0)*100)+'%';}
  else if(lbl)lbl.textContent='🌳 世界樹を生成中…';
}
function _pdSeed(x,z){return((WORLD_SEED^Math.imul(x,73856093)^Math.imul(z,19349663)^0x5a17d00d)>>>0)||1;}
function _pdCellKey(x,z){return x+','+z;}
function _pdEdgeKey(ax,az,bx,bz){const a=_pdCellKey(ax,az),b=_pdCellKey(bx,bz);return a<b?a+'|'+b:b+'|'+a;}
function _pdShuffle(a,rng){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1)),v=a[i];a[i]=a[j];a[j]=v;}return a;}
function _pdWorld(plan,gx,gz){
  const ox=(gx-plan.startX)*plan.cfg.cellSize,oz=gz*plan.cfg.cellSize;
  return{x:plan.ex+plan.right.x*ox+plan.forward.x*oz,z:plan.ez+plan.right.z*ox+plan.forward.z*oz};
}
function _pdStepWorld(plan,dx,dz){return{x:plan.right.x*dx+plan.forward.x*dz,z:plan.right.z*dx+plan.forward.z*dz};}

function _pdPlan(seed,site){
  const cfg=PROCEDURAL_DUNGEON_CFG,rng=_wtRng(seed),w=cfg.gridW,d=cfg.gridD,startX=Math.floor(w/2);
  const plan={cfg,seed,ex:site.ex,ez:site.ez,cx:site.cx,cz:site.cz,ybase:site.ybase,
    forward:site.forward,right:site.right,startX,edges:new Set(),parent:{},dist:{},cells:[],
    chestCells:[],trapCells:[],mobCells:[],bossCell:null,bossGate:[],rewardSpot:null};
  for(let z=0;z<d;z++)for(let x=0;x<w;x++)plan.cells.push({x,z});
  const visited=new Set([_pdCellKey(startX,0)]),stack=[{x:startX,z:0}];
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  while(stack.length){
    const cur=stack[stack.length-1],nexts=[];
    for(const[dx,dz]of dirs){const x=cur.x+dx,z=cur.z+dz,k=_pdCellKey(x,z);if(x>=0&&x<w&&z>=0&&z<d&&!visited.has(k))nexts.push({x,z});}
    if(!nexts.length){stack.pop();continue;}
    const n=nexts[Math.floor(rng()*nexts.length)],nk=_pdCellKey(n.x,n.z);
    plan.edges.add(_pdEdgeKey(cur.x,cur.z,n.x,n.z));plan.parent[nk]=_pdCellKey(cur.x,cur.z);visited.add(nk);stack.push(n);
  }
  // 一本道になりすぎないよう、少数のループを追加する。
  for(const c of plan.cells)for(const[dx,dz]of[[1,0],[0,1]]){
    const nx=c.x+dx,nz=c.z+dz;if(nx>=w||nz>=d)continue;
    const ek=_pdEdgeKey(c.x,c.z,nx,nz);if(!plan.edges.has(ek)&&rng()<.18)plan.edges.add(ek);
  }
  // BFSで入口から最も遠い部屋をボス部屋にする。
  const sk=_pdCellKey(startX,0),q=[{x:startX,z:0}];plan.dist[sk]=0;let far=q[0];
  for(let qi=0;qi<q.length;qi++){
    const c=q[qi],cd=plan.dist[_pdCellKey(c.x,c.z)];if(cd>plan.dist[_pdCellKey(far.x,far.z)])far=c;
    for(const[dx,dz]of dirs){const nx=c.x+dx,nz=c.z+dz,nk=_pdCellKey(nx,nz);if(nx<0||nx>=w||nz<0||nz>=d||plan.dist[nk]!=null)continue;if(!plan.edges.has(_pdEdgeKey(c.x,c.z,nx,nz)))continue;plan.dist[nk]=cd+1;plan.parent[nk]=_pdCellKey(c.x,c.z);q.push({x:nx,z:nz});}
  }
  plan.bossCell={x:far.x,z:far.z};
  // ボス部屋は必ず1入口にする。BFS上の親以外とのループを外して、封鎖時に
  // 別の扉から逃げられない専用アリーナとして成立させる。
  const farParent=plan.parent[_pdCellKey(far.x,far.z)];
  for(const[dx,dz]of dirs){const nx=far.x+dx,nz=far.z+dz;if(nx<0||nx>=w||nz<0||nz>=d)continue;if(_pdCellKey(nx,nz)!==farParent)plan.edges.delete(_pdEdgeKey(far.x,far.z,nx,nz));}
  const candidates=plan.cells.filter(c=>!(c.x===startX&&c.z===0)&&!(c.x===far.x&&c.z===far.z));_pdShuffle(candidates,rng);
  plan.chestCells=candidates.slice(0,cfg.chestCount);
  plan.trapCells=candidates.slice(cfg.chestCount,cfg.chestCount+cfg.trapCount);
  plan.mobCells=candidates.slice(cfg.chestCount+cfg.trapCount,cfg.chestCount+cfg.trapCount+cfg.mobCount);
  const bp=_pdWorld(plan,far.x,far.z),pk=plan.parent[_pdCellKey(far.x,far.z)],parts=pk?pk.split(',').map(Number):[far.x,Math.max(0,far.z-1)];
  const pdx=parts[0]-far.x,pdz=parts[1]-far.z,toParent=_pdStepWorld(plan,pdx,pdz),perp={x:-toParent.z,z:toParent.x};
  for(let side=-1;side<=1;side++)for(let y=1;y<=3;y++)plan.bossGate.push({x:bp.x+toParent.x*cfg.roomHalf+perp.x*side,y:site.ybase+y,z:bp.z+toParent.z*cfg.roomHalf+perp.z*side});
  plan.bossSpot={x:bp.x,y:site.ybase,z:bp.z};
  plan.rewardSpot={x:bp.x-toParent.x*2,y:site.ybase+1,z:bp.z-toParent.z*2};
  return plan;
}

function _pdPlaceChest(wx,wy,wz,struct){
  const tk=vKey(wx,wy,wz);if(underTreasures[tk])return;
  put(wx,wy-1,wz,DEEP_STONE);clr(wx,wy,wz);clr(wx,wy+1,wz);
  const mesh=_makeTreasureMesh(3);mesh.position.set(wx+.5,wy,wz+.5);
  if(!openedTreasureKeys.has(tk))scene.add(mesh);
  underTreasures[tk]={mesh,opened:openedTreasureKeys.has(tk),type:3,struct:struct||'proceduralDungeon'};
}
function _pdConnected(plan,c,dx,dz){const nx=c.x+dx,nz=c.z+dz;if(nx<0||nx>=plan.cfg.gridW||nz<0||nz>=plan.cfg.gridD)return false;return plan.edges.has(_pdEdgeKey(c.x,c.z,nx,nz));}
function _pdBuildRoom(plan,c){
  const p=_pdWorld(plan,c.x,c.z),H=plan.cfg.roomHalf,y0=plan.ybase;
  // 床と内部の空間。地形の起伏は石の基礎で吸収する。
  for(let lx=-H;lx<=H;lx++)for(let lz=-H;lz<=H;lz++){
    const o=_pdStepWorld(plan,lx,lz),x=p.x+o.x,z=p.z+o.z,sh=surfaceHeightAt(x,z);
    for(let y=Math.min(sh,y0)-1;y<=y0;y++)put(x,y,z,(Math.abs(lx)+Math.abs(lz)+c.x+c.z)%7===0?DEEP_STONE:1);
    for(let y=y0+1;y<=y0+plan.cfg.wallH+1;y++)clr(x,y,z);
  }
  // 接続がない辺だけを壁にする。接続辺は幅3・高さ3の通路を残す。
  for(const side of[{dx:1,dz:0},{dx:-1,dz:0},{dx:0,dz:1},{dx:0,dz:-1}]){
    const open=_pdConnected(plan,c,side.dx,side.dz),normal=_pdStepWorld(plan,side.dx,side.dz),perp={x:-normal.z,z:normal.x};
    for(let s=-H;s<=H;s++)for(let y=1;y<=plan.cfg.wallH;y++){
      if(open&&Math.abs(s)<=1&&y<=3)continue;
      const x=p.x+normal.x*H+perp.x*s,z=p.z+normal.z*H+perp.z*s;
      put(x,y0+y,z,(Math.abs(s)+y+c.x*3+c.z*5)%9===0?CRYSTAL_BLOCK:((Math.abs(s)+y)%4===0?6:DEEP_STONE));
    }
  }
  // 四隅の柱と照明。
  for(const sx of[-H+1,H-1])for(const sz of[-H+1,H-1]){
    const o=_pdStepWorld(plan,sx,sz);for(let y=1;y<=3;y++)put(p.x+o.x,y0+y,p.z+o.z,y===3?CRYSTAL_BLOCK:6);
  }
}
function _pdCarveConnections(plan){
  const H=plan.cfg.roomHalf,y0=plan.ybase;
  for(const edge of plan.edges){
    const[a,b]=edge.split('|'),[ax,az]=a.split(',').map(Number),[bx,bz]=b.split(',').map(Number),pa=_pdWorld(plan,ax,az),pb=_pdWorld(plan,bx,bz);
    const dx=Math.sign(pb.x-pa.x),dz=Math.sign(pb.z-pa.z),perp={x:-dz,z:dx};
    for(let step=H;step<=plan.cfg.cellSize-H;step++)for(let side=-1;side<=1;side++){
      const x=pa.x+dx*step+perp.x*side,z=pa.z+dz*step+perp.z*side;
      put(x,y0,z,1);for(let y=1;y<=3;y++)clr(x,y0+y,z);
    }
  }
}
function _pdDecorate(plan){
  const y0=plan.ybase,start=_pdWorld(plan,plan.startX,0),back={x:-plan.forward.x,z:-plan.forward.z},perp={x:-back.z,z:back.x},H=plan.cfg.roomHalf;
  // 入口の短い石橋と門。
  for(let t=H;t<=H+5;t++)for(let s=-1;s<=1;s++){const x=start.x+back.x*t+perp.x*s,z=start.z+back.z*t+perp.z*s;put(x,y0,z,1);for(let y=1;y<=3;y++)clr(x,y0+y,z);}
  for(const s of[-2,2])for(let y=1;y<=4;y++)put(start.x+back.x*(H+1)+perp.x*s,y0+y,start.z+back.z*(H+1)+perp.z*s,y===4?CRYSTAL_BLOCK:DEEP_STONE);
  for(const c of plan.trapCells){
    const p=_pdWorld(plan,c.x,c.z);for(const[ox,oz]of[[0,0],[1,0],[0,1],[1,1]]){const o=_pdStepWorld(plan,ox,oz);put(p.x+o.x,y0-1,p.z+o.z,OBSIDIAN_BLOCK);put(p.x+o.x,y0,p.z+o.z,LAVA_BLOCK);}
  }
  for(const c of plan.chestCells){const p=_pdWorld(plan,c.x,c.z),o=_pdStepWorld(plan,2,-2);_pdPlaceChest(p.x+o.x,y0+1,p.z+o.z,'proceduralDungeon');}
}
function _pdSpawnMobs(plan){
  for(let i=0;i<plan.mobCells.length;i++){const c=plan.mobCells[i],p=_pdWorld(plan,c.x,c.z),idx=[0,1,2,3,4,8][i%6],e=_ssgSpawnEnemyAt(p.x,plan.ybase+1,p.z,idx);if(e){e.noDespawn=true;e.dungeonMob=true;}}
}
function _pdCloseGate(){
  const D=proceduralDungeon;if(!D||D.gateClosed)return;
  _deferDirty=true;try{for(const c of D.plan.bossGate)put(c.x,c.y,c.z,OBSIDIAN_BLOCK);}finally{_deferDirty=false;flushDirtyChunks();}
  D.gateClosed=true;ftvShake(.25,.4);playTone(95,.35,.24,'square');showAlert('⚠ ボス部屋が封鎖された！');
}
function _pdOpenGate(){
  const D=proceduralDungeon;if(!D)return;
  _deferDirty=true;try{for(const c of D.plan.bossGate)clr(c.x,c.y,c.z);}finally{_deferDirty=false;flushDirtyChunks();}
  D.gateClosed=false;
}
function _pdSpawnBoss(){
  const D=proceduralDungeon;if(!D||D.bossDefeated||D.bossRef||boss)return false;
  const s=D.plan.bossSpot,spawned=spawnBoss(PROCEDURAL_DUNGEON_BOSS,{x:s.x+.5,y:s.y,z:s.z+.5});
  if(!spawned)return false;D.bossRef=spawned;showAlert('🗿 迷宮の番人が目覚めた！');return true;
}
function pdOnBossDefeated(){
  const D=proceduralDungeon;if(!D||D.bossDefeated)return;
  D.bossDefeated=true;D.bossRef=null;_pdOpenGate();
  const r=D.plan.rewardSpot;_pdPlaceChest(r.x,r.y,r.z,'proceduralDungeonBoss');
  gs.score+=1200;unlockAchievement('dungeonConqueror');
  showAlert('🏆 迷宮制覇！ 奥の宝箱が解放された');
  playTone(523,.18,.14,'triangle');setTimeout(()=>playTone(659,.18,.14,'triangle'),170);setTimeout(()=>playTone(784,.24,.16,'triangle'),340);
  saveGame();
}
function _pdRegister(plan,state){
  proceduralDungeon={plan,seed:plan.seed,cx:plan.cx,cz:plan.cz,ex:plan.ex,ez:plan.ez,ybase:plan.ybase,
    triggered:!!state.triggered,gateClosed:!!state.gateClosed,bossDefeated:!!state.bossDefeated,
    restored:!!state.restored,mobsSpawned:false,bossRef:null,leashT:0};
}
function resetProceduralDungeon(){
  if(typeof enemies!=='undefined')for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];if(!e.dungeonMob)continue;scene.remove(e.root);disposeObject3D(e.root);enemies.splice(i,1);}
  proceduralDungeon=null;
}
function updateDungeonKeyBtn(){
  const el=document.getElementById('dungeonKeyBtn');if(!el)return;
  const keys=typeof inv!=='undefined'?(inv.dungeonKey||0):0;
  const survival=typeof isCreative==='function'?!isCreative():true;
  const running=typeof gs!=='undefined'&&gs.running;
  el.style.display=running&&survival&&keys>0?'':'none';
  const active=!!(proceduralDungeon&&!proceduralDungeon.bossDefeated);
  el.disabled=_pdBusy||active;
  el.textContent=_pdBusy?'🗝 迷宮を構築中…':active?'🗝 迷宮攻略中':'🗝 迷宮を開く ×'+keys;
}
function openSurvivalDungeon(){
  if(!gs.running||isCreative())return false;
  if((inv.dungeonKey||0)<1){showBonus('🗝 迷宮の鍵が必要です');updateDungeonKeyBtn();return false;}
  return generateProceduralDungeon({consumeKey:true});
}
function pdUpdate(dt){
  const D=proceduralDungeon;if(!D||!gs.running||currentDimension!=='overworld')return;const s=D.plan.bossSpot,pd=Math.hypot(P.x-s.x,P.z-s.z);
  if(!D.restored&&pd<70){
    D.restored=true;for(const c of D.plan.chestCells){const p=_pdWorld(D.plan,c.x,c.z),o=_pdStepWorld(D.plan,2,-2);_pdPlaceChest(p.x+o.x,D.ybase+1,p.z+o.z,'proceduralDungeon');}
    if(D.bossDefeated){const r=D.plan.rewardSpot;_pdPlaceChest(r.x,r.y,r.z,'proceduralDungeonBoss');}
    else if(!D.mobsSpawned){_pdSpawnMobs(D.plan);D.mobsSpawned=true;}
  }
  if(D.bossDefeated)return;
  if(!D.triggered&&pd<7.5&&Math.abs(P.y-(D.ybase+1))<5){if(boss){showBonus('⚠ 別のボスがいる間は番人が目覚めない');return;}D.triggered=true;_pdCloseGate();_pdSpawnBoss();}
  else if(D.triggered&&!D.bossRef&&pd<40)_pdSpawnBoss();
  if(D.bossRef){D.leashT+=dt;if(D.leashT>1.25){D.leashT=0;const bp=D.bossRef.root.position;if(Math.hypot(bp.x-s.x,bp.z-s.z)>9||bp.y<D.ybase-3||bp.y>D.ybase+8){bp.set(s.x+.5,D.ybase+1.85*D.bossRef.sc,s.z+.5);D.bossRef.velY=0;spawnParticles(bp.x,bp.y,bp.z,0xb55cff,5);}}}
}
function pdSaveState(){
  const D=proceduralDungeon;if(!D)return null;
  return{generated:true,seed:D.seed,cx:D.cx,cz:D.cz,ex:D.ex,ez:D.ez,ybase:D.ybase,
    forward:D.plan.forward,right:D.plan.right,triggered:D.triggered,gateClosed:D.gateClosed,bossDefeated:D.bossDefeated};
}
function pdLoadState(d){
  resetProceduralDungeon();if(!d||!d.generated||typeof d.ex!=='number'||typeof d.ez!=='number')return;
  try{
    const forward=d.forward&&typeof d.forward.x==='number'?d.forward:{x:0,z:1},right=d.right&&typeof d.right.x==='number'?d.right:{x:-forward.z,z:forward.x};
    const plan=_pdPlan(d.seed||_pdSeed(d.ex,d.ez),{ex:d.ex,ez:d.ez,cx:d.cx,cz:d.cz,ybase:d.ybase,forward,right});
    _pdRegister(plan,{triggered:d.triggered,gateClosed:d.gateClosed,bossDefeated:d.bossDefeated,restored:false});
  }catch(e){console.warn('自動生成ダンジョン: セーブ復元に失敗',e);proceduralDungeon=null;}
}

function generateProceduralDungeon(options){
  options=options||{};const consumeKey=!!options.consumeKey;
  if(_pdBusy){showBonus('🗝 ダンジョンを生成中…');return false;}
  if(currentDimension!=='overworld'){showBonus('⚠ ダンジョンは通常世界で生成してください');return false;}
  if(proceduralDungeon&&!proceduralDungeon.bossDefeated){showBonus('⚠ 先に現在のダンジョンを攻略してください');return false;}
  if(consumeKey&&(typeof inv==='undefined'||(inv.dungeonKey||0)<1)){showBonus('🗝 迷宮の鍵が必要です');return false;}
  const prompt=consumeKey?'迷宮の鍵を1個使って自動生成ダンジョンを開きます。約55×55ブロックの地形が変化します。生成しますか？':'自動生成ダンジョンを作ります。約55×55ブロックの地形が変化します。生成しますか？';
  if(!window.confirm(prompt))return false;
  _pdBusy=true;_pdSetProgress(true,0);updateDungeonKeyBtn();
  let plan;
  try{
    const a=_frontAnchor(PROCEDURAL_DUNGEON_CFG.anchorDist),forward=Math.abs(a.fx)>=Math.abs(a.fz)?{x:Math.sign(a.fx)||1,z:0}:{x:0,z:Math.sign(a.fz)||1},right={x:-forward.z,z:forward.x};
    const ex=Math.round(P.x+forward.x*PROCEDURAL_DUNGEON_CFG.anchorDist),ez=Math.round(P.z+forward.z*PROCEDURAL_DUNGEON_CFG.anchorDist);
    const cx=ex+forward.x*Math.floor(PROCEDURAL_DUNGEON_CFG.gridD/2)*PROCEDURAL_DUNGEON_CFG.cellSize,cz=ez+forward.z*Math.floor(PROCEDURAL_DUNGEON_CFG.gridD/2)*PROCEDURAL_DUNGEON_CFG.cellSize;
    _ensureChunksAround(cx,cz,34,3);const ybase=_footprintYBase(cx,cz,32,4),seed=_pdSeed(ex,ez);
    plan=_pdPlan(seed,{ex,ez,cx,cz,ybase,forward,right});
  }catch(e){console.error('自動生成ダンジョン: 準備中にエラー',e);_pdBusy=false;_pdSetProgress(false);updateDungeonKeyBtn();showBonus('⚠ ダンジョン生成に失敗しました');return false;}
  const phases=[];
  const rooms=plan.cells.slice(),roomsPerPhase=(typeof isTouch!=='undefined'&&isTouch)?2:plan.cfg.gridW;
  for(let start=0;start<rooms.length;start+=roomsPerPhase){const batch=rooms.slice(start,start+roomsPerPhase);phases.push(()=>{for(const cell of batch)_pdBuildRoom(plan,cell);});}
  phases.push(()=>_pdCarveConnections(plan));phases.push(()=>_pdDecorate(plan));
  let idx=0;const step=()=>{
    try{
      _deferDirty=true;phases[idx]();idx++;_deferDirty=false;flushDirtyChunks();_pdSetProgress(true,idx/phases.length);
      if(idx<phases.length)requestAnimationFrame(step);
      else{
        resetProceduralDungeon();_pdRegister(plan,{triggered:false,gateClosed:false,bossDefeated:false,restored:true});_pdSpawnMobs(plan);proceduralDungeon.mobsSpawned=true;
        if(consumeKey){inv.dungeonKey=Math.max(0,(inv.dungeonKey||0)-1);updateInvHUD();}
        _pdBusy=false;_pdSetProgress(false);updateDungeonKeyBtn();showAlert('🗝 自動生成ダンジョンが出現！ 最深部を目指せ');
        playTone(196,.18,.12,'triangle');setTimeout(()=>playTone(294,.18,.12,'triangle'),180);saveGame();
      }
    }catch(e){console.error('自動生成ダンジョン: 生成中にエラー',e);_deferDirty=false;try{flushDirtyChunks();}catch(_){}_pdBusy=false;_pdSetProgress(false);updateDungeonKeyBtn();showBonus('⚠ ダンジョン生成に失敗しました');}
  };
  requestAnimationFrame(step);
  return true;
}
