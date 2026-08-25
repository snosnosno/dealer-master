/**
 * 시드 기반 난수 생성기.
 *
 * 이 파일이 시뮬레이터에서 난수를 만드는 유일한 곳이다.
 * Math.random() 을 어디서든 한 번 쓰면 같은 시드가 다른 핸드를 만들게 되고,
 * 그 버그는 재현이 안 돼서 잡기가 매우 어렵다.
 */
export type Rng = {
  next(): number
  int(maxExclusive: number): number
  pick<T>(arr: readonly T[]): T
}

/** 문자열 시드를 32비트 정수로 흩뿌린다 (xmur3). */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

export function createRng(seed: string): Rng {
  let state = hashSeed(seed)

  // mulberry32 — 짧고 통계적 품질이 이 용도에 충분하다
  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int(maxExclusive: number): number {
      if (maxExclusive <= 0) throw new Error(`int() 범위가 잘못됨: ${maxExclusive}`)
      return Math.floor(next() * maxExclusive)
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('pick() 에 빈 배열이 들어옴')
      return arr[Math.floor(next() * arr.length)]
    },
  }
}
