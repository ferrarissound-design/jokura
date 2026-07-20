// ============================================================================
// jokura / structures_stone_god.js
// 🦴 眠れる石神 ワンクリック生成
// world.js から分割されたファイルの一部。全スクリプトは index.html の PARTS の
// 順序で <script> として読み込まれ、同一のグローバルスコープを共有する。
// このファイルは world.js（地形・チャンク・ブロック定義）より後、
// structures_registry.js（生成関数を登録テーブルで参照）より前に読み込まれる。
// ============================================================================

// ═══ 🦴 眠れる石神 ワンクリック生成 ═══
// クリエイティブ専用: プレイヤー前方の地表に、地面へ倒れて石化・風化した「超巨大な
// 人型の神」をプロシージャルに生成する。頭蓋骨・背骨・肋骨・両腕と手・脚・胸の
// 「古代の心核」・そばに突き刺さった巨大武器で構成された、遠景ランドマーク兼探索
// ダンジョン。血や肉は描かず、白骨と化石・骨の遺跡・神話時代の亡骸の雰囲気にする。
// 賢者の樹庭・監視塔・空中神殿・世界樹と同じ共有ヘルパー（put/clr/_frontAnchor/
// _ensureChunksAround/_footprintYBase/surfaceHeightAt）を使う。世界樹と同じく巨大
// なので requestAnimationFrame でフェーズを分割し、少しずつ生成して処理落ちを避ける。
//
// 各パーツは「ローカル座標」で設計し、鉛直まわりの yaw 回転（rotateLocalPosition＝
// _ssgLocalToWorld）でワールド座標へ変換する。yaw だけなので球は回転不変となり、
// ローカル中心をワールドへ移してからワールド球を積むだけで継ぎ目のない骨が描ける。
// ローカル x = 頭→足 の体軸 / ローカル y = 上 / ローカル z = 左右。

// ── 調整用パラメータ（形が崩壊しないよう、後段で最小値を効かせる）──
// null の項目は生成時にランダム化される（毎回同じ形にならないようにするため）。
const SLEEPING_STONE_GOD_CFG={
  anchorDist:34,        // プレイヤー前方の生成距離（巨大なので離す）
  giantLength:108,      // 全長（頭頂〜足先のローカル長さの目安）
  skullRadius:9,        // 頭蓋骨の半径（中空の探索部屋になる）
  bodyLength:46,        // 胴体（背骨）の長さ: 首の付け根〜骨盤
  ribCount:8,           // 肋骨の本数（左右それぞれ）
  ribSpacing:4,         // 肋骨の間隔（体軸方向）
  boneThickness:2,      // 骨の太さ（チューブ半径の基準）
  armLength:40,         // 腕の長さ（上腕＋前腕）
  legLength:42,         // 脚の長さ（大腿＋すね）
  handScale:1.0,        // 手・指のスケール
  burialDepth:4,        // 地面への埋まり具合（全体をこのぶん沈めて地形に馴染ませる）
  damageRate:0.12,      // 骨の欠損・ひび割れの割合
  mossRate:0.06,        // 苔（葉ブロック）の付着割合
  debrisRate:0.4,       // 周囲へ散らす崩れた骨片の量
  treasureCount:4,      // 宝箱の数
  enemyCount:5,         // 敵の配置数（クリエイティブでは湧くだけ）
  generateWeapon:true,  // 巨大武器を生成するか
  weaponType:null,      // 'sword'|'axe'|'spear'|null(=ランダム)
  direction:null,       // 0..7(=北南東西＋斜め)。null=ランダム
  overallRotation:null, // 追加の傾き(ラジアン)。null=わずかにランダム
  overallScale:1.0,     // 全体スケール（下げれば軽量化）
};

// 生成進捗オーバーレイ（世界樹のものを流用。ラベルだけ差し替えて使い終わりに戻す）
function _ssgSetProgress(show,frac){
  const el=document.getElementById('worldTreeProgress');if(!el)return;
  const lbl=document.getElementById('wtpLabel');
  el.style.display=show?'':'none';
  if(show){if(lbl)lbl.textContent='🦴 眠れる石神を生成中…';const fill=document.getElementById('wtpFill');if(fill)fill.style.width=Math.round((frac||0)*100)+'%';}
  else if(lbl)lbl.textContent='🌳 世界樹を生成中…';
}

// getTerrainHeight: 既存の地表高さ取得のエイリアス（各部位の接地に使う）
function _ssgGroundY(x,z){return surfaceHeightAt(x,z);}

