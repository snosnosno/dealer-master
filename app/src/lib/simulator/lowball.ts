/**
 * A-5 로우볼 평가기. **에이스가 최저이고 스트레이트·플러시를 세지 않는다** —
 * 그래서 5-4-3-2-A(휠)가 최고 로우다.
 *
 * 비유: 하이 평가기가 "누가 가장 센가"를 묻는다면 여기는 "누가 가장 낮은가"를 묻는다.
 * 같은 카드 다섯 장이라도 잣대가 반대라 별개의 함수여야 한다.
 *
 * **정확히 5장만 받는다.** 일곱 장 중 최선을 고르는 것은 이 파일의 일이 아니다 —
 * 오마하는 `omaha.ts` 가, 스터드는 나중에 붙을 조합기가 한다.
 * 잣대와 고르기를 한 함수에 넣으면 스터드에 오마하 조합기가 딸려온다.
 */
import { type Card, type Rank } from './cards'

/**
 * 에이스를 1 로 읽는다. 하이 평가기의 `RANK_VALUE`(A=14)와 **다른 잣대**라 여기 따로 둔다.
 *
 * **업카드 비교기와 라즈 생성기가 함께 쓴다** — `upcards.ts` 가 지금 쓰고, 라즈 생성기가
 * 뒤이어 쓴다. 그래서 export 다: 같은 표를 저쪽에 다시 적으면 한쪽만 고쳐지는 날이
 * 온다(판정 사본 금지).
 */
export const LOW_VALUE: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13,
}

export type LowRank = {
  /** 0=노페어 · 1=원페어 · 2=투페어 · 3=트립 · 7=쿼드. **클수록 나쁜 로우다** */
  category: number
  /** 사전식 비교용 `[category, ...값]`. **낮을수록 강하다** */
  key: number[]
  cards: Card[]
}

export function evaluateLowA5(five: Card[]): LowRank {
  if (five.length !== 5) throw new Error(`로우 평가에 정확히 5장이 필요함: ${five.length}장`)

  const counts = new Map<number, number>()
  for (const card of five) {
    const v = LOW_VALUE[card.rank]
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }

  // 개수가 많은 묶음이 먼저, 같으면 값이 큰 쪽이 먼저 — 나쁜 요소부터 앞에 온다
  const groups = [...counts.entries()]
    .map(([value, n]) => ({ value, n }))
    .sort((a, b) => b.n - a.n || b.value - a.value)

  const top = groups[0].n
  const second = groups[1]?.n ?? 0
  const category =
    top >= 4 ? 7 : top === 3 ? 3 : top === 2 && second === 2 ? 2 : top === 2 ? 1 : 0

  return { category, key: [category, ...groups.map((g) => g.value)], cards: five.slice() }
}

/** `a` 가 더 낮으면(강하면) 음수, `b` 가 더 낮으면 양수, 같으면 0. */
export function compareLow(a: LowRank, b: LowRank): number {
  const len = Math.max(a.key.length, b.key.length)
  for (let i = 0; i < len; i++) {
    const av = a.key[i] ?? 0
    const bv = b.key[i] ?? 0
    if (av !== bv) return av - bv
  }
  return 0
}

/**
 * 여러 장 중 **최고 로우 다섯 장**을 고른다.
 *
 * 비유: 손에 든 일곱 장을 늘어놓고 "이 중 가장 낮은 다섯은 어느 것인가"를 고르는 일이다.
 * 잣대(`evaluateLowA5`)는 다섯 장을 재기만 하고, 어느 다섯을 고를지는 이 함수가 정한다 —
 * 파일 상단 주석이 세운 그 분업이다.
 *
 * `qualifier` 가 숫자면 다섯 장이 **전부 그 값 이하**여야 성립한다. `null` 이면
 * 자격이 없다 — **라즈가 그것이다.** 어떤 다섯 장이든 로우가 되므로 절대 `null` 을
 * 돌려주지 않는다.
 */
export function bestFiveLow(cards: Card[], qualifier: 8 | null): LowRank | null {
  if (cards.length < 5) throw new Error(`로우를 고르려면 5장 이상이 필요함: ${cards.length}장`)

  let best: LowRank | null = null

  // C(n,5) 를 전부 돈다. n=7 이면 21가지라 값이 싸다
  for (let a = 0; a < cards.length - 4; a++) {
    for (let b = a + 1; b < cards.length - 3; b++) {
      for (let c = b + 1; c < cards.length - 2; c++) {
        for (let d = c + 1; d < cards.length - 1; d++) {
          for (let e = d + 1; e < cards.length; e++) {
            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]]
            if (qualifier !== null && five.some((card) => LOW_VALUE[card.rank] > qualifier)) {
              continue
            }
            const rank = evaluateLowA5(five)
            if (best === null || compareLow(rank, best) < 0) best = rank
          }
        }
      }
    }
  }

  return best
}
