import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * 서버(Server Component / Server Action / Route Handler)용 Supabase 클라이언트.
 *
 * 요청마다 새로 만들어야 한다 — 요청의 쿠키를 읽어 세션을 붙이기 때문에
 * 전역에 캐싱하면 다른 사용자의 세션이 섞인다.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Component 에서는 쿠키를 쓸 수 없다.
            // proxy.ts 가 매 요청마다 세션을 갱신하므로 여기서는 무시해도 안전하다.
          }
        },
      },
    },
  )
}
