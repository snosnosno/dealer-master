/**
 * 한 핸드를 정답으로 완주시키며 **금액이 새거나 두 번 세어지지 않는지** 본다.
 *
 * 화면 한 장만 봐서는 안 된다. 프로토타입의 결함 다섯 중 넷은 화면이 멀쩡했고
 * 로그 두 줄 **사이**가 어긋나 있었다.
 */
import { describe, expect, it } from 'vitest'
import { GAMES, type GameSpec } from '@/lib/games'
import { dealHand, SEAT_COUNT } from './deal'
import { reduce, startProcedure } from './reduce'
import { firstToActSeats } from './steps'
import type { ProcedureState } from './types'

const SEEDS = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9', 'j0', 'k1', 'l2']

function playToEnd(spec: GameSpec, seed: string): ProcedureState {
  let state = startProcedure(spec, seed)
  for (let guard = 0; guard < 200 && state.phase !== 'done'; guard++) {
    if (state.phase === 'anim') {
      state = reduce(state, { type: 'animEnd' })
      continue
    }
    if (state.phase === 'openSeat') {
      const street = state.spec.streets[state.steps[state.at].streetIndex]
      state = reduce(state, {
        type: 'seat',
        // 동률이면 집합이 여럿이지만 어느 쪽을 눌러도 맞다 — 완주에는 하나면 된다
        seat: firstToActSeats(street.firstToAct, {
          buttonSeat: state.script.buttonSeat,
          seats: state.table.seats,
        })[0],
      })
      continue
    }
    const act = state.steps[state.at].act
    if (act === 'open') throw new Error('open 은 팔레트가 아니다')
    state = reduce(state, { type: 'palette', act })
  }
  if (state.phase !== 'done') throw new Error(`완주하지 못함: ${seed}`)
  return state
}

/**
 * 대본만 보고 최종 팟이 얼마여야 하는지 따로 계산한다. 리듀서를 믿지 않는다.
 *
 * **강제 베팅은 `script.forced` 에게 묻는다** — 종목 id 로 갈리지 않는다. 블라인드는
 * 첫 스트릿에 두 좌석이 내고, 앤티는 스트릿 밖에서 여섯 좌석이 한 번씩 낸다.
 */
function expectedPot(spec: GameSpec, seed: string): number {
  const script = dealHand(spec, seed)
  const forced = script.forced
  let total = forced.kind === 'ante+bringin' ? forced.ante * SEAT_COUNT : 0

  spec.streets.forEach((street, index) => {
    // 이 라운드에 좌석마다 최종적으로 앞에 놓인 금액. 누적액이라 최댓값 하나만 센다
    const paid = new Map<number, number>()
    if (index === 0 && forced.kind === 'blinds') {
      paid.set((script.buttonSeat + 1) % SEAT_COUNT, forced.sb)
      paid.set((script.buttonSeat + 2) % SEAT_COUNT, forced.bb)
    }
    for (const a of script.betting[street.id]) {
      if (a.act === 'fold' || a.act === 'check') continue
      paid.set(a.seat, Math.max(paid.get(a.seat) ?? 0, a.to))
    }
    total += [...paid.values()].reduce((sum, v) => sum + v, 0)
  })
  return total
}

/**
 * 같은 네 검사를 두 종목에 돌린다.
 *
 * **라즈를 함께 도는 이유**: 3번가는 브링인 좌석이 **두 번** 액션한다 — 500 을 세우고
 * 마지막에 스몰벳까지 차액을 콜한다. 누적액을 차액으로 옮기는 자리가 거기 하나뿐이라,
 * 금액이 두 번 세어지거나 500 이 새면 이 산술이 먼저 어긋난다.
 */
function describePotArithmetic(spec: GameSpec, seeds: readonly string[]) {
  describe(`팟 산술 — ${spec.labels.ko} 한 핸드 통째 추적`, () => {
    it.each(seeds)('시드 %s: 최종 팟 == 강제 베팅 + 라운드별 수거액의 합', (seed) => {
      expect(playToEnd(spec, seed).table.pot).toBe(expectedPot(spec, seed))
    })

    it.each(seeds)('시드 %s: 라운드가 끝나면 좌석 앞에 칩이 남지 않는다', (seed) => {
      for (const seat of playToEnd(spec, seed).table.seats) expect(seat.bet).toBe(0)
    })

    it.each(seeds)('시드 %s: 나간 돈과 팟이 맞는다 — 스택 감소분의 합 == 팟', (seed) => {
      const script = dealHand(spec, seed)
      const end = playToEnd(spec, seed)
      const spent = end.table.seats.reduce(
        (sum, seat, i) => sum + (script.seats[i].stack - seat.stack),
        0,
      )
      expect(spent).toBe(end.table.pot)
    })

    it.each(seeds)('시드 %s: 팟이 0 보다 크다 — 아무도 안 낸 판은 없다', (seed) => {
      expect(playToEnd(spec, seed).table.pot).toBeGreaterThan(0)
    })
  })
}

describePotArithmetic(GAMES.plo8, SEEDS)
describePotArithmetic(GAMES.razz, SEEDS)
