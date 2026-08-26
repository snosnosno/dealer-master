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
