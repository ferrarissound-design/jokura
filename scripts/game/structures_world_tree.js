// ============================================================================
// jokura / structures_world_tree.js
// 🌳 世界樹 ワンクリック生成（_wtRng/_wtHash は眠れる石神からも使われる）
// world.js から分割されたファイルの一部。全スクリプトは index.html の PARTS の
// 順序で <script> として読み込まれ、同一のグローバルスコープを共有する。
// このファイルは world.js（地形・チャンク・ブロック定義）より後、
// structures_registry.js（生成関数を登録テーブルで参照）より前に読み込まれる。
// ============================================================================

// ═══ 🌳 世界樹 ワンクリック生成 ═══
// クリエイティブ専用: プレイヤー前方の地表に、高さ80〜110・樹冠幅60〜80ほどの
// 「巨大な世界樹」をプロシージャルに生成する。ねじれ合流する中空の幹（内部に螺旋
// 階段と祭壇）、放射状の根、多数の枝、複数の葉クランプで構成された樹冠、垂れる蔦、
// 樹上の展望台、そして少し離れた精霊の泉を含む「ダンジョン兼ランドマーク」。
// 賢者の樹庭・監視塔・空中神殿と同じ共有ヘルパー（put/clr/_frontAnchor/
// _ensureChunksAround/_footprintYBase）を使う。巨大なので requestAnimationFrame で
// フェーズを分割し、フレーム毎に少しずつ生成して処理落ちを避ける。
const WT_TAU=Math.PI*2;
// ── 数値はここへ集約（形が崩壊しないよう各要素に最小値/最大値を設定）──
const WORLD_TREE_CFG={
  anchorDist:30,               // プレイヤー前方の生成距離（大きいので離す）
  height:{min:80,max:112},      // 全体の高さ
  trunkBaseR:{min:9,max:13},    // 幹の根元半径（直径18〜26）
  trunkTopR:{min:2.5,max:3.6},  // 幹上部の半径（上ほど細くする）
  subTrunks:{min:3,max:5},      // 合流する幹（ストランド）の本数
  twistTurns:{min:0.4,max:1.3}, // 幹のねじれ回転数
  roots:{min:8,max:14},         // 根の本数
  rootLen:{min:10,max:20},      // 根の長さ
  branches:{min:10,max:18},     // 主枝の本数
  branchLen:{min:9,max:20},     // 主枝の長さ
  leafClumpR:{min:6,max:12},    // 葉クランプの半径
  canopyR:{min:30,max:40},      // 樹冠の広がり半径（幅60〜80）
  domeClumps:{min:14,max:22},   // 樹冠を形づくるドーム状クランプ数
  vineLen:{min:2,max:9},        // ツタの長さ
};

