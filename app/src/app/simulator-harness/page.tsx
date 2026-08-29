/**
 * 시뮬레이터 엔진 확인용 하네스.
 *
 * 이것은 제품 UI 가 아니다. 엔진(`@/lib/simulator`)이 시드 하나에서 무엇을 내는지
 * 눈으로 대조하기 위한 최소 화면이다. 판단·재계산은 하지 않고 엔진 출력을 그대로 옮긴다.
 *
 * 클라이언트에서 도는 이유: 엔진이 순수 TS 라 브라우저에서 그대로 실행되고,
 * 같은 시드를 두 번 눌러 서버 왕복 없이 즉시 대조할 수 있기 때문이다.
 *
 * import 는 공개 진입점(`index.ts`)에서만 한다. `bots.ts`·`runBettingRound` 는
 * 일부러 공개 표면에 없으므로 끌어오지 않는다.
 */
'use client'

import { useState } from 'react'
import {
  buildPots,
  extractDecisions,
  generateHand,
  initialState,
  stateAt,
  MAX_SEATS,
  MIN_SEATS,
  TIME_LIMITS,
  type DecisionKind,
  type DecisionPoint,
  type Hand,
  type Pot,
} from '@/lib/simulator'
import { cardText, describeEvent, hashEvents, seatLabels } from './format'

const KINDS: DecisionKind[] = ['procedure', 'action_validity', 'calculation', 'showdown']

type Result = {
  hand: Hand
  decisions: DecisionPoint[]
  pots: Pot[]
  folded: boolean[]
  contributed: number[]
  hash: string
}

function build(seed: string, seatCount: number, require: DecisionKind[]): Result {
  const hand = generateHand({ seed, seatCount, require: require.length ? require : undefined })
  const final = stateAt(
    initialState(hand.seats, hand.buttonSeat),
    hand.events,
    hand.events.length,
  )
  const folded = final.seats.map((s) => s.folded)
  return {
    hand,
    decisions: extractDecisions(hand),
    pots: buildPots(final.contributed, folded),
    folded,
    contributed: final.contributed,
    hash: hashEvents(hand.events),
  }
}

const num = (v: number) => v.toLocaleString('ko-KR')

const CARD = 'rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950'
const H2 = 'mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500'

