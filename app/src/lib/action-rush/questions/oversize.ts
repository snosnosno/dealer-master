/**
 * 유형 3 — 오버사이즈 칩 (제30조, 미달이면 + 제35조 2항).
 *
 * 콜 금액보다 큰 칩 **하나**를 냈다. 선언이 없었으면 콜이고, "레이즈"를 선언했으면
 * 레이즈다 — 그런데 낸 칩이 최소 레이즈에 못 미치면 **선언이 최소 레이즈를 채울
 * 의무를 지운다.** 낸 칩 금액이 곧 레이즈 총액이 되는 게 아니다.
 *
 * 세 갈래 모두 `nlh.interpretChipPush` 가 판정한다. 특히 "최소 레이즈로 채운다"는
 * 그 함수의 `declared === 'raise'` 분기가 `max(낸 금액, minRaiseTo)` 를 돌려주는
 * 것이라 러시가 최소 레이즈를 다시 계산하지 않는다.
 *
 * **플랍 상황으로 낸다.** 프리플랍이면 빅블라인드가 깔려 있어 "BET" 이 성립하지 않고
 * 오픈 벳이 빅블라인드보다 작아질 수 있다 (제35조 1항, 설계 §6.1).
 */
import { nlh, type Rng } from '@/lib/simulator'
import { ARTICLES } from '../articles'
import { flopContext } from '../chain'
import { BLINDS, DENOMS, fmt, roundUnit, unitFor } from '../money'
import { KIND_LABEL, LIMIT_SEC, type ActionQuestion, type Choice } from '../types'

/** 판정 대상의 스택. 올인이 끼어들면 유형이 섞이므로 넉넉히 둔다. */
const DEEP = 1_000_000_000

export function makeOversize(rng: Rng): ActionQuestion | null {
  const bb = rng.pick(BLINDS)
  const u = unitFor(bb)

  const openBet = Math.max(roundUnit(bb * (1 + rng.int(5)), u), bb)
  const ctx = flopContext({ bb, openBet, seatStack: DEEP })
  const minRaiseTo = nlh.minRaiseTo(ctx)

  // 콜 금액보다 크고 지나치게 크지는 않은 단일 액면
  const candidates = DENOMS.filter((d) => d > openBet && d <= openBet * 20)
  if (candidates.length === 0) return null
  const chip = rng.pick(candidates)

  /*
   * 낸 칩이 정확히 최소 레이즈면 "레이즈 (낸 칩)" 과 "레이즈 (최소 레이즈로 채움)" 의
   * 금액이 같아져 두 보기가 구별되지 않는다. 그 판은 버린다 (설계 §6.3).
   */
  if (chip === minRaiseTo) return null

  const declared = rng.next() < 0.55

  // 판정은 엔진이 한다. 여기서 갈래를 정하지 않는다.
  const ruling = nlh.interpretChipPush(ctx, chip, declared ? 'raise' : 'none', [chip])
  /*
   * 칩을 앞으로 민 액션이 폴드·체크로 해석될 길은 없다. 다만 반환 타입이 PlayerAction
   * 전체라 좁혀 줘야 하고, 만약 그 길로 왔다면 우리가 상황을 잘못 세운 것이므로
   * 출제하지 않고 버린다.
   */
  if (ruling.kind === 'fold' || ruling.kind === 'check') return null

  const choices: Choice[] = [
    {
      label: '콜',
      note: `거스름 ${fmt(chip - openBet)} 을 되돌려준다`,
      correct: ruling.kind === 'call',
    },
    {
      label: `레이즈 ${fmt(chip)}`,
      note: '낸 칩이 곧 레이즈 총액',
      correct: ruling.kind !== 'call' && ruling.to === chip,
    },
    {
      label: `레이즈 ${fmt(minRaiseTo)}`,
      note: '최소 레이즈로 채운다',
      correct: ruling.kind !== 'call' && ruling.to === minRaiseTo,
    },
  ]

  // 엔진 판정에 해당하는 보기가 정확히 하나여야 한다. 아니면 보기를 잘못 만든 것이다.
  if (choices.filter((c) => c.correct).length !== 1) return null

  const why =
    ruling.kind === 'call'
      ? `선언 없이 단일 오버사이즈 칩을 낸 것은 콜이다. ` +
        `${fmt(chip)} − ${fmt(openBet)} = ${fmt(chip - openBet)} 을 되돌려준다.`
      : ruling.to === chip
        ? `칩이 닿기 전에 "레이즈"를 선언했으므로 레이즈다. 최소 레이즈는 ` +
          `${fmt(openBet)} + ${fmt(minRaiseTo - openBet)} = ${fmt(minRaiseTo)} 인데 ` +
          `낸 칩 ${fmt(chip)} 이 그 이상이므로 총액 ${fmt(chip)} 의 레이즈다.`
        : `선언했으므로 레이즈는 맞다. 그러나 최소 레이즈는 ${fmt(openBet)} + ` +
          `${fmt(minRaiseTo - openBet)} = ${fmt(minRaiseTo)} 이고 낸 칩 ${fmt(chip)} 은 ` +
          `여기에 못 미친다. 선언이 최소 레이즈를 채울 의무를 지우므로 ${fmt(minRaiseTo)} 으로 ` +
          `채운다 — 낸 칩 금액이 곧 레이즈 총액이 되는 것이 아니다.`

  return {
    kind: 'oversize',
    input: 'choice',
    label: KIND_LABEL.oversize,
    prompt:
      `MP 가 ${fmt(chip)} 칩 하나를 냈다. ` +
      (declared
        ? '칩이 테이블에 닿기 전에 "레이즈"라고 선언했다. '
        : '아무 말도 하지 않았다. ') +
      '이 액션은?',
    limitSec: LIMIT_SEC.oversize,
    street: '플랍',
    bb,
    rows: [{ who: 'UTG', act: 'BET', amount: openBet }],
    seats: [
      { name: 'UTG', bet: openBet, act: 'BET' },
      {
        name: 'MP',
        bet: chip,
        chips: [chip],
        act: declared ? '밀었다 ("레이즈" 선언)' : '밀었다 (선언 없음)',
        hero: true,
      },
    ],
    article: ruling.kind !== 'call' && ruling.to !== chip ? ARTICLES.oversizeFill : ARTICLES.oversize,
    choices,
    why,
  }
}
