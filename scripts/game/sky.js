// ============================================================================
// jokura / sky.js  ─  完全版 SkySystem
// scripts/game/*.js の一部。index.html から THREE 読み込み後、world.js の直後に
// 読み込まれ、同一のグローバルスコープを共有する（world.js が作った scene /
// camera / renderer / sun(DirectionalLight) / hemLight を利用する）。
//
// 既存の昼夜サイクル（gs.time 0..1）・天候（weather / WEATHER_DIM）・フォグ・
// ライティングを「正」として利用し、空の見た目だけを立体的な環境表現へ置き換える。
// 旧 world.js のスカイドーム/太陽/月/雲/星の生成ブロックはここへ移設した。
//
//  - グラデーション ShaderMaterial のスカイドーム（天頂/中間/地平線+太陽方向+霞）
//  - グロー付きの太陽・月（月齢対応の CanvasTexture）
//  - サイズ/明るさ/色/控えめな瞬きを持つ星 + まれな流れ星
//  - 淡い天の川（高品質のみ）
//  - 大型/中距離/遠景の3レイヤー雲（時間帯で色補間・風で移動）
//  - 時間帯キーフレーム補間（夜明け前〜深夜が滑らかに繋がる）
//  - Low / Medium / High の品質設定
//
// 既存コードとの接続点:
//   hud.js updateSky()      → skySystem.updateAtmosphere(t, opts)
//   hud.js updateCelestial()→ skySystem.updateBodies(t, dt, opts)
//   main.js が skyMesh.visible を切り替える（地下/水中で false）
//   world.js srcUpdate() が sunSprite/moonSprite.visible を触る
//   → 互換のため skyMesh / sunSprite / moonSprite のグローバル別名を維持する。
// ============================================================================

// ─── ACES トーンマップ + sRGB エンコード（シーン本体と同じ見え方に揃える）───
// 旧スカイドームは MeshBasicMaterial だったため three が自動でトーンマップ/エンコード
// していた。生 ShaderMaterial では自前で同じ処理を行い、地形と色調を一致させる。
const _SKY_TONEMAP_GLSL = [
  'vec3 skyAces(vec3 color,float exposure){',
  '  color*=exposure/0.6;',
  '  const mat3 ACESInputMat=mat3(0.59719,0.07600,0.02840,0.35458,0.90834,0.13383,0.04823,0.01566,0.83777);',
  '  const mat3 ACESOutputMat=mat3(1.60475,-0.10208,-0.00327,-0.53108,1.10813,-0.07276,-0.07367,-0.00605,1.07602);',
  '  color=ACESInputMat*color;',
  '  vec3 a=color*(color+0.0245786)-0.000090537;',
  '  vec3 b=color*(0.983729*color+0.4329510)+0.238081;',
  '  color=a/b;',
  '  color=ACESOutputMat*color;',
  '  return clamp(color,0.0,1.0);',
  '}',
  'vec3 skyLin2srgb(vec3 c){',
  '  vec3 lo=c*12.92;',
  '  vec3 hi=pow(clamp(c,0.0,1.0),vec3(0.41666))*1.055-0.055;',
  '  return mix(hi,lo,vec3(lessThanEqual(c,vec3(0.0031308))));',
  '}'
].join('\n');

// ─── 時間帯キーフレーム ───
// h は 24時間表記。gs.time(0..1) → hour への変換は _skyHour() で行う。
// 各キーは linear 値としてシェーダ/ライトへ渡し、上の ACES+sRGB を通す。
// 色は仕様の「目安」を基準に、トーンマップ後に破綻しない範囲で調整している。
//   zen  天頂 / mid 中間 / hor 地平線 / glow 地平線発光 / haze 霞
//   sun  太陽方向の色偏り / fog シーンフォグ色
//   sunC/sunI  DirectionalLight（夜は月光として青白く弱く）
//   hemC/hemI  HemisphereLight
//   night 0..1 星の見えやすさ / star 星の不透明度 / milky 天の川 / cloudT 雲色 / cloudOp 雲濃度
const _SKY_KEYS = [
  // 深夜 (0:00)
  {h:0.0,  zen:0x020611, mid:0x07152e, hor:0x172e50, glow:0x29466a, haze:0x1c3350, sun:0x2a4a74, fog:0x0a1424,
   sunC:0x8aa6dc, sunI:0.06, hemC:0x22406a, hemI:0.15, night:1.0, star:1.0, milky:1.0, cloudT:0x1d2c48, cloudOp:0.5},
  // 深夜遅く (3:00)
  {h:3.0,  zen:0x020611, mid:0x081633, hor:0x162c4d, glow:0x274264, haze:0x1b3050, sun:0x2a4a74, fog:0x0a1626,
   sunC:0x8aa6dc, sunI:0.06, hemC:0x22406a, hemI:0.15, night:1.0, star:1.0, milky:1.0, cloudT:0x1c2b46, cloudOp:0.5},
  // 夜明け前 (5:00)
  {h:5.0,  zen:0x030817, mid:0x101c42, hor:0x665f89, glow:0xd59bb0, haze:0x45445f, sun:0xd59bb0, fog:0x1a2138,
   sunC:0x7f92c6, sunI:0.09, hemC:0x2c3654, hemI:0.22, night:0.8, star:0.7, milky:0.25, cloudT:0x39384f, cloudOp:0.52},
  // 朝焼け (6:45)
  {h:6.75, zen:0x285c9e, mid:0x79b6d8, hor:0xffd2ad, glow:0xff9b73, haze:0xffcbb0, sun:0xffbc8c, fog:0xe7b79c,
   sunC:0xffc7a0, sunI:0.55, hemC:0xbcc9e2, hemI:0.55, night:0.18, star:0.05, milky:0.0, cloudT:0xffe0bd, cloudOp:0.6},
  // 朝 (8:45)
  {h:8.75, zen:0x168bd8, mid:0x63c6ee, hor:0xdff8ff, glow:0xf0ffff, haze:0xdff6ff, sun:0xfff1d6, fog:0xd8f0ff,
   sunC:0xfff3df, sunI:0.9,  hemC:0xcfe6ff, hemI:0.85, night:0.0, star:0.0, milky:0.0, cloudT:0xffffff, cloudOp:0.6},
  // 昼 (12:45)
  {h:12.75,zen:0x0876d9, mid:0x38aef2, hor:0xbfeaff, glow:0xeefcff, haze:0xcfeeff, sun:0xffffff, fog:0xcbecff,
   sunC:0xffffff, sunI:1.0,  hemC:0xbfdcff, hemI:0.95, night:0.0, star:0.0, milky:0.0, cloudT:0xffffff, cloudOp:0.6},
  // 午後 (16:00)
  {h:16.0, zen:0x1f78cc, mid:0x5cb2e8, hor:0xd6ecf4, glow:0xffeccb, haze:0xdcedf2, sun:0xffe6b0, fog:0xd2ebf0,
   sunC:0xffeccb, sunI:0.9,  hemC:0xcfe0f0, hemI:0.85, night:0.0, star:0.0, milky:0.0, cloudT:0xfff5e8, cloudOp:0.6},
  // 夕焼け (18:15)
  {h:18.25,zen:0x24549b, mid:0x9879b6, hor:0xff9c67, glow:0xffd36a, haze:0xe88f78, sun:0xffcf72, fog:0xdc7a5f,
   sunC:0xffb066, sunI:0.5,  hemC:0x9c86c0, hemI:0.5,  night:0.25, star:0.05, milky:0.0, cloudT:0xffc98a, cloudOp:0.62},
  // 薄明 (19:45)
  {h:19.75,zen:0x16264f, mid:0x4b4a7e, hor:0xb06f86, glow:0xdf896f, haze:0x6a5878, sun:0xd98a76, fog:0x39335a,
   sunC:0xb98fb0, sunI:0.18, hemC:0x55597f, hemI:0.3,  night:0.55, star:0.4, milky:0.12, cloudT:0x4a4468, cloudOp:0.55},
  // 夜 (22:00)
  {h:22.0, zen:0x020611, mid:0x07152e, hor:0x172e50, glow:0x29466a, haze:0x22344f, sun:0x33507a, fog:0x0c1a2e,
   sunC:0x8aa6dc, sunI:0.06, hemC:0x24406a, hemI:0.16, night:1.0, star:1.0, milky:0.85, cloudT:0x22314c, cloudOp:0.5}
];

