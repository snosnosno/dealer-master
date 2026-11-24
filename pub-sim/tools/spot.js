// 🔍 딜러 실수 잡기 점검 — node tools/spot.js [shot]
// 400건: 정답이 족보를 다시 계산한 결과 · 셈과 같은가 · 선택지 중복 없음 · 정답 위치 · 길이 쏠림
// 실제 호출 창(iPhone SE): 맞힘 · 틀림 · 「원문 확인 전」 없음 · 통계 · 스크롤 없이 들어가나
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const { chromium, devices } = require('playwright');
const SHOT = process.argv[2] === 'shot';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ ...devices['iPhone SE'] });
  const page = await ctx.newPage();
  const errors = [], bad = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(PAGE);
  await page.waitForTimeout(500);
  const G = (f, a) => page.evaluate(f, a);
  await page.click('[data-go]');
  await page.click('[data-tab="dealers"]');
  await page.click('[data-open]');
  await G(() => { window.__pub.evPlan = []; });
  await page.waitForTimeout(1200);

  // 1. 400건 생성 — 정답 다시 계산
  const gen = await G(() => {
    const P = window.__pub, out = { win: 0, side: 0, chop: 0, close: 0, badWin: [], badSide: [], dup: 0, pos: [0, 0, 0, 0], longest: 0, n: 0 };
    for (let i = 0; i < 400; i++) {
      const d = P.__spotGen(0), q = d.q, choices = d.order.map(k => q.opts[k]), correct = d.order.indexOf(q.correct);
      out.n++; out.pos[correct]++;
      if (new Set(choices).size !== choices.length) out.dup++;
      const L = choices.map(c => c.length), mo = Math.max(...L.filter((_, j) => j !== correct));
      if (L[correct] > mo) out.longest++;
      if (d.kind === 'win') {
        out.win++;
        const sc = d.holes.map(h => P.__best(h.concat(d.board)));
        const top = sc.reduce((a, b) => P.__cmp(a, b) >= 0 ? a : b);
        const wins = [0, 1, 2].filter(k => P.__cmp(sc[k], top) === 0);
        const expect = wins.length > 1 ? 3 : wins[0];
        if (expect !== q.correct) out.badWin.push({ wins, qc: q.correct });
        if (wins.length > 1) out.chop++;
        const srt = sc.slice().sort((a, b) => P.__cmp(b, a));
        if (srt[0][0] === srt[1][0]) out.close++;
        if (q.body.indexOf(d.names[d.pushTo]) < 0) out.badWin.push('pushTo-missing');
      } else {
        out.side++;
        const want = d.ask === 'main' ? 3 * d.a : 2 * (d.b - d.a);
        const num = +q.opts[q.correct].replace(/[^0-9]/g, '');
        if (num !== want) out.badSide.push({ d: [d.a, d.b, d.c, d.ask], num, want });
        if (!(d.a < d.b && d.b <= d.c)) out.badSide.push('order');
        const nums = choices.map(c => +c.replace(/[^0-9]/g, '')), rank = nums.slice().sort((x, y) => x - y).indexOf(nums[correct]);
        out.rank = out.rank || [0, 0, 0]; out.rank[rank]++;
      }
    }
    return out;
  });
  if (gen.badWin.length) bad.push('win-answer ' + JSON.stringify(gen.badWin.slice(0, 3)));
  if (gen.badSide.length) bad.push('side-answer ' + JSON.stringify(gen.badSide.slice(0, 3)));
  if (gen.dup) bad.push('duplicate choices ' + gen.dup);
  if (gen.win < 180 || gen.side < 100) bad.push('mix ' + gen.win + '/' + gen.side);
  if (gen.close / gen.win < 0.6) bad.push('close too rare ' + gen.close);
  if (gen.longest / gen.n > 0.45) bad.push('correct often longest ' + gen.longest);
  if (gen.rank.some(r => r < gen.side * 0.18)) bad.push('pot answer rank not mixed ' + JSON.stringify(gen.rank));   // 「가장 작은 수」가 늘 답이면 안 된다
  if (gen.pos[3] === gen.chop && gen.chop > 5) bad.push('chop always last');

  // 2. 실제 호출 창 — 맞힘
  const openOne = async () => G(() => { const P = window.__pub; P.tasks.filter(k => k.kind === 'call').forEach(k => { P.tables[k.table].call = null; }); P.tasks = P.tasks.filter(k => k.kind !== 'call'); const task = P.__spotCall(0); P.__open(task); return true; });
  await openOne();
  const label = await G(() => (document.querySelector('#calls') || {}).innerText || '');
  if (label.indexOf('undefined') >= 0 || label.indexOf('딜러 실수') < 0) bad.push('task label ' + label);
  const fit = await G(() => { const md = document.querySelector('.modal'), last = [...document.querySelectorAll('[data-ch]')].pop().getBoundingClientRect(); return { scrolls: md.scrollHeight > md.clientHeight + 2, lastBottom: Math.round(last.bottom), vh: innerHeight, cards: document.querySelectorAll('.pc').length }; });
  if (SHOT) await page.screenshot({ path: 'spot-call.png' });
  const before = await G(() => ({ right: window.__pub.stats.right, spot: window.__pub.stats.spot || 0 }));
  await G(() => document.querySelectorAll('[data-ch]')[window.__pub.current.correct].click());
  await page.waitForTimeout(200);
  const v1 = await G(() => ({ ok: !!document.querySelector('.verdict.ok'), unv: !!document.querySelector('.unverified'), cite: (document.querySelector('.cite') || {}).innerText || '' }));
  if (SHOT) await page.screenshot({ path: 'spot-verdict.png' });
  await page.click('[data-ok]');
  await page.waitForTimeout(200);
  const after = await G(() => ({ right: window.__pub.stats.right, spot: window.__pub.stats.spot || 0 }));
  if (!v1.ok || v1.unv || v1.cite.indexOf('계산') < 0) bad.push('verdict ' + JSON.stringify(v1));
  if (after.right !== before.right + 1 || after.spot !== before.spot + 1) bad.push('stats ' + JSON.stringify([before, after]));
  // 3. 틀림
  await openOne();
  await G(() => { const c = window.__pub.current.correct; document.querySelectorAll('[data-ch]')[(c + 1) % document.querySelectorAll('[data-ch]').length].click(); });
  await page.waitForTimeout(200);
  const v2 = await G(() => ({ no: !!document.querySelector('.verdict.no'), right: !!document.querySelector('.choice.right'), wrong: !!document.querySelector('.choice.wrong') }));
  if (!v2.no || !v2.right || !v2.wrong) bad.push('wrong ' + JSON.stringify(v2));
  await page.click('[data-ok]');
  // 4. 작은 폰에서 여러 번 열어 가장 긴 창
  let worst = 0;
  for (let i = 0; i < 12; i++) {
    await openOne();
    const h = await G(() => { const md = document.querySelector('.modal'); return md.scrollHeight - md.clientHeight; });
    worst = Math.max(worst, h);
    await G(() => document.querySelectorAll('[data-ch]')[0].click()); await page.waitForTimeout(80); await page.click('[data-ok]');
  }
  if (worst > 2) bad.push('scrolls on iPhone SE by ' + worst + 'px');
  console.log(JSON.stringify({ gen: { n: gen.n, win: gen.win, side: gen.side, chop: gen.chop, close: gen.close, pos: gen.pos, rank: gen.rank, longest: gen.longest }, fit, worstOverflow: worst, bad, errors }, null, 1));
  await browser.close();
})();
