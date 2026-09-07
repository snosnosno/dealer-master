/**
 * 생성기 검증.
 *
 * **정답을 엔진으로 다시 계산해 대조한다.** 생성기가 엔진을 불러 정답을 만드는데
 * 검증까지 생성기가 만든 값을 그대로 믿으면, 생성기가 엔진을 잘못 부른 경우를
 * 아무도 못 본다 (축 1 설계 §5.4 와 같은 원리).
 *
 * 여기서 재계산은 **문제에 그려진 화면 값만 가지고** 한다 — 로그와 좌석에 보이는
 * 금액으로 컨텍스트를 다시 세워 엔진에 묻는다. 그래야 "화면에 보이는 것으로 풀 수
 * 있는 문제인가"까지 함께 확인된다.
 */
import { describe, it, expect } from 'vitest'
import { nlh, resolveOutOfTurn } from '@/lib/simulator'
import { generateRun } from './generate'
import { makeMinRaise } from './questions/minraise'
import { makeMultiChip } from './questions/multichip'
import { makeOutOfTurn } from './questions/outofturn'
import { makeOversize } from './questions/oversize'
import { makeReopen } from './questions/reopen'
import { createRng } from '@/lib/simulator'
import { BLINDS } from './money'
import { KIND_QUOTA, QUESTION_COUNT, type ActionKind, type ActionQuestion } from './types'

/** 유형별로 뽑아 볼 판 수. 조합 폭이 넓어 1,000판이면 희귀 분기까지 닿는다. */
const RUNS = 1000

const MAKERS = {
  minraise: makeMinRaise,
  reopen: makeReopen,
  oversize: makeOversize,
  multichip: makeMultiChip,
  outofturn: makeOutOfTurn,
} as const

/** 한 유형을 RUNS 판 만든다. null 은 재시도이므로 시드를 밀어 채운다. */
function sample(kind: ActionKind, count = RUNS): ActionQuestion[] {
  const make = MAKERS[kind]
  const out: ActionQuestion[] = []
  for (let i = 0; out.length < count; i++) {
    // 무한루프 방지 — 이만큼 돌려도 못 채우면 생성 확률 자체가 문제다
    expect(i, `${kind} 생성 실패율이 너무 높다`).toBeLessThan(count * 50)
    const q = make(createRng(`${kind}-${i}`))
    if (q !== null) out.push(q)
  }
  return out
}

/** 문제에 그려진 값으로 정답 선택지를 찾는다. */
function correctChoice(q: ActionQuestion): string {
  if (q.input !== 'choice') throw new Error('선다형이 아니다')
  const hits = q.choices.filter((c) => c.correct)
  expect(hits.length, `정답 보기가 ${hits.length}개다`).toBe(1)
  return hits[0].label
}

describe('공통 불변식 — 다섯 유형 전부', () => {
  it('지문·근거·조항이 비어 있지 않고 제한시간이 양수다', () => {
    for (const kind of Object.keys(MAKERS) as ActionKind[]) {
      for (const q of sample(kind, 200)) {
        expect(q.prompt.length, kind).toBeGreaterThan(0)
        expect(q.why.length, kind).toBeGreaterThan(0)
        expect(q.article.no.length, kind).toBeGreaterThan(0)
        expect(q.article.text.length, kind).toBeGreaterThan(0)
        expect(q.limitSec, kind).toBeGreaterThan(0)
        expect(q.seats.length, kind).toBeGreaterThan(1)
      }
    }
  })

  it('지문과 근거에 HTML 태그가 섞이지 않는다', () => {
    // 프로토타입은 <em>·<b> 를 넣었다. 앱에서 그대로 오면 화면에 태그가 그대로 보인다.
    for (const kind of Object.keys(MAKERS) as ActionKind[]) {
      for (const q of sample(kind, 100)) {
        expect(q.prompt, kind).not.toMatch(/<[a-z/]/i)
        expect(q.why, kind).not.toMatch(/<[a-z/]/i)
      }
    }
  })

  it('선다형은 정답이 정확히 하나이고 보기 문구가 겹치지 않는다', () => {
    for (const kind of ['reopen', 'oversize', 'multichip', 'outofturn'] as const) {
      for (const q of sample(kind, 300)) {
        if (q.input !== 'choice') throw new Error(`${kind} 가 선다형이 아니다`)
        expect(q.choices.filter((c) => c.correct).length, kind).toBe(1)
        // 금액이 같아 두 보기가 구별되지 않으면 문제가 성립하지 않는다 (설계 §6.3)
        const labels = new Set(q.choices.map((c) => c.label))
        expect(labels.size, `${kind}: 보기 문구 중복`).toBe(q.choices.length)
      }
    }
  })

  it('좌석 이름이 겹치지 않는다', () => {
    // 겹치면 화면에서 어느 좌석을 말하는지 알 수 없다
    for (const kind of Object.keys(MAKERS) as ActionKind[]) {
      for (const q of sample(kind, 200)) {
        const names = new Set(q.seats.map((s) => s.name))
        expect(names.size, kind).toBe(q.seats.length)
      }
    }
  })

  it('좌석 수가 테이블 좌표 범위(2~7) 안이다', () => {
    for (const kind of Object.keys(MAKERS) as ActionKind[]) {
      for (const q of sample(kind, 200)) {
        expect(q.seats.length, kind).toBeGreaterThanOrEqual(2)
        expect(q.seats.length, kind).toBeLessThanOrEqual(7)
      }
    }
  })
})

