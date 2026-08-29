import { describe, expect, test } from 'vitest'
import { DEALER_ANGLE_DEG, seatAngleDeg, seatOffset } from './geometry'

const norm = (deg: number) => ((deg % 360) + 360) % 360

describe('좌석 각도', () => {
  test('6-max 는 120·180·240·300·0·60 도에 앉는다', () => {
    const got = [0, 1, 2, 3, 4, 5].map((i) => norm(seatAngleDeg(i, 6)))
    expect(got).toEqual([120, 180, 240, 300, 0, 60])
  })

  test('3~9인 어떤 인원수에서도 딜러 자리(하단 중앙 90도)에 좌석이 없다', () => {
    for (let n = 3; n <= 9; n++) {
      for (let i = 0; i < n; i++) {
        expect(norm(seatAngleDeg(i, n))).not.toBeCloseTo(DEALER_ANGLE_DEG, 6)
      }
    }
  })

  test('3~9인 어떤 인원수에서도 좌석이 서로 겹치지 않는다', () => {
    for (let n = 3; n <= 9; n++) {
      const pts = Array.from({ length: n }, (_, i) => seatOffset(i, n, 100, 60))
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          const dx = pts[a].x - pts[b].x
          const dy = pts[a].y - pts[b].y
          expect(Math.hypot(dx, dy)).toBeGreaterThan(1)
        }
      }
    }
  })

  test('좌석 0 은 하단 왼쪽이다 — 딜러의 왼쪽부터 돈다', () => {
    const p = seatOffset(0, 6, 100, 60)
    expect(p.x).toBeLessThan(0)
    expect(p.y).toBeGreaterThan(0)
  })

  test('좌석 인덱스가 늘수록 화면상 반시계로 간다', () => {
    // 좌석 0(하단 왼쪽) → 1(왼쪽) → 2(상단 왼쪽): y 가 단조 감소한다
    const ys = [0, 1, 2].map((i) => seatOffset(i, 6, 100, 60).y)
    expect(ys[0]).toBeGreaterThan(ys[1])
    expect(ys[1]).toBeGreaterThan(ys[2])
  })
})
