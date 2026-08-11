// ============================================================================
// jokura / structures_common.js
// 特殊構造物 生成共通ヘルパー（put/clr/_frontAnchor/_ensureChunksAround/_footprintYBase）
// world.js から分割されたファイルの一部。全スクリプトは index.html の PARTS の
// 順序で <script> として読み込まれ、同一のグローバルスコープを共有する。
// このファイルは world.js（地形・チャンク・ブロック定義）より後、
// structures_registry.js（生成関数を登録テーブルで参照）より前に読み込まれる。
// ============================================================================

// ═══ 特殊構造物 生成共通ヘルパー（put/clr/anchor/chunk-ensure/ybase）═══
// 賢者の樹庭・プレアデス監視塔など、クリエイティブのワンクリック特殊生成が共通で使う
// 部品。put/clr は状態を持たないので、どのジェネレータからも安全に呼べる。

// put: ワールド生成ブロックの上書きは removed と placed の両方を記録する。
// applyWorldEdits は removed→placed の順で再生し、placed は既存 voxel を
// スキップするため、removed が無いと再訪時に元の地形が勝ってしまう。
// meta も doPlace(input.js)/applyWorldEdits(save.js) と同じ ti|(meta<<5) で
// パックする（旧実装は meta を捨てておりトーチ以外は無害だったが、階段の
// 向きは meta 依存なのでここを直さないとセーブ&ロードで向きが復元されない）。
function put(x,y,z,ti,meta){
  meta=meta|0;
  const k=vKey(x,y,z),v=voxels[k];
  if(v){
    if(v.ti===ti&&(v.meta|0)===meta)return;
    if(v.playerPlaced)delete worldEdits.placed[k];else worldEdits.removed[k]=true;
    removeBlock(x,y,z);
  }
  addBlock(x,y,z,ti,true,true,meta);
  worldEdits.placed[k]=ti|(meta<<5);
}
// clr: ドロップなしの破壊（breakBlock と同じ worldEdits イディオム）
function clr(x,y,z){
  const k=vKey(x,y,z),v=voxels[k];
  if(!v)return;
  if(v.playerPlaced)delete worldEdits.placed[k];else worldEdits.removed[k]=true;
  removeBlock(x,y,z);
}
// プレイヤーのカメラ水平前方 dist ブロック先を中心アンカーにする
function _frontAnchor(dist){
  camera.getWorldDirection(_rd);
  let fx=_rd.x,fz=_rd.z,fl=Math.hypot(fx,fz);
  if(fl<0.1){fx=-Math.sin(yaw);fz=-Math.cos(yaw);fl=Math.hypot(fx,fz)||1;}
  fx/=fl;fz/=fl;
  const cx0=Math.floor(P.x+fx*dist),cz0=Math.floor(P.z+fz*dist);
  return{fx,fz,cx0,cz0,aim:Math.atan2(fz,fx)};
}
// フットプリント半径 R が重なりうる全チャンクを事前生成する。未生成チャンク
// への addBlock は不可視の孤児 voxel になるため（applyWorldEdits と同じ理由）。
// 🌀 終端界にいる間は通常世界の generateChunk() ではなく generateEndZoneChunk()
// を使う（特殊生成メニューは終端界でもそのまま使えるが、通常世界の地形が
// 終端界のチャンクへ混ざらないようにする）。
function _ensureChunksAround(cx0,cz0,R,pad){
  pad=pad==null?2:pad;
  const gen=(currentDimension==='endZone'&&typeof generateEndZoneChunk==='function')?generateEndZoneChunk:generateChunk;
  for(let cx=Math.floor((cx0-R-pad)/CHUNK);cx<=Math.floor((cx0+R+pad)/CHUNK);cx++)
    for(let cz=Math.floor((cz0-R-pad)/CHUNK);cz<=Math.floor((cz0+R+pad)/CHUNK);cz++)
      gen(cx,cz);
}
// 周辺地表の中央値と中心直下の高さの高い方（丘に半分埋まった土台を避ける）
function _footprintYBase(cx0,cz0,R,step){
  step=step||5;
  const hs=[];
  for(let dx=-R;dx<=R;dx+=step)for(let dz=-R;dz<=R;dz+=step){
    if(dx*dx+dz*dz>R*R)continue;
    hs.push(surfaceHeightAt(cx0+dx,cz0+dz));
  }
  hs.sort((a,b)=>a-b);
  return Math.max(hs[Math.floor(hs.length/2)],surfaceHeightAt(cx0,cz0));
}
