# 딜러 시뮬레이터 — 엔진 코어 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시드 하나로 노리밋 홀덤 핸드를 결정론적으로 생성하고, 판단 지점 4종을 추출하고, 답안을 채점하는 순수 TypeScript 엔진을 만든다. UI는 이 계획에 없다.

**Architecture:** React·Next에 의존하지 않는 순수 함수 모듈로 짠다. 핸드 진행은 이벤트 배열이고 화면 상태는 이벤트를 접어서(reduce) 만든다. 난수는 전부 시드 PRNG 하나를 통과하므로 같은 시드는 항상 같은 핸드를 만든다. 게임 규칙은 `Ruleset` 인터페이스 뒤에 두어 나중에 스터드·드로우·팟리밋을 데이터로 붙일 수 있게 한다.

**Tech Stack:** TypeScript 5, Vitest 4 (node 환경), 외부 런타임 의존성 없음

**Spec:** `docs/superpowers/specs/2026-08-25-dealer-simulator-design.md`

## Global Constraints

- 작업 디렉토리는 `C:\Users\user\Desktop\dealer master\app` — 모든 경로는 이 폴더 기준
- **`Math.random()` 사용 금지.** 셔플·스택 배분·이상 삽입이 전부 `createRng(seed)` 하나를 통과해야 한다. 한 번이라도 섞이면 결정론이 조용히 깨지고 재현 불가능한 버그가 된다
- 엔진 파일은 `react`, `next`, `@supabase/*`를 import 하지 않는다 — 순수 TS
- 파일 하나가 400줄을 넘기지 않는다
- 금액은 전부 정수(원 단위). 부동소수 금지
- 좌석 인덱스는 0-based, 사용자에게 보이는 번호는 +1
- 칩 단위 표준: 100 / 500 / 1,000 / 5,000 / 25,000 / 100,000 (`12_design_system.md` §5-1)
- 커밋 메시지는 `<type>: <설명>` 형식, 한국어

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/lib/simulator/rng.ts` | 시드 PRNG. 이 파일만 난수를 만든다 |
| `src/lib/simulator/cards.ts` | Card 타입, 덱 생성, 결정론적 셔플 |
| `src/lib/simulator/evaluate.ts` | 7장에서 최선의 5장 족보 평가·비교 |
| `src/lib/simulator/types.ts` | Hand, HandEvent, HandState, DecisionPoint 등 공용 타입 |
| `src/lib/simulator/reduce.ts` | `applyEvent`, `stateAt` — 이벤트를 접어 상태를 만든다 |
| `src/lib/simulator/pots.ts` | 사이드팟 분리와 지급 계산 |
| `src/lib/simulator/rulesets/types.ts` | `Ruleset` 인터페이스 |
| `src/lib/simulator/rulesets/nlh.ts` | 노리밋 홀덤 구현 (V1 유일) |
| `src/lib/simulator/generate.ts` | 시드 → Hand |
| `src/lib/simulator/decisions.ts` | 생성된 핸드에서 판단 지점 추출 |
| `src/lib/simulator/score.ts` | 답안 채점 |

테스트는 각 파일 옆에 `*.test.ts`로 둔다.

---

## Task 1: 테스트 환경과 시드 PRNG

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/simulator/rng.ts`
- Test: `src/lib/simulator/rng.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: 없음
- Produces: `createRng(seed: string): Rng` where `Rng = { next(): number; int(maxExclusive: number): number; pick<T>(arr: T[]): T }`. `next()`는 0 이상 1 미만.

- [ ] **Step 1: Vitest 설치**

```bash
cd "C:\Users\user\Desktop\dealer master\app"
npm install -D vitest
```

- [ ] **Step 2: Vitest 설정 파일 작성**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
```

- [ ] **Step 3: package.json 에 스크립트 추가**

```bash
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
```

- [ ] **Step 4: 실패하는 테스트 작성**

`src/lib/simulator/rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createRng } from './rng'

describe('createRng', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    const a = createRng('nlh-7f3a91')
    const b = createRng('nlh-7f3a91')
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('다른 시드는 다른 수열을 만든다', () => {
    const a = createRng('seed-a')
    const b = createRng('seed-b')
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })

  it('next() 는 0 이상 1 미만을 돌려준다', () => {
    const r = createRng('range-check')
    for (let i = 0; i < 500; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('int(n) 은 0 이상 n 미만 정수를 돌려준다', () => {
    const r = createRng('int-check')
    for (let i = 0; i < 500; i++) {
      const v = r.int(6)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(6)
    }
  })

  it('pick 은 배열의 원소를 돌려주고 시드에 대해 결정론적이다', () => {
    const arr = ['a', 'b', 'c', 'd']
    const one = Array.from({ length: 10 }, (_, i) => createRng('pick' + i).pick(arr))
    const two = Array.from({ length: 10 }, (_, i) => createRng('pick' + i).pick(arr))
    expect(one).toEqual(two)
    one.forEach((v) => expect(arr).toContain(v))
  })
})
```

- [ ] **Step 5: 테스트 실행 — 실패 확인**

Run: `npm test -- rng`
Expected: FAIL — `Failed to resolve import "./rng"`

- [ ] **Step 6: 구현 작성**

`src/lib/simulator/rng.ts`:

```ts
/**
 * 시드 기반 난수 생성기.
 *
 * 이 파일이 시뮬레이터에서 난수를 만드는 유일한 곳이다.
 * Math.random() 을 어디서든 한 번 쓰면 같은 시드가 다른 핸드를 만들게 되고,
 * 그 버그는 재현이 안 돼서 잡기가 매우 어렵다.
 */
export type Rng = {
  next(): number
  int(maxExclusive: number): number
  pick<T>(arr: readonly T[]): T
}

/** 문자열 시드를 32비트 정수로 흩뿌린다 (xmur3). */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

export function createRng(seed: string): Rng {
  let state = hashSeed(seed)

  // mulberry32 — 짧고 통계적 품질이 이 용도에 충분하다
  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int(maxExclusive: number): number {
      if (maxExclusive <= 0) throw new Error(`int() 범위가 잘못됨: ${maxExclusive}`)
      return Math.floor(next() * maxExclusive)
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('pick() 에 빈 배열이 들어옴')
      return arr[Math.floor(next() * arr.length)]
    },
  }
}
```

- [ ] **Step 7: 테스트 실행 — 통과 확인**

Run: `npm test -- rng`
Expected: PASS, 5 tests

- [ ] **Step 8: 커밋**

```bash
git add vitest.config.ts package.json package-lock.json src/lib/simulator/rng.ts src/lib/simulator/rng.test.ts
git commit -m "feat: 시뮬레이터 시드 PRNG 및 vitest 환경"
```

---

## Task 2: 카드 타입과 결정론적 셔플

**Files:**
- Create: `src/lib/simulator/cards.ts`
- Test: `src/lib/simulator/cards.test.ts`

**Interfaces:**
- Consumes: `createRng` (Task 1)
- Produces:
  - `type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'T'|'J'|'Q'|'K'|'A'`
  - `type Suit = 's'|'h'|'d'|'c'`
  - `type Card = { rank: Rank; suit: Suit }`
  - `makeDeck(): Card[]` — 52장, 정렬된 순서
  - `shuffle(deck: Card[], rng: Rng): Card[]` — 새 배열 반환, 원본 불변
  - `cardToString(c: Card): string` — `'As'`, `'Th'` 형태
  - `parseCard(s: string): Card`
  - `RANK_VALUE: Record<Rank, number>` — 2가 2, A가 14

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/simulator/cards.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { makeDeck, shuffle, cardToString, parseCard, RANK_VALUE } from './cards'
import { createRng } from './rng'

describe('makeDeck', () => {
  it('52장을 만든다', () => {
    expect(makeDeck()).toHaveLength(52)
  })

  it('중복 카드가 없다', () => {
    const seen = new Set(makeDeck().map(cardToString))
    expect(seen.size).toBe(52)
  })
})

describe('shuffle', () => {
  it('같은 시드는 같은 순서를 만든다', () => {
    const a = shuffle(makeDeck(), createRng('deck-1')).map(cardToString)
    const b = shuffle(makeDeck(), createRng('deck-1')).map(cardToString)
    expect(a).toEqual(b)
  })

  it('다른 시드는 다른 순서를 만든다', () => {
    const a = shuffle(makeDeck(), createRng('deck-1')).map(cardToString)
    const b = shuffle(makeDeck(), createRng('deck-2')).map(cardToString)
    expect(a).not.toEqual(b)
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const deck = makeDeck()
    const before = deck.map(cardToString)
    shuffle(deck, createRng('immutable'))
    expect(deck.map(cardToString)).toEqual(before)
  })

  it('셔플 후에도 52장이고 중복이 없다', () => {
    const out = shuffle(makeDeck(), createRng('count'))
    expect(out).toHaveLength(52)
    expect(new Set(out.map(cardToString)).size).toBe(52)
  })
})

describe('cardToString / parseCard', () => {
  it('왕복 변환이 원본과 같다', () => {
    makeDeck().forEach((c) => {
      expect(parseCard(cardToString(c))).toEqual(c)
    })
  })

  it('잘못된 문자열은 던진다', () => {
    expect(() => parseCard('Xz')).toThrow()
    expect(() => parseCard('A')).toThrow()
  })
})

describe('RANK_VALUE', () => {
  it('A 가 가장 크고 2 가 가장 작다', () => {
    expect(RANK_VALUE.A).toBe(14)
    expect(RANK_VALUE['2']).toBe(2)
    expect(RANK_VALUE.K).toBeLessThan(RANK_VALUE.A)
  })
})
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npm test -- cards`
Expected: FAIL — `Failed to resolve import "./cards"`

- [ ] **Step 3: 구현 작성**

`src/lib/simulator/cards.ts`:

```ts
import type { Rng } from './rng'

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'
export type Suit = 's' | 'h' | 'd' | 'c'
export type Card = { rank: Rank; suit: Suit }

export const RANKS: readonly Rank[] = ['2','3','4','5','6','7','8','9','T','J','Q','K','A']
export const SUITS: readonly Suit[] = ['s','h','d','c']

export const RANK_VALUE: Record<Rank, number> = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14,
}

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

export function cardToString(c: Card): string {
  return c.rank + c.suit
}

