/* ═══════════════════════════════════════════════════════
   홀덤펍 점장 — 프로토타입 2판
   설계: pub-sim/DESIGN.md

   플레이어는 점장이다. 직접 걸어 다니며 카운터를 보고, 호출에 가고, 바닥을 닦고,
   테이블을 맞추고, 마이크로 아나운스한다. 딜러 · 홀 직원 · 손님은 NPC 가 움직인다.

   하루: 오픈 준비(상점 · 칩 구조 · 음료 · 딜러) → 영업 18:00~02:00 → 마감 정산.

   경제는 합법 운영 기준이다: 매출은 참가비와 음료뿐, 시상은 트로피와 시드권.
   칩 환전 · 현금 시상은 게임 안에도 없다.

   판정 정답의 근거는 딜러마스터 레포의 TDA 케이스 문서다. 원문 대조 전이라
   채점 화면에 「원문 확인 전」을 붙인다.
   ═══════════════════════════════════════════════════════ */
(function () {
'use strict';

// ── 상수 ────────────────────────────────────────────
var DAY_SEC = 360;                 // 18:00 → 02:00 을 실시간 6 분에 (1 배속)
var OPEN_MIN = 18 * 60, CLOSE_MIN = 26 * 60, REG_CLOSE_MIN = 23 * 60;
var CALL_LIMIT = 30, ANNOUNCE_LIMIT = 30, BALANCE_LIMIT = 40;
var N = 6;
var START_BANK = 1500000;
var STOCK_COST = 2000;

var WAGE = { dealer: 150000, staff: 120000, counter: 110000, cleaner: 100000, ops: 200000 };
var FEES = [20000, 30000, 50000];
var STACKS = [
  { chips: 20000, ko: '얕게 20,000', bust: 1.3, sat: -0.1 },
  { chips: 30000, ko: '보통 30,000', bust: 1.0, sat: 0 },
  { chips: 50000, ko: '깊게 50,000', bust: 0.72, sat: 0.12 }
];
var LEVEL_LEN = [15, 20, 25];
var PRICES = [{ p: 5000, k: 1.2 }, { p: 6000, k: 1.0 }, { p: 8000, k: 0.72 }];
var STOCK_OPTS = [30, 60, 90];

var BLINDS = [[100, 200], [200, 400], [300, 600], [400, 800], [500, 1000], [600, 1200],
  [800, 1600], [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000], [4000, 8000],
  [5000, 10000], [6000, 12000], [8000, 16000], [10000, 20000], [15000, 30000], [20000, 40000],
  [25000, 50000], [30000, 60000], [40000, 80000], [50000, 100000]];

var SHOP = [
  { id: 'interior', ko: '인테리어 리뉴얼', price: 900000, desc: '조명 · 화분 · 바닥. 손님 도착 +15%, 만족도 감소 −30%' },
  { id: 'shuffler', ko: '자동 셔플러', price: 700000, desc: '딜러 피로 누적 −35%, 핸드 속도 +10%' },
  { id: 'bar', ko: '바 좌석 확장', price: 500000, desc: '대기 · 음료 좌석 7 → 10' },
  { id: 'coffee', ko: '커피 머신', price: 400000, desc: '음료 구매율 +20% — 비싼 가격의 손해를 줄인다' },
  { id: 'table3', ko: '3번 테이블', price: 1600000, desc: '좌석 +6. 딜러가 넷 필요하다 (넷째 딜러 고용 필요)' },
  { id: 'dealer4', ko: '딜러 고용 — 하윤', price: 0, wage: 150000, desc: '정확도 72 · 속도 105. 일당 150,000' },
  { id: 'counter', ko: '카운터 직원 고용', price: 0, wage: 110000, desc: '점장이 없어도 등록이 빠르다. 일당 110,000' },
  { id: 'cleaner', ko: '청소 직원 고용', price: 0, wage: 100000, desc: '쏟아진 음료를 알아서 치운다. 일당 100,000' }
];

var CUST_TYPES = {
  regular: { ko: '단골', color: 0x3B6FB6, w: 0.3, reentry: 0.6, drink: 1.3,
    talk: ['오늘 카드 잘 붙네', '사장님 저 왔어요~', '여기 분위기 좋아', '한 잔 더 해야지'] },
  rookie: { ko: '초보', color: 0x3E9B5F, w: 0.35, reentry: 0.35, drink: 1.0,
    talk: ['이거 콜해도 되나…', '블라인드 언제 올라요?', '처음 와 봤어요', '와 칩 예쁘다'] },
  pro: { ko: '고수', color: 0x7A4BB0, w: 0.2, reentry: 0.5, drink: 0.7,
    talk: ['…', '구조 괜찮네', '오늘 필드 무르다', '레벨 몇 분이죠?'] },
  rude: { ko: '진상', color: 0xC2412F, w: 0.15, reentry: 0.5, drink: 1.1,
    talk: ['빨리빨리 좀!', '딜러 또 늦네', '음료 언제 와요?', '여기 왜 이래'] }
};
var NAMES = ['김도현', '박서준', '이민아', '최우진', '정하늘', '강태호', '윤소라', '임재혁', '한다은',
  '서지훈', '오유진', '배성민', '조은비', '신우석', '문가영', '홍재민', '류하준', '장서윤', '권민호',
  '송지아', '안태윤', '황보람', '전다빈', '고은찬', '남궁현', '유채린', '백승우', '노하린', '하지원', '차민혁',
  '구본서', '탁지민', '마승훈', '설예린', '엄태경', '용다솔'];
var DEALERS = [
  { name: '민준', acc: 86, speed: 0.95 },
  { name: '서연', acc: 74, speed: 1.15 },
  { name: '지호', acc: 63, speed: 1.05 },
  { name: '하윤', acc: 72, speed: 1.05 }
];
var SRC = {
  sa: '케이스 6 · Rule 36 (실질 액션) — 블라인드를 빼고, 차례대로 나온 액션 둘 중 하나라도 칩이 들어갔거나 액션이 셋이면 실질 액션',
  btn: '케이스 5 · Rule 34-A (버튼 위치와 이동)',
  cnt: '케이스 6 · Rule 35-D · 36 · 38 (미스딜 · 실질 액션 · 번 카드)',
  under: '케이스 19 · Rule 52-A (언더레이즈 정정 시점)',
  dead: '토너먼트 데드 버튼 규칙'
};

// ── 유틸 ────────────────────────────────────────────
function rnd(n) { return Math.floor(Math.random() * n); }
function chance(p) { return Math.random() < p; }
function pick(a) { return a[rnd(a.length)]; }
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function won(n) { return Math.round(n).toLocaleString('ko-KR'); }
function $(s) { return document.querySelector(s); }
function josa(w, a, b) {
  var c = String(w).charCodeAt(String(w).length - 1);
  return (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28) ? a : b;
}
function clock(min) {
  var h = Math.floor(min / 60) % 24, m = Math.floor(min % 60);
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}
function seatNo(i) { return (i + 1) + '번'; }
function now() { return performance.now() / 1000; }
function V(x, z) { return new THREE.Vector3(x, 0, z); }

// ═══════════════════════════════════════════════════
// 소리 — 첫 클릭 뒤에만 난다
// ═══════════════════════════════════════════════════
var AC = null, MUTED = false;
function audioOn() {
  if (AC) return;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
}
function tone(freq, dur, type, vol, delay) {
  if (!AC || MUTED) return;
  var t = AC.currentTime + (delay || 0);
  var o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
var SFX = {
  call: function () { tone(880, 0.12, 'square', 0.07); tone(660, 0.16, 'square', 0.07, 0.14); },
  cash: function () { tone(1320, 0.08, 'triangle', 0.08); tone(1760, 0.14, 'triangle', 0.08, 0.07); },
  good: function () { tone(660, 0.1, 'sine', 0.12); tone(880, 0.1, 'sine', 0.12, 0.09); tone(1320, 0.2, 'sine', 0.12, 0.18); },
  bad: function () { tone(220, 0.25, 'sawtooth', 0.08); tone(160, 0.3, 'sawtooth', 0.08, 0.12); },
  mic: function () { tone(523, 0.18, 'sine', 0.1); tone(659, 0.18, 'sine', 0.1, 0.16); tone(784, 0.3, 'sine', 0.1, 0.32); },
  chips: function () { for (var i = 0; i < 4; i++) tone(2400 + rnd(800), 0.03, 'triangle', 0.04, i * 0.035); },
  win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.25, 'triangle', 0.1, i * 0.12); }); }
};

// ═══════════════════════════════════════════════════
// 3D 장면
// ═══════════════════════════════════════════════════
var scene, camera, renderer, raycaster, pointer;
var cam = { yaw: -0.18, pitch: 0.92, dist: 21, target: V(-0.5, -0.5), follow: false };
var pickables = [];
var decor = {};   // 상점 구매로 보이는 것들

var TABLE_DEF = [
  { name: '1번 테이블', cx: -4.4, cz: 0.4 },
  { name: '2번 테이블', cx: 3.4, cz: -1.4 },
  { name: '3번 테이블', cx: -0.6, cz: 5.2 }
];
var RX = 1.9, RZ = 1.1;
// 딜러가 앞(+z), 1번 좌석은 딜러 왼쪽에서 시작해 시계 방향 — 위에서 보면 아래→왼쪽→위→오른쪽
var SEAT_ANG = [140, 190, 240, 300, 350, 40];
var SPOTS = {
  outside: V(10.5, 10), door: V(10.5, 7.2),
  counter: V(8.2, 3.5),
  dealerRest: V(-10.4, -2.4),
  staffHome: V(-5.5, -5.3),
  playerHome: V(6.6, 3.8),
  cleanerHome: V(-11, 4)
};
var QUEUE = [V(8.2, 3.6), V(8.3, 4.5), V(8.7, 5.3), V(9.3, 6.0), V(9.9, 6.6), V(10.5, 7.1)];
var BAR_ALL = [];
for (var bi = 0; bi < 10; bi++) BAR_ALL.push(V(-10.6 + bi * 1.05, -4.9));
function barCap() { return G.owned.bar ? 10 : 7; }

function seatPos(t, i, off) {
  var a = SEAT_ANG[i] * Math.PI / 180, o = off || 0.62;
  return V(t.cx + (RX + o) * Math.cos(a), t.cz + (RZ + o) * Math.sin(a));
}
function dealerPos(t) { return V(t.cx, t.cz + RZ + 0.55); }

function mat(c, o) { return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8, metalness: 0.05 }, o || {})); }
function box(w, h, d, c, x, y, z, parent) {
  var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  (parent || scene).add(m); return m;
}

function initScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('#scene').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1612);
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x3a2a1e, 0.55));
  var sun = new THREE.DirectionalLight(0xffe9c8, 0.85);
  sun.position.set(6, 16, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  var sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 12; sc.bottom = -12;
  scene.add(sun);

  // 바닥 · 벽
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), mat(0x6b4a33, { roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  floor.userData.floor = true; pickables.push(floor);
  decor.floor = floor;
  var rug = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), mat(0x3a2b3f, { roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(-0.6, 0.01, 1.2); rug.receiveShadow = true; scene.add(rug);
  rug.userData.floor = true; pickables.push(rug);
  decor.rug = rug;
  decor.wall = box(26, 3, 0.3, 0x2c3b36, 0, 1.5, -9);
  box(0.3, 3, 18, 0x2c3b36, -13, 1.5, 0);
  box(0.3, 0.6, 12, 0x2c3b36, 13, 0.3, -3);
  var mt = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), mat(0x8a2b22));
  mt.rotation.x = -Math.PI / 2; mt.position.set(10.5, 0.02, 7.6); scene.add(mt);

  // 바
  box(8, 1.1, 1, 0x4a2f22, -7.6, 0.55, -6.6);
  box(8, 0.08, 1.2, 0x2a1b14, -7.6, 1.12, -6.6);
  box(8, 1.4, 0.5, 0x23332e, -7.6, 1.6, -8.6);
  for (var k = 0; k < 8; k++) {
    var bot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 10), mat([0x2f8a5b, 0x9c3d2d, 0xd8b35a][k % 3], { roughness: 0.3 }));
    bot.position.set(-11 + k * 0.9, 2.45, -8.6); scene.add(bot);
  }
  decor.barExt = new THREE.Group();
  box(3.2, 1.1, 1, 0x4a2f22, -2, 0.55, -6.6, decor.barExt);
  box(3.2, 0.08, 1.2, 0x2a1b14, -2, 1.12, -6.6, decor.barExt);
  decor.barExt.visible = false; scene.add(decor.barExt);
  decor.stools = BAR_ALL.map(function (p) {
    var st = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 14), mat(0x1d1d1d));
    st.position.set(p.x, 0.3, p.z - 0.55); st.castShadow = true; scene.add(st);
    return st;
  });
  var barSign = labelSprite('BAR', '#EF9F27');
  barSign.position.set(-7.6, 2.2, -8.3); scene.add(barSign);

  // 등록 카운터
  var counter = box(2.8, 1.1, 0.9, 0x4a2f22, 8.2, 0.55, 2.4);
  counter.userData.counter = true; pickables.push(counter);
  var sign = labelSprite('등록 · 계산', '#EF9F27');
  sign.position.set(8.2, 1.7, 2.4); scene.add(sign);
  // 딜러 휴게 자리
  box(1.6, 0.5, 0.9, 0x31423c, -10.4, 0.25, -1.4);
  // 마이크 스탠드 (아나운스 자리)
  var mic = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8), mat(0x111111));
  mic.position.set(6.4, 0.7, 1.6); scene.add(mic);
  var mh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0x333333));
  mh.position.set(6.4, 1.45, 1.6); scene.add(mh);

  // 인테리어 (구매하면 보인다)
  decor.interior = new THREE.Group();
  [[-12.2, -7.8], [12.2, -7.6], [-12.2, 7.8], [5.5, -8.2], [-3, -8.2]].forEach(function (p) {
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.5, 12), mat(0x8a5a3c));
    pot.position.set(p[0], 0.25, p[1]);
    var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), mat(0x2f7a45));
    leaf.position.set(p[0], 0.95, p[1]); leaf.scale.y = 1.3;
    decor.interior.add(pot, leaf);
  });
  decor.interior.visible = false; scene.add(decor.interior);

  // 테이블 (셋째는 사야 보인다)
  TABLE_DEF.forEach(function (t, ti) {
    var g = new THREE.Group();
    var felt = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 48), mat(0x0F6E56, { roughness: 0.95 }));
    felt.scale.set(RX, 1, RZ); felt.position.y = 0.82; felt.receiveShadow = true;
    var rail = new THREE.Mesh(new THREE.TorusGeometry(1, 0.11, 10, 48), mat(0x2a1b14, { roughness: 0.5 }));
    rail.rotation.x = Math.PI / 2; rail.scale.set(RX + 0.04, RZ + 0.07, 1); rail.position.y = 0.87; rail.castShadow = true;
    var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 0.8, 16), mat(0x1d1d1d));
    leg.position.y = 0.4; leg.castShadow = true;
    var shuf = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.3), mat(0x151515));
    shuf.position.set(0.55, 0.98, RZ - 0.25);
    g.add(felt, rail, leg, shuf);
    // 인테리어를 사면 켜지는 테이블 조명 — 위에서 가리지 않게 빛만
    var pl = new THREE.PointLight(0xffd7a0, 0.7, 6.5);
    pl.position.set(0, 2.6, 0); pl.visible = false;
    g.add(pl); t.lamp = pl;
    t.shuffler = shuf; shuf.visible = false;
    for (var i = 0; i < N; i++) {
      var p = seatPos({ cx: 0, cz: 0 }, i, 0.95);
      var ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(0x2b2b30));
      ch.position.set(p.x, 0.25, p.z); ch.castShadow = true; g.add(ch);
    }
    t.cards = [];
    for (var s = 0; s < N; s++) {
      var cp = seatPos({ cx: 0, cz: 0 }, s, -0.42);
      var cg = new THREE.Group();
      for (var c2 = 0; c2 < 2; c2++) {
        var card = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.23), mat(0xf5f5f0));
        card.position.set(c2 * 0.12 - 0.06, 0, 0);
        cg.add(card);
      }
      cg.position.set(cp.x, 0.885, cp.z);
      cg.rotation.y = -SEAT_ANG[s] * Math.PI / 180 + Math.PI / 2;
      cg.visible = false;
      g.add(cg); t.cards.push(cg);
    }
    var chips = new THREE.Group();
    [0xd9dedb, 0x2e6e52, 0xb23a2e, 0x2c4a7a].forEach(function (c, ix) {
      for (var h = 0; h < 3; h++) {
        var chip = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.035, 16), mat(c, { roughness: 0.4 }));
        chip.position.set(-0.3 + ix * 0.2, 0.9 + h * 0.037, 0);
        chips.add(chip);
      }
    });
    g.add(chips);
    g.position.set(t.cx, 0, t.cz);
    scene.add(g);
    t.group = g;
    felt.userData.table = ti; rail.userData.table = ti;
    pickables.push(felt, rail);
    var alarm = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 16), mat(0xE5402F, { emissive: 0x7a1208 }));
    alarm.rotation.x = Math.PI;
    alarm.position.set(t.cx, 3, t.cz);
    alarm.visible = false;
    scene.add(alarm);
    t.alarm = alarm;
  });

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  bindInput();
  fitCamera();
  window.addEventListener('resize', function () {
    fitCamera();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function applyDecor() {
  decor.interior.visible = !!G.owned.interior;
  decor.floor.material.color.setHex(G.owned.interior ? 0x7a5636 : 0x6b4a33);
  decor.rug.material.color.setHex(G.owned.interior ? 0x2d3f5a : 0x3a2b3f);
  decor.wall.material.color.setHex(G.owned.interior ? 0x3a2f2a : 0x2c3b36);
  decor.barExt.visible = !!G.owned.bar;
  decor.stools.forEach(function (s, i) { s.visible = i < barCap(); });
  TABLE_DEF.forEach(function (t, i) {
    t.group.visible = i < 2 || !!G.owned.table3;
    t.shuffler.visible = !!G.owned.shuffler;
    t.lamp.visible = !!G.owned.interior;
  });
}

/* 세로 화면에서는 매장 전체가 들어오도록 멀리, 더 위에서 본다 */
function fitCamera() {
  var portrait = window.innerWidth / window.innerHeight < 1;
  cam.dist = portrait ? 36 : 21;
  cam.pitch = portrait ? 1.18 : 0.92;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function labelSprite(text, color) {
  var c = document.createElement('canvas'); c.width = 256; c.height = 64;
  var x = c.getContext('2d');
  x.fillStyle = 'rgba(20,20,20,.85)'; x.fillRect(0, 0, 256, 64);
  x.fillStyle = color; x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 33);
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c) }));
  sp.scale.set(2, 0.5, 1);
  return sp;
}

