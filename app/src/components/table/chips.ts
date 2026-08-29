/**
 * 금액을 표준 칩 단위로 쪼갠다.
 *
 * 단위는 `12_design_system.md` §5-1 의 표준이다. 엔진이 내는 금액은 전부 100 의
 * 배수라(`ODD_CHIP_UNIT = 100`, 블라인드 100/200, 스택 단위 500의 배수) 실무상
 * `remainder` 는 항상 0 이지만, 삼키지 않고 돌려준다 — 조용히 버리면 화면 합계가
 * 원금액과 달라지고 그 차이를 아무도 못 본다.
 */
export const CHIP_UNITS = [100000, 25000, 5000, 1000, 500, 100] as const

export type ChipUnit = (typeof CHIP_UNITS)[number]

export type ChipPile = { unit: ChipUnit; count: number }

export function chipBreakdown(amount: number): { chips: ChipPile[]; remainder: number } {
  let rest = Math.max(0, Math.floor(amount))
  const chips: ChipPile[] = []
  for (const unit of CHIP_UNITS) {
    const count = Math.floor(rest / unit)
    if (count > 0) {
      chips.push({ unit, count })
      rest -= unit * count
    }
  }
  return { chips, remainder: rest }
}
