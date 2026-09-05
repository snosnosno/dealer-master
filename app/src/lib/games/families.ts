/**
 * 패밀리의 표시 순서.
 *
 * **배열이 아니라 레코드인 이유**: `GameSpec['family']` 에 값이 하나 늘면 이 객체가
 * 곧바로 타입 에러를 낸다. 배열이었다면 빠뜨려도 아무 일이 없고, 그 패밀리의 종목이
 * 홈에서 조용히 사라진다 — 손으로 관리하는 표가 레지스트리와 어긋나는 그 실패가
 * 격자 설계(PRD §6)가 없애려는 바로 그것이다.
 *
 * 순서는 데이터가 아니라 편집 판단이라 여기 적는다. 한국어 이름은 적지 않는다 —
 * 그건 `spec.labels.familyKo` 하나가 정본이다. 여기에 또 적으면 홈의 제목과
 * 종목 허브의 부제가 같은 패밀리를 두고 다른 말을 하게 된다.
 */
import type { GameSpec } from './types'

export type Family = GameSpec['family']

const FAMILY_RANK: Record<Family, number> = {
  flop: 0,
  stud: 1,
  draw: 2,
}

/** 표시 순서대로 나열한 패밀리 전체. 레코드의 키에서 뽑으므로 하나도 빠질 수 없다. */
export const FAMILY_ORDER: Family[] = [...(Object.keys(FAMILY_RANK) as Family[])].sort(
  (a, b) => FAMILY_RANK[a] - FAMILY_RANK[b],
)
