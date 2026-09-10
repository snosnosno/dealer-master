import { describe, expect, it } from 'vitest'
import { compareUpcardsHi, compareUpcardsLo } from './upcards'
import { parseCard } from './cards'

const hand = (s: string) => s.split(' ').map(parseCard)

describe('compareUpcardsHi', () => {
  // 자료의 예시 그대로다 (mixgame-facts §2)
  it('4 페어가 A 하이보다 높다', () => {
    expect(compareUpcardsHi(hand('4h 4d Qs'), hand('7s Qh Ac'))).toBeGreaterThan(0)
  })

  it('트리플이 투페어보다 높다', () => {
    expect(compareUpcardsHi(hand('9h 9d 9s Kc'), hand('Kh Kd 2s 2c'))).toBeGreaterThan(0)
  })

  it('같은 페어면 곁카드가 가른다', () => {
    expect(compareUpcardsHi(hand('8h 8d Ac'), hand('8s 8c Kd'))).toBeGreaterThan(0)
  })

  it('한 장짜리는 랭크로 가른다 — A 가 최고', () => {
    expect(compareUpcardsHi(hand('Ah'), hand('Ks'))).toBeGreaterThan(0)
  })

  // 업카드는 최대 4장이라 스트레이트·플러시가 성립하지 않는다
  it('무늬가 같아도 플러시로 세지 않는다', () => {
    expect(compareUpcardsHi(hand('2s 3s 4s 5s'), hand('Ah 7d'))).toBeLessThan(0)
  })

  it('완전히 같으면 0 이다 — 무늬는 보지 않는다', () => {
    expect(compareUpcardsHi(hand('Kh 7d'), hand('Ks 7c'))).toBe(0)
  })
})

describe('compareUpcardsLo', () => {
  it('A 가 최저다', () => {
    expect(compareUpcardsLo(hand('Ah'), hand('2s'))).toBeLessThan(0)
  })

  it('페어가 낀 쪽이 나쁘다', () => {
    expect(compareUpcardsLo(hand('3h 3d'), hand('9s Ts'))).toBeGreaterThan(0)
  })

  it('노페어끼리는 높은 카드부터 비교한다', () => {
    // 8-2 가 7-6 보다 나쁘다 — 최고 카드가 8 이다
    expect(compareUpcardsLo(hand('8h 2d'), hand('7s 6c'))).toBeGreaterThan(0)
  })

  it('스트레이트를 세지 않는다 — 5432 가 최고 로우 방향이다', () => {
    expect(compareUpcardsLo(hand('5h 4d 3s 2c'), hand('9h 8d 7s 6c'))).toBeLessThan(0)
  })

  it('완전히 같으면 0 이다', () => {
    expect(compareUpcardsLo(hand('7h 2d'), hand('7s 2c'))).toBe(0)
  })
})
