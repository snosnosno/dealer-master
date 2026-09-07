/**
 * 완성된 핸드에서 "딜러가 판단해야 하는 순간"을 뽑아 문제로 만든다.
 *
 * 사용자가 실제로 보는 문제가 여기서 나오고 채점(Task 9)이 이 출력을 그대로 쓴다.
 * 그래서 여기의 정답은 규칙에서 유도해야지 구현의 부산물이면 안 된다 —
 * 틀린 정답은 딜러 훈련생에게 틀린 규칙을 가르친다.
 *
 * 플로어 재량 영역(`td_discretion`: 벳 앞에서의 체크, 오픈 벳이 아닌 언더콜)은
 * 여기서 출제하지 않는다. 그래서 이 파일은 nlh.validateAction 을 호출하지 않고,
 * 규정이 금액을 확정하는 minRaiseTo 만 쓴다.
 */
import { buildPots, awardPots } from './pots'
import { initialState, stateAt } from './reduce'
import { createRng, type Rng } from './rng'
import { nlh } from './rulesets/nlh'
import type { DecisionKind, Hand } from './generate'
import { ANY_FIVE_EVALUATOR, CATEGORY_LABEL, evaluateHand } from './evaluate'

export type DecisionInput =
  | { type: 'choice'; choices: string[]; correctIndex: number }
  | { type: 'number'; fields: { label: string; answer: number }[] }
  /** 팟이 갈릴 수 있으므로 정답은 항상 좌석 "집합"이다. 단일 좌석은 원소 하나인 집합이다. */
  | { type: 'seat'; options: { seat: number; label: string }[]; correctSeats: number[] }

export type DecisionPoint = {
  atEventIndex: number
  kind: DecisionKind
  prompt: string
  sub: string
  input: DecisionInput
  ruleRef: string
  explanation: string
  timeLimitSec: number
}

export const TIME_LIMITS: Record<DecisionKind, number> = {
  procedure: 10,
  action_validity: 20,
  calculation: 45,
  showdown: 30,
}

const fmt = (v: number) => v.toLocaleString('ko-KR')

/**
 * 선택지를 시드 기반으로 섞고 정답 인덱스를 따라 옮긴다.
 * 정답이 항상 0번이면 유저는 규칙 대신 위치를 학습한다
 * (`05_pilot_cases_v1.md` 발행 전 체크리스트의 마지막 항목).
 */
function shuffleChoices(rng: Rng, choices: string[], correctIndex: number) {
  const order = choices.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  return {
    choices: order.map((i) => choices[i]),
    correctIndex: order.indexOf(correctIndex),
  }
}

