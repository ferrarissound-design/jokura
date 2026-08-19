// ============================================================================
// jokura / region_editor.js
// クリエイティブ専用の範囲編集ツール。通常の1ブロック設置/破壊とは分離し、
// 選択・バッチ編集・Undo・表示だけをここで管理する。
// ============================================================================
const REGION_EDIT_MAX_BLOCKS=10000;
const REGION_EDIT_BATCH=450;
const REGION_BOX_THICKNESS=1;
const REGION_EDIT_UNDO_MAX=10;

function makeRegionEditor(){
  const state={
    active:false,picking:'A',a:null,b:null,busy:false,done:0,total:0,
    undoStack:[],msg:'範囲編集：点Aを選択',box:null,ma:null,mb:null
  };
  const matLine=new THREE.LineBasicMaterial({color:0x66e0ff,transparent:true,opacity:.9,depthTest:false});
  const matA=new THREE.MeshBasicMaterial({color:0x44ff77,transparent:true,opacity:.55,depthTest:false});
  const matB=new THREE.MeshBasicMaterial({color:0xffcc33,transparent:true,opacity:.55,depthTest:false});
  const markerGeo=new THREE.BoxGeometry(1.08,1.08,1.08);

  function notifyUI(){if(typeof updateRegionEditUI==='function')updateRegionEditUI();}
  function ensureVisuals(){
    if(state.box)return;
    state.box=new THREE.LineSegments(new THREE.BufferGeometry(),matLine);
    state.box.renderOrder=20;scene.add(state.box);
    state.ma=new THREE.Mesh(markerGeo,matA);state.mb=new THREE.Mesh(markerGeo,matB);
    state.ma.renderOrder=state.mb.renderOrder=21;scene.add(state.ma);scene.add(state.mb);
  }
  function clearVisuals(){
    for(const o of[state.box,state.ma,state.mb])if(o)scene.remove(o);
    if(state.box)state.box.geometry.dispose();
    state.box=state.ma=state.mb=null;
  }
  function bounds(){
    if(!state.a||!state.b)return null;
    return{
      minX:Math.min(state.a.x,state.b.x),maxX:Math.max(state.a.x,state.b.x),
      minY:Math.min(state.a.y,state.b.y),maxY:Math.max(state.a.y,state.b.y),
      minZ:Math.min(state.a.z,state.b.z),maxZ:Math.max(state.a.z,state.b.z)
    };
  }
  function count(b){return (b.maxX-b.minX+1)*(b.maxY-b.minY+1)*(b.maxZ-b.minZ+1);}
  function fmtPoint(p){return p?'('+p.x+', '+p.y+', '+p.z+')':'未選択';}
  function setMsg(){
    const b=bounds();
    if(state.busy){
      state.msg='範囲を編集中 '+Math.floor(state.done/Math.max(1,state.total)*100)+'%\n'+state.done+' / '+state.total+' ブロック';
    }else{
      let m='🟩 点A '+fmtPoint(state.a)+'\n🟨 点B '+fmtPoint(state.b);
      if(b)m+='\n選択範囲：'+(b.maxX-b.minX+1)+' × '+(b.maxY-b.minY+1)+' × '+(b.maxZ-b.minZ+1)+'（'+count(b)+' ブロック）';
      m+='\n👆 ブロックをタップ → 点'+state.picking+'を選択';
      state.msg=m;
    }
    notifyUI();
  }
  function updateVisuals(){
    if(!state.active){clearVisuals();return;}
    ensureVisuals();
    state.ma.visible=!!state.a;state.mb.visible=!!state.b;
    if(state.a)state.ma.position.set(state.a.x+.5,state.a.y+.5,state.a.z+.5);
    if(state.b)state.mb.position.set(state.b.x+.5,state.b.y+.5,state.b.z+.5);
    const b=bounds();state.box.visible=!!b;if(!b)return;
    const x0=b.minX,y0=b.minY,z0=b.minZ,x1=b.maxX+1,y1=b.maxY+1,z1=b.maxZ+1;
    const p=[
      x0,y0,z0,x1,y0,z0, x1,y0,z0,x1,y0,z1, x1,y0,z1,x0,y0,z1, x0,y0,z1,x0,y0,z0,
      x0,y1,z0,x1,y1,z0, x1,y1,z0,x1,y1,z1, x1,y1,z1,x0,y1,z1, x0,y1,z1,x0,y1,z0,
      x0,y1,z0,x0,y0,z0, x1,y1,z0,x1,y0,z0, x1,y1,z1,x1,y0,z1, x0,y1,z1,x0,y0,z1
    ];
    state.box.geometry.dispose();state.box.geometry=new THREE.BufferGeometry();
    state.box.geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  }
  function open(){if(!gs.running||!isCreative())return;state.active=true;state.picking=state.a?'B':'A';setMsg();updateVisuals();}
  function close(){state.active=false;setMsg();updateVisuals();}
  function resetSelection(){if(state.busy)return;state.a=state.b=null;state.picking='A';setMsg();updateVisuals();}
  // 点Aは基準点として固定し、2回目以降のタップは点Bを動かして範囲を微調整
  // できるようにする（点Aをやり直すときは「点A」ボタンで切り替える）。
  function pick(hit){
    if(!state.active||state.busy||!hit)return false;
    const p={x:hit.x,y:hit.y,z:hit.z};
    const picked=state.picking;
    if(picked==='A'){state.a=p;state.picking='B';}else{state.b=p;}
    if(typeof playTone==='function')playTone(picked==='A'?600:760,.05,.07,'square');
    setMsg();updateVisuals();return true;
  }
  function ensureChunks(b){
    for(let cx=Math.floor(b.minX/CHUNK);cx<=Math.floor(b.maxX/CHUNK);cx++)for(let cz=Math.floor(b.minZ/CHUNK);cz<=Math.floor(b.maxZ/CHUNK);cz++){
      if(!chunks[cKey(cx,cz)])generateChunk(cx,cz);
      for(let cy=Math.floor(b.minY/CHUNK_Y);cy<=Math.floor(b.maxY/CHUNK_Y);cy++)if(cy<0&&!underChunks[ucKey(cx,cy,cz)])generateUnderChunk(cx,cy,cz);
    }
  }
  function shouldEdit(kind,x,y,z,b){
    if(kind==='wall')return x===b.minX||x===b.maxX||z===b.minZ||z===b.maxZ;
    if(kind==='floor')return y===b.minY;
    if(kind==='box')return x<b.minX+REGION_BOX_THICKNESS||x>b.maxX-REGION_BOX_THICKNESS||y<b.minY+REGION_BOX_THICKNESS||y>b.maxY-REGION_BOX_THICKNESS||z<b.minZ+REGION_BOX_THICKNESS||z>b.maxZ-REGION_BOX_THICKNESS;
    return true;
  }
  function snapshot(x,y,z){
    const k=vKey(x,y,z),v=voxels[k];
    return{x,y,z,raw:v?(v.ti|((v.meta||0)<<5)):null,playerPlaced:v?!!v.playerPlaced:false,prevPlaced:Object.prototype.hasOwnProperty.call(worldEdits.placed,k)?worldEdits.placed[k]:null,prevRemoved:!!worldEdits.removed[k]};
  }
  function write(x,y,z,ti,undo){
    const k=vKey(x,y,z),v=voxels[k];undo.push(snapshot(x,y,z));
    if(ti==null){if(v&&v.ti!==WATER_BLOCK&&v.ti!==OBSIDIAN_BLOCK)clr(x,y,z);}
    else put(x,y,z,ti,0);
  }
  function restoreHistoryEntry(h){
    const k=vKey(h.x,h.y,h.z),v=voxels[k];
    if(v)removeBlock(h.x,h.y,h.z);
    if(h.raw!=null)addBlock(h.x,h.y,h.z,h.raw&31,true,h.playerPlaced,h.raw>>5);
    if(h.prevPlaced!=null)worldEdits.placed[k]=h.prevPlaced;else delete worldEdits.placed[k];
    if(h.prevRemoved)worldEdits.removed[k]=true;else delete worldEdits.removed[k];
  }
  function safePlayer(){
    const px0=Math.floor(P.x-.35),px1=Math.floor(P.x+.35),py0=Math.floor(P.y),py1=Math.floor(P.y+1.75),pz0=Math.floor(P.z-.35),pz1=Math.floor(P.z+.35);
    for(let y=py0;y<=py1;y++)for(let x=px0;x<=px1;x++)for(let z=pz0;z<=pz1;z++){
      const v=voxels[vKey(x,y,z)];
      if(v&&v.active&&v.ti!==WATER_BLOCK){P.y=py1+2;P.velY=0;P.onGround=false;showBonus('安全な位置へ移動しました');return;}
    }
  }
  function run(kind){
    const b=bounds();
    if(!b||state.busy)return showBonus('点Aと点Bを選択してください');
    const n=count(b);
    if(n>REGION_EDIT_MAX_BLOCKS)return showBonus('選択範囲が大きすぎます。'+REGION_EDIT_MAX_BLOCKS+'ブロック以下にしてください。');
    ensureChunks(b);
    const ti=SLOT_TI[curType],undo=[];let x=b.minX,y=b.minY,z=b.minZ;
    state.busy=true;state.done=0;state.total=n;setMsg();_deferDirty=true;
    // x/y/z はフレームを跨いで持ち越す走査カーソル。1バッチ分書き込んだら
    // requestAnimationFrame で続きを処理する。中断する前に必ずカーソルを次のセルへ
    // 進めること（進めずに return すると再開時に同じセルをもう一度 write してしまい、
    // undo 履歴に「編集後の状態」がもう1件積まれて、そのブロックだけ Undo で
    // 元に戻らなくなる）。
    function step(){
      let c=0;
      while(y<=b.maxY){
        if(kind==='box'&&!shouldEdit(kind,x,y,z,b))write(x,y,z,null,undo);
        else if(shouldEdit(kind,x,y,z,b))write(x,y,z,kind==='delete'?null:ti,undo);
        state.done++;
        if(++x>b.maxX){x=b.minX;if(++z>b.maxZ){z=b.minZ;y++;}}
        if(++c>=REGION_EDIT_BATCH&&y<=b.maxY){setMsg();requestAnimationFrame(step);return;}
      }
      _deferDirty=false;flushDirtyChunks();state.busy=false;
      state.undoStack.push(undo);
      if(state.undoStack.length>REGION_EDIT_UNDO_MAX)state.undoStack.shift();
      safePlayer();setMsg();showBonus('範囲編集 完了（↩ Undoで戻せます）');
    }
    requestAnimationFrame(step);
  }
  function undo(){
    if(state.busy||!state.undoStack.length)return showBonus('Undo履歴がありません');
    const hist=state.undoStack.pop();let i=0;
    state.busy=true;state.total=hist.length;state.done=0;setMsg();_deferDirty=true;
    // run() と同じ理由でカーソル i を進めてから中断する（進めないと再開時に
    // 同じ履歴をもう一度適用し、進捗が total を超えてしまう）。
    function step(){
      let c=0;
      while(i<hist.length){
        restoreHistoryEntry(hist[i++]);state.done++;
        if(++c>=REGION_EDIT_BATCH&&i<hist.length){setMsg();requestAnimationFrame(step);return;}
      }
      _deferDirty=false;flushDirtyChunks();state.busy=false;setMsg();showBonus('Undoしました'+(state.undoStack.length?'（残り'+state.undoStack.length+'回）':''));
    }
    requestAnimationFrame(step);
  }
  return{state,open,close,toggle(){state.active?close():open();},pick,resetSelection,run,undo,setPickMode(m){if(!state.busy){state.picking=m;setMsg();}},resetUndo(){state.undoStack.length=0;},updateVisuals,setMsg};
}
let regionEditor=null;
