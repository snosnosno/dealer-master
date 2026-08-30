/**
 * 재생 제어와 뷰 조립.
 *
 * 상태 로직은 전부 `player.ts` 에 있다. 이 파일이 하는 일은 셋뿐이다 —
 * 리듀서를 useReducer 로 돌리고, 실제 시계(rAF)를 tick 으로 바꿔 넣고,
 * 커서로 접은 상태를 뷰에 내려준다.
 */
'use client'

import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { PokerTable } from '@/components/table/PokerTable'
import { ActionLog } from '@/components/table/ActionLog'
import { initialState, stateAt } from '@/lib/simulator'
import type { Answer } from '@/lib/simulator'
import { DecisionPrompt } from './DecisionPrompt'
import { HandReview } from './HandReview'
import { buildHand } from './hand'
import { initPlayer, reduce, type PlayerCommand, type PlayerState, type Speed } from './player'

/** CSS 전이 길이의 1x 기준. 가장 짧은 박자(deal_hole 120ms)에 맞춘다. */
const TEMPO_BASE_MS = 120

const SPEEDS: { value: Speed; label: string }[] = [
  { value: 0.5, label: '0.5x' },
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 0, label: '즉시' },
]

export function HandPlayer({ seed, onNext }: { seed: string; onNext: () => void }) {
  const { hand, decisions } = useMemo(() => buildHand(seed), [seed])
  const { config, state: initial } = useMemo(
    () => initPlayer(hand.events, decisions),
    [hand, decisions],
  )

  const boundReduce = useCallback(
    (s: PlayerState, c: PlayerCommand) => reduce(config, s, c),
    [config],
  )
  const [state, dispatch] = useReducer(boundReduce, initial)

  // 실제 시계는 여기 하나뿐이다. 리듀서는 ms 만 받는다.
  //
  // 이 가드에서 'playing' 을 빼지 말 것. `continue` 가 settle 하지 않으므로(Task 1)
  // 마지막 문항에 답한 뒤 phase 는 'playing' 으로 남고, review 로 넘기는 것은 그
  // 다음 tick 이다. playing 에서 틱을 멈추면 리뷰 화면에 영원히 도달하지 못한다.
  useEffect(() => {
    if (state.phase !== 'playing' && state.phase !== 'awaiting') return
    let last = performance.now()
    let raf = 0
    const loop = () => {
      const now = performance.now()
      const ms = now - last
      last = now
      if (ms > 0) dispatch({ type: 'tick', ms })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [state.phase])

  const view = useMemo(
    () => stateAt(initialState(hand.seats, hand.buttonSeat), hand.events, state.cursor),
    [hand, state.cursor],
  )

  // 번은 상태를 바꾸지 않으므로(applyEvent 가 그대로 돌려준다) 개수를 따로 센다.
  const burnCount = useMemo(
    () => hand.events.slice(0, state.cursor).filter((e) => e.type === 'burn').length,
    [hand, state.cursor],
  )

  const tempoMs = state.speed === 0 ? 0 : Math.round(TEMPO_BASE_MS / state.speed)
  // 판단 중에는 속도를 바꿔도 카운트다운에 영향이 없다. 정지 버튼 자체를 두지 않는다 —
  // 정지로 타이머를 멈출 수 있으면 45초짜리 계산 문제를 무한정 붙들 수 있다.
  const controlsLocked = state.phase === 'awaiting' || state.phase === 'feedback'

  if (state.phase === 'review') {
    return (
      <HandReview
        decisions={decisions}
        answers={state.answers}
        results={state.results}
        seed={seed}
        onNext={onNext}
      />
    )
  }

  return (
    <div
      className="sim-root space-y-4"
      // CSS 커스텀 프로퍼티는 CSSProperties 에 없으므로 단언이 필요하다.
      style={{ '--tempo': `${tempoMs}ms` } as React.CSSProperties}
    >
      <PokerTable state={view} burnCount={burnCount} />

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s.label}
              disabled={controlsLocked}
              onClick={() => dispatch({ type: 'setSpeed', speed: s.value })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40 ${
                state.speed === s.value
                  ? 'border-dm-teal-800 bg-dm-teal-800 text-white'
                  : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-500">
          {state.cursor} / {hand.events.length}
        </span>
      </div>

      <ActionLog events={hand.events} seats={hand.seats} cursor={state.cursor} />

      {(state.phase === 'awaiting' || state.phase === 'feedback') && state.pending[0] ? (
        <DecisionPrompt
          // 문항이 바뀌면 새로 마운트해 입력 상태를 버린다. 지금은 이 key 가 없어도
          // 동작한다 — 문항 사이에 반드시 'playing' 렌더가 끼어(continue 가 settle
          // 하지 않으므로) 컴포넌트가 언마운트되기 때문이다. 그 보호는 **창발적**이라,
          // 위 조건식에 'playing' 을 넣어 깜빡임을 줄이는 순간 조용히 사라진다.
          // 그러면 칸 수가 같은 연속 숫자 문항에서 앞 문항의 입력이 남아 오답이 된다.
          key={`${state.pending[0].kind}-${state.pending[0].atEventIndex}`}
          dp={state.pending[0]}
          phase={state.phase}
          remainingMs={state.remainingMs}
          result={state.results.at(-1)}
          answer={state.answers.at(-1)}
          onAnswer={(answer: Answer) => dispatch({ type: 'answer', answer })}
          onContinue={() => dispatch({ type: 'continue' })}
        />
      ) : null}
    </div>
  )
}
