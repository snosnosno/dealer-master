import { describe, expect, it } from 'vitest'
import { asDown, asUp, parseCard, type DealtCard } from '@/lib/simulator'
import { GAMES } from '@/lib/games'
import { firstToActSeats, PALETTE, stepsFor } from './steps'

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

describe('firstToActSeats', () => {
  /** 버튼에서 세는 갈래는 카드를 안 본다 — `folded` 만 다른 좌석 여섯 */
  const noSeats = (folded: boolean[]) => folded.map((f) => ({ hole: [] as DealtCard[], folded: f }))
  const none = noSeats(new Array(6).fill(false))

  it('프리플랍은 BB 왼쪽 — 버튼이 0 이면 3번 좌석이다', () => {
    expect(firstToActSeats('left-of-bb', { buttonSeat: 0, seats: none })).toEqual([3])
  })

  it('플랍 이후는 버튼 왼쪽 — 버튼이 0 이면 1번 좌석이다', () => {
    expect(firstToActSeats('left-of-button', { buttonSeat: 0, seats: none })).toEqual([1])
  })

  it('좌석 번호는 6명을 넘어 돌아온다 — 버튼이 4면 BB 왼쪽은 1번이다', () => {
    expect(firstToActSeats('left-of-bb', { buttonSeat: 4, seats: none })).toEqual([1])
  })

  it('폴드한 좌석은 건너뛴다', () => {
    const seats = noSeats([false, true, true, false, false, false])
    expect(firstToActSeats('left-of-button', { buttonSeat: 0, seats })).toEqual([3])
  })

  it('구현하지 않은 스터드 순서는 명확한 메시지로 던진다', () => {
    expect(() => firstToActSeats('lowest-upcard', { buttonSeat: 0, seats: none })).toThrow(/스터드/)
  })

  it('전원이 폴드했으면 던진다 — 있을 수 없는 상태다', () => {
    expect(() => firstToActSeats('left-of-button', { buttonSeat: 0, seats: noSeats(new Array(6).fill(true)) }))
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

describe('firstToActSeats — 스터드', () => {
  it('3번가는 가장 높은 업카드가 먼저다', () => {
    // 좌석 2 가 K, 나머지는 그보다 낮다
    const seats = seatsFromUpcards(['5h', '9d', 'Ks', '3c', '7h', 'Td'])
    expect(firstToActSeats('highest-upcard', { buttonSeat: 0, seats })).toEqual([2])
  })

  it('3번가에서 페어가 하이카드를 이긴다', () => {
    const seats = seatsFromUpcards(['4h 4d', 'As Kh', '2c 3d', '', '', ''])
    expect(firstToActSeats('highest-upcard', { buttonSeat: 0, seats })).toEqual([0])
  })

  it('4번가 이후는 보드 로우가 가장 좋은 좌석이 먼저다', () => {
    // 좌석 4 가 A-2 로 가장 낮다
    const seats = seatsFromUpcards(['9h 8d', 'Ks Qc', 'Th 7d', '', 'Ac 2h', '5s 5d'])
    expect(firstToActSeats('lowest-hand', { buttonSeat: 0, seats })).toEqual([4])
  })

  it('폴드한 좌석은 먼저 말할 수 없다', () => {
    // 좌석 1 이 가장 높지만 폴드했다
    const seats = seatsFromUpcards(['9h', '', 'Ks', '3c', '7h', 'Td'])
    seats[1].hole = [...asUp([parseCard('Ah')])]
    expect(firstToActSeats('highest-upcard', { buttonSeat: 0, seats })).toEqual([2])
  })

  it('업카드가 없으면 던진다 — 카드가 안 나간 상태에서 라운드가 열릴 수 없다', () => {
    const seats = seatsFromUpcards(['', '', '', '', '', ''])
    expect(() => firstToActSeats('highest-upcard', { buttonSeat: 0, seats })).toThrow()
  })
})

/**
 * **동률은 하나로 좁히지 않는다.**
 *
 * 무늬 우열이 자료에 없으니(mixgame-facts §2 7-Card Stud 절) 동률인 두 좌석은 규칙으로
 * 구별되지 않는다. 예전에는 먼저 만난 좌석 하나만 남겼고, 그러면 훈련생이 동률인 다른
 * 좌석을 눌러 틀리는데 힌트로도 답을 좁힐 수 없었다(최종 리뷰 I-1).
 */
describe('firstToActSeats — 동률', () => {
  it('3번가 최고 업카드가 동률이면 두 좌석을 다 돌려준다', () => {
    // 좌석 1·4 가 같은 랭크 쌍(K·7)이고 무늬만 다르다
    const seats = seatsFromUpcards(['9h 8d', 'Ks 7d', 'Th 6d', '', 'Kh 7c', '5s 4d'])
    expect(firstToActSeats('highest-upcard', { buttonSeat: 0, seats })).toEqual([1, 4])
  })

  it('4번가 이후 보드 로우가 동률이면 두 좌석을 다 돌려준다', () => {
    // 좌석 2·5 가 5-3 로우로 같다 — 순서까지 다르게 놓아 정렬에 기대지 않는 것을 본다
    const seats = seatsFromUpcards(['9h 8d', 'Ks Qc', '5s 3h', '', 'Th 7d', '3d 5c'])
    expect(firstToActSeats('lowest-hand', { buttonSeat: 0, seats })).toEqual([2, 5])
  })

  it('셋이 동률이면 셋을 돌려주고 좌석 번호 오름차순이다', () => {
    const seats = seatsFromUpcards(['Ah 2d', 'Ks Qc', 'Ad 2h', 'Th 7d', 'As 2c', 'Jh 9d'])
    expect(firstToActSeats('lowest-hand', { buttonSeat: 0, seats })).toEqual([0, 2, 4])
  })

  it('동률이 아니면 여전히 하나다 — 집합이 늘 여럿이 되는 것이 아니다', () => {
    const seats = seatsFromUpcards(['Ah 2d', 'Ks Qc', '3d 4h', 'Th 7d', '8s 9c', 'Jh 9d'])
    expect(firstToActSeats('lowest-hand', { buttonSeat: 0, seats })).toEqual([0])
  })

  it('폴드한 좌석은 동률 집합에도 들지 않는다', () => {
    // 좌석 4 가 좌석 1 과 동률이지만 폴드했다
    const seats = seatsFromUpcards(['9h 8d', 'Ks 7d', 'Th 6d', '', '', '5s 4d'])
    seats[4] = { hole: [...asUp([parseCard('Kh'), parseCard('7c')])], folded: true }
    expect(firstToActSeats('highest-upcard', { buttonSeat: 0, seats })).toEqual([1])
  })
})
