/**
 * 최소 레이즈·재개 유형이 함께 쓰는 프리플랍 연쇄 세팅.
 *
 * **여기서 `lastRaiseSize` 를 세지 않는다.** 금액만 고르고 `replayPreflop` 에 넘기면
 * 리듀서가 폭을 갱신하고, 짧은 올인이 폭을 갱신하지 않는다는 규칙도 거기서 나온다.
 * 프로토타입은 이 값을 손으로 셌는데, 그건 `file://` 로 열려고 그런 것이다.
 */
import type { Rng } from '@/lib/simulator'
import { replayPreflop, type PreflopChain, type Wager } from '../chain'
import { roundUnit, unitFor } from '../money'
import type { ActionSeat, LogRow } from '../types'

/**
 * 좌석은 최대 7 석이다 (테이블 좌표가 거기까지다). SB·BB·다음 차례가 3 석을 먼저
 * 쓰므로 액션하는 좌석은 4 석까지다. 넘기면 좌석이 서로 겹친다.
 */
const MAX_ACTING = 4

export type ChainOptions = {
  fullRaises?: number
  shorts?: number
  /**
   * 짧은 올인 하나의 폭을 직전 풀 레이즈 폭의 몇 배로 잡을지.
   *
   * **이 값이 재개 유형의 두 답을 가른다.** 5~40% 로만 뽑으면 둘을 합쳐도 최소 레이즈를
   * 못 넘어 "레이즈할 수 없다"만 출제된다(실측 99.2%). 각각은 미달이면서 **합치면
   * 넘기는** 경우가 제35조 4항이 누적이라는 것을 보여주는 유일한 상황이다.
   *
   * 정답을 여기서 정하는 게 아니라 **상황을 세울 뿐**이다 — 판정은 `nlh.canReopen` 이 한다.
   */
  shortFraction?: { min: number; max: number }
}

/**
 * 풀 레이즈 몇 번 + 짧은 올인 몇 번의 연쇄를 만든다.
 *
 * 조건에 맞지 않으면 `null` 을 돌려 생성기가 다시 뽑게 한다. 조건은 둘이고,
 * **둘 다 엔진이 판정한다**:
 * - 모든 액션이 합법이어야 한다 (`replayPreflop` 안에서 `validateAction`)
 * - 짧은 올인이라고 만든 것이 실제로 폭에 미달해야 한다 (`isFullRaise` 가 센다)
 */
export function makeChain(rng: Rng, bb: number, opts: ChainOptions = {}): PreflopChain | null {
  const u = unitFor(bb)
  const fullRaises = opts.fullRaises ?? 2 + rng.int(2) // 2~3회
  const shorts = Math.max(0, Math.min(opts.shorts ?? rng.int(3), MAX_ACTING - fullRaises))

  const wagers: Wager[] = []
  let currentBet = bb
  let raiseSize = bb

  for (let i = 0; i < fullRaises; i++) {
    // 직전 폭의 1.05~2.65배 — 반드시 폭 이상이라 풀 레이즈가 된다
    const inc = roundUnit(raiseSize * (1.05 + rng.next() * 1.6), u)
    const to = currentBet + inc
    wagers.push({ to })
    raiseSize = to - currentBet
    currentBet = to
  }

  const frac = opts.shortFraction ?? { min: 0.05, max: 0.4 }
  for (let i = 0; i < shorts; i++) {
    // 폭에 못 미쳐야 한다. 미달 여부는 아래에서 엔진(isFullRaise)이 확인한다
    let inc = roundUnit(raiseSize * (frac.min + rng.next() * (frac.max - frac.min)), u)
    if (inc >= raiseSize) inc = u
    wagers.push({ to: currentBet + inc, allIn: true })
    currentBet += inc
  }

  const chain = replayPreflop(bb, wagers)
  if (chain === null) return null

  // 만들려던 것과 엔진이 센 것이 다르면 이 판은 전제가 깨진 것이다. 버린다.
  if (chain.shortAllIns !== shorts || chain.fullRaises !== fullRaises) return null
  return chain
}

/**
 * 연쇄를 좌석 배열로 옮긴다.
 *
 * **아직 액션하지 않은 좌석도 자리를 차지해야 한다.** 액션한 사람만 그리면
 * "누구 차례인가"가 안 보이고, 그러면 화면이 로그와 다를 게 없어진다.
 */
export function chainSeats(
  chain: PreflopChain,
  opts: { heroSeat: number; waitingName?: string },
): ActionSeat[] {
  const bets = chain.state.seats.map((s) => s.bet)

  const seats: ActionSeat[] = [
    // 좌석 이름이 이미 SB·BB 다. "스몰블라인드"를 덧붙이면 좌석 폭에서 두 줄로 깨진다
    { name: 'SB', bet: bets[0], act: '블라인드', blind: true },
    { name: 'BB', bet: bets[1], act: '블라인드', blind: true },
  ]

  chain.rows.forEach((row, i) => {
    const seat = i + 2
    seats.push({
      name: row.who,
      bet: bets[seat],
      act: row.act,
      allIn: row.allIn,
      hero: seat === opts.heroSeat,
    })
  })

  if (opts.waitingName !== undefined) {
    seats.push({ name: opts.waitingName, bet: 0, act: '차례', waiting: true, hero: true })
  }
  return seats
}

/** 빅블라인드 포스트를 로그 맨 앞에 세운다 — 프리플랍의 오픈 벳이 그것이기 때문이다. */
export function chainRows(chain: PreflopChain): LogRow[] {
  return [{ who: 'BB', act: '빅블라인드', amount: chain.bb }, ...chain.rows]
}
