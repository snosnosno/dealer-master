/**
 * 팟리밋 규칙책.
 *
 * **`nlh` 와 `maxRaiseTo` 하나만 다르다.** 팟리밋에서도 최소 레이즈·리오픈·칩 해석은
 * 노리밋과 같은 규정을 따른다. 그래서 복사하지 않고 위임한다 — 사본은 갈라진다.
 *
 * 스프레드로 이어받아도 `nlh.validateAction` 안의 `this.maxRaiseTo(ctx)` 는 호출 시점의
 * `this`(= `pl`)를 따라 **아래 구현으로 온다.** 그것이 이 위임이 실제로 작동하는 이유다.
 */
import { nlh } from './nlh'
import type { BettingContext, Ruleset } from './types'

export const pl: Ruleset = {
  ...nlh,
  id: 'pl',

  /**
   * 팟벳 = **콜 금액 + 콜한 뒤 팟에 있는 금액** (가이드).
   *
   * 콜한 뒤의 팟에는 방금 넣은 콜이 들어 있으므로 콜 금액이 두 번 더해진다.
   * 예 — 팟 60,000 에 40,000 벳: 40,000 + (60,000 + 40,000) = 140,000.
   */
  maxRaiseTo(ctx: BettingContext): number {
    const callAmt = ctx.currentBet - ctx.seatBet
    const potRaise = ctx.currentBet + ctx.pot + callAmt
    // 스택을 넘을 수는 없다. 올인이 늘 상한이다
    return Math.min(potRaise, ctx.seatBet + ctx.seatStack)
  },
}
