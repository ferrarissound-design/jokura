// ============================================================================
// jokura / structures_sky_temple.js
// 🏝 空中神殿 ワンクリック生成
// world.js から分割されたファイルの一部。全スクリプトは index.html の PARTS の
// 順序で <script> として読み込まれ、同一のグローバルスコープを共有する。
// このファイルは world.js（地形・チャンク・ブロック定義）より後、
// structures_registry.js（生成関数を登録テーブルで参照）より前に読み込まれる。
// ============================================================================

// ═══ 🏝 空中神殿 ワンクリック生成 ═══
// クリエイティブ専用: プレイヤーの前方かつ上空に「浮遊島＋中央の八角神殿」を
// 一発生成する。地表とは完全に分離した空中に浮くのが特徴で、遠景でも「空に神殿が
// 浮いている」シルエットを最優先にした。島は上面が平らで下面は逆三角形の岩塊。
// 賢者の樹庭・監視塔と同じ共有ヘルパー（put/clr/_frontAnchor/_ensureChunksAround/
// _footprintYBase）を使う。MVPとして直径24（R=12）に抑えている。
function generateSkyTemple(){
  const{fx,fz,cx0,cz0,aim}=_frontAnchor(20);
  const R=12;                       // 島の半径（直径24, MVPの上限）
  _ensureChunksAround(cx0,cz0,R,8); // 周囲の浮遊岩まで届く広めのパッド
  const rock=()=>Math.random()<0.75?1:6; // 石7.5割＋灰岩2.5割のまだら岩

  _deferDirty=true; // 数千ブロックの一括編集: チャンク再構築は最後に1回ずつ
  try{
    const ybase=_footprintYBase(cx0,cz0,R,5);
    const topY=ybase+16;            // 島の上面（地表から16ブロック浮遊）
    const coneDepth=9;              // 下面の逆三角形（円錐）の深さ

    // ─ 1. 浮遊島本体: 上面は平らな円盤、下面は逆三角形の岩塊 ─
    // 縁はノイズでギザギザにして、遠景シルエットを岩島らしく見せる。
    for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
      const d=Math.hypot(dx,dz);
      const edge=R-0.6+noise(dx*.25,dz*.25)*1.3; // 有機的な外周
      if(d>edge)continue;
      const x=cx0+dx,z=cz0+dz;
      put(x,topY,z,0);   // 平らな草の上面
      put(x,topY-1,z,1); // 直下は土台石
    }
    // 逆三角形の岩塊: 下へ行くほど半径を直線的に絞り、先端は一点に収束させる
    for(let t=1;t<=coneDepth;t++){
      const rr=R*(1-t/coneDepth)+noise(t*.4,0)*0.8;
      const y=topY-1-t;
      for(let dx=-Math.ceil(rr);dx<=Math.ceil(rr);dx++)for(let dz=-Math.ceil(rr);dz<=Math.ceil(rr);dz++){
        if(dx*dx+dz*dz>rr*rr)continue;
        put(cx0+dx,y,cz0+dz,rock());
      }
    }
    const tipY=topY-1-coneDepth;    // 円錐の先端（滝の起点）

    // ─ 2. 中央神殿: 石畳＋八角形の石柱8本＋レンガ屋根＋中央祭壇 ─
    const plazaR=5,pillarH=4;
    const pillarY0=topY+1,roofY=pillarY0+pillarH; // 柱 topY+1..+4 / 屋根 topY+5
    // 石畳（縁はスラブで一段落とす）
    for(let dx=-plazaR;dx<=plazaR;dx++)for(let dz=-plazaR;dz<=plazaR;dz++){
      const d2=dx*dx+dz*dz;if(d2>plazaR*plazaR)continue;
      const x=cx0+dx,z=cz0+dz;
      if(d2>(plazaR-1)*(plazaR-1))put(x,topY,z,SLAB_BLOCK,0);
      else put(x,topY,z,1);
    }
    // 八角形に石柱8本（半径4のリング。aim基準で入口側が揃う）
    const pilR=4,nPil=8;
    for(let i=0;i<nPil;i++){
      const a=aim+i*Math.PI*2/nPil;
      const px=Math.round(cx0+Math.cos(a)*pilR),pz=Math.round(cz0+Math.sin(a)*pilR);
      for(let dy=0;dy<pillarH;dy++)put(px,pillarY0+dy,pz,1);
    }
    // 屋根: レンガの八角錐（下段 半径5 → 上段 半径3 → 頂部）で神殿感を出す
    for(let dx=-plazaR;dx<=plazaR;dx++)for(let dz=-plazaR;dz<=plazaR;dz++){
      if(dx*dx+dz*dz>plazaR*plazaR)continue;
      put(cx0+dx,roofY,cz0+dz,4);
    }
    for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
      if(dx*dx+dz*dz>9)continue;
      put(cx0+dx,roofY+1,cz0+dz,4);
    }
    put(cx0,roofY+2,cz0,4); // 屋根の頂点
    // 中央祭壇: 石台＋スラブ＋発光する水晶の御神体（屋根の下で光る）
    put(cx0,topY+1,cz0,1);
    put(cx0,topY+2,cz0,SLAB_BLOCK,0);
    put(cx0,topY+3,cz0,CRYSTAL_BLOCK);
    // 入口の松明（プレイヤー側の柱間に1本）
    {
      const ex=Math.round(cx0+Math.cos(aim)*(plazaR-1)),ez=Math.round(cz0+Math.sin(aim)*(plazaR-1));
      if(!voxels[vKey(ex,topY+1,ez)])put(ex,topY+1,ez,TORCH_BLOCK);
    }

    // ─ 3. 島縁の小さな木と草 ─
    for(let i=0;i<3;i++){
      const a=aim+Math.PI*(0.6+i*0.7)+Math.random()*0.4,tr=R-3;
      const tx=Math.round(cx0+Math.cos(a)*tr),tz=Math.round(cz0+Math.sin(a)*tr);
      const th=2+Math.floor(Math.random()*2);
      for(let dy=1;dy<=th;dy++)put(tx,topY+dy,tz,3); // 幹
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)put(tx+dx,topY+th+1,tz+dz,LEAF_BLOCK);
      put(tx,topY+th+2,tz,LEAF_BLOCK); // 樹冠の頭
    }
    // 草（低い葉のクランプ）を上面に点在。神殿や幹が既にあるセルは避ける
    for(let i=0;i<12;i++){
      const a=Math.random()*Math.PI*2,gr=(R-2)*Math.sqrt(Math.random());
      const gx=Math.round(cx0+Math.cos(a)*gr),gz=Math.round(cz0+Math.sin(a)*gr);
      if(voxels[vKey(gx,topY,gz)]&&!voxels[vKey(gx,topY+1,gz)])put(gx,topY+1,gz,LEAF_BLOCK);
    }

    // ─ 4. 下面から短い滝と垂れ蔦 ─
    // 滝: 円錐先端から水を2〜4段（この世界の水は静的ブロックなので柱として垂れる）
    const wl=2+Math.floor(Math.random()*3);
    for(let d=0;d<wl;d++)put(cx0,tipY-1-d,cz0,WATER_BLOCK);
    // 蔦: 島の底縁（上面直下）から葉を2〜5段、空中セルにだけ垂らす
    for(let i=0;i<14;i++){
      const a=Math.random()*Math.PI*2;
      const vx=Math.round(cx0+Math.cos(a)*(R-1)),vz=Math.round(cz0+Math.sin(a)*(R-1));
      if(!voxels[vKey(vx,topY-1,vz)])continue; // 島の底がある縁のみ
      const len=2+Math.floor(Math.random()*4);
      for(let d=1;d<=len;d++){
        if(voxels[vKey(vx,topY-1-d,vz)])break; // 岩に当たったら止める
        put(vx,topY-1-d,vz,LEAF_BLOCK);
      }
    }

    // ─ 5. 周囲の小さな浮遊岩 4〜6個（島の高度帯にばらつかせる）─
    const nRock=4+Math.floor(Math.random()*3);
    for(let i=0;i<nRock;i++){
      const a=aim+i*Math.PI*2/nRock+Math.random()*0.6;
      const dist=R+2+Math.random()*3;
      const rx=Math.round(cx0+Math.cos(a)*dist),rz=Math.round(cz0+Math.sin(a)*dist);
      const ry=topY-3+Math.floor(Math.random()*8)-2;
      const br=1+Math.random()*1.2;
      for(let dx=-2;dx<=2;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-2;dz<=2;dz++){
        if(dx*dx+dy*dy*1.5+dz*dz>br*br)continue;
        put(rx+dx,ry+dy,rz+dz,rock());
      }
    }
  }finally{
    _deferDirty=false;flushDirtyChunks();
  }
  showBonus('🏝 空中神殿を生成！');
  playTone(587,.12,.1,'triangle');setTimeout(()=>playTone(880,.12,.1,'triangle'),120);
}
