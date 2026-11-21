// 매장 꾸미기 점검 — node tools/decor.js [shot]
// 테마 구매 · 장식 구매 · 배치 모드(실제 탭으로 놓고 회수) · 금지 구역 · 저장 후 이어하기 · 영업 하루
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
  await G(() => { window.__pub.bank = 5000000; });
  await page.click('[data-tab="decor"]');
  await page.click('[data-theme-buy="neon"]');
  for (const k of ['plant', 'plant', 'sofa', 'artwall', 'trophy']) await page.click(`[data-dbuy="${k}"]`);
  out.shop = await G(() => ({ theme: window.__pub.theme, inv: window.__pub.decorInv, bank: window.__pub.bank, trophyBtn: document.querySelector('[data-dbuy="trophy"]').disabled }));
  if (SHOT) await page.screenshot({ path: 'decor-tab.png' });
  await page.click('[data-goplace]');
  await page.waitForTimeout(300);
  // 화면 가운데를 실제로 탭 — 바닥에 놓인다
  const vp = page.viewportSize();
  await page.mouse.click(vp.width / 2, vp.height * 0.42);
  await page.waitForTimeout(200);
  out.tap1 = await G(() => window.__pub.placed.map(p => p.kind + '@' + p.x + ',' + p.z));
  // 같은 자리를 다시 탭 — 회수
  await page.mouse.click(vp.width / 2, vp.height * 0.42);
  await page.waitForTimeout(200);
  out.tap2 = await G(() => window.__pub.placed.length);
  // 금지 구역 · 허용 구역 (논리)
  out.blocked = await G(() => [window.__pub.placeAt('plant', -4.4, 0.4), window.__pub.placeAt('plant', 8.2, 3.5), window.__pub.placeAt('plant', 0, -6)]);
  out.allowed = await G(() => [window.__pub.placeAt('sofa', -7, -3.4), window.__pub.placeAt('plant', 0, 3), window.__pub.placeAt('artwall', -0.5, -3.2), window.__pub.placeAt('trophy', 2.5, 6.5), window.__pub.placeAt('plant', 0.5, 3.2)]);
  if (SHOT) await page.screenshot({ path: 'decor-place.png' });
  await page.click('[data-pdone]');
  out.afterDone = await G(() => ({ phase: window.__pub.phase, placed: window.__pub.placed.length }));
  // 저장 → 새로고침 → 이어하기
  await G(() => { window.__pub.wins = 3; });
  await page.click('[data-tab="dealers"]');
  await page.click('[data-open]');
  await G(() => { window.__pub.speed = 4; window.__pub.evPlan = []; });
  await page.waitForTimeout(12000);
  // 장식 근처 손님 만족: 소파(-7,-3.4) 반경 3 안 바 손님
  out.nearSat = await G(() => { const G = window.__pub; return G.customers.filter(c => c.alive && Math.hypot(c.mesh.position.x + 7, c.mesh.position.z + 3.4) < 3).map(c => Math.round(c.sat)); });
  if (SHOT) await page.screenshot({ path: 'decor-open.png' });
  await G(() => { window.__pub.saveGameNow && window.__pub.saveGameNow(); });
  await page.reload();
  await page.waitForTimeout(600);
  const cont = await page.$('[data-cont]');
  out.saved = !!cont;
  if (cont) {
    await cont.click();
    out.loaded = await G(() => ({ theme: window.__pub.theme, placed: window.__pub.placed.length, wins: window.__pub.wins, neon: true }));
  }
  console.log(JSON.stringify({ out, errors: errors.slice(0, 8) }, null, 1));
  await browser.close();
})();
