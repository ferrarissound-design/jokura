// ============================================================================
// jokura / structures_sunken_city.js
// 🌊 海底に沈んだ王都
// world.js から分割されたファイルの一部。全スクリプトは index.html の PARTS の
// 順序で <script> として読み込まれ、同一のグローバルスコープを共有する。
// このファイルは world.js（地形・チャンク・ブロック定義）より後、
// structures_registry.js（生成関数を登録テーブルで参照）より前に読み込まれる。
// ============================================================================

// ═══ 🌊 海底に沈んだ王都 ═══
// 巨大な盆地状の海を新しく掘り、その底に「城壁・正門・住宅街・中央大通り・倒れた
// 時計塔・海神の神殿・王宮・王の間・地下宝物庫・巨大生物の骨」を持つ円形の王都を
// 沈める特殊生成。ブロックはすべて put/clr（worldEdits）に任せるため、セーブ＆
// チャンク再訪で自動復元される。海面は水ブロックの個別メッシュを数千個並べる
// 代わりに1枚の半透明メッシュで表現し、スマホでも描画負荷を増やさない。
const SUNKEN_CITY_CFG={
  anchorDist:58,   // プレイヤー前方の生成距離（都市中心の目安）
  basinR:40,       // 海盆のふち半径（この内側を掘り下げて海にする）
  wallR:30,        // 外周城壁の半径
  maxDepth:16,     // 岸から中心部への最大掘り下げ深さ
};
// 実行時状態（生成済みならセーブへも記録される）。null=王都なし
let sunkenRoyalCity=null;
let _srcBusy=false; // 生成中フラグ（ボタン連打による多重生成を防ぐ）

function _srcSetProgress(show,frac){
  const el=document.getElementById('worldTreeProgress');if(!el)return;
  const lbl=document.getElementById('wtpLabel'),fill=document.getElementById('wtpFill');
  el.style.display=show?'':'none';
  if(show){if(lbl)lbl.textContent='🌊 海底に沈んだ王都を生成中…';if(fill)fill.style.width=Math.round((frac||0)*100)+'%';}
  else if(lbl)lbl.textContent='🌳 世界樹を生成中…';
}

function _srcSeed(cx,cz){return((WORLD_SEED^(cx*73856093)^(cz*19349663)^0x5ea0c1)>>>0)||1;}
// ローカル座標 (a=正門方向, b=その横) ⇔ ワールド座標。回転は90度単位（天空都市と同じ方式）
function _srcW(plan,a,b){
  const r=plan.rot&3;
  if(r===1)return{x:plan.cx-b,z:plan.cz+a};
  if(r===2)return{x:plan.cx-a,z:plan.cz-b};
  if(r===3)return{x:plan.cx+b,z:plan.cz-a};
  return{x:plan.cx+a,z:plan.cz+b};
}
function _srcL(plan,wx,wz){
  const dx=wx-plan.cx,dz=wz-plan.cz,r=plan.rot&3;
  if(r===1)return{a:dz,b:-dx};
  if(r===2)return{a:-dx,b:-dz};
  if(r===3)return{a:-dz,b:dx};
  return{a:dx,b:dz};
}
function _srcPut(plan,a,y,b,ti,meta){const p=_srcW(plan,a,b);put(p.x,y,p.z,ti,meta);}
function _srcClr(plan,a,y,b){const p=_srcW(plan,a,b);clr(p.x,y,p.z);}
// ローカル方向(0:+a 1:+b 2:-a 3:-b)を階段metaへ（STAIR_DIRSの並びと回転が一致する）
function _srcSM(plan,localIdx){return(localIdx+plan.rot)&3;}

// ── ブロックの質感ミックス（暗石＋灰色＋青緑＋白石を基調に、区画ごとに配色を変える）──
function _srcStoneTi(x,y,z){ // 城壁・時計塔・共用部: 暗い石材のまだら＋海成物の青緑
  const h=_wtHash((x*53)^(y*97)^(z*193));
  if(h<0.34)return DEEP_STONE;if(h<0.7)return 6;if(h<0.9)return 1;if(h<0.95)return ICE_BLOCK;return CLAY_BLOCK;
}
function _srcPalaceTi(x,y,z){ // 王宮: 白石と暗石の格調ある縞
  const h=_wtHash((x*29)^(y*151)^(z*67));
  if(h<0.3)return WOOL_BLOCK;if(h<0.62)return DEEP_STONE;if(h<0.88)return 6;return ICE_BLOCK;
}
function _srcTempleTi(x,y,z){ // 神殿: 白い石が中心＋青緑
  const h=_wtHash((x*41)^(y*13)^(z*179));
  if(h<0.5)return WOOL_BLOCK;if(h<0.72)return 6;if(h<0.9)return ICE_BLOCK;return 1;
}
function _srcHouseTi(x,y,z){ // 住宅街: 灰岩と石の質素なまだら＋泥
  const h=_wtHash((x*71)^(y*23)^(z*101));
  if(h<0.42)return 6;if(h<0.78)return 1;if(h<0.9)return DEEP_STONE;return CLAY_BLOCK;
}
function _srcSeabedTi(x,z,deep){ // 海底: 浅場は砂と泥、深部は暗い石が混ざる
  const h=_wtHash((x*73856093)^(z*83492791)^0x5ea);
  if(deep){if(h<0.38)return DEEP_STONE;if(h<0.58)return 1;if(h<0.8)return 2;return CLAY_BLOCK;}
  if(h<0.55)return 2;if(h<0.8)return CLAY_BLOCK;return 1;
}

// ── 宝箱（既存の underTreasures 宝箱システムを流用、type3=豪華報酬）──
function _srcPlaceChest(wx,wy,wz){
  const tk=vKey(wx,wy,wz);if(underTreasures[tk])return;
  put(wx,wy-1,wz,1);clr(wx,wy,wz);clr(wx,wy+1,wz);
  const mesh=_makeTreasureMesh(3);mesh.position.set(wx+.5,wy,wz+.5);
  if(!openedTreasureKeys.has(tk))scene.add(mesh);
  underTreasures[tk]={mesh,opened:openedTreasureKeys.has(tk),type:3,struct:'sunkenRoyalCity'};
}

// ── 候補地探索: 低くて平らな土地（＝海に向く場所）を選ぶ。既存の特殊生成や
// プレイヤーを巻き込まない。適地が無い場合も最もマシな候補に海を「新しく作る」──
function _srcFindSite(anchor){
  const R=SUNKEN_CITY_CFG.basinR;
  const cands=[[0,0]];
  for(let ring=1;ring<=2;ring++)for(let k=0;k<8;k++){
    const ang=k*Math.PI/4;
    cands.push([Math.round(Math.cos(ang)*ring*16),Math.round(Math.sin(ang)*ring*16)]);
  }
  let best=null,bestScore=Infinity;
  for(const[ox,oz]of cands){
    const cx=anchor.cx0+ox,cz=anchor.cz0+oz;
    if(Math.hypot(cx-P.x,cz-P.z)<R+12)continue;                                  // プレイヤーを巻き込まない
    if(_ftvNearStruct(cx,cz,R+14))continue;                                       // 地上構造物（宝箱）を避ける
    if(frozenVillage&&Math.hypot(cx-frozenVillage.cx0,cz-frozenVillage.cz0)<R+30)continue;
    if(undergroundCity&&Math.hypot(cx-undergroundCity.cx,cz-undergroundCity.cz)<R+undergroundCity.R+20)continue;
    if(collapsingSkyCity&&Math.hypot(cx-collapsingSkyCity.cx,cz-collapsingSkyCity.cz)<R+40)continue;
    let hmin=Infinity,hmax=-Infinity;
    for(let dx=-R;dx<=R;dx+=8)for(let dz=-R;dz<=R;dz+=8){
      if(dx*dx+dz*dz>R*R)continue;
      const h=getHeight(cx+dx,cz+dz);
      if(h<hmin)hmin=h;if(h>hmax)hmax=h;
    }
    const score=(hmax-hmin)+hmax*0.6+Math.hypot(ox,oz)*0.03; // 低くて平ら＝海に向く
    if(score<bestScore){bestScore=score;best={cx,cz,hmin,hmax};}
  }
  return best;
}

