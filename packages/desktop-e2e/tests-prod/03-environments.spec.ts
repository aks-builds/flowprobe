import { test, expect } from '../fixtures/app-prod'

test('environments panel — create env, add secret variable, reveal and hide', async ({ appPage }) => {
  // Navigate to Environments tab
  await appPage.locator('.tb-tab').filter({ hasText: 'Environments' }).click()

  // Type new env name and press Enter
  const envInput = appPage.locator('.ep-input')
  await expect(envInput).toBeVisible({ timeout: 3000 })
  await envInput.fill('staging')
  await envInput.press('Enter')

  // A new env card with "staging" appears
  const envCard = appPage.locator('.env-card').filter({ hasText: 'staging' })
  await expect(envCard).toBeVisible({ timeout: 3000 })

  // Click the env name button to activate it
  await envCard.locator('.env-name-btn').click()
  // ACTIVE badge appears
  await expect(envCard.locator('.active-badge')).toContainText('ACTIVE', { timeout: 2000 })

  // Click "+ Add variable" button on the staging env card
  await envCard.locator('.add-var-btn').click()

  // Fill in key, value, check Secret checkbox, click Add
  const newVarForm = envCard.locator('.new-var-form')
  await expect(newVarForm).toBeVisible({ timeout: 2000 })
  await newVarForm.locator('.nv-input[placeholder="KEY"]').fill('API_KEY')
  await newVarForm.locator('.nv-input[placeholder="value"]').fill('test-value-123')
  await newVarForm.locator('input[type="checkbox"]').check()
  await newVarForm.locator('.nv-save').click()

  // Variable row appears — locate by key label
  const evRow = envCard.locator('.ev-row').filter({ has: appPage.locator('.ev-key', { hasText: 'API_KEY' }) })
  await expect(evRow).toBeVisible({ timeout: 3000 })

  // Value should NOT show the plain text — it's masked with dots
  const evVal = evRow.locator('.ev-val')
  await expect(evVal).not.toContainText('test-value-123', { timeout: 2000 })
  // Masked dots should be present (bullet characters)
  await expect(evVal).toContainText('•')

  // Click 👁 to reveal
  await evRow.locator('button[aria-label="Reveal API_KEY"]').click()
  await expect(evVal).toContainText('test-value-123', { timeout: 2000 })

  // Click 🙈 to hide again
  await evRow.locator('button[aria-label="Hide API_KEY"]').click()
  await expect(evVal).not.toContainText('test-value-123', { timeout: 2000 })
  await expect(evVal).toContainText('•')
})
