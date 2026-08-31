/**
 * 결정론적 핸드 생성기.
 *
 * 시드 하나에서 완결된 노리밋 홀덤 핸드 하나를 만든다. 무작위성은 전부
 * createRng(seed) 하나를 통과한다 — Math.random() 이 한 번이라도 섞이면
 * 같은 시드가 다른 핸드를 만들어 재현이 불가능한 버그가 된다.
 */
import { makeDeck, shuffle, type Card } from './cards'
import { createRng, type Rng } from './rng'
import { decideAction, pickStacks, type StackPlan } from './bots'
import { initialState, applyEvent, isFullRaise } from './reduce'
import { awardPots, buildPots } from './pots'
import type { RulesetId } from './rulesets/types'
import type { HandEvent, HandState, SeatInit, Street } from './types'

export type Difficulty = 'basic' | 'intermediate' | 'advanced'
export type DecisionKind = 'procedure' | 'action_validity' | 'calculation' | 'showdown'

export type GenerateOptions = {
  seed: string
  rulesetId?: RulesetId
  seatCount?: number
  /**
   * 현재 생성에 영향을 주지 않는다 — 난이도 설계는 이 계획 밖이다.
   * 'basic' 과 'advanced' 가 무엇을 달리해야 하는지(봇 공격성·스택 편차·판단
   * 지점 개수·규칙 난이도)가 정의된 적이 없어, 지금 구현하면 난이도 설계를
   * 지어내는 것이 된다. require 와 달리 보장할 대상이 아직 없다.
   */
  difficulty?: Difficulty
  /**
   * 이 종류의 판단 지점이 나오도록 핸드를 만든다.
   *
   * 'calculation'·'showdown'·'procedure' 는 보장한다. **'action_validity' 는
   * 최선 노력이다** — 상당수의 핸드에서 나오지 않는다. 근거는 generateHand 안의
   * 주석에 있다. 호출부가 이 축을 반드시 물어야 한다면 나온 판단 지점을 확인하고
   * 안 나왔을 때의 처리를 스스로 정해야 한다.
   */
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

export const MIN_SEATS = 3
export const MAX_SEATS = PLAYER_NAMES.length

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
export type BettingRoundResult = {
  events: HandEvent[]
  state: HandState
  lastAggressor: number | null
  /**
   * decideAction 을 부를 때마다 그 시점의 isOpenBet — player_action 이벤트와 1:1 이다.
   *
   * 이벤트가 아니라 관측용 부산물이다. 핸드 출력(Hand)에는 들어가지 않고
   * generateHand 는 이 값을 읽지 않으므로 생성 결과는 이 필드가 없을 때와 같다.
   * 밖으로 내보내는 유일한 이유는 회귀 테스트가 이 플래그를 **라운드가 실제로
   * 만들어내는 대로** 봐야 하기 때문이다 — 순수 헬퍼로 뽑아 단위 테스트하면
   * 값의 반전은 잡아도 호출 지점의 문장 순서(currentBet 갱신 앞/뒤)는 못 잡는다.
   */
  openBetTrajectory: boolean[]
}

export function runBettingRound(
  state: HandState,
  rng: Rng,
  bb: number,
  street: Street,
  plan: StackPlan,
): BettingRoundResult {
  const n = state.seats.length
  const events: HandEvent[] = []
  let s = state
  /** 이 라운드에서 마지막으로 벳·레이즈한 좌석. 쇼다운 공개 순서의 기준이다. */
  let lastAggressor: number | null = null

  let currentBet = Math.max(...s.seats.map((x) => x.bet))
  /*
   * 레이즈 폭은 상태가 들고 간다 (`HandState.lastRaiseSize`).
   * 여기서 따로 세면 정본이 둘로 갈라져, 화면이 묻는 "최소 레이즈"와
   * 생성기가 만든 핸드가 어긋난다.
   *
   * 상태가 주는 출발점이 옛 지역 변수와 같은지 확인해 둔다 — 프리플랍은
   * 빅블라인드 포스트가 bb 로 세워두고, 그 이후 스트릿은 deal_board 가 0 으로 지운다.
   */
  /*
   * "지금 마주한 벳이 이 라운드의 첫 벳인가" (Rule 51-B, rulesets/types.ts).
   * 마주한 쪽의 성질이지 "아직 벳이 없다"가 아니다 — 프리플랍은 빅블라인드가
   * 곧 오픈 벳이므로 참으로 시작하고, 플랍 이후는 마주한 벳이 없는 상태로
   * 시작해 첫 벳이 깔려도 그 벳이 오픈 벳이므로 참이 유지된다.
   */
  let isOpenBet = true
  const openBetTrajectory: boolean[] = []

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

    openBetTrajectory.push(isOpenBet)
    const e = decideAction(s, seat, {
      rng, bb, currentBet, lastRaiseSize: s.lastRaiseSize, isOpenBet, street, plan,
      canRaise: !actedSinceFullRaise.has(seat),
    })
    events.push(e)
    // 풀 레이즈 판정은 액션을 적용하기 **전** 상태를 기준으로 한다.
    const beforeAction = s
    s = applyEvent(s, e)
    acted.add(seat)
    actedSinceFullRaise.add(seat)

    const newBet = s.seats[seat].bet
    if (newBet > currentBet) {
      /*
       * 오픈 벳 자격을 없애는 것은 "벳이 있었다" 위에 얹힌 레이즈뿐이다.
       * 벳이 없던 자리에 깔린 첫 벳은 그 자신이 오픈 벳이므로 참을 유지한다.
       *
       * ⚠️ 반드시 currentBet 갱신 **앞**에서 판단한다. 아래 줄로 내려가면
       * currentBet 은 이미 새 값(항상 양수)이라 이 검사가 매번 참이 되어
       * 고쳐진 모습 그대로 늘 false 를 세운다 — 원래 버그가 되돌아온다.
       */
      if (currentBet > 0) isOpenBet = false
      currentBet = newBet
      // 풀 레이즈에 못 미치는 올인도 공격이다 — 리오픈 권리와 공개 순서는 다른 규칙이다.
      lastAggressor = seat
      /*
       * 풀 레이즈만 베팅을 다시 연다. 폭 갱신은 리듀서가 이미 했으므로
       * 여기서는 같은 판정을 빌려 레이즈 권리만 초기화한다.
       */
      if (isFullRaise(beforeAction, newBet)) {
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

  return { events, state: s, lastAggressor, openBetTrajectory }
}

export function generateHand(opts: GenerateOptions): Hand {
  const rng = createRng(opts.seed)
  const seatCount = opts.seatCount ?? 6
  const rulesetId = opts.rulesetId ?? 'nlh'
  const required = opts.require ?? []
  const needAllin = required.includes('calculation')
  /*
   * 배역을 심는 것은 'calculation'(서로 다른 금액의 올인)과 'showdown'(리버까지
   * 살아남는 둘 이상) 뿐이다. 나머지 둘은 심지 않는데, 그 결과가 서로 다르다.
   *
   * - 'procedure' 는 심지 않아도 보장된다. 딜링 판단 지점은 첫 홀카드에 붙고
   *   홀카드는 언제나 돌려지며, 좌석이 3~9 면 정답 좌석과 겹치지 않는 오답 좌석이
   *   언제나 둘 이상 남는다 (`decisions.ts:73-95`).
   * - 'action_validity' 는 **최선 노력이고 보장이 아니다**. require 는 "핸드에
   *   그런 이벤트가 있다"가 아니라 "그 종류의 판단 지점이 나온다"는 약속인데,
   *   이 판단 지점은 (a) 자발적인 bet/raise 가 있고(올인은 해당하지 않는다,
   *   `decisions.ts:132-135`) (b) 그 금액에서 정답과도 서로와도 겹치지 않는
   *   오답을 둘 만들 수 있을 때만 나온다 (`decisions.ts:176-183`). 둘 다 금액이
   *   정하는 조건이라 배역으로 심을 수 없고, (b) 를 느슨하게 하는 것은 같은
   *   숫자를 두 번 내놓는 문제로 되돌아가는 것이다. 그래서 상당수의 핸드에는
   *   이 종류가 아예 없다 — 그 downstream 결과(측정 안 된 축이 0 점으로 평균되어
   *   승급을 막는다)는 `score.ts` 의 등급 창 주석에 이미 적혀 있다.
   *
   * require 를 하드 보장으로 올리는 것은 2단계 설계 결정이다. 여기서 조용히
   * 통과시키는 대신 계약을 있는 그대로 적어 둔다.
   */
  const needShowdown = required.includes('showdown')

  /*
   * 헤즈업은 블라인드 규칙이 다르다 — 2인 테이블에서는 버튼이 스몰블라인드이고
   * 프리플랍 액션도 버튼부터 시작한다. 아래의 SB=버튼+1 / UTG=버튼+3 은
   * 3인 이상에서만 성립하므로, 2인은 조용히 틀린 핸드를 만드는 대신 막는다.
   * (V1 범위는 6-max 이고 헤즈업은 별도 구현 대상이다.)
   */
  if (seatCount < MIN_SEATS || seatCount > MAX_SEATS) {
    throw new Error(`좌석 수는 ${MIN_SEATS}~${MAX_SEATS} 만 지원합니다: ${seatCount}`)
  }

  const plan = pickStacks(rng, seatCount, needAllin, needShowdown)
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

  /*
   * 쇼다운 공개 순서. 좌석 인덱스 순으로 돌면 좌석 번호가 규칙인 것처럼 가르치게 된다 —
   * 실제 기준은 마지막 베팅 라운드의 마지막 공격자(벳·레이즈한 사람)이고, 그 라운드에
   * 벳이 없었으면 버튼 왼쪽 첫 생존자다. "누가 먼저 오픈하는가"는 딜러 시험 항목이라
   * 이벤트 열의 순서가 곧 정답이 된다. 베팅 라운드가 열리지 않은 스트리트(전원 올인)는
   * 이 값을 덮어쓰지 않는다 — 기준은 마지막 스트리트가 아니라 마지막 베팅 라운드다.
   */
  let showdownFirst: number | null = null
  let revealed = false
  const reveal = () => {
    if (revealed) return
    revealed = true
    const start = showdownFirst ?? (buttonSeat + 1) % seatCount
    for (let i = 0; i < seatCount; i++) {
      const seat = (start + i) % seatCount
      if (state.seats[seat].folded) continue
      const e: HandEvent = { type: 'showdown_reveal', seat }
      events.push(e)
      state = applyEvent(state, e)
    }
  }

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
      const r = runBettingRound(state, rng, blinds.bb, street, plan)
      events.push(...r.events)
      state = r.state
      showdownFirst = r.lastAggressor
    }

    const collect: HandEvent = { type: 'collect_bets' }
    events.push(collect)
    state = applyEvent(state, collect)

    // 액션이 끝났으면 카드를 먼저 올리고 남은 보드를 런아웃한다.
    // 리버까지 깔아놓고 공개하면 실제 절차와 순서가 뒤바뀐 채로 재생된다.
    if (actableSeats(state).length < 2 && liveCount(state) >= 2) reveal()
  }

  // 폴드로 끝난 핸드의 승자는 카드를 보여주지 않고 머크한다 —
  // 여기서 공개하면 딜러가 절대 하면 안 되는 동작을 가르치게 된다.
  if (liveCount(state) >= 2) reveal()

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
