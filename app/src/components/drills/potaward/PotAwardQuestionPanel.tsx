/**
 * 팟 분배 문제 한 장.
 *
 * **정답 판정을 여기 쓰지 마라.** 이 컴포넌트는 고른 좌석과 입력한 금액을 `onSubmit`
 * 으로 넘길 뿐이고, 맞았는지는 페이지가 문제의 `answerSeats`·`answerAmount` 와
 * 대조해 정한다 (전역 제약 1).
 *
 * **묻는 팟의 금액을 화면에 적지 않는다.** 적으면 「이 팟은 얼마입니까」가 읽기 문제가
 * 되고, 층을 세는 일 — 이 드릴이 가르치려는 바로 그 일 — 이 통째로 빠진다.
 * 자격자와 각자가 앞에 낸 칩은 테이블에 있으므로 셀 수 있다.
 *
 * 로컬 선택 상태는 페이지의 `key={index}` 에 기대어 리셋된다 — 의도된 결합이다.
 */
'use client'

import { useState } from 'react'
import { PokerTable } from '@/components/table/PokerTable'
import { potName } from '@/lib/drills/potaward/potname'
import type { PotAwardQuestion } from '@/lib/drills/potaward/types'
import { digitsOnly, parseAmount } from '@/lib/rush/amount'
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
  /** 고른 좌석(동점이면 여럿이라 배열이다)과 입력한 금액 */
  onSubmit(answer: { seats: number[]; amount: number }): void
  onNext(): void
}) {
  const [picked, setPicked] = useState<number[]>([])
  const [text, setText] = useState('')
  const asked = question.pots[question.potIndex]
  const solving = verdict === null

  // `text` 는 숫자만, 아홉 자리 이하다 — `Number` 가 늘 안전 정수를 낸다
  const amount = parseAmount(text)
  // 0 으로는 제출하지 못한다. 어떤 팟도 0 일 수 없으므로 답이 될 수 없고,
  // 빈 칸을 잘못 눌러 「틀렸다」를 받는 것은 계산을 틀린 것과 다른 일이다
  const ready = picked.length > 0 && Number.isSafeInteger(amount) && amount > 0

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

      <p className="mt-3 break-keep text-sm font-bold">{question.prompt}</p>
      <p className="text-xs text-zinc-500">
        {/*
         * 팟 이름을 알약으로 **감싼다**. 예전에 「사이드팟 2 4,800」이 「24,800」 한
         * 덩어리로 읽혔다 — 구분 문자로는 못 고친다: 이 줄은 자격 목록에서 이미
         * `·` 를 쓰고, `—` 는 범위로, `:` 는 비로 읽힐 자리다. 경계 자체를 그린다.
         * 이름을 번호에서 말(메인팟·세컨드팟·서드팟)로 바꾼 뒤에도 알약은 남긴다 —
         * 층이 넷을 넘으면 다시 번호로 떨어지기 때문이다.
         */}
        <span className="rounded bg-zinc-200 px-1 font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {potName(question.potIndex)}
        </span>{' '}
        자격 {asked.eligibleSeats.map((s) => question.seats[s].name).join(' · ')}
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

      <label className="mt-3 flex flex-col gap-1">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-zinc-400">
          {question.amountLabel}
        </span>
        <input
          inputMode="numeric"
          aria-label={question.amountLabel}
          value={text}
          onChange={(e) => setText(digitsOnly(e.target.value))}
          disabled={!solving}
          placeholder="금액"
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-right text-lg font-bold tabular-nums disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      {/* 자릿점을 찍어 되읽어 준다 — 0 세 개를 더 친 것을 여기서 알아챈다 */}
      {amount > 0 ? (
        <p className="mt-1 text-right text-xs text-zinc-500">{won(amount)}</p>
      ) : null}

      {solving ? (
        <button
          type="button"
          onClick={() => onSubmit({ seats: picked, amount })}
          disabled={!ready}
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
          <p className="mt-2 break-keep rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
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
