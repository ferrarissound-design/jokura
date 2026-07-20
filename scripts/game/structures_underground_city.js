// ============================================================================
// jokura / structures_underground_city.js
// 🏛 封印された地底都市 生成＋封印解除イベント
// world.js から分割されたファイルの一部。全スクリプトは index.html の PARTS の
// 順序で <script> として読み込まれ、同一のグローバルスコープを共有する。
// このファイルは world.js（地形・チャンク・ブロック定義）より後、
// structures_registry.js（生成関数を登録テーブルで参照）より前に読み込まれる。
// ============================================================================

// ═══ 🏛 封印された地底都市 ワンクリック生成 ═══
// クリエイティブ専用: 地上には小さな石造りの遺跡入口だけが現れ、その真下の
// 地下深く（y-11〜-25）に巨大な空洞と半壊した古代都市が埋まっている特殊生成。
// 「入口を見つける → 螺旋通路で降りる → 巨大空洞と都市を発見する → 中央神殿へ
// → 封印装置を解除する」という段階的な探索を軸に、封印解除で神殿と都市の灯りが
// 点灯し、神殿最奥の隠し扉が開いて特別な宝箱が現れ、最後に隠しボス「地底王」が
// 目覚める。ブロックは put/clr（worldEdits）で永続化され、状態（生成座標・解除・
// 隠し扉・ボス撃破）はセーブデータの undergroundCity フィールドに保存される。
// 賢者の樹庭〜時間が止まった村と同じ共有ヘルパー（put/clr/_frontAnchor/
// _ensureChunksAround/_footprintYBase/_wtRng/_wtHash/ftvShake/_ftvGlowSprite）を
// 使い、requestAnimationFrame でフェーズ分割して処理落ちを避ける。
//
// 地下チャンクの描画は既定では「プレイヤーの階層以下」しか表示されないため、
// この都市の範囲だけは updateChunks から _sucEnsureChunks/_sucShowChunks が
// 呼ばれ、空洞の天井や建物上部が欠けないよう全階層を生成・表示する。
// ── 調整用パラメータ（空洞の大きさ・家の数・封印耐久・演出速度）──
const SEALED_CITY_CFG={
  anchorDist:46,       // プレイヤー前方の生成距離（都市中心の目安）
  cavernR:23,          // 地下空洞の基準半径（角度ノイズで約0.7〜1.03倍に揺らぐ）
  floorY:-25,          // 空洞の床ブロックY（歩行面は floorY+1 = -24）
  topY:-11,            // 空洞天井の最高点（中心部の内側上端。地表まで岩10層を確保）
  houseSlots:9,        // 家の配置スロット数（湖・溶岩・門の方角は自動でスキップ）
  pillarCount:5,       // 床から天井まで伸びる巨大石柱の本数
  stalactiteCount:14,  // 天井から垂れる鍾乳石の本数
  sealHp:3,            // 封印装置の耐久（結晶ブロックを壊す回数。接触でも解除できる）
  releaseStepMs:700,   // 封印解除演出の1段階の間隔（ms）
};
// 実行時状態（生成済みならセーブへも記録される）。null=都市なし
let undergroundCity=null;
let _sucBusy=false; // 生成中フラグ（ボタン連打による多重生成を防ぐ）

// 生成進捗オーバーレイ（世界樹のものを流用。ラベルだけ差し替えて使い終わりに戻す）
function _sucSetProgress(show,frac){
  const el=document.getElementById('worldTreeProgress');if(!el)return;
  const lbl=document.getElementById('wtpLabel');
  el.style.display=show?'':'none';
  if(show){if(lbl)lbl.textContent='🏛 封印された地底都市を生成中…';const fill=document.getElementById('wtpFill');if(fill)fill.style.width=Math.round((frac||0)*100)+'%';}
  else if(lbl)lbl.textContent='🌳 世界樹を生成中…';
}

// ── 幾何ヘルパー ──
function _sucAngDiff(a,b){return Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));}
function _sucSeed(cx,cz){return((WORLD_SEED^(cx*73856093)^(cz*19349663)^0xac1d)>>>0)||1;}
function _sucCorridorR(){return Math.ceil(SEALED_CITY_CFG.cavernR*1.05)+5;}
// 空洞の半径（角度ごとにうねる有機的な輪郭）
function _sucRad(plan,ang){
  return plan.cfg.cavernR*(0.84+0.12*Math.sin(3*ang+plan.ph1)+0.07*Math.sin(5*ang+plan.ph2));
}
function _sucInside(plan,dx,dz){
  const d=Math.hypot(dx,dz);
  return d<=_sucRad(plan,Math.atan2(dz,dx));
}
// 空洞の局所天井高（中央が高いドーム。崩落区域はさらに垂れ下がる）
function _sucCeil(plan,dx,dz){
  const ang=Math.atan2(dz,dx);
  const u=Math.min(1,Math.hypot(dx,dz)/Math.max(4,_sucRad(plan,ang)));
  let c=plan.cfg.topY-Math.round(6*u*u);
  if(_sucAngDiff(ang,plan.collA)<0.5)c-=3;
  return c;
}
// ── ブロックの質感ミックス ──
function _sucFloorTi(x,z){ // 洞窟の床: 石・灰岩・深石に土と石炭のシミ
  const h=_wtHash((x*73856093)^(z*83492791)^0x9e37);
  if(h<0.05)return CAVE_DIRT;
  if(h<0.08)return COAL_ORE;
  if(h<0.3)return DEEP_STONE;
  if(h<0.62)return 6;
  return 1;
}
function _sucRockTi(x,y,z,glow){ // 壁・天井の岩盤。glow=trueで光る鉱石をまばらに混ぜる
  const h=_wtHash((x*73856093)^(y*19349663)^(z*83492791));
  if(glow){if(h<0.028)return CRYSTAL_BLOCK;if(h<0.048)return DIAMOND_ORE;}
  if(h<0.45)return DEEP_STONE;
  if(h<0.82)return 6;
  return 1;
}
function _sucWallTi(x,y,z){ // 石造りの建物: 石＋灰岩＋深石＋風化した漆喰のまだら
  const h=_wtHash((x*53)^(y*97)^(z*193));
  if(h<0.5)return 1;
  if(h<0.85)return 6;
  if(h<0.93)return DEEP_STONE;
  return CLAY_BLOCK;
}
// ── 宝箱（既存の underTreasures 宝箱システムを流用、type3=豪華報酬）──
function _sucPlaceChest(wx,wy,wz){
  const tk=vKey(wx,wy,wz);if(underTreasures[tk])return;
  put(wx,wy-1,wz,1);clr(wx,wy,wz);clr(wx,wy+1,wz);
  const mesh=_makeTreasureMesh(3);mesh.position.set(wx+.5,wy,wz+.5);
  if(!openedTreasureKeys.has(tk))scene.add(mesh);
  underTreasures[tk]={mesh,opened:openedTreasureKeys.has(tk),type:3,struct:'sealedUndergroundCity'};
}

// ── 候補地探索: 入口（都市中心からプレイヤー側へ張り出した点）が「湖でない・
// 既存の地上構造物から離れている・比較的平坦」になる中心を選ぶ ──
function _sucSiteFor(cx,cz){
  const crR=_sucCorridorR();
  const entA=Math.atan2(P.z-cz,P.x-cx); // 入口はプレイヤー側を向く（発見しやすい）
  return{cx,cz,ex:Math.round(cx+Math.cos(entA)*crR),ez:Math.round(cz+Math.sin(entA)*crR)};
}
function _sucFindSite(anchor){
  const crR=_sucCorridorR();
  const cands=[[0,0]];
  for(let ring=1;ring<=2;ring++)for(let a=0;a<8;a++){
    const ang=a*Math.PI/4;
    cands.push([Math.round(Math.cos(ang)*ring*14),Math.round(Math.sin(ang)*ring*14)]);
  }
  let best=null,bestScore=Infinity;
  for(const[ox,oz]of cands){
    const cx=anchor.cx0+ox,cz=anchor.cz0+oz;
    if(Math.hypot(cx-P.x,cz-P.z)<crR+12)continue;       // 入口がプレイヤーに被らない
    const s=_sucSiteFor(cx,cz);
    if(getHeight(s.ex,s.ez)<1)continue;                  // 入口が湖に沈まない
    if(_ftvNearStruct(s.ex,s.ez,16))continue;            // 既存の地上構造物を避ける
    if(_ftvNearStruct(cx,cz,10))continue;
    let hmin=Infinity,hmax=-Infinity,ok=true;
    for(let dx=-5;dx<=5&&ok;dx+=2)for(let dz=-5;dz<=5;dz+=2){
      const h=getHeight(s.ex+dx,s.ez+dz);
      if(h<1){ok=false;break;}
      if(h<hmin)hmin=h;if(h>hmax)hmax=h;
    }
    if(!ok)continue;
    const score=(hmax-hmin)+Math.hypot(ox,oz)*0.04;      // 入口周辺の平坦さ優先
    if(score<bestScore){bestScore=score;best=s;}
  }
  return best;
}

