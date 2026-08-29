/**
 * 학습자용 이벤트 문구.
 *
 * 하네스의 `describeEvent`(`src/app/simulator-harness/format.ts`)를 재사용하지 않는다.
 * 그쪽은 좌석을 `#4` 처럼 **0-based** 로 찍는데, 그건 진단용으로는 옳지만 학습자
 * 화면에 그대로 쓰면 문항 문구(1-based)와 어긋나 오독을 만든다.
 *
 * 좌석 번호를 화면에 찍는 곳은 `displaySeat` 하나만 통과한다.
 */
import { cardToString } from '@/lib/simulator'
import type { Card, HandEvent, SeatInit } from '@/lib/simulator'

/** API 인덱스(0-based) → 학습자에게 보이는 번호(1-based). 유일한 변환점. */
export const displaySeat = (seatIndex: number): number => seatIndex + 1

const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }

export function cardText(card: Card): string {
  const raw = cardToString(card)
  const suit = raw.slice(-1)
  return raw.slice(0, -1) + (SUIT_SYMBOL[suit] ?? suit)
}

const num = (v: number) => v.toLocaleString('ko-KR')

const BLIND_LABEL = { sb: '스몰블라인드', bb: '빅블라인드', ante: '앤티' } as const
const ACTION_LABEL = {
  fold: '폴드', check: '체크', call: '콜', bet: '벳', raise: '레이즈', allin: '올인',
} as const
const STREET_LABEL = {
  preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버',
} as const

/** `이민아(3번)` — 이름과 1-based 번호를 함께 쓴다. */
const who = (seats: SeatInit[], seatIndex: number) =>
  `${seats[seatIndex].name}(${displaySeat(seatIndex)}번)`

/** 이벤트 하나를 학습자가 읽는 한 줄로. 이벤트 종류가 늘면 TS 가 여기서 걸린다. */
export function describeForLearner(e: HandEvent, seats: SeatInit[]): string {
  switch (e.type) {
    case 'move_button':
      return `버튼을 ${who(seats, e.toSeat)} 좌석으로 옮긴다`
    case 'post_blind':
      return `${who(seats, e.seat)} ${BLIND_LABEL[e.kind]} ${num(e.amount)}`
    case 'deal_hole':
      return `${who(seats, e.seat)}에게 홀카드`
    case 'burn':
      return '카드 한 장 번'
    case 'deal_board':
      return `${STREET_LABEL[e.street]} ${e.cards.map(cardText).join(' ')}`
    case 'player_action': {
      const label = ACTION_LABEL[e.action.kind]
      return e.action.kind === 'fold' || e.action.kind === 'check'
        ? `${who(seats, e.seat)} ${label}`
        : `${who(seats, e.seat)} ${label} → ${num(e.action.to)}`
    }
    case 'return_uncalled':
      return `${who(seats, e.seat)}에게 미콜 벳 ${num(e.amount)} 반환`
    case 'collect_bets':
      return '벳을 팟으로 끌어온다'
    case 'showdown_reveal':
      return `${who(seats, e.seat)} 핸드 공개`
    case 'award_pot':
      return e.potIndex === 0
        ? `메인팟 ${num(e.amount)} → ${who(seats, e.seat)}`
        : `사이드팟 ${e.potIndex} ${num(e.amount)} → ${who(seats, e.seat)}`
  }
}