// 生成進捗オーバーレイの表示/更新（分割生成中のみ表示、完了・失敗で消す）
function _wtSetProgress(show,frac){
  const el=document.getElementById('worldTreeProgress');
  if(!el)return;
  el.style.display=show?'':'none';
  if(show){const fill=document.getElementById('wtpFill');if(fill)fill.style.width=Math.round((frac||0)*100)+'%';}
}
// 決定的乱数（mulberry32）: 同じシードなら同じ世界樹を再現できる
function _wtRng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// 位置ハッシュ（0..1）: 樹皮のまだらや葉の隙間など、フェーズ分割に依存しない
// 決定的なばらつきに使う（rngのように呼び出し順へ依存しない）
function _wtHash(a){a=a|0;a=(a^61)^(a>>>16);a=a+(a<<3)|0;a=a^(a>>>4);a=Math.imul(a,0x27d4eb2d);a=a^(a>>>15);return((a>>>0)/4294967296);}
// 整地などで安全に消してよい自然ブロックか（石・レンガ・水・鉱石等は残す）
function _wtClearable(ti){return ti===0||ti===2||ti===3||ti===5||ti===9||ti===LEAF_BLOCK||ti===CACTUS_BLOCK||ti===MUSHROOM_BLOCK;}
// 幹の高さ比 f(0=根元,1=頂点) における半径。上ほど細く、根元にフレア（根張り）
function _wtTrunkR(plan,f){
  const base=plan.topR+(plan.baseR-plan.topR)*Math.pow(1-f,1.3);
  const flare=Math.max(0,1-f/0.12)*plan.baseR*0.45;
  return base+flare;
}
// 幹の断面を構成するストランド群（下で広がり上で1本へ合流＝ねじれ合流）
function _wtStrandsAt(plan,f){
  const t=f*plan.H;
  const axX=plan.leanX*t, axZ=plan.leanZ*t;   // 幹軸のゆるい傾き（左右非対称化）
  const r=_wtTrunkR(plan,f);
  const spread=plan.baseSpread*Math.pow(1-f,1.6); // 上へ向かうほど中心へ収束
  const sr=Math.max(1.6,r*0.55);
  const arr=[];
  for(let i=0;i<plan.nSub;i++){
    const a=plan.strandAng[i]+plan.twist*f*WT_TAU;
    const bump=noise(Math.cos(a)*1.5+f*2.2,Math.sin(a)*1.5)*0.9; // 樹皮の凹凸
    arr.push({sx:axX+Math.cos(a)*spread,sz:axZ+Math.sin(a)*spread,rr:sr+bump});
  }
  return{arr,axX,axZ,r};
}
function _wtInside(arr,dx,dz){
  for(let i=0;i<arr.length;i++){const ex=dx-arr[i].sx,ez=dz-arr[i].sz;if(ex*ex+ez*ez<=arr[i].rr*arr[i].rr)return true;}
  return false;
}
// 幹の樹皮ブロック: 基本は木材、まだらに暗い木材、根元付近に苔を混ぜる
function _wtBark(plan,wx,wy,wz){
  const h=_wtHash((wx*73856093)^(wy*19349663)^(wz*83492791));
  if(h<0.12)return CAVE_DIRT;                                   // 少し暗い木材（まだら）
  if(wy<plan.ybase+plan.H*0.32&&h>0.9)return LEAF_BLOCK;        // 根元付近の苔
  return 3;                                                     // 木材
}

// 生成に適したアンカーを選ぶ（起伏の小さい・水の無い平地を優先し、崖/水上を避ける）
function _pickTreeAnchor(){
  const base=_frontAnchor(WORLD_TREE_CFG.anchorDist);
  const cands=[base];
  for(let k=0;k<4;k++){
    const off=6+k*5,a=base.aim+(k%2?1:-1)*0.7;
    cands.push({fx:base.fx,fz:base.fz,cx0:Math.round(base.cx0+Math.cos(a)*off),cz0:Math.round(base.cz0+Math.sin(a)*off),aim:base.aim});
  }
  let best=base,bestScore=Infinity;
  for(const c of cands){
    _ensureChunksAround(c.cx0,c.cz0,7,1);
    const hs=[];let water=0;
    for(let dx=-6;dx<=6;dx+=3)for(let dz=-6;dz<=6;dz+=3){
      const x=c.cx0+dx,z=c.cz0+dz,sh=surfaceHeightAt(x,z);hs.push(sh);
      for(let y=sh;y<=sh+2;y++){const v=voxels[vKey(x,y,z)];if(v&&v.ti===WATER_BLOCK){water++;break;}}
    }
    const mn=Math.min.apply(null,hs),mx=Math.max.apply(null,hs);
    const score=(mx-mn)*2+water*8;                              // 起伏が小さく水が無いほど良い
    if(score<bestScore){bestScore=score;best=c;}
  }
  return best;
}