export function extractDecisions(hand: Hand): DecisionPoint[] {
  const dps: DecisionPoint[] = []
  const n = hand.seats.length
  const sbSeat = (hand.buttonSeat + 1) % n
  const bbSeat = (hand.buttonSeat + 2) % n
  const utgSeat = (hand.buttonSeat + 3) % n
  const initState = initialState(hand.seats, hand.buttonSeat)

  // ── 1. 딜링 절차: 첫 홀카드를 받는 좌석
  const firstDealIdx = hand.events.findIndex((e) => e.type === 'deal_hole')
  if (firstDealIdx >= 0) {
    /*
     * 오답 후보는 좌석으로 걸러야 한다. 좌석이 적으면 역할이 겹치기 때문이다 —
     * 3인 테이블은 (버튼+3)%3 = 버튼이라 "언더더건" 과 "버튼" 이 같은 사람을 가리킨다.
     * `generate.ts` 의 MIN_SEATS 가 3 이므로 이건 지원되는 입력이고, 같은 좌석을
     * 두 번 내놓는 문제는 성립하지 않는다. 최소 레이즈 문제가 금액으로 겹침을 거르듯
     * 여기서는 좌석으로 거른다 — 정답 좌석을 미리 넣어 두면 오답이 정답과 같아질 수도 없다.
     */
    const seenSeats = new Set<number>([sbSeat])
    const distractors: string[] = []
    for (const opt of [
      { seat: bbSeat, label: `빅블라인드 — ${hand.seats[bbSeat].name}` },
      { seat: utgSeat, label: `언더더건 — ${hand.seats[utgSeat].name} (빅블라인드 다음)` },
      { seat: hand.buttonSeat, label: `버튼 — ${hand.seats[hand.buttonSeat].name}` },
    ]) {
      if (seenSeats.has(opt.seat)) continue
      seenSeats.add(opt.seat)
      distractors.push(opt.label)
    }

    // 서로 다른 오답을 두 개 못 만들면 이 핸드에서는 출제하지 않는다
    if (distractors.length >= 2) {
      const choices = [
        `스몰블라인드 — ${hand.seats[sbSeat].name} (버튼 왼쪽 첫 좌석)`,
        ...distractors,
      ]
      dps.push({
        atEventIndex: firstDealIdx,
        kind: 'procedure',
        prompt: '블라인드가 포스팅됐습니다. 첫 홀카드를 받는 좌석은?',
        // 선택지에 이미 각 좌석이 누구인지 적혀 있으므로 sub 에서 반복하지 않는다.
        // 정답을 sub 에 그대로 써두면 문제가 성립하지 않는다.
        sub: `버튼은 ${hand.seats[hand.buttonSeat].name}(${hand.buttonSeat + 1}번)입니다.`,
        input: { type: 'choice', ...shuffleChoices(createRng(`${hand.seed}:dp-deal`), choices, 0) },
        /*
         * 조항 번호를 뺀 상태다. 레포의 파일럿 문서가 Rule 34 를 버튼에 배정하기 때문이다 —
         * `05_pilot_cases_v1.md:100` 은 "Rule 34-A (Button Placement and Movement)",
         * `11_pilot_cases_v2.md:32` 는 헤즈업 버튼·액션 순서에 34-B 를 쓴다.
         * 딜링 순서의 근거로 34 를 붙이면 레포가 가진 근거와 정면으로 어긋나므로 숫자를 뺐다.
         * TDA 2024 PDF 로 확인한 뒤에만 번호를 되살릴 것.
         */
        ruleRef: 'TDA · 딜링 순서',
        explanation:
          '홀카드는 항상 버튼 왼쪽 첫 좌석, 즉 스몰블라인드부터 시계방향으로 한 장씩 두 바퀴 돌립니다. 액션 순서(프리플랍은 UTG부터)와 딜링 순서를 혼동하는 것이 신입 딜러의 가장 흔한 실수입니다.',
        timeLimitSec: TIME_LIMITS.procedure,
      })
    }
  }

  /*
   * ── 2. 액션 유효성: 첫 벳/레이즈 직후의 최소 레이즈 총액
   *
   * 레이즈 "폭"은 벳 총액이 아니라 (이번 벳 총액 − 직전 최고 벳) 이다.
   * 프리플랍 첫 레이즈는 빅블라인드를 상대로 하므로 600 으로 올렸다면 폭은 400 이고
   * 최소 리레이즈는 1,200 이 아니라 1,000 이다.
   * 벳 총액을 그대로 폭으로 쓰면 파일럿 케이스 4 가 경고하는 바로 그 오해를
   * 엔진이 정답으로 가르치게 된다.
   */
  const raiseIdx = hand.events.findIndex(
    (e) => e.type === 'player_action' && (e.action.kind === 'raise' || e.action.kind === 'bet'),
  )
  if (raiseIdx >= 0) {
    const e = hand.events[raiseIdx]
    if (e.type === 'player_action' && 'to' in e.action) {
      const to = e.action.to
      const before = stateAt(initState, hand.events, raiseIdx)
      const prevBet = Math.max(...before.seats.map((s) => s.bet))
      const raiseSize = to - prevBet

      const answer = nlh.minRaiseTo({
        currentBet: to,
        lastRaiseSize: raiseSize,
        bigBlind: hand.blinds.bb,
        /*
         * 아래 세 필드는 특정 좌석이 아니라 "규정이 정하는 최소 총액"을 묻기 위한
         * 중립값이다. 문제 문구(:192)가 다음 행동할 사람을 지목하지 않는 이유가 이것이다 —
         * 지목하면 답이 그 사람의 스택에 매이는데(짧은 스택은 최소 레이즈를 못 하고
         * 올인만 가능하다) 여기 계산은 스택을 일부러 보지 않는다. 문구를 좌석에
         * 매는 순간 이 중립값들이 조작된 컨텍스트가 된다.
         */
        seatBet: 0,
        seatStack: Number.MAX_SAFE_INTEGER,
        isOpenBet: false,
        hasActedThisRound: false,
      })
      /*
       * 화면에 쓰는 "폭"은 raiseSize 가 아니라 정답에서 되짚은 값이다.
       * minRaiseTo 는 폭을 빅블라인드 아래로 내려가지 않게 잡으므로,
       * raiseSize 를 그대로 쓰면 설명의 덧셈이 정답과 어긋날 수 있다.
       */
      const step = answer - to

      // 오답 후보. 정답과 겹치거나 서로 겹치는 것은 버린다 —
      // 같은 숫자가 두 번 나오면 문제가 성립하지 않는다.
      const candidates = [
        { to: to + hand.blinds.bb, why: '빅블라인드만큼만 추가' },
        { to: to * 2, why: '직전 벳 총액을 두 배로' },
        { to: to + prevBet, why: '직전 최고 벳만큼 추가' },
        { to: to + Math.floor(raiseSize / 2), why: '레이즈 폭의 절반만 추가' },
      ]
      const seen = new Set<number>([answer])
      const wrong: { to: number; why: string }[] = []
      for (const c of candidates) {
        if (c.to <= to || seen.has(c.to)) continue
        seen.add(c.to)
        wrong.push(c)
        if (wrong.length === 2) break
      }

      // 서로 다른 오답을 두 개 못 만들면 이 핸드에서는 출제하지 않는다
      if (wrong.length === 2) {
        /*
         * 선택지는 **금액만** 쓴다. 방법 설명을 붙이면 정답만 규칙의 어휘를 그대로 말하게
         * 되고("직전 레이즈 폭 200만큼 추가"), 규칙을 아는 학습자가 총액을 계산하지 않고
         * 문구만 보고 집을 수 있다 — 이 문제가 묻는 것이 총액인데 총액을 구하지 않아도
         * 맞는다. 오답 후보의 `why` 는 여기서 쓰지 않지만 남겨 둔다: 어떤 착각을 재현한
         * 금액인지가 후보 설계의 근거고, 그것이 사라지면 다음 사람이 임의의 숫자를 넣는다.
         */
        const choices = [answer, ...wrong.map((c) => c.to)].map(fmt)
        dps.push({
          atEventIndex: raiseIdx + 1,
          kind: 'action_validity',
          prompt: `${hand.seats[e.seat].name}이 ${fmt(to)}으로 ${e.action.kind === 'bet' ? '벳' : '레이즈'}했습니다. 다음 레이즈의 최소 총액은?`,
          sub: prevBet > 0
            ? `직전 최고 벳은 ${fmt(prevBet)}이었습니다.`
            : '이번 라운드의 첫 벳입니다.',
          input: { type: 'choice', ...shuffleChoices(createRng(`${hand.seed}:dp-raise`), choices, 0) },
          ruleRef: 'TDA Rule 43-A · Raise Amounts',
          explanation:
            `레이즈는 이번 라운드에 나온 가장 큰 레이즈 "폭" 이상이어야 하고, 그 폭은 빅블라인드 아래로 내려가지 않습니다. 여기서 그 폭은 ${fmt(step)}이므로 최소 총액은 ${fmt(to)} + ${fmt(step)} = ${fmt(answer)}입니다. 벳 총액을 그대로 폭으로 착각하는 것이 가장 흔한 실수입니다.`,
          timeLimitSec: TIME_LIMITS.action_validity,
        })
      }
    }
  }

  /*
   * ── 3. 금액 계산: 사이드팟이 생기는 경우만
   *
   * pots.length >= 2 가 "올인으로 자격이 갈렸다"와 같은 뜻이 되려면
   * buildPots 가 자격자 집합이 같은 층을 병합하고, 미콜 벳이 팟에 섞이지 않아야 한다.
   * 둘 중 하나라도 빠지면 올인이 하나도 없는 핸드에 "서로 다른 금액의 올인이
   * 나왔습니다" 라는 문제가 출제된다 (수정 전 측정: 296/300).
   */
  const finalState = stateAt(initState, hand.events, hand.events.length)
  const pots = buildPots(
    finalState.contributed,
    finalState.seats.map((s) => s.folded),
  )

  if (pots.length >= 2) {
    const lastCollect = hand.events.map((e, i) => (e.type === 'collect_bets' ? i : -1))
      .filter((i) => i >= 0)
      .pop()
    dps.push({
      atEventIndex: (lastCollect ?? hand.events.length - 1) + 1,
      kind: 'calculation',
      prompt: '서로 다른 금액의 올인이 나왔습니다. 팟을 나누세요.',
      sub: '폴드한 플레이어가 낸 금액도 팟에 남아 있습니다. 블라인드를 낸 사람이 그대로 올인했다면 그 블라인드는 이미 그의 투입액에 포함돼 있습니다.',
      input: {
        type: 'number',
        fields: pots.map((p, i) => ({
          label: i === 0 ? '메인팟' : `사이드팟 ${i}`,
          answer: p.amount,
        })),
      },
      ruleRef: 'TDA Rule 21 · Side Pots',
      explanation:
        '메인팟은 가장 적은 올인 금액을 기준으로 참가자 수만큼 모은 금액에 데드머니를 더한 값입니다. 사이드팟은 그 금액을 넘는 부분만 모으고, 짧은 올인 플레이어는 참가할 수 없습니다.',
      timeLimitSec: TIME_LIMITS.calculation,
    })
  }

  // ── 4. 승자 판정
  const mainPot = pots[0]
  if (mainPot && mainPot.eligibleSeats.length >= 2 && finalState.board.length === 5) {
    const hole = finalState.seats.map((s) => s.hole)
    const awards = awardPots(pots, hole, finalState.board, hand.buttonSeat, ANY_FIVE_EVALUATOR)
    // 팟은 갈릴 수 있다. 승자를 한 명으로 접으면 공동 승자를 지목한 유저가
    // 오답 처리된다 — 보드 플레이나 킥커 카운터피트로 실제로 나오는 상황이다.
    const winners = awards
      .filter((a) => a.potIndex === 0)
      .map((a) => a.seat)
      .sort((a, b) => a - b)

    if (winners.length > 0) {
      const named = winners.map((s) => finalState.seats[s].name).join(', ')
      const category = CATEGORY_LABEL[
        evaluateHand([...hole[winners[0]], ...finalState.board]).category
      ]
      const split = winners.length > 1

      dps.push({
        atEventIndex: hand.events.length,
        kind: 'showdown',
        prompt: split
          ? `메인팟 ${fmt(mainPot.amount)}은 누구에게 갑니까? (해당하는 좌석을 모두 고르세요)`
          : `메인팟 ${fmt(mainPot.amount)}은 누구에게 갑니까?`,
        sub: `보드 ${finalState.board.map((c) => c.rank + c.suit).join(' ')}`,
        input: {
          type: 'seat',
          options: mainPot.eligibleSeats.map((seat) => ({
            seat,
            label: `${finalState.seats[seat].name} — ${finalState.seats[seat].hole.map((c) => c.rank + c.suit).join(' ')}`,
          })),
          correctSeats: winners,
        },
        /*
         * 이 문제는 팟이 하나든 여럿이든 "메인팟을 누가 이기는가"를 묻는다 —
         * 근거는 핸드 랭킹이지 사이드팟 지급 순서(Rule 21)가 아니다. 게이트가
         * `pots.length >= 2` 가 아니라 `eligibleSeats.length >= 2` 라 사이드팟이
         * 없는 핸드에도 붙고(측정: 쇼다운 문제 955건 중 555건, 58.1%), 그때
         * 21 을 인용하면 훈련생이 조항을 찾아가도 승자 판정 근거가 없다.
         *
         * 처음에는 번호 자체를 뺐다 — 확인한 번호만 쓴다는 방침이었고 당시 원문이
         * 없었다. 2026-08-29 에 TDA 2024 규정집 원문으로 대조해 `12: Declarations.
         * Cards Speak at Showdown` — "Cards speak to determine the winner" 가 승자
         * 판정 조항임을 확인했다. 근거가 핸드 랭킹이라는 판단은 그대로이고, 12 번이
         * 바로 그 족보 판정 조항이라 오히려 정확히 맞는다.
         *
         * 딜링 순서 문제(:115)는 여전히 번호가 없다. 그쪽은 대조 결과 **해당 번호
         * 조항이 TDA 2024 에 존재하지 않기 때문**이지 미확인이어서가 아니다.
         */
        ruleRef: 'TDA Rule 12 · Cards Speak at Showdown',
        explanation: split
          ? `${named}이 ${category}로 동일해 메인팟을 나눠 갖습니다. 나눠떨어지지 않는 홀칩은 버튼 왼쪽 첫 자격자에게 갑니다.`
          : pots.length >= 2
            ? `${named}이 ${category}로 메인팟을 가져갑니다. 사이드팟은 참가 자격이 다르므로 승자가 다를 수 있습니다 — 숏스택이 메인팟을 이기고 사이드팟은 다른 사람이 가져가는 구조가 현장에서 가장 자주 잘못 지급됩니다.`
            : `${named}이 ${category}로 팟을 가져갑니다.`,
        timeLimitSec: TIME_LIMITS.showdown,
      })
    }
  }

  return dps.sort((a, b) => a.atEventIndex - b.atEventIndex)
}
