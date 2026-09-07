import { describe, expect, it } from 'vitest'
import { parseCard } from '@/lib/simulator'
import { GAMES } from './index'
import { evaluatorFor } from './evaluator'
import type { GameSpec } from './types'

const hand = (s: string) => s.split(' ').map(parseCard)

describe('evaluatorFor — PLO8', () => {
  const ev = evaluatorFor(GAMES.plo8)

  it('하이는 오마하 2+3 을 강제한다 — 홀의 스트레이트를 혼자 쓰지 못한다', () => {
    // 홀에 A K Q J 가 있어도 보드 3장을 반드시 써야 하므로 스트레이트가 되지 않는다
    const hole = hand('As Ks Qs Js')
    const board = hand('2h 7d 9c 4s 5h')
    const rank = ev.rankHi(hole, board)
    // 하이카드 A (스트레이트도 플러시도 아니다). category 0 = 하이카드
    expect(rank.category).toBe(0)
  })

  it('로우는 8 이하 자격을 지킨다 — 자격 미달이면 null 이다', () => {
    expect(ev.rankLo).not.toBeNull()
    const rankLo = ev.rankLo as NonNullable<typeof ev.rankLo>
    // 보드에 8 이하가 2장뿐이라 로우가 성립할 수 없다
    expect(rankLo(hand('As 2h 3d 4c'), hand('Kh Qd Jc 9s 5h'))).toBeNull()
  })

  it('로우가 성립하면 LowRank 를 낸다', () => {
    const rankLo = ev.rankLo as NonNullable<typeof ev.rankLo>
    const low = rankLo(hand('As 2h Kd Qc'), hand('3h 4d 5c Kh Qs'))
    expect(low).not.toBeNull()
  })
})

describe('evaluatorFor — 노리밋 홀덤', () => {
  const ev = evaluatorFor(GAMES.nlh)

  it('강제 조합이 없으면 일곱 장에서 가장 좋은 다섯 장을 고른다', () => {
    const rank = ev.rankHi(hand('As Ks'), hand('Qs Js Ts 2h 3d'))
    // 로열 = 스트레이트 플러시. category 8 이 최상위다
    expect(rank.category).toBe(8)
  })

  it('로우가 없는 종목은 rankLo 가 null 이다', () => {
    expect(ev.rankLo).toBeNull()
  })
})

describe('evaluatorFor — 아직 만들지 않은 갈래는 던진다', () => {
  it('공유 보드가 없는 종목은 던진다', () => {
    const stud = { ...GAMES.plo8, family: 'stud' } as GameSpec
    expect(() => evaluatorFor(stud)).toThrow()
  })

  it('강제 조합 없는 하이로우는 던진다', () => {
    const oddball = {
      ...GAMES.plo8,
      eval: { ...GAMES.plo8.eval, mustUse: null },
    } as GameSpec
    expect(() => evaluatorFor(oddball)).toThrow()
  })
})
