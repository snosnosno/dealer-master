/**
 * 축 선택 화면.
 *
 * 대시보드가 아니다. 등급 카드·스트릭 배지는 hand_sessions 를 읽어야 하는데
 * 그 테이블이 3단계 범위라, 지금 만들면 더미 데이터 화면이 된다.
 */
import Link from 'next/link'

const AXES = [
  { icon: '⚖️', title: 'TDA 룰', desc: '이번 주 케이스', href: null },
  { icon: '🎓', title: '딜러 교육', desc: '노리밋 홀덤 시뮬레이터', href: '/simulator' },
  { icon: '🃏', title: '믹스게임 운영', desc: '스터드 · 드로우 트레이너', href: null },
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
              className="block rounded-2xl border border-[#0F6E56] bg-[#E1F5EE] p-5 dark:bg-zinc-900"
            >
              <span className="text-2xl">{axis.icon}</span>
              <p className="mt-2 text-base font-bold text-[#085041] dark:text-[#9FE1CB]">
                {axis.title}
              </p>
              <p className="text-xs text-[#0F6E56] dark:text-zinc-400">{axis.desc}</p>
            </Link>
          ),
        )}
      </div>
    </main>
  )
}
