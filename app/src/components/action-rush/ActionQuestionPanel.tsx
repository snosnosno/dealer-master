/**
 * 문제 한 장 — 지문 · 로그 · 테이블 · 입력 · 피드백 · 조항.
 *
 * 축 1 의 `QuestionPanel` 을 쓰지 않는다. 그건 좌석 클릭과 팟 금액칸 두 가지 입력만
 * 알고 `RushQuestion` 유니온에 직접 분기한다 (계획서 §5).
 *
 * 피드백은 **입력 바로 위**에 놓는다. 축 1 에서 버튼 아래에 두었더니 화면 밖으로 밀려
 * 아무도 근거를 안 읽었다. 조항은 그 피드백 안에 붙인다 — 근거와 조항이 떨어져 있으면
 * 둘을 잇는 것이 독자의 일이 된다.
 */
'use client'

import { useState } from 'react'
import { ActionLog } from './ActionLog'
import { ActionTable } from './ActionTable'
import { ArticlePanel } from './ArticlePanel'
import type { ActionQuestion } from '@/lib/action-rush/types'

export type Verdict = { correct: boolean; points: number; headline: string } | null

export function ActionQuestionPanel({
  question,
  index,
  total,
  verdict,
  onAnswerChoice,
  onAnswerNumber,
  onNext,
}: {
  question: ActionQuestion
  index: number
  total: number
  /** 채점 결과. null 이면 아직 푸는 중이다 */
  verdict: Verdict
  onAnswerChoice: (choiceIndex: number) => void
  onAnswerNumber: (value: number) => void
  onNext: () => void
}) {
  /*
   * 입력 상태를 이펙트로 비우지 않는다. 문제마다 이 컴포넌트를 `key` 로 새로 그리므로
   * (page.tsx) 여기 상태는 처음부터 비어 있다 — 비우는 코드가 있으면 그게 곧
   * "가끔 안 비워지는" 버그의 자리가 된다.
   */
  const [picked, setPicked] = useState<number | null>(null)
  const [value, setValue] = useState('')

  const answered = verdict !== null

  function pick(i: number): void {
    if (answered) return
    setPicked(i)
    onAnswerChoice(i)
  }

  function submitNumber(): void {
    if (answered || question.input !== 'number') return
    const raw = value.replace(/[^0-9]/g, '')
    if (raw === '') return
    onAnswerNumber(Number.parseInt(raw, 10))
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="px-4 pt-3 text-[10.5px] font-extrabold uppercase tracking-[0.13em] text-zinc-400">
        {question.label} · {index + 1}/{total}
      </div>
      <p className="break-keep px-4 pb-2.5 pt-0.5 text-[17px] font-bold leading-snug">
        {question.prompt}
      </p>

      <div className="mx-3 mb-2.5">
        <ActionLog rows={question.rows} />
      </div>

      <div className="mx-3 mb-3.5">
        <ActionTable question={question} />
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
              <span className="font-mono font-extrabold">
                +{verdict.points.toLocaleString('ko-KR')}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 break-keep text-[13px] opacity-90">{question.why}</p>
          <div className="mt-2.5">
            <ArticlePanel article={question.article} />
          </div>
        </div>
      ) : null}

      <div className="p-4">
        {question.input === 'number' ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-zinc-400">
                최소 레이즈 총액
              </span>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                placeholder="0"
                disabled={answered}
                /* 채점 뒤에도 사용자가 적은 값을 그대로 둔다 — 무엇을 틀렸는지가 보여야 한다 */
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNumber()
                }}
                className="w-full rounded-xl border-[1.5px] border-zinc-300 bg-white px-3 py-2.5 text-right font-mono text-xl font-extrabold tabular-nums text-zinc-900 disabled:opacity-70 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            {answered ? null : (
              <button
                type="button"
                onClick={submitNumber}
                className="mt-3 w-full rounded-xl bg-dm-teal-600 py-3 text-base font-extrabold text-dm-teal-50"
              >
                확인
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {question.choices.map((choice, i) => {
              /*
               * 채점 전에는 정답이 새면 안 된다. `correct` 를 DOM 속성이나 클래스로
               * 흘리지 말 것 — 축 1 에서 정답 금액이 미리 보였던 결함과 같은 계열이다.
               */
              const state = answered
                ? choice.correct
                  ? 'border-dm-teal-600 bg-dm-teal-50 dark:bg-dm-teal-900/40'
                  : picked === i
                    ? 'border-dm-red bg-dm-red-50 dark:bg-dm-red/20'
                    : 'border-zinc-200 opacity-55 dark:border-zinc-700'
                : 'border-zinc-300 hover:border-dm-teal-600 dark:border-zinc-700'

              return (
                <button
                  key={choice.label}
                  type="button"
                  /* 보기 버튼을 안정적으로 집을 수 있게 둔다 — 클래스로 집으면
                     스타일을 바꿀 때마다 렌더 검증이 깨진다 */
                  data-choice={i}
                  disabled={answered}
                  onClick={() => pick(i)}
                  className={`w-full rounded-xl border-[1.5px] px-3.5 py-2.5 text-left ${state}`}
                >
                  <span className="block break-keep text-[15px] font-bold leading-snug">
                    {choice.label}
                  </span>
                  {choice.note !== undefined ? (
                    <span className="mt-0.5 block break-keep text-[11.5px] text-zinc-500">
                      {choice.note}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
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
        ) : null}
      </div>
    </div>
  )
}
