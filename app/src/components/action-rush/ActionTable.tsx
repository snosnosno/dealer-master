/**
 * 딜러 시점 테이블 — 축 2.
 *
 * 축 1 의 `RushTable` 을 쓰지 않는다. 그건 `RushQuestion` 유니온에 직접 분기하고
 * 카드·팟이 중심인데, 축 2 는 **카드가 없고** 액션 라벨·밀어낸 칩·히어로 강조가 필요하다
 * (계획서 §5). 스타일은 같은 `rush.module.css` 를 공유한다.
 *
 * **딜러 버튼은 그리지 않는다.** 좌석 배열이 SB 부터 시작해 버튼이 배열 밖(SB 직전)에
 * 있고, 이 다섯 유형의 정답은 버튼 위치와 무관하다. 자리를 지어내 표시하면 훈련생이
 * 틀린 것을 배운다. 버튼이 정답에 관여하는 유형(데드 버튼)을 만들 때 좌석 모델을
 * 확장하고 이 결정을 다시 본다 (설계 §8).
 */
import { chipBreakdown } from '@/components/table/chips'
import styles from '@/components/rush/rush.module.css'
import { ActionChips } from './ActionChips'
import type { ActionQuestion, ActionSeat } from '@/lib/action-rush/types'

/**
 * [열, 행]. 축 1 과 같은 5열 그리드다 — 위 줄 가운데 3칸부터 채우고 바깥 두 좌석을
 * 아래 줄에 두면 테이블을 둘러싼 모양이 된다. **좌석 인덱스 순서가 곧 시계방향**이다.
 */
const POSITIONS: Record<number, readonly [number, number][]> = {
  2: [
    [2, 1],
    [4, 1],
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
  6: [
    [1, 2],
    [1, 1],
    [2, 1],
    [4, 1],
    [5, 1],
    [5, 2],
  ],
  7: [
    [1, 2],
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
    [5, 1],
    [5, 2],
  ],
}

const fmt = (n: number) => n.toLocaleString('ko-KR')

export function ActionTable({ question }: { question: ActionQuestion }) {
  const positions = POSITIONS[question.seats.length] ?? POSITIONS[7]

  return (
    <div className={`${styles.root} ${styles.felt}`}>
      <div className={styles.table}>
        {question.seats.map((seat, i) => {
          const [column, row] = positions[i]
          const className = [
            styles.seat,
            row === 1 && column !== 3 ? styles.arc : '',
            seat.hero === true ? styles.hero : '',
            seat.outOfTurn === true ? styles.offturn : '',
            seat.waiting === true ? styles.waiting : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <div key={i} className={className} style={{ gridColumn: column, gridRow: row }}>
              <span className={styles.name}>
                {seat.name}
                {seat.allIn === true ? (
                  <span className={`${styles.tag} ${styles.tagAllIn}`}>올인</span>
                ) : null}
                {seat.outOfTurn === true ? (
                  <span className={`${styles.tag} ${styles.tagAllIn}`}>순서</span>
                ) : null}
              </span>

              {seat.act !== undefined ? <span className={styles.act}>{seat.act}</span> : null}

              <SeatBet seat={seat} />
            </div>
          )
        })}

        {/* 카드도 팟도 없다. 가운데에는 어느 스트리트인지만 적는다 */}
        <div className={styles.street}>{question.street}</div>

        {/* 딜러 자리 — 이 화면에서 유일한 "딜러 시점" 요소다 */}
        <div className={styles.dealerBox}>
          <span className={styles.dealerLabel}>딜러</span>
        </div>
      </div>
    </div>
  )
}

/**
 * 좌석 앞에 놓인 것.
 *
 * **금액을 숨기지 않는다** — 축 1 의 사이드팟 유형은 칩을 읽는 것이 문제 자체라 숫자를
 * 가렸지만, 축 2 가 묻는 것은 "이 액션이 무엇인가"이지 "얼마인가"가 아니다.
 * 금액을 가리면 규정 판정과 무관한 계산 부담만 늘어난다.
 */
function SeatBet({ seat }: { seat: ActionSeat }) {
  const bet = seat.bet ?? 0
  if (bet <= 0) return null

  /*
   * 밀어낸 액면 내역이 있으면 **그대로** 그린다 (제31조). 없으면 금액을 액면으로 쪼갠다 —
   * 연쇄 유형은 "얼마가 앞에 있나"만 보이면 되므로 어떤 조합이든 무방하다.
   */
  const chips = seat.chips ?? chipBreakdown(bet).chips.flatMap((p) => Array<number>(p.count).fill(p.unit))

  return (
    <span className={styles.bet}>
      <ActionChips chips={chips} />
      <span className={styles.amount}>{fmt(bet)}</span>
    </span>
  )
}