export default function SimulatorHarness() {
  const [seed, setSeed] = useState('1')
  const [seatCount, setSeatCount] = useState(6)
  const [require, setRequire] = useState<DecisionKind[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [prevHash, setPrevHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function generate(kinds: DecisionKind[] = require) {
    try {
      const next = build(seed, seatCount, kinds)
      setPrevHash(result?.hash ?? null)
      setResult(next)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResult(null)
    }
  }

  function toggle(kind: DecisionKind) {
    setRequire((cur) => (cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind]))
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10 font-sans text-zinc-900 dark:text-zinc-100">
      <h1 className="text-2xl font-semibold tracking-tight">시뮬레이터 엔진 하네스</h1>
      <p className="mt-1 text-sm text-zinc-500">
        제품 UI 가 아니라 엔진 출력을 눈으로 대조하는 화면이다.
      </p>

      <Notice />

      <section className={`${CARD} mt-6`}>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500">시드</span>
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="w-40 rounded border border-zinc-300 px-2 py-1 font-mono dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500">좌석 수</span>
            <input
              type="number"
              min={MIN_SEATS}
              max={MAX_SEATS}
              value={seatCount}
              onChange={(e) => setSeatCount(Number(e.target.value))}
              className="w-24 rounded border border-zinc-300 px-2 py-1 font-mono dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500">require</span>
            <div className="flex flex-wrap gap-3">
              {KINDS.map((k) => (
                <label key={k} className="flex items-center gap-1 font-mono text-xs">
                  <input type="checkbox" checked={require.includes(k)} onChange={() => toggle(k)} />
                  {k}
                </label>
              ))}
            </div>
          </div>
          <button
            onClick={() => generate()}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            생성
          </button>
          <button
            onClick={() => {
              setRequire(['calculation'])
              generate(['calculation'])
            }}
            className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
          >
            사이드팟 보기 (require: calculation)
          </button>
        </div>
      </section>

      {error && (
        <p className="mt-6 rounded border border-red-300 bg-red-50 p-4 font-mono text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-6 flex flex-col gap-6">
          <Determinism hash={result.hash} prevHash={prevHash} />
          <Summary result={result} />
          <Events hand={result.hand} decisions={result.decisions} />
          <Decisions decisions={result.decisions} />
          <Pots result={result} />
        </div>
      )}
    </main>
  )
}

function Notice() {
  return (
    <ul className="mt-6 list-disc space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-4 pl-9 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <li>
        <strong>사이드팟은 <code>require: [&apos;calculation&apos;]</code> 없이는 거의 안 나온다.</strong> 300시드
        실측으로 require 없이 올인 0건, 걸면 300/300.
      </li>
      <li>
        <strong>핸드마다 4축이 다 나오지 않는다.</strong> <code>action_validity</code> 는 약 33% 핸드에서
        안 나온다 — 오답 후보가 정답과 겹치면 출제하지 않는 <em>의도된 동작</em>이다.
      </li>
      <li>
        판단 지점 개수는 핸드마다 다르다. <strong>0개인 핸드도 가능하다.</strong>
      </li>
      <li>
        <code>difficulty</code> 옵션은 현재 아무 효과가 없고, <code>rulesetId</code> 는 값이 하나뿐이라
        룰셋을 고르지 않는다. 둘 다 의도된 상태라 컨트롤에 두지 않았다.
      </li>
    </ul>
  )
}

function Determinism({ hash, prevHash }: { hash: string; prevHash: string | null }) {
  const same = prevHash !== null && prevHash === hash
  return (
    <section className={CARD}>
      <h2 className={H2}>결정성</h2>
      <div className="flex flex-wrap items-center gap-4 font-mono text-sm">
        <span>이벤트 열 지문: {hash}</span>
        {prevHash === null ? (
          <span className="text-zinc-500">직전 생성 없음 — 같은 시드로 한 번 더 눌러 대조하라</span>
        ) : (
          <span
            className={
              same
                ? 'rounded bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'rounded bg-orange-100 px-2 py-0.5 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
            }
          >
            직전({prevHash}) 과 {same ? '동일' : '다름'}
          </span>
        )}
      </div>
    </section>
  )
}

function Summary({ result }: { result: Result }) {
  const { hand, contributed, folded } = result
  const labels = seatLabels(hand.seats.length, hand.buttonSeat)
  return (
    <section className={CARD}>
      <h2 className={H2}>핸드</h2>
      <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400">
        seed={hand.seed} · ruleset={hand.rulesetId} · button=#{hand.buttonSeat} · blinds{' '}
        {num(hand.blinds.sb)}/{num(hand.blinds.bb)} · events={hand.events.length}
      </p>
      <p className="mb-4 text-xs text-zinc-500">
        좌석 번호가 두 벌이다. API 인덱스는 0-based(<code>#0</code>)이고, 학습자에게 보이는 문항
        문구는 1-based(<code>1번</code>)다 — <code>decisions.ts:106</code> 의{' '}
        <code>buttonSeat + 1</code>. 아래 표기는 전부 <code>#</code> 인덱스이고, 문항 안의
        &quot;N번&quot;만 1-based 다.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-1 pr-4">인덱스</th>
              <th className="py-1 pr-4">문항 표기</th>
              <th className="py-1 pr-4">이름</th>
              <th className="py-1 pr-4">포지션</th>
              <th className="py-1 pr-4 text-right">시작 스택</th>
              <th className="py-1 pr-4 text-right">총 투입</th>
              <th className="py-1">상태</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {hand.seats.map((s, i) => (
              <tr key={i} className="border-t border-zinc-100 dark:border-zinc-900">
                <td className="py-1 pr-4">#{i}</td>
                <td className="py-1 pr-4">{i + 1}번</td>
                <td className="py-1 pr-4 font-sans">{s.name}</td>
                <td className="py-1 pr-4">{labels[i]}</td>
                <td className="py-1 pr-4 text-right">{num(s.stack)}</td>
                <td className="py-1 pr-4 text-right">{num(contributed[i] ?? 0)}</td>
                <td className="py-1">{folded[i] ? '폴드' : '생존'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Events({ hand, decisions }: { hand: Hand; decisions: DecisionPoint[] }) {
  const marked = new Set(decisions.map((d) => d.atEventIndex))
  return (
    <section className={CARD}>
      <h2 className={H2}>이벤트 열 ({hand.events.length})</h2>
      <ol className="font-mono text-sm">
        {hand.events.map((e, i) => (
          <li
            key={i}
            className={`flex gap-3 border-t border-zinc-100 py-1 dark:border-zinc-900 ${
              marked.has(i) ? 'bg-sky-50 dark:bg-sky-950' : ''
            }`}
          >
            <span className="w-8 shrink-0 text-right text-zinc-400">{i}</span>
            <span className="w-36 shrink-0 text-zinc-500">{e.type}</span>
            <span>{describeEvent(e)}</span>
            {marked.has(i) && <span className="text-sky-600 dark:text-sky-400">← 판단 지점</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

function Decisions({ decisions }: { decisions: DecisionPoint[] }) {
  return (
    <section className={CARD}>
      <h2 className={H2}>판단 지점 ({decisions.length})</h2>
      {decisions.length === 0 ? (
        <p className="text-sm text-zinc-500">
          이 핸드에는 판단 지점이 0개다. 결함이 아니라 가능한 결과다 — 위 안내 참조.
        </p>
      ) : (
        <ol className="flex flex-col gap-5">
          {decisions.map((d, i) => (
            <li key={i} className="border-t border-zinc-100 pt-4 first:border-0 first:pt-0 dark:border-zinc-900">
              <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-xs text-zinc-500">
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">{d.kind}</span>
                <span>@event {d.atEventIndex}</span>
                <span>
                  {d.timeLimitSec}초 (TIME_LIMITS.{d.kind}={TIME_LIMITS[d.kind]})
                </span>
              </div>
              <p className="font-medium">{d.prompt}</p>
              {d.sub && <p className="text-sm text-zinc-500">{d.sub}</p>}
              <DecisionAnswer dp={d} />
              <p className="mt-2 font-mono text-xs text-zinc-500">ruleRef: {d.ruleRef}</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{d.explanation}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

const OK = 'font-medium text-emerald-700 dark:text-emerald-400'

function DecisionAnswer({ dp }: { dp: DecisionPoint }) {
  const input = dp.input
  if (input.type === 'choice') {
    return (
      <ul className="mt-2 text-sm">
        {input.choices.map((c, i) => (
          <li key={i} className={i === input.correctIndex ? OK : 'text-zinc-600 dark:text-zinc-400'}>
            {i === input.correctIndex ? '✔' : '·'} {c}
          </li>
        ))}
      </ul>
    )
  }
  if (input.type === 'number') {
    return (
      <ul className="mt-2 text-sm">
        {input.fields.map((f, i) => (
          <li key={i}>
            {f.label}: <span className={`font-mono ${OK}`}>{num(f.answer)}</span>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ul className="mt-2 text-sm">
      {input.options.map((o, i) => {
        const correct = input.correctSeats.includes(o.seat)
        return (
          <li key={i} className={correct ? OK : 'text-zinc-600 dark:text-zinc-400'}>
            {correct ? '✔' : '·'} #{o.seat} {o.label}
          </li>
        )
      })}
    </ul>
  )
}

function Pots({ result }: { result: Result }) {
  const { pots, hand } = result
  const awards = hand.events.filter((e) => e.type === 'award_pot')
  return (
    <section className={CARD}>
      <h2 className={H2}>팟 ({pots.length})</h2>
      {pots.length <= 1 && (
        <p className="mb-3 text-sm text-zinc-500">
          사이드팟 없음(메인팟만). require 에 calculation 을 걸면 올인이 강제돼 사이드팟이 생긴다.
        </p>
      )}
      <ul className="font-mono text-sm">
        {pots.map((p, i) => (
          <li key={i} className="border-t border-zinc-100 py-1 dark:border-zinc-900">
            {i === 0 ? '메인팟' : `사이드팟 ${i}`} · {num(p.amount)} · 자격 좌석{' '}
            {p.eligibleSeats.map((s) => `#${s}`).join(' ')}
          </li>
        ))}
      </ul>
      <h3 className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        분배 (award_pot 이벤트)
      </h3>
      <ul className="font-mono text-sm">
        {awards.map((e, i) => (
          <li key={i}>{describeEvent(e)}</li>
        ))}
      </ul>
      <h3 className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">보드</h3>
      <p className="font-mono text-sm">
        {hand.events
          .filter((e) => e.type === 'deal_board')
          .flatMap((e) => e.cards)
          .map(cardText)
          .join(' ') || '(보드 없음 — 쇼다운 전 종료)'}
      </p>
    </section>
  )
}
