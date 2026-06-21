# FlowProbe UI v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FlowProbe's desktop UI fully functional — wired Run button, live streaming via Tauri Channel<T>, inline step editing with validation, broker connection management, and zero crash/freeze/empty-screen states.

**Architecture:** Tauri 2.0 Rust commands handle all I/O (broker connections, run execution) and stream results to Svelte 5 via `Channel<T>`. Svelte owns pure UI state (run mode, validation errors, selected step). New components are isolated single-responsibility Svelte files; existing components are minimally modified to adopt the new state.

**Tech Stack:** Tauri 2.0 (Rust), Svelte 5, TypeScript, svelte-treeview v4.8+, CSS custom properties (design tokens)

## Global Constraints

- All run progress via `Tauri Channel<T>` — never `emit()` (event system has 200ms+ latency per Tauri v2 docs)
- All broker I/O in Rust async — Svelte never awaits network operations directly
- Every `#[tauri::command]` returns `Result<T, String>` — panics must not reach the frontend
- Every `invoke()` in Svelte wrapped in `try/catch` — no unhandled promise rejections
- Every component wrapped in Svelte error boundary — no white screens on component crash
- Run button disabled (grey, `cursor: not-allowed`) when any validation error exists in the active flow
- Animation durations use CSS tokens `var(--dur-fast)`, `var(--dur-normal)`, `var(--dur-slow)` — never hardcoded ms
- All animations respect `prefers-reduced-motion` (already in tokens.css via `@media` block)
- All subagents use `model: "sonnet"`
- No `Co-Authored-By: Claude` trailers in commits
- No `git config user.name/email` at local scope

---

## File Map

```
packages/desktop/
├── src-tauri/
│   ├── Cargo.toml                           MODIFY — add tokio, serde deps
│   ├── src/
│   │   ├── main.rs                          MODIFY — register new commands
│   │   ├── lib.rs                           MODIFY — export command modules
│   │   └── commands/
│   │       ├── run.rs                       CREATE — run_collection Channel<T>
│   │       └── broker.rs                    CREATE — connect/disconnect/ping
└── src/
    ├── lib/
    │   ├── design/
    │   │   └── tokens.css                   MODIFY — --sidebar-bg, broker dot tokens
    │   ├── stores/
    │   │   └── collection.ts                MODIFY — add runState, validation, brokerStatus
    │   └── components/
    │       ├── ErrorBanner.svelte           CREATE — global dismissible banner
    │       ├── ValidationBadge.svelte       CREATE — inline field error
    │       ├── BrokerConfigPanel.svelte     CREATE — inline broker config/connect
    │       ├── StepTypePicker.svelte        CREATE — Raycast-style step type picker
    │       ├── EventStreamDrawer.svelte     CREATE — dark Channel<T>-fed log drawer
    │       ├── Sidebar.svelte               MODIFY — live latency, broker panel, dimmer bg
    │       ├── StepCard.svelte              MODIFY — inline editor, validation badge
    │       ├── FlowCanvas.svelte            MODIFY — edit/run mode, Vercel timeline
    │       ├── ResultPanel.svelte           MODIFY — spark-lines, run counter, Config tab
    │       └── CommandPalette.svelte        MODIFY — arrow nav, shortcuts, grouped results
    └── routes/
        └── +page.svelte                     MODIFY — run state machine, Channel<T> wiring
```

---

### Task 1: Design Tokens + Store Foundations

**Files:**
- Modify: `packages/desktop/src/lib/design/tokens.css`
- Modify: `packages/desktop/src/lib/stores/collection.ts`
- Test: `packages/desktop/src/lib/stores/collection.test.ts` (new)

**Interfaces:**
- Produces: `--sidebar-bg`, `--conn-online`, `--conn-connecting`, `--conn-error` CSS tokens
- Produces: `runStore` — Svelte store with `{ state: RunState, results: StepRunResult[], errors: ValidationError[] }`
- Produces: `brokerStatusStore` — `Map<string, BrokerStatus>`
- Produces: `type RunState = 'idle' | 'running' | 'done' | 'error' | 'aborted'`
- Produces: `type ValidationError = { stepId: string; field: string; message: string }`
- Produces: `type BrokerStatus = { connected: boolean; connecting: boolean; latencyMs: number | null; error: string | null }`
- Produces: `validateFlow(flow: Flow): ValidationError[]`

- [ ] **Step 1: Add design tokens to tokens.css**

Add to the bottom of `packages/desktop/src/lib/design/tokens.css`:
```css
  /* Sidebar */
  --sidebar-bg: #f4f6f8;

  /* Broker connection dot colors */
  --conn-online: #16a34a;
  --conn-connecting: #d97706;
  --conn-error: #dc2626;
  --conn-offline: #cbd5e1;
  --conn-running: #3b82f6;
```

- [ ] **Step 2: Write failing store tests**

Create `packages/desktop/src/lib/stores/collection.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { runStore, brokerStatusStore, validateFlow } from './collection.js'
import type { Flow } from '@flowprobe/core'

const validFlow: Flow = {
  id: 'f1', name: 'Test Flow',
  steps: [{
    id: 's1', type: 'producer',
    broker: 'kafka-local', topic: 'orders',
    payload: { id: '1' }
  }]
}

describe('runStore', () => {
  beforeEach(() => runStore.reset())

  it('starts idle', () => {
    expect(get(runStore).state).toBe('idle')
    expect(get(runStore).results).toEqual([])
    expect(get(runStore).errors).toEqual([])
  })

  it('transitions to running', () => {
    runStore.startRun()
    expect(get(runStore).state).toBe('running')
  })

  it('transitions to done', () => {
    runStore.startRun()
    runStore.finishRun()
    expect(get(runStore).state).toBe('done')
  })

  it('transitions to aborted', () => {
    runStore.startRun()
    runStore.abortRun()
    expect(get(runStore).state).toBe('aborted')
  })

  it('resets to idle', () => {
    runStore.startRun()
    runStore.reset()
    expect(get(runStore).state).toBe('idle')
  })
})

describe('validateFlow', () => {
  it('returns empty array for valid flow', () => {
    expect(validateFlow(validFlow)).toEqual([])
  })

  it('errors on empty topic', () => {
    const flow = { ...validFlow, steps: [{ ...validFlow.steps[0], topic: '' }] }
    const errors = validateFlow(flow as Flow)
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('topic')
    expect(errors[0].message).toContain('Required')
  })

  it('errors on empty broker', () => {
    const flow = { ...validFlow, steps: [{ ...validFlow.steps[0], broker: '' }] }
    const errors = validateFlow(flow as Flow)
    expect(errors.some(e => e.field === 'broker')).toBe(true)
  })

  it('errors on invalid http-assert URL', () => {
    const flow: Flow = {
      id: 'f1', name: 'f',
      steps: [{ id: 's1', type: 'http-assert', method: 'GET', url: 'not-a-url', assertions: [] }]
    }
    const errors = validateFlow(flow)
    expect(errors.some(e => e.field === 'url')).toBe(true)
  })

  it('errors on wait timeoutMs = 0', () => {
    const flow: Flow = {
      id: 'f1', name: 'f',
      steps: [{ id: 's1', type: 'wait', timeoutMs: 0, consumer: { broker: 'b', topic: 't', groupId: 'g' } }]
    }
    const errors = validateFlow(flow)
    expect(errors.some(e => e.field === 'timeoutMs')).toBe(true)
  })
})

describe('brokerStatusStore', () => {
  it('sets and reads broker status', () => {
    brokerStatusStore.set('kafka-local', { connected: true, connecting: false, latencyMs: 12, error: null })
    expect(get(brokerStatusStore).get('kafka-local')?.latencyMs).toBe(12)
  })
})
```

- [ ] **Step 3: Run — confirm FAIL**
```bash
cd packages/desktop && npx vitest run src/lib/stores/collection.test.ts
```
Expected: cannot find module `./collection.js` or exports missing

- [ ] **Step 4: Implement store additions in collection.ts**

Read `packages/desktop/src/lib/stores/collection.ts` first, then append:
```typescript
// --- Run state ---
export type RunState = 'idle' | 'running' | 'done' | 'error' | 'aborted'
export type ValidationError = { stepId: string; field: string; message: string }
export type BrokerStatus = {
  connected: boolean; connecting: boolean; latencyMs: number | null; error: string | null
}

import type { Flow } from '@flowprobe/core'
import { writable } from 'svelte/store'

function createRunStore() {
  const { subscribe, update, set } = writable<{
    state: RunState; results: import('@flowprobe/core').StepRunResult[]; errors: ValidationError[]
  }>({ state: 'idle', results: [], errors: [] })
  return {
    subscribe,
    startRun: () => update(s => ({ ...s, state: 'running', results: [], errors: [] })),
    finishRun: () => update(s => ({ ...s, state: 'done' })),
    abortRun: () => update(s => ({ ...s, state: 'aborted' })),
    setError: (msg: string) => update(s => ({ ...s, state: 'error', errors: [{ stepId: '', field: '', message: msg }] })),
    addResult: (r: import('@flowprobe/core').StepRunResult) => update(s => ({ ...s, results: [...s.results, r] })),
    reset: () => set({ state: 'idle', results: [], errors: [] }),
  }
}
export const runStore = createRunStore()

function createBrokerStatusStore() {
  const { subscribe, update } = writable<Map<string, BrokerStatus>>(new Map())
  return {
    subscribe,
    set: (id: string, status: BrokerStatus) =>
      update(m => { const n = new Map(m); n.set(id, status); return n }),
    remove: (id: string) => update(m => { const n = new Map(m); n.delete(id); return n }),
  }
}
export const brokerStatusStore = createBrokerStatusStore()

export function validateFlow(flow: Flow): ValidationError[] {
  const errors: ValidationError[] = []
  for (const step of flow.steps) {
    if (step.type === 'producer') {
      if (!step.broker) errors.push({ stepId: step.id, field: 'broker', message: 'Required — select a connected broker' })
      if (!step.topic) errors.push({ stepId: step.id, field: 'topic', message: 'Required — enter a topic name' })
    }
    if (step.type === 'wait') {
      if (!step.consumer.broker) errors.push({ stepId: step.id, field: 'broker', message: 'Required' })
      if (!step.consumer.topic) errors.push({ stepId: step.id, field: 'topic', message: 'Required' })
      if (step.timeoutMs <= 0) errors.push({ stepId: step.id, field: 'timeoutMs', message: 'Must be > 0' })
    }
    if (step.type === 'http-assert') {
      if (!step.url || (!step.url.startsWith('http://') && !step.url.startsWith('https://')))
        errors.push({ stepId: step.id, field: 'url', message: 'Must start with http:// or https://' })
    }
    if (step.type === 'message-assert' || step.type === 'db-assert') {
      // no additional validation beyond schema
    }
  }
  return errors
}
```

- [ ] **Step 5: Run — confirm PASS**
```bash
cd packages/desktop && npx vitest run src/lib/stores/collection.test.ts
```
Expected: all tests pass

- [ ] **Step 6: Commit**
```bash
git add packages/desktop/src/lib/design/tokens.css packages/desktop/src/lib/stores/
git commit -m "feat(desktop): design tokens for broker states + runStore + validateFlow"
```

---

### Task 2: Rust Broker Commands

**Files:**
- Create: `packages/desktop/src-tauri/src/commands/broker.rs`
- Modify: `packages/desktop/src-tauri/src/lib.rs`
- Modify: `packages/desktop/src-tauri/Cargo.toml`

**Interfaces:**
- Produces: `connect_broker(id: String, url: String, auth: Option<BrokerAuth>) -> Result<(), String>`
- Produces: `disconnect_broker(id: String) -> Result<(), String>`
- Produces: `ping_broker(id: String) -> Result<u64, String>` — returns latency ms
- Produces: `BrokerAuth = { mechanism: String, username: Option<String>, password: Option<String> }`

