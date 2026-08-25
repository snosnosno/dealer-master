import { describe, it, expect } from 'vitest'
import { initialState, applyEvent, stateAt } from './reduce'
import type { HandEvent, HandState } from './types'
import { parseCard } from './cards'

const seats = [
  { name: '김도현', stack: 25000 },
  { name: '박서준', stack: 12500 },
  { name: '이민아', stack: 47000 },
]

const events: HandEvent[] = [
  { type: 'post_blind', seat: 1, amount: 100, kind: 'sb' },
  { type: 'post_blind', seat: 2, amount: 200, kind: 'bb' },
  { type: 'deal_hole', seat: 0, card: parseCard('As') },
  { type: 'player_action', seat: 0, action: { kind: 'fold' } },
  { type: 'player_action', seat: 1, action: { kind: 'raise', to: 1050 } },
  { type: 'player_action', seat: 2, action: { kind: 'call', to: 1050 } },
  { type: 'collect_bets' },
]

describe('applyEvent', () => {
  it('블라인드가 스택에서 빠지고 벳으로 잡힌다', () => {
    const s = applyEvent(initialState(seats, 0), events[0])
    expect(s.seats[1].stack).toBe(12400) // 12500 - 100
    expect(s.seats[1].bet).toBe(100)
  })

  it('입력 상태를 변형하지 않는다', () => {
    const before = initialState(seats, 0)
    const snapshot = JSON.stringify(before)
    applyEvent(before, events[0])
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('폴드가 반영된다', () => {
    let s = initialState(seats, 0)
    for (const e of events.slice(0, 4)) s = applyEvent(s, e)
    expect(s.seats[0].folded).toBe(true)
  })

  it('collect_bets 가 벳을 팟으로 옮기고 벳을 0으로 만든다', () => {
    let s = initialState(seats, 0)
    for (const e of events) s = applyEvent(s, e)
    expect(s.pot).toBe(1050 + 1050) // 박서준 1050 + 이민아 1050 (김도현은 폴드, 벳 0)
    expect(s.seats.every((x) => x.bet === 0)).toBe(true)
  })

  it('contributed 는 collect 후에도 누적을 유지한다', () => {
    let s = initialState(seats, 0)
    for (const e of events) s = applyEvent(s, e)
    expect(s.contributed[1]).toBe(1050)
    expect(s.contributed[2]).toBe(1050)
    expect(s.contributed[0]).toBe(0)
  })

  it('올인은 allIn 플래그를 세운다', () => {
    let s = initialState(seats, 0)
    s = applyEvent(s, { type: 'player_action', seat: 1, action: { kind: 'allin', to: 12500 } })
    expect(s.seats[1].allIn).toBe(true)
    expect(s.seats[1].stack).toBe(0)
  })

  it('return_uncalled 는 스택·벳·투입액을 함께 되돌린다', () => {
    // 좌석 2가 1,000 을 벳했는데 아무도 맞추지 않았다 -> 600 은 돌려받는다
    let s = initialState(seats, 0)
    s = applyEvent(s, { type: 'player_action', seat: 2, action: { kind: 'bet', to: 1000 } })
    s = applyEvent(s, { type: 'return_uncalled', seat: 2, amount: 600 })
    expect(s.seats[2].bet).toBe(400)
    expect(s.seats[2].stack).toBe(47000 - 400)
    expect(s.contributed[2]).toBe(400)
  })

  it('올인이 미콜로 돌아오면 올인 상태가 풀린다', () => {
    let s = initialState(seats, 0)
    s = applyEvent(s, { type: 'player_action', seat: 1, action: { kind: 'allin', to: 12500 } })
    s = applyEvent(s, { type: 'return_uncalled', seat: 1, amount: 12000 })
    expect(s.seats[1].allIn).toBe(false)
    expect(s.seats[1].stack).toBe(12000)
  })
})

describe('stateAt', () => {
  it('임의 인덱스까지 접은 결과가 순차 적용과 같다', () => {
    const init = initialState(seats, 0)
    for (let i = 0; i <= events.length; i++) {
      let manual = init
      for (const e of events.slice(0, i)) manual = applyEvent(manual, e)
      expect(stateAt(init, events, i)).toEqual(manual)
    }
  })
})

/** 상태의 중첩 구조까지 전부 얼린다. 제자리 수정이 있으면 strict mode 에서 던진다. */
function deepFreeze(s: HandState): HandState {
  s.seats.forEach((seat) => {
    Object.freeze(seat.hole)
    Object.freeze(seat)
  })
  Object.freeze(s.seats)
  Object.freeze(s.board)
  Object.freeze(s.contributed)
  return Object.freeze(s)
}

describe('불변성', () => {
  it('얼린 상태에 이벤트를 적용해도 제자리 수정이 일어나지 않는다', () => {
    const all: HandEvent[] = [
      ...events,
      { type: 'deal_board', street: 'flop', cards: [parseCard('7c'), parseCard('8d'), parseCard('9h')] },
      { type: 'player_action', seat: 1, action: { kind: 'bet', to: 1000 } },
      { type: 'return_uncalled', seat: 1, amount: 600 },
      { type: 'collect_bets' },
      { type: 'showdown_reveal', seat: 1 },
      { type: 'award_pot', potIndex: 0, seat: 1, amount: 2500 },
      { type: 'move_button', toSeat: 1 },
    ]
    let s = deepFreeze(initialState(seats, 0))
    for (const e of all) s = deepFreeze(applyEvent(s, e))
    expect(s.seats[1].revealed).toBe(true)
  })

  it('바뀐 중첩 배열이 입력과 같은 참조를 공유하지 않는다', () => {
    const before = initialState(seats, 0)
    const dealt = applyEvent(before, { type: 'deal_hole', seat: 0, card: parseCard('As') })
    expect(dealt.seats).not.toBe(before.seats)
    expect(dealt.seats[0].hole).not.toBe(before.seats[0].hole)
    expect(before.seats[0].hole).toHaveLength(0)

    const posted = applyEvent(before, events[0])
    expect(posted.contributed).not.toBe(before.contributed)
    expect(before.contributed[1]).toBe(0)

    const boarded = applyEvent(before, {
      type: 'deal_board',
      street: 'flop',
      cards: [parseCard('7c'), parseCard('8d'), parseCard('9h')],
    })
    expect(boarded.board).not.toBe(before.board)
    expect(before.board).toHaveLength(0)
  })
})

describe('칩 보존 가드', () => {
  it('현재 벳보다 낮은 레이즈·벳은 던진다 — 음수 delta 로 칩이 생기는 것을 막는다', () => {
    // 이미 200 을 벳한 좌석의 목표를 50 으로 낮추면 delta 가 음수가 되어
    // 스택이 늘고 투입액이 줄어든다. post_blind 는 가산이라 이 경로로 못 들어오므로
    // 가드를 실제로 지키는 것은 player_action 쪽이다.
    let s = initialState(seats, 0)
    s = applyEvent(s, { type: 'post_blind', seat: 2, amount: 200, kind: 'bb' })
    expect(() =>
      applyEvent(s, { type: 'player_action', seat: 2, action: { kind: 'raise', to: 50 } }),
    ).toThrow(/좌석 2\(0-based\) 의 목표 벳 50 이 현재 벳 200 보다 작다/)
    expect(() =>
      applyEvent(s, { type: 'player_action', seat: 2, action: { kind: 'bet', to: 0 } }),
    ).toThrow(/목표 벳 0 이 현재 벳 200 보다 작다/)
  })

  it('같은 금액으로의 재지정은 던지지 않는다 — 이미 맞춘 벳에 콜하는 정상 경로', () => {
    let s = initialState(seats, 0)
    s = applyEvent(s, { type: 'post_blind', seat: 2, amount: 200, kind: 'bb' })
    const same = applyEvent(s, { type: 'player_action', seat: 2, action: { kind: 'call', to: 200 } })
    expect(same.seats[2].bet).toBe(200)
    expect(same.contributed[2]).toBe(200)
  })

  it('팟보다 큰 지급은 던진다 — 클램프로 초과분을 감추지 않는다', () => {
    let s = initialState(seats, 0)
    s = applyEvent(s, { type: 'post_blind', seat: 1, amount: 100, kind: 'sb' })
    s = applyEvent(s, { type: 'collect_bets' })
    expect(s.pot).toBe(100)
    expect(() => applyEvent(s, { type: 'award_pot', potIndex: 0, seat: 1, amount: 101 })).toThrow(
      /지급하려는 101 이 남은 팟 100 보다 크다/,
    )
    // 팟 전액 지급은 정상 경로다
    const paid = applyEvent(s, { type: 'award_pot', potIndex: 0, seat: 1, amount: 100 })
    expect(paid.pot).toBe(0)
    expect(paid.seats[1].stack).toBe(12500)
  })
})

describe('post_blind 가산 의미론', () => {
  // amount 는 '이만큼 낸다' 는 가산액이다. 앤티와 블라인드를 같은 좌석이 낼 때
  // 순서와 무관하게 합계가 같아야 한다 — 25 + 200 = 225.
  it('앤티를 먼저 내도 블라인드와 합산된다', () => {
    let s = initialState(seats, 0)
    s = applyEvent(s, { type: 'post_blind', seat: 2, amount: 25, kind: 'ante' })
    s = applyEvent(s, { type: 'post_blind', seat: 2, amount: 200, kind: 'bb' })
    expect(s.contributed[2]).toBe(225)
    expect(s.seats[2].bet).toBe(225)
    expect(s.seats[2].stack).toBe(47000 - 225)
  })

  it('블라인드를 먼저 내도 앤티와 합산된다 — 순서가 결과를 바꾸지 않는다', () => {
    let s = initialState(seats, 0)
    s = applyEvent(s, { type: 'post_blind', seat: 2, amount: 200, kind: 'bb' })
    s = applyEvent(s, { type: 'post_blind', seat: 2, amount: 25, kind: 'ante' })
    expect(s.contributed[2]).toBe(225)
    expect(s.seats[2].bet).toBe(225)
    expect(s.seats[2].stack).toBe(47000 - 225)
  })
})

describe('return_uncalled 의 allIn 유도', () => {
  it('0원 반환은 올인 상태를 풀지 않는다', () => {
    // amount 0 은 무의미한 이벤트지만, 그것 때문에 allIn 이 풀리면
    // 스택이 0 인 좌석이 아직 액션할 수 있는 것처럼 보인다.
    let s = initialState(seats, 0)
    s = applyEvent(s, { type: 'player_action', seat: 1, action: { kind: 'allin', to: 12500 } })
    s = applyEvent(s, { type: 'return_uncalled', seat: 1, amount: 0 })
    expect(s.seats[1].stack).toBe(0)
    expect(s.seats[1].allIn).toBe(true)
  })

  it('양수 반환은 올인을 푼다 — 기존 동작이 유지된다', () => {
    let s = initialState(seats, 0)
    s = applyEvent(s, { type: 'player_action', seat: 1, action: { kind: 'allin', to: 12500 } })
    s = applyEvent(s, { type: 'return_uncalled', seat: 1, amount: 1 })
    expect(s.seats[1].stack).toBe(1)
    expect(s.seats[1].allIn).toBe(false)
  })
})
