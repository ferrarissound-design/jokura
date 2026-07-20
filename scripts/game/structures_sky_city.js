// ============================================================================
// jokura / structures_sky_city.js
// ☁ 崩れかけの天空都市
// world.js から分割されたファイルの一部。全スクリプトは index.html の PARTS の
// 順序で <script> として読み込まれ、同一のグローバルスコープを共有する。
// このファイルは world.js（地形・チャンク・ブロック定義）より後、
// structures_registry.js（生成関数を登録テーブルで参照）より前に読み込まれる。
// ============================================================================

// ═══ ☁ 崩れかけの天空都市 ═══
// 複数高度の浮遊島を歩いて探索し、中央動力炉を再起動すると、照明・光の橋・
// 隠し制御室・特別な宝箱が復旧する状態変化型の特殊生成。ブロックは既存の put/clr
// と worldEdits に任せ、回転輪・遠景の影・落石など、ブロックで表現しにくい部分だけを
// 少数の演出メッシュにする。毎フレーム処理は都市から離れると即 return する。
const SKY_CITY_CFG={anchorDist:50,radius:35,heightAboveGround:35,activationStepMs:520};
let collapsingSkyCity=null,_skyCityBusy=false;

function _sccSeed(cx,cz){return((WORLD_SEED^(cx*73856093)^(cz*19349663)^0x5c17c1)>>>0)||1;}
function _sccW(plan,lx,lz){
  const r=plan.rot&3;
  if(r===1)return{x:plan.cx-lz,z:plan.cz+lx};
  if(r===2)return{x:plan.cx-lx,z:plan.cz-lz};
  if(r===3)return{x:plan.cx+lz,z:plan.cz-lx};
  return{x:plan.cx+lx,z:plan.cz+lz};
}
function _sccPut(plan,lx,y,lz,ti,meta){const p=_sccW(plan,lx,lz);put(p.x,y,p.z,ti,meta);}
function _sccClr(plan,lx,y,lz){const p=_sccW(plan,lx,lz);clr(p.x,y,p.z);}
function _sccWeathered(x,y,z){const h=_wtHash((x*73)^(y*151)^(z*277));return h<.48?1:h<.76?6:h<.9?DEEP_STONE:4;}

function _sccNearExisting(cx,cz,r){
  if(_ftvNearStruct(cx,cz,r))return true;
  if(frozenVillage&&Math.hypot(cx-frozenVillage.cx0,cz-frozenVillage.cz0)<r+24)return true;
  if(undergroundCity&&Math.hypot(cx-undergroundCity.cx,cz-undergroundCity.cz)<r+undergroundCity.R)return true;
  return false;
}
function _sccFindSite(anchor){
  const cands=[[0,0],[14,0],[-14,0],[0,14],[0,-14],[18,12],[-18,12]];
  let best=null,bestScore=Infinity;
  for(const[ox,oz]of cands){
    const cx=anchor.cx0+ox,cz=anchor.cz0+oz;
    if(Math.hypot(cx-P.x,cz-P.z)<SKY_CITY_CFG.radius+9||_sccNearExisting(cx,cz,SKY_CITY_CFG.radius+8))continue;
    let maxH=-Infinity,minH=Infinity;
    for(let dx=-28;dx<=28;dx+=7)for(let dz=-28;dz<=28;dz+=7){const h=getHeight(cx+dx,cz+dz);maxH=Math.max(maxH,h);minH=Math.min(minH,h);}
    const score=(maxH-minH)+Math.hypot(ox,oz)*.04;
    if(score<bestScore){bestScore=score;best={cx,cz,maxH};}
  }
  if(best)return best;
  let maxH=-Infinity;for(let dx=-28;dx<=28;dx+=7)for(let dz=-28;dz<=28;dz+=7)maxH=Math.max(maxH,getHeight(anchor.cx0+dx,anchor.cz0+dz));
  return{cx:anchor.cx0,cz:anchor.cz0,maxH};
}
function _sccPlan(cx,cz,baseY,rot){
  const plan={cfg:SKY_CITY_CFG,cx,cz,baseY,rot:rot&3,rng:_wtRng(_sccSeed(cx,cz)),
    coreKeys:new Set(),bridgeCells:[],doorCells:[],lightSpots:[],waterCells:[]};
  // 庭園から隠し制御室へ伸びる、停止中は中央が欠けた光の橋。
  for(let i=0;i<=14;i++)for(let w=-1;w<=1;w++){
    const lx=20+Math.round(i*.57)+w,lz=-2-Math.round(i*.86),p=_sccW(plan,lx,lz);
    plan.bridgeCells.push({x:p.x,y:baseY+4+Math.floor(i/8),z:p.z,edge:Math.abs(w)===1&&i%4===0});
  }
  // 隠し制御室の正面入口（再起動前は黒曜石の扉）。建物の通常の入口開口を
  // ちょうど塞ぐ3×3に合わせ、壁のない側から先回りできない配置にする。
  for(let y=baseY+8;y<=baseY+10;y++)for(let x=28;x<=30;x++){const p=_sccW(plan,x,-12);plan.doorCells.push({x:p.x,y,z:p.z});}
  const lights=[[-7,baseY+2,-7],[7,baseY+2,-7],[-7,baseY+2,7],[7,baseY+2,7],[-18,baseY+1,3],[-22,baseY+1,7],[18,baseY+5,2],[22,baseY+5,5],[0,baseY+7,-21],[3,baseY+7,-21],[0,baseY-3,13],[3,baseY-3,13],[28,baseY+8,-16]];
  for(const[lx,y,lz]of lights){const p=_sccW(plan,lx,lz);plan.lightSpots.push({x:p.x,y,z:p.z});}
  for(let i=0;i<8;i++){const p=_sccW(plan,15+i,4);plan.waterCells.push({x:p.x,y:baseY+4,z:p.z});}
  const rp=_sccW(plan,0,13);plan.reactor={x:rp.x,y:baseY-2,z:rp.z};
  // ロード時にも攻撃起動判定を復元できるよう、炉生成とは独立にキーを導出する。
  for(let yy=1;yy<=7;yy++)for(let x=-1;x<=1;x++)for(let z=12;z<=14;z++)if(Math.abs(x)+Math.abs(z-13)<=2){const p=_sccW(plan,x,z);plan.coreKeys.add(vKey(p.x,baseY-3+yy,p.z));}
  const hp=_sccW(plan,29,-16);plan.hiddenChest={x:hp.x,y:baseY+7,z:hp.z,key:vKey(hp.x,baseY+7,hp.z)};
  return plan;
}

