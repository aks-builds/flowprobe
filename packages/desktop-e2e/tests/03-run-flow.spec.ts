import { test, expect } from '../fixtures/app'

test('runs collection and shows pass result in status bar', async ({ appPage }) => {
  // Click the run button (collection was loaded in test 02)
  await appPage.locator('.btn-run').click()

  // Running indicator appears in status bar
  await expect(appPage.locator('.stbar')).toContainText('Running', { timeout: 5000 })

  // Stop button replaces run button during run
  await expect(appPage.locator('.btn-stop')).toBeVisible({ timeout: 5000 })

  // Wait for run to complete — mock emits events with 80ms per step
  // Fixture has 2 flows × 1 step each = 2 steps × 80ms ≈ 160ms + channel overhead
  await expect(appPage.locator('.stbar')).toContainText('passed', { timeout: 10_000 })

  // Running indicator is gone
  await expect(appPage.locator('.stbar')).not.toContainText('Running…')

  // Run counter shows #1 (first run)
  await expect(appPage.locator('.run-count')).toContainText('#1')
})
