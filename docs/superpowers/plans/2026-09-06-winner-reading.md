# 승자 판독 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `보드보기` 와 `로우 판독` 두 드릴을 `승자 판독` 한 칸으로 합치고, PLO8 에서 하이 승자와 로우 승자를 함께 고르는 드릴을 만든다.

**Architecture:** 문제는 `GameSpec` 하나에서 나온다 — `generateWinnerRun(spec, seed)` 이 `spec.eval` 을 읽어 무엇을 물을지(`asks`) 정하고, 정답은 엔진(`bestOmahaHi`·`bestOmahaLow`)이 낸다. 화면은 기존 러시 뼈대(`RushScreen`)를 **한 줄도 고치지 않고** 문제 패널 하나만 새로 붙인다. 격자의 `eval.lo === null` 조건이 드릴 유무(`drillsFor`)에서 문제 모양(`asks.lo`)으로 내려간다.

**Tech Stack:** TypeScript · Next.js (App Router) · React · Tailwind · vitest · Playwright

**Spec:** [`docs/superpowers/specs/2026-09-06-winner-reading-design.md`](../specs/2026-09-06-winner-reading-design.md)

**작업 위치:** 워크트리 `.claude/worktrees/grid-plo8`, 브랜치 `feat/grid-plo8`. **메인 체크아웃이 아니다** — 메인에서 `npm run dev` 를 띄우면 `/games/plo8/*` 가 전부 404 다. 모든 명령은 그 워크트리의 `app/` 에서 돈다.

---

## Global Constraints

**모든 태스크의 요구사항에 이 절이 암묵적으로 포함된다.** 서브에이전트를 띄울 때마다 이 절을 프롬프트에 넣어라.

1. **정답은 엔진이 낸다.** 드릴·화면 코드에 포커 규칙을 쓰지 마라. 하이는 `bestOmahaHi`, 로우는 `bestOmahaLow` 가 낸다. 쓰고 싶어지면 엔진이 부족한 것이다
2. **시드 결정론.** 생성기 안에서 `Math.random()` 을 한 번이라도 쓰면 시드가 무의미해진다. 무작위는 `createRng(seed)` 가 준 `Rng` 로만 얻는다. 화면도 렌더 중에 `randomSeed()` 를 부르지 마라 — 지난 단계에 하이드레이션 불일치로 실제로 터졌다
3. **불변.** 순수 함수와 리듀서는 입력을 뮤테이트하지 않는다. 배열은 `[...arr]` 로 복사한 뒤 다룬다
4. **판정에 표시 라벨을 쓰지 마라.** `spec.betting`·`spec.eval` 코드값으로 갈라라. `spec.labels.*` 는 화면 전용이다
5. **`RushScreen` 을 복사하지 마라.** props 가 부족하면 props 를 늘려라. 이번 계획은 `RushScreen` 을 고치지 않고 끝나야 한다
6. **`generate` 와 `record` 와 `hasChips` 는 정체성이 고정된 함수여야 한다.** `RushScreen` 이 `useMemo(() => generate(seed), [generate, seed])` 로 문제를 만든다 — 렌더마다 새 클로저를 넘기면 매 렌더 새 판이 나온다
7. **기록 키를 지우지 마라.** `potrush.best` · `actionrush.best` · `mixdeal.best` · `mixroom.best` · `plo8.lowreading.best` 를 건드리지 않는다. 새 키는 `plo8.winner.best` 다
8. **범위를 넓히지 마라.** 팟리밋 계산 · 팟 분배 · 사고 처리 · 딜링 룸 · 새 종목 · `/rush` 이전은 이번이 아니다
9. **`lib/rush/` · `lib/action-rush/` 를 옮기지 마라** — 테스트가 걸려 있고 얻는 게 없다
10. **말투를 검사하라.** 이름 뒤 조사는 붙여 쓴다(`4번이다`, `PLO8은`). 명령형은 「…하세요」로 통일한다. 영어 직역·번역투를 쓰지 마라
11. **완료는 실행 출력으로만 주장한다.** 명령을 이번 메시지에서 실제로 돌리지 않았으면 통과했다고 말하지 마라

### 검증 명령 (태스크마다)

```bash
cd "C:/Users/user/Desktop/dealer master/.claude/worktrees/grid-plo8/app"
npx vitest run          # 실패 0
npx tsc --noEmit        # 오류 0
npm run build           # Task 3·4 에서만
```

**테스트 개수 기준선에 주의하라.** 지금까지 이 레포의 규칙은 "449개 아래로 내려가면 안 된다"였다. **이번 계획은 그 규칙을 의도적으로 깬다** — Task 3 에서 `lib/drills/lowreading/generate.test.ts` 의 **6개를 삭제**하기 때문이다. 그래서 이렇게 한다.

- Task 1 을 시작하기 전에 `npx vitest run` 을 돌려 **지금 개수를 받아 적는다**(문서의 449 를 믿지 말고 실제로 센다)
- Task 3 이 끝난 뒤 개수는 `기준선 - 6 + (Task 1 이 추가한 수)` 여야 한다. 그 산수가 맞는지 확인한다
- **어느 태스크에서도 실패는 0이다.** 이 규칙에는 예외가 없다

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| **새로** `src/lib/drills/winner/types.ts` | 문제 타입 · 상수 · `asksFor(spec)` |
| **새로** `src/lib/drills/winner/generate.ts` | `GameSpec` 에서 10문제를 만든다 |
| **새로** `src/lib/drills/winner/generate.test.ts` | 정답이 엔진과 일치하는지 · 배분 하한 · 시드 결정론 |
| **새로** `src/lib/drills/winner/registry.ts` | `gameId` 당 생성기·기록을 하나씩 캐시한다(제약 6) |
| **새로** `src/components/drills/winner/WinnerQuestionPanel.tsx` | 문제 한 장을 그린다. 채점은 하지 않는다 |
| **새로** `src/app/games/[gameId]/winner/page.tsx` | 러시 뼈대에 드릴을 꽂고 **채점한다** |
| 고침 `src/lib/games/drills.ts` | `DrillId` 일곱 → 여섯 |
| 고침 `src/lib/games/drills.test.ts` | 위 변경에 맞춤 |
| 고침 `src/lib/games/routes.ts` | `winner` 칸의 행선지 |
| 고침 `e2e/grid-plo8.spec.ts` | 승자 판독 경로와 360px 넘침 |
| 고침 `PRD.md` §6 · §6-1 | 격자표와 드릴표 |
| **삭제** `src/lib/drills/lowreading/` · `src/components/drills/lowreading/` · `src/app/games/[gameId]/low-reading/` | 승자 판독에 흡수됐다 |

