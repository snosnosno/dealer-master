/**
 * 팟 분배 드릴의 타입.
 *
 * 승자 판독이 「이 판의 임자」를 묻는다면 이 드릴은 「**팟마다의** 임자」를 묻는다.
 * 층이 갈리면 자격자가 층마다 좁아지고, 그래서 메인팟의 임자와 서드팟의 임자가
 * 다를 수 있다 — 그 판단이 이 드릴의 전부다.
 *
 * **한 문제가 한 판이다.** 팟을 하나씩 떼어 물으면 트레이니는 층이 몇 개인지,
 * 어느 층이 누구에게 가는지를 한 번도 통째로 보지 못한다. 실제 쇼다운에서
 * 딜러는 메인팟부터 서드팟까지 **한 번에** 정리한다.
 *
 * **금액은 묻지 않는다.** 층을 가르고 스쿱인지 스플릿인지 가리는 것이 판단이고,
 * 거기서 나온 금액은 산수다 — 산수를 묻느라 판단을 묻는 자리를 잃지 않는다.
 * 금액은 채점 뒤 근거에서 보여준다.
 */
import type { Card, Pot } from '@/lib/simulator'

/** 층이 몇 개인 판인가. **이것이 문제의 난이도다** */
export type PotAwardKind = 'onepot' | 'twopots' | 'threepots'

export const POTAWARD_KIND_LABEL: Record<PotAwardKind, string> = {
  onepot: '메인팟',
  twopots: '세컨드팟까지',
  threepots: '서드팟까지',
}

/** 유형별 층 수. `buildPots` 가 실제로 이만큼 내놓지 않으면 그 판은 버린다 */
export const POTAWARD_LAYERS: Record<PotAwardKind, number> = {
  onepot: 1,
  twopots: 2,
  threepots: 3,
}

/**
 * 제한시간(초). 층마다 하이·로우를 다 골라야 하므로 층 수에 따라 늘어난다.
 * **초안이다** — 재미 게이트에서 확정한다 (설계 §10).
 */
export const POTAWARD_LIMIT_SEC: Record<PotAwardKind, number> = {
  onepot: 40,
  twopots: 55,
  threepots: 70,
}

export const POTAWARD_QUESTION_COUNT = 10

/**
 * 열 문제의 층 배분. 미리 정해 두면 시드와 무관하게 보장된다.
 * 합이 문제 수와 같아야 한다 — 생성기가 그것을 확인한다.
 */
export const POTAWARD_KIND_QUOTA: Record<PotAwardKind, number> = {
  onepot: 4,
  twopots: 3,
  threepots: 3,
}

/**
 * 한 판 10문제 중 **스쿱이 있는 판**과 **로우가 아예 없는 판**의 하한.
 *
 * 없으면 열 판이 다 「하이 한 명 · 로우 한 명」으로 굳는다 — 트레이니는 늘 둘을
 * 갈라 고르는 손버릇만 배우고, 한 사람이 다 가져가는 판에서 손이 멈춘다.
 * 승자 판독의 `LO_PRESENT_MIN`·`LO_ABSENT_MIN` 과 같은 규약이다.
 */
export const POTAWARD_SCOOP_MIN = 2
export const POTAWARD_NO_LOW_MIN = 2

/** 이 드릴의 출제 좌석 수. 사이드팟이 성립하려면 올인이 필요해 승자 판독보다 많다 */
export const POTAWARD_SEAT_COUNT = 4

export type PotAwardSeat = {
  name: string
  hole: Card[]
  /** 이 핸드에 낸 총액. 사이드팟 층을 자르는 근거다 */
  contributed: number
  folded: boolean
  allIn: boolean
}

/**
 * 한 팟의 임자. **둘 다 여럿일 수 있다** — 하이가 동점이면 하이가 여럿이고,
 * 같은 누트 로우를 둘이 쥐면 로우가 여럿이다.
 *
 * `lo` 가 비면 그 팟에 자격 있는 로우가 없다는 뜻이고, 그때 하이가 통째로 가져간다.
 * `hi` 와 `lo` 가 같은 한 사람이면 스쿱이다.
 */
export type PotAwardPotAnswer = { hi: number[]; lo: number[] }

export type PotAwardQuestion = {
  kind: PotAwardKind
  limitSec: number
  label: string
  prompt: string
  seats: PotAwardSeat[]
  board: Card[]
  buttonSeat: number
  pots: Pot[]
  /** 팟마다 하나. **`pots` 와 같은 길이·같은 순서다** */
  answers: PotAwardPotAnswer[]
  /** 팟마다 근거 한 줄. 금액은 여기서만 보여준다 */
  reasons: string[]
}
