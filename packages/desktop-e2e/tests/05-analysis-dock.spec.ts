import { test, expect } from '../fixtures/app'

test('analysis dock shows results after run', async ({ appPage }) => {
  // Results tab is active by default after a run
  const activeTab = appPage.locator('.dock-tab.active')
  await expect(activeTab).toContainText('Results', { timeout: 3000 })

  // Dock body shows PASSED badge (all mock steps pass)
  await expect(appPage.locator('.dock-body')).toContainText('PASSED')

  // Switch to Assertions tab
  await appPage.locator('.dock-tab').filter({ hasText: 'Assertions' }).click()
  await expect(appPage.locator('.dock-tab.active')).toContainText('Assertions')

  // Assertions tab lists step results
  await expect(appPage.locator('.dock-body')).toBeVisible()

  // Switch to Diff tab
  await appPage.locator('.dock-tab').filter({ hasText: 'Diff' }).click()
  await expect(appPage.locator('.dock-tab.active')).toContainText('Diff')

  // Diff tab shows "Expected vs Actual" toggle
  await expect(appPage.locator('.dock-body')).toContainText('Expected')

  // Switch to Payload tab
  await appPage.locator('.dock-tab').filter({ hasText: 'Payload' }).click()
  await expect(appPage.locator('.dock-tab.active')).toContainText('Payload')

  // Payload tab shows JSON content (step result data)
  await expect(appPage.locator('.dock-body')).toContainText('"passed"')
})
