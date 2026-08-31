/**
 * 딜러 시점 테이블.
 *
 * 2단계 `PokerTable` 을 쓰지 않는다 — 그건 `HandState` 를 받아 타원 절대좌표로 그리는
 * 재생·관전용이고, 러시 문제는 핸드가 아니다 (계획서 §2).
 *
 * 좌석은 5열 그리드에 앉힌다. **좌석 인덱스 순서가 곧 시계방향**이고,
 * 홀칩 문제가 그 배치 위에서만 성립한다.
 */
import { ChipPile } from './ChipPile'
import { RushCard } from './RushCard'
import type { RushQuestion } from '@/lib/rush/types'
import styles from './rush.module.css'

/** [열, 행]. 바깥 두 좌석을 아래 줄에 두면 테이블을 둘러싼 모양이 된다. */
const POSITIONS: Record<number, readonly [number, number][]> = {
  2: [
    [1, 2],
    [5, 2],
  ],
  3: [
    [1, 2],
    [3, 1],
    [5, 2],
  ],
  4: [
    [1, 2],
    [2, 1],
    [4, 1],
    [5, 2],
  ],
  5: [
    [1, 2],
    [2, 1],
    [3, 1],
    [4, 1],
    [5, 2],
  ],
}

const fmt = (n: number) => n.toLocaleString('ko-KR')

export function RushTable({
  question,
  selectable,
  multiSelect,
  marks,
  answered,
  correctSeats,
  onPick,
}: {
  question: RushQuestion
  /** 좌석을 누를 수 있나 (좌석으로 답하는 유형이고 아직 채점 전) */
  selectable: boolean
  /** 여러 좌석을 골랐다 뺐다 하는 유형인가 (스플릿) */
  multiSelect: boolean
  /** 사용자가 고른 좌석 */
  marks: readonly number[]
  /** 채점이 끝났나 — 금액 공개와 정답 표시가 여기 달렸다 */
  answered: boolean
  correctSeats: readonly number[]
  onPick: (seat: number) => void
}) {
  const positions = POSITIONS[question.seats.length] ?? POSITIONS[5]

  return (
    <div className={`${styles.root} ${styles.felt}`}>
      <div className={styles.table}>
        {question.seats.map((seat, i) => {
          const [column, row] = positions[i]
          const picked = marks.includes(i)
          const isCorrect = correctSeats.includes(i)

          const state = answered
            ? isCorrect
              ? styles.right
              : picked
                ? styles.wrong
                : ''
            : picked
              ? styles.picked
              : ''

          const className = [
            styles.seat,
            row === 1 && column !== 3 ? styles.arc : '',
            seat.folded === true ? styles.out : '',
            state,
          ]
            .filter(Boolean)
            .join(' ')

          const body = (
            <>
              <span className={styles.name}>
                {seat.name}
                {seat.allIn === true ? (
                  <span className={`${styles.tag} ${styles.tagAllIn}`}>올인</span>
                ) : null}
                {seat.tie === true ? (
                  <span className={`${styles.tag} ${styles.tagTie}`}>동점</span>
                ) : null}
                {seat.folded === true ? (
                  <span className={`${styles.tag} ${styles.tagOut}`}>폴드</span>
                ) : null}
                {/* 딜러 버튼은 모든 유형에 나온다 — 홀칩 문제에만 나오면 유형이 새어나간다 */}
                {question.buttonSeat === i ? <span className={styles.dealerButton}>D</span> : null}
              </span>

              {seat.hole !== undefined ? (
                <span className={styles.hand}>
                  {seat.hole.map((card, k) => (
                    <RushCard key={k} card={card} size="hole" />
                  ))}
                </span>
              ) : question.kind === 'sidepots' ? (
                // 아직 베팅 라운드다 — 살아있는 좌석은 카드를 덮고 있다
                <span className={styles.hand}>
                  <RushCard size="hole" />
                  <RushCard size="hole" />
                </span>
              ) : null}

              <SeatBet question={question} seat={i} answered={answered} />
            </>
          )

          const style = { gridColumn: column, gridRow: row }

          return selectable ? (
            <button
              key={i}
              type="button"
              /*
               * 복수 선택일 때만 토글이다. 단일 선택은 누르는 즉시 채점되는 "행동"이라
               * aria-pressed 를 붙이면 눌린 채로 남아 있는 것처럼 읽힌다.
               */
              aria-pressed={multiSelect ? picked : undefined}
              className={className}
              style={style}
              onClick={() => onPick(i)}
            >
              {body}
            </button>
          ) : (
            <div key={i} className={className} style={style}>
              {body}
            </div>
          )
        })}

        <div className={styles.center}>
          {question.board.length > 0 ? (
            <div className={styles.board}>
              {question.board.map((card, i) => (
                <RushCard key={i} card={card} />
              ))}
            </div>
          ) : null}

          {/*
            * 이미 가운데로 수거된 팟만 그린다.
            * 사이드팟 문제는 아직 각자 앞에 있어야 맞다 — 여기서 합치면 문제가 사라진다.
            */}
          {question.pot !== undefined ? (
            <div className={styles.pot}>
              <span className={styles.potLabel}>
                {question.kind === 'oddchip' ? '메인팟' : '팟'}
              </span>
              <span className={styles.potAmount}>{fmt(question.pot)}</span>
              <ChipPile amount={question.pot} />
            </div>
          ) : null}
        </div>

        {/* 딜러 자리 — 이 화면에서 유일한 "딜러 시점" 요소다 */}
        <div className={styles.dealerBox}>
          <span className={styles.deck}>
            <span className={styles.cutCard} />
            <RushCard />
          </span>
          <span className={styles.dealerLabel}>딜러</span>
        </div>
      </div>
    </div>
  )
}

/** 좌석 앞에 놓인 것. 유형마다 보여주는 것이 다르다. */
function SeatBet({
  question,
  seat,
  answered,
}: {
  question: RushQuestion
  seat: number
  answered: boolean
}) {
  const s = question.seats[seat]

  if (question.kind === 'sidepots') {
    return (
      <span className={styles.bet}>
        <ChipPile amount={s.bet ?? 0} />
        {/* 채점 전에는 숫자를 감춘다 — 보이면 칩을 읽을 이유가 없어진다 */}
        <span className={styles.amount}>{answered ? fmt(s.bet ?? 0) : '?'}</span>
      </span>
    )
  }

  if (question.kind === 'payout') {
    return (
      <span className={styles.bet}>
        <span className={styles.amount}>{fmt(s.bet ?? 0)}</span>
      </span>
    )
  }

  if (question.kind === 'oddchip') {
    // 몫은 생성기가 엔진 계산으로 넣어 준 값이다. 여기서 나눗셈을 하면 홀칩 규칙이 두 곳에 생긴다
    return (
      <span className={styles.bet}>
        <span className={styles.amount}>{s.tie === true ? fmt(question.share ?? 0) : '—'}</span>
      </span>
    )
  }

  return null
}