// rotateLocalPosition: ローカル座標→ワールド座標（鉛直yaw回転＋スケール＋アンカー平行移動）
function _ssgLocalToWorld(plan,lx,ly,lz){
  const s=plan.scale,c=plan.cos,sn=plan.sin;
  const rx=(lx*c-lz*sn)*s,rz=(lx*sn+lz*c)*s;
  return{x:Math.round(plan.ax+rx),y:Math.round(plan.baseY+ly*s),z:Math.round(plan.az+rz)};
}
// 骨ブロック: 白(ウール)を主体に、風化した象牙(粘土)・黄土(砂)・灰石・石を位置ハッシュ
// で混ぜて陰影と風化を出す（単色を避ける）。ごく低確率で苔を混ぜる
function _ssgBone(x,y,z,plan){
  const h=_wtHash((x*73856093)^(y*19349663)^(z*83492791));
  if(y>plan.groundY&&h<plan.mossRate)return LEAF_BLOCK; // 上面寄りに苔
  if(h<0.16)return CLAY_BLOCK;   // 風化した象牙色（やや灰）
  if(h<0.28)return 2;            // 黄土色（砂）＝古い骨のシミ
  if(h<0.38)return 6;            // 灰石＝陰影
  if(h<0.44)return 1;            // 石＝濃い陰
  return WOOL_BLOCK;             // 骨の白（主体）
}
// ワールド球を積む（solid、または opts.thk で殻＝内部空洞）。ti 未指定なら骨ブロック
function _ssgSphere(plan,wx,wy,wz,r,opts){
  opts=opts||{};const thk=opts.thk||0,dmg=opts.damage==null?0:opts.damage,ti=opts.ti;
  const R=Math.ceil(r),r2=r*r,ri2=thk>0?(r-thk)*(r-thk):-1;
  for(let dx=-R;dx<=R;dx++)for(let dy=-R;dy<=R;dy++)for(let dz=-R;dz<=R;dz++){
    const d2=dx*dx+dy*dy+dz*dz;if(d2>r2)continue;if(ri2>=0&&d2<ri2)continue;
    const x=wx+dx,y=wy+dy,z=wz+dz;
    if(dmg>0&&_wtHash(((x*911)^(y*57)^(z*131))+7)<dmg)continue; // 欠損/ひび
    put(x,y,z,ti!=null?ti:_ssgBone(x,y,z,plan));
  }
}
// ワールド球を掘る（内部の探索空間・目/口/ひび割れなどの侵入口）
function _ssgCarve(wx,wy,wz,r){
  const R=Math.ceil(r),r2=r*r;
  for(let dx=-R;dx<=R;dx++)for(let dy=-R;dy<=R;dy++)for(let dz=-R;dz<=R;dz++)
    if(dx*dx+dy*dy+dz*dz<=r2)clr(wx+dx,wy+dy,wz+dz);
}
// ローカルの経路（点列）に沿って骨の球を連ね、継ぎ目のないチューブ（骨）を作る
function _ssgPolyline(plan,pts,localR,opts){
  for(let i=0;i<pts.length;i++){
    const p=pts[i],w=_ssgLocalToWorld(plan,p[0],p[1],p[2]);
    const r=(Array.isArray(localR)?localR[i]:localR)*plan.scale;
    _ssgSphere(plan,w.x,w.y,w.z,Math.max(1,r),opts);
  }
}
// ローカルの2点を結ぶ骨（半径 r0→r1 でテーパー）。密な点列にして途切れさせない
function _ssgBoneSeg(plan,a,b,r0,r1,opts){
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
  const n=Math.max(2,Math.round(Math.hypot(dx,dy,dz)));
  const pts=[],rs=[];
  for(let i=0;i<=n;i++){const t=i/n;pts.push([a[0]+dx*t,a[1]+dy*t,a[2]+dz*t]);rs.push(r0+(r1-r0)*t);}
  _ssgPolyline(plan,pts,rs,opts);
}

// ── 敵をワールド座標へ直接1体配置（既存の敵システムを流用。生成順の都合で combat.js
// のグローバル(ENEMY_TYPES/enemies/makeMat)は実行時に解決されるため typeof で防御）──
function _ssgSpawnEnemyAt(wx,wy,wz,idx){
  if(typeof ENEMY_TYPES==='undefined'||typeof enemies==='undefined'||typeof makeMat!=='function')return;
  const et=ENEMY_TYPES[Math.max(0,Math.min(ENEMY_TYPES.length-1,idx|0))];
  try{
    const mat=makeMat(et.color,et.emissive,et.emissiveIntensity||.15,.6);
    const built=et.builder(mat);
    built.root.position.set(wx+.5,wy+(et.bat?3:1.85),wz+.5);
    if(typeof markShadowCaster==='function')markShadowCaster(built.root);
    scene.add(built.root);
    const wv=(typeof gs!=='undefined'&&gs.wave)||0,mhp=et.hp+Math.floor(wv*.7);
    enemies.push({root:built.root,body:built.body,head:built.head,hpBar:built.hpBar,hp:mhp,maxHp:mhp,type:et,velY:0,onGround:false,atkCd:0,stuckT:0,lastX:wx+.5,lastZ:wz+.5,flashMeshes:[built.body,built.head],dead:false,breakCd:0,lWing:built.lWing,rWing:built.rWing});
  }catch(e){console.warn('眠れる石神: 敵の配置に失敗',e);}
}
// ── 宝箱をワールド座標へ配置（既存の underTreasures 宝箱システムを流用、type3=豪華報酬）
// 注: 既存の地上構造物の宝箱と同じ「セッション内登録」方式。地形ブロックは worldEdits で
// 永続化されるが、宝箱メッシュはチャンク完全アンロード→再訪では復元されない（既知の制約）
function _ssgPlaceChest(wx,wy,wz){
  const tk=vKey(wx,wy,wz);if(underTreasures[tk])return;
  put(wx,wy-1,wz,1);clr(wx,wy,wz);clr(wx,wy+1,wz); // 石の土台＋宝箱ぶんの空間
  const mesh=_makeTreasureMesh(3);mesh.position.set(wx+.5,wy,wz+.5);
  if(!openedTreasureKeys.has(tk))scene.add(mesh);
  underTreasures[tk]={mesh,opened:openedTreasureKeys.has(tk),type:3,struct:'sleepingStoneGod'};
}

