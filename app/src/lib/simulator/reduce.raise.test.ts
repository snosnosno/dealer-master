/**
 * `lastRaiseSize` 를 상태 기계가 들고 있는지 검증한다.
 *
 * 왜 상태에 올리는가: 이 값은 좌석 벳에서 유도되지 않는다. "직전 풀 레이즈의 폭"은
 * 역사이지 현재가 아니다. 상태에 없으면 값이 필요한 쪽마다 이벤트를 되짚어 다시
 * 계산하게 되고, 그 순간 규칙의 정본이 둘로 갈라진다.
 *
 * 축 2 "액션 판정 러시"가 이 값 위에 선다 — "이 자리의 최소 레이즈는?" 문제의
 * 정답이 곧 `minRaiseTo(state.lastRaiseSize)` 다.
 */
import { describe, it, expect } from 'vitest'
import { initialState, applyEvent } from './reduce'
import { nlh } from './rulesets/nlh'
import { generateHand } from './generate'
import type { HandEvent, HandState, SeatInit } from './types'

const BB = 2000

const seats: SeatInit[] = [
  { name: 'SB', stack: 1_000_000 },
  { name: 'BB', stack: 1_000_000 },
  { name: 'UTG', stack: 1_000_000 },
  { name: 'UTG+1', stack: 1_000_000 },
  { name: 'MP', stack: 14_000 }, // 딱 14,000 — 올인이 곧 14,000 이 된다
  { name: 'MP+1', stack: 16_000 },
]

const blinds: HandEvent[] = [
  { type: 'post_blind', seat: 0, amount: 1000, kind: 'sb' },
  { type: 'post_blind', seat: 1, amount: BB, kind: 'bb' },
]

function play(events: HandEvent[]): HandState {
  return events.reduce(applyEvent, initialState(seats, 0))
}

function currentBet(s: HandState): number {
  return Math.max(...s.seats.map((x) => x.bet))
}

