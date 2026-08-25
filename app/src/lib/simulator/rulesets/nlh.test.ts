import { describe, it, expect } from 'vitest'
import { nlh } from './nlh'
import type { BettingContext } from './types'

const ctx = (over: Partial<BettingContext> = {}): BettingContext => ({
  currentBet: 0, lastRaiseSize: 0, bigBlind: 200, seatBet: 0, seatStack: 100000,
  isOpenBet: false, canRaise: true, ...over,
})

describe('minRaiseTo — 파일럿 케이스 4', () => {
  it('레이즈 총액이 아니라 레이즈 폭을 기준으로 계산한다', () => {
    // 블라인드 100/200. A 600 오픈 -> B 1600 -> C 3600. D 의 최소 레이즈는?
    // 마지막 레이즈 폭은 3600 - 1600 = 2000. 따라서 3600 + 2000 = 5600.
    const c = ctx({ currentBet: 3600, lastRaiseSize: 2000 })
    expect(nlh.minRaiseTo(c)).toBe(5600)
  })

  it('첫 벳이 없으면 최소 벳은 빅블라인드 크기다', () => {
    // 레이즈가 아직 없으므로 lastRaiseSize 는 0 이다. 하한은 bigBlind 가 준다.
    const c = ctx({ currentBet: 0, lastRaiseSize: 0, bigBlind: 200 })
    expect(nlh.minRaiseTo(c)).toBe(200)
  })

  it('직전 레이즈 폭이 빅블라인드보다 작아도 하한은 빅블라인드다', () => {
    // 풀 레이즈에 못 미치는 올인이 있었다 해도 최소 레이즈 폭이 그만큼 줄지는 않는다
    const c = ctx({ currentBet: 500, lastRaiseSize: 100, bigBlind: 200 })
    expect(nlh.minRaiseTo(c)).toBe(700)
  })

  it('프리플랍은 빅블라인드가 오픈 벳이다', () => {
    // 블라인드 100/200 에서 첫 레이즈의 최소 총액은 400 이다
    const c = ctx({ currentBet: 200, lastRaiseSize: 200, bigBlind: 200 })
    expect(nlh.minRaiseTo(c)).toBe(400)
  })
})

describe('maxRaiseTo — 노리밋', () => {
  it('자기 스택 전액까지 올릴 수 있다', () => {
    const c = ctx({ currentBet: 1000, seatBet: 0, seatStack: 12500 })
    expect(nlh.maxRaiseTo(c)).toBe(12500)
  })
})

describe('interpretChipPush — 파일럿 케이스 2 (Rule 45-A)', () => {
  it('선언 없이 1,000짜리 2개를 밀었고 콜이 1,050이면 콜이다', () => {
    // 케이스 2 그대로: 그 2,000 이 B 의 마지막 칩 전부다.
    // 칩 하나(1,000)를 빼면 1,000 이라 콜 1,050 에 못 미친다 -> 콜.
    // 마지막 칩이었다는 사실은 무관하므로 올인으로 해석해서도 안 된다.
    const c = ctx({ currentBet: 1050, seatBet: 0, seatStack: 2000 })
    const a = nlh.interpretChipPush(c, 2000, 'none', [1000, 1000])
    expect(a).toEqual({ kind: 'call', to: 1050 })
  })

  it('이미 앞에 낸 벳이 있으면 그것까지 합쳐서 판정한다', () => {
    // 빅블라인드 200 을 낸 좌석이 콜 600 을 앞에 두고 500짜리 하나를 민다.
    // 총 벳은 200 + 500 = 700 이지 500 이 아니다.
    const c = ctx({ currentBet: 600, seatBet: 200, seatStack: 12500 })
    const a = nlh.interpretChipPush(c, 500, 'none', [500])
    expect(a).toEqual({ kind: 'call', to: 600 })
  })

  it('권종이 섞이면 콜에 필요 없는 칩이 있는지로 갈린다', () => {
    // 콜 500 에 1,000 + 100 을 밀었다. 100 을 빼도 1,000 이 남아 콜에 충분하므로
    // 모든 칩이 콜에 필요했던 것이 아니다 -> 레이즈.
    const c = ctx({ currentBet: 500, lastRaiseSize: 500, seatBet: 0, seatStack: 12500 })
    const a = nlh.interpretChipPush(c, 1100, 'none', [1000, 100])
    expect(a).toEqual({ kind: 'raise', to: 1100 })
  })

  it('칩 구성을 모르면 총액만으로 콜 처리한다', () => {
    const c = ctx({ currentBet: 1050, seatBet: 0, seatStack: 12500 })
    expect(nlh.interpretChipPush(c, 2000, 'none')).toEqual({ kind: 'call', to: 1050 })
  })

  it('레이즈를 선언했으면 밀어낸 금액대로 레이즈다', () => {
    const c = ctx({ currentBet: 1050, lastRaiseSize: 1050, seatBet: 0, seatStack: 12500 })
    const a = nlh.interpretChipPush(c, 2200, 'raise')
    expect(a).toEqual({ kind: 'raise', to: 2200 })
  })

  it('칩 하나를 빼도 콜 금액을 넘으면 레이즈다', () => {
    // 콜 500, 1000짜리 2개(2000) 를 밀었다. 하나만 빼도 1000 > 500 이므로 레이즈.
    const c = ctx({ currentBet: 500, lastRaiseSize: 500, seatBet: 0, seatStack: 12500 })
    const a = nlh.interpretChipPush(c, 2000, 'none', [1000, 1000])
    expect(a.kind).toBe('raise')
  })

  it('칩 내역의 합이 밀어낸 총액과 다르면 던진다', () => {
    // 어긋난 내역을 그대로 쓰면 "칩 하나를 빼면 콜에 못 미치는가" 판정이
    // 조용히 뒤집힌다. 여기서는 콜(1050)로 나와야 할 것이 레이즈가 된다.
    const c = ctx({ currentBet: 1050, seatBet: 0, seatStack: 12500 })
    expect(() => nlh.interpretChipPush(c, 2000, 'none', [1000, 1000, 1000])).toThrow(/칩 내역 불일치/)
  })

  it('0 이나 음수 권종이 섞이면 던진다', () => {
    // [1000, 0] 은 0 을 빼도 총액이 그대로라 무조건 레이즈로 판정된다.
    const c = ctx({ currentBet: 1000, seatBet: 0, seatStack: 12500 })
    expect(() => nlh.interpretChipPush(c, 1000, 'none', [1000, 0])).toThrow(/칩 권종이 잘못됨/)
  })
})

