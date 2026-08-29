/**
 * 하네스 포매터 테스트.
 *
 * 이 파일들은 확인용 하네스의 부품이지 엔진이 아니다. 그래도 테스트를 두는 이유는
 * 포매터가 틀리면 화면이 엔진 출력을 **잘못 옮기고**, 그러면 엔진이 멀쩡한데
 * 결함이 있는 것처럼 보이거나 그 반대가 되기 때문이다. 하네스의 목적이 대조인데
 * 대조 도구가 거짓말하면 목적 자체가 무너진다.
 */
import { describe, expect, it } from 'vitest'
import type { Card, HandEvent, Rank, Suit } from '@/lib/simulator'
import { describeEvent, hashEvents, seatLabels } from './format'

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit })

describe('describeEvent', () => {
  it('11종 이벤트를 전부 한 줄로 옮긴다 — 빈 문자열이나 [object Object] 가 없다', () => {
    const events: HandEvent[] = [
      { type: 'move_button', toSeat: 2 },
      { type: 'post_blind', seat: 3, amount: 100, kind: 'sb' },
      { type: 'deal_hole', seat: 0, card: card('A', 's') },
      { type: 'burn' },
      { type: 'deal_board', street: 'flop', cards: [card('2', 'h'), card('7', 'd'), card('K', 'c')] },
      { type: 'player_action', seat: 1, action: { kind: 'fold' } },
      { type: 'return_uncalled', seat: 4, amount: 500 },
      { type: 'collect_bets' },
      { type: 'showdown_reveal', seat: 5 },
      { type: 'award_pot', potIndex: 0, seat: 2, amount: 3000 },
    ]

    for (const e of events) {
      const line = describeEvent(e)
      expect(line.length).toBeGreaterThan(0)
      expect(line).not.toContain('object Object')
      expect(line).not.toContain('undefined')
    }
  })

  it('좌석은 0-based 인덱스를 #N 으로 쓴다 — 엔진 문항의 1-based "N번" 과 섞이면 안 된다', () => {
    expect(describeEvent({ type: 'post_blind', seat: 3, amount: 100, kind: 'bb' })).toContain('#3')
    expect(describeEvent({ type: 'post_blind', seat: 3, amount: 100, kind: 'bb' })).toContain('100')
    expect(describeEvent({ type: 'award_pot', potIndex: 1, seat: 2, amount: 3000 })).toContain('3,000')
  })

  it('여섯 가지 액션 종류를 구분한다 — 금액 있는 것은 금액까지', () => {
    const at = (action: Extract<HandEvent, { type: 'player_action' }>['action']) =>
      describeEvent({ type: 'player_action', seat: 0, action })

    expect(at({ kind: 'fold' })).toContain('폴드')
    expect(at({ kind: 'check' })).toContain('체크')
    expect(at({ kind: 'call', to: 800 })).toContain('콜')
    expect(at({ kind: 'call', to: 800 })).toContain('800')
    expect(at({ kind: 'bet', to: 1200 })).toContain('벳')
    expect(at({ kind: 'raise', to: 2400 })).toContain('레이즈')
    expect(at({ kind: 'allin', to: 9999 })).toContain('올인')
  })

  it('카드를 랭크+수트 기호로 옮긴다', () => {
    const line = describeEvent({ type: 'deal_hole', seat: 0, card: card('A', 's') })
    expect(line).toContain('A')
    expect(line).toContain('♠')
  })
})

describe('hashEvents', () => {
  it('같은 이벤트 열이면 같은 해시다', () => {
    const a: HandEvent[] = [{ type: 'burn' }, { type: 'move_button', toSeat: 1 }]
    const b: HandEvent[] = [{ type: 'burn' }, { type: 'move_button', toSeat: 1 }]
    expect(hashEvents(a)).toBe(hashEvents(b))
  })

  it('한 필드만 달라도 해시가 갈린다 — 이 단언이 없으면 상수를 반환해도 통과한다', () => {
    const a: HandEvent[] = [{ type: 'move_button', toSeat: 1 }]
    const b: HandEvent[] = [{ type: 'move_button', toSeat: 2 }]
    expect(hashEvents(a)).not.toBe(hashEvents(b))
  })

  it('순서가 바뀌면 해시가 갈린다', () => {
    const a: HandEvent[] = [{ type: 'burn' }, { type: 'collect_bets' }]
    const b: HandEvent[] = [{ type: 'collect_bets' }, { type: 'burn' }]
    expect(hashEvents(a)).not.toBe(hashEvents(b))
  })

  it('빈 열도 해시를 낸다', () => {
    expect(hashEvents([]).length).toBeGreaterThan(0)
  })
})

describe('seatLabels', () => {
  it('버튼·SB·BB 를 버튼 좌석 기준으로 매긴다', () => {
    // 6인, 버튼 0번 → SB 1, BB 2
    const labels = seatLabels(6, 0)
    expect(labels[0]).toContain('BTN')
    expect(labels[1]).toContain('SB')
    expect(labels[2]).toContain('BB')
    expect(labels[3]).toBe('')
  })

  it('버튼이 끝 좌석이면 랩어라운드한다', () => {
    const labels = seatLabels(6, 5)
    expect(labels[5]).toContain('BTN')
    expect(labels[0]).toContain('SB')
    expect(labels[1]).toContain('BB')
  })

  it('3인 테이블에서는 버튼이 곧 UTG 라 세 좌석이 전부 라벨을 받는다', () => {
    const labels = seatLabels(3, 0)
    expect(labels[0]).toContain('BTN')
    expect(labels[1]).toContain('SB')
    expect(labels[2]).toContain('BB')
  })
})
