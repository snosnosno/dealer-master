/**
 * 진행절차의 상태 기계. **순수하고 불변이다.**
 *
 * 프로토타입은 전역 가변 `H` · `G` · `P` · `PHASE` 를 함수들이 직접 뮤테이트했다.
 * 그러면 "지금 화면이 왜 이런가"를 되짚을 수 없고, 테스트가 서로의 상태를 밟는다.
 * 여기서는 리듀서 하나가 새 상태를 돌려준다.
 *
 * **칩은 라운드가 끝나야 수거한다.** 블라인드와 벳이 좌석 앞에 남아 있다가
 * 라운드 끝에 팟으로 간다. 앤티만 예외지만 PLO8 에는 앤티가 없다.
 */
import type { SeatState, TableView } from '@/lib/simulator'
import type { GameSpec } from '@/lib/games'
import { dealHand, SEAT_COUNT } from './deal'
import { judge } from './judge'
import { stepsFor } from './steps'
import type { BettingAction, Phase, ProcedureAction, ProcedureState, Step } from './types'

export function startProcedure(spec: GameSpec, seed: string): ProcedureState {
  const script = dealHand(spec, seed)
  const seats: SeatState[] = script.seats.map((s) => ({
    name: s.name,
    stack: s.stack,
    bet: 0,
    folded: false,
    allIn: false,
    hole: [],
    revealed: false,
  }))
  return {
    spec,
    script,
    steps: stepsFor(spec),
    at: 0,
    phase: 'palette',
    stuck: 0,
    hint: null,
    table: { seats, buttonSeat: script.buttonSeat, board: [], pot: 0 },
    burnCount: 0,
    log: [`연습 시작 — ${spec.labels.ko}`],
  }
}

export function reduce(state: ProcedureState, action: ProcedureAction): ProcedureState {
  if (state.phase === 'done') return state

  // 애니메이션이 끝나기를 기다리는 동안에는 입력을 받지 않는다.
  // 여기서 막지 않으면 카드가 나는 도중에 다음 스텝을 눌러 화면과 상태가 어긋난다.
  if (state.phase === 'anim') {
    if (action.type !== 'animEnd') return state
    const swept = sweepBets(state)
    if (swept !== null) return swept
    return { ...state, phase: phaseFor(state.steps[state.at]) }
  }

  const verdict = judge(state, action)
  if (!verdict.ok) {
    return {
      ...state,
      stuck: state.stuck + 1,
      hint: verdict.hint,
      log: [...state.log, `순서 아님 — ${verdict.hint}`],
    }
  }

  const step = state.steps[state.at]
  const applied = applyStep(state, step)
  const at = state.at + 1

  // 카드와 칩이 움직이는 스텝만 애니메이션을 기다린다. 첫 순서 지목은 즉시 넘어간다
  const animates = step.act === 'deal' || step.act === 'draw' || step.act === 'betting' ||
    step.act === 'blinds' || step.act === 'ante'

  return {
    ...state,
    at,
    phase: animates ? 'anim' : phaseFor(state.steps[at]),
    hint: null,
    table: applied.table,
    burnCount: applied.burnCount,
    log: [...state.log, ...applied.log],
  }
}

function phaseFor(step: Step | undefined): Phase {
  if (step === undefined) return 'done'
  return step.act === 'open' ? 'openSeat' : 'palette'
}

const num = (v: number) => v.toLocaleString('ko-KR')

const ACT_LABEL: Record<BettingAction['act'], string> = {
  fold: '폴드',
  check: '체크',
  call: '콜',
  bet: '벳',
  raise: '레이즈',
}

/**
 * 액션 한 줄 — `3번 레이즈 → 12,000`.
 *
 * 문구는 `components/table/log.ts` 의 `describeForLearner` 를 따르되 **좌석 번호를
 * 덧붙이지 않는다.** 이 드릴의 좌석 이름이 이미 `1번`…`6번` 이라서(`deal.ts` 의
 * `NAMES`) 그쪽 규약대로 쓰면 `6번(6번) 콜` 이 된다 — 브라우저에서 잡혔다.
 * 좌석에 사람 이름이 붙는 날이 오면 그때 번호를 되살려야 한다.
 */
function actionLine(name: string, a: BettingAction): string {
  return a.act === 'fold' || a.act === 'check'
    ? `${name} ${ACT_LABEL[a.act]}`
    : `${name} ${ACT_LABEL[a.act]} → ${num(a.to)}`
}

/**
 * 좌석 앞의 칩을 팟으로 끌어온다. **베팅 스텝보다 한 박자 늦게 온다** —
 * 칩이 화면에 뜬 다음이라야 학습자가 누가 얼마 냈는지 본다.
 *
 * 걷을 것이 없으면 `null` 을 돌려주고 평소대로 다음 단계로 넘어간다. 베팅이 아닌
 * 스텝(딜·번·블라인드)과 전원이 체크한 라운드가 그리로 간다 — 블라인드는 여기서
 * 걷히지 않고 프리플랍 베팅이 끝날 때 그 위에 얹혀서 함께 수거된다.
 */
