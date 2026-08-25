import { describe, it, expect } from 'vitest'
import { generateHand } from './generate'
import { initialState, stateAt, applyEvent } from './reduce'
import { buildPots } from './pots'
import { nlh } from './rulesets/nlh'
import type { HandState } from './types'

describe('generateHand — 결정론', () => {
  it('같은 시드는 같은 핸드를 만든다', () => {
    const a = generateHand({ seed: 'nlh-7f3a91' })
    const b = generateHand({ seed: 'nlh-7f3a91' })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('다른 시드는 다른 핸드를 만든다', () => {
    const a = generateHand({ seed: 'seed-a' })
    const b = generateHand({ seed: 'seed-b' })
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
})

describe('generateHand — 구조', () => {
  const hand = generateHand({ seed: 'structure-1' })

  it('기본 좌석 수는 6이다', () => {
    expect(hand.seats).toHaveLength(6)
  })

  it('모든 좌석이 홀카드 2장을 받는다', () => {
    const dealt = hand.events.filter((e) => e.type === 'deal_hole')
    expect(dealt).toHaveLength(12)
  })

  it('블라인드 두 개가 포스팅된다', () => {
    const blinds = hand.events.filter((e) => e.type === 'post_blind')
    expect(blinds).toHaveLength(2)
  })

  it('같은 카드가 두 번 나오지 않는다', () => {
    const seen = new Set<string>()
    for (const e of hand.events) {
      if (e.type === 'deal_hole') seen.add(e.card.rank + e.card.suit)
      if (e.type === 'deal_board') e.cards.forEach((c) => seen.add(c.rank + c.suit))
    }
    const total =
      hand.events.filter((e) => e.type === 'deal_hole').length +
      hand.events
        .filter((e) => e.type === 'deal_board')
        .reduce((n, e) => n + (e.type === 'deal_board' ? e.cards.length : 0), 0)
    expect(seen.size).toBe(total)
  })

  it('라운드가 끝나면 살아 있는 좌석의 벳이 모두 같다', () => {
    // bet > 0 으로 거르면 "아직 한 푼도 안 낸 채 남아 있는 좌석"을 놓친다.
    // 그게 정확히 잡아야 할 위반이므로 필터를 두지 않는다.
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const hd = generateHand({ seed: 'settle-' + n })
      const init = initialState(hd.seats, hd.buttonSeat)
      hd.events.forEach((e, i) => {
        if (e.type !== 'collect_bets') return
        const s = stateAt(init, hd.events, i)
        const live = s.seats.filter((x) => !x.folded && !x.allIn)
        expect(new Set(live.map((x) => x.bet)).size).toBeLessThanOrEqual(1)
      })
    }
  })

  it('생존자가 한 명이 된 뒤에는 보드를 깔지 않는다', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const hd = generateHand({ seed: 'dead-' + n })
      const init = initialState(hd.seats, hd.buttonSeat)
      hd.events.forEach((e, i) => {
        if (e.type !== 'deal_board') return
        const before = stateAt(init, hd.events, i)
        expect(before.seats.filter((x) => !x.folded).length).toBeGreaterThanOrEqual(2)
      })
    }
  })

  it('전원 폴드로 끝난 핸드는 카드를 공개하지 않는다', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const hd = generateHand({ seed: 'muck-' + n })
      const init = initialState(hd.seats, hd.buttonSeat)
      const final = stateAt(init, hd.events, hd.events.length)
      if (final.seats.filter((x) => !x.folded).length >= 2) continue
      expect(hd.events.some((e) => e.type === 'showdown_reveal')).toBe(false)
    }
  })

  it('스택이 칩 단위 표준의 배수다', () => {
    hand.seats.forEach((s) => expect(s.stack % 100).toBe(0))
  })

  it('핸드가 끝나면 팟이 비고 스택 합계가 시작 합계와 같다', () => {
    const init = initialState(hand.seats, hand.buttonSeat)
    const final = stateAt(init, hand.events, hand.events.length)
    const start = hand.seats.reduce((a, s) => a + s.stack, 0)
    expect(final.pot).toBe(0)
    expect(final.seats.reduce((a, s) => a + s.stack, 0)).toBe(start)
  })

  it('좌석 수가 범위를 벗어나면 던진다', () => {
    // 헤즈업은 블라인드 규칙이 달라 이 생성기로는 옳은 핸드가 안 나온다.
    expect(() => generateHand({ seed: 'hu', seatCount: 2 })).toThrow()
    expect(() => generateHand({ seed: 'big', seatCount: 10 })).toThrow()
  })
})

