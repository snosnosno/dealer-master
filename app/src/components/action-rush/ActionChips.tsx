/**
 * 좌석 앞에 밀어 놓은 칩.
 *
 * 축 1 의 `ChipPile` 과 **다른 컴포넌트여야 한다.** 그쪽은 금액을 받아 `chipBreakdown`
 * 으로 다시 쪼개는데, 제31조 문제는 **"어떤 칩을 몇 개 밀었나"가 곧 정답의 근거**라
 * 재분해하면 안 된다. 25,000 두 개를 민 것과 50,000 하나를 민 것은 규정상 다른 액션이다.
 *
 * 그래서 여기서는 **넘겨받은 액면 배열을 그대로** 그린다. 스타일은 축 1 과 같은
 * `rush.module.css` 를 쓴다 — 칩 텍스처의 정본은 하나다.
 */
import type { ChipUnit } from '@/components/table/chips'
import styles from '@/components/rush/rush.module.css'

const CHIP_COLOR: Record<number, string> = {
  100: 'var(--color-dm-chip-100)',
  500: 'var(--color-dm-chip-500)',
  1000: 'var(--color-dm-chip-1000)',
  5000: 'var(--color-dm-chip-5000)',
  25000: 'var(--color-dm-chip-25000)',
  100000: 'var(--color-dm-chip-100000)',
}

const UNIT_LABEL: Record<number, string> = {
  100: '100',
  500: '500',
  1000: '1K',
  5000: '5K',
  25000: '25K',
  100000: '100K',
}

/** 한 더미에 실제로 그리는 원반 수. 그 위로는 숫자로 센다. */
const MAX_DISCS = 6

const label = (unit: number): string => UNIT_LABEL[unit] ?? unit.toLocaleString('ko-KR')
const color = (unit: number): string => CHIP_COLOR[unit] ?? 'var(--color-dm-chip-100)'

export function ActionChips({ chips }: { chips: readonly number[] }) {
  if (chips.length === 0) return null

  // 같은 액면끼리 묶는다. 큰 액면부터 — 실제 테이블에서 쌓는 순서다.
  const piles = new Map<number, number>()
  for (const c of chips) piles.set(c, (piles.get(c) ?? 0) + 1)
  const sorted = [...piles.entries()].sort((a, b) => b[0] - a[0])

  /*
   * 스크린리더에도 **구성**을 읽어준다. 합계를 라벨로 붙이면 DOM 만 열어도
   * "가장 작은 칩 하나를 빼면" 판정이 끝나 버린다.
   */
  const aria = sorted.map(([unit, count]) => `${label(unit)} 칩 ${count}개`).join(', ')

  return (
    <span className={styles.chips} aria-label={aria}>
      {sorted.map(([unit, count]) => (
        <span key={unit} className={styles.stack}>
          <span className={styles.pile}>
            {Array.from({ length: Math.min(count, MAX_DISCS) }, (_, i) => (
              <span
                key={i}
                className={styles.chip}
                /* 커스텀 프로퍼티만 넘긴다 — `background` 를 인라인으로 얹으면 텍스처가 지워진다 */
                style={{ '--c': color(unit) } as React.CSSProperties}
              />
            ))}
          </span>
          {/*
            * 개수를 **항상** 적는다. 같은 액면 칩은 겹쳐 쌓으면 하나처럼 보이는데,
            * 제31조 문제는 "몇 개를 밀었나"가 곧 정답이라 개수가 안 보이면 문제가 성립하지 않는다.
            */}
          <span className={styles.count}>
            {label(unit)}
            {count > 1 ? ` ×${count}` : ''}
          </span>
        </span>
      ))}
    </span>
  )
}

/** 액면 배열이 없는 좌석(연쇄 유형)은 금액을 액면으로 쪼개 보여준다. */
export type { ChipUnit }
