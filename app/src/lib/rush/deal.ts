/**
 * 문제를 만들 때 공통으로 쓰는 조각들.
 *
 * 여기에 포커 규칙은 없다 — 덱을 섞고 카드를 나눠주는 것까지다.
 * 승자·팟·홀칩 판정은 전부 엔진(`@/lib/simulator`)이 한다 (계획서 §1).
 */
import {
  PLAYER_NAMES,
  RANKS,
  SUITS,
  makeDeck,
  shuffle,
  type Card,
  type Rank,
  type Rng,
} from '@/lib/simulator'

/** 원본을 건드리지 않는 Fisher-Yates. 엔진 `shuffle` 은 Card 전용이라 여기 하나 더 둔다. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/** 좌석 이름 n개. 매번 다른 사람들이 앉는다. */
export function pickNames(rng: Rng, count: number): string[] {
  return shuffled(PLAYER_NAMES, rng).slice(0, count)
}

/**
 * 섞인 덱에서 순서대로 뽑는 카드 공급기.
 * 한 문제 안에서 카드가 겹치지 않는 유일한 보장이 "덱 하나에서만 뽑는다"는 것이다.
 */
export type Shoe = {
  draw(count: number): Card[]
  /** 아직 안 나간 카드들 (스플릿 유형이 조건에 맞는 카드를 골라야 한다) */
  rest(): Card[]
  /** 특정 카드들을 덱에서 빼서 쓴다. 없으면 null */
  take(cards: readonly Card[]): Card[] | null
}

export function createShoe(rng: Rng): Shoe {
  let deck = shuffle(makeDeck(), rng)
  let at = 0

  return {
    draw(count) {
      const out = deck.slice(at, at + count)
      at += count
      return out
    },
    rest() {
      return deck.slice(at)
    },
    take(cards) {
      const remaining = deck.slice(at)
      const found: Card[] = []
      for (const want of cards) {
        const i = remaining.findIndex((c) => c.rank === want.rank && c.suit === want.suit)
        if (i < 0) return null
        found.push(remaining[i])
        remaining.splice(i, 1)
      }
      deck = [...deck.slice(0, at), ...found, ...remaining]
      at += found.length
      return found
    },
  }
}

/** 랭크가 연속인 5장을 만들 수 있는 시작 랭크들 (2-6 … T-A). */
const STRAIGHT_STARTS = RANKS.slice(0, RANKS.length - 4)

/**
 * 보드 5장을 스트레이트로 깐다. 홀카드가 킥커로도 안 걸리면 전원이 보드로 플레이한다.
 * **여기서 "전원 분할"을 단정하지 않는다** — 누군가 더 높은 스트레이트를 들고 있을 수 있어서,
 * 확인은 호출한 쪽이 `evaluateHand` 로 한다 (설계 §5.1).
 */
export function straightBoard(shoe: Shoe, rng: Rng): Card[] | null {
  const start = RANKS.indexOf(rng.pick(STRAIGHT_STARTS))
  const wanted = RANKS.slice(start, start + 5)
  const remaining = shoe.rest()

  const board: Card[] = []
  for (const rank of wanted) {
    const found = remaining.find((c) => c.rank === rank && !board.includes(c))
    if (found === undefined) return null
    board.push(found)
  }
  return shoe.take(board)
}

/**
 * 홀칩 문제 전용 — **전 좌석이 완전 동점이 되는 히든 배치**.
 *
 * 홀칩 문제는 화면에 카드가 없지만, 정본인 `awardPots` 는 카드를 받아 쇼다운을 평가한
 * 뒤에야 순서를 매긴다. 그래서 "누구를 넣어도 무조건 동점"인 배치를 만들어 넣으면
 * `awardPots` 의 승자 집합이 곧 우리가 넘긴 자격자 집합이 되고,
 * **홀칩 순서 규칙을 러시가 다시 구현할 필요가 없어진다** (계획서 §1).
 *
 * 성립 근거:
 * - 보드가 브로드웨이 스트레이트(A-K-Q-J-T) — 이보다 높은 스트레이트는 없다
 * - 홀카드는 2~9 뿐이라 보드와 페어가 되지 않는다 → 트리플·풀하우스·포카드 불가
 * - 보드에 같은 무늬가 최대 2장 → 홀 2장을 더해도 플러시(5장) 불가
 *
 * 좌석 9개(홀 18장)까지 2~9 랭크 32장으로 덮는다.
 */
const TIE_BOARD: Card[] = [
  { rank: 'A', suit: 's' },
  { rank: 'K', suit: 'h' },
  { rank: 'Q', suit: 'd' },
  { rank: 'J', suit: 'c' },
  { rank: 'T', suit: 's' },
]

const LOW_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9']

export function allTieFixture(seatCount: number): { hole: Card[][]; board: Card[] } {
  const lows: Card[] = []
  for (const rank of LOW_RANKS) {
    for (const suit of SUITS) lows.push({ rank, suit })
  }
  if (seatCount * 2 > lows.length) {
    throw new Error(`좌석 ${seatCount}명은 동점 픽스처 범위를 넘는다`)
  }
  return {
    hole: Array.from({ length: seatCount }, (_, i) => [lows[i * 2], lows[i * 2 + 1]]),
    board: TIE_BOARD,
  }
}
