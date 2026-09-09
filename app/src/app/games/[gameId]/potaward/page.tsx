/**
 * 팟 분배 — 10문제 한 판.
 *
 * **정답 판정은 여기 있어야 한다.** 문제의 답이 어떤 모양인지 아는 것은 이 드릴뿐이고,
 * 공용 뼈대(`RushScreen`)가 그것을 알기 시작하면 드릴이 늘 때마다 뼈대가 부푼다.
 *
 * 생성기와 기록은 `potAwardRun`·`potAwardRecord` 가 `gameId` 당 하나씩 캐시해 준다 —
 * 여기서 클로저를 만들면 렌더마다 새 판이 나온다.
 */
'use client'

import { notFound } from 'next/navigation'
import { use } from 'react'
import { PotAwardQuestionPanel } from '@/components/drills/potaward/PotAwardQuestionPanel'
import { RushScreen } from '@/components/rush/RushScreen'
import { potAwardRecord, potAwardRun } from '@/lib/drills/potaward/registry'
import {
  POTAWARD_KIND_LABEL,
  POTAWARD_QUESTION_COUNT,
  type PotAwardKind,
  type PotAwardPotAnswer,
  type PotAwardQuestion,
} from '@/lib/drills/potaward/types'
import { drillHref, GAMES, isGameId } from '@/lib/games'

/** 이 드릴에는 칩이 나온다. **모듈 최상위 함수여야 한다** */
function hasChips(): boolean {
  return true
}

/** 순서를 무시하고 같은 좌석 묶음인가 */
function sameSeats(picked: readonly number[], answer: readonly number[]): boolean {
  return picked.length === answer.length && answer.every((s) => picked.includes(s))
}

/**
 * 채점의 정본. **층 하나라도 틀리면 틀린 것이다** — 메인팟만 맞히고 서드팟을 놓친
 * 분배는 테이블에서 그냥 틀린 분배다. 반쯤 맞음을 만들지 않는다.
 *
 * 로우를 비워 낸 것은 「이 층에 자격 있는 로우가 없다」는 답이다 (패널의
 * 「로우 없음」 버튼). 정답 쪽 `lo` 도 그때 비어 있으므로 그대로 대조하면 된다.
 */
function isCorrect(picked: PotAwardPotAnswer[], question: PotAwardQuestion): boolean {
  if (picked.length !== question.answers.length) return false
  return question.answers.every(
    (a, i) => sameSeats(picked[i].hi, a.hi) && sameSeats(picked[i].lo, a.lo),
  )
}

export default function PotAwardPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params)
  // 준비되지 않은 종목의 URL 을 직접 치면 404 다. 화면에서 잠긴 칸과 같은 사실이어야 한다
  if (!isGameId(gameId) || drillHref(gameId, 'potaward') === null) notFound()

  return (
    <RushScreen<PotAwardKind, PotAwardQuestion>
      path={`/games/${gameId}/potaward`}
      title="팟 분배"
      eyebrow={`${GAMES[gameId].labels.ko} · 팟 분배`}
      footer={`${POTAWARD_QUESTION_COUNT}문제 · 층마다 하이·로우 임자를 고른다`}
      labels={POTAWARD_KIND_LABEL}
      record={potAwardRecord(gameId)}
      generate={potAwardRun(gameId)}
      hasChips={hasChips}
      renderQuestion={({ question, index, total, verdict, answer, next }) => (
        <PotAwardQuestionPanel
          // 문제마다 새로 그린다 — 이전 문제의 선택이 남으면 답이 미리 찍힌 채로 열린다
          key={index}
          question={question}
          index={index}
          total={total}
          verdict={verdict}
          onSubmit={(picked) => answer(isCorrect(picked, question))}
          onNext={next}
        />
      )}
    />
  )
}
