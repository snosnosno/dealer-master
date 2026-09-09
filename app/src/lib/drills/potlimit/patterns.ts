/**
 * 히어로 앞에서 벌어진 액션의 **대본**.
 *
 * 예전 생성기는 「벳이 있다 / 없다」 둘뿐이었다. 실전에서 팟 계산이 어려운 이유는
 * 그 앞에 콜·레이즈·올인이 얼마나 쌓였느냐인데, 그게 화면에 나오지 않으니 드릴이
 * 늘 같은 문제였다. 상황을 여기 목록으로 못박아 **다 나오게** 한다.
 *
 * 대본은 「무엇이 일어났는가」까지만 적는다. **금액은 적지 않는다** — 금액은 그
 * 판의 블라인드·팟에서 나오고, 정답은 언제나 `pl.maxRaiseTo` 가 낸다.
 *
 * 짧은 올인(`allinUnder`)을 따로 둔 이유: 풀 레이즈에 못 미치는 올인은 **직전
 * 레이즈 폭을 갱신하지 않으면서 콜 금액만 올린다.** 팟 계산에서 가장 자주 틀리는
 * 자리이고, 그 사실이 문제로 나오지 않으면 훈련이 되지 않는다.
 */
import type { PotLimitKind } from './types'

export type PotLimitAct =
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  /** 풀 레이즈 이상의 올인 */
  | 'allin'
  /** 풀 레이즈에 못 미치는 올인. 폭은 그대로고 콜 금액만 오른다 */
  | 'allinUnder'

export type PotLimitPattern = {
  id: string
  /** '콜 · 올인(언더) → 팟' — 채점 뒤에 상황을 이름으로 되짚어 준다 */
  label: string
  street: 'pre' | 'post'
  kind: PotLimitKind
  /** 히어로보다 **앞에서** 일어난 액션. 액션 순서 그대로다 */
  before: PotLimitAct[]
}

/**
 * 프리플랍. 앞에 늘 빅블라인드가 있으므로 전부 「팟까지 레이즈」다 — 팟벳은 없다.
 * 대본이 길수록 자리가 더 필요하다: 좌석 수는 `before.length + 1` 이상이어야 한다.
 */
export const PREFLOP_PATTERNS: readonly PotLimitPattern[] = [
  { id: 'pre-pot', label: '팟', street: 'pre', kind: 'potraise', before: [] },
  { id: 'pre-f-pot', label: '폴드 → 팟', street: 'pre', kind: 'potraise', before: ['fold'] },
  { id: 'pre-ff-pot', label: '폴드 · 폴드 → 팟', street: 'pre', kind: 'potraise', before: ['fold', 'fold'] },
  { id: 'pre-c-pot', label: '콜 → 팟', street: 'pre', kind: 'potraise', before: ['call'] },
  { id: 'pre-cc-pot', label: '콜 · 콜 → 팟', street: 'pre', kind: 'potraise', before: ['call', 'call'] },
  { id: 'pre-ccc-pot', label: '콜 · 콜 · 콜 → 팟', street: 'pre', kind: 'potraise', before: ['call', 'call', 'call'] },
  { id: 'pre-fc-pot', label: '폴드 · 콜 → 팟', street: 'pre', kind: 'potraise', before: ['fold', 'call'] },
  { id: 'pre-r-pot', label: '레이즈 → 팟', street: 'pre', kind: 'potraise', before: ['raise'] },
  { id: 'pre-rc-pot', label: '레이즈 · 콜 → 팟', street: 'pre', kind: 'potraise', before: ['raise', 'call'] },
  { id: 'pre-rcc-pot', label: '레이즈 · 콜 · 콜 → 팟', street: 'pre', kind: 'potraise', before: ['raise', 'call', 'call'] },
  { id: 'pre-rf-pot', label: '레이즈 · 폴드 → 팟', street: 'pre', kind: 'potraise', before: ['raise', 'fold'] },
  { id: 'pre-cr-pot', label: '콜 · 레이즈 → 팟', street: 'pre', kind: 'potraise', before: ['call', 'raise'] },
  { id: 'pre-crc-pot', label: '콜 · 레이즈 · 콜 → 팟', street: 'pre', kind: 'potraise', before: ['call', 'raise', 'call'] },
  { id: 'pre-cfr-pot', label: '콜 · 폴드 · 레이즈 → 팟', street: 'pre', kind: 'potraise', before: ['call', 'fold', 'raise'] },
  { id: 'pre-a-pot', label: '올인 → 팟', street: 'pre', kind: 'potraise', before: ['allin'] },
  { id: 'pre-ca-pot', label: '콜 · 올인 → 팟', street: 'pre', kind: 'potraise', before: ['call', 'allin'] },
  { id: 'pre-cau-pot', label: '콜 · 올인(언더) → 팟', street: 'pre', kind: 'potraise', before: ['call', 'allinUnder'] },
  { id: 'pre-ra-pot', label: '레이즈 · 올인 → 팟', street: 'pre', kind: 'potraise', before: ['raise', 'allin'] },
  { id: 'pre-rau-pot', label: '레이즈 · 올인(언더) → 팟', street: 'pre', kind: 'potraise', before: ['raise', 'allinUnder'] },
  { id: 'pre-au-pot', label: '올인(언더) → 팟', street: 'pre', kind: 'potraise', before: ['allinUnder'] },
  { id: 'pre-cra-pot', label: '콜 · 레이즈 · 올인 → 팟', street: 'pre', kind: 'potraise', before: ['call', 'raise', 'allin'] },
]

