// ============================================================================
// jokura / structures_inverted_castle.js
// 🏰 逆さ城 ワンクリック生成
// world.js から分割されたファイルの一部。全スクリプトは index.html の PARTS の
// 順序で <script> として読み込まれ、同一のグローバルスコープを共有する。
// このファイルは world.js（地形・チャンク・ブロック定義）より後、
// structures_registry.js（生成関数を登録テーブルで参照）より前に読み込まれる。
// ============================================================================

// ═══ 🏰 逆さ城 ワンクリック生成 ═══
// クリエイティブ専用: プレイヤー前方の空中に、上へ広がる土台と下へ長く垂れる尖塔群の
// 「浮かぶ逆さ城」を生成する。普通の城の上下反転ではなく、上側ほど広い（せり出した
// 土台・屋根・胸壁）／下側は鋭く細る塔が垂れる、遠景で一目で「逆さ」と分かる
// シルエットを最優先にした構成。城本体（内部: 入口ホール・通路・小部屋・魔力コアの
// 間・玉座の間）＋中央の太い主塔（内部は降りられる縦孔ダンジョン）＋左右の小塔＋
// 階段状の浮遊島の登り導線＋崩れた橋・垂れる鎖・一部だけ落ちる滝で装飾する。
// 賢者の樹庭・世界樹・眠れる石神と同じ共有ヘルパー（put/clr/_frontAnchor/
// _ensureChunksAround/_footprintYBase/surfaceHeightAt）を使い、requestAnimationFrame
// でフェーズ分割して処理落ちを避ける。色は黒・濃灰・紫・青系（DEEP_STONE/灰石/
// 黒曜石/水晶/ダイヤ鉱石/ガラス）で不気味かつ神秘的に。既存ブロックのみ使用。
// ── 数値はここへ集約（本体サイズ・塔の本数/深さ・島の数などを後から調整しやすく）──
const INVERTED_CASTLE_CFG={
  anchorDist:38,            // プレイヤー前方の生成距離（プレイヤー/初期地点と重ならない）
  altitude:30,              // 地表(ybase)から城本体の底までの高さ（地上から輪郭が見える）
  bodyHalfE:12,             // 本体の半幅（入口軸方向）→ 奥行き25
  bodyHalfL:9,              // 本体の半幅（左右方向）→ 幅19
  bodyInnerH:6,             // 内部空間の高さ
  crownPad:3,               // 上段（土台/屋根）のせり出し幅 → 逆さシルエットの要
  crownH:3,                 // 上段の壁の高さ
  mainTowerR:5,             // 中央の太い主塔の根元半径（下向き・内部は縦孔）
  mainTowerDepth:26,        // 主塔の深さ（先端ほど鋭く細る）
  sideTowers:[[1,1],[1,-1],[-1,1],[-1,-1]], // 小塔の位置（本体四隅、[e符号,l符号]）
  sideTowerR:2.6,           // 小塔の根元半径
  sideTowerDepth:{min:13,max:19}, // 小塔の深さ（本ごとにランダム）
  spikeDepth:{min:6,max:10},// 辺中央の細い飾りトゲの深さ
  islands:{min:3,max:6},    // 装飾用の小さな浮遊島の数
  pathIslands:7,            // 地上→城の階段状浮遊島の数
  pathStepY:4,              // 登り導線1段の高さ（ジャンプ＋ブロック設置で登れる）
  chains:{min:3,max:5},     // 垂れ下がる鎖の本数
  chainLen:{min:8,max:15},  // 鎖の長さ
  treasureCount:2,enemyCount:4,
};