// ── 設計図: 全レイアウトを rng（シード＋保存座標から決定的）で決める。ロード時も
// 同じシードでこの関数を再実行して宝箱・海面メッシュの位置を復元する（ブロック自体は
// worldEdits が復元するので、ここでは put しない）──
function _srcPlan(rng,site){
  const cfg=SUNKEN_CITY_CFG,S=site.shoreY;
  const plan={
    cfg,cx:site.cx,cz:site.cz,shoreY:S,waterY:S+0.7,rot:site.rot&3,rng,
    pfY:S-14,plazaY:S-12,tfY:S-11,resY:S-9,gateY:S-7,
    houses:[],chestSpots:[],
  };
  plan.vfY=Math.max(plan.pfY-4,-16); // 地下宝物庫の床（最下層チャンク -16 を割らない）
  plan.tSide=rng()<0.5?1:-1;          // 神殿の張り出す側（時計塔・大住宅街は反対側）
  const ts=plan.tSide,bs=-ts;
  // 主要区画の平らなパッド（テラス）。_srcFloorY が盆地の床とブレンドする
  plan.pads=[
    {a:-18,b:0,r:13,y:plan.pfY},        // 王宮の台地（最深部）
    {a:5,b:0,r:8,y:plan.plazaY},        // 中央広場
    {a:2,b:ts*17,r:10,y:plan.tfY},      // 海神の神殿の台地
    {a:16,b:bs*10,r:11,y:plan.resY},    // 住宅街テラス（大）
    {a:17,b:ts*10,r:7,y:plan.resY},     // 住宅街テラス（小）
    {a:cfg.wallR,b:0,r:6,y:plan.gateY}, // 正門前
  ];
  // 住宅街: 種類・壊れ方・埋まり方に変化（二階建て・商店・倉庫・壁だけの廃屋を含む）
  {
    const slots=[[11,bs*7],[11,bs*14],[17,bs*15],[22,bs*7],[23,bs*13],[19,bs*5],[13,ts*8],[19,ts*9],[24,ts*13]];
    const kinds=[1,2,3,0,4,0,0,1,4]; // 0小型 1二階建て 2商店 3倉庫 4壁だけの廃屋
    for(let i=0;i<slots.length;i++){
      const ja=Math.round((rng()-.5)*2),jb=Math.round((rng()-.5)*2);
      plan.houses.push({a:slots[i][0]+ja,b:slots[i][1]+jb,kind:kinds[i],dmg:0.08+rng()*0.4,buried:rng()<0.3});
    }
  }
  plan.fountain={a:16,b:bs*9};                    // 噴水跡の小広場
  plan.market={a:25,b:bs*5};                       // 崩れた市場（正門近く）
  // 倒れた時計塔: 根本の位置と倒れる方向をランダム化
  {
    plan.clock={a:13,b:bs*12};
    const dirs=[[-1,0],[0,bs],[-0.7,bs*0.7]];
    const d=dirs[Math.floor(rng()*dirs.length)];
    plan.clock.fda=d[0];plan.clock.fdb=d[1];plan.clock.len=15;
    const w=_srcW(plan,plan.clock.a,plan.clock.b);
    plan.clock.baseY=_srcFloorY(plan,w.x,w.z);
    plan.clock.tipY=Math.min(S+2,plan.clock.baseY+2+Math.round(plan.clock.len*0.55));
  }
  // 巨大生物の骨: 位置と向きをランダム化
  {
    const spots=[[5,-ts*12],[-8,ts*10],[20,ts*16]];
    const sp=spots[Math.floor(rng()*spots.length)];
    plan.bone={a:sp[0],b:sp[1],ang:rng()*Math.PI*2};
  }
  plan.collapsedCorner=rng()<0.5?1:-1;             // 王宮の崩れている正面翼の側
  plan.doorSide=rng()<0.5?1:-1;                    // 正門で残っている扉の側
  plan.vault={bOff:Math.round((rng()-.5)*4),entB:rng()<0.5?2:-2}; // 宝物庫の中の配置と入口の側
  plan.wallHoleTh=Math.PI*(0.55+rng()*0.9)*(rng()<0.5?1:-1);      // 城壁の侵入穴の方角
  plan.caveTh=Math.PI*(0.45+rng()*1.1)*(rng()<0.5?1:-1);          // 海底洞窟の方角
  plan.shipTh=Math.PI*(0.3+rng()*1.4)*(rng()<0.5?1:-1);           // 沈んだ船の方角
  plan.kelpMul=0.7+rng()*0.6;                                     // 海藻・サンゴの量
  plan.spireTop=S+9;
  // 宝箱: 正門の塔・住宅・時計塔の先端・神殿の奥・王の間・宝物庫×2（座標はすべて決定的）
  {
    const ds=plan.doorSide;
    plan.chestSpots.push({a:cfg.wallR-1,b:ds*5,y:plan.gateY+1});
    const h0=plan.houses[0];
    plan.chestSpots.push({a:h0.a,b:h0.b,y:plan.resY+1});
    const c=plan.clock,s2=c.len-2;
    plan.chestSpots.push({a:Math.round(c.a+c.fda*(3+s2)),b:Math.round(c.b+c.fdb*(3+s2)),
      y:Math.min(c.tipY,c.baseY+2+Math.round(s2*0.55))});
    plan.chestSpots.push({a:2,b:ts*22,y:plan.tfY+1});
    plan.chestSpots.push({a:-25,b:4,y:plan.pfY+1});
    plan.chestSpots.push({a:-20,b:plan.vault.bOff-1,y:plan.vfY+1});
    plan.chestSpots.push({a:-16,b:plan.vault.bOff+1,y:plan.vfY+1});
  }
  return plan;
}

// ── 海盆の床: 中心ほど深い盆地＋主要区画の平らなパッドをブレンド。盆地の外は null ──
function _srcFloorY(plan,wx,wz){
  const l=_srcL(plan,wx,wz),a=l.a,b=l.b;
  const d=Math.hypot(a,b),R=plan.cfg.basinR;
  if(d>=R)return null;
  const u=d/R;
  let fy=plan.shoreY-2-(plan.cfg.maxDepth-3)*(1-u*u);
  fy+=noise(wx*0.05+55,wz*0.05-55)*1.8; // ゆるい起伏（シードから決定的）
  let hit=false;
  for(const p of plan.pads){
    const pd=Math.hypot(a-p.a,b-p.b)-p.r;
    if(pd<=0){fy=p.y;hit=true;break;}
    if(pd<5)fy=fy+(p.y-fy)*(1-pd/5);
  }
  // 中央大通り: 正門から王宮まで緩やかに下る（パッドの外のみ）
  if(!hit&&Math.abs(b)<=3&&a>=-7&&a<=plan.cfg.wallR+2){
    const t=(plan.cfg.wallR-a)/(plan.cfg.wallR+7);
    fy=plan.gateY+(plan.pfY+1-plan.gateY)*t;
  }
  return Math.max(plan.vfY,Math.round(fy));
}

// ── 海盆の掘削（世界座標の4象限に分けて1フレームずつ）。地形の内部は voxel 化
// されていないため、床・段差の側面・外周の崖面を必ず put で実体化する
// （封印された地底都市の空洞と同じイディオム）──
function _srcBasinQuarter(plan,qx,qz){
  const R=plan.cfg.basinR,S=plan.shoreY;
  const x0=qx<0?-R:0,x1=qx<0?-1:R,z0=qz<0?-R:0,z1=qz<0?-1:R;
  for(let dx=x0;dx<=x1;dx++)for(let dz=z0;dz<=z1;dz++){
    if(dx*dx+dz*dz>=R*R)continue;
    const x=plan.cx+dx,z=plan.cz+dz;
    const fy=_srcFloorY(plan,x,z);
    const sh=surfaceHeightAt(x,z);
    for(let y=fy+1;y<=Math.max(sh+7,S+7);y++)clr(x,y,z); // 内部の空間（海になる部分）を空ける
    // 床: 隣接列と段差になる分は側面まで実体化。盆地の外と接する列は崖面を岸まで実体化
    let low=fy;
    for(const[ox,oz]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const nf=_srcFloorY(plan,x+ox,z+oz);
      if(nf==null){
        const wx2=x+ox,wz2=z+oz;
        for(let y=fy-1;y<=S;y++)put(wx2,y,wz2,_srcSeabedTi(wx2+y,wz2,false));
      }else if(nf<low)low=nf;
    }
    const deep=fy<S-9;
    for(let y=Math.max(low,fy-4);y<=fy;y++)put(x,y,z,_srcSeabedTi(x+y,z,deep));
  }
}

// ── 岸の砂の堤・沈んだ道路・崩れた橋・石柱・海底洞窟（外周の見せ場）──
function _srcShoreAndRim(plan){
  const R=plan.cfg.basinR,S=plan.shoreY;
  for(let dx=-R-2;dx<=R+2;dx++)for(let dz=-R-2;dz<=R+2;dz++){
    const d=Math.hypot(dx,dz);if(d<R||d>R+1.9)continue;
    const x=plan.cx+dx,z=plan.cz+dz,sh=surfaceHeightAt(x,z);
    for(let y=sh+1;y<=S;y++)put(x,y,z,2);              // 低地は砂で盛って岸の堤にする
    for(let y=S+1;y<=Math.max(sh,S)+7;y++)clr(x,y,z);  // 高地は削って岸の高さに揃える
    if(!voxels[vKey(x,S,z)])put(x,S,z,2);
  }
  // 沈んだ道路: 正門から岸へ続く崩れかけの石畳
  for(let a=plan.cfg.wallR+2;a<=R+1;a++)for(let b=-2;b<=2;b++){
    const p=_srcW(plan,a,b);
    const fy=_srcFloorY(plan,p.x,p.z);if(fy==null)continue;
    if(_wtHash((p.x*17)^(p.z*29))<0.42)continue;       // 途切れた区間
    put(p.x,fy,p.z,_wtHash((p.x*7)^(p.z*13))<0.5?6:1);
  }
  // 崩れた橋: 沈んだ道路の窪みに架かっていた石橋（中央が落ちている）
  for(let a=plan.cfg.wallR+4;a<=plan.cfg.wallR+9;a++)for(let b=-1;b<=1;b++){
    if(a>=plan.cfg.wallR+6&&a<=plan.cfg.wallR+7)continue; // 落ちた中央部
    _srcPut(plan,a,plan.gateY+1,b,SLAB_BLOCK,0);
  }
  for(const s of[-3,3])for(let t=1;t<=4;t++)_srcPut(plan,plan.cfg.wallR+5,plan.gateY+t,s,t===4?6:1); // 立ち並ぶ石柱
  // 海底洞窟: 盆地の斜面から岸の下へ潜る横穴（奥に光る水晶）
  {
    const th=plan.caveTh,ca=Math.cos(th),cb=Math.sin(th);
    const e=_srcW(plan,Math.round(ca*(R-4)),Math.round(cb*(R-4)));
    const ey=_srcFloorY(plan,e.x,e.z);
    if(ey!=null)for(let dep=0;dep<=6;dep++){
      const p=_srcW(plan,Math.round(ca*(R-4+dep)),Math.round(cb*(R-4+dep)));
      for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++)for(let oy=0;oy<=3;oy++)
        put(p.x+ox,ey+oy,p.z+oz,_srcStoneTi(p.x+ox,ey+oy,p.z+oz)); // 外殻を実体化
      clr(p.x,ey+1,p.z);clr(p.x,ey+2,p.z);                          // 通路を彫る
      if(dep===6){put(p.x,ey+1,p.z,CRYSTAL_BLOCK);put(p.x,ey+2,p.z,MUSHROOM_BLOCK);}
    }
  }
}

