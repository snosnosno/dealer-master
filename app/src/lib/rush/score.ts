/**
 * 점수와 연속 배수.
 *
 * 비유: 볼링의 스트라이크 보너스다. 한 번 맞히면 그 자체로 점수가 되고,
 * 연달아 맞히면 그 다음 점수가 배로 불어난다 — 그래서 마지막 문제까지 손이 떨린다.
 *
 * 공식은 설계 §6 이 정본이다: `(100 + 남은시간 × 6) × 연속배수`.
 * 남은 시간이 점수에 직접 들어가므로 **타이머 드리프트가 곧 점수 오차**다 —
 * 화면 쪽은 인터벌 누적이 아니라 마감 시각 기준으로 남은 시간을 잰다.
 */

/** 정답 하나의 기본점. */
const BASE_POINTS = 100
/** 남은 1초당 가산점. */
const SEC_POINTS = 6

/**
 * 연속 정답 배수. 높은 단계부터 본다.
 * 3연속 1.5배 · 5연속 2배 — 즉 **3번째 정답부터** 배수가 붙는다.
 */
const STREAK_TIERS: readonly { from: number; mult: number }[] = [
  { from: 5, mult: 2 },
  { from: 3, mult: 1.5 },
]

export function streakMultiplier(streak: number): number {
  for (const tier of STREAK_TIERS) {
    if (streak >= tier.from) return tier.mult
  }
  return 1
}

/**
 * 정답 하나의 점수. `streak` 은 **이 정답을 포함한** 연속 횟수다.
 * 시간이 음수로 넘어간 경우(마감 직후 입력)는 0으로 눌러 감점이 되지 않게 한다.
 */
export function questionScore(remainingSec: number, streak: number): number {
  const remain = Math.max(0, remainingSec)
  return Math.round((BASE_POINTS + remain * SEC_POINTS) * streakMultiplier(streak))
}

export type KindTally = { correct: number; total: number }

/**
 * 한 판의 진행 상태.
 *
 * 유형 키를 제네릭으로 받는다 — 축 1(팟 판독)과 축 2(액션 판정)는 문제 유형이 다르지만
 * **점수 공식은 같아야 한다.** 축마다 이 파일을 복사하면 연속배수 경계 같은 것이
 * 조용히 갈라진다. 갈라지는 것은 유형 목록뿐이므로 그것만 타입 파라미터로 뺀다.
 */
export type RunState<K extends string = string> = {
  /** 지금까지 답한 문제 수. 곧 다음에 풀 문제의 인덱스다 */
  answered: number
  score: number
  streak: number
  correct: number
  byKind: Partial<Record<K, KindTally>>
}

/** 빈 판. 어떤 유형 집합에도 쓸 수 있도록 함수로 둔다 (`byKind` 가 비어 있을 뿐이다). */
export function emptyRun<K extends string>(): RunState<K> {
  return { answered: 0, score: 0, streak: 0, correct: 0, byKind: {} }
}

/**
 * 한 문제의 결과를 반영한 **새 상태**를 돌려준다. 원본은 건드리지 않는다.
 * 오답과 시간초과는 똑같이 연속을 끊는다 — 둘 다 "판정을 못 내린 것"이다.
 */
export function applyAnswer<K extends string>(
  state: RunState<K>,
  kind: K,
  correct: boolean,
  remainingSec: number,
): { state: RunState<K>; points: number } {
  const streak = correct ? state.streak + 1 : 0
  const points = correct ? questionScore(remainingSec, streak) : 0
  const before = state.byKind[kind] ?? { correct: 0, total: 0 }

  return {
    points,
    state: {
      answered: state.answered + 1,
      score: state.score + points,
      streak,
      correct: state.correct + (correct ? 1 : 0),
      byKind: {
        ...state.byKind,
        [kind]: {
          correct: before.correct + (correct ? 1 : 0),
          total: before.total + 1,
        },
      },
    },
  }
}
