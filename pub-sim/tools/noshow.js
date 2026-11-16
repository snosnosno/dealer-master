// 노쇼 강제 — 배치 딜러 노쇼 → 쉬는 딜러 대체, 둘 다 노쇼 → 빈 테이블 → 대타 딜러 도착 · 자동 배치 — node tools/noshow.js
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(PAGE);
  await page.waitForTimeout(500);
  await page.click('[data-go]');
  // 경우 1: 1번 테이블 민준 노쇼, 쉬는 지호가 대신
  await page.evaluate(() => { const G = window.__pub; G.day = 2; G.roster.find(x => x.id === 1).rel = 0; });
  await page.click('[data-tab="dealers"]');
  await page.click('[data-open]');
  await page.waitForTimeout(400);
  const c1 = await page.evaluate(() => { const G = window.__pub; return { absent: G.absent.map(x => x.name), tables: G.tables.map(t => t.dealer === null ? null : G.dealers[t.dealer].name), toast: document.querySelector('#toast').innerText }; });
  await page.screenshot({ path: 'noshow1.png' });
  // 경우 2: 민준 · 지호 둘 다 노쇼 → 1번 테이블 빈다 → 대타 딜러를 부르면 도착해 앉는다
  await page.evaluate(() => { const G = window.__pub; G.phase = 'prep'; G.roster.find(x => x.id === 3).rel = 0; });
  await page.evaluate(() => { document.querySelector('#modal').innerHTML = ''; window.__pub.modal = null; });
  await page.evaluate(() => window.__pub.goCounter && 0);
  // 오픈 준비 화면으로 다시
  await page.evaluate(() => { window.__pub.phase = 'title'; });
  await page.reload(); await page.waitForTimeout(500);
  await page.click('[data-go]');
  await page.evaluate(() => { const G = window.__pub; G.day = 2; G.roster.find(x => x.id === 1).rel = 0; G.roster.find(x => x.id === 3).rel = 0; });
  await page.click('[data-tab="dealers"]');
  await page.click('[data-open]');
  await page.waitForTimeout(400);
  const c2 = await page.evaluate(() => { const G = window.__pub; return { absent: G.absent.map(x => x.name), tables: G.tables.map(t => t.dealer === null ? null : G.dealers[t.dealer].name) }; });
  await page.screenshot({ path: 'noshow2.png' });
  await page.click('[data-callstaff]');
  await page.screenshot({ path: 'noshow-hire.png' });
  const id = await page.evaluate(() => window.__pub.onCall.find(x => x.role === 'dealer').id);
  await page.evaluate(() => { Math.random = (r => () => 0.5)(Math.random); });   // 연락 두절(12%)이 나오지 않게
  await page.click(`[data-hire-temp="${id}"]`);
  await page.evaluate(() => { window.__pub.speed = 4; });
  await page.waitForTimeout(6000);
  const c3 = await page.evaluate(() => { const G = window.__pub; return { tables: G.tables.map(t => t.dealer === null ? null : G.dealers[t.dealer].name), temps: G.temps.map(x => x.name), arriving: G.dealers.filter(d => d.arriving).length }; });
  await page.screenshot({ path: 'noshow3.png' });
  console.log(JSON.stringify({ c1, c2, c3, errors }, null, 1));
  await browser.close();
})();
