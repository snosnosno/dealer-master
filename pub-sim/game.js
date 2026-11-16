/* ═══════════════════════════════════════════════════════
   홀덤펍 점장 — 하루 영업 슬라이스 (프로토타입 1판)
   설계: pub-sim/DESIGN.md

   플레이어는 점장이다. 딜러 · 홀 직원 · 손님은 NPC 가 움직인다.
   점장의 손은 두 곳에만 간다 — 경영 결정(오픈 전 · 딜러 교대)과 플로어 호출.

   경제는 합법 운영 기준이다: 매출은 참가비와 음료뿐, 시상은 트로피와 포인트.
   칩 환전 · 현금 시상은 게임 안에도 없다.

   판정 정답의 근거는 딜러마스터 레포의 TDA 케이스 문서다. 원문 대조 전이라
   채점 화면에 「원문 확인 전」을 붙인다.
   ═══════════════════════════════════════════════════════ */
(function () {
'use strict';

// ── 상수 ────────────────────────────────────────────
var DAY_SEC = 360;                 // 18:00 → 02:00 을 실시간 6 분에 (1 배속)
var OPEN_MIN = 18 * 60, CLOSE_MIN = 26 * 60, REG_CLOSE_MIN = 23 * 60;
var LEVEL_MIN = 20;                // 블라인드는 게임 시간 20 분마다
var LEVELS = [[100, 200], [200, 400], [300, 600], [400, 800], [500, 1000], [600, 1200],
  [800, 1600], [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000], [4000, 8000],
  [5000, 10000], [6000, 12000], [8000, 16000], [10000, 20000], [15000, 30000], [20000, 40000],
  [25000, 50000], [30000, 60000], [40000, 80000], [50000, 100000], [60000, 120000], [80000, 160000]];
var CALL_LIMIT = 45;               // 호출 응답 제한 (시뮬레이션 초)
var DRINK_PRICE = 6000;
var WAGE = { dealer: 150000, staff: 120000, ops: 200000 };
var FEES = [20000, 30000, 50000];
var BAR_CAP = 7;                   // 바에서 기다릴 수 있는 사람 수
var N = 6;

var CUST_TYPES = {
  regular: { ko: '단골', color: 0x3B6FB6, w: 0.3, reentry: 0.6, drink: 1.3 },
  rookie:  { ko: '초보', color: 0x3E9B5F, w: 0.35, reentry: 0.35, drink: 1.0 },
  pro:     { ko: '고수', color: 0x7A4BB0, w: 0.2, reentry: 0.5, drink: 0.7 },
  rude:    { ko: '진상', color: 0xC2412F, w: 0.15, reentry: 0.5, drink: 1.1 }
};
var NAMES = ['김도현', '박서준', '이민아', '최우진', '정하늘', '강태호', '윤소라', '임재혁', '한다은',
  '서지훈', '오유진', '배성민', '조은비', '신우석', '문가영', '홍재민', '류하준', '장서윤', '권민호',
  '송지아', '안태윤', '황보람', '전다빈', '고은찬', '남궁현', '유채린', '백승우', '노하린', '하지원', '차민혁'];
var DEALERS = [
  { name: '민준', acc: 86, speed: 0.95, kind: 70 },
  { name: '서연', acc: 74, speed: 1.15, kind: 88 },
  { name: '지호', acc: 63, speed: 1.05, kind: 60 }
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

// ═══════════════════════════════════════════════════
// 3D 장면
// ═══════════════════════════════════════════════════
var scene, camera, renderer, raycaster, pointer;
var cam = { yaw: -0.18, pitch: 0.92, dist: 21, target: new THREE.Vector3(-0.5, 0, -0.5) };
var pickables = [];

var TABLE_DEF = [
  { name: '1번 테이블', cx: -4.2, cz: 0.6 },
  { name: '2번 테이블', cx: 3.6, cz: -1.2 }
];
var RX = 1.9, RZ = 1.1;
// 딜러가 앞(+z), 1번 좌석은 딜러 왼쪽에서 시작해 시계 방향 — 위에서 보면 아래→왼쪽→위→오른쪽
var SEAT_ANG = [140, 190, 240, 300, 350, 40];
var SPOTS = {
  door: new THREE.Vector3(10.5, 0, 7.2),
  outside: new THREE.Vector3(10.5, 0, 10),
  counter: new THREE.Vector3(8.2, 0, 3.4),
  dealerRest: new THREE.Vector3(-10.2, 0, -2.6),
  staffHome: new THREE.Vector3(-5.5, 0, -5.3)
};
var BAR_SPOTS = [];
for (var bi = 0; bi < BAR_CAP; bi++) BAR_SPOTS.push(new THREE.Vector3(-10.6 + bi * 1.05, 0, -4.9));

function seatPos(t, i, off) {
  var a = SEAT_ANG[i] * Math.PI / 180, o = off || 0.62;
  return new THREE.Vector3(t.cx + (RX + o) * Math.cos(a), 0, t.cz + (RZ + o) * Math.sin(a));
}
function dealerPos(t) { return new THREE.Vector3(t.cx, 0, t.cz + RZ + 0.55); }

function mat(c, o) { return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8, metalness: 0.05 }, o || {})); }
function box(w, h, d, c, x, y, z) {
  var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  scene.add(m); return m;
}

