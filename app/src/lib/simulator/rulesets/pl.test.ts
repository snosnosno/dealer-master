/**
 * 팟리밋 최대 레이즈.
 *
 * 자료 정본: 「팟벳 = 마지막 배팅을 콜 하는 데 필요한 금액 + 콜 한 후에 팟에 있는 금액」.
 * 콜한 뒤의 팟에는 방금 넣은 콜도 들어 있으므로 **콜 금액이 두 번 더해진다.**
 */
import { describe, expect, it } from 'vitest'
import { pl } from './pl'
import type { BettingContext } from './types'

const ctx = (over: Partial<BettingContext>): BettingContext => ({
  currentBet: 0,
  lastRaiseSize: 0,
  bigBlind: 1000,
  seatBet: 0,
  seatStack: 100_000_000,
  isOpenBet: true,
  hasActedThisRound: false,
  pot: 0,
  ...over,
})

describe('pl.maxRaiseTo', () => {
  /*
   * 가이드 p2~p4 의 두 항짜리 예제 (`docs/references/mixgame-facts.md` §1).
   * SB/BB 10,000에서 UTG 팟벳 = 10,000(콜) + 10,000 + 10,000 + 10,000 = 40,000.
   * 이어서 MP 팟벳 = 40,000(콜) + 10,000 + 10,000 + 40,000 + 40,000 = 140,000.
   */
  it('가이드 예제 1 — SB/BB 10,000에서 UTG 팟벳은 40,000이다', () => {
    // 테이블 위 = SB 10,000 + BB 10,000 = 20,000
    expect(pl.maxRaiseTo(ctx({ currentBet: 10_000, pot: 20_000 }))).toBe(40_000)
  })

  it('가이드 예제 2 — 팟 60,000에 40,000 벳이면 140,000이다', () => {
    // 테이블 위 60,000 = SB 10,000 + BB 10,000 + UTG가 앞에 놓은 40,000.
    // 벳을 팟에 한 번 더 더하지 않는다 — 자료의 60,000이 이미 그것을 품고 있다.
    expect(pl.maxRaiseTo(ctx({ currentBet: 40_000, pot: 60_000 }))).toBe(140_000)
  })

  it('앞에 벳이 없으면 팟 금액 그대로다 — 공식은 하나다', () => {
    expect(pl.maxRaiseTo(ctx({ currentBet: 0, pot: 60_000 }))).toBe(60_000)
  })

  it('이미 낸 금액은 콜 금액에서 빠진다', () => {
    // 콜 금액 = 40,000 - 10,000 = 30,000 → 40,000 + 100,000 + 30,000
    expect(pl.maxRaiseTo(ctx({ currentBet: 40_000, seatBet: 10_000, pot: 100_000 }))).toBe(170_000)
  })

  it('스택을 넘지 못한다 — 올인이 상한이다', () => {
    expect(
      pl.maxRaiseTo(ctx({ currentBet: 40_000, seatBet: 10_000, seatStack: 20_000, pot: 100_000 })),
    ).toBe(30_000)
  })

  it('최소 레이즈와 리오픈 규칙은 노리밋과 같다', () => {
    const c = ctx({ currentBet: 40_000, lastRaiseSize: 40_000 })
    expect(pl.minRaiseTo(c)).toBe(80_000)
  })

  it('id 가 pl 이다', () => {
    expect(pl.id).toBe('pl')
  })
})
