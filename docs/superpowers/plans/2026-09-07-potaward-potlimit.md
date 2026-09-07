# PLO8 팟 분배 · 팟리밋 계산 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PLO8 격자의 남은 두 칸(팟 분배 · 팟리밋 계산)을 열고, 그 아래에 하이로우 평가 원자와 팟리밋 룰셋을 세운다.

**Architecture:** 엔진(`lib/simulator`)이 `HandEvaluator` 포트를 정의하고 게임 층(`lib/games`)의 `evaluatorFor(spec)` 가 어댑터를 댄다. `awardPots` 는 그 포트만 받아 하이/로우로 갈린다. 팟리밋은 `Ruleset` 에 `pl` 을 더하고 `BettingContext` 에 `pot` 을 넣어 `maxRaiseTo` 가 팟을 알게 한다. 화면 둘은 `RushScreen` 을 고치지 않고 `renderQuestion` 만 새로 쓴다.

**Tech Stack:** TypeScript · Next.js 16 (App Router) · React · Tailwind · vitest · Playwright

**Spec:** `docs/superpowers/specs/2026-09-07-potaward-potlimit-design.md`

## Global Constraints

이 레포의 전역 제약이다. **모든 태스크의 요구사항에 이것이 암묵적으로 포함된다.**

1. **정답은 엔진이 낸다.** 화면 코드(`components/`, `app/`)에 규칙 판정을 쓰지 마라.
2. **시드 결정론.** 생성기·화면 어디서도 렌더 중에 `Math.random()`/`randomSeed()` 를 쓰지 마라. 무작위는 `createRng(seed)` 가 준 `Rng` 로만 얻는다.
3. **불변.** 리듀서와 순수 함수는 입력을 뮤테이트하지 않는다. 스프레드로 새 객체를 만든다.
4. **판정에 표시 라벨을 쓰지 마라.** `spec.betting`·`spec.eval` 코드값으로 갈라라. `spec.labels.*` 와 `spec.id` 는 판정에 읽지 않는다.
5. **자료에 없는 것을 짐작으로 채우지 마라.** 없으면 `throw` 로 정직하게 실패시키고, 사용자에게 물어 출처를 `사용자 확인 (날짜)` 로 적어라.
6. **실제 브라우저에서 눈으로 봐라.** 코드 리뷰를 통과한 결함이 지난 두 세션 모두 브라우저에서 잡혔다.
7. **완료는 실행 출력으로만 주장한다.** 「통과할 것이다」는 근거가 아니다.
8. **말투.** 이름 뒤 조사는 붙여 쓴다(`4번이다`). 명령형은 「…하세요」로 통일한다.
9. **`RushScreen` 을 복사하지 마라.** props 가 부족하면 props 를 늘려라.
10. **기존 localStorage 키를 지우지 마라** — `potrush.best` · `actionrush.best` · `mixdeal.best` · `mixroom.best` · `plo8.lowreading.best` · `plo8.winner.best`.
11. **`raiseCap` 값을 읽는 코드를 쓰지 마라.**

**검증 명령** (레포 루트 기준 `app/` 안에서 실행):

```bash
cd app
npx vitest run              # 전체 단위 테스트 (착수 시점 기준선: 450 통과 / 0 실패)
npx tsc --noEmit            # 0 errors 여야 한다
npx playwright test         # 착수 시점 기준선: 10 통과
npm run lint                # 1 error 가 기존 baseline 이다 (ProcedureScreen 하이드레이션) — 늘어나면 안 된다
```

**단계 경계:** Phase A(태스크 1~6)와 Phase B(태스크 7~10)는 서로를 모른다. A 가 막혀도 B 는 갈 수 있고, 각각 따로 재미 게이트를 받는다.

---

# Phase A — 팟 분배

## Task 1: `HandEvaluator` 포트와 `evaluatorFor(spec)` 어댑터

**Files:**
- Modify: `app/src/lib/simulator/evaluate.ts` (파일 끝에 타입 추가)
- Modify: `app/src/lib/simulator/index.ts` (타입 재수출)
- Create: `app/src/lib/games/evaluator.ts`
- Modify: `app/src/lib/games/index.ts` (재수출)
- Test: `app/src/lib/games/evaluator.test.ts`

**Interfaces:**
- Consumes: `evaluateHand(cards: Card[]): HandRank`, `compareHands(a, b): number` (`lib/simulator/evaluate.ts`), `bestOmahaHi(hole, board): HandRank`, `bestOmahaLow(hole, board, qualifier): LowRank | null` (`lib/simulator/omaha.ts`), `GameSpec`·`EvalSpec` (`lib/games/types.ts`)
- Produces: `type HandEvaluator = { rankHi(hole: Card[], board: Card[]): HandRank; rankLo: null | ((hole: Card[], board: Card[]) => LowRank | null) }` 와 `evaluatorFor(spec: GameSpec): HandEvaluator`. Task 2·3·4 가 이 둘을 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`app/src/lib/games/evaluator.test.ts` 를 새로 만든다.

```ts
import { describe, expect, it } from 'vitest'
import { parseCard } from '@/lib/simulator'
import { GAMES } from './index'
import { evaluatorFor } from './evaluator'
import type { GameSpec } from './types'

const hand = (s: string) => s.split(' ').map(parseCard)

describe('evaluatorFor — PLO8', () => {
  const ev = evaluatorFor(GAMES.plo8)

  it('하이는 오마하 2+3 을 강제한다 — 홀의 스트레이트를 혼자 쓰지 못한다', () => {
    // 홀에 A K Q J 가 있어도 보드 3장을 반드시 써야 하므로 스트레이트가 되지 않는다
    const hole = hand('As Ks Qs Js')
    const board = hand('2h 7d 9c 4s 5h')
    const rank = ev.rankHi(hole, board)
    // 하이카드 A (스트레이트도 플러시도 아니다). category 0 = 하이카드
    expect(rank.category).toBe(0)
  })

  it('로우는 8 이하 자격을 지킨다 — 자격 미달이면 null 이다', () => {
    expect(ev.rankLo).not.toBeNull()
    const rankLo = ev.rankLo as NonNullable<typeof ev.rankLo>
    // 보드에 8 이하가 2장뿐이라 로우가 성립할 수 없다
    expect(rankLo(hand('As 2h 3d 4c'), hand('Kh Qd Jc 9s 5h'))).toBeNull()
  })

  it('로우가 성립하면 LowRank 를 낸다', () => {
    const rankLo = ev.rankLo as NonNullable<typeof ev.rankLo>
    const low = rankLo(hand('As 2h Kd Qc'), hand('3h 4d 5c Kh Qs'))
    expect(low).not.toBeNull()
  })
})

describe('evaluatorFor — 노리밋 홀덤', () => {
  const ev = evaluatorFor(GAMES.nlh)

  it('강제 조합이 없으면 일곱 장에서 가장 좋은 다섯 장을 고른다', () => {
    const rank = ev.rankHi(hand('As Ks'), hand('Qs Js Ts 2h 3d'))
    // 로열 = 스트레이트 플러시. category 8 이 최상위다
    expect(rank.category).toBe(8)
  })

  it('로우가 없는 종목은 rankLo 가 null 이다', () => {
    expect(ev.rankLo).toBeNull()
  })
})

describe('evaluatorFor — 아직 만들지 않은 갈래는 던진다', () => {
  it('공유 보드가 없는 종목은 던진다', () => {
    const stud = { ...GAMES.plo8, family: 'stud' } as GameSpec
    expect(() => evaluatorFor(stud)).toThrow()
  })

  it('강제 조합 없는 하이로우는 던진다', () => {
    const oddball = {
      ...GAMES.plo8,
      eval: { ...GAMES.plo8.eval, mustUse: null },
    } as GameSpec
    expect(() => evaluatorFor(oddball)).toThrow()
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd app && npx vitest run src/lib/games/evaluator.test.ts`
Expected: FAIL — `Failed to resolve import "./evaluator"`

- [ ] **Step 3: 포트를 `evaluate.ts` 에 더한다**

`app/src/lib/simulator/evaluate.ts` 맨 위 import 에 타입 하나를 더하고(런타임 순환이 없도록 **반드시 `import type`**), 파일 **끝**에 타입을 추가한다.

```ts
// 파일 상단 import 구역에 추가
import type { LowRank } from './lowball'
```

```ts
// 파일 끝에 추가

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
```

`app/src/lib/simulator/index.ts` 의 `evaluate` 재수출 줄에 `HandEvaluator` 를 더한다 (기존 줄에 `type HandEvaluator` 를 추가하는 것이지 새 줄을 만드는 것이 아니다).

- [ ] **Step 4: 어댑터를 만든다**

`app/src/lib/games/evaluator.ts` 를 새로 만든다.

```ts
/**
 * 종목 스펙 → 핸드 평가기.
 *
 * **`spec.eval` 만 읽는다.** `spec.id` 도 표시 라벨도 읽지 않는다 — 종목 이름으로
 * 갈라면 종목이 늘 때마다 이 파일에 if 가 하나씩 붙고, 그것이 격자가 막으려는 것이다.
 *
 * 아직 만들지 않은 갈래는 **던진다.** 조용히 하이만 평가하면 훈련생이 틀린 분배를
 * 정답으로 배운다 — 승자 판독 설계 §6 이 세운 규율을 그대로 잇는다.
 */
import {
  bestOmahaHi, bestOmahaLow, evaluateHand,
  type HandEvaluator,
} from '@/lib/simulator'
import type { GameSpec } from './types'

export function evaluatorFor(spec: GameSpec): HandEvaluator {
  if (spec.family !== 'flop') {
    throw new Error(
      `공유 보드가 없는 종목의 평가기는 아직 없다: ${spec.family} — 스터드·라즈가 붙을 때 만든다`,
    )
  }

  const { mustUse, lo } = spec.eval

  // 아무 다섯 장으로 고르는 종목 (홀덤 계열)
  if (mustUse === null) {
    if (lo !== null) {
      throw new Error('강제 조합 없는 하이로우는 아직 없다 — 스터드/8 이 붙을 때 만든다')
    }
    return {
      rankHi: (hole, board) => evaluateHand([...hole, ...board]),
      rankLo: null,
    }
  }

  // 오마하 강제 조합 (홀 2 + 보드 3)
  if (lo === null) {
    return { rankHi: (hole, board) => bestOmahaHi(hole, board), rankLo: null }
  }
  if (lo.kind !== 'a5') {
    throw new Error(`아직 없는 로우 방식: ${lo.kind} — 자료를 확인한 뒤 채운다`)
  }
  if (lo.qualifier === null) {
    throw new Error('자격 없는 로우는 아직 없다 — 라즈가 붙을 때 만든다')
  }

  const qualifier = lo.qualifier
  return {
    rankHi: (hole, board) => bestOmahaHi(hole, board),
    rankLo: (hole, board) => bestOmahaLow(hole, board, qualifier),
  }
}
```

