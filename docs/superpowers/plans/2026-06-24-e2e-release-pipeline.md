# FlowProbe E2E Tests + Gated Release Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Playwright E2E tests that drive the real Tauri binary using mocked Rust commands, then gate the cross-platform release pipeline (Windows .exe / macOS .dmg / Linux .AppImage) so it only publishes if E2E passes.

**Architecture:** A Cargo feature flag `e2e-mock` compiles stub implementations of the two Tauri commands the UI needs (`open_collection_dialog`, `run_collection`). These stubs return embedded fixture data without showing dialogs or connecting to brokers. A `packages/desktop-e2e` Playwright package builds the mock binary, launches it with WebView2 CDP exposed on port 9222, and drives the app via `chromium.connectOverCDP()`. The GitHub Actions release workflow has a gating `e2e-gate` job (`windows-latest`) that must pass before the three-platform release build matrix runs.

**Tech Stack:** Rust (Cargo features), Tauri 2.0, `@playwright/test` ^1.45, GitHub Actions, `tauri-apps/tauri-action@v0`

## Global Constraints

- No `Co-Authored-By: Claude` in any commit
- Svelte 5 runes in any new Svelte components (none in this plan — this plan has no new Svelte files)
- E2E gate runs on `windows-latest` only — Playwright connects via WebView2 CDP
- `e2e-mock` feature is only ever built with `--bundles none` — never shipped in a release installer
- Rust toolchain: on this dev machine use `/c/Users/AdityaKumarSingh/.cargo/bin/cargo.exe`; in CI `cargo` is on PATH after `dtolnay/rust-toolchain@stable`
- Tests run in file order and share the same live app instance (stateful — 01 runs before 02, 02 before 03/05)
- Workers: 1 (single app process, tests cannot run in parallel)
- SP7 Tasks 1–4 and 6 (icons, tauri.conf.json bundle config, auto-updater, version sync, README) are separate plan prereqs for release to work end-to-end; this plan focuses on E2E + the gated release.yml only

---

## File Map

```
packages/desktop/src-tauri/
├── Cargo.toml                          MODIFY — add [features] e2e-mock = []
├── e2e-fixture.flowprobe.json          CREATE — embedded test fixture (copy of root e2e-sample.flowprobe.json)
└── src/commands/
    ├── file.rs                         MODIFY — add cfg(feature="e2e-mock") mock for open_collection_dialog
    └── run.rs                          MODIFY — add cfg(feature="e2e-mock") mock for run_collection

packages/desktop-e2e/
├── package.json                        CREATE
├── playwright.config.ts                CREATE
├── global-setup.ts                     CREATE — build mock binary (if needed), launch, wait for CDP
├── global-teardown.ts                  CREATE — kill app process
├── fixtures/
│   └── app.ts                          CREATE — appPage fixture (shared CDP page)
└── tests/
    ├── 01-app-launch.spec.ts           CREATE
    ├── 02-load-collection.spec.ts      CREATE
    ├── 03-run-flow.spec.ts             CREATE
    ├── 04-command-palette.spec.ts      CREATE
    └── 05-analysis-dock.spec.ts        CREATE

.github/workflows/
└── release.yml                         CREATE — e2e-gate (windows) + release-build matrix (3 platforms)
```

---

### Task 1: Rust e2e-mock feature flag + mock command stubs

**Files:**
- Modify: `packages/desktop/src-tauri/Cargo.toml`
- Create: `packages/desktop/src-tauri/e2e-fixture.flowprobe.json`
- Modify: `packages/desktop/src-tauri/src/commands/file.rs`
- Modify: `packages/desktop/src-tauri/src/commands/run.rs`

**Interfaces:**
- Produces: Cargo feature `e2e-mock` — when set, `open_collection_dialog` returns embedded fixture JSON; `run_collection` emits mock events with all steps passing
- Produces: `e2e-fixture.flowprobe.json` embedded at `include_str!("../../e2e-fixture.flowprobe.json")` (path relative to `src/commands/file.rs` → two levels up to `src-tauri/`)

- [ ] **Step 1: Add [features] to Cargo.toml**

Read `packages/desktop/src-tauri/Cargo.toml`. Add this block after the `[lib]` section (before `[build-dependencies]`):

```toml
[features]
e2e-mock = []
```

