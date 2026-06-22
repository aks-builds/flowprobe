# FlowProbe v2 SP2: UI Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tabbed workspace (multiple open flows), a fully swappable sidebar panel system (Collections / Environments / History / Settings driven by the nav tab), and a dark/light theme toggle persisted to disk.

**Architecture:** A `workspaceStore` tracks open flow tabs and the active one. The sidebar renders a different panel component per `navStore` value. Theme is a CSS `data-theme` attribute on `<html>`, toggled by a `themeStore` that persists to `localStorage` (desktop) or Tauri's app config dir.

**Tech Stack:** Tauri 2.0, Svelte 5, TypeScript, CSS custom properties

## Global Constraints

- Svelte 5 runes (`$state`, `$derived`, `$props`) — no `$:` reactive in new code
- No hardcoded animation durations — CSS tokens only
- No `Co-Authored-By: Claude` in any commit
- SP1 (Brand & App Shell) must be merged before this plan executes

---

## File Map

```
packages/desktop/src/lib/
├── stores/
│   ├── workspace.ts               CREATE — open tabs, activeTabId
│   └── theme.ts                   CREATE — dark|light, persisted
├── components/
│   ├── sidebar/
│   │   ├── Sidebar.svelte         MODIFY — replace content with panel switcher
│   │   ├── CollectionsPanel.svelte  EXTRACT from existing Sidebar content
│   │   ├── EnvironmentsPanel.svelte CREATE — env list + active badge
│   │   ├── HistoryPanel.svelte      CREATE — run history list (stub, wired in SP5)
│   │   └── SettingsPanel.svelte     CREATE — theme toggle + keyboard shortcuts
│   └── WorkspaceTabs.svelte       CREATE — tab bar above canvas
└── design/
    └── tokens.css                 MODIFY — add light theme vars under [data-theme="light"]
```

---

### Task 1: Theme store + CSS light-mode tokens

**Files:**
- Create: `packages/desktop/src/lib/stores/theme.ts`
- Create: `packages/desktop/src/lib/stores/theme.test.ts`
- Modify: `packages/desktop/src/lib/design/tokens.css`

**Interfaces:**
- Produces: `themeStore` — `'dark' | 'light'`, read/write, auto-applies `data-theme` to `<html>`
- Produces: `type Theme = 'dark' | 'light'`

- [ ] **Step 1: Write failing tests**

Create `packages/desktop/src/lib/stores/theme.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { get } from 'svelte/store'

// Mock localStorage
const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
})
// Mock document
vi.stubGlobal('document', { documentElement: { setAttribute: vi.fn() } })

describe('themeStore', () => {
  beforeEach(() => { delete store['flowprobe:theme'] })

  it('defaults to dark', async () => {
    const { themeStore } = await import('./theme.js')
    expect(get(themeStore)).toBe('dark')
  })

  it('persists to localStorage on set', async () => {
    const { themeStore } = await import('./theme.js')
    themeStore.set('light')
    expect(store['flowprobe:theme']).toBe('light')
  })
})
```

- [ ] **Step 2: Run — confirm FAIL**
```bash
cd packages/desktop && npx vitest run src/lib/stores/theme.test.ts 2>&1 | tail -5
```
Expected: `Cannot find module './theme.js'`

- [ ] **Step 3: Implement theme.ts**

Create `packages/desktop/src/lib/stores/theme.ts`:
```typescript
import { writable } from 'svelte/store'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'flowprobe:theme'

function getInitial(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* SSR / unavailable */ }
  return 'dark'
}

function applyTheme(t: Theme) {
  try { document.documentElement.setAttribute('data-theme', t) } catch { /* SSR */ }
}

function createThemeStore() {
  const initial = getInitial()
  applyTheme(initial)
  const { subscribe, set } = writable<Theme>(initial)
  return {
    subscribe,
    set(t: Theme) {
      applyTheme(t)
      try { localStorage.setItem(STORAGE_KEY, t) } catch { /* unavailable */ }
      set(t)
    },
    toggle() {
      subscribe(current => this.set(current === 'dark' ? 'light' : 'dark'))()
    },
  }
}

export const themeStore = createThemeStore()
```

