import { test, expect } from '../fixtures/app-prod'
import { execSync } from 'child_process'
import { resolve } from 'path'

test('loads collection via Ctrl+O file dialog', async ({ appPage }) => {
  const collectionPath = resolve(__dirname, '../../../e2e-sample.flowprobe.json')
    .replace(/\//g, '\\')  // Windows path separators

  await appPage.keyboard.press('Control+o')
  await appPage.waitForTimeout(1500)  // wait for OS dialog

  // Drive the Windows file dialog with SendKeys
  execSync(
    `powershell -NonInteractive -Command "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys('${collectionPath}'); Start-Sleep -Milliseconds 500; $wsh.SendKeys('~')"`,
    { timeout: 10000 }
  )

  // Collection loads into status bar
  await expect(appPage.locator('.stbar')).toContainText('1 collection', { timeout: 8000 })
  await expect(appPage.locator('.empty-title')).not.toBeVisible({ timeout: 5000 })
})
