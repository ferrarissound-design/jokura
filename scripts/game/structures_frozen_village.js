// ============================================================================
// jokura / structures_frozen_village.js
// ⏳ 時間が止まった村 ワンクリック生成＋時間停止の解除イベント
// world.js から分割されたファイルの一部。全スクリプトは index.html の PARTS の
// 順序で <script> として読み込まれ、同一のグローバルスコープを共有する。
// このファイルは world.js（地形・チャンク・ブロック定義）より後、
// structures_registry.js（生成関数を登録テーブルで参照）より前に読み込まれる。
// ============================================================================

// ═══ ⏳ 時間が止まった村 ワンクリック生成 ═══
// クリエイティブ専用: プレイヤー前方の「比較的平坦な地上」に、襲撃のまっただ中で
// 時間が停止した小さな村を生成する。遠くからは普通の村に見えるが、近づくと
// 「空中で静止した矢」「倒れかけの木」「崩れる途中の屋根」「浮遊する瓦礫」
// 「流れ出す途中で凍りついた水（氷ブロック）」「燃え広がる途中の炎」
// 「逃走・攻撃・転倒の途中で止まった敵」が見える。中央の巨大な時間結晶
// （青/水色/白/紫の発光ブロック＋グロースプライト）を規定回数壊すと、
// releaseFrozenVillage() が短い間隔で段階的に時間を再生し、村は襲撃が
// 再開された危険な場所に変化する。
// 停止は「この村に属するオブジェクト（敵は e.frozen フラグ、水は氷、矢は
// 静止メッシュ）」だけを対象にし、ワールド全体の時間には一切影響しない。
// 賢者の樹庭・眠れる石神・逆さ城と同じ共有ヘルパー（put/clr/_frontAnchor/
// _ensureChunksAround/_footprintYBase/surfaceHeightAt/_wtRng/_wtHash）を使い、
// requestAnimationFrame でフェーズ分割して処理落ちを避ける。
//
// 既知の制約（他の特殊生成と同じ）: ブロックは worldEdits で永続化されるが、
// 停止中の敵・矢・炎・宝箱メッシュ・結晶の耐久はセッション内限り。セーブ＆
// ロード後は結晶が「ただの結晶ブロックの塔」として残る。
// ── 調整用パラメータ（村の大きさ・家の数・矢/敵/瓦礫の量・結晶耐久・演出速度）──
const FROZEN_VILLAGE_CFG={
  anchorDist:42,          // プレイヤー前方の生成距離（初期地点・プレイヤーから離す）
  villageR:17,            // 村の半径（整地・配置範囲）
  houseCount:{min:4,max:7}, // 家の軒数
  arrowCount:9,           // 空中で静止する矢の本数
  flameCount:5,           // 燃え広がる途中で止まった炎の数
  debrisCount:12,         // 浮遊瓦礫の最大数（うち一部が解除時に落下）
  enemyInner:4,           // 村内の停止中の敵
  enemyOuter:3,           // 村の外周の停止中の敵
  crystalHp:4,            // 時間結晶の耐久（結晶ブロックを壊す回数）
  treasureCount:5,        // 宝箱の数
  replayStepMs:450,       // 解除演出の1段階の間隔（ms）: 小さいほど速く再生
};
// スマホは静止オブジェクトを少し減らして負荷を抑える
function _ftvN(n){return isTouch?Math.max(2,Math.round(n*0.7)):n;}

// 村の実行時状態（セッション内のみ）。null=村なし
let frozenVillage=null;

// 生成進捗オーバーレイ（世界樹のものを流用。ラベルだけ差し替えて使い終わりに戻す）
function _ftvSetProgress(show,frac){
  const el=document.getElementById('worldTreeProgress');if(!el)return;
  const lbl=document.getElementById('wtpLabel');
  el.style.display=show?'':'none';
  if(show){if(lbl)lbl.textContent='⏳ 時間が止まった村を生成中…';const fill=document.getElementById('wtpFill');if(fill)fill.style.width=Math.round((frac||0)*100)+'%';}
  else if(lbl)lbl.textContent='🌳 世界樹を生成中…';
}

// ── カメラ揺れ（結晶破壊演出用）: main.js の tick がカメラ位置決定後に呼ぶ ──
let _ftvShakeT=0,_ftvShakeDur=0,_ftvShakeAmp=0;
function ftvShake(amp,dur){_ftvShakeAmp=Math.max(_ftvShakeAmp,amp);_ftvShakeT=Math.max(_ftvShakeT,dur);_ftvShakeDur=Math.max(_ftvShakeDur,dur);}
function ftvApplyCamShake(dt){
  if(_ftvShakeT<=0)return;
  _ftvShakeT-=dt;
  if(_ftvShakeT<=0){_ftvShakeT=0;_ftvShakeDur=0;_ftvShakeAmp=0;return;}
  const f=_ftvShakeAmp*(_ftvShakeT/(_ftvShakeDur||1));
  camera.position.x+=(Math.random()-.5)*f;
  camera.position.y+=(Math.random()-.5)*f*.6;
  camera.position.z+=(Math.random()-.5)*f;
}

// ── 静止オブジェクト用の共有ジオメトリ/マテリアル（disposeは複製マテリアルのみ）──
// 矢: 軸(シャフト)を細長くして飛翔ラインが見えるようにし、先端に矢じり(コーン)を
// 子メッシュとして付ける。矢じりのジオメトリ/マテリアルは全ての矢で共有し複製しない
// （combat.js の arrowMat 等ベーステンプレートと同じ扱いで、disposeは不要）
const _ftvArrowGeo=new THREE.BoxGeometry(.08,.08,.7);
const _ftvArrowMat=new THREE.MeshBasicMaterial({color:0xddaa44});
const _ftvFireArrowMat=new THREE.MeshBasicMaterial({color:0xff5533});
const _ftvArrowHeadGeo=new THREE.ConeGeometry(.09,.26,5);
const _ftvArrowHeadMat=new THREE.MeshBasicMaterial({color:0xccccc4});
const _ftvFlameGeoA=new THREE.BoxGeometry(.55,.6,.55);
const _ftvFlameGeoB=new THREE.BoxGeometry(.3,.5,.3);
const _ftvFlameMatA=new THREE.MeshBasicMaterial({color:0xff7722,transparent:true,opacity:.92});
const _ftvFlameMatB=new THREE.MeshBasicMaterial({color:0xffdd55,transparent:true,opacity:.95});
// 結晶の頭上に置くグロースプライト: 村のどこからでも青白い光として目立つ
function _ftvGlowSprite(){
  const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
  const g=x.createRadialGradient(32,32,2,32,32,30);
  g.addColorStop(0,'rgba(210,255,255,.95)');g.addColorStop(.4,'rgba(120,220,255,.5)');g.addColorStop(1,'rgba(150,120,255,0)');
  x.fillStyle=g;x.fillRect(0,0,64,64);
  const t=new THREE.CanvasTexture(c);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
  sp.scale.set(7,7,1);
  return sp;
}

