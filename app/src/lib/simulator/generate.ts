/**
 * 결정론적 핸드 생성기.
 *
 * 시드 하나에서 완결된 노리밋 홀덤 핸드 하나를 만든다. 무작위성은 전부
 * createRng(seed) 하나를 통과한다 — Math.random() 이 한 번이라도 섞이면
 * 같은 시드가 다른 핸드를 만들어 재현이 불가능한 버그가 된다.
 */
import { makeDeck, shuffle, type Card } from './cards'
import { createRng, type Rng } from './rng'
import { initialState, applyEvent } from './reduce'
import { awardPots, buildPots } from './pots'
import { nlh } from './rulesets/nlh'
import type { RulesetId } from './rulesets/types'
import type { HandEvent, HandState, PlayerAction, SeatInit, Street } from './types'

export type Difficulty = 'basic' | 'intermediate' | 'advanced'
export type DecisionKind = 'procedure' | 'action_validity' | 'calculation' | 'showdown'

export type GenerateOptions = {
  seed: string
  rulesetId?: RulesetId
  seatCount?: number
  difficulty?: Difficulty
  require?: DecisionKind[]
}

export type Hand = {
  seed: string
  rulesetId: RulesetId
  seats: SeatInit[]
  buttonSeat: number
  blinds: { sb: number; bb: number }
  events: HandEvent[]
}

export const PLAYER_NAMES = [
  '김도현','박서준','이민아','최우진','정하늘','강태호','윤소라','임재혁','한다은',
] as const

const STACK_UNITS = [8000, 12500, 19000, 25000, 31500, 47000, 62000, 88000]

export const MIN_SEATS = 3
export const MAX_SEATS = PLAYER_NAMES.length

/**
 * 사이드팟이 나오도록 심은 배역.
 * "올인 이벤트가 2번 나온다"는 사이드팟의 대리 지표일 뿐이라 확률에 맡기면 안 된다.
 * 누가 쏘고 누가 받는지를 좌석으로 확정해야 계약이 계약이 된다.
 */
type StackPlan = {
  stacks: number[]
  /** 프리플랍에 무조건 올인하는 숏스택 두 자리 */
  shoveSeats: number[]
  /** 두 올인을 모두 커버하며 반드시 콜하는 자리 */
  coverSeat: number | null
}

/** 배역이 없는 라운드(프리플랍 외)용 */
const NO_PLAN: StackPlan = { stacks: [], shoveSeats: [], coverSeat: null }

/** 서로 다른 좌석 k 개를 결정론적으로 고른다. */
function pickDistinctSeats(rng: Rng, count: number, k: number): number[] {
  const pool = Array.from({ length: count }, (_, i) => i)
  const out: number[] = []
  for (let i = 0; i < k; i++) out.push(...pool.splice(rng.int(pool.length), 1))
  return out
}

function pickStacks(rng: Rng, count: number, needAllin: boolean): StackPlan {
  const stacks: number[] = []
  for (let i = 0; i < count; i++) stacks.push(rng.pick(STACK_UNITS))
  if (!needAllin) return { stacks, shoveSeats: [], coverSeat: null }

  // 서로 다른 금액의 올인 두 개 + 둘 다 커버하는 한 명
  const [a, b, c] = pickDistinctSeats(rng, count, 3)
  stacks[a] = 8000
  stacks[b] = 12500
  stacks[c] = 47000
  return { stacks, shoveSeats: [a, b], coverSeat: c }
}

function liveCount(s: HandState): number {
  return s.seats.filter((x) => !x.folded).length
}

/** 폴드도 올인도 아닌 좌석 — 아직 액션할 수 있는 사람들 */
function actableSeats(s: HandState): number[] {
  return s.seats
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => !x.folded && !x.allIn)
    .map(({ i }) => i)
}

type BotContext = {
  rng: Rng
  bb: number
  currentBet: number
  lastRaiseSize: number
  isOpenBet: boolean
  canRaise: boolean
  plan: StackPlan
  street: Street
}

