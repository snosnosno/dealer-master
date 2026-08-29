# 딜러 시뮬레이터 — 테이블뷰와 재생 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1단계 엔진이 만든 핸드를 오벌 테이블에 애니메이션으로 재생하고, 판단 지점에서 멈춰 문제를 내고, 채점해 리뷰까지 보여주는 가이드 모드 UI를 만든다. 이 단계가 끝나면 사람이 실제로 플레이할 수 있다.

**Architecture:** 재생 전체를 React에 의존하지 않는 순수 TS 상태기계(`player.ts`) 하나로 만들고, 컴포넌트는 props만 받는 뷰로 둔다. 화면 상태는 `stateAt(init, events, cursor)` 로 매번 접어서 만들며 따로 들고 있지 않으므로, 재생·되감기·속도가 전부 커서 이동이다. 좌표·칩 분해·로그 문구도 순수 함수로 빼서 기존 `environment: 'node'` vitest 로 그대로 검증한다 — jsdom·@testing-library 를 도입하지 않는다.

**Tech Stack:** TypeScript 5, React 19, Next 16 (App Router), Tailwind v4, Vitest 4 (node 환경). **새 런타임 의존성 0개** — 애니메이션 라이브러리도 테스트 라이브러리도 추가하지 않는다.

**Spec:** `docs/superpowers/specs/2026-08-29-simulator-table-view-design.md`
**상위 스펙:** `docs/superpowers/specs/2026-08-25-dealer-simulator-design.md`
**1단계 백로그:** `docs/superpowers/plans/2026-08-25-simulator-engine-core-BACKLOG.md` (C절이 이 계획의 제약)

---

## Global Constraints

- 작업 디렉토리는 `C:\Users\user\Desktop\dealer master\app` — 모든 경로는 이 폴더 기준. npm 명령은 전부 여기서 돈다
- **엔진(`src/lib/simulator/`)을 수정하지도, 거기에 파일을 추가하지도 않는다.** 공개 표면은 `index.ts` 하나뿐이고, import 는 항상 `@/lib/simulator` 에서 한다. 개별 모듈(`./decisions` 등)을 직접 찌르지 않는다
- **하네스(`src/app/simulator-harness/`)를 수정하지도 삭제하지도 않는다.** 엔진 회귀 확인에 계속 쓴다. 그 `format.ts` 의 `describeEvent` 는 좌석을 `#4` 처럼 0-based로 찍으므로 **학습자 화면에 재사용 금지** — 제품용 포매터를 Task 3에서 따로 만든다
- **`vitest.config.mts` 를 수정하지 않는다.** `include: ['src/**/*.test.ts']` 가 새 테스트를 그대로 잡는다
- **`package.json` 에 의존성을 추가하지 않는다.** 애니메이션 라이브러리 금지(스펙 §4-7), jsdom·@testing-library 금지
- `Math.random()` 사용 금지. 무작위가 필요하면 `createRng(seed)` 를 쓴다
- 파일 하나가 **400줄**을 넘기지 않는다
- 금액은 전부 정수. 칩 단위 표준: **100 / 500 / 1,000 / 5,000 / 25,000 / 100,000**
- **좌석 인덱스는 끝까지 0-based, 화면에 찍는 번호는 항상 `+1`.** 변환은 `displaySeat()` 한 곳에서만 한다
- **컨트롤로 노출 금지**: `difficulty`(무효과) · `rulesetId`(값 하나뿐) · 좌석 수(6 고정) · `require`(시드가 정한다)
- **등급을 표시하지 않는다.** `gradeFrom` 을 호출하지 않는다 — 최근 20핸드 저장이 3단계 범위다
- 커밋 메시지는 `<type>: <설명>` 형식, 한국어
- 브랜치는 `feat/simulator-table-view` (이미 생성돼 있고 설계 문서가 커밋돼 있다)

---

## 엔진이 하지 않는 약속 (실측 확인됨 — 버그로 오판하지 말 것)

1. `require: ['action_validity']` 는 **최선 노력**이다. 약 32.7% 핸드에서 이 축이 안 나온다. **재시도 루프 금지**
2. 사이드팟은 `require: ['calculation']` 없이는 사실상 안 나온다 (300시드 중 0건 → 걸면 300/300)
3. **판단 지점 개수는 핸드마다 다르고 0개도 가능하다**
4. **좌석 번호가 두 벌이다** — API 0-based, 학습자 문구 1-based
5. `Answer.values` 는 `(number | null)[]` 다. **빈 칸은 `null`**. 0으로 메꾸거나 배열을 당기면 조용히 틀린 점수가 나온다
6. `scoreDecision` 은 `answer.values.length > fields.length` 면 **throw** 한다. 칸을 초과 생성하지 말 것

---

## 파일 구조

| 파일 | 책임 | Task |
|---|---|---|
| `src/components/simulator/player.ts` | 재생 상태기계. React import 없음 | 1 |
| `src/components/table/geometry.ts` | 타원 좌석 좌표 | 2 |
| `src/components/table/chips.ts` | 금액 → 표준 칩 단위 분해 | 2 |
| `src/components/table/log.ts` | 이벤트 → 학습자용 한국어 한 줄, `displaySeat` | 3 |
| `src/components/table/Card.tsx` | 카드 한 장 (앞/뒷면, `rotateY`) | 4 |
| `src/components/table/ChipStack.tsx` | 칩 원반 더미 | 4 |
| `src/components/table/Seat.tsx` | 좌석 하나 (이름·스택·홀카드·벳·태그) | 4 |
| `src/components/table/PokerTable.tsx` | 오벌 펠트 + 좌석 배치 + 보드 + 팟 | 4 |
| `src/components/table/ActionLog.tsx` | 텍스트 액션 로그 | 5 |
| `src/components/simulator/DecisionPrompt.tsx` | 3종 입력 + 카운트다운 + 피드백 | 6 |
| `src/components/simulator/HandReview.tsx` | 축별 점수 + 문항별 리뷰 | 7 |
| `src/components/simulator/hand.ts` | 시드 → `{hand, decisions}` (require 유도 포함) | 8 |
| `src/components/simulator/HandPlayer.tsx` | `useReducer` + 틱 루프 + 뷰 조립 | 8 |
| `src/app/simulator/page.tsx` | `?seed=` 처리 후 `HandPlayer` 마운트 | 9 |
| `src/app/page.tsx` | 축 3종 선택 (수정) | 9 |
| `src/app/globals.css` | `--tempo` 전이 + reduced-motion (수정) | 4 |

`player.ts` 는 상위 스펙 §8에 없는 파일이다. `src/components/simulator/` 에 둔 이유는 기능 단위 묶음이 §8의 정신이고, `vitest.config.mts` 가 설정 변경 없이 그대로 잡기 때문이다.

---

## Task 1: 재생 상태기계

이 계획의 심장이다. 나머지 태스크는 전부 이것을 그리는 일이다.

**Files:**
- Create: `src/components/simulator/player.ts`
- Test: `src/components/simulator/player.test.ts`

**Interfaces:**
- Consumes: `@/lib/simulator` 의 `scoreDecision`, `generateHand`, `extractDecisions`, 타입 `Answer`·`DecisionPoint`·`DecisionResult`·`HandEvent`
- Produces: `initPlayer(events, decisions) → {config, state}` · `reduce(config, state, command) → PlayerState` · `stopAt(config, state) → number` · 타입 `PlayerState`·`PlayerCommand`·`PlayerConfig`·`Phase`·`Speed` · 상수 `EVENT_MS`

- [ ] **Step 1: 실패하는 테스트를 쓴다 — 봉인 경계**

`src/components/simulator/player.test.ts` 를 만든다. 이것이 §1에서 발견한 결함의 회귀 테스트다.

```ts
import { describe, expect, test } from 'vitest'
import { extractDecisions, generateHand } from '@/lib/simulator'
import { initPlayer, reduce, stopAt, type PlayerCommand, type PlayerState } from './player'

/** 정답이든 오답이든 상관없이 현재 문항에 답하고 피드백을 넘긴다. */
function answerAndContinue(
  cfg: ReturnType<typeof initPlayer>['config'],
  s: PlayerState,
): PlayerState {
  const dp = s.pending[0]
  const answer =
    dp.input.type === 'choice'
      ? ({ type: 'choice', index: dp.input.correctIndex } as const)
      : dp.input.type === 'seat'
        ? ({ type: 'seat', seats: dp.input.correctSeats } as const)
        : ({ type: 'number', values: dp.input.fields.map((f) => f.answer) } as const)
  const answered = reduce(cfg, s, { type: 'answer', answer })
  return reduce(cfg, answered, { type: 'continue' })
}

/** 한 번에 충분히 큰 시간을 흘려보낸다 — 정지점까지 전진한다. */
const run = (cfg: ReturnType<typeof initPlayer>['config'], s: PlayerState): PlayerState =>
  reduce(cfg, s, { type: 'tick', ms: 1_000_000 })

describe('봉인 경계 — award_pot 이 정답을 미리 흘리지 않는다', () => {
  const hand = generateHand({ seed: '7', seatCount: 6, require: ['calculation'] })
  const decisions = extractDecisions(hand)

  test('seed 7 은 award_pot 앞에 계산·쇼다운 문항을 모두 낸다', () => {
    const firstAward = hand.events.findIndex((e) => e.type === 'award_pot')
    expect(firstAward).toBeGreaterThan(0)

    const { config, state } = initPlayer(hand.events, decisions)
    expect(config.sealIndex).toBe(firstAward)

    // 1문항: 딜링 절차
    let s = run(config, state)
    expect(s.phase).toBe('awaiting')
    expect(s.pending[0].kind).toBe('procedure')
    s = answerAndContinue(config, s)

    // 2문항: 사이드팟 계산 — 커서가 봉인 경계에서 멈춘다
    s = run(config, s)
    expect(s.phase).toBe('awaiting')
    expect(s.pending[0].kind).toBe('calculation')
    expect(s.cursor).toBe(firstAward)
    s = answerAndContinue(config, s)

    // 3문항: 승자 판정 — 커서는 여전히 경계. award_pot 은 아직 재생되지 않았다
    s = run(config, s)
    expect(s.phase).toBe('awaiting')
    expect(s.pending[0].kind).toBe('showdown')
    expect(s.cursor).toBe(firstAward)
    s = answerAndContinue(config, s)

    // 남은 award_pot 이 재생되고 리뷰로 간다
    s = run(config, s)
    expect(s.cursor).toBe(hand.events.length)
    expect(s.phase).toBe('review')
    expect(s.results).toHaveLength(3)
  })

  test('어떤 시점에도 커서가 미답 문항을 넘어 award_pot 을 재생하지 않는다', () => {
    const { config, state } = initPlayer(hand.events, decisions)
    let s = state
    for (let guard = 0; guard < 20 && s.phase !== 'review'; guard++) {
      s = run(config, s)
      if (s.phase === 'awaiting') {
        expect(s.cursor).toBeLessThanOrEqual(config.sealIndex)
        s = answerAndContinue(config, s)
      }
    }
    expect(s.phase).toBe('review')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

```
cd app && npx vitest run src/components/simulator/player.test.ts
```

기대: `Failed to resolve import "./player"` — 파일이 없다.

- [ ] **Step 3: `player.ts` 를 구현한다**

`src/components/simulator/player.ts` 를 만든다.

```ts
/**
 * 재생 상태기계.
 *
 * React 를 import 하지 않는 순수 TS 다. 화면 상태를 들고 있지 않고 커서(적용된
 * 이벤트 개수) 하나만 들고 있으므로, 재생·되감기·속도 조절이 전부 커서 이동이다.
 * 그릴 때는 호출부가 `stateAt(init, events, cursor)` 로 접는다.
 *
 * `Date.now()` 를 부르지 않는다 — 시간이 `tick` 액션으로 들어온다. 그래서 이 파일이
 * 순수하게 남고 테스트가 시계 조작 없이 돈다. 실제 시계는 HandPlayer.tsx 의
 * requestAnimationFrame 하나뿐이다.
 */
