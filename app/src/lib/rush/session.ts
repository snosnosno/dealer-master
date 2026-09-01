/**
 * 러시 한 판의 상태 기계 — 축이 공유한다.
 *
 * 비유: 게임기의 본체다. 카트리지(문제 생성기·화면)는 축마다 갈아 끼우지만
 * 타이머·점수·연속·기록은 본체가 한다.
 *
 * **축마다 이 루프를 복사하지 마라.** 축 1 과 축 2 가 실제로 그렇게 시작했고,
 * 두 페이지 291·293 줄 중 219 줄이 같은 코드였다. 셋째 축이 붙기 전에 뺀다.
 * 갈라지면 조용히 갈라진다 — 타이머 역산이나 연속 배수가 한쪽만 바뀌어도
 * 화면은 멀쩡해 보이고 점수만 달라진다.
 *
 * 축마다 다른 것은 셋뿐이다: 문제 타입 · 칩 소리를 낼 문제인가 · 정답을 어떻게 판정하는가.
 * 앞의 둘은 인자로 받고, 마지막은 **호출부가 판정해서 `answer(correct)` 로 알린다** —
 * 정답 판정은 축의 문제 타입을 아는 쪽에만 있어야 한다.
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useMuted, saveMuted, type BestRecord } from './record'
import { applyAnswer, emptyRun, type RunState } from './score'
import { playBad, playChips, playDeal, playGood, playTick, unlockSound } from './sound'

/** 채점 결과. `null` 이면 아직 푸는 중이다. */
export type Verdict = { correct: boolean; points: number; headline: string } | null

/** 러시가 문제에 요구하는 최소 조건. 나머지는 축이 자기 타입으로 안다. */
export type RushLike<K extends string> = { kind: K; limitSec: number }

/** 남은 시간이 만드는 긴장 단계. 타이머 색과 진행바가 같은 값을 쓴다. */
export type TimeLevel = 'calm' | 'warn' | 'crit'

/** 마지막 몇 초부터 틱 소리를 내나 */
const TICK_FROM_SEC = 5
/** 딜링 소리와 칩 소리 사이 간격 */
const CHIP_SOUND_DELAY_MS = 180

export type RushRunState<K extends string, Q extends RushLike<K>> = {
  question: Q
  index: number
  total: number
  done: boolean
  run: RunState<K>
  verdict: Verdict
  /** 남은 시간(초). 소수점이 있다 — 화면이 0.1s 단위로 보여준다 */
  remaining: number
  /** 남은 시간 비율 0~1. 진행바 너비 */
  ratio: number
  level: TimeLevel
  best: number
  isNewBest: boolean
  muted: boolean
  /** 채점한다. 정답 판정은 호출부가 이미 끝낸 상태다 */
  answer(correct: boolean): void
  next(): void
  toggleMute(): void
}

