/**
 * 유형 5 — 홀칩 배분.
 *
 * 동점자가 팟을 나누고 100 칩 하나가 남는다. 그 칩은 누구에게 가나?
 *
 * **규칙을 여기서 다시 구현하지 않는다.** 화면에는 카드가 없지만, 정본인 `awardPots` 는
 * 카드를 받아 쇼다운을 평가한 뒤에 순서를 매긴다. 그래서 "누가 들어와도 무조건 동점"인
 * 히든 배치(`allTieFixture`)를 만들어 넘긴다 — 그러면 `awardPots` 의 승자 집합이 곧
 * 우리가 넘긴 자격자 집합이 되고, 남는 칩을 받은 좌석이 그대로 정답이 된다 (계획서 §1).
 *
 * TDA 2024 규정집 "20: Awarding Odd Chips" 원문 대조 기록은 엔진 `pots.ts` 주석에 있다.
 */
import { GAMES, evaluatorFor } from '@/lib/games'
import { ODD_CHIP_UNIT, awardPots, type Rng } from '@/lib/simulator'
import { allTieFixture, pickNames, shuffled } from '../deal'
import { LIMIT_SEC, KIND_LABEL, type RushQuestion, type RushSeat } from '../types'

/** 팟 러시는 노리밋 홀덤이다 — 아무 다섯 장, 로우 없음 */
const EV = evaluatorFor(GAMES.nlh)

const fmt = (n: number) => n.toLocaleString('ko-KR')

export function makeOddChip(rng: Rng): RushQuestion | null {
  const seatCount = 4 + rng.int(2) // 4~5명
  const names = pickNames(rng, seatCount)

  // 동점자 2~3명. 최소 한 명은 못 받아야 "자격자"라는 개념이 화면에 보인다.
  const winnerCount = Math.min(2 + rng.int(2), seatCount - 1)
  const winners = shuffled(
    Array.from({ length: seatCount }, (_, i) => i),
    rng,
  )
    .slice(0, winnerCount)
    .sort((a, b) => a - b)

  /*
   * 버튼은 자격자든 아니든 그냥 무작위로 앉힌다.
   * 버튼이 늘 자격자면 "버튼 다음 사람"이라는 틀린 규칙을 배운다 (설계 §5.2).
   */
  const buttonSeat = rng.int(seatCount)

  // 홀칩이 정확히 하나 남게 잡는다 (units % winnerCount === 1)
  const units = winnerCount * (30 + rng.int(70)) + 1
  const pot = units * ODD_CHIP_UNIT
  const share = Math.floor(units / winnerCount) * ODD_CHIP_UNIT

  const { hole, board } = allTieFixture(seatCount)
  const awards = awardPots(
    [{ amount: pot, eligibleSeats: winners }], hole, board, buttonSeat, EV,
  )
  const odd = awards.filter((a) => a.amount === share + ODD_CHIP_UNIT)
  // 엔진이 홀칩을 정확히 한 좌석에 몰아주지 않았다면 우리가 팟을 잘못 잡은 것이다.
  if (odd.length !== 1) return null

  const order = awards.map((a) => names[a.seat]).join(' → ')

  const seats: RushSeat[] = names.map((name, i) => ({
    name,
    tie: winners.includes(i),
    folded: !winners.includes(i),
  }))

  return {
    kind: 'oddchip',
    label: KIND_LABEL.oddchip,
    prompt:
      `메인팟 ${fmt(pot)} 을 동점자 ${winnerCount}명이 나눈다.` +
      ` ${fmt(share)} 씩 가고 남는 ${ODD_CHIP_UNIT} 칩은 누구에게?`,
    limitSec: LIMIT_SEC.oddchip,
    seats,
    board: [],
    buttonSeat,
    pot,
    share,
    answerSeat: odd[0].seat,
    why:
      `버튼 왼쪽 첫 자격자부터 시계방향 — ${order}` +
      ` · 버튼은 ${names[buttonSeat]} (자격자면 맨 뒤로 간다)` +
      ` · ${ODD_CHIP_UNIT} 칩 아래로는 쪼갤 수 없다 [TDA 20 Awarding Odd Chips]`,
  }
}
