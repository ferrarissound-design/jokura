// ============================================================================
// jokura / end_zone.js
// scripts/main.js を機能別に分割したファイルの一部。dimensions.js（ディメンション
// 管理の枠組み）より後、end_zone_structures.js（島の上の建造物）より前に読み込む。
// world.js の CHUNK/addBlock/recAt/showChunk/hideChunk/buildChunkMesh/
// _disposeChunkRec/makeChunkRec などの「マージ済みチャンクメッシュ」基盤をそのまま
// 再利用し、通常世界とは別の地形生成アルゴリズム(generateEndZoneChunk)だけを
// 差し替える。通常世界の generateChunk() には一切手を入れない。
//
// 🌀 THE END ZONE ― 破壊実験ディメンション。
// クリエイティブ専用。ボタン一発で入退場でき、素材や事前条件は不要。
// 虚空に大小の浮遊島が点在し、島には低確率で破壊対象の建造物が自動生成される。
// 新規ブロックIDは追加せず、既存ブロック(黒っぽい深成岩/石/黒曜石/水晶/神晶)を
// 組み合わせるだけで「通常世界と一目で違う」配色にする。
// ============================================================================

// ═══ シード・ノイズ(終端界専用。通常世界の noise/noiseB/noiseV/WORLD_SEED には触れない) ═══
let ezSeed=0;
let ezNoise=null,ezNoiseB=null,ezNoiseV=null;
function ezInitNoise(seed){ezSeed=seed;ezNoise=makeNoise(seed);ezNoiseB=makeNoise(seed+13337);ezNoiseV=makeNoise(seed+24242);}
// ワールドシードから決定的な初回終端界シードを導出する（同じシードなら常に同じ終端界）
function _deriveEndZoneSeed(baseSeed){
  let h=(baseSeed^0x454e44)>>>0;
  h=Math.imul(h^(h>>>16),2246822507)>>>0;h=Math.imul(h^(h>>>13),3266489909)>>>0;h^=h>>>16;
  return (h>>>0)%999999;
}
function ezRand(x,z,salt){return rand2(x,z,((salt^ezSeed)>>>0)||1);}

// ═══ 定数 ═══
const EZ_ISLAND_GRID=44;      // 島の配置グリッド(世界単位)。島と島の間に十分な虚空ができる間隔
const EZ_ISLAND_EXIST_P=0.45; // グリッド1マスに島がある確率
const EZ_ISLAND_Y_MIN=64,EZ_ISLAND_Y_MAX=132; // 島の高度帯(上面)
const EZ_CENTRAL_R=20;        // 開始地点の中央島の半径
const EZ_CENTRAL_TOP_Y=96;    // 中央島の上面の高さ
const EZ_VOID_Y=6;            // これを下回ったら奈落判定→開始地点へ復帰
const EZ_SPAWN={x:.5,y:EZ_CENTRAL_TOP_Y+2,z:.5};
let ezFirstEntryShown=false;

function ezVoidRespawn(){
  P.x=EZ_SPAWN.x;P.y=EZ_SPAWN.y;P.z=EZ_SPAWN.z;P.velY=0;P.onGround=false;
  if(typeof showBonus==='function')showBonus('🌀 奈落へ落下… 開始地点へ帰還');
}

// ─── 島の記述子 ───
// {wx,wz,rx,rz,topY,gx,gz,structType,central?}
function _ezBoxOverlapsChunk(isl,ox,oz){
  return isl.wx+isl.rx>=ox-2&&isl.wx-isl.rx<=ox+CHUNK+2&&isl.wz+isl.rz>=oz-2&&isl.wz-isl.rz<=oz+CHUNK+2;
}
function _ezIslandAt(gx,gz){
  if(gx===0&&gz===0)return null; // 中央島は専用ロジックで別途生成する
  if(ezRand(gx,gz,7001)>=EZ_ISLAND_EXIST_P)return null;
  const jx=10+Math.floor(ezRand(gx,gz,7002)*(EZ_ISLAND_GRID-20));
  const jz=10+Math.floor(ezRand(gx,gz,7003)*(EZ_ISLAND_GRID-20));
  const wx=gx*EZ_ISLAND_GRID+jx,wz=gz*EZ_ISLAND_GRID+jz;
  if(Math.hypot(wx,wz)<EZ_CENTRAL_R+26)return null; // 中央島の周囲は空けておく
  const rx=5+Math.floor(ezRand(gx,gz,7004)*13),rz=5+Math.floor(ezRand(gx,gz,7005)*13);
  const topY=EZ_ISLAND_Y_MIN+Math.floor(ezRand(gx,gz,7006)*(EZ_ISLAND_Y_MAX-EZ_ISLAND_Y_MIN));
  const sr=ezRand(gx,gz,7008);
  let structType=null;
  if(Math.min(rx,rz)>=8){ // 小さすぎる島には建造物を置かない
    if(sr<0.09)structType='temple';
    else if(sr<0.16)structType='spire';
    else if(sr<0.21)structType='gate';
  }
  return{wx,wz,rx,rz,topY,gx,gz,structType};
}
function _ezCentralIsland(){
  return{wx:0,wz:0,rx:EZ_CENTRAL_R,rz:EZ_CENTRAL_R,topY:EZ_CENTRAL_TOP_Y,gx:0,gz:0,structType:'gate',central:true};
}

