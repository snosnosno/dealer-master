// 자동 플레이 — node tools/autoplay.js <일수> <perfect|human|random> [shot]   (human: HUMAN_ACC=0.75 기본)
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
  // human: 사람처럼 4번 중 3번 맞힌다(HUMAN_ACC 로 바꿈) — 밸런스를 perfect(위) · random(아래) 사이에서 잰다
  const ACC = P ? 1 : MODE === 'human' ? (+process.env.HUMAN_ACC || 0.75) : 0;
  const pickIx = (c, n, randomIx) => {
    if (MODE === 'random') return randomIx;
    if (Math.random() < ACC) return c;
    return (c + 1 + Math.floor(Math.random() * (n - 1))) % n;   // 틀릴 땐 오답 중에서
  };
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
    await page.locator('[data-cq]').nth(pickIx(cq, await page.locator('[data-cq]').count(), 0)).click();
    await page.click('[data-back]');
    await page.click('[data-tab="dealers"]');
    await shot('dealers');
    await page.click('[data-open]');
    // 느린 컨테이너(소프트웨어 그래픽 ~8fps)에서는 10배속을 봇이 못 따라가 호출을 다 놓친다 — fps 를 재서 배속을 고른다. AP_SPEED 로 고정 가능
    const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); (function f() { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); })(); }));
    const speed = +process.env.AP_SPEED || (fps < 20 ? 3 : 10);
    seen.speed = speed; seen.fps = fps;
    await page.evaluate((s) => { window.__pub.speed = s; }, speed);
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
        await page.locator('[data-ch]').nth(pickIx(c, n, Math.floor(Math.random() * n))).click();
      } else if (st.ev) { seen.event = (seen.event || 0) + 1; await shot('event');
        const c = await page.evaluate(() => window.__pub.current.correct);
        const n = await page.locator('[data-ev]').count();
        await page.locator('[data-ev]').nth(pickIx(c, n, Math.floor(Math.random() * n))).click();
      } else if (st.ok) { await page.click('[data-ok]'); }
      else if (st.ms) { seen.pos = (seen.pos || 0) + 1; await shot('pos');
        const p = await page.evaluate(() => window.__pub.current.data.pos);
        if (MODE !== 'random' && Math.random() < ACC) { await page.click(`[data-ms="${p.btn}"]`); if (p.sbLive) await page.click(`[data-ms="${p.sbSeat}"]`); else await page.click('[data-nosb]'); await page.click(`[data-ms="${p.bb}"]`); }
        else { for (const s of [0, 1, 2]) await page.click(`[data-ms="${s}"]`); }
        await page.click('[data-confirm]');
      } else if (st.an) { seen.ann = (seen.ann || 0) + 1; await shot('announce');
        const c = await page.evaluate(() => window.__pub.current.correct);
        await page.locator('[data-an]').nth(pickIx(c, await page.locator('[data-an]').count(), 0)).click();
      } else if (st.stl) { await shot('settle');
        const c = await page.evaluate(() => window.__pub.current.correct);
        await page.locator('[data-st]').nth(pickIx(c, await page.locator('[data-st]').count(), 0)).click();
      } else if (await page.$('[data-place]')) { await page.click('[data-place]'); seen.placed = (seen.placed || 0) + 1; }
      else if (st.close) { await page.click('[data-close]'); }
      else if (st.modal) { await page.waitForTimeout(20); }
      else if (st.tasks && !st.walking) {
        // 아나운스 → 호출 → 밸런싱 → 청소 순
        const lazy = day === 1;
        const id = await page.evaluate((lazy) => { const order = { announce: 0, call: 1, event: 2, balance: 3, spill: 4 }; const ts = window.__pub.tasks.filter(k => !lazy || k.kind === 'call').sort((a, b) => order[a.kind] - order[b.kind]); return ts.length ? ts[0].id : null; }, lazy);
        if (id === null) { await page.waitForTimeout(25); continue; }
        seen.taskClicks = (seen.taskClicks || 0) + 1;
        try { await page.locator(`[data-task="${id}"]`).click({ timeout: 5000 }); } catch (e) { seen.clickMiss = (seen.clickMiss || 0) + 1; }
      } else if (!st.walking && MODE !== 'random') {
        await page.evaluate(() => window.__pub.goCounter());
        await page.waitForTimeout(40);
      } else await page.waitForTimeout(25);
    }
  }
  console.log(JSON.stringify({ seen, reports, errors: errors.slice(0, 8) }, null, 1));
  await browser.close();
})();
