/* ═══════════════════════════════════════════════════════
   홀덤펍 점장 1.0
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

var WAGE = { dealer: 150000, staff: 120000, counter: 110000, cleaner: 100000, ops: 120000 };
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
  { id: 'interior', ko: '인테리어 리뉴얼', price: 900000, desc: '벽가 화분 · 테이블 조명 · 밝은 마감. 손님 도착 +15%, 만족도 감소 −30% (테마 · 장식은 「꾸미기」 탭)' },
  { id: 'shuffler', ko: '자동 셔플러', price: 700000, desc: '딜러 피로 누적 −35%, 핸드 속도 +10%' },
  { id: 'mic', ko: '자동 방송 시스템', price: 600000, desc: '블라인드 업 안내를 자동으로 — 레지 마감 · 파이널은 여전히 직접' },
  { id: 'bar', ko: '바 좌석 확장', price: 500000, desc: '대기 · 음료 좌석 7 → 10' },
  { id: 'coffee', ko: '커피 머신', price: 400000, desc: '음료 구매율 +20% — 비싼 가격의 손해를 줄인다' },
  { id: 'table3', ko: '3번 테이블', price: 1600000, desc: '좌석 +6, 손님 +28%. 딜러가 셋은 있어야 하고, 교대하려면 넷' },
  { id: 'mix', ko: '믹스게임 테이블 (PLO8)', price: 1200000, desc: '2번 테이블을 PLO8 로 — 고수 손님 ↑, 앉을 때 믹스 참가비 +1만. 믹스 자격(판정 교육 2단계) 딜러가 없으면 사고 2배' }
];
var MIX_TABLE = 1, MIX_FEE = 10000;
function isMix(t) { return !!G.owned.mix && t.id === MIX_TABLE; }

var CUST_TYPES = {
  regular: { ko: '친근', color: 0x3B6FB6, w: 0.3, reentry: 0.6, drink: 1.3,
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
/* 직원 — 역할마다 정원과 일당 공식이 있다. 능력이 높을수록 일당이 비싸다 */
var ROLES = {
  dealer: { ko: '딜러', max: 5, base: 120000, per: 1600, desc: '테이블을 맡는다. 정확도가 높으면 실수(호출)가 적다' },
  server: { ko: '홀 서버', max: 2, base: 90000, per: 1000, desc: '음료를 판다. 능력이 높으면 빠르고 잘 판다' },
  counter: { ko: '카운터', max: 1, base: 90000, per: 1000, desc: '등록 줄을 처리한다. 점장이 카운터를 비워도 된다' },
  cleaner: { ko: '청소', max: 1, base: 80000, per: 800, desc: '쏟아진 음료를 알아서 치운다' },
  floor: { ko: '플로어 보조', max: 1, base: 130000, per: 2000, desc: '아나운스 · 밸런싱 · 청소를 대신한다. 판정 호출은 점장 몫' }
};
function wageOf(role, skill) { var r = ROLES[role]; return Math.round((r.base + Math.max(0, skill - 50) * r.per) / 10000) * 10000; }
var STAFF_NAMES = ['도윤', '서아', '예준', '지우', '시우', '하은', '주원', '수아', '건우', '지유', '우진', '채원',
  '선우', '윤서', '연우', '다은', '유준', '소율', '정우', '예린', '하윤', '로운', '이안', '나은'];
function startRoster() {
  return [
    { id: 1, name: '민준', role: 'dealer', skill: 86, speed: 0.95, days: 0, rel: 0.95, trait: 'careful' },
    { id: 2, name: '서연', role: 'dealer', skill: 74, speed: 1.15, days: 0, rel: 0.88, trait: 'fast' },
    { id: 3, name: '지호', role: 'dealer', skill: 63, speed: 1.05, days: 0, rel: 0.93, trait: 'fragile' },
    { id: 4, name: '다온', role: 'server', skill: 62, days: 0, rel: 0.9, trait: 'chatty' }
  ].map(function (x) { x.wage = wageOf(x.role, x.skill); x.morale = 70; return x; });
}
/* 직원 특성 — 직원 · 지원자에 0~1개 */
var TRAITS = {
  fast: { ko: '손이 빠름', ic: '⚡', desc: '속도 +15%' },
  careful: { ko: '꼼꼼함', ic: '🔍', desc: '정확도 +5' },
  chatty: { ko: '수다쟁이', ic: '💬', desc: '응대 만족 +, 조금 느림' },
  late: { ko: '지각 잦음', ic: '⏰', desc: '출근율 −8%p' },
  fragile: { ko: '멘탈 약함', ic: '🥲', desc: '자기 테이블 오판정 때 사기 −8' },
  mood: { ko: '분위기 메이커', ic: '🎉', desc: '주변 손님 만족이 서서히 오른다' }
};
function hasT(st, t) { return !!st && st.trait === t; }
function rollTrait() { return chance(0.55) ? pick(Object.keys(TRAITS)) : null; }
/* 교육 트리 — 판정 · 속도 · 응대 0~3단계. 판정 2단계부터 믹스게임 자격 */
var TRAIN = {
  j: { ko: '판정', desc: '실질 액션 퀴즈 · 단계마다 정확도 +3' },
  s: { ko: '속도', desc: '칩 합계 퀴즈 · 단계마다 진행 속도 +5%' },
  v: { ko: '응대', desc: '손님 응대 퀴즈 · 단계마다 테이블 만족이 서서히 오른다' }
};
function trainOf(st) { if (!st.train) st.train = { j: 0, s: 0, v: 0 }; return st.train; }
/* 교육 말고도 오르는 길 — 실전 경험치(100 이면 한 단계) · 멘토 · 세미나 */
var XP_LV = 100, SEMINAR_COST = 300000;
function xpOf(st) { if (!st.xp) st.xp = { j: 0, s: 0, v: 0 }; return st.xp; }
/* 경험치를 더하고, 100 을 넘으면 단계를 올린다. 올랐으면 true */
function addXP(st, k, n) {
  if (!st || st.role !== 'dealer' || st.temp) return false;
  var tr = trainOf(st), xp = xpOf(st);
  if (tr[k] >= 3) { xp[k] = 0; return false; }
  xp[k] += n;
  if (xp[k] < XP_LV) return false;
  tr[k]++; xp[k] = tr[k] >= 3 ? 0 : xp[k] - XP_LV;   // 넘친 경험은 다음 단계로 이어진다
  (G.grownToday = G.grownToday || []).push(st.name + ' ' + TRAIN[k].ko + ' ' + tr[k] + '단계' + (k === 'j' && tr[k] === 2 ? ' 🃏' : ''));
  toast('🎓 ' + st.name + ' — ' + TRAIN[k].ko + ' ' + tr[k] + '단계! (실전 경험)');
  return true;
}
/* 난이도 — 1일차 0 에서 6주(42일)에 걸쳐 1 까지 조금씩 오른다 */
function diffK() { return Math.min(1, Math.max(0, (G.day - 1) / 42)); }
function diffLv() { return 1 + Math.min(5, Math.floor(diffK() * 5 + 1e-9)); }
function mixOk(st) { return trainOf(st).j >= 2; }
/* 사기가 60 아래면 정확도 · 속도가 떨어진다 */
function moralePen(st) { var m = st && st.morale != null ? st.morale : 70; return m < 60 ? 60 - m : 0; }
function staffSpd(st) { return (hasT(st, 'fast') ? 1.15 : 1) * (hasT(st, 'chatty') ? 0.88 : 1) * (1 - moralePen(st) * 0.004); }
function relOf(st) {
  var r = st.rel != null ? st.rel : 0.92;
  if (hasT(st, 'late')) r -= 0.08;
  if ((st.morale != null ? st.morale : 70) < 35) r -= 0.15;
  return clamp(r, 0.3, 1);
}
var SRC = {
  sa: '케이스 6 · Rule 36 (실질 액션) — 블라인드를 빼고, 차례대로 나온 액션 둘 중 하나라도 칩이 들어갔거나 액션이 셋이면 실질 액션',
  btn: '케이스 5 · Rule 34-A (버튼 위치와 이동)',
  cnt: '케이스 6 · Rule 35-D · 36 · 38 (미스딜 · 실질 액션 · 번 카드)',
  under: '케이스 19 · Rule 52-A (언더레이즈 정정 시점)',
  dead: '토너먼트 데드 버튼 규칙'
};
/* ═══ 케이스 판정 — 딜러마스터 TDA 케이스 문서(05 · 11번) 30건 중 동적 판정(5 · 6 · 19)을 뺀 27건 ═══
   상황 · 질문 · 선택지 · 정답 · 근거 · 해설은 문서 그대로(문장만 다듬음). ch[0] 이 정답 — 낼 때 섞는다.
   {A}~{E} 는 그 테이블 손님 이름. nlh: 노리밋 전용 — 믹스(PLO8) 테이블에서는 내지 않는다. 전부 「원문 확인 전」 */
var CASES = [
  { n: 1, tag: '올인 쇼다운 타이밍', title: '카드를 지금 다 열어도 되나?', nlh: true,
    sit: '셋이 남은 핸드. 프리플랍에서 숏스택 {A}가 올인, {B}와 {C}가 콜. 플랍은 체크 체크. 턴에서 {B}가 올인, {C}가 콜했다. 딜러가 세 사람 카드를 곧바로 모두 열려고 한다.',
    q: '지금 세 사람 카드를 모두 여는 것이 맞나?',
    ch: ['맞다 — 더 이상 베팅 액션이 없으니 지체 없이 모두 연다', '아니다 — 리버까지 딜한 뒤 쇼다운에서 한 번에 연다', '아니다 — {A}의 카드는 사이드팟을 나눌 때까지 뒷면으로 둔다'],
    rule: 'Rule 16 (Face Up for All-Ins) · Illustration 예시 2', why: '베팅 액션이 완전히 끝난 시점(턴 올인 · 콜)에 지체 없이 모든 카드를 연다. 쇼다운까지 기다리거나 일부만 뒷면으로 두는 것은 규정 위반이다.' },
  { n: 2, tag: '다수 칩 벳', title: '콜인가 레이즈인가?', nlh: true,
    sit: '포스트플랍에서 {A}가 1,050 을 오픈 벳했다. {B}가 마지막 칩(1,000 짜리 두 개, 2,000)을 아무 말 없이 앞으로 밀었다. 「레이즈」도 「올인」도 말하지 않았다.',
    q: '{B}의 액션은?',
    ch: ['콜 — 칩 하나를 빼도 1,050 에 못 미친다', '레이즈 — 콜보다 많이 냈으니 2,000 전액', 'TD 재량 — 마지막 칩이었으니 사정을 본다'],
    rule: 'Rule 45-A (Multiple Chip Betting)', why: '선언 없이 낸 다수 칩은, 칩 하나를 빼면 콜 금액에 못 미치는 경우 콜이다. 1,000 하나를 빼면 1,000 이라 1,050 에 못 미친다 — 콜. 마지막 칩이었다는 사실은 무관하고, 선언이 없었다는 게 핵심이다.' },
  { n: 3, tag: '오픈 벳 언더콜', title: '모자란 칩으로 콜했다', nlh: true,
    sit: '포스트플랍, 넷 중 {A}가 첫 벳으로 8,000 을 냈다. {B}가 아무 말 없이 2,000 칩만 앞으로 밀었다.',
    q: '{B}는 어떻게 처리하나?',
    ch: ['무조건 8,000 전액 콜로 처리한다', 'TD 재량으로 콜/폴드를 정한다', '2,000 만 인정하고 나머지는 폴드 처리'],
    rule: 'Rule 51-B (Undercalls in Turn)', why: '그 라운드의 첫 벳(오픈 벳)에 대한 언더콜은 TD 재량이 아니라 무조건 전액 콜이다. 재량이 적용되는 건 오픈 벳이 아닌 경우다.' },
  { n: 4, tag: '최소 레이즈 계산', title: '최소 얼마까지 올려야 하나?', nlh: true,
    sit: '블라인드 100-200, 포스트플랍. {A}가 600 오픈, {B}가 1,000 레이즈(총 1,600), {C}가 2,000 리레이즈(총 3,600). {D}가 레이즈하고 싶다며 묻는다.',
    q: '{D}의 최소 레이즈 총액은?',
    ch: ['총 5,600 — 직전 레이즈분 2,000 을 더한다', '총 7,200 — 직전 총 벳 3,600 의 두 배', '총 4,200 — 최소 단위 600 을 더한다'],
    rule: 'Rule 43-A (Raise Amounts) · Illustration 예시 1', why: '레이즈는 이번 라운드에서 지금까지 나온 가장 큰 벳 · 레이즈 「분」 이상이어야 한다. 그 금액은 {C}의 레이즈분 2,000(총액 3,600 이 아님). 3,600 + 2,000 = 5,600.' },
  { n: 7, tag: '핸드 공개 요청 권리', title: '누가 카드 공개를 요구할 수 있나?',
    sit: '리버에서 {A} 벳, {B} 콜, {C} 레이즈, {D} · {A} · {B} 모두 콜. 올인은 없다. {B}가 먼저 트립스를 보였고, {D}는 카드를 뒷면으로 버려 먹 처리됐다. {C}가 카드를 뒷면으로 밀기 시작한다.',
    q: '{C}의 카드 공개를 요구할 권리가 있는 사람은?',
    ch: ['{A}와 {B} 둘 다 — 양도할 수 없는 권리', '{B}만 — 먼저 카드를 보인 사람의 권리', '{A} · {B} · {D} 모두 — 리버에서 콜했으니'],
    rule: 'Rule 18-B · Illustration 예시 2', why: '리버에 벳이 있었고 {C}가 마지막 어그레서다. 카드를 아직 가졌거나 보인 콜러({A} · {B})는 「돈을 내고 볼」 권리가 있다. {D}는 카드를 버려 권리를 포기했다 — 콜했다는 사실만으로는 유지되지 않는다.' },
  { n: 8, tag: '순서 위반 액션', title: '차례를 건너뛰고 콜했다', nlh: true,
    sit: '{A}가 600 레이즈. 다음 차례는 {B}인데, 그 옆 {C}가 {B}를 건너뛰고 600 콜. 이어서 {D}는 고민하다 폴드. 그동안 {B}는 아무 말도 하지 않았다.',
    q: '{C}의 콜과 {D}의 폴드는 유효한가?',
    ch: ['둘 다 구속력 있다 — 건너뛴 {B}의 핸드는 플로어가 정한다', '둘 다 무효 — 칩을 돌려주고 건너뛴 {B}부터 다시 진행한다', '{C}의 콜만 무효 — 폴드는 되돌릴 수 없으니 그대로 유효하다'],
    rule: 'Rule 53-B (Action Out of Turn)', why: '칩이 들어간 액션을 포함한 두 사람의 순차 액션으로 실질 액션이 성립했고, {B}는 말할 시간이 있었는데 침묵했다. 순서 위반 액션은 구속력을 가지며, {B}의 핸드 처리는 플로어가 판단한다.' },
  { n: 9, tag: '신원 확인', title: '얼굴을 가린 손님',
    sit: '{A}가 얼굴을 가리는 큰 후드를 쓰고 앉아 있다. {B}가 항의한다.',
    q: '플로어의 대응은?',
    ch: ['벗어 달라고 요청할 수 있다', '복장은 자유라 요청할 수 없다', '경고 없이 바로 페널티를 준다'],
    rule: 'Rule 4', why: '신원 확인을 방해하거나 다른 참가자에게 방해가 되는 차림은 벗어 달라고 요청할 수 있다.' },
  { n: 10, tag: '전자기기 사용', title: '핸드 중 휴대폰',
    sit: '라이브 핸드를 가진 {A}가 휴대폰으로 문자를 확인하고 있다. {B}가 플로어를 부른다.',
    q: '규정 위반인가?',
    ch: ['위반 — 라이브 핸드 중에는 전자기기를 쓸 수 없다', '문제없다 — 통화만 안 하면 문자 확인 정도는 괜찮다', '문제없다 — 소리만 안 나면 어떤 기기를 써도 된다'],
    rule: 'Rule 5-C', why: '라이브 핸드를 가진 플레이어는 전자 · 통신 기기를 쓸 수 없다. 통화 여부와 무관하게 위반이다.' },
  { n: 11, tag: '자리 이탈', title: '딜할 때 자리에 없었다',
    sit: '최초 딜의 마지막 카드가 돌아가는 순간 {A}가 화장실에 가 있었다. 돌아와 카드를 보려 한다.',
    q: '{A}의 핸드는?',
    ch: ['즉시 먹 처리 — 블라인드 · 앤티는 팟으로 몰수', '살아 있다 — 액션 전에 돌아왔으니 카드를 본다', '이번 핸드만 쉰다 — 블라인드는 돌려준다'],
    rule: 'Rule 30', why: '최초 딜의 마지막 카드가 돌아갈 때 자리에 없으면 카드를 볼 수 없고 즉시 먹 처리된다. 블라인드 · 앤티는 몰수.' },
  { n: 12, tag: '헤즈업 액션 순서', title: '둘만 남았다 — 누가 먼저?', nlh: true,
    sit: '테이블에 {A}와 {B} 둘만 남아 헤즈업이 시작됐다. {A}가 스몰 블라인드다. {B}가 액션 순서를 묻는다.',
    q: '스몰 블라인드 {A}의 액션 순서는?',
    ch: ['프리플랍은 먼저, 이후 라운드는 마지막', '모든 라운드에서 먼저 — 블라인드라서', '모든 라운드에서 마지막 — 버튼이라서'],
    rule: 'Rule 34-B', why: '헤즈업에서 스몰 블라인드는 버튼을 겸하고 마지막 카드를 받는다. 프리플랍은 먼저, 이후 라운드는 마지막에 액션한다.' },
  { n: 13, tag: '카드 부족을 알고 액션', title: '카드가 모자란데 체크했다',
    sit: '버튼 {A}가 자기 카드가 한 장 모자란 걸 알았는데, 말하지 않고 체크했다. 뒤늦게 {B}가 이를 지적했다.',
    q: '{A}의 핸드는?',
    ch: ['먹 처리 — 말하지 않고 체크한 순간 끝났다', '계속 — 모자란 카드를 덱에서 한 장 더 받는다', '미스딜 — 카드가 모자라니 핸드 전체를 다시 딜한다'],
    rule: 'Rule 37', why: '카드가 모자란 걸 알면서 체크나 벳으로 액션하면 그 핸드는 먹 처리된다. 즉시 알렸다면 게임에 따라 보충이 가능했다.' },
  { n: 14, tag: '구두 선언 · 칩 모순', title: '말한 금액과 낸 칩이 다르다',
    sit: '리버 헤즈업. {A}가 「사만 이천」이라고 말했지만 5,000 칩 하나만 밀었다. 테이블 사람들이 선언을 다 듣지 못했다.',
    q: '벳 금액은 어떻게 정하나?',
    ch: ['TD 가 상황을 보고 가장 공정하게 정한다', '구두 선언 42,000 — 말이 칩보다 우선한다', '낸 칩 5,000 — 칩이 말보다 우선한다'],
    rule: 'Rule 40-A', why: '구두 선언과 칩이 모순되고 상황이 불분명하면 TD 가 공정성 우선 원칙으로 판단한다. 어느 한쪽이 무조건 우선하지 않는다.' },
  { n: 15, tag: '오버칩 하나', title: '큰 칩 하나를 조용히 냈다',
    sit: '벳을 마주한 {A}가 「레이즈」라고 말하지 않고, 콜 금액보다 큰 칩 하나를 조용히 밀었다.',
    q: '{A}의 액션은?',
    ch: ['콜 — 레이즈 선언이 없었다', '레이즈 — 콜보다 큰 칩을 냈다', 'TD 재량 — 의도를 물어보고 정한다'],
    rule: 'Rule 44', why: '레이즈를 먼저 선언하지 않고 큰 칩 하나를 조용히 내면 콜이다. 레이즈하려면 칩이 테이블에 닿기 전에 「레이즈」라고 말해야 한다.' },
  { n: 16, tag: '칩 부분 회수', title: '낸 칩 일부를 다시 가져갔다',
    sit: '레이즈를 마주한 {A}가 이미 낸 칩 중 일부만 회수하고 새 칩을 더했다.',
    q: '처리 원칙은?',
    ch: ['다수 칩 벳 규칙(50% 기준)을 적용한다', '회수했으니 금액과 상관없이 항상 콜로 처리한다', '새 칩을 더했으니 금액과 상관없이 레이즈로 본다'],
    rule: 'Rule 46-C', why: '부분 회수는 콜 금액을 넘는지와 상관없이 다수 칩 벳 규칙(50% 기준)을 적용한다 — 50% 이상이면 레이즈, 미만이면 콜.' },
  { n: 17, tag: '숏 올인 재오픈', title: '다시 레이즈할 수 있나?', nlh: true,
    sit: '{A} 100 오픈, {B} 총 125 올인(+25), {C} 125 콜, {D} 총 200 올인(+75), {E} 200 콜. {A}에게 다시 차례가 왔다.',
    q: '{A}는 레이즈할 수 있나?',
    ch: ['가능 — {B} · {D}의 증가분 합(100)이 최소 레이즈를 채운다', '불가능 — 25 · 75 각각이 최소 레이즈에 못 미치니 다시 열 수 없다', 'TD 재량 — 숏 올인이 두 번이라 그때그때 상황을 보고 정한다'],
    rule: 'Rule 47 · Illustration 예시 1', why: '증가분 25 · 75 는 각각 완전한 레이즈가 아니지만 합치면 100 으로 최소 레이즈(100)를 채운다. {A}에게 폴드 · 콜 · 레이즈가 모두 다시 열린다.' },
  { n: 18, tag: '인정된 액션', title: '딜러가 금액을 잘못 알려 줬다',
    sit: '{A}가 콜하기 전에 딜러에게 금액을 물었는데 딜러가 잘못 알려 줬고, {A}는 그 금액대로 콜했다. 나중에 틀린 게 밝혀졌다.',
    q: '어떻게 처리하나?',
    ch: ['{A}는 실제 벳 금액을 내야 한다 (인정된 액션)', '딜러가 잘못 알려 줬으니 {A}는 들은 금액만 내면 된다', '잘못된 정보로 한 액션이니 이 핸드 자체를 무효로 한다'],
    rule: 'Rule 49', why: '콜러가 카운트를 요청해 잘못된 정보를 듣고 그에 맞춰 콜했어도, 인정된 액션 원칙에 따라 실제 벳 금액 전체를 내야 한다.' },
  { n: 20, tag: '팟 카운트 요청', title: '「팟이 얼마예요?」', nlh: true,
    sit: '노리밋 홀덤 테이블에서 {A}가 딜러에게 「팟이 얼마냐」고 카운트를 요청했다. 딜러가 플로어를 본다.',
    q: '딜러는 응해야 하나?',
    ch: ['아니다 — 팟 카운트 요청 권리는 팟 리밋 게임에만 있다', '그렇다 — 어느 게임이든 팟 크기는 언제든 물어볼 수 있다', 'TD 가 승인할 때만 — 딜러 혼자 정하지 않고 플로어를 부른다'],
    rule: 'Rule 54-A', why: '팟 카운트를 요청할 권리는 팟 리밋 게임에만 있다. 리밋 · 노리밋에서는 딜러가 팟을 카운트하지 않는다.' },
  { n: 21, tag: '스트링 벳', title: '벳한 뒤 칩을 더 가져왔다',
    sit: '{A}가 칩을 앞으로 밀어 벳한 뒤, 자기 스택으로 돌아가 칩을 더 가져와 벳에 보탰다. {B}가 항의한다.',
    q: '허용되나?',
    ch: ['안 된다 — 이건 스트링 벳이다', '된다 — 마지막에 민 금액이 벳이다', 'TD 재량 — 항의가 있을 때만'],
    rule: 'Rule 56', why: '벳한 뒤 칩을 더 가져오려고 스택으로 돌아가는 동작은 스트링 벳으로 금지된다.' },
  { n: 22, tag: '불분명한 벳 선언', title: '「벳, 다섯 개」', nlh: true,
    sit: '블라인드 200-400, 팟은 5,000 미만. {A}가 「벳, 다섯 개」라고만 말했다. 다른 설명은 없었다.',
    q: '벳 금액은?',
    ch: ['500 — 팟보다 클 수 없으니 작은 쪽', '5,000 — 「다섯 개」는 큰 칩 다섯 개', 'TD 재량 — 다시 말하게 하고 정한다'],
    rule: 'Rule 57', why: '선언이 여러 뜻으로 읽히면 벳 전 팟보다 작거나 같은 가장 큰 합리적 금액으로 본다. 팟이 5,000 미만이므로 500.' },
  { n: 23, tag: '벳 없는 폴드', title: '체크할 수 있는데 폴드했다',
    sit: '포스트플랍에서 첫 액션 차례인 {A}가 체크 대신 「폴드」라고 했다. 곧바로 「아 체크요」라고 말을 바꾼다.',
    q: '이 폴드는?',
    ch: ['구속력 있는 폴드 — 페널티 대상일 수 있다', '무효 — 다시 체크 · 벳을 고를 수 있다', '자동으로 체크 — 벳이 없으니 폴드할 이유가 없다'],
    rule: 'Rule 58', why: '벳이 없는 상황(첫 액션 · 체크만 마주한 상황)의 폴드도 구속력이 있고 페널티 대상이 될 수 있다.' },
  { n: 24, tag: '정밀 카운트 요청', title: '상대 스택을 정확히 세 달라',
    sit: '{B}의 올인을 마주한 {A}가 자기 차례에 {B} 스택의 정밀 카운트를 요청했다.',
    q: '정당한 요청인가?',
    ch: ['정당하다 — 지금 같은 때만 요청할 수 있다', '언제든 된다 — 상대 스택은 공개 정보다', '안 된다 — 정밀 카운트는 딜러만 한다'],
    rule: 'Rule 60', why: '정밀 카운트는 올인 벳을 마주하고 자기 차례일 때만 요청할 수 있다. 그 밖에는 합리적인 추정 권리만 있다.' },
  { n: 25, tag: '거스름 예상 오버벳', title: '거스름돈을 바라고 냈다', nlh: true,
    sit: '오픈 벳이 325 인데 {A}가 200 거스름을 바라고 525(500 칩 + 25 칩)를 아무 말 없이 밀었다.',
    q: '{A}의 액션은?',
    ch: ['다수 칩 벳 규칙에 따라 650 레이즈', '325 콜로 보고 200 을 돌려준다', '525 콜 — 거스름은 다음 액션에서 맞춘다'],
    rule: 'Rule 61', why: '조용히 낸 칩은 모두 벳에 들어갈 수 있다. 525 는 다수 칩 벳 규칙(Rule 45)으로 650 레이즈가 된다 — 거스름을 바라고 벳해서는 안 된다.' },
  { n: 26, tag: '숨은 칩', title: '올인 뒤에 칩이 또 나왔다',
    sit: '{A}가 올인했고 {B}가 콜한 뒤, {A} 앞에 숨어 있던 칩이 더 발견됐다.',
    q: '이 칩은 액션에 들어가나?',
    ch: ['TD 가 액션의 일부인지 판단 — 아니면 {A}는 이겨도 못 받는다', '자동으로 올인 금액에 들어간다 — {A}의 칩이었으니 전부 걸린 것', '자동으로 무효 — 핸드가 끝나면 {A}에게 그대로 돌려준다'],
    rule: 'Rule 62', why: '숨은 칩이 액션의 일부인지는 TD 가 판단한다. 액션의 일부가 아니면 {A}는 이겨도 그 금액을 받지 못하고, 져도 그 칩으로 살아남지 못한다.' },
  { n: 27, tag: '실수로 먹 처리된 핸드', title: '딜러가 카드를 걷어 버렸다',
    sit: '쇼다운을 기다리는데 딜러가 실수로 {A}의 핸드를 먹 처리했다. 어느 카드였는지 100% 가려낼 수 없다.',
    q: '{A}는 구제받을 수 있나?',
    ch: ['구제 불가 — 콜 안 된 벳 · 레이즈만 돌려받는다', '딜러 실수이니 {A}가 넣은 칩을 전액 돌려받는다', '미스딜로 보고 이 핸드를 처음부터 다시 한다'],
    rule: 'Rule 65-A', why: '100% 식별할 수 없으면 바로잡을 수 없다. 다만 아직 콜되지 않은 자기 벳 · 레이즈는 돌려받는다.' },
  { n: 28, tag: '헬리콥터 폴드', title: '카드를 던지며 폴드했다',
    sit: '마지막 차례인 {A}가 폴드하면서 카드를 높이 던졌다(「헬리콥터」). {B}가 불쾌해한다.',
    q: '어떻게 보나?',
    ch: ['페널티 대상 — 폴드 자체는 유효하다', '핸드 자체가 무효 — 다시 딜한다', '폴드했으니 문제없다 — 넘어간다'],
    rule: 'Rule 68', why: '카드를 높이 들거나 던지는 행위는 페널티 대상이지만 폴드는 유효하다. 페널티는 핸드가 끝난 시점부터 시작한다.' },
  { n: 29, tag: '미스라운드 페널티', title: '몇 핸드를 쉬나?',
    sit: '9인 테이블에서 {A}가 미스라운드 페널티 1라운드를 받았다. {A}가 몇 핸드 쉬느냐고 묻는다.',
    q: '{A}는 몇 핸드를 쉬나?',
    ch: ['9 핸드 — 테이블 인원 × 페널티 라운드', '1 핸드 — 1라운드는 한 핸드다', '버튼이 한 바퀴 돌 때까지 — 인원과 무관'],
    rule: 'Rule 71-A', why: '미스라운드 페널티는 (자신을 포함한 테이블 인원) × (페널티 라운드 수) 핸드만큼 쉰다. 9인 · 1라운드 = 9핸드.' },
  { n: 30, tag: '소프트플레이', title: '서로 봐주는 것 같다',
    sit: '{A}와 {B}가 일부러 약하게 플레이하며 서로 봐주는 정황이 보인다. {C}가 항의한다.',
    q: '페널티는 TD 재량인가?',
    ch: ['아니다 — 소프트플레이는 무조건 페널티', '그렇다 — 정황을 보고 TD 가 정한다', '첫 위반은 경고만 — 두 번째부터 페널티'],
    rule: 'Rule 71-B', why: '소프트플레이 · 폭력적 언행 · 진행 방해 · 블라인드 회피 · 부정행위는 TD 재량이 아니라 무조건 페널티다.' }
];
var CASES_BY = {};
CASES.forEach(function (c) { CASES_BY[c.n] = c; });
var JOSA = { '가': ['이', '가'], '는': ['은', '는'], '와': ['과', '와'], '를': ['을', '를'] };
/* {A}~{E} → 이름. 바로 뒤 조사(가 · 는 · 와 · 를)는 받침에 맞춰 바꾼다 — 김도현이 · 송지아가 */
function fillNames(s, names) {
  return s.replace(/\{([A-E])\}(가|는|와|를)?/g, function (m, k, j) {
    var w = names['ABCDE'.indexOf(k)];
    return w + (j ? josa(w, JOSA[j][0], JOSA[j][1]) : '');
  });
}
/* 이 테이블에서 낼 케이스 하나 — 최근에 낸 것은 피한다 */
function genCase(t) {
  var pool = CASES.filter(function (c) { return !(c.nlh && isMix(t)); });
  var fresh = pool.filter(function (c) { return (G.recentCases || []).indexOf(c.n) < 0; });
  var c = pick(fresh.length ? fresh : pool);
  G.recentCases = (G.recentCases || []).concat([c.n]).slice(-12);
  var names = shuffle(t.seats.filter(function (x) { return x !== null; }).map(function (id) { return G.customers[id].name; }));
  var extra = shuffle(NAMES.filter(function (n) { return names.indexOf(n) < 0; }));
  while (names.length < 5) names.push(extra.pop());
  return { id: c.n, names: names, order: shuffle([0, 1, 2]) };
}
/* 상황 글 — 폰에서 읽기 쉽게 한 문장씩 줄로 */
function sceneHtml(text) {
  var lines = (text.match(/[^.?!]+(?:[.?!]+|$)/g) || [text]).map(function (x) { return x.trim(); }).filter(Boolean);   // 마침표 · 물음표 · 느낌표에서 끊는다
  return '<div class="scene">' + lines.map(function (x) { return '<p>' + x + '</p>'; }).join('') + '</div>';
}
/* 판정 도감 — 맞힌 케이스 번호를 기록에 남긴다(시즌이 바뀌어도 남는다) */
function caseDex() { var r = loadRecords(); return (Array.isArray(r.cases) ? r.cases : []).filter(function (n) { return !!CASES_BY[n]; }); }
function markCase(n) {
  var r = loadRecords(), got = caseDex();
  if (!CASES_BY[n] || got.indexOf(n) >= 0) return 0;
  r.cases = got.concat([n]);
  try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) { return 0; }   // 저장이 막히면 +1 도 띄우지 않는다
  return r.cases.length;
}
function openDex(back) {
  var got = caseDex();
  showModal('<div class="kicker">판정 도감 · ' + got.length + ' / ' + CASES.length + '</div><h2>📚 맞혀 본 케이스</h2>' +
    '<p class="note">영업 중 플로어 호출로 나온 케이스를 맞히면 채워진다. 근거는 TDA 케이스 문서 — 원문 확인 전.</p>' +
    '<div class="dexgifts">' + [9, 18, 27].map(function (k) { return '<span class="' + (got.length >= k ? 'on' : '') + '"><b>' + k + '</b> ' + DEX_GIFTS[k].t.split(' — ')[0] + '</span>'; }).join('') + '</div>' +
    '<div class="dex">' + CASES.map(function (c) {
      var ok = got.indexOf(c.n) >= 0;
      return '<div class="dexc' + (ok ? ' got' : '') + '"><span class="no">' + c.n + '</span><b>' + (ok ? c.tag : '？') + '</b><small>' + (ok ? c.rule.split(' (')[0].split(' ·')[0] : '아직') + '</small></div>';
    }).join('') + '</div>' +
    '<div class="titlebtns"><button class="cta" data-back="1">돌아가기</button></div>');
  $('[data-back]').onclick = back;
}
/* ⚡ 빠른 판정 — 판정 창 위에 줄어드는 막대. 실제 시간으로 잰다(판정 중 시뮬레이션은 멈춰 있다).
   시간은 글 길이에 맞춘다 — 읽을 시간은 준다 */
