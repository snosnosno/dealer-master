// 출시 껍데기 점검 — node tools/release.js [shot]
// 타이틀(버전 · 링크) · 설정(저장 · 반영) · 도움말 · 만든 사람 · 일시정지(❚❚ · Esc) · 타이틀로 · 손상된 저장 · 기록 줄 · 오류 안전망
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
  out.title = await G(() => ({ kicker: document.querySelector('.titlecard .kicker').textContent, links: [...document.querySelectorAll('.titlefoot button')].map(b => b.textContent) }));
  if (SHOT) await page.screenshot({ path: 'rel-title.png' });
  // 설정 — 그래픽 가볍게 · 음악 끔 · 잡담 끔
  await page.click('[data-tset]');
  await page.click('[data-set="quality"][data-val="\\"low\\""]');
  await page.click('[data-set="music"][data-val="0"]');
  await page.click('[data-set="talk"][data-val="false"]');
  out.settings = await G(() => ({ stored: JSON.parse(localStorage.getItem('pubsim.settings')), checked: [...document.querySelectorAll('[data-set][aria-checked="true"]')].map(b => b.getAttribute('data-set') + '=' + b.textContent) }));
  if (SHOT) await page.screenshot({ path: 'rel-settings.png' });
  await page.click('[data-back]');
  await page.click('[data-thelp]');
  out.help = await page.locator('details.help').count();
  await page.click('[data-back]');
  await page.click('[data-tcred]');
  out.credits = await G(() => document.querySelector('.modal').innerText.slice(0, 80).replace(/\n/g, ' / '));
  await page.click('[data-back]');
  // 영업 → 일시정지(Esc) → 계속 → ❚❚ → 타이틀로
  await page.click('[data-go]');
  await page.click('[data-tab="dealers"]');
  await page.click('[data-open]');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  out.pauseEsc = await G(() => ({ menu: window.__pub.menu, paused: window.__pub.paused, h2: (document.querySelector('.modal h2') || {}).textContent }));
  if (SHOT) await page.screenshot({ path: 'rel-pause.png' });
  const t0 = await G(() => window.__pub.simT);
  await page.waitForTimeout(800);
  out.frozenWhilePaused = await G((t0) => window.__pub.simT === t0, t0);
  await page.keyboard.press('Escape');
  out.resumed = await G(() => ({ menu: window.__pub.menu, paused: window.__pub.paused, modal: !!window.__pub.modal }));
  out.talkOff = await G(() => window.__pub.talkOn === false);
  await page.click('[data-pause]');
  await page.click('[data-mtitle]');
  await page.click('[data-q-yes]');
  out.backToTitle = await G(() => ({ phase: window.__pub.phase, title: !!document.querySelector('.titlecard') }));
  // 오류 안전망 — 일부러 테이블을 망가뜨려 계속 터지게 한다
  await page.click('[data-go]');
  out.newConfirm = !!(await page.$('[data-new-yes]'));   // 이어할 저장이 있으면 덮어쓰기를 한 번 묻는다
  if (out.newConfirm) await page.click('[data-new-yes]');
  await page.click('[data-tab="dealers"]');
  await page.click('[data-open]');
  await page.waitForTimeout(500);
  await G(() => { window.__pub.tables.push(null); });
  await page.waitForTimeout(4000);
  out.safety = await G(() => ({ modal: (document.querySelector('.modal h2') || {}).textContent || null }));
  out.safetyLoggedErrors = errors.length;   // 일부러 낸 오류 — 3개 이하로만 남아야 한다
  errors.length = 0;
  // 손상된 저장 · 기록 줄
  await G(() => { localStorage.setItem('pubsim.save.v1', '{bad'); localStorage.setItem('pubsim.records', JSON.stringify({ seasons: 2, clears: 1, bestRep: 91, bestBank: 6200000, bankrupt: 1 })); });
  await page.reload();
  await page.waitForTimeout(600);
  out.corrupt = await G(() => ({ warn: !!document.querySelector('.modal .warn'), cont: !!document.querySelector('[data-cont]'), rec: (document.querySelector('.recline') || {}).textContent }));
  out.settingsKept = await G(() => JSON.parse(localStorage.getItem('pubsim.settings')).quality);
  console.log(JSON.stringify({ out, errors: errors.slice(0, 8) }, null, 1));
  await browser.close();
})();