// 巨人の「設計図」を決定的に作る（重い put は後段のフェーズで実行）。ポーズ（頭の向き・
// 曲げる腕・埋まる脚・欠損）に軽いランダム差分を入れ、毎回同じ形にならないようにする
function _planGiantRemains(rng,anchor){
  const cfg=SLEEPING_STONE_GOD_CFG;
  const cx0=anchor.cx0,cz0=anchor.cz0;
  const scale=cfg.overallScale||1;
  const dir=cfg.direction!=null?cfg.direction:Math.floor(rng()*8);        // 北南東西＋斜め
  const rot=cfg.overallRotation!=null?cfg.overallRotation:(rng()-0.5)*0.4; // 自然な傾き
  const dirAngle=dir*Math.PI/4+rot;
  const skullR=cfg.skullRadius,boneR=cfg.boneThickness,body=cfg.bodyLength;
  // フットプリント（全体が収まる半径）で整地基準の高さを取る
  const foot=Math.round((skullR*1.4+body+cfg.legLength+8)*scale);
  const ybase=_footprintYBase(cx0,cz0,Math.min(foot,60),6);
  const plan={
    cfg,ax:cx0,az:cz0,cx0,cz0,scale,dir,dirAngle,cos:Math.cos(dirAngle),sin:Math.sin(dirAngle),
    ybase,baseY:ybase-cfg.burialDepth,groundY:ybase, // groundY: ワールドの地表面Y（苔判定に使う）
    skullR,boneR,body,mossRate:cfg.mossRate,damageRate:cfg.damageRate,
    contacts:[],chestSpots:[],enemySpots:[],
  };
  // 体軸レイアウト（ローカルx: 頭0 → 足）。背骨は burialDepth ぶん沈めても地表より上に
  // 出るよう、埋没量より少し高い位置に置く（＝一部だけ土に埋まって見える）
  plan.spineY=cfg.burialDepth+2;             // 背骨は地面すぐ上（一部埋没）
  plan.spineStartX=skullR*1.4;               // 首の付け根
  plan.pelvisX=plan.spineStartX+body;        // 骨盤
  plan.shoulderX=plan.spineStartX+body*0.12; // 肩
  plan.ribWidth=skullR*1.7;                  // 肋骨の張り出し
  plan.sternumY=skullR*1.5;                  // 胸の高さ（肋骨の頂点＝胸骨ライン）
  plan.spineCurve=1+rng()*1.2;               // 背骨の緩いS字カーブ量
  plan.headZ=(rng()<0.5?-1:1)*(1.5+rng()*2); // 頭が少し横を向く
  plan.bentArm=rng()<0.5?-1:1;               // 曲げる腕（-1=左/+1=右）
  plan.buriedLeg=rng()<0.5?-1:1;             // 地中に埋まる脚
  plan.chestX=plan.shoulderX+(cfg.ribCount-1)*cfg.ribSpacing*0.5; // 胸郭中心（心核）
  // 肋骨: 欠損する本数をランダムに選ぶ（倒れて折れた/土に埋まった表現）
  plan.ribMissing={};
  const nMiss=Math.floor(rng()*3);
  for(let m=0;m<nMiss;m++){const i=Math.floor(rng()*cfg.ribCount),s=rng()<0.5?-1:1;plan.ribMissing[i+'_'+s]=true;}
  plan.weaponType=cfg.weaponType||['sword','axe','spear'][Math.floor(rng()*3)];
  plan.rng=rng;
  return plan;
}

// ── generateSpine: 頭から腰まで、節のある背骨（椎骨の連続）を緩いカーブで並べる ──
function _ssgSpine(plan){
  const x0=plan.spineStartX,x1=plan.pelvisX,seg=2.2,rng=plan.rng;
  for(let x=x0;x<=x1;x+=seg){
    const u=(x-x0)/(x1-x0);
    const z=Math.sin(u*Math.PI*1.5)*plan.spineCurve;   // 地面に沿った緩いカーブ
    const y=plan.spineY+Math.sin(u*Math.PI)*1.2;       // ゆるいアーチ
    const w=_ssgLocalToWorld(plan,x,y,z);
    plan.contacts.push({x:w.x,y:w.y,z:w.z});
    if(_wtHash((w.x*31)^(w.z*17))<plan.damageRate*0.6)continue; // 一部が崩れて途切れる
    _ssgSphere(plan,w.x,w.y,w.z,Math.max(1,boneMul(plan,1.15)),{});
    // 椎骨の棘突起（上へ突き出す小さな節）で「棒でない骨らしさ」を出す
    _ssgSphere(plan,w.x,w.y+Math.round(plan.boneR*1.2*plan.scale),w.z,Math.max(1,boneMul(plan,0.5)),{});
  }
}
function boneMul(plan,m){return plan.boneR*m*plan.scale;}

// ── generateRibCage: 背骨の左右に、外側へ膨らむ弧を描く肋骨を並べる。上部に胸骨、
// 内部は歩いて探索できる巨大ホール。肋骨の間・欠損部が侵入口になる ──
function _ssgRibCage(plan){
  const cfg=plan.cfg;
  for(let i=0;i<cfg.ribCount;i++){
    const ribX=plan.shoulderX+i*cfg.ribSpacing;
    for(const side of[-1,1]){
      if(plan.ribMissing[i+'_'+side])continue;      // 欠損した肋骨は飛ばす
      const broken=_wtHash((i*97)^(side*131))<plan.damageRate; // 途中で折れる
      const N=Math.max(8,Math.round(plan.ribWidth+plan.sternumY-plan.spineY));
      const uMax=broken?0.55+plan.rng()*0.2:1.0;
      const pts=[];
      for(let k=0;k<=N;k++){
        const u=(k/N)*uMax;
        const z=side*plan.ribWidth*Math.sin(u*Math.PI*0.95);           // 外へ張り出して戻る弧
        const y=plan.spineY+(plan.sternumY-plan.spineY)*Math.sin(u*Math.PI/2); // 背骨→胸骨へ上る
        const x=ribX+Math.sin(u*Math.PI)*cfg.ribSpacing*0.35;          // わずかに前へ反る
        pts.push([x,y,z]);
      }
      _ssgPolyline(plan,pts,plan.boneR*0.95,{damage:plan.damageRate*0.4});
    }
    // 胸骨: 肋骨の頂点付近を体軸方向につなぐ節（心核の上だけは割れ目として開ける）
    if(Math.abs(ribX-plan.chestX)>3.0){
      const w=_ssgLocalToWorld(plan,ribX,plan.sternumY,0);
      _ssgSphere(plan,w.x,w.y,w.z,Math.max(1,boneMul(plan,0.9)),{damage:plan.damageRate*0.5});
    }
    // 肋骨内部の敵の湧き位置候補（床＝地表付近）
    if(i%3===1){const w=_ssgLocalToWorld(plan,ribX,plan.spineY,0);plan.enemySpots.push({x:w.x,y:plan.ybase,z:w.z});}
  }
  // 肋骨内部に1つ宝箱候補（胸郭のホール床）
  const wc=_ssgLocalToWorld(plan,plan.shoulderX+cfg.ribSpacing,plan.spineY,plan.ribWidth*0.4);
  plan.chestSpots.push({x:wc.x,y:plan.ybase+1,z:wc.z});
}