`app/src/lib/games/index.ts` 에 `export { evaluatorFor } from './evaluator'` 를 더한다.

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd app && npx vitest run src/lib/games/evaluator.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 6: 전체 회귀와 타입을 확인한다**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: 456 통과 / 0 실패 (기존 450 + 신규 6), tsc 0 errors

- [ ] **Step 7: 커밋**

```bash
git add app/src/lib/simulator/evaluate.ts app/src/lib/simulator/index.ts \
        app/src/lib/games/evaluator.ts app/src/lib/games/index.ts \
        app/src/lib/games/evaluator.test.ts
git commit -m "feat: 스펙에서 핸드 평가기를 만드는 원자를 세운다"
```

---

## Task 2: 승자 판독을 `evaluatorFor` 로 이관한다 (동작 불변)

**Files:**
- Modify: `app/src/lib/drills/winner/generate.ts:10-17`(import), `:26-44`(`dealOnce`), `:114-125`(`generateWinnerRun` 의 가드)
- Test: 기존 `app/src/lib/drills/winner/generate.test.ts` (수정하지 않는다 — **통과가 곧 검증이다**)

**Interfaces:**
- Consumes: Task 1 의 `evaluatorFor(spec)` · `HandEvaluator`
- Produces: 없음 (내부 이관). `generateWinnerRun(spec, seed)` 의 시그니처와 출력은 **한 글자도 바뀌지 않는다**

- [ ] **Step 1: 이관 전 기준선을 찍는다**

Run: `cd app && npx vitest run src/lib/drills/winner/`
Expected: PASS. **통과 개수를 적어 둔다** — 이관 뒤 같은 수여야 한다.

- [ ] **Step 2: `dealOnce` 가 평가기를 받게 고친다**

`generate.ts` 의 import 에서 `bestOmahaHi`·`bestOmahaLow` 를 빼고 `evaluatorFor` 를 넣는다.

```ts
import {
  compareHands, compareLow, createRng, makeDeck, shuffle,
  type Card, type HandEvaluator, type HandRank, type LowRank, type Rng,
} from '@/lib/simulator'
import { evaluatorFor, type GameSpec } from '@/lib/games'
```

`dealOnce` 를 고친다 — `spec.eval` 을 직접 들여다보던 자리가 평가기로 바뀐다.

```ts
function dealOnce(spec: GameSpec, rng: Rng, asks: WinnerAsks, ev: HandEvaluator): Deal {
  const deck = shuffle(makeDeck(), rng)
  const board = deck.slice(0, 5)
  const n = spec.holeCardCount
  const seats = NAMES.slice(0, WINNER_SEAT_COUNT).map((name, i) => ({
    name,
    hole: deck.slice(5 + i * n, 5 + (i + 1) * n),
  }))
  return {
    seats,
    board,
    his: seats.map((s) => ev.rankHi(s.hole, board)),
    los: seats.map((s) => (asks.lo && ev.rankLo !== null ? ev.rankLo(s.hole, board) : null)),
  }
}
```

- [ ] **Step 3: `generateWinnerRun` 의 가드를 평가기에 넘긴다**

`mustUse === null` 을 직접 검사하던 줄을 지운다 — 그 판정은 이제 `evaluatorFor` 안에 있고, 두 곳에 두면 갈라진다. `!asks.hi` 가드는 남긴다(그건 평가기가 아니라 이 드릴의 제약이다).

```ts
export function generateWinnerRun(spec: GameSpec, seed: string): WinnerQuestion[] {
  const asks = asksFor(spec)

  // 이 드릴 고유의 제약이다 — 평가기가 아니라 문제 모양의 문제다
  if (!asks.hi) throw new Error('로우 전용 종목은 아직 없다 — 라즈가 붙을 때 만든다')

  // 아직 만들지 않은 평가 갈래는 여기서 던진다 (lib/games/evaluator.ts)
  const ev = evaluatorFor(spec)

  const rng = createRng(seed)
  return loTargets(rng).map((want) => {
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      const deal = dealOnce(spec, rng, asks, ev)
      if (want === null || loWinners(deal).length > 0 === want) {
        return build(deal, asks, rng.int(WINNER_SEAT_COUNT))
      }
    }
    throw new Error(`문제를 만들지 못했다 — 목표 로우 ${want}, 시도 ${MAX_TRIES}회`)
  })
}
```

> `MAX_TRIES` 초과 시 던지는 마지막 줄은 **기존 코드에 이미 있다.** 위 블록에 함께 적은 것은 함수 전체 모양을 보이기 위해서다 — 원본의 그 줄을 지우거나 문구를 바꾸지 마라.

- [ ] **Step 4: 같은 시드가 같은 문제를 내는지 확인한다**

Run: `cd app && npx vitest run src/lib/drills/winner/`
Expected: PASS — **Step 1 과 같은 개수.** 하나라도 줄거나 실패하면 이관이 동작을 바꾼 것이다. 되돌리고 원인을 찾아라.

- [ ] **Step 5: 전체 회귀**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: 456 통과 / 0 실패, tsc 0 errors

- [ ] **Step 6: 커밋**

```bash
git add app/src/lib/drills/winner/generate.ts
git commit -m "refactor: 승자 판독을 evaluatorFor 로 옮긴다 — 판정 사본 제거"
```

---

## Task 3: `awardPots` 를 하이로우로 확장한다

**Files:**
- Modify: `app/src/lib/simulator/pots.ts` (`PotAward` 타입 · `awardPots` 본문 · 헬퍼 셋 추가)
- Modify: `app/src/lib/simulator/index.ts` (변경 없음 — 이미 `awardPots`·`PotAward` 를 내보낸다. 확인만)
- Modify: `app/src/lib/rush/generate.test.ts` (`awardPots` 호출 3곳에 평가기 인자 추가)
- Modify: `app/src/lib/rush/oddchip.order.test.ts` (같은 이유)
- Test: `app/src/lib/simulator/pots.hilo.test.ts` (신규)

**Interfaces:**
- Consumes: Task 1 의 `HandEvaluator`; 기존 `Pot`·`orderFromButton`·`ODD_CHIP_UNIT`·`compareHands`·`compareLow`
- Produces: `awardPots(pots, hole, board, buttonSeat, evaluator): PotAward[]` 와 `PotAward = { potIndex: number; seat: number; amount: number; half: 'hi' | 'lo' }`. Task 4 가 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`app/src/lib/simulator/pots.hilo.test.ts` 를 새로 만든다.

```ts
/**
 * 하이로우 분배 — 홀칩이 두 번 생긴다.
 *
 * 반으로 가를 때 한 번(하이 쪽으로), 각 절반을 동점자끼리 나눌 때 또 한 번
 * (버튼 왼쪽부터). 둘을 한 번으로 합치면 쿼터링에서 금액이 어긋난다.
 */
import { describe, expect, it } from 'vitest'
import { GAMES, evaluatorFor } from '@/lib/games'
import { parseCard } from './cards'
import { awardPots, buildPots, ODD_CHIP_UNIT, type Pot } from './pots'

const hand = (s: string) => s.split(' ').map(parseCard)
const ev = evaluatorFor(GAMES.plo8)
const evHi = evaluatorFor(GAMES.nlh)

/** 지급 합계 */
const total = (awards: { amount: number }[]) => awards.reduce((s, a) => s + a.amount, 0)

describe('awardPots — 하이로우', () => {
  it('로우가 성립하지 않으면 하이가 전부 가져간다 (스쿱)', () => {
    // 보드에 8 이하가 2장뿐 — 로우 자체가 불가능하다
    const board = hand('Kh Qd Jc 9s 5h')
    const hole = [hand('As Ah 2d 3c'), hand('Ks Kd 4h 6c')]
    const pots: Pot[] = [{ amount: 10000, eligibleSeats: [0, 1] }]
    const awards = awardPots(pots, hole, board, 0, ev)

    expect(total(awards)).toBe(10000)
    expect(awards.every((a) => a.half === 'hi')).toBe(true)
  })

  it('하이와 로우가 갈리면 반씩 가고, 남는 칩은 하이 쪽이다', () => {
    const board = hand('2h 4d 6c Ks Qh')
    // 0번: 보드와 A-3 으로 로우, 1번: 킹 투페어로 하이
    const hole = [hand('As 3d Ts 9h'), hand('Kh Kd 9s 8c')]
    const pots: Pot[] = [{ amount: 8100, eligibleSeats: [0, 1] }]
    const awards = awardPots(pots, hole, board, 0, ev)

    expect(total(awards)).toBe(8100)
    const hi = awards.filter((a) => a.half === 'hi')
    const lo = awards.filter((a) => a.half === 'lo')
    // 8,100 은 100 단위로 반이 안 갈린다 — 하이 4,100 · 로우 4,000
    expect(total(hi)).toBe(4100)
    expect(total(lo)).toBe(4000)
  })

  it('모든 지급액이 칩 단위의 배수다', () => {
    const board = hand('2h 4d 6c Ks Qh')
    const hole = [hand('As 3d Ts 9h'), hand('Kh Kd 9s 8c')]
    const awards = awardPots([{ amount: 8100, eligibleSeats: [0, 1] }], hole, board, 0, ev)
    for (const a of awards) expect(a.amount % ODD_CHIP_UNIT).toBe(0)
  })

  it('지급 좌석은 그 팟의 자격자 안에 있다', () => {
    const board = hand('2h 4d 6c Ks Qh')
    const hole = [hand('As 3d Ts 9h'), hand('Kh Kd 9s 8c'), hand('7s 7d 3h 3c')]
    const pots = buildPots([1000, 3000, 3000], [false, false, false])
    const awards = awardPots(pots, hole, board, 0, ev)
    for (const a of awards) {
      expect(pots[a.potIndex].eligibleSeats).toContain(a.seat)
    }
    expect(total(awards)).toBe(7000)
  })

  it('자격자가 한 명뿐인 팟은 쇼다운 없이 그 좌석이 받는다', () => {
    const board = hand('2h 4d 6c Ks Qh')
    const hole = [hand('As 3d Ts 9h'), hand('Kh Kd 9s 8c')]
    const awards = awardPots([{ amount: 500, eligibleSeats: [1] }], hole, board, 0, ev)
    expect(awards).toEqual([{ potIndex: 0, seat: 1, amount: 500, half: 'hi' }])
  })
})

describe('awardPots — 로우 없는 종목은 예전과 같다', () => {
  it('노리밋 홀덤에는 half:lo 지급이 하나도 없다', () => {
    const board = hand('2h 4d 6c Ks Qh')
    const hole = [hand('As 3d'), hand('Kh Kd')]
    const awards = awardPots([{ amount: 10000, eligibleSeats: [0, 1] }], hole, board, 0, evHi)
    expect(awards.every((a) => a.half === 'hi')).toBe(true)
    expect(total(awards)).toBe(10000)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd app && npx vitest run src/lib/simulator/pots.hilo.test.ts`
