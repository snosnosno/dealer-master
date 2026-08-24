import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * 매 요청마다 Supabase Auth 토큰을 갱신하고 쿠키에 다시 심는다.
 * Server Component 는 쿠키를 쓸 수 없기 때문에 이 계층이 필요하다.
 *
 * 주의: createServerClient 와 getClaims() 사이에 다른 코드를 넣지 말 것.
 * 사용자가 무작위로 로그아웃되는 디버깅 난이도 최상급 버그의 원인이 된다.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
          // CDN 이 세션 응답을 캐싱해 다른 사용자에게 새지 않도록 캐시 헤더를 전달
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          )
        },
      },
    },
  )

  // getSession() 이 아니라 getClaims() 를 써야 한다 — JWT 서명을 매번 검증한다.
  await supabase.auth.getClaims()

  // supabaseResponse 를 그대로 반환해야 쿠키가 유실되지 않는다.
  return supabaseResponse
}
