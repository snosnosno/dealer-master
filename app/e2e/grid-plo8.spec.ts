import { expect, test } from '@playwright/test'

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

test('홀카드 4장이 좌석 상자를 넘치지 않는다', async ({ page }) => {
  await page.goto('/games/plo8/procedure')
  await page.getByRole('button', { name: '블라인드 포스팅' }).click()
  await page.getByRole('button', { name: '카드 딜' }).click()
  await page.waitForTimeout(800)

  // 페이지가 가로로 스크롤되면 무언가 밖으로 나갔다는 뜻이다
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)

  await page.screenshot({ path: `e2e/shots/plo8-procedure-${test.info().project.name}.png` })
})

test('승자 판독 첫 문제가 열리고 하이·로우를 둘 다 고른다', async ({ page }) => {
  await page.goto('/games/plo8/winner')
  await expect(page.getByText(/1 \/ 10/)).toBeVisible()

  // 두 줄이 다 있어야 PLO8 이다 — 하이만 물으면 스펙이 잘못 읽힌 것이다
  // exact 매칭: 안내 문구("하이 승자와 로우 승자를 고르세요")에도 같은 부분 문자열이 있다
  await expect(page.getByText('하이 승자', { exact: true })).toBeVisible()
  await expect(page.getByText('로우 승자', { exact: true })).toBeVisible()

  // 하이만 고른 상태에서는 확인이 열리지 않는다
  await page.getByRole('button', { name: '1번' }).first().click()
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

test('팟 분배 첫 문제가 열리고 좌석을 고를 수 있다', async ({ page }) => {
  await page.goto('/games/plo8/potaward')

  // 「팟 분배」로 잡지 않는다 — 제목과 눈썹(「PLO8 하이로우 · 팟 분배」)에 둘 다 있어
  // strict 모드가 두 개를 물고 실패한다. 진행 줄은 이 드릴에 하나뿐이다
  await expect(page.getByText(/1 \/ 10/)).toBeVisible()

  // 좌석 이름이 그대로 버튼 이름이다. 테이블 쪽 좌석 라벨은 버튼이 아니라 겹치지 않는다
  await page.getByRole('button', { name: '1번', exact: true }).click()
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
