import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import { firstToActSeat } from './steps'
import { reduce, startProcedure } from './reduce'
import type { ProcedureState } from './types'

const start = () => startProcedure(GAMES.plo8, 'seed-1')

/** 지금 상태가 요구하는 올바른 입력 하나를 만들어 넣는다. */
function stepCorrectly(state: ProcedureState): ProcedureState {
  if (state.phase === 'anim') return reduce(state, { type: 'animEnd' })
  if (state.phase === 'openSeat') {
    const street = state.spec.streets[state.steps[state.at].streetIndex]
    const seat = firstToActSeat(
      street.firstToAct,
      state.script.buttonSeat,
      state.table.seats.length,
      state.table.seats.map((s) => s.folded),
    )
    return reduce(state, { type: 'seat', seat })
  }
  const act = state.steps[state.at].act
  if (act === 'open') throw new Error('open 은 팔레트가 아니다')
  return reduce(state, { type: 'palette', act })
}

describe('startProcedure', () => {
  it('팔레트를 기다리며 시작하고 막힘이 0 이다', () => {
    const state = start()
    expect(state.phase).toBe('palette')
    expect(state.at).toBe(0)
    expect(state.stuck).toBe(0)
    expect(state.hint).toBeNull()
  })

  it('시작할 때 카드가 한 장도 드러나 있지 않다', () => {
    const state = start()
    expect(state.table.board).toHaveLength(0)
    for (const seat of state.table.seats) expect(seat.hole).toHaveLength(0)
  })
})

describe('reduce — 순서를 어겼을 때', () => {
  it('막힘이 늘고 힌트가 생기고 스텝은 나가지 않는다', () => {
    const next = reduce(start(), { type: 'palette', act: 'payout' })
    expect(next.stuck).toBe(1)
    expect(next.hint).toBeTruthy()
    expect(next.at).toBe(0)
    expect(next.phase).toBe('palette')
  })

  it('블라인드가 먼저라고 알려 준다', () => {
    expect(reduce(start(), { type: 'palette', act: 'deal' }).hint).toContain('블라인드')
  })

  it('입력 상태를 뮤테이트하지 않는다', () => {
    const state = start()
    const before = JSON.stringify(state)
    reduce(state, { type: 'palette', act: 'payout' })
    expect(JSON.stringify(state)).toBe(before)
  })

  it('첫 순서를 틀리면 막힘이 늘고 좌석이 확정되지 않는다', () => {
    let state = start()
    state = reduce(state, { type: 'palette', act: 'blinds' })
    state = reduce(state, { type: 'animEnd' })
    state = reduce(state, { type: 'palette', act: 'deal' })
    state = reduce(state, { type: 'animEnd' })
    expect(state.phase).toBe('openSeat')

    const right = firstToActSeat('left-of-bb', state.script.buttonSeat, 6, new Array(6).fill(false))
    const wrong = (right + 1) % 6
    const next = reduce(state, { type: 'seat', seat: wrong })
    expect(next.stuck).toBe(1)
    expect(next.phase).toBe('openSeat')
  })
})

describe('reduce — 맞혔을 때', () => {
  it('블라인드를 걷으면 좌석 앞에 칩이 놓이고 팟은 아직 0 이다', () => {
    let state = reduce(start(), { type: 'palette', act: 'blinds' })
    state = reduce(state, { type: 'animEnd' })
    const bets = state.table.seats.map((s) => s.bet).filter((b) => b > 0)
    expect(bets).toHaveLength(2)
    expect(state.table.pot).toBe(0)
    expect(state.hint).toBeNull()
  })

  it('정답으로만 가면 17스텝 뒤에 완주한다', () => {
    let state = start()
    for (let guard = 0; guard < 100 && state.phase !== 'done'; guard++) {
      state = stepCorrectly(state)
    }
    expect(state.phase).toBe('done')
    expect(state.at).toBe(state.steps.length)
    expect(state.stuck).toBe(0)
  })

  it('완주하면 보드가 5장이다', () => {
    let state = start()
    for (let guard = 0; guard < 100 && state.phase !== 'done'; guard++) {
      state = stepCorrectly(state)
    }
    expect(state.table.board).toHaveLength(5)
  })

  it('완주한 뒤에는 어떤 입력도 상태를 바꾸지 않는다', () => {
    let state = start()
    for (let guard = 0; guard < 100 && state.phase !== 'done'; guard++) {
      state = stepCorrectly(state)
    }
    expect(reduce(state, { type: 'palette', act: 'deal' })).toBe(state)
  })
})

export { stepCorrectly }