function updateCamera(dt) {
  var t = cam.target;
  if (cam.follow && G.player) {
    var p = G.player.mesh.position;
    t.x += (p.x - t.x) * Math.min(1, dt * 4);
    t.z += (p.z - t.z) * Math.min(1, dt * 4);
  }
  camera.position.set(
    t.x + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
    t.y + cam.dist * Math.sin(cam.pitch),
    t.z + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw)
  );
  camera.lookAt(t);
}

var KEYS = {};
function bindInput() {
  var el = renderer.domElement, drag = null, pinch = null;
  el.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, moved: 0 }; audioOn(); });
  window.addEventListener('pointerup', function (e) {
    if (drag && drag.moved < 8 && e.target === el) clickScene(e);
    drag = null;
  });
  window.addEventListener('pointermove', function (e) {
    if (!drag || pinch) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved < 8) return;
    cam.yaw -= dx * 0.006;
    cam.pitch = clamp(cam.pitch + dy * 0.004, 0.45, 1.45);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  el.addEventListener('wheel', function (e) { e.preventDefault(); cam.dist = clamp(cam.dist + e.deltaY * 0.012, 8, 44); }, { passive: false });
  el.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  });
  el.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && pinch) {
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      cam.dist = clamp(cam.dist * pinch / d, 8, 44); pinch = d;
    }
  });
  el.addEventListener('touchend', function () { pinch = null; });
  window.addEventListener('keydown', function (e) { KEYS[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', function (e) { KEYS[e.key.toLowerCase()] = false; });
}

/* 탭 — 테이블 · 카운터 · 쏟아진 자리 · 바닥 */
function clickScene(e) {
  if (G.modal || G.phase !== 'open') return;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  var hits = raycaster.intersectObjects(pickables.concat(G.spills.map(function (s) { return s.mesh; })), false);
  for (var i = 0; i < hits.length; i++) {
    var o = hits[i].object, u = o.userData;
    if (!o.visible || (o.parent && o.parent.visible === false)) continue;
    if (u.spill) { goClean(u.spill); return; }
    if (u.table !== undefined) { goTable(u.table); return; }
    if (u.counter) { goCounter(); return; }
    if (u.floor) { var p = hits[i].point; playerGo(V(clamp(p.x, -12.3, 12.3), clamp(p.z, -5.4, 8.6))); return; }
  }
}

// ── 사람 ─────────────────────────────────────────────
function makePerson(color, vest, hat) {
  var g = new THREE.Group();
  var body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.9, 14), mat(color));
  body.position.y = 0.45; body.castShadow = true;
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), mat(0xe8c4a0));
  head.position.y = 1.07; head.castShadow = true;
  g.add(body, head);
  if (vest) {
    var v = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.27, 0.5, 14, 1, true), mat(vest));
    v.position.y = 0.62; g.add(v);
  }
  if (hat) {
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 32), mat(hat, { emissive: hat, emissiveIntensity: 0.6 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  }
  scene.add(g);
  return g;
}
var actorSeq = 0;
function makeActor(mesh, kind, name) { return { uid: ++actorSeq, mesh: mesh, kind: kind, name: name, path: null, bubble: null }; }

function walkTo(a, points, done, speed) {
  a.path = points.map(function (p) { return p.clone(); });
  a.onArrive = done || null;
  a.sitting = false;
  a.spd = speed || 2.6;
}
function stepActor(a, dt) {
  var m = a.mesh;
  var targetY = a.sitting ? -0.18 : 0;
  m.position.y += (targetY - m.position.y) * Math.min(1, dt * 8);
  if (!a.path || !a.path.length) return;
  var p = a.path[0];
  var dx = p.x - m.position.x, dz = p.z - m.position.z;
  var d = Math.hypot(dx, dz), sp = (a.spd || 2.6) * dt;
  if (d <= sp) {
    m.position.x = p.x; m.position.z = p.z;
    a.path.shift();
    if (!a.path.length && a.onArrive) { var f = a.onArrive; a.onArrive = null; f(); }
  } else {
    m.position.x += dx / d * sp; m.position.z += dz / d * sp;
    m.rotation.y = Math.atan2(dx, dz);
    m.position.y = Math.abs(Math.sin(G.simT * 14)) * 0.05;
  }
}
function faceTo(a, v) { a.mesh.rotation.y = Math.atan2(v.x - a.mesh.position.x, v.z - a.mesh.position.z); }
function say(a, text, secs) { if (a) a.bubble = { text: text, until: now() + (secs || 2.6) }; }

// ═══════════════════════════════════════════════════
// 게임 상태
// ═══════════════════════════════════════════════════
var G = {
  phase: 'title', simT: 0, speed: 1, paused: false, modal: null,
  day: 1, rep: 50, bank: START_BANK, owned: {},
  cfg: { fee: 30000, stack: 1, level: 1, price: 1, stock: 60, chipOk: null, assign: [0, 1, null, null], train: null },
  dealers: [], tables: [], customers: [], staff: null, counterStaff: null, cleaner: null, player: null,
  tasks: [], spills: [], queue: [], log: [], nameIx: 0,
  stats: null, nextArrival: 2, nextSpill: 30, winner: null, winnerAt: null, finalized: false,
  counterProg: 0, stock: 0, announced: {}, chipIssueAt: null, finalDone: false
};
window.__pub = G;   // 자동 점검용

function gameMin() { return OPEN_MIN + G.simT * (CLOSE_MIN - OPEN_MIN) / DAY_SEC; }
function levelMin() { return LEVEL_LEN[G.cfg.level]; }
function level() { return Math.min(BLINDS.length - 1, Math.floor((gameMin() - OPEN_MIN) / levelMin())); }
function regOpen() { return gameMin() < REG_CLOSE_MIN; }
function tableCount() { return G.owned.table3 ? 3 : 2; }
function dealerCount() { return G.owned.dealer4 ? 4 : 3; }

function log(t, c) {
  G.log.push({ t: '[' + clock(gameMin()) + '] ' + t, c: c || '' });
  if (G.log.length > 60) G.log.shift();
  renderTicker();
}
function toast(t) {
  var el = $('#toast');
  el.innerHTML = '<div class="toast">' + t + '</div>';
  clearTimeout(toast.h);
  toast.h = setTimeout(function () { el.innerHTML = ''; }, 2600);
}
function nextName() {
  for (var k = 0; k < NAMES.length; k++) {
    var nm = NAMES[G.nameIx++ % NAMES.length];
    if (!G.customers.some(function (c) { return c.alive && c.name === nm; })) return nm;
  }
  return NAMES[G.nameIx++ % NAMES.length] + '2';
}

// ── 효과 — 떠오르는 글자 · 칩 튐 · 꽃가루 ───────────
var FX = { floats: [], parts: [] };
function floatText(pos, text, cls) {
  FX.floats.push({ pos: pos.clone(), text: text, cls: cls || '', t0: now(), el: null });
}
function chipBurst(at, n) {
  var cols = [0xd9dedb, 0x2e6e52, 0xb23a2e, 0x2c4a7a];
  for (var i = 0; i < (n || 10); i++) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 10), mat(pick(cols)));
    m.position.set(at.x, 1, at.z);
    scene.add(m);
    FX.parts.push({ m: m, v: new THREE.Vector3((Math.random() - 0.5) * 3, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 3), life: 0.9, t: 0 });
  }
}
function confetti(at) {
  var cols = [0xEF9F27, 0xE5402F, 0x3B6FB6, 0x3E9B5F, 0xffffff, 0x7A4BB0];
  for (var i = 0; i < 90; i++) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.07), new THREE.MeshBasicMaterial({ color: pick(cols), side: THREE.DoubleSide }));
    m.position.set(at.x + (Math.random() - 0.5) * 3, 4 + Math.random() * 2, at.z + (Math.random() - 0.5) * 3);
    scene.add(m);
    FX.parts.push({ m: m, v: new THREE.Vector3((Math.random() - 0.5) * 1.2, -1 - Math.random(), (Math.random() - 0.5) * 1.2), life: 4, t: 0, spin: true });
  }
}
function stepFx(dt) {
  FX.parts = FX.parts.filter(function (p) {
    p.t += dt;
    if (!p.spin) p.v.y -= 9 * dt;
    p.m.position.addScaledVector(p.v, dt);
    if (p.spin) { p.m.rotation.x += dt * 6; p.m.rotation.y += dt * 4; }
    if (p.t > p.life || p.m.position.y < 0) { scene.remove(p.m); return false; }
    return true;
  });
}

// ═══════════════════════════════════════════════════
// 하루 시작
// ═══════════════════════════════════════════════════
function clearActors() {
  G.customers.forEach(function (c) { scene.remove(c.mesh); });
  G.dealers.forEach(function (d) { scene.remove(d.mesh); });
  [G.staff, G.counterStaff, G.cleaner, G.player].forEach(function (a) { if (a) scene.remove(a.mesh); });
  G.spills.forEach(function (s) { scene.remove(s.mesh); });
  FX.parts.forEach(function (p) { scene.remove(p.m); });
  FX.parts = []; FX.floats = [];
}

function newDay() {
  clearActors();
  G.customers = []; G.tasks = []; G.spills = []; G.queue = []; G.log = [];
  G.simT = 0; G.nextArrival = 2; G.nextSpill = 25 + Math.random() * 15; G.winner = null; G.winnerAt = null;
  G.finalized = false; G.speed = 1; G.paused = false; G.counterProg = 0; G.announced = {}; G.finalDone = false; G.lastAnnMin = OPEN_MIN;
  G.nameIx = rnd(NAMES.length);
  G.stock = G.cfg.stock;
  G.stats = {
    entries: 0, unique: 0, drinks: 0, noStock: 0, right: 0, wrong: 0, missed: 0, lost: 0, angry: 0,
    satSum: 0, satN: 0, repStart: G.rep, ann: 0, annMiss: 0, annWrong: 0, cleaned: 0, spillSec: 0,
    balanced: 0, balanceMiss: 0, queueLeave: 0
  };
  G.chipIssueAt = G.cfg.chipOk === false ? 60 + Math.random() * 120 : null;

  applyDecor();
  G.dealers = DEALERS.slice(0, dealerCount()).map(function (d, i) {
    var acc = G.dealerAcc && G.dealerAcc[i] !== undefined ? G.dealerAcc[i] : d.acc;
    var dl = makeActor(makePerson(0xf2f2f2, 0x1c1c1c), 'dealer', d.name);
    dl.id = i; dl.acc = acc; dl.speed = d.speed; dl.fatigue = 0; dl.table = null; dl.fresh = 0;
    dl.mesh.position.copy(SPOTS.dealerRest).add(V(i * 0.6 - 0.9, 0));
    return dl;
  });
  G.tables = TABLE_DEF.slice(0, tableCount()).map(function (t, i) {
    t.alarm.visible = false;
    t.cards.forEach(function (c) { c.visible = false; });
    return {
      id: i, def: t, name: t.name, seats: [null, null, null, null, null, null],
      dealer: null, handT: 0, pos: null, last: null, needsDraw: true, changed: false,
      call: null, hands: 0, broken: false, bustedLast: [], shortSince: null
    };
  });
  G.staff = makeActor(makePerson(0xE6B94A), 'staff', '홀 직원');
  G.staff.mesh.position.copy(SPOTS.staffHome); G.staff.busy = false; G.staff.cool = 3;
  G.counterStaff = null; G.cleaner = null;
  if (G.owned.counter) {
    G.counterStaff = makeActor(makePerson(0x9AA5B1, 0x2C4A7A), 'counter', '카운터 직원');
    G.counterStaff.mesh.position.set(8.2, 0, 1.5);
    G.counterStaff.mesh.rotation.y = 0;
  }
  if (G.owned.cleaner) {
    G.cleaner = makeActor(makePerson(0x6FA8A0), 'cleaner', '청소 직원');
    G.cleaner.mesh.position.copy(SPOTS.cleanerHome); G.cleaner.busy = false;
  }
  G.player = makeActor(makePerson(0x22304A, 0xD8B35A, 0xEF9F27), 'player', '점장');
  G.player.mesh.position.copy(SPOTS.playerHome);
  G.player.spd = 4.2;
}