// 生成進捗オーバーレイ（世界樹のものを流用。ラベルだけ差し替えて使い終わりに戻す）
function _icSetProgress(show,frac){
  const el=document.getElementById('worldTreeProgress');if(!el)return;
  const lbl=document.getElementById('wtpLabel');
  el.style.display=show?'':'none';
  if(show){if(lbl)lbl.textContent='🏰 逆さ城を生成中…';const fill=document.getElementById('wtpFill');if(fill)fill.style.width=Math.round((frac||0)*100)+'%';}
  else if(lbl)lbl.textContent='🌳 世界樹を生成中…';
}
// 城壁ブロック: 濃紺灰(主体)＋灰石＋黒曜石(紫)＋石のまだらで不気味な質感を出す
function _icWallTi(x,y,z){
  const h=_wtHash((x*73856093)^(y*19349663)^(z*83492791));
  if(h<0.52)return DEEP_STONE;
  if(h<0.82)return 6;
  if(h<0.93)return OBSIDIAN_BLOCK;
  return 1;
}
// ローカル座標(e=入口軸, l=左右)→ワールドx/z。入口軸は4方位に丸めてあるため常に整数
function _icW(plan,e,l){return{x:plan.cx0+plan.ex*e+plan.lx*l,z:plan.cz0+plan.ez*e+plan.lz*l};}
function _icPut(plan,e,y,l,ti,meta){const w=_icW(plan,e,l);put(w.x,y,w.z,ti==null?_icWallTi(w.x,y,w.z):ti,meta);}
function _icClr(plan,e,y,l){const w=_icW(plan,e,l);clr(w.x,y,w.z);}

// 逆さ城の「設計図」を決定的に作る（重い put は後段のフェーズで実行）
function _planInvertedCastle(rng,anchor){
  const cfg=INVERTED_CASTLE_CFG;
  const ri=o=>o.min+Math.floor(rng()*(o.max-o.min+1));
  // 入口はプレイヤー側へ向ける（壁を綺麗に保つため4方位へ丸める）
  let ex,ez;
  if(Math.abs(anchor.fx)>=Math.abs(anchor.fz)){ex=anchor.fx>0?-1:1;ez=0;}else{ex=0;ez=anchor.fz>0?-1:1;}
  const ybase=_footprintYBase(anchor.cx0,anchor.cz0,14,5);
  const baseY=ybase+cfg.altitude;
  const plan={
    cfg,cx0:anchor.cx0,cz0:anchor.cz0,ex,ez,lx:-ez,lz:ex,entA:Math.atan2(ez,ex),
    ybase,baseY,
    ceilY:baseY+cfg.bodyInnerH+1,          // 本体天井＝上段のせり出した底板
    hE:cfg.bodyHalfE,hL:cfg.bodyHalfL,
    chestSpots:[],enemySpots:[],rng,
  };
  plan.crownTop=plan.ceilY+cfg.crownH+1;   // 上段の屋根の高さ
  plan.towerDepths=cfg.sideTowers.map(()=>ri(cfg.sideTowerDepth));
  plan.chamberY=baseY-Math.round(cfg.mainTowerDepth*0.6); // 主塔内・縦孔の底の小部屋
  // 装飾用浮遊島: 入口方向のセクターは登り導線用に空けておく
  plan.decoIslands=[];
  const nIsl=ri(cfg.islands);
  for(let i=0;i<nIsl;i++){
    const a=plan.entA+Math.PI*(0.4+1.2*(i+rng()*0.7)/nIsl);
    plan.decoIslands.push({a,dist:20+rng()*8,y:baseY+Math.round(rng()*12-5),r:2.5+rng()*2,bridge:i<2});
  }
  // 鎖: 上段のせり出しの縁（本体壁より外側＝宙に浮く底板の下面）から垂らす
  plan.chainDefs=[];
  const nCh=ri(cfg.chains);
  for(let i=0;i<nCh;i++){
    const side=rng()<0.5?-1:1;
    plan.chainDefs.push(rng()<0.5
      ?{e:side*(plan.hE+cfg.crownPad-1),l:Math.round((rng()*2-1)*plan.hL),len:ri(cfg.chainLen)}
      :{e:Math.round((rng()*2-1)*plan.hE),l:side*(plan.hL+cfg.crownPad-1),len:ri(cfg.chainLen)});
  }
  plan.waterSide=rng()<0.5?-1:1;           // 滝を流す側（左右どちらか）
  plan.waterE=Math.round((rng()*2-1)*5);   // 滝の位置（入口軸方向のオフセット）
  plan.pathTurn=rng()<0.5?-1:1;            // 登り導線が城を旋回する向き
  return plan;
}