function _sccIsland(plan,lx,lz,y,rx,rz,topTi,ruin){
  for(let dx=-rx;dx<=rx;dx++)for(let dz=-rz;dz<=rz;dz++){
    const q=(dx*dx)/(rx*rx)+(dz*dz)/(rz*rz),edge=_wtHash((plan.cx+lx+dx)*91^(plan.cz+lz+dz)*173^(y*47));
    if(q>1+(edge-.5)*.2)continue;
    const wp=_sccW(plan,lx+dx,lz+dz),thick=2+Math.max(0,Math.floor((1-Math.min(1,q))*5))+(edge<.15?1:0);
    put(wp.x,y,wp.z,topTi);
    for(let d=1;d<=thick;d++)put(wp.x,y-d,wp.z,_sccWeathered(wp.x,y-d,wp.z));
    if(q<.46&&edge<.12)for(let d=thick+1;d<=thick+2+Math.floor(edge*20);d++)put(wp.x,y-d,wp.z,d===thick+2?CRYSTAL_BLOCK:DEEP_STONE);
    if(ruin&&q>.52&&edge<.08)clr(wp.x,y,wp.z); // 欠けた縁。ただし中心の導線は残す
  }
}
function generateSkyCityIslands(plan){
  _sccIsland(plan,0,0,plan.baseY,11,10,6,true);               // 中央広場
  _sccIsland(plan,-20,4,plan.baseY-1,9,8,6,true);            // 住宅区域
  _sccIsland(plan,20,4,plan.baseY+3,9,8,0,false);            // 空中庭園
  _sccIsland(plan,0,-22,plan.baseY+5,9,8,6,true);            // 崩れた神殿
  _sccIsland(plan,-18,-18,plan.baseY+6,7,6,1,true);          // 高塔
  _sccIsland(plan,0,23,plan.baseY-4,10,7,6,true);            // 港・発着場
  _sccIsland(plan,-13,24,plan.baseY-9,7,6,DEEP_STONE,true);  // 下層遺跡・復帰足場
  _sccIsland(plan,0,13,plan.baseY-4,7,6,DEEP_STONE,false);   // 動力炉区域
  _sccIsland(plan,29,-16,plan.baseY+6,7,6,6,true);           // 隠し制御室
  // 周囲の小破片。形・高さ・厚さを変え、下面に水晶と垂れ下がる植物を混ぜる。
  const fr=[[-31,7,-3,4,3],[-27,22,2,3,3],[31,12,5,4,2],[17,-31,9,3,3],[-7,-34,4,4,2],[30,-2,-6,3,2]];
  for(const[lx,lz,dy,rx,rz]of fr)_sccIsland(plan,lx,lz,plan.baseY+dy,rx,rz,dy%2?6:1,true);
}