// ── 外周城壁: 監視塔・崩れた胸壁・亀裂・侵入穴・海藻とサンゴに覆われた区間 ──
function _srcCityWall(plan){
  const Rw=plan.cfg.wallR,S=plan.shoreY;
  const n=Math.ceil(Math.PI*2*Rw*1.6),done=new Set();
  for(let rr=Rw;rr>=Rw-1;rr--)for(let i=0;i<n;i++){
    const th=i*(Math.PI*2/n);
    const nrm=Math.atan2(Math.sin(th),Math.cos(th));
    if(Math.abs(nrm)<0.16)continue;                                 // 正門の開口（θ=0 が門）
    if(Math.abs(Math.atan2(Math.sin(th-plan.wallHoleTh),Math.cos(th-plan.wallHoleTh)))<0.1)continue; // 水中から侵入できる穴
    const p=_srcW(plan,Math.round(Math.cos(th)*rr),Math.round(Math.sin(th)*rr));
    const key=p.x+'|'+p.z;if(done.has(key))continue;done.add(key);
    const fy=_srcFloorY(plan,p.x,p.z);if(fy==null)continue;
    const segH=_wtHash(Math.floor(th*6)*2654435761^0x5ea);
    if(segH<0.13)continue;                                          // 完全崩壊して地形に埋もれた区間
    let H=segH<0.3?2:segH<0.55?5:8;
    const crack=_wtHash((p.x*31)^(p.z*71));
    if(crack<0.05)H=1;                                              // 亀裂
    H=Math.min(H,S+2-fy);
    for(let t=1;t<=H;t++){
      if(t>2&&_wtHash((p.x*13)^((fy+t)*97)^(p.z*29))<0.1)continue;  // 風化の穴あき
      put(p.x,fy+t,p.z,crack>0.88&&t<=2?LEAF_BLOCK:_srcStoneTi(p.x,fy+t,p.z)); // 海藻に覆われた石
    }
    if(rr===Rw&&H>=7&&(i%4===0))put(p.x,fy+H+1,p.z,SLAB_BLOCK,0);   // 崩れた胸壁
    if(rr===Rw&&crack>0.8&&crack<0.86)put(p.x,fy+1,p.z,4);          // サンゴの付着
  }
  // 監視塔（正門の方角は避ける。頂は海面近くまで届き、2本は残光が見える）
  const towers=[0.75,-0.75,1.6,-1.6,2.4,-2.4,Math.PI];
  for(let k=0;k<towers.length;k++){
    const th=towers[k];
    const pc=_srcW(plan,Math.round(Math.cos(th)*Rw),Math.round(Math.sin(th)*Rw));
    const fy=_srcFloorY(plan,pc.x,pc.z);if(fy==null)continue;
    const Ht=Math.min(S+3-fy,9+(k%3));
    for(let t=1;t<=Ht;t++)for(let ox=-2;ox<=2;ox++)for(let oz=-2;oz<=2;oz++){
      if(Math.abs(ox)!==2&&Math.abs(oz)!==2)continue;
      if(t>3&&_wtHash(((pc.x+ox)*13)^((fy+t)*7)^((pc.z+oz)*47))<0.14)continue;
      put(pc.x+ox,fy+t,pc.z+oz,_srcStoneTi(pc.x+ox,fy+t,pc.z+oz));
    }
    // 中心向きのドアと内部の螺旋足場
    const da=Math.atan2(plan.cz-pc.z,plan.cx-pc.x);
    const ddx=Math.round(Math.cos(da)*2),ddz=Math.round(Math.sin(da)*2);
    clr(pc.x+ddx,fy+1,pc.z+ddz);clr(pc.x+ddx,fy+2,pc.z+ddz);
    for(let t=1;t<Ht-1;t++){
      const st=[[1,0],[0,1],[-1,0],[0,-1]][t&3];
      put(pc.x+st[0],fy+t,pc.z+st[1],STAIR_BLOCK,(t+1)&3);
    }
    for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++)put(pc.x+ox,fy+Ht,pc.z+oz,SLAB_BLOCK,0); // 頂上デッキ
    if(k<2)put(pc.x,fy+Ht+1,pc.z,CRYSTAL_BLOCK);
  }
}

// ── 崩壊した正門: 左右の門塔・欠けたアーチ・片方だけ残った巨大な扉・瓦礫 ──
function _srcMainGate(plan){
  const Rw=plan.cfg.wallR,S=plan.shoreY,gy=plan.gateY,ds=plan.doorSide;
  for(const s of[-1,1]){ // 門塔（4×4、内部は空洞。頂は海面近くまで届く）
    for(let da=-2;da<=1;da++)for(let db=4;db<=7;db++){
      const edge=da===-2||da===1||db===4||db===7;
      const p=_srcW(plan,Rw+da,s*db);
      const fyc=_srcFloorY(plan,p.x,p.z);
      const Ht=Math.min(S+4-gy,12);
      if(fyc!=null)for(let y=fyc;y<gy;y++)put(p.x,y,p.z,_srcStoneTi(p.x,y,p.z)); // 土台を床まで下ろす
      for(let t=0;t<=Ht;t++){
        if(!edge&&t>0&&t<Ht)continue; // 内部空洞
        if(t>4&&_wtHash((p.x*19)^((gy+t)*11)^(p.z*53))<0.12)continue;
        put(p.x,gy+t,p.z,_srcStoneTi(p.x,gy+t,p.z));
      }
    }
    // 門塔の内側ドア
    const pd=_srcW(plan,Rw-2,s*5);clr(pd.x,gy+1,pd.z);clr(pd.x,gy+2,pd.z);
  }
  // 欠けたアーチ（門の上に一部だけ残る）
  for(let b=-4;b<=4;b++){
    if(_wtHash((b*37)^0x9a1)<0.45)continue;
    _srcPut(plan,Rw,gy+7,b,_srcStoneTi(Rw,gy+7,b));
    if(Math.abs(b)<3)_srcPut(plan,Rw,gy+8,b,SLAB_BLOCK,0);
  }
  // 巨大な扉: 片方だけ立って残った木の扉。もう片方は内側に倒れて床に横たわる
  for(let b=1;b<=4;b++)for(let t=1;t<=6;t++){
    if(_wtHash((b*7)^(t*31)^0x77)<0.12)continue;
    _srcPut(plan,Rw,gy+t,ds*b,3);
  }
  for(let i=1;i<=4;i++)for(let j=0;j<=1;j++){
    if(_wtHash((i*19)^(j*7)^0x3c)<0.2)continue;
    _srcPut(plan,Rw-1-i,gy+1,-ds*(1+j),3);
  }
}

// ── 中央大通り: 石柱・壊れた街灯・石像・王都の旗の柱・崩落と瓦礫の迂回ポイント ──
function _srcMainAvenue(plan){
  const Rw=plan.cfg.wallR;
  for(let a=-8;a<=Rw+1;a++)for(let b=-3;b<=3;b++){
    const p=_srcW(plan,a,b);
    const fy=_srcFloorY(plan,p.x,p.z);if(fy==null)continue;
    const h=_wtHash((p.x*17)^(p.z*43));
    if(h<0.06){clr(p.x,fy,p.z);put(p.x,fy-1,p.z,DEEP_STONE);continue;} // 崩落した穴
    put(p.x,fy,p.z,h<0.4?6:h<0.8?1:DEEP_STONE);
  }
  // 瓦礫の封鎖（別ルートを探したくなる迂回ポイント）
  for(let b=-2;b<=2;b++){
    const p=_srcW(plan,10,b);
    const fy=_srcFloorY(plan,p.x,p.z);if(fy==null)continue;
    const hh=1+(_wtHash((b*97)^0x51)<0.5?0:1);
    for(let t=1;t<=hh;t++)put(p.x,fy+t,p.z,_srcStoneTi(p.x,fy+t,p.z));
  }
  // 両側の石柱と壊れた街灯（残った街灯だけがまだ淡く光る）
  for(let a=-4;a<=Rw-2;a+=6){
    for(const s of[-1,1]){
      const p=_srcW(plan,a,s*4);
      const fy=_srcFloorY(plan,p.x,p.z);if(fy==null)continue;
      const fell=_wtHash((p.x*23)^(p.z*67))<0.35;
      if(fell){ // 倒れて道側に横たわる柱
        for(let i=0;i<3;i++){
          const q=_srcW(plan,a,s*(4-i));
          const qf=_srcFloorY(plan,q.x,q.z);
          if(qf!=null)put(q.x,qf+1,q.z,6);
        }
      }else{
        for(let t=1;t<=4;t++)put(p.x,fy+t,p.z,t===4?DEEP_STONE:_srcStoneTi(p.x,fy+t,p.z));
        if((a%12+12)%12===2)put(p.x,fy+5,p.z,CRYSTAL_BLOCK); // 街灯
      }
    }
  }
  // 石像と王都の旗を掲げていた柱
  for(const s of[-1,1]){
    const p=_srcW(plan,7,s*5);const fy=_srcFloorY(plan,p.x,p.z);
    if(fy!=null){put(p.x,fy+1,p.z,CLAY_BLOCK);put(p.x,fy+2,p.z,CLAY_BLOCK);put(p.x,fy+3,p.z,WOOL_BLOCK);}
    const q=_srcW(plan,-5,s*5);const qf=_srcFloorY(plan,q.x,q.z);
    if(qf!=null){for(let t=1;t<=6;t++)put(q.x,qf+t,q.z,t>4?WOOL_BLOCK:3);} // 沈んだ旗
  }
}