Expected: FAIL — `awardPots` 가 5번째 인자를 받지 않아 타입/동작이 어긋난다

- [ ] **Step 3: `pots.ts` 를 고친다**

`PotAward` 에 `half` 를 더한다.

```ts
export type PotAward = { potIndex: number; seat: number; amount: number; half: 'hi' | 'lo' }
```

`awardPots` 본문을 아래로 갈아 끼운다. **좌석 수 가드(기존 `pots.ts:106-116`)는 그대로 둔다** — 지우지 마라.

```ts
export function awardPots(
  pots: Pot[],
  hole: Card[][],
  board: Card[],
  buttonSeat: number,
  evaluator: HandEvaluator,
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

    /*
     * 자격자가 한 명이면 쇼다운이 없다. 보드가 5장이 아닌 채로 끝난 핸드
     * (전원 폴드) 에서 평가기를 부르면 카드가 모자라 던진다.
     * 반으로 가르지도 않는다 — 나눌 상대가 없다.
     */
    if (pot.eligibleSeats.length === 1) {
      awards.push({ potIndex, seat: pot.eligibleSeats[0], amount: pot.amount, half: 'hi' })
      return
    }

    // **팟마다 다시 구한다** — 팟마다 자격자가 다르므로 임자도 다르다
    const hiSet = hiSeats(pot.eligibleSeats, hole, board, evaluator)
    const loSet = loSeats(pot.eligibleSeats, hole, board, evaluator)

    // 로우 성립자가 없으면 하이가 전부 가져간다 (가이드 p5)
    if (loSet.length === 0) {
      pushShare(awards, potIndex, 'hi', pot.amount, hiSet, buttonSeat, seatCount)
      return
    }

    const half = splitHalf(pot.amount)
    pushShare(awards, potIndex, 'hi', half.hi, hiSet, buttonSeat, seatCount)
    pushShare(awards, potIndex, 'lo', half.lo, loSet, buttonSeat, seatCount)
  })

  return awards
}
```

헬퍼 넷을 `awardPots` 아래에 더한다.

```ts
/** 이 팟 자격자 중 하이 최고 동률 좌석들. **동점이면 여럿이다** — 걸러내지 않는다 */
function hiSeats(
  eligible: number[], hole: Card[][], board: Card[], ev: HandEvaluator,
): number[] {
  const ranked = eligible.map((seat) => ({ seat, rank: ev.rankHi(hole[seat], board) }))
  let best = ranked[0].rank
  for (const r of ranked) if (compareHands(r.rank, best) > 0) best = r.rank
  return ranked.filter((r) => compareHands(r.rank, best) === 0).map((r) => r.seat)
}

/** 자격을 통과한 것 중 최저 동률 좌석들. 자격자가 없으면 빈 배열이고 그것이 「로우 없음」이다 */
function loSeats(
  eligible: number[], hole: Card[][], board: Card[], ev: HandEvaluator,
): number[] {
  const rankLo = ev.rankLo
  if (rankLo === null) return []
  const ranked = eligible.flatMap((seat) => {
    const low = rankLo(hole[seat], board)
    return low === null ? [] : [{ seat, low }]
  })
  if (ranked.length === 0) return []
  let best = ranked[0].low
  for (const r of ranked) if (compareLow(r.low, best) < 0) best = r.low
  return ranked.filter((r) => compareLow(r.low, best) === 0).map((r) => r.seat)
}

/**
 * 팟을 하이/로우 절반으로 가른다 — **홀칩 1차.**
 *
 * 칩 단위로 못 가르는 나머지는 **하이 쪽**이다. 8,100 은 4,050 씩이 아니라
 * 4,100 / 4,000 이다 — 테이블에 50 칩이 없다.
 * 출처: docs/references/mixgame-facts.md 「홀칩은 Hi 승자에게」(가이드 p5).
 */
function splitHalf(amount: number): { hi: number; lo: number } {
  const units = Math.floor(amount / ODD_CHIP_UNIT)
  const lo = Math.floor(units / 2) * ODD_CHIP_UNIT
  return { hi: amount - lo, lo }
}

/**
 * 한 절반을 그 집합 안에서 나눈다 — **홀칩 2차.**
 *
 * 남는 칩은 버튼 왼쪽 첫 자격자부터 한 칩씩. 낮은 좌석 인덱스부터 주면 좌석 번호가
 * 규칙인 것처럼 가르치게 된다 — 실제 기준은 버튼이다.
 * TDA 2024 「20: Awarding Odd Chips」 대조 완료.
 */
function pushShare(
  awards: PotAward[],
  potIndex: number,
  half: 'hi' | 'lo',
  amount: number,
  winners: number[],
  buttonSeat: number,
  seatCount: number,
): void {
  if (amount === 0 || winners.length === 0) return
  const ordered = orderFromButton(winners, buttonSeat, seatCount)
  const units = Math.floor(amount / ODD_CHIP_UNIT)
  const base = Math.floor(units / ordered.length) * ODD_CHIP_UNIT
  let remainder = amount - base * ordered.length

  ordered.forEach((seat) => {
    const extra = Math.min(remainder, ODD_CHIP_UNIT)
    remainder -= extra
    awards.push({ potIndex, seat, amount: base + extra, half })
  })
}
```

`pots.ts` 상단 import 에 `HandEvaluator`·`compareLow` 를 더한다.

```ts
import type { Card } from './cards'
import { compareHands, evaluateHand, type HandEvaluator } from './evaluate'
import { compareLow } from './lowball'
```

> **`evaluateHand` 를 import 에서 빼라.** `pots.ts` 안에서 그 함수를 쓰던 곳은 `awardPots`
> 한 군데(옛 `:129`)뿐이고 그 줄이 사라진다. `compareHands` 는 `hiSeats` 가 계속 쓰므로 남긴다.

- [ ] **Step 4: 기존 호출부 둘을 고친다**

`awardPots` 를 부르는 곳은 테스트 둘뿐이다. 각 호출에 평가기를 더한다.

`app/src/lib/rush/generate.test.ts` 상단에 추가:

```ts
import { GAMES, evaluatorFor } from '@/lib/games'

/** 팟 러시는 노리밋 홀덤이다 — 아무 다섯 장, 로우 없음 */
const EV = evaluatorFor(GAMES.nlh)
```

그 파일의 `awardPots(pots, hole, q.board, q.buttonSeat)` 를 전부 `awardPots(pots, hole, q.board, q.buttonSeat, EV)` 로 바꾼다. `app/src/lib/rush/oddchip.order.test.ts` 도 같은 방식으로 고친다.

- [ ] **Step 5: 테스트를 돌린다**

Run: `cd app && npx vitest run src/lib/simulator/pots.hilo.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 6: 팟 러시 회귀를 확인한다 — 답이 바뀌면 안 된다**

Run: `cd app && npx vitest run src/lib/rush/ src/lib/simulator/`
Expected: PASS, 실패 0. **노리밋 홀덤의 답은 한 글자도 바뀌지 않아야 한다** — 여기서 깨지면 `mustUse === null` 갈래가 예전 `evaluateHand([...hole, ...board])` 와 달라진 것이다.

- [ ] **Step 7: 전체 회귀**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: 462 통과 / 0 실패, tsc 0 errors

- [ ] **Step 8: 커밋**

```bash
git add app/src/lib/simulator/pots.ts app/src/lib/simulator/pots.hilo.test.ts \
        app/src/lib/rush/generate.test.ts app/src/lib/rush/oddchip.order.test.ts
git commit -m "feat: awardPots 가 하이로우로 갈린다 — 홀칩은 두 번 생긴다"
```

---

## Task 4: 팟 분배 문제 타입과 생성기

**Files:**
- Create: `app/src/lib/drills/potaward/types.ts`
- Create: `app/src/lib/drills/potaward/generate.ts`
- Test: `app/src/lib/drills/potaward/generate.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `evaluatorFor`, Task 3 의 `awardPots`·`PotAward`; 기존 `buildPots`·`createRng`·`makeDeck`·`shuffle`
- Produces: `generatePotAwardRun(spec: GameSpec, seed: string): PotAwardQuestion[]` 와 아래 타입들. Task 5 가 쓴다.

- [ ] **Step 1: 타입을 만든다**

`app/src/lib/drills/potaward/types.ts`:

```ts
/**
 * 팟 분배 드릴의 타입.
 *
 * 승자 판독이 「이 판의 임자」를 묻는다면 이 드릴은 「**이 팟의** 임자」를 묻는다.
 * 차별점은 자격(사이드팟)과 홀칩 순서에 있다 — 그래서 출제가 자격이 갈리거나
 * 동점이 있는 판으로 치우친다.
 */
import type { Card, Pot } from '@/lib/simulator'

export type PotAwardKind = 'hihalf' | 'lohalf' | 'oddchip' | 'sidepot'

export const POTAWARD_KIND_LABEL: Record<PotAwardKind, string> = {
  hihalf: '하이 절반',
  lohalf: '로우 절반',
  oddchip: '홀칩 배분',
  sidepot: '사이드팟 임자',
}

/**
 * 제한시간(초). **초안이다** — 재미 게이트에서 확정한다 (설계 §10).
 * 기존 팟 러시가 사이드팟 45 · 메인팟 지급 40 · 홀칩 20 이었고, 하이로우가 얹혔다.
 */
export const POTAWARD_LIMIT_SEC: Record<PotAwardKind, number> = {
  hihalf: 40,
  lohalf: 40,
  oddchip: 25,
  sidepot: 50,
}

export const POTAWARD_QUESTION_COUNT = 10
/** 이 드릴의 출제 좌석 수. 사이드팟이 성립하려면 올인이 필요해 승자 판독보다 많다 */
export const POTAWARD_SEAT_COUNT = 4

export type PotAwardSeat = {
  name: string
  hole: Card[]
  /** 이 핸드에 낸 총액. 사이드팟 층을 자르는 근거다 */
  contributed: number
  folded: boolean
  allIn: boolean
}

export type PotAwardQuestion = {
  kind: PotAwardKind
  limitSec: number
  label: string
  prompt: string
  seats: PotAwardSeat[]
  board: Card[]
  buttonSeat: number
  pots: Pot[]
  /** 몇 번째 팟을 묻나. `sidepot` 유형만 0 이 아니다 */
  potIndex: number
  /** 정답 좌석. **동점이면 여럿이다** */
  answerSeats: number[]
  why: string
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`app/src/lib/drills/potaward/generate.test.ts`:

```ts
/**
 * 정답을 생성기가 쓰지 않은 경로로 다시 구해 맞춘다.
 * 생성기가 스스로를 채점하면 틀린 것도 맞다고 한다.
 */
