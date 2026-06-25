import { test, expect } from '../fixtures/app-prod'

test('Ctrl+K opens command palette and Escape closes it', async ({ appPage }) => {
  // Navigate back to Collections tab first to ensure clean state
  await appPage.locator('.tb-tab').filter({ hasText: 'Collections' }).click()

  // Open palette
  await appPage.keyboard.press('Control+k')

  // Palette dialog is visible
  await expect(appPage.locator('.palette')).toBeVisible({ timeout: 3000 })

  // Search input is focused
  const searchInput = appPage.locator('.palette input[placeholder="Search flows, run, open…"]')
  await expect(searchInput).toBeFocused({ timeout: 2000 })

  // Type something — results area should be visible (may be empty without a collection loaded)
  await searchInput.fill('run')
  // Palette remains visible with results area
  await expect(appPage.locator('.palette')).toBeVisible()

  // Escape closes palette
  await appPage.keyboard.press('Escape')
  await expect(appPage.locator('.palette')).not.toBeVisible({ timeout: 2000 })
})