// ── 住宅街の1軒: 種類（小型/二階建て/商店/倉庫/廃屋）と壊れ方・埋まり方に変化 ──
function _srcRuinHouse(plan,hd){
  const w=hd.kind===2||hd.kind===3?3:2,d=hd.kind===3?3:2;
  const H=hd.kind===1?6:hd.kind===3?5:hd.kind===2?4:3;
  const c=_srcW(plan,hd.a,hd.b);
  const fy=_srcFloorY(plan,c.x,c.z);if(fy==null)return;
  const doorB=hd.b>0?-1:1; // ドアは大通り側
  for(let ax=-w;ax<=w;ax++)for(let az=-d;az<=d;az++){
    const p=_srcW(plan,hd.a+ax,hd.b+az);
    put(p.x,fy,p.z,_wtHash((p.x*7)^(p.z*13))<0.5?1:6);                 // 床
    if(hd.buried&&Math.abs(ax)<w&&Math.abs(az)<d&&_wtHash((p.x*31)^(p.z*3))<0.5)put(p.x,fy+1,p.z,2); // 半分砂に埋まる
  }
  for(let ax=-w;ax<=w;ax++)for(let az=-d;az<=d;az++){
    if(Math.abs(ax)!==w&&Math.abs(az)!==d)continue;
    const p=_srcW(plan,hd.a+ax,hd.b+az);
    const corner=Math.abs(ax)===w&&Math.abs(az)===d;
    for(let t=1;t<=H;t++){
      const isDoorWall=az===doorB*d;
      if(isDoorWall&&t<=2&&!corner&&(hd.kind===2?Math.abs(ax)<=1:ax===0))continue; // ドア開口（商店は広い）
      if(hd.kind===4&&t>2)continue;                                      // 壁だけ残った廃屋
      if(_wtHash((p.x*31)^((fy+t)*17)^(p.z*71))<hd.dmg*(0.4+t/H))continue; // 上ほど崩れる
      const win=!corner&&t===3&&(ax===0||az===0)&&_wtHash((p.x*3)^(p.z*11))<0.3;
      put(p.x,fy+t,p.z,corner?DEEP_STONE:win?GLASS_BLOCK:_srcHouseTi(p.x,fy+t,p.z));
    }
  }
  if(hd.kind===1){ // 二階建て: 中2階の床と上り階段
    for(let ax=-w+1;ax<=w-1;ax++)for(let az=-d+1;az<=d-1;az++){
      if(_wtHash((ax*5)^(az*9)^(hd.a*3))<0.25)continue; // 抜けた床
      _srcPut(plan,hd.a+ax,fy+3,hd.b+az,SLAB_BLOCK,0);
    }
    _srcPut(plan,hd.a-w+1,fy+1,hd.b,STAIR_BLOCK,_srcSM(plan,0));
    _srcPut(plan,hd.a-w+2,fy+2,hd.b,STAIR_BLOCK,_srcSM(plan,0));
  }
  if(hd.kind===2){ // 商店: カウンターとひさし
    for(let ax=-1;ax<=1;ax++)_srcPut(plan,hd.a+ax,fy+1,hd.b,SLAB_BLOCK,0);
    for(let ax=-2;ax<=2;ax++)_srcPut(plan,hd.a+ax,fy+3,hd.b+doorB*(d+1),SLAB_BLOCK,0);
  }
  if(hd.kind===3){ // 倉庫: 木箱と土のう
    _srcPut(plan,hd.a+1,fy+1,hd.b+1,3);_srcPut(plan,hd.a+1,fy+2,hd.b+1,3);
    _srcPut(plan,hd.a-1,fy+1,hd.b+1,3);_srcPut(plan,hd.a+1,fy+1,hd.b-1,CLAY_BLOCK);
  }
  if(hd.dmg<0.24&&hd.kind!==4){ // 屋根が残っている家
    for(let ax=-w;ax<=w;ax++)for(let az=-d;az<=d;az++){
      if(_wtHash((ax*19)^(az*43)^(hd.b*7))<hd.dmg*2)continue;
      _srcPut(plan,hd.a+ax,fy+H+1,hd.b+az,SLAB_BLOCK,0);
    }
  }
}
// ── 水没した住宅街: 家々＋噴水跡の広場＋崩れた市場＋壊れていない小型ドーム ──
function _srcResidentialArea(plan){
  for(const hd of plan.houses)_srcRuinHouse(plan,hd);
  // 噴水跡: 円形の石縁と折れた水柱、わずかに残る水たまり
  {
    const c=_srcW(plan,plan.fountain.a,plan.fountain.b);
    const fy=_srcFloorY(plan,c.x,c.z);
    if(fy!=null){
      for(let ox=-3;ox<=3;ox++)for(let oz=-3;oz<=3;oz++){
        const dd=Math.hypot(ox,oz);
        if(dd>3.4)continue;
        if(dd>2.4){if(_wtHash(((c.x+ox)*11)^((c.z+oz)*29))<0.75)put(c.x+ox,fy+1,c.z+oz,6);continue;}
        put(c.x+ox,fy,c.z+oz,1);
        if(dd<1.7&&(ox!==0||oz!==0))put(c.x+ox,fy+1,c.z+oz,WATER_BLOCK); // 水たまり（数個だけ）
      }
      put(c.x,fy+1,c.z,6);put(c.x,fy+2,c.z,6); // 折れた水柱
    }
  }
  // 崩れた市場: 屋台の残骸（1軒は屋根ごと潰れている）
  for(let s=0;s<3;s++){
    const mc=_srcW(plan,plan.market.a-s,plan.market.b+(s-1)*4);
    const fy=_srcFloorY(plan,mc.x,mc.z);if(fy==null)continue;
    const fell=s===1;
    for(const[ox,oz]of[[-1,-1],[1,-1],[-1,1],[1,1]]){
      if(fell&&_wtHash((ox*3)^(oz*7)^(s*11))<0.5)continue;
      for(let t=1;t<=2;t++)put(mc.x+ox,fy+t,mc.z+oz,3);
    }
    for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++){
      if(_wtHash(((mc.x+ox)*7)^((mc.z+oz)*13)^(s*29))<(fell?0.55:0.2))continue;
      put(mc.x+ox,fell?fy+1:fy+3,mc.z+oz,SLAB_BLOCK,0);
    }
    if(!fell)put(mc.x,fy+1,mc.z,_wtHash(s*97)<0.5?WOOL_BLOCK:CLAY_BLOCK);
  }
  // 壊れていない小型ドーム（空気ポケット: 中でたいまつが灯る休憩所）
  {
    const dc=_srcW(plan,26,plan.tSide*14);
    const fy=_srcFloorY(plan,dc.x,dc.z);
    if(fy!=null){
      for(let ox=-3;ox<=3;ox++)for(let oy=0;oy<=3;oy++)for(let oz=-3;oz<=3;oz++){
        const r=Math.hypot(ox,oy,oz);
        if(r>3.4||r<2.5)continue;
        put(dc.x+ox,fy+1+oy,dc.z+oz,oy>=2&&_wtHash((ox*5)^(oz*7))<0.3?ICE_BLOCK:_srcStoneTi(dc.x+ox,fy+1+oy,dc.z+oz));
      }
      for(let ox=-2;ox<=2;ox++)for(let oz=-2;oz<=2;oz++)if(Math.hypot(ox,oz)<2.5){clr(dc.x+ox,fy+1,dc.z+oz);clr(dc.x+ox,fy+2,dc.z+oz);}
      clr(dc.x+3,fy+1,dc.z);clr(dc.x+2,fy+1,dc.z);clr(dc.x+2,fy+2,dc.z); // 入口
      put(dc.x,fy,dc.z,1);put(dc.x,fy+1,dc.z,TORCH_BLOCK); // 空気だまりの明かり
    }
  }
}

// ── 倒れた時計塔: 折れた基部＋斜めに横たわる塔身＋先端の時計盤（海面近くまで届く）──
function _srcClockTower(plan){
  const c=plan.clock,S=plan.shoreY;
  const base=_srcW(plan,c.a,c.b);
  const fy=c.baseY!=null?c.baseY:_srcFloorY(plan,base.x,base.z);if(fy==null)return;
  // 基部: 5×5 の折れた根本（上端はギザギザ）
  for(let t=1;t<=5;t++)for(let ox=-2;ox<=2;ox++)for(let oz=-2;oz<=2;oz++){
    if(Math.abs(ox)!==2&&Math.abs(oz)!==2)continue;
    if(t>3&&_wtHash(((base.x+ox)*13)^(t*7)^((base.z+oz)*47))<0.4)continue;
    put(base.x+ox,fy+t,base.z+oz,_srcStoneTi(base.x+ox,fy+t,base.z+oz));
  }
  clr(base.x+2,fy+1,base.z);clr(base.x+2,fy+2,base.z); // 基部の入口
  // 塔身: 3×3 の空洞リングが斜めに連なり、周囲の建物を押し潰しながら海面へ伸びる
  const perpA=Math.abs(c.fda)<Math.abs(c.fdb); // 断面リングを倒れる向きと直交させる
  for(let s=0;s<=c.len;s++){
    const la=c.a+c.fda*(3+s),lb=c.b+c.fdb*(3+s);
    const cy=Math.min(S+2,fy+2+Math.round(s*0.55));
    for(let o1=-1;o1<=1;o1++)for(let o2=-1;o2<=1;o2++){
      if(o1===0&&o2===0)continue; // 内部は空洞（中に入って登れる）
      const aa=perpA?la+o1:la,bb=perpA?lb:lb+o1;
      const p=_srcW(plan,Math.round(aa),Math.round(bb));
      const y=cy+o2;
      if(s<c.len&&_wtHash((p.x*23)^(y*7)^(p.z*61))<(s<4?0.34:0.1))continue; // 根本側ほど潰れている
      let ti=_srcStoneTi(p.x,y,p.z);
      if(s===c.len)ti=(o1===0||o2===0)?DEEP_STONE:WOOL_BLOCK; // 時計盤（針と白い盤面）
      else if(s>=c.len-3&&o2===1&&o1===0)ti=2;                 // 先端近くの金の縁飾り
      put(p.x,y,p.z,ti,0);
    }
    if(s%4===2){const p=_srcW(plan,Math.round(la),Math.round(lb));put(p.x,cy-1,p.z,SLAB_BLOCK,0);} // 内部の崩れた足場
    if(s===c.len){ // 時計盤の中心は遠くからでも光って見える
      const p=_srcW(plan,Math.round(la),Math.round(lb));
      put(p.x,cy,p.z,CRYSTAL_BLOCK);
    }
    if(s===c.len-2){const p=_srcW(plan,Math.round(la),Math.round(lb));put(p.x,cy+1,p.z,TORCH_BLOCK);} // 先端の空気だまり
  }
  // 反転した鐘（空気ポケット）: 根本のそばに落ちて逆さになった鐘
  {
    const bell=_srcW(plan,c.a+4,c.b+3);
    const bfy=_srcFloorY(plan,bell.x,bell.z);
    if(bfy!=null){
      for(let ox=-2;ox<=2;ox++)for(let oz=-2;oz<=2;oz++){
        const r=Math.hypot(ox,oz);
        if(r>2.4)continue;
        if(r>1.4){put(bell.x+ox,bfy+1,bell.z+oz,DEEP_STONE);put(bell.x+ox,bfy+2,bell.z+oz,DEEP_STONE);}
        put(bell.x+ox,bfy+3,bell.z+oz,DEEP_STONE);
      }
      clr(bell.x,bfy+1,bell.z);clr(bell.x,bfy+2,bell.z);clr(bell.x+2,bfy+1,bell.z); // 内部と入口
      put(bell.x,bfy+1,bell.z,TORCH_BLOCK);
    }
  }
}

