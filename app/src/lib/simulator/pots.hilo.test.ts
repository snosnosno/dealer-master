/**
 * 하이로우 분배 — 홀칩이 두 번 생긴다.
 *
 * 반으로 가를 때 한 번(하이 쪽으로), 각 절반을 동점자끼리 나눌 때 또 한 번
 * (버튼 왼쪽부터). 둘을 한 번으로 합치면 쿼터링에서 금액이 어긋난다.
 */
import { describe, expect, it } from 'vitest'
import { GAMES, evaluatorFor } from '@/lib/games'
import { parseCard } from './cards'
import { awardPots, buildPots, ODD_CHIP_UNIT, type Pot } from './pots'

const hand = (s: string) => s.split(' ').map(parseCard)
const ev = evaluatorFor(GAMES.plo8)
const evHi = evaluatorFor(GAMES.nlh)

/** 지급 합계 */
const total = (awards: { amount: number }[]) => awards.reduce((s, a) => s + a.amount, 0)

describe('awardPots — 하이로우', () => {
  it('로우가 성립하지 않으면 하이가 전부 가져간다 (스쿱)', () => {
    // 보드에 8 이하가 2장뿐 — 로우 자체가 불가능하다
    const board = hand('Kh Qd Jc 9s 5h')
    const hole = [hand('As Ah 2d 3c'), hand('Ks Kd 4h 6c')]
    const pots: Pot[] = [{ amount: 10000, eligibleSeats: [0, 1] }]
    const awards = awardPots(pots, hole, board, 0, ev)

    expect(total(awards)).toBe(10000)
    expect(awards.every((a) => a.half === 'hi')).toBe(true)
  })

  it('하이와 로우가 갈리면 반씩 가고, 남는 칩은 하이 쪽이다', () => {
    const board = hand('2h 4d 6c Ks Qh')
    // 0번: 보드와 A-3 으로 로우, 1번: 킹 투페어로 하이
    const hole = [hand('As 3d Ts 9h'), hand('Kh Kd 9s 8c')]
    const pots: Pot[] = [{ amount: 8100, eligibleSeats: [0, 1] }]
    const awards = awardPots(pots, hole, board, 0, ev)

    expect(total(awards)).toBe(8100)
    const hi = awards.filter((a) => a.half === 'hi')
    const lo = awards.filter((a) => a.half === 'lo')
    // 8,100 은 100 단위로 반이 안 갈린다 — 하이 4,100 · 로우 4,000
    expect(total(hi)).toBe(4100)
    expect(total(lo)).toBe(4000)
  })

  it('모든 지급액이 칩 단위의 배수다', () => {
    const board = hand('2h 4d 6c Ks Qh')
    const hole = [hand('As 3d Ts 9h'), hand('Kh Kd 9s 8c')]
    const awards = awardPots([{ amount: 8100, eligibleSeats: [0, 1] }], hole, board, 0, ev)
    for (const a of awards) expect(a.amount % ODD_CHIP_UNIT).toBe(0)
  })

  it('지급 좌석은 그 팟의 자격자 안에 있다', () => {
    const board = hand('2h 4d 6c Ks Qh')
    const hole = [hand('As 3d Ts 9h'), hand('Kh Kd 9s 8c'), hand('7s 7d 3h 3c')]
    const pots = buildPots([1000, 3000, 3000], [false, false, false])
    const awards = awardPots(pots, hole, board, 0, ev)
    for (const a of awards) {
      expect(pots[a.potIndex].eligibleSeats).toContain(a.seat)
    }
    expect(total(awards)).toBe(7000)
  })

  it('자격자가 한 명뿐인 팟은 쇼다운 없이 그 좌석이 받는다', () => {
    const board = hand('2h 4d 6c Ks Qh')
    const hole = [hand('As 3d Ts 9h'), hand('Kh Kd 9s 8c')]
    const awards = awardPots([{ amount: 500, eligibleSeats: [1] }], hole, board, 0, ev)
    expect(awards).toEqual([{ potIndex: 0, seat: 1, amount: 500, half: 'hi' }])
  })
})

describe('awardPots — 로우 없는 종목은 예전과 같다', () => {
  it('노리밋 홀덤에는 half:lo 지급이 하나도 없다', () => {
    const board = hand('2h 4d 6c Ks Qh')
    const hole = [hand('As 3d'), hand('Kh Kd')]
    const awards = awardPots([{ amount: 10000, eligibleSeats: [0, 1] }], hole, board, 0, evHi)
    expect(awards.every((a) => a.half === 'hi')).toBe(true)
    expect(total(awards)).toBe(10000)
  })
})