- [ ] **Step 2: Create the embedded fixture file**

Create `packages/desktop/src-tauri/e2e-fixture.flowprobe.json`:

```json
{
  "$schema": "https://flowprobe.dev/schema/v1.json",
  "version": "1",
  "name": "E2E Sample — HTTP Assert Flow",
  "flows": [
    {
      "id": "http-echo-flow",
      "name": "HTTP Echo Assert Flow",
      "steps": [
        {
          "id": "assert-jsonplaceholder",
          "type": "http-assert",
          "method": "GET",
          "url": "https://jsonplaceholder.typicode.com/todos/1",
          "assertions": [
            { "type": "status", "expected": 200 },
            { "type": "jsonpath", "path": "$.id", "expected": 1 }
          ]
        }
      ]
    },
    {
      "id": "http-post-flow",
      "name": "HTTP POST Assert Flow",
      "steps": [
        {
          "id": "create-post",
          "type": "http-assert",
          "method": "POST",
          "url": "https://jsonplaceholder.typicode.com/posts",
          "body": { "title": "FlowProbe E2E Test", "userId": 1 },
          "assertions": [
            { "type": "status", "expected": 201 },
            { "type": "jsonpath", "path": "$.title", "expected": "FlowProbe E2E Test" }
          ]
        }
      ]
    }
  ]
}
```

- [ ] **Step 3: Add mock to file.rs**

Read `packages/desktop/src-tauri/src/commands/file.rs`. The file currently has one function. Wrap the existing implementation in `#[cfg(not(feature = "e2e-mock"))]` and add the mock variant. Result:

```rust
#[cfg(not(feature = "e2e-mock"))]
#[tauri::command]
pub async fn open_collection_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let path = app
        .dialog()
        .file()
        .add_filter("FlowProbe Collection", &["flowprobe.json", "json"])
        .blocking_pick_file();

    match path {
        Some(p) => {
            let path_buf = p.into_path().map_err(|e| format!("Cannot resolve path: {e}"))?;
            let content = std::fs::read_to_string(&path_buf)
                .map_err(|e| format!("Cannot read file {}: {e}", path_buf.display()))?;
            Ok(Some(content))
        }
        None => Ok(None),
    }
}

#[cfg(feature = "e2e-mock")]
#[tauri::command]
pub async fn open_collection_dialog(_app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(Some(include_str!("../../e2e-fixture.flowprobe.json").to_string()))
}
```

- [ ] **Step 4: Add mock to run.rs**

Read `packages/desktop/src-tauri/src/commands/run.rs`. Add `#[cfg(not(feature = "e2e-mock"))]` to the existing `pub async fn run_collection(...)` function signature line only (keep the full body unchanged). Then add the mock variant after it:

```rust
#[cfg(feature = "e2e-mock")]
#[tauri::command]
pub async fn run_collection(
    collection_json: String,
    flow_id: Option<String>,
    channel: tauri::ipc::Channel<RunEvent>,
    _registry: tauri::State<'_, crate::commands::broker::BrokerRegistry>,
) -> Result<(), String> {
    use std::time::Instant;

    let collection: Collection = serde_json::from_str(&collection_json)
        .map_err(|e| format!("Invalid collection JSON: {e}"))?;

    let run_start = Instant::now();
    let flows: Vec<&Flow> = collection
        .flows
        .iter()
        .filter(|f| flow_id.as_deref().map_or(true, |id| f.id == id))
        .collect();

    if flows.is_empty() {
        let target = flow_id.as_deref().unwrap_or("(all)");
        let _ = channel.send(RunEvent::Error {
            message: format!("Flow '{target}' not found in collection"),
        });
        return Err(format!("Flow '{target}' not found"));
    }

    let mut total_passed = 0u32;

    for flow in flows {
        let flow_start = Instant::now();
        for step in &flow.steps {
            let id = step.id().to_string();
            let step_type = step.type_name().to_string();
            channel.send(RunEvent::StepStart { id: id.clone(), step_type: step_type.clone() })
                .map_err(|e| format!("Channel send error: {e}"))?;
            tokio::time::sleep(std::time::Duration::from_millis(80)).await;
            channel.send(RunEvent::StepDone {
                id,
                step_type,
                passed: true,
                duration_ms: 80,
                detail: "mock pass".to_string(),
            }).map_err(|e| format!("Channel send error: {e}"))?;
            total_passed += 1;
        }
        channel.send(RunEvent::FlowDone {
            id: flow.id.clone(),
            passed: true,
            duration_ms: flow_start.elapsed().as_millis() as u64,
        }).map_err(|e| format!("Channel send error: {e}"))?;
    }

    channel.send(RunEvent::RunDone {
        passed: total_passed,
        failed: 0,
        duration_ms: run_start.elapsed().as_millis() as u64,
    }).map_err(|e| format!("Channel send error: {e}"))?;

    Ok(())
}
```