describe('validateAction — 파일럿 케이스 3 (Rule 51-B 언더콜)', () => {
  it('오픈 벳에 대한 언더콜은 전액 콜로 강제된다', () => {
    const c = ctx({ currentBet: 8000, seatBet: 0, seatStack: 50000, isOpenBet: true })
    const r = nlh.validateAction(c, { kind: 'call', to: 2000 })
    expect(r.valid).toBe(false)
    if (!r.valid) {
      expect(r.ruling).toBe('forced')
      expect(r.corrected).toEqual({ kind: 'call', to: 8000 })
    }
  })

  it('오픈 벳이 아닌 벳에 대한 언더콜은 플로어 재량이다', () => {
    // 케이스 3 의 핵심은 "오픈 벳이냐 아니냐"로 처리가 갈린다는 것이다.
    // 둘을 같은 결과로 뭉개면 엔진이 그 구분을 못 가르친다.
    const c = ctx({ currentBet: 8000, seatBet: 0, seatStack: 50000, isOpenBet: false })
    const r = nlh.validateAction(c, { kind: 'call', to: 2000 })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.ruling).toBe('td_discretion')
  })

  it('정상 콜은 통과한다', () => {
    const c = ctx({ currentBet: 8000, seatBet: 0, seatStack: 50000, isOpenBet: true })
    const r = nlh.validateAction(c, { kind: 'call', to: 8000 })
    expect(r.valid).toBe(true)
  })

  it('최소 레이즈 미달은 최소 레이즈로 교정된다', () => {
    const c = ctx({ currentBet: 1000, lastRaiseSize: 1000, seatBet: 0, seatStack: 50000 })
    const r = nlh.validateAction(c, { kind: 'raise', to: 1500 })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.corrected).toEqual({ kind: 'raise', to: 2000 })
  })

  it('스택보다 큰 레이즈는 올인으로 바뀐다', () => {
    const c = ctx({ currentBet: 1000, lastRaiseSize: 1000, seatBet: 0, seatStack: 5000 })
    const r = nlh.validateAction(c, { kind: 'raise', to: 9999 })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.corrected).toEqual({ kind: 'allin', to: 5000 })
  })

  it('스택이 콜 금액에 못 미치면 올인 콜이 허용된다', () => {
    const c = ctx({ currentBet: 8000, seatBet: 0, seatStack: 3000 })
    const r = nlh.validateAction(c, { kind: 'allin', to: 3000 })
    expect(r.valid).toBe(true)
  })

  it('벳이 있는데 체크하면 무효다', () => {
    const c = ctx({ currentBet: 500, seatBet: 0 })
    const r = nlh.validateAction(c, { kind: 'check' })
    expect(r.valid).toBe(false)
  })

  it('벳이 없으면 체크할 수 있다', () => {
    const r = nlh.validateAction(ctx(), { kind: 'check' })
    expect(r.valid).toBe(true)
  })

  it('레이즈 총액이 정확히 스택 전액이면 올인으로 인정된다', () => {
    const c = ctx({ currentBet: 1000, lastRaiseSize: 1000, seatBet: 0, seatStack: 5000 })
    const r = nlh.validateAction(c, { kind: 'raise', to: 5000 })
    expect(r.valid).toBe(true)
    if (r.valid) expect(r.normalized).toEqual({ kind: 'allin', to: 5000 })
  })

  it('베팅이 리오픈되지 않았으면 레이즈할 수 없다', () => {
    // 앞에서 풀 레이즈에 못 미치는 올인만 있었던 경우.
    // 이미 액션한 좌석은 차액을 콜하거나 폴드할 수 있을 뿐 다시 올릴 수 없다.
    const c = ctx({ currentBet: 1100, lastRaiseSize: 1000, seatBet: 1000, seatStack: 50000, canRaise: false })
    const r = nlh.validateAction(c, { kind: 'raise', to: 3000 })
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.corrected).toEqual({ kind: 'call', to: 1100 })
  })
})
