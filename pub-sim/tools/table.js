// 테이블 깊이 점검 — node tools/table.js [shot]
// 족보 평가기(홀덤 · PLO 하이 · 8-or-better 로우)를 알려진 핸드로 확인하고,
// 믹스 테이블을 산 상태로 영업해 보드 · 실제 승자 · 믹스 참가비를 본다.
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const { chromium, devices } = require('playwright');
const SHOT = process.argv[2] === 'shot';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(PAGE);
  await page.waitForTimeout(500);
  const G = (f, a) => page.evaluate(f, a);
  // 1) 평가기 — 카드 문자열 'As' 'Td' 처럼
  const unit = await G(() => {
    const E = window.__pub.__eval, R = '23456789TJQKA', S = 'shdc';
    const c = s => s.split(' ').map(x => ({ r: R.indexOf(x[0]), s: S.indexOf(x[1]) }));
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const cases = [
      ['로열 플러시', E.name(E.best(c('As Ks Qs Js Ts 2d 3c'))) === '로열 플러시'],
      ['휠 스트레이트', eq(E.best(c('Ah 2d 3c 4s 5h 9d Kc')), [4, 3])],
      ['풀하우스 > 플러시', E.best(c('Kh Kd Ks 2h 2c 9h 3h'))[0] === 6],
      ['투페어 키커', eq(E.best(c('Ah Ad 9s 9c 4d 3h Kc')), [2, 12, 7, 11])],
      ['PLO 두 장만 — 에이스 셋은 트리플', E.plohi(c('As Ah Kd Kc'), c('Ad 7s 2c 9h Jd'))[0] === 3],
      ['PLO 손에 스페이드 하나면 플러시 아님', E.plohi(c('As Kh Qd Jc'), c('2s 5s 7s 9s Kd'))[0] !== 5],
      ['PLO 손에 스페이드 둘이면 플러시', E.plohi(c('As Ks Qd Jc'), c('2s 5s 7s 9h Kd'))[0] === 5],
      ['로우 8-5-3-2-A', eq(E.plolo(c('As 2h Kd Kc'), c('3d 5c 8s Kh Jd')), [8, 5, 3, 2, 1])],
      ['로우 없음 (8 이하 셋이 안 깔림)', E.plolo(c('As 2h 3d 4c'), c('Kd Qc Js 9h 8d')) === null],
      ['로우 — 손에서 정확히 두 장', E.plolo(c('As 2h 3d 4c'), c('5d 6c 7s Kh Qd')) !== null]
    ];
    return cases.map(x => (x[1] ? '✓ ' : '✗ ') + x[0]);
  });
  // 2) 믹스 테이블을 사고 영업
  await page.click('[data-go]');
  await G(() => { const G = window.__pub; G.bank = 5000000; G.roster[0].train = { j: 2, s: 0, v: 0 }; });
  await page.click('[data-buy="mix"]');
  await page.click('[data-tab="dealers"]');
  // 1번 지호(자격 없음) · 2번(믹스) 민준(자격 있음)
  await page.click('[data-as="3:0"]'); await page.click('[data-as="1:1"]');
  await page.click('[data-open]');
  await G(() => { window.__pub.evPlan = []; window.__pub.speed = 3; });
  const seen = { boardShown: 0, results: [], maxHands: 0 };
  for (let i = 0; i < 160; i++) {
    await page.waitForTimeout(200);
    const s = await G(() => {
      const G = window.__pub, q = x => document.querySelector(x);
      // 열린 창은 정답으로 닫는다
      const ch = q('[data-ch],[data-an],[data-ev]');
      if (ch && G.current) { const sel = ch.hasAttribute('data-ch') ? '[data-ch]' : (ch.hasAttribute('data-an') ? '[data-an]' : '[data-ev]'); document.querySelectorAll(sel)[G.current.correct].click(); }
      const ok = q('[data-ok]'); if (ok) ok.click();
      const call = G.tasks.find(k => k.kind === 'call' && k.type !== 'pos');
      if (call && !(G.player.path && G.player.path.length) && !G.modal) q('[data-task="' + call.id + '"]').click();
      const pc = G.tasks.find(k => k.kind === 'call' && k.type === 'pos'); if (pc) { G.tasks = G.tasks.filter(k => k !== pc); G.tables[pc.table].call = null; }
      return G.tables.map(t => ({ id: t.id, hands: t.hands, board: t.def.board.filter(m => m.visible).length, res: t.lastResult, mix: G.owned.mix && t.id === 1, holes: t.cards ? Object.values(t.cards.holes).map(h => h.length) : [] }));
    });
    s.forEach(t => { if (t.board >= 3) seen.boardShown++; if (t.res) seen.results.push((t.mix ? 'PLO ' : 'NLH ') + t.res.name + ' ' + t.res.hand + (t.res.low ? ' / 로우 ' + t.res.low : '')); seen.maxHands = Math.max(seen.maxHands, t.hands); if (t.mix && t.holes.length) seen.mixHoles = t.holes[0]; if (!t.mix && t.holes.length) seen.nlhHoles = t.holes[0]; });
    if (SHOT && !seen.shot && s.some(t => t.board >= 4)) { seen.shot = 1; await page.screenshot({ path: 'table-board.png' }); }
  }
  seen.results = [...new Set(seen.results)].slice(0, 10);
  const money = await G(() => ({ mixFee: window.__pub.stats.mixFee, pros: window.__pub.customers.filter(c => c.type === 'pro').length, all: window.__pub.customers.length, tlabel: [...document.querySelectorAll('.tlabel')].map(e => e.textContent) }));
  console.log(JSON.stringify({ unit, seen, money, errors: errors.slice(0, 8) }, null, 1));
  await browser.close();
})();
