// 토요일 메인 이벤트 · 사전 예약 · 단골 · 일요일 주간 정산 → 2주차 월요일까지 확인 — node tools/weekend.js
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(PAGE);
  await page.waitForTimeout(500);
  await page.click('[data-go]');
  // 토요일로 건너뛰고, 이번 주 앞 닷새의 기록을 넣어 둔다
  await page.evaluate(() => {
    const G = window.__pub; G.day = 6; G.goalsDay = null; G.candDay = null;
    G.weekLog = [1,2,3,4,5].map(d => ({ day: d, name: d === 5 ? '금요 딥스택' : '데일리', wk: '월화수목금'[d-1], net: 150000 + d * 20000, stars: d % 4, entries: 25, rep: 55 }));
  });
  await page.click('[data-tab="shop"]');
  await page.screenshot({ path: 'wk-prep.png' });
  const info = await page.evaluate(() => ({ h2: document.querySelector('.modal h2').innerText, cal: [...document.querySelectorAll('.cd')].map(x => x.innerText.replace(/\n/g, ' ')) }));
  await page.click('[data-tab="resv"]');
  await page.screenshot({ path: 'wk-resv.png' });
  const resvTab = await page.evaluate(() => document.querySelector('.modal .note:last-of-type') && [...document.querySelectorAll('.modal p')].map(p => p.innerText).join(' | ').slice(0, 400));
  await page.click('[data-tab="regs"]');
  await page.screenshot({ path: 'wk-regs.png' });
  await page.click('[data-tab="chips"]');
  const fees = await page.evaluate(() => [...document.querySelectorAll('[data-fee]')].map(b => b.innerText.split('\n')[0]));
  await page.click('[data-tab="dealers"]');
  await page.click('[data-open]');
  await page.evaluate(() => { window.__pub.speed = 8; });
  // 할 일은 정답으로 바로 처리 — 마감까지 굴린다
  for (let i = 0; i < 20000; i++) {
    const st = await page.evaluate(() => { const q = s => !!document.querySelector(s); return { nd: q('[data-next-day]'), ch: q('[data-ch]'), ok: q('[data-ok]'), ms: q('[data-ms]'), an: q('[data-an]'), stl: q('[data-st]'), close: q('[data-close]'), modal: q('#modal .modal') }; });
    if (st.nd) break;
    if (st.ch) { const c = await page.evaluate(() => window.__pub.current.correct); await page.locator('[data-ch]').nth(c).click(); }
    else if (st.ok) await page.click('[data-ok]');
    else if (st.ms) { const p = await page.evaluate(() => window.__pub.current.data.pos); await page.click(`[data-ms="${p.btn}"]`); if (p.sbLive) await page.click(`[data-ms="${p.sbSeat}"]`); else await page.click('[data-nosb]'); await page.click(`[data-ms="${p.bb}"]`); await page.click('[data-confirm]'); }
    else if (st.an) { const c = await page.evaluate(() => window.__pub.current.correct); await page.locator('[data-an]').nth(c).click(); }
    else if (st.stl) { const c = await page.evaluate(() => window.__pub.current.correct); await page.locator('[data-st]').nth(c).click(); }
    else if (st.close) await page.click('[data-close]');
    else if (!st.modal) { const id = await page.evaluate(() => { const t = window.__pub.tasks.find(k => k.kind === 'call' || k.kind === 'announce'); return t ? t.id : null; }); if (id !== null) { try { await page.locator(`[data-task="${id}"]`).click({ timeout: 800 }); } catch (e) {} } else await page.waitForTimeout(20); }
    else await page.waitForTimeout(20);
  }
  const resv = await page.evaluate(() => ({ resv: window.__pub.resv && { total: window.__pub.resv.total, arrived: window.__pub.resv.arrived, noshow: window.__pub.resv.noshow, open: window.__pub.resv.open }, regDelta: window.__pub.regDelta, regVisits: window.__pub.stats.regVisits, dep: window.__pub.stats.depositRev, regs: window.__pub.regulars.map(r => r.name + ':' + r.visits + ':' + r.aff) }));
  const rtxt = await page.evaluate(() => document.querySelector('.modal').innerText.split('\n').filter(l => /예약|단골|보증금/.test(l)).join(' / '));
  const sat = await page.evaluate(() => ({ btn: document.querySelector('[data-next-day]').innerText, fee: [...document.querySelectorAll('.rows td')].slice(0, 2).map(x => x.innerText).join(' '), rep: window.__pub.rep, start: window.__pub.stats.repStart, regwarn: window.__pub.stats.ann }));
  await page.screenshot({ path: 'wk-report.png' });
  await page.click('[data-next-day]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'wk-weekly.png' });
  const weekly = await page.evaluate(() => ({ text: document.querySelector('.modal').innerText.slice(0, 600), day: window.__pub.day }));
  await page.click('[data-week]');
  const mon = await page.evaluate(() => ({ h2: document.querySelector('.modal h2').innerText, kicker: document.querySelector('.modal .kicker').innerText }));
  console.log(JSON.stringify({ resvTab, resv, rtxt, errors, mon }, null, 1));
  await browser.close();
})();
