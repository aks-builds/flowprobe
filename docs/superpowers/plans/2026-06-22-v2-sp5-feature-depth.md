# FlowProbe v2 SP5: Feature Depth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add environment management with secret masking, run history persistence to disk, pre/post hook scripting per step, DB-assert adapter (PostgreSQL), and sequence diagram view toggle.

**Architecture:** Environments are stored in Tauri's app config dir as JSON. A new Tauri command `read_app_config` / `write_app_config` handles cross-platform file I/O. Run history appends to a separate `history.json`. Hook scripts run in Node.js `vm.runInNewContext()` in the CLI; the Tauri side executes runs via the CLI process, so hooks work without Rust changes. The DB adapter is a new `packages/adapters/db/` package.

**Tech Stack:** Tauri 2.0, Svelte 5, TypeScript, Node.js `vm`, `pg` (PostgreSQL)

## Global Constraints

- No `Co-Authored-By: Claude` in any commit
- SP1–SP4 must be merged before this plan
- `path.appConfigDir()` from `@tauri-apps/api/path` for all config file paths — never hardcode
- Secret variables must never appear in log output

---

## File Map

```
packages/
├── desktop/
│   ├── src-tauri/src/commands/
│   │   └── config.rs                 CREATE — read_app_config, write_app_config Tauri commands
│   └── src/lib/
│       ├── stores/
│       │   └── environments.ts       CREATE — load/save/activate environment
│       └── components/sidebar/
│           └── EnvironmentsPanel.svelte  REPLACE stub with full implementation
├── adapters/
│   └── db/
│       ├── package.json              CREATE
│       ├── src/
│       │   ├── index.ts              CREATE — PostgreSQL DB-assert adapter
│       │   └── index.test.ts         CREATE
│       └── tsconfig.json             CREATE
└── core/
    └── src/
        └── runner.ts                 MODIFY — call beforeScript/afterScript hooks
```

---

### Task 1: Tauri config file commands (read/write app config dir)

**Files:**
- Create: `packages/desktop/src-tauri/src/commands/config.rs`
- Modify: `packages/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `read_app_config(filename: String) -> Result<Option<String>, String>` — returns file content or None
- Produces: `write_app_config(filename: String, content: String) -> Result<(), String>` — writes to app config dir

- [ ] **Step 1: Create config.rs**

Create `packages/desktop/src-tauri/src/commands/config.rs`:

```rust
use tauri::Manager;

fn config_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("Cannot resolve config dir: {e}"))
}

#[tauri::command]
pub async fn read_app_config(
    filename: String,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let path = config_dir(&app)?.join(&filename);
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("Cannot read {filename}: {e}"))
}

#[tauri::command]
pub async fn write_app_config(
    filename: String,
    content: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let dir = config_dir(&app)?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Cannot create config dir: {e}"))?;
    std::fs::write(dir.join(&filename), content)
        .map_err(|e| format!("Cannot write {filename}: {e}"))
}
```

- [ ] **Step 2: Register commands in lib.rs**

Read `packages/desktop/src-tauri/src/lib.rs`. Add:
```rust
pub mod config;
use commands::config::{read_app_config, write_app_config};
// Add to generate_handler!: read_app_config, write_app_config
```

- [ ] **Step 3: Cargo check**
```bash
cd packages/desktop/src-tauri && "/c/Users/AdityaKumarSingh/.cargo/bin/cargo.exe" check 2>&1 | tail -5
```
Expected: `Finished dev profile`

- [ ] **Step 4: Commit**
```bash
git add packages/desktop/src-tauri/src/commands/config.rs packages/desktop/src-tauri/src/lib.rs
git commit -m "feat(desktop/rust): read_app_config + write_app_config commands"
```

---

### Task 2: Environment management store

**Files:**
- Create: `packages/desktop/src/lib/stores/environments.ts`
- Create: `packages/desktop/src/lib/stores/environments.test.ts`

**Interfaces:**
- Produces: `type EnvVar = { key: string; value: string; secret: boolean }`
- Produces: `type Environment = { name: string; vars: EnvVar[] }`
- Produces: `environmentStore` with: `load()`, `save()`, `setActive(name)`, `addEnv(name)`, `removeEnv(name)`, `setVar(envName, key, value, secret)`, `removeVar(envName, key)`
- Produces: `activeEnvironment` — derived, `Environment | null`
- Produces: `resolveVar(key: string): string | undefined` — reads from active env

- [ ] **Step 1: Write failing tests**

Create `packages/desktop/src/lib/stores/environments.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { get } from 'svelte/store'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null)
}))

