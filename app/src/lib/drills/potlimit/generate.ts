/**
 * 팟리밋 계산 문제를 만든다.
 *
 * **정답은 룰셋이 낸다.** 여기서 산식을 다시 쓰면 규칙이 두 곳에 살고, 두 곳은 갈라진다.
 * 이 파일이 하는 일은 「그럴듯한 판을 차리는 것」까지다.
 *
 * **대본을 골라 액션 순서대로 연기한다** (`patterns.ts`). 좌석과 벳을 따로 뽑으면
 * 아직 차례가 오지 않은 사람이 벳을 한 그림이 나오고, 훈련생은 자기가 무엇을 잘못
 * 읽었는지 알 수 없다. 히어로는 대본이 끝나는 자리 — **지금 차례인 좌석**이다.
 *
 * 금액은 `action-rush/money.ts` 를 재사용한다 — 그 블라인드 레벨에 실제로 있을 법한
 * 값이라야 훈련생이 보는 그림이 현실과 같다.
 */
import { createRng, makeDeck, pl, shuffle, type Card, type Rng } from '@/lib/simulator'
import type { GameSpec } from '@/lib/games'
import { BLINDS, fmt, roundUnit, unitFor } from '@/lib/action-rush/money'
import {
  POSTFLOP_BET_PATTERNS, POSTFLOP_RAISE_PATTERNS, PREFLOP_PATTERNS,
  type PotLimitAct, type PotLimitPattern,
} from './patterns'
import {
  POTLIMIT_BOARD_COUNT, POTLIMIT_KIND_LABEL, POTLIMIT_LIMIT_SEC, POTLIMIT_MAX_SEATS,
  POTLIMIT_MIN_SEATS, POTLIMIT_POSTFLOP_BET_COUNT, POTLIMIT_POSTFLOP_RAISE_COUNT,
  POTLIMIT_PREFLOP_COUNT, type PotLimitQuestion, type PotLimitSeat, type PotLimitStreet,
} from './types'

const NAMES = ['1번', '2번', '3번', '4번', '5번', '6번']
const won = fmt

/** 포스트플랍 스트릿. 프리플랍은 블라인드가 놓이고 팟벳이 성립하지 않아 따로 다룬다 */
const POSTFLOP: readonly PotLimitStreet[] = ['플랍', '턴', '리버']

/**
 * 한 문제당 재시도 상한. 대본대로 세우다 보면 성립하지 않는 판이 나온다 (짧은 올인이
 * 칩 단위로 안 떨어지는 판 등). 액션 러시와 같은 손이다.
 */
const ATTEMPTS = 60
const SEED_BUMPS = 5

/** 원본을 건드리지 않는 Fisher-Yates. */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/** `start` 좌석부터 시계 방향 한 바퀴. 액션 순서는 전부 이 함수에서 나온다 */
function orderFrom(start: number, seatCount: number): number[] {
  return Array.from({ length: seatCount }, (_, i) => (start + i) % seatCount)
}

const blankSeats = (seatCount: number): PotLimitSeat[] =>
  NAMES.slice(0, seatCount).map((name) => ({
    name, bet: 0, folded: false, allIn: false, act: '',
  }))

