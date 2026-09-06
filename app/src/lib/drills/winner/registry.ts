/**
 * `gameId` 당 생성기와 기록을 **하나씩만** 만들어 둔다.
 *
 * `RushScreen` 이 `useMemo(() => generate(seed), [generate, seed])` 로 문제를 만든다.
 * 페이지가 렌더마다 새 클로저를 넘기면 **매 렌더 새 판이 나온다** — 화면에 뜬 카드가
 * 바뀌는 결함이 정확히 그렇게 생긴다. 여기서 정체성을 고정한다.
 *
 * 기록 키 규약은 `<gameId>.<drillId>.best` 다. **기존 키를 지우지 않는다** —
 * `plo8.lowreading.best` 는 그대로 두고 `plo8.winner.best` 를 새로 쓴다.
 */
import { createBestRecord, type BestRecord } from '@/lib/rush/record'
import { GAMES, type GameId } from '@/lib/games'
import { generateWinnerRun } from './generate'
import type { WinnerQuestion } from './types'

const RUNS = new Map<GameId, (seed: string) => WinnerQuestion[]>()

export function winnerRun(gameId: GameId): (seed: string) => WinnerQuestion[] {
  const found = RUNS.get(gameId)
  if (found !== undefined) return found
  const run = (seed: string) => generateWinnerRun(GAMES[gameId], seed)
  RUNS.set(gameId, run)
  return run
}

const RECORDS = new Map<GameId, BestRecord>()

export function winnerRecord(gameId: GameId): BestRecord {
  const found = RECORDS.get(gameId)
  if (found !== undefined) return found
  const record = createBestRecord(`${gameId}.winner.best`)
  RECORDS.set(gameId, record)
  return record
}
