/**
 * 판단 지점 프롬프트와 즉시 피드백.
 *
 * 세 지점이 조용히 틀린 점수를 만든다 — 주석으로 남긴다.
 *  1. 숫자 빈 칸은 `null` 이다. 0 으로 메꾸면 "0 이라고 답했다"로 채점되고,
 *     배열을 앞으로 당기면 사이드팟 답이 메인팟 칸과 대조된다.
 *  2. 칸을 `fields.length` 보다 많이 만들면 `scoreDecision` 이 throw 한다.
 *  3. 좌석 선택은 **항상 다중**이다. 정답이 한 명일 때 단일 선택으로 바꾸면
 *     분할 팟인지 아닌지가 UI 모양으로 새어 나간다.
 */
'use client'

import { useState } from 'react'
import { displaySeat } from '@/components/table/log'
import type { Answer, DecisionPoint, DecisionResult } from '@/lib/simulator'

const KIND_LABEL = {
  procedure: '딜링 절차',
  action_validity: '액션 유효성',
  calculation: '금액 계산',
  showdown: '승자 판정',
} as const

export function DecisionPrompt({
  dp,
  phase,
  remainingMs,
  result,
  answer,
  onAnswer,
  onContinue,
}: {
  dp: DecisionPoint
  phase: 'awaiting' | 'feedback'
  remainingMs: number
  result?: DecisionResult
  answer?: Answer
  onAnswer: (answer: Answer) => void
  onContinue: () => void
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded-full bg-[#E1F5EE] px-2.5 py-1 text-[11px] font-bold text-[#085041]">
          {KIND_LABEL[dp.kind]}
        </span>
        {phase === 'awaiting' ? <Countdown remainingMs={remainingMs} limitSec={dp.timeLimitSec} /> : null}
      </div>

      <h2 className="text-base font-semibold leading-snug">{dp.prompt}</h2>
      <p className="mt-1 text-sm text-zinc-500">{dp.sub}</p>

      {phase === 'awaiting' ? (
        <div className="mt-4">
          <Inputs dp={dp} onAnswer={onAnswer} />
        </div>
      ) : (
        <Feedback dp={dp} result={result} answer={answer} onContinue={onContinue} />
      )}
    </section>
  )
}

function Countdown({ remainingMs, limitSec }: { remainingMs: number; limitSec: number }) {
  const sec = Math.max(0, Math.ceil(remainingMs / 1000))
  const ratio = Math.max(0, Math.min(1, remainingMs / (limitSec * 1000)))
  const urgent = sec <= 5
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-full ${urgent ? 'bg-[#B23A2E]' : 'bg-[#0F6E56]'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className={`text-xs font-bold ${urgent ? 'text-[#B23A2E]' : 'text-zinc-500'}`}>
        {sec}초
      </span>
    </div>
  )
}

const BTN =
  'w-full rounded-xl border border-zinc-300 px-4 py-3 text-left text-sm font-semibold ' +
  'hover:border-[#0F6E56] hover:bg-[#E1F5EE] dark:border-zinc-700 dark:hover:bg-zinc-900'

function Inputs({ dp, onAnswer }: { dp: DecisionPoint; onAnswer: (a: Answer) => void }) {
  if (dp.input.type === 'choice') {
    return (
      <div className="space-y-2">
        {dp.input.choices.map((choice, i) => (
          <button key={i} className={BTN} onClick={() => onAnswer({ type: 'choice', index: i })}>
            {choice}
          </button>
        ))}
      </div>
    )
  }
  if (dp.input.type === 'seat') return <SeatInput dp={dp} onAnswer={onAnswer} />
  return <NumberInput dp={dp} onAnswer={onAnswer} />
}

function SeatInput({ dp, onAnswer }: { dp: DecisionPoint; onAnswer: (a: Answer) => void }) {
  const [picked, setPicked] = useState<number[]>([])
  if (dp.input.type !== 'seat') return null
  const options = dp.input.options

  const toggle = (seat: number) =>
    setPicked((cur) => (cur.includes(seat) ? cur.filter((s) => s !== seat) : [...cur, seat]))

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">여러 명을 고를 수 있습니다.</p>
      {options.map((opt) => (
        <button
          key={opt.seat}
          className={`${BTN} ${picked.includes(opt.seat) ? 'border-[#0F6E56] bg-[#E1F5EE] dark:bg-zinc-900' : ''}`}
          onClick={() => toggle(opt.seat)}
        >
          <span className="mr-2 text-xs text-zinc-500">{displaySeat(opt.seat)}번</span>
          {opt.label}
        </button>
      ))}
      <button
        className="w-full rounded-xl bg-[#085041] px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
        disabled={picked.length === 0}
        onClick={() => onAnswer({ type: 'seat', seats: picked })}
      >
        제출
      </button>
    </div>
  )
}

