// ============================================================================
// jokura / end_zone_structures.js
// scripts/main.js を機能別に分割したファイルの一部。end_zone.js（島の地形生成・
// チャンク管理）より後に読み込むこと。generateEndZoneChunk() から
// ezSpawnStructures()/ezSpawnBridges() として呼ばれる。
//
// 終端界の浮遊島に「最初から壊せるもの」を自動配置する。第一弾なので構造物は
// 少数精鋭(壊れかけの浮遊神殿/細長い終端塔/門・輪/島をつなぐ崩れた橋)に絞り、
// 既存の put1(=addBlockラッパー)とブロックパレット(黒い深成岩/灰色の石/黒曜石/
// 水晶/神晶)だけで構成する。1島につき最大1つ、生成はチャンク境界をまたいでも
// 二重登録にならないよう毎回チャンク範囲でクリップして置く。
// ============================================================================

function _ezIslandSurfaceY(isl,wx,wz){
  const dx=wx-isl.wx,dz=wz-isl.wz;
  const q=(dx*dx)/(isl.rx*isl.rx)+(dz*dz)/(isl.rz*isl.rz);
  if(q>1)return null;
  const dome=Math.floor((ezNoiseV(wx*.045,wz*.045)+1)*1.6);
  return isl.topY-Math.floor(Math.max(0,q-.55)*7)+dome;
}
function _ezInChunk(wx,wz,ox,oz){return wx>=ox&&wx<ox+CHUNK&&wz>=oz&&wz<oz+CHUNK;}

// ─── 壊れかけの浮遊神殿: 4本柱+半壊した床+欠けた屋根+中央の発光クリスタル ───
function _ezPlaceTemple(isl,ox,oz,put1){
  const cxw=isl.wx,czw=isl.wz,baseY=_ezIslandSurfaceY(isl,cxw,czw);if(baseY==null)return;
  const R=4;
  for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
    const wx=cxw+dx,wz=czw+dz;if(!_ezInChunk(wx,wz,ox,oz))continue;
    if(Math.abs(dx)>R||Math.abs(dz)>R)continue;
    if(Math.hypot(dx,dz)>R+.5)continue;
    // 半壊した床(3割ほど欠けている)
    if(ezRand(wx,wz,8801)<0.7)put1(wx,baseY+1,wz,6);
  }
  const pillars=[[-3,-3],[3,-3],[-3,3],[3,3]];
  for(const[dx,dz]of pillars){
    const wx=cxw+dx,wz=czw+dz;if(!_ezInChunk(wx,wz,ox,oz))continue;
    const h=5+Math.floor(ezRand(wx,wz,8802)*3);
    for(let y=1;y<=h;y++)put1(wx,baseY+y,wz,ezRand(wx,wz+y,8803)<.3?20:13);
    if(ezRand(wx,wz,8804)<0.6)put1(wx,baseY+h+1,wz,6); // 崩れて欠けた屋根の一部だけ残す
  }
  const wxc=cxw,wzc=czw;
  if(_ezInChunk(wxc,wzc,ox,oz)){
    put1(wxc,baseY+2,wzc,21);put1(wxc,baseY+3,wzc,30);
  }
}
// ─── 細長い終端塔: 上へ伸びる薄い塔+発光する先端 ───
function _ezPlaceSpire(isl,ox,oz,put1){
  const cxw=isl.wx,czw=isl.wz,baseY=_ezIslandSurfaceY(isl,cxw,czw);if(baseY==null)return;
  const h=16+Math.floor(ezRand(cxw,czw,8811)*16);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
    if(Math.abs(dx)+Math.abs(dz)>1)continue; // 十字断面の細い塔
    const wx=cxw+dx,wz=czw+dz;if(!_ezInChunk(wx,wz,ox,oz))continue;
    for(let y=1;y<=h;y++){
      if(dx!==0||dz!==0){if(ezRand(wx,wz+y,8812)<0.4)continue;} // 側面は隙間だらけの崩れ具合
      put1(wx,baseY+y,wz,y%7===0?20:13);
    }
  }
  if(_ezInChunk(cxw,czw,ox,oz)){
    put1(cxw,baseY+h+1,czw,21);put1(cxw,baseY+h+2,czw,30); // 先端の発光キャップ
    // 途中に崩れた張り出し足場を1段だけ残す
    const midY=baseY+Math.floor(h*.55);
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
      if(Math.hypot(dx,dz)>2.4)continue;
      const wx=cxw+dx,wz=czw+dz;if(!_ezInChunk(wx,wz,ox,oz))continue;
      if(ezRand(wx,wz,8813)<0.55)put1(wx,midY,wz,6);
    }
  }
}
// ─── 巨大な門/モノリス/輪: 2本の柱+まぐさ+中央に浮かぶクリスタルの輪 ───
function _ezPlaceGate(isl,ox,oz,put1){
  const cxw=isl.wx,czw=isl.wz,baseY=_ezIslandSurfaceY(isl,cxw,czw);if(baseY==null)return;
  const h=isl.central?11:8,gap=3;
  for(const side of[-1,1]){
    for(let t=-1;t<=1;t++){
      const wx=cxw+side*gap+t,wz=czw;if(!_ezInChunk(wx,wz,ox,oz))continue;
      for(let y=1;y<=h;y++)put1(wx,baseY+y,wz,t===0?20:13);
    }
  }
  for(let dx=-gap-1;dx<=gap+1;dx++){
    const wx=cxw+dx,wz=czw;if(!_ezInChunk(wx,wz,ox,oz))continue;
    put1(wx,baseY+h+1,wz,20);
  }
  // 門の内側に浮かぶ発光する輪(垂直円、XZ平面上でX方向に薄い)
  const ringY=baseY+Math.floor(h*.6),ringR=gap-.5;
  for(let a=0;a<28;a++){
    const ang=(a/28)*Math.PI*2;
    const wz=Math.round(czw+Math.cos(ang)*ringR),wy=Math.round(ringY+Math.sin(ang)*ringR);
    const wx=cxw;if(!_ezInChunk(wx,wz,ox,oz))continue;
    put1(wx,wy,wz,ezRand(wx,wz+a,8821)<.25?30:21);
  }
}
const _EZ_STRUCT_FN={temple:_ezPlaceTemple,spire:_ezPlaceSpire,gate:_ezPlaceGate};
function ezSpawnStructures(cx,cz,put1,islandsHere){
  const ox=cx*CHUNK,oz=cz*CHUNK;
  for(const isl of islandsHere){
    if(!isl.structType)continue;
    const fn=_EZ_STRUCT_FN[isl.structType];if(!fn)continue;
    fn(isl,ox,oz,put1);
  }
}

