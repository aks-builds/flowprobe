# FlowProbe: Playwright E2E Tests + Cross-Platform Release Pipeline — Design Spec

**Date:** 2026-06-24
**Status:** Approved

---

## Overview

Two tightly coupled additions: a Playwright end-to-end test suite that drives the real compiled Tauri binary using mocked Rust commands, and a GitHub Actions release pipeline that builds signed installers for Windows, macOS, and Linux — but only after E2E tests pass.

**Core constraint:** build → E2E test → publish. The release pipeline does not proceed if E2E fails.

---

## Part 1: Playwright E2E Tests

### How the mock works

A Cargo feature flag `e2e-mock` swaps the real `run_collection` and `open_collection_dialog` command implementations for stubs. The production binary is completely unaffected — only a dedicated test build compiled with `--features e2e-mock` gets the stubs.

**`open_collection_dialog` mock** — returns the contents of a bundled test fixture (`e2e-fixture.flowprobe.json`, embedded via `include_str!`) instead of showing a file picker dialog. The fixture is a copy of the existing `e2e-sample.flowprobe.json` moved into `packages/desktop/src-tauri/`.

**`run_collection` mock** — iterates the collection from the fixture JSON, emits real `StepStart`/`StepDone`/`FlowDone`/`RunDone` events over the Tauri `Channel<RunEvent>` with 80 ms delays between steps, all steps pass. This exercises the full Svelte UI state machine (idle → running → done) without any broker connectivity.

**`connect_broker` / `disconnect_broker` / `ping_broker` mocks** — no-ops that return success. The sidebar will show a connected broker without any TCP probes.

The real implementations remain in the same files under `#[cfg(not(feature = "e2e-mock"))]`. Both variants compile cleanly.

### Playwright connection (Windows CDP)

The E2E gate job runs on `windows-latest`. Tauri on Windows uses WebView2, which is Chromium-based and exposes Chrome DevTools Protocol. Playwright connects via `chromium.connectOverCDP()`.

The test binary is launched with the environment variable:
```
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 --remote-allow-origins=*
```

Playwright's global setup waits for the CDP endpoint to become available, then stores the browser connection for all tests.

No `tauri-driver`, no `xvfb`, no virtual display required on Windows.

### Package structure

```
packages/desktop-e2e/
├── package.json                  (devDep: @playwright/test)
├── playwright.config.ts          (project: chromium, globalSetup/Teardown)
├── global-setup.ts               (build e2e-mock binary if needed, launch app, wait for CDP)
├── global-teardown.ts            (kill app process by PID)
├── fixtures/
│   └── app.ts                    (test fixture: appPage — Page scoped to the app window)
└── tests/
    ├── 01-app-launch.spec.ts
    ├── 02-load-collection.spec.ts
    ├── 03-run-flow.spec.ts
    ├── 04-command-palette.spec.ts
    └── 05-analysis-dock.spec.ts

packages/desktop/src-tauri/
└── e2e-fixture.flowprobe.json    (copy of e2e-sample.flowprobe.json, embedded via include_str!)
```

### Test scenarios

**01 — App launch**
- Window appears and transitions out of splash to idle state
- Titlebar is visible (not macOS traffic-light buttons)
- Status bar shows version badge and collection count
- Canvas shows "No collection open" empty state

**02 — Load collection**
- Keyboard shortcut `Ctrl+O` triggers the mock `open_collection_dialog` command
- Collection loads: sidebar shows flow names, canvas renders step nodes
- Flow name strip appears in the canvas top bar
- Run button is enabled (no validation errors)

**03 — Run flow**
- Click "▶ Run Collection"
- Status bar transitions to "● Running…"
- Step nodes in topology canvas animate through their states
- Status bar settles to pass/fail summary (all steps pass in mock)
- Run counter badge increments to `#1`

**04 — Command palette**
- `Ctrl+K` opens the command palette modal
- Typing a flow name filters the list
- Pressing Enter navigates to the flow
- `Escape` closes without navigating

**05 — Analysis dock**
- After run (from test 03), Results tab shows PASSED badge and step cards
- Clicking Assertions tab shows per-step assertion rows
- Clicking a topology node switches dock to Assertions tab scoped to that node
- Diff tab shows Expected vs Actual columns populated

### Build command for E2E binary

```bash
cd packages/desktop
npx tauri build --features e2e-mock --bundles none
```

