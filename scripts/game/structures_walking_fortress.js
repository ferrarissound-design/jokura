// ============================================================================
// jokura / structures_walking_fortress.js
// 🏰 歩き続ける巨大城塞（移動体特殊生成）
// world.js から分割されたファイルの一部。全スクリプトは index.html の PARTS の
// 順序で <script> として読み込まれ、同一のグローバルスコープを共有する。
// このファイルは world.js（地形・チャンク・ブロック定義）より後、
// structures_registry.js（生成関数を登録テーブルで参照）より前に読み込まれる。
// ============================================================================

// ═══ 歩き続ける巨大城塞（移動体特殊生成） ═══
let walkingFortress=null;
const WF_STEP_INTERVAL=1.2,WF_SPEED=.85,WF_DETAIL_R=190,WF_VISIBLE_R=420;
const WF_LEG_POS=[[-15,-8],[-15,8],[0,-9],[0,9],[15,-8],[15,8]];
const WF_BODY_BOXES=[
  [-13,10,-9,13,11,9],[-13,17,-9,13,18,9], // lower deck floor/ceiling
  [-13,11,-9,-12,17,9],[12,11,-9,13,17,9],[-13,11,-9,13,17,-8],[-13,11,8,13,17,9], // lower walls
  [-10,18,-7,10,19,7],[-10,21,-7,10,22,7], // central hall
  [-10,19,-7,-9,21,7],[9,19,-7,10,21,7],[-10,19,-7,10,21,-6],[-10,19,6,10,21,7],
  [-5,22,-4,5,23,4],[-5,26,-4,5,27,4], // control room
  [-5,23,-4,-4,26,4],[4,23,-4,5,26,4],[-5,23,-4,5,26,-3],[-5,23,3,5,26,4],
  [-15,12,-11,15,15,-9],[-15,12,9,15,15,11],[-15,12,-9,-13,15,9],[13,12,-9,15,15,9], // outer ramparts
];
function _wfBox(root,x0,y0,z0,x1,y1,z1,mat,tag){
  const m=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0),mat);
  m.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);
  m.userData.baseX=m.position.x;m.userData.baseY=m.position.y;m.userData.baseZ=m.position.z;
  if(tag)m.userData[tag]=true;
  root.add(m);
  return m;
}
function _wfSpire(root,x,z,y0,h,mat,capMat,tag){
  _wfBox(root,x-1.8,y0,z-1.8,x+1.8,y0+h,z+1.8,mat,tag);
  _wfBox(root,x-2.5,y0+h,z-2.5,x+2.5,y0+h+1.4,z+2.5,capMat||mat,tag);
  _wfBox(root,x-.8,y0+h+1.4,z-.8,x+.8,y0+h+5.5,z+.8,capMat||mat,tag);
}
function _wfBuildMesh(){
  const root=new THREE.Group();root.userData.isWalkingFortress=true;
  const detail=new THREE.Group(),silhouette=new THREE.Group();
  root.userData.detail=detail;root.userData.silhouette=silhouette;root.add(detail,silhouette);
  const mats=root.userData.mats={
    stone:new THREE.MeshStandardMaterial({color:0x747780,roughness:.95}),
    dark:new THREE.MeshStandardMaterial({color:0x2a2e3d,roughness:.9}),
    core:new THREE.MeshStandardMaterial({color:0x00e5ff,emissive:0x00aacc,emissiveIntensity:1.35,roughness:.35}),
    gold:new THREE.MeshStandardMaterial({color:0xd9b44a,roughness:.7}),
    ruin:new THREE.MeshStandardMaterial({color:0x4b4f58,roughness:1}),
    flag:new THREE.MeshStandardMaterial({color:0x8b1e2d,roughness:.85}),
    far:new THREE.MeshStandardMaterial({color:0x252a35,roughness:1}),
  };
  const stone=mats.stone,dark=mats.dark,core=mats.core,gold=mats.gold,ruin=mats.ruin,flag=mats.flag;

  // 遠景用LOD: 少ない箱だけで「都市が脚で歩いている」シルエットを先に読ませる。
  _wfBox(silhouette,-18,10,-12,18,22,12,mats.far);
  _wfBox(silhouette,-5,22,-5,5,46,5,mats.far);
  for(const p of WF_LEG_POS)_wfBox(silhouette,p[0]-1,0,p[1]-1,p[0]+1,12,p[1]+1,mats.far);

  for(const b of WF_BODY_BOXES)_wfBox(detail,...b,stone);

  // 6脚: 直線柱ではなく、腰・逆関節・足先装甲の三段構造にする。
  for(const [i,p] of WF_LEG_POS.entries()){
    const sx=p[0],sz=p[1],side=sz<0?-1:1,front=sx<0?-1:sx>0?1:0;
    _wfBox(detail,sx-1.7,7,sz-1.4,sx+1.7,13,sz+1.4,dark,'wfLeg');
    _wfBox(detail,sx-2.4+front*.8,3.4,sz+side*1.2,sx+.8+front*.8,8.2,sz+side*3.2,ruin,'wfLeg');
    _wfBox(detail,sx-2.6,0,sz+side*2.4,sx+2.8,2.2,sz+side*6.2,dark,'wfFoot');
    _wfBox(detail,sx-3.4,0,sz+side*5.7,sx-1.6,1.1,sz+side*7.2,gold,'wfFoot');
    _wfBox(detail,sx+1.6,0,sz+side*5.7,sx+3.4,1.1,sz+side*7.2,gold,'wfFoot');
    if(i===4)_wfBox(detail,sx-2.8,8.4,sz-1.8,sx+2.8,10.2,sz+1.8,core); // 破損脚の露出動力線
  }

  // 上部都市: 非対称な主塔・副塔・居住区・鐘楼・砲台・崩壊区画。
  _wfBox(detail,-18,18,-12,18,20,12,stone);
  _wfSpire(detail,-1,0,20,24,stone,dark);             // 遠景で目立つ巨大主塔
  _wfSpire(detail,-11,-7,18,13,stone,dark);
  _wfSpire(detail,13,8,18,10,stone,ruin);
  _wfSpire(detail,7,-10,18,8,ruin,dark);
  _wfBox(detail,-17,20,2,-7,28,11,stone);             // 左後方の居住区
  _wfBox(detail,5,20,-11,17,27,-3,stone);             // 右前方の居住区
  _wfBox(detail,-4,27,-12,5,34,-6,ruin);              // 崩れた上層区画
  _wfBox(detail,-17,21,-12,-10,24,-8,ruin);           // 露出した瓦礫床
  _wfBox(detail,9,28,7,13,39,11,stone);               // 鐘楼
  _wfBox(detail,10,39,8,12,41,10,gold);
  for(const x of[-15,-9,-3,3,9,15]){_wfBox(detail,x-.7,22,-13,x+.7,24,-11,dark);_wfBox(detail,x-.7,22,11,x+.7,24,13,dark);}
  for(const z of[-9,-3,3,9]){_wfBox(detail,-19,22,z-.7,-17,24,z+.7,dark);_wfBox(detail,17,22,z-.7,19,24,z+.7,dark);}

  // 前面: 巨大城門と仮面に見える象徴的構造。胴体下部には発光炉。
  _wfBox(detail,-5,11,-13,5,18,-11,dark);
  _wfBox(detail,-3,13,-13.5,-1,16,-12.7,core);
  _wfBox(detail,1,13,-13.5,3,16,-12.7,core);
  _wfBox(detail,-7,18,-13.5,7,21,-12.2,gold);
  _wfBox(detail,-4,6,-10,4,12,-8,core);               // 巨大動力炉
  _wfBox(detail,-5,5.2,-10.5,5,6.2,-7.5,dark);

  // 背面の鎖・吊り下がった廃墟・旗・橋・残骸。
  for(let i=0;i<6;i++){const y=18-i*2.1;_wfBox(detail,-14,y,12.2,-12,y+.7,14.2,dark);_wfBox(detail,12,y,12.2,14,y+.7,14.2,dark);}
  _wfBox(detail,-16,4,15,-8,10,21,ruin);
  _wfBox(detail,8,7,14,17,12,20,ruin);
  _wfBox(detail,-3,16,12,3,17,24,dark);
  _wfBox(detail,3,34,4,3.4,41,4.4,dark);_wfBox(detail,3.4,37,4.4,8,41,4.8,flag);
  _wfBox(detail,-2,44,0,2,45,1,flag);

  // 内部探索を示す最低限の導線: 侵入口、外周通路、中央通路、動力炉、玉座/制御室。
  _wfBox(detail,-3,12,-11,3,17,-9,dark); // 侵入口
  _wfBox(detail,-8,19,-2,8,21,2,dark);   // 中央通路
  _wfBox(detail,-3,20,-3,3,24,3,core);   // 動力炉
  _wfBox(detail,-2,25,-2,2,27,2,gold);   // 玉座・制御室
  for(let i=0;i<10;i++){const x=-12+i*2.6;_wfBox(detail,x,15.2,-11.7,x+.8,17.2,-10.9,dark);_wfBox(detail,x,15.2,10.9,x+.8,17.2,11.7,dark);}
  markShadowCaster(root);return root;
}
function _wfSurfaceY(x,z){let y=getHeight(Math.floor(x),Math.floor(z));for(let yy=y+6;yy>=-4;yy--){const v=voxels[vKey(Math.floor(x),yy,Math.floor(z))];if(v&&v.ti!==WATER_BLOCK&&v.ti!==LAVA_BLOCK)return yy;}return y;}
function _wfCreate(x,z,dir,phase,silent){
  const y=_wfSurfaceY(x,z),ang=Math.atan2(dir.x,dir.z);
  const mesh=_wfBuildMesh();mesh.position.set(x,y,z);mesh.rotation.y=ang;scene.add(mesh);
  walkingFortress={generated:true,x,y,z,dir:{x:dir.x,z:dir.z},angle:ang,phase:phase||0,stepT:0,motionCueT:0,mesh,lastStamp:0};
  if(!silent)showAlert('🏰 遠くで巨大城塞が歩き始めた…');
  return walkingFortress;
}
function generateWalkingFortress(){
  if(walkingFortress){showBonus('🏰 歩き続ける巨大城塞はすでに存在する');return;}
  const a=yaw+(Math.random()-.5)*1.2,dist=120+Math.random()*80;
  const x=P.x+Math.sin(a)*dist,z=P.z+Math.cos(a)*dist;
  const dirA=a+Math.PI+(Math.random()-.5)*.8;
  _wfCreate(x,z,{x:Math.sin(dirA),z:Math.cos(dirA)},Math.random()*Math.PI*2);
}
function resetWalkingFortress(){if(walkingFortress&&walkingFortress.mesh){scene.remove(walkingFortress.mesh);disposeObject3D(walkingFortress.mesh);}walkingFortress=null;}
function wfSaveState(){const F=walkingFortress;if(!F)return null;return{generated:true,x:F.x,y:F.y,z:F.z,dir:F.dir,phase:F.phase};}
function wfLoadState(d){resetWalkingFortress();if(!d||!d.generated)return;_wfCreate(d.x||0,d.z||0,d.dir||{x:1,z:0},d.phase||0,true);if(walkingFortress&&typeof d.y==='number'){walkingFortress.y=d.y;walkingFortress.mesh.position.y=d.y;}}
function _wfLocal(F,x,z){const dx=x-F.x,dz=z-F.z,c=Math.cos(-(F.angle||0)),s=Math.sin(-(F.angle||0));return{x:dx*c-dz*s,z:dx*s+dz*c};}
function _wfWorld(F,x,z){const c=Math.cos(F.angle||0),s=Math.sin(F.angle||0);return{x:F.x+x*c-z*s,z:F.z+x*s+z*c};}
function _wfPlayerInside(F){if(!F)return false;const p=_wfLocal(F,P.x,P.z);return Math.abs(p.x)<16&&P.y>F.y+1&&P.y<F.y+29&&Math.abs(p.z)<13;}
function _wfStampTrail(F){
  const now=performance.now();if(now-F.lastStamp<9000)return;F.lastStamp=now;
  for(const p of WF_LEG_POS){
    const wp=_wfWorld(F,p[0],p[1]),x=Math.round(wp.x),z=Math.round(wp.z),y=_wfSurfaceY(x,z);
    const v=voxels[vKey(x,y,z)];
    if(v&&v.active&&v.ti!==LAVA_BLOCK&&v.ti!==WATER_BLOCK){
      removeBlock(x,y,z);addBlock(x,y,z,DEEP_STONE,true,true);worldEdits.placed[vKey(x,y,z)]=DEEP_STONE;
    }
    if(typeof spawnParticles==='function')spawnParticles(x+.5,y+1,z+.5,0x6d6256,2);
  }
}
function wfMaybeSpawnNearChunk(cx,cz){
  if(walkingFortress||isCreative())return;
  if(Math.hypot(cx,cz)<8)return; // 初期探索圏には出さず、未探索エリア側でだけ低確率抽選
  if(rand2(cx,cz,WORLD_SEED^0x57f0)>0.0035)return;
  const x=cx*CHUNK+8,z=cz*CHUNK+8,a=Math.atan2(-z,-x)+(rand2(cx,cz,91)-.5)*.7;
  _wfCreate(x,z,{x:Math.sin(a),z:Math.cos(a)},rand2(cx,cz,92)*Math.PI*2);
}
function updateWalkingFortress(dt){
  const F=walkingFortress;if(!F||!F.mesh)return;
  F.stepT+=dt;F.motionCueT=(F.motionCueT||0)+dt;F.phase+=dt*3.2;
  const dist=Math.hypot(P.x-F.x,P.z-F.z),near=dist<WF_DETAIL_R;
  F.mesh.visible=dist<WF_VISIBLE_R;
  if(F.mesh.userData.detail)F.mesh.userData.detail.visible=near;
  if(F.mesh.userData.silhouette)F.mesh.userData.silhouette.visible=F.mesh.visible&&!near;
  const dx=F.dir.x*WF_SPEED*dt,dz=F.dir.z*WF_SPEED*dt;
  F.x+=dx;F.z+=dz; // 非表示距離でも座標は進める: 再接近した時に確実に移動済みに見える
  F.y+=(_wfSurfaceY(F.x,F.z)+1.5-F.y)*Math.min(1,dt*.25);
  F.mesh.position.set(F.x,F.y+Math.sin(F.phase)*.35,F.z);
  F.mesh.rotation.z=Math.sin(F.phase*.5)*.018;
  if(F.mesh.visible){
    let li=0;
    F.mesh.traverse(c=>{
      if(c.userData&&(c.userData.wfLeg||c.userData.wfFoot)){
        const ph=F.phase+li*.9,step=Math.sin(ph),swing=Math.cos(ph)*.42;
        c.position.x=(c.userData.baseX!=null?c.userData.baseX:c.position.x)+(c.userData.wfFoot?swing*.7:swing*.25);
        c.position.y=(c.userData.baseY!=null?c.userData.baseY:c.position.y)+(c.userData.wfFoot?Math.max(0,step)*.75:step*.38);
        c.position.z=(c.userData.baseZ!=null?c.userData.baseZ:c.position.z)+(c.userData.wfFoot?swing*.55:swing*.18);
        li++;
      }
    });
  }

  if(near&&F.motionCueT>.35){
    F.motionCueT=0;
    const p=WF_LEG_POS[Math.floor(F.phase*2)%WF_LEG_POS.length],wp=_wfWorld(F,p[0],p[1]);
    if(typeof spawnParticles==='function')spawnParticles(wp.x,_wfSurfaceY(wp.x,wp.z)+1,wp.z,0x8a7a66,3);
  }
  if(_wfPlayerInside(F)){P.x+=dx;P.z+=dz;}
  if(F.stepT>WF_STEP_INTERVAL){F.stepT=0;_wfStampTrail(F);}
}
function wfOverlaps(px,py,pz,hw,hh){
  const F=walkingFortress;
  if(!F||!F.mesh||!F.mesh.visible||Math.hypot(px-F.x,pz-F.z)>WF_DETAIL_R)return false;
  const lp=_wfLocal(F,px,pz),lx=lp.x,lz=lp.z,ly=py-F.y;
  for(const e of WF_BODY_BOXES){
    if(lx-hw<e[3]&&lx+hw>e[0]&&ly<e[4]&&ly+hh>e[1]&&lz-hw<e[5]&&lz+hw>e[2])return true;
  }
  for(const p of WF_LEG_POS){
    const sx=p[0],sz=p[1];
    if(lx-hw<sx+3.5&&lx+hw>sx-3.5&&ly<13&&ly+hh>0&&lz-hw<sz+8&&lz+hw>sz-8)return true;
  }
  return false;
}
