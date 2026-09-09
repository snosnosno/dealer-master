import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import { pl } from '@/lib/simulator'
import { generatePotLimitRun } from './generate'
import { ALL_PATTERNS, PREFLOP_PATTERNS } from './patterns'
import {
  POTLIMIT_BOARD_COUNT, POTLIMIT_LIMIT_SEC, POTLIMIT_MAX_SEATS, POTLIMIT_MIN_SEATS,
  POTLIMIT_POSTFLOP_BET_COUNT, POTLIMIT_POSTFLOP_RAISE_COUNT, POTLIMIT_PREFLOP_COUNT,
  POTLIMIT_QUESTION_COUNT, type PotLimitQuestion,
} from './types'

const SEEDS = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8']
/** 대본을 다 훑으려면 여덟 판으로는 모자라다. 배분·희귀 유형은 이쪽으로 본다 */
const MANY = Array.from({ length: 60 }, (_, i) => `run-${i}`)

const run = (seed: string) => generatePotLimitRun(GAMES.plo8, seed)
const every = (seeds: readonly string[]) => seeds.flatMap(run)

/**
 * 그 판의 액션 순서. 프리플랍은 빅블라인드 다음부터, 포스트플랍은 스몰블라인드부터다.
 * **생성기와 같은 규칙을 여기 다시 쓴다** — 생성기가 순서를 잘못 세우면 이 사본과
 * 어긋나서 걸린다. 생성기에서 import 해 오면 둘이 같이 틀려도 통과한다.
 */
function actionOrder(q: PotLimitQuestion): number[] {
  const n = q.seats.length
  const start = q.street === '프리플랍' ? (q.buttonSeat + 3) % n : (q.buttonSeat + 1) % n
  return Array.from({ length: n }, (_, i) => (start + i) % n)
}

