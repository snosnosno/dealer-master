import { expect, type Page } from '@playwright/test'

/**
 * 좌석에 놓인 카드가 **그 좌석에 배정된 상자를 벗어나지 않는가.**
 *
 * 비유: 쟁반 위에 접시를 올리는 일이다. 쟁반이 넘치는지 보려면 쟁반 테두리와 접시들의
 * 실제 자리를 재야 한다 — 식탁이 넓은지(문서 스크롤)를 보는 것으로는 알 수 없다.
 *
 * **`document.scrollWidth` 는 이 결함에 눈이 멀다.** 좌석은 절대 위치라 카드가 상자를
 * 삐져나가도 문서 폭이 늘지 않는다(라즈에서 관찰로 확인). 그래서 스크롤은 참고 지표로만
 * 병행하고, 판정은 상자와 **카드 하나하나의 실제 화면 좌표**를 비교해서 낸다.
 * 상자 자기 자신의 rect 는 `w-full` 이라 자식이 넘쳐도 그대로 보고되므로 그것만 재도 안 된다.
 *
 * **잣대가 여기 하나뿐인 이유**: 같은 검사를 두 스펙 파일에 적으면 한쪽만 고쳐지는 날이
 * 온다. 라즈가 이 결함을 잡은 잣대를 PLO8 이 그대로 쓴다 — PLO8 의 같은 이름 검사는
 * 문서 스크롤만 재고 있어서 「좌석 상자」를 말하면서 좌석 상자에 눈이 멀었다(최종 리뷰 E-1).
 */
export async function expectCardsInsideSeatBoxes(page: Page, seatCount = 6) {
  // 참고 지표. 이것만으로는 판정하지 않는다
  const scrollOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(scrollOverflow).toBeLessThanOrEqual(0)

  const EPS = 1 // 서브픽셀 반올림 여유
  let measured = 0

  for (let seat = 0; seat < seatCount; seat++) {
    const seatBox = page.locator(`[data-seat="${seat}"]`)
    const boxRect = await seatBox.boundingBox()
    if (boxRect === null) continue // 화면 밖(표시 안 됨)이면 잴 것이 없다

    const cards = seatBox.locator('[data-face]')
    const cardCount = await cards.count()
    if (cardCount === 0) continue // 아직 카드가 없는 좌석

    let minX = Infinity
    let maxX = -Infinity
    for (let c = 0; c < cardCount; c++) {
      const cardRect = await cards.nth(c).boundingBox()
      if (cardRect === null) continue
      minX = Math.min(minX, cardRect.x)
      maxX = Math.max(maxX, cardRect.x + cardRect.width)
    }
    if (minX === Infinity) continue

    measured++
    expect(minX, `좌석 ${seat} 카드가 상자 왼쪽을 벗어남`).toBeGreaterThanOrEqual(boxRect.x - EPS)
    expect(maxX, `좌석 ${seat} 카드가 상자 오른쪽을 벗어남`).toBeLessThanOrEqual(
      boxRect.x + boxRect.width + EPS,
    )
  }

  /*
   * **한 좌석도 재지 못했으면 이 함수는 아무것도 지키지 않았다.** 카드가 나가기 전에
   * 부르거나 `data-seat`·`data-face` 가 사라지면 위 루프가 통째로 `continue` 되어
   * 초록으로 통과한다 — 그 공허함을 여기서 막는다.
   */
  expect(measured, '카드가 놓인 좌석을 하나도 재지 못했다 — 검사가 공허하다').toBeGreaterThan(0)
}
