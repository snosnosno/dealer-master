/**
 * 팟 판독 러시 — 10문제 한 판.
 *
 * 이 파일에 남는 것은 **이 축이 다른 축과 다른 부분뿐**이다: 문제 생성기, 최고 기록 키,
 * 화면 한 장, 그리고 정답 판정. 타이머·점수·연속·결과 화면은 `RushScreen` 과
 * `useRushRun` 이 한다 — 축 1·2 가 그 루프를 각자 복사해 두고 있었다.
 *
 * **정답 판정은 여기 있어야 한다.** `RushQuestion` 유니온의 어느 갈래인지 아는 것은
 * 이 축뿐이고, 공용 뼈대가 그것을 알기 시작하면 축이 늘 때마다 뼈대가 부푼다.
 */
'use client'

import { QuestionPanel } from '@/components/rush/QuestionPanel'
import { RushScreen } from '@/components/rush/RushScreen'
import { generateRun } from '@/lib/rush/generate'
import { potRushRecord } from '@/lib/rush/record'
import { KIND_LABEL, QUESTION_COUNT, type RushKind, type RushQuestion } from '@/lib/rush/types'

/** 칩이 보이는 유형이면 딜링 소리 뒤에 칩 소리가 따라온다 */
function hasChips(question: RushQuestion): boolean {
  return question.kind === 'sidepots' || question.pot !== undefined
}

export default function RushPage() {
  return (
    <RushScreen<RushKind, RushQuestion>
      path="/rush"
      title="팟 판독 러시"
      eyebrow="판정 훈련 · 노리밋 홀덤"
      footer={`${QUESTION_COUNT}문제 · 카드와 팟은 매번 새로 만들어진다`}
      labels={KIND_LABEL}
      record={potRushRecord}
      generate={generateRun}
      hasChips={hasChips}
      renderQuestion={({ question, index, total, verdict, answer, next }) => (
        <QuestionPanel
          // 문제마다 새로 그린다 — 이전 문제의 입력이 남으면 정답이 미리 찍힌 채로 열린다
          key={index}
          question={question}
          index={index}
          total={total}
          verdict={verdict}
          onAnswerSeats={(seats) => {
            if (question.kind === 'sidepots') return
            answer(
              question.kind === 'split'
                ? question.answerSeats.length === seats.length &&
                    question.answerSeats.every((s) => seats.includes(s))
                : seats[0] === question.answerSeat,
            )
          }}
          onAnswerFields={(values) => {
            if (question.kind !== 'sidepots') return
            answer(question.fields.every((field, i) => values[i] === field.answer))
          }}
          onNext={next}
        />
      )}
    />
  )
}