var QUICK_BONUS = 0.3;
function quickSecs(html) { return Math.round(6 + html.replace(/<[^>]+>/g, '').length / 18); }
function startQuickBar(secs, onEnd) {
  var t0 = performance.now(), last = t0, bar = $('.qbar i'), lab = $('.qbar span'), box = { t0: t0 };
  (function step() {
    if (!bar || !bar.isConnected) return;   // 창이 닫혔거나 바뀌었다
    var nowT = performance.now();
    if (nowT - last > 1000) { t0 += nowT - last; box.t0 = t0; }   // 화면이 꺼졌던 시간(앱 전환 · 잠금)은 세지 않는다
    last = nowT;
    var left = Math.max(0, secs - (performance.now() - t0) / 1000);
    bar.style.width = (left / secs * 100) + '%';
    if (lab) lab.textContent = left > 0 ? '⚡ ' + Math.ceil(left) + '초' : '⚡ 시간 끝';
    if (left > 0) requestAnimationFrame(step);
    else { bar.parentNode.classList.add('over'); if (onEnd) onEnd(); }
  })();
  return box;
}
/* 도감 보상 — 9 · 18 · 27 건째에 한 번씩(평생 한 번) */
var DEX_GIFTS = {
  9: { t: '🎁 평판 +2', fn: function () { G.rep = clamp(G.rep + 2, 0, 100); } },
  18: { t: '🖼️ 아트월 선물 — 오픈 준비 · 꾸미기에서 놓는다', fn: function () { G.decorInv.artwall = decorCount('artwall') + 1; } },
  27: { t: '🏅 명예 플로어 칭호 · 평판 +5', fn: function () { G.rep = clamp(G.rep + 5, 0, 100); } }
};
/* 🎯 판정 연습실 — 타이틀에서 케이스 5문제. 문제마다 20초, 빨리 맞힐수록 점수. 도감에는 넣지 않는다 */
var DRILL_N = 5, DRILL_S = 20;
function drillGrade(sc) { return sc >= 650 ? 'S' : sc >= 500 ? 'A' : sc >= 350 ? 'B' : 'C'; }
function openDrill(back) {
  var st = { i: 0, score: 0, right: 0 }, keep = G.recentCases;
  G.recentCases = [];   // 연습실 문제는 영업 출제 기록과 따로 — 끝나면 되돌린다
  function quit() { G.recentCases = keep; back(); }
  function ask() {
    var q = caseQuestion(), order = shuffle([0, 1, 2]), correct = order.indexOf(0);
    var opts = order.map(function (i) { return q.opts[i]; }), done = false, t0;
    showModal('<div class="kicker">🎯 판정 연습실 · ' + (st.i + 1) + ' / ' + DRILL_N + ' · ' + st.score + '점</div><h2>' + q.title + '</h2>' + q.body +
      '<div class="qbar"><i></i><span></span></div><div class="choices">' +
      opts.map(function (o, i) { return '<button class="choice" data-dr="' + i + '">' + o + '</button>'; }).join('') + '</div>' +
      '<div class="titlefoot"><button class="linkbtn" data-dquit="1">그만하기</button></div>');
    $('[data-dquit]').onclick = function () { done = true; quit(); };
    function answer(ix) {
      if (done) return; done = true;
      var el = (performance.now() - t0.t0) / 1000, ok = ix === correct;
      var pts = ok ? 100 + Math.round(50 * Math.min(1, Math.max(0, 1 - el / DRILL_S))) : 0;   // 속도 점수 0~50
      st.score += pts; if (ok) st.right++; st.i++;
      if (ok) SFX.good(); else SFX.bad();
      showModal('<div class="stamp ' + (ok ? 'ok' : 'no') + '">' + (ok ? (pts >= 135 ? 'FAST!' : 'GOOD') : (ix < 0 ? 'TIME' : 'MISS')) + '</div>' +
        '<div class="kicker">🎯 판정 연습실 · ' + st.i + ' / ' + DRILL_N + '</div>' +
        '<div class="verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ 정답 +' + pts + '점' : (ix < 0 ? '⏱ 시간 초과' : '✗ 오답')) + '</div>' +
        '<div class="choices" style="margin-bottom:10px">' + opts.map(function (o, i) {
          return '<div class="choice' + (i === correct ? ' right' : (i === ix ? ' wrong' : '')) + '">' + o + '</div>';
        }).join('') + '</div><p>' + q.why + '</p>' + q.cite +
        '<button class="cta" data-dnext="1">' + (st.i < DRILL_N ? '다음 문제' : '결과 보기') + '</button>');
      $('[data-dnext]').onclick = st.i < DRILL_N ? ask : result;
    }
    t0 = startQuickBar(DRILL_S, function () { answer(-1); });
    document.querySelectorAll('[data-dr]').forEach(function (b) { b.onclick = function () { answer(+b.getAttribute('data-dr')); }; });
  }
  function result() {
    var r = loadRecords(), best = r.drillBest || 0, g = drillGrade(st.score), nb = st.score > best;
    if (nb) { r.drillBest = st.score; try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) { /* 무시 */ } }
    if (g === 'S') SFX.win();   // 타이틀에서는 3D 효과가 멈춰 있다 — 소리만
    var achNew = checkAch('drill');
    showModal('<div class="titlecard"><div class="kicker">🎯 판정 연습실 결과</div><div class="gradebox g' + g + '"><span>' + g + '</span></div>' +
      '<h2>' + st.score + '점</h2><p class="sub">' + DRILL_N + '문제 중 ' + st.right + '개 정답' + (nb ? ' · 🎉 최고 기록!' : ' · 최고 ' + best + '점') + '</p></div>' + achHtml(achNew) +
      '<p class="note">빨리 맞힐수록 점수가 크다(문제당 100 + 속도 최대 50). 영업 중 판정을 맞혀야 📚 도감이 찬다.</p>' +
      '<div class="titlebtns"><button class="cta" data-dagain="1">한 번 더</button><button class="cta ghost" data-back="1">돌아가기</button></div>', true);
    $('[data-dagain]').onclick = function () { G.recentCases = keep; openDrill(back); };
    $('[data-back]').onclick = quit;
  }
  ask();
}
/* 교육용 — 테이블 없이 케이스 하나 */
function caseQuestion() {
  var fresh = CASES.filter(function (c) { return (G.recentCases || []).indexOf(c.n) < 0; });
  var c = pick(fresh.length ? fresh : CASES), names = shuffle(NAMES.slice()).slice(0, 5), f = function (s) { return fillNames(s, names); };
  G.recentCases = (G.recentCases || []).concat([c.n]).slice(-12);
  return { title: f(c.title), body: sceneHtml(f(c.sit)) + '<p><b>' + f(c.q) + '</b></p>', opts: c.ch.map(f), correct: 0,
    why: f(c.why), cite: '<div class="cite"><b>근거</b> 케이스 ' + c.n + ' · ' + c.rule + '<span class="unverified">원문 확인 전</span></div>' };
}

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
// 카드 · 족보 평가기 — 홀덤 테이블 프로토타입(nlh-table.html)에서 옮겼다
//   카드 { r: 0..12 (2..A), s: 0..3 (♠♥♦♣) }
// ═══════════════════════════════════════════════════
var CARD_RANKS = '23456789TJQKA';
var SUITS = [{ s: '♠', red: false }, { s: '♥', red: true }, { s: '♦', red: true }, { s: '♣', red: false }];
var CAT = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시'];
function newDeck() {
  var d = [], r, s;
  for (s = 0; s < 4; s++) for (r = 0; r < 13; r++) d.push({ r: r, s: s });
  return shuffle(d);
}
function eval5(cs) {
  var rs = cs.map(function (c) { return c.r; }).sort(function (a, b) { return b - a; });
  var flush = cs.every(function (c) { return c.s === cs[0].s; });
  var cnt = {};
  rs.forEach(function (r) { cnt[r] = (cnt[r] || 0) + 1; });
  var g = Object.keys(cnt).map(function (r) { return [cnt[r], +r]; }).sort(function (a, b) { return b[0] - a[0] || b[1] - a[1]; });
  var u = [];
  rs.forEach(function (r) { if (u.indexOf(r) < 0) u.push(r); });
  var sh = -1;
  if (u.length === 5) {
    if (u[0] - u[4] === 4) sh = u[0];
    else if (u[0] === 12 && u[1] === 3) sh = 3;   // 휠 A-2-3-4-5
  }
  var rest = function (from) { return g.slice(from).map(function (x) { return x[1]; }); };
  if (sh >= 0 && flush) return [8, sh];
  if (g[0][0] === 4) return [7, g[0][1], g[1][1]];
  if (g[0][0] === 3 && g[1][0] === 2) return [6, g[0][1], g[1][1]];
  if (flush) return [5].concat(rs);
  if (sh >= 0) return [4, sh];
  if (g[0][0] === 3) return [3].concat(rest(0));
  if (g[0][0] === 2 && g[1][0] === 2) return [2].concat(rest(0));
  if (g[0][0] === 2) return [1].concat(rest(0));
  return [0].concat(rs);
}
function cmp(a, b) {
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    var x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}
/* 홀덤 — 일곱 장 중 가장 좋은 다섯 장 */
function best(cards) {
  var top = null, n = cards.length, a, b, c, d, e;
  if (n < 5) return null;
  for (a = 0; a < n; a++) for (b = a + 1; b < n; b++) for (c = b + 1; c < n; c++)
    for (d = c + 1; d < n; d++) for (e = d + 1; e < n; e++) {
      var s = eval5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
      if (!top || cmp(s, top) > 0) top = s;
    }
  return top;
}
/* 오마하 — 홀카드에서 정확히 두 장, 보드에서 정확히 세 장. fn 이 다섯 장을 점수로 바꾼다 */
function omahaBest(hole, board, fn, better) {
  var top = null, i, j, a, b, c;
  for (i = 0; i < hole.length; i++) for (j = i + 1; j < hole.length; j++)
    for (a = 0; a < board.length; a++) for (b = a + 1; b < board.length; b++) for (c = b + 1; c < board.length; c++) {
      var s = fn([hole[i], hole[j], board[a], board[b], board[c]]);
      if (s && (!top || better(s, top))) top = s;
    }
  return top;
}
/* 8-or-better 로우 — 서로 다른 8 이하 다섯 장(A 는 1). 낮을수록 좋다. 없으면 null */
function low5(cs) {
  var v = cs.map(function (c) { return c.r === 12 ? 1 : c.r + 2; });
  if (v.some(function (x) { return x > 8; })) return null;
  v.sort(function (a, b) { return b - a; });
  for (var i = 1; i < 5; i++) if (v[i] === v[i - 1]) return null;
  return v;
}
function bestPLOHigh(hole, board) { return omahaBest(hole, board, eval5, function (s, t) { return cmp(s, t) > 0; }); }
function bestPLOLow(hole, board) { return omahaBest(hole, board, low5, function (s, t) { return cmp(s, t) < 0; }); }
function handName(sc) {
  var hi = function (r) { return CARD_RANKS[r].replace('T', '10'); };
  switch (sc[0]) {
    case 8: return sc[1] === 12 ? '로열 플러시' : hi(sc[1]) + ' 하이 스트레이트 플러시';
    case 7: return hi(sc[1]) + ' 포카드';
    case 6: return hi(sc[1]) + ' 풀하우스';
    case 5: return hi(sc[1]) + ' 하이 플러시';
    case 4: return hi(sc[1]) + ' 하이 스트레이트';
    case 3: return hi(sc[1]) + ' 트리플';
    case 2: return hi(sc[1]) + '·' + hi(sc[2]) + ' 투페어';
    case 1: return hi(sc[1]) + ' 원페어';
    default: return hi(sc[1]) + ' 하이';
  }
}
/* 카드 면 텍스처 — 52장 + 뒷면을 한 번만 그린다 */
var CARD_TEX = {};
function cardTex(c) {
  var key = c ? CARD_RANKS[c.r] + c.s : 'back';
  if (CARD_TEX[key]) return CARD_TEX[key];
  var cv = document.createElement('canvas'); cv.width = 64; cv.height = 90;
  var x = cv.getContext('2d');
  x.fillStyle = c ? '#fbfaf5' : '#7a1f2a'; x.fillRect(0, 0, 64, 90);
  x.strokeStyle = '#2a2a2a'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, 61, 87);
  if (c) {
    x.fillStyle = SUITS[c.s].red ? '#c0262e' : '#151515';
    x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(CARD_RANKS[c.r].replace('T', '10'), 32, 28);
    x.font = 'bold 34px sans-serif'; x.fillText(SUITS[c.s].s, 32, 64);
  } else { x.strokeStyle = '#d8b35a'; x.strokeRect(8, 8, 48, 74); }
  var t = new THREE.CanvasTexture(cv);
  CARD_TEX[key] = t;
  return t;
}

// ═══════════════════════════════════════════════════
// 소리 — 첫 클릭 뒤에만 난다
// ═══════════════════════════════════════════════════
var AC = null, MUTED = false;
function audioOn() {
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
    if (AC) musicInit();
  }
  // iOS 는 멈춘 채로 만들거나 전화 · 앱 전환 뒤 멈춘다 — 탭할 때마다 깨운다
  if (AC && AC.state !== 'running' && AC.resume) AC.resume().catch(function () { /* 다음 탭에 다시 */ });
}
document.addEventListener('visibilitychange', function () { if (!document.hidden && AC) audioOn(); });
function tone(freq, dur, type, vol, delay) {
  if (!AC || MUTED) return;
  var t = AC.currentTime + (delay || 0);
  var o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, (vol || 0.12) * (typeof SETTINGS !== 'undefined' ? SETTINGS.sfx : 1)), t + 0.01);
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

/* 라운지 배경음악 — Cmaj7 · Am7 · Dm7 · G7 패드 + 워킹 베이스, 작게. 웅성거림은 손님 수에 비례.
   🎵 로 켜고 끈다 (🔊 는 효과음). 외부 음원 없이 WebAudio 로 만든다 */
var MUSIC = { on: true, master: null, padBus: null, timer: null, nextT: 0, beat: 0, mur: null };
try { MUSIC.on = localStorage.getItem('pubsim.music') !== 'off'; } catch (e) { /* 저장이 막힌 브라우저 — 기본 켬 */ }
var BPM = 80;
var PROG = [
  { pad: [60, 64, 67, 71], bass: [36, 40, 43, 44] },   // Cmaj7 — G# 로 A 에 다가간다
  { pad: [60, 64, 67, 69], bass: [45, 43, 40, 39] },   // Am7 — Eb 로 D 에
  { pad: [60, 62, 65, 69], bass: [38, 41, 45, 42] },   // Dm7 — F# 로 G 에
  { pad: [59, 62, 65, 67], bass: [43, 47, 50, 37] }    // G7 — C# 로 C 에
];
function midiHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }
function musicInit() {
  if (!AC || MUSIC.master) return;
  MUSIC.master = AC.createGain(); MUSIC.master.gain.value = MUSIC.on ? (typeof SETTINGS !== 'undefined' ? SETTINGS.music : 0.7) : 0;
  MUSIC.master.connect(AC.destination);
  var lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(MUSIC.master);
  MUSIC.padBus = lp;
  // 웅성거림 — 흰 소음을 사람 목소리 대역으로 거르고 천천히 출렁이게
  var len = AC.sampleRate * 2, buf = AC.createBuffer(1, len, AC.sampleRate), ch = buf.getChannelData(0);
  for (var i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  var src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
  var bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.9;
  var mg = AC.createGain(); mg.gain.value = 0;
  var lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 0.35; lg.gain.value = 180;
  lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
  src.connect(bp); bp.connect(mg); mg.connect(MUSIC.master); src.start();
  MUSIC.mur = mg;
  MUSIC.nextT = AC.currentTime + 0.1;
  MUSIC.timer = setInterval(scheduleMusic, 200);
}
function musicNote(freq, t, dur, vol, type, bus) {
  var o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + (type === 'sine' ? 0.4 : 0.02));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
}
function scheduleMusic() {
  if (!AC || !MUSIC.on || AC.state !== 'running') { if (AC) MUSIC.nextT = AC.currentTime + 0.1; return; }
  var spb = 60 / BPM;
  if (MUSIC.nextT < AC.currentTime) MUSIC.nextT = AC.currentTime + 0.05;   // 탭이 오래 숨었다 — 밀린 박자는 버린다
  while (MUSIC.nextT < AC.currentTime + 0.6) {
    var bar = Math.floor(MUSIC.beat / 4) % PROG.length, b = MUSIC.beat % 4, ch = PROG[bar], t = MUSIC.nextT;
    if (b === 0) ch.pad.forEach(function (n, i) { musicNote(midiHz(n), t + i * 0.03, spb * 4, 0.016, 'sine', MUSIC.padBus); });
    musicNote(midiHz(ch.bass[b]), t, spb * 0.9, 0.05, 'triangle', MUSIC.padBus);
    if (b === 1 || b === 3) musicNote(5200, t + spb * 0.66, 0.05, 0.004, 'square', MUSIC.master);   // 하이햇 스윙 느낌
    MUSIC.beat++; MUSIC.nextT += spb;
  }
}
function setMusic(on) {
  MUSIC.on = on;
  try { localStorage.setItem('pubsim.music', on ? 'on' : 'off'); } catch (e) { /* 무시 */ }
  if (MUSIC.master) MUSIC.master.gain.setTargetAtTime(on ? 0.7 : 0, AC.currentTime, 0.2);
}
/* 손님 수에 비례하는 웅성거림 — 영업 중에만 */
function tickMurmur() {
  if (!MUSIC.mur) return;
  var n = G.phase === 'open' ? G.customers.filter(function (c) { return c.alive && c.state !== 'leaving'; }).length : 0;
  var target = G.phase === 'open' && !G.paused ? Math.min(0.06, n * 0.0028) : 0;
  MUSIC.mur.gain.setTargetAtTime(target, AC.currentTime, 0.8);
}

// ═══════════════════════════════════════════════════
// 3D 장면
// ═══════════════════════════════════════════════════
var scene, camera, renderer, raycaster, pointer;
var cam = { yaw: -0.18, pitch: 0.92, dist: 21, target: V(-0.5, -0.5), follow: false };
var pickables = [];
var decor = {};   // 상점 구매로 보이는 것들
var LIGHT = {};   // 정전 때 어두워지는 조명

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
  cleanerHome: V(-11, 4),
  floorHome: V(5.6, 1.2)
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

  LIGHT.hemi = new THREE.HemisphereLight(0xfff4e0, 0x3a2a1e, 0.55);
  scene.add(LIGHT.hemi);
  var sun = LIGHT.sun = new THREE.DirectionalLight(0xffe9c8, 0.85);
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
  decor.sideWall = box(0.3, 3, 18, 0x2c3b36, -13, 1.5, 0);
  // 네온 테마 — 벽을 따라 띠 조명
  decor.neon = new THREE.Group();
  [[0, 2.7, -8.82, 26, 0.06, 0.04, 0xff4fd8], [0, 0.35, -8.82, 26, 0.05, 0.04, 0x4fe3ff],
   [-12.83, 2.7, 0, 0.04, 0.06, 18, 0x4fe3ff], [-12.83, 0.35, 0, 0.04, 0.05, 18, 0xff4fd8]].forEach(function (s) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(s[3], s[4], s[5]), new THREE.MeshBasicMaterial({ color: s[6] }));
    m.position.set(s[0], s[1], s[2]); decor.neon.add(m);
  });
  var nl1 = new THREE.PointLight(0xff4fd8, 0.6, 14); nl1.position.set(-6, 2.4, -7.5);
  var nl2 = new THREE.PointLight(0x4fe3ff, 0.6, 14); nl2.position.set(6, 2.4, -7.5);
  decor.neon.add(nl1, nl2); decor.neon.visible = false; scene.add(decor.neon);
  // 배치 모드 — 놓을 수 없는 곳을 붉게
  decor.zones = new THREE.Group(); decor.zones.visible = false; scene.add(decor.zones);
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
  makeNeonSign();
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
  // 차단기 — 왼쪽 벽. 정전이면 빨간 등이 켜진다
  box(0.14, 0.8, 0.6, 0x5a5f66, -12.8, 1.5, 6);
  decor.breakerLamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat(0xE5402F, { emissive: 0xE5402F, emissiveIntensity: 1 }));
  decor.breakerLamp.position.set(-12.7, 1.95, 6); decor.breakerLamp.visible = false; scene.add(decor.breakerLamp);
  var bs = labelSprite('차단기', '#9fb3ad'); bs.scale.set(1.2, 0.3, 1); bs.position.set(-12.6, 2.3, 6); scene.add(bs);

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
      cg.userData.backMat = mat(0xf5f5f0);   // 쇼다운에서 잠깐 앞면으로 바꿨다가 되돌린다
      for (var c2 = 0; c2 < 2; c2++) {
        var card = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.23), cg.userData.backMat);
        card.position.set(c2 * 0.12 - 0.06, 0, 0);
        cg.add(card);
      }
      cg.position.set(cp.x, 0.885, cp.z);
      cg.rotation.y = -SEAT_ANG[s] * Math.PI / 180 + Math.PI / 2;
      cg.visible = false;
      cg.userData.home = cg.position.clone();
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
    t.pot = chips;
    // 보드 카드 다섯 장 — 핸드가 진행되면 플랍 · 턴 · 리버 순서로 앞면이 깔린다
    t.board = [];
    for (var bc = 0; bc < 5; bc++) {
      var bm = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.42), new THREE.MeshBasicMaterial({ map: cardTex(null) }));
      bm.rotation.x = -Math.PI / 2; bm.position.set(-0.68 + bc * 0.34, 0.885, -0.3); bm.visible = false;
      g.add(bm); t.board.push(bm);
    }
    t.felt = felt;
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

