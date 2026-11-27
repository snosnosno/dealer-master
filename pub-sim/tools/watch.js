// 📺 플레이 보기 점검 — node tools/watch.js [shot]
// 라벨 📺 로 열기 · 시간이 흐른다(창이 아니다) · 보드가 스트릿마다 늘어난다 · 좌석 · 지난 핸드 홀카드
// 호출이 오면 「판정하러 가기」 · 닫으면 카메라 원위치 · 테이블 정보 창의 「📺 플레이 보기」 · 폰 화면 안
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const { chromium, devices } = require('playwright');
const SHOT = process.argv[2] === 'shot';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [], bad = [], out = {};
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const expect = (name, cond, info) => { if (!cond) bad.push(name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); };
  await page.goto(PAGE); await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForTimeout(500);
  const G = (f, a) => page.evaluate(f, a);
  await page.click('[data-go]');
  await page.click('[data-tab="dealers"]');
  await page.click('[data-open]');
  await G(() => { const P = window.__pub; P.evPlan = []; P.speed = 3; });
  // 손님이 앉고 핸드가 돌 때까지
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(250);
    await G(() => { const c = document.querySelector('[data-close]') || document.querySelector('[data-ok]'); if (c) c.click(); });
    if (await G(() => window.__pub.tables[0].seats.filter(x => x !== null).length >= 3 && !!window.__pub.tables[0].cards)) break;
  }
  const cam0 = await G(() => ({ dist: window.__pub.__watch.cam.dist, x: window.__pub.__watch.cam.target.x }));
  // 1. 라벨의 📺 로 열기
  out.label = await G(() => { const el = document.querySelector('.tlabel .wt'); if (!el) return false; el.click(); return true; });
  expect('label has 📺', out.label);
  await page.waitForTimeout(300);
  out.open = await G(() => ({ panel: !!document.querySelector('#watch .watch'), tid: window.__pub.__watch.state.tid, dist: window.__pub.__watch.cam.dist, modal: !!window.__pub.modal, seats: document.querySelectorAll('#watch .wseat').length, seated: window.__pub.tables[0].seats.filter(x => x !== null).length }));
  expect('watch opened', out.open.panel && out.open.tid === 0 && out.open.dist < cam0.dist && !out.open.modal, out.open);
  expect('seats match', out.open.seats === out.open.seated, out.open);
  // 2. 시간이 흐르고 보드가 스트릿마다 늘어난다
  const t0 = await G(() => window.__pub.simT);
  const seen = new Set(), streets = new Set();
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(250);
    const s = await G(() => ({ real: [...document.querySelectorAll('#watch .wboard .pc:not(.back)')].length, st: (document.querySelector('#watch .whead em') || {}).innerText || '' }));
    seen.add(s.real); streets.add(s.st);
    if (seen.has(0) && seen.has(3) && (seen.has(4) || seen.has(5))) break;
  }
  const t1 = await G(() => window.__pub.simT);
  out.time = t1 - t0; out.boards = [...seen].sort(); out.streets = [...streets];
  expect('time flows while watching', out.time > 2, out.time);
  expect('board grows', out.boards.includes(3) && (out.boards.includes(4) || out.boards.includes(5)), out.boards);
  expect('streets shown', out.streets.some(s => s.indexOf('플랍') >= 0), out.streets);
  // 3. 지난 핸드 — 이긴 홀카드(홀덤)
  for (let i = 0; i < 60 && !(await G(() => !!window.__pub.tables[0].lastResult)); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(300);
  out.last = await G(() => ({ txt: (document.querySelector('#watch .wlast') || {}).innerText || '', cards: document.querySelectorAll('#watch .wcards .pc').length }));
  expect('last hand with hole cards', out.last.txt.indexOf('지난 핸드') >= 0 && out.last.cards === 2, out.last);
  if (SHOT) await page.screenshot({ path: 'watch-open.png' });
  out.state = await G(() => ({ tid: window.__pub.__watch.state.tid, phase: window.__pub.phase, modal: !!window.__pub.modal, html: document.querySelector('#watch').innerHTML.length }));
  out.fit = await G(() => { const el = document.querySelector('#watch .watch'); if (!el) return { missing: true }; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, w: innerWidth, bottom: r.bottom, h: innerHeight }; });
  expect('panel inside screen', out.fit.left >= 0 && out.fit.right <= out.fit.w && out.fit.bottom <= out.fit.h, out.fit);
  // 4. 그 테이블에 호출 — 「판정하러 가기」
  await G(() => { const P = window.__pub; P.__case(0); });
  await page.waitForTimeout(400);
  out.callBtn = await G(() => !!document.querySelector('#watch [data-wcall]'));
  expect('call button', out.callBtn);
  await G(() => document.querySelector('#watch [data-wcall]').click());
  await page.waitForTimeout(300);
  out.afterCall = await G(() => ({ tid: window.__pub.__watch.state.tid, panel: !!document.querySelector('#watch .watch'), dist: window.__pub.__watch.cam.dist, walking: !!(window.__pub.player.path && window.__pub.player.path.length) || !!window.__pub.modal }));
  expect('call closes watch and goes', out.afterCall.tid === null && !out.afterCall.panel && out.afterCall.dist === cam0.dist && out.afterCall.walking, out.afterCall);
  // 판정 창이 열리면 닫고 정리
  for (let i = 0; i < 40 && !(await G(() => !!document.querySelector('[data-ch]'))); i++) await page.waitForTimeout(250);
  await G(() => { const c = document.querySelectorAll('[data-ch]')[window.__pub.current.correct]; if (c) c.click(); });
  await page.waitForTimeout(200);
  await G(() => { const ok = document.querySelector('[data-ok]'); if (ok) ok.click(); });
  // 5. 테이블 정보 창의 「📺 플레이 보기」 · ✕ 로 닫기
  await G(() => window.__pub.__watch.table(0));
  out.infoBtn = await G(() => !!document.querySelector('[data-watch]'));
  expect('info has watch button', out.infoBtn);
  await page.click('[data-watch]');
  await page.waitForTimeout(200);
  out.reopen = await G(() => ({ tid: window.__pub.__watch.state.tid, modal: !!window.__pub.modal }));
  expect('opened from info', out.reopen.tid === 0 && !out.reopen.modal, out.reopen);
  await page.click('[data-wclose]');
  await page.waitForTimeout(200);
  out.closed = await G(() => ({ tid: window.__pub.__watch.state.tid, panel: !!document.querySelector('#watch .watch'), dist: window.__pub.__watch.cam.dist, x: window.__pub.__watch.cam.target.x }));
  expect('closed restores camera', out.closed.tid === null && !out.closed.panel && out.closed.dist === cam0.dist && Math.abs(out.closed.x - cam0.x) < 1e-6, [cam0, out.closed]);
  console.log(JSON.stringify({ out, bad, errors }, null, 1));
  await browser.close();
})();