function _sccBridge(plan,ax,az,ay,bx,bz,by,width,broken){
  const n=Math.max(Math.abs(bx-ax),Math.abs(bz-az));
  for(let i=0;i<=n;i++){
    const t=i/(n||1),lx=Math.round(ax+(bx-ax)*t),lz=Math.round(az+(bz-az)*t),y=Math.round(ay+(by-ay)*t);
    if(broken&&i>n*.42&&i<n*.58)continue;
    for(let w=-width;w<=width;w++){
      const side=Math.abs(bx-ax)>=Math.abs(bz-az)?[0,w]:[w,0];
      _sccPut(plan,lx+side[0],y,lz+side[1],i%6===0?4:1);
      if(Math.abs(w)===width&&i%4===0)_sccPut(plan,lx+side[0],y+1,lz+side[1],6);
    }
  }
}
function generateSkyCityBridges(plan){
  _sccBridge(plan,-10,2,plan.baseY,-12,3,plan.baseY-1,2,false);
  _sccBridge(plan,9,2,plan.baseY,12,3,plan.baseY+3,2,false);
  _sccBridge(plan,0,-9,plan.baseY,0,-14,plan.baseY+5,2,true); // 途中で途切れた神殿橋
  _sccBridge(plan,-8,-7,plan.baseY,-13,-13,plan.baseY+6,2,false);
  _sccBridge(plan,0,9,plan.baseY,0,17,plan.baseY-4,2,false);
  _sccBridge(plan,-7,9,plan.baseY,-10,19,plan.baseY-9,2,false);
  _sccBridge(plan,3,9,plan.baseY-1,2,13,plan.baseY-4,2,false);
  // 隠し区域へは端だけ残し、中央は炉の復旧後に光の橋になる。
  for(const c of plan.bridgeCells){const d=Math.hypot(c.x-plan.cx,c.z-plan.cz);if(d<23||d>31)put(c.x,c.y,c.z,1);}
  // 港から下へ垂れる壊れた大階段。主要通路は3ブロック幅でスマホでも歩きやすい。
  for(let i=0;i<15;i++)for(let w=-1;w<=1;w++)_sccPut(plan,w,plan.baseY-5-i,30+i,STAIR_BLOCK,plan.rot&3);
}

function _sccHouse(plan,lx,lz,y,w,d,h,missingSide){
  for(let x=-w;x<=w;x++)for(let z=-d;z<=d;z++)_sccPut(plan,lx+x,y,lz+z,_sccWeathered(lx+x,y,lz+z));
  for(let yy=1;yy<=h;yy++)for(let x=-w;x<=w;x++)for(let z=-d;z<=d;z++){
    const wall=Math.abs(x)===w||Math.abs(z)===d;if(!wall)continue;
    if(z===d&&Math.abs(x)<=1&&yy<=2)continue; // 広い入口
    const breakChance=(missingSide&&x===missingSide)?.55:.13;
    const broken=_wtHash((lx+x)*67^(lz+z)*131^(y+yy)*199)<breakChance;
    if(!broken)_sccPut(plan,lx+x,y+yy,lz+z,yy===h&&((x+z)&1)?4:6);
  }
  // 部分的な屋根と抜けた床で、内部を歩ける廃屋にする。
  for(let x=-w;x<=w;x++)for(let z=-d;z<=d;z++)if(_wtHash((lx+x)*211^(lz+z)*97)>.35)_sccPut(plan,lx+x,y+h+1,lz+z,SLAB_BLOCK,0);
}
function generateSkyCityBuildings(plan){
  // 崩れた住宅区域：壁のない部屋、半屋根、床穴がある3棟。
  _sccHouse(plan,-21,1,plan.baseY,3,3,4,-3);
  _sccHouse(plan,-16,7,plan.baseY,3,2,3,3);
  _sccHouse(plan,-24,8,plan.baseY,2,2,5,-2);
  for(const p of[[-19,4],[-23,5],[-17,3]])_sccClr(plan,p[0],plan.baseY,p[1]);
  // 高い塔：上へ行くほど芯がずれ、傾いて見える。内部には幅2の螺旋階段。
  for(let yy=0;yy<18;yy++){
    const off=Math.floor(yy/6),r=yy<13?3:2;
    for(let x=-r;x<=r;x++)for(let z=-r;z<=r;z++){
      if(Math.abs(x)!==r&&Math.abs(z)!==r)continue;
      if(yy>10&&z===r&&x>0)continue;
      _sccPut(plan,-18+x+off,plan.baseY+7+yy,-18+z,_sccWeathered(x,yy,z));
    }
    const a=yy&3,s=[[2,0],[0,2],[-2,0],[0,-2]][a];_sccPut(plan,-18+s[0]+off,plan.baseY+7+yy,-18+s[1],STAIR_BLOCK,(a+1)&3);
  }
  // 崩れた神殿：根元の欠けた列柱、片側だけの屋根、逆さに残る建築片。
  for(const x of[-6,-2,2,6])for(const z of[-4,4])for(let yy=1;yy<=7;yy++)if(!(yy===1&&((x+z)&3)===0))_sccPut(plan,x,plan.baseY+5+yy,-22+z,yy===7?4:6);
  for(let x=-7;x<=1;x++)for(let z=-5;z<=5;z++)if((x+z)%4)_sccPut(plan,x,plan.baseY+13,-22+z,SLAB_BLOCK,1);
  for(let yy=1;yy<=5;yy++)for(let x=-2;x<=2;x++)if(Math.abs(x)===2)_sccPut(plan,6+x,plan.baseY+4-yy,-25,DEEP_STONE);
  // 港・発着場：広い甲板と2本の発着桟橋。
  for(let x=-8;x<=8;x++)for(let z=-4;z<=4;z++)_sccPut(plan,x,plan.baseY-3,23+z,(Math.abs(x)%4===0)?4:6);
  for(const x of[-5,5])for(let z=28;z<=35;z++)for(let w=-1;w<=1;w++)_sccPut(plan,x+w,plan.baseY-3, z, z>33?SLAB_BLOCK:1);
  // 下層遺跡：回廊・崩れた柱・復帰用の幅広い足場。
  for(let x=-6;x<=6;x++)for(let z=-4;z<=4;z++)if(Math.abs(x)===6||Math.abs(z)===4)_sccPut(plan,-13+x,plan.baseY-8,24+z,DEEP_STONE);
  for(const[x,z,h]of[[-18,21,5],[-9,21,3],[-18,27,2],[-9,27,6]])for(let yy=1;yy<=h;yy++)_sccPut(plan,x,plan.baseY-8+yy,z,6);
  // 隠し制御室：壁画の色帯、書架、展望窓、閉じた入口。
  _sccHouse(plan,29,-16,plan.baseY+7,5,4,5,5);
  for(const c of plan.doorCells)put(c.x,c.y,c.z,OBSIDIAN_BLOCK);
  for(let x=27;x<=31;x++)for(let yy=1;yy<=3;yy++)_sccPut(plan,x,plan.baseY+7+yy,-19,yy===2?CRYSTAL_BLOCK:3);
  for(let x=27;x<=31;x++)for(let yy=2;yy<=4;yy++)_sccClr(plan,x,plan.baseY+7+yy,-20); // 外を望む大窓
}

