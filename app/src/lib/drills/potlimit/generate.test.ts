import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import { pl } from '@/lib/simulator'
import { generatePotLimitRun } from './generate'
import { POTLIMIT_QUESTION_COUNT } from './types'

const SEEDS = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8']

describe('generatePotLimitRun', () => {
  it.each(SEEDS)('시드 %s: 열 문제가 나온다', (seed) => {
    expect(generatePotLimitRun(GAMES.plo8, seed)).toHaveLength(POTLIMIT_QUESTION_COUNT)
  })

  it.each(SEEDS)('시드 %s: 같은 시드는 같은 판을 낸다', (seed) => {
    expect(JSON.stringify(generatePotLimitRun(GAMES.plo8, seed)))
      .toBe(JSON.stringify(generatePotLimitRun(GAMES.plo8, seed)))
  })

  it.each(SEEDS)('시드 %s: 정답이 pl.maxRaiseTo 재계산과 일치한다', (seed) => {
    for (const q of generatePotLimitRun(GAMES.plo8, seed)) {
      const currentBet = Math.max(0, ...q.seats.map((s) => s.bet))
      const onTable = q.collected + q.seats.reduce((sum, s) => sum + s.bet, 0)
      const again = pl.maxRaiseTo({
        currentBet,
        lastRaiseSize: 0,
        bigBlind: 1000,
        seatBet: q.seats[q.heroSeat].bet,
        seatStack: 100_000_000,
        isOpenBet: currentBet === 0,
        hasActedThisRound: false,
        pot: onTable,
      })
      expect(q.answer).toBe(again)
    }
  })

  it.each(SEEDS)('시드 %s: 정답이 0 보다 크고 칩 단위로 떨어진다', (seed) => {
    for (const q of generatePotLimitRun(GAMES.plo8, seed)) {
      expect(q.answer).toBeGreaterThan(0)
      expect(q.answer % 100).toBe(0)
    }
  })

  it('두 유형이 다 나온다', () => {
    for (const seed of SEEDS) {
      const kinds = generatePotLimitRun(GAMES.plo8, seed).map((q) => q.kind)
      expect(kinds).toContain('potbet')
      expect(kinds).toContain('potraise')
    }
  })

  it('팟리밋이 아닌 종목은 던진다', () => {
    expect(() => generatePotLimitRun(GAMES.nlh, 'a1')).toThrow()
  })
})