/* ── 매장 꾸미기 — 테마 · 장식 배치 ──────────────────── */
var THEMES = {
  classic: { ko: '클래식', price: 0, desc: '나무 바닥 · 짙은 초록 벽', floor: [0x6b4a33, 0x7a5636], rug: [0x3a2b3f, 0x2d3f5a], wall: [0x2c3b36, 0x3a2f2a], bg: 0x1b1612, hemi: 0xfff4e0 },
  lounge: { ko: '라운지', price: 900000, desc: '따뜻한 원목 · 와인색 러그 · 은은한 조명', floor: [0x5a3a26, 0x6a4430], rug: [0x5c2a2a, 0x6a2c30], wall: [0x3d2b22, 0x4a3328], bg: 0x1e140e, hemi: 0xffd9a8 },
  neon: { ko: '네온', price: 1200000, desc: '어두운 바닥 · 벽을 따라 분홍 · 하늘색 띠 조명', floor: [0x1d1b26, 0x23202e], rug: [0x2a1240, 0x30164a], wall: [0x141428, 0x18182e], bg: 0x0b0a12, hemi: 0xd8d0ff, neon: true }
};
var DECOR_ITEMS = {
  plant: { ko: '화분', ic: '🪴', price: 80000, rate: 0.05, desc: '반경 3 손님 만족 서서히 +' },
  sofa: { ko: '소파', ic: '🛋️', price: 250000, rate: 0.08, desc: '반경 3 손님 만족 + (바 대기 손님이 특히 좋아한다)' },
  artwall: { ko: '아트월', ic: '🖼️', price: 300000, rate: 0.08, desc: '반경 3 손님 만족 + · 사진 찍는 손님' },
  trophy: { ko: '트로피 진열장', ic: '🏆', price: 400000, rate: 0.05, desc: '우승자가 나올 때마다 트로피가 쌓인다 — 쌓일수록 효과 +', max: 1 }
};
var DECOR_R = 3;
/* 놓을 수 없는 곳 — 테이블 · 카운터 · 동선 */
function blockedZones() {
  var z = [];
  TABLE_DEF.forEach(function (t, i) { if (i < 2 || G.owned.table3) z.push({ x: t.cx, z: t.cz, r: 3.4 }); });
  z.push({ x: 8.2, z: 2.4, r: 2.2 }, { x: 10.5, z: 7.2, r: 1.6 }, { x: 6.4, z: 1.6, r: 1.3 }, { x: -12.1, z: 6, r: 1.3 },
    { x: -10.4, z: -2, r: 1.8 }, { x: -5.5, z: -5.3, r: 1.3 }, { x: 5.6, z: 1.2, r: 1 }, { x: -11, z: 4, r: 1 }, { x: 6.6, z: 3.8, r: 1 });
  QUEUE.forEach(function (q) { z.push({ x: q.x, z: q.z, r: 1.0 }); });
  return z;
}
function placeBlocked(x, zz, skip, kind) {
  var pad = kind && kind !== 'plant' ? 0.8 : 0;   // 폭이 넓은 장식은 여유를 둔다
  if (zz < -4.2 + pad && zz > -9) return '바 앞은 손님 자리다';
  if (x < -12.2 + pad || x > 12.2 - pad || zz < -4.2 || zz > 8.5 - pad) return '벽에 너무 붙었다';
  if (blockedZones().some(function (b) { return Math.hypot(b.x - x, b.z - zz) < b.r + pad; })) return '테이블 · 카운터 · 동선 근처에는 놓을 수 없다';
  if (G.placed.some(function (p) { return p !== skip && Math.hypot(p.x - x, p.z - zz) < 1.2; })) return '다른 장식과 너무 가깝다';
  return null;
}
function decorMesh(kind) {
  var g = new THREE.Group();
  if (kind === 'plant') {
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.5, 12), mat(0x8a5a3c)); pot.position.y = 0.25;
    var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), mat(0x2f7a45)); leaf.position.y = 0.95; leaf.scale.y = 1.3;
    g.add(pot, leaf);
  } else if (kind === 'sofa') {
    box(1.6, 0.4, 0.7, 0x7a2f3a, 0, 0.3, 0, g); box(1.6, 0.6, 0.2, 0x6a2832, 0, 0.6, -0.3, g);
    box(0.2, 0.5, 0.7, 0x6a2832, -0.75, 0.45, 0, g); box(0.2, 0.5, 0.7, 0x6a2832, 0.75, 0.45, 0, g);
  } else if (kind === 'artwall') {
    var c = document.createElement('canvas'); c.width = 128; c.height = 96;
    var x = c.getContext('2d'), cols = ['#EF9F27', '#E5402F', '#3B6FB6', '#3E9B5F', '#7A4BB0', '#f2f2f2'];
    x.fillStyle = '#1b1612'; x.fillRect(0, 0, 128, 96);
    for (var i = 0; i < 9; i++) { x.fillStyle = cols[i % cols.length]; x.beginPath(); x.arc(14 + (i * 37) % 110, 14 + (i * 23) % 70, 10 + (i * 7) % 18, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#fff'; x.font = 'bold 18px sans-serif'; x.fillText('♠ ♥ ♦ ♣', 22, 88);
    box(1.8, 1.4, 0.1, 0x2a1b14, 0, 1.1, 0, g);
    var art = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.6 }));
    art.position.set(0, 1.1, 0.06); g.add(art);
    box(0.1, 0.4, 0.5, 0x2a1b14, -0.7, 0.2, 0, g); box(0.1, 0.4, 0.5, 0x2a1b14, 0.7, 0.2, 0, g);
  } else {
    box(1.2, 1.7, 0.5, 0x3a2a1e, 0, 0.85, 0, g);
    var glass = new THREE.Mesh(new THREE.BoxGeometry(1.08, 1.5, 0.05), new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.25, roughness: 0.1 }));
    glass.position.set(0, 0.9, 0.26); g.add(glass);
    box(1.08, 0.04, 0.4, 0x5a4434, 0, 0.62, 0, g); box(1.08, 0.04, 0.4, 0x5a4434, 0, 1.12, 0, g);
    var n = Math.min(G.wins || 0, 12);
    for (var k = 0; k < n; k++) {
      var cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.16, 10), mat(0xD8B35A, { metalness: 0.7, roughness: 0.25, emissive: 0x3a2a00 }));
      cup.position.set(-0.42 + (k % 6) * 0.17, k < 6 ? 0.72 : 1.22, 0.02); g.add(cup);
    }
  }
  g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.userData.decor = g; } });
  return g;
}
/* 놓인 장식을 다시 그린다 (트로피 수 · 불러오기) */
function disposeTree(obj) {
  obj.traverse(function (o) { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
}
function rebuildPlaced() {
  if (decor.placed) { scene.remove(decor.placed); disposeTree(decor.placed); pickables = pickables.filter(function (m) { return !m.userData.decor; }); }
  decor.placed = new THREE.Group();
  G.placed.forEach(function (p) {
    var m = decorMesh(p.kind);
    m.position.set(p.x, 0, p.z); m.rotation.y = p.rot || 0;
    m.userData.place = p;
    m.traverse(function (o) { if (o.isMesh) { o.userData.place = p; pickables.push(o); } });
    decor.placed.add(m);
  });
  scene.add(decor.placed);
}
function decorCount(kind) { return (G.decorInv[kind] || 0); }
function placedCount(kind) { return G.placed.filter(function (p) { return p.kind === kind; }).length; }
/* 장식 반경 3 안의 손님 만족이 서서히 오른다 */
var DECOR_CAP = 0.15;   // 장식을 몰아 놓아도 손님 한 명이 받는 효과는 초당 이만큼까지
function tickDecor(dt) {
  if (!G.placed.length) return;
  G.customers.forEach(function (c) {
    if (!c.alive || c.state === 'leaving') return;
    var gain = 0, near = null;
    G.placed.forEach(function (p) {
      if (Math.hypot(c.mesh.position.x - p.x, c.mesh.position.z - p.z) > DECOR_R) return;
      var r = DECOR_ITEMS[p.kind].rate + (p.kind === 'trophy' ? 0.01 * Math.min(G.wins || 0, 10) : 0);
      gain += r * (p.kind === 'sofa' && /^bar-/.test(c.state) ? 1.5 : 1);
      near = near || p;
    });
    if (!near) return;
    c.sat = clamp(c.sat + Math.min(gain, DECOR_CAP) * dt, 0, 100);
    if (chance(dt * 0.004)) say(c, pick(near.kind === 'artwall' ? ['📸 여기 사진 각!', '그림 예쁘다'] : (near.kind === 'trophy' ? ['🏆 우승하면 저기 올라가나?', '트로피 멋지다'] : ['여기 아늑하다 🌿', '분위기 좋네'])), 2, true);
  });
}

/* 배치 모드 — 바닥을 탭하면 놓고, 놓인 것을 탭하면 회수 */
function enterPlace() {
  closeModal();
  G.phase = 'place';
  G.placeKind = Object.keys(DECOR_ITEMS).filter(function (k) { return decorCount(k) > placedCount(k); })[0] || null;
  disposeTree(decor.zones);
  while (decor.zones.children.length) decor.zones.remove(decor.zones.children[0]);
  var zm = new THREE.MeshBasicMaterial({ color: 0xE5402F, transparent: true, opacity: 0.22, depthWrite: false });
  blockedZones().forEach(function (b) {
    var m = new THREE.Mesh(new THREE.CircleGeometry(b.r, 28), zm);
    m.rotation.x = -Math.PI / 2; m.position.set(b.x, 0.04, b.z); decor.zones.add(m);
  });
  var bar = new THREE.Mesh(new THREE.PlaneGeometry(26, 4.6), zm); bar.rotation.x = -Math.PI / 2; bar.position.set(0, 0.04, -6.6); decor.zones.add(bar);
  decor.zones.visible = true;
  cam.target.set(-0.5, 0, 3.5); cam.yaw = 0; cam.pitch = 1.32;   // 앞줄이 하단 막대에 가리지 않게
  renderPlaceBar();
}
function exitPlace() {
  decor.zones.visible = false;
  $('#placebar').innerHTML = '';
  fitCamera(); cam.yaw = -0.18; cam.target.set(-0.5, 0, -0.5);
  saveGame();
  prepScreen('decor');
}
function renderPlaceBar() {
  var kinds = Object.keys(DECOR_ITEMS).filter(function (k) { return decorCount(k) > 0; });
  $('#placebar').innerHTML = '<div class="pbar"><div class="phead">🪴 배치 모드 — 바닥을 탭해 놓고, 놓인 장식을 탭하면 회수한다. <b>빨간 곳</b>(테이블 · 카운터 · 동선)에는 못 놓는다.</div><div class="pchips">' +
    (kinds.length ? kinds.map(function (k) {
      var it = DECOR_ITEMS[k], left = decorCount(k) - placedCount(k);
      return '<button class="pchip' + (G.placeKind === k ? ' on' : '') + '" data-pk="' + k + '"' + (left > 0 ? '' : ' disabled') + '>' + it.ic + ' ' + it.ko + ' <small>' + left + '개 남음</small></button>';
    }).join('') : '<span class="note">산 장식이 없다 — 꾸미기 탭에서 산다.</span>') +
    '</div><button class="cta" data-pdone="1">배치 끝</button></div>';
  document.querySelectorAll('[data-pk]').forEach(function (b) { b.onclick = function () { G.placeKind = b.getAttribute('data-pk'); renderPlaceBar(); }; });
  $('[data-pdone]').onclick = exitPlace;
}
function placeClick() {
  var hits = raycaster.intersectObjects(pickables, false);
  for (var i = 0; i < hits.length; i++) {
    var o = hits[i].object, u = o.userData;
    if (!o.visible || (o.parent && o.parent.visible === false)) continue;
    if (u.place) {
      G.placed = G.placed.filter(function (p) { return p !== u.place; });
      rebuildPlaced();
      toast(DECOR_ITEMS[u.place.kind].ic + ' ' + DECOR_ITEMS[u.place.kind].ko + ' — 회수했다');
      if (!G.placeKind) G.placeKind = u.place.kind;
      renderPlaceBar(); tone(660, 0.08, 'triangle', 0.06);
      return;
    }
    if (u.floor) {
      var p = hits[i].point, k = G.placeKind;
      if (!k || decorCount(k) <= placedCount(k)) { toast('놓을 장식을 아래에서 고르세요'); return; }
      var why = placeBlocked(p.x, p.z, null, k);
      if (why) { toast('🚫 ' + why); SFX.bad(); return; }
      var rot = Math.atan2(-0.5 - p.x, 1 - p.z);   // 홀 가운데를 바라보게
      G.placed.push({ kind: k, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, rot: Math.round(rot * 100) / 100 });
      rebuildPlaced();
      if (decorCount(k) <= placedCount(k)) G.placeKind = Object.keys(DECOR_ITEMS).filter(function (x) { return decorCount(x) > placedCount(x); })[0] || null;
      renderPlaceBar(); SFX.chips();
      return;
    }
  }
}
function placeAtForTest(k, x, z) { G.placeKind = k; var w = placeBlocked(x, z, null, k); if (w) return w; G.placed.push({ kind: k, x: x, z: z, rot: 0 }); rebuildPlaced(); return null; }

function applyDecor() {
  decor.interior.visible = !!G.owned.interior;
  var th = THEMES[G.theme] || THEMES.classic, iv = G.owned.interior ? 1 : 0;
  decor.floor.material.color.setHex(th.floor[iv]);
  decor.rug.material.color.setHex(th.rug[iv]);
  decor.wall.material.color.setHex(th.wall[iv]);
  decor.sideWall.material.color.setHex(th.wall[iv]);
  scene.background.setHex(th.bg);
  if (LIGHT.hemi) LIGHT.hemi.color.setHex(th.hemi);
  decor.neon.visible = !!th.neon;
  rebuildPlaced();
  decor.barExt.visible = !!G.owned.bar;
  decor.stools.forEach(function (s, i) { s.visible = i < barCap(); });
  TABLE_DEF.forEach(function (t, i) {
    t.group.visible = i < 2 || !!G.owned.table3;
    t.shuffler.visible = !!G.owned.shuffler;
    t.lamp.visible = !!G.owned.interior;
    t.felt.material.color.setHex(i === MIX_TABLE && G.owned.mix ? 0x1f4f7a : 0x0F6E56);   // 믹스 테이블은 남색 펠트
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
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  if (G.phase === 'place' && !G.modal) { raycaster.setFromCamera(pointer, camera); placeClick(); return; }
  if (G.modal || G.phase !== 'open') return;
  raycaster.setFromCamera(pointer, camera);
  var hits = raycaster.intersectObjects(pickables.concat(G.spills.map(function (s) { return s.mesh; })), false);
  for (var i = 0; i < hits.length; i++) {
    var o = hits[i].object, u = o.userData;
    if (!o.visible || (o.parent && o.parent.visible === false)) continue;
    if (u.place) continue;   // 장식은 영업 중에 누르지 않는다 — 뒤의 바닥으로
    if (u.spill) { goClean(u.spill); return; }
    if (u.table !== undefined) { goTable(u.table); return; }
    if (u.counter) { goCounter(); return; }
    if (u.floor) { var p = hits[i].point; playerGo(V(clamp(p.x, -12.3, 12.3), clamp(p.z, -5.4, 8.6))); return; }
  }
}

// ── 사람 ─────────────────────────────────────────────
/* 사람 — 몸 · 머리 · 머리카락 · 눈 · 팔. 지오메트리는 모두 같이 쓴다 */
var HAIR_COLS = [0x1b1b1b, 0x2e2018, 0x5a3a22, 0x8a6236, 0xc9a66b, 0x7a2a26, 0x6b6b6b];
var PG = null, PM = {};
function personGeo() {
  if (PG) return PG;
  PG = {
    body: new THREE.CylinderGeometry(0.2, 0.26, 0.9, 14),
    head: new THREE.SphereGeometry(0.17, 16, 12),
    hair: new THREE.SphereGeometry(0.182, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    eye: new THREE.SphereGeometry(0.026, 8, 6),
    arm: new THREE.CylinderGeometry(0.055, 0.05, 0.52, 8),
    bow: new THREE.BoxGeometry(0.16, 0.07, 0.04),
    knot: new THREE.BoxGeometry(0.04, 0.05, 0.05)
  };
  PG.arm.translate(0, -0.26, 0);   // 어깨에서 흔들리게 — 회전 중심을 위로
  return PG;
}
function pmat(c) { if (!PM[c]) PM[c] = mat(c); return PM[c]; }
function makePerson(color, vest, hat, opt) {
  opt = opt || {};
  var P = personGeo();
  var g = new THREE.Group();
  var body = new THREE.Mesh(P.body, mat(color));
  body.position.y = 0.45; body.castShadow = true;
  var head = new THREE.Mesh(P.head, pmat(0xe8c4a0));
  head.position.y = 1.07; head.castShadow = true;
  g.add(body, head);
  var hair = new THREE.Mesh(P.hair, pmat(opt.hair != null ? opt.hair : pick(HAIR_COLS)));
  hair.position.set(0, 1.09, -0.02); hair.rotation.x = -0.25; g.add(hair);
  [-0.06, 0.06].forEach(function (x) { var e = new THREE.Mesh(P.eye, pmat(0x141414)); e.position.set(x, 1.1, 0.152); g.add(e); });
  var arms = [-0.25, 0.25].map(function (x) {
    var a = new THREE.Mesh(P.arm, pmat(color)); a.position.set(x, 0.82, 0); a.rotation.z = x < 0 ? 0.12 : -0.12; a.castShadow = true; g.add(a); return a;
  });
  g.userData.arms = arms;
  if (opt.bow) {   // 딜러 나비넥타이
    var bow = new THREE.Mesh(P.bow, pmat(0xa3121e)), kn = new THREE.Mesh(P.knot, pmat(0x6e0a12));
    bow.position.set(0, 0.86, 0.205); kn.position.set(0, 0.86, 0.225); g.add(bow, kn);
  }
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
  if (!a.path || !a.path.length) { if (!a.keyWalk) swingArms(m, 0); return; }
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
    swingArms(m, Math.sin(G.simT * 14) * 0.6);
  }
}
function swingArms(m, s) {
  var ar = m.userData.arms;
  if (!ar) return;
  ar[0].rotation.x = s; ar[1].rotation.x = -s;
}
function faceTo(a, v) { a.mesh.rotation.y = Math.atan2(v.x - a.mesh.position.x, v.z - a.mesh.position.z); }
function say(a, text, secs, ambient) { if (a) a.bubble = { text: text, until: now() + (secs || 2.6), ambient: !!ambient }; }
function ambientCount() {
  var t = now();
  return G.customers.filter(function (c) { return c.alive && c.bubble && c.bubble.ambient && c.bubble.until > t; }).length;
}
/* 첫날 처음 보는 일마다 한 번씩 알려 준다 */
function tip(key, text) {
  if (G.day > 1 || G.tips[key]) return;
  G.tips[key] = true;
  var el = $('#tip');
  el.innerHTML = '<div class="tipbox">💡 ' + text + '</div>';
  clearTimeout(tip.h);
  tip.h = setTimeout(function () { el.innerHTML = ''; }, 6000);
}

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
  counterProg: 0, stock: 0, announced: {}, chipIssueAt: null, finalDone: false,
  roster: [], staffSeq: 10, cands: [], goals: [], tips: {}, talkOn: true, servers: [], floorStaff: null,
  weekLog: [], debtDays: 0, regulars: [], regDelta: [], friends: [], resv: null,
  theme: 'classic', themes: { classic: true }, decorInv: {}, placed: [], wins: 0
};
window.__pub = G;   // 자동 점검용

function gameMin() { return OPEN_MIN + G.simT * (CLOSE_MIN - OPEN_MIN) / DAY_SEC; }
function levelMin() { return LEVEL_LEN[G.cfg.level]; }
function level() { return Math.min(BLINDS.length - 1, Math.floor((gameMin() - OPEN_MIN) / levelMin())); }
/* 주간 캠페인 — 1일차가 월요일. 요일마다 대회 성격이 다르고 일요일은 휴무 · 주간 정산 */
var WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
var SEASON_WEEKS = 8, WEEKLY_RENT = 900000, SEASON_GOAL_BANK = 15000000, SEASON_GOAL_RANK = '홀덤 명소';
function dayInfo(day) {
  var d = day || G.day, wd = (d - 1) % 7, week = Math.floor((d - 1) / 7) + 1;
  var base = { wd: wd, week: week, wk: WEEKDAYS[wd], name: '데일리', short: '데일리', arrivalK: 1, feeMul: 1, stack: null, regClose: 23 * 60, repMul: 1,
    desc: '평일 데일리 토너먼트' };
  if (wd === 4) return Object.assign(base, { name: '금요 딥스택', short: '딥스택', arrivalK: 1.35, stack: 2, desc: '스타팅 50,000 고정 · 손님 +35% · 오래 간다' });
  if (wd === 5) return Object.assign(base, { name: '토요 메인 이벤트', short: '메인 이벤트', arrivalK: 1.6, feeMul: 2, regClose: 24 * 60, repMul: 1.5,
    desc: '참가비 2배 · 손님 +60% · 레지 마감 24:00 · 평판이 1.5배로 움직인다' });
  if (wd === 6) return Object.assign(base, { name: '휴무', short: '휴무', desc: '주간 정산 · 임대료' });
  return base;
}
function fee() { return G.cfg.fee * dayInfo().feeMul; }
function stackIdx() { var i = dayInfo(); return i.stack !== null ? i.stack : G.cfg.stack; }
function regCloseMin() { return dayInfo().regClose; }
function regOpen() { return gameMin() < regCloseMin(); }
function tableCount() { return G.owned.table3 ? 3 : 2; }
function dealerCount() { return G.roster.filter(function (s) { return s.role === 'dealer'; }).length; }

function log(t, c) {
  G.log.push({ t: '[' + clock(gameMin()) + '] ' + t, c: c || '' });
  if (G.log.length > 60) G.log.shift();
  renderTicker();
}
/* ── 연출 — 배너 · 판정 콤보 · 숫자 세기 · 네온 간판 ───────────────── */
/* 화면 가운데를 가로지르는 큰 배너 (영업 시작 · 콤보) */
function banner(big, small, cls) {
  var el = $('#banner');
  if (!el) return;
  el.innerHTML = '<div class="bn ' + (cls || '') + '"><b>' + big + '</b>' + (small ? '<span>' + small + '</span>' : '') + '</div>';
  clearTimeout(banner.h);
  banner.h = setTimeout(function () { el.innerHTML = ''; }, 2300);
}
/* 판정 콤보 — 연속으로 맞히면 보너스 평판, 틀리거나 놓치면 끊긴다 */
function comboHit(ok) {
  if (!ok) {
    if ((G.combo || 0) >= 3) toast('💔 콤보 끊김 — ×' + G.combo);
    G.combo = 0; return;
  }
  G.combo = (G.combo || 0) + 1;
  G.stats.maxCombo = Math.max(G.stats.maxCombo || 0, G.combo);
  if (G.combo >= 2) {
    var bonus = Math.min(0.6, 0.1 * (G.combo - 1));   // 연출은 크게, 보너스는 작게 — 시즌이 너무 빨리 끝나지 않게
    G.rep = clamp(G.rep + bonus, 0, 100);
    banner('🔥 COMBO ×' + G.combo, '연속 정확한 판정 · 평판 +' + bonus.toFixed(1), 'combo');
    tone(1046, 0.08, 'triangle', 0.07); tone(1568, 0.14, 'triangle', 0.07, 0.07);
  }
}
/* 보고서 숫자가 굴러 올라간다 */
function countUp() {
  document.querySelectorAll('[data-countup]').forEach(function (el) {
    var to = +el.getAttribute('data-countup'), t0 = performance.now(), dur = 900;
    if (document.documentElement.classList.contains('reduce-motion')) return;
    (function step(ts) {
      var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = Math.round(to * e / 100) * 100;
      el.textContent = (v < 0 ? '−' : '') + won(Math.abs(v));
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    })(t0);
  });
}
/* 네온 간판 — 뒷벽에 「HOLD'EM PUB」, 가끔 깜빡인다 */
function makeNeonSign() {
  var c = document.createElement('canvas'); c.width = 512; c.height = 128;
  var x = c.getContext('2d');
  x.font = '900 64px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  [['#ff4fd8', 28], ['#ff4fd8', 14], ['#ffe6fb', 0]].forEach(function (p) { x.shadowColor = '#ff4fd8'; x.shadowBlur = p[1]; x.fillStyle = p[0]; x.fillText("HOLD'EM PUB", 256, 60); });
  x.shadowBlur = 0; x.strokeStyle = '#4fe3ff'; x.lineWidth = 4; x.shadowColor = '#4fe3ff'; x.shadowBlur = 16;
  x.strokeRect(10, 10, 492, 108);
  var m = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  m.position.set(1.5, 2.25, -8.83);
  scene.add(m);
  decor.neonSign = m;
}
function flickerNeon(real) {
  var m = decor.neonSign;
  if (!m) return;
  flickerNeon.t = (flickerNeon.t || 0) - real;
  if (G.blackout) { m.material.opacity = 0.08; return; }
  if (document.documentElement.classList.contains('reduce-motion')) { m.material.opacity = 1; return; }   // 움직임 줄이기 — 깜빡이지 않는다
  if (flickerNeon.t <= 0) { flickerNeon.t = 4 + Math.random() * 8; flickerNeon.off = 0.18; }
  if (flickerNeon.off > 0) { flickerNeon.off -= real; m.material.opacity = Math.random() < 0.5 ? 0.35 : 1; } else m.material.opacity = 1;
}

function toast(t) {
  var el = $('#toast');
  el.innerHTML = '<div class="toast">' + t + '</div>';
  clearTimeout(toast.h);
  toast.h = setTimeout(function () { el.innerHTML = ''; }, 2600);
}
/* 단골 — 이름 · 성격 · 좋아하는 음료 · 방문 · 호감. 날을 넘어 이어진다 */
var REG_NAMES = ['강민수', '이서윤', '박지훈', '최유나', '정도현', '한소희', '오세훈', '윤채령', '임동현', '장예슬', '신태양', '문하린'];
var FAV = ['🍺', '🥤', '☕', '🍷', '🧃'];
function makeRegulars() {
  return REG_NAMES.map(function (n, i) {
    return { id: i, name: n, type: pickType(), fav: pick(FAV), visits: 0, aff: 45 + rnd(15), gone: false, lastDay: 0 };
  });
}
function pickRegular() {
  var pool = G.regulars.filter(function (r) { return !r.gone && !r.inHouse && !r.reserved && r.lastDay !== G.day; });
  if (!pool.length || !chance(0.32 + G.rep / 500)) return null;
  var tot = pool.reduce(function (t, r) { return t + r.aff; }, 0), x = Math.random() * tot;
  for (var i = 0; i < pool.length; i++) { x -= pool[i].aff; if (x <= 0) return pool[i]; }
  return pool[0];
}
function regDone(c) {
  if (!c.reg || c.regDone) return;
  c.regDone = true;
  var r = c.reg, d = clamp(Math.round((c.sat - 60) / 4), -10, 10);
  r.inHouse = false; r.visits++; r.lastDay = G.day;
  r.aff = clamp(r.aff + d, 0, 100);
  G.regDelta.push({ name: r.name, d: d });
  if (r.aff < 15 && !r.gone) { r.gone = true; log('💔 단골 ' + r.name + ' — 발길을 끊었다', 'bad'); }
}
/* 인플루언서 — 나갈 때 만족도로 평판이 크게 움직인다 */
function vipDone(c) {
  if (!c.vip || c.vipDone || c.bounced) return;
  c.vipDone = true;
  var ok = c.sat >= 70;
  G.rep = clamp(G.rep + (ok ? 5 : -4), 0, 100);
  floatText(c.mesh.position.clone().setY(2.2), ok ? '📸 좋은 후기 · 평판 +5' : '📸 나쁜 후기 · 평판 −4', ok ? 'good' : 'bad');
  log('📸 인플루언서 ' + c.name + ' — ' + (ok ? '「여기 분위기 최고」 후기' : '「별로였다」 후기') + ' (만족 ' + Math.round(c.sat) + ')', ok ? 'good' : 'bad');
  evNote('influencer', ok, '인플루언서 만족 ' + Math.round(c.sat) + ' — 평판 ' + (ok ? '+5' : '−4'));
}
function nextName() {
  for (var k = 0; k < NAMES.length; k++) {
    var nm = NAMES[G.nameIx++ % NAMES.length];
    if (!G.customers.some(function (c) { return c.alive && c.name === nm; })) return nm;
  }
  return NAMES[G.nameIx++ % NAMES.length] + '2';
}

// ── 효과 — 떠오르는 글자 · 칩 튐 · 꽃가루 ───────────
var FX = { floats: [], parts: [], moves: [] };
/* 물체를 from → to 로 dur 초에 옮긴다. arc 만큼 포물선. 끝나면 done */
function moveTo(obj, from, to, dur, delay, done, arc) {
  obj.position.copy(from);
  FX.moves.push({ o: obj, a: from.clone(), b: to.clone(), dur: dur, delay: delay || 0, t: 0, done: done, arc: arc || 0 });
}
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
  FX.moves = FX.moves.filter(function (m) {
    m.t += dt;
    if (m.t < m.delay) return true;
    var k = Math.min(1, (m.t - m.delay) / m.dur);
    m.o.position.lerpVectors(m.a, m.b, k);
    m.o.position.y += Math.sin(Math.PI * k) * m.arc;
    if (k >= 1) { if (m.done) m.done(); return false; }
    return true;
  });
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
  G.servers.concat([G.counterStaff, G.cleaner, G.floorStaff, G.player]).forEach(function (a) { if (a) scene.remove(a.mesh); });
  G.spills.forEach(function (s) { scene.remove(s.mesh); });
  FX.parts.forEach(function (p) { scene.remove(p.m); });
  FX.moves = []; FX.parts = []; FX.floats = [];
  (G.glasses || []).forEach(function (g) { scene.remove(g.mesh); }); G.glasses = [];
  if (G.inspector) { scene.remove(G.inspector.mesh); G.inspector = null; }
}

function newDay() {
  clearActors();
  G.customers = []; G.tasks = []; G.spills = []; G.queue = []; G.log = [];
  G.simT = 0; G.nextArrival = 2; G.nextSpill = 50 + Math.random() * 20; G.winner = null; G.winnerAt = null;
  G.finalized = false; G.speed = 1; G.paused = false; G.dispRev = 0; G.counterRate = 0; G.counterProg = 0; G.announced = {}; G.finalDone = false; G.lastAnnMin = OPEN_MIN;
  G.nameIx = rnd(NAMES.length);
  G.stock = G.cfg.stock;
  G.stats = {
    entries: 0, unique: 0, drinks: 0, noStock: 0, right: 0, wrong: 0, missed: 0, lost: 0, angry: 0,
    satSum: 0, satN: 0, repStart: G.rep, ann: 0, annMiss: 0, annWrong: 0, cleaned: 0, spillSec: 0,
    balanced: 0, balanceMiss: 0, queueLeave: 0, annByStaff: 0, regVisits: 0, depositRev: 0,
    events: [], fines: 0, mixFee: 0, maxCombo: 0, quick: 0
  };
  G.grownToday = []; G.combo = 0;
  G.evPlan = planEvents(); G.groupArr = []; G.groupBoost = 0; G.blackout = false;
  if (LIGHT.hemi) { LIGHT.hemi.intensity = 0.55; LIGHT.sun.intensity = 0.85; decor.breakerLamp.visible = false; }
  G.regulars.forEach(function (r) { r.inHouse = false; r.reserved = false; });
  G.regDelta = []; G.friends = []; G.resv = null;
  G.chipIssueAt = G.cfg.chipOk === false ? 60 + Math.random() * 120 : null;

  applyDecor();
  G.tables = TABLE_DEF.slice(0, tableCount()).map(function (t, i) {
    t.alarm.visible = false;
    t.cards.forEach(function (c) { c.visible = false; });
    t.board.forEach(function (m) { m.visible = false; });
    return {
      id: i, def: t, name: t.name, seats: [null, null, null, null, null, null],
      dealer: null, handT: 0, pos: null, last: null, needsDraw: true, changed: false,
      call: null, hands: 0, broken: false, bustedLast: [], shortSince: null
    };
  });
  /* 출근 — 2일차부터는 출근율만큼만 나온다. 노쇼한 사람은 일당이 없다 */
  G.dealers = []; G.servers = []; G.counterStaff = null; G.cleaner = null; G.floorStaff = null;
  G.absent = []; G.temps = []; G.pending = [];
  G.roster.forEach(function (st) {
    if (G.day >= 2 && !chance(relOf(st))) { G.absent.push(st); return; }
    spawnStaff(st, false);
  });
  G.onCall = genOnCall();
  G.player = makeActor(makePerson(0x22304A, 0xD8B35A, 0xEF9F27), 'player', '점장');
  G.player.mesh.position.copy(SPOTS.playerHome);
  G.player.spd = 4.2;
}

/* 직원 한 명을 매장에 세운다. arriving 이면 문으로 걸어 들어와 자리에 간 뒤부터 일한다 */
function spawnStaff(st, arriving) {
  var a;
  if (st.role === 'dealer') {
    a = makeActor(makePerson(0xf2f2f2, 0x1c1c1c, null, { bow: true }), 'dealer', st.name);
    a.id = G.dealers.length; a.acc = st.skill; a.speed = st.speed; a.fatigue = 0; a.table = null; a.fresh = 0;
    a.home = SPOTS.dealerRest.clone().add(V((a.id % 5) * 0.55 - 1.1, 0));
    G.dealers.push(a);
  } else if (st.role === 'server') {
    a = makeActor(makePerson(0xE6B94A), 'staff', st.name);
    a.home = SPOTS.staffHome.clone().add(V(G.servers.length * 1.2, 0));
    var tray = new THREE.Group();
    var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), mat(0x9aa3a8, { metalness: 0.5, roughness: 0.3 }));
    var gl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.16, 10), mat(0xD99A2B, { roughness: 0.2 }));
    gl.position.y = 0.09; tray.add(disc, gl);
    tray.position.set(0.3, 1.05, 0.1); tray.visible = false;
    a.mesh.add(tray); a.tray = tray;
    G.servers.push(a);
  } else if (st.role === 'counter') {
    a = makeActor(makePerson(0x9AA5B1, 0x2C4A7A), 'counter', st.name);
    a.home = V(8.9, 1.5); G.counterStaff = a;
  } else if (st.role === 'cleaner') {
    a = makeActor(makePerson(0x6FA8A0), 'cleaner', st.name);
    a.home = SPOTS.cleanerHome.clone(); G.cleaner = a;
  } else {
    a = makeActor(makePerson(0x2E6E52, 0xD8B35A), 'floor', st.name);
    a.home = SPOTS.floorHome.clone(); G.floorStaff = a;
  }
  a.staff = st; a.busy = false; a.cool = 3 + Math.random() * 2;
  if (!arriving) { a.mesh.position.copy(a.home); return a; }
  a.busy = true; a.arriving = true;
  a.mesh.position.copy(SPOTS.outside);
  walkTo(a, [SPOTS.door, a.home], function () {
    a.busy = false; a.arriving = false;
    say(a, '출근했습니다! 🙌', 2.2);
    floatText(a.mesh.position.clone().setY(1.9), ROLES[st.role].ko + ' 합류', 'good');
    SFX.good();
    log(ROLES[st.role].ko + ' ' + st.name + ' 출근' + (st.temp ? ' (대타)' : ''), 'good');
    if (st.role === 'dealer') {
      var empty = G.tables.filter(function (t) { return t.dealer === null && !t.broken; })[0];
      if (empty) assignDealer(empty, a);
    }
  }, 3);
  return a;
}
function assignDealer(t, d) {
  t.dealer = d.id; d.table = t.id;
  walkTo(d, [dealerPos(t.def)], function () { faceTo(d, V(t.def.cx, t.def.cz)); });
}
/* 오늘 밤 부를 수 있는 대타 — 일당 1.3배, 오늘만. 가끔 연락이 끊긴다 */
function genOnCall() {
  var roles = shuffle(['counter', 'cleaner', 'floor']).slice(0, 1).concat(['dealer', 'server']);
  var used = G.roster.map(function (x) { return x.name; });
  return roles.map(function (role) {
    var nm = pick(STAFF_NAMES.filter(function (n) { return used.indexOf(n) < 0; }));
    used.push(nm);
    var skill = 55 + rnd(26);
    var st = { id: ++G.staffSeq, name: nm, role: role, skill: skill, days: 0, temp: true, rel: 0.9, trait: rollTrait(), morale: 65 + rnd(15) };
    if (role === 'dealer') st.speed = Math.round((0.9 + Math.random() * 0.25) * 100) / 100;
    st.wage = Math.round(wageOf(role, skill) * 1.3 / 10000) * 10000;
    return st;
  });
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
function approachPoint(t) { return approachFrom(t, G.player.mesh.position); }
function approachFrom(t, p) {
  // 테이블 가장자리에서 그 사람 쪽으로 가장 가까운 자리
  var c = V(t.def.cx, t.def.cz);
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
G.startEvent = function (type) { return startEvent(type); };   // 자동 점검용
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
  G.player.keyWalk = !!(f || r);
  if (!f && !r) return;
  swingArms(G.player.mesh, Math.sin(G.simT * 14) * 0.6);
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
  if (G.owned.mix && chance(0.12)) return 'pro';   // 믹스 테이블이 있으면 고수가 더 온다
  if (chance(0.12 * diffK())) return 'rude';         // 주가 갈수록 까다로운 손님이 는다
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

function spawnCustomer(opt) {
  opt = opt || {};
  var r = opt.reg !== undefined ? opt.reg : (opt.resv || opt.friend || opt.vip || opt.group ? null : pickRegular());
  var type = opt.vip ? 'pro' : (r ? r.type : pickType());
  var c = makeActor(makePerson(CUST_TYPES[type].color, null, opt.vip ? 0xC77DFF : (r ? 0xD8B35A : null)), 'cust', r ? r.name : nextName());
  c.id = G.customers.length; c.type = type; c.alive = true; c.state = 'arrive';
  c.sat = 70 + (STACKS[stackIdx()].sat * 50); c.table = null; c.seat = null; c.barSpot = null;
  c.entries = 0; c.lastDrink = -99; c.leaveAt = 0; c.nextTalk = G.simT + 8 + Math.random() * 20;
  c.reg = r || null; c.resv = !!opt.resv;
  c.mesh.position.copy(SPOTS.outside);
  G.customers.push(c);
  if (r) {
    r.inHouse = true; r.lastDay = G.day;
    c.sat = clamp(c.sat + (r.aff - 50) / 5, 0, 100);
    G.stats.regVisits++;
    say(c, '👋 사장님 저 왔어요! (' + (r.visits + 1) + '번째)', 2.6);
    if (r.aff >= 80 && chance(0.45)) { G.friends.push({ at: G.simT + 2.5, by: r.name }); r.aff = clamp(r.aff + 2, 0, 100); }
  }
  if (c.resv) say(c, '📋 예약했어요!', 2.2);
  if (opt.friend) say(c, '😊 ' + opt.friend + ' 친구예요', 2.4);
  if (opt.vip) { c.vip = true; say(c, '📸 여기가 그 홀덤펍?', 2.6); }
  if (opt.group) { c.group = true; say(c, pick(['👥 단체예요!', '우리 여섯 명이요~', '자리 있죠?']), 2.2); }
  joinQueue(c, c.resv);
  return c;
}
function joinQueue(c, priority) {
  if (G.queue.length >= QUEUE.length) {
    G.stats.lost++;
    c.bounced = true;   // 들어오지도 못했다 — 인플루언서 후기를 매기지 않는다
    leave(c, '등록 줄이 너무 길다');
    say(c, '줄이 왜 이렇게 길어…', 2.5);
    return;
  }
  /* 예약 손님은 지금 처리 중인 사람 바로 뒤로 들어간다 — 「예약 확인」 */
  if (priority && G.queue.length) G.queue.splice(1, 0, c); else G.queue.push(c);
  c.state = 'queue';
  walkTo(c, [SPOTS.door, QUEUE[G.queue.indexOf(c)]]);
  if (priority) advanceQueue();
}
function advanceQueue() {
  G.queue.forEach(function (c, i) { if (c.state === 'queue') walkTo(c, [QUEUE[i]]); });
}

/* 카운터 — 점장이 서 있거나 카운터 직원이 있으면 빠르다 */
function tickCounter(dt) {
  if (!G.queue.length) { G.counterProg = 0; return; }
  var head = G.queue[0];
  if (head.mesh.position.distanceTo(QUEUE[0]) > 0.3) return;
  var rate = G.counterRate = playerNear(V(8.2, 1.7), 1.6) ? 1 : (G.counterStaff && !G.counterStaff.arriving ? (0.55 + G.counterStaff.staff.skill / 220) * staffSpd(G.counterStaff.staff) : 0.28);
  if (head.group && G.groupBoost > G.simT) rate *= 2;   // 단체를 맞았다 — 한꺼번에 등록
  G.counterProg += dt * rate;
  if (G.queue.length >= 3) tip('queue', '등록 줄이 길어진다 — 카운터 뒤로 걸어가면 빨리 처리된다. 카운터 직원을 채용해도 된다.');
  G.queue.forEach(function (c, i) { if (i > 1) c.sat = clamp(c.sat - 0.25 * dt * (1 + 0.5 * diffK()), 0, 100); });
  if (G.queue.length >= 4 && chance(dt * 0.15)) say(pick(G.queue.slice(2)), '등록 왜 이렇게 느려요', 2.5);
  if (G.counterProg >= (head.resv ? 1.6 : 3.2)) {
    G.counterProg = 0;
    G.queue.shift();
    advanceQueue();
    register(head);
  }
}

function register(c) {
  if (!regOpen()) { say(c, '마감이에요? 한잔만 하고 갈게요', 2.5); toBar(c, 'drink'); return; }
  c.entries++; c.mixPaid = false;
  G.stats.entries++;
  if (c.entries === 1) G.stats.unique++;
  G.dayRevenue += fee();
  floatText(V(8.2, 2.4).setY(1.8), '+' + won(fee()), 'money');
  floatText(c.mesh.position.clone().setY(2.0), '🎟️ #' + G.stats.entries, 'good');
  say(c, c.entries > 1 ? '🎟️ 다시 간다!' : '🎟️ 등록 완료!', 1.6);
  var cols = [0xd9dedb, 0x2e6e52, 0xb23a2e, 0x2c4a7a];
  for (var ci = 0; ci < 5; ci++) {
    (function (m) {
      scene.add(m);
      moveTo(m, V(8.2, 2.4).setY(1.2), c.mesh.position.clone().setY(1.0), 0.45, ci * 0.06, function () { scene.remove(m); }, 0.6);
    })(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 12), mat(cols[ci % 4])));
  }
  pulse('entries'); pulse('money');
  SFX.cash();
  log(c.name + '(' + CUST_TYPES[c.type].ko + ') ' + (c.entries > 1 ? '리엔트리' : '등록') + ' — 참가비 ' + won(fee()));
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
  regDone(c); vipDone(c);
  if (c.dealerSt && c.sat >= 75) addXP(c.dealerSt, 'v', 3);   // 만족하고 간 손님 — 그 테이블 딜러의 응대 경험
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
  c.dealerSt = t.dealer !== null && G.dealers[t.dealer] ? G.dealers[t.dealer].staff : null;   // 응대 경험치를 줄 딜러
  if (isMix(t) && !c.mixPaid) {   // 믹스 테이블 — 앉을 때 믹스 참가비
    c.mixPaid = true;
    G.dayRevenue += MIX_FEE; G.stats.mixFee += MIX_FEE;
    floatText(seatPos(t.def, s).setY(1.9), '🃏 +' + won(MIX_FEE), 'money'); pulse('money');
  }
  c.table = t.id; c.seat = s; c.barSpot = null; c.state = 'to-seat';
  walkTo(c, [seatPos(t.def, s)], function () {
    c.state = 'seated'; c.sitting = true;
    faceTo(c, V(t.def.cx, t.def.cz));
  });
}
function heldSeats() {
  var R = G.resv;
  if (!R || !R.open) return 0;
  return R.arrivals.length + R.noshow;   // 아직 안 온 예약 (노쇼할 사람 포함 — 아직 모른다)
}
function seatWaiting() {
  var free = liveTables().filter(function (t) { return !t.call; }).reduce(function (n, t) { return n + safeSeats(t).length; }, 0);
  var held = heldSeats();
  G.customers.filter(function (c) { return c.alive && c.state === 'bar-wait'; })
    .sort(function (a, b) { return (b.resv ? 2 : (b.vip ? 1 : 0)) - (a.resv ? 2 : (a.vip ? 1 : 0)); }).forEach(function (c) {   // 예약 → 인플루언서 → 나머지
    if (!c.resv && free - held <= 0) {
      if (held && chance(0.004)) say(c, '저 자리 비어 있는데요? 🤨', 2.2);
      return;
    }
    var open = liveTables().filter(function (t) { return !t.call && safeSeats(t).length; });
    if (!open.length) return;
    free--;
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

function effAcc(d) {
  var st = d.staff;
  return clamp(d.acc - d.fatigue * 1.1 + (hasT(st, 'careful') ? 5 : 0) + trainOf(st).j * 3 - moralePen(st) * 0.25, 15, 99);
}
function handSpeed(d) {
  var st = d.staff;
  return d.speed * (1 - d.fatigue / 100) * (d.fresh > G.simT ? 1.18 : 1) * (G.owned.shuffler ? 1.1 : 1) *
    (hasT(st, 'fast') ? 1.15 : 1) * (hasT(st, 'chatty') ? 0.93 : 1) * (1 + trainOf(st).s * 0.05) * (1 - moralePen(st) * 0.004);
}

function tickTable(t, dt) {
  var d = t.dealer !== null ? G.dealers[t.dealer] : null;
  var n = seated(t);
  t.def.cards.forEach(function (cg, i) { cg.visible = !!(t.pos && occ(t, i) && n >= 2 && !t.broken); });
  t.def.alarm.visible = !!t.call;
  if (t.call) t.def.alarm.position.y = 2.9 + Math.sin(G.simT * 5) * 0.15;
  if (!t.pos || t.broken || n < 2) t.cards = null;
  showBoard(t);
  if (t.call || !d || t.broken || G.blackout) return;
  if (n < 2) { t.pos = null; t.needsDraw = true; t.handT = 0; return; }
  if (!t.pos) startHand(t);
  t.handT += dt * handSpeed(d);
  if (!t.potMoving) t.def.pot.scale.set(1, 0.5 + 1.6 * Math.min(1, t.handT / 8), 1);
  if (t.handT >= 8) endHand(t);
}
/* 보드 — 핸드 진행(0~8)에 맞춰 플랍 3 · 턴 · 리버 */
function showBoard(t) {
  var n = !t.cards ? 0 : (t.handT >= 6.6 ? 5 : (t.handT >= 5 ? 4 : (t.handT >= 3 ? 3 : 0)));
  if (n === t.shownBoard) return;
  t.shownBoard = n;
  t.def.board.forEach(function (m, i) {
    m.visible = i < n;
    if (i < n && m.material.map !== cardTex(t.cards.board[i])) { m.material.map = cardTex(t.cards.board[i]); m.material.needsUpdate = true; }
  });
  if (n === 3) tone(1500, 0.04, 'triangle', 0.03);
}
/* 핸드마다 실제 덱에서 홀카드(홀덤 2 · PLO 4)와 보드 다섯 장을 돌린다 */
function dealReal(t) {
  var deck = newDeck(), k = isMix(t) ? 4 : 2, holes = {};
  for (var i = 0; i < N; i++) if (occ(t, i)) holes[i] = deck.splice(0, k);
  t.cards = { holes: holes, board: deck.splice(0, 5) };
  t.shownBoard = -1;
}
/* 쇼다운 — 끝까지 간 사람 중 가장 센 핸드가 이긴다. PLO8 은 로우가 있으면 반을 나눈다 */
function showdown(t, contenders) {
  var B = t.cards.board, mix = isMix(t), hi = null, his = [], lo = null, los = [];
  contenders.forEach(function (s) {
    var h = t.cards.holes[s];
    var sc = mix ? bestPLOHigh(h, B) : best(h.concat(B));
    var c = sc ? cmp(sc, hi || [-1]) : -1;
    if (sc && c > 0) { hi = sc; his = [s]; } else if (sc && c === 0) his.push(s);
    if (mix) {
      var l = bestPLOLow(h, B);
      if (l) { var cl = lo ? cmp(l, lo) : -1; if (!lo || cl < 0) { lo = l; los = [s]; } else if (cl === 0) los.push(s); }
    }
  });
  return { hi: hi, his: his, lo: lo, los: los };
}
/* 쇼다운 연출 — 큰 족보(트리플 이상) · 찹 · 로우는 테이블 위에 큰 글자로, 홀덤은 이긴 홀카드를 잠깐 뒤집는다.
   폰에서 보드가 작아도 무슨 일이 났는지 읽힌다 */
function showdownFx(t, ws, sd, chop) {
  var big = sd.hi && sd.hi[0] >= 3, low = sd.lo && sd.los.length;
  var name = G.customers[t.seats[ws]].name;
  if (big || chop || low) {
    var cat = sd.hi ? sd.hi[0] : 0;
    var label = (cat === 5 || cat === 8 ? flushSuit(t.cards.board) + ' ' : '') + (sd.hi ? CAT[cat] : '') + ' — ' + name + (chop ? ' (찹)' : '') +
      (low ? ' · 🌙 로우 ' + G.customers[t.seats[sd.los[0]]].name : '');
    floatText(V(t.def.cx, t.def.cz).setY(2.6), label, cat >= 6 ? 'hand big' : 'hand');
    FX.floats[FX.floats.length - 1].life = 2.6;   // 큰 족보는 조금 더 오래 떠 있는다
    G.stats.bigHands = (G.stats.bigHands || 0) + (cat >= 6 ? 1 : 0);
    if (cat >= 6) { tone(784, 0.12, 'triangle', 0.06); tone(1175, 0.18, 'triangle', 0.06, 0.1); }
  }
  if (isMix(t) || !t.cards.holes[ws]) return;
  // 좌석 카드는 곧 다음 핸드로 다시 날아가므로 건드리지 않고, 앞면 두 장을 따로 2.5초 띄운다
  var hole = t.cards.holes[ws], cp = seatPos({ cx: 0, cz: 0 }, ws, -0.15), g = new THREE.Group();
  if (!SHOW_GEO) SHOW_GEO = new THREE.PlaneGeometry(0.3, 0.42);
  hole.forEach(function (c, i) {
    var m = new THREE.Mesh(SHOW_GEO, new THREE.MeshBasicMaterial({ map: cardTex(c) }));
    m.rotation.x = -Math.PI / 2; m.position.set(i * 0.34 - 0.17, 0, 0); g.add(m);
  });
  g.position.set(cp.x, 0.95, cp.z); g.rotation.y = -SEAT_ANG[ws] * Math.PI / 180 + Math.PI / 2;
  g.userData.show = true;
  t.def.group.add(g);
  setTimeout(function () { t.def.group.remove(g); g.children.forEach(function (m) { m.material.dispose(); }); }, 2500);   // 재질만 버린다 — 텍스처는 CARD_TEX 캐시
}
var SHOW_GEO = null;
function flushSuit(cards) {
  var cnt = [0, 0, 0, 0];
  cards.forEach(function (c) { cnt[c.s]++; });
  var m = Math.max.apply(null, cnt);
  return m >= 3 ? SUITS[cnt.indexOf(m)].s : '♠';
}

function endHand(t) {
  t.hands++;
  if (t.dealer !== null) addXP(G.dealers[t.dealer].staff, 's', 1);   // 핸드를 돌릴수록 손이 빨라진다
  t.handT = 0;
  var lv = level(), p = Math.min(0.14, 0.025 + lv * 0.007) * STACKS[stackIdx()].bust * (regOpen() ? 1 : 3.2);   // 마감 뒤엔 결판을 향해 빨라진다
  var occs = [];
  for (var i = 0; i < N; i++) if (occ(t, i) && t.cards && t.cards.holes[i]) occs.push(i);
  if (!occs.length) { startHand(t); return; }
  // 끝까지 간 사람 2~4명 — 나머지는 중간에 폴드했다. 레지 마감 뒤엔 올인이 잦아 모두 쇼다운까지 (결판이 나게)
  var contenders = shuffle(occs.slice()).slice(0, regOpen() ? Math.min(occs.length, 2 + rnd(3)) : occs.length);
  var sd = showdown(t, contenders);
  var winners = sd.his.length ? sd.his : [contenders[0]];
  var losers = contenders.filter(function (s) { return winners.indexOf(s) < 0 && sd.los.indexOf(s) < 0; });
  // 탈락은 진 사람 중에서 — 전체 탈락률이 예전과 비슷하도록 확률을 키운다
  var pl = Math.min(0.9, p * occs.length / Math.max(1, losers.length));
  var busted = [];
  losers.forEach(function (s) { if (busted.length < occs.length - 1 && chance(pl)) busted.push(s); });
  t.bustedLast = busted.map(function (s) { return { seat: s, name: G.customers[t.seats[s]].name }; });
  var ws = winners[0], pot = t.def.pot, home = V(0, 0);
  var toward = seatPos({ cx: 0, cz: 0 }, ws, -0.5);
  t.potMoving = true;
  moveTo(pot, home, toward, 0.35, 0, function () { pot.position.copy(home); pot.scale.set(1, 0.5, 1); t.potMoving = false; }, 0.1);
  var wc = G.customers[t.seats[ws]];
  t.lastResult = { name: wc.name, hand: sd.hi ? handName(sd.hi) : '', split: winners.length > 1, low: sd.lo && sd.los.length ? G.customers[t.seats[sd.los[0]]].name : null };
  if (sd.hi && sd.hi[0] >= 4 && chance(0.6)) {
    var cat = sd.hi[0];
    say(wc, (cat === 5 || cat === 8 ? flushSuit(t.cards.board) + ' ' : '') + CAT[cat] + '!' + (cat >= 6 ? ' 🔥' : ''), 2.2);
  } else if (winners.length > 1) say(wc, '찹! 반반이네요 🤝', 1.8);
  else if (chance(0.3)) say(wc, pick(['나이스!', '팟 가져갑니다~', '이게 되네 ㅋㅋ']), 1.8);
  if (sd.lo && sd.los.length && sd.los[0] !== ws && chance(0.5)) say(G.customers[t.seats[sd.los[0]]], '로우 반 가져갑니다 🌙', 1.8);
  showdownFx(t, ws, sd, winners.length > 1);
  SFX.chips();
  if (busted.length) chipBurst(V(t.def.cx, t.def.cz), 12);
  busted.forEach(function (s) { bust(t, s); });
  startHand(t);
}

function dealCards(t) {
  var from = V(0, RZ + 0.25).setY(0.95), k = 0;
  for (var i = 0; i < N; i++) {
    var s = (t.pos.btn + 1 + i) % N;
    if (!occ(t, s)) continue;
    var cg = t.def.cards[s];
    moveTo(cg, from, cg.userData.home, 0.22, (k++) * 0.05, null, 0.15);
  }
}
function startHand(t) {
  if (seated(t) < 2) { t.pos = null; t.needsDraw = true; return; }
  var prev = t.last;
  var pos = positionsFor(t);
  var changed = t.changed;
  t.pos = pos; t.last = { btn: pos.btn, sbSeat: pos.sbSeat, bb: pos.bb };
  t.needsDraw = false; t.changed = false;
  dealCards(t);
  dealReal(t);
  var d = G.dealers[t.dealer];
  var miss = 1 - effAcc(d) / 100;
  var mixK = (isMix(t) && !mixOk(d.staff) ? 2 : 1) * (1 + 0.5 * diffK());   // 믹스 자격 없는 딜러 — 사고 2배 · 주가 갈수록 사고 +50% 까지
  /* 버튼 · 블라인드 이의는 좌석이 바뀔 때마다 노릴 수 있어 너무 잦았다(1.2: 하루 호출의 ⅓) — 확률을 낮추고 연달아 내지 않는다 */
  if (changed && !pos.draw && prev && seated(t) >= 4 && G.lastCall !== 'pos' && chance(Math.min(0.25, (0.02 + miss * 0.3) * mixK))) {
    createCall(t, 'pos', { prev: prev, pos: pos, busted: t.bustedLast.slice(), snap: snapSeats(t) });
    return;
  }
  if (chance(Math.min(0.85, (0.06 + miss * 0.4) * mixK))) {
    /* 믹스(팟 리밋) 테이블은 레이즈 금액 판정을 내지 않는다 — 원문 대조 전 */
    var types = isMix(t) ? ['btn', 'cnt', 'case', 'case', 'case'] : ['btn', 'cnt', 'under', 'case', 'case', 'case', 'case', 'case', 'spot', 'spot'];   // 케이스 판정 27건이 가장 많이 나온다 · 🔍 딜러 실수는 홀덤만(약 20%)
    var type = pick(types.filter(function (x) { return x === 'case' || x !== G.lastCall; }));   // 같은 종류 판정을 연달아 내지 않는다
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
/* 🔍 딜러 실수 잡기 (1.5) — TDA 규칙이 아니라 족보 · 셈. 홀덤 테이블에서만.
   win: 리버까지 간 셋의 진짜 족보로 누가 이기나(키커 · 찹이 나오게 비슷한 패를 더 고른다)
   side: 올인 셋의 메인 · 사이드 팟 금액 */
function cardHtml(c) { return '<span class="pc' + (SUITS[c.s].red ? ' r' : '') + '">' + CARD_RANKS[c.r].replace('T', '10') + SUITS[c.s].s + '</span>'; }
function scoreRanks(sc) { return sc.slice(1).map(function (r) { return CARD_RANKS[r].replace('T', '10'); }).join(' · '); }
function spotNames(t) {
  var names = shuffle(t.seats.filter(function (x) { return x !== null; }).map(function (id) { return G.customers[id].name; }));
  var extra = shuffle(NAMES.filter(function (n) { return names.indexOf(n) < 0; }));
  while (names.length < 3) names.push(extra.pop());
  return names.slice(0, 3);
}
function genSpot(t) {
  var names = spotNames(t);
  if (chance(0.62)) {
    var deal = null;
    for (var k = 0; k < 120 && !deal; k++) {
      var deck = newDeck(), board = deck.splice(0, 5), holes = [0, 1, 2].map(function () { return deck.splice(0, 2); });
      var sc = holes.map(function (h) { return best(h.concat(board)); });
      var order = [0, 1, 2].sort(function (a, b) { return cmp(sc[b], sc[a]); });
      var close = sc[order[0]][0] === sc[order[1]][0];   // 1 · 2등이 같은 족보 — 키커 · 찹 싸움
      if (close || k > 80) deal = { board: board, holes: holes, sc: sc, order: order };
    }
    var top = deal.sc[deal.order[0]], wins = [0, 1, 2].filter(function (i) { return cmp(deal.sc[i], top) === 0; });
    var pushTo = chance(0.3) ? wins[0] : deal.order[wins.length];   // 딜러가 맞게 밀 때도 있다 — 손님 이의가 틀릴 수도
    if (pushTo === undefined) pushTo = deal.order[2];
    return { kind: 'win', names: names, board: deal.board, holes: deal.holes, sc: deal.sc, wins: wins, pushTo: pushTo };
  }
  var u = 500, a = (6 + rnd(15)) * u, b = a + (4 + rnd(12)) * u, c = b + (chance(0.5) ? 0 : (3 + rnd(8)) * u);
  return { kind: 'side', names: names, a: a, b: b, c: c, ask: chance(0.5) ? 'main' : 'side' };
}
function spotQuestion(d) {
  var N3 = d.names;
  if (d.kind === 'win') {
    var chop = d.wins.length > 1;
    var opts = [0, 1, 2].map(function (i) { return N3[i] + '의 팟'; }).concat(['찹 — 나눈다']);   // 찹은 이름 선택지와 길이를 맞춘다
    var correct = chop ? 3 : d.wins[0];
    var body = '<p>리버까지 셋이 갔다. 딜러가 팟을 <b>' + N3[d.pushTo] + '</b>에게 밀려는데 다른 손님이 "잠깐만요" 한다.</p>' +
      '<div class="pboard"><small>보드</small>' + d.board.map(cardHtml).join('') + '</div>' +
      '<div class="pholes">' + [0, 1, 2].map(function (i) { return '<div><small>' + N3[i] + '</small>' + d.holes[i].map(cardHtml).join('') + '</div>'; }).join('') + '</div>' +
      '<p class="caseq"><b>이 팟은 누구 것인가?</b></p>';
    var why = [0, 1, 2].map(function (i) { return N3[i] + ' — ' + handName(d.sc[i]) + ' (비교 ' + scoreRanks(d.sc[i]) + ')'; }).join('<br>') + '<br>' +
      (chop ? '가장 좋은 다섯 장이 똑같다 — <b>' + d.wins.map(function (i) { return N3[i]; }).join(' · ') + ' 찹</b>. 보드가 이기는 카드면 홀카드는 상관없다.'
        : '<b>' + N3[d.wins[0]] + '</b>의 다섯 장이 가장 높다. 같은 족보면 위 「비교」 순서대로 한 장씩 견준다(키커).') +
      (d.pushTo === d.wins[0] && !chop ? ' 딜러가 맞게 밀었다 — 이의는 틀렸다.' : '');
    return { title: '팟이 엉뚱한 사람에게 가나?', body: body, opts: opts, correct: correct, why: why, shuffle: true };
  }
  var main = 3 * d.a, side = 2 * (d.b - d.a), back = d.c - d.b, ask = d.ask === 'main';
  var right = ask ? main : side;
  /* 오답은 정답보다 작은 것 · 큰 것을 섞는다 — 「가장 작은 수」 · 「가운데 수」가 답이 되지 않게(정답의 크기 순위가 고르게) */
  var ok = function (v) { return v > 0 && v !== right; };
  var lowP = (ask ? [2 * d.a, right - 1000, right - 1500] : [d.b - d.a, right - 1000, right - 500]).filter(ok);
  var highP = (ask ? [2 * d.a + d.b, d.a + 2 * d.b, 3 * d.b, right + 1000] : [3 * (d.b - d.a), right + (back || 1000), 2 * d.b - d.a, right + 1500]).filter(ok);
  var nLow = rnd(3), wrongs = shuffle(lowP).slice(0, nLow);
  shuffle(highP).forEach(function (v) { if (wrongs.length < 2 && wrongs.indexOf(v) < 0) wrongs.push(v); });
  shuffle(lowP).forEach(function (v) { if (wrongs.length < 2 && wrongs.indexOf(v) < 0) wrongs.push(v); });
  var vals = [right].concat(wrongs.slice(0, 2));
  var bodyS = '<p>' + N3[2] + josa(N3[2], '이', '가') + ' <b>' + won(d.c) + '</b>을 베팅했다. ' + N3[0] + josa(N3[0], '은', '는') + ' <b>' + won(d.a) + '</b> 올인, ' +
    N3[1] + josa(N3[1], '은', '는') + ' <b>' + won(d.b) + '</b> 올인으로 받았다.</p><p class="note">이 베팅만 센다 — 블라인드 · 앞선 칩은 빼고.</p>' +
    '<p>딜러가 팟을 나누다 손이 멈췄다.</p><p class="caseq"><b>' + (ask ? '메인 팟' : '사이드 팟') + '은 얼마인가?</b></p>';
  var whyS = '메인 팟 = 가장 작은 올인 ' + won(d.a) + ' × 3명 = <b>' + won(main) + '</b> (셋 다 다툰다).<br>' +
    '사이드 팟 = (' + won(d.b) + ' − ' + won(d.a) + ') × 2명 = <b>' + won(side) + '</b> (' + N3[1] + ' · ' + N3[2] + '만 다툰다).' +
    (back ? '<br>' + N3[2] + '의 나머지 ' + won(back) + '은 아무도 받지 못했으니 돌려준다 — 팟에 넣지 않는다.' : '');
  return { title: '팟을 어떻게 나누나?', body: bodyS, opts: vals.map(function (v) { return won(v) + '원'; }), correct: 0, why: whyS, shuffle: true };
}
function genIncident(t, type) {
  if (type === 'case') return genCase(t);
  if (type === 'spot') { var sp = genSpot(t); sp.q = spotQuestion(sp); sp.order = sp.q.shuffle ? shuffle(sp.q.opts.map(function (o, i) { return i; })) : sp.q.opts.map(function (o, i) { return i; }); return sp; }
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
  if (type === 'cnt') { var s2 = pick(order); data.seat = s2; data.who = G.customers[t.seats[s2]].name; data.n = isMix(t) ? pick([3, 5]) : (chance(0.5) ? 1 : 3); }
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
  G.lastCall = type;
  t.call = task;
  var d = G.dealers[t.dealer];
  say(d, '플로어! ✋', 3);
  tip('call', '🚨 플로어 호출! 오른쪽 목록이나 테이블을 누르면 점장이 걸어가고, 도착하면 판정 창이 열린다. 30초 안에.');
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
    G.stats.right++; G.rep = clamp(G.rep + 1.5, 0, 100); comboHit(true);
    cs.forEach(function (c) { c.sat = clamp(c.sat + 8, 0, 100); });
    var who = task.type === 'case' && task.data ? cs.filter(function (c) { return c.name === task.data.names[0]; })[0] : null;
    if (who) say(who, pick(['아… 인정합니다 🙇', '룰이 그렇다면야', '오늘 하나 배웠네요', '다음엔 조심할게요']), 2.6);
    var fan = cs.filter(function (c) { return c !== who; });
    if (fan.length) say(pick(fan), G.combo >= 3 ? pick(['👏👏 오늘 플로어 미쳤다', '👏 판정 장인', '👏 이 펍 믿고 친다']) : pick(['깔끔하네요 👍', '역시 점장님', '오케이 인정']), 2.4);
    if (G.combo >= 3) SFX.chips();
    floatText(at, '평판 +1.5', 'good');
    SFX.good();
  } else if (result === 'wrong') {
    G.stats.wrong++; G.rep = clamp(G.rep - 3, 0, 100); comboHit(false);
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
    G.stats.missed++; G.rep = clamp(G.rep - 3, 0, 100); comboHit(false);
    cs.forEach(function (c) { c.sat = clamp(c.sat - 12, 0, 100); });
    floatText(at, '평판 −3', 'bad');
    if (cs.length) say(pick(cs), '플로어 안 와요?! 😤', 3);
    log(t.name + ' — 아무도 오지 않아 딜러가 알아서 처리했다', 'bad');
    SFX.bad();
  }
  if (task.misdeal) { t.handT = 0; if (t.pos) dealReal(t); }   // 미스딜 — 다시 딜한다
  var dl = t.dealer !== null ? G.dealers[t.dealer] : null;   // 멘탈 약함 — 자기 테이블이 틀리면 흔들린다
  if (dl && result !== 'missed') addXP(dl.staff, 'j', result === 'right' ? 20 : 5);   // 옆에서 판정을 보고 배운다
  if (dl && result === 'wrong' && hasT(dl.staff, 'fragile')) { addMorale(dl.staff, -8); say(dl, '🥲 제 탓 같아요…', 2.2); }
}

/* 아나운스 — 블라인드 업 · 레지 마감 30분 전 · 레지 마감 · 파이널 테이블 */
function checkAnnouncements() {
  var lv = level();
  if (lv > 0 && !G.announced['lv' + lv]) {
    G.announced['lv' + lv] = true;
    /* 레벨마다 바로 — 블라인드 시계가 바뀌는 순간 할 일이 뜬다 */
    flashClock();
    if (G.owned.mic) {
      var bm = BLINDS[lv];
      SFX.mic();
      floatText(V(6.4, 1.6).setY(2.2), '📢 레벨 ' + (lv + 1) + ' ' + won(bm[0]) + '/' + won(bm[1]), 'good');
    } else {
      addTask({ kind: 'announce', type: 'level', lv: lv, limit: ANNOUNCE_LIMIT });
      SFX.call();
      tip('ann', '📢 블라인드가 올랐다! 8초 안에 맞게 안내하면 정시 안내 보너스. 구조표에서 지금 시각의 줄을 읽는다. 플로어 보조나 자동 방송 시스템에 맡길 수도 있다.');
    }
  }
  if (gameMin() >= regCloseMin() - 30 && !G.announced.regwarn) {
    G.announced.regwarn = true;
    addTask({ kind: 'announce', type: 'regwarn', limit: ANNOUNCE_LIMIT });
  }
  if (!regOpen() && !G.announced.regclose) {
    G.announced.regclose = true;
    addTask({ kind: 'announce', type: 'regclose', limit: ANNOUNCE_LIMIT + 10 });
    toast(clock(regCloseMin()) + ' — 레지 마감. 아나운스하세요');
  }
}

function annMissed(task) {
  removeTask(task);
  G.stats.annMiss++;
  G.rep = clamp(G.rep - 0.8, 0, 100);
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
    tip('balance', '⚖️ 테이블 인원이 두 명 이상 차이 난다. 많은 쪽 테이블로 걸어가면 한 명을 옮긴다.');
    small.shortSince = G.simT;
  }
}
function doBalance(task, who) {
  var big = G.tables[task.table], small = G.tables[task.to];
  removeTask(task);
  if (seated(big) - seated(small) < 2 || !safeSeats(small).length) { toast('이미 맞춰졌다'); return; }
  var occs = []; for (var i = 0; i < N; i++) if (occ(big, i)) occs.push(i);
  var s = pick(occs), c = G.customers[big.seats[s]];
  big.seats[s] = null; big.changed = true;
  seatCustomer(c, small, pick(safeSeats(small)));
  say(c, '자리 옮길게요~', 2);
  if (who) say(who, '⚖️ 밸런싱합니다', 1.8);
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
  tip('spill', '🧽 음료가 쏟아졌다. 그 자리를 누르면 점장이 가서 닦는다. 젖어 있는 동안 주변 손님 만족도가 샌다.');
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
      var cspd = (2 + cl.staff.skill / 40) * staffSpd(cl.staff);
      walkTo(cl, [target.mesh.position.clone()], function () {
        if (G.spills.indexOf(target) >= 0) { target.cleaning = G.simT + 1.5; say(cl, '🧹', 1.5); }
        setTimeout(function () { walkTo(cl, [SPOTS.cleanerHome], function () { cl.busy = false; }, cspd); }, 50);
      }, cspd);
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

// ═══════════════════════════════════════════════════
// 돌발 이벤트 — 할 일 목록의 kind: 'event'
//   { type, title, desc, ic, pos(), on(task), onTimeout(), limit }
//   누르면 점장이 pos() 로 걸어가고, 도착하면 on(task). 제한 시간이 지나면 onTimeout()
// ═══════════════════════════════════════════════════
var EV_EASY = ['group', 'drunk', 'influencer'];
var EV_ALL = ['group', 'drunk', 'influencer', 'blackout', 'fight', 'exchange', 'inspect'];
var EV_IC = { group: '👥', drunk: '🍻', influencer: '📸', blackout: '💡', fight: '😠', exchange: '💱', inspect: '🧾' };
/* 직원 사기 — ④ 직원 깊이에서 쓴다. 값이 없으면 70 */
function morale(st) { return st && st.morale != null ? st.morale : 70; }
function addMorale(st, n) { if (st) st.morale = clamp(morale(st) + n, 0, 100); }

/* 하루 1~2건(토 +1). 1일차는 쉬운 것 1건. 영업 중 무작위 시각 */
function planEvents() {
  var info = dayInfo(), n, pool;
  if (G.day === 1) { n = 1; pool = EV_EASY.slice(); }
  else {
    var dk = diffK();   // 주가 갈수록 돌발 상황이 잦아진다 — 6주차면 하루 최대 5건
    n = 1 + (chance(0.5) ? 1 : 0) + (info.wd === 5 ? 1 : 0) + (chance(dk * 0.8) ? 1 : 0) + (dk > 0.6 && chance(0.5) ? 1 : 0);
    pool = EV_ALL.slice();
  }
  return shuffle(pool).slice(0, n).map(function (type) {
    var lo = type === 'group' ? 30 : 45, hi = type === 'group' ? 170 : 290;
    return { type: type, at: lo + Math.random() * (hi - lo), tries: 0 };
  }).sort(function (a, b) { return a.at - b.at; });
}
function tickEvents() {
  G.evPlan = G.evPlan.filter(function (e) {
    if (G.simT < e.at) return true;
    if (startEvent(e.type)) return false;
    e.tries++; e.at = G.simT + 10;   // 조건이 안 맞으면 10초 뒤 다시
    return e.tries < 8;
  });
  G.groupArr = G.groupArr.filter(function (a) {
    if (G.simT < a.at) return true;
    spawnCustomer({ group: true });
    return false;
  });
}
function evNote(type, ok, note) { G.stats.events.push({ ic: EV_IC[type], ok: ok, note: note }); }
function addEvent(o) {
  o.kind = 'event';
  var task = addTask(o);
  SFX.call();
  log(o.ic + ' ' + o.title + ' — ' + o.desc, 'bad');
  tip('event', '⚡ 돌발 상황! 할 일 목록에서 누르면 점장이 그쪽으로 걸어간다. 제한 시간 안에.');
  return task;
}
function fine(amount, why) {
  G.stats.fines += amount;
  floatText(G.player.mesh.position.clone().setY(2.2), '벌금 −' + won(amount), 'bad');
  log('💸 ' + why + ' — 벌금 ' + won(amount), 'bad');
}
function custNear(p, r) { return G.customers.filter(function (c) { return c.alive && c.state !== 'leaving' && c.mesh.position.distanceTo(p) < r; }); }
function aliveActor(a) { return a && a.alive !== false && a.state !== 'leaving'; }

function startEvent(type) {
  var seatedC = G.customers.filter(function (c) { return c.alive && c.state === 'seated'; });
  var barC = G.customers.filter(function (c) { return c.alive && /^bar-(drink|wait)$/.test(c.state); });
  if (type === 'group') {
    if (!regOpen()) return false;
    for (var i = 0; i < 6; i++) G.groupArr.push({ at: G.simT + i * 1.1 });
    addEvent({ type: type, ic: '👥', title: '단체 손님', desc: '여섯 명이 한꺼번에 온다 — 카운터로', limit: 25,
      pos: function () { return V(8.1, 1.6); },
      on: function (task) {
        removeTask(task);
        G.groupBoost = G.simT + 25;
        say(G.player, '👥 단체 손님 이쪽으로요!', 2.2);
        G.customers.filter(function (c) { return c.alive && c.group; }).forEach(function (c) { c.sat = clamp(c.sat + 6, 0, 100); });
        floatText(V(8.2, 2.4).setY(2.2), '단체 등록 — 빠르게', 'good');
        evNote(type, true, '단체 손님을 카운터에서 맞았다');
        SFX.good();
      },
      onTimeout: function () { evNote(type, false, '단체 손님 — 카운터가 밀렸다'); }
    });
    return true;
  }
  if (type === 'influencer') {
    if (!regOpen() || G.queue.length >= QUEUE.length) return false;   // 줄이 꽉 찼으면 10초 뒤 다시
    var v = spawnCustomer({ vip: true });
    addEvent({ type: type, ic: '📸', title: '인플루언서 방문', desc: '보라 고리 손님 — 가서 인사하기', limit: 30, actor: v,
      pos: function () { return aliveActor(v) ? v.mesh.position.clone() : null; },
      on: function (task) {
        removeTask(task);
        v.sat = clamp(v.sat + 15, 0, 100); v.greeted = true;
        say(G.player, '어서 오세요! 편하게 즐기세요 😊', 2.4);
        say(v, '📸 사장님 친절하시네요', 2.4);
        SFX.good();
      },
      onTimeout: function () { if (aliveActor(v)) { v.sat = clamp(v.sat - 10, 0, 100); say(v, '…아무도 안 반겨 주네', 2.4); } }
    });
    tip('vip', '📸 인플루언서는 나갈 때 만족도가 70 이상이면 평판 +5, 아니면 −4. 반갑게 맞고 음료 · 판정을 챙기자.');
    return true;
  }
  if (type === 'drunk') {
    var dpool = barC.length ? barC : seatedC;   // 바에 아무도 없으면 테이블 손님이 취한다
    if (!dpool.length) return false;
    var d = pick(dpool);
    d.drunk = true; d.leaveAt = Math.max(d.leaveAt || 0, G.simT + 40);
    say(d, '🍻 히끅! 노래 한 곡 할게요~', 3);
    addEvent({ type: type, ic: '🍻', title: '취객 소란', desc: d.name + ' — ' + (d.state === 'seated' ? '테이블' : '바') + '에서 소리친다', limit: 25, actor: d,
      pos: function () { return aliveActor(d) ? d.mesh.position.clone() : null; },
      on: function (task) {
        removeTask(task); d.drunk = false;
        say(G.player, '물 한 잔 드릴게요 — 조금만 쉬었다 가요', 2.6);
        say(d, '…네 죄송해요 😳', 2.2);
        evNote(type, true, d.name + ' 진정시켰다');
        SFX.good();
      },
      onTimeout: function () {
        d.drunk = false;
        if (!aliveActor(d)) { evNote(type, null, '취객이 제풀에 나갔다'); return; }
        custNear(d.mesh.position, 3.2).forEach(function (c) { if (c !== d) { c.sat = clamp(c.sat - 10, 0, 100); say(c, '아 시끄러워… 😒', 2); } });
        if (d.table !== null && G.tables[d.table]) { G.tables[d.table].seats[d.seat] = null; G.tables[d.table].changed = true; }
        leave(d, '소란 끝에 쫓겨났다');
        G.rep = clamp(G.rep - 1, 0, 100);
        evNote(type, false, '취객 소란 — 주변 손님 만족 −10');
      }
    });
    return true;
  }
  if (type === 'blackout') {
    if (G.blackout) return false;
    G.blackout = true;
    LIGHT.hemi.intensity = 0.12; LIGHT.sun.intensity = 0.08;
    decor.breakerLamp.visible = true; decor.neon.visible = false;
    toast('💡 정전! 왼쪽 벽 차단기로 가세요');
    addEvent({ type: type, ic: '💡', title: '정전', desc: '테이블이 멈췄다 — 왼쪽 벽 차단기', limit: 30,
      pos: function () { return V(-12.1, 6); },
      on: function (task) {
        removeTask(task); endBlackout(true);
        say(G.player, '🔌 차단기 올렸습니다!', 2.2);
        G.rep = clamp(G.rep + 1, 0, 100);
        evNote(type, true, '정전 — 차단기를 올렸다');
        SFX.good();
      },
      onTimeout: function () {
        endBlackout(false);
        G.rep = clamp(G.rep - 3, 0, 100);
        shuffle(G.customers.filter(function (c) { return c.alive && /^(seated|bar-wait|bar-drink)$/.test(c.state); })).slice(0, 2).forEach(function (c) {
          if (c.table !== null && G.tables[c.table]) { G.tables[c.table].seats[c.seat] = null; G.tables[c.table].changed = true; }
          say(c, '어두워서 못 하겠다', 2.2); leave(c, '정전이 길어져서');
        });
        evNote(type, false, '정전 30초 넘김 — 손님 이탈 · 평판 −3');
      }
    });
    return true;
  }
  if (type === 'fight') {
    var onT = G.dealers.filter(function (x) { return x.table !== null && !x.arriving; });
    var others = G.dealers.filter(function (x) { return !x.arriving; });
    if (!onT.length || others.length < 2) return false;
    var a = pick(onT), b = pick(others.filter(function (x) { return x !== a; }));
    var t = G.tables[a.table];
    say(a, '😠 그건 네가 잘못했지!', 3); say(b, '😠 뭐라고?', 3);
    addEvent({ type: type, ic: '😠', title: '딜러 다툼', desc: a.name + ' · ' + b.name + ' — ' + t.name, limit: 30, table: t.id,
      pos: function () { return approachFrom(t, G.player.mesh.position); },
      on: function (task) { openFight(task, a, b, t); },
      onTimeout: function () {
        addMorale(a.staff, -6); addMorale(b.staff, -6);
        t.seats.forEach(function (id) { if (id !== null) G.customers[id].sat = clamp(G.customers[id].sat - 6, 0, 100); });
        evNote(type, false, '딜러 다툼을 방치 — 사기 −6');
      }
    });
    return true;
  }
  if (type === 'exchange') {
    var pool = seatedC.concat(barC);
    if (!pool.length) return false;
    var c = pick(pool);
    say(c, '💱 칩 좀 현금으로 바꿔 줘요', 3);
    addEvent({ type: type, ic: '💱', title: '칩 환전 요구', desc: c.name + ' — 칩을 현금으로?', limit: 30, actor: c,
      pos: function () { return aliveActor(c) ? c.mesh.position.clone() : null; },
      on: function (task) { openExchange(task, c); },
      onTimeout: function () {
        if (aliveActor(c)) { c.sat = clamp(c.sat - 10, 0, 100); say(c, '대답도 안 해 주네', 2.2); }
        evNote(type, false, '환전 요구에 답하지 못했다');
      }
    });
    return true;
  }
  if (type === 'inspect') {
    if (G.inspector) return false;
    toast('🧾 12초 뒤 위생 점검원 방문 — 바닥을 확인하세요');
    addEvent({ type: type, ic: '🧾', title: '위생 점검 예고', desc: '12초 뒤 도착 — 젖은 바닥이 있으면 벌금', limit: 12,
      tap: function () { var sp = G.spills.filter(function (s) { return s.cleaning === null; })[0]; if (sp) goClean(sp); else toast('바닥은 깨끗하다 ✨'); },
      onTimeout: inspectorArrives
    });
    return true;
  }
  return false;
}
function endBlackout(byPlayer, quiet) {
  if (!G.blackout) return;
  G.blackout = false;
  LIGHT.hemi.intensity = 0.55; LIGHT.sun.intensity = 0.85;
  decor.breakerLamp.visible = false; decor.neon.visible = !!(THEMES[G.theme] || {}).neon;
  if (G.phase === 'open' && !quiet) { toast(byPlayer ? '💡 불이 들어왔다' : '💡 전기 기사가 와서 복구했다'); log('💡 전기 복구', byPlayer ? 'good' : 'bad'); }
}
function inspectorArrives() {
  var a = makeActor(makePerson(0x444b55, 0xf2f2f2), 'staff', '점검원');
  a.mesh.position.copy(SPOTS.outside);
  G.inspector = a;
  say(a, '🧾 위생 점검 나왔습니다', 2.4);
  walkTo(a, [SPOTS.door, V(2, 3)], function () {
    var wet = G.spills.length;
    if (wet) {
      fine(200000, '위생 점검 — 바닥이 젖어 있었다');
      G.rep = clamp(G.rep - 2, 0, 100);
      say(a, '바닥이 젖어 있네요. 과태료입니다', 2.6);
      evNote('inspect', false, '위생 점검 — 젖은 바닥 ' + wet + '곳 · 벌금 20만');
      SFX.bad();
    } else {
      G.rep = clamp(G.rep + 1, 0, 100);
      say(a, '깨끗하네요 👍', 2.4);
      floatText(V(2, 3).setY(2.2), '위생 점검 통과 · 평판 +1', 'good');
      evNote('inspect', true, '위생 점검 통과');
      SFX.good();
    }
    walkTo(a, [SPOTS.door, SPOTS.outside], function () { scene.remove(a.mesh); G.inspector = null; }, 2.6);
  }, 2.6);
}

/* 고르는 이벤트 — 선택지는 섞는다. 화면에 답(권장)을 띄우지 않는다 */
function eventChoice(task, head, body, opts, done) {
  var order = shuffle(opts.map(function (o, i) { return i; }));
  var correct = order.indexOf(0);   // opts[0] 이 바른 처리
  G.current = { kind: 'event', type: task.type, correct: correct };
  showModal('<div class="kicker red">' + task.ic + ' ' + task.title + '</div><h2>' + head + '</h2>' + body + '<div class="choices">' +
    order.map(function (k, i) { return '<button class="choice" data-ev="' + i + '">' + opts[k].t + '</button>'; }).join('') + '</div>');
  document.querySelectorAll('[data-ev]').forEach(function (b) {
    b.onclick = function () {
      var ix = +b.getAttribute('data-ev'), o = opts[order[ix]];
      if (G.tasks.indexOf(task) >= 0) removeTask(task);
      var res = o.fx();
      res.ok ? SFX.good() : SFX.bad();
      showModal('<div class="kicker">' + task.ic + ' ' + task.title + '</div><div class="verdict ' + (res.ok ? 'ok' : 'no') + '">' + res.head + '</div>' +
        '<div class="choices" style="margin-bottom:10px">' + order.map(function (k, i) {
          return '<div class="choice' + (i === correct ? ' right' : (i === ix ? ' wrong' : '')) + '">' + opts[k].t + '</div>';
        }).join('') + '</div><p>' + res.why + '</p>' + (res.cite || '') + '<button class="cta" data-ok="1">돌아간다</button>');
      $('[data-ok]').onclick = function () { closeModal(); if (done) done(res); };
    };
  });
}
function openFight(task, a, b, t) {
  var cs = function () { return t.seats.filter(function (x) { return x !== null; }).map(function (id) { return G.customers[id]; }); };
  eventChoice(task, '딜러 둘이 싸운다',
    '<p>' + a.name + '(' + t.name + ')과 ' + b.name + josa(b.name, '이', '가') + ' 교대 순서로 언성을 높인다. 손님들이 쳐다본다.</p>',
    [
      { t: '둘을 따로 불러 조용히 이야기를 듣고 중재한다', fx: function () {
        addMorale(a.staff, 5); addMorale(b.staff, 5);
        cs().forEach(function (c) { c.sat = clamp(c.sat + 3, 0, 100); });
        say(a, '죄송합니다… 🙏', 2); say(b, '제가 예민했어요', 2);
        evNote('fight', true, '딜러 다툼 — 조용히 중재 · 사기 +5');
        return { ok: true, head: '✓ 조용히 정리됐다', why: '손님 앞에서 큰 소리를 키우지 않고, 양쪽 말을 따로 들었다. 둘 다 사기가 조금 오른다(+5).' };
      } },
      { t: a.name + '에게 휴식을 보내고 쉬는 딜러로 바꾼다', fx: function () {
        var rest = G.dealers.filter(function (x) { return x.table === null && !x.arriving && x !== a && x !== b; })[0];
        if (rest && t.dealer === a.id) swapDealer(t, rest);
        addMorale(a.staff, -3);
        evNote('fight', null, '딜러 다툼 — ' + a.name + ' 휴식');
        return { ok: false, head: '△ 일단 떨어뜨렸다', why: '불은 껐지만 이야기를 듣지 않았다. ' + a.name + '은 벌을 받았다고 느낀다(사기 −3).' + (rest ? '' : ' 쉬는 딜러가 없어 교대는 못 했다.') };
      } },
      { t: '기강을 위해 손님들 앞에서 둘을 공개적으로 꾸짖는다', fx: function () {
        addMorale(a.staff, -10); addMorale(b.staff, -10);
        cs().forEach(function (c) { c.sat = clamp(c.sat - 8, 0, 100); });
        G.rep = clamp(G.rep - 1, 0, 100);
        say(a, '…😞', 2); say(b, '…😞', 2);
        evNote('fight', false, '딜러 다툼 — 공개 질책 · 사기 −10');
        return { ok: false, head: '✗ 테이블 분위기가 얼어붙었다', why: '손님 앞에서 직원을 꾸짖으면 테이블 전체가 불편해진다. 두 딜러 사기 −10, 손님 만족 −8, 평판 −1.' };
      } }
    ]);
}
function openExchange(task, c) {
  eventChoice(task, '“칩을 현금으로 바꿔 주세요”',
    '<p>' + c.name + ': "오늘 많이 땄는데, 이 칩 현금으로 좀 바꿔 줄 수 있어요? 안 되면 상품권이라도…"</p>',
    [
      { t: '정중히 거절하고, 칩은 바꿔 드릴 수 없다고 설명한다', fx: function () {
        G.rep = clamp(G.rep + 1, 0, 100);
        if (aliveActor(c)) say(c, '아 그렇구나… 알겠어요', 2.2);
        evNote('exchange', true, '칩 환전 요구 — 거절하고 설명');
        return { ok: true, head: '✓ 바르게 거절했다', why: '칩의 현금 · 현금성 상품 교환은 불법 소지가 크다 — 우리 펍은 <b>참가비와 음료로만</b> 운영한다. 우승 상품은 트로피와 시드권뿐이다.' };
      } },
      { t: '단골이니 이번 한 번만 조용히 현금으로 바꿔 준다', fx: function () {
        fine(1000000, '불법 환전 신고');
        G.rep = clamp(G.rep - 10, 0, 100);
        evNote('exchange', false, '칩을 현금으로 — 신고 · 벌금 100만');
        return { ok: false, head: '✗ 불법 환전 신고가 들어왔다', why: '칩을 현금으로 바꿔 주면 매장 전체가 불법 영업 소지를 떠안는다. 벌금 100만 · 평판 −10.<br>칩의 현금 · 현금성 상품 교환은 불법 소지가 크다 — 우리 펍은 참가비와 음료로만 운영한다.' };
      } },
      { t: '현금은 안 되니 대신 상품권으로 바꿔 준다', fx: function () {
        fine(1000000, '불법 환전 신고 (상품권)');
        G.rep = clamp(G.rep - 10, 0, 100);
        evNote('exchange', false, '칩을 상품권으로 — 신고 · 벌금 100만');
        return { ok: false, head: '✗ 상품권도 환전이다', why: '상품권은 현금성 상품이다 — 이름만 바꾼 환전으로 신고가 들어왔다. 벌금 100만 · 평판 −10.<br>칩의 현금 · 현금성 상품 교환은 불법 소지가 크다 — 우리 펍은 참가비와 음료로만 운영한다.' };
      } }
    ]);
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
    G.wins = (G.wins || 0) + 1;   // 트로피 진열장에 하나 더
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
function tickStaff(dt) { G.servers.forEach(function (s) { tickServer(s, dt); }); }
var BAR_PICK = V(-2.9, -5.7);
function tickServer(s, dt) {
  if (s.busy) return;
  s.cool -= dt;
  if (s.cool > 0) return;
  var c = G.customers.filter(function (x) { return x.alive && x.order && !x.orderTaken && x.state !== 'leaving'; })
    .sort(function (a, b) { return a.order - b.order; })[0];
  if (!c) { s.cool = 1; return; }
  c.orderTaken = true; s.busy = true;
  var skill = s.staff.skill, spd = (2.3 + skill / 45) * staffSpd(s.staff);
  say(s, '네~ 바로 갈게요!', 1.4);
  walkTo(s, [BAR_PICK], function () {
    if (G.stock <= 0) {
      G.stats.noStock++;
      say(s, '재고가 없어요… 😥', 1.8);
      if (c.alive) { c.order = null; c.orderTaken = false; c.lastDrink = G.simT - 15; c.sat = clamp(c.sat - 6, 0, 100); say(c, '음료 다 떨어졌어요? 😑', 2.4); }
      walkTo(s, [s.home], function () { s.busy = false; s.cool = 1; }, spd);
      return;
    }
    G.stock--;
    if (G.stock === 5) toast('음료 재고 5개 남음');
    s.tray.visible = true;
    tone(1900, 0.05, 'triangle', 0.05);
    walkTo(s, [c.mesh.position.clone().add(V(0.45, 0.45))], function () {
      s.tray.visible = false;
      if (c.alive && c.state !== 'leaving') {
        var price = PRICES[G.cfg.price].p;
        G.dayRevenue += price; G.stats.drinks++;
        var quick = c.order && G.simT - c.order < 10;
        c.lastDrink = G.simT; c.order = null; c.orderTaken = false; c.sat = clamp(c.sat + 4 + (hasT(s.staff, 'chatty') ? 4 : 0), 0, 100);
        if (c.reg && quick) { c.reg.aff = clamp(c.reg.aff + 3, 0, 100); c.sat = clamp(c.sat + 4, 0, 100); }
        placeGlass(c);
        floatText(c.mesh.position.clone().setY(1.7), '+' + won(price), 'money');
        say(c, c.reg && quick ? c.reg.fav + ' 역시 내 취향! 💛' : pick(['🍺 감사합니다', '🥤 땡큐!', '☕ 굿']), 1.6);
        pulse('money');
        SFX.cash();
      } else G.stock++;
      walkTo(s, [s.home], function () { s.busy = false; s.cool = 1.2; }, spd);
    }, spd);
  }, spd);
}
/* 받은 잔은 테이블(또는 바) 위에 한동안 놓여 있다 */
function placeGlass(c) {
  var g = new THREE.Group();
  var glass = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.16, 10), mat(pick([0xD99A2B, 0x6B3A1E, 0xC23B3B]), { roughness: 0.2 }));
  var foam = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.03, 10), mat(0xffffff));
  foam.position.y = 0.09; g.add(glass, foam);
  var p = c.mesh.position;
  if (c.state === 'seated' && G.tables[c.table]) {
    var t = G.tables[c.table].def, dir = V(t.cx - p.x, t.cz - p.z).normalize();
    g.position.set(p.x + dir.x * 0.75, 0.96, p.z + dir.z * 0.75);
  } else g.position.set(p.x, 1.24, -6.35);
  scene.add(g);
  G.glasses.push({ mesh: g, until: G.simT + 30 });
}
function tickOrders(dt) {
  var k = PRICES[G.cfg.price].k * (G.owned.coffee ? 1.2 : 1);
  G.customers.forEach(function (c) {
    if (!c.alive || !/^(seated|bar-wait|bar-drink)$/.test(c.state)) return;
    if (!c.order && G.simT - c.lastDrink > 35 && chance(dt * 0.035 * k * CUST_TYPES[c.type].drink)) {
      c.order = G.simT; c.orderTaken = false;
      say(c, c.reg ? '🙋 ' + c.reg.fav + ' 주세요!' : '🙋 주문이요!', 2);
      if (G.stats.drinks === 0) tip('order', '🙋 손님이 음료를 주문했다. 홀 서버가 바에서 받아 가져간다. 주문이 밀리면 홀 서버를 한 명 더 채용하자.');
    }
    if (c.order && G.simT - c.order > 15) {
      c.sat = clamp(c.sat - 0.35 * dt, 0, 100);
      if (chance(dt * 0.05)) say(c, '음료 언제 와요? 😤', 2);
    }
  });
  G.glasses = G.glasses.filter(function (g) { if (G.simT > g.until) { scene.remove(g.mesh); return false; } return true; });
}

/* 플로어 보조 — 12초 넘게 남은 아나운스 · 밸런싱 · 청소를 맡는다. 판정 호출은 하지 않는다 */
var ANN_LINE = {
  level: function (k) { var b = BLINDS[k.lv]; return '레벨 ' + (k.lv + 1) + ' — ' + won(b[0]) + '/' + won(b[1]); },
  regwarn: function () { return clock(regCloseMin()) + ' 레지 마감합니다'; },
  regclose: function () { return '레지 마감합니다!'; },
  final: function (k) { return '파이널 테이블 — ' + k.n + '명!'; }
};
function tickFloor() {
  var f = G.floorStaff;
  if (!f || f.busy) return;
  var order = { announce: 0, balance: 1, spill: 2 };
  var task = G.tasks.filter(function (k) {
    return !k.claimed && G.simT - k.t0 > 12 && (k.kind === 'announce' || k.kind === 'balance' || (k.kind === 'spill' && !G.cleaner));
  }).sort(function (a, b) { return order[a.kind] - order[b.kind]; })[0];
  if (!task) return;
  task.claimed = true; f.busy = true;
  var dest = task.kind === 'announce' ? V(6.4, 2.1) :
    (task.kind === 'balance' ? approachFrom(G.tables[task.table], f.mesh.position) : task.spill.mesh.position.clone());
  var spd = (2.4 + f.staff.skill / 60) * staffSpd(f.staff);
  walkTo(f, [dest], function () {
    if (G.tasks.indexOf(task) >= 0) {
      if (task.kind === 'announce') {
        removeTask(task); G.stats.ann++; G.stats.annByStaff++;
        if (chance(0.55 + f.staff.skill / 250 + (hasT(f.staff, 'careful') ? 0.05 : 0) - moralePen(f.staff) / 300)) { G.rep = clamp(G.rep + 0.12, 0, 100); SFX.mic(); say(f, '📢 ' + ANN_LINE[task.type](task), 2.6); }
        else { G.stats.annWrong++; G.rep = clamp(G.rep - 0.6, 0, 100); say(f, '📢 어… 정정하겠습니다', 2.2); }
      } else if (task.kind === 'balance') doBalance(task, f);
      else { task.spill.cleaning = G.simT + 1.5; say(f, '🧹', 1.5); }
    }
    walkTo(f, [SPOTS.floorHome], function () { f.busy = false; }, spd);
  }, spd);
}

// ── 딜러 ────────────────────────────────────────────
function tickDealers(dt) {
  G.dealers.forEach(function (d) {
    stepActor(d, dt);
    if (d.table !== null) {
      d.fatigue = clamp(d.fatigue + dt / 7 * (G.owned.shuffler ? 0.65 : 1), 0, 45);
      if (d.fatigue >= 35) {   // 과로 — 지친 채로 오래 두면 사기가 샌다
        addMorale(d.staff, -dt * 0.12);
        if (chance(dt * 0.02)) say(d, '😩 언제 쉬어요…', 2);
      }
      var tr = trainOf(d.staff).v;   // 응대 교육 — 자기 테이블 손님 만족이 서서히 오른다
      if (tr) G.tables[d.table].seats.forEach(function (id) { if (id !== null) G.customers[id].sat = clamp(G.customers[id].sat + 0.03 * tr * dt, 0, 100); });
      if (d.fatigue > 25) tip('tired', '😓 딜러가 지쳤다 — 머리 위 막대가 빨개지면 실수가 늘고 느려진다. 테이블을 눌러 쉬는 딜러와 교대하자.');
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

/* 분위기 메이커 — 반경 3 안 손님 만족이 서서히 오른다 */
function staffActors() { return G.dealers.concat(G.servers, [G.counterStaff, G.cleaner, G.floorStaff]).filter(function (a) { return a && !a.arriving; }); }
function tickMood(dt) {
  staffActors().forEach(function (a) {
    if (!hasT(a.staff, 'mood')) return;
    custNear(a.mesh.position, 3).forEach(function (c) { c.sat = clamp(c.sat + 0.12 * dt, 0, 100); });
    if (chance(dt * 0.015)) say(a, pick(['🎉 오늘 분위기 좋다!', '😄 다들 화이팅!', '🎶']), 1.8, true);
  });
}

// ── 손님 수다 ────────────────────────────────────────
function tickTalk() {
  G.customers.forEach(function (c) {
    if (!c.alive || G.simT < c.nextTalk || c.state === 'leaving') return;
    c.nextTalk = G.simT + 18 + Math.random() * 30;
    if (!G.talkOn || ambientCount() >= 3) return;
    if (c.state === 'bar-wait' && c.sat < 50) say(c, '자리 언제 나요?', 2.4, true);
    else if (c.sat < 35) say(c, pick(['여기 별로네…', '😒', '서비스가 왜 이래']), 2.4, true);
    else if (c.sat > 85) say(c, pick(['여기 최고 👍', '😄', '또 와야지']), 2.4, true);
    else if (chance(0.5)) say(c, pick(CUST_TYPES[c.type].talk), 2.4, true);
  });
}

// ═══════════════════════════════════════════════════
// 루프
// ═══════════════════════════════════════════════════
var lastTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);   // 먼저 다음 프레임을 잡는다 — 한 번 오류가 나도 게임이 멈추지 않게
  var real = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  // 시뮬레이션과 그리기를 따로 지킨다 — 시뮬레이션이 터져도 화면 · HUD 는 계속 그린다
  var ok = guard(function () {
    if (G.phase === 'open' && !G.modal && !G.paused) {
      var steps = G.speed > 4 ? Math.ceil(G.speed / 4) : 1;
      for (var k = 0; k < steps; k++) simulate(real * G.speed / steps);
    }
    if (G.phase === 'open' && !G.modal) stepFx(real);
    if (G.phase === 'title') cam.yaw += real * 0.07;
    flickerNeon(real);
    if ((frame.mt = (frame.mt || 0) + real) > 0.5) { frame.mt = 0; tickMurmur(); }
  });
  ok = guard(function () {
    updateCamera(real);
    renderer.render(scene, camera);
    renderOverlay();
    if (G.phase === 'open') renderHud();
  }) && ok;
  if (ok) frame.errs = 0;   // 연속 오류만 센다 — 드문 오류가 쌓여 멈추지 않게
}
function guard(fn) {
  try { fn(); return true; } catch (e) {
    frame.errs = (frame.errs || 0) + 1; frame.total = (frame.total || 0) + 1;
    if (frame.total <= 3) console.error(e);   // 점검 도구가 잡도록 남긴다
    if (frame.total === 1) toast('⚠️ 문제가 생겼다 — 계속 진행해 본다');
    if (frame.errs >= 120 && !frame.fatal) {   // 연속으로 터지면 멈추고 알린다
      frame.fatal = true; G.paused = true;
      showModal('<h2>⚠️ 오류가 계속 난다</h2><p>더 진행하기 어렵다. 타이틀로 돌아가 <b>이어하기</b>를 누르면 마지막 마감부터 다시 할 수 있다.</p><button class="cta" data-err-title="1">타이틀로</button>');
      $('[data-err-title]').onclick = function () { frame.errs = 0; frame.fatal = false; G.paused = false; endBlackout(false, true); clearActors(); G.tasks = []; renderTasks(); titleScreen(); };
    }
    return false;
  }
}

function simulate(dt) {
  G.simT += dt;
  if (regOpen()) {
    G.nextArrival -= dt;
    if (G.nextArrival <= 0) {
      spawnCustomer();
      var feeK = G.cfg.fee === 20000 ? 0.75 : (G.cfg.fee === 50000 ? 1.6 : 1);
      var repK = clamp(1.6 - G.rep / 100, 0.55, 1.4) * (G.owned.interior ? 0.87 : 1);
      G.nextArrival = (5 + Math.random() * 6) * feeK * repK * (tableCount() === 3 ? 0.78 : 1) / (dayInfo().arrivalK * rivalArrK());
    }
  }
  stepPlayerKeys(dt);
  stepActor(G.player, dt);
  G.customers.forEach(function (c) {
    if (!c.alive) return;
    stepActor(c, dt);
    var decay = (G.owned.interior ? 0.7 : 1) * (1 + 0.5 * diffK());   // 주가 갈수록 손님 인내심이 짧아진다
    if (c.state === 'bar-wait') c.sat = clamp(c.sat - 0.3 * dt * decay, 0, 100);
    if (c.state === 'seated' && G.tables[c.table] && G.tables[c.table].call) c.sat = clamp(c.sat - 1.2 * dt * decay, 0, 100);
    if (G.blackout && c.state !== 'leaving') c.sat = clamp(c.sat - 0.4 * dt, 0, 100);
    if (c.drunk && chance(dt * 0.25)) {
      say(c, pick(['🍻 한 곡 더!!', '사장님 이리 와 봐요~', '내가 왕년에 말이야!']), 1.8);
      custNear(c.mesh.position, 3).forEach(function (x) { if (x !== c) x.sat = clamp(x.sat - 0.6, 0, 100); });
    }
    if (c.state === 'bar-drink' && G.simT > c.leaveAt) leave(c);
    if (c.state === 'bar-wait' && c.sat < 15) { say(c, '그냥 갈래요 😤', 2.4); leave(c, '자리를 기다리다 지쳐서'); }
    if (c.state === 'queue' && c.sat < 12) { G.stats.queueLeave++; leave(c, '등록 줄에서 지쳐서'); }
  });
  tickDealers(dt);
  G.servers.forEach(function (s) { stepActor(s, dt); });
  if (G.counterStaff) stepActor(G.counterStaff, dt);
  if (G.cleaner) stepActor(G.cleaner, dt);
  if (G.floorStaff) stepActor(G.floorStaff, dt);
  if (G.inspector) stepActor(G.inspector, dt);
  tickMood(dt);
  tickDecor(dt);
  tickOrders(dt);
  tickStaff(dt);
  tickFloor();
  tickCounter(dt);
  seatWaiting();
  G.tables.forEach(function (t) { tickTable(t, dt); });
  tickSpills(dt);
  tickTalk();
  G.nextSpill -= dt;
  if (G.nextSpill <= 0) { spawnSpill(); G.nextSpill = 45 + Math.random() * 30; }
  if (G.chipIssueAt !== null && G.simT > G.chipIssueAt) {
    G.chipIssueAt = null;
    G.rep = clamp(G.rep - 2, 0, 100);
    var c = pick(G.customers.filter(function (x) { return x.alive && x.state === 'seated'; }));
    if (c) say(c, '칩이 스타팅보다 모자라요!', 3);
    toast('칩 세팅 오류 — 스타팅 스택이 틀렸다는 항의. 평판 −2');
    log('칩 세팅 오류가 드러났다', 'bad');
  }
  G.friends = G.friends.filter(function (f) { if (G.simT < f.at) return true; spawnCustomer({ friend: f.by }); return false; });
  var R = G.resv;
  if (R) {
    R.arrivals = R.arrivals.filter(function (a) {
      if (G.simT < a.at) return true;
      R.arrived++; spawnCustomer({ resv: true, reg: a.reg });
      return false;
    });
    if (R.open && gameMin() >= 19.5 * 60) {
      R.open = false;
      if (R.noshow) {
        var dep = G.cfg.resDeposit ? R.noshow * DEPOSIT : 0;
        G.dayRevenue += dep; G.stats.depositRev = dep;
        toast('📵 예약 노쇼 ' + R.noshow + '명 — 잡아 둔 자리를 연다' + (dep ? ' · 보증금 +' + won(dep) : ''));
        log('예약 노쇼 ' + R.noshow + '명' + (dep ? ' — 보증금 ' + won(dep) + ' 수입' : ' — 보증금이 없어 손해만'), 'bad');
        if (dep) { floatText(V(8.2, 2.4).setY(1.8), '+' + won(dep), 'money'); pulse('money'); }
        SFX.bad();
      } else { toast('📋 예약 손님 전원 도착!'); SFX.good(); }
    }
  }
  G.pending = G.pending.filter(function (p) {
    if (G.simT < p.at) return true;
    toast('📵 대타 ' + p.st.name + ' — 연락 두절. 다른 사람을 부르세요');
    log('대타 ' + p.st.name + ' 연락 두절', 'bad');
    SFX.bad();
    return false;
  });
  tickEvents();
  checkAnnouncements();
  checkBalance();
  // 제한 시간
  G.tasks.slice().forEach(function (k) {
    if (!k.limit || G.simT - k.t0 <= k.limit) return;
    if (k.kind === 'event') { removeTask(k); k.onTimeout(); }
    else if (k.kind === 'call') resolveCall(k, 'missed');
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
function pulse(key) {
  var el = document.querySelector('#hud [data-h="' + key + '"]');
  if (!el) return;
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
}
function flashClock() {
  var el = document.querySelector('#hud [data-h="lvbox"]');
  if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  tone(988, 0.12, 'sine', 0.08); tone(1319, 0.18, 'sine', 0.08, 0.12);
}
function renderHud() {
  var hud = $('#hud');
  if (!hud._built) {
    /* 상단 바 — 꼭 필요한 넷만(시각 · 매출 · 평판 · 손님) + 버튼 넷(직원 · 목표 · 배속 · 메뉴).
       음악 · 효과음 · 잡담 · 따라가기는 일시정지 메뉴의 빠른 토글로 옮겼다 */
    hud.innerHTML = '' +
      '<span class="chip daytag">' + dayInfo().wk + ' · ' + dayInfo().short + '</span>' +
      '<span class="chip clockc" data-h="lvbox"><b data-h="clock"></b><small>다음 레벨 <i data-h="next"></i></small></span>' +
      '<span class="chip money">💰 <b data-h="money"></b></span>' +
      '<span class="chip repc">⭐ <b data-h="rep"></b><span class="rep"><i data-h="repbar"></i></span></span>' +
      '<span class="chip m-hide">👥 <b data-h="guests"></b></span>' +
      '<span class="x-hide"><b data-h="entries"></b><b data-h="stock"></b><b data-h="reg"></b></span>' +
      '<span class="sp"></span>' +
      '<button class="hbtn" data-callstaff="1" title="직원 부르기">🧑‍💼</button>' +
      '<button class="hbtn" data-goals="1" title="오늘의 목표">🎯</button>' +
      [1, 2, 4].map(function (s) { return '<button class="hbtn m-hide" data-speed="' + s + '">' + s + '×</button>'; }).join('') +
      '<button class="hbtn m-only" data-speedcycle="1" title="배속">1×</button>' +   // 폰에서는 배속 버튼 하나 — 누를 때마다 1 → 2 → 4
      '<button class="hbtn menu" data-pause="1" title="일시정지 · 메뉴 (Esc)">☰</button>';
    hud.querySelectorAll('[data-speed]').forEach(function (b) { b.onclick = function () { G.speed = +b.getAttribute('data-speed'); G.paused = false; }; });
    hud.querySelector('[data-speedcycle]').onclick = function () { G.speed = G.speed >= 4 ? 1 : G.speed * 2; G.paused = false; };
    hud.querySelector('[data-pause]').onclick = openPause;
    hud.querySelectorAll('.hbtn').forEach(function (b) { b.setAttribute('aria-label', b.title || b.textContent); });   // 아이콘 버튼에 이름
    hud.querySelector('[data-callstaff]').onclick = function () { audioOn(); openHire(); };
    hud.querySelector('[data-goals]').onclick = function () {
      var s = G.stats;
      toast('🎯 ' + G.goals.map(function (g) { var d = goalDef(g); return goalText(g) + (d.now ? ' (' + d.now(s) + ')' : ''); }).join(' · ') +
        (G.weekCh ? ' / 🗓️ 이번 주 ' + G.weekCh.list.filter(function (c) { return !wcDef(c).low && wcDone(c); }).length + '/' + G.weekCh.list.filter(function (c) { return !wcDef(c).low; }).length + ' 달성' : ''));
    };
    hud._built = true;
  }
  var lv = BLINDS[level()];
  var set = function (k, v) { var el = hud.querySelector('[data-h="' + k + '"]'); if (el.textContent !== v) el.textContent = v; };
  set('clock', clock(gameMin()));
  G.dispRev = G.dispRev === undefined ? G.dayRevenue : G.dispRev + (G.dayRevenue - G.dispRev) * 0.18;
  if (Math.abs(G.dayRevenue - G.dispRev) < 50) G.dispRev = G.dayRevenue;
  set('money', won(Math.round(G.dispRev / 100) * 100));
  set('next', clock(OPEN_MIN + (level() + 1) * levelMin()));
  set('entries', String(G.stats.entries));
  $('#vignette').classList.toggle('on', G.tasks.some(function (k) { return k.kind === 'call'; }));
  set('rep', String(Math.round(G.rep)));
  set('guests', String(G.customers.filter(function (c) { return c.alive && c.state !== 'leaving'; }).length));
  set('stock', String(G.stock));
  set('reg', regOpen() ? '등록 중' : '등록 마감');
  hud.querySelector('[data-h="repbar"]').style.width = G.rep + '%';
  hud.querySelectorAll('[data-speed]').forEach(function (b) { b.classList.toggle('on', G.speed === +b.getAttribute('data-speed') && !G.paused); });
  hud.querySelector('[data-pause]').classList.toggle('on', G.paused);
  var sc = hud.querySelector('[data-speedcycle]'), sct = (G.speed > 4 ? 4 : G.speed) + '×';
  if (sc.textContent !== sct) sc.textContent = sct;
  sc.classList.toggle('on', !G.paused);
  renderTasks();
}

var TASK_TXT = {
  call: function (k) { return { t: '플로어! — ' + G.tables[k.table].name, d: k.type === 'case' ? CASES_BY[k.data.id].tag : { pos: '버튼 · 블라인드 이의', btn: '버튼 위치 오류', cnt: '카드 장수 이상', under: '레이즈 금액 이의', spot: '🔍 딜러 실수 의심' }[k.type] || '판정 요청', ic: '🚨' }; },
  announce: function (k) { return { t: '아나운스', d: { level: '블라인드 레벨 업', regwarn: '레지 마감 30분 전', regclose: '레지 마감', final: '파이널 테이블' }[k.type], ic: '📢' }; },
  balance: function (k) { return { t: '밸런싱 — ' + G.tables[k.table].name, d: G.tables[k.table].name + ' → ' + G.tables[k.to].name + ' 한 명', ic: '⚖️' }; },
  spill: function () { return { t: '청소', d: '음료가 쏟아졌다', ic: '🧽' }; },
  event: function (k) { return { t: k.title, d: k.desc, ic: k.ic }; }
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
    b.className = 'call ' + k.kind + ' fresh';
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
  else if (k.kind === 'event') goEvent(k);
  else if (k.kind === 'spill') goClean(k.spill);
  else goTable(k.table);
}
function goEvent(k) {
  if (k.tap) { k.tap(k); return; }
  var p = k.pos();
  var gone = function () { removeTask(k); toast(k.title + ' — 이미 자리를 떴다'); evNote(k.type, null, k.title + ' — 손님이 먼저 떠났다'); };
  if (!p) { gone(); return; }
  playerGo(p, function () {
    if (G.tasks.indexOf(k) < 0) return;
    if (!k.pos()) { gone(); return; }   // 걸어가는 사이 떠났다
    k.on(k);
  }, k.title + ' 처리하러');
}

function renderTicker() {
  $('#ticker').innerHTML = G.log.slice(-6).map(function (l) { return '<div class="' + l.c + '">' + l.t + '</div>'; }).join('');
}

/* 3D 위에 띄우는 것 — 테이블 라벨 · 딜러 피로 막대 · 말풍선 · 떠오르는 글자 */
var OV = { tables: [], dealers: {}, bubbles: {}, floats: [], orders: {} };
function project(v) {
  var p = v.clone().project(camera);
  return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight, vis: p.z < 1 };
}
function renderOverlay() {
  var host = $('#labels');
  if (G.phase !== 'open') { if (host.childNodes.length) { host.innerHTML = ''; OV = { tables: [], dealers: {}, bubbles: {}, floats: [], orders: {} }; } $('#qbar').style.display = 'none'; return; }
  // 테이블 라벨
  G.tables.forEach(function (t, i) {
    var el = OV.tables[i];
    if (!el) { el = document.createElement('div'); el.className = 'tlabel'; el.onclick = function () { audioOn(); goTable(i); }; host.appendChild(el); OV.tables[i] = el; }
    var p = project(V(t.def.cx, t.def.cz - RZ - 0.3).setY(t.call ? 3.6 : 1.7));   // 뒤쪽 가장자리 위 — 보드를 가리지 않게
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    var txt = t.broken ? t.name + '<small>재편으로 닫힘</small>' :
      (t.dealer === null ? '⚠️ ' + t.name + '<small>딜러 없음 — 눌러서 배치</small>' :
      (t.call ? '🚨 플로어! — ' + t.name : t.name + (isMix(t) ? ' · PLO8' : '') + '<small>' + seated(t) + '명</small>'));
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
    el.querySelector('span').textContent = d.name + (d.fresh > G.simT ? ' ⚡' : '') + (morale(d.staff) < 35 ? ' 😞' : '');
    var bar = el.querySelector('b');
    bar.style.width = Math.round(f * 100) + '%';
    bar.style.background = f > 0.66 ? 'var(--red)' : (f > 0.4 ? 'var(--amber)' : 'var(--ok)');
  });
  // 말풍선
  var actors = G.customers.concat(G.dealers, G.servers, [G.player, G.counterStaff, G.cleaner, G.floorStaff, G.inspector]).filter(Boolean);
  var t = now(), seen = {};
  actors.forEach(function (a) {
    if (!a.bubble || a.bubble.until < t || (a.alive === false) || (a.bubble.ambient && !G.talkOn)) return;
    seen[a.uid] = true;
    var el = OV.bubbles[a.uid];
    if (!el) { el = document.createElement('div'); el.className = 'bubble'; host.appendChild(el); OV.bubbles[a.uid] = el; }
    if (el._t !== a.bubble.text) { el.textContent = a.bubble.text; el._t = a.bubble.text; }
    var p = project(a.mesh.position.clone().setY(1.75));
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    el.classList.toggle('me', a.kind === 'player');
    el.classList.toggle('amb', !!a.bubble.ambient);
  });
  Object.keys(OV.bubbles).forEach(function (k) { if (!seen[k]) { OV.bubbles[k].remove(); delete OV.bubbles[k]; } });
  // 떠오르는 글자
  FX.floats = FX.floats.filter(function (f) {
    var age = t - f.t0;
    if (!f.el) { f.el = document.createElement('div'); f.el.className = 'float ' + f.cls; f.el.textContent = f.text; host.appendChild(f.el); }
    if (age > (f.life || 1.6)) { f.el.remove(); return false; }
    var p = project(f.pos.clone().setY(f.pos.y + age * 0.8));
    f.el.style.left = p.x + 'px'; f.el.style.top = p.y + 'px';
    f.el.style.opacity = String(1 - age / (f.life || 1.6));
    return true;
  });
  // 등록 진행 막대
  var qb = $('#qbar');
  if (G.queue.length && G.queue[0].mesh.position.distanceTo(QUEUE[0]) < 0.3) {
    var qp = project(G.queue[0].mesh.position.clone().setY(2.05));
    qb.style.display = 'block'; qb.style.left = qp.x + 'px'; qb.style.top = qp.y + 'px';
    qb.querySelector('b').style.width = Math.round(Math.min(1, G.counterProg / 3.2) * 100) + '%';
    qb.className = G.counterRate >= 0.99 ? 'fast' : (G.counterRate > 0.5 ? 'mid' : 'slow');
    qb.querySelector('span').textContent = G.counterRate >= 0.99 ? '등록 중 — 점장' : (G.counterRate > 0.5 ? '등록 중 — 카운터 직원' : '등록 중… 느림');
  } else qb.style.display = 'none';
  // 주문 표시
  var seenO = {};
  G.customers.forEach(function (c) {
    if (!c.alive || !c.order || c.state === 'leaving') return;
    seenO[c.uid] = true;
    var el = OV.orders[c.uid];
    if (!el) { el = document.createElement('div'); el.className = 'otag'; el.textContent = '🍺'; host.appendChild(el); OV.orders[c.uid] = el; }
    var p = project(c.mesh.position.clone().setY(1.45));
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    el.classList.toggle('late', G.simT - c.order > 15);
    el.classList.toggle('taken', !!c.orderTaken);
  });
  Object.keys(OV.orders).forEach(function (k) { if (!seenO[k]) { OV.orders[k].remove(); delete OV.orders[k]; } });
  // 점장 목적지
  var pm = $('#goal');
  if (G.player && G.player.goal) { pm.textContent = '👟 ' + G.player.goal; pm.style.display = 'block'; } else pm.style.display = 'none';
}

function showModal(html, wide) {
  G.modal = true;
  $('#modal').innerHTML = '<div class="modal-bg"><div class="modal' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true" tabindex="-1">' + html + '</div></div>';
  var m = $('#modal .modal');   // 키보드 · 화면 읽기 — 창이 열리면 창으로 포커스
  if (m && m.focus) m.focus({ preventScroll: true });
}
function closeModal() { G.modal = null; $('#modal').innerHTML = ''; }

// ── 테이블 정보 · 딜러 교대 ──────────────────────────
function openTable(i) {
  var t = G.tables[i];
  if (t.broken) { toast(t.name + '은 재편으로 닫혔다'); return; }
  var d = t.dealer !== null ? G.dealers[t.dealer] : null;
  var rest = G.dealers.filter(function (x) { return x.table === null && !x.arriving; });
  var names = t.seats.map(function (id, s) {
    if (id === null) return seatNo(s) + ' —';
    var c = G.customers[id];
    var face = c.sat > 75 ? '😄' : (c.sat > 45 ? '🙂' : (c.sat > 25 ? '😐' : '😠'));
    return seatNo(s) + ' ' + c.name + ' (' + CUST_TYPES[c.type].ko + ') ' + face;
  });
  var h = '<div class="kicker">' + t.name + '</div><h2>' + (d ? '딜러 ' + d.name : '딜러 없음') + '</h2>' +
    (d ? '<p>정확도 ' + Math.round(d.acc) + ' · 피로 ' + Math.round(d.fatigue) + '/45 → 실제 정확도 <b>' + Math.round(effAcc(d)) + '</b> · 진행 속도 <b>' + Math.round(handSpeed(d) * 100) + '%</b>' +
      (d.fresh > G.simT ? ' ⚡교대 직후' : '') + '. 피로가 쌓이면 실수가 늘어 호출이 잦아지고 핸드가 느려진다.</p>' : '') +
    (isMix(t) ? '<p class="note">🃏 PLO8 믹스 테이블 — 홀카드 넷, 하이 · 로우(8 이하) 반반. 딜러 믹스 자격 ' + (d ? (mixOk(d.staff) ? '✓' : '<b>✗ — 사고 2배</b>') : '—') + '</p>' : '') +
    (t.lastResult ? '<p class="note">지난 핸드 — ' + t.lastResult.name + (t.lastResult.hand ? ' · ' + t.lastResult.hand : '') + (t.lastResult.split ? ' (찹)' : '') + (t.lastResult.low ? ' · 로우 ' + t.lastResult.low : '') + '</p>' : '') +
    '<div class="acts">' + names.join('<br>') + '</div>';
  if (!d && rest.length) {
    h += '<h3>딜러 배치</h3><div class="choices">' + rest.map(function (r) {
      return '<button class="choice" data-place="' + r.id + '">' + r.name + ' 배치 — 정확도 ' + Math.round(r.acc) + ' · 피로 ' + Math.round(r.fatigue) + '</button>';
    }).join('') + '</div>';
  } else if (!d) h += '<p class="warn">쉬는 딜러가 없다 — 상단 🧑‍💼 로 대타를 부르세요.</p>';
  if (d && rest.length) {
    h += '<h3>교대</h3><div class="choices">' + rest.map(function (r) {
      return '<button class="choice" data-swap="' + r.id + '">' + r.name + '와 교대 — 정확도 ' + Math.round(r.acc) + ' · 피로 ' + Math.round(r.fatigue) + '</button>';
    }).join('') + '</div>';
  }
  if (d) h += '<p class="note">사기 ' + moraleTag(d.staff) + (d.staff.trait ? ' · ' + traitTag(d.staff) : '') + '</p>' + praiseBtn(d.staff);
  h += '<button class="cta ghost" data-close="1">닫기</button>';
  showModal(h);
  bindPraise();
  document.querySelectorAll('[data-swap]').forEach(function (b) {
    b.onclick = function () { swapDealer(t, G.dealers[+b.getAttribute('data-swap')]); closeModal(); };
  });
  document.querySelectorAll('[data-place]').forEach(function (b) {
    b.onclick = function () { var d2 = G.dealers[+b.getAttribute('data-place')]; assignDealer(t, d2); d2.fresh = G.simT + 45; log(t.name + ' — 딜러 ' + d2.name + ' 배치', 'hi'); closeModal(); };
  });
  $('[data-close]').onclick = closeModal;
}

/* 칭찬 — 하루 한 번, 한 사람. 사기 +8 */
function praiseBtn(st) {
  var used = G.praiseDay === G.day;
  return '<button class="cta ghost" data-praise="' + st.id + '"' + (used ? ' disabled' : '') + '>👏 ' + st.name + ' 칭찬하기' + (used ? ' — 오늘은 이미 칭찬했다' : ' (하루 한 번 · 사기 +8)') + '</button> ';
}
function bindPraise() {
  document.querySelectorAll('[data-praise]').forEach(function (b) {
    b.onclick = function () {
      if (G.praiseDay === G.day) return;
      var id = +b.getAttribute('data-praise');
      var st = G.roster.concat(G.temps).filter(function (x) { return x.id === id; })[0];
      var a = staffActors().filter(function (x) { return x.staff === st; })[0];
      if (!st) return;
      G.praiseDay = G.day;
      addMorale(st, 8);
      if (a) { say(a, pick(['감사합니다! 😊', '더 열심히 할게요 💪', '헤헤 🙌']), 2.2); floatText(a.mesh.position.clone().setY(1.9), '사기 +8', 'good'); }
      say(G.player, '👏 ' + st.name + ' 씨 오늘 잘하고 있어요!', 2.2);
      log('👏 ' + st.name + ' 칭찬 — 사기 ' + Math.round(st.morale), 'good');
      SFX.good();
      closeModal();
    };
  });
}
function moraleTag(st) {
  var m = Math.round(st.morale != null ? st.morale : 70);
  return '<b>' + (m >= 60 ? '😊' : (m >= 35 ? '😐' : '😞')) + ' ' + m + '</b>';
}
function traitTag(st) { var t = TRAITS[st.trait]; return t ? '<span class="trait" title="' + t.desc + '">' + t.ic + ' ' + t.ko + '</span>' : ''; }

// ── 영업 중 직원 부르기 ─────────────────────────────
function activeCount(role) {
  return G.roster.concat(G.temps).filter(function (x) { return x.role === role && G.absent.indexOf(x) < 0; }).length;
}
function openHire() {
  if (G.phase !== 'open') return;
  var row = function (st, kind) {
    var full = activeCount(st.role) >= ROLES[st.role].max;
    return '<div class="item"><div>' + staffLine(st) + '<div class="note">' + ROLES[st.role].desc + '</div></div>' +
      '<button class="cta" data-hire-' + kind + '="' + st.id + '"' + (full ? ' disabled' : '') + '>' + (full ? '정원 찼음' : (kind === 'perm' ? '채용' : '부르기')) + '</button></div>';
  };
  var need = G.tables.filter(function (t) { return t.dealer === null && !t.broken; }).length;
  showModal('<div class="kicker">' + clock(gameMin()) + ' · 영업 중</div><h2>🧑‍💼 직원 부르기</h2>' +
    (G.absent.length ? '<p class="warn">📵 오늘 노쇼 — ' + G.absent.map(function (x) { return x.name + '(' + ROLES[x.role].ko + ')'; }).join(' · ') + '</p>' : '') +
    (need ? '<p class="warn">⚠️ 딜러 없는 테이블 ' + need + '개</p>' : '') +
    '<p class="note">부른 사람은 문으로 걸어 들어와 자리에 간 뒤부터 일한다. 일당은 오늘 하루치가 다 나간다.</p>' +
    '<h3>대타 — 오늘 밤만 · 일당 1.3배</h3><div class="shop">' + (G.onCall.length ? G.onCall.map(function (x) { return row(x, 'temp'); }).join('') : '<p class="note">더 부를 사람이 없다.</p>') + '</div>' +
    '<h3>오늘 지원자 — 정식 채용 · 지금부터 출근</h3><div class="shop">' + (G.cands.length ? G.cands.map(function (x) { return row(x, 'perm'); }).join('') : '<p class="note">남은 지원자가 없다.</p>') + '</div>' +
    '<h3>👏 칭찬 — 하루 한 번, 한 사람 (사기 +8)</h3><div class="shop">' + staffActors().map(function (a) {
      var st = a.staff;
      return '<div class="item"><div><b>' + st.name + '</b> <span class="role r-' + st.role + '">' + ROLES[st.role].ko + '</span> ' + traitTag(st) + '<div class="note">사기 ' + moraleTag(st) + '</div></div>' +
        '<button class="cta ghost" data-praise="' + st.id + '"' + (G.praiseDay === G.day ? ' disabled' : '') + '>👏</button></div>';
    }).join('') + '</div>' +
    '<button class="cta ghost" data-close="1">닫기</button>', true);
  bindPraise();
  document.querySelectorAll('[data-hire-temp]').forEach(function (b) {
    b.onclick = function () {
      var st = G.onCall.filter(function (x) { return x.id === +b.getAttribute('data-hire-temp'); })[0];
      G.onCall = G.onCall.filter(function (x) { return x !== st; });
      if (chance(0.12)) {
        G.pending.push({ st: st, at: G.simT + 10 });   // 연락이 끊긴다 — 10초 뒤에 알게 된다
        toast('📞 ' + st.name + '에게 연락했다…');
      } else {
        G.temps.push(st); spawnStaff(st, true);
        toast('📞 대타 ' + st.name + ' — 오는 중');
      }
      closeModal();
    };
  });
  document.querySelectorAll('[data-hire-perm]').forEach(function (b) {
    b.onclick = function () {
      var st = G.cands.filter(function (x) { return x.id === +b.getAttribute('data-hire-perm'); })[0];
      G.cands = G.cands.filter(function (x) { return x !== st; });
      G.roster.push(st); spawnStaff(st, true);
      toast('🧑‍💼 ' + st.name + ' 채용 — 오는 중');
      closeModal();
    };
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
  if (task.type === 'case') {   // 케이스 판정 — 문서의 상황 · 선택지 · 해설
    var cs = CASES_BY[d.id], fn = function (x) { return fillNames(x, d.names); };
    title = fn(cs.title);
    body = sceneHtml(fn(cs.sit)) + '<p class="caseq"><b>' + fn(cs.q) + '</b></p>';
    choices = d.order.map(function (i) { return fn(cs.ch[i]); });
    correct = d.order.indexOf(0);
    why = fn(cs.why);
    cite = '케이스 ' + cs.n + ' · ' + cs.rule;
  } else if (task.type === 'spot') {   // 🔍 딜러 실수 잡기 — 족보 · 셈
    title = '🔍 ' + d.q.title;
    body = d.q.body;
    choices = d.order.map(function (i) { return d.q.opts[i]; });
    correct = d.order.indexOf(d.q.correct);
    why = d.q.why;
    cite = '족보 · 팟 셈 — 대회 규정이 아니라 계산이다';
  } else if (task.type === 'btn') {
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
  showModal(head + '<h2>' + title + '</h2>' + body + '<div class="qbar"><i></i><span></span></div><div class="choices">' +
    choices.map(function (ch, i) { return '<button class="choice" data-ch="' + i + '">' + ch + '</button>'; }).join('') + '</div>');
  task.quickS = quickSecs(body + choices.join(''));
  task.quickBox = startQuickBar(task.quickS);
  document.querySelectorAll('[data-ch]').forEach(function (b) {
    b.onclick = function () { var ix = +b.getAttribute('data-ch'); verdict(task, ix === correct, why, cite, choices, correct, ix); };
  });
}

function verdict(task, ok, why, cite, choices, correct, pickIx, extra) {
  var t = G.tables[task.table];
  var h = '<div class="stamp ' + (ok ? 'ok' : 'no') + '">' + (ok ? (G.combo >= 1 ? 'PERFECT!' : 'GOOD CALL') : 'MISS') + '</div><div class="kicker">' + t.name + ' — 판정</div><div class="verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ 깔끔한 판정' : '✗ 틀린 판정 — 테이블이 술렁인다') + '</div>';
  if (choices) {
    h += '<div class="choices" style="margin-bottom:10px">' + choices.map(function (ch, i) {
      return '<div class="choice' + (i === correct ? ' right' : (i === pickIx ? ' wrong' : '')) + '">' + ch + '</div>';
    }).join('') + '</div>';
  }
  if (extra) h += '<p>' + extra + '</p>';
  if (ok && task.quickS && (performance.now() - task.quickBox.t0) / 1000 <= task.quickS) {   // ⚡ 빠른 판정
    G.rep = clamp(G.rep + QUICK_BONUS, 0, 100); G.stats.quick = (G.stats.quick || 0) + 1;
    h += '<div class="quick">⚡ 빠른 판정 — 평판 +' + QUICK_BONUS + '</div>';
    tone(1760, 0.08, 'triangle', 0.06, 0.25);
  }
  if (ok && task.type === 'case') {
    var dn = markCase(task.data.id), gift = DEX_GIFTS[dn];
    if (gift) gift.fn();
    if (dn) h += '<div class="dexnew">📚 판정 도감 +1 — ' + dn + ' / ' + CASES.length + (dn === CASES.length ? ' · 전부 모았다!' : '') + (gift ? '<br>' + gift.t : '') + '</div>';
  }
  if (ok && task.type === 'spot') G.stats.spot = (G.stats.spot || 0) + 1;
  h += '<p>' + why + '</p><div class="cite"><b>근거</b> ' + cite + (task.type === 'spot' ? '' : '<span class="unverified">원문 확인 전</span>') + '</div>' +
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
    var rc = regCloseMin();
    var o2 = ['30분 뒤 ' + clock(rc) + '에 등록과 리엔트리를 마감합니다', '지금 등록과 리엔트리를 마감합니다', '30분 뒤 ' + clock(rc + 60) + '에 등록과 리엔트리를 마감합니다'];
    choices = shuffle(o2.slice()); correct = choices.indexOf(o2[0]);
    why = '오늘(' + dayInfo().name + ') 레지 마감은 ' + clock(rc) + ' 이다. 30분 전에 미리 알리면 탈락한 손님이 리엔트리를 결정할 시간을 갖는다.';
  } else if (task.type === 'regclose') {
    var E = G.stats.entries, S = STACKS[stackIdx()].chips, U = G.stats.unique;
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
      var onTime = ok && task.type === 'level' && G.simT - task.t0 <= 8;
      if (onTime) { G.stats.onTime = (G.stats.onTime || 0) + 1; G.rep = clamp(G.rep + 0.3, 0, 100); }
      if (ok) { G.rep = clamp(G.rep + 0.25, 0, 100); SFX.mic(); } else { G.stats.annWrong++; G.rep = clamp(G.rep - 1, 0, 100); SFX.bad(); }
      showModal('<div class="kicker">📢 아나운스</div><div class="verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? (onTime ? '⏱ 정시 안내! 평판 +0.55' : '✓ 또렷한 안내') : '✗ 틀린 안내 — 손님들이 웅성거린다') + '</div>' +
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
// 목표 · 펍 등급 · 저장
// ═══════════════════════════════════════════════════
var GOAL_POOL = [
  { id: 'entries', ko: function (n) { return '엔트리 ' + n + '건 이상'; }, make: function (d) { return 18 + d * 3; }, test: function (s, n) { return s.entries >= n; }, now: function (s) { return s.entries; } },
  { id: 'nowrong', ko: function () { return '판정 실수 0 (틀림 · 못 감)'; }, test: function (s) { return s.wrong + s.missed === 0; } },
  { id: 'drinks', ko: function (n) { return '음료 ' + n + '잔 이상'; }, make: function (d) { return 26 + d * 4; }, test: function (s, n) { return s.drinks >= n; }, now: function (s) { return s.drinks; } },
  { id: 'sat', ko: function (n) { return '평균 만족도 ' + n + ' 이상'; }, make: function (d) { return 55 + Math.min(15, d * 2); }, test: function (s, n, x) { return x.avgSat >= n; } },
  { id: 'clean', ko: function (n) { return '바닥 젖은 시간 ' + n + '초 이하'; }, make: function () { return 70; }, test: function (s, n) { return s.spillSec <= n; } },
  { id: 'ann', ko: function () { return '아나운스 실수 0'; }, test: function (s) { return s.annMiss + s.annWrong === 0; } },
  { id: 'winner', ko: function () { return '우승자 배출 — 트로피 수여'; }, test: function (s, n, x) { return !!x.winner; } },
  { id: 'queue', ko: function () { return '줄이 길어 돌아간 손님 0'; }, test: function (s) { return s.lost + s.queueLeave === 0; } }
];
var GOAL_REWARD = 100000;
var DEPOSIT = 10000, RES_CAPS = [10, 16, 22];
function pickGoals() {
  if (G.goalsDay === G.day) return;
  G.goalsDay = G.day;
  G.goals = shuffle(GOAL_POOL.slice()).slice(0, 3).map(function (g) { return { id: g.id, n: g.make ? g.make(G.day) : null }; });
}
function goalDef(g) { return GOAL_POOL.filter(function (x) { return x.id === g.id; })[0]; }
function goalText(g) { return goalDef(g).ko(g.n); }

var RANKS = [[0, '동네 펍'], [40, '단골 많은 펍'], [65, '인기 펍'], [85, '홀덤 명소']];
function rankOf(rep) { var r = RANKS[0][1]; RANKS.forEach(function (x) { if (rep >= x[0]) r = x[1]; }); return r; }

var SAVE_KEY = 'pubsim.save.v1';
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 2, ver: VERSION, day: G.day, rep: G.rep, bank: G.bank, owned: G.owned, roster: G.roster, staffSeq: G.staffSeq, weekLog: G.weekLog, debtDays: G.debtDays, regulars: G.regulars,
      theme: G.theme, themes: G.themes, decorInv: G.decorInv, placed: G.placed, wins: G.wins, weekCh: G.weekCh, rival: G.rival,
      cfg: { fee: G.cfg.fee, stack: G.cfg.stack, level: G.cfg.level, price: G.cfg.price, stock: G.cfg.stock, assign: G.cfg.assign, resCap: G.cfg.resCap, resDeposit: G.cfg.resDeposit }
    }));
  } catch (e) { /* 저장이 막힌 브라우저 — 이어하기만 안 될 뿐이다 */ }
}
function loadSave() {
  var raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return null; }   // 저장이 막힌 브라우저
  if (!raw) return null;
  try {
    var s = JSON.parse(raw);
    if (!s || typeof s.day !== 'number' || !(s.day >= 1) || typeof s.bank !== 'number' || !Array.isArray(s.roster)) return { corrupt: true };
    return s;
  } catch (e) { return { corrupt: true }; }
}
function resetGame() {
  G.day = 1; G.rep = 50; G.bank = START_BANK; G.owned = {}; G.roster = startRoster(); G.staffSeq = 10;
  G.cfg = { fee: 30000, stack: 1, level: 1, price: 1, stock: 60, chipOk: null, assign: [1, 2, null], train: null, resCap: 1, resDeposit: true };
  G.goalsDay = null; G.candDay = null; G.tips = {}; G.praiseDay = null; G.raiseDayChecked = null; G.raiseReq = null;
  G.theme = 'classic'; G.themes = { classic: true }; G.decorInv = {}; G.placed = []; G.wins = 0; G.weekLog = []; G.debtDays = 0; G.regulars = makeRegulars(); G.weekCh = null;
  G.rival = { wins: 0, losses: 0, last: null, move: null };
  applyDecor();
}

// ═══════════════════════════════════════════════════
// 타이틀
// ═══════════════════════════════════════════════════
function titleScreen() {
  G.phase = 'title'; G.menu = null; G.paused = false;
  var sv = loadSave(), corrupt = !!(sv && sv.corrupt);
  if (corrupt) sv = null;
  var rec = loadRecords();
  showModal('<div class="titlecard"><div class="kicker">HOLD\'EM PUB MANAGER · ' + VERSION + '</div>' +
    '<div class="suits"><span>♠</span><span class="r">♥</span><span class="r">♦</span><span>♣</span></div>' +
    '<h1 class="logo">홀덤펍 점장</h1>' +
    '<p class="sub">오늘 밤, 당신의 펍에서 토너먼트가 열린다.<br>걸어 다니며 판정하고, 직원을 키우고, 동네 최고의 홀덤 명소를 만들자.</p></div>' +
    '<div class="pitch"><span>👟 직접 걷고</span><span>🚨 판정하고</span><span>🏆 키운다</span></div>' +
    '<div class="titlebtns">' +
    (sv ? '<button class="cta" data-cont="1">이어하기 — ' + dayInfo(sv.day).week + '주차 ' + dayInfo(sv.day).wk + '요일 · ' + rankOf(sv.rep) + '</button>' : '') +
    '<button class="cta' + (sv ? ' ghost' : '') + '" data-go="1">' + (sv ? '새로 시작' : '오픈 준비') + '</button>' +
    '<button class="cta ghost" data-drill="1">🎯 판정 연습실 — 5문제' + (rec.drillBest ? ' · 최고 ' + rec.drillBest + '점' : '') + '</button></div>' +
    (achTitle() ? '<p class="note recline">🎖️ 칭호 — <b>' + achTitle().ic + ' ' + achTitle().ko + '</b></p>' : (caseDex().length >= CASES.length ? '<p class="note recline">🏅 명예 플로어 — 판정 도감 완성</p>' : '')) +
    (corrupt ? '<p class="warn">저장 데이터가 손상돼 이어할 수 없다 — 새로 시작하면 덮어쓴다.</p>' : '') +
    (rec.seasons || rec.bankrupt ? '<p class="note recline">🏅 기록 — 시즌 ' + rec.seasons + '번 (클리어 ' + rec.clears + ') · 최고 평판 ' + rec.bestRep + ' · 최고 자금 ' + won(rec.bestBank) + '원' + (rec.bankrupt ? ' · 폐업 ' + rec.bankrupt + '번' : '') + '</p>' : '') +
    '<div class="titlefoot"><button class="linkbtn" data-tdex="1">📚 판정 도감 ' + caseDex().length + '/' + CASES.length + '</button><button class="linkbtn" data-tach="1">🎖️ 업적 ' + ACHS.filter(function (a) { return achGot()[a.id]; }).length + '/' + ACHS.length + '</button><button class="linkbtn" data-thelp="1">📖 도움말 · 하는 법</button><button class="linkbtn" data-tset="1">⚙️ 설정</button><button class="linkbtn" data-tcred="1">만든 사람</button></div>' +
    '<p class="legal">칩 환전 · 현금 시상 없음 — 매출은 참가비와 음료뿐. 판정 근거는 TDA 케이스 문서(원문 확인 전).</p>', true);
  $('[data-tset]').onclick = function () { openSettings(titleScreen); };
  $('[data-thelp]').onclick = function () { openHelp(titleScreen); };
  $('[data-tdex]').onclick = function () { openDex(titleScreen); };
  $('[data-tach]').onclick = function () { openAch(titleScreen); };
  $('[data-drill]').onclick = function () { audioOn(); openDrill(titleScreen); };
  $('[data-tcred]').onclick = function () { openCredits(titleScreen); };
  $('[data-go]').onclick = function () {
    audioOn();
    if (sv && !confirmNew.ok) {   // 이어할 저장이 있으면 한 번 더 묻는다
      showModal('<h2>새로 시작할까요?</h2><p>지금 저장(' + dayInfo(sv.day).week + '주차 ' + dayInfo(sv.day).wk + '요일)을 덮어쓴다.</p><div class="titlebtns"><button class="cta" data-new-yes="1">새로 시작</button><button class="cta ghost" data-new-no="1">돌아가기</button></div>');
      $('[data-new-yes]').onclick = function () { resetGame(); prepScreen('shop'); };
      $('[data-new-no]').onclick = titleScreen;
      return;
    }
    resetGame(); prepScreen('shop');
  };
  var c = $('[data-cont]');
  if (c) c.onclick = function () {
    audioOn();
    resetGame();
    G.day = sv.day; G.rep = sv.rep; G.bank = sv.bank; G.owned = sv.owned || {}; G.roster = sv.roster || startRoster(); G.staffSeq = sv.staffSeq || 50;
    G.weekLog = sv.weekLog || []; G.debtDays = sv.debtDays || 0; G.regulars = sv.regulars || makeRegulars();
    G.weekCh = sv.weekCh && sv.weekCh.list && sv.weekCh.list.every(function (c) { return wcDef(c); }) ? sv.weekCh : null;
    G.rival = sv.rival && typeof sv.rival === 'object' && typeof sv.rival.wins === 'number' ? sv.rival : { wins: 0, losses: 0, last: null, move: null };   // 1.4 저장은 라이벌이 없다
    if (G.rival.move && G.rival.move.type && !RIVAL_MOVES[G.rival.move.type]) G.rival.move = null;
    if (typeof G.rival.losses !== 'number') G.rival.losses = 0;
    if (G.rival.last && (typeof G.rival.last.me !== 'number' || typeof G.rival.last.them !== 'number')) G.rival.last = null;
    G.theme = THEMES[sv.theme] ? sv.theme : 'classic'; G.themes = sv.themes || { classic: true }; G.decorInv = sv.decorInv || {};
    var cnt = {};
    G.placed = (sv.placed || []).filter(function (p) {   // 망가진 저장 — 좌표가 이상하거나 산 것보다 많이 놓인 것은 버린다
      if (!DECOR_ITEMS[p.kind] || !isFinite(p.x) || !isFinite(p.z)) return false;
      cnt[p.kind] = (cnt[p.kind] || 0) + 1;
      return cnt[p.kind] <= (G.decorInv[p.kind] || 0);
    });
    G.wins = sv.wins || 0;
    Object.keys(sv.cfg || {}).forEach(function (k) { G.cfg[k] = sv.cfg[k]; });
    applyDecor();
    if (dayInfo().wd === 6) weeklyScreen(); else prepScreen('shop');
  };
}

// ═══════════════════════════════════════════════════
// 오픈 준비 — 상점 · 직원 · 칩 구조 · 음료 · 딜러 배치
// ═══════════════════════════════════════════════════
function genCandidates() {
  if (G.candDay === G.day) return;
  G.candDay = G.day;
  var roles = ['dealer', 'dealer', 'server', 'counter', 'cleaner', 'floor', 'floor', 'dealer'];
  var used = G.roster.map(function (s) { return s.name; });
  G.cands = shuffle(roles.slice()).slice(0, 4).map(function (role) {
    var nm = pick(STAFF_NAMES.filter(function (n) { return used.indexOf(n) < 0; }));
    used.push(nm);
    var skill = 50 + rnd(41);
    var s = { id: ++G.staffSeq, name: nm, role: role, skill: skill, days: 0, rel: Math.round((0.8 + Math.random() * 0.18) * 100) / 100, trait: rollTrait(), morale: 62 + rnd(18) };
    if (role === 'dealer') s.speed = Math.round((0.9 + Math.random() * 0.3) * 100) / 100;
    s.wage = wageOf(role, skill);
    return s;
  });
}
/* 일당 인상 요청 — 사기 45 아래 직원 한 명이 오픈 준비 때 찾아온다 (하루 한 번) */
function genRaiseRequest() {
  if (G.raiseDayChecked === G.day) return;
  G.raiseDayChecked = G.day; G.raiseReq = null;
  var low = G.roster.filter(function (s) { return morale(s) < 45 && s.raiseDay !== G.day; }).sort(function (a, b) { return morale(a) - morale(b); })[0];
  if (low) G.raiseReq = { id: low.id, amt: Math.max(10000, Math.round(low.wage * 0.1 / 10000) * 10000) };
}
function raiseBox() {
  var rq = G.raiseReq, s = rq && G.roster.filter(function (x) { return x.id === rq.id; })[0];
  if (!s) return '';
  return '<div class="raisebox">🙋 <b>' + s.name + '</b>(' + ROLES[s.role].ko + ', 사기 ' + Math.round(morale(s)) + ') — "사장님, 일당 좀 올려 주실 수 있을까요?" ' +
    '<b>' + won(s.wage) + ' → ' + won(s.wage + rq.amt) + '</b>' +
    '<div class="rqbtns"><button class="cta" data-rq="1">올려 준다 (사기 +20)</button><button class="cta ghost" data-rq="0">이번엔 어렵다 (사기 −15)</button></div></div>';
}
/* 🥊 라이벌 펍 (1.5) — 길 건너 「로열 라운지」. 영업 중엔 아무것도 늘지 않는다: 오픈 준비에서 수를 막을지 정하고, 일요일에 한 주 손님 수로 겨룬다.
   라이벌 손님 수는 주마다 오른다(후반이 어렵다). 합법 운영 그대로 — 라이벌도 우리도 참가비 · 음료 · 트로피뿐 */
var RIVAL = '로열 라운지';
var RIVAL_MOVES = {
  clash: { ic: '📣', head: '이번 토요일 같은 시간에 「로열 메인 이벤트」를 건다', lose: '토요일 손님 −15%', cost: 300000, counter: '맞불 홍보 — 단골에게 토요일 안내' },
  discount: { ic: '🏷️', head: '평일(월~목) 참가비를 깎는다', lose: '평일 손님 −10%', cost: 200000, counter: '평일 홍보 — 동네 전단 · 음료 시음' },
  poach_reg: { ic: '💌', head: '「한번 와 보라」며 연락했다', lose: '일요일까지 ♥60 아래면 라이벌로 옮긴다', cost: 30000, counter: '안부 연락 — 다음 방문 음료 한 잔 (♥ +12)' },
  poach_staff: { ic: '🕴️', head: '이직 제안을 했다', lose: '일요일까지 사기 60 아래면 떠난다', cost: 0, counter: '붙잡는다 — 일당 +2만 · 사기 +10' }
};
function rivalState() { if (!G.rival || typeof G.rival !== 'object') G.rival = { wins: 0, losses: 0, last: null, move: null }; return G.rival; }
function rivalBase(week) { return Math.round(170 + 20 * (week - 1)); }   // 1.0 QA 1주차 실측 181명 · 사람형 봇 261명 — 1주차는 이길 만하고, 8주차 310명은 3번 테이블이 있어야 버겁지 않다
function genRivalMove() {
  var R = rivalState(), w = dayInfo().week;
  if (w < 2 || (R.move && R.move.week === w)) return;
  R.move = { week: w, type: null, status: 'none' };
  if (!chance(0.8)) return;
  var types = ['clash', 'discount'];
  var reg = G.regulars.filter(function (r) { return !r.gone; }).sort(function (a, b) { return a.aff - b.aff; })[0];
  var dl = G.roster.filter(function (s) { return s.role === 'dealer'; }).sort(function (a, b) { return b.skill - a.skill; })[0];
  if (reg && reg.aff < 60) types.push('poach_reg');   // 모두 ♥60 이상이면 빼가기는 아무 일도 못 한다 — 내지 않는다
  if (dl && roleCount('dealer') >= 3) types.push('poach_staff');   // 딜러가 둘뿐이면 내지 않는다 — 영업이 막힌다
  var type = pick(types);
  R.move = { week: w, type: type, status: 'open', target: type === 'poach_reg' ? reg.id : (type === 'poach_staff' ? dl.id : null) };
  saveGame();   // 새로고침으로 수를 다시 뽑지 못하게
}
function rivalTargetName(m) {
  if (m.type === 'poach_reg') { var r = G.regulars[m.target]; return r ? r.name : ''; }
  if (m.type === 'poach_staff') { var s = G.roster.filter(function (x) { return x.id === m.target; })[0]; return s ? s.name : ''; }
  return '';
}
function rivalBox() {
  var R = rivalState(), w = dayInfo().week, m = R.move && R.move.week === w ? R.move : null;
  var rec = (R.wins + R.losses) ? ' · 시즌 <b>' + R.wins + '승 ' + R.losses + '패</b>' : '';
  var last = R.last ? ' · 지난주 손님 우리 ' + R.last.me + ' : ' + R.last.them : '';
  if (w < 2 && !R.last) return '<div class="rivalbox"><b>🥊 ' + RIVAL + '</b> — 길 건너에 새 홀덤펍이 문을 열었다. 일요일마다 <b>한 주 손님 수</b>로 겨룬다(이기면 평판 +2, 지면 −1).</div>';
  var h = '<div class="rivalbox"><b>🥊 ' + RIVAL + '</b>' + rec + last + ' · 이번 주 목표치 약 <b>' + rivalBase(w) + '</b>명';
  if (m && m.type) {
    var M = RIVAL_MOVES[m.type], who = rivalTargetName(m);
    h += '<div class="rmove">' + M.ic + ' ' + (who ? '<b>' + who + '</b>' + (m.type === 'poach_staff' ? '(딜러)' : '(단골)') + ' — ' : '') + RIVAL + josa(RIVAL, '이', '가') + ' ' + M.head + '. <span class="note">그냥 두면: ' + M.lose + '</span></div>';
    if (m.status === 'open') {
      var poor = M.cost > G.bank;
      h += '<div class="rqbtns"><button class="cta" data-rv="1"' + (poor ? ' disabled' : '') + '>' + M.counter + (M.cost ? ' (' + won(M.cost) + '원)' : '') + '</button><button class="cta ghost" data-rv="0">그냥 둔다</button></div>';
    } else h += '<div class="note">' + (m.status === 'countered' ? '✓ 막았다' : '— 그냥 두기로 했다') + '</div>';
  }
  return h + '</div>';
}
function rivalDecide(counter) {
  var R = rivalState(), m = R.move;
  if (!m || m.status !== 'open') return;
  var M = RIVAL_MOVES[m.type];
  if (!counter) { m.status = 'ignored'; toast('🥊 ' + RIVAL + '의 수를 그냥 두기로 했다'); return; }
  if (M.cost > G.bank) return;
  G.bank -= M.cost; m.status = 'countered';
  if (m.type === 'poach_reg') { var r = G.regulars[m.target]; if (r) r.aff = clamp(r.aff + 12, 0, 100); }
  if (m.type === 'poach_staff') { var s = G.roster.filter(function (x) { return x.id === m.target; })[0]; if (s) { s.wage += 20000; addMorale(s, 10); } }
  toast('🥊 막았다 — ' + M.counter); SFX.good();
}
/* 영업 중 손님 도착 — 라이벌 수를 그냥 뒀으면 그날만 줄어든다(1 = 그대로) */
function rivalArrK() {
  var R = G.rival, m = R && R.move, info = dayInfo();
  if (!m || m.week !== info.week || m.status === 'countered' || !m.type) return 1;   // 정하지 않고 열어도 「그냥 둠」
  if (m.type === 'clash' && info.wd === 5) return 0.85;
  if (m.type === 'discount' && info.wd <= 3) return 0.9;
  return 1;
}
/* 일요일 — 대결 결과 · 빼가기 결과. 돌려주는 글은 주간 정산 화면에 */
function rivalSettle(w) {
  var R = rivalState(), m = R.move && R.move.week === w ? R.move : null, lines = [];
  var me = G.weekLog.reduce(function (t, d) { return t + d.entries; }, 0);
  var boost = m && m.type && m.status !== 'countered' && (m.type === 'clash' || m.type === 'discount') ? 1.08 : 1;
  var them = Math.round(rivalBase(w) * boost * (0.94 + Math.random() * 0.12));
  var win = me > them;
  if (win) { R.wins++; G.rep = clamp(G.rep + 2, 0, 100); } else { R.losses++; G.rep = clamp(G.rep - 1, 0, 100); }
  R.last = { week: w, me: me, them: them, win: win };
  if (m && m.type === 'poach_reg' && m.status !== 'countered') {
    var r = G.regulars[m.target];
    if (r && !r.gone && r.aff < 60) { r.gone = true; lines.push('💔 단골 ' + r.name + ' — ' + RIVAL + '로 옮겼다'); }
    else if (r) lines.push('💌 ' + r.name + josa(r.name, '은', '는') + ' 그래도 우리 펍에 남았다');
  }
  if (m && m.type === 'poach_staff' && m.status !== 'countered') {
    var s = G.roster.filter(function (x) { return x.id === m.target; })[0];
    if (s && morale(s) < 60 && roleCount('dealer') >= 3) { G.roster = G.roster.filter(function (x) { return x !== s; }); G.cfg.assign = G.cfg.assign.map(function (id) { return id === s.id ? null : id; }); lines.push('🕴️ 딜러 ' + s.name + ' — ' + RIVAL + '로 떠났다'); }
    else if (s) lines.push('🕴️ ' + s.name + josa(s.name, '은', '는') + ' 제안을 거절하고 남았다');
  }
  return { win: win, me: me, them: them, lines: lines };
}
function roleCount(role) { return G.roster.filter(function (s) { return s.role === role; }).length; }
function staffLine(s) {
  var stat = s.role === 'dealer' ? '정확도 ' + s.skill + ' · 속도 ' + Math.round(s.speed * 100) : '능력 ' + s.skill;
  var tr = s.role === 'dealer' && !s.temp ? trainOf(s) : null;
  return '<b>' + s.name + '</b> <span class="role r-' + s.role + '">' + ROLES[s.role].ko + '</span> ' + traitTag(s) +
    (tr && mixOk(s) ? ' <span class="trait mix">🃏 믹스 자격</span>' : '') + '<div class="note">' + stat +
    ' · 일당 ' + won(s.wage) + (s.temp ? '' : ' · 출근율 ' + Math.round(relOf(s) * 100) + '%') + (s.days ? ' · ' + s.days + '일 근무' : '') +
    ' · 사기 ' + moraleTag(s) + (tr ? ' · 교육 판정 ' + tr.j + ' · 속도 ' + tr.s + ' · 응대 ' + tr.v : '') +
    (s.trait ? '<br>' + TRAITS[s.trait].desc : '') + '</div>';
}
function wagesTotal() { return G.roster.reduce(function (t, s) { return t + s.wage; }, 0); }

function prepScreen(tab) {
  G.phase = 'prep';
  pickGoals();
  genCandidates();
  genRaiseRequest();
  genRivalMove();
  G.prepTab = tab || G.prepTab || 'shop';
  var cfg = G.cfg;
  // 해고된 딜러가 배치에 남아 있으면 비운다
  cfg.assign = cfg.assign.map(function (id) { return G.roster.some(function (s) { return s.id === id && s.role === 'dealer'; }) ? id : null; });
  var tabs = [['shop', '🏪', '상점'], ['decor', '🎨', '꾸미기'], ['staff', '👥', '직원'], ['dealers', '🃏', '딜러'], ['chips', '🎲', '칩 · 구조'], ['drinks', '🍺', '음료'], ['resv', '📋', '예약'], ['regs', '⭐', '단골']];
  var info = dayInfo(), first = G.day - info.wd;
  var cal = '<div class="cal">' + WEEKDAYS.map(function (wd, i) {
    var di = dayInfo(first + i), past = i < info.wd, today = i === info.wd;
    var logd = G.weekLog.filter(function (x) { return x.day === first + i; })[0];
    return '<div class="cd' + (today ? ' today' : '') + (past ? ' past' : '') + (i >= 4 ? ' ev' + i : '') + '"><b>' + wd + '</b><span>' + di.short + '</span>' +
      (logd ? '<em>' + '★'.repeat(logd.stars) + '</em>' : '') + '</div>';
  }).join('') + '</div>';
  /* 오늘 밤 카드 하나 + 목표 칩 셋 + 접힌 「이번 주」 — 위쪽을 가볍게 */
  var wch = info.wd !== 6 ? weekChallenges() : null;
  var wDone = wch ? wch.list.filter(function (c) { return !wcDef(c).low && wcDone(c); }).length : 0;
  var monday = info.wd === 0 && G.day > 1;
  var h = '<div class="hero ev' + info.wd + '"><div class="hero-l"><div class="kicker">' + info.week + '주차 ' + info.wk + '요일 · 오늘 밤</div>' +
    '<h2>' + info.name + '</h2><p class="note">' + info.desc + '</p></div>' +
    '<div class="hero-r"><div class="stat"><small>자금</small><b>' + won(G.bank) + '</b></div>' +
    '<div class="stat"><small>평판 · ' + rankOf(G.rep) + '</small><b>' + Math.round(G.rep) + '</b></div></div></div>' +
    raiseBox() + rivalBox() +
    '<div class="goalchips"><span class="gl">🎯 오늘 목표 <small>하나에 +' + won(GOAL_REWARD) + '</small></span>' + G.goals.map(function (g) { return '<span class="gchip">' + goalText(g) + '</span>'; }).join('') + '</div>' +
    '<details class="weekfold"' + (monday ? ' open' : '') + '><summary>📅 이번 주 <span>시즌 ' + Math.min(SEASON_WEEKS, info.week) + '/' + SEASON_WEEKS + ' · 난이도 ' + diffLv() + '/6' +
      (wch ? ' · 도전 ' + wDone + '/' + wch.list.length : '') + '</span></summary>' +
      cal + seasonBar() + diffBox() + weekBox() + '<p class="note">오늘 인건비 ' + won(wagesTotal()) + '원</p></details>' +
    '<div class="tabs">' + tabs.map(function (x) { return '<button data-tab="' + x[0] + '" class="' + (G.prepTab === x[0] ? 'on' : '') + '"><span class="ti">' + x[1] + '</span>' + x[2] + '</button>'; }).join('') + '</div>';

  if (G.prepTab === 'shop') {
    h += '<div class="shop">' + SHOP.map(function (it) {
      var own = !!G.owned[it.id];
      var dis = own || it.price > G.bank;
      return '<div class="item' + (own ? ' own' : '') + '"><div><b>' + it.ko + '</b><div class="note">' + it.desc + '</div></div>' +
        '<button class="cta' + (own ? ' ghost' : '') + '" data-buy="' + it.id + '"' + (dis ? ' disabled' : '') + '>' + (own ? '보유' : won(it.price) + '원') + '</button></div>';
    }).join('') + '</div>';
  } else if (G.prepTab === 'decor') {
    h += '<h3>테마</h3><div class="shop">' + Object.keys(THEMES).map(function (k) {
      var th = THEMES[k], own = !!G.themes[k], on = G.theme === k;
      var btn = on ? '<button class="cta ghost" disabled>사용 중</button>' :
        (own ? '<button class="cta" data-theme-use="' + k + '">바꾸기</button>' :
          '<button class="cta" data-theme-buy="' + k + '"' + (th.price > G.bank ? ' disabled' : '') + '>' + won(th.price) + '원</button>');
      return '<div class="item' + (on ? ' own' : '') + '"><div><b>' + th.ko + '</b><div class="note">' + th.desc + '</div></div>' + btn + '</div>';
    }).join('') + '</div>' +
      '<h3>장식</h3><div class="shop">' + Object.keys(DECOR_ITEMS).map(function (k) {
        var it = DECOR_ITEMS[k], n = decorCount(k), full = it.max && n >= it.max;
        return '<div class="item"><div><b>' + it.ic + ' ' + it.ko + '</b>' + (n ? ' <span class="role">' + n + '개 · 놓음 ' + placedCount(k) + '</span>' : '') +
          '<div class="note">' + it.desc + (k === 'trophy' ? ' — 지금까지 우승 ' + (G.wins || 0) + '번' : '') + '</div></div>' +
          '<button class="cta" data-dbuy="' + k + '"' + (full || it.price > G.bank ? ' disabled' : '') + '>' + (full ? '보유' : won(it.price) + '원') + '</button></div>';
      }).join('') + '</div>' +
      '<p class="note">장식은 <b>반경 3 안 손님</b>의 만족도를 서서히 올린다 — 손님이 오래 머무는 바 앞 · 테이블 사이에 두면 효과가 크다. 테이블 · 카운터 · 동선 근처에는 놓을 수 없다. 위치는 저장된다.</p>' +
      '<button class="cta" data-goplace="1"' + (Object.keys(DECOR_ITEMS).some(function (k) { return decorCount(k) > 0; }) ? '' : ' disabled') + '>🪴 배치하러 가기 (놓음 ' + G.placed.length + '개)</button>';
  } else if (G.prepTab === 'staff') {
    h += '<h3>우리 직원</h3><div class="shop">' + G.roster.map(function (s) {
      var raised = s.raiseDay === G.day;
      return '<div class="item"><div>' + staffLine(s) + '</div><div class="btncol">' +
        '<button class="cta ghost" data-raise="' + s.id + '"' + (raised ? ' disabled' : '') + '>' + (raised ? '인상함 ✓' : '💵 일당 +1만') + '</button>' +
        '<button class="cta ghost" data-fire="' + s.id + '">내보내기</button></div></div>';
    }).join('') + '</div>' +
      '<p class="note"><b>사기</b> — 60 아래면 정확도 · 속도가 떨어지고, 35 아래면 노쇼가 잦아지고, <b>20 아래면 마감 때 그만둔다</b>. 지친 딜러를 오래 두면 떨어지고, 칭찬(영업 중 하루 한 번) · 일요일 휴무 · 일당 인상(+15)으로 오른다.</p>' +
      '<h3>오늘 찾아온 지원자</h3><div class="shop">' + G.cands.map(function (s) {
        var full = roleCount(s.role) >= ROLES[s.role].max;
        return '<div class="item"><div>' + staffLine(s) + '<div class="note">' + ROLES[s.role].desc + '</div></div>' +
          '<button class="cta" data-hire="' + s.id + '"' + (full ? ' disabled' : '') + '>' + (full ? ROLES[s.role].ko + ' 정원 찼음' : '채용') + '</button></div>';
      }).join('') + (G.cands.length ? '' : '<p class="note">오늘은 더 찾아온 사람이 없다.</p>') + '</div>' +
      '<p class="note">일당은 출근한 날마다 나간다. <b>2일차부터 출근율만큼만 나온다</b> — 노쇼하면 영업 중 🧑‍💼 로 대타를 부른다. 직원은 하루 일할 때마다 능력이 1씩 오른다. 플로어 보조는 아나운스 · 밸런싱 · 청소를 대신하지만 <b>판정 호출은 점장 몫</b>이다.</p>';
  } else if (G.prepTab === 'chips') {
    var lockStack = info.stack !== null;
    h += '<h3>스타팅 스택' + (lockStack ? ' — 오늘은 ' + STACKS[info.stack].ko + ' 고정' : '') + '</h3><div class="seg">' + STACKS.map(function (s, i) {
      return '<button data-stack="' + i + '"' + (lockStack ? ' disabled' : '') + ' class="' + (stackIdx() === i ? 'on' : '') + '">' + s.ko + '<br><small>' + (i === 0 ? '빨리 끝남 · 만족 ↓' : (i === 2 ? '오래 감 · 만족 ↑' : '보통')) + '</small></button>';
    }).join('') + '</div>' +
      '<h3>레벨 시간</h3><div class="seg">' + LEVEL_LEN.map(function (m, i) {
        return '<button data-lvl="' + i + '" class="' + (cfg.level === i ? 'on' : '') + '">' + m + '분</button>';
      }).join('') + '</div>' +
      '<h3>참가비</h3><div class="seg">' + FEES.map(function (f) {
        var hint = f === 20000 ? '손님 ↑ · 객단가 ↓' : (f === 30000 ? '보통' : '손님 ↓ · 리엔트리 ↓');
        return '<button data-fee="' + f + '" class="' + (cfg.fee === f ? 'on' : '') + '">' + won(f * info.feeMul) + '원<br><small>' + hint + '</small></button>';
      }).join('') + '</div>' +
      '<h3>칩 세팅</h3><p class="note">테이블마다 스타팅 칩 세트를 깐다. 세트 구성이 틀리면 영업 중에 항의가 터진다.</p>' +
      (cfg.chipOk === null ? '<button class="cta" data-chipq="1">칩 세트 확인하기</button>' :
        '<p><b>' + (cfg.chipOk ? '✓ 칩 세팅 완료' : '✗ 칩 세팅 오류 — 영업 중 항의가 생길 수 있다') + '</b></p>');
  } else if (G.prepTab === 'resv') {
    if (info.wd === 4 || info.wd === 5) {
      var e = expectedResv();
      h += '<p>' + info.name + '은 <b>사전 예약</b>을 받는다. 예약 손님은 18~19시에 와서 줄 앞쪽으로 들어가고 빨리 등록된다. ' +
        '대신 <b>19:30 까지 예약 수만큼 자리를 비워 둔다</b> — 그동안 예약 없이 온 손님은 못 앉는다.</p>' +
        '<h3>예약 상한</h3><div class="seg">' + RES_CAPS.map(function (n, i) { return '<button data-rescap="' + i + '" class="' + (cfg.resCap === i ? 'on' : '') + '">' + n + '건</button>'; }).join('') + '</div>' +
        '<h3>보증금 (' + won(DEPOSIT) + '원)</h3><div class="seg">' +
        '<button data-resdep="1" class="' + (cfg.resDeposit ? 'on' : '') + '">받는다<br><small>노쇼 8% · 예약 −25%</small></button>' +
        '<button data-resdep="0" class="' + (!cfg.resDeposit ? 'on' : '') + '">안 받는다<br><small>노쇼 25%</small></button></div>' +
        '<p class="note" style="margin-top:8px">예상 — 예약 <b>' + e.req + '건</b> · 노쇼 약 <b>' + Math.round(e.req * e.rate) + '명</b>. 노쇼한 자리는 19:30 까지 비어 있다. 보증금을 받았다면 노쇼분은 매출이 된다.</p>';
    } else {
      h += '<p>평일에는 예약을 받지 않는다. <b>금 · 토</b> 대회만 사전 예약을 연다.</p><p class="note">이번 주 금요일까지 ' + (4 - info.wd) + '일.</p>';
    }
  } else if (G.prepTab === 'regs') {
    var regs = G.regulars.slice().sort(function (a, b) { return (a.gone ? 1 : 0) - (b.gone ? 1 : 0) || b.aff - a.aff; });
    h += '<p class="note">단골은 발밑에 <b>금색 고리</b>가 있다. 만족하고 가면 호감이 오르고, 호감이 높으면 친구를 데려온다. 좋아하는 음료를 10초 안에 내면 더 좋아한다. 호감이 바닥나면 발길을 끊는다.</p>' +
      '<div class="shop">' + regs.map(function (r) {
        return '<div class="item' + (r.gone ? ' gone' : '') + '"><div><b>' + r.name + '</b> <span class="role">' + CUST_TYPES[r.type].ko + '</span> ' + r.fav +
          '<div class="note">방문 ' + r.visits + '회' + (r.gone ? ' · 💔 발길을 끊었다' : '') + '</div></div>' +
          '<div class="aff"><i style="width:' + r.aff + '%"></i></div></div>';
      }).join('') + '</div>';
  } else if (G.prepTab === 'drinks') {
    h += '<h3>음료 가격</h3><div class="seg">' + PRICES.map(function (p, i) {
      return '<button data-price="' + i + '" class="' + (cfg.price === i ? 'on' : '') + '">' + won(p.p) + '원<br><small>' + (i === 0 ? '많이 팔림' : (i === 2 ? '덜 팔림' : '보통')) + '</small></button>';
    }).join('') + '</div>' +
      '<h3>재고 입고 (개당 ' + won(STOCK_COST) + '원, 오늘 밤만)</h3><div class="seg">' + STOCK_OPTS.map(function (s) {
        return '<button data-stock="' + s + '" class="' + (cfg.stock === s ? 'on' : '') + '">' + s + '개<br><small>' + won(s * STOCK_COST) + '원</small></button>';
      }).join('') + '</div>' +
      '<p class="note">재고가 떨어지면 손님이 음료를 못 사고 실망한다. 남은 재고는 마감 때 버린다. 홀 서버가 둘이면 더 많이 판다.' + (G.owned.coffee ? ' 커피 머신 덕에 구매율 +20%.' : '') + '</p>';
  } else {
    var tn = tableCount();
    var ds = G.roster.filter(function (s) { return s.role === 'dealer'; });
    h += '<div class="grid3">' + ds.map(function (d) {
      var a = cfg.assign.indexOf(d.id);
      var segs = [];
      for (var k = 0; k < tn; k++) segs.push('<button data-as="' + d.id + ':' + k + '" class="' + (cfg.assign[k] === d.id ? 'on' : '') + '">' + (k + 1) + '번</button>');
      segs.push('<button data-as="' + d.id + ':r" class="' + (a < 0 || a >= tn ? 'on' : '') + '">휴식</button>');
      var tr = trainOf(d);
      return '<div class="card"><div class="nm">딜러 ' + d.name + ' ' + traitTag(d) + '</div><div class="st">정확도 ' + d.skill + '<br>속도 ' + Math.round(d.speed * 100) + '<br>사기 ' + Math.round(morale(d)) +
        (mixOk(d) ? '<br>🃏 믹스 자격' : '') + '</div><div class="seg">' + segs.join('') + '</div>' +
        '<div class="trtree">' + Object.keys(TRAIN).map(function (k) {
          var lv = tr[k], max = lv >= 3, xp = xpOf(d)[k];
          return '<button class="cta ghost" data-train="' + d.id + ':' + k + '"' + (cfg.train !== null || max ? ' disabled' : '') + ' title="' + TRAIN[k].desc + '">' +
            TRAIN[k].ko + ' <b>' + '●'.repeat(lv) + '○'.repeat(3 - lv) + '</b>' + (cfg.train === d.id + ':' + k ? ' ✓' : '') +
            (max ? '' : '<i class="xpbar"><u style="width:' + Math.round(xp) + '%"></u></i>') + '</button>';
        }).join('') + '</div>' +
        '<div class="grow2"><button class="cta ghost" data-mentor="' + d.id + '"' + (mentorsFor(d).length ? '' : ' disabled') + '>🤝 멘토 ' + (mentorOk(d) || '없음') + '</button>' +
        '<button class="cta ghost" data-sem="' + d.id + '"' + (d.semWeek === info.week || G.bank < SEMINAR_COST || !semBranch(d) ? ' disabled' : '') + '>📚 세미나 ' + (d.semWeek === info.week ? '이번 주 다녀옴' : won(SEMINAR_COST)) + '</button></div></div>';
    }).join('') + '</div><p class="note">휴식 딜러가 있어야 영업 중에 교대할 수 있다. 교대 직후 45초 동안 진행 속도가 오른다.<br>' +
      '<b>단계를 올리는 길은 넷</b> — ① <b>교육</b>(하루 한 번 · 3문제 중 2개면 +1) ② <b>실전</b>(막대가 차면 +1 — 자기 테이블 판정을 점장이 맞히면 판정(틀려도 조금), 핸드를 돌리면 속도, 만족하고 간 손님은 응대) ' +
      '③ <b>멘토</b>(2단계 이상 선배를 붙이면 같이 일한 날 경험 +35, 선배 사기 +2) ④ <b>세미나</b>(' + won(SEMINAR_COST) + ' · 한 사람 주 1회 · 가장 낮은 갈래 바로 +1). <b>판정 2단계면 믹스게임 자격</b>.' +
      (G.owned.mix ? ' <b>2번 = PLO8 믹스 테이블</b> — 믹스 자격 없는 딜러를 앉히면 사고가 2배.' : '') +
      (ds.length < tn ? ' <b>딜러가 테이블 수보다 적다 — 직원 탭에서 채용하세요.</b>' : '') + '</p>';
  }
  var ready = cfg.assign.slice(0, tableCount()).every(function (x) { return x !== null && x !== undefined; });
  var stockCost = cfg.stock * STOCK_COST;
  h += '<div class="prepfoot"><span class="note">' + (ready ? '재고 ' + won(stockCost) + '원 · 인건비 ' + won(wagesTotal()) + '원' : '<b>모든 테이블에 딜러를 배치하세요 — 🃏 딜러 탭</b>') + '</span>' +
    '<button class="cta go" data-open="1"' + (ready ? '' : ' disabled') + '>▶ 영업 시작 <small>18:00</small></button></div>';
  showModal(h, true);

  document.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { prepScreen(b.getAttribute('data-tab')); }; });
  document.querySelectorAll('[data-buy]').forEach(function (b) { b.onclick = function () { buy(b.getAttribute('data-buy')); }; });
  document.querySelectorAll('[data-hire]').forEach(function (b) {
    b.onclick = function () {
      var id = +b.getAttribute('data-hire'), s = G.cands.filter(function (x) { return x.id === id; })[0];
      if (!s || roleCount(s.role) >= ROLES[s.role].max) return;
      G.roster.push(s); G.cands = G.cands.filter(function (x) { return x !== s; });
      toast(ROLES[s.role].ko + ' ' + s.name + ' — 채용'); SFX.good();
      prepScreen('staff');
    };
  });
  document.querySelectorAll('[data-theme-buy]').forEach(function (b) {
    b.onclick = function () {
      var k = b.getAttribute('data-theme-buy'), th = THEMES[k];
      if (G.themes[k] || G.bank < th.price) return;
      G.bank -= th.price; G.themes[k] = true; G.theme = k;
      applyDecor(); toast('🎨 ' + th.ko + ' 테마 — 구매 · 적용'); SFX.cash(); prepScreen('decor');
    };
  });
  document.querySelectorAll('[data-theme-use]').forEach(function (b) {
    b.onclick = function () { G.theme = b.getAttribute('data-theme-use'); applyDecor(); toast('🎨 ' + THEMES[G.theme].ko + ' 테마로 바꿨다'); prepScreen('decor'); };
  });
  document.querySelectorAll('[data-dbuy]').forEach(function (b) {
    b.onclick = function () {
      var k = b.getAttribute('data-dbuy'), it = DECOR_ITEMS[k];
      if (G.bank < it.price || (it.max && decorCount(k) >= it.max)) return;
      G.bank -= it.price; G.decorInv[k] = decorCount(k) + 1;
      toast(it.ic + ' ' + it.ko + ' — 샀다. 「배치하러 가기」로 놓는다'); SFX.cash(); prepScreen('decor');
    };
  });
  var gp = $('[data-goplace]'); if (gp) gp.onclick = enterPlace;
  document.querySelectorAll('[data-raise]').forEach(function (b) {
    b.onclick = function () {
      var s = G.roster.filter(function (x) { return x.id === +b.getAttribute('data-raise'); })[0];
      if (!s || s.raiseDay === G.day) return;
      s.raiseDay = G.day; s.wage += 10000; addMorale(s, 15);
      toast('💵 ' + s.name + ' 일당 ' + won(s.wage) + ' — 사기 ' + Math.round(s.morale)); SFX.cash();
      prepScreen('staff');
    };
  });
  document.querySelectorAll('[data-rv]').forEach(function (b) {
    b.onclick = function () { rivalDecide(b.getAttribute('data-rv') === '1'); prepScreen(); };
  });
  document.querySelectorAll('[data-rq]').forEach(function (b) {
    b.onclick = function () {
      var rq = G.raiseReq, s = rq && G.roster.filter(function (x) { return x.id === rq.id; })[0];
      G.raiseReq = null;
      if (!s) { prepScreen(); return; }
      if (b.getAttribute('data-rq') === '1') { s.wage += rq.amt; addMorale(s, 20); s.raiseDay = G.day; toast('🤝 ' + s.name + ' 일당 인상 수락 — 사기 +20'); SFX.good(); }
      else { addMorale(s, -15); toast('🙅 ' + s.name + ' 인상 거절 — 사기 −15'); SFX.bad(); }
      prepScreen();
    };
  });
  document.querySelectorAll('[data-fire]').forEach(function (b) {
    b.onclick = function () {
      var id = +b.getAttribute('data-fire');
      var s = G.roster.filter(function (x) { return x.id === id; })[0];
      G.roster = G.roster.filter(function (x) { return x.id !== id; });
      toast(s.name + ' — 내보냈다');
      prepScreen('staff');
    };
  });
  document.querySelectorAll('[data-stack]').forEach(function (b) { b.onclick = function () { cfg.stack = +b.getAttribute('data-stack'); cfg.chipOk = null; prepScreen(); }; });
  document.querySelectorAll('[data-lvl]').forEach(function (b) { b.onclick = function () { cfg.level = +b.getAttribute('data-lvl'); prepScreen(); }; });
  document.querySelectorAll('[data-fee]').forEach(function (b) { b.onclick = function () { cfg.fee = +b.getAttribute('data-fee'); prepScreen(); }; });
  document.querySelectorAll('[data-price]').forEach(function (b) { b.onclick = function () { cfg.price = +b.getAttribute('data-price'); prepScreen(); }; });
  document.querySelectorAll('[data-stock]').forEach(function (b) { b.onclick = function () { cfg.stock = +b.getAttribute('data-stock'); prepScreen(); }; });
  var cq = $('[data-chipq]'); if (cq) cq.onclick = chipQuiz;
  document.querySelectorAll('[data-rescap]').forEach(function (b) { b.onclick = function () { cfg.resCap = +b.getAttribute('data-rescap'); prepScreen(); }; });
  document.querySelectorAll('[data-resdep]').forEach(function (b) { b.onclick = function () { cfg.resDeposit = b.getAttribute('data-resdep') === '1'; prepScreen(); }; });
  document.querySelectorAll('[data-as]').forEach(function (b) {
    b.onclick = function () {
      var p = b.getAttribute('data-as').split(':'), id = +p[0];
      var was = cfg.assign.indexOf(id); if (was >= 0) cfg.assign[was] = null;
      if (p[1] !== 'r') cfg.assign[+p[1]] = id;
      prepScreen();
    };
  });
  document.querySelectorAll('[data-mentor]').forEach(function (b) {
    b.onclick = function () {   // 누를 때마다 다음 선배 → … → 없음
      var d = G.roster.filter(function (x) { return x.id === +b.getAttribute('data-mentor'); })[0];
      var ms = mentorsFor(d), i = ms.map(function (m) { return m.id; }).indexOf(d.mentor);
      d.mentor = i + 1 < ms.length ? ms[i + 1].id : null;
      prepScreen('dealers');
    };
  });
  document.querySelectorAll('[data-sem]').forEach(function (b) {
    b.onclick = function () {
      var d = G.roster.filter(function (x) { return x.id === +b.getAttribute('data-sem'); })[0], k = d && semBranch(d);
      if (!k || G.bank < SEMINAR_COST || d.semWeek === dayInfo().week) return;
      G.bank -= SEMINAR_COST; d.semWeek = dayInfo().week;
      trainOf(d)[k]++; xpOf(d)[k] = 0;
      toast('📚 ' + d.name + ' 세미나 — ' + TRAIN[k].ko + ' ' + trainOf(d)[k] + '단계' + (k === 'j' && trainOf(d).j === 2 ? ' · 🃏 믹스 자격' : '')); SFX.win();
      prepScreen('dealers');
    };
  });
  document.querySelectorAll('[data-train]').forEach(function (b) {
    b.onclick = function () { var p = b.getAttribute('data-train').split(':'); if (cfg.train === null) trainDealer(+p[0], p[1]); };
  });
  $('[data-open]').onclick = function () { if (ready) openDay(); };
}

function buy(id) {
  var it = SHOP.filter(function (x) { return x.id === id; })[0];
  if (!G.owned[id] && G.bank >= it.price) {
    G.bank -= it.price; G.owned[id] = true;
    toast(it.ko + ' — 구매 완료');
    SFX.cash();
  }
  applyDecor();
  prepScreen();
}

/* 칩 세팅 — 스타팅 스택 칩 세트 구성 확인 */
function chipQuiz() {
  var S = STACKS[stackIdx()].chips;
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
      ok ? SFX.good() : SFX.bad();
      showModal('<div class="kicker">칩 세팅</div><div class="verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ 정확한 세트' : '✗ 틀린 세트 — 영업 중 항의가 생길 수 있다') + '</div>' +
        '<p>' + order.map(function (j) { return opts[j] + ' = <b>' + won(sums[j]) + '</b>'; }).join('<br>') + '</p>' +
        '<button class="cta" data-back="1">돌아가기</button>');
      $('[data-back]').onclick = function () { prepScreen('chips'); };
    };
  });
}

