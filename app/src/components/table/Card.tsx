/**
 * 카드 한 장. 뒤집기는 CSS rotateY 이고 라이브러리를 쓰지 않는다.
 * `faceUp` 이 false 면 랭크·수트를 DOM 에 아예 넣지 않는다 — 뒷면 카드의 값이
 * 개발자도구에 보이면 그게 곧 정답 유출이다.
 */
import { cardText } from './log'
import type { Card as EngineCard } from '@/lib/simulator'

/**
 * `xs` 는 **좌석의 홀카드 전용**이다. 오마하가 4장을 주는데 `sm`(24px) 넉 장은
 * 줄이 102px 이라 좌석 상자(디자인 96px · 360px 화면에서 87.5px)를 넘어 바깥
 * 카드가 펠트 밖 흰 배경으로 나갔다 — 실측이다. 20px 넉 장이면 줄이 86px 이라
 * 두 폭 모두에서 상자 안에 들어온다. 보드·번 더미는 장수가 고정이라 `sm` 그대로다.
 */
const SIZE = {
  xs: 'h-7 w-5 text-[9px]',
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
