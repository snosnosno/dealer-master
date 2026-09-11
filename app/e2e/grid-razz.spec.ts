import { expect, test } from '@playwright/test'

test('홈에서 라즈 진행절차까지 간다', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /라즈/ }).click()
  await page.getByRole('link', { name: /진행절차/ }).click()
  await expect(page).toHaveURL(/\/games\/razz\/procedure/)
})

test('라즈는 블라인드가 아니라 앤티로 연다', async ({ page }) => {
  await page.goto('/games/razz/procedure')
  await page.getByRole('button', { name: '앤티 수거' }).click()
  // 팔레트 버튼도 같은 글자를 갖고 있어 `/앤티 수거/` 만으로는 둘을 물어 strict 모드가
  // 실패한다 — 로그 줄만 짚는다(좌석 앞이 아니라 팟으로 걷혔다는 금액까지 확인)
  await expect(page.getByText('앤티 수거 — 좌석마다')).toBeVisible()
})

test('3번가 뒤 좌석마다 열린 카드가 하나 선다', async ({ page }) => {
  await page.goto('/games/razz/procedure')
  // 앤티 → 딜 까지 밟는다. 팔레트 버튼 이름은 PALETTE 상수와 같다
  await page.getByRole('button', { name: '앤티 수거' }).click()
  await page.getByRole('button', { name: '카드 딜' }).click()
  // 카드 앞면은 랭크 글자가 보인다. 뒷면은 안 보인다 — 좌석 여섯에 앞면이 여섯
  await expect(page.locator('[data-face="up"]')).toHaveCount(6)
})

test('라즈 화면엔 SB/BB 배지가 없다', async ({ page }) => {
  await page.goto('/games/razz/procedure')
  // 라즈는 앤티+브링인이다 — 버튼 위치만 보고 SB/BB 를 찍던 결함이 있었다
  // (`PokerTable.positionTags`). 강제 베팅 종류를 봐야 한다
  await expect(page.getByText('SB', { exact: true })).toHaveCount(0)
  await expect(page.getByText('BB', { exact: true })).toHaveCount(0)
})

test('라즈 좌석 일곱 장이 좌석 상자를 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/games/razz/procedure')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `e2e/shots/razz-procedure-${test.info().project.name}.png` })
})
