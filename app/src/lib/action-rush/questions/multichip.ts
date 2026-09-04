/**
 * 유형 4 — 다중 칩 베팅 (제31조).
 *
 * 선언 없이 칩 여러 개를 밀었다. 콜인가, 레이즈 시도인가, 올인인가?
 * 판정 기준은 **"가장 작은 칩 하나를 빼면 콜 금액에 미치는가"** 다.
 *
 * 세 갈래를 `nlh.interpretChipPush` 가 가른다. 러시가 하는 일은 **상황을 세우는 것**
 * 뿐이다 — "마지막 칩인가"는 좌석 스택으로 조절하고(스택 == 민 금액이면 올인),
 * 나머지는 칩 액면 구성으로 조절한다.
 *
 * 50% 규칙(제29조 3항)은 "레이즈 시도" 갈래의 **후속** 판정이라 이번 범위가 아니다.
 * 그래서 보기도 거기까지만 묻는다.
 */
import { nlh, type Rng } from '@/lib/simulator'
import { ARTICLES } from '../articles'
import { flopContext } from '../chain'
import { BLINDS, belowDenom, fmt, roundUnit } from '../money'
import { KIND_LABEL, LIMIT_SEC, type ActionQuestion, type Choice } from '../types'

/** 문제에 쓰는 칩 액면. 너무 작으면 콜 금액이 블라인드 아래로 내려간다. */
const PUSH_DENOMS = [1000, 5000, 25000] as const

export function makeMultiChip(rng: Rng): ActionQuestion | null {
  // 세 갈래를 고르게 뽑는다. 한 갈래만 나오면 찍어서 맞힐 수 있다.
  const branch = rng.pick(['call', 'raise', 'allin'] as const)
  const d = rng.pick(PUSH_DENOMS)

  let chips: number[]
  let openBet: number
  let lastChips: boolean

  if (branch === 'call') {
    // 가장 작은 칩 하나를 빼면 콜에 미달해야 한다 → d < 콜 < 2d
    chips = [d, d]
    openBet = roundUnit(d * (1.05 + rng.next() * 0.7), belowDenom(d))
    lastChips = rng.next() < 0.5
  } else {
    // 하나를 빼도 콜 이상이어야 한다 → 콜 < 2d
    chips = [d, d, d]
    openBet = roundUnit(d * (0.6 + rng.next() * 0.35), belowDenom(d))
    lastChips = branch === 'allin'
  }

  /*
   * 오픈 벳은 빅블라인드 이상이어야 한다 (제35조 1항). 칩 액면에서 콜 금액을 만들다
   * 최소 블라인드보다 작아지면 그 자체가 불법 상황이므로 여기서 끌어올린다.
   * 블라인드는 그 뒤에 벳 이하로 고른다 — bb 를 먼저 뽑으면 불법 상황이 나온다.
   */
  if (openBet < BLINDS[0]) openBet = BLINDS[0]
  const bbChoices = BLINDS.filter((v) => v <= openBet)
  if (bbChoices.length === 0) return null
  const bb = rng.pick(bbChoices)

  const total = chips.reduce((a, b) => a + b, 0)
  // "마지막 칩인가"는 스택으로 정한다. 엔진은 wagerTo >= maxTo 일 때 올인이라고 답한다.
  const seatStack = lastChips ? total : total + d

  const ctx = flopContext({ bb, openBet, seatStack })
  const ruling = nlh.interpretChipPush(ctx, total, 'none', chips)

  // 만들려던 갈래와 엔진의 판정이 다르면 상황을 잘못 세운 것이다. 버린다.
  if (ruling.kind !== branch) return null

  const smallest = Math.min(...chips)
  const minusOne = total - smallest

  const choices: Choice[] = [
    { label: '콜', note: '가장 작은 칩 하나를 빼면 콜에 미달', correct: ruling.kind === 'call' },
    {
      label: '레이즈 시도',
      note: '50% 규칙(제29조 3항)의 적용을 받는다',
      correct: ruling.kind === 'raise',
    },
    { label: '올인', note: '마지막 칩이므로 50% 규칙과 무관', correct: ruling.kind === 'allin' },
  ]

  return {
    kind: 'multichip',
    input: 'choice',
    label: KIND_LABEL.multichip,
    prompt:
      'MP 가 선언 없이 칩을 밀었다. ' +
      (lastChips ? '남은 칩 전부다. ' : '칩은 더 남아 있다. ') +
      '이 액션은?',
    limitSec: LIMIT_SEC.multichip,
    street: '플랍',
    bb,
    rows: [{ who: 'UTG', act: 'BET', amount: openBet }],
    seats: [
      { name: 'UTG', bet: openBet, act: 'BET' },
      {
        name: 'MP',
        bet: total,
        chips,
        act: lastChips ? '밀었다 (남은 칩 전부)' : '밀었다 (칩 더 있음)',
        hero: true,
      },
    ],
    article: ARTICLES.multiChip,
    choices,
    why:
      `민 칩 ${fmt(total)} 에서 가장 작은 단위 ${fmt(smallest)} 하나를 빼면 ${fmt(minusOne)} 이다. ` +
      (ruling.kind === 'call'
        ? `콜 금액 ${fmt(openBet)} 에 미치지 못하므로 콜이다.`
        : `콜 금액 ${fmt(openBet)} 이상이므로 콜이 아니다. ` +
          (ruling.kind === 'allin'
            ? '마지막 칩으로 베팅했으므로 50% 규칙과 관계없이 올인이다.'
            : '칩이 더 남아 있으므로 레이즈 시도이고, 50% 규칙의 적용을 받는다.')),
  }
}
