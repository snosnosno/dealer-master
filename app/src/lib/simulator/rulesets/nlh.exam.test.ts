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
 * 액션을 **상태 기계에 실제로 통과시킨다.** 갱신 규칙을 테스트에 옮겨 적으면
 * 테스트가 검증하는 것은 엔진이 아니라 그 사본이 된다.
 */
import { describe, it, expect } from 'vitest'
import { nlh } from './nlh'
import { initialState, applyEvent } from '../reduce'
import type { HandState, SeatInit } from '../types'

type Wager = { to: number; allIn?: boolean }

const DEEP = 1_000_000_000

/**
 * 프리플랍 레이즈 연쇄를 실제 리듀서로 재생하고, 그 상태로 최소 레이즈 총액을 묻는다.
 * 좌석 0·1 은 블라인드, 그 뒤로 wagers 가 순서대로 앉는다.
 * 올인 표시된 벳은 좌석 스택을 그 금액에 맞춰 **진짜 올인**으로 만든다.
 */
function minRaiseTo(bb: number, wagers: Wager[]): number {
  const seats: SeatInit[] = [
    { name: 'SB', stack: DEEP },
    { name: 'BB', stack: DEEP },
    ...wagers.map((w, i) => ({ name: `P${i}`, stack: w.allIn ? w.to : DEEP })),
  ]

  let s: HandState = initialState(seats, 0)
  s = applyEvent(s, { type: 'post_blind', seat: 0, amount: Math.floor(bb / 2), kind: 'sb' })
  s = applyEvent(s, { type: 'post_blind', seat: 1, amount: bb, kind: 'bb' })

  wagers.forEach((w, i) => {
    s = applyEvent(s, {
      type: 'player_action',
      seat: i + 2,
      action: w.allIn ? { kind: 'allin', to: w.to } : { kind: 'raise', to: w.to },
    })
  })

  return nlh.minRaiseTo({
    currentBet: Math.max(...s.seats.map((x) => x.bet)),
    lastRaiseSize: s.lastRaiseSize,
    bigBlind: s.bigBlind,
    // 규정이 정하는 최소 총액을 묻는 것이라 좌석 스택을 보지 않는다 (decisions.ts 와 같은 중립값)
    seatBet: 0,
    seatStack: Number.MAX_SAFE_INTEGER,
    isOpenBet: false,
    hasActedThisRound: false,
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
    // 짧은 올인이 없었다면 답은 13,500 + 8,800 = 22,300 이다.
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
