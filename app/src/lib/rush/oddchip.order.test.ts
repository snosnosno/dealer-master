/**
 * 홀칩 순서 전수 대조.
 *
 * 좌석 2~9 × 모든 버튼 × 공집합이 아닌 모든 자격자 조합 = **8,148건**
 * (Σ n·(2ⁿ−1), n=2..9). 엔진 `awardPots` 와, 버튼 왼쪽부터 걸어가는 독립 오라클을 맞춘다.
 *
 * 이 대조가 성립하려면 `allTieFixture` 가 정말로 전원 동점이어야 한다 —
 * 아니면 승자 집합이 자격자 집합보다 좁아져서 대조가 조용히 다른 것을 재게 된다.
 * 그래서 동점 자체를 먼저 확인한다.
 */
import { describe, expect, it } from 'vitest'
import { GAMES, evaluatorFor } from '@/lib/games'
import { ODD_CHIP_UNIT, awardPots, compareHands, evaluateHand } from '@/lib/simulator'
import { allTieFixture } from './deal'
import { oddChipSeat } from './oracle'

/** 홀칩 순서는 종목과 무관하다 — 노리밋 홀덤 평가기로 전 좌석 동점을 만든다 */
const EV = evaluatorFor(GAMES.nlh)

const MIN = 2
const MAX = 9

describe('allTieFixture', () => {
  it('좌석 2~9 에서 전 좌석이 완전 동점이다', () => {
    for (let n = MIN; n <= MAX; n++) {
      const { hole, board } = allTieFixture(n)
      const ranks = hole.map((h) => evaluateHand([...h, ...board]))
      for (const rank of ranks) {
        expect(compareHands(rank, ranks[0])).toBe(0)
        expect(rank.label).toBe('스트레이트')
      }
    }
  })

  it('한 판 안에 같은 카드가 없다', () => {
    for (let n = MIN; n <= MAX; n++) {
      const { hole, board } = allTieFixture(n)
      const all = [...hole.flat(), ...board].map((c) => c.rank + c.suit)
      expect(new Set(all).size).toBe(all.length)
    }
  })
})

describe('홀칩 순서 — 전수 대조', () => {
  it('좌석 2~9 × 모든 버튼 × 모든 자격자 조합에서 엔진과 오라클이 같다', () => {
    let checked = 0

    for (let seatCount = MIN; seatCount <= MAX; seatCount++) {
      const { hole, board } = allTieFixture(seatCount)

      for (let mask = 1; mask < 1 << seatCount; mask++) {
        const eligible: number[] = []
        for (let s = 0; s < seatCount; s++) if (mask & (1 << s)) eligible.push(s)

        // 자격자 수로 나눠 1이 남는 팟 — 홀칩이 정확히 하나 남는다
        const units = eligible.length * 7 + 1
        const amount = units * ODD_CHIP_UNIT
        const base = Math.floor(units / eligible.length) * ODD_CHIP_UNIT

        for (let button = 0; button < seatCount; button++) {
          const awards = awardPots([{ amount, eligibleSeats: eligible }], hole, board, button, EV)

          // 자격자 전원이 받고, 합이 팟과 같다
          expect(awards.map((a) => a.seat).sort((x, y) => x - y)).toEqual(eligible)
          expect(awards.reduce((sum, a) => sum + a.amount, 0)).toBe(amount)

          if (eligible.length === 1) {
            // 자격자가 한 명이면 나눌 일이 없다 — 팟 전체가 그 좌석으로 간다.
            // 그래도 "버튼 왼쪽부터 걸어가면 그 좌석"이라는 순서 규칙은 성립해야 한다.
            expect(awards[0].amount).toBe(amount)
            expect(awards[0].seat).toBe(oddChipSeat(eligible, button, seatCount))
          } else {
            const odd = awards.filter((a) => a.amount === base + ODD_CHIP_UNIT)
            expect(odd).toHaveLength(1)
            expect(odd[0].seat).toBe(oddChipSeat(eligible, button, seatCount))
          }
          checked++
        }
      }
    }

    expect(checked).toBe(8148)
  })
})
