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
  compareHands, compareLow, createRng, LOW_VALUE, makeDeck, shuffle,
  type Card, type HandEvaluator, type HandRank, type LowRank, type Rng,
} from '@/lib/simulator'
import { evaluatorFor, type GameSpec } from '@/lib/games'
import {
  asksFor, LO_ABSENT_MIN, LO_PRESENT_MIN, RAZZ_PAIRED_MIN, RAZZ_STRAIGHTISH_MIN,
  WINNER_KIND_LABEL, WINNER_LIMIT_SEC, WINNER_QUESTION_COUNT, WINNER_SEAT_COUNT,
  type RazzTarget, type WinnerAsks, type WinnerQuestion, type WinnerSeat,
} from './types'

const NAMES = ['1번', '2번', '3번', '4번']
/** 조건이 잘못됐을 때 무한 루프 대신 명확한 실패로 드러나게 하는 상한 */
const MAX_TRIES = 400

type Deal = { seats: WinnerSeat[]; board: Card[]; his: (HandRank | null)[]; los: (LowRank | null)[] }

/** 이 종목의 공유 보드 장수. 스펙이 스트릿마다 보드로 내는 장수의 합이다 */
function boardSize(spec: GameSpec): number {
  return spec.streets.reduce((n, s) => n + s.deal.board, 0)
}

function dealOnce(spec: GameSpec, rng: Rng, asks: WinnerAsks, ev: HandEvaluator): Deal {
  const deck = shuffle(makeDeck(), rng)
  const boardN = boardSize(spec)
  const board = deck.slice(0, boardN)
  const n = spec.holeCardCount
  const seats = NAMES.slice(0, WINNER_SEAT_COUNT).map((name, i) => ({
    name,
    hole: deck.slice(boardN + i * n, boardN + (i + 1) * n),
  }))
  return {
    seats,
    board,
    // 하이가 없는 종목이면 순위를 매기지 않는다 — 없는 것을 지어내지 않는다
    his: seats.map((s) => (ev.rankHi === null ? null : ev.rankHi(s.hole, board))),
    los: seats.map((s) => (asks.lo && ev.rankLo !== null ? ev.rankLo(s.hole, board) : null)),
  }
}

/** 가장 높은 하이를 가진 좌석들. **동점이면 여럿이다** — 걸러내지 않는다. 하이가 없으면 빈 배열 */
function hiWinners(deal: Deal): number[] {
  const ranked = deal.his.flatMap((r, i) => (r === null ? [] : [{ r, i }]))
  if (ranked.length === 0) return []
  let top = ranked[0].r
  for (const x of ranked) if (compareHands(x.r, top) > 0) top = x.r
  return ranked.flatMap((x) => (compareHands(x.r, top) === 0 ? [x.i] : []))
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

/** A5 로우 카드 다섯 장을 값 내림차순으로 늘어놓는다. 에이스는 1 이라 맨 끝에 온다 */
function formatLowCards(cards: Card[]): string {
  return [...cards].sort((a, b) => LOW_VALUE[b.rank] - LOW_VALUE[a.rank]).map((c) => c.rank).join('-')
}

/**
 * 라즈 근거 문구. 이긴 손의 모양에 따라 **왜** 이겼는지 한 줄을 더한다 — 답만
 * 되풀이하지 않는다. `isRun`·`isFlush` 는 `matchesRazzTarget` 과 같은 판정을 쓴다
 * (판정 사본 금지).
 */
function razzLowWhy(deal: Deal, answerLo: number[]): string {
  const best = deal.los[answerLo[0]] as LowRank
  const base = `${names(deal.seats, answerLo)}이 ${formatLowCards(best.cards)} 로 가장 낮다.`

  if (isRun(best.cards) || isFlush(best.cards)) {
    return `${base} 라즈는 스트레이트를 세지 않으므로 이것이 최고 패다.`
  }

  // 이긴 손이 이미 페어면 「상대 페어 때문에」는 거짓 설명이다 — 노페어로 이겼을 때만 말한다
  if (best.category === 0) {
    const paired = deal.los
      .flatMap((low, i) => (answerLo.includes(i) || low === null ? [] : [{ low, i }]))
      .find((x) => x.low.category > 0)
    if (paired !== undefined) {
      return `${base} ${deal.seats[paired.i].name}는 페어가 있어 로우가 망가졌다.`
    }
  }

  return base
}

function build(deal: Deal, asks: WinnerAsks, buttonSeat: number): WinnerQuestion {
  const answerHi = asks.hi ? hiWinners(deal) : []
  const answerLo = asks.lo ? loWinners(deal) : []
  const hiWhy = answerHi.length === 0
    ? ''
    // `HandRank.label` 이 이미 「스트레이트」 같은 한국어 이름이다. 여기서 짓지 않는다
    : `하이 ${names(deal.seats, answerHi)} (${(deal.his[answerHi[0]] as HandRank).label})`
  const loWhy = !asks.lo
    ? ''
    : answerLo.length === 0
      ? '로우 없음'
      : asks.hi
        ? `로우 ${names(deal.seats, answerLo)}`
        : razzLowWhy(deal, answerLo)

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
  // loTargets 가 로우 성립 문제를 요구한다 — 로우가 없는 종목은 아직 낼 수 없다
  if (!asks.lo) throw new Error('로우가 없는 종목은 아직 없다 — 목표 배분이 로우에 기댄다')

  // 아직 만들지 않은 평가 갈래는 여기서 던진다 (lib/games/evaluator.ts)
  const ev = evaluatorFor(spec)
  const rng = createRng(seed)

  /*
   * **묻는 것이 다르면 변주 축도 다르다.**
   *
   * 하이로우 종목은 「로우가 성립하나」로 갈린다 — 매번 성립하면 아무도 「로우 없음」을
   * 안 누르기 때문이다. 라즈는 자격이 없어 **로우가 늘 성립하므로 그 축이 통째로
   * 무의미하다.** 대신 「무엇을 가르치는 손인가」로 가른다 (설계 §6).
   */
  if (!asks.hi) return razzRun(spec, rng, asks, ev)

  return loTargets(rng).map((want) => {
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      const deal = dealOnce(spec, rng, asks, ev)
      if (want === null || loWinners(deal).length > 0 === want) {
        return build(deal, asks, rng.int(WINNER_SEAT_COUNT))
      }
    }
    throw new Error(`로우 ${want ? '성립' : '불성립'} 판을 ${MAX_TRIES}번 안에 만들지 못함`)
  })
}

