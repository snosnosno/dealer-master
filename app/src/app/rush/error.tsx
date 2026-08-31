/**
 * 러시 화면의 에러 경계.
 *
 * 문제 생성은 조건에 안 맞는 판을 버리고 다시 만든다. 상한(유형당 60회 × 시드 5줄기)을
 * 넘기면 `generateRun` 이 던지는데, 경계가 없으면 그 순간 화면이 통째로 빈 페이지가 된다.
 * 확률은 낮지만 러시에서 가장 나쁜 실패라 — 사용자는 무엇이 잘못됐는지도 모른다 —
 * 다른 시드로 다시 시작할 길을 준다.
 */
'use client'

import { useRouter } from 'next/navigation'

export default function RushError({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter()

  return (
    <main className="mx-auto w-full max-w-[560px] px-4 py-16 text-center font-sans">
      <p className="text-base font-bold">문제를 만들지 못했다</p>
      <p className="mt-2 break-keep text-sm text-zinc-500">
        이 시드에서 조건에 맞는 문제가 나오지 않았다. 다른 판으로 다시 시작할 수 있다.
      </p>
      <button
        type="button"
        onClick={() => {
          // 시드를 지우고 다시 시도한다 — 같은 시드로 재시도하면 같은 곳에서 또 걸린다
          router.replace('/rush')
          reset()
        }}
        className="mt-6 rounded-xl bg-dm-teal-600 px-6 py-3 text-base font-extrabold text-dm-teal-50"
      >
        새 판으로 다시 시작
      </button>
    </main>
  )
}
