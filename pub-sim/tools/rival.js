// 🥊 라이벌 점검 — node tools/rival.js [shot]
// 1주차 소개 · 2주차 수 넷(막기 비용 · 효과 / 그냥 두기 효과) · 손님 도착 배율 · 일요일 대결(승패 · 평판) · 빼가기 결과
// 오픈 준비 상자 버튼 · 주간 정산 화면 · 업적 · 저장/불러오기 · 1.4 저장(라이벌 없음)
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
  await page.goto(PAGE);
  await page.waitForTimeout(500);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload(); await page.waitForTimeout(500);
  const G = (f, a) => page.evaluate(f, a);
  await page.click('[data-go]');
  await page.waitForTimeout(300);
  // 1. 1주차 — 소개만, 수 없음
  out.week1 = await G(() => ({ box: (document.querySelector('.rivalbox') || {}).innerText || '', btn: !!document.querySelector('[data-rv]'), move: window.__pub.rival.move }));
  expect('week1 intro', out.week1.box.indexOf('로열 라운지') >= 0 && !out.week1.btn && !out.week1.move, out.week1);
  if (SHOT) await page.screenshot({ path: 'rival-week1.png' });

  // 2. 수 넷 — 막기 / 그냥 두기
  const setMove = (type, status) => G(([type, status]) => {
    const P = window.__pub; P.day = 8; P.bank = 2000000;
    const reg = P.regulars.filter(r => !r.gone).sort((a, b) => a.aff - b.aff)[0];
    while (P.roster.filter(s => s.role === 'dealer').length < 3) { const s = JSON.parse(JSON.stringify(P.roster.find(x => x.role === 'dealer'))); s.id = 900 + P.roster.length; s.name = '테스트' + s.id; P.roster.push(s); }
    const dl = P.roster.filter(s => s.role === 'dealer').sort((a, b) => b.skill - a.skill)[0];
    P.rival = { wins: 0, losses: 0, last: null, move: { week: 2, type, status, target: type === 'poach_reg' ? reg.id : (type === 'poach_staff' ? dl.id : null) } };
    return { regAff: reg.aff, regId: reg.id, dlId: dl.id, dlWage: dl.wage };
  }, [type, status]);
  const costs = await G(() => Object.fromEntries(Object.entries(window.__pub.__rival.moves).map(([k, v]) => [k, v.cost])));
  for (const type of ['clash', 'discount', 'poach_reg', 'poach_staff']) {
    const pre = await setMove(type, 'open');
    await G(() => window.__pub.__prep('shop'));
    const ui = await G(() => ({ box: document.querySelector('.rivalbox').innerText, btns: document.querySelectorAll('[data-rv]').length }));
    expect(type + ' ui', ui.btns === 2 && ui.box.length > 20, ui);
    if (SHOT && type === 'poach_staff') await page.screenshot({ path: 'rival-move.png' });
    const bank0 = await G(() => window.__pub.bank);
    await page.click('[data-rv="1"]');
    const after = await G(([p]) => { const P = window.__pub, r = P.regulars[p.regId], s = P.roster.find(x => x.id === p.dlId); return { bank: P.bank, status: P.rival.move.status, aff: r.aff, wage: s && s.wage, box: document.querySelector('.rivalbox').innerText }; }, [pre]);
    expect(type + ' countered', after.status === 'countered' && after.bank === bank0 - costs[type] && after.box.indexOf('막았다') >= 0, after);
    if (type === 'poach_reg') expect('reg aff +12', after.aff === Math.min(100, pre.regAff + 12), [pre.regAff, after.aff]);
    if (type === 'poach_staff') expect('staff wage +2만', after.wage === pre.dlWage + 20000, [pre.dlWage, after.wage]);
  }
  // 3. 손님 도착 배율 — 그냥 둔 맞불은 토요일만 0.85, 할인은 월~목 0.9, 막으면 1
  await setMove('clash', 'ignored');
  out.arr = await G(() => { const P = window.__pub, k = []; for (const d of [8, 12, 13]) { P.day = d; k.push(P.__rival.arrK()); } P.rival.move.status = 'countered'; P.day = 13; k.push(P.__rival.arrK()); return k; });
  expect('clash arrK', JSON.stringify(out.arr) === JSON.stringify([1, 1, 0.85, 1]), out.arr);
  await setMove('discount', 'open');   // 정하지 않고 영업 — 그냥 둔 것과 같다
  out.arr2 = await G(() => { const P = window.__pub, k = []; for (const d of [8, 11, 12, 13]) { P.day = d; k.push(P.__rival.arrK()); } return k; });
  expect('discount arrK', JSON.stringify(out.arr2) === JSON.stringify([0.9, 0.9, 1, 1]), out.arr2);

  // 4. 일요일 대결 — 이김 · 짐 · 평판
  const settle = (entries) => G((entries) => { const P = window.__pub; P.day = 14; P.weekLog = [{ day: 8, entries, net: 0, stars: 0, err: 0, drinks: 0, win: true, evOk: 0 }]; P.rep = 50; const r = P.__rival.settle(2); return { r, rep: P.rep, w: P.rival.wins, l: P.rival.losses }; }, entries);
  await setMove('clash', 'countered');
  const win = await settle(900), lose = await settle(10);
  expect('win', win.r.win && win.rep === 52 && win.w === 1, win);
  expect('lose', !lose.r.win && lose.rep === 49 && lose.l === 1, lose);
  out.base = await G(() => [1, 2, 4, 8].map(w => window.__pub.__rival.base(w)));
  expect('base rises', out.base[3] > out.base[0], out.base);
  // 5. 빼가기 그냥 둠 — ♥60 아래 단골은 옮기고, 사기 60 아래 딜러는 떠난다
  const pr = await setMove('poach_reg', 'ignored');
  const reg = await G(([p]) => { const P = window.__pub; P.regulars[p.regId].aff = 40; P.day = 14; P.weekLog = []; const r = P.__rival.settle(2); return { gone: P.regulars[p.regId].gone, lines: r.lines }; }, [pr]);
  expect('poach reg gone', reg.gone === true && reg.lines.join('').indexOf('옮겼다') >= 0, reg);
  const ps = await setMove('poach_staff', 'ignored');
  const st = await G(([p]) => { const P = window.__pub, s = P.roster.find(x => x.id === p.dlId); s.morale = 30; P.cfg.assign = [p.dlId, null, null]; P.day = 14; P.weekLog = []; const r = P.__rival.settle(2); return { left: !P.roster.some(x => x.id === p.dlId), assign: P.cfg.assign, lines: r.lines }; }, [ps]);
  expect('poach staff left', st.left && st.assign[0] === null, st);
  const ps2 = await setMove('poach_staff', 'ignored');
  const st2 = await G(([p]) => { const P = window.__pub, s = P.roster.find(x => x.id === p.dlId); s.morale = 80; P.weekLog = []; const r = P.__rival.settle(2); return { stay: P.roster.some(x => x.id === p.dlId), lines: r.lines }; }, [ps2]);
  expect('high morale stays', st2.stay, st2);

  // 6. 주간 정산 화면 + 업적
  await setMove('discount', 'ignored');
  out.weekly = await G(() => { const P = window.__pub; P.day = 14; P.weekLog = [{ day: 8, wk: '월', name: '데일리', entries: 999, net: 100000, stars: 2, err: 0, drinks: 10, win: true, evOk: 0 }]; P.__weekly();
    return { res: (document.querySelector('.rivalres') || {}).innerText || '', ach: (document.querySelector('.achnew') || {}).innerText || '' }; });
  expect('weekly rival', out.weekly.res.indexOf('이겼다') >= 0 && out.weekly.res.indexOf('999') >= 0, out.weekly);
  expect('weekly ach', out.weekly.ach.indexOf('첫 승리') >= 0, out.weekly);
  if (SHOT) await page.screenshot({ path: 'rival-weekly.png' });
  // 7. 저장 · 불러오기 · 1.4 저장
  out.saved = await G(() => { const P = window.__pub; P.__save(); return JSON.parse(localStorage.getItem('pubsim.save.v1')).rival; });
  expect('saved', out.saved && typeof out.saved.wins === 'number', out.saved);
  await page.reload(); await page.waitForTimeout(500);
  await page.click('[data-cont]'); await page.waitForTimeout(300);
  out.loaded = await G(() => window.__pub.rival);
  expect('loaded', out.loaded.wins === out.saved.wins && out.loaded.losses === out.saved.losses, [out.saved, out.loaded]);
  await G(() => { const s = JSON.parse(localStorage.getItem('pubsim.save.v1')); delete s.rival; localStorage.setItem('pubsim.save.v1', JSON.stringify(s)); });
  await page.reload(); await page.waitForTimeout(500);
  await page.click('[data-cont]'); await page.waitForTimeout(300);
  out.old = await G(() => ({ r: window.__pub.rival, box: !!document.querySelector('.rivalbox') }));
  expect('old save', out.old.r.wins === 0 && out.old.box, out.old);
  console.log(JSON.stringify({ out, bad, errors }, null, 1));
  await browser.close();
})();
