import { test, expect } from '../fixtures/app'

test('Ctrl+K opens command palette and Escape closes it', async ({ appPage }) => {
  // Open palette
  await appPage.keyboard.press('Control+k')

  // Palette dialog is visible
  await expect(appPage.locator('.palette')).toBeVisible({ timeout: 3000 })

  // Search input is focused
  const searchInput = appPage.locator('.palette input[placeholder="Search flows, run, open…"]')
  await expect(searchInput).toBeFocused({ timeout: 2000 })

  // Type to filter — fixture has "HTTP Echo Assert Flow" and "HTTP POST Assert Flow"
  await searchInput.fill('Echo')
  await expect(appPage.locator('.palette')).toContainText('HTTP Echo Assert Flow')
  await expect(appPage.locator('.palette')).not.toContainText('HTTP POST Assert Flow')

  // Escape closes palette
  await appPage.keyboard.press('Escape')
  await expect(appPage.locator('.palette')).not.toBeVisible({ timeout: 2000 })
})