// ── generateSkull + generateJaw: 巨大な中空の頭蓋骨。目/鼻/口/後頭部のひびから内部へ
// 入れ、内部は小さな探索部屋（祭壇・発光・宝箱・敵）。下顎は少し開いて口が侵入口 ──
function _ssgSkull(plan){
  const skullR=plan.skullR,cy=skullR+plan.spineY*0.2; // ローカルの頭中心の高さ
  const S=_ssgLocalToWorld(plan,0,cy,plan.headZ);      // 頭中心（ワールド）
  plan.skullWorld=S;
  const thk=Math.max(2,Math.round(plan.boneR*plan.scale));
  // 頭蓋骨の殻（後頭部側=+x に欠けを作る）
  _ssgSphere(plan,S.x,S.y,S.z,skullR*plan.scale,{thk,damage:plan.damageRate*0.35});
  _ssgCarve(S.x,S.y,S.z,(skullR-thk-0.5)*plan.scale);   // 内部を確実に空洞化
  // 内部の床（立てる面）＝地表付近に骨/石の平床
  const floorY=Math.max(plan.ybase, S.y-Math.round((skullR-thk-1)*plan.scale));
  const fr=Math.round((skullR-thk-0.5)*plan.scale);
  for(let dx=-fr;dx<=fr;dx++)for(let dz=-fr;dz<=fr;dz++)if(dx*dx+dz*dz<=fr*fr)put(S.x+dx,floorY,S.z+dz,_ssgBone(S.x+dx,floorY,S.z+dz,plan));
  // 顔は体と反対（-x側）。目・鼻・口・後頭部のひびを掘って侵入口にする
  const F=v=>_ssgLocalToWorld(plan,v[0],cy+v[1],plan.headZ+v[2]);
  const eyeL=F([-skullR*0.55,skullR*0.15,-skullR*0.42]),eyeR=F([-skullR*0.55,skullR*0.15,skullR*0.42]);
  _ssgCarve(eyeL.x,eyeL.y,eyeL.z,2.3*plan.scale);      // 目の空洞（侵入口）
  _ssgCarve(eyeR.x,eyeR.y,eyeR.z,2.3*plan.scale);
  const nose=F([-skullR*0.72,-skullR*0.02,0]);_ssgCarve(nose.x,nose.y,nose.z,1.4*plan.scale); // 鼻の空洞
  const mouth=F([-skullR*0.5,-skullR*0.5,0]);_ssgCarve(mouth.x,mouth.y,mouth.z,2.6*plan.scale); // 口（侵入口）
  const crack=F([skullR*0.7,skullR*0.25,0]);_ssgCarve(crack.x,crack.y,crack.z,2.2*plan.scale);  // 後頭部のひび（侵入口）
  const chip=F([skullR*0.35,skullR*0.6,skullR*0.2]);_ssgCarve(chip.x,chip.y,chip.z,2.0*plan.scale); // 頭頂部の欠け
  // 苔・土の付着（上半球に少量）
  for(let n=0;n<20;n++){
    const a=plan.rng()*Math.PI*2,e=plan.rng()*0.9;
    const rx=Math.cos(a)*Math.cos(e),ry=Math.sin(e),rz=Math.sin(a)*Math.cos(e);
    const x=S.x+Math.round(rx*skullR*plan.scale),y=S.y+Math.round(ry*skullR*plan.scale),z=S.z+Math.round(rz*skullR*plan.scale);
    if(voxels[vKey(x,y,z)]&&plan.rng()<0.5)put(x,y,z,plan.rng()<0.6?LEAF_BLOCK:CAVE_DIRT);
  }
  // 内部の小部屋: 古代の祭壇（発光する御神体）＋松明。宝箱と敵の候補位置を登録
  put(S.x,floorY+1,S.z,SLAB_BLOCK,0);put(S.x,floorY+2,S.z,CRYSTAL_BLOCK);
  put(S.x+2,floorY+1,S.z+2,TORCH_BLOCK);put(S.x-2,floorY+1,S.z-2,TORCH_BLOCK);
  plan.chestSpots.push({x:S.x+2,y:floorY+1,z:S.z-2});          // 頭蓋骨内部の宝箱
  plan.chestSpots.push({x:eyeL.x,y:Math.max(plan.ybase+1,eyeL.y-1),z:eyeL.z}); // 片目の奥
  plan.enemySpots.push({x:S.x-1,y:floorY+1,z:S.z+1});          // 頭蓋骨内部の敵
  // 下顎（少し開いた口＝侵入口を残す）
  _ssgJaw(plan,cy);
}
function _ssgJaw(plan,cy){
  const skullR=plan.skullR,chinY=cy-skullR*0.85,jawW=skullR*0.6,N=14;
  const pts=[];
  for(let k=0;k<=N;k++){
    const u=k/N,z=(u*2-1)*jawW;
    const x=-skullR*0.35-(1-Math.abs(u*2-1))*skullR*0.55; // あご先が -x へ突き出す U 字
    const y=chinY+(1-Math.abs(u*2-1))*(-1.2);              // あご先が少し下がる
    pts.push([x,y,z+plan.headZ]);
  }
  _ssgPolyline(plan,pts,plan.boneR*0.85,{damage:plan.damageRate*0.4});
}

