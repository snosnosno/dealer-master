/**
 * 칩 원반 더미. 팟과 각 좌석의 현재 벳에만 쓴다 — 좌석 스택은 숫자다.
 * 스택까지 칩으로 그리면 6-max 에서 원반이 40개를 넘는다.
 */
import { chipBreakdown, type ChipUnit } from './chips'

/** `12_design_system.md` §5-1 의 6색. */
const CHIP_COLOR: Record<ChipUnit, string> = {
  100: '#B4B2A9',
  500: '#378ADD',
  1000: '#1D9E75',
  5000: '#2C2C2A',
  25000: '#7F77DD',
  100000: '#EF9F27',
}

const LABEL: Record<ChipUnit, string> = {
  100: '100', 500: '500', 1000: '1K', 5000: '5K', 25000: '25K', 100000: '100K',
}

export function ChipStack({ amount }: { amount: number }) {
  if (amount <= 0) return null
  const { chips, remainder } = chipBreakdown(amount)

  return (
    <div className="flex items-center gap-1" aria-label={`${amount.toLocaleString('ko-KR')}`}>
      <div className="flex -space-x-1">
        {chips.map((pile) => (
          <div
            key={pile.unit}
            className="flex h-4 w-4 items-center justify-center rounded-full border border-white/50 text-[6px] font-extrabold text-white"
            style={{ background: CHIP_COLOR[pile.unit] }}
            title={`${LABEL[pile.unit]} × ${pile.count}`}
          >
            {pile.count > 1 ? pile.count : ''}
          </div>
        ))}
      </div>
      <span className="text-[10px] font-bold text-white">
        {amount.toLocaleString('ko-KR')}
        {remainder > 0 ? ` (+${remainder})` : ''}
      </span>
    </div>
  )
}
