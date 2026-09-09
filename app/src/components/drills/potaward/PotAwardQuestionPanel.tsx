/**
 * 팟 분배 문제 한 장. **한 장이 한 판이다** — 층마다 하이·로우 임자를 고른다.
 *
 * **정답 판정을 여기 쓰지 마라.** 이 컴포넌트는 고른 것을 `onSubmit` 으로 넘길 뿐이고,
 * 맞았는지는 페이지가 문제의 `answers` 와 대조해 정한다 (전역 제약 1).
 *
 * **하이도 로우도 여럿 고를 수 있다.** 하이가 동점이면 하이가 여럿이고, 같은 누트
 * 로우를 둘이 쥐면 로우가 여럿이다 — 하나만 고르게 만들면 그 판을 낼 수 없다.
 * 한 사람을 하이·로우 양쪽에 고르면 그게 스쿱이다.
 *
 * **자격 없는 좌석은 누를 수 없다.** 위층에 자격이 없는 사람을 그 층의 임자로
 * 고르는 답은 포커에 존재하지 않는다 — 답이 될 수 없는 것을 답으로 받지 않는다.
 *
 * 로컬 선택 상태는 페이지의 `key={index}` 에 기대어 리셋된다 — 의도된 결합이다.
 */
'use client'

import { useState } from 'react'
import { PokerTable } from '@/components/table/PokerTable'
import { potName } from '@/lib/drills/potaward/potname'
import type { PotAwardPotAnswer, PotAwardQuestion } from '@/lib/drills/potaward/types'
import type { Verdict } from '@/lib/rush/session'

/** 고르는 중인 한 팟. `loNone` 은 「로우 없음」을 **눌러서** 정했다는 뜻이다 */
type Picking = { hi: number[]; lo: number[]; loNone: boolean }

const toggle = (list: number[], seat: number) =>
  list.includes(seat) ? list.filter((s) => s !== seat) : [...list, seat]

function SeatRow({
  label,
  seats,
  eligible,
  picked,
  disabled,
  onPick,
}: {
  label: string
  seats: readonly { name: string }[]
  eligible: readonly number[]
  picked: readonly number[]
  disabled: boolean
  onPick(seat: number): void
}) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="w-7 shrink-0 text-[11px] font-extrabold text-zinc-500">{label}</span>
      <div className="grid flex-1 grid-cols-4 gap-1.5">
        {seats.map((seat, i) => {
          const can = eligible.includes(i)
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(i)}
              disabled={disabled || !can}
              aria-pressed={picked.includes(i)}
              className={`rounded-lg border py-1.5 text-xs font-bold disabled:opacity-30 ${
                picked.includes(i)
                  ? 'border-dm-teal-600 bg-dm-teal-50 text-dm-teal-800'
                  : 'border-zinc-300 dark:border-zinc-700'
              }`}
            >
              {seat.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

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
  /** 팟마다 하나. `question.pots` 와 같은 순서다 */
  onSubmit(picked: PotAwardPotAnswer[]): void
  onNext(): void
}) {
  const [picks, setPicks] = useState<Picking[]>(() =>
    question.pots.map(() => ({ hi: [], lo: [], loNone: false })),
  )
  const solving = verdict === null

  const edit = (potIndex: number, next: (cur: Picking) => Picking) => {
    if (!solving) return
    setPicks((cur) => cur.map((p, i) => (i === potIndex ? next(p) : p)))
  }

  /*
   * 층마다 하이를 하나 이상 고르고, 로우는 고르거나 「없음」을 눌러야 끝난다.
   * 로우를 비워 둔 것과 「로우가 없다」고 판단한 것은 다른 일이다 — 빈 칸을
   * 그대로 제출로 받으면 안 고른 답이 「로우 없음」으로 채점된다.
   */
  const ready = picks.every((p) => p.hi.length > 0 && (p.lo.length > 0 || p.loNone))

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

      {question.pots.map((pot, p) => (
        <div key={p} className="mt-2 rounded-xl border border-zinc-200 p-2.5 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">
            {/*
             * 팟 이름을 알약으로 **감싼다**. 예전에 「사이드팟 2 4,800」이 「24,800」
             * 한 덩어리로 읽혔다 — 경계 자체를 그려서 막는다. 이름을 말로 바꾼
             * 뒤에도 알약은 남긴다: 층이 넷을 넘으면 다시 번호로 떨어지기 때문이다.
             *
             * 금액은 적지 않는다. 층을 세는 것도 이 드릴이 가르치는 일이고,
             * 정답이 임자라 금액을 적어 줄 이유가 없다 — 채점 뒤 근거에서 보여준다.
             */}
            <span className="rounded bg-zinc-200 px-1 font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {potName(p)}
            </span>{' '}
            자격 {pot.eligibleSeats.map((s) => question.seats[s].name).join(' · ')}
          </p>

          <SeatRow
            label="하이"
            seats={question.seats}
            eligible={pot.eligibleSeats}
            picked={picks[p].hi}
            disabled={!solving}
            onPick={(seat) => edit(p, (cur) => ({ ...cur, hi: toggle(cur.hi, seat) }))}
          />

          <SeatRow
            label="로우"
            seats={question.seats}
            eligible={pot.eligibleSeats}
            picked={picks[p].lo}
            disabled={!solving || picks[p].loNone}
            onPick={(seat) => edit(p, (cur) => ({ ...cur, lo: toggle(cur.lo, seat) }))}
          />

          <button
            type="button"
            onClick={() =>
              edit(p, (cur) => ({ ...cur, loNone: !cur.loNone, lo: cur.loNone ? cur.lo : [] }))
            }
            disabled={!solving}
            aria-pressed={picks[p].loNone}
            className={`mt-1.5 w-full rounded-lg border py-1.5 text-xs font-bold disabled:opacity-40 ${
              picks[p].loNone
                ? 'border-dm-amber-400 bg-dm-amber-50 text-dm-amber-800'
                : 'border-zinc-300 dark:border-zinc-700'
            }`}
          >
            로우 없음 — 하이가 통째로
          </button>
        </div>
      ))}

      {solving ? (
        <button
          type="button"
          onClick={() => onSubmit(picks.map((p) => ({ hi: p.hi, lo: p.lo })))}
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
          <div className="mt-2 rounded-xl bg-zinc-100 px-4 py-3 dark:bg-zinc-900">
            {question.reasons.map((line, i) => (
              <p key={i} className={`break-keep text-sm ${i > 0 ? 'mt-1' : ''}`}>
                {line}
              </p>
            ))}
          </div>
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
