import { describe, expect, it } from 'vitest'
import { cards, cardToString } from '@/lib/simulator'
import { GAMES, type GameSpec } from '@/lib/games'
import { BIG_BLIND, dealHand, SEAT_COUNT, SMALL_BLIND } from './deal'
import type { HandScript } from './types'

const seeds = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9', 'j0']

/** 라즈용 시드. `razz-2` 는 폴드가 하나도 없는 판이라 일부러 끼워 둔다 */
const razzSeeds = [...seeds, 'faceup-razz', 'razz-1', 'razz-2', 'razz-3']

/** 좌석이 끝까지 남았을 때 받는 장수. 스펙에서 세므로 종목이 바뀌면 따라 바뀐다 */
const FULL_HAND = dealtThrough(GAMES.razz, GAMES.razz.streets.length - 1)

/** 스트릿 `index` 까지 좌석 하나가 받는 장수 누계 */
function dealtThrough(spec: GameSpec, index: number): number {
  return spec.streets
    .slice(0, index + 1)
    .reduce((n, street) => n + street.deal.down + street.deal.up, 0)
}

/** 좌석 → 그 좌석이 폴드한 스트릿의 인덱스. 끝까지 남은 좌석은 키가 없다 */
function foldStreetOf(spec: GameSpec, script: HandScript): Map<number, number> {
  const out = new Map<number, number>()
  spec.streets.forEach((street, index) => {
    for (const a of script.betting[street.id] ?? []) {
      if (a.act === 'fold' && !out.has(a.seat)) out.set(a.seat, index)
    }
  })
  return out
}

