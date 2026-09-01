/**
 * 유형 2 — 베팅 기회 재개 (제35조 4항).
 *
 * 이미 레이즈했던 사람에게 액션이 돌아왔다. 다시 올릴 수 있나?
 *
 * **규정은 누적이다.** 짧은 올인 각각이 최소 레이즈에 못 미쳐도 합쳐서 넘기면 올릴 수
 * 있다. 이 유형을 만들면서 엔진의 단발 판정이 규정과 어긋나 있는 것이 드러났고,
 * 엔진을 고쳤다 — 정답은 `nlh.canReopen` 이 낸다 (`rulesets/nlh.ts`).
 */
import { nlh, type Rng } from '@/lib/simulator'
import { ARTICLES } from '../articles'
import { fmt } from '../money'
import { BLINDS } from '../money'
import { KIND_LABEL, LIMIT_SEC, type ActionQuestion } from '../types'
import { chainRows, chainSeats, makeChain } from './chainSetup'

export function makeReopen(rng: Rng): ActionQuestion | null {
  const bb = rng.pick(BLINDS)

  /*
   * 두 답이 고르게 나오도록 **상황을 반반으로 세운다.** 정답을 여기서 정하는 것이
   * 아니다 — 아래에서 판정하는 것은 `nlh.canReopen` 이고, 세운 상황이 의도와 달라지면
   * (반올림으로 폭이 넘어가는 등) 그대로 그 답이 정답이 된다.
   *
   * 짧은 올인 폭을 늘 5~40% 로 뽑으면 둘을 합쳐도 최소 레이즈를 못 넘어
   * "레이즈할 수 없다"만 출제된다(실측 99.2%). 그러면 이 유형이 가르치려는 것,
   * 즉 **제35조 4항이 누적이라는 사실**을 한 번도 보여주지 못한다.
   */
  const wantOpen = rng.next() < 0.5
  const chain = makeChain(rng, bb, {
    fullRaises: 2,
    // 합쳐서 넘기려면 최소 둘이 필요하다 (하나는 정의상 폭에 못 미친다)
    shorts: wantOpen ? 2 : 1 + rng.int(2),
    shortFraction: wantOpen ? { min: 0.55, max: 0.95 } : { min: 0.05, max: 0.4 },
  })
  if (chain === null) return null

  /*
   * hero 는 **두 번째 풀 레이즈를 한 좌석**(좌석 3)이다. 그 사람이 직면한 증가액이
   * 짧은 올인들의 합이라, 이 유형이 묻고 싶은 것이 정확히 그 지점에서 갈린다.
   * 첫 번째 레이저(좌석 2)를 고르면 직면 증가액에 두 번째 풀 레이즈까지 포함돼
   * 거의 항상 "레이즈 가능"이 되어 문제가 한쪽으로 쏠린다.
   */
  const hero = 3
  const ctx = chain.ctxFor(hero)
  const canRaise = nlh.canReopen(ctx)

  const faced = ctx.currentBet - ctx.seatBet
  const minSize = Math.max(ctx.lastRaiseSize, ctx.bigBlind)
  const heroName = chain.names[hero]

  return {
    kind: 'reopen',
    input: 'choice',
    label: KIND_LABEL.reopen,
    prompt: `${heroName} 에게 액션이 돌아왔다. 레이즈할 수 있나?`,
    limitSec: LIMIT_SEC.reopen,
    street: '프리플랍',
    bb,
    rows: chainRows(chain),
    seats: chainSeats(chain, { heroSeat: hero }),
    article: ARTICLES.reopen,
    choices: [
      { label: '레이즈할 수 있다', note: '폴드 · 콜 · 레이즈 모두 가능', correct: canRaise },
      { label: '레이즈할 수 없다', note: '폴드 · 콜만 가능', correct: !canRaise },
    ],
    why:
      `${heroName} 이(가) 액션한 시점의 벳은 ${fmt(ctx.seatBet)} 이고 지금은 ` +
      `${fmt(ctx.currentBet)} 이다. 직면한 총 증가액 ${fmt(faced)} 이 유효한 최소 레이즈 폭 ` +
      `${fmt(minSize)} 보다 ` +
      (canRaise ? '크거나 같으므로 레이즈할 수 있다.' : '작으므로 레이즈할 수 없다.'),
  }
}
