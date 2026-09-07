import { describe, expect, it } from 'vitest'
import { asksFor, WINNER_QUESTION_COUNT } from './types'
import { generateWinnerRun } from './generate'
import { GAMES } from '@/lib/games'
import { bestOmahaHi, bestOmahaLow, cardToString, compareHands, compareLow } from '@/lib/simulator'

const plo8 = GAMES.plo8
const run = (seed: string) => generateWinnerRun(plo8, seed)

describe('asksFor', () => {
  it('PLO8은 하이와 로우를 둘 다 묻는다', () => {
    expect(asksFor(GAMES.plo8)).toEqual({ hi: true, lo: true })
  })

  it('노리밋 홀덤은 로우를 묻지 않는다', () => {
    expect(asksFor(GAMES.nlh)).toEqual({ hi: true, lo: false })
  })
})

describe('generateWinnerRun', () => {
  it('10문제를 만든다', () => {
    expect(run('seed-a')).toHaveLength(WINNER_QUESTION_COUNT)
  })

  it('같은 시드는 같은 문제를 만든다', () => {
    expect(run('seed-a')).toEqual(run('seed-a'))
  })

  it('보드가 늘 5장이고 좌석마다 홀카드가 4장이며 같은 카드가 두 번 나오지 않는다', () => {
    for (const q of run('seed-b')) {
      expect(q.board).toHaveLength(5)
      for (const seat of q.seats) expect(seat.hole).toHaveLength(4)
      const all = [...q.board, ...q.seats.flatMap((s) => s.hole)].map(cardToString)
      expect(new Set(all).size).toBe(all.length)
    }
  })

  // 정답을 다시 계산해 비교한다. 생성기가 엔진이 아니라 자기 짐작으로 답을 냈다면 여기서 깨진다
  it('하이 정답이 bestOmahaHi 와 일치한다', () => {
    for (const q of run('seed-c')) {
      const ranks = q.seats.map((s) => bestOmahaHi(s.hole, q.board))
      let top = ranks[0]
      for (const r of ranks) if (compareHands(r, top) > 0) top = r
      const expected = ranks.flatMap((r, i) => (compareHands(r, top) === 0 ? [i] : []))
      expect([...q.answerHi].sort()).toEqual(expected)
    }
  })

  it('로우 정답이 bestOmahaLow 와 일치하고, 자격자가 없으면 빈 배열이다', () => {
    for (const q of run('seed-d')) {
      const lows = q.seats.map((s) => bestOmahaLow(s.hole, q.board, 8))
      const alive = lows.flatMap((l, i) => (l === null ? [] : [i]))
      if (alive.length === 0) {
        expect(q.answerLo).toEqual([])
        continue
      }
      let best = lows[alive[0]]!
      for (const i of alive) if (compareLow(lows[i]!, best) < 0) best = lows[i]!
      const expected = alive.filter((i) => compareLow(lows[i]!, best) === 0)
      expect([...q.answerLo].sort()).toEqual(expected)
    }
  })

  // 로우가 매번 없으면 「로우 없음」이 정답 고정이 되고, 매번 있으면 아무도 그 버튼을 안 누른다
  it('한 판에 로우 성립이 최소 셋, 불성립이 최소 둘 나온다', () => {
    for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
      const qs = run(seed)
      const present = qs.filter((q) => q.answerLo.length > 0).length
      expect(present).toBeGreaterThanOrEqual(3)
      expect(qs.length - present).toBeGreaterThanOrEqual(2)
    }
  })

  // 동점을 걸러내지 않는다는 것을 증명한다. 쿼터링이 실제 딜러 실수가 가장 많은 자리다
  it('동점 답이 실제로 출제된다', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => `tie-${i}`)
    const ties = seeds.flatMap(run).filter((q) => q.answerHi.length > 1 || q.answerLo.length > 1)
    expect(ties.length).toBeGreaterThan(0)
  })

  it('아직 만들지 않은 갈래는 조용히 넘어가지 않고 던진다', () => {
    // 노리밋 홀덤은 로우가 없다 — 출제 배분이 로우 성립 문제를 요구하므로 아직 낼 수 없다
    expect(() => generateWinnerRun(GAMES.nlh, 'x')).toThrow(/로우가 없는 종목/)
  })
})
