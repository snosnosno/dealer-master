/**
 * 진행절차 한 핸드.
 *
 * **러시 뼈대(`useRushRun`)를 쓰지 않는다.** 이 드릴에는 제한시간도 점수도 없고
 * 문제가 주어지지도 않는다. 억지로 끼우면 뼈대가 두 모양을 다 견디느라 부푼다.
 *
 * 화면은 상태를 만들지 않는다 — `reduce` 가 만든 것을 그리기만 한다.
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { PokerTable } from '@/components/table/PokerTable'
import { Palette } from './Palette'
import { reduce, startProcedure } from '@/lib/drills/procedure/reduce'
import type { PaletteAct } from '@/lib/drills/procedure/types'
import type { GameSpec } from '@/lib/games'
import { randomSeed } from '@/lib/rush/seed'

/** 카드·칩이 나는 시간. 프로토타입과 같은 값이다 */
const ANIM_MS = 520

export function ProcedureScreen({ spec }: { spec: GameSpec }) {
  /*
   * **첫 렌더에서 판을 만들지 않는다.** `useState(() => startProcedure(spec, randomSeed()))`
   * 로 시작하면 초기화 함수가 서버에서 한 번, 클라이언트 하이드레이션에서 또 한 번 돌아
   * **서로 다른 핸드**가 나온다. 실제로 이 화면은 매 로드마다 하이드레이션 불일치를
   * 던지고 있었다 — 포지션 태그가 서버와 클라이언트에서 다른 좌석에 붙었다.
   *
   * 증상보다 규율이 먼저다: 화면에 이미 놓인 카드가 다른 카드로 바뀌는 것이 프로토타입의
   * 결정적 결함이었고 6–8단계가 그것을 막으려고 있다. 시드는 마운트 뒤에 만들고, 그
   * 전에는 서버와 클라이언트가 똑같은 자리표시자를 그린다 (전역 제약 「시드 결정론」).
   */
  const [seed, setSeed] = useState<string | null>(null)
  useEffect(() => {
    setSeed((s) => s ?? randomSeed())
  }, [])

  const again = useCallback(() => setSeed(randomSeed()), [])

  return (
    <main className="mx-auto w-full max-w-[560px] px-4 py-5 font-sans">
      <div className="mb-3 flex items-center justify-between">
        <Link href={`/games/${spec.id}`} className="text-sm text-zinc-500">
          ← 돌아가기
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-wide text-dm-accent">
          {spec.labels.ko} · 진행절차
        </span>
      </div>

      {seed === null ? (
        <p className="py-20 text-center text-sm text-zinc-500">핸드를 준비하는 중…</p>
      ) : (
        // key 로 판을 통째로 갈아 끼운다 — 「한 핸드 더」가 새 시드로 새 핸드를 연다
        <ProcedureRun key={seed} spec={spec} seed={seed} onAgain={again} />
      )}
    </main>
  )
}

/** 한 핸드. **마운트되는 순간 시드가 정해져 있다** — 여기서 무작위를 만들지 않는다. */
function ProcedureRun({
  spec,
  seed,
  onAgain,
}: {
  spec: GameSpec
  seed: string
  onAgain(): void
}) {
  const [state, setState] = useState(() => startProcedure(spec, seed))

  // 애니메이션이 끝나면 스스로 다음 입력을 기다린다. 사용자가 누를 것이 없는 구간이다
  useEffect(() => {
    if (state.phase !== 'anim') return
    const timer = setTimeout(() => setState((s) => reduce(s, { type: 'animEnd' })), ANIM_MS)
    return () => clearTimeout(timer)
  }, [state])

  const pick = useCallback((act: PaletteAct) => {
    setState((s) => reduce(s, { type: 'palette', act }))
  }, [])

  const pickSeat = useCallback((seat: number) => {
    setState((s) => reduce(s, { type: 'seat', seat }))
  }, [])

  return (
    <>
      <div className="mb-2 flex items-center gap-3 text-xs text-zinc-500">
        <span>
          단계 <b className="text-zinc-800 dark:text-zinc-100">{Math.min(state.at + 1, state.steps.length)}</b>
          /{state.steps.length}
        </span>
        <span>
          막힘 <b className="text-zinc-800 dark:text-zinc-100">{state.stuck}</b>
        </span>
      </div>

      {/*
        * `PokerTable` 은 `bg-[var(--felt)]` · `border-[var(--felt-edge)]` 로 그리는데
        * 그 커스텀 프로퍼티는 전역이 아니라 `.sim-root` 안에서만 정의된다
        * (globals.css). `HandPlayer` 도 같은 이유로 이 클래스를 감싼다 — 없으면
        * 펠트가 무색으로 뜬다.
        */}
      <div className="sim-root">
        <PokerTable state={state.table} burnCount={state.burnCount} />
      </div>

      {state.phase === 'done' ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 p-5 text-center dark:border-zinc-800">
          <p className="text-xs text-zinc-500">한 핸드 완주</p>
          <p className="mt-1 text-4xl font-black">{state.stuck}</p>
          <p className="text-xs text-zinc-500">번 막혔습니다</p>
          <p className="mt-3 text-xs text-zinc-500">
            {state.stuck === 0
              ? '한 번도 순서를 틀리지 않았습니다.'
              : '막힐 때마다 무엇이 먼저였는지 로그에 남아 있습니다.'}
          </p>
          <button
            type="button"
            onClick={onAgain}
            className="mt-4 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white"
          >
            한 핸드 더
          </button>
        </div>
      ) : (
        <>
          {state.phase === 'openSeat' ? (
            <div className="mt-3 rounded-xl border border-dm-teal-600 bg-dm-teal-50 p-4 dark:bg-zinc-900">
              <p className="text-sm font-bold text-dm-teal-800 dark:text-dm-teal-100">
                이번 라운드의 첫 순서를 지목하세요
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {state.table.seats.map((seat, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={seat.folded}
                    onClick={() => pickSeat(i)}
                    className="rounded-lg border border-zinc-300 py-2 text-sm font-bold disabled:opacity-30 dark:border-zinc-700"
                  >
                    {seat.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <Palette disabled={state.phase === 'anim'} onPick={pick} />
          )}

          {state.hint ? (
            <p className="mt-3 rounded-xl bg-dm-red-50 px-4 py-3 text-sm text-dm-red">
              <b className="mr-1">아직 아닙니다 —</b>
              {state.hint}
            </p>
          ) : null}
        </>
      )}

      <ol className="mt-5 space-y-1 text-[11px] text-zinc-400">
        {state.log.slice(-8).map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </>
  )
}
