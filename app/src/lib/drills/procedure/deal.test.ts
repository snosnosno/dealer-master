import { describe, expect, it } from 'vitest'
import { cardToString } from '@/lib/simulator'
import { GAMES } from '@/lib/games'
import { BIG_BLIND, dealHand, SEAT_COUNT, SMALL_BLIND } from './deal'

const seeds = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9', 'j0']

describe('dealHand(plo8)', () => {
  it('같은 시드는 같은 핸드를 만든다', () => {
    expect(JSON.stringify(dealHand(GAMES.plo8, 'seed-1')))
      .toBe(JSON.stringify(dealHand(GAMES.plo8, 'seed-1')))
  })

  it('다른 시드는 다른 핸드를 만든다', () => {
    expect(JSON.stringify(dealHand(GAMES.plo8, 'seed-1')))
      .not.toBe(JSON.stringify(dealHand(GAMES.plo8, 'seed-2')))
  })

  it('좌석마다 홀카드가 스펙대로 4장이다', () => {
    const script = dealHand(GAMES.plo8, 'seed-1')
    expect(script.seats).toHaveLength(SEAT_COUNT)
    for (const seat of script.seats) expect(seat.hole).toHaveLength(4)
  })

  it('보드는 플랍 3 · 턴 1 · 리버 1 이고 프리플랍에는 없다', () => {
    const script = dealHand(GAMES.plo8, 'seed-1')
    expect(script.board.preflop).toHaveLength(0)
    expect(script.board.flop).toHaveLength(3)
    expect(script.board.turn).toHaveLength(1)
    expect(script.board.river).toHaveLength(1)
  })

  it('같은 카드가 두 번 나오지 않는다 — 번카드까지 덱에서 뺀다', () => {
    for (const seed of seeds) {
      const script = dealHand(GAMES.plo8, seed)
      const seen = [
        ...script.seats.flatMap((s) => s.hole),
        ...Object.values(script.board).flat(),
      ].map(cardToString)
      expect(new Set(seen).size, seed).toBe(seen.length)
    }
  })

  it('블라인드가 SB·BB 로 잡혀 있다', () => {
    const script = dealHand(GAMES.plo8, 'seed-1')
    expect(script.blinds).toEqual({ sb: SMALL_BLIND, bb: BIG_BLIND })
  })

  it('프리플랍에는 늘 콜할 금액이 있다 — 전원 체크로 열리지 않는다', () => {
    for (const seed of seeds) {
      const acts = dealHand(GAMES.plo8, seed).betting.preflop.map((a) => a.act)
      expect(acts, seed).not.toContain('check')
    }
  })

  it('플랍 이후에는 체크로 열리는 라운드가 실제로 나온다', () => {
    const openedWithCheck = seeds.filter(
      (seed) => dealHand(GAMES.plo8, seed).betting.flop[0]?.act === 'check',
    )
    expect(openedWithCheck.length).toBeGreaterThan(0)
    expect(openedWithCheck.length).toBeLessThan(seeds.length)
  })

  it('마지막 라운드까지 최소 두 좌석이 남는다', () => {
    for (const seed of seeds) {
      const script = dealHand(GAMES.plo8, seed)
      const folded = new Set(
        Object.values(script.betting).flat().filter((a) => a.act === 'fold').map((a) => a.seat),
      )
      expect(SEAT_COUNT - folded.size, seed).toBeGreaterThanOrEqual(2)
    }
  })

  it('한 라운드 안에서 좌석은 한 번만 액션하고, 누적 금액은 줄지 않는다', () => {
    for (const seed of seeds) {
      const script = dealHand(GAMES.plo8, seed)
      for (const [streetId, actions] of Object.entries(script.betting)) {
        const seen = new Set<number>()
        const paid = new Map<number, number>()
        for (const a of actions) {
          // 지금 생성기는 좌석마다 한 라운드에 액션을 하나만 만든다 — 재레이즈가 없다.
          // 이 사실이 없으면 아래 monotonicity 검사는 첫 액션의 `?? 0` 기본값과만
          // 비교하게 되어 무엇을 대입해도 참이 되는 공허한 검사가 된다.
          expect(seen.has(a.seat), `${seed}/${streetId}/좌석 ${a.seat} 이 한 라운드에 두 번 나옴`).toBe(false)
          seen.add(a.seat)

          const before = paid.get(a.seat) ?? 0
          expect(a.to, `${seed}/${streetId}/좌석 ${a.seat}`).toBeGreaterThanOrEqual(before)
          paid.set(a.seat, a.to)
        }
      }
    }
  })
})