function sweepBets(state: ProcedureState): ProcedureState | null {
  if (state.steps[state.at - 1]?.act !== 'betting') return null
  const collected = state.table.seats.reduce((sum, seat) => sum + seat.bet, 0)
  if (collected === 0) return null
  const pot = state.table.pot + collected
  return {
    ...state,
    // 수거도 한 박자 보여준다 — 칩이 가운데로 모이는 것이 딜러가 하는 일이다
    phase: 'anim',
    table: {
      ...state.table,
      seats: state.table.seats.map((seat) => ({ ...seat, bet: 0 })),
      pot,
    },
    log: [...state.log, `수거 ${num(collected)} → 팟 ${num(pot)}`],
  }
}

/** 스텝 하나가 테이블에 무엇을 하는가. 새 `TableView` 를 돌려준다. */
function applyStep(
  state: ProcedureState,
  step: Step,
): { table: TableView; burnCount: number; log: string[] } {
  const { table, script, spec } = state
  const street = step.streetIndex >= 0 ? spec.streets[step.streetIndex] : null

  switch (step.act) {
    case 'blinds': {
      const sb = (script.buttonSeat + 1) % SEAT_COUNT
      const bb = (script.buttonSeat + 2) % SEAT_COUNT
      const seats = table.seats.map((seat, i) =>
        i === sb
          ? { ...seat, bet: script.blinds.sb, stack: seat.stack - script.blinds.sb }
          : i === bb
            ? { ...seat, bet: script.blinds.bb, stack: seat.stack - script.blinds.bb }
            : seat,
      )
      return {
        table: { ...table, seats },
        burnCount: state.burnCount,
        log: [`블라인드 — SB ${script.blinds.sb.toLocaleString('ko-KR')} · BB ${script.blinds.bb.toLocaleString('ko-KR')}`],
      }
    }

    case 'ante': {
      // PLO8 에는 앤티가 없다. 앤티 종목이 붙을 때 채운다 — 짐작으로 구현하지 않는다
      throw new Error('앤티 수거는 아직 구현하지 않았다 — 스터드를 붙일 때 채운다')
    }

    case 'burn':
      return {
        table,
        burnCount: state.burnCount + 1,
        log: [`번카드 — ${street?.labels.ko} 전`],
      }

    case 'deal': {
      if (street === null) throw new Error('deal 스텝에 스트릿이 없다')
      const perSeat = street.deal.down + street.deal.up
      const seats = table.seats.map((seat, i) =>
        perSeat > 0 ? { ...seat, hole: script.seats[i].hole.slice(0, seat.hole.length + perSeat) } : seat,
      )
      const board = [...table.board, ...script.board[street.id]]
      return {
        table: { ...table, seats, board },
        burnCount: state.burnCount,
        log: [`${street.labels.ko} 딜`],
      }
    }

    case 'draw':
      throw new Error('카드 교체는 아직 구현하지 않았다 — 드로우게임을 붙일 때 채운다')

    case 'betting': {
      if (street === null) throw new Error('betting 스텝에 스트릿이 없다')
      let seats = table.seats
      const log = [`${street.labels.ko} 베팅`]
      for (const a of script.betting[street.id]) {
        seats = seats.map((seat, i) => {
          if (i !== a.seat) return seat
          if (a.act === 'fold') return { ...seat, folded: true }
          if (a.act === 'check') return seat
          // `to` 는 이 라운드 누적액이라 이미 낸 만큼을 뺀 차액만 스택에서 나간다
          const delta = Math.max(0, a.to - seat.bet)
          return { ...seat, bet: seat.bet + delta, stack: seat.stack - delta }
        })
        log.push(actionLine(seats[a.seat].name, a))
      }
      /*
       * **여기서 수거하지 않는다.** 칩은 좌석 앞에 놓인 채로 한 박자 서고 `animEnd`
       * 가 팟으로 끌어온다(`sweepBets`). 같은 전이에서 걷으면 벳칩이 렌더된 적 없이
       * 사라진다 — 재미 게이트에서 「베팅할 때 칩이 안 보인다」로 잡힌 결함이다
       * (사용자 확인 2026-09-07).
       */
      return { table: { ...table, seats }, burnCount: state.burnCount, log }
    }

    case 'open': {
      // 지목이 맞았다는 것만 남긴다. 이 드릴은 벳 크기를 묻지 않는다(팟리밋 드릴의 몫)
      return { table, burnCount: state.burnCount, log: ['첫 순서 지목'] }
    }

    case 'payout':
      // 승자를 묻지 않는다 — 보드보기·팟 분배 드릴의 몫이다
      return {
        table: { ...table, seats: table.seats.map((s) => ({ ...s, revealed: !s.folded })) },
        burnCount: state.burnCount,
        log: [`팟 지급 — ${table.pot.toLocaleString('ko-KR')}`],
      }
  }
}
