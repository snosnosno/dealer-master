/**
 * 카드 타입과 덱 조작.
 *
 * 셔플은 Rng 를 통해서만 무작위성을 얻는다. Math.random() 을 쓰면
 * 같은 시드가 다른 덱을 만들어 핸드 재현이 불가능해진다.
 */
import type { Rng } from './rng'

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'
export type Suit = 's' | 'h' | 'd' | 'c'
export type Card = { rank: Rank; suit: Suit }

export const RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
export const SUITS: readonly Suit[] = ['s', 'h', 'd', 'c']

export const RANK_VALUE: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
}

/** 52장을 수트 → 랭크 순서로 정렬해서 만든다. */
export function makeDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit })
  }
  return deck
}

/** Fisher-Yates. 원본을 건드리지 않고 새 배열을 돌려준다. */
export function shuffle(deck: readonly Card[], rng: Rng): Card[] {
  const out = deck.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/** 'As', 'Th' 형태로 직렬화한다. */
export function cardToString(c: Card): string {
  return c.rank + c.suit
}

/** cardToString 의 역변환. 형식이 어긋나면 던진다. */
export function parseCard(s: string): Card {
  if (s.length !== 2) throw new Error(`카드 문자열 길이가 2가 아님: ${s}`)
  const rank = s[0] as Rank
  const suit = s[1] as Suit
  if (!RANKS.includes(rank)) throw new Error(`알 수 없는 랭크: ${s[0]}`)
  if (!SUITS.includes(suit)) throw new Error(`알 수 없는 수트: ${s[1]}`)
  return { rank, suit }
}