// ── 城本体（下段）: 底板・外壁・窓・入口ドア。内部は空洞（後段の _icInterior が間仕切る）──
function _icBodyShell(plan){
  const{hE,hL,baseY}=plan,innerH=plan.cfg.bodyInnerH;
  for(let e=-hE;e<=hE;e++)for(let l=-hL;l<=hL;l++){
    if(e*e+l*l<=2)continue;                // 中央の穴（魔力コアの間→主塔の縦孔へ降りる）
    _icPut(plan,e,baseY,l,null);           // 底板
  }
  for(let e=-hE;e<=hE;e++)for(let l=-hL;l<=hL;l++){
    if(Math.abs(e)!==hE&&Math.abs(l)!==hL)continue;
    for(let y=baseY+1;y<=baseY+innerH;y++)_icPut(plan,e,y,l,null); // 外壁
  }
  // 窓: 外壁の中段へ3マスおきにガラス／たまに水晶（夜は紫に光る魔力の窓に見える）
  for(let e=-hE;e<=hE;e++)for(let l=-hL;l<=hL;l++){
    if(Math.abs(e)!==hE&&Math.abs(l)!==hL)continue;
    if(((e+l+40)%3)!==1)continue;
    if(e===hE&&Math.abs(l)<=2)continue;    // 入口ドアの近くは開けない
    const h=_wtHash((e*31)^(l*17));
    if(h>0.75)continue;
    for(let y=baseY+3;y<=baseY+4;y++)_icPut(plan,e,y,l,h<0.2?CRYSTAL_BLOCK:GLASS_BLOCK);
  }
  // 入口ドア: プレイヤー側の壁を3幅×4高で開け、黒曜石の枠で縁取る
  for(let l=-1;l<=1;l++)for(let y=baseY+1;y<=baseY+4;y++)_icClr(plan,hE,y,l);
  for(let l=-2;l<=2;l+=4)for(let y=baseY+1;y<=baseY+5;y++)_icPut(plan,hE,y,l,OBSIDIAN_BLOCK);
  for(let l=-1;l<=1;l++)_icPut(plan,hE,baseY+5,l,OBSIDIAN_BLOCK);
}

// ── 上段（広い土台・屋根・胸壁・四隅の小櫓）: 上ほど広い「逆さ」シルエットの要 ──
function _icCrown(plan){
  const{hE,hL,ceilY,crownTop}=plan,pad=plan.cfg.crownPad;
  const HE=hE+pad,HL=hL+pad;
  for(let e=-HE;e<=HE;e++)for(let l=-HL;l<=HL;l++){
    _icPut(plan,e,ceilY,l,null);           // せり出した底板（下から見上げると巨大な天蓋）
    _icPut(plan,e,crownTop,l,null);        // 屋根
  }
  for(let e=-HE;e<=HE;e++)for(let l=-HL;l<=HL;l++){
    if(Math.abs(e)!==HE&&Math.abs(l)!==HL)continue;
    for(let y=ceilY+1;y<crownTop;y++)_icPut(plan,e,y,l,null); // 上段の壁
    if(((e+l+40)&1)===0)_icPut(plan,e,crownTop+1,l,null);     // 胸壁（1マスおきの凸凹）
    if(((e+l+80)%4)===0)_icPut(plan,e,ceilY,l,CRYSTAL_BLOCK); // 縁の魔力ライン（下から光って見える）
  }
  // 四隅の小櫓（3×3・高さ4）＋頂部の水晶
  for(const[se,sl]of[[1,1],[1,-1],[-1,1],[-1,-1]]){
    const ce=se*(HE-1),cl=sl*(HL-1);
    for(let de=-1;de<=1;de++)for(let dl=-1;dl<=1;dl++){
      if(de||dl)for(let y=crownTop+1;y<=crownTop+4;y++)_icPut(plan,ce+de,y,cl+dl,null);
      _icPut(plan,ce+de,crownTop+5,cl+dl,null);
    }
    _icPut(plan,ce,crownTop+6,cl,CRYSTAL_BLOCK);
  }
}