function NumberInput({ dp, onAnswer }: { dp: DecisionPoint; onAnswer: (a: Answer) => void }) {
  // 칸 개수는 정확히 fields.length 다. 더 만들면 scoreDecision 이 throw 한다.
  const fields = dp.input.type === 'number' ? dp.input.fields : []
  const [text, setText] = useState<string[]>(() => fields.map(() => ''))
  if (dp.input.type !== 'number') return null

  const submit = () =>
    onAnswer({
      type: 'number',
      // 빈 칸은 null 이다. 0 으로 메꾸지도, 배열을 당기지도 않는다.
      values: text.map((t) => {
        const digits = t.replace(/[^0-9]/g, '')
        return digits === '' ? null : Number(digits)
      }),
    })

  return (
    <div className="space-y-3">
      {fields.map((f, i) => (
        <label key={i} className="block">
          <span className="mb-1 block text-xs font-semibold text-zinc-500">{f.label}</span>
          <input
            inputMode="numeric"
            value={text[i]}
            placeholder="0"
            onChange={(e) =>
              setText((cur) => {
                const next = [...cur]
                const digits = e.target.value.replace(/[^0-9]/g, '')
                next[i] = digits === '' ? '' : Number(digits).toLocaleString('ko-KR')
                return next
              })
            }
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-right text-lg font-bold dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      ))}
      <button
        className="w-full rounded-xl bg-[#085041] px-4 py-3 text-sm font-bold text-white"
        onClick={submit}
      >
        제출
      </button>
    </div>
  )
}

function Feedback({
  dp,
  result,
  answer,
  onContinue,
}: {
  dp: DecisionPoint
  result?: DecisionResult
  answer?: Answer
  onContinue: () => void
}) {
  // 피드백에는 타이머가 없다 — 설명을 읽는 것이 훈련의 절반이다.
  const timedOut = answer?.type === 'timeout'
  const correct = result?.correct === true
  /*
   * 숫자 2칸 문항에서 1칸만 맞히면 scoreDecision 이 50 을 준다(hits/fields×100).
   * 그걸 빨간 "오답입니다"로 그리면 학습자에게 완전히 틀린 것으로 읽힌다 — 판정은
   * 맞았는데 액수 하나가 틀린 것과 판정 자체를 틀린 것은 다른 실수다. 세 번째
   * 상태로 가른다. 점수 값은 엔진 그대로다.
   */
  const partial = result !== undefined && !correct && result.score > 0

  const tone = correct
    ? 'bg-[#E1F5EE] text-[#085041]'
    : partial
      ? 'bg-[#FAEEDA] text-[#4A2F02]'
      : 'bg-[#FBEBE8] text-[#B23A2E]'

  const verdict = timedOut
    ? '시간 초과'
    : correct
      ? '정답입니다'
      : partial
        ? '부분 정답'
        : '오답입니다'

  return (
    <div className="mt-4 space-y-3">
      <div className={`rounded-xl px-4 py-3 text-sm font-bold ${tone}`}>
        {verdict}
        {result !== undefined && !correct ? ` · ${result.score} / 100점` : ''}
      </div>

      <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#0F6E56]">
          {dp.ruleRef}
        </p>
        <p className="text-sm leading-relaxed">{dp.explanation}</p>
      </div>

      <button
        className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-900"
        onClick={onContinue}
      >
        계속
      </button>
    </div>
  )
}
