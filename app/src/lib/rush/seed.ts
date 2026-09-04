/**
 * 판 하나를 가리키는 시드.
 *
 * 축마다 `generate.ts` 에 같은 함수가 있었다. 형식이 갈라지면 링크로 공유한 판을
 * 다른 축에서 열 수 없고, 버그 재현도 축마다 다른 규칙을 외워야 한다.
 * `components/simulator/hand.ts` 의 것과 **같은 형식**이다.
 *
 * React 도 `window` 도 쓰지 않는다 — 문제 생성기(테스트에서 그대로 도는 순수 모듈)와
 * 화면 양쪽에서 부르기 때문이다.
 */

/** **문제 생성에는 이 값이 시드로만 들어간다** — 생성기 안에서는 `Math.random()` 을 쓰지 않는다. */
export function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36)
}
