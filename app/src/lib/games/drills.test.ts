import { describe, expect, it } from 'vitest'
import { drillsFor } from './drills'
import { GAMES } from './index'

describe('drillsFor', () => {
  it('PLO8은 드릴 여섯이 전부 해당된다', () => {
    expect(drillsFor(GAMES.plo8)).toEqual([
      'procedure', 'winner', 'potlimit', 'potaward', 'incident', 'action',
    ])
  })

  it('노리밋 홀덤은 팟리밋만 해당 없다', () => {
    const drills = drillsFor(GAMES.nlh)
    expect(drills).not.toContain('potlimit')
    expect(drills).toHaveLength(5)
  })

  // 로우 유무는 이제 칸을 지우지 않는다. 승자 판독이 무엇을 묻는지를 가른다 (설계 §2)
  it('승자 판독은 로우가 없는 종목에도 있다', () => {
    expect(GAMES.nlh.eval.lo).toBeNull()
    expect(drillsFor(GAMES.nlh)).toContain('winner')
    expect(drillsFor(GAMES.plo8)).toContain('winner')
  })

  it('팟리밋은 betting 코드값으로만 갈린다', () => {
    expect(GAMES.plo8.betting).toBe('PL')
    expect(GAMES.nlh.betting).toBe('NL')
  })
})

describe('PLO8 스펙', () => {
  it('스트릿이 넷이고 프리플랍만 번카드를 내리지 않는다', () => {
    const streets = GAMES.plo8.streets
    expect(streets.map((s) => s.id)).toEqual(['preflop', 'flop', 'turn', 'river'])
    expect(streets.map((s) => s.burn)).toEqual([false, true, true, true])
  })

  it('프리플랍은 좌석에 4장, 플랍은 보드에 3장을 낸다', () => {
    expect(GAMES.plo8.streets[0].deal).toEqual({ down: 4, up: 0, board: 0 })
    expect(GAMES.plo8.streets[1].deal).toEqual({ down: 0, up: 0, board: 3 })
  })

  it('첫 액션은 프리플랍이 BB 왼쪽, 이후는 버튼 왼쪽이다', () => {
    expect(GAMES.plo8.streets.map((s) => s.firstToAct)).toEqual([
      'left-of-bb', 'left-of-button', 'left-of-button', 'left-of-button',
    ])
  })
})
