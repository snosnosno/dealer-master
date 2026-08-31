/**
 * 문제 한 장 — 지문 · 테이블 · 입력 · 피드백.
 *
 * 피드백은 **테이블과 입력 사이**가 아니라 입력 바로 위에 놓는다. 프로토타입에서
 * 버튼 아래에 두었더니 화면 밖으로 밀려 아무도 근거를 안 읽었다.
 */
'use client'

import { useState } from 'react'
import { RushTable } from './RushTable'
import type { RushQuestion } from '@/lib/rush/types'

export type Verdict = { correct: boolean; points: number; headline: string } | null

export function QuestionPanel({
  question,
  index,
  total,
  verdict,
  onAnswerSeats,
  onAnswerFields,
  onNext,
}: {
  question: RushQuestion
  index: number
  total: number
  /** 채점 결과. null 이면 아직 푸는 중이다 */
  verdict: Verdict
  onAnswerSeats: (seats: number[]) => void
  onAnswerFields: (values: number[]) => void
  onNext: () => void
}) {
  /*
   * 입력 상태를 이펙트로 비우지 않는다. 문제마다 이 컴포넌트를 `key` 로 새로 그리므로
   * (page.tsx) 여기 상태는 처음부터 비어 있다 — 비우는 코드가 있으면 그게 곧
   * "가끔 안 비워지는" 버그의 자리가 된다.
   */
  const [marks, setMarks] = useState<number[]>([])
  const [values, setValues] = useState<string[]>([])

  const answered = verdict !== null
  const isSeatKind = question.kind !== 'sidepots'
  const isMulti = question.kind === 'split'

  const correctSeats =
    question.kind === 'split'
      ? question.answerSeats
      : question.kind === 'sidepots'
        ? []
        : [question.answerSeat]

  function pick(seat: number): void {
    if (answered) return
    if (isMulti) {
      setMarks((prev) => (prev.includes(seat) ? prev.filter((s) => s !== seat) : [...prev, seat]))
      return
    }
    setMarks([seat])
    onAnswerSeats([seat])
  }

  function submitFields(): void {
    if (answered || question.kind !== 'sidepots') return
    const parsed = question.fields.map((_, i) => {
      const raw = (values[i] ?? '').replace(/[^0-9]/g, '')
      return raw === '' ? Number.NaN : Number.parseInt(raw, 10)
    })
    if (parsed.some(Number.isNaN)) return
    onAnswerFields(parsed)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="px-4 pt-3 text-[10.5px] font-extrabold uppercase tracking-[0.13em] text-zinc-400">
        {question.label} · {index + 1}/{total}
      </div>
      <p className="break-keep px-4 pb-3 pt-0.5 text-[17px] font-bold leading-snug">
        {question.prompt}
      </p>

      <div className="mx-3 mb-3.5">
        <RushTable
          question={question}
          selectable={isSeatKind && !answered}
          multiSelect={isMulti}
          marks={marks}
          answered={answered}
          correctSeats={correctSeats}
          onPick={pick}
        />
      </div>

      {answered ? (
        <div
          role="status"
          className={`border-t px-4 py-3 text-sm ${
            verdict.correct
              ? 'border-dm-teal-100 bg-dm-teal-50 text-dm-teal-800 dark:bg-dm-teal-900/40 dark:text-dm-teal-100'
              : 'border-dm-red-50 bg-dm-red-50 text-dm-red dark:bg-dm-red/20 dark:text-dm-red-50'
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-base font-extrabold">{verdict.headline}</span>
            {verdict.points > 0 ? (
              <span className="font-mono font-extrabold">+{verdict.points.toLocaleString('ko-KR')}</span>
            ) : null}
          </div>
          <p className="mt-0.5 break-keep text-[13px] opacity-90">{question.why}</p>
        </div>
      ) : null}

      <div className="p-4">
        {question.kind === 'sidepots' ? (
          <div className="flex flex-wrap gap-2.5">
            {question.fields.map((field, i) => (
              <label key={field.label} className="flex min-w-[120px] flex-1 flex-col gap-1">
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-zinc-400">
                  {field.label}
                </span>
                <input
                  autoFocus={i === 0}
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  disabled={answered}
                  /* 채점 뒤에도 사용자가 적은 값을 그대로 둔다 — 무엇을 틀렸는지가 보여야 한다.
                     정답 금액은 아래 근거 줄과 좌석 앞 숫자로 공개된다 */
                  value={values[i] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => {
                      const next = [...prev]
                      next[i] = e.target.value
                      return next
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitFields()
                  }}
                  className="w-full rounded-xl border-[1.5px] border-zinc-300 bg-white px-3 py-2.5 text-right font-mono text-xl font-extrabold tabular-nums text-zinc-900 disabled:opacity-70 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>
            ))}
          </div>
        ) : (
          <p className="break-keep text-[12.5px] text-zinc-500">
            {isMulti
              ? '나눠 갖는 좌석을 모두 고르세요. 한 명이라도 틀리면 오답이다.'
              : '위에서 좌석을 누르세요.'}
          </p>
        )}

        {answered ? (
          <button
            type="button"
            autoFocus
            onClick={onNext}
            className="mt-3 w-full rounded-xl bg-dm-teal-600 py-3 text-base font-extrabold text-dm-teal-50"
          >
            {index + 1 >= total ? '결과 보기' : '다음 문제'}
          </button>
        ) : question.kind === 'sidepots' ? (
          <button
            type="button"
            onClick={submitFields}
            className="mt-3 w-full rounded-xl bg-dm-teal-600 py-3 text-base font-extrabold text-dm-teal-50"
          >
            확인
          </button>
        ) : isMulti ? (
          <button
            type="button"
            disabled={marks.length === 0}
            onClick={() => onAnswerSeats(marks)}
            className="mt-3 w-full rounded-xl bg-dm-teal-600 py-3 text-base font-extrabold text-dm-teal-50 disabled:opacity-40"
          >
            확인
          </button>
        ) : null}
      </div>
    </div>
  )
}
