import { expect, test } from '@playwright/test'
import { expectCardsInsideSeatBoxes } from './seat-overflow'

test('홈에서 PLO8 진행절차까지 간다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '딜러마스터' })).toBeVisible()

  await page.getByRole('link', { name: /PLO8/ }).click()
  await expect(page.getByRole('heading', { name: 'PLO8' })).toBeVisible()

  // 이 종목에 해당 없는 드릴은 아예 나오지 않는다
  await expect(page.getByText('진행절차')).toBeVisible()
  await expect(page.getByText('승자 판독')).toBeVisible()

  await page.getByRole('link', { name: '진행절차' }).click()
  await expect(page.getByRole('button', { name: '블라인드 포스팅' })).toBeVisible()
})

test('팔레트가 늘 일곱이고 순서를 틀리면 힌트가 뜬다', async ({ page }) => {
  await page.goto('/games/plo8/procedure')

  for (const name of ['앤티 수거', '블라인드 포스팅', '번카드', '카드 딜', '카드 교체', '베팅 진행', '팟 지급']) {
    await expect(page.getByRole('button', { name })).toBeVisible()
  }

  await page.getByRole('button', { name: '팟 지급' }).click()
  await expect(page.getByText(/아직 아닙니다/)).toBeVisible()
  await expect(page.getByText('막힘')).toBeVisible()
})

test('PLO8 화면엔 SB/BB 배지가 있다', async ({ page }) => {
  await page.goto('/games/plo8/procedure')
  // 라즈(앤티+브링인) 를 열면서 `PokerTable` 에 `forced` prop 이 생겼다 — PLO8(블라인드)
  // 은 기본값으로 그대로 SB/BB 를 받는지 못박는다. 여기서 사라지면 그게 더 큰 문제다
  await expect(page.getByText('SB', { exact: true })).toBeVisible()
  await expect(page.getByText('BB', { exact: true })).toBeVisible()
})

test('홀카드 4장이 좌석 상자를 넘치지 않는다', async ({ page }) => {
  await page.goto('/games/plo8/procedure')
  await page.getByRole('button', { name: '블라인드 포스팅' }).click()
  await page.getByRole('button', { name: '카드 딜' }).click()
  await page.waitForTimeout(800)

  /*
   * **문서 스크롤만 재면 제목이 거짓이 된다.** 좌석은 절대 위치라 카드가 상자를 삐져나가도
   * 문서 폭이 늘지 않는다 — 라즈가 관찰로 확인하고 좌석 상자 잣대로 바꾼 그 공백이다
   * (최종 리뷰 E-1). 같은 잣대를 `seat-overflow.ts` 하나에 두고 여기서 부른다.
   *
   * PLO8 은 프리플랍 한 번에 홀카드 넉 장이 다 나가므로 이 시점이 카드가 최대인 상태다.
   * 좁은 폭은 `playwright.config.ts` 의 `mobile` 프로젝트(360px)가 함께 돌며 본다.
   */
  await expectCardsInsideSeatBoxes(page)

  await page.screenshot({ path: `e2e/shots/plo8-procedure-${test.info().project.name}.png` })
})

test('승자 판독 첫 문제가 열리고 하이·로우를 둘 다 고른다', async ({ page }) => {
  await page.goto('/games/plo8/winner')
  await expect(page.getByText(/1 \/ 10/)).toBeVisible()

  // 두 줄이 다 있어야 PLO8 이다 — 하이만 물으면 스펙이 잘못 읽힌 것이다
  // exact 매칭: 안내 문구("하이 승자와 로우 승자를 고르세요")에도 같은 부분 문자열이 있다
  await expect(page.getByText('하이 승자', { exact: true })).toBeVisible()
  await expect(page.getByText('로우 승자', { exact: true })).toBeVisible()

  // 하이만 고른 상태에서는 확인이 열리지 않는다.
  // `.first()` 로 잡던 것을 `aria-label` 로 바꿨다 — 그건 「하이 줄이 먼저 그려진다」는
  // DOM 순서에 기댄 것이라 줄 순서를 바꾸면 조용히 로우를 누르게 된다
  await page.locator('button[aria-label="하이 1번"]').click()
  await expect(page.getByRole('button', { name: '확인' })).toBeDisabled()

  await page.getByRole('button', { name: '로우 없음' }).click()
  await expect(page.getByRole('button', { name: '확인' })).toBeEnabled()

  await page.getByRole('button', { name: '확인' }).click()
  await expect(page.getByRole('button', { name: '다음 문제' })).toBeVisible()
})