function generateSkyGarden(plan){
  // 古代樹と空中へ伸びる根。
  for(let yy=1;yy<=8;yy++)_sccPut(plan,20,plan.baseY+3+yy,4,3);
  for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]])for(let i=1;i<=5;i++)_sccPut(plan,20+dx*i,plan.baseY+11+Math.floor(i/3),4+dz*i,3);
  for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)if(x*x+z*z<18&&_wtHash(x*59^z*101)>.22)_sccPut(plan,20+x,plan.baseY+12+(Math.abs(x)+Math.abs(z)<3?1:0),4+z,LEAF_BLOCK);
  for(const[dx,dz]of[[1,0],[-1,1],[0,-1]])for(let i=1;i<=7;i++)_sccPut(plan,20+dx*i,plan.baseY+3-Math.floor(i/3),4+dz*i,dx===0?LEAF_BLOCK:3);
  // 池・停止した水路・花畑・光る植物。
  for(let x=16;x<=19;x++)for(let z=5;z<=8;z++)_sccPut(plan,x,plan.baseY+4,z,WATER_BLOCK);
  for(const[x,z,ti]of[[24,2,MUSHROOM_BLOCK],[23,7,CRYSTAL_BLOCK],[17,1,MUSHROOM_BLOCK],[25,6,CRYSTAL_BLOCK],[16,9,21]])_sccPut(plan,x,plan.baseY+4,z,ti);
  // 崩れた東屋。
  for(const[x,z]of[[14,8],[14,12],[18,8],[18,12]])for(let yy=1;yy<=4;yy++)if(!(x===18&&z===12&&yy<3))_sccPut(plan,x,plan.baseY+3+yy,z,3);
  for(let x=14;x<=18;x++)for(let z=8;z<=12;z++)if((x+z)%3)_sccPut(plan,x,plan.baseY+8,z,SLAB_BLOCK,1);
}