Produces: `packages/desktop/src-tauri/target/release/flowprobe.exe` (Windows), `.../flowprobe` (Linux/macOS).

The `global-setup.ts` builds the binary if it does not exist, or if `TAURI_E2E_REBUILD=1` is set.

---

## Part 2: Release Pipeline

### Trigger

Push to the `release` branch, or manual `workflow_dispatch`.

### Pipeline shape

```
Job: e2e-gate  (windows-latest)
│  1. Install deps (pnpm install, Rust stable, Node 22)
│  2. Build e2e-mock binary (--features e2e-mock --bundles none)
│  3. Run Playwright tests (npx playwright test)
│  4. Upload Playwright HTML report as artifact
│  5. ← GATE: subsequent jobs only run if this succeeds
│
└──▶ Job: release-build  (matrix: windows-latest / macos-latest / ubuntu-22.04)
      1. Install deps
      2. Run scripts/sync-version.js (tauri.conf.json → package.json)
      3. tauri-apps/tauri-action@v0  (builds + signs + creates GitHub Release)
         Windows:  NSIS .exe (embedBootstrapper, currentUser install)
         macOS:    universal .dmg (aarch64 + x86_64, notarization via Apple secrets)
         Linux:    .AppImage + .deb (libwebkit2gtk-4.1-0 deps pre-installed)
      4. GitHub Release draft auto-published (releaseDraft: false after gate)
```

### GitHub secrets required

| Secret | Purpose | Platform |
|--------|---------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | Update signing key | All |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Signing key password | All |
| `APPLE_ID` | Notarization login | macOS only |
| `APPLE_PASSWORD` | App-specific password | macOS only |
| `APPLE_TEAM_ID` | Developer Team ID | macOS only |

macOS notarization secrets are optional — if absent, `tauri-action` skips notarization (app installs but shows Gatekeeper warning on first run).

### Integration with SP7 plan

SP7 already has a detailed implementation plan for the release pipeline tasks (icons, tauri.conf.json bundle config, auto-updater, version sync script, release.yml). This design replaces SP7's `release.yml` with the gated version that adds the `e2e-gate` job as a prerequisite. All other SP7 tasks (Tasks 1–4, 6) remain unchanged.

SP7 Task 5 (release.yml) is superseded by this spec.

---

## File map (new files only)

```
packages/desktop-e2e/
├── package.json
├── playwright.config.ts
├── global-setup.ts
├── global-teardown.ts
├── fixtures/app.ts
└── tests/
    ├── 01-app-launch.spec.ts
    ├── 02-load-collection.spec.ts
    ├── 03-run-flow.spec.ts
    ├── 04-command-palette.spec.ts
    └── 05-analysis-dock.spec.ts

packages/desktop/src-tauri/
├── e2e-fixture.flowprobe.json    (new — embedded test fixture)
└── src/commands/
    ├── run.rs                    (modify — add #[cfg(feature="e2e-mock")] stub)
    └── file.rs                   (modify — add #[cfg(feature="e2e-mock")] stub)

packages/desktop/src-tauri/Cargo.toml
  (modify — add [features] table: e2e-mock = [])

.github/workflows/release.yml     (create — replaces SP7 Task 5)
```

Root `package.json` scripts:
- `"test:e2e"`: `"pnpm --filter @flowprobe/desktop-e2e test"` — run E2E locally

---

## Dependencies

| Package | Where | Purpose |
|---------|-------|---------|
| `@playwright/test` | `packages/desktop-e2e` devDep | Test runner + CDP connection |
| Cargo feature `e2e-mock` | `packages/desktop/src-tauri` | Compile-time command swapping |
| `include_str!` macro | Rust (stdlib) | Embed fixture JSON in test binary |

No new runtime dependencies. The `tauri-driver` binary is not used.

---

## Constraints

- No `Co-Authored-By: Claude` in any commit
- Svelte 5 runes in any new Svelte components
- `e2e-mock` binary is never bundled into a release — `--features e2e-mock` is only ever used with `--bundles none`
- The `include_str!` path in `file.rs` is `"../../e2e-fixture.flowprobe.json"` — two levels up from `src/commands/` to `src-tauri/`
- Windows E2E gate: `windows-latest` runner only (WebView2 CDP requirement)
- Release build matrix: `windows-latest`, `macos-latest`, `ubuntu-22.04`
