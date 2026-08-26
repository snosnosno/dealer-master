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
  // 값 개수가 필드 수와 다르면 던진다. UI 는 정확히 fields.length 개의 입력만 그리므로
  // 길이 불일치는 학습자가 만들 수 없다 — 호출자 버그다. 0점으로 삼키면 우리 UI 의 버그로
  // 학습자를 오답 처리하게 된다. 답 *종류* 불일치(choice 문제에 seat 답)를 0점으로 두는 것과
  // 다른 판단이다: 그쪽은 디스패치 오류고 이쪽은 옳은 분기 안의 형태 오류다.
  if (answer.values.length !== fields.length) {
    throw new Error(`답 값 ${answer.values.length}개가 필드 ${fields.length}개와 맞지 않는다`)
  }
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

/**
 * 등급은 최근 핸드들의 축별 이동 평균으로 정한다. 누적으로 하면 초기 실수가 영구히 발목을 잡는다.
 *
 * 창 크기 N 은 이 함수가 정하지 않는다 — 호출부가 잘라 넘긴 배열이 곧 창이다. N 을 정하는 쪽이
 * 아래 두 가지를 함께 결정해야 한다. 지금은 어느 쪽도 방어하지 않는다.
 *
 * 1. 창 안에서 한 번도 측정되지 않은 축은 0 으로 평균된다. "측정 안 됨"과 "측정했고 0점"이
 *    구별되지 않는다. `action_validity` 는 설계상 생성 핸드의 약 24% 에서 아예 나타나지 않으므로,
 *    창이 작으면 학습자가 자기 잘못 없이 승급이 막힌다.
 * 2. 최소 표본 규정이 없다. 창에서 한 번 측정된 축이 스무 번 측정된 축과 같은 무게로 등급을
 *    인증한다.
 */
export function gradeFrom(recent: HandScore[]): 'junior' | 'senior' | 'master' {
  const avg = (k: Exclude<keyof HandScore, 'average'>) => {
    const vals = recent.map((h) => h[k]).filter((v): v is number => v !== null)
    return vals.length === 0 ? 0 : vals.reduce((a, v) => a + v, 0) / vals.length
  }

  const p = avg('procedure')
  const v = avg('action_validity')
  const c = avg('calculation')

  // 문턱은 설계 문서 §등급 정의 표(docs/superpowers/specs/2026-08-25-dealer-simulator-design.md:251-255)
  // 를 그대로 옮긴 것이다: junior = 절차 축, senior = 절차+계산+유효성 3축, master = 3축 90%.
  // `showdown` 을 읽지 않는 것은 누락이 아니라 그 표의 정의다 — scoreHand 는 축을 계산하지만
  // 등급 조건에는 세 축만 들어간다. 다시 열지 말 것.
  //
  // 미구현 갭: 같은 표의 master 조건은 "3축 90% 이상 + B 모드 이상 검출률 70% 이상" 인데
  // 뒤쪽 절반이 여기 없다. 이상(anomaly) 삽입 자체가 3단계 범위라(설계 문서 §구현 순서)
  // 이 코드베이스에 존재하지 않는다. 3단계가 이상 모드를 들여올 때 검출률 조건을 이 문턱에
  // 함께 배선해야 한다.
  if (p >= 90 && v >= 90 && c >= 90) return 'master'
  if (p >= 80 && v >= 80 && c >= 80) return 'senior'
  return 'junior'
}
