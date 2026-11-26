// 직원 깊이 점검 — node tools/staff.js
// 특성 표시 · 일당 인상 · 속도 교육 · 영업 중 칭찬 · 사기에 따른 정확도 · 마감 때 그만둠 · 다음 날 인상 요청
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(PAGE);
  await page.waitForTimeout(500);
  const G = (f, a) => page.evaluate(f, a);
  const out = {};
  await page.click('[data-go]');
  // 1) 직원 탭 — 특성 · 사기 표시, 일당 인상
  await page.click('[data-tab="dealers"]'); await page.click('[data-tab="staff"]');   // 1.7 — 「사람」 묶음 안의 작은 칸
  out.traitsShown = await page.locator('.trait').count();
  const before = await G(() => { const s = window.__pub.roster[0]; return { wage: s.wage, m: s.morale }; });
  await page.click('[data-raise="1"]');
  out.raise = { before, after: await G(() => { const s = window.__pub.roster[0]; return { wage: s.wage, m: s.morale }; }) };
  // 2) 속도 교육 — 서연(2) 정답 셋
  await page.click('[data-tab="dealers"]');
  await page.click('[data-train="2:s"]');
  for (let k = 0; k < 3; k++) {
    const c = await G(() => window.__pub.current.correct);
    await page.locator('[data-tq]').nth(c).click();
    await page.click('[data-next]');
  }
  out.train = await G(() => ({ tr: window.__pub.roster[1].train, cfg: window.__pub.cfg.train, disabled: document.querySelectorAll('[data-train][disabled]').length }));
  // 3) 사기 조작 → 영업
  await G(() => { const R = window.__pub.roster; R[2].morale = 40; R[3].morale = 15; });
  await page.click('[data-open]');
  await G(() => { window.__pub.evPlan = []; });
  await page.waitForTimeout(800);
  out.acc = await G(() => { const G = window.__pub; const f = d => ({ name: d.name, trait: d.staff.trait, morale: Math.round(d.staff.morale), acc: d.acc }); return G.dealers.map(f); });
  // 칭찬 — 🧑‍💼 창에서 지호(3)
  await page.click('[data-callstaff]');
  await page.click('[data-praise="3"]');
  out.praise = await G(() => ({ m: window.__pub.roster[2].morale, day: window.__pub.praiseDay, again: (function () { return true; })() }));
  await page.click('[data-callstaff]');
  out.praiseDisabled = await page.locator('[data-praise][disabled]').count();
  await page.click('[data-close]');
  // 4) 하루 끝까지 (판정 · 아나운스 정답)
  await G(() => { window.__pub.speed = 10; });
  for (let i = 0; i < 6000; i++) {
    const s = await G(() => { const q = x => !!document.querySelector(x); return { ch: q('[data-ch]'), an: q('[data-an]'), ev: q('[data-ev]'), ms: q('[data-ms]'), ok: q('[data-ok]'), close: q('[data-close]'), st: q('[data-st]'), nd: q('[data-next-day]'), tasks: window.__pub.tasks.filter(k => k.kind === 'call' || k.kind === 'announce').map(k => k.id), walking: !!(window.__pub.player.path && window.__pub.player.path.length) }; });
    if (s.nd) break;
    if (s.st) { const c = await G(() => window.__pub.current.correct); await page.locator('[data-st]').nth(c).click(); continue; }
    if (s.ch || s.an || s.ev) { const sel = s.ch ? '[data-ch]' : (s.an ? '[data-an]' : '[data-ev]'); const c = await G(() => window.__pub.current.correct); await page.locator(sel).nth(c).click(); continue; }
    if (s.ms) { const p = await G(() => window.__pub.current.data.pos); await page.click(`[data-ms="${p.btn}"]`); if (p.sbLive) await page.click(`[data-ms="${p.sbSeat}"]`); else await page.click('[data-nosb]'); await page.click(`[data-ms="${p.bb}"]`); await page.click('[data-confirm]'); continue; }
    if (s.ok) { await page.click('[data-ok]'); continue; }
    if (s.close) { await page.click('[data-close]'); continue; }
    if (s.tasks.length && !s.walking) { try { await page.locator(`[data-task="${s.tasks[0]}"]`).click({ timeout: 800 }); } catch (e) {} continue; }
    await page.waitForTimeout(30);
  }
  const txt = await G(() => { document.querySelectorAll('details.more').forEach(d => { d.open = true; }); return document.querySelector('.modal').innerText; });
  out.report = (txt.match(/😞 그만뒀다[^\n]*/) || ['(없음)'])[0] + ' / ' + (txt.match(/⚠️ 사기가 낮다[^\n]*/) || ['(없음)'])[0];
  out.roster = await G(() => window.__pub.roster.map(s => s.name + ':' + Math.round(s.morale != null ? s.morale : 70)));
  // 5) 다음 날 — 사기 낮은 사람이 인상을 요청한다
  await G(() => { const s = window.__pub.roster.find(x => x.name === '지호'); if (s) s.morale = 30; });
  await page.click('[data-next-day]');
  out.request = await G(() => { const b = document.querySelector('.raisebox'); return b ? b.innerText.replace(/\n/g, ' ') : null; });
  if (out.request) {
    const w0 = await G(() => window.__pub.roster.find(x => x.name === '지호').wage);
    await page.click('[data-rq="1"]');
    out.accept = await G((w0) => { const s = window.__pub.roster.find(x => x.name === '지호'); return { wage: w0 + '→' + s.wage, morale: s.morale, box: !!document.querySelector('.raisebox') }; }, w0);
  }
  console.log(JSON.stringify({ out, errors: errors.slice(0, 8) }, null, 1));
  await browser.close();
})();