export function useRushRun<K extends string, Q extends RushLike<K>>({
  questions,
  record,
  hasChips,
}: {
  questions: readonly Q[]
  record: BestRecord
  /**
   * 이 문제에 칩이 나오나 — 딜링 소리 뒤에 칩 소리를 얹을지 정한다.
   *
   * **모듈 최상위 함수여야 한다.** 렌더마다 새 함수를 넘기면 딜링 소리 이펙트가
   * 매 렌더 다시 돌아 같은 문제에서 소리가 반복된다.
   */
  hasChips(question: Q): boolean
}): RushRunState<K, Q> {
  const [index, setIndex] = useState(0)
  const [run, setRun] = useState<RunState<K>>(emptyRun)
  const [verdict, setVerdict] = useState<Verdict>(null)
  /** 지금 문제가 열린 시각. 첫 문제는 마운트, 그 뒤는 "다음 문제"를 누른 순간이다 */
  const [openedAt, setOpenedAt] = useState(() => now())
  const [remaining, setRemaining] = useState(questions[0].limitSec)
  const [isNewBest, setIsNewBest] = useState(false)

  const best = record.useBest()
  const muted = useMuted()

  const done = index >= questions.length
  const question = questions[Math.min(index, questions.length - 1)]
  const solving = verdict === null && !done
  const deadline = openedAt + question.limitSec * 1000

  /*
   * 첫 사용자 제스처에서 오디오를 연다. 이 전에는 소리를 만들지 않는다 —
   * 자동재생 정책에 막히는 방식이 조용해서, 그냥 열어 두면 "소리가 안 난다"만 남는다.
   */
  useEffect(() => {
    const open = () => unlockSound()
    window.addEventListener('pointerdown', open, { once: true })
    window.addEventListener('keydown', open, { once: true })
    return () => {
      window.removeEventListener('pointerdown', open)
      window.removeEventListener('keydown', open)
    }
  }, [])

  const finish = useCallback(
    (correct: boolean, headline: string) => {
      // 시간초과와 사용자 입력이 같은 순간에 겹칠 수 있다. 먼저 온 판정만 남긴다
      if (verdict !== null) return
      const left = Math.max(0, (deadline - now()) / 1000)
      const result = applyAnswer(run, question.kind, correct, left)
      setRun(result.state)
      setRemaining(left)
      setVerdict({ correct, points: result.points, headline })
      if (correct) playGood()
      else playBad()
    },
    [verdict, deadline, run, question.kind],
  )

  const answer = useCallback(
    (correct: boolean) => finish(correct, correct ? '정확하다' : '틀렸다'),
    [finish],
  )

  /*
   * 문제가 열릴 때 딜링 소리, 칩이 있는 유형이면 조금 뒤에 칩 소리.
   * 두 소리를 같은 순간에 겹치면 노이즈 버스트끼리 뭉쳐 한 덩어리로 들린다.
   */
  useEffect(() => {
    if (!solving) return
    playDeal()
    if (!hasChips(question)) return
    const id = window.setTimeout(playChips, CHIP_SOUND_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [solving, question, hasChips])

  /*
   * 남은 시간 갱신. setState 는 프레임 콜백 안에서만 일어난다 —
   * 이펙트 본문에서 바로 부르면 렌더가 연쇄로 돈다.
   *
   * 인터벌마다 남은 시간을 빼지 않고 **마감 시각에서 매번 역산한다.**
   * 점수가 남은 시간에 비례하므로 누적 오차가 곧 점수 오차다.
   */
  useEffect(() => {
    if (!solving) return
    let frame = 0
    let lastTickSec = Number.POSITIVE_INFINITY
    let expired = false

    const step = () => {
      const left = Math.max(0, (deadline - now()) / 1000)
      setRemaining(left)

      const sec = Math.ceil(left)
      if (left > 0 && sec <= TICK_FROM_SEC && sec !== lastTickSec) {
        lastTickSec = sec
        playTick()
      }

      if (left <= 0) {
        if (!expired) {
          expired = true
          onExpire()
        }
        return
      }
      frame = window.requestAnimationFrame(step)
    }

    // 이펙트가 다시 돌 때 낡은 finish 를 잡지 않도록 한 겹 감싼다
    const onExpire = () => finish(false, '시간 초과')

    frame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frame)
  }, [solving, deadline, finish])

  const next = useCallback(() => {
    const at = index + 1
    if (at >= questions.length) {
      // 판이 끝났다. 기록은 여기서 한 번만 쓴다 — 경신 여부는 쓰기 전 값과 비교한다
      const previous = record.readBest()
      record.saveBest(run.score)
      setIsNewBest(run.score > previous)
    }
    setVerdict(null)
    setOpenedAt(now())
    setIndex(at)
  }, [index, questions.length, run.score, record])

  const toggleMute = useCallback(() => saveMuted(!muted), [muted])

  const ratio = done ? 0 : Math.max(0, remaining / question.limitSec)
  const level: TimeLevel = ratio < 0.2 ? 'crit' : ratio < 0.45 ? 'warn' : 'calm'

  return {
    question,
    index,
    total: questions.length,
    done,
    run,
    verdict,
    remaining,
    ratio,
    level,
    best,
    isNewBest,
    muted,
    answer,
    next,
    toggleMute,
  }
}

/** 단조 증가 시계. 시스템 시각이 바뀌어도 남은 시간이 튀지 않는다 */
function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}
