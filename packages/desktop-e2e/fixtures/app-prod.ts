import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test'

// All tests share one live app instance — we never restart between tests.
// State is intentionally carried across: test 02 loads the collection that 03/05 need.
let sharedContext: BrowserContext | null = null
let sharedPage: Page | null = null

async function getAppPage(): Promise<Page> {
  if (!sharedContext) {
    const browser = await chromium.connectOverCDP('http://localhost:9223')
    sharedContext = browser.contexts()[0]
    if (!sharedContext) throw new Error('[E2E-PROD] No browser context found on CDP endpoint')
    sharedPage = sharedContext.pages()[0] ?? await sharedContext.waitForEvent('page')
    // Dismiss any system-level dialogs the app might raise on startup
    sharedPage.on('dialog', d => d.dismiss().catch(() => {}))
  }
  return sharedPage!
}

export const test = base.extend<{ appPage: Page }>({
  appPage: async ({}, use) => {
    const page = await getAppPage()
    await use(page)
  },
})

export { expect } from '@playwright/test'