- [ ] **Step 4: Run — confirm PASS**
```bash
cd packages/desktop && npx vitest run src/lib/stores/theme.test.ts 2>&1 | tail -5
```
Expected: `2 passed`

- [ ] **Step 5: Add light-theme tokens to tokens.css**

Read `packages/desktop/src/lib/design/tokens.css`. Append at the bottom:

```css
/* ─── Light theme overrides ─── */
[data-theme="light"] {
  --bg:           #f4f6fb;
  --surface:      #ffffff;
  --surface2:     #f8f9fc;
  --border:       #e8eaf0;
  --border2:      #dde1ea;
  --text-primary: #1e293b;
  --text-secondary:#475569;
  --text-muted:   #94a3b8;
  --sidebar-bg:   #f1f5f9;
  --titlebar-bg:  #ffffff;
  --accent:       #4f46e5;
  --accent-hover: #4338ca;
  --conn-online:  #16a34a;
  --conn-connecting:#d97706;
  --conn-error:   #dc2626;
  --conn-offline: #94a3b8;
}
```

- [ ] **Step 6: Build + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/stores/theme.ts packages/desktop/src/lib/stores/theme.test.ts packages/desktop/src/lib/design/tokens.css
git commit -m "feat(desktop): themeStore + light-mode CSS tokens"
```

---

### Task 2: Workspace store (open flow tabs)

**Files:**
- Create: `packages/desktop/src/lib/stores/workspace.ts`
- Create: `packages/desktop/src/lib/stores/workspace.test.ts`

**Interfaces:**
- Produces: `type WorkspaceTab = { id: string; collectionName: string; flowId: string; dirty: boolean }`
- Produces: `workspaceStore` with methods: `openFlow(collectionName, flowId)`, `closeTab(id)`, `setActive(id)`, `markDirty(id)`, `markClean(id)`
- Produces: `workspaceStore.activeTab` — derived, returns `WorkspaceTab | null`

- [ ] **Step 1: Write failing tests**

Create `packages/desktop/src/lib/stores/workspace.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { get } from 'svelte/store'
import { workspaceStore } from './workspace.js'

describe('workspaceStore', () => {
  it('starts empty', () => {
    expect(get(workspaceStore).tabs).toHaveLength(0)
    expect(get(workspaceStore).activeId).toBeNull()
  })

  it('opens a tab and sets it active', () => {
    workspaceStore.openFlow('E2E Sample', 'flow-1')
    const s = get(workspaceStore)
    expect(s.tabs).toHaveLength(1)
    expect(s.tabs[0].flowId).toBe('flow-1')
    expect(s.activeId).toBe(s.tabs[0].id)
  })

  it('opening same flow again focuses existing tab, not duplicate', () => {
    workspaceStore.openFlow('E2E Sample', 'flow-1')
    expect(get(workspaceStore).tabs).toHaveLength(1)
  })

  it('closes a tab', () => {
    const tabId = get(workspaceStore).tabs[0].id
    workspaceStore.closeTab(tabId)
    expect(get(workspaceStore).tabs).toHaveLength(0)
    expect(get(workspaceStore).activeId).toBeNull()
  })

  it('marks tab dirty', () => {
    workspaceStore.openFlow('E2E Sample', 'flow-2')
    const tabId = get(workspaceStore).tabs[0].id
    workspaceStore.markDirty(tabId)
    expect(get(workspaceStore).tabs[0].dirty).toBe(true)
    workspaceStore.markClean(tabId)
    expect(get(workspaceStore).tabs[0].dirty).toBe(false)
  })
})
```

- [ ] **Step 2: Run — confirm FAIL**
```bash
cd packages/desktop && npx vitest run src/lib/stores/workspace.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implement workspace.ts**