// ── 中央の主塔（下向き）: 外殻は鋭く細る円錐、内部は降りられる縦孔ダンジョン。
// 途中に膨らんだ小部屋（宝箱と敵）、先端は水晶の穂先が光る ──
function _icMainTower(plan){
  const{cx0,cz0,baseY,chamberY}=plan,cfg=plan.cfg,D=cfg.mainTowerDepth;
  for(let t=1;t<=D;t++){
    const y=baseY-t;
    const taper=cfg.mainTowerR*Math.pow(1-t/D,0.8);
    const bulge=2.4*Math.max(0,1-Math.abs(y-chamberY)/4);   // 縦孔の底の小部屋の膨らみ
    const rr=Math.max(0.8,taper+bulge);
    const rIn=rr>=2.6?rr-1.4:-1;                            // 太い区間だけ中空＝縦孔
    const R=Math.ceil(rr);
    for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
      const d2=dx*dx+dz*dz;
      if(d2>rr*rr)continue;
      if(rIn>0&&d2<rIn*rIn)continue;
      put(cx0+dx,y,cz0+dz,t>D-3?CRYSTAL_BLOCK:_icWallTi(cx0+dx,y,cz0+dz));
    }
    // 縦孔の足場: 2段ごとに螺旋状の小さな出っ張り（飛び降り/積み登りで上下移動）
    if(rIn>0.9&&(t&1)===0){
      const a=t*1.05,lr=rIn-0.5;
      put(cx0+Math.round(Math.cos(a)*lr),y,cz0+Math.round(Math.sin(a)*lr),SLAB_BLOCK,0);
    }
  }
  // 縦孔の底の小部屋: 床＋宝箱＋敵（降り切った先の報酬）
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(dx*dx+dz*dz<=5)put(cx0+dx,chamberY-2,cz0+dz,DEEP_STONE);
  plan.chestSpots.push({x:cx0,y:chamberY-1,z:cz0});
  plan.enemySpots.push({x:cx0+1,y:chamberY-1,z:cz0-1});
}

// ── 左右の小塔（四隅・中実）＋辺中央の細い飾りトゲ: どれも下向きに細り先端は水晶 ──
function _icSideTowers(plan){
  const{hE,hL,baseY}=plan,cfg=plan.cfg;
  cfg.sideTowers.forEach((s,i)=>{
    const w=_icW(plan,s[0]*(hE-2),s[1]*(hL-2)),D=plan.towerDepths[i];
    for(let t=1;t<=D;t++){
      const y=baseY-t,rr=Math.max(0.7,cfg.sideTowerR*(1-t/D));
      const R=Math.ceil(rr);
      for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
        if(dx*dx+dz*dz>rr*rr)continue;
        put(w.x+dx,y,w.z+dz,t>D-2?CRYSTAL_BLOCK:_icWallTi(w.x+dx,y,w.z+dz));
      }
    }
  });
  for(const[e,l]of[[plan.hE-1,0],[-plan.hE+1,0],[0,plan.hL-1],[0,-plan.hL+1]]){
    const w=_icW(plan,e,l),D=cfg.spikeDepth.min+Math.floor(plan.rng()*(cfg.spikeDepth.max-cfg.spikeDepth.min+1));
    for(let t=1;t<=D;t++)put(w.x,baseY-t,w.z,t===D?CRYSTAL_BLOCK:_icWallTi(w.x,baseY-t,w.z));
  }
}

