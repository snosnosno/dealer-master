/**
 * 승자 판독 문제를 만든다.
 *
 * **먼저 만들고 그다음 보여준다.** 판을 하나 돌린 뒤 엔진에게 하이와 로우를 물어보고,
 * 그 답이 이번 문제의 목표에 맞으면 채택하고 아니면 다시 돌린다. 화면에 뜬 뒤에
 * 답이 바뀔 자리가 없다.
 *
 * 무작위는 `Rng` 로만 얻는다 — 여기서 `Math.random()` 을 쓰면 시드가 무의미해진다.
 */
import {
  bestOmahaHi, bestOmahaLow, compareHands, compareLow, createRng, makeDeck, shuffle,
  type Card, type HandRank, type LowRank, type Rng,
} from '@/lib/simulator'
import type { GameSpec } from '@/lib/games'
import {
  asksFor, LO_ABSENT_MIN, LO_PRESENT_MIN, WINNER_KIND_LABEL, WINNER_LIMIT_SEC,
  WINNER_QUESTION_COUNT, WINNER_SEAT_COUNT, type WinnerAsks, type WinnerQuestion, type WinnerSeat,
} from './types'

const NAMES = ['1번', '2번', '3번', '4번']
/** 조건이 잘못됐을 때 무한 루프 대신 명확한 실패로 드러나게 하는 상한 */
const MAX_TRIES = 400

type Deal = { seats: WinnerSeat[]; board: Card[]; his: HandRank[]; los: (LowRank | null)[] }

function dealOnce(spec: GameSpec, rng: Rng, asks: WinnerAsks): Deal {
  const deck = shuffle(makeDeck(), rng)
  const board = deck.slice(0, 5)
  const n = spec.holeCardCount
  const seats = NAMES.slice(0, WINNER_SEAT_COUNT).map((name, i) => ({
    name,
    hole: deck.slice(5 + i * n, 5 + (i + 1) * n),
  }))
  const qualifier = spec.eval.lo?.qualifier ?? null
  return {
    seats,
    board,
    his: seats.map((s) => bestOmahaHi(s.hole, board)),
    los: seats.map((s) =>
      asks.lo && qualifier !== null ? bestOmahaLow(s.hole, board, qualifier) : null,
    ),
  }
}

/** 가장 높은 하이를 가진 좌석들. **동점이면 여럿이다** — 걸러내지 않는다 */
function hiWinners(deal: Deal): number[] {
  let top = deal.his[0]
  for (const rank of deal.his) if (compareHands(rank, top) > 0) top = rank
  return deal.his.flatMap((rank, i) => (compareHands(rank, top) === 0 ? [i] : []))
}

/** 가장 낮은 로우를 가진 좌석들. 자격자가 없으면 빈 배열이고, 그것이 곧 「로우 없음」이다 */
function loWinners(deal: Deal): number[] {
  const alive = deal.los.flatMap((low, i) => (low === null ? [] : [i]))
  if (alive.length === 0) return []
  let best = deal.los[alive[0]] as LowRank
  for (const i of alive) if (compareLow(deal.los[i] as LowRank, best) < 0) best = deal.los[i] as LowRank
  return alive.filter((i) => compareLow(deal.los[i] as LowRank, best) === 0)
}

function names(seats: WinnerSeat[], picks: number[]): string {
  return picks.map((i) => seats[i].name).join(' · ')
}

function build(deal: Deal, asks: WinnerAsks, buttonSeat: number): WinnerQuestion {
  const answerHi = asks.hi ? hiWinners(deal) : []
  const answerLo = asks.lo ? loWinners(deal) : []
  const hiWhy = answerHi.length === 0
    ? ''
    // `HandRank.label` 이 이미 「스트레이트」 같은 한국어 이름이다. 여기서 짓지 않는다
    : `하이 ${names(deal.seats, answerHi)} (${deal.his[answerHi[0]].label})`
  const loWhy = !asks.lo
    ? ''
    : answerLo.length === 0
      ? '로우 없음'
      : `로우 ${names(deal.seats, answerLo)}`

  return {
    kind: 'winner',
    limitSec: WINNER_LIMIT_SEC,
    label: WINNER_KIND_LABEL.winner,
    prompt: asks.lo ? '하이 승자와 로우 승자를 고르세요.' : '하이 승자를 고르세요.',
    seats: deal.seats,
    board: deal.board,
    buttonSeat,
    asks,
    answerHi,
    answerLo,
    why: [hiWhy, loWhy].filter((s) => s !== '').join(' · '),
  }
}

/**
 * 이번 문제에 로우가 있어야 하는가. `null` 은 아무래도 좋다는 뜻이다.
 *
 * 문제마다 목표를 미리 정해 두면 열 문제의 배분이 시드와 무관하게 보장된다.
 * 순서는 섞는다 — 늘 같은 자리에 「로우 없음」이 오면 세 번째 문제부터 답을 위치로 짐작한다.
 */
function loTargets(rng: Rng): (boolean | null)[] {
  const targets: (boolean | null)[] = [
    ...Array<boolean>(LO_PRESENT_MIN).fill(true),
    ...Array<boolean>(LO_ABSENT_MIN).fill(false),
    ...Array<null>(WINNER_QUESTION_COUNT - LO_PRESENT_MIN - LO_ABSENT_MIN).fill(null),
  ]
  for (let i = targets.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = targets[i]
    targets[i] = targets[j]
    targets[j] = tmp
  }
  return targets
}

export function generateWinnerRun(spec: GameSpec, seed: string): WinnerQuestion[] {
  const asks = asksFor(spec)

  // 아직 만들지 않은 갈래는 조용히 넘어가지 않고 여기서 던진다. 짐작으로 구현하면
  // 검증되지 않은 채 굳는다 (설계 §6 — `firstToAct` 의 미구현 값 넷과 같은 이유)
  if (!asks.hi) throw new Error('로우 전용 종목은 아직 없다 — 라즈가 붙을 때 만든다')
  if (spec.eval.mustUse === null) {
    throw new Error('아무 다섯 장으로 고르는 종목은 아직 없다 — 홀덤·스터드가 붙을 때 만든다')
  }

  const rng = createRng(seed)
  return loTargets(rng).map((want) => {
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      const deal = dealOnce(spec, rng, asks)
      if (want === null || loWinners(deal).length > 0 === want) {
        return build(deal, asks, rng.int(WINNER_SEAT_COUNT))
      }
    }
    throw new Error(`로우 ${want ? '성립' : '불성립'} 판을 ${MAX_TRIES}번 안에 만들지 못함`)
  })
}
