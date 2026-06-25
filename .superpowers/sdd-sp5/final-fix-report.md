# SP5 Final Fix Report

**Status:** DONE  
**Date:** 2026-06-25

## Fixes Applied

| ID | Description | File |
|----|-------------|------|
| C1 | Path traversal guard in `read_app_config` and `write_app_config` | `packages/desktop/src-tauri/src/commands/config.rs` |
| C2 | `rowCount` type coercion: `rows.length !== Number(a.expected)` | `packages/adapters/db/src/index.ts` |
| I1 | Remove double `historyStore.load()` — removed `onMount` from `HistoryTab.svelte` | `packages/desktop/src/lib/components/dock/HistoryTab.svelte` |
| I2 | `startedAt` captured at run-start: added `runStartedAt` variable, set on `startRun()`, used in `runDone` handler | `packages/desktop/src/routes/+page.svelte` |
| I4 | Replace `delete showSecrets[key]` with object spread on `$state` proxy | `packages/desktop/src/lib/components/sidebar/EnvironmentsPanel.svelte` |
| I5 | Remove unused `@flowprobe/core` from db adapter dependencies | `packages/adapters/db/package.json` |

## Verification Results

| Check | Result |
|-------|--------|
| `cargo check` | ✅ Finished dev profile in 1.42s — no errors |
| `vite build` | ✅ Built in 4.24s — static site written |
| `vitest run src/index.test.ts` | ✅ 4/4 tests passed in 625ms |