/** 차려진 판. 여기까지가 「상황」이고, 정답은 이 다음에 룰셋이 낸다 */
type Table = {
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

/**
 * 대본 한 줄을 연기한다. **베팅 상태를 함께 굴린다** — 짧은 올인이 폭을 갱신하지
 * 않는다는 사실이 여기 한 곳에만 있어야 프리플랍·포스트플랍이 갈라지지 않는다.
 *
 * 성립하지 않으면 `null` — 부르는 쪽이 판을 버리고 다시 만든다.
 */
type Betting = { currentBet: number; lastRaise: number }

function act(
  action: PotLimitAct,
  seat: PotLimitSeat,
  betting: Betting,
  ctx: { rng: Rng; unit: number; bb: number; collected: number },
): { seat: PotLimitSeat; betting: Betting } | null {
  const { rng, unit, bb } = ctx
  const { currentBet, lastRaise } = betting

  switch (action) {
    case 'fold':
      // 이미 앞에 놓은 칩(블라인드·콜)은 팟에 남는다. 그래서 bet 을 지우지 않는다
      return { seat: { ...seat, folded: true, act: '폴드' }, betting }

    case 'check':
      return { seat: { ...seat, act: '체크' }, betting }

    case 'call':
      if (currentBet <= seat.bet) return null
      return {
        seat: { ...seat, bet: currentBet, act: `콜 ${won(currentBet - seat.bet)}` },
        betting,
      }

    case 'bet': {
      if (currentBet !== 0) return null
      // 최소 벳은 빅블라인드다. 작은 팟에 0.33 을 곱하면 그 아래로 내려간다 —
      // 규정상 불가능한 벳이 화면에 놓이면 문제 자체가 틀린 것을 가르친다
      const to = Math.max(bb, roundUnit(ctx.collected * rng.pick([0.33, 0.5, 0.66, 1]), unit))
      return {
        seat: { ...seat, bet: to, act: `벳 ${won(to)}` },
        betting: { currentBet: to, lastRaise: to },
      }
    }

    case 'raise': {
      if (currentBet === 0) return null
      const step = roundUnit(lastRaise * (1 + rng.int(3) * 0.5), unit)
      const to = currentBet + step
      return {
        seat: { ...seat, bet: to, act: `레이즈 ${won(to)}` },
        betting: { currentBet: to, lastRaise: step },
      }
    }

    case 'allin': {
      if (currentBet === 0) return null
      const step = roundUnit(lastRaise * (1.5 + rng.int(4) * 0.5), unit)
      const to = currentBet + step
      // 올인 좌석은 라벨을 비운다 — 빨간 「올인」 배지가 이미 그 말을 한다
      return {
        seat: { ...seat, bet: to, allIn: true, act: '' },
        betting: { currentBet: to, lastRaise: step },
      }
    }

    case 'allinUnder': {
      if (currentBet === 0) return null
      // 풀 레이즈에 **못 미치는** 올인. 콜 금액은 오르지만 폭은 그대로다 —
      // 이 한 줄이 이 유형의 전부이고, 팟 계산에서 가장 자주 틀리는 자리다
      const step = roundUnit(lastRaise / 2, ctx.unit)
      if (step >= lastRaise) return null // 칩 단위가 굵어 「언더」가 성립하지 않는 판
      return {
        seat: { ...seat, bet: currentBet + step, allIn: true, act: '' },
        betting: { currentBet: currentBet + step, lastRaise },
      }
    }
  }
}

/** 대본 길이에 맞는 좌석 수. 자리가 모자라면 콜이 셋 쌓일 수 없다 */
function seatCountFor(rng: Rng, need: number): number | null {
  const min = Math.max(POTLIMIT_MIN_SEATS, need)
  if (min > POTLIMIT_MAX_SEATS) return null
  return min + rng.int(POTLIMIT_MAX_SEATS - min + 1)
}

/**
 * 프리플랍 판. **블라인드를 실제로 좌석 앞에 놓는다** — 가운데로 수거된 팟은 아직 없다.
 *
 * 라벨을 붙이지 않는다 — 좌석에 이미 SB·BB 포지션 배지가 있고 칩도 앞에 놓인다.
 * 포스트는 액션이 아니라 강제다. 이 좌석들이 실제로 말하는 것은 차례가 왔을 때다.
 */
function buildPreflop(rng: Rng, pattern: PotLimitPattern): Table | null {
  const seatCount = seatCountFor(rng, pattern.before.length + 1)
  if (seatCount === null) return null

  const bb = rng.pick(BLINDS)
  const sb = bb / 2
  const unit = unitFor(bb)
  const buttonSeat = rng.int(seatCount)
  const sbSeat = (buttonSeat + 1) % seatCount
  const bbSeat = (buttonSeat + 2) % seatCount

  const seats = blankSeats(seatCount)
  seats[sbSeat] = { ...seats[sbSeat], bet: sb }
  seats[bbSeat] = { ...seats[bbSeat], bet: bb }

  // 프리플랍 액션은 빅블라인드 **다음** 좌석부터다
  const order = orderFrom((buttonSeat + 3) % seatCount, seatCount)
  const heroSeat = order[pattern.before.length]

  let betting: Betting = { currentBet: bb, lastRaise: bb }
  for (const [i, action] of pattern.before.entries()) {
    const s = order[i]
    const done = act(action, seats[s], betting, { rng, unit, bb, collected: 0 })
    if (done === null) return null
    seats[s] = done.seat
    betting = done.betting
  }

  // 히어로 말고 아직 살아 있는 사람이 있어야 판이 성립한다
  if (seats.filter((s, i) => i !== heroSeat && !s.folded).length === 0) return null

  return {
    street: '프리플랍', sb, bb, board: [], buttonSeat, seats,
    collected: 0, currentBet: betting.currentBet, heroSeat,
  }
}

/**
 * 포스트플랍 판. 가운데 팟은 **앞선 스트릿에서 온 돈**이고, 앞에 놓인 칩은 이번 스트릿 것이다.
 *
 * 보드를 실제로 깐다. 스트릿을 정해 놓고 보드를 비워 두면 훈련생은 프리플랍으로 읽는다.
 */
function buildPostflop(rng: Rng, pattern: PotLimitPattern): Table | null {
  // 이번 스트릿에 살아 있는 사람 = 대본에 나오는 사람 + 히어로 (+ 뒤에 남은 한 명)
  const liveCount = pattern.before.length + 1 + rng.int(2)
  const seatCount = seatCountFor(rng, liveCount)
  if (seatCount === null) return null

  const bb = rng.pick(BLINDS)
  const sb = bb / 2
  const unit = unitFor(bb)
  const buttonSeat = rng.int(seatCount)
  const sbSeat = (buttonSeat + 1) % seatCount
  const bbSeat = (buttonSeat + 2) % seatCount
  const street = rng.pick(POSTFLOP)

  const seats = blankSeats(seatCount)
  // 포스트플랍 액션은 스몰블라인드부터다 — 버튼이 마지막이다
  const order = orderFrom(sbSeat, seatCount)

  // 나머지는 앞선 스트릿에 폴드했다. 그 사실도 화면에 남는다
  const folded = new Set(shuffled(order, rng).slice(0, seatCount - liveCount))
  for (const s of folded) {
    seats[s] = { ...seats[s], folded: true, act: '폴드' }
  }
  const liveOrder = order.filter((s) => !folded.has(s))
  if (liveOrder.length <= pattern.before.length) return null

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

  let betting: Betting = { currentBet: 0, lastRaise: 0 }
  for (const [i, action] of pattern.before.entries()) {
    const s = liveOrder[i]
    const done = act(action, seats[s], betting, { rng, unit, bb, collected })
    if (done === null) return null
    seats[s] = done.seat
    betting = done.betting
  }

  const heroSeat = liveOrder[pattern.before.length]
  if (seats.filter((s, i) => i !== heroSeat && !s.folded).length === 0) return null

  const board = shuffle(makeDeck(), rng).slice(0, POTLIMIT_BOARD_COUNT[street])
  return {
    street, sb, bb, board, buttonSeat, seats,
    collected, currentBet: betting.currentBet, heroSeat,
  }
}

/**
 * 해설. **딜러가 실제로 세는 순서 그대로 적는다** — 콜을 먼저 놓고, 지금 나와 있는
 * 베팅을 전부 세고, 이전에 가운데 있던 팟을 더한다. 그게 더 올릴 수 있는 폭이고,
 * 총액은 거기에 앞사람의 최고 벳을 더한 값이다.
 */
function explain(t: {
  currentBet: number
  heroBet: number
  bets: number
  collected: number
  answer: number
}): string {
  const { currentBet, heroBet, bets, collected, answer } = t
  if (currentBet === 0) {
    return (
      `앞에 벳이 없으니 콜은 0이다. 나와 있는 베팅도 0이니 이전 팟 ${won(collected)} ` +
      `그대로가 팟벳 ${won(answer)}이다.`
    )
  }
  const call = currentBet - heroBet
  const betsAfterCall = bets + call
  const width = betsAfterCall + collected
  const potLine =
    collected === 0
      ? `앞에 나온 베팅이 다 합쳐 ${won(betsAfterCall)}이 된다 (이전 팟은 없다)`
      : `앞에 나온 베팅이 다 합쳐 ${won(betsAfterCall)}이 되고, 여기에 이전 팟 ` +
        `${won(collected)}을 더해 ${won(width)}이다`
  return (
    `콜 ${won(call)}을 먼저 놓는다. 그러면 ${potLine} — 이만큼 더 올릴 수 있다. ` +
    `총액은 최고 벳 ${won(currentBet)} + ${won(width)} = ${won(answer)}이다.`
  )
}

function makeOne(rng: Rng, pattern: PotLimitPattern): PotLimitQuestion | null {
  const built = pattern.street === 'pre' ? buildPreflop(rng, pattern) : buildPostflop(rng, pattern)
  if (built === null) return null

  const { seats, collected, currentBet, heroSeat } = built
  const heroBet = seats[heroSeat].bet
  const bets = seats.reduce((sum, s) => sum + s.bet, 0)
  const answer = pl.maxRaiseTo({
    currentBet,
    lastRaiseSize: 0,
    bigBlind: built.bb,
    seatBet: heroBet,
    seatStack: 100_000_000, // 스택 제약 없이 「규정이 정하는 최대」를 묻는다
    isOpenBet: currentBet === 0,
    hasActedThisRound: false,
    pot: collected + bets,
  })
  if (answer <= 0) return null

  // 히어로 라벨은 마지막에 덮어쓴다 — 블라인드를 놓았든 아니든 지금은 「차례」다
  const withHero = seats.map((s, i) => (i === heroSeat ? { ...s, act: '차례' } : s))

  return {
    kind: pattern.kind,
    limitSec: POTLIMIT_LIMIT_SEC[pattern.kind],
    label: POTLIMIT_KIND_LABEL[pattern.kind],
    prompt:
      pattern.kind === 'potbet'
        ? `${seats[heroSeat].name}이 팟벳을 하면 얼마입니까?`
        : `${seats[heroSeat].name}이 팟까지 레이즈하면 얼마를 냅니까?`,
    patternId: pattern.id,
    patternLabel: pattern.label,
    street: built.street,
    sb: built.sb,
    bb: built.bb,
    board: built.board,
    seats: withHero,
    buttonSeat: built.buttonSeat,
    collected,
    heroSeat,
    answer,
    why: explain({ currentBet, heroBet, bets, collected, answer }),
  }
}

/** 성립하는 판이 나올 때까지 다시 만든다. 상한이 없으면 그 루프가 화면 정지로 나타난다 */
function makeOneOrThrow(rng: Rng, pattern: PotLimitPattern, seed: string): PotLimitQuestion {
  for (let i = 0; i < ATTEMPTS; i++) {
    const q = makeOne(rng, pattern)
    if (q !== null) return q
  }
  // 같은 난수열에서 60번 실패했으면 그 줄기가 나쁜 것이다. 다른 줄기로 옮긴다
  for (let bump = 1; bump <= SEED_BUMPS; bump++) {
    const alt = createRng(`${seed}#${pattern.id}#${bump}`)
    for (let i = 0; i < ATTEMPTS; i++) {
      const q = makeOne(alt, pattern)
      if (q !== null) return q
    }
  }
  throw new Error(`팟리밋 문제 생성 실패: ${pattern.id}`)
}

/** 서로 다른 대본을 `count` 개 뽑는다. 목록보다 많이 달라면 다시 채워 쓴다 */
function pickPatterns(
  rng: Rng,
  pool: readonly PotLimitPattern[],
  count: number,
): PotLimitPattern[] {
  const out: PotLimitPattern[] = []
  while (out.length < count) {
    out.push(...shuffled(pool, rng).slice(0, count - out.length))
  }
  return out
}

export function generatePotLimitRun(spec: GameSpec, seed: string): PotLimitQuestion[] {
  // **코드값으로만 갈린다** — 표시 라벨을 읽지 않는다 (전역 제약 4)
  if (spec.betting !== 'PL') {
    throw new Error(`팟리밋 계산은 팟리밋 종목에만 있다: ${spec.betting}`)
  }
  const rng = createRng(seed)
  const plan = shuffled(
    [
      ...pickPatterns(rng, PREFLOP_PATTERNS, POTLIMIT_PREFLOP_COUNT),
      ...pickPatterns(rng, POSTFLOP_BET_PATTERNS, POTLIMIT_POSTFLOP_BET_COUNT),
      ...pickPatterns(rng, POSTFLOP_RAISE_PATTERNS, POTLIMIT_POSTFLOP_RAISE_COUNT),
    ],
    rng,
  )
  return plan.map((pattern) => makeOneOrThrow(rng, pattern, seed))
}