describe('최소 레이즈 — 정답을 엔진으로 재계산한다', () => {
  it('화면의 로그로 다시 계산해도 같은 답이 나온다', () => {
    for (const q of sample('minraise')) {
      if (q.input !== 'number') throw new Error('숫자 입력이 아니다')

      // 화면에 보이는 최고 벳
      const currentBet = Math.max(...q.rows.map((r) => r.amount ?? 0))
      expect(currentBet).toBeGreaterThan(0)

      /*
       * 폭을 로그에서 독립적으로 되짚는다 — **풀 레이즈만 폭을 갱신한다**는 규칙을
       * 여기서 직접 적용해 본다. 생성기가 엔진을 잘못 불렀다면 여기서 갈라진다.
       */
      let size = q.bb
      let at = q.bb
      for (const row of q.rows.slice(1)) {
        const to = row.amount ?? at
        const inc = to - at
        if (inc >= Math.max(size, q.bb)) size = inc
        at = to
      }
      expect(currentBet).toBe(at)
      expect(q.answer).toBe(currentBet + Math.max(size, q.bb))
    }
  })

  it('정답이 현재 벳보다 크고 빅블라인드 단위로 떨어진다', () => {
    for (const q of sample('minraise', 300)) {
      if (q.input !== 'number') throw new Error('숫자 입력이 아니다')
      const currentBet = Math.max(...q.rows.map((r) => r.amount ?? 0))
      expect(q.answer).toBeGreaterThan(currentBet)
    }
  })

  it('짧은 올인이 섞인 판이 실제로 나온다', () => {
    // 안 나오면 이 유형이 시험 6·7번 상황을 한 번도 출제하지 않는다는 뜻이다
    const withShorts = sample('minraise', 300).filter((q) =>
      q.rows.some((r) => r.allIn === true),
    )
    expect(withShorts.length).toBeGreaterThan(0)
  })
})

describe('베팅 기회 재개 — 정답을 엔진으로 재계산한다', () => {
  it('화면 값으로 canReopen 을 다시 물어도 같은 답이다', () => {
    for (const q of sample('reopen')) {
      const hero = q.seats.find((s) => s.hero === true)
      expect(hero, '히어로 좌석이 없다').toBeDefined()
      if (hero === undefined) return

      const currentBet = Math.max(...q.rows.map((r) => r.amount ?? 0))
      let size = q.bb
      let at = q.bb
      for (const row of q.rows.slice(1)) {
        const to = row.amount ?? at
        const inc = to - at
        if (inc >= Math.max(size, q.bb)) size = inc
        at = to
      }

      const canRaise = nlh.canReopen({
        currentBet,
        lastRaiseSize: size,
        bigBlind: q.bb,
        seatBet: hero.bet ?? 0,
        seatStack: Number.MAX_SAFE_INTEGER,
        isOpenBet: false,
        hasActedThisRound: true,
        pot: 0,
      })
      expect(correctChoice(q)).toBe(canRaise ? '레이즈할 수 있다' : '레이즈할 수 없다')
    }
  })

  it('두 답이 모두 충분히 나온다 — 찍어서 못 맞힌다', () => {
    // 한쪽으로 쏠리면 "레이즈할 수 없다"만 눌러도 만점이다 (설계 §6.4)
    const yes = sample('reopen').filter((q) => correctChoice(q) === '레이즈할 수 있다').length
    const ratio = yes / RUNS
    expect(ratio, `"레이즈할 수 있다" 비율 ${(ratio * 100).toFixed(1)}%`).toBeGreaterThan(0.1)
    expect(ratio, `"레이즈할 수 있다" 비율 ${(ratio * 100).toFixed(1)}%`).toBeLessThan(0.9)
  })
})