// ═══════════════════════════════════════════════════
// 점장 — 직접 걷는다
// ═══════════════════════════════════════════════════
function playerGo(to, done, why) {
  var p = G.player;
  p.goal = why || null;
  walkTo(p, [to], function () { p.goal = null; if (done) done(); }, 4.2);
}
function playerNear(v, r) { return G.player && G.player.mesh.position.distanceTo(v) < (r || 1.4); }
function approachPoint(t) {
  // 테이블 가장자리에서 점장 쪽으로 가장 가까운 자리
  var p = G.player.mesh.position, c = V(t.def.cx, t.def.cz);
  var dir = p.clone().sub(c); dir.y = 0;
  if (dir.length() < 0.01) dir.set(0, 0, 1);
  dir.normalize();
  return V(c.x + dir.x * (RX + 1.25), c.z + dir.z * (RZ + 1.25));
}
function goTable(i) {
  var t = G.tables[i];
  if (!t) return;
  var task = G.tasks.filter(function (k) { return k.table === i && (k.kind === 'call' || k.kind === 'balance'); })[0];
  playerGo(approachPoint(t), function () {
    if (task && G.tasks.indexOf(task) >= 0) {
      if (task.kind === 'call') openCall(task);
      else doBalance(task);
    } else openTable(i);
  }, t.name + '(으)로');
}
function goCounter() { playerGo(V(8.1, 1.6), null, '카운터로'); }
G.goCounter = goCounter;   // 자동 점검용
function goClean(sp) {
  playerGo(sp.mesh.position.clone(), function () {
    if (G.spills.indexOf(sp) < 0) return;
    say(G.player, '🧽 닦는 중…', 1.2);
    sp.cleaning = G.simT + 1.2;
  }, '청소하러');
}
function stepPlayerKeys(dt) {
  var f = (KEYS.w || KEYS.arrowup ? 1 : 0) - (KEYS.s || KEYS.arrowdown ? 1 : 0);
  var r = (KEYS.d || KEYS.arrowright ? 1 : 0) - (KEYS.a || KEYS.arrowleft ? 1 : 0);
  if (!f && !r) return;
  var fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  var rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  var dx = fx * f + rx * r, dz = fz * f + rz * r, l = Math.hypot(dx, dz);
  var m = G.player.mesh;
  G.player.path = null; G.player.goal = null;
  m.position.x = clamp(m.position.x + dx / l * 4.2 * dt, -12.3, 12.3);
  m.position.z = clamp(m.position.z + dz / l * 4.2 * dt, -5.4, 8.6);
  m.rotation.y = Math.atan2(dx, dz);
}

// ═══════════════════════════════════════════════════
// 손님 — 문 → 등록 줄 → 바 대기 → 착석 → 탈락
// ═══════════════════════════════════════════════════
function pickType() {
  var r = Math.random(), acc = 0, k;
  for (k in CUST_TYPES) { acc += CUST_TYPES[k].w; if (r < acc) return k; }
  return 'rookie';
}
function barOccupants() { return G.customers.filter(function (c) { return c.alive && c.barSpot !== null && c.barSpot !== undefined; }); }
function freeBarSpot() {
  var used = barOccupants().map(function (c) { return c.barSpot; });
  for (var i = 0; i < barCap(); i++) if (used.indexOf(i) < 0) return i;
  return -1;
}

function spawnCustomer() {
  var type = pickType();
  var c = makeActor(makePerson(CUST_TYPES[type].color), 'cust', nextName());
  c.id = G.customers.length; c.type = type; c.alive = true; c.state = 'arrive';
  c.sat = 70 + (STACKS[G.cfg.stack].sat * 50); c.table = null; c.seat = null; c.barSpot = null;
  c.entries = 0; c.lastDrink = -99; c.leaveAt = 0; c.nextTalk = G.simT + 8 + Math.random() * 20;
  c.mesh.position.copy(SPOTS.outside);
  G.customers.push(c);
  joinQueue(c);
}
function joinQueue(c) {
  if (G.queue.length >= QUEUE.length) {
    G.stats.lost++;
    leave(c, '등록 줄이 너무 길다');
    say(c, '줄이 왜 이렇게 길어…', 2.5);
    return;
  }
  G.queue.push(c);
  c.state = 'queue';
  walkTo(c, [SPOTS.door, QUEUE[G.queue.length - 1]]);
}
function advanceQueue() {
  G.queue.forEach(function (c, i) { if (c.state === 'queue') walkTo(c, [QUEUE[i]]); });
}

/* 카운터 — 점장이 서 있거나 카운터 직원이 있으면 빠르다 */
function tickCounter(dt) {
  if (!G.queue.length) { G.counterProg = 0; return; }
  var head = G.queue[0];
  if (head.mesh.position.distanceTo(QUEUE[0]) > 0.3) return;
  var manned = playerNear(V(8.2, 1.7), 1.6) || G.counterStaff;
  G.counterProg += dt * (manned ? 1 : 0.28);
  G.queue.forEach(function (c, i) { if (i > 1) c.sat = clamp(c.sat - 0.25 * dt, 0, 100); });
  if (G.queue.length >= 4 && chance(dt * 0.15)) say(pick(G.queue.slice(2)), '등록 왜 이렇게 느려요', 2.5);
  if (G.counterProg >= 3.2) {
    G.counterProg = 0;
    G.queue.shift();
    advanceQueue();
    register(head);
  }
}

function register(c) {
  if (!regOpen()) { say(c, '마감이에요? 한잔만 하고 갈게요', 2.5); toBar(c, 'drink'); return; }
  c.entries++;
  G.stats.entries++;
  if (c.entries === 1) G.stats.unique++;
  G.dayRevenue += G.cfg.fee;
  floatText(V(8.2, 2.4).setY(1.8), '+' + won(G.cfg.fee), 'money');
  SFX.cash();
  log(c.name + '(' + CUST_TYPES[c.type].ko + ') ' + (c.entries > 1 ? '리엔트리' : '등록') + ' — 참가비 ' + won(G.cfg.fee));
  toBar(c, 'wait');
}

function toBar(c, why) {
  var spot = freeBarSpot();
  if (spot < 0) { leave(c, '바가 꽉 찼다'); return; }
  c.barSpot = spot;
  c.state = why === 'wait' ? 'to-bar-wait' : 'to-bar-drink';
  walkTo(c, [BAR_ALL[spot]], function () {
    c.state = why === 'wait' ? 'bar-wait' : 'bar-drink';
    c.sitting = true;
    faceTo(c, V(BAR_ALL[spot].x, -8));
    if (why !== 'wait') c.leaveAt = G.simT + 18 + Math.random() * 25;
  });
}

function leave(c, why) {
  if (c.state === 'leaving') return;
  var qi = G.queue.indexOf(c);
  if (qi >= 0) { G.queue.splice(qi, 1); advanceQueue(); }
  c.barSpot = null; c.table = null; c.seat = null;
  c.state = 'leaving';
  G.stats.satSum += c.sat; G.stats.satN++;
  walkTo(c, [SPOTS.door, SPOTS.outside], function () { c.alive = false; scene.remove(c.mesh); });
  if (why) log(c.name + ' 퇴장 — ' + why, /화|지쳐|길다/.test(why) ? 'bad' : '');
}

/* 자리 배정 — 다음 핸드의 버튼부터 다음 BB 직전까지는 피한다 (원문 확인 전 규칙을 만들지 않으려고) */
function safeSeats(t) {
  var empties = [], i;
  for (i = 0; i < N; i++) if (t.seats[i] === null) empties.push(i);
  if (!t.pos) return empties;
  var avoid = [];
  for (var k = 0; k < N; k++) {
    var j = (t.pos.sbSeat + k) % N;
    if (k > 0 && t.seats[j] !== null && j !== t.pos.bb) break;
    avoid.push(j);
  }
  return empties.filter(function (s) { return avoid.indexOf(s) < 0; });
}
function seated(t) { return t.seats.filter(function (x) { return x !== null; }).length; }
function liveTables() { return G.tables.filter(function (t) { return !t.broken && t.dealer !== null; }); }

function seatCustomer(c, t, s) {
  t.seats[s] = c.id;
  t.changed = true;
  c.table = t.id; c.seat = s; c.barSpot = null; c.state = 'to-seat';
  walkTo(c, [seatPos(t.def, s)], function () {
    c.state = 'seated'; c.sitting = true;
    faceTo(c, V(t.def.cx, t.def.cz));
  });
}
function seatWaiting() {
  G.customers.filter(function (c) { return c.alive && c.state === 'bar-wait'; }).forEach(function (c) {
    var open = liveTables().filter(function (t) { return !t.call && safeSeats(t).length; });
    if (!open.length) return;
    open.sort(function (a, b) { return seated(a) - seated(b); });
    var t = open[0];
    seatCustomer(c, t, pick(safeSeats(t)));
    log(c.name + ' 착석 — ' + t.name);
  });
}

function bust(t, s) {
  var c = G.customers[t.seats[s]];
  t.seats[s] = null;
  t.changed = true;
  c.table = null; c.seat = null;
  var feeK = G.cfg.fee >= 50000 ? 0.6 : (G.cfg.fee <= 20000 ? 1.2 : 1);
  say(c, pick(['아… 탈락', '오늘은 여기까지', '그걸 맞네…', '리엔트리 각이다']), 2.4);
  if (regOpen() && chance(CUST_TYPES[c.type].reentry * feeK)) {
    c.state = 'to-queue';
    log(c.name + ' 탈락 — 리엔트리하러 간다');
    joinQueue(c);
  } else {
    log(c.name + ' 탈락 (' + t.name + ')');
    toBar(c, 'drink');
  }
}

// ═══════════════════════════════════════════════════
// 테이블 진행
// ═══════════════════════════════════════════════════
function occ(t, i) { return t.seats[i] !== null; }
function nextOcc(t, from) {
  for (var k = 1; k <= N; k++) { var i = (from + k) % N; if (occ(t, i)) return i; }
  return -1;
}

/* 버튼 · 블라인드의 정답 — 이 함수 하나가 낸다.
   토너먼트 데드 버튼: BB 는 반드시 다음 사람에게 한 칸, SB 는 지난 BB 자리(탈락이면 없음),
   버튼은 지난 SB 자리(비었으면 빈 자리에) */
function positionsFor(t) {
  if (t.needsDraw || !t.last) {
    var b = nextOcc(t, rnd(N)), s = nextOcc(t, b);
    return { btn: b, sbSeat: s, sbLive: true, bb: nextOcc(t, s), draw: true };
  }
  var bb = nextOcc(t, t.last.bb);
  var p = { btn: t.last.sbSeat, sbSeat: t.last.bb, sbLive: occ(t, t.last.bb), bb: bb, draw: false };
  if (bb === p.sbSeat || bb === p.btn || bb < 0) {
    var nb = nextOcc(t, t.last.btn), ns = nextOcc(t, nb);
    return { btn: nb, sbSeat: ns, sbLive: true, bb: nextOcc(t, ns), draw: true };
  }
  return p;
}

function effAcc(d) { return clamp(d.acc - d.fatigue * 1.1, 15, 99); }
function handSpeed(d) {
  return d.speed * (1 - d.fatigue / 100) * (d.fresh > G.simT ? 1.18 : 1) * (G.owned.shuffler ? 1.1 : 1);
}

function tickTable(t, dt) {
  var d = t.dealer !== null ? G.dealers[t.dealer] : null;
  var n = seated(t);
  t.def.cards.forEach(function (cg, i) { cg.visible = !!(t.pos && occ(t, i) && n >= 2 && !t.broken); });
  t.def.alarm.visible = !!t.call;
  if (t.call) t.def.alarm.position.y = 2.9 + Math.sin(G.simT * 5) * 0.15;
  if (t.call || !d || t.broken) return;
  if (n < 2) { t.pos = null; t.needsDraw = true; t.handT = 0; return; }
  if (!t.pos) startHand(t);
  t.handT += dt * handSpeed(d);
  if (t.handT >= 8) endHand(t);
}

function endHand(t) {
  t.hands++;
  t.handT = 0;
  var lv = level(), p = Math.min(0.14, 0.025 + lv * 0.007) * STACKS[G.cfg.stack].bust * (regOpen() ? 1 : 2.6);   // 마감 뒤엔 결판을 향해 빨라진다
  var occs = [];
  for (var i = 0; i < N; i++) if (occ(t, i)) occs.push(i);
  var busted = [];
  occs.forEach(function (s) { if (busted.length < occs.length - 1 && chance(p)) busted.push(s); });
  t.bustedLast = busted.map(function (s) { return { seat: s, name: G.customers[t.seats[s]].name }; });
  if (busted.length) { chipBurst(V(t.def.cx, t.def.cz), 12); SFX.chips(); }
  else if (chance(0.25) && occs.length) {
    var w = G.customers[t.seats[pick(occs)]];
    say(w, pick(['나이스!', '팟 가져갑니다~', '이게 되네 ㅋㅋ', '굿 폴드였다…']), 2);
    chipBurst(V(t.def.cx, t.def.cz), 5);
  }
  busted.forEach(function (s) { bust(t, s); });
  startHand(t);
}

function startHand(t) {
  if (seated(t) < 2) { t.pos = null; t.needsDraw = true; return; }
  var prev = t.last;
  var pos = positionsFor(t);
  var changed = t.changed;
  t.pos = pos; t.last = { btn: pos.btn, sbSeat: pos.sbSeat, bb: pos.bb };
  t.needsDraw = false; t.changed = false;
  var d = G.dealers[t.dealer];
  var miss = 1 - effAcc(d) / 100;
  if (changed && !pos.draw && prev && seated(t) >= 4 && chance(0.1 + miss * 1.0)) {
    createCall(t, 'pos', { prev: prev, pos: pos, busted: t.bustedLast.slice(), snap: snapSeats(t) });
    return;
  }
  if (chance(0.06 + miss * 0.4)) {
    var type = pick(['btn', 'cnt', 'under', 'under']);
    if (type === 'btn' && seated(t) < 4) type = 'cnt';
    createCall(t, type, genIncident(t, type));
  }
}
function snapSeats(t) { return t.seats.map(function (id) { return id === null ? null : G.customers[id].name; }); }

