/**
 * 팟 판독 러시 — 10문제 한 판.
 *
 * 시드가 URL 에 있다. 어떤 판이든 링크로 다시 열 수 있고(버그 재현·복기), 나중에
 * 일일 챌린지가 붙을 자리도 여기다. **다만 일일 챌린지 자체는 4단계다.**
 *
 * 타이머는 인터벌마다 남은 시간을 빼지 않는다. **문제가 열린 시각**을 기억해 두고
 * 매번 거기서 역산한다 — 점수가 남은 시간에 비례하므로 누적 오차가 곧 점수 오차다.
 * 채점할 때도 화면에 그려진 숫자가 아니라 이 시각에서 다시 계산한다.
 */
'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { QuestionPanel, type Verdict } from '@/components/rush/QuestionPanel'
import { ResultPanel } from '@/components/rush/ResultPanel'
import { generateRun, randomSeed } from '@/lib/rush/generate'
import { readBest, saveBest, saveMuted, useBest, useMuted } from '@/lib/rush/record'
import { applyAnswer, initialRun, type RunState } from '@/lib/rush/score'
import { playBad, playChips, playDeal, playGood, playTick, unlockSound } from '@/lib/rush/sound'
import { QUESTION_COUNT } from '@/lib/rush/types'

/** 마지막 몇 초부터 틱 소리를 내나 */
const TICK_FROM_SEC = 5
/** 딜링 소리와 칩 소리 사이 간격 */
const CHIP_SOUND_DELAY_MS = 180

const fmt = (n: number) => n.toLocaleString('ko-KR')

function RushInner() {
  const router = useRouter()
  const params = useSearchParams()
  const seed = params.get('seed')

  useEffect(() => {
    if (seed === null) router.replace(`/rush?seed=${randomSeed()}`)
  }, [seed, router])

  const retry = useCallback(() => router.replace(`/rush?seed=${randomSeed()}`), [router])

  if (seed === null) {
    return <p className="py-20 text-center text-sm text-zinc-500">문제를 준비하는 중…</p>
  }
  // key 로 판을 통째로 갈아 끼운다 — 점수·연속·타이머가 남아 있으면 다음 판이 오염된다
  return <RushRun key={seed} seed={seed} onRetry={retry} />
}

