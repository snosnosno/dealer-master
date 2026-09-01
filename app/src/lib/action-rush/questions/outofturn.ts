/**
 * 유형 5 — 순서를 어긴 액션 (제27조 2·3항).
 *
 * C 가 B 를 건너뛰고 먼저 행동했다. B 가 실제로 한 행동에 따라 C 의 액션이
 * 구속력을 갖는지가 갈린다. 단, **순서를 어긴 폴드는 언제나 구속력을 가진다.**
 *
 * 판정은 엔진의 `resolveOutOfTurn` 이 한다 (`rulesets/procedure.ts`). 이 규칙은
 * 축 2 를 만들면서 엔진에 새로 넣었다 — 그 전에는 개념 자체가 없었다.
 *
 * **플랍 상황으로 낸다.** 프리플랍이면 빅블라인드가 깔려 있어 "BET" 이 성립하지 않는다.
 */
import { resolveOutOfTurn, type OutOfTurnAction, type ProperAction, type Rng } from '@/lib/simulator'
import { ARTICLES } from '../articles'
import { BLINDS, fmt, roundUnit, unitFor } from '../money'
import { KIND_LABEL, LIMIT_SEC, type ActionQuestion, type LogRow } from '../types'

/**
 * 로그에 쓰는 액션 표기. **영어 대문자다** — 다른 유형의 로그가 BET·RAISE·ALL IN 이라
 * 여기만 한글이면 한 화면 안에서 표기가 갈린다.
 *
 * 한글에 `.toUpperCase()` 를 걸어도 아무 일도 일어나지 않는다. 그래서 대문자로
 * "바꾸는" 대신 대문자 표기를 **따로 둔다** — 그게 실제로 일어나는 일이다.
 */
const LOG_ACT: Record<OutOfTurnAction | ProperAction, string> = {
  fold: 'FOLD',
  check: 'CHECK',
  call: 'CALL',
  bet: 'BET',
  raise: 'RAISE',
}

/** 보기 설명에 쓰는, 주격 조사가 붙은 형태. 엔진 `procedure.ts` 의 TOPIC 과 같은 이유다. */
const TOPIC: Record<OutOfTurnAction, string> = {
  fold: '폴드는',
  check: '체크는',
  call: '콜은',
}

/** 지문과 보기에 쓰는 표기. 이쪽은 문장에 들어가므로 한글이다. */
const LABEL: Record<OutOfTurnAction | ProperAction, string> = {
  fold: '폴드',
  check: '체크',
  call: '콜',
  bet: '벳',
  raise: '레이즈',
}

/**
 * 순서를 어긴 액션이 체크면 앞사람은 벳이 없는 상황이어야 하고, 콜·폴드면 벳이 있어야
 * 한다. 상황과 액션이 어긋나면 애초에 성립하지 않는 문제가 된다.
 */
const PROPER_BY_OOT: Record<OutOfTurnAction, ProperAction[]> = {
  check: ['check', 'bet'],
  call: ['fold', 'call', 'raise'],
  fold: ['fold', 'call', 'raise'],
}

export function makeOutOfTurn(rng: Rng): ActionQuestion | null {
  const bb = rng.pick(BLINDS)
  const u = unitFor(bb)
  const bet = roundUnit(bb * (2 + rng.int(5)), u)
  const raiseTo = bet + roundUnit(bet * (1 + rng.next()), u)

  const oot = rng.pick(['call', 'check', 'fold'] as const)
  const proper = rng.pick(PROPER_BY_OOT[oot])

  const ruling = resolveOutOfTurn(oot, proper)

  // A 가 벳했는가 — 체크 갈래에서는 A 도 체크다
  const hasBet = oot !== 'check'
  const properAmount =
    proper === 'raise' ? raiseTo : proper === 'bet' || proper === 'call' ? bet : undefined

  const rows: LogRow[] = [
    hasBet ? { who: 'A', act: 'BET', amount: bet } : { who: 'A', act: 'CHECK' },
    {
      who: 'C',
      act: `${LOG_ACT[oot]} (순서 위반)`,
      amount: oot === 'call' ? bet : undefined,
      outOfTurn: true,
    },
    { who: 'B', act: `${LOG_ACT[proper]} (본래 순서)`, amount: properAmount },
  ]

  return {
    kind: 'outofturn',
    input: 'choice',
    label: KIND_LABEL.outofturn,
    prompt: `C가 순서를 어기고 ${LABEL[oot]}했다. B는 ${LABEL[proper]}. C의 액션은?`,
    limitSec: LIMIT_SEC.outofturn,
    street: '플랍',
    bb,
    rows,
    /*
     * 시계방향 순서가 A → B → C 다. C 가 B 를 건너뛰고 먼저 행동한 것이 문제의
     * 핵심이라 **좌석 순서로 보여야 한다** — 로그만으로는 "건너뛰었다"가 드러나지 않는다.
     */
    seats: [
      { name: 'A', bet: hasBet ? bet : 0, act: hasBet ? 'BET' : 'CHECK' },
      {
        name: 'B',
        bet: properAmount ?? 0,
        act: `${LOG_ACT[proper]} (본래 순서)`,
      },
      {
        name: 'C',
        bet: oot === 'call' ? bet : 0,
        act: `${LABEL[oot]} · 순서 위반`,
        outOfTurn: true,
        hero: true,
      },
    ],
    article: ARTICLES.outOfTurn,
    choices: [
      {
        label: '구속력을 가진다',
        note: `C의 ${TOPIC[oot]} 그대로 유효하다`,
        correct: ruling.binding,
      },
      {
        label: '무효 — 벳을 회수하고 새 옵션',
        note: 'C는 모든 옵션을 새로 가진다',
        correct: !ruling.binding,
      },
    ],
    why: ruling.reason + ` (벳 ${fmt(bet)})`,
  }
}
