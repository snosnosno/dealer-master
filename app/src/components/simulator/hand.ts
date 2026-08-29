/**
 * 시드 하나에서 플레이할 핸드를 만든다.
 *
 * `require` 를 **시드가 정한다.** 학습자에게 노출되는 컨트롤이 아니다.
 * 이 장치가 필요한 이유: require 없이는 300시드 실측 올인 0건, `['calculation']` 을
 * 걸면 300/300 이다. 컨트롤로 안 내면서 이걸 안 걸면 4축 중 하나이자 등급 조건
 * 3축 중 하나인 계산 축의 훈련 기회가 0 이 된다.
 *
 * rng 스트림을 `:require` 로 분리했으므로 핸드 생성의 난수열과 섞이지 않고,
 * 시드 하나가 여전히 핸드 하나를 완전히 결정한다.
 *
 * 노출하지 않는 것: difficulty(무효과) · rulesetId(값 하나뿐) · seatCount(6 고정).
 */
import { createRng, extractDecisions, generateHand } from '@/lib/simulator'
import type { DecisionPoint, Hand } from '@/lib/simulator'

/** 사이드팟 핸드의 비율. 1/3. */
export const SIDE_POT_RATE = 1 / 3

/** 스펙 V1 은 6-max 다. */
const SEAT_COUNT = 6

export function buildHand(seed: string): { hand: Hand; decisions: DecisionPoint[] } {
  const wantSidePot = createRng(`${seed}:require`).int(3) === 0
  const hand = generateHand({
    seed,
    seatCount: SEAT_COUNT,
    require: wantSidePot ? ['calculation'] : undefined,
  })
  return { hand, decisions: extractDecisions(hand) }
}

/** 브라우저에서 새 시드를 만든다. 서버에서 부르지 않는다. */
export function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36)
}