// ── 海神の神殿: 長い階段・巨大な列柱・海神像・発光する円形祭壇・水路・壊れた天井 ──
function _srcSeaTemple(plan){
  const ts=plan.tSide,tfY=plan.tfY,ta=2,tb=ts*17;
  // 基壇の石畳
  for(let ax=-7;ax<=7;ax++)for(let az=-5;az<=5;az++){
    const p=_srcW(plan,ta+ax,tb+az);
    put(p.x,tfY,p.z,_srcTempleTi(p.x,tfY,p.z));
  }
  // 長い階段（大通り側へ降りる）
  for(let stp=1;stp<=3;stp++)for(let ax=-3;ax<=3;ax++){
    const p=_srcW(plan,ta+ax,tb-ts*(5+stp));
    const fy=_srcFloorY(plan,p.x,p.z);if(fy==null)continue;
    for(let y=fy;y<=tfY-stp;y++)put(p.x,y,p.z,_srcTempleTi(p.x,y,p.z));
  }
  // 巨大な列柱（根元が欠けたものや倒れたものを混ぜる＝神殿の欠損箇所）
  for(let ax=-6;ax<=6;ax+=3)for(const s of[-3,3]){
    const p=_srcW(plan,ta+ax,tb+s);
    const broke=_wtHash((p.x*29)^(p.z*67));
    if(broke<0.18){ // 倒れた柱
      for(let i=1;i<=3;i++){const q=_srcW(plan,ta+ax+i,tb+s);put(q.x,tfY+1,q.z,WOOL_BLOCK);}
      continue;
    }
    const H=broke<0.4?3:6;
    for(let t=1;t<=H;t++)put(p.x,tfY+t,p.z,t===H&&H===6?ICE_BLOCK:WOOL_BLOCK);
  }
  // 壊れた天井（列柱の上に一部だけ残る）
  for(let ax=-6;ax<=6;ax++)for(let az=-3;az<=3;az++){
    if(_wtHash((ax*17)^(az*41)^0x7e)<0.55)continue;
    _srcPut(plan,ta+ax,tfY+7,tb+az,SLAB_BLOCK,0);
  }
  // 発光する円形祭壇と、参道から祭壇へ延びる水路
  for(let ox=-2;ox<=2;ox++)for(let oz=-2;oz<=2;oz++){
    const dd=Math.hypot(ox,oz);if(dd>2.4)continue;
    const p=_srcW(plan,ta+ox,tb+oz);
    put(p.x,tfY+1,p.z,dd<1?CRYSTAL_BLOCK:ICE_BLOCK);
  }
  for(let j=3;j<=5;j++){
    const p=_srcW(plan,ta,tb-ts*j);
    put(p.x,tfY-1,p.z,2);put(p.x,tfY,p.z,WATER_BLOCK);
  }
  // 海神像: 王都を守っていた神。三叉の矛を掲げ、頭部は海面近くまで届く
  {
    const sa=ta,sb=tb+ts*4;
    for(const lx of[-1,1])for(let t=1;t<=2;t++)_srcPut(plan,sa+lx,tfY+t,sb,WOOL_BLOCK);      // 脚
    for(let lx=-1;lx<=1;lx++)for(let t=3;t<=6;t++)_srcPut(plan,sa+lx,tfY+t,sb,t===6?ICE_BLOCK:WOOL_BLOCK); // 胴
    for(const lx of[-2,2])_srcPut(plan,sa+lx,tfY+6,sb,WOOL_BLOCK);                            // 肩
    _srcPut(plan,sa-2,tfY+5,sb,WOOL_BLOCK);                                                   // 下げた腕
    for(let t=7;t<=9;t++)_srcPut(plan,sa+2,tfY+t,sb,WOOL_BLOCK);                              // 掲げた腕
    for(const lx of[1,2,3])_srcPut(plan,sa+lx,tfY+10,sb,lx===2?ICE_BLOCK:DEEP_STONE);         // 三叉の矛
    _srcPut(plan,sa+2,tfY+11,sb,ICE_BLOCK);
    for(let lx=-1;lx<=0;lx++)for(let t=7;t<=8;t++)_srcPut(plan,sa+lx,tfY+t,sb,WOOL_BLOCK);    // 頭
    _srcPut(plan,sa,tfY+9,sb,2);_srcPut(plan,sa-1,tfY+9,sb,2);                                // 金の冠
    _srcPut(plan,sa,tfY+7,sb-ts,CRYSTAL_BLOCK);                                               // 光る目
  }
  // 像の奥の祭壇室（空気ポケット: たいまつと宝箱が待つ）
  {
    for(let ax=-2;ax<=2;ax++)for(let az=0;az<=4;az++)for(let t=0;t<=4;t++){
      const edge=Math.abs(ax)===2||az===0||az===4||t===0||t===4;
      const p=_srcW(plan,ta+ax,tb+ts*(5+az));
      if(edge)put(p.x,tfY+t,p.z,_srcTempleTi(p.x,tfY+t,p.z));
      else clr(p.x,tfY+t,p.z);
    }
    const dr=_srcW(plan,ta,tb+ts*5);clr(dr.x,tfY+1,dr.z);clr(dr.x,tfY+2,dr.z); // 像の裏の入口
    const tc=_srcW(plan,ta-1,tb+ts*7);put(tc.x,tfY+1,tc.z,TORCH_BLOCK);
    const cc=_srcW(plan,ta+1,tb+ts*7);put(cc.x,tfY+1,cc.z,CRYSTAL_BLOCK);
  }
}

// ── 王宮の外殻: 外壁・4隅の塔（正面の1本は崩壊して非対称）・巨大な入口・王家の紋章・
// バルコニー・壊れたドーム屋根・海面を貫く中央尖塔 ──
function _srcRoyalPalaceShell(plan){
  const S=plan.shoreY,pfY=plan.pfY,cc=plan.collapsedCorner;
  // 床の敷石
  for(let a=-27;a<=-9;a++)for(let b=-11;b<=11;b++)_srcPut(plan,a,pfY,b,_srcPalaceTi(a*7,pfY,b*13));
  // 外壁（左右対称が基本。正面の片翼だけ崩壊している）
  for(let a=-27;a<=-9;a++)for(let b=-11;b<=11;b++){
    const edge=a===-27||a===-9||Math.abs(b)===11;
    if(!edge)continue;
    const p=_srcW(plan,a,b);
    for(let t=1;t<=7;t++){
      if(a===-9&&Math.abs(b)<=2&&t<=4)continue;                       // 巨大な正面入口
      const nearCollapse=a>-14&&b*cc>4;                                // 崩壊した翼
      if(_wtHash((p.x*31)^((pfY+t)*17)^(p.z*71))<(nearCollapse?0.45:0.08))continue;
      put(p.x,pfY+t,p.z,_srcPalaceTi(p.x,pfY+t,p.z));
    }
  }
  // 屋根（大広間の上は壊れたドームなので開けておく）
  for(let a=-27;a<=-9;a++)for(let b=-11;b<=11;b++){
    if(a>=-21&&a<=-13&&Math.abs(b)<=5)continue;
    if(_wtHash((a*13)^(b*29)^0x4b)<0.18)continue; // 崩落した屋根
    _srcPut(plan,a,pfY+8,b,SLAB_BLOCK,0);
  }
  // 壊れたドーム屋根: 半分だけ残ったアーチ
  for(let a=-21;a<=-13;a++)for(let b=-5;b<=5;b++){
    const dd=Math.hypot(a+17,b);
    if(dd>5.4||dd<3.6)continue;
    if(b*cc>0)continue; // 半分は崩落
    _srcPut(plan,a,pfY+8,b,ICE_BLOCK);
    if(dd<4.4)_srcPut(plan,a,pfY+9,b,ICE_BLOCK);
  }
  // 4隅の塔（正面の1本だけ崩壊して非対称に）
  for(const[ta,tb]of[[-9,-10],[-9,10],[-27,-10],[-27,10]]){
    const collapsed=ta===-9&&tb*cc>0;
    const p0=_srcW(plan,ta,tb);
    const Ht=collapsed?3:(ta===-9?S+2-pfY:11);
    for(let t=1;t<=Ht;t++)for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++){
      if(ox===0&&oz===0&&t<Ht)continue;
      const p=_srcW(plan,ta+ox,tb+oz);
      if(t>4&&_wtHash((p.x*19)^((pfY+t)*23)^(p.z*7))<0.08)continue;
      put(p.x,pfY+t,p.z,_srcPalaceTi(p.x,pfY+t,p.z));
    }
    if(collapsed){ // 崩れた塔の瓦礫
      for(let i=0;i<6;i++){
        const ox=((i*5)%7)-3,oz=((i*3)%5)-2;
        const p=_srcW(plan,ta+ox,tb+oz);
        if(!voxels[vKey(p.x,pfY+1,p.z)])put(p.x,pfY+1,p.z,_srcPalaceTi(p.x,pfY+1,p.z));
      }
    }else put(p0.x,pfY+Ht+1,p0.z,ICE_BLOCK); // 尖塔飾り
  }
  // 王家の紋章（入口の上: 金と白のひし形＋中心の水晶）
  for(let b=-1;b<=1;b++)for(let t=5;t<=7;t++){
    const pat=Math.abs(b)+Math.abs(t-6);
    _srcPut(plan,-9,pfY+t,b,pat===0?CRYSTAL_BLOCK:pat===1?2:WOOL_BLOCK);
  }
  // バルコニー
  for(let b=-2;b<=2;b++){_srcPut(plan,-8,pfY+4,b,SLAB_BLOCK,0);if(Math.abs(b)===2)_srcPut(plan,-8,pfY+5,b,6);}
  // 中央尖塔: 王の間の真上から海面を貫いて伸びる（海上からの最大の目印）
  for(let y=pfY+9;y<=plan.spireTop;y++)for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++){
    if(ox===0&&oz===0&&y<plan.spireTop-1)continue;
    if(y>S+2&&Math.abs(ox)+Math.abs(oz)===2)continue; // 上部は細く
    const p=_srcW(plan,-24+ox,0+oz);
    put(p.x,y,p.z,y>=plan.spireTop-1?CRYSTAL_BLOCK:_srcPalaceTi(p.x,y,p.z));
  }
}

