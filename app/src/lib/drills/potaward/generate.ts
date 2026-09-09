/**
 * 팟 분배 문제를 만든다.
 *
 * **먼저 만들고 그다음 보여준다.** 판을 하나 돌린 뒤 엔진에게 분배를 물어보고, 그 답이
 * 이번 문제의 유형에 맞으면 채택하고 아니면 다시 돌린다. 화면에 뜬 뒤에 답이 바뀔 자리가 없다.
 *
 * **판정도 금액도 전부 `awardPots` 의 지급표에서 읽는다.** 여기서 절반을 다시 계산하면
 * 엔진과 화면이 서로 다른 답을 갖게 되고, 그 어긋남은 훈련생에게만 보인다.
 *
 * 무작위는 `Rng` 로만 얻는다 — 여기서 `Math.random()` 을 쓰면 시드가 무의미해진다.
 */
import {
  awardPots, buildPots, createRng, makeDeck, shuffle, ODD_CHIP_UNIT,
  type Card, type HandEvaluator, type Pot, type PotAward, type Rng,
} from '@/lib/simulator'
import { evaluatorFor, type GameSpec } from '@/lib/games'
import { potName } from './potname'
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
   *
   * **이 어긋남을 막는 것은 테스트가 아니라 이 필드 하나다.** 뽑는 곳부터 문제에
   * 실리는 곳까지 `buttonSeat` 의 출처가 하나뿐이라 구조적으로 갈라질 수 없다.
   *
   * 지금 테스트로는 못 잡는다. `orderFromButton`(`simulator/pots.ts`)은 동점 집단이
   * 칩을 **받는 순서**만 바꿀 뿐 임자 집합을 바꾸지 않는다. 그런데 지금 네 유형의 정답은
   * 전부 좌석 **집합**이거나(`hihalf`·`lohalf`·`sidepot`) 하이가 한 명인 경우(`oddchip`)라
   * **버튼이 무엇이든 같다.** 버튼을 두 번 뽑는 회귀가 나도 테스트는 초록이다 —
   * 못 실패하는 테스트를 흉내로 넣지 않고 이 주석을 둔다.
   *
   * **버튼 순서에 답이 걸리는 유형을 새로 만들면**(예: 홀칩 2차 — 「이 절반을 나누고
   * 남는 칩은 누구부터」) 그 유형의 정답이 버튼에 따라 달라지는 것을 검사하는 테스트를
   * 반드시 함께 넣어라. 그때부터 이 필드가 진짜로 위험해진다.
   */
  buttonSeat: number
  pots: Pot[]
  awards: PotAward[]
}

/**
 * 한 판을 돌린다. `layers` 만큼 팟이 쌓이게 투입액을 자른다 —
 * 1이면 메인팟만, 2면 세컨드팟까지, 3이면 서드팟까지다.
 *
 * 짧은 올인 금액은 **서로 달라야** 한다. 같으면 층이 하나로 합쳐져 부탁한 층 수가
 * 나오지 않는다 (`buildPots` 가 자격자 집합이 같은 층을 병합한다). 예전 생성기가
 * 늘 셋을 노리면서도 가끔 둘이 나온 이유가 이것이었다.
 *
 * 층이 이렇게 잘린다: 짧은 올인 둘을 `a < b`, 나머지 둘을 `full` 이라 하면
 * 메인팟 `4a`(자격 넷) · 세컨드팟 `3(b-a)`(자격 셋) · 서드팟 `2(full-b)`(자격 둘).
 * 짝수 인원이 낸 층은 100 단위가 늘 짝수라 반으로 갈라도 남지 않는다 —
 * **홀칩 1차가 남는 자리는 홀수 인원이 낸 층뿐이다.**
 */
