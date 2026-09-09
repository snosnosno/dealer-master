/**
 * 정답을 생성기가 쓰지 않은 경로로 다시 구해 맞춘다.
 * 생성기가 스스로를 채점하면 틀린 것도 맞다고 한다.
 */
import { describe, expect, it } from 'vitest'
import { GAMES, evaluatorFor } from '@/lib/games'
import { awardPots } from '@/lib/simulator'
import { generatePotAwardRun } from './generate'
import { potName } from './potname'
import {
  POTAWARD_KIND_QUOTA, POTAWARD_LAYERS, POTAWARD_LIMIT_SEC, POTAWARD_NO_LOW_MIN,
  POTAWARD_QUESTION_COUNT, POTAWARD_SCOOP_MIN, POTAWARD_SEAT_COUNT,
  type PotAwardKind, type PotAwardPotAnswer, type PotAwardQuestion,
} from './types'

const SEEDS = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9', 'j0']
const ev = evaluatorFor(GAMES.plo8)

const run = (seed: string) => generatePotAwardRun(GAMES.plo8, seed)
const every = (seeds: readonly string[]) => seeds.flatMap(run)

const isScoop = (a: PotAwardPotAnswer) =>
  a.hi.length === 1 && a.lo.length === 1 && a.hi[0] === a.lo[0]

/** 문제의 팟을 엔진에게 다시 물어 층마다 임자를 되짚는다 */
function recompute(q: PotAwardQuestion): PotAwardPotAnswer[] {
  const awards = awardPots(q.pots, q.seats.map((s) => s.hole), q.board, q.buttonSeat, ev)
  return q.pots.map((_, i) => ({
    hi: awards.filter((a) => a.potIndex === i && a.half === 'hi').map((a) => a.seat).sort(),
    lo: awards.filter((a) => a.potIndex === i && a.half === 'lo').map((a) => a.seat).sort(),
  }))
}

describe('generatePotAwardRun', () => {
  it.each(SEEDS)('시드 %s: 열 문제가 나온다', (seed) => {
    expect(run(seed)).toHaveLength(POTAWARD_QUESTION_COUNT)
  })

  it.each(SEEDS)('시드 %s: 같은 시드는 같은 판을 낸다', (seed) => {
    expect(JSON.stringify(run(seed))).toBe(JSON.stringify(run(seed)))
  })

  it.each(SEEDS)('시드 %s: 층마다의 임자가 awardPots 재계산과 일치한다', (seed) => {
    for (const q of run(seed)) {
      const again = recompute(q)
      expect(q.answers).toHaveLength(again.length)
      q.answers.forEach((a, i) => {
        expect(new Set(a.hi)).toEqual(new Set(again[i].hi))
        expect(new Set(a.lo)).toEqual(new Set(again[i].lo))
      })
    }
  })

  it.each(SEEDS)('시드 %s: 답이 팟마다 하나씩 있고 하이는 늘 임자가 있다', (seed) => {
    for (const q of run(seed)) {
      expect(q.answers).toHaveLength(q.pots.length)
      expect(q.reasons).toHaveLength(q.pots.length)
      for (const a of q.answers) expect(a.hi.length).toBeGreaterThan(0)
    }
  })

  it.each(SEEDS)('시드 %s: 임자는 그 층의 자격자다', (seed) => {
    for (const q of run(seed)) {
      q.answers.forEach((a, i) => {
        for (const seat of [...a.hi, ...a.lo]) {
          expect(q.pots[i].eligibleSeats).toContain(seat)
        }
      })
    }
  })

  it.each(SEEDS)('시드 %s: 층 수가 유형과 맞고 제한시간도 유형대로다', (seed) => {
    for (const q of run(seed)) {
      expect(q.pots).toHaveLength(POTAWARD_LAYERS[q.kind])
      expect(q.limitSec).toBe(POTAWARD_LIMIT_SEC[q.kind])
    }
  })

  it.each(SEEDS)('시드 %s: 층 배분이 정해진 몫대로다', (seed) => {
    const counts = run(seed).reduce<Record<string, number>>((acc, q) => {
      acc[q.kind] = (acc[q.kind] ?? 0) + 1
      return acc
    }, {})
    for (const [kind, want] of Object.entries(POTAWARD_KIND_QUOTA) as [PotAwardKind, number][]) {
      expect(counts[kind] ?? 0).toBe(want)
    }
  })

  it.each(SEEDS)('시드 %s: 위층일수록 자격자가 좁아진다', (seed) => {
    for (const q of run(seed)) {
      for (let i = 1; i < q.pots.length; i++) {
        expect(q.pots[i].eligibleSeats.length).toBeLessThan(q.pots[i - 1].eligibleSeats.length)
      }
    }
  })

  it.each(SEEDS)('시드 %s: 좌석 수와 홀카드 장수가 스펙대로다', (seed) => {
    for (const q of run(seed)) {
      expect(q.seats).toHaveLength(POTAWARD_SEAT_COUNT)
      for (const s of q.seats) expect(s.hole).toHaveLength(GAMES.plo8.holeCardCount)
    }
  })

  // --- 판단이 갈리는 판이 실제로 나오는가 --------------------------------------

  it.each(SEEDS)('시드 %s: 스쿱 판이 하한만큼 나온다', (seed) => {
    const scoops = run(seed).filter((q) => q.answers.some(isScoop))
    expect(scoops.length).toBeGreaterThanOrEqual(POTAWARD_SCOOP_MIN)
  })

  it.each(SEEDS)('시드 %s: 로우가 아예 없는 판이 하한만큼 나온다', (seed) => {
    const noLow = run(seed).filter((q) => q.answers.every((a) => a.lo.length === 0))
    expect(noLow.length).toBeGreaterThanOrEqual(POTAWARD_NO_LOW_MIN)
  })

  it.each(SEEDS)('시드 %s: 하이·로우가 갈리는 판도 나온다', (seed) => {
    const split = run(seed).filter((q) =>
      q.answers.some((a) => a.lo.length > 0 && !isScoop(a)),
    )
    expect(split.length).toBeGreaterThan(0)
  })

  it('여러 명이 나눠 갖는 층이 나온다 — 하이든 로우든 동점이 있다', () => {
    const shared = every(SEEDS).some((q) =>
      q.answers.some((a) => a.hi.length > 1 || a.lo.length > 1),
    )
    expect(shared).toBe(true)
  })

  it('층마다 임자가 달라지는 판이 나온다 — 그게 사이드팟을 가르는 이유다', () => {
    const differs = every(SEEDS).some((q) =>
      q.answers.some((a, i) => i > 0 && a.hi.join() !== q.answers[0].hi.join()),
    )
    expect(differs).toBe(true)
  })

  // --- 근거 ------------------------------------------------------------------

  it('근거가 층마다 한 줄이고 그 층 이름을 담는다', () => {
    for (const q of every(SEEDS)) {
      q.reasons.forEach((line, i) => {
        expect(line).toContain(potName(i))
        expect(line).toContain(q.pots[i].amount.toLocaleString('ko-KR'))
      })
    }
  })

  it('스쿱한 층의 근거는 스쿱이라고 말한다', () => {
    for (const q of every(SEEDS)) {
      q.answers.forEach((a, i) => {
        if (isScoop(a)) expect(q.reasons[i]).toContain('스쿱')
      })
    }
  })

  it('로우가 없는 층의 근거는 하이가 통째로 가져간다고 말한다', () => {
    for (const q of every(SEEDS)) {
      q.answers.forEach((a, i) => {
        if (a.lo.length === 0) expect(q.reasons[i]).toContain('통째로')
      })
    }
  })
})