import { scoreDecision } from '@/lib/simulator'
import type { Answer, DecisionPoint, DecisionResult, HandEvent } from '@/lib/simulator'

export type Phase = 'playing' | 'awaiting' | 'feedback' | 'review'

/** 0 은 "즉시" 다 — 정지점까지 한 번에 점프한다. */
export type Speed = 0.5 | 1 | 2 | 0

export type PlayerConfig = {
  events: HandEvent[]
  /**
   * 첫 `award_pot` 의 인덱스. 재생은 이 지점을 넘지 않는다.
   *
   * 이유: `calculation` 문항의 앵커가 마지막 `collect_bets + 1` = 첫 `award_pot` 자리이고
   * `showdown` 문항의 앵커는 `events.length`(배열 끝 너머)다. 순서대로 재생하면
   * award_pot 애니메이션이 승자를 보여준 뒤에 "누가 이겼나"를 묻게 된다 — 답을
   * 보여주고 문제를 내는 것이다. 엔진의 앵커는 정의상 옳으므로 여기서 막는다.
   */
  sealIndex: number
}

export type PlayerState = {
  /** 적용된 이벤트 개수. 화면 = stateAt(init, events, cursor) */
  cursor: number
  phase: Phase
  speed: Speed
  /** 아직 묻지 않은 문항. atEventIndex 오름차순. 답한 문항은 `continue` 에서 빠진다 */
  pending: DecisionPoint[]
  answers: Answer[]
  results: DecisionResult[]
  /** awaiting 일 때 남은 제한시간(ms) */
  remainingMs: number
  /** playing 일 때 현재 이벤트(events[cursor])에 누적된 시간(ms) */
  elapsedMs: number
}

export type PlayerCommand =
  | { type: 'tick'; ms: number }
  | { type: 'answer'; answer: Answer }
  | { type: 'continue' }
  | { type: 'setSpeed'; speed: Speed }

/**
 * 이벤트 종류별 1x 기준 지속시간(ms).
 *
 * 종류별 차등이 필수다 — 홀카드 12장을 700ms씩 돌리면 프리플랍 딜링만 8.4초다.
 * 이 값은 재생 "박자"이고, CSS 전이 길이(--tempo)와는 별개다.
 */
export const EVENT_MS: Record<HandEvent['type'], number> = {
  deal_hole: 120,
  burn: 250,
  post_blind: 350,
  move_button: 400,
  showdown_reveal: 400,
  deal_board: 500,
  collect_bets: 600,
  return_uncalled: 600,
  player_action: 700,
  award_pot: 800,
}

/**
 * 재생이 이번에 도달할 수 있는 최대 커서.
 *
 * 미답 문항이 있으면 그 앵커와 봉인 경계 중 앞선 쪽에서 멈춘다. 없으면 끝까지 간다.
 */
export function stopAt(config: PlayerConfig, state: PlayerState): number {
  if (state.pending.length === 0) return config.events.length
  return Math.min(state.pending[0].atEventIndex, config.sealIndex)
}

/**
 * playing 상태가 정지점에 도달했는지 보고 다음 phase 를 정한다.
 * 미답 문항이 있으면 awaiting(카운트다운 시작), 없으면 review.
 */
function settle(config: PlayerConfig, state: PlayerState): PlayerState {
  if (state.phase !== 'playing') return state
  if (state.cursor < stopAt(config, state)) return state
  if (state.pending.length > 0) {
    return {
      ...state,
      phase: 'awaiting',
      remainingMs: state.pending[0].timeLimitSec * 1000,
      elapsedMs: 0,
    }
  }
  return { ...state, phase: 'review', elapsedMs: 0 }
}

export function initPlayer(
  events: HandEvent[],
  decisions: DecisionPoint[],
): { config: PlayerConfig; state: PlayerState } {
  const firstAward = events.findIndex((e) => e.type === 'award_pot')
  const config: PlayerConfig = {
    events,
    sealIndex: firstAward === -1 ? events.length : firstAward,
  }
  const state: PlayerState = {
    cursor: 0,
    phase: 'playing',
    speed: 1,
    pending: [...decisions].sort((a, b) => a.atEventIndex - b.atEventIndex),
    answers: [],
    results: [],
    remainingMs: 0,
    elapsedMs: 0,
  }
  // 첫 문항의 앵커가 0 이거나 이벤트가 없는 핸드를 여기서 흡수한다.
  return { config, state: settle(config, state) }
}

function tick(config: PlayerConfig, state: PlayerState, ms: number): PlayerState {
  if (state.phase === 'awaiting') {
    const remainingMs = state.remainingMs - ms
    if (remainingMs > 0) return { ...state, remainingMs }
    // 시간 초과. timeout 답을 자동 제출한다 — scoreDecision 이 0점으로 채점한다.
    return reduce(config, { ...state, remainingMs: 0 }, {
      type: 'answer',
      answer: { type: 'timeout' },
    })
  }
  if (state.phase !== 'playing') return state

  const limit = stopAt(config, state)

  // 즉시: 박자를 무시하고 정지점까지 한 번에 간다.
  if (state.speed === 0) {
    return settle(config, { ...state, cursor: limit, elapsedMs: 0 })
  }

  let cursor = state.cursor
  let elapsed = state.elapsedMs + ms
  while (cursor < limit) {
    const need = EVENT_MS[config.events[cursor].type] / state.speed
    if (elapsed < need) break
    elapsed -= need
    cursor += 1
  }
  return settle(config, {
    ...state,
    cursor,
    elapsedMs: cursor < limit ? elapsed : 0,
  })
}

export function reduce(
  config: PlayerConfig,
  state: PlayerState,
  command: PlayerCommand,
): PlayerState {
  switch (command.type) {
    case 'setSpeed':
      return { ...state, speed: command.speed }

    case 'answer': {
      if (state.phase !== 'awaiting') return state
      const dp = state.pending[0]
      // pending 에서 빼지 않는다 — feedback 화면이 pending[0] 을 읽어 설명·조항을
      // 그린다. 빼는 것은 'continue' 의 일이다.
      return {
        ...state,
        phase: 'feedback',
        answers: [...state.answers, command.answer],
        results: [...state.results, scoreDecision(dp, command.answer)],
        remainingMs: 0,
      }
    }

    case 'continue': {
      if (state.phase !== 'feedback') return state
      return settle(config, {
        ...state,
        phase: 'playing',
        pending: state.pending.slice(1),
        elapsedMs: 0,
      })
    }

    case 'tick':
      return tick(config, state, command.ms)
  }
}
```

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

```
cd app && npx vitest run src/components/simulator/player.test.ts
```

기대: 2 passed.

- [ ] **Step 5: 나머지 동작의 테스트를 추가한다**

`player.test.ts` 끝에 붙인다.

```ts
describe('타이머', () => {
  const hand = generateHand({ seed: '7', seatCount: 6, require: ['calculation'] })
  const decisions = extractDecisions(hand)

  test('제한시간이 다 가면 timeout 이 자동 제출되어 0점이 된다', () => {
    const { config, state } = initPlayer(hand.events, decisions)
    let s = reduce(config, state, { type: 'tick', ms: 1_000_000 })
    expect(s.phase).toBe('awaiting')

    const limitMs = s.pending[0].timeLimitSec * 1000
    s = reduce(config, s, { type: 'tick', ms: limitMs })

    expect(s.phase).toBe('feedback')
    expect(s.answers.at(-1)).toEqual({ type: 'timeout' })
    expect(s.results.at(-1)?.score).toBe(0)
    expect(s.results.at(-1)?.correct).toBe(false)
  })

  test('제한시간 안에서는 카운트다운만 줄어든다', () => {
    const { config, state } = initPlayer(hand.events, decisions)
    let s = reduce(config, state, { type: 'tick', ms: 1_000_000 })
    const before = s.remainingMs
    s = reduce(config, s, { type: 'tick', ms: 1000 })
    expect(s.phase).toBe('awaiting')
    expect(s.remainingMs).toBe(before - 1000)
  })
})

describe('속도', () => {
  const hand = generateHand({ seed: '1', seatCount: 6 })
  const decisions = extractDecisions(hand)

  test('즉시(0)는 한 번의 틱으로 정지점까지 간다', () => {
    const { config, state } = initPlayer(hand.events, decisions)
    const fast = reduce(config, state, { type: 'setSpeed', speed: 0 })
    const s = reduce(config, fast, { type: 'tick', ms: 1 })
    expect(s.cursor).toBe(stopAt(config, fast))
    expect(s.phase).toBe('awaiting')
  })

  test('2x 는 1x 의 절반 시간에 같은 커서에 도달한다', () => {
    const { config, state } = initPlayer(hand.events, decisions)
    const at1x = reduce(config, state, { type: 'tick', ms: 600 })
    const at2x = reduce(
      config,
      reduce(config, state, { type: 'setSpeed', speed: 2 }),
      { type: 'tick', ms: 300 },
    )
    expect(at2x.cursor).toBe(at1x.cursor)
  })
})

describe('판단 지점이 없는 핸드', () => {
  const hand = generateHand({ seed: '1', seatCount: 6 })

  test('문항이 0개면 끝까지 재생하고 곧장 review 로 간다', () => {
    const { config, state } = initPlayer(hand.events, [])
    expect(state.phase).toBe('playing')
    const s = reduce(config, state, { type: 'tick', ms: 1_000_000 })
    expect(s.cursor).toBe(hand.events.length)
    expect(s.phase).toBe('review')
    expect(s.results).toHaveLength(0)
  })
})

describe('오답 처리', () => {
  const hand = generateHand({ seed: '1', seatCount: 6 })
  const decisions = extractDecisions(hand)

  test('오답을 내도 핸드는 원래 이벤트 열대로 계속된다', () => {
    const { config, state } = initPlayer(hand.events, decisions)
    let s = reduce(config, state, { type: 'tick', ms: 1_000_000 })
    expect(s.phase).toBe('awaiting')
    const dp = s.pending[0]
    expect(dp.input.type).toBe('choice')

    // 정답이 아닌 인덱스를 고른다
    const wrong = dp.input.type === 'choice' ? (dp.input.correctIndex + 1) % dp.input.choices.length : 0
    s = reduce(config, s, { type: 'answer', answer: { type: 'choice', index: wrong } })
    expect(s.results.at(-1)?.correct).toBe(false)

    s = reduce(config, s, { type: 'continue' })
    expect(s.phase).toBe('playing')

    // 남은 문항을 전부 timeout 으로 흘려도 끝까지 재생된다
    for (let guard = 0; guard < 20 && s.phase !== 'review'; guard++) {
      s = reduce(config, s, { type: 'tick', ms: 1_000_000 })
      if (s.phase === 'awaiting') {
        s = reduce(config, s, { type: 'tick', ms: s.remainingMs })
        s = reduce(config, s, { type: 'continue' })
      }
    }
    expect(s.cursor).toBe(hand.events.length)
    expect(s.phase).toBe('review')
  })
})

describe('phase 가 맞지 않는 명령은 무시된다', () => {
  const hand = generateHand({ seed: '1', seatCount: 6 })
  const decisions = extractDecisions(hand)

  test('playing 중 answer 는 상태를 바꾸지 않는다', () => {
    const { config, state } = initPlayer(hand.events, decisions)
    const s = reduce(config, state, { type: 'answer', answer: { type: 'choice', index: 0 } })
    expect(s).toBe(state)
  })

  test('playing 중 continue 는 상태를 바꾸지 않는다', () => {
    const { config, state } = initPlayer(hand.events, decisions)
    const s = reduce(config, state, { type: 'continue' })
    expect(s).toBe(state)
  })
})
```

- [ ] **Step 6: 전체 테스트를 돌린다**

```
cd app && npx vitest run src/components/simulator/player.test.ts && npm run typecheck && npm run lint
```

기대: 모두 통과. 실패하면 구현을 고친다 — 테스트를 느슨하게 하지 않는다.

- [ ] **Step 7: 커밋**

```bash
git add app/src/components/simulator/player.ts app/src/components/simulator/player.test.ts
git commit -m "feat: 재생 상태기계와 award_pot 봉인 경계

