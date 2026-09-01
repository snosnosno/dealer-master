/**
 * 액션 판정 러시 — 10문제 한 판.
 *
 * 축 1(`app/rush/page.tsx`)과 뼈대를 공유한다 (`RushScreen` · `useRushRun`).
 * 여기 남는 것은 이 축만의 것: 문제 생성기, 최고 기록 키(`actionrush.best`),
 * 화면 한 장, 정답 판정.
 */
'use client'

import { ActionQuestionPanel } from '@/components/action-rush/ActionQuestionPanel'
import { RushScreen } from '@/components/rush/RushScreen'
import { generateRun } from '@/lib/action-rush/generate'
import {
  KIND_LABEL,
  QUESTION_COUNT,
  type ActionKind,
  type ActionQuestion,
} from '@/lib/action-rush/types'
import { actionRushRecord } from '@/lib/rush/record'

/** 칩이 앞에 나가 있는 문제면 딜링 소리 뒤에 칩 소리가 따라온다 */
function hasChips(question: ActionQuestion): boolean {
  return question.seats.some((seat) => (seat.bet ?? 0) > 0)
}

export default function ActionRushPage() {
  return (
    <RushScreen<ActionKind, ActionQuestion>
      path="/action-rush"
      title="액션 판정 러시"
      eyebrow="판정 훈련 · 액션 규정"
      footer={`${QUESTION_COUNT}문제 · 정답 근거는 WINNABLE 공식 대회 규정이다`}
      labels={KIND_LABEL}
      record={actionRushRecord}
      generate={generateRun}
      hasChips={hasChips}
      renderQuestion={({ question, index, total, verdict, answer, next }) => (
        <ActionQuestionPanel
          // 문제마다 새로 그린다 — 이전 문제의 입력이 남으면 정답이 미리 찍힌 채로 열린다
          key={index}
          question={question}
          index={index}
          total={total}
          verdict={verdict}
          onAnswerChoice={(choiceIndex) => {
            if (question.input !== 'choice') return
            answer(question.choices[choiceIndex]?.correct === true)
          }}
          onAnswerNumber={(value) => {
            if (question.input !== 'number') return
            answer(value === question.answer)
          }}
          onNext={next}
        />
      )}
    />
  )
}