describe('generateHand — 제약', () => {
  it('calculation 을 요구하면 실제로 사이드팟이 생긴다', () => {
    // "올인 이벤트가 2번" 은 사이드팟의 대리 지표일 뿐이다.
    // 계약은 팟 구조이므로 팟 구조로 검증한다.
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const hand = generateHand({ seed: 'calc-' + n, require: ['calculation'] })
      const init = initialState(hand.seats, hand.buttonSeat)
      const final = stateAt(init, hand.events, hand.events.length)
      const pots = buildPots(final.contributed, final.seats.map((s) => s.folded))
      expect(pots.length).toBeGreaterThanOrEqual(2)
    }
  })
})

/*
 * 아래 세 묶음은 브리프의 13개에 더해, 통합 태스크가 지켜야 한다고 넘겨받은
 * 항목들을 좁게 겨냥한다. 골든값(시드 X 는 이런 배열)을 쓰지 않는다 —
 * 그건 구현 출력을 베낀 것이라 회귀를 못 잡는다.
 */

/**
 * 생성기가 봇 액션을 만들 때 쓴 것과 같은 규칙으로 베팅 컨텍스트를 다시 세운다.
 * lastRaiseSize·canRaise 는 상태에 남지 않고 라운드 진행에서만 나오는 값이라
 * 이벤트 열을 걸으며 재구성하는 것 말고는 밖에서 알 방법이 없다.
 */
function assertEveryActionLegal(seed: string, opts: { require?: ['calculation'] } = {}) {
  const hand = generateHand({ seed, ...opts })
  const bb = hand.blinds.bb
  let state: HandState = initialState(hand.seats, hand.buttonSeat)

  let lastRaiseSize = bb // 프리플랍은 빅블라인드가 오픈 벳 역할을 한다
  let isOpenBet = false
  let actedSinceFullRaise = new Set<number>()
  let checked = 0

  for (const e of hand.events) {
    if (e.type === 'collect_bets') {
      lastRaiseSize = 0
      isOpenBet = true
      actedSinceFullRaise = new Set<number>()
      state = applyEvent(state, e)
      continue
    }
    if (e.type !== 'player_action') {
      state = applyEvent(state, e)
      continue
    }

    const currentBet = Math.max(...state.seats.map((x) => x.bet))
    const seat = state.seats[e.seat]
    const result = nlh.validateAction(
      {
        currentBet,
        lastRaiseSize,
        bigBlind: bb,
        seatBet: seat.bet,
        seatStack: seat.stack,
        isOpenBet,
        canRaise: !actedSinceFullRaise.has(e.seat),
      },
      e.action,
    )
    expect(result.valid, `시드 ${seed} 좌석 ${e.seat} ${JSON.stringify(e.action)}`).toBe(true)
    checked++

    state = applyEvent(state, e)
    actedSinceFullRaise.add(e.seat)

    const newBet = state.seats[e.seat].bet
    if (newBet > currentBet) {
      isOpenBet = false
      const raiseSize = newBet - currentBet
      if (raiseSize >= Math.max(lastRaiseSize, bb)) {
        lastRaiseSize = raiseSize
        actedSinceFullRaise = new Set([e.seat])
      }
    }
  }

  return checked
}

