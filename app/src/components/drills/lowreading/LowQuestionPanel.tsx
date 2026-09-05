/**
 * 로우 판독 문제 한 장.
 *
 * **정답 판정은 여기가 아니라 페이지가 한다.** `LowQuestion` 유니온의 어느 갈래인지
 * 아는 것은 이 드릴뿐이고, 공용 뼈대가 그것을 알기 시작하면 드릴이 늘 때마다
 * 뼈대가 부푼다 (`/rush` 가 이미 그 관례로 돈다).
 */
'use client'

import { useState } from 'react'
import { Card } from '@/components/table/Card'
import type { LowQuestion } from '@/lib/drills/lowreading/types'
import type { Verdict } from '@/lib/rush/session'

export function LowQuestionPanel({
  question,
  index,
  total,
  verdict,
  onAnswerYes,
  onAnswerSeats,
  onNext,
}: {
  question: LowQuestion
  index: number
  total: number
  verdict: Verdict
  onAnswerYes(yes: boolean): void
  onAnswerSeats(seats: number[]): void
  onNext(): void
}) {
  const [picked, setPicked] = useState<number[]>([])
  const solving = verdict === null

  const toggle = (seat: number) => {
    setPicked((prev) => (prev.includes(seat) ? prev.filter((s) => s !== seat) : [...prev, seat]))
  }

  return (
    <section className="mt-3">
      <p className="text-[11px] text-zinc-500">
        {index + 1} / {total} · {question.label}
      </p>
      <p className="mt-1 text-base font-bold">{question.prompt}</p>

      {/*
        * 펠트 초록은 `--felt` 로 쓰지 않는다 — 그 변수는 `.sim-root` 에만 있어서
        * 여기서는 값이 비고, 캡션이 어두운 본문색 그대로 어두운 판 위에 얹힌다.
        * `dm-teal-800`/`dm-teal-50` 은 같은 색을 내는 전역 토큰이다.
        */}
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
            {question.kind !== 'lo-possible' ? (
              <button
                type="button"
                disabled={!solving}
                onClick={() => (question.kind === 'lo-best' ? onAnswerSeats([i]) : toggle(i))}
                className={`ml-auto rounded-lg border px-3 py-1 text-xs font-bold disabled:opacity-40 ${
                  picked.includes(i)
                    ? 'border-dm-teal-600 bg-dm-teal-50 text-dm-teal-800'
                    : 'border-zinc-300 dark:border-zinc-700'
                }`}
              >
                {question.kind === 'lo-best' ? '이 좌석' : picked.includes(i) ? '선택됨' : '선택'}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {question.kind === 'lo-possible' ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!solving}
            onClick={() => onAnswerYes(true)}
            className="rounded-xl border border-zinc-300 py-3 text-sm font-bold disabled:opacity-40 dark:border-zinc-700"
          >
            성립합니다
          </button>
          <button
            type="button"
            disabled={!solving}
            onClick={() => onAnswerYes(false)}
            className="rounded-xl border border-zinc-300 py-3 text-sm font-bold disabled:opacity-40 dark:border-zinc-700"
          >
            성립하지 않습니다
          </button>
        </div>
      ) : null}

      {question.kind === 'lo-qualified' && solving ? (
        <button
          type="button"
          onClick={() => onAnswerSeats(picked)}
          className="mt-4 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white"
        >
          확인
        </button>
      ) : null}

      {verdict !== null ? (
        <div className="mt-4">
          <p className="text-sm font-bold">{verdict.headline}</p>
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
