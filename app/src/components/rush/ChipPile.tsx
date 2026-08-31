/**
 * 칩 더미. 금액을 **숫자가 아니라 원반으로** 보여준다 —
 * 사이드팟 문제에서 각자 낸 금액을 숫자로 보여주면 문제가 사라진다 (설계 §4).
 *
 * 분해 규칙은 2단계의 `components/table/chips.ts` 를 그대로 쓴다. 칩 단위가 두 군데서
 * 갈리면 같은 금액이 화면마다 다르게 쌓인다.
 */
import { chipBreakdown, type ChipUnit } from '@/components/table/chips'
import styles from './rush.module.css'

/** `12_design_system.md` §5-1 의 6색. `:root` 에 있는 토큰을 그대로 부른다. */
const CHIP_COLOR: Record<ChipUnit, string> = {
  100: 'var(--color-dm-chip-100)',
  500: 'var(--color-dm-chip-500)',
  1000: 'var(--color-dm-chip-1000)',
  5000: 'var(--color-dm-chip-5000)',
  25000: 'var(--color-dm-chip-25000)',
  100000: 'var(--color-dm-chip-100000)',
}

const UNIT_LABEL: Record<ChipUnit, string> = {
  100: '100',
  500: '500',
  1000: '1K',
  5000: '5K',
  25000: '25K',
  100000: '100K',
}

/** 한 더미에 실제로 그리는 원반 수. 그 위로는 숫자로 센다 — 안 그러면 원반이 화면을 넘는다. */
const MAX_DISCS = 6

export function ChipPile({ amount }: { amount: number }) {
  if (amount <= 0) return null
  const { chips, remainder } = chipBreakdown(amount)

  /*
   * 스크린리더에도 **합계가 아니라 구성**을 읽어준다.
   * 칩을 읽어 금액을 세는 것이 이 게임의 문제 자체다 — 합계를 라벨로 붙이면
   * DOM 만 열어도 답이 나오고, 사이드팟 유형이 그냥 덧셈 문제가 된다.
   */
  const label = chips.map((p) => `${UNIT_LABEL[p.unit]} 칩 ${p.count}개`).join(', ')

  return (
    <span className={styles.chips} aria-label={label}>
      {chips.map((pile) => (
        <span key={pile.unit} className={styles.stack}>
          <span className={styles.pile}>
            {Array.from({ length: Math.min(pile.count, MAX_DISCS) }, (_, i) => (
              <span
                key={i}
                className={styles.chip}
                /*
                 * 커스텀 프로퍼티만 넘긴다. `background` 를 인라인으로 얹으면
                 * CSS 의 칩 텍스처가 통째로 지워진다 (프로토타입에서 실제로 겪었다).
                 */
                style={{ '--c': CHIP_COLOR[pile.unit] } as React.CSSProperties}
              />
            ))}
          </span>
          <span className={styles.count}>
            {UNIT_LABEL[pile.unit]}
            {pile.count > MAX_DISCS ? ` ×${pile.count}` : ''}
          </span>
        </span>
      ))}
      {/* 100 미만은 테이블에 칩이 없다. 삼키면 화면 합계가 원금액과 달라진다 */}
      {remainder > 0 ? <span className={styles.count}>+{remainder}</span> : null}
    </span>
  )
}
