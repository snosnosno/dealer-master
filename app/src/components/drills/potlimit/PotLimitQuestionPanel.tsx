/**
 * 팟리밋 계산 문제 한 장.
 *
 * **보기가 없다.** 팟리밋에서는 벳 크기가 선택이 아니라 계산이라, 보기를 주면 계산하지
 * 않고 고를 수 있게 된다 (`mix-room.html` 설계 주석).
 *
 * 벳은 화면에 **실제로 칩으로 놓는다.** 팟리밋 계산은 머리로 그리는 일이 아니라
 * 테이블에 있는 칩을 세는 일이다.
 *
 * **정답 판정을 여기 쓰지 마라.** 이 컴포넌트는 입력된 숫자를 `onSubmit` 으로 넘길 뿐이고,
 * 맞았는지는 페이지가 문제의 `answer` 와 대조해 정한다 (전역 제약 1).
 *
 * 입력칸 상태는 페이지의 `key={index}` 에 기대어 리셋된다 — 의도된 결합이다.
 */
'use client'

import { useState } from 'react'
import { PokerTable } from '@/components/table/PokerTable'
import type { PotLimitQuestion } from '@/lib/drills/potlimit/types'
import type { Verdict } from '@/lib/rush/session'

const won = (n: number) => n.toLocaleString('ko-KR')

/**
 * 아홉 자리까지만 받는다. 답은 블라인드에서 나온 팟에 매인 값이라 이보다 클 일이 없고,
 * 붙여넣기로 들어온 긴 숫자는 `Number` 가 안전 정수를 넘겨 엉뚱한 값이 된다.
 */
const MAX_DIGITS = 9

/**
 * 입력칸에 **보이는 것과 채점되는 값을 같게** 만든다.
 *
 * 걸러 내기만 하고 원문을 그대로 두면 「1,0a0」이 칸에 남은 채 100 으로 채점된다 —
 * 트레이니는 자기가 왜 틀렸는지 알 수 없다. 앞의 0 도 여기서 지운다(`007` → `7`).
 */
function digitsOnly(raw: string): string {
  return raw
    .replace(/[^0-9]/g, '')
    .slice(0, MAX_DIGITS)
    .replace(/^0+(?=[0-9])/, '')
}

export function PotLimitQuestionPanel({
  question,
  index,
  total,
  verdict,
  onSubmit,
  onNext,
}: {
  question: PotLimitQuestion
  index: number
  total: number
  verdict: Verdict
  /** 입력된 금액. 레이즈 **총액**이다 */
  onSubmit(amount: number): void
  onNext(): void
}) {
  const [text, setText] = useState('')
  const solving = verdict === null

  // `text` 는 숫자만, 아홉 자리 이하다 — `Number` 가 늘 안전 정수를 낸다
  const parsed = text === '' ? 0 : Number(text)
  // 0 으로는 제출하지 못한다. 규정이 정하는 최대 벳은 늘 0 보다 크므로 답이 될 수 없고,
  // 빈 칸을 잘못 눌러 「틀렸다」를 받는 것은 계산을 틀린 것과 다른 일이다
  const ready = Number.isSafeInteger(parsed) && parsed > 0

  return (
    <div>
      {/* 슬래시 양옆을 띄운다 — 승자 판독·팟 분배 패널과 같은 줄이어야 한다 */}
      <p className="mb-1 text-xs text-zinc-500">
        {index + 1} / {total} · {question.label}
      </p>

      {/*
        * 판이 어떤 상황인지를 **그림보다 먼저** 적는다. 블라인드를 모르면 앞에 놓인
        * 칩이 큰지 작은지 판단할 근거가 없고, 스트릿을 모르면 가운데 팟이 어디서
        * 왔는지 읽을 수 없다 — 둘 다 없던 화면이 「이건 무슨 상황이냐」였다.
        */}
      <p className="mb-2 text-xs font-bold text-zinc-600 dark:text-zinc-400">
        블라인드 {won(question.sb)}/{won(question.bb)} · {question.street}
      </p>

      <div className="sim-root">
        <PokerTable
          state={{
            seats: question.seats.map((s) => ({
              name: s.name,
              stack: 0,
              bet: s.bet,
              folded: s.folded,
              allIn: false,
              hole: [],
              revealed: false,
            })),
            buttonSeat: question.buttonSeat,
            board: question.board,
            pot: question.collected,
          }}
          burnCount={0}
          seatActs={question.seats.map((s) => s.act)}
          heroSeat={question.heroSeat}
        />
      </div>

      <p className="mt-3 break-keep text-sm font-bold">{question.prompt}</p>
      <p className="text-xs text-zinc-500">화면에 놓인 칩을 세어 보세요</p>

      <input
        inputMode="numeric"
        aria-label="답 금액"
        value={text}
        onChange={(e) => setText(digitsOnly(e.target.value))}
        disabled={!solving}
        placeholder="금액"
        className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-right text-lg font-bold tabular-nums disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {/* 자릿점을 찍어 되읽어 준다 — 0 세 개를 더 친 것을 여기서 알아챈다 */}
      {ready ? (
        <p className="mt-1 text-right text-xs text-zinc-500">{won(parsed)}</p>
      ) : null}

      {solving ? (
        <button
          type="button"
          onClick={() => onSubmit(parsed)}
          disabled={!ready}
          className="mt-3 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          제출
        </button>
      ) : (
        <>
          {/*
           * 맞았는지 틀렸는지를 먼저 말한다. 답만 보여 주면 트레이니는 자기 답이
           * 어느 쪽이었는지 모른 채로 다음 문제로 간다 — 드릴이 성립하지 않는다
           */}
          <p className="mt-3 text-sm font-bold">{verdict.headline}</p>
          {/*
           * `break-keep` — 이 줄이 없으면 360px 에서 「팟벳」이 「팟」/「벳은」으로,
           * 데스크톱에서 「공식」이 「공」/「식은」으로 **단어 가운데가 잘린다**.
           * 렌더로만 보이는 결함이라 눈으로 찾았다. 집안 규약(`QuestionPanel.tsx`
           * ·`ActionQuestionPanel.tsx` 의 근거 문단)과 같은 손이다.
           */}
          <p className="mt-2 break-keep rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
            정답 <b>{won(question.answer)}</b> — {question.why}
          </p>
          <button
            type="button"
            onClick={onNext}
            className="mt-2 w-full rounded-xl bg-dm-teal-600 py-3 text-sm font-bold text-white"
          >
            다음
          </button>
        </>
      )}
    </div>
  )
}