// 世界樹の「設計図」を決定的に作る（重い put は後段のフェーズで実行）
function _planWorldTree(rng,anchor){
  const cfg=WORLD_TREE_CFG;
  const ri=o=>o.min+Math.floor(rng()*(o.max-o.min+1));
  const rf=o=>o.min+rng()*(o.max-o.min);
  const cx0=anchor.cx0,cz0=anchor.cz0,aim=anchor.aim;
  const ybase=_footprintYBase(cx0,cz0,cfg.trunkBaseR.max+3,4);
  const H=ri(cfg.height);
  const baseR=rf(cfg.trunkBaseR),topR=rf(cfg.trunkTopR);
  const nSub=ri(cfg.subTrunks);
  const twist=(rng()<0.5?-1:1)*rf(cfg.twistTurns);              // ねじれ方向もランダム
  const baseSpread=baseR*0.42;
  const strandAng=[];for(let i=0;i<nSub;i++)strandAng.push(rng()*WT_TAU);
  const leanA=rng()*WT_TAU,leanAmt=1.5+rng()*3;                 // 幹の傾き（非対称化）
  const leanX=Math.cos(leanA)*leanAmt/H,leanZ=Math.sin(leanA)*leanAmt/H;
  const deckT=Math.round(H*0.72);                              // 展望台の高さ
  const plan={cfg,cx0,cz0,aim,ybase,H,baseR,topR,nSub,twist,baseSpread,strandAng,leanX,leanZ,deckT,
              rootList:[],branchList:[],leafClumps:[],vineSeeds:[]};

  // ── 根: 放射状に nRoot 本、曲がりながら地面へ潜る。一部はアーチ状に浮かす ──
  const nRoot=ri(cfg.roots);
  for(let i=0;i<nRoot;i++){
    const ang=(i/nRoot)*WT_TAU+(rng()-0.5)*0.5;                 // ほぼ放射状＋揺らぎ
    const len=rf(cfg.rootLen),arch=rng()<0.3;
    let dir=ang,r=2.4+rng()*1.3;
    let x=cx0+Math.cos(ang)*(baseR*0.7),z=cz0+Math.sin(ang)*(baseR*0.7);
    const steps=Math.max(4,Math.round(len)),pts=[];
    for(let s=0;s<=steps;s++){
      const f=s/steps;
      dir+=(rng()-0.5)*0.5;                                     // 曲がりながら伸びる
      x+=Math.cos(dir);z+=Math.sin(dir);
      const gy=surfaceHeightAt(Math.round(x),Math.round(z));    // 地表高さを取得して潜らせる
      let y;
      if(arch){const lf=Math.sin(Math.min(f,0.85)/0.85*Math.PI)*3.5;y=(f<0.85)?ybase+Math.round(lf):gy;} // 橋/アーチ状
      else{y=Math.min(ybase,gy)-Math.round(f*2)+(f<0.25?Math.round((0.25-f)*4):0);}
      pts.push({x:Math.round(x),y:Math.round(y),z:Math.round(z),r:Math.max(1,r*(1-f*0.7))});
    }
    plan.rootList.push({pts});
  }

  // ── 枝: 主枝＋子枝を再帰的に生成し、枝先へ葉クランプを登録 ──
  const growBranch=(sx,sy,sz,dir0,pitch0,len,r0,depth)=>{
    let dir=dir0,pitch=pitch0,x=sx,y=sy,z=sz;
    const steps=Math.max(4,Math.round(len)),pts=[];
    for(let s=0;s<=steps;s++){
      const f=s/steps;
      dir+=(rng()-0.5)*0.35;                                    // 自然な蛇行
      pitch+=(rng()-0.5)*0.15-0.03;                             // ゆるやかに垂れる
      x+=Math.cos(dir);z+=Math.sin(dir);y+=pitch;
      pts.push({x:Math.round(x),y:Math.round(y),z:Math.round(z),r:Math.max(1,r0*(1-f*0.72))});
    }
    plan.branchList.push({pts});
    const tip=pts[pts.length-1];
    plan.leafClumps.push({x:tip.x,y:tip.y,z:tip.z,r:rf(cfg.leafClumpR),density:0.3+rng()*0.25});
    if(depth>0){                                                // 太い枝から細い枝へ分岐
      const nChild=1+Math.floor(rng()*2);
      for(let c=0;c<nChild;c++){
        const at=pts[Math.min(pts.length-1,Math.floor(pts.length*(0.5+rng()*0.35)))];
        growBranch(at.x,at.y,at.z,dir+(rng()<0.5?1:-1)*(0.5+rng()*0.6),pitch+(rng()-0.5)*0.3,len*0.55,r0*0.6,depth-1);
      }
    }
  };
  const nBranch=ri(cfg.branches);
  for(let i=0;i<nBranch;i++){
    const fo=0.45+rng()*0.4,t0=fo*H,ang=rng()*WT_TAU,et=rng();
    // 上向き/横向き/斜め下向きを混ぜる
    const pitch=et<0.5?(0.15+rng()*0.5):et<0.8?(rng()-0.5)*0.25:-(0.1+rng()*0.3);
    const rAt=_wtTrunkR(plan,fo);
    const sx=cx0+plan.leanX*t0+Math.cos(ang)*rAt,sz=cz0+plan.leanZ*t0+Math.sin(ang)*rAt,sy=ybase+t0;
    growBranch(sx,sy,sz,ang,pitch,rf(cfg.branchLen),2.0+rng()*1.1,1);
  }

  // ── 樹冠ドーム: 幅の広いシルエットを作るため、葉クランプをドーム状に散らす ──
  const crownSpread=rf(cfg.canopyR),domeCY=ybase+Math.round(H*0.8);
  const nDome=ri(cfg.domeClumps);
  for(let i=0;i<nDome;i++){
    const a=rng()*WT_TAU,rad=crownSpread*(0.3+0.7*Math.sqrt(rng())),shape=1-rad/crownSpread;
    const cy=domeCY+Math.round(shape*H*0.16)+Math.round((rng()-0.5)*8);   // 中心ほど高い＝ドーム
    plan.leafClumps.push({x:cx0+Math.round(Math.cos(a)*rad),y:cy,z:cz0+Math.round(Math.sin(a)*rad),r:rf(cfg.leafClumpR)*(0.9+rng()*0.5),density:0.28+rng()*0.22});
  }

  // ── ツタの起点: 葉クランプの底や枝の途中からランダム長で垂らす ──
  for(const c of plan.leafClumps){
    if(rng()<0.5){const a=rng()*WT_TAU;plan.vineSeeds.push({x:c.x+Math.round(Math.cos(a)*c.r*0.6),y:c.y-Math.round(c.r*0.5),z:c.z+Math.round(Math.sin(a)*c.r*0.6),len:ri(cfg.vineLen)});}
  }
  for(const b of plan.branchList){
    if(rng()<0.4){const p=b.pts[Math.floor(b.pts.length*0.7)];plan.vineSeeds.push({x:p.x,y:p.y-1,z:p.z,len:ri(cfg.vineLen)});}
  }

  // ── 精霊の泉: 本体から少しずらした位置へ（景観に変化をつける）──
  plan.springAng=aim+(rng()<0.5?1:-1)*(0.8+rng()*0.8);
  plan.springDist=baseR+7+rng()*6;
  plan.springR=3+Math.floor(rng()*2);
  return plan;
}