/* 멘토 — 어떤 갈래든 2단계 이상이고 후배보다 높은 선배 딜러 */
function mentorBranch(m, st) {
  var tm = trainOf(m), ts = trainOf(st);
  return Object.keys(TRAIN).filter(function (k) { return tm[k] >= 2 && tm[k] > ts[k] && ts[k] < 3; })
    .sort(function (a, b) { return (tm[b] - ts[b]) - (tm[a] - ts[a]); })[0] || null;
}
function mentorsFor(st) { return G.roster.filter(function (m) { return m !== st && m.role === 'dealer' && mentorBranch(m, st); }); }
/* 지금도 자격이 있는 멘토 이름 — 후배가 따라잡았으면 없음 */
function mentorOk(st) { var m = G.roster.filter(function (x) { return x.id === st.mentor; })[0]; return m && mentorBranch(m, st) ? m.name : null; }
function mentorName(st) { var m = G.roster.filter(function (x) { return x.id === st.mentor; })[0]; return m ? m.name : null; }
/* 세미나 — 가장 낮은 갈래(3단계 미만) */
function semBranch(st) {
  var tr = trainOf(st);
  return Object.keys(TRAIN).filter(function (k) { return tr[k] < 3; }).sort(function (a, b) { return tr[a] - tr[b]; })[0] || null;
}
/* 응대 교육 — 규정이 아니라 접객 원칙이다 (TDA 조항을 출제하지 않는다) */
var SERVICE_QS = [
  { q: '손님이 "딜러님 너무 느려요" 하고 짜증을 낸다.', a: ['"죄송합니다, 빠르게 하겠습니다" 하고 실수 없이 속도를 낸다', '"규정대로 하는 중입니다"라며 단호하게 선을 긋고 그대로 맞받는다', '못 들은 척하고 실수가 없도록 지금 속도 그대로 간다'], why: '사과 한마디와 눈에 보이는 개선이 테이블 분위기를 지킨다. 맞받으면 다른 손님까지 불편해진다.' },
  { q: '처음 온 손님이 차례를 몰라 머뭇거린다.', a: ['웃으며 "손님 차례예요" 하고 부드럽게 알려 준다', '옆 손님에게 차례를 대신 알려 주라고 조용히 부탁한다', '시간을 아끼려고 "빨리 하세요" 하고 재촉한다'], why: '초보 손님이 편해야 다시 온다. 재촉보다 친절한 한마디가 테이블을 빠르게 만든다.' },
  { q: '손님이 테이블에 음료를 엎질렀다.', a: ['괜찮으신지 묻고 카드 · 칩을 정리한 뒤 청소를 부른다', '판이 멈추지 않게 딜을 먼저 끝내고 나서 닦는다', '손님이 엎질렀으니 손님에게 직접 닦아 달라고 정중히 부탁한다'], why: '사람 → 판 → 바닥 순서. 젖은 채로 두면 주변 손님 만족이 샌다.' },
  { q: '탈락한 손님이 아쉬워하며 일어선다.', a: ['"수고하셨습니다" 하고 인사하며 바 자리를 안내한다', '다음 손님이 기다리니 빨리 자리를 비켜 달라고 한다', '방해하지 않도록 아무 말 없이 조용히 다음 핸드를 돌린다'], why: '마지막 인사가 다음 방문을 만든다. 아쉬운 손님일수록 따뜻하게 보낸다.' },
  { q: '단골이 처음 온 친구를 데려와 같은 테이블에 앉았다.', a: ['둘 다 반갑게 맞고 친구에게 진행 방식을 짧게 안내한다', '아는 사이인 단골에게만 반갑게 인사하고 친구는 모른 척한다', '친구에게 규칙표를 건네고 다 읽고 오라고 한다'], why: '친구가 편해야 단골이 또 데려온다. 짧고 친절한 안내면 충분하다.' },
  { q: '두 손님이 언성을 높이기 시작했다.', a: ['차분하게 "잠시만요" 하고 진정시키고 점장에게 알린다', '먼저 잘못한 쪽을 가려 그 손님에게 단호하게 주의를 준다', '손님끼리 풀도록 두고 커지면 그때 나선다'], why: '편을 들면 다른 쪽이 상한다. 차분하게 진정시키고 책임자에게 알리는 것이 접객의 기본이다.' }
];
function trainQuestion(branch) {
  if (branch === 'j') {
    if (chance(0.5)) return caseQuestion();   // 판정 교육 — 절반은 케이스 문제
    var n = pick([1, 2, 2, 3]), acts = [];
    for (var j = 0; j < n; j++) { var r = Math.random(); acts.push({ name: pick(NAMES), kind: r < 0.5 ? 'fold' : (r < 0.85 ? 'call' : 'raise') }); }
    var sa = isSA(acts);
    return { title: '실질 액션이 성립했나?', body: actsHTML(acts), opts: ['성립했다 — 이제 미스딜을 선언할 수 없다', '아직이다 — 미스딜 사유가 생기면 다시 딜한다'], correct: sa ? 0 : 1, fixed: true,
      why: (sa ? '성립했다. ' : '아직이다. ') + '액션 ' + acts.length + '개 중 칩이 들어간 것 ' + acts.filter(function (a) { return a.kind !== 'fold'; }).length + '개.',
      cite: '<div class="cite"><b>근거</b> ' + SRC.sa + '<span class="unverified">원문 확인 전</span></div>' };
  }
  if (branch === 's') {
    var vals = [100, 500, 1000, 5000], cnt = vals.map(function () { return rnd(6); }), sum = 0;
    cnt[1] = Math.max(1, cnt[1]);
    vals.forEach(function (v, i) { sum += v * cnt[i]; });
    var wrong = [sum + pick([500, 1000]), sum - pick([100, 400, 500])].filter(function (x) { return x > 0 && x !== sum; });
    var all = [sum].concat(wrong);
    return { title: '이 칩은 모두 얼마인가?', body: '<div class="acts">' + vals.map(function (v, i) { return won(v) + ' × ' + cnt[i]; }).join(' · ') + '</div>',
      opts: all.map(function (x) { return won(x); }), correct: 0, why: vals.map(function (v, i) { return won(v) + '×' + cnt[i]; }).join(' + ') + ' = <b>' + won(sum) + '</b>. 팟 · 스택을 빨리 세면 핸드가 빨라진다.', cite: '' };
  }
  var s = pick(SERVICE_QS);
  return { title: '어떻게 응대할까?', body: '<p>' + s.q + '</p>', opts: s.a.slice(), correct: 0, why: s.why, cite: '<div class="cite">접객 원칙 — 대회 규정이 아니다</div>' };
}
function trainDealer(staffId, branch) {
  var st = G.roster.filter(function (s) { return s.id === staffId; })[0];
  branch = TRAIN[branch] ? branch : 'j';
  var used = [], qs = [];
  for (var k = 0; k < 3; k++) {
    var q = trainQuestion(branch);
    if (branch === 'v') { var tries = 0; while (used.indexOf(q.body) >= 0 && tries++ < 10) q = trainQuestion(branch); used.push(q.body); }
    qs.push(q);
  }
  var at = 0, right = 0;
  function ask() {
    var q = qs[at];
    var order = q.fixed ? q.opts.map(function (o, i) { return i; }) : shuffle(q.opts.map(function (o, i) { return i; }));
    var correct = order.indexOf(q.correct);
    G.current = { kind: 'train', branch: branch, correct: correct };
    showModal('<div class="kicker">교육 · ' + TRAIN[branch].ko + ' — 딜러 ' + st.name + ' · ' + (at + 1) + '/3</div><h2>' + q.title + '</h2>' + q.body +
      '<div class="choices">' + order.map(function (k2, i) { return '<button class="choice" data-tq="' + i + '">' + q.opts[k2] + '</button>'; }).join('') + '</div>');
    document.querySelectorAll('[data-tq]').forEach(function (b) {
      b.onclick = function () {
        var ix = +b.getAttribute('data-tq'), ok = ix === correct;
        if (ok) right++;
        ok ? SFX.good() : SFX.bad();
        showModal('<div class="kicker">교육 · ' + TRAIN[branch].ko + ' — ' + (at + 1) + '/3</div><div class="verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ 맞았다' : '✗ 틀렸다') + '</div>' +
          '<div class="choices" style="margin-bottom:10px">' + order.map(function (k2, i) { return '<div class="choice' + (i === correct ? ' right' : (i === ix ? ' wrong' : '')) + '">' + q.opts[k2] + '</div>'; }).join('') + '</div>' +
          '<p>' + q.why + '</p>' + q.cite + '<button class="cta" data-next="1">' + (at < 2 ? '다음 문제' : '교육 끝') + '</button>');
        $('[data-next]').onclick = function () {
          at++;
          if (at < 3) { ask(); return; }
          var tr = trainOf(st), up = right >= 2 && tr[branch] < 3;
          if (up) tr[branch]++;
          G.cfg.train = staffId + ':' + branch;
          addMorale(st, up ? 4 : 0);
          toast(up ? '🎓 ' + st.name + ' ' + TRAIN[branch].ko + ' ' + tr[branch] + '단계!' + (branch === 'j' && tr.j === 2 ? ' 🃏 믹스게임 자격' : '') : '📚 ' + st.name + ' — ' + right + '/3, 다음에 다시');
          right >= 2 ? SFX.win() : SFX.bad();
          prepScreen('dealers');
        };
      };
    });
  }
  ask();
}

