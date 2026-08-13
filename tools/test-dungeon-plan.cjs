const fs=require('fs');
const vm=require('vm');

const source=fs.readFileSync('scripts/game/structures_procedural_dungeon.js','utf8');
const pureSource=source.slice(0,source.indexOf('function _pdPlaceChest'));
if(!pureSource.includes('function _pdPlan'))throw new Error('Dungeon planning functions were not found');

const mulberry32=(a)=>function(){
  a|=0;a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;
  return((t^t>>>14)>>>0)/4294967296;
};
const context={WORLD_SEED:12345,_wtRng:mulberry32,Math};
vm.createContext(context);
vm.runInContext(pureSource+`
function __dungeonSummary(seed){
  const p=_pdPlan(seed,{ex:10,ez:20,cx:10,cz:42,ybase:3,forward:{x:0,z:1},right:{x:-1,z:0}});
  const start=_pdCellKey(p.startX,0),seen=new Set([start]),queue=[{x:p.startX,z:0}],dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let i=0;i<queue.length;i++){
    const c=queue[i];
    for(const d of dirs){
      const x=c.x+d[0],z=c.z+d[1],key=_pdCellKey(x,z);
      if(x<0||x>=p.cfg.gridW||z<0||z>=p.cfg.gridD||seen.has(key)||!p.edges.has(_pdEdgeKey(c.x,c.z,x,z)))continue;
      seen.add(key);queue.push({x,z});
    }
  }
  const bossKey=_pdCellKey(p.bossCell.x,p.bossCell.z);
  let bossDegree=0;
  for(const d of dirs)if(p.edges.has(_pdEdgeKey(p.bossCell.x,p.bossCell.z,p.bossCell.x+d[0],p.bossCell.z+d[1])))bossDegree++;
  const picks=[...p.chestCells,...p.trapCells,...p.mobCells].map(c=>_pdCellKey(c.x,c.z));
  return{cells:p.cells.length,connected:seen.size,edges:p.edges.size,bossKey,bossDegree,unique:new Set(picks).size,total:picks.length,bossPicked:picks.includes(bossKey),gate:p.bossGate.length};
}
globalThis.__dungeonResults=[];
for(let seed=1;seed<=200;seed++)__dungeonResults.push(__dungeonSummary(seed));
`,context);

const failures=context.__dungeonResults.filter((r)=>
  r.cells!==25||r.connected!==25||r.edges<24||r.bossDegree!==1||
  r.unique!==r.total||r.bossPicked||r.gate!==9
);
if(failures.length){
  console.error(JSON.stringify(failures.slice(0,5),null,2));
  process.exit(1);
}
console.log('OK: 200 dungeon seeds connected; boss rooms single-entry; placements unique');

// Run the complete generator with lightweight game stubs. This catches missing globals and
// verifies that the phased build reaches registration without needing WebGL.
let putCount=0,clearCount=0,alertText='';
const fakeElement=()=>({style:{},textContent:'',position:{set(){}},classList:{add(){},remove(){}}});
const fullContext={
  WORLD_SEED:12345,_wtRng:mulberry32,Math,
  document:{getElementById:()=>fakeElement()},window:{confirm:()=>true},
  currentDimension:'overworld',P:{x:0,y:3,z:0},gs:{running:true,wave:0,score:0},
  _frontAnchor:()=>({fx:0,fz:1}),_ensureChunksAround(){},_footprintYBase:()=>2,
  surfaceHeightAt:()=>2,put(){putCount++;},clr(){clearCount++;},
  _deferDirty:false,flushDirtyChunks(){},requestAnimationFrame:(fn)=>fn(),
  vKey:(x,y,z)=>`${x}|${y}|${z}`,underTreasures:{},openedTreasureKeys:new Set(),
  _makeTreasureMesh:()=>fakeElement(),scene:{add(){},remove(){}},
  DEEP_STONE:13,CRYSTAL_BLOCK:21,OBSIDIAN_BLOCK:20,LAVA_BLOCK:8,
  enemies:[],_ssgSpawnEnemyAt:(x,y,z)=>{const e={root:fakeElement(),x,y,z};fullContext.enemies.push(e);return e;},disposeObject3D(){},
  boss:null,showBonus(){},showAlert:(s)=>{alertText=s;},playTone(){},setTimeout(){},saveGame(){},
  ftvShake(){},spawnParticles(){},unlockAchievement(){},spawnBoss(def,at){const b={def,sc:def.scale,root:{position:{x:at.x,y:at.y,z:at.z,set(){}}},velY:0};fullContext.boss=b;return b;},console,
};
vm.createContext(fullContext);
vm.runInContext(source+`
generateProceduralDungeon();
const __initialMobs=enemies.length,__spot=proceduralDungeon.plan.bossSpot;P.x=__spot.x;P.y=__spot.y+1;P.z=__spot.z;pdUpdate(.1);
globalThis.__bossTriggered=proceduralDungeon.triggered&&proceduralDungeon.gateClosed&&!!proceduralDungeon.bossRef&&boss.def.dungeonBoss;
boss=null;pdOnBossDefeated();
const __saved=pdSaveState(),__edgeCount=proceduralDungeon.plan.edges.size;pdLoadState(__saved);pdUpdate(.1);
globalThis.__fullResult={registered:!!proceduralDungeon,cells:proceduralDungeon&&proceduralDungeon.plan.cells.length,initialMobs:__initialMobs,restoredMobs:enemies.length,bossTriggered:__bossTriggered,bossDefeated:proceduralDungeon.bossDefeated,gateOpen:!proceduralDungeon.gateClosed,restoredEdges:proceduralDungeon.plan.edges.size===__edgeCount};
`,fullContext);
if(!fullContext.__fullResult.registered||fullContext.__fullResult.cells!==25||fullContext.__fullResult.initialMobs!==6||fullContext.__fullResult.restoredMobs!==0||!fullContext.__fullResult.bossTriggered||!fullContext.__fullResult.bossDefeated||!fullContext.__fullResult.gateOpen||!fullContext.__fullResult.restoredEdges||putCount<3000||clearCount<1000||!alertText.includes('迷宮制覇')){
  console.error({result:fullContext.__fullResult,putCount,clearCount,alertText});
  process.exit(1);
}
console.log(`OK: phased build, 6 mobs, boss gate, reward, and save restore completed (${putCount} puts / ${clearCount} clears)`);