// ── 王宮の内部: 入口ホール・大広間・崩れた食堂・王族の部屋・螺旋階段・上階の空気ポケット ──
function _srcPalaceInterior(plan){
  const pfY=plan.pfY;
  // 内部の空洞化
  for(let a=-26;a<=-10;a++)for(let b=-10;b<=10;b++)for(let t=1;t<=7;t++)_srcClr(plan,a,pfY+t,b);
  // 間仕切り: 入口ホール(-13..-9) / 大広間(-21..-13) / 王の間(-27..-21)
  for(let b=-10;b<=10;b++)for(let t=1;t<=7;t++){
    if(Math.abs(b)<=1&&t<=3)continue; // 通路
    const p1=_srcW(plan,-13,b),p2=_srcW(plan,-21,b);
    if(_wtHash((p1.x*11)^(t*5)^(p1.z*17))>0.15)put(p1.x,pfY+t,p1.z,_srcPalaceTi(p1.x,pfY+t,p1.z));
    if(_wtHash((p2.x*11)^(t*5)^(p2.z*17))>0.1)put(p2.x,pfY+t,p2.z,_srcPalaceTi(p2.x,pfY+t,p2.z));
  }
  // 大広間の列柱と絨毯の跡
  for(const a of[-19,-16])for(const b of[-4,4])for(let t=1;t<=7;t++)_srcPut(plan,a,pfY+t,b,t===7?ICE_BLOCK:WOOL_BLOCK);
  for(let a=-20;a<=-10;a++)if(_wtHash((a*7)^0x22)>0.3)_srcPut(plan,a,pfY,0,4);
  // 崩れた食堂（片翼）: 長机と散らばった壁材
  {
    const s=plan.collapsedCorner;
    for(let a=-19;a<=-15;a++)_srcPut(plan,a,pfY+1,s*7,SLAB_BLOCK,0);
    _srcPut(plan,-17,pfY+1,s*6,3);_srcPut(plan,-19,pfY+1,s*8,3);
    for(let i=0;i<4;i++)_srcPut(plan,-15+((i*3)%4),pfY+1,s*(8+(i%2)),6);
  }
  // 王族の部屋（反対翼）: ベッドの残骸と装飾
  {
    const s=-plan.collapsedCorner;
    _srcPut(plan,-18,pfY+1,s*8,WOOL_BLOCK);_srcPut(plan,-17,pfY+1,s*8,4);
    _srcPut(plan,-19,pfY+1,s*7,GLASS_BLOCK);_srcPut(plan,-15,pfY+1,s*8,CRYSTAL_BLOCK);
  }
  // 螺旋階段（奥の塔内）: 上階の見張り室（空気ポケット）へ
  {
    const s=-plan.collapsedCorner;
    for(let t=1;t<=9;t++){
      const st=[[0,-1],[1,0],[0,1],[-1,0]][t&3];
      _srcPut(plan,-25+st[0],pfY+t,s*8+st[1],STAIR_BLOCK,_srcSM(plan,(t+1)&3));
    }
    for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++)_srcPut(plan,-25+ox,pfY+10,s*8+oz,SLAB_BLOCK,0);
    for(let ox=-2;ox<=2;ox++)for(let oz=-2;oz<=2;oz++)for(let t=11;t<=13;t++){
      const edge=Math.abs(ox)===2||Math.abs(oz)===2||t===13;
      if(!edge)continue;
      const win=t===12&&(ox===0||oz===0);
      _srcPut(plan,-25+ox,pfY+t,s*8+oz,win?GLASS_BLOCK:_srcPalaceTi(ox*3,pfY+t,oz*5));
    }
    _srcPut(plan,-25,pfY+11,s*8,TORCH_BLOCK); // 空気だまりの明かり
  }
}

// ── 王の間: 高い天井・玉座・倒れた騎士像・王家の旗・王冠の装飾・宝物庫への隠し通路 ──
function _srcThroneRoom(plan){
  const pfY=plan.pfY;
  // 天井を他の部屋より高く（+9）掘り上げ、光る夜空のような天井にする
  for(let a=-26;a<=-22;a++)for(let b=-6;b<=6;b++){
    _srcClr(plan,a,pfY+8,b);
    _srcPut(plan,a,pfY+9,b,_wtHash((a*31)^(b*17))<0.12?CRYSTAL_BLOCK:_srcPalaceTi(a*11,pfY+9,b*3));
  }
  // 玉座の壇と玉座（金と白、頭上に王冠を模した飾り）
  for(let a=-27;a<=-25;a++)for(let b=-2;b<=2;b++)_srcPut(plan,a,pfY+1,b,a===-27?2:WOOL_BLOCK);
  _srcPut(plan,-26,pfY+2,0,2);                       // 座面（金）
  for(let t=2;t<=4;t++)_srcPut(plan,-27,pfY+t,0,WOOL_BLOCK); // 背もたれ
  _srcPut(plan,-26,pfY+2,-1,2);_srcPut(plan,-26,pfY+2,1,2);  // ひじ掛け
  _srcPut(plan,-27,pfY+5,0,CRYSTAL_BLOCK);           // 王冠の宝玉
  for(const b of[-1,1])_srcPut(plan,-27,pfY+4,b,2);  // 王冠の縁
  // 倒れた騎士像（玉座へ続く道の両脇に横たわる）
  for(const s of[-1,1]){
    for(let i=0;i<3;i++)_srcPut(plan,-22+i,pfY+1,s*3,i===2?WOOL_BLOCK:6);
    _srcPut(plan,-24,pfY+1,s*4,DEEP_STONE); // 転がった兜
  }
  // 王家の旗と青い残光、王都の最後を示す瓦礫
  for(const s of[-1,1]){
    for(let t=5;t<=7;t++)_srcPut(plan,-23,pfY+t,s*6,t===5?3:WOOL_BLOCK);
    _srcPut(plan,-25,pfY+1,s*5,CRYSTAL_BLOCK);
  }
  for(let i=0;i<5;i++){
    const a=-22+((i*3)%4),b=((i*5)%9)-4;
    const p=_srcW(plan,a,b);
    if(!voxels[vKey(p.x,pfY+1,p.z)])put(p.x,pfY+1,p.z,_srcPalaceTi(p.x,pfY+1,p.z));
  }
}

// ── 地下宝物庫: 王の間の床下の封印を破って降りる密室（空気ポケット）。金塊・王冠・
// 武器庫・古代の装置・封印された扉・発光する結晶・宝箱 ──
function _srcSunkenTreasureVault(plan){
  const pfY=plan.pfY,vfY=plan.vfY,vb=plan.vault.bOff;
  // 部屋の殻（床 vfY・壁は深石と黒曜石・天井は王宮の床がそのまま蓋になる）
  for(let a=-23;a<=-13;a++)for(let b=-4;b<=4;b++){
    const edge=a===-23||a===-13||b===-4||b===4;
    const p=_srcW(plan,a,b);
    for(let y=vfY;y<=pfY;y++){
      if(y===vfY||y===pfY||edge)put(p.x,y,p.z,y===vfY?DEEP_STONE:_wtHash((p.x*3)^(y*7)^(p.z*11))<0.85?DEEP_STONE:OBSIDIAN_BLOCK);
      else clr(p.x,y,p.z);
    }
  }
  // 隠し入口: 王の間の床の黒曜石の封印（壊すと宝物庫内の階段に降りられる）
  {
    const eb=plan.vault.entB;
    const dp=_srcW(plan,-22,eb);
    for(let y=vfY+1;y<pfY;y++)clr(dp.x,y,dp.z);
    put(dp.x,pfY,dp.z,OBSIDIAN_BLOCK); // 封印された扉（床の封印）
    // 内部の降下階段
    const s1=_srcW(plan,-21,eb),s2=_srcW(plan,-20,eb);
    put(s1.x,vfY+2,s1.z,STAIR_BLOCK,_srcSM(plan,2));
    put(s2.x,vfY+1,s2.z,STAIR_BLOCK,_srcSM(plan,2));
  }
  // 金塊の山・王冠の台座・武器庫・古代の装置・結晶・たいまつ（空気ポケット）
  for(const[oa,ob,h]of[[-22,vb-3,2],[-21,vb-2,1],[-15,vb+3,2],[-14,vb+2,1],[-16,vb-3,1]]){
    for(let t=1;t<=Math.max(1,h);t++)_srcPut(plan,oa,vfY+t,Math.max(-3,Math.min(3,ob)),2); // 金色のブロック
  }
  _srcPut(plan,-18,vfY+1,0,1);_srcPut(plan,-18,vfY+2,0,2);_srcPut(plan,-18,vfY+3,0,CRYSTAL_BLOCK); // 王冠の台座
  for(const ob of[-2,0,2])_srcPut(plan,-14,vfY+1,ob,3); // 武器庫の掛け台
  _srcPut(plan,-22,vfY+1,3,OBSIDIAN_BLOCK);_srcPut(plan,-22,vfY+2,3,DIAMOND_ORE); // 古代の装置
  _srcPut(plan,-22,vfY+3,3,CRYSTAL_BLOCK);
  _srcPut(plan,-15,vfY+1,-3,CRYSTAL_BLOCK);_srcPut(plan,-21,vfY+1,3,CRYSTAL_BLOCK); // 発光する結晶
  _srcPut(plan,-17,vfY+1,-3,TORCH_BLOCK);_srcPut(plan,-19,vfY+1,3,TORCH_BLOCK);     // 空気だまりの明かり
}