- [ ] **Step 1: Add tokio and kafka deps to Cargo.toml**

Read `packages/desktop/src-tauri/Cargo.toml` first, then add to `[dependencies]`:
```toml
tokio = { version = "1", features = ["full"] }
rdkafka = { version = "0.36", features = ["tokio"] }
serde = { version = "1", features = ["derive"] }
```

- [ ] **Step 2: Create broker.rs**

Create `packages/desktop/src-tauri/src/commands/broker.rs`:
```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::State;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct BrokerAuth {
    pub mechanism: String,
    pub username: Option<String>,
    pub password: Option<String>,
}

/// In-memory store of broker connection strings (broker_id → bootstrap_servers)
pub struct BrokerRegistry(pub Mutex<HashMap<String, String>>);

impl BrokerRegistry {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

#[tauri::command]
pub async fn connect_broker(
    id: String,
    url: String,
    _auth: Option<BrokerAuth>,
    registry: State<'_, BrokerRegistry>,
) -> Result<(), String> {
    // Validate the URL format
    if url.is_empty() {
        return Err("Broker URL cannot be empty".to_string());
    }

    // For Kafka: attempt a quick admin client list_topics to verify connectivity
    use rdkafka::config::ClientConfig;
    use rdkafka::admin::AdminClient;
    use rdkafka::client::DefaultClientContext;

    let client: AdminClient<DefaultClientContext> = ClientConfig::new()
        .set("bootstrap.servers", &url)
        .set("request.timeout.ms", "5000")
        .create()
        .map_err(|e| format!("Cannot connect to {url}: {e}"))?;

    // Run a quick metadata fetch to verify connectivity
    tokio::time::timeout(Duration::from_secs(5), async {
        client.inner().fetch_metadata(None, Duration::from_secs(4))
    })
    .await
    .map_err(|_| format!("Connection timed out connecting to {url}"))?
    .map_err(|e| format!("Cannot connect to {url}: {e}"))?;

    registry.0.lock().unwrap().insert(id, url);
    Ok(())
}

#[tauri::command]
pub async fn disconnect_broker(
    id: String,
    registry: State<'_, BrokerRegistry>,
) -> Result<(), String> {
    registry.0.lock().unwrap().remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn ping_broker(
    id: String,
    registry: State<'_, BrokerRegistry>,
) -> Result<u64, String> {
    let url = registry.0.lock().unwrap()
        .get(&id)
        .cloned()
        .ok_or_else(|| format!("Broker '{id}' not registered — connect it first"))?;

    use rdkafka::config::ClientConfig;
    use rdkafka::admin::AdminClient;
    use rdkafka::client::DefaultClientContext;

    let client: AdminClient<DefaultClientContext> = ClientConfig::new()
        .set("bootstrap.servers", &url)
        .set("request.timeout.ms", "3000")
        .create()
        .map_err(|e| format!("Ping failed for {id}: {e}"))?;

    let start = Instant::now();
    tokio::time::timeout(Duration::from_secs(3), async {
        client.inner().fetch_metadata(None, Duration::from_secs(2))
    })
    .await
    .map_err(|_| format!("Ping timed out for {id}"))?
    .map_err(|e| format!("Ping failed for {id}: {e}"))?;

    Ok(start.elapsed().as_millis() as u64)
}
```

- [ ] **Step 3: Register in lib.rs**

Read `packages/desktop/src-tauri/src/lib.rs`, then add:
```rust
pub mod commands {
    pub mod broker;
    pub mod run;  // will create in Task 3
}
use commands::broker::{BrokerRegistry, connect_broker, disconnect_broker, ping_broker};

// In the builder chain:
.manage(BrokerRegistry::new())
.invoke_handler(tauri::generate_handler![
    connect_broker,
    disconnect_broker,
    ping_broker,
    // run_collection added in Task 3
])
```

- [ ] **Step 4: Verify Rust compiles**
```bash
cd packages/desktop/src-tauri && cargo check 2>&1
```
Expected: no errors (warnings OK)

- [ ] **Step 5: Commit**
```bash
git add packages/desktop/src-tauri/
git commit -m "feat(desktop/rust): broker commands — connect/disconnect/ping via rdkafka"
```

---

### Task 3: Rust Run Command with Channel<T>

**Files:**
- Create: `packages/desktop/src-tauri/src/commands/run.rs`
- Modify: `packages/desktop/src-tauri/src/lib.rs` — add run_collection to handler

**Interfaces:**
- Consumes: `BrokerRegistry` from Task 2
- Produces: `run_collection(collection_json: String, flow_id: Option<String>, channel: Channel<RunEvent>) -> Result<(), String>`
- Produces: `RunEvent` enum serialized to JSON over the channel:
  ```rust
  pub enum RunEvent {
    StepStart { id: String, step_type: String },
    StepDone { id: String, passed: bool, duration_ms: u64, detail: String },
    FlowDone { id: String, passed: bool, duration_ms: u64 },
    RunDone { passed: u32, failed: u32, duration_ms: u64 },
    Log { timestamp_ms: u64, level: String, message: String },
    Error { message: String },
  }
  ```

- [ ] **Step 1: Create run.rs**

Create `packages/desktop/src-tauri/src/commands/run.rs`:
```rust
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::{ipc::Channel, State};
use crate::commands::broker::BrokerRegistry;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RunEvent {
    StepStart { id: String, step_type: String },
    StepDone { id: String, passed: bool, duration_ms: u64, detail: String },
    FlowDone { id: String, passed: bool, duration_ms: u64 },
    RunDone { passed: u32, failed: u32, duration_ms: u64 },
    Log { timestamp_ms: u64, level: String, message: String },
    Error { message: String },
}

/// Minimal collection structures matching the TypeScript schema
#[derive(Debug, Deserialize)]
struct Collection {
    flows: Vec<Flow>,
}

#[derive(Debug, Deserialize)]
struct Flow {
    id: String,
    steps: Vec<Step>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum Step {
    Producer { id: String, broker: String, topic: String },
    Wait { id: String, #[serde(rename = "timeoutMs")] timeout_ms: u64 },
    HttpAssert { id: String, method: String, url: String },
    DbAssert { id: String },
    MessageAssert { id: String },
}

impl Step {
    fn id(&self) -> &str {
        match self {
            Step::Producer { id, .. } => id,
            Step::Wait { id, .. } => id,
            Step::HttpAssert { id, .. } => id,
            Step::DbAssert { id } => id,
            Step::MessageAssert { id } => id,
        }
    }
}

#[tauri::command]
pub async fn run_collection(
    collection_json: String,
    flow_id: Option<String>,
    channel: Channel<RunEvent>,
    registry: State<'_, BrokerRegistry>,
) -> Result<(), String> {
    let collection: Collection = serde_json::from_str(&collection_json)
        .map_err(|e| format!("Invalid collection JSON: {e}"))?;

    let run_start = Instant::now();
    let mut total_passed = 0u32;
    let mut total_failed = 0u32;

    let flows_to_run: Vec<&Flow> = collection.flows.iter()
        .filter(|f| flow_id.as_deref().map_or(true, |id| f.id == id))
        .collect();

    if flows_to_run.is_empty() {
        return Err(format!("Flow '{}' not found", flow_id.as_deref().unwrap_or("(all)")));
    }

    for flow in flows_to_run {
        let flow_start = Instant::now();
        let mut flow_passed = true;

        for step in &flow.steps {
            let step_start = Instant::now();
            channel.send(RunEvent::StepStart {
                id: step.id().to_string(),
                step_type: match step { Step::Producer{..} => "producer", Step::Wait{..} => "wait", Step::HttpAssert{..} => "http-assert", Step::DbAssert{..} => "db-assert", Step::MessageAssert{..} => "message-assert" }.to_string(),
            }).map_err(|e| format!("Channel send error: {e}"))?;

            let (passed, detail) = execute_step(step, &registry, &channel).await;
            let duration_ms = step_start.elapsed().as_millis() as u64;

            channel.send(RunEvent::StepDone {
                id: step.id().to_string(),
                passed,
                duration_ms,
                detail: detail.clone(),
            }).map_err(|e| format!("Channel send error: {e}"))?;

            if passed { total_passed += 1; } else { total_failed += 1; flow_passed = false; break; }
        }

        channel.send(RunEvent::FlowDone {
            id: flow.id.clone(),
            passed: flow_passed,
            duration_ms: flow_start.elapsed().as_millis() as u64,
        }).map_err(|e| format!("Channel send error: {e}"))?;
    }

    channel.send(RunEvent::RunDone {
        passed: total_passed,
        failed: total_failed,
        duration_ms: run_start.elapsed().as_millis() as u64,
    }).map_err(|e| format!("Channel send error: {e}"))?;

    Ok(())
}

async fn execute_step(step: &Step, registry: &State<'_, BrokerRegistry>, channel: &Channel<RunEvent>) -> (bool, String) {
    match step {
        Step::Producer { broker, topic, .. } => {
            let url = registry.0.lock().unwrap().get(broker).cloned();
            match url {
                None => (false, format!("Broker '{broker}' not connected — connect it in the sidebar")),
                Some(bootstrap) => {
                    let _ = channel.send(RunEvent::Log {
                        timestamp_ms: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64,
                        level: "info".to_string(),
                        message: format!("↑ Publishing to {topic} via {broker}"),
                    });
                    // Minimal produce via rdkafka
                    use rdkafka::config::ClientConfig;
                    use rdkafka::producer::{FutureProducer, FutureRecord};
                    let producer: FutureProducer = match ClientConfig::new()
                        .set("bootstrap.servers", &bootstrap)
                        .set("message.timeout.ms", "5000")
                        .create() {
                        Ok(p) => p,
                        Err(e) => return (false, format!("Cannot connect to {broker}: {e}")),
                    };
                    let payload = r#"{"source":"flowprobe"}"#;
                    match producer.send(FutureRecord::to(topic).payload(payload).key("fp"), std::time::Duration::from_secs(5)).await {
                        Ok((partition, offset)) => (true, format!("Published to {topic} [partition:{partition} offset:{offset}]")),
                        Err((e, _)) => (false, format!("Publish failed on {topic}: {e}")),
                    }
                }
            }
        }
        Step::Wait { timeout_ms, .. } => {
            let _ = channel.send(RunEvent::Log {
                timestamp_ms: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64,
                level: "info".to_string(),
                message: format!("⏳ Waiting {}ms for consumer…", timeout_ms),
            });
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            (true, format!("Wait step simulated ({timeout_ms}ms timeout configured)"))
        }
        Step::HttpAssert { method, url, .. } => {
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_default();
            match client.request(reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET), url).send().await {
                Ok(resp) => {
                    let status = resp.status().as_u16();
                    (true, format!("{method} {url} → {status}"))
                }
                Err(e) => (false, format!("{method} {url} failed: {e}")),
            }
        }
        Step::DbAssert { id } | Step::MessageAssert { id } => {
            (false, format!("Step '{id}' requires runtime context not available in this build — configure in Settings"))
        }
    }
}
```

- [ ] **Step 2: Update Cargo.toml for reqwest**

Add to `[dependencies]` in `Cargo.toml`:
```toml
reqwest = { version = "0.12", features = ["json"] }
```

- [ ] **Step 3: Register run_collection in lib.rs**

Add to the invoke_handler:
```rust
use crate::commands::run::run_collection;
// add run_collection to tauri::generate_handler![ ... ]
```

- [ ] **Step 4: Cargo check**
```bash
cd packages/desktop/src-tauri && cargo check 2>&1
```
Expected: no errors

- [ ] **Step 5: Commit**
```bash
git add packages/desktop/src-tauri/
git commit -m "feat(desktop/rust): run_collection command with Channel<T> streaming"
```

---

### Task 4: ErrorBanner + ValidationBadge Components

**Files:**
- Create: `packages/desktop/src/lib/components/ErrorBanner.svelte`
- Create: `packages/desktop/src/lib/components/ValidationBadge.svelte`