function info0() { return dayInfo(); }
/* 금 · 토 사전 예약 — 보증금을 받으면 노쇼는 줄지만 예약 신청도 준다 */
function expectedResv() {
  var cap = RES_CAPS[G.cfg.resCap];
  var req = Math.round(cap * clamp(0.55 + G.rep / 180, 0.5, 1) * (G.cfg.resDeposit ? 0.75 : 1));
  return { req: req, rate: G.cfg.resDeposit ? 0.08 : 0.25 };
}
function openReservations() {
  var e = expectedResv(), R = { total: e.req, arrivals: [], noshow: 0, arrived: 0, open: true };
  var pool = G.regulars.filter(function (r) { return !r.gone; });
  for (var i = 0; i < e.req; i++) {
    var reg = pool.length && chance(0.35) ? pool.splice(rnd(pool.length), 1)[0] : null;
    if (reg) reg.reserved = true;   // 예약한 단골은 예약 없이 따로 오지 않는다
    if (chance(e.rate)) { R.noshow++; if (reg) { reg.aff = clamp(reg.aff - 2, 0, 100); } continue; }
    R.arrivals.push({ at: 2 + Math.random() * 42, reg: reg });
  }
  G.resv = R;
  log('📋 사전 예약 ' + R.total + '건 — 19:30 까지 ' + R.total + '석을 잡아 둔다', 'hi');
}
function openDay() {
  closeModal();
  G.bank -= G.cfg.stock * STOCK_COST;
  G.dayRevenue = 0;
  newDay();
  var plan = G.cfg.assign.slice(0, tableCount()), msgs = [];
  plan.forEach(function (sid, k) {
    var t = G.tables[k];
    var d = G.dealers.filter(function (x) { return x.staff.id === sid; })[0];
    if (!d) {
      var spare = G.dealers.filter(function (x) { return x.table === null && plan.indexOf(x.staff.id) < 0; })[0];
      var who = (G.roster.filter(function (x) { return x.id === sid; })[0] || {}).name;
      if (spare) { d = spare; msgs.push(who + ' 노쇼 → ' + spare.name + '가 ' + t.name); }
      else { msgs.push(who + ' 노쇼 → ' + t.name + ' 딜러 없음!'); return; }
    }
    assignDealer(t, d);
  });
  if (info0().wd === 4 || info0().wd === 5) openReservations();
  var mt = G.owned.mix && G.tables[MIX_TABLE], md = mt && mt.dealer !== null ? G.dealers[mt.dealer] : null;
  if (md && !mixOk(md.staff)) { msgs.push('⚠️ 믹스 테이블 딜러 ' + md.name + ' — 믹스 자격 없음(사고 2배)'); log('⚠️ 믹스 테이블 딜러 ' + md.name + ' — 믹스 자격이 없다. 판정 교육 2단계면 자격', 'bad'); }
  G.absent.forEach(function (st) { log('📵 ' + st.name + '(' + ROLES[st.role].ko + ') 노쇼 — 연락이 안 된다', 'bad'); });
  G.phase = 'open';
  $('#hud')._built = false;
  log(dayInfo().week + '주차 ' + dayInfo().wk + '요일 ' + dayInfo().name + ' 시작 — 참가비 ' + won(fee()) + ' · 스타팅 ' + won(STACKS[stackIdx()].chips) + ' · 레벨 ' + levelMin() + '분', 'hi');
  if (G.absent.length) {
    toast('📵 노쇼 — ' + G.absent.map(function (x) { return x.name + '(' + ROLES[x.role].ko + ')'; }).join(' · ') + (msgs.length ? ' · ' + msgs.join(' · ') : '') + ' — 🧑‍💼 로 대타를 부를 수 있다');
    SFX.bad();
  } else if (msgs.length) toast(msgs.join(' · '));
  banner('18:00 OPEN', dayInfo().week + '주차 ' + dayInfo().wk + '요일 · ' + dayInfo().name, 'open');
  tip('open', '👟 바닥을 탭하면 점장이 걸어간다. 카운터 뒤에 서 있으면 등록이 빨라진다.');
  say(G.player, '오늘도 잘 부탁해요!', 2.5);
}