// ── 平坦地探索: アンカー周辺の候補地から「高低差が最小・湖(h=0)なし・既存の地上
// 構造物と重ならない・プレイヤーから十分離れている」場所を選ぶ ──
function _ftvNearStruct(cx,cz,r){
  if(typeof structAt!=='function'||typeof STRUCT_GRID==='undefined')return false;
  for(let gx=Math.floor((cx-r)/STRUCT_GRID);gx<=Math.floor((cx+r)/STRUCT_GRID);gx++)
    for(let gz=Math.floor((cz-r)/STRUCT_GRID);gz<=Math.floor((cz+r)/STRUCT_GRID);gz++){
      const s=structAt(gx,gz);
      if(s&&Math.hypot(s.wx-cx,s.wz-cz)<r)return true;
    }
  return false;
}
function _ftvFindSite(anchor){
  const R=FROZEN_VILLAGE_CFG.villageR;
  const cands=[[0,0]];
  for(let ring=1;ring<=2;ring++)for(let a=0;a<8;a++){
    const ang=a*Math.PI/4;
    cands.push([Math.round(Math.cos(ang)*ring*12),Math.round(Math.sin(ang)*ring*12)]);
  }
  let best=null,bestScore=Infinity;
  for(const[ox,oz]of cands){
    const cx=anchor.cx0+ox,cz=anchor.cz0+oz;
    if(Math.hypot(cx-P.x,cz-P.z)<R+8)continue;        // プレイヤーを巻き込まない
    if(_ftvNearStruct(cx,cz,R+8))continue;             // 既存の地上構造物を避ける
    let hmin=Infinity,hmax=-Infinity,ok=true;
    for(let dx=-R;dx<=R&&ok;dx+=4)for(let dz=-R;dz<=R;dz+=4){
      if(dx*dx+dz*dz>R*R)continue;
      const h=getHeight(cx+dx,cz+dz);
      if(h<1){ok=false;break;}                         // 湖・水際を避ける
      if(h<hmin)hmin=h;if(h>hmax)hmax=h;
    }
    if(!ok)continue;
    const score=(hmax-hmin)+Math.hypot(ox,oz)*0.05;    // 平坦さ優先、僅差なら近い方
    if(score<bestScore){bestScore=score;best={cx,cz};}
  }
  return best;
}

// ── 設計図: 家・井戸・畑・見張り台を重ならない角度スロットに割り当てる ──
function _planFrozenVillage(rng,site){
  const cfg=FROZEN_VILLAGE_CFG;
  const ybase=_footprintYBase(site.cx,site.cz,cfg.villageR,4);
  const nH=cfg.houseCount.min+Math.floor(rng()*(cfg.houseCount.max-cfg.houseCount.min+1));
  // raidAngle: 襲撃者が村の外からやってきた方角（村中心から見た方角）。
  // raidDX/DZ はその逆＝襲撃が村の中へ進む方向（矢の飛翔・瓦礫の落下方向を揃えるのに使う）
  const raidAngle=rng()*Math.PI*2;
  const plan={
    cfg,cx0:site.cx,cz0:site.cz,R:cfg.villageR,ybase,rng,
    raidAngle,raidDX:Math.cos(raidAngle+Math.PI),raidDZ:Math.sin(raidAngle+Math.PI),
    houses:[],chestSpots:[],flameSpots:[],
    coreKeys:new Set(),shardKeys:[],iceKeys:[],fallDebris:[],
    arrows:[],flames:[],frozenEnemies:[],blastSpot:null,tower:null,sprite:null,
  };
  const total=nH+3;                      // 家＋井戸/畑/見張り台
  const a0=rng()*Math.PI*2;
  const slots=[];
  for(let i=0;i<total;i++)slots.push(a0+i*(Math.PI*2/total)+(rng()-.5)*.2);
  const farmIdx=1+Math.floor(nH/2);
  plan.wellAng=slots[0];plan.farmAng=slots[farmIdx];plan.towerAng=slots[total-1];
  for(let i=0;i<total;i++){
    if(i===0||i===farmIdx||i===total-1)continue;
    const ang=slots[i],r=10+rng()*2.5;
    plan.houses.push({
      x:plan.cx0+Math.round(Math.cos(ang)*r),
      z:plan.cz0+Math.round(Math.sin(ang)*r),
      ang,style:'intact',
    });
  }
  // 襲撃方向(raidAngle)に近い家ほど被害が大きい: 一番近い家が着弾点(blast)、
  // 次の2軒が延焼(burning)・崩壊途中(collapse)。遠い家は無傷のまま＝
  // 「どちら側から何が起きたか」が家の被害度から伝わるようにする
  const styles=['blast','burning','collapse'];
  const byRaidDist=[...plan.houses].sort((a,b)=>{
    const da=Math.abs(Math.atan2(Math.sin(a.ang-raidAngle),Math.cos(a.ang-raidAngle)));
    const db=Math.abs(Math.atan2(Math.sin(b.ang-raidAngle),Math.cos(b.ang-raidAngle)));
    return da-db;
  });
  for(let i=0;i<Math.min(styles.length,byRaidDist.length);i++)byRaidDist[i].style=styles[i];
  for(let i=styles.length;i<byRaidDist.length;i++)byRaidDist[i].style=(i%2)?'intact':'collapse';
  return plan;
}