// ─── 島の1カラム分の実体化(上面+下面の侵食した岩肌。下からも見える立体的な島) ───
function _ezIslandColumn(isl,wx,wz,put1){
  const dx=wx-isl.wx,dz=wz-isl.wz;
  const q=(dx*dx)/(isl.rx*isl.rx)+(dz*dz)/(isl.rz*isl.rz);
  const edge=ezRand(wx,wz,9100+((isl.gx*131+isl.gz*977)|0));
  if(q>1+(edge-.5)*.22)return null;
  const dome=Math.floor((ezNoiseV(wx*.045,wz*.045)+1)*1.6);
  const surfaceY=isl.topY-Math.floor(Math.max(0,q-.55)*7)+dome;
  const glow=ezRand(wx,wz,9200);
  const topTi=glow<0.028?DIVINE_GLASS:(glow<0.05?CRYSTAL_BLOCK:(ezRand(wx,wz,9300)<0.5?DEEP_STONE:6));
  put1(wx,surfaceY,wz,topTi);
  const thick=3+Math.floor((1-Math.min(1,q))*(isl.central?16:10))+(edge<.1?4:0);
  for(let d=1;d<=thick;d++){
    const tailTi=(d===thick&&edge<.16)?CRYSTAL_BLOCK:(ezRand(wx,wz-d*3,9400)<.4?DEEP_STONE:1);
    put1(wx,surfaceY-d,wz,tailTi);
  }
  return surfaceY;
}

// ─── 終端界専用チャンク生成 ───
// 通常世界の generateChunk() は一切呼ばない。同じ voxels/chunks の仕組み
// (makeChunkRec/buildChunkMesh/showChunk/hideChunk/_disposeChunkRec)を再利用し、
// 中身の生成アルゴリズムだけを差し替える。
function generateEndZoneChunk(cx,cz){
  const key=cKey(cx,cz);if(chunks[key])return;
  weMarkChunkGenerated(cx,cz);
  const meshes=new Set(),ox=cx*CHUNK,oz=cz*CHUNK;
  const _tzZones=(typeof tsarMatchedZonesForChunk==='function')?tsarMatchedZonesForChunk(cx,cz):null;
  const zoneAny=_tzZones?(x,y,z)=>_tsarZonesRemoveAny(x,y,z,_tzZones):null;
  const put1=(wx,wy,wz,ti)=>{
    if(zoneAny&&zoneAny(wx,wy,wz))return;
    const m=addBlock(wx,wy,wz,ti,false);if(m)meshes.add(m);
  };
  const islandsHere=[];
  const central=_ezCentralIsland();
  if(_ezBoxOverlapsChunk(central,ox,oz))islandsHere.push(central);
  const pad=EZ_ISLAND_GRID/2+20;
  const g0x=Math.floor((ox-pad)/EZ_ISLAND_GRID),g1x=Math.floor((ox+CHUNK+pad)/EZ_ISLAND_GRID);
  const g0z=Math.floor((oz-pad)/EZ_ISLAND_GRID),g1z=Math.floor((oz+CHUNK+pad)/EZ_ISLAND_GRID);
  for(let gx=g0x;gx<=g1x;gx++)for(let gz=g0z;gz<=g1z;gz++){
    const isl=_ezIslandAt(gx,gz);
    if(isl&&_ezBoxOverlapsChunk(isl,ox,oz))islandsHere.push(isl);
  }
  for(const isl of islandsHere){
    const x0=Math.max(ox,Math.floor(isl.wx-isl.rx)),x1=Math.min(ox+CHUNK-1,Math.ceil(isl.wx+isl.rx));
    const z0=Math.max(oz,Math.floor(isl.wz-isl.rz)),z1=Math.min(oz+CHUNK-1,Math.ceil(isl.wz+isl.rz));
    for(let wx=x0;wx<=x1;wx++)for(let wz=z0;wz<=z1;wz++)_ezIslandColumn(isl,wx,wz,put1);
  }
  if(typeof ezSpawnStructures==='function')ezSpawnStructures(cx,cz,put1,islandsHere);
  if(typeof ezSpawnBridges==='function')ezSpawnBridges(cx,cz,put1,g0x,g1x,g0z,g1z);
  const rec=makeChunkRec(false);
  for(const k2 of meshes){const v=voxels[k2];if(!v)continue;v.rec=rec;rec.keys.add(k2);if(v.mesh)rec.specials.add(v.mesh);}
  chunks[key]=rec;
  const nb=[chunks[cKey(cx-1,cz)],chunks[cKey(cx+1,cz)],chunks[cKey(cx,cz-1)],chunks[cKey(cx,cz+1)]];
  for(const r of nb)if(r&&r.built)buildChunkMesh(r);
}