showdown 문항의 앵커가 events.length 이고 calculation 문항이 첫 award_pot
자리라, 순서대로 재생하면 승자를 보여준 뒤에 승자를 묻게 된다.
stopAt 이 봉인 경계를 넘지 않도록 막아 엔진 수정 없이 해소한다."
```

---

## Task 2: 좌석 좌표와 칩 분해

**Files:**
- Create: `src/components/table/geometry.ts`, `src/components/table/chips.ts`
- Test: `src/components/table/geometry.test.ts`, `src/components/table/chips.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 수학)
- Produces: `seatAngleDeg(i, n) → number` · `seatOffset(i, n, rx, ry) → {x, y}` · `DEALER_ANGLE_DEG` · `CHIP_UNITS` · `chipBreakdown(amount) → {chips, remainder}`

- [ ] **Step 1: 좌표 테스트를 쓴다**

`src/components/table/geometry.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { DEALER_ANGLE_DEG, seatAngleDeg, seatOffset } from './geometry'

const norm = (deg: number) => ((deg % 360) + 360) % 360

describe('좌석 각도', () => {
  test('6-max 는 120·180·240·300·0·60 도에 앉는다', () => {
    const got = [0, 1, 2, 3, 4, 5].map((i) => norm(seatAngleDeg(i, 6)))
    expect(got).toEqual([120, 180, 240, 300, 0, 60])
  })

  test('3~9인 어떤 인원수에서도 딜러 자리(하단 중앙 90도)에 좌석이 없다', () => {
    for (let n = 3; n <= 9; n++) {
      for (let i = 0; i < n; i++) {
        expect(norm(seatAngleDeg(i, n))).not.toBeCloseTo(DEALER_ANGLE_DEG, 6)
      }
    }
  })

  test('3~9인 어떤 인원수에서도 좌석이 서로 겹치지 않는다', () => {
    for (let n = 3; n <= 9; n++) {
      const pts = Array.from({ length: n }, (_, i) => seatOffset(i, n, 100, 60))
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          const dx = pts[a].x - pts[b].x
          const dy = pts[a].y - pts[b].y
          expect(Math.hypot(dx, dy)).toBeGreaterThan(1)
        }
      }
    }
  })

  test('좌석 0 은 하단 왼쪽이다 — 딜러의 왼쪽부터 돈다', () => {
    const p = seatOffset(0, 6, 100, 60)
    expect(p.x).toBeLessThan(0)
    expect(p.y).toBeGreaterThan(0)
  })

  test('좌석 인덱스가 늘수록 화면상 반시계로 간다', () => {
    // 좌석 0(하단 왼쪽) → 1(왼쪽) → 2(상단 왼쪽): y 가 단조 감소한다
    const ys = [0, 1, 2].map((i) => seatOffset(i, 6, 100, 60).y)
    expect(ys[0]).toBeGreaterThan(ys[1])
    expect(ys[1]).toBeGreaterThan(ys[2])
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

```
cd app && npx vitest run src/components/table/geometry.test.ts
```

기대: `Failed to resolve import "./geometry"`.

- [ ] **Step 3: `geometry.ts` 를 구현한다**

```ts
/**
 * 오벌 테이블의 좌석 좌표.
 *
 * 화면 좌표계는 y 가 아래로 증가한다. 90도 = 하단 중앙이고 **거기는 딜러(학습자)
 * 자리로 비운다** — 학습자는 플레이어가 아니라 딜러이고, 카드는 그 자리(덱)에서
 * 나간다. `+0.5` 가 그 빈자리를 만든다: n=6 이면 좌석이 120·180·240·300·0·60 도에
 * 앉아 90도가 정확히 두 좌석 사이에 온다.
 *
 * 좌석 인덱스가 늘수록 화면상 반시계다. 위에서 내려다본 테이블에서 각자의 왼쪽이
 * 화면 왼쪽이므로, 딜링 순서(각자의 왼쪽으로)가 그렇게 보이는 것이 맞다.
 */

/** 하단 중앙. 딜러가 앉는 각도이므로 좌석이 오지 않는다. */
export const DEALER_ANGLE_DEG = 90

export function seatAngleDeg(seatIndex: number, seatCount: number): number {
  return DEALER_ANGLE_DEG + (360 / seatCount) * (seatIndex + 0.5)
}

/** 테이블 중심 기준 오프셋(px). 호출부가 중심 좌표를 더한다. */
export function seatOffset(
  seatIndex: number,
  seatCount: number,
  radiusX: number,
  radiusY: number,
): { x: number; y: number } {
  const rad = (seatAngleDeg(seatIndex, seatCount) * Math.PI) / 180
  return { x: radiusX * Math.cos(rad), y: radiusY * Math.sin(rad) }
}
```

- [ ] **Step 4: 좌표 테스트가 통과하는 것을 확인한다**

```
cd app && npx vitest run src/components/table/geometry.test.ts
```

기대: 5 passed.

- [ ] **Step 5: 칩 분해 테스트를 쓴다**

`src/components/table/chips.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  buildPots, extractDecisions, generateHand, initialState, stateAt,
} from '@/lib/simulator'
import { CHIP_UNITS, chipBreakdown } from './chips'

describe('칩 분해', () => {
  test('큰 단위부터 그리디로 쪼갠다', () => {
    expect(chipBreakdown(32300)).toEqual({
      chips: [
        { unit: 25000, count: 1 },
        { unit: 5000, count: 1 },
        { unit: 1000, count: 2 },
        { unit: 100, count: 3 },
      ],
      remainder: 0,
    })
  })

  test('0 은 빈 배열이다', () => {
    expect(chipBreakdown(0)).toEqual({ chips: [], remainder: 0 })
  })

  test('표준 단위만 쓴다', () => {
    for (const amount of [100, 700, 12500, 62000, 188400]) {
      for (const c of chipBreakdown(amount).chips) {
        expect(CHIP_UNITS).toContain(c.unit)
      }
    }
  })

  test('칩 합계와 나머지를 더하면 원금액이다', () => {
    for (const amount of [0, 100, 250, 700, 12500, 32300, 188499]) {
      const { chips, remainder } = chipBreakdown(amount)
      const sum = chips.reduce((a, c) => a + c.unit * c.count, 0)
      expect(sum + remainder).toBe(amount)
    }
  })

  test('엔진이 내는 금액은 나머지가 0 이다 — 전부 100 의 배수다', () => {
    const hand = generateHand({ seed: '7', seatCount: 6, require: ['calculation'] })
    const final = stateAt(
      initialState(hand.seats, hand.buttonSeat),
      hand.events,
      hand.events.length,
    )
    const pots = buildPots(final.contributed, final.seats.map((s) => s.folded))
    const amounts = [
      ...final.seats.map((s) => s.stack),
      ...pots.map((p) => p.amount),
      ...extractDecisions(hand).flatMap((d) =>
        d.input.type === 'number' ? d.input.fields.map((f) => f.answer) : [],
      ),
    ]
    expect(amounts.length).toBeGreaterThan(0)
    for (const a of amounts) expect(chipBreakdown(a).remainder).toBe(0)
  })
})
```

- [ ] **Step 6: 실패를 확인한다**

```
cd app && npx vitest run src/components/table/chips.test.ts
```

기대: `Failed to resolve import "./chips"`.

- [ ] **Step 7: `chips.ts` 를 구현한다**

```ts
/**
 * 금액을 표준 칩 단위로 쪼갠다.
 *
 * 단위는 `12_design_system.md` §5-1 의 표준이다. 엔진이 내는 금액은 전부 100 의
 * 배수라(`ODD_CHIP_UNIT = 100`, 블라인드 100/200, 스택 단위 500의 배수) 실무상
 * `remainder` 는 항상 0 이지만, 삼키지 않고 돌려준다 — 조용히 버리면 화면 합계가
 * 원금액과 달라지고 그 차이를 아무도 못 본다.
 */
export const CHIP_UNITS = [100000, 25000, 5000, 1000, 500, 100] as const

export type ChipUnit = (typeof CHIP_UNITS)[number]

export type ChipPile = { unit: ChipUnit; count: number }

export function chipBreakdown(amount: number): { chips: ChipPile[]; remainder: number } {
  let rest = Math.max(0, Math.floor(amount))
  const chips: ChipPile[] = []
  for (const unit of CHIP_UNITS) {
    const count = Math.floor(rest / unit)
    if (count > 0) {
      chips.push({ unit, count })
      rest -= unit * count
    }
  }
  return { chips, remainder: rest }
}
```

- [ ] **Step 8: 테스트와 게이트를 돌린다**

```
cd app && npx vitest run src/components/table && npm run typecheck && npm run lint
```

기대: 9 passed, typecheck·lint exit 0.

- [ ] **Step 9: 커밋**

```bash
git add app/src/components/table/geometry.ts app/src/components/table/geometry.test.ts \
        app/src/components/table/chips.ts app/src/components/table/chips.test.ts
git commit -m "feat: 타원 좌석 좌표와 칩 단위 분해

좌석 각도에 +0.5 를 넣어 하단 중앙(90도)을 딜러 자리로 비운다.
칩 분해는 나머지를 삼키지 않고 돌려준다."
```

---

## Task 3: 학습자용 이벤트 포매터

하네스의 `describeEvent` 는 좌석을 `#4` 처럼 0-based로 찍는다. 그대로 쓰면 학습자가 오독한다.

**Files:**
- Create: `src/components/table/log.ts`
- Test: `src/components/table/log.test.ts`

**Interfaces:**
- Consumes: `@/lib/simulator` 의 `cardToString`, 타입 `Card`·`HandEvent`·`SeatInit`
- Produces: `displaySeat(i) → number` · `cardText(card) → string` · `describeForLearner(event, seats) → string`

- [ ] **Step 1: 테스트를 쓴다**

