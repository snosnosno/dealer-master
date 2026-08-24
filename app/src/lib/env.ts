import 'server-only'
import { z } from 'zod'

/**
 * 서버 전용 환경변수 검증.
 *
 * 비유: 공항 보안검색대와 같다. 탑승(앱 부팅) 전에 한 번 전수검사해서
 * 문제 있는 승객(누락된 키)을 걸러낸다. 통과한 뒤에는 다시 묻지 않는다.
 *
 * 기술적으로는 모듈 최초 import 시점에 1회 파싱하고, 실패하면 즉시 throw 한다.
 * 런타임 깊숙한 곳에서 `undefined` 로 터지는 대신 부팅 시점에 실패시키는 것이 목적.
 */
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url(),
  ADMIN_EMAIL: z.email(),
  // 토스페이먼츠는 가맹점 심사 통과 후 발급되므로 그 전까지는 선택값
  NEXT_PUBLIC_TOSS_CLIENT_KEY: z.string().optional(),
  TOSS_SECRET_KEY: z.string().optional(),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

function loadServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env)

  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(
      `환경변수 검증 실패. .env.local 을 확인하세요 (.env.local.example 참고):\n${missing}`,
    )
  }

  return parsed.data
}

export const env = loadServerEnv()
