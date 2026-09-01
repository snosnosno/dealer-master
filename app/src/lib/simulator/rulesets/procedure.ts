/**
 * 진행 절차 규칙 — 종목과 베팅 구조에 무관한 것들.
 *
 * `Ruleset` 인터페이스에 얹지 않는 이유가 있다. `minRaiseTo` · `interpretChipPush` 는
 * 노리밋·팟리밋·픽스리밋에서 답이 달라지므로 "규칙책"마다 있어야 하지만, 액션 순서는
 * 홀덤이든 스터드든 드로우든 같다. 인터페이스에 얹으면 룰셋이 하나 붙을 때마다 동일
 * 구현이 복제되고, 복제된 규칙은 반드시 갈라진다.
 */

/**
 * 순서를 어겨서 나올 수 있는 액션.
 * 벳·레이즈는 여기 없다 — 순서를 어긴 공격적 액션은 애초에 칩이 앞에 나가야 성립하고,
 * 그 처리는 다른 조항(제29조 계열)이 다룬다. 이 함수는 제27조가 다루는 범위만 판정한다.
 */
export type OutOfTurnAction = 'fold' | 'check' | 'call'

/** 본래 순서였던 플레이어가 실제로 한 행동. */
export type ProperAction = 'fold' | 'check' | 'call' | 'bet' | 'raise'

export type OutOfTurnRuling = {
  /** 순서를 어긴 액션이 그대로 유효한가 */
  binding: boolean
  /** 왜 그런지 — 화면에 그대로 보여준다 */
  reason: string
}

const LABEL: Record<ProperAction | OutOfTurnAction, string> = {
  fold: '폴드',
  check: '체크',
  call: '콜',
  bet: '벳',
  raise: '레이즈',
}

/**
 * 제27조 2·3항 (액션의 순서).
 *
 * > 순서를 어긴 액션은, 본래 순서 플레이어의 행동으로 베팅 상황이 변하지 않았다면
 * > 구속력을 가진다. 본래 순서의 플레이어가 벳 또는 레이즈를 하여 액션이 변경되면,
 * > 순서를 어긴 플레이어는 자신의 벳을 회수하고 모든 옵션을 새로 가질 수 있다.
 * > **단, 순서를 어긴 폴드는 언제나 구속력을 가진다.**
 *
 * 비유: 줄을 서지 않고 먼저 주문한 손님이다. 앞사람이 같은 메뉴를 시켰으면 그 주문은
 * 그대로 나가고, 앞사람이 메뉴판을 바꿔버렸으면 다시 고를 기회를 준다. 다만 "안 먹겠다"고
 * 이미 나가버린 사람은 되돌릴 수 없다.
 *
 * 판정 순서가 규정의 순서와 같아야 한다 — 폴드 예외를 뒤에 두면 "앞사람이 레이즈했으니
 * 순서 어긴 폴드도 무효"라는 틀린 결론이 나온다.
 */
export function resolveOutOfTurn(
  outOfTurn: OutOfTurnAction,
  proper: ProperAction,
): OutOfTurnRuling {
  // 1항: 폴드는 예외 없이 구속력을 가진다. 본래 순서 플레이어가 무엇을 했든 무관하다.
  if (outOfTurn === 'fold') {
    return {
      binding: true,
      reason: '순서를 어긴 폴드는 언제나 구속력을 가집니다 — 본래 순서 플레이어의 행동과 무관합니다',
    }
  }

  // 2항: 벳·레이즈만이 "마주한 베팅 상황"을 바꾼다. 폴드·체크·콜은 바꾸지 않는다.
  const changed = proper === 'bet' || proper === 'raise'
  if (changed) {
    return {
      binding: false,
      reason:
        `본래 순서 플레이어가 ${LABEL[proper]}하여 마주한 베팅 상황이 변경되었습니다 — ` +
        `순서를 어긴 ${LABEL[outOfTurn]}은(는) 무효이고, 벳을 회수한 뒤 모든 옵션을 새로 가집니다`,
    }
  }

  return {
    binding: true,
    reason:
      `본래 순서 플레이어의 ${LABEL[proper]}은(는) 마주한 베팅 상황을 변경하지 않습니다 — ` +
      `순서를 어긴 ${LABEL[outOfTurn]}은(는) 그대로 유효합니다`,
  }
}
