/**
 * 이벤트 리듀서.
 *
 * applyEvent 는 입력 상태를 절대 제자리에서 고치지 않는다. 중첩 배열까지
 * 새로 만들어 돌려준다. 얕은 복사만 하고 seats·board·contributed 를 공유하면
 * 되감기로 만든 과거 상태가 조용히 오염돼서, 재현이 안 되는 버그가 된다.
 */
import type { HandEvent, HandState, SeatInit, SeatState } from './types'

export function initialState(seats: SeatInit[], buttonSeat: number): HandState {
  return {
    seats: seats.map((s) => ({
      name: s.name,
      stack: s.stack,
      bet: 0,
      folded: false,
      allIn: false,
      hole: [],
      revealed: false,
    })),
    buttonSeat,
    board: [],
    pot: 0,
    street: 'preflop',
    contributed: seats.map(() => 0),
    lastRaiseSize: 0,
    bigBlind: 0,
  }
}

/** 이번 라운드의 현재 최고 벳. */
function currentBet(state: HandState): number {
  return state.seats.reduce((max, s) => (s.bet > max ? s.bet : max), 0)
}

/**
 * 이 벳이 베팅을 다시 여는 **풀 레이즈**인가.
 *
 * 리듀서는 이 판단으로 `lastRaiseSize` 를 갱신하고, 생성기는 같은 판단으로
 * 레이즈 권리(`actedSinceFullRaise`)를 초기화한다. 판단이 둘로 갈라지면
 * "폭은 안 늘었는데 베팅은 다시 열렸다" 같은 불가능한 상태가 만들어진다.
 *
 * @param state  액션을 적용하기 **전**의 상태
 * @param newBet 액션 후 그 좌석의 실제 벳 (스택에 잘린 뒤의 값)
 */
export function isFullRaise(state: HandState, newBet: number): boolean {
  const before = currentBet(state)
  return newBet > before && newBet - before >= Math.max(state.lastRaiseSize, state.bigBlind)
}

/** 좌석 하나만 바꾼 새 seats 배열을 만든다. */
function withSeat(state: HandState, i: number, patch: Partial<SeatState>): SeatState[] {
  return state.seats.map((s, idx) => (idx === i ? { ...s, ...patch } : s))
}

/** 좌석 i 의 벳을 to 까지 올린다. 스택보다 크면 스택 전액(올인)으로 자른다. */
function raiseBetTo(
  state: HandState,
  i: number,
  to: number,
): { seats: SeatState[]; contributed: number[] } {
  const seat = state.seats[i]
  // 목표 벳이 현재 벳보다 작으면 delta 가 음수가 되어 스택이 늘고 벳·투입액이 줄어든다.
  // 칩 총액은 보존된다(스택이 는 만큼 벳이 준다) — 깨지는 것은 contributed 원장이다.
  // 그 원장이 Task 5 사이드팟의 근거이므로, 어긋난 채 진행하면 사이드팟이 조용히 틀어진다.
  // 생성기 버그를 흡수하지 말고 여기서 fail-fast 한다.
  // 미콜 벳을 되돌리는 것은 return_uncalled 의 일이다.
  if (to < seat.bet) {
    throw new Error(
      `좌석 ${i}(0-based) 의 목표 벳 ${to} 이 현재 벳 ${seat.bet} 보다 작다. ` +
        `벳은 되돌릴 수 없다 — 미콜 벳 반환은 return_uncalled 를 쓸 것.`,
    )
  }
  const want = to - seat.bet
  const delta = Math.min(want, seat.stack)
  const contributed = state.contributed.slice()
  contributed[i] += delta
  return {
    seats: withSeat(state, i, {
      stack: seat.stack - delta,
      bet: seat.bet + delta,
      allIn: seat.stack - delta === 0,
    }),
    contributed,
  }
}

