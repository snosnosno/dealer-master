/**
 * 시뮬레이터 엔진의 공용 타입.
 *
 * 핸드 진행은 HandEvent 배열이고, 화면에 보이는 HandState 는 그 이벤트들을
 * 접어서(reduce) 만든다. 상태를 직접 고치지 않고 이벤트로만 전진하기 때문에
 * 되감기·재생이 공짜로 나오고, 같은 시드가 항상 같은 핸드를 만든다.
 */
import type { Card } from './cards'

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export type PlayerAction =
  | { kind: 'fold' }
  | { kind: 'check' }
  | { kind: 'call'; to: number }
  | { kind: 'bet'; to: number }
  | { kind: 'raise'; to: number }
  | { kind: 'allin'; to: number }

export type HandEvent =
  | { type: 'move_button'; toSeat: number }
  | { type: 'post_blind'; seat: number; amount: number; kind: 'sb' | 'bb' | 'ante' }
  | { type: 'deal_hole'; seat: number; card: Card }
  | { type: 'burn' }
  | { type: 'deal_board'; street: Street; cards: Card[] }
  | { type: 'player_action'; seat: number; action: PlayerAction }
  /**
   * 아무도 맞추지 않은 벳을 벳한 사람에게 되돌려준다.
   * 딜러가 팟을 끌어오기 전에 초과분을 밀어 돌려주는 그 동작이다.
   * 이 이벤트가 없으면 미콜 벳이 팟에 섞여 사이드팟이 하나 더 있는 것처럼 보인다.
   */
  | { type: 'return_uncalled'; seat: number; amount: number }
  | { type: 'collect_bets' }
  | { type: 'showdown_reveal'; seat: number }
  | { type: 'award_pot'; potIndex: number; seat: number; amount: number }

export type SeatState = {
  name: string
  stack: number
  bet: number
  folded: boolean
  allIn: boolean
  hole: Card[]
  revealed: boolean
}

export type HandState = {
  seats: SeatState[]
  buttonSeat: number
  board: Card[]
  pot: number
  street: Street
  /** 핸드 전체에 걸친 좌석별 총 투입액. 사이드팟 계산의 근거가 된다. */
  contributed: number[]
}

export type SeatInit = { name: string; stack: number }