// ── 設計図: 全レイアウトを決定的に決める。ロード時も同じシード＋保存座標から
// この関数を再実行して封印装置・宝箱・照明などの位置を復元する（ブロック自体は
// worldEdits が復元するので、ここでは put しない）──
function _sucPlan(rng,site){
  const cfg=SEALED_CITY_CFG,fY=cfg.floorY,yW=fY+1;
  const entA=Math.atan2(site.ez-site.cz,site.ex-site.cx);
  const plan={
    cfg,cx:site.cx,cz:site.cz,ex:site.ex,ez:site.ez,ybase:site.ybase,entA,rng,
    corridorR:_sucCorridorR(),
    path:[],gate:[],houses:[],towers:[],pillars:[],stals:[],
    chestSpots:[],lightSpots:[],cityLights:[],lampSpots:[],mobSpots:[],doorCells:[],
  };
  plan.ph1=rng()*Math.PI*2;plan.ph2=rng()*Math.PI*2;
  plan.dirSign=rng()<0.5?1:-1;
  // 降下通路: 空洞の外周を旋回しながら1マスごとに1段降りる（seed から決定的）
  {
    let px=null,pz=null,y=site.ybase-1;
    plan.gateA=entA;
    for(let i=0;i<600&&y>=fY;i++){
      const ang=entA+plan.dirSign*(i/plan.corridorR);
      const x=Math.round(site.cx+Math.cos(ang)*plan.corridorR);
      const z=Math.round(site.cz+Math.sin(ang)*plan.corridorR);
      if(x===px&&z===pz)continue;
      plan.path.push({x,y,z});px=x;pz=z;plan.gateA=ang;
      y--;
    }
  }
  // 城門トンネル: 通路の終点から空洞内部へ水平に貫通する
  {
    const gr=_sucRad(plan,plan.gateA);
    for(let rr=plan.corridorR;rr>=gr-4;rr--){
      plan.gate.push({
        x:Math.round(site.cx+Math.cos(plan.gateA)*rr),
        z:Math.round(site.cz+Math.sin(plan.gateA)*rr),
      });
    }
  }
  // 特徴区域の方角（門を基準に重ならないよう配置）
  plan.lakeA=plan.gateA+plan.dirSign*(2.1+rng()*0.5);
  plan.lavaA=plan.gateA-plan.dirSign*(1.9+rng()*0.5);
  plan.collA=plan.gateA+Math.PI+(rng()-0.5)*0.6;
  // 家: 角度スロットに割り当て、湖・溶岩・門の方角はスキップ（高さ・幅・壊れ方に変化）
  {
    const a0=rng()*Math.PI*2;
    for(let i=0;i<cfg.houseSlots;i++){
      const ang=a0+i*(Math.PI*2/cfg.houseSlots)+(rng()-.5)*.3;
      const d=11.5+rng()*4.5;
      const hw=rng()<0.4?3:2;
      const h=3+Math.floor(rng()*3);
      const dmg=0.06+rng()*0.42;
      if(_sucAngDiff(ang,plan.gateA)<0.5||_sucAngDiff(ang,plan.lakeA)<0.62||_sucAngDiff(ang,plan.lavaA)<0.5)continue;
      plan.houses.push({x:Math.round(site.cx+Math.cos(ang)*d),z:Math.round(site.cz+Math.sin(ang)*d),hw,h,dmg});
    }
  }
  // 塔: 1本は健在（頂に残光の水晶）、1本は折れて瓦礫
  for(const off of[1.15,-2.5]){
    const ang=plan.gateA+off+(rng()-.5)*.2,d=17+rng()*1.5;
    plan.towers.push({x:Math.round(site.cx+Math.cos(ang)*d),z:Math.round(site.cz+Math.sin(ang)*d),H:off>0?9:4,broken:off<0});
  }
  // 巨大石柱と鍾乳石
  {
    const p0=rng()*Math.PI*2;
    for(let i=0;i<cfg.pillarCount;i++){
      const ang=p0+i*(Math.PI*2/cfg.pillarCount)+(rng()-.5)*.4,d=9.5+rng()*7;
      const px=Math.round(site.cx+Math.cos(ang)*d),pz=Math.round(site.cz+Math.sin(ang)*d);
      const r=1.4+rng()*0.7;
      if(_sucAngDiff(ang,plan.gateA)<0.35)continue; // 門前の導線を塞がない
      plan.pillars.push({x:px,z:pz,r});
    }
    for(let i=0;i<cfg.stalactiteCount;i++){
      const ang=rng()*Math.PI*2,d=rng()*cfg.cavernR*0.85,len=2+Math.floor(rng()*4);
      plan.stals.push({x:Math.round(site.cx+Math.cos(ang)*d),z:Math.round(site.cz+Math.sin(ang)*d),len});
    }
  }
  // 中央神殿の正面は門の方角（壁を綺麗に保つため4方位へ丸める）
  {
    const c=Math.cos(plan.gateA),s=Math.sin(plan.gateA);
    if(Math.abs(c)>=Math.abs(s)){plan.tFx=c>=0?1:-1;plan.tFz=0;}
    else{plan.tFx=0;plan.tFz=s>=0?1:-1;}
  }
  // 封印装置: 神殿中央、祭壇の上に浮かぶ結晶（この3ブロックが耐久を共有する）
  plan.seal={x:site.cx,y:-18,z:site.cz};
  plan.sealBlocks=[
    {x:site.cx,y:-19,z:site.cz,ti:CRYSTAL_BLOCK},
    {x:site.cx,y:-18,z:site.cz,ti:DIAMOND_ORE},
    {x:site.cx,y:-17,z:site.cz,ti:CRYSTAL_BLOCK},
  ];
  // 隠し部屋（神殿最奥）: 封印中は扉が DEEP_STONE で閉ざされている
  {
    const rx=-plan.tFx,rz=-plan.tFz;
    plan.hiddenChest={x:site.cx+rx*8,y:-21,z:site.cz+rz*8};
    for(const dd of[5,6])for(const l of[0,1])for(const y of[-21,-20]){
      plan.doorCells.push({x:site.cx+rx*dd+(rz!==0?l:0),y,z:site.cz+rz*dd+(rx!==0?l:0)});
    }
  }
  // 神殿の照明（封印解除で点灯するたいまつ台）
  plan.lightSpots.push(
    {x:site.cx+3,y:-17,z:site.cz-3},{x:site.cx-3,y:-17,z:site.cz+3},         // 内柱の上
    {x:site.cx+plan.tFx*6+(plan.tFz!==0?3:0),y:-21,z:site.cz+plan.tFz*6+(plan.tFx!==0?3:0)},   // 正面ポーチ
    {x:site.cx+plan.tFx*6-(plan.tFz!==0?3:0),y:-21,z:site.cz+plan.tFz*6-(plan.tFx!==0?3:0)},
    {x:site.cx+8,y:-22,z:site.cz+8},{x:site.cx-8,y:-22,z:site.cz+8},          // 基壇の四隅
    {x:site.cx+8,y:-22,z:site.cz-8},{x:site.cx-8,y:-22,z:site.cz-8},
    {x:site.cx+plan.tFx*4+(plan.tFz!==0?2:0),y:-21,z:site.cz+plan.tFz*4+(plan.tFx!==0?2:0)},   // 扉の内側
    {x:site.cx+plan.tFx*4-(plan.tFz!==0?2:0),y:-21,z:site.cz+plan.tFz*4-(plan.tFx!==0?2:0)},
  );
  // 都市の街灯（台座は生成時に置き、たいまつは封印解除で点灯）
  for(const hd of plan.houses.slice(0,6)){
    const dxc=site.cx-hd.x,dzc=site.cz-hd.z;
    let dx=0,dz=0;
    if(Math.abs(dxc)>=Math.abs(dzc))dx=dxc>0?1:-1;else dz=dzc>0?1:-1;
    plan.cityLights.push({x:hd.x+dx*(hd.hw+2),y:yW+1,z:hd.z+dz*(hd.hw+2)});
  }
  // 大通り沿いの街灯は道の中心線から垂直方向へ2マス外す（導線を塞がない）
  const gpx=Math.cos(plan.gateA+Math.PI/2),gpz=Math.sin(plan.gateA+Math.PI/2);
  for(const d of[12,16])plan.cityLights.push({
    x:Math.round(site.cx+Math.cos(plan.gateA)*d+gpx*2),y:yW+1,z:Math.round(site.cz+Math.sin(plan.gateA)*d+gpz*2),
  });
  // 常灯の水晶ランプ（生成直後の最低限の視認性）: 広場の四隅＋門の内側＋港
  for(const[ax,az]of[[7,7],[-7,7],[7,-7],[-7,-7]])plan.lampSpots.push({x:site.cx+ax,y:yW+1,z:site.cz+az});
  plan.lampSpots.push({x:Math.round(site.cx+Math.cos(plan.gateA)*(_sucRad(plan,plan.gateA)-5)+gpx*2),y:yW+1,z:Math.round(site.cz+Math.sin(plan.gateA)*(_sucRad(plan,plan.gateA)-5)+gpz*2)});
  // 常灯のたいまつ（生成直後から点いている最低限の明かり。解除後の一斉点灯とは別枠）:
  // 門の内側・大通り・広場の環・港のデッキ
  plan.preTorches=[
    {x:Math.round(site.cx+Math.cos(plan.gateA)*(_sucRad(plan,plan.gateA)-6)-gpx*2),y:yW,z:Math.round(site.cz+Math.sin(plan.gateA)*(_sucRad(plan,plan.gateA)-6)-gpz*2)},
    {x:Math.round(site.cx+Math.cos(plan.gateA)*11-gpx*2),y:yW,z:Math.round(site.cz+Math.sin(plan.gateA)*11-gpz*2)},
    {x:site.cx+10,y:yW,z:site.cz},{x:site.cx-10,y:yW,z:site.cz},
    {x:site.cx,y:yW,z:site.cz+10},{x:site.cx,y:yW,z:site.cz-10},
    {x:Math.round(site.cx+Math.cos(plan.lakeA)*12.5),y:yW+1,z:Math.round(site.cz+Math.sin(plan.lakeA)*12.5)},
  ];
  plan.lampSpots.push({x:Math.round(site.cx+Math.cos(plan.lakeA)*10),y:yW+2,z:Math.round(site.cz+Math.sin(plan.lakeA)*10)});
  // 宝箱: 大通り沿い・港のデッキ・家の中・崩落区域・塔の中
  {
    const ra=plan.gateA+0.5;
    plan.chestSpots.push({x:Math.round(site.cx+Math.cos(ra)*11),y:yW,z:Math.round(site.cz+Math.sin(ra)*11)});
    plan.chestSpots.push({x:Math.round(site.cx+Math.cos(plan.lakeA)*13),y:yW+1,z:Math.round(site.cz+Math.sin(plan.lakeA)*13)+1});
    if(plan.houses[0])plan.chestSpots.push({x:plan.houses[0].x+1,y:yW,z:plan.houses[0].z+1});
    plan.chestSpots.push({x:Math.round(site.cx+Math.cos(plan.collA)*13),y:yW,z:Math.round(site.cz+Math.sin(plan.collA)*13)});
    if(plan.towers[0])plan.chestSpots.push({x:plan.towers[0].x,y:yW,z:plan.towers[0].z});
  }
  // 封印解除で目覚める敵と地底王の出現位置
  for(let i=0;i<3;i++){
    const hd=plan.houses[i];
    plan.mobSpots.push(hd?{x:hd.x+2,z:hd.z-2,idx:[6,7,6][i]}:{x:site.cx+4+i*3,z:site.cz-5,idx:6});
  }
  plan.bossSpot={x:Math.round(site.cx+Math.cos(plan.gateA)*13),z:Math.round(site.cz+Math.sin(plan.gateA)*13)};
  return plan;
}