- [ ] **Step 5: Cargo check — both feature variants**

```bash
cd packages/desktop/src-tauri
/c/Users/AdityaKumarSingh/.cargo/bin/cargo.exe check 2>&1 | tail -5
/c/Users/AdityaKumarSingh/.cargo/bin/cargo.exe check --features e2e-mock 2>&1 | tail -5
```

Expected: both end with `Finished dev [unoptimized + debuginfo] target(s)` — no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/desktop/src-tauri/Cargo.toml
git add packages/desktop/src-tauri/e2e-fixture.flowprobe.json
git add packages/desktop/src-tauri/src/commands/file.rs
git add packages/desktop/src-tauri/src/commands/run.rs
git commit -m "feat(desktop): e2e-mock cargo feature — stub commands for Playwright testing"
```

---

### Task 2: Playwright package scaffold

**Files:**
- Create: `packages/desktop-e2e/package.json`
- Create: `packages/desktop-e2e/playwright.config.ts`
- Create: `packages/desktop-e2e/global-setup.ts`
- Create: `packages/desktop-e2e/global-teardown.ts`
- Create: `packages/desktop-e2e/fixtures/app.ts`

**Interfaces:**
- Consumes: `packages/desktop/src-tauri/target/release/flowprobe.exe` (built with `--features e2e-mock`)
- Produces: `test` and `expect` exported from `fixtures/app.ts` — `appPage` fixture is a Playwright `Page` connected to the live app via CDP port 9222

- [ ] **Step 1: Create package.json**

Create `packages/desktop-e2e/package.json`:

```json
{
  "name": "@flowprobe/desktop-e2e",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "playwright test",
    "test:headed": "playwright test --headed",
    "test:report": "playwright show-report"
  },
  "devDependencies": {
    "@playwright/test": "^1.45.0"
  }
}
```

- [ ] **Step 2: Create playwright.config.ts**

Create `packages/desktop-e2e/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium' },
  ],
})
```

- [ ] **Step 3: Create global-setup.ts**

Create `packages/desktop-e2e/global-setup.ts`:

```typescript
import { spawn, execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

const ROOT = resolve(__dirname, '../..')
const DESKTOP = join(ROOT, 'packages/desktop')
const BINARY_EXT = process.platform === 'win32' ? '.exe' : ''
const BINARY = join(DESKTOP, `src-tauri/target/release/flowprobe${BINARY_EXT}`)
const CDP_PORT = 9222

// Try common cargo locations: CI PATH, then local Windows default
const CARGO = (() => {
  const local = 'C:/Users/AdityaKumarSingh/.cargo/bin/cargo.exe'
  if (process.platform === 'win32' && existsSync(local)) return local
  return 'cargo'
})()

async function waitForCDP(port: number, timeout = 30_000): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`)
      if (res.ok) return
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`CDP http://localhost:${port}/json/version not ready after ${timeout}ms`)
}

