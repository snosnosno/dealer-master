import { describe, it, expect } from 'vitest'
import { scoreDecision, scoreHand, gradeFrom } from './score'
import type { HandScore } from './score'
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

  it('필드보다 값이 많으면 던진다', () => {
    // 삼키면 초과분이 비교되지 않아 100점이 된다. 학습자가 만들 수 없는 입력이므로 호출자 버그다.
    expect(() => scoreDecision(numberDp, { type: 'number', values: [24200, 9000, 999] }))
      .toThrow(/3개.*2개/)
  })

  it('필드보다 값이 적으면 던지지 않고 빈 칸을 오답으로 센다', () => {
    // `values: number[]` 는 빈 칸을 undefined 로 담지 못한다. 2칸 중 뒤 칸을 비운 학습자의 답은
    // `[24200]` 이 되는데, 이는 평범한 학습자 행동이므로 던지면 정상 조작에서 크래시한다.
    // 없는 값은 `undefined !== 9000` 으로 오답이 되어 2필드 중 1개 정답 = 50점이다.
    const r = scoreDecision(numberDp, { type: 'number', values: [24200] })
    expect(r.score).toBe(50)
    expect(r.correct).toBe(false)
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
