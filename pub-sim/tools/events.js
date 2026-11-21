// 돌발 이벤트 점검 — node tools/events.js [timeout]
// 1일차 영업 중 일곱 가지 이벤트를 하나씩 일으키고, 점장이 걸어가 바르게 처리한다.
// timeout 을 주면 이벤트를 하나도 처리하지 않고 시간 초과 결과를 본다.
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const { chromium } = require('playwright');
const TIMEOUT = process.argv[2] === 'timeout';
const TYPES = process.argv[3] ? process.argv[3].split(',') : ['group', 'influencer', 'drunk', 'blackout', 'fight', 'exchange', 'inspect'];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(PAGE);
  await page.waitForTimeout(500);
  await page.click('[data-go]');
  await page.click('[data-tab="dealers"]');
  await page.click('[data-open]');
  await page.evaluate(() => { const G = window.__pub; G.evPlan = []; G.speed = 2; });
  const G = (f, a) => page.evaluate(f, a);
  // 열린 모달을 정답으로 닫는다 (호출 · 아나운스 · 이벤트 공통)
  async function drain() {
    for (let i = 0; i < 40; i++) {
      const s = await G(() => { const q = x => !!document.querySelector(x); return { ch: q('[data-ch]'), ev: q('[data-ev]'), an: q('[data-an]'), ms: q('[data-ms]'), ok: q('[data-ok]'), close: q('[data-close]'), nd: q('[data-next-day]'), st: q('[data-st]') }; });
      if (s.nd || s.st) return 'closed';
      if (s.ev) { const c = await G(() => window.__pub.current.correct); await page.locator('[data-ev]').nth(c).click(); }
      else if (s.ch) { const c = await G(() => window.__pub.current.correct); await page.locator('[data-ch]').nth(c).click(); }
      else if (s.an) { const c = await G(() => window.__pub.current.correct); await page.locator('[data-an]').nth(c).click(); }
      else if (s.ms) { const p = await G(() => window.__pub.current.data.pos); await page.click(`[data-ms="${p.btn}"]`); if (p.sbLive) await page.click(`[data-ms="${p.sbSeat}"]`); else await page.click('[data-nosb]'); await page.click(`[data-ms="${p.bb}"]`); await page.click('[data-confirm]'); }
      else if (s.ok) await page.click('[data-ok]');
      else if (s.close) await page.click('[data-close]');
      else return 'free';
    }
    return 'stuck';
  }
  const out = {};
  await page.waitForTimeout(9000);   // 손님이 좀 오게
  for (const type of TYPES) {
    await drain();
    let started = false;
    for (let k = 0; k < 120 && !started; k++) {   // 조건(바 손님 등)이 맞을 때까지 기다린다
      started = await G((t) => window.__pub.startEvent(t), type);
      if (!started) { await drain(); await page.waitForTimeout(250); }
    }
    if (!started) { out[type] = 'not-started'; continue; }
    const id = await G(() => { const k = window.__pub.tasks.filter(x => x.kind === 'event').slice(-1)[0]; return k ? k.id : null; });
    const r = { started, light: await G(() => window.__pub.blackout) };
    if (!TIMEOUT && id !== null && type !== 'inspect') {
      await page.locator(`[data-task="${id}"]`).click();
      for (let i = 0; i < 300; i++) {
        const left = await G((id) => window.__pub.tasks.some(x => x.id === id), id);
        const ev = await page.$('[data-ev]');
        if (ev || !left) break;
        await page.waitForTimeout(50);
      }
      if (await page.$('[data-ev]')) { r.picked = 'correct'; }
      await drain();
    } else {
      // 시간 초과까지 기다린다 (점검원은 12초 + 걸어오는 시간)
      for (let i = 0; i < 400; i++) {
        await drain();
        const left = await G((id) => window.__pub.tasks.some(x => x.id === id), id);
        if (!left && (type !== 'inspect' || !(await G(() => window.__pub.inspector)))) break;
        await page.waitForTimeout(60);
      }
    }
    r.after = await G(() => ({ rep: Math.round(window.__pub.rep * 10) / 10, fines: window.__pub.stats.fines, blackout: window.__pub.blackout, ev: window.__pub.stats.events.slice(-1)[0] }));
    out[type] = r;
  }
  // 하루 끝까지 돌려 보고서에 돌발 상황이 나오는지 본다
  await G(() => { window.__pub.speed = 12; });
  for (let i = 0; i < 4000; i++) { const s = await drain(); if (s === 'closed') break; await page.waitForTimeout(30); }
  if (await page.$('[data-st]')) { const c = await G(() => window.__pub.current.correct); await page.locator('[data-st]').nth(c).click(); }
  const rep = await G(() => { const m = document.querySelector('.modal'); return m ? m.innerText : ''; });
  out.report = (rep.match(/⚡ 돌발 상황[\s\S]*?후기/) || [''])[0];
  out.fineRow = (rep.match(/벌금[^\n]*\n?[^\n]*/) || [''])[0];
  console.log(JSON.stringify({ mode: TIMEOUT ? 'timeout' : 'handle', out, errors: errors.slice(0, 8) }, null, 1));
  await browser.close();
})();
