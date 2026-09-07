/**
 * 종목 스펙 → 핸드 평가기.
 *
 * **`spec.eval` 만 읽는다.** `spec.id` 도 표시 라벨도 읽지 않는다 — 종목 이름으로
 * 갈라면 종목이 늘 때마다 이 파일에 if 가 하나씩 붙고, 그것이 격자가 막으려는 것이다.
 *
 * 아직 만들지 않은 갈래는 **던진다.** 조용히 하이만 평가하면 훈련생이 틀린 분배를
 * 정답으로 배운다 — 승자 판독 설계 §6 이 세운 규율을 그대로 잇는다.
 */
import {
  ANY_FIVE_EVALUATOR, bestOmahaHi, bestOmahaLow,
  type HandEvaluator,
} from '@/lib/simulator'
import type { GameSpec } from './types'

export function evaluatorFor(spec: GameSpec): HandEvaluator {
  if (spec.family !== 'flop') {
    throw new Error(
      `공유 보드가 없는 종목의 평가기는 아직 없다: ${spec.family} — 스터드·라즈가 붙을 때 만든다`,
    )
  }

  const { mustUse, lo } = spec.eval

  // 아무 다섯 장으로 고르는 종목 (홀덤 계열)
  if (mustUse === null) {
    if (lo !== null) {
      throw new Error('강제 조합 없는 하이로우는 아직 없다 — 스터드/8 이 붙을 때 만든다')
    }
    return ANY_FIVE_EVALUATOR
  }

  // 오마하 강제 조합 (홀 2 + 보드 3)
  if (lo === null) {
    return { rankHi: (hole, board) => bestOmahaHi(hole, board), rankLo: null }
  }
  if (lo.kind !== 'a5') {
    throw new Error(`아직 없는 로우 방식: ${lo.kind} — 자료를 확인한 뒤 채운다`)
  }
  if (lo.qualifier === null) {
    throw new Error('자격 없는 로우는 아직 없다 — 라즈가 붙을 때 만든다')
  }

  const qualifier = lo.qualifier
  return {
    rankHi: (hole, board) => bestOmahaHi(hole, board),
    rankLo: (hole, board) => bestOmahaLow(hole, board, qualifier),
  }
}