// ── 地下チャンクの事前生成（1フェーズ=1階層。put の前に必ずチャンクを実体化する）──
function _sucEnsureUnder(plan,cy){
  const half=plan.corridorR+4;
  for(let cx=Math.floor((plan.cx-half)/CHUNK);cx<=Math.floor((plan.cx+half)/CHUNK);cx++)
    for(let cz=Math.floor((plan.cz-half)/CHUNK);cz<=Math.floor((plan.cz+half)/CHUNK);cz++)
      generateUnderChunk(cx,cy,cz);
}

// ── 空洞の掘削（half=-1: 西半分 / +1: 東半分）。地下の岩盤は「露出セルだけ」しか
// voxel 化されないため、掘るだけでは不可視の穴になる。床・天井・側壁を必ず明示的に
// put して殻を実体化する（賢者の樹庭の池と同じイディオム）──
function _sucCavernHalf(plan,half){
  const cfg=plan.cfg,fY=cfg.floorY,yW=fY+1;
  const B=Math.ceil(cfg.cavernR*1.05)+1;
  for(let dx=-B;dx<=B;dx++){
    if(half<0?dx>=0:dx<0)continue;
    for(let dz=-B;dz<=B;dz++){
      if(!_sucInside(plan,dx,dz))continue;
      const x=plan.cx+dx,z=plan.cz+dz;
      const cl=_sucCeil(plan,dx,dz);
      for(let y=yW;y<=cl;y++)clr(x,y,z);       // 内部の空間を空ける
      put(x,fY,z,_sucFloorTi(x,z));             // 床
      // 天井: 隣接列と高さが段差になる場合は側面までフタをする
      let capTop=cl;
      for(const[ox,oz]of[[1,0],[-1,0],[0,1],[0,-1]]){
        if(_sucInside(plan,dx+ox,dz+oz)){const nc=_sucCeil(plan,dx+ox,dz+oz);if(nc>capTop)capTop=nc;}
      }
      for(let y=cl+1;y<=capTop+1;y++)put(x,y,z,_sucRockTi(x,y,z,true));
      // 側壁: 空洞の外側と接する列は床〜天井まで壁を実体化（光る鉱石入り）
      for(const[ox,oz]of[[1,0],[-1,0],[0,1],[0,-1]]){
        if(_sucInside(plan,dx+ox,dz+oz))continue;
        const wx=x+ox,wz=z+oz;
        for(let y=fY;y<=cl+1;y++)put(wx,y,wz,_sucRockTi(wx,y,wz,true));
      }
    }
  }
}

// ── 空洞の装飾: 巨大石柱・鍾乳石・地下湖・滝・溶岩区域・崩落区域・光る植物 ──
function _sucCavernDeco(plan){
  const cfg=plan.cfg,fY=cfg.floorY,yW=fY+1;
  // 巨大石柱（床から天井まで。根元と天井際が太い）
  for(const p of plan.pillars){
    const cl=_sucCeil(plan,p.x-plan.cx,p.z-plan.cz);
    const R=Math.ceil(p.r)+1;
    for(let y=yW;y<=cl;y++){
      const rr=p.r*(1+0.3*Math.max(0,1-(y-yW)/3)+0.3*Math.max(0,1-(cl-y)/3));
      for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
        if(dx*dx+dz*dz>rr*rr)continue;
        put(p.x+dx,y,p.z+dz,_sucRockTi(p.x+dx,y,p.z+dz,false));
      }
    }
  }
  // 鍾乳石（先端がたまに水晶）
  for(const s of plan.stals){
    if(!_sucInside(plan,s.x-plan.cx,s.z-plan.cz))continue;
    const cl=_sucCeil(plan,s.x-plan.cx,s.z-plan.cz);
    for(let d=0;d<s.len;d++)
      put(s.x,cl-d,s.z,d===s.len-1&&_wtHash((s.x*31)^(s.z*17))<0.35?CRYSTAL_BLOCK:DEEP_STONE);
  }
  // 湖・溶岩・崩落・光る植物（セクター別の床の描き分け）
  const lakeIn=11,B=Math.ceil(cfg.cavernR*1.05)+1;
  for(let dx=-B;dx<=B;dx++)for(let dz=-B;dz<=B;dz++){
    if(!_sucInside(plan,dx,dz))continue;
    const d=Math.hypot(dx,dz),ang=Math.atan2(dz,dx);
    const x=plan.cx+dx,z=plan.cz+dz;
    const dl=_sucAngDiff(ang,plan.lakeA);
    if(dl<0.75&&d>=lakeIn){put(x,fY-1,z,2);put(x,fY,z,WATER_BLOCK);continue;} // 地下湖（歩行面より1段低い水面）
    if(dl<0.85&&d>=lakeIn-1){put(x,fY,z,2);continue;}                          // 砂の水際
    if(_sucAngDiff(ang,plan.lavaA)<0.42&&d>=13&&d<=cfg.cavernR-3){             // 溶岩区域（黒曜石の縁）
      const h=_wtHash((x*13)^(z*29));
      if(h<0.3){put(x,fY,z,LAVA_BLOCK);continue;}
      if(h<0.55){put(x,fY,z,OBSIDIAN_BLOCK);continue;}
    }
    if(_sucAngDiff(ang,plan.collA)<0.5&&d>=12&&d<=cfg.cavernR-2){              // 崩落区域（瓦礫の山）
      const h=_wtHash((x*7)^(z*43));
      if(h<0.2){put(x,yW,z,_sucRockTi(x,yW,z,false));if(h<0.06)put(x,yW+1,z,DEEP_STONE);continue;}
    }
    if(d>8.5&&dl>0.9&&!voxels[vKey(x,yW,z)]){                                  // 光るキノコと水晶の芽
      const h=_wtHash((x*73856093)^(z*19349663)^0x77);
      if(h<0.012)put(x,yW,z,MUSHROOM_BLOCK);
      else if(h<0.02){put(x,yW,z,CRYSTAL_BLOCK);if(h<0.014)put(x,yW+1,z,CRYSTAL_BLOCK);}
    }
  }
  // 滝: 湖セクターの壁際に天井から水柱が落ちる
  {
    const wr=_sucRad(plan,plan.lakeA)-2;
    const wx=Math.round(plan.cx+Math.cos(plan.lakeA)*wr),wz=Math.round(plan.cz+Math.sin(plan.lakeA)*wr);
    const cl=_sucCeil(plan,wx-plan.cx,wz-plan.cz);
    for(let y=fY;y<=cl;y++)put(wx,y,wz,WATER_BLOCK);
    for(const[ox,oz]of[[1,0],[-1,0],[0,1],[0,-1]])put(wx+ox,fY,wz+oz,WATER_BLOCK);
  }
}

