import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import { firstToActSeat, PALETTE, stepsFor } from './steps'

describe('PALETTE', () => {
  it('팔레트는 늘 일곱이고 첫 순서 지목은 들어 있지 않다', () => {
    expect(PALETTE.map((a) => a.id)).toEqual([
      'ante', 'blinds', 'burn', 'deal', 'draw', 'betting', 'payout',
    ])
  })
})

describe('stepsFor(plo8)', () => {
  const steps = stepsFor(GAMES.plo8)

  it('17스텝이다', () => {
    expect(steps).toHaveLength(17)
  })

  it('블라인드로 시작하고 팟 지급으로 끝난다', () => {
    expect(steps[0]).toEqual({ act: 'blinds', streetIndex: -1 })
    expect(steps[16]).toEqual({ act: 'payout', streetIndex: -1 })
  })

  it('프리플랍은 번카드가 없고 플랍부터 있다', () => {
    expect(steps.slice(1, 4).map((s) => s.act)).toEqual(['deal', 'open', 'betting'])
    expect(steps.slice(4, 8).map((s) => s.act)).toEqual(['burn', 'deal', 'open', 'betting'])
  })

  it('첫 순서 지목은 카드가 다 나간 뒤에 온다 — 늘 deal 다음이다', () => {
    steps.forEach((step, i) => {
      if (step.act === 'open') expect(steps[i - 1].act).toBe('deal')
    })
  })
})

describe('firstToActSeat', () => {
  const none = [false, false, false, false, false, false]

  it('프리플랍은 BB 왼쪽 — 버튼이 0 이면 3번 좌석이다', () => {
    expect(firstToActSeat('left-of-bb', 0, 6, none)).toBe(3)
  })

  it('플랍 이후는 버튼 왼쪽 — 버튼이 0 이면 1번 좌석이다', () => {
    expect(firstToActSeat('left-of-button', 0, 6, none)).toBe(1)
  })

  it('좌석 번호는 6명을 넘어 돌아온다 — 버튼이 4면 BB 왼쪽은 1번이다', () => {
    expect(firstToActSeat('left-of-bb', 4, 6, none)).toBe(1)
  })

  it('폴드한 좌석은 건너뛴다', () => {
    const folded = [false, true, true, false, false, false]
    expect(firstToActSeat('left-of-button', 0, 6, folded)).toBe(3)
  })

  it('구현하지 않은 스터드 순서는 명확한 메시지로 던진다', () => {
    expect(() => firstToActSeat('lowest-upcard', 0, 6, none)).toThrow(/스터드/)
  })

  it('전원이 폴드했으면 던진다 — 있을 수 없는 상태다', () => {
    expect(() => firstToActSeat('left-of-button', 0, 6, [true, true, true, true, true, true]))
      .toThrow()
  })
})