`src/components/table/log.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { HandEvent, SeatInit } from '@/lib/simulator'
import { cardText, describeForLearner, displaySeat } from './log'

const seats: SeatInit[] = [
  { name: '김도현', stack: 8000 },
  { name: '박서준', stack: 19000 },
  { name: '이민아', stack: 19000 },
]

describe('좌석 번호 변환', () => {
  test('0-based 인덱스를 1-based 표시 번호로 바꾼다', () => {
    expect(displaySeat(0)).toBe(1)
    expect(displaySeat(4)).toBe(5)
  })
})

describe('카드 문자', () => {
  test('수트를 기호로 바꾸고 랭크는 그대로 둔다', () => {
    expect(cardText({ rank: 'A', suit: 's' })).toBe('A♠')
    expect(cardText({ rank: 'T', suit: 'h' })).toBe('T♥')
  })
})

describe('학습자용 이벤트 문구', () => {
  test('좌석을 이름과 1-based 번호로 쓴다 — 0-based 를 노출하지 않는다', () => {
    const e: HandEvent = { type: 'player_action', seat: 2, action: { kind: 'raise', to: 800 } }
    const line = describeForLearner(e, seats)
    expect(line).toBe('이민아(3번) 레이즈 → 800')
    expect(line).not.toContain('#')
  })

  test('폴드·체크는 금액을 붙이지 않는다', () => {
    expect(describeForLearner({ type: 'player_action', seat: 0, action: { kind: 'fold' } }, seats))
      .toBe('김도현(1번) 폴드')
    expect(describeForLearner({ type: 'player_action', seat: 1, action: { kind: 'check' } }, seats))
      .toBe('박서준(2번) 체크')
  })

  test('블라인드·버튼·반환도 1-based 다', () => {
    expect(describeForLearner({ type: 'move_button', toSeat: 2 }, seats))
      .toBe('버튼을 이민아(3번) 좌석으로 옮긴다')
    expect(describeForLearner({ type: 'post_blind', seat: 0, amount: 100, kind: 'sb' }, seats))
      .toBe('김도현(1번) 스몰블라인드 100')
    expect(describeForLearner({ type: 'return_uncalled', seat: 1, amount: 200 }, seats))
      .toBe('박서준(2번)에게 미콜 벳 200 반환')
  })

  test('금액에 천단위 구분이 들어간다', () => {
    expect(describeForLearner({ type: 'award_pot', potIndex: 0, seat: 1, amount: 32300 }, seats))
      .toBe('메인팟 32,300 → 박서준(2번)')
    expect(describeForLearner({ type: 'award_pot', potIndex: 1, seat: 1, amount: 13500 }, seats))
      .toBe('사이드팟 1 13,500 → 박서준(2번)')
  })

  test('딜러 동작은 좌석이 없다', () => {
    expect(describeForLearner({ type: 'burn' }, seats)).toBe('카드 한 장 번')
    expect(describeForLearner({ type: 'collect_bets' }, seats)).toBe('벳을 팟으로 끌어온다')
  })

  test('보드는 스트리트 이름을 한국어로 쓴다', () => {
    const e: HandEvent = {
      type: 'deal_board',
      street: 'flop',
      cards: [{ rank: '8', suit: 'h' }, { rank: 'A', suit: 'c' }, { rank: 'Q', suit: 'd' }],
    }
    expect(describeForLearner(e, seats)).toBe('플랍 8♥ A♣ Q♦')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

```
cd app && npx vitest run src/components/table/log.test.ts
```

기대: `Failed to resolve import "./log"`.

- [ ] **Step 3: `log.ts` 를 구현한다**

```ts
/**
 * 학습자용 이벤트 문구.
 *
 * 하네스의 `describeEvent`(`src/app/simulator-harness/format.ts`)를 재사용하지 않는다.
 * 그쪽은 좌석을 `#4` 처럼 **0-based** 로 찍는데, 그건 진단용으로는 옳지만 학습자
 * 화면에 그대로 쓰면 문항 문구(1-based)와 어긋나 오독을 만든다.
 *
 * 좌석 번호를 화면에 찍는 곳은 `displaySeat` 하나만 통과한다.
 */
import { cardToString } from '@/lib/simulator'
import type { Card, HandEvent, SeatInit } from '@/lib/simulator'

/** API 인덱스(0-based) → 학습자에게 보이는 번호(1-based). 유일한 변환점. */
export const displaySeat = (seatIndex: number): number => seatIndex + 1

const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }

export function cardText(card: Card): string {
  const raw = cardToString(card)
  const suit = raw.slice(-1)
  return raw.slice(0, -1) + (SUIT_SYMBOL[suit] ?? suit)
}

const num = (v: number) => v.toLocaleString('ko-KR')

const BLIND_LABEL = { sb: '스몰블라인드', bb: '빅블라인드', ante: '앤티' } as const
const ACTION_LABEL = {
  fold: '폴드', check: '체크', call: '콜', bet: '벳', raise: '레이즈', allin: '올인',
} as const
const STREET_LABEL = {
  preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버',
} as const

/** `이민아(3번)` — 이름과 1-based 번호를 함께 쓴다. */
const who = (seats: SeatInit[], seatIndex: number) =>
  `${seats[seatIndex].name}(${displaySeat(seatIndex)}번)`

/** 이벤트 하나를 학습자가 읽는 한 줄로. 이벤트 종류가 늘면 TS 가 여기서 걸린다. */
export function describeForLearner(e: HandEvent, seats: SeatInit[]): string {
  switch (e.type) {
    case 'move_button':
      return `버튼을 ${who(seats, e.toSeat)} 좌석으로 옮긴다`
    case 'post_blind':
      return `${who(seats, e.seat)} ${BLIND_LABEL[e.kind]} ${num(e.amount)}`
    case 'deal_hole':
      return `${who(seats, e.seat)}에게 홀카드`
    case 'burn':
      return '카드 한 장 번'
    case 'deal_board':
      return `${STREET_LABEL[e.street]} ${e.cards.map(cardText).join(' ')}`
    case 'player_action': {
      const label = ACTION_LABEL[e.action.kind]
      return e.action.kind === 'fold' || e.action.kind === 'check'
        ? `${who(seats, e.seat)} ${label}`
        : `${who(seats, e.seat)} ${label} → ${num(e.action.to)}`
    }
    case 'return_uncalled':
      return `${who(seats, e.seat)}에게 미콜 벳 ${num(e.amount)} 반환`
    case 'collect_bets':
      return '벳을 팟으로 끌어온다'
    case 'showdown_reveal':
      return `${who(seats, e.seat)} 핸드 공개`
    case 'award_pot':
      return e.potIndex === 0
        ? `메인팟 ${num(e.amount)} → ${who(seats, e.seat)}`
        : `사이드팟 ${e.potIndex} ${num(e.amount)} → ${who(seats, e.seat)}`
  }
}
```

**주의:** `deal_hole` 문구에 카드를 쓰지 않는다. 로그는 학습자가 보는 채널인데 거기에 상대 홀카드를 적으면 쇼다운 문제의 답이 미리 새어 나간다. 하네스는 진단용이라 카드를 찍는 것이 맞고, 여기는 아니다.

- [ ] **Step 4: 테스트를 돌린다**

```
cd app && npx vitest run src/components/table/log.test.ts && npm run typecheck && npm run lint
```

기대: 8 passed.

- [ ] **Step 5: 커밋**

```bash
git add app/src/components/table/log.ts app/src/components/table/log.test.ts
git commit -m "feat: 학습자용 이벤트 포매터

하네스 포매터는 좌석을 0-based 로 찍어 학습자 화면에 못 쓴다.
이름 + 1-based 번호로 쓰고, deal_hole 에 카드를 적지 않는다 —
로그에 홀카드를 적으면 쇼다운 문제의 답이 샌다."
```

---

## Task 4: 테이블 뷰 컴포넌트

**Files:**
- Create: `src/components/table/Card.tsx`, `src/components/table/ChipStack.tsx`, `src/components/table/Seat.tsx`, `src/components/table/PokerTable.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: Task 2의 `seatOffset`·`chipBreakdown`·`CHIP_UNITS`, Task 3의 `cardText`·`displaySeat`, `@/lib/simulator` 의 `HandState`
- Produces: `<PokerTable state={HandState} />` — 이후 Task 8이 마운트한다

- [ ] **Step 1: `globals.css` 에 전이 규칙을 추가한다**

`src/app/globals.css` 끝에 붙인다. 기존 내용은 지우지 않는다.

```css
/*
 * 시뮬레이터 전이.
 *
 * 애니메이션 라이브러리를 쓰지 않는다 — 전부 위치 이동이라 transform 으로 충분하다.
 * 길이는 --tempo 하나로 통제하고, HandPlayer 가 재생 속도에 따라 세팅한다.
 * 컴포넌트가 duration 을 하드코딩하지 않는다.
 */
.sim-root {
  --tempo: 120ms;
  --felt: #085041;
  --felt-edge: #04342C;
  --amber: #EF9F27;
}

.sim-move {
  transition:
    transform var(--tempo) ease-out,
    opacity var(--tempo) ease-out;
}

.sim-flip {
  transition: transform var(--tempo) ease-out;
  transform-style: preserve-3d;
}

/*
 * reduced-motion 은 움직임만 지운다. 재생 박자(player.ts 의 EVENT_MS)는 그대로다 —
 * 이때 로그가 주 채널이 되는데, 로그가 한 줄씩 쌓이려면 시간이 있어야 한다.
 */
@media (prefers-reduced-motion: reduce) {
  .sim-root {
    --tempo: 0ms;
  }
}
```

- [ ] **Step 2: `Card.tsx` 를 만든다**

```tsx
/**
 * 카드 한 장. 뒤집기는 CSS rotateY 이고 라이브러리를 쓰지 않는다.
 * `faceUp` 이 false 면 랭크·수트를 DOM 에 아예 넣지 않는다 — 뒷면 카드의 값이
 * 개발자도구에 보이면 그게 곧 정답 유출이다.
 */
import { cardText } from './log'
import type { Card as EngineCard } from '@/lib/simulator'

const SIZE = {
  sm: 'h-9 w-6 text-[10px]',
  md: 'h-12 w-8 text-sm',
} as const

export function Card({
  card,
  faceUp,
  size = 'md',
}: {
  card?: EngineCard
  faceUp: boolean
  size?: keyof typeof SIZE
}) {
  const showFace = faceUp && card !== undefined
  const red = showFace && (card.suit === 'h' || card.suit === 'd')

  return (
    <div
      className={`sim-flip flex items-center justify-center rounded font-bold ${SIZE[size]} ${
        showFace
          ? `border border-zinc-300 bg-white ${red ? 'text-[#B23A2E]' : 'text-zinc-900'}`
          : 'border border-white/30 bg-gradient-to-br from-[#0F6E56] to-[#04342C]'
      }`}
      aria-label={showFace ? cardText(card) : '뒷면 카드'}
    >
      {showFace ? cardText(card) : null}
    </div>
  )
}
```

- [ ] **Step 3: `ChipStack.tsx` 를 만든다**

```tsx
/**
 * 칩 원반 더미. 팟과 각 좌석의 현재 벳에만 쓴다 — 좌석 스택은 숫자다.
 * 스택까지 칩으로 그리면 6-max 에서 원반이 40개를 넘는다.
 */
import { chipBreakdown, type ChipUnit } from './chips'

/** `12_design_system.md` §5-1 의 6색. */
const CHIP_COLOR: Record<ChipUnit, string> = {
  100: '#B4B2A9',
  500: '#378ADD',
  1000: '#1D9E75',
  5000: '#2C2C2A',
  25000: '#7F77DD',
  100000: '#EF9F27',
}

const LABEL: Record<ChipUnit, string> = {
  100: '100', 500: '500', 1000: '1K', 5000: '5K', 25000: '25K', 100000: '100K',
}

export function ChipStack({ amount }: { amount: number }) {
  if (amount <= 0) return null
  const { chips, remainder } = chipBreakdown(amount)

  return (
    <div className="flex items-center gap-1" aria-label={`${amount.toLocaleString('ko-KR')}`}>
      <div className="flex -space-x-1">
        {chips.map((pile) => (
          <div
            key={pile.unit}
            className="flex h-4 w-4 items-center justify-center rounded-full border border-white/50 text-[6px] font-extrabold text-white"
            style={{ background: CHIP_COLOR[pile.unit] }}
            title={`${LABEL[pile.unit]} × ${pile.count}`}
          >
            {pile.count > 1 ? pile.count : ''}
          </div>
        ))}
      </div>
      <span className="text-[10px] font-bold text-white">
        {amount.toLocaleString('ko-KR')}
        {remainder > 0 ? ` (+${remainder})` : ''}
      </span>
    </div>
  )
}
```

- [ ] **Step 4: `Seat.tsx` 를 만든다**