// ── 地上の遺跡入口: 小さな崩れた石組み。近づいて初めて異変（亀裂・光る紋様・
// 地下へ続く階段）に気づく規模にとどめる ──
function _sucEntranceRuin(plan){
  const y0=plan.ybase,ex=plan.ex,ez=plan.ez;
  for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){ // 小さく整地
    const x=ex+dx,z=ez+dz,sh=surfaceHeightAt(x,z);
    for(let y=sh+1;y<y0;y++)put(x,y,z,1);
    for(let y=y0+1;y<=y0+7;y++)clr(x,y,z);
    put(x,y0,z,_wtHash((x*13)^(z*7))<0.4?6:0);
  }
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){  // 崩れた壁の環（苔むした古い石材）
    if(Math.abs(dx)!==2&&Math.abs(dz)!==2)continue;
    const h=_wtHash(((ex+dx)*31)^((ez+dz)*71));
    if(h<0.35)continue;
    put(ex+dx,y0+1,ez+dz,h<0.55?6:1);
    if(h>0.82)put(ex+dx,y0+2,ez+dz,6);
    else if(h>0.62&&h<0.74)put(ex+dx,y0+2,ez+dz,LEAF_BLOCK);
  }
  for(const[px,pz]of[[-3,-3],[3,-3]])for(let t=1;t<=3;t++)put(ex+px,y0+t,ez+pz,t===3?6:1); // 立っている石柱
  for(let i=0;i<4;i++)put(ex+i,y0+1,ez+3,6);                                               // 倒れた石柱
  // 地面の亀裂（放射状の深石の筋＋1段の裂け目）と夜に光る紋様
  for(const a of[0.4,2.1,4.4]){
    for(let d=3;d<=6;d++){
      const x=ex+Math.round(Math.cos(a)*d),z=ez+Math.round(Math.sin(a)*d);
      if(_wtHash((x*11)^(z*23))<0.6)put(x,y0,z,DEEP_STONE);
      if(d===4){clr(x,y0,z);put(x,y0-1,z,DEEP_STONE);}
    }
  }
  put(ex+2,y0,ez-2,CRYSTAL_BLOCK);put(ex-2,y0,ez+2,CRYSTAL_BLOCK);
  put(ex-1,y0,ez-2,COAL_ORE);put(ex+2,y0,ez+1,COAL_ORE);
}

// ── 降下通路と城門: 外殻をすべて実体化してから空間を彫り、最後に足場を敷く。
// 通路末端と城門トンネルは重なるため、この順序でないと互いの空間・足場を埋め合う ──
function _sucCorridor(plan){
  const cfg=plan.cfg,fY=cfg.floorY,yW=fY+1;
  const pa=plan.gateA+Math.PI/2,pxu=Math.cos(pa),pzu=Math.sin(pa);
  const gr=_sucRad(plan,plan.gateA);
  // 1) 外殻: 通路（5x5断面。入口付近だけ地上に石組みがのぞく）＋城門トンネル（5幅）
  for(let i=0;i<plan.path.length;i++){
    const c=plan.path[i];
    const yTop=(i<5)?c.y+4:Math.min(c.y+4,plan.ybase);
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)
      for(let y=c.y-1;y<=yTop;y++)
        // 地表にのぞく部分は暗い岩盤ではなく古い石材（遺跡の石組みに見せる）
        put(c.x+dx,y,c.z+dz,y>=plan.ybase-1?_sucWallTi(c.x+dx,y,c.z+dz):_sucRockTi(c.x+dx,y,c.z+dz,false));
  }
  for(const g of plan.gate){
    for(let l=-2;l<=2;l++){
      const x=Math.round(g.x+pxu*l),z=Math.round(g.z+pzu*l);
      for(let y=fY;y<=yW+3;y++)put(x,y,z,_sucRockTi(x,y,z,false));
    }
  }
  // 2) 空間を彫る（入口の数セルは地上への開口まで広げる）。隣接セルの彫り込み範囲が
  //    重なるため、足場はすべて彫り終えてから敷く（先に敷くと後続セルが削ってしまう）
  for(let i=0;i<plan.path.length;i++){
    const c=plan.path[i];
    const hTop=(i<3)?plan.ybase+4:c.y+3;
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)
      for(let y=c.y+1;y<=hTop;y++)clr(c.x+dx,y,c.z+dz);
  }
  for(const g of plan.gate){
    for(let l=-1;l<=1;l++){
      const x=Math.round(g.x+pxu*l),z=Math.round(g.z+pzu*l);
      put(x,fY,z,_wtHash((x*17)^(z*29))<0.5?6:1);
      for(let y=yW;y<=yW+2;y++)clr(x,y,z);
    }
  }
  // 3) 通路の足場: 中央の背骨に1段ずつ敷く＋道標たいまつ（たいまつは通行を妨げない）。
  //    城門トンネル（歩行面=yW）より下へ潜る段は敷かない
  for(let i=0;i<plan.path.length;i++){
    const c=plan.path[i];
    if(c.y>=fY)put(c.x,c.y,c.z,_wtHash((c.x*17)^(c.y*5)^(c.z*29))<0.5?6:1);
    if(i%9===4&&c.y+1<=yW+2)put(c.x,c.y+1,c.z,TORCH_BLOCK);
  }
  // 4) 空洞の壁を抜ける位置に黒曜石の門枠
  for(const g of plan.gate){
    const rr=Math.hypot(g.x-plan.cx,g.z-plan.cz);
    if(Math.abs(rr-gr)>=0.8)continue;
    for(const l of[-2,2]){
      const x=Math.round(g.x+pxu*l),z=Math.round(g.z+pzu*l);
      for(let y=yW;y<=yW+3;y++)put(x,y,z,OBSIDIAN_BLOCK);
    }
    for(let l=-1;l<=1;l++)put(Math.round(g.x+pxu*l),yW+3,Math.round(g.z+pzu*l),OBSIDIAN_BLOCK);
  }
}

// ── 家1軒: 石造り、壊れ方（dmg）は上ほど強く、崩壊家は屋根が抜けて瓦礫が散らばる ──
function _sucHouse(plan,hd){
  const fY=plan.cfg.floorY,y0=fY+1,hw=hd.hw,hx=hd.x,hz=hd.z;
  const dxc=plan.cx-hx,dzc=plan.cz-hz;
  let dx=0,dz=0;
  if(Math.abs(dxc)>=Math.abs(dzc))dx=dxc>0?1:-1;else dz=dzc>0?1:-1; // ドアは都市の中心向き
  for(let ax=-hw;ax<=hw;ax++)for(let az=-hw;az<=hw;az++)
    put(hx+ax,fY,hz+az,_wtHash(((hx+ax)*7)^((hz+az)*13))<0.5?1:6);   // 床
  for(let ax=-hw;ax<=hw;ax++)for(let az=-hw;az<=hw;az++){
    if(Math.abs(ax)!==hw&&Math.abs(az)!==hw)continue;
    const corner=Math.abs(ax)===hw&&Math.abs(az)===hw;
    for(let t=0;t<hd.h;t++){
      const y=y0+t;
      if(!corner&&t<2&&((dx!==0&&ax===dx*hw&&Math.abs(az)<=(hw>2?1:0))||(dz!==0&&az===dz*hw&&Math.abs(ax)<=(hw>2?1:0))))continue; // ドア開口
      if(_wtHash(((hx+ax)*31)^(y*17)^((hz+az)*71))<hd.dmg*(0.5+t/hd.h))continue; // 上ほど崩れる
      const win=!corner&&t===2&&((ax===0&&Math.abs(az)===hw)||(az===0&&Math.abs(ax)===hw));
      put(hx+ax,y,hz+az,corner?DEEP_STONE:win?GLASS_BLOCK:_sucWallTi(hx+ax,y,hz+az));
    }
  }
  if(hd.dmg<0.22){ // 屋根が残っている家
    for(let ax=-hw;ax<=hw;ax++)for(let az=-hw;az<=hw;az++){
      if(_wtHash(((hx+ax)*19)^((hz+az)*43))<hd.dmg*2)continue;
      put(hx+ax,y0+hd.h,hz+az,SLAB_BLOCK,0);
    }
  }else{ // 吹き抜けの廃屋: 崩れた壁材が室内に散らばる
    for(let i=0;i<4;i++){
      const ax=((i*2+1)%(hw*2+1))-hw,az=((i*3+2)%(hw*2+1))-hw;
      if(!voxels[vKey(hx+ax,y0,hz+az)])put(hx+ax,y0,hz+az,6);
    }
  }
}
function _sucHouses(plan){for(const hd of plan.houses)_sucHouse(plan,hd);}

