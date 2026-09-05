/**
 * 홈 — 종목을 먼저 고른다.
 *
 * 대시보드가 아니다. 등급 카드·스트릭 배지는 기록 층을 읽어야 하는데 그건 로그인과
 * 함께 오는 단계라(PRD §4), 지금 만들면 더미 데이터 화면이 된다.
 *
 * **목록은 `lib/games/` 레지스트리에서 나온다.** 화면과 정본이 어긋나면 어느 쪽이
 * 계획인지 아무도 모른다 — 예전에 실제로 그랬다.
 */
import Link from 'next/link'
import { GameList } from '@/components/games/GameList'

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-10 font-sans">
      <h1 className="text-2xl font-extrabold tracking-tight">딜러마스터</h1>
      <p className="mt-1 text-sm text-zinc-500">판정을 배우는 게 아니라 판정력을 기른다</p>

      <GameList />

      {/* 축이 아니라 도구다. 엔진이 무엇을 내는지 눈으로 보는 화면이라 목록과 섞지 않는다 */}
      <p className="mt-8 text-[11px] text-zinc-400">
        <Link href="/simulator" className="underline underline-offset-2 hover:text-zinc-600">
          핸드 시뮬레이터
        </Link>
        {' · 노리밋 홀덤 한 판을 처음부터 끝까지 돌려보는 도구'}
      </p>
    </main>
  )
}