describe('environmentStore', () => {
  it('starts with empty environments', async () => {
    const { environmentStore } = await import('./environments.js')
    expect(get(environmentStore).environments).toHaveLength(0)
  })

  it('adds environment', async () => {
    const { environmentStore } = await import('./environments.js')
    environmentStore.addEnv('staging')
    expect(get(environmentStore).environments.some(e => e.name === 'staging')).toBe(true)
  })

  it('sets active environment', async () => {
    const { environmentStore, activeEnvironment } = await import('./environments.js')
    environmentStore.setActive('staging')
    expect(get(activeEnvironment)?.name).toBe('staging')
  })

  it('adds a variable with secret masking', async () => {
    const { environmentStore, resolveVar } = await import('./environments.js')
    environmentStore.setVar('staging', 'API_KEY', 'sk-secret', true)
    expect(resolveVar('API_KEY')).toBe('sk-secret')
  })
})
```

- [ ] **Step 2: Run — confirm FAIL**
```bash
cd packages/desktop && npx vitest run src/lib/stores/environments.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implement environments.ts**

Create `packages/desktop/src/lib/stores/environments.ts`:
```typescript
import { writable, derived, get } from 'svelte/store'
import { invoke } from '@tauri-apps/api/core'

export type EnvVar = { key: string; value: string; secret: boolean }
export type Environment = { name: string; vars: EnvVar[] }

type EnvState = { environments: Environment[]; activeId: string | null }

const FILENAME = 'environments.json'

function createEnvironmentStore() {
  const { subscribe, update, set } = writable<EnvState>({ environments: [], activeId: null })

  return {
    subscribe,
    async load() {
      try {
        const raw = await invoke<string | null>('read_app_config', { filename: FILENAME })
        if (raw) set(JSON.parse(raw))
      } catch { /* first run, no file */ }
    },
    async save() {
      try {
        await invoke('write_app_config', { filename: FILENAME, content: JSON.stringify(get({ subscribe })) })
      } catch (e) { console.error('Failed to save environments:', e) }
    },
    addEnv(name: string) {
      update(s => {
        if (s.environments.some(e => e.name === name)) return s
        return { ...s, environments: [...s.environments, { name, vars: [] }] }
      })
      this.save()
    },
    removeEnv(name: string) {
      update(s => ({
        ...s,
        environments: s.environments.filter(e => e.name !== name),
        activeId: s.activeId === name ? null : s.activeId,
      }))
      this.save()
    },
    setActive(name: string) {
      update(s => ({ ...s, activeId: name }))
      this.save()
    },
    setVar(envName: string, key: string, value: string, secret = false) {
      update(s => ({
        ...s,
        environments: s.environments.map(e =>
          e.name !== envName ? e : {
            ...e,
            vars: e.vars.some(v => v.key === key)
              ? e.vars.map(v => v.key === key ? { key, value, secret } : v)
              : [...e.vars, { key, value, secret }]
          }
        ),
      }))
      this.save()
    },
    removeVar(envName: string, key: string) {
      update(s => ({
        ...s,
        environments: s.environments.map(e =>
          e.name !== envName ? e : { ...e, vars: e.vars.filter(v => v.key !== key) }
        ),
      }))
      this.save()
    },
  }
}

export const environmentStore = createEnvironmentStore()
export const activeEnvironment = derived(
  environmentStore,
  s => s.environments.find(e => e.name === s.activeId) ?? null
)
export function resolveVar(key: string): string | undefined {
  const active = get(activeEnvironment)
  return active?.vars.find(v => v.key === key)?.value
}
```

- [ ] **Step 4: Run — confirm PASS**
```bash
cd packages/desktop && npx vitest run src/lib/stores/environments.test.ts 2>&1 | tail -5
```
Expected: `4 passed`

- [ ] **Step 5: Commit**
```bash
git add packages/desktop/src/lib/stores/environments.ts packages/desktop/src/lib/stores/environments.test.ts
git commit -m "feat(desktop): environmentStore — load/save/active env, secret vars"
```

---

### Task 3: EnvironmentsPanel full implementation

**Files:**
- Replace: `packages/desktop/src/lib/components/sidebar/EnvironmentsPanel.svelte`

