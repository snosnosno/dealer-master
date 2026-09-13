import { describe, expect, it } from 'vitest'
import { asksFor, WINNER_QUESTION_COUNT } from './types'
import { generateWinnerRun } from './generate'
import { GAMES } from '@/lib/games'
import {
  bestFiveLow, bestOmahaHi, bestOmahaLow, cardToString, compareHands, compareLow, LOW_VALUE,
  type Card, type LowRank,
} from '@/lib/simulator'

const plo8 = GAMES.plo8
const run = (seed: string) => generateWinnerRun(plo8, seed)

describe('asksFor', () => {
  it('PLO8은 하이와 로우를 둘 다 묻는다', () => {
    expect(asksFor(GAMES.plo8)).toEqual({ hi: true, lo: true })
  })

  it('노리밋 홀덤은 로우를 묻지 않는다', () => {
    expect(asksFor(GAMES.nlh)).toEqual({ hi: true, lo: false })
  })
})

describe('generateWinnerRun', () => {
  it('10문제를 만든다', () => {
    expect(run('seed-a')).toHaveLength(WINNER_QUESTION_COUNT)
  })

  it('같은 시드는 같은 문제를 만든다', () => {
    expect(run('seed-a')).toEqual(run('seed-a'))
  })

  it('보드가 늘 5장이고 좌석마다 홀카드가 4장이며 같은 카드가 두 번 나오지 않는다', () => {
    for (const q of run('seed-b')) {
      expect(q.board).toHaveLength(5)
      for (const seat of q.seats) expect(seat.hole).toHaveLength(4)
      const all = [...q.board, ...q.seats.flatMap((s) => s.hole)].map(cardToString)
      expect(new Set(all).size).toBe(all.length)
    }
  })

  // 정답을 다시 계산해 비교한다. 생성기가 엔진이 아니라 자기 짐작으로 답을 냈다면 여기서 깨진다
  it('하이 정답이 bestOmahaHi 와 일치한다', () => {
    for (const q of run('seed-c')) {
      const ranks = q.seats.map((s) => bestOmahaHi(s.hole, q.board))
      let top = ranks[0]
      for (const r of ranks) if (compareHands(r, top) > 0) top = r
      const expected = ranks.flatMap((r, i) => (compareHands(r, top) === 0 ? [i] : []))
      expect([...q.answerHi].sort()).toEqual(expected)
    }
  })

  it('로우 정답이 bestOmahaLow 와 일치하고, 자격자가 없으면 빈 배열이다', () => {
    for (const q of run('seed-d')) {
      const lows = q.seats.map((s) => bestOmahaLow(s.hole, q.board, 8))
      const alive = lows.flatMap((l, i) => (l === null ? [] : [i]))
      if (alive.length === 0) {
        expect(q.answerLo).toEqual([])
        continue
      }
      let best = lows[alive[0]]!
      for (const i of alive) if (compareLow(lows[i]!, best) < 0) best = lows[i]!
      const expected = alive.filter((i) => compareLow(lows[i]!, best) === 0)
      expect([...q.answerLo].sort()).toEqual(expected)
    }
  })

  // 로우가 매번 없으면 「로우 없음」이 정답 고정이 되고, 매번 있으면 아무도 그 버튼을 안 누른다
  it('한 판에 로우 성립이 최소 셋, 불성립이 최소 둘 나온다', () => {
    for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
      const qs = run(seed)
      const present = qs.filter((q) => q.answerLo.length > 0).length
      expect(present).toBeGreaterThanOrEqual(3)
      expect(qs.length - present).toBeGreaterThanOrEqual(2)
    }
  })

  // 동점을 걸러내지 않는다는 것을 증명한다. 쿼터링이 실제 딜러 실수가 가장 많은 자리다
  it('동점 답이 실제로 출제된다', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => `tie-${i}`)
    const ties = seeds.flatMap(run).filter((q) => q.answerHi.length > 1 || q.answerLo.length > 1)
    expect(ties.length).toBeGreaterThan(0)
  })

  it('아직 만들지 않은 갈래는 조용히 넘어가지 않고 던진다', () => {
    // 노리밋 홀덤은 로우가 없다 — 출제 배분이 로우 성립 문제를 요구하므로 아직 낼 수 없다
    expect(() => generateWinnerRun(GAMES.nlh, 'x')).toThrow(/로우가 없는 종목/)
  })
})

