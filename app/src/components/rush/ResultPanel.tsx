/**
 * 결과 화면. 점수 · 정답 수 · 최고 기록 · 유형별 집계.
 *
 * 유형별 집계는 **약점 분석이 아니라 이번 판의 집계**다. 유형별 누적 기록은 4단계다.
 */
import { KIND_LABEL, type RushKind } from '@/lib/rush/types'
import type { RunState } from '@/lib/rush/score'

const fmt = (n: number) => n.toLocaleString('ko-KR')

export function ResultPanel({
  run,
  total,
  best,
  isNewBest,
  onRetry,
}: {
  run: RunState
  total: number
  best: number
  isNewBest: boolean
  onRetry: () => void
}) {
  const rows = Object.entries(run.byKind) as [RushKind, { correct: number; total: number }][]

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="px-5 pb-5 pt-7 text-center">
        <p className="font-mono text-5xl font-extrabold leading-none tracking-tight text-dm-accent">
          {fmt(run.score)}
        </p>
        <p className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-400">
          점 · {run.correct}/{total} 정답
        </p>

        {isNewBest ? (
          <p className="mt-3 inline-block rounded-full bg-dm-amber-50 px-3 py-1 text-xs font-extrabold text-dm-amber-600">
            최고 기록 경신
          </p>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">
            최고 기록 <b className="font-mono text-zinc-700 dark:text-zinc-300">{fmt(best)}</b>점
          </p>
        )}

        <div className="mt-5 divide-y divide-zinc-100 text-left dark:divide-zinc-800">
          {rows.map(([kind, tally]) => (
            <div key={kind} className="flex items-center justify-between py-2 text-[13px]">
              <span className="text-zinc-500">{KIND_LABEL[kind]}</span>
              <span className="font-mono font-bold tabular-nums">
                {tally.correct} / {tally.total}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={onRetry}
          className="w-full rounded-xl bg-dm-teal-600 py-3 text-base font-extrabold text-dm-teal-50"
        >
          다시 하기
        </button>
      </div>
    </div>
  )
}
