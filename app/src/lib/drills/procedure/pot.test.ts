/**
 * 한 핸드를 정답으로 완주시키며 **금액이 새거나 두 번 세어지지 않는지** 본다.
 *
 * 화면 한 장만 봐서는 안 된다. 프로토타입의 결함 다섯 중 넷은 화면이 멀쩡했고
 * 로그 두 줄 **사이**가 어긋나 있었다.
 */
import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import { dealHand, BIG_BLIND, SEAT_COUNT, SMALL_BLIND } from './deal'
import { reduce, startProcedure } from './reduce'
import { firstToActSeat } from './steps'
import type { ProcedureState } from './types'

const SEEDS = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9', 'j0', 'k1', 'l2']

function playToEnd(seed: string): ProcedureState {
  let state = startProcedure(GAMES.plo8, seed)
  for (let guard = 0; guard < 200 && state.phase !== 'done'; guard++) {
    if (state.phase === 'anim') {
      state = reduce(state, { type: 'animEnd' })
      continue
    }
    if (state.phase === 'openSeat') {
      const street = state.spec.streets[state.steps[state.at].streetIndex]
      state = reduce(state, {
        type: 'seat',
        seat: firstToActSeat(
          street.firstToAct,
          state.script.buttonSeat,
          SEAT_COUNT,
          state.table.seats.map((s) => s.folded),
        ),
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

/** 대본만 보고 최종 팟이 얼마여야 하는지 따로 계산한다. 리듀서를 믿지 않는다. */
function expectedPot(seed: string): number {
  const script = dealHand(GAMES.plo8, seed)
  let total = 0
  for (const street of GAMES.plo8.streets) {
    // 이 라운드에 좌석마다 최종적으로 앞에 놓인 금액
    const paid = new Map<number, number>()
    if (street.id === 'preflop') {
      paid.set((script.buttonSeat + 1) % SEAT_COUNT, SMALL_BLIND)
      paid.set((script.buttonSeat + 2) % SEAT_COUNT, BIG_BLIND)
    }
    for (const a of script.betting[street.id]) {
      if (a.act === 'fold' || a.act === 'check') continue
      paid.set(a.seat, Math.max(paid.get(a.seat) ?? 0, a.to))
    }
    total += [...paid.values()].reduce((sum, v) => sum + v, 0)
  }
  return total
}

describe('팟 산술 — 한 핸드 통째 추적', () => {
  it.each(SEEDS)('시드 %s: 최종 팟 == 블라인드 + 라운드별 수거액의 합', (seed) => {
    expect(playToEnd(seed).table.pot).toBe(expectedPot(seed))
  })

  it.each(SEEDS)('시드 %s: 라운드가 끝나면 좌석 앞에 칩이 남지 않는다', (seed) => {
    for (const seat of playToEnd(seed).table.seats) expect(seat.bet).toBe(0)
  })

  it.each(SEEDS)('시드 %s: 나간 돈과 팟이 맞는다 — 스택 감소분의 합 == 팟', (seed) => {
    const script = dealHand(GAMES.plo8, seed)
    const end = playToEnd(seed)
    const spent = end.table.seats.reduce(
      (sum, seat, i) => sum + (script.seats[i].stack - seat.stack),
      0,
    )
    expect(spent).toBe(end.table.pot)
  })

  it.each(SEEDS)('시드 %s: 팟이 0 보다 크다 — 아무도 안 낸 판은 없다', (seed) => {
    expect(playToEnd(seed).table.pot).toBeGreaterThan(0)
  })
})
