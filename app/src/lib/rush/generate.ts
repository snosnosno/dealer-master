/**
 * 10문제 한 판을 만든다. 러시의 공개 진입점이다.
 *
 * **무작위는 `createRng(seed)` 하나에서만 나온다.** `Math.random()` 을 한 번이라도 쓰면
 * 같은 시드가 다른 문제를 만들어 재현이 불가능해지고, 버그 신고를 받아도 그 판을 다시
 * 볼 수 없다. 시드를 URL 에 두는 것도 같은 이유다 (일일 챌린지는 4단계지만 문은 열어둔다).
 */
import { createRng, type Rng } from '@/lib/simulator'
import { shuffled } from './deal'
import { makeOddChip } from './questions/oddchip'
import { makePayout } from './questions/payout'
import { makeSidePots } from './questions/sidepots'
import { makeSplit } from './questions/split'
import { makeWinner } from './questions/winner'
import { KIND_QUOTA, QUESTION_COUNT, type RushKind, type RushQuestion } from './types'

type Maker = (rng: Rng) => RushQuestion | null

const MAKERS: Record<RushKind, Maker> = {
  sidepots: makeSidePots,
  winner: makeWinner,
  payout: makePayout,
  split: makeSplit,
  oddchip: makeOddChip,
}

/**
 * 한 문제당 재시도 상한. 생성기는 조건에 안 맞는 판을 버리고 다시 만드는데,
 * 상한이 없으면 그 루프가 화면 정지로 나타난다 — 러시에서 가장 나쁜 실패다.
 */
const ATTEMPTS = 60
/** 상한을 넘겼을 때 시드를 미는 횟수. */
const SEED_BUMPS = 5

function makeOne(kind: RushKind, rng: Rng, seed: string): RushQuestion {
  const make = MAKERS[kind]

  for (let i = 0; i < ATTEMPTS; i++) {
    const q = make(rng)
    if (q !== null) return q
  }

  // 같은 난수열에서 60번 실패했으면 그 줄기가 나쁜 것이다. 다른 줄기로 옮긴다.
  for (let bump = 1; bump <= SEED_BUMPS; bump++) {
    const alt = createRng(`${seed}#${kind}#${bump}`)
    for (let i = 0; i < ATTEMPTS; i++) {
      const q = make(alt)
      if (q !== null) return q
    }
  }

  throw new Error(`문제 생성 실패: ${kind}`)
}

/** 유형별 출제 수를 펼쳐 섞는다. 합이 10이고 한 유형이 4를 넘지 않는다. */
function kindOrder(rng: Rng): RushKind[] {
  const flat: RushKind[] = []
  for (const [kind, count] of Object.entries(KIND_QUOTA) as [RushKind, number][]) {
    for (let i = 0; i < count; i++) flat.push(kind)
  }
  return shuffled(flat, rng)
}

export function generateRun(seed: string): RushQuestion[] {
  const rng = createRng(seed)
  const questions = kindOrder(rng).map((kind) => makeOne(kind, rng, seed))

  // 배분이 어긋나면 화면이 아니라 여기서 실패해야 원인이 보인다.
  if (questions.length !== QUESTION_COUNT) {
    throw new Error(`문제 수가 ${questions.length} 개다`)
  }
  return questions
}

/**
 * 시드가 없을 때 새로 만든다. `components/simulator/hand.ts` 의 것과 같은 형식이다.
 * **문제 생성에는 이 값이 시드로만 들어간다** — 생성기 안에서는 `Math.random()` 을 쓰지 않는다.
 */
export function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36)
}