// ═══════════════════════════════════════════════════
// 마감 — 정산 확인 → 보고서
// ═══════════════════════════════════════════════════
function closeDay() {
  if (G.finalized) return;
  G.finalized = true;
  G.phase = 'closed';
  G.customers.forEach(function (c) { if (c.alive) { G.stats.satSum += c.sat; G.stats.satN++; regDone(c); vipDone(c); } });
  endBlackout(false);
  G.tasks = []; G.tables.forEach(function (t) { t.call = null; t.def.alarm.visible = false; });
  renderTasks();
  var s = G.stats, feeT = fee();
  var right = s.entries * feeT;
  var vals = [right, s.unique * feeT === right ? right + feeT : s.unique * feeT, (s.entries + 1) * feeT];
  var opts = vals.map(function (v) { return won(v) + '원'; });
  var order = shuffle([0, 1, 2]);
  G.current = { kind: 'settle', correct: order.indexOf(0) };
  showModal('<div class="kicker">' + clock(gameMin()) + ' · 마감</div><h2>레지 정산 — 참가비 합계</h2>' +
    '<p>오늘 엔트리 <b>' + s.entries + '</b>건 (처음 온 사람 ' + s.unique + '명 + 리엔트리 ' + (s.entries - s.unique) + '건) · 참가비 ' + won(feeT) + '원. 카운터 정산 금액은?</p>' +
    '<div class="choices">' + order.map(function (k) { return '<button class="choice" data-st="' + k + '">' + opts[k] + '</button>'; }).join('') + '</div>');
  document.querySelectorAll('[data-st]').forEach(function (b) {
    b.onclick = function () { report(+b.getAttribute('data-st') === 0); };
  });
}

