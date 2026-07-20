// ============================================================================
// jokura / structures_sage_garden.js
// 🏔 賢者の樹庭 ワンクリック生成
// world.js から分割されたファイルの一部。全スクリプトは index.html の PARTS の
// 順序で <script> として読み込まれ、同一のグローバルスコープを共有する。
// このファイルは world.js（地形・チャンク・ブロック定義）より後、
// structures_registry.js（生成関数を登録テーブルで参照）より前に読み込まれる。
// ============================================================================

// ═══ 🏔 賢者の樹庭 ワンクリック生成 ═══
// クリエイティブ専用: プレイヤーの前方に「岩の尖塔群＋頂上アーチ＋巨木＋池」を
// 一発生成する。結果は worldEdits に記録されるため、通常の建築と同じくセーブ・
// チャンク再訪で復元される（形は押すたびに Math.random() で変わってよい）。
function generateSageGarden(){
  const{fx,fz,cx0,cz0,aim}=_frontAnchor(20);
  const R=13;                      // 土台の半径（直径27 ≒ 3×3チャンクに収まる）
  _ensureChunksAround(cx0,cz0,R,2);
  const rock=()=>Math.random()<0.8?6:1; // 灰岩8割＋石2割のまだら模様

  _deferDirty=true; // 数千ブロックの一括編集: チャンク再構築は最後に1回ずつ
  try{
    const ybase=_footprintYBase(cx0,cz0,R,5);
    const yTop=ybase+30; // モバイルのフォグ far(≈47)より下に収める

    // ─ 1. 草の土台: 低い列は石で盛り、丘や木は ybase で切って草でフタをする ─
    for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
      const d2=dx*dx+dz*dz;if(d2>R*R)continue;
      const x=cx0+dx,z=cz0+dz;
      const sh=surfaceHeightAt(x,z);
      // 低地の縁だけギザギザに（丘の列をスキップすると池の上に丘が残るため）
      if(sh<ybase&&d2>(R-1.5)*(R-1.5)&&Math.random()<0.35)continue;
      for(let y=sh+1;y<ybase;y++)put(x,y,z,1);
      // ybase より上の既存物（木・丘の表面・岩柱・サボテン等）を一掃してから草でフタ。
      // put が ybase セルを必ず実体化するので、丘の非voxel内部の上に穴は残らない
      for(let y=ybase+1;y<=yTop+4;y++)clr(x,y,z);
      put(x,ybase,z,0);
    }

    // ─ 2. 尖塔 5〜7本（リング配置。±90°の2本が最も高い「アーチ塔」）─
    const nSp=5+Math.floor(Math.random()*3);
    const spires=[];
    const archTops=[];                    // アーチ塔の頂部 [x,y,z]
    for(let i=0;i<nSp;i++){
      const isArch=i<2;
      // アーチ塔は視線の左右±90°: プレイヤーから見て門になる
      const ang=isArch?aim+(i===0?1:-1)*Math.PI/2+(Math.random()-.5)*.3
                      :aim+Math.PI*(0.25+1.5*Math.random());
      const r=8+Math.random()*3;
      // リーン弱め: 頂部が門の真上からずれてゲートが崩れるのを防ぐ＋どっしり感
      const leanAmp=isArch?.12:.24;
      spires.push({
        bx:cx0+Math.cos(ang)*r,bz:cz0+Math.sin(ang)*r,
        // アーチ全体が画面に収まるよう主塔・アーチをやや低めに
        H:Math.round(isArch?20+Math.random()*3:11+Math.random()*8),
        r0:2.8+Math.random()*1.4, // 根元を太く（細い柱ではなく岩山のシルエット）
        leanX:(Math.random()-.5)*leanAmp,leanZ:(Math.random()-.5)*leanAmp,
        isArch,
      });
    }
    for(const s of spires){
      let px=s.bx,pz=s.bz;
      const H=Math.max(6,Math.min(s.H,yTop-ybase));
      for(let t=0;t<=H;t++){
        const y=ybase+t;
        // 根元を膨らませ上部を細くする（岩山型）＋ノイズで有機的な輪郭、
        // リーンの累積でゆるく傾く。baseBulge は下から 35% 区間だけ効く
        const taper=s.r0*(1-0.7*t/H);
        const baseBulge=Math.max(0,1-t/(H*0.35))*s.r0*0.9;
        const rr=Math.max(1,taper+baseBulge+noise(px*.3,t*.4)*.6);
        px+=s.leanX*(Math.random()*.8+.6);pz+=s.leanZ*(Math.random()*.8+.6);
        const cxs=Math.round(px),czs=Math.round(pz);
        for(let dx=-Math.ceil(rr);dx<=Math.ceil(rr);dx++)for(let dz=-Math.ceil(rr);dz<=Math.ceil(rr);dz++){
          if(dx*dx+dz*dz>rr*rr)continue;
          put(cxs+dx,y,czs+dz,rock());
        }
        if(t===H&&s.isArch)archTops.push([cxs,y,czs]);
      }
    }

    // ─ 2b. 根元まわりの小岩（岩山の裾）: 塔の足元に自然なボリュームを足す ─
    for(const s of spires){
      const baseR=s.r0*1.9; // 根元の太さ相当（taper+baseBulge の t=0 値）
      const nB=3+Math.floor(Math.random()*3);
      for(let bi=0;bi<nB;bi++){
        const a=Math.random()*Math.PI*2,dist=baseR+0.5+Math.random()*3;
        const bx=Math.round(s.bx+Math.cos(a)*dist),bz=Math.round(s.bz+Math.sin(a)*dist);
        if(Math.hypot(bx-cx0,bz-cz0)>R-1)continue; // 土台内のみ
        const bh=1+Math.floor(Math.random()*3),br=1+Math.random()*0.9;
        for(let tt=0;tt<bh;tt++){
          const rr=Math.max(0,br*(1-tt/bh));
          for(let dx=-Math.ceil(rr);dx<=Math.ceil(rr);dx++)for(let dz=-Math.ceil(rr);dz<=Math.ceil(rr);dz++){
            if(dx*dx+dz*dz>rr*rr+0.3)continue;
            put(bx+dx,ybase+1+tt,bz+dz,rock());
          }
        }
        if(Math.random()<0.4)put(bx,ybase+1+bh,bz,0); // 苔むした天面
      }
    }

    // ─ 3. アーチ: 2本のアーチ塔の頂部を2次ベジェで接続 ─
    if(archTops.length===2){
      const[a,b]=archTops;
      const mx=(a[0]+b[0])/2,my=Math.min((a[1]+b[1])/2+3,yTop),mz=(a[2]+b[2])/2;
      for(let i=0;i<=40;i++){
        const t=i/40,u=1-t;
        const x=u*u*a[0]+2*u*t*mx+t*t*b[0];
        const y=Math.min(u*u*a[1]+2*u*t*my+t*t*b[1],yTop);
        const z=u*u*a[2]+2*u*t*mz+t*t*b[2];
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
          if(dx*dx+dy*dy+dz*dz>2.6)continue; // 半径≈1.6の岩ブロブ
          put(Math.round(x)+dx,Math.round(y)+dy,Math.round(z)+dz,rock());
        }
      }
    }

    // ─ 4. レッジ（緑の棚）と苔、垂れ下がる蔦 ─
    const vines=[]; // 蔦の起点候補 [x,y,z]
    for(const s of spires){
      const H=Math.max(6,Math.min(s.H,yTop-ybase));
      const nL=2+Math.floor(Math.random()*2);
      // レッジは「外向き」に張り出す: 内向きに出すと中央の巨木が緑の壁で隠れる
      const outward=Math.atan2(s.bz-cz0,s.bx-cx0);
      for(let li=0;li<nL;li++){
        const t=Math.floor(H*(0.35+0.45*Math.random()));
        const y=ybase+t;
        const rr=Math.max(1,s.r0*(1-0.7*t/H))+2;
        const face=outward+(Math.random()-.5)*1.6;
        const lx=Math.round(s.bx+s.leanX*t),lz=Math.round(s.bz+s.leanZ*t);
        for(let dx=-Math.ceil(rr);dx<=Math.ceil(rr);dx++)for(let dz=-Math.ceil(rr);dz<=Math.ceil(rr);dz++){
          const d2=dx*dx+dz*dz;if(d2>rr*rr)continue;
          // 半円: face 方向の半分だけ張り出す
          if(Math.cos(Math.atan2(dz,dx)-face)<-0.1)continue;
          const x=lx+dx,z=lz+dz;
          put(x,y,z,rock());
          put(x,y+1,z,0); // 上面は草
          if(Math.random()<0.25)put(x,y+2,z,LEAF_BLOCK); // 葉のクランプ
          if(d2>(rr-1.3)*(rr-1.3))vines.push([x,y,z]); // 縁は蔦の起点候補
        }
      }
      // 塔の側面の苔（ざっくり: 塔に沿って低確率で葉を貼る）
      for(let t=2;t<H;t++){
        if(Math.random()>=0.3)continue;
        const y=ybase+t;
        const rr=Math.max(1,s.r0*(1-0.7*t/H));
        const a=Math.random()*Math.PI*2;
        const x=Math.round(s.bx+s.leanX*t+Math.cos(a)*(rr+1)),z=Math.round(s.bz+s.leanZ*t+Math.sin(a)*(rr+1));
        if(!voxels[vKey(x,y,z)])put(x,y,z,LEAF_BLOCK);
      }
    }
    // 蔦: レッジ縁から下へ 2〜6 ブロック垂らす（空中のみ）
    for(const[x,y,z]of vines){
      if(Math.random()>=0.3)continue;
      const len=2+Math.floor(Math.random()*5);
      for(let d=1;d<=len;d++){
        if(voxels[vKey(x,y-d,z)])break;
        put(x,y-d,z,LEAF_BLOCK);
      }
    }

    // ─ 5. 巨木（御神木）: 中央に太い幹＋斜め枝＋大きな楕円体の樹冠 ─
    const TH=13+Math.floor(Math.random()*4);
    for(let t=1;t<=TH;t++){
      // 下 2/3 は 3×3 の太い幹、上部は 2×2 に絞って自然にすぼめる
      const wide=t<=TH*0.66;
      for(let dx=(wide?-1:0);dx<=1;dx++)for(let dz=(wide?-1:0);dz<=1;dz++)
        put(cx0+dx,ybase+t,cz0+dz,3);
    }
    const canY=ybase+TH;
    for(let bi=0;bi<4;bi++){ // 枝: 4方向へ斜め上に伸びる
      const ba=Math.PI/4+bi*Math.PI/2+(Math.random()-.5)*.5;
      let bx=cx0+.5,bz=cz0+.5,by=canY-4-Math.floor(Math.random()*2);
      for(let st=0;st<5;st++){
        bx+=Math.cos(ba);bz+=Math.sin(ba);by+=(st%2===0)?1:0;
        put(Math.round(bx),by,Math.round(bz),3);
      }
    }
    const rxz=6,ry=3.8;
    for(let dx=-rxz-1;dx<=rxz+2;dx++)for(let dy=-Math.ceil(ry);dy<=Math.ceil(ry);dy++)for(let dz=-rxz-1;dz<=rxz+2;dz++){
      const nx=dx/rxz,nyv=dy/ry,nz=dz/rxz;
      if(nx*nx+nyv*nyv+nz*nz>1+(Math.random()-.5)*.3)continue; // 15%ジッタ
      const x=cx0+dx,y=canY+dy,z=cz0+dz;
      if(y>yTop+3)continue;
      if(!voxels[vKey(x,y,z)])put(x,y,z,LEAF_BLOCK);
      // 樹冠の縁から蔦
      if(dy<=0&&Math.random()<0.06&&nx*nx+nz*nz>0.55){
        const len=2+Math.floor(Math.random()*4);
        for(let d=1;d<=len;d++){
          if(voxels[vKey(x,y-d,z)])break;
          put(x,y-d,z,LEAF_BLOCK);
        }
      }
    }

    // ─ 6. 池: プレイヤー寄りに水面＋砂の縁＋岩ボルダー ─
    // 地面(ybase)を1段だけ除去して砂の底を「明示的に」敷く: 地表生成は露出セル
    // しか voxel 化しないため、掘りっぱなしだと不可視の穴になる
    const pondX=Math.round(cx0-fx*5),pondZ=Math.round(cz0-fz*5),pondR=4+Math.random();
    for(let dx=-7;dx<=7;dx++)for(let dz=-7;dz<=7;dz++){
      const d2=dx*dx+dz*dz;if(d2>(pondR+2)*(pondR+2))continue;
      const x=pondX+dx,z=pondZ+dz;
      if(Math.hypot(x-cx0,z-cz0)>R-1)continue; // 土台の外へはみ出さない
      if(d2<=pondR*pondR){
        put(x,ybase-1,z,2);         // 砂底
        put(x,ybase,z,WATER_BLOCK);  // 水面
      }else if(d2<=(pondR+1)*(pondR+1)){
        put(x,ybase,z,2);           // 砂の内縁（水際をはっきり）
      }else if(Math.random()<0.55){
        put(x,ybase,z,rock());      // 石の外縁でまばらに縁取り
      }
    }
    for(let bi=0;bi<3;bi++){ // 水辺の岩
      const ba=Math.random()*Math.PI*2;
      const x=pondX+Math.round(Math.cos(ba)*(pondR+1.5)),z=pondZ+Math.round(Math.sin(ba)*(pondR+1.5));
      if(Math.hypot(x-cx0,z-cz0)>R-1)continue;
      put(x,ybase+1,z,rock());
      if(Math.random()<0.5)put(x,ybase+2,z,rock());
    }
  }finally{
    _deferDirty=false;flushDirtyChunks();
  }
  showBonus('🏔 賢者の樹庭を生成！');
  playTone(520,.12,.1,'triangle');setTimeout(()=>playTone(780,.12,.1,'triangle'),120);
}
