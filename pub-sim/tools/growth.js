// 성장 길 · 난이도 점검 — node tools/growth.js [shot]
// 멘토 지정 · 세미나 · 실전 경험치(판정 · 속도 · 응대) · 단계 상승 보고, 그리고 주차별 난이도(돌발 건수 · 진상 비율)
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const { chromium, devices } = require('playwright');
const SHOT = process.argv[2] === 'shot';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext(SHOT ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(PAGE);
  await page.waitForTimeout(500);
  const G = (f, a) => page.evaluate(f, a);
  const out = {};
  // 난이도 — 주차별 하루 돌발 건수 평균 · 진상 비율
  out.diff = await G(() => {
    const G = window.__pub, keep = G.day, r = {};
    [2, 15, 29, 43].forEach(d => {
      G.day = d;
      let ev = 0, rude = 0;
      for (let i = 0; i < 400; i++) { ev += G.__plan().length; if (G.__type() === 'rude') rude++; }
      r['day' + d] = { k: Math.round(G.__diff() * 100) / 100, events: Math.round(ev / 40) / 10, rude: Math.round(rude / 4) };
    });
    G.day = keep; return r;
  });
  await page.click('[data-go]');
  await page.click('[data-tab="dealers"]');
  out.xpBars = await page.locator('.xpbar').count();
  out.mentorDisabledAtStart = await page.locator('[data-mentor][disabled]').count();
  // 민준을 판정 2단계로 → 지호에게 멘토로
  await G(() => { window.__pub.roster[0].train = { j: 2, s: 0, v: 0 }; window.__pub.roster[2].xp = { j: 90, s: 0, v: 0 }; });
  await page.click('[data-tab="dealers"]');
  await page.click('[data-mentor="3"]');
  out.mentor = await G(() => window.__pub.roster[2].mentor);
  // 세미나 — 서연
  const bank0 = await G(() => window.__pub.bank);
  await page.click('[data-sem="2"]');
  out.seminar = await G((b0) => ({ cost: b0 - window.__pub.bank, tr: window.__pub.roster[1].train, again: document.querySelector('[data-sem="2"]').disabled }), bank0);
  if (SHOT) await page.screenshot({ path: 'growth-dealers.png' });
  // 하루 영업 — 판정 정답 · 아나운스 정답
  await page.click('[data-open]');
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
  out.report = [(txt.match(/🎓 단계 상승[^\n]*/) || ['(단계 상승 없음)'])[0], (txt.match(/🤝 멘토링[^\n]*/) || ['(멘토링 없음)'])[0]];
  out.after = await G(() => window.__pub.roster.filter(s => s.role === 'dealer').map(s => s.name + ' 단계 ' + JSON.stringify(s.train) + ' 경험 ' + JSON.stringify(s.xp || {})));
  // 월요일(29일차) 오픈 준비 — 난이도 막대 · 안내
  await G(() => { window.__pub.day = 29; });
  await page.click('[data-next-day]');
  out.monday = await G(() => { const b = document.querySelector('.diffbox'); return b ? b.innerText.replace(/\n/g, ' / ') : null; });
  if (SHOT) await page.screenshot({ path: 'growth-monday.png' });
  console.log(JSON.stringify({ out, errors: errors.slice(0, 8) }, null, 1));
  await browser.close();
})();