describe('generateHand — 규칙 준수', () => {
  it('생성된 모든 플레이어 액션이 룰셋 판정을 통과한다', () => {
    let total = 0
    for (let n = 0; n < 200; n++) total += assertEveryActionLegal('legal-' + n)
    for (let n = 0; n < 60; n++) {
      total += assertEveryActionLegal('legal-calc-' + n, { require: ['calculation'] })
    }
    // 액션이 거의 없는 핸드만 뽑혔다면 위 단언들이 아무것도 안 본 것이다.
    expect(total).toBeGreaterThan(1000)
  })

  it('좌석 수와 옵션이 달라도 같은 시드는 두 번 다 같은 이벤트 배열을 만든다', () => {
    // 골든값(시드 X 는 이런 배열)이 아니라 두 번 호출 비교로 본다.
    // 골든값은 구현 출력을 베낀 것이라 구현이 바뀌면 같이 바뀌어 회귀를 못 잡는다.
    for (let seatCount = 3; seatCount <= 9; seatCount++) {
      for (const require of [undefined, ['calculation'] as const]) {
        const seed = `det-${seatCount}-${require ? 'calc' : 'plain'}`
        const a = generateHand({ seed, seatCount, require: require ? [...require] : undefined })
        const b = generateHand({ seed, seatCount, require: require ? [...require] : undefined })
        expect(a.events).toEqual(b.events)
        expect(a.seats).toEqual(b.seats)
        expect(a.buttonSeat).toBe(b.buttonSeat)
      }
    }
  })

  it('좌석 수 3~9 전 구간에서 핸드가 끝까지 만들어진다', () => {
    for (let seatCount = 3; seatCount <= 9; seatCount++) {
      for (let n = 0; n < 25; n++) {
        const hand = generateHand({ seed: `seats-${seatCount}-${n}`, seatCount })
        expect(hand.seats).toHaveLength(seatCount)
        const init = initialState(hand.seats, hand.buttonSeat)
        const final = stateAt(init, hand.events, hand.events.length)
        expect(final.pot).toBe(0)
        expect(final.seats.reduce((a, s) => a + s.stack, 0)).toBe(
          hand.seats.reduce((a, s) => a + s.stack, 0),
        )
      }
    }
  })
})

describe('generateHand — 팟 무결성', () => {
  it('미콜 벳은 팟에 남지 않고 되돌아간다', () => {
    // 한 라운드가 정산될 때, 아무도 맞추지 않은 초과분이 남아 있으면 안 된다.
    let seenReturns = 0
    for (let n = 0; n < 120; n++) {
      const hand = generateHand({ seed: 'uncalled-' + n })
      const init = initialState(hand.seats, hand.buttonSeat)
      hand.events.forEach((e, i) => {
        if (e.type === 'return_uncalled') seenReturns++
        if (e.type !== 'collect_bets') return
        const bets = stateAt(init, hand.events, i).seats.map((x) => x.bet)
        const desc = [...bets].sort((a, b) => b - a)
        expect(desc[0] - desc[1]).toBe(0)
      })
    }
    // 미콜 벳이 한 번도 안 나왔다면 위 단언은 공허하다 (전원 폴드 승리가 흔하다).
    expect(seenReturns).toBeGreaterThan(0)
  })

  it('모든 팟이 자격자를 가지고 금액이 칩 단위의 배수다', () => {
    for (let n = 0; n < 120; n++) {
      const hand = generateHand({ seed: 'potint-' + n, require: ['calculation'] })
      const init = initialState(hand.seats, hand.buttonSeat)
      const final = stateAt(init, hand.events, hand.events.length)
      const pots = buildPots(final.contributed, final.seats.map((s) => s.folded))
      for (const p of pots) {
        expect(p.eligibleSeats.length).toBeGreaterThan(0)
        expect(p.amount % 100).toBe(0)
      }
    }
  })
})
