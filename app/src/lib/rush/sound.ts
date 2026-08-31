/**
 * 음향. **외부 에셋을 쓰지 않는다** — 네 소리를 WebAudio 로 합성한다 (계획서 §4).
 *
 * 비유: 녹음 파일을 트는 대신, 작은 신디사이저를 하나 두고 그때그때 소리를 만든다.
 * 카드 슬라이드와 칩은 결국 짧은 잡음 덩어리라 합성이 잘 먹고, 전송량이 0이며,
 * 로딩이 없으니 로딩 실패도 없다.
 *
 * 지키는 것 (설계 §7):
 * - **첫 사용자 입력 전에는 소리를 내지 않는다.** AudioContext 를 그때 처음 만든다 —
 *   브라우저 자동재생 정책에 막히는 방식이 조용해서 디버깅이 비싸다
 * - 음소거는 `localStorage` 에 남고 `prefers-reduced-motion` 과 별개다
 * - **소리가 실패해도 게임은 돌아간다.** 여기서 던지는 예외는 전부 삼킨다
 */
import { readMuted } from './record'

type Ctx = AudioContext & { state: AudioContextState }

let ctx: Ctx | null = null
/** WebAudio 자체가 없는 환경(구형 브라우저·차단)에서 매번 재시도하지 않게 한다 */
let unavailable = false

/**
 * 첫 사용자 제스처에서 부른다. 이 호출 전에는 소리를 만들지 않는다.
 * 여러 번 불러도 안전하다.
 */
export function unlockSound(): void {
  if (ctx !== null || unavailable) return
  try {
    const Ctor = window.AudioContext
    if (Ctor === undefined) {
      unavailable = true
      return
    }
    ctx = new Ctor() as Ctx
  } catch {
    unavailable = true
  }
}

function ready(): Ctx | null {
  // 음소거 상태는 저장소가 정본이다. 화면 상태를 여기로 복제하면 둘이 어긋난다
  if (ctx === null || readMuted()) return null
  // 탭이 백그라운드에 다녀오면 suspended 로 남는다. 조용히 깨우고, 실패해도 그냥 넘어간다
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  return ctx
}

/** 짧은 화이트 노이즈 버퍼. 카드·칩 소리의 재료다. */
function noise(ctx: Ctx, seconds: number): AudioBuffer {
  const frames = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

function burst(
  ctx: Ctx,
  opts: { at: number; seconds: number; gain: number; from: number; to: number; q: number },
): void {
  const source = ctx.createBufferSource()
  source.buffer = noise(ctx, opts.seconds)

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = opts.q
  filter.frequency.setValueAtTime(opts.from, opts.at)
  filter.frequency.exponentialRampToValueAtTime(opts.to, opts.at + opts.seconds)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(opts.gain, opts.at)
  gain.gain.exponentialRampToValueAtTime(0.0001, opts.at + opts.seconds)

  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start(opts.at)
  source.stop(opts.at + opts.seconds)
}

function tone(
  ctx: Ctx,
  opts: { at: number; seconds: number; freq: number; gain: number; type?: OscillatorType },
): void {
  const osc = ctx.createOscillator()
  osc.type = opts.type ?? 'sine'
  osc.frequency.value = opts.freq

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, opts.at)
  gain.gain.exponentialRampToValueAtTime(opts.gain, opts.at + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, opts.at + opts.seconds)

  osc.connect(gain).connect(ctx.destination)
  osc.start(opts.at)
  osc.stop(opts.at + opts.seconds)
}

/** 소리 하나를 낸다. 어떤 이유로든 실패하면 조용히 넘어간다. */
function play(make: (ctx: Ctx, now: number) => void): void {
  const c = ready()
  if (c === null) return
  try {
    make(c, c.currentTime)
  } catch {
    // 소리 하나 때문에 게임을 멈추지 않는다
  }
}

/** 카드가 펠트를 미끄러지는 소리 — 문제가 열릴 때 */
export function playDeal(): void {
  play((c, now) => {
    for (let i = 0; i < 2; i++) {
      burst(c, { at: now + i * 0.07, seconds: 0.06, gain: 0.12, from: 1800, to: 700, q: 0.8 })
    }
  })
}

/** 칩이 부딪히는 소리 — 칩 더미가 그려질 때 */
export function playChips(): void {
  play((c, now) => {
    for (let i = 0; i < 3; i++) {
      burst(c, {
        at: now + i * 0.035,
        seconds: 0.025,
        gain: 0.1,
        from: 5200,
        to: 3200,
        q: 6,
      })
    }
  })
}

/** 남은 5초부터의 틱 */
export function playTick(): void {
  play((c, now) => tone(c, { at: now, seconds: 0.03, freq: 1200, gain: 0.06 }))
}

/** 정답 — 상행 2음 */
export function playGood(): void {
  play((c, now) => {
    tone(c, { at: now, seconds: 0.1, freq: 660, gain: 0.12, type: 'triangle' })
    tone(c, { at: now + 0.09, seconds: 0.16, freq: 990, gain: 0.12, type: 'triangle' })
  })
}

/** 오답 — 하행 단2도 */
export function playBad(): void {
  play((c, now) => {
    tone(c, { at: now, seconds: 0.12, freq: 320, gain: 0.12, type: 'sawtooth' })
    tone(c, { at: now + 0.1, seconds: 0.2, freq: 300, gain: 0.1, type: 'sawtooth' })
  })
}
