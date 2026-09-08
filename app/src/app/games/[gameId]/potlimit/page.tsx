/**
 * 팟리밋 계산 — 10문제 한 판.
 *
 * **정답 판정은 여기 있어야 한다.** 패널은 입력된 숫자를 넘길 뿐이고, 그 숫자가
 * 문제의 `answer` 와 같은지는 이 페이지가 정한다 (전역 제약 1).
 *
 * 이 칸은 `drillsFor` 가 `spec.betting === 'PL'` 일 때만 낸다. 노리밋 홀덤에는
 * 이 칸이 아예 없으므로 URL 을 직접 쳐도 404 다 — 격자에서 잠긴 칸과 같은 사실이어야 한다.
 *
 * 생성기와 기록은 `potLimitRun`·`potLimitRecord` 가 `gameId` 당 하나씩 캐시해 준다 —
 * 여기서 클로저를 만들면 렌더마다 새 판이 나온다.
 */
'use client'

import { notFound } from 'next/navigation'
import { use } from 'react'
import { PotLimitQuestionPanel } from '@/components/drills/potlimit/PotLimitQuestionPanel'
import { RushScreen } from '@/components/rush/RushScreen'
import { potLimitRecord, potLimitRun } from '@/lib/drills/potlimit/registry'
import {
  POTLIMIT_KIND_LABEL,
  POTLIMIT_QUESTION_COUNT,
  type PotLimitKind,
  type PotLimitQuestion,
} from '@/lib/drills/potlimit/types'
import { drillHref, GAMES, isGameId } from '@/lib/games'

/** 이 드릴에는 칩이 나온다. **모듈 최상위 함수여야 한다** */
function hasChips(): boolean {
  return true
}

export default function PotLimitPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params)
  if (!isGameId(gameId) || drillHref(gameId, 'potlimit') === null) notFound()

  return (
    <RushScreen<PotLimitKind, PotLimitQuestion>
      path={`/games/${gameId}/potlimit`}
      title="팟리밋 계산"
      eyebrow={`${GAMES[gameId].labels.ko} · 팟리밋 계산`}
      footer={`${POTLIMIT_QUESTION_COUNT}문제 · 답은 레이즈 총액입니다`}
      labels={POTLIMIT_KIND_LABEL}
      record={potLimitRecord(gameId)}
      generate={potLimitRun(gameId)}
      hasChips={hasChips}
      renderQuestion={({ question, index, total, verdict, answer, next }) => (
        <PotLimitQuestionPanel
          // 문제마다 새로 그린다 — 앞 문제에 친 숫자가 남으면 답이 미리 찍힌 채로 열린다
          key={index}
          question={question}
          index={index}
          total={total}
          verdict={verdict}
          onSubmit={(amount) => answer(amount === question.answer)}
          onNext={next}
        />
      )}
    />
  )
}