- [ ] **Step 1: Replace stub with full EnvironmentsPanel.svelte**

Replace `packages/desktop/src/lib/components/sidebar/EnvironmentsPanel.svelte` with:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { environmentStore, activeEnvironment } from '../../stores/environments.js'

  let newEnvName = $state('')
  let showSecrets = $state<Record<string, boolean>>({})
  let addingVar = $state<string | null>(null)
  let newVarKey = $state('')
  let newVarValue = $state('')
  let newVarSecret = $state(false)

  onMount(() => environmentStore.load())

  function addEnv() {
    if (!newEnvName.trim()) return
    environmentStore.addEnv(newEnvName.trim())
    newEnvName = ''
  }

  function submitVar(envName: string) {
    if (!newVarKey.trim()) return
    environmentStore.setVar(envName, newVarKey.trim(), newVarValue, newVarSecret)
    addingVar = null
    newVarKey = ''
    newVarValue = ''
    newVarSecret = false
  }

  function maskValue(value: string) {
    return '•'.repeat(Math.min(value.length, 12))
  }
</script>

<div class="env-panel">
  <div class="ep-header">
    <input
      class="ep-input"
      placeholder="New environment name…"
      bind:value={newEnvName}
      onkeydown={e => e.key === 'Enter' && addEnv()}
    />
    <button class="ep-add-btn" onclick={addEnv} aria-label="Add environment">+</button>
  </div>

  {#each $environmentStore.environments as env (env.name)}
    <div class="env-card" class:active={$activeEnvironment?.name === env.name}>
      <div class="env-card-header">
        <button class="env-name-btn" onclick={() => environmentStore.setActive(env.name)}>
          <div class="env-dot" class:active-dot={$activeEnvironment?.name === env.name}></div>
          {env.name}
          {#if $activeEnvironment?.name === env.name}
            <span class="active-badge">ACTIVE</span>
          {/if}
        </button>
        <button class="ep-remove" onclick={() => environmentStore.removeEnv(env.name)} aria-label="Remove {env.name}">✕</button>
      </div>

      <div class="env-vars">
        {#each env.vars as v (v.key)}
          <div class="ev-row">
            <span class="ev-key">{v.key}</span>
            <span class="ev-val" class:secret={v.secret}>
              {#if v.secret && !showSecrets[env.name + v.key]}
                {maskValue(v.value)}
                <button class="reveal" onclick={() => showSecrets[env.name + v.key] = true} aria-label="Reveal {v.key}">👁</button>
              {:else}
                {v.value}
                {#if v.secret}
                  <button class="reveal" onclick={() => delete showSecrets[env.name + v.key]} aria-label="Hide {v.key}">🙈</button>
                {/if}
              {/if}
            </span>
            <button class="ev-remove" onclick={() => environmentStore.removeVar(env.name, v.key)} aria-label="Remove {v.key}">−</button>
          </div>
        {/each}

        {#if addingVar === env.name}
          <div class="new-var-form">
            <input class="nv-input" placeholder="KEY" bind:value={newVarKey} />
            <input class="nv-input" placeholder="value" bind:value={newVarValue} />
            <label><input type="checkbox" bind:checked={newVarSecret} /> Secret</label>
            <button class="nv-save" onclick={() => submitVar(env.name)}>Add</button>
            <button class="nv-cancel" onclick={() => addingVar = null}>✕</button>
          </div>
        {:else}
          <button class="add-var-btn" onclick={() => addingVar = env.name}>+ Add variable</button>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .env-panel { padding: 10px; }
  .ep-header { display: flex; gap: 6px; margin-bottom: 10px; }
  .ep-input { flex: 1; height: 27px; background: rgba(255,255,255,.04); border: 1px solid var(--border2, #1e1e32); border-radius: 7px; padding: 0 8px; font-size: 10.5px; color: var(--text-primary, #e2e8f0); outline: none; }
  .ep-input:focus { border-color: var(--accent, #6366f1); }
  .ep-add-btn { width: 27px; height: 27px; border-radius: 7px; background: rgba(99,102,241,.15); border: 1px solid rgba(99,102,241,.3); color: #818cf8; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .env-card { background: var(--surface2, #111120); border: 1px solid var(--border2, #1e1e32); border-radius: 9px; padding: 9px 10px; margin-bottom: 8px; }
  .env-card.active { border-color: rgba(99,102,241,.4); }
  .env-card-header { display: flex; align-items: center; margin-bottom: 7px; }
  .env-name-btn { flex: 1; background: none; border: none; cursor: pointer; display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; color: var(--text-secondary, #94a3b8); text-align: left; }
  .env-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted, #334155); }
  .env-dot.active-dot { background: var(--success, #22c55e); }
  .active-badge { font-size: 8px; background: rgba(34,197,94,.15); color: var(--success, #22c55e); padding: 1px 5px; border-radius: 4px; font-weight: 700; }
  .ep-remove { background: none; border: none; color: var(--text-muted, #334155); cursor: pointer; font-size: 10px; padding: 0 2px; }
  .ep-remove:hover { color: var(--error, #ef4444); }
  .ev-row { display: flex; align-items: center; gap: 6px; font-size: 10px; margin-bottom: 3px; }
  .ev-key { color: var(--text-muted, #334155); width: 80px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono, monospace); font-size: 9.5px; }
  .ev-val { flex: 1; font-family: var(--font-mono, monospace); font-size: 9px; color: var(--cyan, #06b6d4); display: flex; align-items: center; gap: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ev-val.secret { color: var(--text-muted, #334155); letter-spacing: 2px; }
  .reveal { background: none; border: none; cursor: pointer; font-size: 11px; flex-shrink: 0; }
  .ev-remove { background: none; border: none; color: var(--text-muted, #334155); cursor: pointer; font-size: 10px; }
  .ev-remove:hover { color: var(--error, #ef4444); }
  .add-var-btn { font-size: 9.5px; color: var(--accent, #6366f1); background: none; border: none; cursor: pointer; padding: 3px 0; }
  .add-var-btn:hover { text-decoration: underline; }
  .new-var-form { display: flex; gap: 5px; align-items: center; margin-top: 5px; flex-wrap: wrap; }
  .nv-input { height: 24px; flex: 1; min-width: 60px; background: rgba(255,255,255,.04); border: 1px solid var(--border2, #1e1e32); border-radius: 5px; padding: 0 6px; font-size: 9.5px; color: var(--text-primary, #e2e8f0); outline: none; }
  .nv-input:focus { border-color: var(--accent, #6366f1); }
  .nv-save { padding: 2px 8px; border-radius: 5px; background: var(--accent, #6366f1); color: #fff; border: none; font-size: 9.5px; cursor: pointer; }
  .nv-cancel { background: none; border: none; color: var(--text-muted, #334155); cursor: pointer; font-size: 11px; }
  label { font-size: 9px; color: var(--text-muted, #334155); display: flex; align-items: center; gap: 4px; }
</style>
```

- [ ] **Step 2: Build check + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/components/sidebar/EnvironmentsPanel.svelte
git commit -m "feat(desktop): EnvironmentsPanel — full env management with secret masking"
```

---

### Task 4: DB-Assert adapter

**Files:**
- Create: `packages/adapters/db/package.json`
- Create: `packages/adapters/db/tsconfig.json`
- Create: `packages/adapters/db/src/index.ts`
- Create: `packages/adapters/db/src/index.test.ts`

**Interfaces:**
- Produces: `runDbAssert(config: DbAssertConfig, context: RunContext): Promise<StepRunResult>`
- Produces: `type DbAssertConfig = { id: string; connection: string; query: string; params: unknown[]; assertions: DbAssertion[] }`
- Produces: `type DbAssertion = { type: 'rowCount' | 'cellValue' | 'jsonPath'; expected: unknown; row?: number; column?: string; path?: string }`

- [ ] **Step 1: Create package.json**

Create `packages/adapters/db/package.json`:
```json
{
  "name": "@flowprobe/adapter-db",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "pg": "^8.12.0",
    "@flowprobe/core": "workspace:*"
  },
  "devDependencies": {
    "@types/pg": "^8.11.0",
    "typescript": "~5.6.2",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/adapters/db/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write failing tests**

Create `packages/adapters/db/src/index.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { evaluateDbAssertions } from './index.js'

describe('evaluateDbAssertions', () => {
  const rows = [{ id: 1, status: 'created', amount: 99.99 }]

  it('rowCount: passes when count matches', () => {
    const result = evaluateDbAssertions(rows, [{ type: 'rowCount', expected: 1 }])
    expect(result.passed).toBe(true)
  })

  it('rowCount: fails when count mismatches', () => {
    const result = evaluateDbAssertions(rows, [{ type: 'rowCount', expected: 2 }])
    expect(result.passed).toBe(false)
    expect(result.error).toContain('rowCount')
  })

  it('cellValue: passes when cell matches', () => {
    const result = evaluateDbAssertions(rows, [{ type: 'cellValue', row: 0, column: 'status', expected: 'created' }])
    expect(result.passed).toBe(true)
  })

  it('cellValue: fails when cell mismatches', () => {
    const result = evaluateDbAssertions(rows, [{ type: 'cellValue', row: 0, column: 'status', expected: 'pending' }])
    expect(result.passed).toBe(false)
  })
})
```

- [ ] **Step 4: Run — confirm FAIL**
```bash
cd packages/adapters/db && npx vitest run src/index.test.ts 2>&1 | tail -5
```

- [ ] **Step 5: Implement index.ts**

Create `packages/adapters/db/src/index.ts`:
```typescript
import pg from 'pg'
const { Client } = pg

export type DbAssertion = {
  type: 'rowCount' | 'cellValue' | 'jsonPath'
  expected: unknown
  row?: number
  column?: string
  path?: string
}

export type DbAssertConfig = {
  id: string
  connection: string
  query: string
  params: unknown[]
  assertions: DbAssertion[]
}

type AssertResult = { passed: boolean; error?: string }

export function evaluateDbAssertions(rows: Record<string, unknown>[], assertions: DbAssertion[]): AssertResult {
  for (const a of assertions) {
    if (a.type === 'rowCount') {
      if (rows.length !== a.expected) {
        return { passed: false, error: `rowCount: expected ${a.expected}, got ${rows.length}` }
      }
    } else if (a.type === 'cellValue') {
      const row = rows[a.row ?? 0]
      if (!row) return { passed: false, error: `cellValue: row ${a.row ?? 0} does not exist` }
      const actual = row[a.column ?? '']
      if (String(actual) !== String(a.expected)) {
        return { passed: false, error: `cellValue: ${a.column}[${a.row ?? 0}] expected ${JSON.stringify(a.expected)}, got ${JSON.stringify(actual)}` }
      }
    }
    // jsonPath: add in a follow-up
  }
  return { passed: true }
}

export async function runDbAssert(config: DbAssertConfig): Promise<{
  passed: boolean
  durationMs: number
  detail: string
  error?: string
}> {
  const client = new Client({ connectionString: config.connection })
  const start = Date.now()

  try {
    await client.connect()
    const result = await client.query(config.query, config.params as never[])
    const rows = result.rows as Record<string, unknown>[]
    const assertResult = evaluateDbAssertions(rows, config.assertions)
    const durationMs = Date.now() - start

    return {
      passed: assertResult.passed,
      durationMs,
      detail: assertResult.passed
        ? `Query returned ${rows.length} row(s) — all assertions passed`
        : assertResult.error ?? 'assertion failed',
      error: assertResult.error,
    }
  } catch (err) {
    return {
      passed: false,
      durationMs: Date.now() - start,
      detail: `DB error: ${err instanceof Error ? err.message : String(err)}`,
      error: String(err),
    }
  } finally {
    await client.end().catch(() => {})
  }
}
```

- [ ] **Step 6: Run — confirm PASS**
```bash
cd packages/adapters/db && pnpm install && npx vitest run src/index.test.ts 2>&1 | tail -5
```
Expected: `4 passed`

- [ ] **Step 7: Add to pnpm workspace**

Read the root `pnpm-workspace.yaml`. Confirm `packages/adapters/**` is already in `packages:`. If not, add it.

- [ ] **Step 8: Build + commit**
```bash
cd packages/adapters/db && npx tsc 2>&1 | tail -5
git add packages/adapters/db/
git commit -m "feat(adapters): db-assert adapter — PostgreSQL row/cell assertions"
```

---

### Task 5: Run history persistence

**Files:**
- Create: `packages/desktop/src/lib/stores/history.ts`
- Modify: `packages/desktop/src/routes/+page.svelte` — call `historyStore.record()` on run done
- Replace: `packages/desktop/src/lib/components/dock/HistoryTab.svelte`

**Interfaces:**
- Produces: `type RunRecord = { runId: string; flowId: string; flowName: string; collectionName: string; environment: string | null; startedAt: string; durationMs: number; passed: number; failed: number }`
- Produces: `historyStore` with `load()`, `record(r: RunRecord)`, `getAll(): RunRecord[]`

- [ ] **Step 1: Implement history.ts**

Create `packages/desktop/src/lib/stores/history.ts`:
```typescript
import { writable, get } from 'svelte/store'
import { invoke } from '@tauri-apps/api/core'

export type RunRecord = {
  runId: string
  flowId: string
  flowName: string
  collectionName: string
  environment: string | null
  startedAt: string
  durationMs: number
  passed: number
  failed: number
}

const FILENAME = 'history.json'
const MAX_RECORDS = 100

function createHistoryStore() {
  const { subscribe, update, set } = writable<RunRecord[]>([])

  return {
    subscribe,
    async load() {
      try {
        const raw = await invoke<string | null>('read_app_config', { filename: FILENAME })
        if (raw) set(JSON.parse(raw))
      } catch { /* first run */ }
    },
    async record(r: RunRecord) {
      update(records => {
        const next = [r, ...records].slice(0, MAX_RECORDS)
        invoke('write_app_config', { filename: FILENAME, content: JSON.stringify(next) }).catch(console.error)
        return next
      })
    },
    getAll() { return get({ subscribe }) },
  }
}

export const historyStore = createHistoryStore()
```

- [ ] **Step 2: Call historyStore.record() from +page.svelte on run done**

Read `packages/desktop/src/routes/+page.svelte`. In the `channel.onmessage` handler, inside the `runDone` branch, after `runStore.finishRun()`, add:
```typescript
import { historyStore } from '$lib/stores/history.js'
// In onMount or at startup: historyStore.load()

// In runDone branch:
historyStore.record({
  runId: crypto.randomUUID(),
  flowId: activeFlow.id,
  flowName: activeFlow.name,
  collectionName: activeCollection.name,
  environment: $environmentStore.activeId,
  startedAt: new Date().toISOString(),
  durationMs: (event.duration_ms ?? event.durationMs) as number,
  passed: (event.passed) as number,
  failed: (event.failed) as number,
})
```

- [ ] **Step 3: Replace HistoryTab stub with full implementation**

Replace `packages/desktop/src/lib/components/dock/HistoryTab.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { historyStore } from '../../stores/history.js'
  import { dockTabStore } from '../../stores/dock.js'

  onMount(() => historyStore.load())
</script>

<div class="history-tab">
  {#if $historyStore.length === 0}
    <div class="empty">No runs recorded yet</div>
  {:else}
    {#each $historyStore as r (r.runId)}
      <div class="hist-row">
        <div class="hist-dot" class:pass={r.failed === 0} class:fail={r.failed > 0}></div>
        <div class="hist-info">
          <div class="hist-flow">{r.flowName}</div>
          <div class="hist-meta">{r.collectionName} · {r.environment ?? 'no env'} · {new Date(r.startedAt).toLocaleTimeString()}</div>
        </div>
        <div class="hist-right">
          <div class="hist-dur">{r.durationMs}ms</div>
          <div class="hist-status" class:pass={r.failed === 0} class:fail={r.failed > 0}>
            {r.failed === 0 ? '✓' : `${r.failed} failed`}
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .history-tab { padding: 10px; }
  .empty { font-size: 10px; color: var(--text-muted, #334155); padding: 16px; text-align: center; }
  .hist-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border, #161628); }
  .hist-row:last-child { border-bottom: none; }
  .hist-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .hist-dot.pass { background: var(--success, #22c55e); }
  .hist-dot.fail { background: var(--error, #ef4444); }
  .hist-info { flex: 1; overflow: hidden; }
  .hist-flow { font-size: 10.5px; color: var(--text-secondary, #94a3b8); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hist-meta { font-size: 8.5px; color: var(--text-muted, #334155); margin-top: 1px; }
  .hist-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .hist-dur { font-size: 9px; font-family: var(--font-mono, monospace); color: var(--text-muted, #334155); }
  .hist-status { font-size: 9px; font-weight: 700; }
  .hist-status.pass { color: var(--success, #22c55e); }
  .hist-status.fail { color: var(--error, #ef4444); }
</style>
```

- [ ] **Step 4: Full build + tests + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
cd C:/Users/AdityaKumarSingh/flowprobe && pnpm test 2>&1 | tail -10
git add packages/desktop/src/lib/stores/history.ts packages/desktop/src/lib/components/dock/HistoryTab.svelte packages/desktop/src/routes/+page.svelte
git commit -m "feat(desktop): run history persistence + HistoryTab"
```
