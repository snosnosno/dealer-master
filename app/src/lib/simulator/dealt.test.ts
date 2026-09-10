import { describe, expect, it } from 'vitest'
import { asDown, asUp, cards, type DealtCard } from './dealt'
import { parseCard } from './cards'

const AS = parseCard('As')
const KD = parseCard('Kd')

describe('cards', () => {
  it('앞뒤를 벗기고 카드만 남긴다', () => {
    const dealt: DealtCard[] = [
      { card: AS, faceUp: false },
      { card: KD, faceUp: true },
    ]
    expect(cards(dealt)).toEqual([AS, KD])
  })

  it('빈 배열은 빈 배열이다', () => {
    expect(cards([])).toEqual([])
  })
})

describe('asDown · asUp', () => {
  it('asDown 은 전부 엎는다', () => {
    expect(asDown([AS, KD])).toEqual([
      { card: AS, faceUp: false },
      { card: KD, faceUp: false },
    ])
  })

  it('asUp 은 전부 연다', () => {
    expect(asUp([AS])).toEqual([{ card: AS, faceUp: true }])
  })

  // 입력을 뮤테이트하지 않는다 (전역 제약 3)
  it('원본 배열을 건드리지 않는다', () => {
    const src = [AS, KD]
    asDown(src)
    expect(src).toEqual([AS, KD])
  })
})
