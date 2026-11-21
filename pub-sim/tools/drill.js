// 1.4 점검 — node tools/drill.js [shot]
// 판정 연습실 5문제(정답 · 오답 · 시간 초과) · 결과 등급 · 최고 기록, 영업 판정의 ⚡ 막대 · 빠른 판정 보너스 · 도감 보상(9건째)
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
  const out = {};
  // 연습실 — 1 · 2 · 4 번은 정답, 3 번은 오답, 5 번은 시간 초과(시계를 당긴다)
  await page.click('[data-drill]');
  const log = [];
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(300);
    if (SHOT && i === 0) await page.screenshot({ path: 'drill-q.png' });
    if (i === 3) {   // 화면이 꺼졌던 30초(시계가 한 번에 뛴다)는 세지 않는다
      await G(() => { const t = performance.now; performance.now = () => t.call(performance) + 30000; });
      await page.waitForTimeout(300);
      out.skewLeft = await G(() => document.querySelector('.qbar span').textContent);
      await G(() => { delete performance.now; document.querySelectorAll('[data-dr]')[0].click(); });
    } else if (i === 4) {   // 진짜로 21초 기다린다 — 시간 초과
      await page.waitForTimeout(21000);
    } else {
      await G((wrong) => {
        const bs = [...document.querySelectorAll('[data-dr]')];
        // 정답은 왜 · 근거가 나온 뒤에야 알 수 있다 — 화면에 없으니 하나 눌러 보고 결과를 기록
        bs[wrong ? 2 : 0].click();
      }, i === 2);
    }
    log.push(await G(() => ({ v: (document.querySelector('.verdict') || {}).textContent, unv: document.body.innerText.includes('원문 확인 전') })));
    if (SHOT && i === 0) await page.screenshot({ path: 'drill-a.png' });
    await page.click('[data-dnext]');
  }
  out.drill = log;
  out.result = await G(() => ({ grade: (document.querySelector('.gradebox span') || {}).textContent, text: document.querySelector('.modal h2').textContent, best: JSON.parse(localStorage.getItem('pubsim.records') || '{}').drillBest }));
  if (SHOT) await page.screenshot({ path: 'drill-result.png' });
  await page.click('[data-back]');
  out.titleBtn = await G(() => document.querySelector('[data-drill]').textContent);
  // 영업 — ⚡ 막대 · 빠른 판정 · 도감 9건째 보상
  await G(() => localStorage.setItem('pubsim.records', JSON.stringify({ seasons: 0, clears: 0, bestRep: 0, bestBank: 0, bankrupt: 0, cases: [1, 2, 3, 4, 7, 8, 9, 10] })));
  await page.click('[data-go]'); await page.click('[data-tab="dealers"]'); await page.click('[data-open]');
  await page.waitForTimeout(1000);
  out.biz = await G(() => {
    const G = window.__pub; G.evPlan = [];
    G.__case(0, 11); G.__open(G.tasks.find(k => k.type === 'case'));
    const bar = !!document.querySelector('.qbar i'), secs = G.current.quickS;
    const r0 = G.rep;
    document.querySelectorAll('[data-ch]')[G.current.correct].click();
    const txt = document.querySelector('.modal').innerText;
    return { bar, secs, quick: txt.includes('빠른 판정'), gift: txt.includes('평판 +2'), dex: (txt.match(/도감 \+1 — \d+/) || [''])[0], repDelta: Math.round((G.rep - r0) * 10) / 10, statQuick: G.stats.quick };
  });
  if (SHOT) await page.screenshot({ path: 'drill-biz.png' });
  await page.click('[data-ok]');
  console.log(JSON.stringify({ out, errors: errors.slice(0, 8) }, null, 1));
  await browser.close();
})();
