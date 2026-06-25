import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests-prod',
  timeout: 30_000,
  globalSetup: './global-setup-prod.ts',
  globalTeardown: './global-teardown-prod.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report-prod' }], ['list']],
  use: { trace: 'on-first-retry' },
  projects: [{ name: 'chromium' }],
})