describe('generatePotLimitRun', () => {
  it.each(SEEDS)('시드 %s: 열 문제가 나온다', (seed) => {
    expect(run(seed)).toHaveLength(POTLIMIT_QUESTION_COUNT)
  })

  it.each(SEEDS)('시드 %s: 같은 시드는 같은 판을 낸다', (seed) => {
    expect(JSON.stringify(run(seed))).toBe(JSON.stringify(run(seed)))
  })

  it.each(SEEDS)('시드 %s: 정답이 pl.maxRaiseTo 재계산과 일치한다', (seed) => {
    for (const q of run(seed)) {
      const currentBet = Math.max(0, ...q.seats.map((s) => s.bet))
      const onTable = q.collected + q.seats.reduce((sum, s) => sum + s.bet, 0)
      const again = pl.maxRaiseTo({
        currentBet,
        lastRaiseSize: 0,
        bigBlind: q.bb,
        seatBet: q.seats[q.heroSeat].bet,
        seatStack: 100_000_000,
        isOpenBet: currentBet === 0,
        hasActedThisRound: false,
        pot: onTable,
      })
      expect(q.answer).toBe(again)
    }
  })

  it.each(SEEDS)('시드 %s: 정답이 0 보다 크고 칩 단위로 떨어진다', (seed) => {
    for (const q of run(seed)) {
      expect(q.answer).toBeGreaterThan(0)
      expect(q.answer % 100).toBe(0)
    }
  })

  it.each(SEEDS)('시드 %s: 제한시간이 30초다', (seed) => {
    for (const q of run(seed)) {
      expect(q.limitSec).toBe(30)
      expect(POTLIMIT_LIMIT_SEC[q.kind]).toBe(30)
    }
  })

  it('팟리밋이 아닌 종목은 던진다', () => {
    expect(() => generatePotLimitRun(GAMES.nlh, 'a1')).toThrow()
  })

  // --- 스트릿 배분 -----------------------------------------------------------

  it.each(SEEDS)('시드 %s: 프리플랍 6 · 포스트플랍 4 로 갈린다', (seed) => {
    const qs = run(seed)
    const pre = qs.filter((q) => q.street === '프리플랍')
    const post = qs.filter((q) => q.street !== '프리플랍')
    expect(pre).toHaveLength(POTLIMIT_PREFLOP_COUNT)
    expect(post).toHaveLength(POTLIMIT_POSTFLOP_BET_COUNT + POTLIMIT_POSTFLOP_RAISE_COUNT)
    expect(post.filter((q) => q.kind === 'potbet')).toHaveLength(POTLIMIT_POSTFLOP_BET_COUNT)
    expect(post.filter((q) => q.kind === 'potraise')).toHaveLength(POTLIMIT_POSTFLOP_RAISE_COUNT)
  })

  it('프리플랍에는 팟벳이 없다 — 앞에 늘 빅블라인드가 있다', () => {
    for (const q of every(SEEDS)) {
      if (q.kind === 'potbet') expect(q.street).not.toBe('프리플랍')
    }
  })

  it('프리플랍 대본은 전부 팟까지 레이즈다', () => {
    for (const p of PREFLOP_PATTERNS) expect(p.kind).toBe('potraise')
  })

  // --- 대본이 다 나오는가 ----------------------------------------------------

  it('예순 판을 돌리면 모든 대본이 한 번은 나온다', () => {
    const seen = new Set(every(MANY).map((q) => q.patternId))
    const missing = ALL_PATTERNS.filter((p) => !seen.has(p.id)).map((p) => p.id)
    expect(missing).toEqual([])
  })

  it('한 판 안에서도 대본이 여러 가지다', () => {
    for (const seed of SEEDS) {
      expect(new Set(run(seed).map((q) => q.patternId)).size).toBeGreaterThanOrEqual(5)
    }
  })

  it('올인이 실제로 나오고, 올인 좌석은 라벨 대신 배지로 말한다', () => {
    const allInSeats = every(MANY).flatMap((q) => q.seats.filter((s) => s.allIn))
    expect(allInSeats.length).toBeGreaterThan(0)
    for (const s of allInSeats) {
      expect(s.bet).toBeGreaterThan(0)
      expect(s.act).toBe('')
    }
  })

  it('짧은 올인은 직전 레이즈 폭에 못 미친다', () => {
    // 대본이 '올인(언더)' 인 판에서, 그 좌석이 올린 폭이 앞선 폭보다 작아야 한다.
    // 폭을 갱신하지 않는다는 것이 이 유형의 전부다
    const unders = every(MANY).filter((q) => q.patternId.includes('au-pot'))
    expect(unders.length).toBeGreaterThan(0)
    for (const q of unders) {
      const allIn = q.seats.find((s) => s.allIn)
      expect(allIn).toBeDefined()
      const others = q.seats.filter((s) => !s.allIn).map((s) => s.bet)
      const before = Math.max(0, ...others)
      const step = (allIn?.bet ?? 0) - before
      expect(step).toBeGreaterThan(0)
      expect(step).toBeLessThan(before)
    }
  })

  // --- 상황이 화면에 담기는가 -------------------------------------------------

  it.each(SEEDS)('시드 %s: 좌석 수가 4~6 이고 대본이 들어갈 자리가 있다', (seed) => {
    for (const q of run(seed)) {
      expect(q.seats.length).toBeGreaterThanOrEqual(POTLIMIT_MIN_SEATS)
      expect(q.seats.length).toBeLessThanOrEqual(POTLIMIT_MAX_SEATS)
      expect(q.buttonSeat).toBeLessThan(q.seats.length)
      expect(q.heroSeat).toBeLessThan(q.seats.length)
    }
  })

  it.each(SEEDS)('시드 %s: 블라인드가 실제 레벨이고 SB 는 BB 의 절반이다', (seed) => {
    for (const q of run(seed)) {
      expect(q.bb).toBeGreaterThan(0)
      expect(q.sb * 2).toBe(q.bb)
    }
  })

  it.each(SEEDS)('시드 %s: 보드 장수가 스트릿과 맞고 같은 카드가 없다', (seed) => {
    for (const q of run(seed)) {
      expect(q.board).toHaveLength(POTLIMIT_BOARD_COUNT[q.street])
      expect(new Set(q.board.map((c) => `${c.rank}${c.suit}`)).size).toBe(q.board.length)
    }
  })

  it.each(SEEDS)('시드 %s: 프리플랍이면 블라인드가 앞에 놓이고 수거된 팟은 없다', (seed) => {
    for (const q of run(seed)) {
      if (q.street !== '프리플랍') continue
      const n = q.seats.length
      expect(q.collected).toBe(0)
      // 블라인드보다 클 수는 있다 — 히어로보다 앞에서 콜하거나 레이즈했으면 그렇다.
      // 작을 수는 없다. 포스트는 이미 나갔다
      expect(q.seats[(q.buttonSeat + 1) % n].bet).toBeGreaterThanOrEqual(q.sb)
      expect(q.seats[(q.buttonSeat + 2) % n].bet).toBeGreaterThanOrEqual(q.bb)
    }
  })

  it.each(SEEDS)('시드 %s: 포스트플랍이면 앞선 스트릿의 팟이 가운데 있다', (seed) => {
    for (const q of run(seed)) {
      if (q.street === '프리플랍') continue
      expect(q.collected).toBeGreaterThan(0)
    }
  })

  // --- 순서가 맞는가 ---------------------------------------------------------

  it.each(SEEDS)('시드 %s: 히어로는 지금 차례인 좌석이다', (seed) => {
    for (const q of run(seed)) {
      const order = actionOrder(q)
      const heroPos = order.indexOf(q.heroSeat)
      expect(heroPos).toBeGreaterThanOrEqual(0)
      expect(q.seats[q.heroSeat].folded).toBe(false)
      expect(q.seats[q.heroSeat].allIn).toBe(false)
      expect(q.seats[q.heroSeat].act).toBe('차례')

      // 앞 좌석은 전부 말을 마쳤다. 올인 좌석만 라벨 대신 배지로 말한다
      for (const s of order.slice(0, heroPos)) {
        if (q.seats[s].allIn) continue
        expect(q.seats[s].act).not.toBe('')
      }
      // 뒤 좌석은 아직 말하지 않았다. 앞선 스트릿에 죽은 좌석만 예외다
      for (const s of order.slice(heroPos + 1)) {
        expect(['', '폴드']).toContain(q.seats[s].act)
      }
    }
  })

  it.each(SEEDS)('시드 %s: 히어로 말고 살아 있는 사람이 있다', (seed) => {
    for (const q of run(seed)) {
      expect(q.seats.filter((s, i) => i !== q.heroSeat && !s.folded).length).toBeGreaterThan(0)
    }
  })

  it('포스트플랍 레이즈 문제의 벳은 전부 히어로보다 앞 순서다', () => {
    for (const q of every(SEEDS)) {
      if (q.kind !== 'potraise' || q.street === '프리플랍') continue
      const order = actionOrder(q)
      const heroPos = order.indexOf(q.heroSeat)
      const bettors = order.filter((s) => q.seats[s].bet > 0)
      expect(bettors.length).toBeGreaterThan(0)
      for (const s of bettors) expect(order.indexOf(s)).toBeLessThan(heroPos)
    }
  })

  it('팟벳 문제는 앞에 놓인 칩이 없다', () => {
    for (const q of every(SEEDS)) {
      if (q.kind !== 'potbet') continue
      expect(q.seats.every((s) => s.bet === 0)).toBe(true)
    }
  })

  it('포스트플랍 벳은 빅블라인드 아래로 내려가지 않는다', () => {
    for (const q of every(MANY)) {
      if (q.street === '프리플랍') continue
      const bets = q.seats.map((s) => s.bet).filter((b) => b > 0)
      for (const b of bets) expect(b).toBeGreaterThanOrEqual(q.bb)
    }
  })
})
