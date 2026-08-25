/**
 * 노리밋 홀덤 룰셋.
 *
 * 이 파일이 "그 액션이 합법인가"를 판정하고, 그 판정이 곧 사용자에게 가르치는
 * 규칙이 된다. 그래서 무효 액션을 그냥 거절하지 않고 (1) 규정이 처리를 확정하는지
 * (`forced`) (2) 플로어 판단 영역인지 (`td_discretion`) 까지 구분해서 돌려준다.
 * 둘을 뭉개면 판단 영역 문제가 단일 정답으로 출제된다.
 */
import type { PlayerAction } from '../types'
import type { BettingContext, DeclaredIntent, Ruleset, ValidationResult } from './types'

function ok(normalized: PlayerAction): ValidationResult {
  return { valid: true, normalized }
}
function bad(
  reason: string,
  corrected: PlayerAction,
  ruling: 'forced' | 'td_discretion' = 'forced',
): ValidationResult {
  return { valid: false, ruling, reason, corrected }
}

export const nlh: Ruleset = {
  id: 'nlh',
  family: 'flop',
  bettingStructure: 'no-limit',
  holeCardCount: 2,
  streets: ['preflop', 'flop', 'turn', 'river'],

  /**
   * Rule 43-A. 레이즈는 "이번 라운드에 나온 가장 큰 벳 또는 레이즈 폭" 이상이어야 한다.
   * 총액이 아니라 폭이라는 점이 가장 흔한 오해다 (파일럿 케이스 4).
   * 그리고 그 폭은 어떤 경우에도 빅블라인드 아래로 내려가지 않는다.
   */
  minRaiseTo(ctx) {
    return ctx.currentBet + Math.max(ctx.lastRaiseSize, ctx.bigBlind)
  },

  maxRaiseTo(ctx) {
    return ctx.seatBet + ctx.seatStack
  },

  validateAction(ctx, action) {
    const maxTo = this.maxRaiseTo(ctx)

    switch (action.kind) {
      case 'fold':
        return ok(action)

      case 'check':
        if (ctx.currentBet > ctx.seatBet) {
          return bad('벳이 있으므로 체크할 수 없습니다', { kind: 'fold' })
        }
        return ok(action)

      case 'call': {
        if (ctx.currentBet >= maxTo) return ok({ kind: 'allin', to: maxTo })
        if (action.to < ctx.currentBet) {
          /*
           * Rule 51-B. 언더콜은 한 가지로 처리되지 않는다.
           * 오픈 벳(그 라운드의 첫 벳)에 대한 언더콜은 전액 콜로 확정되고,
           * 그 외(예: 레이즈에 대한 언더콜)는 플로어 재량이다.
           * 이 두 갈래를 구분하는 것이 파일럿 케이스 3 의 핵심이므로
           * 엔진이 둘을 같은 결과로 뭉개면 안 된다.
           */
          return ctx.isOpenBet
            ? bad(
                '오픈 벳에 대한 언더콜은 전액 콜로 처리됩니다',
                { kind: 'call', to: ctx.currentBet },
                'forced',
              )
            : bad(
                '오픈 벳이 아닌 벳에 대한 언더콜입니다 — 플로어 판단 사항입니다',
                { kind: 'call', to: ctx.currentBet },
                'td_discretion',
              )
        }
        return ok({ kind: 'call', to: ctx.currentBet })
      }

      case 'bet':
      case 'raise': {
        // ⚠️ 리오픈 규칙의 조항 번호는 미검증이다 — types.ts 의 canRaise 주석 참조.
        if (!ctx.canRaise) {
          return bad(
            '풀 레이즈에 못 미치는 올인은 베팅을 다시 열지 않습니다 — 콜 또는 폴드만 가능합니다',
            { kind: 'call', to: Math.min(ctx.currentBet, maxTo) },
          )
        }
        if (action.to > maxTo) return bad('스택을 초과합니다', { kind: 'allin', to: maxTo })
        // 정확히 스택 전액인 레이즈는 무효가 아니라 올인이다
        if (action.to === maxTo) return ok({ kind: 'allin', to: maxTo })
        const min = this.minRaiseTo(ctx)
        if (action.to < min) {
          return bad(`최소 레이즈는 ${min} 입니다`, { kind: action.kind, to: min })
        }
        return ok(action)
      }

      case 'allin':
        if (action.to !== maxTo) return bad('올인 금액이 스택과 다릅니다', { kind: 'allin', to: maxTo })
        return ok(action)
    }
  },

  /**
   * Rule 45-A. 선언이 없는 다수 칩 벳은, 그 칩이 전부 있어야 콜이 되는 경우
   * (= 칩 하나를 빼면 콜 금액에 못 미치는 경우) 콜로 처리한다.
   *
   * pushedTotal 은 "이번에 앞으로 민 칩의 합"이고, ctx.currentBet 은 "총액"이다.
   * 단위가 다르므로 반드시 seatBet 을 더해서 비교해야 한다 — 블라인드를 낸 좌석이나
   * 자기 벳 위에 얹는 좌석에서 이걸 빼먹으면 조용히 오판정한다.
   *
   * ⚠️ "칩 하나를 뺀다"의 해석: 권종이 섞였을 때 어느 칩을 빼느냐로 결론이 뒤집힌다.
   * 여기서는 "모든 칩이 콜에 필요했는가"라는 규칙의 취지에 따라 가장 작은 칩을 뺀다
   * (예: 콜 500 에 1,000+100 을 밀면 100 을 빼도 1,000 이 남아 콜에 충분하므로 레이즈).
   * 발행 전에 TDA 2024 PDF 원문 표현으로 이 해석을 확인할 것.
   */
  interpretChipPush(ctx: BettingContext, pushedTotal: number, declared: DeclaredIntent, chips?: number[]) {
    /*
     * chips 는 pushedTotal 의 내역이다. 둘이 어긋나거나 0·음수 권종이 섞이면
     * "칩 하나를 빼도 콜에 충분한가" 판정이 조용히 뒤집힌다 — [1000, 0] 은 0 을 빼도
     * 총액이 그대로라 무조건 레이즈가 되고, 합이 다르면 없는 칩으로 판정한다.
     * 조용한 오판정은 곧 틀린 규칙을 정답으로 가르치는 것이므로 급소에서 막는다.
     */
    if (chips) {
      if (chips.length === 0 || chips.some((c) => !Number.isInteger(c) || c <= 0)) {
        throw new Error(`칩 권종이 잘못됨: [${chips.join(', ')}]`)
      }
      const sum = chips.reduce((acc, c) => acc + c, 0)
      if (sum !== pushedTotal) {
        throw new Error(`칩 내역 불일치: chips 합 ${sum}, pushedTotal ${pushedTotal}`)
      }
    }

    const maxTo = this.maxRaiseTo(ctx)
    const wagerTo = Math.min(ctx.seatBet + pushedTotal, maxTo)
    const callTo = Math.min(ctx.currentBet, maxTo)

    if (declared === 'allin') return { kind: 'allin', to: maxTo }
    if (declared === 'raise') {
      // 선언한 레이즈가 최소 레이즈에 못 미치면 최소 레이즈로 올린다
      if (wagerTo >= maxTo) return { kind: 'allin', to: maxTo }
      return { kind: 'raise', to: Math.max(wagerTo, this.minRaiseTo(ctx)) }
    }

    // 콜에 못 미치는 언더콜은 여기서 판정하지 않는다 — Rule 51-B 는 오픈 벳인지에
    // 따라 갈리므로 validateAction 을 통과시켜야 한다.
    if (wagerTo <= callTo) return { kind: 'call', to: callTo }

    if (chips && chips.length > 1) {
      const smallest = Math.min(...chips)
      const withoutOne = wagerTo - smallest
      // 칩 하나를 빼도 콜 금액 이상이면 그 칩은 콜에 필요하지 않았다 -> 레이즈
      if (withoutOne >= callTo) {
        return wagerTo >= maxTo ? { kind: 'allin', to: maxTo } : { kind: 'raise', to: wagerTo }
      }
      return { kind: 'call', to: callTo }
    }

    // 칩 구성을 모르면 총액만으로 판정 — 콜에 필요한 만큼만 인정
    return { kind: 'call', to: callTo }
  },
}