import { describe, expect, it } from 'vitest'
import { GAMES, evaluatorFor } from '@/lib/games'
import { awardPots } from '@/lib/simulator'
import { generatePotAwardRun } from './generate'
import { POTAWARD_QUESTION_COUNT, POTAWARD_SEAT_COUNT } from './types'

const SEEDS = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9', 'j0']
const ev = evaluatorFor(GAMES.plo8)

describe('generatePotAwardRun', () => {
  it.each(SEEDS)('시드 %s: 열 문제가 나온다', (seed) => {
    expect(generatePotAwardRun(GAMES.plo8, seed)).toHaveLength(POTAWARD_QUESTION_COUNT)
  })

  it.each(SEEDS)('시드 %s: 같은 시드는 같은 판을 낸다', (seed) => {
    const a = generatePotAwardRun(GAMES.plo8, seed)
    const b = generatePotAwardRun(GAMES.plo8, seed)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it.each(SEEDS)('시드 %s: 정답이 awardPots 재계산과 일치한다', (seed) => {
    for (const q of generatePotAwardRun(GAMES.plo8, seed)) {
      const hole = q.seats.map((s) => s.hole)
      const awards = awardPots(q.pots, hole, q.board, q.buttonSeat, ev)
      const forPot = awards.filter((a) => a.potIndex === q.potIndex)

      const expected =
        q.kind === 'lohalf'
          ? forPot.filter((a) => a.half === 'lo').map((a) => a.seat)
          : q.kind === 'oddchip'
            ? forPot.filter((a) => a.half === 'hi').map((a) => a.seat)
            : forPot.filter((a) => a.half === 'hi').map((a) => a.seat)

      // 홀칩 유형은 「남는 칩을 받는 좌석」이라 하이 지급자 중 최대액 수령자다
      if (q.kind === 'oddchip') {
        const hi = forPot.filter((a) => a.half === 'hi')
        const top = Math.max(...hi.map((a) => a.amount))
        expect(new Set(q.answerSeats)).toEqual(
          new Set(hi.filter((a) => a.amount === top).map((a) => a.seat)),
        )
      } else {
        expect(new Set(q.answerSeats)).toEqual(new Set(expected))
      }
    }
  })

  it.each(SEEDS)('시드 %s: 정답 좌석은 그 팟의 자격자다', (seed) => {
    for (const q of generatePotAwardRun(GAMES.plo8, seed)) {
      for (const seat of q.answerSeats) {
        expect(q.pots[q.potIndex].eligibleSeats).toContain(seat)
      }
    }
  })

  it.each(SEEDS)('시드 %s: 좌석 수와 홀카드 장수가 스펙대로다', (seed) => {
    for (const q of generatePotAwardRun(GAMES.plo8, seed)) {
      expect(q.seats).toHaveLength(POTAWARD_SEAT_COUNT)
      for (const s of q.seats) expect(s.hole).toHaveLength(GAMES.plo8.holeCardCount)
    }
  })

  it('한 판에 사이드팟 문제가 적어도 하나 나온다', () => {
    // 유형 목표가 배분을 보장하므로 시드와 무관하게 성립해야 한다
    for (const seed of SEEDS) {
      const kinds = generatePotAwardRun(GAMES.plo8, seed).map((q) => q.kind)
      expect(kinds).toContain('sidepot')
    }
  })

  it('한 판에 로우 절반 문제가 적어도 하나 나온다', () => {
    for (const seed of SEEDS) {
      const kinds = generatePotAwardRun(GAMES.plo8, seed).map((q) => q.kind)
      expect(kinds).toContain('lohalf')
    }
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `cd app && npx vitest run src/lib/drills/potaward/`
Expected: FAIL — `Failed to resolve import "./generate"`

- [ ] **Step 4: 생성기를 만든다**

`app/src/lib/drills/potaward/generate.ts`:

```ts
/**
 * 팟 분배 문제를 만든다.
 *
 * **먼저 만들고 그다음 보여준다.** 판을 하나 돌린 뒤 엔진에게 분배를 물어보고, 그 답이
 * 이번 문제의 유형에 맞으면 채택하고 아니면 다시 돌린다. 화면에 뜬 뒤에 답이 바뀔 자리가 없다.
 *
 * 무작위는 `Rng` 로만 얻는다 — 여기서 `Math.random()` 을 쓰면 시드가 무의미해진다.
 */
import {
  awardPots, buildPots, createRng, makeDeck, shuffle,
  type Card, type HandEvaluator, type Pot, type PotAward, type Rng,
} from '@/lib/simulator'
import { evaluatorFor, type GameSpec } from '@/lib/games'
import {
  POTAWARD_KIND_LABEL, POTAWARD_LIMIT_SEC, POTAWARD_QUESTION_COUNT, POTAWARD_SEAT_COUNT,
  type PotAwardKind, type PotAwardQuestion, type PotAwardSeat,
} from './types'

const NAMES = ['1번', '2번', '3번', '4번']
/** 조건이 잘못됐을 때 무한 루프 대신 명확한 실패로 드러나게 하는 상한 */
const MAX_TRIES = 600
/** 투입액을 만드는 칩 단위. 100 단위 홀칩이 실제로 생기도록 잡았다 */
const STEP = 100

type Deal = {
  seats: PotAwardSeat[]
  board: Card[]
  pots: Pot[]
  awards: PotAward[]
}

/**
 * 한 판을 돌린다. 투입액을 좌석마다 다르게 주어 **사이드팟이 실제로 생기게** 한다 —
 * 전원 같은 금액이면 팟이 하나뿐이라 이 드릴의 절반이 성립하지 않는다.
 */
function dealOnce(spec: GameSpec, rng: Rng, ev: HandEvaluator): Deal {
  const deck = shuffle(makeDeck(), rng)
  const board = deck.slice(0, 5)
  const n = spec.holeCardCount

  // 층을 만든다: 낮은 올인 한둘 + 나머지는 같은 높이
  const full = (20 + rng.int(40)) * STEP
  const contributed = NAMES.slice(0, POTAWARD_SEAT_COUNT).map((_, i) =>
    i < 2 ? (5 + rng.int(14)) * STEP : full,
  )
  const folded = contributed.map(() => false)

  const seats: PotAwardSeat[] = NAMES.slice(0, POTAWARD_SEAT_COUNT).map((name, i) => ({
    name,
    hole: deck.slice(5 + i * n, 5 + (i + 1) * n),
    contributed: contributed[i],
    folded: false,
    allIn: contributed[i] < full,
  }))

  const pots = buildPots(contributed, folded)
  return { seats, board, pots, awards: awardPots(pots, seats.map((s) => s.hole), board, 0, ev) }
}

/** 이 팟에서 `half` 를 받은 좌석들 */
function seatsOf(awards: PotAward[], potIndex: number, half: 'hi' | 'lo'): number[] {
  return awards.filter((a) => a.potIndex === potIndex && a.half === half).map((a) => a.seat)
}

/** 이 팟의 하이 지급 중 **가장 많이 받은** 좌석들 — 홀칩이 얹힌 자리다 */
function oddChipSeats(awards: PotAward[], potIndex: number): number[] {
  const hi = awards.filter((a) => a.potIndex === potIndex && a.half === 'hi')
  if (hi.length < 2) return []
  const top = Math.max(...hi.map((a) => a.amount))
  const bottom = Math.min(...hi.map((a) => a.amount))
  // 전원이 같은 금액이면 홀칩이 없다 — 이 유형의 문제가 되지 않는다
  if (top === bottom) return []
  return hi.filter((a) => a.amount === top).map((a) => a.seat)
}

const won = (n: number) => n.toLocaleString('ko-KR')
const names = (seats: PotAwardSeat[], picks: number[]) =>
  picks.map((i) => seats[i].name).join(' · ')

/**
 * 이 유형의 문제가 이 판에서 성립하는가. 성립하면 정답 좌석과 팟 번호를 낸다.
 * **성립하지 않으면 `null`** — 호출자가 판을 다시 돌린다.
 */
function tryBuild(deal: Deal, kind: PotAwardKind): { potIndex: number; seats: number[] } | null {
  switch (kind) {
    case 'hihalf': {
      const seats = seatsOf(deal.awards, 0, 'hi')
      return seats.length > 0 ? { potIndex: 0, seats } : null
    }
    case 'lohalf': {
      const seats = seatsOf(deal.awards, 0, 'lo')
      // 로우가 성립한 판에서만 낸다 — 「로우 없음」은 승자 판독의 몫이다
      return seats.length > 0 ? { potIndex: 0, seats } : null
    }
    case 'oddchip': {
      const seats = oddChipSeats(deal.awards, 0)
      return seats.length > 0 ? { potIndex: 0, seats } : null
    }
    case 'sidepot': {
      // 사이드팟이 실제로 있고, 그 팟의 자격자가 메인팟과 달라야 문제가 된다
      if (deal.pots.length < 2) return null
      const potIndex = deal.pots.length - 1
      const seats = seatsOf(deal.awards, potIndex, 'hi')
      return seats.length > 0 ? { potIndex, seats } : null
    }
  }
}

const PROMPT: Record<PotAwardKind, string> = {
  hihalf: '이 팟의 **하이 절반**은 누가 가져갑니까?',
  lohalf: '이 팟의 **로우 절반**은 누가 가져갑니까?',
  oddchip: '나누고 남는 칩은 누구에게 갑니까?',
  sidepot: '이 사이드팟은 누가 가져갑니까?',
}

function build(
  deal: Deal, kind: PotAwardKind, potIndex: number, answerSeats: number[], buttonSeat: number,
): PotAwardQuestion {
  const amount = deal.pots[potIndex].amount
  const why =
    kind === 'oddchip'
      ? `${won(amount)} 을 나누고 남는 칩은 버튼 왼쪽 첫 자격자인 ${names(deal.seats, answerSeats)}에게 간다`
      : kind === 'lohalf'
        ? `로우 ${names(deal.seats, answerSeats)}`
        : `하이 ${names(deal.seats, answerSeats)}`

  return {
    kind,
    limitSec: POTAWARD_LIMIT_SEC[kind],
    label: POTAWARD_KIND_LABEL[kind],
    prompt: PROMPT[kind],
    seats: deal.seats,
    board: deal.board,
    buttonSeat,
    pots: deal.pots,
    potIndex,
    answerSeats,
    why,
  }
}

/**
 * 열 문제의 유형 배분. **미리 정해 두면 시드와 무관하게 보장된다.**
 * 순서는 섞는다 — 늘 같은 자리에 같은 유형이 오면 답을 위치로 짐작한다.
 */
function kindTargets(rng: Rng): PotAwardKind[] {
  const targets: PotAwardKind[] = [
    'sidepot', 'sidepot', 'sidepot',
    'lohalf', 'lohalf', 'lohalf',
    'oddchip', 'oddchip',
    'hihalf', 'hihalf',
  ]
  for (let i = targets.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = targets[i]
    targets[i] = targets[j]
    targets[j] = tmp
  }
  return targets
}

export function generatePotAwardRun(spec: GameSpec, seed: string): PotAwardQuestion[] {
  const ev = evaluatorFor(spec)
  if (ev.rankLo === null) {
    throw new Error('로우가 없는 종목의 팟 분배는 아직 없다 — 하이 전용 드릴이 따로 필요하다')
  }

  const rng = createRng(seed)
  return kindTargets(rng).map((kind) => {
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      const deal = dealOnce(spec, rng, ev)
      const hit = tryBuild(deal, kind)
      if (hit !== null) return build(deal, kind, hit.potIndex, hit.seats, rng.int(POTAWARD_SEAT_COUNT))
    }
    throw new Error(`문제를 만들지 못했다 — 유형 ${kind}, 시도 ${MAX_TRIES}회`)
  })
}
```

- [ ] **Step 5: 테스트를 돌린다**

Run: `cd app && npx vitest run src/lib/drills/potaward/`
Expected: PASS

> **`MAX_TRIES` 초과로 던지면** 그 유형이 이 판 모양에서 잘 안 나온다는 뜻이다. `dealOnce` 의 층 만들기(`full`·투입액 범위)를 조정하되, **정답을 완화하지 마라** — 조건을 느슨하게 해서 통과시키면 틀린 문제가 나온다.

- [ ] **Step 6: 전체 회귀**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: 실패 0, tsc 0 errors

- [ ] **Step 7: 커밋**

```bash
git add app/src/lib/drills/potaward/
git commit -m "feat: 팟 분배 문제 생성기"
```

---

## Task 5: 팟 분배 화면 — 패널 · 레지스트리 · 페이지 · 라우트

**Files:**
- Create: `app/src/lib/drills/potaward/registry.ts`
- Create: `app/src/components/drills/potaward/PotAwardQuestionPanel.tsx`
- Create: `app/src/app/games/[gameId]/potaward/page.tsx`
- Modify: `app/src/lib/games/routes.ts` (`plo8.potaward` 를 채운다)

**Interfaces:**
- Consumes: Task 4 의 `generatePotAwardRun`·`PotAwardQuestion`·`POTAWARD_KIND_LABEL`; 기존 `RushScreen`·`createBestRecord`·`PokerTable`
- Produces: `/games/plo8/potaward` 라우트

- [ ] **Step 1: 레지스트리를 만든다**

`app/src/lib/drills/potaward/registry.ts` — `lib/drills/winner/registry.ts` 와 **같은 모양**이다. 생성기와 기록을 `gameId` 당 하나씩 캐시한다. 페이지에서 클로저를 만들면 렌더마다 새 판이 나온다.

```ts
/**
 * `gameId` 당 생성기와 기록을 **하나씩만** 만들어 둔다.
 *
 * `RushScreen` 이 `useMemo(() => generate(seed), [generate, seed])` 로 문제를 만든다.
 * 페이지가 렌더마다 새 클로저를 넘기면 매 렌더 새 판이 나온다.
 *
 * 기록 키 규약은 `<gameId>.<drillId>.best` 다. **기존 키를 지우지 않는다.**
 */
import { createBestRecord, type BestRecord } from '@/lib/rush/record'
import { GAMES, type GameId } from '@/lib/games'
import { generatePotAwardRun } from './generate'
import type { PotAwardQuestion } from './types'

const RUNS = new Map<GameId, (seed: string) => PotAwardQuestion[]>()

export function potAwardRun(gameId: GameId): (seed: string) => PotAwardQuestion[] {
  const found = RUNS.get(gameId)
  if (found !== undefined) return found
  const run = (seed: string) => generatePotAwardRun(GAMES[gameId], seed)
  RUNS.set(gameId, run)
  return run
}

const RECORDS = new Map<GameId, BestRecord>()

export function potAwardRecord(gameId: GameId): BestRecord {
  const found = RECORDS.get(gameId)
  if (found !== undefined) return found
  const record = createBestRecord(`${gameId}.potaward.best`)
  RECORDS.set(gameId, record)
  return record
}
```

- [ ] **Step 2: 패널을 만든다**

`app/src/components/drills/potaward/PotAwardQuestionPanel.tsx`. 좌석 버튼 한 줄에 **복수 선택**(동점이면 여럿이 정답)이고, 제출 전까지는 로컬 상태로만 고른다. 판정은 페이지가 한다.

```tsx
/**
 * 팟 분배 문제 한 장.
 *
 * **정답 판정을 여기 쓰지 마라.** 이 컴포넌트는 고른 좌석을 `onSubmit` 으로 넘길 뿐이고,
 * 맞았는지는 페이지가 문제의 `answerSeats` 와 대조해 정한다 (전역 제약 1).
 *
 * 로컬 선택 상태는 페이지의 `key={index}` 에 기대어 리셋된다 — 의도된 결합이다.
 */
'use client'

import { useState } from 'react'
import { PokerTable } from '@/components/table/PokerTable'
import type { PotAwardQuestion } from '@/lib/drills/potaward/types'
import type { Verdict } from '@/lib/rush/session'

const won = (n: number) => n.toLocaleString('ko-KR')

export function PotAwardQuestionPanel({
  question, index, total, verdict, onSubmit, onNext,
}: {
  question: PotAwardQuestion
  index: number
  total: number
  verdict: Verdict
  onSubmit(seats: number[]): void
  onNext(): void
}) {
  const [picked, setPicked] = useState<number[]>([])
  const asked = question.pots[question.potIndex]

  const toggle = (seat: number) => {
    if (verdict !== null) return
    setPicked((cur) => (cur.includes(seat) ? cur.filter((s) => s !== seat) : [...cur, seat]))
  }

  return (
    <div>
      <p className="mb-1 text-xs text-zinc-500">
        {index + 1}/{total} · {question.label}
      </p>

      <div className="sim-root">
        <PokerTable
          state={{
            seats: question.seats.map((s) => ({
              name: s.name,
              stack: 0,
              bet: s.contributed,
              folded: s.folded,
              allIn: s.allIn,
              hole: s.hole,
              revealed: true,
            })),
            buttonSeat: question.buttonSeat,
            board: question.board,
            pot: 0,
          }}
          burnCount={0}
        />
      </div>

      <p className="mt-3 text-sm font-bold">{question.prompt}</p>
      <p className="text-xs text-zinc-500">
        {question.potIndex === 0 ? '메인팟' : `사이드팟 ${question.potIndex}`}{' '}
        <b>{won(asked.amount)}</b> · 자격 {asked.eligibleSeats.map((s) => question.seats[s].name).join(' · ')}
      </p>

      <div className="mt-2 grid grid-cols-4 gap-2">
        {question.seats.map((seat, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            disabled={verdict !== null}
            className={`rounded-lg border py-2 text-sm font-bold ${
              picked.includes(i)
                ? 'border-dm-teal-600 bg-dm-teal-50 text-dm-teal-800'
                : 'border-zinc-300 dark:border-zinc-700'
            }`}
          >
            {seat.name}
          </button>
        ))}
      </div>

      {verdict === null ? (
        <button
          type="button"
          onClick={() => onSubmit(picked)}
          disabled={picked.length === 0}
          className="mt-3 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          제출
        </button>
      ) : (
        <>
          <p className="mt-3 rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
            {question.why}
          </p>
          <button
            type="button"
            onClick={onNext}
            className="mt-2 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white"
          >
            다음
          </button>
        </>
      )}
    </div>
  )
}
```

> `PokerTable` 의 `state` 는 `TableView` 구조를 만족해야 한다. 위처럼 좌석을 만들 때 **`bet` 에 `contributed` 를 넣는 이유**는 화면이 「이 좌석이 얼마 냈나」를 칩으로 보여주기 위해서다. 팟은 아직 가운데로 수거되지 않은 그림이라 `pot: 0` 이다.

- [ ] **Step 3: 페이지를 만든다**

`app/src/app/games/[gameId]/potaward/page.tsx`:

```tsx
/**
 * 팟 분배 — 10문제 한 판.
 *
 * **정답 판정은 여기 있어야 한다.** 문제의 답이 어떤 모양인지 아는 것은 이 드릴뿐이고,
 * 공용 뼈대(`RushScreen`)가 그것을 알기 시작하면 드릴이 늘 때마다 뼈대가 부푼다.
 */
'use client'

import { notFound } from 'next/navigation'
import { use } from 'react'
import { PotAwardQuestionPanel } from '@/components/drills/potaward/PotAwardQuestionPanel'
import { RushScreen } from '@/components/rush/RushScreen'
import { potAwardRecord, potAwardRun } from '@/lib/drills/potaward/registry'
import {
  POTAWARD_KIND_LABEL, POTAWARD_QUESTION_COUNT,
  type PotAwardKind, type PotAwardQuestion,
} from '@/lib/drills/potaward/types'
import { drillHref, GAMES, isGameId } from '@/lib/games'

/** 이 드릴에는 칩이 나온다. **모듈 최상위 함수여야 한다** */
function hasChips(): boolean {
  return true
}

/** 순서를 무시하고 같은 좌석 묶음인가. 채점의 정본이다 */
function sameSeats(picked: number[], answer: number[]): boolean {
  return picked.length === answer.length && answer.every((s) => picked.includes(s))
}

export default function PotAwardPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params)
  if (!isGameId(gameId) || drillHref(gameId, 'potaward') === null) notFound()

  return (
    <RushScreen<PotAwardKind, PotAwardQuestion>
      path={`/games/${gameId}/potaward`}
      title="팟 분배"
      eyebrow={`${GAMES[gameId].labels.ko} · 팟 분배`}
      footer={`${POTAWARD_QUESTION_COUNT}문제 · 자격과 홀칩이 갈리는 판만 나온다`}
      labels={POTAWARD_KIND_LABEL}
      record={potAwardRecord(gameId)}
      generate={potAwardRun(gameId)}
      hasChips={hasChips}
      renderQuestion={({ question, index, total, verdict, answer, next }) => (
        <PotAwardQuestionPanel
          key={index}
          question={question}
          index={index}
          total={total}
          verdict={verdict}
          onSubmit={(seats) => answer(sameSeats(seats, question.answerSeats))}
          onNext={next}
        />
      )}
    />
  )
}
```

- [ ] **Step 4: 라우트를 연다**

`app/src/lib/games/routes.ts` 의 `plo8` 블록에 한 줄을 더한다.

```ts
  plo8: {
    procedure: '/games/plo8/procedure',
    winner: '/games/plo8/winner',
    potaward: '/games/plo8/potaward',
  },
```

- [ ] **Step 5: 타입과 빌드를 확인한다**

Run: `cd app && npx tsc --noEmit && npm run build`
Expected: tsc 0 errors, 빌드 성공

- [ ] **Step 6: 커밋**

```bash
git add app/src/lib/drills/potaward/registry.ts \
        app/src/components/drills/potaward/ \
        "app/src/app/games/[gameId]/potaward/" \
        app/src/lib/games/routes.ts
git commit -m "feat: 팟 분배 화면과 라우트"
```

---

## Task 6: 팟 분배 브라우저 확인과 e2e

**Files:**
- Modify: `app/e2e/grid-plo8.spec.ts` (테스트 둘 추가)

**Interfaces:**
- Consumes: Task 5 의 `/games/plo8/potaward` 라우트

- [ ] **Step 1: 개발 서버를 띄운다**

```bash
cd app && npm run dev
```

- [ ] **Step 2: 실제 브라우저로 한 판을 끝까지 푼다**

`http://localhost:3000/games/plo8` → 「팟 분배」가 **「준비 중」이 아니라 눌리는지** 확인하고 들어가 10문제를 완주한다. 눈으로 확인할 것:

1. 좌석 앞에 낸 금액이 칩으로 보이고 **좌석마다 다른가**(사이드팟이 성립하려면 달라야 한다)
2. 홀카드 4장이 좌석 상자를 넘치지 않는가 (360px 폭에서)
3. 문제 문구의 팟 이름(메인팟/사이드팟 N)과 금액이 맞는가
4. 복수 선택이 되는가, 제출 뒤 근거 문구가 나오는가
5. **다음 문제에서 이전 선택이 남아 있지 않은가** (`key={index}` 가 하는 일)

- [ ] **Step 3: e2e 테스트를 더한다**

`app/e2e/grid-plo8.spec.ts` 끝에 추가한다.

```ts
test('팟 분배 첫 문제가 열리고 좌석을 고를 수 있다', async ({ page }) => {
  await page.goto('/games/plo8/potaward')
  await expect(page.getByText('팟 분배')).toBeVisible()
  await page.getByRole('button', { name: '1번', exact: true }).click()
  await page.getByRole('button', { name: '제출' }).click()
  await expect(page.getByRole('button', { name: '다음' })).toBeVisible()
})

test('팟 분배가 360px 에서 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/games/plo8/potaward')
  await expect(page.getByRole('button', { name: '제출' })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
```

- [ ] **Step 4: e2e 를 돌린다**

Run: `cd app && npx playwright test`
Expected: 14 통과 (기존 10 + 신규 2 × 2 프로젝트)

- [ ] **Step 5: 전체 검증**

Run: `cd app && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: 실패 0 · tsc 0 · lint 는 **기존 1 error 그대로**(늘면 안 된다)

- [ ] **Step 6: 커밋**

```bash
git add app/e2e/grid-plo8.spec.ts
git commit -m "test: 팟 분배 브라우저 검증"
```

---

# Phase B — 팟리밋 계산

## Task 7: `BettingContext.pot` 과 `pl` 룰셋

**Files:**
- Modify: `app/src/lib/simulator/rulesets/types.ts` (`RulesetId` · `BettingContext`)
- Create: `app/src/lib/simulator/rulesets/pl.ts`
- Modify: `app/src/lib/simulator/index.ts` (`pl` 재수출)
- Test: `app/src/lib/simulator/rulesets/pl.test.ts`

**Interfaces:**
- Consumes: 기존 `nlh` 룰셋 · `Ruleset`·`BettingContext`
- Produces: `pl: Ruleset` — `maxRaiseTo(ctx)` 만 `nlh` 와 다르다. Task 8 이 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`app/src/lib/simulator/rulesets/pl.test.ts`:

```ts
/**
 * 팟리밋 최대 레이즈.
 *
 * 자료 정본: 「팟벳 = 마지막 배팅을 콜 하는 데 필요한 금액 + 콜 한 후에 팟에 있는 금액」.
 * 콜한 뒤의 팟에는 방금 넣은 콜도 들어 있으므로 **콜 금액이 두 번 더해진다.**
 */
import { describe, expect, it } from 'vitest'
import { pl } from './pl'
import type { BettingContext } from './types'

const ctx = (over: Partial<BettingContext>): BettingContext => ({
  currentBet: 0,
  lastRaiseSize: 0,
  bigBlind: 1000,
  seatBet: 0,
  seatStack: 100_000_000,
  isOpenBet: true,
  hasActedThisRound: false,
  pot: 0,
  ...over,
})

describe('pl.maxRaiseTo', () => {
  it('가이드 예제 — 팟 60,000 에 40,000 벳이면 140,000 이다', () => {
    // 팟 60,000 + 앞에 놓인 벳 40,000 = 테이블 위 100,000
    expect(pl.maxRaiseTo(ctx({ currentBet: 40_000, pot: 100_000 }))).toBe(140_000)
  })

  it('앞에 벳이 없으면 팟 금액 그대로다 — 공식은 하나다', () => {
    expect(pl.maxRaiseTo(ctx({ currentBet: 0, pot: 60_000 }))).toBe(60_000)
  })

  it('이미 낸 금액은 콜 금액에서 빠진다', () => {
    // 콜 금액 = 40,000 - 10,000 = 30,000 → 40,000 + 100,000 + 30,000
    expect(pl.maxRaiseTo(ctx({ currentBet: 40_000, seatBet: 10_000, pot: 100_000 }))).toBe(170_000)
  })

  it('스택을 넘지 못한다 — 올인이 상한이다', () => {
    expect(
      pl.maxRaiseTo(ctx({ currentBet: 40_000, seatBet: 10_000, seatStack: 20_000, pot: 100_000 })),
    ).toBe(30_000)
  })

  it('최소 레이즈와 리오픈 규칙은 노리밋과 같다', () => {
    const c = ctx({ currentBet: 40_000, lastRaiseSize: 40_000 })
    expect(pl.minRaiseTo(c)).toBe(80_000)
  })

  it('id 가 pl 이다', () => {
    expect(pl.id).toBe('pl')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd app && npx vitest run src/lib/simulator/rulesets/pl.test.ts`
Expected: FAIL — `Failed to resolve import "./pl"`

- [ ] **Step 3: `BettingContext` 에 `pot` 을 더한다**

`app/src/lib/simulator/rulesets/types.ts` 의 `RulesetId` 와 `BettingContext` 를 고친다.

```ts
export type RulesetId = 'nlh' | 'pl'
```

`BettingContext` 의 `hasActedThisRound` 아래에 추가한다.

```ts
  /**
   * 지금 테이블 위의 돈 전부 — 가운데로 수거된 팟 + **모든 좌석 앞에 놓인 칩**.
   * 자기 자신이 이번 라운드에 낸 것도 포함한다.
   *
   * 팟리밋 산식이 「콜한 뒤의 팟」을 쓰므로 앞에 놓인 칩을 빼면 답이 틀린다.
   * 노리밋은 이 값을 읽지 않는다 — 최대가 늘 스택이기 때문이다.
   */
  pot: number
```

**이 필드가 필수라서 `BettingContext` 를 만드는 모든 곳이 컴파일 에러가 된다.** `npx tsc --noEmit` 이 목록을 준다. 노리밋 경로에서는 `pot: 0` 을 넣어라 — `nlh` 가 읽지 않으므로 동작이 바뀌지 않는다.

- [ ] **Step 4: `pl` 룰셋을 만든다**

`app/src/lib/simulator/rulesets/pl.ts`:

```ts
/**
 * 팟리밋 규칙책.
 *
 * **`nlh` 와 `maxRaiseTo` 하나만 다르다.** 팟리밋에서도 최소 레이즈·리오픈·칩 해석은
 * 노리밋과 같은 규정을 따른다. 그래서 복사하지 않고 위임한다 — 사본은 갈라진다.
 *
 * 스프레드로 이어받아도 `nlh.validateAction` 안의 `this.maxRaiseTo(ctx)` 는 호출 시점의
 * `this`(= `pl`)를 따라 **아래 구현으로 온다.** 그것이 이 위임이 실제로 작동하는 이유다.
 */
import { nlh } from './nlh'
import type { BettingContext, Ruleset } from './types'

export const pl: Ruleset = {
  ...nlh,
  id: 'pl',

  /**
   * 팟벳 = **콜 금액 + 콜한 뒤 팟에 있는 금액** (가이드).
   *
   * 콜한 뒤의 팟에는 방금 넣은 콜이 들어 있으므로 콜 금액이 두 번 더해진다.
   * 예 — 팟 60,000 에 40,000 벳: 40,000 + (60,000 + 40,000) = 140,000.
   */
  maxRaiseTo(ctx: BettingContext): number {
    const callAmt = ctx.currentBet - ctx.seatBet
    const potRaise = ctx.currentBet + ctx.pot + callAmt
    // 스택을 넘을 수는 없다. 올인이 늘 상한이다
    return Math.min(potRaise, ctx.seatBet + ctx.seatStack)
  },
}
```

`app/src/lib/simulator/index.ts` 의 `export { nlh } from './rulesets/nlh'` 아래에 `export { pl } from './rulesets/pl'` 을 더한다.

- [ ] **Step 5: 테스트를 돌린다**

Run: `cd app && npx vitest run src/lib/simulator/rulesets/`
Expected: PASS — `pl` 6 tests + 기존 `nlh` 테스트 전부

- [ ] **Step 6: 전체 회귀 — 노리밋이 안 바뀌었는지 본다**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: 실패 0, tsc 0 errors. **액션 판정 러시(`lib/action-rush`)의 답이 바뀌면 안 된다** — 바뀌었다면 `pot` 을 넣으면서 노리밋 경로를 건드린 것이다.

- [ ] **Step 7: 커밋**

```bash
git add app/src/lib/simulator/rulesets/types.ts app/src/lib/simulator/rulesets/pl.ts \
        app/src/lib/simulator/rulesets/pl.test.ts app/src/lib/simulator/index.ts
git commit -m "feat: 팟리밋 룰셋 — BettingContext 가 팟을 안다"
```

---

## Task 8: 팟리밋 문제 타입과 생성기

**Files:**
- Create: `app/src/lib/drills/potlimit/types.ts`
- Create: `app/src/lib/drills/potlimit/generate.ts`
- Test: `app/src/lib/drills/potlimit/generate.test.ts`

**Interfaces:**
- Consumes: Task 7 의 `pl`·`BettingContext`; 기존 `createRng`, `lib/action-rush/money.ts` 의 `BLINDS`·`unitFor`·`roundUnit`·`fmt`
- Produces: `generatePotLimitRun(spec: GameSpec, seed: string): PotLimitQuestion[]`. Task 9 가 쓴다.

- [ ] **Step 1: 타입을 만든다**

`app/src/lib/drills/potlimit/types.ts`:

```ts
/**
 * 팟리밋 계산 드릴의 타입.
 *
 * **답이 숫자다.** 보기를 주면 계산하지 않고 고를 수 있게 된다 — 팟리밋에서는 벳
 * 크기가 선택이 아니라 계산이라는 것이 이 드릴의 전부다 (`mix-room.html` 설계 주석).
 */
export type PotLimitKind = 'potbet' | 'potraise'

export const POTLIMIT_KIND_LABEL: Record<PotLimitKind, string> = {
  potbet: '팟벳',
  potraise: '팟까지 레이즈',
}

/**
 * 제한시간(초). **초안이다** — 재미 게이트에서 확정한다 (설계 §10).
 * 숫자 입력은 고르기보다 느리다.
 */
export const POTLIMIT_LIMIT_SEC: Record<PotLimitKind, number> = {
  potbet: 30,
  potraise: 45,
}

export const POTLIMIT_QUESTION_COUNT = 10
export const POTLIMIT_SEAT_COUNT = 4

export type PotLimitSeat = {
  name: string
  /** 이 좌석이 이번 라운드에 앞에 놓은 칩. 화면에 칩으로 보인다 */
  bet: number
  folded: boolean
}

export type PotLimitQuestion = {
  kind: PotLimitKind
  limitSec: number
  label: string
  prompt: string
  seats: PotLimitSeat[]
  buttonSeat: number
  /** 가운데로 수거된 팟 (앞에 놓인 칩은 `seats[].bet` 에 있다) */
  collected: number
  /** 문제를 받는 좌석 */
  heroSeat: number
  /** 정답 — 레이즈 **총액**이다 (폭이 아니다) */
  answer: number
  why: string
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`app/src/lib/drills/potlimit/generate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import { pl } from '@/lib/simulator'
import { generatePotLimitRun } from './generate'
import { POTLIMIT_QUESTION_COUNT } from './types'

const SEEDS = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8']

describe('generatePotLimitRun', () => {
  it.each(SEEDS)('시드 %s: 열 문제가 나온다', (seed) => {
    expect(generatePotLimitRun(GAMES.plo8, seed)).toHaveLength(POTLIMIT_QUESTION_COUNT)
  })

  it.each(SEEDS)('시드 %s: 같은 시드는 같은 판을 낸다', (seed) => {
    expect(JSON.stringify(generatePotLimitRun(GAMES.plo8, seed)))
      .toBe(JSON.stringify(generatePotLimitRun(GAMES.plo8, seed)))
  })

  it.each(SEEDS)('시드 %s: 정답이 pl.maxRaiseTo 재계산과 일치한다', (seed) => {
    for (const q of generatePotLimitRun(GAMES.plo8, seed)) {
      const currentBet = Math.max(0, ...q.seats.map((s) => s.bet))
      const onTable = q.collected + q.seats.reduce((sum, s) => sum + s.bet, 0)
      const again = pl.maxRaiseTo({
        currentBet,
        lastRaiseSize: 0,
        bigBlind: 1000,
        seatBet: q.seats[q.heroSeat].bet,
        seatStack: 100_000_000,
        isOpenBet: currentBet === 0,
        hasActedThisRound: false,
        pot: onTable,
      })
      expect(q.answer).toBe(again)
    }
  })

  it.each(SEEDS)('시드 %s: 정답이 0 보다 크고 칩 단위로 떨어진다', (seed) => {
    for (const q of generatePotLimitRun(GAMES.plo8, seed)) {
      expect(q.answer).toBeGreaterThan(0)
      expect(q.answer % 100).toBe(0)
    }
  })

  it('두 유형이 다 나온다', () => {
    for (const seed of SEEDS) {
      const kinds = generatePotLimitRun(GAMES.plo8, seed).map((q) => q.kind)
      expect(kinds).toContain('potbet')
      expect(kinds).toContain('potraise')
    }
  })

  it('팟리밋이 아닌 종목은 던진다', () => {
    expect(() => generatePotLimitRun(GAMES.nlh, 'a1')).toThrow()
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `cd app && npx vitest run src/lib/drills/potlimit/`
Expected: FAIL — `Failed to resolve import "./generate"`

- [ ] **Step 4: 생성기를 만든다**

`app/src/lib/drills/potlimit/generate.ts`:

```ts
/**
 * 팟리밋 계산 문제를 만든다.
 *
 * **정답은 룰셋이 낸다.** 여기서 산식을 다시 쓰면 규칙이 두 곳에 살고, 두 곳은 갈라진다.
 * 이 파일이 하는 일은 「그럴듯한 판을 차리는 것」까지다.
 *
 * 금액은 `action-rush/money.ts` 를 재사용한다 — 그 블라인드 레벨에 실제로 있을 법한
 * 값이라야 훈련생이 보는 그림이 현실과 같다.
 */
import { createRng, pl, type Rng } from '@/lib/simulator'
import type { GameSpec } from '@/lib/games'
import { BLINDS, roundUnit, unitFor } from '@/lib/action-rush/money'
import {
  POTLIMIT_KIND_LABEL, POTLIMIT_LIMIT_SEC, POTLIMIT_QUESTION_COUNT, POTLIMIT_SEAT_COUNT,
  type PotLimitKind, type PotLimitQuestion, type PotLimitSeat,
} from './types'

const NAMES = ['1번', '2번', '3번', '4번']
const won = (n: number) => n.toLocaleString('ko-KR')

/** 유형 배분. 팟까지 레이즈가 더 어렵고 더 자주 틀리므로 비중을 둔다 */
function kindTargets(rng: Rng): PotLimitKind[] {
  const targets: PotLimitKind[] = [
    'potbet', 'potbet', 'potbet', 'potbet',
    'potraise', 'potraise', 'potraise', 'potraise', 'potraise', 'potraise',
  ]
  for (let i = targets.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = targets[i]
    targets[i] = targets[j]
    targets[j] = tmp
  }
  return targets
}

function makeOne(rng: Rng, kind: PotLimitKind): PotLimitQuestion {
  const bb = rng.pick(BLINDS)
  const unit = unitFor(bb)
  const buttonSeat = rng.int(POTLIMIT_SEAT_COUNT)
  const heroSeat = rng.int(POTLIMIT_SEAT_COUNT)

  // 이미 가운데로 수거된 팟 — 앞선 스트릿에서 온 돈이다
  const collected = roundUnit(bb * (3 + rng.int(10)), unit)

  const seats: PotLimitSeat[] = NAMES.slice(0, POTLIMIT_SEAT_COUNT).map((name) => ({
    name,
    bet: 0,
    folded: false,
  }))

  let currentBet = 0
  let bettorSeat = -1
  if (kind === 'potraise') {
    // 앞선 벳을 실제로 화면에 놓는다. 히어로가 아닌 좌석이어야 한다
    bettorSeat = (heroSeat + 1 + rng.int(POTLIMIT_SEAT_COUNT - 1)) % POTLIMIT_SEAT_COUNT
    currentBet = roundUnit(collected * (0.5 + rng.int(3) * 0.25), unit)
    seats[bettorSeat] = { ...seats[bettorSeat], bet: currentBet }
  }

  const onTable = collected + seats.reduce((sum, s) => sum + s.bet, 0)
  const answer = pl.maxRaiseTo({
    currentBet,
    lastRaiseSize: 0,
    bigBlind: bb,
    seatBet: seats[heroSeat].bet,
    seatStack: 100_000_000, // 스택 제약 없이 「규정이 정하는 최대」를 묻는다
    isOpenBet: currentBet === 0,
    hasActedThisRound: false,
    pot: onTable,
  })

  const callAmt = currentBet - seats[heroSeat].bet
  const why =
    kind === 'potbet'
      ? `앞에 벳이 없으면 콜 금액이 0 이라 팟벳은 팟 금액 그대로인 ${won(answer)} 이다. ` +
        '공식은 같다 — 콜 0 + 콜한 뒤 팟.'
      : `먼저 콜 ${won(callAmt)} 을 넣는다. 그러면 팟이 ${won(onTable)} + ${won(callAmt)} = ` +
        `${won(onTable + callAmt)} 이 되고, 거기에 콜 금액을 더해 ${won(answer)} 이다.`

  return {
    kind,
    limitSec: POTLIMIT_LIMIT_SEC[kind],
    label: POTLIMIT_KIND_LABEL[kind],
    prompt:
      kind === 'potbet'
        ? `${seats[heroSeat].name}이 팟벳을 하면 얼마입니까?`
        : `${seats[heroSeat].name}이 팟까지 레이즈하면 얼마를 냅니까?`,
    seats,
    buttonSeat,
    collected,
    heroSeat,
    answer,
    why,
  }
}

export function generatePotLimitRun(spec: GameSpec, seed: string): PotLimitQuestion[] {
  // **코드값으로만 갈린다** — 표시 라벨을 읽지 않는다 (전역 제약 4)
  if (spec.betting !== 'PL') {
    throw new Error(`팟리밋 계산은 팟리밋 종목에만 있다: ${spec.betting}`)
  }
  const rng = createRng(seed)
  return kindTargets(rng).map((kind) => makeOne(rng, kind))
}
```

- [ ] **Step 5: 테스트를 돌린다**

Run: `cd app && npx vitest run src/lib/drills/potlimit/`
Expected: PASS

- [ ] **Step 6: 전체 회귀**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: 실패 0, tsc 0 errors

- [ ] **Step 7: 커밋**

```bash
git add app/src/lib/drills/potlimit/
git commit -m "feat: 팟리밋 계산 문제 생성기"
```

---

## Task 9: 팟리밋 화면 — 숫자 입력 패널 · 레지스트리 · 페이지 · 라우트

**Files:**
- Create: `app/src/lib/drills/potlimit/registry.ts`
- Create: `app/src/components/drills/potlimit/PotLimitQuestionPanel.tsx`
- Create: `app/src/app/games/[gameId]/potlimit/page.tsx`
- Modify: `app/src/lib/games/routes.ts`

**Interfaces:**
- Consumes: Task 8 의 `generatePotLimitRun`·`PotLimitQuestion`
- Produces: `/games/plo8/potlimit` 라우트

- [ ] **Step 1: 레지스트리를 만든다**

`app/src/lib/drills/potlimit/registry.ts` — Task 5 Step 1 의 팟 분배 레지스트리와 같은 구조다. 이름과 키만 다르다.

```ts
/**
 * `gameId` 당 생성기와 기록을 하나씩만 만들어 둔다. 페이지가 렌더마다 새 클로저를
 * 넘기면 매 렌더 새 판이 나온다. 기록 키 규약은 `<gameId>.<drillId>.best` 다.
 */
import { createBestRecord, type BestRecord } from '@/lib/rush/record'
import { GAMES, type GameId } from '@/lib/games'
import { generatePotLimitRun } from './generate'
import type { PotLimitQuestion } from './types'

const RUNS = new Map<GameId, (seed: string) => PotLimitQuestion[]>()

export function potLimitRun(gameId: GameId): (seed: string) => PotLimitQuestion[] {
  const found = RUNS.get(gameId)
  if (found !== undefined) return found
  const run = (seed: string) => generatePotLimitRun(GAMES[gameId], seed)
  RUNS.set(gameId, run)
  return run
}

const RECORDS = new Map<GameId, BestRecord>()

export function potLimitRecord(gameId: GameId): BestRecord {
  const found = RECORDS.get(gameId)
  if (found !== undefined) return found
  const record = createBestRecord(`${gameId}.potlimit.best`)
  RECORDS.set(gameId, record)
  return record
}
```

- [ ] **Step 2: 숫자 입력 패널을 만든다**

`app/src/components/drills/potlimit/PotLimitQuestionPanel.tsx`. **보기를 주지 않는다** — 숫자를 받는다.

```tsx
/**
 * 팟리밋 계산 문제 한 장.
 *
 * **보기가 없다.** 팟리밋에서는 벳 크기가 선택이 아니라 계산이라, 보기를 주면 계산하지
 * 않고 고를 수 있게 된다 (`mix-room.html` 설계 주석).
 *
 * 벳은 화면에 **실제로 칩으로 놓는다.** 팟리밋 계산은 머리로 그리는 일이 아니라
 * 테이블에 있는 칩을 세는 일이다.
 */
'use client'

import { useState } from 'react'
import { PokerTable } from '@/components/table/PokerTable'
import type { PotLimitQuestion } from '@/lib/drills/potlimit/types'
import type { Verdict } from '@/lib/rush/session'

const won = (n: number) => n.toLocaleString('ko-KR')

export function PotLimitQuestionPanel({
  question, index, total, verdict, onSubmit, onNext,
}: {
  question: PotLimitQuestion
  index: number
  total: number
  verdict: Verdict
  onSubmit(amount: number): void
  onNext(): void
}) {
  const [text, setText] = useState('')
  const parsed = Number(text.replace(/[^0-9]/g, ''))
  const ready = text !== '' && Number.isFinite(parsed) && parsed > 0

  return (
    <div>
      <p className="mb-1 text-xs text-zinc-500">
        {index + 1}/{total} · {question.label}
      </p>

      <div className="sim-root">
        <PokerTable
          state={{
            seats: question.seats.map((s) => ({
              name: s.name,
              stack: 0,
              bet: s.bet,
              folded: s.folded,
              allIn: false,
              hole: [],
              revealed: false,
            })),
            buttonSeat: question.buttonSeat,
            board: [],
            pot: question.collected,
          }}
          burnCount={0}
        />
      </div>

      <p className="mt-3 text-sm font-bold">{question.prompt}</p>
      <p className="text-xs text-zinc-500">화면에 놓인 칩을 세어 보세요</p>

      <input
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={verdict !== null}
        placeholder="금액"
        className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-right text-lg font-bold tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
      />
      {ready ? (
        <p className="mt-1 text-right text-xs text-zinc-500">{won(parsed)}</p>
      ) : null}

      {verdict === null ? (
        <button
          type="button"
          onClick={() => onSubmit(parsed)}
          disabled={!ready}
          className="mt-3 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          제출
        </button>
      ) : (
        <>
          <p className="mt-3 rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
            정답 <b>{won(question.answer)}</b> — {question.why}
          </p>
          <button
            type="button"
            onClick={onNext}
            className="mt-2 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white"
          >
            다음
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 페이지를 만든다**

`app/src/app/games/[gameId]/potlimit/page.tsx`:

```tsx
/**
 * 팟리밋 계산 — 10문제 한 판.
 *
 * 이 칸은 `drillsFor` 가 `spec.betting === 'PL'` 일 때만 낸다. 노리밋 홀덤에는
 * 이 칸이 아예 없으므로 URL 을 직접 쳐도 404 다 — 화면과 같은 사실이어야 한다.
 */
'use client'

import { notFound } from 'next/navigation'
import { use } from 'react'
import { PotLimitQuestionPanel } from '@/components/drills/potlimit/PotLimitQuestionPanel'
import { RushScreen } from '@/components/rush/RushScreen'
import { potLimitRecord, potLimitRun } from '@/lib/drills/potlimit/registry'
import {
  POTLIMIT_KIND_LABEL, POTLIMIT_QUESTION_COUNT,
  type PotLimitKind, type PotLimitQuestion,
} from '@/lib/drills/potlimit/types'
import { drillHref, GAMES, isGameId } from '@/lib/games'

/** 이 드릴에는 칩이 나온다. **모듈 최상위 함수여야 한다** */
function hasChips(): boolean {
  return true
}

export default function PotLimitPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params)
  if (!isGameId(gameId) || drillHref(gameId, 'potlimit') === null) notFound()

  return (
    <RushScreen<PotLimitKind, PotLimitQuestion>
      path={`/games/${gameId}/potlimit`}
      title="팟리밋 계산"
      eyebrow={`${GAMES[gameId].labels.ko} · 팟리밋 계산`}
      footer={`${POTLIMIT_QUESTION_COUNT}문제 · 답은 레이즈 총액입니다`}
      labels={POTLIMIT_KIND_LABEL}
      record={potLimitRecord(gameId)}
      generate={potLimitRun(gameId)}
      hasChips={hasChips}
      renderQuestion={({ question, index, total, verdict, answer, next }) => (
        <PotLimitQuestionPanel
          key={index}
          question={question}
          index={index}
          total={total}
          verdict={verdict}
          onSubmit={(amount) => answer(amount === question.answer)}
          onNext={next}
        />
      )}
    />
  )
}
```

- [ ] **Step 4: 라우트를 연다**

`app/src/lib/games/routes.ts` 의 `plo8` 블록에 더한다.

```ts
    potlimit: '/games/plo8/potlimit',
```

- [ ] **Step 5: 타입과 빌드를 확인한다**

Run: `cd app && npx tsc --noEmit && npm run build`
Expected: tsc 0 errors, 빌드 성공

- [ ] **Step 6: 커밋**

```bash
git add app/src/lib/drills/potlimit/registry.ts \
        app/src/components/drills/potlimit/ \
        "app/src/app/games/[gameId]/potlimit/" \
        app/src/lib/games/routes.ts
git commit -m "feat: 팟리밋 계산 화면과 라우트"
```

---

## Task 10: 팟리밋 브라우저 확인과 e2e

**Files:**
- Modify: `app/e2e/grid-plo8.spec.ts`

- [ ] **Step 1: 실제 브라우저로 한 판을 끝까지 푼다**

`npm run dev` 후 `http://localhost:3000/games/plo8` → 「팟리밋 계산」. 눈으로 확인할 것:

1. **팟과 앞에 놓인 벳이 칩으로 보이는가** — 이 드릴은 그 칩을 세는 것이 전부다
2. 숫자 입력이 모바일에서 숫자 키패드를 여는가 (`inputMode="numeric"`)
3. 입력한 값이 아래에 천 단위 구분으로 다시 보이는가
4. 오답일 때 정답과 근거가 나오는가
5. **다음 문제에서 입력칸이 비워지는가**
6. 노리밋 홀덤 종목 허브(`/games/nlh`)에 **팟리밋 칸이 아예 없는가** (「준비 중」도 아니어야 한다)

- [ ] **Step 2: e2e 테스트를 더한다**

```ts
test('팟리밋 계산은 숫자를 받고 정답을 알려준다', async ({ page }) => {
  await page.goto('/games/plo8/potlimit')
  await expect(page.getByText('팟리밋 계산')).toBeVisible()
  await page.getByPlaceholder('금액').fill('1')
  await page.getByRole('button', { name: '제출' }).click()
  await expect(page.getByText('정답')).toBeVisible()
  await expect(page.getByRole('button', { name: '다음' })).toBeVisible()
})

test('노리밋 홀덤에는 팟리밋 칸이 아예 없다', async ({ page }) => {
  await page.goto('/games/nlh')
  await expect(page.getByText('팟리밋 계산')).toHaveCount(0)
})
```

- [ ] **Step 3: 전체 검증**

Run: `cd app && npx vitest run && npx tsc --noEmit && npx playwright test && npm run lint`
Expected: 단위 실패 0 · tsc 0 · e2e 18 통과 · lint 는 **기존 1 error 그대로**

- [ ] **Step 4: 커밋**

```bash
git add app/e2e/grid-plo8.spec.ts
git commit -m "test: 팟리밋 계산 브라우저 검증"
```

---

## 완료 뒤 — 재미 게이트

두 드릴 각각 사람이 한 판을 끝까지 하고 답해야 한다 (PRD §3). **통과하기 전에는 다음
하위 프로젝트로 넘어가지 않는다.**

**팟 분배**
1. 다시 하기가 눌리나?
2. 지루한가?
3. 제한시간(하이/로우 절반 40초 · 홀칩 25초 · 사이드팟 50초)이 맞나?
4. 사이드팟 문제에서 **자격자가 누구인지 화면만 보고 알 수 있나?**
5. 홀칩 문제가 「하이 승자에게」라는 규칙을 가르치나, 아니면 그냥 찍게 되나?

**팟리밋 계산**
1. 다시 하기가 눌리나?
2. 제한시간(팟벳 30초 · 팟까지 레이즈 45초)이 맞나?
3. **숫자 입력이 답답하지 않은가?** 답답하면 그것이 첫 수정이다
4. 팟까지 레이즈 유형이 팟벳보다 6:4 로 많은 배분이 맞나?

게이트 결과가 곧 다음 세션의 첫 작업이다.