function preflopOrder(t) {
  var o = [], s = t.pos.bb;
  for (var k = 0; k < N; k++) { s = nextOcc(t, s); if (s === t.pos.bb || o.indexOf(s) >= 0) break; o.push(s); }
  return o;
}
function isSA(acts) {
  var chips = acts.filter(function (a) { return a.kind !== 'fold' && a.kind !== 'check'; }).length;
  return acts.length >= 3 || (acts.length >= 2 && chips >= 1);
}
function genIncident(t, type) {
  var lv = BLINDS[level()];
  var order = preflopOrder(t);
  if (type === 'under') {
    var minRaise = lv[1], cur = lv[1];
    var street = pick(['프리플랍', '플랍', '턴']);
    if (street !== '프리플랍') { cur = lv[1] * pick([2, 3, 4]); minRaise = cur; }
    var seat = pick(order);
    return { street: street, cur: cur, minTo: cur + minRaise, to: cur + Math.max(100, Math.floor(minRaise / 200) * 100),
      who: G.customers[t.seats[seat]].name, seat: seat, late: chance(0.5) };
  }
  var k = pick([0, 1, 2, 2, 3, 3]), acts = [];
  for (var i = 0; i < Math.min(k, order.length); i++) {
    var r = Math.random();
    acts.push({ seat: order[i], name: G.customers[t.seats[order[i]]].name, kind: r < 0.45 ? 'fold' : (r < 0.85 ? 'call' : 'raise') });
  }
  var data = { acts: acts, sa: isSA(acts) };
  if (type === 'btn') data.shouldBe = t.pos.btn;
  if (type === 'cnt') { var s2 = pick(order); data.seat = s2; data.who = G.customers[t.seats[s2]].name; data.n = chance(0.5) ? 1 : 3; }
  return data;
}

// ═══════════════════════════════════════════════════
// 할 일 — 호출 · 아나운스 · 밸런싱 · 청소
// ═══════════════════════════════════════════════════
var taskSeq = 0;
function addTask(task) {
  task.id = ++taskSeq; task.t0 = G.simT;
  G.tasks.push(task);
  renderTasks();
  return task;
}
function removeTask(task) { G.tasks = G.tasks.filter(function (x) { return x !== task; }); renderTasks(); }

function createCall(t, type, data) {
  var task = addTask({ kind: 'call', table: t.id, type: type, data: data, limit: CALL_LIMIT });
  t.call = task;
  var d = G.dealers[t.dealer];
  say(d, '플로어! ✋', 3);
  log(t.name + ' — 플로어 호출', 'bad');
  SFX.call();
}

function resolveCall(task, result) {
  var t = G.tables[task.table];
  t.call = null;
  removeTask(task);
  var cs = t.seats.filter(function (x) { return x !== null; }).map(function (id) { return G.customers[id]; });
  var at = V(t.def.cx, t.def.cz).setY(2.2);
  if (result === 'right') {
    G.stats.right++; G.rep = clamp(G.rep + 1.5, 0, 100);
    cs.forEach(function (c) { c.sat = clamp(c.sat + 8, 0, 100); });
    if (cs.length) say(pick(cs), pick(['깔끔하네요 👍', '역시 점장님', '오케이 인정']), 2.4);
    floatText(at, '평판 +1.5', 'good');
    SFX.good();
  } else if (result === 'wrong') {
    G.stats.wrong++; G.rep = clamp(G.rep - 3, 0, 100);
    cs.forEach(function (c) { c.sat = clamp(c.sat - 15, 0, 100); });
    floatText(at, '평판 −3', 'bad');
    SFX.bad();
    var angry = cs.filter(function (c) { return c.type === 'rude'; })[0] || cs.slice().sort(function (a, b) { return a.sat - b.sat; })[0];
    if (angry) say(angry, pick(['이게 말이 돼요?! 😡', '룰도 몰라요?', '아 진짜…']), 3);
    if (angry && cs.length > 2 && chance(angry.type === 'rude' ? 0.85 : 0.4)) {
      t.seats[angry.seat] = null; t.changed = true;
      G.stats.angry++;
      leave(angry, '판정에 화가 나서');
    }
    cs.filter(function (c) { return c !== angry; }).slice(0, 1).forEach(function (c) { say(c, '…😒', 2); });
  } else {
    G.stats.missed++; G.rep = clamp(G.rep - 3, 0, 100);
    cs.forEach(function (c) { c.sat = clamp(c.sat - 12, 0, 100); });
    floatText(at, '평판 −3', 'bad');
    if (cs.length) say(pick(cs), '플로어 안 와요?! 😤', 3);
    log(t.name + ' — 아무도 오지 않아 딜러가 알아서 처리했다', 'bad');
    SFX.bad();
  }
  if (task.misdeal) t.handT = 0;
}

/* 아나운스 — 블라인드 업 · 레지 마감 30분 전 · 레지 마감 · 파이널 테이블 */
function checkAnnouncements() {
  var lv = level();
  if (lv > 0 && !G.announced['lv' + lv]) {
    G.announced['lv' + lv] = true;
    /* 마이크는 45분에 한 번쯤 — 그 사이 레벨업은 딜러가 테이블에서 알린다 */
    if (gameMin() - (G.lastAnnMin || OPEN_MIN) >= 45) {
      G.lastAnnMin = gameMin();
      addTask({ kind: 'announce', type: 'level', lv: lv, limit: ANNOUNCE_LIMIT });
      SFX.call();
    } else {
      var b = BLINDS[lv];
      liveTables().forEach(function (t) { say(G.dealers[t.dealer], '레벨 ' + (lv + 1) + ' — ' + won(b[0]) + '/' + won(b[1]), 2.4); });
    }
  }
  if (gameMin() >= REG_CLOSE_MIN - 30 && !G.announced.regwarn) {
    G.announced.regwarn = true;
    addTask({ kind: 'announce', type: 'regwarn', limit: ANNOUNCE_LIMIT });
  }
  if (!regOpen() && !G.announced.regclose) {
    G.announced.regclose = true;
    addTask({ kind: 'announce', type: 'regclose', limit: ANNOUNCE_LIMIT + 10 });
    toast('23:00 — 레지 마감. 아나운스하세요');
  }
}

function annMissed(task) {
  removeTask(task);
  G.stats.annMiss++;
  G.rep = clamp(G.rep - 1.5, 0, 100);
  var c = pick(G.customers.filter(function (x) { return x.alive && x.state === 'seated'; }));
  if (c) say(c, task.type === 'level' ? '지금 블라인드 몇이에요?' : '마감 언제예요?', 3);
  log('아나운스를 놓쳤다', 'bad');
}

/* 밸런싱 — 테이블 인원이 두 명 이상 차이 나면 */
function checkBalance() {
  var lts = liveTables().filter(function (t) { return seated(t) > 0; });
  if (lts.length < 2 || G.tasks.some(function (k) { return k.kind === 'balance'; })) return;
  lts.sort(function (a, b) { return seated(b) - seated(a); });
  var big = lts[0], small = lts[lts.length - 1];
  if (seated(big) - seated(small) >= 2 && !big.call && safeSeats(small).length) {
    var waitingBar = G.customers.some(function (c) { return c.alive && (c.state === 'bar-wait' || c.state === 'queue'); });
    if (regOpen() && waitingBar) return;   // 곧 손님이 채운다
    addTask({ kind: 'balance', table: big.id, to: small.id, limit: BALANCE_LIMIT });
    small.shortSince = G.simT;
  }
}
function doBalance(task) {
  var big = G.tables[task.table], small = G.tables[task.to];
  removeTask(task);
  if (seated(big) - seated(small) < 2 || !safeSeats(small).length) { toast('이미 맞춰졌다'); return; }
  var occs = []; for (var i = 0; i < N; i++) if (occ(big, i)) occs.push(i);
  var s = pick(occs), c = G.customers[big.seats[s]];
  big.seats[s] = null; big.changed = true;
  seatCustomer(c, small, pick(safeSeats(small)));
  say(c, '자리 옮길게요~', 2);
  G.stats.balanced++;
  G.rep = clamp(G.rep + 0.5, 0, 100);
  floatText(V(small.def.cx, small.def.cz).setY(2.2), '밸런싱 ✓', 'good');
  log('밸런싱 — ' + c.name + ' : ' + big.name + ' → ' + small.name, 'hi');
  SFX.good();
}