// ─── ロード/アンロード(プレイヤー周辺だけ生成、遠方は破棄) ───
// 通常世界の updateChunks()/unloadFarChunks() は呼ばない。専用のトラッキング変数
// を使い、showChunk/hideChunk/_disposeChunkRec という同じ土台関数だけ共有する。
let _ezLastPCX=null,_ezLastPCZ=null;
function updateEndZoneChunks(force){
  const pcx=Math.floor(P.x/CHUNK),pcz=Math.floor(P.z/CHUNK);
  if(!force&&pcx===_ezLastPCX&&pcz===_ezLastPCZ)return false;
  _ezLastPCX=pcx;_ezLastPCZ=pcz;
  const R=DRAW_R,needed={},list=[];
  for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++)list.push([pcx+dx,pcz+dz]);
  let grew=false;
  for(const[cx,cz]of list){if(!chunks[cKey(cx,cz)]){generateEndZoneChunk(cx,cz);grew=true;}}
  for(const[cx,cz]of list){needed[cKey(cx,cz)]=true;showChunk(cx,cz);}
  for(const key in activeChunks)if(!needed[key]){const p=key.split(',');hideChunk(+p[0],+p[1]);}
  const UR=R+4;
  for(const key in chunks){
    if(activeChunks[key])continue;
    const p=key.split(','),cx=+p[0],cz=+p[1];
    if(Math.max(Math.abs(cx-pcx),Math.abs(cz-pcz))>UR){_disposeChunkRec(chunks[key]);delete chunks[key];}
  }
  return grew;
}