// ── 内部: 入口ホール→細い通路→小部屋×4→魔力コアの間→玉座の間。外観優先で作りは最小限 ──
function _icInterior(plan){
  const{hL,baseY}=plan,innerH=plan.cfg.bodyInnerH,f=baseY+1;
  // e一定の間仕切り壁（中央3幅×3高のドアを開ける）
  const crossWall=(e)=>{
    for(let l=-hL+1;l<=hL-1;l++)for(let y=f;y<f+innerH;y++){
      if(Math.abs(l)<=1&&y<f+3)continue;
      _icPut(plan,e,y,l,null);
    }
  };
  crossWall(6);   // 入口ホール(e7..11)と通路の境
  crossWall(2);   // 通路と魔力コアの間の境
  crossWall(-4);  // 魔力コアの間と玉座の間の境
  // 細い通路(e3..5,幅3)の側壁と、左右の小部屋への1マスドア（e=4）
  for(let e=3;e<=5;e++)for(const l of[-2,2])for(let y=f;y<f+innerH;y++){
    if(e===4&&y<f+3)continue;
    _icPut(plan,e,y,l,null);
  }
  // 魔力コアの間の側壁（l=±5）と両脇のギャラリー小部屋（e=-1に1マスドア）
  for(let e=-3;e<=1;e++)for(const l of[-5,5])for(let y=f;y<f+innerH;y++){
    if(e===-1&&y<f+3)continue;
    _icPut(plan,e,y,l,null);
  }
  // 入口ホール: 左右に黒曜石の柱＋松明（入ってすぐの空間を飾る）
  for(const l of[-4,4])for(const e of[8,10]){
    for(let y=f;y<f+innerH;y++)_icPut(plan,e,y,l,OBSIDIAN_BLOCK);
    _icPut(plan,e-1,f,l,TORCH_BLOCK);
  }
  // 魔力コア: 床の穴（主塔の縦孔へ続く）の縁にダイヤ鉱石、宙に浮く水晶のコア
  for(let e=-2;e<=2;e++)for(let l=-2;l<=2;l++){
    const d2=e*e+l*l;
    if(d2>2&&d2<=6)_icPut(plan,e,baseY,l,DIAMOND_ORE);
  }
  const core=_icW(plan,0,0);
  for(const[dx,dy,dz]of[[0,0,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0]])
    put(core.x+dx,f+3+dy,core.z+dz,CRYSTAL_BLOCK);
  for(const[e,l]of[[-2,3],[-2,-3],[0,3],[0,-3]])                 // コアを囲む黒曜石の柱
    for(let y=f;y<f+innerH;y++)_icPut(plan,e,y,l,OBSIDIAN_BLOCK);
  // 玉座の間: 壇＋階段＋黒曜石の玉座＋頭上の水晶＋側柱
  const sm=plan.ex===1?2:plan.ex===-1?0:plan.ez===1?3:1;         // 階段は入口方向を向く
  for(let e=-11;e<=-9;e++)for(let l=-3;l<=3;l++)_icPut(plan,e,f,l,DEEP_STONE);
  for(let l=-3;l<=3;l++)_icPut(plan,-8,f,l,STAIR_BLOCK,sm);
  for(let y=f+1;y<=f+3;y++)_icPut(plan,-11,y,0,OBSIDIAN_BLOCK);  // 背もたれ
  _icPut(plan,-10,f+1,0,OBSIDIAN_BLOCK);                         // 座面
  _icPut(plan,-10,f+1,-1,SLAB_BLOCK,0);_icPut(plan,-10,f+1,1,SLAB_BLOCK,0); // 肘掛け
  _icPut(plan,-11,f+4,0,CRYSTAL_BLOCK);                          // 玉座の頭上の水晶
  for(const l of[-3,3]){for(let y=f+1;y<=f+3;y++)_icPut(plan,-10,y,l,DEEP_STONE);_icPut(plan,-10,f+4,l,CRYSTAL_BLOCK);}
  // 宝箱・敵の配置候補（玉座の間の壇上／入口ホール／小部屋／ギャラリー）
  const cs=_icW(plan,-9,2);plan.chestSpots.push({x:cs.x,y:f+1,z:cs.z});
  const eb=_icW(plan,-7,0);plan.enemySpots.push({x:eb.x,y:f,z:eb.z,boss:true});
  const eh=_icW(plan,9,0);plan.enemySpots.push({x:eh.x,y:f,z:eh.z});
  const er=_icW(plan,4,-6);plan.enemySpots.push({x:er.x,y:f,z:er.z});
  const eg=_icW(plan,-1,7);plan.enemySpots.push({x:eg.x,y:f,z:eg.z});
}

