import type { DecisionPoint } from './decisions'
import type { DecisionKind } from './generate'

export type Answer =
  | { type: 'choice'; index: number }
  /**
   * 빈 칸은 `null` 이다. `number[]` 로는 "1번 칸을 비우고 2번 칸만 입력"을 인덱스 정렬대로
   * 보낼 수 없어서, UI 가 0 으로 메꾸거나(→ "0 이라고 답했다"로 채점) 배열을 앞으로
   * 당기는 수밖에 없었다(→ 사이드팟 답이 메인팟 칸과 대조된다). 둘 다 조용히 틀린 점수를 낸다.
   *
   * 꼬리 빈 칸은 짧은 배열로도 표현되지만(아래 비대칭 가드 참조) 중간 빈 칸은 `null` 만이
   * 표현한다. 채점은 `null !== f.answer` 로 자연히 오답이 되므로 산술을 바꾸지 않는다.
   */
  | { type: 'number'; values: (number | null)[] }
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
  // 이 가드는 **비대칭**이다. 값이 필드보다 많으면 던지고, 적으면 던지지 않고 감점한다.
  //
  // 많은 쪽(초과)은 어떤 학습자 행동으로도 만들 수 없다 — UI 는 정확히 fields.length 개의
  // 입력만 그린다. 호출자 버그이고, 삼키면 초과분이 비교되지 않아 만점이 나와 결함이 숨는다.
  //
  // 적은 쪽(부족)은 반대로 평범한 학습자 행동이다. 2칸 중 뒤 칸을 비운 답은 `[24200]` 로도
  // `[24200, null]` 로도 올 수 있다 — UI 가 꼬리를 자르든 null 을 채우든 같은 점수가 나와야
  // 한다. 여기서 던지면 정상 조작에서 크래시한다. 아래 산술이 두 형태를 모두 옳게 처리한다 —
  // `undefined !== f.answer` 와 `null !== f.answer` 가 똑같이 오답이라 2필드 중 1개 정답 = 50점.
  //
  // 초과를 던지는 것은 답 *종류* 불일치(choice 문제에 seat 답)를 0점으로 두는 것과도 다른
  // 판단이다: 그쪽은 디스패치 오류고 이쪽은 옳은 분기 안의 형태 오류다.
  if (answer.values.length > fields.length) {
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
 * 등급 이동평균의 창 크기. 호출부가 최근 핸드를 이 개수만큼 잘라 `gradeFrom` 에 넘긴다.
 *
 * 20 으로 정한 근거(2026-08-29 결정): `action_validity` 축이 설계상 핸드의 약 32.7% 에서
 * 나오지 않는다(300시드 실측 98건). 부재율 0.327 에서 창 전체가 결측일 확률은
 * N=3 이면 3.5%, N=5 면 0.37%, N=20 이면 사실상 0(1.6e-10)이다. 표본이 1개 이하일 확률도
 * N=3 이면 25%, N=5 면 4.2%인데 N=20 이면 사실상 0 이다. 즉 **N=20 은 아래 두 결함을
 * 실질적으로 무력화한다** — 좁은 창에서만 문제가 된다.
 *
 * 이 상수는 창을 자를 책임을 지지 않는다. 자르는 것은 호출부이고 여기는 그 크기의 정본이다.
 * 바꾸려면 위 확률을 다시 계산하라. `score.test.ts` 의 GRADE_WINDOW 테스트가 창이 좁아지면
 * 빨개진다.
 */
export const GRADE_WINDOW = 20

/**
 * 등급은 최근 핸드들의 축별 이동 평균으로 정한다. 누적으로 하면 초기 실수가 영구히 발목을 잡는다.
 *
 * 창 크기 N 은 이 함수가 정하지 않는다 — 호출부가 잘라 넘긴 배열이 곧 창이다. 정본은 위
 * `GRADE_WINDOW` 다. 아래 두 가지는 창이 좁을 때만 실제 위험이고, N=20 에서는 확률적으로
 * 무력화된다. 그래도 코드가 방어하지는 않으므로 기록해 둔다.
 *
 * 1. 창 안에서 한 번도 측정되지 않은 축은 0 으로 평균된다. "측정 안 됨"과 "측정했고 0점"이
 *    구별되지 않는다. `action_validity` 는 설계상 생성 핸드의 약 32.7% 에서 아예 나타나지 않으므로(300시드 실측 98건),
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
  // 에서 왔다: senior = 절차+계산+유효성 3축 80%, master = 3축 90%. 다만 junior 는 표와 형태가
  // 다르다 — 표는 junior 를 "절차 축 80% 이상"이라는 *조건*으로 적지만 여기서는 조건 없는
  // 폴백이다(아래 `return 'junior'`). 절차 축 30% 인 학습자도 junior 로 떨어진다.
  // `showdown` 을 읽지 않는 것은 누락이 아니라 그 표의 정의다 — scoreHand 는 축을 계산하지만
  // 등급 조건에는 세 축만 들어간다. 다시 열지 말 것.
  //
  // 미구현 갭: 같은 표의 master 조건은 "3축 90% 이상 + B 모드 이상 검출률 70% 이상" 인데
  // 뒤쪽 절반이 여기 없다. 이상(anomaly) 삽입 자체가 3단계 범위라(설계 문서 §구현 순서)
  // 이 코드베이스에 존재하지 않는다. 3단계가 이상 모드를 들여올 때 검출률 조건을 이 문턱에
  // 함께 배선해야 한다.
  //
  // 그때까지의 결정(2026-08-29): **UI 는 master 를 노출하지 않는다.** 이 함수는 계속
  // 'master' 를 반환한다 — 반환값을 senior 로 눌러 담으면 3단계가 조건을 마저 배선했을 때
  // 되돌릴 자리를 잃고, 지금 초록인 문턱 테스트도 의미를 잃는다. 대신 소비하는 쪽이
  // 최고 표시 등급을 senior 로 둔다. 이상 검출을 한 번도 시험받지 않은 학습자에게
  // master 를 인증하지 않기 위해서다.
  if (p >= 90 && v >= 90 && c >= 90) return 'master'
  if (p >= 80 && v >= 80 && c >= 80) return 'senior'
  return 'junior'
}