// ── 整地（half=-1: 西半分 / +1: 東半分。重い処理なので2フェーズに分割）──
function _ftvTerraform(plan,half){
  const R=plan.R,y0=plan.ybase;
  for(let dx=-R;dx<=R;dx++){
    if(half<0?dx>=0:dx<0)continue;
    for(let dz=-R;dz<=R;dz++){
      const d2=dx*dx+dz*dz;if(d2>R*R)continue;
      const x=plan.cx0+dx,z=plan.cz0+dz;
      const sh=surfaceHeightAt(x,z);
      if(sh<y0&&d2>(R-1.5)*(R-1.5)&&plan.rng()<0.35)continue; // 縁は自然にギザギザ
      for(let y=sh+1;y<y0;y++)put(x,y,z,1);
      for(let y=y0+1;y<=y0+12;y++)clr(x,y,z);   // 既存の木・丘・岩を一掃
      put(x,y0,z,0);
    }
  }
}

// ── 中央広場＋時間結晶。結晶スパイアの全ブロックが coreKeys（どこを壊しても耐久減）──
function _ftvPlazaCrystal(plan){
  const y0=plan.ybase,cx=plan.cx0,cz=plan.cz0,rng=plan.rng;
  // 石畳の広場
  for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=5;dz++){
    if(dx*dx+dz*dz>26)continue;
    put(cx+dx,y0,cz+dz,_wtHash((cx+dx)*13^(cz+dz)*7)<0.3?6:1);
  }
  // 台座（黒曜石＋深石）
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)put(cx+dx,y0+1,cz+dz,(dx||dz)?OBSIDIAN_BLOCK:DEEP_STONE);
  // 結晶スパイア: 中間が膨らむ塔。青(ダイヤ鉱石)/水色(氷)/白(ガラス)/紫(水晶)のまだら
  const spireR=[1.6,1.6,2.1,2.1,1.4,0.9,0.4];
  for(let t=1;t<=spireR.length;t++){
    const y=y0+1+t,rr=spireR[t-1],Rr=Math.ceil(rr);
    for(let dx=-Rr;dx<=Rr;dx++)for(let dz=-Rr;dz<=Rr;dz++){
      if(dx*dx+dz*dz>rr*rr)continue;
      const h=_wtHash(((cx+dx)*73)^(y*179)^((cz+dz)*283));
      put(cx+dx,y,cz+dz,h<0.45?CRYSTAL_BLOCK:h<0.68?ICE_BLOCK:h<0.85?GLASS_BLOCK:DIAMOND_ORE);
      plan.coreKeys.add(vKey(cx+dx,y,cz+dz));
    }
  }
  put(cx,y0+spireR.length+2,cz,CRYSTAL_BLOCK);           // 穂先
  plan.coreKeys.add(vKey(cx,y0+spireR.length+2,cz));
  // 浮遊する結晶片＋固まった空間のブロック（空中静止）
  const nSh=_ftvN(9);
  for(let i=0;i<nSh;i++){
    const a=rng()*Math.PI*2,d=3+rng()*3.5,y=y0+2+Math.floor(rng()*7);
    const x=cx+Math.round(Math.cos(a)*d),z=cz+Math.round(Math.sin(a)*d);
    if(voxels[vKey(x,y,z)])continue;
    put(x,y,z,[CRYSTAL_BLOCK,ICE_BLOCK,GLASS_BLOCK,1][Math.floor(rng()*4)]);
    plan.shardKeys.push(vKey(x,y,z));
  }
  // グロースプライト（遠景でも結晶の位置がわかる青白い光）
  plan.sprite=_ftvGlowSprite();
  plan.sprite.position.set(cx+.5,y0+7,cz+.5);
  scene.add(plan.sprite);
  // 結晶のそばの特別な報酬（最優先）
  plan.chestSpots.unshift({x:cx+3,y:y0+1,z:cz-3});
}