**채점이 페이지에 있는 것은 이 레포의 관례다.** 문제 타입의 어느 갈래인지 아는 것은 그 드릴뿐이고, 공용 뼈대가 그것을 알기 시작하면 드릴이 늘 때마다 뼈대가 부푼다(`/rush` 와 기존 로우 판독이 둘 다 그렇게 돈다).

---

### Task 1: 문제 타입과 생성기

**Files:**
- Create: `app/src/lib/drills/winner/types.ts`
- Create: `app/src/lib/drills/winner/generate.ts`
- Test: `app/src/lib/drills/winner/generate.test.ts`

**Interfaces:**
- Consumes: `@/lib/simulator` 에서 `bestOmahaHi(hole, board): HandRank` · `bestOmahaLow(hole, board, qualifier): LowRank | null` · `compareHands(a, b): number` · `compareLow(a, b): number` · `createRng(seed): Rng`(`rng.int(maxExclusive)`) · `makeDeck(): Card[]` · `shuffle(cards, rng): Card[]` · 타입 `Card`·`Rng`·`HandRank`(`{ category, tiebreak, label }`)·`LowRank`. `@/lib/games` 에서 `GAMES`·타입 `GameSpec`
- Produces:
  - `type WinnerKind = 'winner'`
  - `type WinnerSeat = { name: string; hole: Card[] }`
  - `type WinnerAsks = { hi: boolean; lo: boolean }`
  - `type WinnerQuestion` (아래 Step 3 에 전체 정의)
  - `const WINNER_KIND_LABEL: Record<WinnerKind, string>`
  - `const WINNER_QUESTION_COUNT = 10` · `const WINNER_LIMIT_SEC = 40`
  - `function asksFor(spec: GameSpec): WinnerAsks`
  - `function generateWinnerRun(spec: GameSpec, seed: string): WinnerQuestion[]`

**참고 — `Rng` 의 사용법:** `rng.int(n)` 이 `0 ≤ x < n` 인 정수를 준다. `lib/drills/lowreading/generate.ts` 가 같은 방식으로 쓰고 있으니 지우기 전에 읽어 봐라.

**주의 — `RushLike` 가 `kind` 를 요구한다.** `lib/rush/session.ts:27` 이 `type RushLike<K extends string> = { kind: K; limitSec: number }` 다. 승자 판독은 유형이 하나뿐이지만 뼈대가 `kind` 를 읽으므로 `kind: 'winner'` 를 상수로 넣는다. 이 필드로 문제를 갈라 판정하지 마라 — 값이 하나뿐이다.

- [ ] **Step 1: 지금 테스트 개수를 받아 적는다**

```bash
cd "C:/Users/user/Desktop/dealer master/.claude/worktrees/grid-plo8/app"
npx vitest run
```

