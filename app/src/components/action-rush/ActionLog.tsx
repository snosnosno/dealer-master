/**
 * 액션 로그.
 *
 * 최소 레이즈·재개 유형은 **이걸 읽어야 풀린다** — 레이즈 폭이 어디서 갱신됐는지가
 * 여기에만 있다. 그래서 테이블보다 위에 둔다.
 *
 * 짧은 올인은 색으로 구분한다. "폭을 갱신하지 않는 올인"이 문제의 핵심인데
 * 다른 줄과 똑같이 보이면 훈련생이 그 줄을 그냥 레이즈로 읽는다.
 */
import styles from '@/components/rush/rush.module.css'
import type { LogRow } from '@/lib/action-rush/types'

const fmt = (n: number) => n.toLocaleString('ko-KR')

export function ActionLog({ rows }: { rows: readonly LogRow[] }) {
  if (rows.length === 0) return null

  return (
    <div className={styles.log} role="list" aria-label="액션 로그">
      {rows.map((row, i) => (
        <div
          key={i}
          role="listitem"
          className={[
            styles.logRow,
            row.allIn === true ? styles.logAllIn : '',
            row.outOfTurn === true ? styles.logOffturn : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span className={styles.logWho}>{row.who}</span>
          <span className={styles.logAct}>{row.act}</span>
          {/* 금액 없는 액션(체크·폴드)은 칸을 비운다 — 0 을 적으면 0 을 벳한 것처럼 읽힌다 */}
          <span className={styles.logAmount}>{row.amount === undefined ? '' : fmt(row.amount)}</span>
        </div>
      ))}
    </div>
  )
}