// ── 家1軒。style: intact(ほぼ無傷)/collapse(崩れる途中)/burning(炎上中)/blast(爆発直前) ──
function _ftvHouse(plan,hd){
  const y0=plan.ybase,hx=hd.x,hz=hd.z,rng=plan.rng;
  // ドアは村の中心を向く（軸に丸める）
  const dxc=plan.cx0-hx,dzc=plan.cz0-hz;
  let dx=0,dz=0;
  if(Math.abs(dxc)>=Math.abs(dzc))dx=dxc>0?1:-1;else dz=dzc>0?1:-1;
  const wallTi=(x,y,z)=>{const h=_wtHash((x*53)^(y*97)^(z*193));return h<0.6?4:h<0.85?WOOL_BLOCK:1;};
  const dmg=hd.style==='intact'?0.03:hd.style==='collapse'?0.3:hd.style==='burning'?0.14:0.2;
  // 床
  for(let ax=-2;ax<=2;ax++)for(let az=-2;az<=2;az++)put(hx+ax,y0,hz+az,1);
  // 壁（高さ3）: 角は木の柱、中段に窓、ドア開口。dmgで「崩れ落ちる途中の壁」
  for(let ax=-2;ax<=2;ax++)for(let az=-2;az<=2;az++){
    if(Math.abs(ax)!==2&&Math.abs(az)!==2)continue;
    const corner=Math.abs(ax)===2&&Math.abs(az)===2;
    for(let y=1;y<=3;y++){
      if(!corner&&y<=2&&((dx!==0&&ax===dx*2&&az===0)||(dz!==0&&az===dz*2&&ax===0)))continue; // ドア
      if(!corner&&_wtHash(((hx+ax)*31)^((y0+y)*17)^((hz+az)*71))<dmg)continue;               // 欠け
      const win=!corner&&y===2&&((ax===0&&Math.abs(az)===2)||(az===0&&Math.abs(ax)===2));
      put(hx+ax,y0+y,hz+az,corner?3:win?GLASS_BLOCK:wallTi(hx+ax,y0+y,hz+az));
    }
  }
  // 屋根: 4段目に張り出した板＋5段目中央。collapse/blast は「襲撃側(raidAngle)を
  // 向いた面」が崩れ落ちる途中＝そちら側の板だけ欠け、その真下から襲撃の進行方向
  // (raidDX/DZ)へ斜めに1本だけ瓦礫の落下軌跡を作る（村全体で数を増やしすぎない）
  const roofHole=hd.style==='collapse'||hd.style==='blast';
  const rcos=Math.cos(plan.raidAngle),rsin=Math.sin(plan.raidAngle);
  let roofChainDone=false;
  for(let ax=-3;ax<=3;ax++)for(let az=-3;az<=3;az++){
    const wx=hx+ax,wz=hz+az;
    if(roofHole&&(ax*rcos+az*rsin>0.4)&&_wtHash((wx*7)^(wz*13))<0.55){
      if(!roofChainDone&&plan.fallDebris.length<_ftvN(plan.cfg.debrisCount)){
        roofChainDone=true;
        for(let s=0;s<3;s++){
          const fx=wx+Math.round(plan.raidDX*(s+1)*0.9),fz=wz+Math.round(plan.raidDZ*(s+1)*0.9);
          const fy=y0+6-s; // 段々低く並べ、斜めに落下している途中だと分かる弧にする
          if(!voxels[vKey(fx,fy,fz)]&&plan.fallDebris.length<_ftvN(plan.cfg.debrisCount)){
            put(fx,fy,fz,3);plan.fallDebris.push({x:fx,y:fy,z:fz,ti:3});
          }
        }
      }
      continue;
    }
    put(wx,y0+4,wz,3);
  }
  for(let ax=-1;ax<=1;ax++)for(let az=-1;az<=1;az++){
    if(roofHole&&(ax*rcos+az*rsin>0.4))continue;
    put(hx+ax,y0+5,hz+az,SLAB_BLOCK,0);
  }
  if(hd.style==='blast'){
    // 爆発直前の家: ドアと反対側の壁に穴、地面に焦げ跡。吹き飛ぶ破片は襲撃の
    // 進行方向(raidDX/DZ)へ段々低くなる斜めの列に並べ、落下途中の弧に見せる
    const bx=hx-dx*2,bz=hz-dz*2;
    clr(bx,y0+1,bz);clr(bx,y0+2,bz);clr(bx-dz,y0+1,bz-dx);clr(bx-dz,y0+2,bz-dx);
    const rdx=plan.raidDX,rdz=plan.raidDZ;
    for(let i=0;i<3;i++){
      const fx=Math.round(bx+rdx*(1+i)*1.1),fz=Math.round(bz+rdz*(1+i)*1.1);
      const fy=y0+3-i; // 破口の高さから段々低く＝落下途中の弧
      if(!voxels[vKey(fx,fy,fz)]){
        put(fx,fy,fz,4);
        if(plan.fallDebris.length<_ftvN(plan.cfg.debrisCount))plan.fallDebris.push({x:fx,y:fy,z:fz,ti:4});
      }
    }
    for(let ax=-2;ax<=2;ax++)for(let az=-2;az<=2;az++){
      if(_wtHash(((bx+ax)*19)^((bz+az)*43))<0.4)put(bx+ax-dx*2,y0,bz+az-dz*2,COAL_ORE); // 焦げ跡
    }
    plan.blastSpot={x:bx-dx*3,z:bz-dz*3};      // すぐそばで点火寸前のまま止まったクリーパー
  }
  if(hd.style==='burning'){
    // 燃え広がる途中の炎（屋根と壁際に静止した炎メッシュを後段フェーズで立てる）
    plan.flameSpots.push({x:hx-1,y:y0+5,z:hz-1},{x:hx+1,y:y0+6,z:hz+1},{x:hx+dx*3,y:y0+1,z:hz+dz*3});
  }
  // 内装: 松明＋（無傷の家には）ベッド。宝箱は無傷1軒＋崩れた1軒に配置
  put(hx-1,y0+1,hz-1,TORCH_BLOCK);
  if(hd.style==='intact'&&typeof makeBedMesh==='function'&&typeof beds!=='undefined'){
    const bmesh=makeBedMesh();bmesh.position.set(hx+1+.5,y0+1,hz+.9);scene.add(bmesh);
    beds.push({mesh:bmesh,x:hx+1,y:y0+1,z:hz});
  }
  if(hd.style==='intact'&&!plan._homeChestDone){plan._homeChestDone=true;plan.chestSpots.push({x:hx-dx+dz,y:y0+1,z:hz-dz+dx});}
  else if(hd.style==='collapse'&&!plan._ruinChestDone){plan._ruinChestDone=true;plan.chestSpots.push({x:hx+1,y:y0+1,z:hz-1});}
  // 家の中で止まったゾンビ（ドアの内側）
  if(hd.style==='collapse'&&!plan._houseEnemyDone){plan._houseEnemyDone=true;plan._houseEnemySpot={x:hx+dx,z:hz+dz,face:Math.atan2(dxc,dzc)+Math.PI};}
}
function _ftvHouses(plan){for(const hd of plan.houses)_ftvHouse(plan,hd);}

// ── 井戸（水は凍結）＋畑（水路が凍結・実った作物=食料）──
function _ftvIce(plan,x,y,z){put(x,y,z,ICE_BLOCK);plan.iceKeys.push(vKey(x,y,z));}
function _ftvWell(plan){
  const y0=plan.ybase,ang=plan.wellAng;
  const wx=plan.cx0+Math.round(Math.cos(ang)*6),wz=plan.cz0+Math.round(Math.sin(ang)*6);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)if(dx||dz)put(wx+dx,y0+1,wz+dz,1); // 石の縁
  for(const s of[-1,1]){for(let y=2;y<=3;y++)put(wx+s,y0+y,wz+s,3);}                   // 柱
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)put(wx+dx,y0+4,wz+dz,SLAB_BLOCK,0); // 屋根
  clr(wx,y0,wz);put(wx,y0-2,wz,1);clr(wx,y0-1,wz);
  _ftvIce(plan,wx,y0-1,wz);                       // 井戸の水（凍結）
  // 溢れて流れ出す途中で静止した水: 村の外側へ広がる氷の帯
  const fx=Math.abs(Math.cos(ang))>=Math.abs(Math.sin(ang))?(Math.cos(ang)>=0?1:-1):0;
  const fz=fx===0?(Math.sin(ang)>=0?1:-1):0;
  _ftvIce(plan,wx+fx,y0+1,wz+fz);                 // 縁を越える瞬間
  _ftvIce(plan,wx+fx*2,y0+1,wz+fz*2);
  _ftvIce(plan,wx+fx*3,y0+1,wz+fz*3+1);           // 地面に広がるしぶき
  _ftvIce(plan,wx+fx*3+1,y0+1,wz+fz*3);
}
function _ftvFarm(plan){
  const y0=plan.ybase,ang=plan.farmAng;
  const fx=plan.cx0+Math.round(Math.cos(ang)*10),fz=plan.cz0+Math.round(Math.sin(ang)*10);
  for(let ax=-2;ax<=2;ax++)for(let az=-1;az<=1;az++)put(fx+ax,y0,fz+az,CAVE_DIRT); // 畝
  for(let ax=-2;ax<=2;ax++)_ftvIce(plan,fx+ax,y0,fz);                              // 凍結した水路
  for(const[ax,az]of[[-3,-2],[3,-2],[-3,2],[3,2]])put(fx+ax,y0+1,fz+az,3);         // 四隅の杭
  // 実った作物（既存の畑システム: 収穫すると小麦=食料が手に入る）
  if(typeof farmPlots!=='undefined'&&typeof makeFarmMesh==='function'){
    for(let ax=-2;ax<=2;ax++)for(const az of[-1,1]){
      if(_wtHash(((fx+ax)*11)^((fz+az)*23))<0.25)continue;
      const mesh=makeFarmMesh(2);mesh.position.set(fx+ax+.5,y0+1,fz+az+.5);scene.add(mesh);
      farmPlots.push({mesh,x:fx+ax,y:y0+1,z:fz+az,stage:2,growT:99});
    }
  }
}

