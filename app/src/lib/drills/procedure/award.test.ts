import { describe, expect, it } from 'vitest'
import { bestFiveLow, bestOmahaHi, bestOmahaLow, cards, compareHands, compareLow } from '@/lib/simulator'
import { GAMES } from '@/lib/games'
import { awardAnswer, awardMatches } from './award'
import { reduce, startProcedure } from './reduce'
import { stepCorrectly } from './testkit'
import type { ProcedureState } from './types'

/** 팟 지급 직전(쇼다운)까지 정답으로만 간다 */
function atShowdown(spec: typeof GAMES.razz, seed: string): ProcedureState {
  let state = startProcedure(spec, seed)
  for (let guard = 0; guard < 200; guard++) {
    if (state.phase === 'palette' && state.steps[state.at].act === 'payout') return state
    state = stepCorrectly(state)
  }
  throw new Error(`${seed}: 팟 지급에 닿지 못했다`)
}

/** 좌석 번호 집합 — 엔진 비교기로 따로 센다. `award.ts` 를 믿지 않는다 */
function bestOf<T>(alive: number[], rank: (i: number) => T, cmp: (a: T, b: T) => number): number[] {
  const top = alive.map(rank).reduce((a, b) => (cmp(b, a) > 0 ? b : a))
  return alive.filter((i) => cmp(rank(i), top) === 0)
}

describe('awardAnswer — 라즈', () => {
  it('살아 있는 좌석 중 A-5 로우가 가장 좋은 좌석이 로우 승자이고 하이는 묻지 않는다', () => {
    for (const seed of ['a1', 'b2', 'razz-2', 'razz-3', 'razz-355']) {
      const { table } = atShowdown(GAMES.razz, seed)
      const alive = table.seats.flatMap((s, i) => (s.folded ? [] : [i]))
      // 낮을수록 좋으니 부호를 뒤집어 「클수록 좋다」로 센다
      const want = bestOf(
        alive,
        (i) => bestFiveLow(cards(table.seats[i].hole), null)!,
        (a, b) => -compareLow(a, b),
      )
      const got = awardAnswer(GAMES.razz, table)
      expect(got.hi, seed).toEqual([])
      expect(got.lo, seed).toEqual(want)
    }
  })

  it('폴드한 좌석은 로우가 더 좋아도 팟을 받지 못한다', () => {
    const { table } = atShowdown(GAMES.razz, 'a1')
    const winner = awardAnswer(GAMES.razz, table).lo[0]
    const aliveOthers = table.seats.flatMap((s, i) => (s.folded || i === winner ? [] : [i]))
    expect(aliveOthers.length).toBeGreaterThan(0)
    // 이긴 좌석을 접으면 답이 다른 좌석으로 넘어가야 한다
    const folded = { ...table, seats: table.seats.map((s, i) => (i === winner ? { ...s, folded: true } : s)) }
    const next = awardAnswer(GAMES.razz, folded).lo
    expect(next).not.toContain(winner)
    expect(next.every((i) => aliveOthers.includes(i))).toBe(true)
  })
})

describe('awardAnswer — PLO8', () => {
  it('하이와 로우를 따로 가리고, 로우 자격자가 없으면 로우는 빈 배열이다', () => {
    let sawNoLow = false
    let sawLow = false
    for (let s = 0; s < 30; s++) {
      const { table } = atShowdown(GAMES.plo8, `plo8-award-${s}`)
      const alive = table.seats.flatMap((seat, i) => (seat.folded ? [] : [i]))
      const hole = (i: number) => cards(table.seats[i].hole)
      const wantHi = bestOf(alive, (i) => bestOmahaHi(hole(i), table.board), compareHands)
      const lows = alive.filter((i) => bestOmahaLow(hole(i), table.board, 8) !== null)
      const wantLo = lows.length === 0
        ? []
        : bestOf(lows, (i) => bestOmahaLow(hole(i), table.board, 8)!, (a, b) => -compareLow(a, b))

      const got = awardAnswer(GAMES.plo8, table)
      expect(got.hi).toEqual(wantHi)
      expect(got.lo).toEqual(wantLo)
      if (wantLo.length === 0) sawNoLow = true
      else sawLow = true
    }
    // 두 갈래가 다 나와야 위 단언이 무언가를 지켰다
    expect(sawNoLow).toBe(true)
    expect(sawLow).toBe(true)
  })
})

describe('awardMatches', () => {
  it('순서와 상관없이 같은 좌석 집합이면 맞다', () => {
    expect(awardMatches({ hi: [1, 3], lo: [] }, { hi: [3, 1], lo: [] })).toBe(true)
  })

  it('동률 좌석 하나만 고르면 틀린다 — 나눠 받는 사람을 빠뜨리면 지급이 틀린다', () => {
    expect(awardMatches({ hi: [1, 3], lo: [] }, { hi: [1], lo: [] })).toBe(false)
  })

  it('로우 없음을 고른 것과 로우 승자를 고른 것은 다르다', () => {
    expect(awardMatches({ hi: [2], lo: [4] }, { hi: [2], lo: [] })).toBe(false)
  })
})

describe('reduce — 팟 지급은 누구에게 줄지 고른 뒤에 끝난다', () => {
  it('팟 지급을 누르면 손이 열리고, 끝나지 않은 채 승자를 기다린다', () => {
    const shown = reduce(atShowdown(GAMES.razz, 'a1'), { type: 'palette', act: 'payout' })
    expect(shown.phase).toBe('awardSeat')
    expect(shown.table.seats.filter((s) => !s.folded).every((s) => s.revealed)).toBe(true)
  })

  it('틀린 좌석에 주면 막힘이 늘고 끝나지 않는다', () => {
    const shown = reduce(atShowdown(GAMES.razz, 'a1'), { type: 'palette', act: 'payout' })
    const right = awardAnswer(GAMES.razz, shown.table).lo
    const wrong = shown.table.seats.findIndex((s, i) => !s.folded && !right.includes(i))
    const next = reduce(shown, { type: 'award', hi: [], lo: [wrong] })
    expect(next.stuck).toBe(shown.stuck + 1)
    expect(next.phase).toBe('awardSeat')
    expect(next.hint).toBeTruthy()
  })

  it('맞는 좌석에 주면 끝나고 로그에 받은 좌석이 남는다', () => {
    const shown = reduce(atShowdown(GAMES.razz, 'a1'), { type: 'palette', act: 'payout' })
    const right = awardAnswer(GAMES.razz, shown.table)
    const next = reduce(shown, { type: 'award', ...right })
    expect(next.phase).toBe('done')
    expect(next.stuck).toBe(shown.stuck)
    expect(next.log.at(-1)).toContain(shown.table.seats[right.lo[0]].name)
  })

  it('승자를 고르는 중에는 팔레트를 받지 않는다', () => {
    const shown = reduce(atShowdown(GAMES.razz, 'a1'), { type: 'palette', act: 'payout' })
    const next = reduce(shown, { type: 'palette', act: 'payout' })
    expect(next.phase).toBe('awardSeat')
    expect(next.stuck).toBe(shown.stuck + 1)
  })
})
