/**
 * 정답을 생성기가 쓰지 않은 경로로 다시 구해 맞춘다.
 * 생성기가 스스로를 채점하면 틀린 것도 맞다고 한다.
 */
import { describe, expect, it } from 'vitest'
import { GAMES, evaluatorFor } from '@/lib/games'
import { awardPots, ODD_CHIP_UNIT, type PotAward } from '@/lib/simulator'
import { generatePotAwardRun } from './generate'
import { potName } from './potname'
import {
  POTAWARD_MAX_LAYERS, POTAWARD_QUESTION_COUNT, POTAWARD_SEAT_COUNT,
  type PotAwardQuestion,
} from './types'

const SEEDS = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9', 'j0']
/** 층 수·팟 번호처럼 판마다 달라지는 것은 여러 판을 모아야 보인다 */
const MANY = Array.from({ length: 40 }, (_, i) => `run-${i}`)
const ev = evaluatorFor(GAMES.plo8)

const run = (seed: string) => generatePotAwardRun(GAMES.plo8, seed)
const every = (seeds: readonly string[]) => seeds.flatMap(run)

const total = (awards: PotAward[], half: 'hi' | 'lo') =>
  awards.filter((a) => a.half === half).reduce((sum, a) => sum + a.amount, 0)

/** 문제의 팟을 엔진에게 다시 물어 그 층의 지급표만 남긴다 */
const awardsFor = (q: PotAwardQuestion) =>
  awardPots(q.pots, q.seats.map((s) => s.hole), q.board, q.buttonSeat, ev)
    .filter((a) => a.potIndex === q.potIndex)