// ── generateArm + generateHand: 左右で異なる姿勢（片方は地面へ伸び、片方は肘を曲げる）。
// 上腕・前腕・肘、そして指を1本ずつ判別できる巨大な手。手のひらに報酬を置く ──
function _ssgArm(plan,side){
  const cfg=plan.cfg,bent=(side===plan.bentArm),armL=cfg.armLength;
  const shoulder=[plan.shoulderX,plan.spineY+1.5,side*plan.ribWidth*0.95];
  let elbow,wrist;
  if(bent){ // 肘を曲げ、前腕を胸元へ折り返す
    elbow=[plan.shoulderX+armL*0.28,plan.spineY+2,side*(plan.ribWidth+armL*0.34)];
    wrist=[plan.shoulderX-armL*0.02,plan.spineY+armL*0.14,side*(plan.ribWidth+armL*0.10)];
  }else{    // 体の横に真っ直ぐ伸ばして地面に横たわる
    elbow=[plan.shoulderX+armL*0.30,plan.spineY+0.5,side*(plan.ribWidth+armL*0.34)];
    wrist=[plan.shoulderX+armL*0.62,plan.spineY,side*(plan.ribWidth+armL*0.50)];
  }
  _ssgSphere(plan,..._triW(plan,shoulder),Math.max(1,boneMul(plan,1.6)),{}); // 肩関節
  _ssgBoneSeg(plan,shoulder,elbow,plan.boneR*1.4,plan.boneR*1.1,{});          // 上腕
  _ssgSphere(plan,..._triW(plan,elbow),Math.max(1,boneMul(plan,1.3)),{});     // 肘
  _ssgBoneSeg(plan,elbow,wrist,plan.boneR*1.1,plan.boneR*0.9,{});             // 前腕
  _ssgHand(plan,side,wrist,elbow,bent);
}
// ローカル点→_ssgLocalToWorld の (x,y,z) を配列で返す（スプレッド用）
function _triW(plan,p){const w=_ssgLocalToWorld(plan,p[0],p[1],p[2]);return[w.x,w.y,w.z];}
function _ssgHand(plan,side,wrist,elbow,bent){
  const hs=plan.cfg.handScale;
  // 手の向き＝前腕の延長（肘→手首）方向をローカル x-z 平面で正規化
  let dx=wrist[0]-elbow[0],dz=wrist[2]-elbow[2];const dl=Math.hypot(dx,dz)||1;dx/=dl;dz/=dl;
  const px=-dz,pz=dx; // 指を扇状に広げる横方向
  const palm=[wrist[0]+dx*2*hs,plan.spineY+0.5,wrist[2]+dz*2*hs];
  // 手のひら（平たい塊）
  _ssgSphere(plan,..._triW(plan,palm),Math.max(1,plan.boneR*1.8*hs*plan.scale),{});
  // 5本の指（親指＋4指）。指ごとに3節、先へ細くする。一部は折れる/埋まる差分
  for(let f=0;f<5;f++){
    const spread=(f-2)*0.5,dirx=dx+px*spread,dirz=dz+pz*spread,dn=Math.hypot(dirx,dirz)||1;
    const ux=dirx/dn,uz=dirz/dn;
    const fLen=(f===0?4.5:6.2)*hs;                 // 親指は短い
    const broken=_wtHash((side*71)^(f*131))<plan.damageRate; // 折れた指
    let base=[palm[0]+ux*plan.boneR*1.5,plan.spineY+0.3,palm[2]+uz*plan.boneR*1.5];
    const nSeg=broken?1+Math.floor(plan.rng()*2):3;
    for(let s=0;s<nSeg;s++){
      const t0=s/3,t1=(s+1)/3;
      const a=[base[0]+ux*fLen*t0,plan.spineY+0.3-(bent?0:t0*0.5),base[2]+uz*fLen*t0];
      const b=[base[0]+ux*fLen*t1,plan.spineY+0.3-(bent?0:t1*0.5),base[2]+uz*fLen*t1];
      _ssgBoneSeg(plan,a,b,(1.0-t0*0.4)*plan.boneR*0.7*hs,(1.0-t1*0.4)*plan.boneR*0.7*hs,{});
      _ssgSphere(plan,..._triW(plan,a),Math.max(1,plan.boneR*0.55*hs*plan.scale),{}); // 指の関節
    }
  }
  // 手のひらの上に報酬（伸ばした手＝発光する石／曲げた手＝古代の紋章風の鉱石）＋宝箱候補
  const pw=_ssgLocalToWorld(plan,palm[0],palm[1]+1,palm[2]);
  if(!bent){put(pw.x,pw.y,pw.z,CRYSTAL_BLOCK);plan.chestSpots.push({x:pw.x,y:pw.y,z:pw.z+2});}
  else{for(let dxx=-1;dxx<=1;dxx++)for(let dzz=-1;dzz<=1;dzz++)if((dxx+dzz)&1)put(pw.x+dxx,pw.y,pw.z+dzz,DIAMOND_ORE);} // 巨人が握っていた鉱石
}