// 根元の整地: 斜面を埋めて根元が宙に浮かないようにし、上の自然物を軽く掃除する
function _wtBasePad(plan){
  const{cx0,cz0,ybase,baseR}=plan,R=baseR+4;
  for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
    if(dx*dx+dz*dz>R*R)continue;
    const x=cx0+dx,z=cz0+dz,sh=surfaceHeightAt(x,z);
    for(let y=sh+1;y<ybase;y++)put(x,y,z,1);                    // 傾斜地を石で埋めて高さを吸収
    put(x,ybase,z,0);                                           // 根元の地面（草）
    for(let y=ybase+1;y<=ybase+3;y++){const v=voxels[vKey(x,y,z)];if(v&&_wtClearable(v.ti))clr(x,y,z);} // 幹に食い込む自然物だけ除去
  }
}
// 幹本体: 高さ t0..t1 の各層で「外殻だけ」を置く（内部は空洞にして軽量化＋探索可能に）
function _wtTrunkLayers(plan,t0,t1){
  const shellThk=2;
  for(let t=t0;t<=t1;t++){
    const f=t/plan.H,S=_wtStrandsAt(plan,f);
    const R=Math.ceil(S.r+plan.baseSpread+3),W=2*R+1;
    const grid=new Uint8Array(W*W);                             // この層の内外を1度だけ判定
    for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++)if(_wtInside(S.arr,dx,dz))grid[(dx+R)*W+(dz+R)]=1;
    const y=plan.ybase+t;
    for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
      if(!grid[(dx+R)*W+(dz+R)])continue;
      let edge=false;                                           // 近傍に外部があれば外殻セル
      for(let ox=-shellThk;ox<=shellThk&&!edge;ox++){
        const gx=dx+ox+R;if(gx<0||gx>=W){edge=true;break;}
        for(let oz=-shellThk;oz<=shellThk;oz++){const gz=dz+oz+R;if(gz<0||gz>=W||!grid[gx*W+gz]){edge=true;break;}}
      }
      if(!edge)continue;
      const wx=plan.cx0+dx,wz=plan.cz0+dz;
      put(wx,y,wz,_wtBark(plan,wx,y,wz));
    }
  }
}
// 根元付近の入口を開ける（プレイヤー正面側にトンネルを掘って内部の祭壇・階段へ）
function _wtCarveDoor(plan){
  const{cx0,cz0,ybase}=plan,ex=Math.cos(plan.aim),ez=Math.sin(plan.aim),px=-ez,pz=ex;
  for(let h=1;h<=4;h++)for(let s=-1;s<=1;s++)for(let rad=0;rad<=plan.baseR+3;rad++){
    clr(Math.round(cx0+ex*rad+px*s),ybase+h,Math.round(cz0+ez*rad+pz*s));
  }
}
// 幹内部の螺旋階段＋踊り場＋松明（実際に登って展望台まで到達できる）
function _wtStairs(plan){
  const{cx0,cz0,ybase}=plan,dTheta=Math.PI/8,startAng=plan.aim+Math.PI;
  for(let i=0;;i++){
    const t=2+i;if(t>plan.deckT)break;
    const f=t/plan.H,interiorR=Math.max(1.5,_wtTrunkR(plan,f)-2.2);
    const rStair=Math.min(interiorR,3.2);
    const ang=startAng+i*dTheta,nextAng=startAng+(i+1)*dTheta;
    const axX=plan.leanX*t,axZ=plan.leanZ*t;
    const x=Math.round(cx0+axX+Math.cos(ang)*rStair),z=Math.round(cz0+axZ+Math.sin(ang)*rStair),y=ybase+t;
    const tx=Math.cos(nextAng)-Math.cos(ang),tz=Math.sin(nextAng)-Math.sin(ang);
    const meta=Math.abs(tx)>Math.abs(tz)?(tx>0?0:2):(tz>0?1:3);
    clr(x,y,z);clr(x,y+1,z);clr(x,y+2,z);                       // 頭上を空ける
    put(x,y-1,z,3);                                             // 段の支え
    put(x,y,z,STAIR_BLOCK,meta);
    if(i>0&&i%12===0){                                          // 数段ごとに踊り場と灯り
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)put(x+dx,y,z+dz,3);
      put(x,y+1,z,TORCH_BLOCK);
    }
  }
}
// 根元中央の祭壇（宝箱の代替として発光する御神体を置く）
function _wtAltar(plan){
  const{cx0,cz0,ybase}=plan,y=ybase;
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
    put(cx0+dx,y,cz0+dz,1);                                     // 石畳の台座
    if((dx||dz)&&Math.abs(dx)+Math.abs(dz)===2&&_wtHash(dx*7+dz*3)<0.6)put(cx0+dx,y+1,cz0+dz,LEAF_BLOCK); // 苔むした四隅
  }
  put(cx0,y+1,cz0,1);
  put(cx0,y+2,cz0,SLAB_BLOCK,0);
  put(cx0,y+3,cz0,CRYSTAL_BLOCK);                              // 発光する御神体
  put(cx0+1,y+1,cz0+1,TORCH_BLOCK);
  put(cx0-1,y+1,cz0-1,TORCH_BLOCK);
}
// 根: 設計図の経路に沿って、やや平たい木ブロックの塊を積む
function _wtRoots(plan,i0,i1){
  for(let i=i0;i<i1;i++)for(const p of plan.rootList[i].pts){
    const rr=p.r,cr=Math.ceil(rr);
    for(let dx=-cr;dx<=cr;dx++)for(let dy=-cr;dy<=cr;dy++)for(let dz=-cr;dz<=cr;dz++){
      if(dx*dx+dy*dy*1.4+dz*dz>rr*rr)continue;                  // 縦を潰して平たい根に
      put(p.x+dx,p.y+dy,p.z+dz,_wtBark(plan,p.x+dx,p.y+dy,p.z+dz));
    }
  }
}
// 枝: 設計図の経路に沿って木ブロックの塊を積む
function _wtBranches(plan,i0,i1){
  for(let i=i0;i<i1;i++)for(const p of plan.branchList[i].pts){
    const rr=p.r,cr=Math.ceil(rr);
    for(let dx=-cr;dx<=cr;dx++)for(let dy=-cr;dy<=cr;dy++)for(let dz=-cr;dz<=cr;dz++){
      if(dx*dx+dy*dy+dz*dz>rr*rr)continue;
      put(p.x+dx,p.y+dy,p.z+dz,_wtBark(plan,p.x+dx,p.y+dy,p.z+dz));
    }
  }
}
// 樹冠: 葉クランプ i0..i1 を疎らな楕円殻として置く（内部は空洞＝隙間から空が見える）
function _wtCanopy(plan,i0,i1){
  for(let i=i0;i<i1&&i<plan.leafClumps.length;i++){
    const c=plan.leafClumps[i],r=c.r,R=Math.ceil(r);
    for(let dx=-R;dx<=R;dx++)for(let dy=-R;dy<=R;dy++)for(let dz=-R;dz<=R;dz++){
      const nd=Math.sqrt(dx*dx+dy*dy+dz*dz)/r;
      const jit=(_wtHash((c.x+dx)*7+(c.y+dy)*13+(c.z+dz)*3)-0.5)*0.3;
      if(nd>1+jit||nd<0.45)continue;                            // 外周＋内部空洞
      const h=_wtHash((c.x+dx)*131^(c.y+dy)*57^(c.z+dz)*911);
      if(h>c.density*(0.6+nd))continue;                         // 密度にばらつき（隙間）
      const x=c.x+dx,y=c.y+dy,z=c.z+dz;
      if(voxels[vKey(x,y,z)])continue;                          // 幹・枝は潰さない
      if(h<0.006&&nd>0.6){put(x,y,z,CRYSTAL_BLOCK);continue;}   // 控えめな発光ブロック（夜に淡く光る）
      put(x,y,z,LEAF_BLOCK);
    }
  }
}
// ツタ: 起点から下方向へ、空中セルにだけランダム長で葉を垂らす
function _wtVines(plan){
  for(const s of plan.vineSeeds){
    for(let d=1;d<=s.len;d++){if(voxels[vKey(s.x,s.y-d,s.z)])break;put(s.x,s.y-d,s.z,LEAF_BLOCK);}
  }
}
// 樹上の展望台: 幹の外へ張り出す木の床＋隙間のある柵＋頭上の葉を掃除して眺望を確保
function _wtDeck(plan){
  const{cx0,cz0,ybase}=plan,t=plan.deckT,y=ybase+t;
  const cxx=Math.round(cx0+plan.leanX*t),czz=Math.round(cz0+plan.leanZ*t),R=5;
  for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){if(dx*dx+dz*dz<=R*R)put(cxx+dx,y,czz+dz,3);} // 床
  for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){                                            // 転落防止の柵
    const d2=dx*dx+dz*dz;if(d2<=(R-1)*(R-1)||d2>R*R)continue;
    put(cxx+dx,y+1,czz+dz,3);
    if(((dx+dz)&1)===0)put(cxx+dx,y+2,czz+dz,SLAB_BLOCK,0);      // 一段おき＝隙間から見渡せる
  }
  for(let dx=-R-2;dx<=R+2;dx++)for(let dz=-R-2;dz<=R+2;dz++)for(let dy=1;dy<=4;dy++){            // 頭上の葉を除去
    const v=voxels[vKey(cxx+dx,y+dy,czz+dz)];if(v&&v.ti===LEAF_BLOCK)clr(cxx+dx,y+dy,czz+dz);
  }
  const ex=Math.cos(plan.aim),ez=Math.sin(plan.aim);
  for(let dy=0;dy<=2;dy++)for(let r=0;r<=R;r++)clr(Math.round(cxx+ex*r),y+dy,Math.round(czz+ez*r)); // 幹内部から床への出入口
  put(cxx,y,czz,3);
  put(cxx,y+1,czz,TORCH_BLOCK);                                 // 展望台の灯り
}
// 精霊の泉: 本体から少しずらした浅い池＋苔・花（葉）・キノコ・発光植物
function _wtSpring(plan){
  const{cx0,cz0}=plan,a=plan.springAng,dist=plan.springDist;
  const px=Math.round(cx0+Math.cos(a)*dist),pz=Math.round(cz0+Math.sin(a)*dist);
  const gy=surfaceHeightAt(px,pz),R=plan.springR;
  for(let dx=-R-1;dx<=R+1;dx++)for(let dz=-R-1;dz<=R+1;dz++){
    const d2=dx*dx+dz*dz;if(d2>(R+1)*(R+1))continue;
    const x=px+dx,z=pz+dz,sh=surfaceHeightAt(x,z);
    for(let y=sh+1;y<gy;y++)put(x,y,z,1);                       // ゆるく均す
    if(d2<=R*R){put(x,gy-1,z,2);put(x,gy,z,WATER_BLOCK);}       // 砂底＋水面（浅い池）
    else if(_wtHash(x*13+z*7)<0.7)put(x,gy,z,2);                // 砂の縁
    const v=voxels[vKey(x,gy+1,z)];if(v&&_wtClearable(v.ti))clr(x,gy+1,z);
  }
  for(let i=0;i<14;i++){                                        // 縁の装飾
    const aa=Math.random()*WT_TAU,dd=R+0.5+Math.random()*1.5;
    const x=Math.round(px+Math.cos(aa)*dd),z=Math.round(pz+Math.sin(aa)*dd),sh=surfaceHeightAt(x,z);
    if(voxels[vKey(x,sh+1,z)])continue;
    const rr=Math.random();
    put(x,sh+1,z,rr<0.4?LEAF_BLOCK:rr<0.7?MUSHROOM_BLOCK:CRYSTAL_BLOCK);
  }
}
// 根元まわりの装飾: 苔・草・キノコ・発光植物を少量散らす
function _wtGroundDecor(plan){
  const{cx0,cz0,baseR}=plan,R=baseR+6;
  for(let i=0;i<60;i++){
    const a=Math.random()*WT_TAU,d=baseR*0.8+Math.random()*(R-baseR*0.8);
    const x=Math.round(cx0+Math.cos(a)*d),z=Math.round(cz0+Math.sin(a)*d),gy=surfaceHeightAt(x,z);
    if(voxels[vKey(x,gy+1,z)])continue;
    const rr=Math.random();
    if(rr<0.4)put(x,gy+1,z,LEAF_BLOCK);
    else if(rr<0.6)put(x,gy+1,z,MUSHROOM_BLOCK);
    else if(rr<0.72)put(x,gy+1,z,CRYSTAL_BLOCK);
  }
}