/* 청소 — 음료가 쏟아진다 */
function spawnSpill() {
  var cands = G.customers.filter(function (c) { return c.alive && (c.state === 'seated' || c.state === 'bar-wait' || c.state === 'bar-drink'); });
  if (cands.length < 3) return;
  var c = pick(cands);
  var p = c.mesh.position.clone().add(V((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2 + 0.4));
  var m = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshStandardMaterial({ color: 0x8a5a1a, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.03, p.z); m.scale.set(1, 1.4, 1);
  scene.add(m);
  var sp = { mesh: m, t0: G.simT, cleaning: null };
  m.userData.spill = sp;
  G.spills.push(sp);
  say(c, '앗 엎질렀다 😅', 2.4);
  addTask({ kind: 'spill', spill: sp, limit: 0 });
  log('음료가 쏟아졌다 — 닦아야 한다', 'bad');
}
function tickSpills(dt) {
  G.spills.slice().forEach(function (sp) {
    G.stats.spillSec += dt;
    G.customers.forEach(function (c) {
      if (c.alive && c.mesh.position.distanceTo(sp.mesh.position) < 2.6) {
        c.sat = clamp(c.sat - 0.5 * dt * (G.owned.interior ? 0.7 : 1), 0, 100);
        if (chance(dt * 0.04)) say(c, '바닥이 끈적해…', 2);
      }
    });
    if (sp.cleaning !== null && G.simT >= sp.cleaning) finishSpill(sp, true);
  });
  // 청소 직원
  var cl = G.cleaner;
  if (cl && !cl.busy) {
    var target = G.spills.filter(function (s) { return s.cleaning === null && G.simT - s.t0 > 6; })[0];
    if (target) {
      cl.busy = true;
      walkTo(cl, [target.mesh.position.clone()], function () {
        if (G.spills.indexOf(target) >= 0) { target.cleaning = G.simT + 1.5; say(cl, '🧹', 1.5); }
        setTimeout(function () { walkTo(cl, [SPOTS.cleanerHome], function () { cl.busy = false; }); }, 50);
      });
    }
  }
}
function finishSpill(sp, byPlayer) {
  scene.remove(sp.mesh);
  G.spills = G.spills.filter(function (x) { return x !== sp; });
  G.tasks.filter(function (k) { return k.spill === sp; }).forEach(removeTask);
  G.stats.cleaned++;
  floatText(sp.mesh.position.clone().setY(1.2), '반짝 ✨', 'good');
}

// ── 테이블 재편 · 우승 ───────────────────────────────
function checkBreak() {
  if (regOpen() || G.winner) return;
  var live = liveTables().filter(function (t) { return seated(t) > 0; });
  var waiting = G.customers.some(function (c) { return c.alive && /^(queue|to-queue|bar-wait|to-bar-wait|to-seat)$/.test(c.state); });
  if (live.length >= 2 && !waiting && !live.some(function (t) { return t.call; })) {
    var total = live.reduce(function (s, t) { return s + seated(t); }, 0);
    var cap = (live.length - 1) * N;
    if (total <= cap) {
      live.sort(function (a, b) { return seated(a) - seated(b); });
      var src = live[0], dsts = live.slice(1);
      src.seats.forEach(function (id, s) {
        if (id === null) return;
        var dst = dsts.filter(function (t) { return seated(t) < N; }).sort(function (a, b) { return seated(a) - seated(b); })[0];
        var free = []; for (var i = 0; i < N; i++) if (dst.seats[i] === null) free.push(i);
        var c = G.customers[id];
        src.seats[s] = null;
        dst.seats[pick(free)] = id;
        var ns = dst.seats.indexOf(id);
        c.table = dst.id; c.seat = ns; c.state = 'to-seat';
        walkTo(c, [seatPos(dst.def, ns)], function () { c.state = 'seated'; c.sitting = true; faceTo(c, V(dst.def.cx, dst.def.cz)); });
        dst.needsDraw = true; dst.pos = null; dst.changed = false;
      });
      src.broken = true; src.pos = null;
      G.tasks.filter(function (k) { return k.table === src.id || k.to === src.id; }).forEach(removeTask);
      var dl = G.dealers[src.dealer];
      src.dealer = null; dl.table = null;
      walkTo(dl, [SPOTS.dealerRest]);
      log('테이블 재편 — ' + src.name + '을 깨고 합친다. 버튼은 다시 추첨', 'hi');
      toast('테이블 재편 — ' + src.name + ' 닫음');
      if (liveTables().filter(function (t) { return seated(t) > 0; }).length === 1 && !G.finalDone) {
        G.finalDone = true;
        var ft = liveTables().filter(function (t) { return seated(t) > 0; })[0];
        addTask({ kind: 'announce', type: 'final', n: seated(ft), limit: ANNOUNCE_LIMIT });
      }
    }
  }
  var alive = G.customers.filter(function (c) { return c.alive && c.table !== null; });
  var pending = G.customers.some(function (c) { return c.alive && /queue|bar-wait|to-bar-wait/.test(c.state); });
  if (alive.length === 1 && !pending && G.stats.entries > 1) {
    G.winner = alive[0];
    var t = G.tables[G.winner.table];
    log('우승 — ' + G.winner.name + '! 트로피와 다음 대회 시드권 (환전 없음)', 'good');
    toast('🏆 우승 ' + G.winner.name);
    say(G.winner, '우승이다!! 🏆', 5);
    confetti(V(t.def.cx, t.def.cz));
    SFX.win();
    t.seats[G.winner.seat] = null; t.pos = null;
    G.winner.table = null; G.winner.seat = null;
    toBar(G.winner, 'drink');
  }
}

// ── 홀 직원 · 음료 ────────────────────────────────────
function tickStaff(dt) {
  var s = G.staff;
  if (s.busy) return;
  s.cool -= dt;
  if (s.cool > 0) return;
  var cands = G.customers.filter(function (c) {
    return c.alive && (c.state === 'seated' || c.state === 'bar-wait' || c.state === 'bar-drink') && G.simT - c.lastDrink > 40;
  });
  if (!cands.length) { s.cool = 2; return; }
  var c = pick(cands);
  s.busy = true;
  walkTo(s, [c.mesh.position.clone().add(V(0.5, 0.5))], function () {
    var buyP = (0.55 * CUST_TYPES[c.type].drink + 0.2) * PRICES[G.cfg.price].k * (G.owned.coffee ? 1.2 : 1);
    if (c.alive && chance(buyP)) {
      if (G.stock <= 0) {
        G.stats.noStock++;
        c.sat = clamp(c.sat - 5, 0, 100);
        say(c, '음료 다 떨어졌어요? 😑', 2.4);
        c.lastDrink = G.simT - 20;
      } else {
        G.stock--;
        G.dayRevenue += PRICES[G.cfg.price].p; G.stats.drinks++; c.lastDrink = G.simT; c.sat = clamp(c.sat + 3, 0, 100);
        floatText(c.mesh.position.clone().setY(1.7), '+' + won(PRICES[G.cfg.price].p), 'money');
        say(c, pick(['🍺 감사합니다', '🥤 땡큐', '☕ 굿']), 1.6);
        if (G.stock === 5) toast('음료 재고 5개 남음');
      }
    } else if (c.alive) c.lastDrink = G.simT - 20;
    walkTo(s, [SPOTS.staffHome], function () { s.busy = false; s.cool = 1.5; });
  });
}

// ── 딜러 ────────────────────────────────────────────
function tickDealers(dt) {
  G.dealers.forEach(function (d) {
    stepActor(d, dt);
    if (d.table !== null) {
      d.fatigue = clamp(d.fatigue + dt / 7 * (G.owned.shuffler ? 0.65 : 1), 0, 45);
      if (d.fatigue > 25 && chance(dt * 0.05)) {
        say(d, pick(['😓 손이 무거워요', '😵 집중이 안 돼…', '교대 언제예요…']), 2.4);
        var t = G.tables[d.table], cs = t.seats.filter(function (x) { return x !== null; });
        if (cs.length && chance(0.5)) say(G.customers[pick(cs)], '딜러님 너무 느려요', 2.2);
      }
    } else d.fatigue = clamp(d.fatigue - dt / 3.5, 0, 45);
  });
}
function swapDealer(t, incoming) {
  var out = G.dealers[t.dealer];
  out.table = null;
  walkTo(out, [SPOTS.dealerRest]);
  say(out, '쉬다 올게요 🙏', 2);
  incoming.table = t.id; t.dealer = incoming.id;
  incoming.fresh = G.simT + 45;
  walkTo(incoming, [dealerPos(t.def)], function () { faceTo(incoming, V(t.def.cx, t.def.cz)); say(incoming, '교대했습니다! 💪', 2.2); });
  floatText(V(t.def.cx, t.def.cz).setY(2.2), '교대 — 45초 속도 UP', 'good');
  log(t.name + ' 딜러 교대 — ' + out.name + ' → ' + incoming.name, 'hi');
}

// ── 손님 수다 ────────────────────────────────────────
function tickTalk() {
  G.customers.forEach(function (c) {
    if (!c.alive || G.simT < c.nextTalk || c.state === 'leaving') return;
    c.nextTalk = G.simT + 14 + Math.random() * 26;
    if (c.state === 'bar-wait' && c.sat < 50) say(c, '자리 언제 나요?', 2.4);
    else if (c.sat < 35) say(c, pick(['여기 별로네…', '😒', '서비스가 왜 이래']), 2.4);
    else if (c.sat > 85) say(c, pick(['여기 최고 👍', '😄', '다음에 또 와야지']), 2.4);
    else if (chance(0.6)) say(c, pick(CUST_TYPES[c.type].talk), 2.6);
  });
}

// ═══════════════════════════════════════════════════
// 루프
// ═══════════════════════════════════════════════════
var lastTs = 0;
function frame(ts) {
  var real = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  if (G.phase === 'open' && !G.modal && !G.paused) {
    var steps = G.speed > 4 ? Math.ceil(G.speed / 4) : 1;
    for (var k = 0; k < steps; k++) simulate(real * G.speed / steps);
  }
  if (G.phase === 'open' && !G.modal) stepFx(real);
  updateCamera(real);
  renderer.render(scene, camera);
  renderOverlay();
  if (G.phase === 'open') renderHud();
  requestAnimationFrame(frame);
}

function simulate(dt) {
  G.simT += dt;
  if (regOpen()) {
    G.nextArrival -= dt;
    if (G.nextArrival <= 0) {
      spawnCustomer();
      var feeK = G.cfg.fee === 20000 ? 0.75 : (G.cfg.fee === 50000 ? 1.6 : 1);
      var repK = clamp(1.6 - G.rep / 100, 0.55, 1.4) * (G.owned.interior ? 0.87 : 1);
      G.nextArrival = (5 + Math.random() * 6) * feeK * repK * (tableCount() === 3 ? 0.78 : 1);
    }
  }
  stepPlayerKeys(dt);
  stepActor(G.player, dt);
  G.customers.forEach(function (c) {
    if (!c.alive) return;
    stepActor(c, dt);
    var decay = G.owned.interior ? 0.7 : 1;
    if (c.state === 'bar-wait') c.sat = clamp(c.sat - 0.3 * dt * decay, 0, 100);
    if (c.state === 'seated' && G.tables[c.table] && G.tables[c.table].call) c.sat = clamp(c.sat - 1.2 * dt * decay, 0, 100);
    if (c.state === 'bar-drink' && G.simT > c.leaveAt) leave(c);
    if (c.state === 'bar-wait' && c.sat < 15) { say(c, '그냥 갈래요 😤', 2.4); leave(c, '자리를 기다리다 지쳐서'); }
    if (c.state === 'queue' && c.sat < 12) { G.stats.queueLeave++; leave(c, '등록 줄에서 지쳐서'); }
  });
  tickDealers(dt);
  stepActor(G.staff, dt);
  if (G.counterStaff) stepActor(G.counterStaff, dt);
  if (G.cleaner) stepActor(G.cleaner, dt);
  tickStaff(dt);
  tickCounter(dt);
  seatWaiting();
  G.tables.forEach(function (t) { tickTable(t, dt); });
  tickSpills(dt);
  tickTalk();
  G.nextSpill -= dt;
  if (G.nextSpill <= 0) { spawnSpill(); G.nextSpill = 22 + Math.random() * 22; }
  if (G.chipIssueAt !== null && G.simT > G.chipIssueAt) {
    G.chipIssueAt = null;
    G.rep = clamp(G.rep - 2, 0, 100);
    var c = pick(G.customers.filter(function (x) { return x.alive && x.state === 'seated'; }));
    if (c) say(c, '칩이 스타팅보다 모자라요!', 3);
    toast('칩 세팅 오류 — 스타팅 스택이 틀렸다는 항의. 평판 −2');
    log('칩 세팅 오류가 드러났다', 'bad');
  }
  checkAnnouncements();
  checkBalance();
  // 제한 시간
  G.tasks.slice().forEach(function (k) {
    if (!k.limit || G.simT - k.t0 <= k.limit) return;
    if (k.kind === 'call') resolveCall(k, 'missed');
    else if (k.kind === 'announce') annMissed(k);
    else if (k.kind === 'balance') {
      removeTask(k); G.stats.balanceMiss++; G.rep = clamp(G.rep - 1, 0, 100);
      var sm = G.tables[k.to];
      sm.seats.filter(function (x) { return x !== null; }).forEach(function (id) { G.customers[id].sat = clamp(G.customers[id].sat - 6, 0, 100); });
      log('밸런싱을 놓쳤다 — ' + sm.name + ' 손님들이 숏핸드로 불만', 'bad');
    }
  });
  checkBreak();
  if (G.winner && !G.winnerAt) G.winnerAt = G.simT;
  if (gameMin() >= CLOSE_MIN || (G.winnerAt && G.simT - G.winnerAt > 8)) closeDay();
}

// ═══════════════════════════════════════════════════
// 화면 — HUD · 할 일 목록 · 말풍선 · 라벨
// ═══════════════════════════════════════════════════
function renderHud() {
  var hud = $('#hud');
  if (!hud._built) {
    hud.innerHTML = '<span class="title">홀덤펍 점장</span>' +
      '<span class="kv"><b data-h="clock"></b></span>' +
      '<span class="kv">오늘 매출 <b data-h="money"></b></span>' +
      '<span class="kv">평판 <span class="rep"><i data-h="repbar"></i></span> <b data-h="rep"></b></span>' +
      '<span class="kv">손님 <b data-h="guests"></b></span>' +
      '<span class="kv m-hide">음료 재고 <b data-h="stock"></b></span>' +
      '<span class="kv m-hide" data-h="reg"></span>' +
      '<span class="sp"></span>' +
      '<button class="hbtn" data-follow="1" title="점장 따라가기">📍</button>' +
      '<button class="hbtn" data-mute="1" title="소리">🔊</button>' +
      '<button class="hbtn" data-pause="1">❚❚</button>' +
      [1, 2, 4].map(function (s) { return '<button class="hbtn" data-speed="' + s + '">' + s + '×</button>'; }).join('');
    hud.querySelectorAll('[data-speed]').forEach(function (b) { b.onclick = function () { G.speed = +b.getAttribute('data-speed'); G.paused = false; }; });
    hud.querySelector('[data-pause]').onclick = function () { G.paused = !G.paused; };
    hud.querySelector('[data-follow]').onclick = function () { cam.follow = !cam.follow; if (cam.follow) cam.dist = Math.min(cam.dist, 16); else fitCamera(); };
    hud.querySelector('[data-mute]').onclick = function () { MUTED = !MUTED; };
    hud._built = true;
  }
  var lv = BLINDS[level()];
  var set = function (k, v) { var el = hud.querySelector('[data-h="' + k + '"]'); if (el.textContent !== v) el.textContent = v; };
  set('clock', clock(gameMin()));
  set('money', won(G.dayRevenue));
  set('rep', String(Math.round(G.rep)));
  set('guests', String(G.customers.filter(function (c) { return c.alive && c.state !== 'leaving'; }).length));
  set('stock', String(G.stock));
  set('reg', regOpen() ? '등록 중' : '등록 마감');
  hud.querySelector('[data-h="repbar"]').style.width = G.rep + '%';
  hud.querySelectorAll('[data-speed]').forEach(function (b) { b.classList.toggle('on', G.speed === +b.getAttribute('data-speed') && !G.paused); });
  hud.querySelector('[data-pause]').classList.toggle('on', G.paused);
  hud.querySelector('[data-follow]').classList.toggle('on', cam.follow);
  hud.querySelector('[data-mute]').textContent = MUTED ? '🔇' : '🔊';
  renderTasks();
}

var TASK_TXT = {
  call: function (k) { return { t: '플로어! — ' + G.tables[k.table].name, d: { pos: '버튼 · 블라인드 이의', btn: '버튼 위치 오류', cnt: '카드 장수 이상', under: '레이즈 금액 이의' }[k.type], ic: '🚨' }; },
  announce: function (k) { return { t: '아나운스', d: { level: '블라인드 레벨 업', regwarn: '레지 마감 30분 전', regclose: '레지 마감', final: '파이널 테이블' }[k.type], ic: '📢' }; },
  balance: function (k) { return { t: '밸런싱 — ' + G.tables[k.table].name, d: G.tables[k.table].name + ' → ' + G.tables[k.to].name + ' 한 명', ic: '⚖️' }; },
  spill: function () { return { t: '청소', d: '음료가 쏟아졌다', ic: '🧽' }; }
};
function renderTasks() {
  var el = $('#calls');
  // 바뀐 항목만 넣고 뺀다 — 누르려던 버튼이 다시 그려지며 사라지지 않게
  var ids = {};
  G.tasks.forEach(function (k) { ids[k.id] = true; });
  Array.prototype.slice.call(el.children).forEach(function (b) { if (!ids[b.getAttribute('data-task')]) b.remove(); });
  G.tasks.forEach(function (k) {
    if (el.querySelector('[data-task="' + k.id + '"]')) return;
    var x = TASK_TXT[k.kind](k);
    var b = document.createElement('button');
    b.className = 'call ' + k.kind;
    b.setAttribute('data-task', k.id);
    b.innerHTML = '<div class="t">' + x.ic + ' ' + x.t + '</div><div class="d">' + x.d + '</div>' + (k.limit ? '<div class="bar"><i></i></div>' : '');
    b.onclick = function () { audioOn(); doTask(k.id); };
    el.appendChild(b);
  });
  G.tasks.forEach(function (k) {
    var b = el.querySelector('[data-task="' + k.id + '"] .bar i');
    if (b) b.style.width = Math.max(0, (1 - (G.simT - k.t0) / k.limit) * 100) + '%';
  });
}
function doTask(id) {
  var k = G.tasks.filter(function (x) { return x.id === id; })[0];
  if (!k) return;
  if (k.kind === 'announce') openAnnounce(k);
  else if (k.kind === 'spill') goClean(k.spill);
  else goTable(k.table);
}

function renderTicker() {
  $('#ticker').innerHTML = G.log.slice(-6).map(function (l) { return '<div class="' + l.c + '">' + l.t + '</div>'; }).join('');
}

/* 3D 위에 띄우는 것 — 테이블 라벨 · 딜러 피로 막대 · 말풍선 · 떠오르는 글자 */
var OV = { tables: [], dealers: {}, bubbles: {}, floats: [] };
function project(v) {
  var p = v.clone().project(camera);
  return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight, vis: p.z < 1 };
}
function renderOverlay() {
  var host = $('#labels');
  if (G.phase !== 'open') { if (host.childNodes.length) { host.innerHTML = ''; OV = { tables: [], dealers: {}, bubbles: {}, floats: [] }; } return; }
  // 테이블 라벨
  G.tables.forEach(function (t, i) {
    var el = OV.tables[i];
    if (!el) { el = document.createElement('div'); el.className = 'tlabel'; el.onclick = function () { audioOn(); goTable(i); }; host.appendChild(el); OV.tables[i] = el; }
    var p = project(V(t.def.cx, t.def.cz).setY(t.call ? 3.6 : 2.0));
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    var txt = t.broken ? t.name + '<small>재편으로 닫힘</small>' :
      (t.call ? '🚨 플로어! — ' + t.name : t.name + '<small>' + seated(t) + '명</small>');
    if (el._t !== txt) { el.innerHTML = txt; el._t = txt; }
    el.className = 'tlabel' + (t.call ? ' alert' : '');
  });
  // 딜러 피로 막대
  G.dealers.forEach(function (d) {
    var el = OV.dealers[d.uid];
    if (!el) { el = document.createElement('div'); el.className = 'dbar'; el.innerHTML = '<span></span><i><b></b></i>'; host.appendChild(el); OV.dealers[d.uid] = el; }
    var p = project(d.mesh.position.clone().setY(1.55));
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    var f = d.fatigue / 45;
    el.querySelector('span').textContent = d.name + (d.fresh > G.simT ? ' ⚡' : '');
    var bar = el.querySelector('b');
    bar.style.width = Math.round(f * 100) + '%';
    bar.style.background = f > 0.66 ? 'var(--red)' : (f > 0.4 ? 'var(--amber)' : 'var(--ok)');
  });
  // 말풍선
  var actors = G.customers.concat(G.dealers, [G.staff, G.player, G.counterStaff, G.cleaner]).filter(Boolean);
  var t = now(), seen = {};
  actors.forEach(function (a) {
    if (!a.bubble || a.bubble.until < t || (a.alive === false)) return;
    seen[a.uid] = true;
    var el = OV.bubbles[a.uid];
    if (!el) { el = document.createElement('div'); el.className = 'bubble'; host.appendChild(el); OV.bubbles[a.uid] = el; }
    if (el._t !== a.bubble.text) { el.textContent = a.bubble.text; el._t = a.bubble.text; }
    var p = project(a.mesh.position.clone().setY(1.75));
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    el.classList.toggle('me', a.kind === 'player');
  });
  Object.keys(OV.bubbles).forEach(function (k) { if (!seen[k]) { OV.bubbles[k].remove(); delete OV.bubbles[k]; } });
  // 떠오르는 글자
  FX.floats = FX.floats.filter(function (f) {
    var age = t - f.t0;
    if (!f.el) { f.el = document.createElement('div'); f.el.className = 'float ' + f.cls; f.el.textContent = f.text; host.appendChild(f.el); }
    if (age > 1.6) { f.el.remove(); return false; }
    var p = project(f.pos.clone().setY(f.pos.y + age * 0.8));
    f.el.style.left = p.x + 'px'; f.el.style.top = p.y + 'px';
    f.el.style.opacity = String(1 - age / 1.6);
    return true;
  });
  // 점장 목적지
  var pm = $('#goal');
  if (G.player && G.player.goal) { pm.textContent = '👟 ' + G.player.goal; pm.style.display = 'block'; } else pm.style.display = 'none';
}

function showModal(html, wide) {
  G.modal = true;
  $('#modal').innerHTML = '<div class="modal-bg"><div class="modal' + (wide ? ' wide' : '') + '">' + html + '</div></div>';
}
function closeModal() { G.modal = null; $('#modal').innerHTML = ''; }

// ── 테이블 정보 · 딜러 교대 ──────────────────────────
function openTable(i) {
  var t = G.tables[i];
  if (t.broken) { toast(t.name + '은 재편으로 닫혔다'); return; }
  var d = t.dealer !== null ? G.dealers[t.dealer] : null;
  var rest = G.dealers.filter(function (x) { return x.table === null; });
  var names = t.seats.map(function (id, s) {
    if (id === null) return seatNo(s) + ' —';
    var c = G.customers[id];
    var face = c.sat > 75 ? '😄' : (c.sat > 45 ? '🙂' : (c.sat > 25 ? '😐' : '😠'));
    return seatNo(s) + ' ' + c.name + ' (' + CUST_TYPES[c.type].ko + ') ' + face;
  });
  var h = '<div class="kicker">' + t.name + '</div><h2>' + (d ? '딜러 ' + d.name : '딜러 없음') + '</h2>' +
    (d ? '<p>정확도 ' + Math.round(d.acc) + ' · 피로 ' + Math.round(d.fatigue) + '/45 → 실제 정확도 <b>' + Math.round(effAcc(d)) + '</b> · 진행 속도 <b>' + Math.round(handSpeed(d) * 100) + '%</b>' +
      (d.fresh > G.simT ? ' ⚡교대 직후' : '') + '. 피로가 쌓이면 실수가 늘어 호출이 잦아지고 핸드가 느려진다.</p>' : '') +
    '<div class="acts">' + names.join('<br>') + '</div>';
  if (d && rest.length) {
    h += '<h3>교대</h3><div class="choices">' + rest.map(function (r) {
      return '<button class="choice" data-swap="' + r.id + '">' + r.name + '와 교대 — 정확도 ' + Math.round(r.acc) + ' · 피로 ' + Math.round(r.fatigue) + '</button>';
    }).join('') + '</div>';
  }
  h += '<button class="cta ghost" data-close="1">닫기</button>';
  showModal(h);
  document.querySelectorAll('[data-swap]').forEach(function (b) {
    b.onclick = function () { swapDealer(t, G.dealers[+b.getAttribute('data-swap')]); closeModal(); };
  });
  $('[data-close]').onclick = closeModal;
}

// ── 플로어 호출 ─────────────────────────────────────
var KIND_KO = { fold: '폴드', call: '콜', raise: '레이즈', check: '체크' };
function actsHTML(acts) {
  if (!acts.length) return '<div class="acts">블라인드만 들어갔다 — 아직 아무도 액션하지 않았다</div>';
  return '<div class="acts">블라인드 뒤 프리플랍 액션<ol>' + acts.map(function (a) { return '<li>' + a.name + ' — ' + KIND_KO[a.kind] + '</li>'; }).join('') + '</ol></div>';
}

function openCall(task) {
  if (!task || G.tasks.indexOf(task) < 0) return;
  G.current = task;   // 자동 점검용
  var t = G.tables[task.table], d = task.data;
  var head = '<div class="kicker red">플로어 호출 — ' + t.name + '</div>';
  if (task.type === 'pos') { openPosCall(task); return; }
  var title, body, choices, correct, why, cite;
  if (task.type === 'btn') {
    title = '버튼이 잘못 놓였다';
    body = '<p>손님: "버튼이 한 칸 지나쳤어요. 원래 ' + seatNo(d.shouldBe) + ' 차례예요." 확인해 보니 맞다.</p>' + actsHTML(d.acts);
    choices = ['미스딜 — 블라인드를 돌려주고 버튼을 바로잡아 다시 딜한다', '이 핸드는 그대로 진행하고, 다음 핸드부터 바른 자리로 돌린다', '버튼만 바른 자리로 옮기고 이 핸드를 이어 간다'];
    correct = d.sa ? 1 : 0;
    why = (d.sa ? '실질 액션이 이미 성립했다. 실질 액션 뒤에는 버튼 오류로 판을 되돌리지 않는다 — 그대로 가고 다음 핸드에 바로잡는다.'
      : '실질 액션 전이다. 버튼 오류는 바로잡는다 — 미스딜로 거두고 바른 위치에서 다시 딜한다.') + ' 판 도중에 버튼만 옮기는 처리는 없다.';
    cite = SRC.btn + '<br>' + SRC.sa;
    task.misdeal = !d.sa;
  } else if (task.type === 'cnt') {
    title = '카드 장수가 이상하다';
    body = '<p>딜러: "' + d.who + '(' + seatNo(d.seat) + ') 손님 카드가 <b>' + d.n + '장</b>입니다."</p>' + actsHTML(d.acts);
    choices = ['미스딜을 선언하고 다시 딜한다', d.who + '의 핸드만 데드로 걷고 핸드를 계속한다', '카드 장수를 맞춰 주고 핸드를 계속한다'];
    correct = d.sa ? 1 : 0;
    why = d.sa ? '실질 액션이 성립해 미스딜을 선언할 수 없다. 장수가 틀린 좌석만 데드로 처리하고 계속한다. 이미 낸 칩은 팟에 남고, 다음 스트릿 번 카드는 평소처럼 한 장.'
      : '실질 액션 전이다. 카드 장수 오류는 미스딜 사유다 — 거두고 다시 딜한다.';
    cite = SRC.cnt + '<br>' + SRC.sa;
    task.misdeal = !d.sa;
  } else {
    title = '레이즈 금액이 모자란다';
    body = d.late
      ? '<p>손님이 뒤늦게 말한다: "아까 ' + d.street + '에서 ' + d.who + ' 레이즈가 ' + won(d.to) + '였는데, 최소 ' + won(d.minTo) + ' 아니었어요?" — 맞는 말이다. <b>이미 다음 카드가 깔렸다.</b></p>'
      : '<p>' + d.who + josa(d.who, '이', '가') + ' ' + d.street + '에서 "레이즈"라고 말하고 <b>' + won(d.to) + '</b>까지 냈다. 최소 레이즈는 ' + won(d.minTo) + '다. 다음 손님이 바로 지적했다 — <b>아직 같은 스트릿이다.</b></p>';
    choices = ['최소 레이즈 금액까지 채우게 한다', '그대로 둔다 — 정정하지 않는다', '레이즈를 무르고 콜로 바꾼다'];
    correct = d.late ? 1 : 0;
    why = d.late ? '최소 레이즈 미달은 다음 스트릿이 딜되기 전까지만 정정한다. 카드가 이미 깔렸으면 그 액션은 그대로 선다.'
      : '레이즈를 선언했으니 레이즈는 구속된다. 다음 스트릿 전에 발견됐으므로 최소 레이즈 금액까지 채운다.';
    cite = SRC.under;
  }
  task.correct = correct;
  showModal(head + '<h2>' + title + '</h2>' + body + '<div class="choices">' +
    choices.map(function (ch, i) { return '<button class="choice" data-ch="' + i + '">' + ch + '</button>'; }).join('') + '</div>');
  document.querySelectorAll('[data-ch]').forEach(function (b) {
    b.onclick = function () { var ix = +b.getAttribute('data-ch'); verdict(task, ix === correct, why, cite, choices, correct, ix); };
  });
}

function verdict(task, ok, why, cite, choices, correct, pickIx, extra) {
  var t = G.tables[task.table];
  var h = '<div class="kicker">' + t.name + ' — 판정</div><div class="verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ 깔끔한 판정' : '✗ 틀린 판정 — 테이블이 술렁인다') + '</div>';
  if (choices) {
    h += '<div class="choices" style="margin-bottom:10px">' + choices.map(function (ch, i) {
      return '<div class="choice' + (i === correct ? ' right' : (i === pickIx ? ' wrong' : '')) + '">' + ch + '</div>';
    }).join('') + '</div>';
  }
  if (extra) h += '<p>' + extra + '</p>';
  h += '<p>' + why + '</p><div class="cite"><b>근거</b> ' + cite + '<span class="unverified">원문 확인 전</span></div>' +
    '<button class="cta" data-ok="1">테이블로 돌아간다</button>';
  showModal(h);
  $('[data-ok]').onclick = function () {
    closeModal();
    if (G.tasks.indexOf(task) >= 0) resolveCall(task, ok ? 'right' : 'wrong');
  };
}