/** 봇 한 명의 액션 하나를 고른다. 반드시 그 시점에 합법인 액션만 만든다. */
function decideAction(s: HandState, seat: number, d: BotContext): HandEvent {
  const st = s.seats[seat]
  const allinTo = st.bet + st.stack
  const toCall = d.currentBet - st.bet
  const act = (action: PlayerAction): HandEvent => ({ type: 'player_action', seat, action })

  // 사이드팟 훈련용 배역은 확률에 맡기지 않는다
  if (d.street === 'preflop' && d.plan.shoveSeats.includes(seat)) return act({ kind: 'allin', to: allinTo })
  if (d.street === 'preflop' && d.plan.coverSeat === seat) {
    /*
     * 커버 좌석은 프리플랍에 절대 폴드하지 않고, 스택이 닿는 데까지 맞춘다.
     * 여기서 주사위를 굴리면 두 올인 중 위쪽이 미콜로 되돌아가(return_uncalled)
     * 두 사람의 투입액이 같아지고, 팟이 하나로 합쳐져 사이드팟이 사라진다.
     * 계약은 "올인이 두 번"이 아니라 "팟이 갈린다"이므로 확률에 맡길 수 없다.
     */
    if (toCall === 0) return act({ kind: 'check' })
    return toCall >= st.stack ? act({ kind: 'allin', to: allinTo }) : act({ kind: 'call', to: d.currentBet })
  }

  const roll = d.rng.next()

  // 콜조차 스택을 넘으면 선택지는 올인 콜 아니면 폴드다
  if (toCall >= st.stack) return roll < 0.5 ? act({ kind: 'allin', to: allinTo }) : act({ kind: 'fold' })

  const minTo = nlh.minRaiseTo({
    currentBet: d.currentBet,
    lastRaiseSize: d.lastRaiseSize,
    bigBlind: d.bb,
    seatBet: st.bet,
    seatStack: st.stack,
    isOpenBet: d.isOpenBet,
    canRaise: d.canRaise,
  })
  const aggress = (): HandEvent =>
    minTo >= allinTo
      ? act({ kind: 'allin', to: allinTo })
      : act({ kind: d.currentBet === 0 ? 'bet' : 'raise', to: minTo })

  if (toCall === 0) {
    if (!d.canRaise || roll < 0.6) return act({ kind: 'check' })
    return aggress()
  }

  if (roll < 0.42) return act({ kind: 'fold' })
  if (!d.canRaise || roll < 0.86) return act({ kind: 'call', to: d.currentBet })
  return aggress()
}

/**
 * 베팅 라운드 하나를 끝까지 돌린다.
 *
 * 한 좌석에 한 번씩만 기회를 주고 뒤에서 정산하는 방식은 쓰지 않는다.
 * 그러면 레이즈에 대한 재레이즈가 구조적으로 불가능해져서, 파일럿 케이스 4
 * (A 오픈 -> B 레이즈 -> C 리레이즈 -> D) 같은 상황이 영원히 생성되지 않는다.
 * 최소 레이즈 훈련이 이 제품의 존재 이유 중 하나인데 그 장면을 못 만들면 곤란하다.
 *
 * 종료 조건: 생존자가 1명이 되거나, 액션 가능한 좌석이 전부 한 번 이상 액션했고
 * 그들의 벳이 전부 현재 벳과 같아질 때.
 */
function runBettingRound(
  state: HandState,
  rng: Rng,
  bb: number,
  street: Street,
  plan: StackPlan,
): { events: HandEvent[]; state: HandState } {
  const n = state.seats.length
  const events: HandEvent[] = []
  let s = state

  let currentBet = Math.max(...s.seats.map((x) => x.bet))
  // 프리플랍은 빅블라인드가 오픈 벳 역할을 하므로 레이즈 폭의 출발점이 bb 다.
  let lastRaiseSize = street === 'preflop' ? bb : 0
  let isOpenBet = currentBet === 0

  const acted = new Set<number>()
  /** 마지막 "풀 레이즈" 이후 이미 액션한 좌석. 이들에게는 레이즈 권리가 없다. */
  let actedSinceFullRaise = new Set<number>()

  let seat = street === 'preflop' ? (s.buttonSeat + 3) % n : (s.buttonSeat + 1) % n

  const roundDone = () =>
    liveCount(s) <= 1 ||
    actableSeats(s).every((i) => acted.has(i) && s.seats[i].bet === currentBet)

  for (let guard = 0; ; guard++) {
    // 조용히 빠져나가면 미매칭 벳이 남은 불법 핸드가 만들어진다. 크게 터뜨린다.
    if (guard > n * 12) throw new Error(`베팅 라운드가 끝나지 않음 (street=${street})`)
    if (roundDone()) break

    const st = s.seats[seat]
    if (st.folded || st.allIn || (acted.has(seat) && st.bet === currentBet)) {
      seat = (seat + 1) % n
      continue
    }

    const e = decideAction(s, seat, {
      rng, bb, currentBet, lastRaiseSize, isOpenBet, street, plan,
      canRaise: !actedSinceFullRaise.has(seat),
    })
    events.push(e)
    s = applyEvent(s, e)
    acted.add(seat)
    actedSinceFullRaise.add(seat)

    const newBet = s.seats[seat].bet
    if (newBet > currentBet) {
      const raiseSize = newBet - currentBet
      currentBet = newBet
      isOpenBet = false
      /*
       * 풀 레이즈만 베팅을 다시 연다.
       * 풀 레이즈에 못 미치는 올인은 lastRaiseSize 를 갱신하지도 않는다 —
       * 갱신해버리면 그 뒤 사람의 최소 레이즈가 규정보다 작아진다.
       */
      if (raiseSize >= Math.max(lastRaiseSize, bb)) {
        lastRaiseSize = raiseSize
        actedSinceFullRaise = new Set([seat])
      }
    }

    seat = (seat + 1) % n
  }

  // 아무도 맞추지 않은 초과분은 팟에 넣지 않고 벳한 사람에게 되돌려준다.
  const bets = s.seats.map((x) => x.bet)
  const desc = [...bets].sort((a, b) => b - a)
  const excess = desc[0] - (desc[1] ?? 0)
  if (excess > 0) {
    const e: HandEvent = { type: 'return_uncalled', seat: bets.indexOf(desc[0]), amount: excess }
    events.push(e)
    s = applyEvent(s, e)
  }

  return { events, state: s }
}

