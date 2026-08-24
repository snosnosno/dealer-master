import { createBrowserClient } from '@supabase/ssr'

/**
 * 브라우저(Client Component)용 Supabase 클라이언트.
 * createBrowserClient 내부가 싱글턴이라 여러 번 호출해도 인스턴스는 하나다.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