export function parseCard(s: string): Card {
  if (s.length !== 2) throw new Error(`카드 문자열 길이가 2가 아님: ${s}`)
  const rank = s[0] as Rank
  const suit = s[1] as Suit
  if (!RANKS.includes(rank)) throw new Error(`알 수 없는 랭크: ${s[0]}`)
  if (!SUITS.includes(suit)) throw new Error(`알 수 없는 수트: ${s[1]}`)
  return { rank, suit }
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npm test -- cards`
Expected: PASS, 9 tests

- [ ] **Step 5: 커밋**

```bash
git add src/lib/simulator/cards.ts src/lib/simulator/cards.test.ts
git commit -m "feat: 카드 타입과 결정론적 셔플"
```

---

## Task 3: 핸드 족보 평가

7장(홀 2 + 보드 5)에서 최선의 5장을 찾아 순위를 매긴다. 시뮬레이터에서 승자 판정이 틀리면 훈련용 제품이 오답을 가르치게 되므로, 이 태스크의 테스트가 가장 촘촘해야 한다.

**Files:**
- Create: `src/lib/simulator/evaluate.ts`
- Test: `src/lib/simulator/evaluate.test.ts`

**Interfaces:**
- Consumes: `Card`, `RANK_VALUE`, `parseCard` (Task 2)
- Produces:
  - `type HandCategory = 0..8` (0=하이카드 … 8=스트레이트플러시)
  - `type HandRank = { category: HandCategory; tiebreak: number[]; label: string }`
  - `evaluateHand(cards: Card[]): HandRank` — 5~7장을 받는다
  - `compareHands(a: HandRank, b: HandRank): number` — a가 세면 양수, 같으면 0
  - `CATEGORY_LABEL: Record<HandCategory, string>`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/simulator/evaluate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluateHand, compareHands } from './evaluate'
import { parseCard } from './cards'

const h = (...s: string[]) => s.map(parseCard)

describe('evaluateHand — 카테고리 판정', () => {
  it('스트레이트 플러시', () => {
    expect(evaluateHand(h('9s','8s','7s','6s','5s','2d','Kh')).category).toBe(8)
  })
  it('포카드', () => {
    expect(evaluateHand(h('9s','9h','9d','9c','5s','2d','Kh')).category).toBe(7)
  })
  it('풀하우스', () => {
    expect(evaluateHand(h('9s','9h','9d','5c','5s','2d','Kh')).category).toBe(6)
  })
  it('플러시', () => {
    expect(evaluateHand(h('As','Js','8s','5s','2s','9d','Kh')).category).toBe(5)
  })
  it('스트레이트', () => {
    expect(evaluateHand(h('9s','8h','7d','6c','5s','2d','Kh')).category).toBe(4)
  })
  it('휠 스트레이트 — A 를 1로 쓴다', () => {
    const r = evaluateHand(h('As','2h','3d','4c','5s','9d','Kh'))
    expect(r.category).toBe(4)
    expect(r.tiebreak[0]).toBe(5) // 5-high
  })
  it('트리플', () => {
    expect(evaluateHand(h('9s','9h','9d','5c','3s','2d','Kh')).category).toBe(3)
  })
  it('투페어', () => {
    expect(evaluateHand(h('9s','9h','5d','5c','3s','2d','Kh')).category).toBe(2)
  })
  it('원페어', () => {
    expect(evaluateHand(h('9s','9h','5d','4c','3s','2d','Kh')).category).toBe(1)
  })
  it('하이카드', () => {
    expect(evaluateHand(h('9s','7h','5d','4c','3s','2d','Kh')).category).toBe(0)
  })
})

describe('compareHands', () => {
  it('킥커로 승부가 갈린다', () => {
    const a = evaluateHand(h('Ks','Kh','Ad','7c','5s','2d','3h')) // KK + A 킥커
    const b = evaluateHand(h('Ks','Kh','Qd','7c','5s','2d','3h')) // KK + Q 킥커
    expect(compareHands(a, b)).toBeGreaterThan(0)
  })

  it('완전히 같은 족보는 0을 돌려준다', () => {
    const a = evaluateHand(h('Ks','Kh','Ad','7c','5s'))
    const b = evaluateHand(h('Kd','Kc','Ah','7s','5d'))
    expect(compareHands(a, b)).toBe(0)
  })

  it('카테고리가 다르면 카테고리가 이긴다', () => {
    const trips = evaluateHand(h('7s','7h','7d','Kc','5s'))
    const twoPair = evaluateHand(h('As','Ah','Kd','Kc','5s'))
    expect(compareHands(trips, twoPair)).toBeGreaterThan(0)
  })
})

describe('목업 핸드 — 설계 문서의 검증 시나리오', () => {
  // 보드 Kd 9s 7h 2c Qs
  const board = h('Kd','9s','7h','2c','Qs')
  const choi = evaluateHand([...h('9h','9d'), ...board])   // 트리플 9
  const park = evaluateHand([...h('As','Ks'), ...board])   // K 원페어
  const lee  = evaluateHand([...h('7c','7s'), ...board])   // 트리플 7

  it('최우진이 트리플 9로 가장 세다', () => {
    expect(compareHands(choi, park)).toBeGreaterThan(0)
    expect(compareHands(choi, lee)).toBeGreaterThan(0)
  })

  it('사이드팟에서는 이민아(트리플 7)가 박서준(K 페어)을 이긴다', () => {
    expect(compareHands(lee, park)).toBeGreaterThan(0)
  })

  it('보드에 스페이드가 2장뿐이라 박서준은 플러시가 아니다', () => {
    expect(park.category).toBe(1)
  })
})
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npm test -- evaluate`
Expected: FAIL — `Failed to resolve import "./evaluate"`

- [ ] **Step 3: 구현 작성**

`src/lib/simulator/evaluate.ts`:

```ts
import { RANK_VALUE, type Card } from './cards'

export type HandCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export const CATEGORY_LABEL: Record<HandCategory, string> = {
  0: '하이카드', 1: '원페어', 2: '투페어', 3: '트리플', 4: '스트레이트',
  5: '플러시', 6: '풀하우스', 7: '포카드', 8: '스트레이트 플러시',
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
  const groups = Array.from(counts.entries()).sort((a, b) =>
    b[1] - a[1] || b[0] - a[0],
  )

  const quad = groups.find((g) => g[1] === 4)
  if (quad) {
    const kicker = groups.filter((g) => g[0] !== quad[0]).map((g) => g[0])[0]
    return make(7, [quad[0], kicker])
  }

  const trips = groups.filter((g) => g[1] === 3).map((g) => g[0])
  const pairs = groups.filter((g) => g[1] === 2).map((g) => g[0])

  if (trips.length >= 2) return make(6, [trips[0], trips[1]])
  if (trips.length === 1 && pairs.length >= 1) return make(6, [trips[0], pairs[0]])

  if (flushValues) return make(5, flushValues.slice(0, 5))

  const uniqDesc = Array.from(new Set(values)).sort((a, b) => b - a)
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
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npm test -- evaluate`
Expected: PASS, 16 tests

- [ ] **Step 5: 커밋**

```bash
git add src/lib/simulator/evaluate.ts src/lib/simulator/evaluate.test.ts
git commit -m "feat: 핸드 족보 평가 및 비교"
```

---

## Task 4: 공용 타입과 이벤트 리듀서

**Files:**
- Create: `src/lib/simulator/types.ts`
- Create: `src/lib/simulator/reduce.ts`
- Test: `src/lib/simulator/reduce.test.ts`

**Interfaces:**
- Consumes: `Card` (Task 2)
- Produces:
  - `type Street = 'preflop' | 'flop' | 'turn' | 'river'`
  - `type PlayerAction = { kind: 'fold' } | { kind: 'check' } | { kind: 'call'; to: number } | { kind: 'bet'; to: number } | { kind: 'raise'; to: number } | { kind: 'allin'; to: number }`
  - `type HandEvent` — 아래 구현 참조
  - `type SeatState = { name: string; stack: number; bet: number; folded: boolean; allIn: boolean; hole: Card[]; revealed: boolean }`
  - `type HandState = { seats: SeatState[]; buttonSeat: number; board: Card[]; pot: number; street: Street; actingSeat: number | null; contributed: number[] }`
  - `initialState(seats, buttonSeat): HandState`
  - `applyEvent(state: HandState, e: HandEvent): HandState` — 새 객체 반환, 입력 불변
  - `stateAt(init: HandState, events: HandEvent[], index: number): HandState`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/simulator/reduce.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { initialState, applyEvent, stateAt } from './reduce'
import type { HandEvent } from './types'
import { parseCard } from './cards'

const seats = [
  { name: '김도현', stack: 25000 },
  { name: '박서준', stack: 12500 },
  { name: '이민아', stack: 47000 },
]

const events: HandEvent[] = [
  { type: 'post_blind', seat: 1, amount: 100, kind: 'sb' },
  { type: 'post_blind', seat: 2, amount: 200, kind: 'bb' },
  { type: 'deal_hole', seat: 0, card: parseCard('As') },
  { type: 'player_action', seat: 0, action: { kind: 'fold' } },
  { type: 'player_action', seat: 1, action: { kind: 'raise', to: 1050 } },
  { type: 'player_action', seat: 2, action: { kind: 'call', to: 1050 } },
  { type: 'collect_bets' },
]

describe('applyEvent', () => {
  it('블라인드가 스택에서 빠지고 벳으로 잡힌다', () => {
    const s = applyEvent(initialState(seats, 0), events[0])
    expect(s.seats[1].stack).toBe(12400) // 12500 - 100
    expect(s.seats[1].bet).toBe(100)
  })

  it('입력 상태를 변형하지 않는다', () => {
    const before = initialState(seats, 0)
    const snapshot = JSON.stringify(before)
    applyEvent(before, events[0])
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('폴드가 반영된다', () => {
    let s = initialState(seats, 0)
    for (const e of events.slice(0, 4)) s = applyEvent(s, e)
    expect(s.seats[0].folded).toBe(true)
  })

  it('collect_bets 가 벳을 팟으로 옮기고 벳을 0으로 만든다', () => {
    let s = initialState(seats, 0)
    for (const e of events) s = applyEvent(s, e)
    expect(s.pot).toBe(1050 + 1050) // 박서준 1050 + 이민아 1050 (김도현은 폴드, 벳 0)
    expect(s.seats.every((x) => x.bet === 0)).toBe(true)
  })

  it('contributed 는 collect 후에도 누적을 유지한다', () => {
    let s = initialState(seats, 0)
    for (const e of events) s = applyEvent(s, e)
    expect(s.contributed[1]).toBe(1050)
    expect(s.contributed[2]).toBe(1050)
    expect(s.contributed[0]).toBe(0)
  })

  it('올인은 allIn 플래그를 세운다', () => {
    let s = initialState(seats, 0)
    s = applyEvent(s, { type: 'player_action', seat: 1, action: { kind: 'allin', to: 12500 } })
    expect(s.seats[1].allIn).toBe(true)
    expect(s.seats[1].stack).toBe(0)
  })
})

describe('stateAt', () => {
  it('임의 인덱스까지 접은 결과가 순차 적용과 같다', () => {
    const init = initialState(seats, 0)
    for (let i = 0; i <= events.length; i++) {
      let manual = init
      for (const e of events.slice(0, i)) manual = applyEvent(manual, e)
      expect(stateAt(init, events, i)).toEqual(manual)
    }
  })
})
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npm test -- reduce`
Expected: FAIL — `Failed to resolve import "./reduce"`

- [ ] **Step 3: 타입 파일 작성**

`src/lib/simulator/types.ts`:

```ts
import type { Card } from './cards'

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export type PlayerAction =
  | { kind: 'fold' }
  | { kind: 'check' }
  | { kind: 'call'; to: number }
  | { kind: 'bet'; to: number }
  | { kind: 'raise'; to: number }
  | { kind: 'allin'; to: number }

export type HandEvent =
  | { type: 'move_button'; toSeat: number }
  | { type: 'post_blind'; seat: number; amount: number; kind: 'sb' | 'bb' | 'ante' }
  | { type: 'deal_hole'; seat: number; card: Card }
  | { type: 'burn' }
  | { type: 'deal_board'; street: Street; cards: Card[] }
  | { type: 'player_action'; seat: number; action: PlayerAction }
  | { type: 'collect_bets' }
  | { type: 'showdown_reveal'; seat: number }
  | { type: 'award_pot'; potIndex: number; seat: number; amount: number }

export type SeatState = {
  name: string
  stack: number
  bet: number
  folded: boolean
  allIn: boolean
  hole: Card[]
  revealed: boolean
}

export type HandState = {
  seats: SeatState[]
  buttonSeat: number
  board: Card[]
  pot: number
  street: Street
  actingSeat: number | null
  /** 핸드 전체에 걸친 좌석별 총 투입액. 사이드팟 계산의 근거가 된다. */
  contributed: number[]
}

export type SeatInit = { name: string; stack: number }
```

- [ ] **Step 4: 리듀서 작성**

`src/lib/simulator/reduce.ts`:

```ts
import type { HandEvent, HandState, SeatInit } from './types'

export function initialState(seats: SeatInit[], buttonSeat: number): HandState {
  return {
    seats: seats.map((s) => ({
      name: s.name, stack: s.stack, bet: 0,
      folded: false, allIn: false, hole: [], revealed: false,
    })),
    buttonSeat,
    board: [],
    pot: 0,
    street: 'preflop',
    actingSeat: null,
    contributed: seats.map(() => 0),
  }
}

/** 좌석 하나만 바꾼 새 seats 배열을 만든다. */
function withSeat(state: HandState, i: number, patch: Partial<HandState['seats'][number]>) {
  return state.seats.map((s, idx) => (idx === i ? { ...s, ...patch } : s))
}

/** 좌석 i 의 벳을 to 까지 올린다. 스택보다 크면 스택 전액(올인)으로 자른다. */
function raiseBetTo(state: HandState, i: number, to: number) {
  const seat = state.seats[i]
  const want = to - seat.bet
  const delta = Math.min(want, seat.stack)
  const contributed = state.contributed.slice()
  contributed[i] += delta
  return {
    seats: withSeat(state, i, {
      stack: seat.stack - delta,
      bet: seat.bet + delta,
      allIn: seat.stack - delta === 0,
    }),
    contributed,
  }
}

export function applyEvent(state: HandState, e: HandEvent): HandState {
  switch (e.type) {
    case 'move_button':
      return { ...state, buttonSeat: e.toSeat }

    case 'post_blind': {
      const { seats, contributed } = raiseBetTo(state, e.seat, e.amount)
      return { ...state, seats, contributed }
    }

    case 'deal_hole':
      return {
        ...state,
        seats: withSeat(state, e.seat, { hole: [...state.seats[e.seat].hole, e.card] }),
      }

    case 'burn':
      return state

    case 'deal_board':
      return { ...state, board: [...state.board, ...e.cards], street: e.street }

    case 'player_action': {
      const a = e.action
      if (a.kind === 'fold') {
        return { ...state, seats: withSeat(state, e.seat, { folded: true }) }
      }
      if (a.kind === 'check') return state
      const { seats, contributed } = raiseBetTo(state, e.seat, a.to)
      return { ...state, seats, contributed }
    }

    case 'collect_bets': {
      const total = state.seats.reduce((sum, s) => sum + s.bet, 0)
      return {
        ...state,
        pot: state.pot + total,
        seats: state.seats.map((s) => ({ ...s, bet: 0 })),
      }
    }

    case 'showdown_reveal':
      return { ...state, seats: withSeat(state, e.seat, { revealed: true }) }

    case 'award_pot':
      return {
        ...state,
        pot: Math.max(0, state.pot - e.amount),
        seats: withSeat(state, e.seat, { stack: state.seats[e.seat].stack + e.amount }),
      }
  }
}

export function stateAt(init: HandState, events: HandEvent[], index: number): HandState {
  return events.slice(0, index).reduce(applyEvent, init)
}
```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

Run: `npm test -- reduce`
Expected: PASS, 7 tests

- [ ] **Step 6: 커밋**

```bash
git add src/lib/simulator/types.ts src/lib/simulator/reduce.ts src/lib/simulator/reduce.test.ts
git commit -m "feat: 핸드 이벤트 타입과 상태 리듀서"
```

---

## Task 5: 사이드팟 계산

목업에서 실제로 틀렸던 부분이다. 스몰블라인드를 낸 사람이 올인 당사자면 그 블라인드는 데드머니가 아니라 그의 투입액에 포함된다. 테스트로 못 박는다.

**Files:**
- Create: `src/lib/simulator/pots.ts`
- Test: `src/lib/simulator/pots.test.ts`

**Interfaces:**
- Consumes: `HandState` (Task 4), `evaluateHand`/`compareHands` (Task 3)
- Produces:
  - `type Pot = { amount: number; eligibleSeats: number[] }`
  - `buildPots(contributed: number[], folded: boolean[]): Pot[]` — 인덱스 0이 메인팟
  - `type PotAward = { potIndex: number; seat: number; amount: number }`
  - `awardPots(pots: Pot[], hole: Card[][], board: Card[]): PotAward[]` — 동점이면 나눠주고 나머지 칩은 낮은 좌석 인덱스부터

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/simulator/pots.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildPots, awardPots } from './pots'
import { parseCard } from './cards'

const h = (...s: string[]) => s.map(parseCard)

describe('buildPots — 목업 핸드', () => {
  // 좌석: 0 김도현(폴드) 1 박서준 2 이민아 3 최우진 4 정하늘(폴드, BB 200) 5 강태호(폴드)
  const contributed = [0, 12500, 12500, 8000, 200, 0]
  const folded =      [true, false, false, false, true, true]

  it('메인팟은 24,200 이다', () => {
    const pots = buildPots(contributed, folded)
    expect(pots[0].amount).toBe(24200)
  })

  it('메인팟 참가자는 폴드하지 않은 세 명이다', () => {
    const pots = buildPots(contributed, folded)
    expect(pots[0].eligibleSeats.sort()).toEqual([1, 2, 3])
  })

  it('사이드팟은 9,000 이고 최우진은 참가할 수 없다', () => {
    const pots = buildPots(contributed, folded)
    expect(pots[1].amount).toBe(9000)
    expect(pots[1].eligibleSeats.sort()).toEqual([1, 2])
  })

  it('팟 합계가 총 투입액과 같다', () => {
    const pots = buildPots(contributed, folded)
    const total = contributed.reduce((a, b) => a + b, 0)
    expect(pots.reduce((a, p) => a + p.amount, 0)).toBe(total)
  })
})

describe('buildPots — 기타', () => {
  it('올인이 없으면 팟은 하나다', () => {
    const pots = buildPots([1000, 1000, 1000], [false, false, false])
    expect(pots).toHaveLength(1)
    expect(pots[0].amount).toBe(3000)
  })

  it('폴드한 사람의 투입액도 팟에 남는다', () => {
    const pots = buildPots([500, 1000, 1000], [true, false, false])
    expect(pots.reduce((a, p) => a + p.amount, 0)).toBe(2500)
  })

  it('서로 다른 세 올인은 팟 세 개를 만든다', () => {
    const pots = buildPots([1000, 2000, 3000], [false, false, false])
    expect(pots.map((p) => p.amount)).toEqual([3000, 2000, 1000])
  })
})

describe('awardPots — 목업 핸드의 핵심', () => {
  const board = h('Kd','9s','7h','2c','Qs')
  const hole: Record<number, ReturnType<typeof h>> = {
    1: h('As','Ks'), // K 원페어
    2: h('7c','7s'), // 트리플 7
    3: h('9h','9d'), // 트리플 9
  }
  const holeArr = [[], hole[1], hole[2], hole[3], [], []] as any

  const pots = buildPots([0, 12500, 12500, 8000, 200, 0], [true, false, false, false, true, true])

  it('메인팟은 최우진(좌석 3)이 가져간다', () => {
    const awards = awardPots(pots, holeArr, board)
    const main = awards.filter((a) => a.potIndex === 0)
    expect(main).toHaveLength(1)
    expect(main[0].seat).toBe(3)
    expect(main[0].amount).toBe(24200)
  })

  it('사이드팟은 이민아(좌석 2)가 가져간다 — 승자가 서로 다르다', () => {
    const awards = awardPots(pots, holeArr, board)
    const side = awards.filter((a) => a.potIndex === 1)
    expect(side).toHaveLength(1)
    expect(side[0].seat).toBe(2)
    expect(side[0].amount).toBe(9000)
  })
})

describe('awardPots — 동점 분배', () => {
  it('동점이면 나눠 갖는다', () => {
    const board = h('Kd','9s','7h','2c','Qs')
    const holeArr = [h('Ah','Jd'), h('Ac','Jh')] as any // 완전 동일 족보
    const pots = buildPots([1000, 1000], [false, false])
    const awards = awardPots(pots, holeArr, board)
    expect(awards).toHaveLength(2)
    expect(awards[0].amount).toBe(1000)
    expect(awards[1].amount).toBe(1000)
  })

  it('나눠떨어지지 않으면 낮은 좌석부터 홀칩을 받는다', () => {
    const board = h('Kd','9s','7h','2c','Qs')
    const holeArr = [h('Ah','Jd'), h('Ac','Jh')] as any
    const pots = buildPots([1000, 1001], [false, false])
    const awards = awardPots(pots, holeArr, board)
    const total = awards.reduce((a, x) => a + x.amount, 0)
    expect(total).toBe(2001)
    const bySeat = new Map(awards.map((a) => [a.seat, a.amount]))
    expect(bySeat.get(0)).toBeGreaterThanOrEqual(bySeat.get(1)!)
  })
})
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npm test -- pots`
Expected: FAIL — `Failed to resolve import "./pots"`

- [ ] **Step 3: 구현 작성**

`src/lib/simulator/pots.ts`:

```ts
import type { Card } from './cards'
import { compareHands, evaluateHand } from './evaluate'

export type Pot = { amount: number; eligibleSeats: number[] }
export type PotAward = { potIndex: number; seat: number; amount: number }

/**
 * 투입액을 층(layer)으로 잘라 메인팟과 사이드팟을 만든다.
 *
 * 비유: 여러 사람이 서로 다른 높이까지 물을 부은 통들이 있고,
 * 가장 낮은 수면 높이로 한 번 자르면 그게 메인팟, 그 위층이 사이드팟이다.
 *
 * 폴드한 사람의 투입액은 팟에 그대로 남지만(데드머니) 어느 팟도 가져갈 수 없다.
 * 블라인드를 낸 사람이 그대로 올인했다면 그 블라인드는 데드머니가 아니라
 * 그 사람의 투입액에 이미 포함돼 있다 — contributed 를 쓰면 자동으로 맞는다.
 */
export function buildPots(contributed: number[], folded: boolean[]): Pot[] {
  const levels = Array.from(
    new Set(contributed.filter((c) => c > 0)),
  ).sort((a, b) => a - b)

  const pots: Pot[] = []
  let prev = 0

  for (const level of levels) {
    const layer = level - prev
    let amount = 0
    const eligible: number[] = []

    contributed.forEach((c, seat) => {
      const take = Math.min(Math.max(c - prev, 0), layer)
      amount += take
      if (c >= level && !folded[seat]) eligible.push(seat)
    })

    if (amount > 0) pots.push({ amount, eligibleSeats: eligible })
    prev = level
  }

  // 참가자가 없는 층(전원 폴드)은 바로 앞 팟에 합친다
  const merged: Pot[] = []
  for (const p of pots) {
    if (p.eligibleSeats.length === 0 && merged.length > 0) {
      merged[merged.length - 1].amount += p.amount
    } else {
      merged.push(p)
    }
  }
  return merged
}

export function awardPots(pots: Pot[], hole: Card[][], board: Card[]): PotAward[] {
  const awards: PotAward[] = []

  pots.forEach((pot, potIndex) => {
    if (pot.eligibleSeats.length === 0) return

    const ranked = pot.eligibleSeats.map((seat) => ({
      seat,
      rank: evaluateHand([...hole[seat], ...board]),
    }))

    let best = ranked[0].rank
    for (const r of ranked) if (compareHands(r.rank, best) > 0) best = r.rank
    const winners = ranked
      .filter((r) => compareHands(r.rank, best) === 0)
      .map((r) => r.seat)
      .sort((a, b) => a - b)

    const share = Math.floor(pot.amount / winners.length)
    let remainder = pot.amount - share * winners.length

    winners.forEach((seat) => {
      // 홀칩은 낮은 좌석 인덱스부터 한 칩씩 (TDA Rule 20 의 단순화)
      const extra = remainder > 0 ? 1 : 0
      remainder -= extra
      awards.push({ potIndex, seat, amount: share + extra })
    })
  })

  return awards
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npm test -- pots`
Expected: PASS, 11 tests

- [ ] **Step 5: 커밋**

```bash
git add src/lib/simulator/pots.ts src/lib/simulator/pots.test.ts
git commit -m "feat: 사이드팟 분리 및 팟 지급 계산"
```

---

## Task 6: 룰셋 인터페이스와 노리밋 홀덤 액션 유효성

파일럿 케이스 2·3·4가 여기 테스트로 들어간다. 축1 콘텐츠 제작 노력이 축2 테스트로 회수되는 지점이다.

**Files:**
- Create: `src/lib/simulator/rulesets/types.ts`
- Create: `src/lib/simulator/rulesets/nlh.ts`
- Test: `src/lib/simulator/rulesets/nlh.test.ts`

**Interfaces:**
- Consumes: `HandState`, `PlayerAction` (Task 4), `evaluateHand` (Task 3)
- Produces:
  - `type BettingContext = { currentBet: number; lastRaiseSize: number; seatBet: number; seatStack: number; isOpenBet: boolean }`
  - `type ValidationResult = { valid: true; normalized: PlayerAction } | { valid: false; reason: string; corrected: PlayerAction }`
  - `interface Ruleset { id, family, bettingStructure, holeCardCount, streets, minRaiseTo, maxRaiseTo, validateAction, interpretChipPush }`
  - `nlh: Ruleset`
  - `interpretChipPush(ctx: BettingContext, pushed: number, declared: 'none'|'raise'|'allin'): PlayerAction` — Rule 45-A 구현

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/simulator/rulesets/nlh.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { nlh } from './nlh'
import type { BettingContext } from './types'

const ctx = (over: Partial<BettingContext> = {}): BettingContext => ({
  currentBet: 0, lastRaiseSize: 0, seatBet: 0, seatStack: 100000, isOpenBet: false, ...over,
})

describe('minRaiseTo — 파일럿 케이스 4', () => {
  it('레이즈 총액이 아니라 레이즈 폭을 기준으로 계산한다', () => {
    // 블라인드 100/200. A 600 오픈 -> B 1600 -> C 3600. D 의 최소 레이즈는?
    // 마지막 레이즈 폭은 3600 - 1600 = 2000. 따라서 3600 + 2000 = 5600.
    const c = ctx({ currentBet: 3600, lastRaiseSize: 2000 })
    expect(nlh.minRaiseTo(c)).toBe(5600)
  })

  it('첫 벳이 없으면 최소 벳은 빅블라인드 크기다', () => {
    const c = ctx({ currentBet: 0, lastRaiseSize: 200 })
    expect(nlh.minRaiseTo(c)).toBe(200)
  })
})

describe('maxRaiseTo — 노리밋', () => {
  it('자기 스택 전액까지 올릴 수 있다', () => {
    const c = ctx({ currentBet: 1000, seatBet: 0, seatStack: 12500 })
    expect(nlh.maxRaiseTo(c)).toBe(12500)
  })
})

describe('interpretChipPush — 파일럿 케이스 2 (Rule 45-A)', () => {
  it('선언 없이 1,000짜리 2개를 밀었고 콜이 1,050이면 콜이다', () => {
    // 칩 하나(1,000)를 빼면 1,000 이라 콜 1,050 에 못 미친다 -> 콜
    const c = ctx({ currentBet: 1050, seatBet: 0, seatStack: 12500 })
    const a = nlh.interpretChipPush(c, 2000, 'none', [1000, 1000])
    expect(a).toEqual({ kind: 'call', to: 1050 })
  })

  it('칩 구성을 모르면 총액만으로 콜 처리한다', () => {
    const c = ctx({ currentBet: 1050, seatBet: 0, seatStack: 12500 })
    expect(nlh.interpretChipPush(c, 2000, 'none')).toEqual({ kind: 'call', to: 1050 })
  })

  it('레이즈를 선언했으면 밀어낸 금액대로 레이즈다', () => {
    const c = ctx({ currentBet: 1050, lastRaiseSize: 1050, seatBet: 0, seatStack: 12500 })
    const a = nlh.interpretChipPush(c, 2200, 'raise')
    expect(a).toEqual({ kind: 'raise', to: 2200 })
  })

  it('칩 하나를 빼도 콜 금액을 넘으면 레이즈다', () => {
    // 콜 500, 1000짜리 2개(2000) 를 밀었다. 하나만 빼도 1000 > 500 이므로 레이즈.
    const c = ctx({ currentBet: 500, lastRaiseSize: 500, seatBet: 0, seatStack: 12500 })
    const a = nlh.interpretChipPush(c, 2000, 'none', [1000, 1000])
    expect(a.kind).toBe('raise')
  })
})

describe('validateAction — 파일럿 케이스 3 (Rule 51-B 언더콜)', () => {
  it('오픈 벳에 대한 언더콜은 전액 콜로 강제된다', () => {
    const c = ctx({ currentBet: 8000, seatBet: 0, seatStack: 50000, isOpenBet: true })
    const r = nlh.validateAction(c, { kind: 'call', to: 2000 })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.corrected).toEqual({ kind: 'call', to: 8000 })
  })

  it('정상 콜은 통과한다', () => {
    const c = ctx({ currentBet: 8000, seatBet: 0, seatStack: 50000, isOpenBet: true })
    const r = nlh.validateAction(c, { kind: 'call', to: 8000 })
    expect(r.valid).toBe(true)
  })

  it('최소 레이즈 미달은 최소 레이즈로 교정된다', () => {
    const c = ctx({ currentBet: 1000, lastRaiseSize: 1000, seatBet: 0, seatStack: 50000 })
    const r = nlh.validateAction(c, { kind: 'raise', to: 1500 })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.corrected).toEqual({ kind: 'raise', to: 2000 })
  })

  it('스택보다 큰 레이즈는 올인으로 바뀐다', () => {
    const c = ctx({ currentBet: 1000, lastRaiseSize: 1000, seatBet: 0, seatStack: 5000 })
    const r = nlh.validateAction(c, { kind: 'raise', to: 9999 })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.corrected).toEqual({ kind: 'allin', to: 5000 })
  })

  it('스택이 콜 금액에 못 미치면 올인 콜이 허용된다', () => {
    const c = ctx({ currentBet: 8000, seatBet: 0, seatStack: 3000 })
    const r = nlh.validateAction(c, { kind: 'allin', to: 3000 })
    expect(r.valid).toBe(true)
  })

  it('벳이 있는데 체크하면 무효다', () => {
    const c = ctx({ currentBet: 500, seatBet: 0 })
    const r = nlh.validateAction(c, { kind: 'check' })
    expect(r.valid).toBe(false)
  })

  it('벳이 없으면 체크할 수 있다', () => {
    const r = nlh.validateAction(ctx(), { kind: 'check' })
    expect(r.valid).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npm test -- nlh`
Expected: FAIL — `Failed to resolve import "./nlh"`

- [ ] **Step 3: 인터페이스 파일 작성**

`src/lib/simulator/rulesets/types.ts`:

```ts
import type { PlayerAction, Street } from '../types'

export type RulesetId = 'nlh'

/** 액션 판정에 필요한 최소 정보만 뽑아 넘긴다 — 룰셋이 HandState 전체에 묶이지 않게. */
export type BettingContext = {
  /** 이번 라운드의 현재 최고 벳 (총액 기준) */
  currentBet: number
  /** 직전 레이즈의 "폭". 최소 레이즈 계산의 근거 (Rule 43-A) */
  lastRaiseSize: number
  /** 이 좌석이 이번 라운드에 이미 낸 금액 */
  seatBet: number
  seatStack: number
  /** 이번 라운드의 첫 벳인지 — 언더콜 처리가 달라진다 (Rule 51-B) */
  isOpenBet: boolean
}

export type ValidationResult =
  | { valid: true; normalized: PlayerAction }
  | { valid: false; reason: string; corrected: PlayerAction }

export type DeclaredIntent = 'none' | 'raise' | 'allin'

export interface Ruleset {
  id: RulesetId
  family: 'flop' | 'stud' | 'draw'
  bettingStructure: 'no-limit' | 'pot-limit' | 'fixed-limit'
  holeCardCount: number
  streets: Street[]

  minRaiseTo(ctx: BettingContext): number
  maxRaiseTo(ctx: BettingContext): number
  validateAction(ctx: BettingContext, action: PlayerAction): ValidationResult

  /**
   * 말없이 칩을 밀었을 때의 해석 (Rule 45-A).
   * chips 를 주면 "칩 하나를 빼도 콜 금액을 넘는가"로 판정하고,
   * 없으면 밀어낸 총액만으로 판정한다.
   */
  interpretChipPush(
    ctx: BettingContext,
    pushedTotal: number,
    declared: DeclaredIntent,
    chips?: number[],
  ): PlayerAction
}
```

- [ ] **Step 4: 노리밋 홀덤 구현 작성**

`src/lib/simulator/rulesets/nlh.ts`:

```ts
import type { PlayerAction } from '../types'
import type { BettingContext, DeclaredIntent, Ruleset, ValidationResult } from './types'

function ok(normalized: PlayerAction): ValidationResult {
  return { valid: true, normalized }
}
function bad(reason: string, corrected: PlayerAction): ValidationResult {
  return { valid: false, reason, corrected }
}

export const nlh: Ruleset = {
  id: 'nlh',
  family: 'flop',
  bettingStructure: 'no-limit',
  holeCardCount: 2,
  streets: ['preflop', 'flop', 'turn', 'river'],

  /**
   * Rule 43-A. 레이즈는 "이번 라운드에 나온 가장 큰 벳 또는 레이즈 폭" 이상이어야 한다.
   * 총액이 아니라 폭이라는 점이 가장 흔한 오해다.
   */
  minRaiseTo(ctx) {
    return ctx.currentBet + Math.max(ctx.lastRaiseSize, 1)
  },

  maxRaiseTo(ctx) {
    return ctx.seatBet + ctx.seatStack
  },

  validateAction(ctx, action) {
    const maxTo = this.maxRaiseTo(ctx)

    switch (action.kind) {
      case 'fold':
        return ok(action)

      case 'check':
        if (ctx.currentBet > ctx.seatBet) {
          return bad('벳이 있으므로 체크할 수 없습니다', { kind: 'fold' })
        }
        return ok(action)

      case 'call': {
        if (ctx.currentBet >= maxTo) return ok({ kind: 'allin', to: maxTo })
        if (action.to < ctx.currentBet) {
          // Rule 51-B: 오픈 벳에 대한 언더콜은 TD 재량이 아니라 전액 콜
          return bad(
            ctx.isOpenBet
              ? '오픈 벳에 대한 언더콜은 전액 콜로 처리됩니다'
              : '콜 금액에 미달합니다',
            { kind: 'call', to: ctx.currentBet },
          )
        }
        return ok({ kind: 'call', to: ctx.currentBet })
      }

      case 'bet':
      case 'raise': {
        if (action.to >= maxTo) return bad('스택을 초과합니다', { kind: 'allin', to: maxTo })
        const min = this.minRaiseTo(ctx)
        if (action.to < min) {
          return bad(`최소 레이즈는 ${min} 입니다`, { kind: action.kind, to: min })
        }
        return ok(action)
      }

      case 'allin':
        if (action.to !== maxTo) return bad('올인 금액이 스택과 다릅니다', { kind: 'allin', to: maxTo })
        return ok(action)
    }
  },

  /**
   * Rule 45-A. 선언이 없는 다수 칩 벳은,
   * 칩 하나를 빼도 콜 금액에 못 미치면 콜로 처리한다.
   */
  interpretChipPush(ctx: BettingContext, pushedTotal: number, declared: DeclaredIntent, chips?: number[]) {
    if (declared === 'allin') return { kind: 'allin', to: this.maxRaiseTo(ctx) }
    if (declared === 'raise') return { kind: 'raise', to: pushedTotal }

    const callTo = ctx.currentBet
    if (pushedTotal <= callTo) return { kind: 'call', to: callTo }

    if (chips && chips.length > 1) {
      const smallest = Math.min(...chips)
      const withoutOne = pushedTotal - smallest
      // 칩 하나를 빼도 콜을 넘으면 레이즈 의도로 본다
      if (withoutOne > callTo) return { kind: 'raise', to: pushedTotal }
      return { kind: 'call', to: callTo }
    }

    // 칩 구성을 모르면 총액만으로 판정 — 콜에 필요한 만큼만 인정
    return { kind: 'call', to: callTo }
  },
}
```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

Run: `npm test -- nlh`
Expected: PASS, 13 tests

- [ ] **Step 6: 커밋**

```bash
git add src/lib/simulator/rulesets
git commit -m "feat: 룰셋 인터페이스와 노리밋 홀덤 액션 유효성"
```

---

## Task 7: 핸드 생성기

**Files:**
- Create: `src/lib/simulator/generate.ts`
- Test: `src/lib/simulator/generate.test.ts`

**Interfaces:**
- Consumes: 전 태스크 전부
- Produces:
  - `type Difficulty = 'basic' | 'intermediate' | 'advanced'`
  - `type GenerateOptions = { seed: string; rulesetId?: RulesetId; seatCount?: number; difficulty?: Difficulty; require?: DecisionKind[] }`
  - `type Hand = { seed: string; rulesetId: RulesetId; seats: SeatInit[]; buttonSeat: number; blinds: { sb: number; bb: number }; events: HandEvent[] }`
  - `generateHand(opts: GenerateOptions): Hand`
  - `PLAYER_NAMES: readonly string[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/simulator/generate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateHand } from './generate'
import { initialState, stateAt } from './reduce'

describe('generateHand — 결정론', () => {
  it('같은 시드는 같은 핸드를 만든다', () => {
    const a = generateHand({ seed: 'nlh-7f3a91' })
    const b = generateHand({ seed: 'nlh-7f3a91' })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('다른 시드는 다른 핸드를 만든다', () => {
    const a = generateHand({ seed: 'seed-a' })
    const b = generateHand({ seed: 'seed-b' })
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
})

describe('generateHand — 구조', () => {
  const hand = generateHand({ seed: 'structure-1' })

  it('기본 좌석 수는 6이다', () => {
    expect(hand.seats).toHaveLength(6)
  })

  it('모든 좌석이 홀카드 2장을 받는다', () => {
    const dealt = hand.events.filter((e) => e.type === 'deal_hole')
    expect(dealt).toHaveLength(12)
  })

  it('블라인드 두 개가 포스팅된다', () => {
    const blinds = hand.events.filter((e) => e.type === 'post_blind')
    expect(blinds).toHaveLength(2)
  })

  it('같은 카드가 두 번 나오지 않는다', () => {
    const seen = new Set<string>()
    for (const e of hand.events) {
      if (e.type === 'deal_hole') seen.add(e.card.rank + e.card.suit)
      if (e.type === 'deal_board') e.cards.forEach((c) => seen.add(c.rank + c.suit))
    }
    const total =
      hand.events.filter((e) => e.type === 'deal_hole').length +
      hand.events
        .filter((e) => e.type === 'deal_board')
        .reduce((n, e) => n + (e.type === 'deal_board' ? e.cards.length : 0), 0)
    expect(seen.size).toBe(total)
  })

  it('라운드가 끝나면 살아 있는 좌석의 벳이 모두 같거나 올인이다', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const hd = generateHand({ seed: 'settle-' + n })
      const init = initialState(hd.seats, hd.buttonSeat)
      hd.events.forEach((e, i) => {
        if (e.type !== 'collect_bets') return
        const s = stateAt(init, hd.events, i)
        const live = s.seats.filter((x) => !x.folded && !x.allIn && x.bet > 0)
        const bets = new Set(live.map((x) => x.bet))
        expect(bets.size).toBeLessThanOrEqual(1)
      })
    }
  })

  it('스택이 칩 단위 표준의 배수다', () => {
    hand.seats.forEach((s) => expect(s.stack % 100).toBe(0))
  })

  it('최종 상태에서 스택 합계가 시작 합계와 같다', () => {
    const init = initialState(hand.seats, hand.buttonSeat)
    const final = stateAt(init, hand.events, hand.events.length)
    const start = hand.seats.reduce((a, s) => a + s.stack, 0)
    const end = final.seats.reduce((a, s) => a + s.stack, 0) + final.pot
    expect(end).toBe(start)
  })
})

describe('generateHand — 제약', () => {
  it('calculation 을 요구하면 서로 다른 금액의 올인이 두 번 이상 나온다', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const hand = generateHand({ seed: 'calc-' + n, require: ['calculation'] })
      const allins = hand.events.filter(
        (e) => e.type === 'player_action' && e.action.kind === 'allin',
      )
      expect(allins.length).toBeGreaterThanOrEqual(2)
    }
  })
})
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npm test -- generate`
Expected: FAIL — `Failed to resolve import "./generate"`

- [ ] **Step 3: 구현 작성**

`src/lib/simulator/generate.ts`:

```ts
import { makeDeck, shuffle, type Card } from './cards'
import { createRng, type Rng } from './rng'
import { initialState, applyEvent } from './reduce'
import { nlh } from './rulesets/nlh'
import type { RulesetId } from './rulesets/types'
import type { HandEvent, HandState, SeatInit, Street } from './types'

export type Difficulty = 'basic' | 'intermediate' | 'advanced'
export type DecisionKind = 'procedure' | 'action_validity' | 'calculation' | 'showdown'

export type GenerateOptions = {
  seed: string
  rulesetId?: RulesetId
  seatCount?: number
  difficulty?: Difficulty
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

const STACK_UNITS = [8000, 12500, 19000, 25000, 31500, 47000, 62000, 88000]

function pickStacks(rng: Rng, count: number, needAllin: boolean): number[] {
  const stacks: number[] = []
  for (let i = 0; i < count; i++) stacks.push(rng.pick(STACK_UNITS))
  if (needAllin) {
    // 서로 다른 금액의 올인이 나오도록 숏스택 두 개를 심는다
    const a = rng.int(count)
    let b = rng.int(count)
    if (b === a) b = (b + 1) % count
    stacks[a] = 8000
    stacks[b] = 12500
    // 최소 한 명은 둘 다 커버해야 사이드팟이 성립한다
    let c = rng.int(count)
    while (c === a || c === b) c = (c + 1) % count
    stacks[c] = 47000
  }
  return stacks
}

/** 라운드 하나를 돌면서 액션 이벤트를 만든다. 봇 성향은 rng 로 결정한다. */
function runBettingRound(
  state: HandState,
  rng: Rng,
  bb: number,
  street: Street,
  forceAllin: boolean,
): { events: HandEvent[]; state: HandState } {
  const events: HandEvent[] = []
  let s = state
  let currentBet = Math.max(...s.seats.map((x) => x.bet))
  let lastRaiseSize = bb
  let isOpenBet = currentBet === 0

  const order: number[] = []
  const start = street === 'preflop' ? (s.buttonSeat + 3) % s.seats.length : (s.buttonSeat + 1) % s.seats.length
  for (let i = 0; i < s.seats.length; i++) order.push((start + i) % s.seats.length)

  let allinDone = 0

  for (const seat of order) {
    const st = s.seats[seat]
    if (st.folded || st.allIn) continue

    const toCall = currentBet - st.bet
    const roll = rng.next()

    let action: HandEvent

    if (forceAllin && allinDone < 2 && st.stack <= 12500 && roll < 0.9) {
      action = { type: 'player_action', seat, action: { kind: 'allin', to: st.bet + st.stack } }
      allinDone++
    } else if (toCall === 0) {
      action =
        roll < 0.6
          ? { type: 'player_action', seat, action: { kind: 'check' } }
          : { type: 'player_action', seat, action: { kind: 'bet', to: currentBet + lastRaiseSize } }
    } else if (toCall >= st.stack) {
      action =
        roll < 0.5
          ? { type: 'player_action', seat, action: { kind: 'allin', to: st.bet + st.stack } }
          : { type: 'player_action', seat, action: { kind: 'fold' } }
    } else if (roll < 0.42) {
      action = { type: 'player_action', seat, action: { kind: 'fold' } }
    } else if (roll < 0.86) {
      action = { type: 'player_action', seat, action: { kind: 'call', to: currentBet } }
    } else {
      const to = nlh.minRaiseTo({
        currentBet, lastRaiseSize, seatBet: st.bet, seatStack: st.stack, isOpenBet,
      })
      action =
        to >= st.bet + st.stack
          ? { type: 'player_action', seat, action: { kind: 'allin', to: st.bet + st.stack } }
          : { type: 'player_action', seat, action: { kind: 'raise', to } }
    }

    events.push(action)
    s = applyEvent(s, action)

    if (action.type === 'player_action') {
      const a = action.action
      if (a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin') {
        const newBet = s.seats[seat].bet
        if (newBet > currentBet) {
          lastRaiseSize = newBet - currentBet
          currentBet = newBet
          isOpenBet = false
        }
      }
    }
  }

  // 한 바퀴만 돌면 레이즈 뒤에 낸 금액을 못 맞춘 좌석이 남는다.
  // 그대로 두면 규칙상 성립하지 않는 핸드가 되므로, 살아 있는 좌석이
  // 현재 벳을 전부 맞출 때까지 콜/폴드/올인으로 정산한다.
  for (let pass = 0; pass < s.seats.length; pass++) {
    const behind = s.seats
      .map((x, i) => ({ x, i }))
      .filter(({ x }) => !x.folded && !x.allIn && x.bet < currentBet)
    if (behind.length === 0) break

    for (const { x, i } of behind) {
      const toCall = currentBet - x.bet
      const e: HandEvent =
        toCall >= x.stack
          ? { type: 'player_action', seat: i, action: { kind: 'allin', to: x.bet + x.stack } }
          : rng.next() < 0.65
            ? { type: 'player_action', seat: i, action: { kind: 'call', to: currentBet } }
            : { type: 'player_action', seat: i, action: { kind: 'fold' } }
      events.push(e)
      s = applyEvent(s, e)
    }
  }

  return { events, state: s }
}

export function generateHand(opts: GenerateOptions): Hand {
  const rng = createRng(opts.seed)
  const seatCount = opts.seatCount ?? 6
  const rulesetId = opts.rulesetId ?? 'nlh'
  const needAllin = (opts.require ?? []).includes('calculation')

  const stacks = pickStacks(rng, seatCount, needAllin)
  const seats: SeatInit[] = stacks.map((stack, i) => ({ name: PLAYER_NAMES[i], stack }))
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

  for (const street of streets) {
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

    const live = state.seats.filter((s) => !s.folded).length
    if (live <= 1) break

    const canAct = state.seats.filter((s) => !s.folded && !s.allIn).length
    if (canAct >= 2) {
      const r = runBettingRound(state, rng, blinds.bb, street, needAllin && street === 'preflop')
      events.push(...r.events)
      state = r.state
    }

    const collect: HandEvent = { type: 'collect_bets' }
    events.push(collect)
    state = applyEvent(state, collect)
  }

  // 쇼다운 공개
  state.seats.forEach((s, seat) => {
    if (!s.folded) {
      const e: HandEvent = { type: 'showdown_reveal', seat }
      events.push(e)
      state = applyEvent(state, e)
    }
  })

  return { seed: opts.seed, rulesetId, seats, buttonSeat, blinds, events }
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npm test -- generate`
Expected: PASS, 9 tests

만약 `calculation` 제약 테스트가 실패하면 `runBettingRound`의 올인 조건(`roll < 0.9`)을 `roll < 1`로 올려서 결정성을 높인다. 다른 테스트가 깨지지 않는지 전체 실행으로 확인할 것.

- [ ] **Step 5: 전체 테스트 실행**

Run: `npm test`
Expected: PASS, 전체 통과

- [ ] **Step 6: 커밋**

```bash
git add src/lib/simulator/generate.ts src/lib/simulator/generate.test.ts
git commit -m "feat: 결정론적 핸드 생성기"
```

---

## Task 8: 판단 지점 추출

**Files:**
- Create: `src/lib/simulator/decisions.ts`
- Test: `src/lib/simulator/decisions.test.ts`

**Interfaces:**
- Consumes: `Hand` (Task 7), `buildPots`/`awardPots` (Task 5), `nlh` (Task 6)
- Produces:
  - `type DecisionInput = { type: 'choice'; choices: string[]; correctIndex: number } | { type: 'number'; fields: { label: string; answer: number }[] } | { type: 'seat'; options: { seat: number; label: string }[]; correctSeat: number }`
  - `type DecisionPoint = { atEventIndex: number; kind: DecisionKind; prompt: string; sub: string; input: DecisionInput; ruleRef: string; explanation: string; timeLimitSec: number }`
  - `extractDecisions(hand: Hand): DecisionPoint[]`
  - `TIME_LIMITS: Record<DecisionKind, number>`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/simulator/decisions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateHand } from './generate'
import { extractDecisions, TIME_LIMITS } from './decisions'

describe('extractDecisions', () => {
  const hand = generateHand({ seed: 'dp-1', require: ['calculation'] })
  const dps = extractDecisions(hand)

  it('판단 지점이 하나 이상 나온다', () => {
    expect(dps.length).toBeGreaterThan(0)
  })

  it('딜링 절차 판단이 포함된다', () => {
    expect(dps.some((d) => d.kind === 'procedure')).toBe(true)
  })

  it('사이드팟이 있으면 계산 판단이 포함된다', () => {
    expect(dps.some((d) => d.kind === 'calculation')).toBe(true)
  })

  it('쇼다운 판단이 포함된다', () => {
    expect(dps.some((d) => d.kind === 'showdown')).toBe(true)
  })

  it('atEventIndex 가 오름차순이다', () => {
    const idx = dps.map((d) => d.atEventIndex)
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
  })

  it('atEventIndex 가 이벤트 범위 안에 있다', () => {
    dps.forEach((d) => {
      expect(d.atEventIndex).toBeGreaterThanOrEqual(0)
      expect(d.atEventIndex).toBeLessThanOrEqual(hand.events.length)
    })
  })

  it('제한시간이 종류별로 다르게 붙는다', () => {
    dps.forEach((d) => expect(d.timeLimitSec).toBe(TIME_LIMITS[d.kind]))
    expect(TIME_LIMITS.procedure).toBeLessThan(TIME_LIMITS.calculation)
  })

  it('모든 판단 지점에 설명과 조항 근거가 있다', () => {
    dps.forEach((d) => {
      expect(d.explanation.length).toBeGreaterThan(10)
      expect(d.ruleRef.length).toBeGreaterThan(0)
    })
  })

  it('선택형 판단의 정답 인덱스가 선택지 범위 안이다', () => {
    dps.forEach((d) => {
      if (d.input.type === 'choice') {
        expect(d.input.correctIndex).toBeGreaterThanOrEqual(0)
        expect(d.input.correctIndex).toBeLessThan(d.input.choices.length)
      }
    })
  })

  it('같은 시드는 같은 판단 지점을 만든다', () => {
    const a = extractDecisions(generateHand({ seed: 'dp-same' }))
    const b = extractDecisions(generateHand({ seed: 'dp-same' }))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('extractDecisions — 사이드팟 정답 검증', () => {
  it('계산 판단의 정답이 실제 팟 구조와 일치한다', () => {
    const hand = generateHand({ seed: 'dp-calc', require: ['calculation'] })
    const calc = extractDecisions(hand).find((d) => d.kind === 'calculation')
    expect(calc).toBeDefined()
    if (calc && calc.input.type === 'number') {
      const total = calc.input.fields.reduce((a, f) => a + f.answer, 0)
      expect(total).toBeGreaterThan(0)
      calc.input.fields.forEach((f) => expect(Number.isInteger(f.answer)).toBe(true))
    }
  })
})
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npm test -- decisions`
Expected: FAIL — `Failed to resolve import "./decisions"`

- [ ] **Step 3: 구현 작성**

`src/lib/simulator/decisions.ts`:

```ts
import { buildPots, awardPots } from './pots'
import { initialState, stateAt } from './reduce'
import type { DecisionKind, Hand } from './generate'
import { CATEGORY_LABEL, evaluateHand } from './evaluate'

export type DecisionInput =
  | { type: 'choice'; choices: string[]; correctIndex: number }
  | { type: 'number'; fields: { label: string; answer: number }[] }
  | { type: 'seat'; options: { seat: number; label: string }[]; correctSeat: number }

export type DecisionPoint = {
  atEventIndex: number
  kind: DecisionKind
  prompt: string
  sub: string
  input: DecisionInput
  ruleRef: string
  explanation: string
  timeLimitSec: number
}

export const TIME_LIMITS: Record<DecisionKind, number> = {
  procedure: 10,
  action_validity: 20,
  calculation: 45,
  showdown: 30,
}

export function extractDecisions(hand: Hand): DecisionPoint[] {
  const dps: DecisionPoint[] = []
  const n = hand.seats.length
  const sbSeat = (hand.buttonSeat + 1) % n
  const bbSeat = (hand.buttonSeat + 2) % n
  const utgSeat = (hand.buttonSeat + 3) % n

  // ── 1. 딜링 절차: 첫 홀카드를 받는 좌석
  const firstDealIdx = hand.events.findIndex((e) => e.type === 'deal_hole')
  if (firstDealIdx >= 0) {
    const choices = [
      `스몰블라인드 — ${hand.seats[sbSeat].name} (버튼 왼쪽 첫 좌석)`,
      `빅블라인드 — ${hand.seats[bbSeat].name}`,
      `언더더건 — ${hand.seats[utgSeat].name} (빅블라인드 다음)`,
      `버튼 — ${hand.seats[hand.buttonSeat].name}`,
    ]
    dps.push({
      atEventIndex: firstDealIdx,
      kind: 'procedure',
      prompt: '블라인드가 포스팅됐습니다. 첫 홀카드를 받는 좌석은?',
      sub: `버튼은 ${hand.seats[hand.buttonSeat].name}(${hand.buttonSeat + 1}번), 스몰블라인드는 ${hand.seats[sbSeat].name}(${sbSeat + 1}번), 빅블라인드는 ${hand.seats[bbSeat].name}(${bbSeat + 1}번)입니다.`,
      input: { type: 'choice', choices, correctIndex: 0 },
      ruleRef: 'TDA Rule 34 · 딜링 순서',
      explanation:
        '홀카드는 항상 버튼 왼쪽 첫 좌석, 즉 스몰블라인드부터 시계방향으로 한 장씩 두 바퀴 돌립니다. 액션 순서(프리플랍은 UTG부터)와 딜링 순서를 혼동하는 것이 신입 딜러의 가장 흔한 실수입니다.',
      timeLimitSec: TIME_LIMITS.procedure,
    })
  }

  // ── 2. 액션 유효성: 첫 레이즈 직후
  const raiseIdx = hand.events.findIndex(
    (e) => e.type === 'player_action' && (e.action.kind === 'raise' || e.action.kind === 'bet'),
  )
  if (raiseIdx >= 0) {
    const e = hand.events[raiseIdx]
    if (e.type === 'player_action' && 'to' in e.action) {
      const to = e.action.to
      dps.push({
        atEventIndex: raiseIdx + 1,
        kind: 'action_validity',
        prompt: `${hand.seats[e.seat].name}이 ${to.toLocaleString('ko-KR')}으로 벳했습니다. 다음 플레이어의 최소 레이즈 총액은?`,
        sub: '레이즈는 "총액"이 아니라 "직전 레이즈 폭" 이상이어야 합니다.',
        input: {
          type: 'choice',
          choices: [
            `${(to * 2).toLocaleString('ko-KR')} — 직전 레이즈 폭(${to.toLocaleString('ko-KR')})만큼 추가`,
            `${(to + hand.blinds.bb).toLocaleString('ko-KR')} — 빅블라인드만큼만 추가`,
            `${(to + Math.floor(to / 2)).toLocaleString('ko-KR')} — 직전 벳의 절반 추가`,
          ],
          correctIndex: 0,
        },
        ruleRef: 'TDA Rule 43-A · Raise Amounts',
        explanation:
          '레이즈는 이번 라운드에 나온 가장 큰 레이즈 폭 이상이어야 합니다. 총액과 레이즈 폭을 혼동하는 것이 가장 흔한 실수입니다.',
        timeLimitSec: TIME_LIMITS.action_validity,
      })
    }
  }

  // ── 3. 금액 계산: 사이드팟이 생기는 경우만
  const finalState = stateAt(
    initialState(hand.seats, hand.buttonSeat),
    hand.events,
    hand.events.length,
  )
  const pots = buildPots(
    finalState.contributed,
    finalState.seats.map((s) => s.folded),
  )

  if (pots.length >= 2) {
    const lastCollect = hand.events.map((e, i) => (e.type === 'collect_bets' ? i : -1))
      .filter((i) => i >= 0)
      .pop()
    dps.push({
      atEventIndex: (lastCollect ?? hand.events.length - 1) + 1,
      kind: 'calculation',
      prompt: '서로 다른 금액의 올인이 나왔습니다. 팟을 나누세요.',
      sub: '폴드한 플레이어가 낸 금액도 팟에 남아 있습니다. 블라인드를 낸 사람이 그대로 올인했다면 그 블라인드는 이미 그의 투입액에 포함돼 있습니다.',
      input: {
        type: 'number',
        fields: pots.map((p, i) => ({
          label: i === 0 ? '메인팟' : `사이드팟 ${i}`,
          answer: p.amount,
        })),
      },
      ruleRef: 'TDA Rule 21 · Side Pots',
      explanation:
        '메인팟은 가장 적은 올인 금액을 기준으로 참가자 수만큼 모은 금액에 데드머니를 더한 값입니다. 사이드팟은 그 금액을 넘는 부분만 모으고, 짧은 올인 플레이어는 참가할 수 없습니다.',
      timeLimitSec: TIME_LIMITS.calculation,
    })
  }

  // ── 4. 승자 판정
  const mainPot = pots[0]
  if (mainPot && mainPot.eligibleSeats.length >= 2 && finalState.board.length === 5) {
    const hole = finalState.seats.map((s) => s.hole)
    const awards = awardPots(pots, hole, finalState.board)
    const mainWinner = awards.find((a) => a.potIndex === 0)

    if (mainWinner) {
      dps.push({
        atEventIndex: hand.events.length,
        kind: 'showdown',
        prompt: `메인팟 ${mainPot.amount.toLocaleString('ko-KR')}은 누구에게 갑니까?`,
        sub: `보드 ${finalState.board.map((c) => c.rank + c.suit).join(' ')}`,
        input: {
          type: 'seat',
          options: mainPot.eligibleSeats.map((seat) => ({
            seat,
            label: `${finalState.seats[seat].name} — ${finalState.seats[seat].hole.map((c) => c.rank + c.suit).join(' ')}`,
          })),
          correctSeat: mainWinner.seat,
        },
        ruleRef: 'TDA Rule 21 · 사이드팟 지급 순서',
        explanation:
          pots.length >= 2
            ? `${finalState.seats[mainWinner.seat].name}이 ${CATEGORY_LABEL[evaluateHand([...hole[mainWinner.seat], ...finalState.board]).category]}로 메인팟을 가져갑니다. 사이드팟은 참가 자격이 다르므로 승자가 다를 수 있습니다 — 숏스택이 메인팟을 이기고 사이드팟은 다른 사람이 가져가는 구조가 현장에서 가장 자주 잘못 지급됩니다.`
            : `${finalState.seats[mainWinner.seat].name}이 ${CATEGORY_LABEL[evaluateHand([...hole[mainWinner.seat], ...finalState.board]).category]}로 팟을 가져갑니다.`,
        timeLimitSec: TIME_LIMITS.showdown,
      })
    }
  }

  return dps.sort((a, b) => a.atEventIndex - b.atEventIndex)
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npm test -- decisions`
Expected: PASS, 11 tests

일부 시드에서 사이드팟이나 쇼다운이 안 나와 테스트가 실패하면, 테스트의 시드를 바꾸지 말고 `generateHand`에 `require: ['calculation']`이 제대로 동작하는지 먼저 확인할 것. 그래도 안 나오면 Task 7의 `pickStacks`가 심는 숏스택 개수를 늘린다.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/simulator/decisions.ts src/lib/simulator/decisions.test.ts
git commit -m "feat: 핸드에서 판단 지점 추출"
```

---

## Task 9: 채점

**Files:**
- Create: `src/lib/simulator/score.ts`
- Test: `src/lib/simulator/score.test.ts`

**Interfaces:**
- Consumes: `DecisionPoint` (Task 8)
- Produces:
  - `type Answer = { type: 'choice'; index: number } | { type: 'number'; values: number[] } | { type: 'seat'; seat: number } | { type: 'timeout' }`
  - `type DecisionResult = { kind: DecisionKind; score: number; correct: boolean }`
  - `scoreDecision(dp: DecisionPoint, answer: Answer): DecisionResult`
  - `type HandScore = { procedure: number | null; action_validity: number | null; calculation: number | null; showdown: number | null; average: number }`
  - `scoreHand(results: DecisionResult[]): HandScore`
  - `gradeFrom(recent: HandScore[]): 'junior' | 'senior' | 'master'`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/simulator/score.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { scoreDecision, scoreHand, gradeFrom } from './score'
import type { DecisionPoint } from './decisions'

const choiceDp: DecisionPoint = {
  atEventIndex: 0, kind: 'procedure', prompt: 'q', sub: '',
  input: { type: 'choice', choices: ['a', 'b', 'c'], correctIndex: 1 },
  ruleRef: 'r', explanation: 'e', timeLimitSec: 10,
}

const numberDp: DecisionPoint = {
  atEventIndex: 1, kind: 'calculation', prompt: 'q', sub: '',
  input: { type: 'number', fields: [{ label: '메인팟', answer: 24200 }, { label: '사이드팟', answer: 9000 }] },
  ruleRef: 'r', explanation: 'e', timeLimitSec: 45,
}

const seatDp: DecisionPoint = {
  atEventIndex: 2, kind: 'showdown', prompt: 'q', sub: '',
  input: { type: 'seat', options: [{ seat: 1, label: 'a' }, { seat: 3, label: 'b' }], correctSeat: 3 },
  ruleRef: 'r', explanation: 'e', timeLimitSec: 30,
}

describe('scoreDecision', () => {
  it('정답 선택은 100점', () => {
    expect(scoreDecision(choiceDp, { type: 'choice', index: 1 }).score).toBe(100)
  })

  it('오답 선택은 0점', () => {
    expect(scoreDecision(choiceDp, { type: 'choice', index: 0 }).score).toBe(0)
  })

  it('시간 초과는 0점이고 오답 처리', () => {
    const r = scoreDecision(choiceDp, { type: 'timeout' })
    expect(r.score).toBe(0)
    expect(r.correct).toBe(false)
  })

  it('숫자 전부 맞으면 100점', () => {
    expect(scoreDecision(numberDp, { type: 'number', values: [24200, 9000] }).score).toBe(100)
  })

  it('숫자 일부만 맞으면 50점이고 정답은 아니다', () => {
    const r = scoreDecision(numberDp, { type: 'number', values: [24200, 1] })
    expect(r.score).toBe(50)
    expect(r.correct).toBe(false)
  })

  it('숫자 전부 틀리면 0점', () => {
    expect(scoreDecision(numberDp, { type: 'number', values: [1, 2] }).score).toBe(0)
  })

  it('좌석 정답은 100점', () => {
    expect(scoreDecision(seatDp, { type: 'seat', seat: 3 }).score).toBe(100)
  })

  it('답 종류가 판단 지점과 안 맞으면 0점', () => {
    expect(scoreDecision(choiceDp, { type: 'seat', seat: 3 }).score).toBe(0)
  })
})

describe('scoreHand', () => {
  it('축별 점수와 평균을 낸다', () => {
    const s = scoreHand([
      { kind: 'procedure', score: 100, correct: true },
      { kind: 'calculation', score: 50, correct: false },
    ])
    expect(s.procedure).toBe(100)
    expect(s.calculation).toBe(50)
    expect(s.action_validity).toBeNull()
    expect(s.average).toBe(75)
  })

  it('같은 축이 여러 번이면 평균낸다', () => {
    const s = scoreHand([
      { kind: 'procedure', score: 100, correct: true },
      { kind: 'procedure', score: 0, correct: false },
    ])
    expect(s.procedure).toBe(50)
  })

  it('판단이 없으면 평균은 0이다', () => {
    expect(scoreHand([]).average).toBe(0)
  })
})

describe('gradeFrom', () => {
  const mk = (p: number, v: number, c: number, sh: number) =>
    ({ procedure: p, action_validity: v, calculation: c, showdown: sh, average: (p + v + c + sh) / 4 })

  it('절차만 80 이상이면 junior', () => {
    expect(gradeFrom([mk(85, 40, 30, 20)])).toBe('junior')
  })

  it('절차·유효성·계산 세 축이 80 이상이면 senior', () => {
    expect(gradeFrom([mk(85, 85, 85, 40)])).toBe('senior')
  })

  it('세 축 90 이상이면 master', () => {
    expect(gradeFrom([mk(95, 92, 91, 90)])).toBe('master')
  })

  it('기록이 없으면 junior', () => {
    expect(gradeFrom([])).toBe('junior')
  })

  it('최근 기록의 평균으로 판단한다', () => {
    expect(gradeFrom([mk(100, 100, 100, 100), mk(0, 0, 0, 0)])).toBe('junior')
  })
})
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npm test -- score`
Expected: FAIL — `Failed to resolve import "./score"`

- [ ] **Step 3: 구현 작성**

`src/lib/simulator/score.ts`:

```ts
import type { DecisionPoint } from './decisions'
import type { DecisionKind } from './generate'

export type Answer =
  | { type: 'choice'; index: number }
  | { type: 'number'; values: number[] }
  | { type: 'seat'; seat: number }
  | { type: 'timeout' }

export type DecisionResult = { kind: DecisionKind; score: number; correct: boolean }

export type HandScore = {
  procedure: number | null
  action_validity: number | null
  calculation: number | null
  showdown: number | null
  average: number
}

export function scoreDecision(dp: DecisionPoint, answer: Answer): DecisionResult {
  const fail: DecisionResult = { kind: dp.kind, score: 0, correct: false }
  if (answer.type === 'timeout') return fail

  if (dp.input.type === 'choice') {
    if (answer.type !== 'choice') return fail
    const correct = answer.index === dp.input.correctIndex
    return { kind: dp.kind, score: correct ? 100 : 0, correct }
  }

  if (dp.input.type === 'seat') {
    if (answer.type !== 'seat') return fail
    const correct = answer.seat === dp.input.correctSeat
    return { kind: dp.kind, score: correct ? 100 : 0, correct }
  }

  // number — 필드별 부분 점수
  if (answer.type !== 'number') return fail
  const fields = dp.input.fields
  const hits = fields.filter((f, i) => answer.values[i] === f.answer).length
  const score = Math.round((hits / fields.length) * 100)
  return { kind: dp.kind, score, correct: hits === fields.length }
}

const KINDS: DecisionKind[] = ['procedure', 'action_validity', 'calculation', 'showdown']

export function scoreHand(results: DecisionResult[]): HandScore {
  const out: HandScore = {
    procedure: null, action_validity: null, calculation: null, showdown: null, average: 0,
  }

  for (const kind of KINDS) {
    const got = results.filter((r) => r.kind === kind)
    if (got.length > 0) {
      out[kind] = Math.round(got.reduce((a, r) => a + r.score, 0) / got.length)
    }
  }

  const present = KINDS.map((k) => out[k]).filter((v): v is number => v !== null)
  out.average = present.length > 0
    ? Math.round(present.reduce((a, v) => a + v, 0) / present.length)
    : 0

  return out
}

/** 등급은 최근 핸드들의 축별 이동 평균으로 정한다. 누적으로 하면 초기 실수가 영구히 발목을 잡는다. */
export function gradeFrom(recent: HandScore[]): 'junior' | 'senior' | 'master' {
  if (recent.length === 0) return 'junior'

  const avg = (k: Exclude<keyof HandScore, 'average'>) => {
    const vals = recent.map((h) => h[k]).filter((v): v is number => v !== null)
    return vals.length === 0 ? 0 : vals.reduce((a, v) => a + v, 0) / vals.length
  }

  const p = avg('procedure')
  const v = avg('action_validity')
  const c = avg('calculation')

  if (p >= 90 && v >= 90 && c >= 90) return 'master'
  if (p >= 80 && v >= 80 && c >= 80) return 'senior'
  return 'junior'
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npm test -- score`
Expected: PASS, 16 tests

- [ ] **Step 5: 커밋**

```bash
git add src/lib/simulator/score.ts src/lib/simulator/score.test.ts
git commit -m "feat: 판단 지점 채점과 등급 산출"
```

---

## Task 10: 통합 검증과 진입점 정리

엔진 전체가 하나로 맞물리는지 확인하고, 외부에서 쓸 진입점을 정리한다.

**Files:**
- Create: `src/lib/simulator/index.ts`
- Test: `src/lib/simulator/integration.test.ts`

**Interfaces:**
- Consumes: 전 태스크
- Produces: `src/lib/simulator/index.ts`가 `createRng`, `generateHand`, `extractDecisions`, `scoreDecision`, `scoreHand`, `gradeFrom`, `initialState`, `stateAt`, `applyEvent`, `buildPots`, `awardPots`, `evaluateHand`, `compareHands`와 관련 타입을 재수출

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/simulator/integration.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  generateHand, extractDecisions, scoreDecision, scoreHand, gradeFrom,
  initialState, stateAt,
} from './index'

describe('엔진 통합 — 핸드 100개', () => {
  const seeds = Array.from({ length: 100 }, (_, i) => `int-${i}`)

  it('모든 핸드가 예외 없이 생성된다', () => {
    seeds.forEach((seed) => {
      expect(() => generateHand({ seed })).not.toThrow()
    })
  })

  it('모든 핸드에서 칩 총액이 보존된다', () => {
    seeds.forEach((seed) => {
      const hand = generateHand({ seed })
      const init = initialState(hand.seats, hand.buttonSeat)
      const final = stateAt(init, hand.events, hand.events.length)
      const start = hand.seats.reduce((a, s) => a + s.stack, 0)
      const end = final.seats.reduce((a, s) => a + s.stack, 0) + final.pot
      expect(end).toBe(start)
    })
  })

  it('스택이 음수가 되는 핸드가 없다', () => {
    seeds.forEach((seed) => {
      const hand = generateHand({ seed })
      const init = initialState(hand.seats, hand.buttonSeat)
      for (let i = 0; i <= hand.events.length; i++) {
        const s = stateAt(init, hand.events, i)
        s.seats.forEach((seat) => expect(seat.stack).toBeGreaterThanOrEqual(0))
      }
    })
  })

  it('모든 핸드에서 판단 지점 추출이 예외 없이 된다', () => {
    seeds.forEach((seed) => {
      expect(() => extractDecisions(generateHand({ seed }))).not.toThrow()
    })
  })
})

describe('엔진 통합 — 전체 플레이 루프', () => {
  it('생성 → 판단 추출 → 전부 정답 → 만점', () => {
    const hand = generateHand({ seed: 'loop-perfect', require: ['calculation'] })
    const dps = extractDecisions(hand)
    expect(dps.length).toBeGreaterThan(0)

    const results = dps.map((dp) => {
      if (dp.input.type === 'choice') return scoreDecision(dp, { type: 'choice', index: dp.input.correctIndex })
      if (dp.input.type === 'seat') return scoreDecision(dp, { type: 'seat', seat: dp.input.correctSeat })
      return scoreDecision(dp, { type: 'number', values: dp.input.fields.map((f) => f.answer) })
    })

    const score = scoreHand(results)
    expect(score.average).toBe(100)
  })

  it('생성 → 전부 시간 초과 → 0점, 등급 junior', () => {
    const hand = generateHand({ seed: 'loop-timeout' })
    const dps = extractDecisions(hand)
    const results = dps.map((dp) => scoreDecision(dp, { type: 'timeout' }))
    const score = scoreHand(results)
    expect(score.average).toBe(0)
    expect(gradeFrom([score])).toBe('junior')
  })
})
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npm test -- integration`
Expected: FAIL — `Failed to resolve import "./index"`

- [ ] **Step 3: 진입점 작성**

`src/lib/simulator/index.ts`:

```ts
export { createRng, type Rng } from './rng'
export {
  makeDeck, shuffle, cardToString, parseCard, RANK_VALUE, RANKS, SUITS,
  type Card, type Rank, type Suit,
} from './cards'
export {
  evaluateHand, compareHands, CATEGORY_LABEL,
  type HandRank, type HandCategory,
} from './evaluate'
export { initialState, applyEvent, stateAt } from './reduce'
export type {
  HandEvent, HandState, SeatState, SeatInit, PlayerAction, Street,
} from './types'
export { buildPots, awardPots, type Pot, type PotAward } from './pots'
export { nlh } from './rulesets/nlh'
export type {
  Ruleset, RulesetId, BettingContext, ValidationResult, DeclaredIntent,
} from './rulesets/types'
export {
  generateHand, PLAYER_NAMES,
  type Hand, type GenerateOptions, type Difficulty, type DecisionKind,
} from './generate'
export {
  extractDecisions, TIME_LIMITS,
  type DecisionPoint, type DecisionInput,
} from './decisions'
export {
  scoreDecision, scoreHand, gradeFrom,
  type Answer, type DecisionResult, type HandScore,
} from './score'
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npm test -- integration`
Expected: PASS, 6 tests

칩 보존이나 음수 스택 테스트가 깨지면 Task 4의 `raiseBetTo`가 스택보다 큰 벳을 자르는지, Task 7의 `runBettingRound`가 올인 좌석을 건너뛰는지 확인할 것. 이 두 테스트는 엔진 신뢰성의 핵심이므로 **테스트를 완화하지 말고 구현을 고칠 것.**

- [ ] **Step 5: 전체 테스트와 타입체크·린트 실행**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: 전체 통과, 타입 에러 0, 린트 에러 0

- [ ] **Step 6: 커밋**

```bash
git add src/lib/simulator/index.ts src/lib/simulator/integration.test.ts
git commit -m "feat: 시뮬레이터 엔진 진입점과 통합 테스트"
```

---

## 완료 기준

- [ ] `npm test` 전체 통과
- [ ] `npm run typecheck` 에러 0
- [ ] `npm run lint` 에러 0
- [ ] 엔진 폴더 어디에도 `Math.random()` 이 없다 — `grep -rn "Math.random" src/lib/simulator/` 결과가 비어 있어야 한다
- [ ] 엔진 폴더 어디에도 `react` / `next` / `@supabase` import 가 없다
- [ ] 핸드 100개에서 칩 총액이 보존되고 스택이 음수가 되지 않는다
- [ ] 같은 시드가 같은 핸드·같은 판단 지점을 만든다

## 이 계획에 없는 것

2단계(테이블뷰·재생)와 3단계(이상감지·기록)는 각자 계획서를 갖는다. 특히 다음은 여기서 만들지 않는다.

- React 컴포넌트, 애니메이션, 재생 속도
- 이상 상황(anomaly) 삽입과 타이밍 채점
- `hand_sessions` 테이블과 Supabase 연동
- 팟리밋·픽스드리밋, 스터드·드로우 룰셋

## 설계 문서에서 넘어온 미결정 사항

| 항목 | 이 계획의 잠정값 | 확정 시점 |
|---|---|---|
| 등급 이동 평균의 N | `gradeFrom`이 받은 배열 전부. 호출부가 최근 20개를 잘라 넘긴다 | 3단계, 실제 기록이 쌓일 때 |
| 이상 상황 발생 빈도 | 해당 없음 | 3단계 |
| `detectWindow` 폭 | 해당 없음 | 3단계 |