// ── 崩れかけの見張り台（頂上に弓矢の詰まった宝箱）＋倒れかけの木 ──
function _ftvTower(plan){
  const y0=plan.ybase,ang=plan.towerAng;
  const tx=plan.cx0+Math.round(Math.cos(ang)*13),tz=plan.cz0+Math.round(Math.sin(ang)*13);
  plan.tower={x:tx,z:tz};
  [[0,0,6],[3,0,3],[0,3,6],[3,3,6]].forEach(([lx,lz,H])=>{ // 4本脚（1本は折れて低い）
    for(let y=1;y<=H;y++)put(tx+lx,y0+y,tz+lz,3);
  });
  for(let ax=-1;ax<=4;ax++)for(let az=-1;az<=4;az++){       // 床（角が欠けている）
    if(_wtHash(((tx+ax)*17)^((tz+az)*31))<0.16)continue;
    put(tx+ax,y0+7,tz+az,3);
  }
  for(let ax=-1;ax<=4;ax++)for(let az=-1;az<=4;az++){       // 崩れた手すり
    if(ax!==-1&&ax!==4&&az!==-1&&az!==4)continue;
    if(((ax+az)&1)||_wtHash(((tx+ax)*7)^((tz+az)*13))<0.35)continue;
    put(tx+ax,y0+8,tz+az,SLAB_BLOCK,0);
  }
  // 中心へ向いた側に粗い登り段（1段ずつジャンプで登れる）
  const sx=tx-(Math.cos(ang)>=0?2:-2);
  for(let s=1;s<=6;s++){for(let y=1;y<=s;y++)put(sx,y0+y,tz-2+s,y===s?STAIR_BLOCK:1,3);}
  put(tx+1,y0+8,tz+2,TORCH_BLOCK);
  plan.chestSpots.push({x:tx+1,y:y0+8,z:tz+1}); // 見張り台の弓と矢（宝箱）
  plan.flameSpots.push({x:tx+3,y:y0+8,z:tz+3}); // 見張り台にも燃え移る途中の炎
}
function _ftvTrees(plan){
  // 倒れかけた状態で斜めに固定された木×2。根元の土がめくれて浮いている
  for(let i=0;i<2;i++){
    const a=plan.rng()*Math.PI*2;
    const bx=plan.cx0+Math.round(Math.cos(a)*(plan.R-2)),bz=plan.cz0+Math.round(Math.sin(a)*(plan.R-2));
    const by=surfaceHeightAt(bx,bz);
    const lean=plan.rng()*Math.PI*2,lx=Math.cos(lean),lz=Math.sin(lean);
    let px=bx+.5,pz=bz+.5;
    for(let t=1;t<=6;t++){px+=lx*.55;pz+=lz*.55;put(Math.round(px),by+t,Math.round(pz),3);}
    const cx=Math.round(px),cz=Math.round(pz),cy=by+7;
    for(let dx=-2;dx<=2;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-2;dz<=2;dz++){
      if(dx*dx+dy*dy*2+dz*dz>5)continue;
      if(!voxels[vKey(cx+dx,cy+dy,cz+dz)])put(cx+dx,cy+dy,cz+dz,LEAF_BLOCK);
    }
    put(bx-Math.round(lx*2),by+1,bz-Math.round(lz*2),CAVE_DIRT); // めくれた根元
    put(bx-Math.round(lx),by+2,bz-Math.round(lz),CAVE_DIRT);     // 浮いた土くれ
  }
}

// ── 空中で静止した矢＋燃え広がる途中で止まった炎（どちらも軽量な静止メッシュ）──
function _ftvArrows(plan){
  const y0=plan.ybase,cfg=plan.cfg,rng=plan.rng,n=_ftvN(cfg.arrowCount);
  // 矢は村のどこかへバラバラに飛ぶのではなく、襲撃者側(raidAngle)から着弾点の
  // 家（無ければ村の中心）へ向けて撃たれた「一斉射撃」を2〜3組に分けて配置する。
  // 同じ組の矢は同じ飛翔方向を共有し、飛翔ライン上の位置だけをずらすことで
  // 「まとまった一斉射撃が空中で止まっている」ように見せる
  const target=plan.houses.find(h=>h.style==='blast')||{x:plan.cx0,z:plan.cz0};
  const nVolleys=Math.min(3,Math.max(1,Math.round(n/3)));
  let made=0;
  for(let v=0;v<nVolleys&&made<n;v++){
    const volleyAngle=plan.raidAngle+(v-(nVolleys-1)/2)*0.45+(rng()-.5)*.12;
    const dist=8+rng()*4;
    const ox=plan.cx0+Math.cos(volleyAngle)*dist,oz=plan.cz0+Math.sin(volleyAngle)*dist;
    const perp=volleyAngle+Math.PI/2;
    const per=Math.min(4,n-made);
    for(let k=0;k<per;k++,made++){
      const lat=(k-(per-1)/2)*1.1,along=rng()*3.2; // 横のズレ＋飛翔ライン上の前後のズレ
      const x=ox+Math.cos(perp)*lat-Math.cos(volleyAngle)*along;
      const z=oz+Math.sin(perp)*lat-Math.sin(volleyAngle)*along;
      const y=y0+1.7+rng()*2.4;
      let dx=target.x+(rng()-.5)*3-x,dz=target.z+(rng()-.5)*3-z,dy=(rng()-.6)*1.1;
      const l=Math.hypot(dx,dy,dz)||1;dx/=l;dy/=l;dz/=l;
      const shaft=new THREE.Mesh(_ftvArrowGeo,(rng()<0.3?_ftvFireArrowMat:_ftvArrowMat).clone());
      shaft.position.set(x,y,z);shaft.lookAt(x+dx,y+dy,z+dz);
      const head=new THREE.Mesh(_ftvArrowHeadGeo,_ftvArrowHeadMat); // 共有ジオメトリ/マテリアル（複製しない）
      head.position.z=-.42;head.rotation.x=-Math.PI/2;             // シャフトの-Z先端＝進行方向に矢じりを向ける
      shaft.add(head);
      scene.add(shaft);
      plan.arrows.push({mesh:shaft,x,y,z,dx,dy,dz});
    }
  }
}
function _ftvFlames(plan){
  for(const s of plan.flameSpots.slice(0,_ftvN(plan.cfg.flameCount))){
    const g=new THREE.Object3D();
    const f1=new THREE.Mesh(_ftvFlameGeoA,_ftvFlameMatA.clone());f1.position.y=.28;
    const f2=new THREE.Mesh(_ftvFlameGeoB,_ftvFlameMatB.clone());f2.position.y=.45;
    g.add(f1,f2);
    g.position.set(s.x+.5,s.y,s.z+.5);g.rotation.y=plan.rng()*Math.PI;
    scene.add(g);
    plan.flames.push(g);
  }
}