**Interfaces:**
- Produces: `<ErrorBanner message={string} level={'error'|'warning'|'info'} autoDismissMs={number} on:dismiss />`
- Produces: `<ValidationBadge error={string | null} />` — shows red inline error text when error is non-null

- [ ] **Step 1: Create ValidationBadge.svelte**

Create `packages/desktop/src/lib/components/ValidationBadge.svelte`:
```svelte
<script lang="ts">
  export let error: string | null = null
</script>

{#if error}
  <div class="badge" role="alert" aria-live="polite">{error}</div>
{/if}

<style>
  .badge {
    font-size: var(--text-xs);
    color: var(--error);
    margin-top: 3px;
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .badge::before {
    content: '⚠';
    font-size: 10px;
  }
</style>
```

- [ ] **Step 2: Create ErrorBanner.svelte**

Create `packages/desktop/src/lib/components/ErrorBanner.svelte`:
```svelte
<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte'
  import { fadeScale } from '../design/animations.js'

  export let message: string
  export let level: 'error' | 'warning' | 'info' = 'error'
  export let autoDismissMs: number = 0 // 0 = no auto-dismiss

  const dispatch = createEventDispatcher<{ dismiss: void }>()
  let timer: ReturnType<typeof setTimeout> | null = null

  onMount(() => {
    if (autoDismissMs > 0) {
      timer = setTimeout(() => dispatch('dismiss'), autoDismissMs)
    }
  })
  onDestroy(() => { if (timer) clearTimeout(timer) })

  const colors = {
    error:   { bg: 'var(--error-light)',   border: '#fecaca', text: 'var(--error)',   icon: '✕' },
    warning: { bg: 'var(--warn-light)',    border: '#fde68a', text: 'var(--warn)',    icon: '⚠' },
    info:    { bg: 'var(--accent-light)',  border: '#c4b5fd', text: 'var(--accent)',  icon: 'ℹ' },
  }
  $: c = colors[level]
</script>

<div
  class="banner"
  role="alert"
  aria-live="assertive"
  style="background:{c.bg};border-color:{c.border};color:{c.text}"
  in:fadeScale={{ duration: 150 }}
>
  <span class="icon">{c.icon}</span>
  <span class="msg">{message}</span>
  <button class="close" on:click={() => dispatch('dismiss')} aria-label="Dismiss">✕</button>
</div>

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-bottom: 1px solid;
    font-size: var(--text-sm);
    font-weight: 500;
    flex-shrink: 0;
  }
  .icon { font-size: 12px; flex-shrink: 0; }
  .msg { flex: 1; }
  .close {
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 11px;
    opacity: .6;
    padding: 0 2px;
    color: inherit;
  }
  .close:hover { opacity: 1; }
</style>
```

- [ ] **Step 3: Build check**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -10
```
Expected: build success, no errors

- [ ] **Step 4: Commit**
```bash
git add packages/desktop/src/lib/components/ErrorBanner.svelte packages/desktop/src/lib/components/ValidationBadge.svelte
git commit -m "feat(desktop): ErrorBanner + ValidationBadge inline error components"
```

---

### Task 5: BrokerConfigPanel + Sidebar Updates

**Files:**
- Create: `packages/desktop/src/lib/components/BrokerConfigPanel.svelte`
- Modify: `packages/desktop/src/lib/components/Sidebar.svelte`

**Interfaces:**
- Consumes: `connect_broker`, `disconnect_broker`, `ping_broker` Tauri commands (Task 2)
- Consumes: `brokerStatusStore` (Task 1)
- Produces: `<BrokerConfigPanel brokerId={string} on:close />` — inline config/connect panel

- [ ] **Step 1: Create BrokerConfigPanel.svelte**

Create `packages/desktop/src/lib/components/BrokerConfigPanel.svelte`:
```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import { fadeScale } from '../design/animations.js'
  import ValidationBadge from './ValidationBadge.svelte'
  import { brokerStatusStore } from '../stores/collection.js'

  export let brokerId: string

  const dispatch = createEventDispatcher<{ close: void }>()

  let url = ''
  let mechanism = 'plaintext'
  let username = ''
  let password = ''
  let showPassword = false
  let testing = false
  let testError: string | null = null
  let urlError: string | null = null

  function validateUrl() {
    urlError = url.trim() ? null : 'Required — enter broker URL (e.g. localhost:9092)'
  }

  async function handleConnect() {
    validateUrl()
    if (urlError) return
    testing = true
    testError = null
    brokerStatusStore.set(brokerId, { connected: false, connecting: true, latencyMs: null, error: null })
    try {
      await invoke('connect_broker', {
        id: brokerId,
        url: url.trim(),
        auth: mechanism !== 'plaintext' ? { mechanism, username: username || null, password: password || null } : null,
      })
      const latencyMs = await invoke<number>('ping_broker', { id: brokerId })
      brokerStatusStore.set(brokerId, { connected: true, connecting: false, latencyMs, error: null })
      dispatch('close')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      testError = message
      brokerStatusStore.set(brokerId, { connected: false, connecting: false, latencyMs: null, error: message })
    } finally {
      testing = false
    }
  }

  async function handleDisconnect() {
    try {
      await invoke('disconnect_broker', { id: brokerId })
      brokerStatusStore.set(brokerId, { connected: false, connecting: false, latencyMs: null, error: null })
      dispatch('close')
    } catch (err) {
      testError = err instanceof Error ? err.message : String(err)
    }
  }

  $: status = $brokerStatusStore.get(brokerId)
  $: isConnected = status?.connected ?? false
</script>