var MSEAT = [[30, 92], [6, 62], [12, 18], [50, 4], [88, 18], [94, 62]];
function openPosCall(task) {
  var t = G.tables[task.table], d = task.data;
  var st = { step: 0, btn: null, sb: null, bb: null };
  var keys = ['btn', 'sb', 'bb'], labels = ['버튼', '스몰 블라인드', '빅 블라인드'];
  function draw() {
    var mm = '<div class="minimap"><div class="felt"></div><div class="mdealer">딜러</div>';
    for (var i = 0; i < N; i++) {
      var nm = d.snap[i];
      var b = d.busted.filter(function (x) { return x.seat === i; })[0];
      var tag = [];
      if (d.prev.btn === i) tag.push('D');
      if (d.prev.sbSeat === i) tag.push('SB');
      if (d.prev.bb === i) tag.push('BB');
      var cls = 'mseat' + (nm ? '' : (b ? ' busted' : ' empty'));
      if (st.btn === i || st.sb === i || st.bb === i) cls += ' picked';
      mm += '<div class="' + cls + '" data-ms="' + i + '" style="left:' + MSEAT[i][0] + '%;top:' + MSEAT[i][1] + '%">' +
        '<span class="tg">' + seatNo(i) + '</span><b>' + (nm || (b ? b.name + ' 탈락' : '빈 자리')) + '</b>' +
        '<span class="tg">' + (tag.length ? '지난 핸드 ' + tag.join('·') : '&nbsp;') + '</span></div>';
    }
    mm += '</div>';
    var picks = '<div class="picks">' + keys.map(function (k, ix) {
      var v = st[k];
      return '<span class="' + (ix === st.step ? 'now' : '') + '">' + labels[ix] + ' ' + (v === null ? '—' : (v === -1 ? '없음' : seatNo(v))) + '</span>';
    }).join('') + '</div>';
    showModal('<div class="kicker red">플로어 호출 — ' + t.name + '</div><h2>버튼과 블라인드가 맞나요?</h2>' +
      '<p>손님: "방금 사람이 빠졌는데 블라인드가 이상해요." 지난 핸드 표시와 탈락을 보고 이번 핸드의 버튼 · SB · BB 를 직접 놓으세요. 빈 자리도 누를 수 있다.</p>' +
      mm + picks +
      (st.step === 1 ? '<button class="cta ghost" data-nosb="1">스몰 블라인드 없음</button> ' : '') +
      (st.step > 0 ? '<button class="cta ghost" data-undo="1">다시 고르기</button> ' : '') +
      '<button class="cta" data-confirm="1"' + (st.step < 3 ? ' disabled' : '') + '>확정</button>', true);
    document.querySelectorAll('[data-ms]').forEach(function (el) {
      el.onclick = function () { if (st.step < 3) { st[keys[st.step]] = +el.getAttribute('data-ms'); st.step++; draw(); } };
    });
    var ns = $('[data-nosb]'); if (ns) ns.onclick = function () { st.sb = -1; st.step = 2; draw(); };
    var ud = $('[data-undo]'); if (ud) ud.onclick = function () { st = { step: 0, btn: null, sb: null, bb: null }; draw(); };
    $('[data-confirm]').onclick = function () { if (st.step >= 3) grade(); };
  }
  function grade() {
    var p = d.pos, want = { btn: p.btn, sb: p.sbLive ? p.sbSeat : -1, bb: p.bb };
    var ok = st.btn === want.btn && st.sb === want.sb && st.bb === want.bb;
    var nm = function (i) { return d.snap[i] ? d.snap[i] + '(' + seatNo(i) + ')' : seatNo(i) + ' 빈 자리'; };
    var why = '빅 블라인드는 매 핸드 반드시 다음 사람에게 한 칸 간다 — 지난 BB ' + seatNo(d.prev.bb) + ' 다음 사람은 ' + nm(p.bb) + '. ' +
      '스몰 블라인드는 지난 BB 자리(' + seatNo(p.sbSeat) + ')' + (p.sbLive ? '다.' : '인데 그 사람이 탈락했다 — <b>이번 핸드는 스몰 블라인드가 없다</b>(데드 스몰).') + ' ' +
      '버튼은 지난 SB 자리(' + seatNo(p.btn) + ')' + (d.snap[p.btn] ? '다.' : '인데 비어 있다 — <b>빈 자리에 버튼을 둔다</b>(데드 버튼).') +
      ' 그래야 아무도 빅 블라인드를 건너뛰지 않는다.';
    var mine = '내 답 — 버튼 ' + seatNo(st.btn) + ' · SB ' + (st.sb >= 0 ? seatNo(st.sb) : '없음') + ' · BB ' + seatNo(st.bb) +
      ' / 정답 — 버튼 ' + seatNo(want.btn) + ' · SB ' + (want.sb >= 0 ? seatNo(want.sb) : '없음') + ' · BB ' + seatNo(want.bb);
    verdict(task, ok, why, SRC.dead, null, null, null, mine);
  }
  draw();
}