Create `packages/desktop/src/lib/stores/workspace.ts`:
```typescript
import { writable, derived } from 'svelte/store'

export type WorkspaceTab = {
  id: string
  collectionName: string
  flowId: string
  dirty: boolean
}

type WorkspaceState = {
  tabs: WorkspaceTab[]
  activeId: string | null
}

function createWorkspaceStore() {
  const { subscribe, update } = writable<WorkspaceState>({ tabs: [], activeId: null })

  return {
    subscribe,
    openFlow(collectionName: string, flowId: string) {
      update(s => {
        const existing = s.tabs.find(t => t.collectionName === collectionName && t.flowId === flowId)
        if (existing) return { ...s, activeId: existing.id }
        const id = `tab-${collectionName}-${flowId}-${Date.now()}`
        const tab: WorkspaceTab = { id, collectionName, flowId, dirty: false }
        return { tabs: [...s.tabs, tab], activeId: id }
      })
    },
    closeTab(id: string) {
      update(s => {
        const remaining = s.tabs.filter(t => t.id !== id)
        const activeId = s.activeId === id
          ? (remaining.at(-1)?.id ?? null)
          : s.activeId
        return { tabs: remaining, activeId }
      })
    },
    setActive(id: string) {
      update(s => ({ ...s, activeId: id }))
    },
    markDirty(id: string) {
      update(s => ({ ...s, tabs: s.tabs.map(t => t.id === id ? { ...t, dirty: true } : t) }))
    },
    markClean(id: string) {
      update(s => ({ ...s, tabs: s.tabs.map(t => t.id === id ? { ...t, dirty: false } : t) }))
    },
  }
}

export const workspaceStore = createWorkspaceStore()
export const activeTab = derived(workspaceStore, s => s.tabs.find(t => t.id === s.activeId) ?? null)
```

- [ ] **Step 4: Run — confirm PASS**
```bash
cd packages/desktop && npx vitest run src/lib/stores/workspace.test.ts 2>&1 | tail -5
```
Expected: `5 passed`

- [ ] **Step 5: Commit**
```bash
git add packages/desktop/src/lib/stores/workspace.ts packages/desktop/src/lib/stores/workspace.test.ts
git commit -m "feat(desktop): workspaceStore — tabbed flow workspace"
```

---

### Task 3: WorkspaceTabs component

**Files:**
- Create: `packages/desktop/src/lib/components/WorkspaceTabs.svelte`

**Interfaces:**
- Consumes: `workspaceStore`, `activeTab` from `../stores/workspace.js`
- Consumes: `collectionStore` from `../stores/collection.js` — to look up flow names
- Produces: `<WorkspaceTabs />` — 33px tab bar, Ctrl+W closes active tab, Ctrl+T dispatches `openNew`

- [ ] **Step 1: Create WorkspaceTabs.svelte**

Create `packages/desktop/src/lib/components/WorkspaceTabs.svelte`:

```svelte
<script lang="ts">
  import { workspaceStore, activeTab } from '../stores/workspace.js'
  import { collectionStore } from '../stores/collection.js'

  function getFlowName(collectionName: string, flowId: string): string {
    const col = $collectionStore.collections.find(c => c.name === collectionName)
    return col?.flows.find(f => f.id === flowId)?.name ?? flowId
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'w' && $activeTab) {
      e.preventDefault()
      workspaceStore.closeTab($activeTab.id)
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $workspaceStore.tabs.length > 0}
  <div class="tab-bar" role="tablist" aria-label="Open flows">
    {#each $workspaceStore.tabs as tab (tab.id)}
      <button
        class="flow-tab"
        class:active={tab.id === $workspaceStore.activeId}
        role="tab"
        aria-selected={tab.id === $workspaceStore.activeId}
        onclick={() => workspaceStore.setActive(tab.id)}
      >
        <span
          class="tab-dot"
          class:dirty={tab.dirty}
          aria-hidden="true"
        ></span>
        <span class="tab-name">{getFlowName(tab.collectionName, tab.flowId)}</span>
        <button
          class="tab-close"
          aria-label="Close tab"
          onclick|stopPropagation={() => workspaceStore.closeTab(tab.id)}
        >✕</button>
      </button>
    {/each}
  </div>
{/if}

<style>
  .tab-bar {
    height: 33px;
    background: #040408;
    border-bottom: 1px solid var(--border, #161628);
    display: flex;
    align-items: flex-end;
    padding: 0 9px;
    gap: 2px;
    flex-shrink: 0;
    overflow-x: auto;
  }
  .tab-bar::-webkit-scrollbar { display: none; }

  .flow-tab {
    height: 27px;
    padding: 0 10px;
    border-radius: 5px 5px 0 0;
    font-size: 10.5px;
    color: var(--text-muted, #334155);
    background: none;
    border: 1px solid transparent;
    border-bottom: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    flex-shrink: 0;
    transition: color var(--dur-fast, 150ms);
  }
  .flow-tab.active {
    background: var(--surface2, #111120);
    color: #c4b5fd;
    border-color: var(--border2, #1e1e32);
  }

  .tab-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent, #6366f1);
    flex-shrink: 0;
  }
  .tab-dot.dirty { background: var(--warn, #f59e0b); }

  .tab-name { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }

  .tab-close {
    font-size: 9px;
    color: var(--text-muted, #334155);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 2px;
    margin-left: 2px;
    border-radius: 3px;
    transition: color var(--dur-fast, 150ms), background var(--dur-fast, 150ms);
  }
  .tab-close:hover { color: var(--text-secondary, #475569); background: rgba(255,255,255,.06); }

  @media (prefers-reduced-motion: reduce) {
    .flow-tab, .tab-close { transition: none; }
  }
</style>
```

- [ ] **Step 2: Build check + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/components/WorkspaceTabs.svelte
git commit -m "feat(desktop): WorkspaceTabs — multi-flow tabbed workspace with Ctrl+W close"
```

---

### Task 4: Sidebar panel switcher + panel components

**Files:**
- Modify: `packages/desktop/src/lib/components/Sidebar.svelte`
- Create: `packages/desktop/src/lib/components/sidebar/CollectionsPanel.svelte`
- Create: `packages/desktop/src/lib/components/sidebar/SettingsPanel.svelte`
- Create: `packages/desktop/src/lib/components/sidebar/HistoryPanel.svelte` (stub)
- Create: `packages/desktop/src/lib/components/sidebar/EnvironmentsPanel.svelte` (stub — wired fully in SP5)

**Interfaces:**
- Consumes: `navStore` from `../stores/nav.js` — determines which panel to render
- Consumes: existing Sidebar content (collection tree, broker dots) → moves into `CollectionsPanel`

- [ ] **Step 1: Read current Sidebar.svelte**

Read the full file before making changes.

- [ ] **Step 2: Create CollectionsPanel.svelte**

Create `packages/desktop/src/lib/components/sidebar/CollectionsPanel.svelte` — move all the collection tree HTML, broker dots, and related script logic from the existing `Sidebar.svelte` into this file. Keep the same props interface (`collections`, `activeCollectionId`, `activeFlowId`, `on:select`).

- [ ] **Step 3: Create SettingsPanel.svelte**

Create `packages/desktop/src/lib/components/sidebar/SettingsPanel.svelte`:

```svelte
<script lang="ts">
  import { themeStore } from '../../stores/theme.js'
</script>