function RushRun({ seed, onRetry }: { seed: string; onRetry: () => void }) {
  const questions = useMemo(() => generateRun(seed), [seed])

  const [index, setIndex] = useState(0)
  const [run, setRun] = useState<RunState>(initialRun)
  const [verdict, setVerdict] = useState<Verdict>(null)
  /** 지금 문제가 열린 시각. 첫 문제는 마운트, 그 뒤는 "다음 문제"를 누른 순간이다 */
  const [openedAt, setOpenedAt] = useState(() => now())
  const [remaining, setRemaining] = useState(questions[0].limitSec)
  const [isNewBest, setIsNewBest] = useState(false)

  const best = useBest()
  const muted = useMuted()

  const done = index >= questions.length
  const question = questions[Math.min(index, questions.length - 1)]
  const solving = verdict === null && !done
  const deadline = openedAt + question.limitSec * 1000

  /*
   * 첫 사용자 제스처에서 오디오를 연다. 이 전에는 소리를 만들지 않는다 —
   * 자동재생 정책에 막히는 방식이 조용해서, 그냥 열어 두면 "소리가 안 난다"만 남는다.
   */
  useEffect(() => {
    const open = () => unlockSound()
    window.addEventListener('pointerdown', open, { once: true })
    window.addEventListener('keydown', open, { once: true })
    return () => {
      window.removeEventListener('pointerdown', open)
      window.removeEventListener('keydown', open)
    }
  }, [])

  const finish = useCallback(
    (correct: boolean, headline: string) => {
      // 시간초과와 사용자 입력이 같은 순간에 겹칠 수 있다. 먼저 온 판정만 남긴다
      if (verdict !== null) return
      const left = Math.max(0, (deadline - now()) / 1000)
      const result = applyAnswer(run, question.kind, correct, left)
      setRun(result.state)
      setRemaining(left)
      setVerdict({ correct, points: result.points, headline })
      if (correct) playGood()
      else playBad()
    },
    [verdict, deadline, run, question.kind],
  )

  /*
   * 문제가 열릴 때 딜링 소리, 칩이 있는 유형이면 조금 뒤에 칩 소리.
   * 두 소리를 같은 순간에 겹치면 노이즈 버스트끼리 뭉쳐 한 덩어리로 들린다.
   */
  useEffect(() => {
    if (!solving) return
    playDeal()
    const hasChips = question.kind === 'sidepots' || question.pot !== undefined
    if (!hasChips) return
    const id = window.setTimeout(playChips, CHIP_SOUND_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [solving, question])

  /*
   * 남은 시간 갱신. setState 는 프레임 콜백 안에서만 일어난다 —
   * 이펙트 본문에서 바로 부르면 렌더가 연쇄로 돈다.
   */
  useEffect(() => {
    if (!solving) return
    let frame = 0
    let lastTickSec = Number.POSITIVE_INFINITY
    let expired = false

    const step = () => {
      const left = Math.max(0, (deadline - now()) / 1000)
      setRemaining(left)

      const sec = Math.ceil(left)
      if (left > 0 && sec <= TICK_FROM_SEC && sec !== lastTickSec) {
        lastTickSec = sec
        playTick()
      }

      if (left <= 0) {
        if (!expired) {
          expired = true
          onExpire()
        }
        return
      }
      frame = window.requestAnimationFrame(step)
    }

    // 이펙트가 다시 돌 때 낡은 finish 를 잡지 않도록 한 겹 감싼다
    const onExpire = () => finish(false, '시간 초과')

    frame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frame)
  }, [solving, deadline, finish])

  const answerSeats = useCallback(
    (seats: number[]) => {
      if (question.kind === 'sidepots') return
      const ok =
        question.kind === 'split'
          ? question.answerSeats.length === seats.length &&
            question.answerSeats.every((s) => seats.includes(s))
          : seats[0] === question.answerSeat
      finish(ok, ok ? '정확하다' : '틀렸다')
    },
    [question, finish],
  )

  const answerFields = useCallback(
    (values: number[]) => {
      if (question.kind !== 'sidepots') return
      const ok = question.fields.every((field, i) => values[i] === field.answer)
      finish(ok, ok ? '정확하다' : '틀렸다')
    },
    [question, finish],
  )

  const next = useCallback(() => {
    const at = index + 1
    if (at >= questions.length) {
      // 판이 끝났다. 기록은 여기서 한 번만 쓴다 — 경신 여부는 쓰기 전 값과 비교한다
      const previous = readBest()
      saveBest(run.score)
      setIsNewBest(run.score > previous)
    }
    setVerdict(null)
    setOpenedAt(now())
    setIndex(at)
  }, [index, questions.length, run.score])

  const toggleMute = useCallback(() => saveMuted(!muted), [muted])

  const ratio = done ? 0 : Math.max(0, remaining / question.limitSec)
  const level = ratio < 0.2 ? 'crit' : ratio < 0.45 ? 'warn' : 'calm'

  return (
    <>
      <div className="mb-2.5 flex items-center gap-3">
        <span className="text-[15px] font-black tracking-tight">팟 판독 러시</span>
        {run.streak >= 2 ? (
          <span className="rounded-full bg-dm-amber-50 px-2 py-0.5 font-mono text-xs font-extrabold text-dm-amber-600">
            연속 {run.streak}
          </span>
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          className="rounded-md px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {muted ? '🔇 소리 켜기' : '🔊 소리 끄기'}
        </button>
        <span
          className={`w-11 text-right font-mono text-xs font-extrabold tabular-nums ${
            level === 'crit'
              ? 'text-dm-danger'
              : level === 'warn'
                ? 'text-dm-amber-600'
                : 'text-zinc-500'
          }`}
        >
          {done ? '—' : `${remaining.toFixed(1)}s`}
        </span>
        <span className="font-mono text-xs tabular-nums text-zinc-500">
          <b className="text-zinc-800 dark:text-zinc-200">{fmt(run.score)}</b>점
        </span>
      </div>

      <div className="mb-3.5 h-[5px] overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-full ${
            level === 'crit'
              ? 'bg-dm-danger'
              : level === 'warn'
                ? 'bg-dm-amber-400'
                : 'bg-dm-teal-600'
          }`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>

      {done ? (
        <ResultPanel
          run={run}
          total={questions.length}
          best={best}
          isNewBest={isNewBest}
          onRetry={onRetry}
        />
      ) : (
        <QuestionPanel
          // 문제마다 새로 그린다 — 이전 문제의 입력이 남으면 정답이 미리 찍힌 채로 열린다
          key={index}
          question={question}
          index={index}
          total={questions.length}
          verdict={verdict}
          onAnswerSeats={answerSeats}
          onAnswerFields={answerFields}
          onNext={next}
        />
      )}

      <p className="mt-3 break-keep text-center text-[11px] text-zinc-400">
        {QUESTION_COUNT}문제 · 카드와 팟은 매번 새로 만들어진다
      </p>
    </>
  )
}

/** 단조 증가 시계. 시스템 시각이 바뀌어도 남은 시간이 튀지 않는다 */
function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

export default function RushPage() {
  return (
    <main className="mx-auto w-full max-w-[560px] px-4 py-5 font-sans">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500">
          ← 돌아가기
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-wide text-dm-accent">
          판정 훈련 · 노리밋 홀덤
        </span>
      </div>
      <Suspense fallback={<p className="py-20 text-center text-sm text-zinc-500">불러오는 중…</p>}>
        <RushInner />
      </Suspense>
    </main>
  )
}