// ── 아나운스 ────────────────────────────────────────
function openAnnounce(task) {
  if (G.tasks.indexOf(task) < 0) return;
  G.current = task;
  var choices, correct, title, why, extra = '';
  if (task.type === 'level') {
    var cur = BLINDS[task.lv], prev = BLINDS[task.lv - 1], nxt = BLINDS[Math.min(BLINDS.length - 1, task.lv + 1)];
    title = '블라인드가 오른다';
    var from = Math.max(0, task.lv - 2), rows = '';
    for (var r = from; r < Math.min(BLINDS.length, task.lv + 3); r++) {
      rows += '<tr><td>레벨 ' + (r + 1) + '</td><td>' + clock(OPEN_MIN + r * levelMin()) + '</td><td>' + won(BLINDS[r][0]) + ' / ' + won(BLINDS[r][1]) + '</td></tr>';
    }
    extra = '<p>지금 시각 <b>' + clock(gameMin()) + '</b>. 블라인드 시계를 보고 지금 레벨을 부른다.</p>' +
      '<table class="rows struct"><tr><td><b>레벨</b></td><td><b>시작</b></td><td><b>블라인드</b></td></tr>' + rows + '</table>';
    var opts = [
      '레벨 ' + (task.lv + 1) + ' 시작합니다 — 블라인드 ' + won(cur[0]) + ' / ' + won(cur[1]),
      '레벨 ' + task.lv + ' 이어 갑니다 — 블라인드 ' + won(prev[0]) + ' / ' + won(prev[1]),
      '레벨 ' + (task.lv + 2) + ' 시작합니다 — 블라인드 ' + won(nxt[0]) + ' / ' + won(nxt[1])
    ];
    choices = shuffle(opts.slice()); correct = choices.indexOf(opts[0]);
    why = '지금 막 레벨 ' + (task.lv + 1) + '이 시작됐다. 블라인드는 ' + won(cur[0]) + ' / ' + won(cur[1]) + '. 한 칸 앞서거나 뒤처진 숫자를 부르면 손님이 틀린 금액으로 베팅한다.';
  } else if (task.type === 'regwarn') {
    title = '레지 마감 30분 전';
    var o2 = ['30분 뒤 23:00에 등록과 리엔트리를 마감합니다', '지금 등록과 리엔트리를 마감합니다', '자정에 등록과 리엔트리를 마감합니다'];
    choices = shuffle(o2.slice()); correct = choices.indexOf(o2[0]);
    why = '오늘 구조의 레지 마감은 23:00 이다. 30분 전에 미리 알리면 탈락한 손님이 리엔트리를 결정할 시간을 갖는다.';
  } else if (task.type === 'regclose') {
    var E = G.stats.entries, S = STACKS[G.cfg.stack].chips, U = G.stats.unique;
    var remaining = G.customers.filter(function (c) { return c.alive && c.table !== null; }).length || 1;
    title = '레지 마감 — 총 칩을 알린다';
    extra = '<p>오늘 엔트리 <b>' + E + '</b>건 (처음 온 사람 ' + U + '명 + 리엔트리 ' + (E - U) + '건) · 스타팅 스택 <b>' + won(S) + '</b> · 남은 사람 ' + remaining + '명</p>';
    var right = E * S, w1 = U * S, w2 = remaining * S;
    var vals = [right, w1 === right ? right + S : w1, w2 === right || w2 === w1 ? right + 2 * S : w2];
    var o3 = vals.map(function (v) { return '레지 마감합니다 — 총 칩 ' + won(v) + ', 평균 스택 ' + won(Math.round(v / remaining / 100) * 100); });
    choices = shuffle(o3.slice()); correct = choices.indexOf(o3[0]);
    why = '총 칩은 <b>엔트리 수 × 스타팅 스택</b>이다 — 리엔트리도 새 스택을 받으므로 센다. ' + E + ' × ' + won(S) + ' = ' + won(right) +
      '. 평균 스택은 총 칩 ÷ 남은 사람 = ' + won(Math.round(right / remaining / 100) * 100) + '.';
  } else {
    title = '파이널 테이블';
    var n = task.n;
    var o4 = ['파이널 테이블입니다 — 남은 ' + n + '명', '파이널 테이블입니다 — 남은 ' + (n + 1) + '명', '파이널 테이블입니다 — 남은 ' + Math.max(2, n - 1) + '명'];
    choices = shuffle(o4.slice()); correct = choices.indexOf(o4[0]);
    why = '테이블이 하나로 합쳐졌고 남은 사람은 ' + n + '명이다.';
  }
  task.correct = correct;
  showModal('<div class="kicker">📢 아나운스</div><h2>' + title + '</h2>' + extra +
    '<p>마이크로 무엇이라고 말할까?</p><div class="choices">' +
    choices.map(function (c, i) { return '<button class="choice" data-an="' + i + '">“' + c + '”</button>'; }).join('') + '</div>');
  document.querySelectorAll('[data-an]').forEach(function (b) {
    b.onclick = function () {
      var ix = +b.getAttribute('data-an'), ok = ix === correct;
      removeTask(task);
      G.stats.ann++;
      if (ok) { G.rep = clamp(G.rep + 0.7, 0, 100); SFX.mic(); } else { G.stats.annWrong++; G.rep = clamp(G.rep - 1.5, 0, 100); SFX.bad(); }
      showModal('<div class="kicker">📢 아나운스</div><div class="verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ 또렷한 안내' : '✗ 틀린 안내 — 손님들이 웅성거린다') + '</div>' +
        '<div class="choices" style="margin-bottom:10px">' + choices.map(function (c, i) {
          return '<div class="choice' + (i === correct ? ' right' : (i === ix ? ' wrong' : '')) + '">“' + c + '”</div>';
        }).join('') + '</div><p>' + why + '</p><button class="cta" data-ok="1">마이크를 내려놓는다</button>');
      $('[data-ok]').onclick = function () {
        closeModal();
        say(G.player, ok ? '📢 ' + choices[correct].slice(0, 18) + '…' : '📢 어… 정정하겠습니다', 2.5);
        var c = pick(G.customers.filter(function (x) { return x.alive && x.state === 'seated'; }));
        if (c) say(c, ok ? '네~ 👌' : '뭐라고요?', 2);
      };
    };
  });
}

// ═══════════════════════════════════════════════════
// 오픈 준비 — 상점 · 칩 구조 · 음료 · 딜러
// ═══════════════════════════════════════════════════
function titleScreen() {
  G.phase = 'title';
  showModal('<div class="kicker">프로토타입 2판</div><h2>홀덤펍 점장</h2>' +
    '<p>오늘 밤 데일리 토너먼트를 연다. 당신은 점장이다 — <b>직접 걸어 다닌다.</b> 바닥을 탭하면 그곳으로 가고, 키보드는 WASD.</p>' +
    '<p>카운터에 서 있으면 등록이 빨라진다. 테이블에서 플로어를 부르면 걸어가야 판정할 수 있다(30초). 음료가 쏟아지면 닦고, 테이블 인원이 어긋나면 맞추고, 블라인드가 오르면 마이크를 잡는다. 23:00 레지 마감에는 총 칩을 알린다.</p>' +
    '<p class="note">매출은 참가비와 음료뿐이다. 우승 상품은 트로피와 다음 대회 시드권 — 칩 환전과 현금 시상은 없다. 판정 정답은 딜러마스터 TDA 케이스 문서를 따르며 원문 대조 전이다.</p>' +
    '<button class="cta" data-go="1">오픈 준비</button>');
  $('[data-go]').onclick = function () { audioOn(); prepScreen('shop'); };
}

function prepScreen(tab) {
  G.phase = 'prep';
  G.prepTab = tab || G.prepTab || 'shop';
  var cfg = G.cfg;
  var tabs = [['shop', '상점'], ['chips', '칩 · 구조'], ['drinks', '음료'], ['dealers', '딜러']];
  var h = '<div class="kicker">' + G.day + '일차 · 17:30 · 오픈 준비</div><h2>오늘 밤을 준비한다</h2>' +
    '<div class="bankline">자금 <b>' + won(G.bank) + '원</b> · 평판 <b>' + Math.round(G.rep) + '</b></div>' +
    '<div class="tabs">' + tabs.map(function (x) { return '<button data-tab="' + x[0] + '" class="' + (G.prepTab === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>';

  if (G.prepTab === 'shop') {
    h += '<div class="shop">' + SHOP.map(function (it) {
      var own = !!G.owned[it.id];
      var locked = it.id === 'table3' && false;
      var label = own ? (it.wage ? '고용 중 — 해고' : '보유') : (it.price ? won(it.price) + '원' : '고용');
      var dis = (!own && it.price > G.bank) || (own && !it.wage) || locked;
      return '<div class="item' + (own ? ' own' : '') + '"><div><b>' + it.ko + '</b><div class="note">' + it.desc + '</div></div>' +
        '<button class="cta' + (own ? ' ghost' : '') + '" data-buy="' + it.id + '"' + (dis ? ' disabled' : '') + '>' + label + '</button></div>';
    }).join('') + '</div>';
    if (G.owned.table3 && !G.owned.dealer4) h += '<p class="warn">3번 테이블을 돌리려면 딜러가 넷 필요하다 — 하윤을 고용하세요. 아니면 휴식 딜러 없이 셋이 다 나간다.</p>';
  } else if (G.prepTab === 'chips') {
    h += '<h3>스타팅 스택</h3><div class="seg">' + STACKS.map(function (s, i) {
      return '<button data-stack="' + i + '" class="' + (cfg.stack === i ? 'on' : '') + '">' + s.ko + '<br><small>' + (i === 0 ? '빨리 끝남 · 만족 ↓' : (i === 2 ? '오래 감 · 만족 ↑' : '보통')) + '</small></button>';
    }).join('') + '</div>' +
      '<h3>레벨 시간</h3><div class="seg">' + LEVEL_LEN.map(function (m, i) {
        return '<button data-lvl="' + i + '" class="' + (cfg.level === i ? 'on' : '') + '">' + m + '분</button>';
      }).join('') + '</div>' +
      '<h3>참가비</h3><div class="seg">' + FEES.map(function (f) {
        var hint = f === 20000 ? '손님 ↑ · 객단가 ↓' : (f === 30000 ? '보통' : '손님 ↓ · 리엔트리 ↓');
        return '<button data-fee="' + f + '" class="' + (cfg.fee === f ? 'on' : '') + '">' + won(f) + '원<br><small>' + hint + '</small></button>';
      }).join('') + '</div>' +
      '<h3>칩 세팅</h3><p class="note">테이블마다 스타팅 칩 세트를 깐다. 세트 구성이 틀리면 영업 중에 항의가 터진다.</p>' +
      (cfg.chipOk === null ? '<button class="cta" data-chipq="1">칩 세트 확인하기</button>' :
        '<p><b>' + (cfg.chipOk ? '✓ 칩 세팅 완료' : '✗ 칩 세팅 오류 — 영업 중 항의가 생길 수 있다') + '</b></p>');
  } else if (G.prepTab === 'drinks') {
    h += '<h3>음료 가격</h3><div class="seg">' + PRICES.map(function (p, i) {
      return '<button data-price="' + i + '" class="' + (cfg.price === i ? 'on' : '') + '">' + won(p.p) + '원<br><small>' + (i === 0 ? '많이 팔림' : (i === 2 ? '덜 팔림' : '보통')) + '</small></button>';
    }).join('') + '</div>' +
      '<h3>재고 입고 (개당 ' + won(STOCK_COST) + '원, 오늘 밤만)</h3><div class="seg">' + STOCK_OPTS.map(function (s) {
        return '<button data-stock="' + s + '" class="' + (cfg.stock === s ? 'on' : '') + '">' + s + '개<br><small>' + won(s * STOCK_COST) + '원</small></button>';
      }).join('') + '</div>' +
      '<p class="note">재고가 떨어지면 손님이 음료를 못 사고 실망한다. 남은 재고는 마감 때 버린다.' + (G.owned.coffee ? ' 커피 머신 덕에 구매율 +20%.' : '') + '</p>';
  } else {
    var tn = tableCount();
    h += '<div class="grid3">' + G.dealerList().map(function (d, i) {
      var a = cfg.assign.indexOf(i);
      var segs = [];
      for (var k = 0; k < tn; k++) segs.push('<button data-as="' + i + ':' + k + '" class="' + (cfg.assign[k] === i ? 'on' : '') + '">' + (k + 1) + '번</button>');
      segs.push('<button data-as="' + i + ':r" class="' + (a < 0 || a >= tn ? 'on' : '') + '">휴식</button>');
      return '<div class="card"><div class="nm">딜러 ' + d.name + '</div><div class="st">정확도 ' + Math.round(d.acc) + '<br>속도 ' + Math.round(d.speed * 100) + '</div><div class="seg">' + segs.join('') + '</div>' +
        '<button class="cta ghost" style="width:100%;margin-top:8px;padding:6px" data-train="' + i + '"' + (cfg.train !== null ? ' disabled' : '') + '>' + (cfg.train === i ? '교육 완료 ✓' : '교육 — 실질 액션 3문제') + '</button></div>';
    }).join('') + '</div><p class="note">휴식 딜러가 있어야 영업 중에 교대할 수 있다. 교대 직후 45초 동안 진행 속도가 오른다. 교육은 하루 한 명 — 맞힌 만큼 정확도 +4.</p>';
  }
  var ready = cfg.assign.slice(0, tableCount()).every(function (x) { return x !== null && x !== undefined; });
  var stockCost = cfg.stock * STOCK_COST;
  h += '<div class="prepfoot"><span class="note">영업 시작 시 재고 ' + won(stockCost) + '원이 나간다' + (ready ? '' : ' · <b>모든 테이블에 딜러를 배치하세요</b>') + '</span>' +
    '<button class="cta" data-open="1"' + (ready ? '' : ' disabled') + '>영업 시작 — 18:00</button></div>';
  showModal(h, true);

  document.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { prepScreen(b.getAttribute('data-tab')); }; });
  document.querySelectorAll('[data-buy]').forEach(function (b) { b.onclick = function () { buy(b.getAttribute('data-buy')); }; });
  document.querySelectorAll('[data-stack]').forEach(function (b) { b.onclick = function () { cfg.stack = +b.getAttribute('data-stack'); cfg.chipOk = null; prepScreen(); }; });
  document.querySelectorAll('[data-lvl]').forEach(function (b) { b.onclick = function () { cfg.level = +b.getAttribute('data-lvl'); prepScreen(); }; });
  document.querySelectorAll('[data-fee]').forEach(function (b) { b.onclick = function () { cfg.fee = +b.getAttribute('data-fee'); prepScreen(); }; });
  document.querySelectorAll('[data-price]').forEach(function (b) { b.onclick = function () { cfg.price = +b.getAttribute('data-price'); prepScreen(); }; });
  document.querySelectorAll('[data-stock]').forEach(function (b) { b.onclick = function () { cfg.stock = +b.getAttribute('data-stock'); prepScreen(); }; });
  var cq = $('[data-chipq]'); if (cq) cq.onclick = chipQuiz;
  document.querySelectorAll('[data-as]').forEach(function (b) {
    b.onclick = function () {
      var p = b.getAttribute('data-as').split(':'), i = +p[0];
      var was = cfg.assign.indexOf(i); if (was >= 0) cfg.assign[was] = null;
      if (p[1] !== 'r') cfg.assign[+p[1]] = i;
      prepScreen();
    };
  });
  document.querySelectorAll('[data-train]').forEach(function (b) { b.onclick = function () { if (cfg.train === null) trainDealer(+b.getAttribute('data-train')); }; });
  $('[data-open]').onclick = function () { if (ready) openDay(); };
}
G.dealerList = function () {
  return DEALERS.slice(0, dealerCount()).map(function (d, i) {
    return { name: d.name, speed: d.speed, acc: G.dealerAcc && G.dealerAcc[i] !== undefined ? G.dealerAcc[i] : d.acc };
  });
};

function buy(id) {
  var it = SHOP.filter(function (x) { return x.id === id; })[0];
  if (G.owned[id]) {
    if (it.wage) { delete G.owned[id]; if (id === 'dealer4') G.cfg.assign = G.cfg.assign.map(function (x) { return x === 3 ? null : x; }); toast(it.ko + ' — 해고'); }
  } else if (G.bank >= it.price) {
    G.bank -= it.price; G.owned[id] = true;
    toast(it.ko + (it.wage ? ' — 고용' : ' — 구매 완료'));
    SFX.cash();
  }
  applyDecor();
  prepScreen();
}

/* 칩 세팅 — 스타팅 스택 칩 세트 구성 확인 */
function chipQuiz() {
  var S = STACKS[G.cfg.stack].chips;
  var a = Math.floor(S / 2 / 5000), r = S - a * 5000;
  var b = Math.floor(r * 0.6 / 1000), r2 = r - b * 1000;
  var c = Math.floor(r2 * 0.75 / 500), d = (r2 - c * 500) / 100;
  var fmt = function (d1, c1, b1, a1) { return '100 × ' + d1 + ' · 500 × ' + c1 + ' · 1,000 × ' + b1 + ' · 5,000 × ' + a1; };
  var opts = [fmt(d, c, b, a), fmt(d, c + 2, b, a), fmt(d + 5, c, b - 1, a)];
  var sums = [S, S + 1000, S - 500];
  var order = shuffle([0, 1, 2]);
  showModal('<div class="kicker">칩 세팅</div><h2>스타팅 ' + won(S) + ' 세트는 어느 것인가?</h2>' +
    '<p>딜러가 세 가지 세트를 준비해 왔다. 합이 정확히 ' + won(S) + '인 것을 고르세요.</p><div class="choices">' +
    order.map(function (k) { return '<button class="choice" data-cq="' + k + '">' + opts[k] + '</button>'; }).join('') + '</div>');
  G.current = { kind: 'chips', correct: order.indexOf(0) };
  document.querySelectorAll('[data-cq]').forEach(function (btn) {
    btn.onclick = function () {
      var k = +btn.getAttribute('data-cq'), ok = k === 0;
      G.cfg.chipOk = ok;
      showModal('<div class="kicker">칩 세팅</div><div class="verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ 정확한 세트' : '✗ 틀린 세트 — 영업 중 항의가 생길 수 있다') + '</div>' +
        '<p>' + order.map(function (j) { return opts[j] + ' = <b>' + won(sums[j]) + '</b>'; }).join('<br>') + '</p>' +
        '<button class="cta" data-back="1">돌아가기</button>');
      $('[data-back]').onclick = function () { prepScreen('chips'); };
    };
  });
}