// ── 浮遊島1個: 上面が平らな小島（ノイズでギザギザの縁＋下向きの岩錐）。marker=水晶の道標 ──
function _icIsland(plan,wx,wy,wz,r,marker){
  const R=Math.ceil(r)+1;
  for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
    const edge=r+noise(dx*.3+wx*.1,dz*.3+wz*.1)*1.2;
    const d=Math.hypot(dx,dz);
    if(d>edge)continue;
    put(wx+dx,wy,wz+dz,_wtHash((wx+dx)*31^(wz+dz)*17)<0.25?OBSIDIAN_BLOCK:6); // 上面（灰石＋黒曜石）
    const depth=Math.max(1,Math.round((1-d/Math.max(edge,0.1))*(r+1)));       // 下の逆錐
    for(let t=1;t<=depth;t++)put(wx+dx,wy-t,wz+dz,_icWallTi(wx+dx,wy-t,wz+dz));
  }
  if(marker)put(wx,wy+1,wz,CRYSTAL_BLOCK);
}
// 装飾用の浮遊島（3〜6個）
function _icDecoIslands(plan){
  for(const d of plan.decoIslands){
    d.wx=plan.cx0+Math.round(Math.cos(d.a)*d.dist);
    d.wz=plan.cz0+Math.round(Math.sin(d.a)*d.dist);
    _icIsland(plan,d.wx,d.y,d.wz,d.r,plan.rng()<0.6);
  }
}
// 地上→城の登り導線: 城を旋回しながら階段状に高くなる浮遊島の列。最下段は地表すぐ上、
// 最上段は入口橋のすぐ下（1段4ブロック＝ジャンプ＋ブロック設置で登れる間隔）
function _icPathIslands(plan){
  const cfg=plan.cfg,N=cfg.pathIslands;
  for(let i=0;i<N;i++){
    const a=plan.entA+plan.pathTurn*0.3*(i+1);
    const dist=plan.hE+8+i*1.4;
    const wx=plan.cx0+Math.round(Math.cos(a)*dist),wz=plan.cz0+Math.round(Math.sin(a)*dist);
    let top=plan.baseY-3-i*cfg.pathStepY;
    top=Math.max(top,surfaceHeightAt(wx,wz)+2);   // 丘の上でも島が地面に埋まらないように
    _icIsland(plan,wx,top,wz,2.6+((i*7)%3)*0.5,true);
  }
}

// ── 崩れた橋: 2幅の石橋をハッシュで欠けさせる（gapRate=欠けの割合）──
function _icBridgeLine(x0,y0,z0,x1,y1,z1,gapRate){
  const len=Math.hypot(x1-x0,z1-z0)||1,n=Math.max(1,Math.round(len));
  const px=-(z1-z0)/len,pz=(x1-x0)/len;           // 幅方向の単位ベクトル
  for(let i=0;i<=n;i++){
    const t=i/n,bx=x0+(x1-x0)*t,by=y0+(y1-y0)*t,bz=z0+(z1-z0)*t;
    for(let w=0;w<2;w++){
      const wx=Math.round(bx+px*(w-0.5)),wz=Math.round(bz+pz*(w-0.5)),wy=Math.round(by);
      if(_wtHash((wx*13)^(wy*7)^(wz*29)^(i*57))<gapRate)continue;
      put(wx,wy,wz,_wtHash(wx*11^wz*3)<0.3?6:DEEP_STONE);
    }
  }
}
function _icBridges(plan){
  // 入口橋: ドアから登り導線の最初の島の方向へ（欠けは少なめ＝渡れる）
  const d0=_icW(plan,plan.hE+1,0),d1=_icW(plan,plan.hE+7,0);
  _icBridgeLine(d0.x,plan.baseY,d0.z,d1.x,plan.baseY,d1.z,0.12);
  // 城→装飾島の崩れた橋（大きく欠けた廃橋）
  for(const d of plan.decoIslands){
    if(!d.bridge||d.wx==null)continue;
    const le=(d.wx-plan.cx0)*plan.ex+(d.wz-plan.cz0)*plan.ez;
    const ll=(d.wx-plan.cx0)*plan.lx+(d.wz-plan.cz0)*plan.lz;
    const w=_icW(plan,Math.max(-plan.hE,Math.min(plan.hE,le)),Math.max(-plan.hL,Math.min(plan.hL,ll)));
    const wy=Math.max(plan.baseY+2,Math.min(plan.ceilY-1,d.y));
    _icBridgeLine(d.wx,d.y,d.wz,w.x,wy,w.z,0.35);
  }
}
// ── 鎖: 上段のせり出しの下面から黒曜石/灰石を交互に垂らす ──
function _icChains(plan){
  for(const c of plan.chainDefs){
    const w=_icW(plan,c.e,c.l);
    for(let d=1;d<=c.len;d++)put(w.x,plan.ceilY-d,w.z,(d&1)?OBSIDIAN_BLOCK:6);
  }
}
// ── 滝: 屋根の水源から縁を越え、一部だけ空中へ流れ落ちて途切れる ──
function _icWaterfall(plan){
  const pad=plan.cfg.crownPad,e=plan.waterE,side=plan.waterSide;
  for(let de=0;de<=1;de++)_icPut(plan,e+de,plan.crownTop+1,side*(plan.hL+pad-1),WATER_BLOCK); // 屋根の水源
  const w=_icW(plan,e,side*(plan.hL+pad+1));
  for(let y=plan.crownTop;y>=plan.baseY-6;y--)put(w.x,y,w.z,WATER_BLOCK); // 壁の外を落ちる水柱
}

