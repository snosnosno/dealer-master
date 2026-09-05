import { describe, expect, it } from 'vitest'
import { bestOmahaLow, compareLow } from '@/lib/simulator'
import { generateLowRun } from './generate'
import { LOW_QUESTION_COUNT } from './types'

const seeds = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6']

describe('generateLowRun', () => {
  it('10문제를 만든다', () => {
    expect(generateLowRun('seed-1')).toHaveLength(LOW_QUESTION_COUNT)
  })

  it('같은 시드는 같은 문제를 만든다', () => {
    expect(JSON.stringify(generateLowRun('seed-1')))
      .toBe(JSON.stringify(generateLowRun('seed-1')))
  })

  it('세 유형이 모두 나온다', () => {
    const kinds = new Set(generateLowRun('seed-1').map((q) => q.kind))
    expect(kinds).toEqual(new Set(['lo-possible', 'lo-qualified', 'lo-best']))
  })

  it('보드가 늘 5장이고 좌석마다 홀카드가 4장이다', () => {
    for (const q of generateLowRun('seed-1')) {
      expect(q.board).toHaveLength(5)
      for (const seat of q.seats) expect(seat.hole).toHaveLength(4)
    }
  })

  it.each(seeds)('시드 %s: 정답이 엔진과 일치한다', (seed) => {
    for (const q of generateLowRun(seed)) {
      const lows = q.seats.map((s) => bestOmahaLow(s.hole, q.board, 8))

      if (q.kind === 'lo-possible') {
        expect(q.answerYes).toBe(lows.some((l) => l !== null))
      }
      if (q.kind === 'lo-qualified') {
        const actual = lows.flatMap((l, i) => (l === null ? [] : [i]))
        expect([...q.answerSeats].sort()).toEqual(actual.sort())
        expect(actual.length).toBeGreaterThan(0)
      }
      if (q.kind === 'lo-best') {
        const answerLow = lows[q.answerSeat]
        expect(answerLow).not.toBeNull()
        lows.forEach((low, i) => {
          if (i === q.answerSeat || low === null) return
          expect(compareLow(low, answerLow!)).toBeGreaterThan(0)
        })
      }
    }
  })

  it('로우 승자 문제는 자격자가 둘 이상이고 단독 승자가 있다', () => {
    for (const seed of seeds) {
      for (const q of generateLowRun(seed)) {
        if (q.kind !== 'lo-best') continue
        const lows = q.seats.map((s) => bestOmahaLow(s.hole, q.board, 8))
        expect(lows.filter((l) => l !== null).length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('같은 카드가 두 번 나오지 않는다', () => {
    for (const q of generateLowRun('seed-1')) {
      const all = [...q.seats.flatMap((s) => s.hole), ...q.board].map((c) => c.rank + c.suit)
      expect(new Set(all).size).toBe(all.length)
    }
  })
})
