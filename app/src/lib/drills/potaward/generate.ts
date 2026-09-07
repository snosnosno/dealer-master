/**
 * 팟 분배 문제를 만든다.
 *
 * **먼저 만들고 그다음 보여준다.** 판을 하나 돌린 뒤 엔진에게 분배를 물어보고, 그 답이
 * 이번 문제의 유형에 맞으면 채택하고 아니면 다시 돌린다. 화면에 뜬 뒤에 답이 바뀔 자리가 없다.
 *
 * **판정은 전부 `awardPots` 의 지급표에서 읽는다.** 여기서 절반을 다시 계산하면
 * 엔진과 화면이 서로 다른 답을 갖게 되고, 그 어긋남은 훈련생에게만 보인다.
 *
 * 무작위는 `Rng` 로만 얻는다 — 여기서 `Math.random()` 을 쓰면 시드가 무의미해진다.
 */
import {
  awardPots, buildPots, createRng, makeDeck, shuffle, ODD_CHIP_UNIT,
  type Card, type HandEvaluator, type Pot, type PotAward, type Rng,
} from '@/lib/simulator'
import { evaluatorFor, type GameSpec } from '@/lib/games'
import {
  POTAWARD_KIND_LABEL, POTAWARD_LIMIT_SEC, POTAWARD_QUESTION_COUNT, POTAWARD_SEAT_COUNT,
  type PotAwardKind, type PotAwardQuestion, type PotAwardSeat,
} from './types'

const NAMES = ['1번', '2번', '3번', '4번']
/** 조건이 잘못됐을 때 무한 루프 대신 명확한 실패로 드러나게 하는 상한 */
const MAX_TRIES = 600
/** 투입액을 만드는 칩 단위. 100 단위 홀칩이 실제로 생기도록 잡았다 */
const STEP = 100

type Deal = {
  seats: PotAwardSeat[]
  board: Card[]
  /**
   * 홀칩 순서의 기준이다. **판을 돌리기 전에 뽑아 `awardPots` 에 그대로 넘긴다** —
   * 문제에 표시하는 버튼과 정답을 만든 버튼이 다르면 화면과 정답이 어긋난다.
   */
  buttonSeat: number
  pots: Pot[]
  awards: PotAward[]
}

/**
 * 한 판을 돌린다. 투입액을 좌석마다 다르게 주어 **사이드팟이 실제로 생기게** 한다 —
 * 전원 같은 금액이면 팟이 하나뿐이라 이 드릴의 절반이 성립하지 않는다.
 *
 * 층이 이렇게 잘린다: 짧은 올인 둘을 `a < b`, 나머지 둘을 `full` 이라 하면
 * 메인팟 `4a`(자격 넷) · 사이드팟 `3(b-a)`(자격 셋) · 사이드팟 `2(full-b)`(자격 둘).
 * 짝수 인원이 낸 층은 100 단위가 늘 짝수라 반으로 갈라도 남지 않는다 —
 * **홀칩 1차가 남는 자리는 가운데 층뿐이다.**
 */
function dealOnce(spec: GameSpec, rng: Rng, ev: HandEvaluator, buttonSeat: number): Deal {
  const deck = shuffle(makeDeck(), rng)
  const board = deck.slice(0, 5)
  const n = spec.holeCardCount

  // 층을 만든다: 낮은 올인 둘 + 나머지는 같은 높이
  const full = (20 + rng.int(40)) * STEP
  const contributed = NAMES.slice(0, POTAWARD_SEAT_COUNT).map((_, i) =>
    i < 2 ? (5 + rng.int(14)) * STEP : full,
  )
  const folded = contributed.map(() => false)

  const seats: PotAwardSeat[] = NAMES.slice(0, POTAWARD_SEAT_COUNT).map((name, i) => ({
    name,
    hole: deck.slice(5 + i * n, 5 + (i + 1) * n),
    contributed: contributed[i],
    folded: false,
    allIn: contributed[i] < full,
  }))

  const pots = buildPots(contributed, folded)
  const awards = awardPots(pots, seats.map((s) => s.hole), board, buttonSeat, ev)
  return { seats, board, buttonSeat, pots, awards }
}

/** 이 팟에서 `half` 를 받은 좌석들 */
function seatsOf(awards: PotAward[], potIndex: number, half: 'hi' | 'lo'): number[] {
  return awards.filter((a) => a.potIndex === potIndex && a.half === half).map((a) => a.seat)
}

