import { describe, it, expect } from 'vitest'
import { makeDeck, shuffle, cardToString, parseCard, RANK_VALUE } from './cards'
import { createRng } from './rng'

describe('makeDeck', () => {
  it('52장을 만든다', () => {
    expect(makeDeck()).toHaveLength(52)
  })

  it('중복 카드가 없다', () => {
    const seen = new Set(makeDeck().map(cardToString))
    expect(seen.size).toBe(52)
  })
})

describe('shuffle', () => {
  it('같은 시드는 같은 순서를 만든다', () => {
    const a = shuffle(makeDeck(), createRng('deck-1')).map(cardToString)
    const b = shuffle(makeDeck(), createRng('deck-1')).map(cardToString)
    expect(a).toEqual(b)
  })

  it('다른 시드는 다른 순서를 만든다', () => {
    const a = shuffle(makeDeck(), createRng('deck-1')).map(cardToString)
    const b = shuffle(makeDeck(), createRng('deck-2')).map(cardToString)
    expect(a).not.toEqual(b)
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const deck = makeDeck()
    const before = deck.map(cardToString)
    shuffle(deck, createRng('immutable'))
    expect(deck.map(cardToString)).toEqual(before)
  })

  it('셔플 후에도 52장이고 중복이 없다', () => {
    const out = shuffle(makeDeck(), createRng('count'))
    expect(out).toHaveLength(52)
    expect(new Set(out.map(cardToString)).size).toBe(52)
  })
})

describe('cardToString / parseCard', () => {
  it('왕복 변환이 원본과 같다', () => {
    makeDeck().forEach((c) => {
      expect(parseCard(cardToString(c))).toEqual(c)
    })
  })

  it('잘못된 문자열은 던진다', () => {
    expect(() => parseCard('Xz')).toThrow()
    expect(() => parseCard('A')).toThrow()
  })
})

describe('RANK_VALUE', () => {
  it('A 가 가장 크고 2 가 가장 작다', () => {
    expect(RANK_VALUE.A).toBe(14)
    expect(RANK_VALUE['2']).toBe(2)
    expect(RANK_VALUE.K).toBeLessThan(RANK_VALUE.A)
  })
})