/** 포스트플랍 팟벳. 앞에 벳이 없어야 하므로 앞사람은 체크뿐이다 */
export const POSTFLOP_BET_PATTERNS: readonly PotLimitPattern[] = [
  { id: 'post-pot', label: '팟벳', street: 'post', kind: 'potbet', before: [] },
  { id: 'post-x-pot', label: '체크 → 팟벳', street: 'post', kind: 'potbet', before: ['check'] },
  { id: 'post-xx-pot', label: '체크 · 체크 → 팟벳', street: 'post', kind: 'potbet', before: ['check', 'check'] },
  { id: 'post-xxx-pot', label: '체크 · 체크 · 체크 → 팟벳', street: 'post', kind: 'potbet', before: ['check', 'check', 'check'] },
]

/** 포스트플랍 팟까지 레이즈. 앞에 벳이 반드시 하나 있어야 한다 */
export const POSTFLOP_RAISE_PATTERNS: readonly PotLimitPattern[] = [
  { id: 'post-b-pot', label: '벳 → 팟', street: 'post', kind: 'potraise', before: ['bet'] },
  { id: 'post-bc-pot', label: '벳 · 콜 → 팟', street: 'post', kind: 'potraise', before: ['bet', 'call'] },
  { id: 'post-bcc-pot', label: '벳 · 콜 · 콜 → 팟', street: 'post', kind: 'potraise', before: ['bet', 'call', 'call'] },
  { id: 'post-bf-pot', label: '벳 · 폴드 → 팟', street: 'post', kind: 'potraise', before: ['bet', 'fold'] },
  { id: 'post-bfc-pot', label: '벳 · 폴드 · 콜 → 팟', street: 'post', kind: 'potraise', before: ['bet', 'fold', 'call'] },
  { id: 'post-br-pot', label: '벳 · 레이즈 → 팟', street: 'post', kind: 'potraise', before: ['bet', 'raise'] },
  { id: 'post-brc-pot', label: '벳 · 레이즈 · 콜 → 팟', street: 'post', kind: 'potraise', before: ['bet', 'raise', 'call'] },
  { id: 'post-xb-pot', label: '체크 · 벳 → 팟', street: 'post', kind: 'potraise', before: ['check', 'bet'] },
  { id: 'post-xbc-pot', label: '체크 · 벳 · 콜 → 팟', street: 'post', kind: 'potraise', before: ['check', 'bet', 'call'] },
  { id: 'post-xxb-pot', label: '체크 · 체크 · 벳 → 팟', street: 'post', kind: 'potraise', before: ['check', 'check', 'bet'] },
  { id: 'post-ba-pot', label: '벳 · 올인 → 팟', street: 'post', kind: 'potraise', before: ['bet', 'allin'] },
  { id: 'post-bau-pot', label: '벳 · 올인(언더) → 팟', street: 'post', kind: 'potraise', before: ['bet', 'allinUnder'] },
  { id: 'post-bra-pot', label: '벳 · 레이즈 · 올인 → 팟', street: 'post', kind: 'potraise', before: ['bet', 'raise', 'allin'] },
]

export const ALL_PATTERNS: readonly PotLimitPattern[] = [
  ...PREFLOP_PATTERNS,
  ...POSTFLOP_BET_PATTERNS,
  ...POSTFLOP_RAISE_PATTERNS,
]
