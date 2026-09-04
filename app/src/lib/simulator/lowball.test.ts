import { describe, expect, it } from 'vitest'
import { parseCard } from './cards'
import { compareLow, evaluateLowA5 } from './lowball'

const hand = (s: string) => s.split(' ').map(parseCard)

describe('evaluateLowA5', () => {
  it('휠(5-4-3-2-A)이 노페어이고 키가 [0,5,4,3,2,1] 이다', () => {
    const r = evaluateLowA5(hand('5s 4h 3d 2c Ac'))
    expect(r.category).toBe(0)
    expect(r.key).toEqual([0, 5, 4, 3, 2, 1])
  })

  it('스트레이트를 로우로 세지 않는다 — 6-5-4-3-2 도 노페어다', () => {
    expect(evaluateLowA5(hand('6s 5h 4d 3c 2c')).category).toBe(0)
  })

  it('플러시를 로우로 세지 않는다 — 무늬가 같아도 노페어다', () => {
    expect(evaluateLowA5(hand('7s 5s 4s 3s 2s')).category).toBe(0)
  })

  it('페어는 category 1 이다', () => {
    expect(evaluateLowA5(hand('7s 7h 4d 3c 2c')).category).toBe(1)
  })

  it('투페어는 2, 트립은 3, 쿼드는 7 이다', () => {
    expect(evaluateLowA5(hand('7s 7h 4d 4c 2c')).category).toBe(2)
    expect(evaluateLowA5(hand('7s 7h 7d 4c 2c')).category).toBe(3)
    expect(evaluateLowA5(hand('7s 7h 7d 7c 2c')).category).toBe(7)
  })

  it('5장이 아니면 던진다', () => {
    expect(() => evaluateLowA5(hand('5s 4h 3d 2c'))).toThrow()
  })
})

describe('compareLow', () => {
  it('휠이 6-4-3-2-A 보다 강하다', () => {
    const wheel = evaluateLowA5(hand('5s 4h 3d 2c Ac'))
    const six = evaluateLowA5(hand('6s 4h 3d 2c Ac'))
    expect(compareLow(wheel, six)).toBeLessThan(0)
  })

  it('8-7-6-5-4 가 8-7-6-5-3 보다 약하다', () => {
    const higher = evaluateLowA5(hand('8s 7h 6d 5c 4c'))
    const lower = evaluateLowA5(hand('8s 7h 6d 5c 3c'))
    expect(compareLow(higher, lower)).toBeGreaterThan(0)
  })

  it('노페어가 페어보다 강하다', () => {
    const nopair = evaluateLowA5(hand('Ks Qh Jd 9c 8c'))
    const pair = evaluateLowA5(hand('2s 2h 3d 4c 5c'))
    expect(compareLow(nopair, pair)).toBeLessThan(0)
  })

  it('완전히 같으면 0 이다', () => {
    const a = evaluateLowA5(hand('8s 6h 4d 3c 2c'))
    const b = evaluateLowA5(hand('8h 6s 4c 3d 2d'))
    expect(compareLow(a, b)).toBe(0)
  })
})
