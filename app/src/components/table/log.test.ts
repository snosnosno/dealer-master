import { describe, expect, test } from 'vitest'
import type { HandEvent, SeatInit } from '@/lib/simulator'
import { cardText, describeForLearner, displaySeat } from './log'

const seats: SeatInit[] = [
  { name: '김도현', stack: 8000 },
  { name: '박서준', stack: 19000 },
  { name: '이민아', stack: 19000 },
]

describe('좌석 번호 변환', () => {
  test('0-based 인덱스를 1-based 표시 번호로 바꾼다', () => {
    expect(displaySeat(0)).toBe(1)
    expect(displaySeat(4)).toBe(5)
  })
})

describe('카드 문자', () => {
  test('수트를 기호로 바꾸고 랭크는 그대로 둔다', () => {
    expect(cardText({ rank: 'A', suit: 's' })).toBe('A♠')
    expect(cardText({ rank: 'T', suit: 'h' })).toBe('T♥')
  })
})

describe('학습자용 이벤트 문구', () => {
  test('좌석을 이름과 1-based 번호로 쓴다 — 0-based 를 노출하지 않는다', () => {
    const e: HandEvent = { type: 'player_action', seat: 2, action: { kind: 'raise', to: 800 } }
    const line = describeForLearner(e, seats)
    expect(line).toBe('이민아(3번) 레이즈 → 800')
    expect(line).not.toContain('#')
  })

  test('폴드·체크는 금액을 붙이지 않는다', () => {
    expect(describeForLearner({ type: 'player_action', seat: 0, action: { kind: 'fold' } }, seats))
      .toBe('김도현(1번) 폴드')
    expect(describeForLearner({ type: 'player_action', seat: 1, action: { kind: 'check' } }, seats))
      .toBe('박서준(2번) 체크')
  })

  test('블라인드·버튼·반환도 1-based 다', () => {
    expect(describeForLearner({ type: 'move_button', toSeat: 2 }, seats))
      .toBe('버튼을 이민아(3번) 좌석으로 옮긴다')
    expect(describeForLearner({ type: 'post_blind', seat: 0, amount: 100, kind: 'sb' }, seats))
      .toBe('김도현(1번) 스몰블라인드 100')
    expect(describeForLearner({ type: 'return_uncalled', seat: 1, amount: 200 }, seats))
      .toBe('박서준(2번)에게 미콜 벳 200 반환')
  })

  test('금액에 천단위 구분이 들어간다', () => {
    expect(describeForLearner({ type: 'award_pot', potIndex: 0, seat: 1, amount: 32300 }, seats))
      .toBe('메인팟 32,300 → 박서준(2번)')
    expect(describeForLearner({ type: 'award_pot', potIndex: 1, seat: 1, amount: 13500 }, seats))
      .toBe('사이드팟 1 13,500 → 박서준(2번)')
  })

  test('딜러 동작은 좌석이 없다', () => {
    expect(describeForLearner({ type: 'burn' }, seats)).toBe('카드 한 장 번')
    expect(describeForLearner({ type: 'collect_bets' }, seats)).toBe('벳을 팟으로 끌어온다')
  })

  test('보드는 스트리트 이름을 한국어로 쓴다', () => {
    const e: HandEvent = {
      type: 'deal_board',
      street: 'flop',
      cards: [{ rank: '8', suit: 'h' }, { rank: 'A', suit: 'c' }, { rank: 'Q', suit: 'd' }],
    }
    expect(describeForLearner(e, seats)).toBe('플랍 8♥ A♣ Q♦')
  })
})