// ── 都市の区画: 広場・道・城壁・閉ざされた門・塔・港・市場・倒れた石像・水路と石橋・街灯 ──
function _sucDistrict(plan){
  const cfg=plan.cfg,fY=cfg.floorY,yW=fY+1,cx=plan.cx,cz=plan.cz;
  // 広場の石畳（基壇の外周まで見えるように広めに敷く）
  for(let dx=-10;dx<=10;dx++)for(let dz=-10;dz<=10;dz++){
    if(dx*dx+dz*dz>110)continue;
    put(cx+dx,fY,cz+dz,_wtHash(((cx+dx)*13)^((cz+dz)*7))<0.35?6:1);
  }
  // 道: 門から広場へ／港へ／市場へ（湖・溶岩の上は舗装しない）
  for(const ang of[plan.gateA,plan.lakeA,plan.gateA-1.3]){
    const rr=_sucRad(plan,ang)-2,pa=ang+Math.PI/2;
    for(let d=8;d<=rr;d++)for(let l=-1;l<=1;l++){
      const x=Math.round(cx+Math.cos(ang)*d+Math.cos(pa)*l),z=Math.round(cz+Math.sin(ang)*d+Math.sin(pa)*l);
      const v=voxels[vKey(x,fY,z)];
      if(v&&(v.ti===WATER_BLOCK||v.ti===LAVA_BLOCK))continue;
      put(x,fY,z,_wtHash((x*17)^(z*29))<0.5?6:1);
    }
  }
  // 城壁（門の方角は開口、湖側は港なので無し、区間ごとに崩落）
  const wallN=Math.ceil(Math.PI*2*cfg.cavernR);
  for(let i=0;i<wallN;i++){
    const ang=i*(Math.PI*2/wallN);
    if(_sucAngDiff(ang,plan.gateA)<0.24)continue;
    if(_sucAngDiff(ang,plan.lakeA)<0.62)continue;
    if(_wtHash(Math.floor(ang*4.5)*2654435761)<0.22)continue;
    const wr=_sucRad(plan,ang)-2.5;
    const x=Math.round(cx+Math.cos(ang)*wr),z=Math.round(cz+Math.sin(ang)*wr);
    const brk=_wtHash((x*31)^(z*71));
    const H=brk<0.25?1:brk<0.5?2:3;
    for(let t=0;t<H;t++)put(x,yW+t,z,_sucWallTi(x,yW+t,z));
    if(H===3&&(i&1))put(x,yW+3,z,SLAB_BLOCK,0); // 胸壁
  }
  // 閉ざされた門（門と反対側: 黒曜石の枠に深石で封じられた扉）
  {
    const ga=plan.gateA+Math.PI,wr=_sucRad(plan,ga)-2.5;
    const gx=Math.round(cx+Math.cos(ga)*wr),gz=Math.round(cz+Math.sin(ga)*wr);
    const pa=ga+Math.PI/2,pxu=Math.cos(pa),pzu=Math.sin(pa);
    for(let l=-2;l<=2;l++){
      const x=Math.round(gx+pxu*l),z=Math.round(gz+pzu*l);
      for(let t=0;t<4;t++)put(x,yW+t,z,(Math.abs(l)===2||t===3)?OBSIDIAN_BLOCK:DEEP_STONE);
    }
  }
  // 塔（円環の壁・中心向きのドア。折れた塔は周囲に瓦礫）
  for(const tw of plan.towers){
    for(let t=0;t<tw.H;t++)for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
      const d2=dx*dx+dz*dz;if(d2>5.5||d2<2)continue;
      if(t>1&&_wtHash(((tw.x+dx)*31)^((yW+t)*13)^((tw.z+dz)*71))<(tw.broken?0.32:0.08))continue;
      put(tw.x+dx,yW+t,tw.z+dz,_sucWallTi(tw.x+dx,yW+t,tw.z+dz));
    }
    const da=Math.atan2(cz-tw.z,cx-tw.x);
    const ddx=Math.round(Math.cos(da)*2),ddz=Math.round(Math.sin(da)*2);
    clr(tw.x+ddx,yW,tw.z+ddz);clr(tw.x+ddx,yW+1,tw.z+ddz);
    if(tw.broken){for(let i=0;i<5;i++){const ox=((i*7)%7)-3,oz=((i*5)%7)-3;if(!voxels[vKey(tw.x+ox,yW,tw.z+oz)])put(tw.x+ox,yW,tw.z+oz,6);}}
    else put(tw.x,yW+tw.H,tw.z,CRYSTAL_BLOCK); // 健在な塔の頂の残光
  }
  // 港: 地下湖に張り出す桟橋（デッキ＋水中の杭）
  {
    const ang=plan.lakeA,pa=ang+Math.PI/2,pxu=Math.cos(pa),pzu=Math.sin(pa);
    for(let d=0;d<5;d++)for(let l=-2;l<=2;l++){
      const x=Math.round(cx+Math.cos(ang)*(11.5+d)+pxu*l),z=Math.round(cz+Math.sin(ang)*(11.5+d)+pzu*l);
      put(x,yW,z,(d+l+9)%5===0?6:1);
      if(Math.abs(l)===2&&d%2===0)put(x,fY,z,3);
    }
  }
  // 崩壊した市場（屋台の残骸: 1軒は屋根ごと潰れている）
  {
    const ang=plan.gateA-1.3,pa=ang+Math.PI/2;
    for(let s=0;s<3;s++){
      const d=10.5+s*3;
      const mx=Math.round(cx+Math.cos(ang)*d+Math.cos(pa)*((s%2)*4-2));
      const mz=Math.round(cz+Math.sin(ang)*d+Math.sin(pa)*((s%2)*4-2));
      const fell=s===1;
      for(const[ox,oz]of[[-1,-1],[1,-1],[-1,1],[1,1]]){
        if(fell&&_wtHash((ox*3)^(oz*7)^(s*11))<0.5)continue;
        for(let t=0;t<2;t++)put(mx+ox,yW+t,mz+oz,3);
      }
      for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++){
        if(_wtHash(((mx+ox)*7)^((mz+oz)*13)^(s*29))<(fell?0.55:0.2))continue;
        put(mx+ox,fell?yW:yW+2,mz+oz,SLAB_BLOCK,0);
      }
      if(!fell)put(mx,yW,mz,_wtHash(s*97)<0.5?WOOL_BLOCK:CLAY_BLOCK);
    }
  }
  // 倒れた石像（台座＋横たわる胴体＋転がり落ちた頭部）
  {
    const ang=plan.gateA+2.4,d=10;
    const sx=Math.round(cx+Math.cos(ang)*d),sz=Math.round(cz+Math.sin(ang)*d);
    for(const[ox,oz]of[[0,0],[1,0],[0,1],[1,1]])put(sx+ox,yW,sz+oz,6);
    const la=ang+Math.PI/2;
    for(let i=1;i<=4;i++){
      const bx=Math.round(sx+Math.cos(la)*i),bz=Math.round(sz+Math.sin(la)*i);
      put(bx,yW,bz,CLAY_BLOCK);
      if(i===2)put(bx,yW+1,bz,CLAY_BLOCK);
    }
    put(Math.round(sx+Math.cos(la)*5.5),yW,Math.round(sz+Math.sin(la)*5.5),WOOL_BLOCK);
  }
  // 水路と石橋（湖から延びる細い水路。道との交差に橋）
  {
    const ang=plan.lakeA+0.55;
    const rEnd=Math.min(_sucRad(plan,ang)-3,15);
    for(let d=9;d<=rEnd;d++){
      const x=Math.round(cx+Math.cos(ang)*d),z=Math.round(cz+Math.sin(ang)*d);
      put(x,fY-1,z,2);put(x,fY,z,WATER_BLOCK);
      if(d===12){
        const pa2=ang+Math.PI/2;
        for(let l=-1;l<=1;l++)put(Math.round(x+Math.cos(pa2)*l),yW,Math.round(z+Math.sin(pa2)*l),SLAB_BLOCK,0);
      }
    }
  }
  // 街灯: 常灯の水晶ランプ＋常灯のたいまつ＋（封印解除で点く）たいまつの台座
  for(const s of plan.lampSpots){put(s.x,s.y-1,s.z,1);put(s.x,s.y,s.z,CRYSTAL_BLOCK);}
  for(const s of plan.preTorches)if(!voxels[vKey(s.x,s.y,s.z)])put(s.x,s.y,s.z,TORCH_BLOCK);
  for(const s of plan.cityLights)put(s.x,s.y-1,s.z,1);
}

