/**
 * 카드 한 장. 앞면은 CC0 에셋(`public/cards/`), 뒷면은 CSS 로 그린다.
 *
 * 2단계의 `components/table/Card.tsx` 는 글자로 그리는 카드다 — 러시는 판독 속도가 곧
 * 점수라 실물 그림이 필요하다. 그래서 재사용하지 않고 여기 따로 둔다 (계획서 §2).
 *
 * `card` 가 없으면 뒷면이다. **뒷면일 때 랭크·무늬를 DOM 에 넣지 않는다** —
 * 개발자도구에 보이면 그게 곧 정답 유출이다.
 */
import { cardText } from '@/components/table/log'
import type { Card, Suit } from '@/lib/simulator'
import styles from './rush.module.css'

/** 파일명 규칙. 엔진 무늬는 소문자, 에셋 파일명은 대문자다 */
const SUIT_FILE: Record<Suit, string> = { s: 'S', h: 'H', d: 'D', c: 'C' }

export function RushCard({ card, size = 'board' }: { card?: Card; size?: 'hole' | 'board' }) {
  const sizeClass = size === 'hole' ? styles.hole : ''

  if (card === undefined) {
    return <span className={`${styles.card} ${styles.back} ${sizeClass}`} aria-label="뒷면 카드" />
  }

  return (
    /*
     * next/image 를 쓰지 않는다. 이 SVG 들은 이미 최적화된 정적 에셋이고,
     * next/image 로 SVG 를 지나가게 하려면 `dangerouslyAllowSVG` 를 켜야 한다 —
     * 로컬 카드 52장 때문에 원격 SVG 까지 열어주는 설정을 켤 이유가 없다.
     */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`${styles.card} ${sizeClass}`}
      src={`/cards/${card.rank}${SUIT_FILE[card.suit]}.svg`}
      alt={cardText(card)}
    />
  )
}
