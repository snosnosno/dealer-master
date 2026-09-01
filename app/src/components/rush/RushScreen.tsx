/**
 * 러시 한 판의 화면 뼈대 — 축이 공유한다.
 *
 * 비유: 경기장이다. 전광판(제목·연속·시간·점수)과 트랙(진행바), 끝나면 나오는
 * 시상대(결과 패널)까지가 여기 있고, 축은 그 안에서 **문제 한 장을 어떻게 보여줄지만**
 * 정한다 (`renderQuestion`).
 *
 * 상태 기계는 [`useRushRun`](../../lib/rush/session.ts) 이 돈다. 이 파일은 그리기만 한다.
 *
 * **축을 추가할 때 이 파일을 복사하지 마라.** props 로 부족한 것이 생기면 그때
 * props 를 늘린다 — 복사본은 반드시 갈라지고, 갈라진 뒤에는 어느 쪽이 정본인지
 * 아무도 모른다 (축 1·2 페이지가 219 줄 같았던 이유다).
 */
'use client'

import { Suspense, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ResultPanel } from './ResultPanel'
import type { BestRecord } from '@/lib/rush/record'
import { randomSeed } from '@/lib/rush/seed'
import { useRushRun, type RushLike, type Verdict } from '@/lib/rush/session'

const fmt = (n: number) => n.toLocaleString('ko-KR')

/** 축이 문제 한 장을 그릴 때 받는 것. 정답 판정은 축이 하고 `answer` 로 알린다. */
export type QuestionRenderArgs<Q> = {
  question: Q
  index: number
  total: number
  verdict: Verdict
  answer(correct: boolean): void
  next(): void
}

export type RushScreenProps<K extends string, Q extends RushLike<K>> = {
  /** 라우트 경로. 시드를 URL 에 넣고 "다시 하기"가 새 시드로 갈아탄다 */
  path: string
  title: string
  /** 헤더 오른쪽 작은 라벨 */
  eyebrow: string
  /** 화면 맨 아래 한 줄 */
  footer: string
  labels: Record<K, string>
  /** **모듈 최상위에 두어라.** 렌더마다 만들면 최고 기록 구독이 매번 새로 붙는다 */
  record: BestRecord
  /** **모듈 최상위 함수여야 한다** (아래 `hasChips` 와 같은 이유) */
  generate(seed: string): Q[]
  /**
   * 이 문제에 칩이 나오나. **모듈 최상위 함수여야 한다** —
   * 렌더마다 새 함수를 넘기면 딜링 소리가 같은 문제에서 반복된다
   */
  hasChips(question: Q): boolean
  renderQuestion(args: QuestionRenderArgs<Q>): ReactNode
}

export function RushScreen<K extends string, Q extends RushLike<K>>(props: RushScreenProps<K, Q>) {
  return (
    <main className="mx-auto w-full max-w-[560px] px-4 py-5 font-sans">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500">
          ← 돌아가기
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-wide text-dm-accent">
          {props.eyebrow}
        </span>
      </div>
      <Suspense fallback={<p className="py-20 text-center text-sm text-zinc-500">불러오는 중…</p>}>
        <SeedGate {...props} />
      </Suspense>
    </main>
  )
}

/** 시드가 없으면 만들어 URL 에 넣는다. 시드 하나로 판이 그대로 재현된다. */
function SeedGate<K extends string, Q extends RushLike<K>>(props: RushScreenProps<K, Q>) {
  const { path } = props
  const router = useRouter()
  const params = useSearchParams()
  const seed = params.get('seed')

  useEffect(() => {
    if (seed === null) router.replace(`${path}?seed=${randomSeed()}`)
  }, [seed, router, path])

  const retry = useCallback(() => router.replace(`${path}?seed=${randomSeed()}`), [router, path])

  if (seed === null) {
    return <p className="py-20 text-center text-sm text-zinc-500">문제를 준비하는 중…</p>
  }
  // key 로 판을 통째로 갈아 끼운다 — 점수·연속·타이머가 남아 있으면 다음 판이 오염된다
  return <RunView key={seed} seed={seed} onRetry={retry} {...props} />
}

function RunView<K extends string, Q extends RushLike<K>>({
  seed,
  onRetry,
  title,
  footer,
  labels,
  record,
  generate,
  hasChips,
  renderQuestion,
}: RushScreenProps<K, Q> & { seed: string; onRetry: () => void }) {
  const questions = useMemo(() => generate(seed), [generate, seed])
  const s = useRushRun<K, Q>({ questions, record, hasChips })

  return (
    <>
      <div className="mb-2.5 flex items-center gap-3">
        <span className="whitespace-nowrap text-[15px] font-black tracking-tight">{title}</span>
        {s.run.streak >= 2 ? (
          <span className="whitespace-nowrap rounded-full bg-dm-amber-50 px-2 py-0.5 font-mono text-xs font-extrabold text-dm-amber-600">
            연속 {s.run.streak}
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
          onClick={s.toggleMute}
          aria-pressed={s.muted}
          aria-label={s.muted ? '소리 켜기' : '소리 끄기'}
          className="rounded-md px-1 py-0.5 text-sm leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {s.muted ? '🔇' : '🔊'}
        </button>
        <span
          className={`w-11 text-right font-mono text-xs font-extrabold tabular-nums ${
            s.level === 'crit'
              ? 'text-dm-danger'
              : s.level === 'warn'
                ? 'text-dm-amber-600'
                : 'text-zinc-500'
          }`}
        >
          {s.done ? '—' : `${s.remaining.toFixed(1)}s`}
        </span>
        <span className="whitespace-nowrap font-mono text-xs tabular-nums text-zinc-500">
          <b className="text-zinc-800 dark:text-zinc-200">{fmt(s.run.score)}</b>점
        </span>
      </div>

      <div className="mb-3.5 h-[5px] overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-full ${
            s.level === 'crit'
              ? 'bg-dm-danger'
              : s.level === 'warn'
                ? 'bg-dm-amber-400'
                : 'bg-dm-teal-600'
          }`}
          style={{ width: `${s.ratio * 100}%` }}
        />
      </div>

      {s.done ? (
        <ResultPanel
          run={s.run}
          total={s.total}
          best={s.best}
          labels={labels}
          isNewBest={s.isNewBest}
          onRetry={onRetry}
        />
      ) : (
        renderQuestion({
          question: s.question,
          index: s.index,
          total: s.total,
          verdict: s.verdict,
          answer: s.answer,
          next: s.next,
        })
      )}

      <p className="mt-3 break-keep text-center text-[11px] text-zinc-400">{footer}</p>
    </>
  )
}
