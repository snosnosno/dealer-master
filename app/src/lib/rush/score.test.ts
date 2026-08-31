import { describe, expect, it } from 'vitest'
import { applyAnswer, initialRun, questionScore, streakMultiplier, type RunState } from './score'

describe('streakMultiplier — 경계', () => {
  it('2연속까지는 배수가 없다', () => {
    expect(streakMultiplier(0)).toBe(1)
    expect(streakMultiplier(1)).toBe(1)
    expect(streakMultiplier(2)).toBe(1)
  })

  it('3연속부터 1.5배, 5연속부터 2배', () => {
    expect(streakMultiplier(3)).toBe(1.5)
    expect(streakMultiplier(4)).toBe(1.5)
    expect(streakMultiplier(5)).toBe(2)
    expect(streakMultiplier(12)).toBe(2)
  })
})

describe('questionScore', () => {
  it('기본점 100 + 남은 1초당 6점', () => {
    expect(questionScore(0, 1)).toBe(100)
    expect(questionScore(10, 1)).toBe(160)
    expect(questionScore(20.5, 1)).toBe(223)
  })

  it('연속 배수가 곱해진다', () => {
    expect(questionScore(10, 3)).toBe(240) // 160 × 1.5
    expect(questionScore(10, 5)).toBe(320) // 160 × 2
  })

  it('남은 시간이 음수여도 감점되지 않는다', () => {
    expect(questionScore(-3, 1)).toBe(100)
  })
})

describe('applyAnswer', () => {
  const run = (results: { ok: boolean; sec: number }[]): RunState =>
    results.reduce(
      (s, r) => applyAnswer(s, 'winner', r.ok, r.sec).state,
      initialRun,
    )

  it('원본 상태를 바꾸지 않는다', () => {
    const before = initialRun
    applyAnswer(before, 'winner', true, 10)
    expect(before).toEqual({ answered: 0, score: 0, streak: 0, correct: 0, byKind: {} })
  })

  it('3번째 정답부터 1.5배가 붙는다', () => {
    const two = run([
      { ok: true, sec: 0 },
      { ok: true, sec: 0 },
    ])
    expect(two.score).toBe(200)

    const three = applyAnswer(two, 'winner', true, 0)
    expect(three.points).toBe(150)
    expect(three.state.score).toBe(350)
  })

  it('5번째 정답부터 2배가 붙는다', () => {
    let s = initialRun
    const points: number[] = []
    for (let i = 0; i < 6; i++) {
      const next = applyAnswer(s, 'winner', true, 0)
      points.push(next.points)
      s = next.state
    }
    expect(points).toEqual([100, 100, 150, 150, 200, 200])
  })

  it('오답은 점수가 0이고 연속을 끊는다', () => {
    const s = run([
      { ok: true, sec: 10 },
      { ok: true, sec: 10 },
      { ok: true, sec: 10 },
    ])
    expect(s.streak).toBe(3)

    const missed = applyAnswer(s, 'winner', false, 5)
    expect(missed.points).toBe(0)
    expect(missed.state.streak).toBe(0)
    expect(missed.state.score).toBe(s.score)
    expect(missed.state.answered).toBe(4)

    // 끊긴 뒤에는 다시 1배부터다
    expect(applyAnswer(missed.state, 'winner', true, 0).points).toBe(100)
  })

  it('유형별 집계가 정답/전체로 쌓인다', () => {
    let s = initialRun
    s = applyAnswer(s, 'sidepots', true, 0).state
    s = applyAnswer(s, 'sidepots', false, 0).state
    s = applyAnswer(s, 'oddchip', true, 0).state

    expect(s.byKind).toEqual({
      sidepots: { correct: 1, total: 2 },
      oddchip: { correct: 1, total: 1 },
    })
    expect(s.correct).toBe(2)
    expect(s.answered).toBe(3)
  })
})
