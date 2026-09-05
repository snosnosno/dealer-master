/**
 * 홈 — 격자의 행. **종목을 먼저 고른다.**
 *
 * 이전 판본은 축 4개를 나열했다. 훈련의 종류와 포커 종목이 한 이름 안에 섞여 있어
 * "PLO 의 팟리밋을 연습하고 싶다"를 표현할 자리가 없었다 (PRD §6).
 *
 * `n/m` 은 손으로 적지 않는다 — `drillsFor` 와 `drillHref` 가 낸다.
 */
import Link from 'next/link'
import { DRILL_LABEL, drillHref, drillsFor, GAME_ORDER, GAMES } from '@/lib/games'

const FAMILY_ORDER = [
  { id: 'flop', ko: '플랍' },
  { id: 'stud', ko: '스터드' },
  { id: 'draw', ko: '드로우' },
] as const

export function GameList() {
  return (
    <div className="mt-8 space-y-6">
      {FAMILY_ORDER.map((family) => {
        const games = GAME_ORDER.filter((id) => GAMES[id].family === family.id)
        if (games.length === 0) return null

        return (
          <section key={family.id}>
            <h2 className="text-xs font-bold text-zinc-400">{family.ko}</h2>
            <div className="mt-2 space-y-2">
              {games.map((id) => {
                const spec = GAMES[id]
                const drills = drillsFor(spec)
                const ready = drills.filter((d) => drillHref(id, d) !== null).length

                return (
                  <Link
                    key={id}
                    href={`/games/${id}`}
                    className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
                  >
                    <span>
                      <span className="text-base font-bold">{spec.labels.ko}</span>
                      <span className="ml-2 text-[11px] text-zinc-500">
                        {spec.labels.gameKo} · {spec.labels.bettingKo}
                      </span>
                    </span>
                    <span className="text-xs font-bold text-zinc-400">
                      {ready}/{drills.length}
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}
      {/* 드릴 이름을 홈에서도 한 번 보여준다 — 무엇을 훈련하는 앱인지가 첫 화면에 있어야 한다 */}
      <p className="text-[11px] leading-relaxed text-zinc-400">
        훈련: {Object.values(DRILL_LABEL).join(' · ')}
      </p>
    </div>
  )
}
