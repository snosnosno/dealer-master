import { expect, test, type Page } from '@playwright/test'
import { expectCardsInsideSeatBoxes } from './seat-overflow'

/**
 * `steps.ts` 의 `stepsFor()` 가 라즈 스펙(3rd 는 번 없음, 4th~7th 는 번 있음)에서
 * 내는 정확한 21스텝 순서다. `'open'` 은 팔레트가 아니라 좌석 지목이라 따로 다룬다.
 */
const STEP_ACTS = [
  'ante',
  'deal', 'open', 'betting', // 3rd
  'burn', 'deal', 'open', 'betting', // 4th
  'burn', 'deal', 'open', 'betting', // 5th
  'burn', 'deal', 'open', 'betting', // 6th
  'burn', 'deal', 'open', 'betting', // 7th
  'payout',
] as const

const PALETTE_LABEL: Record<string, string> = {
  ante: '앤티 수거',
  burn: '번카드',
  deal: '카드 딜',
  betting: '베팅 진행',
  payout: '팟 지급',
}

/**
 * 한 핸드를 21스텝 끝까지 밟는다. **정답을 이 스크립트가 아는 게 아니다** — 「첫 순서
 * 지목」은 화면이 맞다고 받아줄 때까지 좌석을 하나씩 눌러볼 뿐이다(브루트포스).
 * 7번가까지 가야 좌석에 카드가 최대(7장)로 쌓이므로, 넘침을 재려면 이 경로가 필요하다.
 */
async function playFullHand(page: Page) {
  const seatNames = ['1번', '2번', '3번', '4번', '5번', '6번']
  for (const act of STEP_ACTS) {
    if (act === 'open') {
      const prompt = page.getByText('이번 라운드의 첫 순서를 지목하세요')
      for (let tries = 0; tries < 8 && (await prompt.count()) > 0; tries++) {
        for (const name of seatNames) {
          if ((await prompt.count()) === 0) break
          const seatBtn = page.getByRole('button', { name, exact: true })
          if ((await seatBtn.count()) === 0) continue
          if (await seatBtn.isDisabled().catch(() => true)) continue
          await seatBtn.click()
          await page.waitForTimeout(100)
        }
      }
      continue
    }
    await page.getByRole('button', { name: PALETTE_LABEL[act], exact: true }).click()
    await page.waitForTimeout(act === 'betting' ? 1300 : 700)
  }
}

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
  await page.waitForTimeout(600) // 시드 마운트 대기(ProcedureScreen)

  // 결함은 카드가 여러 장 쌓여야 나타난다 — 딜 직후(0장)를 재는 것은 아무것도
  // 지키지 않는다(리뷰 지적). 7번가까지 밟아 좌석마다 카드를 최대로 채운다.
  await playFullHand(page)

  /*
   * 잣대는 `seat-overflow.ts` 하나에 있다 — PLO8 의 같은 검사가 문서 스크롤만 재고 있어
   * (최종 리뷰 E-1) 여기 있던 블록을 그리로 옮겨 둘이 같은 것을 보게 했다.
   */
  await expectCardsInsideSeatBoxes(page)

  await page.screenshot({ path: `e2e/shots/razz-procedure-${test.info().project.name}.png` })
})

test('라즈 팟 지급은 받을 좌석을 골라야 끝난다', async ({ page }) => {
  await page.goto('/games/razz/procedure')
  await page.waitForTimeout(600) // 시드 마운트 대기(ProcedureScreen)
  await playFullHand(page)

  // 팟 지급을 눌렀다고 끝나지 않는다 — 받을 좌석을 묻는다 (사용자 지적 2026-09-13)
  await expect(page.getByText('팟을 받을 좌석을 고르세요')).toBeVisible()
  await expect(page.getByText('한 핸드 완주')).toHaveCount(0)
  // 라즈는 하이가 없다 — 로우 줄만 있다
  await expect(page.locator('button[aria-label^="하이 "]')).toHaveCount(0)
  await page.screenshot({ path: `e2e/shots/razz-award-ask-${test.info().project.name}.png`, fullPage: true })

  // 정답을 스크립트가 모른다 — 살아 있는 좌석을 하나씩 줘 본다(브루트포스)
  const submit = page.getByRole('button', { name: '팟 지급', exact: true })
  let wrongTries = 0
  for (let n = 1; n <= 6 && (await page.getByText('한 핸드 완주').count()) === 0; n++) {
    const seat = page.locator(`button[aria-label="로우 ${n}번"]`)
    if (await seat.isDisabled()) continue
    await seat.click()
    await submit.click()
    await page.waitForTimeout(150)
    if ((await page.getByText('한 핸드 완주').count()) > 0) break
    wrongTries++
    await expect(page.getByText(/아직 아닙니다/)).toBeVisible()
    await seat.click() // 선택을 풀고 다음 좌석으로
  }

  await expect(page.getByText('한 핸드 완주')).toBeVisible()
  await expect(page.getByText(/^팟 지급 [\d,]+ — 로우 \d번/)).toBeVisible()
  await page.screenshot({ path: `e2e/shots/razz-award-${test.info().project.name}.png` })
  expect(wrongTries).toBeLessThan(6)
})

