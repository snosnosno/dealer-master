/**
 * 로우 판독 — 10문제 한 판.
 *
 * **정답 판정은 여기 있어야 한다.** `LowQuestion` 유니온의 어느 갈래인지 아는 것은
 * 이 드릴뿐이고, 공용 뼈대(`RushScreen`)가 그것을 알기 시작하면 드릴이 늘 때마다
 * 뼈대가 부푼다 — `/rush` 와 같은 관례다.
 */
'use client'

import { notFound } from 'next/navigation'
import { use } from 'react'
import { LowQuestionPanel } from '@/components/drills/lowreading/LowQuestionPanel'
import { RushScreen } from '@/components/rush/RushScreen'
import { generateLowRun } from '@/lib/drills/lowreading/generate'
import {
  LOW_KIND_LABEL,
  LOW_QUESTION_COUNT,
  plo8LowRecord,
  type LowKind,
  type LowQuestion,
} from '@/lib/drills/lowreading/types'
import { drillHref, GAMES, isGameId } from '@/lib/games'

/** 이 드릴에는 칩이 나오지 않는다. **모듈 최상위 함수여야 한다** */
function hasChips(): boolean {
  return false
}

export default function LowReadingPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params)
  // 준비되지 않은 종목의 URL 을 직접 치면 404 다. 화면에서 잠긴 칸과 같은 사실이어야 한다
  if (!isGameId(gameId) || drillHref(gameId, 'lowreading') === null) notFound()

  return (
    <RushScreen<LowKind, LowQuestion>
      path={`/games/${gameId}/low-reading`}
      title="로우 판독"
      eyebrow={`${GAMES[gameId].labels.ko} · 로우 판독`}
      footer={`${LOW_QUESTION_COUNT}문제 · 보드와 홀카드는 매번 새로 만들어진다`}
      labels={LOW_KIND_LABEL}
      record={plo8LowRecord}
      generate={generateLowRun}
      hasChips={hasChips}
      renderQuestion={({ question, index, total, verdict, answer, next }) => (
        <LowQuestionPanel
          // 문제마다 새로 그린다 — 이전 문제의 선택이 남으면 답이 미리 찍힌 채로 열린다
          key={index}
          question={question}
          index={index}
          total={total}
          verdict={verdict}
          onAnswerYes={(yes) => {
            if (question.kind !== 'lo-possible') return
            answer(yes === question.answerYes)
          }}
          onAnswerSeats={(seats) => {
            if (question.kind === 'lo-best') {
              answer(seats[0] === question.answerSeat)
              return
            }
            if (question.kind !== 'lo-qualified') return
            answer(
              question.answerSeats.length === seats.length &&
                question.answerSeats.every((s) => seats.includes(s)),
            )
          }}
          onNext={next}
        />
      )}
    />
  )
}
