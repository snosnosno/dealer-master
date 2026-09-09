import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import { pl } from '@/lib/simulator'
import { generatePotLimitRun } from './generate'
import {
  POTLIMIT_BOARD_COUNT, POTLIMIT_QUESTION_COUNT, POTLIMIT_SEAT_COUNT,
  type PotLimitQuestion,
} from './types'

const SEEDS = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8']
const N = POTLIMIT_SEAT_COUNT

const run = (seed: string) => generatePotLimitRun(GAMES.plo8, seed)

/**
 * 그 판의 액션 순서. 프리플랍은 빅블라인드 다음부터, 포스트플랍은 스몰블라인드부터다.
 * **생성기와 같은 규칙을 여기 다시 쓴다** — 생성기가 순서를 잘못 세우면 이 사본과
 * 어긋나서 걸린다. 생성기에서 import 해 오면 둘이 같이 틀려도 통과한다.
 */
function actionOrder(q: PotLimitQuestion): number[] {
  const start = q.street === '프리플랍' ? (q.buttonSeat + 3) % N : (q.buttonSeat + 1) % N
  return Array.from({ length: N }, (_, i) => (start + i) % N)
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

  it('두 유형이 다 나온다', () => {
    for (const seed of SEEDS) {
      const kinds = run(seed).map((q) => q.kind)
      expect(kinds).toContain('potbet')
      expect(kinds).toContain('potraise')
    }
  })

  it('팟리밋이 아닌 종목은 던진다', () => {
    expect(() => generatePotLimitRun(GAMES.nlh, 'a1')).toThrow()
  })

  // --- 상황이 화면에 담기는가 -------------------------------------------------

  it.each(SEEDS)('시드 %s: 블라인드가 실제 레벨이고 SB 는 BB 의 절반이다', (seed) => {
    for (const q of run(seed)) {
      expect(q.bb).toBeGreaterThan(0)
      expect(q.sb * 2).toBe(q.bb)
    }
  })

  it.each(SEEDS)('시드 %s: 보드 장수가 스트릿과 맞는다', (seed) => {
    for (const q of run(seed)) {
      expect(q.board).toHaveLength(POTLIMIT_BOARD_COUNT[q.street])
    }
  })

  it.each(SEEDS)('시드 %s: 보드에 같은 카드가 두 번 나오지 않는다', (seed) => {
    for (const q of run(seed)) {
      const seen = new Set(q.board.map((c) => `${c.rank}${c.suit}`))
      expect(seen.size).toBe(q.board.length)
    }
  })

  it.each(SEEDS)('시드 %s: 프리플랍이면 블라인드가 앞에 놓이고 수거된 팟은 없다', (seed) => {
    for (const q of run(seed)) {
      if (q.street !== '프리플랍') continue
      expect(q.collected).toBe(0)
      // 블라인드보다 클 수는 있다 — 히어로보다 앞에서 콜하거나 레이즈했으면 그렇다.
      // 작을 수는 없다. 포스트는 이미 나갔다
      expect(q.seats[(q.buttonSeat + 1) % N].bet).toBeGreaterThanOrEqual(q.sb)
      expect(q.seats[(q.buttonSeat + 2) % N].bet).toBeGreaterThanOrEqual(q.bb)
    }
  })

  it.each(SEEDS)('시드 %s: 포스트플랍이면 앞선 스트릿의 팟이 가운데 있다', (seed) => {
    for (const q of run(seed)) {
      if (q.street === '프리플랍') continue
      expect(q.collected).toBeGreaterThan(0)
    }
  })

  it('프리플랍에는 팟벳이 없다 — 앞에 늘 빅블라인드가 있다', () => {
    for (const seed of SEEDS) {
      for (const q of run(seed)) {
        if (q.kind === 'potbet') expect(q.street).not.toBe('프리플랍')
      }
    }
  })

  it('프리플랍도 포스트플랍도 나온다', () => {
    const streets = new Set(SEEDS.flatMap((seed) => run(seed).map((q) => q.street)))
    expect(streets.has('프리플랍')).toBe(true)
    expect([...streets].some((s) => s !== '프리플랍')).toBe(true)
  })

  // --- 순서가 맞는가 ---------------------------------------------------------

  it.each(SEEDS)('시드 %s: 히어로는 지금 차례인 좌석이다', (seed) => {
    for (const q of run(seed)) {
      const order = actionOrder(q)
      const heroPos = order.indexOf(q.heroSeat)
      expect(heroPos).toBeGreaterThanOrEqual(0)
      expect(q.seats[q.heroSeat].folded).toBe(false)
      expect(q.seats[q.heroSeat].act).toBe('차례')

      // 앞 좌석은 전부 말을 마쳤다 — 라벨이 비어 있으면 그림이 순서를 숨긴 것이다
      for (const s of order.slice(0, heroPos)) {
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
      const live = q.seats.filter((s, i) => i !== q.heroSeat && !s.folded)
      expect(live.length).toBeGreaterThan(0)
    }
  })

  it.each(SEEDS)('시드 %s: 포스트플랍 레이즈 문제의 벳은 히어로보다 앞 순서다', (seed) => {
    for (const q of run(seed)) {
      if (q.kind !== 'potraise' || q.street === '프리플랍') continue
      const order = actionOrder(q)
      const heroPos = order.indexOf(q.heroSeat)
      const bettors = order.filter((s) => q.seats[s].bet > 0)
      expect(bettors.length).toBeGreaterThan(0)
      for (const s of bettors) expect(order.indexOf(s)).toBeLessThan(heroPos)
    }
  })

  it.each(SEEDS)('시드 %s: 팟벳 문제는 앞에 놓인 칩이 없다', (seed) => {
    for (const q of run(seed)) {
      if (q.kind !== 'potbet') continue
      expect(q.seats.every((s) => s.bet === 0)).toBe(true)
    }
  })
})
