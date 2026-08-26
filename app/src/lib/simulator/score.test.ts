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
