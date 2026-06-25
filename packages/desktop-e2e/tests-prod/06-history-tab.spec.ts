import { test, expect } from '../fixtures/app-prod'

test('analysis dock History tab shows empty state', async ({ appPage }) => {
  // Click the "History" tab in the Analysis Dock (not the titlebar nav)
  // The dock tabs use .dock-tab class
  await appPage.locator('.dock-tab').filter({ hasText: 'History' }).click()

  // Active tab switches to History
  await expect(appPage.locator('.dock-tab.active')).toContainText('History', { timeout: 3000 })

  // Empty state text is visible — no runs have been recorded yet
  await expect(appPage.locator('.dock-body')).toContainText('No runs recorded yet', { timeout: 3000 })
})
