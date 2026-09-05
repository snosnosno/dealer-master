/**
 * 칩 원반 더미. 팟과 각 좌석의 현재 벳에만 쓴다 — 좌석 스택은 숫자다.
 * 스택까지 칩으로 그리면 6-max 에서 원반이 40개를 넘는다.
 */
import { chipBreakdown, type ChipUnit } from './chips'

/** `12_design_system.md` §5-1 의 6색. */
const CHIP_COLOR: Record<ChipUnit, string> = {
  100: 'var(--color-dm-chip-100)',
  500: 'var(--color-dm-chip-500)',
  1000: 'var(--color-dm-chip-1000)',
  5000: 'var(--color-dm-chip-5000)',
  25000: 'var(--color-dm-chip-25000)',
  100000: 'var(--color-dm-chip-100000)',
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
      {/*
        * 금액에 어두운 반투명 알약을 깐다. 흰 글자만 두면 **펠트 밖에서 사라진다** —
        * 좌석 칼럼이 위에서 아래로 자라므로 하단 좌석(1번·6번)의 벳 칩은 펠트 아래
        * 테두리 밖 흰 페이지 배경에 놓이고, 거기서 흰 글자는 대비 1:1 이다. 실제로
        * 1번의 「1,000」은 테두리에 걸쳐 반쯤 지워졌고 6번의 「500」은 통째로 사라졌다.
        *
        * 좌석 이름·스택이 흰 알약으로 푼 문제와 같은 것인데, 그쪽은 배경을 흰색으로
        * 확정했고 여기는 반대로 어둡게 확정한다 — 칩 금액은 펠트 위에 있을 때가 더
        * 많고, 흰 알약을 깔면 펠트 위에서 눈에 너무 튄다.
        */}
      <span className="rounded-full bg-black/60 px-1.5 text-[10px] font-bold text-white">
        {amount.toLocaleString('ko-KR')}
        {remainder > 0 ? ` (+${remainder})` : ''}
      </span>
    </div>
  )
}