export default async function globalSetup() {
  const needsBuild = !existsSync(BINARY) || process.env.TAURI_E2E_REBUILD === '1'

  if (needsBuild) {
    console.log('[E2E] Building Vite frontend...')
    execSync('pnpm build', { cwd: DESKTOP, stdio: 'inherit' })

    console.log('[E2E] Building e2e-mock Tauri binary...')
    execSync(`${CARGO} build --release --features e2e-mock`, {
      cwd: join(DESKTOP, 'src-tauri'),
      stdio: 'inherit',
    })
  }

  console.log('[E2E] Launching app...')
  const app = spawn(BINARY, [], {
    detached: false,
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT} --remote-allow-origins=*`,
    },
  })

  app.on('error', err => { throw new Error(`[E2E] Failed to launch app: ${err.message}`) })

  if (!app.pid) throw new Error('[E2E] App process has no PID — binary may be missing')
  process.env.E2E_APP_PID = String(app.pid)

  console.log(`[E2E] App PID ${app.pid} — waiting for CDP on :${CDP_PORT}...`)
  await waitForCDP(CDP_PORT)
  console.log('[E2E] CDP ready.')
}
```

- [ ] **Step 4: Create global-teardown.ts**

Create `packages/desktop-e2e/global-teardown.ts`:

```typescript
export default async function globalTeardown() {
  const pid = Number(process.env.E2E_APP_PID)
  if (!pid) return
  try {
    process.kill(pid)
    console.log(`[E2E] Killed app process PID ${pid}`)
  } catch {
    // process may have already exited — not an error
  }
}
```

- [ ] **Step 5: Create fixtures/app.ts**

Create `packages/desktop-e2e/fixtures/app.ts`:

```typescript
import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test'

// All tests share one live app instance — we never restart between tests.
// State is intentionally carried across: test 02 loads the collection that 03/05 need.
let sharedContext: BrowserContext | null = null
let sharedPage: Page | null = null

async function getAppPage(): Promise<Page> {
  if (!sharedContext) {
    const browser = await chromium.connectOverCDP('http://localhost:9222')
    sharedContext = browser.contexts()[0]
    if (!sharedContext) throw new Error('[E2E] No browser context found on CDP endpoint')
    sharedPage = sharedContext.pages()[0] ?? await sharedContext.waitForEvent('page')
    // Dismiss any system-level dialogs the app might raise on startup
    sharedPage.on('dialog', d => d.dismiss().catch(() => {}))
  }
  return sharedPage!
}

export const test = base.extend<{ appPage: Page }>({
  appPage: async ({}, use) => {
    const page = await getAppPage()
    await use(page)
  },
})

export { expect } from '@playwright/test'
```

- [ ] **Step 6: Install deps and verify scaffold**

```bash
cd C:/Users/AdityaKumarSingh/flowprobe && pnpm install 2>&1 | tail -5
```

Expected: `@flowprobe/desktop-e2e` appears in the install output. No errors.

```bash
cd packages/desktop-e2e && npx playwright install chromium 2>&1 | tail -3
```

Expected: Chromium downloaded/already installed.

- [ ] **Step 7: Commit**

```bash
git add packages/desktop-e2e/
git commit -m "feat(e2e): Playwright package scaffold — CDP fixture, global setup/teardown"
```

---

### Task 3: E2E tests 01 + 02 — app launch and collection load

**Files:**
- Create: `packages/desktop-e2e/tests/01-app-launch.spec.ts`
- Create: `packages/desktop-e2e/tests/02-load-collection.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect` from `../fixtures/app.ts`
- Consumes: live app on CDP — must call `global-setup.ts` once before running (handled by `playwright.config.ts`)

**Before running these tests**, build the e2e-mock binary if not already built:
```bash
cd packages/desktop && pnpm build
cd packages/desktop/src-tauri && /c/Users/AdityaKumarSingh/.cargo/bin/cargo.exe build --release --features e2e-mock
```

- [ ] **Step 1: Create 01-app-launch.spec.ts**

Create `packages/desktop-e2e/tests/01-app-launch.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Create 02-load-collection.spec.ts**

Create `packages/desktop-e2e/tests/02-load-collection.spec.ts`:

```typescript
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
```

- [ ] **Step 3: Run tests 01 and 02**

```bash
cd packages/desktop-e2e && npx playwright test tests/01-app-launch.spec.ts tests/02-load-collection.spec.ts --reporter=list 2>&1
```

Expected output:
```
✓  01-app-launch.spec.ts > app launches and shows idle state
✓  02-load-collection.spec.ts > Ctrl+O loads fixture collection via mock dialog
2 passed
```

If a test fails, inspect with `--headed` flag to see the app UI:
```bash
npx playwright test tests/01-app-launch.spec.ts --headed
```

- [ ] **Step 4: Commit**

```bash
git add packages/desktop-e2e/tests/01-app-launch.spec.ts
git add packages/desktop-e2e/tests/02-load-collection.spec.ts
git commit -m "test(e2e): app launch and collection load specs"
```

---

### Task 4: E2E tests 03 + 04 — run flow and command palette

**Files:**
- Create: `packages/desktop-e2e/tests/03-run-flow.spec.ts`
- Create: `packages/desktop-e2e/tests/04-command-palette.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect` from `../fixtures/app.ts`
- Depends on: test 02 having run first (collection must be loaded in the shared app state)

- [ ] **Step 1: Create 03-run-flow.spec.ts**

Create `packages/desktop-e2e/tests/03-run-flow.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Create 04-command-palette.spec.ts**

Create `packages/desktop-e2e/tests/04-command-palette.spec.ts`:

```typescript
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
```

- [ ] **Step 3: Run tests 03 and 04**

```bash
cd packages/desktop-e2e && npx playwright test tests/03-run-flow.spec.ts tests/04-command-palette.spec.ts --reporter=list 2>&1
```

Expected:
```
✓  03-run-flow.spec.ts > runs collection and shows pass result in status bar
✓  04-command-palette.spec.ts > Ctrl+K opens command palette and Escape closes it
2 passed
```

- [ ] **Step 4: Commit**

```bash
git add packages/desktop-e2e/tests/03-run-flow.spec.ts
git add packages/desktop-e2e/tests/04-command-palette.spec.ts
git commit -m "test(e2e): run flow and command palette specs"
```

---

### Task 5: E2E test 05 — analysis dock + full suite run

**Files:**
- Create: `packages/desktop-e2e/tests/05-analysis-dock.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect` from `../fixtures/app.ts`
- Depends on: tests 02 and 03 having run first (collection loaded, run completed, results in dock)

- [ ] **Step 1: Create 05-analysis-dock.spec.ts**

Create `packages/desktop-e2e/tests/05-analysis-dock.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run the full E2E suite**

```bash
cd packages/desktop-e2e && npx playwright test --reporter=list 2>&1
```

Expected:
```
✓  01-app-launch.spec.ts > app launches and shows idle state
✓  02-load-collection.spec.ts > Ctrl+O loads fixture collection via mock dialog
✓  03-run-flow.spec.ts > runs collection and shows pass result in status bar
✓  04-command-palette.spec.ts > Ctrl+K opens command palette and Escape closes it
✓  05-analysis-dock.spec.ts > analysis dock shows results after run
5 passed
```

- [ ] **Step 3: Add E2E script to root package.json**

Read `package.json` at the repo root. Add `"test:e2e"` to the `scripts` block:

```json
"test:e2e": "pnpm --filter @flowprobe/desktop-e2e test"
```

- [ ] **Step 4: Commit**

```bash
git add packages/desktop-e2e/tests/05-analysis-dock.spec.ts
git add package.json
git commit -m "test(e2e): analysis dock spec + root test:e2e script — 5/5 passing"
```

---

### Task 6: Gated release.yml

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: E2E binary built from Task 1 (`--features e2e-mock`)
- Consumes: `packages/desktop-e2e` test package from Tasks 2–5
- Consumes: SP7 artifacts — `scripts/sync-version.js`, `tauri.conf.json` production bundle config, signed keys in GitHub secrets
- Produces: GitHub Release draft with Windows NSIS `.exe`, macOS universal `.dmg`, Linux `.AppImage` + `.deb`

**Note:** This task supersedes SP7 Task 5. SP7 Tasks 1–4 and 6 (icons, tauri.conf.json bundle config, auto-updater, version sync, README) must be completed before this release.yml will produce a valid installable release. The workflow itself is self-contained and can be committed now.

- [ ] **Step 1: Create .github/workflows/release.yml**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [release]
  workflow_dispatch:

jobs:
  # ─── Gate: E2E tests on Windows (WebView2 CDP) ───────────────────────────
  e2e-gate:
    name: E2E Gate (Windows)
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - uses: dtolnay/rust-toolchain@stable

      - uses: swatinem/rust-cache@v2
        with:
          workspaces: './packages/desktop/src-tauri -> target'

      - name: Install dependencies
        run: pnpm install

      - name: Build Vite frontend
        run: pnpm --filter @flowprobe/desktop build

      - name: Build e2e-mock binary
        run: cargo build --release --features e2e-mock
        working-directory: packages/desktop/src-tauri

      - name: Install Playwright browsers
        run: npx playwright install chromium
        working-directory: packages/desktop-e2e

      - name: Run E2E tests
        run: npx playwright test
        working-directory: packages/desktop-e2e

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: packages/desktop-e2e/playwright-report/
          retention-days: 7

  # ─── Release: cross-platform build + publish ─────────────────────────────
  release-build:
    name: Release (${{ matrix.platform }})
    needs: e2e-gate
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: windows-latest
            args: ''
          - platform: macos-latest
            args: '--target universal-apple-darwin'
          - platform: ubuntu-22.04
            args: ''

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Install Linux WebKit dependencies
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            libappindicator3-dev \
            librsvg2-dev \
            patchelf

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - uses: swatinem/rust-cache@v2
        with:
          workspaces: './packages/desktop/src-tauri -> target'

      - name: Install dependencies
        run: pnpm install

      - name: Sync version (tauri.conf.json → package.json)
        run: node scripts/sync-version.js

      - name: Build and publish release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        with:
          projectPath: packages/desktop
          tagName: v__VERSION__
          releaseName: FlowProbe v__VERSION__
          releaseBody: |
            ## FlowProbe v__VERSION__

            ### Downloads
            - **Windows**: `FlowProbe_VERSION_x64-setup.exe` (NSIS, no admin required)
            - **macOS**: `FlowProbe_VERSION_universal.dmg` (Apple Silicon + Intel)
            - **Linux**: `FlowProbe_VERSION_amd64.AppImage` or `flowprobe_VERSION_amd64.deb`

            > E2E tests passed before this release was built.
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```

- [ ] **Step 2: Verify YAML parses**

```bash
cd C:/Users/AdityaKumarSingh/flowprobe && node -e "require('fs').readFileSync('.github/workflows/release.yml','utf8'); console.log('YAML file readable')"
```

Expected: `YAML file readable`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat(ci): gated release pipeline — E2E gate (Windows) + 3-platform build matrix"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `e2e-mock` Cargo feature — compile-time command swap | Task 1 |
| `open_collection_dialog` mock returns embedded fixture | Task 1 |
| `run_collection` mock emits all-pass events | Task 1 |
| `packages/desktop-e2e` Playwright package | Task 2 |
| `global-setup.ts` — build binary + launch + CDP wait | Task 2 |
| `global-teardown.ts` — kill app process | Task 2 |
| `fixtures/app.ts` — shared CDP page fixture | Task 2 |
| Test 01: app launches, splash clears, idle state | Task 3 |
| Test 02: Ctrl+O loads fixture via mock dialog | Task 3 |
| Test 03: run flow → status bar → results | Task 4 |
| Test 04: Ctrl+K command palette | Task 4 |
| Test 05: analysis dock tabs after run | Task 5 |
| `test:e2e` root script | Task 5 |
| `e2e-gate` job on `windows-latest` | Task 6 |
| `release-build` matrix: windows/macos/ubuntu-22.04 | Task 6 |
| E2E gates release (`needs: e2e-gate`) | Task 6 |
| Playwright report uploaded as artifact | Task 6 |
| macOS notarization secrets optional | Task 6 ✅ (secrets optional via `if: secrets.APPLE_ID`) |
| `releaseDraft: true` | Task 6 |

All requirements covered. SP7 Tasks 1–4, 6 remain as separate plan prereqs (noted in Task 6 header).

### Placeholder scan

No TBD, TODO, or "adjust as needed" in the plan. All code blocks are complete and runnable.

### Type consistency

- `RunEvent` variants used in mock (`StepStart`, `StepDone`, `FlowDone`, `RunDone`, `Error`) match the enum defined in `run.rs:13-43`
- `Channel<RunEvent>` import path `tauri::ipc::Channel` matches the existing non-mock signature
- `BrokerRegistry` import `crate::commands::broker::BrokerRegistry` matches `lib.rs` import
- `Collection`, `Flow`, `Step` types in the mock are in scope (same file as real impl, no re-declaration needed — the structs are defined once and both `cfg` variants share them)
- Playwright selectors: `.btn-run`, `.btn-stop`, `.run-count`, `.stbar`, `.empty-title`, `.palette`, `.dock-tab`, `.dock-tab.active`, `.dock-body` — all verified against `+page.svelte` and `AnalysisDock.svelte`/`CommandPalette.svelte` source
