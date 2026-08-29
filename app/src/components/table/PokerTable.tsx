/**
 * 오벌 테이블. 좌석 좌표는 타원 파라메트릭이고 하단 중앙은 딜러 자리로 비어 있다.
 * 이 컴포넌트는 상태를 만들지 않는다 — HandState 를 받아 그리기만 한다.
 */
'use client'

import { Card } from './Card'
import { ChipStack } from './ChipStack'
import { Seat } from './Seat'
import { seatOffset } from './geometry'
import type { HandState } from '@/lib/simulator'

const WIDTH = 340
const HEIGHT = 300
const RADIUS_X = 132
const RADIUS_Y = 108

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
    <div className="relative mx-auto" style={{ width: WIDTH, height: HEIGHT }}>
      <div
        className="absolute rounded-[50%] border-8 border-[var(--felt-edge)] bg-[var(--felt)]"
        style={{
          left: WIDTH / 2 - RADIUS_X,
          top: HEIGHT / 2 - RADIUS_Y,
          width: RADIUS_X * 2,
          height: RADIUS_Y * 2,
          boxShadow: 'inset 0 0 30px rgba(0,0,0,.25)',
        }}
      />

      {/* 보드와 팟 — 테이블 중앙 */}
      <div
        className="absolute flex flex-col items-center gap-1"
        style={{ left: 0, top: HEIGHT / 2 - 34, width: WIDTH }}
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
        const { x, y } = seatOffset(i, n, RADIUS_X, RADIUS_Y)
        return (
          <div
            key={i}
            className="sim-move absolute"
            style={{
              left: WIDTH / 2 + x - 48,
              top: HEIGHT / 2 + y - 30,
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
          style={{ left: WIDTH / 2 - 118, top: HEIGHT / 2 - 18 }}
          aria-label={`번 카드 ${burnCount}장`}
        >
          {Array.from({ length: burnCount }, (_, i) => (
            <Card key={i} faceUp={false} size="sm" />
          ))}
        </div>
      ) : null}

      {/* 딜러 자리 — 하단 중앙. 카드가 여기서 나간다 */}
      <div
        className="absolute text-[9px] font-bold text-white/70"
        style={{ left: WIDTH / 2 - 16, top: HEIGHT - 14 }}
      >
        딜러(나)
      </div>
    </div>
  )
}
