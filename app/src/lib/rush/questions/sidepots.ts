/**
 * 유형 1 — 사이드팟 분리.
 *
 * 올인이 섞인 베팅 라운드를 보여주고 팟을 층으로 자르게 한다. 정답은 `buildPots` 가 낸다.
 *
 * **각자 낸 금액은 칩으로만 보여준다.** 숫자로 보여주면 남는 게 덧셈뿐이라 문제가 사라진다
 * (설계 §4). 화면 쪽 계약이지만 생성기가 `bet` 을 그대로 넘기므로 여기 적어 둔다.
 */
import { buildPots, type Rng } from '@/lib/simulator'
import { pickNames, shuffled } from '../deal'
import { LIMIT_SEC, KIND_LABEL, type RushQuestion, type RushSeat } from '../types'

/** 베팅의 기준 단위. 여기서 층 간격이 나온다. */
const BASE_UNITS = [1000, 2000, 3000, 5000]

/**
 * 올인 금액의 상한 비율. 콜 금액과 비슷하면 층 자르기가 눈에 안 보인다 (설계 §5.3).
 * "뚜렷이 낮다"를 눈대중이 아니라 숫자로 못박는다.
 */
const ALLIN_MAX_RATIO = 0.7

const fmt = (n: number) => n.toLocaleString('ko-KR')

export function makeSidePots(rng: Rng): RushQuestion | null {
  const seatCount = 3 + rng.int(2) // 3~4명
  const names = pickNames(rng, seatCount)
  const base = rng.pick(BASE_UNITS)
  /** 끝까지 콜한 사람들이 낸 금액 */
  const top = base * (3 + rng.int(3))

  // 올인은 1~2명. 사이드팟에 최소 2명이 남아야 팟이 둘 이상으로 갈린다.
  const allInCount = 1 + rng.int(Math.max(1, Math.min(2, seatCount - 2)))
  const levels: number[] = []

  for (let i = 0; i < allInCount; i++) {
    let level = 0
    for (let attempt = 0; attempt < 40; attempt++) {
      const candidate = base * (1 + rng.int(2)) + 100 * rng.int(10)
      if (candidate <= top * ALLIN_MAX_RATIO && !levels.includes(candidate)) {
        level = candidate
        break
      }
    }
    if (level === 0) return null
    levels.push(level)
  }

  const seats: RushSeat[] = shuffled(
    [
      ...levels.map((bet) => ({ bet, allIn: true })),
      ...Array.from({ length: seatCount - allInCount }, () => ({ bet: top, allIn: false })),
    ],
    rng,
  ).map((s, i) => ({ ...s, name: names[i], hole: undefined }))

  // 정답은 엔진이 낸다. 폴드는 없다 — 아직 살아있는 사람들의 베팅 라운드다.
  const pots = buildPots(
    seats.map((s) => s.bet ?? 0),
    seats.map(() => false),
  )
  if (pots.length < 2) return null

  return {
    kind: 'sidepots',
    label: KIND_LABEL.sidepots,
    prompt: '올인이 나왔다. 팟을 나눠라.',
    limitSec: LIMIT_SEC.sidepots,
    seats,
    board: [],
    buttonSeat: rng.int(seatCount),
    fields: pots.map((pot, i) => ({
      label: i === 0 ? '메인팟' : `사이드팟 ${i}`,
      answer: pot.amount,
    })),
    why: pots
      .map(
        (pot, i) =>
          `${i === 0 ? '메인팟' : `사이드팟 ${i}`} ${fmt(pot.amount)} (참가 ${pot.eligibleSeats.length}명)`,
      )
      .join(' · '),
  }
}
