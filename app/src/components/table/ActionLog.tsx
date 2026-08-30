/**
 * 텍스트 액션 로그.
 *
 * 스펙 §4-7 의 필수 3항목 중 하나다. 애니메이션이 정보이므로 애니메이션 없이도
 * 읽혀야 하고, prefers-reduced-motion 에서는 이쪽이 **주 채널**이 된다 — 그래서
 * 그때 폰트와 대비를 키운다.
 *
 * 재생된 이벤트(0 ..< cursor)만 그린다. 앞질러 그리면 로그가 스포일러가 된다.
 */
'use client'

import { useEffect, useRef } from 'react'
import { describeForLearner } from './log'
import type { HandEvent, SeatInit } from '@/lib/simulator'

export function ActionLog({
  events,
  seats,
  cursor,
}: {
  events: HandEvent[]
  seats: SeatInit[]
  cursor: number
}) {
  const boxRef = useRef<HTMLDivElement>(null)

  /*
   * 컨테이너를 **직접** 내린다. scrollIntoView 는 명세상 스크롤 가능한 모든 조상을
   * 움직이므로, 로그가 뷰포트 아래로 걸쳐 있으면 block:'nearest' 도 페이지 전체를
   * 끌어당긴다 — 420px 높이에서 로그가 102px 걸친 채 재생하면 페이지가 정확히
   * 102px 튀는 것을 실측했다. scrollTop 은 이 요소 하나만 건드린다.
   */
  useEffect(() => {
    const box = boxRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [cursor])

  const shown = events.slice(0, cursor)

  return (
    <div
      ref={boxRef}
      className="h-48 overflow-y-auto rounded-xl bg-zinc-900 px-4 py-3 text-zinc-300 motion-reduce:text-base motion-reduce:text-zinc-100"
      role="log"
      aria-live="polite"
      aria-label="액션 로그"
    >
      {shown.length === 0 ? (
        <p className="text-xs text-zinc-500">핸드를 시작합니다.</p>
      ) : (
        <ol className="space-y-1 text-xs leading-relaxed motion-reduce:text-sm">
          {shown.map((e, i) => (
            <li
              key={i}
              className={
                i === shown.length - 1
                  ? 'font-bold text-dm-amber-400'
                  : 'text-zinc-400 motion-reduce:text-zinc-300'
              }
            >
              {describeForLearner(e, seats)}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
