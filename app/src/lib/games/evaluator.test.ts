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
    expect(ev.rankHi).not.toBeNull()
    const rankHi = ev.rankHi as NonNullable<typeof ev.rankHi>
    const rank = rankHi(hole, board)
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
    expect(ev.rankHi).not.toBeNull()
    const rankHi = ev.rankHi as NonNullable<typeof ev.rankHi>
    const rank = rankHi(hand('As Ks'), hand('Qs Js Ts 2h 3d'))
    // 로열 = 스트레이트 플러시. category 8 이 최상위다
    expect(rank.category).toBe(8)
  })

  it('로우가 없는 종목은 rankLo 가 null 이다', () => {
    expect(ev.rankLo).toBeNull()
  })
})

describe('라즈 평가기', () => {
  it('하이가 없다', () => {
    expect(evaluatorFor(GAMES.razz).rankHi).toBeNull()
  })

  it('로우는 자격 없이 늘 성립한다', () => {
    const ev = evaluatorFor(GAMES.razz)
    const hole = 'Kh Kd Ks Qc Qh Jd Jc'.split(' ').map(parseCard)
    expect(ev.rankLo).not.toBeNull()
    expect(ev.rankLo!(hole, [])).not.toBeNull()
  })

  it('보드를 안 쓴다 — 좌석 카드만으로 판정한다', () => {
    const ev = evaluatorFor(GAMES.razz)
    const hole = '5h 4d 3s 2c Ah Kd Qc'.split(' ').map(parseCard)
    expect(ev.rankLo!(hole, [])!.key).toEqual([0, 5, 4, 3, 2, 1])
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

  /**
   * **A-5 로우볼이라는 전제를 못박는다.**
   *
   * 라즈 드릴의 문구(「A-5 로우는 스트레이트를 세지 않으므로…」,
   * `drills/winner/generate.test.ts` 가 그 문장을 단언한다)와 `matchesRazzTarget`
   * 의 `'straightish'` 목표(연속·동무늬 손을 **일부러** 출제해 그것이 로우를 망치지
   * 않는다는 것을 가르친다)가 **둘 다 A-5 를 전제**한다. 2-7 로우볼은 스트레이트와
   * 플러시를 **세므로** 그 교훈이 정확히 뒤집힌다.
   *
   * 그 전제를 지키는 것은 `evaluator.ts` 의 `lo.kind !== 'a5'` throw 하나인데 그것을
   * 못박는 테스트가 없었다 — 위 두 `toThrow` 는 다른 갈래를 잡는다(최종 리뷰 M-N6).
   * 나중에 2-7 을 붙이는 사람이 이 throw 를 걷어내면 **이 테스트가 빨개져서** 문구와
   * `straightish` 목표도 같이 고쳐야 한다는 걸 알게 된다.
   */
  it('A-5 가 아닌 로우 방식은 던진다 — 2-7 은 스트레이트·플러시를 센다', () => {
    const twoSeven = {
      ...GAMES.razz,
      eval: { ...GAMES.razz.eval, lo: { kind: '27', qualifier: null } },
    } as GameSpec
    expect(() => evaluatorFor(twoSeven)).toThrow(/27/)
  })

  it('로우도 하이도 없는 스터드는 던진다', () => {
    const noEval = {
      ...GAMES.razz,
      eval: { ...GAMES.razz.eval, lo: null },
    } as GameSpec
    expect(() => evaluatorFor(noEval)).toThrow()
  })
})
