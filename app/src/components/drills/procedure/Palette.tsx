/**
 * 팔레트 일곱. **상황마다 보기가 바뀌지 않는다** — 딜러가 할 수 있는 행동 전부가
 * 늘 떠 있고, 그중 무엇을 먼저 할지를 고른다. 그것이 4지선다와 갈리는 지점이다.
 *
 * PLO8 에 앤티 수거와 카드 교체가 해당 없어도 남긴다. 무엇이 이 종목에 해당 없는지
 * 아는 것이 훈련이기 때문이다.
 */
'use client'

import { PALETTE } from '@/lib/drills/procedure/steps'
import type { PaletteAct } from '@/lib/drills/procedure/types'

export function Palette({
  disabled,
  onPick,
}: {
  disabled: boolean
  onPick(act: PaletteAct): void
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {PALETTE.map((act) => (
        <button
          key={act.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(act.id)}
          className="rounded-xl border border-zinc-300 px-3 py-3 text-sm font-bold text-zinc-800 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-100"
        >
          {act.ko}
        </button>
      ))}
    </div>
  )
}