describe('HandState.lastRaiseSize', () => {
  it('빅블라인드 포스트가 폭을 빅블라인드로 세운다', () => {
    // 프리플랍의 오픈 벳은 빅블라인드이고 그 폭도 빅블라인드다.
    const s = play(blinds)
    expect(s.lastRaiseSize).toBe(BB)
    expect(s.bigBlind).toBe(BB)
  })

  it('앤티는 폭을 건드리지 않는다', () => {
    const s = play([{ type: 'post_blind', seat: 3, amount: 300, kind: 'ante' }, ...blinds])
    expect(s.lastRaiseSize).toBe(BB)
  })

  it('풀 레이즈가 폭을 갱신한다', () => {
    // 4,700 은 2,000 위의 2,700 이다. 총액이 아니라 폭이 기록돼야 한다.
    const s = play([
      ...blinds,
      { type: 'player_action', seat: 2, action: { kind: 'raise', to: 4700 } },
    ])
    expect(s.lastRaiseSize).toBe(2700)
  })

  it('시험 문제 6 — 짧은 올인 둘이 폭을 깎지 않는다', () => {
    /*
     * BLIND 1000/2000(2000) 프리플랍
     *   UTG   RAISE 4700    폭 2,700 (풀)
     *   UTG+1 RAISE 13500   폭 8,800 (풀)
     *   MP    14000 ALL IN  폭   500 (미달)
     *   MP+1  16000 ALL IN  폭 2,000 (미달)
     * 콜 금액만 16,000 으로 오르고 폭은 8,800 그대로다.
     */
    const s = play([
      ...blinds,
      { type: 'player_action', seat: 2, action: { kind: 'raise', to: 4700 } },
      { type: 'player_action', seat: 3, action: { kind: 'raise', to: 13500 } },
      { type: 'player_action', seat: 4, action: { kind: 'allin', to: 14000 } },
      { type: 'player_action', seat: 5, action: { kind: 'allin', to: 16000 } },
    ])

    expect(s.lastRaiseSize).toBe(8800)
    expect(currentBet(s)).toBe(16000)
    expect(s.seats[4].allIn).toBe(true)
    expect(s.seats[5].allIn).toBe(true)

    // 축 2 가 실제로 부를 경로 — 상태를 그대로 룰셋에 넘긴다
    const answer = nlh.minRaiseTo({
      currentBet: currentBet(s),
      lastRaiseSize: s.lastRaiseSize,
      bigBlind: s.bigBlind,
      seatBet: 0,
      seatStack: Number.MAX_SAFE_INTEGER,
      isOpenBet: false,
      hasActedThisRound: false,
      pot: 0,
    })
    expect(answer).toBe(24800)
  })

  it('스택에 잘린 올인은 요청한 to 가 아니라 실제 벳으로 폭을 잰다', () => {
    // MP 는 14,000 뿐인데 20,000 을 요청했다. 실제 벳은 14,000 이므로 폭은 500 이다.
    // 요청값으로 재면 폭이 6,500 이 되어 다음 사람의 최소 레이즈가 부풀려진다.
    const s = play([
      ...blinds,
      { type: 'player_action', seat: 2, action: { kind: 'raise', to: 4700 } },
      { type: 'player_action', seat: 3, action: { kind: 'raise', to: 13500 } },
      { type: 'player_action', seat: 4, action: { kind: 'allin', to: 20000 } },
    ])
    expect(s.seats[4].bet).toBe(14000)
    expect(s.lastRaiseSize).toBe(8800)
  })

  it('스트릿이 바뀌면 폭이 0 으로 리셋된다', () => {
    // 플랍부터는 직전 폭이 없다. 하한은 룰셋이 빅블라인드로 잡아준다.
    const s = play([
      ...blinds,
      { type: 'player_action', seat: 2, action: { kind: 'raise', to: 4700 } },
      { type: 'collect_bets' },
      { type: 'deal_board', street: 'flop', cards: [] },
    ])
    expect(s.lastRaiseSize).toBe(0)
    expect(s.bigBlind).toBe(BB)

    const minBet = nlh.minRaiseTo({
      currentBet: 0,
      lastRaiseSize: s.lastRaiseSize,
      bigBlind: s.bigBlind,
      seatBet: 0,
      seatStack: Number.MAX_SAFE_INTEGER,
      isOpenBet: true,
      hasActedThisRound: false,
      pot: 0,
    })
    expect(minBet).toBe(BB)
  })

  it('생성된 핸드에서 라운드 출발점이 옛 지역 변수와 같다', () => {
    /*
     * `generate.ts` 는 라운드 폭을 `street === 'preflop' ? bb : 0` 으로 직접 세다가
     * 상태에서 읽도록 바뀌었다. 그 교체가 값을 바꾸지 않았는지 여기서 못박는다.
     * 이 불변식이 깨지면 생성기가 만드는 최소 레이즈가 조용히 틀어진다.
     */
    let checkedPreflop = 0
    let checkedPostflop = 0

    for (let n = 0; n < 40; n++) {
      const hand = generateHand({ seed: 'lrs-' + n })
      let s = initialState(hand.seats, hand.buttonSeat)

      for (const e of hand.events) {
        s = applyEvent(s, e)

        // 블라인드가 다 깔린 프리플랍 출발점 = bb
        if (e.type === 'post_blind' && e.kind === 'bb') {
          expect(s.lastRaiseSize).toBe(hand.blinds.bb)
          expect(s.bigBlind).toBe(hand.blinds.bb)
          checkedPreflop++
        }
        // 플랍 이후 라운드 출발점 = 0
        if (e.type === 'deal_board') {
          expect(s.lastRaiseSize).toBe(0)
          checkedPostflop++
        }
      }
    }

    expect(checkedPreflop).toBe(40)
    expect(checkedPostflop).toBeGreaterThan(20)
  })

  it('콜은 폭을 건드리지 않는다', () => {
    const s = play([
      ...blinds,
      { type: 'player_action', seat: 2, action: { kind: 'raise', to: 4700 } },
      { type: 'player_action', seat: 3, action: { kind: 'call', to: 4700 } },
    ])
    expect(s.lastRaiseSize).toBe(2700)
  })
})
