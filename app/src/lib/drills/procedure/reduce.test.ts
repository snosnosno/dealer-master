import { describe, expect, it } from 'vitest'
import { compareUpcardsHi } from '@/lib/simulator'
import { GAMES } from '@/lib/games'
import { dealHand } from './deal'
import { firstToActSeats, stepsFor } from './steps'
import { reduce, startProcedure } from './reduce'
import type { ProcedureState } from './types'

const start = () => startProcedure(GAMES.plo8, 'seed-1')

/**
 * 첫 순서 집합의 **첫 좌석.** 이 파일의 검사들은 「어느 좌석을 누르면 넘어가나」만
 * 필요하다 — 동률에서 집합이 여럿이 되는 것 자체는 `steps.test.ts` 가 따로 못박는다.
 */
const firstToActSeatsFirst = (...args: Parameters<typeof firstToActSeats>) =>
  firstToActSeats(...args)[0]

/** 지금 상태가 요구하는 올바른 입력 하나를 만들어 넣는다. */
function stepCorrectly(state: ProcedureState): ProcedureState {
  if (state.phase === 'anim') return reduce(state, { type: 'animEnd' })
  if (state.phase === 'openSeat') {
    const street = state.spec.streets[state.steps[state.at].streetIndex]
    const seat = firstToActSeatsFirst(street.firstToAct, {
      buttonSeat: state.script.buttonSeat,
      seats: state.table.seats,
    })
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

    const right = firstToActSeatsFirst('left-of-bb', {
      buttonSeat: state.script.buttonSeat,
      seats: state.table.seats,
    })
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

describe('앤티 수거', () => {
  it('좌석 전원에게서 앤티를 걷는다', () => {
    const opened = startProcedure(GAMES.razz, 'ante-seed')
    const stacksBefore = opened.table.seats.map((s) => s.stack)

    const after = reduce(opened, { type: 'palette', act: 'ante' })

    after.table.seats.forEach((seat, i) => {
      expect(seat.stack).toBe(stacksBefore[i] - 100)
    })
  })

  it('앤티는 좌석 앞이 아니라 팟으로 간다 — 콜할 금액이 아니다', () => {
    const opened = startProcedure(GAMES.razz, 'ante-seed')
    const after = reduce(opened, { type: 'palette', act: 'ante' })
    expect(after.table.seats.every((s) => s.bet === 0)).toBe(true)
    expect(after.table.pot).toBe(100 * after.table.seats.length)
  })

  it('로그가 앤티 금액을 남긴다', () => {
    const opened = startProcedure(GAMES.razz, 'ante-seed')
    const after = reduce(opened, { type: 'palette', act: 'ante' })
    expect(after.log.join(' ')).toMatch(/앤티/)
    expect(after.log.join(' ')).toMatch(/100/)
  })

  it('PLO8 은 여전히 블라인드로 연다', () => {
    expect(stepsFor(GAMES.plo8)[0].act).toBe('blinds')
    expect(stepsFor(GAMES.razz)[0].act).toBe('ante')
  })
})

/*
 * 대본이 좌석마다 다른 장수를 들고 오면(폴드한 손은 걷힌다) 리듀서가 그것을 그대로
 * 드러내야 한다. 화면이 보는 것은 `table.seats` 이고 대본이 아니므로, 둘이 어긋나면
 * 폴드한 좌석 앞에 업카드가 남는다 — 그 어긋남을 좌석별로 맞춰 본다.
 *
 * 이 두 검사는 붙일 때 이미 초록이었다(적색 단계가 없다). `reduce.ts` 의 옛 코드가
 * `slice(0, 한 숫자)` 로 잘랐지만 `slice` 가 대본 배열 길이에서 알아서 멈춰 결과가
 * 같았기 때문이다 — 그 우연에 기대던 자리를 명시로 바꾼 것이고, 이 검사는 그 뒤로
 * 누가 천장을 지워도 잡히게 두는 회귀 그물이다.
 */
describe('라즈 완주 — 폴드한 손이 걷힌 채로 남는다', () => {
  function playThrough(seed: string): ProcedureState {
    let state = startProcedure(GAMES.razz, seed)
    for (let guard = 0; guard < 200 && state.phase !== 'done'; guard++) {
      state = stepCorrectly(state)
    }
    expect(state.phase, seed).toBe('done')
    return state
  }

  it('완주한 뒤 좌석의 장수가 대본과 한 장도 어긋나지 않는다', () => {
    for (const seed of ['a1', 'b2', 'razz-2', 'razz-3']) {
      const state = playThrough(seed)
      state.table.seats.forEach((seat, i) => {
        expect(seat.hole.length, `${seed}/좌석 ${i}`).toBe(state.script.seats[i].hole.length)
      })
    }
  })

  it('폴드한 좌석은 남은 좌석보다 카드가 적다', () => {
    const state = playThrough('a1')
    const folded = state.table.seats.filter((s) => s.folded)
    const alive = state.table.seats.filter((s) => !s.folded)
    expect(folded.length, 'a1 에 폴드가 없으면 이 검사가 공허하다').toBeGreaterThan(0)
    expect(alive.length).toBeGreaterThanOrEqual(2)
    const fewest = Math.min(...alive.map((s) => s.hole.length))
    for (const seat of folded) expect(seat.hole.length).toBeLessThan(fewest)
  })
})

describe('3번가 동률 판은 출제하지 않는다', () => {
  /*
   * 3번가 브링인이 동률이면 무늬로 갈라야 하는데 **자료가 없다**
   * (mixgame-facts §2 7-Card Stud 절). 답을 규칙으로 정당화할 수 없는 문제를 내면 훈련생이
   * 맞는 답을 고르고도 틀린다. 3번가는 그런 판을 애초에 만들지 않는다.
   *
   * **4번가 이후는 다르다.** 거기는 동률 판이 실제로 출제되고, 채점이 동률 좌석 전부를
   * 정답으로 받는다(`steps.ts` 의 `firstToActSeats`). 이 제목이 「3번가」로 좁혀진 이유다.
   */
  it('시드 서른 개 어디에도 3번가 최고 업카드 동률이 없다', () => {
    for (let i = 0; i < 30; i++) {
      const script = dealHand(GAMES.razz, `tie-${i}`)
      const ups = script.seats.map((s) => s.hole.filter((d) => d.faceUp).map((d) => d.card))
      // 3번가 시점 = 좌석마다 업카드 한 장
      const third = ups.map((cards) => cards.slice(0, 1))
      const top = third.reduce((best, cur) => (compareUpcardsHi(cur, best) > 0 ? cur : best))
      const tied = third.filter((cards) => compareUpcardsHi(cards, top) === 0)
      expect(tied).toHaveLength(1)
    }
  })

  it('PLO8 은 이 제약에 걸리지 않는다 — 업카드가 없다', () => {
    const script = dealHand(GAMES.plo8, 'tie-0')
    expect(script.seats.every((s) => s.hole.every((d) => !d.faceUp))).toBe(true)
  })
})

/**
 * **첫 순서가 동률이면 그 좌석 아무나 맞다.**
 *
 * 4번가 이후의 동률은 생성기가 걸러내지 않고 실제로 출제된다(3번가만 거른다).
 * 예전에는 채점이 먼저 만난 좌석 하나만 받아서, 훈련생이 동률인 다른 좌석을 누르면
 * `stuck` 이 오르는데 힌트(「열린 카드로 만든 로우가 가장 좋은 좌석입니다」)로는 답을
 * 좁힐 수 없었다 — 두 좌석의 보드 로우가 **같기** 때문이다 (최종 리뷰 I-1).
 */
describe('첫 순서 동률 — 집합에 들면 맞다', () => {
  /** 동률인 첫 순서 물음 앞에 선 상태를 찾는다. 없으면 `null` */
  function findTie(): { state: ProcedureState; tied: number[]; seed: string } | null {
    for (let i = 0; i < 300; i++) {
      const seed = `probe-${i}`
      let state = startProcedure(GAMES.razz, seed)
      for (let guard = 0; guard < 200 && state.phase !== 'done'; guard++) {
        if (state.phase === 'openSeat') {
          const street = state.spec.streets[state.steps[state.at].streetIndex]
          const tied = firstToActSeats(street.firstToAct, {
            buttonSeat: state.script.buttonSeat,
            seats: state.table.seats,
          })
          if (tied.length > 1) return { state, tied, seed }
        }
        state = stepCorrectly(state)
      }
    }
    return null
  }

  const found = findTie()

  /*
   * **이 검사가 공허하지 않다는 증거다.** 동률 판이 한 번도 안 나오면 아래 두 검사는
   * 아무것도 재지 않는다. 시드 300개에 1~2번 나오는 빈도라(실측 500개에 8번) 여기서
   * 못 찾으면 생성기가 바뀐 것이고, 그때는 이 범위를 늘려야 한다.
   */
  it('동률 판이 실제로 출제된다 — 시드 300개 안에 있다', () => {
    expect(found, '동률 판을 못 찾았다 — 시드 범위를 늘리거나 생성기가 바뀐 것이다')
      .not.toBeNull()
    expect(found?.tied.length).toBeGreaterThan(1)
  })

  it('동률인 좌석 어느 것을 눌러도 넘어간다', () => {
    if (found === null) throw new Error('동률 판이 없다 — 위 검사가 먼저 빨개진다')
    for (const seat of found.tied) {
      const next = reduce(found.state, { type: 'seat', seat })
      expect(next.stuck, `${found.seed}/좌석 ${seat}`).toBe(found.state.stuck)
      expect(next.at, `${found.seed}/좌석 ${seat}`).toBe(found.state.at + 1)
    }
  })

  it('동률에 안 드는 좌석은 여전히 틀린다 — 아무나 다 맞는 것이 아니다', () => {
    if (found === null) throw new Error('동률 판이 없다 — 위 검사가 먼저 빨개진다')
    const outsiders = found.state.table.seats
      .map((seat, i) => ({ i, folded: seat.folded }))
      .filter((s) => !s.folded && !found.tied.includes(s.i))
    expect(outsiders.length, '동률 아닌 생존 좌석이 없으면 이 검사가 공허하다')
      .toBeGreaterThan(0)
    for (const s of outsiders) {
      const next = reduce(found.state, { type: 'seat', seat: s.i })
      expect(next.stuck, `${found.seed}/좌석 ${s.i}`).toBe(found.state.stuck + 1)
    }
  })
})

export { stepCorrectly }