let _worldTreeBusy=false; // 生成中フラグ（ボタン連打による多重生成を防ぐ）
function generateWorldTree(){
  if(_worldTreeBusy){showBonus('🌳 世界樹を生成中…');return;}
  // 確認ダイアログ（生成する / キャンセル）
  if(!window.confirm('巨大な世界樹を生成します。周囲の地形が変化する場合があります。生成しますか？'))return;
  _worldTreeBusy=true;
  _wtSetProgress(true,0);
  // ── 準備（同期）: アンカー選定・チャンク確保・設計図・整地 ──
  let plan;
  try{
    const anchor=_pickTreeAnchor();
    _ensureChunksAround(anchor.cx0,anchor.cz0,WORLD_TREE_CFG.canopyR.max+4,3);
    const seed=((WORLD_SEED^(anchor.cx0*73856093)^(anchor.cz0*19349663))>>>0)||1; // ワールドシード＋座標で決定的
    plan=_planWorldTree(_wtRng(seed),anchor);
    _deferDirty=true;_wtBasePad(plan);_deferDirty=false;flushDirtyChunks();
  }catch(e){
    console.error('世界樹: 準備中にエラー',e);
    _deferDirty=false;try{flushDirtyChunks();}catch(_){}
    _worldTreeBusy=false;_wtSetProgress(false);showBonus('⚠ 世界樹の生成に失敗しました');
    return;
  }
  // ── フェーズ列（1フェーズ/フレームで実行して処理落ちを避ける）──
  const phases=[];
  const half=Math.floor(plan.H/2);
  phases.push(()=>_wtTrunkLayers(plan,0,half));                 // 幹（下半分）
  phases.push(()=>{_wtTrunkLayers(plan,half+1,plan.H);_wtCarveDoor(plan);}); // 幹（上半分）＋入口
  phases.push(()=>{_wtStairs(plan);_wtAltar(plan);});           // 螺旋階段＋祭壇
  const rN=plan.rootList.length,rMid=Math.ceil(rN/2);
  phases.push(()=>_wtRoots(plan,0,rMid));
  phases.push(()=>_wtRoots(plan,rMid,rN));
  const bN=plan.branchList.length,bMid=Math.ceil(bN/2);
  phases.push(()=>_wtBranches(plan,0,bMid));
  phases.push(()=>_wtBranches(plan,bMid,bN));
  const clN=plan.leafClumps.length,clStep=Math.max(1,Math.ceil(clN/4));
  for(let s=0;s<clN;s+=clStep){const a=s,b=Math.min(clN,s+clStep);phases.push(()=>_wtCanopy(plan,a,b));}
  phases.push(()=>{_wtVines(plan);_wtDeck(plan);});             // ツタ＋展望台
  phases.push(()=>{_wtSpring(plan);_wtGroundDecor(plan);});     // 泉＋根元の装飾
  // ── フレーム分割で実行 ──
  let idx=0;_deferDirty=true;
  const step=()=>{
    try{
      phases[idx]();idx++;
      _deferDirty=false;flushDirtyChunks();                     // フェーズ毎に段階的に姿を現す
      _wtSetProgress(true,idx/phases.length);
      if(idx<phases.length){_deferDirty=true;requestAnimationFrame(step);}
      else{
        _worldTreeBusy=false;_wtSetProgress(false);showBonus('🌳 世界樹を生成！');
        playTone(392,.14,.1,'triangle');setTimeout(()=>playTone(587,.14,.1,'triangle'),140);setTimeout(()=>playTone(784,.16,.1,'triangle'),300);
      }
    }catch(e){
      console.error('世界樹: 生成中にエラー',e);                // 途中でエラーが起きてもゲーム全体は止めない
      _deferDirty=false;try{flushDirtyChunks();}catch(_){}
      _worldTreeBusy=false;_wtSetProgress(false);showBonus('⚠ 世界樹の生成に失敗しました');
    }
  };
  requestAnimationFrame(step);
}