const _SKY_QUALITY = {
  low:    {stars:130, big:4, mid:2, far:0,  glow:false, milky:0.0, twinkle:0.06, cloudTex:64,  moonTex:64},
  medium: {stars:300, big:4, mid:4, far:3,  glow:true,  milky:0.5, twinkle:0.11, cloudTex:96,  moonTex:96},
  high:   {stars:650, big:6, mid:7, far:7,  glow:true,  milky:1.0, twinkle:0.15, cloudTex:128, moonTex:128}
};

// gs.time(0..1) を 24時間表記へ。既存の軌道式 dayT=(t+0.1)%1 に一致させ、
// 太陽の南中(dayT=0.25)=12時 / 日の出(dayT=0)=6時 / 日没(dayT=0.5)=18時 とする。
function _skyHour(t){ return ((((t + 0.1) % 1) * 24) + 6) % 24; }

class SkySystem {
  constructor(scene, camera, renderer, opts){
    opts = opts || {};
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.sun = opts.sun;          // 既存 DirectionalLight（昼は太陽・夜は月光）
    this.hemLight = opts.hemLight; // 既存 HemisphereLight
    this.CLOUD_RANGE = 170;
    this.q = _SKY_QUALITY[_resolveSkyQuality(opts.quality)];
    this.qualityName = _resolveSkyQuality(opts.quality);
    this._firstFrame = true;
    this._palTimer = 0;
    this._twk = 0;                 // 星の瞬き用時間（品質で加算量が変わる）
    this._moonAge = -1;
    this._shoot = null;            // 流れ星（1個まで）
    this._shootCooldown = 18 + Math.random()*30;
    this._tmp = new THREE.Color();
    this._scratchDir = new THREE.Vector3();

    // 補間の「現在値」と「目標値」（THREE.Color を再利用しアロケーションを避ける）
    this.pal = _makePal();
    this.palT = _makePal();

    this._sharedCloudTex = null;
    this._buildDome();
    this._buildSun();
    this._buildMoon();
    this._buildStars();
    this._buildMilkyWay();
    this._buildClouds();
    this._buildShootingStar();

    // 互換用グローバル別名（他ファイルが参照する）
    this.dome = this._dome;

    // 初期パレット（ゲーム開始前のタイトル画面などで黒くならないよう昼で塗る）。
    // ゲーム開始/ロード時の最初の updateAtmosphere は _firstFrame で正しい時刻へ即スナップする。
    _samplePal(this.pal, 12.75);
    const u = this._domeUniforms;
    u.uZenith.value.copy(this.pal.zen); u.uMid.value.copy(this.pal.mid); u.uHorizon.value.copy(this.pal.hor);
    u.uGlow.value.copy(this.pal.glow); u.uHaze.value.copy(this.pal.haze); u.uSunTint.value.copy(this.pal.sun);
    if(this.scene.fog){ this.scene.fog.color.copy(this.pal.fog); this.renderer.setClearColor(this.scene.fog.color); }
  }