// ─── 島と島をつなぐ、途中で崩れた橋 ───
// 隣接するグリッドセル同士(横/縦)を対象に、両方に島がありある程度近ければ低確率で
// 橋を架ける。橋の存在自体は2つの島の座標だけから決まる純関数なので、どちらの
// チャンクから呼ばれても同じ橋が再現される(決定的)。
function _ezBridgeBetween(gA,gB){
  const a=(gA.gx===0&&gA.gz===0)?_ezCentralIsland():_ezIslandAt(gA.gx,gA.gz);
  const b=(gB.gx===0&&gB.gz===0)?_ezCentralIsland():_ezIslandAt(gB.gx,gB.gz);
  if(!a||!b)return null;
  const d=Math.hypot(a.wx-b.wx,a.wz-b.wz);
  if(d<10||d>EZ_ISLAND_GRID*1.9)return null;
  const roll=ezRand(gA.gx+gB.gx,gA.gz+gB.gz,8830);
  if(roll>=0.32)return null;
  return{a,b};
}
function _ezPlaceBridgeSegment(a,b,ox,oz,put1){
  const ay=_ezIslandSurfaceY(a,a.wx,a.wz),by=_ezIslandSurfaceY(b,b.wx,b.wz);
  if(ay==null||by==null)return;
  const steps=Math.ceil(Math.hypot(a.wx-b.wx,a.wz-b.wz));
  for(let i=0;i<=steps;i++){
    const t=i/steps;
    const wx=Math.round(a.wx+(b.wx-a.wx)*t),wz=Math.round(a.wz+(b.wz-a.wz)*t);
    if(!_ezInChunk(wx,wz,ox,oz))continue;
    // 途中で崩れて途切れている(通り抜けられない虚空の隙間がある)
    if(ezRand(wx,wz,8831)<0.22)continue;
    const wy=Math.round(ay+(by-ay)*t);
    put1(wx,wy,wz,ezRand(wx,wz,8832)<.5?13:6);
    if(ezRand(wx,wz,8833)<0.08)put1(wx,wy+1,wz,21);
  }
}
function ezSpawnBridges(cx,cz,put1,g0x,g1x,g0z,g1z){
  const ox=cx*CHUNK,oz=cz*CHUNK;
  for(let gx=g0x;gx<=g1x;gx++)for(let gz=g0z;gz<=g1z;gz++){
    const br1=_ezBridgeBetween({gx,gz},{gx:gx+1,gz});
    if(br1)_ezPlaceBridgeSegment(br1.a,br1.b,ox,oz,put1);
    const br2=_ezBridgeBetween({gx,gz},{gx,gz:gz+1});
    if(br2)_ezPlaceBridgeSegment(br2.a,br2.b,ox,oz,put1);
  }
}