function trainDealer(i) {
  var qs = [], k;
  for (k = 0; k < 3; k++) {
    var n = pick([1, 2, 2, 3]), acts = [];
    for (var j = 0; j < n; j++) { var r = Math.random(); acts.push({ name: pick(NAMES), kind: r < 0.5 ? 'fold' : (r < 0.85 ? 'call' : 'raise') }); }
    qs.push({ acts: acts, sa: isSA(acts) });
  }
  var at = 0, right = 0, name = DEALERS[i].name;
  function ask() {
    var q = qs[at];
    G.current = { kind: 'train', sa: q.sa };
    showModal('<div class="kicker">교육 — 딜러 ' + name + ' · ' + (at + 1) + '/3</div><h2>실질 액션이 성립했나?</h2>' + actsHTML(q.acts) +
      '<div class="choices"><button class="choice" data-sa="1">성립했다 — 이제 미스딜을 선언할 수 없다</button><button class="choice" data-sa="0">아직이다 — 미스딜 사유가 생기면 다시 딜한다</button></div>');
    document.querySelectorAll('[data-sa]').forEach(function (b) {
      b.onclick = function () {
        var ok = (b.getAttribute('data-sa') === '1') === q.sa;
        if (ok) right++;
        showModal('<div class="kicker">교육 — ' + (at + 1) + '/3</div><div class="verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ 맞았다' : '✗ 틀렸다') + '</div>' +
          '<p>' + (q.sa ? '성립했다. ' : '아직이다. ') + '액션 ' + q.acts.length + '개 중 칩이 들어간 것 ' + q.acts.filter(function (a) { return a.kind !== 'fold'; }).length + '개.</p>' +
          '<div class="cite"><b>근거</b> ' + SRC.sa + '<span class="unverified">원문 확인 전</span></div><button class="cta" data-next="1">' + (at < 2 ? '다음 문제' : '교육 끝') + '</button>');
        $('[data-next]').onclick = function () {
          at++;
          if (at < 3) ask();
          else {
            G.dealerAcc = G.dealerAcc || DEALERS.map(function (d) { return d.acc; });
            G.dealerAcc[i] = clamp(G.dealerAcc[i] + right * 4, 0, 98);
            G.cfg.train = i;
            toast('딜러 ' + name + ' 정확도 +' + right * 4);
            prepScreen('dealers');
          }
        };
      };
    });
  }
  ask();
}

function openDay() {
  closeModal();
  G.bank -= G.cfg.stock * STOCK_COST;
  G.dayRevenue = 0;
  newDay();
  G.cfg.assign.slice(0, tableCount()).forEach(function (di, k) {
    var t = G.tables[k], d = G.dealers[di];
    t.dealer = di; d.table = k;
    walkTo(d, [dealerPos(t.def)], function () { faceTo(d, V(t.def.cx, t.def.cz)); });
  });
  G.phase = 'open';
  $('#hud')._built = false;
  log(G.day + '일차 영업 시작 — 참가비 ' + won(G.cfg.fee) + ' · 스타팅 ' + won(STACKS[G.cfg.stack].chips) + ' · 레벨 ' + levelMin() + '분', 'hi');
  toast('18:00 — 영업 시작. 카운터에 서면 등록이 빨라진다');
  say(G.player, '오늘도 잘 부탁해요!', 2.5);
}

// ═══════════════════════════════════════════════════
// 마감 — 정산 확인 → 보고서
// ═══════════════════════════════════════════════════
function closeDay() {
  if (G.finalized) return;
  G.finalized = true;
  G.phase = 'closed';
  G.customers.forEach(function (c) { if (c.alive) { G.stats.satSum += c.sat; G.stats.satN++; } });
  G.tasks = []; G.tables.forEach(function (t) { t.call = null; t.def.alarm.visible = false; });
  renderTasks();
  // 정산 확인 — 참가비 매출 합계
  var s = G.stats, fee = G.cfg.fee;
  var right = s.entries * fee;
  var vals = [right, s.unique * fee === right ? right + fee : s.unique * fee, (s.entries + 1) * fee];
  var opts = vals.map(function (v) { return won(v) + '원'; });
  var order = shuffle([0, 1, 2]);
  G.current = { kind: 'settle', correct: order.indexOf(0) };
  showModal('<div class="kicker">' + clock(gameMin()) + ' · 마감</div><h2>레지 정산 — 참가비 합계</h2>' +
    '<p>오늘 엔트리 <b>' + s.entries + '</b>건 (처음 온 사람 ' + s.unique + '명 + 리엔트리 ' + (s.entries - s.unique) + '건) · 참가비 ' + won(fee) + '원. 카운터 정산 금액은?</p>' +
    '<div class="choices">' + order.map(function (k) { return '<button class="choice" data-st="' + k + '">' + opts[k] + '</button>'; }).join('') + '</div>');
  document.querySelectorAll('[data-st]').forEach(function (b) {
    b.onclick = function () {
      var ok = +b.getAttribute('data-st') === 0;
      report(ok);
    };
  });
}

function report(settleOk) {
  var s = G.stats;
  var feeRev = s.entries * G.cfg.fee, drinkRev = s.drinks * PRICES[G.cfg.price].p;
  var wages = WAGE.dealer * dealerCount() + WAGE.staff + (G.owned.counter ? WAGE.counter : 0) + (G.owned.cleaner ? WAGE.cleaner : 0);
  var stockCost = G.cfg.stock * STOCK_COST;
  var settleLoss = settleOk ? 0 : 50000;
  var net = feeRev + drinkRev - wages - WAGE.ops - stockCost - settleLoss;
  G.bank += net + stockCost;   // 재고비는 오픈 때 이미 냈다
  var avgSat = s.satN ? s.satSum / s.satN : 70;
  G.rep = clamp(G.rep + (avgSat - 60) / 8, 0, 100);
  G.dealerAcc = G.dealers.map(function (d) { return d.acc; });

  var reviews = [];
  if (s.right >= 3 && s.wrong === 0) reviews.push('“플로어가 룰 정리를 깔끔하게 해 줘서 믿고 친다.” ★★★★★');
  if (s.wrong > 0) reviews.push('“판정이 오락가락했다. 룰을 제대로 아는 사람이 있나?” ★★');
  if (s.missed > 0) reviews.push('“플로어를 불렀는데 아무도 안 왔다.” ★');
  if (s.annMiss + s.annWrong > 0) reviews.push('“블라인드가 몇인지 아무도 안 알려 줬다.” ★★');
  if (s.spillSec > 90) reviews.push('“바닥이 끈적끈적. 청소 좀…” ★★');
  if (s.lost + s.queueLeave > 2) reviews.push('“등록 줄이 너무 길어서 그냥 나왔다.” ★★');
  if (s.noStock > 2) reviews.push('“음료가 다 떨어졌다고 한다.” ★★');
  if (s.drinks > s.entries) reviews.push('“음료가 빨리 나온다. 분위기 좋다.” ★★★★');
  if (G.owned.interior) reviews.push('“인테리어가 예뻐서 사진 찍기 좋다.” ★★★★');
  if (G.winner) reviews.push('“' + G.winner.name + ' 우승 축하! 트로피 멋지다.” ★★★★');
  if (!reviews.length) reviews.push('“무난한 하루였다.” ★★★');

  var rows = [
    ['참가비 ' + s.entries + '건 × ' + won(G.cfg.fee), feeRev],
    ['음료 ' + s.drinks + '잔 × ' + won(PRICES[G.cfg.price].p), drinkRev],
    ['인건비 (딜러 ' + dealerCount() + ' · 홀' + (G.owned.counter ? ' · 카운터' : '') + (G.owned.cleaner ? ' · 청소' : '') + ')', -wages],
    ['운영비 (임대 · 전기 · 기타)', -WAGE.ops],
    ['음료 재고 ' + G.cfg.stock + '개', -stockCost]
  ];
  if (settleLoss) rows.push(['정산 오차 확인 비용', -settleLoss]);
  var h = '<div class="kicker">' + G.day + '일차 마감 · ' + clock(gameMin()) + '</div><h2>오늘의 정산</h2>' +
    (settleOk ? '<p>✓ 레지 정산이 맞았다.</p>' : '<p>✗ 레지 정산이 틀렸다 — 차액을 맞추느라 마감이 늦어졌다.</p>') +
    '<table class="rows">' + rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + (r[1] < 0 ? '−' : '') + won(Math.abs(r[1])) + '</td></tr>'; }).join('') +
    '<tr class="total"><td>순이익</td><td>' + (net < 0 ? '−' : '') + won(Math.abs(net)) + '</td></tr>' +
    '<tr><td>자금</td><td>' + won(G.bank) + '</td></tr></table>' +
    '<h3>운영</h3><p>플로어 호출 — 맞음 <b>' + s.right + '</b> · 틀림 <b>' + s.wrong + '</b> · 못 감 <b>' + s.missed + '</b>' + (s.angry ? ' · 화나서 나간 손님 ' + s.angry : '') + '<br>' +
    '아나운스 ' + s.ann + '건 (틀림 ' + s.annWrong + ' · 놓침 ' + s.annMiss + ') · 밸런싱 ' + s.balanced + '건' + (s.balanceMiss ? ' (놓침 ' + s.balanceMiss + ')' : '') + '<br>' +
    '청소 ' + s.cleaned + '건 · 바닥이 젖어 있던 시간 ' + Math.round(s.spillSec) + '초 · 음료 품절로 못 판 것 ' + s.noStock + '건</p>' +
    '<h3>손님</h3><p>평균 만족도 ' + Math.round(avgSat) + ' · 줄이 길어 돌아간 손님 ' + (s.lost + s.queueLeave) + '명 · 평판 ' + Math.round(s.repStart) + ' → <b>' + Math.round(G.rep) + '</b></p>' +
    '<p>' + (G.winner ? '🏆 우승 ' + G.winner.name + ' — 트로피와 다음 대회 시드권' : '마감까지 결판이 나지 않았다 — 남은 사람들은 다음 대회 시드권') + '</p>' +
    '<h3>후기</h3><p>' + reviews.join('<br>') + '</p>' +
    '<button class="cta" data-next-day="1">다음 날 영업 준비</button> <button class="cta ghost" data-restart="1">처음부터</button>';
  showModal(h, true);
  $('[data-next-day]').onclick = function () { G.day++; G.cfg.train = null; G.cfg.chipOk = null; prepScreen('shop'); };
  $('[data-restart]').onclick = function () {
    G.day = 1; G.rep = 50; G.bank = START_BANK; G.owned = {}; G.dealerAcc = null;
    G.cfg = { fee: 30000, stack: 1, level: 1, price: 1, stock: 60, chipOk: null, assign: [0, 1, null, null], train: null };
    applyDecor(); titleScreen();
  };
}

// ── 시작 ────────────────────────────────────────────
initScene();
newDay();
titleScreen();
requestAnimationFrame(frame);
})();
