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
  /**
   * 이번 베팅 라운드에 나온 가장 큰 레이즈의 **폭**. 최소 레이즈 계산의 근거다.
   *
   * 좌석 벳에서 유도되지 않는다 — "직전 풀 레이즈의 폭"은 역사이지 현재가 아니다.
   * 그래서 상태가 들고 간다. 값이 필요한 쪽마다 이벤트를 되짚어 다시 계산하면
   * 규칙의 정본이 둘로 갈라지고, 훈련생이 틀린 금액을 정답으로 배우게 된다.
   *
   * 프리플랍은 빅블라인드 포스트가 이 값을 빅블라인드로 세우고, 스트릿이 바뀌면 0 이 된다.
   * 풀 레이즈에 못 미치는 올인은 이 값을 갱신하지 않는다.
   */
  lastRaiseSize: number
  /**
   * 빅블라인드. 최소 벳·최소 레이즈 폭의 하한이다.
   *
   * `post_blind` 의 `kind: 'bb'` 에서 유도한다. 빅블라인드가 전액에 못 미치는
   * 올인으로 들어오면 이 값도 그만큼 작아진다 — 그런 핸드를 만들 때는 확인이 필요하다.
   */
  bigBlind: number
}

export type SeatInit = { name: string; stack: number }

/**
 * 테이블을 그리는 데 필요한 것만. `HandState` 는 이것을 구조적으로 만족한다.
 *
 * `PokerTable` 이 `HandState` 를 요구하면 노리밋 홀덤 시뮬레이터를 돌리지 않는
 * 드릴(진행절차)이 테이블을 못 쓴다. 좁은 계약 하나면 양쪽이 같은 테이블을 쓴다.
 */
export type TableView = {
  seats: SeatState[]
  buttonSeat: number
  board: Card[]
  pot: number
}
