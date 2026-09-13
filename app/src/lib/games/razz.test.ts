import { describe, expect, it } from 'vitest'
import { drillsFor } from './drills'
import { GAMES } from './index'
import { stepsFor } from '@/lib/drills/procedure/steps'

/**
 * 라즈 스펙의 값은 `docs/references/mixgame-facts.md` §2 Razz 절에서 온다.
 * 그 절이 밝히듯 **첫 액션 두 줄은 자료가 아니라 사용자 확정(2026-09-03)** 이다.
 * 표 전체 이미지를 받아 자료 근거로 바꾸면 이 테스트도 함께 고친다.
 */
describe('라즈 스펙', () => {
  it('스터드 픽스리밋이고 앤티·브링인으로 시작한다', () => {
    expect(GAMES.razz.family).toBe('stud')
    expect(GAMES.razz.betting).toBe('FL')
    expect(GAMES.razz.forced).toBe('ante+bringin')
  })

  it('스트릿이 다섯이고 3번가만 번카드를 내리지 않는다', () => {
    const streets = GAMES.razz.streets
    expect(streets.map((s) => s.id)).toEqual(['third', 'fourth', 'fifth', 'sixth', 'seventh'])
    expect(streets.map((s) => s.burn)).toEqual([false, true, true, true, true])
  })

  it('3번가가 다운 2와 업 1을 함께 내리고 7번가는 다운이다', () => {
    expect(GAMES.razz.streets[0].deal).toEqual({ down: 2, up: 1, board: 0 })
    expect(GAMES.razz.streets[4].deal).toEqual({ down: 1, up: 0, board: 0 })
  })

  it('좌석에만 카드가 가고 보드에는 한 장도 안 간다', () => {
    expect(GAMES.razz.streets.every((s) => s.deal.board === 0)).toBe(true)
  })

  // 7카드 스터드와 **반대**다 — 라즈는 가장 높은 업카드가 브링인이다
  it('3번가는 가장 높은 업카드가, 이후는 가장 좋은 로우가 먼저 말한다', () => {
    expect(GAMES.razz.streets.map((s) => s.firstToAct)).toEqual([
      'highest-upcard', 'lowest-hand', 'lowest-hand', 'lowest-hand', 'lowest-hand',
    ])
  })

  it('5번가부터 빅벳이다', () => {
    expect(GAMES.razz.streets.map((s) => s.sizeMultiplier)).toEqual([1, 1, 2, 2, 2])
  })

  it('로우 전용이고 자격이 없다 — 하이가 아예 없다', () => {
    expect(GAMES.razz.eval.hi).toBeNull()
    expect(GAMES.razz.eval.lo).toEqual({ kind: 'a5', qualifier: null })
    expect(GAMES.razz.eval.mustUse).toBeNull()
  })
})

describe('라즈가 격자에 붙는다', () => {
  it('픽스리밋이라 팟리밋 칸이 스스로 사라진다', () => {
    const drills = drillsFor(GAMES.razz)
    expect(drills).not.toContain('potlimit')
    expect(drills).toHaveLength(5)
  })

  it('진행절차 대본이 스펙만으로 22스텝을 낸다', () => {
    expect(stepsFor(GAMES.razz)).toHaveLength(22)
  })

  it('앤티 종목이라 대본이 블라인드가 아니라 앤티로 열린다', () => {
    expect(stepsFor(GAMES.razz)[0].act).toBe('ante')
    expect(stepsFor(GAMES.plo8)[0].act).toBe('blinds')
  })
})
