/**
 * 유형 1 — 최소 레이즈 총액 (제35조 2항).
 *
 * 다음 사람이 할 수 있는 최소 레이즈는 얼마인가. **총액이지 폭이 아니다** —
 * 이게 가장 흔한 오해이고, 짧은 올인이 섞이면 오해가 오답으로 바뀐다.
 *
 * 정답은 `nlh.minRaiseTo` 가 낸다. 시험 6·7번 회귀 테스트가 이 함수로 24,800 ·
 * 35,500 을 맞혔으므로, 이 유형의 정답은 실제 TD 시험과 같은 근거 위에 있다.
 */
import { nlh, type Rng } from '@/lib/simulator'
import { ARTICLES } from '../articles'
import { seatName } from '../chain'
import { fmt } from '../money'
import { BLINDS } from '../money'
import { KIND_LABEL, LIMIT_SEC, type ActionQuestion } from '../types'
import { chainRows, chainSeats, makeChain } from './chainSetup'

export function makeMinRaise(rng: Rng): ActionQuestion | null {
  const bb = rng.pick(BLINDS)
  const chain = makeChain(rng, bb)
  if (chain === null) return null

  // 아직 앉지 않은 다음 좌석. 스택 제약 없이 "규정이 정하는 최소 총액"을 묻는다.
  const nextSeat = chain.rows.length + 2
  const nextName = seatName(nextSeat)
  const ctx = chain.ctxFor(nextSeat)
  const answer = nlh.minRaiseTo(ctx)

  // 화면에 쓰는 폭은 정답에서 되짚는다. minRaiseTo 가 폭을 빅블라인드 아래로
  // 내려가지 않게 잡으므로, lastRaiseSize 를 그대로 쓰면 설명의 덧셈이 어긋난다.
  const step = answer - chain.currentBet

  const shortNote =
    chain.shortAllIns > 0
      ? `뒤따른 올인 ${chain.shortAllIns}건은 폭에 미치지 못해 폭을 갱신하지 않는다 — ` +
        `콜 금액만 ${fmt(chain.currentBet)} 으로 올렸다. `
      : ''

  return {
    kind: 'minraise',
    input: 'number',
    label: KIND_LABEL.minraise,
    /*
     * 좌석 이름에 조사를 붙이지 않는다. MP·BTN·UTG+1 은 읽는 소리로 받침이 갈려서
     * ("엠피가" · "비티엔이") 규칙으로 맞히려면 발음 사전이 필요하다. 문장을 바꿔서 피한다.
     */
    prompt: `${nextName} 차례다. 할 수 있는 최소 레이즈 총액은?`,
    limitSec: LIMIT_SEC.minraise,
    street: '프리플랍',
    bb,
    rows: chainRows(chain),
    seats: chainSeats(chain, { heroSeat: nextSeat, waitingName: nextName }),
    article: ARTICLES.minRaise,
    answer,
    why:
      `직전 풀 레이즈 폭이 ${fmt(step)} 이다. ` +
      shortNote +
      `따라서 ${fmt(chain.currentBet)} + ${fmt(step)} = ${fmt(answer)}.`,
  }
}