// ── 中央神殿: 3段の基壇（ジッグラト）＋大広間＋太い石柱＋古代文字の壁＋上層祭壇 ──
function _sucTemple(plan){
  const cx=plan.cx,cz=plan.cz,fY=plan.cfg.floorY;
  // 基壇（半幅9/8/7、y -24/-23/-22）: どの面からも1段ずつ登れる
  for(const[hw,y]of[[9,fY+1],[8,fY+2],[7,fY+3]])
    for(let dx=-hw;dx<=hw;dx++)for(let dz=-hw;dz<=hw;dz++)
      put(cx+dx,y,cz+dz,_wtHash(((cx+dx)*29)^(y*7)^((cz+dz)*61))<0.25?6:1);
  // 巨大な正面階段（幅7の張り出し）
  for(let ext=1;ext<=2;ext++)for(let l=-3;l<=3;l++){
    const x=cx+plan.tFx*(9+ext)+(plan.tFz!==0?l:0),z=cz+plan.tFz*(9+ext)+(plan.tFx!==0?l:0);
    put(x,fY+1,z,_wtHash((x*29)^(z*61))<0.25?6:1);
  }
  // 大広間の外壁（y -21..-16）: ドア開口＋古代文字の帯（y=-19）
  for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=5;dz++){
    if(Math.abs(dx)!==5&&Math.abs(dz)!==5)continue;
    const x=cx+dx,z=cz+dz;
    const isDoor=(plan.tFx!==0?(dx===plan.tFx*5&&Math.abs(dz)<=1):(dz===plan.tFz*5&&Math.abs(dx)<=1));
    for(let y=-21;y<=-16;y++){
      if(isDoor&&y<=-19)continue;                       // 正面入口（3幅×3高）
      let ti=_sucWallTi(x,y,z);
      if(y===-19){const h=_wtHash((x*11)^(z*23));if(h<0.28)ti=COAL_ORE;else if(h<0.38)ti=CRYSTAL_BLOCK;}
      if(isDoor&&y===-18)ti=OBSIDIAN_BLOCK;             // まぐさ石
      put(x,y,z,ti);
    }
  }
  // 屋根＋四隅の太い石柱＋上層祭壇＋頂の水晶
  for(let dx=-6;dx<=6;dx++)for(let dz=-6;dz<=6;dz++)put(cx+dx,-16,cz+dz,_wtHash(((cx+dx)*3)^((cz+dz)*5))<0.3?6:1);
  for(const[sx,sz]of[[-5,-5],[5,-5],[-5,5],[5,5]])
    for(let ax=0;ax<2;ax++)for(let az=0;az<2;az++)
      for(let y=-21;y<=-14;y++)put(cx+sx+(sx>0?-ax:ax),y,cz+sz+(sz>0?-az:az),DEEP_STONE);
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let y=-15;y<=-13;y++)
    put(cx+dx,y,cz+dz,(Math.abs(dx)===2&&Math.abs(dz)===2)?DEEP_STONE:_sucWallTi(cx+dx,y,cz+dz));
  put(cx,-12,cz,CRYSTAL_BLOCK);
  // 正面ポーチの柱（門枠の外側）
  for(const l of[-2,2]){
    const x=cx+plan.tFx*6+(plan.tFz!==0?l:0),z=cz+plan.tFz*6+(plan.tFx!==0?l:0);
    for(let y=-21;y<=-17;y++)put(x,y,z,DEEP_STONE);
  }
}

// ── 神殿内部: 内柱・魔法陣・封印装置・隠し部屋（封印中は深石の扉で閉ざされる）──
function _sucTempleInner(plan){
  const cx=plan.cx,cz=plan.cz;
  // 内柱4本。2本の頂は常灯の水晶（神殿内部は外より少し明るい）
  for(const[sx,sz]of[[-3,-3],[3,-3],[-3,3],[3,3]])
    for(let y=-21;y<=-18;y++)put(cx+sx,y,cz+sz,DEEP_STONE);
  put(cx-3,-17,cz-3,CRYSTAL_BLOCK);put(cx+3,-17,cz+3,CRYSTAL_BLOCK);
  // 床の魔法陣（結晶の環＋黒曜石の対角線＋深石の外周）
  for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=5;dz++){
    const d=Math.hypot(dx,dz);if(d>4.9)continue;
    let ti=null;
    if(d>=2.5&&d<=3.3)ti=CRYSTAL_BLOCK;
    else if(Math.abs(dx)===Math.abs(dz)&&d>=1.2)ti=OBSIDIAN_BLOCK;
    else if(d>=4.2)ti=DEEP_STONE;
    if(ti!=null)put(cx+dx,-22,cz+dz,ti);
  }
  // 封印装置: 黒曜石の台座の上に、1マス浮いた結晶柱（sealBlocks が耐久を共有）
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)put(cx+dx,-21,cz+dz,(dx||dz)?OBSIDIAN_BLOCK:DEEP_STONE);
  for(const b of plan.sealBlocks)put(b.x,b.y,b.z,b.ti);
  // 隠し部屋（神殿最奥の小部屋）: 基礎から屋根まで建て、扉の位置は深石で塞ぐ
  const rx=-plan.tFx,rz=-plan.tFz;
  const hx=cx+rx*8,hz=cz+rz*8;
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
    const x=hx+dx,z=hz+dz;
    put(x,-24,z,1);put(x,-23,z,1);
    put(x,-22,z,_wtHash((x*29)^(z*61))<0.25?6:1);
    put(x,-18,z,1);
    const edge=Math.abs(dx)===2||Math.abs(dz)===2;
    for(let y=-21;y<=-19;y++){
      if(edge)put(x,y,z,_sucWallTi(x,y,z));
      else clr(x,y,z);
    }
  }
  for(const[ax,az]of[[-1,-1],[1,1]])put(hx+ax,-21,hz+az,CRYSTAL_BLOCK); // 部屋の残光
  for(const c of plan.doorCells)put(c.x,c.y,c.z,DEEP_STONE);            // 封印中の扉
}

// ── 実行時状態の登録（生成完了時とロード時の共通処理）──
function _sucRegister(plan,st){
  undergroundCity={
    cx:plan.cx,cz:plan.cz,ex:plan.ex,ez:plan.ez,ybase:plan.ybase,
    R:plan.cfg.cavernR,floorY:plan.cfg.floorY,topY:plan.cfg.topY,gateA:plan.gateA,
    seal:plan.seal,sealBlocks:plan.sealBlocks,
    sealKeys:new Set(plan.sealBlocks.map(b=>vKey(b.x,b.y,b.z))),
    sealHp:st.sealHp,
    doorCells:plan.doorCells,hiddenChest:plan.hiddenChest,
    chestSpots:plan.chestSpots,lightSpots:plan.lightSpots,cityLights:plan.cityLights,
    mobSpots:plan.mobSpots,bossSpot:plan.bossSpot,
    released:st.released,doorOpen:st.doorOpen,bossDefeated:st.bossDefeated,
    restored:st.restored,contactT:0,ringSpeed:1.2,
    group:null,rings:[],sprite:null,pillar:null,pillarT:0,bossRef:null,_leashT:0,
  };
}
// 生成の仕上げ: 状態登録・宝箱・封印装置の演出メッシュ・遠隔チャンクの休眠化
function _sucFinalize(plan){
  _sucRegister(plan,{released:false,doorOpen:false,bossDefeated:false,sealHp:plan.cfg.sealHp,restored:true});
  for(const s of undergroundCity.chestSpots)_sucPlaceChest(s.x,s.y,s.z);
  _sucBuildVisuals();
  _sucHideDormant();
}
// 生成直後、まだ表示対象でない都市チャンクの水・たいまつ等の個別メッシュをシーンから
// 外して休眠させる（表示は updateChunks の _sucShowChunks が引き受ける）
function _sucHideDormant(){
  const C=undergroundCity;if(!C)return;
  const half=Math.ceil(C.R*1.05)+8;
  for(let cx=Math.floor((C.cx-half)/CHUNK);cx<=Math.floor((C.cx+half)/CHUNK);cx++)
    for(let cz=Math.floor((C.cz-half)/CHUNK);cz<=Math.floor((C.cz+half)/CHUNK);cz++)
      for(let cy=-1;cy>=WORLD_CY_MIN;cy--){
        const key=ucKey(cx,cy,cz);
        if(underChunks[key]&&!activeUnderChunks[key])_hideRec(underChunks[key]);
      }
}