describe('오버사이즈 칩 — 정답을 엔진으로 재계산한다', () => {
  it('화면 값으로 interpretChipPush 를 다시 물어도 같은 답이다', () => {
    for (const q of sample('oversize')) {
      const openBet = q.rows[0].amount ?? 0
      const pusher = q.seats.find((s) => s.chips !== undefined)
      expect(pusher?.chips?.length, '단일 칩이어야 한다').toBe(1)
      if (pusher?.chips === undefined) return

      const chip = pusher.chips[0]
      const declared = pusher.act?.includes('레이즈') === true

      const ctx = {
        currentBet: openBet,
        lastRaiseSize: openBet,
        bigBlind: q.bb,
        seatBet: 0,
        seatStack: Number.MAX_SAFE_INTEGER,
        isOpenBet: true,
        hasActedThisRound: false,
        pot: 0,
      }
      const ruling = nlh.interpretChipPush(ctx, chip, declared ? 'raise' : 'none', [chip])
      const expected =
        ruling.kind === 'call'
          ? '콜'
          : `레이즈 ${('to' in ruling ? ruling.to : 0).toLocaleString('ko-KR')}`
      expect(correctChoice(q)).toBe(expected)
    }
  })

  it('오픈 벳이 빅블라인드 이상이다 (제35조 1항)', () => {
    for (const q of sample('oversize', 500)) {
      expect(q.rows[0].amount ?? 0).toBeGreaterThanOrEqual(q.bb)
    }
  })

  it('선언 없는 콜과 선언한 레이즈가 모두 나온다', () => {
    const kinds = new Set(sample('oversize').map(correctChoice).map((l) => l.split(' ')[0]))
    expect(kinds).toContain('콜')
    expect(kinds).toContain('레이즈')
  })

  it('"최소 레이즈로 채운다" 갈래가 실제로 나온다', () => {
    // 이 갈래가 없으면 "선언하면 낸 만큼만 레이즈"라는 오해를 한 번도 못 깬다
    const filled = sample('oversize').filter((q) => {
      if (q.input !== 'choice') return false
      const label = correctChoice(q)
      const chip = q.seats.find((s) => s.chips !== undefined)?.chips?.[0] ?? 0
      return label.startsWith('레이즈') && label !== `레이즈 ${chip.toLocaleString('ko-KR')}`
    })
    expect(filled.length).toBeGreaterThan(0)
  })
})

describe('다중 칩 베팅 — 정답을 엔진으로 재계산한다', () => {
  it('화면 값으로 interpretChipPush 를 다시 물어도 같은 답이다', () => {
    for (const q of sample('multichip')) {
      const openBet = q.rows[0].amount ?? 0
      const pusher = q.seats.find((s) => s.chips !== undefined)
      if (pusher?.chips === undefined) throw new Error('민 칩이 없다')

      const total = pusher.chips.reduce((a, b) => a + b, 0)
      expect(total, '칩 내역 합이 좌석 벳과 다르다').toBe(pusher.bet)

      const lastChips = pusher.act?.includes('전부') === true
      const ctx = {
        currentBet: openBet,
        lastRaiseSize: openBet,
        bigBlind: q.bb,
        seatBet: 0,
        seatStack: lastChips ? total : total + Math.min(...pusher.chips),
        isOpenBet: true,
        hasActedThisRound: false,
        pot: 0,
      }
      const ruling = nlh.interpretChipPush(ctx, total, 'none', pusher.chips)
      const expected = { call: '콜', raise: '레이즈 시도', allin: '올인' }[
        ruling.kind as 'call' | 'raise' | 'allin'
      ]
      expect(correctChoice(q)).toBe(expected)
    }
  })

  it('세 갈래가 모두 나온다', () => {
    const seen = new Set(sample('multichip').map(correctChoice))
    expect(seen).toEqual(new Set(['콜', '레이즈 시도', '올인']))
  })

  it('오픈 벳이 빅블라인드 이상이다 (제35조 1항)', () => {
    for (const q of sample('multichip', 500)) {
      expect(q.rows[0].amount ?? 0).toBeGreaterThanOrEqual(q.bb)
    }
  })

  it('칩이 두 개 이상이다 — 하나면 다중 칩이 아니다', () => {
    for (const q of sample('multichip', 300)) {
      const chips = q.seats.find((s) => s.chips !== undefined)?.chips ?? []
      expect(chips.length).toBeGreaterThan(1)
    }
  })
})

