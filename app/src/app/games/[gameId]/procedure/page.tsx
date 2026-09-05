import { notFound } from 'next/navigation'
import { ProcedureScreen } from '@/components/drills/procedure/ProcedureScreen'
import { drillHref, GAMES, isGameId } from '@/lib/games'

export default async function ProcedurePage({
  params,
}: {
  params: Promise<{ gameId: string }>
}) {
  const { gameId } = await params
  // 준비되지 않은 종목의 URL 을 직접 치면 404 다. 화면에서 잠긴 칸과 같은 사실이어야 한다
  if (!isGameId(gameId) || drillHref(gameId, 'procedure') === null) notFound()
  return <ProcedureScreen spec={GAMES[gameId]} />
}
