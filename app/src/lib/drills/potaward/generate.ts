/**
 * 팟 분배 문제를 만든다.
 *
 * **먼저 만들고 그다음 보여준다.** 판을 하나 돌린 뒤 엔진에게 분배를 물어보고, 그 판이
 * 이번 문제가 요구하는 모양이면 채택하고 아니면 다시 돌린다. 화면에 뜬 뒤에 답이 바뀔 자리가 없다.
 *
 * **임자는 전부 `awardPots` 의 지급표에서 읽는다.** 여기서 하이·로우를 다시 가리면
 * 엔진과 화면이 서로 다른 답을 갖게 되고, 그 어긋남은 훈련생에게만 보인다.
 *
 * 무작위는 `Rng` 로만 얻는다 — 여기서 `Math.random()` 을 쓰면 시드가 무의미해진다.
 */
import {
  awardPots, buildPots, createRng, makeDeck, shuffle,
  type Card, type HandEvaluator, type Pot, type PotAward, type Rng,
} from '@/lib/simulator'
import { evaluatorFor, type GameSpec } from '@/lib/games'
import { potName } from './potname'
import {
  POTAWARD_KIND_LABEL, POTAWARD_KIND_QUOTA, POTAWARD_LAYERS, POTAWARD_LIMIT_SEC,
  POTAWARD_NO_LOW_MIN, POTAWARD_QUESTION_COUNT, POTAWARD_SCOOP_MIN, POTAWARD_SEAT_COUNT,
  type PotAwardKind, type PotAwardPotAnswer, type PotAwardQuestion, type PotAwardSeat,
} from './types'

const NAMES = ['1번', '2번', '3번', '4번']
/** 조건이 잘못됐을 때 무한 루프 대신 명확한 실패로 드러나게 하는 상한 */
const MAX_TRIES = 600
/** 투입액을 만드는 칩 단위. 층이 100 단위로 떨어지게 잡았다 */
const STEP = 100

type Deal = {
  seats: PotAwardSeat[]
  board: Card[]
  /**
   * 홀칩 순서의 기준이라 `awardPots` 에 넘긴다. **답을 바꾸지는 않는다** —
   * `orderFromButton`(`simulator/pots.ts`)은 동점 집단이 칩을 **받는 순서**만 정하고
   * 임자 집합은 건드리지 않는다. 이 드릴은 이제 금액이 아니라 임자만 묻으므로
   * 버튼이 무엇이든 정답이 같다. 화면의 D 배지와 같은 값을 쓰는 것으로 족하다.
   *
   * **금액을 다시 묻는 유형을 만들면** 그때부터 버튼이 답에 걸린다 — 뽑는 곳과
   * 문제에 실리는 곳이 하나여야 하고, 버튼에 따라 답이 달라지는 것을 검사하는
   * 테스트를 반드시 함께 넣어라.
   */
  buttonSeat: number
  pots: Pot[]
  awards: PotAward[]
  answers: PotAwardPotAnswer[]
}

/** 이 팟에서 `half` 를 받은 좌석들 — 좌석 번호 오름차순 */
function seatsOf(awards: PotAward[], potIndex: number, half: 'hi' | 'lo'): number[] {
  return awards
    .filter((a) => a.potIndex === potIndex && a.half === half)
    .map((a) => a.seat)
    .sort((a, b) => a - b)
}

/** 이 팟의 `half` 지급 합계 = 그 절반의 금액 */
function totalOf(awards: PotAward[], potIndex: number, half: 'hi' | 'lo'): number {
  return awards
    .filter((a) => a.potIndex === potIndex && a.half === half)
    .reduce((sum, a) => sum + a.amount, 0)
}

/**
 * 한 판을 돌린다. `layers` 만큼 팟이 쌓이게 투입액을 자른다 —
 * 1이면 메인팟만, 2면 세컨드팟까지, 3이면 서드팟까지다.
 *
 * 짧은 올인 금액은 **서로 달라야** 한다. 같으면 층이 하나로 합쳐져 부탁한 층 수가
 * 나오지 않는다 (`buildPots` 가 자격자 집합이 같은 층을 병합한다).
 *
 * 층이 이렇게 잘린다: 짧은 올인 둘을 `a < b`, 나머지 둘을 `full` 이라 하면
 * 메인팟 `4a`(자격 넷) · 세컨드팟 `3(b-a)`(자격 셋) · 서드팟 `2(full-b)`(자격 둘).
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
  const answers = pots.map((_, i) => ({
    hi: seatsOf(awards, i, 'hi'),
    lo: seatsOf(awards, i, 'lo'),
  }))
  // 임자 없는 팟은 답이 없다. 엔진이 늘 임자를 내지만, 냈는지 여기서 확인한다
  if (answers.some((a) => a.hi.length === 0)) return null

  return { seats, board, buttonSeat, pots, awards, answers }
}

/** 한 사람이 이 팟의 하이·로우를 다 가져가나 */
function isScoop(a: PotAwardPotAnswer): boolean {
  return a.hi.length === 1 && a.lo.length === 1 && a.hi[0] === a.lo[0]
}

/**
 * 이 문제가 요구하는 판의 모양.
 * `null` 이면 아무 판이나 좋다 — 그 자리에서 스플릿·쿼터가 자연히 나온다.
 */
