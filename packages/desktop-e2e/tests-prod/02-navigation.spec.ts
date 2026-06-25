import { test, expect } from '../fixtures/app-prod'

test('titlebar tab navigation switches sidebar panels', async ({ appPage }) => {
  // Navigate to Environments tab
  await appPage.locator('.tb-tab').filter({ hasText: 'Environments' }).click()
  // Sidebar should show the env panel (contains env name input)
  await expect(appPage.locator('.sidebar')).toBeVisible({ timeout: 3000 })
  await expect(appPage.locator('.ep-input')).toBeVisible({ timeout: 3000 })

  // Navigate to History tab
  await appPage.locator('.tb-tab').filter({ hasText: 'History' }).click()
  // Sidebar should show the history stub or panel
  await expect(appPage.locator('.sidebar')).toBeVisible({ timeout: 3000 })

  // Navigate to Settings tab
  await appPage.locator('.tb-tab').filter({ hasText: 'Settings' }).click()
  // Sidebar shows theme toggle
  await expect(appPage.locator('.theme-toggle')).toBeVisible({ timeout: 3000 })

  // Navigate back to Collections tab
  await appPage.locator('.tb-tab').filter({ hasText: 'Collections' }).click()
  // Sidebar shows collections section label
  await expect(appPage.locator('.sidebar')).toContainText('Collections', { timeout: 3000 })
})
