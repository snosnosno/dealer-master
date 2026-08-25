import { describe, it, expect } from 'vitest'
import { evaluateHand, compareHands } from './evaluate'
import { parseCard } from './cards'

const h = (...s: string[]) => s.map(parseCard)

describe('evaluateHand — 카테고리 판정', () => {
  it('스트레이트 플러시', () => {
    expect(evaluateHand(h('9s', '8s', '7s', '6s', '5s', '2d', 'Kh')).category).toBe(8)
  })
  it('포카드', () => {
    expect(evaluateHand(h('9s', '9h', '9d', '9c', '5s', '2d', 'Kh')).category).toBe(7)
  })
  it('풀하우스', () => {
    expect(evaluateHand(h('9s', '9h', '9d', '5c', '5s', '2d', 'Kh')).category).toBe(6)
  })
  it('플러시', () => {
    expect(evaluateHand(h('As', 'Js', '8s', '5s', '2s', '9d', 'Kh')).category).toBe(5)
  })
  it('스트레이트', () => {
    expect(evaluateHand(h('9s', '8h', '7d', '6c', '5s', '2d', 'Kh')).category).toBe(4)
  })
  it('휠 스트레이트 — A 를 1로 쓴다', () => {
    const r = evaluateHand(h('As', '2h', '3d', '4c', '5s', '9d', 'Kh'))
    expect(r.category).toBe(4)
    expect(r.tiebreak[0]).toBe(5) // 5-high
  })
  it('A-high 스트레이트는 top 이 14다', () => {
    const r = evaluateHand(h('As', 'Kh', 'Qd', 'Jc', 'Ts', '2d', '3h'))
    expect(r.category).toBe(4)
    expect(r.tiebreak[0]).toBe(14)
  })
  it('휠 스트레이트 플러시', () => {
    const r = evaluateHand(h('As', '2s', '3s', '4s', '5s', '9d', 'Kh'))
    expect(r.category).toBe(8)
    expect(r.tiebreak[0]).toBe(5)
  })
  it('플러시와 스트레이트가 따로 있으면 스트레이트 플러시가 아니다', () => {
    // 스페이드 5장(플러시)이지만 그 5장이 연속이 아니다
    expect(evaluateHand(h('9s', '8s', '7s', '6s', '2s', '5d', 'Kh')).category).toBe(5)
  })
  it('트리플', () => {
    expect(evaluateHand(h('9s', '9h', '9d', '5c', '3s', '2d', 'Kh')).category).toBe(3)
  })
  it('투페어', () => {
    expect(evaluateHand(h('9s', '9h', '5d', '5c', '3s', '2d', 'Kh')).category).toBe(2)
  })
  it('원페어', () => {
    expect(evaluateHand(h('9s', '9h', '5d', '4c', '3s', '2d', 'Kh')).category).toBe(1)
  })
  it('하이카드', () => {
    expect(evaluateHand(h('9s', '7h', '5d', '4c', '3s', '2d', 'Kh')).category).toBe(0)
  })
})

describe('compareHands', () => {
  it('킥커로 승부가 갈린다', () => {
    const a = evaluateHand(h('Ks', 'Kh', 'Ad', '7c', '5s', '2d', '3h')) // KK + A 킥커
    const b = evaluateHand(h('Ks', 'Kh', 'Qd', '7c', '5s', '2d', '3h')) // KK + Q 킥커
    expect(compareHands(a, b)).toBeGreaterThan(0)
  })

  it('완전히 같은 족보는 0을 돌려준다', () => {
    const a = evaluateHand(h('Ks', 'Kh', 'Ad', '7c', '5s'))
    const b = evaluateHand(h('Kd', 'Kc', 'Ah', '7s', '5d'))
    expect(compareHands(a, b)).toBe(0)
  })

  it('카테고리가 다르면 카테고리가 이긴다', () => {
    const trips = evaluateHand(h('7s', '7h', '7d', 'Kc', '5s'))
    const twoPair = evaluateHand(h('As', 'Ah', 'Kd', 'Kc', '5s'))
    expect(compareHands(trips, twoPair)).toBeGreaterThan(0)
  })

  it('포카드 옆에 페어가 있어도 키커는 가장 높은 랭크다', () => {
    // 보드 9999 2, 한쪽은 2K, 다른쪽은 2Q. 최선의 5장은 9999K vs 9999Q.
    // 개수 우선 정렬 배열에서 키커를 뽑으면 둘 다 키커를 2로 잡아 무승부가 된다.
    const withK = evaluateHand(h('9s', '9h', '9d', '9c', '2d', '2h', 'Kh'))
    const withQ = evaluateHand(h('9s', '9h', '9d', '9c', '2d', '2h', 'Qh'))
    expect(withK.tiebreak).toEqual([9, 13])
    expect(compareHands(withK, withQ)).toBeGreaterThan(0)
  })
})

describe('목업 핸드 — 설계 문서의 검증 시나리오', () => {
  // 보드 Kd 9s 7h 2c Qs
  const board = h('Kd', '9s', '7h', '2c', 'Qs')
  const choi = evaluateHand([...h('9h', '9d'), ...board]) // 트리플 9
  const park = evaluateHand([...h('As', 'Ks'), ...board]) // K 원페어
  const lee = evaluateHand([...h('7c', '7s'), ...board]) // 트리플 7

  it('최우진이 트리플 9로 가장 세다', () => {
    expect(compareHands(choi, park)).toBeGreaterThan(0)
    expect(compareHands(choi, lee)).toBeGreaterThan(0)
  })

  it('사이드팟에서는 이민아(트리플 7)가 박서준(K 페어)을 이긴다', () => {
    expect(compareHands(lee, park)).toBeGreaterThan(0)
  })

  it('보드에 스페이드가 2장뿐이라 박서준은 플러시가 아니다', () => {
    expect(park.category).toBe(1)
  })
})
