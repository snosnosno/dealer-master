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
const LAYOUT_H = 352
const CENTER_X = LAYOUT_W / 2
/** 중심을 살짝 위로 둔다 — 하단에 딜러(나) 라벨 자리가 필요하다. */
const CENTER_Y = 166

/** 펠트(타원)의 반지름. */
const FELT_RX = 168
const FELT_RY = 148

/**
 * 좌석 링의 반지름. **펠트보다 작다** — 좌석 중심을 펠트 테두리 위에 놓으면
 * 좌석 상자 맨 위의 홀카드가 타원 밖으로 삐져나온다(상단 좌석에서 약 30px).
 * 링을 안쪽으로 당기고 펠트를 키워 카드가 펠트 안에 들어오게 한다.
 * 세로를 더 많이 당기는 이유는 카드가 좌석 상자의 **위쪽** 끝에 붙기 때문이다.
 *
 * 링을 세로로 당기면 상단 좌석과 좌우 중앙 좌석의 간격이 줄어 상자가 겹친다
 * (벳칩이 붙어 상자가 높아지는 좌석에서 실측 14.7px 겹침). 그래서 세로를 좁히는
 * 대신 **디자인 박스와 펠트를 세로로 키워** 여유를 되샀다 — LAYOUT_H 320→352.
 */
const SEAT_RX = 126
const SEAT_RY = 108

/** 좌석 상자 폭. 좌석 반지름 + 이 값의 절반이 LAYOUT_W 안에 들어와야 한다. */
const SEAT_W = 96
/** 좌석 상자 위쪽 여백. 상자는 이 지점부터 아래로 자란다. */
const SEAT_TOP_OFFSET = 30

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
          left: x(CENTER_X - FELT_RX),
          top: y(CENTER_Y - FELT_RY),
          width: x(FELT_RX * 2),
          height: y(FELT_RY * 2),
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
        const off = seatOffset(i, n, SEAT_RX, SEAT_RY)
        return (
          <div
            key={i}
            className="sim-move absolute flex justify-center"
            style={{
              left: x(CENTER_X + off.x - SEAT_W / 2),
              top: y(CENTER_Y + off.y - SEAT_TOP_OFFSET),
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

      {/*
        * 번 더미 — 보드 **위**. 원래는 보드 왼쪽이었는데, 좌석 링을 안쪽으로 당기면서
        * 좌우 중앙 좌석 상자가 그 자리를 지나간다. 번은 상태를 바꾸지 않으므로
        * 개수만 받아 그린다.
        */}
      {burnCount > 0 ? (
        <div
          className="sim-move absolute flex -space-x-4"
          style={{ left: x(CENTER_X - 20), top: y(CENTER_Y - 78) }}
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