출력 맨 아래 `Tests  N passed (N)` 의 `N` 을 적어 둔다. **이 계획의 나머지 산수가 이 숫자에서 출발한다.** 문서에 적힌 449 를 그대로 쓰지 마라 — 실제로 센 값을 쓴다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`app/src/lib/drills/winner/generate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { asksFor, WINNER_QUESTION_COUNT } from './types'
import { generateWinnerRun } from './generate'
import { GAMES } from '@/lib/games'
import { bestOmahaHi, bestOmahaLow, cardToString, compareHands, compareLow } from '@/lib/simulator'

const plo8 = GAMES.plo8
const run = (seed: string) => generateWinnerRun(plo8, seed)

describe('asksFor', () => {
  it('PLO8은 하이와 로우를 둘 다 묻는다', () => {
    expect(asksFor(GAMES.plo8)).toEqual({ hi: true, lo: true })
  })

  it('노리밋 홀덤은 로우를 묻지 않는다', () => {
    expect(asksFor(GAMES.nlh)).toEqual({ hi: true, lo: false })
  })
})

describe('generateWinnerRun', () => {
  it('10문제를 만든다', () => {
    expect(run('seed-a')).toHaveLength(WINNER_QUESTION_COUNT)
  })

  it('같은 시드는 같은 문제를 만든다', () => {
    expect(run('seed-a')).toEqual(run('seed-a'))
  })

  it('보드가 늘 5장이고 좌석마다 홀카드가 4장이며 같은 카드가 두 번 나오지 않는다', () => {
    for (const q of run('seed-b')) {
      expect(q.board).toHaveLength(5)
      for (const seat of q.seats) expect(seat.hole).toHaveLength(4)
      const all = [...q.board, ...q.seats.flatMap((s) => s.hole)].map(cardToString)
      expect(new Set(all).size).toBe(all.length)
    }
  })

  // 정답을 다시 계산해 비교한다. 생성기가 엔진이 아니라 자기 짐작으로 답을 냈다면 여기서 깨진다
  it('하이 정답이 bestOmahaHi 와 일치한다', () => {
    for (const q of run('seed-c')) {
      const ranks = q.seats.map((s) => bestOmahaHi(s.hole, q.board))
      let top = ranks[0]
      for (const r of ranks) if (compareHands(r, top) > 0) top = r
      const expected = ranks.flatMap((r, i) => (compareHands(r, top) === 0 ? [i] : []))
      expect([...q.answerHi].sort()).toEqual(expected)
    }
  })

  it('로우 정답이 bestOmahaLow 와 일치하고, 자격자가 없으면 빈 배열이다', () => {
    for (const q of run('seed-d')) {
      const lows = q.seats.map((s) => bestOmahaLow(s.hole, q.board, 8))
      const alive = lows.flatMap((l, i) => (l === null ? [] : [i]))
      if (alive.length === 0) {
        expect(q.answerLo).toEqual([])
        continue
      }
      let best = lows[alive[0]]!
      for (const i of alive) if (compareLow(lows[i]!, best) < 0) best = lows[i]!
      const expected = alive.filter((i) => compareLow(lows[i]!, best) === 0)
      expect([...q.answerLo].sort()).toEqual(expected)
    }
  })

  // 로우가 매번 없으면 「로우 없음」이 정답 고정이 되고, 매번 있으면 아무도 그 버튼을 안 누른다
  it('한 판에 로우 성립이 최소 셋, 불성립이 최소 둘 나온다', () => {
    for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
      const qs = run(seed)
      const present = qs.filter((q) => q.answerLo.length > 0).length
      expect(present).toBeGreaterThanOrEqual(3)
      expect(qs.length - present).toBeGreaterThanOrEqual(2)
    }
  })

  // 동점을 걸러내지 않는다는 것을 증명한다. 쿼터링이 실제 딜러 실수가 가장 많은 자리다
  it('동점 답이 실제로 출제된다', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => `tie-${i}`)
    const ties = seeds.flatMap(run).filter((q) => q.answerHi.length > 1 || q.answerLo.length > 1)
    expect(ties.length).toBeGreaterThan(0)
  })

  it('아직 만들지 않은 갈래는 조용히 넘어가지 않고 던진다', () => {
    // 노리밋 홀덤은 mustUse 가 null 이다 — 아무 다섯 장 갈래는 그 종목이 붙을 때 만든다
    expect(() => generateWinnerRun(GAMES.nlh, 'x')).toThrow()
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

```bash
npx vitest run src/lib/drills/winner/generate.test.ts
```

Expected: FAIL — `Failed to resolve import "./types"` (파일이 아직 없다)

- [ ] **Step 4: 타입과 상수를 쓴다**

`app/src/lib/drills/winner/types.ts`:

```ts
/**
 * 승자 판독 드릴의 문제 타입.
 *
 * **쇼다운에서 딜러가 하는 일은 하나다** — 이 판의 임자를 가리는 것. 하이 게임에서는
 * 한 사람이고, 스플릿 게임에서는 둘이며, 로우가 성립하지 않으면 다시 한 사람이다.
 * 그래서 드릴도 하나다 (설계 §1).
 *
 * **정답은 이 타입 안에 값으로 들어 있지만, 그 값을 만든 것은 전부 엔진이다**
 * (`bestOmahaHi` · `bestOmahaLow`). 드릴 코드에 포커 규칙은 없다.
 */
import type { Card } from '@/lib/simulator'
import type { GameSpec } from '@/lib/games'

/**
 * 유형이 하나뿐이다. 그런데도 이 타입이 있는 것은 `RushLike`(`lib/rush/session.ts:27`)가
 * `kind` 를 요구하기 때문이다. **이 값으로 문제를 갈라 판정하지 마라** — 값이 하나다.
 */
export type WinnerKind = 'winner'

export const WINNER_KIND_LABEL: Record<WinnerKind, string> = { winner: '승자 판독' }

export const WINNER_QUESTION_COUNT = 10

/**
 * 제한시간(초). **초안이다** — 기존 로우 승자가 30초였고 하이 판단이 얹혔다.
 * PRD §11 의 열린 질문이고 재미 게이트에서 확정한다 (설계 §9).
 */
export const WINNER_LIMIT_SEC = 40

/** 한 판 10문제 중 로우가 성립하는 판의 하한. 매번 없으면 「로우 없음」이 정답 고정이 된다 */
export const LO_PRESENT_MIN = 3
/** 로우가 성립하지 않는 판의 하한. 매번 있으면 아무도 「로우 없음」을 안 누른다 */
export const LO_ABSENT_MIN = 2

/** 이 드릴의 출제 좌석 수. `GameSpec` 에 없다 — 격자가 아니라 이 드릴의 설정이다 */
export const WINNER_SEAT_COUNT = 4

export type WinnerSeat = { name: string; hole: Card[] }

/** 이 종목이 무엇을 묻는가. **`spec.eval` 이 정한다** — 화면이 정하지 않는다 */
export type WinnerAsks = { hi: boolean; lo: boolean }

export type WinnerQuestion = {
  kind: WinnerKind
  limitSec: number
  /** 화면 상단 유형 이름 */
  label: string
  prompt: string
  seats: WinnerSeat[]
  board: Card[]
  buttonSeat: number
  asks: WinnerAsks
  /** 하이 승자 좌석. **동점이면 여럿이다.** `asks.hi` 가 false 면 빈 배열 */
  answerHi: number[]
  /** 로우 승자 좌석. **로우가 성립하지 않으면 빈 배열** — 화면의 「로우 없음」이 이것이다 */
  answerLo: number[]
  /** 채점 후 보여주는 근거 한 줄 */
  why: string
}

/**
 * 격자의 `eval` 조건이 드릴 유무에서 문제 모양으로 내려온 자리다 (설계 §2).
 *
 * 전에는 `drillsFor` 가 `eval.lo === null` 인 종목에서 로우 판독 칸을 지웠다.
 * 지금은 칸이 늘 있고 **묻는 것이 갈린다.**
 */
