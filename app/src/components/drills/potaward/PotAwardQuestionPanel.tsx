/**
 * 팟 분배 문제 한 장.
 *
 * **정답 판정을 여기 쓰지 마라.** 이 컴포넌트는 고른 좌석을 `onSubmit` 으로 넘길 뿐이고,
 * 맞았는지는 페이지가 문제의 `answerSeats` 와 대조해 정한다 (전역 제약 1).
 *
 * 로컬 선택 상태는 페이지의 `key={index}` 에 기대어 리셋된다 — 의도된 결합이다.
 */
'use client'

import { useState } from 'react'
import { PokerTable } from '@/components/table/PokerTable'
import type { PotAwardQuestion } from '@/lib/drills/potaward/types'
import type { Verdict } from '@/lib/rush/session'

const won = (n: number) => n.toLocaleString('ko-KR')

export function PotAwardQuestionPanel({
  question,
  index,
  total,
  verdict,
  onSubmit,
  onNext,
}: {
  question: PotAwardQuestion
  index: number
  total: number
  verdict: Verdict
  /** 고른 좌석. 동점이면 여럿이라 배열이다 */
  onSubmit(seats: number[]): void
  onNext(): void
}) {
  const [picked, setPicked] = useState<number[]>([])
  const asked = question.pots[question.potIndex]
  const solving = verdict === null

  const toggle = (seat: number) => {
    if (!solving) return
    setPicked((cur) => (cur.includes(seat) ? cur.filter((s) => s !== seat) : [...cur, seat]))
  }

  return (
    <div>
      {/* 슬래시 양옆을 띄운다 — 승자 판독 패널과 같은 줄이어야 한다 */}
      <p className="mb-1 text-xs text-zinc-500">
        {index + 1} / {total} · {question.label}
      </p>

      <div className="sim-root">
        <PokerTable
          state={{
            seats: question.seats.map((s) => ({
              name: s.name,
              stack: 0,
              bet: s.contributed,
              folded: s.folded,
              allIn: s.allIn,
              hole: s.hole,
              revealed: true,
            })),
            buttonSeat: question.buttonSeat,
            board: question.board,
            pot: 0,
          }}
          burnCount={0}
        />
      </div>

      <p className="mt-3 text-sm font-bold">{question.prompt}</p>
      <p className="text-xs text-zinc-500">
        {/*
         * 팟 이름을 알약으로 **감싼다**. 사이드팟은 이름이 숫자로 끝나서
         * 「사이드팟 2 4,800」이 「24,800」 한 덩어리로 읽혔다 — 트레이니가 묻지 않은
         * 금액을 보고 답한다. 구분 문자로는 못 고친다: 이 줄은 자격 목록에서 이미
         * `·` 를 쓰고, `—` 는 범위로, `:` 는 비로 읽힐 자리다. 경계 자체를 그린다.
         * 팟 러시(`RushTable`)도 팟 이름과 금액을 따로 놓는다 — 같은 손이다.
         */}
        <span className="rounded bg-zinc-200 px-1 font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {question.potIndex === 0 ? '메인팟' : `사이드팟 ${question.potIndex}`}
        </span>{' '}
        <b>{won(asked.amount)}</b> · 자격{' '}
        {asked.eligibleSeats.map((s) => question.seats[s].name).join(' · ')}
      </p>

      <div className="mt-2 grid grid-cols-4 gap-2">
        {question.seats.map((seat, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            disabled={!solving}
            aria-pressed={picked.includes(i)}
            className={`rounded-lg border py-2 text-sm font-bold disabled:opacity-40 ${
              picked.includes(i)
                ? 'border-dm-teal-600 bg-dm-teal-50 text-dm-teal-800'
                : 'border-zinc-300 dark:border-zinc-700'
            }`}
          >
            {seat.name}
          </button>
        ))}
      </div>

      {verdict === null ? (
        <button
          type="button"
          onClick={() => onSubmit(picked)}
          disabled={picked.length === 0}
          className="mt-3 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          제출
        </button>
      ) : (
        <>
          {/*
           * 맞았는지 틀렸는지를 먼저 말한다. 근거만 보여 주면 트레이니는 자기 답이
           * 어느 쪽이었는지 모른 채로 다음 문제로 간다 — 드릴이 성립하지 않는다
           */}
          <p className="mt-3 text-sm font-bold">{verdict.headline}</p>
          <p className="mt-2 rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
            {question.why}
          </p>
          <button
            type="button"
            onClick={onNext}
            className="mt-2 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white"
          >
            다음
          </button>
        </>
      )}
    </div>
  )
}
