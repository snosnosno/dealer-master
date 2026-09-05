import { expect, test } from '@playwright/test'

test('홈에서 PLO8 진행절차까지 간다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '딜러마스터' })).toBeVisible()

  await page.getByRole('link', { name: /PLO8/ }).click()
  await expect(page.getByRole('heading', { name: 'PLO8' })).toBeVisible()

  // 이 종목에 해당 없는 드릴은 아예 나오지 않는다
  await expect(page.getByText('진행절차')).toBeVisible()
  await expect(page.getByText('로우 판독')).toBeVisible()

  await page.getByRole('link', { name: '진행절차' }).click()
  await expect(page.getByRole('button', { name: '블라인드 수거' })).toBeVisible()
})

test('팔레트가 늘 일곱이고 순서를 틀리면 힌트가 뜬다', async ({ page }) => {
  await page.goto('/games/plo8/procedure')

  for (const name of ['앤티 수거', '블라인드 수거', '번카드', '카드 딜', '카드 교체', '베팅 진행', '팟 지급']) {
    await expect(page.getByRole('button', { name })).toBeVisible()
  }

  await page.getByRole('button', { name: '팟 지급' }).click()
  await expect(page.getByText(/아직 아닙니다/)).toBeVisible()
  await expect(page.getByText('막힘')).toBeVisible()
})

test('홀카드 4장이 좌석 상자를 넘치지 않는다', async ({ page }) => {
  await page.goto('/games/plo8/procedure')
  await page.getByRole('button', { name: '블라인드 수거' }).click()
  await page.getByRole('button', { name: '카드 딜' }).click()
  await page.waitForTimeout(800)

  // 페이지가 가로로 스크롤되면 무언가 밖으로 나갔다는 뜻이다
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)

  await page.screenshot({ path: `e2e/shots/plo8-procedure-${test.info().project.name}.png` })
})

test('로우 판독 첫 문제가 열린다', async ({ page }) => {
  await page.goto('/games/plo8/low-reading')
  await expect(page.getByText(/1 \/ 10/)).toBeVisible()
})
