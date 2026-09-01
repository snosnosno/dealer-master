/**
 * 조항 패널 — 채점 뒤에만 보인다.
 *
 * **이게 축 2 의 학습 가치다.** 정답만 알려주면 다음에 비슷한 상황에서 또 틀린다.
 * 조항 번호와 원문을 그대로 보여줘야 훈련생이 근거를 기억한다.
 *
 * 원문은 요약하지 않는다. 제35조 4항이 가장 길지만 잘라내면 "직면한 **총** 베팅
 * 증가액"이라는, 이 조항에서 가장 중요한 단어가 사라진다.
 */
import type { Article } from '@/lib/action-rush/types'

export function ArticlePanel({ article }: { article: Article }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/60">
      <p className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-dm-accent">
        {article.no}
      </p>
      <p className="mt-1 break-keep text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        {article.text}
      </p>
    </div>
  )
}
