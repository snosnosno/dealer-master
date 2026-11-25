// 📖 단골 이야기 · 🏆 시즌 챔피언십 점검 — node tools/story.js [shot]
// 이야기: 막 열림 조건(방문 · ♥) · 하루 하나 · 대답 효과(♥ · 평판 · 사기) · {fav} · 3막 선물 · 떠난 단골 제외 · 업적
// 챔피언십: 8주차 토요일 · 포인트(방문 +1 · 우승 +10) · 상위 여섯 도착 · 시즌 챔피언 · 보고서 줄 · 저장/불러오기
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const { chromium, devices } = require('playwright');
const SHOT = process.argv[2] === 'shot';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [], bad = [], out = {};
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const expect = (name, cond, info) => { if (!cond) bad.push(name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); };
  await page.goto(PAGE); await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForTimeout(500);
  const G = (f, a) => page.evaluate(f, a);
  await page.click('[data-go]'); await page.waitForTimeout(300);

  // 1. 처음엔 이야기가 없다(방문 0)
  out.none = await G(() => !!document.querySelector('.storybox'));
  expect('no story at start', !out.none);
  // 2. 1막 — 방문 2
  await G(() => { const P = window.__pub; P.regulars.forEach(r => { r.visits = 0; }); P.regulars[0].visits = 2; P.regulars[0].aff = 50; P.__prep('shop'); });
  out.act1 = await G(() => ({ box: (document.querySelector('.storybox') || {}).innerText || '', btns: document.querySelectorAll('[data-sty]').length }));
  expect('act1 shown', out.act1.box.indexOf('1막') >= 0 && out.act1.box.indexOf('강민수') >= 0 && out.act1.btns === 2, out.act1);
  if (SHOT) await page.screenshot({ path: 'story-act1.png' });
  await page.click('[data-sty="0"]');
  out.after1 = await G(() => { const P = window.__pub, r = P.regulars[0]; return { story: r.story, aff: r.aff, box: !!document.querySelector('.storybox'), storyDay: P.storyDay, day: P.day }; });
  expect('act1 picked', out.after1.story === 1 && out.after1.aff === 56 && !out.after1.box && out.after1.storyDay === out.after1.day, out.after1);
  // 3. 하루 하나 — 2막 조건을 채워도 같은 날엔 안 뜬다
  await G(() => { const P = window.__pub, r = P.regulars[0]; r.visits = 5; r.aff = 70; P.__prep('shop'); });
  expect('one per day', !(await G(() => !!document.querySelector('.storybox'))));
  // 4. 다음 날 — 2막, 평판 대답
  await G(() => { const P = window.__pub; P.day += 1; P.__prep('shop'); });
  out.act2 = await G(() => (document.querySelector('.storybox') || {}).innerText || '');
  expect('act2 shown', out.act2.indexOf('2막') >= 0, out.act2);
  const rep0 = await G(() => window.__pub.rep);
  await page.click('[data-sty="1"]');
  out.after2 = await G(() => ({ story: window.__pub.regulars[0].story, rep: window.__pub.rep }));
  expect('act2 rep +1', out.after2.story === 2 && Math.abs(out.after2.rep - Math.min(100, rep0 + 1)) < 1e-9, [rep0, out.after2]);
  // 5. 3막 — ♥75 아래면 안 열린다, 채우면 선물
  await G(() => { const P = window.__pub, r = P.regulars[0]; P.day += 1; r.visits = 8; r.aff = 70; P.__prep('shop'); });
  expect('act3 needs aff', !(await G(() => !!document.querySelector('.storybox'))));
  await G(() => { const P = window.__pub; P.regulars[0].aff = 80; P.__prep('shop'); });
  const inv0 = await G(() => window.__pub.decorInv.trophy || 0);
  await page.click('[data-sty="0"]');
  out.after3 = await G(() => ({ story: window.__pub.regulars[0].story, inv: window.__pub.decorInv.trophy || 0, toast: document.querySelector('#toast').innerText }));
  expect('act3 gift', out.after3.story === 3 && out.after3.inv === inv0 + 1 && out.after3.toast.indexOf('선물') >= 0, out.after3);
  // 6. {fav} 채움 · 떠난 단골 제외 · 사기 효과
  await G(() => { const P = window.__pub; P.day += 1; const r = P.regulars[5]; r.visits = 2; r.aff = 50; r.fav = '🍷'; P.__prep('shop'); });
  out.fav = await G(() => [...document.querySelectorAll('[data-sty]')].map(b => b.innerText).join(' | '));
  expect('fav filled', out.fav.indexOf('🍷') >= 0 && out.fav.indexOf('{fav}') < 0, out.fav);
  await G(() => { const P = window.__pub; P.day += 1; P.regulars[5].story = 3; const r = P.regulars[2]; r.visits = 2; r.gone = true; P.__prep('shop'); });
  expect('gone skipped', !(await G(() => !!document.querySelector('.storybox'))));
  await G(() => { const P = window.__pub; P.regulars[2].gone = false; P.roster.forEach(s => { s.morale = 50; }); P.__prep('shop'); });
  await page.click('[data-sty="0"]');   // 박지훈 1막 첫 대답 — 사기 +3
  out.morale = await G(() => window.__pub.roster.map(s => s.morale));
  expect('morale +3', out.morale.every(v => v === 53), out.morale);
  // 7. 업적 — 이야기 끝까지
  const ach = await G(() => window.__pub.__checkAch('day', { s: { right: 0, wrong: 0, missed: 0, maxCombo: 0, quick: 0, ann: 0, annByStaff: 0, annWrong: 0, annMiss: 0, cleaned: 0, spillSec: 0, entries: 0, drinks: 0, lost: 0, queueLeave: 0, events: [] }, stars: 0, grade: 'C', net: 0, avgSat: 0, winner: null }).map(a => a.id));
  expect('story3 ach', ach.includes('story3'), ach);

  // 8. 챔피언십 — 포인트 순위 · 8주차 토요일
  await G(() => { const P = window.__pub; P.regulars.forEach((r, i) => { r.gone = false; r.pts = i; r.inHouse = false; }); });
  out.top = await G(() => window.__pub.__champ.top().map(r => r.name));
  expect('top by pts', out.top.length === 6 && out.top[0] === '문하린', out.top);
  await G(() => { const P = window.__pub; P.day = 55; P.bank = 9000000; P.__prep('shop'); });
  out.hero = await G(() => document.querySelector('.hero h2').innerText);
  expect('champ day name', out.hero.indexOf('챔피언십') >= 0, out.hero);
  await page.click('[data-tab="dealers"]');
  await page.click('[data-open]');
  await G(() => { window.__pub.speed = 10; window.__pub.evPlan = []; });
  out.sched = await G(() => window.__pub.champArr.map(f => f.id));
  expect('champ scheduled', out.sched.length === 6, out.sched);
  for (let i = 0; i < 160; i++) {
    await page.waitForTimeout(250);
    await G(() => { const c = document.querySelector('[data-close]') || document.querySelector('[data-ok]'); if (c) c.click(); });
    if (!(await G(() => window.__pub.champArr.length))) break;
  }
  out.arrived = await G(() => { const P = window.__pub, names = P.customers.filter(c => c.reg).map(c => c.name); return P.__champ.top().filter(r => names.includes(r.name)).length; });
  expect('top six arrived', out.arrived === 6, out.arrived);
  if (SHOT) await page.screenshot({ path: 'story-champ-floor.png' });
  // 보고서 — 단골 우승자 = 시즌 챔피언, 포인트 +10
  out.rep = await G(() => {
    const P = window.__pub, c = P.customers.find(x => x.reg), r = c.reg, pts0 = r.pts, aff0 = r.aff;
    P.winner = c; document.querySelector('#modal').innerHTML = ''; P.modal = null;
    P.__report(true);
    return { line: (document.querySelector('.champline') || {}).innerText || '', pts: r.pts - pts0, aff: r.aff - aff0, champ: P.champion, ach: (document.querySelector('.achnew') || {}).innerText || '' };
  });
  expect('champion line', out.rep.line.indexOf('시즌 챔피언') >= 0 && out.rep.champ && out.rep.champ.reg && out.rep.champ.week === 8, out.rep);
  expect('winner pts +10', out.rep.pts === 10, out.rep);
  expect('champ ach', out.rep.ach.indexOf('챔피언') >= 0, out.rep);
  if (SHOT) await page.screenshot({ path: 'story-champ-report.png' });
  // 9. 저장 · 불러오기 (보고서가 저장한다)
  out.saved = await G(() => { const s = JSON.parse(localStorage.getItem('pubsim.save.v1')); return { champ: s.champion, pts: s.regulars.map(r => r.pts), story: s.regulars[0].story }; });
  expect('saved', out.saved.champ && out.saved.story === 3 && out.saved.pts.every(p => typeof p === 'number'), out.saved);
  await G(() => { const s = JSON.parse(localStorage.getItem('pubsim.save.v1')); delete s.champion; delete s.storyDay; s.regulars.forEach(r => { delete r.pts; delete r.story; }); localStorage.setItem('pubsim.save.v1', JSON.stringify(s)); });
  await page.reload(); await page.waitForTimeout(500);
  await page.click('[data-cont]'); await page.waitForTimeout(300);
  out.old = await G(() => ({ champ: window.__pub.champion, pts: window.__pub.regulars.map(r => r.pts), story: window.__pub.regulars.map(r => r.story) }));
  expect('old save', out.old.champ === null && out.old.pts.every(p => p === 0) && out.old.story.every(s => s === 0), out.old);
  // 이어하기는 8주차 일요일 — 주간 정산 → 시즌 결과 → 계속 운영
  if (await page.$('[data-week]')) { await page.click('[data-week]'); await page.waitForTimeout(300); }
  if (await page.$('[data-more]')) { out.seasonEnd = await G(() => document.querySelector('.modal').innerText.slice(0, 400)); await page.click('[data-more]'); await page.waitForTimeout(300); }
  await page.click('[data-tab="regs"]');
  out.tab = await G(() => (document.querySelector('.ptsbox') || {}).innerText || '');
  expect('regs tab pts', out.tab.indexOf('시즌 포인트') >= 0, out.tab);
  if (SHOT) await page.screenshot({ path: 'story-regs.png' });
  console.log(JSON.stringify({ out, bad, errors }, null, 1));
  await browser.close();
})();