export function asksFor(spec: GameSpec): WinnerAsks {
  return { hi: spec.eval.hi !== null, lo: spec.eval.lo !== null }
}
```

- [ ] **Step 5: 생성기를 쓴다**

`app/src/lib/drills/winner/generate.ts`:

```ts
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
```

- [ ] **Step 6: 테스트가 통과하는지 본다**

```bash
npx vitest run src/lib/drills/winner/generate.test.ts
npx tsc --noEmit
```

Expected: 10 passed · 타입 오류 0

**「동점 답이 실제로 출제된다」가 실패하면** 생성기가 아니라 테스트를 의심해라 — 시드 30개(=300문제)에서 4인 오마하 하이로우 동점이 하나도 없을 확률은 매우 낮다. 그래도 실패하면 `bestOmahaLow` 가 아니라 `loWinners` 의 동점 판정을 먼저 봐라.

- [ ] **Step 7: 전체 테스트를 돌리고 커밋한다**

```bash
npx vitest run
git add src/lib/drills/winner/
git commit -m "feat: 승자 판독 문제 생성기 — 하이와 로우를 한 문제에서 묻는다"
```

Expected: 실패 0. 개수는 Step 1 에서 적은 값 + 10

---

### Task 2: 문제 패널과 레지스트리

**Files:**
- Create: `app/src/lib/drills/winner/registry.ts`
- Create: `app/src/components/drills/winner/WinnerQuestionPanel.tsx`

**Interfaces:**
- Consumes: Task 1 의 `WinnerQuestion`·`WinnerKind`·`generateWinnerRun`. `@/lib/rush/record` 의 `createBestRecord(key: string): BestRecord`. `@/lib/rush/session` 의 `type Verdict = { correct: boolean; points: number; headline: string } | null`. `@/lib/games` 의 `GAMES`·`type GameId`. `@/components/table/Card` 의 `<Card card={...} faceUp size="sm" />`
- Produces:
  - `function winnerRun(gameId: GameId): (seed: string) => WinnerQuestion[]`
  - `function winnerRecord(gameId: GameId): BestRecord`
  - `function WinnerQuestionPanel(props): JSX.Element` — props 는 Step 2 에 전체 정의

**이 태스크에는 단위 테스트가 없다.** 화면 컴포넌트이고, 이 레포는 화면을 Playwright 와 실제 브라우저로 검증한다(Task 4). `npx tsc --noEmit` 이 이 태스크의 기계 검증이다.

- [ ] **Step 1: 레지스트리를 쓴다**

`app/src/lib/drills/winner/registry.ts`:

```ts
/**
 * `gameId` 당 생성기와 기록을 **하나씩만** 만들어 둔다.
 *
 * `RushScreen` 이 `useMemo(() => generate(seed), [generate, seed])` 로 문제를 만든다.
 * 페이지가 렌더마다 새 클로저를 넘기면 **매 렌더 새 판이 나온다** — 화면에 뜬 카드가
 * 바뀌는 결함이 정확히 그렇게 생긴다. 여기서 정체성을 고정한다.
 *
 * 기록 키 규약은 `<gameId>.<drillId>.best` 다. **기존 키를 지우지 않는다** —
 * `plo8.lowreading.best` 는 그대로 두고 `plo8.winner.best` 를 새로 쓴다.
 */
import { createBestRecord, type BestRecord } from '@/lib/rush/record'
import { GAMES, type GameId } from '@/lib/games'
import { generateWinnerRun } from './generate'
import type { WinnerQuestion } from './types'

const RUNS = new Map<GameId, (seed: string) => WinnerQuestion[]>()

export function winnerRun(gameId: GameId): (seed: string) => WinnerQuestion[] {
  const found = RUNS.get(gameId)
  if (found !== undefined) return found
  const run = (seed: string) => generateWinnerRun(GAMES[gameId], seed)
  RUNS.set(gameId, run)
  return run
}

const RECORDS = new Map<GameId, BestRecord>()

export function winnerRecord(gameId: GameId): BestRecord {
  const found = RECORDS.get(gameId)
  if (found !== undefined) return found
  const record = createBestRecord(`${gameId}.winner.best`)
  RECORDS.set(gameId, record)
  return record
}
```

- [ ] **Step 2: 문제 패널을 쓴다**

`app/src/components/drills/winner/WinnerQuestionPanel.tsx`:

```tsx
/**
 * 승자 판독 문제 한 장.
 *
 * **정답 판정은 여기가 아니라 페이지가 한다.** 이 컴포넌트는 고른 좌석을 `onSubmit` 으로
 * 넘겨줄 뿐이다 — 공용 뼈대와 패널이 정답을 알기 시작하면 드릴이 늘 때마다 둘 다 부푼다
 * (`/rush` 가 이미 그 관례로 돈다).
 */
'use client'

import { useState } from 'react'
import { Card } from '@/components/table/Card'
import type { WinnerQuestion } from '@/lib/drills/winner/types'
import type { Verdict } from '@/lib/rush/session'

const asc = (a: number, b: number) => a - b

