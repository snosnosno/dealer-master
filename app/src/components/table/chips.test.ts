import { describe, expect, test } from 'vitest'
import {
  buildPots, extractDecisions, generateHand, initialState, stateAt,
} from '@/lib/simulator'
import { CHIP_UNITS, chipBreakdown } from './chips'

describe('칩 분해', () => {
  test('큰 단위부터 그리디로 쪼갠다', () => {
    expect(chipBreakdown(32300)).toEqual({
      chips: [
        { unit: 25000, count: 1 },
        { unit: 5000, count: 1 },
        { unit: 1000, count: 2 },
        { unit: 100, count: 3 },
      ],
      remainder: 0,
    })
  })

  test('0 은 빈 배열이다', () => {
    expect(chipBreakdown(0)).toEqual({ chips: [], remainder: 0 })
  })

  test('표준 단위만 쓴다', () => {
    for (const amount of [100, 700, 12500, 62000, 188400]) {
      for (const c of chipBreakdown(amount).chips) {
        expect(CHIP_UNITS).toContain(c.unit)
      }
    }
  })

  test('칩 합계와 나머지를 더하면 원금액이다', () => {
    for (const amount of [0, 100, 250, 700, 12500, 32300, 188499]) {
      const { chips, remainder } = chipBreakdown(amount)
      const sum = chips.reduce((a, c) => a + c.unit * c.count, 0)
      expect(sum + remainder).toBe(amount)
    }
  })

  test('엔진이 내는 금액은 나머지가 0 이다 — 전부 100 의 배수다', () => {
    const hand = generateHand({ seed: '7', seatCount: 6, require: ['calculation'] })
    const final = stateAt(
      initialState(hand.seats, hand.buttonSeat),
      hand.events,
      hand.events.length,
    )
    const pots = buildPots(final.contributed, final.seats.map((s) => s.folded))
    const amounts = [
      ...final.seats.map((s) => s.stack),
      ...pots.map((p) => p.amount),
      ...extractDecisions(hand).flatMap((d) =>
        d.input.type === 'number' ? d.input.fields.map((f) => f.answer) : [],
      ),
    ]
    expect(amounts.length).toBeGreaterThan(0)
    for (const a of amounts) expect(chipBreakdown(a).remainder).toBe(0)
  })
})
