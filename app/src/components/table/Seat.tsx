/**
 * 좌석 하나.
 *
 * 홀카드 노출의 유일한 기준은 `SeatState.revealed` 다 — 엔진이 showdown_reveal
 * 로만 세운다. UI 가 "폴드 안 했으니 보여줘도 되겠지" 같은 판단을 하지 않는다.
 */
import { Card } from './Card'
import { ChipStack } from './ChipStack'
import { displaySeat } from './log'
import type { SeatState } from '@/lib/simulator'

export function Seat({
  seat,
  seatIndex,
  positionTag,
  hasButton,
}: {
  seat: SeatState
  seatIndex: number
  /** 'SB' | 'BB' | 'BTN' | '' */
  positionTag: string
  hasButton: boolean
}) {
  return (
    <div
      className={`flex w-full flex-col items-center gap-0.5 ${seat.folded ? 'opacity-40' : ''}`}
    >
      <div className="flex gap-0.5">
        {seat.hole.map((card, i) => (
          <Card key={i} card={card} faceUp={seat.revealed} size="sm" />
        ))}
      </div>

      <div className="relative flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5">
        <span className="text-[10px] font-bold text-dm-teal-800">
          {seat.name}({displaySeat(seatIndex)})
        </span>
        {hasButton ? (
          <span className="sim-move flex h-4 w-4 items-center justify-center rounded-full bg-white text-[8px] font-black text-zinc-900 shadow">
            D
          </span>
        ) : null}
        {positionTag ? (
          <span className="rounded bg-dm-amber-400 px-1 text-[7px] font-extrabold text-dm-amber-800">
            {positionTag}
          </span>
        ) : null}
      </div>

      {/*
        * 스택 숫자는 좌석 위치에 따라 펠트 위에도, 펠트 밖 페이지 배경 위에도 놓인다.
        * 배경이 정해지지 않으면 어떤 앰버도 양쪽을 통과하지 못한다 — 실측으로
        * #EF9F27 은 흰 배경 2.17:1(미달), #854F0B 은 펠트 위 1.40:1(미달)이었다.
        * 색이 아니라 배경을 확정한다: 이름 알약과 같은 흰 알약을 깔고 진한 앰버를
        * 얹으면 어디에 놓이든 6.73:1 이다(올인 빨강은 5.94:1).
        */}
      <span
        className={`rounded-full bg-white/95 px-1.5 text-[9px] font-bold ${
          seat.allIn ? 'text-dm-red' : 'text-dm-amber-600'
        }`}
      >
        {seat.allIn ? '올인 ' : ''}
        {seat.stack.toLocaleString('ko-KR')}
      </span>

      {seat.bet > 0 ? (
        <div className="sim-move">
          <ChipStack amount={seat.bet} />
        </div>
      ) : null}
    </div>
  )
}
