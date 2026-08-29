/**
 * 핸드 종료 리뷰.
 *
 * **등급을 표시하지 않는다.** `gradeFrom` 은 최근 20핸드(GRADE_WINDOW)가 필요한데
 * 그 저장이 3단계 범위다. 부수 효과로 "최고 표시 등급은 senior" 결정이 저절로
 * 지켜진다 — 3단계가 저장을 붙일 때 senior 상한을 그 자리에서 넣는다.
 *
 * **null 축을 0점으로 그리지 않는다.** "측정 안 됨"과 "0점"은 다른 말이고,
 * gradeFrom 의 평균도 null 을 걸러낸다. 화면이 같은 말을 해야 한다.
 */
'use client'

import { scoreHand } from '@/lib/simulator'
import type { Answer, DecisionPoint, DecisionResult } from '@/lib/simulator'

const AXIS_LABEL = {
  procedure: '딜링 절차',
  action_validity: '액션 유효성',
  calculation: '금액 계산',
  showdown: '승자 판정',
} as const

const AXES = ['procedure', 'action_validity', 'calculation', 'showdown'] as const

export function HandReview({
  decisions,
  answers,
  results,
  seed,
  onNext,
}: {
  decisions: DecisionPoint[]
  answers: Answer[]
  results: DecisionResult[]
  seed: string
  onNext: () => void
}) {
  const score = scoreHand(results)
  // scoreHand([]) 의 average 는 0 이지만, 표본이 0개라는 뜻이지 0점을 받았다는 뜻이 아니다.
  // 이 값이 없으면 판단 지점이 0개인 정상 핸드에서 헤더가 거짓으로 "0점"을 찍는다.
  const measured = AXES.some((a) => score[a] !== null)

  return (
    <section className="space-y-4">
      <div className="rounded-2xl bg-[#085041] p-5 text-white">
        <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">핸드 결과</p>
        <p className="mt-1 text-3xl font-extrabold">
          {measured ? `${score.average}점` : '채점 항목 없음'}
        </p>
        <p className="mt-1 text-xs text-white/70">시드 {seed}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {AXES.map((axis) => (
          <div
            key={axis}
            className="rounded-xl border border-zinc-200 p-3 text-center dark:border-zinc-800"
          >
            <p className="text-[11px] text-zinc-500">{AXIS_LABEL[axis]}</p>
            {score[axis] === null ? (
              <p className="mt-1 text-xs font-semibold text-zinc-400">이 핸드에 없었음</p>
            ) : (
              <p className="mt-1 text-lg font-extrabold text-[#0F6E56]">{score[axis]}점</p>
            )}
          </div>
        ))}
      </div>

      {decisions.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
          이 핸드에는 판단 지점이 없었습니다. 핸드마다 판단 지점의 종류와 개수가 다릅니다.
        </p>
      ) : (
        <ol className="space-y-3">
          {decisions.map((dp, i) => (
            <ReviewRow key={i} dp={dp} answer={answers[i]} result={results[i]} />
          ))}
        </ol>
      )}

      <button
        className="w-full rounded-xl bg-zinc-900 px-4 py-3.5 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-900"
        onClick={onNext}
      >
        다음 핸드
      </button>
    </section>
  )
}

function ReviewRow({
  dp,
  answer,
  result,
}: {
  dp: DecisionPoint
  answer?: Answer
  result?: DecisionResult
}) {
  const correct = result?.correct === true
  return (
    <li className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-2 flex items-center gap-2">
        <span className={`text-sm font-black ${correct ? 'text-[#0F6E56]' : 'text-[#B23A2E]'}`}>
          {correct ? '✓' : '✗'}
        </span>
        <span className="text-[11px] font-bold text-zinc-500">{AXIS_LABEL[dp.kind]}</span>
      </div>
      <p className="text-sm font-semibold">{dp.prompt}</p>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-zinc-500">내 답</dt>
          <dd>{formatAnswer(dp, answer)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-zinc-500">정답</dt>
          <dd className="font-semibold text-[#0F6E56]">{formatCorrect(dp)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-[#0F6E56]">
        {dp.ruleRef}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        {dp.explanation}
      </p>
    </li>
  )
}

const num = (v: number) => v.toLocaleString('ko-KR')

function formatAnswer(dp: DecisionPoint, answer?: Answer): string {
  if (answer === undefined || answer.type === 'timeout') return '시간 초과'
  if (answer.type === 'choice' && dp.input.type === 'choice') {
    return dp.input.choices[answer.index] ?? '—'
  }
  if (answer.type === 'seat' && dp.input.type === 'seat') {
    return seatNames(dp, answer.seats)
  }
  if (answer.type === 'number' && dp.input.type === 'number') {
    return dp.input.fields
      .map((f, i) => {
        const v = answer.values[i]
        return `${f.label} ${v === null || v === undefined ? '(빈칸)' : num(v)}`
      })
      .join(' · ')
  }
  return '—'
}

function formatCorrect(dp: DecisionPoint): string {
  if (dp.input.type === 'choice') return dp.input.choices[dp.input.correctIndex]
  if (dp.input.type === 'seat') return seatNames(dp, dp.input.correctSeats)
  return dp.input.fields.map((f) => `${f.label} ${num(f.answer)}`).join(' · ')
}

function seatNames(dp: DecisionPoint, seats: number[]): string {
  if (dp.input.type !== 'seat') return '—'
  const bySeat = new Map(dp.input.options.map((o) => [o.seat, o.label]))
  return seats.map((s) => bySeat.get(s) ?? `좌석 ${s + 1}`).join(', ')
}
