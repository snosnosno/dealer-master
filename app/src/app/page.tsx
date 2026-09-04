/**
 * 축 선택 화면.
 *
 * 대시보드가 아니다. 등급 카드·스트릭 배지는 기록 층을 읽어야 하는데 그건 로그인과
 * 함께 오는 단계라(PRD §4), 지금 만들면 더미 데이터 화면이 된다.
 *
 * **목록은 PRD §6 의 축 4개와 같은 순서·같은 이름이어야 한다.** 예전에는 "딜러 교육"이
 * 옛 시뮬레이터를 가리키고 축 4(TDA 룰)는 아예 없었다 — 화면과 정본이 어긋나면
 * 어느 쪽이 계획인지 아무도 모른다. 시뮬레이터는 축이 아니라 도구라서 아래로 내렸다.
 */
import Link from 'next/link'

const AXES = [
  {
    icon: '⏱️',
    title: '팟 판독 러시',
    desc: '팟·사이드팟·홀칩 — 10문제 · 3분',
    href: '/rush',
  },
  {
    icon: '⚖️',
    title: '딜러 교육 — 액션 판정 러시',
    desc: '액션 합법성·최소 레이즈·칩 해석 — 근거는 규정 조항이다',
    href: '/action-rush',
  },
  {
    icon: '🃏',
    title: '믹스게임 운영',
    desc: '스터드 · 드로우 · 베팅 구조 3종',
    href: null,
  },
  {
    icon: '📖',
    title: 'TDA 룰 판정',
    desc: '조항 적용과 재량 판단 — 주 1회 케이스',
    href: null,
  },
] as const

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-10 font-sans">
      <h1 className="text-2xl font-extrabold tracking-tight">딜러마스터</h1>
      <p className="mt-1 text-sm text-zinc-500">판정을 배우는 게 아니라 판정력을 기른다</p>

      <div className="mt-8 space-y-3">
        {AXES.map((axis) =>
          axis.href === null ? (
            <div
              key={axis.title}
              className="rounded-2xl border border-zinc-200 p-5 opacity-50 dark:border-zinc-800"
            >
              <span className="text-2xl">{axis.icon}</span>
              <p className="mt-2 text-base font-bold">{axis.title}</p>
              <p className="text-xs text-zinc-500">{axis.desc}</p>
              <p className="mt-2 text-[11px] font-bold text-zinc-400">준비 중</p>
            </div>
          ) : (
            <Link
              key={axis.title}
              href={axis.href}
              className="block rounded-2xl border border-dm-teal-600 bg-dm-teal-50 p-5 dark:bg-zinc-900"
            >
              <span className="text-2xl">{axis.icon}</span>
              <p className="mt-2 text-base font-bold text-dm-teal-800 dark:text-dm-teal-100">
                {axis.title}
              </p>
              <p className="text-xs text-dm-teal-600 dark:text-zinc-400">{axis.desc}</p>
            </Link>
          ),
        )}
      </div>

      {/* 축이 아니라 도구다. 엔진이 무엇을 내는지 눈으로 보는 화면이라 목록과 섞지 않는다 */}
      <p className="mt-8 text-[11px] text-zinc-400">
        <Link href="/simulator" className="underline underline-offset-2 hover:text-zinc-600">
          핸드 시뮬레이터
        </Link>
        {' · 노리밋 홀덤 한 판을 처음부터 끝까지 돌려보는 도구'}
      </p>
    </main>
  )
}
