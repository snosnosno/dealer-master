/**
 * 판정은 여기 하나뿐이다.
 *
 * 프로토타입은 `onPSeat` · `onPChoice` · `onPBet` · `onPAmount` 가 각각
 * `i !== P.ask.answer` 로 직접 비교했다. 판정이 흩어지면 규칙의 정본이 그 수만큼
 * 생기고, 하나를 고칠 때 나머지가 조용히 남는다 — 레포 제1원칙이 막는 것이다.
 *
 * **틀렸을 때 가리지 않는다.** 무엇이 먼저인지 한 줄로 말해 준다 — 연습이기 때문이다.
 */
import { firstToActSeat } from './steps'
import type { ProcedureAction, ProcedureState, Step } from './types'

export type Verdict = { ok: true } | { ok: false; hint: string }

export function judge(state: ProcedureState, action: ProcedureAction): Verdict {
  const step = state.steps[state.at]
  if (step === undefined) return { ok: false, hint: '이미 끝난 핸드입니다.' }

  if (state.phase === 'openSeat') {
    if (action.type !== 'seat') return { ok: false, hint: openHint(state, step) }
    const street = state.spec.streets[step.streetIndex]
    const expected = firstToActSeat(
      street.firstToAct,
      state.script.buttonSeat,
      state.table.seats.length,
      state.table.seats.map((s) => s.folded),
    )
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
      return '아직 블라인드를 걷지 않았습니다. 플랍게임은 SB·BB 로 시작합니다.'
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

function openHint(state: ProcedureState, step: Step): string {
  const street = step.streetIndex >= 0 ? state.spec.streets[step.streetIndex] : null
  return street?.firstToAct === 'left-of-bb'
    ? '이번 라운드의 첫 순서를 지목하세요 — 빅블라인드 왼쪽부터입니다.'
    : '이번 라운드의 첫 순서를 지목하세요 — 버튼 왼쪽에서 살아 있는 좌석부터입니다.'
}
