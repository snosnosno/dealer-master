/**
 * TD 시험 문제로 최소 레이즈 계산을 검증한다.
 *
 * 출처: 실제 TD 시험 문제지 (2026-08-31 제공). 축 2 "액션 판정 러시"는
 * **엔진이 시험 문제의 정답을 낸다**는 가정 위에 서 있다. 그 가정을 여기서 못박는다.
 *
 * 핵심은 `minRaiseTo` 공식 하나가 아니라 **짧은 올인이 최소 레이즈를 깎지 않는가**다.
 * 풀 레이즈에 못 미치는 올인이 `lastRaiseSize` 를 갱신해버리면 그 뒤 사람의 최소
 * 레이즈가 규정보다 작아지고, 훈련생이 틀린 금액을 정답으로 배운다.
 *
 * 아래 replay 는 `generate.ts` 의 갱신 규칙(:154, :172)을 그대로 옮긴 것이다 —
 * `raiseSize = newBet - currentBet`, 그리고 `raiseSize >= max(lastRaiseSize, bb)` 일 때만 갱신.
 */
import { describe, it, expect } from 'vitest'
import { nlh } from './nlh'

type Wager = { to: number; allIn?: boolean }

/** 프리플랍 레이즈 연쇄를 재생해 (현재 최고 벳, 마지막 풀레이즈 폭) 을 낸다. */
function replay(bb: number, wagers: Wager[]): { currentBet: number; lastRaiseSize: number } {
  // 프리플랍의 시작 상태: 빅블라인드가 곧 오픈 벳이고 그 폭도 bb 다 (generate.ts:111)
  let currentBet = bb
  let lastRaiseSize = bb

  for (const w of wagers) {
    const raiseSize = w.to - currentBet
    currentBet = w.to
    if (raiseSize >= Math.max(lastRaiseSize, bb)) lastRaiseSize = raiseSize
  }
  return { currentBet, lastRaiseSize }
}

function minRaiseTo(bb: number, wagers: Wager[]): number {
  const { currentBet, lastRaiseSize } = replay(bb, wagers)
  return nlh.minRaiseTo({
    currentBet,
    lastRaiseSize,
    bigBlind: bb,
    // 규정이 정하는 최소 총액을 묻는 것이라 좌석 스택을 보지 않는다 (decisions.ts 와 같은 중립값)
    seatBet: 0,
    seatStack: Number.MAX_SAFE_INTEGER,
    isOpenBet: false,
    canRaise: true,
  })
}

describe('TD 시험 문제 — MP+2 의 최소 레이즈 금액', () => {
  it('문제 6: 4700 → 13500 → 14000 올인 → 16000 올인 이면 24,800 이다', () => {
    /*
     * BLIND 1000/2000(2000) 프리플랍
     *   UTG   RAISE 4700    폭 2,700  (풀)  → 이후 최소 폭 2,700
     *   UTG+1 RAISE 13500   폭 8,800  (풀)  → 이후 최소 폭 8,800
     *   MP    14000 ALL IN  폭   500  (미달) → 폭 유지
     *   MP+1  16000 ALL IN  폭 2,000  (미달) → 폭 유지
     * 최소 레이즈 총액 = 16,000 + 8,800
     */
    expect(
      minRaiseTo(2000, [
        { to: 4700 },
        { to: 13500 },
        { to: 14000, allIn: true },
        { to: 16000, allIn: true },
      ]),
    ).toBe(24800)
  })

  it('문제 7: 5500 → 18000 → 19000 올인 → 23000 올인 이면 35,500 이다', () => {
    /*
     *   UTG   RAISE 5500    폭  3,500 (풀)
     *   UTG+1 RAISE 18000   폭 12,500 (풀)
     *   MP    19000 ALL IN  폭  1,000 (미달)
     *   MP+1  23000 ALL IN  폭  4,000 (미달)
     * 최소 레이즈 총액 = 23,000 + 12,500
     */
    expect(
      minRaiseTo(2000, [
        { to: 5500 },
        { to: 18000 },
        { to: 19000, allIn: true },
        { to: 23000, allIn: true },
      ]),
    ).toBe(35500)
  })

  it('짧은 올인이 최소 레이즈를 깎지 않는다', () => {
    // 같은 자리에서 짧은 올인이 없었다면 답은 13,500 + 8,800 = 22,300 이다.
    // 짧은 올인 둘은 콜 금액만 16,000 으로 올리고 폭은 8,800 그대로 둔다.
    const withShortAllIns = minRaiseTo(2000, [
      { to: 4700 },
      { to: 13500 },
      { to: 14000, allIn: true },
      { to: 16000, allIn: true },
    ])
    const withoutThem = minRaiseTo(2000, [{ to: 4700 }, { to: 13500 }])

    expect(withoutThem).toBe(22300)
    // 콜 금액이 오른 만큼(2,500) 최소 레이즈도 오를 뿐, 폭이 500·2,000 으로 깎이지 않는다
    expect(withShortAllIns - withoutThem).toBe(2500)
  })

  it('폭이 빅블라인드보다 작아질 수 없다', () => {
    // 첫 레이즈 폭이 bb 미만인 올인만 있었다면 하한은 여전히 bb 다
    expect(minRaiseTo(2000, [{ to: 2500, allIn: true }])).toBe(4500)
  })
})