```tsx
/**
 * 좌석 하나.
 *
 * 홀카드 노출의 유일한 기준은 `SeatState.revealed` 다 — 엔진이 showdown_reveal
 * 로만 세운다. UI 가 "폴드 안 했으니 보여줘도 되겠지" 같은 판단을 하지 않는다.
 */
import { Card } from './Card'
import { ChipStack } from './ChipStack'
import { displaySeat } from './log'
import type { SeatState } from '@/lib/simulator'

export function Seat({
  seat,
  seatIndex,
  positionTag,
  hasButton,
}: {
  seat: SeatState
  seatIndex: number
  /** 'SB' | 'BB' | 'BTN' | '' */
  positionTag: string
  hasButton: boolean
}) {
  return (
    <div
      className={`flex w-24 flex-col items-center gap-0.5 ${seat.folded ? 'opacity-40' : ''}`}
    >
      <div className="flex gap-0.5">
        {seat.hole.map((card, i) => (
          <Card key={i} card={card} faceUp={seat.revealed} size="sm" />
        ))}
      </div>

      <div className="relative flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5">
        <span className="text-[10px] font-bold text-[#085041]">
          {seat.name}({displaySeat(seatIndex)})
        </span>
        {hasButton ? (
          <span className="sim-move flex h-4 w-4 items-center justify-center rounded-full bg-white text-[8px] font-black text-zinc-900 shadow">
            D
          </span>
        ) : null}
        {positionTag ? (
          <span className="rounded bg-[#EF9F27] px-1 text-[7px] font-extrabold text-[#4A2F02]">
            {positionTag}
          </span>
        ) : null}
      </div>

      <span className={`text-[9px] font-bold ${seat.allIn ? 'text-[#B23A2E]' : 'text-[#EF9F27]'}`}>
        {seat.allIn ? '올인 ' : ''}
        {seat.stack.toLocaleString('ko-KR')}
      </span>

      {seat.bet > 0 ? (
        <div className="sim-move">
          <ChipStack amount={seat.bet} />
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 5: `PokerTable.tsx` 를 만든다**

```tsx
/**
 * 오벌 테이블. 좌석 좌표는 타원 파라메트릭이고 하단 중앙은 딜러 자리로 비어 있다.
 * 이 컴포넌트는 상태를 만들지 않는다 — HandState 를 받아 그리기만 한다.
 */
'use client'

import { Card } from './Card'
import { ChipStack } from './ChipStack'
import { Seat } from './Seat'
import { seatOffset } from './geometry'
import type { HandState } from '@/lib/simulator'

const WIDTH = 340
const HEIGHT = 300
const RADIUS_X = 132
const RADIUS_Y = 108

/** 버튼 기준 포지션 태그. 3인 테이블은 역할이 겹치는데 그건 3인의 사실이다. */
function positionTags(seatCount: number, buttonSeat: number): string[] {
  const tags = Array.from({ length: seatCount }, () => '')
  tags[(buttonSeat + 1) % seatCount] = 'SB'
  tags[(buttonSeat + 2) % seatCount] = 'BB'
  return tags
}