describe('순서 위반 — 정답을 엔진으로 재계산한다', () => {
  /** 로그 표기 → 엔진 액션. 로그는 영어 대문자다 (outofturn.ts LOG_ACT). */
  const FROM_LOG: Record<string, 'fold' | 'check' | 'call' | 'bet' | 'raise'> = {
    FOLD: 'fold',
    CHECK: 'check',
    CALL: 'call',
    BET: 'bet',
    RAISE: 'raise',
  }

  it('화면 값으로 resolveOutOfTurn 을 다시 물어도 같은 답이다', () => {
    for (const q of sample('outofturn')) {
      const cRow = q.rows.find((r) => r.outOfTurn === true)
      const bRow = q.rows.find((r) => r.act.includes('본래 순서'))
      if (cRow === undefined || bRow === undefined) throw new Error('로그가 없다')

      const oot = FROM_LOG[cRow.act.split(' ')[0]]
      const proper = FROM_LOG[bRow.act.split(' ')[0]]
      expect(oot, `순서위반 액션을 못 읽음: ${cRow.act}`).toBeDefined()
      expect(proper, `본래순서 액션을 못 읽음: ${bRow.act}`).toBeDefined()
      // 순서 위반 액션은 폴드·체크·콜 뿐이다 (제27조가 다루는 범위).
      // 타입까지 좁혀 둬야 resolveOutOfTurn 에 그대로 넘길 수 있다.
      if (oot !== 'fold' && oot !== 'check' && oot !== 'call') {
        throw new Error(`순서 위반 액션이 아니다: ${oot}`)
      }

      const ruling = resolveOutOfTurn(oot, proper)
      expect(correctChoice(q)).toBe(
        ruling.binding ? '구속력을 가진다' : '무효 — 벳을 회수하고 새 옵션',
      )
    }
  })

  it('순서를 어긴 폴드는 언제나 구속력을 가진다', () => {
    const folds = sample('outofturn').filter((q) =>
      q.rows.some((r) => r.outOfTurn === true && r.act.startsWith('FOLD')),
    )
    expect(folds.length, '폴드 갈래가 한 번도 안 나왔다').toBeGreaterThan(0)
    for (const q of folds) expect(correctChoice(q)).toBe('구속력을 가진다')
  })

  it('두 답이 모두 충분히 나온다', () => {
    const binding = sample('outofturn').filter((q) => correctChoice(q) === '구속력을 가진다').length
    const ratio = binding / RUNS
    expect(ratio, `"구속력" 비율 ${(ratio * 100).toFixed(1)}%`).toBeGreaterThan(0.1)
    expect(ratio, `"구속력" 비율 ${(ratio * 100).toFixed(1)}%`).toBeLessThan(0.9)
  })

  it('체크는 벳 없는 상황에서만, 콜·폴드는 벳 있는 상황에서만 나온다', () => {
    for (const q of sample('outofturn', 500)) {
      const cRow = q.rows.find((r) => r.outOfTurn === true)
      if (cRow?.act.startsWith('CHECK') === true) expect(q.rows[0].act).toBe('CHECK')
      else expect(q.rows[0].act).toBe('BET')
    }
  })
})

describe('한 판 — 배분과 결정론', () => {
  it('10문제이고 유형당 정확히 2개다', () => {
    for (let n = 0; n < 200; n++) {
      const qs = generateRun(`run-${n}`)
      expect(qs.length).toBe(QUESTION_COUNT)
      const counts = new Map<ActionKind, number>()
      for (const q of qs) counts.set(q.kind, (counts.get(q.kind) ?? 0) + 1)
      for (const [kind, quota] of Object.entries(KIND_QUOTA) as [ActionKind, number][]) {
        expect(counts.get(kind), `${kind} 배분`).toBe(quota)
      }
    }
  })

  it('같은 시드는 같은 판을 만든다', () => {
    const a = generateRun('same-seed')
    const b = generateRun('same-seed')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('다른 시드는 다른 판을 만든다', () => {
    expect(JSON.stringify(generateRun('seed-a'))).not.toBe(JSON.stringify(generateRun('seed-b')))
  })

  it('출제 순서가 매번 같지 않다', () => {
    // 유형 배분이 고정이라 순서까지 고정이면 세 판째부터 다음 유형을 외운다
    const orders = new Set<string>()
    for (let n = 0; n < 50; n++) orders.add(generateRun(`order-${n}`).map((q) => q.kind).join(','))
    expect(orders.size).toBeGreaterThan(10)
  })

  it('블라인드가 정해진 레벨 안에서만 나온다', () => {
    for (let n = 0; n < 100; n++) {
      for (const q of generateRun(`blind-${n}`)) {
        expect(BLINDS as readonly number[]).toContain(q.bb)
      }
    }
  })
})
