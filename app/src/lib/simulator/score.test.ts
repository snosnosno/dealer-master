import { describe, it, expect } from 'vitest'
import { scoreDecision, scoreHand, gradeFrom, GRADE_WINDOW } from './score'
import type { HandScore } from './score'
import type { DecisionPoint } from './decisions'
import { extractDecisions } from './decisions'
import { generateHand } from './generate'

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

  it('필드보다 값이 많으면 던진다', () => {
    // 삼키면 초과분이 비교되지 않아 100점이 된다. 학습자가 만들 수 없는 입력이므로 호출자 버그다.
    expect(() => scoreDecision(numberDp, { type: 'number', values: [24200, 9000, 999] }))
      .toThrow(/3개.*2개/)
  })

  it('필드보다 값이 적으면 던지지 않고 빈 칸을 오답으로 센다', () => {
    // 꼬리 빈 칸은 짧은 배열로도 표현된다. 평범한 학습자 행동이므로 던지면 정상 조작에서
    // 크래시한다. 없는 값은 `undefined !== 9000` 으로 오답이 되어 2필드 중 1개 정답 = 50점이다.
    const r = scoreDecision(numberDp, { type: 'number', values: [24200] })
    expect(r.score).toBe(50)
    expect(r.correct).toBe(false)
  })

  it('중간 빈 칸을 null 로 표현하고, 비운 칸만 오답으로 센다', () => {
    /*
     * `number[]` 였을 때는 "1번 칸을 비우고 2번 칸만 입력"을 인덱스 정렬대로 보낼 방법이
     * 없었다. UI 가 0 으로 메꾸면 "0 이라고 답했다"로 채점되고, 배열을 앞으로 당기면
     * 사이드팟 답이 메인팟 칸과 대조된다 — 둘 다 조용히 틀린 점수를 낸다.
     *
     * 반증하는 구현 변경: null 을 0 으로 강제하면 첫 필드가 24200 이 아니므로 여전히 50점이
     * 나오지만 아래 두 번째 단언(꽉 채운 답이 100점)과 짝지어 위치 정렬이 유지됨을 본다.
     * 채점이 null 을 건너뛰고 배열을 당기면 `9000` 이 메인팟과 비교돼 0점으로 빨개진다.
     */
    const r = scoreDecision(numberDp, { type: 'number', values: [null, 9000] })
    expect(r.score).toBe(50)
    expect(r.correct).toBe(false)

    // 같은 위치 정렬로 둘 다 채우면 100점 — 위 50점이 "우연히 절반"이 아님을 고정한다.
    expect(scoreDecision(numberDp, { type: 'number', values: [24200, 9000] }).score).toBe(100)
    // 반대쪽 칸만 채우면 역시 50점. 두 칸이 각각 독립으로 채점된다.
    expect(scoreDecision(numberDp, { type: 'number', values: [24200, null] }).score).toBe(50)
  })

  it('null 은 정답 0 과 구별된다 — 빈 칸이 0 을 맞힌 것으로 세어지면 안 된다', () => {
    const zeroDp: DecisionPoint = {
      ...numberDp,
      input: { type: 'number', fields: [{ label: '메인팟', answer: 0 }, { label: '사이드팟', answer: 9000 }] },
    }
    // 빈 칸을 0 으로 메꾸는 구현이면 이 단언이 100점을 내며 빨개진다.
    expect(scoreDecision(zeroDp, { type: 'number', values: [null, 9000] }).score).toBe(50)
    expect(scoreDecision(zeroDp, { type: 'number', values: [0, 9000] }).score).toBe(100)
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

  // mk 는 null 축을 만들지 못한다. 결측 축이 있는 창은 아래 헬퍼로 만든다.
  // average 는 0 으로 둔다 — gradeFrom 은 축 키만 읽고 average 를 보지 않는다.
  const withNulls = (p: number | null, v: number | null, c: number | null): HandScore =>
    ({ procedure: p, action_validity: v, calculation: c, showdown: null, average: 0 })

  it('창 전체에서 결측인 축은 0으로 평균되어 승급을 막는다', () => {
    // action_validity 를 한 번도 묻지 않은 창. 나머지 두 축이 만점이어도 junior 다 —
    // "측정 안 됨"이 "측정했고 0점"과 구별되지 않기 때문이다.
    expect(gradeFrom([withNulls(100, null, 100), withNulls(100, null, 100)])).toBe('junior')
  })

  it('일부 핸드에서만 결측인 축은 측정된 핸드들만으로 평균낸다', () => {
    // action_validity 가 두 핸드 중 하나에만 있고 그 값이 90 이다. 결측을 0 으로 세면 45 가 되어
    // junior 지만, 결측 핸드는 평균에서 빠지므로 90 이 남아 master 다.
    expect(gradeFrom([withNulls(90, 90, 90), withNulls(90, null, 90)])).toBe('master')
  })
})

describe('GRADE_WINDOW', () => {
  it('창 안에서 action_validity 축이 충분히 측정된다 — 창이 좁으면 빨개진다', () => {
    /*
     * `gradeFrom` 은 창을 자르지 않는다. 자르는 쪽(호출부)이 크기를 정해야 하고 그 크기가
     * GRADE_WINDOW 다. 이 축은 설계상 핸드의 약 32.7% 에서 아예 나오지 않으므로(300시드
     * 실측 98건), 창이 좁으면 학습자가 자기 잘못 없이 축 점수 0 으로 승급이 막히거나
     * 표본 한 개짜리 축이 스무 개짜리 축과 같은 무게로 등급을 인증한다.
     *
     * 부재율 0.327 에서 창 전체 결측 확률은 N=3 이면 3.5%, N=5 면 0.37%, N=20 이면
     * 사실상 0 이다. 표본 1개 이하 확률은 N=3 이면 25%, N=5 면 4.2%, N=20 이면 사실상 0.
     *
     * 반증하는 구현 변경: GRADE_WINDOW 를 5 이하로 낮추면 이 표본에서 실제로 빨개진다.
     * 발행 게이트가 좁아져 축이 덜 나오게 되어도 빨개진다 — 그때는 창을 다시 정하라는 신호다.
     */
    let handsWithAxis = 0
    for (let i = 0; i < GRADE_WINDOW; i++) {
      const dps = extractDecisions(generateHand({ seed: `window-${i}` }))
      if (dps.some((d) => d.kind === 'action_validity')) handsWithAxis++
    }
    // 최소 표본 규정의 대용: 창 안에 이 축이 여러 번 들어와야 평균이 의미를 갖는다.
    expect(handsWithAxis).toBeGreaterThanOrEqual(5)
  })
})