export function PokerTable({
  state,
  burnCount,
}: {
  state: HandState
  /** 지금까지 번된 카드 수. HandState 에 없으므로(번은 상태를 바꾸지 않는다) 밖에서 센다. */
  burnCount: number
}) {
  const n = state.seats.length
  const tags = positionTags(n, state.buttonSeat)

  return (
    <div className="relative mx-auto" style={{ width: WIDTH, height: HEIGHT }}>
      <div
        className="absolute rounded-[50%] border-8 border-[var(--felt-edge)] bg-[var(--felt)]"
        style={{
          left: WIDTH / 2 - RADIUS_X,
          top: HEIGHT / 2 - RADIUS_Y,
          width: RADIUS_X * 2,
          height: RADIUS_Y * 2,
          boxShadow: 'inset 0 0 30px rgba(0,0,0,.25)',
        }}
      />

      {/* 보드와 팟 — 테이블 중앙 */}
      <div
        className="absolute flex flex-col items-center gap-1"
        style={{ left: 0, top: HEIGHT / 2 - 34, width: WIDTH }}
      >
        <div className="flex gap-1">
          {state.board.map((card, i) => (
            <Card key={i} card={card} faceUp size="sm" />
          ))}
        </div>
        {state.pot > 0 ? (
          <div className="sim-move">
            <ChipStack amount={state.pot} />
          </div>
        ) : null}
      </div>

      {/* 좌석 */}
      {state.seats.map((seat, i) => {
        const { x, y } = seatOffset(i, n, RADIUS_X, RADIUS_Y)
        return (
          <div
            key={i}
            className="sim-move absolute"
            style={{
              left: WIDTH / 2 + x - 48,
              top: HEIGHT / 2 + y - 30,
            }}
          >
            <Seat
              seat={seat}
              seatIndex={i}
              positionTag={tags[i]}
              hasButton={i === state.buttonSeat}
            />
          </div>
        )
      })}

      {/* 번 더미 — 보드 왼쪽. 번은 상태를 바꾸지 않으므로 개수만 받아 그린다 */}
      {burnCount > 0 ? (
        <div
          className="sim-move absolute flex -space-x-4"
          style={{ left: WIDTH / 2 - 118, top: HEIGHT / 2 - 18 }}
          aria-label={`번 카드 ${burnCount}장`}
        >
          {Array.from({ length: burnCount }, (_, i) => (
            <Card key={i} faceUp={false} size="sm" />
          ))}
        </div>
      ) : null}

      {/* 딜러 자리 — 하단 중앙. 카드가 여기서 나간다 */}
      <div
        className="absolute text-[9px] font-bold text-white/70"
        style={{ left: WIDTH / 2 - 16, top: HEIGHT - 14 }}
      >
        딜러(나)
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 설계 §4-3 표와 대조하고 두 항목의 축소를 확인한다**

설계 §4-3 애니메이션 표 11항목 중 9항목은 위 구현이 그대로 낸다 — 좌석·칩·버튼·보드·번 더미의 위치가 상태에서 나오고 `sim-move`/`sim-flip` 가 그 변화를 전이시킨다. **두 항목은 의도적으로 축소한다.**

| 표 항목 | 구현 | 축소한 이유 |
|---|---|---|
| fold: 카드 → 머크 + 페이드 | **페이드만** (`opacity-40`) | 머크로 미는 슬라이드는 "카드가 어디로 갔는가" 를 별도 좌표로 들고 있어야 하는데, `SeatState` 는 폴드 후에도 `hole` 을 그대로 갖는다. 페이드가 폴드를 충분히 전달하고, 좌표 상태를 하나 더 만들면 상태를 직접 고치는 설계로 돌아간다 |
| check: 좌석 펄스 | **없음** | 펄스는 상태 변화가 아니라 **이벤트 발생** 자체를 알리는 연출인데, 이 뷰는 상태만 받는다. 체크는 `applyEvent` 가 상태를 그대로 돌려주므로 뷰가 알 방법이 없다. 체크는 액션 로그가 알린다 |

두 축소 모두 "상태를 직접 고치는 설계로 되돌아가지 않는다" 는 제약을 지키기 위한 것이다. 되살리려면 이벤트를 뷰에 흘려야 하고, 그건 별도 결정이다.

- [ ] **Step 7: 타입·린트를 확인한다**

```
cd app && npm run typecheck && npm run lint
```

기대: exit 0, 오류 0. `Card.tsx` 의 `key={i}` 는 카드 배열이 append-only 라 안정적이다.

- [ ] **Step 8: 커밋**

```bash
git add app/src/components/table/Card.tsx app/src/components/table/ChipStack.tsx \
        app/src/components/table/Seat.tsx app/src/components/table/PokerTable.tsx \
        app/src/app/globals.css
git commit -m "feat: 오벌 테이블 뷰 컴포넌트

전이 길이는 --tempo 하나로 통제하고 reduced-motion 에서 0 이 된다.
뒷면 카드는 랭크·수트를 DOM 에 넣지 않는다."
```

---

## Task 5: 액션 로그

**Files:**
- Create: `src/components/table/ActionLog.tsx`

**Interfaces:**
- Consumes: Task 3의 `describeForLearner`, `@/lib/simulator` 의 `HandEvent`·`SeatInit`
- Produces: `<ActionLog events seats cursor />`

- [ ] **Step 1: `ActionLog.tsx` 를 만든다**

```tsx
/**
 * 텍스트 액션 로그.
 *
 * 스펙 §4-7 의 필수 3항목 중 하나다. 애니메이션이 정보이므로 애니메이션 없이도
 * 읽혀야 하고, prefers-reduced-motion 에서는 이쪽이 **주 채널**이 된다 — 그래서
 * 그때 폰트와 대비를 키운다.
 *
 * 재생된 이벤트(0 ..< cursor)만 그린다. 앞질러 그리면 로그가 스포일러가 된다.
 */
'use client'

import { useEffect, useRef } from 'react'
import { describeForLearner } from './log'
import type { HandEvent, SeatInit } from '@/lib/simulator'

export function ActionLog({
  events,
  seats,
  cursor,
}: {
  events: HandEvent[]
  seats: SeatInit[]
  cursor: number
}) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const shown = events.slice(0, cursor)

  return (
    <div
      className="h-48 overflow-y-auto rounded-xl bg-zinc-900 px-4 py-3 text-zinc-300 motion-reduce:text-base motion-reduce:text-zinc-100"
      role="log"
      aria-live="polite"
      aria-label="액션 로그"
    >
      {shown.length === 0 ? (
        <p className="text-xs text-zinc-500">핸드를 시작합니다.</p>
      ) : (
        <ol className="space-y-1 text-xs leading-relaxed motion-reduce:text-sm">
          {shown.map((e, i) => (
            <li
              key={i}
              className={
                i === shown.length - 1
                  ? 'font-bold text-[#EF9F27]'
                  : 'text-zinc-400 motion-reduce:text-zinc-300'
              }
            >
              {describeForLearner(e, seats)}
            </li>
          ))}
        </ol>
      )}
      <div ref={endRef} />
    </div>
  )
}
```

- [ ] **Step 2: 타입·린트를 확인한다**

```
cd app && npm run typecheck && npm run lint
```

기대: exit 0.

- [ ] **Step 3: 커밋**

```bash
git add app/src/components/table/ActionLog.tsx
git commit -m "feat: 텍스트 액션 로그

재생된 이벤트만 그린다 — 앞질러 그리면 로그가 스포일러가 된다.
reduced-motion 에서 주 채널이 되므로 폰트와 대비를 키운다."
```

---

## Task 6: 판단 프롬프트

**Files:**
- Create: `src/components/simulator/DecisionPrompt.tsx`

**Interfaces:**
- Consumes: Task 1의 `PlayerState`, Task 3의 `displaySeat`, `@/lib/simulator` 의 `Answer`·`DecisionPoint`·`DecisionResult`
- Produces: `<DecisionPrompt dp phase remainingMs result onAnswer onContinue />`

- [ ] **Step 1: `DecisionPrompt.tsx` 를 만든다**

세 가지 조용한 오답 지점을 코드에 못 박는다: `null` 빈 칸 · 칸 개수 초과 금지 · 좌석 항상 다중.

```tsx
/**
 * 판단 지점 프롬프트와 즉시 피드백.
 *
 * 세 지점이 조용히 틀린 점수를 만든다 — 주석으로 남긴다.
 *  1. 숫자 빈 칸은 `null` 이다. 0 으로 메꾸면 "0 이라고 답했다"로 채점되고,
 *     배열을 앞으로 당기면 사이드팟 답이 메인팟 칸과 대조된다.
 *  2. 칸을 `fields.length` 보다 많이 만들면 `scoreDecision` 이 throw 한다.
 *  3. 좌석 선택은 **항상 다중**이다. 정답이 한 명일 때 단일 선택으로 바꾸면
 *     분할 팟인지 아닌지가 UI 모양으로 새어 나간다.
 */
'use client'

import { useEffect, useState } from 'react'
import { displaySeat } from '@/components/table/log'
import type { Answer, DecisionPoint, DecisionResult } from '@/lib/simulator'

const KIND_LABEL = {
  procedure: '딜링 절차',
  action_validity: '액션 유효성',
  calculation: '금액 계산',
  showdown: '승자 판정',
} as const

export function DecisionPrompt({
  dp,
  phase,
  remainingMs,
  result,
  answer,
  onAnswer,
  onContinue,
}: {
  dp: DecisionPoint
  phase: 'awaiting' | 'feedback'
  remainingMs: number
  result?: DecisionResult
  answer?: Answer
  onAnswer: (answer: Answer) => void
  onContinue: () => void
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded-full bg-[#E1F5EE] px-2.5 py-1 text-[11px] font-bold text-[#085041]">
          {KIND_LABEL[dp.kind]}
        </span>
        {phase === 'awaiting' ? <Countdown remainingMs={remainingMs} limitSec={dp.timeLimitSec} /> : null}
      </div>

      <h2 className="text-base font-semibold leading-snug">{dp.prompt}</h2>
      <p className="mt-1 text-sm text-zinc-500">{dp.sub}</p>

      {phase === 'awaiting' ? (
        <div className="mt-4">
          <Inputs dp={dp} onAnswer={onAnswer} />
        </div>
      ) : (
        <Feedback dp={dp} result={result} answer={answer} onContinue={onContinue} />
      )}
    </section>
  )
}

function Countdown({ remainingMs, limitSec }: { remainingMs: number; limitSec: number }) {
  const sec = Math.max(0, Math.ceil(remainingMs / 1000))
  const ratio = Math.max(0, Math.min(1, remainingMs / (limitSec * 1000)))
  const urgent = sec <= 5
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-full ${urgent ? 'bg-[#B23A2E]' : 'bg-[#0F6E56]'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className={`text-xs font-bold ${urgent ? 'text-[#B23A2E]' : 'text-zinc-500'}`}>
        {sec}초
      </span>
    </div>
  )
}

const BTN =
  'w-full rounded-xl border border-zinc-300 px-4 py-3 text-left text-sm font-semibold ' +
  'hover:border-[#0F6E56] hover:bg-[#E1F5EE] dark:border-zinc-700 dark:hover:bg-zinc-900'

function Inputs({ dp, onAnswer }: { dp: DecisionPoint; onAnswer: (a: Answer) => void }) {
  if (dp.input.type === 'choice') {
    return (
      <div className="space-y-2">
        {dp.input.choices.map((choice, i) => (
          <button key={i} className={BTN} onClick={() => onAnswer({ type: 'choice', index: i })}>
            {choice}
          </button>
        ))}
      </div>
    )
  }
  if (dp.input.type === 'seat') return <SeatInput dp={dp} onAnswer={onAnswer} />
  return <NumberInput dp={dp} onAnswer={onAnswer} />
}

function SeatInput({ dp, onAnswer }: { dp: DecisionPoint; onAnswer: (a: Answer) => void }) {
  const [picked, setPicked] = useState<number[]>([])
  if (dp.input.type !== 'seat') return null
  const options = dp.input.options

  const toggle = (seat: number) =>
    setPicked((cur) => (cur.includes(seat) ? cur.filter((s) => s !== seat) : [...cur, seat]))

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">여러 명을 고를 수 있습니다.</p>
      {options.map((opt) => (
        <button
          key={opt.seat}
          className={`${BTN} ${picked.includes(opt.seat) ? 'border-[#0F6E56] bg-[#E1F5EE] dark:bg-zinc-900' : ''}`}
          onClick={() => toggle(opt.seat)}
        >
          <span className="mr-2 text-xs text-zinc-500">{displaySeat(opt.seat)}번</span>
          {opt.label}
        </button>
      ))}
      <button
        className="w-full rounded-xl bg-[#085041] px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
        disabled={picked.length === 0}
        onClick={() => onAnswer({ type: 'seat', seats: picked })}
      >
        제출
      </button>
    </div>
  )
}

function NumberInput({ dp, onAnswer }: { dp: DecisionPoint; onAnswer: (a: Answer) => void }) {
  // 칸 개수는 정확히 fields.length 다. 더 만들면 scoreDecision 이 throw 한다.
  const fields = dp.input.type === 'number' ? dp.input.fields : []
  const [text, setText] = useState<string[]>(() => fields.map(() => ''))
  if (dp.input.type !== 'number') return null

  const submit = () =>
    onAnswer({
      type: 'number',
      // 빈 칸은 null 이다. 0 으로 메꾸지도, 배열을 당기지도 않는다.
      values: text.map((t) => {
        const digits = t.replace(/[^0-9]/g, '')
        return digits === '' ? null : Number(digits)
      }),
    })

  return (
    <div className="space-y-3">
      {fields.map((f, i) => (
        <label key={i} className="block">
          <span className="mb-1 block text-xs font-semibold text-zinc-500">{f.label}</span>
          <input
            inputMode="numeric"
            value={text[i]}
            placeholder="0"
            onChange={(e) =>
              setText((cur) => {
                const next = [...cur]
                const digits = e.target.value.replace(/[^0-9]/g, '')
                next[i] = digits === '' ? '' : Number(digits).toLocaleString('ko-KR')
                return next
              })
            }
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-right text-lg font-bold dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      ))}
      <button
        className="w-full rounded-xl bg-[#085041] px-4 py-3 text-sm font-bold text-white"
        onClick={submit}
      >
        제출
      </button>
    </div>
  )
}

function Feedback({
  dp,
  result,
  answer,
  onContinue,
}: {
  dp: DecisionPoint
  result?: DecisionResult
  answer?: Answer
  onContinue: () => void
}) {
  // 피드백에는 타이머가 없다 — 설명을 읽는 것이 훈련의 절반이다.
  const timedOut = answer?.type === 'timeout'
  const correct = result?.correct === true

  return (
    <div className="mt-4 space-y-3">
      <div
        className={`rounded-xl px-4 py-3 text-sm font-bold ${
          correct ? 'bg-[#E1F5EE] text-[#085041]' : 'bg-[#FBEBE8] text-[#B23A2E]'
        }`}
      >
        {timedOut ? '시간 초과' : correct ? '정답입니다' : '오답입니다'}
        {result !== undefined && !correct ? ` · ${result.score}점` : ''}
      </div>

      <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#0F6E56]">
          {dp.ruleRef}
        </p>
        <p className="text-sm leading-relaxed">{dp.explanation}</p>
      </div>

      <button
        className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-900"
        onClick={onContinue}
      >
        계속
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 타입·린트를 확인한다**

```
cd app && npm run typecheck && npm run lint
```

기대: exit 0.

- [ ] **Step 3: 커밋**

```bash
git add app/src/components/simulator/DecisionPrompt.tsx
git commit -m "feat: 판단 프롬프트 3종 입력과 즉시 피드백

빈 칸은 null, 칸 개수는 fields.length 고정, 좌석은 항상 다중 선택 —
단일 선택으로 바꾸면 분할 팟 여부가 UI 모양으로 유출된다."
```

---

## Task 7: 핸드 리뷰

**Files:**
- Create: `src/components/simulator/HandReview.tsx`

**Interfaces:**
- Consumes: `@/lib/simulator` 의 `scoreHand`·`Answer`·`DecisionPoint`·`DecisionResult`
- Produces: `<HandReview decisions answers results seed onNext />`

- [ ] **Step 1: `HandReview.tsx` 를 만든다**

```tsx
/**
 * 핸드 종료 리뷰.
 *
 * **등급을 표시하지 않는다.** `gradeFrom` 은 최근 20핸드(GRADE_WINDOW)가 필요한데
 * 그 저장이 3단계 범위다. 부수 효과로 "최고 표시 등급은 senior" 결정이 저절로
 * 지켜진다 — 3단계가 저장을 붙일 때 senior 상한을 그 자리에서 넣는다.
 *
 * **null 축을 0점으로 그리지 않는다.** "측정 안 됨"과 "0점"은 다른 말이고,
 * gradeFrom 의 평균도 null 을 걸러낸다. 화면이 같은 말을 해야 한다.
 */
'use client'

import { scoreHand } from '@/lib/simulator'
import type { Answer, DecisionPoint, DecisionResult } from '@/lib/simulator'

const AXIS_LABEL = {
  procedure: '딜링 절차',
  action_validity: '액션 유효성',
  calculation: '금액 계산',
  showdown: '승자 판정',
} as const

const AXES = ['procedure', 'action_validity', 'calculation', 'showdown'] as const

export function HandReview({
  decisions,
  answers,
  results,
  seed,
  onNext,
}: {
  decisions: DecisionPoint[]
  answers: Answer[]
  results: DecisionResult[]
  seed: string
  onNext: () => void
}) {
  const score = scoreHand(results)

  return (
    <section className="space-y-4">
      <div className="rounded-2xl bg-[#085041] p-5 text-white">
        <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">핸드 결과</p>
        <p className="mt-1 text-3xl font-extrabold">{score.average}점</p>
        <p className="mt-1 text-xs text-white/70">시드 {seed}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {AXES.map((axis) => (
          <div
            key={axis}
            className="rounded-xl border border-zinc-200 p-3 text-center dark:border-zinc-800"
          >
            <p className="text-[11px] text-zinc-500">{AXIS_LABEL[axis]}</p>
            {score[axis] === null ? (
              <p className="mt-1 text-xs font-semibold text-zinc-400">이 핸드에 없었음</p>
            ) : (
              <p className="mt-1 text-lg font-extrabold text-[#0F6E56]">{score[axis]}점</p>
            )}
          </div>
        ))}
      </div>

      {decisions.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
          이 핸드에는 판단 지점이 없었습니다. 핸드마다 판단 지점의 종류와 개수가 다릅니다.
        </p>
      ) : (
        <ol className="space-y-3">
          {decisions.map((dp, i) => (
            <ReviewRow key={i} dp={dp} answer={answers[i]} result={results[i]} />
          ))}
        </ol>
      )}

      <button
        className="w-full rounded-xl bg-zinc-900 px-4 py-3.5 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-900"
        onClick={onNext}
      >
        다음 핸드
      </button>
    </section>
  )
}

function ReviewRow({
  dp,
  answer,
  result,
}: {
  dp: DecisionPoint
  answer?: Answer
  result?: DecisionResult
}) {
  const correct = result?.correct === true
  return (
    <li className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-2 flex items-center gap-2">
        <span className={`text-sm font-black ${correct ? 'text-[#0F6E56]' : 'text-[#B23A2E]'}`}>
          {correct ? '✓' : '✗'}
        </span>
        <span className="text-[11px] font-bold text-zinc-500">{AXIS_LABEL[dp.kind]}</span>
      </div>
      <p className="text-sm font-semibold">{dp.prompt}</p>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-zinc-500">내 답</dt>
          <dd>{formatAnswer(dp, answer)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-zinc-500">정답</dt>
          <dd className="font-semibold text-[#0F6E56]">{formatCorrect(dp)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-[#0F6E56]">
        {dp.ruleRef}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        {dp.explanation}
      </p>
    </li>
  )
}

const num = (v: number) => v.toLocaleString('ko-KR')

function formatAnswer(dp: DecisionPoint, answer?: Answer): string {
  if (answer === undefined || answer.type === 'timeout') return '시간 초과'
  if (answer.type === 'choice' && dp.input.type === 'choice') {
    return dp.input.choices[answer.index] ?? '—'
  }
  if (answer.type === 'seat' && dp.input.type === 'seat') {
    return seatNames(dp, answer.seats)
  }
  if (answer.type === 'number' && dp.input.type === 'number') {
    return dp.input.fields
      .map((f, i) => {
        const v = answer.values[i]
        return `${f.label} ${v === null || v === undefined ? '(빈칸)' : num(v)}`
      })
      .join(' · ')
  }
  return '—'
}

function formatCorrect(dp: DecisionPoint): string {
  if (dp.input.type === 'choice') return dp.input.choices[dp.input.correctIndex]
  if (dp.input.type === 'seat') return seatNames(dp, dp.input.correctSeats)
  return dp.input.fields.map((f) => `${f.label} ${num(f.answer)}`).join(' · ')
}

function seatNames(dp: DecisionPoint, seats: number[]): string {
  if (dp.input.type !== 'seat') return '—'
  const bySeat = new Map(dp.input.options.map((o) => [o.seat, o.label]))
  return seats.map((s) => bySeat.get(s) ?? `좌석 ${s + 1}`).join(', ')
}
```

- [ ] **Step 2: 타입·린트를 확인한다**

```
cd app && npm run typecheck && npm run lint
```

기대: exit 0.

- [ ] **Step 3: 커밋**

```bash
git add app/src/components/simulator/HandReview.tsx
git commit -m "feat: 핸드 종료 리뷰

null 축을 0점으로 그리지 않는다 — 측정 안 됨과 0점은 다른 말이고
gradeFrom 의 평균도 null 을 걸러낸다.
등급은 표시하지 않는다 (저장이 3단계 범위)."
```

---

## Task 8: 시드에서 핸드 만들기 + `HandPlayer` 조립

**Files:**
- Create: `src/components/simulator/hand.ts`, `src/components/simulator/HandPlayer.tsx`
- Test: `src/components/simulator/hand.test.ts`

**Interfaces:**
- Consumes: Task 1의 `initPlayer`·`reduce`·`EVENT_MS`, Task 4의 `PokerTable`, Task 5의 `ActionLog`, Task 6의 `DecisionPrompt`, Task 7의 `HandReview`
- Produces: `buildHand(seed) → {hand, decisions}` · `SIDE_POT_RATE` · `<HandPlayer seed onNext />`

- [ ] **Step 1: `hand.test.ts` 를 쓴다**

```ts
import { describe, expect, test } from 'vitest'
import { buildPots, initialState, stateAt } from '@/lib/simulator'
import { buildHand, SIDE_POT_RATE } from './hand'

describe('시드에서 핸드 만들기', () => {
  test('같은 시드는 같은 핸드를 만든다', () => {
    const a = buildHand('abc')
    const b = buildHand('abc')
    expect(a.hand.events).toEqual(b.hand.events)
    expect(a.decisions).toEqual(b.decisions)
  })

  test('항상 6인 테이블이다', () => {
    for (const seed of ['1', '2', 'xyz']) {
      expect(buildHand(seed).hand.seats).toHaveLength(6)
    }
  })

  test('require 가 시드에서만 유도되어 학습자 입력을 받지 않는다', () => {
    // 같은 시드는 항상 같은 require 판정을 낸다 — 결정론이 깨지지 않는다
    const first = buildHand('seed-42')
    const second = buildHand('seed-42')
    expect(first.hand.events).toEqual(second.hand.events)
  })

  test('사이드팟 핸드가 대략 1/3 비율로 나온다', () => {
    const N = 300
    let sidePots = 0
    for (let i = 0; i < N; i++) {
      const { hand } = buildHand(`s${i}`)
      const final = stateAt(
        initialState(hand.seats, hand.buttonSeat),
        hand.events,
        hand.events.length,
      )
      const pots = buildPots(final.contributed, final.seats.map((s) => s.folded))
      if (pots.length >= 2) sidePots++
    }
    // require 를 건 핸드에서만 사실상 사이드팟이 나온다. 그 비율이 SIDE_POT_RATE 근처여야 한다.
    const rate = sidePots / N
    expect(rate).toBeGreaterThan(SIDE_POT_RATE - 0.12)
    expect(rate).toBeLessThan(SIDE_POT_RATE + 0.12)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

```
cd app && npx vitest run src/components/simulator/hand.test.ts
```

기대: `Failed to resolve import "./hand"`.

- [ ] **Step 3: `hand.ts` 를 구현한다**

```ts
/**
 * 시드 하나에서 플레이할 핸드를 만든다.
 *
 * `require` 를 **시드가 정한다.** 학습자에게 노출되는 컨트롤이 아니다.
 * 이 장치가 필요한 이유: require 없이는 300시드 실측 올인 0건, `['calculation']` 을
 * 걸면 300/300 이다. 컨트롤로 안 내면서 이걸 안 걸면 4축 중 하나이자 등급 조건
 * 3축 중 하나인 계산 축의 훈련 기회가 0 이 된다.
 *
 * rng 스트림을 `:require` 로 분리했으므로 핸드 생성의 난수열과 섞이지 않고,
 * 시드 하나가 여전히 핸드 하나를 완전히 결정한다.
 *
 * 노출하지 않는 것: difficulty(무효과) · rulesetId(값 하나뿐) · seatCount(6 고정).
 */
import { createRng, extractDecisions, generateHand } from '@/lib/simulator'
import type { DecisionPoint, Hand } from '@/lib/simulator'

/** 사이드팟 핸드의 비율. 1/3. */
export const SIDE_POT_RATE = 1 / 3

/** 스펙 V1 은 6-max 다. */
const SEAT_COUNT = 6

export function buildHand(seed: string): { hand: Hand; decisions: DecisionPoint[] } {
  const wantSidePot = createRng(`${seed}:require`).int(3) === 0
  const hand = generateHand({
    seed,
    seatCount: SEAT_COUNT,
    require: wantSidePot ? ['calculation'] : undefined,
  })
  return { hand, decisions: extractDecisions(hand) }
}

/** 브라우저에서 새 시드를 만든다. 서버에서 부르지 않는다. */
export function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36)
}
```

**`randomSeed` 의 `Math.random()` 예외:** Global Constraints 의 금지는 **핸드 생성 경로**에 대한 것이다. 여기서 만드는 것은 시드 문자열 자체이고, 그 시드가 이후 모든 무작위를 `createRng` 로 통과시킨다. 시드 생성까지 결정론이면 항상 같은 핸드만 나온다.

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

```
cd app && npx vitest run src/components/simulator/hand.test.ts
```

기대: 4 passed. 비율 테스트가 흔들리면 `SIDE_POT_RATE ± 0.12` 범위를 확인하되 **범위를 넓혀서 통과시키지 말고** 실제 비율을 보고한다.

- [ ] **Step 5: `HandPlayer.tsx` 를 만든다**

```tsx
/**
 * 재생 제어와 뷰 조립.
 *
 * 상태 로직은 전부 `player.ts` 에 있다. 이 파일이 하는 일은 셋뿐이다 —
 * 리듀서를 useReducer 로 돌리고, 실제 시계(rAF)를 tick 으로 바꿔 넣고,
 * 커서로 접은 상태를 뷰에 내려준다.
 */
'use client'

import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { PokerTable } from '@/components/table/PokerTable'
import { ActionLog } from '@/components/table/ActionLog'
import { initialState, stateAt } from '@/lib/simulator'
import type { Answer } from '@/lib/simulator'
import { DecisionPrompt } from './DecisionPrompt'
import { HandReview } from './HandReview'
import { buildHand } from './hand'
import { initPlayer, reduce, type PlayerCommand, type PlayerState, type Speed } from './player'

/** CSS 전이 길이의 1x 기준. 가장 짧은 박자(deal_hole 120ms)에 맞춘다. */
const TEMPO_BASE_MS = 120

const SPEEDS: { value: Speed; label: string }[] = [
  { value: 0.5, label: '0.5x' },
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 0, label: '즉시' },
]

export function HandPlayer({ seed, onNext }: { seed: string; onNext: () => void }) {
  const { hand, decisions } = useMemo(() => buildHand(seed), [seed])
  const { config, state: initial } = useMemo(
    () => initPlayer(hand.events, decisions),
    [hand, decisions],
  )

  const boundReduce = useCallback(
    (s: PlayerState, c: PlayerCommand) => reduce(config, s, c),
    [config],
  )
  const [state, dispatch] = useReducer(boundReduce, initial)

  // 실제 시계는 여기 하나뿐이다. 리듀서는 ms 만 받는다.
  useEffect(() => {
    if (state.phase !== 'playing' && state.phase !== 'awaiting') return
    let last = performance.now()
    let raf = 0
    const loop = () => {
      const now = performance.now()
      const ms = now - last
      last = now
      if (ms > 0) dispatch({ type: 'tick', ms })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [state.phase])

  const view = useMemo(
    () => stateAt(initialState(hand.seats, hand.buttonSeat), hand.events, state.cursor),
    [hand, state.cursor],
  )

  // 번은 상태를 바꾸지 않으므로(applyEvent 가 그대로 돌려준다) 개수를 따로 센다.
  const burnCount = useMemo(
    () => hand.events.slice(0, state.cursor).filter((e) => e.type === 'burn').length,
    [hand, state.cursor],
  )

  const tempoMs = state.speed === 0 ? 0 : Math.round(TEMPO_BASE_MS / state.speed)
  // 판단 중에는 속도를 바꿔도 카운트다운에 영향이 없다. 정지 버튼 자체를 두지 않는다 —
  // 정지로 타이머를 멈출 수 있으면 45초짜리 계산 문제를 무한정 붙들 수 있다.
  const controlsLocked = state.phase === 'awaiting' || state.phase === 'feedback'

  if (state.phase === 'review') {
    return (
      <HandReview
        decisions={decisions}
        answers={state.answers}
        results={state.results}
        seed={seed}
        onNext={onNext}
      />
    )
  }

  return (
    <div
      className="sim-root space-y-4"
      // CSS 커스텀 프로퍼티는 CSSProperties 에 없으므로 단언이 필요하다.
      style={{ '--tempo': `${tempoMs}ms` } as React.CSSProperties}
    >
      <PokerTable state={view} burnCount={burnCount} />

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s.label}
              disabled={controlsLocked}
              onClick={() => dispatch({ type: 'setSpeed', speed: s.value })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40 ${
                state.speed === s.value
                  ? 'border-[#085041] bg-[#085041] text-white'
                  : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-500">
          {state.cursor} / {hand.events.length}
        </span>
      </div>

      <ActionLog events={hand.events} seats={hand.seats} cursor={state.cursor} />

      {(state.phase === 'awaiting' || state.phase === 'feedback') && state.pending[0] ? (
        <DecisionPrompt
          dp={state.pending[0]}
          phase={state.phase}
          remainingMs={state.remainingMs}
          result={state.results.at(-1)}
          answer={state.answers.at(-1)}
          onAnswer={(answer: Answer) => dispatch({ type: 'answer', answer })}
          onContinue={() => dispatch({ type: 'continue' })}
        />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 6: 게이트를 돌린다**

```
cd app && npm test && npm run typecheck && npm run lint
```

기대: 전체 테스트 통과, typecheck·lint exit 0.

- [ ] **Step 7: 커밋**

```bash
git add app/src/components/simulator/hand.ts app/src/components/simulator/hand.test.ts \
        app/src/components/simulator/HandPlayer.tsx
git commit -m "feat: 시드에서 핸드 생성과 재생 제어 조립

require 를 시드가 정한다 (1/3 사이드팟) — 컨트롤로 노출하지 않으면서
계산 축 훈련 기회를 확보하고 재현성을 유지한다.
판단 중에는 속도 컨트롤을 잠근다."
```

---

## Task 9: 라우트

**Files:**
- Create: `src/app/simulator/page.tsx`
- Modify: `src/app/page.tsx` (Next.js 템플릿을 축 3종 선택으로 교체)

**Interfaces:**
- Consumes: Task 8의 `HandPlayer`·`randomSeed`
- Produces: `/` 와 `/simulator?seed=` 라우트

- [ ] **Step 1: `src/app/simulator/page.tsx` 를 만든다**

```tsx
/**
 * 시뮬레이터 진입점.
 *
 * `?seed=` 가 없으면 만들어 URL 에 반영한다. 그러면 어떤 핸드든 링크로 복기·공유·
 * 버그 재현이 되고, 엔진의 결정론 생성이 UI 단계에서 바로 값을 낸다.
 */
'use client'

import { Suspense, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { HandPlayer } from '@/components/simulator/HandPlayer'
import { randomSeed } from '@/components/simulator/hand'

function SimulatorInner() {
  const router = useRouter()
  const params = useSearchParams()
  const seed = params.get('seed')

  useEffect(() => {
    if (seed === null) router.replace(`/simulator?seed=${randomSeed()}`)
  }, [seed, router])

  const next = useCallback(() => {
    router.replace(`/simulator?seed=${randomSeed()}`)
  }, [router])

  if (seed === null) {
    return <p className="py-20 text-center text-sm text-zinc-500">핸드를 준비하는 중…</p>
  }

  return <HandPlayer key={seed} seed={seed} onNext={next} />
}

export default function SimulatorPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6 font-sans">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500">
          ← 돌아가기
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#0F6E56]">
          딜러 교육 · 노리밋 홀덤
        </span>
      </div>
      <Suspense fallback={<p className="py-20 text-center text-sm text-zinc-500">불러오는 중…</p>}>
        <SimulatorInner />
      </Suspense>
    </main>
  )
}
```

`key={seed}` 가 중요하다 — 시드가 바뀌면 `HandPlayer` 를 새로 마운트해 리듀서 상태가 초기화된다. 없으면 이전 핸드의 커서·답안이 남는다.

- [ ] **Step 2: `src/app/page.tsx` 를 축 3종 선택으로 교체한다**

기존 Next.js 템플릿 내용을 전부 지우고 아래로 바꾼다.

```tsx
/**
 * 축 선택 화면.
 *
 * 대시보드가 아니다. 등급 카드·스트릭 배지는 hand_sessions 를 읽어야 하는데
 * 그 테이블이 3단계 범위라, 지금 만들면 더미 데이터 화면이 된다.
 */
import Link from 'next/link'

const AXES = [
  { icon: '⚖️', title: 'TDA 룰', desc: '이번 주 케이스', href: null },
  { icon: '🎓', title: '딜러 교육', desc: '노리밋 홀덤 시뮬레이터', href: '/simulator' },
  { icon: '🃏', title: '믹스게임 운영', desc: '스터드 · 드로우 트레이너', href: null },
] as const

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-10 font-sans">
      <h1 className="text-2xl font-extrabold tracking-tight">딜러마스터</h1>
      <p className="mt-1 text-sm text-zinc-500">판정을 배우는 게 아니라 판정력을 기른다</p>

      <div className="mt-8 space-y-3">
        {AXES.map((axis) =>
          axis.href === null ? (
            <div
              key={axis.title}
              className="rounded-2xl border border-zinc-200 p-5 opacity-50 dark:border-zinc-800"
            >
              <span className="text-2xl">{axis.icon}</span>
              <p className="mt-2 text-base font-bold">{axis.title}</p>
              <p className="text-xs text-zinc-500">{axis.desc}</p>
              <p className="mt-2 text-[11px] font-bold text-zinc-400">준비 중</p>
            </div>
          ) : (
            <Link
              key={axis.title}
              href={axis.href}
              className="block rounded-2xl border border-[#0F6E56] bg-[#E1F5EE] p-5 dark:bg-zinc-900"
            >
              <span className="text-2xl">{axis.icon}</span>
              <p className="mt-2 text-base font-bold text-[#085041] dark:text-[#9FE1CB]">
                {axis.title}
              </p>
              <p className="text-xs text-[#0F6E56] dark:text-zinc-400">{axis.desc}</p>
            </Link>
          ),
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: 게이트를 돌린다**

```
cd app && npm test && npm run typecheck && npm run lint && npm run build
```

기대: 전부 통과. `npm run build` 는 이 계획에서 처음 돌린다 — App Router 의 `useSearchParams` 는 `Suspense` 경계가 없으면 빌드에서 걸린다. Step 1에서 이미 감쌌다.

- [ ] **Step 4: 커밋**

```bash
git add app/src/app/simulator/page.tsx app/src/app/page.tsx
git commit -m "feat: 축 선택 화면과 시뮬레이터 라우트

seed 쿼리가 없으면 만들어 URL 에 반영한다 — 링크로 복기·공유·재현이 된다.
대시보드를 만들지 않는다 (등급 저장이 3단계 범위)."
```

---

## Task 10: 브라우저 실렌더 검증

컴포넌트를 단위 테스트하지 않기로 한 대가를 여기서 치른다. **정적 분석은 관찰이 아니다.** 실제 렌더러에서 돌리고 눈으로 본다.

**Files:** 없음 (검증 전용). 발견된 결함이 있으면 해당 파일을 고친다.

- [ ] **Step 1: dev 서버를 띄운다**

```
cd app && npm run dev
```

이미 3000번에서 도는 서버가 있으면 그것을 쓴다. 새로 띄우려 하면 Next 가 "Another next dev server is already running" 으로 거부한다.

- [ ] **Step 2: 축 선택 화면을 확인한다**

`http://localhost:3000/` 를 연다.

- [ ] 축 카드 3장이 보이고 "딜러 교육"만 활성이다
- [ ] TDA 룰·믹스게임에 "준비 중"이 보인다
- [ ] 등급 카드도 스트릭 배지도 **없다**

- [ ] **Step 3: 재생을 확인한다**

"딜러 교육"을 눌러 `/simulator` 로 간다.

- [ ] URL 에 `?seed=` 가 붙었다
- [ ] 오벌 테이블에 좌석 6개가 보이고 **하단 중앙이 비어 있으며 "딜러(나)" 라벨이 있다**
- [ ] 버튼(D)·SB·BB 태그가 보인다
- [ ] 카드가 좌석에 뒷면으로 깔린다
- [ ] 벳 칩이 좌석 앞에 나타났다가 `collect_bets` 에서 중앙 팟으로 간다
- [ ] 플랍·턴·리버 직전에 번 더미가 한 장씩 늘어난다 (핸드 끝에 3장)
- [ ] 폴드한 좌석이 흐려진다
- [ ] 액션 로그에 `이민아(3번) 레이즈 → 800` 형태로 쌓이고 **`#2` 같은 0-based 번호가 없다**
- [ ] 0.5x / 1x / 2x / 즉시 버튼이 실제로 속도를 바꾼다

- [ ] **Step 4: 판단 지점과 채점을 확인한다**

- [ ] 첫 문항(딜링 절차)에서 재생이 멈추고 카운트다운이 돈다
- [ ] 판단 중에는 속도 버튼이 비활성이다
- [ ] 답을 고르면 정오·설명·조항이 나오고 "계속"이 있다
- [ ] **오답을 일부러 골라도 핸드가 정상 절차로 계속된다**
- [ ] 답하지 않고 기다리면 시간 초과로 0점 처리되고 넘어간다

- [ ] **Step 5: 봉인 경계를 실제로 확인한다 — 이 계획의 핵심**

사이드팟이 나오는 시드를 찾는다. `?seed=` 를 바꿔가며 "서로 다른 금액의 올인이 나왔습니다" 문항이 나오는 시드를 잡는다 (약 1/3 확률).

- [ ] **팟 분배 문항이 나올 때 중앙 팟 칩이 아직 아무 좌석으로도 가지 않았다**
- [ ] 답을 낸 뒤 곧바로 "메인팟 …은 누구에게 갑니까?" 가 나오고, **그때도 팟이 아직 안 갔다**
- [ ] 승자를 고른 **뒤에야** 팟 칩이 좌석으로 이동한다
- [ ] 로그의 `메인팟 32,300 → 박서준(2번)` 줄도 그 시점에 처음 나타난다

이 항목이 하나라도 어긋나면 `player.ts` 의 `stopAt` 이 깨진 것이다. Task 1의 회귀 테스트가 초록인데 화면이 다르면, 화면 쪽에서 이벤트를 앞질러 그리고 있다는 뜻이다 — `ActionLog` 의 `slice(0, cursor)` 와 `PokerTable` 이 `view` 만 쓰는지 확인한다.

- [ ] **Step 6: 리뷰와 다음 핸드를 확인한다**

- [ ] 핸드가 끝나면 축별 점수가 나온다
- [ ] **이 핸드에 없던 축이 "0점"이 아니라 "이 핸드에 없었음"으로 표시된다**
- [ ] 등급(junior/senior/master)이 **어디에도 없다**
- [ ] 문항별 리뷰에 내 답·정답·설명·조항이 있다
- [ ] "다음 핸드"를 누르면 새 시드로 새 핸드가 시작되고 이전 답안이 남지 않는다

- [ ] **Step 7: 재현성과 모바일을 확인한다**

- [ ] 같은 `?seed=` 를 다시 열면 **같은 핸드**가 나온다
- [ ] 개발자도구를 375px 폭으로 놓고 테이블·프롬프트·로그가 잘리지 않는다
- [ ] 숫자 입력 칸이 모바일 숫자 키패드를 띄운다 (`inputMode="numeric"`)

- [ ] **Step 8: reduced-motion 을 확인한다**

개발자도구 → Rendering → "Emulate CSS prefers-reduced-motion: reduce" 를 켠다.

- [ ] 카드·칩이 **순간이동**한다 (전이 없음)
- [ ] **재생 박자는 그대로다** — 이벤트가 여전히 한 개씩 시간을 두고 진행된다
- [ ] 액션 로그의 폰트가 커지고 대비가 올라간다

- [ ] **Step 9: 하네스가 살아 있는지 확인한다**

`http://localhost:3000/simulator-harness` 를 연다.

- [ ] 시드를 넣고 생성이 동작한다 (2단계 작업이 엔진을 건드리지 않았다는 확인)

- [ ] **Step 10: 발견한 결함을 고치고 최종 게이트를 돌린다**

Step 2~9에서 어긋난 것을 고친 뒤:

```
cd app && npm test && npm run typecheck && npm run lint && npm run build
```

기대: 전부 통과. **실행 결과를 그대로 보고한다** — 통과 개수, exit 코드. "통과할 것이다" 는 보고가 아니다.

- [ ] **Step 11: 커밋**

```bash
git add -A app/src
git commit -m "fix: 브라우저 실렌더에서 발견한 결함 수정"
```

고칠 것이 없었으면 이 커밋을 만들지 않고, 무엇을 확인했는지만 보고한다.

---

## 완료 기준

설계 문서 §9의 항목을 그대로 옮긴 것이다. Task 10에서 각각을 실제로 확인한다.

- [ ] 테이블뷰에서 카드·칩·버튼 이동이 애니메이션된다 (Task 4, 10-3)
- [ ] 재생 속도 4단계가 동작한다 (Task 1, 8, 10-3)
- [ ] 액션 로그가 병행 표시되고 이름·1-based 좌석으로 읽힌다 (Task 3, 5, 10-3)
- [ ] `prefers-reduced-motion` 에서 전이가 0이 되고 박자는 유지된다 (Task 4, 10-8)
- [ ] 판단 지점 3종 입력이 모두 답을 만들고 채점된다 (Task 6, 10-4)
- [ ] 제한시간 초과가 0점으로 채점된다 (Task 1, 10-4)
- [ ] 오답 시 즉시 피드백 후 정답 절차로 계속된다 (Task 1, 6, 10-4)
- [ ] **승자·팟 문항이 `award_pot` 애니메이션 전에 출제된다** (Task 1, 10-5)
- [ ] 축별 점수 리뷰가 나오고 없던 축이 0점으로 표시되지 않는다 (Task 7, 10-6)
- [ ] 같은 `?seed=` 로 같은 핸드가 재생된다 (Task 8, 9, 10-7)
- [ ] 모바일 375px 에서 조작 가능 (Task 10-7)
- [ ] `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` 전부 통과 (Task 10-10)

---

## 이 계획에 없는 것

전부 3단계 이후다. 하다가 끌어오지 말 것.

- 이상감지(B) 모드, 이상 상황 삽입, 타이밍 채점
- `hand_sessions` 테이블과 저장
- 등급 계산·표시 (`gradeFrom` 호출), 스트릭
- 대시보드, 축1 TDA 케이스 화면
- 오답 분기 전개 (V1 제외)
- 9-max, 팟리밋·픽스드리밋, 스터드·드로우

---

## 남은 부채 (1단계 백로그 D·E절)

2단계 범위가 아니지만 이 코드를 만지다 눈에 걸릴 수 있어 적어 둔다. **고치지 말고 보고할 것.**

- `score.ts` 의 `number` 분기 꼬리 낙하
- `reduce.ts` 의 `return_uncalled` 음수 하한
- `bots.ts` 픽스처의 `stacks: []` 함정
