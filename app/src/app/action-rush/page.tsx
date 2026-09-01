/**
 * 액션 판정 러시 — 10문제 한 판.
 *
 * 상태 기계는 축 1(`app/rush/page.tsx`)과 같다. 시드가 URL 에 있고, 타이머는
 * **문제가 열린 시각**에서 매번 역산한다 — 점수가 남은 시간에 비례하므로 인터벌
 * 누적 오차가 곧 점수 오차다.
 *
 * 점수·음향·기록은 축 1 의 모듈을 그대로 부른다. 최고 기록만 키가 다르다
 * (`actionrush.best` — 프로토타입이 쓰던 키라 거기서 세운 기록이 이어진다).
 */
'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ActionQuestionPanel, type Verdict } from '@/components/action-rush/ActionQuestionPanel'
import { ResultPanel } from '@/components/rush/ResultPanel'
import { generateRun, randomSeed } from '@/lib/action-rush/generate'
import { KIND_LABEL, QUESTION_COUNT, type ActionKind } from '@/lib/action-rush/types'
import { createBestRecord, saveMuted, useMuted } from '@/lib/rush/record'
import { applyAnswer, emptyRun, type RunState } from '@/lib/rush/score'
import { playBad, playChips, playDeal, playGood, playTick, unlockSound } from '@/lib/rush/sound'

/**
 * 축 2 의 기록. **축 1 과 키가 달라야 한다** — 두 축은 문제 성격이 달라 점수대가 다르고,
 * 키를 공유하면 한쪽 최고점이 다른 쪽을 영원히 덮는다 (계획서 §4).
 */
const record = createBestRecord('actionrush.best')

/** 마지막 몇 초부터 틱 소리를 내나 */
const TICK_FROM_SEC = 5
/** 딜링 소리와 칩 소리 사이 간격 */
const CHIP_SOUND_DELAY_MS = 180

const fmt = (n: number) => n.toLocaleString('ko-KR')

function ActionRushInner() {
  const router = useRouter()
  const params = useSearchParams()
  const seed = params.get('seed')

  useEffect(() => {
    if (seed === null) router.replace(`/action-rush?seed=${randomSeed()}`)
  }, [seed, router])

  const retry = useCallback(() => router.replace(`/action-rush?seed=${randomSeed()}`), [router])

  if (seed === null) {
    return <p className="py-20 text-center text-sm text-zinc-500">문제를 준비하는 중…</p>
  }
  // key 로 판을 통째로 갈아 끼운다 — 점수·연속·타이머가 남아 있으면 다음 판이 오염된다
  return <ActionRushRun key={seed} seed={seed} onRetry={retry} />
}

function ActionRushRun({ seed, onRetry }: { seed: string; onRetry: () => void }) {
  const questions = useMemo(() => generateRun(seed), [seed])

  const [index, setIndex] = useState(0)
  const [run, setRun] = useState<RunState<ActionKind>>(emptyRun)
  const [verdict, setVerdict] = useState<Verdict>(null)
  /** 지금 문제가 열린 시각. 첫 문제는 마운트, 그 뒤는 "다음 문제"를 누른 순간이다 */
  const [openedAt, setOpenedAt] = useState(() => now())
  const [remaining, setRemaining] = useState(questions[0].limitSec)
  const [isNewBest, setIsNewBest] = useState(false)

  const best = record.useBest()
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
   * 문제가 열릴 때 딜링 소리, 칩이 앞에 나가는 유형이면 조금 뒤에 칩 소리.
   * 두 소리를 같은 순간에 겹치면 노이즈 버스트끼리 뭉쳐 한 덩어리로 들린다.
   */
  useEffect(() => {
    if (!solving) return
    playDeal()
    const hasChips = question.seats.some((s) => (s.bet ?? 0) > 0)
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

  const answerChoice = useCallback(
    (choiceIndex: number) => {
      if (question.input !== 'choice') return
      const ok = question.choices[choiceIndex]?.correct === true
      finish(ok, ok ? '정확하다' : '틀렸다')
    },
    [question, finish],
  )

  const answerNumber = useCallback(
    (value: number) => {
      if (question.input !== 'number') return
      const ok = value === question.answer
      finish(ok, ok ? '정확하다' : '틀렸다')
    },
    [question, finish],
  )

  const next = useCallback(() => {
    const at = index + 1
    if (at >= questions.length) {
      // 판이 끝났다. 기록은 여기서 한 번만 쓴다 — 경신 여부는 쓰기 전 값과 비교한다
      const previous = record.readBest()
      record.saveBest(run.score)
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
        <span className="whitespace-nowrap text-[15px] font-black tracking-tight">액션 판정 러시</span>
        {run.streak >= 2 ? (
          <span className="whitespace-nowrap rounded-full bg-dm-amber-50 px-2 py-0.5 font-mono text-xs font-extrabold text-dm-amber-600">
            연속 {run.streak}
          </span>
        ) : null}
        <span className="flex-1" />
        {/*
          * 아이콘만 남긴다. 360px 에서 헤더 다섯 요소(제목·연속·음소거·시간·점수)가
          * 다 들어가지 않아 "소리 끄/기" 로 줄바꿈됐다 — 렌더로만 잡히는 결함이다.
          * 이름은 aria-label 로 남으므로 스크린리더에는 그대로 읽힌다.
          */}
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? '소리 켜기' : '소리 끄기'}
          className="rounded-md px-1 py-0.5 text-sm leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {muted ? '🔇' : '🔊'}
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
        <span className="whitespace-nowrap font-mono text-xs tabular-nums text-zinc-500">
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
          labels={KIND_LABEL}
          isNewBest={isNewBest}
          onRetry={onRetry}
        />
      ) : (
        <ActionQuestionPanel
          // 문제마다 새로 그린다 — 이전 문제의 입력이 남으면 정답이 미리 찍힌 채로 열린다
          key={index}
          question={question}
          index={index}
          total={questions.length}
          verdict={verdict}
          onAnswerChoice={answerChoice}
          onAnswerNumber={answerNumber}
          onNext={next}
        />
      )}

      <p className="mt-3 break-keep text-center text-[11px] text-zinc-400">
        {QUESTION_COUNT}문제 · 정답 근거는 WINNABLE 공식 대회 규정이다
      </p>
    </>
  )
}

/** 단조 증가 시계. 시스템 시각이 바뀌어도 남은 시간이 튀지 않는다 */
function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

export default function ActionRushPage() {
  return (
    <main className="mx-auto w-full max-w-[560px] px-4 py-5 font-sans">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500">
          ← 돌아가기
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-wide text-dm-accent">
          판정 훈련 · 액션 규정
        </span>
      </div>
      <Suspense fallback={<p className="py-20 text-center text-sm text-zinc-500">불러오는 중…</p>}>
        <ActionRushInner />
      </Suspense>
    </main>
  )
}