type Feature = 'scoop' | 'nolow' | null

function matches(deal: Deal, feature: Feature): boolean {
  switch (feature) {
    case 'scoop':
      // 어느 층에서든 한 사람이 통째로 가져가는 판
      return deal.answers.some(isScoop)
    case 'nolow':
      // 자격 있는 로우가 아무 층에도 없는 판 — 하이가 전부 가져간다
      return deal.answers.every((a) => a.lo.length === 0)
    case null:
      return true
  }
}

const won = (n: number) => n.toLocaleString('ko-KR')
/**
 * 좌석 이름들. **끝은 언제나 「번」이다** (`NAMES`) — 받침이 있으므로 뒤에 붙는
 * 조사는 「이다」·「이」다. 「1번다」·「1번가」로 되돌리지 마라.
 * 금액도 100 단위라 마지막 음절이 백·천·만 중 하나여서 받침이 있다 — 「은」·「을」·「이」다.
 */
const names = (seats: PotAwardSeat[], picks: number[]) =>
  picks.map((i) => seats[i].name).join(' · ')

/**
 * 팟 하나의 근거 한 줄. **금액도 엔진의 지급표에서 읽는다** —
 * 여기서 절반을 다시 계산하면 근거가 정답과 어긋날 수 있다.
 */
function reasonFor(deal: Deal, potIndex: number): string {
  const a = deal.answers[potIndex]
  const head = `${potName(potIndex)} ${won(deal.pots[potIndex].amount)}`
  if (isScoop(a)) {
    return `${head} — ${names(deal.seats, a.hi)}이 하이·로우를 다 가져간다 (스쿱)`
  }
  const hi = `하이 ${names(deal.seats, a.hi)} ${won(totalOf(deal.awards, potIndex, 'hi'))}`
  if (a.lo.length === 0) {
    return `${head} — 자격 있는 로우가 없어 ${hi} 이 통째로`
  }
  return `${head} — ${hi} · 로우 ${names(deal.seats, a.lo)} ${won(totalOf(deal.awards, potIndex, 'lo'))}`
}

function build(deal: Deal, kind: PotAwardKind): PotAwardQuestion {
  return {
    kind,
    limitSec: POTAWARD_LIMIT_SEC[kind],
    label: POTAWARD_KIND_LABEL[kind],
    prompt:
      deal.pots.length === 1
        ? '이 팟의 하이·로우 임자는 누구입니까?'
        : '팟마다 하이·로우 임자는 누구입니까?',
    seats: deal.seats,
    board: deal.board,
    buttonSeat: deal.buttonSeat,
    pots: deal.pots,
    answers: deal.answers,
    reasons: deal.pots.map((_, i) => reasonFor(deal, i)),
  }
}

/** 원본을 건드리지 않는 Fisher-Yates. */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/**
 * 열 문제의 층 배분. **미리 정해 두면 시드와 무관하게 보장된다.**
 * 순서는 섞는다 — 늘 같은 자리에 같은 층 수가 오면 답을 위치로 짐작한다.
 */
function kindTargets(rng: Rng): PotAwardKind[] {
  const targets: PotAwardKind[] = []
  for (const [kind, count] of Object.entries(POTAWARD_KIND_QUOTA) as [PotAwardKind, number][]) {
    for (let i = 0; i < count; i++) targets.push(kind)
  }
  if (targets.length !== POTAWARD_QUESTION_COUNT) {
    throw new Error(`층 배분이 문제 수와 다르다: ${targets.length} ≠ ${POTAWARD_QUESTION_COUNT}`)
  }
  return shuffled(targets, rng)
}

/**
 * 판의 모양 배분. 스쿱과 「로우 없음」을 하한만큼 강제하고 나머지는 자유다 —
 * 승자 판독의 `loTargets` 와 같은 손이다.
 */
function featureTargets(rng: Rng): Feature[] {
  const free = POTAWARD_QUESTION_COUNT - POTAWARD_SCOOP_MIN - POTAWARD_NO_LOW_MIN
  if (free < 0) throw new Error('스쿱·로우없음 하한의 합이 문제 수를 넘는다')
  return shuffled(
    [
      ...Array<Feature>(POTAWARD_SCOOP_MIN).fill('scoop'),
      ...Array<Feature>(POTAWARD_NO_LOW_MIN).fill('nolow'),
      ...Array<Feature>(free).fill(null),
    ],
    rng,
  )
}

export function generatePotAwardRun(spec: GameSpec, seed: string): PotAwardQuestion[] {
  const ev = evaluatorFor(spec)
  if (ev.rankLo === null) {
    throw new Error('로우가 없는 종목의 팟 분배는 아직 없다 — 하이 전용 드릴이 따로 필요하다')
  }

  const rng = createRng(seed)
  const kinds = kindTargets(rng)
  const features = featureTargets(rng)

  return kinds.map((kind, i) => {
    const feature = features[i]
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      const buttonSeat = rng.int(POTAWARD_SEAT_COUNT)
      const deal = dealOnce(spec, rng, ev, buttonSeat, POTAWARD_LAYERS[kind])
      if (deal !== null && matches(deal, feature)) return build(deal, kind)
    }
    throw new Error(`문제를 만들지 못했다 — ${kind}/${feature ?? 'any'}, 시도 ${MAX_TRIES}회`)
  })
}