function generateCentralReactor(plan){
  const y=plan.baseY-3;
  // 円形炉床・古代紋様・制御柱。中央結晶は通常ブロックと異なる配色で遠目にも判別できる。
  for(let x=-6;x<=6;x++)for(let z=8;z<=18;z++)if((x*x+(z-13)*(z-13))<=34)_sccPut(plan,x,y,z,((x+z)&2)?OBSIDIAN_BLOCK:DEEP_STONE);
  for(const[x,z]of[[-5,10],[5,10],[-5,16],[5,16]])for(let yy=1;yy<=4;yy++)_sccPut(plan,x,y+yy,z,yy===4?CRYSTAL_BLOCK:OBSIDIAN_BLOCK);
  for(let yy=1;yy<=7;yy++)for(let x=-1;x<=1;x++)for(let z=12;z<=14;z++)if(Math.abs(x)+Math.abs(z-13)<=2){
    const p=_sccW(plan,x,z);put(p.x,y+yy,p.z,yy===1||yy===7?DIAMOND_ORE:CRYSTAL_BLOCK);plan.coreKeys.add(vKey(p.x,y+yy,p.z));
  }
  // 中央広場：巨大円形床、紋章、崩れた像、各区域へ向く柱。
  for(let x=-9;x<=9;x++)for(let z=-9;z<=9;z++){
    const d2=x*x+z*z;if(d2>78)continue;
    _sccPut(plan,x,plan.baseY,z,d2<10?CRYSTAL_BLOCK:d2>58?4:6);
  }
  for(const[x,z,h]of[[-7,-7,5],[7,-7,4],[-7,7,3],[7,7,5]])for(let yy=1;yy<=h;yy++)if(!(x===-7&&z===7&&yy===1))_sccPut(plan,x,plan.baseY+yy,z,6);
  for(let yy=1;yy<=4;yy++)_sccPut(plan,3,plan.baseY+yy,0,yy===4?4:1);
  _sccPut(plan,4,plan.baseY+4,0,1);_sccPut(plan,5,plan.baseY+4,0,1); // 倒れた石像
}

function _sccPlaceSpecialChest(C){
  const s=C.hiddenChest,tk=s.key;if(underTreasures[tk])return;
  const mesh=_makeTreasureMesh(3);mesh.position.set(s.x+.5,s.y,s.z+.5);
  const opened=openedTreasureKeys.has(tk)||C.specialChestClaimed;
  if(!opened)scene.add(mesh);
  underTreasures[tk]={mesh,opened,type:3,struct:'collapsingSkyCity'};
  C.specialChestSpawned=true;C.specialChestClaimed=opened;
}
function restoreSkyBridge(C){
  C=C||collapsingSkyCity;if(!C||C.bridgeRestored)return;
  _deferDirty=true;
  try{for(const c of C.bridgeCells){put(c.x,c.y,c.z,c.edge?CRYSTAL_BLOCK:GLASS_BLOCK);}}
  finally{_deferDirty=false;flushDirtyChunks();}
  C.bridgeRestored=true;
}
function unlockSkyCityHiddenArea(C){
  C=C||collapsingSkyCity;if(!C||C.hiddenUnlocked)return;
  _deferDirty=true;try{for(const c of C.doorCells)clr(c.x,c.y,c.z);}finally{_deferDirty=false;flushDirtyChunks();}
  C.hiddenUnlocked=true;_sccPlaceSpecialChest(C);
}
function _sccLightCity(C){
  _deferDirty=true;try{for(const s of C.lightSpots)if(recAt(s.x,s.y,s.z))put(s.x,s.y,s.z,TORCH_BLOCK);}finally{_deferDirty=false;flushDirtyChunks();}
  C.lightsOn=true;
}
function _sccStartWater(C){
  _deferDirty=true;try{for(const s of C.waterCells)if(recAt(s.x,s.y,s.z))put(s.x,s.y,s.z,WATER_BLOCK);}finally{_deferDirty=false;flushDirtyChunks();}
  C.waterOn=true;
}

