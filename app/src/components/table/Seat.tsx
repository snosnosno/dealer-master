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
  actLabel = '',
  isHero = false,
}: {
  seat: SeatState
  seatIndex: number
  /** 'SB' | 'BB' | 'BTN' | '' */
  positionTag: string
  hasButton: boolean
  /**
   * 이 좌석이 한 액션 — '체크' · '폴드' · '콜 4,000' · '차례'.
   *
   * **칩만으로는 순서를 읽을 수 없다.** 앞에 칩이 없는 좌석이 체크한 것인지 아직
   * 차례가 오지 않은 것인지 그림은 말해 주지 않는다. 스택 자리에 함께 놓아
   * 좌석 상자 높이를 늘리지 않는다 — 링을 당겨 둔 탓에 한 줄만 늘어도 겹친다.
   */
  actLabel?: string
  /** 문제를 받는 좌석인가. 지문에만 이름이 있으면 매번 지문을 다시 읽게 된다 */
  isHero?: boolean
}) {
  return (
    <div
      className={`flex w-full flex-col items-center gap-0.5 ${seat.folded ? 'opacity-40' : ''}`}
    >
      {/*
        * 홀카드는 `xs` 다. 종목이 몇 장을 주는지는 스펙이 정하므로 이 줄은 넉 장까지
        * 견뎌야 한다 — `sm` 이면 오마하 4장에서 줄이 좌석 상자보다 넓어져 바깥
        * 카드가 펠트를 벗어난다(360px 에서 14.5px 초과). 카드 크기는 고정 px 이고
        * 좌표만 퍼센트라 화면이 좁아질수록 이 초과가 커진다.
        */}
      <div className="flex gap-0.5">
        {seat.hole.map((card, i) => (
          <Card key={i} card={card} faceUp={seat.revealed} size="xs" />
        ))}
      </div>

      <div
        className={`relative flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 ${
          isHero ? 'ring-2 ring-dm-amber-400' : ''
        }`}
      >
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
      {/*
        * 스택이 0 이면 숫자를 지운다. 스택을 쓰지 않는 드릴(팟 분배·팟리밋 계산)이
        * 0 을 넘기는데, 그 「0」은 좌석마다 붙어 훈련생에게 **모두가 빈털터리라는
        * 거짓말**을 한다. 올인은 스택이 0 이어도 그 사실 자체가 정보라 남긴다.
        */}
      {seat.stack > 0 || seat.allIn ? (
        <span
          className={`rounded-full bg-white/95 px-1.5 text-[9px] font-bold ${
            seat.allIn ? 'text-dm-red' : 'text-dm-amber-600'
          }`}
        >
          {seat.allIn ? '올인 ' : ''}
          {seat.stack.toLocaleString('ko-KR')}
        </span>
      ) : null}

      {actLabel ? (
        <span
          className={`rounded-full px-1.5 text-[9px] font-bold ${
            isHero ? 'bg-dm-amber-400 text-dm-amber-800' : 'bg-white/95 text-zinc-600'
          }`}
        >
          {actLabel}
        </span>
      ) : null}

      {seat.bet > 0 ? (
        <div className="sim-move">
          <ChipStack amount={seat.bet} />
        </div>
      ) : null}
    </div>
  )
}