// ── generateLeg: 骨盤から大腿・膝・すね・足・足の指。片脚は地中に深く埋める ──
function _ssgLeg(plan,side){
  const cfg=plan.cfg,legL=cfg.legLength,buried=(side===plan.buriedLeg);
  const spread=plan.ribWidth*0.5;
  const hip=[plan.pelvisX,plan.spineY+1,side*spread];
  const knee=[plan.pelvisX+legL*0.45,plan.spineY+(buried?legL*0.16:2),side*spread*1.15];
  // 埋まる脚は足首/足を地表下(ローカルy<groundY)へ沈める
  const ankleY=buried?-cfg.burialDepth*0.5:plan.spineY;
  const ankle=[plan.pelvisX+legL*0.9,ankleY,side*spread*1.2];
  const foot=[plan.pelvisX+legL,ankleY-0.5,side*spread*1.25];
  // 骨盤の塊
  _ssgSphere(plan,..._triW(plan,[plan.pelvisX,plan.spineY+1,0]),Math.max(1,boneMul(plan,2.0)),{});
  _ssgSphere(plan,..._triW(plan,hip),Math.max(1,boneMul(plan,1.6)),{});      // 股関節
  _ssgBoneSeg(plan,hip,knee,plan.boneR*1.6,plan.boneR*1.2,{damage:buried?plan.damageRate:0}); // 大腿骨
  _ssgSphere(plan,..._triW(plan,knee),Math.max(1,boneMul(plan,1.4)),{});     // 膝
  _ssgBoneSeg(plan,knee,ankle,plan.boneR*1.2,plan.boneR*1.0,{damage:buried?plan.damageRate*1.5:0}); // すね
  if(!buried){                                                              // 足＋足の指（埋没脚は省略）
    _ssgBoneSeg(plan,ankle,foot,plan.boneR*1.1,plan.boneR*1.3,{});
    for(let t=0;t<5;t++){
      const toe=[foot[0]+2+t*0.3,foot[1]-0.3,foot[2]+(t-2)*1.1*side];
      _ssgBoneSeg(plan,foot,toe,plan.boneR*0.6,plan.boneR*0.35,{damage:plan.damageRate});
    }
    plan.contacts.push({x:_triW(plan,foot)[0],y:plan.ybase,z:_triW(plan,foot)[2]});
  }
  plan.contacts.push({x:_triW(plan,hip)[0],y:plan.ybase,z:_triW(plan,hip)[2]});
}

// ── generateHeartCore: 胸郭中央に「古代の心核」の部屋。生物の心臓ではなく、巨人を
// 動かしていた魔力の核／古代装置のイメージ。発光する中心核・円形の部屋・周囲の古代石・
// 特殊鉱石・宝箱・ボス配置・侵入口。胸の割れ目から中がわずかに光って見える ──
function _ssgHeartCore(plan){
  const cx=plan.chestX,coreY=plan.sternumY*0.5,roomR=Math.max(4,plan.skullR*0.6);
  const C=_ssgLocalToWorld(plan,cx,coreY,0);
  // 古代石の球殻の部屋（黒曜石＝古代石）。内部は空洞
  _ssgSphere(plan,C.x,C.y,C.z,roomR*plan.scale,{ti:OBSIDIAN_BLOCK,thk:1.6});
  _ssgCarve(C.x,C.y,C.z,(roomR-1.6)*plan.scale);
  // 床
  const fY=C.y-Math.round((roomR-2)*plan.scale),fr=Math.round((roomR-2)*plan.scale);
  for(let dx=-fr;dx<=fr;dx++)for(let dz=-fr;dz<=fr;dz++)if(dx*dx+dz*dz<=fr*fr)put(C.x+dx,fY,C.z+dz,DEEP_STONE);
  // 周囲を囲む古代石の柱4本＋特殊鉱石
  for(let a=0;a<4;a++){const ang=a*Math.PI/2,rx=Math.round(Math.cos(ang)*(roomR-2)*plan.scale),rz=Math.round(Math.sin(ang)*(roomR-2)*plan.scale);
    for(let dy=1;dy<=Math.round((roomR-1)*plan.scale);dy++)put(C.x+rx,fY+dy,C.z+rz,dy%3===0?DIAMOND_ORE:OBSIDIAN_BLOCK);}
  // 中心核: 宙に浮く発光する結晶塊
  _ssgSphere(plan,C.x,C.y,C.z,Math.max(1.5,2.2*plan.scale),{ti:CRYSTAL_BLOCK});
  // 胸の割れ目（外壁の -y 側＝胸の外側から内部へ続く侵入口）。同時に光が漏れる
  const slit=_ssgLocalToWorld(plan,cx,plan.sternumY,0);
  _ssgCarve(slit.x,slit.y,slit.z,2.4*plan.scale);
  put(slit.x,slit.y-1,slit.z,CRYSTAL_BLOCK); // 割れ目のすぐ内側に発光ブロック→外からわずかに光る
  // 側面からの侵入口（肋骨の隙間からまっすぐ心核へ）
  const ent=_ssgLocalToWorld(plan,cx,coreY,plan.ribWidth);
  for(let r=0;r<=Math.round(plan.ribWidth*plan.scale);r++){const t=r/(plan.ribWidth*plan.scale||1);
    const x=Math.round(C.x+(ent.x-C.x)*t),y=Math.round(C.y+(ent.y-C.y)*t),z=Math.round(C.z+(ent.z-C.z)*t);
    _ssgCarve(x,y,z,1.6*plan.scale);}
  // 宝箱・ボス・敵の配置候補
  plan.chestSpots.unshift({x:C.x+2,y:fY+1,z:C.z}); // 心核の間の宝箱（最優先）
  plan.enemySpots.unshift({x:C.x,y:fY+1,z:C.z,boss:true}); // 心核のボス/強敵
}