// 敵のポーズ別プリセット: 直立(stand)以外は高さと傾きを変え、攻撃中/接近中/転倒中の
// 「一瞬」に見えるようにする。yOff は基準の立ち高さ(1.85)からのずれ、tiltX/tiltZ は
// 前後/左右の傾き（ラジアン、tiltXJit/tiltZJit ぶんランダムに揺らす）
const _FTV_POSES={
  stand: {yOff:0,   tiltX:0,   tiltXJit:0,  tiltZ:0,  tiltZJit:0},
  aim:   {yOff:.05, tiltX:.12, tiltXJit:.06,tiltZ:0,  tiltZJit:0},   // 弓を引き絞り重心が少し後ろに
  chase: {yOff:.16, tiltX:-.24,tiltXJit:.08,tiltZ:.05,tiltZJit:.06}, // 走り込む途中の前傾＋片足浮き
  fallen:{yOff:-.68,tiltX:1.05,tiltXJit:.25,tiltZ:.2, tiltZJit:.3},  // 前のめりに倒れ込む途中
};
// ── 停止中の敵を1体配置（既存の敵システム＋frozenフラグ。main.jsのループが
// frozen中はAI/移動/攻撃/距離デスポーンをスキップする）──
function _ftvSpawnFrozenEnemy(plan,wx,wy,wz,idx,face,pose){
  if(typeof ENEMY_TYPES==='undefined'||typeof enemies==='undefined'||typeof makeMat!=='function')return null;
  const et=ENEMY_TYPES[Math.max(0,Math.min(ENEMY_TYPES.length-1,idx|0))];
  try{
    const mat=makeMat(et.color,et.emissive,et.emissiveIntensity||.15,.6);
    const built=et.builder(mat);
    const ps=_FTV_POSES[pose]||_FTV_POSES.stand;
    built.root.position.set(wx+.5,wy+(et.bat?3:1.85+ps.yOff),wz+.5);
    built.root.rotation.y=face||0;
    if(ps.tiltX)built.root.rotation.x=ps.tiltX+(plan.rng()-.5)*ps.tiltXJit;
    if(ps.tiltZ)built.root.rotation.z=(plan.rng()<0.5?-1:1)*(ps.tiltZ+plan.rng()*ps.tiltZJit);
    if(typeof markShadowCaster==='function')markShadowCaster(built.root);
    scene.add(built.root);
    const wv=(typeof gs!=='undefined'&&gs.wave)||0,mhp=et.hp+Math.floor(wv*.7);
    const e={root:built.root,body:built.body,head:built.head,hpBar:built.hpBar,hp:mhp,maxHp:mhp,type:et,velY:0,onGround:true,atkCd:0,stuckT:0,lastX:wx+.5,lastZ:wz+.5,flashMeshes:[built.body,built.head],dead:false,breakCd:0,lWing:built.lWing,rWing:built.rWing,frozen:true};
    enemies.push(e);
    plan.frozenEnemies.push(e);
    return e;
  }catch(err){console.warn('時間が止まった村: 敵の配置に失敗',err);return null;}
}
// ── 宝箱（既存の underTreasures 宝箱システムを流用、type3=豪華報酬）──
function _ftvPlaceChest(wx,wy,wz){
  const tk=vKey(wx,wy,wz);if(underTreasures[tk])return;
  put(wx,wy-1,wz,1);clr(wx,wy,wz);clr(wx,wy+1,wz);
  const mesh=_makeTreasureMesh(3);mesh.position.set(wx+.5,wy,wz+.5);
  if(!openedTreasureKeys.has(tk))scene.add(mesh);
  underTreasures[tk]={mesh,opened:openedTreasureKeys.has(tk),type:3,struct:'frozenTimeVillage'};
}
// ── 停止中の敵（村内＋外周）＋宝箱の配置 ──
function _ftvActors(plan){
  const cfg=plan.cfg,y0=plan.ybase,rng=plan.rng;
  const center=(x,z)=>Math.atan2(plan.cx0-x,plan.cz0-z);
  // 村内: 攻撃・逃走・転倒の途中で止まった敵
  const innerDefs=[
    {idx:1,pose:'aim'},   // スケルトン: 弓を構えた瞬間
    {idx:0,pose:'chase'}, // ゾンビ: 家へ迫る途中
    {idx:0,pose:'fallen'},// ゾンビ: 転倒の途中
    {idx:10,pose:'chase'},// クモ: 走り込む途中
  ];
  // 村内・外周の敵は襲撃側(raidAngle)へ寄せて配置する: 攻め込んだ集団が
  // 一方向から来て村の中まで散らばった、という一枚絵として読めるようにする
  let dangerRef=null;
  const nInner=Math.min(cfg.enemyInner,innerDefs.length);
  for(let i=0;i<nInner;i++){
    const d=innerDefs[i];
    const a=plan.raidAngle+(i-(nInner-1)/2)*0.55+(rng()-.5)*.3,r=4.5+rng()*4;
    const x=plan.cx0+Math.round(Math.cos(a)*r),z=plan.cz0+Math.round(Math.sin(a)*r);
    const face=d.pose==='aim'?center(x,z)+Math.PI:center(x,z); // 弓は外向き（家を狙う）
    const e=_ftvSpawnFrozenEnemy(plan,x,y0,z,d.idx,face,d.pose);
    if(e&&!dangerRef)dangerRef={x,z};
  }
  // 崩れた家のドアの内側で止まったゾンビ（踏み込む途中の前傾姿勢）
  if(plan._houseEnemySpot)_ftvSpawnFrozenEnemy(plan,plan._houseEnemySpot.x,y0,plan._houseEnemySpot.z,0,plan._houseEnemySpot.face,'chase');
  // 爆発直前の家のそば: 点火寸前のまま静止したクリーパー
  if(plan.blastSpot)_ftvSpawnFrozenEnemy(plan,plan.blastSpot.x,y0,plan.blastSpot.z,9,center(plan.blastSpot.x,plan.blastSpot.z),'stand');
  // 外周: 襲撃側から村へ迫る途中で止まった敵（走り込む前傾姿勢）
  for(let i=0;i<cfg.enemyOuter;i++){
    const a=plan.raidAngle+(i-(cfg.enemyOuter-1)/2)*0.5+(rng()-.5)*.25,r=plan.R-1.5;
    const x=plan.cx0+Math.round(Math.cos(a)*r),z=plan.cz0+Math.round(Math.sin(a)*r);
    const e=_ftvSpawnFrozenEnemy(plan,x,surfaceHeightAt(x,z),z,i%2?10:0,center(x,z),'chase');
    if(e)dangerRef={x,z}; // 最後の外周の敵のそばに「危険だが価値のある」宝箱
  }
  if(dangerRef)plan.chestSpots.push({x:dangerRef.x+2,y:y0+1,z:dangerRef.z});
  let placed=0;
  for(const s of plan.chestSpots){if(placed>=cfg.treasureCount)break;_ftvPlaceChest(s.x,s.y,s.z);placed++;}
}

