/**
 * 시뮬레이터 진입점.
 *
 * `?seed=` 가 없으면 만들어 URL 에 반영한다. 그러면 어떤 핸드든 링크로 복기·공유·
 * 버그 재현이 되고, 엔진의 결정론 생성이 UI 단계에서 바로 값을 낸다.
 */
'use client'

import { Suspense, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { HandPlayer } from '@/components/simulator/HandPlayer'
import { randomSeed } from '@/components/simulator/hand'

function SimulatorInner() {
  const router = useRouter()
  const params = useSearchParams()
  const seed = params.get('seed')

  useEffect(() => {
    if (seed === null) router.replace(`/simulator?seed=${randomSeed()}`)
  }, [seed, router])

  const next = useCallback(() => {
    router.replace(`/simulator?seed=${randomSeed()}`)
  }, [router])

  if (seed === null) {
    return <p className="py-20 text-center text-sm text-zinc-500">핸드를 준비하는 중…</p>
  }

  return <HandPlayer key={seed} seed={seed} onNext={next} />
}

export default function SimulatorPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6 font-sans">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500">
          ← 돌아가기
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-wide text-dm-accent">
          딜러 교육 · 노리밋 홀덤
        </span>
      </div>
      <Suspense fallback={<p className="py-20 text-center text-sm text-zinc-500">불러오는 중…</p>}>
        <SimulatorInner />
      </Suspense>
    </main>
  )
}