// ═══ 見た目(黒→紫の異世界の空、紫の霧、発光粒子、遠景の崩壊リング) ═══
let _ezMounted=false,_ezRing=null,_ezParticles=null;
let _ezPrevFogColor=null,_ezPrevHemColor=null,_ezPrevHemI=null,_ezPrevSunI=null,_ezPrevClear=null;
function _ezBuildRing(){
  const g=new THREE.RingGeometry(50,60,40,1);
  const m=new THREE.MeshBasicMaterial({color:0x9a5cff,transparent:true,opacity:.32,side:THREE.DoubleSide,depthWrite:false,fog:false});
  const mesh=new THREE.Mesh(g,m);
  mesh.rotation.x=Math.PI/2.25;mesh.position.set(30,150,-60);mesh.renderOrder=-9;mesh.frustumCulled=false;
  return mesh;
}
function _ezBuildParticles(){
  const n=isTouch?70:220;
  const pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){pos[i*3]=(Math.random()*2-1)*36;pos[i*3+1]=Math.random()*70;pos[i*3+2]=(Math.random()*2-1)*36;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const m=new THREE.PointsMaterial({color:0xcfa0ff,size:.4,transparent:true,opacity:.7,depthWrite:false,fog:false});
  const pts=new THREE.Points(g,m);pts.frustumCulled=false;
  return pts;
}
function ezMount(){
  if(_ezMounted)return;
  _ezMounted=true;
  if(!_ezRing)_ezRing=_ezBuildRing();
  if(!_ezParticles)_ezParticles=_ezBuildParticles();
  scene.add(_ezRing);scene.add(_ezParticles);
  document.body.classList.add('endZone');
  _ezPrevFogColor=scene.fog.color.clone();_ezPrevHemColor=hemLight.color.clone();
  _ezPrevHemI=hemLight.intensity;_ezPrevSunI=sun.intensity;_ezPrevClear=renderer.getClearColor(new THREE.Color());
  skyMesh.visible=false;rainGroup.visible=false;snowGroup.visible=false;
}
function ezUnmount(){
  if(!_ezMounted)return;
  _ezMounted=false;
  if(_ezRing)scene.remove(_ezRing);
  if(_ezParticles)scene.remove(_ezParticles);
  document.body.classList.remove('endZone');
  // 初回バナーがフェード中に離脱した場合、ezTick()が止まってタイマーが進まなくなり
  // バナーが表示されっぱなしになるのを防ぐ
  _ezBannerT=0;if($ezBanner)$ezBanner.classList.remove('show');
  if(_ezPrevFogColor)scene.fog.color.copy(_ezPrevFogColor);
  if(_ezPrevHemColor)hemLight.color.copy(_ezPrevHemColor);
  if(_ezPrevHemI!=null)hemLight.intensity=_ezPrevHemI;
  if(_ezPrevSunI!=null)sun.intensity=_ezPrevSunI;
  if(_ezPrevClear)renderer.setClearColor(_ezPrevClear);
}
function ezApplyAtmosphere(){
  scene.fog.color.setRGB(.055,.02,.09);
  scene.fog.near=DRAW_R*CHUNK*0.32;
  scene.fog.far=DRAW_R*CHUNK*1.05;
  renderer.setClearColor(scene.fog.color);
  hemLight.color.setRGB(.36,.18,.5);hemLight.intensity=.5;
  sun.intensity=.04;
}
let _ezBannerT=0;
const $ezBanner=document.getElementById('ezBanner');
function ezShowFirstEntryBanner(){
  if(!$ezBanner)return;
  $ezBanner.classList.add('show');_ezBannerT=4.2;
}
// main.js の tick() から、終端界にいる間だけ呼ばれる。滞在していない間は
// 一切の更新処理・専用オブジェクトの更新を止める（要件どおり）。
function ezTick(dt){
  ezApplyAtmosphere();
  if(_ezRing)_ezRing.rotation.z+=dt*0.012;
  if(_ezParticles){
    _ezParticles.position.set(P.x,0,P.z);
    const attr=_ezParticles.geometry.attributes.position;
    for(let i=0;i<attr.count;i++){
      let y=attr.getY(i)-dt*0.55;
      if(y<0)y=70;
      attr.setY(i,y);
    }
    attr.needsUpdate=true;
  }
  // updateTorchLights()/updateBlockCursor() は main.js の tick() が終端界かどうかに
  // 関わらず毎フレーム呼ぶので、ここでは呼ばない(二重更新を避ける)。
  if(_ezBannerT>0){_ezBannerT-=dt;if(_ezBannerT<=0&&$ezBanner)$ezBanner.classList.remove('show');}
}

// ═══ 終端界だけを再生成(BUILDメニューの「♻ 終端界を再生成」) ═══
function regenerateEndZone(){
  if(!gs.running||!isCreative()||currentDimension!=='endZone')return;
  if(!confirm('終端界を新しいシードで再生成しますか？\n今の終端界の建造物・破壊跡はすべて失われます。\n（通常世界には影響しません）'))return;
  if(typeof resetTNTSystem==='function')resetTNTSystem();
  if(typeof resetCrustBomb==='function')resetCrustBomb();
  if(typeof resetTsarBomba==='function')resetTsarBomba();
  if(typeof resetLonginus==='function')resetLonginus();
  if(typeof resetRailgun==='function')resetRailgun();
  if(typeof regionEditor!=='undefined'&&regionEditor){regionEditor.close();regionEditor.resetUndo();regionEditor.resetSelection();}
  _disposeAllChunks();
  ezSeed=_deriveEndZoneSeed((WORLD_SEED^Date.now())>>>0);
  ezInitNoise(ezSeed);
  resetWorldEdits();
  _ezLastPCX=null;_ezLastPCZ=null;
  P.x=EZ_SPAWN.x;P.y=EZ_SPAWN.y;P.z=EZ_SPAWN.z;P.velY=0;P.onGround=false;
  updateEndZoneChunks(true);
  applyWorldEdits();
  if(typeof showBonus==='function')showBonus('♻ 終端界を再生成しました');
  if(typeof playTone==='function')playTone(90,.3,.25,'sawtooth');
  if(typeof saveGame==='function')saveGame();
}