describe('라즈 승자 판독', () => {
  const run = () => generateWinnerRun(GAMES.razz, 'razz-winner')

  it('열 문제를 낸다', () => {
    expect(run()).toHaveLength(10)
  })

  it('하이를 묻지 않는다', () => {
    for (const q of run()) {
      expect(q.asks).toEqual({ hi: false, lo: true })
      expect(q.answerHi).toEqual([])
    }
  })

  it('보드가 없고 좌석마다 일곱 장이다', () => {
    for (const q of run()) {
      expect(q.board).toEqual([])
      for (const seat of q.seats) expect(seat.hole).toHaveLength(7)
    }
  })

  it('로우가 늘 성립한다 — 자격이 없으니 「로우 없음」이 답인 문제는 없다', () => {
    for (const q of run()) expect(q.answerLo.length).toBeGreaterThan(0)
  })

  it('같은 시드는 같은 문제를 낸다', () => {
    expect(run()).toEqual(run())
  })

  it('한 판에 같은 카드가 두 번 나오지 않는다', () => {
    for (const q of run()) {
      const all = q.seats.flatMap((s) => s.hole.map((c) => `${c.rank}${c.suit}`))
      expect(new Set(all).size).toBe(all.length)
    }
  })

  it('가르치는 손이 배분된다 — 두 유형이 각각 둘 이상', () => {
    const questions = run()
    const straightish = questions.filter((q) => /스트레이트|플러시/.test(q.why))
    const paired = questions.filter((q) => /페어/.test(q.why))
    expect(straightish.length).toBeGreaterThanOrEqual(2)
    expect(paired.length).toBeGreaterThanOrEqual(2)
  })

  it('묻지 않는 것을 고르라고 하지 않는다 — 하이 칸이 없으니 하이를 말하지 않는다', () => {
    for (const q of run()) {
      expect(q.prompt).toBe('로우 승자를 고르세요.')
      expect(q.prompt).not.toMatch(/하이/)
    }
  })

  it('이름 뒤 조사가 받침에 맞는다 — 「3번은」이지 「3번는」이 아니다', () => {
    for (let s = 0; s < 40; s++) {
      for (const q of generateWinnerRun(GAMES.razz, `razz-josa-${s}`)) {
        expect(q.why).not.toMatch(/번는/)
      }
    }
  })

  /*
   * **플러시 판에서 플러시라고 말하나.** 「스트레이트|플러시」로 뭉쳐서 보면
   * 스트레이트만 맞아도 통과해 이 구멍이 그대로 남는다 — 그래서 이긴 손의 모양을
   * 여기서 **따로 재고** 모양마다 문구를 못박는다.
   *
   * 모양 판정을 생성기에서 가져다 쓰지 않고 여기서 다시 세우는 것은 일부러다.
   * 같은 함수를 불러 비교하면 그 함수가 틀려도 테스트가 같이 틀린다.
   * 손 자체는 엔진(`bestFiveLow`)에게 물어 생성기와 같은 다섯 장을 본다.
   *
   * 한 시드에 늘 있는 판이 아니라 여러 시드를 훑는다 — 아래 `flushOnly` 단언이
   * 이 테스트가 공허하지 않은 것을 지킨다.
   */
  it('플러시로 이긴 판은 플러시라고 가르친다 — 스트레이트라고 하지 않는다', () => {
    const sameSuit = (five: Card[]) => five.every((c) => c.suit === five[0].suit)
    const consecutive = (five: Card[]) => {
      const vs = five.map((c) => LOW_VALUE[c.rank]).sort((a, b) => a - b)
      return vs.every((v, i) => i === 0 || v === vs[i - 1] + 1)
    }

    let flushOnly = 0
    let runOnly = 0
    for (let s = 0; s < 40; s++) {
      for (const q of generateWinnerRun(GAMES.razz, `razz-flush-${s}`)) {
        const best = bestFiveLow(q.seats[q.answerLo[0]].hole, null)
        expect(best).not.toBeNull()
        const five = (best as LowRank).cards
        const flush = sameSuit(five)
        const straight = consecutive(five)

        if (flush && straight) {
          expect(q.why).toContain('스트레이트도 플러시도 세지 않으므로')
        } else if (flush) {
          flushOnly++
          expect(q.why).toContain('플러시를 세지 않으므로')
          expect(q.why).not.toMatch(/스트레이트/)
        } else if (straight) {
          runOnly++
          expect(q.why).toContain('스트레이트를 세지 않으므로')
          expect(q.why).not.toMatch(/플러시/)
        } else {
          expect(q.why).not.toMatch(/스트레이트|플러시/)
        }
      }
    }
    // 두 모양이 다 나온 것을 확인하고서야 위 단언들이 무언가를 지켰다고 말할 수 있다
    expect(flushOnly).toBeGreaterThan(0)
    expect(runOnly).toBeGreaterThan(0)
  })

  /**
   * **이긴 손을 「최고 패」라고 부르지 않는다.** A-5 의 최고 로우는 5-4-3-2-A 하나다.
   * 6-5-4-3-2 를 「최고 패」라 하면 그 판의 1등을 종목의 1등으로 잘못 가르치고,
   * 2-7 의 최고(7-5-4-3-2)와도 뒤섞인다. 스트레이트를 안 센다는 교훈은 「그냥 6 로우」로 준다.
   */
  it('무시된 모양으로 이긴 손은 몇 로우인지 말하고, 휠만 최고 로우라 부른다', () => {
    let nonWheel = 0
    for (let s = 0; s < 40; s++) {
      for (const q of generateWinnerRun(GAMES.razz, `razz-flush-${s}`)) {
        if (!/세지 않으므로/.test(q.why)) continue
        const five = (bestFiveLow(q.seats[q.answerLo[0]].hole, null) as LowRank).cards
        const top = [...five].sort((a, b) => LOW_VALUE[b.rank] - LOW_VALUE[a.rank])[0].rank
        expect(q.why).not.toContain('최고 패')
        expect(q.why).toContain(`그냥 ${top} 로우다`)
        if (top === '5') {
          expect(q.why).toContain('5-4-3-2-A 는 가장 좋은 로우다')
        } else {
          nonWheel++
          expect(q.why).not.toContain('가장 좋은 로우')
        }
      }
    }
    expect(nonWheel).toBeGreaterThan(0)
  })

  it('「로우 없음」이 왜 답이 아닌지 문제마다 말한다', () => {
    for (const q of run()) {
      // 자격 조건이 없다는 것이 이 종목을 PLO8 과 가르는 사실이다 — 그것을 말해야 한다
      expect(q.loNoneWhy).toContain('자격 조건이 없다')
    }
  })

  it('PLO8 은 그대로다 — 하이와 로우를 둘 다 묻는다', () => {
    for (const q of generateWinnerRun(GAMES.plo8, 'razz-winner')) {
      expect(q.asks).toEqual({ hi: true, lo: true })
      expect(q.prompt).toBe('하이 승자와 로우 승자를 고르세요.')
    }
  })

  it('PLO8 은 로우가 선 판에서만 「로우 없음」을 설명한다 — 안 선 판은 그게 정답이다', () => {
    const qs = generateWinnerRun(GAMES.plo8, 'razz-winner')
    const stood = qs.filter((q) => q.answerLo.length > 0)
    const absent = qs.filter((q) => q.answerLo.length === 0)
    // 배분 하한(LO_PRESENT_MIN·LO_ABSENT_MIN)이 두 쪽을 다 보장한다
    expect(stood.length).toBeGreaterThan(0)
    expect(absent.length).toBeGreaterThan(0)
    for (const q of stood) expect(q.loNoneWhy).toBe('8 이하 서로 다른 다섯 장이 나와 로우가 섰다.')
    for (const q of absent) expect(q.loNoneWhy).toBe('')
  })
})
