/**
 * 오벌 테이블. 좌석 좌표는 타원 파라메트릭이고 하단 중앙은 딜러 자리로 비어 있다.
 * 이 컴포넌트는 상태를 만들지 않는다 — HandState 를 받아 그리기만 한다.
 *
 * 좌표는 아래 디자인 박스(LAYOUT_W × LAYOUT_H) 안의 px 로 적고, 그리기 직전에
 * **퍼센트로 환산**한다. 컨테이너가 디자인 폭보다 좁아지면 좌석·펠트·보드가 같은
 * 비율로 함께 줄어든다 — 360px 안드로이드 폭에서 오른쪽 좌석이 잘리던 원인이
 * 좌표를 px 고정으로 박아 둔 것이었다.
 *
 * JS 로 컨테이너를 재지 않는다. 측정값은 서버에 없어서 하이드레이션이 어긋난다
 * (2단계에서 실제로 겪은 결함이다). 퍼센트는 CSS 가 혼자 푼다.
 */
'use client'

import { Card } from './Card'
import { ChipStack } from './ChipStack'
import { Seat } from './Seat'
import { seatOffset } from './geometry'
import type { HandState } from '@/lib/simulator'

/** 디자인 박스. 폭은 **좌석 상자의 바깥쪽 끝까지** 포함한 값이다. */
const LAYOUT_W = 360
const LAYOUT_H = 320
const CENTER_X = LAYOUT_W / 2
/** 중심을 살짝 위로 둔다 — 하단에 딜러(나) 라벨 자리가 필요하다. */
const CENTER_Y = 152
const RADIUS_X = 124
const RADIUS_Y = 106
/** 좌석 상자 폭. 반지름 + 이 값의 절반이 LAYOUT_W 안에 들어와야 한다. */
const SEAT_W = 96

/** 디자인 px → 컨테이너 비율. 문자열을 고정 자릿수로 만들어 SSR/클라이언트가 같게 나온다. */
const px = (v: number, total: number) => `${((v / total) * 100).toFixed(4)}%`
const x = (v: number) => px(v, LAYOUT_W)
const y = (v: number) => px(v, LAYOUT_H)

/** 버튼 기준 포지션 태그. 3인 테이블은 역할이 겹치는데 그건 3인의 사실이다. */
function positionTags(seatCount: number, buttonSeat: number): string[] {
  const tags = Array.from({ length: seatCount }, () => '')
  tags[(buttonSeat + 1) % seatCount] = 'SB'
  tags[(buttonSeat + 2) % seatCount] = 'BB'
  return tags
}

export function PokerTable({
  state,
  burnCount,
}: {
  state: HandState
  /** 지금까지 번된 카드 수. HandState 에 없으므로(번은 상태를 바꾸지 않는다) 밖에서 센다. */
  burnCount: number
}) {
  const n = state.seats.length
  const tags = positionTags(n, state.buttonSeat)

  return (
    <div
      className="relative mx-auto w-full"
      style={{ maxWidth: LAYOUT_W, aspectRatio: `${LAYOUT_W} / ${LAYOUT_H}` }}
    >
      <div
        className="absolute rounded-[50%] border-8 border-[var(--felt-edge)] bg-[var(--felt)]"
        style={{
          left: x(CENTER_X - RADIUS_X),
          top: y(CENTER_Y - RADIUS_Y),
          width: x(RADIUS_X * 2),
          height: y(RADIUS_Y * 2),
          boxShadow: 'inset 0 0 30px rgba(0,0,0,.25)',
        }}
      />

      {/* 보드와 팟 — 테이블 중앙 */}
      <div
        className="absolute flex flex-col items-center gap-1"
        style={{ left: 0, width: '100%', top: y(CENTER_Y - 34) }}
      >
        <div className="flex gap-1">
          {state.board.map((card, i) => (
            <Card key={i} card={card} faceUp size="sm" />
          ))}
        </div>
        {state.pot > 0 ? (
          <div className="sim-move">
            <ChipStack amount={state.pot} />
          </div>
        ) : null}
      </div>

      {/* 좌석 */}
      {state.seats.map((seat, i) => {
        const off = seatOffset(i, n, RADIUS_X, RADIUS_Y)
        return (
          <div
            key={i}
            className="sim-move absolute flex justify-center"
            style={{
              left: x(CENTER_X + off.x - SEAT_W / 2),
              top: y(CENTER_Y + off.y - 30),
              width: x(SEAT_W),
            }}
          >
            <Seat
              seat={seat}
              seatIndex={i}
              positionTag={tags[i]}
              hasButton={i === state.buttonSeat}
            />
          </div>
        )
      })}

      {/* 번 더미 — 보드 왼쪽. 번은 상태를 바꾸지 않으므로 개수만 받아 그린다 */}
      {burnCount > 0 ? (
        <div
          className="sim-move absolute flex -space-x-4"
          style={{ left: x(CENTER_X - 108), top: y(CENTER_Y - 18) }}
          aria-label={`번 카드 ${burnCount}장`}
        >
          {Array.from({ length: burnCount }, (_, i) => (
            <Card key={i} faceUp={false} size="sm" />
          ))}
        </div>
      ) : null}

      {/* 딜러 자리 — 하단 중앙. 카드가 여기서 나간다 */}
      <div
        className="absolute w-full text-center text-[9px] font-bold text-zinc-500 dark:text-zinc-400"
        style={{ left: 0, top: y(LAYOUT_H - 16) }}
      >
        딜러(나)
      </div>
    </div>
  )
}