function report(settleOk) {
  var s = G.stats;
  var feeRev = s.entries * fee(), drinkRev = s.drinks * PRICES[G.cfg.price].p;
  var present = G.roster.filter(function (x) { return G.absent.indexOf(x) < 0; });
  var wages = present.concat(G.temps).reduce(function (t, x) { return t + x.wage; }, 0);
  var stockCost = G.cfg.stock * STOCK_COST;
  var settleLoss = settleOk ? 0 : 50000;
  var avgSat = s.satN ? s.satSum / s.satN : 70;
  // 목표
  var ctx = { avgSat: avgSat, winner: G.winner };
  var done = G.goals.map(function (g) { return goalDef(g).test(s, g.n, ctx); });
  var stars = done.filter(Boolean).length;
  var bonus = stars * GOAL_REWARD;
  var net = (s.depositRev || 0) + (s.mixFee || 0) + feeRev + drinkRev - wages - WAGE.ops - stockCost - settleLoss + bonus - s.fines;
  G.bank += net + stockCost;   // 재고비는 오픈 때 이미 냈다
  var rankBefore = rankOf(G.rep);
  var repDay = (G.rep - s.repStart) + (avgSat - 60) / 8 + stars * 2;   // 오늘 하루 평판 변화 전체
  var gentle = G.day <= 3 && repDay < 0;   // 첫 사흘은 배우는 기간 — 평판 하락을 절반으로
  if (gentle) repDay *= 0.5;
  G.rep = clamp(s.repStart + repDay * dayInfo().repMul, 0, 100);
  G.weekLog.push({ day: G.day, name: dayInfo().name, wk: dayInfo().wk, net: net, stars: stars, entries: s.entries, rep: Math.round(G.rep),
    err: s.wrong + s.missed, drinks: s.drinks, win: !!G.winner, evOk: s.events.filter(function (e) { return e.ok === true; }).length });
  G.debtDays = G.bank < 0 ? (G.debtDays || 0) + 1 : 0;
  var rankAfter = rankOf(G.rep);
  // 직원 성장 — 오늘 일한 사람은 능력 +1
  var grown = [];
  present.forEach(function (st) {
    st.days++;
    if (st.skill < 95) { st.skill++; grown.push(st.name); }
  });
  // 멘토 — 같이 일한 날 후배에게 경험 +35, 선배 사기 +2
  var mentored = [];
  present.forEach(function (st) {
    if (st.role !== 'dealer' || !st.mentor) return;
    var m = present.filter(function (x) { return x.id === st.mentor; })[0], k = m && mentorBranch(m, st);
    if (!k) return;
    addXP(st, k, 35); addMorale(m, 2);
    mentored.push(m.name + ' → ' + st.name + ' ' + TRAIN[k].ko);
  });
  // 사기 20 아래 — 마감 때 그만둔다
  var quit = G.roster.filter(function (st) { return morale(st) < 20; });
  G.roster = G.roster.filter(function (st) { return quit.indexOf(st) < 0; });
  quit.forEach(function (st) { log('😞 ' + st.name + '(' + ROLES[st.role].ko + ') — 그만두겠다고 한다', 'bad'); });
  var lowM = G.roster.filter(function (st) { return morale(st) < 35; });

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
    ['참가비 ' + s.entries + '건 × ' + won(fee()), feeRev],
    ['음료 ' + s.drinks + '잔 × ' + won(PRICES[G.cfg.price].p), drinkRev],
    ['예약 보증금 (노쇼 ' + (G.resv ? G.resv.noshow : 0) + '명분)', s.depositRev || 0],
    ['믹스 테이블 참가비 ' + Math.round((s.mixFee || 0) / MIX_FEE) + '명', s.mixFee || 0],
    ['목표 보상 ' + stars + '개', bonus],
    ['인건비 (출근 ' + present.length + '명' + (G.temps.length ? ' · 대타 ' + G.temps.length : '') + ')', -wages],
    ['운영비 (전기 · 재료 · 기타 — 임대료는 일요일에)', -WAGE.ops],
    ['음료 재고 ' + G.cfg.stock + '개', -stockCost]
  ];
  rows = rows.filter(function (r) { return r[1] !== 0 || !/보증금|믹스/.test(r[0]); });
  if (settleLoss) rows.push(['정산 오차 확인 비용', -settleLoss]);
  if (s.fines) rows.push(['벌금 (돌발 상황)', -s.fines]);
  var grade = stars === 3 && net > 0 ? 'S' : (stars >= 2 ? 'A' : (stars === 1 ? 'B' : 'C'));
  var achNew = checkAch('day', { s: s, stars: stars, grade: grade, net: net, avgSat: avgSat, winner: G.winner });
  var starHTML = '<div class="gradebox g' + grade + '"><span>' + grade + '</span></div><div class="stars">' + [0, 1, 2].map(function (i) { return '<span class="' + (i < stars ? 'on' : '') + '" style="animation-delay:' + (i * 0.25) + 's">★</span>'; }).join('') + '</div>';
  var h = '<div class="kicker">' + G.day + '일차 마감 · ' + clock(gameMin()) + '</div>' + starHTML +
    '<h2 style="text-align:center">' + ['아쉬운 밤', '무난한 밤', '좋은 밤', '완벽한 밤'][stars] + '</h2>' +
    (rankAfter !== rankBefore ? '<div class="rankup">' + (G.rep > s.repStart ? '🎉 펍 등급 상승 — ' : '펍 등급 하락 — ') + '<b>' + rankAfter + '</b></div>' : '') +
    (gentle ? '<p class="note" style="text-align:center">🌱 첫 사흘 — 손님들이 너그럽다. 평판 하락이 절반으로 줄었다</p>' : '') +
    achHtml(achNew) +
    '<h3>🎯 오늘의 목표</h3><ul class="goals">' + G.goals.map(function (g, i) { return '<li class="' + (done[i] ? 'ok' : 'no') + '">' + (done[i] ? '✓ ' : '✗ ') + goalText(g) + '</li>'; }).join('') + '</ul>' +
    (settleOk ? '<p>✓ 레지 정산이 맞았다.</p>' : '<p>✗ 레지 정산이 틀렸다 — 차액을 맞추느라 마감이 늦어졌다.</p>') +
    '<table class="rows">' + rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + (r[1] < 0 ? '−' : '') + won(Math.abs(r[1])) + '</td></tr>'; }).join('') +
    '<tr class="total"><td>순이익</td><td><span data-countup="' + net + '">' + (net < 0 ? '−' : '') + won(Math.abs(net)) + '</span></td></tr>' +
    '<tr><td>자금</td><td>' + won(G.bank) + '</td></tr></table>' +
    '<h3>운영</h3><p>플로어 호출 — 맞음 <b>' + s.right + '</b> · 틀림 <b>' + s.wrong + '</b> · 못 감 <b>' + s.missed + '</b>' + (s.quick ? ' · ⚡ 빠른 판정 <b>' + s.quick + '</b>' : '') + (s.spot ? ' · 🔍 딜러 실수 잡음 <b>' + s.spot + '</b>' : '') + (s.angry ? ' · 화나서 나간 손님 ' + s.angry : '') + '<br>' +
    '아나운스 ' + s.ann + '건' + (s.annByStaff ? ' (직원 ' + s.annByStaff + ')' : '') + ' · 틀림 ' + s.annWrong + ' · 놓침 ' + s.annMiss + ' · 밸런싱 ' + s.balanced + '건' + (s.balanceMiss ? ' (놓침 ' + s.balanceMiss + ')' : '') + '<br>' +
    '청소 ' + s.cleaned + '건 · 바닥이 젖어 있던 시간 ' + Math.round(s.spillSec) + '초 · 음료 품절로 못 판 것 ' + s.noStock + '건' + (s.maxCombo >= 2 ? '<br>🔥 최고 판정 콤보 ×' + s.maxCombo : '') + '</p>' +
    '<h3>손님</h3><p>평균 만족도 ' + Math.round(avgSat) + ' · 줄이 길어 돌아간 손님 ' + (s.lost + s.queueLeave) + '명 · 평판 ' + Math.round(s.repStart) + ' → <b>' + Math.round(G.rep) + '</b> (' + rankAfter + ')</p>' +
    '<p>' + (G.winner ? '🏆 우승 ' + G.winner.name + ' — 트로피와 다음 대회 시드권' : '마감까지 결판이 나지 않았다 — 남은 사람들은 다음 대회 시드권') + '</p>' +
    (grown.length ? '<p class="note">직원 성장 — ' + grown.join(' · ') + ' 능력 +1</p>' : '') +
    (G.grownToday.length ? '<p>🎓 단계 상승 — ' + G.grownToday.join(' · ') + '</p>' : '') +
    (mentored.length ? '<p class="note">🤝 멘토링 — ' + mentored.join(' · ') + '</p>' : '') +
    (quit.length ? '<p class="warn">😞 그만뒀다 — ' + quit.map(function (x) { return x.name + '(' + ROLES[x.role].ko + ')'; }).join(' · ') + '. 사기가 바닥이었다</p>' : '') +
    (lowM.length ? '<p class="warn">⚠️ 사기가 낮다 — ' + lowM.map(function (x) { return x.name + ' ' + Math.round(morale(x)); }).join(' · ') + ' (20 아래면 그만둔다)</p>' : '') +
    (G.resv ? '<p>📋 예약 ' + G.resv.total + '건 — 도착 ' + G.resv.arrived + ' · 노쇼 ' + G.resv.noshow + (G.cfg.resDeposit ? ' (보증금 받음)' : ' (보증금 없음)') + '</p>' : '') +
    (G.regDelta.length ? '<p>⭐ 단골 ' + G.regDelta.length + '명 — ' + G.regDelta.map(function (x) { return x.name + ' ' + (x.d >= 0 ? '+' : '') + x.d + '♥'; }).join(' · ') + '</p>' : '') +
    (G.absent.length ? '<p class="note">📵 노쇼 — ' + G.absent.map(function (x) { return x.name; }).join(' · ') + ' (일당 없음)</p>' : '') +
    (s.events.length ? '<h3>⚡ 돌발 상황</h3><p>' + s.events.map(function (e) { return (e.ok === true ? '✓ ' : (e.ok === false ? '✗ ' : '△ ')) + e.ic + ' ' + e.note; }).join('<br>') + '</p>' : '') +
    '<h3>후기</h3><p>' + reviews.join('<br>') + '</p>' +
    (G.debtDays ? '<p class="warn">⚠️ 자금 마이너스 ' + G.debtDays + '일째 — 사흘 연속이면 폐업이다</p>' : '') +
    '<button class="cta" data-next-day="1">' + (G.debtDays >= 3 ? '…' : (dayInfo(G.day + 1).wd === 6 ? '🗓️ 일요일 — 주간 정산' : '다음 날 영업 준비')) + '</button> <button class="cta ghost" data-restart="1">타이틀로</button>';
  showModal(h, true);
  countUp();
  if (stars === 3 || rankAfter !== rankBefore && G.rep > s.repStart) { SFX.win(); confetti(V(0, 0)); } else if (stars || achNew.length) SFX.good();
  G.day++; G.cfg.train = null; G.cfg.chipOk = null;
  saveGame();
  $('[data-next-day]').onclick = function () {
    if (G.debtDays >= 3) { bankrupt(); return; }
    if (dayInfo().wd === 6) weeklyScreen(); else prepScreen('shop');
  };
  $('[data-restart]').onclick = function () { titleScreen(); };
}