const seatLengths = (script: HandScript) => new Set(script.seats.map((s) => s.hole.length))

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
        ...script.seats.flatMap((s) => cards(s.hole)),
        ...Object.values(script.board).flat(),
      ].map(cardToString)
      expect(new Set(seen).size, seed).toBe(seen.length)
    }
  })

  it('블라인드가 SB·BB로 잡혀 있다', () => {
    const script = dealHand(GAMES.plo8, 'seed-1')
    expect(script.forced).toEqual({ kind: 'blinds', sb: SMALL_BLIND, bb: BIG_BLIND })
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

describe('딜이 앞뒤를 붙인다', () => {
  it('PLO8 은 홀카드 넉 장을 전부 엎어서 놓는다', () => {
    const script = dealHand(GAMES.plo8, 'faceup-plo8')
    expect(script.seats[0].hole).toHaveLength(4)
    expect(script.seats[0].hole.every((d) => !d.faceUp)).toBe(true)
  })

  it('라즈 3번가는 엎어 둘 · 열어 하나 순서로 놓는다', () => {
    const script = dealHand(GAMES.razz, 'faceup-razz')
    const first3 = script.seats[0].hole.slice(0, 3)
    expect(first3.map((d) => d.faceUp)).toEqual([false, false, true])
  })

  it('라즈 7번가는 다시 엎는다 — 끝까지 남은 좌석은 일곱 장에 앞면 넷', () => {
    const script = dealHand(GAMES.razz, 'faceup-razz')
    // 폴드한 좌석은 일곱 장을 채우지 못한다 — 남은 좌석에만 이 모양을 묻는다
    const folds = foldStreetOf(GAMES.razz, script)
    const alive = script.seats.filter((_, i) => !folds.has(i))
    expect(alive.length).toBeGreaterThan(0)
    for (const seat of alive) {
      expect(seat.hole).toHaveLength(FULL_HAND)
      expect(seat.hole.map((d) => d.faceUp))
        .toEqual([false, false, true, true, true, true, false])
    }
  })

  it('같은 카드가 두 번 나오지 않는다 — 번카드까지 덱에서 빠진다', () => {
    for (const seed of razzSeeds) {
      const script = dealHand(GAMES.razz, seed)
      const all = script.seats.flatMap((s) => s.hole.map((d) => `${d.card.rank}${d.card.suit}`))
      expect(new Set(all).size, seed).toBe(all.length)
    }
  })
})

/**
 * 폴드한 손은 걷힌다 — 그 좌석에는 다음 장이 가지 않는다.
 *
 * 라즈는 스트릿이 다섯이라 3번가에서 폴드한 좌석이 예전에는 네 장을 더 받았고
 * 그중 셋이 앞면이라 펠트에 펼쳐진 채 남았다. 진행절차를 가르치는 드릴이
 * 「폴드한 손을 걷지 않는다」를 시연하던 자리다.
 */
describe('폴드한 좌석에 딜을 멈춘다', () => {
  it('폴드한 좌석은 폴드한 스트릿까지 받은 장수만 갖는다', () => {
    for (const seed of razzSeeds) {
      const script = dealHand(GAMES.razz, seed)
      const folds = foldStreetOf(GAMES.razz, script)
      script.seats.forEach((seat, i) => {
        const at = folds.get(i)
        const want = at === undefined ? FULL_HAND : dealtThrough(GAMES.razz, at)
        expect(seat.hole.length, `${seed}/좌석 ${i}`).toBe(want)
      })
    }
  })

  /*
   * **가드가 공허하지 않다는 증거다.** 폴드가 안 일어나는 시드만 보면 가드를 지워도
   * 위 테스트가 초록으로 남는다. 그래서 좌석별 장수가 실제로 갈리는 시드를 센다.
   */
  it('좌석별 장수가 실제로 갈리는 시드가 여럿이다', () => {
    const split = razzSeeds.filter((seed) => seatLengths(dealHand(GAMES.razz, seed)).size > 1)
    expect(split.length, '장수가 갈리는 시드가 없으면 가드를 지워도 테스트가 초록이다')
      .toBeGreaterThan(razzSeeds.length / 2)
    for (const seed of split) {
      const lengths = [...seatLengths(dealHand(GAMES.razz, seed))]
      expect(Math.min(...lengths), seed).toBeLessThan(FULL_HAND)
    }
  })

  it('폴드가 한 번도 없는 시드에서는 여섯 좌석이 전부 일곱 장이다', () => {
    // `razz-2` 는 다섯 라운드가 폴드 없이 끝난다 — 가드가 살아 있는 손을 건드리지 않는 쪽 증거다
    const script = dealHand(GAMES.razz, 'razz-2')
    expect(foldStreetOf(GAMES.razz, script).size).toBe(0)
    expect(script.seats).toHaveLength(SEAT_COUNT)
    for (const seat of script.seats) expect(seat.hole).toHaveLength(FULL_HAND)
  })

  it('덱 소비가 줄어든다 — 생존 좌석 수 × 스트릿별 장수 + 번카드', () => {
    for (const seed of razzSeeds) {
      const script = dealHand(GAMES.razz, seed)
      const folds = foldStreetOf(GAMES.razz, script)

      let expected = 0
      let everySeat = 0
      GAMES.razz.streets.forEach((street, index) => {
        const per = street.deal.down + street.deal.up
        // 스트릿 k 의 딜은 k 에서 폴드하는 좌석까지 받는다 — 딜이 베팅보다 먼저 온다
        const alive = script.seats.filter((_, i) => {
          const at = folds.get(i)
          return at === undefined || at >= index
        }).length
        const fixed = (street.burn ? 1 : 0) + street.deal.board
        expected += fixed + alive * per
        everySeat += fixed + SEAT_COUNT * per
      })

      const consumed =
        script.seats.reduce((n, s) => n + s.hole.length, 0) +
        GAMES.razz.streets.filter((s) => s.burn).length +
        Object.values(script.board).flat().length
      expect(consumed, seed).toBe(expected)
      expect(consumed, seed).toBeLessThanOrEqual(everySeat)
    }
  })

  /*
   * 폴드가 덱 커서를 움직이게 되었으니 「카드 → 첫 순서 → 폴드 → 다음 카드」가 한 고리로
   * 물린다. 그 고리에 `rng` 밖의 입력이 하나라도 섞이면 같은 시드가 다른 판을 만든다.
   */
  it('같은 시드는 라즈에서도 같은 핸드를 만든다', () => {
    for (const seed of razzSeeds) {
      expect(JSON.stringify(dealHand(GAMES.razz, seed)), seed)
        .toBe(JSON.stringify(dealHand(GAMES.razz, seed)))
    }
  })

  it('PLO8 은 안 바뀐다 — 프리플랍 한 번뿐이라 폴드 전에 카드가 다 나간다', () => {
    for (const seed of seeds) {
      const script = dealHand(GAMES.plo8, seed)
      expect(script.seats, seed).toHaveLength(SEAT_COUNT)
      for (const seat of script.seats) expect(seat.hole, seed).toHaveLength(4)
    }
  })
})
