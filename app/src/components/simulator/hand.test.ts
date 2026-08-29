import { describe, expect, test } from 'vitest'
import { buildPots, initialState, stateAt } from '@/lib/simulator'
import { buildHand, SIDE_POT_RATE } from './hand'

describe('시드에서 핸드 만들기', () => {
  test('같은 시드는 같은 핸드를 만든다', () => {
    const a = buildHand('abc')
    const b = buildHand('abc')
    expect(a.hand.events).toEqual(b.hand.events)
    expect(a.decisions).toEqual(b.decisions)
  })

  test('항상 6인 테이블이다', () => {
    for (const seed of ['1', '2', 'xyz']) {
      expect(buildHand(seed).hand.seats).toHaveLength(6)
    }
  })

  test('require 가 시드에서만 유도되어 학습자 입력을 받지 않는다', () => {
    // 같은 시드는 항상 같은 require 판정을 낸다 — 결정론이 깨지지 않는다
    const first = buildHand('seed-42')
    const second = buildHand('seed-42')
    expect(first.hand.events).toEqual(second.hand.events)
  })

  test('사이드팟 핸드가 대략 1/3 비율로 나온다', () => {
    const N = 300
    let sidePots = 0
    for (let i = 0; i < N; i++) {
      const { hand } = buildHand(`s${i}`)
      const final = stateAt(
        initialState(hand.seats, hand.buttonSeat),
        hand.events,
        hand.events.length,
      )
      const pots = buildPots(final.contributed, final.seats.map((s) => s.folded))
      if (pots.length >= 2) sidePots++
    }
    // require 를 건 핸드에서만 사실상 사이드팟이 나온다. 그 비율이 SIDE_POT_RATE 근처여야 한다.
    const rate = sidePots / N
    expect(rate).toBeGreaterThan(SIDE_POT_RATE - 0.12)
    expect(rate).toBeLessThan(SIDE_POT_RATE + 0.12)
  })
})
