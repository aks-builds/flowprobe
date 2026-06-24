import { test, expect } from '../fixtures/app'

test('Ctrl+O loads fixture collection via mock dialog', async ({ appPage }) => {
  // Press Ctrl+O — triggers invoke('open_collection_dialog'), which the mock
  // returns the embedded fixture JSON without showing a native dialog
  await appPage.keyboard.press('Control+o')

  // Collection count increments in status bar
  await expect(appPage.locator('.stbar')).toContainText('1 collection', { timeout: 5000 })

  // Run button becomes enabled (valid flow loaded, no validation errors)
  await expect(appPage.locator('.btn-run')).toBeEnabled({ timeout: 5000 })

  // Empty-state canvas is replaced by the flow canvas
  await expect(appPage.locator('.empty-title')).not.toBeVisible()
})
