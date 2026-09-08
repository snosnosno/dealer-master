/**
 * 팟리밋 계산 문제를 만든다.
 *
 * **정답은 룰셋이 낸다.** 여기서 산식을 다시 쓰면 규칙이 두 곳에 살고, 두 곳은 갈라진다.
 * 이 파일이 하는 일은 「그럴듯한 판을 차리는 것」까지다.
 *
 * 금액은 `action-rush/money.ts` 를 재사용한다 — 그 블라인드 레벨에 실제로 있을 법한
 * 값이라야 훈련생이 보는 그림이 현실과 같다.
 */
import { createRng, pl, type Rng } from '@/lib/simulator'
import type { GameSpec } from '@/lib/games'
import { BLINDS, fmt, roundUnit, unitFor } from '@/lib/action-rush/money'
import {
  POTLIMIT_KIND_LABEL, POTLIMIT_LIMIT_SEC, POTLIMIT_SEAT_COUNT,
  type PotLimitKind, type PotLimitQuestion, type PotLimitSeat,
} from './types'

const NAMES = ['1번', '2번', '3번', '4번']
const won = fmt

/** 유형 배분. 팟까지 레이즈가 더 어렵고 더 자주 틀리므로 비중을 둔다 */
function kindTargets(rng: Rng): PotLimitKind[] {
  const targets: PotLimitKind[] = [
    'potbet', 'potbet', 'potbet', 'potbet',
    'potraise', 'potraise', 'potraise', 'potraise', 'potraise', 'potraise',
  ]
  for (let i = targets.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = targets[i]
    targets[i] = targets[j]
    targets[j] = tmp
  }
  return targets
}

function makeOne(rng: Rng, kind: PotLimitKind): PotLimitQuestion {
  const bb = rng.pick(BLINDS)
  const unit = unitFor(bb)
  const buttonSeat = rng.int(POTLIMIT_SEAT_COUNT)
  const heroSeat = rng.int(POTLIMIT_SEAT_COUNT)

  // 이미 가운데로 수거된 팟 — 앞선 스트릿에서 온 돈이다
  const collected = roundUnit(bb * (3 + rng.int(10)), unit)

  const seats: PotLimitSeat[] = NAMES.slice(0, POTLIMIT_SEAT_COUNT).map((name) => ({
    name,
    bet: 0,
    folded: false,
  }))

  let currentBet = 0
  let bettorSeat = -1
  if (kind === 'potraise') {
    // 앞선 벳을 실제로 화면에 놓는다. 히어로가 아닌 좌석이어야 한다
    bettorSeat = (heroSeat + 1 + rng.int(POTLIMIT_SEAT_COUNT - 1)) % POTLIMIT_SEAT_COUNT
    currentBet = roundUnit(collected * (0.5 + rng.int(3) * 0.25), unit)
    seats[bettorSeat] = { ...seats[bettorSeat], bet: currentBet }
  }

  const onTable = collected + seats.reduce((sum, s) => sum + s.bet, 0)
  const answer = pl.maxRaiseTo({
    currentBet,
    lastRaiseSize: 0,
    bigBlind: bb,
    seatBet: seats[heroSeat].bet,
    seatStack: 100_000_000, // 스택 제약 없이 「규정이 정하는 최대」를 묻는다
    isOpenBet: currentBet === 0,
    hasActedThisRound: false,
    pot: onTable,
  })

  const callAmt = currentBet - seats[heroSeat].bet
  const why =
    kind === 'potbet'
      ? `앞에 벳이 없으면 콜 금액이 0이라 팟벳은 팟 금액 그대로인 ${won(answer)}이다. ` +
        '공식은 같다 — 콜 0 + 콜한 뒤 팟.'
      : `먼저 콜 ${won(callAmt)}을 넣는다. 그러면 팟이 ${won(onTable)} + ${won(callAmt)} = ` +
        `${won(onTable + callAmt)}이 되고, 거기에 콜 금액을 더해 ${won(answer)}이다.`

  return {
    kind,
    limitSec: POTLIMIT_LIMIT_SEC[kind],
    label: POTLIMIT_KIND_LABEL[kind],
    prompt:
      kind === 'potbet'
        ? `${seats[heroSeat].name}이 팟벳을 하면 얼마입니까?`
        : `${seats[heroSeat].name}이 팟까지 레이즈하면 얼마를 냅니까?`,
    seats,
    buttonSeat,
    collected,
    heroSeat,
    answer,
    why,
  }
}

export function generatePotLimitRun(spec: GameSpec, seed: string): PotLimitQuestion[] {
  // **코드값으로만 갈린다** — 표시 라벨을 읽지 않는다 (전역 제약 4)
  if (spec.betting !== 'PL') {
    throw new Error(`팟리밋 계산은 팟리밋 종목에만 있다: ${spec.betting}`)
  }
  const rng = createRng(seed)
  return kindTargets(rng).map((kind) => makeOne(rng, kind))
}
