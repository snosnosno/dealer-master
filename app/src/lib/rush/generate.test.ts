/**
 * 생성기 검증 — 유형별 1,000판.
 *
 * 핵심 규칙: **생성기가 쓴 것과 다른 경로로 정답을 다시 구해 맞춘다** (설계 §5.4).
 * 생성기는 `buildPots`/`compareHands` 로 답을 만들고, 여기서는 한 단위씩 나눠 담는
 * 오라클(`potsByUnit`)과 엔진의 다른 진입점(`awardPots`)으로 다시 구한다.
 */
import { describe, expect, it } from 'vitest'
import { GAMES, evaluatorFor } from '@/lib/games'
import { ODD_CHIP_UNIT, awardPots, buildPots, createRng, type Card } from '@/lib/simulator'
import { generateRun } from './generate'
import { oddChipSeat, potsByUnit } from './oracle'
import { makeOddChip } from './questions/oddchip'
import { makePayout } from './questions/payout'
import { makeSidePots } from './questions/sidepots'
import { makeSplit } from './questions/split'
import { makeWinner } from './questions/winner'
import { KIND_QUOTA, QUESTION_COUNT, type RushKind, type RushQuestion } from './types'

/** 팟 러시는 노리밋 홀덤이다 — 아무 다섯 장, 로우 없음 */
const EV = evaluatorFor(GAMES.nlh)

const ROUNDS = 1000

/** 유형 하나를 1,000판 만든다. 실패한 시도는 건너뛴다 (생성기는 조건에 안 맞으면 null 을 낸다). */
function sample(make: (rng: ReturnType<typeof createRng>) => RushQuestion | null): RushQuestion[] {
  const rng = createRng(`sample-${make.name}`)
  const out: RushQuestion[] = []
  let guard = 0
  while (out.length < ROUNDS && guard < ROUNDS * 200) {
    guard++
    const q = make(rng)
    if (q !== null) out.push(q)
  }
  expect(out).toHaveLength(ROUNDS)
  return out
}

const key = (c: Card) => c.rank + c.suit

function allCards(q: RushQuestion): string[] {
  return [...q.seats.flatMap((s) => s.hole ?? []), ...q.board].map(key)
}

/** 쇼다운이 있는 유형의 정답을 `awardPots` 로 다시 구한다 — 생성기가 쓰지 않은 진입점이다. */
function winnersByAwardPots(q: RushQuestion, potIndex = 0): number[] {
  const contributed = q.seats.map((s) => s.bet ?? 1000)
  const pots = buildPots(
    contributed,
    q.seats.map(() => false),
  )
  const hole = q.seats.map((s) => s.hole ?? [])
  const awards = awardPots(pots, hole, q.board, q.buttonSeat, EV)
  return awards.filter((a) => a.potIndex === potIndex).map((a) => a.seat).sort((a, b) => a - b)
}

describe('공통 — 카드 중복', () => {
  it('한 판 안에 같은 카드가 두 번 나오지 않는다', () => {
    for (const make of [makeWinner, makePayout, makeSplit]) {
      for (const q of sample(make)) {
        const cards = allCards(q)
        expect(new Set(cards).size, `${q.kind}: ${cards.join(' ')}`).toBe(cards.length)
      }
    }
  })
})

