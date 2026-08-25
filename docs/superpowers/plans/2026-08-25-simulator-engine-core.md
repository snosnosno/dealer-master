# 딜러 시뮬레이터 — 엔진 코어 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시드 하나로 노리밋 홀덤 핸드를 결정론적으로 생성하고, 판단 지점 4종을 추출하고, 답안을 채점하는 순수 TypeScript 엔진을 만든다. UI는 이 계획에 없다.

**Architecture:** React·Next에 의존하지 않는 순수 함수 모듈로 짠다. 핸드 진행은 이벤트 배열이고 화면 상태는 이벤트를 접어서(reduce) 만든다. 난수는 전부 시드 PRNG 하나를 통과하므로 같은 시드는 항상 같은 핸드를 만든다. 게임 규칙은 `Ruleset` 인터페이스 뒤에 두어 나중에 스터드·드로우·팟리밋을 데이터로 붙일 수 있게 한다.

**Tech Stack:** TypeScript 5, Vitest 4 (node 환경), 외부 런타임 의존성 없음

**Spec:** `docs/superpowers/specs/2026-08-25-dealer-simulator-design.md`

---

## 검토 반영 (2026-08-25)

착수 전 검토에서 규칙 오류가 나왔다. 계획서에 박아둔 구현 코드를 그대로 JS로 이식해 300개 시드로 실행한 결과가 근거다.

| 근거 | 측정값 |
|---|---|
| `buildPots` 가 목업 핸드에서 만드는 팟 | `[800, 23400, 9000]` — Task 5 자기 테스트 2개 실패 (기대 `[24200, 9000]`) |
| 핸드가 끝난(생존 1명) 뒤 보드를 깐 핸드 | 119 / 300 |
| 생존 1명인데 쇼다운 공개를 한 핸드 | 150 / 300 |
| 미콜 벳이 팟에 남은 핸드 | 150 / 300 |
| **올인이 하나도 없는데 "사이드팟을 나누세요" 문제가 출제되는 핸드** | **296 / 300** |
| **Task 8 최소 레이즈 문제의 정답이 규칙과 다른 핸드** | **221 / 296** |
| Task 8 최소 레이즈 문제의 선택지가 서로 겹치는 핸드 | 296 / 296 |
| 포카드 + 페어일 때 키커 판정 | `9999/22/K` vs `9999/22/Q` 를 무승부로 판정 |
| 메인팟이 분할되는 핸드 (단일 정답으로 채점 불가) | 9 / 300 |
| `require:['calculation']` 이 올인 2회를 못 만든 시드 | `calc-2` (Task 7 테스트 실패) |

**정상 확인된 것** — 다시 의심하지 말 것: 스트레이트 판정(휠 5-high, A-high 14, 휠 스트레이트 플러시 category 8, 플러시와 스트레이트가 따로 있을 때 SF 오판정 없음), 결정론, 칩 총액 보존, 리듀서 불변성, `index.ts` 재수출 목록과 실제 export 의 일치, 그리고 정산 패스 도입 이후 collect 시점 미매칭 벳 0건(단, 아래 Task 7 에서 다른 이유로 교체한다).

아래 Task 3·4·5·6·7·8·9·10 이 이 결과를 반영해 수정됐다.

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
- Create: `vitest.config.mts`
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

