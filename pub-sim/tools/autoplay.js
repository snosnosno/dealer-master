// 자동 플레이 — node tools/autoplay.js <일수> <perfect|random> [shot]
// 1일차 영업 중 대타 딜러를 부르고, 2일차는 판정 호출만 하는 「게으른 점장」. 결과 JSON 을 출력한다.
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const { chromium, devices } = require('playwright');
const DAYS = +(process.argv[2] || 1), MODE = process.argv[3] || 'perfect', SHOT = process.argv[4] === 'shot';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(PAGE);
  await page.waitForTimeout(600);
  const P = MODE === 'perfect';
  const seen = {}; const reports = []; let shots = {};
  const shot = async (n) => { if (SHOT && !shots[n]) { shots[n] = 1; await page.screenshot({ path: `v2-${n}.png` }); } };
  await shot('title'); await page.click('[data-go]');
  for (let day = 0; day < DAYS; day++) {
    // 일요일 주간 정산이 떠 있으면 넘긴다 (도전 보상 · 임대료)
    if (await page.$('[data-week]')) {
      seen.weekly = await page.evaluate(() => document.querySelector('.modal').innerText.slice(0, 600));
      await page.click('[data-week]');
    }
    // 오픈 준비
    await shot('shop');
    if (day === 0) {
      await page.evaluate(() => { const G = window.__pub; if (!G.cands.some(c => c.role === 'floor')) G.cands[0] = Object.assign(G.cands[0], { role: 'floor', skill: 75, wage: 180000 }); });
      await page.click('[data-tab="staff"]');
      await shot('staff');
      const fid = await page.evaluate(() => window.__pub.cands.find(c => c.role === 'floor').id);
      await page.click(`[data-hire="${fid}"]`);
      await page.click('[data-tab="shop"]');
    }
    if (day === 1) { const b = page.locator('[data-buy="shuffler"]'); if (await b.isEnabled()) await b.click(); }
    await page.click('[data-tab="chips"]');
    await shot('chips');
    await page.click('[data-chipq]');
    const cq = await page.evaluate(() => window.__pub.current.correct);
    await page.locator('[data-cq]').nth(P ? cq : 0).click();
    await page.click('[data-back]');
    await page.click('[data-tab="dealers"]');
    await shot('dealers');
    await page.click('[data-open]');
    await page.evaluate(() => { window.__pub.speed = 10; });
    for (let i = 0; i < 30000; i++) {
      const st = await page.evaluate(() => {
        const G = window.__pub, q = s => !!document.querySelector(s);
        return { modal: q('#modal .modal'), tasks: G.tasks.length, ch: q('[data-ch]'), ev: q('[data-ev]'), ok: q('[data-ok]'), ms: q('[data-ms]'),
          an: q('[data-an]'), stl: q('[data-st]'), nd: q('[data-next-day]'), close: q('[data-close]'), simT: G.simT,
          walking: !!(G.player.path && G.player.path.length), phase: G.phase };
      });
      if (st.nd) {
        await shot('report');
        reports.push(await page.evaluate(() => ({ absent: window.__pub.absent.map(x => x.name + ':' + x.role), temps: window.__pub.temps.map(x => x.name + ':' + x.role), dealers: window.__pub.dealers.length, s: Object.assign({}, window.__pub.stats), rep: Math.round(window.__pub.rep), bank: window.__pub.bank, winner: window.__pub.winner && window.__pub.winner.name, txt: document.querySelector('.modal').innerText.slice(0, 900) })));
        await page.click('[data-next-day]');
        break;
      }
      if (st.simT > 40 && !st.modal) await shot('floor');
      // 첫날 영업 중 대타 딜러 부르기
      if (day === 0 && st.simT > 30 && !seen.hired && !st.modal) {
        seen.hired = 1;
        await page.click('[data-callstaff]');
        await shot('hire');
        const id = await page.evaluate(() => (window.__pub.onCall.find(x => x.role === 'dealer') || window.__pub.onCall[0]).id);
        await page.click(`[data-hire-temp="${id}"]`);
      }
      // 딜러 없는 테이블이 있으면 쉬는 딜러를 배치
      if (!st.modal && !seen['place' + day]) {
        const empty = await page.evaluate(() => { const G = window.__pub; const t = G.tables.find(t => t.dealer === null && !t.broken); const r = G.dealers.find(d => d.table === null && !d.arriving); return t && r ? t.id : -1; });
        if (empty >= 0) { seen['place' + day] = 1; await page.evaluate((i) => { document.querySelectorAll('.tlabel')[i].click(); }, empty); }
      }
      if (st.ch) { seen.call = (seen.call || 0) + 1; await shot('call');
        const c = await page.evaluate(() => window.__pub.current.correct);
        const n = await page.locator('[data-ch]').count();
        await page.locator('[data-ch]').nth(P ? c : Math.floor(Math.random() * n)).click();
      } else if (st.ev) { seen.event = (seen.event || 0) + 1; await shot('event');
        const c = await page.evaluate(() => window.__pub.current.correct);
        const n = await page.locator('[data-ev]').count();
        await page.locator('[data-ev]').nth(P ? c : Math.floor(Math.random() * n)).click();
      } else if (st.ok) { await page.click('[data-ok]'); }
      else if (st.ms) { seen.pos = (seen.pos || 0) + 1; await shot('pos');
        const p = await page.evaluate(() => window.__pub.current.data.pos);
        if (P) { await page.click(`[data-ms="${p.btn}"]`); if (p.sbLive) await page.click(`[data-ms="${p.sbSeat}"]`); else await page.click('[data-nosb]'); await page.click(`[data-ms="${p.bb}"]`); }
        else { for (const s of [0, 1, 2]) await page.click(`[data-ms="${s}"]`); }
        await page.click('[data-confirm]');
      } else if (st.an) { seen.ann = (seen.ann || 0) + 1; await shot('announce');
        const c = await page.evaluate(() => window.__pub.current.correct);
        await page.locator('[data-an]').nth(P ? c : 0).click();
      } else if (st.stl) { await shot('settle');
        const c = await page.evaluate(() => window.__pub.current.correct);
        await page.locator('[data-st]').nth(P ? c : 0).click();
      } else if (await page.$('[data-place]')) { await page.click('[data-place]'); seen.placed = (seen.placed || 0) + 1; }
      else if (st.close) { await page.click('[data-close]'); }
      else if (st.modal) { await page.waitForTimeout(20); }
      else if (st.tasks && !st.walking) {
        // 아나운스 → 호출 → 밸런싱 → 청소 순
        const lazy = day === 1;
        const id = await page.evaluate((lazy) => { const order = { announce: 0, call: 1, event: 2, balance: 3, spill: 4 }; const ts = window.__pub.tasks.filter(k => !lazy || k.kind === 'call').sort((a, b) => order[a.kind] - order[b.kind]); return ts.length ? ts[0].id : null; }, lazy);
        if (id === null) { await page.waitForTimeout(25); continue; }
        seen.taskClicks = (seen.taskClicks || 0) + 1;
        try { await page.locator(`[data-task="${id}"]`).click({ timeout: 1500 }); } catch (e) { seen.clickMiss = (seen.clickMiss || 0) + 1; }
      } else if (!st.walking && P) {
        await page.evaluate(() => window.__pub.goCounter());
        await page.waitForTimeout(40);
      } else await page.waitForTimeout(25);
    }
  }
  console.log(JSON.stringify({ seen, reports, errors: errors.slice(0, 8) }, null, 1));
  await browser.close();
})();