// ── 生成の仕上げ: 実行時状態を登録（結晶破壊フックと解除処理がこれを参照する）──
function _ftvFinalize(plan){
  frozenVillage={
    cfg:plan.cfg,
    cx0:plan.cx0,cz0:plan.cz0,ybase:plan.ybase,tower:plan.tower,
    coreKeys:plan.coreKeys,
    crystalHp:Math.min(plan.cfg.crystalHp,plan.coreKeys.size),
    spireKeys:[...plan.coreKeys],shardKeys:plan.shardKeys,
    arrows:plan.arrows,flames:plan.flames,iceKeys:plan.iceKeys,
    fallDebris:plan.fallDebris,enemies:plan.frozenEnemies,
    sprite:plan.sprite,released:false,
  };
}
// 村の静止メッシュを掃除して状態を破棄（clearWorld/再生成時に呼ばれる）
function resetFrozenVillage(){
  const V=frozenVillage;if(!V)return;
  for(const a of V.arrows){scene.remove(a.mesh);a.mesh.material.dispose();}
  for(const f of V.flames){scene.remove(f);f.traverse(o=>{if(o.isMesh&&o.material)o.material.dispose();});}
  if(V.sprite){scene.remove(V.sprite);if(V.sprite.material.map)V.sprite.material.map.dispose();V.sprite.material.dispose();}
  frozenVillage=null;_ftvShakeT=0;_ftvShakeDur=0;_ftvShakeAmp=0;
}

// ── 結晶破壊フック: breakBlock（プレイヤー）等から壊れたブロックのキーを受け取る。
// 結晶スパイアのブロックなら耐久を減らし、0で時間停止を解除する ──
function ftvOnBlockBroken(k){
  const V=frozenVillage;if(!V||V.released||!V.coreKeys.has(k))return;
  V.coreKeys.delete(k);
  V.crystalHp--;
  if(V.crystalHp>0){
    ftvShake(.12,.25);
    showBonus('⏳ 時間結晶にひびが入った…（あと '+V.crystalHp+'）');
    playTone(900,.1,.12,'triangle');
  }else releaseFrozenVillage();
}