  // ── スカイドーム ──
  _buildDome(){
    const uniforms = {
      uZenith:{value:new THREE.Color()}, uMid:{value:new THREE.Color()}, uHorizon:{value:new THREE.Color()},
      uGlow:{value:new THREE.Color()}, uHaze:{value:new THREE.Color()}, uSunTint:{value:new THREE.Color()},
      uSunDir:{value:new THREE.Vector3(0,1,0)}, uSunHeight:{value:1.0}, uNight:{value:0.0}, uSat:{value:0.0},
      uExposure:{value:this.renderer.toneMappingExposure||1.0}
    };
    const vert = [
      'varying vec3 vDir;',
      'void main(){',
      '  vDir=normalize(position);',
      '  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);',
      '}'
    ].join('\n');
    const frag = [
      'precision mediump float;',
      'uniform vec3 uZenith,uMid,uHorizon,uGlow,uHaze,uSunTint,uSunDir;',
      'uniform float uSunHeight,uNight,uSat,uExposure;',
      'varying vec3 vDir;',
      _SKY_TONEMAP_GLSL,
      'void main(){',
      '  vec3 dir=normalize(vDir);',
      '  float h=clamp(dir.y,0.0,1.0);',
      '  vec3 col=mix(uHorizon,uMid,smoothstep(0.0,0.34,h));',
      '  col=mix(col,uZenith,smoothstep(0.30,0.92,h));',
      '  float band=pow(1.0-h,4.0);',                 // 地平線発光帯
      '  col=mix(col,uGlow,band*0.55);',
      '  float sd=max(dot(dir,uSunDir),0.0);',        // 太陽方向の明るさ
      '  float sunGlow=pow(sd,4.0)*clamp(uSunHeight+0.35,0.0,1.0);',
      '  col+=uSunTint*sunGlow*0.55;',
      '  float horizonSun=pow(sd,2.0)*band;',         // 夕焼け方向へ色を偏らせる
      '  col=mix(col,uSunTint,horizonSun*0.5);',
      '  float anti=max(-dot(normalize(vec3(dir.x,0.0,dir.z)),normalize(vec3(uSunDir.x,0.0,uSunDir.z))),0.0);',
      '  col=mix(col,col*vec3(0.9,0.94,1.08),anti*band*0.35);', // 反対側は少し青く
      '  col=mix(col,uHaze,band*0.25);',              // 地平線の霞
      '  float g=dot(col,vec3(0.299,0.587,0.114));',
      '  col=mix(col,vec3(g),uSat);',                 // 天候による彩度低下
      '  col=skyAces(col,uExposure);',
      '  col=skyLin2srgb(col);',
      '  gl_FragColor=vec4(col,1.0);',
      '}'
    ].join('\n');
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader:vert, fragmentShader:frag,
      side:THREE.BackSide, depthWrite:false, fog:false
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(110,24,16), mat);
    dome.frustumCulled = false;
    dome.renderOrder = -10;
    this._dome = dome;
    this._domeUniforms = uniforms;
    this.scene.add(dome);
  }

  // ── 太陽（中心スプライト + グロー）──
  _buildSun(){
    this._sunCoreTex = _celestGlowTex('#fff6d8','#ffd75e',0.42);
    this._sunGlowTex = _celestGlowTex('#fff0c0','#ffce6a',0.0);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({map:this._sunCoreTex,transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
    core.scale.set(13,13,1); core.renderOrder=-3; core.visible=false;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({map:this._sunGlowTex,transparent:true,opacity:0.5,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
    glow.scale.set(46,46,1); glow.renderOrder=-4; glow.visible=false;
    this.sunSprite = core;
    this.sunGlow = glow;
    this.scene.add(glow); this.scene.add(core);
  }

  // ── 月（月齢対応 CanvasTexture + グロー）──
  _buildMoon(){
    this._moonCanvas = document.createElement('canvas');
    this._moonCanvas.width = this._moonCanvas.height = this.q.moonTex;
    this._moonTex = new THREE.CanvasTexture(this._moonCanvas);
    this._moonTex.encoding = THREE.sRGBEncoding;
    this._moonGlowTex = _celestGlowTex('#cfe0ff','#8fa8d8',0.0);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({map:this._moonTex,transparent:true,depthWrite:false,fog:false}));
    core.scale.set(9,9,1); core.renderOrder=-3; core.visible=false;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({map:this._moonGlowTex,transparent:true,opacity:0.35,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
    glow.scale.set(30,30,1); glow.renderOrder=-4; glow.visible=false;
    this.moonSprite = core;
    this.moonGlow = glow;
    this.scene.add(glow); this.scene.add(core);
    this._drawMoon(4); // 初期は満月
  }

  // 月齢 age(0..7) の月を CanvasTexture に描く。age 変化時のみ再生成する。
  _drawMoon(age){
    if(age === this._moonAge) return;
    this._moonAge = age;
    const cv = this._moonCanvas, S = cv.width, x = cv.getContext('2d');
    const cx = S/2, cy = S/2, R = S*0.42;
    x.clearRect(0,0,S,S);
    // 本体（青白いグラデ）
    const g = x.createRadialGradient(cx-R*0.2, cy-R*0.2, R*0.2, cx, cy, R);
    g.addColorStop(0,'#f4f7ff'); g.addColorStop(0.7,'#dfe6f5'); g.addColorStop(1,'#b9c4dc');
    x.fillStyle = g; x.beginPath(); x.arc(cx,cy,R,0,Math.PI*2); x.fill();
    // 淡い模様（海）
    x.save(); x.beginPath(); x.arc(cx,cy,R,0,Math.PI*2); x.clip();
    x.globalAlpha = 0.14; x.fillStyle = '#8b97b4';
    const spots = [[.30,.35,.20],[.62,.30,.14],[.55,.62,.22],[.38,.66,.12],[.72,.58,.10]];
    for(const s of spots){ x.beginPath(); x.arc(cx+(s[0]-0.5)*2*R, cy+(s[1]-0.5)*2*R, s[2]*R, 0, Math.PI*2); x.fill(); }
    x.restore();
    // 月齢の影（2円近似）: 満月以外は destination-out で欠けを彫る
    const frac = (1 - Math.cos((age/8)*Math.PI*2)) / 2; // 0=新月 .. 1=満月
    if(frac < 0.97){
      const waxing = age < 4;
      const dx = (waxing ? -1 : 1) * 2 * R * frac;
      x.save();
      x.globalCompositeOperation = 'destination-out';
      x.beginPath(); x.arc(cx+dx, cy, R*1.02, 0, Math.PI*2); x.fill();
      x.restore();
      // 影側にごく淡い地球照を残す（真っ黒にしない）
      if(frac > 0.04){
        x.save(); x.beginPath(); x.arc(cx,cy,R,0,Math.PI*2); x.clip();
        x.globalCompositeOperation = 'destination-over';
        x.globalAlpha = 0.06; x.fillStyle = '#3a4560'; // 地球照（真っ黒にしない）
        x.beginPath(); x.arc(cx,cy,R,0,Math.PI*2); x.fill();
        x.restore();
      }
    }
    this._moonTex.needsUpdate = true;
  }

  // ── 星（BufferGeometry + シェーダで瞬き）──
  _buildStars(){
    if(!this._starPivot){ this._starPivot = new THREE.Group(); this._starPivot.frustumCulled=false; this.scene.add(this._starPivot); }
    this._disposeStars();
    const N = this.q.stars;
    const pos = new Float32Array(N*3), col = new Float32Array(N*3);
    const aSize = new Float32Array(N), aBright = new Float32Array(N), aPhase = new Float32Array(N);
    const palette = [ [0.95,0.97,1.0], [0.80,0.87,1.0], [1.0,0.97,0.82] ]; // 白・青白・淡黄
    for(let i=0;i<N;i++){
      let vx,vy,vz,l;
      do{ vx=Math.random()*2-1; vy=Math.random(); vz=Math.random()*2-1; l=Math.hypot(vx,vy,vz); }while(l>1||l<0.2||vy/l<0.05);
      const r = 104;
      pos[i*3]=vx/l*r; pos[i*3+1]=vy/l*r; pos[i*3+2]=vz/l*r;
      const cr = Math.random();
      const c = palette[cr<0.7?0:cr<0.9?1:2];
      col[i*3]=c[0]; col[i*3+1]=c[1]; col[i*3+2]=c[2];
      const alt = vy/l; // 高いほど明るく、地平線付近は暗く
      aSize[i] = (Math.random()<0.12 ? 3.4+Math.random()*2.2 : 1.4+Math.random()*1.6) * (this.renderer.getPixelRatio?this.renderer.getPixelRatio():1);
      aBright[i] = (0.35+Math.random()*0.65) * Math.min(1, Math.max(0.15, (alt-0.05)/0.5));
      aPhase[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color', new THREE.BufferAttribute(col,3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(aSize,1));
    geo.setAttribute('aBright', new THREE.BufferAttribute(aBright,1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase,1));
    const uniforms = { uTime:{value:0}, uOpacity:{value:0}, uTwinkle:{value:this.q.twinkle} };
    const mat = new THREE.ShaderMaterial({
      uniforms, transparent:true, depthWrite:false, fog:false, vertexColors:true, blending:THREE.AdditiveBlending,
      vertexShader:[
        'attribute float aSize;attribute float aBright;attribute float aPhase;',
        'uniform float uTime,uTwinkle;varying float vB;varying vec3 vC;',
        'void main(){',
        '  vC=color;',
        '  float tw=1.0-uTwinkle+uTwinkle*sin(uTime*1.6+aPhase*6.2831);',
        '  vB=aBright*tw;',
        '  gl_PointSize=aSize;',
        '  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);',
        '}'
      ].join('\n'),
      fragmentShader:[
        'precision mediump float;',
        'uniform float uOpacity;varying float vB;varying vec3 vC;',
        'void main(){',
        '  float r=length(gl_PointCoord-0.5);',
        '  float a=smoothstep(0.5,0.0,r);',
        '  gl_FragColor=vec4(vC,a*vB*uOpacity);',
        '}'
      ].join('\n')
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.renderOrder = -5;
    this._starPivot.add(pts);
    this._stars = pts;
    this._starUniforms = uniforms;
  }

  // ── 天の川（淡いスプライトの帯: 高/中品質のみ）──
  _buildMilkyWay(){
    if(!this._milkyRoot){ this._milkyRoot = new THREE.Group(); this._milkyRoot.frustumCulled=false; }
    // 星ピボットに載せて一緒に回転
    if(this._milkyRoot.parent !== this._starPivot){ this._starPivot.add(this._milkyRoot); }
    this._disposeMilky();
    if(this.q.milky <= 0){ this._milkyMats=[]; return; }
    if(!this._milkyTex) this._milkyTex = _milkyTex();
    const mats = [];
    const N = 7, tilt = 0.55;
    for(let i=0;i<N;i++){
      const mat = new THREE.SpriteMaterial({map:this._milkyTex,transparent:true,opacity:0,depthWrite:false,fog:false,blending:THREE.AdditiveBlending,color:0xbcd0ff});
      const sp = new THREE.Sprite(mat);
      const a = (i/N)*Math.PI*2;
      // 天頂付近を通る大円上に配置
      const r = 100;
      const bx = Math.cos(a), bz = Math.sin(a);
      const y = Math.sin(a)*tilt + 0.35;
      const ln = Math.hypot(bx, y, bz);
      sp.position.set(bx/ln*r, Math.abs(y/ln)*r*0.8+18, bz/ln*r);
      sp.scale.set(70,26,1);
      sp.material.rotation = a + 0.6;
      sp.renderOrder = -6;
      this._milkyRoot.add(sp);
      mats.push(mat);
    }
    this._milkyMats = mats;
  }

  // ── 雲（3レイヤーのビルボード）──
  _buildClouds(){
    if(!this._cloudRoot){ this._cloudRoot = new THREE.Group(); this.scene.add(this._cloudRoot); }
    this._disposeClouds();
    if(!this._sharedCloudTex) this._sharedCloudTex = _cloudTextures(this.q.cloudTex);
    const mk = (n,cfg)=>this._makeCloudLayer(n,cfg);
    this._cloudLayers = [
      mk(this.q.big, {yMin:38,yMax:54, rMin:35, rMax:150, sMin:18,sMax:36, hMul:0.6, speed:1.4, op:0.9}),
      mk(this.q.mid, {yMin:52,yMax:70, rMin:60, rMax:160, sMin:11,sMax:22, hMul:0.62,speed:2.1, op:0.72}),
      mk(this.q.far, {yMin:30,yMax:44, rMin:120,rMax:178, sMin:9, sMax:17, hMul:0.6, speed:0.7, op:0.5})
    ];
  }
  _makeCloudLayer(count, cfg){
    const texs = this._sharedCloudTex;
    const mats = texs.map(t=>new THREE.SpriteMaterial({map:t,transparent:true,opacity:cfg.op,depthWrite:false,fog:false,color:0xffffff}));
    const sprites = [];
    for(let i=0;i<count;i++){
      const vi = i % mats.length;
      const sp = new THREE.Sprite(mats[vi]);
      const w = cfg.sMin + Math.random()*(cfg.sMax-cfg.sMin);
      sp.scale.set(w, w*cfg.hMul*(0.75+Math.random()*0.5), 1);
      const ang = Math.random()*Math.PI*2, rad = cfg.rMin + Math.random()*(cfg.rMax-cfg.rMin);
      sp.position.set(Math.cos(ang)*rad, cfg.yMin + Math.random()*(cfg.yMax-cfg.yMin), Math.sin(ang)*rad);
      sp.renderOrder = -1;
      this._cloudRoot.add(sp);
      sprites.push(sp);
    }
    return { mats, sprites, cfg, baseOp:cfg.op };
  }

  // ── 流れ星（夜にごく稀・拡張ポイント）──
  _buildShootingStar(){
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6),3));
    const mat = new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,fog:false,blending:THREE.AdditiveBlending});
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false; line.renderOrder = -4; line.visible = false;
    this.scene.add(line);
    this._shootLine = line;
  }
  _spawnShootingStar(){
    // 上空のランダム方向から、斜めに短く流れる
    const az = Math.random()*Math.PI*2, el = 0.5 + Math.random()*0.4;
    const dir = new THREE.Vector3(Math.cos(az)*Math.cos(el), Math.sin(el), Math.sin(az)*Math.cos(el));
    const tang = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    this._shoot = { pos:dir.multiplyScalar(100), vel:tang.multiplyScalar(120).add(new THREE.Vector3(0,-40,0)), life:0, ttl:0.6+Math.random()*0.4 };
  }
  _updateShootingStar(dt, px, py, pz, nightVis){
    const s = this._shoot;
    if(!s){
      if(nightVis > 0.6){
        this._shootCooldown -= dt;
        if(this._shootCooldown <= 0){ this._shootCooldown = 22 + Math.random()*40; this._spawnShootingStar(); }
      }
      return;
    }
    s.life += dt;
    if(s.life >= s.ttl){ this._shoot = null; this._shootLine.visible = false; return; }
    s.pos.addScaledVector(s.vel, dt);
    const k = 1 - s.life/s.ttl;
    const head = s.pos, tail = this._scratchDir.copy(s.vel).multiplyScalar(-0.06).add(s.pos);
    const arr = this._shootLine.geometry.attributes.position.array;
    arr[0]=px+head.x; arr[1]=py+head.y; arr[2]=pz+head.z;
    arr[3]=px+tail.x; arr[4]=py+tail.y; arr[5]=pz+tail.z;
    this._shootLine.geometry.attributes.position.needsUpdate = true;
    this._shootLine.material.opacity = k * 0.9 * nightVis;
    this._shootLine.visible = true;
  }

  // ── 毎フレーム: 空・フォグ・ライトの色（updateSky から）──
  updateAtmosphere(t, o){
    o = o || {};
    // updateSky 側は dt を渡さないので内部で計測（バックグラウンド復帰の巨大 dt は制限）
    const now = (typeof performance!=='undefined'?performance.now():Date.now())/1000;
    const dt = this._lastNow ? Math.min(0.1, Math.max(0, now - this._lastNow)) : 0.016;
    this._lastNow = now;
    o.dt = dt;
    const hour = _skyHour(t);
    // 軌道（trig はここで一度だけ計算し updateBodies でも再利用）
    const dayT = (t + 0.1) % 1;
    this._isDayNow = dayT < 0.5;
    const sunA = Math.PI*Math.min(1, dayT/0.5);
    const moonA = Math.PI*Math.max(0, Math.min(1, (t-0.4)/0.5));
    this._sunDir = { x:Math.cos(sunA)*0.85, y:Math.sin(sunA)+0.04, z:0.35 };
    this._moonDir = { x:Math.cos(moonA)*0.85, y:Math.sin(moonA)+0.04, z:-0.3 };

    // 目標パレットを低頻度(約8Hz)で更新し、毎フレームは現在値を目標へ補間して滑らかにする
    this._palTimer += o.dt || 0;
    if(this._firstFrame || this._palTimer >= 0.12){
      this._palTimer = 0;
      _samplePal(this.palT, hour);
      _applyWeatherToPal(this.palT, o);
    }
    const lerpK = this._firstFrame ? 1 : Math.min(1, (o.dt||0.016)*4.0);
    _lerpPal(this.pal, this.palT, lerpK);
    this._firstFrame = false;

    // 天候の彩度低下（曇り/雨/雷雨/霧）
    const weather = o.weather|0;
    let sat = 0;
    if(weather===1) sat = 0.42;
    else if(weather===2) sat = 0.55;
    const weatherDim = o.weatherDim || 0;

    // フォグ色（= 地平線色）で空と地形の境界を繋ぐ
    const fog = this.scene.fog;
    if(fog){
      this._tmp.copy(this.pal.fog);
      if(weatherDim>0.01){ const grey = fog.color.getHexString?0:0; this._tmp.lerp(_GREY, weatherDim*0.5); this._tmp.multiplyScalar(1 - weatherDim*0.35); }
      fog.color.copy(this._tmp);
      this.renderer.setClearColor(fog.color);
    }

    // スカイドーム uniforms
    const u = this._domeUniforms;
    u.uZenith.value.copy(this.pal.zen);
    u.uMid.value.copy(this.pal.mid);
    u.uHorizon.value.copy(this.pal.hor);
    u.uGlow.value.copy(this.pal.glow);
    u.uHaze.value.copy(this.pal.haze);
    u.uSunTint.value.copy(this.pal.sun);
    const d = this._isDayNow ? this._sunDir : this._moonDir;
    const dl = Math.hypot(d.x,d.y,d.z)||1;
    u.uSunDir.value.set(d.x/dl, d.y/dl, d.z/dl);
    u.uSunHeight.value = Math.max(0, d.y/dl);
    u.uNight.value = this.pal.night;
    u.uSat.value = Math.min(0.85, sat + weatherDim*0.4);
    if(weatherDim>0.01){ // 雷雨などで空全体を少し暗く
      u.uZenith.value.multiplyScalar(1-weatherDim*0.4);
      u.uMid.value.multiplyScalar(1-weatherDim*0.35);
      u.uHorizon.value.multiplyScalar(1-weatherDim*0.3);
    }

    // ライティング（DirectionalLight = 昼は太陽 / 夜は月光, HemisphereLight）
    let sunI = this.pal.sunI, hemI = this.pal.hemI;
    if(o.fullMoon && !this._isDayNow){ sunI = Math.max(sunI, 0.14); hemI = Math.max(hemI, 0.22); }
    // 天候による減光
    sunI *= (1 - weatherDim*0.85);
    hemI = Math.max(0.1, hemI*(1 - weatherDim*0.5));
    this.sun.color.copy(this.pal.sunC);
    this.sun.intensity = Math.max(0.02, sunI);
    this.hemLight.color.copy(this.pal.hemC);
    this.hemLight.intensity = hemI;

    // バイオーム上書き（火山=赤 / 雪原=淡く冷たく）
    if(o.inVolcano){ this._volcanoOverride(); }
    else if(o.inSnow){ this._snowOverride(); }
  }

  _volcanoOverride(){
    const night = this.pal.night;
    const u = this._domeUniforms;
    this._tmp.setRGB(0.20+night*0.03, 0.04, 0.02);
    u.uZenith.value.copy(this._tmp); u.uMid.value.copy(this._tmp);
    u.uHorizon.value.setRGB(0.26,0.06,0.03); u.uGlow.value.setRGB(0.35,0.08,0.03);
    u.uHaze.value.setRGB(0.24,0.06,0.03); u.uSat.value=0;
    if(this.scene.fog){ this.scene.fog.color.setRGB(0.22,0.05,0.02); this.renderer.setClearColor(this.scene.fog.color); }
    this.sun.color.setHex(0xff6600); this.sun.intensity = Math.max(0.3, 0.7-0.4*night);
    this.hemLight.color.setHex(0xff3300); this.hemLight.intensity = 0.5;
  }
  _snowOverride(){
    const night = this.pal.night, u = this._domeUniforms;
    const k = 1 - night;
    u.uZenith.value.setRGB(0.18+0.25*k,0.24+0.3*k,0.34+0.4*k);
    u.uMid.value.setRGB(0.3+0.3*k,0.38+0.32*k,0.5+0.35*k);
    u.uHorizon.value.setRGB(0.55+0.25*k,0.62+0.25*k,0.75+0.2*k);
    u.uGlow.value.copy(u.uHorizon.value); u.uHaze.value.copy(u.uHorizon.value);
    u.uSat.value = 0.25;
    if(this.scene.fog){ this.scene.fog.color.setRGB(0.5+0.3*k,0.58+0.28*k,0.72+0.22*k); this.renderer.setClearColor(this.scene.fog.color); }
    this.sun.color.setHex(0xaaccff); this.sun.intensity = Math.max(0.2, 0.5+0.3*k);
    this.hemLight.color.setHex(0xaaddff); this.hemLight.intensity = Math.max(0.25, 0.4+0.4*k);
  }

  // ── 毎フレーム: 天体・雲・星の位置と見え方（updateCelestial から）──
  updateBodies(t, dt, o){
    o = o || {};
    const px = P.x, py = P.y, pz = P.z;
    const vis = this._dome.visible;               // 地下/水中では main.js が false にする
    this._dome.position.set(px, py, pz);
    this._starPivot.position.set(px, py, pz);
    this._cloudRoot.visible = vis;
    this._starPivot.visible = vis;

    const sunDir = this._sunDir, moonDir = this._moonDir, isDayNow = this._isDayNow;
    const d = isDayNow ? sunDir : moonDir;
    const dl = Math.hypot(d.x,d.y,d.z)||1;
    // DirectionalLight を可視天体の方向へ（影・地形ライティング）。整数スナップで影のちらつき抑制。
    const ax = Math.round(px), ay = Math.round(py), az = Math.round(pz);
    this.sun.position.set(ax + d.x/dl*60, ay + Math.max(0.15, d.y)/dl*60, az + d.z/dl*60);
    this.sun.target.position.set(ax, ay, az);
    this.sun.castShadow = (typeof SHADOWS_ON!=='undefined' ? SHADOWS_ON : false) && vis;

    // 曇天ほど太陽/月が霞む（軽量な遮蔽近似）
    const cloudy = o.weather===1 ? 0.5 : o.weather===2 ? 0.75 : 0;
    const lightning = (typeof LIGHTNING!=='undefined' ? LIGHTNING : 0);

    // 太陽
    const sunUp = sunDir.y > 0.02;
    this.sunSprite.position.set(px + sunDir.x*96, py + sunDir.y*90, pz + sunDir.z*96);
    this.sunGlow.position.copy(this.sunSprite.position);
    this.sunSprite.visible = vis && isDayNow && sunUp;
    const sunGlowOn = this.q.glow && vis && isDayNow && sunUp;
    this.sunGlow.visible = sunGlowOn;
    if(this.sunSprite.visible){
      const lowSun = 1 - Math.min(1, sunDir.y/0.35); // 低いほど橙
      this.sunSprite.material.color.setRGB(1, 1-lowSun*0.2, 1-lowSun*0.42);
      this.sunSprite.material.opacity = 0.95*(1-cloudy*0.6);
      const sc = 12 + lowSun*4;
      this.sunSprite.scale.set(sc, sc, 1);
    }
    if(sunGlowOn){ this.sunGlow.material.opacity = (0.4 + (1-Math.min(1,sunDir.y/0.5))*0.3)*(1-cloudy*0.7); }

    // 月（月齢は経過日数に連動。満月イベント中は満月+赤み+大きく）
    const moonUp = moonDir.y > 0.02;
    this.moonSprite.position.set(px + moonDir.x*96, py + moonDir.y*90, pz + moonDir.z*96);
    this.moonGlow.position.copy(this.moonSprite.position);
    this.moonSprite.visible = vis && !isDayNow && moonUp;
    const moonGlowOn = this.q.glow && vis && !isDayNow && moonUp;
    this.moonGlow.visible = moonGlowOn;
    const day = (typeof gs!=='undefined' && gs.day) ? gs.day : 1;
    const age = o.fullMoon ? 4 : ((day-1)%8 + 8)%8;
    this._drawMoon(age);
    if(this.moonSprite.visible){
      const big = o.fullMoon;
      const s = big ? 13 : 9;
      this.moonSprite.scale.set(s, s, 1);
      this.moonSprite.material.color.setHex(big ? 0xffcaa0 : 0xffffff);
      this.moonSprite.material.opacity = (1-cloudy*0.6);
    }
    if(moonGlowOn){ this.moonGlow.material.opacity = (o.fullMoon?0.5:0.3)*(1-cloudy*0.7); this.moonGlow.material.color.setHex(o.fullMoon?0xffc9a0:0xcfe0ff); }

    // 星: 夜に向けて濃くなり、曇天/雨で薄れる。ピボットを日周でゆっくり回す。
    const dayTv = (t + 0.1) % 1;
    this._starPivot.rotation.z = -dayTv * Math.PI * 0.5;
    const twAmt = this.q.twinkle;
    this._twk += dt * 1.6;
    if(this._starUniforms){
      this._starUniforms.uTime.value += dt;
      const nightVis = Math.max(0, this.pal.night*this.pal.star);
      const starOp = nightVis * (1 - cloudy) * (1 + lightning*0.2);
      this._starUniforms.uOpacity.value = Math.min(1, starOp);
      this._starUniforms.uTwinkle.value = twAmt;
      this._updateShootingStar(dt, px, py, pz, this._stars && vis ? nightVis*(1-cloudy) : 0);
    }

    // 天の川（夜のみ・月が明るいと薄く）
    if(this._milkyMats && this._milkyMats.length){
      const moonBright = (!isDayNow && moonUp) ? (o.fullMoon?0.7:0.4) : 0;
      const mop = this.q.milky * this.pal.milky * (1 - cloudy) * (1 - moonBright) * 0.16;
      for(const m of this._milkyMats) m.opacity = Math.max(0, mop);
    }

    // 雲: 時間帯色 + 風で移動 + プレイヤー追従で循環。雷で一瞬明るく。
    if(vis && this._cloudLayers){
      const tint = this.pal.cloudT, baseOp = this.pal.cloudOp;
      // 曇り/雨で濃く暗く
      let opMul = 1, darken = 0;
      if(o.weather===1){ opMul = 1.35; darken = 0.18; }
      else if(o.weather===2){ opMul = 1.5; darken = 0.32; }
      const lightBoost = 1 + lightning*0.35;
      const RANGE = this.CLOUD_RANGE;
      for(const layer of this._cloudLayers){
        this._tmp.copy(tint).multiplyScalar((1-darken)*lightBoost);
        for(const m of layer.mats){
          m.color.copy(this._tmp);
          m.opacity = Math.min(1, layer.baseOp * (baseOp/0.6) * opMul);
        }
        const spd = layer.cfg.speed;
        for(const cl of layer.sprites){
          cl.position.x += dt * spd;
          if(cl.position.x - px > RANGE) cl.position.x -= RANGE*2;
          else if(px - cl.position.x > RANGE) cl.position.x += RANGE*2;
          if(cl.position.z - pz > RANGE) cl.position.z -= RANGE*2;
          else if(pz - cl.position.z > RANGE) cl.position.z += RANGE*2;
        }
      }
    }
  }

  // ── 品質切替 ──
  setQuality(q){
    const name = _resolveSkyQuality(q);
    if(name === this.qualityName) return;
    this.qualityName = name;
    this.q = _SKY_QUALITY[name];
    // 月テクスチャ解像度の変更に合わせて描き直し
    if(this._moonCanvas.width !== this.q.moonTex){
      this._moonCanvas.width = this._moonCanvas.height = this.q.moonTex;
      const a = this._moonAge; this._moonAge = -1; this._drawMoon(a<0?4:a);
    }
    this._sharedCloudTex = null; // 解像度差し替え
    this._buildStars();
    this._buildMilkyWay();
    this._buildClouds();
    this._firstFrame = true; // パレット即時反映
  }

  resize(){ /* ドームは方向ベースなので画面リサイズで再構築不要 */ }

  // ── 破棄 ──
  _disposeClouds(){
    if(!this._cloudLayers) return;
    for(const layer of this._cloudLayers){
      for(const sp of layer.sprites) this._cloudRoot.remove(sp);
      for(const m of layer.mats) m.dispose();
    }
    this._cloudLayers = null;
  }
  _disposeStars(){
    if(this._stars){ this._starPivot.remove(this._stars); this._stars.geometry.dispose(); this._stars.material.dispose(); this._stars=null; }
  }
  _disposeMilky(){
    if(this._milkyRoot){ while(this._milkyRoot.children.length){ const c=this._milkyRoot.children.pop(); if(c.material)c.material.dispose(); } }
    this._milkyMats = [];
  }
  dispose(){
    this._disposeClouds(); this._disposeStars(); this._disposeMilky();
    const rm = (o)=>{ if(!o)return; if(o.parent)o.parent.remove(o); if(o.geometry)o.geometry.dispose(); if(o.material){ if(o.material.map)o.material.map.dispose(); o.material.dispose(); } };
    rm(this._dome); rm(this.sunSprite); rm(this.sunGlow); rm(this.moonSprite); rm(this.moonGlow); rm(this._shootLine);
    if(this._sunCoreTex)this._sunCoreTex.dispose(); if(this._sunGlowTex)this._sunGlowTex.dispose();
    if(this._moonTex)this._moonTex.dispose(); if(this._moonGlowTex)this._moonGlowTex.dispose();
    if(this._milkyTex)this._milkyTex.dispose();
    if(this._sharedCloudTex)for(const t of this._sharedCloudTex)t.dispose();
    if(this._starPivot&&this._starPivot.parent)this._starPivot.parent.remove(this._starPivot);
    if(this._cloudRoot&&this._cloudRoot.parent)this._cloudRoot.parent.remove(this._cloudRoot);
  }
}

// ═══ パレット補助（アロケーション削減のため Color を使い回す）═══
const _GREY = new THREE.Color(0.5,0.5,0.5);
function _makePal(){
  return {
    zen:new THREE.Color(), mid:new THREE.Color(), hor:new THREE.Color(), glow:new THREE.Color(),
    haze:new THREE.Color(), sun:new THREE.Color(), fog:new THREE.Color(), sunC:new THREE.Color(), hemC:new THREE.Color(),
    cloudT:new THREE.Color(), sunI:0, hemI:0, night:0, star:0, milky:0, cloudOp:0.6
  };
}
// hour(0..24) を近傍2キーで巡回補間して out へ
function _samplePal(out, hour){
  const K = _SKY_KEYS, n = K.length;
  let i0 = n-1, i1 = 0;
  for(let i=0;i<n;i++){
    const a = K[i].h, b = K[(i+1)%n].h;
    const bb = (b<=a)? b+24 : b;
    let hh = hour; if(hh < a) hh += 24;
    if(hh >= a && hh <= bb){ i0=i; i1=(i+1)%n; var span=bb-a; var f=span>0?(hh-a)/span:0; break; }
  }
  if(typeof f === 'undefined'){ i0=n-1; i1=0; f=0; }
  const A = K[i0], B = K[i1];
  out.zen.setHex(A.zen).lerp(_tmpC.setHex(B.zen), f);
  out.mid.setHex(A.mid).lerp(_tmpC.setHex(B.mid), f);
  out.hor.setHex(A.hor).lerp(_tmpC.setHex(B.hor), f);
  out.glow.setHex(A.glow).lerp(_tmpC.setHex(B.glow), f);
  out.haze.setHex(A.haze).lerp(_tmpC.setHex(B.haze), f);
  out.sun.setHex(A.sun).lerp(_tmpC.setHex(B.sun), f);
  out.fog.setHex(A.fog).lerp(_tmpC.setHex(B.fog), f);
  out.sunC.setHex(A.sunC).lerp(_tmpC.setHex(B.sunC), f);
  out.hemC.setHex(A.hemC).lerp(_tmpC.setHex(B.hemC), f);
  out.cloudT.setHex(A.cloudT).lerp(_tmpC.setHex(B.cloudT), f);
  out.sunI = A.sunI + (B.sunI-A.sunI)*f;
  out.hemI = A.hemI + (B.hemI-A.hemI)*f;
  out.night = A.night + (B.night-A.night)*f;
  out.star = A.star + (B.star-A.star)*f;
  out.milky = A.milky + (B.milky-A.milky)*f;
  out.cloudOp = A.cloudOp + (B.cloudOp-A.cloudOp)*f;
}
const _tmpC = new THREE.Color();
// 天候に応じてパレット目標を寄せる（曇り/雨で雲を増やし彩度を落とす等）
function _applyWeatherToPal(pal, o){
  const w = o.weather|0;
  if(w===0) return;
  // 雲を濃く・空をやや灰色へ寄せる（急変させないよう現在値→目標の補間は呼び出し側で行う）
  const grey = _tmpC.set(0.55,0.58,0.62);
  const amt = w===2 ? 0.4 : 0.22;
  pal.hor.lerp(grey, amt*0.6);
  pal.glow.lerp(grey, amt*0.5);
  pal.cloudT.lerp(_tmpC.set(0.6,0.62,0.66), amt);
  pal.cloudOp = Math.min(0.85, pal.cloudOp + amt*0.4);
}
function _lerpPal(cur, tgt, k){
  cur.zen.lerp(tgt.zen,k); cur.mid.lerp(tgt.mid,k); cur.hor.lerp(tgt.hor,k);
  cur.glow.lerp(tgt.glow,k); cur.haze.lerp(tgt.haze,k); cur.sun.lerp(tgt.sun,k);
  cur.fog.lerp(tgt.fog,k); cur.sunC.lerp(tgt.sunC,k); cur.hemC.lerp(tgt.hemC,k); cur.cloudT.lerp(tgt.cloudT,k);
  cur.sunI += (tgt.sunI-cur.sunI)*k; cur.hemI += (tgt.hemI-cur.hemI)*k; cur.night += (tgt.night-cur.night)*k;
  cur.star += (tgt.star-cur.star)*k; cur.milky += (tgt.milky-cur.milky)*k; cur.cloudOp += (tgt.cloudOp-cur.cloudOp)*k;
}

function _resolveSkyQuality(q){
  if(q==='low'||q==='medium'||q==='high') return q;
  // auto: モバイルは medium、PC は high（既存の端末判定 isTouch を利用）
  return (typeof isTouch!=='undefined' && isTouch) ? 'medium' : 'high';
}

// ═══ CanvasTexture 生成（初期化時のみ・毎フレーム再生成しない）═══
// 太陽/月のグロー: 中心が明るく外周へ透明にフェードする放射状テクスチャ
function _celestGlowTex(core, edge, coreStop){
  const S=64, c=document.createElement('canvas'); c.width=c.height=S; const x=c.getContext('2d');
  const g=x.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
  g.addColorStop(0, core);
  g.addColorStop(Math.max(0.01,coreStop||0.0), core);
  g.addColorStop(1, _hexA(edge,0));
  x.fillStyle=g; x.beginPath(); x.arc(S/2,S/2,S/2,0,Math.PI*2); x.fill();
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; return t;
}
// #rrggbb → rgba(...,alpha)
function _hexA(hex, a){
  hex = hex.replace('#','');
  const r=parseInt(hex.slice(0,2),16), g=parseInt(hex.slice(2,4),16), b=parseInt(hex.slice(4,6),16);
  return 'rgba('+r+','+g+','+b+','+a+')';
}
// 積雲テクスチャ: 複数の円/楕円を重ね、上部は明るく下部は青灰、外周は透明フェード。
// 変化を出すため複数種類を生成する。透明部分に黒縁が出ないよう色付きで描いて alpha を落とす。
function _cloudTextures(res){
  const N=3, texs=[];
  for(let v=0; v<N; v++){
    const S=res, c=document.createElement('canvas'); c.width=S; c.height=Math.floor(S*0.68); const H=c.height; const x=c.getContext('2d');
    const rng=_skyRng(1000+v*97);
    const blobs=6+Math.floor(rng()*5);
    x.clearRect(0,0,S,H);
    for(let i=0;i<blobs;i++){
      const bx = S*(0.2+rng()*0.6);
      const by = H*(0.35+rng()*0.4);
      const rr = S*(0.12+rng()*0.16);
      const g=x.createRadialGradient(bx,by-rr*0.3,rr*0.15,bx,by,rr);
      // 上部明るい白 / 下面 青灰。by が上なら明るめに。
      const topBias = 1 - by/H;
      const topCol = 'rgba(255,255,255,'+(0.9).toFixed(2)+')';
      const botCol = 'rgba('+Math.floor(150+topBias*40)+','+Math.floor(165+topBias*40)+','+Math.floor(190+topBias*30)+',0.0)';
      g.addColorStop(0, topCol);
      g.addColorStop(0.6, 'rgba('+Math.floor(210+topBias*30)+','+Math.floor(220+topBias*25)+',235,0.55)');
      g.addColorStop(1, botCol);
      x.fillStyle=g; x.beginPath(); x.ellipse(bx,by,rr,rr*(0.6+rng()*0.3),rng()*Math.PI,0,Math.PI*2); x.fill();
    }
    // 下面をわずかに青灰へ（陰影）
    const shade=x.createLinearGradient(0,H*0.45,0,H);
    shade.addColorStop(0,'rgba(120,140,170,0)');
    shade.addColorStop(1,'rgba(110,130,165,0.18)');
    x.globalCompositeOperation='source-atop';
    x.fillStyle=shade; x.fillRect(0,0,S,H);
    x.globalCompositeOperation='source-over';
    const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; texs.push(t);
  }
  return texs;
}
// 天の川のスプライト用: 柔らかく斑な帯（板に見えないよう低コントラスト）
function _milkyTex(){
  const W=128,H=64,c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
  x.clearRect(0,0,W,H);
  const rng=_skyRng(7777);
  for(let i=0;i<180;i++){
    const px=rng()*W, py=H/2 + (rng()-0.5)*H*0.7*(1-Math.abs(px/W-0.5)*0.8);
    const r=0.5+rng()*2.2;
    const a=0.02+rng()*0.06;
    x.fillStyle='rgba('+Math.floor(200+rng()*55)+','+Math.floor(210+rng()*45)+',255,'+a.toFixed(3)+')';
    x.beginPath(); x.arc(px,py,r,0,Math.PI*2); x.fill();
  }
  // 端をフェード
  const grad=x.createLinearGradient(0,0,W,0);
  grad.addColorStop(0,'rgba(0,0,0,1)'); grad.addColorStop(0.15,'rgba(0,0,0,0)');
  grad.addColorStop(0.85,'rgba(0,0,0,0)'); grad.addColorStop(1,'rgba(0,0,0,1)');
  x.globalCompositeOperation='destination-out';
  x.fillStyle=grad; x.fillRect(0,0,W,H);
  x.globalCompositeOperation='source-over';
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; return t;
}
// 決定的な軽量乱数（テクスチャ生成用）
function _skyRng(seed){ let s=seed>>>0; return function(){ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; }; }

// ═══ インスタンス化 + 旧グローバル別名 ═══
// world.js が作った scene/camera/renderer/sun/hemLight を利用する。
const skySystem = new SkySystem(scene, camera, renderer, {
  sun: sun, hemLight: hemLight,
  quality: (typeof settings!=='undefined' && settings.skyQuality) ? settings.skyQuality : 'auto'
});
// 旧コード互換の別名（main.js / world.js / hud.js が参照する）
var skyMesh = skySystem.dome;
var sunSprite = skySystem.sunSprite;
var moonSprite = skySystem.moonSprite;
