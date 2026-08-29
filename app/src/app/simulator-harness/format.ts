/**
 * 하네스 전용 순수 포매터.
 *
 * 엔진 출력을 화면 문자열로 옮기기만 한다 — 규칙 판단도, 재계산도 하지 않는다.
 * 여기서 무언가를 "계산"하기 시작하면 하네스가 엔진과 다른 답을 내고, 그러면
 * 무엇을 대조하고 있는지 알 수 없게 된다.
 */
import { cardToString, type Card, type HandEvent } from '@/lib/simulator'

const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }

const num = (v: number) => v.toLocaleString('ko-KR')

/** `cardToString` 의 수트 문자를 눈에 띄는 기호로 바꾼 것. 랭크는 그대로 둔다. */
export function cardText(card: Card): string {
  const raw = cardToString(card)
  const suit = raw.slice(-1)
  return raw.slice(0, -1) + (SUIT_SYMBOL[suit] ?? suit)
}

const BLIND_LABEL: Record<'sb' | 'bb' | 'ante', string> = {
  sb: '스몰블라인드',
  bb: '빅블라인드',
  ante: '앤티',
}

const ACTION_LABEL = {
  fold: '폴드',
  check: '체크',
  call: '콜',
  bet: '벳',
  raise: '레이즈',
  allin: '올인',
} as const

/** 이벤트 하나를 사람이 읽는 한 줄로. 이벤트 종류가 늘면 TS 가 여기서 걸린다. */
export function describeEvent(e: HandEvent): string {
  switch (e.type) {
    case 'move_button':
      return `버튼을 #${e.toSeat} 좌석으로 옮긴다`
    case 'post_blind':
      return `#${e.seat} ${BLIND_LABEL[e.kind]} ${num(e.amount)}`
    case 'deal_hole':
      return `#${e.seat} 에게 홀카드 ${cardText(e.card)}`
    case 'burn':
      return '카드 한 장 번'
    case 'deal_board':
      return `${e.street} 보드 ${e.cards.map(cardText).join(' ')}`
    case 'player_action': {
      const label = ACTION_LABEL[e.action.kind]
      return e.action.kind === 'fold' || e.action.kind === 'check'
        ? `#${e.seat} ${label}`
        : `#${e.seat} ${label} → ${num(e.action.to)}`
    }
    case 'return_uncalled':
      return `#${e.seat} 에게 미콜 벳 ${num(e.amount)} 반환`
    case 'collect_bets':
      return '벳을 팟으로 끌어온다'
    case 'showdown_reveal':
      return `#${e.seat} 핸드 공개`
    case 'award_pot':
      return `팟 ${e.potIndex} → #${e.seat} 에게 ${num(e.amount)}`
  }
}

/**
 * 이벤트 열의 지문. 같은 시드가 같은 핸드를 냈는지 눈으로 대조하는 용도다.
 *
 * 암호학적 해시가 아니다 — 사람이 두 값을 눈으로 비교하는 것이 목적이라
 * 짧아야 하고, 여기서 필요한 성질은 "한 필드만 달라도 갈린다" 하나뿐이다.
 * `JSON.stringify` 를 쓰므로 필드 순서가 곧 지문의 일부이고, 엔진이 이벤트를
 * 리터럴로 만드는 한 순서는 고정이다.
 */
export function hashEvents(events: readonly HandEvent[]): string {
  const text = JSON.stringify(events)
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 12)
}

/**
 * 좌석별 포지션 라벨. 3인 테이블은 버튼이 곧 UTG 라 세 라벨이 세 좌석을 다 덮는다.
 * 그 겹침은 결함이 아니라 3인 테이블의 사실이다.
 */
export function seatLabels(seatCount: number, buttonSeat: number): string[] {
  const labels = Array.from({ length: seatCount }, () => '')
  labels[buttonSeat % seatCount] = 'BTN'
  labels[(buttonSeat + 1) % seatCount] = 'SB'
  labels[(buttonSeat + 2) % seatCount] = 'BB'
  return labels
}