/* 일요일 — 주간 정산 · 임대료 · 시즌 진행 */
/* 주간 도전 — 월요일에 셋이 정해지고 일요일 정산 때 보상. 목표는 주차마다 오른다 */
var WEEK_CH = [
  { id: 'entries', ko: function (n) { return '엔트리 ' + n + '건'; }, make: function (w) { return 110 + w * 15; }, val: function (L) { return sumL(L, 'entries'); } },
  { id: 'stars', ko: function (n) { return '별 ' + n + '개'; }, make: function (w) { return 9 + Math.min(5, w); }, val: function (L) { return sumL(L, 'stars'); } },
  { id: 'noerr', ko: function (n) { return '판정 실수(틀림 · 못 감) ' + n + '건 이하'; }, make: function (w) { return Math.max(2, 9 - w); }, val: function (L) { return sumL(L, 'err'); }, low: true },
  { id: 'drinks', ko: function (n) { return '음료 ' + n + '잔'; }, make: function (w) { return 140 + w * 20; }, val: function (L) { return sumL(L, 'drinks'); } },
  { id: 'winners', ko: function (n) { return '우승자 ' + n + '번 배출'; }, make: function (w) { return Math.min(6, 4 + Math.floor(w / 3)); }, val: function (L) { return L.filter(function (d) { return d.win; }).length; } },
  { id: 'events', ko: function (n) { return '돌발 상황 ' + n + '건 깔끔하게'; }, make: function (w) { return 3 + w; }, val: function (L) { return sumL(L, 'evOk'); } },
  { id: 'profit', ko: function (n) { return '순이익 ' + won(n) + '원 (임대료 전)'; }, make: function (w) { return 700000 + w * 200000; }, val: function (L) { return sumL(L, 'net'); } }
];
var WEEK_CH_REWARD = 300000;
function sumL(L, k) { return L.reduce(function (t, d) { return t + (d[k] || 0); }, 0); }
function weekChallenges() {
  var w = dayInfo().week;
  if (!G.weekCh || G.weekCh.week !== w) {
    G.weekCh = { week: w, list: shuffle(WEEK_CH.slice()).slice(0, 3).map(function (c) { return { id: c.id, n: c.make(w) }; }) };
    saveGame();   // 새로고침해도 이번 주 도전이 다시 뽑히지 않게
  }
  return G.weekCh;
}
function wcDef(c) { return WEEK_CH.filter(function (x) { return x.id === c.id; })[0]; }
function wcDone(c) { var d = wcDef(c), v = d.val(G.weekLog); return d.low ? v <= c.n : v >= c.n; }
function wcText(c, withNow) {
  var d = wcDef(c), v = d.val(G.weekLog);
  return d.ko(c.n) + (withNow ? ' — 지금 ' + (c.id === 'profit' ? won(v) : v) : '');
}
function weekBox() {
  if (dayInfo().wd === 6) return '';
  var ch = weekChallenges();
  return '<div class="weekch"><b>🗓️ ' + ch.week + '주차 도전</b> (일요일 정산 — 하나에 +' + won(WEEK_CH_REWARD) + '원 · 평판 +2, 셋 다면 🎁 장식)<ol>' +
    ch.list.map(function (c) { var low = wcDef(c).low; return '<li class="' + (!low && wcDone(c) ? 'done' : '') + '">' + wcText(c, true) + (!low && wcDone(c) ? ' ✓' : '') + '</li>'; }).join('') +
    '</ol>' + (ch.list.some(function (c) { return wcDef(c).low; }) ? '<div class="note">「이하」 도전은 일요일에 판정한다</div>' : '') + '</div>';
}
function weeklyScreen() {
  var info = dayInfo(), w = info.week;
  G.bank -= WEEKLY_RENT;
  // 주간 도전 정산
  var ch = G.weekCh && G.weekCh.week === w ? G.weekCh : null, chDone = ch ? ch.list.map(wcDone) : [], chN = chDone.filter(Boolean).length, gift = null;
  if (ch) {
    G.bank += chN * WEEK_CH_REWARD; G.rep = clamp(G.rep + chN * 2, 0, 100);
    if (chN === 3) { gift = w >= 3 ? 'sofa' : 'plant'; G.decorInv[gift] = decorCount(gift) + 1; }
  }
  var rv = rivalSettle(w);   // 🥊 대결 · 빼가기 — 휴무 사기 +6 보다 먼저(토요일까지의 사기로 정한다)
  G.roster.forEach(function (st) { addMorale(st, 6); });   // 일요일 휴무 — 쉬고 오면 사기 +6
  var sum = G.weekLog.reduce(function (t, d) { return t + d.net; }, 0);
  var stars = G.weekLog.reduce(function (t, d) { return t + d.stars; }, 0);
  var entries = G.weekLog.reduce(function (t, d) { return t + d.entries; }, 0);
  var best = G.weekLog.slice().sort(function (a, b) { return b.net - a.net; })[0];
  var rows = G.weekLog.map(function (d) {
    return '<tr><td>' + d.wk + ' · ' + d.name + ' ' + '★'.repeat(d.stars) + '<span class="dim">' + '★'.repeat(3 - d.stars) + '</span></td><td>' + (d.net < 0 ? '−' : '') + won(Math.abs(d.net)) + '</td></tr>';
  }).join('');
  var seasonDone = w >= SEASON_WEEKS;
  var cleared = G.rep >= 85 && G.bank >= SEASON_GOAL_BANK;
  var achNew = checkAch('week', { chN: ch ? chN : 0, weekNet: sum - WEEKLY_RENT, rivalWin: rv.win });
  var h = '<div class="kicker">' + w + '주차 일요일 · 휴무</div><h2>🗓️ 주간 정산</h2>' + achHtml(achNew) +
    '<table class="rows">' + rows +
    '<tr><td>임대료 (주간)</td><td>−' + won(WEEKLY_RENT) + '</td></tr>' +
    '<tr class="total"><td>이번 주 합계</td><td>' + (sum - WEEKLY_RENT < 0 ? '−' : '') + won(Math.abs(sum - WEEKLY_RENT)) + '</td></tr>' +
    '<tr><td>자금</td><td>' + won(G.bank) + '</td></tr></table>' +
    '<p>이번 주 별 <b>' + stars + '</b>/' + G.weekLog.length * 3 + ' · 엔트리 ' + entries + '건' + (best ? ' · 최고의 날 ' + best.wk + '요일 ' + best.name : '') + '</p>' +
    '<p class="note">🛌 휴무 — 직원 모두 사기 +6</p>' +
    '<h3>🥊 ' + RIVAL + '와 대결</h3><div class="rivalres ' + (rv.win ? 'win' : 'lose') + '"><span>우리 <b>' + rv.me + '</b></span><em>' + (rv.win ? '이겼다' : '졌다') + '</em><span>' + RIVAL + ' <b>' + rv.them + '</b></span></div>' +
    '<p class="note" style="text-align:center">한 주 손님(엔트리) · ' + (rv.win ? '평판 +2' : '평판 −1') + ' · 시즌 ' + G.rival.wins + '승 ' + G.rival.losses + '패</p>' +
    (rv.lines.length ? '<p>' + rv.lines.join('<br>') + '</p>' : '') +
    (ch ? '<h3>🗓️ 이번 주 도전 ' + chN + '/3</h3><ul class="goals">' + ch.list.map(function (c, i) { return '<li class="' + (chDone[i] ? 'ok' : 'no') + '">' + (chDone[i] ? '✓ ' : '✗ ') + wcText(c, true) + '</li>'; }).join('') + '</ul>' +
      '<p>' + (chN ? '보상 +' + won(chN * WEEK_CH_REWARD) + '원 · 평판 +' + chN * 2 : '보상 없음') + (gift ? ' · 🎁 ' + DECOR_ITEMS[gift].ic + ' ' + DECOR_ITEMS[gift].ko + ' 하나 — 꾸미기 탭에서 놓는다' : '') + '</p>' : '') +
    seasonBar() +
    (G.bank < 0 ? '<p class="warn">⚠️ 임대료를 내고 자금이 마이너스다. 다음 주에 사흘 연속 적자면 폐업.</p>' : '') +
    '<button class="cta" data-week="1">' + (seasonDone ? '시즌 결과 보기' : (w + 1) + '주차 시작 — 월요일') + '</button>';
  showModal(h, true);
  SFX.cash();
  if (chN === 3) { SFX.win(); confetti(V(0, 0)); }
  G.weekLog = []; G.weekCh = null;
  G.day++;   // 월요일로
  saveGame();
  $('[data-week]').onclick = function () { if (seasonDone) seasonEnd(cleared, w === SEASON_WEEKS); else prepScreen('shop'); };
}
/* 난이도 — 오픈 준비에 막대, 월요일엔 무엇이 어려워졌는지 */
function diffBox() {
  var lv = diffLv(), k = diffK(), info = dayInfo();
  var bar = '<span class="dbars">' + [1, 2, 3, 4, 5, 6].map(function (i) { return '<i class="' + (i <= lv ? 'on' : '') + '"></i>'; }).join('') + '</span>';
  var monday = info.wd === 0 && G.day > 1;
  return '<div class="diffbox' + (monday ? ' up' : '') + '"><b>📈 난이도 ' + lv + '/6</b> ' + bar +
    (monday ? '<div>' + info.week + '주차 — 손님이 조금 더 까다롭다. 돌발 상황 · 판정 사고가 잦아지고 기다림을 덜 참는다.</div>' : '') +
    '<div class="note">진상 손님 +' + Math.round(12 * k) + '%p · 판정 사고 +' + Math.round(50 * k) + '% · 손님 인내심 −' + Math.round(100 * (1 - 1 / (1 + 0.5 * k))) + '% · 돌발 상황 ' + (G.day === 1 ? '1건(첫날)' : '최대 ' + (3 + (k > 0 ? 1 : 0) + (k > 0.6 ? 1 : 0)) + '건') + '</div></div>';
}
function seasonBar() {
  var info = dayInfo(), w = Math.min(SEASON_WEEKS, info.week);
  return '<div class="season"><b>🏁 시즌 ' + w + '/' + SEASON_WEEKS + '주</b> — 목표: <b>' + SEASON_GOAL_RANK + '</b>(평판 85) + 자금 <b>' + won(SEASON_GOAL_BANK) + '원</b>' +
    '<div class="sbar"><i style="width:' + Math.round(w / SEASON_WEEKS * 100) + '%"></i></div>' +
    '<span class="note">지금 평판 ' + Math.round(G.rep) + ' (' + rankOf(G.rep) + ') · 자금 ' + won(G.bank) + '원</span></div>';
}
// ═══════════════════════════════════════════════════
// 출시용 껍데기 — 설정 · 일시정지 · 도움말 · 기록 · 만든 사람
// ═══════════════════════════════════════════════════
var VERSION = '1.5';
var SET_KEY = 'pubsim.settings', REC_KEY = 'pubsim.records';
var SETTINGS = { music: 0.7, sfx: 1, quality: 'auto', motion: 'auto', talk: true };
var SET_OK = {   // 저장된 설정이 망가져 있으면 기본값을 쓴다
  music: function (v) { return typeof v === 'number' && v >= 0 && v <= 1; }, sfx: function (v) { return typeof v === 'number' && v >= 0 && v <= 1; },
  quality: function (v) { return ['auto', 'high', 'low'].indexOf(v) >= 0; }, motion: function (v) { return v === 'auto' || v === 'reduce'; }, talk: function (v) { return typeof v === 'boolean'; }
};
try { var _s = JSON.parse(localStorage.getItem(SET_KEY) || 'null'); if (_s) Object.keys(SETTINGS).forEach(function (k) { if (_s[k] !== undefined && SET_OK[k](_s[k])) SETTINGS[k] = _s[k]; }); } catch (e) { /* 기본값 */ }
try { if (!localStorage.getItem(SET_KEY) && localStorage.getItem('pubsim.music') === 'off') SETTINGS.music = 0; } catch (e) { /* 예전 🎵 끔을 이어받는다 */ }
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(SETTINGS)); } catch (e) { /* 막힌 브라우저 */ } }
function coarse() { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); }
/* 설정을 실제 화면 · 소리에 반영한다 */
function applySettings() {
  MUSIC.on = SETTINGS.music > 0;
  if (MUSIC.master && AC) MUSIC.master.gain.setTargetAtTime(SETTINGS.music, AC.currentTime, 0.2);
  G.talkOn = !!SETTINGS.talk;
  var q = SETTINGS.quality === 'auto' ? (coarse() ? 'mid' : 'high') : SETTINGS.quality;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : (q === 'mid' ? 1.5 : 1)));
  LIGHT.sun.castShadow = q !== 'low';
  renderer.setSize(window.innerWidth, window.innerHeight);
  var reduce = SETTINGS.motion === 'reduce' || (SETTINGS.motion === 'auto' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.documentElement.classList.toggle('reduce-motion', !!reduce);
}
function seg(key, opts) {
  return '<div class="seg" role="radiogroup">' + opts.map(function (o) {
    var on = SETTINGS[key] === o[0];
    return '<button data-set="' + key + '" data-val="' + JSON.stringify(o[0]).replace(/"/g, '&quot;') + '" role="radio" aria-checked="' + on + '" class="' + (on ? 'on' : '') + '">' + o[1] + '</button>';
  }).join('') + '</div>';
}
function openSettings(back) {
  showModal('<div class="kicker">⚙️ 설정</div><h2>설정</h2>' +
    '<h3>배경음악 · 웅성거림</h3>' + seg('music', [[0, '끔'], [0.35, '작게'], [0.7, '보통'], [1, '크게']]) +
    '<h3>효과음</h3>' + seg('sfx', [[0, '끔'], [0.5, '작게'], [1, '보통']]) +
    '<h3>그래픽</h3>' + seg('quality', [['auto', '자동'], ['high', '높음'], ['low', '가볍게 (그림자 끔)']]) +
    '<h3>움직임</h3>' + seg('motion', [['auto', '기기 설정 따름'], ['reduce', '줄이기']]) +
    '<h3>손님 잡담 말풍선</h3>' + seg('talk', [[true, '켬'], [false, '끔 — 중요한 말만']]) +
    '<h3>저장</h3><p class="note">진행은 이 브라우저에 마감 때마다 저장된다.</p><button class="cta ghost" data-wipe="1">저장 지우기…</button>' +
    '<div class="titlebtns"><button class="cta" data-back="1">돌아가기</button></div>', false);
  document.querySelectorAll('[data-set]').forEach(function (b) {
    b.onclick = function () {
      var key = b.getAttribute('data-set'), val = b.getAttribute('data-val'), mEl = $('#modal .modal'), top = mEl ? mEl.scrollTop : 0;
      SETTINGS[key] = JSON.parse(val);
      saveSettings(); audioOn(); applySettings(); openSettings(back);
      // 다시 그려도 보던 자리 · 누른 버튼을 지킨다 (폰에서 맨 위로 튀지 않게)
      var m2 = $('#modal .modal'); if (m2) m2.scrollTop = top;
      var again = Array.prototype.filter.call(document.querySelectorAll('[data-set="' + key + '"]'), function (x) { return x.getAttribute('data-val') === val; })[0];
      if (again) again.focus({ preventScroll: true });
      if (b.getAttribute('data-set') === 'sfx' && SETTINGS.sfx > 0) SFX.good();
    };
  });
  $('[data-wipe]').onclick = function () {
    showModal('<div class="kicker">⚙️ 설정</div><h2>저장을 지울까요?</h2><p>이어하기 · 직원 · 단골 · 꾸미기 · 이번 시즌이 모두 사라진다. 되돌릴 수 없다. (최고 기록은 남는다)</p>' +
      '<div class="titlebtns"><button class="cta" data-wipe-yes="1" style="background:var(--red)">지운다</button><button class="cta ghost" data-wipe-no="1">그만두기</button></div>');
    $('[data-wipe-yes]').onclick = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ } toast('저장을 지웠다'); titleScreen(); };
    $('[data-wipe-no]').onclick = function () { openSettings(back); };
  };
  $('[data-back]').onclick = back;
}
/* 일시정지 — ❚❚ · Esc */
function openPause() {
  if (G.phase !== 'open') return;
  G.menu = 'pause'; G.paused = true;
  showModal('<div class="kicker">' + clock(gameMin()) + ' · 일시정지</div><h2>❚❚ 잠깐 쉬는 중</h2>' +
    '<p class="note">오늘 목표 — ' + G.goals.map(goalText).join(' · ') + '</p>' +
    '<div class="qtog">' +
      '<button data-music="1" class="' + (MUSIC.on ? 'on' : '') + '">🎵<small>음악</small></button>' +
      '<button data-mute="1" class="' + (MUTED ? '' : 'on') + '">' + (MUTED ? '🔇' : '🔊') + '<small>효과음</small></button>' +
      '<button data-talk="1" class="' + (G.talkOn ? 'on' : '') + '">💬<small>잡담</small></button>' +
      '<button data-follow="1" class="' + (cam.follow ? 'on' : '') + '">📍<small>따라가기</small></button></div>' +
    '<div class="menu"><button class="cta" data-resume="1">▶ 계속하기</button>' +
    '<button class="cta ghost" data-mset="1">⚙️ 설정</button><button class="cta ghost" data-mhelp="1">📖 도움말</button><button class="cta ghost" data-mdex="1">📚 판정 도감</button><button class="cta ghost" data-mach="1">🎖️ 업적</button>' +
    '<button class="cta ghost" data-mtitle="1">타이틀로</button></div>');
  $('[data-resume]').onclick = resumeGame;
  $('[data-mdex]').onclick = function () { openDex(openPause); };
  $('[data-mach]').onclick = function () { openAch(openPause); };
  // 빠른 토글 — 누르면 바로 바뀌고 메뉴를 다시 그린다
  $('[data-music]').onclick = function () {
    audioOn(); if (MUSIC.on) setMusic.last = SETTINGS.music; SETTINGS.music = MUSIC.on ? 0 : (setMusic.last || 0.7);
    saveSettings(); applySettings(); openPause();
  };
  $('[data-mute]').onclick = function () { MUTED = !MUTED; openPause(); };
  $('[data-talk]').onclick = function () { SETTINGS.talk = !G.talkOn; saveSettings(); applySettings(); openPause(); };
  $('[data-follow]').onclick = function () { cam.follow = !cam.follow; if (cam.follow) cam.dist = Math.min(cam.dist, 16); else fitCamera(); openPause(); };
  $('[data-mset]').onclick = function () { openSettings(openPause); };
  $('[data-mhelp]').onclick = function () { openHelp(openPause); };
  $('[data-mtitle]').onclick = function () {
    showModal('<h2>타이틀로 나갈까요?</h2><p>오늘 영업은 저장되지 않는다 — 이어하기는 <b>어제 마감</b>부터다.</p>' +
      '<div class="titlebtns"><button class="cta" data-q-yes="1">나간다</button><button class="cta ghost" data-q-no="1">계속하기</button></div>');
    $('[data-q-yes]').onclick = function () { G.menu = null; G.paused = false; endBlackout(false, true); clearActors(); G.tasks = []; renderTasks(); titleScreen(); };
    $('[data-q-no]').onclick = openPause;
  };
}
function resumeGame() { G.menu = null; G.paused = false; closeModal(); }
/* 도움말 — 게임 가이드 */
var HELP = [
  ['🗓️ 하루 · 한 주', '오픈 준비(17:30)에서 상점 · 꾸미기 · 직원 · 칩 구조 · 음료 · 딜러 배치를 정하고 <b>영업 시작</b>. 18:00~02:00 영업(1배속 6분) 뒤 레지 정산 · 보고서. 월~목 데일리 · 금 딥스택 · 토 메인 이벤트(참가비 2배 · 레지 24:00) · 일요일은 휴무 · 주간 정산(임대료). 8주가 한 시즌 — 목표는 <b>홀덤 명소(평판 85) + 자금 1,500만</b>. 자금이 사흘 연속 마이너스면 폐업.'],
  ['👟 점장 · 할 일', '바닥을 탭하거나 WASD 로 걷는다. 오른쪽(폰은 아래) 할 일 목록을 누르면 그 자리로 걸어가 처리한다. 카운터 뒤에 서 있으면 등록이 빨라진다. 🚨 판정 30초 · 📢 아나운스 · ⚖️ 밸런싱 · 🧽 청소 · ⚡ 돌발 상황.'],
  ['🚨 플로어 판정 넷', '<b>버튼 위치 오류 · 카드 장수 이상</b> — 실질 액션(블라인드 뒤 액션 둘 중 칩이 하나라도 들어갔거나 액션이 셋) 전이면 미스딜, 뒤면 버튼은 그대로 · 장수 틀린 좌석만 데드. <b>레이즈 금액 미달</b> — 다음 카드 전이면 최소 레이즈까지 채우고, 깔렸으면 그대로. <b>버튼 · 블라인드</b> — BB 는 반드시 다음 사람에게 한 칸, SB 는 지난 BB 자리(탈락이면 없음), 버튼은 지난 SB 자리(비었으면 데드 버튼). 근거는 TDA 케이스 문서로 <b>원문 확인 전</b>이다.'],
  ['🔍 딜러 실수 잡기', '가끔 딜러가 팟을 밀다 멈춘다. <b>누가 이겼나</b> — 보드 다섯 장과 각자의 홀카드로 가장 좋은 다섯 장을 만들고, 같은 족보면 높은 카드부터 한 장씩(키커) 견준다. 다섯 장이 똑같으면 찹. <b>팟 나누기</b> — 메인 팟은 가장 작은 올인 × 사람 수, 사이드 팟은 남은 사람끼리. 아무도 받지 못한 베팅은 돌려준다. 규정이 아니라 계산이라 「원문 확인 전」이 붙지 않는다.'],
  ['📢 아나운스', '레벨이 바뀌는 그 시각에 뜬다. 8초 안에 맞게 안내하면 정시 보너스. 구조표에서 지금 시각의 줄을 읽는다. 레지 마감 30분 전 · 레지 마감(총 칩 = 엔트리 × 스타팅) · 파이널 테이블.'],
  ['🧑‍💼 직원', '딜러 · 홀 서버 · 카운터 · 청소 · 플로어 보조. 출근율만큼 나오고 노쇼하면 🧑‍💼 로 대타. <b>사기</b>가 60 아래면 느려지고 20 아래면 그만둔다 — 과로를 피하고 하루 한 번 칭찬한다. 딜러 <b>교육 트리</b>(판정 · 속도 · 응대)는 교육 · 실전 경험 · 멘토 · 세미나로 오른다. 판정 2단계 = 믹스 자격.'],
  ['⚡ 돌발 상황', '단체 손님 · 인플루언서 · 정전(왼쪽 벽 차단기) · 딜러 다툼 · 칩 환전 요구 · 취객 · 위생 점검. 주가 갈수록 잦아진다.'],
  ['🎨 꾸미기 · 테이블', '테마와 장식을 사서 배치 모드에서 놓는다 — 장식 반경 3 손님 만족이 오른다. 테이블에서는 실제 카드로 승자가 정해지고, 큰 족보는 테이블 위에 크게 뜬다. 믹스 테이블(PLO8)은 상점에서.'],
  ['🎯 목표 · 도전', '오늘의 목표 셋 = 별 셋. 이번 주 도전 셋은 일요일에 보상(셋 다면 장식). 난이도는 6주에 걸쳐 조금씩 오른다.'],
  ['🥊 라이벌 · 업적', '길 건너 「' + RIVAL + '」와 일요일마다 <b>한 주 손님 수</b>를 겨룬다(이기면 평판 +2, 지면 −1). 라이벌 손님은 주마다 는다. 2주차부터 월요일에 라이벌이 수를 하나 둔다 — 토요일 맞불 · 평일 할인 · 단골 · 딜러 빼가기. 오픈 준비에서 막을지(돈이 든다) 그냥 둘지 정한다. 🎖️ 업적은 명예뿐 — 딴 것 하나를 칭호로 걸 수 있다.'],
  ['⚖️ 합법 운영', '매출은 참가비 · 음료(· 예약 보증금 · 믹스 참가비)뿐이다. 우승 상품은 트로피와 다음 대회 시드권. <b>칩을 현금이나 상품권으로 바꿔 주지 않는다</b> — 게임 안에서도 마찬가지다.']
];
function openHelp(back) {
  showModal('<div class="kicker">📖 도움말</div><h2>홀덤펍 점장 — 게임 가이드</h2>' +
    HELP.map(function (h, i) { return '<details class="help"' + (i === 0 ? ' open' : '') + '><summary>' + h[0] + '</summary><p>' + h[1] + '</p></details>'; }).join('') +
    '<div class="titlebtns"><button class="cta" data-back="1">돌아가기</button></div>', true);
  $('[data-back]').onclick = back;
}
function openCredits(back) {
  showModal('<div class="kicker">만든 사람 · 라이선스</div><h2>홀덤펍 점장 ' + VERSION + '</h2>' +
    '<p>홀덤펍 경영 시뮬레이션. 판정 문제는 딜러마스터 TDA 케이스 문서를 바탕으로 했고, 원문 대조 전이다 — 실제 대회 판정은 그 대회의 규정과 플로어를 따른다.</p>' +
    '<p class="note">3D — three.js r149 (MIT License) · 글꼴 — Noto Sans KR · JetBrains Mono (SIL Open Font License) · 음악 · 효과음은 브라우저 WebAudio 로 직접 만든다.<br>이 게임에는 실제 돈 · 칩 환전 · 현금 시상이 없다.</p>' +
    '<div class="titlebtns"><button class="cta" data-back="1">돌아가기</button></div>');
  $('[data-back]').onclick = back;
}
/* 기록 — 시즌이 끝나거나 폐업할 때 남긴다 */
function loadRecords() {
  var def = { seasons: 0, clears: 0, bestRep: 0, bestBank: 0, bankrupt: 0 };
  try {
    var r = JSON.parse(localStorage.getItem(REC_KEY) || 'null');
    return (r && typeof r === 'object' && !Array.isArray(r)) ? r : def;   // 손상된 기록(숫자 · 글자)은 새로 시작
  } catch (e) { return def; }
}
function recordRun(kind) {
  var r = loadRecords();
  if (kind === 'bankrupt') r.bankrupt++; else { r.seasons++; if (kind === 'clear') r.clears++; }
  r.bestRep = Math.max(r.bestRep, Math.round(G.rep)); r.bestBank = Math.max(r.bestBank, Math.round(G.bank));
  try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) { /* 무시 */ }
}
/* 🎖️ 업적 · 칭호 (1.5) — 이미 재는 숫자만 조건으로. 보상은 명예뿐(칭호) — 밸런스를 건드리지 않는다.
   k: day(마감) · run(지금 펍 상태, 마감 때) · life(기록) · week(일요일) · season(시즌 끝). 기록(pubsim.records)의 ach 에 남는다 */
var ACHS = [
  { id: 'first_close', k: 'day', ic: '🌙', ko: '첫 마감', d: '첫 영업을 끝까지 마쳤다', t: function () { return true; } },
  { id: 'first_win', k: 'day', ic: '🏆', ko: '첫 트로피', d: '우승자를 배출했다', t: function (c) { return !!c.winner; } },
  { id: 'perfect', k: 'day', ic: '⭐', ko: '완벽한 밤', d: '오늘의 목표 셋을 다 이뤘다', t: function (c) { return c.stars === 3; } },
  { id: 'grade_s', k: 'day', ic: '🥇', ko: 'S 등급', d: '목표 셋 + 흑자로 마감 S', t: function (c) { return c.grade === 'S'; } },
  { id: 'flawless', k: 'day', ic: '🧑‍⚖️', ko: '무결점 플로어', d: '하루 판정 5건 이상, 틀림 · 못 감 0', t: function (c) { return c.s.right >= 5 && !c.s.wrong && !c.s.missed; } },
  { id: 'combo5', k: 'day', ic: '🔥', ko: '콤보 ×5', d: '판정 5연속 정답', t: function (c) { return c.s.maxCombo >= 5; } },
  { id: 'combo10', k: 'day', ic: '☄️', ko: '콤보 ×10', d: '판정 10연속 정답', t: function (c) { return c.s.maxCombo >= 10; } },
  { id: 'spotter', k: 'day', ic: '🔍', ko: '족보 감별사', d: '하루 딜러 실수를 3번 잡았다', t: function (c) { return (c.s.spot || 0) >= 3; } },
  { id: 'quick10', k: 'day', ic: '⚡', ko: '번개 플로어', d: '하루 ⚡ 빠른 판정 10번', t: function (c) { return c.s.quick >= 10; } },
  { id: 'announcer', k: 'day', ic: '📢', ko: '정시 아나운서', d: '직접 아나운스 10건 이상, 틀림 · 놓침 0', t: function (c) { return c.s.ann - c.s.annByStaff >= 10 && !c.s.annWrong && !c.s.annMiss; } },
  { id: 'dry', k: 'day', ic: '🧽', ko: '뽀송한 바닥', d: '청소 3건 이상, 젖은 시간 30초 이하', t: function (c) { return c.s.cleaned >= 3 && c.s.spillSec <= 30; } },
  { id: 'packed', k: 'day', ic: '🪑', ko: '만석', d: '하루 엔트리 40건', t: function (c) { return c.s.entries >= 40; } },
  { id: 'busybar', k: 'day', ic: '🍹', ko: '바쁜 바', d: '하루 음료 60잔', t: function (c) { return c.s.drinks >= 60; } },
  { id: 'noleave', k: 'day', ic: '🚪', ko: '한 명도 안 놓쳤다', d: '엔트리 20건 이상, 줄이 길어 돌아간 손님 0', t: function (c) { return c.s.entries >= 20 && !(c.s.lost + c.s.queueLeave); } },
  { id: 'fixer', k: 'day', ic: '🛠️', ko: '돌발 해결사', d: '하루 돌발 상황 3건을 깔끔하게', t: function (c) { return c.s.events.filter(function (e) { return e.ok === true; }).length >= 3; } },
  { id: 'million', k: 'day', ic: '💰', ko: '백만 원의 밤', d: '하루 순이익 100만', t: function (c) { return c.net >= 1000000; } },
  { id: 'smile', k: 'day', ic: '😊', ko: '웃는 얼굴들', d: '평균 만족도 85', t: function (c) { return c.avgSat >= 85; } },
  { id: 'famous', k: 'run', ic: '🌟', ko: '홀덤 명소', d: '평판 85 — 동네의 명소', t: function () { return G.rep >= 85; } },
  { id: 'legend', k: 'run', ic: '👑', ko: '전설의 펍', d: '평판 100', t: function () { return G.rep >= 99.5; } },
  { id: 'bank10', k: 'run', ic: '🏦', ko: '천만 원', d: '자금 1,000만', t: function () { return G.bank >= 10000000; } },
  { id: 'team8', k: 'run', ic: '🤝', ko: '든든한 팀', d: '직원 8명', t: function () { return G.roster.length >= 8; } },
  { id: 'regs50', k: 'run', ic: '💞', ko: '모두의 단골집', d: '남은 단골 10명 이상이 모두 ♥50', t: function () { var L = G.regulars.filter(function (r) { return !r.gone; }); return L.length >= 10 && L.every(function (r) { return r.aff >= 50; }); } },
  { id: 'regs95', k: 'run', ic: '💖', ko: '찐단골', d: '단골 한 명이 ♥95', t: function () { return G.regulars.some(function (r) { return !r.gone && r.aff >= 95; }); } },
  { id: 'table3', k: 'run', ic: '🎲', ko: '세 번째 테이블', d: '3번 테이블을 들였다', t: function () { return !!G.owned.table3; } },
  { id: 'shopall', k: 'run', ic: '🛒', ko: '다 갖췄다', d: '상점 물건을 모두 샀다', t: function () { return SHOP.every(function (i) { return !!G.owned[i.id]; }); } },
  { id: 'dex9', k: 'life', ic: '📚', ko: '판정 수집가', d: '판정 도감 9건', t: function () { return caseDex().length >= 9; } },
  { id: 'dex27', k: 'life', ic: '🏅', ko: '명예 플로어', d: '판정 도감 27건 완성', t: function () { return caseDex().length >= CASES.length; } },
  { id: 'drill_s', k: 'life', ic: '🎯', ko: '연습실 S', d: '판정 연습실 650점', t: function () { return (loadRecords().drillBest || 0) >= 650; } },
  { id: 'week3', k: 'week', ic: '🗓️', ko: '도전 완주', d: '주간 도전 셋을 다 깼다', t: function (c) { return c.chN === 3; } },
  { id: 'week5m', k: 'week', ic: '📈', ko: '오백만 주간', d: '한 주 합계(임대료 뒤) 500만', t: function (c) { return c.weekNet >= 5000000; } },
  { id: 'rival1', k: 'week', ic: '🥊', ko: '첫 승리', d: RIVAL + '를 한 주 손님 수로 이겼다', t: function (c) { return !!c.rivalWin; } },
  { id: 'rival5', k: 'week', ic: '🏟️', ko: '동네 1등', d: '한 시즌에 ' + RIVAL + '를 다섯 번 이겼다', t: function () { return !!G.rival && G.rival.wins >= 5; } },
  { id: 'clear', k: 'season', ic: '🏆', ko: '시즌 클리어', d: '시즌 목표를 이뤘다', t: function (c) { return !!c.cleared; } },
  { id: 'season8', k: 'season', ic: '🗺️', ko: '8주 완주', d: '폐업 없이 시즌 8주를 마쳤다', t: function (c) { return !!c.firstEnd; } }
];
var ACH_BY = {}; ACHS.forEach(function (a) { ACH_BY[a.id] = a; });
var ACH_WHEN = { day: ['day', 'run', 'life'], week: ['week', 'run', 'life'], drill: ['life'], season: ['season', 'run', 'life'] };
function achGot() { var r = loadRecords(); return (r.ach && typeof r.ach === 'object' && !Array.isArray(r.ach)) ? r.ach : {}; }
/* 새로 딴 업적을 기록에 남기고 돌려준다. 저장이 막히면 빈 목록(띄우지 않는다) */
function checkAch(when, c) {
  var r = loadRecords(), got = achGot(), kinds = ACH_WHEN[when] || [], fresh = [];
  ACHS.forEach(function (a) {
    if (got[a.id] || kinds.indexOf(a.k) < 0) return;
    var ok = false;
    try { ok = !!a.t(c || {}); } catch (e) { ok = false; }   // 조건 하나가 깨져도 마감은 막지 않는다
    if (ok) { got[a.id] = G.day || 1; fresh.push(a); }
  });
  if (!fresh.length) return [];
  r.ach = got;
  try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) { return []; }
  return fresh;
}
function achHtml(fresh) {
  if (!fresh.length) return '';
  return '<div class="achnew"><b>🎖️ 새 업적</b>' + fresh.map(function (a) { return '<span>' + a.ic + ' ' + a.ko + '</span>'; }).join('') + '</div>';
}
function achTitle() { var r = loadRecords(), a = ACH_BY[r.title]; return a && achGot()[a.id] ? a : null; }
function openAch(back) {
  var got = achGot(), n = ACHS.filter(function (a) { return got[a.id]; }).length, cur = achTitle();
  showModal('<div class="kicker">업적 · ' + n + ' / ' + ACHS.length + '</div><h2>🎖️ 업적과 칭호</h2>' +
    '<p class="note">딴 업적을 누르면 그 이름이 칭호가 되어 타이틀에 걸린다. 업적은 명예뿐 — 돈 · 평판은 주지 않는다.</p>' +
    '<p class="achcur">칭호 — <b>' + (cur ? cur.ic + ' ' + cur.ko : '없음') + '</b></p>' +
    '<div class="ach">' + ACHS.map(function (a) {
      var ok = !!got[a.id];
      return '<button class="achc' + (ok ? ' got' : '') + (cur && cur.id === a.id ? ' on' : '') + '"' + (ok ? ' data-atitle="' + a.id + '"' : ' disabled') + '>' +
        '<span class="ic">' + (ok ? a.ic : '🔒') + '</span><b>' + a.ko + '</b><small>' + a.d + '</small></button>';
    }).join('') + '</div>' +
    '<div class="titlebtns"><button class="cta" data-back="1">돌아가기</button></div>');
  document.querySelectorAll('[data-atitle]').forEach(function (b) {
    b.onclick = function () {
      var r = loadRecords(), id = b.getAttribute('data-atitle');
      r.title = r.title === id ? null : id;   // 같은 걸 다시 누르면 칭호를 내린다
      try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) { /* 무시 */ }
      openAch(back);
    };
  });
  $('[data-back]').onclick = back;
}
/* Esc — 일시정지 열고 닫기 */
window.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (G.menu === 'pause') resumeGame();
  else if (G.phase === 'open' && !G.modal) openPause();
});

function seasonEnd(cleared, firstEnd) {
  if (firstEnd) recordRun(cleared ? 'clear' : 'season');   // 8주차 일요일에 한 번만 — 계속 운영하는 주는 세지 않는다
  var achNew = checkAch('season', { cleared: cleared, firstEnd: firstEnd });
  showModal('<div class="titlecard"><div class="kicker">시즌 ' + SEASON_WEEKS + '주 끝</div><h1>' + (cleared ? '🏆 시즌 클리어!' : '시즌 종료') + '</h1>' +
    '<p class="sub">' + (cleared ? '당신의 펍은 이 동네의 홀덤 명소가 됐다.' : '목표에는 닿지 못했다 — 하지만 펍은 계속된다.') + '</p></div>' + achHtml(achNew) +
    '<p>평판 <b>' + Math.round(G.rep) + '</b> (' + rankOf(G.rep) + ') · 자금 <b>' + won(G.bank) + '원</b> · 직원 ' + G.roster.length + '명</p>' +
    (G.rival && G.rival.wins + G.rival.losses ? '<p>🥊 ' + RIVAL + '와 주간 대결 <b>' + G.rival.wins + '승 ' + G.rival.losses + '패</b> — ' + (G.rival.wins > G.rival.losses ? '동네 손님은 우리 편이다' : '다음 시즌엔 이기자') + '</p>' : '') +
    '<div class="titlebtns"><button class="cta" data-more="1">계속 운영하기</button><button class="cta ghost" data-new="1">새 시즌 — 처음부터</button></div>', true);
  if (cleared) { SFX.win(); confetti(V(0, 0)); }
  $('[data-more]').onclick = function () { prepScreen('shop'); };
  $('[data-new]').onclick = function () { resetGame(); prepScreen('shop'); };
}
function bankrupt() {
  recordRun('bankrupt');
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
  showModal('<div class="titlecard"><div class="kicker">' + dayInfo().week + '주차</div><h1>💸 폐업</h1>' +
    '<p class="sub">자금이 사흘 연속 마이너스였다. 펍 문을 닫는다.</p></div>' +
    '<p class="note">인건비 · 재고 · 임대료가 매출을 넘지 않게 — 직원 수와 일당, 참가비, 음료 재고를 다시 맞춰 보자.</p>' +
    '<div class="titlebtns"><button class="cta" data-new="1">처음부터 다시</button></div>', true);
  SFX.bad();
  $('[data-new]').onclick = function () { resetGame(); prepScreen('shop'); };
}

// ── 시작 ────────────────────────────────────────────
G.saveGameNow = function () { saveGame(); };   // 자동 점검용
G.placeAt = placeAtForTest;                    // 자동 점검용
G.__music = MUSIC;   // 자동 점검용
G.__plan = planEvents; G.__type = pickType; G.__diff = diffK;   // 자동 점검용
G.__weekly = weeklyScreen; G.__prep = prepScreen; G.__save = saveGame;   // 자동 점검용
G.__case = function (tid, n) { var t = G.tables[tid], d = genCase(t); if (n) d.id = n; createCall(t, 'case', d); return d; };   // 자동 점검용
G.__cases = CASES; G.__caseQ = caseQuestion; G.__drill = openDrill; G.__open = openCall; G.__rival = { gen: genRivalMove, decide: rivalDecide, settle: rivalSettle, arrK: rivalArrK, base: rivalBase, moves: RIVAL_MOVES };G.__spotGen = function (tid) { return genIncident(G.tables[tid || 0], 'spot'); }; G.__spotCall = function (tid) { var t = G.tables[tid || 0]; createCall(t, 'spot', genIncident(t, 'spot')); return t.call; }; G.__best = best; G.__cmp = cmp;G.__achs = ACHS; G.__checkAch = checkAch; G.__openAch = openAch; G.__achGot = achGot;G.__isMix = isMix;
var confirmNew = { ok: false };   // 자동 점검이 새로 시작 확인을 건너뛸 때 쓴다
G.__confirmNew = confirmNew;
G.__eval = { best: best, eval5: eval5, plohi: bestPLOHigh, plolo: bestPLOLow, name: handName };   // 자동 점검용
G.roster = startRoster();
G.regulars = makeRegulars();
G.cfg.resCap = 1; G.cfg.resDeposit = true;
initScene();
applySettings();
newDay();
titleScreen();
requestAnimationFrame(frame);
})();