// ── generateGiantWeapon: 巨人のそばに巨大な武器（剣/斧/槍からランダム）。地面に突き
// 刺さり、根元にクレーターとひび割れ・砕けた岩・苔、根元に小さな探索空間 ──
function _ssgWeapon(plan){
  // 伸ばした腕（=曲げていない側）の手の先あたりに配置
  const side=-plan.bentArm,armL=plan.cfg.armLength;
  const hand=_ssgLocalToWorld(plan,plan.shoulderX+armL*0.75,plan.spineY,side*(plan.ribWidth+armL*0.62));
  const gx=hand.x+Math.round((plan.rng()*6-3)),gz=hand.z+Math.round((plan.rng()*6-3));
  const gy=_ssgGroundY(gx,gz);
  const ang=plan.dirAngle+Math.PI/2+(plan.rng()-0.5); // だいたい体軸に直交して刺さる
  const ux=Math.cos(ang),uz=Math.sin(ang);
  const type=plan.weaponType,S=plan.scale;
  const bladeMat=(x,y,z)=>_wtHash((x*13)^(y*7)^(z*5))<0.25?IRON_ORE:_wtHash((x*3)^(z*9))<0.4?6:1; // 石＋灰石＋鉄の刃
  const stampCol=(x,y,z,r,mat)=>{const R=Math.ceil(r);for(let dx=-R;dx<=R;dx++)for(let dy=-R;dy<=R;dy++)for(let dz=-R;dz<=R;dz++){if(dx*dx+dy*dy+dz*dz>r*r)continue;put(x+dx,y+dy,z+dz,mat(x+dx,y+dy,z+dz));}};
  if(type==='spear'){
    // 槍: 地面に斜めに突き刺さる長い柄＋穂先
    const len=Math.round(46*S);
    for(let t=0;t<=len;t++){const f=t/len;const x=Math.round(gx+ux*Math.round(f*len*0.4)),z=Math.round(gz+uz*Math.round(f*len*0.4)),y=gy-Math.round(4*S)+Math.round(f*len);stampCol(x,y,z,Math.max(1,1.6*S*(1-f*0.3)),f>0.9?bladeMat:(a,b,c)=>3);}
  }else if(type==='axe'){
    // 斧: 地面から立つ太い柄＋上端の大きな斧頭（横倒しに近い自然な角度）
    const len=Math.round(30*S);
    for(let t=0;t<=len;t++){const y=gy-Math.round(3*S)+t;stampCol(gx,y,gz,Math.max(1,1.6*S),(a,b,c)=>3);} // 柄
    const hy=gy-Math.round(3*S)+len; // 斧頭（柄の上端から ux/uz 方向へ扇状に広がる刃）
    for(let dy=-Math.round(5*S);dy<=Math.round(5*S);dy++)for(let d=0;d<=Math.round(7*S);d++){
      const w=Math.round((1-Math.abs(dy)/(6*S))*d*0.6);if(w<0)continue;
      for(let dz=-w;dz<=w;dz++){const hx=Math.round(gx+ux*d),hz=Math.round(gz+uz*d);put(hx,hy+dy,hz,bladeMat(hx,hy+dy,hz));}
    }
  }else{
    // 剣: 地面に突き刺さる長い刀身＋鍔＋柄（刀身の下部は埋まる）
    const len=Math.round(50*S);
    for(let t=0;t<=len;t++){const f=t/len;const y=gy-Math.round(10*S)+Math.round(f*len);const w=Math.max(1,(1.6-Math.abs(f-0.5)*0.8)*S);stampCol(gx,y,gz,w,f<0.15?(a,b,c)=>1:bladeMat);}
    const gY=gy+Math.round(len*0.55);for(let d=-Math.round(5*S);d<=Math.round(5*S);d++)put(Math.round(gx+ux*d),gY,Math.round(gz+uz*d),1); // 鍔
    for(let t=1;t<=Math.round(8*S);t++)put(gx,gY+t,gz,3); // 柄
  }
  // 根元のクレーター＋ひび割れ＋砕けた岩＋苔
  for(let dx=-Math.round(8*S);dx<=Math.round(8*S);dx++)for(let dz=-Math.round(8*S);dz<=Math.round(8*S);dz++){
    const d=Math.hypot(dx,dz);if(d>8*S)continue;const x=gx+dx,z=gz+dz,sh=_ssgGroundY(x,z);
    if(d<3*S){clr(x,sh,z);put(x,sh-1,z,1);}                 // 中心を浅く抉る（クレーター）
    else if(_wtHash((x*7)^(z*13))<0.5)put(x,sh,z,_wtHash((x*5)^(z*3))<0.3?6:_wtHash(x^z)<0.2?LEAF_BLOCK:1); // 砕けた岩・苔・ひび
  }
  // 根元の小さな探索空間＋宝箱候補
  _ssgCarve(gx,gy,gz,2.2*S);put(gx,gy-1,gz,1);
  plan.chestSpots.push({x:gx,y:gy,z:gz});
  plan.enemySpots.push({x:gx+2,y:gy,z:gz});
  plan.contacts.push({x:gx,y:gy,z:gz});
}

// ── generateBoneDebris: 周囲へ崩れた骨片を散らし、地形に馴染ませる ──
function _ssgDebris(plan){
  const cfg=plan.cfg,foot=Math.round((plan.skullR+plan.body+cfg.legLength)*plan.scale*0.6);
  const n=Math.round(40*cfg.debrisRate);
  for(let i=0;i<n;i++){
    const a=plan.rng()*Math.PI*2,d=plan.skullR*plan.scale+plan.rng()*foot;
    const x=plan.cx0+Math.round(Math.cos(a)*d),z=plan.cz0+Math.round(Math.sin(a)*d),sh=_ssgGroundY(x,z);
    const r=1+Math.floor(plan.rng()*2);
    for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)for(let dy=0;dy<=r;dy++){if(dx*dx+dy*dy+dz*dz>r*r)continue;if(voxels[vKey(x+dx,sh+dy,z+dz)]&&plan.rng()<0.5)continue;put(x+dx,sh+dy,z+dz,_ssgBone(x+dx,sh+dy,z+dz,plan));}
  }
}

