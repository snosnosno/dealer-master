/**
 * 승자 판독 — 10문제 한 판.
 *
 * **정답 판정은 여기 있어야 한다.** 문제의 답이 어떤 모양인지 아는 것은 이 드릴뿐이고,
 * 공용 뼈대(`RushScreen`)가 그것을 알기 시작하면 드릴이 늘 때마다 뼈대가 부푼다.
 *
 * 생성기와 기록은 `winnerRun`·`winnerRecord` 가 `gameId` 당 하나씩 캐시해 준다 —
 * 여기서 클로저를 만들면 렌더마다 새 판이 나온다.
 */
'use client'

import { notFound } from 'next/navigation'
import { use } from 'react'
import { WinnerQuestionPanel } from '@/components/drills/winner/WinnerQuestionPanel'
import { RushScreen } from '@/components/rush/RushScreen'
import { winnerRecord, winnerRun } from '@/lib/drills/winner/registry'
import {
  WINNER_KIND_LABEL,
  WINNER_QUESTION_COUNT,
  type WinnerKind,
  type WinnerQuestion,
} from '@/lib/drills/winner/types'
import { drillHref, GAMES, isGameId } from '@/lib/games'

/** 이 드릴에는 칩이 나오지 않는다. **모듈 최상위 함수여야 한다** */
function hasChips(): boolean {
  return false
}

/** 순서를 무시하고 같은 좌석 묶음인가. 채점의 정본이다 */
function sameSeats(picked: number[], answer: number[]): boolean {
  return picked.length === answer.length && answer.every((s) => picked.includes(s))
}

export default function WinnerPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params)
  // 준비되지 않은 종목의 URL 을 직접 치면 404 다. 화면에서 잠긴 칸과 같은 사실이어야 한다
  if (!isGameId(gameId) || drillHref(gameId, 'winner') === null) notFound()

  return (
    <RushScreen<WinnerKind, WinnerQuestion>
      path={`/games/${gameId}/winner`}
      title="승자 판독"
      eyebrow={`${GAMES[gameId].labels.ko} · 승자 판독`}
      footer={`${WINNER_QUESTION_COUNT}문제 · 보드와 홀카드는 매번 새로 만들어진다`}
      labels={WINNER_KIND_LABEL}
      record={winnerRecord(gameId)}
      generate={winnerRun(gameId)}
      hasChips={hasChips}
      renderQuestion={({ question, index, total, verdict, answer, next }) => (
        <WinnerQuestionPanel
          // 문제마다 새로 그린다 — 이전 문제의 선택이 남으면 답이 미리 찍힌 채로 열린다
          key={index}
          question={question}
          index={index}
          total={total}
          verdict={verdict}
          onSubmit={(hi, lo) => {
            // 하이와 로우가 둘 다 맞아야 정답이다. 러시 채점이 이진이라 부분점수가 없다
            answer(sameSeats(hi, question.answerHi) && sameSeats(lo, question.answerLo))
          }}
          onNext={next}
        />
      )}
    />
  )
}
