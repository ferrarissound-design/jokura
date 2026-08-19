// ============================================================================
// jokura / tools/test-region-edit.cjs — 範囲編集ツール(region_editor.js)の回帰テスト
//
// クリエイティブの範囲編集は REGION_EDIT_BATCH ごとに requestAnimationFrame へ
// 処理を分割する。以前は「バッチを中断する前に走査カーソルを進めていなかった」
// ため、再開時にバッチ境界のセルをもう一度 write してしまい、undo 履歴に
// 『編集後の状態』がもう1件積まれて、そのブロックだけ Undo で元に戻らなかった。
//
// ここでは実際の region_editor.js を軽量スタブ上で動かし、
//   1) 全セルがちょうど1回だけ編集される（undo履歴＝セル数、進捗＝セル数）
//   2) fill / delete どちらも Undo で元の地形・worldEdits へ完全に戻る
// を検証する。WebGL も three.js 実体も要らない。
// ============================================================================
const fs = require('fs');
const vm = require('vm');

const source =
  fs.readFileSync('scripts/game/structures_common.js', 'utf8') +
  fs.readFileSync('scripts/game/region_editor.js', 'utf8');

// ─── 最小限のワールド実装（world.js の addBlock/removeBlock と同じ意味論だけ） ───
const voxels = {};
const worldEdits = { placed: {}, removed: {} };
const vKey = (x, y, z) => x + '|' + y + '|' + z;
const frames = [];

const fakeGeometry = function () {
  this.dispose = () => {};
  this.setAttribute = () => {};
};
const fakeMesh = function (geometry) {
  this.geometry = geometry;
  this.visible = true;
  this.renderOrder = 0;
  this.position = { set() {} };
};

const context = {
  Math,
  console,
  voxels,
  worldEdits,
  vKey,
  cKey: (cx, cz) => cx + ',' + cz,
  ucKey: (cx, cy, cz) => cx + ',' + cy + ',' + cz,
  CHUNK: 16,
  CHUNK_Y: 8,
  chunks: {},
  underChunks: {},
  generateChunk() {},
  generateUnderChunk() {},
  WATER_BLOCK: 7,
  OBSIDIAN_BLOCK: 20,
  SLOT_TI: [0, 1, 2, 3, 4],
  curType: 1, // 🪨 STONE
  gs: { running: true },
  isCreative: () => true,
  P: { x: 1000, y: 1000, z: 1000, velY: 0, onGround: true }, // 編集範囲から十分離す
  scene: { add() {}, remove() {} },
  showBonus() {},
  playTone() {},
  flushDirtyChunks() {},
  _deferDirty: false,
  requestAnimationFrame: (fn) => { frames.push(fn); },
  THREE: {
    LineBasicMaterial: function () {},
    MeshBasicMaterial: function () {},
    BoxGeometry: fakeGeometry,
    BufferGeometry: fakeGeometry,
    Float32BufferAttribute: function () {},
    LineSegments: fakeMesh,
    Mesh: fakeMesh,
  },
  addBlock(x, y, z, ti, addToScene, playerPlaced, meta) {
    const k = vKey(x, y, z);
    if (voxels[k]) return;
    voxels[k] = { ti, meta: meta | 0, active: !!addToScene, playerPlaced: !!playerPlaced };
    return k;
  },
  removeBlock(x, y, z) { delete voxels[vKey(x, y, z)]; },
};
vm.createContext(context);

vm.runInContext(source + `
const REGION={min:0,max:9}; // 10×10×10 = 1000 セル → REGION_EDIT_BATCH(450) を跨ぐ
const REGION_CELLS=1000;
function __resetWorld(){
  for(const k in voxels)delete voxels[k];
  for(const k in worldEdits.placed)delete worldEdits.placed[k];
  for(const k in worldEdits.removed)delete worldEdits.removed[k];
  // 範囲全体をワールド生成由来(playerPlaced=false)の草ブロックで埋める
  for(let x=REGION.min;x<=REGION.max;x++)for(let y=REGION.min;y<=REGION.max;y++)for(let z=REGION.min;z<=REGION.max;z++)
    voxels[vKey(x,y,z)]={ti:0,meta:0,active:true,playerPlaced:false};
}
function __drain(){
  let guard=0;
  while(__frames.length){
    if(++guard>10000)throw new Error('requestAnimationFrame loop did not terminate');
    __frames.shift()();
  }
}
function __select(){
  regionEditor.open();
  regionEditor.pick({x:REGION.min,y:REGION.min,z:REGION.min});
  regionEditor.pick({x:REGION.max,y:REGION.max,z:REGION.max});
}
function __run(kind){
  __select();
  regionEditor.run(kind);
  __drain();
}
function __snapshotWorld(){
  const out={};
  for(const k in voxels)out[k]=voxels[k].ti+':'+(voxels[k].playerPlaced?1:0);
  return out;
}
function __check(kind){
  __resetWorld();
  const before=__snapshotWorld();
  const beforePlaced=Object.keys(worldEdits.placed).length,beforeRemoved=Object.keys(worldEdits.removed).length;
  __run(kind);
  const st=regionEditor.state;
  const res={
    kind,
    doneAfterRun:st.done,
    totalAfterRun:st.total,
    undoEntries:st.undoStack.length===1?st.undoStack[0].length:-1,
    // fill なら全セルが石(1)・delete なら全セルが消えているはず
    editedOk:true,
  };
  for(let x=REGION.min;x<=REGION.max&&res.editedOk;x++)for(let y=REGION.min;y<=REGION.max&&res.editedOk;y++)for(let z=REGION.min;z<=REGION.max&&res.editedOk;z++){
    const v=voxels[vKey(x,y,z)];
    if(kind==='delete')res.editedOk=!v;
    else res.editedOk=!!v&&v.ti===1&&v.playerPlaced===true;
  }
  regionEditor.undo();
  __drain();
  res.doneAfterUndo=st.done;
  const after=__snapshotWorld();
  const beforeKeys=Object.keys(before),afterKeys=Object.keys(after);
  res.restored=beforeKeys.length===afterKeys.length&&beforeKeys.every(k=>before[k]===after[k]);
  res.placedRestored=Object.keys(worldEdits.placed).length===beforePlaced;
  res.removedRestored=Object.keys(worldEdits.removed).length===beforeRemoved;
  res.cells=REGION_CELLS;
  return res;
}
regionEditor=makeRegionEditor();
__results=[__check('fill'),__check('delete')];
`, Object.assign(context, { __frames: frames, __results: null }));

const failures = context.__results.filter((r) =>
  r.doneAfterRun !== r.cells ||
  r.totalAfterRun !== r.cells ||
  r.undoEntries !== r.cells ||
  r.doneAfterUndo !== r.cells ||
  !r.editedOk || !r.restored || !r.placedRestored || !r.removedRestored
);
if (failures.length) {
  console.error(JSON.stringify(context.__results, null, 2));
  process.exit(1);
}
console.log('OK: region edit fill/delete touch each of 1000 cells exactly once and undo restores the world');
