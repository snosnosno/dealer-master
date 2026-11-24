// 업적 · 칭호 점검 — node tools/ach.js [shot]
// 조건 판정(하루 · 주 · 연습실 · 시즌) · 같은 업적은 한 번만 · 손상된 기록 · 업적 화면 · 칭호 고르기/내리기 · 타이틀 · 일시정지 버튼
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const { chromium, devices } = require('playwright');
const SHOT = process.argv[2] === 'shot';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [], bad = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(PAGE);
  await page.waitForTimeout(500);
  const G = (f, a) => page.evaluate(f, a);
  const expect = (name, cond, info) => { if (!cond) bad.push(name + (info ? ' — ' + JSON.stringify(info) : '')); };

  // 1. 깨끗한 기록에서 하루 마감 조건
  await G(() => localStorage.removeItem('pubsim.records'));
  const day = await G(() => {
    const P = window.__pub;
    const s = { right: 6, wrong: 0, missed: 0, maxCombo: 6, quick: 3, ann: 12, annByStaff: 1, annWrong: 0, annMiss: 0, cleaned: 1, spillSec: 50,
      entries: 25, drinks: 20, lost: 0, queueLeave: 0, events: [{ ok: true }] };
    return P.__checkAch('day', { s, stars: 3, grade: 'S', net: 500000, avgSat: 70, winner: { name: 'x' } }).map(a => a.id);
  });
  for (const id of ['first_close', 'first_win', 'perfect', 'grade_s', 'flawless', 'combo5', 'announcer', 'noleave']) expect('day:' + id, day.includes(id), day);
  for (const id of ['combo10', 'quick10', 'dry', 'packed', 'busybar', 'fixer', 'million', 'smile', 'week3', 'clear']) expect('day-not:' + id, !day.includes(id), day);
  // 같은 조건 두 번째 — 새로 딴 게 없어야
  const again = await G(() => window.__pub.__checkAch('day', { s: { right: 6, wrong: 0, missed: 0, maxCombo: 6, quick: 0, ann: 0, annByStaff: 0, annWrong: 0, annMiss: 0, cleaned: 0, spillSec: 0, entries: 0, drinks: 0, lost: 0, queueLeave: 0, events: [] }, stars: 3, grade: 'S', net: 0, avgSat: 0, winner: {} }).map(a => a.id));
  expect('no-repeat', again.length === 0, again);
  // 2. 주 · 시즌 · 연습실
  const wk = await G(() => window.__pub.__checkAch('week', { chN: 3, weekNet: 6000000 }).map(a => a.id));
  expect('week', wk.includes('week3') && wk.includes('week5m'), wk);
  const se = await G(() => window.__pub.__checkAch('season', { cleared: true, firstEnd: true }).map(a => a.id));
  expect('season', se.includes('clear') && se.includes('season8'), se);
  await G(() => { const r = JSON.parse(localStorage.getItem('pubsim.records')); r.drillBest = 700; localStorage.setItem('pubsim.records', JSON.stringify(r)); });
  const dr = await G(() => window.__pub.__checkAch('drill').map(a => a.id));
  expect('drill', dr.includes('drill_s') && !dr.includes('famous'), dr);
  // 3. 업적 화면 — 칭호 고르기 · 내리기
  await G(() => window.__pub.__openAch(() => {}));
  const scr = await G(() => ({ got: document.querySelectorAll('.achc.got').length, all: document.querySelectorAll('.achc').length, locked: document.querySelectorAll('.achc[disabled]').length }));
  expect('screen', scr.all === 34 && scr.got >= 13 && scr.locked === scr.all - scr.got, scr);
  if (SHOT) await page.screenshot({ path: 'ach-screen.png' });
  await page.click('[data-atitle="perfect"]');
  const t1 = await G(() => ({ cur: document.querySelector('.achcur').innerText, on: !!document.querySelector('.achc.on[data-atitle="perfect"]'), rec: JSON.parse(localStorage.getItem('pubsim.records')).title }));
  expect('title-set', t1.on && t1.rec === 'perfect' && t1.cur.indexOf('완벽한 밤') >= 0, t1);
  await page.click('[data-atitle="perfect"]');
  const t2 = await G(() => JSON.parse(localStorage.getItem('pubsim.records')).title);
  expect('title-unset', t2 === null, t2);
  await page.click('[data-atitle="grade_s"]');
  // 4. 타이틀 — 칭호 줄 · 업적 버튼
  await page.reload(); await page.waitForTimeout(500);
  const title = await G(() => ({ line: (document.querySelector('.recline') || {}).innerText || '', btn: (document.querySelector('[data-tach]') || {}).innerText || '' }));
  expect('title-line', title.line.indexOf('S 등급') >= 0, title);
  expect('title-btn', /업적 1[0-9]\/34/.test(title.btn), title);
  if (SHOT) await page.screenshot({ path: 'ach-title.png' });
  await page.click('[data-tach]');
  expect('title-open', await G(() => document.querySelectorAll('.achc').length === 34));
  await page.click('[data-back]');
  // 5. 손상된 기록(ach 가 배열) — 깨지지 않고 새로 센다
  await G(() => localStorage.setItem('pubsim.records', JSON.stringify({ seasons: 0, clears: 0, bestRep: 0, bestBank: 0, bankrupt: 0, ach: [1, 2], title: 'nope' })));
  const broken = await G(() => ({ got: Object.keys(window.__pub.__achGot()).length, fresh: window.__pub.__checkAch('week', { chN: 3, weekNet: 0 }).map(a => a.id) }));
  expect('broken', broken.got === 0 && broken.fresh.includes('week3'), broken);
  await page.reload(); await page.waitForTimeout(500);
  expect('broken-title', await G(() => !!document.querySelector('[data-tach]')));
  // 6. 일시정지 메뉴 버튼
  await page.click('[data-go]');
  await page.click('[data-tab="dealers"]');
  await page.click('[data-open]');
  await page.waitForTimeout(800);
  await G(() => window.__pub && document.querySelector('[data-close]') && document.querySelector('[data-close]').click());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const pauseBtn = await G(() => !!document.querySelector('[data-mach]'));
  expect('pause-btn', pauseBtn);
  if (pauseBtn) { await page.click('[data-mach]'); expect('pause-open', await G(() => document.querySelectorAll('.achc').length === 34)); await page.click('[data-back]'); expect('pause-back', await G(() => !!document.querySelector('[data-resume]'))); }
  console.log(JSON.stringify({ day, wk, se, dr, scr, title, broken, bad, errors }, null, 1));
  await browser.close();
})();
