import { expect, test, type Page } from '@playwright/test'

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

  // `scrollWidth` 는 절대좌표 좌석의 넘침을 못 잡는다는 것을 관찰로 확인했다
  // (수정 라운드 1 보고서 참고) — 참고 지표로만 병행한다. 이것만으로는 판정하지 않는다.
  const scrollOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(scrollOverflow).toBeLessThanOrEqual(0)

  // 진짜 잣대: 좌석마다 카드 rect 의 합집합이 그 좌석에 배정된 상자(`[data-seat]`)를
  // 벗어나지 않는가. 상자 자기 자신의 rect 는 `w-full` 이라 자식이 넘쳐도 그대로
  // 보고되므로(팟 분배 자리도 마찬가지), 상자와 **카드 하나하나의 실제 화면 좌표**를
  // 따로 재서 비교해야 한다.
  const EPS = 1 // 서브픽셀 반올림 여유
  for (let seat = 0; seat < 6; seat++) {
    const seatBox = page.locator(`[data-seat="${seat}"]`)
    const boxRect = await seatBox.boundingBox()
    if (boxRect === null) continue // 화면 밖(표시 안 됨)이면 잴 것이 없다

    const cards = seatBox.locator('[data-face]')
    const cardCount = await cards.count()
    if (cardCount === 0) continue // 아직 카드가 없는 좌석(이론상 없지만 방어적으로)

    let minX = Infinity
    let maxX = -Infinity
    for (let c = 0; c < cardCount; c++) {
      const cardRect = await cards.nth(c).boundingBox()
      if (cardRect === null) continue
      minX = Math.min(minX, cardRect.x)
      maxX = Math.max(maxX, cardRect.x + cardRect.width)
    }

    expect(minX, `좌석 ${seat} 카드가 상자 왼쪽을 벗어남`).toBeGreaterThanOrEqual(boxRect.x - EPS)
    expect(maxX, `좌석 ${seat} 카드가 상자 오른쪽을 벗어남`).toBeLessThanOrEqual(
      boxRect.x + boxRect.width + EPS,
    )
  }

  await page.screenshot({ path: `e2e/shots/razz-procedure-${test.info().project.name}.png` })
})