describe('generatePotAwardRun', () => {
  it.each(SEEDS)('시드 %s: 열 문제가 나온다', (seed) => {
    expect(run(seed)).toHaveLength(POTAWARD_QUESTION_COUNT)
  })

  it.each(SEEDS)('시드 %s: 같은 시드는 같은 판을 낸다', (seed) => {
    expect(JSON.stringify(run(seed))).toBe(JSON.stringify(run(seed)))
  })

  it.each(SEEDS)('시드 %s: 정답 좌석이 awardPots 재계산과 일치한다', (seed) => {
    for (const q of run(seed)) {
      const forPot = awardsFor(q)
      // 로우 절반만 로우 지급자를 묻는다. 나머지 셋은 전부 하이 쪽 임자다 —
      // 홀칩도 「반으로 가르고 남는 칩은 하이에게」라서 하이 지급자다
      const expected =
        q.kind === 'lohalf'
          ? forPot.filter((a) => a.half === 'lo').map((a) => a.seat)
          : forPot.filter((a) => a.half === 'hi').map((a) => a.seat)
      expect(new Set(q.answerSeats)).toEqual(new Set(expected))
    }
  })

  it.each(SEEDS)('시드 %s: 정답 금액이 awardPots 재계산과 일치한다', (seed) => {
    for (const q of run(seed)) {
      const forPot = awardsFor(q)
      // 사이드팟은 통째로 가므로 팟 금액, 나머지는 그 절반의 지급 합계다
      const expected =
        q.kind === 'sidepot'
          ? q.pots[q.potIndex].amount
          : total(forPot, q.kind === 'lohalf' ? 'lo' : 'hi')
      expect(q.answerAmount).toBe(expected)
    }
  })

  it.each(SEEDS)('시드 %s: 정답 금액이 그 팟 안에서 말이 된다', (seed) => {
    for (const q of run(seed)) {
      const pot = q.pots[q.potIndex].amount
      expect(q.answerAmount).toBeGreaterThan(0)
      expect(q.answerAmount % ODD_CHIP_UNIT).toBe(0)
      // 한 팟에서 나갈 수 있는 돈은 그 팟을 넘지 못한다
      expect(q.answerAmount).toBeLessThanOrEqual(pot)
      // 절반을 묻는 유형이면 반올림 오차 한 칩 안에서 절반이다
      if (q.kind === 'hihalf' || q.kind === 'lohalf' || q.kind === 'oddchip') {
        expect(Math.abs(q.answerAmount * 2 - pot)).toBeLessThanOrEqual(ODD_CHIP_UNIT)
      }
    }
  })

  it.each(SEEDS)('시드 %s: 금액칸 이름이 비어 있지 않다', (seed) => {
    for (const q of run(seed)) expect(q.amountLabel.length).toBeGreaterThan(0)
  })

  it.each(SEEDS)('시드 %s: 홀칩 문제는 실제로 반으로 갈려 한 칩이 남은 팟이다', (seed) => {
    for (const q of run(seed)) {
      if (q.kind !== 'oddchip') continue
      const forPot = awardsFor(q)
      // 로우가 성립해 실제로 갈렸고, 하이 절반이 로우 절반보다 한 칩 크다
      expect(forPot.some((a) => a.half === 'lo')).toBe(true)
      expect(total(forPot, 'hi') - total(forPot, 'lo')).toBe(ODD_CHIP_UNIT)
      // 하이가 한 명이라야 「남는 칩은 누구에게」의 답이 하나로 떨어진다
      expect(q.answerSeats).toHaveLength(1)
    }
  })

  it.each(SEEDS)('시드 %s: 사이드팟 문제는 로우 없이 통째로 가는 위층 팟이다', (seed) => {
    for (const q of run(seed)) {
      if (q.kind !== 'sidepot') continue
      const forPot = awardsFor(q)
      expect(q.potIndex).toBeGreaterThanOrEqual(1)
      // 이 팟에 로우가 있으면 「이 팟은 누가」의 정답이 둘로 갈린다
      expect(forPot.some((a) => a.half === 'lo')).toBe(false)
      expect(total(forPot, 'hi')).toBe(q.pots[q.potIndex].amount)
      // 메인팟에는 로우가 있어야 자격이 갈린다는 대비가 산다 (설계 §4-3)
      const all = awardPots(q.pots, q.seats.map((s) => s.hole), q.board, q.buttonSeat, ev)
      expect(all.some((a) => a.potIndex === 0 && a.half === 'lo')).toBe(true)
    }
  })

  it.each(SEEDS)('시드 %s: 정답 좌석은 그 팟의 자격자다', (seed) => {
    for (const q of run(seed)) {
      for (const seat of q.answerSeats) {
        expect(q.pots[q.potIndex].eligibleSeats).toContain(seat)
      }
    }
  })

  it.each(SEEDS)('시드 %s: 좌석 수와 홀카드 장수가 스펙대로다', (seed) => {
    for (const q of run(seed)) {
      expect(q.seats).toHaveLength(POTAWARD_SEAT_COUNT)
      for (const s of q.seats) expect(s.hole).toHaveLength(GAMES.plo8.holeCardCount)
    }
  })

  // --- 층이 실제로 갈리는가 ---------------------------------------------------

  it.each(SEEDS)('시드 %s: 팟 층이 1~3 이고 묻는 층이 그 안에 있다', (seed) => {
    for (const q of run(seed)) {
      expect(q.pots.length).toBeGreaterThanOrEqual(1)
      expect(q.pots.length).toBeLessThanOrEqual(POTAWARD_MAX_LAYERS)
      expect(q.potIndex).toBeLessThan(q.pots.length)
    }
  })

  it('메인팟만 있는 판도, 세컨드팟까지도, 서드팟까지도 나온다', () => {
    const layers = new Set(every(MANY).map((q) => q.pots.length))
    expect(layers).toEqual(new Set([1, 2, 3]))
  })

  it('메인팟이 아닌 층의 승자도 묻는다', () => {
    // 예전에는 하이/로우 절반이 늘 메인팟이었다 — 세컨드팟의 절반도 딜러가 가른다
    const halves = every(MANY).filter((q) => q.kind === 'hihalf' || q.kind === 'lohalf')
    expect(halves.some((q) => q.potIndex >= 1)).toBe(true)
    expect(halves.some((q) => q.potIndex === 0)).toBe(true)
  })

  it('서드팟을 묻는 문제가 나온다', () => {
    expect(every(MANY).some((q) => q.potIndex === 2)).toBe(true)
  })

  it('층마다 자격자가 줄어든다 — 위층일수록 좁다', () => {
    for (const q of every(SEEDS)) {
      for (let i = 1; i < q.pots.length; i++) {
        expect(q.pots[i].eligibleSeats.length).toBeLessThan(q.pots[i - 1].eligibleSeats.length)
      }
    }
  })

  it('팟 이름이 층 순서대로 붙는다', () => {
    expect(potName(0)).toBe('메인팟')
    expect(potName(1)).toBe('세컨드팟')
    expect(potName(2)).toBe('서드팟')
    // 이름이 모자라도 화면이 비지 않는다
    expect(potName(3)).toBe('4번째 팟')
  })

  it('근거 한 줄에 팟 이름과 금액이 함께 들어 있다', () => {
    for (const q of every(SEEDS)) {
      expect(q.why).toContain(potName(q.potIndex))
      expect(q.why).toContain(q.answerAmount.toLocaleString('ko-KR'))
    }
  })

  // --- 유형 배분 -------------------------------------------------------------

  it('한 판에 사이드팟 문제가 적어도 하나 나온다', () => {
    // 유형 목표가 배분을 보장하므로 시드와 무관하게 성립해야 한다
    for (const seed of SEEDS) expect(run(seed).map((q) => q.kind)).toContain('sidepot')
  })

  it('한 판에 로우 절반 문제가 적어도 하나 나온다', () => {
    for (const seed of SEEDS) expect(run(seed).map((q) => q.kind)).toContain('lohalf')
  })
})
