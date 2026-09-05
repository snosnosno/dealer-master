import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // vitest 가 e2e/ 를 집어가지 않게 확장자를 나눈다 (vitest 는 src/ 만 본다)
  use: { baseURL: 'http://localhost:3000' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // 360px 은 좌석 상자가 잘리던 폭이다. 홀카드가 4장으로 늘어 다시 확인해야 한다
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 } } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
