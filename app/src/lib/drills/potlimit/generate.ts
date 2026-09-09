/**
 * 팟리밋 계산 문제를 만든다.
 *
 * **정답은 룰셋이 낸다.** 여기서 산식을 다시 쓰면 규칙이 두 곳에 살고, 두 곳은 갈라진다.
 * 이 파일이 하는 일은 「그럴듯한 판을 차리는 것」까지다.
 *
 * **판은 액션 순서대로 차린다.** 좌석과 벳을 따로 뽑으면 아직 차례가 오지 않은 사람이
 * 벳을 한 그림이 나오고, 훈련생은 자기가 무엇을 잘못 읽었는지 알 수 없다. 그래서
 * 버튼 → 스트릿 → 액션 순서 → 히어로 순으로 세우고, 히어로는 **지금 차례인 좌석**이다.
 *
 * 금액은 `action-rush/money.ts` 를 재사용한다 — 그 블라인드 레벨에 실제로 있을 법한
 * 값이라야 훈련생이 보는 그림이 현실과 같다.
 */
import { createRng, makeDeck, pl, shuffle, type Card, type Rng } from '@/lib/simulator'
import type { GameSpec } from '@/lib/games'
import { BLINDS, fmt, roundUnit, unitFor } from '@/lib/action-rush/money'
import {
  POTLIMIT_BOARD_COUNT, POTLIMIT_KIND_LABEL, POTLIMIT_LIMIT_SEC, POTLIMIT_SEAT_COUNT,
  type PotLimitKind, type PotLimitQuestion, type PotLimitSeat, type PotLimitStreet,
} from './types'

const NAMES = ['1번', '2번', '3번', '4번']
const N = POTLIMIT_SEAT_COUNT
const won = fmt

/** 포스트플랍 스트릿. 프리플랍은 따로 다룬다 — 블라인드가 놓이고 팟벳이 성립하지 않는다 */
const POSTFLOP: readonly PotLimitStreet[] = ['플랍', '턴', '리버']

/**
 * 한 문제당 재시도 상한. 액션 순서대로 세우다 보면 성립하지 않는 판이 나온다
 * (앞사람이 다 폴드해서 히어로에게 차례가 오지 않는 판 등). 액션 러시와 같은 손이다.
 */
const ATTEMPTS = 60
const SEED_BUMPS = 5

/** 유형 배분. 팟까지 레이즈가 더 어렵고 더 자주 틀리므로 비중을 둔다 */
function kindTargets(rng: Rng): PotLimitKind[] {
  const targets: PotLimitKind[] = [
    'potbet', 'potbet', 'potbet', 'potbet',
    'potraise', 'potraise', 'potraise', 'potraise', 'potraise', 'potraise',
  ]
  for (let i = targets.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = targets[i]
    targets[i] = targets[j]
    targets[j] = tmp
  }
  return targets
}

/** `start` 좌석부터 시계 방향 한 바퀴. 액션 순서는 전부 이 함수에서 나온다 */
function orderFrom(start: number): number[] {
  return Array.from({ length: N }, (_, i) => (start + i) % N)
}