/** 라즈 한 판. 가르치는 손 둘을 섞어 낸다 */
function razzRun(spec: GameSpec, rng: Rng, asks: WinnerAsks, ev: HandEvaluator): WinnerQuestion[] {
  return razzTargets(rng).map((want) => {
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      const deal = dealOnce(spec, rng, asks, ev)
      if (want === null || matchesRazzTarget(deal, want)) {
        return build(deal, asks, rng.int(WINNER_SEAT_COUNT))
      }
    }
    throw new Error(`라즈 ${want ?? '아무'} 판을 ${MAX_TRIES}번 안에 만들지 못함`)
  })
}

/** 목표를 섞는다. `loTargets` 와 같은 모양이다 — 하한을 채우고 나머지는 자유다 */
function razzTargets(rng: Rng): RazzTarget[] {
  const targets: RazzTarget[] = [
    ...Array<RazzTarget>(RAZZ_STRAIGHTISH_MIN).fill('straightish'),
    ...Array<RazzTarget>(RAZZ_PAIRED_MIN).fill('paired'),
    ...Array<RazzTarget>(WINNER_QUESTION_COUNT - RAZZ_STRAIGHTISH_MIN - RAZZ_PAIRED_MIN).fill(null),
  ]
  for (let i = targets.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = targets[i]
    targets[i] = targets[j]
    targets[j] = tmp
  }
  return targets
}

/**
 * 이 판이 목표를 가르치나.
 *
 * `straightish` — **이긴 손**의 다섯 장이 연속이거나 무늬가 같다. 라즈는 그 둘을
 * 무시하므로, 홀덤을 배운 사람이 「스트레이트라 세다」고 착각하기 딱 좋은 판이다.
 * `paired` — **이긴 손은 노페어인데 진 손에 페어가 있다.** 페어가 로우를 망치는 것을 본다.
 *
 * 임자가 여럿인 판(동점)은 목표로 삼지 않는다 — 가르치려는 것이 흐려진다.
 * 다만 목표가 `null` 인 문제에서는 동점이 자연히 나오고, **그것을 걸러내지 않는다**
 * (승자 판독 설계가 쿼터링을 안 걸러낸 것과 같은 규율).
 */
function matchesRazzTarget(deal: Deal, want: Exclude<RazzTarget, null>): boolean {
  const winners = loWinners(deal)
  if (winners.length !== 1) return false
  const best = deal.los[winners[0]]
  if (best === null) return false

  if (want === 'straightish') return isRun(best.cards) || isFlush(best.cards)

  // 이긴 손이 우연히 런/플러시 모양이면 근거 문구가 그쪽을 먼저 말해 페어 교훈이
  // 가려진다(휠 5-4-3-2-A 가 대표적) — 그런 판은 「페어」 목표로 세지 않는다
  if (isRun(best.cards) || isFlush(best.cards)) return false

  const losers = deal.los.flatMap((low, i) => (i === winners[0] || low === null ? [] : [low]))
  return best.category === 0 && losers.some((low) => low.category > 0)
}

/** 다섯 장이 연속인가. 로우 잣대라 A 는 1 이다 */
function isRun(five: Card[]): boolean {
  const vs = five.map((c) => LOW_VALUE[c.rank]).sort((a, b) => a - b)
  return vs.every((v, i) => i === 0 || v === vs[i - 1] + 1)
}

function isFlush(five: Card[]): boolean {
  return five.every((c) => c.suit === five[0].suit)
}
