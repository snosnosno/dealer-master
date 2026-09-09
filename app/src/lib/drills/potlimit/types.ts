/**
 * 팟리밋 계산 드릴의 타입.
 *
 * **답이 숫자다.** 보기를 주면 계산하지 않고 고를 수 있게 된다 — 팟리밋에서는 벳
 * 크기가 선택이 아니라 계산이라는 것이 이 드릴의 전부다 (`mix-room.html` 설계 주석).
 *
 * **문제는 「상황」이다.** 스트릿·블라인드·보드·앞사람들이 한 액션이 다 있어야
 * 화면에 놓인 칩이 어디서 왔는지 읽힌다. 이것들이 없으면 훈련생은 프리플랍인지
 * 포스트플랍인지도 모르는 판에서 팟을 세게 된다.
 */
import type { Card } from '@/lib/simulator'

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

/** 어느 스트릿인가. 보드 장수가 여기서 나온다 */
export type PotLimitStreet = '프리플랍' | '플랍' | '턴' | '리버'

/** 스트릿별 보드 장수. 프리플랍은 보드가 없다 */
export const POTLIMIT_BOARD_COUNT: Record<PotLimitStreet, number> = {
  프리플랍: 0,
  플랍: 3,
  턴: 4,
  리버: 5,
}

export type PotLimitSeat = {
  name: string
  /** 이 좌석이 이번 라운드에 앞에 놓은 칩. 화면에 칩으로 보인다 */
  bet: number
  folded: boolean
  /**
   * 좌석 아래 한 줄 — '체크' · '폴드' · '콜 4,000' · '차례'.
   *
   * **이게 없으면 순서를 읽을 수 없다.** 칩이 0인 좌석이 체크한 것인지 아직 차례가
   * 오지 않은 것인지 그림만으로는 갈리지 않는다.
   */
  act: string
}

export type PotLimitQuestion = {
  kind: PotLimitKind
  limitSec: number
  label: string
  prompt: string
  street: PotLimitStreet
  /** 스몰블라인드 · 빅블라인드. 화면에 적는다 — 판의 크기가 여기서 나온다 */
  sb: number
  bb: number
  /** 스트릿에 맞는 장수만큼. 프리플랍이면 빈 배열이다 */
  board: Card[]
  seats: PotLimitSeat[]
  buttonSeat: number
  /** 가운데로 수거된 팟 (앞에 놓인 칩은 `seats[].bet` 에 있다) */
  collected: number
  /** 문제를 받는 좌석. **지금 차례인 좌석이다** */
  heroSeat: number
  /** 정답 — 레이즈 **총액**이다 (폭이 아니다) */
  answer: number
  why: string
}
