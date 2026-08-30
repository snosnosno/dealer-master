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
        <span className="text-[10px] font-bold text-[#085041]">
          {seat.name}({displaySeat(seatIndex)})
        </span>
        {hasButton ? (
          <span className="sim-move flex h-4 w-4 items-center justify-center rounded-full bg-white text-[8px] font-black text-zinc-900 shadow">
            D
          </span>
        ) : null}
        {positionTag ? (
          <span className="rounded bg-[#EF9F27] px-1 text-[7px] font-extrabold text-[#4A2F02]">
            {positionTag}
          </span>
        ) : null}
      </div>

      <span className={`text-[9px] font-bold ${seat.allIn ? 'text-[#B23A2E]' : 'text-[#EF9F27]'}`}>
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
