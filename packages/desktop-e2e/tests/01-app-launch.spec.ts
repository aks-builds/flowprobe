import { test, expect } from '../fixtures/app'

test('app launches and shows idle state', async ({ appPage }) => {
  // Wait for splash to finish — empty canvas becomes visible
  await expect(appPage.locator('.empty-title')).toContainText('No collection open', { timeout: 8000 })

  // Status bar is present with version badge
  await expect(appPage.locator('.stbar')).toContainText('v1.0.0')

  // Run button is disabled (no collection loaded)
  await expect(appPage.locator('.btn-run')).toBeDisabled()

  // Keyboard shortcut hint visible in status bar
  await expect(appPage.locator('.stbar')).toContainText('Ctrl+K')
})