test('승자 판독이 좌석 버튼 두 줄에서 가로로 넘치지 않는다', async ({ page }) => {
  await page.goto('/games/plo8/winner')
  await expect(page.getByText(/1 \/ 10/)).toBeVisible()

  // 페이지가 가로로 스크롤되면 무언가 밖으로 나갔다는 뜻이다
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)

  await page.screenshot({ path: `e2e/shots/plo8-winner-${test.info().project.name}.png` })
})

test('팟 분배 첫 문제가 열리고 층마다 임자를 고를 수 있다', async ({ page }) => {
  await page.goto('/games/plo8/potaward')

  // 「팟 분배」로 잡지 않는다 — 제목과 눈썹(「PLO8 하이로우 · 팟 분배」)에 둘 다 있어
  // strict 모드가 두 개를 물고 실패한다. 진행 줄은 이 드릴에 하나뿐이다
  await expect(page.getByText(/1 \/ 10/)).toBeVisible()

  /*
   * 한 장이 한 판이라 **층마다** 하이를 고르고 로우를 정해야 제출이 열린다.
   * 층이 몇인지는 문제가 정하므로 세지 않고 있는 만큼 돈다.
   *
   * 자격 없는 좌석은 눌리지 않으므로 `:enabled` 로 고른다 — 층이 깊어질수록
   * 자격자가 줄어드는 것이 이 드릴이 가르치는 것이라, 첫 번째 버튼이 늘
   * 눌린다고 기대하면 안 된다.
   */
  const pots = page.getByRole('group')
  const potCount = await pots.count()
  expect(potCount).toBeGreaterThan(0)

  for (let i = 0; i < potCount; i++) {
    const pot = pots.nth(i)
    await pot.locator('button:enabled[aria-label*="하이"]').first().click()
    await pot.locator('button[aria-label$="로우 없음"]').click()
  }

  await page.getByRole('button', { name: '제출' }).click()

  // 맞았는지 틀렸는지를 먼저 말해야 드릴이 성립한다 — 근거만 나오면 안 된다
  await expect(page.getByText(/정확하다|틀렸다/)).toBeVisible()
  await expect(page.getByRole('button', { name: '다음' })).toBeVisible()
})

test('팟 분배가 360px 에서 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/games/plo8/potaward')
  await expect(page.getByRole('button', { name: '제출' })).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)

  await page.screenshot({ path: `e2e/shots/plo8-potaward-${test.info().project.name}.png` })
})

test('팟리밋 계산은 숫자를 받고 정답을 알려준다', async ({ page }) => {
  await page.goto('/games/plo8/potlimit')

  // 「팟리밋 계산」으로 잡지 않는다 — 제목과 눈썹(「PLO8 하이로우 · 팟리밋 계산」)에
  // 둘 다 있어 strict 모드가 두 개를 물고 실패한다. 진행 줄은 이 드릴에 하나뿐이다
  await expect(page.getByText(/1 \/ 10/)).toBeVisible()

  // 보기가 없다 — 숫자를 친다. 1 은 어떤 판에서도 오답이다(답은 늘 블라인드 이상)
  await page.getByPlaceholder('금액').fill('1')
  await page.getByRole('button', { name: '제출' }).click()

  // 맞았는지 틀렸는지를 정답보다 **먼저** 말해야 드릴이 성립한다
  await expect(page.getByText(/정확하다|틀렸다/)).toBeVisible()
  await expect(page.getByText('정답')).toBeVisible()
  await expect(page.getByRole('button', { name: '다음' })).toBeVisible()
})

test('노리밋 홀덤에는 팟리밋 칸이 아예 없다', async ({ page }) => {
  await page.goto('/games/nlh')
  await expect(page.getByText('팟리밋 계산')).toHaveCount(0)
})
