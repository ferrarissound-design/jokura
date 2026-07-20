// ============================================================================
// jokura / structures_watchtower.js
// 🗼 プレアデス監視塔 ワンクリック生成
// world.js から分割されたファイルの一部。全スクリプトは index.html の PARTS の
// 順序で <script> として読み込まれ、同一のグローバルスコープを共有する。
// このファイルは world.js（地形・チャンク・ブロック定義）より後、
// structures_registry.js（生成関数を登録テーブルで参照）より前に読み込まれる。
// ============================================================================

// ═══ 🗼 プレアデス監視塔 ワンクリック生成 ═══
// クリエイティブ専用: プレイヤーの前方に「地面から伸びる細い塔＋頂上の台座＋
// 神殿」を一発生成する。外周に沿ってらせん階段が頂上まで続き、実際に登って
// 辿り着ける。賢者の樹庭と同じ共有ヘルパー（put/clr/_frontAnchor/
// _ensureChunksAround/_footprintYBase）を使う。
function generatePleiadesWatchtower(){
  const{cx0,cz0,aim}=_frontAnchor(14); // footprintが小さいので賢者の樹庭より近め
  const R=11;         // チャンク確保・土台高さ算出用（雲装飾の届く範囲まで広め）
  const groundR=8;     // 地上のクリア/整地範囲（台座＋門）
  _ensureChunksAround(cx0,cz0,R,2);
  const towerRock=()=>Math.random()<0.82?1:6; // 石8.2割＋灰岩1.8割（賢者の樹庭と逆比率で差別化）

  _deferDirty=true;
  try{
    const ybase=_footprintYBase(cx0,cz0,R,3);
    const Hshaft=40;                       // シャフトの高さ（ybase+1〜+40）
    const topR=8;                          // 頂上台座の半径（従来6より拡張）
    const platformY=ybase+41,shrineY0=ybase+42,roofY=ybase+45;

    // ─ 0. フットプリントの地形をクリアしてキャップ ─
    for(let dx=-groundR;dx<=groundR;dx++)for(let dz=-groundR;dz<=groundR;dz++){
      const d2=dx*dx+dz*dz;if(d2>groundR*groundR)continue;
      const x=cx0+dx,z=cz0+dz,sh=surfaceHeightAt(x,z);
      for(let y=sh+1;y<ybase;y++)put(x,y,z,1);
      for(let y=ybase+1;y<=roofY+2;y++)clr(x,y,z);
      put(x,ybase,z,0);
    }

    // ─ 1. 土台円盤（半径5、聖地らしい広めの石畳）─
    for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=5;dz++){
      if(dx*dx+dz*dz>25)continue;
      put(cx0+dx,ybase,cz0+dz,1);
    }
    // ─ 1b. 入口の門: 階段の昇り始め方向（aim+π）に石柱2本＋まぐさ石で
    // 簡単な鳥居風の入口を作る。聖地らしさを出す軽いアクセント ─
    {
      const gateAng=aim+Math.PI,ex=Math.cos(gateAng),ez=Math.sin(gateAng);
      const px=-ez,pz=ex; // 進行方向に直交するベクトル（柱の左右オフセット）
      const gr=6;
      for(const side of[-1,1]){
        const gx=Math.round(cx0+ex*gr+px*1.5*side),gz=Math.round(cz0+ez*gr+pz*1.5*side);
        for(let dy=1;dy<=3;dy++)put(gx,ybase+dy,gz,1);
      }
      // まぐさ石: 柱の頂点をつなぐ横木（数点補間して埋める）
      for(let s=-1;s<=1;s+=0.5){
        const gx=Math.round(cx0+ex*gr+px*1.5*s),gz=Math.round(cz0+ez*gr+pz*1.5*s);
        put(gx,ybase+4,gz,1);
      }
    }

    // ─ 2. 細い塔本体（半径2ほど、ゆるいテーパー＋微揺らぎ＋数段のリング装飾）─
    // collarCenters の高さ付近で半径が張り出し、単調な円柱にリング状の段差を作る
    const collarCenters=[10,20,30];
    for(let t=1;t<=Hshaft;t++){
      const baseR=2.2-0.4*(t/Hshaft)+noise(t*.35,0)*0.15;
      let collar=0;
      for(const c of collarCenters)collar=Math.max(collar,Math.max(0,1-Math.abs(t-c)/1.5)*1.1);
      const r=baseR+collar;
      const y=ybase+t;
      for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){
        const d2=dx*dx+dz*dz;if(d2>r*r)continue;
        // リングの張り出し部分だけ灰岩を濃くして、帯として視認しやすくする
        put(cx0+dx,y,cz0+dz,d2>baseR*baseR?6:towerRock());
      }
    }

    // ─ 3. 外周らせん階段: 半径3のリング上を22.5°刻み・1段で1ブロック上昇。
    // 弧長 r*Δθ ≈ 3*(π/8) ≈ 1.18 で隣接段がほぼ連続、40段(2.5周)で頂上へ。
    // プレイヤーの反対側（aim+π）から昇り始め、頂上で祠の入口側に出る。
    const rStair=3,dTheta=Math.PI/8,startAng=aim+Math.PI;
    for(let i=0;i<Hshaft;i++){
      const ang=startAng+i*dTheta,nextAng=startAng+(i+1)*dTheta;
      const x=Math.round(cx0+Math.cos(ang)*rStair),z=Math.round(cz0+Math.sin(ang)*rStair);
      const y=ybase+1+i;
      // 進行方向の接線ベクトルを最近傍4方向へスナップ（doPlaceと同じ式）
      const tx=Math.cos(nextAng)-Math.cos(ang),tz=Math.sin(nextAng)-Math.sin(ang);
      const meta=Math.abs(tx)>Math.abs(tz)?(tx>0?0:2):(tz>0?1:3);
      put(x,y-1,z,1);            // 段の直下に石の支え（浮遊防止）
      put(x,y,z,STAIR_BLOCK,meta);
    }

    // ─ 3b. 塔上部の雲装飾: 台座のすぐ下〜同じ高さ帯を漂う小さな雲の塊を
    // 数個配置して高所感を強める（台座・階段には接触しない外側の空中）
    const nClouds=4+Math.floor(Math.random()*2);
    for(let ci=0;ci<nClouds;ci++){
      const ca=Math.random()*Math.PI*2,cr=8.5+Math.random()*1.8;
      const ccx=Math.round(cx0+Math.cos(ca)*cr),ccz=Math.round(cz0+Math.sin(ca)*cr);
      const ccy=platformY-Math.floor(Math.random()*7);
      const cloudCells=[[0,0],[1,0],[-1,0],[0,1],[0,-1]];
      for(const[dx,dz]of cloudCells)if(Math.random()<0.85)put(ccx+dx,ccy,ccz+dz,WOOL_BLOCK);
    }

    // ─ 4. 頂上の台座（半径8に拡張、縁にスラブの縁石）─
    for(let dx=-topR;dx<=topR;dx++)for(let dz=-topR;dz<=topR;dz++){
      const d2=dx*dx+dz*dz;if(d2>topR*topR)continue;
      const x=cx0+dx,z=cz0+dz;
      if(d2>(topR-1)*(topR-1))put(x,platformY,z,SLAB_BLOCK,0);
      else put(x,platformY,z,1);
    }

    // ─ 5. 頂上の神殿（柱4本＋屋根を拡大、遠くからも見えやすく）─
    for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
      const edge=Math.max(Math.abs(dx),Math.abs(dz))===3;
      if(!edge)continue;
      if(dz===3&&Math.abs(dx)<=1)continue; // 入口
      for(let dy=1;dy<=3;dy++)put(cx0+dx,shrineY0-1+dy,cz0+dz,3);
    }
    for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){
      if(Math.abs(dx)===4&&Math.abs(dz)===4)continue; // 角を落とした屋根
      put(cx0+dx,roofY,cz0+dz,4);
    }
    put(cx0-2,shrineY0+1,cz0-2,TORCH_BLOCK);
    put(cx0+2,shrineY0+1,cz0+2,TORCH_BLOCK);
  }finally{
    _deferDirty=false;flushDirtyChunks();
  }
  showBonus('🗼 プレアデス監視塔を生成！');
  playTone(660,.12,.1,'triangle');setTimeout(()=>playTone(990,.12,.1,'triangle'),120);
}