function dealOnce(
  spec: GameSpec, rng: Rng, ev: HandEvaluator, buttonSeat: number, layers: number,
): Deal | null {
  const deck = shuffle(makeDeck(), rng)
  const board = deck.slice(0, 5)
  const n = spec.holeCardCount

  const full = (20 + rng.int(40)) * STEP
  // 층 하나당 올인 하나. 금액이 겹치면 층이 합쳐지므로 서로 다른 값만 받는다
  const shorts: number[] = []
  for (let guard = 0; shorts.length < layers - 1; guard++) {
    if (guard > 50) return null
    const v = (5 + rng.int(14)) * STEP
    if (!shorts.includes(v)) shorts.push(v)
  }

  const contributed = NAMES.slice(0, POTAWARD_SEAT_COUNT).map((_, i) =>
    i < shorts.length ? shorts[i] : full,
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
  // 부탁한 층이 안 나왔으면 이 판은 버린다 — 문제 유형이 층 수에 걸려 있다
  if (pots.length !== layers) return null

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

/** 이 문제가 어느 팟의 무엇을 묻는가 */
type Hit = { potIndex: number; seats: number[]; amount: number }

/** 후보가 여럿이면 하나를 고른다. **늘 첫 층만 고르면 세컨드팟을 묻는 판이 안 나온다** */
function pickOne(rng: Rng, hits: Hit[]): Hit | null {
  return hits.length === 0 ? null : hits[rng.int(hits.length)]
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
function oddChipHits(deal: Deal): Hit[] {
  const hits: Hit[] = []
  for (let potIndex = 0; potIndex < deal.pots.length; potIndex++) {
    if (!isSplit(deal.awards, potIndex)) continue
    const hi = totalOf(deal.awards, potIndex, 'hi')
    if (hi - totalOf(deal.awards, potIndex, 'lo') !== ODD_CHIP_UNIT) continue
    const seats = seatsOf(deal.awards, potIndex, 'hi')
    if (seats.length !== 1) continue
    // 홀칩을 쥔 사람이 실제로 받아 가는 돈 — 절반에 남는 칩이 얹힌 값이다
    hits.push({ potIndex, seats, amount: hi })
  }
  return hits
}

/**
 * 자격자 중에 로우가 없어 **통째로** 하이에게 가는 위층 팟을 찾는다.
 *
 * 그 팟에 로우가 있으면 절반이 다른 데로 가므로 「이 팟은 누가 가져갑니까」의
 * 정답이 둘이 된다 — 답이 하나여야 물을 수 있다.
 * 메인팟에는 로우가 있어야 「자격이 갈린다」는 대비가 산다 (설계 §4-3).
 */
function sidePotHits(deal: Deal): Hit[] {
  if (!isSplit(deal.awards, 0)) return []
  const hits: Hit[] = []
  for (let potIndex = 1; potIndex < deal.pots.length; potIndex++) {
    // 자격자가 한 명뿐인 팟은 쇼다운이 없다 — 물어볼 것이 없다
    if (deal.pots[potIndex].eligibleSeats.length < 2) continue
    if (isSplit(deal.awards, potIndex)) continue
    const seats = seatsOf(deal.awards, potIndex, 'hi')
    if (seats.length > 0) hits.push({ potIndex, seats, amount: deal.pots[potIndex].amount })
  }
  return hits
}

/** 갈린 팟의 한쪽 절반. **메인팟만이 아니다** — 세컨드팟의 절반도 딜러가 가른다 */
function halfHits(deal: Deal, half: 'hi' | 'lo'): Hit[] {
  const hits: Hit[] = []
  for (let potIndex = 0; potIndex < deal.pots.length; potIndex++) {
    // 갈리지 않은 팟에 「하이 절반」을 물으면 정답 좌석은 맞아도 없는 절반을 가르친다
    if (!isSplit(deal.awards, potIndex)) continue
    const seats = seatsOf(deal.awards, potIndex, half)
    if (seats.length > 0) hits.push({ potIndex, seats, amount: totalOf(deal.awards, potIndex, half) })
  }
  return hits
}

/**
 * 이 유형의 문제가 이 판에서 성립하는가. 성립하면 팟 번호·정답 좌석·금액을 낸다.
 * **성립하지 않으면 `null`** — 호출자가 판을 다시 돌린다.
 */
function tryBuild(deal: Deal, kind: PotAwardKind, rng: Rng): Hit | null {
  switch (kind) {
    case 'hihalf':
      return pickOne(rng, halfHits(deal, 'hi'))
    case 'lohalf':
      // 로우가 성립한 팟에서만 낸다 — 「로우 없음」은 승자 판독의 몫이다
      return pickOne(rng, halfHits(deal, 'lo'))
    case 'oddchip':
      return pickOne(rng, oddChipHits(deal))
    case 'sidepot':
      return pickOne(rng, sidePotHits(deal))
  }
}

/**
 * 이 유형이 성립하려면 팟이 몇 층이어야 하나.
 *
 * 사이드팟은 위층이 있어야 하고, 홀칩 1차는 **홀수 인원이 낸 층**이 있어야 남는다 —
 * 네 명이 똑같이 낸 메인팟은 100 단위가 늘 짝수라 반으로 갈라도 남지 않는다.
 * 그 둘에 1층을 허용하면 600번을 돌고도 못 만들어 판 생성이 통째로 실패한다.
 */
function layersFor(rng: Rng, kind: PotAwardKind): number {
  return kind === 'sidepot' || kind === 'oddchip' ? 2 + rng.int(2) : 1 + rng.int(3)
}

const PROMPT: Record<PotAwardKind, string> = {
  hihalf: '이 팟의 하이 절반은 누가, 얼마를 가져갑니까?',
  lohalf: '이 팟의 로우 절반은 누가, 얼마를 가져갑니까?',
  oddchip: '이 팟을 반으로 가르고 남는 칩은 누구에게 갑니까?',
  sidepot: '이 팟은 누가, 얼마를 가져갑니까?',
}

/** 금액칸 위에 붙는 이름. 무엇을 넣으라는 것인지 여기서만 말한다 */
const AMOUNT_LABEL: Record<PotAwardKind, string> = {
  hihalf: '하이 절반 금액',
  lohalf: '로우 절반 금액',
  oddchip: '그 사람이 받는 금액 (홀칩 포함)',
  sidepot: '이 팟 금액',
}

const won = (n: number) => n.toLocaleString('ko-KR')
/**
 * 정답 좌석들의 이름. **끝은 언제나 「번」이다** (`NAMES`) — 받침이 있으므로 뒤에 붙는
 * 조사는 「이다」·「이」다. 「1번다」·「1번가」로 되돌리지 마라.
 * 금액도 100 단위라 마지막 음절이 백·천·만 중 하나여서 받침이 있다 — 「은」·「을」·「이」다.
 * 조사는 앞말에 붙여 쓴다.
 */
const names = (seats: PotAwardSeat[], picks: number[]) =>
  picks.map((i) => seats[i].name).join(' · ')

/**
 * 채점 후 보여주는 근거 한 줄. **금액도 엔진의 지급표에서 읽는다** —
 * 여기서 절반을 다시 계산하면 근거가 정답과 어긋날 수 있다.
 * 층 이름을 함께 적는다 — 어느 팟 이야기인지가 근거의 절반이다.
 */
function whyOf(deal: Deal, kind: PotAwardKind, hit: Hit): string {
  const who = names(deal.seats, hit.seats)
  const pot = potName(hit.potIndex)
  const amount = deal.pots[hit.potIndex].amount
  switch (kind) {
    case 'hihalf':
      return `${pot} ${won(amount)}의 하이 절반 ${won(hit.amount)}은 ${who}에게 간다`
    case 'lohalf':
      return `${pot} ${won(amount)}의 로우 절반 ${won(hit.amount)}은 ${who}에게 간다`
    case 'oddchip':
      // 출처: docs/references/mixgame-facts.md 「홀칩은 Hi 승자에게」(가이드 p5)
      return (
        `${pot} ${won(amount)}을 반으로 가르면 ${won(ODD_CHIP_UNIT)}이 남는다 — ` +
        `홀칩은 하이 승자에게 가므로 ${who}이 ${won(hit.amount)}을 받는다`
      )
    case 'sidepot':
      return `${pot} ${won(hit.amount)}은 자격자 중에 로우가 없어 하이 ${who}이 통째로 가져간다`
  }
}

function build(deal: Deal, kind: PotAwardKind, hit: Hit): PotAwardQuestion {
  return {
    kind,
    limitSec: POTAWARD_LIMIT_SEC[kind],
    label: POTAWARD_KIND_LABEL[kind],
    prompt: PROMPT[kind],
    seats: deal.seats,
    board: deal.board,
    buttonSeat: deal.buttonSeat,
    pots: deal.pots,
    potIndex: hit.potIndex,
    answerSeats: hit.seats,
    answerAmount: hit.amount,
    amountLabel: AMOUNT_LABEL[kind],
    why: whyOf(deal, kind, hit),
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
      // 정답을 만든 버튼과 문제에 표시하는 버튼이 달라진다.
      // 이 한 줄이 유일한 출처라는 것이 그 어긋남을 막는 전부다 — 자세한 사정과
      // 새 유형을 만들 때 지켜야 할 것은 `Deal.buttonSeat` 주석에 있다.
      const buttonSeat = rng.int(POTAWARD_SEAT_COUNT)
      const deal = dealOnce(spec, rng, ev, buttonSeat, layersFor(rng, kind))
      if (deal === null) continue
      const hit = tryBuild(deal, kind, rng)
      if (hit !== null) return build(deal, kind, hit)
    }
    throw new Error(`문제를 만들지 못했다 — 유형 ${kind}, 시도 ${MAX_TRIES}회`)
  })
}
