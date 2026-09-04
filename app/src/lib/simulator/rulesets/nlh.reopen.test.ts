/**
 * 베팅 기회 재개 — WINNABLE 제35조 4항.
 *
 * > 한 명 이상의 플레이어가 최소 레이즈 금액에 미치지 못하는 올인을 한 경우, 이미 액션을
 * > 취했던 플레이어에게 베팅 기회가 다시 돌아왔을 때, 해당 플레이어가 직면한 총 베팅
 * > 증가액이 유효한 최소 레이즈 금액 이상이 아니라면 레이즈를 할 수 없다.
 *
 * **규정은 누적이다.** 짧은 올인 각각은 최소 레이즈에 못 미쳐도, 합쳐서 넘기면
 * 레이즈 권리가 살아난다. 엔진이 이걸 단발("마지막 풀 레이즈 이후 액션했나")로 보면
 * 훈련생이 "짧은 올인 뒤에는 절대 못 올린다"는 틀린 규칙을 배운다.
 *
 * 액션을 **상태 기계에 실제로 통과시킨다** — `nlh.exam.test.ts` 와 같은 이유다.
 * 갱신 규칙을 테스트에 옮겨 적으면 검증 대상이 엔진이 아니라 그 사본이 된다.
 */
import { describe, it, expect } from 'vitest'
import { nlh } from './nlh'
import type { BettingContext } from './types'
import { initialState, applyEvent } from '../reduce'
import type { HandState, SeatInit } from '../types'

type Wager = { to: number; allIn?: boolean }

const DEEP = 1_000_000_000

/**
 * 프리플랍 레이즈 연쇄를 리듀서로 재생한다.
 * 좌석 0·1 은 블라인드, 그 뒤로 wagers 가 순서대로 앉는다 (exam 테스트와 같은 배치).
 */
function replay(bb: number, wagers: Wager[]): HandState {
  const seats: SeatInit[] = [
    { name: 'SB', stack: DEEP },
    { name: 'BB', stack: DEEP },
    ...wagers.map((w, i) => ({ name: `P${i}`, stack: w.allIn === true ? w.to : DEEP })),
  ]

  let s: HandState = initialState(seats, 0)
  s = applyEvent(s, { type: 'post_blind', seat: 0, amount: Math.floor(bb / 2), kind: 'sb' })
  s = applyEvent(s, { type: 'post_blind', seat: 1, amount: bb, kind: 'bb' })

  wagers.forEach((w, i) => {
    s = applyEvent(s, {
      type: 'player_action',
      seat: i + 2,
      action: w.allIn === true ? { kind: 'allin', to: w.to } : { kind: 'raise', to: w.to },
    })
  })
  return s
}

/** 이미 액션한 좌석에게 액션이 되돌아온 상황의 컨텍스트. */
function ctxFor(s: HandState, seat: number): BettingContext {
  return {
    currentBet: Math.max(...s.seats.map((x) => x.bet)),
    lastRaiseSize: s.lastRaiseSize,
    bigBlind: s.bigBlind,
    seatBet: s.seats[seat].bet,
    seatStack: s.seats[seat].stack,
    isOpenBet: false,
    hasActedThisRound: true,
  }
}

describe('canReopen — 제35조 4항은 누적이다', () => {
  /*
   * BLIND 1000/2000 프리플랍
   *   UTG   RAISE  4,700    폭  2,700 (풀)
   *   UTG+1 RAISE 13,500    폭  8,800 (풀)  → 이후 유효 최소 레이즈 폭 8,800
   *   MP    18,000 ALL IN   폭  4,500 (미달) → 폭 갱신 없음
   *   MP+1  23,000 ALL IN   폭  5,000 (미달) → 폭 갱신 없음
   *
   * UTG+1 이 직면한 총 증가액 = 23,000 − 13,500 = 9,500 ≥ 8,800.
   * 짧은 올인 **둘을 합쳐야** 넘는다 — 각각은 미달이다.
   */
  const SHORT_ALLINS: Wager[] = [
    { to: 4700 },
    { to: 13500 },
    { to: 18000, allIn: true },
    { to: 23000, allIn: true },
  ]

  it('짧은 올인이 합쳐서 최소 레이즈를 넘기면 레이즈할 수 있다', () => {
    const s = replay(2000, SHORT_ALLINS)
    const hero = 3 // UTG+1 — 13,500 을 레이즈했던 좌석

    // 전제부터 확인한다. 폭이 8,800 이 아니면 이 문제 자체가 성립하지 않는다.
    expect(s.lastRaiseSize).toBe(8800)
    expect(s.seats[hero].bet).toBe(13500)
    expect(Math.max(...s.seats.map((x) => x.bet))).toBe(23000)

    expect(nlh.canReopen(ctxFor(s, hero))).toBe(true)
  })

  it('레이즈 권리가 살아났으면 실제로 레이즈가 통과한다', () => {
    // canReopen 만 고치고 validateAction 이 옛 필드를 보면 조용히 갈라진다.
    const s = replay(2000, SHORT_ALLINS)
    const c = ctxFor(s, 3)
    const r = nlh.validateAction(c, { kind: 'raise', to: nlh.minRaiseTo(c) })
    expect(r.valid).toBe(true)
  })

  it('합쳐도 최소 레이즈에 못 미치면 레이즈할 수 없다', () => {
    /*
     *   UTG   RAISE  4,700   폭 2,700 (풀)
     *   UTG+1 RAISE 13,500   폭 8,800 (풀)
     *   MP    14,000 ALL IN  폭   500 (미달)
     *   MP+1  16,000 ALL IN  폭 2,000 (미달)
     * UTG+1 이 직면한 증가액 = 16,000 − 13,500 = 2,500 < 8,800 → 못 올린다.
     * 이게 시험 6번의 상황이다 (nlh.exam.test.ts).
     */
    const s = replay(2000, [
      { to: 4700 },
      { to: 13500 },
      { to: 14000, allIn: true },
      { to: 16000, allIn: true },
    ])
    expect(nlh.canReopen(ctxFor(s, 3))).toBe(false)

    const c = ctxFor(s, 3)
    const r = nlh.validateAction(c, { kind: 'raise', to: 30000 })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.corrected).toEqual({ kind: 'call', to: 16000 })
  })

  it('풀 레이즈 하나면 당연히 레이즈할 수 있다', () => {
    // 짧은 올인이 없는 평범한 경우. 누적 규칙이 기본 동작을 깨지 않는지 본다.
    const s = replay(2000, [{ to: 4700 }, { to: 13500 }])
    // UTG(좌석 2)가 직면한 증가액 = 13,500 − 4,700 = 8,800 ≥ 8,800
    expect(nlh.canReopen(ctxFor(s, 2))).toBe(true)
  })

  it('아직 액션하지 않았으면 언제나 레이즈할 수 있다', () => {
    const s = replay(2000, [{ to: 4700 }, { to: 4800, allIn: true }])
    // 짧은 올인만 있었지만 이 좌석은 이번 라운드에 아직 액션한 적이 없다
    expect(nlh.canReopen({ ...ctxFor(s, 2), hasActedThisRound: false })).toBe(true)
  })
})
