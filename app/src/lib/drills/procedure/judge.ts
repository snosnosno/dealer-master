/**
 * 판정은 여기 하나뿐이다.
 *
 * 프로토타입은 `onPSeat` · `onPChoice` · `onPBet` · `onPAmount` 가 각각
 * `i !== P.ask.answer` 로 직접 비교했다. 판정이 흩어지면 규칙의 정본이 그 수만큼
 * 생기고, 하나를 고칠 때 나머지가 조용히 남는다 — 레포 제1원칙이 막는 것이다.
 *
 * **틀렸을 때 가리지 않는다.** 무엇이 먼저인지 한 줄로 말해 준다 — 연습이기 때문이다.
 */
import type { FirstToAct } from '@/lib/games'
import { firstToActSeat } from './steps'
import type { ProcedureAction, ProcedureState, Step } from './types'

export type Verdict = { ok: true } | { ok: false; hint: string }

export function judge(state: ProcedureState, action: ProcedureAction): Verdict {
  const step = state.steps[state.at]
  if (step === undefined) return { ok: false, hint: '이미 끝난 핸드입니다.' }

  if (state.phase === 'openSeat') {
    if (action.type !== 'seat') return { ok: false, hint: openHint(state, step) }
    const street = state.spec.streets[step.streetIndex]
    const expected = firstToActSeat(street.firstToAct, {
      buttonSeat: state.script.buttonSeat,
      seats: state.table.seats,
    })
    return action.seat === expected ? { ok: true } : { ok: false, hint: openHint(state, step) }
  }

  if (action.type !== 'palette') return { ok: false, hint: denyHint(state, step) }
  return action.act === step.act ? { ok: true } : { ok: false, hint: denyHint(state, step) }
}

/** 지금 무엇이 먼저인지 한 줄. 답을 그대로 주지 않고 **무엇을 봐야 하는지**를 말한다. */
function denyHint(state: ProcedureState, step: Step): string {
  const street = step.streetIndex >= 0 ? state.spec.streets[step.streetIndex] : null
  switch (step.act) {
    case 'ante':
      return '아직 앤티를 걷지 않았습니다. 스터드는 앤티와 브링인으로 시작합니다.'
    case 'blinds':
      return '아직 블라인드를 걷지 않았습니다. 플랍게임은 SB·BB로 시작합니다.'
    case 'burn':
      return `${street?.labels.ko} 전에 번카드를 내립니다.`
    case 'deal':
      return `${street?.labels.ko}를 아직 딜하지 않았습니다.`
    case 'draw':
      return `${street?.labels.ko} 교체가 아직입니다.`
    case 'betting':
      return '베팅을 아직 진행하지 않았습니다.'
    case 'payout':
      return '마지막은 팟 지급입니다.'
    default:
      return openHint(state, step)
  }
}

/**
 * 첫 순서 규칙마다 **무엇을 봐야 하는지** 한 줄.
 *
 * 예전에는 `left-of-bb` 가 아니면 전부 「버튼 왼쪽」이라고 말했다. 스터드가 붙은
 * 지금 그것은 **틀린 것을 가르친다** — 라즈 3번가의 첫 순서는 버튼과 아무 상관이 없고
 * 업카드가 정한다. 종목마다 갈리는 규칙에 기본값을 두면 힌트가 조용히 거짓이 된다.
 *
 * 마지막 둘은 그 규칙을 쓰는 종목이 아직 없어 화면에 닿지 않는다. `Record` 로 둔 이유는
 * 새 규칙이 `FirstToAct` 에 붙는 날 컴파일러가 힌트를 빠뜨리지 못하게 하려는 것이다.
 */
const FIRST_TO_ACT_HINT: Record<FirstToAct, string> = {
  'left-of-bb': '빅블라인드 왼쪽부터입니다',
  'left-of-button': '버튼 왼쪽에서 살아 있는 좌석부터입니다',
  'highest-upcard': '업카드가 가장 높은 좌석입니다 — 그 좌석이 브링인을 냅니다',
  'lowest-hand': '열린 카드로 만든 로우가 가장 좋은 좌석입니다',
  'lowest-upcard': '업카드가 가장 낮은 좌석입니다',
  'highest-upcard-by-suit': '업카드가 가장 높은 좌석이고, 같으면 무늬로 가릅니다',
}

function openHint(state: ProcedureState, step: Step): string {
  const street = step.streetIndex >= 0 ? state.spec.streets[step.streetIndex] : null
  // 스트릿에 속하지 않는 스텝(앤티·블라인드·팟 지급)은 첫 순서를 묻지 않는다
  if (street === null) return '이번 라운드의 첫 순서를 지목하세요.'
  return `이번 라운드의 첫 순서를 지목하세요 — ${FIRST_TO_ACT_HINT[street.firstToAct]}.`
}
