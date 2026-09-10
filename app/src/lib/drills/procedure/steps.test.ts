import { describe, expect, it } from 'vitest'
import { asDown, asUp, parseCard, type DealtCard } from '@/lib/simulator'
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
  /** 버튼에서 세는 갈래는 카드를 안 본다 — `folded` 만 다른 좌석 여섯 */
  const noSeats = (folded: boolean[]) => folded.map((f) => ({ hole: [] as DealtCard[], folded: f }))
  const none = noSeats(new Array(6).fill(false))

  it('프리플랍은 BB 왼쪽 — 버튼이 0 이면 3번 좌석이다', () => {
    expect(firstToActSeat('left-of-bb', { buttonSeat: 0, seats: none })).toBe(3)
  })

  it('플랍 이후는 버튼 왼쪽 — 버튼이 0 이면 1번 좌석이다', () => {
    expect(firstToActSeat('left-of-button', { buttonSeat: 0, seats: none })).toBe(1)
  })

  it('좌석 번호는 6명을 넘어 돌아온다 — 버튼이 4면 BB 왼쪽은 1번이다', () => {
    expect(firstToActSeat('left-of-bb', { buttonSeat: 4, seats: none })).toBe(1)
  })

  it('폴드한 좌석은 건너뛴다', () => {
    const seats = noSeats([false, true, true, false, false, false])
    expect(firstToActSeat('left-of-button', { buttonSeat: 0, seats })).toBe(3)
  })

  it('구현하지 않은 스터드 순서는 명확한 메시지로 던진다', () => {
    expect(() => firstToActSeat('lowest-upcard', { buttonSeat: 0, seats: none })).toThrow(/스터드/)
  })

  it('전원이 폴드했으면 던진다 — 있을 수 없는 상태다', () => {
    expect(() => firstToActSeat('left-of-button', { buttonSeat: 0, seats: noSeats(new Array(6).fill(true)) }))
      .toThrow()
  })
})

/**
 * 업카드 문자열로 좌석 여섯을 만든다. 빈 문자열은 폴드한 좌석이다.
 *
 * 살아 있는 좌석마다 엎은 `2c` 를 한 장 먼저 놓는다 — `faceUp` 을 안 보는 구현을
 * 잡는 미끼다. 아래 로우 테스트에서 그 `2c` 까지 세면 좌석 4 가 2 한 쌍을 들어
 * 가장 나쁜 로우로 밀리고 답이 4 에서 0 으로 뒤집힌다 (실측 확인).
 */
function seatsFromUpcards(specs: string[]) {
  return specs.map((s) => ({
    hole: s === '' ? ([] as DealtCard[]) : [...asDown([parseCard('2c')]), ...asUp(s.split(' ').map(parseCard))],
    folded: s === '',
  }))
}

describe('firstToActSeat — 스터드', () => {
  it('3번가는 가장 높은 업카드가 먼저다', () => {
    // 좌석 2 가 K, 나머지는 그보다 낮다
    const seats = seatsFromUpcards(['5h', '9d', 'Ks', '3c', '7h', 'Td'])
    expect(firstToActSeat('highest-upcard', { buttonSeat: 0, seats })).toBe(2)
  })

  it('3번가에서 페어가 하이카드를 이긴다', () => {
    const seats = seatsFromUpcards(['4h 4d', 'As Kh', '2c 3d', '', '', ''])
    expect(firstToActSeat('highest-upcard', { buttonSeat: 0, seats })).toBe(0)
  })

  it('4번가 이후는 보드 로우가 가장 좋은 좌석이 먼저다', () => {
    // 좌석 4 가 A-2 로 가장 낮다
    const seats = seatsFromUpcards(['9h 8d', 'Ks Qc', 'Th 7d', '', 'Ac 2h', '5s 5d'])
    expect(firstToActSeat('lowest-hand', { buttonSeat: 0, seats })).toBe(4)
  })

  it('폴드한 좌석은 먼저 말할 수 없다', () => {
    // 좌석 1 이 가장 높지만 폴드했다
    const seats = seatsFromUpcards(['9h', '', 'Ks', '3c', '7h', 'Td'])
    seats[1].hole = [...asUp([parseCard('Ah')])]
    expect(firstToActSeat('highest-upcard', { buttonSeat: 0, seats })).toBe(2)
  })

  it('업카드가 없으면 던진다 — 카드가 안 나간 상태에서 라운드가 열릴 수 없다', () => {
    const seats = seatsFromUpcards(['', '', '', '', '', ''])
    expect(() => firstToActSeat('highest-upcard', { buttonSeat: 0, seats })).toThrow()
  })
})
