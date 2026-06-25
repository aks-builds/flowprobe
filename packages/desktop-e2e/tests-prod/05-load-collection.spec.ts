import { test, expect } from '../fixtures/app-prod'
import { readFileSync } from 'fs'
import { resolve } from 'path'

test('loads collection via window.__fp_inject scripting helper', async ({ appPage }) => {
  const collectionJson = readFileSync(
    resolve(__dirname, '../../../e2e-sample.flowprobe.json'),
    'utf8'
  )

  // Use the production scripting helper exposed on window to load a collection
  // without triggering the native file dialog (which can't be automated in CDP mode).
  // This helper is also useful for power-user scripting and CLI integration.
  await appPage.evaluate((json: string) => {
    (window as any).__fp_inject(json)
  }, collectionJson)

  // Collection loads into the status bar
  await expect(appPage.locator('.stbar')).toContainText('1 collection', { timeout: 5000 })

  // Empty canvas is replaced
  await expect(appPage.locator('.empty-title')).not.toBeVisible({ timeout: 3000 })

  // Run button becomes enabled (valid flow + no validation errors)
  await expect(appPage.locator('.btn-run')).toBeEnabled({ timeout: 3000 })
})