`vitest.config.mts`:

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
git add vitest.config.mts package.json package-lock.json src/lib/simulator/rng.ts src/lib/simulator/rng.test.ts
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
  it('A-high 스트레이트는 top 이 14다', () => {
    const r = evaluateHand(h('As','Kh','Qd','Jc','Ts','2d','3h'))
    expect(r.category).toBe(4)
    expect(r.tiebreak[0]).toBe(14)
  })
  it('휠 스트레이트 플러시', () => {
    const r = evaluateHand(h('As','2s','3s','4s','5s','9d','Kh'))
    expect(r.category).toBe(8)
    expect(r.tiebreak[0]).toBe(5)
  })
  it('플러시와 스트레이트가 따로 있으면 스트레이트 플러시가 아니다', () => {
    // 스페이드 5장(플러시)이지만 그 5장이 연속이 아니다
    expect(evaluateHand(h('9s','8s','7s','6s','2s','5d','Kh')).category).toBe(5)
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

  it('포카드 옆에 페어가 있어도 키커는 가장 높은 랭크다', () => {
    // 보드 9999 2, 한쪽은 2K, 다른쪽은 2Q. 최선의 5장은 9999K vs 9999Q.
    // 개수 우선 정렬 배열에서 키커를 뽑으면 둘 다 키커를 2로 잡아 무승부가 된다.
    const withK = evaluateHand(h('9s','9h','9d','9c','2d','2h','Kh'))
    const withQ = evaluateHand(h('9s','9h','9d','9c','2d','2h','Qh'))
    expect(withK.tiebreak).toEqual([9, 13])
    expect(compareHands(withK, withQ)).toBeGreaterThan(0)
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
  const groups = Array.from(counts.entries()).sort((a, b) =>
    b[1] - a[1] || b[0] - a[0],
  )

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
Expected: PASS, 23 tests

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
  - `type HandState = { seats: SeatState[]; buttonSeat: number; board: Card[]; pot: number; street: Street; contributed: number[] }`
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

  it('return_uncalled 는 스택·벳·투입액을 함께 되돌린다', () => {
    // 좌석 2가 1,000 을 벳했는데 아무도 맞추지 않았다 -> 600 은 돌려받는다
    let s = initialState(seats, 0)
    s = applyEvent(s, { type: 'player_action', seat: 2, action: { kind: 'bet', to: 1000 } })
    s = applyEvent(s, { type: 'return_uncalled', seat: 2, amount: 600 })
    expect(s.seats[2].bet).toBe(400)
    expect(s.seats[2].stack).toBe(47000 - 400)
    expect(s.contributed[2]).toBe(400)
  })

  it('올인이 미콜로 돌아오면 올인 상태가 풀린다', () => {
    let s = initialState(seats, 0)
    s = applyEvent(s, { type: 'player_action', seat: 1, action: { kind: 'allin', to: 12500 } })
    s = applyEvent(s, { type: 'return_uncalled', seat: 1, amount: 12000 })
    expect(s.seats[1].allIn).toBe(false)
    expect(s.seats[1].stack).toBe(12000)
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
  /** amount 는 목표치가 아니라 '이만큼 낸다' 는 **가산액**이다. 앤티와 블라인드를
   *  같은 좌석이 낼 때 순서와 무관하게 합산돼야 한다 (25 + 200 = 225).
   *  목표치로 다루면 앤티가 블라인드에 흡수되거나(과소 징수) 음수 delta 가 된다. */
  | { type: 'post_blind'; seat: number; amount: number; kind: 'sb' | 'bb' | 'ante' }
  | { type: 'deal_hole'; seat: number; card: Card }
  | { type: 'burn' }
  | { type: 'deal_board'; street: Street; cards: Card[] }
  | { type: 'player_action'; seat: number; action: PlayerAction }
  /**
   * 아무도 맞추지 않은 벳을 벳한 사람에게 되돌려준다.
   * 딜러가 팟을 끌어오기 전에 초과분을 밀어 돌려주는 그 동작이다.
   * 이 이벤트가 없으면 미콜 벳이 팟에 섞여 사이드팟이 하나 더 있는 것처럼 보인다.
   */
  | { type: 'return_uncalled'; seat: number; amount: number }
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
      // amount 는 가산액이다 — 목표치가 아니다 (위 HandEvent 주석 참조)
      const { seats, contributed } = raiseBetTo(state, e.seat, state.seats[e.seat].bet + e.amount)
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

    case 'return_uncalled': {
      const seat = state.seats[e.seat]
      // 낸 것보다 많이 되돌리면 bet 과 contributed 가 음수가 된다 — 원장이 깨진다
      if (e.amount > seat.bet) {
        throw new Error(
          `좌석 ${e.seat}(0-based) 에 되돌리려는 ${e.amount} 이 현재 벳 ${seat.bet} 보다 크다. ` +
            `낸 것보다 많이 되돌릴 수 없다.`,
        )
      }
      const contributed = state.contributed.slice()
      contributed[e.seat] -= e.amount
      return {
        ...state,
        seats: withSeat(state, e.seat, {
          stack: seat.stack + e.amount,
          bet: seat.bet - e.amount,
          // 결과 스택에서 유도한다 — 무조건 false 면 amount 가 0 일 때 올인이 잘못 풀린다
          allIn: seat.stack + e.amount === 0,
        }),
        contributed,
      }
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
Expected: PASS, 20 tests

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
  - `awardPots(pots: Pot[], hole: Card[][], board: Card[], buttonSeat: number): PotAward[]` — 동점이면 나눠주고, 홀칩은 `ODD_CHIP_UNIT` 단위로 버튼 왼쪽 첫 자격자부터
  - `ODD_CHIP_UNIT = 100`

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

  it('팟은 정확히 두 개다', () => {
    // 올인은 최우진(8,000) 하나뿐이므로 자격이 갈리는 지점도 하나다.
    // 폴드한 정하늘의 BB 200 은 메인팟에 얹히는 데드머니일 뿐 팟을 만들지 않는다.
    expect(buildPots(contributed, folded)).toHaveLength(2)
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

  it('폴드한 사람이 적게 내고 죽어도 사이드팟은 생기지 않는다', () => {
    // 데드머니는 참가 자격을 가르지 않는다. 팟은 하나다.
    const pots = buildPots([500, 1000, 1000], [true, false, false])
    expect(pots).toHaveLength(1)
    expect(pots[0].amount).toBe(2500)
    expect(pots[0].eligibleSeats).toEqual([1, 2])
  })

  it('폴드한 블라인드 하나가 별도 팟을 만들지 않는다', () => {
    // 목업 핸드의 축소판: 폴드한 BB 200 + 살아 있는 두 명 1,000씩
    const pots = buildPots([200, 1000, 1000], [true, false, false])
    expect(pots).toHaveLength(1)
    expect(pots[0].amount).toBe(2200)
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
  const holeArr = [[], hole[1], hole[2], hole[3], [], []]

  const pots = buildPots([0, 12500, 12500, 8000, 200, 0], [true, false, false, false, true, true])
  const BUTTON = 2

  it('메인팟은 최우진(좌석 3)이 가져간다', () => {
    const awards = awardPots(pots, holeArr, board, BUTTON)
    const main = awards.filter((a) => a.potIndex === 0)
    expect(main).toHaveLength(1)
    expect(main[0].seat).toBe(3)
    expect(main[0].amount).toBe(24200)
  })

  it('사이드팟은 이민아(좌석 2)가 가져간다 — 승자가 서로 다르다', () => {
    const awards = awardPots(pots, holeArr, board, BUTTON)
    const side = awards.filter((a) => a.potIndex === 1)
    expect(side).toHaveLength(1)
    expect(side[0].seat).toBe(2)
    expect(side[0].amount).toBe(9000)
  })

  it('자격자가 한 명뿐이면 보드가 5장이 아니어도 지급된다', () => {
    // 전원 폴드로 끝난 핸드. 쇼다운이 없으므로 족보를 평가하면 안 된다.
    const onePot = buildPots([1000, 500], [false, true])
    const awards = awardPots(onePot, [[], []], [], 0)
    expect(awards).toEqual([{ potIndex: 0, seat: 0, amount: 1500 }])
  })
})

describe('awardPots — 동점 분배와 홀칩', () => {
  const board = h('Kd','9s','7h','2c','Qs')
  const tie = [h('Ah','Jd'), h('Ac','Jh')] // 완전 동일 족보
  // 셋·넷이 동시에 동점인 경우. 전부 A-J 하이카드로 완전히 같고,
  // 보드에 같은 수트가 2장뿐이라 누구도 플러시가 되지 않는다.
  // 마지막 좌석은 폴드해서 자격이 없으므로 홀카드가 필요 없다.
  const tie4 = [h('Ah','Jd'), h('Ac','Jh'), h('Ad','Jc'), []]
  const tie5 = [h('Ah','Jd'), h('Ac','Jh'), h('Ad','Jc'), h('As','Js'), []]

  it('동점이면 나눠 갖는다', () => {
    const pots = buildPots([1000, 1000], [false, false])
    const awards = awardPots(pots, tie, board, 0)
    expect(awards).toHaveLength(2)
    expect(awards.map((a) => a.amount)).toEqual([1000, 1000])
  })

  it('홀칩은 버튼 왼쪽 첫 자격자에게 간다 — 좌석 번호가 기준이 아니다', () => {
    // 팟 2,100 을 둘이 나눈다. 50 칩은 존재하지 않으므로 1,100 / 1,000 이 정답이다.
    // 버튼이 좌석 0 이면 버튼 왼쪽 첫 자격자는 좌석 1 이다.
    const pots = buildPots([1050, 1050], [false, false])
    const awards = awardPots(pots, tie, board, 0)
    const bySeat = new Map(awards.map((a) => [a.seat, a.amount]))
    expect(bySeat.get(1)).toBe(1100)
    expect(bySeat.get(0)).toBe(1000)
  })

  it('버튼이 옮겨가면 홀칩 수령자도 바뀐다', () => {
    const pots = buildPots([1050, 1050], [false, false])
    const awards = awardPots(pots, tie, board, 1)
    const bySeat = new Map(awards.map((a) => [a.seat, a.amount]))
    expect(bySeat.get(0)).toBe(1100)
    expect(bySeat.get(1)).toBe(1000)
  })

  it('분배 총액은 팟과 정확히 같다', () => {
    const pots = buildPots([1050, 1050], [false, false])
    const awards = awardPots(pots, tie, board, 0)
    expect(awards.reduce((a, x) => a + x.amount, 0)).toBe(2100)
  })

  it('셋이 나눠도 홀칩 하나가 버튼 왼쪽 첫 자격자에게 가고 총액이 보존된다', () => {
    // 팟 2,200 을 셋이 나눈다. 2,200 / 3 은 나눠떨어지지 않는다 —
    // 700 씩 주고 남는 홀칩 100 하나가 버튼 왼쪽 첫 자격자에게 간다.
    // 반올림(733 x 3 = 2,199)은 칩을 하나 잃고 733 은 존재하지도 않는 칩이다.
    // 좌석 3 은 폴드한 데드머니 100 이라 팟을 가르지 않는다.
    const pots = buildPots([700, 700, 700, 100], [false, false, false, true])
    expect(pots).toHaveLength(1)
    expect(pots[0].amount).toBe(2200)

    // 버튼이 좌석 0 이면 배분 순서는 1 → 2 → 3 → 0 이다. 첫 자격자는 좌석 1.
    const awards = awardPots(pots, tie4, board, 0)
    const bySeat = new Map(awards.map((a) => [a.seat, a.amount]))
    expect(bySeat.get(1)).toBe(800)
    expect(bySeat.get(2)).toBe(700)
    expect(bySeat.get(0)).toBe(700)
    expect(awards.reduce((a, x) => a + x.amount, 0)).toBe(2200)
  })

  it('넷이 나누고 홀칩이 둘이면 버튼 왼쪽부터 연속으로 하나씩 간다', () => {
    // 팟 2,600 을 넷이 나눈다. 600 씩 주고 홀칩 100 이 두 개 남는다.
    // 두 개가 한 사람에게 몰리지 않고 버튼 왼쪽부터 한 개씩 간다.
    const pots = buildPots([600, 600, 600, 600, 200], [false, false, false, false, true])
    expect(pots).toHaveLength(1)
    expect(pots[0].amount).toBe(2600)

    // 버튼이 좌석 1 이면 배분 순서는 2 → 3 → 4 → 0 → 1 이다.
    // 자격자는 0~3 이므로 홀칩 두 개는 좌석 2 와 3 이 받는다 — 좌석 번호 순이 아니다.
    const awards = awardPots(pots, tie5, board, 1)
    const bySeat = new Map(awards.map((a) => [a.seat, a.amount]))
    expect(bySeat.get(2)).toBe(700)
    expect(bySeat.get(3)).toBe(700)
    expect(bySeat.get(0)).toBe(600)
    expect(bySeat.get(1)).toBe(600)
    expect(awards.reduce((a, x) => a + x.amount, 0)).toBe(2600)
  })

  it('hole 이 좌석 수보다 짧으면 조용히 틀리지 않고 던진다', () => {
    // 4인 테이블에서 만든 팟에 2인분 hole 만 넘긴 경우.
    // 이대로 두면 seatCount 가 2 라 홀칩 순서가 조용히 틀어진다.
    const pots = [{ amount: 1000, eligibleSeats: [0, 3] }]
    expect(() => awardPots(pots, tie, board, 0)).toThrow(/좌석 수 불일치/)
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
  // folded 가 짧으면 뒤쪽 좌석이 조용히 "살아 있는" 것으로 취급돼
  // 자격자 집합이 틀어진다. 팟 분할은 틀려도 그럴듯해 보이므로 여기서 막는다.
  if (folded.length !== contributed.length) {
    throw new Error(`좌석 수 불일치: contributed ${contributed.length}, folded ${folded.length}`)
  }

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

  /*
   * 층을 자른 것만으로는 팟이 되지 않는다.
   * 사이드팟은 "올인으로 더 적게 낸 사람 때문에 참가 자격이 갈릴 때"만 생긴다.
   * 폴드한 사람이 만든 층은 자격자 집합을 바꾸지 않으므로 팟을 새로 만들지 않고
   * 앞 팟에 얹히는 데드머니일 뿐이다.
   * ⚠️ 조항 번호는 TDA 2024 PDF 원문으로 확인할 것 (기존 "TDA Rule 21" 표기는 미검증).
   *
   * 이 병합을 빼면 폴드한 빅블라인드의 200 하나가 별도 팟을 만들어
   * 목업 핸드가 [800, 23400, 9000] 세 팟이 된다 (정답은 [24200, 9000]).
   * 팟의 "개수"가 곧 유저에게 물어볼 입력칸 개수라 이건 그대로 오답 출제로 이어진다.
   */
  const merged: Pot[] = []
  for (const p of pots) {
    const last = merged[merged.length - 1]
    // eligibleSeats 는 양쪽 다 좌석 오름차순으로 쌓이므로 순서대로 비교하면 집합 비교가 된다.
    const sameEligible =
      last !== undefined &&
      last.eligibleSeats.length === p.eligibleSeats.length &&
      last.eligibleSeats.every((s, i) => s === p.eligibleSeats[i])

    if (last !== undefined && (p.eligibleSeats.length === 0 || sameEligible)) {
      merged[merged.length - 1] = { ...last, amount: last.amount + p.amount }
    } else {
      merged.push({ ...p })
    }
  }
  return merged
}

/** 테이블에 존재하는 가장 작은 칩. 분할은 이 단위 아래로 쪼갤 수 없다. */
export const ODD_CHIP_UNIT = 100

/**
 * 버튼 왼쪽 첫 좌석부터 시계방향 순서로 정렬한다. 홀칩 배분 순서의 기준이다.
 * 버튼 자신은 이 순서의 맨 뒤다 (가장 좋은 포지션이 홀칩을 마지막에 받는다).
 */
function orderFromButton(seats: number[], buttonSeat: number, seatCount: number): number[] {
  // JS 의 % 는 음수를 그대로 음수로 돌려주므로 한 번 더 접어 0 이상으로 만든다.
  const dist = (s: number) => (((s - buttonSeat - 1) % seatCount) + seatCount) % seatCount
  return [...seats].sort((a, b) => dist(a) - dist(b))
}

export function awardPots(
  pots: Pot[],
  hole: Card[][],
  board: Card[],
  buttonSeat: number,
): PotAward[] {
  const awards: PotAward[] = []
  const seatCount = hole.length

  // hole 이 좌석 수보다 짧으면 seatCount 가 작아져 홀칩 순서가 조용히 틀어지고,
  // 자격 좌석의 홀카드도 없는 채로 평가에 들어간다. 통합 단계에서 증상으로 나타나면
  // 원인 추적이 가장 비싼 종류라 여기서 크게 실패시킨다.
  // buildPots 의 좌석 수 가드와 같은 계열 — 없는 정보라 유도로는 풀 수 없다.
  for (const pot of pots) {
    for (const seat of pot.eligibleSeats) {
      if (seat < 0 || seat >= seatCount) {
        throw new Error(`좌석 수 불일치: 자격 좌석 ${seat}, hole ${seatCount}`)
      }
    }
  }

  pots.forEach((pot, potIndex) => {
    if (pot.eligibleSeats.length === 0) return

    // 자격자가 한 명이면 쇼다운이 없다. 보드가 5장이 아닌 채로 끝난 핸드
    // (전원 폴드) 에서 evaluateHand 를 부르면 카드가 모자라 던진다.
    let winners: number[]
    if (pot.eligibleSeats.length === 1) {
      winners = [...pot.eligibleSeats]
    } else {
      const ranked = pot.eligibleSeats.map((seat) => ({
        seat,
        rank: evaluateHand([...hole[seat], ...board]),
      }))
      let best = ranked[0].rank
      for (const r of ranked) if (compareHands(r.rank, best) > 0) best = r.rank
      winners = ranked.filter((r) => compareHands(r.rank, best) === 0).map((r) => r.seat)
    }

    /*
     * 홀칩은 "가장 작은 칩" 단위로 남고, 버튼 왼쪽 첫 자격자부터 한 칩씩 간다.
     * 낮은 좌석 인덱스부터 주면 좌석 번호가 규칙인 것처럼 가르치게 된다 —
     * 실제 기준은 버튼이다. 그리고 8,100 을 둘로 나눠 4,050 씩 주는 것은
     * 테이블에 50 칩이 없으므로 현장에서 불가능하다. 4,100 / 4,000 이 정답이다.
     * ⚠️ 조항 번호는 TDA 2024 PDF 원문으로 확인해 채울 것 (기존 "Rule 20" 표기는 미검증).
     */
    const ordered = orderFromButton(winners, buttonSeat, seatCount)
    const units = Math.floor(pot.amount / ODD_CHIP_UNIT)
    const base = Math.floor(units / ordered.length) * ODD_CHIP_UNIT
    let remainder = pot.amount - base * ordered.length

    ordered.forEach((seat) => {
      const extra = Math.min(remainder, ODD_CHIP_UNIT)
      remainder -= extra
      awards.push({ potIndex, seat, amount: base + extra })
    })
  })

  return awards
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npm test -- pots`
Expected: PASS, 19 tests

`buildPots` 의 병합 규칙과 `awardPots` 의 버튼 기준 순서는 이 계획서에서 가장 자주 틀리는 두 곳이다. 테스트가 깨지면 **테스트를 고치지 말고 구현을 고칠 것** — 기대값은 사이드팟 규칙과 홀칩 규칙에서 나온 것이지 구현에서 나온 것이 아니다. ⚠️ 두 규칙의 조항 번호(기존 "TDA Rule 21" / "Rule 20" 표기)는 TDA 2024 PDF 원문 대조 전이라 미검증이다.

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
  - `type BettingContext = { currentBet: number; lastRaiseSize: number; bigBlind: number; seatBet: number; seatStack: number; isOpenBet: boolean; canRaise: boolean }`
  - `type ValidationResult = { valid: true; normalized: PlayerAction } | { valid: false; ruling: 'forced' | 'td_discretion'; reason: string; corrected: PlayerAction }`
  - `interface Ruleset { id, family, bettingStructure, holeCardCount, streets, minRaiseTo, maxRaiseTo, validateAction, interpretChipPush }`
  - `nlh: Ruleset`
  - `interpretChipPush(ctx: BettingContext, pushedTotal: number, declared: 'none'|'raise'|'allin', chips?: number[]): PlayerAction` — Rule 45-A 구현

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/simulator/rulesets/nlh.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { nlh } from './nlh'
import type { BettingContext } from './types'

const ctx = (over: Partial<BettingContext> = {}): BettingContext => ({
  currentBet: 0, lastRaiseSize: 0, bigBlind: 200, seatBet: 0, seatStack: 100000,
  isOpenBet: false, canRaise: true, ...over,
})

describe('minRaiseTo — 파일럿 케이스 4', () => {
  it('레이즈 총액이 아니라 레이즈 폭을 기준으로 계산한다', () => {
    // 블라인드 100/200. A 600 오픈 -> B 1600 -> C 3600. D 의 최소 레이즈는?
    // 마지막 레이즈 폭은 3600 - 1600 = 2000. 따라서 3600 + 2000 = 5600.
    const c = ctx({ currentBet: 3600, lastRaiseSize: 2000 })
    expect(nlh.minRaiseTo(c)).toBe(5600)
  })

  it('첫 벳이 없으면 최소 벳은 빅블라인드 크기다', () => {
    // 레이즈가 아직 없으므로 lastRaiseSize 는 0 이다. 하한은 bigBlind 가 준다.
    const c = ctx({ currentBet: 0, lastRaiseSize: 0, bigBlind: 200 })
    expect(nlh.minRaiseTo(c)).toBe(200)
  })

  it('직전 레이즈 폭이 빅블라인드보다 작아도 하한은 빅블라인드다', () => {
    // 풀 레이즈에 못 미치는 올인이 있었다 해도 최소 레이즈 폭이 그만큼 줄지는 않는다
    const c = ctx({ currentBet: 500, lastRaiseSize: 100, bigBlind: 200 })
    expect(nlh.minRaiseTo(c)).toBe(700)
  })

  it('프리플랍은 빅블라인드가 오픈 벳이다', () => {
    // 블라인드 100/200 에서 첫 레이즈의 최소 총액은 400 이다
    const c = ctx({ currentBet: 200, lastRaiseSize: 200, bigBlind: 200 })
    expect(nlh.minRaiseTo(c)).toBe(400)
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
    // 케이스 2 그대로: 그 2,000 이 B 의 마지막 칩 전부다.
    // 칩 하나(1,000)를 빼면 1,000 이라 콜 1,050 에 못 미친다 -> 콜.
    // 마지막 칩이었다는 사실은 무관하므로 올인으로 해석해서도 안 된다.
    const c = ctx({ currentBet: 1050, seatBet: 0, seatStack: 2000 })
    const a = nlh.interpretChipPush(c, 2000, 'none', [1000, 1000])
    expect(a).toEqual({ kind: 'call', to: 1050 })
  })

  it('이미 앞에 낸 벳이 있으면 그것까지 합쳐서 판정한다', () => {
    // 빅블라인드 200 을 낸 좌석이 콜 600 을 앞에 두고 500짜리 하나를 민다.
    // 총 벳은 200 + 500 = 700 이지 500 이 아니다.
    const c = ctx({ currentBet: 600, seatBet: 200, seatStack: 12500 })
    const a = nlh.interpretChipPush(c, 500, 'none', [500])
    expect(a).toEqual({ kind: 'call', to: 600 })
  })

  it('권종이 섞이면 콜에 필요 없는 칩이 있는지로 갈린다', () => {
    // 콜 500 에 1,000 + 100 을 밀었다. 100 을 빼도 1,000 이 남아 콜에 충분하므로
    // 모든 칩이 콜에 필요했던 것이 아니다 -> 레이즈.
    const c = ctx({ currentBet: 500, lastRaiseSize: 500, seatBet: 0, seatStack: 12500 })
    const a = nlh.interpretChipPush(c, 1100, 'none', [1000, 100])
    expect(a).toEqual({ kind: 'raise', to: 1100 })
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

  it('칩 내역의 합이 밀어낸 총액과 다르면 던진다', () => {
    // 어긋난 내역을 그대로 쓰면 "칩 하나를 빼면 콜에 못 미치는가" 판정이
    // 조용히 뒤집힌다. 여기서는 콜(1050)로 나와야 할 것이 레이즈가 된다.
    const c = ctx({ currentBet: 1050, seatBet: 0, seatStack: 12500 })
    expect(() => nlh.interpretChipPush(c, 2000, 'none', [1000, 1000, 1000])).toThrow(/칩 내역 불일치/)
  })

  it('0 이나 음수 권종이 섞이면 던진다', () => {
    // [1000, 0] 은 0 을 빼도 총액이 그대로라 무조건 레이즈로 판정된다.
    const c = ctx({ currentBet: 1000, seatBet: 0, seatStack: 12500 })
    expect(() => nlh.interpretChipPush(c, 1000, 'none', [1000, 0])).toThrow(/칩 권종이 잘못됨/)
  })
})

describe('validateAction — 파일럿 케이스 3 (Rule 51-B 언더콜)', () => {
  it('오픈 벳에 대한 언더콜은 전액 콜로 강제된다', () => {
    const c = ctx({ currentBet: 8000, seatBet: 0, seatStack: 50000, isOpenBet: true })
    const r = nlh.validateAction(c, { kind: 'call', to: 2000 })
    expect(r.valid).toBe(false)
    if (!r.valid) {
      expect(r.ruling).toBe('forced')
      expect(r.corrected).toEqual({ kind: 'call', to: 8000 })
    }
  })

  it('오픈 벳이 아닌 벳에 대한 언더콜은 플로어 재량이다', () => {
    // 케이스 3 의 핵심은 "오픈 벳이냐 아니냐"로 처리가 갈린다는 것이다.
    // 둘을 같은 결과로 뭉개면 엔진이 그 구분을 못 가르친다.
    const c = ctx({ currentBet: 8000, seatBet: 0, seatStack: 50000, isOpenBet: false })
    const r = nlh.validateAction(c, { kind: 'call', to: 2000 })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.ruling).toBe('td_discretion')
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

  it('벳 앞에서의 체크는 플로어 판단 영역이지 폴드 확정이 아니다', () => {
    // 체크는 무효 액션이지 폴드 선언이 아니다. forced 로 내보내면 Task 8 이
    // "벳 앞의 체크 = 폴드"를 단일 정답으로 출제하고 사용자가 그걸 규칙으로 배운다.
    const c = ctx({ currentBet: 500, seatBet: 0 })
    const r = nlh.validateAction(c, { kind: 'check' })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.ruling).toBe('td_discretion')
  })

  it('벳이 없으면 체크할 수 있다', () => {
    const r = nlh.validateAction(ctx(), { kind: 'check' })
    expect(r.valid).toBe(true)
  })

  it('레이즈 총액이 정확히 스택 전액이면 올인으로 인정된다', () => {
    const c = ctx({ currentBet: 1000, lastRaiseSize: 1000, seatBet: 0, seatStack: 5000 })
    const r = nlh.validateAction(c, { kind: 'raise', to: 5000 })
    expect(r.valid).toBe(true)
    if (r.valid) expect(r.normalized).toEqual({ kind: 'allin', to: 5000 })
  })

  it('베팅이 리오픈되지 않았으면 레이즈할 수 없다', () => {
    // 앞에서 풀 레이즈에 못 미치는 올인만 있었던 경우.
    // 이미 액션한 좌석은 차액을 콜하거나 폴드할 수 있을 뿐 다시 올릴 수 없다.
    const c = ctx({ currentBet: 1100, lastRaiseSize: 1000, seatBet: 1000, seatStack: 50000, canRaise: false })
    const r = nlh.validateAction(c, { kind: 'raise', to: 3000 })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.corrected).toEqual({ kind: 'call', to: 1100 })
  })
})
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npm test -- nlh`
Expected: FAIL — `Failed to resolve import "./nlh"`

- [ ] **Step 3: 인터페이스 파일 작성**

`src/lib/simulator/rulesets/types.ts`:

```ts
/**
 * 룰셋 인터페이스.
 *
 * 비유: 같은 카드 게임이라도 종목마다 "규칙책"이 다르다. 엔진은 규칙책을 통째로
 * 갈아 끼울 수 있게 만들어 두고, 액션이 합법인지·최소 레이즈가 얼마인지 같은
 * 판정을 전부 그 책에 묻는다. V1 의 규칙책은 노리밋 홀덤(`nlh`) 하나뿐이지만,
 * 스터드·드로우·팟리밋을 나중에 데이터로 붙이기 위해 인터페이스 뒤에 둔다.
 *
 * 여기가 판정하는 것이 곧 사용자에게 가르치는 규칙이다. 틀리면 딜러 훈련생이
 * 틀린 규칙을 정답으로 배운다.
 */
import type { PlayerAction, Street } from '../types'

export type RulesetId = 'nlh'

/** 액션 판정에 필요한 최소 정보만 뽑아 넘긴다 — 룰셋이 HandState 전체에 묶이지 않게. */
export type BettingContext = {
  /** 이번 라운드의 현재 최고 벳 (총액 기준) */
  currentBet: number
  /**
   * 이번 라운드에 나온 가장 큰 레이즈의 "폭". 최소 레이즈 계산의 근거 (Rule 43-A).
   * 라운드 시작 시 프리플랍은 bigBlind, 그 외는 0 이다.
   * 풀 레이즈에 못 미치는 올인은 이 값을 갱신하지 않는다.
   */
  lastRaiseSize: number
  /**
   * 빅블라인드. 최소 벳·최소 레이즈 폭의 하한이다.
   * 이 값이 없으면 룰셋이 하한을 강제할 수 없어 호출자가 lastRaiseSize 에
   * bb 를 몰래 넣어주는 관례에 의존하게 된다.
   */
  bigBlind: number
  /** 이 좌석이 이번 라운드에 이미 낸 금액 */
  seatBet: number
  seatStack: number
  /** 이번 라운드의 첫 벳인지 — 언더콜 처리가 달라진다 (Rule 51-B) */
  isOpenBet: boolean
  /**
   * 이 좌석에게 레이즈 권리가 있는지.
   * 이미 액션한 좌석 앞에 "풀 레이즈에 못 미치는 올인"만 있었다면
   * 콜·폴드만 가능하고 레이즈로 베팅을 다시 열 수 없다.
   *
   * ⚠️ 이 리오픈 규칙에는 조항 번호 근거가 아직 없다 — 계획서·파일럿 문서
   * 어디에도 인용이 없다. TDA 2024 PDF 원문으로 조항을 확인할 것.
   * (규칙 내용 자체는 통용되는 노리밋 관행이나, 번호를 지어내지 않는다.)
   */
  canRaise: boolean
}

export type ValidationResult =
  | { valid: true; normalized: PlayerAction }
  | {
      valid: false
      /**
       * forced         — 규정이 처리를 확정한다. corrected 가 곧 결과다.
       * td_discretion  — 플로어 판단 영역이다. corrected 는 기본값일 뿐 정답이 아니다.
       */
      ruling: 'forced' | 'td_discretion'
      reason: string
      corrected: PlayerAction
    }

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
/**
 * 노리밋 홀덤 룰셋.
 *
 * 이 파일이 "그 액션이 합법인가"를 판정하고, 그 판정이 곧 사용자에게 가르치는
 * 규칙이 된다. 그래서 무효 액션을 그냥 거절하지 않고 (1) 규정이 처리를 확정하는지
 * (`forced`) (2) 플로어 판단 영역인지 (`td_discretion`) 까지 구분해서 돌려준다.
 * 둘을 뭉개면 판단 영역 문제가 단일 정답으로 출제된다.
 */
import type { PlayerAction } from '../types'
import type { BettingContext, DeclaredIntent, Ruleset, ValidationResult } from './types'

function ok(normalized: PlayerAction): ValidationResult {
  return { valid: true, normalized }
}
function bad(
  reason: string,
  corrected: PlayerAction,
  ruling: 'forced' | 'td_discretion' = 'forced',
): ValidationResult {
  return { valid: false, ruling, reason, corrected }
}

export const nlh: Ruleset = {
  id: 'nlh',
  family: 'flop',
  bettingStructure: 'no-limit',
  holeCardCount: 2,
  streets: ['preflop', 'flop', 'turn', 'river'],

  /**
   * Rule 43-A. 레이즈는 "이번 라운드에 나온 가장 큰 벳 또는 레이즈 폭" 이상이어야 한다.
   * 총액이 아니라 폭이라는 점이 가장 흔한 오해다 (파일럿 케이스 4).
   * 그리고 그 폭은 어떤 경우에도 빅블라인드 아래로 내려가지 않는다.
   */
  minRaiseTo(ctx) {
    return ctx.currentBet + Math.max(ctx.lastRaiseSize, ctx.bigBlind)
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
          /*
           * 벳을 마주한 체크는 "무효 액션"이지 폴드 선언이 아니다. 실제 룸에서 그
           * 체크는 구속력이 없고 그 좌석이 다시 액션한다 — 그래서 forced 가 아니라
           * 플로어 판단 영역이다 (컨트롤러 판정 R19). forced 로 내면 Task 8 이
           * "체크 = 폴드"를 단일 정답으로 출제한다.
           *
           * ⚠️ corrected 의 fold 에는 조항 번호 근거가 없다 — 어느 처리로 갈지는
           * 플로어가 정하므로 이 값은 기본값일 뿐 정답이 아니다
           * (types.ts 의 ValidationResult 주석 참조). TDA 2024 PDF 원문으로 확인할 것.
           */
          return bad('벳이 있으므로 체크할 수 없습니다', { kind: 'fold' }, 'td_discretion')
        }
        return ok(action)

      case 'call': {
        if (ctx.currentBet >= maxTo) return ok({ kind: 'allin', to: maxTo })
        if (action.to < ctx.currentBet) {
          /*
           * Rule 51-B. 언더콜은 한 가지로 처리되지 않는다.
           * 오픈 벳(그 라운드의 첫 벳)에 대한 언더콜은 전액 콜로 확정되고,
           * 그 외(예: 레이즈에 대한 언더콜)는 플로어 재량이다.
           * 이 두 갈래를 구분하는 것이 파일럿 케이스 3 의 핵심이므로
           * 엔진이 둘을 같은 결과로 뭉개면 안 된다.
           */
          return ctx.isOpenBet
            ? bad(
                '오픈 벳에 대한 언더콜은 전액 콜로 처리됩니다',
                { kind: 'call', to: ctx.currentBet },
                'forced',
              )
            : bad(
                '오픈 벳이 아닌 벳에 대한 언더콜입니다 — 플로어 판단 사항입니다',
                { kind: 'call', to: ctx.currentBet },
                'td_discretion',
              )
        }
        return ok({ kind: 'call', to: ctx.currentBet })
      }

      case 'bet':
      case 'raise': {
        // ⚠️ 리오픈 규칙의 조항 번호는 미검증이다 — types.ts 의 canRaise 주석 참조.
        if (!ctx.canRaise) {
          return bad(
            '풀 레이즈에 못 미치는 올인은 베팅을 다시 열지 않습니다 — 콜 또는 폴드만 가능합니다',
            { kind: 'call', to: Math.min(ctx.currentBet, maxTo) },
          )
        }
        if (action.to > maxTo) return bad('스택을 초과합니다', { kind: 'allin', to: maxTo })
        // 정확히 스택 전액인 레이즈는 무효가 아니라 올인이다
        if (action.to === maxTo) return ok({ kind: 'allin', to: maxTo })
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
   * Rule 45-A. 선언이 없는 다수 칩 벳은, 그 칩이 전부 있어야 콜이 되는 경우
   * (= 칩 하나를 빼면 콜 금액에 못 미치는 경우) 콜로 처리한다.
   *
   * pushedTotal 은 "이번에 앞으로 민 칩의 합"이고, ctx.currentBet 은 "총액"이다.
   * 단위가 다르므로 반드시 seatBet 을 더해서 비교해야 한다 — 블라인드를 낸 좌석이나
   * 자기 벳 위에 얹는 좌석에서 이걸 빼먹으면 조용히 오판정한다.
   *
   * ⚠️ "칩 하나를 뺀다"의 해석: 권종이 섞였을 때 어느 칩을 빼느냐로 결론이 뒤집힌다.
   * 여기서는 "모든 칩이 콜에 필요했는가"라는 규칙의 취지에 따라 가장 작은 칩을 뺀다
   * (예: 콜 500 에 1,000+100 을 밀면 100 을 빼도 1,000 이 남아 콜에 충분하므로 레이즈).
   * 발행 전에 TDA 2024 PDF 원문 표현으로 이 해석을 확인할 것.
   */
  interpretChipPush(ctx: BettingContext, pushedTotal: number, declared: DeclaredIntent, chips?: number[]) {
    /*
     * chips 는 pushedTotal 의 내역이다. 둘이 어긋나거나 0·음수 권종이 섞이면
     * "칩 하나를 빼도 콜에 충분한가" 판정이 조용히 뒤집힌다 — [1000, 0] 은 0 을 빼도
     * 총액이 그대로라 무조건 레이즈가 되고, 합이 다르면 없는 칩으로 판정한다.
     * 조용한 오판정은 곧 틀린 규칙을 정답으로 가르치는 것이므로 급소에서 막는다.
     */
    if (chips) {
      if (chips.length === 0 || chips.some((c) => !Number.isInteger(c) || c <= 0)) {
        throw new Error(`칩 권종이 잘못됨: [${chips.join(', ')}]`)
      }
      const sum = chips.reduce((acc, c) => acc + c, 0)
      if (sum !== pushedTotal) {
        throw new Error(`칩 내역 불일치: chips 합 ${sum}, pushedTotal ${pushedTotal}`)
      }
    }

    const maxTo = this.maxRaiseTo(ctx)
    const wagerTo = Math.min(ctx.seatBet + pushedTotal, maxTo)
    const callTo = Math.min(ctx.currentBet, maxTo)

    if (declared === 'allin') return { kind: 'allin', to: maxTo }
    if (declared === 'raise') {
      // 선언한 레이즈가 최소 레이즈에 못 미치면 최소 레이즈로 올린다
      if (wagerTo >= maxTo) return { kind: 'allin', to: maxTo }
      return { kind: 'raise', to: Math.max(wagerTo, this.minRaiseTo(ctx)) }
    }

    // 콜에 못 미치는 언더콜은 여기서 판정하지 않는다 — Rule 51-B 는 오픈 벳인지에
    // 따라 갈리므로 validateAction 을 통과시켜야 한다.
    if (wagerTo <= callTo) return { kind: 'call', to: callTo }

    if (chips && chips.length > 1) {
      const smallest = Math.min(...chips)
      const withoutOne = wagerTo - smallest
      // 칩 하나를 빼도 콜 금액 이상이면 그 칩은 콜에 필요하지 않았다 -> 레이즈
      if (withoutOne >= callTo) {
        return wagerTo >= maxTo ? { kind: 'allin', to: maxTo } : { kind: 'raise', to: wagerTo }
      }
      return { kind: 'call', to: callTo }
    }

    // 칩 구성을 모르면 총액만으로 판정 — 콜에 필요한 만큼만 인정
    return { kind: 'call', to: callTo }
  },
}
```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

Run: `npm test -- nlh`
Expected: PASS, 24 tests

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
import { buildPots } from './pots'

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

  it('라운드가 끝나면 살아 있는 좌석의 벳이 모두 같다', () => {
    // bet > 0 으로 거르면 "아직 한 푼도 안 낸 채 남아 있는 좌석"을 놓친다.
    // 그게 정확히 잡아야 할 위반이므로 필터를 두지 않는다.
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const hd = generateHand({ seed: 'settle-' + n })
      const init = initialState(hd.seats, hd.buttonSeat)
      hd.events.forEach((e, i) => {
        if (e.type !== 'collect_bets') return
        const s = stateAt(init, hd.events, i)
        const live = s.seats.filter((x) => !x.folded && !x.allIn)
        expect(new Set(live.map((x) => x.bet)).size).toBeLessThanOrEqual(1)
      })
    }
  })

  it('생존자가 한 명이 된 뒤에는 보드를 깔지 않는다', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const hd = generateHand({ seed: 'dead-' + n })
      const init = initialState(hd.seats, hd.buttonSeat)
      hd.events.forEach((e, i) => {
        if (e.type !== 'deal_board') return
        const before = stateAt(init, hd.events, i)
        expect(before.seats.filter((x) => !x.folded).length).toBeGreaterThanOrEqual(2)
      })
    }
  })

  it('전원 폴드로 끝난 핸드는 카드를 공개하지 않는다', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const hd = generateHand({ seed: 'muck-' + n })
      const init = initialState(hd.seats, hd.buttonSeat)
      const final = stateAt(init, hd.events, hd.events.length)
      if (final.seats.filter((x) => !x.folded).length >= 2) continue
      expect(hd.events.some((e) => e.type === 'showdown_reveal')).toBe(false)
    }
  })

  it('스택이 칩 단위 표준의 배수다', () => {
    hand.seats.forEach((s) => expect(s.stack % 100).toBe(0))
  })

  it('핸드가 끝나면 팟이 비고 스택 합계가 시작 합계와 같다', () => {
    const init = initialState(hand.seats, hand.buttonSeat)
    const final = stateAt(init, hand.events, hand.events.length)
    const start = hand.seats.reduce((a, s) => a + s.stack, 0)
    expect(final.pot).toBe(0)
    expect(final.seats.reduce((a, s) => a + s.stack, 0)).toBe(start)
  })

  it('좌석 수가 범위를 벗어나면 던진다', () => {
    // 헤즈업은 블라인드 규칙이 달라 이 생성기로는 옳은 핸드가 안 나온다.
    expect(() => generateHand({ seed: 'hu', seatCount: 2 })).toThrow()
    expect(() => generateHand({ seed: 'big', seatCount: 10 })).toThrow()
  })
})

describe('generateHand — 제약', () => {
  it('calculation 을 요구하면 실제로 사이드팟이 생긴다', () => {
    // "올인 이벤트가 2번" 은 사이드팟의 대리 지표일 뿐이다.
    // 계약은 팟 구조이므로 팟 구조로 검증한다.
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const hand = generateHand({ seed: 'calc-' + n, require: ['calculation'] })
      const init = initialState(hand.seats, hand.buttonSeat)
      const final = stateAt(init, hand.events, hand.events.length)
      const pots = buildPots(final.contributed, final.seats.map((s) => s.folded))
      expect(pots.length).toBeGreaterThanOrEqual(2)
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
import { awardPots, buildPots } from './pots'
import { nlh } from './rulesets/nlh'
import type { RulesetId } from './rulesets/types'
import type { HandEvent, HandState, PlayerAction, SeatInit, Street } from './types'

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

export const MIN_SEATS = 3
export const MAX_SEATS = PLAYER_NAMES.length

/**
 * 사이드팟이 나오도록 심은 배역.
 * "올인 이벤트가 2번 나온다"는 사이드팟의 대리 지표일 뿐이라 확률에 맡기면 안 된다.
 * 누가 쏘고 누가 받는지를 좌석으로 확정해야 계약이 계약이 된다.
 */
type StackPlan = {
  stacks: number[]
  /** 프리플랍에 무조건 올인하는 숏스택 두 자리 */
  shoveSeats: number[]
  /** 두 올인을 모두 커버하며 반드시 콜하는 자리 */
  coverSeat: number | null
}

/** 배역이 없는 라운드(프리플랍 외)용 */
const NO_PLAN: StackPlan = { stacks: [], shoveSeats: [], coverSeat: null }

/** 서로 다른 좌석 k 개를 결정론적으로 고른다. */
function pickDistinctSeats(rng: Rng, count: number, k: number): number[] {
  const pool = Array.from({ length: count }, (_, i) => i)
  const out: number[] = []
  for (let i = 0; i < k; i++) out.push(...pool.splice(rng.int(pool.length), 1))
  return out
}

function pickStacks(rng: Rng, count: number, needAllin: boolean): StackPlan {
  const stacks: number[] = []
  for (let i = 0; i < count; i++) stacks.push(rng.pick(STACK_UNITS))
  if (!needAllin) return { stacks, shoveSeats: [], coverSeat: null }

  // 서로 다른 금액의 올인 두 개 + 둘 다 커버하는 한 명
  const [a, b, c] = pickDistinctSeats(rng, count, 3)
  stacks[a] = 8000
  stacks[b] = 12500
  stacks[c] = 47000
  return { stacks, shoveSeats: [a, b], coverSeat: c }
}

function liveCount(s: HandState): number {
  return s.seats.filter((x) => !x.folded).length
}

/** 폴드도 올인도 아닌 좌석 — 아직 액션할 수 있는 사람들 */
function actableSeats(s: HandState): number[] {
  return s.seats
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => !x.folded && !x.allIn)
    .map(({ i }) => i)
}

type BotContext = {
  rng: Rng
  bb: number
  currentBet: number
  lastRaiseSize: number
  isOpenBet: boolean
  canRaise: boolean
  plan: StackPlan
  street: Street
}

/** 봇 한 명의 액션 하나를 고른다. 반드시 그 시점에 합법인 액션만 만든다. */
function decideAction(s: HandState, seat: number, d: BotContext): HandEvent {
  const st = s.seats[seat]
  const allinTo = st.bet + st.stack
  const toCall = d.currentBet - st.bet
  const act = (action: PlayerAction): HandEvent => ({ type: 'player_action', seat, action })

  // 사이드팟 훈련용 배역은 확률에 맡기지 않는다
  if (d.street === 'preflop' && d.plan.shoveSeats.includes(seat)) return act({ kind: 'allin', to: allinTo })
  if (d.street === 'preflop' && d.plan.coverSeat === seat && toCall > 0 && toCall < st.stack) {
    return act({ kind: 'call', to: d.currentBet })
  }

  const roll = d.rng.next()

  // 콜조차 스택을 넘으면 선택지는 올인 콜 아니면 폴드다
  if (toCall >= st.stack) return roll < 0.5 ? act({ kind: 'allin', to: allinTo }) : act({ kind: 'fold' })

  const minTo = nlh.minRaiseTo({
    currentBet: d.currentBet,
    lastRaiseSize: d.lastRaiseSize,
    bigBlind: d.bb,
    seatBet: st.bet,
    seatStack: st.stack,
    isOpenBet: d.isOpenBet,
    canRaise: d.canRaise,
  })
  const aggress = (): HandEvent =>
    minTo >= allinTo
      ? act({ kind: 'allin', to: allinTo })
      : act({ kind: d.currentBet === 0 ? 'bet' : 'raise', to: minTo })

  if (toCall === 0) {
    if (!d.canRaise || roll < 0.6) return act({ kind: 'check' })
    return aggress()
  }

  if (roll < 0.42) return act({ kind: 'fold' })
  if (!d.canRaise || roll < 0.86) return act({ kind: 'call', to: d.currentBet })
  return aggress()
}

/**
 * 베팅 라운드 하나를 끝까지 돌린다.
 *
 * 한 좌석에 한 번씩만 기회를 주고 뒤에서 정산하는 방식은 쓰지 않는다.
 * 그러면 레이즈에 대한 재레이즈가 구조적으로 불가능해져서, 파일럿 케이스 4
 * (A 오픈 -> B 레이즈 -> C 리레이즈 -> D) 같은 상황이 영원히 생성되지 않는다.
 * 최소 레이즈 훈련이 이 제품의 존재 이유 중 하나인데 그 장면을 못 만들면 곤란하다.
 *
 * 종료 조건: 생존자가 1명이 되거나, 액션 가능한 좌석이 전부 한 번 이상 액션했고
 * 그들의 벳이 전부 현재 벳과 같아질 때.
 */
function runBettingRound(
  state: HandState,
  rng: Rng,
  bb: number,
  street: Street,
  plan: StackPlan,
): { events: HandEvent[]; state: HandState } {
  const n = state.seats.length
  const events: HandEvent[] = []
  let s = state

  let currentBet = Math.max(...s.seats.map((x) => x.bet))
  // 프리플랍은 빅블라인드가 오픈 벳 역할을 하므로 레이즈 폭의 출발점이 bb 다.
  let lastRaiseSize = street === 'preflop' ? bb : 0
  let isOpenBet = currentBet === 0

  const acted = new Set<number>()
  /** 마지막 "풀 레이즈" 이후 이미 액션한 좌석. 이들에게는 레이즈 권리가 없다. */
  let actedSinceFullRaise = new Set<number>()

  let seat = street === 'preflop' ? (s.buttonSeat + 3) % n : (s.buttonSeat + 1) % n

  const roundDone = () =>
    liveCount(s) <= 1 ||
    actableSeats(s).every((i) => acted.has(i) && s.seats[i].bet === currentBet)

  for (let guard = 0; ; guard++) {
    // 조용히 빠져나가면 미매칭 벳이 남은 불법 핸드가 만들어진다. 크게 터뜨린다.
    if (guard > n * 12) throw new Error(`베팅 라운드가 끝나지 않음 (street=${street})`)
    if (roundDone()) break

    const st = s.seats[seat]
    if (st.folded || st.allIn || (acted.has(seat) && st.bet === currentBet)) {
      seat = (seat + 1) % n
      continue
    }

    const e = decideAction(s, seat, {
      rng, bb, currentBet, lastRaiseSize, isOpenBet, street, plan,
      canRaise: !actedSinceFullRaise.has(seat),
    })
    events.push(e)
    s = applyEvent(s, e)
    acted.add(seat)
    actedSinceFullRaise.add(seat)

    const newBet = s.seats[seat].bet
    if (newBet > currentBet) {
      const raiseSize = newBet - currentBet
      currentBet = newBet
      isOpenBet = false
      /*
       * 풀 레이즈만 베팅을 다시 연다.
       * 풀 레이즈에 못 미치는 올인은 lastRaiseSize 를 갱신하지도 않는다 —
       * 갱신해버리면 그 뒤 사람의 최소 레이즈가 규정보다 작아진다.
       */
      if (raiseSize >= Math.max(lastRaiseSize, bb)) {
        lastRaiseSize = raiseSize
        actedSinceFullRaise = new Set([seat])
      }
    }

    seat = (seat + 1) % n
  }

  // 아무도 맞추지 않은 초과분은 팟에 넣지 않고 벳한 사람에게 되돌려준다.
  const bets = s.seats.map((x) => x.bet)
  const desc = [...bets].sort((a, b) => b - a)
  const excess = desc[0] - (desc[1] ?? 0)
  if (excess > 0) {
    const e: HandEvent = { type: 'return_uncalled', seat: bets.indexOf(desc[0]), amount: excess }
    events.push(e)
    s = applyEvent(s, e)
  }

  return { events, state: s }
}

export function generateHand(opts: GenerateOptions): Hand {
  const rng = createRng(opts.seed)
  const seatCount = opts.seatCount ?? 6
  const rulesetId = opts.rulesetId ?? 'nlh'
  const needAllin = (opts.require ?? []).includes('calculation')

  /*
   * 헤즈업은 블라인드 규칙이 다르다 — 2인 테이블에서는 버튼이 스몰블라인드이고
   * 프리플랍 액션도 버튼부터 시작한다. 아래의 SB=버튼+1 / UTG=버튼+3 은
   * 3인 이상에서만 성립하므로, 2인은 조용히 틀린 핸드를 만드는 대신 막는다.
   * (V1 범위는 6-max 이고 헤즈업은 별도 구현 대상이다.)
   */
  if (seatCount < MIN_SEATS || seatCount > MAX_SEATS) {
    throw new Error(`좌석 수는 ${MIN_SEATS}~${MAX_SEATS} 만 지원합니다: ${seatCount}`)
  }

  const plan = pickStacks(rng, seatCount, needAllin)
  const seats: SeatInit[] = plan.stacks.map((stack, i) => ({ name: PLAYER_NAMES[i], stack }))
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
    // 생존자 확인이 먼저다. 딜을 먼저 하면 전원 폴드로 끝난 핸드에도
    // 플랍이 깔린다 — 딜러 훈련 제품이 그 장면을 정상 절차로 보여주게 된다.
    if (liveCount(state) <= 1) break

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

    const canAct = actableSeats(state).length
    if (canAct >= 2) {
      const r = runBettingRound(state, rng, blinds.bb, street, street === 'preflop' ? plan : NO_PLAN)
      events.push(...r.events)
      state = r.state
    }

    const collect: HandEvent = { type: 'collect_bets' }
    events.push(collect)
    state = applyEvent(state, collect)
  }

  // 쇼다운 공개. 폴드로 끝난 핸드의 승자는 카드를 보여주지 않고 머크한다 —
  // 여기서 공개하면 딜러가 절대 하면 안 되는 동작을 가르치게 된다.
  if (liveCount(state) >= 2) {
    state.seats.forEach((s, seat) => {
      if (!s.folded) {
        const e: HandEvent = { type: 'showdown_reveal', seat }
        events.push(e)
        state = applyEvent(state, e)
      }
    })
  }

  // 팟 지급까지 해야 핸드가 끝난다. 여기까지 와야 최종 상태의 pot 이 0 이 되고,
  // 칩 보존 테스트가 "팟에 남아 있는 칩"으로 눈감아 주지 않는다.
  const pots = buildPots(state.contributed, state.seats.map((s) => s.folded))
  const awards = awardPots(pots, state.seats.map((s) => s.hole), state.board, buttonSeat)
  for (const a of awards) {
    const e: HandEvent = { type: 'award_pot', potIndex: a.potIndex, seat: a.seat, amount: a.amount }
    events.push(e)
    state = applyEvent(state, e)
  }

  return { seed: opts.seed, rulesetId, seats, buttonSeat, blinds, events }
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npm test -- generate`
Expected: PASS, 13 tests

`calculation` 제약이 깨지면 확률(roll 임계값)을 만지지 말 것 — 그건 테스트가 통과할 때까지 주사위를 굴리는 것이다. `pickStacks` 가 심은 `shoveSeats` / `coverSeat` 배역이 `decideAction` 에서 실제로 강제되고 있는지를 보라. 계약은 "올인이 몇 번 나왔나"가 아니라 "팟이 갈렸나"다.

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
import { generateHand, type Hand } from './generate'
import { initialState, stateAt } from './reduce'
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

  it('선택지에 같은 금액이 두 번 나오지 않는다', () => {
    // 같은 숫자가 두 개면 정답이 둘이거나 문제가 성립하지 않는다
    for (let i = 0; i < 60; i++) {
      extractDecisions(generateHand({ seed: 'dup-' + i })).forEach((d) => {
        if (d.input.type !== 'choice') return
        const nums = d.input.choices.map((c) => c.split(' —')[0])
        expect(new Set(nums).size).toBe(nums.length)
      })
    }
  })

  it('정답이 항상 같은 위치에 있지 않다', () => {
    // 정답 위치가 고정이면 규칙 대신 위치를 학습한다
    const positions = new Set<number>()
    for (let i = 0; i < 60; i++) {
      extractDecisions(generateHand({ seed: 'pos-' + i })).forEach((d) => {
        if (d.input.type === 'choice') positions.add(d.input.correctIndex)
      })
    }
    expect(positions.size).toBeGreaterThan(1)
  })

  it('계산 판단은 실제로 올인이 있었던 핸드에만 붙는다', () => {
    for (let i = 0; i < 60; i++) {
      const hd = generateHand({ seed: 'calcgate-' + i })
      const hasAllin = hd.events.some(
        (e) => e.type === 'player_action' && e.action.kind === 'allin',
      )
      const hasCalc = extractDecisions(hd).some((d) => d.kind === 'calculation')
      if (hasCalc) expect(hasAllin).toBe(true)
    }
  })

  it('같은 시드는 같은 판단 지점을 만든다', () => {
    const a = extractDecisions(generateHand({ seed: 'dp-same' }))
    const b = extractDecisions(generateHand({ seed: 'dp-same' }))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('extractDecisions — 정답 검증', () => {
  it('팟 입력칸의 합은 플레이어들이 실제로 낸 총액과 같다', () => {
    // 구현을 다시 계산해 맞춰보는 게 아니라, 포커에서 항상 참인 항등식으로 본다:
    // 팟에 있는 칩은 누군가 낸 칩이고, 낸 칩은 전부 어느 팟엔가 있다.
    const hand = generateHand({ seed: 'dp-calc', require: ['calculation'] })
    const calc = extractDecisions(hand).find((d) => d.kind === 'calculation')
    expect(calc).toBeDefined()
    if (calc && calc.input.type === 'number') {
      const init = initialState(hand.seats, hand.buttonSeat)
      const final = stateAt(init, hand.events, hand.events.length)
      const paid = final.contributed.reduce((a, c) => a + c, 0)
      expect(calc.input.fields.reduce((a, f) => a + f.answer, 0)).toBe(paid)
      calc.input.fields.forEach((f) => expect(f.answer % 100).toBe(0))
    }
  })

  it('최소 레이즈 문제의 정답 — 손으로 계산한 값과 대조 (파일럿 케이스 4)', () => {
    /*
     * 생성기를 통하지 않고 상황을 직접 만든다. 기대값은 규칙에서 나온다:
     * 블라인드 100/200, UTG 가 600 으로 레이즈.
     * 그 레이즈가 상대한 것은 빅블라인드 200 이므로 레이즈 폭은 600 - 200 = 400 이고
     * 다음 사람의 최소 레이즈 총액은 600 + 400 = 1,000 이다.
     * (600 을 폭으로 착각하면 1,200 이 나온다 — 그게 케이스 4 가 경고하는 오답이다.)
     */
    const fixture: Hand = {
      seed: 'fixture-minraise',
      rulesetId: 'nlh',
      seats: Array.from({ length: 6 }, (_, i) => ({ name: `P${i}`, stack: 50000 })),
      buttonSeat: 0,
      blinds: { sb: 100, bb: 200 },
      events: [
        { type: 'post_blind', seat: 1, amount: 100, kind: 'sb' },
        { type: 'post_blind', seat: 2, amount: 200, kind: 'bb' },
        { type: 'player_action', seat: 3, action: { kind: 'raise', to: 600 } },
      ],
    }

    const dp = extractDecisions(fixture).find((d) => d.kind === 'action_validity')
    expect(dp).toBeDefined()
    if (dp && dp.input.type === 'choice') {
      const picked = dp.input.choices[dp.input.correctIndex]
      expect(picked.startsWith('1,000')).toBe(true)
      // 1,200 은 오답 선택지로 있어도 좋다 — 정답이 아니기만 하면 된다
      expect(picked.startsWith('1,200')).toBe(false)
      expect(dp.input.choices.filter((c) => c.startsWith('1,000'))).toHaveLength(1)
    }
  })

  it('공동 승자가 나오는 팟은 정답 좌석이 여러 개다', () => {
    // 보드 플레이·킥커 동률로 실제 발생한다. 한 명으로 접으면 오답 처리된다.
    for (let i = 0; i < 200; i++) {
      const hd = generateHand({ seed: 'split-' + i })
      const sd = extractDecisions(hd).find((d) => d.kind === 'showdown')
      if (!sd || sd.input.type !== 'seat') continue
      expect(sd.input.correctSeats.length).toBeGreaterThanOrEqual(1)
      sd.input.correctSeats.forEach((s) =>
        expect(sd.input.type === 'seat' && sd.input.options.some((o) => o.seat === s)).toBe(true),
      )
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
import { createRng, type Rng } from './rng'
import { nlh } from './rulesets/nlh'
import type { DecisionKind, Hand } from './generate'
import { CATEGORY_LABEL, evaluateHand } from './evaluate'

export type DecisionInput =
  | { type: 'choice'; choices: string[]; correctIndex: number }
  | { type: 'number'; fields: { label: string; answer: number }[] }
  /** 팟이 갈릴 수 있으므로 정답은 항상 좌석 "집합"이다. 단일 좌석은 원소 하나인 집합이다. */
  | { type: 'seat'; options: { seat: number; label: string }[]; correctSeats: number[] }

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

const fmt = (v: number) => v.toLocaleString('ko-KR')

/**
 * 선택지를 시드 기반으로 섞고 정답 인덱스를 따라 옮긴다.
 * 정답이 항상 0번이면 유저는 규칙 대신 위치를 학습한다
 * (`05_pilot_cases_v1.md` 발행 전 체크리스트의 마지막 항목).
 */
function shuffleChoices(rng: Rng, choices: string[], correctIndex: number) {
  const order = choices.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  return {
    choices: order.map((i) => choices[i]),
    correctIndex: order.indexOf(correctIndex),
  }
}

export function extractDecisions(hand: Hand): DecisionPoint[] {
  const dps: DecisionPoint[] = []
  const n = hand.seats.length
  const sbSeat = (hand.buttonSeat + 1) % n
  const bbSeat = (hand.buttonSeat + 2) % n
  const utgSeat = (hand.buttonSeat + 3) % n
  const initState = initialState(hand.seats, hand.buttonSeat)

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
      // 선택지에 이미 각 좌석이 누구인지 적혀 있으므로 sub 에서 반복하지 않는다.
      // 정답을 sub 에 그대로 써두면 문제가 성립하지 않는다.
      sub: `버튼은 ${hand.seats[hand.buttonSeat].name}(${hand.buttonSeat + 1}번)입니다.`,
      input: { type: 'choice', ...shuffleChoices(createRng(`${hand.seed}:dp-deal`), choices, 0) },
      // ⚠️ 조항 번호 확인 필요: 파일럿 문서에서 Rule 34-A 는 "버튼 위치와 이동" 이다.
      // 딜링 순서의 근거 조항을 TDA 2024 PDF 에서 확인해 이 문자열을 확정할 것.
      ruleRef: 'TDA Rule 34 · 딜링 순서',
      explanation:
        '홀카드는 항상 버튼 왼쪽 첫 좌석, 즉 스몰블라인드부터 시계방향으로 한 장씩 두 바퀴 돌립니다. 액션 순서(프리플랍은 UTG부터)와 딜링 순서를 혼동하는 것이 신입 딜러의 가장 흔한 실수입니다.',
      timeLimitSec: TIME_LIMITS.procedure,
    })
  }

  /*
   * ── 2. 액션 유효성: 첫 벳/레이즈 직후의 최소 레이즈 총액
   *
   * 레이즈 "폭"은 벳 총액이 아니라 (이번 벳 총액 − 직전 최고 벳) 이다.
   * 프리플랍 첫 레이즈는 빅블라인드를 상대로 하므로 600 으로 올렸다면 폭은 400 이고
   * 최소 리레이즈는 1,200 이 아니라 1,000 이다.
   * 벳 총액을 그대로 폭으로 쓰면 파일럿 케이스 4 가 경고하는 바로 그 오해를
   * 엔진이 정답으로 가르치게 된다.
   */
  const raiseIdx = hand.events.findIndex(
    (e) => e.type === 'player_action' && (e.action.kind === 'raise' || e.action.kind === 'bet'),
  )
  if (raiseIdx >= 0) {
    const e = hand.events[raiseIdx]
    if (e.type === 'player_action' && 'to' in e.action) {
      const to = e.action.to
      const before = stateAt(initState, hand.events, raiseIdx)
      const prevBet = Math.max(...before.seats.map((s) => s.bet))
      const raiseSize = to - prevBet

      const answer = nlh.minRaiseTo({
        currentBet: to,
        lastRaiseSize: raiseSize,
        bigBlind: hand.blinds.bb,
        seatBet: 0,
        seatStack: Number.MAX_SAFE_INTEGER,
        isOpenBet: false,
        canRaise: true,
      })

      // 오답 후보. 정답과 겹치거나 서로 겹치는 것은 버린다 —
      // 같은 숫자가 두 번 나오면 문제가 성립하지 않는다.
      const candidates = [
        { to: to + hand.blinds.bb, why: '빅블라인드만큼만 추가' },
        { to: to * 2, why: '직전 벳 총액을 두 배로' },
        { to: to + prevBet, why: '직전 최고 벳만큼 추가' },
        { to: to + Math.floor(raiseSize / 2), why: '레이즈 폭의 절반만 추가' },
      ]
      const seen = new Set<number>([answer])
      const wrong: { to: number; why: string }[] = []
      for (const c of candidates) {
        if (c.to <= to || seen.has(c.to)) continue
        seen.add(c.to)
        wrong.push(c)
        if (wrong.length === 2) break
      }

      // 서로 다른 오답을 두 개 못 만들면 이 핸드에서는 출제하지 않는다
      if (wrong.length === 2) {
        const choices = [
          `${fmt(answer)} — 직전 레이즈 폭 ${fmt(raiseSize)}만큼 추가`,
          ...wrong.map((c) => `${fmt(c.to)} — ${c.why}`),
        ]
        dps.push({
          atEventIndex: raiseIdx + 1,
          kind: 'action_validity',
          prompt: `${hand.seats[e.seat].name}이 ${fmt(to)}으로 ${e.action.kind === 'bet' ? '벳' : '레이즈'}했습니다. 다음 플레이어의 최소 레이즈 총액은?`,
          sub: prevBet > 0
            ? `직전 최고 벳은 ${fmt(prevBet)}이었습니다.`
            : '이번 라운드의 첫 벳입니다.',
          input: { type: 'choice', ...shuffleChoices(createRng(`${hand.seed}:dp-raise`), choices, 0) },
          ruleRef: 'TDA Rule 43-A · Raise Amounts',
          explanation:
            `레이즈는 이번 라운드에 나온 가장 큰 레이즈 "폭" 이상이어야 합니다. 여기서 그 폭은 ${fmt(to)} − ${fmt(prevBet)} = ${fmt(raiseSize)}이므로 최소 총액은 ${fmt(to)} + ${fmt(raiseSize)} = ${fmt(answer)}입니다. 벳 총액을 그대로 폭으로 착각하는 것이 가장 흔한 실수입니다.`,
          timeLimitSec: TIME_LIMITS.action_validity,
        })
      }
    }
  }

  /*
   * ── 3. 금액 계산: 사이드팟이 생기는 경우만
   *
   * pots.length >= 2 가 "올인으로 자격이 갈렸다"와 같은 뜻이 되려면
   * buildPots 가 자격자 집합이 같은 층을 병합하고, 미콜 벳이 팟에 섞이지 않아야 한다.
   * 둘 중 하나라도 빠지면 올인이 하나도 없는 핸드에 "서로 다른 금액의 올인이
   * 나왔습니다" 라는 문제가 출제된다 (수정 전 측정: 296/300).
   */
  const finalState = stateAt(initState, hand.events, hand.events.length)
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
    const awards = awardPots(pots, hole, finalState.board, hand.buttonSeat)
    // 팟은 갈릴 수 있다. 승자를 한 명으로 접으면 공동 승자를 지목한 유저가
    // 오답 처리된다 — 보드 플레이나 킥커 카운터피트로 실제로 나오는 상황이다.
    const winners = awards
      .filter((a) => a.potIndex === 0)
      .map((a) => a.seat)
      .sort((a, b) => a - b)

    if (winners.length > 0) {
      const named = winners.map((s) => finalState.seats[s].name).join(', ')
      const category = CATEGORY_LABEL[
        evaluateHand([...hole[winners[0]], ...finalState.board]).category
      ]
      const split = winners.length > 1

      dps.push({
        atEventIndex: hand.events.length,
        kind: 'showdown',
        prompt: split
          ? `메인팟 ${fmt(mainPot.amount)}은 누구에게 갑니까? (해당하는 좌석을 모두 고르세요)`
          : `메인팟 ${fmt(mainPot.amount)}은 누구에게 갑니까?`,
        sub: `보드 ${finalState.board.map((c) => c.rank + c.suit).join(' ')}`,
        input: {
          type: 'seat',
          options: mainPot.eligibleSeats.map((seat) => ({
            seat,
            label: `${finalState.seats[seat].name} — ${finalState.seats[seat].hole.map((c) => c.rank + c.suit).join(' ')}`,
          })),
          correctSeats: winners,
        },
        ruleRef: 'TDA Rule 21 · 사이드팟 지급 순서',
        explanation: split
          ? `${named}이 ${category}로 동일해 메인팟을 나눠 갖습니다. 나눠떨어지지 않는 홀칩은 버튼 왼쪽 첫 자격자에게 갑니다.`
          : pots.length >= 2
            ? `${named}이 ${category}로 메인팟을 가져갑니다. 사이드팟은 참가 자격이 다르므로 승자가 다를 수 있습니다 — 숏스택이 메인팟을 이기고 사이드팟은 다른 사람이 가져가는 구조가 현장에서 가장 자주 잘못 지급됩니다.`
            : `${named}이 ${category}로 팟을 가져갑니다.`,
        timeLimitSec: TIME_LIMITS.showdown,
      })
    }
  }

  return dps.sort((a, b) => a.atEventIndex - b.atEventIndex)
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npm test -- decisions`
Expected: PASS, 16 tests

일부 시드에서 사이드팟이나 쇼다운이 안 나와 테스트가 실패하면, 테스트의 시드를 바꾸지 말고 `generateHand`에 `require: ['calculation']`이 제대로 동작하는지 먼저 확인할 것. 그래도 안 나오면 Task 7의 `pickStacks`가 심는 배역을 확인한다.

**최소 레이즈 픽스처 테스트는 절대 구현에 맞추지 말 것.** 1,000 은 TDA Rule 43-A 와 파일럿 케이스 4 에서 나온 숫자다. 이 테스트가 빨간불이면 틀린 쪽은 `extractDecisions` 다.

**알고 있어야 할 한계:** 봇이 항상 최소 금액만 벳하므로 스택(8,000~88,000)이 위협받는 일이 없고, 그래서 `require: ['calculation']` 없이는 사이드팟이 자연 발생하지 않는다 (2,000 시드 측정 0건). 엔진의 계약 위반은 아니지만 — 계산 판단 지점은 요청해야 나온다 — 벳 사이징에 변화를 주는 것은 2단계 과제로 남는다.

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
  input: { type: 'seat', options: [{ seat: 1, label: 'a' }, { seat: 3, label: 'b' }], correctSeats: [3] },
  ruleRef: 'r', explanation: 'e', timeLimitSec: 30,
}

const splitDp: DecisionPoint = {
  atEventIndex: 3, kind: 'showdown', prompt: 'q', sub: '',
  input: { type: 'seat', options: [{ seat: 1, label: 'a' }, { seat: 3, label: 'b' }], correctSeats: [1, 3] },
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
    expect(scoreDecision(seatDp, { type: 'seat', seats: [3] }).score).toBe(100)
  })

  it('분할 팟은 승자를 모두 골라야 정답이다', () => {
    expect(scoreDecision(splitDp, { type: 'seat', seats: [1, 3] }).score).toBe(100)
    expect(scoreDecision(splitDp, { type: 'seat', seats: [3, 1] }).score).toBe(100) // 순서 무관
    expect(scoreDecision(splitDp, { type: 'seat', seats: [3] }).score).toBe(0)      // 한 명만 지목
  })

  it('단독 승자인데 두 명을 고르면 오답이다', () => {
    expect(scoreDecision(seatDp, { type: 'seat', seats: [1, 3] }).score).toBe(0)
  })

  it('답 종류가 판단 지점과 안 맞으면 0점', () => {
    expect(scoreDecision(choiceDp, { type: 'seat', seats: [3] }).score).toBe(0)
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
  /** 팟이 갈리면 승자가 여럿이다. 한 명만 고르면 그것도 오답이다. */
  | { type: 'seat'; seats: number[] }
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
    // 승자 집합이 정확히 일치해야 정답이다.
    // 분할 팟에서 한 명만 지목하는 것은 지급을 틀리는 것과 같다.
    const want = [...dp.input.correctSeats].sort((a, b) => a - b)
    const got = Array.from(new Set(answer.seats)).sort((a, b) => a - b)
    const correct = want.length === got.length && want.every((s, i) => s === got[i])
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
Expected: PASS, 18 tests

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
  initialState, stateAt, nlh,
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

  it('핸드가 끝나면 팟이 남지 않는다', () => {
    seeds.forEach((seed) => {
      const hand = generateHand({ seed })
      const init = initialState(hand.seats, hand.buttonSeat)
      expect(stateAt(init, hand.events, hand.events.length).pot).toBe(0)
    })
  })
})

describe('엔진 통합 — 생성된 핸드가 규칙에 맞는가', () => {
  /*
   * 이 블록이 이 계획서에서 가장 중요한 테스트다.
   * 생성기가 만든 액션 하나하나를 룰셋에게 되물어 합법인지 확인한다.
   * 생성기와 룰셋이 서로를 검산하므로, 한쪽만 틀리면 여기서 걸린다.
   * (수정 전 구현은 이 검사에서 대량으로 걸렸다 — 300 시드 중 119 핸드가
   *  전원 폴드 후에도 보드를 깔았고, 150 핸드가 승자의 카드를 공개했다.)
   */
  const seeds = Array.from({ length: 100 }, (_, i) => `rule-${i}`)

  it('모든 플레이어 액션이 그 시점에 합법이다', () => {
    seeds.forEach((seed) => {
      const hand = generateHand({ seed })
      const init = initialState(hand.seats, hand.buttonSeat)
      let currentBet = 0
      let lastRaiseSize = 0
      let isOpenBet = true
      let sinceFullRaise = new Set<number>()

      hand.events.forEach((e, i) => {
        const before = stateAt(init, hand.events, i)

        if (e.type === 'deal_board' || e.type === 'collect_bets') {
          currentBet = 0
          lastRaiseSize = 0
          isOpenBet = true
          sinceFullRaise = new Set()
          return
        }
        if (e.type === 'post_blind') {
          currentBet = Math.max(currentBet, e.amount)
          lastRaiseSize = hand.blinds.bb
          return
        }
        if (e.type !== 'player_action') return

        const st = before.seats[e.seat]
        expect(st.folded).toBe(false)
        expect(st.allIn).toBe(false)

        const r = nlh.validateAction(
          {
            currentBet,
            lastRaiseSize,
            bigBlind: hand.blinds.bb,
            seatBet: st.bet,
            seatStack: st.stack,
            isOpenBet,
            canRaise: !sinceFullRaise.has(e.seat),
          },
          e.action,
        )
        expect(r.valid).toBe(true)

        const after = stateAt(init, hand.events, i + 1)
        const newBet = after.seats[e.seat].bet
        sinceFullRaise.add(e.seat)
        if (newBet > currentBet) {
          const size = newBet - currentBet
          currentBet = newBet
          isOpenBet = false
          if (size >= Math.max(lastRaiseSize, hand.blinds.bb)) {
            lastRaiseSize = size
            sinceFullRaise = new Set([e.seat])
          }
        }
      })
    })
  })

  it('생존자가 한 명이 된 뒤에는 보드도 공개도 없다', () => {
    seeds.forEach((seed) => {
      const hand = generateHand({ seed })
      const init = initialState(hand.seats, hand.buttonSeat)
      hand.events.forEach((e, i) => {
        if (e.type !== 'deal_board' && e.type !== 'showdown_reveal') return
        const before = stateAt(init, hand.events, i)
        expect(before.seats.filter((s) => !s.folded).length).toBeGreaterThanOrEqual(2)
      })
    })
  })
})

describe('엔진 통합 — 전체 플레이 루프', () => {
  // 주의: 이 테스트는 채점 배선이 이어져 있는지를 보는 것이지
  // 판단 지점의 정답이 규칙에 맞는지를 보는 것이 아니다.
  // 정답 자체의 검증은 Task 8 의 픽스처 테스트가 한다.
  it('생성 → 판단 추출 → 전부 정답 → 만점', () => {
    const hand = generateHand({ seed: 'loop-perfect', require: ['calculation'] })
    const dps = extractDecisions(hand)
    expect(dps.length).toBeGreaterThan(0)

    const results = dps.map((dp) => {
      if (dp.input.type === 'choice') return scoreDecision(dp, { type: 'choice', index: dp.input.correctIndex })
      if (dp.input.type === 'seat') return scoreDecision(dp, { type: 'seat', seats: dp.input.correctSeats })
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
export { buildPots, awardPots, ODD_CHIP_UNIT, type Pot, type PotAward } from './pots'
export { nlh } from './rulesets/nlh'
export type {
  Ruleset, RulesetId, BettingContext, ValidationResult, DeclaredIntent,
} from './rulesets/types'
export {
  generateHand, PLAYER_NAMES, MIN_SEATS, MAX_SEATS,
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
Expected: PASS, 9 tests

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