export function applyEvent(state: HandState, e: HandEvent): HandState {
  switch (e.type) {
    case 'move_button':
      return { ...state, buttonSeat: e.toSeat }

    case 'post_blind': {
      // amount 는 목표치가 아니라 '이만큼 낸다' 는 가산액이다. 블라인드는 bet 이 0 일 때
      // 내므로 sb/bb 는 동작이 같고, 앤티는 블라인드와 어느 순서로 와도 합계가 옳아진다.
      // 목표치로 다루면 앤티가 블라인드에 흡수되거나(과소 징수) 음수 delta 가 된다.
      const { seats, contributed } = raiseBetTo(state, e.seat, state.seats[e.seat].bet + e.amount)
      /*
       * 프리플랍의 오픈 벳은 빅블라인드이고 그 폭도 빅블라인드다.
       * 앤티와 스몰블라인드는 벳을 여는 것이 아니므로 폭을 건드리지 않는다.
       */
      if (e.kind === 'bb') {
        const posted = seats[e.seat].bet
        return { ...state, seats, contributed, bigBlind: posted, lastRaiseSize: posted }
      }
      return { ...state, seats, contributed }
    }

    case 'deal_hole':
      return {
        ...state,
        seats: withSeat(state, e.seat, { hole: [...state.seats[e.seat].hole, e.card] }),
      }

    case 'burn':
      return state

    case 'deal_board':
      // 새 베팅 라운드에는 직전 폭이 없다. 하한은 룰셋이 빅블라인드로 잡아준다.
      return { ...state, board: [...state.board, ...e.cards], street: e.street, lastRaiseSize: 0 }

    case 'player_action': {
      const a = e.action
      if (a.kind === 'fold') {
        return { ...state, seats: withSeat(state, e.seat, { folded: true }) }
      }
      if (a.kind === 'check') return state
      const before = currentBet(state)
      const { seats, contributed } = raiseBetTo(state, e.seat, a.to)
      /*
       * 폭은 **요청한 to 가 아니라 실제로 오른 벳**에서 잰다. 스택에 잘린 올인은
       * 요청보다 적게 오르는데, 요청값으로 재면 다음 사람의 최소 레이즈가 부풀려진다.
       *
       * 그리고 풀 레이즈만 폭을 갱신한다. 못 미치는 올인이 폭을 덮어쓰면 그 뒤 사람의
       * 최소 레이즈가 규정보다 작아진다 — TD 시험 문제 6 이 노리는 함정이 정확히 이것이다
       * (`rulesets/nlh.exam.test.ts`).
       */
      const after = seats[e.seat].bet
      const lastRaiseSize = isFullRaise(state, after) ? after - before : state.lastRaiseSize
      return { ...state, seats, contributed, lastRaiseSize }
    }

    case 'return_uncalled': {
      const seat = state.seats[e.seat]
      // 낸 것보다 많이 되돌리면 bet 과 contributed 가 음수로 내려간다.
      // 여기도 칩 총액은 보존되고 깨지는 것은 원장이다 — raiseBetTo 와 같은 계열이다.
      // amount === seat.bet(벳 전액 반환)은 가장 흔한 정상 경로이므로 통과시킨다.
      if (e.amount > seat.bet) {
        throw new Error(
          `좌석 ${e.seat}(0-based) 에 되돌리려는 ${e.amount} 이 현재 벳 ${seat.bet} 보다 크다. ` +
            `낸 것보다 많이 되돌릴 수 없다.`,
        )
      }
      const contributed = state.contributed.slice()
      contributed[e.seat] -= e.amount
      return {
        ...state,
        seats: withSeat(state, e.seat, {
          stack: seat.stack + e.amount,
          bet: seat.bet - e.amount,
          // 결과 스택에서 유도한다. 무조건 false 로 두면 amount 가 0 일 때
          // 올인 좌석의 플래그가 잘못 풀려, 이후 액션 유효성(Task 6)과
          // 사이드팟 자격(Task 5)이 그 좌석을 전혀 다르게 취급한다.
          allIn: seat.stack + e.amount === 0,
        }),
        contributed,
      }
    }

    case 'collect_bets': {
      const total = state.seats.reduce((sum, s) => sum + s.bet, 0)
      return {
        ...state,
        pot: state.pot + total,
        seats: state.seats.map((s) => ({ ...s, bet: 0 })),
      }
    }

    case 'showdown_reveal':
      return { ...state, seats: withSeat(state, e.seat, { revealed: true }) }

    case 'award_pot': {
      // 클램프로 팟을 0 에서 멈추면 좌석 스택에는 전액이 들어가면서 초과분이 감춰진다.
      // 리듀서에서 칩 총액이 문자 그대로 늘어나는 곳은 여기 하나뿐이다
      // (팟은 pot 만큼만 줄고 스택은 amount 만큼 는다). 감추지 말고 터뜨린다.
      if (e.amount > state.pot) {
        throw new Error(
          `좌석 ${e.seat}(0-based) 에 지급하려는 ${e.amount} 이 남은 팟 ${state.pot} 보다 크다.`,
        )
      }
      return {
        ...state,
        pot: state.pot - e.amount,
        seats: withSeat(state, e.seat, { stack: state.seats[e.seat].stack + e.amount }),
      }
    }
  }
}

export function stateAt(init: HandState, events: HandEvent[], index: number): HandState {
  return events.slice(0, index).reduce(applyEvent, init)
}