// ═══ 時間停止の解除 ═══
// 一瞬で全部を動かさず、replayStepMs 間隔で「揺れ→結晶発光→結晶片の飛散→
// 矢→水→敵→瓦礫の落下→強敵出現」の順に段階再生する。止まっていた一枚絵が
// 動き出す演出のため、各段階は意図的に1テンポずつ遅らせる。
function releaseFrozenVillage(){
  const V=frozenVillage;if(!V||V.released)return;
  V.released=true;
  const stepMs=V.cfg.replayStepMs;
  const at=(i,fn)=>setTimeout(()=>{
    if(frozenVillage!==V)return; // リセット/再生成後の遅延実行を無効化
    try{fn();}catch(e){console.warn('時間停止解除: 演出中にエラー',e);}
  },Math.round(stepMs*i));
  // 1) 画面を軽く揺らす＋低い地響き
  showAlert('⏳ 時間結晶が砕けた…！');
  ftvShake(.4,.7);
  playTone(70,.5,.3,'sawtooth');
  // 2) 結晶の発光（グロースプライトの膨張＋粒子）
  at(1,()=>{
    if(V.sprite)V.sprite.scale.set(16,16,1);
    spawnParticles(V.cx0+.5,V.ybase+5,V.cz0+.5,0x99eeff,8);
    playTone(1400,.25,.18,'sine');setTimeout(()=>playTone(1900,.2,.14,'sine'),120);
  });
  // 3) 結晶片を散らす（スパイアと浮遊結晶片を砕く）
  at(2,()=>{
    _deferDirty=true;
    try{
      for(const k of V.spireKeys){const p=k.split('|');clr(+p[0],+p[1],+p[2]);}
      for(const k of V.shardKeys){const p=k.split('|');clr(+p[0],+p[1],+p[2]);}
    }finally{_deferDirty=false;flushDirtyChunks();}
    for(let i=0;i<6;i++)spawnBlockDebris(V.cx0+.5+(Math.random()-.5)*3,V.ybase+2+Math.random()*5,V.cz0+.5+(Math.random()-.5)*3,CRYSTAL_BLOCK);
    if(V.sprite){scene.remove(V.sprite);if(V.sprite.material.map)V.sprite.material.map.dispose();V.sprite.material.dispose();V.sprite=null;}
    ftvShake(.25,.4);
    playTone(300,.2,.2,'square');
  });
  // 4) 停止していた矢が飛ぶ（既存の飛翔体システムへ引き渡す。襲撃の矢なのでプレイヤーに当たる）
  at(3,()=>{
    for(const a of V.arrows)projectiles.push({mesh:a.mesh,x:a.x,y:a.y,z:a.z,dx:a.dx*22,dy:a.dy*22,dz:a.dz*22,life:2.5,dmg:7,isBossArrow:true});
    V.arrows=[];
    if(typeof sfxBow==='function')sfxBow();
  });
  // 5) 水が流れ始める（凍結していた氷→水）
  at(4,()=>{
    _deferDirty=true;
    try{for(const k of V.iceKeys){const p=k.split('|');put(+p[0],+p[1],+p[2],WATER_BLOCK);}}
    finally{_deferDirty=false;flushDirtyChunks();}
    V.iceKeys=[];
    playTone(520,.12,.1,'sine');
  });
  // 6) 停止していた敵が一斉に動き出す＋炎が揺らめく
  at(5,()=>{
    for(const e of V.enemies){
      if(!e||e.dead)continue;
      e.frozen=false;e.root.rotation.x=0;e.root.rotation.z=0;
      if(typeof flashEnemy==='function')flashEnemy(e);
    }
    V.enemies=[];
    for(const f of V.flames)spawnParticles(f.position.x,f.position.y+.6,f.position.z,0xff7722,3);
    showAlert('⚔ 村の時間が動き出した！襲撃が再開される！');
    playTone(160,.3,.25,'sawtooth');
  });
  // 7) 浮いていた瓦礫の一部が落下する
  at(6,()=>{
    for(const d of V.fallDebris){
      const v=voxels[vKey(d.x,d.y,d.z)];
      if(!v||v.ti!==d.ti)continue; // プレイヤーが先に壊した/変えた瓦礫はそのまま
      clr(d.x,d.y,d.z);
      spawnBlockDebris(d.x+.5,d.y+.5,d.z+.5,d.ti);
      const gy=surfaceHeightAt(d.x,d.z);
      if(!voxels[vKey(d.x,gy+1,d.z)])put(d.x,gy+1,d.z,d.ti);
    }
    V.fallDebris=[];
    ftvShake(.18,.3);
    playTone(120,.2,.2,'square');
  });
  // 8) 見張り台付近に少し強い敵が出現
  at(7,()=>{
    const sp=V.tower||{x:V.cx0,z:V.cz0};
    const sy=surfaceHeightAt(sp.x+2,sp.z+2)+1;
    _ssgSpawnEnemyAt(sp.x+2,sy,sp.z+2,(typeof ENEMY_TYPES!=='undefined'&&ENEMY_TYPES.length>8)?8:2);
    spawnParticles(sp.x+2.5,sy+1.5,sp.z+2.5,0x00ccff,8);
    showAlert('⚠ 時の番人クリスタルゴーレムが現れた！');
    if(typeof sfxBossAppear==='function')sfxBossAppear();
  });
}

let _frozenVillageBusy=false; // 生成中フラグ（ボタン連打による多重生成を防ぐ）
function generateFrozenTimeVillage(){
  if(_frozenVillageBusy){showBonus('⏳ 時間が止まった村を生成中…');return;}
  if(frozenVillage&&!frozenVillage.released){showBonus('⏳ 時間が止まった村はすでに存在する（時間結晶を壊すと解除）');return;}
  if(!window.confirm('「時間が止まった村」を生成します。平坦な地上を探して周囲の地形が少し変化します。生成しますか？'))return;
  if(frozenVillage)resetFrozenVillage(); // 解除済みの旧村の装飾を掃除して作り直す
  _frozenVillageBusy=true;_ftvSetProgress(true,0);
  let plan;
  try{
    const anchor=_frontAnchor(FROZEN_VILLAGE_CFG.anchorDist);
    const site=_ftvFindSite(anchor)||{cx:anchor.cx0,cz:anchor.cz0};
    _ensureChunksAround(site.cx,site.cz,FROZEN_VILLAGE_CFG.villageR+4,3);
    const seed=((WORLD_SEED^(site.cx*73856093)^(site.cz*19349663)^0x51f0ac)>>>0)||1;
    plan=_planFrozenVillage(_wtRng(seed),site);
  }catch(e){
    console.error('時間が止まった村: 準備中にエラー',e);
    _frozenVillageBusy=false;_ftvSetProgress(false);showBonus('⚠ 時間が止まった村の生成に失敗しました');return;
  }
  // フェーズ列（1フェーズ/フレーム）。整地→広場と結晶→家→井戸/畑→見張り台/木→矢/炎→敵/宝箱→仕上げ
  const phases=[
    ()=>_ftvTerraform(plan,-1),
    ()=>_ftvTerraform(plan,1),
    ()=>_ftvPlazaCrystal(plan),
    ()=>_ftvHouses(plan),
    ()=>{_ftvWell(plan);_ftvFarm(plan);},
    ()=>{_ftvTower(plan);_ftvTrees(plan);},
    ()=>{_ftvArrows(plan);_ftvFlames(plan);},
    ()=>_ftvActors(plan),
    ()=>_ftvFinalize(plan),
  ];
  let idx=0;_deferDirty=true;
  const step=()=>{
    try{
      phases[idx]();idx++;
      _deferDirty=false;flushDirtyChunks();
      _ftvSetProgress(true,idx/phases.length);
      if(idx<phases.length){_deferDirty=true;requestAnimationFrame(step);}
      else{
        _frozenVillageBusy=false;_ftvSetProgress(false);
        showBonus('⏳ 時間が止まった村を生成！中央の時間結晶を壊すと時が動き出す');
        playTone(392,.14,.1,'triangle');setTimeout(()=>playTone(523,.14,.1,'triangle'),140);setTimeout(()=>playTone(659,.18,.1,'triangle'),300);
      }
    }catch(e){
      console.error('時間が止まった村: 生成中にエラー',e);
      _deferDirty=false;try{flushDirtyChunks();}catch(_){}
      _frozenVillageBusy=false;_ftvSetProgress(false);showBonus('⚠ 時間が止まった村の生成に失敗しました');
    }
  };
  requestAnimationFrame(step);
}
