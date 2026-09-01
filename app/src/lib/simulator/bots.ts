/**
 * 봇의 배역과 액션 정책.
 *
 * 오케스트레이터(generate.ts)는 "언제 누구에게 묻는가"를 정하고, 이 파일은
 * "무엇을 하기로 정하는가"를 정한다. 둘을 한 파일에 두면 라운드 진행 규칙과
 * 봇의 성향이 뒤엉켜, 봇을 손볼 때마다 절차 코드를 다시 읽어야 한다.
 *
 * 배역 배정(pickStacks)이 여기 있는 이유: 스택 금액과 배역은 같은 결정이다.
 * 8,000 과 12,500 이라는 숫자는 "서로 다른 금액으로 올인해서 팟을 가른다"는
 * 배역 그 자체이지 테이블 설정이 아니다.
 *
 * 무작위성은 전부 호출자가 넘긴 Rng 하나를 통과한다 — Math.random() 금지.
 */
import type { Rng } from './rng'
import { nlh } from './rulesets/nlh'
import type { BettingContext } from './rulesets/types'
import type { HandEvent, HandState, PlayerAction, Street } from './types'

/** 배역이 성립하는 스택 금액들. 전부 100 단위라 팟이 칩 단위 아래로 쪼개지지 않는다. */
const STACK_UNITS = [8000, 12500, 19000, 25000, 31500, 47000, 62000, 88000]

/**
 * 사이드팟이 나오도록 심은 배역.
 * "올인 이벤트가 2번 나온다"는 사이드팟의 대리 지표일 뿐이라 확률에 맡기면 안 된다.
 * 누가 쏘고 누가 받는지를 좌석으로 확정해야 계약이 계약이 된다.
 */
export type StackPlan = {
  stacks: number[]
  /** 프리플랍에 무조건 올인하는 숏스택 두 자리 */
  shoveSeats: number[]
  /** 두 올인을 모두 커버하며 반드시 콜하는 자리 */
  coverSeat: number | null
  /** 어느 스트리트에서도 폴드하지 않아 반드시 쇼다운까지 가는 두 자리 */
  showdownSeats: number[]
}

/** 서로 다른 좌석 k 개를 결정론적으로 고른다. */
function pickDistinctSeats(rng: Rng, count: number, k: number): number[] {
  const pool = Array.from({ length: count }, (_, i) => i)
  const out: number[] = []
  for (let i = 0; i < k; i++) out.push(...pool.splice(rng.int(pool.length), 1))
  return out
}

export function pickStacks(rng: Rng, count: number, needAllin: boolean, needShowdown: boolean): StackPlan {
  const stacks: number[] = []
  for (let i = 0; i < count; i++) stacks.push(rng.pick(STACK_UNITS))
  if (!needAllin) {
    // 쇼다운만 요구되면 끝까지 폴드하지 않는 두 자리를 심는 것으로 충분하다.
    const showdownSeats = needShowdown ? pickDistinctSeats(rng, count, 2) : []
    return { stacks, shoveSeats: [], coverSeat: null, showdownSeats }
  }

  // 서로 다른 금액의 올인 두 개 + 둘 다 커버하는 한 명
  const [a, b, c] = pickDistinctSeats(rng, count, 3)
  stacks[a] = 8000
  stacks[b] = 12500
  stacks[c] = 47000
  /*
   * 두 배역은 충돌하지 않는다 — calculation 이 showdown 을 함의한다. 숏스택 둘은
   * 프리플랍에 올인하므로 폴드할 수 없고 그래서 언제나 쇼다운까지 간다. 좌석을 새로
   * 뽑으면 오히려 한 좌석에 두 배역이 배정돼 서로를 덮어쓴다. 같은 좌석을 쇼다운
   * 배역으로도 지정해 두면, 미콜 반환으로 올인이 풀리는 경로에서도 폴드하지 않는다
   * (return_uncalled 는 allIn 을 결과 스택에서 다시 유도한다).
   */
  return { stacks, shoveSeats: [a, b], coverSeat: c, showdownSeats: needShowdown ? [a, b] : [] }
}

export type BotContext = {
  rng: Rng
  bb: number
  currentBet: number
  lastRaiseSize: number
  isOpenBet: boolean
  /**
   * 이 좌석이 이번 라운드에 이미 액션했는지. **"레이즈할 수 있는가"가 아니다** —
   * 그 결론은 룰셋의 `canReopen` 이 낸다 (제35조 4항). 봇이 결론을 받아 쓰면
   * 리오픈 규칙의 사본이 여기 하나 더 생긴다.
   */
  hasActedThisRound: boolean
  plan: StackPlan
  street: Street
}

/** 봇 한 명의 액션 하나를 고른다. 반드시 그 시점에 합법인 액션만 만든다. */
export function decideAction(s: HandState, seat: number, d: BotContext): HandEvent {
  const st = s.seats[seat]
  const allinTo = st.bet + st.stack
  const toCall = d.currentBet - st.bet
  const act = (action: PlayerAction): HandEvent => ({ type: 'player_action', seat, action })

  // require 가 선언한 것은 계약이다. 배역을 확률에 맡기면 어떤 시드에서 조용히 깨진다.
  const preflop = d.street === 'preflop'
  if (preflop && d.plan.shoveSeats.includes(seat)) return act({ kind: 'allin', to: allinTo })

  /*
   * 절대 폴드하지 않고 스택이 닿는 데까지 맞추는 배역 — 커버 좌석은 프리플랍에만,
   * 쇼다운 좌석은 모든 스트리트에서. 폴드 경로가 하나라도 남으면 계약이 확률로
   * 내려앉는다: 커버 좌석이 폴드하면 위쪽 올인이 미콜로 되돌아가 두 투입액이 같아져
   * 팟이 하나로 합쳐지고, 쇼다운 좌석이 폴드하면 쇼다운 없는 핸드가 돌아온다.
   */
  if ((preflop && d.plan.coverSeat === seat) || d.plan.showdownSeats.includes(seat)) {
    if (toCall === 0) return act({ kind: 'check' })
    return toCall >= st.stack ? act({ kind: 'allin', to: allinTo }) : act({ kind: 'call', to: d.currentBet })
  }

  const roll = d.rng.next()

  // 콜조차 스택을 넘으면 선택지는 올인 콜 아니면 폴드다
  if (toCall >= st.stack) return roll < 0.5 ? act({ kind: 'allin', to: allinTo }) : act({ kind: 'fold' })

  const ctx: BettingContext = {
    currentBet: d.currentBet,
    lastRaiseSize: d.lastRaiseSize,
    bigBlind: d.bb,
    seatBet: st.bet,
    seatStack: st.stack,
    isOpenBet: d.isOpenBet,
    hasActedThisRound: d.hasActedThisRound,
  }
  // 레이즈 권리는 규칙책에 묻는다. 여기서 판정하면 사본이 갈라진다.
  const canReopen = nlh.canReopen(ctx)
  const minTo = nlh.minRaiseTo(ctx)
  const aggress = (): HandEvent =>
    minTo >= allinTo
      ? act({ kind: 'allin', to: allinTo })
      : act({ kind: d.currentBet === 0 ? 'bet' : 'raise', to: minTo })

  if (toCall === 0) {
    if (!canReopen || roll < 0.6) return act({ kind: 'check' })
    return aggress()
  }

  if (roll < 0.42) return act({ kind: 'fold' })
  if (!canReopen || roll < 0.86) return act({ kind: 'call', to: d.currentBet })
  return aggress()
}