// ── 封印装置の演出メッシュ（回転する2つの輪＋グロースプライト）──
function _sucBuildVisuals(){
  const C=undergroundCity;if(!C||C.group||C.released)return;
  const g=new THREE.Object3D();
  g.position.set(C.seal.x+.5,C.seal.y+.5,C.seal.z+.5);
  const r1=new THREE.Mesh(new THREE.TorusGeometry(1.5,.08,6,26),
    new THREE.MeshBasicMaterial({color:0x88eeff,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));
  const r2=new THREE.Mesh(new THREE.TorusGeometry(1.95,.06,6,30),
    new THREE.MeshBasicMaterial({color:0xcc88ff,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false}));
  r1.rotation.x=Math.PI/2*.92;r2.rotation.x=Math.PI/3;
  g.add(r1,r2);
  scene.add(g);
  C.group=g;C.rings=[r1,r2];
  C.sprite=_ftvGlowSprite();
  C.sprite.position.set(C.seal.x+.5,C.seal.y+1.2,C.seal.z+.5);
  scene.add(C.sprite);
}
function _sucDisposeSealMeshes(){
  const C=undergroundCity;if(!C)return;
  if(C.group){scene.remove(C.group);for(const r of C.rings){r.geometry.dispose();r.material.dispose();}}
  C.group=null;C.rings=[];
  if(C.sprite){scene.remove(C.sprite);if(C.sprite.material.map)C.sprite.material.map.dispose();C.sprite.material.dispose();C.sprite=null;}
}
// 都市の演出メッシュを掃除して状態を破棄（clearWorld/新規生成時に呼ばれる）
function resetUndergroundCity(){
  const C=undergroundCity;if(!C)return;
  _sucDisposeSealMeshes();
  if(C.pillar){scene.remove(C.pillar);C.pillar.geometry.dispose();C.pillar.material.dispose();}
  undergroundCity=null;
}

// ── 封印装置の破壊フック: breakBlock/敵の破壊/爆発から壊れたブロックのキーを受け取る ──
function sucOnBlockBroken(k){
  const C=undergroundCity;if(!C||C.released||!C.sealKeys.has(k))return;
  C.sealKeys.delete(k);
  C.sealHp--;
  if(C.sealHp>0){
    ftvShake(.12,.25);
    showBonus('🏛 封印装置にひびが入った…（あと '+C.sealHp+'）');
    playTone(240,.15,.14,'sine');
  }else _sucRelease();
}

// ═══ 封印解除イベント ═══
// releaseStepMs 間隔で「揺れ＋光柱 → 神殿点灯 → 都市点灯 → 隠し扉＋特別な宝箱 →
// 敵の出現 → 封印装置の崩壊 → 地底王の目覚め」を段階的に再生する。released フラグで
// 一度しか発生しない。
function _sucRelease(){
  const C=undergroundCity;if(!C||C.released)return;
  C.released=true;
  const stepMs=SEALED_CITY_CFG.releaseStepMs;
  const at=(i,fn)=>setTimeout(()=>{
    if(undergroundCity!==C)return; // リセット/再生成後の遅延実行を無効化
    try{fn();}catch(e){console.warn('地底都市: 封印解除演出中にエラー',e);}
  },Math.round(stepMs*i));
  // 0) 画面の揺れ＋低い地響き＋輪の高速回転＋天井へ伸びる光の柱
  showAlert('✨ 古代の封印が解かれた…');
  ftvShake(.45,.8);
  playTone(55,.7,.3,'sawtooth');setTimeout(()=>playTone(82,.5,.22,'sawtooth'),260);
  C.ringSpeed=11;
  if(C.sprite)C.sprite.scale.set(18,18,1);
  spawnParticles(C.seal.x+.5,C.seal.y+.5,C.seal.z+.5,0x99eeff,8);
  {
    const H=(C.topY+1)-C.seal.y;
    const m=new THREE.Mesh(new THREE.CylinderGeometry(.7,1.5,H,10,1,true),
      new THREE.MeshBasicMaterial({color:0xaaffee,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));
    m.position.set(C.seal.x+.5,C.seal.y+H/2,C.seal.z+.5);
    scene.add(m);C.pillar=m;C.pillarT=4.2;
  }
  // 1) 神殿の照明が一斉に点灯
  at(1,()=>{
    _deferDirty=true;
    try{for(const s of C.lightSpots)if(recAt(s.x,s.y,s.z))put(s.x,s.y,s.z,TORCH_BLOCK);}
    finally{_deferDirty=false;flushDirtyChunks();}
    playTone(660,.18,.14,'sine');setTimeout(()=>playTone(880,.16,.12,'sine'),120);
    ftvShake(.15,.25);
  });
  // 2) 都市の街灯も点灯
  at(2,()=>{
    _deferDirty=true;
    try{for(const s of C.cityLights)if(recAt(s.x,s.y,s.z))put(s.x,s.y,s.z,TORCH_BLOCK);}
    finally{_deferDirty=false;flushDirtyChunks();}
    playTone(520,.15,.12,'sine');
  });
  // 3) 神殿最奥の隠し扉が開き、特別な宝箱が現れる
  at(3,()=>{
    _deferDirty=true;
    try{for(const c of C.doorCells)clr(c.x,c.y,c.z);}
    finally{_deferDirty=false;flushDirtyChunks();}
    C.doorOpen=true;
    _sucPlaceChest(C.hiddenChest.x,C.hiddenChest.y,C.hiddenChest.z);
    showAlert('🚪 神殿の最奥で隠し扉が開いた…！');
    ftvShake(.2,.35);
    playTone(140,.4,.2,'square');
  });
  // 4) 地底都市に敵が出現
  at(4,()=>{
    for(const s of C.mobSpots)_ssgSpawnEnemyAt(s.x,C.floorY+1,s.z,s.idx);
    showAlert('⚠ 封じられていた者たちが動き出した…');
    playTone(160,.3,.22,'sawtooth');
  });
  // 5) 封印装置が崩壊する
  at(5,()=>{
    _deferDirty=true;
    try{for(const b of C.sealBlocks)clr(b.x,b.y,b.z);}
    finally{_deferDirty=false;flushDirtyChunks();}
    for(let i=0;i<5;i++)spawnBlockDebris(C.seal.x+.5,C.seal.y+.5+(i%3),C.seal.z+.5,CRYSTAL_BLOCK);
    _sucDisposeSealMeshes();
    ftvShake(.3,.5);
    playTone(300,.25,.2,'square');
  });
  // 6) 隠しボス「地底王」の目覚め
  at(6,()=>_sucSpawnKing());
}

// ── 隠しボス「地底王」: 既存の敵システム（ゴーレムのビルダー）を流用した巨体。
// noDespawn フラグで距離デスポーンせず、都市の外や地上へ出ると玉座前へ引き戻される
// （奈落へ落ちない・都市から出にくい、の簡易実装）──
function _sucSpawnKing(){
  const C=undergroundCity;if(!C||C.bossDefeated||C.bossRef)return;
  if(typeof ENEMY_TYPES==='undefined'||typeof enemies==='undefined'||typeof makeMat!=='function')return;
  try{
    const base=ENEMY_TYPES[2]; // Golem のボディビルダーを流用
    const et=Object.assign({},base,{name:'地底王',hp:130,dmg:24,score:2000,spdMul:.5,
      color:0x3b3050,emissive:0x7744dd,emissiveIntensity:.4});
    const sc=2.0;
    const mat=makeMat(et.color,et.emissive,et.emissiveIntensity,.6);
    const built=et.builder(mat);
    // スケール補正: 物理の足元（原点-0.85）に見た目の足元を合わせる
    for(const ch of built.root.children)ch.position.y+=0.85*(sc-1)/sc;
    built.root.scale.setScalar(sc);
    const bx=C.bossSpot.x,bz=C.bossSpot.z;
    built.root.position.set(bx+.5,C.floorY+2.85,bz+.5);
    if(typeof markShadowCaster==='function')markShadowCaster(built.root);
    scene.add(built.root);
    const e={root:built.root,body:built.body,head:built.head,hpBar:built.hpBar,hp:130,maxHp:130,type:et,velY:0,onGround:false,atkCd:0,stuckT:0,lastX:bx+.5,lastZ:bz+.5,flashMeshes:[built.body,built.head],dead:false,breakCd:0,lWing:built.lWing,rWing:built.rWing,noDespawn:true};
    enemies.push(e);
    C.bossRef=e;
    if(typeof sfxBossAppear==='function')sfxBossAppear();
    showAlert('👑 地底王が目覚めた…！');
    spawnParticles(bx+.5,C.floorY+3,bz+.5,0x7744dd,8);
  }catch(e){console.warn('地底都市: 地底王の出現に失敗',e);}
}

// ── ロード後の復元: 宝箱と封印装置の演出メッシュはセッション内オブジェクトなので、
// プレイヤーが近づいてチャンクが実体化したタイミングで作り直す ──
function _sucRestore(){
  const C=undergroundCity;if(!C||C.restored)return;
  if(!recAt(C.seal.x,C.seal.y,C.seal.z))return; // 都市チャンク未生成: 次のフレームで再試行
  C.restored=true;
  for(const s of C.chestSpots)_sucPlaceChest(s.x,s.y,s.z);
  if(C.released){
    _sucPlaceChest(C.hiddenChest.x,C.hiddenChest.y,C.hiddenChest.z);
    if(!C.bossDefeated)_sucSpawnKing();
  }else{
    _sucBuildVisuals();
  }
}

// ── 毎フレーム更新（main.js の tick から呼ばれる）: 近距離のときだけ演出と
// 封印解除判定を行い、遠距離では早期リターンして負荷をかけない ──
function sucUpdate(dt){
  const C=undergroundCity;if(!C)return;
  // 光の柱のフェードアウト
  if(C.pillar){
    C.pillarT-=dt;
    if(C.pillarT<=0){scene.remove(C.pillar);C.pillar.geometry.dispose();C.pillar.material.dispose();C.pillar=null;}
    else C.pillar.material.opacity=.5*Math.min(1,C.pillarT/1.5);
  }
  const pd=Math.hypot(P.x-C.cx,P.z-C.cz);
  if(!C.restored){if(pd<70)_sucRestore();return;}
  // 地底王: 討伐判定と「都市から出にくい」引き戻し
  if(C.bossRef){
    const b=C.bossRef;
    if(b.dead||b.hp<=0){
      C.bossRef=null;C.bossDefeated=true;
      showAlert('👑 地底王を討ち果たした！');
      playTone(392,.2,.15,'triangle');setTimeout(()=>playTone(523,.25,.15,'triangle'),200);
    }else{
      C._leashT+=dt;
      if(C._leashT>1.5){
        C._leashT=0;
        const bp=b.root.position;
        if(Math.hypot(bp.x-C.cx,bp.z-C.cz)>C.R+9||bp.y>-2||bp.y<C.floorY-4){
          bp.set(C.bossSpot.x+.5,C.floorY+2.85,C.bossSpot.z+.5);b.velY=0;
          spawnParticles(bp.x,bp.y,bp.z,0x7744dd,5);
        }
      }
    }
  }
  if(pd>45)return; // 遠距離: 輪の回転・接触判定を停止
  if(C.rings.length){
    if(C.released)C.ringSpeed=Math.min(12,C.ringSpeed+dt*8);
    C.rings[0].rotation.z+=dt*C.ringSpeed;
    C.rings[1].rotation.y+=dt*C.ringSpeed*.6;
    if(C.group)C.group.rotation.y+=dt*C.ringSpeed*.25;
  }
  if(C.released)return;
  // 接触による封印解除（装置のそばに少しの間とどまる。攻撃で壊しても解除できる）
  const dx=P.x-(C.seal.x+.5),dy=(P.y+1)-(C.seal.y+.5),dz=P.z-(C.seal.z+.5);
  if(dx*dx+dy*dy+dz*dz<8.5){
    if(C.contactT===0)showBonus('🏛 封印装置が震えている…（触れ続けるか攻撃で解除）');
    C.contactT+=dt;
    if(C.contactT>=.9)_sucRelease();
  }else C.contactT=0;
}

// ── セーブ / ロード（既存セーブに undergroundCity フィールドを追加。無ければ未生成扱い）──
function sucSaveState(){
  const C=undergroundCity;if(!C)return null;
  return{generated:true,cx:C.cx,cz:C.cz,ex:C.ex,ez:C.ez,ybase:C.ybase,
    released:C.released,doorOpen:C.doorOpen,bossDefeated:C.bossDefeated,sealHp:C.sealHp};
}
function sucLoadState(d){
  resetUndergroundCity();
  if(!d||!d.generated||typeof d.cx!=='number'||typeof d.cz!=='number')return;
  try{
    // レイアウトは seed＋保存座標から決定的に再導出する（ブロックは worldEdits が復元）
    const site={cx:d.cx,cz:d.cz,ex:d.ex,ez:d.ez,ybase:d.ybase};
    const plan=_sucPlan(_wtRng(_sucSeed(d.cx,d.cz)),site);
    _sucRegister(plan,{
      released:!!d.released,doorOpen:!!d.doorOpen,bossDefeated:!!d.bossDefeated,
      sealHp:(typeof d.sealHp==='number')?d.sealHp:SEALED_CITY_CFG.sealHp,
      restored:false,
    });
  }catch(e){console.warn('地底都市: セーブ復元に失敗',e);undergroundCity=null;}
}

// ── updateChunks 連携: 都市の範囲は「プレイヤー階層より下だけ表示」の既定の地下
// 描画では天井・建物上部が欠けるため、範囲内の全階層を生成・表示する ──
function _sucEnsureChunks(pcx,pcz){
  const C=undergroundCity;if(!C)return false;
  const half=Math.ceil(C.R*1.05)+8;
  let grew=false,made=0;
  for(let cx=Math.floor((C.cx-half)/CHUNK);cx<=Math.floor((C.cx+half)/CHUNK);cx++)
    for(let cz=Math.floor((C.cz-half)/CHUNK);cz<=Math.floor((C.cz+half)/CHUNK);cz++){
      if(Math.max(Math.abs(cx-pcx),Math.abs(cz-pcz))>DRAW_R+1)continue;
      for(let cy=-2;cy>=WORLD_CY_MIN;cy--){
        if(!underChunks[ucKey(cx,cy,cz)]){
          generateUnderChunk(cx,cy,cz);grew=true;
          if(++made>=10)return grew; // 1回の生成量を制限（処理落ち防止。残りは次回）
        }
      }
    }
  return grew;
}
function _sucShowChunks(neededU,pcx,pcz){
  const C=undergroundCity;if(!C)return;
  const half=Math.ceil(C.R*1.05)+8;
  for(let cx=Math.floor((C.cx-half)/CHUNK);cx<=Math.floor((C.cx+half)/CHUNK);cx++)
    for(let cz=Math.floor((C.cz-half)/CHUNK);cz<=Math.floor((C.cz+half)/CHUNK);cz++){
      if(Math.max(Math.abs(cx-pcx),Math.abs(cz-pcz))>DRAW_R)continue;
      for(let cy=-2;cy>=WORLD_CY_MIN;cy--){
        const key=ucKey(cx,cy,cz);
        if(!underChunks[key])continue;
        neededU[key]=true;showUnderChunk(cx,cy,cz);
      }
    }
}

// ── 生成の入口: フェーズ分割（1フェーズ/フレーム）で処理落ちを避ける ──
function generateSealedUndergroundCity(){
  if(_sucBusy){showBonus('🏛 封印された地底都市を生成中…');return;}
  if(undergroundCity){showBonus('🏛 封印された地底都市はすでに存在する（入口: X '+undergroundCity.ex+' / Z '+undergroundCity.ez+'）');return;}
  if(!window.confirm('「封印された地底都市」を生成します。前方の地下深くに巨大な古代都市が埋まり、地上には小さな遺跡の入口が現れます。生成しますか？'))return;
  _sucBusy=true;_sucSetProgress(true,0);
  let plan;
  try{
    const anchor=_frontAnchor(SEALED_CITY_CFG.anchorDist);
    const site=_sucFindSite(anchor)||_sucSiteFor(anchor.cx0,anchor.cz0);
    site.ybase=_footprintYBase(site.ex,site.ez,5,2);
    plan=_sucPlan(_wtRng(_sucSeed(site.cx,site.cz)),site);
  }catch(e){
    console.error('地底都市: 準備中にエラー',e);
    _sucBusy=false;_sucSetProgress(false);showBonus('⚠ 封印された地底都市の生成に失敗しました');return;
  }
  // フェーズ列: チャンク実体化(4階層)→空洞→装飾→入口と通路→家→区画→神殿→内部→仕上げ
  const phases=[
    ()=>{_ensureChunksAround(plan.ex,plan.ez,12,2);_sucEnsureUnder(plan,-1);},
    ()=>_sucEnsureUnder(plan,-2),
    ()=>_sucEnsureUnder(plan,-3),
    ()=>_sucEnsureUnder(plan,-4),
    ()=>_sucCavernHalf(plan,-1),
    ()=>_sucCavernHalf(plan,1),
    ()=>_sucCavernDeco(plan),
    ()=>{_sucEntranceRuin(plan);_sucCorridor(plan);},
    ()=>_sucHouses(plan),
    ()=>_sucDistrict(plan),
    ()=>_sucTemple(plan),
    ()=>_sucTempleInner(plan),
    ()=>_sucFinalize(plan),
  ];
  let idx=0;_deferDirty=true;
  const step=()=>{
    try{
      phases[idx]();idx++;
      _deferDirty=false;flushDirtyChunks();
      _sucSetProgress(true,idx/phases.length);
      if(idx<phases.length){_deferDirty=true;requestAnimationFrame(step);}
      else{
        _sucBusy=false;_sucSetProgress(false);
        showBonus('🏛 封印された地底都市を生成！地上の遺跡入口（X '+plan.ex+' / Z '+plan.ez+'）から地下へ降りよう');
        playTone(262,.14,.1,'triangle');setTimeout(()=>playTone(330,.14,.1,'triangle'),140);setTimeout(()=>playTone(392,.2,.1,'triangle'),300);
      }
    }catch(e){
      console.error('地底都市: 生成中にエラー',e);
      _deferDirty=false;try{flushDirtyChunks();}catch(_){}
      _sucBusy=false;_sucSetProgress(false);showBonus('⚠ 封印された地底都市の生成に失敗しました');
    }
  };
  requestAnimationFrame(step);
}
