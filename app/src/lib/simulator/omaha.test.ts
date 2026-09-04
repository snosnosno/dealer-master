import { describe, expect, it } from 'vitest'
import { parseCard } from './cards'
import { bestOmahaHi, bestOmahaLow, omahaCombos } from './omaha'

const hand = (s: string) => s.split(' ').map(parseCard)

describe('omahaCombos', () => {
  it('홀 4장 × 보드 5장이면 조합이 정확히 60개다', () => {
    expect(omahaCombos(hand('As Kh 2d 3c'), hand('7s 6h 5d 4c 2h'))).toHaveLength(60)
  })

  it('모든 조합이 홀 2장 + 보드 3장이다', () => {
    const hole = hand('As Kh 2d 3c')
    const board = hand('7s 6h 5d 4c 2h')
    const holeKeys = new Set(hole.map((c) => c.rank + c.suit))
    for (const five of omahaCombos(hole, board)) {
      expect(five).toHaveLength(5)
      const fromHole = five.filter((c) => holeKeys.has(c.rank + c.suit)).length
      expect(fromHole).toBe(2)
    }
  })

  it('보드가 3장 미만이면 조합이 없다', () => {
    expect(omahaCombos(hand('As Kh 2d 3c'), hand('7s 6h'))).toHaveLength(0)
  })
})

describe('bestOmahaLow', () => {
  it('보드에 8 이하가 3장 없으면 로우가 불가능하다', () => {
    // 보드 K Q J 9 4 — 8 이하가 4 하나뿐이다
    expect(bestOmahaLow(hand('As 2h 3d 4c'), hand('Ks Qh Jd 9c 4h'), 8)).toBeNull()
  })

  it('보드 8 이하 3장 + 홀 2장으로 휠을 만든다', () => {
    // 보드 5-4-3 을 쓰고 홀에서 A-2 를 쓰면 5-4-3-2-A
    const low = bestOmahaLow(hand('As 2h Kd Qc'), hand('5s 4h 3d Jc Th'), 8)
    expect(low).not.toBeNull()
    expect(low!.key).toEqual([0, 5, 4, 3, 2, 1])
  })

  it('홀에 낮은 카드가 둘 없으면 자격 미달이라 null 이다', () => {
    // 보드는 5-4-3 로 좋은데 홀에 8 이하가 하나뿐이라 두 장을 못 쓴다
    expect(bestOmahaLow(hand('2s Kh Qd Jc'), hand('5s 4h 3d Ac Th'), 8)).toBeNull()
  })

  it('페어가 끼면 자격이 없다', () => {
    // 홀 A-2, 보드 A-2-3 — 어느 조합도 페어를 피하지 못한다
    expect(bestOmahaLow(hand('As 2h Kd Qc'), hand('Ah 2d 3s Jc Th'), 8)).toBeNull()
  })
})

describe('bestOmahaHi', () => {
  it('홀 2장을 반드시 쓴다 — 보드 스트레이트를 그냥 못 가져간다', () => {
    // 보드가 이미 9-8-7-6-5 지만 홀 2장을 써야 하므로 보드 스트레이트가 아니다
    const hi = bestOmahaHi(hand('As Ah 2d 3c'), hand('9s 8h 7d 6c 5h'))
    expect(hi.label).not.toBe('스트레이트')
  })
})