/** 원본을 건드리지 않는 Fisher-Yates. */
function shuffledSeats(items: readonly number[], rng: Rng): number[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/** 차려진 판. 여기까지가 「상황」이고, 정답은 이 다음에 룰셋이 낸다 */
type Board = {
  street: PotLimitStreet
  sb: number
  bb: number
  board: Card[]
  buttonSeat: number
  seats: PotLimitSeat[]
  collected: number
  currentBet: number
  heroSeat: number
}

const blankSeats = (): PotLimitSeat[] =>
  NAMES.slice(0, N).map((name) => ({ name, bet: 0, folded: false, act: '' }))

/**
 * 프리플랍 판. **블라인드를 실제로 좌석 앞에 놓는다** — 가운데로 수거된 팟은 아직 없다.
 *
 * 앞에 늘 빅블라인드가 있으므로 프리플랍에 팟벳은 없다. 이 판은 `potraise` 전용이다.
 */
function buildPreflop(rng: Rng): Board | null {
  const bb = rng.pick(BLINDS)
  const sb = bb / 2
  const unit = unitFor(bb)
  const buttonSeat = rng.int(N)
  const sbSeat = (buttonSeat + 1) % N
  const bbSeat = (buttonSeat + 2) % N

  // 라벨을 붙이지 않는다 — 좌석에 이미 SB·BB 포지션 배지가 있고 칩도 앞에 놓인다.
  // 포스트는 액션이 아니라 강제다. 이 좌석들이 실제로 말하는 것은 차례가 왔을 때다
  const seats = blankSeats()
  seats[sbSeat] = { ...seats[sbSeat], bet: sb }
  seats[bbSeat] = { ...seats[bbSeat], bet: bb }

  // 프리플랍 액션은 빅블라인드 **다음** 좌석부터다 — 4인이면 UTG · BTN · SB · BB
  const order = orderFrom((buttonSeat + 3) % N)
  const heroPos = rng.int(N)
  const heroSeat = order[heroPos]

  let currentBet: number = bb
  let raised = false
  for (const s of order.slice(0, heroPos)) {
    const roll = rng.int(100)
    if (!raised && roll < 30) {
      const to = roundUnit(bb * (2.5 + rng.int(3) * 0.5), unit)
      if (to > currentBet) {
        seats[s] = { ...seats[s], bet: to, act: `레이즈 ${won(to)}` }
        currentBet = to
        raised = true
        continue
      }
    }
    if (roll < 65) {
      // 콜한 차액만 라벨에 적는다 — 블라인드를 이미 놓은 좌석은 그만큼 덜 낸다
      seats[s] = { ...seats[s], act: `콜 ${won(currentBet - seats[s].bet)}`, bet: currentBet }
    } else {
      // 폴드해도 블라인드는 팟에 남는다. 칩이 앞에 그대로 있는 이유다
      seats[s] = { ...seats[s], folded: true, act: '폴드' }
    }
  }

  // 히어로 말고 아직 살아 있는 사람이 있어야 판이 성립한다
  if (seats.filter((s, i) => i !== heroSeat && !s.folded).length === 0) return null

  return {
    street: '프리플랍', sb, bb, board: [], buttonSeat,
    seats, collected: 0, currentBet, heroSeat,
  }
}

/**
 * 포스트플랍 판. 가운데 팟은 **앞선 스트릿에서 온 돈**이고, 앞에 놓인 칩은 이번 스트릿 것이다.
 *
 * 보드를 실제로 깐다. 스트릿을 정해 놓고 보드를 비워 두면 훈련생은 프리플랍으로 읽는다.
 */
function buildPostflop(rng: Rng, kind: PotLimitKind): Board | null {
  const bb = rng.pick(BLINDS)
  const sb = bb / 2
  const unit = unitFor(bb)
  const buttonSeat = rng.int(N)
  const sbSeat = (buttonSeat + 1) % N
  const bbSeat = (buttonSeat + 2) % N
  const street = rng.pick(POSTFLOP)

  const seats = blankSeats()
  // 포스트플랍 액션은 스몰블라인드부터다 — 버튼이 마지막이다
  const order = orderFrom(sbSeat)

  // 이번 스트릿에 살아 있는 사람 수. 나머지는 앞선 스트릿에 폴드했다
  const activeCount = 2 + rng.int(N - 1)
  const folded = new Set(shuffledSeats(order, rng).slice(0, N - activeCount))
  for (const s of folded) {
    seats[s] = { ...seats[s], folded: true, act: '폴드' }
  }
  const liveOrder = order.filter((s) => !folded.has(s))

  // 가운데 팟 — 살아 있는 사람들이 프리플랍에 똑같이 넣은 돈 + 죽은 블라인드
  const perPreflop = roundUnit(bb * rng.pick([1, 2, 3.5, 3.5, 7]), unit)
  let collected = perPreflop * liveOrder.length
  if (folded.has(sbSeat)) collected += sb
  if (folded.has(bbSeat) && perPreflop > bb) collected += bb
  // 턴·리버면 그 사이 스트릿의 베팅도 이미 팟에 들어와 있다
  const extraRounds = street === '턴' ? 1 : street === '리버' ? 2 : 0
  for (let r = 0; r < extraRounds; r++) {
    collected += roundUnit(collected * (0.4 + rng.int(3) * 0.2), unit) * liveOrder.length
  }

  let currentBet = 0
  let heroPos: number
  if (kind === 'potbet') {
    // 아무도 벳하지 않은 자리. 히어로 앞 사람들은 전부 체크했다
    heroPos = rng.int(liveOrder.length)
    for (const s of liveOrder.slice(0, heroPos)) {
      seats[s] = { ...seats[s], act: '체크' }
    }
  } else {
    // 앞에 벳이 있어야 레이즈다 — 히어로가 첫 번째로 말할 수는 없다
    if (liveOrder.length < 2) return null
    heroPos = 1 + rng.int(liveOrder.length - 1)
    const bettorPos = rng.int(heroPos)
    for (const s of liveOrder.slice(0, bettorPos)) {
      seats[s] = { ...seats[s], act: '체크' }
    }
    const bettor = liveOrder[bettorPos]
    // 최소 벳은 빅블라인드다. 작은 팟에 0.33 을 곱하면 그 아래로 내려간다 —
    // 규정상 불가능한 벳이 화면에 놓이면 문제 자체가 틀린 것을 가르친다
    currentBet = Math.max(bb, roundUnit(collected * rng.pick([0.33, 0.5, 0.66, 1]), unit))
    seats[bettor] = { ...seats[bettor], bet: currentBet, act: `벳 ${won(currentBet)}` }
    // 벳한 사람과 히어로 사이는 콜 아니면 폴드다. 콜한 칩도 팟에 들어가 있다
    for (const s of liveOrder.slice(bettorPos + 1, heroPos)) {
      seats[s] =
        rng.int(2) === 0
          ? { ...seats[s], bet: currentBet, act: `콜 ${won(currentBet)}` }
          : { ...seats[s], folded: true, act: '폴드' }
    }
  }

  const heroSeat = liveOrder[heroPos]
  const board = shuffle(makeDeck(), rng).slice(0, POTLIMIT_BOARD_COUNT[street])

  return { street, sb, bb, board, buttonSeat, seats, collected, currentBet, heroSeat }
}

function makeOne(rng: Rng, kind: PotLimitKind): PotLimitQuestion | null {
  // 프리플랍에는 팟벳이 없다 — 앞에 늘 빅블라인드가 놓여 있기 때문이다
  const preflop = kind === 'potraise' && rng.int(100) < 40
  const built = preflop ? buildPreflop(rng) : buildPostflop(rng, kind)
  if (built === null) return null

  const { seats, collected, currentBet, heroSeat } = built
  const heroBet = seats[heroSeat].bet
  const onTable = collected + seats.reduce((sum, s) => sum + s.bet, 0)
  const answer = pl.maxRaiseTo({
    currentBet,
    lastRaiseSize: 0,
    bigBlind: built.bb,
    seatBet: heroBet,
    seatStack: 100_000_000, // 스택 제약 없이 「규정이 정하는 최대」를 묻는다
    isOpenBet: currentBet === 0,
    hasActedThisRound: false,
    pot: onTable,
  })
  if (answer <= 0) return null

  // 히어로 라벨은 마지막에 덮어쓴다 — 블라인드를 놓았든 아니든 지금은 「차례」다
  const withHero = seats.map((s, i) => (i === heroSeat ? { ...s, act: '차례' } : s))
  const callAmt = currentBet - heroBet
  const potAfterCall = onTable + callAmt
  const alreadyIn = heroBet > 0 ? ` 이미 앞에 놓은 ${won(heroBet)}은 콜 금액에서 빠진다.` : ''
  const why =
    currentBet === 0
      ? `앞에 벳이 없으면 콜 금액이 0이라 팟벳은 팟 금액 그대로인 ${won(answer)}이다. ` +
        '공식은 같다 — 콜 0 + 콜한 뒤 팟.'
      : `콜 ${won(callAmt)}을 먼저 넣으면 팟이 ${won(onTable)} + ${won(callAmt)} = ` +
        `${won(potAfterCall)}이 된다. 그 팟만큼 더 올릴 수 있으니 총액은 ` +
        `${won(currentBet)} + ${won(potAfterCall)} = ${won(answer)}이다.${alreadyIn}`

  return {
    kind,
    limitSec: POTLIMIT_LIMIT_SEC[kind],
    label: POTLIMIT_KIND_LABEL[kind],
    prompt:
      kind === 'potbet'
        ? `${seats[heroSeat].name}이 팟벳을 하면 얼마입니까?`
        : `${seats[heroSeat].name}이 팟까지 레이즈하면 얼마를 냅니까?`,
    street: built.street,
    sb: built.sb,
    bb: built.bb,
    board: built.board,
    seats: withHero,
    buttonSeat: built.buttonSeat,
    collected,
    heroSeat,
    answer,
    why,
  }
}

/** 성립하는 판이 나올 때까지 다시 만든다. 상한이 없으면 그 루프가 화면 정지로 나타난다 */
function makeOneOrThrow(rng: Rng, kind: PotLimitKind, seed: string): PotLimitQuestion {
  for (let i = 0; i < ATTEMPTS; i++) {
    const q = makeOne(rng, kind)
    if (q !== null) return q
  }
  // 같은 난수열에서 60번 실패했으면 그 줄기가 나쁜 것이다. 다른 줄기로 옮긴다
  for (let bump = 1; bump <= SEED_BUMPS; bump++) {
    const alt = createRng(`${seed}#${kind}#${bump}`)
    for (let i = 0; i < ATTEMPTS; i++) {
      const q = makeOne(alt, kind)
      if (q !== null) return q
    }
  }
  throw new Error(`팟리밋 문제 생성 실패: ${kind}`)
}

export function generatePotLimitRun(spec: GameSpec, seed: string): PotLimitQuestion[] {
  // **코드값으로만 갈린다** — 표시 라벨을 읽지 않는다 (전역 제약 4)
  if (spec.betting !== 'PL') {
    throw new Error(`팟리밋 계산은 팟리밋 종목에만 있다: ${spec.betting}`)
  }
  const rng = createRng(seed)
  return kindTargets(rng).map((kind) => makeOneOrThrow(rng, kind, seed))
}