/** 이 팟의 `half` 지급 합계 = 그 절반의 금액 */
function totalOf(awards: PotAward[], potIndex: number, half: 'hi' | 'lo'): number {
  return awards
    .filter((a) => a.potIndex === potIndex && a.half === half)
    .reduce((sum, a) => sum + a.amount, 0)
}

/** 이 팟이 실제로 반으로 갈렸는가. 로우 지급 줄이 있으면 갈린 것이다 */
function isSplit(awards: PotAward[], potIndex: number): boolean {
  return seatsOf(awards, potIndex, 'lo').length > 0
}

/**
 * 반으로 가르고 **남는 칩 한 개**가 하이에 얹힌 팟을 찾는다 (설계 §4-1 홀칩 1차).
 *
 * 셋을 다 만족해야 문제가 된다:
 * 1. 로우가 성립해 실제로 갈렸다 — 스쿱한 팟에는 「남는 칩」이 없다
 * 2. 하이 절반이 로우 절반보다 한 칩 크다 — 그 한 칩이 곧 홀칩이다
 * 3. 하이 임자가 **한 명이다** — 여럿이면 홀칩 2차(버튼 왼쪽 순서)가 겹쳐
 *    「남는 칩은 누구에게」의 답이 하나로 떨어지지 않는다
 *
 * 조건을 느슨하게 하면 통과는 하지만 **정답이 틀린 문제**가 나온다. 늘리지 마라.
 */
function oddChipHit(deal: Deal): { potIndex: number; seats: number[] } | null {
  for (let potIndex = 0; potIndex < deal.pots.length; potIndex++) {
    if (!isSplit(deal.awards, potIndex)) continue
    const rest = totalOf(deal.awards, potIndex, 'hi') - totalOf(deal.awards, potIndex, 'lo')
    if (rest !== ODD_CHIP_UNIT) continue
    const hi = seatsOf(deal.awards, potIndex, 'hi')
    if (hi.length !== 1) continue
    return { potIndex, seats: hi }
  }
  return null
}

/**
 * 자격자 중에 로우가 없어 **통째로** 하이에게 가는 사이드팟을 찾는다.
 *
 * 그 팟에 로우가 있으면 절반이 다른 데로 가므로 「이 사이드팟은 누가 가져갑니까」의
 * 정답이 둘이 된다 — 답이 하나여야 물을 수 있다.
 * 메인팟에는 로우가 있어야 「자격이 갈린다」는 대비가 산다 (설계 §4-3).
 */
function sidePotHit(deal: Deal): { potIndex: number; seats: number[] } | null {
  if (!isSplit(deal.awards, 0)) return null
  for (let potIndex = deal.pots.length - 1; potIndex >= 1; potIndex--) {
    // 자격자가 한 명뿐인 팟은 쇼다운이 없다 — 물어볼 것이 없다
    if (deal.pots[potIndex].eligibleSeats.length < 2) continue
    if (isSplit(deal.awards, potIndex)) continue
    const hi = seatsOf(deal.awards, potIndex, 'hi')
    if (hi.length > 0) return { potIndex, seats: hi }
  }
  return null
}

/**
 * 이 유형의 문제가 이 판에서 성립하는가. 성립하면 정답 좌석과 팟 번호를 낸다.
 * **성립하지 않으면 `null`** — 호출자가 판을 다시 돌린다.
 */
function tryBuild(deal: Deal, kind: PotAwardKind): { potIndex: number; seats: number[] } | null {
  switch (kind) {
    case 'hihalf': {
      // 갈리지 않은 팟에 「하이 절반」을 물으면 정답 좌석은 맞아도 없는 절반을 가르친다
      if (!isSplit(deal.awards, 0)) return null
      const seats = seatsOf(deal.awards, 0, 'hi')
      return seats.length > 0 ? { potIndex: 0, seats } : null
    }
    case 'lohalf': {
      const seats = seatsOf(deal.awards, 0, 'lo')
      // 로우가 성립한 판에서만 낸다 — 「로우 없음」은 승자 판독의 몫이다
      return seats.length > 0 ? { potIndex: 0, seats } : null
    }
    case 'oddchip':
      return oddChipHit(deal)
    case 'sidepot':
      return sidePotHit(deal)
  }
}