test('라즈 승자 판독은 하이 줄 없이 로우만 묻는다', async ({ page }) => {
  await page.goto('/games/razz/winner')
  await expect(page.getByText(/1 \/ 10/)).toBeVisible()

  // 하이 줄이 아예 없다. `aria-label` 이 줄 이름을 달고 있어 줄마다 셀 수 있다
  await expect(page.locator('button[aria-label^="하이 "]')).toHaveCount(0)
  await expect(page.locator('button[aria-label^="로우 "]')).toHaveCount(4)
  await expect(page.getByText('하이 승자', { exact: true })).toHaveCount(0)
  await expect(page.getByText('로우 승자를 고르세요.')).toBeVisible()

  // 공유 보드가 없는 종목이라 보드 상자를 그리지 않는다 (빈 상자가 뜨던 결함)
  await expect(page.getByText('보드', { exact: true })).toHaveCount(0)

  // 로우만 고르면 확인이 열린다 — 하이를 요구하면 제출이 영영 안 열린다
  await expect(page.getByRole('button', { name: '확인' })).toBeDisabled()
  await page.locator('button[aria-label="로우 1번"]').click()
  await expect(page.getByRole('button', { name: '확인' })).toBeEnabled()

  await page.getByRole('button', { name: '확인' }).click()
  await expect(page.getByRole('button', { name: '다음 문제' })).toBeVisible()
})

test('라즈는 「로우 없음」이 왜 답이 아닌지 가르친다', async ({ page }) => {
  await page.goto('/games/razz/winner')
  await expect(page.getByText(/1 \/ 10/)).toBeVisible()

  // 라즈는 자격 조건이 없어 로우가 늘 선다 — 이 버튼은 어느 판에서도 답이 아니다
  await page.getByRole('button', { name: '로우 없음' }).click()
  await page.getByRole('button', { name: '확인' }).click()
  await expect(page.getByText('이 종목은 로우 자격 조건이 없다', { exact: false })).toBeVisible()
})

test('라즈 승자 판독의 좌석 일곱 장이 줄을 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/games/razz/winner')
  await expect(page.getByText(/1 \/ 10/)).toBeVisible()

  // 참고 지표. 좌석 카드는 절대좌표가 아니라 이 화면에선 유효하지만, 카드가
  // `flex-shrink` 로 쭈그러들면 넘침 없이 랭크만 안 읽히므로 이것만으로는 못 지킨다
  const scrollOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(scrollOverflow).toBeLessThanOrEqual(0)

  // 진짜 잣대: 카드 rect 가 좌석 줄 안에 들어오고, 폭이 설계값(`sm` = 24px)대로인가
  const EPS = 1
  const rows = await page.evaluate(() => {
    const byRow = new Map<Element, Element[]>()
    for (const card of document.querySelectorAll('[data-face]')) {
      // 카드 → 카드 묶음(div) → 좌석 줄(div)
      const row = card.parentElement?.parentElement
      if (row == null) continue
      byRow.set(row, [...(byRow.get(row) ?? []), card])
    }
    return [...byRow].map(([row, cards]) => {
      const box = row.getBoundingClientRect()
      const rects = cards.map((c) => c.getBoundingClientRect())
      return {
        cards: cards.length,
        rowLeft: box.left,
        rowRight: box.right,
        minX: Math.min(...rects.map((r) => r.left)),
        maxX: Math.max(...rects.map((r) => r.right)),
        minWidth: Math.min(...rects.map((r) => r.width)),
      }
    })
  })

  expect(rows).toHaveLength(4) // 좌석 넷
  for (const row of rows) {
    expect(row.cards, '라즈는 좌석마다 일곱 장이다').toBe(7)
    expect(row.minX).toBeGreaterThanOrEqual(row.rowLeft - EPS)
    expect(row.maxX).toBeLessThanOrEqual(row.rowRight + EPS)
    // 쭈그러들면 랭크 글자가 안 읽힌다 — 카드를 줄이지 말고 줄바꿈을 허용하라는 설계
    expect(row.minWidth, '카드가 flex-shrink 로 쭈그러들었다').toBeGreaterThanOrEqual(24 - EPS)
  }

  await page.screenshot({ path: `e2e/shots/razz-winner-${test.info().project.name}.png` })
})