// ── 巨大生物の骨: 頭蓋骨・長い背骨・肋骨・尾の骨。位置と向きはランダムで、
// 城壁や建物に絡みつくこともある ──
function _srcSeaCreatureSkeleton(plan){
  const ba=plan.bone.a,bb=plan.bone.b,ang=plan.bone.ang;
  const ca=Math.cos(ang),cb=Math.sin(ang);
  const c0=_srcW(plan,ba,bb);
  const fy0=_srcFloorY(plan,c0.x,c0.z);if(fy0==null)return;
  // 頭蓋骨（空洞、目のくぼみと開いた口）
  for(let ox=-1;ox<=2;ox++)for(let oy=0;oy<=2;oy++)for(let oz=-1;oz<=1;oz++){
    const edge=ox===-1||ox===2||oy===0||oy===2||Math.abs(oz)===1;
    if(!edge)continue;
    if(oy===1&&ox===2)continue; // 口
    const p=_srcW(plan,Math.round(ba-ca*3)+ox,Math.round(bb-cb*3)+oz);
    put(p.x,fy0+1+oy,p.z,WOOL_BLOCK);
  }
  {
    const p=_srcW(plan,Math.round(ba-ca*3)+2,Math.round(bb-cb*3)-1);
    clr(p.x,fy0+2,p.z); // 目のくぼみ
  }
  // 背骨と肋骨のアーチ
  for(let s=0;s<=14;s++){
    const la=ba+ca*s,lb=bb+cb*s;
    const p=_srcW(plan,Math.round(la),Math.round(lb));
    const fy=_srcFloorY(plan,p.x,p.z);if(fy==null)continue;
    const yy=fy+1+(s>10?0:1);
    put(p.x,yy,p.z,WOOL_BLOCK); // 背骨
    if(s>=2&&s<=9&&(s&1)===0){
      for(const sd of[-1,1]){
        if(_wtHash((s*13)^(sd*7)^(plan.cx))<0.25)continue; // 折れて失われた肋骨
        for(const[r,dy]of[[1,1],[1,2],[2,2],[3,1],[3,0]]){
          const q=_srcW(plan,Math.round(la-cb*sd*r),Math.round(lb+ca*sd*r));
          const qf=_srcFloorY(plan,q.x,q.z);if(qf==null)continue;
          put(q.x,Math.max(qf+1,yy+dy),q.z,WOOL_BLOCK);
        }
      }
    }
  }
  // 尾の骨（先細りで途切れ途切れ）
  for(let s=15;s<=19;s++){
    if(_wtHash((s*29)^0x60)<0.2)continue;
    const p=_srcW(plan,Math.round(ba+ca*s),Math.round(bb+cb*s));
    const fy=_srcFloorY(plan,p.x,p.z);if(fy==null)continue;
    put(p.x,fy+1,p.z,WOOL_BLOCK);
  }
}

// ── 水中遺跡の装飾: 海藻・サンゴ・貝・発光植物・青い結晶・錆びた鎖・壊れた船・沈んだ旗 ──
// 量は kelpMul と端末（スマホは約6割）でスケールし、動作が重くならない範囲に抑える
function _srcUnderwaterDecorations(plan){
  const R=plan.cfg.basinR;
  const mul=plan.kelpMul*(isTouch?0.6:1);
  for(let dx=-R+2;dx<=R-2;dx++)for(let dz=-R+2;dz<=R-2;dz++){
    if(dx*dx+dz*dz>(R-2)*(R-2))continue;
    const x=plan.cx+dx,z=plan.cz+dz;
    const h=_wtHash((x*73856093)^(z*19349663)^0x3ea)/mul;
    if(h>=0.022)continue;
    const fy=_srcFloorY(plan,x,z);if(fy==null)continue;
    if(voxels[vKey(x,fy+1,z)])continue; // 建物の中や瓦礫の上には生やさない
    if(h<0.009){ // 海藻（1〜3段）
      const kh=1+Math.floor(_wtHash((x*7)^(z*31))*3);
      for(let t=1;t<=kh;t++)put(x,fy+t,z,LEAF_BLOCK);
    }else if(h<0.014){ // サンゴと貝
      put(x,fy+1,z,4);
      if(_wtHash((x*3)^(z*17))<0.5)put(x+1,fy+1,z,CLAY_BLOCK);
    }else if(h<0.018)put(x,fy+1,z,MUSHROOM_BLOCK); // 発光植物
    else put(x,fy+1,z,CRYSTAL_BLOCK);              // 青い結晶
  }
  // 錆びた鎖: 監視塔から垂れて海底へ弧を描く
  for(const th of[0.75,-1.6]){
    for(let i=0;i<7;i++){
      const rr=plan.cfg.wallR-1-i;
      const p=_srcW(plan,Math.round(Math.cos(th)*rr),Math.round(Math.sin(th)*rr));
      const fy=_srcFloorY(plan,p.x,p.z);if(fy==null)continue;
      const y=Math.max(fy+1,plan.shoreY-1-i*2);
      put(p.x,y,p.z,DEEP_STONE);
    }
  }
  // 壊れた船: 竜骨と肋材だけ残った沈没船
  {
    const th=plan.shipTh,sa=Math.cos(th)*(R-8),sb=Math.sin(th)*(R-8);
    const da=Math.cos(th+Math.PI/2),db=Math.sin(th+Math.PI/2);
    for(let i=-4;i<=4;i++){
      const p=_srcW(plan,Math.round(sa+da*i),Math.round(sb+db*i));
      const fy=_srcFloorY(plan,p.x,p.z);if(fy==null)continue;
      if(_wtHash((i*41)^0x9)<0.25)continue; // 朽ちて欠けた竜骨
      put(p.x,fy+1,p.z,3);
      if((i&1)===0&&Math.abs(i)<4){ // 肋材
        for(const sd of[-1,1]){
          const q=_srcW(plan,Math.round(sa+da*i-db*sd),Math.round(sb+db*i+da*sd));
          const qf=_srcFloorY(plan,q.x,q.z);if(qf!=null){put(q.x,qf+1,q.z,3);put(q.x,qf+2,q.z,3);}
        }
      }
    }
  }
  // 広場の沈んだ旗
  for(const[fa,fb]of[[5,6],[3,-6],[8,0]]){
    const p=_srcW(plan,fa,fb);
    const fy=_srcFloorY(plan,p.x,p.z);if(fy==null)continue;
    for(let t=1;t<=4;t++)put(p.x,fy+t,p.z,t>3?WOOL_BLOCK:3);
  }
}

// ── 状態登録・海面メッシュ・仕上げ ──
function _srcRegister(plan,st){
  sunkenRoyalCity={
    cx:plan.cx,cz:plan.cz,rot:plan.rot,shoreY:plan.shoreY,waterY:plan.waterY,
    R:plan.cfg.basinR,wallR:plan.cfg.wallR,
    chestSpots:plan.chestSpots.map(s=>{const p=_srcW(plan,s.a,s.b);return{x:p.x,y:s.y,z:p.z};}),
    restored:st.restored,visual:null,sea:null,
  };
}
// 海面: 水ブロックを数千個並べる代わりの1枚の半透明メッシュ。プレイヤーが
// 近づいたときだけ作られ、遠距離では非表示になる（マテリアルも1つだけ増える）
function _srcBuildVisuals(){
  const C=sunkenRoyalCity;if(!C||C.visual)return;
  const g=new THREE.Group();
  const sea=new THREE.Mesh(
    new THREE.CircleGeometry(C.R-1,48),
    new THREE.MeshStandardMaterial({color:0x1d6f95,transparent:true,opacity:.52,roughness:.15,metalness:.05,side:THREE.DoubleSide,depthWrite:false})
  );
  sea.rotation.x=-Math.PI/2;
  sea.position.set(C.cx+.5,C.waterY,C.cz+.5);
  g.add(sea);
  scene.add(g);
  C.visual=g;C.sea=sea;
}
function resetSunkenRoyalCity(){
  const C=sunkenRoyalCity;if(!C)return;
  if(C.visual){
    scene.remove(C.visual);
    C.visual.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
  }
  sunkenRoyalCity=null;
}
// 生成直後、まだ表示対象でない都市チャンクの水・たいまつ等の個別メッシュを
// シーンから外して休眠させる（表示は updateChunks が引き受ける）
function _srcHideDormant(){
  const C=sunkenRoyalCity;if(!C)return;
  const half=C.R+4;
  for(let cx=Math.floor((C.cx-half)/CHUNK);cx<=Math.floor((C.cx+half)/CHUNK);cx++)
    for(let cz=Math.floor((C.cz-half)/CHUNK);cz<=Math.floor((C.cz+half)/CHUNK);cz++){
      const sk=cKey(cx,cz);
      if(chunks[sk]&&!activeChunks[sk])_hideRec(chunks[sk]);
      for(const cy of[-1,-2]){
        const key=ucKey(cx,cy,cz);
        if(underChunks[key]&&!activeUnderChunks[key])_hideRec(underChunks[key]);
      }
    }
}
function _srcFinalize(plan){
  _srcRegister(plan,{restored:true});
  for(const s of sunkenRoyalCity.chestSpots)_srcPlaceChest(s.x,s.y,s.z);
  _srcBuildVisuals();
  _srcHideDormant();
}

