import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

/**
 * Next.js 16 에서 middleware 는 proxy 로 이름이 바뀌었다.
 * 여기서는 세션 갱신만 하고, 페이지 보호는 각 라우트에서 처리한다.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * 아래를 제외한 모든 경로에서 실행:
     * - _next/static, _next/image (빌드 산출물)
     * - favicon.ico, 이미지 파일 (정적 자산)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