export function WinnerQuestionPanel({
  question,
  index,
  total,
  verdict,
  onSubmit,
  onNext,
}: {
  question: WinnerQuestion
  index: number
  total: number
  verdict: Verdict
  /** 고른 좌석. 로우를 「없음」으로 고르면 `lo` 가 빈 배열이다 */
  onSubmit(hi: number[], lo: number[]): void
  onNext(): void
}) {
  const [hi, setHi] = useState<number[]>([])
  const [lo, setLo] = useState<number[]>([])
  /**
   * 「로우 없음」을 **명시적으로** 골랐는가. 아무것도 안 고른 것과 없음을 고른 것을
   * 구분하지 않으면 제출 버튼을 언제 열지 정할 수 없다 (설계 §5).
   */
  const [noLow, setNoLow] = useState(false)
  const solving = verdict === null

  const toggle = (list: number[], seat: number) =>
    list.includes(seat) ? list.filter((s) => s !== seat) : [...list, seat]

  const pickHi = (seat: number) => setHi((prev) => toggle(prev, seat))
  const pickLo = (seat: number) => {
    setNoLow(false)
    setLo((prev) => toggle(prev, seat))
  }
  const pickNoLow = () => {
    setLo([])
    setNoLow(true)
  }

  const ready =
    (!question.asks.hi || hi.length > 0) && (!question.asks.lo || lo.length > 0 || noLow)

  const names = (seats: number[]) =>
    seats.length === 0 ? '없음' : [...seats].sort(asc).map((s) => question.seats[s].name).join(' · ')

  /** 내가 고른 것. 시간이 먼저 끝나면 고른 것이 없다 */
  const pickedText = (list: number[], picked: boolean) => (picked ? names(list) : '고른 것 없음')

  const seatButton = (seat: number, list: number[], onPick: (seat: number) => void) => (
    <button
      type="button"
      disabled={!solving}
      aria-pressed={list.includes(seat)}
      onClick={() => onPick(seat)}
      className={`rounded-lg border px-2 py-1.5 text-xs font-bold disabled:opacity-40 ${
        list.includes(seat)
          ? 'border-dm-teal-600 bg-dm-teal-50 text-dm-teal-800'
          : 'border-zinc-300 dark:border-zinc-700'
      }`}
    >
      {question.seats[seat].name}
    </button>
  )

  return (
    <section className="mt-3">
      <p className="text-[11px] text-zinc-500">
        {index + 1} / {total} · {question.label}
      </p>
      <p className="mt-1 text-base font-bold">{question.prompt}</p>

      {/* 펠트 초록은 `--felt` 로 쓰지 않는다 — 그 변수는 `.sim-root` 에만 있다 */}
      <div className="mt-3 rounded-xl bg-dm-teal-800 p-3">
        <p className="text-[10px] font-bold text-dm-teal-50">보드</p>
        <div className="mt-1 flex gap-1">
          {question.board.map((card, i) => (
            <Card key={i} card={card} faceUp size="sm" />
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {question.seats.map((seat, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-10 text-xs font-bold">{seat.name}</span>
            <div className="flex gap-1">
              {seat.hole.map((card, j) => (
                <Card key={j} card={card} faceUp size="sm" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {question.asks.hi ? (
        <div className="mt-4">
          <p className="text-xs font-bold text-zinc-500">하이 승자</p>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {question.seats.map((_, i) => seatButton(i, hi, pickHi))}
          </div>
        </div>
      ) : null}

      {question.asks.lo ? (
        <div className="mt-3">
          <p className="text-xs font-bold text-zinc-500">로우 승자</p>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {question.seats.map((_, i) => seatButton(i, lo, pickLo))}
          </div>
          <button
            type="button"
            disabled={!solving}
            aria-pressed={noLow}
            onClick={pickNoLow}
            className={`mt-1.5 w-full rounded-lg border py-1.5 text-xs font-bold disabled:opacity-40 ${
              noLow
                ? 'border-dm-teal-600 bg-dm-teal-50 text-dm-teal-800'
                : 'border-zinc-300 dark:border-zinc-700'
            }`}
          >
            로우 없음
          </button>
        </div>
      ) : null}

      {solving ? (
        <button
          type="button"
          disabled={!ready}
          onClick={() => onSubmit(hi, lo)}
          className="mt-4 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          확인
        </button>
      ) : null}

      {verdict !== null ? (
        <div className="mt-4">
          <p className="text-sm font-bold">{verdict.headline}</p>

          {/*
           * 틀렸을 때도 정답을 가리지 않는다 — 연습이기 때문이다.
           * 하이와 로우를 갈라서 보여준다: 채점은 이진이지만 어디서 틀렸는지는 알아야 한다
           */}
          <div className="mt-3 space-y-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            {question.asks.hi ? (
              <p className="text-zinc-600 dark:text-zinc-400">
                <span className="font-bold text-zinc-400 dark:text-zinc-500">하이 </span>
                내가 고른 것 {pickedText(hi, hi.length > 0)} · 정답 {names(question.answerHi)}
              </p>
            ) : null}
            {question.asks.lo ? (
              <p className="text-zinc-600 dark:text-zinc-400">
                <span className="font-bold text-zinc-400 dark:text-zinc-500">로우 </span>
                내가 고른 것 {pickedText(lo, lo.length > 0 || noLow)} · 정답{' '}
                {names(question.answerLo)}
              </p>
            ) : null}
            <p
              className={
                verdict.correct
                  ? 'text-dm-teal-800 dark:text-dm-teal-100'
                  : 'font-bold text-dm-red dark:text-dm-red-50'
              }
            >
              {question.why}
            </p>
          </div>

          <button
            type="button"
            onClick={onNext}
            className="mt-2 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white"
          >
            다음 문제
          </button>
        </div>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 3: 타입과 린트를 확인한다**

```bash
npx tsc --noEmit
npm run lint
```

Expected: 오류 0

`@/components/table/Card` 의 props 이름이 위와 다르면 **그 파일을 열어 맞춰라** — 기존 `LowQuestionPanel.tsx` 가 같은 방식으로 쓰고 있으니 지우기 전에 대조해 봐라.

- [ ] **Step 4: 커밋한다**

```bash
npx vitest run
git add src/lib/drills/winner/registry.ts src/components/drills/winner/
git commit -m "feat: 승자 판독 문제 패널 — 하이와 로우를 각각 여럿 고른다"
```

Expected: 실패 0

---

### Task 3: 격자를 여섯으로 — 라우트·페이지 교체와 옛 드릴 삭제

**Files:**
- Modify: `app/src/lib/games/drills.ts`
- Modify: `app/src/lib/games/drills.test.ts`
- Modify: `app/src/lib/games/routes.ts`
- Create: `app/src/app/games/[gameId]/winner/page.tsx`
- Delete: `app/src/app/games/[gameId]/low-reading/` · `app/src/lib/drills/lowreading/` · `app/src/components/drills/lowreading/`
- Modify: `PRD.md` (§6 격자표 · §6-1 드릴표)

**Interfaces:**
- Consumes: Task 1·2 전부. `@/lib/games` 의 `GAMES`·`isGameId`·`drillHref`. `@/components/rush/RushScreen` 의 `RushScreen<K, Q>`
- Produces: `type DrillId = 'procedure' | 'winner' | 'potlimit' | 'potaward' | 'incident' | 'action'` — 격자를 읽는 모든 곳이 이 값을 쓴다

**이 셋을 한 태스크로 묶는 이유:** 서로 물려 있다. `DrillId` 만 바꾸면 옛 페이지가 컴파일되지 않고, 페이지만 바꾸면 라우트가 없다. **중간 상태를 만들지 않는다.**

- [ ] **Step 1: 실패하는 테스트로 격자표를 먼저 고친다**

`app/src/lib/games/drills.test.ts` 의 첫 `describe('drillsFor')` 블록 넷을 이렇게 바꾼다. 아래 `describe('PLO8 스펙')` 블록은 **손대지 않는다.**

```ts
describe('drillsFor', () => {
  it('PLO8은 드릴 여섯이 전부 해당된다', () => {
    expect(drillsFor(GAMES.plo8)).toEqual([
      'procedure', 'winner', 'potlimit', 'potaward', 'incident', 'action',
    ])
  })

  it('노리밋 홀덤은 팟리밋만 해당 없다', () => {
    const drills = drillsFor(GAMES.nlh)
    expect(drills).not.toContain('potlimit')
    expect(drills).toHaveLength(5)
  })

  // 로우 유무는 이제 칸을 지우지 않는다. 승자 판독이 무엇을 묻는지를 가른다 (설계 §2)
  it('승자 판독은 로우가 없는 종목에도 있다', () => {
    expect(GAMES.nlh.eval.lo).toBeNull()
    expect(drillsFor(GAMES.nlh)).toContain('winner')
    expect(drillsFor(GAMES.plo8)).toContain('winner')
  })

  it('팟리밋은 betting 코드값으로만 갈린다', () => {
    expect(GAMES.plo8.betting).toBe('PL')
    expect(GAMES.nlh.betting).toBe('NL')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run src/lib/games/drills.test.ts
```

Expected: FAIL — `drillsFor` 가 아직 `boardreading`·`lowreading` 을 돌려준다

- [ ] **Step 3: `DrillId` 를 여섯으로 줄인다**

`app/src/lib/games/drills.ts` 를 통째로 이렇게 만든다.

```ts
/**
 * 격자의 칸이 존재하는지를 정하는 곳.
 *
 * PRD §6 의 격자표에서 `—`(이 종목에 해당 없음)를 만드는 것이 이 파일이다.
 * **표를 사람이 관리하면 반드시 어긋난다** — 스펙을 읽어 여기서 낸다.
 *
 * **2026-09-06: 드릴이 일곱에서 여섯이 됐다.** `보드보기` 와 `로우 판독` 이 `승자 판독`
 * 하나로 합쳐졌다. 쇼다운에서 딜러가 하는 일은 임자를 가리는 것 하나이기 때문이다.
 * `eval.lo` 조건은 사라진 것이 아니라 **한 단계 내려갔다** — 이제 칸의 유무가 아니라
 * 문제의 모양을 가른다 (`lib/drills/winner/types.ts` 의 `asksFor`).
 */
import type { GameSpec } from './types'

export type DrillId =
  | 'procedure'
  | 'winner'
  | 'potlimit'
  | 'potaward'
  | 'incident'
  | 'action'

export const DRILL_LABEL: Record<DrillId, string> = {
  procedure: '진행절차',
  winner: '승자 판독',
  potlimit: '팟리밋 계산',
  potaward: '팟 분배',
  incident: '사고 처리',
  action: '액션 판정',
}

/** 이 종목에 있는 드릴. 순서는 `DRILL_LABEL` 의 선언 순서를 따른다. */
export function drillsFor(spec: GameSpec): DrillId[] {
  const all: DrillId[] = ['procedure', 'winner', 'potlimit', 'potaward', 'incident', 'action']
  // 승자 판독은 모든 종목에 있다 — 임자를 가리지 않는 포커는 없다
  return all.filter((id) => (id === 'potlimit' ? spec.betting === 'PL' : true))
}
```

- [ ] **Step 4: 라우트를 고친다**

`app/src/lib/games/routes.ts` 의 `ROUTES` 상수와 그 위 주석을 이렇게 바꾼다.

```ts
/**
 * 격자의 칸 하나가 어디로 가는가. **`null` 이면 아직 없다**(화면에 「준비 중」).
 *
 * 노리밋 홀덤의 칸 셋이 기존 라우트를 가리킨다 — 축 1·2 를 옮기지 않기로 했다.
 * 팟 판독 러시 하나가 승자 판독과 팟 분배 두 칸을 함께 다루므로 둘이 같은 곳을
 * 가리킨다. **그것이 지금의 사실이고, 격자는 사실을 감추지 않는다.**
 */
const ROUTES: Record<GameId, Partial<Record<DrillId, string>>> = {
  nlh: {
    winner: '/rush',
    potaward: '/rush',
    action: '/action-rush',
  },
  plo8: {
    procedure: '/games/plo8/procedure',
    winner: '/games/plo8/winner',
  },
}
```

- [ ] **Step 5: 새 페이지를 만든다**

`app/src/app/games/[gameId]/winner/page.tsx`:

```tsx
/**
 * 승자 판독 — 10문제 한 판.
 *
 * **정답 판정은 여기 있어야 한다.** 문제의 답이 어떤 모양인지 아는 것은 이 드릴뿐이고,
 * 공용 뼈대(`RushScreen`)가 그것을 알기 시작하면 드릴이 늘 때마다 뼈대가 부푼다.
 *
 * 생성기와 기록은 `winnerRun`·`winnerRecord` 가 `gameId` 당 하나씩 캐시해 준다 —
 * 여기서 클로저를 만들면 렌더마다 새 판이 나온다.
 */
'use client'

import { notFound } from 'next/navigation'
import { use } from 'react'
import { WinnerQuestionPanel } from '@/components/drills/winner/WinnerQuestionPanel'
import { RushScreen } from '@/components/rush/RushScreen'
import { winnerRecord, winnerRun } from '@/lib/drills/winner/registry'
import {
  WINNER_KIND_LABEL,
  WINNER_QUESTION_COUNT,
  type WinnerKind,
  type WinnerQuestion,
} from '@/lib/drills/winner/types'
import { drillHref, GAMES, isGameId } from '@/lib/games'

/** 이 드릴에는 칩이 나오지 않는다. **모듈 최상위 함수여야 한다** */
function hasChips(): boolean {
  return false
}

/** 순서를 무시하고 같은 좌석 묶음인가. 채점의 정본이다 */
function sameSeats(picked: number[], answer: number[]): boolean {
  return picked.length === answer.length && answer.every((s) => picked.includes(s))
}

export default function WinnerPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params)
  // 준비되지 않은 종목의 URL 을 직접 치면 404 다. 화면에서 잠긴 칸과 같은 사실이어야 한다
  if (!isGameId(gameId) || drillHref(gameId, 'winner') === null) notFound()

  return (
    <RushScreen<WinnerKind, WinnerQuestion>
      path={`/games/${gameId}/winner`}
      title="승자 판독"
      eyebrow={`${GAMES[gameId].labels.ko} · 승자 판독`}
      footer={`${WINNER_QUESTION_COUNT}문제 · 보드와 홀카드는 매번 새로 만들어진다`}
      labels={WINNER_KIND_LABEL}
      record={winnerRecord(gameId)}
      generate={winnerRun(gameId)}
      hasChips={hasChips}
      renderQuestion={({ question, index, total, verdict, answer, next }) => (
        <WinnerQuestionPanel
          // 문제마다 새로 그린다 — 이전 문제의 선택이 남으면 답이 미리 찍힌 채로 열린다
          key={index}
          question={question}
          index={index}
          total={total}
          verdict={verdict}
          onSubmit={(hi, lo) => {
            // 하이와 로우가 둘 다 맞아야 정답이다. 러시 채점이 이진이라 부분점수가 없다
            answer(sameSeats(hi, question.answerHi) && sameSeats(lo, question.answerLo))
          }}
          onNext={next}
        />
      )}
    />
  )
}
```

- [ ] **Step 6: 옛 드릴을 지운다**

```bash
git rm -r "src/app/games/[gameId]/low-reading" src/lib/drills/lowreading src/components/drills/lowreading
```

**리다이렉트를 남기지 마라.** `/games/plo8/low-reading` 은 아직 아무도 링크하지 않았고, 리다이렉트를 두면 죽은 경로가 영구히 남는다.

- [ ] **Step 7: 남은 참조가 없는지 확인한다**

```bash
grep -rn "lowreading\|low-reading\|boardreading" src e2e
```

Expected: `e2e/grid-plo8.spec.ts` 두 줄만 남는다(Task 4 가 고친다). `src/` 에는 하나도 없어야 한다.

- [ ] **Step 8: 전부 돌린다**

```bash
npx vitest run
npx tsc --noEmit
npm run build
```

Expected: 실패 0 · 타입 오류 0 · 빌드 성공. 테스트 개수는 `Task 1 Step 1 의 값 + 10 - 6` 이다 — **실제로 그 산수가 맞는지 확인해라.** 안 맞으면 어디가 조용히 사라졌는지 찾아라.

- [ ] **Step 9: PRD §6 을 개정한다**

`PRD.md` 에서 **두 표만** 고친다. 다른 절은 건드리지 마라.

첫째, §6 의 격자표에서 `보드보기` 와 `로우 판독` 두 열을 지우고 `승자 판독` 한 열을 진행절차 뒤에 넣는다.

```markdown
| | 진행절차 | 승자 판독 | 팟리밋 | 팟 분배 | 사고 처리 | 액션 판정 |
|---|---|---|---|---|---|---|
| 노리밋 홀덤 | ⬜ | ✅ | — | ✅ | ⬜ | ✅ |
| PLO | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **PLO8** | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| 7카드 스터드 | ⬜ | ⬜ | — | ⬜ | ⬜ | ⬜ |
| 스터드 하이로우 8 | ⬜ | ⬜ | — | ⬜ | ⬜ | ⬜ |
| 라즈 | ⬜ | ⬜ | — | ⬜ | ⬜ | ⬜ |
| 2-7 트리플드로 | ⬜ | ⬜ | — | ⬜ | ⬜ | ⬜ |
| 바두기 | ⬜ | ⬜ | — | ⬜ | ⬜ | ⬜ |
```

그 표 아래 문단에서 `노리밋 홀덤의 ✅ 셋은 구 축 1·2 다. 팟 판독 러시가 보드보기(승자)와 팟 분배를,` 를 `노리밋 홀덤의 ✅ 셋은 구 축 1·2 다. 팟 판독 러시가 승자 판독과 팟 분배를,` 로 고친다.

이어지는 `**`—` 가 격자의 핵심이다.**` 문단에서 `노리밋 홀덤에는 팟리밋 계산이 없고 하이 게임에는 로우 판독이 없다.` 를 이렇게 바꾼다.

```markdown
**`—` 가 격자의 핵심이다.** 노리밋 홀덤에는 팟리밋 계산이 없다. 어느 칸이 존재하는지는
**`GameSpec`(§6-3)이 정한다.** 사람이 표를 손으로 관리하면 반드시 어긋난다.

로우가 있고 없고는 **칸을 지우지 않는다** — 승자 판독은 모든 종목에 있고, 대신 그 종목에
로우가 있으면 하이와 로우를 함께 묻고 없으면 하이만 묻는다(2026-09-06 개정).
```

둘째, §6-1 의 드릴 표에서 `보드보기` 와 `로우 판독` 두 행을 지우고 그 자리에 한 행을 넣는다.

```markdown
| **승자 판독** | 이 판의 하이 임자와 로우 임자는 누구인가 | 퀴즈 | 하이 평가기 · 로우볼 평가기 |
```

그 표 아래 `**상호작용은 두 형태뿐이다.**` 문단의 `나머지 여섯은 문제를 던진다.` 를 `나머지 다섯은 문제를 던진다.` 로 고친다. §6-1 제목의 `드릴 7종` 은 `드릴 6종` 이다.

- [ ] **Step 10: 커밋한다**

```bash
git add -A
git commit -m "refactor: 격자를 여섯 드릴로 — 보드보기와 로우 판독을 승자 판독으로 합친다"
```

---

### Task 4: 브라우저 검증

**Files:**
- Modify: `app/e2e/grid-plo8.spec.ts`

**Interfaces:**
- Consumes: Task 3 의 라우트 `/games/plo8/winner` 와 「승자 판독」 라벨
- Produces: 없음 (검증 태스크다)

**Playwright 설정은 이미 서 있다.** `app/playwright.config.ts` 에 `desktop` 과 `mobile`(360×780) 두 프로젝트가 있고 `webServer` 가 `npm run dev` 를 띄운다. **MCP 는 이 머신에서 연결 실패하니 쓰지 마라** — `npx playwright test` 로 돌린다.

- [ ] **Step 1: e2e 를 고친다**

`app/e2e/grid-plo8.spec.ts` 에서 첫 테스트의 이 줄을

```ts
  await expect(page.getByText('로우 판독')).toBeVisible()
```

이렇게 바꾼다.

```ts
  await expect(page.getByText('승자 판독')).toBeVisible()
```

그리고 파일 맨 아래 `로우 판독 첫 문제가 열린다` 테스트를 통째로 아래 둘로 바꾼다.

```ts
test('승자 판독 첫 문제가 열리고 하이·로우를 둘 다 고른다', async ({ page }) => {
  await page.goto('/games/plo8/winner')
  await expect(page.getByText(/1 \/ 10/)).toBeVisible()

  // 두 줄이 다 있어야 PLO8 이다 — 하이만 물으면 스펙이 잘못 읽힌 것이다
  await expect(page.getByText('하이 승자')).toBeVisible()
  await expect(page.getByText('로우 승자')).toBeVisible()

  // 하이만 고른 상태에서는 확인이 열리지 않는다
  await page.getByRole('button', { name: '1번' }).first().click()
  await expect(page.getByRole('button', { name: '확인' })).toBeDisabled()

  await page.getByRole('button', { name: '로우 없음' }).click()
  await expect(page.getByRole('button', { name: '확인' })).toBeEnabled()

  await page.getByRole('button', { name: '확인' }).click()
  await expect(page.getByRole('button', { name: '다음 문제' })).toBeVisible()
})

test('승자 판독이 좌석 버튼 두 줄에서 가로로 넘치지 않는다', async ({ page }) => {
  await page.goto('/games/plo8/winner')
  await expect(page.getByText(/1 \/ 10/)).toBeVisible()

  // 페이지가 가로로 스크롤되면 무언가 밖으로 나갔다는 뜻이다
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)

  await page.screenshot({ path: `e2e/shots/plo8-winner-${test.info().project.name}.png` })
})
```

- [ ] **Step 2: 돌린다**

```bash
npx playwright test
```

Expected: 전부 통과. 실패하면 **화면을 고쳐라** — 테스트를 느슨하게 만들지 마라.

- [ ] **Step 3: 스크린샷을 실제로 열어 본다**

```bash
ls e2e/shots/
```

`plo8-winner-mobile.png` 와 `plo8-winner-desktop.png` 를 **Read 도구로 실제로 열어서 눈으로 봐라.** 통과했다는 것과 보기 좋다는 것은 다르다. 볼 것:

- 좌석 버튼 네 개가 360px 에서 한 줄에 들어가는가, 글씨가 잘리지 않는가
- 「로우 없음」 버튼이 로우 줄의 일부로 읽히는가, 아니면 떠 있는가
- 하이 줄과 로우 줄이 서로 구분되는가 — 둘이 똑같이 생겨서 헷갈리지 않는가
- 홀카드 4장 × 4좌석이 세로로 너무 길어 버튼이 접히지 않는가

- [ ] **Step 4: 손으로 한 판 끝까지 해 본다**

```bash
npm run dev
```

브라우저에서 `http://localhost:3000/games/plo8/winner` 를 열고 **10문제를 끝까지 푼다.** 정적 검사로 안 잡히는 것을 여기서 잡는다 — 지난 단계에 하이드레이션 불일치와 흰 배경 위 흰 글씨가 코드 리뷰 13번을 다 통과하고 브라우저에서 잡혔다.

확인할 것:
- **새로고침할 때마다 콘솔에 hydration 경고가 뜨지 않는가**
- 「로우 없음」을 고른 뒤 좌석을 누르면 「로우 없음」이 풀리는가
- 채점 뒤 결과 패널이 하이·로우를 갈라서 보여주는가
- **10문제 중 「로우 없음」이 정답인 문제가 최소 둘 나오는가** (Task 1 이 보장하지만 눈으로 확인한다)

- [ ] **Step 5: 커밋한다**

```bash
git add e2e/
git commit -m "test: 승자 판독 브라우저 검증 — 하이·로우 두 줄과 360px 넘침"
```

---

## 끝나면

1. **전체 검증을 한 번 더 돌린다** — `npx vitest run` · `npx tsc --noEmit` · `npm run build` · `npx playwright test`
2. **재미 게이트(PRD §3)를 사용자에게 넘긴다.** 여기서부터는 코드가 답하지 않는다. 승자 판독 10문제를 사람이 직접 끝까지 하고 세 문항에 답해야 한다.
   - 다시 하기가 눌리나?
   - 지루한 유형이 있나?
   - **제한시간 40초가 맞나?** — `WINNER_LIMIT_SEC` 은 근거 없는 초안이다 (설계 §9)
   - 덤: **로우 성립/불성립 3:2 배분이 맞나?** 「로우 없음」이 너무 자주 나오면 싱겁고, 너무 드물면 아무도 그 버튼을 안 누른다
3. **다음 종목을 붙이기 전에 남은 것** — 라즈(`eval.hi === null`)와 홀덤(`mustUse === null`) 갈래는 `generateWinnerRun` 이 지금 던진다. 그 종목이 붙을 때 만든다. **던지게 해 둔 것이 설계다** — 조용히 잘못된 문제를 내는 것보다 낫다
