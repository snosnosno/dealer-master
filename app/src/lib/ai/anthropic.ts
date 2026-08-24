import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/env'

/**
 * Anthropic 클라이언트 (서버 전용).
 * 키가 브라우저 번들에 섞이지 않도록 'server-only' 로 잠가둔다.
 */
export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

/**
 * 서술형 답안 채점 모델.
 *
 * 모델 ID 에 날짜 접미사(-20251001 등)를 붙이지 말 것 — 현재 API 는 접미사 없는 ID 를 쓴다.
 * 비용: 입력 $1 / 출력 $5 per MTok. 기획서 §5 기준 1인당 월 20~35원.
 */
export const GRADING_MODEL = 'claude-haiku-4-5' as const

/**
 * 케이스 변형 생성 모델 (V1 이후).
 */
export const CONTENT_MODEL = 'claude-sonnet-5' as const

/**
 * 케이스별 시스템 프롬프트는 유저 답안과 달리 요청 간에 변하지 않으므로
 * 캐시 대상이다. 캐시는 접두사 일치 방식이라 순서가 중요하다:
 *   [고정: 채점 기준 + TDA 조항 원문] → cache_control → [가변: 유저 답안]
 * 고정 블록 앞이나 안쪽이 1바이트라도 바뀌면 캐시가 전부 무효화된다.
 *
 * 캐시 최소 길이는 약 1024 토큰이며, 그보다 짧으면 조용히 캐싱되지 않는다.
 * 실제 적중 여부는 응답의 usage.cache_read_input_tokens 로 확인할 것.
 */
export const CACHE_CONTROL_EPHEMERAL = { type: 'ephemeral' } as const