function _sccRegister(plan,st){
  collapsingSkyCity={...plan,
    generated:true,reactorState:st.reactorState||'stopped',activated:!!st.activated,
    bridgeRestored:!!st.bridgeRestored,hiddenUnlocked:!!st.hiddenUnlocked,lightsOn:!!st.lightsOn,waterOn:!!st.waterOn,
    specialChestSpawned:!!st.specialChestSpawned,specialChestClaimed:!!st.specialChestClaimed,
    bossSpawned:!!st.bossSpawned,bossDefeated:!!st.bossDefeated,
    restored:!!st.restored,contactT:0,ringSpeed:st.activated?2.4:.35,humT:5,debrisT:0,
    visual:null,reactorRings:[],plazaRing:null,glow:null,shadow:null,omen:null,beam:null,beamT:0,waterfall:null,floaters:[],
  };
}
function _sccBuildVisuals(){
  const C=collapsingSkyCity;if(!C||C.visual)return;
  const root=new THREE.Group();
  // 中央広場の宙に停止した巨大な輪（壊れた天球儀）。
  const ringMat=new THREE.MeshBasicMaterial({color:C.activated?0x8ffcff:0x657486,transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false});
  const plaza=new THREE.Mesh(new THREE.TorusGeometry(5.2,.18,6,38),ringMat);plaza.position.set(C.cx+.5,C.baseY+8,C.cz+.5);plaza.rotation.y=.35;root.add(plaza);C.plazaRing=plaza;
  const rg=new THREE.Group();rg.position.set(C.reactor.x+.5,C.reactor.y+3,C.reactor.z+.5);
  for(const[r,col,rx]of[[2.2,0x77ddff,.2],[3.0,0xd488ff,1.1],[3.8,0xffd877,.65]]){const m=new THREE.Mesh(new THREE.TorusGeometry(r,.09,6,30),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:C.activated?.9:.42,blending:THREE.AdditiveBlending,depthWrite:false}));m.rotation.x=rx;rg.add(m);C.reactorRings.push(m);}
  root.add(rg);C.glow=_ftvGlowSprite();C.glow.position.set(C.reactor.x+.5,C.reactor.y+4,C.reactor.z+.5);C.glow.scale.set(C.activated?12:6,C.activated?12:6,1);root.add(C.glow);
  // 空中庭園の滝。地上へ届く前に半透明の霧へ溶ける簡易表現。
  const wp=_sccW(C,27,7);const wf=new THREE.Mesh(new THREE.CylinderGeometry(.25,1.5,15,7,1,true),new THREE.MeshBasicMaterial({color:0x8bdcff,transparent:true,opacity:.33,depthWrite:false,side:THREE.DoubleSide}));wf.position.set(wp.x+.5,C.baseY-3,wp.z+.5);root.add(wf);C.waterfall=wf;
  // 地上へ落ちる大きな影と、真下の不自然な淡い光。
  const gy=getHeight(C.cx,C.cz)+.12;
  const sh=new THREE.Mesh(new THREE.CircleGeometry(18,24),new THREE.MeshBasicMaterial({color:0x111827,transparent:true,opacity:.34,depthWrite:false}));sh.rotation.x=-Math.PI/2;sh.position.set(C.cx+.5,gy,C.cz+.5);root.add(sh);C.shadow=sh;
  const om=_ftvGlowSprite();om.position.set(C.cx+.5,gy+.35,C.cz+.5);om.scale.set(16,16,1);root.add(om);C.omen=om;
  // 重力異常区域の宙に浮く小瓦礫（見た目のみ、移動処理には触れない）。
  const fp=_sccW(C,-13,24);
  for(let i=0;i<(isTouch?4:7);i++){const src=blockMats[i%2?CRYSTAL_BLOCK:6],mat=(Array.isArray(src)?src[0]:src).clone();const m=new THREE.Mesh(new THREE.BoxGeometry(.35+.1*(i%3),.3,.35),mat);m.position.set(fp.x+(i%3)*1.5-1.5,C.baseY-3+(i%4)*1.1,fp.z+Math.floor(i/3)*1.4);root.add(m);C.floaters.push(m);}
  scene.add(root);C.visual=root;
}
function _sccDisposeVisuals(){
  const C=collapsingSkyCity;if(!C||!C.visual)return;
  scene.remove(C.visual);C.visual.traverse(o=>{if(o.isMesh||o.isSprite){if(o.geometry&&o.geometry!==boxGeo)o.geometry.dispose();if(o.material){if(o.material.map)o.material.map.dispose();o.material.dispose();}}});
  C.visual=null;C.reactorRings=[];C.plazaRing=null;C.glow=null;C.shadow=null;C.omen=null;C.beam=null;C.floaters=[];
}
function resetCollapsingSkyCity(){
  const C=collapsingSkyCity;if(!C)return;
  if(C.beam){scene.remove(C.beam);C.beam.geometry.dispose();C.beam.material.dispose();C.beam=null;}
  _sccDisposeVisuals();collapsingSkyCity=null;
}

function activateSkyCityReactor(){
  const C=collapsingSkyCity;if(!C||C.activated||C.reactorState!=='stopped')return;
  C.activated=true;C.reactorState='restarting';C.ringSpeed=5;
  const at=(i,fn)=>setTimeout(()=>{if(collapsingSkyCity!==C)return;try{fn();}catch(e){console.warn('天空都市: 再起動演出中にエラー',e);}},i*SKY_CITY_CFG.activationStepMs);
  showAlert('⚙ 天空都市の中央動力炉が再起動を始めた…');ftvShake(.45,.8);
  playTone(52,.75,.3,'sawtooth');setTimeout(()=>playTone(78,.55,.22,'sawtooth'),260);
  if(C.glow)C.glow.scale.set(15,15,1);
  spawnParticles(C.reactor.x+.5,C.reactor.y+4,C.reactor.z+.5,0x99eeff,8);
  // 空へ伸びる短時間の光柱。
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.5,1.5,35,9,1,true),new THREE.MeshBasicMaterial({color:0x99eeff,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));
  beam.position.set(C.reactor.x+.5,C.reactor.y+21,C.reactor.z+.5);scene.add(beam);C.beam=beam;C.beamT=4.2;
  at(1,()=>{_sccLightCity(C);playTone(440,.18,.12,'sine');setTimeout(()=>playTone(660,.18,.12,'sine'),130);});
  at(2,()=>{restoreSkyBridge(C);ftvShake(.22,.35);showAlert('✨ 崩れていた通路に光の橋が形成された');playTone(880,.25,.15,'triangle');});
  at(3,()=>{unlockSkyCityHiddenArea(C);showAlert('🚪 天空制御室の封印が開いた…！');playTone(160,.35,.18,'square');});
  at(4,()=>{_sccStartWater(C);C.reactorState='running';C.ringSpeed=2.4;if(C.plazaRing)C.plazaRing.material.color.setHex(0x8ffcff);showAlert('天空都市の動力が復旧した');ftvShake(.28,.45);playTone(523,.18,.12,'sine');setTimeout(()=>playTone(784,.28,.12,'sine'),180);saveGame();});
}
function sccOnBlockBroken(k){const C=collapsingSkyCity;if(C&&!C.activated&&C.coreKeys.has(k))activateSkyCityReactor();}