describe('사이드팟 분리', () => {
  const questions = sample(makeSidePots)

  it('정답이 한 단위씩 나눠 담는 오라클과 일치한다', () => {
    for (const q of questions) {
      if (q.kind !== 'sidepots') throw new Error('유형 불일치')
      const contributed = q.seats.map((s) => s.bet ?? 0)
      const oracle = potsByUnit(
        contributed,
        q.seats.map(() => false),
      )
      expect(q.fields.map((f) => f.answer)).toEqual(oracle.map((p) => p.amount))
    }
  })

  it('팟 합계가 투입액 합계와 같다', () => {
    for (const q of questions) {
      if (q.kind !== 'sidepots') throw new Error('유형 불일치')
      const total = q.seats.reduce((sum, s) => sum + (s.bet ?? 0), 0)
      expect(q.fields.reduce((sum, f) => sum + f.answer, 0)).toBe(total)
    }
  })

  it('팟이 둘 이상이라 문제가 성립한다', () => {
    for (const q of questions) {
      if (q.kind !== 'sidepots') throw new Error('유형 불일치')
      expect(q.fields.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('올인 금액이 콜 금액보다 뚜렷하게 낮다 (층 자르기가 눈에 보인다)', () => {
    for (const q of questions) {
      const called = Math.max(...q.seats.map((s) => s.bet ?? 0))
      for (const seat of q.seats) {
        if (seat.allIn === true) expect(seat.bet ?? 0).toBeLessThanOrEqual(called * 0.7)
      }
    }
  })

  it('아직 베팅 라운드다 — 보드도 홀카드도 공개되지 않는다', () => {
    for (const q of questions) {
      expect(q.board).toHaveLength(0)
      for (const seat of q.seats) expect(seat.hole).toBeUndefined()
    }
  })
})

describe('승자 판정', () => {
  const questions = sample(makeWinner)

  it('정답이 awardPots 재계산과 일치한다', () => {
    for (const q of questions) {
      if (q.kind !== 'winner') throw new Error('유형 불일치')
      expect(winnersByAwardPots(q)).toEqual([q.answerSeat])
    }
  })

  it('보드 5장 · 좌석마다 홀카드 2장', () => {
    for (const q of questions) {
      expect(q.board).toHaveLength(5)
      for (const seat of q.seats) expect(seat.hole).toHaveLength(2)
    }
  })
})

describe('메인팟 지급', () => {
  const questions = sample(makePayout)

  it('정답이 awardPots 로 다시 구한 메인팟 수령자와 일치한다', () => {
    for (const q of questions) {
      if (q.kind !== 'payout') throw new Error('유형 불일치')
      expect(winnersByAwardPots(q, 0)).toEqual([q.answerSeat])
    }
  })

  it('사이드팟이 생겨 자격 판단이 필요하다', () => {
    for (const q of questions) {
      const contributed = q.seats.map((s) => s.bet ?? 0)
      const pots = potsByUnit(
        contributed,
        q.seats.map(() => false),
      )
      expect(pots.length).toBeGreaterThanOrEqual(2)
      expect(pots[0].eligibleSeats.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('스플릿 팟 판정', () => {
  const questions = sample(makeSplit)

  it('정답 집합이 awardPots 재계산과 일치한다', () => {
    for (const q of questions) {
      if (q.kind !== 'split') throw new Error('유형 불일치')
      expect(winnersByAwardPots(q)).toEqual([...q.answerSeats].sort((a, b) => a - b))
    }
  })

  it('언제나 두 명 이상이 나눠 갖는다', () => {
    for (const q of questions) {
      if (q.kind !== 'split') throw new Error('유형 불일치')
      expect(q.answerSeats.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('팟이 정답자 수로 나누어떨어진다 (홀칩은 다른 유형이 다룬다)', () => {
    for (const q of questions) {
      if (q.kind !== 'split') throw new Error('유형 불일치')
      expect((q.pot ?? 0) % q.answerSeats.length).toBe(0)
    }
  })

  it('정답이 특정 좌석에 쏠리지 않는다', () => {
    const hits = new Map<number, number>()
    for (const q of questions) {
      if (q.kind !== 'split') throw new Error('유형 불일치')
      for (const seat of q.answerSeats) hits.set(seat, (hits.get(seat) ?? 0) + 1)
    }
    // 0·1번 좌석에만 몰리면 거울 배치를 섞지 않은 것이다
    for (const seat of [0, 1, 2]) expect(hits.get(seat) ?? 0).toBeGreaterThan(ROUNDS * 0.15)
  })

  it('전원 분할이 절반을 넘지 않는다 (거울 배치가 살아 있다)', () => {
    const allSplit = questions.filter(
      (q) => q.kind === 'split' && q.answerSeats.length === q.seats.length,
    ).length
    expect(allSplit).toBeLessThan(ROUNDS * 0.5)
  })
})

describe('홀칩 배분', () => {
  const questions = sample(makeOddChip)

  it('정답이 버튼 왼쪽부터 걸어가는 오라클과 일치한다', () => {
    for (const q of questions) {
      if (q.kind !== 'oddchip') throw new Error('유형 불일치')
      const eligible = q.seats.map((s, i) => (s.tie === true ? i : -1)).filter((i) => i >= 0)
      expect(q.answerSeat).toBe(oddChipSeat(eligible, q.buttonSeat, q.seats.length))
    }
  })

  it('남는 칩이 정확히 100 하나다', () => {
    for (const q of questions) {
      const winners = q.seats.filter((s) => s.tie === true).length
      const units = (q.pot ?? 0) / ODD_CHIP_UNIT
      expect(units % winners).toBe(1)
    }
  })

  it('버튼이 자격자가 아닌 판이 실제로 나온다', () => {
    const buttonOut = questions.filter((q) => q.seats[q.buttonSeat].tie !== true).length
    // 나오지 않으면 "버튼 다음 사람"이라는 틀린 규칙을 배우게 된다 (설계 §5.2)
    expect(buttonOut).toBeGreaterThan(ROUNDS * 0.1)
    expect(buttonOut).toBeLessThan(ROUNDS * 0.9)
  })

  it('자격자가 아닌 좌석이 항상 하나 이상 있다', () => {
    for (const q of questions) {
      expect(q.seats.filter((s) => s.tie !== true).length).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('한 판 구성', () => {
  it('10문제 · 유형 배분이 정해진 대로다', () => {
    for (const seed of ['a', 'b', 'seed-3', '2026-08-31']) {
      const run = generateRun(seed)
      expect(run).toHaveLength(QUESTION_COUNT)

      const counts = new Map<RushKind, number>()
      for (const q of run) counts.set(q.kind, (counts.get(q.kind) ?? 0) + 1)
      for (const [kind, quota] of Object.entries(KIND_QUOTA) as [RushKind, number][]) {
        expect(counts.get(kind), `${seed} / ${kind}`).toBe(quota)
        expect(quota).toBeLessThanOrEqual(4)
      }
    }
  })

  it('같은 시드는 같은 판을 만든다', () => {
    expect(generateRun('same-seed')).toEqual(generateRun('same-seed'))
  })

  it('다른 시드는 다른 판을 만든다', () => {
    expect(generateRun('seed-a')).not.toEqual(generateRun('seed-b'))
  })

  it('제한시간과 근거 문구가 모든 문제에 있다', () => {
    for (const q of generateRun('limits')) {
      expect(q.limitSec).toBeGreaterThan(0)
      expect(q.why.length).toBeGreaterThan(0)
      expect(q.buttonSeat).toBeGreaterThanOrEqual(0)
      expect(q.buttonSeat).toBeLessThan(q.seats.length)
    }
  })
})