<div class="settings-panel">
  <div class="sp-section">
    <div class="sp-title">Appearance</div>
    <div class="sp-row">
      <span class="sp-label">Theme</span>
      <button
        class="theme-toggle"
        onclick={() => themeStore.toggle()}
        aria-label="Toggle dark/light theme"
      >
        {$themeStore === 'dark' ? '🌙 Dark' : '☀️ Light'}
      </button>
    </div>
  </div>

  <div class="sp-section">
    <div class="sp-title">Keyboard Shortcuts</div>
    {#each [
      { key: 'Ctrl+K', desc: 'Command palette' },
      { key: 'Ctrl+R', desc: 'Run collection' },
      { key: 'Ctrl+O', desc: 'Open file' },
      { key: 'Ctrl+T', desc: 'New tab' },
      { key: 'Ctrl+W', desc: 'Close tab' },
    ] as sh}
      <div class="sp-shortcut">
        <kbd class="sp-key">{sh.key}</kbd>
        <span class="sp-desc">{sh.desc}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .settings-panel { padding: 10px 10px; }
  .sp-section { margin-bottom: 16px; }
  .sp-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--text-muted, #334155); padding: 0 4px 6px; }
  .sp-row { display: flex; align-items: center; justify-content: space-between; padding: 4px; }
  .sp-label { font-size: 11px; color: var(--text-secondary, #475569); }
  .theme-toggle { padding: 4px 10px; border-radius: 7px; font-size: 10.5px; background: var(--surface2, #111120); border: 1px solid var(--border2, #1e1e32); color: var(--text-secondary, #475569); cursor: pointer; }
  .theme-toggle:hover { border-color: var(--accent, #6366f1); color: var(--text-primary, #e2e8f0); }
  .sp-shortcut { display: flex; align-items: center; gap: 8px; padding: 3px 4px; }
  .sp-key { font-family: var(--font-mono, monospace); font-size: 9px; background: var(--surface2, #111120); border: 1px solid var(--border2, #1e1e32); padding: 2px 5px; border-radius: 4px; color: var(--text-secondary, #475569); }
  .sp-desc { font-size: 10px; color: var(--text-muted, #334155); }
</style>
```

- [ ] **Step 4: Create stub panels (Environments + History)**

Create `packages/desktop/src/lib/components/sidebar/EnvironmentsPanel.svelte`:
```svelte
<!-- Stub: wired fully in SP5 -->
<div style="padding:12px;font-size:11px;color:var(--text-muted)">
  Environments — coming in SP5
</div>
```

Create `packages/desktop/src/lib/components/sidebar/HistoryPanel.svelte`:
```svelte
<!-- Stub: wired fully in SP5 -->
<div style="padding:12px;font-size:11px;color:var(--text-muted)">
  Run history — coming in SP5
</div>
```

- [ ] **Step 5: Refactor Sidebar.svelte to use panel switcher**

Replace the content area of `Sidebar.svelte` with a dynamic panel switcher. The script block adds:
```typescript
import { navStore } from '../stores/nav.js'
import CollectionsPanel from './sidebar/CollectionsPanel.svelte'
import EnvironmentsPanel from './sidebar/EnvironmentsPanel.svelte'
import HistoryPanel from './sidebar/HistoryPanel.svelte'
import SettingsPanel from './sidebar/SettingsPanel.svelte'
```

The template renders:
```svelte
<div class="sidebar">
  {#if $navStore === 'collections'}
    <CollectionsPanel {collections} {activeCollectionId} {activeFlowId} on:select />
  {:else if $navStore === 'environments'}
    <EnvironmentsPanel />
  {:else if $navStore === 'history'}
    <HistoryPanel />
  {:else if $navStore === 'settings'}
    <SettingsPanel />
  {/if}
</div>
```

- [ ] **Step 6: Wire WorkspaceTabs into +page.svelte**

Read `packages/desktop/src/routes/+page.svelte`. Add `WorkspaceTabs` above the existing canvas/body content:
```svelte
import WorkspaceTabs from '$lib/components/WorkspaceTabs.svelte'
```
Place `<WorkspaceTabs />` between the sidebar and canvas area.

- [ ] **Step 7: Build check + svelte-check**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
cd packages/desktop && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -10
```
Expected: 0 errors

- [ ] **Step 8: Full test suite**
```bash
cd C:/Users/AdityaKumarSingh/flowprobe && pnpm test 2>&1 | tail -10
```
Expected: all passing

- [ ] **Step 9: Commit**
```bash
git add packages/desktop/src/lib/components/ packages/desktop/src/routes/+page.svelte
git commit -m "feat(desktop): sidebar panel switcher, WorkspaceTabs, theme toggle, settings panel"
```