function _sccEnsurePoweredState(C){
  if(!C||!C.activated||!recAt(C.reactor.x,C.reactor.y,C.reactor.z))return;
  if(!C.lightsOn)_sccLightCity(C);
  if(!C.bridgeRestored)restoreSkyBridge(C);
  if(!C.hiddenUnlocked)unlockSkyCityHiddenArea(C);
  if(!C.waterOn)_sccStartWater(C);
  if(C.reactorState!=='running')C.reactorState='running';
}
function updateCollapsingSkyCity(dt){
  const C=collapsingSkyCity;if(!C)return;
  if(C.beam){C.beamT-=dt;if(C.beamT<=0){scene.remove(C.beam);C.beam.geometry.dispose();C.beam.material.dispose();C.beam=null;}else C.beam.material.opacity=.5*Math.min(1,C.beamT/1.2);}
  const dx=P.x-C.cx,dz=P.z-C.cz,pd=Math.hypot(dx,dz);
  if(pd>105){if(C.visual)C.visual.visible=false;return;}
  if(!C.visual)_sccBuildVisuals();else C.visual.visible=true;
  if(pd<70)_sccEnsurePoweredState(C);
  const night=gs.time>=.4&&gs.time<=.9;
  if(C.omen){C.omen.material.opacity=night?.72:.17;C.omen.visible=P.y<C.baseY-8;}
  if(C.shadow){C.shadow.material.opacity=.18+.2*Math.max(0,1-P.y/C.baseY);}
  if(pd>55)return; // 細かな演出・当たり判定は近距離だけ
  if(C.plazaRing){C.plazaRing.rotation.z+=dt*(C.activated?.35:.04);C.plazaRing.rotation.y+=dt*.08;}
  for(let i=0;i<C.reactorRings.length;i++){const r=C.reactorRings[i];r.rotation.z+=dt*C.ringSpeed*(.55+i*.22);r.rotation.y+=dt*C.ringSpeed*.16;}
  for(let i=0;i<C.floaters.length;i++){const f=C.floaters[i];f.rotation.x+=dt*.16;f.rotation.y+=dt*.25;f.position.y+=Math.sin(performance.now()*.001+i)*dt*.06;}
  // 地上から見える小さな落石。大量物理は使わず、近距離で低頻度の粒子だけ出す。
  C.debrisT-=dt;if(C.debrisT<=0&&P.y<C.baseY-8){C.debrisT=isTouch?2.2:1.35;spawnParticles(C.cx+(Math.random()-.5)*25,C.baseY-10,C.cz+(Math.random()-.5)*25,0x7b8490,1);}
  C.humT-=dt;if(C.humT<=0&&P.y<C.baseY-7){C.humT=9+Math.random()*7;playTone(C.activated?92:58,.65,.045,'sawtooth');}
  if(C.activated)return;
  const rx=P.x-(C.reactor.x+.5),ry=(P.y+1)-(C.reactor.y+3),rz=P.z-(C.reactor.z+.5);
  if(rx*rx+ry*ry+rz*rz<13){if(C.contactT===0)showBonus('⚙ 動力炉が反応している…（触れ続けるか攻撃で再起動）');C.contactT+=dt;if(C.contactT>=.75)activateSkyCityReactor();}
  else C.contactT=0;
}

