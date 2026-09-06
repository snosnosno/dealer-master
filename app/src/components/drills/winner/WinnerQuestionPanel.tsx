/**
 * 승자 판독 문제 한 장.
 *
 * **정답 판정은 여기가 아니라 페이지가 한다.** 이 컴포넌트는 고른 좌석을 `onSubmit` 으로
 * 넘겨줄 뿐이다 — 공용 뼈대와 패널이 정답을 알기 시작하면 드릴이 늘 때마다 둘 다 부푼다
 * (`/rush` 가 이미 그 관례로 돈다).
 */
'use client'

import { useState } from 'react'
import { Card } from '@/components/table/Card'
import type { WinnerQuestion } from '@/lib/drills/winner/types'
import type { Verdict } from '@/lib/rush/session'

const asc = (a: number, b: number) => a - b

export function WinnerQuestionPanel({
  question,
  index,
  total,
  verdict,
  onSubmit,
  onNext,
}: {
  question: WinnerQuestion
  index: number
  total: number
  verdict: Verdict
  /** 고른 좌석. 로우를 「없음」으로 고르면 `lo` 가 빈 배열이다 */
  onSubmit(hi: number[], lo: number[]): void
  onNext(): void
}) {
  const [hi, setHi] = useState<number[]>([])
  const [lo, setLo] = useState<number[]>([])
  /**
   * 「로우 없음」을 **명시적으로** 골랐는가. 아무것도 안 고른 것과 없음을 고른 것을
   * 구분하지 않으면 제출 버튼을 언제 열지 정할 수 없다 (설계 §5).
   */
  const [noLow, setNoLow] = useState(false)
  const solving = verdict === null

  const toggle = (list: number[], seat: number) =>
    list.includes(seat) ? list.filter((s) => s !== seat) : [...list, seat]

  const pickHi = (seat: number) => setHi((prev) => toggle(prev, seat))
  const pickLo = (seat: number) => {
    setNoLow(false)
    setLo((prev) => toggle(prev, seat))
  }
  const pickNoLow = () => {
    setLo([])
    setNoLow(true)
  }

  const ready =
    (!question.asks.hi || hi.length > 0) && (!question.asks.lo || lo.length > 0 || noLow)

  const names = (seats: number[]) =>
    seats.length === 0 ? '없음' : [...seats].sort(asc).map((s) => question.seats[s].name).join(' · ')

  /** 내가 고른 것. 시간이 먼저 끝나면 고른 것이 없다 */
  const pickedText = (list: number[], picked: boolean) => (picked ? names(list) : '고른 것 없음')

  const seatButton = (seat: number, list: number[], onPick: (seat: number) => void) => (
    <button
      type="button"
      disabled={!solving}
      aria-pressed={list.includes(seat)}
      onClick={() => onPick(seat)}
      className={`rounded-lg border px-2 py-1.5 text-xs font-bold disabled:opacity-40 ${
        list.includes(seat)
          ? 'border-dm-teal-600 bg-dm-teal-50 text-dm-teal-800'
          : 'border-zinc-300 dark:border-zinc-700'
      }`}
    >
      {question.seats[seat].name}
    </button>
  )

  return (
    <section className="mt-3">
      <p className="text-[11px] text-zinc-500">
        {index + 1} / {total} · {question.label}
      </p>
      <p className="mt-1 text-base font-bold">{question.prompt}</p>

      {/* 펠트 초록은 `--felt` 로 쓰지 않는다 — 그 변수는 `.sim-root` 에만 있다 */}
      <div className="mt-3 rounded-xl bg-dm-teal-800 p-3">
        <p className="text-[10px] font-bold text-dm-teal-50">보드</p>
        <div className="mt-1 flex gap-1">
          {question.board.map((card, i) => (
            <Card key={i} card={card} faceUp size="sm" />
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {question.seats.map((seat, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-10 text-xs font-bold">{seat.name}</span>
            <div className="flex gap-1">
              {seat.hole.map((card, j) => (
                <Card key={j} card={card} faceUp size="sm" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {question.asks.hi ? (
        <div className="mt-4">
          <p className="text-xs font-bold text-zinc-500">하이 승자</p>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {question.seats.map((_, i) => seatButton(i, hi, pickHi))}
          </div>
        </div>
      ) : null}

      {question.asks.lo ? (
        <div className="mt-3">
          <p className="text-xs font-bold text-zinc-500">로우 승자</p>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {question.seats.map((_, i) => seatButton(i, lo, pickLo))}
          </div>
          <button
            type="button"
            disabled={!solving}
            aria-pressed={noLow}
            onClick={pickNoLow}
            className={`mt-1.5 w-full rounded-lg border py-1.5 text-xs font-bold disabled:opacity-40 ${
              noLow
                ? 'border-dm-teal-600 bg-dm-teal-50 text-dm-teal-800'
                : 'border-zinc-300 dark:border-zinc-700'
            }`}
          >
            로우 없음
          </button>
        </div>
      ) : null}

      {solving ? (
        <button
          type="button"
          disabled={!ready}
          onClick={() => onSubmit(hi, lo)}
          className="mt-4 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          확인
        </button>
      ) : null}

      {verdict !== null ? (
        <div className="mt-4">
          <p className="text-sm font-bold">{verdict.headline}</p>

          {/*
           * 틀렸을 때도 정답을 가리지 않는다 — 연습이기 때문이다.
           * 하이와 로우를 갈라서 보여준다: 채점은 이진이지만 어디서 틀렸는지는 알아야 한다
           */}
          <div className="mt-3 space-y-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            {question.asks.hi ? (
              <p className="text-zinc-600 dark:text-zinc-400">
                <span className="font-bold text-zinc-400 dark:text-zinc-500">하이 </span>
                내가 고른 것 {pickedText(hi, hi.length > 0)} · 정답 {names(question.answerHi)}
              </p>
            ) : null}
            {question.asks.lo ? (
              <p className="text-zinc-600 dark:text-zinc-400">
                <span className="font-bold text-zinc-400 dark:text-zinc-500">로우 </span>
                내가 고른 것 {pickedText(lo, lo.length > 0 || noLow)} · 정답{' '}
                {names(question.answerLo)}
              </p>
            ) : null}
            <p
              className={
                verdict.correct
                  ? 'text-dm-teal-800 dark:text-dm-teal-100'
                  : 'font-bold text-dm-red dark:text-dm-red-50'
              }
            >
              {question.why}
            </p>
          </div>

          <button
            type="button"
            onClick={onNext}
            className="mt-2 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white"
          >
            다음 문제
          </button>
        </div>
      ) : null}
    </section>
  )
}