// ── blendWithTerrain: 接地点の下に土/石を詰めて骨が浮かないようにし、上に苔・土を少量
// 載せて地形の一部に見せる。地面の高さを取得して各接地点に合わせて盛る ──
function _ssgBlend(plan){
  const mr=4;
  for(const c of plan.contacts){
    for(let dx=-mr;dx<=mr;dx++)for(let dz=-mr;dz<=mr;dz++){
      const d=Math.hypot(dx,dz);if(d>mr)continue;
      const x=c.x+dx,z=c.z+dz,sh=_ssgGroundY(x,z);
      const top=Math.min(c.y-1,sh+Math.round((1-d/mr)*2)); // 距離で減衰する小さな盛り土
      for(let y=sh+1;y<=top;y++)put(x,y,z,y===top?(_wtHash(x^z)<0.3?0:5):1); // 石で埋め、天面は草
      if(_wtHash((x*17)^(z*7))<plan.mossRate*2){const v=voxels[vKey(x,c.y+1,z)];if(!v)put(x,c.y+1,z,LEAF_BLOCK);} // 骨の上に苔
    }
  }
}

// placeTreasure: 集めた候補位置から treasureCount 個の宝箱を配置（既存宝箱システム）
function _ssgTreasure(plan){
  const spots=plan.chestSpots;let placed=0;
  for(let i=0;i<spots.length&&placed<plan.cfg.treasureCount;i++){const s=spots[i];_ssgPlaceChest(s.x,s.y,s.z);placed++;}
}
// placeEnemies: 集めた候補位置から enemyCount 体の敵を配置（既存の敵システム）。
// クリエイティブでは湧くだけ。心核のボス候補には強めの敵（ゴーレム系）を置く
function _ssgEnemies(plan){
  const spots=plan.enemySpots;let placed=0;
  for(let i=0;i<spots.length&&placed<plan.cfg.enemyCount;i++){
    const s=spots[i];
    const idx=s.boss?(typeof ENEMY_TYPES!=='undefined'&&ENEMY_TYPES.length>8?8:2):[0,1,5][placed%3];
    _ssgSpawnEnemyAt(s.x,s.y,s.z,idx);placed++;
  }
}

let _sleepingStoneGodBusy=false; // 生成中フラグ（ボタン連打の多重生成を防ぐ）
function generateSleepingStoneGod(){
  if(_sleepingStoneGodBusy){showBonus('🦴 眠れる石神を生成中…');return;}
  if(!window.confirm('超巨大な「眠れる石神」を生成します。周囲の地形が変化する場合があります。生成しますか？'))return;
  _sleepingStoneGodBusy=true;_ssgSetProgress(true,0);
  let plan;
  try{
    const anchor=_frontAnchor(SLEEPING_STONE_GOD_CFG.anchorDist);
    const cfg=SLEEPING_STONE_GOD_CFG;
    const foot=Math.round((cfg.skullRadius*1.4+cfg.bodyLength+cfg.legLength+8)*(cfg.overallScale||1));
    _ensureChunksAround(anchor.cx0,anchor.cz0,Math.min(foot,60),3);
    const seed=((WORLD_SEED^(anchor.cx0*73856093)^(anchor.cz0*19349663))>>>0)||1;
    plan=_planGiantRemains(_wtRng(seed),anchor);
  }catch(e){
    console.error('眠れる石神: 準備中にエラー',e);
    _sleepingStoneGodBusy=false;_ssgSetProgress(false);showBonus('⚠ 眠れる石神の生成に失敗しました');return;
  }
  // フェーズ列（1フェーズ/フレーム）。骨→心核→武器→装飾→報酬の順に段階的に姿を現す
  const phases=[
    ()=>_ssgSpine(plan),
    ()=>_ssgRibCage(plan),
    ()=>{_ssgSkull(plan);},
    ()=>{_ssgArm(plan,-1);},
    ()=>{_ssgArm(plan,1);},
    ()=>{_ssgLeg(plan,-1);_ssgLeg(plan,1);},
    ()=>_ssgHeartCore(plan),
  ];
  if(SLEEPING_STONE_GOD_CFG.generateWeapon)phases.push(()=>_ssgWeapon(plan));
  phases.push(()=>{_ssgDebris(plan);_ssgBlend(plan);});
  phases.push(()=>{_ssgTreasure(plan);_ssgEnemies(plan);});
  let idx=0;_deferDirty=true;
  const step=()=>{
    try{
      phases[idx]();idx++;
      _deferDirty=false;flushDirtyChunks();
      _ssgSetProgress(true,idx/phases.length);
      if(idx<phases.length){_deferDirty=true;requestAnimationFrame(step);}
      else{
        _sleepingStoneGodBusy=false;_ssgSetProgress(false);showBonus('🦴 眠れる石神を生成！');
        playTone(196,.16,.1,'triangle');setTimeout(()=>playTone(262,.16,.1,'triangle'),150);setTimeout(()=>playTone(330,.2,.1,'triangle'),320);
      }
    }catch(e){
      console.error('眠れる石神: 生成中にエラー',e);
      _deferDirty=false;try{flushDirtyChunks();}catch(_){}
      _sleepingStoneGodBusy=false;_ssgSetProgress(false);showBonus('⚠ 眠れる石神の生成に失敗しました');
    }
  };
  requestAnimationFrame(step);
}