function initScene() {
  var host = $('#scene');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

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
  var rug = new THREE.Mesh(new THREE.PlaneGeometry(16, 8.5), mat(0x3a2b3f, { roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(-0.3, 0.01, -0.3); rug.receiveShadow = true; scene.add(rug);
  box(26, 3, 0.3, 0x2c3b36, 0, 1.5, -9);
  box(0.3, 3, 18, 0x2c3b36, -13, 1.5, 0);
  box(0.3, 0.6, 12, 0x2c3b36, 13, 0.3, -3);
  // 입구 매트
  var mt = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), mat(0x8a2b22));
  mt.rotation.x = -Math.PI / 2; mt.position.set(10.5, 0.02, 7.6); scene.add(mt);

  // 바 · 등록 카운터
  box(8, 1.1, 1, 0x4a2f22, -7.6, 0.55, -6.6);
  box(8, 0.08, 1.2, 0x2a1b14, -7.6, 1.12, -6.6);
  box(8, 1.4, 0.5, 0x23332e, -7.6, 1.6, -8.6);
  for (var k = 0; k < 8; k++) {
    var bot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 10), mat([0x2f8a5b, 0x9c3d2d, 0xd8b35a][k % 3], { roughness: 0.3 }));
    bot.position.set(-11 + k * 0.9, 2.45, -8.6); scene.add(bot);
  }
  BAR_SPOTS.forEach(function (p) {
    var st = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 14), mat(0x1d1d1d));
    st.position.set(p.x, 0.3, p.z - 0.55); st.castShadow = true; scene.add(st);
  });
  box(2.8, 1.1, 0.9, 0x4a2f22, 8.2, 0.55, 2.4);
  var sign = labelSprite('등록 · 계산', '#EF9F27');
  sign.position.set(8.2, 1.7, 2.4); scene.add(sign);
  var barSign = labelSprite('BAR', '#EF9F27');
  barSign.position.set(-7.6, 2.2, -8.3); scene.add(barSign);
  // 딜러 휴게 자리
  box(1.6, 0.5, 0.9, 0x31423c, -10.2, 0.25, -1.6);

  // 테이블
  TABLE_DEF.forEach(function (t, ti) {
    var g = new THREE.Group();
    var felt = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 48), mat(0x0F6E56, { roughness: 0.95 }));
    felt.scale.set(RX, 1, RZ); felt.position.y = 0.82; felt.receiveShadow = true;
    var rail = new THREE.Mesh(new THREE.TorusGeometry(1, 0.11, 10, 48), mat(0x2a1b14, { roughness: 0.5 }));
    rail.rotation.x = Math.PI / 2; rail.scale.set(RX + 0.04, RZ + 0.07, 1); rail.position.y = 0.87; rail.castShadow = true;
    var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 0.8, 16), mat(0x1d1d1d));
    leg.position.y = 0.4; leg.castShadow = true;
    g.add(felt, rail, leg);
    g.position.set(t.cx, 0, t.cz);
    scene.add(g);
    felt.userData.table = ti; rail.userData.table = ti;
    pickables.push(felt, rail);
    for (var i = 0; i < N; i++) {
      var p = seatPos(t, i, 0.95);
      var ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(0x2b2b30));
      ch.position.set(p.x, 0.25, p.z); ch.castShadow = true; scene.add(ch);
    }
    // 가운데 칩 · 호출 표시
    t.chips = new THREE.Group();
    [0xd9dedb, 0x2e6e52, 0xb23a2e, 0x2c4a7a].forEach(function (c, ix) {
      for (var h = 0; h < 3; h++) {
        var chip = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.035, 16), mat(c, { roughness: 0.4 }));
        chip.position.set(-0.3 + ix * 0.2, 0.9 + h * 0.037, 0);
        t.chips.add(chip);
      }
    });
    t.chips.position.set(t.cx, 0, t.cz);
    scene.add(t.chips);
    var alarm = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 16), mat(0xE5402F, { emissive: 0x7a1208 }));
    alarm.rotation.x = Math.PI;
    alarm.position.set(t.cx, 3, t.cz);
    alarm.visible = false;
    scene.add(alarm);
    t.alarm = alarm;
    t.cards = [];
    for (var s = 0; s < N; s++) {
      var cp = seatPos(t, s, -0.42);
      var cg = new THREE.Group();
      for (var c2 = 0; c2 < 2; c2++) {
        var card = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.23), mat(0xf5f5f0));
        card.position.set(c2 * 0.12 - 0.06, 0, 0);
        cg.add(card);
      }
      cg.position.set(cp.x, 0.885, cp.z);
      cg.rotation.y = -SEAT_ANG[s] * Math.PI / 180 + Math.PI / 2;
      cg.visible = false;
      scene.add(cg);
      t.cards.push(cg);
    }
  });

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  bindCamera();
  fitCamera();
  window.addEventListener('resize', function () {
    fitCamera();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
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

function updateCamera() {
  var t = cam.target;
  camera.position.set(
    t.x + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
    t.y + cam.dist * Math.sin(cam.pitch),
    t.z + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw)
  );
  camera.lookAt(t);
}

function bindCamera() {
  var el = renderer.domElement, drag = null, pinch = null;
  el.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
  window.addEventListener('pointerup', function (e) {
    if (drag && drag.moved < 6 && e.target === el) clickScene(e);
    drag = null;
  });
  window.addEventListener('pointermove', function (e) {
    if (!drag || pinch) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    cam.yaw -= dx * 0.006;
    cam.pitch = clamp(cam.pitch + dy * 0.004, 0.45, 1.45);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  el.addEventListener('wheel', function (e) { e.preventDefault(); cam.dist = clamp(cam.dist + e.deltaY * 0.012, 9, 44); }, { passive: false });
  el.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  });
  el.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && pinch) {
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      cam.dist = clamp(cam.dist * pinch / d, 9, 44); pinch = d;
    }
  });
  el.addEventListener('touchend', function () { pinch = null; });
}

function clickScene(e) {
  if (G.modal) return;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  var hit = raycaster.intersectObjects(pickables, false)[0];
  if (hit && hit.object.userData.table !== undefined) openTable(hit.object.userData.table);
}

// ── 사람 ─────────────────────────────────────────────
function makePerson(color, vest) {
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
  scene.add(g);
  return g;
}