// ── 宝箱（既存の underTreasures 宝箱システムを流用、type3=豪華報酬）と敵の配置 ──
function _icPlaceChest(wx,wy,wz){
  const tk=vKey(wx,wy,wz);if(underTreasures[tk])return;
  put(wx,wy-1,wz,DEEP_STONE);clr(wx,wy,wz);clr(wx,wy+1,wz);
  const mesh=_makeTreasureMesh(3);mesh.position.set(wx+.5,wy,wz+.5);
  if(!openedTreasureKeys.has(tk))scene.add(mesh);
  underTreasures[tk]={mesh,opened:openedTreasureKeys.has(tk),type:3,struct:'invertedCastle'};
}
function _icRewards(plan){
  let placed=0;
  for(const s of plan.chestSpots){if(placed>=plan.cfg.treasureCount)break;_icPlaceChest(s.x,s.y,s.z);placed++;}
  let en=0;
  for(const s of plan.enemySpots){
    if(en>=plan.cfg.enemyCount)break;
    const idx=s.boss?(typeof ENEMY_TYPES!=='undefined'&&ENEMY_TYPES.length>8?8:2):[0,1,5][en%3];
    _ssgSpawnEnemyAt(s.x,s.y,s.z,idx);en++;
  }
}

let _invertedCastleBusy=false; // 生成中フラグ（ボタン連打による多重生成を防ぐ）
function generateInvertedCastle(){
  if(_invertedCastleBusy){showBonus('🏰 逆さ城を生成中…');return;}
  if(!window.confirm('空中に浮かぶ巨大な「逆さ城」を生成します。生成しますか？'))return;
  _invertedCastleBusy=true;_icSetProgress(true,0);
  let plan;
  try{
    const anchor=_frontAnchor(INVERTED_CASTLE_CFG.anchorDist);
    _ensureChunksAround(anchor.cx0,anchor.cz0,34,3); // 本体＋浮遊島＋登り導線が収まる範囲
    const seed=((WORLD_SEED^(anchor.cx0*73856093)^(anchor.cz0*19349663)^0x9e3779)>>>0)||1;
    plan=_planInvertedCastle(_wtRng(seed),anchor);
  }catch(e){
    console.error('逆さ城: 準備中にエラー',e);
    _invertedCastleBusy=false;_icSetProgress(false);showBonus('⚠ 逆さ城の生成に失敗しました');return;
  }
  // フェーズ列（1フェーズ/フレーム）。本体→上段→塔→内部→島→橋・鎖・滝→報酬の順
  const phases=[
    ()=>_icBodyShell(plan),
    ()=>_icCrown(plan),
    ()=>_icMainTower(plan),
    ()=>_icSideTowers(plan),
    ()=>_icInterior(plan),
    ()=>_icDecoIslands(plan),
    ()=>_icPathIslands(plan),
    ()=>{_icBridges(plan);_icChains(plan);_icWaterfall(plan);},
    ()=>_icRewards(plan),
  ];
  let idx=0;_deferDirty=true;
  const step=()=>{
    try{
      phases[idx]();idx++;
      _deferDirty=false;flushDirtyChunks();
      _icSetProgress(true,idx/phases.length);
      if(idx<phases.length){_deferDirty=true;requestAnimationFrame(step);}
      else{
        _invertedCastleBusy=false;_icSetProgress(false);showBonus('🏰 逆さ城を生成！');
        playTone(220,.14,.1,'triangle');setTimeout(()=>playTone(330,.14,.1,'triangle'),140);setTimeout(()=>playTone(440,.18,.1,'triangle'),300);
      }
    }catch(e){
      console.error('逆さ城: 生成中にエラー',e);
      _deferDirty=false;try{flushDirtyChunks();}catch(_){}
      _invertedCastleBusy=false;_icSetProgress(false);showBonus('⚠ 逆さ城の生成に失敗しました');
    }
  };
  requestAnimationFrame(step);
}
