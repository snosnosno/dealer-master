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
