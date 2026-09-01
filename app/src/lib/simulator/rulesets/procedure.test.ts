/**
 * 제27조 2·3항 전수 대조.
 *
 * 조합이 15개(순서 위반 3종 × 본래 순서 5종)뿐이라 **표로 기대값을 적고 전부 대조한다.**
 * 표본을 뽑을 이유가 없고, 뽑으면 빠진 칸이 곧 구멍이 된다.
 *
 * 기대값의 근거는 규정 세 문장이다:
 * 1. 순서를 어긴 폴드는 언제나 구속력 → 첫 줄 다섯 칸 전부 true
 * 2. 본래 순서가 벳·레이즈면 상황이 변경됨 → 그 두 열은 false
 * 3. 그 외에는 상황이 변하지 않음 → 구속력
 */
import { describe, it, expect } from 'vitest'
import { resolveOutOfTurn, type OutOfTurnAction, type ProperAction } from './procedure'

const OUT_OF_TURN: OutOfTurnAction[] = ['fold', 'check', 'call']
const PROPER: ProperAction[] = ['fold', 'check', 'call', 'bet', 'raise']

/**
 * 기대값 표. 행 = 순서를 어긴 액션, 열 = 본래 순서 플레이어의 행동.
 *
 *          fold   check  call   bet    raise
 *  fold     O      O      O      O      O      ← 폴드는 예외 없이 구속력 (제27조 3항)
 *  check    O      O      O      X      X      ← 벳·레이즈만 상황을 바꾼다
 *  call     O      O      O      X      X
 */
const EXPECTED: Record<OutOfTurnAction, Record<ProperAction, boolean>> = {
  fold: { fold: true, check: true, call: true, bet: true, raise: true },
  check: { fold: true, check: true, call: true, bet: false, raise: false },
  call: { fold: true, check: true, call: true, bet: false, raise: false },
}

describe('resolveOutOfTurn — 제27조 2·3항', () => {
  it('15개 조합을 전수 대조한다', () => {
    let checked = 0
    for (const oot of OUT_OF_TURN) {
      for (const proper of PROPER) {
        const r = resolveOutOfTurn(oot, proper)
        expect(r.binding, `순서위반 ${oot} · 본래순서 ${proper}`).toBe(EXPECTED[oot][proper])
        // 근거 문구가 비면 화면이 "왜"를 못 보여준다 — 그건 이 게임에서 정답이 아니다
        expect(r.reason.length, `${oot}/${proper} 근거 없음`).toBeGreaterThan(0)
        checked++
      }
    }
    // 표를 줄이거나 늘리면 여기서 걸린다
    expect(checked).toBe(15)
  })

  it('순서를 어긴 폴드는 앞사람이 레이즈해도 구속력을 가진다', () => {
    // 가장 틀리기 쉬운 칸이다. "상황이 변경되면 무효"를 먼저 적용하면 여기가 뒤집힌다.
    const r = resolveOutOfTurn('fold', 'raise')
    expect(r.binding).toBe(true)
    expect(r.reason).toContain('언제나')
  })

  it('앞사람이 콜만 했으면 순서를 어긴 콜도 유효하다', () => {
    // 콜은 마주한 벳을 바꾸지 않는다 — 금액이 오간다고 상황이 변한 것은 아니다.
    expect(resolveOutOfTurn('call', 'call').binding).toBe(true)
  })

  it('앞사람이 벳하면 순서를 어긴 체크는 무효다', () => {
    const r = resolveOutOfTurn('check', 'bet')
    expect(r.binding).toBe(false)
    expect(r.reason).toContain('변경')
  })
})