export function generateHand(opts: GenerateOptions): Hand {
  const rng = createRng(opts.seed)
  const seatCount = opts.seatCount ?? 6
  const rulesetId = opts.rulesetId ?? 'nlh'
  const needAllin = (opts.require ?? []).includes('calculation')

  /*
   * 헤즈업은 블라인드 규칙이 다르다 — 2인 테이블에서는 버튼이 스몰블라인드이고
   * 프리플랍 액션도 버튼부터 시작한다. 아래의 SB=버튼+1 / UTG=버튼+3 은
   * 3인 이상에서만 성립하므로, 2인은 조용히 틀린 핸드를 만드는 대신 막는다.
   * (V1 범위는 6-max 이고 헤즈업은 별도 구현 대상이다.)
   */
  if (seatCount < MIN_SEATS || seatCount > MAX_SEATS) {
    throw new Error(`좌석 수는 ${MIN_SEATS}~${MAX_SEATS} 만 지원합니다: ${seatCount}`)
  }

  const plan = pickStacks(rng, seatCount, needAllin)
  const seats: SeatInit[] = plan.stacks.map((stack, i) => ({ name: PLAYER_NAMES[i], stack }))
  const buttonSeat = rng.int(seatCount)
  const blinds = { sb: 100, bb: 200 }

  const deck = shuffle(makeDeck(), rng)
  let deckIndex = 0
  const draw = (): Card => deck[deckIndex++]

  const events: HandEvent[] = []
  let state = initialState(seats, buttonSeat)

  events.push({ type: 'move_button', toSeat: buttonSeat })
  state = applyEvent(state, events[events.length - 1])

  const sbSeat = (buttonSeat + 1) % seatCount
  const bbSeat = (buttonSeat + 2) % seatCount

  for (const [seat, amount, kind] of [
    [sbSeat, blinds.sb, 'sb'],
    [bbSeat, blinds.bb, 'bb'],
  ] as const) {
    const e: HandEvent = { type: 'post_blind', seat, amount, kind }
    events.push(e)
    state = applyEvent(state, e)
  }

  // 홀카드: SB 부터 시계방향, 한 장씩 두 바퀴
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < seatCount; i++) {
      const seat = (sbSeat + i) % seatCount
      const e: HandEvent = { type: 'deal_hole', seat, card: draw() }
      events.push(e)
      state = applyEvent(state, e)
    }
  }

  const streets: Street[] = ['preflop', 'flop', 'turn', 'river']

  for (const street of streets) {
    // 생존자 확인이 먼저다. 딜을 먼저 하면 전원 폴드로 끝난 핸드에도
    // 플랍이 깔린다 — 딜러 훈련 제품이 그 장면을 정상 절차로 보여주게 된다.
    if (liveCount(state) <= 1) break

    if (street !== 'preflop') {
      const burn: HandEvent = { type: 'burn' }
      events.push(burn)
      state = applyEvent(state, burn)
      draw() // 번카드 소모

      const count = street === 'flop' ? 3 : 1
      const cards = Array.from({ length: count }, draw)
      const e: HandEvent = { type: 'deal_board', street, cards }
      events.push(e)
      state = applyEvent(state, e)
    }

    const canAct = actableSeats(state).length
    if (canAct >= 2) {
      const r = runBettingRound(state, rng, blinds.bb, street, street === 'preflop' ? plan : NO_PLAN)
      events.push(...r.events)
      state = r.state
    }

    const collect: HandEvent = { type: 'collect_bets' }
    events.push(collect)
    state = applyEvent(state, collect)
  }

  // 쇼다운 공개. 폴드로 끝난 핸드의 승자는 카드를 보여주지 않고 머크한다 —
  // 여기서 공개하면 딜러가 절대 하면 안 되는 동작을 가르치게 된다.
  if (liveCount(state) >= 2) {
    state.seats.forEach((s, seat) => {
      if (!s.folded) {
        const e: HandEvent = { type: 'showdown_reveal', seat }
        events.push(e)
        state = applyEvent(state, e)
      }
    })
  }

  // 팟 지급까지 해야 핸드가 끝난다. 여기까지 와야 최종 상태의 pot 이 0 이 되고,
  // 칩 보존 테스트가 "팟에 남아 있는 칩"으로 눈감아 주지 않는다.
  const pots = buildPots(state.contributed, state.seats.map((s) => s.folded))
  const awards = awardPots(pots, state.seats.map((s) => s.hole), state.board, buttonSeat)
  for (const a of awards) {
    const e: HandEvent = { type: 'award_pot', potIndex: a.potIndex, seat: a.seat, amount: a.amount }
    events.push(e)
    state = applyEvent(state, e)
  }

  return { seed: opts.seed, rulesetId, seats, buttonSeat, blinds, events }
}