// ═══ 簡易ミニマップ(終端界用。通常世界のバイオーム地図は誤表示しない) ═══
function drawEndZoneMinimap(){
  const S=90;miniCtx.fillStyle='rgba(8,2,16,.85)';miniCtx.fillRect(0,0,S,S);
  const sc=.9,cx=S/2,cy=S/2;
  for(let dx=-40;dx<=40;dx+=2)for(let dz=-40;dz<=40;dz+=2){
    const wx=Math.floor(P.x)+dx,wz=Math.floor(P.z)+dz;
    const gx=Math.floor(wx/EZ_ISLAND_GRID),gz=Math.floor(wz/EZ_ISLAND_GRID);
    const isl=(gx===0&&gz===0)?_ezCentralIsland():_ezIslandAt(gx,gz);
    if(!isl)continue;
    const ddx=wx-isl.wx,ddz=wz-isl.wz;
    if((ddx*ddx)/(isl.rx*isl.rx)+(ddz*ddz)/(isl.rz*isl.rz)>1)continue;
    miniCtx.fillStyle=isl.central?'#c9a0ff':'#6a4fa0';
    miniCtx.fillRect(cx+dx*sc-1,cy+dz*sc-1,3,3);
  }
  if(typeof TsarBlastZones!=='undefined'&&TsarBlastZones.length){
    for(const zone of TsarBlastZones){
      if(Math.hypot(zone.x-P.x,zone.z-P.z)>zone.destroyR+40)continue;
      const zx=cx+(zone.x-P.x)*sc,zy=cy+(zone.z-P.z)*sc,zr=zone.destroyR*sc;
      miniCtx.beginPath();miniCtx.arc(zx,zy,zr,0,Math.PI*2);
      miniCtx.fillStyle='rgba(40,0,0,.35)';miniCtx.fill();
      miniCtx.lineWidth=2;miniCtx.strokeStyle='rgba(255,40,20,.85)';miniCtx.stroke();
    }
  }
  miniCtx.fillStyle='#e0c8ff';miniCtx.beginPath();miniCtx.arc(cx,cy,2.5,0,Math.PI*2);miniCtx.fill();
  const ddx=Math.sin(yaw)*7,ddy=-Math.cos(yaw)*7;
  miniCtx.strokeStyle='#e0c8ff';miniCtx.lineWidth=1.5;miniCtx.beginPath();miniCtx.moveTo(cx,cy);miniCtx.lineTo(cx+ddx,cy+ddy);miniCtx.stroke();
}

// ═══ BUILDメニュー: 🌀 終端界へ / 🌍 通常世界へ戻る + ♻ 終端界を再生成 ═══
// PC/スマホ/タブレット共通: #buildMenuPopover の中に静的に置いたボタンを
// bindTapSafe で結線するだけ(mobileui.jsの再配置は不要、既にポップオーバー内)。
const $dimTeleportBtn=document.getElementById('dimTeleportBtn');
const $ezRegenBtn=document.getElementById('ezRegenBtn');
if($dimTeleportBtn)bindTapSafe($dimTeleportBtn,()=>{enterDimension(currentDimension==='endZone'?'overworld':'endZone');});
if($ezRegenBtn)bindTapSafe($ezRegenBtn,()=>{regenerateEndZone();if(typeof closeHudPopovers==='function')closeHudPopovers();});
function ezUpdateMenuButtons(){
  const cr=isCreative()&&gs.running;
  if($dimTeleportBtn){
    $dimTeleportBtn.style.display=cr?'':'none';
    const icon=$dimTeleportBtn.querySelector('.aIcon'),label=$dimTeleportBtn.querySelector('.aLabel');
    if(currentDimension==='endZone'){if(icon)icon.textContent='🌍';if(label)label.textContent='通常世界へ戻る';}
    else{if(icon)icon.textContent='🌀';if(label)label.textContent='終端界へ';}
  }
  if($ezRegenBtn)$ezRegenBtn.style.display=(cr&&currentDimension==='endZone')?'':'none';
}
