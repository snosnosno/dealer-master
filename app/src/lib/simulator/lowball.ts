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

/** 에이스를 1 로 읽는다. 하이 평가기의 `RANK_VALUE`(A=14)와 **다른 잣대**라 여기 따로 둔다. */
const LOW_VALUE: Record<Rank, number> = {
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