// ── ロード後の復元: 宝箱メッシュはセッション内オブジェクトなので、都市チャンクが
// 実体化したタイミングで作り直す（ブロックは worldEdits が復元する）──
function _srcRestore(){
  const C=sunkenRoyalCity;if(!C||C.restored)return;
  if(!recAt(C.cx,C.shoreY-14,C.cz))return; // 都市チャンク未生成: 次のフレームで再試行
  C.restored=true;
  for(const s of C.chestSpots)_srcPlaceChest(s.x,s.y,s.z);
}

// ── 毎フレーム更新（main.js の tick から呼ばれる）: 遠距離では海面を隠すだけ。
// 海中（盆地の内側かつ水面より下）では青いフォグ・暗い光・空の非表示で水中らしさを
// 出す。フォグや光は updateSky が毎フレーム再設定するので、ここで上書きしても
// 海から出れば次のフレームで自然に元へ戻る ──
function srcUpdate(dt){
  const C=sunkenRoyalCity;if(!C)return;
  const pd=Math.hypot(P.x-C.cx,P.z-C.cz);
  if(!C.restored&&pd<C.R+40)_srcRestore();
  if(pd>C.R+95){if(C.visual)C.visual.visible=false;return;}
  if(!C.visual)_srcBuildVisuals();else C.visual.visible=true;
  if(C.sea)C.sea.material.opacity=.5+Math.sin(performance.now()*.0011)*.05; // かすかな波のゆらぎ
  if(pd<C.R-1&&P.y+1.4<C.waterY){ // 海中
    const depth=Math.max(0,C.waterY-P.y);
    const k=Math.min(1,depth/14);
    scene.fog.color.setRGB(.02+.05*(1-k),.10+.10*(1-k),.16+.12*(1-k));
    renderer.setClearColor(scene.fog.color);
    scene.fog.near=7;scene.fog.far=40-14*k;
    skyMesh.visible=false;
    sunSprite.visible=false;moonSprite.visible=false; // fog:false のスプライトは水中では隠す
    hemLight.color.setRGB(.15,.35,.5);hemLight.intensity=Math.max(.14,.5-.3*k);
    sun.intensity=Math.max(.05,.5-.4*k);
  }
}

// ── セーブ / ロード（既存セーブに sunkenCity フィールドを追加。無ければ未生成扱い）──
function srcSaveState(){
  const C=sunkenRoyalCity;if(!C)return null;
  return{generated:true,cx:C.cx,cz:C.cz,rot:C.rot,shoreY:C.shoreY};
}
function srcLoadState(d){
  resetSunkenRoyalCity();
  if(!d||!d.generated||typeof d.cx!=='number'||typeof d.cz!=='number')return;
  try{
    // レイアウトは seed＋保存座標から決定的に再導出する（ブロックは worldEdits が復元）
    const site={cx:d.cx,cz:d.cz,shoreY:(typeof d.shoreY==='number')?d.shoreY:2,rot:d.rot|0};
    const plan=_srcPlan(_wtRng(_srcSeed(d.cx,d.cz)),site);
    _srcRegister(plan,{restored:false});
  }catch(e){console.warn('沈んだ王都: セーブ復元に失敗',e);sunkenRoyalCity=null;}
}

// ── updateChunks 連携: 王都の深部（cy=-2）は既定では「地下にいるとき」しか
// 生成・表示されないが、海面越しに上から見えるため、都市の範囲だけは常に扱う ──
function _srcEnsureChunks(pcx,pcz){
  const C=sunkenRoyalCity;if(!C)return false;
  const half=C.R+4;
  let grew=false,made=0;
  for(let cx=Math.floor((C.cx-half)/CHUNK);cx<=Math.floor((C.cx+half)/CHUNK);cx++)
    for(let cz=Math.floor((C.cz-half)/CHUNK);cz<=Math.floor((C.cz+half)/CHUNK);cz++){
      if(Math.max(Math.abs(cx-pcx),Math.abs(cz-pcz))>DRAW_R+1)continue;
      if(!underChunks[ucKey(cx,-2,cz)]){
        generateUnderChunk(cx,-2,cz);grew=true;
        if(++made>=10)return grew; // 1回の生成量を制限（処理落ち防止。残りは次回）
      }
    }
  return grew;
}
function _srcShowChunks(neededU,pcx,pcz){
  const C=sunkenRoyalCity;if(!C)return;
  const half=C.R+4;
  for(let cx=Math.floor((C.cx-half)/CHUNK);cx<=Math.floor((C.cx+half)/CHUNK);cx++)
    for(let cz=Math.floor((C.cz-half)/CHUNK);cz<=Math.floor((C.cz+half)/CHUNK);cz++){
      if(Math.max(Math.abs(cx-pcx),Math.abs(cz-pcz))>DRAW_R)continue;
      const key=ucKey(cx,-2,cz);
      if(!underChunks[key])continue;
      neededU[key]=true;showUnderChunk(cx,-2,cz);
    }
}

// ── 生成の入口: フェーズ分割（1フェーズ/フレーム）で処理落ちを避ける ──
function generateSunkenRoyalCity(){
  if(_srcBusy){showBonus('🌊 海底に沈んだ王都を生成中…');return;}
  if(sunkenRoyalCity){showBonus('🌊 沈んだ王都はすでに存在する（中心: X '+sunkenRoyalCity.cx+' / Z '+sunkenRoyalCity.cz+'）');return;}
  if(!window.confirm('「海底に沈んだ王都」を生成します。前方に巨大な海が生まれ、その底にかつて栄えた王都が沈んでいます。海面から見える尖塔を目印に潜り、王宮の最深部と地下宝物庫を目指しましょう。生成しますか？'))return;
  _srcBusy=true;_srcSetProgress(true,0);
  let plan;
  try{
    const anchor=_frontAnchor(SUNKEN_CITY_CFG.anchorDist);
    const site=_srcFindSite(anchor)||{cx:anchor.cx0,cz:anchor.cz0,hmin:0,hmax:2};
    site.shoreY=Math.max(2,Math.min(4,Math.round((site.hmin+site.hmax)/2)+1));
    site.rot=((Math.round((anchor.aim+Math.PI)/(Math.PI/2))%4)+4)%4; // 正門がプレイヤー側を向く
    plan=_srcPlan(_wtRng(_srcSeed(site.cx,site.cz)),site);
  }catch(e){
    console.error('沈んだ王都: 準備中にエラー',e);
    _srcBusy=false;_srcSetProgress(false);showBonus('⚠ 海底に沈んだ王都の生成に失敗しました');return;
  }
  // 必要チャンク（地表＋地下2階層）をフレーム分割で実体化してから、区画ごとに組み上げる
  const R=SUNKEN_CITY_CFG.basinR;
  const jobs=[],ujobs=[];
  for(let cx=Math.floor((plan.cx-R-4)/CHUNK);cx<=Math.floor((plan.cx+R+4)/CHUNK);cx++)
    for(let cz=Math.floor((plan.cz-R-4)/CHUNK);cz<=Math.floor((plan.cz+R+4)/CHUNK);cz++){
      jobs.push([cx,cz]);ujobs.push([cx,-1,cz],[cx,-2,cz]);
    }
  const phases=[];
  for(let i=0;i<jobs.length;i+=4){const part=jobs.slice(i,i+4);phases.push(()=>{for(const[cx,cz]of part)generateChunk(cx,cz);});}
  for(let i=0;i<ujobs.length;i+=10){const part=ujobs.slice(i,i+10);phases.push(()=>{for(const[cx,cy,cz]of part)generateUnderChunk(cx,cy,cz);});}
  phases.push(()=>_srcBasinQuarter(plan,-1,-1));
  phases.push(()=>_srcBasinQuarter(plan,1,-1));
  phases.push(()=>_srcBasinQuarter(plan,-1,1));
  phases.push(()=>_srcBasinQuarter(plan,1,1));
  phases.push(()=>_srcShoreAndRim(plan));
  phases.push(()=>_srcCityWall(plan));
  phases.push(()=>_srcMainGate(plan));
  phases.push(()=>_srcMainAvenue(plan));
  phases.push(()=>_srcResidentialArea(plan));
  phases.push(()=>_srcClockTower(plan));
  phases.push(()=>_srcSeaTemple(plan));
  phases.push(()=>_srcRoyalPalaceShell(plan));
  phases.push(()=>{_srcPalaceInterior(plan);_srcThroneRoom(plan);});
  phases.push(()=>_srcSunkenTreasureVault(plan));
  phases.push(()=>_srcSeaCreatureSkeleton(plan));
  phases.push(()=>_srcUnderwaterDecorations(plan));
  phases.push(()=>_srcFinalize(plan));
  let idx=0;
  const step=()=>{
    try{
      _deferDirty=true;phases[idx]();idx++;
      _deferDirty=false;flushDirtyChunks();
      _srcSetProgress(true,idx/phases.length);
      if(idx<phases.length)requestAnimationFrame(step);
      else{
        _srcBusy=false;_srcSetProgress(false);
        showAlert('🌊 海面の下に巨大な都市の影が見える…');
        showBonus('海底に沈んだ王都を生成！ 中心 X '+plan.cx+' / Z '+plan.cz+'（尖塔を目印に潜ろう）');
        playTone(196,.3,.12,'triangle');setTimeout(()=>playTone(147,.35,.12,'triangle'),240);
      }
    }catch(e){
      console.error('沈んだ王都: 生成中にエラー',e);
      _deferDirty=false;try{flushDirtyChunks();}catch(_){}
      _srcBusy=false;_srcSetProgress(false);showBonus('⚠ 海底に沈んだ王都の生成に失敗しました');
    }
  };
  requestAnimationFrame(step);
}
