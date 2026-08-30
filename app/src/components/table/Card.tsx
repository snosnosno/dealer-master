/**
 * 카드 한 장. 뒤집기는 CSS rotateY 이고 라이브러리를 쓰지 않는다.
 * `faceUp` 이 false 면 랭크·수트를 DOM 에 아예 넣지 않는다 — 뒷면 카드의 값이
 * 개발자도구에 보이면 그게 곧 정답 유출이다.
 */
import { cardText } from './log'
import type { Card as EngineCard } from '@/lib/simulator'

const SIZE = {
  sm: 'h-9 w-6 text-[10px]',
  md: 'h-12 w-8 text-sm',
} as const

export function Card({
  card,
  faceUp,
  size = 'md',
}: {
  card?: EngineCard
  faceUp: boolean
  size?: keyof typeof SIZE
}) {
  const showFace = faceUp && card !== undefined
  const red = showFace && (card.suit === 'h' || card.suit === 'd')

  return (
    <div
      className={`sim-flip flex items-center justify-center rounded font-bold ${SIZE[size]} ${
        showFace
          ? `border border-zinc-300 bg-white ${red ? 'text-dm-red' : 'text-zinc-900'}`
          : 'border border-white/30 bg-gradient-to-br from-dm-teal-600 to-dm-teal-900'
      }`}
      aria-label={showFace ? cardText(card) : '뒷면 카드'}
    >
      {showFace ? cardText(card) : null}
    </div>
  )
}
