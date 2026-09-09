/**
 * 금액 입력칸의 문자열 정리. 팟리밋 계산과 팟 분배가 같이 쓴다.
 *
 * **보이는 것과 채점되는 값을 같게** 만드는 것이 전부다. 걸러 내기만 하고 원문을
 * 그대로 두면 「1,0a0」이 칸에 남은 채 100 으로 채점된다 — 트레이니는 자기가 왜
 * 틀렸는지 알 수 없다. 앞의 0 도 여기서 지운다(`007` → `7`).
 */

/**
 * 아홉 자리까지만 받는다. 답은 블라인드에서 나온 팟에 매인 값이라 이보다 클 일이 없고,
 * 붙여넣기로 들어온 긴 숫자는 `Number` 가 안전 정수를 넘겨 엉뚱한 값이 된다.
 */
export const AMOUNT_MAX_DIGITS = 9

export function digitsOnly(raw: string): string {
  return raw
    .replace(/[^0-9]/g, '')
    .slice(0, AMOUNT_MAX_DIGITS)
    .replace(/^0+(?=[0-9])/, '')
}

/** 입력칸 문자열을 채점에 쓸 숫자로. 비었으면 0 이라 `제출`이 잠긴다 */
export function parseAmount(text: string): number {
  return text === '' ? 0 : Number(text)
}
