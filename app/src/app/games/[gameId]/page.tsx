import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DrillList } from '@/components/games/DrillList'
import { GAMES, isGameId } from '@/lib/games'

export default async function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params
  // 없는 종목의 URL 을 직접 치면 404 다 — 드릴 라우트의 가드와 같은 규율이다
  if (!isGameId(gameId)) notFound()
  const spec = GAMES[gameId]

  return (
    <main className="mx-auto w-full max-w-md px-5 py-10 font-sans">
      <Link href="/" className="text-sm text-zinc-500">
        ← 돌아가기
      </Link>
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{spec.labels.ko}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {spec.labels.familyKo} · {spec.labels.gameKo} · {spec.labels.bettingKo}
      </p>
      <DrillList gameId={gameId} />
    </main>
  )
}