const PROMPT: Record<PotAwardKind, string> = {
  hihalf: '이 팟의 하이 절반은 누가 가져갑니까?',
  lohalf: '이 팟의 로우 절반은 누가 가져갑니까?',
  oddchip: '이 팟을 반으로 가르고 남는 칩은 누구에게 갑니까?',
  sidepot: '이 사이드팟은 누가 가져갑니까?',
}

const won = (n: number) => n.toLocaleString('ko-KR')
const names = (seats: PotAwardSeat[], picks: number[]) =>
  picks.map((i) => seats[i].name).join(' · ')

/**
 * 채점 후 보여주는 근거 한 줄. **금액도 엔진의 지급표에서 읽는다** —
 * 여기서 절반을 다시 계산하면 근거가 정답과 어긋날 수 있다.
 */
function whyOf(deal: Deal, kind: PotAwardKind, potIndex: number, answerSeats: number[]): string {
  const who = names(deal.seats, answerSeats)
  const amount = deal.pots[potIndex].amount
  switch (kind) {
    case 'hihalf':
      return `하이 절반 ${won(totalOf(deal.awards, potIndex, 'hi'))} 은 ${who}에게 간다`
    case 'lohalf':
      return `로우 절반 ${won(totalOf(deal.awards, potIndex, 'lo'))} 은 ${who}에게 간다`
    case 'oddchip':
      // 출처: docs/references/mixgame-facts.md 「홀칩은 Hi 승자에게」(가이드 p5)
      return `${won(amount)} 을 반으로 가르면 ${won(ODD_CHIP_UNIT)} 이 남는다 — 홀칩은 하이 승자에게 가므로 ${who}다`
    case 'sidepot':
      return `이 사이드팟 ${won(amount)} 은 자격자 중에 로우가 없어 하이 ${who}가 통째로 가져간다`
  }
}

function build(
  deal: Deal, kind: PotAwardKind, potIndex: number, answerSeats: number[],
): PotAwardQuestion {
  return {
    kind,
    limitSec: POTAWARD_LIMIT_SEC[kind],
    label: POTAWARD_KIND_LABEL[kind],
    prompt: PROMPT[kind],
    seats: deal.seats,
    board: deal.board,
    buttonSeat: deal.buttonSeat,
    pots: deal.pots,
    potIndex,
    answerSeats,
    why: whyOf(deal, kind, potIndex, answerSeats),
  }
}

/**
 * 열 문제의 유형 배분. **미리 정해 두면 시드와 무관하게 보장된다.**
 * 순서는 섞는다 — 늘 같은 자리에 같은 유형이 오면 답을 위치로 짐작한다.
 */
function kindTargets(rng: Rng): PotAwardKind[] {
  const targets: PotAwardKind[] = [
    'sidepot', 'sidepot', 'sidepot',
    'lohalf', 'lohalf', 'lohalf',
    'oddchip', 'oddchip',
    'hihalf', 'hihalf',
  ]
  if (targets.length !== POTAWARD_QUESTION_COUNT) {
    throw new Error(`유형 배분이 문제 수와 다르다: ${targets.length} ≠ ${POTAWARD_QUESTION_COUNT}`)
  }
  for (let i = targets.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = targets[i]
    targets[i] = targets[j]
    targets[j] = tmp
  }
  return targets
}

export function generatePotAwardRun(spec: GameSpec, seed: string): PotAwardQuestion[] {
  const ev = evaluatorFor(spec)
  if (ev.rankLo === null) {
    throw new Error('로우가 없는 종목의 팟 분배는 아직 없다 — 하이 전용 드릴이 따로 필요하다')
  }

  const rng = createRng(seed)
  return kindTargets(rng).map((kind) => {
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      // 버튼을 판보다 먼저 뽑는다 — 홀칩 순서가 버튼에 걸려 있어서, 나중에 뽑으면
      // 정답을 만든 버튼과 문제에 표시하는 버튼이 달라진다
      const buttonSeat = rng.int(POTAWARD_SEAT_COUNT)
      const deal = dealOnce(spec, rng, ev, buttonSeat)
      const hit = tryBuild(deal, kind)
      if (hit !== null) return build(deal, kind, hit.potIndex, hit.seats)
    }
    throw new Error(`문제를 만들지 못했다 — 유형 ${kind}, 시도 ${MAX_TRIES}회`)
  })
}
