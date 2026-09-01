/**
 * 10문제 한 판을 만든다. 액션 판정 러시의 공개 진입점이다.
 *
 * 축 1(`lib/rush/generate.ts`)과 같은 구조다 — 시드 하나에서만 무작위가 나오고,
 * 조건에 안 맞는 판은 버리고 다시 만들되 재시도에 상한이 있다.
 *
 * **무작위는 `createRng(seed)` 하나에서만 나온다.** `Math.random()` 을 한 번이라도 쓰면
 * 같은 시드가 다른 문제를 만들어, 버그 신고를 받아도 그 판을 다시 볼 수 없다.
 */
import { createRng, type Rng } from '@/lib/simulator'
import { makeMinRaise } from './questions/minraise'
import { makeMultiChip } from './questions/multichip'
import { makeOutOfTurn } from './questions/outofturn'
import { makeOversize } from './questions/oversize'
import { makeReopen } from './questions/reopen'
import { KIND_QUOTA, QUESTION_COUNT, type ActionKind, type ActionQuestion } from './types'

type Maker = (rng: Rng) => ActionQuestion | null

const MAKERS: Record<ActionKind, Maker> = {
  minraise: makeMinRaise,
  reopen: makeReopen,
  oversize: makeOversize,
  multichip: makeMultiChip,
  outofturn: makeOutOfTurn,
}

/**
 * 한 문제당 재시도 상한. 생성기는 조건에 안 맞는 판을 버리고 다시 만드는데,
 * 상한이 없으면 그 루프가 화면 정지로 나타난다 — 러시에서 가장 나쁜 실패다.
 */
const ATTEMPTS = 60
/** 상한을 넘겼을 때 시드를 미는 횟수. */
const SEED_BUMPS = 5

function makeOne(kind: ActionKind, rng: Rng, seed: string): ActionQuestion {
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

/** 유형별 출제 수를 펼쳐 섞는다. 합이 10이고 유형당 정확히 2개다. */
function kindOrder(rng: Rng): ActionKind[] {
  const flat: ActionKind[] = []
  for (const [kind, count] of Object.entries(KIND_QUOTA) as [ActionKind, number][]) {
    for (let i = 0; i < count; i++) flat.push(kind)
  }
  return shuffled(flat, rng)
}

export function generateRun(seed: string): ActionQuestion[] {
  const rng = createRng(seed)
  const questions = kindOrder(rng).map((kind) => makeOne(kind, rng, seed))

  // 배분이 어긋나면 화면이 아니라 여기서 실패해야 원인이 보인다.
  if (questions.length !== QUESTION_COUNT) {
    throw new Error(`문제 수가 ${questions.length} 개다`)
  }
  return questions
}

