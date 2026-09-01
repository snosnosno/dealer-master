/**
 * 금액과 칩 액면 — 문제를 "현실에 있을 법한 판"으로 만드는 값들.
 *
 * 여기에 규칙 판정은 없다. 액면을 고르고 단위로 반올림하는 것까지다.
 * 프로토타입에서 실제로 그럴듯해 보인 값을 그대로 옮긴다.
 */
import type { Rng } from '@/lib/simulator'

/** 출제에 쓰는 블라인드 레벨. 낮은 레벨이 있어야 100·500 칩이 화면에 나온다. */
export const BLINDS = [200, 400, 1000, 2000, 10000] as const

/** 칩 액면. 큰 것부터 — 분해할 때 이 순서로 집는다. */
export const DENOMS = [100000, 25000, 5000, 1000, 500, 100] as const

/**
 * 그 블라인드 레벨에서 금액이 떨어지는 단위.
 *
 * 레벨마다 테이블에 남아 있는 칩이 다르다. 낮은 레벨에는 100·500 칩이 실제로 있고
 * 높은 레벨에서는 레이스로 사라진다 — 1,000/2,000 에서 100 칩 단위 금액이 나오면
 * 현실과 다르고, 그 자체가 훈련생에게 잘못된 그림이 된다.
 */
export function unitFor(bb: number): number {
  if (bb >= 10000) return 5000
  if (bb >= 2000) return 1000
  if (bb >= 1000) return 500
  return 100
}

/** `d` 바로 아래 액면. 이 단위로 반올림하면 칩 분해가 두세 개로 끝난다. */
export function belowDenom(d: number): number {
  for (const denom of DENOMS) {
    if (denom < d) return denom
  }
  return 100
}

/** `u` 단위로 반올림하되 최소 한 단위는 보장한다. */
export function roundUnit(n: number, u: number): number {
  return Math.max(u, Math.round(n / u) * u)
}

/** 금액을 칩 액면으로 분해한다. 큰 액면부터 집는다. */
export function breakdown(amount: number): number[] {
  const chips: number[] = []
  let left = amount
  for (const d of DENOMS) {
    while (left >= d) {
      chips.push(d)
      left -= d
    }
  }
  return chips
}

/** `0` 이상 `n` 미만 정수. `rng.int` 를 읽기 좋게 감싼 것뿐이다. */
export function rnd(rng: Rng, n: number): number {
  return rng.int(n)
}

export const fmt = (n: number): string => n.toLocaleString('ko-KR')