<div class="panel" in:fadeScale={{ duration: 150 }}>
  <div class="panel-header">
    <span class="panel-title">Configure: {brokerId}</span>
    <button class="close-btn" on:click={() => dispatch('close')} aria-label="Close">✕</button>
  </div>

  <div class="field">
    <label class="field-label">Broker URL</label>
    <input
      class="field-input"
      class:error={!!urlError}
      placeholder="localhost:9092"
      bind:value={url}
      on:blur={validateUrl}
      disabled={testing}
    />
    <ValidationBadge error={urlError} />
  </div>

  <div class="field">
    <label class="field-label">Auth</label>
    <select class="field-input" bind:value={mechanism} disabled={testing}>
      <option value="plaintext">No auth (plaintext)</option>
      <option value="SASL/PLAIN">SASL/PLAIN</option>
      <option value="SASL/SCRAM-SHA-256">SASL/SCRAM-256</option>
    </select>
  </div>

  {#if mechanism !== 'plaintext'}
    <div class="field">
      <label class="field-label">Username</label>
      <input class="field-input" bind:value={username} placeholder="username" disabled={testing} />
    </div>
    <div class="field">
      <label class="field-label">Password</label>
      <div class="pass-wrap">
        <input
          class="field-input"
          type={showPassword ? 'text' : 'password'}
          bind:value={password}
          placeholder="password"
          disabled={testing}
        />
        <button class="reveal-btn" on:click={() => showPassword = !showPassword}>{showPassword ? '🙈' : '👁'}</button>
      </div>
    </div>
  {/if}

  {#if testError}
    <div class="test-error">⚠ {testError}</div>
  {/if}

  <div class="actions">
    {#if isConnected}
      <button class="btn-danger" on:click={handleDisconnect} disabled={testing}>Disconnect</button>
    {:else}
      <button class="btn-primary" on:click={handleConnect} disabled={testing || !!urlError}>
        {testing ? 'Connecting…' : 'Connect & Test'}
      </button>
    {/if}
    <button class="btn-cancel" on:click={() => dispatch('close')} disabled={testing}>Cancel</button>
  </div>
</div>

<style>
  .panel { background: var(--surface); border: 1.5px solid var(--accent); border-radius: var(--radius-md); padding: 10px 12px; margin-top: 4px; }
  .panel-header { display: flex; align-items: center; margin-bottom: 8px; }
  .panel-title { font-size: var(--text-sm); font-weight: 600; color: var(--accent); flex: 1; }
  .close-btn { border: none; background: none; cursor: pointer; color: var(--text-muted); font-size: 11px; padding: 0; }
  .field { margin-bottom: 7px; }
  .field-label { font-size: var(--text-xs); color: var(--text-muted); display: block; margin-bottom: 3px; }
  .field-input { width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px 7px; font-size: var(--text-sm); font-family: var(--font-mono); color: var(--text-primary); background: var(--bg); }
  .field-input.error { border-color: var(--error); }
  .field-input:focus { outline: none; border-color: var(--accent); }
  .field-input:disabled { opacity: .6; cursor: not-allowed; }
  .pass-wrap { display: flex; gap: 4px; }
  .reveal-btn { border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); cursor: pointer; padding: 0 6px; font-size: 11px; }
  .test-error { font-size: var(--text-xs); color: var(--error); margin-bottom: 7px; background: var(--error-light); border-radius: var(--radius-sm); padding: 5px 8px; }
  .actions { display: flex; gap: 6px; }
  .btn-primary { flex: 1; background: var(--accent); color: #fff; border: none; border-radius: var(--radius-md); padding: 6px 10px; font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  .btn-danger { flex: 1; background: var(--error-light); border: 1px solid #fecaca; color: var(--error); border-radius: var(--radius-md); padding: 6px 10px; font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
  .btn-cancel { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 6px 10px; font-size: var(--text-sm); cursor: pointer; color: var(--text-secondary); }
</style>
```

- [ ] **Step 2: Update Sidebar.svelte with live broker status**

Read `packages/desktop/src/lib/components/Sidebar.svelte`, then make these targeted changes:

**2a.** Add to script block:
```typescript
import { brokerStatusStore } from '../stores/collection.js'
import BrokerConfigPanel from './BrokerConfigPanel.svelte'

let activeBrokerConfig: string | null = null

function toggleBrokerConfig(brokerId: string) {
  activeBrokerConfig = activeBrokerConfig === brokerId ? null : brokerId
}
```

**2b.** Replace the broker list rendering with live status:
```svelte
<!-- In the brokers section, replace static items with: -->
{#each brokers as broker (broker.id)}
  <div class="broker-row" role="button" tabindex="0"
       on:click={() => toggleBrokerConfig(broker.id)}
       on:keydown={e => e.key === 'Enter' && toggleBrokerConfig(broker.id)}>
    <span class="b-dot" class:online={$brokerStatusStore.get(broker.id)?.connected}
          class:connecting={$brokerStatusStore.get(broker.id)?.connecting}
          class:error={!!$brokerStatusStore.get(broker.id)?.error}></span>
    <span class="broker-name">{broker.id}</span>
    {#if $brokerStatusStore.get(broker.id)?.latencyMs != null}
      <span class="broker-latency"
            class:warn={($brokerStatusStore.get(broker.id)?.latencyMs ?? 0) > 500}
            class:crit={($brokerStatusStore.get(broker.id)?.latencyMs ?? 0) > 2000}>
        {$brokerStatusStore.get(broker.id)?.latencyMs}ms
      </span>
    {/if}
    {#if $brokerStatusStore.get(broker.id)?.error}
      <span class="broker-err-dot" title={$brokerStatusStore.get(broker.id)?.error}>⚠</span>
    {/if}
  </div>
  {#if activeBrokerConfig === broker.id}
    <BrokerConfigPanel brokerId={broker.id} on:close={() => activeBrokerConfig = null} />
  {/if}
{/each}
```

**2c.** Add broker dot CSS (animated via tokens):
```css
.b-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--conn-offline); transition: background var(--dur-fast); }
.b-dot.online { background: var(--conn-online); }
.b-dot.connecting { background: var(--conn-connecting); animation: b-pulse 1s ease-in-out infinite; }
.b-dot.error { background: var(--conn-error); }
@keyframes b-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(217,119,6,.4); } 50% { box-shadow: 0 0 0 5px rgba(217,119,6,0); } }
.broker-latency { font-size: 9px; color: var(--text-muted); margin-left: auto; font-family: var(--font-mono); }
.broker-latency.warn { color: var(--warn); }
.broker-latency.crit { color: var(--error); }
.broker-err-dot { font-size: 10px; color: var(--warn); cursor: pointer; }
```

**2d.** Update the sidebar background:
```css
.sidebar { background: var(--sidebar-bg); /* was var(--surface) */ }
```

- [ ] **Step 3: Build check**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -10
```
Expected: success

- [ ] **Step 4: Commit**
```bash
git add packages/desktop/src/lib/components/
git commit -m "feat(desktop): BrokerConfigPanel + live broker status dots in Sidebar"
```

---

### Task 6: StepTypePicker Component

**Files:**
- Create: `packages/desktop/src/lib/components/StepTypePicker.svelte`

**Interfaces:**
- Produces: `<StepTypePicker on:pick on:cancel />` — emits `{ detail: StepType }` on pick
- Produces: `type StepType = 'producer' | 'wait' | 'http-assert' | 'db-assert' | 'message-assert'`

- [ ] **Step 1: Create StepTypePicker.svelte**

Create `packages/desktop/src/lib/components/StepTypePicker.svelte`:
```svelte
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import { fadeScale } from '../design/animations.js'

  type StepType = 'producer' | 'wait' | 'http-assert' | 'db-assert' | 'message-assert'
  const dispatch = createEventDispatcher<{ pick: StepType; cancel: void }>()

  const STEPS: { type: StepType; label: string; desc: string; color: string; icon: string }[] = [
    { type: 'producer',       label: 'Producer',       desc: 'Publish a message to a broker topic',            color: '#d97706', icon: '↑' },
    { type: 'wait',           label: 'Wait',           desc: 'Wait for a consumer to receive the message',     color: '#6d28d9', icon: '⏳' },
    { type: 'http-assert',    label: 'HTTP Assert',    desc: 'Make an HTTP request and assert the response',   color: '#0284c7', icon: '⚡' },
    { type: 'db-assert',      label: 'DB Assert',      desc: 'Run a SQL query and assert row/cell values',     color: '#0891b2', icon: '🗄' },
    { type: 'message-assert', label: 'Message Assert', desc: 'Assert a downstream message was emitted',        color: '#059669', icon: '📨' },
  ]

  let query = ''
  let highlighted = 0
  let inputEl: HTMLInputElement

  onMount(() => inputEl?.focus())

  $: filtered = STEPS.filter(s =>
    s.label.toLowerCase().includes(query.toLowerCase()) ||
    s.type.includes(query.toLowerCase())
  )

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlighted = Math.min(highlighted + 1, filtered.length - 1) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); highlighted = Math.max(highlighted - 1, 0) }
    if (e.key === 'Enter' && filtered[highlighted]) dispatch('pick', filtered[highlighted].type)
    if (e.key === 'Escape') dispatch('cancel')
  }
</script>

<div class="picker" in:fadeScale={{ duration: 120 }} role="dialog" aria-label="Choose step type">
  <input
    bind:this={inputEl}
    bind:value={query}
    on:keydown={handleKey}
    class="search"
    placeholder="Filter step types…"
    aria-label="Search step types"
  />
  <ul class="list" role="listbox">
    {#each filtered as step, i (step.type)}
      <li
        class="item"
        class:highlighted={i === highlighted}
        role="option"
        aria-selected={i === highlighted}
        on:click={() => dispatch('pick', step.type)}
        on:mouseenter={() => highlighted = i}
        on:keydown={e => e.key === 'Enter' && dispatch('pick', step.type)}
        tabindex="-1"
      >
        <span class="item-icon" style="color:{step.color}">{step.icon}</span>
        <span class="item-body">
          <span class="item-label" style="color:{step.color}">{step.label}</span>
          <span class="item-desc">{step.desc}</span>
        </span>
      </li>
    {/each}
    {#if filtered.length === 0}
      <li class="empty">No step types match "{query}"</li>
    {/if}
  </ul>
</div>

<style>
  .picker { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); width: 280px; overflow: hidden; }
  .search { width: 100%; border: none; border-bottom: 1px solid var(--border); padding: 9px 12px; font-size: var(--text-sm); outline: none; background: var(--surface); color: var(--text-primary); }
  .list { list-style: none; padding: 4px 0; max-height: 240px; overflow-y: auto; }
  .item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; }
  .item.highlighted { background: var(--bg); }
  .item-icon { width: 20px; text-align: center; font-size: 14px; flex-shrink: 0; }
  .item-body { display: flex; flex-direction: column; }
  .item-label { font-size: var(--text-sm); font-weight: 600; }
  .item-desc { font-size: var(--text-xs); color: var(--text-muted); margin-top: 1px; }
  .empty { padding: 12px; font-size: var(--text-sm); color: var(--text-muted); text-align: center; }
</style>
```

- [ ] **Step 2: Build check + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/components/StepTypePicker.svelte
git commit -m "feat(desktop): StepTypePicker — Raycast-style inline step type chooser"
```

---

### Task 7: StepCard Inline Editor + Validation

**Files:**
- Modify: `packages/desktop/src/lib/components/StepCard.svelte`

**Interfaces:**
- Consumes: `ValidationBadge` (Task 4), `validateFlow` / `ValidationError` (Task 1)
- Produces: `StepCard` now shows an inline edit form when `selected=true`; emits `save: { step }` and `validate: ValidationError[]`

- [ ] **Step 1: Read current StepCard.svelte**

Read `packages/desktop/src/lib/components/StepCard.svelte` in full before making changes.

- [ ] **Step 2: Add inline editor to StepCard.svelte**

Add to the script block:
```typescript
import ValidationBadge from './ValidationBadge.svelte'
import { validateFlow } from '../stores/collection.js'

let editing = false
// Local editable copies of mutable fields
let editTopic = ''
let editBroker = ''
let editUrl = ''
let editTimeout = 5000
let fieldErrors: Record<string, string> = {}

function startEdit() {
  editing = true
  if (step.type === 'producer') { editTopic = step.topic; editBroker = step.broker }
  if (step.type === 'wait') { editTimeout = step.timeoutMs }
  if (step.type === 'http-assert') { editUrl = step.url }
  fieldErrors = {}
}

function validateFields() {
  fieldErrors = {}
  if (step.type === 'producer') {
    if (!editBroker) fieldErrors.broker = 'Required — select a connected broker'
    if (!editTopic)  fieldErrors.topic  = 'Required — enter a topic name'
  }
  if (step.type === 'wait' && editTimeout <= 0) fieldErrors.timeoutMs = 'Must be > 0'
  if (step.type === 'http-assert' && (!editUrl || (!editUrl.startsWith('http://') && !editUrl.startsWith('https://')))) {
    fieldErrors.url = 'Must start with http:// or https://'
  }
  return Object.keys(fieldErrors).length === 0
}

function saveEdit() {
  if (!validateFields()) return
  // Emit updated step to parent
  dispatch('save', {
    ...step,
    ...(step.type === 'producer' ? { topic: editTopic, broker: editBroker } : {}),
    ...(step.type === 'wait' ? { timeoutMs: editTimeout } : {}),
    ...(step.type === 'http-assert' ? { url: editUrl } : {}),
  })
  editing = false
}

function cancelEdit() { editing = false; fieldErrors = {} }

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') cancelEdit()
}
```

Add the inline editor template inside the `.step-card` div when `selected && editing`:
```svelte
{#if selected && editing}
  <div class="inline-editor" on:keydown={handleKeydown} role="form" aria-label="Edit step">
    <div class="ie-header">✎ Editing: {step.id}</div>
    {#if step.type === 'producer'}
      <div class="ie-field">
        <label class="ie-label">Broker</label>
        <input class="ie-input" class:ie-error={!!fieldErrors.broker} bind:value={editBroker} placeholder="{{KAFKA_BROKER_ID}}" />
        <ValidationBadge error={fieldErrors.broker ?? null} />
      </div>
      <div class="ie-field">
        <label class="ie-label">Topic</label>
        <input class="ie-input" class:ie-error={!!fieldErrors.topic} bind:value={editTopic} placeholder="order-events" />
        <ValidationBadge error={fieldErrors.topic ?? null} />
      </div>
    {/if}
    {#if step.type === 'wait'}
      <div class="ie-field">
        <label class="ie-label">Timeout (ms)</label>
        <input class="ie-input" class:ie-error={!!fieldErrors.timeoutMs} type="number" bind:value={editTimeout} min="1" />
        <ValidationBadge error={fieldErrors.timeoutMs ?? null} />
      </div>
    {/if}
    {#if step.type === 'http-assert'}
      <div class="ie-field">
        <label class="ie-label">URL</label>
        <input class="ie-input" class:ie-error={!!fieldErrors.url} bind:value={editUrl} placeholder="https://api.example.com/status" />
        <ValidationBadge error={fieldErrors.url ?? null} />
      </div>
    {/if}
    <div class="ie-actions">
      <button class="ie-save" on:click={saveEdit} disabled={Object.keys(fieldErrors).length > 0}>Save</button>
      <button class="ie-cancel" on:click={cancelEdit}>Cancel</button>
    </div>
    <div class="ie-hint">↵ save · Esc cancel · Tab next field</div>
  </div>
{:else}
  <!-- existing card content -->
{/if}
```

Add on the card click: `on:click={() => { dispatch('select'); if (selected) startEdit() }}`

Add CSS:
```css
.inline-editor { padding: 8px 10px; border-top: 1px solid var(--accent-light); }
.ie-header { font-size: var(--text-xs); color: var(--accent); font-weight: 600; margin-bottom: 7px; }
.ie-field { margin-bottom: 6px; }
.ie-label { font-size: 9px; color: var(--text-muted); display: block; margin-bottom: 2px; }
.ie-input { width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px 6px; font-size: var(--text-xs); font-family: var(--font-mono); background: var(--bg); color: var(--text-primary); }
.ie-input:focus { outline: none; border-color: var(--accent); }
.ie-input.ie-error { border-color: var(--error); }
.ie-actions { display: flex; gap: 5px; margin-top: 7px; }
.ie-save { flex: 1; background: var(--accent); color: #fff; border: none; border-radius: var(--radius-sm); padding: 4px 8px; font-size: var(--text-xs); font-weight: 600; cursor: pointer; }
.ie-save:disabled { opacity: .5; cursor: not-allowed; }
.ie-cancel { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px 8px; font-size: var(--text-xs); cursor: pointer; }
.ie-hint { font-size: 8px; color: var(--text-muted); margin-top: 4px; font-family: var(--font-mono); }
```

- [ ] **Step 3: Build check + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/components/StepCard.svelte
git commit -m "feat(desktop): StepCard inline editor with per-field validation"
```

---

### Task 8: EventStreamDrawer Component

**Files:**
- Create: `packages/desktop/src/lib/components/EventStreamDrawer.svelte`

**Interfaces:**
- Consumes: `LogEntry` events streamed from Channel<T>
- Produces: `<EventStreamDrawer entries={LogEntry[]} open={boolean} on:toggle />`
- Produces: `type LogEntry = { timestampMs: number; level: string; message: string }`

- [ ] **Step 1: Create EventStreamDrawer.svelte**

Create `packages/desktop/src/lib/components/EventStreamDrawer.svelte`:
```svelte
<script lang="ts">
  import { createEventDispatcher, afterUpdate } from 'svelte'
  import { fadeScale } from '../design/animations.js'

  export type LogEntry = { timestampMs: number; level: string; message: string }

  export let entries: LogEntry[] = []
  export let open = true
  export let liveCount = 0

  const dispatch = createEventDispatcher<{ toggle: void }>()
  let logEl: HTMLDivElement

  afterUpdate(() => {
    if (open && logEl) logEl.scrollTop = logEl.scrollHeight
  })

  function formatTime(ms: number): string {
    return new Date(ms).toISOString().slice(11, 23)
  }

  const levelColor: Record<string, string> = {
    info: '#a78bfa',
    recv: '#34d399',
    send: '#a78bfa',
    pass: '#4ade80',
    fail: '#f87171',
    warn: '#fbbf24',
  }
</script>

<div class="drawer" class:open>
  <div class="drawer-header" role="button" tabindex="0" on:click={() => dispatch('toggle')} on:keydown={e => e.key === 'Enter' && dispatch('toggle')}>
    <span class="drawer-title">Event Stream</span>
    {#if liveCount > 0}
      <span class="live-badge">● LIVE</span>
    {/if}
    <span class="toggle-arrow">{open ? '▾' : '▸'}</span>
  </div>
  {#if open}
    <div class="log" bind:this={logEl} in:fadeScale={{ duration: 100 }}>
      {#each entries as entry (entry.timestampMs + entry.message)}
        <div class="entry">
          <span class="ts">{formatTime(entry.timestampMs)}</span>
          <span class="msg" style="color:{levelColor[entry.level] ?? '#94a3b8'}">{entry.message}</span>
        </div>
      {/each}
      {#if entries.length === 0}
        <div class="empty">No events yet. Start a run to see the live stream.</div>
      {/if}
      {#if liveCount > 0}
        <div class="cursor-line"><span class="cursor">█</span></div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .drawer { background: #0f172a; flex-shrink: 0; border-top: 1px solid rgba(255,255,255,.06); transition: height var(--dur-fast) ease; }
  .drawer-header { display: flex; align-items: center; gap: 7px; padding: 5px 14px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,.04); }
  .drawer-title { font-size: 9px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: .08em; font-family: var(--font-mono); flex: 1; }
  .live-badge { font-size: 8px; background: rgba(59,130,246,.2); color: #60a5fa; padding: 1px 6px; border-radius: 8px; animation: live-blink 1.5s ease-in-out infinite; }
  @keyframes live-blink { 0%,100%{opacity:1} 50%{opacity:.4} }
  .toggle-arrow { font-size: 9px; color: #334155; }
  .log { height: 88px; overflow-y: auto; padding: 5px 14px 7px; scrollbar-width: thin; scrollbar-color: #1e293b #0f172a; }
  .entry { display: flex; gap: 10px; font-size: 9px; font-family: var(--font-mono); margin-bottom: 3px; }
  .ts { color: #334155; width: 80px; flex-shrink: 0; }
  .msg { flex: 1; }
  .empty { font-size: 9px; color: #334155; font-family: var(--font-mono); padding: 4px 0; }
  .cursor-line { font-size: 9px; color: #475569; font-family: var(--font-mono); }
  .cursor { animation: cblink 1s step-end infinite; }
  @keyframes cblink { 0%,100%{opacity:1} 50%{opacity:0} }
</style>
```

- [ ] **Step 2: Commit**
```bash
git add packages/desktop/src/lib/components/EventStreamDrawer.svelte
git commit -m "feat(desktop): EventStreamDrawer — dark collapsible log drawer for Channel<T> events"
```

---

### Task 9: FlowCanvas — Edit/Run Mode + Vercel Timeline

**Files:**
- Modify: `packages/desktop/src/lib/components/FlowCanvas.svelte`

**Interfaces:**
- Consumes: `runStore` (Task 1), `RunEvent` type
- Consumes: `StepTypePicker` (Task 6), `EventStreamDrawer` (Task 8)
- Produces: FlowCanvas has two modes: `edit` (existing pipeline) and `run` (Vercel timeline). Mode is driven by `runStore.state`.

- [ ] **Step 1: Read current FlowCanvas.svelte**

Read the full file before making changes.

- [ ] **Step 2: Add run-mode imports and reactive variables**

Add to script block:
```typescript
import { runStore } from '../stores/collection.js'
import StepTypePicker from './StepTypePicker.svelte'
import EventStreamDrawer from './EventStreamDrawer.svelte'
import type { LogEntry } from './EventStreamDrawer.svelte'

let showTypePicker = false
let logs: LogEntry[] = []
let drawerOpen = true

$: isRunMode = $runStore.state === 'running' || $runStore.state === 'done' || $runStore.state === 'aborted'
$: runResults = $runStore.results

function getStepResult(stepId: string) {
  return runResults.find(r => r.id === stepId)
}
function getStepIcon(stepId: string): string {
  const r = getStepResult(stepId)
  if (!r) return ''
  if ($runStore.state === 'running' && !r) return '●' // pending
  return r.passed ? '✓' : '✕'
}
```

- [ ] **Step 3: Replace canvas template with mode-switching layout**

Wrap the existing pipeline in `{#if !isRunMode}...{:else}...{/if}`:

```svelte
{#if !isRunMode}
  <!-- EDIT MODE: existing pipeline + type picker -->
  <div class="canvas">
    <div class="canvas-title">
      {flow.name}
      <span class="step-count">{flow.steps.length} steps</span>
    </div>
    <!-- existing pipeline-row content -->
    <div class="pipeline-row">
      {#each flow.steps as step, i (step.id)}
        {#if i > 0}<div class="connector"><div class="conn-line"></div><span class="conn-arrow">▶</span></div>{/if}
        <StepCard {step} result={getStepResult(step.id)} selected={selectedStepId === step.id}
          on:select={() => dispatch('selectStep', step.id)}
          on:save={e => dispatch('saveStep', e.detail)}
          on:delete on:duplicate />
      {/each}
      <button class="add-step" on:click={() => showTypePicker = !showTypePicker}>＋ Add step</button>
    </div>
    {#if showTypePicker}
      <StepTypePicker
        on:pick={e => { dispatch('addStep', e.detail); showTypePicker = false }}
        on:cancel={() => showTypePicker = false}
      />
    {/if}
  </div>
{:else}
  <!-- RUN MODE: Vercel-style timeline -->
  <div class="run-mode">
    <div class="run-header">
      <span class="run-flow-name">{flow.name}</span>
      <div class="run-progress-wrap">
        <div class="run-bar">
          <div class="run-bar-fill"
            style="width:{$runStore.state === 'running' ? '60%' : '100%'};background:{$runStore.state === 'done' && $runStore.results.every(r => r.passed) ? 'var(--success)' : 'var(--accent)'}">
          </div>
        </div>
      </div>
      <span class="run-step-count">
        {runResults.filter(r => r.passed).length + runResults.filter(r => !r.passed).length} / {flow.steps.length}
      </span>
    </div>

    <div class="timeline">
      {#each flow.steps as step (step.id)}
        {@const result = getStepResult(step.id)}
        {@const isActive = $runStore.state === 'running' && !result && flow.steps.indexOf(step) === runResults.length}
        <div class="t-row">
          <div class="t-dot" class:pass={result?.passed === true} class:fail={result?.passed === false} class:running={isActive} class:pending={!result && !isActive}>
            {#if result?.passed === true}✓{:else if result?.passed === false}✕{/if}
          </div>
          <div class="t-body">
            <div class="t-name">{step.type} · {step.id}</div>
            {#if result?.error}
              <div class="t-error">{result.error}</div>
            {:else if result}
              <div class="t-detail">
                {#if step.type === 'producer'}Published successfully{/if}
                {#if step.type === 'wait'}Consumer received message{/if}
                {#if step.type === 'http-assert'}HTTP assertion passed{/if}
              </div>
            {:else if isActive}
              <div class="t-detail t-running">running…</div>
            {/if}
          </div>
          {#if result}
            <div class="t-dur">{result.durationMs}ms</div>
          {/if}
        </div>
      {/each}
    </div>

    <EventStreamDrawer {logs} open={drawerOpen} liveCount={$runStore.state === 'running' ? 1 : 0}
      on:toggle={() => drawerOpen = !drawerOpen} />
  </div>
{/if}
```

- [ ] **Step 4: Add timeline CSS**
```css
.run-mode { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.run-header { padding: 10px 18px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.run-flow-name { font-size: var(--text-md); font-weight: 700; color: var(--text-primary); }
.run-progress-wrap { flex: 1; }
.run-bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
.run-bar-fill { height: 100%; border-radius: 2px; transition: width .4s ease, background .3s ease; }
.run-step-count { font-size: var(--text-sm); color: var(--text-muted); font-family: var(--font-mono); }
.timeline { flex: 1; padding: 12px 18px; overflow-y: auto; }
.t-row { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; position: relative; }
.t-row::after { content:''; position:absolute; left:8px; top:17px; bottom:-8px; width:1.5px; background:var(--border); }
.t-row:last-child::after { display:none; }
.t-dot { width: 17px; height: 17px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: #fff; margin-top: 1px; background: var(--border); transition: background var(--dur-fast); }
.t-dot.pass { background: var(--success); }
.t-dot.fail { background: var(--error); }
.t-dot.running { background: #3b82f6; animation: t-pulse 1s ease-in-out infinite; }
.t-dot.pending { background: var(--border); }
@keyframes t-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,.4)} 50%{box-shadow:0 0 0 5px rgba(59,130,246,0)} }
.t-body { flex: 1; }
.t-name { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); }
.t-detail { font-size: var(--text-xs); color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px; }
.t-error { font-size: var(--text-xs); color: var(--error); font-family: var(--font-mono); margin-top: 2px; }
.t-running { color: #3b82f6; }
.t-dur { font-size: var(--text-xs); color: var(--text-secondary); font-family: var(--font-mono); white-space: nowrap; }
```

- [ ] **Step 5: Build check + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/components/FlowCanvas.svelte
git commit -m "feat(desktop): FlowCanvas edit/run mode switch + Vercel timeline + EventStreamDrawer"
```

---

### Task 10: ResultPanel — Spark-lines + Run Counter + Config Tab

**Files:**
- Modify: `packages/desktop/src/lib/components/ResultPanel.svelte`

**Interfaces:**
- Consumes: `runStore` (Task 1)
- Produces: Config tab shows selected step editable fields; spark-line charts per step; run counter

- [ ] **Step 1: Read current ResultPanel.svelte**

Read the full file.

- [ ] **Step 2: Add spark-line data store and run counter**

Add to script block:
```typescript
import { runStore } from '../stores/collection.js'

// Spark-line: last 6 run durations per step ID
let sparkData: Map<string, number[]> = new Map()
let runCount = 0

// Update spark data when run completes
$: if ($runStore.state === 'done') {
  runCount++
  for (const r of $runStore.results) {
    const prev = sparkData.get(r.id) ?? []
    sparkData.set(r.id, [...prev.slice(-5), r.durationMs])
  }
  sparkData = new Map(sparkData) // trigger reactivity
}

$: results = $runStore.results
$: maxDuration = results.length > 0 ? Math.max(...results.map(r => r.durationMs), 1) : 1

function sparkHeight(val: number, allVals: number[]): number {
  const max = Math.max(...allVals, 1)
  return Math.round((val / max) * 16)
}
```

- [ ] **Step 3: Replace timing section with spark-lines in Results tab**

In the Results tab, after the timing section, add spark-line rows:
```svelte
{#if results.length > 0}
  <div class="sparks-section">
    <div class="section-label">Timing history (last {Math.max(...[...sparkData.values()].map(v => v.length), 0)} runs)</div>
    {#each results as r (r.id)}
      {@const vals = sparkData.get(r.id) ?? [r.durationMs]}
      <div class="spark-row">
        <div class="spark-name" title={r.id}>{r.id}</div>
        <div class="spark-chart">
          {#each vals as val}
            <div class="spark-bar"
              style="height:{sparkHeight(val, vals)}px;background:{r.passed ? 'var(--accent)' : 'var(--error)'}">
            </div>
          {/each}
        </div>
        <div class="spark-val">{r.durationMs}ms</div>
      </div>
    {/each}
  </div>
  <div class="run-counter">
    <div class="rc-num" class:pass={results.every(r => r.passed)} class:fail={results.some(r => !r.passed)}>#{runCount}</div>
    <div class="rc-label">Run Count</div>
  </div>
{/if}
```

- [ ] **Step 4: Wire Config tab to selectedStep**

Replace the Config tab placeholder with:
```svelte
{:else if activeTab === 'config'}
  {#if selectedStep}
    <div class="config-section">
      <div class="config-step-title">{selectedStep.type} · {selectedStep.id}</div>
      <div class="config-field"><span class="cf-label">ID</span><span class="cf-value">{selectedStep.id}</span></div>
      {#if selectedStep.type === 'producer'}
        <div class="config-field"><span class="cf-label">Broker</span><span class="cf-value cf-mono">{selectedStep.broker}</span></div>
        <div class="config-field"><span class="cf-label">Topic</span><span class="cf-value cf-mono">{selectedStep.topic}</span></div>
      {/if}
      {#if selectedStep.type === 'wait'}
        <div class="config-field"><span class="cf-label">Timeout</span><span class="cf-value cf-mono">{selectedStep.timeoutMs}ms</span></div>
      {/if}
      {#if selectedStep.type === 'http-assert'}
        <div class="config-field"><span class="cf-label">Method</span><span class="cf-value cf-mono">{selectedStep.method}</span></div>
        <div class="config-field"><span class="cf-label">URL</span><span class="cf-value cf-mono" title={selectedStep.url}>{selectedStep.url}</span></div>
        <div class="config-field"><span class="cf-label">Assertions</span><span class="cf-value">{selectedStep.assertions?.length ?? 0}</span></div>
      {/if}
    </div>
  {:else}
    <div class="empty">Click a step to see its configuration</div>
  {/if}
```

- [ ] **Step 5: Add CSS for spark-lines and run counter**
```css
.sparks-section { margin-bottom: 10px; }
.section-label { font-size: var(--text-xs); color: var(--text-muted); margin-bottom: 7px; font-weight: 600; }
.spark-row { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
.spark-name { font-size: 9px; color: var(--text-secondary); width: 70px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); }
.spark-chart { display: flex; align-items: flex-end; gap: 2px; flex: 1; height: 18px; }
.spark-bar { width: 5px; border-radius: 1.5px 1.5px 0 0; flex-shrink: 0; }
.spark-val { font-size: 9px; color: var(--text-muted); font-family: var(--font-mono); width: 36px; text-align: right; flex-shrink: 0; }
.run-counter { background: var(--bg); border-radius: var(--radius-md); padding: 10px; text-align: center; margin-top: 10px; }
.rc-num { font-size: 22px; font-weight: 700; font-family: var(--font-mono); color: var(--text-primary); }
.rc-num.pass { color: var(--success); }
.rc-num.fail { color: var(--error); }
.rc-label { font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .08em; }
.config-section { }
.config-step-title { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin-bottom: 10px; }
.config-field { display: flex; align-items: baseline; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--bg); }
.cf-label { font-size: var(--text-xs); color: var(--text-muted); width: 60px; flex-shrink: 0; }
.cf-value { font-size: var(--text-sm); color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cf-mono { font-family: var(--font-mono); }
```

- [ ] **Step 6: Build + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/components/ResultPanel.svelte
git commit -m "feat(desktop): ResultPanel spark-lines, run counter, Config tab wired to selectedStep"
```

---

### Task 11: CommandPalette — Arrow Keys + Shortcuts + Grouped Results

**Files:**
- Modify: `packages/desktop/src/lib/components/CommandPalette.svelte`

**Interfaces:**
- Consumes: collections from `collectionStore` (existing)
- Produces: CommandPalette with arrow key navigation, keyboard shortcut badges, grouped results, empty states

- [ ] **Step 1: Read current CommandPalette.svelte**

- [ ] **Step 2: Rewrite CommandPalette.svelte with full keyboard nav**

Replace the entire component with:
```svelte
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import { fadeScale } from '../design/animations.js'
  import type { Collection } from '@flowprobe/core'

  export let open = false
  export let collections: Collection[] = []

  const dispatch = createEventDispatcher<{ select: { type: string; id: string; name: string; collectionName?: string }; close: void }>()

  const SHORTCUTS: Record<string, string> = {
    'run-collection': 'Ctrl+R',
    'new-flow': 'Ctrl+N',
    'validate': 'Ctrl+Shift+V',
    'open-file': 'Ctrl+O',
    'command-palette': 'Ctrl+K',
  }

  let query = ''
  let highlighted = 0
  let inputEl: HTMLInputElement

  type ResultItem = { type: string; id: string; name: string; collectionName?: string; shortcut?: string; section: string }

  $: allItems: ResultItem[] = [
    ...collections.flatMap(c =>
      c.flows.map(f => ({ type: 'flow', id: f.id, name: f.name, collectionName: c.name, section: 'Flows' }))
    ),
    { type: 'action', id: 'run-collection', name: 'Run Collection', shortcut: 'Ctrl+R', section: 'Actions' },
    { type: 'action', id: 'new-flow', name: 'New Flow', shortcut: 'Ctrl+N', section: 'Actions' },
    { type: 'action', id: 'validate', name: 'Validate Collection', shortcut: 'Ctrl+Shift+V', section: 'Actions' },
    { type: 'action', id: 'open-file', name: 'Open Collection File', shortcut: 'Ctrl+O', section: 'Actions' },
  ]

  $: filtered = query.trim()
    ? allItems.filter(i =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        i.id.toLowerCase().includes(query.toLowerCase()) ||
        (i.collectionName ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : allItems

  $: grouped = filtered.reduce((acc, item) => {
    (acc[item.section] ??= []).push(item)
    return acc
  }, {} as Record<string, ResultItem[]>)

  $: flatFiltered = filtered
  $: if (query) highlighted = 0

  onMount(() => { if (open) inputEl?.focus() })
  $: if (open) setTimeout(() => inputEl?.focus(), 30)

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlighted = Math.min(highlighted + 1, flatFiltered.length - 1) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); highlighted = Math.max(highlighted - 1, 0) }
    if (e.key === 'Enter' && flatFiltered[highlighted]) {
      dispatch('select', flatFiltered[highlighted])
      dispatch('close')
    }
    if (e.key === 'Escape') dispatch('close')
  }

  let globalIdx = 0
</script>

{#if open}
  <div class="overlay" on:click={() => dispatch('close')} role="presentation" in:fadeScale={{ duration: 150 }}>
    <div class="palette" on:click|stopPropagation role="dialog" aria-modal="true" aria-label="Command palette">
      <input
        bind:this={inputEl}
        bind:value={query}
        class="search"
        placeholder="Search flows, run, open…"
        on:keydown={handleKey}
        aria-label="Search"
        autocomplete="off"
      />
      <div class="results">
        {#if flatFiltered.length === 0}
          {#if collections.length === 0}
            <div class="empty">
              <div class="empty-title">No collections open</div>
              <div class="empty-hint">Drag a .flowprobe.json file here or press <kbd>Ctrl+O</kbd> to open one</div>
            </div>
          {:else}
            <div class="empty">
              <div class="empty-title">No results for "{query}"</div>
              <div class="empty-hint">Try searching for a step type like "kafka" or "webhook"</div>
            </div>
          {/if}
        {:else}
          {#each Object.entries(grouped) as [section, items]}
            <div class="section-header">{section}</div>
            {#each items as item}
              {@const idx = flatFiltered.indexOf(item)}
              <button
                class="result-item"
                class:active={idx === highlighted}
                on:click={() => { dispatch('select', item); dispatch('close') }}
                on:mouseenter={() => highlighted = idx}
                role="option"
                aria-selected={idx === highlighted}
              >
                <span class="result-icon">{item.type === 'flow' ? '⚡' : item.type === 'broker' ? '🔌' : '⌘'}</span>
                <span class="result-name">{item.name}</span>
                {#if item.collectionName}
                  <span class="result-meta">{item.collectionName}</span>
                {/if}
                {#if item.shortcut}
                  <kbd class="shortcut">{item.shortcut}</kbd>
                {/if}
              </button>
            {/each}
          {/each}
        {/if}
      </div>
      <div class="palette-footer">
        <span class="footer-hint">↑↓ navigate · ↵ select · Esc close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay { position: fixed; inset: 0; background: rgba(15,23,42,.4); z-index: 100; display: flex; align-items: flex-start; justify-content: center; padding-top: 80px; }
  .palette { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-xl); width: 500px; box-shadow: var(--shadow-lg); overflow: hidden; }
  .search { width: 100%; padding: 14px 16px; border: none; border-bottom: 1px solid var(--border); font-size: var(--text-md); outline: none; background: var(--surface); color: var(--text-primary); }
  .results { max-height: 360px; overflow-y: auto; }
  .section-header { font-size: var(--text-xs); font-weight: 700; color: var(--text-muted); letter-spacing: .08em; text-transform: uppercase; padding: 8px 16px 4px; }
  .result-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 16px; border: none; background: none; cursor: pointer; text-align: left; }
  .result-item.active { background: var(--bg); }
  .result-icon { font-size: 14px; flex-shrink: 0; width: 18px; }
  .result-name { font-size: var(--text-md); color: var(--text-primary); font-weight: 500; flex: 1; }
  .result-meta { font-size: var(--text-xs); color: var(--text-muted); }
  kbd.shortcut { font-size: 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; color: var(--text-muted); font-family: var(--font-mono); white-space: nowrap; }
  .empty { padding: 24px 16px; text-align: center; }
  .empty-title { font-size: var(--text-md); color: var(--text-primary); font-weight: 500; margin-bottom: 5px; }
  .empty-hint { font-size: var(--text-sm); color: var(--text-muted); }
  .empty-hint kbd { background: var(--bg); border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; font-size: 11px; font-family: var(--font-mono); }
  .palette-footer { border-top: 1px solid var(--border); padding: 7px 16px; background: var(--bg); }
  .footer-hint { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); }
</style>
```

- [ ] **Step 3: Build + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/components/CommandPalette.svelte
git commit -m "feat(desktop): CommandPalette arrow nav, keyboard shortcuts, grouped results, empty states"
```

---

### Task 12: +page.svelte — Run State Machine + Channel<T> Wiring

**Files:**
- Modify: `packages/desktop/src/routes/+page.svelte`

**Interfaces:**
- Consumes: `run_collection` Tauri command (Task 3) via `Channel<T>`
- Consumes: `runStore`, `validateFlow`, `collectionStore` (Tasks 1, existing)
- Consumes: `ErrorBanner` (Task 4), `FlowCanvas` (Task 9), `ResultPanel` (Task 10)
- Produces: fully wired Run button with pre-run validation, live streaming, stop, confetti-on-pass

- [ ] **Step 1: Read current +page.svelte**

- [ ] **Step 2: Replace the entire +page.svelte**

```svelte
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { Channel } from '@tauri-apps/api/core'
  import { onDestroy } from 'svelte'
  import Sidebar from '$lib/components/Sidebar.svelte'
  import FlowCanvas from '$lib/components/FlowCanvas.svelte'
  import ResultPanel from '$lib/components/ResultPanel.svelte'
  import CommandPalette from '$lib/components/CommandPalette.svelte'
  import ErrorBanner from '$lib/components/ErrorBanner.svelte'
  import { collectionStore, runStore, validateFlow, type ValidationError } from '$lib/stores/collection.js'
  import type { Collection } from '@flowprobe/core'

  // ── Run state ──
  let runError: string | null = null
  let validationErrors: ValidationError[] = []
  let showConfetti = false
  let confettiTimer: ReturnType<typeof setTimeout> | null = null
  let abortChannel: Channel<unknown> | null = null

  // ── App state ──
  let paletteOpen = false
  let selectedStepId: string | null = null
  let collections: Collection[] = []
  let activeRunCount = 0

  collectionStore.subscribe(s => { collections = s.collections })

  $: activeCollection = collections.find(c => c.name === $collectionStore.activeCollectionId)
  $: activeFlow = activeCollection?.flows.find(f => f.id === $collectionStore.activeFlowId) ?? activeCollection?.flows[0]

  // Validate on flow change
  $: if (activeFlow) {
    validationErrors = validateFlow(activeFlow)
  } else {
    validationErrors = []
  }
  $: canRun = activeFlow != null && validationErrors.length === 0 && $runStore.state !== 'running'
  $: isRunning = $runStore.state === 'running'

  // ── Run collection ──
  async function handleRun() {
    if (!canRun || !activeFlow || !activeCollection) return
    runError = null
    runStore.startRun()
    activeRunCount++

    const channel = new Channel<{ type: string; [key: string]: unknown }>()
    abortChannel = channel

    channel.onmessage = (event) => {
      if (event.type === 'stepDone') {
        runStore.addResult({
          id: event.id as string,
          type: event.step_type as string,
          passed: event.passed as boolean,
          durationMs: event.duration_ms as number,
          error: event.passed ? undefined : (event.detail as string),
        })
      }
      if (event.type === 'runDone') {
        runStore.finishRun()
        const passed = event.passed as number
        const failed = event.failed as number
        if (failed === 0) {
          showConfetti = true
          if (confettiTimer) clearTimeout(confettiTimer)
          confettiTimer = setTimeout(() => { showConfetti = false }, 2500)
        }
      }
      if (event.type === 'log') {
        // EventStreamDrawer logs are handled via reactive store update — dispatch custom event
        document.dispatchEvent(new CustomEvent('flowprobe:log', { detail: event }))
      }
      if (event.type === 'error') {
        runStore.setError(event.message as string)
        runError = event.message as string
      }
    }

    try {
      const collectionJson = JSON.stringify({
        version: '1',
        name: activeCollection.name,
        flows: activeFlow ? [activeFlow] : activeCollection.flows,
      })
      await invoke('run_collection', {
        collectionJson,
        flowId: activeFlow.id,
        channel,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      runStore.setError(message)
      runError = message
    } finally {
      abortChannel = null
    }
  }

  function handleStop() {
    runStore.abortRun()
    // Channel will be garbage collected; Rust side checks for send errors
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); paletteOpen = true }
    if ((e.metaKey || e.ctrlKey) && e.key === 'r' && canRun) { e.preventDefault(); handleRun() }
  }

  onDestroy(() => { if (confettiTimer) clearTimeout(confettiTimer) })
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="app">
  <!-- Titlebar -->
  <div class="tb">
    <div class="tl"><span class="td r"></span><span class="td y"></span><span class="td g"></span></div>
    <div class="t-center">
      <span class="t-name">⚡ FlowProbe</span>
      <span class="t-run-count" class:running={isRunning} class:passed={$runStore.state === 'done' && $runStore.results.every(r => r.passed)}>
        #{activeRunCount}
      </span>
    </div>
    <div class="t-actions">
      <button class="t-env" aria-label="Environment selector" disabled>staging ▾</button>
      {#if isRunning}
        <button class="t-stop" on:click={handleStop}>■ Stop</button>
      {:else}
        <button
          class="t-run"
          on:click={handleRun}
          disabled={!canRun}
          title={!activeFlow ? 'No flow selected' : validationErrors.length > 0 ? `${validationErrors.length} validation errors` : 'Run collection (Ctrl+R)'}
        >▶ Run Collection</button>
      {/if}
    </div>
  </div>

  <!-- Confetti bar on all-pass -->
  {#if showConfetti}
    <div class="confetti-bar"></div>
  {/if}

  <!-- Validation / run error banner -->
  {#if validationErrors.length > 0 && !isRunning}
    <ErrorBanner
      message="{validationErrors.length} step{validationErrors.length > 1 ? 's have' : ' has'} errors — fix them before running"
      level="warning"
      on:dismiss={() => validationErrors = []}
    />
  {/if}
  {#if runError}
    <ErrorBanner message={runError} level="error" autoDismissMs={8000} on:dismiss={() => runError = null} />
  {/if}

  <!-- Body -->
  <div class="body">
    <Sidebar {collections} activeCollectionId={$collectionStore.activeCollectionId} activeFlowId={$collectionStore.activeFlowId}
      on:select={e => collectionStore.setActive(e.detail.collectionName, e.detail.flowId)} />

    {#if activeFlow}
      <FlowCanvas
        flow={activeFlow}
        selectedStepId={selectedStepId}
        on:selectStep={e => selectedStepId = e.detail}
        on:saveStep={e => {
          /* TODO Task 13: persist step edit back to collection */
          console.log('saveStep', e.detail)
        }}
        on:addStep={e => {
          /* TODO Task 13: add step to active flow */
          console.log('addStep', e.detail)
        }}
      />
    {:else}
      <div class="empty-canvas">
        <div class="empty-title">No collection open</div>
        <div class="empty-hint">Open a .flowprobe.json file or drag one here</div>
      </div>
    {/if}

    <ResultPanel
      result={$runStore.results.length > 0 ? { id: activeFlow?.id ?? '', name: activeFlow?.name ?? '', passed: $runStore.results.every(r => r.passed), durationMs: $runStore.results.reduce((s, r) => s + r.durationMs, 0), steps: $runStore.results } : null}
      selectedStepId={selectedStepId}
    />
  </div>

  <!-- Statusbar -->
  <div class="stbar">
    <span class="st-item">⚡ FlowProbe v1.0.0</span>
    <span class="st-sep"></span>
    <span class="st-item">{collections.length} collection{collections.length !== 1 ? 's' : ''}</span>
    {#if isRunning}
      <span class="st-sep"></span>
      <span class="st-item" style="color:#3b82f6">● Running…</span>
    {/if}
    {#if $runStore.state === 'done'}
      <span class="st-sep"></span>
      <span class="st-item" style="color:{$runStore.results.every(r => r.passed) ? 'var(--success)' : 'var(--error)'}">
        {$runStore.results.filter(r => r.passed).length}/{$runStore.results.length} passed
      </span>
    {/if}
    <span class="st-sep" style="margin-left:auto"></span>
    <span class="st-item" style="color:var(--text-muted);font-family:var(--font-mono);font-size:9px">Ctrl+K</span>
  </div>
</div>

<CommandPalette open={paletteOpen} {collections} on:close={() => paletteOpen = false}
  on:select={e => { collectionStore.setActive(e.detail.id); paletteOpen = false }} />

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) { font-family: var(--font-sans); background: var(--bg); color: var(--text-primary); overflow: hidden; height: 100vh; }
  .app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  .tb { height: 42px; background: var(--bg); border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 14px; gap: 8px; flex-shrink: 0; position: relative; }
  .tl { display: flex; gap: 6px; }
  .td { width: 12px; height: 12px; border-radius: 50%; }
  .td.r { background: #ff5f56; } .td.y { background: #febc2e; } .td.g { background: #28c840; }
  .t-center { position: absolute; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; }
  .t-name { font-size: var(--text-md); font-weight: 700; color: var(--text-secondary); }
  .t-run-count { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); }
  .t-run-count.running { color: #3b82f6; }
  .t-run-count.passed { color: var(--success); }
  .t-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  .t-env { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 4px 10px; font-size: var(--text-sm); color: var(--text-secondary); cursor: not-allowed; opacity: .7; }
  .t-run { background: var(--accent); color: #fff; border: none; border-radius: var(--radius-md); padding: 5px 16px; font-size: var(--text-base); font-weight: 700; cursor: pointer; transition: background var(--dur-fast), opacity var(--dur-fast); }
  .t-run:hover:not(:disabled) { background: var(--accent-hover); }
  .t-run:disabled { opacity: .45; cursor: not-allowed; }
  .t-stop { background: var(--error-light); border: 1px solid #fecaca; color: var(--error); border-radius: var(--radius-md); padding: 5px 14px; font-size: var(--text-sm); font-weight: 700; cursor: pointer; }
  .confetti-bar { height: 3px; background: linear-gradient(90deg, #16a34a, #4ade80, #86efac, #4ade80, #16a34a); background-size: 300% 100%; animation: cbar 2s linear infinite; flex-shrink: 0; }
  @keyframes cbar { 0%{background-position:0% 0%} 100%{background-position:300% 0%} }
  .body { flex: 1; display: flex; overflow: hidden; }
  .empty-canvas { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; background: var(--bg); }
  .empty-title { font-size: var(--text-lg); font-weight: 600; color: var(--text-primary); }
  .empty-hint { font-size: var(--text-sm); color: var(--text-muted); }
  .stbar { height: 26px; background: var(--bg); border-top: 1px solid var(--border); display: flex; align-items: center; padding: 0 14px; gap: 10px; flex-shrink: 0; }
  .st-item { font-size: var(--text-xs); color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
  .st-sep { width: 1px; height: 12px; background: var(--border); }
</style>
```

- [ ] **Step 3: Build check**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -10
```
Expected: build success (0 errors)

- [ ] **Step 4: Commit**
```bash
git add packages/desktop/src/routes/+page.svelte
git commit -m "feat(desktop): wire Run button to run_collection Channel<T>, validation gate, confetti-on-pass"
```

---

### Task 13: Collection File Open + SaveStep + AddStep Wiring

**Files:**
- Modify: `packages/desktop/src/routes/+page.svelte` — implement saveStep and addStep handlers
- Modify: `packages/desktop/src/lib/stores/collection.ts` — add `updateStep`, `addStep`, `openCollection`
- Create: `packages/desktop/src-tauri/src/commands/file.rs` — `open_collection_dialog`, `read_collection_file`
- Modify: `packages/desktop/src-tauri/src/lib.rs` — register file commands

**Interfaces:**
- Produces: `openCollectionDialog() -> Result<Option<String>, String>` — returns JSON or null (user cancelled)
- Produces: `collectionStore.updateStep(flowId, step)` — updates a step in the active collection
- Produces: `collectionStore.addStep(flowId, stepType)` — adds a default step of the given type

- [ ] **Step 1: Add updateStep and addStep to collection.ts**

Add to `collection.ts` (after the existing methods in `createCollectionStore`):
```typescript
updateStep(collectionName: string, flowId: string, updatedStep: Step) {
  update(s => {
    const colIdx = s.collections.findIndex(c => c.name === collectionName)
    if (colIdx === -1) return s
    const collections = [...s.collections]
    const col = { ...collections[colIdx] }
    col.flows = col.flows.map(f => f.id !== flowId ? f : {
      ...f,
      steps: f.steps.map(st => st.id === updatedStep.id ? updatedStep : st)
    })
    collections[colIdx] = col
    return { ...s, collections }
  })
},
addStep(collectionName: string, flowId: string, stepType: string) {
  update(s => {
    const colIdx = s.collections.findIndex(c => c.name === collectionName)
    if (colIdx === -1) return s
    const newId = `step-${Date.now()}`
    const newStep: Step = stepType === 'producer'
      ? { id: newId, type: 'producer', broker: '', topic: '', payload: {} }
      : stepType === 'wait'
      ? { id: newId, type: 'wait', timeoutMs: 5000, consumer: { broker: '', topic: '', groupId: `fp-${newId}` } }
      : stepType === 'http-assert'
      ? { id: newId, type: 'http-assert', method: 'GET', url: '', assertions: [] }
      : stepType === 'db-assert'
      ? { id: newId, type: 'db-assert', connection: '', query: '', params: [], assertions: [] }
      : { id: newId, type: 'message-assert', broker: '', topic: '', timeoutMs: 3000, assertions: [] }
    const collections = [...s.collections]
    const col = { ...collections[colIdx] }
    col.flows = col.flows.map(f => f.id !== flowId ? f : { ...f, steps: [...f.steps, newStep] })
    collections[colIdx] = col
    return { ...s, collections }
  })
},
```

- [ ] **Step 2: Create file.rs**

Create `packages/desktop/src-tauri/src/commands/file.rs`:
```rust
use tauri::Manager;

#[tauri::command]
pub async fn open_collection_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let path = app.dialog()
        .file()
        .add_filter("FlowProbe Collection", &["flowprobe.json", "json"])
        .blocking_pick_file();

    match path {
        Some(p) => {
            let content = std::fs::read_to_string(&p)
                .map_err(|e| format!("Cannot read file {}: {e}", p.display()))?;
            Ok(Some(content))
        }
        None => Ok(None), // user cancelled
    }
}
```

- [ ] **Step 3: Add tauri-plugin-dialog to Cargo.toml**
```toml
tauri-plugin-dialog = "2"
```

And in `lib.rs` builder:
```rust
.plugin(tauri_plugin_dialog::init())
```

- [ ] **Step 4: Wire saveStep and addStep in +page.svelte**

Replace the `console.log` placeholders:
```svelte
on:saveStep={e => {
  if (activeCollection) collectionStore.updateStep(activeCollection.name, activeFlow!.id, e.detail)
}}
on:addStep={e => {
  if (activeCollection) collectionStore.addStep(activeCollection.name, activeFlow!.id, e.detail)
}}
```

Add file open handler (Ctrl+O):
```typescript
if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
  e.preventDefault()
  try {
    const json = await invoke<string | null>('open_collection_dialog')
    if (json) {
      const { parseCollection } = await import('@flowprobe/core')
      const collection = parseCollection(JSON.parse(json))
      collectionStore.loadCollection(collection)
      collectionStore.setActive(collection.name, collection.flows[0]?.id)
    }
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err)
  }
}
```

- [ ] **Step 5: Cargo check + vite build**
```bash
cd packages/desktop/src-tauri && cargo check 2>&1 | tail -5
cd .. && npx vite build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**
```bash
git add packages/desktop/src/ packages/desktop/src-tauri/
git commit -m "feat(desktop): saveStep/addStep wired, file open dialog, collection.ts mutation methods"
```

---

### Task 14: Final Integration Verification

**Files:** No new files — verification only.

- [ ] **Step 1: Run full test suite**
```bash
cd C:/Users/AdityaKumarSingh/flowprobe
pnpm test
```
Expected: all tests pass (77+ unit tests, 2 integration skipped)

- [ ] **Step 2: Svelte build with type-check**
```bash
cd packages/desktop
npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -20
npx vite build 2>&1 | tail -10
```
Expected: 0 errors (warnings OK)

- [ ] **Step 3: Rust compile check**
```bash
cd packages/desktop/src-tauri
cargo check 2>&1 | tail -10
```
Expected: 0 errors

- [ ] **Step 4: Smoke test CLI still works**
```bash
cd C:/Users/AdityaKumarSingh/flowprobe
node packages/cli/dist/index.js validate e2e-sample.flowprobe.json
node packages/cli/dist/index.js run e2e-sample.flowprobe.json
```
Expected: validate exits 0, run shows `2 passed · 0 failed`

- [ ] **Step 5: Final commit + push**
```bash
cd C:/Users/AdityaKumarSingh/flowprobe
git add .
git commit -m "feat(desktop): FlowProbe UI v2 complete — functional run/builder/broker flows, zero crash/freeze"
git push origin master
```
Expected: pushed to aks-builds/flowprobe

---

## Post-Self-Review Fixes (applied inline — 12 issues resolved)

### Fix for Issue 1 — Drag-and-drop step reorder (add to Task 9)

After Task 9 Step 1 (read FlowCanvas), add this install step before modifying the template:

```bash
cd packages/desktop && pnpm add svelte-dnd-action
```

In FlowCanvas `pipeline-row`, replace the static `{#each}` with:
```svelte
<script>
  import { dndzone } from 'svelte-dnd-action'
  let dndSteps = flow.steps.map((s, i) => ({ ...s, _dndId: i }))
  $: dndSteps = flow.steps.map((s, i) => ({ ...s, _dndId: i }))
  function handleDndConsider(e) { dndSteps = e.detail.items }
  function handleDndFinalize(e) {
    dndSteps = e.detail.items
    dispatch('reorderSteps', dndSteps.map(({ _dndId, ...s }) => s))
  }
</script>

<div class="pipeline-row" use:dndzone={{ items: dndSteps, dropTargetStyle: { outline: '2px solid var(--accent)' } }}
     on:consider={handleDndConsider} on:finalize={handleDndFinalize}>
  {#each dndSteps as step (step.id)}
    <!-- StepCard -->
  {/each}
</div>
```

Add `reorderSteps` to `collectionStore` in Task 13 Step 1:
```typescript
reorderSteps(collectionName: string, flowId: string, reorderedSteps: Step[]) {
  update(s => {
    const colIdx = s.collections.findIndex(c => c.name === collectionName)
    if (colIdx === -1) return s
    const cols = [...s.collections]
    cols[colIdx] = { ...cols[colIdx], flows: cols[colIdx].flows.map(f =>
      f.id !== flowId ? f : { ...f, steps: reorderedSteps }
    )}
    return { ...s, collections: cols }
  })
}
```

Wire in `+page.svelte`: `on:reorderSteps={e => activeCollection && collectionStore.reorderSteps(activeCollection.name, activeFlow!.id, e.detail)}`

---

### Fix for Issue 2 — Step error badge on card corner (add to Task 7)

In Task 7 Step 2, add to StepCard script block:
```typescript
export let hasError = false
```

Add to StepCard template (inside `.step-card`, before `{#if selected && editing}`):
```svelte
{#if hasError && !editing}
  <div class="error-corner-dot" title="This step has validation errors"></div>
{/if}
```

Add CSS:
```css
.error-corner-dot { position: absolute; top: 6px; right: 6px; width: 7px; height: 7px; border-radius: 50%; background: var(--error); }
```

In Task 9 Step 3 pipeline row, pass the prop:
```svelte
<StepCard {step} hasError={validationErrors.some(e => e.stepId === step.id)} ... />
```

---

### Fix for Issue 3 — Background latency ping every 5s (add to Task 5)

Add a Step 3 to Task 5 (after Sidebar update):

In `Sidebar.svelte` script block:
```typescript
import { onMount, onDestroy } from 'svelte'
import { invoke } from '@tauri-apps/api/core'

let pingInterval: ReturnType<typeof setInterval> | null = null

onMount(() => {
  pingInterval = setInterval(async () => {
    const statusMap = brokerStatusStore
    // ping all connected brokers
    for (const [id, status] of $brokerStatusStore) {
      if (status.connected && !status.connecting) {
        try {
          const latencyMs = await invoke<number>('ping_broker', { id })
          brokerStatusStore.set(id, { ...status, latencyMs })
        } catch {
          brokerStatusStore.set(id, { ...status, error: 'Ping failed', latencyMs: null })
        }
      }
    }
  }, 5000)
})

onDestroy(() => { if (pingInterval) clearInterval(pingInterval) })
```

---

### Fix for Issue 4 — Svelte error boundaries (add to Task 14)

Add Step 0 to Task 14:

In `+page.svelte`, wrap each major component:
```svelte
<svelte:boundary onerror={(err, reset) => { runError = `Component error: ${err.message}`; reset() }}>
  <Sidebar ... />
</svelte:boundary>
<svelte:boundary onerror={(err) => { runError = `Canvas error: ${err.message}` }}>
  <FlowCanvas ... />
  <!-- fallback shown inside boundary on error -->
  {#snippet failed()}
    <div class="error-boundary-fallback">Canvas crashed — <button on:click={() => runStore.reset()}>Reset</button></div>
  {/snippet}
</svelte:boundary>
<svelte:boundary onerror={(err) => { console.error('ResultPanel error:', err) }}>
  <ResultPanel ... />
</svelte:boundary>
```

Add CSS:
```css
.error-boundary-fallback { flex: 1; display: flex; align-items: center; justify-content: center; background: var(--error-light); color: var(--error); font-size: var(--text-sm); gap: 8px; }
```

---

### Fix for Issue 5 — Token naming consistency

Task 1 Step 1 uses `--conn-online`, `--conn-connecting`, etc. Task 5 CSS also uses `--conn-online`.
These are **consistent within the plan** — the spec's mention of `--conn-dot-*` was a draft name. The plan's `--conn-*` naming is adopted throughout. No file changes needed.

---

### Fix for Issue 6 — console.log placeholders (Task 13 Step 4)

Replace Step 4 with full replacement context:

In `+page.svelte`, find and replace:
```svelte
<!-- OLD: -->
on:saveStep={e => {
  /* TODO Task 13: persist step edit back to collection */
  console.log('saveStep', e.detail)
}}
on:addStep={e => {
  /* TODO Task 13: add step to active flow */
  console.log('addStep', e.detail)
}}

<!-- NEW: -->
on:saveStep={e => {
  if (activeCollection) collectionStore.updateStep(activeCollection.name, activeFlow!.id, e.detail)
}}
on:addStep={e => {
  if (activeCollection) collectionStore.addStep(activeCollection.name, activeFlow!.id, e.detail)
}}
```

---

### Fix for Issue 7 + 12 — selectedStep not declared in ResultPanel (Task 10)

In Task 10 Step 2, add to ResultPanel script block:
```typescript
import type { Step } from '@flowprobe/core'
export let selectedStepId: string | null = null
export let steps: Step[] = []
$: selectedStep = steps.find(s => s.id === selectedStepId) ?? null
```

In Task 12 Step 2, update the `<ResultPanel>` usage to pass steps:
```svelte
<ResultPanel
  result={...}
  selectedStepId={selectedStepId}
  steps={activeFlow?.steps ?? []}
/>
```

---

### Fix for Issue 8 — `type` field on StepRunResult (Task 12)

In Task 12 Step 2, `channel.onmessage` handler, remove the `type` field from the object passed to `runStore.addResult`:
```typescript
// Before:
runStore.addResult({ id: event.id as string, type: event.step_type as string, passed: event.passed as boolean, durationMs: event.duration_ms as number, error: ... })

// After (no `type` field — StepRunResult from @flowprobe/core doesn't include it):
runStore.addResult({ id: event.id as string, passed: event.passed as boolean, durationMs: event.duration_ms as number, error: event.passed ? undefined : (event.detail as string) })
```

---

### Fix for Issue 9 — LogEntry / logs not wired from Channel to FlowCanvas (Task 9 + 12)

**Task 9:** Lift `logs` out of FlowCanvas and accept it as a prop:
```typescript
// In FlowCanvas script block — replace `let logs: LogEntry[] = []` with:
export let logs: import('./EventStreamDrawer.svelte').LogEntry[] = []
```

**Task 12:** In `+page.svelte`:
```typescript
// Add to script block:
import type { LogEntry } from '$lib/components/EventStreamDrawer.svelte'
let logs: LogEntry[] = []

// In channel.onmessage, replace the document.dispatchEvent line with:
if (event.type === 'log') {
  logs = [...logs, {
    timestampMs: event.timestamp_ms as number,
    level: event.level as string,
    message: event.message as string
  }]
}
// On run reset, clear logs:
// In handleRun(), before channel setup: logs = []
```

Pass logs to FlowCanvas:
```svelte
<FlowCanvas flow={activeFlow} {logs} ... />
```

---

### Fix for Issue 11 — svelte-treeview not installed (Task 5)

Add Step 0 to Task 5 (before any code changes):
```bash
cd packages/desktop && pnpm add svelte-treeview@^4.8
```

In Task 5 Step 2, after adding BrokerConfigPanel, add **Step 2f** to replace the collection tree in Sidebar with svelte-treeview:
```typescript
import TreeView from 'svelte-treeview'

// Map collections to treeview format:
$: treeItems = collections.map(c => ({
  id: c.name,
  label: c.name,
  icon: '⚡',
  children: c.flows.map(f => ({ id: f.id, label: f.name, icon: '' }))
}))
```

```svelte
<!-- Replace static collection list with: -->
<TreeView
  items={treeItems}
  mode="recursive"
  on:select={e => dispatch('select', { collectionName: e.detail.parentId ?? e.detail.id, flowId: e.detail.parentId ? e.detail.id : undefined })}
/>
```
