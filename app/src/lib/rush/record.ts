/**
 * 개인 기록. `localStorage` 하나가 전부다 — 계정은 4단계다.
 *
 * 키는 `potrush.*` 네임스페이스다 (설계 §6). 프로토타입이 이미 `potrush.best` 를 썼으므로
 * **같은 키를 그대로 쓴다** — 프로토타입에서 세운 기록이 앱에서 그대로 이어진다.
 *
 * 4단계에서 계정으로 옮길 때 이 값을 첫 로그인에 흡수한다. **그 전에 지우지 마라.**
 *
 * 모든 접근을 try/catch 로 감싼다. 사파리 프라이빗 모드나 스토리지 차단 설정에서는
 * `localStorage` 를 읽는 것만으로 던진다 — 기록 하나 때문에 게임이 멈추면 안 된다.
 */
import { useSyncExternalStore } from 'react'

const BEST_KEY = 'potrush.best'
const MUTED_KEY = 'potrush.muted'

/*
 * 저장값을 **외부 스토어**로 다룬다.
 *
 * 마운트 이펙트에서 읽어 setState 하면 렌더가 한 번 더 돌고(React 가 경고한다),
 * 서버가 그린 값과 클라이언트 첫 렌더가 어긋난다. useSyncExternalStore 는 그 둘을
 * 갈라 놓는다 — 서버는 기본값, 클라이언트는 저장값, 다른 탭의 변경까지 따라온다.
 */
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

export function readBest(): number {
  try {
    const raw = window.localStorage.getItem(BEST_KEY)
    const n = Number.parseInt(raw ?? '0', 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

/** 새 기록이면 저장하고 true 를 돌려준다. */
export function saveBest(score: number): boolean {
  if (score <= readBest()) return false
  try {
    window.localStorage.setItem(BEST_KEY, String(score))
  } catch {
    // 저장이 안 되는 환경이어도 이번 판의 점수는 화면에 그대로 남는다
  }
  emit()
  return true
}

/** 최고 기록. 서버 렌더에서는 0 이다 (localStorage 가 없다). */
export function useBest(): number {
  return useSyncExternalStore(subscribe, readBest, () => 0)
}

/**
 * 음소거. `prefers-reduced-motion` 과 **별개**다 —
 * 모션을 끄는 사람과 소리를 끄는 사람은 다른 사람이다 (설계 §7).
 */
export function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

export function saveMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTED_KEY, muted ? '1' : '0')
  } catch {
    // 무시. 이번 세션 동안은 메모리 상태로 동작한다
  }
  emit()
}

/** 음소거 상태. 서버 렌더에서는 소리 켜짐이다. */
export function useMuted(): boolean {
  return useSyncExternalStore(subscribe, readMuted, () => false)
}
