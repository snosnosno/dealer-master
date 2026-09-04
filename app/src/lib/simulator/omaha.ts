/**
 * 오마하의 강제 조합 — **홀 2장 + 보드 3장**. 이것 하나가 오마하를 홀덤과 갈라 놓는다.
 *
 * 비유: 홀덤은 일곱 장에서 아무 다섯 장을 고르지만, 오마하는 "손에서 둘, 바닥에서 셋"
 * 이라는 규칙을 지켜야 한다. 보드에 스트레이트가 깔려 있어도 그냥 가져갈 수 없다.
 *
 * **평가는 여기서 하지 않는다.** 어느 다섯 장을 쓸지만 고르고, 그 다섯 장의 값은
 * `evaluate.ts`(하이)와 `lowball.ts`(로우)가 낸다. 스터드는 이 파일이 필요 없다 —
 * 일곱 장 중 아무 다섯이라 조합 규칙이 다르다.
 */
import type { Card } from './cards'
import { compareHands, evaluateHand, type HandRank } from './evaluate'
import { compareLow, evaluateLowA5, type LowRank } from './lowball'

/** 홀 4장 × 보드 5장 = 4C2 × 5C3 = 60 조합. */
export function omahaCombos(hole: Card[], board: Card[]): Card[][] {
  const out: Card[][] = []
  for (let a = 0; a < hole.length; a++) {
    for (let b = a + 1; b < hole.length; b++) {
      for (let c = 0; c < board.length; c++) {
        for (let d = c + 1; d < board.length; d++) {
          for (let e = d + 1; e < board.length; e++) {
            out.push([hole[a], hole[b], board[c], board[d], board[e]])
          }
        }
      }
    }
  }
  return out
}

export function bestOmahaHi(hole: Card[], board: Card[]): HandRank {
  let best: HandRank | null = null
  for (const five of omahaCombos(hole, board)) {
    const rank = evaluateHand(five)
    if (best === null || compareHands(rank, best) > 0) best = rank
  }
  if (best === null) throw new Error('하이를 만들 조합이 없음 — 보드 3장·홀 2장이 필요하다')
  return best
}

/**
 * 자격을 통과한 최선의 로우. **자격자가 없으면 `null`** — 하이가 팟을 전부 가져간다.
 *
 * 8-or-better 는 별개의 평가기가 아니라 **자격 규칙**이다: 페어가 없어야 하고
 * 다섯 장 전부 `qualifier` 이하여야 한다. 자격 없는 종목(라즈)은 이 함수를 쓰지 않는다.
 */
export function bestOmahaLow(hole: Card[], board: Card[], qualifier: number): LowRank | null {
  let best: LowRank | null = null
  for (const five of omahaCombos(hole, board)) {
    const low = evaluateLowA5(five)
    if (low.category !== 0) continue
    // key[0] 은 category 라 가장 높은 카드는 key[1] 이다
    if (low.key[1] > qualifier) continue
    if (best === null || compareLow(low, best) < 0) best = low
  }
  return best
}
