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

describe('베팅 라운드 — 칩이 화면에 뜬 다음에 수거된다', () => {
  /** 첫 베팅 스텝을 막 적용한 상태까지 간다. 아직 `animEnd` 를 넣지 않았다 */
  function upToFirstBetting(): ProcedureState {
    let state = start()
    for (let guard = 0; guard < 100; guard++) {
      if (state.phase === 'palette' && state.steps[state.at].act === 'betting') {
        return reduce(state, { type: 'palette', act: 'betting' })
      }
      state = stepCorrectly(state)
    }
    throw new Error('베팅 스텝에 닿지 못했다')
  }

  it('베팅 직후에는 칩이 좌석 앞에 남아 있고 팟은 아직 그대로다', () => {
    const before = start()
    const state = upToFirstBetting()
    expect(state.phase).toBe('anim')
    expect(state.table.seats.some((seat) => seat.bet > 0)).toBe(true)
    expect(state.table.pot).toBe(before.table.pot)
  })

  it('그 다음 `animEnd` 가 좌석 앞을 비우고 팟으로 옮긴다', () => {
    const bet = upToFirstBetting()
    const outstanding = bet.table.seats.reduce((sum, seat) => sum + seat.bet, 0)
    const swept = reduce(bet, { type: 'animEnd' })
    expect(swept.table.seats.every((seat) => seat.bet === 0)).toBe(true)
    expect(swept.table.pot).toBe(bet.table.pot + outstanding)
    // 수거도 한 박자 — 여기서 팔레트로 돌아가면 칩이 모이는 것을 못 본다
    expect(swept.phase).toBe('anim')
  })

  it('로그가 좌석마다 무엇을 얼마에 했는지 남긴다', () => {
    const state = upToFirstBetting()
    const street = state.spec.streets[state.steps[state.at - 1].streetIndex]
    const actions = state.script.betting[street.id]
    expect(actions.length).toBeGreaterThan(0)

    for (const a of actions) {
      const name = state.script.seats[a.seat].name
      const line = state.log.find((l) => l.startsWith(`${name} `))
      expect(line, `${name} 의 액션이 로그에 없다`).toBeDefined()
      // 금액이 있는 액션은 누적액이 줄에 찍힌다
      if (a.act !== 'fold' && a.act !== 'check') {
        expect(line).toContain(a.to.toLocaleString('ko-KR'))
      }
    }
  })
})

export { stepCorrectly }
