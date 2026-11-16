// 주간 도전 · 쇼다운 연출 점검 — node tools/week.js [shot]
// 오픈 준비의 이번 주 도전 박스 · 일요일 정산 보상(돈 · 평판 · 셋 다면 장식) · 쇼다운 큰 글자 · 홀카드 뒤집기
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
  await page.click('[data-go]');
  out.box = await G(() => { const b = document.querySelector('.weekch'); return b ? b.innerText.replace(/\n/g, ' / ') : null; });
  out.ch = await G(() => window.__pub.weekCh);
  // 쇼다운 — 영업 1분 남짓 동안 큰 글자 · 홀카드 앞면을 찾는다
  await page.click('[data-tab="dealers"]');
  await page.click('[data-open]');
  await G(() => { window.__pub.evPlan = []; window.__pub.speed = 4; });
  const seen = { hand: [], flipped: 0 };
  for (let i = 0; i < 240 && (seen.hand.length < 2 || !seen.flipped); i++) {
    await page.waitForTimeout(250);
    const s = await G(() => {
      const G = window.__pub, q = x => document.querySelector(x);
      const ch = q('[data-ch],[data-an],[data-ev]');
      if (ch && G.current) { const sel = ch.hasAttribute('data-ch') ? '[data-ch]' : (ch.hasAttribute('data-an') ? '[data-an]' : '[data-ev]'); document.querySelectorAll(sel)[G.current.correct].click(); }
      const ok = q('[data-ok]'); if (ok) ok.click();
      const pc = G.tasks.find(k => k.kind === 'call'); if (pc && !G.modal) { G.tasks = G.tasks.filter(k => k !== pc); G.tables[pc.table].call = null; }
      return { hand: [...document.querySelectorAll('.float.hand')].map(e => e.textContent),
        flipped: G.tables.reduce((n, t) => n + t.def.group.children.filter(o => o.userData.show).length, 0),
        cardsBack: G.tables.every(t => t.def.cards.every(cg => !cg.children[0].material.map)) };
    });
    s.hand.forEach(h => { if (seen.hand.indexOf(h) < 0) seen.hand.push(h); });
    if (s.flipped) seen.flipped = s.flipped;
    if (SHOT && s.hand.length && !seen.shot) { seen.shot = 1; await page.screenshot({ path: 'week-showdown.png' }); }
  }
  out.showdown = seen;
  // 일요일 정산 — 도전 셋을 모두 넘긴 가짜 한 주
  out.weekly = await G(() => {
    const G = window.__pub;
    G.weekCh = { week: 1, list: [{ id: 'entries', n: 125 }, { id: 'noerr', n: 8 }, { id: 'winners', n: 4 }] };
    G.weekLog = [1, 2, 3, 4, 5, 6].map(d => ({ day: d, name: '데일리', wk: '월화수목금토'[d - 1], net: 200000, stars: 2, entries: 25, rep: 60, err: 1, drinks: 40, win: true, evOk: 1 }));
    G.day = 7; G.phase = 'prep';
    const b0 = G.bank, r0 = G.rep, inv0 = JSON.stringify(G.decorInv);
    G.__weekly();
    const txt = document.querySelector('.modal').innerText;
    return { bankDelta: G.bank - b0, rep: Math.round((G.rep - r0) * 10) / 10, inv: inv0 + ' → ' + JSON.stringify(G.decorInv), text: (txt.match(/🗓️ 이번 주 도전[\s\S]*?(?=🏁)/) || [''])[0].replace(/\n/g, ' / '), weekCh: G.weekCh };
  });
  if (SHOT) await page.screenshot({ path: 'week-sunday.png' });
  console.log(JSON.stringify({ out, errors: errors.slice(0, 8) }, null, 1));
  await browser.close();
})();
