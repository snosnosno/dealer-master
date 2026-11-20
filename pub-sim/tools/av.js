// 그래픽 · 사운드 점검 — node tools/av.js [shot]
// 캐릭터(머리카락 · 눈 · 팔 · 나비넥타이) 메시 수, 배경음악 박자 진행, 웅성거림 음량, 🎵 토글
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const { chromium } = require('playwright');
const SHOT = process.argv[2] === 'shot';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: SHOT ? 2 : 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(PAGE);
  await page.waitForTimeout(500);
  const G = (f, a) => page.evaluate(f, a);
  await page.click('[data-go]');
  await page.click('[data-tab="dealers"]');
  await page.click('[data-open]');
  await G(() => { window.__pub.evPlan = []; window.__pub.speed = 2; });
  await page.waitForTimeout(9000);
  const out = {};
  out.people = await G(() => {
    const G = window.__pub, d = G.dealers[0].mesh, c = G.customers.find(x => x.alive);
    const cnt = m => m.children.length;
    return { dealerParts: cnt(d), dealerArms: !!d.userData.arms, custParts: c ? cnt(c.mesh) : null, hairColors: [...new Set(G.customers.map(x => x.mesh.children[2].material.color.getHexString()))].length };
  });
  const m0 = await G(() => window.__pub.__music.beat);
  await page.waitForTimeout(3000);
  out.music = await G((m0) => { const M = window.__pub.__music; return { on: M.on, beatsIn3s: M.beat - m0, murmur: M.mur ? Math.round(M.mur.gain.value * 1000) / 1000 : null, master: M.master ? M.master.gain.value : null }; }, m0);
  // 음악 상태 — 내부 값은 클로저 안이라 HUD 버튼 · AudioContext 로 본다
  // 🎵 는 1.1 부터 일시정지 메뉴의 빠른 토글에 있다
  await page.click('[data-pause]');
  out.hudMusic = await G(() => { const b = document.querySelector('[data-music]'); return b ? b.className : null; });
  await page.click('[data-music]');
  out.afterToggle = await G(() => document.querySelector('[data-music]').className);
  await page.click('[data-music]');
  out.afterToggle2 = await G(() => document.querySelector('[data-music]').className);
  await page.click('[data-resume]');
  if (SHOT) {
    await G(() => { window.__pub.speed = 1; });
    await page.click('[data-pause]'); await page.click('[data-follow]'); await page.click('[data-resume]');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'av-close.png' });
  }
  console.log(JSON.stringify({ out, errors: errors.slice(0, 8) }, null, 1));
  await browser.close();
})();
