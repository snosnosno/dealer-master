/**
 * 정답을 생성기가 쓰지 않은 경로로 다시 구해 맞춘다.
 * 생성기가 스스로를 채점하면 틀린 것도 맞다고 한다.
 */
import { describe, expect, it } from 'vitest'
import { GAMES, evaluatorFor } from '@/lib/games'
import { awardPots, type PotAward } from '@/lib/simulator'
import { generatePotAwardRun } from './generate'
import { POTAWARD_QUESTION_COUNT, POTAWARD_SEAT_COUNT } from './types'

const SEEDS = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9', 'j0']
const ev = evaluatorFor(GAMES.plo8)

const total = (awards: PotAward[], half: 'hi' | 'lo') =>
  awards.filter((a) => a.half === half).reduce((sum, a) => sum + a.amount, 0)

describe('generatePotAwardRun', () => {
  it.each(SEEDS)('시드 %s: 열 문제가 나온다', (seed) => {
    expect(generatePotAwardRun(GAMES.plo8, seed)).toHaveLength(POTAWARD_QUESTION_COUNT)
  })

  it.each(SEEDS)('시드 %s: 같은 시드는 같은 판을 낸다', (seed) => {
    const a = generatePotAwardRun(GAMES.plo8, seed)
    const b = generatePotAwardRun(GAMES.plo8, seed)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it.each(SEEDS)('시드 %s: 정답이 awardPots 재계산과 일치한다', (seed) => {
    for (const q of generatePotAwardRun(GAMES.plo8, seed)) {
      const hole = q.seats.map((s) => s.hole)
      const awards = awardPots(q.pots, hole, q.board, q.buttonSeat, ev)
      const forPot = awards.filter((a) => a.potIndex === q.potIndex)

      // 로우 절반만 로우 지급자를 묻는다. 나머지 셋은 전부 하이 쪽 임자다 —
      // 홀칩도 「반으로 가르고 남는 칩은 하이에게」라서 하이 지급자다
      const expected =
        q.kind === 'lohalf'
          ? forPot.filter((a) => a.half === 'lo').map((a) => a.seat)
          : forPot.filter((a) => a.half === 'hi').map((a) => a.seat)

      expect(new Set(q.answerSeats)).toEqual(new Set(expected))
    }
  })

  it.each(SEEDS)('시드 %s: 홀칩 문제는 실제로 반으로 갈려 한 칩이 남은 팟이다', (seed) => {
    for (const q of generatePotAwardRun(GAMES.plo8, seed)) {
      if (q.kind !== 'oddchip') continue
      const hole = q.seats.map((s) => s.hole)
      const forPot = awardPots(q.pots, hole, q.board, q.buttonSeat, ev)
        .filter((a) => a.potIndex === q.potIndex)

      // 로우가 성립해 실제로 갈렸고, 하이 절반이 로우 절반보다 크다 = 남는 칩이 하이로 갔다
      expect(forPot.some((a) => a.half === 'lo')).toBe(true)
      expect(total(forPot, 'hi')).toBeGreaterThan(total(forPot, 'lo'))
      // 하이가 한 명이라야 「남는 칩은 누구에게」의 답이 하나로 떨어진다
      expect(q.answerSeats).toHaveLength(1)
    }
  })

  it.each(SEEDS)('시드 %s: 사이드팟 문제는 로우 없이 통째로 가는 팟이다', (seed) => {
    for (const q of generatePotAwardRun(GAMES.plo8, seed)) {
      if (q.kind !== 'sidepot') continue
      const hole = q.seats.map((s) => s.hole)
      const awards = awardPots(q.pots, hole, q.board, q.buttonSeat, ev)

      expect(q.potIndex).toBeGreaterThanOrEqual(1)
      const forPot = awards.filter((a) => a.potIndex === q.potIndex)
      // 이 팟에 로우가 있으면 「이 사이드팟은 누가」의 정답이 둘로 갈린다
      expect(forPot.some((a) => a.half === 'lo')).toBe(false)
      expect(total(forPot, 'hi')).toBe(q.pots[q.potIndex].amount)
      // 메인팟에는 로우가 있어야 자격이 갈린다는 대비가 산다 (설계 §4-3)
      expect(awards.some((a) => a.potIndex === 0 && a.half === 'lo')).toBe(true)
    }
  })

  it.each(SEEDS)('시드 %s: 정답 좌석은 그 팟의 자격자다', (seed) => {
    for (const q of generatePotAwardRun(GAMES.plo8, seed)) {
      for (const seat of q.answerSeats) {
        expect(q.pots[q.potIndex].eligibleSeats).toContain(seat)
      }
    }
  })

  it.each(SEEDS)('시드 %s: 좌석 수와 홀카드 장수가 스펙대로다', (seed) => {
    for (const q of generatePotAwardRun(GAMES.plo8, seed)) {
      expect(q.seats).toHaveLength(POTAWARD_SEAT_COUNT)
      for (const s of q.seats) expect(s.hole).toHaveLength(GAMES.plo8.holeCardCount)
    }
  })

  it('한 판에 사이드팟 문제가 적어도 하나 나온다', () => {
    // 유형 목표가 배분을 보장하므로 시드와 무관하게 성립해야 한다
    for (const seed of SEEDS) {
      const kinds = generatePotAwardRun(GAMES.plo8, seed).map((q) => q.kind)
      expect(kinds).toContain('sidepot')
    }
  })

  it('한 판에 로우 절반 문제가 적어도 하나 나온다', () => {
    for (const seed of SEEDS) {
      const kinds = generatePotAwardRun(GAMES.plo8, seed).map((q) => q.kind)
      expect(kinds).toContain('lohalf')
    }
  })
})
