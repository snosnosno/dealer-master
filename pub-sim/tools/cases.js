// 케이스 판정 점검 — node tools/cases.js [shot]
// 27건을 하나씩 강제로 띄워 정답 · 오답을 눌러 본다: 선택지 셋 · 이름 채움({A} 없음) · 「원문 확인 전」 · 콤보/평판 반영
// 1.3: 상황 글 줄 나눔(.scene) · 판정 도감(맞히면 +1, 오답은 그대로) · 타이틀 도감 버튼
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
  await page.click('[data-go]');
  await page.click('[data-tab="dealers"]');
  await page.click('[data-open]');
  await G(() => { window.__pub.evPlan = []; });
  await page.waitForTimeout(1500);
  const ids = await G(() => window.__pub.__cases.map(c => c.n));
  const res = [];
  for (const [i, n] of ids.entries()) {
    const wrong = i % 3 === 2;
    const r = await G(([n, wrong]) => {
      const G = window.__pub;
      G.tasks.filter(k => k.kind === 'call').forEach(k => { G.tables[k.table].call = null; });
      G.tasks = G.tasks.filter(k => k.kind !== 'call');
      G.__case(0, n);
      const task = G.tasks.find(k => k.kind === 'call' && k.type === 'case');
      return { tagged: !!task, label: document.body.innerText.indexOf(G.__cases.find(c => c.n === n).tag) >= 0 };
    }, [n, wrong]);
    // 점장을 걸려 보내지 않고 바로 연다 — 판정 창만 본다
    const m = await G(([n, wrong]) => {
      const G = window.__pub, task = G.tasks.find(k => k.kind === 'call' && k.type === 'case');
      G.__open ? G.__open(task) : null;
      const md = document.querySelector('.modal');
      if (!md || !G.current) return { open: false };
      const btns = [...document.querySelectorAll('[data-ch]')];
      const txt = md.innerText, scene = !!md.querySelector('.scene');
      const c = G.current.correct;
      const pickIx = wrong ? (c + 1) % btns.length : c;
      const rep0 = G.rep;
      btns[pickIx].click();
      const after = document.querySelector('.modal').innerText, dexnew = !!document.querySelector('.dexnew');
      const ok = document.querySelector('[data-ok]'); if (ok) ok.click();
      return { open: true, btns: btns.length, braces: /\{[A-E]\}/.test(txt + after), unverified: after.indexOf('원문 확인 전') >= 0,
        cite: (after.match(/케이스 \d+/) || [''])[0], repDelta: Math.round((G.rep - rep0) * 10) / 10, wrong, scene, dexnew };
    }, [n, wrong]);
    res.push(Object.assign({ n }, r, m));
    if (SHOT && n === 17) await page.screenshot({ path: 'cases-17.png' });
  }
  const bad = res.filter(r => !r.open || r.btns !== 3 || r.braces || !r.unverified || r.cite !== '케이스 ' + r.n || (r.wrong ? r.repDelta >= 0 : r.repDelta < 0) || !r.scene || r.dexnew === r.wrong);
  // 믹스 테이블 — nlh 케이스가 나오지 않는다
  const mix = await G(() => { const G = window.__pub; const m0 = G.owned.mix; G.owned.mix = true; const t = G.tables.find(t => G.__isMix(t));
    const s = []; for (let i = 0; i < 60; i++) { const d = G.__case(t.id); const c = G.__cases.find(c => c.n === d.id); if (!c) return JSON.stringify(d); s.push(c.nlh ? 'X' : '.'); }
    G.tasks = G.tasks.filter(k => k.kind !== 'call'); G.tables.forEach(t => t.call = null); G.owned.mix = m0; return s.join(''); });
  const train = await G(() => { const q = window.__pub.__caseQ(); return { opts: q.opts.length, correct: q.correct, braces: /\{[A-E]\}/.test(q.body + q.opts.join('') + q.why) }; });
  const dex = await G(() => JSON.parse(localStorage.getItem('pubsim.records') || '{}').cases || []);
  // 일시정지 → 도감
  await G(() => { const G = window.__pub; G.tasks = G.tasks.filter(k => k.kind !== 'call'); G.tables.forEach(t => t.call = null); });
  await page.click('[data-pause]'); await page.click('[data-mdex]');
  const dexView = await G(() => ({ cells: document.querySelectorAll('.dexc').length, got: document.querySelectorAll('.dexc.got').length }));
  if (SHOT) await page.screenshot({ path: 'cases-dex.png' });
  console.log(JSON.stringify({ total: res.length, bad, dex: dex.length, expectDex: res.filter(r => !r.wrong).length, dexView, sample: res.slice(0, 3), mix, train, errors: errors.slice(0, 8) }, null, 1));
  await browser.close();
})();
