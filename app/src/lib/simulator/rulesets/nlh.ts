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

/**
 * 리오픈이 닫혔을 때의 거절 사유.
 * bet·raise 경로와 allin 경로가 같은 규칙을 집행하므로 문구를 공유한다 —
 * 따로 두면 한쪽만 고쳐져 "레이즈로는 거절, 올인으로는 통과"가 되돌아온다.
 */
const REOPEN_CLOSED =
  '풀 레이즈에 못 미치는 올인은 베팅을 다시 열지 않습니다 — 콜 또는 폴드만 가능합니다'

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
          /*
           * 벳을 마주한 체크는 "무효 액션"이지 폴드 선언이 아니다. 실제 룸에서 그
           * 체크는 구속력이 없고 그 좌석이 다시 액션한다 — 그래서 forced 가 아니라
           * 플로어 판단 영역이다 (컨트롤러 판정 R19). forced 로 내면 Task 8 이
           * "체크 = 폴드"를 단일 정답으로 출제한다.
           *
           * ⚠️ corrected 의 fold 에는 조항 번호 근거가 없다 — 어느 처리로 갈지는
           * 플로어가 정하므로 이 값은 기본값일 뿐 정답이 아니다
           * (types.ts 의 ValidationResult 주석 참조). TDA 2024 PDF 원문으로 확인할 것.
           */
          return bad('벳이 있으므로 체크할 수 없습니다', { kind: 'fold' }, 'td_discretion')
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
          return bad(REOPEN_CLOSED, { kind: 'call', to: Math.min(ctx.currentBet, maxTo) })
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
        /*
         * 올인은 리오픈 제약의 예외가 아니다. 마주한 벳보다 많이 내는 올인은
         * 이름만 다른 레이즈이므로, 리오픈이 닫혀 있으면 "레이즈"와 똑같이 거절된다 —
         * 아니면 한 단어로 canRaise 를 우회할 수 있고 엔진이
         * "리오픈 안 돼도 올인은 된다"를 정답으로 가르친다.
         *
         * 반대로 maxTo <= currentBet 인 올인은 레이즈가 아니라 그냥 콜이다(스택이
         * 콜 금액에 못 미친다). 이건 리오픈과 무관하게 언제나 합법이다.
         *
         * 이 검사가 금액 검사보다 먼저인 이유: 리오픈이 닫혔는데 금액까지 틀린 경우
         * 금액 검사가 먼저면 corrected 로 { allin, to: maxTo } 를 내놓는데
         * 그 교정값 자체가 다시 무효다. 리오픈을 먼저 보면 항상 합법인 콜로 교정된다.
         */
        if (!ctx.canRaise && maxTo > ctx.currentBet) {
          return bad(REOPEN_CLOSED, { kind: 'call', to: ctx.currentBet })
        }
        if (action.to !== maxTo) return bad('올인 금액이 스택과 다릅니다', { kind: 'allin', to: maxTo })
        return ok(action)
    }
  },

  /**
   * Rule 45-A. 선언이 없는 다수 칩 벳은, 그 칩이 전부 있어야 콜이 되는 경우
   * (= 칩 하나를 빼면 콜 금액에 못 미치는 경우) 콜로 처리한다.
   *
   * 이 판정은 "마주한 벳이 있을 때"의 이야기다. 벳이 없으면(플랍 이후 첫 액션)
   * 말없이 민 칩은 오프닝 벳이고 밀어낸 금액 전부가 벳이 된다 — 이쪽이 규정의
   * 나머지 절반이고, 실무에서 더 자주 나오는 무선언 액션이다.
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
    if (!Number.isInteger(pushedTotal) || pushedTotal <= 0) {
      throw new Error(`밀어낸 금액이 잘못됨: ${pushedTotal}`)
    }
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

    /*
     * 마주한 벳이 없으면(플랍 이후 첫 액션) 말없이 민 칩은 오프닝 벳이고,
     * 밀어낸 금액 전부가 벳이 된다. "칩 하나를 빼면 콜에 못 미치는가"는 콜할 금액이
     * 있을 때의 판정이라 여기에는 적용될 자리가 없다 — 아래 콜/레이즈 분기로 흘려보내면
     * 밀어낸 칩이 "0원짜리 콜"로 증발하거나 올릴 벳도 없이 '레이즈'로 라벨링된다.
     *
     * 최소 벳(빅블라인드) 미달 여부는 여기서 보지 않는다. 해석(어떤 액션인가)과
     * 유효성(그 액션이 합법인가)의 분업이므로 validateAction 이 교정한다.
     */
    if (callTo === 0) {
      return wagerTo >= maxTo ? { kind: 'allin', to: maxTo } : { kind: 'bet', to: wagerTo }
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
