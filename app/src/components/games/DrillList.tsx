/**
 * 종목 허브 — 격자의 한 행을 펼친 것.
 *
 * **목록은 `drillsFor` 가 낸다.** 이 종목에 해당 없는 드릴(노리밋 홀덤의 팟리밋 계산,
 * 하이 게임의 로우 판독)은 아예 나오지 않는다 — 잠긴 것과 해당 없는 것은 다르다.
 */
import Link from 'next/link'
import { DRILL_LABEL, drillHref, drillsFor, type GameId, GAMES } from '@/lib/games'

export function DrillList({ gameId }: { gameId: GameId }) {
  const spec = GAMES[gameId]

  return (
    <div className="mt-6 space-y-2">
      {drillsFor(spec).map((drillId) => {
        const href = drillHref(gameId, drillId)
        const label = DRILL_LABEL[drillId]

        if (href === null) {
          return (
            <div
              key={drillId}
              className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4 opacity-50 dark:border-zinc-800"
            >
              <span className="text-base font-bold">{label}</span>
              <span className="text-[11px] font-bold text-zinc-400">준비 중</span>
            </div>
          )
        }

        return (
          <Link
            key={drillId}
            href={href}
            className="flex items-center justify-between rounded-2xl border border-dm-teal-600 bg-dm-teal-50 p-4 dark:bg-zinc-900"
          >
            <span className="text-base font-bold text-dm-teal-800 dark:text-dm-teal-100">
              {label}
            </span>
            <span className="text-[11px] text-dm-teal-600">시작</span>
          </Link>
        )
      })}
    </div>
  )
}
