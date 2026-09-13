/**
 * 쇼다운 뒤 팟을 받을 좌석을 고른다.
 *
 * **정답을 모른다.** 고른 좌석을 넘길 뿐이고 판정은 `judge` 가 한다 — 승자 판독 패널과
 * 같은 관례다. 동률은 여럿을 고르고, 로우가 서지 않으면 「로우 없음」을 고른다.
 */
'use client'

import { useState } from 'react'
import type { WinnerAsks } from '@/lib/drills/winner/types'

type SeatLike = { name: string; folded: boolean }

export function AwardPanel({
  asks,
  seats,
  onSubmit,
}: {
  asks: WinnerAsks
  seats: readonly SeatLike[]
  onSubmit(hi: number[], lo: number[]): void
}) {
  const [hi, setHi] = useState<number[]>([])
  const [lo, setLo] = useState<number[]>([])
  const [noLow, setNoLow] = useState(false)

  const toggle = (list: number[], seat: number) =>
    list.includes(seat) ? list.filter((s) => s !== seat) : [...list, seat]

  const ready = (!asks.hi || hi.length > 0) && (!asks.lo || lo.length > 0 || noLow)

  const row = (label: string, list: number[], onPick: (seat: number) => void) => (
    <div className="mt-2">
      <p className="text-xs font-bold text-zinc-500">{label}</p>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {seats.map((seat, i) => (
          <button
            key={i}
            type="button"
            disabled={seat.folded}
            aria-pressed={list.includes(i)}
            aria-label={`${label} ${seat.name}`}
            onClick={() => onPick(i)}
            className={`rounded-lg border py-2 text-sm font-bold disabled:opacity-30 ${
              list.includes(i)
                ? 'border-dm-teal-600 bg-dm-teal-600 text-white'
                : 'border-zinc-300 dark:border-zinc-700'
            }`}
          >
            {seat.name}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="mt-3 rounded-xl border border-dm-teal-600 bg-dm-teal-50 p-4 dark:bg-zinc-900">
      <p className="text-sm font-bold text-dm-teal-800 dark:text-dm-teal-100">
        팟을 받을 좌석을 고르세요
      </p>

      {asks.hi ? row('하이', hi, (s) => setHi((prev) => toggle(prev, s))) : null}

      {asks.lo ? (
        <>
          {row('로우', lo, (s) => {
            setNoLow(false)
            setLo((prev) => toggle(prev, s))
          })}
          {/* 자격 조건이 있는 종목만 로우가 안 설 수 있다 — 하이도 묻는 종목이 그렇다 */}
          {asks.hi ? (
            <button
              type="button"
              aria-pressed={noLow}
              onClick={() => {
                setLo([])
                setNoLow(true)
              }}
              className={`mt-2 w-full rounded-lg border py-2 text-sm font-bold ${
                noLow ? 'border-dm-teal-600 bg-dm-teal-600 text-white' : 'border-zinc-300 dark:border-zinc-700'
              }`}
            >
              로우 없음
            </button>
          ) : null}
        </>
      ) : null}

      <button
        type="button"
        disabled={!ready}
        onClick={() => onSubmit(hi, lo)}
        className="mt-3 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white disabled:opacity-40"
      >
        팟 지급
      </button>
    </div>
  )
}
