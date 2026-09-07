/**
 * 핸드 족보 평가.
 *
 * 7장(홀 2 + 보드 5)에서 최선의 5장을 골라 순위를 매긴다.
 * 승자 판정이 틀리면 훈련용 제품이 오답을 가르치게 되므로,
 * 카테고리와 타이브레이커 모두 포커 규칙 그대로여야 한다.
 */
import { RANK_VALUE, type Card } from './cards'
import type { LowRank } from './lowball'

export type HandCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export const CATEGORY_LABEL: Record<HandCategory, string> = {
  0: '하이카드',
  1: '원페어',
  2: '투페어',
  3: '트리플',
  4: '스트레이트',
  5: '플러시',
  6: '풀하우스',
  7: '포카드',
  8: '스트레이트 플러시',
}

/**
 * tiebreak 는 같은 카테고리 안에서 비교할 값들을 센 순서대로 담는다.
 * 예: 원페어 KK + A,7,5 킥커 -> [13, 14, 7, 5]
 */
export type HandRank = {
  category: HandCategory
  tiebreak: number[]
  label: string
}

function make(category: HandCategory, tiebreak: number[]): HandRank {
  return { category, tiebreak, label: CATEGORY_LABEL[category] }
}

/** 정렬된 유니크 값 배열에서 가장 높은 스트레이트의 top 값을 찾는다. 없으면 0. */
function straightTop(uniqueDesc: number[]): number {
  // A 를 1로도 쓸 수 있게 휠용 값을 덧붙인다
  const vals = uniqueDesc.includes(14) ? [...uniqueDesc, 1] : uniqueDesc
  let run = 1
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] === vals[i - 1] - 1) {
      run++
      if (run >= 5) return vals[i] + 4
    } else {
      run = 1
    }
  }
  return 0
}

export function evaluateHand(cards: Card[]): HandRank {
  if (cards.length < 5) throw new Error(`평가에 최소 5장이 필요함: ${cards.length}장`)

  const values = cards.map((c) => RANK_VALUE[c.rank])
  const uniqDesc = Array.from(new Set(values)).sort((a, b) => b - a)

  // 수트별 묶음 — 플러시 판정용
  const bySuit = new Map<string, number[]>()
  for (const c of cards) {
    const arr = bySuit.get(c.suit) ?? []
    arr.push(RANK_VALUE[c.rank])
    bySuit.set(c.suit, arr)
  }

  let flushValues: number[] | null = null
  for (const arr of bySuit.values()) {
    if (arr.length >= 5) flushValues = arr.slice().sort((a, b) => b - a)
  }

  // 스트레이트 플러시
  if (flushValues) {
    const uniq = Array.from(new Set(flushValues)).sort((a, b) => b - a)
    const top = straightTop(uniq)
    if (top > 0) return make(8, [top])
  }

  // 랭크별 개수
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)

  // 개수 내림차순, 같으면 값 내림차순
  const groups = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0])

  const quad = groups.find((g) => g[1] === 4)
  if (quad) {
    // 키커는 "남은 랭크 중 가장 높은 값" 이다.
    // groups 는 개수 우선 정렬이라 여기서 groups 를 쓰면 포카드+페어일 때
    // 페어 랭크를 키커로 잡는다 (9999/22/K 와 9999/22/Q 가 무승부가 된다).
    const kicker = uniqDesc.filter((v) => v !== quad[0])[0]
    return make(7, [quad[0], kicker])
  }

  const trips = groups.filter((g) => g[1] === 3).map((g) => g[0])
  const pairs = groups.filter((g) => g[1] === 2).map((g) => g[0])

  if (trips.length >= 2) return make(6, [trips[0], trips[1]])
  if (trips.length === 1 && pairs.length >= 1) return make(6, [trips[0], pairs[0]])

  if (flushValues) return make(5, flushValues.slice(0, 5))

  const stTop = straightTop(uniqDesc)
  if (stTop > 0) return make(4, [stTop])

  if (trips.length === 1) {
    const kickers = uniqDesc.filter((v) => v !== trips[0]).slice(0, 2)
    return make(3, [trips[0], ...kickers])
  }

  if (pairs.length >= 2) {
    const [hi, lo] = pairs
    const kicker = uniqDesc.filter((v) => v !== hi && v !== lo)[0]
    return make(2, [hi, lo, kicker])
  }

  if (pairs.length === 1) {
    const kickers = uniqDesc.filter((v) => v !== pairs[0]).slice(0, 3)
    return make(1, [pairs[0], ...kickers])
  }

  return make(0, uniqDesc.slice(0, 5))
}

/** a 가 세면 양수, b 가 세면 음수, 완전히 같으면 0. */
export function compareHands(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category - b.category
  const len = Math.max(a.tiebreak.length, b.tiebreak.length)
  for (let i = 0; i < len; i++) {
    const av = a.tiebreak[i] ?? 0
    const bv = b.tiebreak[i] ?? 0
    if (av !== bv) return av - bv
  }
  return 0
}

/**
 * 「이 종목에서 핸드를 어떻게 매기나」의 포트.
 *
 * 엔진은 **모양만 안다.** 어느 원자를 고를지는 종목 데이터를 가진 게임 층이 정한다
 * (`lib/games/evaluator.ts`). 반대로 놓으면 엔진이 `GameSpec` 을 알게 되어
 * 「게임 데이터의 정본은 lib/games 하나」(ADR-003)가 무너진다.
 */
export type HandEvaluator = {
  rankHi(hole: Card[], board: Card[]): HandRank
  /** `null` 이면 이 종목에 로우가 없다. 있어도 성립하지 않으면 호출이 `null` 을 낸다 */
  rankLo: null | ((hole: Card[], board: Card[]) => LowRank | null)
}

/**
 * 홀·보드를 통틀어 아무 다섯 장을 고르는 평가기 — 로우는 없다.
 *
 * 종목 이름이 아니라 **방식**으로 이름지었다. 엔진은 「홀덤」을 몰라도 되고,
 * 이 모양을 쓰는 종목이 늘어도 여기는 그대로다.
 * 이 상수가 정본이다 — `lib/games/evaluator.ts` 의 `mustUse === null` 갈래도
 * 같은 식을 다시 쓰지 않고 이것을 돌려준다 (판정 사본 금지).
 */
export const ANY_FIVE_EVALUATOR: HandEvaluator = {
  rankHi: (hole, board) => evaluateHand([...hole, ...board]),
  rankLo: null,
}
