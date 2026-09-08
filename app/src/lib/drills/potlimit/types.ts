/**
 * 팟리밋 계산 드릴의 타입.
 *
 * **답이 숫자다.** 보기를 주면 계산하지 않고 고를 수 있게 된다 — 팟리밋에서는 벳
 * 크기가 선택이 아니라 계산이라는 것이 이 드릴의 전부다 (`mix-room.html` 설계 주석).
 */
export type PotLimitKind = 'potbet' | 'potraise'

export const POTLIMIT_KIND_LABEL: Record<PotLimitKind, string> = {
  potbet: '팟벳',
  potraise: '팟까지 레이즈',
}

/**
 * 제한시간(초). **초안이다** — 재미 게이트에서 확정한다 (설계 §10).
 * 숫자 입력은 고르기보다 느리다.
 */
export const POTLIMIT_LIMIT_SEC: Record<PotLimitKind, number> = {
  potbet: 30,
  potraise: 45,
}

export const POTLIMIT_QUESTION_COUNT = 10
export const POTLIMIT_SEAT_COUNT = 4

export type PotLimitSeat = {
  name: string
  /** 이 좌석이 이번 라운드에 앞에 놓은 칩. 화면에 칩으로 보인다 */
  bet: number
  folded: boolean
}

export type PotLimitQuestion = {
  kind: PotLimitKind
  limitSec: number
  label: string
  prompt: string
  seats: PotLimitSeat[]
  buttonSeat: number
  /** 가운데로 수거된 팟 (앞에 놓인 칩은 `seats[].bet` 에 있다) */
  collected: number
  /** 문제를 받는 좌석 */
  heroSeat: number
  /** 정답 — 레이즈 **총액**이다 (폭이 아니다) */
  answer: number
  why: string
}