/* 걷기 — 경로를 따라 직선으로. 도착하면 콜백 */
function walkTo(actor, points, done) {
  actor.path = points.map(function (p) { return p.clone(); });
  actor.onArrive = done || null;
  actor.sitting = false;
}
function stepActor(a, dt) {
  var m = a.mesh;
  var targetY = a.sitting ? -0.18 : 0;
  m.position.y += (targetY - m.position.y) * Math.min(1, dt * 8);
  if (!a.path || !a.path.length) return;
  var p = a.path[0];
  var dx = p.x - m.position.x, dz = p.z - m.position.z;
  var d = Math.hypot(dx, dz), sp = 2.6 * dt;
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

// ═══════════════════════════════════════════════════
// 게임 상태
// ═══════════════════════════════════════════════════
var G = {
  phase: 'title', simT: 0, speed: 1, paused: false, modal: null,
  fee: 30000, rep: 50, day: 1, money: 0,
  dealers: [], tables: [], customers: [], staff: null,
  calls: [], log: [], nameIx: 0,
  stats: null, nextArrival: 2, winner: null, finalized: false
};
window.__pub = G;   // 자동 점검용

function gameMin() { return OPEN_MIN + G.simT * (CLOSE_MIN - OPEN_MIN) / DAY_SEC; }
function level() { return Math.min(LEVELS.length - 1, Math.floor((gameMin() - OPEN_MIN) / LEVEL_MIN)); }
function regOpen() { return gameMin() < REG_CLOSE_MIN; }

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

function newDay() {
  // 이전 날의 메시 정리
  G.customers.forEach(function (c) { scene.remove(c.mesh); });
  G.dealers.forEach(function (d) { scene.remove(d.mesh); });
  if (G.staff) scene.remove(G.staff.mesh);
  G.customers = []; G.calls = []; G.log = [];
  G.simT = 0; G.nextArrival = 2; G.winner = null; G.winnerAt = null; G.finalized = false; G.speed = 1; G.paused = false;
  G.nameIx = rnd(NAMES.length);
  G.stats = { entries: 0, drinks: 0, right: 0, wrong: 0, missed: 0, lost: 0, angry: 0, waits: 0, satSum: 0, satN: 0, reviews: [], repStart: G.rep, events: [] };

  G.dealers = DEALERS.map(function (d, i) {
    var o = G.dealerState && G.dealerState[i] ? G.dealerState[i] : { acc: d.acc };
    var dl = { id: i, name: d.name, acc: o.acc, speed: d.speed, kind: d.kind, fatigue: 0, table: null, mesh: makePerson(0xf2f2f2, 0x1c1c1c) };
    dl.mesh.position.copy(SPOTS.dealerRest).add(new THREE.Vector3(i * 0.7 - 0.7, 0, 0));
    return dl;
  });
  G.tables = TABLE_DEF.map(function (t, i) {
    t.alarm.visible = false;
    t.cards.forEach(function (c) { c.visible = false; });
    return {
      id: i, def: t, name: t.name, seats: [null, null, null, null, null, null],
      dealer: null, handT: 0, pos: null, last: null, needsDraw: true, changed: false,
      call: null, hands: 0, broken: false, bustedLast: []
    };
  });
  G.staff = { mesh: makePerson(0xE6B94A), path: null, busy: false, cool: 3 };
  G.staff.mesh.position.copy(SPOTS.staffHome);
}

// ═══════════════════════════════════════════════════
// 손님
// ═══════════════════════════════════════════════════
function pickType() {
  var r = Math.random(), acc = 0, k;
  for (k in CUST_TYPES) { acc += CUST_TYPES[k].w; if (r < acc) return k; }
  return 'rookie';
}
function waitingAtBar() { return G.customers.filter(function (c) { return c.alive && (c.state === 'bar-wait' || c.state === 'to-bar-wait'); }); }
function barOccupants() { return G.customers.filter(function (c) { return c.alive && c.barSpot !== null && c.barSpot !== undefined; }); }
function freeBarSpot() {
  var used = barOccupants().map(function (c) { return c.barSpot; });
  for (var i = 0; i < BAR_SPOTS.length; i++) if (used.indexOf(i) < 0) return i;
  return -1;
}

function spawnCustomer() {
  var type = pickType();
  var c = {
    id: G.customers.length, name: nextName(), type: type, alive: true, state: 'arrive',
    sat: 70, mesh: makePerson(CUST_TYPES[type].color), table: null, seat: null, barSpot: null,
    entries: 0, lastDrink: -99, leaveAt: 0
  };
  c.mesh.position.copy(SPOTS.outside);
  G.customers.push(c);
  if (freeBarSpot() < 0) {
    // 자리도 바도 꽉 찼다 — 문 앞에서 돌아간다
    G.stats.lost++;
    c.state = 'leaving';
    walkTo(c, [SPOTS.door, SPOTS.outside], function () { despawn(c); });
    log(c.name + ' — 자리가 없어 돌아갔다', 'bad');
    return;
  }
  walkTo(c, [SPOTS.door, SPOTS.counter], function () { register(c); });
}

function register(c) {
  if (!regOpen()) { toBar(c, 'drink'); return; }
  c.entries++;
  G.stats.entries++;
  G.money += G.fee;
  log(c.name + '(' + CUST_TYPES[c.type].ko + ') ' + (c.entries > 1 ? '리엔트리' : '등록') + ' — 참가비 ' + won(G.fee));
  toBar(c, 'wait');
}

function toBar(c, why) {
  var spot = freeBarSpot();
  if (spot < 0) { leave(c, '바가 꽉 찼다'); return; }
  c.barSpot = spot;
  c.state = why === 'wait' ? 'to-bar-wait' : 'to-bar-drink';
  walkTo(c, [BAR_SPOTS[spot]], function () {
    c.state = why === 'wait' ? 'bar-wait' : 'bar-drink';
    c.sitting = true;
    faceTo(c, new THREE.Vector3(BAR_SPOTS[spot].x, 0, -8));
    if (why !== 'wait') c.leaveAt = G.simT + 18 + Math.random() * 25;
  });
}

function leave(c, why) {
  if (c.state === 'leaving') return;
  c.barSpot = null; c.table = null; c.seat = null;
  c.state = 'leaving';
  G.stats.satSum += c.sat; G.stats.satN++;
  walkTo(c, [SPOTS.door, SPOTS.outside], function () { despawn(c); });
  if (why) log(c.name + ' 퇴장 — ' + why, why.indexOf('화') >= 0 ? 'bad' : '');
}
function despawn(c) { c.alive = false; scene.remove(c.mesh); }

/* 자리 배정 — 다음 핸드의 버튼부터 다음 BB 직전까지는 피한다.
   그 자리에 새로 앉은 사람의 처리 규칙은 원문 확인 전이라 만들지 않는다 */
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

function seatWaiting() {
  var wait = G.customers.filter(function (c) { return c.alive && c.state === 'bar-wait'; });
  wait.forEach(function (c) {
    var open = G.tables.filter(function (t) { return !t.broken && t.dealer !== null && !t.call && safeSeats(t).length; });
    if (!open.length) return;
    open.sort(function (a, b) { return seated(a) - seated(b); });
    var t = open[0], s = pick(safeSeats(t));
    t.seats[s] = c.id;
    t.changed = true;
    c.table = t.id; c.seat = s; c.barSpot = null; c.state = 'to-seat';
    walkTo(c, [seatPos(t.def, s)], function () {
      c.state = 'seated'; c.sitting = true;
      faceTo(c, new THREE.Vector3(t.def.cx, 0, t.def.cz));
    });
    log(c.name + ' 착석 — ' + t.name + ' ' + seatNo(s));
  });
}

function bust(t, s) {
  var c = G.customers[t.seats[s]];
  t.seats[s] = null;
  t.changed = true;
  c.table = null; c.seat = null;
  var ty = CUST_TYPES[c.type];
  var feeFactor = G.fee >= 50000 ? 0.6 : (G.fee <= 20000 ? 1.2 : 1);
  if (regOpen() && chance(ty.reentry * feeFactor)) {
    c.state = 'to-counter';
    walkTo(c, [SPOTS.counter], function () { register(c); });
    log(c.name + ' 탈락 — 리엔트리하러 간다');
  } else {
    log(c.name + ' 탈락 (' + t.name + ' ' + seatNo(s) + ')');
    toBar(c, 'drink');
  }
}

// ═══════════════════════════════════════════════════
// 테이블 진행 — 핸드는 시간으로 굴러가고, 끝날 때 탈락이 생긴다
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

function effAcc(d) { return clamp(d.acc - d.fatigue * 0.8, 20, 99); }

function tickTable(t, dt) {
  var d = t.dealer !== null ? G.dealers[t.dealer] : null;
  var n = seated(t);
  t.def.cards.forEach(function (cg, i) { cg.visible = !!(t.pos && occ(t, i) && n >= 2 && !t.broken); });
  t.def.alarm.visible = !!t.call;
  if (t.call) t.def.alarm.position.y = 2.9 + Math.sin(G.simT * 5) * 0.15;

  if (t.call || !d || t.broken) return;
  if (n < 2) { t.pos = null; t.needsDraw = true; t.handT = 0; return; }
  if (!t.pos) startHand(t);
  t.handT += dt * d.speed;
  if (t.handT >= 11) endHand(t);
}

function endHand(t) {
  t.hands++;
  t.handT = 0;
  // 탈락 — 블라인드가 오를수록 잦다. 한 핸드에 전원이 나가지는 않는다
  var lv = level(), p = Math.min(0.13, 0.025 + lv * 0.007) * (regOpen() ? 1 : 1.8);   // 마감 뒤엔 결판을 향해 빨라진다
  var occs = [];
  for (var i = 0; i < N; i++) if (occ(t, i)) occs.push(i);
  var busted = [];
  occs.forEach(function (s) { if (busted.length < occs.length - 1 && chance(p)) busted.push(s); });
  t.bustedLast = busted.map(function (s) { return { seat: s, name: G.customers[t.seats[s]].name }; });
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

  // 탈락 · 착석 뒤 — 딜러가 버튼을 잘못 놓으면 손님이 이의를 건다
  if (changed && !pos.draw && prev && seated(t) >= 4 && chance(0.1 + miss * 1.0)) {
    createCall(t, 'pos', { prev: prev, pos: pos, busted: t.bustedLast.slice(), snap: snapSeats(t) });
    return;
  }
  if (chance(0.07 + miss * 0.36)) {
    var type = pick(['btn', 'cnt', 'under', 'under']);
    if (type === 'btn' && seated(t) < 4) type = 'cnt';
    createCall(t, type, genIncident(t, type));
  }
}

function snapSeats(t) {
  return t.seats.map(function (id) { return id === null ? null : G.customers[id].name; });
}

// ── 사고 생성 ─────────────────────────────────────────
function preflopOrder(t) {
  var o = [], s = t.pos.bb;
  for (var k = 0; k < N; k++) { s = nextOcc(t, s); if (s === t.pos.bb && k > 0) break; if (o.indexOf(s) >= 0) break; o.push(s); }
  return o;
}
function isSA(acts) {
  var chips = acts.filter(function (a) { return a.kind !== 'fold' && a.kind !== 'check'; }).length;
  return acts.length >= 3 || (acts.length >= 2 && chips >= 1);
}
function genIncident(t, type) {
  var lv = LEVELS[level()];
  if (type === 'under') {
    var minRaise = lv[1], cur = lv[1];
    var street = pick(['프리플랍', '플랍', '턴']);
    if (street !== '프리플랍') { cur = lv[1] * pick([2, 3, 4]); minRaise = cur; }
    var minTo = cur + minRaise;
    var underTo = cur + Math.max(100, Math.floor(minRaise / 200) * 100);
    var seat = pick(preflopOrder(t));
    return { street: street, cur: cur, minTo: minTo, to: underTo, who: G.customers[t.seats[seat]].name, seat: seat, late: street !== '턴' ? chance(0.5) : chance(0.4) };
  }
  var order = preflopOrder(t);
  var k = pick([0, 1, 2, 2, 3, 3]);
  var acts = [];
  for (var i = 0; i < Math.min(k, order.length); i++) {
    var r = Math.random();
    var kind = r < 0.45 ? 'fold' : (r < 0.85 ? 'call' : 'raise');
    acts.push({ seat: order[i], name: G.customers[t.seats[order[i]]].name, kind: kind });
  }
  var data = { acts: acts, sa: isSA(acts) };
  if (type === 'btn') data.shouldBe = t.pos.btn;
  if (type === 'cnt') {
    var s2 = pick(order);
    data.seat = s2; data.who = G.customers[t.seats[s2]].name; data.n = chance(0.5) ? 1 : 3;
  }
  return data;
}

function createCall(t, type, data) {
  var c = { id: Date.now() + Math.random(), table: t.id, type: type, data: data, t0: G.simT };
  t.call = c;
  G.calls.push(c);
  log(t.name + ' — 플로어 호출', 'bad');
  renderCalls();
}

function resolveCall(c, result) {
  var t = G.tables[c.table];
  t.call = null;
  G.calls = G.calls.filter(function (x) { return x !== c; });
  var seatedCs = t.seats.filter(function (x) { return x !== null; }).map(function (id) { return G.customers[id]; });
  if (result === 'right') {
    G.stats.right++; G.rep = clamp(G.rep + 1.5, 0, 100);
    seatedCs.forEach(function (cu) { cu.sat = clamp(cu.sat + 8, 0, 100); });
    G.stats.events.push('right');
  } else if (result === 'wrong') {
    G.stats.wrong++; G.rep = clamp(G.rep - 3, 0, 100);
    seatedCs.forEach(function (cu) { cu.sat = clamp(cu.sat - 15, 0, 100); });
    G.stats.events.push('wrong');
    // 진상이 있으면 그가, 없으면 불만이 가장 큰 사람이 화가 나서 나간다
    var angry = seatedCs.filter(function (cu) { return cu.type === 'rude'; })[0] ||
      seatedCs.slice().sort(function (a, b) { return a.sat - b.sat; })[0];
    if (angry && seatedCs.length > 2 && chance(angry.type === 'rude' ? 0.85 : 0.4)) {
      t.seats[angry.seat] = null; t.changed = true;
      G.stats.angry++;
      leave(angry, '판정에 화가 나서');
    }
  } else {
    G.stats.missed++; G.rep = clamp(G.rep - 3, 0, 100);
    seatedCs.forEach(function (cu) { cu.sat = clamp(cu.sat - 12, 0, 100); });
    G.stats.events.push('missed');
    log(t.name + ' — 아무도 오지 않아 딜러가 알아서 처리했다', 'bad');
  }
  // 미스딜이면 핸드를 처음부터
  if (c.misdeal) t.handT = 0;
  renderCalls();
}

// ── 테이블 재편 · 토너먼트 끝 ─────────────────────────
function checkBreak() {
  if (regOpen() || G.winner) return;
  var live = G.tables.filter(function (t) { return !t.broken && seated(t) > 0; });
  var waiting = G.customers.filter(function (c) { return c.alive && (c.state === 'bar-wait' || c.state === 'to-bar-wait' || c.state === 'to-seat' || c.state === 'to-counter'); });
  if (live.length === 2 && !waiting.length && !live[0].call && !live[1].call) {
    var total = seated(live[0]) + seated(live[1]);
    if (total <= N) {
      var src = seated(live[0]) <= seated(live[1]) ? live[0] : live[1];
      var dst = src === live[0] ? live[1] : live[0];
      src.seats.forEach(function (id, s) {
        if (id === null) return;
        var free = []; for (var i = 0; i < N; i++) if (dst.seats[i] === null) free.push(i);
        var ns = pick(free);
        dst.seats[ns] = id; src.seats[s] = null;
        var c = G.customers[id];
        c.table = dst.id; c.seat = ns; c.state = 'to-seat';
        walkTo(c, [seatPos(dst.def, ns)], function () { c.state = 'seated'; c.sitting = true; faceTo(c, new THREE.Vector3(dst.def.cx, 0, dst.def.cz)); });
      });
      src.broken = true; src.pos = null;
      dst.needsDraw = true; dst.pos = null; dst.changed = false;
      var dl = G.dealers[src.dealer];
      src.dealer = null; dl.table = null;
      walkTo(dl, [SPOTS.dealerRest]);
      log('테이블 재편 — ' + src.name + '을 깨고 ' + dst.name + '로 합친다. 버튼은 다시 추첨', 'hi');
      toast('파이널 테이블 — ' + dst.name);
    }
  }
  // 우승 — 등록 마감 뒤 한 명만 남았다
  var alive = G.customers.filter(function (c) { return c.alive && c.table !== null; });
  var pending = G.customers.filter(function (c) { return c.alive && (c.state === 'bar-wait' || c.state === 'to-bar-wait' || c.state === 'to-counter'); });
  if (alive.length === 1 && !pending.length && G.stats.entries > 1) {
    G.winner = alive[0];
    log('우승 — ' + G.winner.name + '! 트로피와 다음 대회 시드권 (환전 없음)', 'good');
    toast('🏆 우승 ' + G.winner.name);
    var t = G.tables[G.winner.table];
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
  var to = c.mesh.position.clone().add(new THREE.Vector3(0.5, 0, 0.5));
  walkTo(s, [to], function () {
    if (c.alive && chance(0.55 * CUST_TYPES[c.type].drink + 0.2)) {
      G.money += DRINK_PRICE; G.stats.drinks++; c.lastDrink = G.simT; c.sat = clamp(c.sat + 3, 0, 100);
    } else if (c.alive) c.lastDrink = G.simT - 20;
    walkTo(s, [SPOTS.staffHome], function () { s.busy = false; s.cool = 1.5; });
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
  updateCamera();
  renderer.render(scene, camera);
  renderLabels();
  if (G.phase === 'open') renderHud();
  requestAnimationFrame(frame);
}

function simulate(dt) {
  G.simT += dt;
  // 손님 도착 — 평판이 높고 참가비가 낮을수록 잦다
  if (regOpen()) {
    G.nextArrival -= dt;
    if (G.nextArrival <= 0) {
      spawnCustomer();
      var feeK = G.fee === 20000 ? 0.75 : (G.fee === 50000 ? 1.6 : 1);
      var repK = clamp(1.6 - G.rep / 100, 0.6, 1.4);
      G.nextArrival = (5 + Math.random() * 6) * feeK * repK;
    }
  }
  G.customers.forEach(function (c) {
    if (!c.alive) return;
    stepActor(c, dt);
    if (c.state === 'bar-wait') { c.sat = clamp(c.sat - 0.35 * dt, 0, 100); G.stats.waits += dt; }
    if (c.state === 'seated' && G.tables[c.table] && G.tables[c.table].call) c.sat = clamp(c.sat - 1.2 * dt, 0, 100);
    if (c.state === 'bar-drink' && G.simT > c.leaveAt) leave(c);
    if (c.state === 'bar-wait' && c.sat < 15) leave(c, '자리를 기다리다 지쳐서');
  });
  G.dealers.forEach(function (d) {
    stepActor(d, dt);
    if (d.table !== null) d.fatigue = clamp(d.fatigue + dt / 9, 0, 40);
    else d.fatigue = clamp(d.fatigue - dt / 4, 0, 40);
  });
  stepActor(G.staff, dt);
  tickStaff(dt);
  seatWaiting();
  G.tables.forEach(function (t) { tickTable(t, dt); });
  // 호출 제한 시간
  G.calls.slice().forEach(function (c) {
    if (G.simT - c.t0 > CALL_LIMIT) resolveCall(c, 'missed');
  });
  checkBreak();

  if (gameMin() >= CLOSE_MIN || (G.winner && G.simT > 0 && !G.finalized && G.winnerAt && G.simT - G.winnerAt > 8)) closeDay();
  if (G.winner && !G.winnerAt) G.winnerAt = G.simT;
}

// ═══════════════════════════════════════════════════
// 화면 — HUD · 라벨 · 호출 · 모달
// ═══════════════════════════════════════════════════
function renderHud() {
  var hud = $('#hud');
  if (!hud._built) {
    hud.innerHTML = '<span class="title">홀덤펍 점장</span>' +
      '<span class="kv"><b data-h="clock"></b></span>' +
      '<span class="kv">매출 <b data-h="money"></b></span>' +
      '<span class="kv">평판 <span class="rep"><i data-h="repbar"></i></span> <b data-h="rep"></b></span>' +
      '<span class="kv">손님 <b data-h="guests"></b></span>' +
      '<span class="kv m-hide">블라인드 <b data-h="blinds"></b></span>' +
      '<span class="kv m-hide" data-h="reg"></span>' +
      '<span class="sp"></span>' +
      '<button class="hbtn" data-pause="1">❚❚</button>' +
      [1, 2, 4].map(function (s) { return '<button class="hbtn" data-speed="' + s + '">' + s + '×</button>'; }).join('');
    hud.querySelectorAll('[data-speed]').forEach(function (b) { b.onclick = function () { G.speed = +b.getAttribute('data-speed'); G.paused = false; }; });
    hud.querySelector('[data-pause]').onclick = function () { G.paused = !G.paused; };
    hud._built = true;
  }
  var lv = LEVELS[level()];
  var set = function (k, v) { var el = hud.querySelector('[data-h="' + k + '"]'); if (el.textContent !== v) el.textContent = v; };
  set('clock', clock(gameMin()));
  set('money', won(G.money));
  set('rep', String(Math.round(G.rep)));
  set('guests', String(G.customers.filter(function (c) { return c.alive && c.state !== 'leaving'; }).length));
  set('blinds', won(lv[0]) + '/' + won(lv[1]));
  set('reg', regOpen() ? '등록 중' : '등록 마감');
  hud.querySelector('[data-h="repbar"]').style.width = G.rep + '%';
  hud.querySelectorAll('[data-speed]').forEach(function (b) { b.classList.toggle('on', G.speed === +b.getAttribute('data-speed') && !G.paused); });
  hud.querySelector('[data-pause]').classList.toggle('on', G.paused);
  renderCalls();
}

function renderCalls() {
  var el = $('#calls');
  var key = G.calls.map(function (c) { return c.id; }).join('|');
  if (el._key !== key) {
    el._key = key;
    el.innerHTML = G.calls.map(function (c) {
      var t = G.tables[c.table];
      var what = { pos: '버튼 · 블라인드 이의', btn: '버튼 위치 오류', cnt: '카드 장수 이상', under: '레이즈 금액 이의' }[c.type];
      return '<button class="call" data-call="' + c.table + '"><div class="t">플로어! — ' + t.name + '</div><div class="d">' + what + '</div>' +
        '<div class="bar"><i></i></div></button>';
    }).join('');
    el.querySelectorAll('[data-call]').forEach(function (b) { b.onclick = function () { openCall(G.tables[+b.getAttribute('data-call')].call); }; });
  }
  var bars = el.querySelectorAll('.bar i');
  G.calls.forEach(function (c, i) {
    if (bars[i]) bars[i].style.width = Math.max(0, (1 - (G.simT - c.t0) / CALL_LIMIT) * 100) + '%';
  });
}

function renderTicker() {
  var el = $('#ticker');
  el.innerHTML = G.log.slice(-7).map(function (l) { return '<div class="' + l.c + '">' + l.t + '</div>'; }).join('');
}

var labelEls = [];
function renderLabels() {
  var host = $('#labels');
  if (G.phase !== 'open') { host.innerHTML = ''; labelEls = []; return; }
  if (!labelEls.length) {
    G.tables.forEach(function (t, i) {
      var el = document.createElement('div');
      el.className = 'tlabel';
      el.onclick = function () { openTable(i); };
      host.appendChild(el);
      labelEls.push(el);
    });
  }
  G.tables.forEach(function (t, i) {
    var v = new THREE.Vector3(t.def.cx, t.call ? 3.6 : 1.9, t.def.cz).project(camera);
    var el = labelEls[i];
    el.style.left = ((v.x + 1) / 2 * window.innerWidth) + 'px';
    el.style.top = ((1 - v.y) / 2 * window.innerHeight) + 'px';
    var d = t.dealer !== null ? G.dealers[t.dealer] : null;
    var txt = t.broken ? t.name + '<small>재편으로 닫힘</small>' :
      (t.call ? '! 플로어 호출 — ' + t.name : t.name + '<small>' + (d ? '딜러 ' + d.name + ' · 피로 ' + Math.round(d.fatigue) : '딜러 없음') + ' · ' + seated(t) + '명</small>');
    if (el._t !== txt) { el.innerHTML = txt; el._t = txt; }
    el.className = 'tlabel' + (t.call ? ' alert' : '');
  });
}

function showModal(html, wide) {
  G.modal = true;
  $('#modal').innerHTML = '<div class="modal-bg"><div class="modal' + (wide ? ' wide' : '') + '">' + html + '</div></div>';
}
function closeModal() { G.modal = null; $('#modal').innerHTML = ''; }

// ── 테이블 정보 · 딜러 교대 ──────────────────────────
function openTable(i) {
  var t = G.tables[i];
  if (t.call) { openCall(t.call); return; }
  if (t.broken) { toast(t.name + '은 재편으로 닫혔다'); return; }
  var d = t.dealer !== null ? G.dealers[t.dealer] : null;
  var rest = G.dealers.filter(function (x) { return x.table === null; });
  var names = t.seats.map(function (id, s) { return seatNo(s) + ' ' + (id === null ? '—' : G.customers[id].name + '(' + CUST_TYPES[G.customers[id].type].ko + ')'); });
  var h = '<div class="kicker">' + t.name + '</div><h2>' + (d ? '딜러 ' + d.name : '딜러 없음') + '</h2>' +
    (d ? '<p>정확도 ' + Math.round(d.acc) + ' · 피로 ' + Math.round(d.fatigue) + ' → 실제 정확도 <b>' + Math.round(effAcc(d)) + '</b>. 피로가 쌓이면 실수가 늘어 호출이 잦아진다.</p>' : '') +
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
function swapDealer(t, incoming) {
  var out = G.dealers[t.dealer];
  out.table = null;
  walkTo(out, [SPOTS.dealerRest]);
  incoming.table = t.id; t.dealer = incoming.id;
  walkTo(incoming, [dealerPos(t.def)], function () { faceTo(incoming, new THREE.Vector3(t.def.cx, 0, t.def.cz)); });
  log(t.name + ' 딜러 교대 — ' + out.name + ' → ' + incoming.name, 'hi');
}

// ── 플로어 호출 ─────────────────────────────────────
var KIND_KO = { fold: '폴드', call: '콜', raise: '레이즈', check: '체크' };
function actsHTML(acts) {
  if (!acts.length) return '<div class="acts">블라인드만 들어갔다 — 아직 아무도 액션하지 않았다</div>';
  return '<div class="acts">블라인드 뒤 프리플랍 액션<ol>' + acts.map(function (a) { return '<li>' + a.name + ' — ' + KIND_KO[a.kind] + '</li>'; }).join('') + '</ol></div>';
}

function openCall(c) {
  if (!c) return;
  G.current = c;   // 자동 점검용
  var t = G.tables[c.table], d = c.data;
  var head = '<div class="kicker red">플로어 호출 — ' + t.name + '</div>';
  if (c.type === 'pos') { openPosCall(c); return; }
  var title, body, choices, correct, why, cite;
  if (c.type === 'btn') {
    title = '버튼이 잘못 놓였다';
    body = '<p>손님: "버튼이 한 칸 지나쳤어요. 원래 ' + seatNo(d.shouldBe) + ' 차례예요." 확인해 보니 맞다.</p>' + actsHTML(d.acts);
    choices = ['미스딜 — 블라인드를 돌려주고 버튼을 바로잡아 다시 딜한다', '이 핸드는 그대로 진행하고, 다음 핸드부터 바른 자리로 돌린다', '버튼만 바른 자리로 옮기고 이 핸드를 이어 간다'];
    correct = d.sa ? 1 : 0;
    why = (d.sa ? '실질 액션이 이미 성립했다. 실질 액션 뒤에는 버튼 오류로 판을 되돌리지 않는다 — 그대로 가고 다음 핸드에 바로잡는다.'
      : '실질 액션 전이다. 버튼 오류는 바로잡는다 — 미스딜로 거두고 바른 위치에서 다시 딜한다.') + ' 판 도중에 버튼만 옮기는 처리는 없다.';
    cite = SRC.btn + '<br>' + SRC.sa;
    c.misdeal = !d.sa;
  } else if (c.type === 'cnt') {
    title = '카드 장수가 이상하다';
    body = '<p>딜러: "' + d.who + '(' + seatNo(d.seat) + ') 손님 카드가 <b>' + d.n + '장</b>입니다."</p>' + actsHTML(d.acts);
    choices = ['미스딜을 선언하고 다시 딜한다', d.who + '의 핸드만 데드로 걷고 핸드를 계속한다', '카드 장수를 맞춰 주고 핸드를 계속한다'];
    correct = d.sa ? 1 : 0;
    why = d.sa ? '실질 액션이 성립해 미스딜을 선언할 수 없다. 장수가 틀린 좌석만 데드로 처리하고 계속한다. 이미 낸 칩은 팟에 남고, 다음 스트릿 번 카드는 평소처럼 한 장.'
      : '실질 액션 전이다. 카드 장수 오류는 미스딜 사유다 — 거두고 다시 딜한다.';
    cite = SRC.cnt + '<br>' + SRC.sa;
    c.misdeal = !d.sa;
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
  showModal(head + '<h2>' + title + '</h2>' + body + '<div class="choices">' +
    choices.map(function (ch, i) { return '<button class="choice" data-ch="' + i + '">' + ch + '</button>'; }).join('') + '</div>');
  document.querySelectorAll('[data-ch]').forEach(function (b) {
    b.onclick = function () { verdict(c, +b.getAttribute('data-ch') === correct, why, cite, choices, correct, +b.getAttribute('data-ch')); };
  });
}

function verdict(c, ok, why, cite, choices, correct, pickIx, extra) {
  var t = G.tables[c.table];
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
    if (G.calls.indexOf(c) >= 0) resolveCall(c, ok ? 'right' : 'wrong');
  };
}

/* 버튼 · 블라인드 이의 — 좌석 지도에서 직접 놓는다 */
var MSEAT = [[30, 92], [6, 62], [12, 18], [50, 4], [88, 18], [94, 62]];
function openPosCall(c) {
  var t = G.tables[c.table], d = c.data;
  var st = { step: 0, btn: null, sb: null, bb: null };
  var keys = ['btn', 'sb', 'bb'], labels = ['버튼', '스몰 블라인드', '빅 블라인드'];
  function draw() {
    var mm = '<div class="minimap"><div class="felt"></div><div class="mdealer">딜러</div>';
    for (var i = 0; i < N; i++) {
      var nm = d.snap[i];
      var b = d.busted.filter(function (x) { return x.seat === i; })[0];
      var prevTag = [];
      if (d.prev.btn === i) prevTag.push('D');
      if (d.prev.sbSeat === i) prevTag.push('SB');
      if (d.prev.bb === i) prevTag.push('BB');
      var cls = 'mseat' + (nm ? '' : (b ? ' busted' : ' empty'));
      if (st.btn === i || st.sb === i || st.bb === i) cls += ' picked';
      mm += '<div class="' + cls + '" data-ms="' + i + '" style="left:' + MSEAT[i][0] + '%;top:' + MSEAT[i][1] + '%">' +
        '<span class="tg">' + seatNo(i) + '</span><b>' + (nm || (b ? b.name + ' 탈락' : '빈 자리')) + '</b>' +
        '<span class="tg">' + (prevTag.length ? '지난 핸드 ' + prevTag.join('·') : '&nbsp;') + '</span></div>';
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
    verdict(c, ok, why, SRC.dead, null, null, null, mine);
  }
  draw();
}

// ═══════════════════════════════════════════════════
// 오픈 준비 · 마감
// ═══════════════════════════════════════════════════
function titleScreen() {
  G.phase = 'title';
  showModal('<div class="kicker">하루 영업 슬라이스 · 프로토타입</div><h2>홀덤펍 점장</h2>' +
    '<p>오늘 밤 데일리 토너먼트를 연다. 딜러 셋, 홀 직원 하나, 테이블 둘. 손님은 문으로 들어와 등록하고, 탈락하면 리엔트리하거나 바에서 한잔하고 돌아간다.</p>' +
    '<p>당신은 점장이다. <b>테이블에서 플로어를 부를 때만</b> 들어가 판정한다. 맞는 판정은 평판을 올리고, 틀린 판정은 손님을 내보낸다. ' +
    '호출을 오래 내버려 두면 딜러가 알아서 처리하고 평판이 떨어진다.</p>' +
    '<p class="note">매출은 참가비와 음료뿐이다. 우승 상품은 트로피와 다음 대회 시드권 — 칩 환전과 현금 시상은 없다. ' +
    '판정 정답은 딜러마스터 TDA 케이스 문서를 따르며 원문 대조 전이다.</p>' +
    '<button class="cta" data-go="1">오픈 준비</button>');
  $('[data-go]').onclick = prepScreen;
}

var PREP = null;
function prepScreen() {
  G.phase = 'prep';
  if (!PREP) PREP = { fee: G.fee, assign: [0, 1, null], train: null };
  var dealers = DEALERS.map(function (d, i) {
    var acc = G.dealerState && G.dealerState[i] ? G.dealerState[i].acc : d.acc;
    var a = PREP.assign.indexOf(i);
    var segs = ['1번 테이블', '2번 테이블', '휴식'].map(function (lb, k) {
      var on = (k < 2 && PREP.assign[k] === i) || (k === 2 && a < 0);
      return '<button data-as="' + i + ':' + k + '" class="' + (on ? 'on' : '') + '">' + lb + '</button>';
    }).join('');
    return '<div class="card"><div class="nm">딜러 ' + d.name + '</div><div class="st">정확도 ' + Math.round(acc) + '<br>속도 ' + Math.round(d.speed * 100) + '<br>친절 ' + d.kind + '</div><div class="seg">' + segs + '</div>' +
      '<button class="cta ghost" style="width:100%;margin-top:8px;padding:6px" data-train="' + i + '">' + (PREP.train === i ? '교육 완료 ✓' : '교육 — 실질 액션 3문제') + '</button></div>';
  }).join('');
  var fees = FEES.map(function (f) {
    var hint = f === 20000 ? '손님 ↑ · 객단가 ↓' : (f === 30000 ? '보통' : '손님 ↓ · 객단가 ↑ · 리엔트리 ↓');
    return '<button data-fee="' + f + '" class="' + (PREP.fee === f ? 'on' : '') + '">' + won(f) + '원<br><small>' + hint + '</small></button>';
  }).join('');
  showModal('<div class="kicker">' + G.day + '일차 · 17:30 · 오픈 준비</div><h2>오늘 밤을 준비한다</h2>' +
    '<h3>데일리 토너먼트 참가비</h3><div class="seg">' + fees + '</div>' +
    '<p class="note" style="margin-top:6px">등록 · 리엔트리는 23:00 까지. 블라인드는 20분마다 오른다. 평판 ' + Math.round(G.rep) + '.</p>' +
    '<h3>딜러 배치</h3><div class="grid3">' + dealers + '</div>' +
    '<p class="note" style="margin-top:6px">휴식 중인 딜러는 영업 중에 테이블을 눌러 교대시킬 수 있다. 피로가 쌓이면 실수가 늘어 호출이 잦아진다. ' +
    '교육은 하루 한 명 — 당신이 문제를 맞힌 만큼 그 딜러의 정확도가 오른다.</p>' +
    '<button class="cta" data-open="1"' + (PREP.assign[0] === null || PREP.assign[1] === null ? ' disabled' : '') + '>영업 시작 — 18:00</button>', true);
  document.querySelectorAll('[data-fee]').forEach(function (b) { b.onclick = function () { PREP.fee = +b.getAttribute('data-fee'); prepScreen(); }; });
  document.querySelectorAll('[data-as]').forEach(function (b) {
    b.onclick = function () {
      var p = b.getAttribute('data-as').split(':'), i = +p[0], k = +p[1];
      if (k === 2) { var at = PREP.assign.indexOf(i); if (at >= 0 && at < 2) PREP.assign[at] = null; }
      else { var was = PREP.assign.indexOf(i); if (was >= 0 && was < 2) PREP.assign[was] = null; PREP.assign[k] = i; }
      prepScreen();
    };
  });
  document.querySelectorAll('[data-train]').forEach(function (b) {
    b.onclick = function () { if (PREP.train === null) trainDealer(+b.getAttribute('data-train')); };
  });
  $('[data-open]').onclick = function () { if (PREP.assign[0] !== null && PREP.assign[1] !== null) openDay(); };
}

/* 교육 — 실질 액션 세기 3 문제. 맞힌 만큼 딜러 정확도 +4 */
function trainDealer(i) {
  var qs = [], k;
  for (k = 0; k < 3; k++) {
    var n = pick([1, 2, 2, 3]), acts = [];
    for (var j = 0; j < n; j++) { var r = Math.random(); acts.push({ name: pick(NAMES), kind: r < 0.45 ? 'fold' : (r < 0.8 ? 'call' : (r < 0.9 ? 'check' : 'raise')) }); }
    if (acts.some(function (a) { return a.kind === 'check'; })) acts = acts.map(function (a) { return a.kind === 'check' ? { name: a.name, kind: 'fold' } : a; });
    qs.push({ acts: acts, sa: isSA(acts) });
  }
  var at = 0, right = 0;
  function ask() {
    var q = qs[at];
    showModal('<div class="kicker">교육 — 딜러 ' + DEALERS[i].name + ' · ' + (at + 1) + '/3</div><h2>실질 액션이 성립했나?</h2>' + actsHTML(q.acts) +
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
            G.dealerState = G.dealerState || DEALERS.map(function (d) { return { acc: d.acc }; });
            G.dealerState[i].acc = clamp(G.dealerState[i].acc + right * 4, 0, 98);
            PREP.train = i;
            toast('딜러 ' + DEALERS[i].name + ' 정확도 +' + right * 4);
            prepScreen();
          }
        };
      };
    });
  }
  ask();
}

function openDay() {
  G.fee = PREP.fee;
  closeModal();
  newDay();
  PREP.assign.forEach(function (di, k) {
    if (di === null || k > 1) return;
    var t = G.tables[k], d = G.dealers[di];
    t.dealer = di; d.table = k;
    walkTo(d, [dealerPos(t.def)], function () { faceTo(d, new THREE.Vector3(t.def.cx, 0, t.def.cz)); });
  });
  G.phase = 'open';
  log(G.day + '일차 영업 시작 — 참가비 ' + won(G.fee) + '원', 'hi');
  toast('18:00 — 영업 시작');
}

function closeDay() {
  if (G.finalized) return;
  G.finalized = true;
  G.phase = 'closed';
  G.customers.forEach(function (c) { if (c.alive) { G.stats.satSum += c.sat; G.stats.satN++; } });
  G.calls.forEach(function (c) { G.tables[c.table].call = null; });
  G.calls = [];
  renderCalls();
  var s = G.stats;
  var feeRev = s.entries * G.fee, drinkRev = s.drinks * DRINK_PRICE;
  var cost = WAGE.dealer * 3 + WAGE.staff + WAGE.ops;
  var net = feeRev + drinkRev - cost;
  var avgSat = s.satN ? s.satSum / s.satN : 70;
  G.rep = clamp(G.rep + (avgSat - 60) / 8, 0, 100);
  G.dealerState = G.dealers.map(function (d) { return { acc: d.acc }; });

  var reviews = [];
  if (s.right >= 3 && s.wrong === 0) reviews.push('“플로어가 룰 정리를 깔끔하게 해 줘서 믿고 친다.” ★★★★★');
  if (s.wrong > 0) reviews.push('“판정이 오락가락했다. 룰을 제대로 아는 사람이 있나?” ★★');
  if (s.missed > 0) reviews.push('“플로어를 불렀는데 아무도 안 왔다.” ★');
  if (s.lost > 0) reviews.push('“자리가 없어서 그냥 돌아왔다.” ★★');
  if (s.drinks > s.entries) reviews.push('“음료가 빨리 나온다. 분위기 좋다.” ★★★★');
  if (G.winner) reviews.push('“' + G.winner.name + ' 우승 축하! 트로피 멋지다.” ★★★★');
  if (!reviews.length) reviews.push('“무난한 하루였다.” ★★★');

  var rows = [
    ['참가비 ' + s.entries + '건 × ' + won(G.fee), feeRev],
    ['음료 ' + s.drinks + '잔 × ' + won(DRINK_PRICE), drinkRev],
    ['딜러 일당 × 3', -WAGE.dealer * 3],
    ['홀 직원 일당', -WAGE.staff],
    ['운영비 (임대 · 전기 · 기타)', -WAGE.ops]
  ];
  var h = '<div class="kicker">' + G.day + '일차 마감 · ' + clock(gameMin()) + '</div><h2>오늘의 정산</h2>' +
    '<table class="rows">' + rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + (r[1] < 0 ? '−' : '') + won(Math.abs(r[1])) + '</td></tr>'; }).join('') +
    '<tr class="total"><td>순이익</td><td>' + (net < 0 ? '−' : '') + won(Math.abs(net)) + '</td></tr></table>' +
    '<h3>플로어</h3><p>호출 ' + (s.right + s.wrong + s.missed) + '건 — 맞음 <b>' + s.right + '</b> · 틀림 <b>' + s.wrong + '</b> · 못 감 <b>' + s.missed + '</b>' +
    (s.angry ? ' · 화가 나서 나간 손님 ' + s.angry + '명' : '') + '</p>' +
    '<h3>손님</h3><p>평균 만족도 ' + Math.round(avgSat) + ' · 자리가 없어 돌아간 손님 ' + s.lost + '명 · 평판 ' + Math.round(s.repStart) + ' → <b>' + Math.round(G.rep) + '</b></p>' +
    '<p>' + (G.winner ? '우승 ' + G.winner.name + ' — 트로피와 다음 대회 시드권' : '마감까지 결판이 나지 않았다 — 남은 사람들은 다음 대회 시드권') + '</p>' +
    '<h3>후기</h3><p>' + reviews.join('<br>') + '</p>' +
    '<button class="cta" data-next-day="1">다음 날 영업 준비</button> <button class="cta ghost" data-restart="1">처음부터</button>';
  showModal(h, true);
  $('[data-next-day]').onclick = function () { G.day++; PREP = null; prepScreen(); };
  $('[data-restart]').onclick = function () { G.day = 1; G.rep = 50; G.dealerState = null; PREP = null; G.money = 0; titleScreen(); };
  G.money = 0;
}

// ── 시작 ────────────────────────────────────────────
initScene();
newDay();
titleScreen();
requestAnimationFrame(frame);
})();