function sccSaveState(){
  const C=collapsingSkyCity;if(!C)return null;
  const claimed=openedTreasureKeys.has(C.hiddenChest.key)||C.specialChestClaimed;
  return{generated:true,cx:C.cx,cz:C.cz,baseY:C.baseY,rot:C.rot,reactorState:C.reactorState,activated:C.activated,
    bridgeRestored:C.bridgeRestored,hiddenUnlocked:C.hiddenUnlocked,lightsOn:C.lightsOn,waterOn:C.waterOn,
    specialChestSpawned:C.specialChestSpawned,specialChestClaimed:claimed,bossSpawned:C.bossSpawned,bossDefeated:C.bossDefeated};
}
function sccLoadState(d){
  resetCollapsingSkyCity();
  if(!d||!d.generated||typeof d.cx!=='number'||typeof d.cz!=='number'||typeof d.baseY!=='number')return;
  const plan=_sccPlan(d.cx,d.cz,d.baseY,d.rot||0),activated=!!d.activated||d.reactorState==='running'||d.reactorState==='restarting';
  _sccRegister(plan,{reactorState:activated?'running':'stopped',activated,
    bridgeRestored:!!d.bridgeRestored,hiddenUnlocked:!!d.hiddenUnlocked,lightsOn:!!d.lightsOn,waterOn:!!d.waterOn,
    specialChestSpawned:!!d.specialChestSpawned,specialChestClaimed:!!d.specialChestClaimed,
    bossSpawned:!!d.bossSpawned,bossDefeated:!!d.bossDefeated,restored:false});
}
function sccAfterLoad(){
  const C=collapsingSkyCity;if(!C)return;
  C.specialChestClaimed=C.specialChestClaimed||openedTreasureKeys.has(C.hiddenChest.key);
  if(C.activated&&!C.specialChestClaimed)_sccPlaceSpecialChest(C);
}

function _sccProgress(show,frac){
  const el=document.getElementById('worldTreeProgress');if(!el)return;const lbl=document.getElementById('wtpLabel'),fill=document.getElementById('wtpFill');
  el.style.display=show?'':'none';if(show){if(lbl)lbl.textContent='☁ 崩れかけの天空都市を生成中…';if(fill)fill.style.width=Math.round((frac||0)*100)+'%';}else if(lbl)lbl.textContent='🌳 世界樹を生成中…';
}
function generateCollapsingSkyCity(){
  if(_skyCityBusy){showBonus('☁ 崩れかけの天空都市を生成中…');return;}
  if(collapsingSkyCity){showBonus('☁ 天空都市はすでに存在する（中心: X '+collapsingSkyCity.cx+' / Z '+collapsingSkyCity.cz+'）');return;}
  if(!window.confirm('「崩れかけの天空都市」を前方の雲上に生成します。複数の浮遊島を探索し、中央動力炉を再起動してください。生成しますか？'))return;
  _skyCityBusy=true;_sccProgress(true,0);
  let plan;
  try{
    const anchor=_frontAnchor(SKY_CITY_CFG.anchorDist),site=_sccFindSite(anchor);
    const baseY=Math.max(CLOUD_Y+2,Math.min(60,site.maxH+SKY_CITY_CFG.heightAboveGround));
    // ロード時にも同じ向きで設計図を再構成できるよう、90度単位の回転を状態に保存する。
    const rot=((Math.round((anchor.aim-Math.PI/2)/(Math.PI/2))%4)+4)%4;
    plan=_sccPlan(site.cx,site.cz,baseY,rot);
  }catch(e){console.error('天空都市: 準備中にエラー',e);_skyCityBusy=false;_sccProgress(false);showBonus('⚠ 天空都市の生成に失敗しました');return;}
  // 必要チャンクも4個ずつフレーム分割して、スマホでの長い停止を避ける。
  const jobs=[];for(let cx=Math.floor((plan.cx-SKY_CITY_CFG.radius-4)/CHUNK);cx<=Math.floor((plan.cx+SKY_CITY_CFG.radius+4)/CHUNK);cx++)for(let cz=Math.floor((plan.cz-SKY_CITY_CFG.radius-4)/CHUNK);cz<=Math.floor((plan.cz+SKY_CITY_CFG.radius+4)/CHUNK);cz++)jobs.push([cx,cz]);
  const phases=[];for(let i=0;i<jobs.length;i+=4)phases.push(()=>{for(const[cx,cz]of jobs.slice(i,i+4))generateChunk(cx,cz);});
  phases.push(()=>generateSkyCityIslands(plan));
  phases.push(()=>generateSkyCityBridges(plan));
  phases.push(()=>generateSkyCityBuildings(plan));
  phases.push(()=>generateSkyGarden(plan));
  phases.push(()=>generateCentralReactor(plan));
  phases.push(()=>{_sccRegister(plan,{reactorState:'stopped',activated:false,restored:true});_sccBuildVisuals();});
  let idx=0;
  const step=()=>{
    try{
      _deferDirty=true;phases[idx]();idx++;_deferDirty=false;flushDirtyChunks();_sccProgress(true,idx/phases.length);
      if(idx<phases.length)requestAnimationFrame(step);
      else{_skyCityBusy=false;_sccProgress(false);showAlert('☁ 雲の上に巨大な影が現れた…');showBonus('崩れかけの天空都市を生成！ 中心 X '+plan.cx+' / Z '+plan.cz);playTone(110,.35,.12,'sawtooth');saveGame();}
    }catch(e){console.error('天空都市: 生成中にエラー',e);_deferDirty=false;try{flushDirtyChunks();}catch(_){} _skyCityBusy=false;_sccProgress(false);showBonus('⚠ 天空都市の生成に失敗しました');}
  };
  requestAnimationFrame(step);
}
